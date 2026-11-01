import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutlineEditorState,
  reduceOutlineEditor,
  type OutlineAction,
  type OutlineEditorState,
  type OutlineNode,
} from "../src/core/index.js";

// Edits keep the reader's target: the selection survives a content change (minus rows that no
// longer exist), and letting a selection go keeps the cursor row, so the next key still acts.

const edit = { readOnly: false };
const n = (id: string, text = id, children?: readonly OutlineNode[]): OutlineNode => ({
  id,
  text,
  ...(children ? { children } : {}),
});
const run = (state: OutlineEditorState, action: OutlineAction) =>
  reduceOutlineEditor(state, action, edit);
const tree = () => [
  n("a", "Alpha", [n("a1", "One"), n("a2", "Two"), n("a3", "Three")]),
  n("b", "Beta"),
];
const range = () => {
  let state = run(createOutlineEditorState(tree()), { type: "select", id: "a1" });
  state = run(state, { type: "select", id: "a3", extend: true });
  return state;
};

test("an edit keeps selection ∩ live ids and the range's fixed end", () => {
  const state = range();
  const toggled = run(state, { type: "tasks", ids: [...state.selection] });
  assert.deepEqual([...toggled.selection].sort(), ["a1", "a2", "a3"]);
  assert.equal(toggled.selectionAnchor, "a1", "the fixed end stays");
  assert.equal(toggled.caret?.id, "a3", "the cursor (moving end) stays");
  const again = run(toggled, { type: "tasks", ids: [...toggled.selection] });
  assert.deepEqual(
    again.nodes[0]!.children!.map((node) => node.checked),
    [false, false, false],
    "a second toggle on the same target reverses the first",
  );
  const transaction = run(state, {
    type: "transaction",
    commands: [{ type: "update", id: "a2", changes: { text: "Changed" } }],
  });
  assert.deepEqual([...transaction.selection].sort(), ["a1", "a2", "a3"]);
});

test("delete empties the selection (its rows are gone) and undo restores range and cursor", () => {
  const deleted = run(range(), { type: "delete" });
  assert.deepEqual([...deleted.selection], []);
  assert.equal(
    deleted.selectionAnchor,
    deleted.caret?.id,
    "anchor and cursor agree on the survivor",
  );
  const restored = run(deleted, { type: "undo" });
  assert.deepEqual([...restored.selection].sort(), ["a1", "a2", "a3"]);
  assert.equal(restored.caret?.id, "a3");
  assert.equal(restored.selectionAnchor, "a1");
});

test("clear-selection keeps the cursor: the anchor collapses onto the caret row", () => {
  const cleared = run(range(), { type: "clear-selection" });
  assert.deepEqual([...cleared.selection], []);
  assert.equal(cleared.caret?.id, "a3");
  assert.equal(cleared.selectionAnchor, "a3", "a range collapses onto its moving end");
  // Nothing to collapse onto (no caret): a live anchor survives.
  const bare = {
    ...createOutlineEditorState(tree()),
    selection: new Set(["b"]),
    selectionAnchor: "b",
  };
  assert.equal(run(bare, { type: "clear-selection" }).selectionAnchor, "b");
});

test("whole-item paste and replacement still reset the selection", () => {
  const pasted = run(range(), {
    type: "paste-nodes",
    afterId: "b",
    nodes: [n("p", "Pasted")],
    createId: () => "p1",
  });
  assert.deepEqual([...pasted.selection], [], "paste lands the caret on what was pasted");
  assert.equal(pasted.caret?.id, "p1");
  assert.equal(pasted.selectionAnchor, "p1");
  const replaced = run(range(), { type: "replace", nodes: tree() });
  assert.deepEqual([...replaced.selection], []);
  assert.equal(replaced.selectionAnchor, null);
});
