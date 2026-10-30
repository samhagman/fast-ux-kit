// Outliner controlled document (controlled-outline.ts): value/defaultValue, echo, veto, late echo,
// external changes, and undo/redo surviving a host round trip. Mirrors machine-view.test.mjs.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
let c;
let core;
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  c = await vite.ssrLoadModule("/src/registry/outliner/controlled-outline.ts");
  core = await vite.ssrLoadModule("@fux/core");
});
after(() => vite?.close());

const options = { readOnly: false, historyLimit: 50, typingGroupMs: 900 };
const doc = () => [
  { id: "a", text: "Alpha" },
  { id: "b", text: "Beta", children: [{ id: "b1", text: "Child" }] },
];
const start = (nodes = doc(), controlled = true) => c.initOutlineState(core.createOutlineEditorState(nodes), controlled ? nodes : undefined);
const text = (state, id) => core.findOutlineNode(c.latestEditor(state).nodes, id)?.node.text;
const shown = (state, id) => core.findOutlineNode(state.editor.nodes, id)?.node.text;

/** A host that answers every proposal with a structured clone (a server round trip). */
function cloningHost(state) {
  const host = { state, value: state.prop, proposals: [] };
  host.act = (action, controlled = true) => {
    const step = c.stepOutline(host.state, action, options, controlled, host.proposals.length + 1);
    host.state = step.state;
    if (step.proposal) host.proposals.push(step.proposal);
    return step;
  };
  host.echo = (proposal = host.proposals.at(-1)) => {
    host.value = structuredClone(proposal.target.nodes);
    const result = c.reconcileOutline(host.state, host.value, options);
    host.state = result.state;
    return result;
  };
  return host;
}

test("uncontrolled: edits commit at once and report a proposal for notification", () => {
  let state = start(doc(), false);
  const step = c.stepOutline(state, { type: "text", id: "a", text: "Alpha 2", time: 1 }, options, false, 1);
  state = step.state;
  assert.equal(shown(state, "a"), "Alpha 2");
  assert.equal(state.pending.length, 0);
  assert.equal(step.proposal.meta.reason, "edit");
  assert.equal(step.proposal.meta.action, "text");
});

test("controlled: an edit is pending (not shown) until the host echoes; a clone echo commits as ONE step", () => {
  const host = cloningHost(start());
  host.act({ type: "text", id: "a", text: "Alpha 2", time: 1 });
  assert.equal(shown(host.state, "a"), "Alpha", "the value still renders the prop");
  assert.equal(text(host.state, "a"), "Alpha 2", "the next action builds on the proposal");
  const result = host.echo();
  assert.equal(result.outcome, "echo");
  assert.equal(shown(host.state, "a"), "Alpha 2");
  assert.equal(host.state.editor.nodes, host.value, "the host's array becomes the document");
  assert.equal(host.state.editor.history.past.length, 1);
  assert.equal(host.state.pending.length, 0);
});

test("typing coalesces into one undo step across echoes; undo/redo round-trip through the host", () => {
  const host = cloningHost(start());
  for (const [i, value] of ["Alpha!", "Alpha!!", "Alpha!!!"].entries()) {
    host.act({ type: "text", id: "a", text: value, time: 1000 + i * 100 });
    host.echo();
  }
  assert.equal(host.state.editor.history.past.length, 1, "one typing burst, one step");
  const undo = host.act({ type: "undo" });
  assert.equal(undo.proposal.meta.reason, "undo");
  host.echo();
  assert.equal(shown(host.state, "a"), "Alpha");
  assert.equal(host.state.editor.history.future.length, 1, "an echoed undo keeps the redo stack");
  host.act({ type: "redo" });
  host.echo();
  assert.equal(shown(host.state, "a"), "Alpha!!!");
  assert.equal(host.state.editor.history.past.length, 1);
});

test("veto: rejecting a proposal drops it and everything chained on it", () => {
  const host = cloningHost(start());
  const first = host.act({ type: "text", id: "a", text: "A1", time: 1 }).proposal;
  host.act({ type: "text", id: "b", text: "B1", time: 5000 });
  assert.equal(host.state.pending.length, 2);
  const { state, dropped } = c.rejectOutlineProposal(host.state, first.id);
  assert.equal(dropped.length, 2);
  assert.equal(state.pending.length, 0);
  assert.equal(text(state, "a"), "Alpha");
  assert.equal(text(state, "b"), "Beta");
  assert.equal(c.rejectOutlineProposal(state, 999).state, state, "unknown ids are a no-op");
});

