import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors, dom } from "./components-dom.js";
const { cleanup, fireEvent, render, act } = await import("@testing-library/react");
const { Outliner } = await import("../src/react/Outliner.js");
const nodes = [
  { id: "a", text: "Alpha", children: [{ id: "b", text: "Beta" }] },
  { id: "c", text: "Gamma" },
];
afterEach(() => {
  cleanup();
  document.getSelection()?.removeAllRanges();
  assert.deepEqual(browserErrors.splice(0), []);
});
function pointer(target: Element | Document, type: string, props: Record<string, unknown> = {}) {
  const event = new dom.window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    button: 0,
    clientX: 20,
    clientY: 20,
    ...props,
  });
  Object.defineProperties(event, {
    pointerId: { value: props.pointerId ?? 1 },
    isPrimary: { value: props.isPrimary ?? true },
    pointerType: { value: props.pointerType ?? "touch" },
  });
  fireEvent(target, event);
}
function hold(target: HTMLElement, during?: () => void) {
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    pointer(target, "pointerdown");
    during?.();
    now = 1600;
    pointer(target, "pointerup");
    fireEvent.click(target, { detail: 1 });
  } finally {
    Date.now = originalNow;
  }
}

test("row profile folds titles and hoists only the leading bullet without duplicate controls", () => {
  const view = render(<Outliner nodes={nodes} interactionMode="row" enableHoist />);
  const fold = view.getByRole("button", { name: "Collapse Alpha" });
  assert.ok(fold.classList.contains("fast-ux-outliner__row-action"));
  assert.equal(view.container.querySelectorAll(".fast-ux-outliner__toggle").length, 0);
  const bullet = view.getByRole("button", { name: "Focus on Alpha" });
  assert.ok(bullet.parentElement!.classList.contains("fast-ux-outliner__gutter"));
  fireEvent.click(fold);
  assert.equal(view.queryByText("Beta"), null);
  fireEvent.click(view.getByRole("button", { name: "Expand Alpha" }));
  assert.ok(view.getByText("Beta"));
  fireEvent.click(bullet);
  assert.equal(view.getByRole("region").dataset.hoistedId, "a");
  assert.equal(view.queryByText("Gamma"), null);
  fireEvent.click(view.getByRole("button", { name: "All notes" }));
  assert.equal(document.activeElement, view.getByRole("button", { name: "Focus on Alpha" }));
});

test("row profile retains controlled folds, Alt recursion, leaf activation and keyboard ownership", () => {
  const changes: unknown[] = [],
    leaves: string[] = [];
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      expandedIds={new Set(["a"])}
      onExpandedChange={(_, change) => changes.push(change)}
      onRowActivate={(node) => leaves.push(node.id)}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Collapse Alpha" }), { altKey: true });
  assert.deepEqual(changes, [
    { id: "a", isExpanded: false, affectedIds: ["a", "b"], recursive: true },
  ]);
  assert.ok(view.getByText("Beta"), "controlled state remains host-owned");
  fireEvent.click(view.getByRole("button", { name: "Gamma" }));
  assert.deepEqual(leaves, ["c"]);
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  act(() => title.focus());
  fireEvent.keyDown(title, { key: "ArrowDown" });
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "b");
  fireEvent.keyDown(document.activeElement!, { key: "Enter" });
  assert.deepEqual(leaves, ["c", "b"]);
});

test("held release requests edit once without folding; F2 is the equivalent keyboard request", () => {
  const edits: string[] = [];
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      canEdit={() => true}
      onEditRequest={(node) => edits.push(node.id)}
    />,
  );
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  hold(title);
  assert.deepEqual(edits, ["a"]);
  assert.ok(view.getByText("Beta"));
  fireEvent.keyDown(title, { key: "F2" });
  assert.deepEqual(edits, ["a", "a"]);
  fireEvent.keyDown(title, { key: "F2", isComposing: true });
  fireEvent.keyDown(title, { key: "F2", ctrlKey: true });
  assert.deepEqual(edits, ["a", "a"]);
});

