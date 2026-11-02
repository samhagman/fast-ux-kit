// The everyday keys, pressed in the real component: Enter splits the edited item at the caret,
// Tab / Shift+Tab indent and outdent it; Duplicate from the item menu; ⌘A twice (the title's
// text first, then every row); Collapse all / Expand all from the view menu; and the inline
// formatting keys ⌘B ⌘I ⌘E ⇧⌘X ⇧⌘H wrapping the selected words.
//
//   cd studio && node --test tests/outliner-keys.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { code, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

after(() => stopVite());

const doc = () => [
  { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }, { id: "a2", text: "Twofold" }, { id: "a3", text: "Three", children: [{ id: "a3x", text: "Under three" }] }] },
  { id: "b", text: "Beta", children: [{ id: "b1", text: "Deep", children: [{ id: "b1x", text: "Deeper" }] }] },
  { id: "c", text: "make this bold" },
];
const kids = (nodes, id) => (nodes.find((n) => n.id === id)?.children ?? []).map((n) => n.id);
const titleOf = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node.text;
    const inner = node.children && titleOf(node.children, id);
    if (inner !== undefined) return inner;
  }
  return undefined;
};

/* ───────────── Enter splits, Tab indents, Shift+Tab outdents ───────────── */

test("keys: Enter splits at the caret; Tab indents and Shift+Tab outdents the edited item (one step each)", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const steps = () => ui.ol().state.history.past.length;
  await ui.edit("a2");
  ui.field().setSelectionRange(3, 3);
  const before = steps();
  await ui.key("Enter");
  const children = kids(ui.value(), "a");
  assert.equal(children.length, 4, "a new item");
  const fresh = children[2];
  assert.deepEqual([titleOf(ui.value(), "a2"), titleOf(ui.value(), fresh)], ["Two", "fold"], "split at the caret");
  assert.equal(steps(), before + 1);
  assert.equal(ui.field()?.value, "fold", "the caret moved into the new item");
  await ui.key("Tab");
  assert.deepEqual(kids(ui.value().find((n) => n.id === "a").children, "a2"), [fresh], "Tab: a child of the item above");
  assert.equal(steps(), before + 2);
  assert.equal(ui.field()?.value, "fold", "still editing it");
  await ui.key("Tab", { shiftKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a2", fresh, "a3"], "Shift+Tab: back out");
  assert.equal(steps(), before + 3);
  await ui.act(() => ui.handle.current.undo());
  assert.deepEqual(kids(ui.value().find((n) => n.id === "a").children, "a2"), [fresh]);
  await ui.unmount();
});

test("keys: Tab on the first child cannot indent (nothing above it) and says so", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a1");
  await ui.key("Tab");
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a2", "a3"]);
  assert.match(ui.live(), /Can't indent here/);
  await ui.unmount();
});

/* ───────────── Duplicate ───────────── */

test("duplicate: the item menu's Duplicate copies the item and its children right after it (fresh ids, one step)", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const actions = ui.row("a3").querySelector('button[aria-label^="Actions for"]');
  assert.ok(actions, "the row's ⋯ button");
  await ui.act(() => {
    const down = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(down, "pointerType", { value: "mouse" });
    actions.dispatchEvent(down);
  });
  const entry = await waitFor(() => [...document.querySelectorAll("[role=menuitem]")].find((el) => el.textContent.trim().startsWith("Duplicate")));
  const before = ui.ol().state.history.past.length;
  await ui.act(() => entry.click());
  await ui.frames();
  const children = ui.value().find((n) => n.id === "a").children;
  assert.deepEqual(children.map((n) => n.text), ["One", "Twofold", "Three", "Three"]);
  const copy = children[3];
  assert.notEqual(copy.id, "a3", "a fresh id");
  assert.equal(copy.children[0].text, "Under three", "children travel");
  assert.notEqual(copy.children[0].id, "a3x", "with fresh ids too");
  assert.equal(ui.ol().state.history.past.length, before + 1, "one undo step");
  await ui.act(() => ui.handle.current.undo());
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a2", "a3"]);
  await ui.unmount();
});

/* ───────────── ⌘A twice ───────────── */

test("⌘A twice: the first is the title's own text, the second selects every row", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("a2");
  ui.field().setSelectionRange(1, 2);
  let event;
  await ui.act(() => {
    event = new window.KeyboardEvent("keydown", { key: "a", code: code("a"), metaKey: true, bubbles: true, cancelable: true });
    ui.field().dispatchEvent(event);
  });
  assert.equal(event.defaultPrevented, false, "the first ⌘A is the browser's: select the title's text");
  assert.ok(ui.field(), "still editing");
  assert.deepEqual(ui.selection(), [], "no rows selected yet");
  // The browser selected the whole title; a second ⌘A selects the rows.
  ui.field().setSelectionRange(0, ui.field().value.length);
  await ui.key("a", { metaKey: true, code: code("a") });
  assert.equal(ui.field(), null, "editing ended");
  assert.deepEqual(ui.selection().sort(), ui.ol().rows.map((r) => r.id).sort(), "every row is selected");
  assert.ok(ui.selection().length >= 8);
  await waitFor(() => /items selected/.test(ui.live()), 1000);
  await ui.unmount();
});

/* ───────────── Collapse all / Expand all ───────────── */

async function viewMenuEntry(ui, label) {
  const trigger = ui.container.querySelector("[data-view-menu-trigger]");
  await ui.act(() => {
    trigger.focus();
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  await ui.frames();
  return waitFor(() => [...document.querySelectorAll("[role=menu] [role=menuitem]")].find((el) => el.textContent.trim() === label));
}

test("collapse / expand all: the view menu folds every branch, then opens them all again", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["a"] });
  await ui.act(async () => (await viewMenuEntry(ui, "Collapse all")).click());
  await waitFor(() => ui.ol().rows.length === 3);
  assert.deepEqual(ui.ol().rows.map((r) => r.id), ["a", "b", "c"], "top level only");
  await ui.act(async () => (await viewMenuEntry(ui, "Expand all")).click());
  await waitFor(() => ui.ol().rows.some((r) => r.id === "b1x"));
  assert.deepEqual(ui.ol().rows.map((r) => r.id), ["a", "a1", "a2", "a3", "a3x", "b", "b1", "b1x", "c"], "everything open, the deepest too");
  await ui.unmount();
});

/* ───────────── Inline formatting keys ───────────── */

test("formatting keys: ⌘B ⌘I ⌘E ⇧⌘X ⇧⌘H wrap the selected words (one step), which stay selected", async () => {
  const cases = [
    ["b", {}, "make **this** bold"],
    // italic is written with its canonical `*` (the live field, titles and notes alike)
    ["i", {}, "make *this* bold"],
    ["e", {}, "make `this` bold"],
    ["x", { shiftKey: true }, "make ~~this~~ bold"],
    ["h", { shiftKey: true }, "make ==this== bold"],
  ];
  for (const [key, mods, expected] of cases) {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.edit("c");
    ui.field().setSelectionRange(5, 9);
    await ui.key(mods.shiftKey ? key.toUpperCase() : key, { metaKey: true, code: code(key), ...mods });
    assert.equal(titleOf(ui.value(), "c"), expected, `${mods.shiftKey ? "⇧" : ""}⌘${key.toUpperCase()}`);
    assert.equal(ui.ol().state.history.past.length, 1, "one undo step");
    await ui.frames();
    const field = ui.field();
    assert.equal(field.value.slice(field.selectionStart, field.selectionEnd), "this", "the words stay selected, inside the marks");
    await ui.unmount();
  }
});
