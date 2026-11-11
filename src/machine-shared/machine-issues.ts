import type { MachineGraph, MachineIssue, MachineNode, MachineTransition } from "../core/index.js";

/**
 * Structural advice the core validator does not flag, shared by Machine Graph (Issues tab) and
 * Machine Tree (row marks + Diagnostics) so both components warn about the same things in the
 * same words. Pure; no React.
 *
 *   nested-transition  a transition between a state and its own descendant (either way): it exits
 *                      and re-enters the container, which is rarely what an author meant
 *   dead-end           a state you can enter but never leave that is not final: a run gets stuck
 */

/** True when `ancestorId` contains `id` (any depth). */
export function isAncestor(graph: MachineGraph, ancestorId: string, id: string): boolean {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  for (let p = byId.get(id)?.parentId; p; p = byId.get(p)?.parentId)
    if (p === ancestorId) return true;
  return false;
}

/** A transition between a state and one of its own descendants (either way). */
export const isNestedTransition = (graph: MachineGraph, t: MachineTransition) =>
  isAncestor(graph, t.sourceId, t.targetId) || isAncestor(graph, t.targetId, t.sourceId);

/**
 * States a transition enters that have no way out: a non-final leaf (atomic, or a submachine
 * reference) whose own transitions and every ancestor's are empty.
 */
export function deadEndStates(graph: MachineGraph): readonly MachineNode[] {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const sources = new Set(graph.transitions.map((t) => t.sourceId));
  const targets = new Set(graph.transitions.map((t) => t.targetId));
  const parents = new Set(
    graph.nodes.filter((n) => n.kind !== "note" && n.parentId).map((n) => n.parentId!),
  );
  const hasExit = (id: string | undefined): boolean => {
    for (let p = id; p; p = byId.get(p)?.parentId) if (sources.has(p)) return true;
    return false;
  };
  return graph.nodes.filter(
    (n) =>
      (n.kind === "atomic" || n.kind === "submachine") &&
      !parents.has(n.id) &&
      targets.has(n.id) &&
      !hasExit(n.id),
  );
}

/** The shared structural warnings for one machine, in display order (nested transitions, then dead ends). */
export function structuralIssues(
  graph: MachineGraph,
  machineId: string = graph.id,
): MachineIssue[] {
  const name = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
  const nested: MachineIssue[] = graph.transitions
    .filter((t) => isNestedTransition(graph, t))
    .map((t) => ({
      code: "nested-transition",
      severity: "warning",
      machineId,
      transitionId: t.id,
      message: isAncestor(graph, t.sourceId, t.targetId)
        ? `Goes from ${name(t.sourceId)} into its own child ${name(t.targetId)}, so it exits and re-enters ${name(t.sourceId)}.`
        : `Goes from ${name(t.sourceId)} out to its own container ${name(t.targetId)}, so it re-enters ${name(t.targetId)} from its initial state.`,
    }));
  const stuck: MachineIssue[] = deadEndStates(graph).map((n) => ({
    code: "dead-end",
    severity: "warning",
    machineId,
    nodeId: n.id,
    message: `${n.label} has no way out and isn't final.`,
  }));
  return [...nested, ...stuck];
}
