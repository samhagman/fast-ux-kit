import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  ImageCropper,
  cropImage,
  SignaturePad,
  FloatingPanel,
  Tour,
  type SignaturePadHandle,
  type SignatureValue,
} from "../src/components/media.js";

Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});
Object.defineProperty(globalThis, "HTMLCanvasElement", {
  configurable: true,
  value: dom.window.HTMLCanvasElement,
});
const draws: unknown[][] = [];
const context = new Proxy(
  {},
  {
    get: (_, key) =>
      key === "measureText"
        ? () => ({ width: 10 })
        : (...args: unknown[]) => {
            if (key === "drawImage") draws.push(args);
          },
  },
);
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => context,
});
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "toBlob", {
  configurable: true,
  value: (callback: BlobCallback) => callback(new Blob(["image"], { type: "image/png" })),
});
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getBoundingClientRect", {
  configurable: true,
  value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 180, width: 320, height: 180 }),
});
class TestImage {
  naturalWidth = 200;
  naturalHeight = 100;
  crossOrigin = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  set src(value: string) {
    queueMicrotask(() => (value === "bad" ? this.onerror?.() : this.onload?.()));
  }
}
Object.defineProperty(globalThis, "Image", { configurable: true, value: TestImage });

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(browserErrors.splice(0), []);
  draws.length = 0;
});

test("media surfaces render stable labelled server markup", () => {
  const crop = renderToString(<ImageCropper src="image.png" alt="Landscape" />);
  assert.match(crop, /Crop Landscape/);
  assert.match(crop, /Zoom/);
  assert.match(renderToString(<SignaturePad label="Approval" />), /Type signature/);
  assert.match(
    renderToString(
      <FloatingPanel title="Inspector">
        <p>Details</p>
      </FloatingPanel>,
    ),
    /Open panel/,
  );
  assert.match(
    renderToString(<Tour steps={[{ id: "first", title: "First", description: "Instructions" }]} />),
    /Start tour/,
  );
});

test("crop keyboard positioning and reset use the controlled crop contract", () => {
  const changes: { crop: { x: number; y: number }; zoom: number; rotation: number }[] = [];
  const view = render(
    <ImageCropper
      src="image.png"
      alt="Photo"
      value={{ crop: { x: 5, y: 6 }, zoom: 2, rotation: 45 }}
      onValueChange={(value) => changes.push(value)}
    />,
  );
  const control = view.getByLabelText("Crop Photo. Use arrow keys to position the image.");
  Object.defineProperty(control, "getBoundingClientRect", {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 300,
      bottom: 260,
      width: 300,
      height: 260,
    }),
  });
  const image = view.getByAltText("Photo");
  Object.defineProperty(image, "naturalWidth", { value: 200 });
  Object.defineProperty(image, "naturalHeight", { value: 100 });
  fireEvent.load(image);
  fireEvent.keyDown(control, { key: "ArrowRight" });
  assert.ok(changes.length);
  assert.equal(changes.at(-1)?.zoom, 2);
  fireEvent.click(view.getByRole("button", { name: "Reset crop" }));
  assert.deepEqual(changes.at(-1), { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 });
});

test("crop exports the selected rotated rectangle and rejects invalid or failed images", async () => {
  const blob = await cropImage("image.png", { x: 10, y: 20, width: 30, height: 40 }, 90);
  assert.equal(blob.type, "image/png");
  assert.equal(draws.length, 2);
  assert.deepEqual(draws[1]?.slice(1), [10, 20, 30, 40, 0, 0, 30, 40]);
  assert.equal((draws[1]?.[0] as HTMLCanvasElement).width, 100);
  assert.equal((draws[1]?.[0] as HTMLCanvasElement).height, 200);
  await assert.rejects(cropImage("image.png", { x: 0, y: 0, width: -1, height: 20 }), /positive/);
  await assert.rejects(cropImage("bad", { x: 0, y: 0, width: 20, height: 20 }), /loaded/);
  await assert.rejects(cropImage("image.png", { x: 199, y: 0, width: 20, height: 20 }), /beyond/);
});

