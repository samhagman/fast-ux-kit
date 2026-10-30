import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { act, StrictMode } from "react";
const { cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { MachineTreeLab, MachineTreeGalleryPreview } =
  await import("../examples/docs/machine-tree-lab.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

test("tree lab starts idle and can refuse selection without dispatch", () => {
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
  assert.equal(view.container.querySelector("[data-active]"), null);
  fireEvent.click(view.getByRole("button", { name: "Help and view options" }));
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
  fireEvent.click(view.getByRole("checkbox", { name: "Show search and tree tools" }));
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "CONFIGURED" } });
  assert.ok(view.getByRole("treeitem", { name: "Transition: CONFIGURED" }));
  assert.match(runtime.textContent!, /No local simulation/);
});

test("tree lab events are explicit, guarded and reset on example replacement", () => {
  const view = render(<MachineTreeLab />);
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  fireEvent.click(view.getByText("Simulation controls and boundaries"));
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
  fireEvent.click(view.getByRole("button", { name: "Examples" }));
  fireEvent.change(view.getByRole("combobox", { name: "Choose a machine tree example" }), {
    target: { value: "support" },
  });
  assert.match(runtime.textContent!, /No local simulation/);
  assert.equal(view.queryByRole("group", { name: "Local simulation events" }), null);
  assert.match(
    view.getByRole("status", { name: "Tree lab view state" }).textContent!,
    /No selection requests/,
  );
  assert.equal(view.queryByRole("region", { name: "Machine examples" }), null);
  assert.equal(document.activeElement, view.getByRole("button", { name: "Examples" }));
  fireEvent.click(view.getByRole("button", { name: "Examples" }));
  fireEvent.click(view.getByRole("button", { name: "Reset tree example" }));
  fireEvent.click(view.getByRole("button", { name: "Close examples" }));
  fireEvent.click(view.getByRole("button", { name: "Help and view options" }));
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

test("focused workspace starts with tools closed and panels can dismiss with focus restoration", () => {
  const view = render(<MachineTreeLab />);
  assert.equal(view.queryByRole("searchbox"), null);
  assert.equal(view.queryByRole("complementary", { name: "Workspace panel" }), null);
  const toggle = view.getByRole("button", { name: "Toggle workspace panel" });
  fireEvent.click(toggle);
  assert.equal(view.getByRole("tab", { name: "Code" }).getAttribute("aria-selected"), "true");
  fireEvent.click(view.getByRole("tab", { name: "Details" }));
  fireEvent.keyDown(view.getByRole("tab", { name: "Details" }), { key: "Escape" });
  assert.equal(view.queryByRole("complementary", { name: "Workspace panel" }), null);
  assert.equal(document.activeElement, toggle);
  fireEvent.click(view.getByRole("button", { name: "Switch to dark theme" }));
  assert.equal(view.container.querySelector("article")?.getAttribute("data-tree-theme"), "dark");
});

test("inline event controls are opt-in and do not dispatch through target navigation", () => {
  const view = render(<MachineTreeLab />);
  assert.equal(view.queryByRole("button", { name: /Send event CONNECTED from/ }), null);
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  assert.equal(view.getByRole("tab", { name: "Simulation" }).getAttribute("aria-selected"), "true");
  const runtime = view.getByRole("status", { name: "Tree lab runtime state" });
  const route = view.getByRole("treeitem", { name: "Transition: CONNECTED" });
  const eventButton = view.getByRole("button", { name: /Send event CONNECTED from/ });
  act(() => eventButton.focus());
  fireEvent.click(eventButton);
  assert.match(runtime.textContent!, /sequence 1/);
  assert.equal(document.activeElement, route);
  assert.equal(route.tabIndex, 0);
  assert.equal((eventButton as HTMLButtonElement).disabled, true);
  const before = runtime.textContent;
  fireEvent.click(view.getByRole("button", { name: "Reveal target Connected" }));
  assert.equal(runtime.textContent, before);
});

test("details preserve containment path, declared initial metadata and hidden selection recovery", () => {
  const view = render(<MachineTreeLab />);
  fireEvent.click(view.getByRole("treeitem", { name: "Compound: Connection" }));
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  fireEvent.click(view.getByRole("tab", { name: "Details" }));
  const path = view.getByRole("list", { name: "Selected item tree path" });
  assert.match(path.textContent!, /Parallel launch readiness launch/);
  assert.match(path.textContent!, /Connection launch-connection/);
  assert.equal(
    view.getByText("Declared initial child").nextElementSibling?.textContent,
    "launch-connecting",
  );
  fireEvent.click(view.getByRole("button", { name: "Help and view options" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Show search and tree tools" }));
  fireEvent.click(view.getByRole("tab", { name: "Details" }));
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "CONFIGURED" } });
  assert.ok(view.getByText("This selection is outside the visible tree."));
  fireEvent.click(view.getByRole("button", { name: "Show selected item" }));
  assert.equal(view.queryByText("This selection is outside the visible tree."), null);
  assert.equal((view.getByRole("searchbox") as HTMLInputElement).value, "");
  assert.equal(
    view.getByRole("treeitem", { name: "Compound: Connection" }).getAttribute("aria-selected"),
    "true",
  );
  assert.match(
    view.getByRole("status", { name: "Tree lab view state" }).textContent!,
    /Shown Connection/,
  );
  assert.match(
    view.getByRole("status", { name: "Tree lab runtime state" }).textContent!,
    /No local simulation/,
  );
  fireEvent.click(view.getByRole("button", { name: "Collapse all" }));
  assert.ok(view.getByText("This selection is outside the visible tree."));
  fireEvent.click(view.getByRole("button", { name: "Show selected item" }));
  assert.ok(view.getByRole("treeitem", { name: "Compound: Connection" }));
});

test("details detect filtered transitions and reveal restores the required filter", () => {
  const view = render(<MachineTreeLab />);
  fireEvent.click(view.getByRole("treeitem", { name: "Transition: CONNECTED" }));
  fireEvent.click(view.getByRole("button", { name: "Help and view options" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Show search and tree tools" }));
  fireEvent.click(view.getByRole("tab", { name: "Details" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Transitions" }));
  assert.ok(view.getByText("This selection is outside the visible tree."));
  assert.equal(view.queryByRole("treeitem", { name: "Transition: CONNECTED" }), null);
  fireEvent.click(view.getByRole("button", { name: "Show selected item" }));
  assert.equal(view.queryByText("This selection is outside the visible tree."), null);
  assert.ok(view.getByRole("treeitem", { name: "Transition: CONNECTED" }));
  assert.equal(
    (view.getByRole("checkbox", { name: "Transitions" }) as HTMLInputElement).checked,
    true,
  );
});

test("simulation panel follows the starting pane state and stop returns an open pane to code", () => {
  const view = render(<MachineTreeLab />);
  const panel = () => view.queryByRole("complementary", { name: "Workspace panel" });
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  assert.equal(panel(), null);
  assert.ok(view.getByRole("button", { name: "Restart local simulation" }));
  fireEvent.click(view.getByRole("button", { name: "Restart local simulation" }));
  assert.equal(panel(), null);
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  assert.equal(view.getByRole("tab", { name: "Code" }).getAttribute("aria-selected"), "true");
  assert.ok(view.getByLabelText("Read-only machine document"));
  assert.equal(view.queryByRole("textbox"), null);
  fireEvent.click(view.getByRole("tab", { name: "Simulation" }));
  fireEvent.click(view.getByRole("button", { name: "Stop local simulation" }));
  assert.equal(view.getByRole("tab", { name: "Code" }).getAttribute("aria-selected"), "true");
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  assert.equal(view.getByRole("tab", { name: "Simulation" }).getAttribute("aria-selected"), "true");
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  fireEvent.click(view.getByRole("button", { name: "Stop local simulation" }));
  assert.equal(panel(), null);
  assert.equal(view.queryByRole("button", { name: "Restart local simulation" }), null);
});

test("event cards retain each context outcome and reset without view operations dispatching", () => {
  const view = render(<MachineTreeLab />);
  fireEvent.click(view.getByRole("button", { name: "Toggle workspace panel" }));
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  const history = () => view.getByRole("list", { name: "Local event history" });
  assert.equal(within(history()).getAllByRole("listitem").length, 1);
  fireEvent.click(view.getByRole("button", { name: /Send event CONNECTED from/ }));
  fireEvent.click(view.getByRole("button", { name: /Send event CONFIGURED from/ }));
  assert.equal(within(history()).getAllByRole("listitem").length, 3);
  assert.equal(view.getByLabelText("Context after Initial state").textContent, "{}");
  assert.deepEqual(JSON.parse(view.getByLabelText("Context after CONNECTED").textContent!), {
    connected: true,
  });
  assert.deepEqual(JSON.parse(view.getByLabelText("Context after CONFIGURED").textContent!), {
    connected: true,
    configured: true,
  });
  const current = view.getByLabelText("Current simulation context").textContent;
  fireEvent.click(view.getByRole("button", { name: "Reveal target Connected" }));
  assert.equal(within(history()).getAllByRole("listitem").length, 3);
  assert.equal(view.getByLabelText("Current simulation context").textContent, current);
  fireEvent.click(view.getByRole("button", { name: "Restart local simulation" }));
  assert.equal(within(history()).getAllByRole("listitem").length, 1);
  assert.equal(view.getByLabelText("Current simulation context").textContent, "{}");
  fireEvent.click(view.getByRole("button", { name: "Stop local simulation" }));
  fireEvent.click(view.getByRole("tab", { name: "Simulation" }));
  assert.equal(view.queryByRole("list", { name: "Local event history" }), null);
  fireEvent.click(view.getByRole("button", { name: "Begin local simulation" }));
  fireEvent.click(view.getByRole("button", { name: "Examples" }));
  fireEvent.change(view.getByRole("combobox", { name: "Choose a machine tree example" }), {
    target: { value: "support" },
  });
  assert.equal(view.queryByRole("list", { name: "Local event history" }), null);
});