test("native cancellation, motion, scroll, selection, multiple pointers and drag never edit or fold", () => {
  for (const interrupt of [
    (target: HTMLElement) => fireEvent.contextMenu(target),
    (target: HTMLElement) => pointer(target, "pointermove", { clientX: 40 }),
    (target: HTMLElement) => pointer(target, "pointercancel"),
    (target: HTMLElement) => pointer(target, "pointerdown", { pointerId: 2, isPrimary: false }),
    (target: HTMLElement) => fireEvent.dragStart(target),
    () => fireEvent.scroll(document),
    (target: HTMLElement) => {
      const range = document.createRange();
      range.selectNodeContents(target);
      document.getSelection()!.addRange(range);
      fireEvent(document, new Event("selectionchange"));
    },
  ]) {
    let edits = 0;
    const view = render(
      <Outliner
        nodes={nodes}
        interactionMode="row"
        canEdit={() => true}
        onEditRequest={() => edits++}
      />,
    );
    const title = view.getByRole("button", { name: "Collapse Alpha" });
    hold(title, () => interrupt(title));
    assert.equal(edits, 0);
    assert.ok(view.getByText("Beta"));
    document.getSelection()?.removeAllRanges();
    cleanup();
  }
});

test("no capability means no edit; host replacement invalidates held target", () => {
  let edits = 0;
  const view = render(
    <Outliner nodes={nodes} interactionMode="row" onEditRequest={() => edits++} />,
  );
  hold(view.getByRole("button", { name: "Collapse Alpha" }));
  assert.equal(edits, 0);
  assert.ok(view.getByText("Beta"));
  fireEvent.keyDown(view.getByRole("button", { name: "Collapse Alpha" }), { key: "F2" });
  assert.equal(edits, 0);
  view.rerender(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      canEdit={() => true}
      onEditRequest={() => edits++}
    />,
  );
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  hold(title, () =>
    view.rerender(
      <Outliner
        nodes={[{ id: "fresh", text: "Replacement" }]}
        interactionMode="row"
        canEdit={() => true}
        onEditRequest={() => edits++}
      />,
    ),
  );
  assert.equal(edits, 0);
});

test("rich titles, bodies, suffixes and nested controls remain independent with no nested buttons", () => {
  let edits = 0,
    custom = 0;
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      enableHoist
      canEdit={() => true}
      onEditRequest={() => edits++}
      renderContent={(node) => (
        <>
          <span>{node.text}</span>
          <button onClick={() => custom++}>Custom {node.id}</button>
        </>
      )}
      renderBody={(node) => <input aria-label={`Value ${node.id}`} />}
      renderSuffix={(node) => <button>Suffix {node.id}</button>}
    />,
  );
  assert.equal(view.container.querySelector("button button"), null);
  assert.ok(
    view
      .getByRole("button", { name: "Collapse Alpha" })
      .classList.contains("fast-ux-outliner__toggle"),
  );
  const customButton = view.getByRole("button", { name: "Custom a" });
  fireEvent.click(customButton);
  assert.equal(custom, 1);
  hold(customButton);
  fireEvent.keyDown(customButton, { key: "F2" });
  fireEvent.click(view.getByRole("textbox", { name: "Value a" }));
  fireEvent.click(view.getByRole("button", { name: "Suffix a" }));
  assert.equal(edits, 0);
  assert.ok(view.getByText("Beta"));
});

test("legacy default remains separate disclosure and hoist with no row-click activation", () => {
  const view = render(<Outliner nodes={nodes} enableHoist />);
  fireEvent.click(view.getByText("Alpha"));
  assert.ok(view.getByText("Beta"));
  assert.ok(
    view
      .getByRole("button", { name: "Collapse Alpha" })
      .classList.contains("fast-ux-outliner__toggle"),
  );
  assert.equal(view.container.querySelector(".fast-ux-outliner__row-action"), null);
});

test("release displacement and nonprimary buttons cannot edit or fold even without a move event", () => {
  for (const [down, up] of [
    [{}, { clientY: 80 }],
    [{ button: 2 }, {}],
    [{ isPrimary: false }, {}],
    [{}, { button: 2 }],
  ]) {
    let edits = 0;
    const view = render(
      <Outliner
        nodes={nodes}
        interactionMode="row"
        canEdit={() => true}
        onEditRequest={() => edits++}
      />,
    );
    const title = view.getByRole("button", { name: "Collapse Alpha" });
    const originalNow = Date.now;
    let now = 1000;
    Date.now = () => now;
    try {
      pointer(title, "pointerdown", down);
      now = 1600;
      pointer(title, "pointerup", up);
      fireEvent.click(title, { detail: 1 });
    } finally {
      Date.now = originalNow;
    }
    assert.equal(edits, 0);
    assert.ok(view.getByText("Beta"));
    cleanup();
  }
});

