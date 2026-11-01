// Shared jsdom harness for outliner component tests: a Vite SSR loader for the registry
// modules, a DOM with controllable media queries, and a mounted <Outliner> driven with real
// DOM events. Not a test file itself (the runner only picks up tests/*.test.mjs).
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
let vite;
export const media = {};
export async function startVite() {
  vite ??= await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  return vite;
}
export const load = async (path) => (await startVite()).ssrLoadModule(path);
/** Unmount whatever a failed test left mounted (its animations would keep the process alive), close the DOM and Vite. */
const mounted = new Set();
export async function stopVite() {
  const settle = (promise) => Promise.race([promise.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
  for (const unmount of [...mounted]) await settle(unmount());
  globalThis.window?.close?.();
  await vite?.close();
}

let React, act, createRoot;
export async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/notes?x=1#/outliner" });
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
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
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

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const frames = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))));

/**
 * The outliner's controller and ui, read from React's CURRENT fiber tree (test-only access). A DOM
 * node's own fiber can be the stale alternate after an update, so walk down from the root.
 */
function contextOf(container) {
  const key = Object.keys(container).find((k) => k.startsWith("__reactContainer"));
  const stack = [container[key].stateNode.current];
  while (stack.length) {
    const fiber = stack.pop();
    if (!fiber) continue;
    const value = fiber.memoizedProps?.value;
    if (value?.ol?.commands && value?.ui) return value;
    if (fiber.sibling) stack.push(fiber.sibling);
    if (fiber.child) stack.push(fiber.child);
  }
  throw new Error("no outliner context in the tree");
}

export async function mountOutliner(props, { wrap } = {}) {
  await domEnv();
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  const element = (p) => React.createElement(TooltipProvider, null, React.createElement(Outliner, { ...p, ref: handle }));
  await act(async () => r.render(wrap ? wrap(element) : element(props)));
  const ui = {
    container,
    handle,
    React,
    ol: () => contextOf(container).ol,
    ui: () => contextOf(container).ui,
    act: (fn) => act(async () => {
      await fn();
      await tick();
    }),
    frames: () => act(async () => frames()),
    rerender: (next) => act(async () => r.render(element(next))),
    root: () => container.querySelector("[data-slot=outliner]"),
    tree: () => container.querySelector("[role=tree]"),
    row: (id) => container.querySelector(`[data-row="${id}"]`),
    field: () => (document.activeElement?.tagName === "TEXTAREA" ? document.activeElement : null),
    value: () => handle.current.getValue(),
    live: () => container.querySelector("[data-slot=outliner] > [aria-live=polite]")?.textContent ?? "",
    selection: () => [...contextOf(container).ol.latestSelection()],
    /** A key on whatever has focus (the tree, a field), the way a keyboard delivers it. */
    key: (key, init = {}) =>
      act(async () => {
        const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : container.querySelector("[role=tree]");
        target.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
        await tick();
      }),
    click: (el, init = {}) =>
      act(async () => {
        el.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, ...init }));
        el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, ...init }));
        await tick();
      }),
    /** Edit an item: its field mounts and takes focus (as a click or Enter would). */
    edit: async (id) => {
      await act(async () => handle.current.focusItem(id, { edit: true }));
      await act(async () => frames());
    },
    select: async (id) => {
      await act(async () => handle.current.focusItem(id));
      await act(async () => frames());
    },
    unmount: async () => {
      mounted.delete(ui.unmount);
      await act(async () => r.unmount());
      container.remove();
    },
  };
  mounted.add(ui.unmount);
  return ui;
}

/** Wait (real time, outside act) until `probe` returns something truthy: exit animations, timers. */
export async function waitFor(probe, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = probe();
    if (value) return value;
    if (Date.now() > end) throw new Error(`waitFor timed out: ${probe}`);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/** KeyboardEvent init for a digit or letter with its physical key code. */
export const code = (key) => (/^[0-9]$/.test(key) ? `Digit${key}` : /^[a-z]$/i.test(key) ? `Key${key.toUpperCase()}` : undefined);
