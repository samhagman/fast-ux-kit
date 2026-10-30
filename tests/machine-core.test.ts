import assert from "node:assert/strict";
import test from "node:test";
import {
  applyMachineCommand,
  createMachineHistory,
  commitMachineHistory,
  undoMachineHistory,
  redoMachineHistory,
  validateMachineDocument,
  parseMachineDocument,
  serializeMachineDocument,
  layoutMachineGraph,
  createMachineSnapshot,
  sendMachineEvent,
  getEnabledMachineTransitions,
  replayMachineEvents,
  appendMachineInspectionFrame,
  selectMachineInspectionFrame,
  machineTransitionCoverage,
  runMachineScenario,
  type MachineDocument,
  type MachineGraph,
  type MachineInspectionSession,
} from "../src/core/machine/index.js";
function simple(): MachineDocument {
  return {
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Workflow",
        initialId: "idle",
        nodes: [
          { id: "idle", label: "Idle", kind: "atomic" },
          { id: "busy", label: "Busy", kind: "atomic" },
          { id: "done", label: "Done", kind: "final" },
        ],
        transitions: [
          { id: "start", sourceId: "idle", targetId: "busy", event: "GO" },
          { id: "finish", sourceId: "busy", targetId: "done", event: "FINISH" },
        ],
      },
    ],
  };
}
function graph(document: MachineDocument): MachineGraph {
  return document.machines[0]!;
}
function withGraph(g: MachineGraph): MachineDocument {
  return { version: 1, rootId: g.id, machines: [g] };
}
function parallel(): MachineDocument {
  return withGraph({
    id: "main",
    label: "Parallel",
    initialId: "work",
    nodes: [
      { id: "work", label: "Work", kind: "parallel" },
      { id: "left", label: "Left", kind: "compound", parentId: "work", initialId: "a" },
      { id: "a", label: "A", kind: "atomic", parentId: "left" },
      { id: "b", label: "B", kind: "final", parentId: "left" },
      { id: "right", label: "Right", kind: "compound", parentId: "work", initialId: "c" },
      { id: "c", label: "C", kind: "atomic", parentId: "right" },
      { id: "d", label: "D", kind: "final", parentId: "right" },
      { id: "stop", label: "Stop", kind: "final" },
    ],
    transitions: [
      { id: "ab", sourceId: "a", targetId: "b", event: "LEFT" },
      { id: "cd", sourceId: "c", targetId: "d", event: "RIGHT" },
      { id: "cancel", sourceId: "work", targetId: "stop", event: "CANCEL" },
    ],
  });
}
test("valid document round trips without functions or DOM dependencies", () => {
  const d = simple();
  assert.deepEqual(validateMachineDocument(d), []);
  assert.deepEqual(parseMachineDocument(serializeMachineDocument(d)).document, d);
});
test("malformed imports return useful errors, never throw", () => {
  for (const value of [null, {}, [], { version: 1, rootId: "x", machines: [null] }])
    assert.ok(validateMachineDocument(value).some((i) => i.severity === "error"));
  assert.equal(parseMachineDocument("{").ok, false);
  assert.equal(parseMachineDocument("x".repeat(5_000_001)).issues[0]?.code, "import-limit");
});
test("duplicate IDs and missing endpoints are rejected", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: [...g.nodes, g.nodes[0]!],
    transitions: [...g.transitions, { id: "idle", sourceId: "missing", targetId: "done" }],
  });
  const codes = validateMachineDocument(d).map((i) => i.code);
  assert.ok(codes.includes("duplicate-id"));
  assert.ok(codes.includes("missing-endpoint"));
});
test("hierarchy cycles and non-container parents rejected", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: g.nodes.map((n) =>
      n.id === "idle"
        ? { ...n, parentId: "busy" }
        : n.id === "busy"
          ? { ...n, parentId: "idle" }
          : n,
    ),
  });
  const codes = validateMachineDocument(d).map((i) => i.code);
  assert.ok(codes.includes("parent-cycle"));
  assert.ok(codes.includes("invalid-parent"));
});
test("notes/final transitions and invalid finite positions rejected", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: [
      ...g.nodes,
      { id: "note", label: "Note", kind: "note", position: { x: Infinity, y: 0 } },
    ],
    transitions: [{ id: "t", sourceId: "done", targetId: "note" }],
  });
  const codes = validateMachineDocument(d).map((i) => i.code);
  for (const c of ["invalid-position", "note-transition", "final-transition"])
    assert.ok(codes.includes(c));
});
test("submachine references validate without recursive execution", () => {
  const d = withGraph({
    id: "main",
    label: "Main",
    initialId: "sub",
    nodes: [{ id: "sub", label: "Child", kind: "submachine", machineId: "main" }],
    transitions: [],
  });
  assert.deepEqual(validateMachineDocument(d), []);
  assert.deepEqual(createMachineSnapshot(d).activeIds, ["sub"]);
});
test("add/move/update/delete commands immutable", () => {
  const d = simple();
  const added = applyMachineCommand(d, {
    type: "add-node",
    machineId: "main",
    node: { id: "x", label: "X", kind: "atomic" },
  });
  assert.equal(added.ok, true);
  assert.equal(graph(d).nodes.length, 3);
  const moved = applyMachineCommand(added.document, {
    type: "move-node",
    machineId: "main",
    id: "x",
    position: { x: 50, y: 80 },
  });
  assert.deepEqual(graph(moved.document).nodes.at(-1)?.position, { x: 50, y: 80 });
  const deleted = applyMachineCommand(moved.document, {
    type: "delete-node",
    machineId: "main",
    id: "x",
  });
  assert.equal(graph(deleted.document).nodes.length, 3);
});
test("delete container removes descendants, incident edges and initial pointers", () => {
  const d = parallel();
  const result = applyMachineCommand(d, { type: "delete-node", machineId: "main", id: "work" });
  assert.equal(result.ok, true);
  assert.deepEqual(
    graph(result.document).nodes.map((n) => n.id),
    ["stop"],
  );
  assert.equal(graph(result.document).transitions.length, 0);
  assert.equal(graph(result.document).initialId, undefined);
});
test("refused command returns original document", () => {
  const d = simple();
  const result = applyMachineCommand(d, {
    type: "reparent-node",
    machineId: "main",
    id: "idle",
    parentId: "idle",
  });
  assert.equal(result.ok, false);
  assert.equal(result.document, d);
  assert.equal(
    applyMachineCommand(d, { type: "delete-node", machineId: "missing", id: "idle" }).ok,
    false,
  );
});
test("history bounded, redo invalidated by new edits", () => {
  const d = simple();
  const e = { ...d };
  const f = { ...d };
  let h = createMachineHistory(d);
  h = commitMachineHistory(h, e, 1);
  h = commitMachineHistory(h, f, 1);
  assert.deepEqual(h.past, [e]);
  h = undoMachineHistory(h);
  assert.equal(h.present, e);
  assert.equal(redoMachineHistory(h).present, f);
  h = commitMachineHistory(h, d);
  assert.equal(h.future.length, 0);
});
test("layout deterministic both directions and nested containment", () => {
  const g = graph(parallel());
  for (const direction of ["LR", "TB"] as const) {
    const a = layoutMachineGraph(g, direction);
    assert.deepEqual(layoutMachineGraph(g, direction), a);
    for (const n of g.nodes.filter((n) => n.parentId)) {
      const r = a.nodes.find((r) => r.id === n.id)!;
      const p = a.nodes.find((r) => r.id === n.parentId)!;
      assert.ok(
        r.x >= p.x &&
          r.y >= p.y &&
          r.x + r.width <= p.x + p.width &&
          r.y + r.height <= p.y + p.height,
      );
    }
  }
});
test("manual positions retained, auto layout resets them", () => {
  const g = graph(simple());
  const d = withGraph({ ...g, nodes: g.nodes.map((n) => ({ ...n, position: { x: 10, y: 20 } })) });
  assert.equal(layoutMachineGraph(graph(d)).nodes[0]?.x, 10);
  const result = applyMachineCommand(d, { type: "layout", machineId: "main", direction: "LR" });
  assert.equal(result.ok, true);
  assert.notEqual(graph(result.document).nodes[0]?.position?.x, 10);
});
test("simple simulation transitions, finish and reset", () => {
  const d = simple();
  let s = createMachineSnapshot(d);
  assert.deepEqual(s.activeIds, ["idle"]);
  s = sendMachineEvent(d, s, { type: "GO" });
  assert.deepEqual(s.activeIds, ["busy"]);
  s = sendMachineEvent(d, s, { type: "FINISH" });
  assert.equal(s.status, "done");
  assert.equal(sendMachineEvent(d, s, { type: "GO" }), s);
  assert.deepEqual(createMachineSnapshot(d).activeIds, ["idle"]);
});
test("unknown event is no-op and unknown guard disabled", () => {
  const d = simple();
  const g = graph(d);
  const guarded = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, guard: "allowed" })),
  });
  const s = createMachineSnapshot(guarded);
  assert.equal(sendMachineEvent(guarded, s, { type: "OTHER" }), s);
  assert.equal(getEnabledMachineTransitions(guarded, s, { type: "GO" }).length, 0);
  assert.equal(
    getEnabledMachineTransitions(guarded, s, { type: "GO" }, { guards: { allowed: () => true } })
      .length,
    1,
  );
  assert.equal(
    getEnabledMachineTransitions(
      guarded,
      s,
      { type: "GO" },
      {
        guards: {
          allowed: () => {
            throw Error("bad");
          },
        },
      },
    ).length,
    0,
  );
});
test("parallel entry includes both regions; local transitions preserve sibling", () => {
  const d = parallel();
  const s = createMachineSnapshot(d);
  assert.deepEqual(s.activeIds, ["work", "left", "a", "right", "c"]);
  const next = sendMachineEvent(d, s, { type: "LEFT" });
  assert.deepEqual(next.activeIds, ["work", "left", "b", "right", "c"]);
  assert.equal(next.status, "running");
  assert.equal(sendMachineEvent(d, next, { type: "RIGHT" }).status, "running");
});
test("ancestor transition exits whole parallel configuration", () => {
  const d = parallel();
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "CANCEL" });
  assert.deepEqual(s.activeIds, ["stop"]);
  assert.equal(s.trace.at(-1)?.exited.length, 5);
});
test("same event independently transitions parallel regions", () => {
  const g = graph(parallel());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => (t.id === "cancel" ? t : { ...t, event: "NEXT" })),
  });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "NEXT" });
  assert.deepEqual(s.activeIds, ["work", "left", "b", "right", "d"]);
  assert.deepEqual(s.trace.at(-1)?.transitionIds, ["ab", "cd"]);
});
test("deepest transition wins over conflicting ancestor", () => {
  const g = graph(parallel());
  const d = withGraph({ ...g, transitions: g.transitions.map((t) => ({ ...t, event: "NEXT" })) });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "NEXT" });
  assert.ok(!s.activeIds.includes("stop"));
  assert.deepEqual(s.trace.at(-1)?.transitionIds, ["ab", "cd"]);
});
test("initial markers and omitted event settle automatically", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    nodes: [
      { id: "i", label: "Start", kind: "initial" },
      { id: "ready", label: "Ready", kind: "atomic" },
    ],
    transitions: [{ id: "init", sourceId: "i", targetId: "ready" }],
  });
  const s = createMachineSnapshot(d);
  assert.deepEqual(s.activeIds, ["ready"]);
  assert.equal(s.trace[1]?.event, "");
});
test("automatic cycle bounded with explicit error", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "a",
    nodes: [{ id: "a", label: "A", kind: "atomic" }],
    transitions: [{ id: "loop", sourceId: "a", targetId: "a" }],
  });
  const s = createMachineSnapshot(d, undefined, {}, { maxMicrosteps: 4 });
  assert.equal(s.status, "error");
  assert.match(s.error ?? "", /4-step/);
  assert.equal(s.sequence, 4);
});
test("entry/exit/actions execute in order as pure context updates", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: g.nodes.map((n) => ({ ...n, entry: [`enter-${n.id}`], exit: [`exit-${n.id}`] })),
    transitions: g.transitions.map((t) => ({ ...t, actions: [t.id] })),
  });
  const names = ["enter-idle", "exit-idle", "start", "enter-busy"];
  const actions = Object.fromEntries(
    names.map((name) => [
      name,
      (context: Readonly<Record<string, unknown>>) => ({
        ...context,
        log: [...((context.log as string[]) ?? []), name],
      }),
    ]),
  );
  const s = sendMachineEvent(
    d,
    createMachineSnapshot(d, undefined, {}, { actions }),
    { type: "GO" },
    { actions },
  );
  assert.deepEqual(s.context.log, names);
});
test("throwing actions return error without partial transition commit", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, actions: ["fail"] })),
  });
  const before = createMachineSnapshot(d);
  const s = sendMachineEvent(
    d,
    before,
    { type: "GO" },
    {
      actions: {
        fail: () => {
          throw Error("Action failed");
        },
      },
    },
  );
  assert.equal(s.status, "error");
  assert.deepEqual(s.activeIds, before.activeIds);
});
test("trace bounded, replay deterministic, scenario expectations explicit", () => {
  const d = simple();
  const events = [{ type: "GO" }, { type: "FINISH" }];
  const a = replayMachineEvents(d, events, { traceLimit: 2 });
  assert.equal(a.trace.length, 2);
  assert.deepEqual(replayMachineEvents(d, events, { traceLimit: 2 }), a);
  assert.equal(
    runMachineScenario(d, { id: "s", label: "Complete", events, expectedActiveIds: ["done"] })
      .passed,
    true,
  );
  assert.equal(
    runMachineScenario(d, { id: "s", label: "Wrong", events, expectedActiveIds: ["busy"] }).passed,
    false,
  );
});
test("inspection buffer deduplicates, caps and selects without dispatch", () => {
  const session: MachineInspectionSession = { source: "committed", connection: "gap", frames: [] };
  const frame = {
    id: "1",
    timestamp: 1,
    actorId: "root",
    machineId: "main",
    activeIds: ["idle"],
    transitionIds: ["start"],
  };
  const first = appendMachineInspectionFrame(session, frame);
  assert.equal(appendMachineInspectionFrame(first, frame), first);
  const second = appendMachineInspectionFrame(first, { ...frame, id: "2" }, 1);
  assert.equal(second.frames.length, 1);
  assert.equal(second.connection, "gap");
  assert.equal(selectMachineInspectionFrame(second)?.id, "2");
  assert.equal(selectMachineInspectionFrame(second, "1"), undefined);
  assert.deepEqual(machineTransitionCoverage(first.frames, ["start", "finish"]), {
    visited: ["start"],
    unvisited: ["finish"],
    ratio: 0.5,
  });
});

