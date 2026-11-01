// One target, one visible cursor (keyboard model, phase 1): the row the next key acts on is the
// row drawn as the cursor and named by aria-activedescendant; edits keep it (Space twice
// completes, then reopens); rows that a filter would hide linger while they are the target;
// paste and delete move the target on purpose; Esc steps down a ladder; touch selection mode
// still ends after a one-shot action.
//
//   cd studio && node --test tests/outliner-target.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { code, load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let target, keymap;
before(async () => {
  target = await load("/src/registry/outliner/target.ts");
  keymap = await load("/src/registry/outliner/keymap.ts");
});
after(() => stopVite());

const doc = () => [
  { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }, { id: "a2", text: "Two" }, { id: "a3", text: "Three" }] },
  { id: "b", text: "Beta", children: [{ id: "b1", text: "Deep" }, { id: "b2", text: "Deeper" }] },
  { id: "c", text: "Gamma" },
  { id: "e", text: "Gamut" },
  { id: "d", text: "Delta" },
];
const find = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children && find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};
const kids = (nodes, id) => (id ? find(nodes, id)?.children ?? [] : nodes).map((n) => n.id);
/** The document without edit stamps (editedAt/createdAt change on every edit by design). */
const content = (nodes) =>
  JSON.parse(
    JSON.stringify(nodes, (key, value) => (key === "editedAt" || key === "createdAt" ? undefined : value && typeof value === "object" && !Array.isArray(value) && key === "data" && !Object.keys(value).some((k) => k !== "editedAt" && k !== "createdAt" && value[k] !== undefined) ? undefined : value)),
  );
const shown = (ui) => ui.ol().rows.map((row) => row.id);
const done = (ui, id) => ui.ol().rows.find((row) => row.id === id)?.completed ?? find(ui.value(), id)?.data?.completed === true;
const revision = (ui) => ui.ol().state.revision;
const marks = (ui) => [...ui.container.querySelectorAll("[role=tree] [data-cursor]")];
const hideCompleted = (ui, on = true) => ui.act(() => ui.ol().setView((view) => ({ ...view, hideCompleted: on })));
const search = (ui, query) => ui.act(() => ui.handle.current.search(query));

/** The invariant: rows present ⇒ exactly one [data-cursor], and it is the active descendant. */
async function oneCursor(ui, label) {
  if (!ui.ol().rows.length) {
    assert.equal(marks(ui).length, 0, `${label}: no rows, no cursor`);
    assert.equal(ui.tree()?.getAttribute("aria-activedescendant") ?? null, null, `${label}: no active descendant`);
    return null;
  }
  // A deleted row can still be fading out (exit animation) with its last props: let it go.
  await waitFor(() => marks(ui).length === 1, 3000).catch(() => {});
  const found = marks(ui);
  assert.equal(found.length, 1, `${label}: exactly one cursor row (found ${found.map((el) => el.dataset.row)})`);
  assert.equal(ui.tree().getAttribute("aria-activedescendant"), found[0].id, `${label}: the cursor is the active descendant`);
  return found[0].dataset.row;
}

/* ───────────── Pure: resolveTarget, linger, keys ───────────── */

