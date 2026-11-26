import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { layOutRow } from "./row-geometry.js";
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

const indicatorBox = (group: HTMLElement) =>
  Object.fromEntries(
    ["x", "y", "width", "height"].map((key) => [
      key,
      group.style.getPropertyValue(`--fux-indicator-${key}`),
    ]),
  );
const alignment = (props: React.ComponentProps<typeof ToggleButtonGroup>) => (
  <ToggleButtonGroup {...props}>
    <ToggleButtonGroupItem value="left">Left</ToggleButtonGroupItem>
    <ToggleButtonGroupItem value="center">Center</ToggleButtonGroupItem>
    <ToggleButtonGroupItem value="right">Right</ToggleButtonGroupItem>
  </ToggleButtonGroup>
);

test("a single-selection toggle group slides one indicator to the selected item", () => {
  const restore = layOutRow({ width: 60, height: 32 });
  try {
    const view = render(alignment({ defaultValue: ["left"] }));
    const group = view.container.querySelector<HTMLElement>('[data-slot="toggle-group"]')!;
    assert.ok(group.hasAttribute("data-indicator"), "the indicator is placed");
    assert.match(group.className, /\bfux-sliding-group\b/);
    assert.deepEqual(indicatorBox(group), { x: "0px", y: "0px", width: "60px", height: "32px" });

    fireEvent.click(view.getByRole("button", { name: "Right" }));
    assert.equal(view.getByRole("button", { name: "Right" }).getAttribute("aria-pressed"), "true");
    assert.deepEqual(indicatorBox(group), { x: "120px", y: "0px", width: "60px", height: "32px" });

    // The selected item stays clear so the indicator shows through, and keeps its signal text.
    const right = view.getByRole("button", { name: "Right" });
    assert.match(right.className, /(^|\s)data-pressed:bg-transparent(\s|$)/);
    assert.match(right.className, /(^|\s)data-pressed:text-signal(\s|$)/);
    assert.doesNotMatch(right.className, /(^|\s)data-pressed:bg-signal-muted(\s|$)/);
    // The items are still the group's own children, so the shared-border corners stay put.
    assert.equal(group.firstElementChild?.textContent, "Left");
  } finally {
    restore();
  }
});

test("a controlled toggle group moves its indicator with the value it is given", () => {
  const restore = layOutRow({ width: 50, height: 28 });
  try {
    function Controlled() {
      const [value, setValue] = React.useState<unknown[]>(["right"]);
      return (
        <>
          {alignment({ value, onValueChange: setValue })}
          <button type="button" onClick={() => setValue([])}>
            Clear
          </button>
        </>
      );
    }
    const view = render(<Controlled />);
    const group = view.container.querySelector<HTMLElement>('[data-slot="toggle-group"]')!;
    assert.equal(indicatorBox(group).x, "100px");
    fireEvent.click(view.getByRole("button", { name: "Center" }));
    assert.equal(indicatorBox(group).x, "50px");
    fireEvent.click(view.getByRole("button", { name: "Clear" }));
    assert.equal(group.hasAttribute("data-indicator"), false, "no selection, no indicator");
  } finally {
    restore();
  }
});

test("before the indicator is measured, the selected item carries its own fill", () => {
  const html = renderToString(alignment({ defaultValue: ["center"] }));
  const page = new dom.window.DOMParser().parseFromString(html, "text/html");
  const group = page.querySelector('[data-slot="toggle-group"]')!;
  assert.equal(group.hasAttribute("data-indicator"), false);
  const center = page.querySelector('[aria-pressed="true"]')!;
  assert.equal(center.textContent, "Center");
  assert.match(center.className, /(^|\s)data-pressed:bg-signal-muted(\s|$)/);
});

