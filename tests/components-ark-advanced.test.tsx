import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const K = await import("../src/components/ark-advanced.js");
const { arkAdvancedDemos } = await import("../examples/docs/demos/ark-advanced-demos.js");
const captures = new WeakMap<Element, Set<number>>();
Object.defineProperties(dom.window.Element.prototype, {
  setPointerCapture: {
    configurable: true,
    value(this: Element, id: number) {
      const ids = captures.get(this) ?? new Set();
      ids.add(id);
      captures.set(this, ids);
    },
  },
  hasPointerCapture: {
    configurable: true,
    value(this: Element, id: number) {
      return captures.get(this)?.has(id) ?? false;
    },
  },
  releasePointerCapture: {
    configurable: true,
    value(this: Element, id: number) {
      captures.get(this)?.delete(id);
    },
  },
});
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value(this: HTMLElement, options: ScrollToOptions) {
    this.scrollLeft = options.left ?? this.scrollLeft;
    this.scrollTop = options.top ?? this.scrollTop;
  },
});
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
const click = (element: Element) =>
  act(async () => {
    fireEvent.click(element);
  });
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
const pointer = (element: Element | Document, type: string, x: number, y: number) => {
  const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    pointerId: 1,
    pointerType: "pen",
    button: 0,
    buttons: type === "pointerup" ? 0 : 1,
    clientX: x,
    clientY: y,
    pressure: 0.5,
    isPrimary: true,
  });
  fireEvent(element, event);
};

test("advanced compound wrappers preserve refs, host classes, owner props and SSR", async () => {
  const ref = createRef<HTMLDivElement>();
  const view = render(
    <K.Carousel.Root ref={ref} slideCount={2} className="host-carousel" aria-label="Gallery">
      <K.Carousel.ItemGroup>
        <K.Carousel.Item index={0}>One</K.Carousel.Item>
        <K.Carousel.Item index={1}>Two</K.Carousel.Item>
      </K.Carousel.ItemGroup>
    </K.Carousel.Root>,
  );
  assert.ok(ref.current?.classList.contains("fux-carousel__root"));
  assert.ok(ref.current?.classList.contains("host-carousel"));
  assert.equal(view.container.querySelectorAll('[data-part="item"]').length, 2);
  for (const key of ["Carousel", "FloatingPanel", "ImageCropper", "SignaturePad", "Tour"]) {
    const html = renderToString(arkAdvancedDemos[key]!.render());
    assert.ok(html.length > 30, key);
    assert.equal(html.includes("undefined"), false, key);
  }
  await settle();
});

test("floating panel opens, moves without dragging, stages, closes and reopens with local note intact", async () => {
  const view = render(<StrictMode>{arkAdvancedDemos.FloatingPanel!.render()}</StrictMode>);
  const trigger = view.getByRole("button", { name: "Open floating panel" });
  await click(trigger);
  await settle();
  const panel = view.getByRole("dialog", { name: "Scratch notes" });
  assert.ok(panel.classList.contains("fux-floating-panel__content"));
  const note = view.getByRole("textbox", { name: "Notes" });
  fireEvent.change(note, { target: { value: "Remember the finding" } });
  const initial = view.getByLabelText("Panel position").textContent;
  await click(view.getByRole("button", { name: "Move right" }));
  assert.notEqual(view.getByLabelText("Panel position").textContent, initial);
  await click(view.getByRole("button", { name: "Minimize panel" }));
  assert.equal(panel.hasAttribute("data-minimized"), true);
  assert.equal(view.queryByRole("textbox", { name: "Notes" }), null);
  await click(view.getByRole("button", { name: "Restore panel" }));
  assert.equal(
    (view.getByRole("textbox", { name: "Notes" }) as HTMLTextAreaElement).value,
    "Remember the finding",
  );
  await click(view.getByRole("button", { name: "Close panel" }));
  await settle();
  assert.equal(view.queryByRole("dialog"), null);
  await click(trigger);
  await settle();
  assert.ok(view.getByRole("dialog", { name: "Scratch notes" }));
});