test("resolveTarget: selection in visible order, else the cursor; hidden rows are never the target", () => {
  const rows = ["a", "a1", "a2", "b"].map((id) => ({ id }));
  const view = { rows, rowIndex: new Map(rows.map((row, i) => [row.id, i])) };
  const nodes = [{ id: "a", text: "A", children: [{ id: "a1", text: "1" }, { id: "a2", text: "2" }] }, { id: "b", text: "B" }, { id: "z", text: "Z" }];
  const base = { nodes, expandedIds: new Set(["a"]), hoistedId: null, history: { past: [], future: [], group: null }, revision: 0, focusVersion: 0, refusal: null };
  const state = (over) => ({ ...base, caret: null, selection: new Set(), selectionAnchor: null, ...over });
  assert.deepEqual(target.resolveTarget(state({ selection: new Set(["b", "a1"]), caret: { id: "b", start: 0, end: 0 }, selectionAnchor: "a1" }), view, false), { ids: ["a1", "b"], cursor: "b" });
  assert.deepEqual(target.resolveTarget(state({ caret: { id: "a2", start: 0, end: 0 }, selectionAnchor: "a2" }), view, false), { ids: ["a2"], cursor: "a2" }, "no selection: the cursor row");
  // z is filtered out of the view (Hide completed, a search): the nearest shown row stands in.
  assert.deepEqual(target.resolveTarget(state({ caret: { id: "z", start: 0, end: 0 }, selectionAnchor: "z", selection: new Set(["z"]) }), view, false), { ids: ["b"], cursor: "b" });
  assert.deepEqual(target.resolveTarget(state({ caret: { id: "a1", start: 2, end: 2 } }), view, true), { ids: ["a1"], cursor: "a1" }, "editing: the caret row");
  assert.deepEqual(target.resolveTarget(state({ caret: { id: "a1", start: 0, end: 0 } }), { rows: [], rowIndex: new Map() }, false), { ids: [], cursor: null }, "zero rows: no target");
});

test("linger: joins on an edit under a filter, shrinks to the target as it moves, drops on a new session", () => {
  const session = target.lingerSession({ query: "", hideCompleted: true, searchMode: "filter" }, null);
  assert.equal(target.lingerSession({ query: " ", hideCompleted: false, searchMode: "filter" }, null), "", "no filter: no session");
  let linger = target.nextLinger(target.NO_LINGER, session, { kind: "edit", before: ["r3"], after: ["r3"] });
  assert.deepEqual([...linger.ids], ["r3"]);
  assert.equal(target.nextLinger(linger, session, { kind: "view", before: ["r3"], after: ["r3"] }), linger, "same target: unchanged");
  assert.deepEqual([...target.nextLinger(linger, session, { kind: "view", before: ["r3"], after: ["r4"] }).ids], [], "the cursor left: released");
  assert.deepEqual([...target.nextLinger(linger, session, { kind: "history", before: ["r4"], after: ["r3"] }).ids], ["r3"], "undo never adds, only keeps what is still targeted");
  assert.deepEqual([...target.nextLinger(linger, "other", { kind: "view", before: [], after: ["r3"] }).ids], [], "a new session starts empty");
  assert.deepEqual([...target.nextLinger(linger, session, { kind: "replace", before: [], after: ["r3"] }).ids], [], "a replacement drops it");
  const paths = target.lingerPaths(doc(), new Set(["b1"]));
  assert.deepEqual([...paths.shown].sort(), ["b", "b1"], "the path to a lingering row is shown");
  assert.deepEqual([...paths.ancestors], ["b"]);
});

test("FIXED_KEYS: one table for the keys nobody remaps", () => {
  const match = (init) => keymap.matchFixedKey({ key: " ", ...init });
  assert.deepEqual(match({}), { command: "item.complete", extend: false });
  assert.equal(match({ metaKey: true, shiftKey: true }), null, "⌘⇧Space is quick capture, not complete");
  assert.deepEqual(keymap.matchFixedKey({ key: "Tab", shiftKey: true }), { command: "item.outdent", extend: false });
  assert.deepEqual(keymap.matchFixedKey({ key: "PageDown", shiftKey: true }), { command: "cursor.pageDown", extend: true });
  assert.deepEqual(keymap.matchFixedKey({ key: "ArrowUp", metaKey: true }), { command: "cursor.up", extend: false }, "an unclaimed chord travels like its key");
  assert.equal(keymap.matchFixedKey({ key: "x" }), null);
  for (const def of keymap.FIXED_KEYS) assert.ok(def.label && def.keys.length, `${def.command} is labelled for the shortcut sheet`);
});

/* ───────────── The invariant over a scripted session ───────────── */

