// Machine Tree interaction tests: the real component, rendered with react-dom/client in jsdom and
// driven with DOM events (click, keydown, input), the way a user drives it. Same harness as
// machine-view.test.mjs: `node --test` plus Vite's SSR loader, so `@/` and `@fux/*` resolve as in
// the app. No test framework.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
});
after(() => vite?.close());

/* ───────── a browser-like environment (jsdom is a dev dependency of the repo root) ───────── */

/** Media features the component reads; tests flip them before mounting (desktop by default). */
const media = { "(hover: hover)": true };
let React;
let act;
let createRoot;
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  // Every window global the libraries reach for (Event constructors, getComputedStyle, rAF, …).
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "FocusEvent", "CustomEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  globalThis.ResizeObserver = window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.matchMedia = (query) => ({ matches: !!media[query], media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.scrollTo = globalThis.scrollTo = () => {};
  // Timers and frames the component schedules itself (hand-offs, flashes) settle outside act();
  // React's "not wrapped in act" notice for them is noise here, everything else still prints.
  const error = console.error;
  console.error = (...args) => (String(args[0]).includes("not wrapped in act") ? undefined : error(...args));
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Mounts `<MachineTree>` for a lab case (or a document) and returns query helpers. */
async function mount(caseId, extra = {}) {
  await domEnv();
  const { MachineTree } = await load("/src/registry/machine-tree/machine-tree.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const { machineLabCases } = await load("@fux/examples/docs/machine-lab-data");
  const lab = typeof caseId === "string" ? machineLabCases.find((c) => c.id === caseId) : { document: caseId, options: {}, scenarios: [] };
  const container = document.createElement("div");
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  await act(async () => reactRoot.render(React.createElement(TooltipProvider, null, React.createElement(MachineTree, { document: lab.document, runtime: lab.options, scenarios: lab.scenarios, ...extra }))));
  const items = () => [...container.querySelectorAll("[data-mt-item]")];
  const view = {
    container,
    item: (prefix) => items().find((el) => el.getAttribute("aria-label").startsWith(prefix)),
    face: (prefix) => view.item(prefix)?.querySelector(":scope > [data-mt-face]"),
    button: (text) => [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === text || b.textContent.trim() === text),
    polite: () => container.querySelector('[role=status][aria-live=polite]').textContent.trim(),
    assertive: () => container.querySelector('[role=alert][aria-live=assertive]').textContent.trim(),
    async click(el, init = {}) {
      assert.ok(el, "element to click exists");
      await act(async () => {
        el.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, ...init }));
        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, ...init }));
        el.focus?.();
        el.dispatchEvent(new MouseEvent("pointerup", { bubbles: true, ...init }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, ...init }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, ...init }));
      });
      await act(async () => sleep(20));
    },
    async key(el, key, init = {}) {
      await act(async () => {
        el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
      });
      await act(async () => sleep(20));
    },
    async type(input, text) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      await act(async () => {
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => sleep(20));
    },
    unmount: async () => {
      await act(async () => reactRoot.unmount());
      container.remove();
    },
  };
  return view;
}

/* ───────── tests ───────── */

test("send loop: Enter on an enabled route sends, announces, and moves the live leaf (rail + signal name)", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    assert.equal(view.polite(), "Simulation started — now in Draft", "the start names the state it starts in (the shared sentence)");
    assert.match(view.item("Draft").getAttribute("aria-label"), /, active/);
    assert.equal(view.face("Draft").dataset.sim, "active");
    assert.ok(view.face("Draft").querySelector(".mt-rail"), "the live leaf wears the rail");
    const submit = view.item("SUBMIT");
    assert.match(submit.getAttribute("aria-label"), /enabled, press Enter to send/);
    submit.focus();
    await view.key(submit, "Enter");
    assert.equal(view.polite(), "SUBMIT fired — now in Review");
    assert.match(view.item("Review").getAttribute("aria-label"), /^Review, state, active/);
    assert.equal(view.face("Review").dataset.sim, "active");
    assert.equal(view.face("Draft").dataset.sim, "inactive");
    assert.equal(view.face("Draft").querySelector(".mt-rail"), null, "one rail: only the live leaf");
    // A blocked route explains itself on Enter instead of sending.
    const decide = view.item("DECIDE");
    await view.key(decide, "Enter");
    assert.match(view.polite(), /^DECIDE blocked — guard approved is false/, "one phrasing: the same words as the row's name");
    assert.match(decide.getAttribute("aria-label"), /blocked: guard approved is false/);
    assert.match(view.item("Review").getAttribute("aria-label"), /active/, "nothing moved");
  } finally {
    await view.unmount();
  }
});

