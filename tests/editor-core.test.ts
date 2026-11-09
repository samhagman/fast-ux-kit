import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutlineCommand,
  createOutlineEditorState,
  editorVisibleRows,
  exportOutlineJSON,
  findOutlineNode,
  importOutlineJSON,
  indentOutlineNode,
  moveOutlineNode,
  moveOutlineSelection,
  outdentOutlineNode,
  parseOutlineText,
  planOutlineDrop,
  reduceOutlineEditor,
  reconcileOutlineEditorState,
  selectionRoots,
  serializeOutlineText,
  type OutlineNode,
  type OutlineAction,
  type OutlineEditorState,
} from "../src/core/index.js";
const edit = { readOnly: false };
const n = (id: string, text = id, children?: readonly OutlineNode[]): OutlineNode => ({
  id,
  text,
  ...(children ? { children } : {}),
});
const ids = (nodes: readonly OutlineNode[]) => nodes.map((node) => node.id);
const run = (state: OutlineEditorState, action: OutlineAction) =>
  reduceOutlineEditor(state, action, edit);
const tree = () => [
  n("a", "Alpha", [n("a1", "One", [n("a1x", "Deep")]), n("a2", "Two"), n("a3", "Three")]),
  n("b", "Beta"),
  n("c", "Gamma"),
];

