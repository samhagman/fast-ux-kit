// Folding and moving: show N levels (scoped to zoom), the interactive folded summary (tick a
// hidden task, counts follow, one undo step each), ⌥-drag copies, copy item link (deep links,
// host links, pasted back as an item link), and the two-stage touch swipe.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let folding, copyDrop, permalink, gestures, core;
before(async () => {
  folding = await load("/src/registry/outliner/folding.ts");
  copyDrop = await load("/src/registry/outliner/copy-drop.ts");
  permalink = await load("/src/registry/outliner/permalink.ts");
  gestures = await load("/src/registry/outliner/gestures.ts");
  core = await load("@fux/core");
});
after(() => stopVite());

const doc = () => [
  {
    id: "p",
    text: "Project",
    children: [
      { id: "t1", text: "Write spec", checked: true },
      { id: "t2", text: "Review spec", checked: false },
      {
        id: "g",
        text: "Group",
        children: [
          { id: "t3", text: "Ship it", checked: false },
          { id: "x", text: "plain" },
        ],
      },
    ],
  },
  { id: "q", text: "Other", children: [{ id: "q1", text: "Q1" }] },
];
const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const ids = (nodes) => nodes.map((n) => n.id);

/* ───────────── Show N levels ───────────── */

test("levels: one action, depth counted from the zoom", () => {
  assert.deepEqual(folding.levelsAction(1, null), { type: "expand-all", expanded: true, depth: 0 });
  assert.deepEqual(folding.levelsAction(2, "p"), { type: "expand-all", expanded: true, depth: 2 });
  assert.deepEqual(folding.levelsAction("all", null), { type: "expand-all", expanded: true });
  let state = core.createOutlineEditorState(doc());
  state = core.reduceOutlineEditor(state, folding.levelsAction(2, null));
  assert.deepEqual(
    [...state.expandedIds].sort(),
    ["p", "q"],
    "2 levels: top-level items open, deeper ones folded",
  );
});

test("levels: the palette and the view menu offer Show 1/2/3/all levels", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.act(() => ui.ui().setPaletteOpen(true));
  const items = [...document.querySelectorAll("[cmdk-item]")].map((el) => el.textContent);
  for (const label of [
    "Show 1 level",
    "Show 2 levels",
    "Show 3 levels",
    "Show all levels",
    "Find and replace",
    "Settings",
  ])
    assert.ok(
      items.some((t) => t.includes(label)),
      label,
    );
  const two = [...document.querySelectorAll("[cmdk-item]")].find((el) =>
    el.textContent.includes("Show 2 levels"),
  );
  await ui.click(two);
  assert.deepEqual(
    ui.ol().rows.map((r) => r.id),
    ["p", "t1", "t2", "g", "q", "q1"],
  );
  await ui.unmount();
});

/* ───────────── Interactive folded summary ───────────── */

test("fold summary: tick a hidden task from the folded row; counts follow; each tick is one undo step", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: [] });
  const chip = () => ui.row("p").querySelector("[data-fold-summary]");
  assert.match(chip().getAttribute("aria-label"), /1 of 3 tasks done, 5 hidden items/);
  await ui.click(chip());
  const popover = await waitFor(() => document.querySelector("[data-fold-tasks]"));
  const tasks = [...popover.querySelectorAll("[data-fold-task]")];
  assert.deepEqual(
    tasks.map((el) => el.dataset.foldTask),
    ["t2", "t3"],
    "the open tasks, nested ones included",
  );
  assert.match(tasks[1].textContent, /Group/, "with where they sit");
  const before = ui.ol().state.history.past.length;
  await ui.click(tasks[0]);
  assert.equal(find(ui.value(), "t2").checked, true);
  assert.match(
    chip().getAttribute("aria-label"),
    /2 of 3 tasks done/,
    "the chip's count follows at once",
  );
  assert.equal(
    popover.querySelector('[data-fold-task="t2"]').getAttribute("aria-checked"),
    "true",
    "a ticked task stays listed (untick is a click away)",
  );
  assert.equal(ui.ol().state.history.past.length, before + 1, "one undo step");
  assert.equal(ui.ol().rows.find((r) => r.id === "p").expanded, false, "still folded");
  await ui.act(() => ui.handle.current.undo());
  assert.equal(find(ui.value(), "t2").checked, false);
  assert.match(chip().getAttribute("aria-label"), /1 of 3/);
  const expand = [...popover.querySelectorAll("button")].find((b) =>
    /Show 5 hidden items/.test(b.textContent),
  );
  await ui.click(expand);
  assert.equal(ui.ol().rows.find((r) => r.id === "p").expanded, true, "the footer unfolds");
  await ui.unmount();
});