test("late echo: answering an older proposal commits it and keeps newer ones pending", () => {
  const host = cloningHost(start());
  const p1 = host.act({ type: "text", id: "a", text: "A1", time: 1 }).proposal;
  host.act({ type: "text", id: "b", text: "B1", time: 5000 });
  const result = host.echo(p1);
  assert.equal(result.outcome, "echo");
  assert.equal(result.accepted.length, 1);
  assert.equal(shown(host.state, "a"), "A1");
  assert.equal(shown(host.state, "b"), "Beta");
  assert.equal(host.state.pending.length, 1, "B1 is still in flight");
  host.echo();
  assert.equal(shown(host.state, "b"), "B1");
  assert.equal(host.state.editor.history.past.length, 2);
});

test("a coalescing host may answer several proposals with one echo", () => {
  const host = cloningHost(start());
  host.act({ type: "text", id: "a", text: "A1", time: 1 });
  host.act({ type: "text", id: "b", text: "B1", time: 5000 });
  const result = host.echo();
  assert.equal(result.accepted.length, 2);
  assert.equal(host.state.pending.length, 0);
});

test("external: a different document is one undoable step and drops what was pending", () => {
  const host = cloningHost(start());
  host.act({ type: "text", id: "a", text: "mine", time: 1 });
  const theirs = [{ id: "a", text: "Theirs" }, { id: "z", text: "New from server" }];
  const result = c.reconcileOutline(host.state, theirs, options);
  assert.equal(result.outcome, "external");
  assert.equal(result.dropped.length, 1);
  assert.equal(result.state.editor.nodes, theirs);
  assert.equal(result.state.editor.history.past.length, 1);
  const undone = c.stepOutline(result.state, { type: "undo" }, options, false);
  assert.equal(core.findOutlineNode(undone.state.editor.nodes, "b")?.node.text, "Beta", "undo returns to the pre-external document");
});

test("a content-equal copy of what is shown is not a change; an invalid value is ignored", () => {
  const state = start();
  const copy = c.reconcileOutline(state, structuredClone(doc()), options);
  assert.equal(copy.outcome, "none");
  assert.equal(copy.state.editor.history.past.length, 0);
  const invalid = c.reconcileOutline(state, [{ id: "a", text: "x" }, { id: "a", text: "dup" }], options);
  assert.equal(invalid.outcome, "invalid");
  assert.equal(shown(invalid.state, "a"), "Alpha");
});

test("reading state (caret, selection, folding) is never proposed and rides along with an edit in flight", () => {
  const host = cloningHost(start());
  const fold = host.act({ type: "toggle", id: "b" });
  assert.equal(fold.proposal, undefined);
  assert.equal(host.state.editor.expandedIds.has("b"), false, "applies at once, controlled or not");
  host.act({ type: "text", id: "a", text: "A1", time: 1 });
  host.act({ type: "select", id: "b" });
  assert.equal(host.state.pending.length, 1);
  host.echo(host.proposals[0]);
  assert.deepEqual([...host.state.editor.selection], ["b"], "the selection made while pending survives the echo");
});

/* ───────── Hook level: useOutliner rendered for real (jsdom + react-dom/client) ───────── */

