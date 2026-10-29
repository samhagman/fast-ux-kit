import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef, useMemo, useRef, type ComponentProps, type RefCallback } from "react";
import { renderToString } from "react-dom/server";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const K = await import("../src/components/ark-advanced.js");
const { EnvironmentProvider } = await import("@ark-ui/react/environment");
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
type Api = ReturnType<typeof K.useTour>;
type BackdropProps = ComponentProps<typeof K.Tour.Backdrop>;
const restores: (() => void)[] = [];
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  for (const restore of restores.splice(0).reverse()) restore();
  assert.deepEqual(browserErrors.splice(0), []);
});
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
function replace(object: object, key: string, descriptor: PropertyDescriptor) {
  const previous = Object.getOwnPropertyDescriptor(object, key);
  Object.defineProperty(object, key, { configurable: true, ...descriptor });
  restores.push(() => {
    if (previous) Object.defineProperty(object, key, previous);
    else Reflect.deleteProperty(object, key);
  });
}
class SizeObserver {
  static all: SizeObserver[] = [];
  targets = new Set<Element>();
  disconnected = false;
  constructor(readonly callback: () => void) {
    SizeObserver.all.push(this);
  }
  observe(element: Element) {
    this.targets.add(element);
  }
  unobserve(element: Element) {
    this.targets.delete(element);
  }
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback();
  }
}
function observeSizes(window: Window) {
  SizeObserver.all = [];
  replace(window, "ResizeObserver", { value: SizeObserver });
}
function Harness({ capture, backdrop }: { capture: (api: Api) => void; backdrop?: BackdropProps }) {
  const target = useRef<HTMLButtonElement>(null);
  const steps = useMemo(
    () => [
      {
        id: "target",
        type: "tooltip" as const,
        target: () => target.current,
        title: "Target",
        description: "Description",
      },
      { id: "dialog", type: "dialog" as const, title: "Dialog", description: "Description" },
    ],
    [],
  );
  const api = K.useTour({ steps, closeOnInteractOutside: false });
  capture(api);
  return (
    <>
      <button ref={target} type="button">
        Target action
      </button>
      <K.Tour.Root tour={api}>
        <K.Tour.Backdrop data-testid="backdrop" {...backdrop} />
        <K.Tour.Positioner>
          <K.Tour.Content>
            <K.Tour.Title>{api.step?.title}</K.Tour.Title>
            <K.Tour.Description>Description</K.Tour.Description>
            <K.Tour.CloseTrigger>Close</K.Tour.CloseTrigger>
          </K.Tour.Content>
        </K.Tour.Positioner>
      </K.Tour.Root>
    </>
  );
}
async function start(getApi: () => Api, id = "target") {
  await act(async () => getApi().start(id));
  await waitFor(() => assert.equal(getApi().open, true));
  await settle();
}

