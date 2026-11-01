// Edge cases: paste inside a mirror selects the copy pasted into, a
// drag between two mirrors follows the rescue rule, a cut + paste move keeps its history stamps,
// HTML export keeps internal links as links, "Move to…" reports what moved, a veto speaks once,
// and the phone palette (no desktop key footer, "Move to…" for the cursor row).
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, core, mirrors, interchange, hook, controlled;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  core = await load("@fux/core");
  mirrors = await load("/src/registry/outliner/mirrors.ts");
  interchange = await load("/src/registry/outliner/interchange.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
  controlled = await load("/src/registry/outliner/controlled-outline.ts");
});
after(() => vite?.close());

const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const kids = (nodes, id) => (find(nodes, id)?.children ?? []).map((n) => n.id);
const allIds = (nodes) => nodes.flatMap((n) => [n.id, ...allIds(n.children ?? [])]);
const twoMirrors = () => [
  { id: "src", text: "Rollout", children: [{ id: "a", text: "Dogfood" }, { id: "b", text: "GA", children: [{ id: "b1", text: "Flag" }] }, { id: "c", text: "Partners" }] },
  { id: "one", text: "Comms", children: [{ id: "m1", text: "", data: { mirrorOf: "src" } }] },
  { id: "two", text: "Board", children: [{ id: "m2", text: "", data: { mirrorOf: "src" } }] },
  { id: "other", text: "Other", children: [{ id: "o1", text: "Other child" }] },
  { id: "om", text: "", data: { mirrorOf: "other" } },
];

/* The editor loop exactly as useOutliner runs it: core reducer + stamping + the mirror rule. */
function editor(nodes, { isLocked } = {}) {
  const options = { readOnly: false, isLocked, historyLimit: 50, typingGroupMs: 900 };
  const loaded = mirrors.syncMirrors(null, nodes).nodes;
  let state = controlled.initOutlineState(core.createOutlineEditorState(loaded, { expandedIds: new Set(allIds(loaded)) }));
  const afterEdit = hook.outlinerAfterEdit(isLocked);
  return {
    act(action) {
      state = controlled.stepOutline(state, action, options, false, 0, afterEdit).state;
      return state.editor;
    },
    get nodes() {
      return state.editor.nodes;
    },
  };
}

/* ───────────── Drag between two mirrors of the same source ───────────── */

test("mirror: a drag from one mirror into ANOTHER mirror of the same source moves the source item (nothing lost or duplicated)", () => {
  // Both orders matter: before the fix, whichever mirror came first in the document won.
  for (const [from, into] of [["m1", "m2"], ["m2", "m1"]]) {
    const ed = editor(twoMirrors());
    // Drop m1~a (Dogfood, shown in the first mirror) at the end of the second mirror.
    const state = ed.act({ type: "drop", ids: [`${from}~a`], parentId: into, index: 3 });
    assert.equal(state.refusal, null);
    assert.deepEqual(kids(ed.nodes, "src"), ["b", "c", "a"], `${from} → ${into}: the source item moved, keeping its id`);
    assert.deepEqual(kids(ed.nodes, "m1"), ["m1~b", "m1~c", "m1~a"]);
    assert.deepEqual(kids(ed.nodes, "m2"), ["m2~b", "m2~c", "m2~a"]);
    assert.deepEqual(kids(ed.nodes, "m1~b"), ["m1~b1"], "descendants are untouched");
    assert.equal(core.validateOutline(ed.nodes).length, 0, "no duplicate ids");
    assert.ok(state.selection.size === 0 || [...state.selection].every((id) => find(ed.nodes, id)), "selection never dangles");
    ed.act({ type: "undo" });
    assert.deepEqual(kids(ed.nodes, "src"), ["a", "b", "c"], "one undo step");
  }
});

test("mirror: a drag between mirrors lands at the matching position, inside a copy too", () => {
  const ed = editor(twoMirrors());
  // m1~c into m2's copy of b (as b's first child): the source c becomes b's first child.
  ed.act({ type: "drop", ids: ["m1~c"], parentId: "m2~b", index: 0 });
  assert.deepEqual(kids(ed.nodes, "src"), ["a", "b"]);
  assert.deepEqual(kids(ed.nodes, "b"), ["c", "b1"]);
  assert.deepEqual(kids(ed.nodes, "m1~b"), ["m1~c", "m1~b1"]);
});

