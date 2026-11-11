/**
 * Simulation emphasis, the value half of `machine-sim.css` (shared by Machine Graph and Machine
 * Tree). Put the result on the element that represents a state as `data-sim={...}` and read the
 * `--sim-*` tokens with a design fallback, e.g. `text-[color:var(--sim-text,var(--muted-foreground))]`.
 *
 *   active     a live leaf (the frontier)
 *   ancestor   active because a descendant is (a container)
 *   inactive   not part of the current configuration, while a run is on
 *   undefined  not simulating: design colours
 */
export type SimState = "active" | "ancestor" | "inactive" | undefined;

export function simStateOf({
  leaf,
  ancestor,
  simulating,
}: {
  /** The state is one of the deepest active states. */
  readonly leaf: boolean;
  /** The state is active because one of its descendants is. */
  readonly ancestor: boolean;
  /** A run is on and its frame is the one on screen (an errored run dims nothing). */
  readonly simulating: boolean;
}): SimState {
  if (leaf) return "active";
  if (ancestor) return "ancestor";
  return simulating ? "inactive" : undefined;
}
