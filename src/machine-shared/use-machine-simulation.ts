import * as React from "react";
import {
  createMachineSnapshot,
  getEnabledMachineTransitions,
  machineAncestors,
  sendMachineEvent,
  type MachineDocument,
  type MachineEvent,
  type MachineGraph,
  type MachineRuntimeOptions,
  type MachineScenario,
  type MachineSnapshot,
} from "../core/index.js";

/**
 * Local, explicitly started simulation over the portable runtime. Shared by Machine View
 * and Machine Tree so both agree on what "active", "enabled", "blocked" and "taken" mean.
 * Guards and actions resolve only through the host's `runtime`; document strings never run.
 *
 * Contract:
 *  - `start`/`stop`/`send`/`playScenario` are the only ways the snapshot changes.
 *  - `stop`, `start`, a manual `send`, and unmount all cancel any scenario in flight.
 *  - `payload` is the event payload used both to evaluate guards for `candidates` and
 *    to send events, so "enabled" on screen always matches what a click will do.
 *  - `leafIds` are the deepest active states; `activeSet` adds every active ancestor.
 *  - `run` counts fresh runs (`start` and `playScenario` bump it), so a view can tell a restart
 *    from a frame that merely looks the same (a restart before any send keeps sequence 0).
 *  - Scenario steps report through `playScenario`'s `onStep`, refusals included;
 *    `runMachineScenario` runs the same thing headlessly with the same pass rule.
 */
export interface SendResult {
  readonly event: string;
  readonly changed: boolean;
}

/** One played scenario step: the snapshot before it (for explaining a refusal) and whether it moved. */
export interface ScenarioStep extends SendResult {
  readonly timestamp?: number;
  readonly index: number;
  readonly event: string;
  readonly before: MachineSnapshot;
  readonly after: MachineSnapshot;
  readonly payload?: unknown;
}

/** How a finished scenario went. `passed` is undefined when the scenario declares no expectation. */
export interface ScenarioResult {
  readonly id: string;
  readonly steps: readonly ScenarioStep[];
  readonly blocked: readonly ScenarioStep[];
  readonly activeIds: readonly string[];
  readonly passed?: boolean;
}

/** The event a send would carry: the type plus the payload when one is set. */
export function machineEvent(type: string, payload?: unknown): MachineEvent {
  return payload !== undefined ? { type, payload } : { type };
}

/** One pass rule for every runner: all expected ids active at the end (undefined when none declared). */
function scenarioPassed(scenario: MachineScenario, snapshot: MachineSnapshot) {
  if (!scenario.expectedActiveIds) return undefined;
  const expected = scenario.expectedActiveIds;
  return (
    snapshot.status !== "error" &&
    new Set(expected).size === expected.length &&
    expected.length === snapshot.activeIds.length &&
    expected.every((id) => snapshot.activeIds.includes(id))
  );
}

/**
 * Runs `scenario` instantly from a fresh snapshot without touching any live run — for
 * "Run all" suites and tests. Same steps, refusals and pass rule as `playScenario`.
 */
export function runMachineScenario(
  document: MachineDocument,
  graphId: string,
  scenario: MachineScenario,
  runtime: MachineRuntimeOptions = {},
): ScenarioResult {
  let current = createMachineSnapshot(document, graphId, {}, runtime);
  const steps: ScenarioStep[] = [];
  for (const [index, event] of scenario.events.entries()) {
    const before = current;
    current = sendMachineEvent(document, current, event, runtime);
    steps.push({
      timestamp: Date.now(),
      index,
      event: event.type,
      changed: current.sequence !== before.sequence,
      before,
      after: current,
      ...(event.payload !== undefined ? { payload: event.payload } : {}),
    });
  }
  const passed = scenarioPassed(scenario, current);
  return {
    id: scenario.id,
    steps,
    blocked: steps.filter((step) => !step.changed),
    activeIds: current.activeIds,
    ...(passed !== undefined ? { passed } : {}),
  };
}

