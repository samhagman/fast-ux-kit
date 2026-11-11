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
 *
 * Names are never quoted or capitalised inside a sentence: event and guard names are the
 * document's own identifiers ("guard approved is false", not 'Guard “approved” is false').
 */

/** "1 state", "2 states"; `many` for irregular plurals ("1 entry", "2 entries"). */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A spoken list: "A", "A and B", "A, B and C". */
export function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
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
