import type {
  MachineDocument,
  MachineEvent,
  MachineGraph,
  MachineNode,
  MachineRuntimeOptions,
  MachineSnapshot,
  MachineTransition,
} from "./types.js";
import { machineAncestors, machineDescendants, validateMachineDocument } from "./model.js";
const executable = (node: MachineNode) => node.kind !== "note";
const bounded = (n: number | undefined, fallback: number, max: number) =>
  Number.isFinite(n) ? Math.max(1, Math.min(max, Math.floor(n!))) : fallback;
function childInitial(graph: MachineGraph, parent?: MachineNode): MachineNode | undefined {
  const children = graph.nodes.filter((n) => n.parentId === parent?.id && executable(n));
  const id = parent?.initialId ?? (!parent ? graph.initialId : undefined);
  return (
    children.find((n) => n.id === id) ?? children.find((n) => n.kind === "initial") ?? children[0]
  );
}
function enter(
  graph: MachineGraph,
  id: string,
  active: Set<string>,
  entered: string[],
  seen = new Set<string>(),
) {
  if (seen.has(id)) return;
  seen.add(id);
  const node = graph.nodes.find((n) => n.id === id);
  if (!node || !executable(node)) return;
  if (!active.has(id)) {
    active.add(id);
    entered.push(id);
  }
  if (node.kind === "parallel")
    for (const child of graph.nodes.filter((n) => n.parentId === id && executable(n)))
      enter(graph, child.id, active, entered, seen);
  else if (node.kind === "compound") {
    const initial = childInitial(graph, node);
    if (initial) enter(graph, initial.id, active, entered, seen);
  }
}
function enterTarget(graph: MachineGraph, id: string, active: Set<string>, entered: string[]) {
  const chain = machineAncestors(graph, id).reverse();
  for (let i = 0; i < chain.length - 1; i++) {
    const n = chain[i]!;
    if (!active.has(n.id)) {
      active.add(n.id);
      entered.push(n.id);
    }
    if (n.kind === "parallel")
      for (const child of graph.nodes.filter(
        (c) => c.parentId === n.id && executable(c) && c.id !== chain[i + 1]?.id,
      ))
        if (!active.has(child.id)) enter(graph, child.id, active, entered);
  }
  enter(graph, id, active, entered);
}
function isDone(graph: MachineGraph, active: ReadonlySet<string>): boolean {
  // The graph itself completes only at a top-level final. Final descendants complete
  // their region, not the enclosing machine: parent transitions remain available.
  return graph.nodes.some((node) => !node.parentId && node.kind === "final" && active.has(node.id));
}

/** Reject accidental async callbacks while observing their rejection to avoid a global leak. */
function isAsyncResult(value: unknown): boolean {
  if (
    value &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  ) {
    void Promise.resolve(value).catch(() => undefined);
    return true;
  }
  return false;
}
function passes(
  transition: MachineTransition,
  snapshot: MachineSnapshot,
  event: MachineEvent,
  options: MachineRuntimeOptions,
): boolean {
  if (!transition.guard) return true;
  const guard =
    options.guards && Object.hasOwn(options.guards, transition.guard)
      ? options.guards[transition.guard]
      : undefined;
  if (!guard) return false;
  try {
    const result: unknown = guard(snapshot.context, event);
    if (isAsyncResult(result)) return false;
    return result === true;
  } catch {
    return false;
  }
}
/** Ordered deepest-first enabled candidates, not a preselected transition set.
 * A single event may shadow ancestor or later candidates; sendMachineEvent resolves
 * conflicts before taking transitions. Unknown or throwing guards are disabled. */
