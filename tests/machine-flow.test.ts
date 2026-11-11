import assert from "node:assert/strict";
import test from "node:test";
import {
  planMachineTreeFlow,
  presentMachineTree,
  type MachineFlow,
  type MachineFlowStep,
} from "../src/core/machine/flow.js";
import { validateMachineDocument } from "../src/core/machine/model.js";
import {
  buildMachineTree,
  machineTreeRowId,
  projectMachineTree,
} from "../src/core/machine/tree.js";
import type {
  MachineDocument,
  MachineGraph,
  MachineNode,
  MachineTransition,
} from "../src/core/machine/types.js";

const state = (id: string, extra: Partial<MachineNode> = {}): MachineNode => ({
  id,
  label: id,
  kind: "atomic",
  ...extra,
});
/** "a>b" is a transition from a to b on event "a>b"; "a>b:GO" names the event. */
const routes = (...specs: string[]): MachineTransition[] =>
  specs.map((spec, index) => {
    const [path, event] = spec.split(":");
    const [sourceId, targetId] = path!.split(">");
    return { id: `t${index}`, sourceId: sourceId!, targetId: targetId!, event: event ?? path! };
  });
function machine(
  nodes: MachineNode[],
  transitions: MachineTransition[],
  extra: Partial<MachineGraph> = {},
): MachineDocument {
  return {
    version: 1,
    rootId: "main",
    machines: [{ id: "main", label: "Main", nodes, transitions, ...extra }],
  };
}
const row = (id: string) => machineTreeRowId("node", "main", id);
const route = (id: string) => machineTreeRowId("transition", "main", id);
const root = machineTreeRowId("machine", "main");
const region = (parent: string | null, name: string) =>
  row(JSON.stringify(["region", parent, name]));
function plan(document: MachineDocument) {
  const model = buildMachineTree(document);
  const flowPlan = planMachineTreeFlow(model);
  return { model, plan: flowPlan, presented: presentMachineTree(model, flowPlan) };
}
/** Every step of a flow, in the order it is drawn. */
function steps(flow: MachineFlow | undefined): MachineFlowStep[] {
  const visit = (list: readonly MachineFlowStep[]): MachineFlowStep[] =>
    list.flatMap((step) => [step, ...step.columns.flatMap((column) => visit(column.steps))]);
  return visit(flow?.steps ?? []);
}
const ids = (list: readonly MachineFlowStep[]) =>
  list.map((step) => (JSON.parse(step.rowId) as string[])[3]);

test("a chain is one linked spine in the order it runs, whatever order the document lists it in", () => {
  const doc = machine([state("c"), state("a"), state("b")], routes("a>b", "b>c"), {
    initialId: "a",
  });
  const { plan: flowPlan, presented } = plan(doc);
  const flow = flowPlan.flows.get(root)!;
  assert.deepEqual(ids(flow.steps), ["a", "b", "c"]);
  assert.deepEqual(
    flow.steps.map((step) => step.linked),
    [false, true, true],
  );
  assert.deepEqual(flow.steps[0]!.main[0], {
    transitionRowIds: [route("t0")],
    inside: false,
    landsOn: row("b"),
    exact: true,
    landing: "next",
  });
  // Reading order becomes tree order, so the keyboard follows the picture.
  assert.deepEqual(
    presented.rows.filter((r) => r.kind === "node").map((r) => r.elementId),
    ["a", "b", "c"],
  );
});

test("alternatives are columns, and the state they meet at sits on the spine below them", () => {
  const doc = machine(
    [state("review"), state("publish"), state("rejected"), state("done", { kind: "final" })],
    routes("review>publish:APPROVE", "review>rejected:REJECT", "publish>done", "rejected>done"),
    { initialId: "review" },
  );
  const flow = plan(doc).plan.flows.get(root)!;
  assert.deepEqual(ids(flow.steps), ["review", "done"]);
  const [review, done] = flow.steps;
  assert.deepEqual(
    review!.columns.map((column) => ids(column.steps)),
    [["publish"], ["rejected"]],
  );
  assert.ok(review!.columns.every((column) => column.rejoins));
  assert.equal(done!.linked, true, "the columns flow back, so the spine carries on into Done");
  assert.ok(flow.meets.has(row("done")));
  assert.deepEqual(
    flow.arrivals
      .get(row("done"))!
      .map((arrival) => (JSON.parse(arrival.sourceRowId) as string[])[3]),
    ["publish", "rejected"],
  );
});

