import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { StrictMode, useLayoutEffect, useRef, useState } from "react";
import { renderToString } from "react-dom/server";
import { browserErrors } from "./components-dom.js";
import {
  createOutlineEditorState,
  reduceOutlineEditor,
  type OutlineEditorOptions,
  type OutlineEditorState,
} from "../src/core/index.js";
import {
  OutlinePlaceholderInput,
  type OutlinePlaceholderDraft,
} from "../src/react/OutlinePlaceholderInput.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});
const textbox = (view: ReturnType<typeof render>) =>
  view.getByRole("textbox", { name: "Add a thought" }) as HTMLTextAreaElement;
const input = (target: HTMLTextAreaElement, value: string, caret = value.length, extra = {}) =>
  fireEvent.input(target, {
    target: { value, selectionStart: caret, selectionEnd: caret },
    ...extra,
  });

// This focused harness exercises the real reducer contract, not editor integration.
function Harness({
  options = {},
  report,
}: {
  options?: OutlineEditorOptions;
  report: (state: OutlineEditorState) => void;
}) {
  const [state, setState] = useState(() => createOutlineEditorState([]));
  const model = useRef(state);
  const realInput = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (!state.caret) return;
    realInput.current?.focus();
    realInput.current?.setSelectionRange(state.caret.start, state.caret.end);
  }, [state]);
  report(state);
  return (
    <>
      {state.nodes.map((node) => (
        <textarea key={node.id} ref={realInput} aria-label="Real item" defaultValue={node.text} />
      ))}
      <OutlinePlaceholderInput
        label="Add a thought"
        onMaterialize={({ text, caret }) => {
          const previous = model.current;
          const next = reduceOutlineEditor(
            previous,
            { type: "insert", id: `item-${previous.nodes.length}`, text, caret },
            { readOnly: false, ...options },
          );
          model.current = next;
          setState(next);
          return next.nodes !== previous.nodes && !next.refusal;
        }}
      />
    </>
  );
}

test("empty prompt is accessible, has 44px minimum geometry, and does not materialize on focus", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => !!calls.push(value)}
    />,
  );
  const target = textbox(view);
  act(() => target.focus());
  fireEvent.blur(target);
  assert.equal(target.value, "");
  assert.equal(target.placeholder, "Add a thought");
  assert.equal(target.style.minBlockSize, "44px");
  assert.equal(target.style.minInlineSize, "44px");
  assert.deepEqual(calls, []);
  assert.match(
    renderToString(<OutlinePlaceholderInput label="New thought" onMaterialize={() => true} />),
    /aria-label="New thought"/,
  );
});

test("first genuine input makes one complete reducer insertion and caret/history transition", () => {
  let latest = createOutlineEditorState([]);
  const view = render(
    <StrictMode>
      <Harness report={(state) => (latest = state)} />
    </StrictMode>,
  );
  assert.equal(latest.nodes.length, 0);
  const target = textbox(view);
  act(() => target.focus());
  input(target, "A🙂B", 3);
  assert.deepEqual(latest.nodes, [{ id: "item-0", text: "A🙂B" }]);
  assert.deepEqual(latest.caret, { id: "item-0", start: 3, end: 3 });
  assert.equal(latest.history.past.length, 1);
  assert.equal(latest.revision, 1);
  assert.equal(document.activeElement, view.getByRole("textbox", { name: "Real item" }));
  assert.equal((document.activeElement as HTMLTextAreaElement).selectionStart, 3);
  // A late duplicate event cannot insert another real item from this session.
  input(target, "A🙂B", 3);
  fireEvent.compositionEnd(target, { data: "B" });
  assert.equal(latest.nodes.length, 1);
  assert.equal(textbox(view).value, "");
});

test("native paste remains one whole draft and does not bubble to document paste handling", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  let outerPastes = 0;
  const view = render(
    <div onPaste={() => outerPastes++}>
      <OutlinePlaceholderInput
        label="Add a thought"
        onMaterialize={(value) => !!calls.push(value)}
      />
    </div>,
  );
  const target = textbox(view);
  act(() => target.focus());
  assert.equal(
    fireEvent.paste(target, { clipboardData: { getData: () => "first\n  second" } }),
    true,
  );
  assert.equal(outerPastes, 0);
  assert.deepEqual(calls, []);
  // jsdom does not execute paste's default action; model its native input result.
  input(target, "first\n  second", 14, { inputType: "insertFromPaste" });
  assert.deepEqual(calls, [{ text: "first\n  second", caret: 14 }]);
});

test("composition remains mounted until end and duplicate final input does not insert twice", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => !!calls.push(value)}
    />,
  );
  const target = textbox(view);
  act(() => target.focus());
  fireEvent.compositionStart(target);
  input(target, "に", 1, { isComposing: true });
  input(target, "日本", 2, { isComposing: false });
  assert.deepEqual(calls, []);
  assert.equal(textbox(view), target);
  assert.equal(target.value, "日本");
  assert.equal(fireEvent.keyDown(target, { key: "Enter", isComposing: true }), true);
  assert.deepEqual(calls, []);
  fireEvent.compositionEnd(target, { data: "日本" });
  input(target, "日本", 2, { inputType: "insertFromComposition" });
  fireEvent.compositionEnd(target, { data: "日本" });
  assert.deepEqual(calls, [{ text: "日本", caret: 2 }]);
});

