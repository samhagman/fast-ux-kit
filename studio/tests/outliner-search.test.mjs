// Outliner search filters: the core grammar plus is:todo and the date filters (search-filters.ts).
// Same pattern as machine-view.test.mjs: `node --test` plus Vite's own SSR loader, no framework.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
let mod;
before(async () => {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  mod = await vite.ssrLoadModule("/src/registry/outliner/search-filters.ts");
});
after(() => vite?.close());

// A pinned clock: Friday 2026-10-30 at noon, local time.
const NOW = new Date(2026, 9, 30, 12, 0);
const doc = [
  {
    id: "plan",
    text: "Plan #launch",
    children: [
      { id: "today", text: "Ship docs !(2026-10-30 16:00)", checked: false },
      { id: "late", text: "Write model card !(2026-10-28) #docs", checked: false },
      { id: "late-done", text: "Old review !(2026-10-20)", checked: true },
      { id: "soon", text: "Partner kickoff !(2026-11-02) @marco", checked: false },
      { id: "far", text: "Webinar !(2026-11-12)" },
      { id: "plain", text: "Undated task #docs", checked: false },
      { id: "done", text: "Freeze harness", checked: true },
      { id: "note-dated", text: "Prep slides", data: { note: "Rehearsal !(2026-10-31)" } },
      { id: "flag", text: "Retro", data: { completed: true } },
    ],
  },
  { id: "loose", text: "Code span `!(2026-10-30)` is not a date" },
];
const ids = (query, options = {}) => {
  const result = mod.searchOutliner(doc, query, { now: NOW, ...options });
  assert.deepEqual(
    result.diagnostics,
    [],
    `${query}: ${result.diagnostics.map((d) => d.message).join(" ")}`,
  );
  return result.matchedIds;
};
const error = (query) => {
  const result = mod.searchOutliner(doc, query, { now: NOW });
  assert.equal(result.matchedIds.length, 0);
  assert.ok(result.diagnostics.length, `${query} should be rejected`);
  return result.diagnostics[0].message;
};

test("is:todo is unchecked checkbox items only; is:done stays the core alias for completed", () => {
  assert.deepEqual(ids("is:todo"), ["today", "late", "soon", "plain"]);
  assert.deepEqual(ids("is:done"), ["late-done", "done", "flag"]);
  assert.deepEqual(ids("-is:todo has:checkbox"), ["late-done", "done"]);
  assert.deepEqual(ids("NOT is:todo has:checkbox"), ["late-done", "done"]);
});

test("due: words resolve against local calendar days", () => {
  assert.deepEqual(ids("due:today"), ["today"]);
  assert.deepEqual(ids("due:tomorrow"), ["note-dated"], "a date in the note counts");
  assert.deepEqual(ids("due:overdue"), ["late"], "past and done is not overdue");
  assert.deepEqual(ids("due:week"), ["today", "soon", "note-dated"]);
  assert.deepEqual(
    ids("due:none"),
    ["plan", "plain", "done", "flag", "loose"],
    "a date inside `code` is not a date",
  );
  assert.deepEqual(ids("due:2026-11-12"), ["far"]);
});

test("before:/after: compare days strictly; has:date sees inline dates through the core", () => {
  assert.deepEqual(ids("before:2026-10-30"), ["late", "late-done"]);
  assert.deepEqual(ids("after:2026-10-31"), ["soon", "far"]);
  assert.deepEqual(ids("after:2026-10-29 before:2026-11-01"), ["today", "note-dated"]);
  assert.deepEqual(ids("has:date"), ["today", "late", "late-done", "soon", "far", "note-dated"]);
  assert.deepEqual(ids("-has:date"), ids("due:none"));
});

test("filters combine with core predicates, negation and OR", () => {
  assert.deepEqual(ids("#docs is:todo"), ["late", "plain"]);
  assert.deepEqual(ids("#docs -due:overdue"), ["plain"]);
  assert.deepEqual(ids("due:today OR @marco"), ["today", "soon"]);
  assert.deepEqual(
    ids("due:overdue OR due:today"),
    ["today", "late"],
    "results stay in document order",
  );
  assert.deepEqual(ids("is:todo AND due:week"), ["today", "soon"]);
  assert.deepEqual(ids('"due:today"'), [], "a quoted operator is a literal phrase");
});

test("scope: a zoomed search sees only the zoomed subtree, plus context ancestors", () => {
  const result = mod.searchOutliner(doc, "due:week", { now: NOW, scopeId: "plan" });
  assert.deepEqual(result.matchedIds, ["today", "soon", "note-dated"]);
  assert.deepEqual(result.contextAncestorIds, ["plan"]);
  assert.deepEqual(mod.searchOutliner(doc, "due:none", { now: NOW, scopeId: "plan" }).matchedIds, [
    "plan",
    "plain",
    "done",
    "flag",
  ]);
});

test("date matches highlight their date token; text matches highlight as before", () => {
  const result = mod.searchOutliner(doc, "docs due:today", { now: NOW });
  const match = result.matches.find((m) => m.id === "today");
  const text = doc[0].children[0].text;
  const slices = match.titleRanges.map((r) => text.slice(r.start, r.end));
  assert.deepEqual(slices, ["docs", "!(2026-10-30 16:00)"]);
  const negated = mod.searchOutliner(doc, "-due:overdue #docs", { now: NOW }).matches[0];
  const plain = doc[0].children[5].text;
  assert.deepEqual(
    negated.titleRanges.map((r) => plain.slice(r.start, r.end)),
    ["#docs"],
    "a negated filter adds no highlight",
  );
});

test("bad dates and values are parser errors, never a silent everything", () => {
  assert.match(error("due:someday"), /due: takes today, tomorrow, overdue, week, none/);
  assert.match(error("before:tomorrow"), /before: needs a date like \d{4}-\d{2}-\d{2}/);
  assert.match(error("after:2026-02-30"), /2026-02-30 is not a calendar date/);
  assert.match(error("due:"), /due: takes/);
  assert.match(
    error("due:today OR"),
    /predicate/,
    "structure errors still come from the core grammar",
  );
  assert.match(error("is:todo NOT"), /predicate/);
});

test("queries without filters go straight to the core (aliases included)", () => {
  assert.deepEqual(ids("has:notes"), ["note-dated"]);
  assert.deepEqual(ids("has:task -is:done"), ["today", "late", "soon", "plain"]);
  const core = mod.searchOutliner(doc, "#launch", { now: NOW });
  assert.deepEqual(core.matchedIds, ["plan"]);
});

test("hints complete the token being typed: operators, then their values", () => {
  const labels = (query) => mod.searchSuggestions(query, NOW).map((s) => s.label);
  assert.deepEqual(labels("du"), ["due:", "during:"], "due: first; during: (date spans) after it");
  assert.deepEqual(labels("#docs due:"), [
    "due:today",
    "due:overdue",
    "due:week",
    "due:tomorrow",
    "due:none",
  ]);
  assert.deepEqual(labels("due:to"), ["due:today", "due:tomorrow"]);
  assert.deepEqual(labels("-due:o"), ["-due:overdue"]);
  assert.deepEqual(labels("is:"), ["is:todo", "is:done", "is:heading"]);
  assert.deepEqual(labels("before:"), ["before:2026-10-30", "before:2026-11-06"]);
  assert.deepEqual(labels("due:today"), [], "a complete value needs no hint");
  assert.deepEqual(labels("due:today "), [], "nothing after a finished token");
  assert.equal(mod.searchSuggestions("#docs due:ov", NOW)[0].query, "#docs due:overdue ");
});