test("mirror: a copy dragged into a mirror of a DIFFERENT source moves the item there (id kept)", () => {
  const ed = editor(twoMirrors());
  ed.act({ type: "drop", ids: ["m1~a"], parentId: "om", index: 0 });
  assert.deepEqual(kids(ed.nodes, "src"), ["b", "c"], "it left its source");
  assert.deepEqual(kids(ed.nodes, "other"), ["a", "o1"], "and joined the other mirror's source, same id");
  assert.deepEqual(kids(ed.nodes, "om"), ["om~a", "om~o1"]);
  assert.equal(core.validateOutline(ed.nodes).length, 0);
});

test("mirror: a drag between mirrors respects a locked source item", () => {
  const ed = editor(twoMirrors(), { isLocked: (node) => node.id === "a" });
  const state = ed.act({ type: "drop", ids: ["m1~a"], parentId: "m2", index: 3 });
  assert.equal(state.refusal, "locked");
  assert.deepEqual(kids(ed.nodes, "src"), ["a", "b", "c"], "nothing moved");
});

/* ───────────── Paste inside a mirror selects the copy ───────────── */

test("paste: pasting inside a mirror selects the copy pasted into, not the source far away", async () => {
  const view = await mountHook({ defaultValue: twoMirrors() });
  const json = interchange.exportOutline([{ id: "fresh", text: "Pasted" }], "json");
  await view.run((ol) => ol.commands.importJSON(json, "m2~a"));
  const nodes = view.record.ol.state.nodes;
  assert.deepEqual(kids(nodes, "src"), ["a", "fresh", "b", "c"], "the item lives at the source");
  assert.deepEqual([...view.record.ol.state.selection], ["m2~fresh"], "the copy in the mirror you were working in is selected");
  // Outside a mirror nothing changes: the pasted item itself.
  await view.run((ol) => ol.commands.importJSON(interchange.exportOutline([{ id: "z", text: "Z" }], "json"), "o1"));
  assert.deepEqual([...view.record.ol.state.selection], ["z"]);
  await view.unmount();
});

/* ───────────── Cut + paste is a move: history stamps survive ───────────── */

test("history: a cut + paste MOVE keeps createdAt and is not 'changed'; a second paste is new content", async () => {
  const old = Date.now() - 30 * 86_400_000;
  const view = await mountHook({
    defaultValue: [
      { id: "p", text: "Parent" },
      { id: "k", text: "Keep me", data: { createdAt: old }, children: [{ id: "k1", text: "child" }] },
      { id: "q", text: "Target" },
    ],
  });
  const json = view.record.ol.commands.exportAs("json", ["k"]);
  await view.run((ol) => ol.commands.remove(["k"]));
  await view.run((ol) => ol.commands.importJSON(json, "q"));
  const moved = find(view.record.ol.state.nodes, "k");
  assert.ok(moved, "the id came back (a move)");
  assert.equal(moved.data.createdAt, old, "created when it was created, not now");
  assert.equal(moved.data.editedAt, undefined, "a move is not an edit");
  assert.equal(find(view.record.ol.state.nodes, "k1").data?.editedAt, undefined, "nor for its children");
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "changed:today" })));
  assert.deepEqual([...view.record.ol.search.matchedIds], [], "Recently changed does not list a moved item");
  await view.run((ol) => ol.setView((v) => ({ ...v, query: "" })));
  await view.run((ol) => ol.commands.importJSON(json, "q"));
  const copies = view.record.ol.state.nodes.filter((n) => n.text === "Keep me");
  const copy = copies.find((n) => n.id !== "k");
  assert.ok(copy, "the second paste is a copy with a fresh id");
  assert.ok(typeof copy.data.editedAt === "number", "and a copy is new content (stamped)");
  await view.unmount();
});

/* ───────────── HTML export keeps internal links ───────────── */

test("html: an internal [[label|id]] link exports as a link labelled with the target's title", () => {
  const html = interchange.exportOutlineHtml(
    [{ id: "x", text: "See [[Old label|t-1]] and [[Other|doc/t-2]]" }],
    (id) => (id === "t-1" ? "Current title" : null),
  );
  assert.match(html, /<a href="#t-1">Current title<\/a>/);
  assert.match(html, /<a href="#doc%2Ft-2">Other<\/a>/, "a cross-document id is encoded; the stored label is the fallback");
  assert.ok(!/<a href="#[^"]*"[^>]*on/i.test(html), "nothing executable");
});

/* ───────────── Move to… reports what moved ───────────── */

