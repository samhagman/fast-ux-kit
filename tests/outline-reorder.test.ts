import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutlineCommand,
  applyOutlineTransaction,
  createOutlineEditorState,
  reduceOutlineEditor,
  type OutlineNode,
} from "../src/core/index.js";

const editable = { readOnly: false };
const fixture = (): readonly OutlineNode[] => [
  { id: "a", text: "Alpha", data: { retained: true }, children: [{ id: "a1", text: "Child" }] },
  { id: "b", text: "Beta" },
  { id: "c", text: "Gamma" },
];
const ids = (nodes: readonly OutlineNode[]) => nodes.map((node) => node.id);

test("reorder is one immutable sibling permutation preserving all node references", () => {
  const nodes = fixture();
  const result = applyOutlineCommand(
    nodes,
    { type: "reorder", parentId: null, ids: ["c", "a", "b"] },
    editable,
  );
  assert.ok(result.ok);
  assert.deepEqual(ids(result.nodes), ["c", "a", "b"]);
  assert.strictEqual(result.nodes[0], nodes[2]);
  assert.strictEqual(result.nodes[1], nodes[0]);
  assert.strictEqual(result.nodes[2], nodes[1]);
  assert.deepEqual(ids(nodes), ["a", "b", "c"]);
});

test("reorder rejects missing, duplicated, foreign and malformed IDs atomically", () => {
  const nodes = fixture();
  for (const invalid of [
    undefined,
    null,
    "abc",
    ["a", "b"],
    ["a", "a", "c"],
    ["a", "b", "a1"],
    ["a", "b", 3],
  ]) {
    const result = applyOutlineCommand(
      nodes,
      { type: "reorder", parentId: null, ids: invalid } as never,
      editable,
    );
    assert.equal(result.ok, false);
    assert.strictEqual(result.nodes, nodes);
    if (!result.ok) assert.equal(result.reason, "invalid-command");
  }
});

test("reorder cannot cross parents or silently use a missing parent", () => {
  const nodes = fixture();
  const missing = applyOutlineCommand(
    nodes,
    { type: "reorder", parentId: "missing", ids: [] },
    editable,
  );
  assert.deepEqual(missing, { ok: false, nodes, reason: "not-found" });
  const mixed = applyOutlineCommand(
    nodes,
    { type: "reorder", parentId: "a", ids: ["b"] },
    editable,
  );
  assert.deepEqual(mixed, { ok: false, nodes, reason: "invalid-command" });
  const malformed = applyOutlineCommand(
    nodes,
    { type: "reorder", ids: ["a", "b", "c"] } as never,
    editable,
  );
  assert.deepEqual(malformed, { ok: false, nodes, reason: "invalid-command" });
});

test("default reader gate refuses reorder including a nominal no-op", () => {
  const nodes = fixture();
  assert.deepEqual(
    applyOutlineCommand(nodes, { type: "reorder", parentId: null, ids: ["a", "b", "c"] }),
    { ok: false, nodes, reason: "read-only" },
  );
});

test("reorder never trusts caller-supplied array methods", () => {
  const nodes = fixture();
  const order = Object.assign(["c", "b", "a"], {
    map: () => {
      throw new Error("Caller method must not execute");
    },
    some: () => {
      throw new Error("Caller method must not execute");
    },
  });
  const result = applyOutlineCommand(
    nodes,
    { type: "reorder", parentId: null, ids: order },
    editable,
  );
  assert.ok(result.ok);
  assert.deepEqual(ids(result.nodes), ["c", "b", "a"]);
  assert.strictEqual(result.nodes[0], nodes[2]);
});

test("reorder rejects sparse or accessor IDs without executing metadata", () => {
  const nodes = fixture();
  const accessor = ["a", "b", "c"];
  Object.defineProperty(accessor, "1", {
    get: () => {
      throw new Error("Must not execute");
    },
  });
  for (const malformed of [new Array(3), new Array(1_000_000_000), accessor]) {
    const result = applyOutlineCommand(
      nodes,
      { type: "reorder", parentId: null, ids: malformed },
      editable,
    );
    assert.deepEqual(result, { ok: false, nodes, reason: "invalid-command" });
  }
  const command = {
    type: "reorder",
    parentId: null,
    get ids() {
      throw new Error("Must not execute");
    },
  };
  assert.deepEqual(applyOutlineCommand(nodes, command as never, editable), {
    ok: false,
    nodes,
    reason: "invalid-command",
  });
});

