// Machine View contract tests. No test framework: `node --test` plus Vite's own SSR loader,
// so `@fux/core` and `@/` resolve exactly as in the app.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
});
after(() => vite?.close());

const doc = (label) => ({ version: 1, rootId: "m", machines: [{ id: "m", label, initialId: "a", nodes: [{ id: "a", label: "A", kind: "atomic" }], transitions: [] }] });
const rename = (d, label) => ({ ...d, machines: [{ ...d.machines[0], label }] });

async function contract() {
  const core = await load("@fux/core");
  const c = await load("/src/registry/machine-view/controlled-document.ts");
  return { ...core, ...c };
}

test("cloning host: every edit is ONE undo step, and undo/redo still work", async () => {
  const { initDocumentState, propose, reconcile, commitMachineHistory, createMachineHistory, undoMachineHistory, redoMachineHistory } = await contract();
  const d0 = doc("v0");
  let state = initDocumentState(d0, createMachineHistory(d0));
  let prop = d0;
  let id = 1;
  const answer = (reason, target) => {
    state = propose(state, target, { reason }, true, id++);
    prop = structuredClone(target.present); // the host clones what it is given
    const r = reconcile(state, prop, true);
    assert.equal(r.outcome, "echo");
    state = r.state;
  };
  answer("edit", commitMachineHistory(state.history, rename(state.history.present, "v1")));
  answer("edit", commitMachineHistory(state.history, rename(state.history.present, "v2")));
  assert.equal(state.history.past.length, 2, "two edits, two steps (a clone is not an extra step)");
  assert.equal(state.history.present, prop, "present is the host's object");
  answer("undo", undoMachineHistory(state.history));
  assert.equal(state.history.present.machines[0].label, "v1");
  assert.equal(state.history.future.length, 1, "an echoed undo keeps the redo stack");
  answer("redo", redoMachineHistory(state.history));
  assert.equal(state.history.present.machines[0].label, "v2");
  assert.equal(state.history.past.length, 2);
});

test("rejecting host: an explicit reject drops the proposal (and what was chained on it); an unchanged prop is not an answer", async () => {
  const { initDocumentState, propose, reconcile, reject, latestHistory, commitMachineHistory, createMachineHistory } = await contract();
  const d0 = doc("v0");
  let state = initDocumentState(d0, createMachineHistory(d0));
  state = propose(state, commitMachineHistory(state.history, rename(d0, "v1")), { reason: "edit" }, true, 1);
  state = propose(state, commitMachineHistory(latestHistory(state), rename(d0, "v2")), { reason: "edit" }, true, 2);
  const same = reconcile(state, d0, true);
  assert.equal(same.outcome, "none", "the host keeping its prop has not answered yet");
  assert.equal(same.state.pending.length, 2);
  const r = reject(state, 1);
  assert.deepEqual(r.dropped.map((p) => p.id), [1, 2], "the veto drops the proposal and the one built on it");
  assert.equal(r.state.pending.length, 0);
  assert.equal(r.state.history.present, d0);
  assert.equal(r.state.history.past.length, 0, "no phantom undo step");
  assert.equal(reject(r.state, 1).state, r.state, "a late reject of an answered proposal is a no-op");
});

test("late echo (server round trip): undo stays an undo, and edits in flight chain", async () => {
  const { initDocumentState, propose, reconcile, latestHistory, commitMachineHistory, createMachineHistory, undoMachineHistory } = await contract();
  const d0 = doc("v0");
  let state = initDocumentState(d0, createMachineHistory(d0));
  let id = 1;
  const send = (reason, target) => {
    state = propose(state, target, { reason }, true, id++);
    return target.present;
  };
  // Two edits before the first echo arrives.
  const p1 = send("edit", commitMachineHistory(latestHistory(state), rename(latestHistory(state).present, "v1")));
  const p2 = send("edit", commitMachineHistory(latestHistory(state), rename(latestHistory(state).present, "v2")));
  for (let render = 0; render < 3; render++) assert.equal(reconcile(state, state.prop, true).outcome, "none", "renders without an answer change nothing");
  let r = reconcile(state, structuredClone(p1), true);
  assert.equal(r.outcome, "echo");
  assert.equal(r.state.pending.length, 1, "the second edit is still in flight");
  state = r.state;
  state = reconcile(state, structuredClone(p2), true).state;
  assert.equal(state.history.past.length, 2);
  assert.equal(state.pending.length, 0);
  // Undo, answered two renders late.
  const u = send("undo", undoMachineHistory(latestHistory(state)));
  state = reconcile(state, state.prop, true).state;
  state = reconcile(state, state.prop, true).state;
  r = reconcile(state, structuredClone(u), true);
  assert.equal(r.outcome, "echo", "a late undo echo is the undo, not a new external step");
  assert.equal(r.state.history.present.machines[0].label, "v1");
  assert.equal(r.state.history.future.length, 1, "redo survives");
  assert.equal(r.state.history.past.length, 1);
});

test("external document: one step that supersedes proposals in flight; a content-equal copy of the present: none", async () => {
  const { initDocumentState, propose, reconcile, commitMachineHistory, createMachineHistory } = await contract();
  const d0 = doc("v0");
  const state = initDocumentState(d0, createMachineHistory(d0));
  const copy = reconcile(state, structuredClone(d0), true);
  assert.equal(copy.outcome, "none");
  assert.equal(copy.state.history.past.length, 0);
  const pending = propose(state, commitMachineHistory(state.history, rename(d0, "mine")), { reason: "edit" }, true, 7);
  const ext = reconcile(pending, doc("server"), true);
  assert.equal(ext.outcome, "external");
  assert.equal(ext.state.history.past.length, 1);
  assert.deepEqual(ext.dropped.map((p) => p.id), [7]);
});

