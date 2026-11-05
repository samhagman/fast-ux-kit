import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors, dom } from "./components-dom.js";
import { createRef, StrictMode } from "react";
import { renderToString } from "react-dom/server";
import type { OutlineNode, OutlineNoteAdapter } from "../src/core/index.js";
import type {
  OutlineEditorHandle,
  OutlineEditorProps,
  OutlinePlugin,
} from "../src/react/OutlineEditor.js";
// Popup caret geometry uses the browser's DOMRect constructor.
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

type Data = { note?: string; other?: string };
const adapter: OutlineNoteAdapter<Data> = {
  read: (node) => node.data?.note,
  prepareData: (node, note) => ({ ok: true, data: { ...node.data, note } }),
};
const nodes: readonly OutlineNode<Data>[] = [
  { id: "a", text: "Alpha", data: { note: "Long note", other: "retained" } },
  { id: "b", text: "Beta", data: { note: "" } },
];
function setup(props: Partial<OutlineEditorProps<Data>> = {}) {
  const ref = createRef<OutlineEditorHandle<Data>>();
  const view = render(
    <StrictMode>
      <OutlineEditor
        ref={ref}
        defaultNodes={nodes}
        readOnly={false}
        noteAdapter={adapter}
        {...props}
      />
    </StrictMode>,
  );
  return { view, ref };
}
function title(view: ReturnType<typeof render>, name = "Alpha") {
  return view.getByRole("textbox", { name: `Edit ${name}` }) as HTMLTextAreaElement;
}
function note(view: ReturnType<typeof render>, name = "Alpha") {
  return view.getByRole("textbox", { name: `Edit note for ${name}` }) as HTMLTextAreaElement;
}
function focus(input: HTMLTextAreaElement, start = input.value.length, end = start) {
  act(() => {
    input.focus();
    input.setSelectionRange(start, end);
  });
}
function open(view: ReturnType<typeof render>, name = "Alpha") {
  fireEvent.click(view.getByRole("button", { name: `Edit note for ${name}` }));
  return note(view, name);
}
function change(input: HTMLTextAreaElement, value: string) {
  fireEvent.change(input, {
    target: { value, selectionStart: value.length, selectionEnd: value.length },
  });
}

