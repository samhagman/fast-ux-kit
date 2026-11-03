import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutlineEditorState,
  reduceOutlineEditor,
  type OutlineAction,
  type OutlineEditorState,
  type OutlineNode,
} from "../src/core/index.js";

// Indent is all or nothing. A range whose first item has nothing above it at its level
// stays exactly where it is (like that item alone would), instead of the rest tucking under it.

const edit = { readOnly: false };
const n = (id: string, children?: readonly OutlineNode[]): OutlineNode => ({
  id,
  text: id,
  ...(children ? { children } : {}),
});
const run = (state: OutlineEditorState, action: OutlineAction) =>
  reduceOutlineEditor(state, action, edit);
const tree = () => [n("p", [n("a"), n("b"), n("c")]), n("q")];
const shape = (nodes: readonly OutlineNode[]): unknown =>
  nodes.map((node) => (node.children?.length ? { [node.id]: shape(node.children) } : node.id));
const ranged = (from: string, to: string) => {
  let state = run(createOutlineEditorState(tree()), { type: "select", id: from });
  state = run(state, { type: "select", id: to, extend: true });
  return state;
};

test("a range starting at a first child does not indent at all", () => {
  const state = ranged("a", "c");
  const after = run(state, { type: "indent" });
  assert.equal(after.nodes, state.nodes, "the document is unchanged (no partial indent)");
  assert.equal(after.refusal, null, "a no-op, as for the single item: not a policy refusal");
  assert.equal(after.history.past.length, state.history.past.length, "no undo step");
  assert.deepEqual([...after.selection].sort(), ["a", "b", "c"], "the range stays the target");
});

test("the single first child is the same no-op", () => {
  const state = run(createOutlineEditorState(tree()), { type: "select", id: "a" });
  assert.equal(run(state, { type: "indent" }).nodes, state.nodes);
});

test("a range with an item above it indents whole, as one undo step", () => {
  const state = ranged("b", "c");
  const after = run(state, { type: "indent" });
  assert.deepEqual(shape(after.nodes), [{ p: [{ a: ["b", "c"] }] }, "q"]);
  assert.equal(after.history.past.length, state.history.past.length + 1);
  assert.deepEqual(shape(run(after, { type: "undo" }).nodes), shape(tree()));
});

test("explicit ids: any root that cannot indent keeps every root in place", () => {
  const state = createOutlineEditorState(tree());
  assert.equal(run(state, { type: "indent", ids: ["a", "c"] }).nodes, state.nodes);
  assert.equal(
    run(state, { type: "indent", ids: ["p", "q"] }).nodes,
    state.nodes,
    "top level: the first item has nothing above it",
  );
  assert.deepEqual(shape(run(state, { type: "indent", ids: ["b", "q"] }).nodes), [
    { p: [{ a: ["b"] }, "c", "q"] },
  ]);
});

// Outdent moves what can move. An item already at the outermost level stays, and the
// selected items under it go out a level instead.

test("a range from a top-level item into its children: the children go out a level, the top stays", () => {
  const state = ranged("p", "c");
  const after = run(state, { type: "outdent" });
  assert.deepEqual(shape(after.nodes), ["p", "a", "b", "c", "q"]);
  assert.equal(after.history.past.length, state.history.past.length + 1, "one undo step");
  assert.deepEqual([...after.selection].sort(), ["a", "b", "c", "p"], "the range stays the target");
  assert.deepEqual(shape(run(after, { type: "undo" }).nodes), shape(tree()));
});

test("outdent: only the selected children of a stuck item move; unselected ones stay under it", () => {
  const state = createOutlineEditorState(tree());
  const after = run(state, { type: "outdent", ids: ["p", "b"] });
  assert.deepEqual(
    shape(after.nodes),
    [{ p: ["a"] }, { b: ["c"] }, "q"],
    "b goes out, adopting its younger sibling as always",
  );
});

test("outdent: a range of top-level items alone is a no-op", () => {
  const state = ranged("p", "q");
  const after = run(createOutlineEditorState(state.nodes), { type: "outdent", ids: ["p", "q"] });
  assert.equal(after.nodes, state.nodes);
});

test("outdent: zoomed in, the zoomed item's children stay and their selected children go out", () => {
  let state = createOutlineEditorState([n("z", [n("p", [n("a"), n("b")])])]);
  state = run(state, { type: "hoist", id: "z" });
  const after = run(state, { type: "outdent", ids: ["p", "a", "b"] });
  assert.deepEqual(shape(after.nodes), [{ z: ["p", "a", "b"] }]);
});