test("runtime command guards reject malformed payloads without throwing or changing roots", () => {
  const nodes = tree();
  for (const invalid of [
    null,
    undefined,
    42,
    [],
    {},
    { type: "update", id: "a" },
    { type: "update", id: "a", changes: null },
    { type: "move", id: "a" },
    { type: "update", id: 42, changes: {} },
    { type: "update", id: "a", changes: { checked: "yes" } },
  ]) {
    const result = applyOutlineCommand(nodes, invalid as never, edit);
    assert.equal(result.ok, false);
    assert.strictEqual(result.nodes, nodes);
  }
});
test("split at zero inserts before, retaining original text, descendants and caret", () => {
  const nodes = tree(),
    state = createOutlineEditorState(nodes);
  const next = run(state, { type: "split", id: "a", start: 0, newId: "blank" });
  assert.deepEqual(ids(next.nodes), ["blank", "a", "b", "c"]);
  assert.strictEqual(next.nodes[1], nodes[0]);
  assert.deepEqual(next.caret, { id: "a", start: 0, end: 0 });
});
test("split expanded parent inserts first child, collapsed parent next sibling, and deletes selected text", () => {
  const nodes = tree();
  const expanded = run(createOutlineEditorState(nodes), {
    type: "split",
    id: "a",
    start: 2,
    end: 4,
    newId: "new",
  });
  assert.equal(expanded.nodes[0]!.text, "Al");
  assert.equal(expanded.nodes[0]!.children![0]!.text, "a");
  assert.deepEqual(ids(expanded.nodes[0]!.children!), ["new", "a1", "a2", "a3"]);
  const collapsed = run(createOutlineEditorState(nodes, { expandedIds: new Set() }), {
    type: "split",
    id: "a",
    start: 2,
    newId: "new",
  });
  assert.deepEqual(ids(collapsed.nodes), ["a", "new", "b", "c"]);
  assert.equal(collapsed.nodes[1]!.text, "pha");
  assert.strictEqual(collapsed.nodes[0]!.children, nodes[0]!.children);
});
test("Return on empty final child lifts it; outdent adopts younger siblings after existing children", () => {
  const empty = createOutlineEditorState([n("p", "Parent", [n("x", "X"), n("empty", "")])]);
  assert.deepEqual(
    ids(run(empty, { type: "split", id: "empty", start: 0, newId: "unused" }).nodes),
    ["p", "empty"],
  );
  const nodes = tree(),
    result = outdentOutlineNode(nodes, "a1", edit);
  assert.ok(result.ok);
  assert.deepEqual(ids(result.nodes), ["a", "a1", "b", "c"]);
  assert.deepEqual(ids(findOutlineNode(result.nodes, "a1")!.node.children!), ["a1x", "a2", "a3"]);
  assert.equal(findOutlineNode(result.nodes, "a")!.node.children!.length, 0);
  assert.deepEqual(ids(nodes[0]!.children!), ["a1", "a2", "a3"]);
});
test("indent makes previous sibling the parent and cannot indent first sibling", () => {
  const nodes = tree(),
    result = indentOutlineNode(nodes, "b", edit);
  assert.ok(result.ok);
  assert.deepEqual(ids(result.nodes), ["a", "c"]);
  assert.equal(findOutlineNode(result.nodes, "b")!.parentId, "a");
  const first = indentOutlineNode(nodes, "a", edit);
  assert.ok(first.ok);
  assert.strictEqual(first.nodes, nodes);
});
test("move crosses first/last child boundaries through uncles, otherwise promotes before/after parent", () => {
  const nodes = [n("u", "U", [n("u1")]), n("p", "P", [n("x"), n("y")]), n("v", "V", [n("v1")])];
  const up = moveOutlineNode(nodes, "x", "up", edit);
  assert.ok(up.ok);
  assert.deepEqual(ids(up.nodes[0]!.children!), ["u1", "x"]);
  const down = moveOutlineNode(nodes, "y", "down", edit);
  assert.ok(down.ok);
  assert.deepEqual(ids(down.nodes[2]!.children!), ["y", "v1"]);
  const isolated = [n("p", "P", [n("x"), n("y")])];
  const before = moveOutlineNode(isolated, "x", "up", edit);
  assert.ok(before.ok);
  assert.deepEqual(ids(before.nodes), ["x", "p"]);
  const after = moveOutlineNode(isolated, "y", "down", edit);
  assert.ok(after.ok);
  assert.deepEqual(ids(after.nodes), ["p", "y"]);
});
test("contiguous multiroot move preserves order and hoist boundary", () => {
  const nodes = [n("a"), n("b"), n("c"), n("d")];
  const down = moveOutlineSelection(nodes, ["b", "c"], "down", edit);
  assert.ok(down.ok);
  assert.deepEqual(ids(down.nodes), ["a", "d", "b", "c"]);
  const up = moveOutlineSelection(nodes, ["b", "c"], "up", edit);
  assert.ok(up.ok);
  assert.deepEqual(ids(up.nodes), ["b", "c", "a", "d"]);
  const scope = tree(),
    blocked = moveOutlineSelection(scope, ["a1"], "up", edit, "a");
  assert.ok(blocked.ok);
  assert.strictEqual(blocked.nodes, scope);
});
test("merge with parent lifts removed child's descendants into its position, never loses hidden children", () => {
  const state = createOutlineEditorState(tree());
  const next = run(state, { type: "merge", id: "a1", direction: "backward" });
  assert.equal(next.nodes[0]!.text, "AlphaOne");
  assert.deepEqual(ids(next.nodes[0]!.children!), ["a1x", "a2", "a3"]);
  assert.deepEqual(next.caret, { id: "a", start: 5, end: 5 });
  assert.equal(findOutlineNode(next.nodes, "a1"), undefined);
});
test("merge across siblings appends children and refuses silent loss of rich metadata", () => {
  const nodes = [
    n("left", "Hi", [n("old")]),
    { ...n("right", " there", [n("child")]), data: { blocks: ["image"] } },
  ];
  const state = createOutlineEditorState(nodes, { expandedIds: new Set() });
  const refused = run(state, { type: "merge", id: "right", direction: "backward" });
  assert.equal(refused.refusal, "invalid-command");
  assert.strictEqual(refused.nodes, nodes);
  const next = reduceOutlineEditor(
    state,
    { type: "merge", id: "right", direction: "backward" },
    { ...edit, mergeData: (left, right) => ({ left: left.data, right: right.data }) },
  );
  assert.equal(next.nodes[0]!.text, "Hi there");
  assert.deepEqual(ids(next.nodes[0]!.children!), ["old", "child"]);
});
test("typing groups, structural transactions split history, and undo retains reader folds", () => {
  let state = createOutlineEditorState(tree());
  state = run(state, { type: "text", id: "b", text: "B", time: 100 });
  state = run(state, { type: "text", id: "b", text: "Be", time: 200 });
  state = run(state, { type: "text", id: "b", text: "Bet", time: 300 });
  assert.equal(state.history.past.length, 1);
  state = run(state, { type: "toggle", id: "a" });
  assert.equal(state.expandedIds.has("a"), false);
  state = run(state, { type: "undo" });
  assert.equal(findOutlineNode(state.nodes, "b")!.node.text, "Beta");
  assert.equal(state.expandedIds.has("a"), false);
  state = run(state, { type: "redo" });
  assert.equal(findOutlineNode(state.nodes, "b")!.node.text, "Bet");
  state = run(state, { type: "split", id: "b", start: 3, newId: "fresh" });
  assert.equal(state.history.past.length, 2);
  state = run(state, { type: "undo" });
  assert.equal(findOutlineNode(state.nodes, "fresh"), undefined);
});
test("reader refuses every content action including root insert/history/replacement but allows view navigation", () => {
  const initial = createOutlineEditorState(tree()),
    edited = run(initial, { type: "text", id: "b", text: "Changed" });
  const actions: OutlineAction[] = [
    { type: "text", id: "a", text: "No" },
    { type: "split", id: "a", start: 1, newId: "no" },
    { type: "merge", id: "b", direction: "backward" },
    { type: "insert", id: "no" },
    { type: "delete", ids: ["a"] },
    { type: "indent", ids: ["b"] },
    { type: "outdent", ids: ["a1"] },
    { type: "move", ids: ["b"], direction: "up" },
    { type: "drop", ids: ["b"], parentId: "a", index: 0 },
    { type: "paste", id: "a", start: 0, text: "No", createId: () => "no" },
    { type: "paste-nodes", afterId: "a", nodes: [n("copy")], createId: () => "no" },
    { type: "tasks", ids: ["a", "b"] },
    { type: "task", id: "a" },
    { type: "undo" },
    { type: "redo" },
    { type: "replace", nodes: [] },
  ];
  for (const action of actions) {
    const next = reduceOutlineEditor(edited, action);
    assert.strictEqual(next.nodes, edited.nodes);
    assert.equal(next.refusal, "read-only");
  }
  const folded = reduceOutlineEditor(edited, { type: "toggle", id: "a" });
  assert.strictEqual(folded.nodes, edited.nodes);
  assert.equal(folded.revision, edited.revision);
  assert.deepEqual(
    ids(reduceOutlineEditor(createOutlineEditorState([]), { type: "insert", id: "no" }).nodes),
    [],
  );
});
test("whole-transition policy and locks reject atomically including adoption, selection deletion and undo", () => {
  const nodes = tree(),
    state = createOutlineEditorState(nodes);
  const options = { ...edit, isLocked: (node: OutlineNode) => node.id === "a3" };
  const rejected = reduceOutlineEditor(state, { type: "outdent", ids: ["a1"] }, options);
  assert.strictEqual(rejected.nodes, nodes);
  assert.equal(rejected.refusal, "locked");
  const batch = reduceOutlineEditor(state, { type: "delete", ids: ["b", "a"] }, options);
  assert.strictEqual(batch.nodes, nodes);
  const edited = run(state, { type: "text", id: "b", text: "New" });
  assert.equal(
    reduceOutlineEditor(edited, { type: "undo" }, { ...edit, canChange: () => false }).refusal,
    "locked",
  );
});
test("undo restores a deleted neighbour of a locked item while reordering it stays refused", () => {
  const options = { ...edit, isLocked: (node: OutlineNode) => node.id === "c" };
  const nodes = [n("a", "A", [n("a1")]), n("b"), n("c", "Locked", [n("c1")])];
  let state = createOutlineEditorState(nodes);
  state = reduceOutlineEditor(state, { type: "delete", ids: ["a"] }, options);
  assert.deepEqual(ids(state.nodes), ["b", "c"]);
  const restored = reduceOutlineEditor(state, { type: "undo" }, options);
  assert.equal(restored.refusal, null);
  assert.deepEqual(ids(restored.nodes), ["a", "b", "c"]);
  const redone = reduceOutlineEditor(restored, { type: "redo" }, options);
  assert.deepEqual(ids(redone.nodes), ["b", "c"]);
  const reordered = reduceOutlineEditor(
    createOutlineEditorState(nodes),
    { type: "replace", nodes: [nodes[2]!, nodes[0]!, nodes[1]!] },
    options,
  );
  assert.equal(reordered.refusal, "locked");
});
test("hoist/breadcrumb state, collapse focus recovery, selection roots and view-only revisions", () => {
  let state = createOutlineEditorState(tree());
  state = run(state, { type: "focus", id: "a1x", start: 2 });
  state = run(state, { type: "toggle", id: "a1" });
  assert.equal(state.caret!.id, "a1");
  state = run(state, { type: "hoist", id: "a" });
  assert.deepEqual(
    editorVisibleRows(state).map((row) => row.id),
    ["a", "a1", "a2", "a3"],
  );
  state = run(state, { type: "hoist", id: null });
  assert.equal(editorVisibleRows(state).at(-1)!.id, "c");
  assert.equal(state.revision, 0);
  assert.deepEqual(selectionRoots(state.nodes, new Set(["a", "a1", "a1x", "b"])), ["a", "b"]);
});
test("multiline paste preserves prefix/suffix, hierarchy and creates one undo step", () => {
  let count = 0;
  const state = createOutlineEditorState([n("a", "before AFTER")]);
  const next = run(state, {
    type: "paste",
    id: "a",
    start: 7,
    end: 12,
    text: "First\n  Child\nSecond",
    createId: () => `p${count++}`,
  });
  assert.equal(next.nodes[0]!.text, "before First");
  assert.equal(next.nodes[0]!.children![0]!.text, "Child");
  assert.equal(next.nodes[1]!.text, "Second");
  assert.equal(next.history.past.length, 1);
  assert.strictEqual(run(next, { type: "undo" }).nodes, state.nodes);
});
test("drop uses post-removal gap and never adopts untouched row below", () => {
  const nodes = [n("a"), n("b"), n("c"), n("d")];
  const target = planOutlineDrop(nodes, ids(nodes), ["b", "c"], 2, 0)!;
  assert.deepEqual(target, { parentId: null, index: 2, depth: 0 });
  const next = run(createOutlineEditorState(nodes), {
    type: "drop",
    ids: ["b", "c"],
    parentId: target.parentId,
    index: target.index,
  });
  assert.deepEqual(ids(next.nodes), ["a", "d", "b", "c"]);
  const nested = planOutlineDrop(nodes, ids(nodes), ["b"], 1, 1)!;
  assert.deepEqual(nested, { parentId: "a", index: 0, depth: 1 });
  const dropped = run(createOutlineEditorState(nodes), { type: "drop", ids: ["b"], ...nested });
  assert.deepEqual(ids(dropped.nodes), ["a", "c", "d"]);
  assert.deepEqual(ids(dropped.nodes[0]!.children!), ["b"]);
});
test("text codec uses indentation changes, task markers, line ending normalization and hidden exports", () => {
  let count = 0;
  const nodes = parseOutlineText("- Parent\r\n   - [x] Child\r\n       grandchild\n\n- [ ] Next", {
    createId: () => String(++count),
  });
  assert.equal(nodes[0]!.children![0]!.checked, true);
  assert.equal(nodes[0]!.children![0]!.children![0]!.text, "grandchild");
  assert.equal(nodes[1]!.checked, false);
  assert.equal(
    serializeOutlineText(nodes),
    "- Parent\n  - [x] Child\n    - grandchild\n- [ ] Next",
  );
});
test("versioned JSON roundtrips serializable metadata and rejects lossy values", () => {
  const nodes = [
    {
      ...n("a", "Line one\nLine two"),
      checked: false,
      data: { blocks: [{ kind: "markdown", source: "# Hello" }] },
    },
  ];
  assert.deepEqual(importOutlineJSON(exportOutlineJSON(nodes)), { version: 1, nodes });
  for (const data of [
    { x: undefined },
    [undefined],
    { fn: () => 1 },
    { n: NaN },
    new Date(),
    { big: 1n },
  ])
    assert.throws(() => exportOutlineJSON([{ ...n("a"), data }]), /JSON/);
  assert.throws(() => importOutlineJSON('{"version":2,"nodes":[]}'), /version/);
});