test("signature supports keyboard entry, controlled edits, clear and real PNG export", async () => {
  const ref = React.createRef<SignaturePadHandle>();
  const changes: SignatureValue[] = [];
  const view = render(
    <SignaturePad ref={ref} label="Approval" onValueChange={(value) => changes.push(value)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Type signature" }));
  fireEvent.change(view.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Taylor" },
  });
  assert.equal(changes.at(-1)?.text, "Taylor");
  const image = await ref.current!.export();
  assert.equal(image.type, "image/png");
  fireEvent.click(view.getByRole("button", { name: "Clear signature" }));
  assert.equal((view.getByRole("textbox") as HTMLInputElement).value, "");
  await assert.rejects(ref.current!.export(), /Add a signature/);
  view.rerender(
    <SignaturePad
      label="Approval"
      value={{ mode: "type", text: "Host value", width: 320, height: 180, strokes: [] }}
      onValueChange={(value) => changes.push(value)}
    />,
  );
  fireEvent.change(view.getByRole("textbox"), { target: { value: "Proposal" } });
  assert.equal(changes.at(-1)?.text, "Proposal");
  assert.equal((view.getByRole("textbox") as HTMLInputElement).value, "Host value");
});

test("signature drawing engine captures strokes and removes listeners on unmount", async () => {
  const changes: SignatureValue[] = [];
  const view = render(<SignaturePad label="Draw" onValueChange={(value) => changes.push(value)} />);
  const canvas = view.getByRole("img", { name: "Draw drawing surface" });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 70));
  });
  fireEvent.mouseDown(canvas, { buttons: 1, button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseMove(canvas, { buttons: 1, clientX: 40, clientY: 20 });
  fireEvent.mouseUp(canvas, { buttons: 0, button: 0, clientX: 60, clientY: 30 });
  await waitFor(() => assert.ok(changes.at(-1)?.strokes.length));
  const count = changes.length;
  view.unmount();
  fireEvent.mouseDown(canvas, { buttons: 1, button: 0, clientX: 10, clientY: 10 });
  fireEvent.mouseUp(canvas, { buttons: 0, button: 0, clientX: 60, clientY: 30 });
  assert.equal(changes.length, count);
});

test("floating panel moves and resizes with keys, minimizes, and closes", async () => {
  const view = render(
    <FloatingPanel title="Inspector">
      <p>Details</p>
    </FloatingPanel>,
  );
  fireEvent.click(view.getByRole("button", { name: "Open panel" }));
  const panel = await view.findByRole("dialog");
  const move = view.getByRole("button", { name: "Move Inspector. Use arrow keys." });
  fireEvent.keyDown(move, { key: "ArrowRight" });
  assert.equal(panel.style.insetInlineStart, "34px");
  fireEvent.keyDown(view.getByRole("button", { name: "Resize Inspector. Use arrow keys." }), {
    key: "ArrowDown",
  });
  assert.match(panel.style.height, /290px/);
  fireEvent.click(view.getByRole("button", { name: "Minimize Inspector" }));
  assert.equal(view.getByText("Details").parentElement?.hidden, true);
  fireEvent.click(view.getByRole("button", { name: "Expand Inspector" }));
  fireEvent.click(view.getByRole("button", { name: "Close Inspector" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
});

test("tour advances, goes back, handles a missing target and finishes once", async () => {
  let completed = 0;
  const view = render(
    <Tour
      steps={[
        { id: "one", title: "First step", description: "Read this", target: () => null },
        { id: "two", title: "Second step", description: "Then this" },
      ]}
      onComplete={() => completed++}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Start tour" }));
  await view.findByRole("heading", { name: "First step" });
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  await view.findByRole("heading", { name: "Second step" });
  fireEvent.click(view.getByRole("button", { name: "Previous" }));
  await view.findByRole("heading", { name: "First step" });
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  fireEvent.click(view.getByRole("button", { name: "Finish" }));
  assert.equal(completed, 1);
  await waitFor(() => assert.equal(view.queryByRole("heading", { name: "Second step" }), null));
});