test("a double-click/double-tap on a route's target text sends once and never follows", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    const target = view.item("SUBMIT").querySelector("[data-substop]");
    await view.click(target, { detail: 1 });
    // The second click of the double-click: the route is used up, so it must not follow (or refuse).
    await view.click(target, { detail: 2 });
    assert.equal(view.polite(), "SUBMIT fired — now in Review", "the 'fired' sentence is not replaced by a follow");
    const back = [...document.querySelectorAll("button")].filter((b) => /^Back to/.test(b.getAttribute("aria-label") ?? b.textContent.trim()));
    assert.equal(back.length, 0, "no Back chip: nothing was followed");
  } finally {
    await view.unmount();
  }
});
test("desktop click consistency: a click on an enabled route's target text sends; ⌘-click follows", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    const target = view.item("SUBMIT").querySelector("[data-substop]");
    await view.click(target);
    assert.equal(view.polite(), "SUBMIT fired — now in Review", "the target text of an enabled route sends like the rest of the row");
    assert.equal(view.container.querySelectorAll(".mt-peek").length, 0, "a click never leaves a stale peek");
    assert.match(document.activeElement.getAttribute("aria-label") ?? "", /^SUBMIT, to Review/, "focus is on the route's named treeitem, not its inner stop");
    // While it can send, the target is part of one button: not link-blue, and the row has one hover tint.
    const decline = view.item("DECLINE");
    assert.doesNotMatch(decline.querySelector("[data-substop]").className, /text-signal/, "an enabled route's target isn't link-coloured");
    assert.match(decline.querySelector("[data-mt-face]").className, /group-hover\/route:bg-signal-muted/);
    assert.doesNotMatch(decline.querySelector("[data-mt-face] span span").className, /hover:bg-signal/, "the pill has no second hover fill");
    // DECLINE is enabled at Review: a modifier click follows instead of sending.
    await view.click(view.item("DECLINE").querySelector("[data-substop]"), { metaKey: true });
    assert.equal(view.polite(), "Moved to Declined");
    assert.match(view.item("Review").getAttribute("aria-label"), /active/, "following never sends");
  } finally {
    await view.unmount();
  }
});

test("Back: docked in the toolbar (never over the canvas), works mid-run, cleared by Simulate and by a send", async () => {
  const view = await mount("support");
  try {
    const backs = () => [...view.container.querySelectorAll("button")].filter((b) => /^Back to /.test(b.getAttribute("aria-label") ?? ""));
    await view.click(view.item("HANDOFF").querySelector("[data-substop]"));
    assert.equal(backs().length, 1, "following leaves a Back control");
    assert.equal(backs()[0].getAttribute("aria-label"), "Back to Intake");
    assert.ok(backs()[0].closest("[data-mt-toolbar]"), "it lives in the toolbar");
    assert.equal(view.container.querySelector("[role=tree]").parentElement.parentElement.querySelectorAll("button[aria-label^='Back to']").length, 0, "nothing floats over the canvas");
    await view.click(view.button("Simulate"));
    await act(async () => sleep(400));
    assert.equal(backs().length, 0, "Simulate clears a trail from before the run");
    // Made during a run (a modifier click follows instead of sending): still docked, and Back returns.
    await view.click(view.item("HANDOFF").querySelector("[data-substop]"), { metaKey: true });
    assert.equal(backs().length, 1);
    assert.ok(backs()[0].closest("[data-mt-toolbar]"));
    await view.click(backs()[0]);
    await act(async () => sleep(300));
    // Back returns to the route it was followed from (under Intake), with focus there.
    assert.match(view.polite(), /^Moved to HANDOFF/);
    assert.equal(backs().length, 0, "using it clears it");
  } finally {
    await view.unmount();
  }
});

