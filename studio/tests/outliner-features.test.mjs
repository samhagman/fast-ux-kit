// Outliner features: mirrors, recurring dates, backlinks, agenda, sorting, bookmarks,
// honest deletes, literal paste and paren-safe links.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { JSDOM } from "jsdom";

const { window: dom } = new JSDOM("");
const parse = (html) => new dom.DOMParser().parseFromString(html, "text/html");

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, core, mirrors, inline, interchange, search, hook, controlled;
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  core = await vite.ssrLoadModule("@fux/core");
  mirrors = await vite.ssrLoadModule("/src/registry/outliner/mirrors.ts");
  inline = await vite.ssrLoadModule("/src/registry/outliner/inline.tsx");
  interchange = await vite.ssrLoadModule("/src/registry/outliner/interchange.ts");
  search = await vite.ssrLoadModule("/src/registry/outliner/search-filters.ts");
  hook = await vite.ssrLoadModule("/src/registry/outliner/use-outliner.ts");
  controlled = await vite.ssrLoadModule("/src/registry/outliner/controlled-outline.ts");
});
after(() => vite?.close());

const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const doc = () => [
  { id: "src", text: "Rollout", data: { numbered: true }, children: [{ id: "a", text: "Dogfood", checked: true }, { id: "b", text: "GA", checked: false }] },
  { id: "elsewhere", text: "Comms", children: [{ id: "m", text: "", data: { mirrorOf: "src" } }] },
];
const load = (nodes) => mirrors.syncMirrors(null, nodes).nodes;

/* A tiny editor loop: core reducer + the outliner's mirror rule, exactly as useOutliner runs it. */
function editor(nodes, isLocked) {
  const noteAdapter = {
    read: (node) => node.data?.note ?? "",
    prepareData: (node, note) => {
      const { note: _previous, ...rest } = node.data ?? {};
      return { ok: true, data: note ? { ...rest, note } : rest };
    },
  };
  const options = { readOnly: false, isLocked, historyLimit: 50, typingGroupMs: 900, noteAdapter };
  let state = controlled.initOutlineState(core.createOutlineEditorState(load(nodes), { expandedIds: new Set(["src", "m", "elsewhere"]) }));
  const afterEdit = (b, a) => {
    if (!mirrors.hasMirrors(a.nodes) && !mirrors.hasMirrors(b.nodes)) return a;
    const sync = mirrors.syncMirrors(b.nodes, a.nodes, isLocked);
    if (!sync.ok) return { ...b, refusal: sync.reason };
    const rename = (id) => sync.renames.get(id) ?? id;
    return { ...a, nodes: sync.nodes, caret: a.caret ? { ...a.caret, id: rename(a.caret.id) } : null };
  };
  return {
    act(action) {
      const step = controlled.stepOutline(state, action, options, false, 0, afterEdit);
      state = step.state;
      return state.editor;
    },
    get nodes() {
      return state.editor.nodes;
    },
    get editor() {
      return state.editor;
    },
  };
}

/* ───────────── Mirrors ───────────── */

test("mirrors: a stored reference loads as a full live copy with derived ids", () => {
  const nodes = load(doc());
  const m = find(nodes, "m");
  assert.equal(m.text, "Rollout");
  assert.deepEqual(m.children.map((c) => c.id), ["m~a", "m~b"]);
  assert.equal(m.data.mirrorOf, "src");
  assert.equal(m.data.numbered, true, "shared data travels");
  assert.equal(core.validateOutline(nodes).length, 0, "ids stay unique");
  assert.equal(mirrors.syncMirrors(null, nodes).nodes, nodes, "already in sync: same array back");
});

test("mirrors: editing the source updates the mirror; editing the mirror (or a copied child) updates the source", () => {
  const ed = editor(doc());
  ed.act({ type: "text", id: "src", text: "Rollout v2", time: 1 });
  assert.equal(find(ed.nodes, "m").text, "Rollout v2");
  ed.act({ type: "text", id: "m~b", text: "GA everywhere", time: 5000 });
  assert.equal(find(ed.nodes, "b").text, "GA everywhere", "a copy's edit lands on its source node");
  ed.act({ type: "transaction", commands: [{ type: "update", id: "m~a", changes: { checked: false } }] });
  assert.equal(find(ed.nodes, "a").checked, false, "checkbox state is shared");
  ed.act({ type: "note", id: "m", text: "From the mirror", time: 9000 });
  assert.equal(find(ed.nodes, "src").data.note, "From the mirror");
  assert.equal(find(ed.nodes, "m").data.mirrorOf, "src", "the mirror keeps its own link");
});

