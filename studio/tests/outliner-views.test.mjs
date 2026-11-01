// Views of a zoomed item (list, board, article, mind map): an editor's switch is one undo step
// in the document; a read-only reader switches locally (reader view state, never a write), with
// the document's `data.view` as the default.
//
//   cd studio && node --test tests/outliner-views.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { mountOutliner, stopVite } from "./harness/outliner-dom.mjs";

after(() => stopVite());

const doc = () => [
  {
    id: "p",
    text: "Project",
    data: { view: "article" },
    children: [
      { id: "c1", text: "To do", children: [{ id: "k1", text: "Card one" }] },
      { id: "c2", text: "Done", children: [{ id: "k2", text: "Card two" }] },
    ],
  },
];
const radio = (ui, view) => ui.container.querySelector(`[data-view-switcher] [data-view="${view}"]`);

test("read-only: the reader switches views locally; the document is never written", async () => {
  const changes = [];
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "p", readOnly: true, onValueChange: (nodes) => changes.push(nodes) });
  assert.ok(ui.container.querySelector("[data-article]"), "the author's default view: article");
  assert.equal(radio(ui, "board").disabled, false, "a reader can pick another view");
  await ui.click(radio(ui, "board"));
  await ui.frames();
  assert.ok(ui.container.querySelector("[data-board]"), "now read as a board");
  assert.equal(radio(ui, "board").getAttribute("aria-checked"), "true");
  assert.equal(changes.length, 0, "no document change was proposed");
  assert.equal(ui.value()[0].data.view, "article", "data.view is untouched");
  await ui.click(radio(ui, "list"));
  await ui.frames();
  assert.equal(ui.container.querySelector("[data-board]"), null);
  assert.equal(ui.container.querySelector("[data-article]"), null, "the outline");
  assert.equal(changes.length, 0);
  await ui.unmount();
});

test("editor: switching the view is one undo step in the document", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "p" });
  await ui.click(radio(ui, "board"));
  await ui.frames();
  assert.equal(ui.value()[0].data.view, "board", "an editor's switch is written");
  assert.ok(ui.container.querySelector("[data-board]"));
  await ui.act(() => ui.handle.current.undo());
  await ui.frames();
  assert.equal(ui.value()[0].data.view, "article", "one undo brings the old view back");
  await ui.unmount();
});
