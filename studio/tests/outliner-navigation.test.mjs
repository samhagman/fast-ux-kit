// Moving around a long outline: a drag that rests on a folded row opens it (and folds it back
// unless the drop landed inside), each zoom level and a search remember their scroll position
// (zooming out lands on where you came from), and the sticky ancestor strip names the top row's
// ancestors while they are scrolled away, its crumbs zooming in.
//
//   cd studio && node --test tests/outliner-navigation.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let core;
before(async () => {
  core = await load("@fux/core");
});
after(() => stopVite());

const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const ids = (nodes) => nodes.map((n) => n.id);
const ROW = 28;

/**
 * jsdom has no layout: stack the rendered rows the way a browser would (28 px each), inside a
 * scroller whose top sits at y = 100 and that really scrolls (scrollTop moves every row).
 */
function layout(ui, { height = 300 } = {}) {
  const scroller = ui.container.querySelector("[data-outliner-scroll]");
  const list = ui.tree();
  const rows = () => [...list.querySelectorAll("[data-row]")];
  const top = 100;
  scroller.getBoundingClientRect = () => ({ top, bottom: top + height, left: 0, right: 600, width: 600, height, x: 0, y: top, toJSON() {} });
  scroller.scrollTo = (options) => {
    scroller.scrollTop = typeof options === "number" ? options : (options?.top ?? scroller.scrollTop);
  };
  list.getBoundingClientRect = () => ({ top: top - scroller.scrollTop, bottom: top - scroller.scrollTop + rows().length * ROW, left: 0, right: 600, width: 600, height: rows().length * ROW, x: 0, y: top, toJSON() {} });
  const boxes = () => {
    for (const el of rows())
      el.getBoundingClientRect = () => {
        const y = top + rows().indexOf(el) * ROW - scroller.scrollTop;
        return { top: y, bottom: y + ROW, left: 0, right: 600, width: 600, height: ROW, x: 0, y, toJSON() {} };
      };
  };
  boxes();
  return { scroller, list, boxes, rowTop: (id) => top + rows().findIndex((el) => el.dataset.row === id) * ROW - scroller.scrollTop };
}

/* ───────────── Hover-to-expand during a drag ───────────── */

const dragDoc = () => [
  {
    id: "p",
    text: "Project",
    children: [
      { id: "t1", text: "Write spec" },
      { id: "t2", text: "Review spec" },
      { id: "g", text: "Group", children: [{ id: "g1", text: "Inside one" }, { id: "g2", text: "Inside two" }] },
    ],
  },
  { id: "q", text: "Other" },
];

const fire = (target, type, x, y, init = {}) => {
  const event = new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, ...init });
  Object.defineProperty(event, "pointerId", { value: 1 });
  Object.defineProperty(event, "pointerType", { value: "mouse" });
  target.dispatchEvent(event);
};

test("drag: resting on a folded row opens it; a drop inside keeps it open, one undo step", async () => {
  const ui = await mountOutliner({ defaultValue: dragDoc(), defaultExpandedIds: ["p"] });
  const { boxes, rowTop, list } = layout(ui);
  const unit = parseFloat(getComputedStyle(list).getPropertyValue("--ol-indent")) || 22;
  const expanded = (id) => ui.ol().rows.find((r) => r.id === id)?.expanded;
  assert.equal(expanded("g"), false, "Group starts folded");
  // Rows: p t1 t2 g q. Pick up t2 by its bullet and rest on Group.
  const handle = ui.row("t2").querySelector("[data-drag-handle]");
  const x = 40;
  await ui.act(() => fire(handle, "pointerdown", x, rowTop("t2") + 10));
  await ui.act(() => fire(window, "pointermove", x + 6, rowTop("t2") + 10));
  await ui.act(() => fire(window, "pointermove", x + 6, rowTop("g") + 14));
  assert.equal(expanded("g"), false, "not at once: it opens after a beat");
  await waitFor(() => expanded("g"), 2000);
  await ui.frames();
  assert.ok(ui.row("g1") && ui.row("g2"), "its children are on screen, mid-drag");
  // Drop between g1 and g2, one level deeper than t2 (inside Group).
  boxes();
  await ui.act(() => fire(window, "pointermove", x + unit, rowTop("g2") + 2));
  await ui.act(() => fire(window, "pointerup", x + unit, rowTop("g2") + 2));
  assert.deepEqual(ids(find(ui.value(), "g").children), ["g1", "t2", "g2"], "dropped inside the row that opened");
  assert.equal(expanded("g"), true, "a drop inside keeps it open");
  await ui.act(() => ui.handle.current.undo());
  assert.deepEqual(ids(find(ui.value(), "p").children), ["t1", "t2", "g"], "the move is one undo step");
  await ui.unmount();
});

