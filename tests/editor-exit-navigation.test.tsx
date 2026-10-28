import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef, useState } from "react";
import { browserErrors, dom } from "./components-dom.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
for (const key of ["HTMLAnchorElement", "HTMLIFrameElement", "ShadowRoot", "DOMRect"] as const)
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
const { ModalDialog } = await import("../src/components/index.js");
const nodes = [
  { id: "a", text: "Alpha" },
  { id: "b", text: "Beta" },
];
const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
afterEach(async () => {
  cleanup();
  await settle();
  assert.deepEqual(browserErrors.splice(0), []);
});
const editor = (view: ReturnType<typeof render>) =>
  view.getByRole("region", { name: "Outline editor" });
const boundary = (view: ReturnType<typeof render>, direction: "start" | "end") =>
  view.getByText(`${direction === "start" ? "Start" : "End"} of Outline editor`);
const focus = (target: HTMLElement) => act(() => target.focus());

for (const shiftKey of [false, true]) {
  test(`container ${shiftKey ? "Shift+Tab" : "Tab"} hands native traversal to its own ${shiftKey ? "start" : "end"} boundary without changing state`, async () => {
    const ref = createRef<OutlineEditorHandle>();
    let bubbled = 0;
    const view = render(
      <div onKeyDown={() => bubbled++}>
        <button>Before editor</button>
        <OutlineEditor defaultNodes={nodes} readOnly={false} ref={ref} />
        <button>After editor</button>
      </div>,
    );
    const input = view.getByRole("textbox", { name: "Edit Alpha" });
    focus(input);
    fireEvent.keyDown(input, { key: "Escape" });
    assert.equal(document.activeElement?.tagName, "LI");
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    const container = editor(view);
    assert.equal(document.activeElement, container);
    const before = ref.current!.getState();
    bubbled = 0;
    assert.equal(fireEvent.keyDown(container, { key: "Tab", shiftKey }), true);
    const anchor = boundary(view, shiftKey ? "start" : "end");
    assert.equal(document.activeElement, anchor);
    assert.equal(anchor.tabIndex, -1);
    assert.equal(anchor.hasAttribute("aria-hidden"), false);
    assert.equal(anchor.hasAttribute("hidden"), false);
    assert.equal(anchor.hasAttribute("inert"), false);
    assert.ok(anchor.textContent?.trim());
    assert.equal(shiftKey ? container.firstElementChild : container.lastElementChild, anchor);
    assert.equal(bubbled, 1);
    assert.strictEqual(ref.current!.getState(), before);
    await settle();
    // jsdom does not perform the native Tab default action. The anchor is the
    // starting point, not evidence that the browser reached Before/After editor.
    assert.equal(document.activeElement, anchor);
  });
}

test("toolbar and other descendant controls keep their ordinary Tab behavior", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      renderAccessory={() => <button>Accessory</button>}
    />,
  );
  for (const target of [
    view.getByRole("button", { name: "Expand all" }),
    view.getAllByRole("button", { name: "Accessory" })[0]!,
  ]) {
    focus(target);
    assert.equal(fireEvent.keyDown(target, { key: "Tab" }), true);
    assert.equal(document.activeElement, target);
  }
});

test("textarea Tab retains its structural owner rather than entering an exit boundary", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} ref={ref} />);
  const input = view.getByRole("textbox", { name: "Edit Beta" });
  focus(input);
  assert.equal(fireEvent.keyDown(input, { key: "Tab" }), false);
  assert.equal(ref.current!.getState().nodes[0]!.children?.[0]?.id, "b");
  assert.equal(document.activeElement, input);
});

test("modified, composing, unrelated, and unfocused container events do not redirect focus", () => {
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  const container = editor(view);
  for (const properties of [
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
    { keyCode: 229 },
  ]) {
    focus(container);
    assert.equal(fireEvent.keyDown(container, { key: "Tab", ...properties }), true);
    assert.equal(document.activeElement, container);
  }
  assert.equal(fireEvent.keyDown(container, { key: "Enter" }), true);
  assert.equal(document.activeElement, container);
  const toolbar = view.getByRole("button", { name: "Expand all" });
  focus(toolbar);
  fireEvent.keyDown(container, { key: "Tab" });
  assert.equal(document.activeElement, toolbar);
});

test("capture-phase cancellation is respected before any boundary focus", async () => {
  const view = render(
    <div onKeyDownCapture={(event) => event.preventDefault()}>
      <OutlineEditor defaultNodes={nodes} readOnly={false} />
    </div>,
  );
  const container = editor(view);
  focus(container);
  assert.equal(fireEvent.keyDown(container, { key: "Tab" }), false);
  assert.equal(document.activeElement, container);
  await settle();
  assert.equal(document.activeElement, container);
});

test("native prior cancellation is respected even before React synthesizes the event", () => {
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  const container = editor(view);
  container.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
  focus(container);
  assert.equal(fireEvent.keyDown(container, { key: "Tab" }), false);
  assert.equal(document.activeElement, container);
});

test("late ancestor cancellation restores the container instead of stranding focus on a clipped boundary", async () => {
  let observed: Element | null = null;
  const view = render(
    <div
      onKeyDown={(event) => {
        observed = document.activeElement;
        event.preventDefault();
      }}
    >
      <OutlineEditor defaultNodes={nodes} readOnly={false} />
    </div>,
  );
  const container = editor(view);
  focus(container);
  assert.equal(fireEvent.keyDown(container, { key: "Tab" }), false);
  assert.equal(observed, boundary(view, "end"));
  await settle();
  assert.equal(document.activeElement, container);
});