test("selected task toggles are one transaction and reject mixed protected selection atomically", () => {
  const state = createOutlineEditorState([
    { ...n("a"), checked: false },
    { ...n("b"), checked: true },
  ]);
  const next = run(state, { type: "tasks", ids: ["a", "b"] });
  assert.deepEqual(
    next.nodes.map((node) => node.checked),
    [true, false],
  );
  assert.equal(next.history.past.length, 1);
  const blocked = reduceOutlineEditor(
    state,
    { type: "tasks", ids: ["a", "b"] },
    { ...edit, isLocked: (node) => node.id === "b" },
  );
  assert.strictEqual(blocked.nodes, state.nodes);
  assert.equal(blocked.history.past.length, 0);
});
test("structured clipboard insertion regenerates every ID and preserves rich blocks/collapsed descendants", () => {
  const source = [
    {
      ...n("rich", "Rich", [n("child", "Hidden")]),
      data: { content: { kind: "markdown", source: "# Exact\r\n\n" } },
    },
  ];
  let count = 0;
  const state = createOutlineEditorState([n("target")]);
  const next = run(state, {
    type: "paste-nodes",
    afterId: "target",
    nodes: source,
    createId: () => `copy-${++count}`,
  });
  assert.notEqual(next.nodes[1]!.id, "rich");
  assert.notEqual(next.nodes[1]!.children![0]!.id, "child");
  assert.deepEqual(next.nodes[1]!.data, source[0]!.data);
  assert.equal(next.history.past.length, 1);
  assert.equal(
    reduceOutlineEditor(state, {
      type: "paste-nodes",
      afterId: "target",
      nodes: source,
      createId: () => "none",
    }).refusal,
    "read-only",
  );
});
test("canonical export rejects symbol/hidden/accessor/sparse data instead of silently changing it", () => {
  const getter = Object.defineProperty({}, "secret", {
    enumerable: true,
    get() {
      throw new Error("Must not execute");
    },
  });
  const hidden = Object.defineProperty({}, "secret", { enumerable: false, value: 1 });
  const values = [
    { [Symbol("secret")]: 1 },
    getter,
    hidden,
    new Array(3),
    [1, , 3],
    { number: -0 },
  ];
  for (const data of values) assert.throws(() => exportOutlineJSON([{ ...n("a"), data }]), /JSON/);
  assert.throws(
    () =>
      importOutlineJSON(
        JSON.stringify({
          version: 1,
          nodes: [n("a")],
          extra: Array.from({ length: 100_001 }, () => 0),
        }),
      ),
    /budget/,
  );
});
test("bulk expansion honors hoisted scope and explicit reveal escapes an unrelated hoist", () => {
  const nodes = [n("a", "A", [n("a1")]), n("b", "B", [n("b1")])];
  let state = createOutlineEditorState(nodes, { hoistedId: "a" });
  state = run(state, { type: "expand-all", expanded: false });
  assert.equal(state.expandedIds.has("a"), false);
  assert.equal(state.expandedIds.has("b"), true);
  state = run(state, { type: "reveal", id: "b1" });
  assert.equal(state.hoistedId, null);
  assert.equal(state.caret!.id, "b1");
});

