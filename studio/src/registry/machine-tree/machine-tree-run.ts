/**
 * Simulation concern of the Machine Tree controller: the view of the shared run (enabled,
 * blocked, why, one-tap fixes, the lazy dry run), every user-initiated send, scenarios, and the
 * feedback a send leaves (footer notice, live region, touch toast).
 */
import * as React from "react";
import { machineTreeAncestors, type MachineEvent, type MachineScenario, type MachineSnapshot } from "@fux/core";
import { machineEvent, type MachineSimulation, type SendResult } from "@/registry/machine-shared/use-machine-simulation";
import { describeSend, describeStart } from "@/registry/machine-shared/machine-copy";
import type { TreeBase } from "./machine-tree-controller";
import type { LayoutCtx } from "./machine-tree-layout";
import {
  blockedDetails,
  leafLabels,
  plural,
  previewEvent,
  reasonOf,
  routeStateOf,
  scenarioPayloads,
  scenarioReport,
  stepSentence,
  type MachineTreeFix,
  type MachineTreePreview,
  type MachineTreeScenarioReport,
  type SimView,
} from "./machine-tree-logic";
import type { NavigationCtx } from "./machine-tree-navigation";
import { useEvent } from "./machine-tree-store";

/** The footer's one-line feedback. `ok` = a send went through; `warn` = refused, blocked or taken over. */
export interface TreeNotice {
  readonly text: string;
  readonly key: string;
  readonly tone: "ok" | "warn";
  readonly short?: string;
  readonly fix?: MachineTreeFix | undefined;
  readonly rowId?: string | undefined;
}

export interface SimulationCtx {
  /** The shared run (`useMachineSimulation`): snapshot, cursor, payload editor, candidates. */
  readonly sim: MachineSimulation;
  /** The tree's reading of the run, as every row sees it. */
  readonly view: SimView;
  readonly scenarios: readonly MachineScenario[];
  /** Every distinct scenario payload: the editor's quick picks and the source of one-tap fixes. */
  readonly payloads: readonly MachineTreeFix[];
  /** The notice for the frame on screen (cleared by any frame change). */
  readonly notice: TreeNotice | null;
  /** Every user-initiated send: takes over a playing scenario and says so. */
  readonly sendEvent: (event: string | MachineEvent) => SendResult | null;
  /** Sends, then hands focus to the newly active state's row (the ⌘K palette). */
  readonly sendAndFocusActive: (event: string) => void;
  readonly applyFix: (fix: MachineTreeFix, rowId?: string) => void;
  /** Enter / click on a row: sends an enabled event while simulating, explains a refusal, else selects. */
  readonly activate: (rowId: string) => void;
  readonly setPreview: (event: string | null, via?: "pointer" | "key") => void;
  readonly start: () => void;
  readonly stop: () => void;
  /** Context after each step, by snapshot sequence. */
  readonly contexts: ReadonlyMap<number, Readonly<Record<string, unknown>>>;
  readonly playScenario: (scenario: MachineScenario) => Promise<void>;
  readonly runAllScenarios: () => { readonly passed: number; readonly total: number };
  readonly reports: ReadonlyMap<string, MachineTreeScenarioReport>;
}

export const SimulationContext = React.createContext<SimulationCtx | null>(null);
export function useTreeSimulation(): SimulationCtx {
  const ctx = React.useContext(SimulationContext);
  if (!ctx) throw new Error("Machine Tree parts must be rendered inside <MachineTreeRoot>");
  return ctx;
}

