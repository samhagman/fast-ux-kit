import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptTextCompletion,
  createReferenceCompletionProvider,
  currentTextAnalysis,
  diagnosticsAt,
  extractTextSnippets,
  filterCompletions,
  mapTextRanges,
  recognizeTextReferences,
  resolveOutlineKey,
  sameTextContext,
  segmentText,
  validTextRange,
  type TextRequestContext,
} from "../src/core/index.js";

test("UTF-16 ranges handle emoji, combining marks and end-exclusive/point diagnostics", () => {
  const text = "A🧭e\u0301Z";
  assert.equal(text.length, 6);
  assert.equal(text.slice(1, 3), "🧭");
  assert.equal(validTextRange({ start: 1, end: 3 }, text), true);
  assert.equal(validTextRange({ start: NaN, end: 2 }, text), false);
  assert.equal(validTextRange({ start: 3, end: 8 }, text), false);
  const diagnostics = [
    { start: 1, end: 3, severity: "warning" as const, message: "Compass" },
    { start: 3, end: 3, severity: "hint" as const, message: "Point" },
  ];
  assert.deepEqual(
    diagnosticsAt(diagnostics, 3).map((item) => item.message),
    ["Point"],
  );
});
test("stale classification is discarded, and overlaps become flat complete segments", () => {
  assert.equal(
    currentTextAnalysis(
      { text: "old", classifications: [{ start: 0, end: 3, kind: "word" }] },
      "new",
    ),
    undefined,
  );
  const segments = segmentText("abcdef", [
    { start: 0, end: 4, kind: "outer" },
    { start: 2, end: 3, kind: "inner" },
  ]);
  assert.deepEqual(
    segments.map((segment) => [segment.text, segment.layers.map((layer) => layer.kind)]),
    [
      ["ab", ["outer"]],
      ["c", ["outer", "inner"]],
      ["d", ["outer"]],
      ["ef", []],
    ],
  );
  assert.equal(segments.map((segment) => segment.text).join(""), "abcdef");
});
test("completion ranking normalizes Unicode, prefers prefixes, dedupes ids and removes exact no-ops", () => {
  const items = [
    { id: "inside", label: "Go Café" },
    { id: "prefix", label: "Café" },
    { id: "other", label: "Tea" },
    { id: "prefix", label: "Duplicate" },
  ];
  assert.deepEqual(
    filterCompletions(items, "cafe\u0301").map((item) => item.id),
    ["prefix", "inside"],
  );
  assert.deepEqual(
    filterCompletions(items, "CAFÉ", "Café").map((item) => item.id),
    ["inside"],
  );
});
test("midtoken acceptance replaces whole token and preserves punctuation", () => {
  const text = "Hi @alxx!";
  const result = acceptTextCompletion(
    text,
    { range: { start: 3, end: 8 }, items: [] },
    { id: "1", label: "Alice", insertText: "@alice" },
  );
  assert.deepEqual(result, { text: "Hi @alice!", caret: 9 });
  assert.equal(
    acceptTextCompletion(
      text,
      { range: { start: 4, end: 30 }, items: [] },
      { id: "1", label: "No" },
    ),
    null,
  );
});
test("request freshness compares surface, row, revision, exact text and selection", () => {
  const context: TextRequestContext = {
    surfaceId: "one",
    rowId: "a",
    revision: 1,
    text: "hello",
    selection: { start: 2, end: 2 },
  };
  assert.equal(sameTextContext(context, { ...context }), true);
  for (const change of [
    { surfaceId: "two" },
    { rowId: "b" },
    { revision: 2 },
    { text: "other" },
    { selection: { start: 2, end: 3 } },
  ])
    assert.equal(sameTextContext(context, { ...context, ...change }), false);
});
test("reference recognition supports Unicode and explicit syntax exclusions without binding identity", async () => {
  const text = "@Zoë #日本語 mail@host @ignored";
  const start = text.indexOf("@ignored");
  assert.deepEqual(
    recognizeTextReferences(text, { exclusions: [{ start, end: text.length }] }).map(
      (item) => item.spelling,
    ),
    ["Zoë", "日本語"],
  );
  const provider = createReferenceCompletionProvider({
    id: "people",
    trigger: "@",
    entities: [{ id: "stable-1", spelling: "zoë", label: "Zoë Editor" }],
  });
  const context: TextRequestContext = {
    surfaceId: "one",
    rowId: "a",
    revision: 0,
    text: "@zxx",
    selection: { start: 2, end: 2 },
  };
  const offer = await provider.complete({
    ...context,
    reason: "explicit",
    signal: new AbortController().signal,
  });
  assert.deepEqual(offer?.range, { start: 0, end: 4 });
  assert.equal(offer?.items[0]!.insertText, "@zoë");
});
test("range mapping invalidates touched classification and snippets preserve original coordinates", () => {
  assert.deepEqual(
    mapTextRanges(
      [
        { start: 0, end: 2 },
        { start: 3, end: 6 },
        { start: 8, end: 10 },
      ],
      { start: 4, end: 5, text: "long" },
    ),
    [
      { start: 0, end: 2 },
      { start: 11, end: 13 },
    ],
  );
  const text = "0123456789abcdefghij";
  assert.deepEqual(
    extractTextSnippets(
      text,
      [
        { start: 4, end: 6 },
        { start: 8, end: 10 },
      ],
      2,
    ),
    [{ start: 2, end: 12, text: "23456789ab", truncatedStart: true, truncatedEnd: true }],
  );
});
test("keyboard mapping respects composition, native linebreaks and platform modifiers", () => {
  assert.equal(resolveOutlineKey({ key: "Enter", isComposing: true }, "text"), null);
  assert.equal(resolveOutlineKey({ key: "Enter", shiftKey: true }, "text"), "line-break");
  assert.equal(resolveOutlineKey({ key: "Enter", ctrlKey: true }, "text"), "task");
  assert.equal(resolveOutlineKey({ key: "z", metaKey: true, shiftKey: true }, "text"), "redo");
  assert.equal(resolveOutlineKey({ key: "Escape" }, "text"), "row-mode");
  assert.equal(resolveOutlineKey({ key: "Escape" }, "row"), "exit");
});

