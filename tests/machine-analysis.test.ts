import assert from "node:assert/strict";
import test from "node:test";
import {
  searchMachineDocument,
  compareMachineInspectionContexts,
  type MachineDocument,
  type MachineInspectionFrame,
} from "../src/core/machine/index.js";

function frame(
  context?: unknown,
  overrides: Partial<MachineInspectionFrame> = {},
): MachineInspectionFrame {
  return {
    id: "f",
    timestamp: 0,
    actorId: "actor",
    machineId: "main",
    activeIds: [],
    ...(context === undefined ? {} : { context: context as Record<string, unknown> }),
    ...overrides,
  };
}

test("search returns stable original identities across nested references without mutation", () => {
  const document: MachineDocument = {
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Main",
        nodes: [
          {
            id: "open",
            label: "Open",
            kind: "submachine",
            machineId: "nested",
            description: "MATCH description",
          },
          { id: "entry", label: "Entry", kind: "atomic", entry: ["match entry"] },
          { id: "exit", label: "Exit", kind: "atomic", exit: ["match exit"] },
        ],
        transitions: [{ id: "edge", sourceId: "open", targetId: "entry", event: "MATCH" }],
      },
      {
        id: "nested",
        label: "Nested",
        nodes: [{ id: "match-id", label: "Child", kind: "atomic" }],
        transitions: [
          { id: "guard", sourceId: "match-id", targetId: "match-id", guard: "match guard" },
          { id: "action", sourceId: "match-id", targetId: "match-id", actions: ["match action"] },
        ],
      },
    ],
  };
  const saved = JSON.stringify(document);
  const found = searchMachineDocument(document, "  MaTcH ");
  assert.deepEqual(
    found.map((value) => value.elementId),
    ["open", "entry", "exit", "edge", "match-id", "guard", "action"],
  );
  assert.equal(found[4]?.machineId, "nested");
  assert.equal(found[3]?.kind, "transition");
  assert.equal(found[5]?.label, "guard");
  assert.deepEqual(searchMachineDocument(document, "match", { maxResults: 2 }), found.slice(0, 2));
  assert.deepEqual(searchMachineDocument(document, " "), []);
  assert.deepEqual(searchMachineDocument(document, "match", { maxResults: 0 }), []);
  assert.equal(JSON.stringify(document), saved);
});

test("context diff distinguishes absent, null and empty; safely escapes pointer keys", () => {
  const before = JSON.parse('{"null":null,"gone":1,"a/b":{"~key":1},"__proto__":1}');
  const after = JSON.parse('{"null":{},"new":null,"a/b":{"~key":2},"__proto__":2}');
  const result = compareMachineInspectionContexts(frame(before), frame(after));
  assert.equal(result.status, "available");
  assert.deepEqual(
    result.entries.map((entry) => [entry.path, entry.kind]),
    [
      ["/null", "changed"],
      ["/gone", "removed"],
      ["/a~1b/~0key", "changed"],
      ["/__proto__", "changed"],
      ["/new", "added"],
    ],
  );
  assert.equal(result.entries.at(-1)?.before, "[absent]");
  assert.equal(result.entries.at(-1)?.after, "null");
  assert.equal(compareMachineInspectionContexts(frame(), frame({})).status, "unavailable");
  assert.equal(compareMachineInspectionContexts(undefined, frame({})).status, "unavailable");
  assert.equal(compareMachineInspectionContexts(frame(null), frame({})).entries[0]?.path, "");
});

test("context comparisons reject mixed actors and machines", () => {
  for (const overrides of [{ actorId: "other" }, { machineId: "other" }]) {
    const result = compareMachineInspectionContexts(frame({ a: 1 }), frame({ a: 2 }, overrides));
    assert.equal(result.status, "unavailable");
    assert.deepEqual(result.entries, []);
  }
});