test("moving a container translates positioned and unpositioned descendants", () => {
  const d = parallel();
  const before = layoutMachineGraph(graph(d));
  const origin = before.nodes.find((n) => n.id === "work")!;
  const moved = applyMachineCommand(d, {
    type: "move-node",
    machineId: "main",
    id: "work",
    position: { x: origin.x + 90, y: origin.y + 70 },
  });
  assert.equal(moved.ok, true);
  const after = layoutMachineGraph(graph(moved.document));
  for (const id of ["work", "left", "a", "b", "right", "c", "d"]) {
    const a = before.nodes.find((n) => n.id === id)!;
    const b = after.nodes.find((n) => n.id === id)!;
    assert.equal(b.x - a.x, 90);
    assert.equal(b.y - a.y, 70);
  }
});
test("reparent clears old initial pointers atomically", () => {
  const d = parallel();
  const moved = applyMachineCommand(d, {
    type: "reparent-node",
    machineId: "main",
    id: "a",
    parentId: "right",
  });
  assert.equal(moved.ok, true);
  assert.equal(graph(moved.document).nodes.find((n) => n.id === "left")?.initialId, undefined);
});
test("self-transition reenters but internal descendant transition retains container", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "parent",
    nodes: [
      { id: "parent", label: "Parent", kind: "compound", initialId: "a" },
      { id: "a", label: "A", kind: "atomic", parentId: "parent" },
      { id: "b", label: "B", kind: "atomic", parentId: "parent" },
    ],
    transitions: [
      { id: "self", sourceId: "a", targetId: "a", event: "SELF" },
      { id: "internal", sourceId: "parent", targetId: "b", event: "INNER", internal: true },
    ],
  });
  const initial = createMachineSnapshot(d);
  const self = sendMachineEvent(d, initial, { type: "SELF" });
  assert.deepEqual(self.trace.at(-1)?.exited, ["a"]);
  assert.deepEqual(self.trace.at(-1)?.entered, ["a"]);
  const inner = sendMachineEvent(d, initial, { type: "INNER" });
  assert.deepEqual(inner.trace.at(-1)?.exited, ["a"]);
  assert.deepEqual(inner.trace.at(-1)?.entered, ["b"]);
  assert.deepEqual(inner.activeIds, ["parent", "b"]);
});
test("inherited callback dictionary properties are never executed", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: [{ ...g.transitions[0]!, guard: "toString", actions: ["valueOf"] }],
  });
  const initial = createMachineSnapshot(d);
  assert.equal(getEnabledMachineTransitions(d, initial, { type: "GO" }, { guards: {} }).length, 0);
  const unguarded = withGraph({
    ...g,
    transitions: [{ ...g.transitions[0]!, actions: ["toString"] }],
  });
  assert.deepEqual(
    sendMachineEvent(unguarded, createMachineSnapshot(unguarded), { type: "GO" }, { actions: {} })
      .activeIds,
    ["busy"],
  );
});