test("move to: returns how many top-level items moved (0 when refused), so the UI can confirm it", async () => {
  const view = await mountHook({ defaultValue: [{ id: "a", text: "A", children: [{ id: "a1", text: "A1" }] }, { id: "b", text: "B" }, { id: "c", text: "C" }], isLocked: (n) => n.id === "c" });
  let count;
  await view.run((ol) => (count = ol.commands.moveTo(["a", "a1"], "b")));
  assert.equal(count, 1, "a1 moves with a: one item");
  assert.deepEqual(kids(view.record.ol.state.nodes, "b"), ["a"]);
  await view.run((ol) => (count = ol.commands.moveTo(["c"], "b")));
  assert.equal(count, 0, "a locked item refuses");
  await view.unmount();
});

/* ───────────── The component: one live channel for a veto; the phone palette ───────────── */

test("veto: the notice is spoken once (the toast region), not also by the outliner's live region", async () => {
  let reject;
  const ui = await mountOutliner({ value: [{ id: "a", text: "Alpha" }], onValueChange: (_n, meta) => (reject = meta.reject) });
  await ui.act(() => ui.handle.current.focusItem("a"));
  await ui.act(() => ui.ol().commands.toggleComplete(["a"]));
  await ui.act(() => reject());
  assert.doesNotMatch(ui.live(), /not accepted/, "the outliner's polite region stays out of it");
  await ui.unmount();
});

test("phone palette: no desktop key footer, and 'Move to…' is offered for the cursor row with no selection", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta" }] });
    // A tap selected Beta earlier and the selection was then cleared: Beta is the cursor row.
    await ui.act(() => ui.ol().dispatch({ type: "select", id: "b" }));
    await ui.act(() => ui.ol().dispatch({ type: "clear-selection" }));
    assert.equal(ui.ol().state.selection.size, 0);
    await ui.act(() => document.querySelector("[data-slot=outliner]").dispatchEvent(new window.KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true })));
    const dialog = document.querySelector("[role=dialog]");
    assert.ok(dialog, "the palette is open");
    assert.doesNotMatch(dialog.textContent, /navigate/, "no ↑↓ navigate / ↵ select / Esc close footer on touch");
    const items = [...dialog.querySelectorAll("[cmdk-item]")].map((item) => item.textContent.trim());
    assert.ok(items.some((text) => /Move to…/.test(text)), "Move to… is there for the cursor row");
    assert.ok([...dialog.querySelectorAll("[cmdk-group-heading]")].some((h) => /Item · Beta/.test(h.textContent)), "named after that row");
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});

/* ───────────── Harness ───────────── */

let React, act, createRoot;
const media = {};
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "FocusEvent", "CustomEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMParser"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = (query) => ({ matches: !!media[query], media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollTo ??= function () {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.scrollTo = globalThis.scrollTo = () => {};
  globalThis.CSS = { escape: (value) => String(value).replace(/["\\]/g, "\\$&"), supports: () => false };
  const error = console.error;
  console.error = (...args) => (/not wrapped in act|DialogContent|aria-describedby/.test(String(args[0])) ? undefined : error(...args));
  const warn = console.warn;
  console.warn = (...args) => (/DialogContent|Description/.test(String(args[0])) ? undefined : warn(...args));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}

async function mountHook(props) {
  await domEnv();
  const record = { ol: null };
  function Probe() {
    record.ol = hook.useOutliner(props);
    return null;
  }
  const r = createRoot(window.document.createElement("div"));
  await act(async () => r.render(React.createElement(Probe)));
  return { record, run: (fn) => act(async () => void fn(record.ol)), unmount: () => act(async () => r.unmount()) };
}

async function mountOutliner(props) {
  await domEnv();
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  await act(async () => r.render(React.createElement(TooltipProvider, null, React.createElement(Outliner, { ...props, ref: handle }))));
  const ol = () => controllerOf(container);
  return {
    container,
    handle,
    ol,
    act: (fn) => act(async () => void fn()),
    live: () => container.querySelector("[data-slot=outliner] > [aria-live=polite]")?.textContent ?? "",
    unmount: async () => {
      await act(async () => r.unmount());
      container.remove();
    },
  };
}

/** The outliner's controller, read from React's fiber of its root element (test-only access). */
function controllerOf(container) {
  const el = container.querySelector("[data-slot=outliner]");
  const key = Object.keys(el).find((k) => k.startsWith("__reactFiber"));
  for (let fiber = el[key]; fiber; fiber = fiber.return) {
    const value = fiber.memoizedProps?.value;
    if (value?.ol?.commands) return value.ol;
  }
  throw new Error("no outliner context above the root");
}
