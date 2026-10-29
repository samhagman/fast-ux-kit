import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef } from "react";
import { browserErrors, dom } from "./components-dom.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";
import type { OutlineNode, OutlineNoteAdapter } from "../src/core/index.js";
const { cleanup, fireEvent, render, act } = await import("@testing-library/react");
const { OutlineEditor } = await import("../src/react/OutlineEditor.js");
Object.defineProperty(globalThis, "DOMRect", { value: dom.window.DOMRect, configurable: true });
const nodes = [
  { id: "a", text: "Alpha", children: [{ id: "b", text: "Beta" }] },
  { id: "c", text: "Gamma" },
];
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});
const focus = (element: HTMLElement) => act(() => element.focus());

test("browse mode starts without inputs; row fold and bullet focus create no revision", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} interactionMode="browse" />,
  );
  assert.equal(view.queryByRole("textbox"), null);
  fireEvent.click(view.getByRole("button", { name: "Collapse Alpha" }));
  assert.equal(view.queryByText("Beta"), null);
  fireEvent.click(view.getByRole("button", { name: "Focus on Alpha" }));
  assert.equal(view.queryByText("Gamma"), null);
  assert.equal(ref.current!.getState().revision, 0);
  assert.equal(ref.current!.getState().history.past.length, 0);
});

test("explicit edit, canonical text, Escape and Done preserve history and restore reader focus", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} interactionMode="browse" />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  assert.equal(document.activeElement, input);
  fireEvent.change(input, { target: { value: "Changed" } });
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "a");
  assert.equal(ref.current!.getState().nodes[0]!.text, "Changed");
  assert.equal(ref.current!.getState().history.past.length, 1);
  fireEvent.keyDown(document.activeElement!, { key: "F2" });
  assert.ok(view.getByRole("textbox", { name: "Edit Changed" }));
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Alpha" }));
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(ref.current!.getState().history.future.length, 1);
});

test("Edit uses focused reader row, and read-only/inherited locks never activate authoring", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      isLocked={(node) => node.id === "a"}
    />,
  );
  const reader = view.getByRole("region", { name: "Outline editor" });
  focus(reader);
  fireEvent.keyDown(reader, { key: "ArrowDown" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "b");
  fireEvent.keyDown(document.activeElement!, { key: "F2" });
  assert.equal(view.queryByRole("textbox"), null);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(document.activeElement, view.getByRole("textbox", { name: "Edit Gamma" }));
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly interactionMode="browse" />);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: "Edit outline" }), null);
  view.rerender(<OutlineEditor defaultNodes={nodes} readOnly={false} interactionMode="browse" />);
  assert.equal(
    view.queryByRole("textbox"),
    null,
    "permission restoration does not reopen old editing",
  );
});

