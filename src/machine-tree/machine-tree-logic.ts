/**
 * Machine Tree, pure half: labels, blocked reasons, scenario reports, dry-run previews, fold
 * counts. No React, no DOM: everything here is a function of core data and can be tested
 * headlessly the way `src/core` is.
 */
import {
  getEnabledMachineTransitions,
  sendMachineEvent,
  type MachineDocument,
  type MachineEvent,
  type MachineGraph,
  type MachineRuntimeOptions,
  type MachineScenario,
  type MachineSnapshot,
  type MachineTransition,
  type MachineTreeRow,
  type MachineTreeVisibleRow,
} from "../core/index.js";
import {
  machineEvent,
  runMachineScenario,
  type ScenarioStep,
} from "../machine-shared/use-machine-simulation.js";
import { describeBlocked, guardIsFalse, plural } from "../machine-shared/machine-copy.js";

/** The shared vocabulary (one `plural`, one `modCombo` for both machine components). */
export { modCombo, plural } from "../machine-shared/machine-copy.js";
export const traceEventLabel = (event: string) =>
  event === "@start" ? "Start" : event || "automatic";
/** Phone sheet snap points (the shared sheet's; its geometry lives in machine-shared). */
export type { MachineSheetSnap as MachineTreeSheetSnap } from "../machine-shared/machine-sheet.js";
/** Type-ahead buffer window (WAI tree pattern). */
export const TYPEAHEAD_MS = 500;
/** Elements a keyboard user can Tab to: the focus hand-off picks from these. */
export const TABBABLE =
  'button:not([disabled]):not([tabindex="-1"]), [href], input:not([disabled]), textarea:not([disabled]), [tabindex="0"]';

/** Display kind; the block badge and the Details panel share this one function. */
export function kindLabel(row: MachineTreeRow, parent: MachineTreeRow | undefined): string {
  if (row.kind === "machine") return "Machine";
  if (row.kind === "transition")
    return row.transition?.event ? "Transition" : "Automatic transition";
  switch (row.node?.kind) {
    case "parallel":
      return "Parallel";
    case "compound":
      return parent?.node?.kind === "parallel" ? "Region" : "Compound";
    case "final":
      return "Final state";
    case "submachine":
      return "Submachine";
    case "initial":
      return "Initial pseudo-state";
    case "note":
      return "Note";
    default:
      return "State";
  }
}

/**
 * Why an active-source route is blocked, phrased as a sentence. Mirrors the core guard
 * contract (own property, synchronous `=== true`, throw → blocked). Called once per blocked
 * transition per snapshot + payload (inside a memo), never during row render.
 */
export function explainBlocked(
  t: MachineTransition,
  context: Readonly<Record<string, unknown>>,
  event: MachineEvent,
  runtime: MachineRuntimeOptions | undefined,
): string {
  const name = t.event || "Automatic transition";
  if (!t.guard) return `${name} — another ${name} transition takes priority`;
  const guards = runtime?.guards;
  const guard = guards && Object.hasOwn(guards, t.guard) ? guards[t.guard] : undefined;
  if (!guard) return describeBlocked(name, `guard ${t.guard} isn’t provided by the host`);
  try {
    const result: unknown = guard(context, event);
    if (result && typeof (result as { then?: unknown }).then === "function")
      return describeBlocked(
        name,
        `guard ${t.guard} returned a promise; guards must be synchronous`,
      );
    if (result !== true) return describeBlocked(name, guardIsFalse(t.guard));
  } catch {
    return describeBlocked(name, `guard ${t.guard} threw`);
  }
  return `${name} — another ${name} transition takes priority`;
}

/** Why a scripted scenario step changed nothing, explained against the snapshot it was sent to. */
export function explainStep(
  step: ScenarioStep,
  graph: MachineGraph,
  runtime: MachineRuntimeOptions | undefined,
): string {
  const candidates = graph.transitions.filter(
    (t) => (t.event ?? "") === step.event && step.before.activeIds.includes(t.sourceId),
  );
  if (step.before.status !== "running") return `${step.event} — the machine had already finished`;
  if (!candidates.length) return `${step.event} — no active state handles it`;
  const guarded = candidates.find((t) => t.guard) ?? candidates[0]!;
  return explainBlocked(
    guarded,
    step.before.context,
    machineEvent(step.event, step.payload),
    runtime,
  );
}

export interface MachineTreeScenarioReport {
  /** `undefined` when the scenario declares no `expectedActiveIds` (or it was stopped). */
  readonly passed: boolean | undefined;
  /** One sentence per refused step ("Step 2: DECIDE blocked — …"). */
  readonly blocked: readonly string[];
  /** Set when a manual send took over the scenario: the number of steps it had played. */
  readonly stoppedAt?: number;
}