test("⌘K go-to: focus lands on the chosen row only after the dialog closes (never inside aria-hidden)", async () => {
  const view = await mount("release");
  try {
    await view.click(view.item("Review"));
    const rootEl = view.container.querySelector("[data-slot=machine-tree]");
    await view.key(rootEl, "k", { metaKey: true });
    const input = document.querySelector("[role=dialog] input");
    assert.ok(input, "the palette opened");
    await view.type(input, "Draft");
    await view.key(input, "Enter");
    await act(async () => sleep(80));
    assert.equal(document.querySelector("[role=dialog]"), null, "closed");
    assert.match(document.activeElement.getAttribute("aria-label") ?? "", /^Draft, state/);
    assert.equal(document.activeElement.closest("[aria-hidden=true]"), null, "the focused row is not inside an aria-hidden subtree");
    assert.equal(document.querySelectorAll("[data-aria-hidden]").length, 0, "the dialog's hideOthers is lifted");
    assert.equal(view.polite(), "Moved to Draft");
  } finally {
    await view.unmount();
  }
});

test("⌘K send while simulating: a state's name lists its Send but goes to the state; the event name sends", async () => {
  const view = await mount("incident");
  try {
    await view.click(view.button("Simulate"));
    const rootEl = view.container.querySelector("[data-slot=machine-tree]");
    await view.key(rootEl, "k", { metaKey: true });
    let input = document.querySelector("[role=dialog] input");
    await view.type(input, "Classifying");
    const options = () => [...document.querySelectorAll("[role=dialog] [role=option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim());
    const highlighted = () => document.querySelector("[role=dialog] [role=option][aria-selected=true]")?.textContent.replace(/\s+/g, " ").trim() ?? "";
    assert.ok(options().some((o) => o.startsWith("Send CLASSIFIED")), "a state name still lists the event it can send");
    assert.ok(highlighted().startsWith("Classifying"), `the state is the default, not the send: ${highlighted()}`);
    assert.ok(!options()[0].startsWith("Send"), "a Send found only by a state's name never ranks first");
    assert.ok(options().some((o) => /CLASSIFIED.*Investigating.*blocked/i.test(o)), "the guarded route says it is blocked");
    assert.ok(options().some((o) => /guard confident is false/.test(o) && !/CLASSIFIED blocked/.test(o)), "the reason doesn't repeat the event");
    await view.key(input, "Enter");
    await act(async () => sleep(80));
    assert.equal(view.polite(), "Moved to Classifying");
    assert.match(document.activeElement.getAttribute("aria-label") ?? "", /^Classifying, state, active/, "nothing was sent");
    // The event's own name ties the Send with its transitions: the transition that can fire now is
    // highlighted (looking it up is navigation), ↵ goes to it, and only ⇧↵ sends.
    await view.key(rootEl, "k", { metaKey: true });
    input = document.querySelector("[role=dialog] input");
    await view.type(input, "classified");
    assert.match(highlighted(), /^CLASSIFIED\s*Classifying → Human review/, `a tie highlights the enabled transition, not the Send: ${highlighted()}`);
    assert.ok(options().some((o) => o.startsWith("Send CLASSIFIED")), "the Send is still listed");
    const hints = () => document.querySelector("[role=dialog] [cmdk-root] > div[aria-hidden]").textContent;
    assert.match(hints(), /↵ go/);
    assert.match(hints(), /Shift ↵ send/, "the footer offers ⇧↵ on an enabled transition");
    await view.key(input, "Enter");
    await act(async () => sleep(80));
    assert.match(view.polite(), /^Moved to CLASSIFIED/, "↵ on the tie navigates");
    assert.match(view.item("Classifying").getAttribute("aria-label"), /^Classifying, state, active/, "nothing was sent");
    await view.key(rootEl, "k", { metaKey: true });
    input = document.querySelector("[role=dialog] input");
    await view.type(input, "classified");
    await view.key(input, "Enter", { shiftKey: true });
    await act(async () => sleep(80));
    assert.match(view.polite(), /^CLASSIFIED fired — now in Human review/, "⇧↵ sends the highlighted transition's event");
    assert.match(document.activeElement.getAttribute("aria-label") ?? "", /^Human review, state, active/);
  } finally {
    await view.unmount();
  }
});

test("⌘K empty query: \"Send now\" is pinned on top, the live state is highlighted, ↵ goes there", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    await view.key(view.item("SUBMIT"), "Enter");
    assert.equal(view.polite(), "SUBMIT fired — now in Review");
    const rootEl = view.container.querySelector("[data-slot=machine-tree]");
    await view.key(rootEl, "k", { metaKey: true });
    const headings = [...document.querySelectorAll("[role=dialog] [cmdk-group-heading]")].map((h) => h.textContent);
    assert.deepEqual(headings, ["Send now", "States and machines"], "the short Send list comes first; no transitions without a query");
    const options = [...document.querySelectorAll("[role=dialog] [role=option]")].map((o) => o.textContent.replace(/\s+/g, " ").trim());
    assert.ok(options[0].startsWith("Send "), `the first row is a Send: ${options[0]}`);
    const highlighted = document.querySelector("[role=dialog] [role=option][aria-selected=true]")?.textContent.replace(/\s+/g, " ").trim() ?? "";
    assert.match(highlighted, /^Review.*active$/i, `the live state is the default, not a Send or the machine row: ${highlighted}`);
    assert.match(document.querySelector("[role=dialog] [cmdk-root] > div[aria-hidden]").textContent, /↵ go/);
    await view.key(document.querySelector("[role=dialog] input"), "Enter");
    await act(async () => sleep(80));
    assert.equal(view.polite(), "Moved to Review", "↵ = go to where I am");
    assert.match(view.item("Review").getAttribute("aria-label"), /^Review, state, active/, "nothing was sent");
    // Idle, there is nothing to send: the palette is the state list, the machine row first.
    await view.click(view.button("Stop"));
    await view.key(rootEl, "k", { metaKey: true });
    assert.deepEqual([...document.querySelectorAll("[role=dialog] [cmdk-group-heading]")].map((h) => h.textContent), ["States and machines"]);
    assert.match(document.querySelector("[role=dialog] [role=option][aria-selected=true]")?.textContent ?? "", /^Release approval/);
  } finally {
    await view.unmount();
  }
});