test("image cropper transforms and resets through accessible non-drag controls", async () => {
  const view = render(arkAdvancedDemos.ImageCropper!.render());
  assert.equal(view.container.querySelectorAll('[data-part="grid"]').length, 2);
  assert.equal(view.container.querySelectorAll('[data-part="handle"]').length, 8);
  await click(view.getByRole("button", { name: "Zoom in" }));
  assert.match(view.getByLabelText("Crop transformation").textContent ?? "", /110%/);
  await click(view.getByRole("button", { name: "Rotate 90°" }));
  assert.match(view.getByLabelText("Crop transformation").textContent ?? "", /90°/);
  await click(view.getByRole("button", { name: "Flip horizontally" }));
  assert.equal(
    view.getByRole("button", { name: "Flip horizontally" }).getAttribute("aria-pressed"),
    "true",
  );
  await click(view.getByRole("button", { name: "Reset crop" }));
  assert.match(view.getByLabelText("Crop transformation").textContent ?? "", /100%.*0°/);
  assert.equal(
    view.getByRole("button", { name: "Flip horizontally" }).getAttribute("aria-pressed"),
    "false",
  );
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Preview crop" })));
  assert.match(
    view.getByRole("status", { name: "Crop preview status" }).textContent ?? "",
    /not ready|unavailable/,
  );
});

test("signature pad creates pointer strokes, clears them, and keeps a working text alternative", async () => {
  const view = render(arkAdvancedDemos.SignaturePad!.render());
  const surface = view.getByRole("application");
  surface.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 400, 180);
  pointer(surface, "pointerdown", 30, 40);
  await settle();
  pointer(document, "pointermove", 80, 60);
  pointer(document, "pointermove", 120, 30);
  pointer(document, "pointerup", 120, 30);
  await settle();
  assert.ok(view.container.querySelectorAll("svg path").length > 0);
  assert.ok(view.getByText("1 stroke"));
  await click(view.getByRole("button", { name: /clear/i }));
  await settle();
  assert.equal(view.container.querySelectorAll("svg path").length, 0);
  fireEvent.change(view.getByRole("textbox", { name: "Text alternative" }), {
    target: { value: "A rising curved line" },
  });
  assert.equal(view.getByLabelText("Text alternative preview").textContent, "A rising curved line");
});

test("tour is opt-in, navigates forward/back, dismisses with Escape and can restart", async () => {
  const view = render(arkAdvancedDemos.Tour!.render());
  assert.equal(view.queryByRole("alertdialog"), null);
  await click(view.getByRole("button", { name: "Start guided tour" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "A quick introduction" })));
  await click(view.getByRole("button", { name: "Next step" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "An ordinary action" })));
  await click(view.getByRole("button", { name: /previous/i }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "A quick introduction" })));
  await settle();
  await act(async () => fireEvent.keyDown(view.getByRole("alertdialog"), { key: "Escape" }));
  await waitFor(() => assert.equal(view.queryByRole("alertdialog") === null, true));
  await click(view.getByRole("button", { name: "Start guided tour" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "A quick introduction" })));
});