/** The refusal sentence for one played step ("Step 2: DECIDE blocked — …"). */
export const stepSentence = (
  step: ScenarioStep,
  graph: MachineGraph,
  runtime: MachineRuntimeOptions | undefined,
) => `Step ${step.index + 1}: ${explainStep(step, graph, runtime)}`;

/**
 * "Run all": the shared headless runner (same steps and pass rule as an animated run), reported
 * with the tree's refusal sentences.
 */
export function scenarioReport(
  document: MachineDocument,
  graph: MachineGraph,
  scenario: MachineScenario,
  runtime: MachineRuntimeOptions | undefined,
): MachineTreeScenarioReport {
  const result = runMachineScenario(document, graph.id, scenario, runtime ?? {});
  return {
    passed: result.passed,
    blocked: result.blocked.map((step) => stepSentence(step, graph, runtime)),
  };
}

/** A payload that would let a blocked transition fire, taken from the host's scenarios. */
export interface MachineTreeFix {
  readonly event: string;
  readonly payload: unknown;
  /** `JSON.stringify(payload)`, also what the payload editor receives. */
  readonly text: string;
}

/** Every distinct event payload the scenarios use, first event type wins. */
export function scenarioPayloads(scenarios: readonly MachineScenario[]): readonly MachineTreeFix[] {
  const seen = new Map<string, MachineTreeFix>();
  for (const scenario of scenarios)
    for (const event of scenario.events)
      if (event.payload !== undefined) {
        const text = JSON.stringify(event.payload);
        if (!seen.has(`${event.type}\u0000${text}`))
          seen.set(`${event.type}\u0000${text}`, {
            event: event.type,
            payload: event.payload,
            text,
          });
      }
  return [...seen.values()];
}

/** Blocked routes → a sentence each, and the scenario payloads that the core says would unblock them. */
export function blockedDetails(
  document: MachineDocument,
  graph: MachineGraph,
  snapshot: MachineSnapshot,
  blocked: ReadonlySet<string>,
  payload: unknown,
  payloads: readonly MachineTreeFix[],
  runtime: MachineRuntimeOptions | undefined,
) {
  const reasons = new Map<string, string>();
  const fixes = new Map<string, MachineTreeFix[]>();
  for (const t of graph.transitions) {
    if (!blocked.has(t.id)) continue;
    reasons.set(
      t.id,
      explainBlocked(t, snapshot.context, machineEvent(t.event ?? "", payload), runtime),
    );
    const found =
      t.event && t.guard
        ? payloads.filter(
            (p) =>
              p.event === t.event &&
              getEnabledMachineTransitions(
                document,
                snapshot,
                { type: t.event!, payload: p.payload },
                runtime ?? {},
              ).some((x) => x.id === t.id),
          )
        : [];
    if (found.length) fixes.set(t.id, found);
  }
  return { reasons, fixes };
}

export function leafLabels(graph: MachineGraph, activeIds: readonly string[]): string[] {
  const set = new Set(activeIds);
  return activeIds
    .filter((id) => !graph.nodes.some((node) => node.parentId === id && set.has(node.id)))
    .map((id) => graph.nodes.find((node) => node.id === id)?.label ?? id);
}

/** Deepest ids of a configuration: those with no active child. */
export function deepestIds(graph: MachineGraph, ids: readonly string[]): string[] {
  const set = new Set(ids);
  return ids.filter((id) => !graph.nodes.some((node) => node.parentId === id && set.has(node.id)));
}

/** A dry run of one event against the live snapshot: computed, never committed. */
export interface MachineTreePreview {
  readonly event: string;
  /** Row ids of the states it would enter / leave. */
  readonly enter: ReadonlySet<string>;
  readonly exit: ReadonlySet<string>;
  /** Labels of the deepest states the run would be in afterwards. */
  readonly to: readonly string[];
}

/**
 * Dry run: what sending `event` now would do. Host actions are pure by contract, so this is a
 * computation through the core, not an execution; the live run is never touched. `undefined`
 * when the event would change nothing (or the core throws).
 */
export function previewEvent(
  document: MachineDocument,
  graph: MachineGraph,
  snapshot: MachineSnapshot,
  event: MachineEvent,
  stateRowIds: ReadonlyMap<string, string>,
  runtime: MachineRuntimeOptions | undefined,
): MachineTreePreview | undefined {
  let next: MachineSnapshot;
  try {
    next = sendMachineEvent(document, snapshot, event, runtime ?? {});
  } catch {
    return undefined;
  }
  if (next.sequence === snapshot.sequence) return undefined;
  const before = deepestIds(graph, snapshot.activeIds);
  const after = deepestIds(graph, next.activeIds);
  const toRows = (ids: Iterable<string>) =>
    new Set([...ids].map((id) => stateRowIds.get(id)).filter((id): id is string => !!id));
  // Re-entered states (self-transitions) count as both left and entered.
  const entered = new Set(
    next.trace
      .filter((entry) => entry.sequence > snapshot.sequence)
      .flatMap((entry) => entry.entered ?? []),
  );
  return {
    event: event.type,
    enter: toRows(after.filter((id) => entered.has(id) || !before.includes(id))),
    exit: toRows(before.filter((id) => entered.has(id) || !after.includes(id))),
    to: leafLabels(graph, next.activeIds),
  };
}