test("external transitions targeting an ancestor reenter it", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "p",
    nodes: [
      { id: "p", label: "P", kind: "compound", initialId: "a" },
      { id: "a", label: "A", kind: "atomic", parentId: "p" },
    ],
    transitions: [{ id: "reset", sourceId: "a", targetId: "p", event: "RESET" }],
  });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "RESET" });
  assert.deepEqual(s.trace.at(-1)?.exited, ["a", "p"]);
  assert.deepEqual(s.trace.at(-1)?.entered, ["p", "a"]);
});

test("a nested target initializes parallel siblings but not target's alternative", () => {
  const g = graph(parallel());
  const d = withGraph({
    ...g,
    initialId: "outside",
    nodes: [...g.nodes, { id: "outside", label: "Outside", kind: "atomic" }],
    transitions: [
      ...g.transitions,
      { id: "jump", sourceId: "outside", targetId: "b", event: "JUMP" },
    ],
  });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "JUMP" });
  assert.deepEqual(s.activeIds, ["work", "left", "b", "right", "c"]);
});
test("cross-region transition resets the other parallel region consistently", () => {
  const g = graph(parallel());
  const d = withGraph({
    ...g,
    transitions: [...g.transitions, { id: "cross", sourceId: "b", targetId: "d", event: "CROSS" }],
  });
  // Finals cannot have outgoing transitions; use an ordinary completed-looking state.
  const usable = withGraph({
    ...graph(d),
    nodes: graph(d).nodes.map((n) => (n.id === "b" ? { ...n, kind: "atomic" } : n)),
  });
  let s = sendMachineEvent(usable, createMachineSnapshot(usable), { type: "LEFT" });
  s = sendMachineEvent(usable, s, { type: "CROSS" });
  assert.deepEqual(s.activeIds, ["work", "left", "a", "right", "d"]);
});
test("ordered transitions select first enabled guard only", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: [
      { id: "no", sourceId: "idle", targetId: "done", event: "GO", guard: "false" },
      { id: "yes", sourceId: "idle", targetId: "busy", event: "GO", guard: "true" },
      { id: "later", sourceId: "idle", targetId: "done", event: "GO" },
    ],
  });
  const s = sendMachineEvent(
    d,
    createMachineSnapshot(d),
    { type: "GO" },
    { guards: { false: () => false, true: () => true } },
  );
  assert.deepEqual(s.activeIds, ["busy"]);
  assert.deepEqual(s.trace.at(-1)?.transitionIds, ["yes"]);
});
test("entry actions can enable a following automatic transition", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: g.nodes.map((n) => (n.id === "busy" ? { ...n, entry: ["enable"] } : n)),
    transitions: [g.transitions[0]!, { ...g.transitions[1]!, event: undefined, guard: "ready" }],
  });
  const options = {
    actions: { enable: (c: Readonly<Record<string, unknown>>) => ({ ...c, ready: true }) },
    guards: { ready: (c: Readonly<Record<string, unknown>>) => c.ready === true },
  };
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "GO" }, options);
  assert.equal(s.status, "done");
  assert.equal(s.trace.at(-1)?.event, "");
});
test("automatic transitions across a two-node cycle stop at the precise budget", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: [
      { id: "a", sourceId: "idle", targetId: "busy" },
      { id: "b", sourceId: "busy", targetId: "idle" },
    ],
  });
  const s = createMachineSnapshot(d, undefined, {}, { maxMicrosteps: 7 });
  assert.equal(s.sequence, 7);
  assert.equal(s.status, "error");
});
test("a final automatic transition exactly on the budget does not report a cycle", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, event: undefined })),
  });
  const s = createMachineSnapshot(d, undefined, {}, { maxMicrosteps: 2 });
  assert.equal(s.status, "done");
  assert.equal(s.sequence, 2);
});
test("zero microstep and trace limits clamp safely to one", () => {
  const g = graph(simple());
  const d = withGraph({ ...g, transitions: [{ id: "self", sourceId: "idle", targetId: "idle" }] });
  const s = createMachineSnapshot(d, undefined, {}, { maxMicrosteps: 0, traceLimit: 0 });
  assert.equal(s.sequence, 1);
  assert.equal(s.trace.length, 1);
  assert.equal(s.status, "error");
});
test("throwing entry callbacks produce a clear start error", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: g.nodes.map((n) => (n.id === "idle" ? { ...n, entry: ["fail"] } : n)),
  });
  const s = createMachineSnapshot(
    d,
    undefined,
    {},
    {
      actions: {
        fail: () => {
          throw Error("entry failure");
        },
      },
    },
  );
  assert.equal(s.status, "error");
  assert.match(s.error ?? "", /entry failure/);
});
test("asynchronous action callbacks are rejected rather than stored as context", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, actions: ["async"] })),
  });
  const options = {
    actions: { async: () => Promise.resolve({}) },
  } as unknown as import("../src/core/machine/index.js").MachineRuntimeOptions;
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "GO" }, options);
  assert.equal(s.status, "error");
  assert.match(s.error ?? "", /context object/);
});
test("invalid callback results do not commit earlier action updates", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, actions: ["first", "invalid"] })),
  });
  const options = {
    actions: { first: () => ({ changed: true }), invalid: () => null },
  } as unknown as import("../src/core/machine/index.js").MachineRuntimeOptions;
  const original = { original: true };
  const s = sendMachineEvent(
    d,
    createMachineSnapshot(d, undefined, original),
    { type: "GO" },
    options,
  );
  assert.equal(s.status, "error");
  assert.equal(s.context, original);
});
test("named missing actions are recorded but never evaluated", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    transitions: g.transitions.map((t) => ({ ...t, actions: ["window.alert(1)"] })),
  });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "GO" });
  assert.deepEqual(s.trace.at(-1)?.actions, ["window.alert(1)"]);
  assert.deepEqual(s.context, {});
});
test("empty machine has actionable warning and simulator error", () => {
  const d = withGraph({ id: "empty", label: "Empty", nodes: [], transitions: [] });
  assert.ok(validateMachineDocument(d).some((i) => i.code === "missing-root-initial"));
  assert.equal(createMachineSnapshot(d).status, "error");
});
test("invalid document does not start simulation", () => {
  const d = { ...simple(), rootId: "absent" };
  const s = createMachineSnapshot(d);
  assert.equal(s.status, "error");
  assert.deepEqual(s.activeIds, []);
});
test("invalid active machine is reported without crashing", () => {
  const d = simple();
  assert.equal(createMachineSnapshot(d, "absent").status, "error");
  const snapshot = { ...createMachineSnapshot(d), machineId: "absent" };
  assert.equal(sendMachineEvent(d, snapshot, { type: "GO" }).status, "error");
});
test("JSON prototype keys remain inert data", () => {
  const source = serializeMachineDocument(simple()).replace(
    '"version": 1',
    '"__proto__": {"polluted": true}, "version": 1',
  );
  const result = parseMachineDocument(source);
  assert.equal(result.ok, true);
  assert.equal(({} as { polluted?: boolean }).polluted, undefined);
  assert.equal(Object.getPrototypeOf(result.document), Object.prototype);
});
test("malformed node arrays and fields never pass validation", () => {
  const base = simple();
  const cases = [
    { entry: "run" },
    { exit: [4] },
    { tags: [""] },
    { position: { x: "1", y: 2 } },
    { kind: { name: "atomic" } },
    { parentId: 3 },
  ];
  for (const patch of cases) {
    const d = {
      ...base,
      machines: [{ ...graph(base), nodes: [{ ...graph(base).nodes[0], ...patch }] }],
    };
    assert.ok(validateMachineDocument(d).some((i) => i.severity === "error"));
  }
});
test("malformed transition fields rejected", () => {
  const base = simple();
  for (const patch of [
    { event: [] },
    { guard: {} },
    { actions: "run" },
    { actions: [null] },
    { internal: "yes" },
  ]) {
    const d = {
      ...base,
      machines: [{ ...graph(base), transitions: [{ ...graph(base).transitions[0], ...patch }] }],
    };
    assert.ok(validateMachineDocument(d).some((i) => i.severity === "error"));
  }
});
test("missing submachine and invalid initial targets identify exact node", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "p",
    nodes: [
      { id: "p", label: "P", kind: "compound", initialId: "outside" },
      { id: "outside", label: "Outside", kind: "submachine", machineId: "missing" },
    ],
    transitions: [],
  });
  const issues = validateMachineDocument(d);
  assert.ok(issues.some((i) => i.code === "invalid-initial" && i.nodeId === "p"));
  assert.ok(issues.some((i) => i.code === "missing-machine" && i.nodeId === "outside"));
});
test("transition command updates and deletes without changing source data", () => {
  const d = simple();
  const updated = applyMachineCommand(d, {
    type: "update-transition",
    machineId: "main",
    id: "start",
    patch: { event: "BEGIN", guard: "allowed" },
  });
  assert.equal(updated.ok, true);
  assert.equal(graph(d).transitions[0]?.event, "GO");
  assert.equal(graph(updated.document).transitions[0]?.event, "BEGIN");
  const removed = applyMachineCommand(updated.document, {
    type: "delete-transition",
    machineId: "main",
    id: "start",
  });
  assert.equal(removed.ok, true);
  assert.equal(graph(removed.document).transitions.length, 1);
});
test("adding another machine preserves root and rejects duplicates", () => {
  const d = simple();
  const result = applyMachineCommand(d, {
    type: "add-machine",
    machine: { id: "child", label: "Child", nodes: [], transitions: [] },
  });
  assert.equal(result.ok, true);
  assert.equal(result.document.rootId, "main");
  assert.equal(result.document.machines.length, 2);
  assert.equal(applyMachineCommand(d, { type: "add-machine", machine: graph(d) }).ok, false);
});
test("undo and redo empty histories retain identity", () => {
  const h = createMachineHistory(simple());
  assert.equal(undoMachineHistory(h), h);
  assert.equal(redoMachineHistory(h), h);
  assert.equal(commitMachineHistory(h, h.present), h);
});
test("layout handles empty and cyclic invalid input without recursive runaway", () => {
  assert.equal(
    layoutMachineGraph({ id: "m", label: "M", nodes: [], transitions: [] }).nodes.length,
    0,
  );
  const d = withGraph({
    id: "m",
    label: "M",
    nodes: [
      { id: "a", label: "A", kind: "compound", parentId: "b" },
      { id: "b", label: "B", kind: "compound", parentId: "a" },
    ],
    transitions: [],
  });
  assert.equal(layoutMachineGraph(graph(d)).nodes.length, 0);
});
test("coverage excludes unknown IDs and deduplicates known transition IDs", () => {
  assert.deepEqual(
    machineTransitionCoverage([{ transitionIds: ["x", "a", "a"] }], ["a", "a", "b"]),
    { visited: ["a"], unvisited: ["b"], ratio: 0.5 },
  );
  assert.equal(machineTransitionCoverage([], []).ratio, 1);
});
test("scenario with no expected configuration does not falsely claim success", () => {
  assert.equal(
    runMachineScenario(simple(), { id: "explore", label: "Explore", events: [{ type: "GO" }] })
      .passed,
    undefined,
  );
});

