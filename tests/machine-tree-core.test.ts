import assert from "node:assert/strict";
import test from "node:test";
import {
  buildMachineTree,
  findMachineTreeRow,
  machineTreeAncestors,
  machineTreeRowId,
  projectMachineTree,
  resolveMachineTreeSource,
  resolveMachineTreeTarget,
} from "../src/core/machine/tree.js";
import type { MachineDocument, MachineNode } from "../src/core/machine/types.js";

function document(nodes: readonly MachineNode[] = []): MachineDocument {
  return {
    version: 1,
    rootId: "main",
    machines: [{ id: "main", label: "Main", nodes, transitions: [] }],
  };
}
function sample(): MachineDocument {
  return {
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "detail",
        label: "Detail",
        nodes: [{ id: "done", label: "Done", kind: "final" }],
        transitions: [],
      },
      {
        id: "main",
        label: "Main",
        initialId: "phase",
        nodes: [
          { id: "phase", label: "Phase", kind: "parallel" },
          { id: "region", label: "Region", kind: "compound", parentId: "phase", initialId: "work" },
          {
            id: "work",
            label: "Work",
            kind: "atomic",
            parentId: "region",
            entry: ["prepare"],
            tags: ["important"],
          },
          { id: "side", label: "Side", kind: "atomic", parentId: "phase" },
          { id: "note", label: "A note", kind: "note", attachedToId: "work" },
          { id: "reference", label: "Reference", kind: "submachine", machineId: "detail" },
        ],
        transitions: [
          {
            id: "finish",
            sourceId: "work",
            targetId: "reference",
            event: "FINISH",
            guard: "allowed",
            actions: ["record"],
          },
        ],
      },
    ],
  };
}

test("tree preserves hierarchy, original identity, source ordering and document immutability", () => {
  const input = sample();
  const before = JSON.stringify(input);
  const model = buildMachineTree(input);
  assert.deepEqual(
    model.rows.map((row) => row.elementId),
    ["main", "phase", "region", "work", "finish", "side", "note", "reference", "detail", "done"],
  );
  assert.deepEqual(
    model.rows.map((row) => row.depth),
    [0, 1, 2, 3, 4, 2, 1, 1, 0, 1],
  );
  assert.equal(
    findMachineTreeRow(model, "main", "node", "work")?.node,
    input.machines[1]?.nodes[2],
  );
  assert.equal(findMachineTreeRow(model, "main", "node", "phase")?.initial, true);
  assert.equal(findMachineTreeRow(model, "main", "node", "work")?.initial, true);
  assert.equal(
    findMachineTreeRow(model, "main", "node", "note")?.parentId,
    machineTreeRowId("machine", "main"),
  );
  assert.equal(findMachineTreeRow(model, "main", "node", "reference")?.childIds.length, 0);
  assert.equal(JSON.stringify(input), before);
  assert.equal(model.truncated, false);
  assert.deepEqual(model.issues, []);
});

test("tree distinguishes exact active states from derived active ancestors without activating annotations", () => {
  const model = buildMachineTree(sample(), {
    activeStates: [{ machineId: "main", activeIds: ["work", "side", "note", "missing"] }],
  });
  const work = findMachineTreeRow(model, "main", "node", "work")!;
  const phase = findMachineTreeRow(model, "main", "node", "phase")!;
  assert.equal(work.active, true);
  assert.equal(work.activeDescendant, false);
  assert.equal(phase.active, false);
  assert.equal(phase.activeDescendant, true);
  assert.equal(findMachineTreeRow(model, "main", "machine")?.active, false);
  assert.equal(findMachineTreeRow(model, "main", "machine")?.activeDescendant, true);
  assert.equal(findMachineTreeRow(model, "main", "node", "note")?.active, false);
  assert.equal(findMachineTreeRow(model, "detail", "node", "done")?.active, false);
  assert.equal(findMachineTreeRow(model, "main", "transition", "finish")?.active, false);
});