test("uncontrolled: edits commit at once", async () => {
  const { initDocumentState, propose, commitMachineHistory, createMachineHistory } = await contract();
  const d0 = doc("v0");
  let state = initDocumentState(d0, createMachineHistory(d0));
  state = propose(state, commitMachineHistory(state.history, rename(d0, "v1")), { reason: "edit" }, false);
  assert.equal(state.history.past.length, 1);
  assert.equal(state.pending.length, 0);
});

test("two views on one page: unique SVG marker ids and node descriptions", async () => {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const { MachineView } = await load("/src/registry/machine-view/machine-view.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const d = doc("Two views");
  const view = () => React.createElement(MachineView, { defaultDocument: d });
  const html = renderToString(React.createElement(TooltipProvider, null, React.createElement("div", null, view(), view())));
  const markers = [...html.matchAll(/<marker id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(markers.length, 4, "two markers per view");
  assert.equal(new Set(markers).size, 4, `marker ids are unique: ${markers.join(", ")}`);
  const helps = [...html.matchAll(/id="(mv-[^"]+-help-state)"/g)].map((m) => m[1]);
  assert.equal(new Set(helps).size, 2, "each view has its own node descriptions");
});

test("toolbar placement: pans to a clean slot instead of covering", async () => {
  const { placeToolbar } = await load("/src/registry/machine-view/machine-viewport.ts");
  // A node hugging the band's top edge; the slot above it is outside the band, the slots
  // beside and below are covered by chips (obstacles).
  const scene = {
    node: { x0: 100, y0: 20, x1: 260, y1: 70 },
    head: 34,
    size: { w: 90, h: 32 },
    band: { x0: 10, y0: 10, x1: 380, y1: 600 },
    canvas: { w: 390, h: 610 },
    direction: "LR",
    obstacles: [
      { box: { x0: 0, y0: 70, x1: 390, y1: 120 }, weight: 1.5 },
      { box: { x0: 260, y0: 0, x1: 390, y1: 70 }, weight: 1.5 },
      { box: { x0: 0, y0: 0, x1: 100, y1: 70 }, weight: 1.5 },
    ],
  };
  const placed = placeToolbar(scene);
  assert.ok(placed);
  assert.equal(placed.side, "top");
  assert.equal(placed.cost, 0);
  assert.ok(placed.pan.dy > 0, "the camera pans down to make room above");
  // With room above, no pan.
  const roomy = placeToolbar({ ...scene, node: { x0: 100, y0: 200, x1: 260, y1: 250 }, obstacles: [] });
  assert.deepEqual(roomy.pan, { dx: 0, dy: 0 });
});

test("auto direction picks by resulting zoom, not graph shape", async () => {
  const { pickDirection } = await load("/src/registry/machine-view/layout.ts");
  assert.equal(pickDirection(1, 1), "LR", "both readable: left-to-right");
  assert.equal(pickDirection(0.95, 1), "LR", "LR readable wins even if TB is larger");
  assert.equal(pickDirection(0.6, 0.92), "TB", "only TB readable");
  assert.equal(pickDirection(0.46, 0.77), "TB", "neither readable: the more readable one (incident)");
  assert.equal(pickDirection(0.7, 0.74), "LR", "close call keeps left-to-right");
});

/* ───────── Hook level: the React wiring, rendered for real (jsdom + react-dom/client) ───────── */

let React;
let act;
let createRoot;
/** A browser-like global environment for react-dom/client. jsdom is a dev dependency of the repo root. */
async function domEnv() {
  if (!createRoot) {
    const { JSDOM } = await import("jsdom");
    const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
    for (const key of ["window", "document", "HTMLElement", "HTMLIFrameElement", "Node", "Element", "Event", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"])
      Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
    Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} };
    window.ResizeObserver ??= globalThis.ResizeObserver;
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    React = await import("react");
    act = React.act;
    ({ createRoot } = await import("react-dom/client"));
  }
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Mounts `useHook(props)` in a real React root. `respond(next, meta, setDocument)` plays the host
 * (controlled when `controlled`); returns live accessors plus the host's own record.
 */
async function mountHost(useHook, { controlled = true, respond = () => {}, initial = doc("v0"), extra = {} } = {}) {
  await domEnv();
  const record = { proposals: [], hook: null, setDocument: null };
  function Host() {
    const [document, setDocument] = React.useState(initial);
    record.setDocument = setDocument;
    const onDocumentChange = (next, meta) => {
      record.proposals.push({ next, meta });
      return respond(next, meta, setDocument);
    };
    record.hook = useHook(controlled ? { document, onDocumentChange, ...extra } : { defaultDocument: initial, onDocumentChange, ...extra });
    return null;
  }
  const container = window.document.createElement("div");
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Host)));
  return { record, get hook() { return record.hook; }, unmount: () => act(async () => root.unmount()) };
}

async function documentHook() {
  const { useControlledDocument } = await load("/src/registry/machine-view/use-controlled-document.ts");
  const core = await load("@fux/core");
  return { useControlledDocument, ...core };
}
const label = (d) => d.machines[0].label;

test("hook: cloning host commits each edit as one step; undo/redo round-trip", async () => {
  const { useControlledDocument, commitMachineHistory } = await documentHook();
  const view = await mountHost((s) => useControlledDocument(s), { respond: (next, _m, set) => set(structuredClone(next)) });
  const edit = (l) => act(async () => view.hook.propose(commitMachineHistory(view.hook.latest(), rename(view.hook.latest().present, l)), { reason: "edit" }));
  await edit("v1");
  await edit("v2");
  assert.equal(label(view.hook.document), "v2");
  assert.equal(view.hook.history.past.length, 2);
  const { undoMachineHistory, redoMachineHistory } = await load("@fux/core");
  await act(async () => view.hook.propose(undoMachineHistory(view.hook.latest()), { reason: "undo" }));
  assert.equal(label(view.hook.document), "v1");
  assert.equal(view.hook.history.future.length, 1);
  await act(async () => view.hook.propose(redoMachineHistory(view.hook.latest()), { reason: "redo" }));
  assert.equal(label(view.hook.document), "v2");
  await view.unmount();
});

test("hook: rejecting host (return false, or meta.reject() later) commits nothing and bumps refusals", async () => {
  const { useControlledDocument, commitMachineHistory } = await documentHook();
  const rejected = [];
  let later = null;
  const view = await mountHost((s) => useControlledDocument(s, { onRejected: (meta) => rejected.push(meta.reason) }), {
    respond: (next, meta) => {
      if (label(next) === "sync") return false;
      later = meta.reject;
    },
  });
  await act(async () => view.hook.propose(commitMachineHistory(view.hook.latest(), rename(view.hook.document, "sync")), { reason: "edit" }));
  assert.equal(label(view.hook.document), "v0");
  assert.equal(view.hook.pending, 0);
  assert.equal(view.hook.refusals, 1);
  await act(async () => view.hook.propose(commitMachineHistory(view.hook.latest(), rename(view.hook.document, "async")), { reason: "edit" }));
  assert.equal(view.hook.pending, 1, "pending until the host answers");
  await act(async () => later());
  assert.equal(view.hook.pending, 0);
  assert.equal(view.hook.refusals, 2);
  assert.equal(view.hook.history.past.length, 0);
  assert.deepEqual(rejected, ["edit", "edit"]);
  await view.unmount();
});

test("hook: late echo (one or more renders later) keeps undo an undo and redo alive", async () => {
  const { useControlledDocument, commitMachineHistory, undoMachineHistory, redoMachineHistory } = await documentHook();
  const accepted = [];
  const view = await mountHost((s) => useControlledDocument(s), {
    respond: (next, _m, set) => {
      setTimeout(() => set(structuredClone(next)), 15);
    },
  });
  const send = (target, reason, tag) => act(async () => view.hook.propose(target, { reason }, { onAccept: () => accepted.push(tag) }));
  const wait = () => act(async () => sleep(40));
  await send(commitMachineHistory(view.hook.latest(), rename(view.hook.latest().present, "v1")), "edit", "v1");
  assert.equal(label(view.hook.document), "v0", "still rendering the prop while the server thinks");
  assert.deepEqual(accepted, [], "nothing claims to have happened yet");
  await send(commitMachineHistory(view.hook.latest(), rename(view.hook.latest().present, "v2")), "edit", "v2");
  await wait();
  assert.equal(label(view.hook.document), "v2");
  assert.equal(view.hook.history.past.length, 2, "two edits in flight, two steps");
  assert.deepEqual(accepted, ["v1", "v2"]);
  await send(undoMachineHistory(view.hook.latest()), "undo", "undo");
  await wait();
  assert.equal(label(view.hook.document), "v1");
  assert.equal(view.hook.history.past.length, 1, "the late undo echo is an undo, not a new step");
  assert.equal(view.hook.history.future.length, 1);
  await send(redoMachineHistory(view.hook.latest()), "redo", "redo");
  await wait();
  assert.equal(label(view.hook.document), "v2");
  assert.equal(view.hook.history.past.length, 2);
  await view.unmount();
});

test("hook: listener-only host (defaultDocument + onDocumentChange) keeps every edit and is notified", async () => {
  const { useControlledDocument, commitMachineHistory } = await documentHook();
  const view = await mountHost((s) => useControlledDocument(s), { controlled: false });
  await act(async () => view.hook.propose(commitMachineHistory(view.hook.latest(), rename(view.hook.document, "v1")), { reason: "edit" }));
  assert.equal(view.hook.controlled, false);
  assert.equal(label(view.hook.document), "v1", "the edit is kept");
  assert.equal(view.record.proposals.length, 1, "and the host heard about it");
  assert.equal(label(view.record.proposals[0].next), "v1");
  await view.unmount();
});

test("hook: switching between controlled and uncontrolled warns once in development", async () => {
  const { useControlledDocument } = await documentHook();
  await domEnv();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  try {
    let setControlled;
    function Switcher() {
      const [controlled, set] = React.useState(true);
      setControlled = set;
      useControlledDocument(controlled ? { document: doc("v0") } : { defaultDocument: doc("v0") });
      return null;
    }
    const root = createRoot(window.document.createElement("div"));
    await act(async () => root.render(React.createElement(Switcher)));
    await act(async () => setControlled(false));
    await act(async () => setControlled(true));
    await act(async () => root.unmount());
  } finally {
    console.error = original;
  }
  const switches = errors.filter((e) => e.includes("MachineView") && e.includes("changing from"));
  assert.equal(switches.length, 1, "one warning, not one per render");
  assert.match(switches[0], /controlled to uncontrolled/);
});

test("useMachineView: a vetoed add announces the refusal (never 'Added'); a late host selects the new state only once it exists", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = { version: 1, rootId: "m", machines: [{ id: "m", label: "M", initialId: "a", nodes: [{ id: "a", label: "A", kind: "atomic" }], transitions: [] }] };
  const reject = await mountHost((s) => useMachineView(s), { initial: d, respond: () => false });
  await act(async () => reject.hook.addConnected("a"));
  assert.equal(reject.hook.announcement.trim(), "Change was not accepted.");
  assert.equal(reject.hook.graph.nodes.length, 1);
  assert.equal(reject.hook.selection, null);
  const before = reject.hook.announcement;
  await act(async () => reject.hook.addConnected("a"));
  assert.notEqual(reject.hook.announcement, before, "a repeated refusal still changes the live text, so it is spoken again");
  assert.equal(reject.hook.announcement.trim(), "Change was not accepted.");
  await reject.unmount();

  const late = await mountHost((s) => useMachineView(s), { initial: d, respond: (next, _m, set) => setTimeout(() => set(structuredClone(next)), 15) });
  await act(async () => late.hook.addConnected("a"));
  assert.equal(late.hook.selection, null, "not selected while the host has not answered");
  assert.equal(late.hook.announcement.trim(), "");
  await act(async () => sleep(40));
  assert.equal(late.hook.graph.nodes.length, 2);
  assert.equal(late.hook.selection?.type, "node");
  assert.equal(late.hook.renaming, late.hook.selection.id, "the new state is selected and renaming");
  assert.match(late.hook.announcement, /^Added New state after A/);
  await act(async () => late.hook.undo());
  await act(async () => sleep(40));
  assert.equal(late.hook.graph.nodes.length, 1);
  assert.equal(late.hook.canRedo, true, "redo survives a late undo echo");
  assert.match(late.hook.announcement, /^Undid add a state after A/);
  await late.unmount();

  const listen = await mountHost((s) => useMachineView(s), { initial: d, controlled: false });
  await act(async () => listen.hook.addConnected("a"));
  assert.equal(listen.hook.graph.nodes.length, 2, "listener-only: the edit is kept");
  assert.equal(listen.record.proposals.length, 1);
  await listen.unmount();
});

