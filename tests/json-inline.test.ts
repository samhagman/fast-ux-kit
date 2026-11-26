import assert from "node:assert/strict";
import test from "node:test";
import {
  inlineJson,
  jsonLeaf,
  JSON_INLINE_MAX_DEPTH,
  JSON_INLINE_MAX_LENGTH,
} from "../src/core/index.js";

test("json leaves read as their literal text with a kind", () => {
  assert.deepEqual(jsonLeaf("review"), { kind: "string", text: '"review"' });
  assert.deepEqual(jsonLeaf(2.5), { kind: "number", text: "2.5" });
  assert.deepEqual(jsonLeaf(false), { kind: "boolean", text: "false" });
  assert.deepEqual(jsonLeaf(null), { kind: "null", text: "null" });
  assert.deepEqual(jsonLeaf(undefined), { kind: "undefined", text: "undefined" });
  assert.deepEqual(jsonLeaf(12n), { kind: "bigint", text: "12n" });
  assert.equal(jsonLeaf({}), undefined);
  assert.equal(jsonLeaf([]), undefined);
});

test("an object with one primitive entry reads on one line", () => {
  const inline = inlineJson({ SUBMIT: "review" });
  assert.equal(inline?.text, '{ SUBMIT: "review" }');
  assert.equal(inline?.kind, "object");
  assert.equal(inline?.depth, 1);
  assert.deepEqual(inline?.parts, [
    { part: "bracket", text: "{" },
    { part: "space", text: " " },
    { part: "key", text: "SUBMIT" },
    { part: "colon", text: ":" },
    { part: "space", text: " " },
    { part: "value", kind: "string", text: '"review"' },
    { part: "space", text: " " },
    { part: "bracket", text: "}" },
  ]);
});

test("small values nest, and arrays follow the same one-entry rule", () => {
  assert.equal(inlineJson({ on: { SUBMIT: "review" } })?.text, '{ on: { SUBMIT: "review" } }');
  assert.equal(inlineJson({ on: { SUBMIT: "review" } })?.depth, 2);
  assert.equal(inlineJson(["a"])?.text, '["a"]');
  assert.equal(inlineJson(["a"])?.kind, "array");
  assert.equal(inlineJson([{ id: 1 }])?.text, "[{ id: 1 }]");
  assert.equal(inlineJson({ tags: [null] })?.text, "{ tags: [null] }");
  assert.equal(inlineJson([[true]])?.text, "[[true]]");
});

test("values with no entries, several entries, cycles or primitives stay as they are", () => {
  assert.equal(inlineJson({}), undefined);
  assert.equal(inlineJson([]), undefined);
  assert.equal(inlineJson({ a: 1, b: 2 }), undefined);
  assert.equal(inlineJson(["a", "b"]), undefined);
  assert.equal(inlineJson({ a: { b: 1, c: 2 } }), undefined);
  assert.equal(inlineJson({ a: {} }), undefined);
  assert.equal(inlineJson("text"), undefined);
  assert.equal(inlineJson(null), undefined);
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  assert.equal(inlineJson(loop, { maxDepth: Infinity }), undefined);
});

test("inline values are capped by depth and by length", () => {
  assert.equal(JSON_INLINE_MAX_DEPTH, 3);
  assert.equal(JSON_INLINE_MAX_LENGTH, 40);
  assert.equal(inlineJson({ a: { b: { c: 1 } } })?.text, "{ a: { b: { c: 1 } } }");
  assert.equal(inlineJson({ a: { b: { c: { d: 1 } } } }), undefined);
  assert.equal(inlineJson({ a: { b: { c: { d: 1 } } } }, { maxDepth: 4 })?.depth, 4);
  assert.equal(inlineJson({ a: { b: 1 } }, { maxDepth: 1 }), undefined);
  // `{ k: "…" }` is 9 characters around the string's own text.
  assert.equal(inlineJson({ k: "x".repeat(31) })?.text.length, 40);
  assert.equal(inlineJson({ k: "x".repeat(32) }), undefined);
  assert.equal(inlineJson({ k: "abc" }, { maxLength: 12 })?.text, '{ k: "abc" }');
  assert.equal(inlineJson({ k: "abc" }, { maxLength: 11 }), undefined);
});
