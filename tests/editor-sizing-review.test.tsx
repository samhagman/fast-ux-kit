import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { StrictMode, useState } from "react";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
const nodes = [{ id: "a", text: "A sentence close to the available line width." }];
const descriptor = Object.getOwnPropertyDescriptor(
  dom.window.HTMLElement.prototype,
  "scrollHeight",
);
const originalObserver = globalThis.ResizeObserver;
afterEach(() => {
  cleanup();
  if (descriptor)
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", descriptor);
  else delete (dom.window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: originalObserver,
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
function measureByRowControl(selector: string) {
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      if (!(this instanceof dom.window.HTMLTextAreaElement)) return 0;
      return this.closest(".fast-ux-editor__row")?.querySelector(selector) ? 72 : 24;
    },
  });
}

test("changing drag-handle visibility resizes text although the root width is unchanged", () => {
  measureByRowControl(".fast-ux-editor__drag");
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} enableDrag={false} />);
  const input = view.container.querySelector("textarea")!;
  assert.equal(input.style.height, "24px");
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} enableDrag />);
  assert.equal(input.scrollHeight, 72, "the added row control reduces text width");
  assert.equal(input.style.height, "72px");
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} enableDrag={false} />);
  assert.equal(input.style.height, "24px", "removing a control shrinks the row too");
});

test("adding and removing the hover Info affordance resizes unchanged text", () => {
  measureByRowControl(".fast-ux-editor__info");
  const providers = [{ id: "info", hover: () => null }];
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  const input = view.container.querySelector("textarea")!;
  assert.equal(input.style.height, "24px");
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} hoverProviders={providers} />);
  assert.equal(input.scrollHeight, 72);
  assert.equal(input.style.height, "72px");
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  assert.equal(input.style.height, "24px");
});

test("replacing a row accessory renderer resizes without document changes", () => {
  measureByRowControl("[data-width-accessory]");
  let writes = 0;
  const onNodesChange = () => writes++;
  const view = render(
    <OutlineEditor defaultNodes={nodes} readOnly={false} onNodesChange={onNodesChange} />,
  );
  const input = view.container.querySelector("textarea")!;
  assert.equal(input.style.height, "24px");
  view.rerender(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      onNodesChange={onNodesChange}
      renderAccessory={() => <span data-width-accessory>Review status</span>}
    />,
  );
  assert.equal(input.scrollHeight, 72);
  assert.equal(input.style.height, "72px");
  assert.equal(writes, 0);
});

test("StrictMode observer and window listener teardown leave no post-unmount sizing work", async () => {
  let reads = 0;
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      reads++;
      return 48;
    },
  });
  const observers: { disconnected: boolean }[] = [];
  class Observer {
    disconnected = false;
    constructor() {
      observers.push(this);
    }
    observe() {}
    unobserve() {}
    disconnect() {
      this.disconnected = true;
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", { configurable: true, value: Observer });
  const view = render(
    <StrictMode>
      <OutlineEditor defaultNodes={nodes} readOnly={false} />
    </StrictMode>,
  );
  assert.equal(observers.filter((entry) => !entry.disconnected).length, 1);
  await act(async () => dom.window.dispatchEvent(new dom.window.Event("resize")));
  const afterLiveResize = reads;
  view.unmount();
  assert.equal(
    observers.every((entry) => entry.disconnected),
    true,
  );
  await act(async () => dom.window.dispatchEvent(new dom.window.Event("resize")));
  assert.equal(reads, afterLiveResize);
});

class TrackingObserver {
  static instances: TrackingObserver[] = [];
  readonly targets = new Set<Element>();
  observations = 0;
  removals = 0;
  disconnected = false;
  constructor(readonly callback: ResizeObserverCallback) {
    TrackingObserver.instances.push(this);
  }
  observe(element: Element) {
    this.targets.add(element);
    this.observations++;
  }
  unobserve(element: Element) {
    this.targets.delete(element);
    this.removals++;
  }
  disconnect() {
    this.disconnected = true;
    this.targets.clear();
  }
  notify(width: (element: Element) => number) {
    this.callback(
      [...this.targets].map(
        (target) => ({ target, contentRect: { width: width(target) } }) as ResizeObserverEntry,
      ),
      this as unknown as ResizeObserver,
    );
  }
}
function trackSizes() {
  TrackingObserver.instances = [];
  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: TrackingObserver,
  });
}