test("malformed classifications, diagnostic text and completion details are ignored without executing getters", () => {
  let getterCalls = 0;
  const unsafe = {
    id: "unsafe",
    label: "Word",
    get detail() {
      getterCalls++;
      return "Should not execute";
    },
  };
  assert.deepEqual(
    filterCompletions([unsafe, { id: "object", label: "Word", detail: {} } as never], ""),
    [],
  );
  assert.equal(getterCalls, 0);
  const analysis = currentTextAnalysis(
    {
      text: "word",
      classifications: [{ start: 0, end: 4, kind: {} } as never],
      diagnostics: [{ start: 0, end: 4, severity: "error", message: {} } as never],
    },
    "word",
  );
  assert.deepEqual(analysis?.classifications, []);
  assert.deepEqual(analysis?.diagnostics, []);
  assert.equal(
    currentTextAnalysis(
      {
        get text() {
          getterCalls++;
          return "word";
        },
      },
      "word",
    ),
    undefined,
  );
  assert.equal(
    validTextRange(
      {
        get start() {
          getterCalls++;
          return 0;
        },
        end: 4,
      },
      "word",
    ),
    false,
  );
  assert.equal(getterCalls, 0);
  assert.equal(
    acceptTextCompletion("word", { range: { start: 0, end: 4 }, items: [] }, {
      id: "bad",
      label: {},
    } as never),
    null,
  );
});

test("reference completions respect exclusions anywhere in the offered token and require an explicit trigger", async () => {
  const context: TextRequestContext = {
    surfaceId: "s",
    rowId: "r",
    revision: 0,
    text: "@alice",
    selection: { start: 4, end: 4 },
  };
  for (const range of [
    { start: 0, end: 1 },
    { start: 5, end: 6 },
  ]) {
    const provider = createReferenceCompletionProvider({
      id: "people",
      trigger: "@",
      entities: [{ id: "a", spelling: "alice" }],
      exclusions: () => [range],
    });
    assert.equal(
      await provider.complete({
        ...context,
        reason: "explicit",
        signal: new AbortController().signal,
      }),
      null,
    );
  }
  assert.throws(
    () => createReferenceCompletionProvider({ id: "bad", trigger: "", entities: [] }),
    /trigger/,
  );
});
