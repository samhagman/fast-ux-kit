import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import "./components-dom.js";
import {
  explainMachineEvent,
  previewMachineEvent,
  createMachineSnapshot,
  type MachineDocument,
  type MachineRuntimeOptions,
} from "../src/core/machine/index.js";
import { fitToBand, PHONE_READABLE } from "../src/machine-view/machine-viewport.js";
import { useMachineView } from "../src/machine-view/use-machine-view.js";
import { useDiagramFacts, useCanvasController } from "../src/machine-view/machine-context.js";
import { runMachineScenario } from "../src/machine-shared/use-machine-simulation.js";
const { renderHook, act, cleanup } = await import("@testing-library/react");
afterEach(cleanup);
const doc: MachineDocument = {
  version: 1,
  rootId: "m",
  machines: [
    {
      id: "m",
      label: "Delivery",
      initialId: "waiting",
      nodes: [
        { id: "waiting", label: "Waiting", kind: "atomic" },
        { id: "done", label: "Done", kind: "final" },
      ],
      transitions: [
        {
          id: "go",
          sourceId: "waiting",
          targetId: "done",
          event: "GO",
          guard: "allowed",
          actions: ["count"],
        },
      ],
    },
  ],
};
const runtime: MachineRuntimeOptions = {
  guards: { allowed: (_c, e) => (e.payload as { ok?: boolean })?.ok === true },
  actions: { count: (c) => ({ ...c, count: Number(c.count ?? 0) + 1 }) },
  guardDescriptions: { allowed: () => "Approval is required" },
};
test("preview computes entered/exited states without advancing its source", () => {
  const snapshot = createMachineSnapshot(doc);
  const preview = previewMachineEvent(
    doc,
    snapshot,
    { type: "GO", payload: { ok: true } },
    runtime,
  );
  assert.deepEqual(preview?.entered, ["done"]);
  assert.deepEqual(preview?.exited, ["waiting"]);
  assert.deepEqual(snapshot.activeIds, ["waiting"]);
  assert.deepEqual(snapshot.context, {});
  assert.equal(snapshot.sequence, 0);
  assert.equal(
    explainMachineEvent(doc.machines[0]!, snapshot, { type: "GO" }, runtime),
    "Approval is required",
  );
});
test("canvas preview invalidates on payload changes and never invokes a live host action", async () => {
  let calls = 0;
  const options = {
    defaultDocument: doc,
    runtime,
    onInspectionAction: () => {
      calls++;
    },
  };
  const hook = renderHook(() => useMachineView(options));
  await act(async () => hook.result.current.start());
  await act(async () => hook.result.current.sim.setPayloadText('{"ok":true}'));
  const before = hook.result.current.snapshot;
  await act(async () => hook.result.current.previewEvent("GO"));
  assert.deepEqual(hook.result.current.preview?.entered, ["done"]);
  assert.equal(hook.result.current.snapshot, before);
  assert.equal(calls, 0);
  await act(async () => hook.result.current.sim.setPayloadText('{"ok":false}'));
  assert.equal(hook.result.current.preview, undefined);
});
test("scenario verdict refuses duplicate expectations, extra active states and error-ending runs", () => {
  assert.equal(
    runMachineScenario(doc, "m", {
      id: "s",
      label: "S",
      events: [],
      expectedActiveIds: ["waiting", "waiting"],
    }).passed,
    false,
  );
  const parallel: MachineDocument = {
    version: 1,
    rootId: "p",
    machines: [
      {
        id: "p",
        label: "P",
        initialId: "both",
        nodes: [
          { id: "both", label: "Both", kind: "parallel" },
          { id: "a", label: "A", kind: "atomic", parentId: "both" },
          { id: "b", label: "B", kind: "atomic", parentId: "both" },
        ],
        transitions: [],
      },
    ],
  };
  assert.equal(
    runMachineScenario(parallel, "p", {
      id: "p",
      label: "Partial",
      events: [],
      expectedActiveIds: ["a"],
    }).passed,
    false,
  );
  assert.equal(
    runMachineScenario(
      doc,
      "m",
      {
        id: "e",
        label: "Error",
        events: [{ type: "GO", payload: { ok: true } }],
        expectedActiveIds: ["done"],
      },
      {
        ...runtime,
        actions: {
          count: () => {
            throw new Error("failed");
          },
        },
      },
    ).passed,
    false,
  );
});

test("diagram facts stay stable through work-only observations, and update when activity changes", () => {
  const first = {
    id: "one",
    actorId: "parcel",
    machineId: "m",
    timestamp: 1,
    activeIds: ["waiting"],
    transitionIds: [],
  };
  const hook = renderHook(
    ({ frame }) => {
      const view = useMachineView({
        document: doc,
        readOnly: true,
        inspectionSession: { source: "committed", connection: "connected", frames: [frame] },
      });
      const diagram = useDiagramFacts(view);
      return { view, diagram, canvas: useCanvasController(view, diagram) };
    },
    { initialProps: { frame: first } },
  );
  const initial = hook.result.current.diagram;
  const canvas = hook.result.current.canvas;
  hook.rerender({
    frame: {
      ...first,
      id: "metadata",
      timestamp: 2,
      work: [{ id: "request", kind: "invoke", label: "Request", status: "retrying" }],
    } as typeof first,
  });
  assert.equal(hook.result.current.diagram, initial);
  assert.equal(hook.result.current.canvas, canvas);
  assert.equal(hook.result.current.view.inspection.frame?.id, "metadata");
  hook.rerender({ frame: { ...first, id: "changed", activeIds: ["done"] } });
  assert.notEqual(hook.result.current.diagram, initial);
  assert.notEqual(hook.result.current.canvas, canvas);
  assert.equal(hook.result.current.diagram.leafIds.has("done"), true);
  act(() => initial.setSelection({ type: "node", id: "done" }));
  assert.equal(hook.result.current.view.selection?.id, "done");
});

test("readable mobile fit anchors a distant state, while overview fits the whole graph", () => {
  const host = document.createElement("div");
  Object.defineProperties(host, { clientWidth: { value: 390 }, clientHeight: { value: 600 } });
  host.getBoundingClientRect = () => new window.DOMRect(0, 0, 390, 600);
  const nodes = [{ id: "start" }];
  const target = { x: 14000, y: 9000, width: 180, height: 60 };
  let viewport = { x: 0, y: 0, zoom: 1 };
  const flow = {
    getNodes: () => nodes,
    getNodesBounds: (items: unknown[]) =>
      items === nodes ? { x: 0, y: 0, width: 20000, height: 15000 } : target,
    setViewport: (value: typeof viewport) => {
      viewport = value;
    },
  } as unknown as Parameters<typeof fitToBand>[0];
  fitToBand(flow, host, { compact: true, anchorId: "start" });
  assert.ok(viewport.zoom >= PHONE_READABLE);
  assert.ok(viewport.x + target.x * viewport.zoom >= 12);
  assert.ok(viewport.x + (target.x + target.width) * viewport.zoom <= 378);
  assert.equal(viewport.y + target.y * viewport.zoom, 12);
  fitToBand(flow, host, { compact: false, anchorId: "start" });
  assert.ok(viewport.zoom < 0.2);
  assert.ok(viewport.x >= 24 && viewport.y >= 24);
  assert.ok(viewport.x + 20000 * viewport.zoom <= 366);
  assert.ok(viewport.y + 15000 * viewport.zoom <= 576);
});