/* ───────────────────────────── simulation view ───────────────────────────── */

export type RouteState = "idle" | "enabled" | "blocked" | "inactive";

export interface SimView {
  /** A local run exists (any status). */
  readonly running: boolean;
  /** A run exists and is not in error: nothing dims, no live dot on error. */
  readonly live: boolean;
  readonly replaying: boolean;
  readonly done: boolean;
  /** The run's error message when it stopped in error, else null. */
  readonly error: string | null;
  readonly enabled: ReadonlySet<string>;
  readonly blocked: ReadonlySet<string>;
  /** Distinct event types that can fire right now (live frame only). */
  readonly enabledEvents: readonly string[];
  /** transition id → sentence. */
  readonly reasons: ReadonlyMap<string, string>;
  /** transition id → payloads (from the scenarios) that would let a blocked route fire. */
  readonly fixes: ReadonlyMap<string, readonly MachineTreeFix[]>;
  readonly taken: ReadonlySet<string>;
  readonly entered: ReadonlySet<string>;
  readonly pingKey: number;
  /**
   * Lazy dry run: computed on first ask (hover, focus, a palette open) and cached for this
   * snapshot + payload, so starting a run or moving focus never pays for every enabled event.
   */
  readonly previewOf: (event: string) => MachineTreePreview | undefined;
}

export function routeStateOf(row: MachineTreeRow, sim: SimView, rootMachineId: string): RouteState {
  if (!sim.running || row.machineId !== rootMachineId || !row.transition) return "idle";
  if (sim.enabled.has(row.transition.id)) return "enabled";
  if (sim.blocked.has(row.transition.id)) return "blocked";
  return "inactive";
}

/** "CLASSIFIED blocked — guard confident is false" → "guard confident is false": the row already names the event. */
export function shortReason(reason: string, event: string | undefined): string {
  const head = event ? describeBlocked(event, "") : "";
  return head && reason.startsWith(head) ? reason.slice(head.length) : reason;
}

export function reasonOf(row: MachineTreeRow, state: RouteState, sim: SimView): string {
  const t = row.transition;
  if (!t) return "";
  if (state === "blocked") return sim.reasons.get(t.id) ?? `${t.event} blocked`;
  if (state !== "inactive") return "";
  if (sim.error !== null) return `Simulation stopped — ${sim.error}`;
  if (sim.replaying) return "Replaying history — return to live to send events";
  if (sim.done) return "The machine has finished — restart to send events";
  return `${t.event || "Automatic transition"} — its source state isn’t active`;
}

export function isFoldable(
  row: MachineTreeRow,
  projected: ReadonlyMap<string, MachineTreeVisibleRow>,
): boolean {
  return row.childIds.some((id) => {
    const child = projected.get(id);
    return child && (child.kind === "node" || row.kind === "machine");
  });
}

/** What a folded container hides, counted in states (regions named separately): "2 regions · 4 states". */
export function hiddenCount(
  row: MachineTreeRow,
  rows: ReadonlyMap<string, MachineTreeRow>,
): string {
  let states = 0;
  let regions = 0;
  const walk = (id: string, parallelParent: boolean) => {
    const child = rows.get(id);
    if (child?.kind !== "node" || child.node?.kind === "note") return;
    if (parallelParent && child.node?.kind === "compound") regions++;
    else states++;
    for (const grandchild of child.childIds) walk(grandchild, child.node?.kind === "parallel");
  };
  for (const id of row.childIds) walk(id, row.node?.kind === "parallel");
  return [regions ? plural(regions, "region") : "", plural(states, "state")]
    .filter(Boolean)
    .join(" · ");
}

/** Active leaves hidden inside a folded container (model rows, so folds don't hide them). */
export function hiddenActiveLeaves(
  row: MachineTreeRow,
  rows: ReadonlyMap<string, MachineTreeRow>,
): MachineTreeRow[] {
  const out: MachineTreeRow[] = [];
  const walk = (id: string) => {
    const child = rows.get(id);
    if (!child || child.kind !== "node") return;
    if (child.active && !child.activeDescendant) out.push(child);
    child.childIds.forEach(walk);
  };
  row.childIds.forEach(walk);
  return out;
}
