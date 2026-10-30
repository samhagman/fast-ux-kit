/**
 * The Machine Tree controller: shared base data, then three concerns with typed contracts —
 *
 *   machine-tree-layout.ts      LayoutCtx      panel, sheet snap + occlusion, overlays, refs, direction
 *   machine-tree-navigation.ts  NavigationCtx  selection, folds, find, focus, keyboard
 *   machine-tree-run.ts         SimulationCtx  run view, sends, fixes, dry run, scenarios, feedback
 *
 * — composed here in that order (navigation's Enter-to-send is late-bound to the simulation), plus
 * the row model context and the public `MachineTreeApi`. Every part declares which contexts it
 * reads; nothing reaches into one untyped bag.
 */
import * as React from "react";
import { buildMachineTree, resolveMachineTreeTarget, type MachineDocument, type MachineGraph, type MachineRuntimeOptions, type MachineScenario, type MachineTreeModel, type MachineTreeRow, type MachineIssue, type MachineTreeIssue } from "@fux/core";
import { useMachineSimulation, type MachineSimulation } from "@/registry/machine-shared/use-machine-simulation";
import { useResolvedDirection } from "@/lib/direction";
import type { MachineTreeApi, MachineTreeProps, MachineTreeSimulationState } from "./machine-tree";
import { useLayoutController, type LayoutCtx } from "./machine-tree-layout";
import { useNavigationController, type NavigationCtx } from "./machine-tree-navigation";
import { useSimulationController, type SimulationCtx } from "./machine-tree-run";
import { createViewStore, useEvent, type TreeModelCtx, type ViewStore } from "./machine-tree-store";
import { useMediaQuery } from "@/hooks/use-media-query";
import { createFocusHandoff, type FocusHandoff } from "@/registry/machine-shared/machine-focus";
import { structuralIssues } from "@/registry/machine-shared/machine-issues";

/** What every concern shares: the document as the core sees it, the row registry, the live region. */
export interface TreeBase {
  readonly document: MachineDocument;
  readonly scenarios: readonly MachineScenario[];
  readonly runtimeRef: React.RefObject<MachineRuntimeOptions | undefined>;
  readonly rootGraph: MachineGraph;
  /** This instance's accessible name (the `label` prop, else the root machine's label). */
  readonly label: string;
  readonly sim: MachineSimulation;
  /** Topology without run state: navigation targets and ancestors. */
  readonly topology: MachineTreeModel;
  /** Topology plus active flags for the frame on screen. */
  readonly model: MachineTreeModel;
  readonly rows: ReadonlyMap<string, MachineTreeRow>;
  /** transition → target state, submachine → machine (row ids). */
  readonly links: ReadonlyMap<string, string>;
  readonly issues: ReadonlyMap<string, readonly string[]>;
  /** Root-machine state id → row id. */
  readonly stateRowIds: ReadonlyMap<string, string>;
  readonly documentItems: number;
  readonly store: ViewStore;
  readonly handoff: FocusHandoff;
  /** Row elements by row id (no DOM ids built from raw ids). */
  readonly elements: ReadonlyMap<string, HTMLElement>;
  readonly refFor: (id: string) => (el: HTMLElement | null) => void;
  readonly announce: (message: string, politeness?: "polite" | "assertive") => void;
  /** Bumped by every non-empty announcement, so a frame change can tell whether anything was said. */
  readonly announceSerial: React.RefObject<number>;
}

export interface MachineTreeController {
  readonly api: MachineTreeApi;
  readonly base: TreeBase;
  readonly layout: LayoutCtx;
  readonly nav: NavigationCtx;
  readonly run: SimulationCtx;
  readonly modelCtx: TreeModelCtx;
  readonly announcement: { readonly polite: string; readonly assertive: string };
}