test("one alternative hangs off the spine, stacked, and its way back is a loop", () => {
  const doc = machine(
    [state("work"), state("failed"), state("next")],
    routes("work>failed:FAILED", "work>next:DONE", "failed>work:RETRY"),
    { initialId: "work" },
  );
  const { plan: flowPlan, presented } = plan(doc);
  const flow = flowPlan.flows.get(root)!;
  const work = flow.steps[0]!;
  assert.deepEqual(ids(flow.steps), ["work", "next"]);
  assert.equal(work.stacked, true, "a single alternative is not a column");
  assert.equal(work.columns.length, 1);
  assert.deepEqual(ids(work.columns[0]!.steps), ["failed"]);
  assert.deepEqual(
    work.main[0]!.transitionRowIds,
    [route("t1")],
    "the direct route stays on the spine",
  );
  assert.equal(work.columns[0]!.steps[0]!.side[0]!.landing, "back");
  assert.equal(flow.steps[1]!.linked, true);
  // A state's routes are listed in the order they are drawn: the alternative's label, then the route on.
  const workRow = presented.rows.find((r) => r.id === row("work"))!;
  assert.deepEqual(workRow.childIds, [route("t0"), route("t1")]);
  assert.deepEqual(
    work.sequence.map((segment) => segment.kind),
    ["branch", "carry"],
  );
});

test("a state's routes keep the order the machine tries them, whatever each one leads to", () => {
  // A guarded skip, then the unguarded route it falls back to: the fallback opens an alternative.
  const nodes = [state("intake"), state("draft"), state("review"), state("end")];
  const rest = ["draft>review", "review>end"];
  const kinds = (specs: string[]) => {
    const { plan: flowPlan, presented } = plan(
      machine(nodes, routes(...specs, ...rest), { initialId: "intake" }),
    );
    const first = flowPlan.flows.get(root)!.steps[0]!;
    assert.equal(first.stacked, true);
    assert.deepEqual(ids(first.columns[0]!.steps), ["draft", "review"]);
    return {
      kinds: first.sequence.map((segment) => segment.kind),
      listed: presented.rows.find((r) => r.id === row("intake"))!.childIds.slice(-specs.length),
    };
  };
  assert.deepEqual(kinds(["intake>end:SKIP", "intake>draft:GO"]), {
    kinds: ["carry", "branch"],
    listed: [route("t0"), route("t1")],
  });
  assert.deepEqual(kinds(["intake>draft:GO", "intake>end:SKIP"]), {
    kinds: ["branch", "carry"],
    listed: [route("t0"), route("t1")],
  });
  // Routes of one kind in a row are one run; a route of another kind between them splits it.
  assert.deepEqual(
    kinds(["intake>intake:AGAIN", "intake>end:SKIP", "intake>nowhere:LOST", "intake>draft:GO"]),
    {
      kinds: ["side", "carry", "side", "branch"],
      listed: [route("t0"), route("t1"), route("t2"), route("t3")],
    },
  );
});

test("small alternatives stand side by side; a long one stacks them all", () => {
  const two = machine(
    [state("a"), state("b"), state("c"), state("end")],
    routes("a>b", "a>c", "a>end", "b>end", "c>end"),
    { initialId: "a" },
  );
  const a = plan(two).plan.flows.get(root)!.steps[0]!;
  assert.equal(a.stacked, false);
  assert.deepEqual(a.columns[0]!.steps, [], "side by side, the direct route is the first column");
  assert.equal(a.columns.length, 3);
  assert.deepEqual(a.main, []);
  // Six states down one alternative is too long to stand beside the other.
  const chain = ["b", "b1", "b2", "b3", "b4", "b5"];
  const long = machine(
    [state("a"), ...chain.map((id) => state(id)), state("c"), state("end")],
    routes(
      "a>b",
      "a>c",
      ...chain.slice(1).map((id, index) => `${chain[index]}>${id}`),
      "b5>end",
      "c>end",
    ),
    { initialId: "a" },
  );
  const stacked = plan(long).plan.flows.get(root)!.steps[0]!;
  assert.equal(stacked.stacked, true);
  assert.equal(
    stacked.columns.every((column) => column.steps.length > 0),
    true,
    "no direct-route column when stacked",
  );
});

test("every state of a container lands in exactly one step, reachable or not", () => {
  const doc = machine(
    [state("a"), state("b"), state("island"), state("note", { kind: "note" }), state("c")],
    routes("a>b", "b>c", "c>a"),
    { initialId: "a" },
  );
  const flow = plan(doc).plan.flows.get(root)!;
  assert.deepEqual(ids(steps(flow)).sort(), ["a", "b", "c", "island"]);
  assert.equal(steps(flow).find((step) => step.rowId === row("island"))!.linked, false);
  assert.equal(steps(flow).find((step) => step.rowId === row("c"))!.side[0]!.landing, "back");
});

