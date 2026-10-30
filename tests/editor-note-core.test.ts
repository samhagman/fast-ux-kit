import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutlineEditorState,
  reduceOutlineEditor,
  reconcileOutlineEditorState,
  type OutlineAction,
  type OutlineEditorOptions,
  type OutlineEditorState,
  type OutlineNode,
  type OutlineNoteAdapter,
} from "../src/core/index.js";

type Data = { note?: string; retained: string };
const adapter: OutlineNoteAdapter<Data> = {
  read: (node) => node.data?.note ?? "",
  prepareData: (node, note) => ({ ok: true, data: { ...node.data!, note } }),
};
const options: OutlineEditorOptions<Data> = { readOnly: false, noteAdapter: adapter };
const nodes: readonly OutlineNode<Data>[] = [
  { id: "a", text: "A", data: { note: "longer note", retained: "host" } },
  { id: "b", text: "B", data: { retained: "other" } },
];
const fresh = () => createOutlineEditorState(nodes);
const run = (state: OutlineEditorState<Data>, action: OutlineAction<Data>, config = options) =>
  reduceOutlineEditor(state, action, config);
const focusNote = (state = fresh()) =>
  run(state, { type: "focus", id: "a", field: "note", start: 9 });

test("note focus and caret clamp to note text without document or history edits", () => {
  const initial = fresh();
  const focused = focusNote(initial);
  assert.deepEqual(focused.caret, { id: "a", start: 9, end: 9, field: "note" });
  assert.equal(focused.nodes, initial.nodes);
  assert.equal(focused.revision, initial.revision);
  assert.equal(focused.history.past.length, 0);
  const selected = run(focused, { type: "caret", id: "a", field: "note", start: 99, end: -2 });
  assert.deepEqual(selected.caret, { id: "a", start: 11, end: 0, field: "note" });
  const title = run(selected, { type: "focus", id: "a", start: 99 });
  assert.deepEqual(title.caret, { id: "a", start: 1, end: 1 });
  assert.equal(run(title, { type: "focus", id: "b", field: "note", start: 5 }).caret?.start, 0);
});

test("canonical note updates preserve titles and metadata and restore field through history", () => {
  const before = focusNote();
  const edited = run(before, {
    type: "note",
    id: "a",
    text: "line one\n\t🙂",
    caret: 99,
    time: 10,
  });
  assert.equal(edited.nodes[0]!.text, "A");
  assert.equal(edited.nodes[0]!.data?.retained, "host");
  assert.equal(edited.nodes[0]!.data?.note, "line one\n\t🙂");
  assert.equal(edited.caret?.field, "note");
  assert.equal(edited.caret?.start, "line one\n\t🙂".length);
  assert.equal(edited.revision, 1);
  const title = run(edited, { type: "focus", id: "a", start: 1 });
  const undone = run(title, { type: "undo" });
  assert.equal(undone.nodes, before.nodes);
  assert.deepEqual(undone.caret, before.caret);
  const redone = run(undone, { type: "redo" });
  assert.equal(redone.nodes, edited.nodes);
  assert.deepEqual(redone.caret, edited.caret);
  assert.equal("redoCaret" in redone, false);
  let traveling = redone;
  for (let count = 0; count < 3; count++) {
    traveling = run(traveling, { type: "focus", id: "a", start: 0 });
    traveling = run(traveling, { type: "undo" });
    assert.deepEqual(traveling.caret, before.caret);
    traveling = run(traveling, { type: "redo" });
    assert.deepEqual(traveling.caret, edited.caret);
  }
});

test("note typing coalesces only matching row and field; old title groups retain their shape", () => {
  let state = run(fresh(), { type: "text", id: "a", text: "Title", time: 1 });
  assert.deepEqual(state.history.group, { id: "a", time: 1 });
  state = run(state, { type: "note", id: "a", text: "n", time: 2 });
  state = run(state, { type: "note", id: "a", text: "nn", time: 3 });
  assert.equal(state.history.past.length, 2);
  assert.deepEqual(state.history.group, { id: "a", time: 3, field: "note" });
  state = run(state, { type: "text", id: "a", text: "Title!", time: 4 });
  assert.equal(state.history.past.length, 3);
  assert.deepEqual(state.caret, { id: "a", start: 6, end: 6 });
  state = run(state, { type: "note", id: "b", text: "new", time: 5 });
  assert.equal(state.nodes[1]!.data?.note, "new");
});

