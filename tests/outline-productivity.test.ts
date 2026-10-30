import assert from "node:assert/strict";
import test from "node:test";
import { InvalidOutlineError, type OutlineNode } from "../src/core/index.js";
import { createOutlineEditorState, reduceOutlineEditor } from "../src/core/editor.js";
import {
  OUTLINE_DETAIL_DATE_LIMIT,
  applyOutlineSort,
  getOutlineItemDetails,
  outlineTagInventory,
  planOutlineSort,
  projectOutline,
  type OutlineItemDetails,
  type OutlineSortRequest,
} from "../src/core/outline-productivity.js";

const ids = (nodes: readonly OutlineNode[]) => nodes.map((node) => node.id);
const request = (by: OutlineSortRequest["by"] = "title"): OutlineSortRequest => ({
  parentId: null,
  by,
});
const editable = { readOnly: false };
const sample = (): readonly OutlineNode<OutlineItemDetails>[] => [
  { id: "c", text: "Charlie", data: { createdAt: 3 }, children: [{ id: "child", text: "Nested" }] },
  { id: "b", text: "Bravo", data: { createdAt: 1 } },
  { id: "a", text: "Alpha", data: { createdAt: 1 } },
];

test("details copy only valid own data and preserve explicit completion overrides", () => {
  assert.deepEqual(getOutlineItemDetails({ id: "x", text: "X" }), {
    completed: false,
    checkbox: false,
  });
  assert.deepEqual(getOutlineItemDetails({ id: "x", text: "X", checked: false }), {
    completed: false,
    checkbox: true,
  });
  const inherited = Object.create({ note: "not own", completed: true }) as OutlineItemDetails;
  assert.deepEqual(getOutlineItemDetails({ id: "x", text: "X", data: inherited }), {
    completed: false,
    checkbox: false,
  });
  const data: OutlineItemDetails = {
    note: "A note",
    completed: false,
    checkbox: false,
    heading: 2,
    color: "violet",
    numbered: true,
    createdAt: 0,
    editedAt: -10,
    dates: [{ start: 3, end: 5 }],
  };
  const node = { id: "x", text: "X", checked: true, data };
  const result = getOutlineItemDetails(node);
  assert.deepEqual(result, data);
  assert.notEqual(result, data);
  assert.notEqual(result.dates, data.dates);
  assert.notEqual(result.dates![0], data.dates![0]);
  assert.deepEqual(
    getOutlineItemDetails(node, () => ({ note: "host" })),
    { completed: true, checkbox: true, note: "host" },
  );
});

test("malformed metadata and array entries never invoke accessors", () => {
  let calls = 0;
  const data = Object.create(null) as Record<string, unknown>;
  Object.defineProperty(data, "note", {
    get() {
      calls++;
      throw new Error("raw getter");
    },
  });
  Object.assign(data, {
    heading: 4,
    color: 9,
    completed: "yes",
    numbered: null,
    createdAt: NaN,
    editedAt: Infinity,
  });
  const dates: unknown[] = [
    { start: 10, end: 9 },
    { start: Infinity },
    { start: 0 },
    { start: 1, end: 1 },
  ];
  Object.defineProperty(dates, 4, {
    get() {
      calls++;
      throw new Error("index getter");
    },
  });
  data.dates = dates;
  const result = getOutlineItemDetails({ id: "x", text: "X", checked: true, data });
  assert.deepEqual(result, {
    completed: true,
    checkbox: true,
    dates: [{ start: 0 }, { start: 1, end: 1 }],
  });
  assert.equal(calls, 0);
  const getDetails = () => {
    throw new Error("trusted getter");
  };
  assert.throws(() => getOutlineItemDetails({ id: "x", text: "X" }, getDetails), /trusted getter/);
});

test("tag inventory normalizes Unicode, counts occurrences, and deduplicates node IDs", () => {
  const nodes = [
    {
      id: "one",
      text: "#Café #cafe\u0301 x@y.com",
      data: { note: "#ＣＡＦÉ @Neo" },
      children: [{ id: "two", text: "#café" }],
    },
  ];
  const tags = outlineTagInventory(nodes);
  assert.deepEqual(tags, [
    { key: "#café", trigger: "#", spelling: "Café", count: 4, nodeIds: ["one", "two"] },
  ]);
  const references = outlineTagInventory(nodes, { triggers: ["#", "@"] });
  assert.deepEqual(
    references.map((tag) => tag.key),
    ["#café", "@neo"],
  );
  assert.equal(
    references.some((tag) => tag.key.includes("y")),
    false,
  );
});