test("drag: a row opened by hovering folds again when the drop lands elsewhere, or on Esc", async () => {
  const ui = await mountOutliner({ defaultValue: dragDoc(), defaultExpandedIds: ["p"] });
  const { boxes, rowTop } = layout(ui);
  const expanded = (id) => ui.ol().rows.find((r) => r.id === id)?.expanded;
  const x = 40;
  const pick = async () => {
    boxes();
    const handle = ui.row("t1").querySelector("[data-drag-handle]");
    await ui.act(() => fire(handle, "pointerdown", x, rowTop("t1") + 10));
    await ui.act(() => fire(window, "pointermove", x + 6, rowTop("t1") + 10));
    await ui.act(() => fire(window, "pointermove", x + 6, rowTop("g") + 14));
    await waitFor(() => expanded("g"), 2000);
    await ui.frames();
    boxes();
  };
  // Opened, then dropped at the very end of the outline (after Other, top level).
  await pick();
  await ui.act(() => fire(window, "pointermove", x - 22, rowTop("q") + 24));
  await ui.act(() => fire(window, "pointerup", x - 22, rowTop("q") + 24));
  assert.deepEqual(ids(ui.value()), ["p", "q", "t1"], "t1 moved to the end");
  assert.equal(expanded("g"), false, "the row it only passed over folded again");
  // Esc cancels the whole drag: nothing moves, and the row folds back.
  await ui.act(() => ui.handle.current.undo());
  await pick();
  await ui.act(() => window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  assert.equal(expanded("g"), false, "Esc folds it back");
  assert.deepEqual(ids(find(ui.value(), "p").children), ["t1", "t2", "g"], "and moves nothing");
  await ui.unmount();
});

/* ───────────── Scroll memory ───────────── */

const longDoc = () => [
  { id: "intro", text: "Intro" },
  { id: "big", text: "Big branch", children: Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, text: `Child ${i}`, children: i === 20 ? [{ id: "deep", text: "Deep", children: Array.from({ length: 20 }, (_, j) => ({ id: `d${j}`, text: `Deep ${j}` })) }] : undefined })) },
  { id: "tail", text: "Tail" },
];

test("scroll memory: zoom in starts at the top, zoom out returns to the prior scroll and the row you came from", async () => {
  const ui = await mountOutliner({ defaultValue: longDoc(), defaultExpandedIds: ["big"] });
  const { scroller } = layout(ui, { height: 2000 });
  const scrollTo = async (top) => {
    scroller.scrollTop = top;
    await ui.act(() => scroller.dispatchEvent(new window.Event("scroll")));
  };
  await scrollTo(412);
  // Zoom into "deep" by its bullet, as a click would.
  await ui.click(ui.row("b20").querySelector("[data-drag-handle]"));
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "b20");
  assert.equal(scroller.scrollTop, 0, "a level never visited opens at its top");
  await scrollTo(90);
  // Back to the document with the breadcrumb's first crumb.
  await ui.click(ui.container.querySelector('nav[aria-label="Breadcrumb"] ol button'));
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, null);
  assert.equal(scroller.scrollTop, 412, "back where you were reading");
  assert.deepEqual(ui.selection(), ["b20"], "the item you came from is the cursor");
  assert.match(ui.live(), /Zoomed out to the document/);
  // Each level keeps its own position: the zoom remembers 90.
  await ui.act(() => ui.handle.current.zoomTo("b20"));
  await ui.frames();
  assert.equal(scroller.scrollTop, 90, "the zoom level remembers its own scroll");
  await ui.unmount();
});

test("scroll memory: a search starts at the top of its results; clearing it restores the reading position", async () => {
  const ui = await mountOutliner({ defaultValue: longDoc(), defaultExpandedIds: ["big"] });
  const { scroller } = layout(ui, { height: 2000 });
  scroller.scrollTop = 333;
  await ui.act(() => scroller.dispatchEvent(new window.Event("scroll")));
  await ui.act(() => ui.handle.current.search("Deep"));
  assert.equal(scroller.scrollTop, 0, "results start at the top");
  await ui.act(() => ui.handle.current.search(""));
  await waitFor(() => scroller.scrollTop === 333, 1000);
  await ui.unmount();
});

/* ───────────── Sticky ancestor strip ───────────── */

test("sticky strip: scrolled past a branch's parent, its ancestors pin as crumbs; a crumb zooms in", async () => {
  const ui = await mountOutliner({ defaultValue: longDoc(), defaultExpandedIds: ["big", "b20", "deep"] });
  const { scroller } = layout(ui, { height: 300 });
  const strip = () => ui.container.querySelector('nav[aria-label="Ancestors of the top item"]');
  const crumbs = () => [...(strip()?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
  const scrollTo = async (top) => {
    scroller.scrollTop = top;
    await ui.act(() => scroller.dispatchEvent(new window.Event("scroll")));
    await ui.frames();
  };
  assert.equal(strip(), null, "at the top there is no strip");
  // Rows: intro(0) big(1) b0…b20(2…22) deep(23) d0…(24…). Scroll so b5 is the top row: its
  // parent "Big branch" has scrolled away.
  await scrollTo(7 * ROW);
  assert.deepEqual(crumbs(), ["Big branch"]);
  // Deeper: d3 on top, so Big branch › Child 20 › Deep.
  await scrollTo(27 * ROW);
  assert.deepEqual(crumbs(), ["Big branch", "Child 20", "Deep"], "every ancestor, outermost first");
  // Barely scrolled (under 24 px) there is nothing to pin.
  await scrollTo(20);
  await waitFor(() => !strip(), 1000);
  await scrollTo(27 * ROW);
  const child20 = [...strip().querySelectorAll("button")].find((b) => b.textContent === "Child 20");
  await ui.click(child20);
  assert.equal(ui.ol().state.hoistedId, "b20", "the crumb zooms into that ancestor");
  await scrollTo(0);
  await waitFor(() => !strip(), 1000);
  await ui.unmount();
});