test("held modified presses are inert while a short Alt click remains recursive", () => {
  let edits = 0;
  const changes: unknown[] = [];
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      canEdit={() => true}
      onEditRequest={() => edits++}
      onExpandedChange={(_, change) => changes.push(change)}
    />,
  );
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    pointer(title, "pointerdown", { altKey: true });
    now = 1700;
    pointer(title, "pointerup", { altKey: true });
    fireEvent.click(title, { detail: 1, altKey: true });
    assert.equal(edits, 0);
    assert.deepEqual(changes, []);
    pointer(title, "pointerdown", { altKey: true });
    now = 1800;
    pointer(title, "pointerup", { altKey: true });
    fireEvent.click(title, { detail: 1, altKey: true });
  } finally {
    Date.now = originalNow;
  }
  assert.deepEqual(changes, [
    { id: "a", isExpanded: false, affectedIds: ["a", "b"], recursive: true },
  ]);
});

test("same-ID host replacement cancels a pending click and a backwards clock never becomes a tap", () => {
  let edits = 0;
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      canEdit={() => true}
      onEditRequest={() => edits++}
    />,
  );
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  hold(title, () =>
    view.rerender(
      <Outliner
        nodes={nodes.map((node) => ({ ...node }))}
        interactionMode="row"
        canEdit={() => true}
        onEditRequest={() => edits++}
      />,
    ),
  );
  assert.equal(edits, 0);
  assert.ok(view.getByText("Beta"));
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => now;
  try {
    pointer(title, "pointerdown");
    now = 500;
    pointer(title, "pointerup");
    fireEvent.click(title, { detail: 1 });
  } finally {
    Date.now = originalNow;
  }
  assert.equal(edits, 0);
  assert.ok(view.getByText("Beta"));
});

test("unmount removes every document listener owned by a pending gesture", () => {
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      canEdit={() => true}
      onEditRequest={() => assert.fail("unmounted edit")}
    />,
  );
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  const added: [string, EventListenerOrEventListenerObject][] = [];
  const removed: [string, EventListenerOrEventListenerObject][] = [];
  const originalAdd = document.addEventListener;
  const originalRemove = document.removeEventListener;
  document.addEventListener = function (
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (callback) added.push([type, callback]);
    if (callback) originalAdd.call(this, type, callback, options);
  };
  document.removeEventListener = function (
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (callback) removed.push([type, callback]);
    if (callback) originalRemove.call(this, type, callback, options);
  };
  try {
    pointer(title, "pointerdown");
    view.unmount();
    const ownTypes = new Set([
      "pointermove",
      "pointerdown",
      "pointerup",
      "pointercancel",
      "contextmenu",
      "dragstart",
      "scroll",
      "selectionchange",
    ]);
    const ownAdded = added.filter(([type]) => ownTypes.has(type));
    assert.ok(ownAdded.length >= 8);
    for (const [type, listener] of ownAdded)
      assert.ok(
        removed.some(
          ([removedType, removedListener]) => type === removedType && listener === removedListener,
        ),
        `${type} removed`,
      );
  } finally {
    document.addEventListener = originalAdd;
    document.removeEventListener = originalRemove;
  }
});

test("pointer cancellation does not consume a later independent primary tap", () => {
  const view = render(<Outliner nodes={nodes} interactionMode="row" />);
  const title = view.getByRole("button", { name: "Collapse Alpha" });
  pointer(title, "pointerdown", { pointerId: 1 });
  pointer(title, "pointercancel", { pointerId: 1 });
  pointer(title, "pointerdown", { pointerId: 2 });
  pointer(title, "pointerup", { pointerId: 2 });
  fireEvent.click(title, { detail: 1 });
  assert.equal(view.queryByText("Beta"), null);
});

test("row profile spacing selectors do not reach nested legacy reader content", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const view = render(
    <Outliner
      nodes={nodes}
      interactionMode="row"
      renderBody={(node) =>
        node.id === "a" ? (
          <Outliner nodes={[{ id: "inner", text: "Independent" }]} aria-label="Nested" />
        ) : null
      }
    />,
  );
  const nestedContent = view
    .getByRole("region", { name: "Nested" })
    .querySelector(".fast-ux-outliner__content")!;
  assert.equal(nestedContent.hasAttribute("data-row-interaction"), false);
  const selector = css.match(/(\.fast-ux-outliner__content\[data-row-interaction\])\s*\{/)?.[1];
  assert.ok(selector);
  assert.equal(nestedContent.matches(selector), false);
  assert.doesNotMatch(css, /\[data-interaction-mode="row"\]\s+\.fast-ux-outliner__/);
});