export function useSimulationController(base: TreeBase, layout: LayoutCtx, nav: NavigationCtx, onSimulationChange: ((snapshot: MachineSnapshot | null) => void) | undefined): SimulationCtx {
  const { document, scenarios, sim, rootGraph, topology, rows, store, elements, handoff, announce, runtimeRef, stateRowIds } = base;
  const { isPhone, coarse, panel, panelTab, setPanelTab, toast } = layout;
  const touch = coarse || isPhone;
  const snapshot = sim.snapshot;
  const frameEntry = snapshot ? (sim.cursor !== null ? snapshot.trace[sim.cursor] : snapshot.trace.at(-1)) : undefined;
  const payloadValue = sim.payload.ok ? sim.payload.value : undefined;
  const payloads = React.useMemo(() => scenarioPayloads(scenarios), [scenarios]);
  // Host guards run here once per snapshot + payload, never per row render.
  const { reasons, fixes } = React.useMemo(
    () => (snapshot && sim.candidates.blocked.size ? blockedDetails(document, rootGraph, snapshot, sim.candidates.blocked, payloadValue, payloads, runtimeRef.current) : { reasons: new Map<string, string>(), fixes: new Map<string, MachineTreeFix[]>() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [snapshot, sim.candidates, rootGraph, payloadValue, payloads, document],
  );
  // The start microsteps (automatic edges taken on entry) count as "just taken" too.
  const takenIds = sim.frame
    ? sim.frame.transitionIds.length || sim.cursor !== null
      ? sim.frame.transitionIds
      : snapshot && sim.lastResult === null
        ? snapshot.trace.flatMap((entry) => entry.transitionIds)
        : []
    : [];
  const takenKey = takenIds.join("\u0000");
  const live = !!snapshot && sim.cursor === null && snapshot.status === "running";
  const enabledEvents = React.useMemo(
    () => (live ? [...new Set(rootGraph.transitions.filter((t) => t.event && sim.candidates.enabled.has(t.id)).map((t) => t.event!))] : []),
    [live, rootGraph, sim.candidates],
  );
  // Dry run, lazily: nothing is computed until a route is hovered or focused (or the palette opens),
  // and each answer is cached for this snapshot + payload.
  const previewOf = React.useMemo(() => {
    const cache = new Map<string, MachineTreePreview | undefined>();
    return (type: string) => {
      if (!snapshot || !enabledEvents.includes(type)) return undefined;
      if (!cache.has(type)) cache.set(type, previewEvent(document, rootGraph, snapshot, machineEvent(type, payloadValue), stateRowIds, runtimeRef.current));
      return cache.get(type);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, enabledEvents, document, rootGraph, payloadValue, stateRowIds]);
  const setPreview = useEvent((type: string | null, via?: "pointer" | "key") => {
    const preview = type ? previewOf(type) : undefined;
    store.set(preview ? { previewEvent: preview.event, previewVia: via ?? null, ghostEnter: preview.enter, ghostExit: preview.exit } : { previewEvent: null, previewVia: null, ghostEnter: null, ghostExit: null });
  });
  const view = React.useMemo<SimView>(
    () => ({
      running: !!snapshot,
      live: !!snapshot && snapshot.status !== "error",
      replaying: sim.cursor !== null,
      done: snapshot?.status === "done",
      error: snapshot?.status === "error" ? (snapshot.error ?? "the run errored") : null,
      enabled: sim.candidates.enabled,
      blocked: sim.candidates.blocked,
      enabledEvents,
      reasons,
      fixes,
      taken: new Set(takenKey ? takenKey.split("\u0000") : []),
      entered: new Set(frameEntry?.entered ?? []),
      pingKey: frameEntry?.sequence ?? -1,
      previewOf,
    }),
    [snapshot, sim.cursor, sim.candidates, enabledEvents, reasons, fixes, takenKey, frameEntry, previewOf],
  );

  /* — context after each step: derived state, recorded per snapshot (no render-time ref writes) — */
  const [contextLog, setContextLog] = React.useState<{ snapshot: MachineSnapshot | null; map: ReadonlyMap<number, Readonly<Record<string, unknown>>> }>({ snapshot: null, map: new Map() });
  if (contextLog.snapshot !== snapshot) {
    const map = new Map(!snapshot || snapshot.trace.length <= 1 ? [] : contextLog.map);
    if (snapshot) map.set(snapshot.sequence, snapshot.context);
    setContextLog({ snapshot, map });
  }
  const onSimulationChangeRef = React.useRef(onSimulationChange);
  onSimulationChangeRef.current = onSimulationChange;
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (mounted.current || snapshot) onSimulationChangeRef.current?.(snapshot);
    mounted.current = true;
  }, [snapshot]);

  /* — feedback — */
  const [notice, setNotice] = React.useState<TreeNotice | null>(null);
  /** A notice belongs to the frame it was raised in; scrubbing or stepping clears it. */
  const frameKey = `${snapshot?.sequence ?? -1}:${sim.cursor ?? "live"}`;
  /**
   * Feedback for something the user just did: footer notice, live region, and on touch a toast
   * (phones have no hover tooltip and no room for the footer notice). A fix is offered once: in
   * the toast only when the sheet isn't already showing it (Simulation chips, Details card).
   */
  const say = (text: string, key: string, fix?: MachineTreeFix, rowId?: string, duration = 2600) => {
    setNotice({ text, key, tone: "warn", fix, rowId });
    announce(text);
    if (!touch) return;
    const fixOnScreen = panel && (panelTab === "simulation" || panelTab === "details");
    if (fix && !fixOnScreen) toast.show("mt-reason", text, { persistent: true, action: { label: `Try ${fix.text}`, onClick: () => applyFix(fix, rowId) } });
    else toast.show("mt-reason", text, { duration });
  };
  /** Feedback about the frame a send is about to produce: said once that frame renders. */
  const pendingNotice = React.useRef<{ readonly text: string } | { readonly sent: string } | { readonly started: true } | null>(null);
  const pendingFocusActive = React.useRef(false);
  const settledSerial = React.useRef(base.announceSerial.current);
  const lastStatus = React.useRef<string | null>(null);
  React.useLayoutEffect(() => {
    const pending = pendingNotice.current;
    pendingNotice.current = null;
    store.set({ previewEvent: null, previewVia: null, ghostEnter: null, ghostExit: null });
    const leaves = leafLabels(rootGraph, sim.frame?.activeIds ?? []);
    const status = snapshot?.status ?? null;
    const newlyErrored = status === "error" && lastStatus.current !== "error";
    lastStatus.current = status;
    if (newlyErrored) {
      // Said whether or not the panel (and its alert) is open.
      announce(`Simulation stopped — ${snapshot?.error ?? "the run errored"}`, "assertive");
      toast.dismiss("mt-reason");
    } else if (pending && "sent" in pending) {
      const text = describeSend(pending.sent, leaves, status === "done");
      // The footer already shows where the run is: its notice only confirms the send.
      setNotice({ text, short: `${pending.sent} fired`, key: frameKey, tone: "ok" });
      announce(text);
      toast.dismiss("mt-reason");
    } else if (pending && "started" in pending) {
      // Simulate / Restart: say where the run starts (the footer shows it; a screen reader hears it).
      announce(describeStart(leaves, status === "done"));
      toast.dismiss("mt-reason");
    } else if (pending) setNotice({ text: pending.text, key: frameKey, tone: "warn" });
    else if (snapshot && sim.cursor !== null) {
      // Replay (scrub, history row, ‹ ›): say which frame is on screen.
      announce(`Step ${sim.cursor} of ${Math.max(0, snapshot.trace.length - 1)}: ${leaves.join(", ") || "no state"}`);
      toast.dismiss("mt-reason");
    } else if (settledSerial.current === base.announceSerial.current) {
      // Nothing was said about this frame (restart, stop, back to live): drop the last frame's sentence and toast.
      announce("");
      toast.dismiss("mt-reason");
    }
    settledSerial.current = base.announceSerial.current;
    if (pendingFocusActive.current) {
      pendingFocusActive.current = false;
      // ⌘K send: focus moves to the state the run is now in (or the folded container that holds it).
      const leafRows = [...sim.leafIds].map((id) => stateRowIds.get(id)).filter((id): id is string => !!id);
      const target = leafRows.find((id) => nav.visible.has(id)) ?? leafRows.map((id) => [...machineTreeAncestors(topology, id)].reverse().find((a) => nav.visible.has(a))).find(Boolean);
      if (target) requestAnimationFrame(() => nav.handOffTo(target));
    }
    // `sim.run`: a restart before any send renders the same frame key, and must still be said.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frameKey, snapshot?.status, sim.run]);
  const tell = (text: string, fix?: MachineTreeFix, rowId?: string) => say(text, frameKey, fix, rowId);
  // Opening the sheet on a tab that shows the fix (Simulation chips, the Details card) retires the
  // toast that offered it: the fix is on screen once, never twice.
  const fixShown = touch && panel && (panelTab === "simulation" || panelTab === "details");
  React.useEffect(() => {
    if (fixShown) toast.dismiss("mt-reason");
  }, [fixShown]);

  /* — sends — */
  const [reports, setReports] = React.useState<ReadonlyMap<string, MachineTreeScenarioReport>>(new Map());
  /** Steps the scenario in flight has played, for "stopped at step k". */
  const scenarioStep = React.useRef(0);
  const sendEvent = useEvent((input: string | MachineEvent): SendResult | null => {
    const playing = sim.playing ? scenarios.find((s) => s.id === sim.playing) : undefined;
    const result = sim.send(input);
    if (!result) return null;
    // The run moved on: a "Back to …" trail from before the send no longer describes anything.
    nav.setBack(null);
    if (playing) {
      const at = scenarioStep.current;
      setReports((current) => new Map(current).set(playing.id, { passed: undefined, blocked: [], stoppedAt: at }));
      const text = `Stopped “${playing.label}” ${at ? `at step ${at}` : "before its first step"} — you took over with ${result.event}`;
      pendingNotice.current = { text };
      announce(text);
      if (touch) toast.show("mt-reason", text, { duration: 3200 });
    } else if (!result.changed) {
      // An unchanged send keeps the frame key, so the notice can attach right away.
      say(`${result.event} — no change`, frameKey, undefined, undefined, 2000);
    } else pendingNotice.current = { sent: result.event };
    return result;
  });
  const sendAndFocusActive = useEvent((type: string) => {
    const result = sendEvent(type);
    if (result?.changed) pendingFocusActive.current = true;
  });
  /**
   * One-tap fix for a blocked guard. One-shot: the payload rides on this send only, so the editor
   * (and every later send) stays as it was. `rowId` takes focus afterwards (the toast or footer
   * button that was pressed disappears with the frame).
   */
  const applyFix = useEvent((fix: MachineTreeFix, rowId?: string) => {
    sendEvent({ type: fix.event, payload: fix.payload });
    if (rowId)
      requestAnimationFrame(() => {
        store.set({ focus: rowId });
        handoff.focus(elements.get(rowId));
      });
  });
  /** The row a send was just fired from: a double-tap's second tap must not refuse over the confirmation. */
  const lastSend = React.useRef<{ id: string; at: number } | null>(null);
  const activate = useEvent((id: string) => {
    const row = rows.get(id);
    if (!row) return;
    const state = row.kind === "transition" && row.transition ? routeStateOf(row, view, rootGraph.id) : null;
    // A double-tap's second tap on a route its first tap just used up: swallow it. A route that is
    // still enabled (a self-loop) sends again — fast repeats there are intentional.
    if (state !== "enabled" && lastSend.current?.id === id && performance.now() - lastSend.current.at < 350) return;
    nav.select(id);
    if (!state || !row.transition) return;
    const t = row.transition;
    if (state === "enabled" && t.event) {
      if (sendEvent(t.event)?.changed) lastSend.current = { id, at: performance.now() };
    } else if (state === "blocked" || state === "inactive") tell(reasonOf(row, state, view), state === "blocked" ? view.fixes.get(t.id)?.[0] : undefined, id);
  });

  /* — scenarios: refused steps are explained like manual sends; each run leaves a pass/fail report — */
  const playScenario = useEvent(async (scenario: MachineScenario) => {
    setNotice(null);
    scenarioStep.current = 0;
    const blocked: string[] = [];
    const result = await sim.playScenario(scenario, (step) => {
      scenarioStep.current = step.index + 1;
      if (step.changed) return;
      const text = stepSentence(step, rootGraph, runtimeRef.current);
      blocked.push(text);
      say(text, `${step.after.sequence}:live`);
    });
    if (!result) return; // stopped or taken over: sendEvent already reported a takeover
    setReports((current) => new Map(current).set(scenario.id, { passed: result.passed, blocked }));
    const verdict = result.passed === undefined ? "finished" : result.passed ? "passed" : "failed";
    announce(`${scenario.label} ${verdict}${blocked.length ? `, ${plural(blocked.length, "step")} refused${result.passed ? " as expected" : ""}` : ""}`);
  });
  /** The scenarios as a test suite: every one headless and instant; the live run is untouched. */
  const runAllScenarios = useEvent(() => {
    const next = new Map<string, MachineTreeScenarioReport>();
    for (const scenario of scenarios) next.set(scenario.id, scenarioReport(document, rootGraph, scenario, runtimeRef.current));
    setReports(next);
    const checked = [...next.values()].filter((r) => r.passed !== undefined);
    const passed = checked.filter((r) => r.passed).length;
    const text = `${passed} of ${plural(checked.length, "scenario")} passed`;
    announce(text);
    if (touch) toast.show("mt-suite", text, { duration: 2400 });
    return { passed, total: checked.length };
  });

  const start = useEvent(() => {
    nav.parkFocus();
    // Simulate / Restart: a "Back to …" trail describes a path the new run has nothing to do with.
    nav.setBack(null);
    pendingNotice.current = { started: true };
    sim.start();
    setNotice(null);
    if (panel) setPanelTab("simulation");
  });
  const stop = useEvent(() => {
    nav.parkFocus();
    sim.stop();
    setNotice(null);
    if (panel && panelTab === "simulation") setPanelTab(isPhone ? "details" : "code");
  });

  const visibleNotice = notice && notice.key === frameKey ? notice : null;
  return React.useMemo<SimulationCtx>(
    () => ({
      sim,
      view,
      scenarios,
      payloads,
      notice: visibleNotice,
      sendEvent,
      sendAndFocusActive,
      applyFix,
      activate,
      setPreview,
      start,
      stop,
      contexts: contextLog.map,
      playScenario,
      runAllScenarios,
      reports,
    }),
    [sim, view, scenarios, payloads, visibleNotice, sendEvent, sendAndFocusActive, applyFix, activate, setPreview, start, stop, contextLog.map, playScenario, runAllScenarios, reports],
  );
}