test("mirrors: a child created inside a mirror becomes a source child, and the caret follows the renamed copy", () => {
  const ed = editor(doc());
  const state = ed.act({ type: "split", id: "m~b", start: 2, newId: "fresh" });
  const source = find(ed.nodes, "src").children.map((c) => c.id);
  assert.deepEqual(source, ["a", "b", "fresh"]);
  assert.deepEqual(find(ed.nodes, "m").children.map((c) => c.id), ["m~a", "m~b", "m~fresh"]);
  assert.equal(state.caret.id, "m~fresh", "typing continues in the mirror, not at the source");
  assert.equal(core.validateOutline(ed.nodes).length, 0);
});

test("mirrors: one edit and its propagation are one undo step", () => {
  const ed = editor(doc());
  ed.act({ type: "text", id: "m", text: "Renamed in mirror", time: 1 });
  assert.equal(find(ed.nodes, "src").text, "Renamed in mirror");
  ed.act({ type: "undo" });
  assert.equal(find(ed.nodes, "src").text, "Rollout");
  assert.equal(find(ed.nodes, "m").text, "Rollout");
  ed.act({ type: "redo" });
  assert.equal(find(ed.nodes, "src").text, "Renamed in mirror");
  assert.equal(find(ed.nodes, "m").text, "Renamed in mirror");
});

test("mirrors: deleting a mirror never deletes the source; deleting the source keeps mirrors as plain items", () => {
  const ed = editor(doc());
  ed.act({ type: "delete", ids: ["m"] });
  assert.ok(find(ed.nodes, "src"), "source survives");
  assert.equal(find(ed.nodes, "src").children.length, 2, "and keeps its children");
  ed.act({ type: "undo" });
  ed.act({ type: "delete", ids: ["src"] });
  const orphan = find(ed.nodes, "m");
  assert.equal(orphan.text, "Rollout", "content is kept");
  assert.equal(orphan.data?.mirrorOf, undefined, "no dangling link");
  assert.equal(orphan.children.length, 2);
  ed.act({ type: "undo" });
  assert.equal(find(ed.nodes, "m").data.mirrorOf, "src", "undo restores the live mirror");
});

test("mirrors: deleting a copied child deletes it at the source (it is the same item)", () => {
  const ed = editor(doc());
  ed.act({ type: "delete", ids: ["m~a"] });
  assert.deepEqual(find(ed.nodes, "src").children.map((c) => c.id), ["b"]);
});

test("mirrors: a mirror inside its own source is refused, never looped", () => {
  const ed = editor(doc());
  const result = ed.act({ type: "drop", ids: ["m"], parentId: "src", index: 0 });
  assert.equal(result.refusal, "descendant-move");
  assert.equal(find(ed.nodes, "elsewhere").children[0].id, "m", "nothing moved");
});

test("mirrors: edits that reach a locked source through a mirror are refused", () => {
  const ed = editor(doc(), (node) => node.id === "b");
  const result = ed.act({ type: "text", id: "m~b", text: "sneaky", time: 1 });
  assert.equal(result.refusal, "locked");
  assert.equal(find(ed.nodes, "b").text, "GA");
  assert.equal(find(ed.nodes, "m~b").text, "GA", "the copy is untouched too");
});

test("mirrors: createMirror resolves a mirror of a mirror to the original; export writes mirrors as links", () => {
  const nodes = load(doc());
  const again = mirrors.createMirror(nodes, "m", "m2");
  assert.equal(again.data.mirrorOf, "src");
  assert.deepEqual(again.children.map((c) => c.id), ["m2~a", "m2~b"]);
  assert.equal(mirrors.canonicalId(nodes, "m~b"), "b");
  assert.equal(mirrors.canonicalId(nodes, "m"), "src");
  assert.equal(mirrors.canonicalId(nodes, "a"), null);
  const md = interchange.exportOutline(nodes, "markdown");
  assert.match(md, /- \[\[Rollout\|src\]\]/);
  assert.equal((md.match(/Dogfood/g) ?? []).length, 1, "copied children are not duplicated in the file");
  const json = JSON.parse(interchange.exportOutline(nodes, "json"));
  assert.ok(JSON.stringify(json).includes('"mirrorOf":"src"'), "JSON stays lossless");
});

