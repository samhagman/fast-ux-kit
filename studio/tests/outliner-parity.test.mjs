// Outliner parity and identity: items leaving a mirror keep their id, indented-text import,
// interchange round trips, recurrence anchors, balanced-paren URLs, edit history search and
// the controlled veto notice.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { JSDOM } from "jsdom";

const { window: dom } = new JSDOM("");
const parse = (html) => new dom.DOMParser().parseFromString(html, "text/html");

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, core, mirrors, inline, interchange, search, hook, controlled;
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  core = await vite.ssrLoadModule("@fux/core");
  mirrors = await vite.ssrLoadModule("/src/registry/outliner/mirrors.ts");
  inline = await vite.ssrLoadModule("/src/registry/outliner/inline.tsx");
  interchange = await vite.ssrLoadModule("/src/registry/outliner/interchange.ts");
  search = await vite.ssrLoadModule("/src/registry/outliner/search-filters.ts");
  hook = await vite.ssrLoadModule("/src/registry/outliner/use-outliner.ts");
  controlled = await vite.ssrLoadModule("/src/registry/outliner/controlled-outline.ts");
});
after(() => vite?.close());

const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const parentOf = (nodes, id) => core.findOutlineNode(nodes, id)?.parentId ?? null;
const ids = (nodes) => nodes.map((n) => n.id);
const allIds = (nodes) => nodes.flatMap((n) => [n.id, ...allIds(n.children ?? [])]);
const doc = () => [
  { id: "src", text: "Rollout", children: [{ id: "a", text: "Dogfood", checked: true }, { id: "b", text: "GA", checked: false, children: [{ id: "b1", text: "Tenant flag" }] }] },
  { id: "elsewhere", text: "Comms", children: [{ id: "m", text: "", data: { mirrorOf: "src" } }] },
  { id: "target", text: "Target" },
];

/* The editor loop exactly as useOutliner runs it: core reducer + the mirror rule. */
function editor(nodes, { isLocked } = {}) {
  const noteAdapter = {
    read: (node) => node.data?.note ?? "",
    prepareData: (node, note) => {
      const { note: _previous, ...rest } = node.data ?? {};
      return { ok: true, data: note ? { ...rest, note } : rest };
    },
  };
  const options = { readOnly: false, isLocked, historyLimit: 50, typingGroupMs: 900, noteAdapter };
  const loaded = mirrors.syncMirrors(null, nodes).nodes;
  let state = controlled.initOutlineState(core.createOutlineEditorState(loaded, { expandedIds: new Set(allIds(loaded)) }));
  const afterEdit = hook.mirrorAfterEdit(isLocked);
  return {
    act(action) {
      state = controlled.stepOutline(state, action, options, false, 0, afterEdit).state;
      return state.editor;
    },
    get nodes() {
      return state.editor.nodes;
    },
    get editor() {
      return state.editor;
    },
  };
}

/* ───────────── leaving a mirror keeps the source identity ───────────── */

test("mirror: Shift+Tab out of a mirror moves the SOURCE item (same id), caret follows", () => {
  const ed = editor(doc());
  ed.act({ type: "focus", id: "m~b", start: 0 });
  const state = ed.act({ type: "outdent", ids: ["m~b"] });
  assert.ok(find(ed.nodes, "b"), "the item keeps its id");
  assert.equal(find(ed.nodes, "m~b"), undefined, "no derived id outside the mirror");
  assert.equal(parentOf(ed.nodes, "b"), "elsewhere", "it now lives where it was moved");
  assert.deepEqual(ids(find(ed.nodes, "b").children), ["b1"], "descendants take back their ids too");
  assert.deepEqual(ids(find(ed.nodes, "src").children), ["a"], "the source lost it (it moved)");
  assert.deepEqual(ids(find(ed.nodes, "m").children), ["m~a"], "and so did the mirror");
  assert.equal(state.caret.id, "b", "typing continues in the moved item");
  assert.equal(core.validateOutline(ed.nodes).length, 0);
  ed.act({ type: "undo" });
  assert.deepEqual(ids(find(ed.nodes, "src").children), ["a", "b"], "one undo step restores it");
  assert.deepEqual(ids(find(ed.nodes, "m").children), ["m~a", "m~b"]);
});