test("topology layout ranks forward edges and stacks independent siblings", () => {
  const d = simple();
  const lr = layoutMachineGraph(graph(d), "LR");
  const idle = lr.nodes.find((n) => n.id === "idle")!,
    busy = lr.nodes.find((n) => n.id === "busy")!,
    done = lr.nodes.find((n) => n.id === "done")!;
  assert.ok(idle.x < busy.x && busy.x < done.x);
  const disconnected = layoutMachineGraph({ ...graph(d), transitions: [] }, "LR");
  assert.equal(new Set(disconnected.nodes.map((n) => n.x)).size, 1);
  assert.equal(new Set(disconnected.nodes.map((n) => n.y)).size, 3);
});
test("cyclic topology shares a bounded layer and outgoing states advance", () => {
  const g = graph(simple());
  const layout = layoutMachineGraph({
    ...g,
    transitions: [
      ...g.transitions,
      { id: "back", sourceId: "busy", targetId: "idle", event: "BACK" },
    ],
  });
  const idle = layout.nodes.find((n) => n.id === "idle")!,
    busy = layout.nodes.find((n) => n.id === "busy")!,
    done = layout.nodes.find((n) => n.id === "done")!;
  assert.equal(idle.x, busy.x);
  assert.ok(done.x > busy.x);
  assert.ok(layout.width < 1000);
});
test("dragged child left and above parent remains enclosed", () => {
  const g = graph(parallel());
  const layout = layoutMachineGraph({
    ...g,
    nodes: g.nodes.map((n) => (n.id === "a" ? { ...n, position: { x: 0, y: 0 } } : n)),
  });
  for (const node of g.nodes.filter((n) => n.parentId)) {
    const r = layout.nodes.find((n) => n.id === node.id)!,
      p = layout.nodes.find((n) => n.id === node.parentId)!;
    assert.ok(
      r.x >= p.x &&
        r.y >= p.y &&
        r.x + r.width <= p.x + p.width &&
        r.y + r.height <= p.y + p.height,
    );
  }
});
test("inspection explicit sequence detects gaps and rejects late frames", () => {
  const first = {
    id: "1",
    timestamp: 1,
    sequence: 10,
    actorId: "a",
    machineId: "m",
    activeIds: [],
  };
  let s: MachineInspectionSession = { source: "committed", connection: "connected", frames: [] };
  s = appendMachineInspectionFrame(s, first);
  assert.equal(s.continuity, "unknown");
  s = appendMachineInspectionFrame(s, { ...first, id: "2", sequence: 11 });
  assert.equal(s.continuity, "contiguous");
  s = appendMachineInspectionFrame(s, { ...first, id: "3", sequence: 13 });
  assert.equal(s.connection, "gap");
  assert.equal(s.continuity, "gap");
  const late = appendMachineInspectionFrame(s, { ...first, id: "late", sequence: 12 });
  assert.equal(late.frames, s.frames);
  assert.equal(late.lastRejected?.reason, "late");
});
test("committed inspection feed rejects speculative and malformed sequence frames", () => {
  const s: MachineInspectionSession = { source: "committed", connection: "connected", frames: [] };
  const frame = {
    id: "s",
    timestamp: 1,
    actorId: "a",
    machineId: "m",
    activeIds: [],
    committed: false,
  };
  assert.equal(appendMachineInspectionFrame(s, frame).lastRejected?.reason, "uncommitted");
  assert.equal(
    appendMachineInspectionFrame(s, { ...frame, committed: true, sequence: NaN }).lastRejected
      ?.reason,
    "invalid-sequence",
  );
});
test("timestamp-only inspection feed cannot claim contiguous history", () => {
  const s: MachineInspectionSession = { source: "live", connection: "connected", frames: [] };
  const frame = { id: "s", timestamp: 1, actorId: "a", machineId: "m", activeIds: [] };
  const next = appendMachineInspectionFrame(appendMachineInspectionFrame(s, frame), {
    ...frame,
    id: "t",
    timestamp: 0,
  });
  assert.equal(next.continuity, "unknown");
  assert.equal(next.frames.length, 2);
});

