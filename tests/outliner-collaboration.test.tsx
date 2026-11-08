import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useOutliner } from "../src/outliner/use-outliner.js";
import { FieldSession } from "../src/outliner/live-field/field-session.js";
afterEach(cleanup);

test("external undo works without native history and respects veto/read-only/availability", () => {
  const calls: string[] = [];
  const binding = {
    canUndo: true,
    canRedo: true,
    undo: () => calls.push("undo"),
    redo: () => calls.push("redo"),
  };
  const value = [{ id: "a", text: "Hello" }];
  let readOnly = false;
  let veto = false;
  const hook = renderHook(() =>
    useOutliner({
      value,
      collaboration: binding,
      readOnly,
      onBeforeHistoryTravel: () => (veto ? false : undefined),
    }),
  );
  assert.equal(hook.result.current.canUndo, true);
  act(() => {
    hook.result.current.dispatch({ type: "undo" });
    hook.result.current.dispatch({ type: "redo" });
  });
  assert.deepEqual(calls, ["undo", "redo"]);
  veto = true;
  hook.rerender();
  act(() => {
    hook.result.current.dispatch({ type: "undo" });
  });
  readOnly = true;
  veto = false;
  hook.rerender();
  act(() => {
    hook.result.current.dispatch({ type: "undo" });
  });
  readOnly = false;
  binding.canUndo = false;
  hook.rerender();
  act(() => {
    hook.result.current.dispatch({ type: "undo" });
  });
  assert.deepEqual(calls, ["undo", "redo"]);
});

test("field events read the latest binding without document mutations", () => {
  const events: string[] = [];
  const binding = {
    canUndo: false,
    canRedo: false,
    undo() {},
    redo() {},
    onFieldEvent: () => events.push("old"),
  };
  const value = [{ id: "a", text: "" }];
  const hook = renderHook(() => useOutliner({ value, collaboration: binding }));
  const report = hook.result.current.reportField;
  binding.onFieldEvent = () => events.push("new");
  hook.rerender();
  report({ kind: "composition-start", itemId: "a", field: "title", text: "", anchor: 0, head: 0 });
  assert.deepEqual(events, ["new"]);
  assert.equal(hook.result.current.latestNodes(), value);
});

test("external history advances the field revision even when its text was an earlier typing draft", () => {
  let value = [{ id: "a", text: "" }];
  const binding = {
    canUndo: true,
    canRedo: true,
    undo: () => {
      value = [{ id: "a", text: "1" }];
    },
    redo: () => {
      value = [{ id: "a", text: "12" }];
    },
  };
  const hook = renderHook(() =>
    useOutliner({
      value,
      collaboration: binding,
      trackEdits: false,
      onValueChange: (next) => {
        value = [...next];
      },
    }),
  );
  const field = new FieldSession({ field: "title" }, "a", "", {
    dispatch: (action) => hook.result.current.dispatch(action),
    currentSeq: () => hook.result.current.currentSeq(),
    text: (id) => hook.result.current.latestNodes().find((node) => node.id === id)?.text,
    row: () => ({ parentId: null }),
    neighbour: () => null,
  });
  // The field has already painted two keys, while its rendered-prop adoption is
  // still pending. An older echo must not overwrite the newer local draft.
  for (const char of "12") {
    act(() => {
      field.apply(field.state.tr.insertText(char));
    });
    hook.rerender();
  }
  const typedRevision = hook.result.current.renderedSeq;
  assert.equal(field.onRender("1", typedRevision - 1), "kept");
  assert.equal(field.source, "12");
  act(() => {
    hook.result.current.dispatch({ type: "undo" });
  });
  hook.rerender();
  assert.equal(hook.result.current.state.nodes[0]?.text, "1");
  assert.ok(hook.result.current.renderedSeq > typedRevision);
  assert.equal(field.onRender("1", hook.result.current.renderedSeq), "adopted");
  assert.equal(field.source, "1", "undo must paint, not be mistaken for an old echo");
  const undoRevision = hook.result.current.renderedSeq;
  hook.rerender();
  assert.equal(hook.result.current.renderedSeq, undoRevision, "unchanged props do not tick");
  act(() => {
    hook.result.current.dispatch({ type: "redo" });
  });
  hook.rerender();
  assert.equal(field.onRender("12", hook.result.current.renderedSeq), "adopted");
  act(() => {
    field.apply(field.state.tr.insertText("X"));
  });
  hook.rerender();
  assert.equal(field.source, "12X");
  assert.equal(hook.result.current.state.nodes[0]?.text, "12X");
});