test("projection hides completed branches without pruning canonical child data", () => {
  const hiddenChild = { id: "hidden-child", text: "Not complete" };
  const done = { id: "done", text: "Complete", checked: true, children: [hiddenChild] };
  const shown = {
    id: "shown",
    text: "Open",
    data: { note: "A note" },
    children: [{ id: "nested", text: "Nested", data: { note: "N" } }],
  };
  const nodes = Object.freeze([done, shown]);
  const projected = projectOutline(nodes, { hideCompleted: true });
  assert.deepEqual(
    projected.map((row) => row.id),
    ["shown", "nested"],
  );
  assert.equal(projected[0]!.node, shown);
  assert.equal(done.children[0], hiddenChild);
  assert.equal(projected[1]!.parentId, "shown");
  assert.equal(projected[1]!.depth, 1);
  assert.equal(projected[0]!.noteVisible, true);
  assert.deepEqual(
    projectOutline(nodes, { noteMode: "hide" }).map((row) => row.noteVisible),
    [false, false, false, false],
  );
  const firstLine = projectOutline(
    [
      {
        id: "note",
        text: "Title",
        data: { note: "First\r\nSecond\nThird" },
        children: [{ id: "child", text: "Child" }],
      },
    ],
    { noteMode: "first-line", expandedIds: new Set() },
  );
  assert.equal(firstLine[0]!.noteText, "First");
  assert.equal(firstLine[0]!.details.note, "First\r\nSecond\nThird");
  assert.equal(firstLine[0]!.noteVisible, true);
  assert.equal(firstLine.length, 1);
  assert.equal(projected[0]!.noteText, "A note");
  assert.equal(projectOutline(nodes, { noteMode: "hide" })[2]!.noteText, "");
  assert.deepEqual(
    projectOutline(nodes, { expandedIds: new Set() }).map((row) => row.id),
    ["done", "shown"],
  );
  assert.deepEqual(
    projectOutline(nodes, { hideCompleted: true, getDetails: () => ({ completed: false }) }).map(
      (row) => row.id,
    ),
    ["done", "hidden-child", "shown", "nested"],
  );
});

test("sort plans preserve data/subtrees, prior roots, and stable title ties", () => {
  const nodes = sample();
  const before = JSON.stringify(nodes);
  const plan = planOutlineSort(nodes, request());
  assert.equal(plan.ok, true);
  if (!plan.ok) return;
  assert.deepEqual(ids(plan.nodes), ["a", "b", "c"]);
  assert.equal(plan.nodes[2], nodes[0]);
  assert.equal(plan.nodes[2]!.data, nodes[0]!.data);
  assert.equal(plan.nodes[2]!.children, nodes[0]!.children);
  assert.equal(JSON.stringify(nodes), before);
  assert.equal(plan.action.type, "transaction");
  assert.equal(plan.action.commands[0]!.type, "reorder");
  const ties = [
    { id: "first", text: "Ａ" },
    { id: "second", text: "a" },
  ];
  const stable = planOutlineSort(ties, request());
  assert.equal(stable.ok && stable.nodes, ties);
  const noop = planOutlineSort(nodes, { ...request(), ids: [] });
  assert.equal(noop.ok && noop.nodes, nodes);
});

test("sort selection reorders only nonadjacent sibling slots", () => {
  const nodes = [
    { id: "z", text: "Z" },
    { id: "fixed", text: "Fixed" },
    { id: "a", text: "A" },
    { id: "tail", text: "Tail" },
  ];
  for (const by of ["title", "reverse"] as const) {
    const plan = planOutlineSort(nodes, { parentId: null, ids: ["a", "z"], by });
    assert.equal(plan.ok, true);
    if (plan.ok) assert.deepEqual(ids(plan.nodes), ["a", "fixed", "z", "tail"]);
  }
  const nested = [
    { id: "p", text: "Parent", children: sample() },
    { id: "q", text: "Other" },
  ];
  const childPlan = planOutlineSort(nested, { parentId: "p", by: "title" });
  assert.equal(childPlan.ok, true);
  if (childPlan.ok) {
    assert.deepEqual(ids(childPlan.nodes[0]!.children!), ["a", "b", "c"]);
    assert.equal(childPlan.nodes[1], nested[1]);
    assert.equal(childPlan.nodes[0]!.text, "Parent");
  }
  for (const invalid of [
    { parentId: "p", ids: ["a", "q"], by: "title" },
    { parentId: null, ids: ["q", "q"], by: "title" },
    { parentId: null, ids: new Array(100_000), by: "title" },
    { parentId: null, ids: ["missing"], by: "title" },
    { parentId: "missing", by: "title" },
    { parentId: null, by: "unsupported" },
  ] as OutlineSortRequest[]) {
    const plan = planOutlineSort(nested, invalid);
    assert.equal(plan.ok, false);
    assert.equal(plan.nodes, nested);
  }
});