test("carousel next/previous, indicator keyboard navigation and endpoints follow measured snap points", async () => {
  const measure = (
    element: HTMLElement | null,
    left: number,
    width: number,
    scrollWidth = width,
  ) => {
    if (!element) return;
    element.getBoundingClientRect = () =>
      new dom.window.DOMRect(left - (element.parentElement?.scrollLeft ?? 0), 0, width, 180);
    Object.defineProperties(element, {
      offsetWidth: { configurable: true, value: width },
      offsetHeight: { configurable: true, value: 180 },
      scrollWidth: { configurable: true, value: scrollWidth },
      scrollHeight: { configurable: true, value: 180 },
    });
  };
  const view = render(
    <K.Carousel.Root
      slideCount={3}
      autoplay={false}
      translations={{ nextTrigger: "Next panel", prevTrigger: "Previous panel" }}
    >
      <K.Carousel.ItemGroup
        ref={(element) => measure(element, 0, 300, 900)}
        style={{ width: 300, height: 180 }}
      >
        {[0, 1, 2].map((index) => (
          <K.Carousel.Item
            key={index}
            index={index}
            ref={(element) => measure(element, index * 300, 300)}
            style={{ width: 300, height: 180 }}
          >
            Panel {index + 1}
          </K.Carousel.Item>
        ))}
      </K.Carousel.ItemGroup>
      <K.Carousel.PrevTrigger>Previous</K.Carousel.PrevTrigger>
      <K.Carousel.NextTrigger>Next</K.Carousel.NextTrigger>
      <K.Carousel.IndicatorGroup>
        {[0, 1, 2].map((index) => (
          <K.Carousel.Indicator key={index} index={index} aria-label={`Panel ${index + 1}`} />
        ))}
      </K.Carousel.IndicatorGroup>
      <K.Carousel.Context>
        {(api) => <output aria-label="Current panel">{api.page + 1}</output>}
      </K.Carousel.Context>
    </K.Carousel.Root>,
  );
  await settle();
  assert.equal(
    (view.getByRole("button", { name: "Previous panel" }) as HTMLButtonElement).disabled,
    true,
  );
  await click(view.getByRole("button", { name: "Next panel" }));
  assert.equal(view.getByLabelText("Current panel").textContent, "2");
  await click(view.getByRole("button", { name: "Next panel" }));
  assert.equal(view.getByLabelText("Current panel").textContent, "3");
  assert.equal(
    (view.getByRole("button", { name: "Next panel" }) as HTMLButtonElement).disabled,
    true,
  );
  const indicator = view.getByRole("button", { name: "Panel 3" });
  await act(async () => fireEvent.keyDown(indicator, { key: "Home" }));
  assert.equal(view.getByLabelText("Current panel").textContent, "1");
  await act(async () =>
    fireEvent.keyDown(view.getByRole("button", { name: "Panel 1" }), { key: "ArrowRight" }),
  );
  assert.equal(view.getByLabelText("Current panel").textContent, "2");
  await click(view.getByRole("button", { name: "Previous panel" }));
  assert.equal(view.getByLabelText("Current panel").textContent, "1");
});

test("measured crop selection supports keyboard nudge, resize, zoom and pointer drag", async () => {
  const view = render(
    <K.ImageCropper.Root aspectRatio={1}>
      <K.ImageCropper.Viewport
        ref={(element) => {
          if (element) element.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 400, 300);
        }}
      >
        <K.ImageCropper.Image
          src="/fixture.svg"
          alt="Measured fixture"
          ref={(image) => {
            if (image)
              Object.defineProperties(image, {
                complete: { configurable: true, value: true },
                naturalWidth: { configurable: true, value: 640 },
                naturalHeight: { configurable: true, value: 480 },
              });
          }}
        />
        <K.ImageCropper.Selection>
          <K.ImageCropper.Handle position="se" />
        </K.ImageCropper.Selection>
      </K.ImageCropper.Viewport>
      <K.ImageCropper.Context>
        {(api) => (
          <>
            <output aria-label="Crop rectangle">{JSON.stringify(api.crop)}</output>
            <output aria-label="Measured zoom">{api.zoom}</output>
          </>
        )}
      </K.ImageCropper.Context>
    </K.ImageCropper.Root>,
  );
  await act(async () => fireEvent.load(view.container.querySelector("img")!));
  const selection = view.getByRole("slider");
  const rect = () =>
    JSON.parse(view.getByLabelText("Crop rectangle").textContent!) as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  const before = rect();
  assert.ok(before.width > 0);
  await act(async () => fireEvent.keyDown(selection, { key: "ArrowRight" }));
  assert.ok(rect().x > before.x);
  await act(async () => fireEvent.keyDown(selection, { key: "ArrowRight", altKey: true }));
  assert.ok(rect().width > before.width);
  await act(async () => fireEvent.keyDown(selection, { key: "+" }));
  assert.ok(Number(view.getByLabelText("Measured zoom").textContent) > 1);
  const beforeDrag = rect();
  pointer(selection, "pointerdown", 120, 80);
  await settle();
  pointer(document, "pointermove", 135, 90);
  pointer(document, "pointerup", 135, 90);
  await settle();
  assert.ok(rect().x > beforeDrag.x);
  assert.ok(rect().y > beforeDrag.y);
});

