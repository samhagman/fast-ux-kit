import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "./components-dom.js";
import type { MachineDocument, MachineInspectionSession } from "../src/core/index.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { MachineGraphView } = await import("../src/machine-graph/index.js");
const { MachineTree } = await import("../src/machine-tree/index.js");
const { TooltipProvider } = await import("../src/components/ui/tooltip.js");

/*
 * `chrome="none"` shows only the machine: no toolbar, status bar, inspector, panel, phone shell,
 * minimap or controls, fitted into its box, and nothing to pan, zoom, drag, tab to or press.
 * jsdom has no layout, so sizes are given here and a ResizeObserver fake says when they change;
 * the browser check (scripts/test-machine-presentation-browser.mjs) measures the real thing, and
 * checks that a phone-width box keeps the plain canvas (jsdom cannot run the phone shell).
 */
const rootWidth = 1280;
let canvas = { width: 1280, height: 720 };
let content = { width: 800, height: 600 };
const observers = new Set<FakeResizeObserver>();
class FakeResizeObserver {
  readonly targets = new Set<Element>();
  constructor(readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.targets.add(target);
    observers.add(this);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
    observers.delete(this);
  }
}
Object.defineProperty(window.Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
for (const scope of [globalThis, window])
  Object.defineProperty(scope, "ResizeObserver", { value: FakeResizeObserver, configurable: true });
const sized = (el: HTMLElement, key: "width" | "height") =>
  el.hasAttribute("data-mt-canvas") ? canvas[key] : 0;
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return sized(this, "width");
  },
});
Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return sized(this, "height");
  },
});
Object.defineProperty(window.HTMLElement.prototype, "offsetWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute("data-mt-fit") ? content.width : 0;
  },
});
Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute("data-mt-fit") ? content.height : 0;
  },
});
// The graph picks its phone shell from its own width.
const realRect = window.HTMLElement.prototype.getBoundingClientRect;
Object.defineProperty(window.HTMLElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value(this: HTMLElement) {
    if (this.getAttribute("data-slot") !== "machine-graph") return realRect.call(this);
    return {
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: rootWidth,
      bottom: 720,
      width: rootWidth,
      height: 720,
    };
  },
});
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    media,
    matches: media === "(hover: hover)",
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }),
});
const settle = async (times = 12) => {
  for (let i = 0; i < times; i++) await act(() => new Promise((done) => setTimeout(done, 25)));
};
/** Tells the tree's canvas and picture observers their size changed (React Flow keeps its own). */
async function resize() {
  await act(async () => {
    for (const observer of [...observers]) {
      const targets = [...observer.targets].filter(
        (target) => target.hasAttribute("data-mt-canvas") || target.hasAttribute("data-mt-fit"),
      );
      if (targets.length)
        observer.callback(
          targets.map((target) => ({ target }) as ResizeObserverEntry),
          observer as unknown as ResizeObserver,
        );
    }
  });
  await settle(2);
}
afterEach(() => {
  cleanup();
  canvas = { width: 1280, height: 720 };
  content = { width: 800, height: 600 };
});

// An invented order: placed, then packed or cancelled.
const doc: MachineDocument = {
  version: 1,
  rootId: "order",
  machines: [
    {
      id: "order",
      label: "Order",
      initialId: "placed",
      nodes: [
        { id: "placed", label: "Placed", kind: "atomic" },
        { id: "packed", label: "Packed", kind: "atomic" },
        { id: "cancelled", label: "Cancelled", kind: "final" },
      ],
      transitions: [
        { id: "pack", sourceId: "placed", targetId: "packed", event: "PACK" },
        {
          id: "cancel",
          sourceId: "placed",
          targetId: "cancelled",
          event: "CANCEL",
          guard: "early",
        },
      ],
    },
  ],
};

const graph = (props: Record<string, unknown> = {}) =>
  render(
    <TooltipProvider>
      <MachineGraphView defaultDocument={doc} layoutWorker={{ enabled: false }} {...props} />
    </TooltipProvider>,
  );
const tree = (props: Record<string, unknown> = {}) =>
  render(
    <TooltipProvider>
      <MachineTree document={doc} {...props} />
    </TooltipProvider>,
  );

/** Everything a keyboard user could Tab to or a pointer could press that is not inside an inert subtree. */
function liveControls(root: Element) {
  return [
    ...root.querySelectorAll<HTMLElement>("button, a[href], input, textarea, select, [tabindex]"),
  ].filter((el) => !el.closest("[inert]") && el.getAttribute("tabindex") !== "-1");
}

/** The accessible name and description of the presentation, from its own attributes. */
function named(root: HTMLElement) {
  const describedBy = root.getAttribute("aria-describedby");
  return {
    role: root.getAttribute("role"),
    name: root.getAttribute("aria-label"),
    description: describedBy ? root.ownerDocument.getElementById(describedBy)?.textContent : null,
  };
}

/* ───────────────────────────── Machine Graph ───────────────────────────── */