test("fold summary: without tasks the chip just unfolds; locked tasks can't be ticked", async () => {
  const ui = await mountOutliner({
    defaultValue: doc(),
    defaultExpandedIds: [],
    isLocked: (node) => node.id === "g",
  });
  await ui.click(ui.row("q").querySelector("[data-fold-summary]"));
  assert.equal(ui.ol().rows.find((r) => r.id === "q").expanded, true);
  await ui.click(ui.row("p").querySelector("[data-fold-summary]"));
  const popover = await waitFor(() => document.querySelector("[data-fold-tasks]"));
  assert.equal(
    popover.querySelector('[data-fold-task="t3"]').disabled,
    true,
    "inside a locked branch",
  );
  await ui.unmount();
});

/* ───────────── ⌥-drag copies ───────────── */

test("copy drop: fresh ids all the way down, inserted at the drop line, originals stay (one transaction)", () => {
  let n = 0;
  const make = () => `n${++n}`;
  const nodes = doc();
  // Drop p's subtree after q at the top level: the remaining top level is [q], index 1.
  const { commands, created } = copyDrop.copyDropCommands(
    nodes,
    ["p", "t1"],
    { parentId: null, index: 1 },
    make,
  );
  assert.deepEqual(created, ["n1"], "t1 travels with p (one root)");
  const result = core.applyOutlineTransaction(nodes, commands, { readOnly: false });
  assert.equal(result.ok, true);
  assert.deepEqual(ids(result.nodes), ["p", "q", "n1"]);
  assert.equal(find(result.nodes, "n1").children.length, 3);
  assert.equal(find(result.nodes, "p").children.length, 3, "the original is untouched");
  // Into the same parent: an index among the siblings that stay maps back onto the full list.
  const inside = copyDrop.copyDropCommands(nodes, ["t2"], { parentId: "p", index: 1 }, make);
  const next = core.applyOutlineTransaction(nodes, inside.commands, { readOnly: false }).nodes;
  assert.deepEqual(
    ids(find(next, "p").children),
    ["t1", "t2", inside.created[0], "g"],
    "lands right after the original, at the line",
  );
});

test("component: ⌥-drag a bullet copies to the drop line; the indicator shows +; Undo removes the copy", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["p"] });
  const list = ui.tree();
  // jsdom has no layout: give rows boxes the way a browser would stack them.
  const order = () => [...list.querySelectorAll("[data-row]")];
  const boxes = () => {
    for (const el of order())
      el.getBoundingClientRect = () => {
        const i = order().indexOf(el);
        return {
          top: 100 + i * 28,
          bottom: 128 + i * 28,
          left: 0,
          right: 600,
          width: 600,
          height: 28,
          x: 0,
          y: 100 + i * 28,
          toJSON() {},
        };
      };
  };
  boxes();
  list.getBoundingClientRect = () => ({
    top: 100,
    bottom: 400,
    left: 0,
    right: 600,
    width: 600,
    height: 300,
    x: 0,
    y: 100,
    toJSON() {},
  });
  const fire = (target, type, x, y, init = {}) => {
    const event = new window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      ...init,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
  };
  const handle = ui.row("t2").querySelector("[data-drag-handle]");
  // Rows: p(0) t1(1) t2(2) g(3) q(4). Drop between g and q at depth 1 (inside p, after g).
  await ui.act(() => fire(handle, "pointerdown", 40, 100 + 2 * 28 + 10, { altKey: true }));
  await ui.act(() => fire(window, "pointermove", 46, 100 + 2 * 28 + 10, { altKey: true }));
  await ui.act(() => fire(window, "pointermove", 46, 100 + 4 * 28 + 2, { altKey: true }));
  assert.ok(document.querySelector("[data-drop-copy]"), "the drop line shows +");
  assert.ok(
    document.documentElement.hasAttribute("data-outline-copy-drag"),
    "the pointer says copy",
  );
  await ui.act(() => fire(window, "pointerup", 46, 100 + 4 * 28 + 2, { altKey: true }));
  const kids = ids(find(ui.value(), "p").children);
  assert.equal(kids.length, 4, "a copy was added");
  assert.deepEqual(kids.slice(0, 3), ["t1", "t2", "g"], "the original stayed where it was");
  const copy = find(ui.value(), kids[3]);
  assert.equal(copy.text, "Review spec");
  assert.notEqual(copy.id, "t2", "fresh id");
  assert.deepEqual(ui.selection(), [copy.id], "the copy is selected");
  assert.equal(document.documentElement.hasAttribute("data-outline-copy-drag"), false);
  await ui.act(() => ui.handle.current.undo());
  assert.deepEqual(ids(find(ui.value(), "p").children), ["t1", "t2", "g"], "one undo step");
  // Without ⌥ the same drag moves.
  boxes();
  await ui.act(() =>
    fire(ui.row("t2").querySelector("[data-drag-handle]"), "pointerdown", 40, 100 + 2 * 28 + 10),
  );
  await ui.act(() => fire(window, "pointermove", 46, 100 + 2 * 28 + 10));
  await ui.act(() => fire(window, "pointermove", 46, 100 + 4 * 28 + 2));
  assert.equal(document.querySelector("[data-drop-copy]"), null);
  await ui.act(() => fire(window, "pointerup", 46, 100 + 4 * 28 + 2));
  assert.deepEqual(ids(find(ui.value(), "p").children), ["t1", "g", "t2"], "moved");
  await ui.unmount();
});