test("notes remain explicit and reader mode contains no editing surfaces", () => {
  const view = render(
    <OutlineEditor nodes={nodes} noteAdapter={adapter} noteKeyboardProfile="toggle" />,
  );
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: /Edit note/ }), null);
  assert.doesNotMatch(
    renderToString(<OutlineEditor nodes={nodes} noteAdapter={adapter} />),
    /textarea/,
  );
});
test("without profile title Shift+Enter retains native newline behavior; unavailable notes have no action", () => {
  const { view, ref } = setup({ defaultNodes: [...nodes, { id: "c", text: "Unavailable" }] });
  const input = title(view);
  focus(input);
  assert.equal(fireEvent.keyDown(input, { key: "Enter", shiftKey: true }), true);
  assert.equal(document.activeElement, input);
  assert.equal(ref.current!.getState().caret?.field, undefined);
  assert.equal(view.queryByRole("button", { name: "Edit note for Unavailable" }), null);
});
test("profile switches fields without document mutation and preserves arbitrary body identity", () => {
  const changes: unknown[] = [];
  const { view, ref } = setup({
    noteKeyboardProfile: "toggle",
    onNodesChange: (next) => changes.push(next),
    renderBody: () => <input aria-label="Host body" defaultValue="host state" />,
  });
  const body = view.getAllByLabelText("Host body")[0];
  const input = title(view);
  focus(input, 2);
  const before = ref.current!.getState();
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.equal(document.activeElement, note(view));
  assert.equal(note(view).selectionStart, 9);
  assert.equal(view.getAllByLabelText("Host body")[0], body);
  assert.equal(ref.current!.getState().nodes, before.nodes);
  assert.equal(ref.current!.getState().history.past.length, 0);
  fireEvent.keyDown(note(view), { key: "Enter", shiftKey: true });
  assert.equal(document.activeElement, input);
  assert.equal(changes.length, 0);
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
});
test("notes update canonical data immediately; Escape retains changes and exits to the row", () => {
  const { view, ref } = setup();
  change(open(view), "Edited\nsecond line");
  assert.equal(ref.current!.getState().nodes[0]!.data!.note, "Edited\nsecond line");
  assert.equal(ref.current!.getState().nodes[0]!.data!.other, "retained");
  fireEvent.keyDown(note(view), { key: "Escape" });
  assert.equal(document.activeElement, view.container.querySelector('[data-node-id="a"]'));
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  assert.ok(view.getByText("Edited second line", { exact: false }));
});
test("note Enter remains native, Tab inserts literal text and paste never creates structure", () => {
  const { view, ref } = setup();
  const input = open(view);
  focus(input, 2, 4);
  assert.equal(fireEvent.keyDown(input, { key: "Enter" }), true);
  fireEvent.keyDown(input, { key: "Tab" });
  assert.equal(note(view).value, "Lo\t note");
  const state = ref.current!.getState();
  assert.equal(fireEvent.keyDown(note(view), { key: "Tab", shiftKey: true }), true);
  assert.equal(ref.current!.getState(), state);
  fireEvent.paste(note(view), {
    clipboardData: {
      getData: (type: string) =>
        type === "text/plain" ? "\n- pasted\n  child" : "invalid structured payload",
    },
  });
  assert.equal(ref.current!.getState().nodes.length, 2);
  assert.equal(ref.current!.getState().nodes[0]!.text, "Alpha");
  assert.ok(note(view).value.includes("\n- pasted\n  child"));
});
test("undo from title restores note field and redo restores note text", () => {
  const { view, ref } = setup({ noteKeyboardProfile: "toggle" });
  change(open(view), "First edit");
  fireEvent.keyDown(note(view), { key: "Enter", shiftKey: true });
  fireEvent.keyDown(title(view), { key: "z", ctrlKey: true });
  assert.equal(ref.current!.getState().nodes[0]!.data!.note, "Long note");
  assert.equal(document.activeElement, note(view));
  fireEvent.keyDown(note(view), { key: "z", ctrlKey: true, shiftKey: true });
  assert.equal(note(view).value, "First edit");
  assert.equal(document.activeElement, note(view));
});
test("note keymaps are isolated from title plugins and completions", () => {
  let legacy = 0,
    notes = 0,
    completion = 0;
  const plugin: OutlinePlugin<Data> = {
    id: "fields",
    keymap: () => {
      legacy++;
      return undefined;
    },
    noteKeymap: (_event, context) => {
      assert.equal(context.field, "note");
      notes++;
      return undefined;
    },
  };
  const { view } = setup({
    plugins: [plugin],
    completionProviders: [
      {
        id: "test",
        complete: () => {
          completion++;
          return null;
        },
      },
    ],
  });
  const input = open(view);
  fireEvent.keyDown(input, { key: "a" });
  change(input, "Changed");
  assert.equal(notes, 1);
  assert.equal(legacy, 0);
  assert.equal(completion, 0);
});
test("refused and consumed note edits restore canonical value without false focus switches", () => {
  const { view, ref } = setup({ canChange: () => false });
  const input = open(view);
  change(input, "Refused");
  assert.equal(note(view).value, "Long note");
  assert.equal(ref.current!.getState().refusal, "locked");
  assert.equal(document.activeElement, input);
});
test("consumed note entry and exit do not steal focus", () => {
  let consume: "focus" | "select" = "focus";
  const { view } = setup({
    plugins: [
      { id: "consume", beforeAction: (action) => (action.type === consume ? null : action) },
    ],
    noteKeyboardProfile: "toggle",
  });
  const input = title(view);
  focus(input);
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.equal(document.activeElement, input);
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  consume = "select";
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  const active = note(view);
  fireEvent.keyDown(active, { key: "Escape" });
  assert.equal(document.activeElement, active);
});
test("controlled optimistic echo retains history; reset restores canonical note", () => {
  const ref = createRef<OutlineEditorHandle<Data>>();
  let proposed = nodes;
  const props = {
    ref,
    nodes,
    readOnly: false,
    noteAdapter: adapter,
    onNodesChange: (next: readonly OutlineNode<Data>[]) => {
      proposed = next;
    },
  };
  const view = render(<OutlineEditor {...props} />);
  change(open(view), "Optimistic");
  view.rerender(<OutlineEditor {...props} nodes={proposed} />);
  assert.equal(note(view).value, "Optimistic");
  assert.equal(ref.current!.getState().history.past.length, 1);
  view.rerender(<OutlineEditor {...props} resetKey={1} />);
  assert.equal(note(view).value, "Long note");
  assert.equal(ref.current!.getState().history.past.length, 0);
});
test("replacement removal, folding and hoisting leave no orphan note editor", () => {
  const ref = createRef<OutlineEditorHandle<Data>>();
  const tree: readonly OutlineNode<Data>[] = [{ id: "p", text: "Parent", children: nodes }];
  const view = render(
    <OutlineEditor ref={ref} nodes={tree} readOnly={false} noteAdapter={adapter} />,
  );
  open(view);
  act(() => ref.current!.dispatch({ type: "toggle", id: "p" }));
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  assert.equal(document.activeElement, title(view, "Parent"));
  act(() => ref.current!.dispatch({ type: "reveal", id: "a", field: "note" }));
  assert.equal(document.activeElement, note(view));
  act(() => ref.current!.dispatch({ type: "hoist", id: "b" }));
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  view.rerender(<OutlineEditor ref={ref} nodes={[]} readOnly={false} noteAdapter={adapter} />);
  assert.equal(view.queryByRole("textbox"), null);
});
test("dynamic lock and adapter removal invalidate note focus safely", () => {
  const ref = createRef<OutlineEditorHandle<Data>>();
  const props = { ref, nodes, readOnly: false, noteAdapter: adapter };
  const view = render(<OutlineEditor {...props} />);
  open(view);
  view.rerender(<OutlineEditor {...props} isLocked={(node) => node.id === "a"} />);
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  assert.equal(document.activeElement, title(view));
  assert.equal(ref.current!.getState().caret?.field, undefined);
  view.rerender(<OutlineEditor {...props} />);
  open(view);
  view.rerender(<OutlineEditor {...props} noteAdapter={undefined} />);
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
  assert.equal(document.activeElement, title(view));
});
test("note composition guards switching and commits canonical content", () => {
  const { view, ref } = setup({ noteKeyboardProfile: "toggle" });
  const input = open(view);
  fireEvent.compositionStart(input);
  change(input, "日本");
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true, isComposing: true, keyCode: 229 });
  assert.equal(document.activeElement, input);
  fireEvent.compositionEnd(input);
  assert.equal(ref.current!.getState().nodes[0]!.data!.note, "日本");
});
test("empty notes are editable, inherited locks block entry and malformed adapters expose no editor", () => {
  const { view, ref } = setup({
    defaultNodes: [{ id: "p", text: "Parent", children: nodes }],
    isLocked: (node) => node.id === "p",
  });
  assert.equal(
    (view.getByRole("button", { name: "Edit note for Beta" }) as HTMLButtonElement).disabled,
    true,
  );
  act(() => ref.current!.dispatch({ type: "focus", id: "b", field: "note" }));
  assert.equal(ref.current!.getState().refusal, "locked");
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Beta" }), null);
  view.unmount();
  const empty = setup();
  change(open(empty.view, "Beta"), "Created");
  assert.equal(empty.ref.current!.getState().nodes[1]!.data!.note, "Created");
  empty.view.unmount();
  const malformed = setup({
    noteAdapter: {
      ...adapter,
      read: () => {
        throw new Error("unavailable");
      },
    },
  });
  assert.equal(malformed.view.queryByRole("button", { name: /Edit note/ }), null);
});
test("changing adapter clamps active note offsets without changing data or history", () => {
  const ref = createRef<OutlineEditorHandle<Data>>();
  const props = { ref, nodes, readOnly: false, noteAdapter: adapter };
  const view = render(<OutlineEditor {...props} />);
  open(view);
  const before = ref.current!.getState();
  view.rerender(<OutlineEditor {...props} noteAdapter={{ ...adapter, read: () => "x" }} />);
  assert.equal(note(view).selectionStart, 1);
  assert.equal(ref.current!.getState().nodes, before.nodes);
  assert.equal(ref.current!.getState().history.past, before.history.past);
});
test("Return to title is an explicit nonmutating exit; read-only transition removes editor", () => {
  const ref = createRef<OutlineEditorHandle<Data>>();
  const props = { ref, nodes, readOnly: false, noteAdapter: adapter };
  const view = render(<OutlineEditor {...props} />);
  open(view);
  fireEvent.click(view.getByRole("button", { name: "Return to title" }));
  assert.equal(document.activeElement, title(view));
  assert.equal(ref.current!.getState().nodes, nodes);
  open(view);
  view.rerender(<OutlineEditor {...props} readOnly />);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(ref.current!.getState().caret?.field, undefined);
});
test("consumed note changes restore the controlled value and preserve history", () => {
  const { view, ref } = setup({
    plugins: [
      { id: "consume-note", beforeAction: (action) => (action.type === "note" ? null : action) },
    ],
  });
  change(open(view), "Consumed");
  assert.equal(note(view).value, "Long note");
  assert.equal(ref.current!.getState().history.past.length, 0);
});