test("⌘K: \"send …\" makes the Send the unambiguous best match, so ↵ sends", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    const rootEl = view.container.querySelector("[data-slot=machine-tree]");
    await view.key(rootEl, "k", { metaKey: true });
    const input = document.querySelector("[role=dialog] input");
    await view.type(input, "send sub");
    const highlighted = document.querySelector("[role=dialog] [role=option][aria-selected=true]")?.textContent.replace(/\s+/g, " ").trim() ?? "";
    assert.ok(highlighted.startsWith("Send SUBMIT"), `the Send leads: ${highlighted}`);
    assert.match(document.querySelector("[role=dialog] [cmdk-root] > div[aria-hidden]").textContent, /↵ send/);
    await view.key(input, "Enter");
    await act(async () => sleep(80));
    assert.match(view.polite(), /^SUBMIT fired — now in Review/);
  } finally {
    await view.unmount();
  }
});

test("⌘K: typing a state name and pressing Enter never sends (\"review\", \"re\")", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    await view.key(view.item("SUBMIT"), "Enter");
    assert.equal(view.polite(), "SUBMIT fired — now in Review");
    const rootEl = view.container.querySelector("[data-slot=machine-tree]");
    for (const query of ["review", "re"]) {
      await view.key(rootEl, "k", { metaKey: true });
      const input = document.querySelector("[role=dialog] input");
      await view.type(input, query);
      const highlighted = document.querySelector("[role=dialog] [role=option][aria-selected=true]")?.textContent ?? "";
      assert.ok(!highlighted.startsWith("Send"), `"${query}" highlights a state, not a send: ${highlighted}`);
      await view.key(input, "Enter");
      await act(async () => sleep(80));
      assert.match(view.polite(), /^Moved to /, `"${query}" + Enter navigates`);
      assert.doesNotMatch(view.polite(), /fired/);
      assert.match(view.item("Review").getAttribute("aria-label"), /^Review, state, active/, `"${query}" + Enter sent nothing`);
    }
    // "re" prefixes both the machine "Release approval" and "Review": the first in document order wins.
    assert.match(document.activeElement.getAttribute("aria-label") ?? "", /^Release approval, machine/);
  } finally {
    await view.unmount();
  }
});