export function getEnabledMachineTransitions(
  document: MachineDocument,
  snapshot: MachineSnapshot,
  event?: MachineEvent,
  options: MachineRuntimeOptions = {},
): MachineTransition[] {
  const graph = document.machines.find((m) => m.id === snapshot.machineId);
  if (!graph || snapshot.status !== "running") return [];
  return graph.transitions
    .filter(
      (t) =>
        snapshot.activeIds.includes(t.sourceId) &&
        (event ? (t.event ?? "") === event.type : true) &&
        passes(t, snapshot, event ?? { type: t.event ?? "" }, options),
    )
    .sort(
      (a, b) =>
        machineAncestors(graph, b.sourceId).length - machineAncestors(graph, a.sourceId).length,
    );
}
function runActions(
  context: Readonly<Record<string, unknown>>,
  names: readonly string[],
  event: MachineEvent,
  options: MachineRuntimeOptions,
) {
  let next = context;
  for (const name of names) {
    const action =
      options.actions && Object.hasOwn(options.actions, name) ? options.actions[name] : undefined;
    if (action) {
      const result = action(next, event);
      if (!result || typeof result !== "object" || Array.isArray(result) || isAsyncResult(result))
        throw new Error(`Action ${name} must return a context object.`);
      next = result;
    }
  }
  return next;
}
function transitionStep(
  document: MachineDocument,
  snapshot: MachineSnapshot,
  event: MachineEvent,
  options: MachineRuntimeOptions,
): MachineSnapshot {
  const graph = document.machines.find((m) => m.id === snapshot.machineId);
  if (!graph)
    return { ...snapshot, status: "error", error: "The active machine no longer exists." };
  const candidates = getEnabledMachineTransitions(document, snapshot, event, options);
  const selected: MachineTransition[] = [];
  const claimed = new Set<string>();

  for (const t of candidates) {
    const sourceAncestors = machineAncestors(graph, t.sourceId);
    const targetAncestors = machineAncestors(graph, t.targetId);
    const common = sourceAncestors.find((n) => targetAncestors.some((p) => p.id === n.id));
    const source = sourceAncestors[0]!;
    let domain: string | undefined;
    if (common?.id === source.id) domain = t.internal ? undefined : source.id;
    else if (common?.id === t.targetId) domain = t.targetId;
    else domain = common?.id;
    const exiting = new Set<string>();
    if (t.internal && common?.id === source.id) {
      for (const id of machineDescendants(graph, source.id))
        if (id !== source.id && snapshot.activeIds.includes(id)) exiting.add(id);
    } else if (domain && (domain === source.id || domain === t.targetId)) {
      for (const id of machineDescendants(graph, domain))
        if (snapshot.activeIds.includes(id)) exiting.add(id);
    } else if (domain) {
      for (const id of snapshot.activeIds)
        if (id !== domain && machineAncestors(graph, id).some((n) => n.id === domain))
          exiting.add(id);
    } else {
      for (const id of snapshot.activeIds) exiting.add(id);
    }
    // Transitions confined to one parallel region do not claim its siblings.
    if (
      [...exiting].some((id) => claimed.has(id)) ||
      selected.some(
        (s) =>
          machineAncestors(graph, s.sourceId).some((n) => n.id === t.sourceId) ||
          machineAncestors(graph, t.sourceId).some((n) => n.id === s.sourceId),
      )
    )
      continue;
    selected.push(t);
    for (const id of exiting) claimed.add(id);
  }
  if (!selected.length) return snapshot;
  const active = new Set(snapshot.activeIds);
  const exited = [...claimed].sort(
    (a, b) => machineAncestors(graph, b).length - machineAncestors(graph, a).length,
  );
  const entered: string[] = [];
  const actions: string[] = [];
  for (const id of exited) {
    active.delete(id);
    actions.push(...(graph.nodes.find((n) => n.id === id)?.exit ?? []));
  }
  for (const t of selected) {
    actions.push(...(t.actions ?? []));
    enterTarget(graph, t.targetId, active, entered);
  }
  for (const id of entered) actions.push(...(graph.nodes.find((n) => n.id === id)?.entry ?? []));
  try {
    const context = runActions(snapshot.context, actions, event, options);
    const activeIds = graph.nodes.filter((n) => active.has(n.id)).map((n) => n.id);
    const sequence = snapshot.sequence + 1;
    return {
      ...snapshot,
      context,
      activeIds,
      sequence,
      status: isDone(graph, active) ? "done" : "running",
      trace: [
        ...snapshot.trace,
        {
          sequence,
          event: event.type,
          transitionIds: selected.map((t) => t.id),
          entered,
          exited,
          actions,
          activeIds,
        },
      ].slice(-bounded(options.traceLimit, 200, 10000)),
    };
  } catch (error) {
    return {
      ...snapshot,
      status: "error",
      error: error instanceof Error ? error.message : "An action callback failed.",
    };
  }
}
function settle(
  document: MachineDocument,
  snapshot: MachineSnapshot,
  options: MachineRuntimeOptions,
): MachineSnapshot {
  let current = snapshot;
  const max = bounded(options.maxMicrosteps, 100, 1000);
  for (let i = 0; i < max; i++) {
    if (current.status !== "running") return current;
    const next = transitionStep(document, current, { type: "" }, options);
    if (next === current) return current;
    current = next;
  }
  if (getEnabledMachineTransitions(document, current, { type: "" }, options).length)
    return {
      ...current,
      status: "error",
      error: `Automatic transitions exceeded the ${max}-step safety limit.`,
    };
  return current;
}
export function createMachineSnapshot(
  document: MachineDocument,
  machineId = document.rootId,
  context: Readonly<Record<string, unknown>> = {},
  options: MachineRuntimeOptions = {},
): MachineSnapshot {
  const initial: MachineSnapshot = {
    machineId,
    activeIds: [],
    context,
    status: "running",
    trace: [],
    sequence: 0,
  };
  const errors = validateMachineDocument(document).filter((i) => i.severity === "error");
  if (errors.length) return { ...initial, status: "error", error: errors[0]!.message };
  const graph = document.machines.find((m) => m.id === machineId);
  if (!graph) return { ...initial, status: "error", error: "The machine does not exist." };
  const start = childInitial(graph);
  if (!start)
    return { ...initial, status: "error", error: "The machine has no executable starting state." };
  const active = new Set<string>();
  const entered: string[] = [];
  enter(graph, start.id, active, entered);
  const actions = entered.flatMap((id) => graph.nodes.find((n) => n.id === id)?.entry ?? []);
  try {
    const nextContext = runActions(context, actions, { type: "@start" }, options);
    const activeIds = graph.nodes.filter((n) => active.has(n.id)).map((n) => n.id);
    return settle(
      document,
      {
        ...initial,
        context: nextContext,
        activeIds,
        status: isDone(graph, active) ? "done" : "running",
        trace: [
          {
            sequence: 0,
            event: "@start",
            transitionIds: [],
            entered,
            exited: [],
            actions,
            activeIds,
          },
        ],
      },
      options,
    );
  } catch (error) {
    return {
      ...initial,
      status: "error",
      error: error instanceof Error ? error.message : "An entry callback failed.",
    };
  }
}
export function sendMachineEvent(
  document: MachineDocument,
  snapshot: MachineSnapshot,
  event: MachineEvent,
  options: MachineRuntimeOptions = {},
): MachineSnapshot {
  if (snapshot.status !== "running") return snapshot;
  const next = transitionStep(document, snapshot, event, options);
  return settle(document, next, options);
}
/** Replay is a pure simulation. Host callbacks must be pure; no live dispatch occurs here. */
export function replayMachineEvents(
  document: MachineDocument,
  events: readonly MachineEvent[],
  options: MachineRuntimeOptions = {},
  machineId = document.rootId,
  context: Readonly<Record<string, unknown>> = {},
): MachineSnapshot {
  return events.reduce(
    (snapshot, event) => sendMachineEvent(document, snapshot, event, options),
    createMachineSnapshot(document, machineId, context, options),
  );
}
