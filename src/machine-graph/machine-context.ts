import * as React from "react";
import type { MachineGraph, MachineNode } from "../core/index.js";
import type { MachineGraphController } from "./use-machine-graph.js";

/**
 * Machine Graph context boundaries:
 *  - `MachineContext`: the controller (document, selection, layout, simulation).
 *  - `ChromeContext`: view-only shell state (phone vs desktop, inspector, sheet snap).
 *   - CanvasContext and DiagramContext: stable render facts for topology and activity.
 * Shared vocabulary helpers keep canvas, inspector, menus and screen readers consistent.
 */
export const MachineContext = React.createContext<MachineGraphController | null>(null);
export const useMachine = () => {
  const value = React.useContext(MachineContext);
  if (!value) throw new Error("Machine parts must render inside <MachineGraphView>.");
  return value;
};

/** Diagram render facts exclude observation payloads, work and history. Event handlers read the current controller. */
type DiagramFacts = Pick<
  MachineGraphController,
  | "graph"
  | "machines"
  | "direction"
  | "mode"
  | "renaming"
  | "activeSet"
  | "leafIds"
  | "preview"
  | "presentation"
  | "candidates"
  | "openMachine"
  | "setSelection"
  | "sendEvent"
  | "previewEvent"
> & {
  readonly simulating: boolean;
  readonly takenIds: readonly string[];
  readonly pingSequence: number | undefined;
};
export const DiagramContext = React.createContext<DiagramFacts | null>(null);
export function useDiagram() {
  const value = React.useContext(DiagramContext);
  if (!value) throw new Error("Diagram parts must render inside <MachineGraphView>.");
  return value;
}
export function useDiagramFacts(mv: MachineGraphController): DiagramFacts {
  const latest = React.useRef(mv);
  latest.current = mv;
  const openMachine = React.useCallback((id: string) => latest.current.openMachine(id), []);
  const setSelection = React.useCallback<MachineGraphController["setSelection"]>(
    (value) => latest.current.setSelection(value),
    [],
  );
  const sendEvent = React.useCallback<MachineGraphController["sendEvent"]>(
    (event, input) => latest.current.sendEvent(event, input),
    [],
  );
  const previewEvent = React.useCallback(
    (event: string | null) => latest.current.previewEvent(event),
    [],
  );
  const takenKey = JSON.stringify(mv.frame?.transitionIds ?? []);
  const takenIds = React.useMemo<readonly string[]>(() => JSON.parse(takenKey), [takenKey]);
  const candidatesKey = JSON.stringify([
    [...mv.candidates.enabled],
    [...mv.candidates.blocked],
    [...mv.candidates.offered],
  ]);
  const candidates = React.useMemo(() => {
    const [enabled, blocked, offered] = JSON.parse(candidatesKey) as [string[], string[], string[]];
    return { enabled: new Set(enabled), blocked: new Set(blocked), offered: new Set(offered) };
  }, [candidatesKey]);
  const simulating = mv.mode === "inspect" ? !!mv.frame : !!mv.snapshot;
  const pingSequence = mv.snapshot?.sequence;
  return React.useMemo(
    () => ({
      graph: mv.graph,
      machines: mv.machines,
      direction: mv.direction,
      mode: mv.mode,
      renaming: mv.renaming,
      activeSet: mv.activeSet,
      leafIds: mv.leafIds,
      preview: mv.preview,
      presentation: mv.presentation,
      candidates,
      simulating,
      takenIds,
      pingSequence,
      openMachine,
      setSelection,
      sendEvent,
      previewEvent,
    }),
    [
      mv.graph,
      mv.machines,
      mv.direction,
      mv.mode,
      mv.renaming,
      mv.activeSet,
      mv.leafIds,
      mv.preview,
      mv.presentation,
      candidates,
      simulating,
      takenIds,
      pingSequence,
      openMachine,
      setSelection,
      sendEvent,
      previewEvent,
    ],
  );
}

/** Canvas controls only subscribe to topology, selection and local simulation changes. */
type CanvasController = Pick<
  MachineGraphController,
  | "graph"
  | "machineId"
  | "direction"
  | "mode"
  | "editable"
  | "selection"
  | "renaming"
  | "layout"
  | "layoutVersion"
  | "refusals"
  | "revealRequest"
  | "viewport"
  | "fitPending"
  | "snapshot"
  | "cursor"
  | "activeSet"
  | "candidates"
  | "leafIds"
  | "run"
  | "announce"
  | "notify"
  | "latestGraph"
  | "freshId"
  | "reportHeights"
  | "setSelection"
  | "setRenaming"
  | "openMachine"
  | "sendEvent"
  | "eventOptions"
  | "requestFocus"
  | "reparent"
  | "deleteSelection"
  | "addConnected"