test("search reveals match ancestors without changing saved folding and excludes hidden categories", () => {
  const model = buildMachineTree(sample());
  const collapsed = new Set<string>();
  assert.deepEqual(
    projectMachineTree(model, { expandedIds: collapsed }).rows.map((row) => row.elementId),
    ["main", "detail"],
  );
  for (const query of ["finish", "allowed", "record"]) {
    const projection = projectMachineTree(model, { query, expandedIds: collapsed });
    assert.deepEqual(
      projection.rows.map((row) => row.elementId),
      ["main", "phase", "region", "work", "finish"],
    );
    assert.equal(projection.matchCount, 1);
    assert.equal(projection.rows[0]?.context, true);
    assert.equal(projection.rows.at(-1)?.match, true);
    assert.equal(projection.rows.at(-1)?.expanded, false);
  }
  assert.equal(projectMachineTree(model, { query: "PREPARE" }).matchCount, 1);
  assert.equal(projectMachineTree(model, { query: "important" }).matchCount, 1);
  assert.equal(projectMachineTree(model, { query: "detail" }).matchCount, 1);
  assert.deepEqual(projectMachineTree(model, { query: "finish", showTransitions: false }).rows, []);
  assert.deepEqual(projectMachineTree(model, { query: "a note", showNotes: false }).rows, []);
  assert.equal(collapsed.size, 0);
  assert.deepEqual(
    projectMachineTree(model, { query: " ", expandedIds: collapsed }).rows.map(
      (row) => row.elementId,
    ),
    ["main", "detail"],
  );
});

test("projection derives accessible sibling position from filtered visible hierarchy", () => {
  const model = buildMachineTree(sample());
  const full = projectMachineTree(model, { showNotes: false, showTransitions: false });
  const phase = full.rows.find((row) => row.elementId === "phase")!;
  const reference = full.rows.find((row) => row.elementId === "reference")!;
  assert.equal(phase.posInSet, 1);
  assert.equal(reference.posInSet, 2);
  assert.equal(reference.setSize, 2);
  assert.equal(phase.level, 2);
  assert.equal(phase.hasChildren, true);
  assert.equal(reference.hasChildren, false);
  const limited = projectMachineTree(model, { maxVisibleRows: 3 });
  assert.equal(limited.rows.length, 3);
  assert.equal(limited.truncated, true);
  assert.equal(projectMachineTree(model, { maxVisibleRows: 0 }).truncated, true);
});

test("target and ancestor navigation preserve graph occurrence and never expand referenced graphs recursively", () => {
  const model = buildMachineTree(sample());
  const edge = findMachineTreeRow(model, "main", "transition", "finish")!;
  const target = resolveMachineTreeTarget(model, edge.id)!;
  assert.equal(target.elementId, "reference");
  assert.equal(resolveMachineTreeTarget(model, target.id)?.machineId, "detail");
  assert.deepEqual(machineTreeAncestors(model, edge.id), [
    machineTreeRowId("machine", "main"),
    machineTreeRowId("node", "main", "phase"),
    machineTreeRowId("node", "main", "region"),
    machineTreeRowId("node", "main", "work"),
  ]);
  assert.deepEqual(machineTreeAncestors(model, "missing"), []);
  assert.equal(resolveMachineTreeTarget(model, "missing"), undefined);
});

test("invalid parents and cycles remain reachable with deterministic recovery diagnostics", () => {
  const input = document([
    { id: "a", label: "A", kind: "compound", parentId: "b" },
    { id: "b", label: "B", kind: "compound", parentId: "a" },
    { id: "self", label: "Self", kind: "parallel", parentId: "self" },
    { id: "plain", label: "Plain", kind: "atomic" },
    { id: "child", label: "Child", kind: "atomic", parentId: "plain" },
    { id: "orphan", label: "Orphan", kind: "atomic", parentId: "absent" },
  ]);
  const model = buildMachineTree(input);
  assert.equal(model.rows.length, 7);
  assert.equal(new Set(model.rows.map((row) => row.id)).size, 7);
  assert.equal(model.issues.filter((issue) => issue.code === "parent-cycle").length, 2);
  assert.equal(model.issues.filter((issue) => issue.code === "invalid-parent").length, 2);
  assert.equal(findMachineTreeRow(model, "main", "node", "a")?.recovered, true);
  assert.equal(findMachineTreeRow(model, "main", "node", "child")?.depth, 1);
  assert.deepEqual(buildMachineTree(input), model);
});

