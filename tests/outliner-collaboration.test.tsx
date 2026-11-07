import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useOutliner } from "../src/outliner/use-outliner.js";
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