test("native composing flag also guards input without a prior compositionstart", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => !!calls.push(value)}
    />,
  );
  const target = textbox(view);
  input(target, "漢", 1, { isComposing: true });
  assert.deepEqual(calls, []);
  fireEvent.compositionEnd(target, { data: "漢" });
  assert.deepEqual(calls, [{ text: "漢", caret: 1 }]);
});

test("policy refusal retains full draft through blur, rerender, and explicit Enter retry", () => {
  let latest = createOutlineEditorState([]);
  const report = (state: OutlineEditorState) => (latest = state);
  const view = render(<Harness options={{ canChange: () => false }} report={report} />);
  const target = textbox(view);
  act(() => target.focus());
  input(target, "Keep all of this", 4);
  assert.equal(latest.nodes.length, 0);
  assert.equal(latest.history.past.length, 0);
  assert.notEqual(latest.refusal, null);
  assert.equal(target.value, "Keep all of this");
  assert.equal(target.selectionStart, 4);
  act(() => target.blur());
  view.rerender(<Harness options={{ canChange: () => true }} report={report} />);
  assert.equal(textbox(view), target);
  assert.equal(target.value, "Keep all of this");
  act(() => target.focus());
  assert.equal(fireEvent.keyDown(target, { key: "Enter" }), false);
  assert.deepEqual(latest.nodes, [{ id: "item-0", text: "Keep all of this" }]);
  assert.equal(latest.caret?.start, 4);
});

test("refused composition deduplicates trailing events but allows edited text and Enter retries", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => {
        calls.push(value);
        return false;
      }}
    />,
  );
  const target = textbox(view);
  act(() => target.focus());
  fireEvent.compositionStart(target);
  input(target, "中文", 2, { isComposing: true });
  fireEvent.compositionEnd(target, { data: "中文" });
  input(target, "中文", 2, { inputType: "insertFromComposition" });
  fireEvent.compositionEnd(target, { data: "中文" });
  assert.equal(calls.length, 1);
  assert.equal(target.value, "中文");
  fireEvent.keyDown(target, { key: "Enter" });
  assert.equal(calls.length, 2);
  input(target, "中文!", 3);
  assert.equal(calls.length, 3);
  input(target, "", 0);
  assert.equal(calls.length, 3);
  input(target, "中文!", 3);
  assert.equal(calls.length, 4);
});

test("persistent successful prompt is reusable after focus leaves and returns", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => !!calls.push(value)}
    />,
  );
  const target = textbox(view);
  act(() => target.focus());
  input(target, "one");
  input(target, "one");
  assert.equal(calls.length, 1);
  act(() => {
    target.blur();
    target.focus();
  });
  input(target, "two");
  assert.deepEqual(calls, [
    { text: "one", caret: 3 },
    { text: "two", caret: 3 },
  ]);
});

test("empty Enter preserves activation, IME confirmation does not activate, and canceled composition is empty", () => {
  let activations = 0;
  let insertions = 0;
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onActivate={() => {
        activations++;
        return true;
      }}
      onMaterialize={() => {
        insertions++;
        return true;
      }}
    />,
  );
  const target = textbox(view);
  fireEvent.keyDown(target, { key: "Enter", keyCode: 229 });
  fireEvent.keyDown(target, { key: "Enter", isComposing: true });
  fireEvent.compositionStart(target);
  fireEvent.keyDown(target, { key: "Enter" });
  fireEvent.compositionEnd(target, { data: "" });
  assert.equal(activations, 0);
  assert.equal(insertions, 0);
  assert.equal(fireEvent.keyDown(target, { key: "Enter", shiftKey: true }), true);
  assert.equal(fireEvent.keyDown(target, { key: "Enter" }), false);
  assert.equal(activations, 1);
  assert.equal(insertions, 0);
});

test("disabled prompt neither activates nor materializes", () => {
  let calls = 0;
  const view = render(
    <OutlinePlaceholderInput
      disabled
      label="Add a thought"
      onActivate={() => {
        calls++;
        return true;
      }}
      onMaterialize={() => !!++calls}
    />,
  );
  const target = textbox(view);
  assert.equal(target.disabled, true);
  input(target, "blocked");
  fireEvent.keyDown(target, { key: "Enter" });
  fireEvent.compositionEnd(target, { data: "blocked" });
  assert.equal(calls, 0);
});

test("editing a refused draft replaces the selected range without losing either surrounding text", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  let allow = false;
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => {
        calls.push(value);
        return allow;
      }}
    />,
  );
  const target = textbox(view);
  input(target, "left OLD right", 8);
  act(() => target.setSelectionRange(5, 8));
  fireEvent.paste(target, { clipboardData: { getData: () => "new\ntext" } });
  allow = true;
  input(target, "left new\ntext right", 13, { inputType: "insertFromPaste" });
  assert.deepEqual(calls, [
    { text: "left OLD right", caret: 8 },
    { text: "left new\ntext right", caret: 13 },
  ]);
});

test("discarded preedit and empty input create nothing; whitespace is genuine user text", () => {
  const calls: OutlinePlaceholderDraft[] = [];
  const view = render(
    <OutlinePlaceholderInput
      label="Add a thought"
      onMaterialize={(value) => !!calls.push(value)}
    />,
  );
  const target = textbox(view);
  fireEvent.compositionStart(target);
  input(target, "未確定", 3, { isComposing: true });
  input(target, "", 0, { isComposing: true });
  fireEvent.compositionEnd(target, { data: "" });
  input(target, "", 0);
  assert.deepEqual(calls, []);
  assert.equal(target.value, "");
  input(target, " ", 1);
  assert.deepEqual(calls, [{ text: " ", caret: 1 }]);
});
