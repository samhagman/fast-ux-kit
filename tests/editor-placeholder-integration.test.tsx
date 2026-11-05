import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef } from "react";
import { browserErrors } from "./components-dom.js";
import { findOutlineNode, type OutlineAction, type OutlineNode } from "../src/core/index.js";
import type {
  OutlineEditorHandle,
  OutlineEditorProps,
  OutlinePlaceholder,
} from "../src/react/OutlineEditor.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});

const fixture: readonly OutlineNode[] = [
  {
    id: "parent",
    text: "Parent",
    children: [
      { id: "first-child", text: "First child" },
      { id: "last-child", text: "Last child" },
    ],
  },
  { id: "last-root", text: "Last root" },
];
const rootPrompt: OutlinePlaceholder = {
  id: "root-prompt",
  label: "Add root thought",
  text: "Root default",
  caret: 2,
  index: 1,
};
const childPrompt: OutlinePlaceholder = {
  id: "child-prompt",
  label: "Add child thought",
  text: "Child default",
  caret: 3,
  index: 1,
};
const getPlaceholders = (node: OutlineNode | null) =>
  node === null ? [rootPrompt] : node.id === "parent" ? [childPrompt] : [];
const base = { defaultNodes: fixture, getPlaceholders, readOnly: false };
const ghost = (view: ReturnType<typeof render>, where: "root" | "child") =>
  view.getByRole("textbox", {
    name: new RegExp(`${where}.*: type here$`, "i"),
  }) as HTMLTextAreaElement;
const enterText = (target: HTMLTextAreaElement, text: string, caret = text.length) =>
  fireEvent.input(target, {
    target: { value: text, selectionStart: caret, selectionEnd: caret },
  });
const focus = (target: HTMLElement) => act(() => target.focus());

function assertInserted(
  ref: ReturnType<typeof createRef<OutlineEditorHandle>>,
  id: string,
  text: string,
  where: "root" | "child",
  caret: number,
) {
  const state = ref.current!.getState();
  const location = findOutlineNode(state.nodes, id);
  assert.equal(location?.node.text, text);
  assert.equal(location?.parentId, where === "root" ? null : "parent");
  assert.equal(location?.index, 1);
  assert.deepEqual(state.caret, { id, start: caret, end: caret });
  assert.equal(state.history.past.length, 1);
  assert.equal(state.revision, 1);
  const active = document.activeElement as HTMLTextAreaElement;
  assert.equal(active.getAttribute("aria-label"), `Edit ${text}`);
  assert.equal(active.value, text);
  assert.equal(active.selectionStart, caret);
  assert.equal(active.selectionEnd, caret);
}

test("default reader omits root/child prompts and never persists their defaults", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={fixture} getPlaceholders={getPlaceholders} />,
  );
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: rootPrompt.label }), null);
  assert.equal(view.queryByRole("button", { name: childPrompt.label }), null);
  assert.deepEqual(ref.current!.getState().nodes, fixture);
  assert.ok(!ref.current!.exportJSON().includes("Root default"));
  assert.ok(!ref.current!.exportJSON().includes("root-prompt"));
});