test("mirrors: an unchanged source keeps the mirror's objects (identity), so memoized rows hold", () => {
  const ed = editor(doc());
  const before = find(ed.nodes, "m").children[0];
  ed.act({ type: "text", id: "b", text: "GA later", time: 1 });
  assert.equal(find(ed.nodes, "m").children[0], before, "the untouched copy is the same object");
  assert.equal(find(ed.nodes, "m~b").text, "GA later");
});

/* ───────────── Recurring dates ───────────── */

test("recurring dates parse, format and advance to the next occurrence after today", () => {
  const token = "!(2026-11-03 10:00 every week)";
  const date = inline.parseDateToken(token);
  assert.deepEqual(date.repeat, { unit: "week", interval: 1 });
  assert.equal(inline.formatDateToken(date.value, true, date.repeat), token);
  assert.equal(inline.parseDateToken("!(2026-11-03 every fortnight)"), null, "unknown rule: not a date");
  assert.deepEqual(inline.parseDateToken("!(2026-11-03 every 2 weeks)").repeat, { unit: "week", interval: 2 });
  const day = (y, m, d) => new Date(y, m - 1, d);
  const next = (t, now) => inline.nextOccurrence(inline.parseDateToken(t), now);
  assert.equal(next("!(2026-11-03 every week)", day(2026, 11, 3)).toDateString(), day(2026, 11, 10).toDateString());
  assert.equal(next("!(2026-10-01 every week)", day(2026, 10, 30)).toDateString(), day(2026, 11, 5).toDateString(), "late: skips to the future, same weekday");
  assert.equal(next("!(2026-01-31 every month)", day(2026, 1, 31)).toDateString(), day(2026, 2, 28).toDateString(), "months clamp");
  assert.equal(next("!(2026-10-30 every weekday)", day(2026, 10, 30)).toDateString(), day(2026, 11, 2).toDateString(), "Friday → Monday");
});

test("completing a recurring task advances its date instead and stays open (one undo step)", () => {
  const advanced = hook.advanceRecurring("Capacity review !(2026-10-01 10:00 every week) #sre", new Date(2026, 9, 30));
  assert.equal(advanced.text, "Capacity review !(2026-11-05 10:00 every week) #sre");
  assert.equal(hook.advanceRecurring("No repeat !(2026-10-01)"), null);
});

/* ───────────── Inline escapes and paste ───────────── */

test("a backslash makes markup literal; pasted HTML text never turns into links or formatting", () => {
  const segments = inline.parseInline("\\[[Launch goals|goals-1]] and \\**not bold**");
  assert.ok(!segments.some((s) => s.kind === "ref" || s.kind === "bold"));
  assert.equal(inline.inlineToPlain("\\[[Launch goals|goals-1]]"), "[[Launch goals|goals-1]]");
  assert.equal(inline.literalInline("[[Launch goals|goals-1]] __init__ #tag https://x.dev/a_b"), "\\[[Launch goals|goals-1]] \\__init__ #tag https://x.dev/a_b");
  assert.equal(inline.inlineToPlain(inline.literalInline("a \\* b **c**")), "a \\* b **c**", "literal text round-trips exactly");
  const [node] = interchange.importOutlineHtml("<ul><li>See [[Launch goals|goals-1]] and <b>bold</b></li></ul>", () => "x", parse);
  const kinds = inline.parseInline(node.text).map((s) => s.kind);
  assert.ok(!kinds.includes("ref"), "typed link markup stays text");
  assert.ok(kinds.includes("bold"), "the importer's own markers still format");
});

test("HTML-pasted links keep parentheses (Wikipedia-style URLs)", () => {
  const html = '<ul><li><a href="https://en.wikipedia.org/wiki/Mercury_(planet)">Mercury</a> notes</li></ul>';
  const [node] = interchange.importOutlineHtml(html, () => "x", parse);
  const link = inline.parseInline(node.text).find((s) => s.kind === "link");
  assert.equal(link.href, "https://en.wikipedia.org/wiki/Mercury_%28planet%29");
  assert.equal(inline.inlineToPlain(node.text), "Mercury notes", "no stray ) left in the text");
});

