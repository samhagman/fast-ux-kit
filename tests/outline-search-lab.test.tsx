import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { StrictMode } from "react";

const { cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { OutlineSearchLab } = await import("../examples/docs/outline-search-lab.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});
const mount = () =>
  render(
    <StrictMode>
      <OutlineSearchLab />
    </StrictMode>,
  );
type View = ReturnType<typeof mount>;
const reader = (view: View) => view.getByRole("region", { name: "Local outline search" });
const query = (view: View) =>
  within(reader(view)).getByRole("searchbox", { name: "Search outline" }) as HTMLInputElement;
const revision = (view: View) =>
  view.getByRole("status", { name: "Document revision" }).textContent;
const localStatus = (view: View) => view.getByRole("status", { name: "Local changes" }).textContent;
const rootOrder = (view: View) =>
  [...reader(view).querySelectorAll('[data-node-id][data-depth="0"]')].map((row) =>
    row.getAttribute("data-node-id"),
  );
function reveal(view: View, title: string) {
  fireEvent.click(within(reader(view)).getByRole("button", { name: `Reveal ${title}` }));
}
function enable(view: View) {
  fireEvent.click(view.getByRole("checkbox", { name: "Enable local editing" }));
}

test("lab is read-first: view changes and reveal cannot mutate the local document", () => {
  const view = mount();
  assert.equal(view.container.querySelector("[contenteditable]"), null);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: "Save selected item" }), null);
  assert.equal(revision(view), "0");
  assert.equal(
    view.getByRole("button", { name: "Sort roots by title" }).hasAttribute("disabled"),
    true,
  );
  reveal(view, "Repair desk lamp #home");
  assert.ok(view.getByText("Host-only reference: Kept by the host"));
  assert.equal(view.queryByRole("textbox", { name: "Selected title" }), null);
  fireEvent.click(within(reader(view)).getByRole("button", { name: "Hide completed" }));
  fireEvent.click(within(reader(view)).getByRole("button", { name: "Hide notes" }));
  fireEvent.change(query(view), { target: { value: "#home" } });
  assert.equal(revision(view), "0");
  assert.equal(
    view.getByRole("button", { name: "Undo local change" }).hasAttribute("disabled"),
    true,
  );
});