test("mirror: a drag out of a mirror (planOutlineDrop) keeps the id", () => {
  const ed = editor(doc());
  const visible = allIds(ed.nodes);
  // Drop m~a after "target" at depth 0 (the end of the document).
  const plan = core.planOutlineDrop(ed.nodes, visible, ["m~a"], visible.filter((id) => !id.startsWith("m~a")).length, 0);
  ed.act({ type: "drop", ids: ["m~a"], parentId: plan.parentId, index: plan.index });
  assert.deepEqual(ids(ed.nodes), ["src", "elsewhere", "target", "a"]);
  assert.equal(find(ed.nodes, "a").text, "Dogfood");
  assert.deepEqual(ids(find(ed.nodes, "src").children), ["b"]);
  assert.deepEqual(ids(find(ed.nodes, "m").children), ["m~b"]);
});

test("mirror: a drag from the mirror into its own source reorders the source item", () => {
  const ed = editor(doc());
  ed.act({ type: "drop", ids: ["m~b"], parentId: "src", index: 0 });
  assert.deepEqual(ids(find(ed.nodes, "src").children), ["b", "a"]);
  assert.deepEqual(ids(find(ed.nodes, "m").children), ["m~b", "m~a"], "the mirror follows");
  assert.equal(core.validateOutline(ed.nodes).length, 0);
});

test("mirror: 'Move to…' out of a mirror keeps the id; a locked source refuses", () => {
  const ed = editor(doc());
  ed.act({ type: "drop", ids: ["m~b"], parentId: "target", index: 0 });
  assert.equal(parentOf(ed.nodes, "b"), "target");
  assert.ok(find(ed.nodes, "b1"));
  const locked = editor(doc(), { isLocked: (node) => node.id === "b" });
  const result = locked.act({ type: "drop", ids: ["m~b"], parentId: "target", index: 0 });
  assert.equal(result.refusal, "locked");
  assert.ok(find(locked.nodes, "m~b"), "nothing moved");
});

test("mirror: cut from a mirror and paste elsewhere keeps the id (importJSON)", async () => {
  const view = await mount({ defaultValue: doc(), defaultExpandedIds: ["src", "elsewhere", "m", "b"] });
  const json = view.record.ol.commands.exportAs("json", ["m~b"]);
  await view.run((ol) => ol.commands.remove(["m~b"]));
  assert.equal(find(view.record.ol.state.nodes, "b"), undefined, "cut removes the item at its source");
  await view.run((ol) => ol.commands.importJSON(json, "target"));
  const nodes = view.record.ol.state.nodes;
  assert.ok(find(nodes, "b"), "pasted back under its source id");
  assert.ok(find(nodes, "b1"));
  assert.equal(parentOf(nodes, "b"), null);
  // A second paste of the same clipboard is a copy: fresh ids.
  await view.run((ol) => ol.commands.importJSON(json, "target"));
  assert.equal(core.validateOutline(view.record.ol.state.nodes).length, 0);
  assert.equal(allIds(view.record.ol.state.nodes).filter((id) => id === "b").length, 1);
  await view.unmount();
});