/* ───────────── Backlinks, links: search, agenda, sort ───────────── */

const linked = () => [
  { id: "goals", text: "Launch goals" },
  { id: "blog", text: "Blog — see [[Launch goals|goals]]" },
  { id: "web", text: "Webinar !(2026-11-01) agenda [[Goals|goals]]", data: { note: "also [[Blog|blog]]" } },
  { id: "late", text: "Overdue thing !(2026-10-20)", checked: false },
  { id: "done", text: "Old done !(2026-10-21)", checked: true },
  { id: "plain", text: "No date" },
];

test("backlinks: a reverse index over [[label|id]] (title and note); links:<id> searches it", () => {
  const index = hook.linkIndexOf(linked());
  assert.deepEqual([...index.get("goals")].sort(), ["blog", "web"]);
  assert.deepEqual(index.get("blog"), ["web"], "note links count");
  const result = search.searchOutliner(linked(), "links:goals");
  assert.deepEqual(result.matchedIds, ["blog", "web"]);
  assert.deepEqual(search.searchOutliner(linked(), "-links:goals").matchedIds.includes("blog"), false);
  assert.equal(search.searchOutliner(linked(), "links:").diagnostics[0].message, "links: needs an item id.");
});

test("agenda: dated results group Overdue / Today / Tomorrow / This week / Later / Earlier, done / No date", () => {
  const today = search.dayNumber(new Date(2026, 9, 30));
  const group = (id) => hook.agendaGroupOf(find(linked(), id), today);
  assert.equal(group("late"), "overdue");
  assert.equal(group("done"), "earlier", "a past date on a done task is history, not overdue");
  assert.equal(group("web"), "week");
  assert.equal(group("plain"), "none");
  assert.equal(hook.agendaGroupOf({ id: "t", text: "x !(2026-10-31)" }, today), "tomorrow");
  assert.equal(hook.agendaGroupOf({ id: "t", text: "x !(2026-10-30)" }, today), "today");
  assert.equal(hook.agendaGroupOf({ id: "t", text: "x !(2026-12-30)" }, today), "later");
});

test("sort by date and by completion use the core sort with inline dates", () => {
  const nodes = [
    { id: "p", text: "Parent", children: [
      { id: "c", text: "Gamma !(2026-11-09)", checked: true },
      { id: "a", text: "Alpha" , checked: false },
      { id: "b", text: "Beta !(2026-11-02)", checked: false },
    ] },
  ];
  const byDate = core.planOutlineSort(nodes, { parentId: "p", by: "date" }, search.outlinerDetails);
  assert.deepEqual(byDate.nodes[0].children.map((n) => n.id), ["b", "c", "a"], "undated last");
  const byDone = core.planOutlineSort(nodes, { parentId: "p", by: "completion" }, search.outlinerDetails);
  assert.deepEqual(byDone.nodes[0].children.map((n) => n.id), ["a", "b", "c"], "incomplete first, stable");
});

/* ───────────── Through the hook (React, jsdom) ───────────── */