test("completion, time and date sorting have stable ties and deterministic missing values", () => {
  const nodes: readonly OutlineNode<OutlineItemDetails>[] = [
    { id: "missing", text: "M" },
    {
      id: "late",
      text: "L",
      checked: true,
      data: { createdAt: 3, editedAt: 3, dates: [{ start: 8 }, { start: 3 }] },
    },
    { id: "early", text: "E", data: { createdAt: 1, editedAt: 1, dates: [{ start: 1 }] } },
    { id: "tie", text: "T", data: { createdAt: 1, editedAt: 1, dates: [{ start: 1 }] } },
    {
      id: "invalid",
      text: "I",
      data: { createdAt: NaN, editedAt: Infinity, dates: [{ start: 3, end: 1 }] },
    },
  ];
  for (const by of ["created", "edited", "date"] as const) {
    const ascending = planOutlineSort(nodes, request(by));
    assert.deepEqual(ascending.ok && ids(ascending.nodes), [
      "early",
      "tie",
      "late",
      "missing",
      "invalid",
    ]);
    const descending = planOutlineSort(nodes, { ...request(by), direction: "descending" });
    assert.deepEqual(descending.ok && ids(descending.nodes), [
      "late",
      "early",
      "tie",
      "missing",
      "invalid",
    ]);
  }
  const completion = planOutlineSort(nodes, request("completion"));
  assert.deepEqual(completion.ok && ids(completion.nodes), [
    "missing",
    "early",
    "tie",
    "invalid",
    "late",
  ]);
  const descending = planOutlineSort(sample(), { ...request(), direction: "descending" });
  assert.equal(descending.ok && descending.nodes[0]!.id, "c");
});

test("sort uses reducer authorization, one history step, normal canChange and caret preservation", () => {
  const nodes = sample();
  let state = createOutlineEditorState(nodes);
  state = reduceOutlineEditor(state, { type: "caret", id: "b", start: 2, end: 2 });
  const denied = applyOutlineSort(state, request());
  assert.equal(denied.refusal, "read-only");
  assert.equal(denied.nodes, nodes);
  assert.equal(denied.history, state.history);
  const veto = applyOutlineSort(state, request(), {
    ...editable,
    canChange: (_before, _after, action) => {
      assert.equal(action.type, "transaction");
      return false;
    },
  });
  assert.equal(veto.refusal, "locked");
  assert.equal(veto.nodes, nodes);
  const sorted = applyOutlineSort(state, request(), editable);
  assert.equal(sorted.refusal, null);
  assert.equal(sorted.history.past.length, 1);
  assert.equal(sorted.revision, 1);
  assert.deepEqual(sorted.caret, state.caret);
  const undone = reduceOutlineEditor(sorted, { type: "undo" }, editable);
  assert.equal(undone.nodes, nodes);
  assert.deepEqual(ids(reduceOutlineEditor(undone, { type: "redo" }, editable).nodes), [
    "a",
    "b",
    "c",
  ]);
});

test("sort atomically refuses moved, displaced and inherited locks including nested descendants", () => {
  const nodes = sample();
  for (const lockedId of ["a", "c", "child"]) {
    const state = createOutlineEditorState(nodes);
    const sorted = applyOutlineSort(state, request(), {
      ...editable,
      isLocked: (node) => node.id === lockedId,
    });
    assert.equal(sorted.refusal, "locked", lockedId);
    assert.equal(sorted.nodes, nodes);
    assert.equal(sorted.history, state.history);
    assert.equal(sorted.revision, 0);
  }
  const nested = [
    {
      id: "ancestor",
      text: "Ancestor",
      children: [{ id: "parent", text: "Parent", children: sample() }],
    },
  ];
  for (const lockedId of ["ancestor", "parent"]) {
    const state = createOutlineEditorState(nested);
    const sorted = applyOutlineSort(
      state,
      { parentId: "parent", by: "title" },
      { ...editable, isLocked: (node) => node.id === lockedId },
    );
    assert.equal(sorted.refusal, "locked");
    assert.equal(sorted.nodes, nested);
  }
  // A protected, unchanged sibling need not block a disjoint selected-slot sort.
  const fixed = [
    { id: "z", text: "Z" },
    { id: "fixed", text: "Fixed", children: [{ id: "locked", text: "Locked" }] },
    { id: "a", text: "A" },
  ];
  const allowed = applyOutlineSort(
    createOutlineEditorState(fixed),
    { parentId: null, ids: ["z", "a"], by: "title" },
    { ...editable, isLocked: (node) => node.id === "locked" },
  );
  assert.equal(allowed.refusal, null);
  assert.deepEqual(ids(allowed.nodes), ["a", "fixed", "z"]);
  assert.equal(allowed.nodes[1], fixed[1]);
});