for (const where of ["root", "child"] as const) {
  test(`${where} direct typing inserts only user text at configured parent/index/caret and undoes once`, () => {
    const ref = createRef<OutlineEditorHandle>();
    const changes: OutlineAction[] = [];
    const view = render(
      <OutlineEditor
        {...base}
        ref={ref}
        createId={() => "typed"}
        onNodesChange={(_, action) => changes.push(action)}
      />,
    );
    const target = ghost(view, where);
    assert.equal(target.value, "");
    focus(target);
    enterText(target, "User🙂text", 6);
    assertInserted(ref, "typed", "User🙂text", where, 6);
    assert.deepEqual(
      changes.map((action) => action.type),
      ["insert"],
    );
    assert.equal(ghost(view, where).value, "");
    act(() => ref.current!.dispatch({ type: "undo" }));
    assert.deepEqual(ref.current!.getState().nodes, fixture);
    assert.equal(ref.current!.getState().history.past.length, 0);
  });

  test(`${where} paste creates one literal multiline node, not a parsed outline or default prefix`, () => {
    const ref = createRef<OutlineEditorHandle>();
    const changes: OutlineAction[] = [];
    const view = render(
      <OutlineEditor
        {...base}
        ref={ref}
        createId={() => "pasted"}
        onNodesChange={(_, action) => changes.push(action)}
      />,
    );
    const target = ghost(view, where);
    focus(target);
    const text = "first\n  - second\nlast";
    assert.equal(fireEvent.paste(target, { clipboardData: { getData: () => text } }), true);
    assert.equal(changes.length, 0);
    // Native default insertion is not implemented by jsdom; deliver its input result.
    enterText(target, text);
    assertInserted(ref, "pasted", text, where, text.length);
    assert.deepEqual(
      changes.map((action) => action.type),
      ["insert"],
    );
    act(() => ref.current!.dispatch({ type: "undo" }));
    assert.deepEqual(ref.current!.getState().nodes, fixture);
  });

  for (const activation of ["button", "empty Enter"] as const) {
    test(`${where} ${activation} preserves existing consumer default text and caret`, () => {
      const ref = createRef<OutlineEditorHandle>();
      const view = render(<OutlineEditor {...base} ref={ref} createId={() => "activated"} />);
      const prompt = where === "root" ? rootPrompt : childPrompt;
      if (activation === "button")
        fireEvent.click(view.getByRole("button", { name: prompt.label }));
      else {
        const target = ghost(view, where);
        focus(target);
        fireEvent.keyDown(target, { key: "Enter" });
      }
      assertInserted(ref, "activated", prompt.text!, where, prompt.caret!);
    });
  }
}

test("empty editor ghost paste bypasses whole-document paste interception", () => {
  const ref = createRef<OutlineEditorHandle>();
  const changes: OutlineAction[] = [];
  const view = render(
    <OutlineEditor
      readOnly={false}
      defaultNodes={[]}
      getPlaceholders={(node) => (node === null ? [{ ...rootPrompt, index: 0 }] : [])}
      ref={ref}
      createId={() => "only"}
      onNodesChange={(_, action) => changes.push(action)}
    />,
  );
  const target = ghost(view, "root");
  focus(target);
  const text = "one\ntwo";
  assert.equal(fireEvent.paste(target, { clipboardData: { getData: () => text } }), true);
  assert.equal(changes.length, 0);
  enterText(target, text);
  assert.deepEqual(ref.current!.getState().nodes, [{ id: "only", text }]);
  assert.deepEqual(
    changes.map((action) => action.type),
    ["insert"],
  );
  assert.equal(ref.current!.getState().history.past.length, 1);
});

for (const rejection of ["policy", "plugin cancellation", "duplicate generated id"] as const) {
  test(`${rejection} preserves the draft/focus and does not falsely acknowledge existing content`, () => {
    const ref = createRef<OutlineEditorHandle>();
    const text = rejection === "duplicate generated id" ? "Parent" : "Do not lose me";
    const changes: OutlineAction[] = [];
    const blocked: Partial<OutlineEditorProps> =
      rejection === "policy"
        ? { canChange: () => false }
        : rejection === "plugin cancellation"
          ? {
              plugins: [
                {
                  id: "cancel-insert",
                  beforeAction: (action) => (action.type === "insert" ? null : action),
                },
              ],
            }
          : { createId: () => "parent" };
    const props = {
      ...base,
      ref,
      createId: () => "accepted",
      onNodesChange: (_: readonly OutlineNode[], action: OutlineAction) => changes.push(action),
    };
    const view = render(<OutlineEditor {...props} {...blocked} />);
    const target = ghost(view, "root");
    focus(target);
    enterText(target, text, 4);
    assert.equal(target.value, text);
    assert.equal(target.selectionStart, 4);
    assert.equal(document.activeElement, target);
    assert.deepEqual(ref.current!.getState().nodes, fixture);
    assert.equal(ref.current!.getState().history.past.length, 0);
    assert.equal(changes.length, 0);
    view.rerender(<OutlineEditor {...props} />);
    assert.equal(ghost(view, "root"), target);
    assert.equal(target.value, text);
    fireEvent.keyDown(target, { key: "Enter" });
    assertInserted(ref, "accepted", text, "root", 4);
    assert.deepEqual(
      changes.map((action) => action.type),
      ["insert"],
    );
  });
}