test("invariant: exactly one [data-cursor], equal to aria-activedescendant, after every action", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a1");
  assert.equal(await oneCursor(ui, "select"), "a1");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key("ArrowDown", { shiftKey: true });
  assert.deepEqual(ui.selection().sort(), ["a1", "a2", "a3"]);
  assert.equal(await oneCursor(ui, "range"), "a3", "the cursor is the moving end");
  await ui.key("Escape");
  assert.deepEqual(ui.selection(), [], "Esc let the range go");
  assert.equal(await oneCursor(ui, "Esc"), "a3", "…and the cursor stayed");
  await ui.key(" ");
  assert.equal(done(ui, "a3"), true, "Space after Esc still acts (on the cursor row)");
  assert.equal(await oneCursor(ui, "Space"), "a3");
  await ui.key("Backspace");
  assert.equal(find(ui.value(), "a3"), undefined);
  assert.equal(await oneCursor(ui, "delete"), "b", "the next visible survivor");
  await ui.key("z", { metaKey: true });
  assert.ok(find(ui.value(), "a3"));
  assert.equal(await oneCursor(ui, "undo"), "a3");
  // A fold that hides the cursor row (the disclosure, by pointer): the cursor goes to the parent.
  await ui.act(() => ui.ol().dispatch({ type: "toggle", id: "a" }));
  assert.equal(await oneCursor(ui, "fold"), "a");
  await ui.key("ArrowDown");
  assert.equal(await oneCursor(ui, "travel"), "b");
  await ui.key("]", { metaKey: true });
  assert.equal(ui.ol().state.hoistedId, "b");
  assert.equal(await oneCursor(ui, "zoom in"), "b1", "the first row of the zoomed item");
  await ui.key("[", { metaKey: true });
  await ui.frames();
  assert.equal(await oneCursor(ui, "zoom out"), "b", "back on the item you came from");
  await search(ui, "nothing-matches-this");
  assert.equal(ui.ol().rows.length, 0);
  await oneCursor(ui, "zero results");
  const before = revision(ui);
  await ui.act(() => ui.tree().dispatchEvent(new window.KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true })));
  assert.equal(revision(ui), before, "no rows, no target: Space changes nothing");
  await search(ui, "");
  assert.equal(await oneCursor(ui, "search cleared"), "b");
  await ui.unmount();
});

/* ───────────── Self-inverse commands keep the target ───────────── */

test("Space×2 on a row returns the document and keeps the target; so do ⌘↵, ⇧⌘C and the heading chord", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const start = content(ui.value());
  await ui.select("a2");
  const chords = [
    ["Space", " ", {}],
    ["⌘↵", "Enter", { metaKey: true }],
    ["⇧⌘C", "c", { metaKey: true, shiftKey: true, code: code("c") }],
    ["⌥⌘1", "1", { metaKey: true, altKey: true, code: code("1") }],
  ];
  for (const [name, key, init] of chords) {
    await ui.key(key, init);
    assert.notDeepEqual(content(ui.value()), start, `${name} changed the row`);
    assert.deepEqual(ui.selection(), ["a2"], `${name}: the row is still the target`);
    assert.equal(await oneCursor(ui, name), "a2");
    await ui.key(key, init);
    assert.deepEqual(content(ui.value()), start, `${name} twice: back where it started`);
    assert.deepEqual(ui.selection(), ["a2"], `${name} twice: still the target`);
  }
  await ui.unmount();
});

