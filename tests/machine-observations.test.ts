import test from "node:test";
import assert from "node:assert/strict";
import {
  applyMachineInspectionUpdate,
  appendMachineInspectionFrame,
  sameMachineInspectionSubject,
  type MachineInspectionFrame,
  type MachineInspectionSession,
} from "../src/core/machine/index.js";

const frame = (id: string, sequence = 1): MachineInspectionFrame => ({
  id,
  sequence,
  timestamp: 100,
  actorId: "order-1",
  machineId: "orders",
  activeIds: ["waiting"],
  committed: true,
});
const fresh = (): MachineInspectionSession => ({
  source: "committed",
  connection: "connected",
  frames: [],
});
test("batch observations and journal entries have separate stable identities", () => {
  const update = {
    id: "u1",
    streamId: "s",
    ordinal: 1,
    cursor: "opaque:A",
    frames: [frame("a"), frame("b")],
    records: [1, 2, 3].map((n) => ({
      id: String(n),
      actorId: "order-1",
      machineId: "orders",
      frameId: "b",
      kind: "task" as const,
      label: "Task opened",
    })),
  };
  const first = applyMachineInspectionUpdate(fresh(), update);
  assert.equal(first.frames.length, 2);
  assert.equal(first.records?.length, 3);
  assert.equal(applyMachineInspectionUpdate(first, update), first);
  const duplicate = applyMachineInspectionUpdate(first, { ...update, id: "u2", ordinal: 2 });
  assert.equal(duplicate.frames.length, 2);
  assert.equal(duplicate.frames[0], first.frames[0]);
});
test("metadata observations at an unchanged sequence are accepted without inferred continuity", () => {
  const first = applyMachineInspectionUpdate(fresh(), {
    id: "1",
    streamId: "s",
    ordinal: 1,
    sequence: 5,
    cursor: "same",
    frames: [frame("a", 5)],
  });
  const next = applyMachineInspectionUpdate(first, {
    id: "2",
    streamId: "s",
    ordinal: 2,
    sequence: 5,
    cursor: "same",
    frames: [
      {
        ...frame("b", 5),
        work: [{ id: "call", kind: "invoke", label: "Dispatch", status: "applying" }],
      },
    ],
  });
  assert.equal(next.frames.length, 2);
  assert.equal(next.frames[0]?.work, undefined);
  assert.equal(next.frames[1]?.work?.[0]?.status, "applying");
  const jump = applyMachineInspectionUpdate(next, {
    id: "3",
    streamId: "s",
    ordinal: 3,
    sequence: 20,
  });
  assert.equal(jump.continuity, "unknown");
  assert.equal(jump.connection, "connected");
});
test("independent stream ordering, explicit gaps, rejection and bounded retention", () => {
  let s = applyMachineInspectionUpdate(fresh(), {
    id: "one",
    streamId: "a",
    ordinal: 100,
    sequence: 50,
    cursor: "c",
    frames: [frame("1")],
  });
  s = applyMachineInspectionUpdate(s, {
    id: "one",
    streamId: "b",
    ordinal: 1,
    sequence: 1,
    frames: [frame("1")],
  });
  assert.equal(s.frames.length, 2);
  const late = applyMachineInspectionUpdate(s, { id: "old", streamId: "a", ordinal: 99 });
  assert.equal(late.lastUpdateRejection?.reason, "late");
  assert.equal(late.frames, s.frames);
  const speculative = applyMachineInspectionUpdate(s, {
    id: "bad",
    streamId: "a",
    committed: false,
  });
  assert.equal(speculative.lastUpdateRejection?.reason, "uncommitted");
  const gap = applyMachineInspectionUpdate(
    s,
    { id: "gap", streamId: "a", ordinal: 101, previousCursor: "different", frames: [frame("3")] },
    { maxFrames: 2 },
  );
  assert.equal(gap.connection, "gap");
  assert.equal(gap.omittedFrames, 1);
  assert.equal(gap.frames.length, 2);
  assert.equal(
    applyMachineInspectionUpdate(s, { id: "nan", streamId: "a", ordinal: NaN }).lastUpdateRejection
      ?.reason,
    "invalid-order",
  );
});
test("duplicate identities inside a batch are refused atomically and old strict append remains strict", () => {
  const s = applyMachineInspectionUpdate(fresh(), {
    id: "bad",
    streamId: "s",
    frames: [frame("same"), frame("same")],
  });
  assert.equal(s.frames.length, 0);
  assert.equal(s.lastUpdateRejection?.reason, "duplicate-identity");
  const old = appendMachineInspectionFrame(fresh(), frame("a"));
  assert.equal(appendMachineInspectionFrame(old, frame("b")).lastRejected?.reason, "late");
});
test("context subjects include run, version, actor, machine and stream", () => {
  const a = frame("a");
  assert.equal(sameMachineInspectionSubject(a, frame("b")), true);
  for (const patch of [
    { actorId: "other" },
    { machineId: "other" },
    { runId: "other" },
    { machineVersion: 2 },
    { streamId: "other" },
  ])
    assert.equal(sameMachineInspectionSubject(a, { ...a, ...patch }), false);
});

test("overlapping deliveries do not resurrect evicted observations or journal records", () => {
  const delivery = (id: string, ordinal: number, observation: string) => ({
    id,
    streamId: "s",
    ordinal,
    frames: [frame(observation)],
    records: [
      {
        id: observation,
        actorId: "a",
        machineId: "m",
        kind: "effect" as const,
        label: observation,
      },
    ],
  });
  const bounds = { maxFrames: 1, maxRecords: 1 };
  const one = applyMachineInspectionUpdate(fresh(), delivery("one", 1, "old"), bounds);
  const two = applyMachineInspectionUpdate(one, delivery("two", 2, "current"), bounds);
  const overlap = applyMachineInspectionUpdate(two, delivery("overlap", 3, "old"), bounds);
  assert.deepEqual(
    overlap.frames.map((f) => f.id),
    ["current"],
  );
  assert.deepEqual(
    overlap.records?.map((r) => r.id),
    ["current"],
  );
  assert.equal(overlap.omittedFrames, 1);
  assert.equal(overlap.omittedRecords, 1);
  assert.equal(two.frames.at(-1)?.id, "current");
});