test("mirror: a second paste after a mirror cut + edit never deletes the first paste", async () => {
  const view = await mount({ defaultValue: doc(), defaultExpandedIds: ["src", "elsewhere", "m", "b"] });
  const json = view.record.ol.commands.exportAs("json", ["m~b"]);
  await view.run((ol) => ol.commands.remove(["m~b"]));
  await view.run((ol) => ol.commands.importJSON(json, "target"));
  // Edit the pasted item and give it a new child (the regression's repro).
  await view.run((ol) => ol.dispatch({ type: "text", id: "b", text: "Edited b" }));
  await view.run((ol) => ol.commands.addChild("b", "New child"));
  const before = allIds(view.record.ol.state.nodes).length;
  await view.run((ol) => ol.commands.importJSON(json, "target"));
  const nodes = view.record.ol.state.nodes;
  assert.equal(find(nodes, "b")?.text, "Edited b", "the first paste (and its edit) survives");
  assert.ok(find(nodes, "b").children?.some((child) => child.text === "New child"), "its new child survives");
  assert.ok(allIds(nodes).length > before, "the second paste inserted a copy");
  assert.equal(allIds(nodes).filter((id) => id.includes("~") && !id.startsWith("m~")).length, 0, "no stray derived ids");
  assert.equal(core.validateOutline(nodes).length, 0);
  await view.unmount();
});
test("mirror: link, bookmark and backlinks from inside a mirror use the source id", async () => {
  const view = await mount({
    defaultValue: [...doc(), { id: "ref", text: "See [[GA|b]]" }],
    defaultBookmarks: { items: [], searches: [] },
  });
  const { commands } = view.record.ol;
  assert.equal(commands.linkTo("m~b"), "[[GA|b]]");
  assert.equal(commands.linkTo("m"), "[[Rollout|src]]", "a mirror links to what it shows");
  await view.run((ol) => ol.commands.toggleBookmark("m~b"));
  assert.deepEqual(view.record.ol.bookmarks.items, ["b"]);
  assert.deepEqual(commands.backlinks("m~b"), ["ref"]);
  const copyRow = view.record.ol.rows.find((row) => row.id === "m~b");
  assert.equal(copyRow?.backlinks, 1, "a copy row shows its source's backlinks");
  await view.unmount();
});

/* ───────────── indented plain text, round trips ───────────── */

test("import: tab-indented text with no bullets nests by indentation", () => {
  const nodes = interchange.importOutline("Parent\n\tChild one\n\tChild two\n\t\tGrandchild\nSibling", () => "x");
  assert.deepEqual(nodes.map((n) => n.text), ["Parent", "Sibling"]);
  assert.deepEqual(nodes[0].children.map((n) => n.text), ["Child one", "Child two"]);
  assert.deepEqual(nodes[0].children[1].children.map((n) => n.text), ["Grandchild"]);
  assert.equal(nodes[0].data?.note, undefined, "no notes");
});

test("import: space indentation (any consistent unit) nests too", () => {
  for (const unit of ["  ", "    "]) {
    const nodes = interchange.importOutline(`A\n${unit}B\n${unit}${unit}C\n${unit}D\nE`, () => "x");
    assert.deepEqual(nodes.map((n) => n.text), ["A", "E"]);
    assert.deepEqual(nodes[0].children.map((n) => n.text), ["B", "D"]);
    assert.deepEqual(nodes[0].children[0].children.map((n) => n.text), ["C"]);
  }
});

test("import: continuation lines are notes only under a bulleted item", () => {
  const nodes = interchange.importOutline("- Item\n  continued here\n  - Child\nPlain\n  Plain child", () => "x");
  assert.equal(nodes[0].data.note, "continued here");
  assert.deepEqual(nodes[0].children.map((n) => n.text), ["Child"]);
  assert.deepEqual(nodes[1].children.map((n) => n.text), ["Plain child"]);
});

const strip = (nodes) => nodes.map(({ id: _id, children, ...rest }) => ({ ...rest, ...(children?.length ? { children: strip(children) } : {}) }));
const sample = () => [
  { id: "p", text: "Plan **bold**", children: [{ id: "c1", text: "One #tag" }, { id: "c2", text: "Two", children: [{ id: "g", text: "Deep" }] }] },
  { id: "s", text: "Sibling" },
];

test("round trip: exportAs('text') imports back to the same structure", () => {
  const text = interchange.exportOutline(sample(), "text");
  assert.deepEqual(strip(interchange.importOutline(text, () => "x")), strip(sample()));
});

