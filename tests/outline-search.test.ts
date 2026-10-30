import assert from "node:assert/strict";
import test from "node:test";
import type { OutlineNode } from "../src/core/index.js";
import type { OutlineItemDetails } from "../src/core/outline-productivity.js";
import { parseOutlineSearch, searchOutline } from "../src/core/outline-search.js";

function fixture(): readonly OutlineNode<OutlineItemDetails>[] {
  return [
    {
      id: "root",
      text: "Projects",
      children: [
        {
          id: "red",
          text: "Red apple",
          checked: true,
          data: { note: "ripe green fruit", color: "red", heading: 2, dates: [{ start: 0 }] },
          children: [
            { id: "hidden", text: "Small apple", checked: false, data: { note: "under branch" } },
          ],
        },
        { id: "green", text: "Green pear", data: { note: "green fruit" } },
      ],
    },
    { id: "blue", text: "Blue apple", data: { note: "ripe fruit", color: "blue" } },
    { id: "plain", text: "Plain branch" },
  ];
}
const ids = (query: string) => searchOutline(fixture(), query).matchedIds;

test("literal words and quoted phrases use implicit AND and OR alternatives", () => {
  assert.deepEqual(ids("apple ripe"), ["red", "blue"]);
  assert.deepEqual(ids('"green fruit"'), ["red", "green"]);
  assert.deepEqual(ids("pear OR apple ripe"), ["red", "green", "blue"]);
  assert.deepEqual(ids("pear OR apple AND ripe"), ["red", "green", "blue"]);
  assert.deepEqual(ids("apple -ripe"), ["hidden"]);
  assert.deepEqual(ids("apple NOT ripe"), ["hidden"]);
  assert.deepEqual(ids("-has:note"), ["root", "plain"]);
  assert.deepEqual(
    parseOutlineSearch("apple OR pear ripe").groups.map((group) => group.length),
    [1, 2],
  );
});

test("keywords and operator-looking strings can be quoted as literal text", () => {
  const nodes = [{ id: "one", text: 'OR AND NOT color:red a"b \\ [x] (a)+' }];
  for (const query of [
    '"OR"',
    '"AND"',
    '"NOT"',
    '"color:red"',
    '"a\\"b"',
    '"\\\\"',
    '"[x]"',
    '"(a)+"',
  ]) {
    assert.deepEqual(searchOutline(nodes, query).matchedIds, ["one"], query);
  }
});

test("title/note directives scope subsequent text and reset across OR", () => {
  assert.deepEqual(ids("in:title green"), ["green"]);
  assert.deepEqual(ids("in:note green"), ["red", "green"]);
  assert.deepEqual(ids("in:title apple in:note ripe"), ["red", "blue"]);
  assert.deepEqual(ids("in:note branch OR Blue"), ["hidden", "blue"]);
  assert.deepEqual(ids("in:note branch in:all Small"), ["hidden"]);
  assert.deepEqual(ids('in:note "green fruit"'), ["red", "green"]);
});

test("portable metadata and checked defaults power recognized predicates", () => {
  assert.deepEqual(ids("is:completed has:checkbox"), ["red"]);
  assert.deepEqual(ids("has:checkbox -is:completed"), ["hidden"]);
  assert.deepEqual(ids("is:heading heading:2 color:RED has:date has:children"), ["red"]);
  assert.deepEqual(ids("has:color -color:red"), ["blue"]);
  assert.deepEqual(ids("has:note"), ["red", "hidden", "green", "blue"]);
  assert.deepEqual(ids("has:children"), ["root", "red"]);
  assert.deepEqual(
    searchOutline([{ id: "a", text: "Task", checked: true }], "is:completed", {
      getDetails: () => ({ completed: false }),
    }).matchedIds,
    [],
  );
});

test("parent and ancestor predicates see real titles even outside the search scope", () => {
  assert.deepEqual(ids("parent:Projects"), ["red", "green"]);
  assert.deepEqual(ids("ancestor:Projects -parent:Projects"), ["hidden"]);
  assert.deepEqual(ids('parent:"Red apple"'), ["hidden"]);
  const result = searchOutline(fixture(), "ancestor:Projects apple", { scopeId: "red" });
  assert.deepEqual(result.matchedIds, ["red", "hidden"]);
  assert.deepEqual(result.contextAncestorIds, ["root"]);
  assert.deepEqual(searchOutline(fixture(), "apple", { scopeId: "hidden" }).contextAncestorIds, [
    "root",
    "red",
  ]);
  assert.deepEqual(
    searchOutline(fixture(), "apple", { scopeId: "missing" }).diagnostics.map(
      (entry) => entry.code,
    ),
    ["scope-not-found"],
  );
});