test("an unsequenced frame keeps continuity unknown until explicit session reset", () => {
  const frame = { id: "1", timestamp: 1, actorId: "a", machineId: "m", activeIds: [], sequence: 1 };
  let s: MachineInspectionSession = { source: "live", connection: "connected", frames: [] };
  s = appendMachineInspectionFrame(s, frame);
  s = appendMachineInspectionFrame(s, { ...frame, id: "2", sequence: undefined });
  s = appendMachineInspectionFrame(s, { ...frame, id: "3", sequence: 2 });
  assert.equal(s.continuity, "unknown");
  s = appendMachineInspectionFrame(s, { ...frame, id: "4", sequence: 3 });
  assert.equal(s.continuity, "unknown");
});

test("completed parallel regions retain parent transitions until top-level final", () => {
  const g = graph(parallel());
  const d = withGraph({
    ...g,
    transitions: [
      ...g.transitions,
      { id: "ship", sourceId: "work", targetId: "stop", event: "SHIPPED" },
    ],
  });
  let s = createMachineSnapshot(d);
  s = sendMachineEvent(d, s, { type: "LEFT" });
  s = sendMachineEvent(d, s, { type: "RIGHT" });
  assert.equal(s.status, "running");
  assert.deepEqual(s.activeIds, ["work", "left", "b", "right", "d"]);
  assert.ok(getEnabledMachineTransitions(d, s, { type: "SHIPPED" }).some((t) => t.id === "ship"));
  s = sendMachineEvent(d, s, { type: "SHIPPED" });
  assert.equal(s.status, "done");
  assert.deepEqual(s.activeIds, ["stop"]);
});
test("compound final child does not disable parent outgoing event", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "p",
    nodes: [
      { id: "p", label: "P", kind: "compound", initialId: "ready" },
      { id: "ready", label: "Ready", kind: "final", parentId: "p" },
      { id: "done", label: "Done", kind: "final" },
    ],
    transitions: [{ id: "finish", sourceId: "p", targetId: "done", event: "FINISH" }],
  });
  const initial = createMachineSnapshot(d);
  assert.equal(initial.status, "running");
  assert.equal(sendMachineEvent(d, initial, { type: "FINISH" }).status, "done");
});