export function useMachineSimulation(
  document: MachineDocument,
  graph: MachineGraph,
  runtime: MachineRuntimeOptions = {},
) {
  const [snapshot, setSnapshot] = React.useState<MachineSnapshot | null>(null);
  const [cursor, setCursor] = React.useState<number | null>(null);
  const [lastTransitionIds, setLastTransitionIds] = React.useState<readonly string[]>([]);
  const [playing, setPlaying] = React.useState<string | null>(null);
  const [payloadText, setPayloadText] = React.useState("");
  const [lastResult, setLastResult] = React.useState<SendResult | null>(null);
  const [run, setRun] = React.useState(0);
  const runtimeRef = React.useRef(runtime);
  runtimeRef.current = runtime;
  /** Bumped by start/stop/unmount; a scenario loop exits when its token is stale. */
  const runToken = React.useRef(0);
  React.useEffect(() => () => void runToken.current++, []);

  const payload = React.useMemo<{ ok: true; value: unknown } | { ok: false; error: string }>(() => {
    if (!payloadText.trim()) return { ok: true, value: undefined };
    try {
      return { ok: true, value: JSON.parse(payloadText) };
    } catch {
      return { ok: false, error: "Payload is not valid JSON" };
    }
  }, [payloadText]);

  const event = React.useCallback(
    (type: string): MachineEvent => machineEvent(type, payload.ok ? payload.value : undefined),
    [payload],
  );

  const start = React.useCallback(() => {
    runToken.current++;
    setPlaying(null);
    setRun((n) => n + 1);
    setSnapshot(createMachineSnapshot(document, graph.id, {}, runtimeRef.current));
    setCursor(null);
    setLastTransitionIds([]);
    setLastResult(null);
  }, [document, graph.id]);
  const stop = React.useCallback(() => {
    runToken.current++;
    setPlaying(null);
    setSnapshot(null);
    setCursor(null);
    setLastTransitionIds([]);
    setLastResult(null);
  }, []);
  React.useEffect(() => {
    stop();
  }, [document, graph.id, stop]);

  const snapshotRef = React.useRef(snapshot);
  snapshotRef.current = snapshot;
  /** Sends `type` with the current payload. Returns whether the configuration changed. */
  const send = React.useCallback(
    (typeOrEvent: string | MachineEvent): SendResult | null => {
      const current = snapshotRef.current;
      if (!current) return null;
      // A manual event takes over: any scenario in flight stops here instead of overwriting it.
      runToken.current++;
      setPlaying(null);
      const next = sendMachineEvent(
        document,
        current,
        typeof typeOrEvent === "string" ? event(typeOrEvent) : typeOrEvent,
        runtimeRef.current,
      );
      const changed = next.sequence !== current.sequence;
      const result = {
        event: typeof typeOrEvent === "string" ? typeOrEvent : typeOrEvent.type,
        changed,
      };
      setLastTransitionIds(changed ? (next.trace.at(-1)?.transitionIds ?? []) : []);
      setSnapshot(next);
      setCursor(null);
      setLastResult(result);
      return result;
    },
    [document, event],
  );

  /**
   * Plays `scenario` from a fresh snapshot, one step per beat. Every step reports through
   * `onStep` (refused steps included, so views can log and announce them the same way a
   * manual send does) and the resolved result says whether `expectedActiveIds` held.
   * Resolves `null` when cancelled.
   */
  const playScenario = React.useCallback(
    async (
      scenario: MachineScenario,
      onStep?: (step: ScenarioStep) => void,
    ): Promise<ScenarioResult | null> => {
      const token = ++runToken.current;
      let current = createMachineSnapshot(document, graph.id, {}, runtimeRef.current);
      snapshotRef.current = current;
      setRun((n) => n + 1);
      setSnapshot(current);
      setCursor(null);
      setLastTransitionIds([]);
      setLastResult(null);
      setPlaying(scenario.id);
      const steps: ScenarioStep[] = [];
      for (const [index, event] of scenario.events.entries()) {
        await new Promise((resolve) => setTimeout(resolve, 520));
        if (token !== runToken.current) return null;
        const before = current;
        current = sendMachineEvent(document, current, event, runtimeRef.current);
        const changed = current.sequence !== before.sequence;
        const step: ScenarioStep = {
          timestamp: Date.now(),
          index,
          event: event.type,
          changed,
          before,
          after: current,
          ...(event.payload !== undefined ? { payload: event.payload } : {}),
        };
        steps.push(step);
        setLastTransitionIds(changed ? (current.trace.at(-1)?.transitionIds ?? []) : []);
        setLastResult({ event: event.type, changed });
        snapshotRef.current = current;
        setSnapshot(current);
        onStep?.(step);
      }
      if (token !== runToken.current) return null;
      setPlaying(null);
      const passed = scenarioPassed(scenario, current);
      return {
        id: scenario.id,
        steps,
        blocked: steps.filter((step) => !step.changed),
        activeIds: current.activeIds,
        ...(passed !== undefined ? { passed } : {}),
      };
    },
    [document, graph.id],
  );

  /** The replay frame while scrubbing, else the live configuration. */
  const frame = React.useMemo(() => {
    if (!snapshot) return null;
    if (cursor === null) return { activeIds: snapshot.activeIds, transitionIds: lastTransitionIds };
    const entry = snapshot.trace[cursor];
    return entry ? { activeIds: entry.activeIds, transitionIds: entry.transitionIds } : null;
  }, [snapshot, cursor, lastTransitionIds]);

  const activeSet = React.useMemo(() => {
    const set = new Set<string>();
    for (const id of frame?.activeIds ?? []) {
      set.add(id);
      for (const ancestor of machineAncestors(graph, id)) set.add(ancestor.id);
    }
    return set;
  }, [frame, graph]);

  /** Deepest active states only: no active child of theirs is also active. */
  const leafIds = React.useMemo(() => {
    const ids = frame?.activeIds ?? [];
    return new Set(
      ids.filter(
        (id) => !graph.nodes.some((node) => node.parentId === id && activeSet.has(node.id)),
      ),
    );
  }, [frame, graph, activeSet]);

  const candidates = React.useMemo(() => {
    const enabled = new Set<string>();
    const blocked = new Set<string>();
    if (!snapshot || cursor !== null || snapshot.status !== "running") return { enabled, blocked };
    for (const transition of graph.transitions) {
      if (!activeSet.has(transition.sourceId) || !transition.event) continue;
      const fire = getEnabledMachineTransitions(
        document,
        snapshot,
        event(transition.event),
        runtimeRef.current,
      );
      (fire.some((t) => t.id === transition.id) ? enabled : blocked).add(transition.id);
    }
    return { enabled, blocked };
  }, [snapshot, cursor, graph, activeSet, document, event]);

  return {
    snapshot,
    start,
    stop,
    send,
    cursor,
    setCursor,
    frame,
    activeSet,
    leafIds,
    candidates,
    playScenario,
    playing,
    payloadText,
    setPayloadText,
    payload,
    lastResult,
    run,
    /** Loads an already-computed local result for inspection without replaying callbacks. */
    inspectScenario: (result: ScenarioResult, index = 0) => {
      runToken.current++;
      const final = result.steps.at(-1)?.after;
      if (!final) return;
      snapshotRef.current = final;
      setPlaying(null);
      setSnapshot(final);
      const step = result.steps[Math.max(0, Math.min(result.steps.length - 1, index))];
      const sequence = step?.changed ? step.after.sequence : step?.before.sequence;
      const cursor = final.trace.findIndex((t) => t.sequence === sequence);
      setCursor(cursor < 0 ? null : cursor);
      setLastTransitionIds([]);
    },
  };
}

export type MachineSimulation = ReturnType<typeof useMachineSimulation>;