test("duplicate and hostile IDs retain distinct rows and resolve canonical references safely", () => {
  const input: MachineDocument = {
    version: 1,
    rootId: "__proto__",
    machines: [0, 1].map(() => ({
      id: "__proto__",
      label: "Graph",
      nodes: [
        { id: "constructor", label: "First", kind: "atomic" as const },
        { id: "constructor", label: "Second", kind: "atomic" as const },
        { id: 'a","0', label: "Quoted", kind: "atomic" as const },
      ],
      transitions: [0, 1].map(() => ({
        id: "constructor",
        sourceId: "constructor",
        targetId: "constructor",
      })),
    })),
  };
  const model = buildMachineTree(input);
  assert.equal(model.rows.length, 12);
  assert.equal(new Set(model.rows.map((row) => row.id)).size, 12);
  assert.equal(findMachineTreeRow(model, "__proto__", "node", "constructor")?.label, "First");
  assert.equal(model.issues.filter((issue) => issue.code === "duplicate-node").length, 2);
  assert.equal(model.issues.filter((issue) => issue.code === "duplicate-transition").length, 2);
  assert.equal(model.issues.filter((issue) => issue.code === "duplicate-machine").length, 1);
  for (const row of model.rows.filter((row) => row.kind === "transition")) {
    assert.equal(resolveMachineTreeTarget(model, row.id)?.graph, row.graph);
    assert.equal(resolveMachineTreeTarget(model, row.id)?.label, "First");
  }
  assert.notEqual(machineTreeRowId("node", "a:b", "c"), machineTreeRowId("node", "a", "b:c"));
});

test("dangling edges and references stay visible and produce explicit diagnostics", () => {
  const input: MachineDocument = {
    version: 1,
    rootId: "absent",
    machines: [
      {
        id: "main",
        label: "Main",
        nodes: [
          { id: "ref", label: "Reference", kind: "submachine", machineId: "absent" },
          { id: "note", label: "Note", kind: "note" },
        ],
        transitions: [
          { id: "dangling", sourceId: "absent", targetId: "absent" },
          { id: "from-note", sourceId: "note", targetId: "ref" },
        ],
      },
    ],
  };
  const model = buildMachineTree(input);
  assert.equal(model.rows.length, 5);
  const dangling = findMachineTreeRow(model, "main", "transition", "dangling")!;
  assert.equal(dangling.recovered, true);
  assert.equal(dangling.parentId, machineTreeRowId("machine", "main"));
  assert.equal(resolveMachineTreeTarget(model, dangling.id), undefined);
  assert.equal(resolveMachineTreeSource(model, dangling.id), undefined);
  assert.equal(
    resolveMachineTreeSource(model, machineTreeRowId("transition", "main", "from-note")),
    undefined,
  );
  assert.equal(resolveMachineTreeTarget(model, machineTreeRowId("node", "main", "ref")), undefined);
  for (const code of ["missing-root", "missing-source", "missing-target", "missing-submachine"])
    assert.ok(model.issues.some((issue) => issue.code === code));
});

test("repeated graph objects resolve source and target within their own machine-row occurrence", () => {
  const graph = {
    id: "repeated",
    label: "Repeated graph",
    nodes: [
      { id: "a", label: "A", kind: "atomic" as const },
      { id: "b", label: "B", kind: "atomic" as const },
    ],
    transitions: [{ id: "edge", sourceId: "a", targetId: "b", event: "GO" }],
  };
  const model = buildMachineTree({ version: 1, rootId: graph.id, machines: [graph, graph] });
  const edges = model.rows.filter((row) => row.kind === "transition");
  assert.equal(edges.length, 2);
  assert.notEqual(edges[0]?.machineRowId, edges[1]?.machineRowId);
  for (const edge of edges) {
    const source = resolveMachineTreeSource(model, edge.id)!;
    const target = resolveMachineTreeTarget(model, edge.id)!;
    assert.equal(source.elementId, "a");
    assert.equal(target.elementId, "b");
    assert.equal(source.machineRowId, edge.machineRowId);
    assert.equal(target.machineRowId, edge.machineRowId);
    assert.equal(machineTreeAncestors(model, target.id)[0], edge.machineRowId);
  }
  assert.notEqual(
    resolveMachineTreeTarget(model, edges[0]!.id)?.id,
    resolveMachineTreeTarget(model, edges[1]!.id)?.id,
  );
  assert.equal(resolveMachineTreeSource(model, "missing"), undefined);
});