test("empty optional reference strings are invalid rather than different roots", () => {
  for (const key of ["parentId", "initialId", "machineId"]) {
    const g = graph(simple());
    const d = withGraph({
      ...g,
      nodes: g.nodes.map((n) => (n.id === "idle" ? { ...n, [key]: "" } : n)),
    });
    assert.ok(
      validateMachineDocument(d).some((i) => i.code === "empty-reference" && i.nodeId === "idle"),
    );
    assert.equal(parseMachineDocument(serializeMachineDocument(d)).ok, false);
  }
});
test("structural reachability warns about orphan states and includes parallel branches", () => {
  const g = graph(parallel());
  const d = withGraph({
    ...g,
    nodes: [
      ...g.nodes,
      { id: "orphan", label: "Orphan", kind: "atomic" },
      { id: "note", label: "Note", kind: "note" },
    ],
  });
  const unreachable = validateMachineDocument(d).filter((i) => i.code === "unreachable-state");
  assert.deepEqual(
    unreachable.map((i) => i.nodeId),
    ["orphan"],
  );
  assert.equal(unreachable[0]?.severity, "warning");
});
test("reachability follows automatic initial edges and treats guarded edges as possible", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    nodes: [
      { id: "i", label: "I", kind: "initial" },
      { id: "a", label: "A", kind: "atomic" },
      { id: "b", label: "B", kind: "atomic" },
    ],
    transitions: [
      { id: "init", sourceId: "i", targetId: "a" },
      { id: "next", sourceId: "a", targetId: "b", event: "GO", guard: "unknown" },
    ],
  });
  assert.equal(validateMachineDocument(d).filter((i) => i.code === "unreachable-state").length, 0);
});