test("title completions retain Shift+Enter priority over the optional note profile", async () => {
  const { view, ref } = setup({
    noteKeyboardProfile: "toggle",
    completionProviders: [
      {
        id: "title",
        complete: () => ({
          range: { start: 0, end: 5 },
          items: [{ id: "replacement", label: "Alpha extended" }],
        }),
      },
    ],
  });
  const input = title(view);
  focus(input);
  await act(async () => {
    fireEvent.keyDown(input, { key: " ", ctrlKey: true });
  });
  assert.ok(view.getByRole("listbox"));
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.equal(ref.current!.getState().nodes[0]!.text, "Alpha extended");
  assert.equal(ref.current!.getState().caret?.field, undefined);
  assert.equal(view.queryByRole("textbox", { name: /Edit note for/ }), null);
});
test("legacy title keymaps can consume Shift+Enter before the optional profile", () => {
  let called = 0;
  const { view, ref } = setup({
    noteKeyboardProfile: "toggle",
    plugins: [
      {
        id: "title-first",
        keymap: (event, context) => {
          if (event.key === "Enter" && event.shiftKey) {
            assert.equal(context.mode, "text");
            called++;
            return null;
          }
        },
      },
    ],
  });
  const input = title(view);
  focus(input);
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.equal(called, 1);
  assert.equal(document.activeElement, input);
  assert.equal(ref.current!.getState().caret?.field, undefined);
});
test("ancestor capture cancellation prevents title switching and note handlers/plugins", () => {
  let canceled = true,
    titleKeys = 0,
    noteKeys = 0;
  const ref = createRef<OutlineEditorHandle<Data>>();
  const view = render(
    <div
      onKeyDownCapture={(event) => {
        if (canceled) event.preventDefault();
      }}
    >
      <OutlineEditor
        ref={ref}
        defaultNodes={nodes}
        readOnly={false}
        noteAdapter={adapter}
        noteKeyboardProfile="toggle"
        plugins={[
          {
            id: "observe",
            keymap: () => {
              titleKeys++;
              return undefined;
            },
            noteKeymap: () => {
              noteKeys++;
              return undefined;
            },
          },
        ]}
      />
    </div>,
  );
  const input = title(view);
  focus(input);
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.equal(document.activeElement, input);
  assert.equal(titleKeys, 0);
  canceled = false;
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  const active = note(view);
  canceled = true;
  const before = ref.current!.getState();
  fireEvent.keyDown(active, { key: "Tab" });
  fireEvent.keyDown(active, { key: "Enter", shiftKey: true });
  fireEvent.keyDown(active, { key: "Escape" });
  assert.equal(ref.current!.getState(), before);
  assert.equal(noteKeys, 0);
  assert.equal(document.activeElement, active);
});