test("unchanged order and empty sibling lists preserve exact roots", () => {
  const nodes = fixture();
  for (const command of [
    { type: "reorder" as const, parentId: null, ids: ["a", "b", "c"] },
    { type: "reorder" as const, parentId: "b", ids: [] },
  ]) {
    const result = applyOutlineCommand(nodes, command, editable);
    assert.ok(result.ok);
    assert.strictEqual(result.nodes, nodes);
  }
});

test("reorder protects displaced locked siblings and locked descendants of moved roots", () => {
  const nodes = fixture();
  for (const locked of ["b", "a1"]) {
    const result = applyOutlineCommand(
      nodes,
      { type: "reorder", parentId: null, ids: ["c", "a", "b"] },
      { ...editable, isLocked: (node) => node.id === locked },
    );
    assert.deepEqual(result, { ok: false, nodes, reason: "locked" });
  }
});

test("a protected sibling may remain in place while independent siblings reorder", () => {
  const nodes = fixture();
  const result = applyOutlineCommand(
    nodes,
    { type: "reorder", parentId: null, ids: ["c", "b", "a"] },
    { ...editable, isLocked: (node) => node.id === "b" },
  );
  assert.ok(result.ok);
  assert.strictEqual(result.nodes[1], nodes[1]);
});

test("nested reorder clones only its ancestry and respects parent/ancestor locks", () => {
  const children = fixture();
  const nodes: readonly OutlineNode[] = [
    { id: "grand", text: "Grandparent", children: [{ id: "parent", text: "Parent", children }] },
    { id: "other", text: "Outside" },
  ];
  const command = { type: "reorder" as const, parentId: "parent", ids: ["c", "b", "a"] };
  const result = applyOutlineCommand(nodes, command, editable);
  assert.ok(result.ok);
  assert.notStrictEqual(result.nodes[0], nodes[0]);
  assert.strictEqual(result.nodes[1], nodes[1]);
  assert.strictEqual(result.nodes[0]!.children![0]!.children![0], children[2]);
  for (const locked of ["grand", "parent"])
    assert.deepEqual(
      applyOutlineCommand(nodes, command, { ...editable, isLocked: (node) => node.id === locked }),
      { ok: false, nodes, reason: "locked" },
    );
});

test("a later failed reorder rolls back an entire command transaction", () => {
  const nodes = fixture();
  const result = applyOutlineTransaction(
    nodes,
    [
      { type: "update", id: "a", changes: { text: "Changed" } },
      { type: "reorder", parentId: null, ids: ["a", "a", "b"] },
    ],
    editable,
  );
  assert.equal(result.ok, false);
  assert.strictEqual(result.nodes, nodes);
});

test("editor reorder retains caret and view state with one undoable revision", () => {
  const nodes = fixture();
  let state = createOutlineEditorState(nodes, { expandedIds: new Set() });
  state = reduceOutlineEditor(state, { type: "focus", id: "a", start: 2, end: 4 }, editable);
  const sorted = reduceOutlineEditor(
    state,
    { type: "transaction", commands: [{ type: "reorder", parentId: null, ids: ["c", "a", "b"] }] },
    editable,
  );
  assert.deepEqual(sorted.caret, state.caret);
  assert.deepEqual(sorted.expandedIds, state.expandedIds);
  assert.equal(sorted.revision, 1);
  assert.equal(sorted.history.past.length, 1);
  const undone = reduceOutlineEditor(sorted, { type: "undo" }, editable);
  assert.strictEqual(undone.nodes, nodes);
  assert.deepEqual(undone.caret, state.caret);
  const redone = reduceOutlineEditor(undone, { type: "redo" }, editable);
  assert.deepEqual(ids(redone.nodes), ["c", "a", "b"]);
});

test("editor no-op and whole-transition policy remain authoritative", () => {
  const nodes = fixture();
  const state = createOutlineEditorState(nodes);
  const unchanged = reduceOutlineEditor(
    state,
    { type: "transaction", commands: [{ type: "reorder", parentId: null, ids: ["a", "b", "c"] }] },
    editable,
  );
  assert.strictEqual(unchanged.nodes, nodes);
  assert.strictEqual(unchanged.history, state.history);
  assert.equal(unchanged.revision, 0);
  const refused = reduceOutlineEditor(
    state,
    { type: "transaction", commands: [{ type: "reorder", parentId: null, ids: ["c", "a", "b"] }] },
    { ...editable, canChange: () => false },
  );
  assert.strictEqual(refused.nodes, nodes);
  assert.equal(refused.refusal, "locked");
  assert.equal(refused.revision, 0);
});