test("with several selections there is no indicator; each selected item fades its own fill", () => {
  const restore = layOutRow();
  try {
    const view = render(
      <ToggleButtonGroup multiple defaultValue={["bold"]}>
        <ToggleButtonGroupItem value="bold">Bold</ToggleButtonGroupItem>
        <ToggleButtonGroupItem value="italic">Italic</ToggleButtonGroupItem>
      </ToggleButtonGroup>,
    );
    const group = view.container.querySelector<HTMLElement>('[data-slot="toggle-group"]')!;
    fireEvent.click(view.getByRole("button", { name: "Italic" }));
    assert.deepEqual(
      view.getAllByRole("button").map((item) => item.getAttribute("aria-pressed")),
      ["true", "true"],
    );
    assert.equal(group.hasAttribute("data-indicator"), false);
    assert.doesNotMatch(group.className, /fux-sliding-group/);
    assert.equal(group.style.getPropertyValue("--fux-indicator-x"), "");
    for (const item of view.getAllByRole("button")) {
      assert.match(item.className, /(^|\s)data-pressed:bg-signal-muted(\s|$)/);
      assert.match(
        item.className,
        /(^|\s)transition-\[color,background-color,border-color,box-shadow\](\s|$)/,
      );
      assert.match(item.className, /(^|\s)duration-\(--fux-motion-duration\)(\s|$)/);
      assert.match(item.className, /(^|\s)ease-\(--ease-standard\)(\s|$)/);
      assert.doesNotMatch(item.className, /(^|\s)transition-all(\s|$)/);
    }
  } finally {
    restore();
  }
});

test("hover tints an unselected item and leaves the selected look alone", () => {
  const restore = layOutRow();
  try {
    const view = render(
      <>
        {alignment({ defaultValue: ["left"] })}
        <ToggleButtonGroup multiple defaultValue={["bold"]}>
          <ToggleButtonGroupItem value="bold">Bold</ToggleButtonGroupItem>
        </ToggleButtonGroup>
      </>,
    );
    for (const item of view.getAllByRole("button")) {
      assert.match(item.className, /(^|\s)hover:bg-muted(\s|$)/, "unselected hover tint");
      assert.match(item.className, /(^|\s)data-pressed:hover:text-signal(\s|$)/);
    }
    // Under the indicator the selected item stays clear on hover; alone it keeps its own fill.
    const left = view.getByRole("button", { name: "Left" });
    assert.match(left.className, /(^|\s)data-pressed:hover:bg-transparent(\s|$)/);
    const bold = view.getByRole("button", { name: "Bold" });
    assert.match(bold.className, /(^|\s)data-pressed:hover:bg-signal-muted(\s|$)/);
  } finally {
    restore();
  }
});

test("reduced motion makes the indicator and the selection fades change at once", () => {
  const css = readFileSync(
    new URL("../src/components/overlays-media.css", import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");
  const slide = css.match(
    /\.fux-sliding-indicator, \.fux-sliding-group\[data-indicator\]::before \{[^}]*\}/,
  )?.[0];
  assert.ok(slide, "one rule moves both indicators");
  assert.match(slide, /transition-property: transform, width, height, border-radius;/);
  assert.match(slide, /transition-duration: calc\(var\(--fux-motion-duration, 140ms\) \* 1\.6\);/);
  assert.match(slide, /transition-timing-function: var\(--ease-standard\);/);
  const reduced =
    css.match(/@media \(prefers-reduced-motion: reduce\) \{ ([^{}]*\{[^}]*\} )+\}/g) ?? [];
  assert.ok(
    reduced.some((block) =>
      /\.fux-sliding-indicator, \.fux-sliding-group\[data-indicator\]::before \{ transition: none; \}/.test(
        block,
      ),
    ),
    "reduced motion turns the slide off",
  );
  const tokens = readFileSync(new URL("../src/tokens.css", import.meta.url), "utf8");
  assert.match(
    tokens,
    /prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{\s*--fux-motion-duration: 0ms;/,
  );
  const view = render(alignment({ defaultValue: ["left"] }));
  for (const item of view.getAllByRole("button"))
    assert.match(item.className, /(^|\s)motion-reduce:transition-none(\s|$)/);
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