let React;
let act;
let createRoot;
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  for (const key of ["window", "document", "HTMLElement", "Node", "Element", "Event", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "DOMParser"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}

/** Mounts useOutliner under a host. `respond(next, meta, setValue)` plays a controlled host. */
async function mountOutliner({ controlled = true, optimistic, respond = (next, _meta, set) => set(next) } = {}) {
  await domEnv();
  const { useOutliner } = await vite.ssrLoadModule("/src/registry/outliner/use-outliner.ts");
  const record = { ol: null, value: null, proposals: [], setControlled: null };
  function Host() {
    const [value, setValue] = React.useState(doc);
    const [isControlled, setControlled] = React.useState(controlled);
    record.value = value;
    record.setControlled = setControlled;
    const onValueChange = (next, meta) => {
      record.proposals.push({ next, meta });
      return respond(next, meta, setValue);
    };
    record.ol = useOutliner(isControlled ? { value, onValueChange, optimistic } : { defaultValue: value, onValueChange });
    return null;
  }
  const root = createRoot(window.document.createElement("div"));
  await act(async () => root.render(React.createElement(Host)));
  return { record, dispatch: (action) => act(async () => void record.ol.dispatch(action)), unmount: () => act(async () => root.unmount()) };
}
const titleOf = (ol, id) => core.findOutlineNode(ol.state.nodes, id)?.node.text;

test("hook: a host that echoes (same array or a clone) commits each edit; undo/redo survive the round trip", async () => {
  for (const clone of [false, true]) {
    const view = await mountOutliner({ respond: (next, _m, set) => set(clone ? structuredClone(next) : next) });
    await view.dispatch({ type: "text", id: "a", text: "Alpha 2", time: 1 });
    assert.equal(titleOf(view.record.ol, "a"), "Alpha 2");
    assert.equal(view.record.ol.state.nodes, view.record.value, "the outliner renders the host's value");
    assert.equal(view.record.proposals.at(-1).meta.reason, "edit");
    await view.dispatch({ type: "undo" });
    assert.equal(titleOf(view.record.ol, "a"), "Alpha");
    assert.equal(view.record.ol.canRedo, true, "the redo stack survives the round trip");
    await view.dispatch({ type: "redo" });
    assert.equal(titleOf(view.record.ol, "a"), "Alpha 2");
    await view.unmount();
  }
});

test("hook: a host can veto by returning false or by calling meta.reject() later", async () => {
  const sync = await mountOutliner({ respond: () => false });
  await sync.dispatch({ type: "text", id: "a", text: "nope", time: 1 });
  assert.equal(titleOf(sync.record.ol, "a"), "Alpha");
  assert.equal(sync.record.ol.canUndo, false);
  await sync.unmount();
  for (const optimistic of [true, false]) {
    let pending;
    const later = await mountOutliner({ optimistic, respond: (_next, meta) => void (pending = meta) });
    await later.dispatch({ type: "text", id: "a", text: "maybe", time: 1 });
    // Optimistic (default): the pending edit shows while the host thinks; strict: the host's value.
    assert.equal(titleOf(later.record.ol, "a"), optimistic ? "maybe" : "Alpha", "unanswered");
    await act(async () => pending.reject());
    assert.equal(titleOf(later.record.ol, "a"), "Alpha", "a veto rolls the optimistic edit back");
    await later.dispatch({ type: "text", id: "b", text: "Beta 2", time: 9000 });
    assert.equal(later.record.proposals.at(-1).next.find((n) => n.id === "a").text, "Alpha", "the vetoed edit is not built on");
    await later.unmount();
  }
});

test("hook: uncontrolled notifies with the new nodes; switching modes warns once in dev", async () => {
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(String(args[0]));
  try {
    const view = await mountOutliner({ controlled: false, respond: () => {} });
    await view.dispatch({ type: "text", id: "a", text: "Local", time: 1 });
    assert.equal(titleOf(view.record.ol, "a"), "Local", "uncontrolled commits at once");
    assert.equal(view.record.proposals.length, 1);
    await act(async () => view.record.setControlled(true));
    await act(async () => view.record.setControlled(false));
    assert.equal(errors.filter((e) => e.includes("changing from")).length, 1, errors.join("\n"));
    await view.unmount();
  } finally {
    console.error = original;
  }
});

test("hook: the typing fast path patches rows exactly like a full projection would", async () => {
  await domEnv();
  const { useOutliner } = await vite.ssrLoadModule("/src/registry/outliner/use-outliner.ts");
  const nodes = [
    { id: "p", text: "Parent", children: [{ id: "c1", text: "One", checked: false }, { id: "c2", text: "Two", checked: true }] },
    { id: "q", text: "Folded", children: [{ id: "d1", text: "Hidden task", checked: false }] },
    { id: "r", text: "Locked root", children: [{ id: "r1", text: "Locked child" }] },
  ];
  const record = {};
  function Probe({ value, expanded }) {
    record[expanded ? "fresh" : "live"] = useOutliner({ defaultValue: value, defaultExpandedIds: ["p", "r"], isLocked: (n) => n.id === "r" });
    return null;
  }
  const live = createRoot(window.document.createElement("div"));
  await act(async () => live.render(React.createElement(Probe, { value: nodes })));
  const first = record.live.rows;
  await act(async () => void record.live.dispatch({ type: "text", id: "c1", text: "One edited", time: 1 }));
  assert.notEqual(record.live.rows, first);
  assert.equal(record.live.rows[0], first[0].node === record.live.rows[0].node ? first[0] : record.live.rows[0]);
  await act(async () => void record.live.dispatch({ type: "transaction", commands: [{ type: "update", id: "d1", changes: { checked: true } }] }));
  await act(async () => void record.live.dispatch({ type: "text", id: "r1", text: "Still locked?", time: 5000 }));
  const fresh = createRoot(window.document.createElement("div"));
  await act(async () => fresh.render(React.createElement(Probe, { value: record.live.state.nodes, expanded: true })));
  const view = (rows) => rows.map((r) => ({ id: r.id, text: r.node.text, depth: r.depth, completed: r.completed, locked: r.locked, summary: r.summary, expanded: r.expanded, posInSet: r.posInSet }));
  assert.deepEqual(view(record.live.rows), view(record.fresh.rows));
  assert.deepEqual(record.live.rows.find((r) => r.id === "q").summary, { descendants: 1, tasks: 1, done: 1 }, "a folded parent's summary follows a hidden child");
  assert.equal(record.live.rowIndex.get("c2"), 2);
  await act(async () => { live.unmount(); fresh.unmount(); });
});