test("search includes hidden descendants and keeps context separate and ordered", () => {
  const result = searchOutline(fixture(), "apple");
  assert.deepEqual(result.matchedIds, ["red", "hidden", "blue"]);
  assert.deepEqual(result.contextAncestorIds, ["root"]);
  assert.deepEqual(searchOutline(fixture(), "under OR pear").contextAncestorIds, ["root", "red"]);
});

test("empty queries are inactive, not match-all", () => {
  for (const query of ["", "  \n\t"]) {
    assert.deepEqual(parseOutlineSearch(query), { groups: [], diagnostics: [] });
    const result = searchOutline(fixture(), query);
    assert.deepEqual(result.matchedIds, []);
    assert.equal(result.visitedCount, 0);
    assert.equal(result.truncated, false);
  }
});

test("malformed expressions fail closed with positioned diagnostics", () => {
  for (const query of [
    '"unclosed',
    '"apple"pear',
    'ap"ple"',
    'parent:"Red"apple',
    '""',
    "-",
    "OR apple",
    "apple OR",
    "apple AND",
    "NOT",
    "NOT NOT apple",
    "apple OR OR pear",
    "in:title",
    "apple in:note",
    "in:else apple",
    "-in:title apple",
    "is:unknown",
    "has:unknown",
    "heading:0",
    "heading:4",
    "color:",
    "parent:",
    "ancestor:",
  ]) {
    const plan = parseOutlineSearch(query);
    assert.ok(plan.diagnostics.length > 0, query);
    assert.deepEqual(plan.groups, [], query);
    assert.ok(
      plan.diagnostics.every((entry) => entry.start !== undefined && entry.end !== undefined),
      query,
    );
    assert.deepEqual(searchOutline(fixture(), query).matchedIds, [], query);
  }
});

test("unknown and date-relative operators are never silently interpreted", () => {
  for (const query of [
    "date:today",
    "created:today",
    "edited-after:2026-01-01",
    "due:tomorrow",
    "within:7d",
    "since:yesterday",
    "until:tomorrow",
  ]) {
    assert.equal(parseOutlineSearch(query).diagnostics[0]?.code, "unsupported-operator");
    assert.deepEqual(ids(query), []);
  }
  assert.equal(parseOutlineSearch("unknown:value").diagnostics[0]?.code, "unknown-operator");
  assert.equal(parseOutlineSearch("has:date").diagnostics.length, 0);
});

test("highlights retain exact UTF-16 positions under Unicode simple case matching", () => {
  const nodes = [{ id: "u", text: "😀İ KK café Straße e\u0301", data: { note: "😀 CAFÉ" } }];
  const result = searchOutline(nodes, "k café");
  assert.deepEqual(result.matches[0]?.titleRanges, [
    { start: 4, end: 5 },
    { start: 5, end: 6 },
    { start: 7, end: 11 },
  ]);
  assert.deepEqual(result.matches[0]?.noteRanges, [{ start: 3, end: 7 }]);
  assert.deepEqual(searchOutline(nodes, "i").matchedIds, []);
  assert.deepEqual(searchOutline(nodes, "STRASSE").matchedIds, []);
  assert.deepEqual(searchOutline(nodes, "é", { getDetails: () => ({}) }).matches[0]?.titleRanges, [
    { start: 10, end: 11 },
  ]);
  assert.deepEqual(searchOutline([{ id: "combining", text: "e\u0301" }], "é").matchedIds, []);
  assert.deepEqual(searchOutline(nodes, "😀").matches[0]?.titleRanges, [{ start: 0, end: 2 }]);
});

test("only successful positive text branches contribute ranges, without duplicate ranges", () => {
  const result = searchOutline(
    [{ id: "x", text: "apple pear" }],
    "apple OR apple OR pear missing OR -blue",
  );
  assert.deepEqual(result.matches[0]?.titleRanges, [{ start: 0, end: 5 }]);
  assert.deepEqual(
    searchOutline([{ id: "x", text: "apple" }], "-blue").matches[0]?.titleRanges,
    [],
  );
});