test("title pointer hover does not open information while a note owns focus", async () => {
  let requests = 0;
  const { view } = setup({
    hoverDelay: 0,
    hoverProviders: [
      {
        id: "title-info",
        hover: () => {
          requests++;
          return { range: { start: 0, end: 5 }, content: "Title information" };
        },
      },
    ],
  });
  const input = open(view);
  await act(async () => {
    fireEvent.pointerMove(title(view), { pointerType: "mouse", clientX: 1, clientY: 1 });
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.equal(requests, 0);
  assert.equal(document.activeElement, input);
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Alpha" }), null);
});
for (const reset of [false, true]) {
  test(`${reset ? "reset" : "host replacement"} interrupts note composition and rejects detached late input/end`, () => {
    const ref = createRef<OutlineEditorHandle<Data>>();
    const props = { ref, nodes, readOnly: false, noteAdapter: adapter };
    const view = render(<OutlineEditor {...props} />);
    const stale = open(view);
    fireEvent.compositionStart(stale);
    change(stale, "Partial composition");
    const replacement = reset
      ? nodes
      : [{ ...nodes[0]!, data: { note: "Authoritative" } }, nodes[1]!];
    view.rerender(
      <OutlineEditor {...props} nodes={replacement} resetKey={reset ? 1 : undefined} />,
    );
    const active = note(view);
    assert.notEqual(active, stale);
    assert.equal(document.activeElement, active);
    assert.equal(active.value, reset ? "Long note" : "Authoritative");
    change(stale, "Stale final composition");
    fireEvent.compositionEnd(stale);
    assert.equal(note(view).value, reset ? "Long note" : "Authoritative");
    assert.equal(ref.current!.getState().history.past.length, 0);
    fireEvent.compositionStart(active);
    change(active, "Fresh composition");
    fireEvent.compositionEnd(active);
    assert.equal(ref.current!.getState().nodes[0]!.data!.note, "Fresh composition");
  });
}