test("routes that stay in a state, enter it, leave the container or point nowhere are named for what they do", () => {
  const doc = machine(
    [
      state("outer", { kind: "compound", initialId: "a" }),
      state("a", { parentId: "outer" }),
      state("b", { parentId: "outer" }),
      state("elsewhere"),
    ],
    routes(
      "a>a:AGAIN",
      "outer>b:JUMP",
      "a>elsewhere:LEAVE",
      "a>outer:RESTART",
      "a>missing:LOST",
      "a>b:GO",
    ),
    { initialId: "outer" },
  );
  const { plan: flowPlan } = plan(doc);
  const inner = flowPlan.flows.get(row("outer"))!;
  const a = inner.steps[0]!;
  const landing = (id: string) => a.side.find((r) => r.transitionRowIds[0] === route(id))?.landing;
  assert.equal(landing("t0"), "self");
  assert.equal(landing("t2"), "out");
  assert.equal(landing("t3"), "out");
  assert.equal(landing("t4"), "unknown");
  assert.equal(a.main[0]!.landing, "next");
  const outer = flowPlan.flows.get(root)!.steps[0]!;
  assert.equal(outer.side.find((r) => r.transitionRowIds[0] === route("t1"))!.landing, "into");
  // From outside, the route out of `a` is a route from inside `outer`, and it names where it goes.
  const fromInside = outer.columns
    .flatMap((c) => c.routes)
    .concat(outer.main, outer.side)
    .find((r) => r.inside)!;
  assert.deepEqual(fromInside.transitionRowIds, [route("t2")]);
  assert.equal(fromInside.landsOn, row("elsewhere"));
});

test("a declared region is one extra row its members hang under, and nothing else changes", () => {
  const doc = machine(
    [
      state("draft"),
      state("publish", { region: "publishing" }),
      state("retry", { region: "publishing" }),
      state("done", { kind: "final" }),
    ],
    routes(
      "draft>publish:SUBMIT",
      "publish>retry:FAILED",
      "retry>publish:RETRY",
      "publish>done:SUCCEEDED",
    ),
    { initialId: "draft", regions: { publishing: { label: "Publish attempt" } } },
  );
  assert.deepEqual(validateMachineDocument(doc), []);
  const { model, plan: flowPlan, presented } = plan(doc);
  const box = region(null, "publishing");
  const boxRow = presented.rows.find((r) => r.id === box)!;
  assert.equal(boxRow.label, "Publish attempt");
  assert.deepEqual(boxRow.region, {
    name: "publishing",
    collapsed: true,
    memberIds: [row("publish"), row("retry")],
  });
  assert.equal(presented.rows.find((r) => r.id === row("retry"))!.parentId, box);
  // The original rows are the host's own: same ids, same node and graph objects.
  for (const original of model.rows) {
    const shown = presented.rows.find((r) => r.id === original.id)!;
    assert.equal(shown.node, original.node);
    assert.equal(shown.graph, original.graph);
    assert.equal(shown.initial, original.initial);
  }
  assert.equal(presented.rows.length, model.rows.length + 1);
  // Outside, the region is one step; the route out of it is a route from inside, with its source.
  const outside = flowPlan.flows.get(root)!;
  assert.deepEqual(
    ids(outside.steps).map((id) => (id!.startsWith("[") ? "box" : id)),
    ["draft", "box", "done"],
  );
  const out = outside.steps[1]!.main[0]!;
  assert.deepEqual([out.inside, out.transitionRowIds], [true, [route("t3")]]);
  // Inside, it has its own flow, entered where the machine enters it, with nothing marked initial.
  const inside = flowPlan.flows.get(box)!;
  assert.deepEqual(ids(steps(inside)), ["publish", "retry"]);
  assert.deepEqual(inside.entries.get(row("publish"))![0]!.transitionRowIds, [route("t0")]);
  assert.ok(presented.rows.filter((r) => r.initial).every((r) => r.id === row("draft")));
});

test("a region that breaks a rule is dropped and its states draw ungrouped", () => {
  const doc = machine(
    [
      state("alone", { region: "one" }),
      state("both", { kind: "parallel" }),
      state("left", { parentId: "both", kind: "compound", region: "lanes" }),
      state("right", { parentId: "both", kind: "compound", region: "lanes" }),
      state("x", { region: "split" }),
      state("y", { parentId: "left", region: "split" }),
    ],
    [],
  );
  const { model, presented } = plan(doc);
  assert.equal(presented.rows.length, model.rows.length);
  assert.ok(presented.rows.every((r) => !r.region));
});

