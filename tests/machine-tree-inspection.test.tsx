import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import "./components-dom.js";
import {
  machineTreeRowId,
  type MachineDocument,
  type MachineInspectionSession,
} from "../src/core/index.js";
import { useMachineTreeController } from "../src/machine-tree/machine-tree-controller.js";
import { useMachineSimulation } from "../src/machine-shared/use-machine-simulation.js";
import type { MachineTreeProps } from "../src/machine-tree/machine-tree.js";
const { renderHook, act, cleanup } = await import("@testing-library/react");
afterEach(cleanup);
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});
const document: MachineDocument = {
  version: 1,
  rootId: "m",
  machines: [
    {
      id: "m",
      label: "Shipment",
      initialId: "group",
      nodes: [
        { id: "group", label: "Packing", kind: "compound", initialId: "waiting" },
        { id: "waiting", label: "Waiting", kind: "atomic", parentId: "group" },
        { id: "ready", label: "Ready", kind: "final", parentId: "group" },
        { id: "outside", label: "Other work", kind: "atomic" },
      ],
      transitions: [
        { id: "go", sourceId: "waiting", targetId: "ready", event: "GO", actions: ["mark"] },
      ],
    },
  ],
};
const row = (id: string) => machineTreeRowId("node", "m", id);
const session: MachineInspectionSession = {
  id: "run",
  source: "committed",
  connection: "connected",
  frames: [
    {
      id: "one",
      actorId: "parcel",
      machineId: "m",
      timestamp: 100,
      activeIds: ["waiting"],
      work: [{ id: "task", kind: "task", label: "Verify", status: "pending" }],
    },
    {
      id: "two",
      actorId: "parcel",
      machineId: "m",
      timestamp: 200,
      activeIds: ["ready"],
      work: [],
    },
  ],
};
test("tree inspection pins history, marks active ancestors and never activates a local route", () => {
  let callbacks = 0;
  const hook = renderHook((props: MachineTreeProps) => useMachineTreeController(props), {
    initialProps: {
      document,
      inspectionSession: session,
      runtime: {
        actions: {
          mark: (c) => {
            callbacks++;
            return c;
          },
        },
      },
    },
  });
  assert.equal(hook.result.current.api.mode, "inspect");
  assert.equal(hook.result.current.base.rows.get(row("ready"))?.active, true);
  assert.equal(hook.result.current.base.rows.get(row("group"))?.activeDescendant, true);
  act(() => hook.result.current.run.activate(machineTreeRowId("transition", "m", "go")));
  assert.equal(callbacks, 0);
  act(() => hook.result.current.base.inspection.selectFrame("one"));
  hook.rerender({
    document,
    inspectionSession: {
      ...session,
      frames: [...session.frames, { ...session.frames[1]!, id: "three" }],
    },
  });
  assert.equal(hook.result.current.base.rows.get(row("waiting"))?.active, true);
  assert.equal(hook.result.current.base.inspection.frame?.work?.[0]?.label, "Verify");
  hook.rerender({ document, inspectionSession: { ...session, frames: session.frames.slice(1) } });
  assert.equal(hook.result.current.base.inspection.frame, undefined);
  assert.equal(hook.result.current.base.rows.get(row("waiting"))?.active, false);
});
test("container focus preserves folds and selection; global search and reveal can leave it", () => {
  const folds = new Set([row("group")]);
  const hook = renderHook(() =>
    useMachineTreeController({
      document,
      defaultCollapsedIds: folds,
      defaultSelectedId: row("outside"),
    }),
  );
  act(() => hook.result.current.api.focusContainer(row("group")));
  assert.equal(hook.result.current.api.selectedId, row("outside"));
  assert.deepEqual(hook.result.current.api.collapsedIds, folds);
  assert.equal(hook.result.current.nav.visible.has(row("waiting")), true);
  assert.equal(hook.result.current.nav.visible.has(row("outside")), false);
  assert.equal(hook.result.current.nav.visible.get(row("group"))?.level, 1);
  act(() => hook.result.current.api.setQuery("Other work"));
  assert.equal(hook.result.current.nav.visible.has(row("outside")), true);
  act(() => hook.result.current.api.setQuery(""));
  assert.equal(hook.result.current.api.focusedRowId, row("group"));
  act(() => hook.result.current.api.reveal(row("outside")));
  assert.equal(hook.result.current.api.focusedRowId, null);
  assert.deepEqual(hook.result.current.api.collapsedIds, folds);
});
test("controlled focus and mode refusals do not fabricate navigation or start execution", () => {
  const modes: string[] = [],
    focuses: (string | null)[] = [];
  const hook = renderHook(() =>
    useMachineTreeController({
      document,
      mode: "inspect",
      inspectionSession: session,
      focusedRowId: row("group"),
      onModeChange: (m) => modes.push(m),
      onFocusedRowChange: (id) => focuses.push(id),
    }),
  );
  act(() => hook.result.current.api.start());
  assert.deepEqual(modes, ["simulate"]);
  assert.equal(hook.result.current.base.liveSim.snapshot, null);
  act(() => hook.result.current.api.reveal(row("outside")));
  assert.deepEqual(focuses, [null]);
  assert.equal(hook.result.current.api.focusedRowId, row("group"));
  assert.equal(hook.result.current.api.selectedId, null);
});
test("shared local simulation survives inspection without replacing host observations", () => {
  const hook = renderHook(() => {
    const simulation = useMachineSimulation(document, document.machines[0]!);
    return {
      simulation,
      ctl: useMachineTreeController({ document, simulation, inspectionSession: session }),
    };
  });
  act(() => hook.result.current.simulation.start());
  assert.equal(hook.result.current.ctl.api.simulation.status, "idle");
  assert.equal(hook.result.current.ctl.base.inspection.frame?.id, "two");
  act(() => hook.result.current.ctl.api.setMode("simulate"));
  assert.equal(
    hook.result.current.ctl.api.simulation.snapshot,
    hook.result.current.simulation.snapshot,
  );
  act(() => hook.result.current.ctl.api.setMode("inspect"));
  assert.ok(hook.result.current.simulation.snapshot);
  assert.equal(hook.result.current.ctl.base.rows.get(row("ready"))?.active, true);
});
test("scenario failure inspection uses retained results without re-running actions", () => {
  let calls = 0;
  const hook = renderHook(() =>
    useMachineTreeController({
      document,
      runtime: {
        actions: {
          mark: (c) => {
            calls++;
            return c;
          },
        },
      },
      scenarios: [
        {
          id: "s",
          label: "Expected elsewhere",
          events: [{ type: "GO" }],
          expectedActiveIds: ["outside"],
        },
      ],
    }),
  );
  act(() => {
    hook.result.current.api.runAllScenarios();
  });
  assert.equal(calls, 1);
  const report = hook.result.current.run.reports.get("s")!;
  assert.equal(report.passed, false);
  act(() => hook.result.current.run.inspectScenario(report));
  assert.equal(calls, 1);
  assert.equal(hook.result.current.api.panelTab, "simulation");
  assert.deepEqual(hook.result.current.api.simulation.activeLeafIds, ["ready"]);
});
