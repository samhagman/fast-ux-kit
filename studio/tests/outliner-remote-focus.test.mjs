import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { domEnv, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

before(domEnv);
after(stopVite);
const collaboration = {
  canUndo: false,
  canRedo: false,
  undo() {},
  redo() {},
};
const settle = async (ui) => {
  for (let i = 0; i < 3; i++) await ui.frames();
};

test("remote deletion of the last edited row returns focus to the empty outline", async () => {
  const props = { value: [{ id: "last", text: "Last row" }], collaboration };
  const ui = await mountOutliner(props);
  await ui.edit("last");
  assert.ok(ui.field());
  await ui.rerender({ ...props, value: [] });
  await waitFor(() => !ui.row("last"));
  await settle(ui);
  assert.equal(ui.ol().state.caret, null);
  assert.equal(ui.ui().editing, false, "no phantom Editing state without a field");
  assert.ok(document.activeElement === ui.tree(), "keyboard focus remains in the empty outline");
  await ui.unmount();
});

test("a host-cleared caret exits editing and releases an outgoing animated field", async () => {
  const props = {
    value: [
      { id: "a", text: "Alpha" },
      { id: "b", text: "Beta" },
    ],
    collaboration: { ...collaboration, mapCaret: () => null },
  };
  const ui = await mountOutliner(props);
  await ui.edit("a");
  await ui.rerender({ ...props, value: [{ id: "b", text: "Beta" }] });
  await waitFor(() => !ui.row("a"));
  await settle(ui);
  assert.equal(ui.ui().editing, false);
  assert.ok(
    document.activeElement === ui.tree(),
    "focus must not drop to body after exit animation",
  );
  await ui.unmount();
});

test("remote deletion does not steal focus from an outside control during blur", async () => {
  const props = { value: [{ id: "last", text: "Last row" }], collaboration };
  const ui = await mountOutliner(props);
  await ui.edit("last");
  const outside = document.createElement("input");
  document.body.append(outside);
  // No frame in between: the remote render can race the deferred blur handler.
  outside.focus();
  await ui.rerender({ ...props, value: [] });
  await waitFor(() => !ui.row("last"));
  await settle(ui);
  assert.equal(ui.ui().editing, false);
  assert.ok(document.activeElement === outside, "an outside input keeps focus");
  outside.remove();
  await ui.unmount();
});

test("a remote surviving ancestor keeps its field rather than entering row mode", async () => {
  const props = {
    value: [{ id: "parent", text: "Parent", children: [{ id: "child", text: "Child" }] }],
    collaboration,
  };
  const ui = await mountOutliner(props);
  await ui.edit("child");
  await ui.rerender({ ...props, value: [{ id: "parent", text: "Parent" }] });
  await waitFor(() => !ui.row("child"));
  await settle(ui);
  assert.equal(ui.ui().editing, true);
  assert.equal(ui.ol().state.caret?.id, "parent");
  assert.equal(ui.field()?.closest("[data-row]")?.dataset.row, "parent");
  await ui.unmount();
});