test("every successful canonical export fits the import length/count/depth budgets", () => {
  const tooMany = [{ ...n("a"), data: Array(99_995).fill(0) }];
  assert.throws(() => exportOutlineJSON(tooMany), /budget/);
  assert.throws(() => exportOutlineJSON([{ ...n("a"), data: "x".repeat(8_000_000) }]), /budget/);
  const within = [{ ...n("a"), data: Array(99_980).fill(0) }];
  assert.deepEqual(importOutlineJSON(exportOutlineJSON(within)).nodes, within);
});

test("folded selection and history restoration never retain hidden interaction targets", () => {
  let state = run(createOutlineEditorState(tree()), { type: "select", id: "a1x" });
  state = run(state, { type: "text", id: "a1x", text: "Updated" });
  state = run(state, { type: "expand", ids: ["a"], expanded: false });
  const undone = run(state, { type: "undo" });
  assert.equal(undone.expandedIds.has("a"), false);
  assert.equal(undone.caret?.id, "a");
  assert.deepEqual([...undone.selection], ["a"]);
  assert.equal(undone.selectionAnchor, "a");
});

test("hoisting repairs outside focus, and host replacement clamps surviving carets", () => {
  let state = run(createOutlineEditorState(tree()), { type: "focus", id: "c", start: 5 });
  state = run(state, { type: "hoist", id: "a" });
  assert.equal(state.caret?.id, "a");
  assert.equal(state.history.past.length, 0);
  const changed = reconcileOutlineEditorState(state, [n("a", "X")]);
  assert.deepEqual(changed.caret, { id: "a", start: 0, end: 0 });
  const focused = run(changed, { type: "focus", id: "a", start: 1 });
  const replaced = reconcileOutlineEditorState(focused, [n("a", "")]);
  assert.deepEqual(replaced.caret, { id: "a", start: 0, end: 0 });
});

