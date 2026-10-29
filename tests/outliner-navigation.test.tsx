import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef } from "react";
import { browserErrors, dom } from "./components-dom.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
const { cleanup, fireEvent, render, act } = await import("@testing-library/react");
const { Outliner, OutlineEditor } = await import("../src/react/index.js");
const nodes = [
  { id: "a", text: "Alpha", children: [{ id: "b", text: "Beta" }] },
  { id: "c", text: "Gamma" },
];
Object.defineProperty(globalThis, "DOMRect", { value: dom.window.DOMRect, configurable: true });
let revealed: { element: HTMLElement; options: ScrollIntoViewOptions }[] = [];
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
  configurable: true,
  value(this: HTMLElement, options: ScrollIntoViewOptions) {
    revealed.push({ element: this, options });
  },
});
afterEach(() => {
  cleanup();
  revealed = [];
  assert.deepEqual(browserErrors.splice(0), []);
});
const focus = (node: HTMLElement) => act(() => node.focus());
const activeId = () => (document.activeElement as HTMLElement)?.dataset.nodeId;
const nearest = { block: "nearest", inline: "nearest", behavior: "instant" };

test("reader Up/Down cancel page scrolling and focus visible rows, including boundaries", () => {
  const view = render(<Outliner nodes={nodes} />);
  const reader = view.getByRole("region", { name: "Outline" });
  assert.equal(reader.tabIndex, 0);
  focus(reader);
  assert.equal(fireEvent.keyDown(reader, { key: "ArrowDown" }), false);
  assert.equal(activeId(), "a");
  assert.equal(fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" }), false);
  assert.equal(activeId(), "a");
  assert.equal(fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }), false);
  assert.equal(activeId(), "b");
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  assert.equal(activeId(), "c");
  assert.equal(fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" }), false);
  assert.equal(activeId(), "c");
  assert.equal(revealed.length, 3, "boundary keys never add scrolling");
  for (const reveal of revealed) {
    assert.equal(reveal.element.className, "fast-ux-outliner__row");
    assert.deepEqual(reveal.options, nearest);
  }
});

test("reader row controls enter navigation, collapsed children are skipped, and Up from container enters at end", () => {
  const view = render(<Outliner nodes={nodes} enableHoist />);
  const button = view.getByRole("button", { name: "Collapse Alpha" });
  fireEvent.click(button);
  focus(button);
  assert.equal(fireEvent.keyDown(button, { key: "ArrowDown" }), false);
  assert.equal(activeId(), "c");
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  assert.equal(activeId(), "a");
  const reader = view.getByRole("region", { name: "Outline" });
  focus(reader);
  fireEvent.keyDown(reader, { key: "ArrowUp" });
  assert.equal(activeId(), "c");
});

test("reader leaves interactive descendants, modified arrows, composition and host cancellation alone", () => {
  const view = render(
    <Outliner
      nodes={nodes}
      renderAccessory={() => <input aria-label="Amount" />}
      renderBody={() => <button>Custom control</button>}
    />,
  );
  const input = view.getAllByRole("textbox")[0]!;
  const custom = view.getAllByRole("button", { name: "Custom control" })[0]!;
  for (const target of [input, custom]) {
    focus(target);
    assert.equal(fireEvent.keyDown(target, { key: "ArrowDown" }), true);
    assert.equal(document.activeElement, target);
  }
  const reader = view.getByRole("region", { name: "Outline" });
  focus(reader);
  for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey", "isComposing"]) {
    assert.equal(fireEvent.keyDown(reader, { key: "ArrowDown", [modifier]: true }), true);
    assert.equal(document.activeElement, reader);
  }
  assert.equal(revealed.length, 0);
  view.rerender(<Outliner nodes={nodes} onKeyDown={(event) => event.preventDefault()} />);
  fireEvent.keyDown(reader, { key: "ArrowDown" });
  assert.equal(document.activeElement, reader);
  assert.equal(revealed.length, 0);
});

test("reader does not capture arrows from nested outlines, and empty readers retain native behavior", () => {
  const view = render(
    <Outliner
      nodes={[{ id: "outer", text: "Outer" }]}
      renderBody={() => <Outliner aria-label="Inner" nodes={nodes} />}
    />,
  );
  const inner = view.getByRole("region", { name: "Inner" });
  focus(inner);
  fireEvent.keyDown(inner, { key: "ArrowDown" });
  assert.equal(activeId(), "a");
  assert.ok(inner.contains(document.activeElement));
  view.rerender(<Outliner nodes={[]} />);
  const empty = view.getByRole("region", { name: "Outline" });
  focus(empty);
  assert.equal(empty.tabIndex, -1);
  assert.equal(fireEvent.keyDown(empty, { key: "ArrowDown" }), true);
});

test("editor row navigation consumes arrows, reveals own row minimally, and preserves selection/history", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} showToolbar={false} />,
  );
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  focus(input);
  fireEvent.keyDown(input, { key: "Escape" });
  revealed = [];
  assert.equal(
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown", shiftKey: true }),
    false,
  );
  assert.equal(activeId(), "b");
  assert.deepEqual([...ref.current!.getState().selection], ["a", "b"]);
  assert.equal(revealed.length, 1);
  assert.ok(revealed[0]!.element.classList.contains("fast-ux-outliner__row"));
  assert.deepEqual(revealed[0]!.options, nearest);
  assert.equal(ref.current!.getState().revision, 0);
  assert.equal(ref.current!.getState().history.past.length, 0);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
  revealed = [];
  assert.equal(fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" }), false);
  assert.equal(activeId(), "a");
  assert.equal(revealed.length, 0);
});

test("editor text preserves multiline caret navigation and consumes cross-row/boundary arrows only", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={[
        { id: "a", text: "First\nSecond" },
        { id: "b", text: "Next" },
      ]}
      readOnly={false}
      showToolbar={false}
    />,
  );
  const input = view.getByRole("textbox", { name: /Edit First\s+Second/ }) as HTMLTextAreaElement;
  focus(input);
  input.setSelectionRange(2, 2);
  assert.equal(fireEvent.keyDown(input, { key: "ArrowDown" }), true);
  assert.equal(document.activeElement, input);
  input.setSelectionRange(input.value.length, input.value.length);
  assert.equal(fireEvent.keyDown(input, { key: "ArrowDown" }), false);
  const next = view.getByRole("textbox", { name: "Edit Next" });
  assert.equal(document.activeElement, next);
  revealed = [];
  assert.equal(fireEvent.keyDown(next, { key: "ArrowDown" }), false);
  assert.equal(document.activeElement, next);
  assert.equal(revealed.length, 0);
});