test("graph chrome=none: only the machine, no toolbar, status bar, inspector, minimap or controls", async () => {
  const { container } = graph({ chrome: "none" });
  await settle();
  const root = container.querySelector<HTMLElement>("[data-slot=machine-graph]")!;
  assert.equal(root.dataset.chrome, "none");
  assert.ok(container.querySelectorAll(".react-flow__node").length >= 3, "the machine is drawn");
  for (const [what, selector] of [
    ["toolbar", "[data-mv-toolbar]"],
    ["status bar", "[data-mv-statusbar]"],
    ["inspector", "aside[aria-label=Inspector]"],
    ["minimap", ".react-flow__minimap"],
    ["zoom, fit or palette", "[data-mv-occluder]"],
    ["pan hint", "[data-mv-overflow]"],
    ["peek bar", "[data-slot=machine-peek]"],
    ["sheet", "[data-slot=machine-sheet-host]"],
  ] as const)
    assert.equal(container.querySelector(selector), null, `no ${what}`);
  const shown = container.cloneNode(true) as HTMLElement;
  for (const hidden of shown.querySelectorAll("[hidden], .sr-only")) hidden.remove();
  assert.equal(shown.textContent?.includes("valid"), false, "no validity status");
  assert.equal(shown.textContent?.includes("3 states"), false, "no state count");
});

test("graph chrome=none: names itself, describes the machine, and has nothing to tab to", async () => {
  const { container } = graph({ chrome: "none" });
  await settle();
  const root = container.querySelector<HTMLElement>("[data-slot=machine-graph]")!;
  const { role, name, description } = named(root);
  assert.equal(role, "img");
  assert.equal(name, "Order statechart");
  assert.match(description ?? "", /3 states: Placed, Packed and Cancelled/);
  assert.match(description ?? "", /PACK from Placed to Packed/);
  assert.match(description ?? "", /CANCEL \[early\] from Placed to Cancelled/);
  assert.ok(root.querySelector("[inert] .react-flow"), "the drawing is inert");
  assert.equal(root.querySelector(".react-flow__node[tabindex]"), null, "nodes are not tab stops");
  assert.equal(root.querySelector(".react-flow__edge[tabindex]"), null, "edges are not tab stops");
  assert.deepEqual(
    liveControls(root).map((el) => el.outerHTML.slice(0, 80)),
    [],
    "nothing outside the inert drawing can be focused or pressed",
  );
});

test("graph chrome=none: static, so the wheel and a drag reach the page, and nothing is draggable", async () => {
  const { container } = graph({ chrome: "none" });
  await settle();
  const pane = container.querySelector<HTMLElement>(".react-flow__pane")!;
  assert.equal(pane.classList.contains("draggable"), false, "the pane does not pan on drag");
  assert.equal(container.querySelector(".react-flow__node.draggable"), null, "no node drags");
  const wheel = new window.WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
  pane.dispatchEvent(wheel);
  assert.equal(wheel.defaultPrevented, false, "the wheel scrolls the page");
});

test("graph chrome=none: read-only even with an editable document, and its shortcuts stay off", async () => {
  const { container } = graph({ chrome: "none" });
  await settle();
  const root = container.querySelector<HTMLElement>("[data-slot=machine-graph]")!;
  fireEvent.pointerEnter(root);
  // F fits the full view (and ? and ⌘K open its dialogs) while the pointer is over it.
  const press = new window.KeyboardEvent("keydown", { key: "f", bubbles: true, cancelable: true });
  window.document.body.dispatchEvent(press);
  await settle(2);
  assert.equal(press.defaultPrevented, false, "F is the page's");
  assert.equal(container.querySelector("[aria-label='Add to machine']"), null, "no palette");
});

test("graph default: the full view is unchanged (toolbar, status bar, inspector, focusable nodes)", async () => {
  const { container } = graph();
  await settle();
  const root = container.querySelector<HTMLElement>("[data-slot=machine-graph]")!;
  assert.equal(root.hasAttribute("data-chrome"), false);
  assert.equal(root.getAttribute("role"), null);
  assert.ok(container.querySelector("[data-mv-toolbar]"));
  assert.ok(container.querySelector("[data-mv-statusbar]"));
  assert.ok(container.querySelector("aside[aria-label=Inspector]"));
  assert.ok(container.querySelector(".react-flow__node[tabindex]"), "nodes are tab stops");
  assert.equal(container.querySelector("[inert]"), null);
  const pane = container.querySelector<HTMLElement>(".react-flow__pane")!;
  assert.ok(pane.classList.contains("draggable"), "the pane pans");
});

/** A host run of the order, now in Packed. */
const session: MachineInspectionSession = {
  source: "committed",
  connection: "connected",
  frames: [{ id: "f1", timestamp: 1, actorId: "root", machineId: "order", activeIds: ["packed"] }],
};

test("graph chrome=none: an inspection session still marks where the run is", async () => {
  const { container } = graph({ chrome: "none", inspectionSession: session });
  await settle();
  const packed = container.querySelector<HTMLElement>('.react-flow__node[data-id="packed"]')!;
  assert.equal(packed.querySelector("[data-sim]")?.getAttribute("data-sim"), "active");
});