test("custom command transactions are atomic, undoable and obey global and whole-transition policy", () => {
  const original = createOutlineEditorState(tree());
  const action: OutlineAction = {
    type: "transaction",
    commands: [
      { type: "update", id: "a", changes: { data: { tag: "review" } } },
      { type: "update", id: "b", changes: { text: "Tagged" } },
    ],
    caret: { id: "b", start: 99, end: 99 },
  };
  const next = run(original, action);
  assert.equal(next.history.past.length, 1);
  assert.deepEqual(next.caret, { id: "b", start: 6, end: 6 });
  assert.strictEqual(run(next, { type: "undo" }).nodes, original.nodes);
  for (const policy of [
    {},
    { ...edit, isLocked: (node: OutlineNode) => node.id === "b" },
    { ...edit, canChange: () => false },
  ]) {
    const refused: OutlineEditorState = reduceOutlineEditor(original, action, policy);
    assert.strictEqual(refused.nodes, original.nodes);
    assert.equal(refused.history.past.length, 0);
  }
});

test("caret relocation breaks a typing burst while plain paste remains its own history step", () => {
  let state = run(createOutlineEditorState([n("a", "")]), {
    type: "text",
    id: "a",
    text: "a",
    time: 1,
  });
  state = run(state, { type: "text", id: "a", text: "ab", time: 2 });
  assert.equal(state.history.past.length, 1);
  state = run(state, { type: "caret", id: "a", start: 0, end: 0 });
  state = run(state, { type: "text", id: "a", text: "Xab", caret: 1, time: 3 });
  assert.equal(state.history.past.length, 2);
  state = run(state, { type: "paste", id: "a", start: 1, text: "Y", createId: () => "unused" });
  assert.equal(state.history.past.length, 3);
  assert.equal(run(state, { type: "undo" }).nodes[0]?.text, "Xab");
});

test("scope-root split and structured paste stay inside the hoist, never create invisible siblings", () => {
  const initial = createOutlineEditorState([n("before"), n("scope", "Scope"), n("after")], {
    hoistedId: "scope",
  });
  const split = run(initial, { type: "split", id: "scope", start: 2, newId: "child" });
  assert.deepEqual(ids(split.nodes), ["before", "scope", "after"]);
  assert.deepEqual(ids(findOutlineNode(split.nodes, "scope")!.node.children!), ["child"]);
  assert.equal(split.caret?.id, "child");
  const above = run(initial, { type: "split", id: "scope", start: 0, newId: "blank" });
  assert.deepEqual(ids(above.nodes), ["before", "scope", "after"]);
  assert.equal(findOutlineNode(above.nodes, "blank")?.parentId, "scope");
  const paste = run(initial, {
    type: "paste-nodes",
    afterId: "scope",
    nodes: [n("incoming")],
    createId: () => "copy",
  });
  assert.equal(findOutlineNode(paste.nodes, "copy")?.parentId, "scope");
  const text = run(initial, {
    type: "paste",
    id: "scope",
    start: 5,
    text: "A\nB",
    createId: (() => {
      let id = 0;
      return () => `paste-${id++}`;
    })(),
  });
  assert.equal(findOutlineNode(text.nodes, text.caret!.id)?.parentId, "scope");
});

