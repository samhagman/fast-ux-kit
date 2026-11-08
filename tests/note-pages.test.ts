import assert from "node:assert/strict";
import test from "node:test";
import {
  createNotePageRegistry,
  isNotePageData,
  parseNotePage,
  serializeNotePage,
  type NotePageType,
} from "../src/core/note-pages.js";
const text: NotePageType<{ text: string }> = {
  type: "test.text",
  label: "Text",
  version: 1,
  create: () => ({ text: "" }),
  validate: (value): value is { text: string } =>
    !!value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string",
};

test("typed factories, lookup and a lossless JSON envelope round trip", () => {
  const registry = createNotePageRegistry([text]);
  const page = registry.create(text.type, "one");
  assert.deepEqual(page, { id: "one", type: "test.text", version: 1, data: { text: "" } });
  assert.deepEqual(parseNotePage(serializeNotePage(page)), page);
  assert.equal(registry.resolve(page).status, "ready");
  assert.equal(registry.list()[0]?.label, "Text");
  assert.equal(registry.get(text.type)?.version, 1);
  assert.throws(() => registry.create("missing", "id"));
  assert.throws(() => registry.create(text.type, ""));
});
test("registry rejects duplicate ids and invalid schema declarations", () => {
  assert.throws(() => createNotePageRegistry([text, { ...text, label: "Duplicate" }]));
  for (const version of [0, -1, 1.1, NaN, Infinity])
    assert.throws(() => createNotePageRegistry([{ ...text, version }]));
});
test("unknown and future types remain intact and serializable, never overwritten", () => {
  const registry = createNotePageRegistry([text]);
  for (const [type, version, status] of [
    ["other.drawing", 1, "unknown-type"],
    [text.type, 2, "future-version"],
  ] as const) {
    const page = { id: "one", type, version, data: { nested: ["hello", { unsupported: true }] } };
    const result = registry.resolve(page);
    assert.equal(result.status, status);
    assert.equal(result.original, page);
    assert.deepEqual(parseNotePage(serializeNotePage(page)), page);
    assert.throws(() => registry.migrate(page));
  }
});
test("migrations are explicit, detached from the original and validated", () => {
  let calls = 0;
  const old = { id: "one", type: text.type, version: 1, data: { old: "Hello" } };
  const type = {
    ...text,
    version: 2,
    migrate(data: unknown) {
      calls++;
      const source = data as { old: string };
      const text = source.old;
      source.old = "modified";
      return { text };
    },
  };
  const registry = createNotePageRegistry([type]);
  assert.equal(registry.resolve(old).status, "migration-required");
  assert.equal(calls, 0);
  assert.deepEqual(registry.migrate(old), { ...old, version: 2, data: { text: "Hello" } });
  assert.equal(old.data.old, "Hello");
  assert.equal(calls, 1);
  assert.throws(() =>
    createNotePageRegistry([{ ...type, migrate: () => ({ text: 1 }) as never }]).migrate(old),
  );
  assert.throws(() => createNotePageRegistry([{ ...text, version: 2 }]).migrate(old));
});
test("invalid factories, validators and non-JSON values fail safely", () => {
  assert.throws(() =>
    createNotePageRegistry([{ ...text, create: () => ({ text: undefined }) as never }]).create(
      text.type,
      "x",
    ),
  );
  const badValidator = createNotePageRegistry([
    {
      ...text,
      validate(): never {
        throw Error("oops");
      },
    },
  ]);
  assert.equal(
    badValidator.resolve({ id: "x", type: text.type, version: 1, data: {} }).status,
    "invalid",
  );
  let getterCalls = 0;
  const accessor = {
    get text() {
      getterCalls++;
      return "x";
    },
  };
  const cycle: { self?: unknown } = {};
  cycle.self = cycle;
  for (const value of [
    undefined,
    NaN,
    Infinity,
    () => 1,
    new Date(),
    BigInt(1),
    new Map(),
    accessor,
    cycle,
    [1, , 3],
    { a: undefined },
  ])
    assert.equal(isNotePageData(value), false);
  assert.equal(getterCalls, 0);
  const shared = { x: 1 };
  assert.equal(isNotePageData({ a: shared, b: shared }), true);
  assert.throws(() => parseNotePage('{"id":"x","type":"test.text","version":0,"data":{}}'));
});