test("round trip: JSON export imports (fresh ids, mirrors and links re-pointed)", () => {
  const nodes = mirrors.syncMirrors(null, [...doc(), { id: "ref", text: "See [[GA|b]]" }]).nodes;
  const json = interchange.exportOutline(nodes, "json");
  let n = 0;
  const back = interchange.importOutline(json, () => `n${++n}`);
  assert.equal(back.length, nodes.length, "a document, not one item holding JSON text");
  assert.ok(!allIds(back).some((id) => allIds(nodes).includes(id)), "fresh ids");
  const mirror = back[1].children[0];
  assert.equal(mirror.data.mirrorOf, back[0].id, "the mirror points at the new source id");
  const newB = back[0].children[1].id;
  assert.equal(back[3].text, `See [[GA|${newB}]]`, "links follow their target");
  assert.equal(mirrors.syncMirrors(null, back).ok, true);
});

test("HTML export carries recurrence; import reads it back", () => {
  const html = interchange.exportOutlineHtml([{ id: "r", text: "Sync !(2026-11-03 10:00 every week)" }]);
  assert.match(html, /data-repeat="week"/);
  const [node] = interchange.importOutlineHtml(html, () => "x", parse);
  assert.equal(node.text, "Sync !(2026-11-03 10:00 every week)");
});

test("exported link labels use stable absolute dates, never 'Tomorrow'", () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const day = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const nodes = mirrors.syncMirrors(null, [
    { id: "w", text: `Capacity review !(${day} 10:00 every week)` },
    { id: "m", text: "", data: { mirrorOf: "w" } },
  ]).nodes;
  const md = interchange.exportOutline(nodes, "markdown");
  assert.match(md, new RegExp(`\\[\\[Capacity review ${day} 10:00 every week\\|w\\]\\]`));
  assert.ok(!/Tomorrow/.test(md));
});

/* ───────────── monthly recurrence keeps its day ───────────── */

test("monthly recurrence anchors to the original day: Jan 31 → Feb 28 → Mar 31", () => {
  const step = (text, now) => hook.advanceRecurring(text, now).text;
  const feb = step("Rent !(2026-01-31 every month)", new Date(2026, 0, 31, 12));
  assert.equal(feb, "Rent !(2026-02-28 every month on 31)");
  const mar = step(feb, new Date(2026, 1, 28, 12));
  assert.equal(mar, "Rent !(2026-03-31 every month)");
  assert.equal(step(mar, new Date(2026, 2, 31, 12)), "Rent !(2026-04-30 every month on 31)");
  const leap = step("Leap !(2028-02-29 every year)", new Date(2028, 1, 29, 12));
  assert.equal(leap, "Leap !(2029-02-28 every year on 29)");
  assert.equal(inline.parseDateToken("!(2026-02-28 every month on 31)").repeat.day, 31);
  assert.equal(inline.parseDateToken("!(2026-02-28 every week on 31)"), null, "an anchor day only for months and years");
});

/* ───────────── balanced parentheses in URLs ───────────── */

test("URLs keep balanced parentheses, bare and in Markdown links", () => {
  const wiki = "https://en.wikipedia.org/wiki/Foo_(bar)";
  const bareUrl = inline.parseInline(`see ${wiki} now`).find((s) => s.kind === "url");
  assert.equal(bareUrl.href, wiki);
  const md = inline.parseInline(`[w](${wiki}) after`).find((s) => s.kind === "link");
  assert.equal(md.href, wiki);
  assert.equal(inline.inlineToPlain(`[w](${wiki}) after`), "w after", "no stray )");
  const wrapped = inline.parseInline("(see https://example.com/a) end");
  assert.equal(wrapped.find((s) => s.kind === "url").href, "https://example.com/a", "an unbalanced closing ) is punctuation");
  assert.equal(inline.inlineToPlain("(see https://example.com/a) end"), "(see https://example.com/a) end");
  const html = interchange.exportOutlineHtml([{ id: "x", text: `[w](${wiki})` }]);
  assert.match(html, /href="https:\/\/en\.wikipedia\.org\/wiki\/Foo_\(bar\)"/);
});