test("note no-op never prepares data, updates revision, or creates history", () => {
  const initial = focusNote();
  const next = run(
    initial,
    { type: "note", id: "a", text: "longer note" },
    {
      ...options,
      noteAdapter: {
        ...adapter,
        prepareData: () => {
          throw new Error("must not run");
        },
      },
    },
  );
  assert.equal(next.nodes, initial.nodes);
  assert.equal(next.history, initial.history);
  assert.equal(next.revision, initial.revision);
});

test("note edits use latest node data and expose note action to host policy", () => {
  const latest = [{ ...nodes[0]!, data: { note: "server", retained: "new metadata" } }];
  const state = reconcileOutlineEditorState(focusNote(), latest, options);
  let observed: OutlineAction<Data> | undefined;
  const next = run(
    state,
    { type: "note", id: "a", text: "changed" },
    {
      ...options,
      canChange: (_before, _after, action) => {
        observed = action;
        return true;
      },
    },
  );
  assert.equal(next.nodes[0]!.data?.retained, "new metadata");
  assert.equal(observed?.type, "note");
});

test("missing, throwing, malformed, or ineffective adapters refuse atomically", () => {
  const invalid: Array<OutlineNoteAdapter<Data> | undefined> = [
    undefined,
    { ...adapter, read: () => undefined },
    {
      ...adapter,
      read: () => {
        throw new Error("read");
      },
    },
    { ...adapter, read: () => 42 as never },
    {
      ...adapter,
      prepareData: () => {
        throw new Error("prepare");
      },
    },
    { ...adapter, prepareData: () => ({ ok: false }) },
    { ...adapter, prepareData: () => null as never },
    { ...adapter, prepareData: () => ({ ok: true }) as never },
    { ...adapter, prepareData: (node) => ({ ok: true, data: node.data! }) },
  ];
  for (const noteAdapter of invalid) {
    const initial = focusNote();
    const next = run(
      initial,
      { type: "note", id: "a", text: "changed" },
      { readOnly: false, noteAdapter },
    );
    assert.equal(next.refusal, "invalid-command");
    assert.equal(next.nodes, initial.nodes);
    assert.equal(next.history, initial.history);
    assert.equal(next.revision, initial.revision);
  }
});

test("note policy refuses read-only, inherited locks, host refusal, and newly locked history", () => {
  const childNodes = [{ id: "parent", text: "Parent", children: nodes }];
  const initial = createOutlineEditorState(childNodes);
  const action = { type: "note", id: "a", text: "changed" } as const;
  for (const config of [
    { ...options, readOnly: true },
    { ...options, isLocked: (node: OutlineNode<Data>) => node.id === "parent" },
    { ...options, canChange: () => false },
  ]) {
    const next = run(initial, action, config);
    assert.ok(next.refusal);
    assert.equal(next.nodes, initial.nodes);
    assert.equal(next.history, initial.history);
  }
  const edited = run(initial, action);
  const locked = { ...options, isLocked: (node: OutlineNode<Data>) => node.id === "parent" };
  assert.equal(run(edited, { type: "undo" }, locked).refusal, "locked");
  assert.equal(run(initial, { type: "focus", id: "a", field: "note" }, locked).refusal, "locked");
});

test("external replacement clamps note caret, clears history and falls back safely", () => {
  const initial = run(focusNote(), { type: "note", id: "a", text: "updated note", caret: 12 });
  const replacement = [{ ...nodes[0]!, data: { note: "short", retained: "new" } }];
  const reconciled = reconcileOutlineEditorState(initial, replacement, options);
  assert.deepEqual(reconciled.caret, { id: "a", start: 5, end: 5, field: "note" });
  assert.equal(reconciled.history.past.length, 0);
  const fallback = reconcileOutlineEditorState(initial, replacement);
  assert.deepEqual(fallback.caret, { id: "a", start: 1, end: 1 });
  assert.equal(reconcileOutlineEditorState(initial, []).caret, null);
  const undone = run(initial, { type: "undo" }, { readOnly: false });
  assert.equal(undone.caret?.field, undefined);
});

