import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef } from "react";
import { dom, browserErrors } from "./components-dom.js";
import {
  createOutlineEditorState,
  reduceOutlineEditor,
  editorVisibleRows,
  type OutlineNode,
  type OutlineAction,
} from "../src/core/index.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
const documentNodes: readonly OutlineNode[] = [
  { id: "branch", text: "Branch", children: [{ id: "protected", text: "Protected note" }] },
  { id: "target", text: "Target" },
  { id: "outside", text: "Outside" },
];
const editing = { readOnly: false };
const locked = { ...editing, isLocked: (node: OutlineNode) => node.id === "protected" };
for (const operation of ["undo", "redo", "replace"] as const) {
  test(`${operation} cannot relocate an ancestor carrying a newly protected descendant`, () => {
    const initial = createOutlineEditorState(documentNodes);
    const moved = reduceOutlineEditor(
      initial,
      { type: "drop", ids: ["branch"], parentId: "target", index: 0 },
      editing,
    );
    assert.notStrictEqual(moved.nodes, initial.nodes);
    const before =
      operation === "undo"
        ? moved
        : operation === "redo"
          ? reduceOutlineEditor(moved, { type: "undo" }, editing)
          : initial;
    const action: OutlineAction =
      operation === "replace" ? { type: "replace", nodes: moved.nodes } : { type: operation };
    const result = reduceOutlineEditor(before, action, locked);
    assert.equal(result.refusal, "locked");
    assert.strictEqual(result.nodes, before.nodes);
    assert.strictEqual(result.history, before.history);
    assert.equal(result.revision, before.revision);
  });
}

test("whole-transition veto observes one complete transaction and leaves content/history/selection atomic", () => {
  let initial = createOutlineEditorState(documentNodes);
  initial = reduceOutlineEditor(initial, { type: "select", id: "branch" }, editing);
  const observations: {
    before: readonly OutlineNode[];
    after: readonly OutlineNode[];
    type: string;
  }[] = [];
  const result = reduceOutlineEditor(
    initial,
    {
      type: "transaction",
      commands: [
        { type: "update", id: "outside", changes: { text: "Changed outside" } },
        { type: "move", id: "branch", parentId: "target", index: 0 },
      ],
    },
    {
      ...editing,
      canChange: (before, after, action) => {
        observations.push({ before, after, type: action.type });
        return false;
      },
    },
  );
  assert.equal(observations.length, 1);
  assert.strictEqual(observations[0]!.before, initial.nodes);
  assert.equal(observations[0]!.type, "transaction");
  assert.equal(observations[0]!.after[0]!.children?.[0]?.id, "branch");
  assert.equal(observations[0]!.after[1]!.text, "Changed outside");
  assert.strictEqual(result.nodes, initial.nodes);
  assert.strictEqual(result.history, initial.history);
  assert.strictEqual(result.selection, initial.selection);
  assert.equal(result.revision, initial.revision);
  assert.equal(result.refusal, "locked");
});

test("a late protected descendant refusal rolls back earlier commands and emits no host proposal", () => {
  const ref = createRef<OutlineEditorHandle>();
  const proposals: unknown[] = [];
  render(
    <OutlineEditor
      ref={ref}
      defaultNodes={documentNodes}
      {...locked}
      onNodesChange={(nodes) => proposals.push(nodes)}
    />,
  );
  const before = ref.current!.getState();
  act(() =>
    ref.current!.dispatch({
      type: "transaction",
      commands: [
        { type: "update", id: "outside", changes: { text: "Tentative" } },
        { type: "move", id: "branch", parentId: "target", index: 0 },
      ],
    }),
  );
  const after = ref.current!.getState();
  assert.strictEqual(after.nodes, before.nodes);
  assert.strictEqual(after.history, before.history);
  assert.equal(after.refusal, "locked");
  assert.equal(proposals.length, 0);
});

function input(view: ReturnType<typeof render>, title: string) {
  return view.getByRole("textbox", { name: `Edit ${title}` }) as HTMLTextAreaElement;
}
function focusAt(element: HTMLTextAreaElement, offset: number) {
  act(() => {
    element.focus();
    element.setSelectionRange(offset, offset);
  });
}

