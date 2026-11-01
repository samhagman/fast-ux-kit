// Host seams (SEAMS.md): each extension point is exercised the way a host app would plug in,
// and each test proves the outliner calls the hook (or honours the policy) at the right moment.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let core, seams;
before(async () => {
  core = await load("@fux/core");
  seams = await load("/src/registry/outliner/seams.ts");
});
after(() => stopVite());

const doc = () => [
  { id: "a", text: "Alpha", data: { note: "first" } },
  { id: "b", text: "Beta", children: [{ id: "b1", text: "Inside" }] },
];
const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;

/* ── Sharing and permissions ── */

test("sharing & permissions: readOnly and isLocked refuse edits (with a notice); linkFor names share links", async () => {
  const ro = await mountOutliner({ defaultValue: doc(), readOnly: true });
  assert.equal(ro.handle.current.replace([{ id: "z", text: "Z" }]), false, "a read-only outline refuses a replace");
  await ro.act(() => ro.ol().commands.toggleComplete(["a"]));
  assert.equal(find(ro.value(), "a").data?.completed, undefined);
  assert.equal(ro.ol().state.refusal, "read-only", "refused, and the refusal surfaces as a toast");
  await ro.unmount();
  const locked = await mountOutliner({ defaultValue: doc(), isLocked: (node) => node.id === "b" });
  await locked.act(() => locked.ol().dispatch({ type: "text", id: "b1", text: "changed" }));
  assert.equal(find(locked.value(), "b1").text, "Inside", "inside a locked item");
  await locked.unmount();
  const written = [];
  Object.defineProperty(window.navigator, "clipboard", { value: { writeText: async (text) => written.push(text) }, configurable: true });
  const calls = [];
  const shared = await mountOutliner({ defaultValue: doc(), linkFor: (id) => (calls.push(id), `https://share.test/${id}`) });
  await shared.act(() => shared.ui().copyLink("b1"));
  await waitFor(() => written.length);
  assert.deepEqual(calls, ["b1"]);
  assert.equal(written[0], "https://share.test/b1");
  await shared.unmount();
});

/* ── Offline sync ── */

test("offline sync: every change is proposed with its reason and action; a late reject rolls it back; remote merges are one step", async () => {
  const proposals = [];
  let value = doc();
  const ui = await mountOutliner({ value, onValueChange: (nodes, meta) => proposals.push({ nodes, meta }) });
  await ui.act(() => ui.ol().dispatch({ type: "text", id: "a", text: "Alpha 2" }));
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].meta.reason, "edit");
  assert.equal(proposals[0].meta.action, "text");
  assert.equal(find(ui.value(), "a").text, "Alpha 2", "optimistic while the host syncs");
  await ui.act(() => proposals[0].meta.reject());
  assert.equal(find(ui.value(), "a").text, "Alpha", "the server said no: rolled back");
  // A remote change arrives as a new `value`: shown as the document, the outline keeps working.
  value = [{ ...doc()[0], text: "Remote" }, doc()[1]];
  await ui.rerender({ value, onValueChange: (nodes, meta) => proposals.push({ nodes, meta }) });
  assert.equal(find(ui.value(), "a").text, "Remote");
  await ui.unmount();
  const own = await mountOutliner({ defaultValue: doc() });
  const before = own.ol().state.history.past.length;
  let merged;
  await own.act(() => (merged = own.handle.current.replace([{ id: "m", text: "Merged" }])));
  assert.equal(merged, true);
  assert.equal(own.ol().state.history.past.length, before + 1, "a merge from elsewhere is ONE undo step");
  await own.act(() => own.handle.current.undo());
  assert.equal(find(own.value(), "a").text, "Alpha");
  await own.unmount();
});

/* ── Remote version history ── */