test("document-space backdrop grows and shrinks without measuring its own old height or changing owner coordinates", async () => {
  observeSizes(window);
  let api!: Api;
  let baseHeight = 1800;
  let measurements = 0;
  let backdrop: HTMLElement | null = null;
  replace(document.documentElement, "scrollHeight", {
    get: () => {
      if (backdrop?.style.height === "0px") measurements++;
      return Math.max(baseHeight, parseFloat(backdrop?.style.height ?? "0") || 0);
    },
  });
  const view = render(
    <Harness
      capture={(value) => {
        api = value;
      }}
    />,
  );
  await start(() => api);
  backdrop = view.getByTestId("backdrop");
  await waitFor(() => assert.equal(backdrop!.style.height, "1800px"));
  assert.equal(backdrop.style.position, "absolute");
  assert.equal(backdrop.style.inset, "0");
  assert.match(backdrop.style.clipPath, /^path\(/);
  const observer = SizeObserver.all.find((item) => item.targets.has(document.documentElement))!;
  assert.ok(observer.targets.has(document.body));
  baseHeight = 2300;
  const before = measurements;
  act(() => {
    for (let i = 0; i < 10; i++) observer.fire();
  });
  await settle();
  assert.equal(backdrop.style.height, "2300px");
  assert.equal(
    measurements,
    before + 1,
    "resize callbacks coalesce and self style mutations do not loop",
  );
  baseHeight = 900;
  act(() => observer.fire());
  await waitFor(() => assert.equal(backdrop!.style.height, "900px"));
  assert.equal(
    document.documentElement.scrollHeight,
    900,
    "old backdrop height cannot pin document extent",
  );
  const beforeNoise = measurements;
  act(() => backdrop!.setAttribute("aria-label", "Non-layout change"));
  await settle();
  assert.equal(measurements, beforeNoise);
  act(() => observer.fire());
  view.unmount();
  const afterUnmount = measurements;
  assert.equal(observer.disconnected, true);
  act(() => observer.fire());
  await settle();
  assert.equal(
    measurements,
    afterUnmount,
    "late observer callbacks cannot remeasure a detached node",
  );
});

test("layout mutations catch absolute content extent changes without a body resize", async () => {
  observeSizes(window);
  let api!: Api;
  let baseHeight = 1200;
  replace(document.documentElement, "scrollHeight", { get: () => baseHeight });
  const view = render(
    <Harness
      capture={(value) => {
        api = value;
      }}
    />,
  );
  await start(() => api);
  const backdrop = view.getByTestId("backdrop");
  const extra = document.createElement("div");
  extra.style.position = "absolute";
  act(() => {
    baseHeight = 2100;
    document.body.append(extra);
  });
  await waitFor(() => assert.equal(backdrop.style.height, "2100px"));
  act(() => {
    baseHeight = 1000;
    extra.remove();
  });
  await waitFor(() => assert.equal(backdrop.style.height, "1000px"));
});

test("closed and dialog states clear automatic height while consumer height and blockSize remain authoritative", async () => {
  observeSizes(window);
  replace(document.documentElement, "scrollHeight", { value: 1600 });
  let api!: Api;
  const capture = (value: Api) => {
    api = value;
  };
  const view = render(<Harness capture={capture} />);
  assert.equal(view.getByTestId("backdrop").style.height, "");
  assert.equal(
    SizeObserver.all.some((item) => item.targets.has(document.documentElement)),
    false,
  );
  await start(() => api);
  assert.equal(view.getByTestId("backdrop").style.height, "1600px");
  await act(async () => api.setStep("dialog"));
  await waitFor(() => assert.equal(view.getByTestId("backdrop").style.position, "fixed"));
  assert.equal(view.getByTestId("backdrop").style.height, "");
  assert.ok(
    SizeObserver.all
      .filter((item) => item.targets.has(document.documentElement))
      .every((item) => item.disconnected),
  );
  await act(async () => api.setStep("target"));
  await waitFor(() => assert.equal(view.getByTestId("backdrop").style.height, "1600px"));
  view.rerender(<Harness capture={capture} backdrop={{ style: { height: 333, opacity: 0.8 } }} />);
  assert.equal(view.getByTestId("backdrop").style.height, "333px");
  assert.equal(view.getByTestId("backdrop").style.opacity, "0.8");
  view.rerender(<Harness capture={capture} backdrop={{ style: { blockSize: "44rem" } }} />);
  assert.equal(view.getByTestId("backdrop").style.height, "");
  assert.equal(view.getByTestId("backdrop").style.blockSize, "44rem");
  view.rerender(
    <Harness
      capture={capture}
      backdrop={{ asChild: true, children: <div style={{ height: 222 }} /> }}
    />,
  );
  assert.equal(view.getByTestId("backdrop").style.height, "222px");
  view.rerender(
    <Harness
      capture={capture}
      backdrop={{ asChild: true, children: <div style={{ blockSize: "33rem" }} /> }}
    />,
  );
  assert.equal(view.getByTestId("backdrop").style.height, "");
  assert.equal(view.getByTestId("backdrop").style.blockSize, "33rem");
  assert.ok(
    SizeObserver.all
      .filter((item) => item.targets.has(document.documentElement))
      .every((item) => item.disconnected),
  );
  view.rerender(<Harness capture={capture} />);
  await waitFor(() => assert.equal(view.getByTestId("backdrop").style.height, "1600px"));
  await act(async () => fireEvent.click(view.getByRole("button", { name: /close/i })));
  await waitFor(() => assert.equal(api.open, false));
  assert.equal(view.getByTestId("backdrop").style.height, "");
});

test("undefined host and asChild sizing values do not suppress automatic height or other child styles", async () => {
  observeSizes(window);
  replace(document.documentElement, "scrollHeight", { value: 1750 });
  let api!: Api;
  const capture = (value: Api) => {
    api = value;
  };
  const child = createRef<HTMLDivElement>();
  const view = render(
    <Harness
      capture={capture}
      backdrop={{ style: { height: undefined, blockSize: undefined, opacity: 0.7 } }}
    />,
  );
  await start(() => api);
  assert.equal(view.getByTestId("backdrop").style.height, "1750px");
  view.rerender(
    <Harness
      capture={capture}
      backdrop={{
        asChild: true,
        style: { height: undefined, opacity: 0.7 },
        children: (
          <div ref={child} style={{ height: undefined, blockSize: undefined, opacity: 0.6 }} />
        ),
      }}
    />,
  );
  await waitFor(() => assert.equal(view.getByTestId("backdrop").style.height, "1750px"));
  assert.equal(view.getByTestId("backdrop").style.opacity, "0.6");
  assert.equal(child.current === view.getByTestId("backdrop"), true);
  await act(async () => api.setStep("dialog"));
  await waitFor(() => assert.equal(view.getByTestId("backdrop").style.height, ""));
  assert.equal(view.getByTestId("backdrop").style.opacity, "0.6");
});

test("typed refs, cleanup callbacks, asChild and host props retain the owner's contract", async () => {
  let api!: Api;
  let setups = 0,
    cleanups = 0,
    nullCalls = 0,
    presses = 0;
  const callback: RefCallback<HTMLDivElement> = (node) => {
    if (!node) {
      nullCalls++;
      return;
    }
    setups++;
    assert.equal(node.tagName, "SECTION");
    return () => {
      cleanups++;
    };
  };
  const child = createRef<HTMLElement>();
  const capture = (value: Api) => {
    api = value;
  };
  const view = render(
    <Harness
      capture={capture}
      backdrop={{
        ref: callback,
        asChild: true,
        className: "host-backdrop",
        style: { height: 321 },
        onClick: () => {
          presses++;
        },
        children: <section ref={child} data-host="retained" />,
      }}
    />,
  );
  const element = view.getByTestId("backdrop");
  assert.equal(child.current === element, true);
  assert.ok(element.classList.contains("fux-tour__backdrop"));
  assert.ok(element.classList.contains("host-backdrop"));
  assert.equal(element.dataset.host, "retained");
  await start(() => api);
  await act(async () => fireEvent.click(element));
  assert.equal(presses, 1);
  assert.equal(element.style.height, "321px");
  const replacement = createRef<HTMLDivElement>();
  view.rerender(<Harness capture={capture} backdrop={{ ref: replacement }} />);
  assert.equal(cleanups, setups);
  assert.equal(nullCalls, 0, "React19 cleanup callbacks do not also receive a synthetic null");
  assert.equal(replacement.current === view.getByTestId("backdrop"), true);
  assert.equal(child.current, null);
  view.unmount();
  assert.equal(replacement.current, null);
});

test("a nested container in another document uses that ownerDocument, not the global page", async () => {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  restores.push(() => iframe.remove());
  const other = iframe.contentDocument!;
  const otherWindow = iframe.contentWindow!;
  replace(
    Object.getPrototypeOf(Object.getPrototypeOf(other.createElement("button"))),
    "scrollIntoView",
    {
      value() {},
    },
  );
  observeSizes(otherWindow);
  replace(document.documentElement, "scrollHeight", { value: 7777 });
  replace(other.documentElement, "scrollHeight", { value: 1900 });
  const outer = other.createElement("main");
  const container = other.createElement("div");
  outer.append(container);
  other.body.append(outer);
  let api!: Api;
  const view = render(
    <EnvironmentProvider value={() => other}>
      <Harness
        capture={(value) => {
          api = value;
        }}
      />
    </EnvironmentProvider>,
    { container, baseElement: other.body },
  );
  await start(() => api);
  const backdrop = view.getByTestId("backdrop");
  assert.equal(backdrop.ownerDocument === other, true);
  assert.equal(backdrop.style.height, "1900px");
  const observer = SizeObserver.all.find((item) => item.targets.has(other.documentElement))!;
  assert.ok(observer.targets.has(other.body));
  assert.equal(observer.targets.has(document.documentElement), false);
});

test("SSR renders the typed backdrop without client measurements or automatic height", () => {
  const html = renderToString(
    <Harness capture={() => {}} backdrop={{ className: "ssr-host", style: { opacity: 0.5 } }} />,
  );
  assert.match(html, /fux-tour__backdrop ssr-host/);
  assert.match(html, /opacity:0\.5/);
  assert.doesNotMatch(html, /height:[0-9]/);
});