test("draft save updates search atomically, retains host data, and supports undo/redo", () => {
  const view = mount();
  reveal(view, "Repair desk lamp #home");
  enable(view);
  fireEvent.change(query(view), { target: { value: "amber" } });
  fireEvent.change(view.getByRole("textbox", { name: "Selected title" }), {
    target: { value: "Repair amber lamp #home" },
  });
  fireEvent.change(view.getByRole("textbox", { name: "Selected note" }), {
    target: { value: "Amber light #errands" },
  });
  fireEvent.click(view.getByRole("checkbox", { name: "Item completed" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Show item checkbox" }));
  assert.equal(reader(view).querySelector('[data-node-id="lamp"]'), null);
  assert.equal(revision(view), "0");
  fireEvent.click(view.getByRole("button", { name: "Save selected item" }));
  assert.ok(reader(view).querySelector('[data-node-id="lamp"]'));
  assert.equal(revision(view), "1");
  assert.match(localStatus(view)!, /one undo step/);
  assert.ok(view.getByText("Host-only reference: Kept by the host"));
  assert.equal(
    view.getByRole("button", { name: "Save selected item" }).hasAttribute("disabled"),
    true,
  );
  fireEvent.change(query(view), { target: { value: "is:completed -has:checkbox" } });
  assert.ok(reader(view).querySelector('[data-node-id="lamp"]'));
  fireEvent.click(view.getByRole("button", { name: "Undo local change" }));
  assert.equal(reader(view).querySelector('[data-node-id="lamp"]'), null);
  assert.equal(
    (view.getByRole("textbox", { name: "Selected title" }) as HTMLInputElement).value,
    "Repair desk lamp #home",
  );
  fireEvent.click(view.getByRole("button", { name: "Redo local change" }));
  assert.ok(reader(view).querySelector('[data-node-id="lamp"]'));
  assert.ok(view.getByText("Host-only reference: Kept by the host"));
});

test("sorts are explicit undoable root commands and cannot displace a protected row", () => {
  const view = mount();
  const original = ["workshop", "garden", "reading", "reference"];
  assert.deepEqual(rootOrder(view), original);
  enable(view);
  fireEvent.click(view.getByRole("button", { name: "Sort roots by title" }));
  assert.deepEqual(rootOrder(view), ["garden", "reading", "workshop", "reference"]);
  assert.equal(revision(view), "1");
  fireEvent.click(view.getByRole("button", { name: "Undo local change" }));
  assert.deepEqual(rootOrder(view), original);
  const beforeRefusal = revision(view);
  for (const label of ["Reverse root order", "Sort roots by completion"]) {
    fireEvent.click(view.getByRole("button", { name: label }));
    assert.match(localStatus(view)!, /Sort refused: locked/);
    assert.deepEqual(rootOrder(view), original);
    assert.equal(revision(view), beforeRefusal);
  }
  fireEvent.click(view.getByRole("button", { name: "Sort roots by date" }));
  assert.deepEqual(rootOrder(view), ["garden", "reading", "workshop", "reference"]);
  reveal(view, "Zebra reference");
  fireEvent.change(view.getByRole("textbox", { name: "Selected title" }), {
    target: { value: "Changed reference" },
  });
  const beforeSave = revision(view);
  fireEvent.click(view.getByRole("button", { name: "Save selected item" }));
  assert.match(localStatus(view)!, /Change refused: locked/);
  assert.equal(revision(view), beforeSave);
  assert.ok(within(reader(view)).getByRole("button", { name: "Reveal Zebra reference" }));
});

test("tag queries stay local and resets permit repeated independent trials", () => {
  const view = mount();
  for (let run = 0; run < 2; run++) {
    fireEvent.click(view.getByRole("button", { name: "Search tag #errands" }));
    assert.equal(query(view).value, "#errands");
    assert.ok(reader(view).querySelector('[data-node-id="lamp"]'));
    reveal(view, "Repair desk lamp #home");
    enable(view);
    fireEvent.change(view.getByRole("textbox", { name: "Selected note" }), {
      target: { value: `Temporary note ${run}` },
    });
    fireEvent.click(view.getByRole("button", { name: "Save selected item" }));
    assert.equal(revision(view), "1");
    fireEvent.click(view.getByRole("button", { name: "Reset local outline" }));
    assert.equal(revision(view), "0");
    assert.equal(query(view).value, "");
    assert.equal(
      (view.getByRole("checkbox", { name: "Enable local editing" }) as HTMLInputElement).checked,
      false,
    );
    assert.equal(view.queryByRole("textbox", { name: "Selected title" }), null);
    assert.ok(view.getByRole("button", { name: "Search tag #errands" }));
    assert.equal(
      view.getByRole("button", { name: "Redo local change" }).hasAttribute("disabled"),
      true,
    );
  }
});

test("turning editing off discards unsaved details without altering canonical search", () => {
  const view = mount();
  reveal(view, "Repair desk lamp #home");
  enable(view);
  fireEvent.change(view.getByRole("textbox", { name: "Selected title" }), {
    target: { value: "Unsaved title" },
  });
  enable(view);
  assert.equal(view.queryByRole("textbox", { name: "Selected title" }), null);
  enable(view);
  assert.equal(
    (view.getByRole("textbox", { name: "Selected title" }) as HTMLInputElement).value,
    "Repair desk lamp #home",
  );
  assert.equal(revision(view), "0");
});

test("dirty details block navigation and history until explicitly saved or discarded", () => {
  const view = mount();
  reveal(view, "Repair desk lamp #home");
  enable(view);
  fireEvent.click(view.getByRole("button", { name: "Sort roots by title" }));
  const beforeDraft = revision(view);
  fireEvent.change(view.getByRole("textbox", { name: "Selected title" }), {
    target: { value: "Unsaved but retained" },
  });
  reveal(view, "Reading list #ideas");
  assert.match(localStatus(view)!, /Save or discard.*before revealing/);
  assert.equal(
    (view.getByRole("textbox", { name: "Selected title" }) as HTMLInputElement).value,
    "Unsaved but retained",
  );
  fireEvent.click(view.getByRole("button", { name: "Undo local change" }));
  assert.match(localStatus(view)!, /Save or discard.*before undoing/);
  assert.equal(revision(view), beforeDraft);
  fireEvent.click(view.getByRole("button", { name: "Discard selected draft" }));
  assert.equal(
    (view.getByRole("textbox", { name: "Selected title" }) as HTMLInputElement).value,
    "Repair desk lamp #home",
  );
  assert.equal(revision(view), beforeDraft);
  reveal(view, "Reading list #ideas");
  assert.equal(
    (view.getByRole("textbox", { name: "Selected title" }) as HTMLInputElement).value,
    "Reading list #ideas",
  );
});