test("Space×2 on a range: uniform ranges round-trip, a mixed range completes all then reopens all; a recurring task advances once per Space", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a1");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key(" ");
  assert.deepEqual(["a1", "a2", "a3"].map((id) => done(ui, id)), [true, true, true]);
  assert.deepEqual(ui.selection().sort(), ["a1", "a2", "a3"], "the range is still the target");
  await ui.key(" ");
  assert.deepEqual(["a1", "a2", "a3"].map((id) => done(ui, id)), [false, false, false], "uniform: back");
  // Mixed: a2 alone first, then the range.
  await ui.select("a2");
  await ui.key(" ");
  await ui.select("a1");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key(" ");
  assert.deepEqual(["a1", "a2", "a3"].map((id) => done(ui, id)), [true, true, true], "mixed: the first Space completes all");
  await ui.key(" ");
  assert.deepEqual(["a1", "a2", "a3"].map((id) => done(ui, id)), [false, false, false], "the second reopens all");
  await ui.unmount();

  const repeat = await mountOutliner({ defaultValue: [{ id: "r", text: "Standup !(2026-11-02 every day)" }, { id: "s", text: "Other" }] });
  await repeat.select("r");
  await repeat.key(" ");
  assert.equal(find(repeat.value(), "r").text, "Standup !(2026-11-03 every day)", "one Space, one occurrence");
  assert.deepEqual(repeat.selection(), ["r"]);
  await repeat.key(" ");
  assert.equal(find(repeat.value(), "r").text, "Standup !(2026-11-04 every day)", "the next Space advances again (⌘Z goes back)");
  assert.equal(done(repeat, "r"), false, "a recurring task stays open");
  await repeat.unmount();
});

/* ───────────── Linger ───────────── */

test("Hide completed: Space×2 on the last visible row keeps it visible and targeted; leaving hides it; ⌘Z brings it back without lingering", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await hideCompleted(ui);
  await ui.select("d");
  await ui.key(" ");
  assert.equal(done(ui, "d"), true);
  assert.ok(shown(ui).includes("d"), "completed, but still the target: it lingers");
  assert.equal(await oneCursor(ui, "lingering"), "d");
  await ui.key(" ");
  assert.equal(done(ui, "d"), false, "the second Space reopens it");
  assert.ok(shown(ui).includes("d"));
  await ui.key(" ");
  await ui.key("ArrowUp");
  assert.equal(shown(ui).includes("d"), false, "the cursor left: the completed row hides");
  assert.equal(await oneCursor(ui, "left"), "e");
  await ui.key("z", { metaKey: true });
  assert.equal(done(ui, "d"), false, "undo reopened it");
  assert.ok(shown(ui).includes("d"), "and it shows (it matches again)");
  await ui.key("z", { shiftKey: true, metaKey: true });
  assert.equal(done(ui, "d"), true, "redo completes it again");
  assert.equal(shown(ui).includes("d"), false, "redo never re-lingers: it hides");
  assert.equal(await oneCursor(ui, "after redo"), "e", "the cursor stands on the nearest shown row");
  await ui.key("ArrowUp", { shiftKey: true });
  assert.deepEqual(shown(ui).filter((id) => ui.ol().state.selection.has(id)), ["c", "e"], "a range grows from the drawn cursor, not the hidden row");
  await ui.unmount();
});

test("Hide completed: a 3-row range lingers through Space×2, ↓ hides it, ⌘Z restores it; a new query drops linger", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await hideCompleted(ui);
  await ui.select("a1");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key(" ");
  assert.deepEqual(shown(ui).slice(0, 4), ["a", "a1", "a2", "a3"], "all three linger, completed");
  await ui.key(" ");
  await ui.key(" ");
  assert.deepEqual(ui.selection().sort(), ["a1", "a2", "a3"]);
  await ui.key("ArrowDown");
  assert.deepEqual(shown(ui).slice(0, 2), ["a", "b"], "the cursor left: they hide");
  assert.equal(await oneCursor(ui, "after ↓"), "b");
  await ui.key("z", { metaKey: true });
  assert.deepEqual(shown(ui).slice(0, 4), ["a", "a1", "a2", "a3"], "⌘Z: open again, shown");
  assert.deepEqual(ui.selection().sort(), ["a1", "a2", "a3"], "and the range is back");
  // Linger belongs to one filter session.
  await ui.select("c");
  await ui.key(" ");
  assert.ok(shown(ui).includes("c"));
  await search(ui, "Delta");
  assert.equal(shown(ui).includes("c"), false, "a new query: no lingering");
  await search(ui, "");
  assert.equal(shown(ui).includes("c"), false, "and none comes back when it clears");
  await ui.unmount();
});

