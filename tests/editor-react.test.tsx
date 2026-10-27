import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { createRef, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import {
  createReferenceCompletionProvider,
  type OutlineNode,
  type TextCompletionOffer,
  type TextCompletionProvider,
} from "../src/core/index.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://editor.test/",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
  "DOMRect",
  "NodeFilter",
  "CustomEvent",
  "EventTarget",
  "FocusEvent",
] as const)
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
for (const name of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name].bind(dom.window),
  });
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: {
    escape: (value: string) =>
      value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char.codePointAt(0)!.toString(16)} `),
  },
});
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/index.js");
const errors: unknown[] = [];
dom.window.addEventListener("error", (event) => errors.push(event.error));
afterEach(() => {
  cleanup();
  assert.deepEqual(errors.splice(0), []);
});
const fixture: readonly OutlineNode[] = [
  { id: "a", text: "Alpha", children: [{ id: "child", text: "Child" }] },
  { id: "b", text: "Beta" },
];
const textarea = (view: ReturnType<typeof render>, text: string) =>
  view.getByRole("textbox", { name: `Edit ${text}` }) as HTMLTextAreaElement;
const focus = (input: HTMLTextAreaElement, start: number, end = start) =>
  act(() => {
    input.focus();
    input.setSelectionRange(start, end);
  });

test("editor is a safe reader unless editing is explicitly enabled", () => {
  const ref = createRef<OutlineEditorHandle>(),
    changes: unknown[] = [];
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={fixture}
      onNodesChange={(nodes) => changes.push(nodes)}
    />,
  );
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: "Add item" }), null);
  act(() => ref.current!.dispatch({ type: "insert", id: "blocked" }));
  assert.equal(changes.length, 0);
  assert.equal(ref.current!.getState().refusal, "read-only");
});
test("direct React split, rapid typing, merge and undo keep the intended row and caret", () => {
  let id = 0;
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <StrictMode>
      <OutlineEditor
        ref={ref}
        defaultNodes={[{ id: "a", text: "Alpha" }]}
        readOnly={false}
        createId={() => `new${++id}`}
      />
    </StrictMode>,
  );
  const input = textarea(view, "Alpha");
  focus(input, 2);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(ref.current!.getState().nodes[0]!.text, "Al");
  const next = textarea(view, "pha");
  assert.equal(document.activeElement === next, true);
  assert.equal(next.selectionStart, 0);
  fireEvent.change(next, { target: { value: "Xpha", selectionStart: 1, selectionEnd: 1 } });
  assert.equal(ref.current!.getState().nodes[1]!.text, "Xpha");
  focus(next, 0);
  fireEvent.keyDown(next, { key: "Backspace" });
  assert.equal(ref.current!.getState().nodes[0]!.text, "AlXpha");
  assert.equal(ref.current!.getState().nodes.length, 1);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(ref.current!.getState().nodes.length, 2);
});
test("composition suppresses structural keys and preserves committed input", () => {
  const ref = createRef<OutlineEditorHandle>(),
    view = render(
      <OutlineEditor ref={ref} defaultNodes={[{ id: "a", text: "" }]} readOnly={false} />,
    );
  const input = textarea(view, "empty item");
  focus(input, 0);
  fireEvent.compositionStart(input);
  fireEvent.change(input, { target: { value: "日本", selectionStart: 2, selectionEnd: 2 } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  assert.equal(ref.current!.getState().nodes.length, 1);
  fireEvent.compositionEnd(input);
  assert.equal(ref.current!.getState().nodes[0]!.text, "日本");
});
test("Tab/ShiftTab hierarchy, row keyboard selection and deletion work independently of textarea typing", () => {
  const ref = createRef<OutlineEditorHandle>(),
    view = render(
      <OutlineEditor
        ref={ref}
        defaultNodes={[
          { id: "a", text: "Alpha" },
          { id: "b", text: "Beta" },
        ]}
        readOnly={false}
      />,
    );
  let input = textarea(view, "Beta");
  focus(input, 2);
  fireEvent.keyDown(input, { key: "Tab" });
  assert.equal(ref.current!.getState().nodes[0]!.children![0]!.id, "b");
  input = textarea(view, "Beta");
  fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
  assert.equal(ref.current!.getState().nodes.length, 2);
  fireEvent.keyDown(input, { key: "Escape" });
  const row = view.container.querySelector('[data-node-id="b"]') as HTMLElement;
  assert.equal(document.activeElement === row, true);
  fireEvent.keyDown(row, { key: "ArrowUp", shiftKey: true });
  assert.equal(ref.current!.getState().selection.size, 2);
  fireEvent.keyDown(document.activeElement!, { key: "Delete" });
  assert.equal(ref.current!.getState().nodes.length, 0);
});
test("controlled-state lag acknowledges older proposals without dropping newer input; unrelated replacement wins", () => {
  const initial = [{ id: "a", text: "A" }],
    proposals: (readonly OutlineNode[])[] = [],
    ref = createRef<OutlineEditorHandle>();
  const props = {
    ref,
    readOnly: false,
    onNodesChange: (nodes: readonly OutlineNode[]) => proposals.push(nodes),
  };
  const view = render(<OutlineEditor {...props} nodes={initial} />);
  fireEvent.change(textarea(view, "A"), { target: { value: "AB" } });
  fireEvent.change(textarea(view, "AB"), { target: { value: "ABC" } });
  assert.equal(proposals.length, 2);
  view.rerender(<OutlineEditor {...props} nodes={proposals[0]} />);
  assert.equal(textarea(view, "ABC").value, "ABC");
  view.rerender(<OutlineEditor {...props} nodes={proposals[1]} />);
  assert.equal(textarea(view, "ABC").value, "ABC");
  view.rerender(<OutlineEditor {...props} nodes={[{ id: "server", text: "Replacement" }]} />);
  assert.ok(textarea(view, "Replacement"));
  assert.equal(ref.current!.getState().history.past.length, 0);
});
test("completion owns Enter/Tab, replaces a whole token and undo restores original", async () => {
  const provider = createReferenceCompletionProvider({
    id: "people",
    trigger: "@",
    entities: [
      { id: "alice", spelling: "alice" },
      { id: "albert", spelling: "albert" },
    ],
  });
  const ref = createRef<OutlineEditorHandle>(),
    view = render(
      <OutlineEditor
        ref={ref}
        defaultNodes={[{ id: "a", text: "Hi @alxx!" }]}
        readOnly={false}
        completionProviders={[provider]}
      />,
    );
  const input = textarea(view, "Hi @alxx!");
  focus(input, 6);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  assert.equal(view.getAllByRole("option").length, 2);
  assert.ok(input.getAttribute("aria-controls"));
  assert.equal(input.hasAttribute("aria-expanded"), false);
  fireEvent.keyDown(input, { key: "ArrowDown" });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(ref.current!.getState().nodes.length, 1);
  assert.equal(ref.current!.getState().nodes[0]!.text, "Hi @albert!");
  assert.equal(view.queryByRole("listbox"), null);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(ref.current!.getState().nodes[0]!.text, "Hi @alxx!");
});
test("late completion cannot reopen dismissed UI or edit another row and provider errors leave editing usable", async () => {
  let resolve: (offer: TextCompletionOffer | null) => void = () => {};
  const provider: TextCompletionProvider = {
    id: "async",
    complete: () =>
      new Promise((done) => {
        resolve = done;
      }),
  };
  const view = render(
    <OutlineEditor defaultNodes={fixture} readOnly={false} completionProviders={[provider]} />,
  );
  const input = textarea(view, "Alpha");
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  fireEvent.keyDown(input, { key: "Escape" });
  await act(async () =>
    resolve({ range: { start: 0, end: 5 }, items: [{ id: "one", label: "Alpine" }] }),
  );
  assert.equal(view.queryByRole("listbox"), null);
  view.rerender(
    <OutlineEditor
      defaultNodes={fixture}
      readOnly={false}
      completionProviders={[
        {
          id: "fail",
          complete: () => {
            throw new Error("offline");
          },
        },
      ]}
    />,
  );
  const second = textarea(view, "Beta");
  focus(second, 2);
  await act(async () => {
    fireEvent.keyDown(second, { key: " ", ctrlKey: true });
  });
  assert.match(view.getByRole("status").textContent ?? "", /unavailable/i);
  fireEvent.change(second, { target: { value: "Beta still editable" } });
  assert.ok(textarea(view, "Beta still editable"));
});
test("generic extension hosts preserve context, guard actions, render slots and ignore stale analyses", () => {
  let calls = 0;
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={fixture}
      readOnly={false}
      plugins={[
        {
          id: "policy",
          beforeAction: (action) => (action.type === "delete" ? null : action),
          afterAction: () => calls++,
        },
      ]}
      getTextAnalysis={(node) => ({
        text: node.id === "a" ? "stale" : node.text,
        diagnostics: [{ start: 0, end: 1, severity: "hint", message: "Host hint" }],
      })}
      renderAccessory={(node) => <button onClick={() => calls++}>Inspect {node.id}</button>}
      renderBody={(node) => <div>Rich body {node.id}</div>}
      renderCollapsed={(node) => <button>Summary {node.id}</button>}
      getPlaceholders={(parent) =>
        parent?.id === "a" ? [{ id: "template", label: "New decision", text: "Decision" }] : []
      }
    />,
  );
  act(() => ref.current!.dispatch({ type: "delete", ids: ["b"] }));
  assert.equal(ref.current!.getState().nodes.length, 2);
  assert.equal(view.getAllByText("hint: Host hint").length, 2);
  assert.ok(view.getByText("Rich body a"));
  fireEvent.click(view.getByRole("button", { name: "Inspect a" }));
  assert.ok(calls > 0);
  fireEvent.click(view.getByRole("button", { name: "New decision" }));
  assert.ok(textarea(view, "Decision"));
  fireEvent.click(view.getByRole("button", { name: "Collapse Alpha" }));
  assert.ok(view.getByRole("button", { name: "Summary a" }));
});
test("two editors and SSR stay independent, and pending async work is harmless after unmount", async () => {
  const html = renderToString(
    <>
      <OutlineEditor defaultNodes={fixture} readOnly={false} />
      <OutlineEditor defaultNodes={fixture} readOnly={false} />
    </>,
  );
  assert.equal((html.match(/<textarea/g) ?? []).length, 6);
  let resolve: (offer: TextCompletionOffer | null) => void = () => {};
  const view = render(
    <OutlineEditor
      defaultNodes={fixture}
      readOnly={false}
      completionProviders={[
        {
          id: "pending",
          complete: () =>
            new Promise((done) => {
              resolve = done;
            }),
        },
      ]}
    />,
  );
  const input = textarea(view, "Alpha");
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  view.unmount();
  await act(async () =>
    resolve({ range: { start: 0, end: 5 }, items: [{ id: "one", label: "Alpine" }] }),
  );
});

test("rich selection cut/paste uses a lossless MIME and regenerated IDs instead of dropping metadata", () => {
  const rich = {
    id: "rich",
    text: "Rich",
    data: {
      content: {
        schema: "fast-ux-rich",
        version: 1,
        blocks: [{ id: "md", kind: "markdown", source: "# Preserved" }],
      },
    },
    children: [{ id: "hidden", text: "Hidden" }],
  };
  let id = 0;
  const ref = createRef<OutlineEditorHandle>(),
    view = render(
      <OutlineEditor
        ref={ref}
        defaultNodes={[rich, { id: "target", text: "Target" }]}
        readOnly={false}
        createId={() => `copied-${++id}`}
      />,
    );
  act(() => ref.current!.dispatch({ type: "select", id: "rich" }));
  const store = new Map<string, string>(),
    clipboard = {
      setData: (key: string, value: string) => store.set(key, value),
      getData: (key: string) => store.get(key) ?? "",
    };
  fireEvent.cut(view.container.querySelector('[data-node-id="rich"]')!, {
    clipboardData: clipboard,
  });
  assert.ok(store.has("application/x-fast-ux-outline+json"));
  assert.equal(ref.current!.getState().nodes.length, 1);
  const input = textarea(view, "Target");
  focus(input, 6);
  fireEvent.paste(input, { clipboardData: clipboard });
  const copied = ref.current!.getState().nodes[1]!;
  assert.deepEqual(copied.data, rich.data);
  assert.equal(copied.children!.length, 1);
  assert.notEqual(copied.id, "rich");
});
test("failed lossless clipboard write never deletes rich selected content", () => {
  const ref = createRef<OutlineEditorHandle>(),
    view = render(<OutlineEditor ref={ref} defaultNodes={fixture} readOnly={false} />);
  act(() => ref.current!.dispatch({ type: "select", id: "a" }));
  fireEvent.cut(view.container.querySelector('[data-node-id="a"]')!, {
    clipboardData: {
      setData() {
        throw new Error("denied");
      },
    },
  });
  assert.equal(ref.current!.getState().nodes.length, 2);
  assert.match(view.getByRole("status").textContent ?? "", /not changed/);
});
test("read-only transition preserves hoist and noneditable content slots without a keyboard surface", () => {
  const ref = createRef<OutlineEditorHandle>();
  const props = {
    ref,
    defaultNodes: fixture,
    renderBody: (node: OutlineNode) => <div>Body {node.id}</div>,
    renderAccessory: (node: OutlineNode) => <button>Inspect {node.id}</button>,
  };
  const view = render(<OutlineEditor {...props} readOnly={false} />);
  act(() => ref.current!.dispatch({ type: "hoist", id: "a" }));
  view.rerender(<OutlineEditor {...props} readOnly />);
  assert.equal(view.queryByRole("textbox"), null);
  assert.ok(view.getByText("Body a"));
  assert.ok(view.getByRole("button", { name: "Inspect a" }));
  assert.equal(view.queryByText("Beta"), null);
  assert.ok(view.getByRole("navigation", { name: "Outline path" }));
});
test("task checkbox has an associated full-target label and selected task refusal publishes no partial change", () => {
  const ref = createRef<OutlineEditorHandle>(),
    changes: unknown[] = [];
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={[
        { id: "a", text: "Alpha", checked: false },
        { id: "b", text: "Beta", checked: false },
      ]}
      readOnly={false}
      isLocked={(node) => node.id === "b"}
      onNodesChange={(nodes) => changes.push(nodes)}
    />,
  );
  assert.equal(
    view.getByRole("checkbox", { name: "Complete Alpha" }).closest("label")?.className,
    "fast-ux-editor__task",
  );
  act(() => {
    ref.current!.dispatch({ type: "select", id: "a" });
    ref.current!.dispatch({ type: "select", id: "b", extend: true });
  });
  fireEvent.keyDown(view.container.querySelector('[data-node-id="b"]')!, { key: " " });
  assert.equal(changes.length, 0);
  assert.deepEqual(
    ref.current!.getState().nodes.map((node) => node.checked),
    [false, false],
  );
});
test("throwing completion triggers and malformed offers fail safely without changing text", async () => {
  const view = render(
    <OutlineEditor
      defaultNodes={[{ id: "a", text: "A" }]}
      readOnly={false}
      completionProviders={[
        {
          id: "bad",
          shouldTrigger: () => {
            throw new Error("bad trigger");
          },
          complete: () => null,
        },
      ]}
    />,
  );
  const input = textarea(view, "A");
  focus(input, 1);
  fireEvent.change(input, { target: { value: "AB" } });
  assert.match(view.getByRole("status").textContent ?? "", /unavailable/);
  assert.ok(textarea(view, "AB"));
  view.rerender(
    <OutlineEditor
      defaultNodes={[{ id: "a", text: "A" }]}
      readOnly={false}
      completionProviders={[
        {
          id: "malformed",
          complete: () =>
            ({ range: { start: 0, end: 2 }, items: [null, { id: "x", label: 42 }] }) as never,
        },
      ]}
    />,
  );
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  assert.equal(view.queryByRole("listbox"), null);
});
test("host replacement while drag is pending cancels stale source safely", () => {
  const initial = fixture,
    ref = createRef<OutlineEditorHandle>(),
    view = render(<OutlineEditor ref={ref} nodes={initial} readOnly={false} />);
  const pointer = new dom.window.Event("pointerdown", { bubbles: true });
  Object.assign(pointer, { pointerId: 7, button: 0, clientX: 0, clientY: 0 });
  fireEvent(view.getByRole("button", { name: "Reorder Alpha" }), pointer);
  view.rerender(
    <OutlineEditor ref={ref} nodes={[{ id: "new", text: "New document" }]} readOnly={false} />,
  );
  const move = new dom.window.Event("pointermove", { bubbles: true });
  Object.assign(move, { pointerId: 7, clientX: 100, clientY: 100 });
  fireEvent(document, move);
  assert.equal(ref.current!.getState().nodes[0]!.id, "new");
  assert.equal(ref.current!.getState().revision, 1);
});

test("resetKey explicitly rejects an optimistic edit even when the host retains the original nodes object", () => {
  const nodes = [{ id: "a", text: "Original" }],
    ref = createRef<OutlineEditorHandle>();
  const view = render(<OutlineEditor ref={ref} nodes={nodes} readOnly={false} resetKey={0} />);
  fireEvent.change(textarea(view, "Original"), { target: { value: "Optimistic" } });
  assert.ok(textarea(view, "Optimistic"));
  view.rerender(<OutlineEditor ref={ref} nodes={nodes} readOnly={false} resetKey={1} />);
  assert.ok(textarea(view, "Original"));
  assert.equal(ref.current!.getState().history.past.length, 0);
});
test("keyboard/touch information is interactive, dismissible and does not alter text or steal input focus", async () => {
  const ref = createRef<OutlineEditorHandle>(),
    nodes = [{ id: "a", text: "Alpha" }];
  const provider = {
    id: "help",
    hover: () => ({
      range: { start: 0, end: 5 },
      content: (
        <>
          <p>Meaning of Alpha</p>
          <a href="#details">Open details</a>
        </>
      ),
    }),
  };
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} hoverProviders={[provider]} />,
  );
  const input = textarea(view, "Alpha");
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: "F1", altKey: true });
  });
  assert.ok(view.getByRole("dialog", { name: "Text information" }));
  assert.equal(document.activeElement === input, true);
  assert.ok(input.getAttribute("aria-describedby")?.includes("information"));
  fireEvent.click(view.getByRole("link", { name: "Open details" }));
  assert.ok(view.getByRole("dialog"));
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(view.queryByRole("dialog"), null);
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Information about Alpha" }));
  });
  assert.ok(view.getByText("Meaning of Alpha"));
  fireEvent.click(view.getByRole("button", { name: "Close information" }));
  assert.equal(view.queryByRole("dialog"), null);
  assert.strictEqual(ref.current!.getState().nodes, nodes);
});
test("removing a pending completion provider invalidates its result", async () => {
  let resolve: (offer: TextCompletionOffer | null) => void = () => {};
  const provider: TextCompletionProvider = {
    id: "one",
    complete: () =>
      new Promise((done) => {
        resolve = done;
      }),
  };
  const nodes = [{ id: "a", text: "Al" }];
  const view = render(
    <OutlineEditor defaultNodes={nodes} readOnly={false} completionProviders={[provider]} />,
  );
  const input = textarea(view, "Al");
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} completionProviders={[]} />);
  await act(async () =>
    resolve({ range: { start: 0, end: 2 }, items: [{ id: "alpha", label: "Alpha" }] }),
  );
  assert.equal(view.queryByRole("listbox"), null);
});
test("silent custom MIME rejection and oversized data prevent destructive cut", () => {
  const ref = createRef<OutlineEditorHandle>(),
    view = render(<OutlineEditor ref={ref} defaultNodes={fixture} readOnly={false} />);
  act(() => ref.current!.dispatch({ type: "select", id: "a" }));
  fireEvent.cut(view.container.querySelector('[data-node-id="a"]')!, {
    clipboardData: {
      setData() {},
      getData() {
        return "";
      },
    },
  });
  assert.equal(ref.current!.getState().nodes.length, 2);
  assert.match(view.getByRole("status").textContent ?? "", /not changed/);
});

test("pending keyboard information cannot open after caret or row focus changes", async () => {
  let resolve: (
    offer: { range: { start: number; end: number }; content: string } | null,
  ) => void = () => {};
  const provider = {
    id: "slow-info",
    hover: () =>
      new Promise<{ range: { start: number; end: number }; content: string } | null>((done) => {
        resolve = done;
      }),
  };
  const view = render(
    <OutlineEditor defaultNodes={fixture} readOnly={false} hoverProviders={[provider]} />,
  );
  const input = textarea(view, "Alpha");
  focus(input, 2);
  await act(async () => {
    fireEvent.keyDown(input, { key: "F1", altKey: true });
  });
  focus(input, 3);
  fireEvent.select(input);
  await act(async () =>
    resolve({ range: { start: 0, end: 5 }, content: "Stale caret information" }),
  );
  assert.equal(view.queryByRole("dialog"), null);
  await act(async () => {
    fireEvent.keyDown(input, { key: "F1", altKey: true });
  });
  focus(textarea(view, "Beta"), 1);
  await act(async () => resolve({ range: { start: 0, end: 5 }, content: "Stale row information" }));
  assert.equal(view.queryByRole("dialog"), null);
});

test("pointer reorder crosses its threshold, previews a gap, commits once and cancels without mutation", () => {
  const ref = createRef<OutlineEditorHandle>(),
    changes: unknown[] = [],
    nodes = [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
      { id: "c", text: "Gamma" },
    ];
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={nodes}
      readOnly={false}
      onNodesChange={(next) => changes.push(next)}
    />,
  );
  for (const [index, row] of [
    ...view.container.querySelectorAll<HTMLElement>("[data-node-id]"),
  ].entries())
    row.getBoundingClientRect = () => new DOMRect(0, index * 80, 400, 80);
  const pointer = (target: Element | Document, type: string, x: number, y: number) => {
    const event = new dom.window.Event(type, { bubbles: true, cancelable: true });
    Object.assign(event, { pointerId: 4, button: 0, clientX: x, clientY: y });
    fireEvent(target, event);
  };
  pointer(view.getByRole("button", { name: "Reorder Beta" }), "pointerdown", 10, 120);
  pointer(document, "pointermove", 11, 121);
  assert.equal(changes.length, 0);
  pointer(document, "pointermove", 10, 300);
  assert.match(view.getByRole("status").textContent ?? "", /Move to level/);
  pointer(document, "pointerup", 10, 300);
  assert.deepEqual(
    ref.current!.getState().nodes.map((node) => node.id),
    ["a", "c", "b"],
  );
  assert.equal(changes.length, 1);
  pointer(view.getByRole("button", { name: "Reorder Alpha" }), "pointerdown", 10, 20);
  pointer(document, "pointermove", 40, 300);
  pointer(document, "pointercancel", 40, 300);
  assert.equal(changes.length, 1);
});

test("editor suggestions and interactive information stay inside the enclosing modal focus scope", async () => {
  const { ModalDialog } = await import("../src/components/index.js");
  const people = createReferenceCompletionProvider({
    id: "people",
    trigger: "@",
    entities: [{ id: "alice", spelling: "alice" }],
  });
  const openChanges: boolean[] = [];
  const view = render(
    <ModalDialog title="Edit notes" isOpen onOpenChange={(open) => openChanges.push(open)}>
      <OutlineEditor
        defaultNodes={[{ id: "a", text: "@al" }]}
        readOnly={false}
        completionProviders={[people]}
        hoverProviders={[
          {
            id: "info",
            hover: () => ({
              range: { start: 0, end: 3 },
              content: <a href="#detail">Modal information link</a>,
            }),
          },
        ]}
      />
    </ModalDialog>,
  );
  const modal = view.getByRole("dialog", { name: "Edit notes" }),
    input = textarea(view, "@al");
  focus(input, 3);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  assert.equal(modal.contains(view.getByRole("listbox")), true);
  assert.equal(document.activeElement === input, true);
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(view.queryByRole("listbox"), null);
  assert.deepEqual(openChanges, []);
  await act(async () => {
    fireEvent.keyDown(input, { key: "F1", altKey: true });
  });
  const info = view.getByRole("dialog", { name: "Text information" }),
    link = view.getByRole("link", { name: "Modal information link" });
  assert.equal(modal.contains(info), true);
  await act(async () => {
    link.focus();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.equal(document.activeElement === link, true);
  fireEvent.keyDown(link, { key: "Escape" });
  assert.equal(view.queryByRole("dialog", { name: "Text information" }), null);
  assert.deepEqual(openChanges, []);
  await act(async () => {
    view.unmount();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
});