> & { readonly takenIds: readonly string[] };
export const CanvasContext = React.createContext<CanvasController | null>(null);
export function useCanvas() {
  const value = React.useContext(CanvasContext);
  if (!value) throw new Error("Canvas parts must render inside <MachineGraphView>.");
  return value;
}
export function useCanvasController(
  mv: MachineGraphController,
  diagram: DiagramFacts,
): CanvasController {
  const latest = React.useRef(mv);
  latest.current = mv;
  const commands = React.useMemo(
    () => ({
      run: (...args: Parameters<MachineGraphController["run"]>) => latest.current.run(...args),
      announce: (...args: Parameters<MachineGraphController["announce"]>) =>
        latest.current.announce(...args),
      notify: (...args: Parameters<MachineGraphController["notify"]>) =>
        latest.current.notify(...args),
      latestGraph: () => latest.current.latestGraph(),
      freshId: (...args: Parameters<MachineGraphController["freshId"]>) =>
        latest.current.freshId(...args),
      reportHeights: (...args: Parameters<MachineGraphController["reportHeights"]>) =>
        latest.current.reportHeights(...args),
      setSelection: (...args: Parameters<MachineGraphController["setSelection"]>) =>
        latest.current.setSelection(...args),
      setRenaming: (...args: Parameters<MachineGraphController["setRenaming"]>) =>
        latest.current.setRenaming(...args),
      openMachine: (...args: Parameters<MachineGraphController["openMachine"]>) =>
        latest.current.openMachine(...args),
      sendEvent: (...args: Parameters<MachineGraphController["sendEvent"]>) =>
        latest.current.sendEvent(...args),
      eventOptions: (...args: Parameters<MachineGraphController["eventOptions"]>) =>
        latest.current.eventOptions(...args),
      requestFocus: (...args: Parameters<MachineGraphController["requestFocus"]>) =>
        latest.current.requestFocus(...args),
      reparent: (...args: Parameters<MachineGraphController["reparent"]>) =>
        latest.current.reparent(...args),
      deleteSelection: () => latest.current.deleteSelection(),
      addConnected: (...args: Parameters<MachineGraphController["addConnected"]>) =>
        latest.current.addConnected(...args),
    }),
    [],
  );
  return React.useMemo(
    () => ({
      ...commands,
      graph: mv.graph,
      machineId: mv.machineId,
      direction: mv.direction,
      mode: mv.mode,
      editable: mv.editable,
      selection: mv.selection,
      renaming: mv.renaming,
      layout: mv.layout,
      layoutVersion: mv.layoutVersion,
      refusals: mv.refusals,
      revealRequest: mv.revealRequest,
      viewport: mv.viewport,
      fitPending: mv.fitPending,
      snapshot: mv.snapshot,
      cursor: mv.cursor,
      activeSet: diagram.activeSet,
      leafIds: diagram.leafIds,
      takenIds: diagram.takenIds,
      candidates: diagram.candidates,
    }),
    [
      commands,
      mv.graph,
      mv.machineId,
      mv.direction,
      mv.mode,
      mv.editable,
      mv.selection,
      mv.renaming,
      mv.layout,
      mv.layoutVersion,
      mv.refusals,
      mv.revealRequest,
      mv.viewport,
      mv.fitPending,
      mv.snapshot,
      mv.cursor,
      diagram.activeSet,
      diagram.leafIds,
      diagram.takenIds,
      diagram.candidates,
    ],
  );
}

export type { MachineSheetSnap as SheetSnap } from "../machine-shared/machine-sheet.js";
import type { MachineSheetSnap as SheetSnap } from "../machine-shared/machine-sheet.js";

/** Below this container width the view uses its phone shell (peek bar + sheet). */
export const COMPACT_BREAKPOINT = 768;
/** Desktop inspector width in px; the shell sets `--panel-w` from it, so CSS and layout math agree. */
export const PANEL_W = 320;

/** View-only chrome state shared by toolbar, canvas, inspector and the phone sheet. */
export interface MachineChrome {
  readonly compact: boolean;
  readonly panelOpen: boolean;
  readonly setPanelOpen: (open: boolean) => void;
  /** Phone sheet snap while it is open. */
  readonly snap: SheetSnap;
  readonly setSnap: (snap: SheetSnap) => void;
  /** Pixels the phone sheet covers at the bottom of the canvas (its target snap, not its animated height). */
  readonly sheetInset: number;
  readonly setSheetInset: (px: number) => void;
  readonly minimap: boolean;
  readonly setMinimap: (on: boolean) => void;
  readonly showShortcuts: () => void;
  readonly showCommands: () => void;
}
export const ChromeContext = React.createContext<MachineChrome | null>(null);
export const useMachineChrome = () => React.useContext(ChromeContext)!;

/** One vocabulary for node kinds: canvas, inspector, menus and screen readers agree. */
export const KIND_LABEL: Record<MachineNode["kind"], string> = {
  atomic: "state",
  compound: "compound",
  parallel: "parallel",
  initial: "initial",
  final: "final",
  submachine: "submachine",
  note: "note",
};
/** The tag a node shows: a compound directly inside a parallel is a "region". Canvas, inspector and peek bar share it. */
export const kindTag = (graph: MachineGraph, node: MachineNode) =>
  node.kind === "compound" &&
  node.parentId &&
  graph.nodes.find((n) => n.id === node.parentId)?.kind === "parallel"
    ? "region"
    : KIND_LABEL[node.kind];
/** The shared `plural` (one helper for both machine components). */
export { plural } from "../machine-shared/machine-copy.js";
/** States as users count them: no notes, no initial pseudo-states. */
export const countStates = (graph: MachineGraph) =>
  graph.nodes.filter((n) => n.kind !== "note" && n.kind !== "initial").length;
/**
 * Transitions as a reader counts them: the eventless arrow out of an initial pseudo-state is the
 * "starts here" marker (drawn without a chip, hidden from assistive tech), not a transition.
 */
export const countTransitions = (graph: MachineGraph) => {
  const pseudo = new Set(graph.nodes.filter((n) => n.kind === "initial").map((n) => n.id));
  return graph.transitions.filter((t) => !(pseudo.has(t.sourceId) && !t.event)).length;
};

export function stepCursor(mv: MachineGraphController, delta: number) {
  const trace = mv.snapshot?.trace ?? [];
  if (!trace.length) return;
  const current = mv.cursor ?? trace.length - 1;
  const next = Math.max(0, Math.min(trace.length - 1, current + delta));
  mv.setCursor(next === trace.length - 1 ? null : next);
}

export function subtreeOf(graph: MachineGraph, id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew;) {
    grew = false;
    for (const n of graph.nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
  }
  return ids;
}