test("inventory and projection reject cyclic and duplicate trees before traversal", () => {
  const cycle: { id: string; text: string; children: OutlineNode[] } = {
    id: "cycle",
    text: "Cycle",
    children: [],
  };
  cycle.children.push(cycle);
  const duplicate = [
    { id: "same", text: "One" },
    { id: "same", text: "Two" },
  ];
  for (const nodes of [[cycle], duplicate]) {
    assert.throws(() => outlineTagInventory(nodes), InvalidOutlineError);
    assert.throws(() => projectOutline(nodes), InvalidOutlineError);
  }
});

test("oversized sparse date arrays explicitly fail without scanning or truncating", () => {
  const dates = new Array(OUTLINE_DETAIL_DATE_LIMIT + 1);
  assert.throws(() => getOutlineItemDetails({ id: "x", text: "X", data: { dates } }), RangeError);
  dates.length = OUTLINE_DETAIL_DATE_LIMIT;
  assert.deepEqual(getOutlineItemDetails({ id: "x", text: "X", data: { dates } }).dates, []);
});

test("valid selected-sibling sorting avoids a full-tree lookup per selected row", () => {
  let idReads = 0;
  const count = 128;
  const nodes: OutlineNode[] = Array.from({ length: count }, (_, index) => ({
    get id() {
      idReads++;
      return `row-${index}`;
    },
    text: String(count - index).padStart(3, "0"),
  }));
  const selected = Array.from({ length: count }, (_, index) => `row-${index}`);
  const result = planOutlineSort(nodes, { parentId: null, ids: selected, by: "title" });
  assert.ok(result.ok);
  assert.equal(result.nodes[0], nodes.at(-1));
  assert.ok(idReads < count * 40, `expected linear ID reads, observed ${idReads}`);
});

test("malformed sort request fields cannot silently widen a selection or default direction", () => {
  const nodes: readonly OutlineNode[] = [
    { id: "z", text: "Z" },
    { id: "a", text: "A" },
  ];
  let getterCalls = 0;
  const unreadableLength = new Proxy(["z"], {
    getOwnPropertyDescriptor(target, key) {
      if (key === "length") throw new Error("Unreadable length");
      return Reflect.getOwnPropertyDescriptor(target, key);
    },
  });
  const unreadableRequest = new Proxy(
    { parentId: null, by: "title", ids: ["z"] },
    {
      getOwnPropertyDescriptor(target, key) {
        if (key === "ids") throw new Error("Unreadable selection");
        return Reflect.getOwnPropertyDescriptor(target, key);
      },
    },
  );
  const inheritedIds = Object.assign(Object.create({ ids: ["z"] }), {
    parentId: null,
    by: "title",
  });
  const cases = [
    {
      parentId: null,
      by: "title",
      get ids() {
        getterCalls++;
        return ["z"];
      },
    },
    {
      parentId: null,
      by: "title",
      get direction() {
        getterCalls++;
        return "descending";
      },
    },
    { parentId: null, by: "title", ids: unreadableLength },
    inheritedIds,
    unreadableRequest,
    null,
    [],
  ];
  for (const malformed of cases) {
    const result = planOutlineSort(nodes, malformed as never);
    assert.deepEqual(result, { ok: false, nodes, reason: "invalid-command" });
    const state = createOutlineEditorState(nodes);
    const applied = applyOutlineSort(state, malformed as never, editable);
    assert.strictEqual(applied.nodes, nodes);
    assert.strictEqual(applied.history, state.history);
    assert.equal(applied.refusal, "invalid-command");
  }
  assert.equal(getterCalls, 0);
  const explicitUndefined = planOutlineSort(nodes, {
    parentId: null,
    by: "title",
    ids: undefined,
    direction: undefined,
  });
  assert.ok(explicitUndefined.ok);
  assert.deepEqual(ids(explicitUndefined.nodes), ["a", "z"]);
});