test("consumed focus and owned Escape keep plugin priority", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      plugins={[
        { id: "deny-focus", beforeAction: (action) => (action.type === "focus" ? null : action) },
      ]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(view.queryByRole("textbox"), null);
  view.rerender(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      plugins={[{ id: "keys", keymap: (event) => (event.key === "Escape" ? null : undefined) }]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  fireEvent.keyDown(input, { key: "Escape" });
  assert.ok(view.getByRole("textbox", { name: "Edit Alpha" }));
});

test("composition Escape and Done do not tear down a native title composition", () => {
  const view = render(
    <OutlineEditor defaultNodes={nodes} readOnly={false} interactionMode="browse" />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  fireEvent.compositionStart(input);
  fireEvent.keyDown(input, { key: "Escape", isComposing: true });
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Alpha" }));
  fireEvent.compositionEnd(input);
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  assert.equal(view.queryByRole("textbox"), null);
});

test("external replacement ends browse editing, controlled acknowledgement does not", () => {
  let emitted: readonly OutlineNode[] = nodes;
  const view = render(
    <OutlineEditor
      nodes={nodes}
      readOnly={false}
      interactionMode="browse"
      onNodesChange={(value) => {
        emitted = value;
      }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  fireEvent.change(view.getByRole("textbox", { name: "Edit Alpha" }), {
    target: { value: "Changed" },
  });
  view.rerender(<OutlineEditor nodes={emitted} readOnly={false} interactionMode="browse" />);
  assert.ok(view.getByRole("textbox", { name: "Edit Changed" }));
  view.rerender(
    <OutlineEditor
      nodes={[{ id: "new", text: "Replacement" }]}
      readOnly={false}
      interactionMode="browse"
    />,
  );
  assert.equal(view.queryByRole("textbox"), null);
  assert.ok(view.getByText("Replacement"));
});

test("note Escape retains canonical content and reader preview without a save fiction", () => {
  const adapter: OutlineNoteAdapter<{ note: string }> = {
    read: (node) => node.data?.note,
    prepareData: (_, note) => ({ ok: true, data: { note } }),
  };
  const ref = createRef<OutlineEditorHandle<{ note: string }>>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={[{ id: "a", text: "Journal", data: { note: "Original" } }]}
      readOnly={false}
      interactionMode="browse"
      noteAdapter={adapter}
      noteKeyboardProfile="toggle"
    />,
  );
  assert.ok(view.getByText("Original"));
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  fireEvent.keyDown(view.getByRole("textbox", { name: "Edit Journal" }), {
    key: "Enter",
    shiftKey: true,
  });
  const input = view.getByRole("textbox", { name: "Edit note for Journal" });
  fireEvent.change(input, { target: { value: "Retained" } });
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(view.queryByRole("textbox"), null);
  assert.ok(view.getByText("Retained"));
  assert.equal(ref.current!.getState().nodes[0]!.data!.note, "Retained");
});

test("embedded controls keep Escape and editing refuses canonical policy normally", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      canChange={() => false}
      renderBody={() => <input aria-label="Independent" />}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const independent = view.getAllByRole("textbox", { name: "Independent" })[0]!;
  fireEvent.keyDown(independent, { key: "Escape" });
  assert.ok(view.getByRole("button", { name: "Done" }));
  fireEvent.change(view.getByRole("textbox", { name: "Edit Alpha" }), {
    target: { value: "Refused" },
  });
  assert.equal(ref.current!.getState().nodes[0]!.text, "Alpha");
  assert.equal(ref.current!.getState().revision, 0);
});

test("authoritative replacement invalidates late title composition and restores a surviving reader row", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} nodes={nodes} readOnly={false} interactionMode="browse" />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const oldInput = view.getByRole("textbox", { name: "Edit Alpha" });
  fireEvent.compositionStart(oldInput);
  view.rerender(
    <OutlineEditor
      ref={ref}
      nodes={[{ id: "a", text: "Replacement" }]}
      readOnly={false}
      interactionMode="browse"
    />,
  );
  fireEvent.compositionEnd(oldInput, { data: "stale" });
  assert.equal(ref.current!.getState().nodes[0]!.text, "Replacement");
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "a");
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(document.activeElement, view.getByRole("textbox", { name: "Edit Replacement" }));
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  assert.equal(view.queryByRole("textbox"), null);
});

test("a plugin that replaces focus with another action does not open a browse session", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      plugins={[
        {
          id: "replace-focus",
          beforeAction: (action) =>
            action.type === "focus" ? { type: "select", id: action.id } : action,
        },
      ]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(view.queryByRole("textbox"), null);
});

test("deliberate blur is not stolen back by later authoritative replacement", () => {
  const view = render(<OutlineEditor nodes={nodes} readOnly={false} interactionMode="browse" />);
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const input = view.getByRole("textbox", { name: "Edit Alpha" });
  act(() => input.blur());
  view.rerender(
    <OutlineEditor
      nodes={[{ id: "a", text: "Replacement" }]}
      readOnly={false}
      interactionMode="browse"
    />,
  );
  assert.equal(document.activeElement, document.body);
});

test("browse editing keeps navigation on the bullet and fold action in the session bar", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={[
        { id: "a", text: "Task parent", checked: false, children: [{ id: "b", text: "Child" }] },
      ]}
      readOnly={false}
      interactionMode="browse"
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(view.container.querySelector(".fast-ux-editor__focus"), null);
  assert.equal(view.container.querySelector(".fast-ux-outliner__toggle"), null);
  assert.ok(
    view
      .getByRole("button", { name: "Focus on Task parent" })
      .classList.contains("fast-ux-editor__bullet"),
  );
  fireEvent.click(view.getByRole("button", { name: "Collapse active row" }));
  assert.equal(view.queryByRole("textbox", { name: "Edit Child" }), null);
  assert.ok(view.getByRole("button", { name: "Expand active row" }));
});