test("Hide completed: ↓ from a lingering completed parent into its children keeps the parent until the cursor leaves it", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await hideCompleted(ui);
  await ui.select("a");
  await ui.key(" ");
  assert.equal(done(ui, "a"), true);
  await ui.key("ArrowDown");
  assert.deepEqual(shown(ui).slice(0, 2), ["a", "a1"], "the parent stays: its child is the target");
  assert.equal(await oneCursor(ui, "into the children"), "a1");
  await ui.key("ArrowDown");
  await ui.key("ArrowDown");
  assert.equal(await oneCursor(ui, "last child"), "a3");
  await ui.key("ArrowDown");
  assert.equal(shown(ui).includes("a"), false, "out of its subtree: the completed parent hides, with its children");
  assert.equal(await oneCursor(ui, "left the subtree"), "b");
  await ui.unmount();
});

test("Hide completed: a range that spans a hidden row acts on what is shown and never brings the hidden row back", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await hideCompleted(ui);
  await ui.select("a2");
  await ui.key(" ");
  await ui.key("ArrowDown");
  assert.deepEqual(shown(ui).slice(0, 3), ["a", "a1", "a3"], "a2 is done and hidden");
  await ui.key("ArrowUp", { shiftKey: true });
  await ui.key(" ");
  assert.equal(done(ui, "a1") && done(ui, "a3"), true, "the shown rows of the range completed");
  assert.deepEqual(shown(ui).slice(0, 3), ["a", "a1", "a3"], "they linger; the hidden a2 stays hidden");
  await ui.unmount();
});

test("search: an edited match stays until the cursor leaves; a completed parent of a lingering row keeps the path", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await search(ui, "gam");
  assert.deepEqual(shown(ui), ["c", "e"]);
  await ui.edit("c");
  await ui.act(() => ui.ol().dispatch({ type: "text", id: "c", text: "Changed", time: Date.now() }));
  assert.deepEqual(shown(ui), ["c", "e"], "no longer a match, still the row being edited");
  await ui.key("Escape");
  assert.equal(await oneCursor(ui, "row mode"), "c");
  await ui.key("ArrowDown");
  assert.deepEqual(shown(ui), ["e"], "the cursor left: it goes");
  await search(ui, "");
  await hideCompleted(ui);
  await ui.select("b");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key(" ");
  assert.equal(done(ui, "b") && done(ui, "b1"), true);
  assert.deepEqual(shown(ui).slice(shown(ui).indexOf("b"), shown(ui).indexOf("b") + 3), ["b", "b1", "b2"], "the completed parent stays, so its rows keep their path");
  await ui.unmount();
});

test("flat results: a lingering row keeps its place", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await search(ui, "gam");
  await ui.act(() => ui.ol().setView((view) => ({ ...view, searchMode: "flat" })));
  assert.deepEqual(shown(ui), ["c", "e"]);
  await ui.edit("c");
  await ui.act(() => ui.ol().dispatch({ type: "text", id: "c", text: "Changed", time: Date.now() }));
  assert.deepEqual(shown(ui), ["c", "e"], "still first, though it no longer matches");
  await ui.unmount();
});

/* ───────────── Paste and delete move the target on purpose ───────────── */