let React, act, createRoot;
async function domEnv() {
  if (createRoot) return;
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMParser"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}
async function mount(props) {
  await domEnv();
  const record = { ol: null, changes: [] };
  function Probe() {
    record.ol = hook.useOutliner(props);
    return null;
  }
  const root = createRoot(window.document.createElement("div"));
  await act(async () => root.render(React.createElement(Probe)));
  return { record, run: (fn) => act(async () => void fn(record.ol)), unmount: () => act(async () => root.unmount()) };
}

test("hook: delete reports items and descendants; the undo entry it made is the one on top", async () => {
  const view = await mount({ defaultValue: doc(), defaultExpandedIds: ["src", "elsewhere", "m"] });
  let result;
  await view.run((ol) => (result = ol.commands.remove(["src"])));
  assert.deepEqual({ items: result.items, descendants: result.descendants }, { items: 1, descendants: 2 });
  const entry = view.record.ol.historyTop();
  assert.ok(entry, "an Undo offer binds to this entry");
  await view.run((ol) => ol.dispatch({ type: "undo" }));
  assert.notEqual(view.record.ol.historyTop(), entry, "after an undo the old offer is stale (the toast is dismissed and its Undo does nothing)");
  await view.unmount();
});

test("hook: completing a recurring task advances it (one undo step); mirrorTo makes a live mirror", async () => {
  const view = await mount({
    defaultValue: [{ id: "r", text: "Weekly sync !(2026-10-01 every week)", checked: false }, { id: "p", text: "Parent" }],
  });
  let summary;
  await view.run((ol) => (summary = ol.commands.toggleComplete(["r"])));
  const node = find(view.record.ol.state.nodes, "r");
  assert.equal(node.checked, false, "stays open");
  assert.match(node.text, /every week\)$/);
  assert.equal(summary.advanced.length, 1);
  await view.run((ol) => ol.dispatch({ type: "undo" }));
  assert.equal(find(view.record.ol.state.nodes, "r").text, "Weekly sync !(2026-10-01 every week)");
  let ids;
  await view.run((ol) => (ids = ol.commands.mirrorTo(["r"], "p")));
  const mirror = find(view.record.ol.state.nodes, ids[0]);
  assert.equal(mirror.data.mirrorOf, "r");
  await view.run((ol) => ol.dispatch({ type: "text", id: ids[0], text: "Renamed via mirror", time: 1 }));
  assert.equal(find(view.record.ol.state.nodes, "r").text, "Renamed via mirror");
  assert.deepEqual(view.record.ol.commands.mirrorsOf("r"), ids);
  await view.unmount();
});

test("hook: bookmarks are host state (controlled or seeded), never storage", async () => {
  const seen = [];
  const view = await mount({ defaultValue: doc(), defaultBookmarks: { items: [], searches: [] }, onBookmarksChange: (b) => seen.push(b) });
  await view.run((ol) => ol.commands.toggleBookmark("src"));
  await view.run((ol) => ol.commands.saveSearch("due:week", "This week"));
  await view.run((ol) => ol.commands.saveSearch("due:week"));
  assert.deepEqual(view.record.ol.bookmarks, { items: ["src"], searches: [{ query: "due:week", label: "This week" }] });
  assert.equal(seen.length, 2, "a duplicate save is not a change");
  await view.run((ol) => ol.commands.toggleBookmark("src"));
  assert.deepEqual(view.record.ol.bookmarks.items, []);
  await view.unmount();
  const fixed = { items: ["a"], searches: [] };
  const controlledView = await mount({ defaultValue: doc(), bookmarks: fixed, onBookmarksChange: () => {} });
  await controlledView.run((ol) => ol.commands.toggleBookmark("b"));
  assert.equal(controlledView.record.ol.bookmarks, fixed, "controlled: the host decides");
  await controlledView.unmount();
});

test("hook: a half-typed last token holds the previous results instead of failing", async () => {
  const view = await mount({ defaultValue: linked() });
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "links:goals due:" })));
  const held = view.record.ol.search;
  assert.equal(held.pending, true);
  assert.deepEqual(held.matchedIds, ["blog", "web"], "the query without the unfinished token");
  assert.equal(held.diagnostics.length, 0, "never 'invalid' while typing");
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "due:" })));
  assert.equal(view.record.ol.search, null, "nothing finished yet: show everything");
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "has:date", searchMode: "agenda" })));
  const groups = view.record.ol.rows.filter((r) => r.agenda).map((r) => r.agenda.group);
  assert.ok(groups.length >= 2 && new Set(groups).size === groups.length, "each group opens once");
  await view.unmount();
});

test("labels: partial overrides fall back to English defaults", async () => {
  const labels = await vite.ssrLoadModule("/src/registry/outliner/labels.ts");
  const custom = labels.resolveLabels({ deleted: (n, c) => `Supprimé ${n}+${c}`, agendaGroups: { today: "Aujourd’hui" } });
  assert.equal(custom.deleted(1, 684), "Supprimé 1+684");
  assert.equal(custom.agendaGroups.today, "Aujourd’hui");
  assert.equal(custom.agendaGroups.overdue, "Overdue");
  assert.equal(labels.DEFAULT_LABELS.deleted(1, 684), "Deleted 1 item and 684 children");
  assert.equal(labels.DEFAULT_LABELS.deleted(2, 0), "Deleted 2 items");
  assert.equal(labels.resolveLabels(), labels.DEFAULT_LABELS);
});