test("empty browse editor opens insertion without a document change and returns focus to reader", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={[]}
      readOnly={false}
      interactionMode="browse"
      createId={() => "new"}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(document.activeElement, view.getByRole("button", { name: "Add item" }));
  assert.equal(ref.current!.getState().revision, 0);
  fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  assert.equal(document.activeElement, view.getByRole("region", { name: "Outline editor" }));
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  fireEvent.click(view.getByRole("button", { name: "Add item" }));
  assert.equal(ref.current!.getState().nodes.length, 1);
  assert.equal(ref.current!.getState().history.past.length, 1);
});

test("all-locked outlines retain root insertion while existing rows remain protected", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor
      ref={ref}
      defaultNodes={[{ id: "locked", text: "Protected" }]}
      readOnly={false}
      interactionMode="browse"
      isLocked={(node) => node.id === "locked"}
      createId={() => "new"}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(
    (view.getByRole("textbox", { name: "Edit Protected" }) as HTMLTextAreaElement).readOnly,
    true,
  );
  fireEvent.click(view.getByRole("button", { name: "Add item" }));
  assert.equal(ref.current!.getState().nodes.length, 2);
  assert.equal(ref.current!.getState().nodes[0]!.text, "Protected");
});

test("Done returns to the owning row rather than a nested reader with a colliding ID", async () => {
  const { Outliner } = await import("../src/react/Outliner.js");
  const view = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      interactionMode="browse"
      renderBody={(node) =>
        node.id === "a" ? (
          <Outliner nodes={[{ id: "c", text: "Nested Gamma" }]} aria-label="Nested reader" />
        ) : null
      }
    />,
  );
  const outerReader = view.getByRole("region", { name: "Outline editor" });
  const outerRow = [...outerReader.querySelectorAll<HTMLElement>("[data-node-id]")].find(
    (row) => row.dataset.nodeId === "c" && row.closest(".fast-ux-outliner") === outerReader,
  )!;
  focus(outerRow);
  fireEvent.keyDown(outerRow, { key: "F2" });
  assert.equal(document.activeElement, view.getByRole("textbox", { name: "Edit Gamma" }));
  fireEvent.click(view.getByRole("button", { name: "Done" }));
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "c");
  assert.equal(
    document.activeElement!.closest(".fast-ux-outliner"),
    view.getByRole("region", { name: "Outline editor" }),
  );
});

test("Escape on owned session controls returns to reading", () => {
  const view = render(
    <OutlineEditor defaultNodes={nodes} readOnly={false} interactionMode="browse" />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const done = view.getByRole("button", { name: "Done" });
  focus(done);
  fireEvent.keyDown(done, { key: "Escape" });
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal((document.activeElement as HTMLElement).dataset.nodeId, "a");
});

test("browse scroll offsets stay off embedded direct editor inputs", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/react/editor.css", import.meta.url), "utf8");
  const view = render(
    <OutlineEditor
      defaultNodes={[{ id: "outer", text: "Outer" }]}
      readOnly={false}
      interactionMode="browse"
      renderBody={() => (
        <OutlineEditor
          defaultNodes={[{ id: "inner", text: "Inner" }]}
          readOnly={false}
          aria-label="Inner editor"
        />
      )}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  assert.equal(
    view.getByRole("textbox", { name: "Edit Outer" }).hasAttribute("data-browse-input"),
    true,
  );
  assert.equal(
    view.getByRole("textbox", { name: "Edit Inner" }).hasAttribute("data-browse-input"),
    false,
  );
  assert.match(css, /\.fast-ux-editor__input\[data-browse-input\]\s*\{/);
  assert.doesNotMatch(css, /:has\(\.fast-ux-editor__edit-actions\)/);
});

test("insertion-only entry focuses its own Add control rather than an embedded editor", () => {
  const view = render(
    <OutlineEditor
      defaultNodes={[{ id: "locked", text: "Protected" }]}
      readOnly={false}
      interactionMode="browse"
      isLocked={() => true}
      renderBody={() => (
        <OutlineEditor defaultNodes={[]} readOnly={false} aria-label="Nested insertion" />
      )}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit outline" }));
  const reader = view.getByRole("region", { name: "Outline editor" });
  assert.equal(document.activeElement!.closest(".fast-ux-editor"), reader);
  assert.ok(document.activeElement!.classList.contains("fast-ux-editor__add"));
});
