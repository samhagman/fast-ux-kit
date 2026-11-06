import type {
  MachineInspectionFrame,
  MachineInspectionSession,
  MachineInspectionUpdate,
} from "./types.js";

const limit = (n: number | undefined, fallback: number) =>
  Number.isFinite(n) ? Math.max(1, Math.min(10000, Math.floor(n!))) : fallback;
const validOrder = (n: number | undefined) =>
  n === undefined || (Number.isSafeInteger(n) && n >= 0);
/** Batch ingestion for cursor feeds. Sequence jumps alone do not establish a gap. */
export function applyMachineInspectionUpdate(
  session: MachineInspectionSession,
  update: MachineInspectionUpdate,
  options: { readonly maxFrames?: number; readonly maxRecords?: number } = {},
): MachineInspectionSession {
  const key = JSON.stringify([update.streamId, update.id]);
  if (session.acceptedUpdateIds?.includes(key)) return session;
  const reject = (
    reason: NonNullable<MachineInspectionSession["lastUpdateRejection"]>["reason"],
  ) => ({ ...session, lastUpdateRejection: { updateId: update.id, reason } });
  if (!update.id || !update.streamId || !validOrder(update.ordinal) || !validOrder(update.sequence))
    return reject("invalid-order");
  if (
    session.source === "committed" &&
    (update.committed === false || update.frames?.some((f) => f.committed === false))
  )
    return reject("uncommitted");
  const previous = Object.hasOwn(session.streams ?? {}, update.streamId)
    ? session.streams![update.streamId]
    : undefined;
  if (
    update.ordinal !== undefined &&
    previous?.ordinal !== undefined &&
    update.ordinal <= previous.ordinal
  )
    return reject("late");
  if (
    update.sequence !== undefined &&
    previous?.sequence !== undefined &&
    update.sequence < previous.sequence
  )
    return reject("late");
  const incomingFrames = update.frames ?? [];
  const incomingRecords = update.records ?? [];
  if (
    incomingFrames.some(
      (f) =>
        !f.id ||
        !validOrder(f.sequence) ||
        (f.streamId !== undefined && f.streamId !== update.streamId),
    ) ||
    incomingRecords.some(
      (r) =>
        !r.id ||
        !validOrder(r.sequence) ||
        (r.streamId !== undefined && r.streamId !== update.streamId),
    )
  )
    return reject("invalid-order");
  // A batch's first identity wins; updating a snapshot's facts requires a new observation ID.
  if (
    new Set(incomingFrames.map((f) => f.id)).size !== incomingFrames.length ||
    new Set(incomingRecords.map((r) => r.id)).size !== incomingRecords.length
  )
    return reject("duplicate-identity");
  const frameKeys = new Set([...(session.acceptedFrameIds ?? []), ...session.frames.map(frameKey)]);
  const recordKeys = new Set([
    ...(session.acceptedRecordIds ?? []),
    ...(session.records ?? []).map((r) => JSON.stringify([r.streamId ?? "", r.id])),
  ]);
  const addedFrames = incomingFrames
    .map((f) => ({ ...f, streamId: update.streamId }))
    .filter((f) => !frameKeys.has(frameKey(f)));
  const addedRecords = incomingRecords
    .map((r) => ({ ...r, streamId: update.streamId }))
    .filter((r) => !recordKeys.has(JSON.stringify([r.streamId, r.id])));
  const allFrames = [...session.frames, ...addedFrames];
  const allRecords = [...(session.records ?? []), ...addedRecords];
  const maxFrames = limit(options.maxFrames, 500),
    maxRecords = limit(options.maxRecords, 2000);
  const cursorGap =
    update.previousCursor !== undefined &&
    previous?.cursor !== undefined &&
    update.previousCursor !== previous.cursor;
  const gap = cursorGap || update.continuity === "gap" || session.continuity === "gap";
  return {
    ...session,
    frames: allFrames.slice(-maxFrames),
    records: allRecords.slice(-maxRecords),
    omittedFrames: (session.omittedFrames ?? 0) + Math.max(0, allFrames.length - maxFrames),
    omittedRecords: (session.omittedRecords ?? 0) + Math.max(0, allRecords.length - maxRecords),
    cursor: update.cursor ?? session.cursor,
    streams: {
      ...session.streams,
      [update.streamId]: {
        ordinal: update.ordinal ?? previous?.ordinal,
        sequence: update.sequence ?? previous?.sequence,
        cursor: update.cursor ?? previous?.cursor,
      },
    },
    acceptedUpdateIds: [...(session.acceptedUpdateIds ?? []), key].slice(-10000),
    acceptedFrameIds: [...frameKeys, ...addedFrames.map(frameKey)].slice(-10000),
    acceptedRecordIds: [
      ...recordKeys,
      ...addedRecords.map((r) => JSON.stringify([r.streamId, r.id])),
    ].slice(-10000),
    continuity: gap ? "gap" : (update.continuity ?? "unknown"),
    connection: gap ? "gap" : (update.connection ?? session.connection),
    lastUpdateRejection: undefined,
  };
}
function frameKey(frame: MachineInspectionFrame) {
  return JSON.stringify([frame.streamId ?? "", frame.id]);
}

/** Scope context comparisons to a single actor, run, version and graph. */
export function sameMachineInspectionSubject(
  a: MachineInspectionFrame,
  b: MachineInspectionFrame,
): boolean {
  return (
    a.actorId === b.actorId &&
    a.machineId === b.machineId &&
    a.runId === b.runId &&
    a.machineVersion === b.machineVersion &&
    a.streamId === b.streamId
  );
}