/* ───────────── Copy item link ───────────── */

test("links: ?zoom= deep links (and ?doc= in a workspace); a pasted one becomes an item link", () => {
  const base = "https://app.test/notes?q=1&zoom=old#/outliner";
  assert.equal(
    permalink.itemHref("abc", undefined, base),
    "https://app.test/notes?q=1&zoom=abc#/outliner",
  );
  assert.equal(
    permalink.itemHref("abc", "plan/abc", base),
    "https://app.test/notes?q=1&doc=plan&zoom=abc#/outliner",
  );
  assert.deepEqual(permalink.itemFromHref("https://app.test/notes?zoom=abc#/x", base), {
    doc: null,
    id: "abc",
  });
  assert.equal(
    permalink.itemFromHref("https://evil.test/notes?zoom=abc", base),
    null,
    "another site is just a URL",
  );
  assert.equal(
    permalink.itemFromHref("see https://app.test/notes?zoom=abc", base),
    null,
    "only a bare link",
  );
});

test("component: Copy item link writes a deep link with a toast; linkFor overrides; pasting it links the item", async () => {
  const written = [];
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async (text) => written.push(text) },
    configurable: true,
  });
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("t2");
  await ui.act(() => ui.ui().copyLink("t2"));
  await waitFor(() => written.length);
  assert.equal(written[0], "http://localhost/notes?x=1&zoom=t2#/outliner");
  // Paste it into another title: an item link to it, with its live title.
  await ui.edit("q1");
  const field = ui.field();
  field.setSelectionRange(2, 2);
  await ui.act(() => {
    const paste = new window.Event("paste", { bubbles: true, cancelable: true });
    paste.clipboardData = {
      getData: (type) => (type === "text/plain" ? written[0] : ""),
      types: ["text/plain"],
      files: [],
    };
    field.dispatchEvent(paste);
  });
  assert.equal(find(ui.value(), "q1").text, "Q1[[Review spec|t2]]");
  await ui.unmount();

  const host = await mountOutliner({
    defaultValue: doc(),
    linkFor: (id) => `https://share.test/i/${id}`,
  });
  await host.act(() => host.ui().copyLink("t1"));
  await waitFor(() => written.length > 1);
  assert.equal(written[1], "https://share.test/i/t1");
  await host.unmount();
});

/* ───────────── Swipe ───────────── */

test("swipe: two stages each way, toward the inline end completes then indents (mirrored in RTL)", () => {
  const intent = gestures.swipeIntent;
  assert.equal(intent(10, false), null);
  assert.equal(intent(40, false), "complete");
  assert.equal(intent(90, false), "indent");
  assert.equal(intent(-40, false), "delete");
  assert.equal(intent(-90, false), "outdent");
  assert.equal(intent(-90, true), "indent", "RTL: indenting moves left");
  assert.equal(intent(40, true), "delete");
});

test("swipe rows render on touch only (the gesture's host)", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    const row = ui.container.querySelector('[data-swipe-row="t1"]');
    assert.ok(row);
    // At rest the row never clips, so hit areas reaching into the gutter (the fold chevron's
    // 44 px target) stay tappable; it clips only while it is moved off its place.
    assert.doesNotMatch(row.className, /overflow-hidden/, "no clipping at rest");
    assert.equal(row.getAttribute("data-swipe-moving"), null);
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
  const ui = await mountOutliner({ defaultValue: doc() });
  assert.equal(ui.container.querySelector("[data-swipe-row]"), null, "no swipe on a mouse");
  await ui.unmount();
});
