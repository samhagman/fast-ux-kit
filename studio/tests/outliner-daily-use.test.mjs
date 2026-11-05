// Regressions from driving the outliner the way a person does day to day: typing code after a
// collapsed ⌘E, splitting a row inside a style, starting an empty zoom from the keyboard, zooming
// in while a title is being edited, clearing a note with select all, and duplicating from the
// item menu.
//
//   cd studio && node --test tests/outliner-daily-use.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { domEnv, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

after(() => stopVite());

await domEnv();

const find = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const inner = node.children && find(node.children, id);
    if (inner) return inner;
  }
  return undefined;
};
const titleOf = (ui, id) => find(ui.value(), id)?.text;

test("⌘E with no selection, then typing: every character typed goes into the code span until ⌘E again", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "" }] });
  await ui.edit("a");
  await ui.type("run ");
  await ui.key("e", { metaKey: true, code: "KeyE" });
  await ui.type("npm ci");
  await ui.key("e", { metaKey: true, code: "KeyE" });
  await ui.type(" first");
  assert.equal(titleOf(ui, "a"), "run `npm ci` first");
  await ui.unmount();
});

test("a caret placed at the end of existing code still types outside it", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "see `x`" }] });
  await ui.edit("a");
  await ui.act(() => ui.field().setSelectionRange(7, 7));
  await ui.type("y");
  assert.equal(titleOf(ui, "a"), "see `x`y");
  await ui.unmount();
});

test("Enter inside a style just before a space, then ⌫: both halves stay bold and join back into one style", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Buy **oat milk** today" }] });
  await ui.edit("a");
  await ui.act(() => ui.field().setSelectionRange(9, 9));
  await ui.key("Enter");
  await ui.frames();
  assert.deepEqual(
    ui.value().map((node) => node.text),
    ["Buy **oat**", "** milk** today"],
  );
  await ui.key("Backspace");
  await ui.frames();
  assert.deepEqual(
    ui.value().map((node) => node.text),
    ["Buy **oat milk** today"],
    "⌫ joins them back into one style",
  );
  await ui.unmount();
});

test("⌘] while editing a title: the caret carries on in the zoomed title; Esc goes to its rows, ⌘[ comes back out", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }] },
      { id: "b", text: "Beta" },
    ],
  });
  await ui.edit("a");
  await ui.act(() => ui.field().setSelectionRange(2, 2));
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "a");
  const zoomed = document.activeElement;
  assert.equal(
    zoomed?.getAttribute("aria-label"),
    "Zoomed item title",
    "the zoomed title has the caret, not <body>",
  );
  assert.equal(zoomed.selectionStart, 2, "where it was");
  assert.equal(ui.ui().editing, false, "no row is being edited");
  await ui.type("p");
  assert.equal(find(ui.value(), "a").text, "Alppha");
  await ui.key("Escape");
  await ui.frames();
  assert.ok(document.activeElement === ui.tree(), "Esc: the zoomed level's rows, not <body>");
  await ui.key("ArrowDown");
  assert.deepEqual(ui.selection(), ["a1"], "row keys work at once");
  await ui.key("[", { metaKey: true, code: "BracketLeft" });
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, null);
  assert.ok(ui.root().contains(document.activeElement), "focus stays in the outliner");
  await ui.unmount();
});

test("Enter in an empty zoom starts its first item, editing", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Leaf" },
      { id: "b", text: "Beta" },
    ],
  });
  await ui.select("a");
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "a");
  assert.ok(document.activeElement === ui.tree(), "the zoomed tree has focus");
  await ui.key("Enter");
  await ui.frames();
  const children = find(ui.value(), "a").children ?? [];
  assert.equal(children.length, 1, "one new child");
  assert.equal(
    ui.field()?.closest("[data-row]")?.dataset.row,
    children[0].id,
    "its title is being edited",
  );
  await ui.type("first");
  assert.equal(find(ui.value(), "a").children[0].text, "first");
  await ui.unmount();
});

test("⌘A then ⌫ in a note clears it whole: no blank lines are left behind, so the row has no note", async () => {
  const ui = await mountOutliner({
    defaultValue: [{ id: "a", text: "Plan", data: { note: "## Shop\n- [x] eggs\n\n\n" } }],
  });
  await ui.edit("a");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.olEditor, "note");
  await ui.key("a", { ctrlKey: true, code: "KeyA" }); // the editor's select all (Mod is Ctrl off a Mac)
  await ui.key("Backspace");
  await ui.frames();
  assert.equal(find(ui.value(), "a").data?.note ?? "", "");
  await ui.type("fresh");
  assert.equal(find(ui.value(), "a").data?.note, "fresh");
  await ui.unmount();
});

test("⌘A then ⌘B in a note bolds the text and keeps the note's trailing lines", async () => {
  const ui = await mountOutliner({
    defaultValue: [{ id: "a", text: "Plan", data: { note: "word\n\n\n" } }],
  });
  await ui.edit("a");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  await ui.key("a", { ctrlKey: true, code: "KeyA" }); // the editor's select all (Mod is Ctrl off a Mac)
  await ui.key("b", { metaKey: true, code: "KeyB" });
  assert.equal(find(ui.value(), "a").data?.note, "**word**\n\n\n");
  await ui.unmount();
});

test("Duplicate from the item menu: the copy becomes the target, so the next key acts on it", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
    ],
  });
  await ui.select("a");
  await ui.key("/");
  await ui.frames();
  const input = await waitFor(() =>
    document.querySelector("[data-item-menu=popover] [data-item-menu-input]"),
  );
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(
      input,
      "duplicate",
    );
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.frames();
  await ui.key("Enter");
  await waitFor(() => !document.querySelector("[data-item-menu=popover]"));
  await ui.frames();
  const ids = ui.value().map((node) => node.id);
  assert.equal(ids.length, 3);
  const copy = ids[1];
  assert.notEqual(copy, "a");
  assert.deepEqual(ui.selection(), [copy], "the copy is selected, not the original");
  assert.ok(document.activeElement === ui.tree(), "back in row mode");
  await ui.unmount();
});

test("⌘[ from the zoomed title it carried on into goes back out, onto that item's row", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }] },
      { id: "b", text: "Beta" },
    ],
  });
  await ui.edit("a");
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await ui.frames();
  assert.equal(document.activeElement?.getAttribute("aria-label"), "Zoomed item title");
  await ui.key("[", { metaKey: true, code: "BracketLeft" });
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, null);
  assert.ok(document.activeElement === ui.tree(), "row mode");
  assert.deepEqual(ui.selection(), ["a"], "on the item zoomed out of");
  await ui.unmount();
});

test("⌘] while editing, from inside a zoom: the caret carries on into the deeper zoom's title", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      {
        id: "a",
        text: "Alpha",
        children: [{ id: "a1", text: "One", children: [{ id: "x", text: "Deep" }] }],
      },
    ],
  });
  await ui.select("a");
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await ui.frames();
  await ui.edit("a1");
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "a1");
  assert.equal(document.activeElement?.getAttribute("aria-label"), "Zoomed item title");
  assert.equal(document.activeElement.value, "One");
  await ui.unmount();
});
