// Shared jsdom harness for outliner component tests: a Vite SSR loader for the registry
// modules, a DOM with controllable media queries, and a mounted <Outliner> driven with real
// DOM events. Not a test file itself (the runner only picks up tests/*.test.mjs).
import "./clock.mjs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../..", import.meta.url));
let vite;
export const media = {};
export async function startVite() {
  vite ??= await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  return vite;
}
export const load = async (path) => (await startVite()).ssrLoadModule(path);
/** Unmount whatever a failed test left mounted (its animations would keep the process alive), close the DOM and Vite. */
const mounted = new Set();
export async function stopVite() {
  const settle = (promise) =>
    Promise.race([promise.catch(() => {}), new Promise((resolve) => setTimeout(resolve, 1000))]);
  for (const unmount of [...mounted]) await settle(unmount());
  globalThis.window?.close?.();
  await vite?.close();
}

let React, act, createRoot;
export async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/notes?x=1#/outliner",
  });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
  }
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "FocusEvent",
    "CustomEvent",
    "MutationObserver",
    "AbortController",
    "AbortSignal",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "DOMParser",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? window : window[key],
      configurable: true,
      writable: true,
    });
  globalThis.ResizeObserver = window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = (query) => ({
    matches: !!media[query],
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollTo ??= function () {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.scrollTo = globalThis.scrollTo = () => {};
  // No layout in jsdom: the editor's measurements (coordsAtPos, endOfTextblock) read empty rects.
  const rect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON() {},
  });
  window.Range.prototype.getClientRects ??= function () {
    return { length: 0, item: () => null, [Symbol.iterator]: function* () {} };
  };
  window.Range.prototype.getBoundingClientRect ??= rect;
  window.document.elementFromPoint ??= () => null;
  globalThis.DOMRect ??=
    window.DOMRect ??
    class {
      constructor(x = 0, y = 0, width = 0, height = 0) {
        Object.assign(this, {
          x,
          y,
          width,
          height,
          left: x,
          top: y,
          right: x + width,
          bottom: y + height,
        });
      }
    };
  globalThis.CSS = {
    escape: (value) => String(value).replace(/["\\]/g, "\\$&"),
    supports: () => false,
  };
  const error = console.error;
  console.error = (...args) =>
    /not wrapped in act|DialogContent|aria-describedby/.test(String(args[0]))
      ? undefined
      : error(...args);
  const warn = console.warn;
  console.warn = (...args) =>
    /DialogContent|Description/.test(String(args[0])) ? undefined : warn(...args);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  // The live title field's chunk, loaded before anything mounts, so a title is never briefly a textarea.
  await (await load("/src/registry/outliner/live-field/load.ts")).loadLiveField();
  ({ createRoot } = await import("react-dom/client"));
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const frames = () =>
  new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0))),
  );

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

/** Whether `el` is a row field: the live field (title or note), or a plain textarea. */
export const isField = (el) =>
  !!el && (el.tagName === "TEXTAREA" || el.dataset?.olEditor !== undefined);
const isLive = (el) => !!el?.liveField;

/**
 * Type `text` at the field's caret, one character at a time, the way a keyboard delivers it.
 * The live field takes each character through the editor's text input (its rules see a typed
 * space); a textarea gets its value set and an input event.
 */
export function typeText(el, text) {
  if (!isLive(el)) {
    const start = el.selectionStart,
      end = el.selectionEnd;
    const value = el.value.slice(0, start) + text + el.value.slice(end);
    Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set.call(
      el,
      value,
    );
    el.setSelectionRange(start + text.length, start + text.length);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    return;
  }
  const { view } = el.editor;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const deflt = () => view.state.tr.insertText(char, from, to);
    if (!view.someProp("handleTextInput", (f) => f(view, from, to, char, deflt)))
      view.dispatch(deflt());
  }
}

/**
 * Make the field read `value`, as typing it would: what differs from the current value is
 * selected and typed over (appending types at the end). For a textarea, its value is set.
 */
export function setFieldValue(el, value) {
  if (!isLive(el)) {
    const proto =
      el.tagName === "TEXTAREA"
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.setSelectionRange(value.length, value.length);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
    return;
  }
  const current = el.value;
  let from = 0;
  while (from < current.length && from < value.length && current[from] === value[from]) from++;
  let end = current.length;
  let endB = value.length;
  while (end > from && endB > from && current[end - 1] === value[endB - 1]) {
    end--;
    endB--;
  }
  // appending: keep the typed order natural (the caret at the end, the rest typed after it)
  if (value.startsWith(current)) {
    from = end = current.length;
    endB = value.length;
  }
  el.setSelectionRange(from, end);
  if (end > from && endB === from) {
    const { view } = el.editor;
    view.dispatch(view.state.tr.deleteSelection());
  } else typeText(el, value.slice(from, endB));
}

export async function mountOutliner(props, { wrap } = {}) {
  await domEnv();
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  const element = (p) =>
    React.createElement(
      TooltipProvider,
      null,
      React.createElement(Outliner, { ...p, ref: handle }),
    );
  await act(async () => r.render(wrap ? wrap(element) : element(props)));
  const ui = {
    container,
    handle,
    React,
    ol: () => contextOf(container).ol,
    ui: () => contextOf(container).ui,
    act: (fn) =>
      act(async () => {
        await fn();
        await tick();
      }),
    frames: () => act(async () => frames()),
    rerender: (next) => act(async () => r.render(element(next))),
    root: () => container.querySelector("[data-slot=outliner]"),
    tree: () => container.querySelector("[role=tree]"),
    row: (id) => container.querySelector(`[data-row="${id}"]`),
    field: () => (isField(document.activeElement) ? document.activeElement : null),
    /** Type at the caret of the focused field. */
    type: (text) =>
      act(async () => {
        typeText(document.activeElement, text);
        await tick();
      }),
    /** Make the focused field read `value` (see setFieldValue). */
    setValue: (value) =>
      act(async () => {
        setFieldValue(document.activeElement, value);
        await tick();
      }),
    value: () => handle.current.getValue(),
    live: () =>
      container.querySelector("[data-slot=outliner] > [aria-live=polite]")?.textContent ?? "",
    selection: () => [...contextOf(container).ol.latestSelection()],
    /** A key on whatever has focus (the tree, a field), the way a keyboard delivers it. */
    key: (key, init = {}) =>
      act(async () => {
        const target =
          document.activeElement && document.activeElement !== document.body
            ? document.activeElement
            : container.querySelector("[role=tree]");
        target.dispatchEvent(
          new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
        );
        await tick();
      }),
    click: (el, init = {}) =>
      act(async () => {
        el.dispatchEvent(
          new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, ...init }),
        );
        el.dispatchEvent(
          new window.MouseEvent("click", { bubbles: true, cancelable: true, ...init }),
        );
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
export const code = (key) =>
  /^[0-9]$/.test(key)
    ? `Digit${key}`
    : /^[a-z]$/i.test(key)
      ? `Key${key.toUpperCase()}`
      : undefined;