export function useMachineTreeController(props: MachineTreeProps): MachineTreeController {
  const { document, runtime, scenarios = [], activeStates: hostActive, simulation, maxItems } = props;
  const rootGraph = document.machines.find((m) => m.id === document.rootId) ?? document.machines[0]!;
  const ownSim = useMachineSimulation(document, rootGraph, runtime);
  const sim = simulation ?? ownSim;
  const isPhone = useMediaQuery("(max-width: 767px)");
  const coarse = useMediaQuery("(pointer: coarse)");
  const [store] = React.useState(createViewStore);
  const [handoff] = React.useState(createFocusHandoff);
  const runtimeRef = React.useRef(runtime);
  runtimeRef.current = runtime;
  const rootRef = React.useRef<HTMLDivElement>(null);
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const dir = useResolvedDirection(rootRef, props.dir);

  /* — data from the core — */
  // The core's issues plus the structural warnings Machine View shows too (nested transitions,
  // dead ends), so both components flag the same things in the same words.
  const structural = React.useMemo(() => document.machines.flatMap((graph) => structuralIssues(graph)), [document]);
  const topology = React.useMemo(() => withStructural(buildMachineTree(document, maxItems === undefined ? {} : { maxItems }), structural), [document, maxItems, structural]);
  // Only the deepest active states are "active"; their ancestors become `activeDescendant`.
  const active = sim.frame ? [{ machineId: rootGraph.id, activeIds: [...sim.leafIds] }] : hostActive;
  const activeKey = active?.length ? JSON.stringify(active) : "";
  const model = React.useMemo(
    () => (activeKey ? withStructural(buildMachineTree(document, { ...(maxItems === undefined ? {} : { maxItems }), activeStates: JSON.parse(activeKey) }), structural) : topology),
    [activeKey, document, maxItems, topology, structural],
  );
  const rows = React.useMemo(() => new Map(model.rows.map((row) => [row.id, row])), [model]);
  const links = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of topology.rows) {
      if (row.kind === "transition" || row.node?.kind === "submachine") {
        const target = resolveMachineTreeTarget(topology, row.id);
        if (target) map.set(row.id, target.id);
      }
    }
    return map;
  }, [topology]);
  const issues = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of model.issues) if (issue.rowId) map.set(issue.rowId, [...(map.get(issue.rowId) ?? []), issue.message]);
    return map;
  }, [model]);
  const stateRowIds = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const row of topology.rows) if (row.kind === "node" && row.machineId === rootGraph.id) map.set(row.elementId, row.id);
    return map;
  }, [topology, rootGraph.id]);
  const documentItems = React.useMemo(() => document.machines.reduce((n, m) => n + 1 + m.nodes.length + m.transitions.length, 0), [document]);

  /* — element registry — */
  const [elements] = React.useState(() => new Map<string, HTMLElement>());
  const refCache = React.useRef(new Map<string, (el: HTMLElement | null) => void>());
  const refFor = React.useCallback(
    (id: string) => {
      let ref = refCache.current.get(id);
      if (!ref) {
        ref = (el) => void (el ? elements.set(id, el) : elements.delete(id));
        refCache.current.set(id, ref);
      }
      return ref;
    },
    [elements],
  );

  /* — the live regions — */
  const [announcement, setAnnouncement] = React.useState({ polite: "", assertive: "" });
  const announceSerial = React.useRef(0);
  const announce = React.useCallback((message: string, politeness: "polite" | "assertive" = "polite") => {
    if (message) announceSerial.current++;
    // Repeating the same sentence still speaks: a trailing no-break space makes it a new string.
    setAnnouncement((current) => ({ ...current, [politeness]: message && current[politeness] === message ? `${message} ` : message }));
  }, []);

  const base: TreeBase = {
    document,
    scenarios,
    runtimeRef,
    rootGraph,
    label: props.label?.trim() || rootGraph.label,
    sim,
    topology,
    model,
    rows,
    links,
    issues,
    stateRowIds,
    documentItems,
    store,
    handoff,
    elements,
    refFor,
    announce,
    announceSerial,
  };

  const layout = useLayoutController(props, { isPhone, coarse, dir, rootRef, scrollerRef });
  // Enter / click on a row belongs to the simulation concern, created just below.
  const activate = useEvent((id: string) => run.activate(id));
  const nav = useNavigationController(props, base, layout, activate);
  const run = useSimulationController(base, layout, nav, props.onSimulationChange);

  const trimmedQuery = nav.deferredQuery.trim();
  const first = nav.order[0];
  const layoutEpoch = React.useMemo(() => ({ collapsed: nav.collapsed, query: trimmedQuery }), [nav.collapsed, trimmedQuery]);
  const modelCtx = React.useMemo<TreeModelCtx>(
    () => ({
      model,
      rows,
      projected: nav.projected,
      visible: nav.visible,
      first,
      links,
      issues,
      rootMachineId: rootGraph.id,
      searching: nav.searching,
      query: trimmedQuery,
      collapsed: nav.collapsed,
      layoutEpoch,
      sim: run.view,
      coarse,
      handoff,
      toggle: nav.toggle,
      select: nav.select,
      setFocusId: nav.setFocusId,
      setPeek: nav.setPeek,
      follow: nav.follow,
      reveal: nav.reveal,
      activate,
      sendEvent: run.sendEvent,
      applyFix: run.applyFix,
      setPreview: run.setPreview,
      refFor,
    }),
    [model, rows, nav.projected, nav.visible, first, links, issues, rootGraph.id, nav.searching, trimmedQuery, nav.collapsed, layoutEpoch, run.view, coarse, handoff, nav.toggle, nav.select, nav.setFocusId, nav.setPeek, nav.follow, nav.reveal, activate, run.sendEvent, run.applyFix, run.setPreview, refFor],
  );

  /* — the public contract (memoized; no internals) — */
  const openPanelApi = useEvent((tab: MachineTreeApi["panelTab"], options?: { readonly expanded?: boolean }) => layout.openPanel(tab, options?.expanded));
  const openGoTo = useEvent(() => layout.setGotoOpen(true));
  const runScenario = useEvent((scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (scenario) void run.playScenario(scenario);
  });
  const snapshot = sim.snapshot;
  const status: MachineTreeSimulationState["status"] = snapshot ? snapshot.status : "idle";
  const leafKey = [...sim.leafIds].join("\u0000");
  const simulationState = React.useMemo<MachineTreeSimulationState>(
    () => ({
      status,
      error: run.view.error,
      snapshot,
      steps: snapshot ? Math.max(0, snapshot.trace.length - 1) : 0,
      replayStep: sim.cursor,
      playingScenarioId: sim.playing,
      activeLeafIds: leafKey ? leafKey.split("\u0000") : [],
      enabledTransitionIds: sim.candidates.enabled,
      blockedTransitionIds: sim.candidates.blocked,
    }),
    [status, run.view.error, snapshot, sim.cursor, sim.playing, leafKey, sim.candidates],
  );
  const selectedRow = nav.selected ? rows.get(nav.selected) : undefined;
  const api = React.useMemo<MachineTreeApi>(
    () => ({
      document,
      rootMachine: rootGraph,
      model,
      selectedId: nav.selected,
      selectedRow,
      select: nav.select,
      reveal: nav.reveal,
      query: nav.query,
      setQuery: nav.setQuery,
      openFind: nav.openSearch,
      openGoTo,
      panelOpen: layout.panel,
      setPanelOpen: layout.setPanel,
      panelTab: layout.panelTab,
      setPanelTab: layout.setPanelTab,
      openPanel: openPanelApi,
      collapsedIds: nav.collapsed,
      setCollapsedIds: nav.setCollapsed,
      toggle: nav.toggle,
      expandAll: nav.expandAll,
      collapseAll: nav.collapseAll,
      simulation: simulationState,
      start: run.start,
      stop: run.stop,
      send: run.sendEvent,
      setReplayStep: sim.setCursor,
      runScenario,
      runAllScenarios: run.runAllScenarios,
      scenarioReports: run.reports,
    }),
    [document, rootGraph, model, nav.selected, selectedRow, nav.select, nav.reveal, nav.query, nav.setQuery, nav.openSearch, openGoTo, layout.panel, layout.setPanel, layout.panelTab, layout.setPanelTab, openPanelApi, nav.collapsed, nav.setCollapsed, nav.toggle, nav.expandAll, nav.collapseAll, simulationState, run.start, run.stop, run.sendEvent, sim.setCursor, runScenario, run.runAllScenarios, run.reports],
  );

  return { api, base, layout, nav, run, modelCtx, announcement };
}