test("fold shows active: a collapsed container names the run it hides", async () => {
  const view = await mount("launch");
  try {
    await view.click(view.button("Simulate"));
    await view.click(view.button("Collapse all"));
    const preparing = view.item("Preparing");
    assert.equal(preparing.getAttribute("aria-expanded"), "false");
    assert.match(preparing.getAttribute("aria-label"), /active: Connecting, Loading settings/);
    assert.match(preparing.textContent, /2 active/, "the folded chip shows the hidden run");
    assert.equal(view.item("Connecting"), undefined, "children are folded away");
  } finally {
    await view.unmount();
  }
});

test("phone: a tap on an enabled route's target sends, clears the peek, and the footer counts the second leaf", async () => {
  media["(max-width: 767px)"] = true;
  media["(pointer: coarse)"] = true;
  media["(hover: hover)"] = false;
  const view = await mount("launch");
  try {
    await view.click(view.button("Simulate"));
    const target = view.item("CONNECTED").querySelector("[data-substop]");
    await act(async () => target.dispatchEvent(new MouseEvent("pointerover", { bubbles: true })));
    await view.click(target);
    assert.equal(view.polite(), "CONNECTED fired — now in Connected and Loading settings");
    assert.equal(view.container.querySelectorAll(".mt-peek").length, 0, "no stale peek on the new state");
    const footer = view.container.querySelector("[data-slot=machine-tree] > [data-mt-zone]");
    assert.match(footer.textContent, /\+1/, "the second active leaf is counted, not truncated");
    assert.match(footer.querySelector(".sr-only").textContent, /Connected, Loading settings/, "the full list is in the accessible text");
    // Radix stamps data-state on a tooltip trigger; without hover the toolbar buttons are plain buttons.
    assert.equal(view.button("Find").hasAttribute("data-state"), false, "no hover tooltip on a device without hover");
  } finally {
    await view.unmount();
    delete media["(max-width: 767px)"];
    delete media["(pointer: coarse)"];
    media["(hover: hover)"] = true;
  }
});

test("an errored run dims nothing, announces assertively, and puts focus on Retry", async () => {
  const document_ = {
    version: 1,
    rootId: "m",
    machines: [{ id: "m", label: "Dup", initialId: "a", nodes: [{ id: "a", label: "A", kind: "atomic" }, { id: "a", label: "A again", kind: "atomic" }], transitions: [{ id: "t", sourceId: "a", targetId: "a", event: "GO" }] }],
  };
  const view = await mount(document_);
  try {
    await view.click(view.button("Simulate"));
    assert.match(view.assertive(), /^Simulation stopped — /);
    assert.equal(view.container.querySelectorAll("[data-sim]").length, 0, "states and routes keep design colours");
    await act(async () => sleep(40));
    assert.equal(document.activeElement.getAttribute("aria-label"), "Retry");
  } finally {
    await view.unmount();
  }
});

test("parallel layout: a send never resizes the cards (dot and status-glyph slots are reserved)", async () => {
  const view = await mount("launch");
  try {
    await view.click(view.button("Simulate"));
    const slots = () => ["Connecting", "Connected", "Loading settings", "Settings ready"].map((name) => view.face(name).querySelectorAll(":scope > div > .size-1\\.5").length);
    assert.deepEqual(slots(), [1, 1, 1, 1], "every state that can hold the run has the dot's slot");
    const pills = () => [...view.container.querySelectorAll("[data-mt-item][role=treeitem] li, li[data-mt-item]")].map((li) => li.querySelector("[data-mt-face] span span").children.length);
    const before = pills();
    await view.key(view.item("CONNECTED"), "Enter");
    assert.equal(view.polite(), "CONNECTED fired — now in Connected and Loading settings");
    assert.deepEqual(slots(), [1, 1, 1, 1]);
    assert.deepEqual(pills(), before, "each event pill keeps one status glyph slot across the send");
  } finally {
    await view.unmount();
  }
});