test("authoritative host replacement during a typing burst clears undo/redo and clamps surviving caret", () => {
  const ref = createRef<OutlineEditorHandle>();
  const proposals: (readonly OutlineNode[])[] = [];
  const config = {
    ref,
    readOnly: false,
    onNodesChange: (nodes: readonly OutlineNode[]) => proposals.push(nodes),
  };
  const view = render(<OutlineEditor {...config} nodes={documentNodes} />);
  const field = input(view, "Protected note");
  focusAt(field, 14);
  fireEvent.change(field, {
    target: { value: "Locally changed protected note", selectionStart: 29, selectionEnd: 29 },
  });
  const proposed = proposals.at(-1)!;
  assert.equal(ref.current!.getState().history.past.length, 1);
  // An exact echo acknowledges optimistic content without clearing its history.
  view.rerender(<OutlineEditor {...config} nodes={proposed} />);
  assert.equal(ref.current!.getState().history.past.length, 1);
  const host: readonly OutlineNode[] = [
    { id: "branch", text: "Server branch", children: [{ id: "protected", text: "Hi" }] },
  ];
  view.rerender(<OutlineEditor {...config} nodes={host} />);
  assert.strictEqual(ref.current!.getState().nodes, host);
  assert.equal(ref.current!.getState().history.past.length, 0);
  assert.equal(ref.current!.getState().history.future.length, 0);
  assert.deepEqual(ref.current!.getState().caret, { id: "protected", start: 2, end: 2 });
  act(() => {
    ref.current!.dispatch({ type: "undo" });
    ref.current!.dispatch({ type: "redo" });
  });
  assert.strictEqual(ref.current!.getState().nodes, host);
  assert.equal(
    proposals.length,
    1,
    "host reconciliation/history no-op must not emit persistence proposals",
  );
  assert.equal(input(view, "Hi").value, "Hi");
});

test("reader mode retains authoring history and current folds without exposing edit commands", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(<OutlineEditor ref={ref} defaultNodes={documentNodes} readOnly={false} />);
  const field = input(view, "Protected note");
  focusAt(field, 14);
  fireEvent.change(field, {
    target: { value: "Edited note", selectionStart: 11, selectionEnd: 11 },
  });
  const edited = ref.current!.getState().nodes;
  view.rerender(<OutlineEditor ref={ref} defaultNodes={documentNodes} readOnly />);
  assert.equal(view.queryAllByRole("textbox").length, 0);
  act(() => ref.current!.dispatch({ type: "toggle", id: "branch" }));
  assert.equal(ref.current!.getState().expandedIds.has("branch"), false);
  act(() => ref.current!.dispatch({ type: "undo" }));
  assert.strictEqual(ref.current!.getState().nodes, edited);
  assert.equal(ref.current!.getState().refusal, "read-only");
  view.rerender(<OutlineEditor ref={ref} defaultNodes={documentNodes} readOnly={false} />);
  act(() => ref.current!.dispatch({ type: "undo" }));
  const undone = ref.current!.getState();
  assert.strictEqual(undone.nodes, documentNodes);
  assert.equal(
    undone.expandedIds.has("branch"),
    false,
    "history does not resurrect an obsolete fold state",
  );
  assert.equal(undone.caret?.id, "branch", "caret repairs to the visible parent");
  assert.equal(view.queryByRole("textbox", { name: "Edit Protected note" }), null);
});

test("rich-body form controls keep keyboard and clipboard ownership even while a row is selected", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={documentNodes}
      readOnly={false}
      renderBody={(node) =>
        node.id === "branch" ? (
          <div>
            <input aria-label="Embedded query" defaultValue="Native text" />
            <div
              role="textbox"
              aria-label="Embedded rich editor"
              contentEditable
              suppressContentEditableWarning
            >
              Rich text
            </div>
            <select aria-label="Embedded choice">
              <option>One</option>
              <option>Two</option>
            </select>
          </div>
        ) : null
      }
    />,
  );
  act(() => ref.current!.dispatch({ type: "select", id: "branch" }));
  const before = ref.current!.getState();
  const fields = [
    view.getByRole("textbox", { name: "Embedded query" }),
    view.getByRole("textbox", { name: "Embedded rich editor" }),
    view.getByRole("combobox", { name: "Embedded choice" }),
  ];
  for (const field of fields) {
    act(() => (field as HTMLElement).focus());
    for (const options of [
      { key: "Enter" },
      { key: "Backspace" },
      { key: "Delete" },
      { key: "z", ctrlKey: true },
      { key: "a", ctrlKey: true },
      { key: "ArrowDown", shiftKey: true },
      { key: "Tab" },
    ])
      assert.equal(
        fireEvent.keyDown(field, options),
        true,
        `${field.getAttribute("aria-label")} owns ${options.key}`,
      );
    const clipboard = {
      getData: () => "Pasted\nChild",
      setData: () => {
        throw new Error("editor must not write nested-control clipboard");
      },
    };
    assert.equal(fireEvent.paste(field, { clipboardData: clipboard }), true);
    assert.equal(fireEvent.copy(field, { clipboardData: clipboard }), true);
    assert.equal(fireEvent.cut(field, { clipboardData: clipboard }), true);
  }
  assert.strictEqual(ref.current!.getState().nodes, before.nodes);
  assert.strictEqual(ref.current!.getState().history, before.history);
  assert.deepEqual([...ref.current!.getState().selection], ["branch"]);
});

