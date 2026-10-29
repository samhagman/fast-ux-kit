import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { StrictMode } from "react";
const { cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { MachineTreeLab, MachineTreeGalleryPreview } =
  await import("../examples/docs/machine-tree-lab.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

test("tree lab starts with supplied activity only and can refuse selection without dispatch", () => {
  const view = render(
    <StrictMode>
      <MachineTreeLab />
    </StrictMode>,
  );
  const runtime = view.getByRole("status", { name: "Tree lab runtime state" });
  assert.match(runtime.textContent!, /No local simulation/);
  fireEvent.click(view.getByRole("treeitem", { name: "State: Connecting" }));
  assert.match(
    view.getByRole("status", { name: "Tree lab view state" }).textContent!,
    /Selected Connecting. No event/,
  );
  fireEvent.click(view.getByRole("checkbox", { name: "Accept selection requests" }));
  fireEvent.click(view.getByRole("treeitem", { name: "State: Loading settings" }));
  assert.match(
    view.getByRole("status", { name: "Tree lab view state" }).textContent!,
    /host kept its current selection/,
  );
  assert.equal(
    view.getByRole("treeitem", { name: "State: Connecting" }).getAttribute("aria-selected"),
    "true",
  );
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "CONFIGURED" } });
  assert.ok(view.getByRole("treeitem", { name: "Transition: CONFIGURED" }));
  assert.match(runtime.textContent!, /No local simulation/);
});

test("tree lab events are explicit, guarded and reset on example replacement", () => {
  const view = render(<MachineTreeLab />);
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  const runtime = view.getByRole("status", { name: "Tree lab runtime state" });
  const finish = view.getByRole("button", { name: "Send FINISH" }) as HTMLButtonElement;
  assert.equal(finish.disabled, true);
  const before = runtime.textContent;
  fireEvent.click(view.getByRole("treeitem", { name: "State: Connecting" }));
  assert.equal(runtime.textContent, before);
  fireEvent.click(view.getByRole("button", { name: "Send CONNECTED" }));
  fireEvent.click(view.getByRole("button", { name: "Send CONFIGURED" }));
  assert.equal(finish.disabled, false);
  fireEvent.click(finish);
  assert.match(runtime.textContent!, /done/);
  fireEvent.change(view.getByRole("combobox", { name: "Choose a machine tree example" }), {
    target: { value: "support" },
  });
  assert.match(runtime.textContent!, /No local simulation/);
  assert.equal(view.queryByRole("group", { name: "Local simulation events" }), null);
  assert.match(
    view.getByRole("status", { name: "Tree lab view state" }).textContent!,
    /No selection requests/,
  );
  fireEvent.click(view.getByRole("button", { name: "Reset tree example" }));
  assert.equal(
    (view.getByRole("checkbox", { name: "Accept selection requests" }) as HTMLInputElement).checked,
    true,
  );
});

test("gallery preview uses the read-only tree without simulation or inspector controls", () => {
  const view = render(<MachineTreeGalleryPreview />);
  assert.ok(view.getByRole("tree"));
  assert.equal(view.queryByRole("searchbox"), null);
  assert.equal(view.queryByRole("complementary"), null);
  assert.equal(view.queryByRole("button", { name: /simulation/ }), null);
  assert.ok(within(view.getByRole("tree")).getByRole("treeitem", { name: "Parallel: Preparing" }));
});
