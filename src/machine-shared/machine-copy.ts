/**
 * One vocabulary for both machine components (Machine Graph and Machine Tree): the sentences a
 * simulation says (live region, toast, footer notice), counts, and the key caps. Pure: no React,
 * no DOM, so the copy can be tested headlessly and the two components can never drift apart.
 *
 *   describeStart(["Draft"])                       "Simulation started — now in Draft"
 *   describeSend("SUBMIT", ["Review"])             "SUBMIT fired — now in Review"
 *   describeSend("DECLINE", ["Declined"], true)    "DECLINE fired — now in Declined; the machine finished"
 *   describeBlocked("DECIDE", guardIsFalse("approved"))
 *                                                  "DECIDE blocked — guard approved is false"
 *   plural(2, "transition")                        "2 transitions"
 *   listOf(["A", "B", "C"])                        "A, B and C"
 *   describeMachine(graph)                         "3 states: Placed, Packed and Cancelled.
 *                                                   2 transitions: PACK from Placed to Packed; …"
 *
 * Names are never quoted or capitalised inside a sentence: event and guard names are the
 * document's own identifiers ("guard approved is false", not 'Guard “approved” is false').
 */

import type { MachineGraph, MachineTransition } from "../core/index.js";

/** "1 state", "2 states"; `many` for irregular plurals ("1 entry", "2 entries"). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A spoken list: "A", "A and B", "A, B and C". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** States as users count them: no notes, no initial pseudo-states. */
export const countStates = (graph: MachineGraph) =>
  graph.nodes.filter((n) => n.kind !== "note" && n.kind !== "initial").length;
/**
 * Transitions as a reader counts them: the eventless arrow out of an initial pseudo-state is the
 * "starts here" marker (drawn without a chip, hidden from assistive tech), not a transition.
 */
export const countTransitions = (graph: MachineGraph) => readerTransitions(graph).length;
const readerTransitions = (graph: MachineGraph): readonly MachineTransition[] => {
  const pseudo = new Set(graph.nodes.filter((n) => n.kind === "initial").map((n) => n.id));
  return graph.transitions.filter((t) => !(pseudo.has(t.sourceId) && !t.event));
};

/** How many states and transitions `describeMachine` names before it says "and N more". */
const DESCRIBED = 40;

/**
 * A machine in words, for a picture of it that has no other text equivalent (`chrome="none"`):
 * its states, then each transition as "EVENT [guard] from Source to Target". Bounded: past 40 of
 * either it says how many more there are. Counted the way the status bar counts.
 */
export function describeMachine(graph: MachineGraph): string {
  const names = new Map(graph.nodes.map((n) => [n.id, n.label]));
  const states = graph.nodes.filter((n) => n.kind !== "note" && n.kind !== "initial");
  const transitions = readerTransitions(graph);
  const some = (items: readonly string[]) =>
    items.length > DESCRIBED
      ? [...items.slice(0, DESCRIBED), `${items.length - DESCRIBED} more`]
      : items;
  const route = (t: MachineTransition) =>
    `${t.event || "always"}${t.guard ? ` [${t.guard}]` : ""} from ${names.get(t.sourceId) ?? t.sourceId} to ${names.get(t.targetId) ?? t.targetId}`;
  return [
    states.length
      ? `${plural(states.length, "state")}: ${listOf(some(states.map((n) => n.label)))}.`
      : "No states.",
    transitions.length
      ? `${plural(transitions.length, "transition")}: ${some(transitions.map(route)).join("; ")}.`
      : "No transitions.",
  ].join(" ");
}

/** Where the run is, as a phrase: the active leaves, or "no state" for an empty configuration. */
const where = (leaves: readonly string[]) => listOf(leaves) || "no state";
const finished = (done: boolean) => (done ? "; the machine finished" : "");

/**
 * A run that just began (Simulate, Restart): names the state it starts in, never the machine.
 * `lead` replaces "Simulation started" for a run with a name ("Playing scenario Happy path").
 */
export function describeStart(
  leaves: readonly string[],
  done = false,
  lead = "Simulation started",
): string {
  return `${lead} — now in ${where(leaves)}${finished(done)}`;
}

/** An event that moved the run (eventless steps it settled through are said under that event). */
export function describeSend(event: string, leaves: readonly string[], done = false): string {
  return `${event} fired — now in ${where(leaves)}${finished(done)}`;
}

/** An event the run refused, with why: `describeBlocked("DECIDE", guardIsFalse("approved"))`. */
export function describeBlocked(event: string, reason: string): string {
  return `${event} blocked — ${reason}`;
}

/** The reason half of a blocked sentence for a guard that returned anything but `true`. */
export const guardIsFalse = (guard: string | readonly string[]) =>
  `guard ${typeof guard === "string" ? guard : guard.join(" / ")} is false`;

/**
 * Key caps, the glyph style both components use inside `<Kbd>` (combinations go through
 * `formatShortcut` / `useShortcutLabel` in `lib/platform`, which uses the same ↵ glyph). Prose
 * ("drag its arrowhead") is never a key cap.
 */
export const KEY = {
  enter: "↵",
  escape: "esc",
  tab: "tab",
  delete: "⌫",
  up: "↑",
  down: "↓",
  left: "←",
  right: "→",
} as const;

/**
 * A modifier combination written in prose (names, descriptions, hints), one style per platform:
 * "⌘-click", "⌘-Enter", "⌘-K" on Apple; "Ctrl+click", "Ctrl+Enter", "Ctrl+K" elsewhere.
 * Key caps (`<Kbd>`) use the glyph form from `formatShortcut` instead.
 */
export function modCombo(mod: "⌘" | "Ctrl", key: string): string {
  return mod === "⌘" ? `⌘-${key}` : `${mod}+${key}`;
}