test("dry run never out-shouts the present: emphasis tokens and ghost rules", () => {
  const sim = readFileSync(new URL("../src/registry/machine-shared/machine-sim.css", import.meta.url), "utf8");
  const tree = readFileSync(new URL("../src/registry/machine-tree/machine-tree.css", import.meta.url), "utf8");
  const block = (css, selector) => css.match(new RegExp(`${selector.replace(/[[\]"=.]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
  assert.match(block(sim, '[data-sim="active"]'), /--sim-name: var\(--signal\)/, "the live leaf's name is the signal name");
  assert.match(block(sim, '[data-sim="ancestor"]'), /--sim-name: var\(--foreground\)/, "ancestors keep signal off their names");
  assert.doesNotMatch(tree, /\.mt-ghost-exit/, "would-leave adds no outline of its own: the live ring, glow and rail stay as they are");
  assert.match(block(tree, ".mt-ghost-enter.mt-peek::before"), /content: none/, "no peek pointer wedged between two previews");
  assert.doesNotMatch(block(tree, ".mt-ghost-enter"), /background/, "would-enter has no fill: quieter than the live leaf");
  assert.match(block(tree, ".mt-rail"), /inset-inline-start/, "the rail is logical (mirrors in RTL)");
  assert.match(block(tree, ".mt-rail"), /(^|;|\s)width: 2px;/, "the rail is 2px wide (the documented contract)");
});

test("toasts are per instance: two trees and the page's toaster never share a toaster, an id or page state", async () => {
  media["(max-width: 767px)"] = true;
  media["(pointer: coarse)"] = true;
  media["(hover: hover)"] = false;
  await domEnv();
  const { MachineTree } = await load("/src/registry/machine-tree/machine-tree.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const { Toaster } = await load("/src/components/ui/sonner.tsx");
  const { machineToast } = await load("/src/registry/machine-shared/machine-toast.tsx");
  const { machineLabCases } = await load("@fux/examples/docs/machine-lab-data");
  const lab = machineLabCases.find((c) => c.id === "release");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const reactRoot = createRoot(container);
  const tree = (key) => React.createElement(MachineTree, { key, document: lab.document, runtime: lab.options, scenarios: lab.scenarios });
  await act(async () => reactRoot.render(React.createElement(TooltipProvider, null, React.createElement(Toaster, { position: "bottom-right" }), tree("a"), tree("b"))));
  try {
    const [a, b] = container.querySelectorAll("[data-slot=machine-tree]");
    const within = (rootEl, prefix) => [...rootEl.querySelectorAll("[data-mt-item]")].find((el) => el.getAttribute("aria-label").startsWith(prefix));
    const simulate = (rootEl) => [...rootEl.querySelectorAll("button")].find((el) => el.textContent.trim() === "Simulate");
    for (const rootEl of [a, b]) {
      await act(async () => simulate(rootEl).click());
      await act(async () => within(rootEl, "SUBMIT").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
      // DECIDE is blocked at Review: on touch the reason is a toast.
      await act(async () => within(rootEl, "DECIDE").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })));
    }
    await act(async () => machineToast("mv-reason", "Machine View says hi"));
    await act(async () => sleep(80));
    const sections = [...document.querySelectorAll("section[aria-label]")];
    const treeSections = sections.filter((s) => s.getAttribute("aria-label") === "Release approval notifications");
    const page = sections.find((s) => s.getAttribute("aria-label").startsWith("Notifications"));
    assert.equal(treeSections.length, 2, "one toaster per tree instance");
    const toastsIn = (section) => [...section.querySelectorAll("[data-slot=machine-toast]")].map((t) => t.textContent);
    assert.deepEqual(treeSections.map((s) => toastsIn(s).filter((t) => /DECIDE blocked/.test(t)).length), [1, 1], "each tree's blocked toast is in its own toaster (ids don't collide)");
    assert.deepEqual(toastsIn(page), ["Machine View says hi"], "a toast without toasterId stays in the page toaster, untouched by either tree");
    assert.ok(treeSections.every((s) => !toastsIn(s).some((t) => /Machine View/.test(t))));
    assert.equal(document.documentElement.style.getPropertyValue("--mt-toast-top"), "", "no global page state");
  } finally {
    await act(async () => reactRoot.unmount());
    container.remove();
    delete media["(max-width: 767px)"];
    delete media["(pointer: coarse)"];
    media["(hover: hover)"] = true;
  }
});

test("landmarks: each instance is named by its machine (or its label), with no trailing space", async () => {
  const a = await mount("release", { label: "Release approval (top)" });
  const b = await mount("release", { label: "Release approval (bottom)" });
  const c = await mount("launch");
  try {
    const trees = [...document.querySelectorAll("[role=tree]")].map((t) => t.getAttribute("aria-label"));
    assert.deepEqual(trees, ["Release approval (top) state hierarchy", "Release approval (bottom) state hierarchy", `${c.container.querySelector("[role=tree]").getAttribute("aria-label").replace(/ state hierarchy$/, "")} state hierarchy`]);
    const regions = [...document.querySelectorAll("section[aria-label]")].map((s) => s.getAttribute("aria-label"));
    assert.ok(regions.includes("Release approval (top) notifications") && regions.includes("Release approval (bottom) notifications"), regions.join(" | "));
    assert.ok(regions.every((name) => name === name.trim()), "no trailing space");
    assert.equal(new Set(regions).size, regions.length, "no two identical notification regions");
  } finally {
    await a.unmount();
    await b.unmount();
    await c.unmount();
  }
});

test("toast offset: clamped to the viewport and re-measured on scroll while a toast is up", async () => {
  media["(max-width: 767px)"] = true;
  media["(pointer: coarse)"] = true;
  media["(hover: hover)"] = false;
  const view = await mount("release", { label: "Offset probe" });
  try {
    const toolbar = view.container.querySelector("[data-mt-toolbar]");
    let bottom = 300;
    toolbar.getBoundingClientRect = () => ({ top: bottom - 44, bottom, left: 0, right: 390, width: 390, height: 44, x: 0, y: bottom - 44 });
    await view.click(view.button("Simulate"));
    await view.key(view.item("SUBMIT"), "Enter");
    // Blocked on touch: a persistent toast with a fix.
    await view.key(view.item("DECIDE"), "Enter");
    const list = () => [...document.querySelectorAll("section[aria-label='Offset probe notifications'] ol")][0];
    const top = () => list()?.style.getPropertyValue("--offset-top") || list()?.style.getPropertyValue("--mobile-offset-top");
    // Re-measures run on an animation frame; wait for them instead of sleeping a fixed time
    // (fixed sleeps flaked under a loaded test runner).
    const settle = async (expected) => {
      const deadline = Date.now() + 2000;
      while (top() !== expected && Date.now() < deadline) await act(async () => sleep(16));
      return top();
    };
    assert.equal(await settle("308px"), "308px", "8px below the toolbar");
    bottom = -200;
    await act(async () => window.dispatchEvent(new Event("scroll")));
    assert.equal(await settle("8px"), "8px", "a toolbar scrolled above the viewport pins the toast to its top");
    // (Resize takes the same path; it is driven in the browser pass, jsdom's resize is unreliable here.)
    bottom = 5000;
    await act(async () => window.dispatchEvent(new Event("scroll")));
    assert.equal(await settle(`${window.innerHeight - 120}px`), `${window.innerHeight - 120}px`, "a toolbar below the fold keeps the toast on screen");
  } finally {
    await view.unmount();
    delete media["(max-width: 767px)"];
    delete media["(pointer: coarse)"];
    media["(hover: hover)"] = true;
  }
});

test("restart before any send is said again (same frame key, fresh run)", async () => {
  const view = await mount("release");
  try {
    await view.click(view.button("Simulate"));
    assert.equal(view.polite(), "Simulation started — now in Draft");
    await view.click(view.button("Restart simulation") ?? view.button("Restart"));
    assert.equal(view.polite(), "Simulation started — now in Draft", "a restart is announced even though the frame looks the same");
  } finally {
    await view.unmount();
  }
});