test("disabled and read-only drawing pads reject pointer input without removing the alternative path", async () => {
  for (const policy of [{ disabled: true }, { readOnly: true }]) {
    const view = render(
      <K.SignaturePad.Root {...policy}>
        <K.SignaturePad.Label>Protected drawing</K.SignaturePad.Label>
        <K.SignaturePad.Control>
          <K.SignaturePad.Segment />
        </K.SignaturePad.Control>
      </K.SignaturePad.Root>,
    );
    const surface = view.getByRole("application");
    pointer(surface, "pointerdown", 20, 20);
    await settle();
    pointer(document, "pointermove", 50, 30);
    pointer(document, "pointerup", 50, 30);
    await settle();
    assert.equal(view.container.querySelectorAll("svg path").length, 0);
    view.unmount();
  }
});

// Public compound props retain the interaction owner's exact required types.
// @ts-expect-error A grid has an explicit axis, not an implicit direction.
const invalidCropGrid = <K.ImageCropper.Grid />;
// @ts-expect-error Tour actions are structured actions, not string shorthand.
const invalidTourAction = <K.Tour.ActionTrigger action="next" />;
// @ts-expect-error The slide count is numeric.
const invalidCarouselCount = <K.Carousel.Root slideCount="3" />;
void [invalidCropGrid, invalidTourAction, invalidCarouselCount];

test("floating panel pointer drag/resize and keyboard movement use one owner and restore focus", async () => {
  const view = render(
    <K.FloatingPanel.Root
      defaultSize={{ width: 300, height: 220 }}
      defaultPosition={{ x: 40, y: 50 }}
      minSize={{ width: 160, height: 120 }}
      allowOverflow
      closeOnEscape
    >
      <K.FloatingPanel.Trigger>Open geometry panel</K.FloatingPanel.Trigger>
      <K.FloatingPanel.Positioner>
        <K.FloatingPanel.Content>
          <K.FloatingPanel.DragTrigger data-testid="drag-region">
            <K.FloatingPanel.Title>Geometry panel</K.FloatingPanel.Title>
          </K.FloatingPanel.DragTrigger>
          <K.FloatingPanel.Body>Content</K.FloatingPanel.Body>
          <K.FloatingPanel.Context>
            {(api) => (
              <output aria-label="Panel geometry">
                {JSON.stringify({ position: api.position, size: api.size })}
              </output>
            )}
          </K.FloatingPanel.Context>
          <K.FloatingPanel.ResizeTrigger axis="se" data-testid="resize-region" />
          <K.FloatingPanel.CloseTrigger>Close geometry panel</K.FloatingPanel.CloseTrigger>
        </K.FloatingPanel.Content>
      </K.FloatingPanel.Positioner>
    </K.FloatingPanel.Root>,
  );
  const trigger = view.getByRole("button", { name: "Open geometry panel" });
  act(() => trigger.focus());
  await click(trigger);
  await settle();
  const geometry = () =>
    JSON.parse(view.getByLabelText("Panel geometry").textContent!) as {
      position: { x: number; y: number };
      size: { width: number; height: number };
    };
  pointer(view.getByTestId("drag-region"), "pointerdown", 50, 60);
  await settle();
  pointer(document, "pointermove", 80, 85);
  pointer(document, "pointerup", 80, 85);
  await settle();
  assert.ok(geometry().position.x > 40);
  assert.ok(geometry().position.y > 50);
  const beforeResize = geometry().size;
  pointer(view.getByTestId("resize-region"), "pointerdown", 340, 270);
  await settle();
  pointer(document, "pointermove", 380, 300);
  pointer(document, "pointerup", 380, 300);
  await settle();
  assert.ok(geometry().size.width > beforeResize.width);
  assert.ok(geometry().size.height > beforeResize.height);
  const panel = view.getByRole("dialog", { name: "Geometry panel" });
  const beforeKey = geometry().position.y;
  act(() => panel.focus());
  await act(async () => fireEvent.keyDown(panel, { key: "ArrowDown" }));
  assert.ok(geometry().position.y > beforeKey);
  await act(async () => fireEvent.keyDown(panel, { key: "Escape" }));
  await settle();
  assert.equal(view.queryByRole("dialog") === null, true);
  assert.equal(document.activeElement === trigger, true);
});