test("focus cannot target an unrelated hoist; reveal can, but a missing reveal preserves scope", () => {
  const state = createOutlineEditorState(tree(), { hoistedId: "a" });
  assert.equal(run(state, { type: "focus", id: "b" }).refusal, "invalid-command");
  assert.equal(run(state, { type: "reveal", id: "b" }).hoistedId, null);
  const missing = run(state, { type: "reveal", id: "missing" });
  assert.equal(missing.hoistedId, "a");
  assert.equal(missing.refusal, "not-found");
});

test("canonical import refuses overflowing and negative-zero JSON numbers", () => {
  for (const value of ["1e400", "-0"])
    assert.throws(
      () => importOutlineJSON(`{"version":1,"nodes":[{"id":"a","text":"A","data":${value}}]}`),
      /round-trip/,
    );
});

test("malformed runtime editor actions refuse atomically rather than throwing across every action family", () => {
  const initial = createOutlineEditorState(tree());
  const malformed: unknown[] = [
    null,
    undefined,
    [],
    {},
    { type: "unknown" },
    { type: "text", id: "a", text: null },
    { type: "split", id: "a" },
    { type: "paste", id: "a", start: 0, text: "text" },
    { type: "paste-nodes", afterId: "a", nodes: null },
    { type: "tasks" },
    { type: "delete", ids: "a" },
    { type: "expand", ids: null, expanded: true },
    { type: "expand-all", expanded: true, depth: -1 },
    { type: "expand-all", expanded: true, depth: 1.5 },
    { type: "drop", ids: ["a"], parentId: null },
    { type: "transaction" },
    { type: "transaction", commands: [], caret: {} },
    { type: "caret", id: "a", start: NaN, end: 0 },
    { type: "move", direction: "sideways" },
    { type: "merge", id: "a", direction: "sideways" },
    { type: "task", id: "a", checked: "yes" },
  ];
  for (const action of malformed) {
    const next = reduceOutlineEditor(initial, action as OutlineAction, edit);
    assert.equal(next.refusal, "invalid-command", JSON.stringify(action));
    assert.strictEqual(next.nodes, initial.nodes);
    assert.strictEqual(next.history, initial.history);
    assert.strictEqual(next.caret, initial.caret);
  }
});

test("outdent and empty-final-child Return cannot escape a hoisted parent", () => {
  const state = createOutlineEditorState([n("scope", "Scope", [n("child", "")]), n("outside")], {
    hoistedId: "scope",
  });
  for (const action of [
    { type: "outdent", ids: ["child"] },
    { type: "split", id: "child", start: 0, newId: "new" },
  ] as const) {
    const next = run(state, action);
    assert.strictEqual(next.nodes, state.nodes);
    assert.equal(next.hoistedId, "scope");
  }
});

test("readable import handles mixed tab stops, whitespace markers, empty list items and literal brackets", () => {
  let count = 0;
  const nodes = parseOutlineText(
    "Parent\n  - First\n\t+\tPeer\n- \n- [ ] \n- [x]literal\n3)   Last",
    { createId: () => `parse-${count++}` },
  );
  assert.deepEqual(
    nodes[0]!.children!.map((node) => node.text),
    ["First", "Peer"],
  );
  assert.equal(nodes[1]!.text, "");
  assert.equal(nodes[2]!.text, "");
  assert.equal(nodes[2]!.checked, false);
  assert.equal(nodes[3]!.text, "[x]literal");
  assert.equal(nodes[3]!.checked, undefined);
  assert.equal(nodes[4]!.text, "Last");
  const four = parseOutlineText("Parent\n    First\n\tPeer", { spacesPerLevel: 4 });
  assert.deepEqual(
    four[0]!.children!.map((node) => node.text),
    ["First", "Peer"],
  );
});

test("same-place drops and net-zero extension transactions do not create phantom history or revisions", () => {
  const state = createOutlineEditorState(tree());
  const dropped = run(state, { type: "drop", ids: ["b", "c"], parentId: null, index: 1 });
  assert.strictEqual(dropped.nodes, state.nodes);
  assert.equal(dropped.history.past.length, 0);
  assert.equal(dropped.revision, 0);
  const transaction = run(state, {
    type: "transaction",
    commands: [
      { type: "update", id: "b", changes: { text: "Temporary" } },
      { type: "update", id: "b", changes: { text: "Beta" } },
    ],
  });
  assert.strictEqual(transaction.nodes, state.nodes);
  assert.equal(transaction.history.past.length, 0);
  assert.equal(transaction.revision, 0);
});