test("version history: onHistory adds 'Version history…' to ⌘K; it calls the host; a restore is one undo step", async () => {
  let opened = 0;
  const ui = await mountOutliner({ defaultValue: doc(), onHistory: () => opened++ });
  await ui.act(() => ui.ui().setPaletteOpen(true));
  const item = [...document.querySelectorAll("[cmdk-item]")].find((el) => /Version history/.test(el.textContent));
  assert.ok(item, "offered in the palette");
  await ui.click(item);
  assert.equal(opened, 1, "the host's history UI opens");
  assert.equal(ui.handle.current.replace([{ id: "v1", text: "Restored" }]), true);
  assert.deepEqual(ui.value().map((n) => n.id), ["v1"]);
  await ui.act(() => ui.handle.current.undo());
  assert.deepEqual(ui.value().map((n) => n.id), ["a", "b"], "undo brings the document back");
  await ui.unmount();
  const plain = await mountOutliner({ defaultValue: doc() });
  await plain.act(() => plain.ui().setPaletteOpen(true));
  assert.equal([...document.querySelectorAll("[cmdk-item]")].some((el) => /Version history/.test(el.textContent)), false, "no host, no entry");
  await plain.unmount();
});

/* ── File attachments ── */

test("attachments: files pasted into an item go to onAttach; what it stored is added to the note (one step); unsafe hrefs dropped", async () => {
  const calls = [];
  const ui = await mountOutliner({
    defaultValue: doc(),
    onAttach: async (files, target) => {
      calls.push({ names: files.map((f) => f.name), target });
      return [
        { name: "diagram.png", href: "https://files.test/diagram.png", kind: "image" },
        { name: "spec.pdf", href: "/files/spec.pdf" },
        { name: "bad", href: "javascript:alert(1)" },
      ];
    },
  });
  await ui.edit("a");
  const before = ui.ol().state.history.past.length;
  await ui.act(async () => {
    const paste = new window.Event("paste", { bubbles: true, cancelable: true });
    paste.clipboardData = { getData: () => "", types: ["Files"], files: [new window.File(["x"], "diagram.png", { type: "image/png" }), new window.File(["y"], "spec.pdf")] };
    ui.field().dispatchEvent(paste);
  });
  await waitFor(() => find(ui.value(), "a").data.note !== "first");
  assert.deepEqual(calls, [{ names: ["diagram.png", "spec.pdf"], target: { itemId: "a", field: "title" } }]);
  assert.equal(find(ui.value(), "a").data.note, "first\n![diagram.png](https://files.test/diagram.png)\n[spec.pdf](/files/spec.pdf)");
  assert.equal(ui.ol().state.history.past.length, before + 1, "one undo step");
  assert.equal(seams.safeAttachmentHref("data:text/html,x"), false);
  assert.equal(seams.safeAttachmentHref("//evil.test/x"), false);
  await ui.unmount();
});

/* ── Integrations ── */

test("integrations: host item commands appear in the item menu / phone sheet and run with the item ids; palette groups; insert and export", async () => {
  const ran = [];
  const ui = await mountOutliner({
    defaultValue: doc(),
    itemCommands: (ids) => [{ id: "calendar", label: `Add ${ids.length} to calendar`, run: (targets) => ran.push(["calendar", targets]) }],
    paletteGroups: [{ heading: "Mail", commands: [{ id: "mail", label: "Email this outline", run: () => ran.push(["mail"]) }] }],
  });
  await ui.act(() => ui.ui().setSheet({ rowId: "b", ids: ["b", "a"] }));
  const entry = await waitFor(() => [...document.querySelectorAll("[data-outliner-sheet] [role=menuitem]")].find((el) => /Add 2 to calendar/.test(el.textContent)));
  await ui.click(entry);
  await waitFor(() => ran.length);
  assert.deepEqual(ran[0], ["calendar", ["b", "a"]]);
  await ui.act(() => ui.ui().setPaletteOpen(true));
  await ui.click([...document.querySelectorAll("[cmdk-item]")].find((el) => /Email this outline/.test(el.textContent)));
  assert.deepEqual(ran[1], ["mail"]);
  const inserted = ui.handle.current.insertItems([{ id: "clip", text: "Clipped from the web" }]);
  assert.deepEqual(inserted, ["clip"], "a web clipper / API adds items");
  assert.match(ui.handle.current.exportAs("markdown"), /Clipped from the web/);
  await ui.unmount();
});