test("moving a top-down unpositioned compound preserves every descendant delta", () => {
  const d = parallel();
  const before = layoutMachineGraph(graph(d), "TB");
  const root = before.nodes.find((n) => n.id === "work")!;
  const moved = applyMachineCommand(d, {
    type: "move-node",
    machineId: "main",
    id: "work",
    position: { x: root.x + 75, y: root.y + 90 },
    direction: "TB",
  });
  assert.equal(moved.ok, true);
  const after = layoutMachineGraph(graph(moved.document), "TB");
  for (const id of ["work", "left", "a", "b", "right", "c", "d"]) {
    const a = before.nodes.find((n) => n.id === id)!,
      b = after.nodes.find((n) => n.id === id)!;
    assert.equal(b.x - a.x, 75);
    assert.equal(b.y - a.y, 90);
  }
});
test("accidental rejecting async guards and actions do not leak unhandled rejections", async () => {
  const g = graph(simple());
  const guardDoc = withGraph({ ...g, transitions: [{ ...g.transitions[0]!, guard: "async" }] });
  const actionDoc = withGraph({
    ...g,
    transitions: [{ ...g.transitions[0]!, actions: ["async"] }],
  });
  const options = {
    guards: { async: () => Promise.reject(Error("guard rejected")) },
    actions: { async: () => Promise.reject(Error("action rejected")) },
  } as unknown as import("../src/core/machine/index.js").MachineRuntimeOptions;
  assert.equal(
    getEnabledMachineTransitions(guardDoc, createMachineSnapshot(guardDoc), { type: "GO" }, options)
      .length,
    0,
  );
  assert.equal(
    sendMachineEvent(actionDoc, createMachineSnapshot(actionDoc), { type: "GO" }, options).status,
    "error",
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
});

test("internal child self-transition preempts ancestor despite its empty exit set", () => {
  const d = withGraph({
    id: "m",
    label: "M",
    initialId: "p",
    nodes: [
      { id: "p", label: "P", kind: "compound", initialId: "a" },
      { id: "a", label: "A", kind: "atomic", parentId: "p" },
      { id: "outside", label: "Outside", kind: "final" },
    ],
    transitions: [
      { id: "internal", sourceId: "a", targetId: "a", event: "GO", internal: true },
      { id: "escape", sourceId: "p", targetId: "outside", event: "GO" },
    ],
  });
  const s = sendMachineEvent(d, createMachineSnapshot(d), { type: "GO" });
  assert.deepEqual(s.activeIds, ["p", "a"]);
  assert.deepEqual(s.trace.at(-1)?.transitionIds, ["internal"]);
  assert.deepEqual(s.trace.at(-1)?.exited, []);
});

test("notes attach without becoming hierarchical children and survive target deletion", () => {
  const g = graph(simple());
  const d = withGraph({
    ...g,
    nodes: [...g.nodes, { id: "note", label: "Note", kind: "note", attachedToId: "busy" }],
  });
  assert.equal(
    validateMachineDocument(d).some((i) => i.severity === "error"),
    false,
  );
  const removed = applyMachineCommand(d, { type: "delete-node", machineId: "main", id: "busy" });
  assert.equal(removed.ok, true);
  assert.equal(graph(removed.document).nodes.find((n) => n.id === "note")?.attachedToId, undefined);
  assert.ok(graph(removed.document).nodes.some((n) => n.id === "note"));
  assert.equal(
    parseMachineDocument(serializeMachineDocument(d)).document?.machines[0]?.nodes.at(-1)
      ?.attachedToId,
    "busy",
  );
});
test("note attachments reject missing targets, other notes and non-note owners", () => {
  const g = graph(simple());
  for (const node of [
    { id: "n", label: "N", kind: "note" as const, attachedToId: "absent" },
    { id: "n", label: "N", kind: "note" as const, attachedToId: "n" },
    { id: "n", label: "N", kind: "atomic" as const, attachedToId: "idle" },
  ]) {
    assert.ok(
      validateMachineDocument(withGraph({ ...g, nodes: [...g.nodes, node] })).some(
        (i) => i.code === "invalid-note-attachment",
      ),
    );
  }
});
test("scenario duplicate expected IDs never create false-positive success", () => {
  const d = parallel();
  const initial = createMachineSnapshot(d);
  const fake = Array(initial.activeIds.length).fill("work");
  assert.equal(
    runMachineScenario(d, {
      id: "bad",
      label: "Bad assertion",
      events: [],
      expectedActiveIds: fake,
    }).passed,
    false,
  );
});

test("deep unused imported data cannot later overflow serialization", () => {
  const base = serializeMachineDocument(simple());
  const source =
    base.slice(0, -1) + ',"extra":' + '{"child":'.repeat(70) + "null" + "}".repeat(70) + "}";
  const result = parseMachineDocument(source);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0]?.code, "import-complexity");
});
