import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
const nodes = [{ id: "a", text: "A long sentence that wraps into several lines." }];
const originalScrollHeight = Object.getOwnPropertyDescriptor(
  dom.window.HTMLElement.prototype,
  "scrollHeight",
);
const originalObserver = globalThis.ResizeObserver;
afterEach(() => {
  cleanup();
  if (originalScrollHeight)
    Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", originalScrollHeight);
  else delete (dom.window.HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight;
  Object.defineProperty(globalThis, "ResizeObserver", {
    value: originalObserver,
    configurable: true,
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
test("entering edit mode sizes newly mounted textareas without requiring a text mutation", () => {
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return this instanceof dom.window.HTMLTextAreaElement ? 72 : 0;
    },
  });
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly />);
  assert.equal(view.container.querySelector("textarea"), null);
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  assert.equal(view.container.querySelector("textarea")?.style.height, "72px");
});
test("container-width and window changes resize text without content writes, and observers clean up", async () => {
  let measuredHeight = 48;
  let callback: ResizeObserverCallback | undefined;
  let observed: Element | undefined;
  let disconnected = false;
  let writes = 0;
  Object.defineProperty(dom.window.HTMLElement.prototype, "scrollHeight", {
    configurable: true,
    get() {
      return this instanceof dom.window.HTMLTextAreaElement ? measuredHeight : 0;
    },
  });
  class Observer {
    constructor(fn: ResizeObserverCallback) {
      callback = fn;
    }
    observe(element: Element) {
      observed = element;
    }
    unobserve() {}
    disconnect() {
      disconnected = true;
    }
  }
  Object.defineProperty(globalThis, "ResizeObserver", { value: Observer, configurable: true });
  const view = render(
    <OutlineEditor defaultNodes={nodes} readOnly={false} onNodesChange={() => writes++} />,
  );
  const input = view.container.querySelector("textarea")!;
  assert.equal(input.style.height, "48px");
  measuredHeight = 96;
  await act(async () =>
    callback?.(
      [{ target: observed!, contentRect: { width: 220 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    ),
  );
  assert.equal(input.style.height, "96px");
  measuredHeight = 120;
  await act(async () =>
    callback?.(
      [{ target: observed!, contentRect: { width: 220 } } as ResizeObserverEntry],
      {} as ResizeObserver,
    ),
  );
  assert.equal(
    input.style.height,
    "96px",
    "height-only observer notifications do not cause resize loops",
  );
  await act(async () => dom.window.dispatchEvent(new dom.window.Event("resize")));
  assert.equal(input.style.height, "120px");
  assert.equal(writes, 0);
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly />);
  assert.equal(disconnected, true);
});
