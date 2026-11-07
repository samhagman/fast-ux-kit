import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  Avatar,
  AvatarGroup,
  ModalDialog,
  ScrollArea,
  Separator,
  Splitter,
  ToggleButton,
  ToggleButtonGroup,
  ToggleButtonGroupItem,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "../src/components/overlays.js";
import { Tour, ImageCropper, SignaturePad } from "../src/components/media.js";

Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});
Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

test("a pressed toggle button reports its state and carries the selected styling", () => {
  const view = render(<ToggleButton>Emphasis</ToggleButton>);
  const button = view.getByRole("button", { name: "Emphasis" });
  assert.equal(button.getAttribute("aria-pressed"), "false");
  assert.match(button.className, /aria-pressed:bg-signal-muted/);
  fireEvent.click(button);
  assert.equal(button.getAttribute("aria-pressed"), "true");
});

test("a toggle group shares borders by default and still selects one item", () => {
  const changes: unknown[] = [];
  const view = render(
    <ToggleButtonGroup defaultValue={["left"]} onValueChange={(value) => changes.push(value)}>
      <ToggleButtonGroupItem value="left">Left</ToggleButtonGroupItem>
      <ToggleButtonGroupItem value="right">Right</ToggleButtonGroupItem>
    </ToggleButtonGroup>,
  );
  const group = view.container.querySelector('[data-slot="toggle-group"]')!;
  assert.equal(group.getAttribute("data-variant"), "outline");
  assert.equal(group.getAttribute("data-spacing"), "0");
  fireEvent.click(view.getByRole("button", { name: "Right" }));
  assert.deepEqual(changes.at(-1), ["right"]);
});

test("a destructive modal dialog shows a warning mark, a named title and the requested size", async () => {
  const view = render(
    <ModalDialog
      open
      onOpenChange={() => {}}
      title="Delete this project?"
      description="This cannot be undone."
      variant="destructive"
      size="lg"
      footer={<button type="button">Delete</button>}
    >
      <p>Body copy</p>
    </ModalDialog>,
  );
  const dialog = await view.findByRole("dialog", { name: "Delete this project?" });
  assert.equal(dialog.getAttribute("data-variant"), "destructive");
  assert.match(dialog.className, /sm:max-w-xl/);
  assert.ok(dialog.querySelector('[data-slot="dialog-header"] svg'), "warning mark in the header");
  assert.ok(dialog.querySelector(".fux-dialog-body"), "scrolling body");
  assert.ok(view.getByRole("button", { name: "Delete" }));
});

test("avatars fall back to initials, scale, show presence and stack with an overflow count", () => {
  const view = render(
    <>
      <Avatar alt="Avery Lindqvist" size="xl" status="busy" />
      <AvatarGroup label="Members" max={2} size="sm">
        <Avatar alt="Mira Soto" />
        <Avatar alt="Jonas Pike" />
        <Avatar alt="Tamsin Reyes" />
        <Avatar alt="Noor Aziz" />
      </AvatarGroup>
    </>,
  );
  const single = view.container.querySelector('[data-slot="avatar"]')!;
  assert.match(single.className, /size-16/);
  assert.equal(single.querySelector('[data-slot="avatar-fallback"]')?.textContent, "AL");
  assert.equal(
    single.querySelector('[data-slot="avatar-status"]')?.getAttribute("data-status"),
    "busy",
  );
  const group = view.getByRole("group", { name: "Members" });
  const members = group.querySelectorAll('[data-slot="avatar"]');
  assert.equal(members.length, 3, "two avatars and the count");
  assert.equal(members[0]?.className.includes("size-7"), true, "the group sets the size");
  assert.equal(members[2]?.textContent, "+2");
});

test("a labelled separator keeps its caption between two rules and a plain one stays semantic", () => {
  const view = render(
    <>
      <Separator>or</Separator>
      <Separator decorative={false} />
    </>,
  );
  assert.ok(view.getByText("or"));
  assert.equal(view.container.querySelectorAll('[data-slot="separator"]').length, 3);
  assert.equal(view.getAllByRole("separator").length, 1);
});

test("a tooltip shows its keyboard shortcut as key caps", async () => {
  const view = render(
    <TooltipProvider>
      <Tooltip defaultOpen>
        <TooltipTrigger>Palette</TooltipTrigger>
        <TooltipContent shortcut={["⌘", "K"]}>Open</TooltipContent>
      </Tooltip>
    </TooltipProvider>,
  );
  const tooltip = await view.findByRole("tooltip");
  const keys = [...tooltip.querySelectorAll('[data-slot="kbd"]')].map((key) => key.textContent);
  assert.deepEqual(keys, ["⌘", "K"]);
});