test("structural moves preserve a viable range anchor and prune selection hidden by a host-directed drop", () => {
  const nodes = [n("a"), n("b"), n("parent", "Parent", [n("target", "Target", [n("leaf")])])];
  let state = run(createOutlineEditorState(nodes, { expandedIds: new Set() }), {
    type: "select",
    id: "a",
  });
  state = run(state, { type: "select", id: "b", extend: true });
  const reordered = run(state, { type: "move", direction: "down" });
  assert.equal(reordered.selectionAnchor, "a");
  const dropped = run(state, { type: "drop", ids: ["a", "b"], parentId: "target", index: 0 });
  assert.equal(dropped.caret?.id, "parent");
  assert.deepEqual([...dropped.selection], ["parent"]);
  assert.equal(dropped.expandedIds.has("parent"), false);
});

test("single-line and multiline paste retain the original intent at whole-transition policy", () => {
  const state = createOutlineEditorState([n("a", "Before")]);
  const seen: string[] = [];
  for (const text of ["One", "One\nTwo"]) {
    let id = 0;
    const action: OutlineAction = {
      type: "paste",
      id: "a",
      start: 0,
      text,
      createId: () => `paste-${id++}`,
    };
    const next = reduceOutlineEditor(state, action, {
      ...edit,
      canChange: (_before, _after, intent) => {
        seen.push(intent.type);
        return intent.type !== "paste";
      },
    });
    assert.strictEqual(next.nodes, state.nodes);
    assert.equal(next.refusal, "locked");
  }
  assert.deepEqual(seen, ["paste", "paste"]);
});

test("split with source halves keeps placement, records one step and refuses a changed base", () => {
  const title = "Ship **beta** now";
  const halves = { left: "Ship **be**", right: "**ta** now", base: title };
  const state = createOutlineEditorState([n("a", title), n("z", "Last")]);
  const raw = run(state, { type: "split", id: "a", start: 9, newId: "b" });
  assert.deepEqual(
    raw.nodes.map((node) => node.text),
    ["Ship **be", "ta** now", "Last"],
  );
  const split = run(state, { type: "split", id: "a", start: 9, newId: "b", text: halves });
  assert.deepEqual(
    split.nodes.map((node) => [node.id, node.text]),
    [
      ["a", "Ship **be**"],
      ["b", "**ta** now"],
      ["z", "Last"],
    ],
  );
  assert.deepEqual(split.caret, raw.caret);
  assert.equal(split.history.past.length, 1);
  const undone = run(split, { type: "undo" });
  assert.deepEqual(
    undone.nodes.map((node) => node.text),
    [title, "Last"],
  );
  assert.deepEqual(
    run(undone, { type: "redo" }).nodes.map((node) => node.text),
    ["Ship **be**", "**ta** now", "Last"],
  );
  const stale = run(state, {
    type: "split",
    id: "a",
    start: 9,
    newId: "b",
    text: { ...halves, base: "Ship **beta**" },
  });
  assert.equal(stale.refusal, "invalid-command");
  assert.strictEqual(stale.nodes, state.nodes);
  assert.strictEqual(stale.history, state.history);
  assert.strictEqual(stale.caret, state.caret);
});

test("split halves never change where the new row goes", () => {
  const halves = { left: "**L**", right: "**R**", base: "**LR**" };
  const cases: [readonly OutlineNode[], { hoistedId?: string; expandedIds?: Set<string> }][] = [
    [[n("p", "**LR**", [n("c", "child")])], {}],
    [[n("p", "**LR**", [n("c", "child")])], { expandedIds: new Set() }],
    [[n("p", "**LR**", [n("c", "child")])], { hoistedId: "p" }],
    [[{ ...n("p", "**LR**"), checked: true }, n("q")], {}],
  ];
  const shape = (nodes: readonly OutlineNode[]) =>
    JSON.stringify(nodes, (key, value: unknown) => (key === "text" ? undefined : value));
  for (const [nodes, options] of cases) {
    const state = createOutlineEditorState(nodes, options);
    const plain = run(state, { type: "split", id: "p", start: 3, newId: "new" });
    const sourced = run(state, { type: "split", id: "p", start: 3, newId: "new", text: halves });
    assert.equal(shape(sourced.nodes), shape(plain.nodes), JSON.stringify(options));
    assert.deepEqual(sourced.caret, plain.caret);
    assert.equal(findOutlineNode(sourced.nodes, "p")!.node.text, "**L**");
    assert.equal(findOutlineNode(sourced.nodes, "new")!.node.text, "**R**");
  }
  // A collapsed caret at the visible start still inserts an empty row above and keeps the text.
  const start = createOutlineEditorState([n("p", "**LR**")]);
  const above = run(start, { type: "split", id: "p", start: 0, newId: "new", text: halves });
  assert.deepEqual(
    above.nodes.map((node) => [node.id, node.text]),
    [
      ["new", ""],
      ["p", "**LR**"],
    ],
  );
});