test("a region holds the run when a member does, and is never a search hit by its made-up id", () => {
  const doc = machine(
    [state("a", { region: "group" }), state("b", { region: "group" }), state("c")],
    routes("a>b", "b>c"),
  );
  const model = buildMachineTree(doc, { activeStates: [{ machineId: "main", activeIds: ["b"] }] });
  const presented = presentMachineTree(model, planMachineTreeFlow(buildMachineTree(doc)));
  const box = presented.rows.find((r) => r.region)!;
  assert.equal(box.activeDescendant, true);
  assert.equal(box.active, false);
  assert.equal(projectMachineTree(presented, { query: "region" }).matchCount, 0);
  assert.equal(
    projectMachineTree(presented, { query: "group" }).rows.some((r) => r.id === box.id && r.match),
    true,
  );
});

test("without regions the presented tree holds the same rows, only reordered", () => {
  const doc = machine([state("b"), state("a")], routes("a>b"), { initialId: "a" });
  const { model, presented } = plan(doc);
  assert.deepEqual(presented.rows.map((r) => r.id).sort(), model.rows.map((r) => r.id).sort());
  assert.equal(presented.issues, model.issues);
});

test("a parallel state keeps its lanes; flow runs inside each lane", () => {
  const doc = machine(
    [
      state("both", { kind: "parallel" }),
      state("left", { parentId: "both", kind: "compound", initialId: "l1" }),
      state("l1", { parentId: "left" }),
      state("l2", { parentId: "left" }),
      state("right", { parentId: "both", kind: "compound" }),
      state("r1", { parentId: "right" }),
    ],
    routes("l1>l2"),
  );
  const { plan: flowPlan } = plan(doc);
  assert.equal(flowPlan.flows.has(row("both")), false);
  assert.deepEqual(ids(flowPlan.flows.get(row("left"))!.steps), ["l1", "l2"]);
});

test("malformed documents fall back to the plain list instead of guessing a shape", () => {
  const duplicated = machine([state("a"), state("a"), state("b")], routes("a>b"));
  assert.equal(planMachineTreeFlow(buildMachineTree(duplicated)).flows.has(root), false);
  const cyclic = machine(
    [state("a", { parentId: "b" }), state("b", { parentId: "a" }), state("c")],
    routes("a>c"),
  );
  const model = buildMachineTree(cyclic);
  const presented = presentMachineTree(model, planMachineTreeFlow(model));
  assert.deepEqual(presented.rows.map((r) => r.id).sort(), model.rows.map((r) => r.id).sort());
});

test("region declarations are validated", () => {
  const bad = machine([state("a", { region: "" })], [], {
    regions: { a: { collapsed: "yes" as unknown as boolean } },
  });
  const codes = validateMachineDocument(bad).map((issue) => issue.code);
  assert.ok(codes.includes("invalid-node-field"));
  assert.ok(codes.includes("invalid-regions"));
  // A region named like an Object.prototype key is an ordinary name.
  const proto = machine(
    [state("a", { region: "constructor" }), state("b", { region: "constructor" })],
    [],
  );
  assert.equal(plan(proto).presented.rows.find((r) => r.region)!.label, "Constructor");
});

test("a step declaration is validated, and its words can be searched", () => {
  const ok = machine(
    [
      state("ask", {
        step: {
          kind: "Ask",
          icon: "person",
          summary: "a reviewer answers",
          details: [{ label: "question", value: "Ship it?" }],
        },
      }),
      state("plain"),
    ],
    routes("ask>plain"),
    { initialId: "ask" },
  );
  assert.deepEqual(validateMachineDocument(ok), []);
  const hits = (query: string) =>
    projectMachineTree(buildMachineTree(ok), { query })
      .rows.filter((r) => r.match)
      .map((r) => r.elementId);
  assert.deepEqual(hits("reviewer"), ["ask"]);
  assert.deepEqual(hits("ship it"), ["ask"]);
  for (const step of [
    { kind: "" },
    { kind: "Ask", icon: "robot" },
    { kind: "Ask", summary: 3 },
    { kind: "Ask", details: [{ label: "question" }] },
    "Ask",
  ]) {
    const bad = machine([state("a", { step: step as never })], []);
    assert.ok(
      validateMachineDocument(bad).some((issue) => issue.code === "invalid-node-field"),
      JSON.stringify(step),
    );
  }
});

test("a long chain is placed without exhausting the stack", () => {
  const count = 900;
  const nodes = Array.from({ length: count }, (_, index) => state(`s${index}`));
  const chain = Array.from({ length: count - 1 }, (_, index) => `s${index}>s${index + 1}`);
  const flow = plan(machine(nodes, routes(...chain), { initialId: "s0" })).plan.flows.get(root)!;
  assert.equal(flow.steps.length, count);
});