test("search and parse do not mutate frozen document data, options, or external reader state", () => {
  const nested = Object.freeze({
    id: "child",
    text: "Needle",
    checked: false,
    data: Object.freeze({ note: "needle", dates: Object.freeze([{ start: 0 }]) }),
  });
  const nodes = Object.freeze([
    Object.freeze({ id: "parent", text: "Root", children: Object.freeze([nested]) }),
  ]);
  const options = Object.freeze({ scopeId: "parent" });
  const expanded = new Set<string>(),
    revision = 17;
  const before = JSON.stringify(nodes);
  assert.deepEqual(searchOutline(nodes, "needle", options).matchedIds, ["child"]);
  assert.equal(JSON.stringify(nodes), before);
  assert.equal(nodes[0]?.children?.[0], nested);
  assert.equal(expanded.size, 0);
  assert.equal(revision, 17);
});

test("cyclic, shared, malformed, and duplicate-ID trees fail closed", () => {
  const cycle: { id: string; text: string; children?: readonly OutlineNode[] } = {
    id: "cycle",
    text: "match",
  };
  cycle.children = [cycle];
  const shared = { id: "shared", text: "match" };
  const cases = [
    [cycle],
    [shared, shared],
    [
      { id: "same", text: "match" },
      { id: "same", text: "other" },
    ],
    [{ id: "ok", text: "match", children: [null] }],
    [{ id: "bad", text: "match", children: {} }],
    [{ id: "bad", text: "match", checked: "yes" }],
    [{ id: " ", text: "match" }],
    null,
  ];
  for (const nodes of cases) {
    const result = searchOutline(nodes as unknown as readonly OutlineNode[], "match");
    assert.deepEqual(result.matchedIds, []);
    assert.equal(result.diagnostics.at(-1)?.code, "invalid-outline");
  }
});

test("query and token budgets are explicit, bounded, and fail closed", () => {
  assert.equal(
    parseOutlineSearch("apple", { maxQueryLength: 4 }).diagnostics[0]?.code,
    "query-limit",
  );
  assert.equal(
    parseOutlineSearch("apple pear", { maxTokens: 1 }).diagnostics[0]?.code,
    "token-limit",
  );
  assert.equal(parseOutlineSearch('"apple pear"', { maxTokens: 1 }).diagnostics.length, 0);
  for (const options of [
    { maxQueryLength: -1 },
    { maxTokens: NaN },
    { maxTokens: 1025 },
    { maxQueryLength: 65537 },
  ]) {
    assert.equal(parseOutlineSearch("apple", options).diagnostics[0]?.code, "invalid-budget");
  }
  assert.deepEqual(searchOutline(fixture(), "apple", { maxTokens: 0 }).matchedIds, []);
});

test("result budgets distinguish an exact-size result from a truncated prefix", () => {
  const result = searchOutline(fixture(), "apple", { maxResults: 2 });
  assert.deepEqual(result.matchedIds, ["red", "hidden"]);
  assert.deepEqual(result.contextAncestorIds, ["root"]);
  assert.equal(result.truncated, true);
  assert.ok(result.diagnostics.some((entry) => entry.code === "result-limit"));
  assert.equal(searchOutline(fixture(), "apple", { maxResults: 3 }).truncated, false);
  const zero = searchOutline(fixture(), "apple", { maxResults: 0 });
  assert.deepEqual(zero.matchedIds, []);
  assert.equal(zero.truncated, true);
});

test("visit budgets include out-of-scope nodes and retain deterministic prefixes", () => {
  const result = searchOutline(fixture(), "apple", { maxVisitedNodes: 3 });
  assert.deepEqual(result.matchedIds, ["red", "hidden"]);
  assert.equal(result.visitedCount, 3);
  assert.equal(result.truncated, true);
  assert.equal(result.diagnostics.at(-1)?.code, "visit-limit");
  const scoped = searchOutline(fixture(), "apple", { scopeId: "blue", maxVisitedNodes: 2 });
  assert.equal(scoped.visitedCount, 2);
  assert.equal(
    scoped.diagnostics.some((entry) => entry.code === "scope-not-found"),
    false,
  );
  assert.equal(scoped.truncated, true);
  assert.equal(searchOutline([], "apple", { maxVisitedNodes: 0 }).truncated, false);
});