/* ───────────────────────────── Machine Tree ───────────────────────────── */

test("tree chrome=none: only the machine, no toolbar, run footer or panel", async () => {
  const { container } = tree({ chrome: "none" });
  await settle(2);
  const root = container.querySelector<HTMLElement>("[data-slot=machine-tree]")!;
  assert.equal(root.dataset.chrome, "none");
  assert.ok(container.textContent?.includes("Packed"), "the machine is drawn");
  assert.equal(container.querySelector("[data-mt-toolbar]"), null, "no toolbar");
  assert.equal(
    [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Simulate")),
    undefined,
    "no run footer",
  );
  assert.equal(container.querySelector("[data-slot=machine-sheet-host]"), null, "no sheet");
  const shown = container.cloneNode(true) as HTMLElement;
  for (const hidden of shown.querySelectorAll("[hidden], .sr-only")) hidden.remove();
  assert.equal(shown.textContent?.includes("3 states"), false, "no state count");
});

test("tree chrome=none: names itself, describes the machine, and has nothing to tab to", async () => {
  const { container } = tree({ chrome: "none" });
  await settle(2);
  const root = container.querySelector<HTMLElement>("[data-slot=machine-tree]")!;
  const { role, name, description } = named(root);
  assert.equal(role, "img");
  assert.equal(name, "Order state hierarchy");
  assert.match(description ?? "", /3 states: Placed, Packed and Cancelled/);
  assert.match(description ?? "", /PACK from Placed to Packed/);
  assert.equal(container.querySelector("[role=tree]"), null, "no tree to navigate");
  assert.ok(root.querySelector("[inert] [data-mt-item]"), "the drawing is inert");
  assert.deepEqual(
    liveControls(root).map((el) => el.outerHTML.slice(0, 80)),
    [],
  );
  assert.equal(named(root).name, "Order state hierarchy");
  cleanup();
  const labelled = tree({ chrome: "none", label: "Returns" }).container;
  await settle(2);
  assert.equal(
    labelled.querySelector("[data-slot=machine-tree]")!.getAttribute("aria-label"),
    "Returns state hierarchy",
    "the label prop names it",
  );
});

test("tree chrome=none: the whole machine is scaled to fit its box, centred, and refitted on resize", async () => {
  canvas = { width: 400, height: 720 };
  content = { width: 800, height: 600 };
  const { container } = tree({ chrome: "none" });
  await settle(2);
  const scroller = container.querySelector<HTMLElement>("[data-mt-canvas]")!;
  const fit = container.querySelector<HTMLElement>("[data-mt-fit]")!;
  assert.ok(scroller.className.includes("overflow-hidden"), "nothing to scroll inside");
  assert.equal(fit.style.transform, "scale(0.5)", "800px wide in 400px: half size");
  assert.equal(fit.parentElement!.style.width, "400px");
  assert.equal(fit.parentElement!.style.height, "300px");
  assert.ok(scroller.className.includes("place-items-center"), "centred in the box");
  canvas = { width: 1600, height: 300 };
  await resize();
  assert.equal(fit.style.transform, "scale(0.5)", "600px tall in 300px: half size");
  canvas = { width: 1600, height: 1200 };
  await resize();
  assert.equal(fit.style.transform, "scale(1)", "never enlarged past its own size");
  assert.equal(fit.parentElement!.style.width, "800px");
});

test("tree chrome=none: an inspection session still marks where the run is", async () => {
  const { container } = tree({ chrome: "none", inspectionSession: session });
  await settle(2);
  const active = [...container.querySelectorAll<HTMLElement>("[data-active=true]")];
  assert.ok(
    active.some((el) => el.textContent?.includes("Packed")),
    "Packed is the active leaf",
  );
});

test("tree chrome=none: ⌘F and ⌘K stay the page's", async () => {
  const { container } = tree({ chrome: "none" });
  await settle(2);
  fireEvent.pointerDown(container.querySelector("[data-mt-canvas]")!);
  const press = new window.KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.document.body.dispatchEvent(press);
  assert.equal(press.defaultPrevented, false);
});

test("tree default: the full view is unchanged (toolbar, footer, a navigable tree)", async () => {
  const { container } = tree();
  await settle(2);
  const root = container.querySelector<HTMLElement>("[data-slot=machine-tree]")!;
  assert.equal(root.hasAttribute("data-chrome"), false);
  assert.equal(root.getAttribute("role"), null);
  assert.ok(container.querySelector("[data-mt-toolbar]"));
  assert.ok(container.querySelector("[role=tree]"));
  assert.equal(container.querySelector("[inert]"), null);
  assert.equal(container.querySelector("[data-mt-fit]"), null);
  assert.ok(
    container.querySelector<HTMLElement>("[data-mt-canvas]")!.className.includes("overflow-auto"),
  );
  fireEvent.pointerDown(container.querySelector("[data-mt-canvas]")!);
  const press = new window.KeyboardEvent("keydown", {
    key: "f",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  });
  window.document.body.dispatchEvent(press);
  assert.equal(press.defaultPrevented, true, "control: the full tree owns ⌘F");
});