test("delete a range: the cursor lands on the next survivor; ⌘Z restores range and cursor; ⇧⌘Z repeats it", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a1");
  await ui.key("ArrowDown", { shiftKey: true });
  await ui.key("Backspace");
  assert.deepEqual(kids(ui.value(), "a"), ["a3"]);
  assert.deepEqual(ui.selection(), ["a3"], "next visible survivor");
  assert.equal(await oneCursor(ui, "deleted"), "a3");
  await ui.key("z", { metaKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a2", "a3"]);
  assert.deepEqual(ui.selection().sort(), ["a1", "a2"], "the range is back");
  assert.equal(await oneCursor(ui, "undone"), "a2", "with its cursor");
  await ui.key("z", { metaKey: true, shiftKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a3"], "redo deletes them again");
  await ui.unmount();
});

test("paste in row mode targets what was pasted: Tab then indents the pasted rows", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("c");
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  paste.clipboardData = { getData: (type) => (type === "text/plain" ? "Pasted one\nPasted two" : ""), types: ["text/plain"], files: [] };
  await ui.act(() => document.dispatchEvent(paste));
  const roots = kids(ui.value());
  const at = roots.indexOf("c");
  const pasted = roots.slice(at + 1, at + 3);
  assert.deepEqual(pasted.map((id) => find(ui.value(), id).text), ["Pasted one", "Pasted two"]);
  assert.deepEqual(ui.selection().sort(), [...pasted].sort(), "the pasted rows are the target");
  await ui.key("Tab");
  assert.deepEqual(kids(ui.value(), "c"), pasted, "Tab indented the pasted rows under c");
  await ui.unmount();
});

/* ───────────── Esc ladder, paging ───────────── */

test("Esc ladder: a range collapses to its cursor, the next Esc clears the search filter", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await search(ui, "e");
  const rows = shown(ui);
  await ui.select(rows[1]);
  await ui.key("ArrowDown", { shiftKey: true });
  const visibleSelection = () => shown(ui).filter((id) => ui.ol().state.selection.has(id));
  assert.equal(visibleSelection().length, 2, "two shown rows in the range");
  const cursor = await oneCursor(ui, "range");
  await ui.key("Escape");
  assert.deepEqual(ui.selection(), [], "the range collapsed");
  assert.equal(await oneCursor(ui, "collapsed"), cursor, "onto its cursor");
  assert.equal(ui.ol().view.query, "e", "the filter stays for now");
  await ui.key("Escape");
  assert.equal(ui.ol().view.query, "", "the next Esc clears the search");
  assert.equal(await oneCursor(ui, "search cleared"), cursor);
  await ui.unmount();
});

test("PageDown / PageUp move the cursor a page; ⇧ extends", async () => {
  const many = Array.from({ length: 40 }, (_, i) => ({ id: `r${i}`, text: `Row ${i}` }));
  const ui = await mountOutliner({ defaultValue: many });
  await ui.select("r0");
  await ui.key("PageDown");
  const first = await oneCursor(ui, "page down");
  assert.ok(Number(first.slice(1)) > 1, `moved a page (${first})`);
  assert.deepEqual(ui.selection(), [first]);
  await ui.key("PageDown", { shiftKey: true });
  assert.ok(ui.selection().length > 2, "⇧PageDown extends the range");
  await ui.key("PageUp");
  assert.equal(await oneCursor(ui, "page up"), first);
  await ui.key("End");
  await ui.key("PageDown");
  assert.equal(await oneCursor(ui, "clamped"), "r39", "never past the last row");
  await ui.unmount();
});

/* ───────────── Touch ───────────── */

test("touch: after Complete in selection mode, selection mode closes (as before); moves keep it", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.act(() => ui.ol().dispatch({ type: "select", id: "a1" }));
    await ui.act(() => ui.ol().dispatch({ type: "select", id: "a2", toggle: true }));
    const bar = () => document.querySelector('[role=toolbar][aria-label="Selection actions"]');
    assert.ok(bar(), "selection mode: the bar is up");
    await ui.act(() => bar().querySelector('[aria-label="Indent"]').click());
    assert.deepEqual(ui.selection().sort(), ["a1", "a2"], "a move keeps the selection");
    await ui.act(() => bar().querySelector('[aria-label="Complete"]').click());
    await ui.frames();
    assert.equal(done(ui, "a1") && done(ui, "a2"), true);
    assert.deepEqual(ui.selection(), [], "a one-shot action ends selection mode");
    assert.equal(marks(ui).length, 0, "touch draws no keyboard cursor");
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});

test("desktop: the same bulk Complete keeps the range (the keyboard target)", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a1");
  await ui.key("ArrowDown", { shiftKey: true });
  const bar = document.querySelector('[role=toolbar][aria-label="Selection actions"]');
  await ui.act(() => bar.querySelector('[aria-label="Complete"]').click());
  assert.deepEqual(ui.selection().sort(), ["a1", "a2"]);
  await ui.unmount();
});