test("link titles drop chips: dates, tags and mentions", () => {
  assert.equal(inline.inlineToLabel("Red-team review !(2026-11-01) @marco #safety"), "Red-team review");
  assert.equal(inline.inlineToLabel("**Bold** and [[x|y]] #t"), "Bold and x");
});

/* ───────────── History-lite: changed: / edited: ───────────── */

test("search: changed:today | week | YYYY-MM-DD read data.editedAt", () => {
  const now = new Date(2026, 9, 30, 12);
  const at = (y, m, d) => new Date(y, m - 1, d, 9).getTime();
  const nodes = [
    { id: "t", text: "Today", data: { editedAt: at(2026, 10, 30) } },
    { id: "w", text: "Monday", data: { editedAt: at(2026, 10, 26) } },
    { id: "o", text: "Old", data: { editedAt: at(2026, 9, 1) } },
    { id: "n", text: "Never" },
  ];
  const q = (query) => search.searchOutliner(nodes, query, { now }).matchedIds;
  assert.deepEqual(q("changed:today"), ["t"]);
  assert.deepEqual(q("changed:week"), ["t", "w"]);
  assert.deepEqual(q("edited:2026-09-01"), ["o"]);
  assert.deepEqual(q("-changed:week"), ["o", "n"]);
  assert.match(search.searchOutliner(nodes, "changed:soon", { now }).diagnostics[0].message, /changed:/);
  assert.ok(search.searchSuggestions("chan").some((s) => s.label === "changed:"));
});

test("hook: edits stamp data.editedAt (title, note, checkbox, new items); reading does not", async () => {
  const view = await mount({ defaultValue: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }] });
  await view.run((ol) => ol.dispatch({ type: "select", id: "a" }));
  assert.equal(find(view.record.ol.state.nodes, "a").data, undefined, "selection is not an edit");
  await view.run((ol) => ol.dispatch({ type: "text", id: "a", text: "Alpha 2", time: 1 }));
  const stamp = find(view.record.ol.state.nodes, "a").data.editedAt;
  assert.ok(typeof stamp === "number" && Math.abs(Date.now() - stamp) < 60_000, "epoch ms, the core details field");
  assert.equal(find(view.record.ol.state.nodes, "b").data, undefined, "untouched items keep their identity");
  await view.run((ol) => ol.dispatch({ type: "split", id: "a", start: 7, newId: "fresh" }));
  assert.ok(find(view.record.ol.state.nodes, "fresh").data?.editedAt, "a new item is an edit");
  assert.equal(view.record.ol.search, null);
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "changed:today" })));
  assert.deepEqual([...view.record.ol.search.matchedIds].sort(), ["a", "fresh"]);
  await view.unmount();
});

/* ───────────── Controlled veto is visible ───────────── */

test("hook: a veto (sync or late) is reported once with what was discarded", async () => {
  let reject;
  const view = await mount({
    value: [{ id: "a", text: "Alpha" }],
    onValueChange: (_nodes, meta) => {
      reject = meta.reject;
    },
  });
  await view.run((ol) => ol.dispatch({ type: "text", id: "a", text: "Alpha N", time: 1 }));
  await view.run((ol) => ol.dispatch({ type: "text", id: "a", text: "Alpha NO", time: 2 }));
  assert.equal(view.record.ol.rejection, null);
  await view.run(() => reject());
  assert.equal(view.record.ol.rejection?.count, 1);
  await view.unmount();
});

/* ───────────── Through the hook (React, jsdom) ───────────── */

let React, act, createRoot;
async function domEnv() {
  if (createRoot) return;
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMParser"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}
async function mount(props) {
  await domEnv();
  const record = { ol: null };
  function Probe() {
    record.ol = hook.useOutliner(props);
    return null;
  }
  const root = createRoot(window.document.createElement("div"));
  await act(async () => root.render(React.createElement(Probe)));
  return { record, run: (fn) => act(async () => void fn(record.ol)), unmount: () => act(async () => root.unmount()) };
}