test("hoisted selection stays visible after fold, history travel and an explicit reveal exits scope", () => {
  let state = createOutlineEditorState(documentNodes);
  state = reduceOutlineEditor(state, { type: "hoist", id: "branch" }, editing);
  state = reduceOutlineEditor(state, { type: "select-all" }, editing);
  assert.deepEqual([...state.selection], ["branch", "protected"]);
  state = reduceOutlineEditor(
    state,
    { type: "text", id: "protected", text: "Changed child" },
    editing,
  );
  state = reduceOutlineEditor(state, { type: "expand", ids: ["branch"], expanded: false }, editing);
  state = reduceOutlineEditor(state, { type: "undo" }, editing);
  const visible = new Set(editorVisibleRows(state).map((row) => row.id));
  assert.equal(state.hoistedId, "branch");
  assert.equal(visible.has(state.caret!.id), true);
  for (const id of state.selection) assert.equal(visible.has(id), true);
  const focused = reduceOutlineEditor(state, { type: "focus", id: "outside" }, editing);
  assert.equal(focused.hoistedId, "branch");
  assert.equal(focused.caret?.id, state.caret?.id);
  const revealed = reduceOutlineEditor(state, { type: "reveal", id: "outside" }, editing);
  assert.equal(revealed.hoistedId, null);
  assert.equal(revealed.caret?.id, "outside");
});

test("history and replacement cannot reorder a protected descendant's ancestor among root siblings", () => {
  const initial = createOutlineEditorState(documentNodes);
  const moved = reduceOutlineEditor(
    initial,
    { type: "drop", ids: ["branch"], parentId: null, index: 2 },
    editing,
  );
  assert.deepEqual(
    moved.nodes.map((node) => node.id),
    ["target", "outside", "branch"],
  );
  for (const [before, action] of [
    [moved, { type: "undo" }],
    [initial, { type: "replace", nodes: moved.nodes }],
  ] as const) {
    const result = reduceOutlineEditor(before, action, locked);
    assert.equal(result.refusal, "locked", action.type);
    assert.strictEqual(result.nodes, before.nodes);
  }
});

test("changing host lock policy before toolbar undo refuses the protected ancestor move without emitting data", () => {
  const ref = createRef<OutlineEditorHandle>();
  const proposals: (readonly OutlineNode[])[] = [];
  const onNodesChange = (nodes: readonly OutlineNode[]) => proposals.push(nodes);
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={documentNodes}
      readOnly={false}
      onNodesChange={onNodesChange}
    />,
  );
  act(() => ref.current!.dispatch({ type: "drop", ids: ["branch"], parentId: "target", index: 0 }));
  assert.equal(proposals.length, 1);
  const moved = ref.current!.getState().nodes;
  view.rerender(
    <OutlineEditor
      ref={ref}
      defaultNodes={documentNodes}
      {...locked}
      onNodesChange={onNodesChange}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(ref.current!.getState().refusal, "locked");
  assert.strictEqual(ref.current!.getState().nodes, moved);
  assert.equal(proposals.length, 1);
});

test("protection does not freeze an unlocked ancestor title when descendant identity and placement stay intact", () => {
  const initial = createOutlineEditorState(documentNodes);
  const renamed = reduceOutlineEditor(
    initial,
    { type: "text", id: "branch", text: "Renamed branch" },
    locked,
  );
  assert.equal(renamed.refusal, null);
  assert.equal(renamed.nodes[0]!.text, "Renamed branch");
  assert.strictEqual(renamed.nodes[0]!.children![0], documentNodes[0]!.children![0]);
  const undone = reduceOutlineEditor(renamed, { type: "undo" }, locked);
  assert.equal(undone.refusal, null);
  assert.strictEqual(undone.nodes, initial.nodes);
  const redone = reduceOutlineEditor(undone, { type: "redo" }, locked);
  assert.equal(redone.refusal, null);
  assert.strictEqual(redone.nodes, renamed.nodes);
  const replaced = reduceOutlineEditor(initial, { type: "replace", nodes: renamed.nodes }, locked);
  assert.equal(replaced.refusal, null);
  assert.strictEqual(replaced.nodes, renamed.nodes);
});