test("a locked parent refuses child materialization without erasing the draft", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      {...base}
      ref={ref}
      createId={() => "blocked"}
      isLocked={(node) => node.id === "parent"}
    />,
  );
  const target = ghost(view, "child");
  focus(target);
  enterText(target, "Retain child text", 5);
  assert.equal(target.value, "Retain child text");
  assert.equal(document.activeElement, target);
  assert.deepEqual(ref.current!.getState().nodes, fixture);
  assert.equal(ref.current!.getState().refusal, "locked");
  assert.equal(ref.current!.getState().history.past.length, 0);
});

test("child prompts follow expansion and all draft inputs disappear in reader mode", () => {
  const ref = createRef<OutlineEditorHandle>();
  const props = { ...base, ref, canChange: () => false };
  const view = render(<OutlineEditor {...props} />);
  const target = ghost(view, "root");
  focus(target);
  enterText(target, "Private unpersisted draft");
  act(() => ref.current!.dispatch({ type: "toggle", id: "parent" }));
  assert.equal(view.queryByRole("textbox", { name: /child.*: type here$/i }), null);
  assert.equal(view.queryByRole("button", { name: childPrompt.label }), null);
  assert.equal(ghost(view, "root").value, "Private unpersisted draft");
  view.rerender(<OutlineEditor {...props} readOnly />);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: rootPrompt.label }), null);
  assert.equal(view.queryByRole("button", { name: childPrompt.label }), null);
  assert.ok(!view.container.textContent?.includes("Private unpersisted draft"));
  assert.deepEqual(ref.current!.getState().nodes, fixture);
});

test("a persistent prompt can be refocused to create another item without duplicate insertion", () => {
  const ref = createRef<OutlineEditorHandle>();
  let ids = 0;
  const changes: OutlineAction[] = [];
  const view = render(
    <OutlineEditor
      {...base}
      ref={ref}
      createId={() => `new-${++ids}`}
      onNodesChange={(_, action) => changes.push(action)}
    />,
  );
  const target = ghost(view, "root");
  focus(target);
  enterText(target, "First creation");
  assert.equal(ghost(view, "root"), target);
  assert.notEqual(document.activeElement, target);
  enterText(target, "First creation");
  assert.equal(changes.length, 1);
  focus(target);
  enterText(target, "Second creation");
  assert.deepEqual(
    changes.map((action) => action.type),
    ["insert", "insert"],
  );
  assert.equal(
    findOutlineNode(ref.current!.getState().nodes, "new-1")?.node.text,
    "First creation",
  );
  assert.equal(
    findOutlineNode(ref.current!.getState().nodes, "new-2")?.node.text,
    "Second creation",
  );
  assert.equal(ref.current!.getState().history.past.length, 2);
  act(() => ref.current!.dispatch({ type: "undo" }));
  assert.equal(findOutlineNode(ref.current!.getState().nodes, "new-2"), undefined);
  assert.equal(
    findOutlineNode(ref.current!.getState().nodes, "new-1")?.node.text,
    "First creation",
  );
});

test("rapid empty Enter delivery before focus transfer activates a persistent prompt only once", () => {
  const ref = createRef<OutlineEditorHandle>();
  let ids = 0;
  const changes: OutlineAction[] = [];
  const view = render(
    <OutlineEditor
      {...base}
      ref={ref}
      createId={() => `activation-${++ids}`}
      onNodesChange={(_, action) => changes.push(action)}
    />,
  );
  const target = ghost(view, "root");
  focus(target);
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true, cancelable: true }),
    );
  });
  assert.deepEqual(
    changes.map((action) => action.type),
    ["insert"],
  );
  assertInserted(ref, "activation-1", rootPrompt.text!, "root", rootPrompt.caret!);
});

test("refused empty Enter remains retryable after policy allows default activation", () => {
  const ref = createRef<OutlineEditorHandle>();
  const props = { ...base, ref, createId: () => "retried-default" };
  const view = render(<OutlineEditor {...props} canChange={() => false} />);
  const target = ghost(view, "root");
  focus(target);
  fireEvent.keyDown(target, { key: "Enter" });
  assert.deepEqual(ref.current!.getState().nodes, fixture);
  assert.equal(document.activeElement, target);
  assert.equal(target.value, "");
  view.rerender(<OutlineEditor {...props} />);
  fireEvent.keyDown(target, { key: "Enter" });
  assertInserted(ref, "retried-default", rootPrompt.text!, "root", rootPrompt.caret!);
});