test("deep input is iterative, bounded and recovered without dropping accepted rows", () => {
  const nodes: MachineNode[] = Array.from({ length: 2000 }, (_, index) => ({
    id: `n${index}`,
    label: `Node ${index}`,
    kind: "compound",
    ...(index ? { parentId: `n${index - 1}` } : {}),
  }));
  const model = buildMachineTree(document(nodes), { maxDepth: 4 });
  assert.equal(model.rows.length, 2001);
  assert.ok(model.rows.every((row) => row.depth <= 4));
  assert.ok(model.issues.some((issue) => issue.code === "depth-limit"));
  assert.equal(model.issues.length, 200);
  assert.equal(model.issues.at(-1)?.code, "issue-limit");
  const capped = buildMachineTree(document(nodes), { maxItems: 20 });
  assert.equal(capped.rows.length, 20);
  assert.equal(capped.truncated, true);
  assert.ok(capped.issues.some((issue) => issue.code === "item-limit"));
  assert.deepEqual(buildMachineTree(document(nodes), { maxItems: 0 }).rows, []);
});

test("canonical duplicate navigation follows input occurrence rather than preorder position", () => {
  const graph = {
    id: "main",
    label: "Main",
    nodes: [
      { id: "target", label: "Canonical", kind: "atomic" as const, parentId: "container" },
      { id: "target", label: "Later duplicate", kind: "atomic" as const },
      { id: "container", label: "Container", kind: "compound" as const },
    ],
    transitions: [{ id: "edge", sourceId: "target", targetId: "target" }],
  };
  const model = buildMachineTree({ version: 1, rootId: "main", machines: [graph, graph] });
  for (const edge of model.rows.filter((row) => row.kind === "transition")) {
    assert.equal(resolveMachineTreeTarget(model, edge.id)?.label, "Canonical");
    assert.equal(resolveMachineTreeSource(model, edge.id)?.label, "Canonical");
    assert.equal(resolveMachineTreeTarget(model, edge.id)?.machineRowId, edge.machineRowId);
  }
});

test("invalid canonical annotation source does not fall through to an executable duplicate", () => {
  const model = buildMachineTree({
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Main",
        nodes: [
          { id: "source", label: "Canonical note", kind: "note" },
          { id: "source", label: "Later state", kind: "atomic" },
        ],
        transitions: [{ id: "edge", sourceId: "source", targetId: "source" }],
      },
    ],
  });
  const edge = findMachineTreeRow(model, "main", "transition", "edge")!;
  assert.equal(edge.recovered, true);
  assert.equal(resolveMachineTreeSource(model, edge.id), undefined);
  assert.equal(resolveMachineTreeTarget(model, edge.id), undefined);
  assert.ok(
    model.issues.some((issue) => issue.code === "invalid-target" && issue.rowId === edge.id),
  );
});

test("initial pointers badge only canonical executable direct children and diagnose invalid pointers", () => {
  const model = buildMachineTree({
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Main",
        initialId: "nested",
        nodes: [
          { id: "container", label: "Container", kind: "compound", initialId: "nested" },
          { id: "nested", label: "Canonical nested", kind: "atomic", parentId: "container" },
          { id: "nested", label: "Duplicate nested", kind: "atomic", parentId: "container" },
          { id: "bad", label: "Bad container", kind: "compound", initialId: "note" },
          { id: "note", label: "Note", kind: "note", parentId: "bad" },
          { id: "absent", label: "Missing initial", kind: "compound", initialId: "missing" },
        ],
        transitions: [],
      },
    ],
  });
  assert.deepEqual(
    model.rows.filter((row) => row.initial).map((row) => row.label),
    ["Canonical nested"],
  );
  assert.equal(model.issues.filter((issue) => issue.code === "invalid-initial").length, 3);
  const nestedRoot = buildMachineTree({
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Main",
        initialId: "nested",
        nodes: [
          { id: "container", label: "Container", kind: "compound" },
          { id: "nested", label: "Nested", kind: "atomic", parentId: "container" },
        ],
        transitions: [],
      },
    ],
  });
  assert.equal(findMachineTreeRow(nestedRoot, "main", "node", "nested")?.initial, false);
});
