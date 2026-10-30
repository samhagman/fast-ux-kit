import type {
  MachineInspectionFrame,
  MachineInspectionSession,
  MachineScenario,
  MachineDocument,
  MachineRuntimeOptions,
  MachineSnapshot,
} from "./types.js";
import { replayMachineEvents } from "./runtime.js";
/** Bounded immutable inspection buffer. Reading a historical frame never dispatches work. */
export function appendMachineInspectionFrame(
  session: MachineInspectionSession,
  frame: MachineInspectionFrame,
  limit = 500,
): MachineInspectionSession {
  const size = Number.isFinite(limit) ? Math.max(1, Math.min(10000, Math.floor(limit))) : 500;
  const previous = session.frames.find((f) => f.id === frame.id);
  if (previous) return session; // Stable identity: first accepted frame wins.
  const reject = (
    reason: "uncommitted" | "late" | "invalid-sequence",
  ): MachineInspectionSession => ({ ...session, lastRejected: { frameId: frame.id, reason } });
  if (session.source === "committed" && frame.committed === false) return reject("uncommitted");
  if (frame.sequence !== undefined && (!Number.isSafeInteger(frame.sequence) || frame.sequence < 0))
    return reject("invalid-sequence");
  if (
    frame.sequence !== undefined &&
    session.sequence !== undefined &&
    frame.sequence <= session.sequence
  )
    return reject("late");
  const gap =
    frame.sequence !== undefined &&
    session.sequence !== undefined &&
    frame.sequence > session.sequence + 1;
  const hasUnsequencedFrames =
    session.hasUnsequencedFrames ||
    frame.sequence === undefined ||
    session.frames.some((item) => item.sequence === undefined);
  const continuity =
    gap || session.continuity === "gap"
      ? "gap"
      : hasUnsequencedFrames
        ? "unknown"
        : session.sequence !== undefined && session.frames.at(-1)?.sequence !== undefined
          ? "contiguous"
          : "unknown";
  return {
    ...session,
    frames: [...session.frames, frame].slice(-size),
    sequence: frame.sequence ?? session.sequence,
    continuity,
    hasUnsequencedFrames,
    connection: gap ? "gap" : session.connection,
    lastRejected: undefined,
  };
}
export function selectMachineInspectionFrame(
  session: MachineInspectionSession,
  id?: string,
): MachineInspectionFrame | undefined {
  return id ? session.frames.find((frame) => frame.id === id) : session.frames.at(-1);
}
export function machineTransitionCoverage(
  frames: readonly Pick<MachineInspectionFrame, "transitionIds">[],
  transitionIds: readonly string[],
): {
  readonly visited: readonly string[];
  readonly unvisited: readonly string[];
  readonly ratio: number;
} {
  const unique = [...new Set(transitionIds)];
  const seen = new Set(frames.flatMap((frame) => frame.transitionIds ?? []));
  const visited = unique.filter((id) => seen.has(id));
  return {
    visited,
    unvisited: unique.filter((id) => !seen.has(id)),
    ratio: unique.length ? visited.length / unique.length : 1,
  };
}
export function runMachineScenario(
  document: MachineDocument,
  scenario: MachineScenario,
  options: MachineRuntimeOptions = {},
): { readonly snapshot: MachineSnapshot; readonly passed: boolean | undefined } {
  const snapshot = replayMachineEvents(document, scenario.events, options);
  const expected = scenario.expectedActiveIds;
  return {
    snapshot,
    passed: expected
      ? snapshot.status !== "error" &&
        new Set(expected).size === expected.length &&
        expected.length === snapshot.activeIds.length &&
        expected.every((id) => snapshot.activeIds.includes(id))
      : undefined,
  };
}
