import type {
  MachineDocument,
  MachineEvent,
  MachineGraph,
  MachineRuntimeOptions,
  MachineSnapshot,
  MachineTransition,
} from "./types.js";
import { sendMachineEvent } from "./runtime.js";

/** Explain an opaque synchronous guard without guessing which payload fields it reads. */
export function explainMachineTransition(
  transition: MachineTransition,
  context: Readonly<Record<string, unknown>>,
  event: MachineEvent,
  runtime: MachineRuntimeOptions = {},
): string {
  const name = transition.guard;
  if (!name) return "another transition takes priority";
  const guard =
    runtime.guards && Object.hasOwn(runtime.guards, name) ? runtime.guards[name] : undefined;
  if (!guard) return `guard ${name} isn’t provided by the host`;
  try {
    const result: unknown = guard(context, event);
    if (result && typeof (result as { then?: unknown }).then === "function") {
      void Promise.resolve(result).catch(() => undefined);
      return `guard ${name} returned a promise; guards must be synchronous`;
    }
    if (result === true) return "another transition takes priority";
  } catch {
    return `guard ${name} threw`;
  }
  const describe =
    runtime.guardDescriptions && Object.hasOwn(runtime.guardDescriptions, name)
      ? runtime.guardDescriptions[name]
      : undefined;
  if (describe) {
    try {
      const text: unknown = describe(context, event);
      if (text && typeof (text as { then?: unknown }).then === "function")
        void Promise.resolve(text).catch(() => undefined);
      if (typeof text === "string" && text.trim()) return text.slice(0, 1000);
    } catch {
      /* Explanation failure cannot change execution. */
    }
  }
  return `guard ${name} is false`;
}
export function explainMachineEvent(
  graph: MachineGraph,
  snapshot: MachineSnapshot | null,
  event: MachineEvent,
  runtime?: MachineRuntimeOptions,
): string {
  if (!snapshot) return "the simulation is not running";
  if (snapshot.status !== "running")
    return snapshot.status === "error"
      ? "the simulation has an error"
      : "the machine has already finished";
  const handlers = graph.transitions.filter(
    (t) => t.event === event.type && snapshot.activeIds.includes(t.sourceId),
  );
  if (!handlers.length) return `no transition handles ${event.type} here`;
  return [
    ...new Set(handlers.map((t) => explainMachineTransition(t, snapshot.context, event, runtime))),
  ].join("; ");
}
export interface MachineEventPreview {
  readonly activeIds: readonly string[];
  readonly entered: readonly string[];
  readonly exited: readonly string[];
  readonly transitionIds: readonly string[];
}
/** Computes a local pure-runtime preview. Never use this to predict a real host run. */
export function previewMachineEvent(
  document: MachineDocument,
  snapshot: MachineSnapshot,
  event: MachineEvent,
  runtime?: MachineRuntimeOptions,
): MachineEventPreview | undefined {
  const next = sendMachineEvent(document, snapshot, event, runtime);
  if (next.status === "error" || next.sequence === snapshot.sequence) return undefined;
  const entries = next.trace.filter((e) => e.sequence > snapshot.sequence);
  return {
    activeIds: next.activeIds,
    entered: [...new Set(entries.flatMap((e) => e.entered))],
    exited: [...new Set(entries.flatMap((e) => e.exited))],
    transitionIds: [...new Set(entries.flatMap((e) => e.transitionIds))],
  };
}