/* ───────── Simulation tokens: inactive text keeps ≥ 4.5:1, read from the CSS itself ───────── */

test("machine-sim.css: simulation text tokens keep WCAG AA contrast on their surfaces, light and dark", async () => {
  const { readFile } = await import("node:fs/promises");
  const sim = await readFile(new URL("../src/registry/machine-shared/machine-sim.css", import.meta.url), "utf8");
  const theme = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  /** `--name: oklch(L C h)` inside the first block that starts with `selector {`. */
  const token = (css, selector, name) => {
    const at = css.indexOf(`${selector} {`);
    assert.ok(at >= 0, `${selector} block`);
    const block = css.slice(at, css.indexOf("}", at));
    const m = block.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`));
    assert.ok(m, `--${name} in ${selector}`);
    return m.slice(1).map(Number);
  };
  const lin = ([L, C, h]) => {
    const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, v)));
  };
  const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055), dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  /** `color-mix(in srgb, a p, b)`: gamma-encoded sRGB interpolation. */
  const mixSrgb = (a, b, p) => a.map((c, i) => dec(enc(c) * p + enc(b[i]) * (1 - p)));
  const Y = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ratio = (x, y) => { const [hi, lo] = [Y(x), Y(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };
  for (const [scheme, simSel, themeSel] of [["light", ":root", ":root"], ["dark", ".dark", ".dark"]]) {
    const muted = lin(token(sim, simSel, "sim-muted"));
    const card = lin(token(theme, themeSel, "card"));
    const canvas = lin(token(theme, themeSel, "canvas"));
    // --sim-surface for inactive states: color-mix(in srgb, var(--card) 55%, var(--canvas)).
    assert.match(sim, /\[data-sim="inactive"\][^}]*--sim-surface:\s*color-mix\(in srgb, var\(--card\) 55%, var\(--canvas\)\)/, "inactive surface recipe the test models");
    const surface = mixSrgb(card, canvas, 0.55);
    for (const [where, bg] of [["inactive surface", surface], ["canvas", canvas], ["card", card]]) {
      const r = ratio(muted, bg);
      assert.ok(r >= 4.5, `${scheme}: --sim-muted on ${where} is ${r.toFixed(2)}:1, needs 4.5:1`);
    }
    const fg = lin(token(theme, themeSel, "muted-foreground"));
    assert.ok(ratio(fg, card) >= 4.5, `${scheme}: active/ancestor text (--muted-foreground) on card ${ratio(fg, card).toFixed(2)}:1`);
  }
});

/* ───────── Overflow hint: measured against the clear band, not the pane ───────── */

test("overflowSides: content inside the pane but under the peek bar is hidden ('b'); a margin is not", async () => {
  const { overflowSides, OVERFLOW_MIN } = await load("/src/registry/machine-view/machine-viewport.ts");
  // Phone incident: pane 390×815, peek bar from y≈755, so the band ends there. Resolved's
  // bottom is at 835: 20px past the pane (under the old 24px rule) but 80px under the band.
  const band = { x0: 0, y0: 64, x1: 390, y1: 755 };
  assert.equal(overflowSides({ x0: 40, y0: 70, x1: 350, y1: 835 }, band), "b");
  assert.equal(overflowSides({ x0: 40, y0: 70, x1: 350, y1: 755 + OVERFLOW_MIN }, band), "", "a sliver under the band reads as a margin");
  assert.equal(overflowSides({ x0: -200, y0: 20, x1: 600, y1: 700 }, band), "lrt", "every side past the band, top under the palette included");
  assert.equal(overflowSides({ x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }, band), "", "no nodes, no hint");
});

/* ───────── Pending window: every command is built on the newest proposal ───────── */

test("useMachineView, late host: two quick adds before the echo give NEXT then NEXT_2 (distinct ids), and a second Delete is a no-op", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = { version: 1, rootId: "m", machines: [{ id: "m", label: "M", initialId: "a", nodes: [{ id: "a", label: "A", kind: "atomic" }, { id: "b", label: "B", kind: "atomic" }], transitions: [] }] };
  const late = await mountHost((s) => useMachineView(s), { initial: d, respond: (next, _m, set) => setTimeout(() => set(structuredClone(next)), 15) });
  // Same act, same millisecond, nothing echoed yet: the second must see the first.
  await act(async () => {
    assert.equal(late.hook.addConnected("a"), true);
    assert.equal(late.hook.addConnected("a"), true);
  });
  assert.equal(late.hook.pendingChanges, 2, "both proposals are in flight");
  assert.equal(late.hook.graph.transitions.length, 0, "nothing drawn yet");
  await act(async () => sleep(50));
  const events = late.hook.graph.transitions.map((t) => t.event).sort();
  assert.deepEqual(events, ["NEXT", "NEXT_2"]);
  assert.equal(new Set(late.hook.graph.nodes.map((n) => n.id)).size, 4, "two new states with distinct ids");
  assert.equal(late.hook.pendingChanges, 0);
  // Select B, then Delete twice before the echo: the second finds B already gone in the proposal.
  await act(async () => late.hook.setSelection({ type: "node", id: "b" }));
  let second;
  await act(async () => {
    late.hook.deleteSelection();
    second = late.hook.deleteSelection();
  });
  assert.equal(second, false, "the second delete has nothing left to delete");
  assert.equal(late.hook.pendingChanges, 1);
  await act(async () => sleep(50));
  assert.equal(late.hook.graph.nodes.some((n) => n.id === "b"), false);
  await late.unmount();
});

test("useMachineView: a veto is visible (one warning notice), not only announced", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const notices = [];
  const view = await mountHost((s) => useMachineView(s), { initial: doc("v0"), respond: () => false, extra: { onNotice: (n) => notices.push(n) } });
  await act(async () => view.hook.addConnected("a"));
  assert.deepEqual(notices, [{ message: "Change was not accepted", tone: "warning" }]);
  await view.unmount();
});

test("useMachineView: `document` without `onDocumentChange` is read-only (nothing could ever be accepted)", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  await domEnv();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let hook;
  try {
    function Bare() {
      hook = useMachineView({ document: doc("v0") });
      return null;
    }
    const root = createRoot(window.document.createElement("div"));
    await act(async () => root.render(React.createElement(Bare)));
    assert.equal(hook.editable, false);
    await act(async () => root.unmount());
  } finally {
    console.error = original;
  }
  assert.equal(errors.filter((e) => e.includes("without `onDocumentChange`")).length, 1, "one immediate dev warning");
});

/* ───────── Dev contract warnings: both, none, unanswered ───────── */

test("hook: dev warnings for both props, neither prop, and a controlled host that never answers", async () => {
  const { useControlledDocument, UNANSWERED_WARNING_MS, DEV } = await load("/src/registry/machine-view/use-controlled-document.ts");
  const { commitMachineHistory } = await load("@fux/core");
  assert.equal(DEV, true, "tests run as a development build");
  await domEnv();
  const errors = [];
  const original = console.error;
  // Synthetic clock (labelled): the 5 s "unanswered" timer fires at once; every other timer is real.
  const realSetTimeout = window.setTimeout;
  window.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms === UNANSWERED_WARNING_MS ? 0 : ms, ...rest);
  console.error = (...args) => errors.push(args.join(" "));
  try {
    const mount = async (source) => {
      let hook;
      function Probe() {
        hook = useControlledDocument(source);
        return null;
      }
      const root = createRoot(window.document.createElement("div"));
      await act(async () => root.render(React.createElement(Probe)));
      return { get hook() { return hook; }, root };
    };
    const both = await mount({ document: doc("a"), defaultDocument: doc("b"), onDocumentChange: () => {} });
    assert.equal(label(both.hook.document), "a", "`document` wins");
    await act(async () => both.root.unmount());
    const none = await mount({});
    await act(async () => none.root.unmount());
    const silent = await mount({ document: doc("v0"), onDocumentChange: () => {} });
    await act(async () => silent.hook.propose(commitMachineHistory(silent.hook.latest(), rename(silent.hook.document, "v1")), { reason: "edit" }));
    await act(async () => sleep(20));
    await act(async () => silent.root.unmount());
  } finally {
    console.error = original;
    window.setTimeout = realSetTimeout;
  }
  const has = (text) => errors.filter((e) => e.includes("MachineView") && e.includes(text)).length;
  assert.equal(has("both `document` and `defaultDocument`"), 1, "both");
  assert.equal(has("pass `defaultDocument` (uncontrolled) or `document`"), 1, "none");
  assert.equal(has("has not been answered"), 1, "unanswered");
});

/* ───────── CommitInput: a refusal resyncs only the field whose commit it refused ───────── */

test("CommitInput: a refusal elsewhere keeps a draft being typed; the refused field (even focused) snaps back", async () => {
  await domEnv();
  const { CommitInput } = await load("/src/registry/machine-view/inspector-fields.tsx");
  const { MachineContext } = await load("/src/registry/machine-view/machine-context.ts");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  let refusals = 0;
  const commits = [];
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(
          MachineContext.Provider,
          { value: { refusals } },
          React.createElement(CommitInput, { id: "a", value: "Alpha", onCommit: (v) => void commits.push(["a", v]) }),
          React.createElement(CommitInput, { id: "b", value: "Beta", onCommit: (v) => void commits.push(["b", v]) }),
        ),
      ),
    );
  // React tracks the value through the native setter; an `input` event is what typing fires.
  const type = (el, text) => act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, text);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const key = (el, k) => act(async () => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true })));
  await render();
  const [a, b] = container.querySelectorAll("input");
  // A commits (Enter) and stays focused; the host has not answered yet.
  a.focus();
  await type(a, "Alpha 2");
  await key(a, "Enter");
  assert.deepEqual(commits, [["a", "Alpha 2"]]);
  // The user moves on and types in B without committing.
  b.focus();
  await type(b, "Beta draft");
  // The host vetoes A's change.
  refusals = 1;
  await render();
  assert.equal(a.value, "Alpha", "the refused field shows the document again");
  assert.equal(b.value, "Beta draft", "the draft being typed elsewhere survives");
  // B commits with Enter while focused and is refused: it snaps back too.
  await key(b, "Enter");
  refusals = 2;
  await render();
  assert.equal(b.value, "Beta", "a focused field whose own commit was refused resyncs");
  await act(async () => root.unmount());
  container.remove();
});

/* ───────── CommitInput: a slow host's echo never wipes keystrokes typed after a commit ───────── */

test("CommitInput, late host: Enter commits, typing goes on, the late echo keeps the newer text (and an idle field still follows the document)", async () => {
  await domEnv();
  const { CommitInput } = await load("/src/registry/machine-view/inspector-fields.tsx");
  const { MachineContext } = await load("/src/registry/machine-view/machine-context.ts");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  // The "document": what the host has accepted so far. The host answers only when we say so (late).
  let value = "Release v2";
  const commits = [];
  const render = () =>
    act(async () =>
      root.render(
        React.createElement(
          MachineContext.Provider,
          { value: { refusals: 0 } },
          React.createElement(CommitInput, { id: "name", value, onCommit: (v) => void commits.push(v) }),
          React.createElement("button", { id: "elsewhere" }, "elsewhere"),
        ),
      ),
    );
  const type = (el, text) => act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, text);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const key = (el, k) => act(async () => el.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true })));
  await render();
  const input = container.querySelector("input");
  input.focus();
  await type(input, "Release v23");
  await key(input, "Enter");
  assert.deepEqual(commits, ["Release v23"]);
  // The user keeps typing while the host is still thinking…
  await type(input, "Release v23b");
  // …and the echo of the FIRST commit lands now.
  value = "Release v23";
  await render();
  assert.equal(input.value, "Release v23b", "the keystroke typed after the commit survives the echo");
  // The next commit sends the newer text; its echo leaves the field as typed.
  await key(input, "Enter");
  assert.deepEqual(commits, ["Release v23", "Release v23b"]);
  value = "Release v23b";
  await render();
  assert.equal(input.value, "Release v23b");
  // A focused field with nothing new typed still follows an outside change…
  value = "Renamed by a collaborator";
  await render();
  assert.equal(input.value, "Renamed by a collaborator", "focused but idle: resync");
  // …and so does an unfocused one, even after a commit.
  container.querySelector("#elsewhere").focus();
  value = "Renamed again";
  await render();
  assert.equal(input.value, "Renamed again", "unfocused: resync");
  // Esc while typing over a changed document goes back to the document.
  input.focus();
  await type(input, "Draft");
  value = "Server copy";
  await render();
  assert.equal(input.value, "Draft", "typing wins over an outside change while focused");
  await key(input, "Escape");
  assert.equal(input.value, "Server copy", "Esc returns to the document");
  // Esc while this field's own commit is still in flight goes back to THAT text (the last
  // committed), never to the older document value it would show until the echo lands.
  await type(input, "Server copy v4");
  await key(input, "Enter");
  await type(input, "Server copy v4c");
  await key(input, "Escape");
  assert.equal(input.value, "Server copy v4", "Esc mid-flight restores the commit, not the pre-commit value (no flicker)");
  value = "Server copy v4";
  await render();
  assert.equal(input.value, "Server copy v4", "the echo then lands on the same text");
  await act(async () => root.unmount());
  container.remove();
});

test("CommitInput / NodeSelect read-only: values are focusable read-only text (selectable, copyable), never disabled inputs", async () => {
  await domEnv();
  const { CommitInput, NodeSelect } = await load("/src/registry/machine-view/inspector-fields.tsx");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const commits = [];
  await act(async () =>
    root.render(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CommitInput, { id: "name", value: "Release approval", readOnly: true, onCommit: (v) => void commits.push(v) }),
        React.createElement(CommitInput, { id: "guard", value: "", placeholder: "No guard", readOnly: true, onCommit: () => {} }),
        React.createElement(CommitInput, { id: "desc", value: "", placeholder: "What this state means", readOnly: true, multiline: true, onCommit: () => {} }),
        React.createElement(NodeSelect, { id: "initial", value: "draft", readOnly: true, options: [{ id: "draft", label: "Draft" }, { id: "review", label: "Review" }], onChange: () => {} }),
      ),
    ),
  );
  const [name, guard, desc, initial] = container.querySelectorAll("input");
  for (const el of [name, guard, desc, initial]) {
    assert.equal(el.disabled, false, `${el.id} is not disabled`);
    assert.equal(el.readOnly, true, `${el.id} is read-only`);
  }
  assert.equal(name.value, "Release approval");
  assert.equal(initial.value, "Draft", "a picker shows its chosen label as text");
  assert.equal(guard.placeholder, "No guard", "an empty value says so");
  assert.equal(desc.placeholder, "None", "an invitation to type becomes 'None'");
  assert.equal(container.querySelectorAll("button").length, 0, "no picker trigger to open");
  name.focus();
  assert.equal(window.document.activeElement, name, "focusable (so it can be selected and copied)");
  name.select();
  assert.equal(name.selectionEnd - name.selectionStart, "Release approval".length);
  await act(async () => name.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  assert.deepEqual(commits, [], "a read-only field never commits");
  await act(async () => root.unmount());
  container.remove();
});

/* ───────── Controlled read-only viewer: `document` + `readOnly`, no handler ───────── */

test("useMachineView: `document` + `readOnly` is a quiet live viewer (no warning; a new prop renders)", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  await domEnv();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let hook;
  let setDocument;
  try {
    function Viewer() {
      const [document, set] = React.useState(doc("v0"));
      setDocument = set;
      hook = useMachineView({ document, readOnly: true });
      return null;
    }
    const root = createRoot(window.document.createElement("div"));
    await act(async () => root.render(React.createElement(Viewer)));
    assert.equal(hook.editable, false);
    assert.equal(label(hook.document), "v0");
    // The server pushes a new revision: the viewer renders it (no remount, no key).
    await act(async () => setDocument(doc("v1 from the server")));
    assert.equal(label(hook.document), "v1 from the server");
    await act(async () => root.unmount());
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors.filter((e) => e.includes("MachineView")), [], "read-only on purpose: no dev warning");
});

test("types: `document` + `readOnly` (or `editable={false}`) compiles without `onDocumentChange`; a bare `document` (or readOnly={false}) does not; DistributiveOmit wrappers spread", async () => {
  const ts = (await import("typescript")).default;
  const path = await import("node:path");
  const configPath = path.join(root, "tsconfig.json");
  const config = ts.parseJsonConfigFileContent(ts.readConfigFile(configPath, ts.sys.readFile).config, ts.sys, root);
  // A virtual file inside src/ (path aliases resolve as in the app); nothing is written to disk.
  const probe = path.join(root, "src", "__machine-view-type-probe.tsx");
  const source = [
    'import type { MachineDocument } from "@fux/core";',
    'import { MachineView, type DistributiveOmit, type MachineViewProps } from "@/registry/machine-view/machine-view";',
    "declare const doc: MachineDocument;",
    "export const viewer = <MachineView document={doc} readOnly />;",
    "export const controlled = <MachineView document={doc} onDocumentChange={() => {}} />;",
    "export const controlledReadOnly = <MachineView document={doc} onDocumentChange={() => {}} readOnly />;",
    "export const uncontrolled = <MachineView defaultDocument={doc} readOnly />;",
    "export const editableFalse = <MachineView document={doc} editable={false} />;",
    "// @ts-expect-error editable={true} is not a viewer: it still needs onDocumentChange",
    "export const editableTrue = <MachineView document={doc} editable />;",
    "export const Wrapper = (props: DistributiveOmit<MachineViewProps, 'className'>) => <MachineView {...props} className=\"h-full\" />;",
    "export const wrapped = <Wrapper document={doc} readOnly />;",
    "// @ts-expect-error the wrapper keeps the union: a bare document still needs a handler",
    "export const wrappedBare = <Wrapper document={doc} />;",
    "// @ts-expect-error a controlled document needs onDocumentChange, or readOnly to say read-only on purpose",
    "export const unhandled = <MachineView document={doc} />;",
    "// @ts-expect-error readOnly={false} is not a viewer: it still needs onDocumentChange",
    "export const notViewer = <MachineView document={doc} readOnly={false} />;",
    "// @ts-expect-error both value and default",
    "export const both = <MachineView document={doc} defaultDocument={doc} readOnly />;",
  ].join("\n");
  const host = ts.createCompilerHost(config.options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (file, ...rest) => (path.resolve(file) === probe ? ts.createSourceFile(file, source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX) : getSourceFile(file, ...rest));
  const fileExists = host.fileExists.bind(host);
  host.fileExists = (file) => path.resolve(file) === probe || fileExists(file);
  const program = ts.createProgram({ rootNames: [probe], options: { ...config.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined }, host });
  const file = program.getSourceFile(probe);
  const diagnostics = [...program.getSyntacticDiagnostics(file), ...program.getSemanticDiagnostics(file)];
  const text = diagnostics.map((d) => `${d.start !== undefined ? file.getLineAndCharacterOfPosition(d.start).line + 1 : "?"}: ${ts.flattenDiagnosticMessageText(d.messageText, "\n")}`);
  // Every @ts-expect-error must be used (TS2578 otherwise) and every other line must compile.
  assert.deepEqual(text, []);
});

/* ───────── Copy: announcements and notices read as sentences ───────── */

test("useMachineView: a start through an initial pseudo-state announces 'Simulation started — now in …' (never an empty event name)", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const { machineLabCases } = await load("@fux/examples/docs/machine-lab-data");
  const incident = machineLabCases.find((c) => c.id === "incident");
  assert.ok(incident, "the incident example exists");
  const view = await mountHost((s) => useMachineView({ ...s, runtime: incident.options }), { controlled: false, initial: incident.document });
  const spoken = () => view.hook.announcement.replace(/\u00a0/g, "").trim();
  await act(async () => view.hook.start());
  assert.match(spoken(), /^Simulation started — now in \S/, `announced: ${JSON.stringify(spoken())}`);
  assert.doesNotMatch(spoken(), /^:|\s:\s/);
  // Restart says the same thing again (not ": now in").
  await act(async () => view.hook.start());
  assert.match(spoken(), /^Simulation started — now in \S/);
  await view.unmount();
});

test("useMachineView: a direct start names the starting state, and a blocked guard reads like the tree ('DECIDE blocked — guard approved is false')", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = {
    version: 1,
    rootId: "m",
    machines: [{
      id: "m", label: "Release approval", initialId: "draft",
      nodes: [{ id: "draft", label: "Draft", kind: "atomic" }, { id: "pub", label: "Publishing", kind: "atomic" }],
      transitions: [{ id: "t1", sourceId: "draft", targetId: "pub", event: "DECIDE", guard: "approved" }],
    }],
  };
  const notices = [];
  const runtime = { guards: { approved: (_ctx, event) => event.payload?.approved === true } };
  const view = await mountHost((s) => useMachineView({ ...s, runtime }), { controlled: false, initial: d, extra: { onNotice: (n) => notices.push(n) } });
  const spoken = () => view.hook.announcement.replace(/\u00a0/g, "").trim();
  await act(async () => view.hook.start());
  assert.equal(spoken(), "Simulation started — now in Draft", "names the state, never the machine");
  await act(async () => view.hook.sendEvent("DECIDE"));
  assert.equal(spoken(), "DECIDE blocked — guard approved is false");
  assert.equal(notices.at(-1)?.message, "DECIDE blocked — guard approved is false", "the notice and the live region say the same words");
  assert.doesNotMatch(notices.at(-1)?.message, /[“”]|Guard/, "no quoted or capitalised guard");
  await act(async () => view.hook.sendEvent("NOPE"));
  assert.equal(spoken(), "NOPE blocked — no transition handles NOPE here");
  await view.unmount();
});

test("useMachineView: playing a scenario leads with its name and the state it starts in", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = {
    version: 1,
    rootId: "m",
    machines: [{ id: "m", label: "M", initialId: "a", nodes: [{ id: "a", label: "A", kind: "atomic" }, { id: "b", label: "B", kind: "atomic" }], transitions: [{ id: "t1", sourceId: "a", targetId: "b", event: "GO" }] }],
  };
  const scenarios = [{ id: "s", label: "Happy path", events: [{ type: "GO" }], expectedActiveIds: ["b"] }];
  const view = await mountHost((s) => useMachineView(s), { controlled: false, initial: d, extra: { scenarios } });
  const spoken = () => view.hook.announcement.replace(/\u00a0/g, "").trim();
  let done;
  await act(async () => void (done = view.hook.playScenario(scenarios[0])));
  assert.equal(spoken(), "Playing scenario Happy path — now in A");
  await act(async () => done);
  await act(async () => sleep(20));
  assert.match(spoken(), /^GO fired — now in B/);
  await view.unmount();
});

test("useMachineView: an eventless step after a real event is announced under that event", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = {
    version: 1,
    rootId: "m",
    machines: [{
      id: "m", label: "M", initialId: "a",
      nodes: [{ id: "a", label: "A", kind: "atomic" }, { id: "b", label: "B", kind: "atomic" }, { id: "c", label: "C", kind: "atomic" }],
      transitions: [{ id: "t1", sourceId: "a", targetId: "b", event: "GO" }, { id: "t2", sourceId: "b", targetId: "c" }],
    }],
  };
  const view = await mountHost((s) => useMachineView(s), { controlled: false, initial: d });
  await act(async () => view.hook.start());
  await act(async () => view.hook.sendEvent("GO"));
  assert.equal(view.hook.announcement.replace(/\u00a0/g, "").trim(), "GO fired — now in C");
  await view.unmount();
});

test("useMachineView: delete and run-all copy ('…, 1 nested state and 2 transitions', '1 of 1 passed')", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  const d = {
    version: 1,
    rootId: "m",
    machines: [{
      id: "m", label: "M", initialId: "a",
      nodes: [
        { id: "a", label: "A", kind: "atomic" },
        { id: "p", label: "Parent", kind: "compound", initialId: "k" },
        { id: "k", label: "Kid", kind: "atomic", parentId: "p" },
        { id: "z", label: "Z", kind: "atomic" },
      ],
      transitions: [{ id: "t1", sourceId: "a", targetId: "p", event: "IN" }, { id: "t2", sourceId: "k", targetId: "z", event: "OUT" }],
    }],
  };
  const notices = [];
  const scenarios = [{ id: "s1", label: "Goes in", events: [{ type: "IN" }], expectedActiveIds: ["k"] }];
  const view = await mountHost((s) => useMachineView(s), { controlled: false, initial: d, extra: { onNotice: (n) => notices.push(n), scenarios } });
  await act(async () => view.hook.runAllScenarios());
  assert.equal(view.hook.announcement.replace(/\u00a0/g, "").trim(), "Ran 1 scenario: 1 of 1 passed.");
  await act(async () => view.hook.setSelection({ type: "node", id: "p" }));
  await act(async () => view.hook.deleteSelection());
  assert.equal(notices.at(-1)?.message, "Deleted “Parent”, 1 nested state and 2 transitions");
  await act(async () => view.hook.setSelection({ type: "node", id: "z" }));
  await act(async () => view.hook.deleteSelection());
  assert.equal(notices.at(-1)?.message, "Deleted “Z”");
  await view.unmount();
});

test("useMachineView: `document` + `editable={false}` is the same quiet viewer as `readOnly`", async () => {
  const { useMachineView } = await load("/src/registry/machine-view/use-machine-view.ts");
  await domEnv();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args.join(" "));
  let hook;
  try {
    function Viewer() {
      hook = useMachineView({ document: doc("v0"), editable: false });
      return null;
    }
    const root = createRoot(window.document.createElement("div"));
    await act(async () => root.render(React.createElement(Viewer)));
    assert.equal(hook.editable, false);
    await act(async () => root.unmount());
  } finally {
    console.error = original;
  }
  assert.deepEqual(errors.filter((e) => e.includes("MachineView")), [], "editable={false} is read-only on purpose: no dev warning");
});