test("merge with joined source is bound to its rows, places the given caret and undoes in one step", () => {
  const state = createOutlineEditorState([n("a", "x__a"), n("b", "b__"), n("c", "tail")]);
  const text = {
    joined: "x\\_\\_ab\\_\\_",
    caret: 6,
    left: { id: "a", text: "x__a" },
    right: { id: "b", text: "b__" },
  };
  const merged = run(state, { type: "merge", id: "b", direction: "backward", text });
  assert.deepEqual(
    merged.nodes.map((node) => node.text),
    [text.joined, "tail"],
  );
  assert.deepEqual(merged.caret, { id: "a", start: 6, end: 6 });
  assert.equal(merged.history.past.length, 1);
  assert.deepEqual(
    run(merged, { type: "undo" }).nodes.map((node) => node.text),
    ["x__a", "b__", "tail"],
  );
  const forward = run(state, { type: "merge", id: "a", direction: "forward", text });
  assert.deepEqual(
    forward.nodes.map((node) => node.text),
    [text.joined, "tail"],
  );
  const refusals = [
    { ...text, left: { id: "c", text: "x__a" } },
    { ...text, right: { id: "c", text: "b__" } },
    { ...text, left: { id: "a", text: "older" } },
    { ...text, right: { id: "b", text: "older" } },
  ];
  for (const bad of refusals) {
    const next = run(state, { type: "merge", id: "b", direction: "backward", text: bad });
    assert.equal(next.refusal, "invalid-command", JSON.stringify(bad));
    assert.strictEqual(next.nodes, state.nodes);
    assert.strictEqual(next.history, state.history);
  }
  const plain = run(state, { type: "merge", id: "b", direction: "backward" });
  assert.equal(plain.nodes[0]!.text, "x__ab__");
  assert.deepEqual(plain.caret, { id: "a", start: 4, end: 4 });
});

test("malformed split halves and merge carets are refused before anything runs", () => {
  const state = createOutlineEditorState([n("a", "ab"), n("b", "cd")]);
  const sides = { left: { id: "a", text: "ab" }, right: { id: "b", text: "cd" } };
  const malformed: unknown[] = [
    { type: "split", id: "a", start: 1, newId: "n", text: null },
    { type: "split", id: "a", start: 1, newId: "n", text: { left: "a", right: "b" } },
    { type: "split", id: "a", start: 1, newId: "n", text: { left: "a", right: 1, base: "ab" } },
    { type: "split", id: "a", start: 1, newId: "n", text: ["a", "b", "ab"] },
    { type: "merge", id: "b", direction: "backward", text: { ...sides, joined: "abcd", caret: 5 } },
    {
      type: "merge",
      id: "b",
      direction: "backward",
      text: { ...sides, joined: "abcd", caret: -1 },
    },
    {
      type: "merge",
      id: "b",
      direction: "backward",
      text: { ...sides, joined: "abcd", caret: 1.5 },
    },
    { type: "merge", id: "b", direction: "backward", text: { ...sides, joined: "abcd" } },
    { type: "merge", id: "b", direction: "backward", text: { joined: "abcd", caret: 2 } },
    {
      type: "merge",
      id: "b",
      direction: "backward",
      text: { ...sides, right: { id: "b" }, joined: "abcd", caret: 2 },
    },
  ];
  for (const action of malformed) {
    const next = reduceOutlineEditor(state, action as OutlineAction, edit);
    assert.equal(next.refusal, "invalid-command", JSON.stringify(action));
    assert.strictEqual(next.nodes, state.nodes);
    assert.strictEqual(next.history, state.history);
  }
  const edges = [0, 4].map(
    (caret) =>
      run(state, {
        type: "merge",
        id: "b",
        direction: "backward",
        text: { ...sides, joined: "abcd", caret },
      }).caret,
  );
  assert.deepEqual(edges, [
    { id: "a", start: 0, end: 0 },
    { id: "a", start: 4, end: 4 },
  ]);
});

test("background transactions preserve interaction without a focus request; undo still requests focus", () => {
  const state = run(createOutlineEditorState(tree()), { type: "focus", id: "a", start: 2, end: 4 });
  const commands = [
    { type: "update" as const, id: "a", changes: { data: { note: "Stored attachment" } } },
  ];
  const next = run(state, { type: "transaction", commands, focus: false });
  assert.equal(next.refusal, null);
  assert.deepEqual(next.caret, state.caret);
  assert.deepEqual(next.selection, state.selection);
  assert.equal(next.focusVersion, state.focusVersion);
  assert.equal(next.history.past.length, state.history.past.length + 1);
  const undone = run(next, { type: "undo" });
  assert.deepEqual(undone.nodes, state.nodes);
  assert.equal(undone.focusVersion, next.focusVersion + 1);
  assert.equal(run(state, { type: "transaction", commands }).focusVersion, state.focusVersion + 1);
  const invalid = run(state, { type: "transaction", commands, focus: "no" } as never);
  assert.equal(invalid.refusal, "invalid-command");
  assert.equal(invalid.nodes, state.nodes);
});
