import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import "./components-dom.js";
import { machineTreeRowId, type MachineDocument } from "../src/core/index.js";
const { act, cleanup, render } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { hydrateRoot } = await import("react-dom/client");
const { MachineTree } = await import("../src/machine-tree/index.js");
const { TooltipProvider } = await import("../src/components/ui/tooltip.js");

/*
 * A narrow tree stacks a state's alternatives, each on an elbow off the spine with its route
 * written once; a wide one stands them side by side. jsdom has no layout, so the canvas reports
 * the width the test gives it and a ResizeObserver fake says when it changed.
 */
let canvasWidth = 1280;
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
for (const scope of [globalThis, window])
  Object.defineProperty(scope, "ResizeObserver", {
    value: FakeResizeObserver,
    configurable: true,
  });
Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get(this: HTMLElement) {
    return this.hasAttribute("data-mt-canvas") ? canvasWidth : 0;
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
const frame = () => new Promise((resolve) => setTimeout(resolve, 20));
async function resize(width: number) {
  canvasWidth = width;
  await act(async () => {
    for (const observer of [...observers])
      observer.callback(
        [...observer.targets].map((target) => ({ target }) as ResizeObserverEntry),
        observer as unknown as ResizeObserver,
      );
  });
  await act(frame);
}
afterEach(() => {
  cleanup();
  canvasWidth = 1280;
});

// An invented trial: paid for, handed to sales, or it runs out. Paying is reached two ways, so it is
// on the spine; Sales call and Expired are the alternatives.
const doc: MachineDocument = {
  version: 1,
  rootId: "subscription",
  machines: [
    {
      id: "subscription",
      label: "Subscription",
      initialId: "trial",
      nodes: [
        { id: "trial", label: "Trial", kind: "atomic" },
        { id: "sales_call", label: "Sales call", kind: "atomic" },
        { id: "paying", label: "Paying", kind: "atomic" },
        { id: "expired", label: "Expired", kind: "final" },
        { id: "cancelled", label: "Cancelled", kind: "final" },
      ],
      transitions: [
        { id: "paid", sourceId: "trial", targetId: "paying", event: "PAID" },
        { id: "big", sourceId: "trial", targetId: "sales_call", event: "BIG_ACCOUNT" },
        { id: "lapse", sourceId: "trial", targetId: "expired", event: "after 14d" },
        { id: "closed", sourceId: "sales_call", targetId: "paying", event: "CLOSED" },
        { id: "cancel", sourceId: "paying", targetId: "cancelled", event: "CANCEL" },
      ],
    },
  ],
};
const ROUTES = ["PAID", "BIG_ACCOUNT", "after 14d"];
const state = (id: string) => machineTreeRowId("node", "subscription", id);
const transition = (id: string) => machineTreeRowId("transition", "subscription", id);

function tree(props: Partial<React.ComponentProps<typeof MachineTree>> = {}) {
  return (
    <TooltipProvider>
      <MachineTree document={doc} {...props} />
    </TooltipProvider>
  );
}
const fork = (root: ParentNode) =>
  [...root.querySelectorAll<HTMLElement>("[data-mt-fork]")].find(
    (el) =>
      el.querySelector(":scope > [data-mt-item]")?.getAttribute("data-row-id") === state("trial"),
  )!;
const item = (root: ParentNode, rowId: string) =>
  root.querySelector<HTMLElement>(`[data-mt-item][data-row-id='${CSS.escape(rowId)}']`)!;
/** How many times a route's name is written on the canvas (arrival notes under a state aside). */
function written(root: ParentNode, name: string) {
  const canvas = root.querySelector("[data-mt-canvas]")!.cloneNode(true) as HTMLElement;
  for (const note of canvas.querySelectorAll("[data-mt-arrivals], [hidden], .sr-only"))
    note.remove();
  const text = [...canvas.querySelectorAll("*")]
    .flatMap((el) => [...el.childNodes].filter((node) => node.nodeType === 3))
    .map((node) => node.textContent ?? "")
    .join("\n");
  return text.split(name).length - 1;
}
/** The stacked picture: each alternative's label on an elbow, its states in the row right under it. */
function assertStacked(root: ParentNode) {
  const at = fork(root);
  assert.equal(at.dataset.mtFork, "stacked");
  assert.equal(root.querySelector("[data-mt-caption]"), null, "no caption repeats a route");
  assert.equal(root.querySelector('[data-mt-routes="head"]'), null, "no column heads");
  for (const name of ROUTES) assert.equal(written(root, name), 1, `${name} is written once`);
  const row = (el: Element) => Number((el as HTMLElement).style.getPropertyValue("--mt-row"));
  const owner = item(root, state("trial"));
  for (const [routeId, stateId] of [
    ["big", "sales_call"],
    ["lapse", "expired"],
  ] as const) {
    const label = item(root, transition(routeId));
    const list = label.closest("[data-mt-routes]")!;
    assert.equal(list.getAttribute("data-mt-routes"), "branch");
    assert.ok(list.parentElement === owner, "the label is still the state's own route row");
    assert.equal(
      label.querySelector(":scope > [data-mt-tick]")?.getAttribute("data-mt-tick"),
      "elbow",
    );
    const block = item(root, state(stateId)).closest("[data-mt-col]")!;
    assert.ok(block.parentElement === at, `${stateId} hangs in the fork`);
    assert.equal(row(block), row(list) + 1, `${stateId} is right under its label`);
  }
  const onward = item(root, transition("paid")).closest("[data-mt-routes]")!;
  assert.equal(onward.getAttribute("data-mt-routes"), "main", "PAID carries on down the spine");
}
function assertColumns(root: ParentNode) {
  const at = fork(root);
  assert.equal(at.dataset.mtFork, "columns");
  assert.equal(at.style.getPropertyValue("--mt-cols"), "3");
  const heads = [
    ...item(root, state("trial")).querySelectorAll(':scope > [data-mt-routes="head"]'),
  ];
  assert.deepEqual(
    heads.map((head) => [...head.querySelectorAll("[data-mt-item]")].map((el) => el.dataset.rowId)),
    [[transition("paid")], [transition("big")], [transition("lapse")]],
    "each label heads its column, the direct route first",
  );
  for (const name of ROUTES) assert.equal(written(root, name), 1, `${name} is written once`);
}

test("a narrow canvas stacks the alternatives, each route written once", async () => {
  canvasWidth = 375;
  const view = render(tree());
  await act(frame);
  assertStacked(view.container);
});

test("a wide canvas still stands small alternatives side by side", async () => {
  const view = render(tree());
  await act(frame);
  assertColumns(view.container);
});

test("the 520px threshold matches the old container query: 520 is narrow, 521 is wide", async () => {
  canvasWidth = 520;
  const view = render(tree());
  await act(frame);
  assert.equal(fork(view.container).dataset.mtFork, "stacked");
  await resize(521);
  assert.equal(fork(view.container).dataset.mtFork, "columns");
  // A canvas with no size yet (hidden, or not laid out) keeps the layout it has.
  await resize(0);
  assert.equal(fork(view.container).dataset.mtFork, "columns");
});

test("resizing across the threshold switches the layout and keeps focus and selection", async () => {
  const view = render(tree({ defaultSelectedId: state("sales_call") }));
  await act(frame);
  assertColumns(view.container);
  const focused = () => (document.activeElement as HTMLElement | null)?.dataset.rowId;
  const selected = () =>
    [...view.container.querySelectorAll("[data-mt-item][aria-selected=true]")].map(
      (el) => (el as HTMLElement).dataset.rowId,
    );
  // A state inside an alternative keeps its own element: the same node, still focused.
  const sales = item(view.container, state("sales_call"));
  act(() => sales.focus());
  assert.equal(focused(), state("sales_call"));
  await resize(375);
  assertStacked(view.container);
  assert.ok(item(view.container, state("sales_call")) === sales, "not remounted");
  assert.equal(focused(), state("sales_call"));
  assert.deepEqual(selected(), [state("sales_call")]);
  // A route row moves to another list, so its element is new: focus follows it there.
  act(() => item(view.container, transition("big")).focus());
  await resize(1280);
  assertColumns(view.container);
  assert.equal(focused(), transition("big"));
  assert.equal(item(view.container, transition("big")).tabIndex, 0, "it is the roving stop");
  assert.deepEqual(selected(), [state("sales_call")]);
  await resize(375);
  assert.equal(focused(), transition("big"));
  // Keyboard order is still DOM order after the switch: Down from Trial reaches its routes in turn.
  const order = [...view.container.querySelectorAll<HTMLElement>("[data-mt-item]")].map(
    (el) => el.dataset.rowId,
  );
  const from = order.indexOf(state("trial"));
  assert.deepEqual(order.slice(from + 1, from + 3), [transition("paid"), transition("big")]);
});

test("server markup hydrates without a mismatch, then takes the canvas's width", async () => {
  for (const width of [1280, 375]) {
    const html = renderToString(tree());
    assert.match(html, /data-mt-fork="columns"/, "a server cannot measure: it draws columns");
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.appendChild(host);
    const serverTree = host.querySelector('[role="tree"]')!.outerHTML;
    canvasWidth = width;
    const problems: unknown[] = [];
    const error = console.error;
    console.error = (...args: unknown[]) => {
      if (!String(args[0]).includes("not wrapped in act")) problems.push(args);
    };
    let root: ReturnType<typeof hydrateRoot> | undefined;
    try {
      await act(async () => {
        root = hydrateRoot(host, tree(), {
          onRecoverableError: (cause) => problems.push(cause),
        });
      });
      await act(frame);
    } finally {
      console.error = error;
    }
    assert.deepEqual(problems, [], `hydrates cleanly at ${width}px`);
    if (width > 520) {
      assertColumns(host);
      assert.equal(
        host.querySelector('[role="tree"]')!.outerHTML,
        serverTree,
        "a wide canvas keeps the server's markup",
      );
    } else assertStacked(host);
    await act(async () => root!.unmount());
    host.remove();
  }
});

test("a host can ask for one layout whatever the width", async () => {
  canvasWidth = 375;
  const view = render(tree({ alternatives: "columns" }));
  await act(frame);
  assert.equal(fork(view.container).dataset.mtFork, "columns");
  view.rerender(tree({ alternatives: "stacked" }));
  await resize(1280);
  assert.equal(fork(view.container).dataset.mtFork, "stacked");
  // Server markup follows the host's choice, so a host that knows it is narrow never shifts.
  assert.match(renderToString(tree({ alternatives: "stacked" })), /data-mt-fork="stacked"/);
});

test("right to left: a narrow canvas stacks the same way, mirrored by logical properties", async () => {
  canvasWidth = 375;
  const view = render(tree({ dir: "rtl" }));
  await act(frame);
  assert.equal(
    view.container.querySelector('[data-slot="machine-tree"]')!.getAttribute("dir"),
    "rtl",
  );
  assertStacked(view.container);
  await resize(1280);
  assertColumns(view.container);
  // The stacked fork is drawn with logical properties only, so the elbows sit on the inline start.
  const css = readFileSync(
    new URL("../src/machine-tree/machine-tree.css", import.meta.url),
    "utf8",
  );
  const rules = [...css.matchAll(/([^{}]*\[data-mt-fork="stacked"\][^{}]*)\{([^}]*)\}/g)];
  assert.ok(rules.length > 0);
  for (const [, selector, body] of rules)
    assert.doesNotMatch(
      body!,
      /(^|[\s;-])(left|right)\s*:|margin-(left|right)|padding-(left|right)|border-(left|right)/,
      selector,
    );
});