test("self-updating accessories resize only changed input widths and ignore height-only notifications", async () => {
  trackSizes();
  const reads = new Map<Element, number>();
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get(this: HTMLElement) {
      reads.set(this, (reads.get(this) ?? 0) + 1);
      return this.closest(".fast-ux-editor__row")?.querySelector('[data-width-accessory="wide"]')
        ? 72
        : 24;
    },
  });
  function Accessory() {
    const [wide, setWide] = useState(false);
    return (
      <button
        type="button"
        data-width-accessory={wide ? "wide" : "narrow"}
        onClick={() => setWide(!wide)}
      >
        Expand status
      </button>
    );
  }
  const view = render(
    <OutlineEditor
      defaultNodes={[...nodes, { id: "b", text: "Unaffected row" }]}
      readOnly={false}
      renderAccessory={(node) => (node.id === "a" ? <Accessory /> : null)}
    />,
  );
  const [first, second] = [...view.container.querySelectorAll("textarea")];
  const observer = TrackingObserver.instances[0]!;
  assert.ok(observer.targets.has(first!));
  assert.ok(observer.targets.has(second!));
  await act(async () =>
    observer.notify((element) => (element instanceof dom.window.HTMLTextAreaElement ? 360 : 600)),
  );
  reads.clear();
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Expand status" })));
  await act(async () =>
    observer.notify((element) => (element === first ? 180 : element === second ? 360 : 600)),
  );
  assert.equal(first!.style.height, "72px");
  assert.equal(second!.style.height, "24px");
  assert.equal(reads.get(first!), 1, "only the changed row is measured");
  assert.equal(reads.get(second!) ?? 0, 0);
  reads.clear();
  await act(async () =>
    observer.notify((element) => (element === first ? 180 : element === second ? 360 : 600)),
  );
  assert.equal(reads.size, 0, "own height writes do not trigger a feedback loop");
});

test("observer membership follows folded rows without observer churn on text edits", async () => {
  trackSizes();
  const view = render(
    <OutlineEditor
      defaultNodes={[{ id: "a", text: "Parent", children: [{ id: "b", text: "Child" }] }]}
      defaultExpandedIds={new Set(["a"])}
      readOnly={false}
    />,
  );
  const observer = TrackingObserver.instances[0]!;
  const parent = view.getByRole("textbox", { name: "Edit Parent" });
  const child = view.getByRole("textbox", { name: "Edit Child" });
  assert.ok(observer.targets.has(parent));
  assert.ok(observer.targets.has(child));
  const observed = observer.observations;
  await act(async () => fireEvent.change(parent, { target: { value: "Parent edited" } }));
  assert.equal(TrackingObserver.instances.length, 1);
  assert.equal(observer.observations, observed, "same DOM inputs are not reobserved per keystroke");
  assert.equal(observer.removals, 0);
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Collapse Parent edited" })),
  );
  assert.equal(observer.targets.has(child), false);
  assert.equal(observer.removals, 1);
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Expand Parent edited" })),
  );
  const restored = view.getByRole("textbox", { name: "Edit Child" });
  assert.ok(observer.targets.has(restored));
  assert.equal(observer.observations, observed + 1);
  assert.equal(TrackingObserver.instances.length, 1);
});

test("callbacks queued by an old observer cannot resize a new edit session", async () => {
  trackSizes();
  let reads = 0;
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      reads++;
      return 48;
    },
  });
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  const old = TrackingObserver.instances[0]!;
  const oldTargets = [...old.targets];
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly />);
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  reads = 0;
  await act(async () =>
    old.callback(
      oldTargets.map((target) => ({ target, contentRect: { width: 120 } }) as ResizeObserverEntry),
      old as unknown as ResizeObserver,
    ),
  );
  assert.equal(reads, 0);
  assert.equal(TrackingObserver.instances.length, 2);
});