test("continuity needs source evidence and never follows timestamps or arrival", () => {
  const a = frame({}, { sequence: 1 });
  const b = frame({}, { sequence: 2 });
  assert.equal(compareMachineInspectionContexts(a, b).continuity, "unknown");
  assert.equal(
    compareMachineInspectionContexts(a, b, { continuity: "contiguous" }).continuity,
    "contiguous",
  );
  assert.equal(compareMachineInspectionContexts(a, b, { continuity: "gap" }).continuity, "gap");
  assert.equal(
    compareMachineInspectionContexts(a, frame({}, { sequence: 4 }), { continuity: "contiguous" })
      .continuity,
    "gap",
  );
  assert.equal(
    compareMachineInspectionContexts(a, frame({}), { continuity: "contiguous" }).continuity,
    "unknown",
  );
  assert.equal(compareMachineInspectionContexts(b, a).continuity, "gap");
});

test("accessors, functions, cycles and non-JSON values are explicit without execution", () => {
  let called = 0;
  const bad: Record<string, unknown> = {
    fn: () => {
      called++;
    },
    nan: NaN,
    big: 1n,
    date: new Date(0),
  };
  Object.defineProperty(bad, "getter", {
    enumerable: true,
    get() {
      called++;
      throw new Error("must not run");
    },
  });
  bad.cycle = bad;
  const result = compareMachineInspectionContexts(frame(bad), frame(bad));
  assert.equal(called, 0);
  assert.equal(result.truncated, false);
  assert.equal(result.entries.length, 6);
  assert.ok(result.entries.every((entry) => entry.kind === "unsupported"));
  assert.ok(result.warnings.some((value) => value.includes("Unsupported")));
  const maliciousFrame = frame({});
  Object.defineProperty(maliciousFrame, "context", {
    get() {
      called++;
      return {};
    },
  });
  assert.equal(compareMachineInspectionContexts(maliciousFrame, frame({})).status, "unavailable");
  assert.equal(called, 0);
});

test("large inputs and depth, entries, previews and key output remain bounded", () => {
  const many = Object.fromEntries(Array.from({ length: 500 }, (_, i) => [`key${i}`, i]));
  assert.equal(
    compareMachineInspectionContexts(frame(many), frame({}), { maxItems: 10 }).truncated,
    true,
  );
  const entryLimited = compareMachineInspectionContexts(frame({}), frame(many), { maxEntries: 3 });
  assert.equal(entryLimited.entries.length, 3);
  assert.equal(entryLimited.truncated, true);
  assert.equal(
    compareMachineInspectionContexts(frame({ a: { b: 1 } }), frame({ a: { b: 2 } }), {
      maxDepth: 1,
    }).truncated,
    true,
  );
  const huge = "x".repeat(100000);
  const outputLimited = compareMachineInspectionContexts(frame({}), frame({ [huge]: huge }), {
    maxOutputLength: 30,
  });
  assert.equal(outputLimited.truncated, true);
  assert.ok(
    outputLimited.entries.reduce(
      (n, entry) => n + entry.path.length + entry.before.length + entry.after.length,
      0,
    ) <= 30,
  );
  const getters = {};
  for (let i = 0; i < 500; i++)
    Object.defineProperty(getters, `key${i}`, {
      get() {
        throw new Error("not invoked");
      },
    });
  assert.equal(
    compareMachineInspectionContexts(frame(getters), frame(getters), { maxItems: 10 }).truncated,
    true,
  );
});

test("arrays preserve index differences and unsupported sparse/non-enumerable data is not equal", () => {
  assert.deepEqual(
    compareMachineInspectionContexts(frame({ a: [1, 2] }), frame({ a: [1, 3, 4] })).entries.map(
      (entry) => [entry.path, entry.kind],
    ),
    [
      ["/a/1", "changed"],
      ["/a/2", "added"],
    ],
  );
  const sparse = new Array(3);
  assert.equal(
    compareMachineInspectionContexts(frame({ sparse }), frame({ sparse })).entries[0]?.kind,
    "unsupported",
  );
  const hidden = Object.defineProperty({}, "hidden", { value: 1 });
  assert.equal(
    compareMachineInspectionContexts(frame(hidden), frame(hidden)).entries[0]?.kind,
    "unsupported",
  );
});
