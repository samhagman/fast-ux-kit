import * as React from "react";
import type { MachineGraph, MachineNode } from "@fux/core";
import type { MachineViewController } from "./use-machine-view";

/**
 * The two contexts every Machine View part reads:
 *  - `MachineContext`: the controller (document, selection, layout, simulation).
 *  - `ChromeContext`: view-only shell state (phone vs desktop, inspector, sheet snap).
 * Plus the shared vocabulary helpers, so canvas, inspector, menus and screen readers agree.
 */
export const MachineContext = React.createContext<MachineViewController | null>(null);
export const useMachine = () => {
  const value = React.useContext(MachineContext);
  if (!value) throw new Error("Machine parts must render inside <MachineView>.");
  return value;
};

export type { MachineSheetSnap as SheetSnap } from "../machine-shared/machine-sheet";
import type { MachineSheetSnap as SheetSnap } from "../machine-shared/machine-sheet";

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
  node.kind === "compound" && node.parentId && graph.nodes.find((n) => n.id === node.parentId)?.kind === "parallel" ? "region" : KIND_LABEL[node.kind];
/** The shared `plural` (one helper for both machine components). */
export { plural } from "../machine-shared/machine-copy";
/** States as users count them: no notes, no initial pseudo-states. */
export const countStates = (graph: MachineGraph) => graph.nodes.filter((n) => n.kind !== "note" && n.kind !== "initial").length;
/**
 * Transitions as a reader counts them: the eventless arrow out of an initial pseudo-state is the
 * "starts here" marker (drawn without a chip, hidden from assistive tech), not a transition.
 */
export const countTransitions = (graph: MachineGraph) => {
  const pseudo = new Set(graph.nodes.filter((n) => n.kind === "initial").map((n) => n.id));
  return graph.transitions.filter((t) => !(pseudo.has(t.sourceId) && !t.event)).length;
};

export function stepCursor(mv: MachineViewController, delta: number) {
  const trace = mv.snapshot?.trace ?? [];
  if (!trace.length) return;
  const current = mv.cursor ?? trace.length - 1;
  const next = Math.max(0, Math.min(trace.length - 1, current + delta));
  mv.setCursor(next === trace.length - 1 ? null : next);
}

export function subtreeOf(graph: MachineGraph, id: string): Set<string> {
  const ids = new Set([id]);
  for (let grew = true; grew; ) {
    grew = false;
    for (const n of graph.nodes)
      if (n.parentId && ids.has(n.parentId) && !ids.has(n.id)) {
        ids.add(n.id);
        grew = true;
      }
  }
  return ids;
}