test("hidden note target falls to visible title without reopening folds", () => {
  const initial = createOutlineEditorState([{ id: "parent", text: "Parent", children: nodes }]);
  const focused = focusNote(initial);
  const hidden = run(focused, { type: "expand", ids: ["parent"], expanded: false });
  assert.deepEqual(hidden.caret, { id: "parent", start: 0, end: 0 });
  assert.equal(hidden.expandedIds.has("parent"), false);
});

test("note fields and payloads reject malformed runtime values", () => {
  for (const action of [
    { type: "focus", id: "a", field: "title" },
    { type: "caret", id: "a", field: 1, start: 0, end: 0 },
    { type: "reveal", id: "a", field: null },
    { type: "note", id: "a", text: 42 },
    { type: "note", id: "a", text: "x", time: NaN },
    { type: "transaction", commands: [], caret: { id: "a", start: 0, end: 0, field: "other" } },
  ])
    assert.equal(run(fresh(), action as never).refusal, "invalid-command");
  assert.equal(run(fresh(), { type: "note", id: "gone", text: "x" }).refusal, "not-found");
});

test("explicit note transaction caret validates availability and clamps after the command", () => {
  const initial = fresh();
  const action: OutlineAction<Data> = {
    type: "transaction",
    commands: [{ type: "update", id: "a", changes: { data: { note: "12345", retained: "host" } } }],
    caret: { id: "a", start: 99, end: 99, field: "note" },
  };
  const next = run(initial, action);
  assert.deepEqual(next.caret, { id: "a", start: 5, end: 5, field: "note" });
  const refused = run(initial, action, { readOnly: false });
  assert.equal(refused.refusal, "invalid-command");
  assert.equal(refused.nodes, initial.nodes);
});

test("coalesced note redo caret uses actual last offset without mutating old history entries", () => {
  const initial = focusNote();
  const first = run(initial, { type: "note", id: "a", text: "first note", caret: 2, time: 1 });
  const entry = first.history.past[0]!;
  const next = run(first, { type: "note", id: "a", text: "second note", caret: 4, time: 2 });
  assert.equal(entry.redoCaret?.start, 2);
  assert.equal(next.history.past.length, 1);
  assert.equal(next.history.past[0]!.redoCaret?.start, 4);
  const title = run(next, { type: "focus", id: "a", start: 0 });
  const undone = run(title, { type: "undo" });
  const redone = run(undone, { type: "redo" });
  assert.deepEqual(redone.caret, { id: "a", start: 4, end: 4, field: "note" });
  const unavailable = { ...options, noteAdapter: { ...adapter, read: () => undefined } };
  assert.equal(run(undone, { type: "redo" }, unavailable).caret?.field, undefined);
  const refused = run(undone, { type: "redo" }, { ...options, canChange: () => false });
  assert.equal(refused.refusal, "locked");
  assert.equal(refused.history, undone.history);
});

test("legacy title history entries contain no note-only metadata", () => {
  const before = fresh();
  const edited = run(before, { type: "text", id: "a", text: "Updated", time: 1 });
  assert.deepEqual(Object.keys(edited.history.past[0]!).sort(), [
    "caret",
    "nodes",
    "selection",
    "selectionAnchor",
  ]);
  const undone = run(edited, { type: "undo" });
  const redone = run(undone, { type: "redo" });
  assert.equal("redoCaret" in undone.history.future[0]!, false);
  assert.equal("redoCaret" in redone.history.past[0]!, false);
});