/* ───────────────────────────── contexts ───────────────────────────── */

/** The shared base (document, rows, registry) for the built-in parts. */
export const BaseContext = React.createContext<TreeBase | null>(null);
export function useTreeBase(): TreeBase {
  const ctx = React.useContext(BaseContext);
  if (!ctx) throw new Error("Machine Tree parts must be rendered inside <MachineTreeRoot>");
  return ctx;
}
export const ApiContext = React.createContext<MachineTreeApi | null>(null);
/** The documented `MachineTreeApi` of the nearest `<MachineTreeRoot>`. */
export function useMachineTree(): MachineTreeApi {
  const ctx = React.useContext(ApiContext);
  if (!ctx) throw new Error("useMachineTree() must be called inside <MachineTreeRoot>");
  return ctx;
}

/**
 * Appends the shared structural warnings to a core tree model, each attached to the row of the
 * state or transition it is about (its first occurrence), so row marks, the Diagnostics popover
 * and the error card's count all include them.
 */
function withStructural(model: MachineTreeModel, structural: readonly MachineIssue[]): MachineTreeModel {
  if (!structural.length) return model;
  const rowOf = new Map<string, string>();
  for (const row of model.rows) {
    const key = `${row.kind}:${row.machineId}:${row.elementId}`;
    if ((row.kind === "node" || row.kind === "transition") && !rowOf.has(key)) rowOf.set(key, row.id);
  }
  const extra: MachineTreeIssue[] = structural.map((issue) => {
    const rowId = issue.nodeId ? rowOf.get(`node:${issue.machineId}:${issue.nodeId}`) : issue.transitionId ? rowOf.get(`transition:${issue.machineId}:${issue.transitionId}`) : undefined;
    return { code: issue.code, message: issue.message, ...(issue.machineId ? { machineId: issue.machineId } : {}), ...(rowId ? { rowId } : {}) };
  });
  return { ...model, issues: [...model.issues, ...extra] };
}