test("tour final action closes the guide and reports the owner's completed status", async () => {
  const view = render(arkAdvancedDemos.Tour!.render());
  await click(view.getByRole("button", { name: "Start guided tour" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "A quick introduction" })));
  await click(view.getByRole("button", { name: "Next step" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "An ordinary action" })));
  await click(view.getByRole("button", { name: "Next step" }));
  await waitFor(() => assert.ok(view.getByRole("alertdialog", { name: "You are ready" })));
  await click(view.getByRole("button", { name: "Finish tour" }));
  await waitFor(() => assert.equal(view.queryByRole("alertdialog") === null, true));
  assert.ok(view.getByText("Tour: completed"));
});

test("crop preview uses the canvas result, clears stale previews on transform, and reports export failure", async () => {
  const prototype = dom.window.HTMLCanvasElement.prototype;
  const getContext = Object.getOwnPropertyDescriptor(prototype, "getContext")!;
  const toDataURL = Object.getOwnPropertyDescriptor(prototype, "toDataURL")!;
  let drawCount = 0,
    fail = false;
  Object.defineProperties(prototype, {
    getContext: {
      configurable: true,
      value: () => ({
        setTransform() {},
        drawImage() {
          drawCount++;
        },
      }),
    },
    toDataURL: {
      configurable: true,
      value: () => {
        if (fail) throw new Error("Unreadable source");
        return "data:image/png;base64,cHJldmlldw==";
      },
    },
  });
  try {
    const view = render(arkAdvancedDemos.ImageCropper!.render());
    const viewport = view.container.querySelector<HTMLElement>('[data-part="viewport"]')!;
    viewport.getBoundingClientRect = () => new dom.window.DOMRect(0, 0, 400, 300);
    const source = view.container.querySelector("img")!;
    Object.defineProperties(source, {
      complete: { configurable: true, value: true },
      naturalWidth: { configurable: true, value: 640 },
      naturalHeight: { configurable: true, value: 480 },
    });
    await act(async () => fireEvent.load(source));
    await settle();
    await click(view.getByRole("button", { name: "Preview crop" }));
    assert.equal(
      view.getByRole("img", { name: "Cropped preview" }).getAttribute("src"),
      "data:image/png;base64,cHJldmlldw==",
    );
    assert.equal(drawCount, 1);
    await click(view.getByRole("button", { name: "Rotate 90°" }));
    assert.equal(view.queryByRole("img", { name: "Cropped preview" }), null);
    fail = true;
    await click(view.getByRole("button", { name: "Preview crop" }));
    assert.match(
      view.getByRole("status", { name: "Crop preview status" }).textContent ?? "",
      /unavailable/,
    );
    assert.equal(view.queryByRole("img", { name: "Cropped preview" }), null);
  } finally {
    Object.defineProperties(prototype, { getContext, toDataURL });
  }
});