test("highlight ranges are budgeted independently and invalid budgets are rejected", () => {
  const result = searchOutline([{ id: "a", text: "a a a", data: { note: "a a" } }], "a", {
    maxMatchRanges: 2,
  });
  assert.deepEqual(result.matches[0]?.titleRanges, [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ]);
  assert.deepEqual(result.matches[0]?.noteRanges, []);
  assert.equal(result.truncated, true);
  assert.equal(result.diagnostics.at(-1)?.code, "range-limit");
  for (const options of [
    { maxResults: 10001 },
    { maxVisitedNodes: Infinity },
    { maxMatchRanges: -1 },
    { maxResults: 0.5 },
  ]) {
    assert.equal(
      searchOutline(fixture(), "apple", options).diagnostics.at(-1)?.code,
      "invalid-budget",
    );
  }
});

test("ancestor caches retain strict, scoped, negated, and sibling-local semantics", () => {
  const nodes: readonly OutlineNode[] = [
    {
      id: "a",
      text: "First",
      children: [
        { id: "b", text: "Second", children: [{ id: "c", text: "Leaf" }] },
        { id: "d", text: "Other", children: [{ id: "e", text: "Leaf" }] },
      ],
    },
    { id: "f", text: "Outside", children: [{ id: "g", text: "Leaf" }] },
  ];
  assert.deepEqual(searchOutline(nodes, "ancestor:First").matchedIds, ["b", "c", "d", "e"]);
  assert.deepEqual(searchOutline(nodes, "ancestor:Second").matchedIds, ["c"]);
  assert.deepEqual(searchOutline(nodes, "-ancestor:First").matchedIds, ["a", "f", "g"]);
  const scoped = searchOutline(nodes, "ancestor:First ancestor:Second -ancestor:Outside", {
    scopeId: "c",
  });
  assert.deepEqual(scoped.matchedIds, ["c"]);
  assert.deepEqual(scoped.contextAncestorIds, ["a", "b"]);
});

test("deep-chain ancestor tests and context insertion have linear observable work", () => {
  const size = 512;
  let textReads = 0,
    idReads = 0;
  let child: OutlineNode | undefined;
  for (let index = size - 1; index >= 0; index--) {
    const id = `chain-${index}`;
    const node: OutlineNode = {
      get id() {
        idReads++;
        return id;
      },
      get text() {
        textReads++;
        return "node";
      },
      ...(child ? { children: [child] } : {}),
    };
    child = node;
  }
  // Deliberately repeated predicates share one inherited cache entry. A path walk
  // would perform more than 250,000 title reads; this bound is deterministic, not timing-based.
  const absent = searchOutline([child!], "ancestor:absent OR ancestor:absent");
  assert.deepEqual(absent.matchedIds, []);
  assert.equal(absent.visitedCount, size);
  assert.ok(textReads < size * 8, `unexpected ancestor title reads: ${textReads}`);
  idReads = 0;
  const all = searchOutline([child!], "node");
  assert.equal(all.matches.length, size);
  assert.deepEqual(all.contextAncestorIds, []);
  // Matching every row must not repeatedly insert every ancestor on the same path.
  assert.ok(idReads < size * 30, `unexpected context identity reads: ${idReads}`);
});

test("truncated prefixes do not certify unvisited structure", () => {
  const nodes: readonly OutlineNode[] = [
    { id: "first", text: "match" },
    { id: "second", text: "match" },
    { id: "first", text: "unvisited duplicate" },
  ];
  for (const options of [{ maxVisitedNodes: 1 }, { maxResults: 1 }]) {
    const partial = searchOutline(nodes, "match", options);
    assert.deepEqual(partial.matchedIds, ["first"]);
    assert.equal(partial.truncated, true);
    assert.ok(
      partial.diagnostics.some(
        (entry) => entry.code === "visit-limit" || entry.code === "result-limit",
      ),
    );
    assert.equal(
      partial.diagnostics.some((entry) => entry.code === "invalid-outline"),
      false,
    );
  }
  const complete = searchOutline(nodes, "match");
  assert.deepEqual(complete.matchedIds, []);
  assert.equal(complete.diagnostics.at(-1)?.code, "invalid-outline");
});