test("a splitter handle draws a grip unless it is turned off", () => {
  const view = render(
    <Splitter.Root style={{ width: 200, height: 100 }}>
      <Splitter.Panel defaultSize={50}>One</Splitter.Panel>
      <Splitter.Handle />
      <Splitter.Panel defaultSize={50}>Two</Splitter.Panel>
      <Splitter.Handle grip={false} />
      <Splitter.Panel defaultSize={50}>Three</Splitter.Panel>
    </Splitter.Root>,
  );
  const handles = view.getAllByRole("separator");
  assert.equal(handles.length, 2);
  assert.ok(handles[0]?.querySelector("svg"), "the first handle has a grip");
  assert.equal(handles[1]?.querySelector("svg"), null, "the second handle has none");
  assert.match(handles[0]!.className, /data-\[separator=active\]:bg-signal/);
});

test("a scroll area offers the scrollbars its orientation asks for", () => {
  const view = render(
    <ScrollArea orientation="both" style={{ width: 100, height: 100 }}>
      <div style={{ width: 400, height: 400 }}>Content</div>
    </ScrollArea>,
  );
  assert.ok(view.getByText("Content"));
  assert.ok(view.container.querySelector('[data-slot="scroll-area-viewport"]'));
});

test("a tour shows its progress, highlights a present target and moves with Next and Previous", async () => {
  const target = document.createElement("button");
  target.textContent = "Target";
  document.body.append(target);
  const view = render(
    <Tour
      steps={[
        { id: "one", title: "First", description: "Read this", target: () => target },
        { id: "two", title: "Second", description: "Then this" },
        { id: "three", title: "Third", description: "Last" },
      ]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Start tour" }));
  const step = await view.findByRole("heading", { name: "First" });
  assert.match(document.body.textContent ?? "", /Step 1 of 3/);
  const popup = step.closest('[data-slot="tour-step"]')!;
  assert.equal(
    popup.querySelectorAll("span.rounded-full").length,
    3,
    "one progress segment per step",
  );
  await waitFor(() => assert.ok(document.querySelector('[data-slot="tour-spotlight"]')));
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  await view.findByRole("heading", { name: "Second" });
  await waitFor(() => assert.equal(document.querySelector('[data-slot="tour-spotlight"]'), null));
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  await view.findByRole("heading", { name: "Third" });
  assert.ok(view.getByRole("button", { name: "Finish" }));
  fireEvent.click(view.getByRole("button", { name: "Close tour" }));
  await waitFor(() => assert.equal(view.queryByRole("heading", { name: "Third" }), null));
  target.remove();
});

test("the image cropper rotates, zooms and resets from its toolbar", () => {
  const changes: { zoom: number; rotation: number }[] = [];
  const view = render(
    <ImageCropper src="image.png" alt="Photo" onValueChange={(value) => changes.push(value)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Rotate right" }));
  assert.equal(changes.at(-1)?.rotation, 90);
  fireEvent.click(view.getByRole("button", { name: "Rotate left" }));
  assert.equal(changes.at(-1)?.rotation, 0);
  fireEvent.click(view.getByRole("button", { name: "Rotate left" }));
  assert.equal(changes.at(-1)?.rotation, 270);
  fireEvent.click(view.getByRole("button", { name: "Zoom in" }));
  assert.equal(changes.at(-1)?.zoom, 1.25);
  assert.equal(
    (view.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled,
    false,
  );
  fireEvent.click(view.getByRole("button", { name: "Reset crop" }));
  assert.deepEqual(changes.at(-1), { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 });
});

test("the signature pad keeps its mode toggle pressed state and disables clearing when empty", () => {
  const view = render(<SignaturePad label="Approval" />);
  const draw = view.getByRole("button", { name: "Draw signature" });
  const type = view.getByRole("button", { name: "Type signature" });
  assert.equal(draw.getAttribute("aria-pressed"), "true");
  assert.equal(type.getAttribute("aria-pressed"), "false");
  assert.equal(
    (view.getByRole("button", { name: "Clear signature" }) as HTMLButtonElement).disabled,
    true,
  );
  assert.equal(
    (view.getByRole("button", { name: "Undo stroke" }) as HTMLButtonElement).disabled,
    true,
  );
  fireEvent.click(type);
  assert.equal(type.getAttribute("aria-pressed"), "true");
  fireEvent.change(view.getByRole("textbox", { name: "Your name" }), {
    target: { value: "Taylor" },
  });
  assert.equal(
    (view.getByRole("button", { name: "Clear signature" }) as HTMLButtonElement).disabled,
    false,
  );
  assert.ok(view.container.querySelector('[data-slot="signature-surface"]'));
});
