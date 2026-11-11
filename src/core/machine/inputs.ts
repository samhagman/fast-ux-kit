import {
  explainMachineEvent,
  previewMachineEvent,
  type MachineEventPreview,
} from "./diagnostics.js";
import type {
  MachineDocument,
  MachineGraph,
  MachineRuntimeOptions,
  MachineScenario,
  MachineSnapshot,
} from "./types.js";

/**
 * Known inputs: the answer to "what do I send to make this event do something?"
 *
 * A guard is an opaque host function, so a simulator cannot read which payload it wants. But the
 * specification usually already says: the host can declare an event's inputs next to the guards
 * that read them (`runtime.eventInputs`), and every scenario is a worked example of real events.
 * This module collects those into choices and tries each one against the current snapshot, so a
 * person picks "approved: true → Publishing" instead of guessing JSON.
 *
 *   runtime.eventInputs ─┐
 *                        ├─▶ machineEventInputs(type) ─▶ machineEventOptions(snapshot) ─▶ choices
 *   scenarios ───────────┘        (what can be sent)        (where each one leads, or why not)
 */
export interface MachineEventInput {
  /** A short name for the choice: "approved: true", "no payload". */
  readonly label: string;
  readonly payload?: unknown;
  /** Where the input is known from. "empty" is the bare event, offered when nothing else is known. */
  readonly source: "declared" | "scenario" | "empty";
}

/** A known input tried against one snapshot: the move it would make, or the reason it would not. */
export interface MachineEventOption extends MachineEventInput {
  /** Present when sending this input now would change the configuration. */
  readonly preview?: MachineEventPreview;
  /** Present when it would not: the same sentence a refused send reports. */
  readonly reason?: string;
}

const LABEL_LIMIT = 48;
const isPrimitive = (value: unknown) =>
  value === null || ["string", "number", "boolean"].includes(typeof value);

/** A payload as a person would say it: `approved: true`, not `{"approved":true}`. */
export function describeMachinePayload(payload: unknown): string {
  if (payload === undefined) return "no payload";
  let text: string;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const entries = Object.entries(payload);
    text = !entries.length
      ? "empty payload"
      : entries.every(([, value]) => isPrimitive(value))
        ? entries
            .map(([key, value]) => `${key}: ${typeof value === "string" ? `"${value}"` : value}`)
            .join(", ")
        : (JSON.stringify(payload) ?? "payload");
  } else text = JSON.stringify(payload) ?? String(payload);
  return text.length > LABEL_LIMIT ? `${text.slice(0, LABEL_LIMIT - 1)}…` : text;
}

/** Stable identity for de-duplication. A payload that cannot be serialized is always its own input. */
function payloadKey(payload: unknown): string | undefined {
  if (payload === undefined) return "undefined";
  try {
    return JSON.stringify(payload);
  } catch {
    return undefined;
  }
}

/**
 * Every known way to send `type`, most authoritative first: the host's declared inputs, then each
 * distinct payload a scenario sends with it. The bare event is offered only when a scenario sends
 * it bare or nothing else is known, so the list never pads itself with a choice nobody specified.
 */
export function machineEventInputs(
  type: string,
  sources: {
    readonly runtime?: MachineRuntimeOptions;
    readonly scenarios?: readonly MachineScenario[];
  } = {},
): MachineEventInput[] {
  const inputs: MachineEventInput[] = [];
  const seen = new Set<string>();
  const add = (payload: unknown, source: MachineEventInput["source"], label?: string) => {
    const key = payloadKey(payload);
    if (key !== undefined) {
      if (seen.has(key)) return;
      seen.add(key);
    }
    inputs.push({
      label: label?.trim() || describeMachinePayload(payload),
      source,
      ...(payload !== undefined ? { payload } : {}),
    });
  };
  const declared = sources.runtime?.eventInputs;
  const list = declared && Object.hasOwn(declared, type) ? declared[type] : undefined;
  if (Array.isArray(list))
    for (const item of list)
      if (item && typeof item === "object") add(item.payload, "declared", item.label);
  for (const scenario of sources.scenarios ?? [])
    for (const event of scenario.events)
      if (event.type === type)
        add(event.payload, event.payload === undefined ? "empty" : "scenario");
  if (!inputs.length) add(undefined, "empty");
  return inputs;
}

/** Tries each input against `snapshot` with the pure runtime. Nothing is sent. */
export function machineEventOptions(
  document: MachineDocument,
  graph: MachineGraph,
  snapshot: MachineSnapshot,
  type: string,
  inputs: readonly MachineEventInput[],
  runtime?: MachineRuntimeOptions,
): MachineEventOption[] {
  return inputs.map((input) => {
    const event = input.payload !== undefined ? { type, payload: input.payload } : { type };
    const preview = previewMachineEvent(document, snapshot, event, runtime);
    return preview
      ? { ...input, preview }
      : { ...input, reason: explainMachineEvent(graph, snapshot, event, runtime) };
  });
}