test("late native document cancellation restores the container after event propagation", async () => {
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  const container = editor(view);
  const cancel = (event: globalThis.KeyboardEvent) => event.preventDefault();
  document.addEventListener("keydown", cancel);
  try {
    focus(container);
    assert.equal(fireEvent.keyDown(container, { key: "Tab" }), false);
    assert.equal(document.activeElement, boundary(view, "end"));
    await settle();
    assert.equal(document.activeElement, container);
  } finally {
    document.removeEventListener("keydown", cancel);
  }
});

test("late cancellation never overrides a host-selected focus destination", async () => {
  const destination = createRef<HTMLButtonElement>();
  const view = render(
    <div
      onKeyDown={(event) => {
        if (event.key !== "Tab") return;
        event.preventDefault();
        destination.current!.focus();
      }}
    >
      <OutlineEditor defaultNodes={nodes} readOnly={false} />
      <button ref={destination}>Host destination</button>
    </div>,
  );
  focus(editor(view));
  fireEvent.keyDown(editor(view), { key: "Tab" });
  await settle();
  assert.ok(document.activeElement === destination.current);
});

for (const shiftKey of [false, true]) {
  test(`modal-scoped ${shiftKey ? "backward" : "forward"} handoff keeps anchors and resulting focus within the existing owner`, async () => {
    const openChanges: boolean[] = [];
    const view = render(
      <ModalDialog title="Editor scope" isOpen onOpenChange={(open) => openChanges.push(open)}>
        <button>Before in modal</button>
        <OutlineEditor defaultNodes={nodes} readOnly={false} />
        <button>After in modal</button>
      </ModalDialog>,
    );
    await act(async () => {
      await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
    });
    const container = editor(view);
    const modal = view.getByRole("dialog", { name: "Editor scope" });
    const anchor = boundary(view, shiftKey ? "start" : "end");
    assert.ok(modal.contains(boundary(view, "start")));
    assert.ok(modal.contains(boundary(view, "end")));
    let handoffs = 0;
    anchor.addEventListener("focus", () => handoffs++);
    focus(container);
    fireEvent.keyDown(container, { key: "Tab", shiftKey });
    assert.equal(handoffs, 1);
    await settle();
    assert.ok(modal.contains(document.activeElement), "existing modal owner retains containment");
    assert.deepEqual(openChanges, []);
    // This checks structure and owner coexistence only. Actual next/previous
    // destinations and native end-of-modal wrapping require real browser input.
  });
}

test("unmount cancels pending recovery and cannot steal host focus", async (context) => {
  const host = render(<button>Host remains</button>);
  const view = render(
    <div onKeyDown={(event) => event.preventDefault()}>
      <OutlineEditor defaultNodes={nodes} readOnly={false} />
    </div>,
  );
  const container = editor(view);
  focus(container);
  fireEvent.keyDown(container, { key: "Tab" });
  const clear = context.mock.method(globalThis, "clearTimeout");
  view.unmount();
  assert.ok(clear.mock.callCount() > 0, "pending recovery is explicitly canceled");
  const button = host.getByRole("button", { name: "Host remains" });
  focus(button);
  await settle();
  assert.equal(document.activeElement, button);
});

test("reader mode contains no exit boundaries", () => {
  const view = render(<OutlineEditor defaultNodes={nodes} />);
  assert.equal(view.queryByText("Start of Outline editor"), null);
  assert.equal(view.queryByText("End of Outline editor"), null);
});

test("editor consumes only its first two Escape steps inside a real modal, then yields container Escape", async () => {
  const openChanges: boolean[] = [];
  const ref = createRef<OutlineEditorHandle>();
  function ModalEditor() {
    const [open, setOpen] = useState(true);
    return (
      <ModalDialog
        title="Escape owner"
        isOpen={open}
        onOpenChange={(value) => {
          openChanges.push(value);
          setOpen(value);
        }}
      >
        <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} />
      </ModalDialog>
    );
  }
  const view = render(<ModalEditor />);
  await act(async () => {
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  focus(input);
  const originalNodes = ref.current!.getState().nodes;
  fireEvent.keyDown(input, { key: "Escape" });
  assert.deepEqual(openChanges, [], "text Escape must not dismiss the modal");
  assert.ok(view.queryByRole("dialog", { name: "Escape owner" }));
  assert.equal(document.activeElement?.tagName, "LI");
  assert.deepEqual([...ref.current!.getState().selection], ["a"]);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  assert.deepEqual(openChanges, [], "row Escape must not dismiss the modal");
  assert.ok(document.activeElement === editor(view));
  assert.deepEqual([...ref.current!.getState().selection], []);
  assert.strictEqual(ref.current!.getState().nodes, originalNodes);
  assert.equal(ref.current!.getState().history.past.length, 0);
  fireEvent.keyDown(editor(view), { key: "Escape" });
  await waitFor(() => assert.equal(view.queryByRole("dialog", { name: "Escape owner" }), null));
  assert.deepEqual(openChanges, [false], "container Escape belongs to the modal");
});