test("same-node reconciliation normalizes only note interaction without resetting content history", () => {
  const initial = run(focusNote(), { type: "note", id: "a", text: "updated", caret: 6 });
  assert.equal(reconcileOutlineEditorState(initial, initial.nodes, options), initial);
  const fallback = reconcileOutlineEditorState(initial, initial.nodes);
  assert.deepEqual(fallback.caret, { id: "a", start: 1, end: 1 });
  assert.equal(fallback.nodes, initial.nodes);
  assert.equal(fallback.revision, initial.revision);
  assert.equal(fallback.history.past, initial.history.past);
  assert.equal(fallback.history.future, initial.history.future);
  assert.equal(fallback.history.group, null);
  assert.equal(fallback.focusVersion, initial.focusVersion + 1);
  assert.equal(reconcileOutlineEditorState(fallback, fallback.nodes), fallback);
  const shorter = reconcileOutlineEditorState(initial, initial.nodes, {
    noteAdapter: { ...adapter, read: () => "ok" },
  });
  assert.deepEqual(shorter.caret, { id: "a", start: 2, end: 2, field: "note" });
});

test("recognized caret fields refuse accessors, inherited properties and unreadable descriptors", () => {
  let calls = 0;
  for (const type of ["focus", "caret", "reveal"] as const) {
    const accessor = { type, id: "a", start: 0, end: 0 };
    Object.defineProperty(accessor, "field", {
      get() {
        calls++;
        throw new Error("field");
      },
    });
    const inherited = Object.assign(Object.create({ field: "note" }), {
      type,
      id: "a",
      start: 0,
      end: 0,
    });
    const unreadable = new Proxy(
      { type, id: "a", start: 0, end: 0 },
      {
        getOwnPropertyDescriptor(target, key) {
          if (key === "field") throw new Error("descriptor");
          return Reflect.getOwnPropertyDescriptor(target, key);
        },
      },
    );
    for (const action of [accessor, inherited, unreadable]) {
      const initial = fresh();
      const next = run(initial, action as never);
      assert.equal(next.refusal, "invalid-command");
      assert.equal(next.caret, initial.caret);
      assert.equal(next.nodes, initial.nodes);
    }
  }
  const caret = { id: "a", start: 0, end: 0 };
  Object.defineProperty(caret, "field", {
    get() {
      calls++;
      return "note";
    },
  });
  const next = run(fresh(), { type: "transaction", commands: [], caret });
  assert.equal(next.refusal, "invalid-command");
  assert.equal(calls, 0);
  assert.deepEqual(run(fresh(), { type: "focus", id: "a", field: undefined }).caret, {
    id: "a",
    start: 0,
    end: 0,
  });
});

test("navigation between undo and redo cannot replace the original note undo caret", () => {
  const before = focusNote();
  const edited = run(before, { type: "note", id: "a", text: "new note value", caret: 4 });
  let state = edited;
  for (let cycle = 0; cycle < 3; cycle++) {
    state = run(state, { type: "undo" });
    assert.deepEqual(state.caret, before.caret);
    state = run(state, { type: "focus", id: "b", start: 1 });
    state = run(state, { type: "redo" });
    assert.deepEqual(state.caret, edited.caret);
    assert.equal("undoCaret" in state, false);
    state = run(state, { type: "focus", id: "a", start: 0 });
  }
  state = run(state, { type: "undo" });
  assert.deepEqual(state.caret, before.caret);
  const direct = run(fresh(), { type: "note", id: "a", text: "new", caret: 1 });
  const undone = run(direct, { type: "undo" });
  const navigated = run(undone, { type: "focus", id: "b" });
  const redone = run(navigated, { type: "redo" });
  assert.equal(run(redone, { type: "undo" }).caret, null);
});

test("transaction note focus refuses direct and inherited locks atomically", () => {
  const initial = createOutlineEditorState([
    { id: "parent", text: "Parent", children: [nodes[0]!] },
    nodes[1]!,
  ]);
  const action: OutlineAction<Data> = {
    type: "transaction",
    commands: [{ type: "update", id: "b", changes: { text: "Allowed update" } }],
    caret: { id: "a", start: 2, end: 2, field: "note" },
  };
  for (const lockedId of ["a", "parent"]) {
    const next = run(initial, action, {
      ...options,
      isLocked: (node) => node.id === lockedId,
    });
    assert.equal(next.refusal, "locked");
    assert.equal(next.nodes, initial.nodes);
    assert.equal(next.history, initial.history);
    assert.equal(next.caret, initial.caret);
    assert.equal(next.revision, initial.revision);
  }
});
