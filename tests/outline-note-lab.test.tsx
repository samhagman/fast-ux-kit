import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { StrictMode } from "react";
const { cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { OutlineNoteLab } = await import("../examples/docs/outline-note-lab.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

test("note lab starts read-first, enables an explicit field and retains host metadata through history", () => {
  const view = render(
    <StrictMode>
      <OutlineNoteLab />
    </StrictMode>,
  );
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: "Edit note for Cedar field journal" }), null);
  fireEvent.click(view.getByRole("checkbox", { name: "Enable local note editing" }));
  fireEvent.click(view.getByRole("button", { name: "Edit note for Cedar field journal" }));
  const note = view.getByRole("textbox", { name: "Edit note for Cedar field journal" });
  fireEvent.change(note, { target: { value: "Local copper note" } });
  assert.match(view.getByRole("status", { name: "Note lab state" }).textContent!, /Revision 1/);
  assert.ok(view.getAllByText("Reference C-17").length);
  fireEvent.keyDown(note, { key: "Escape" });
  assert.equal(view.queryByRole("textbox", { name: "Edit note for Cedar field journal" }), null);
  assert.ok(view.getAllByText("Local copper note").length);
  fireEvent.click(view.getByRole("button", { name: "Undo local change" }));
  assert.match(
    (
      view.getByRole("textbox", {
        name: "Edit note for Cedar field journal",
      }) as HTMLTextAreaElement
    ).value,
    /cool morning/,
  );
  fireEvent.click(view.getByRole("button", { name: "Redo local change" }));
  assert.equal(
    (
      view.getByRole("textbox", {
        name: "Edit note for Cedar field journal",
      }) as HTMLTextAreaElement
    ).value,
    "Local copper note",
  );
});

test("note lab policy, protected row and authoritative replacement remain explicit", () => {
  const view = render(<OutlineNoteLab />);
  fireEvent.click(view.getByRole("checkbox", { name: "Enable local note editing" }));
  assert.equal(
    (view.getByRole("button", { name: "Edit note for Protected reference" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(view.getByRole("button", { name: "Edit note for Cedar field journal" }));
  const note = view.getByRole("textbox", {
    name: "Edit note for Cedar field journal",
  }) as HTMLTextAreaElement;
  fireEvent.click(view.getByRole("checkbox", { name: "Pause document changes" }));
  fireEvent.change(note, { target: { value: "Refused value" } });
  assert.match(note.value, /cool morning/);
  assert.match(view.getByRole("status", { name: "Note lab state" }).textContent!, /Change refused/);
  fireEvent.click(view.getByRole("checkbox", { name: "Pause document changes" }));
  fireEvent.change(note, { target: { value: "Temporary value" } });
  fireEvent.click(view.getByRole("button", { name: "Replace with fresh local document" }));
  assert.match(view.getByRole("status", { name: "Note lab state" }).textContent!, /Undo 0/);
  assert.match(
    (
      view.getByRole("textbox", {
        name: "Edit note for Cedar field journal",
      }) as HTMLTextAreaElement
    ).value,
    /cool morning/,
  );
  fireEvent.click(view.getByRole("button", { name: "Reset note lab" }));
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable local note editing" }) as HTMLInputElement).checked,
    false,
  );
});

test("note lab search uses immediate canonical notes and keyboard profile is separately enabled", () => {
  const view = render(<OutlineNoteLab />);
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable Shift+Enter field switching" }) as HTMLInputElement)
      .checked,
    false,
  );
  fireEvent.click(view.getByRole("checkbox", { name: "Enable local note editing" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Enable Shift+Enter field switching" }));
  const title = view.getByRole("textbox", { name: "Edit Cedar field journal" });
  fireEvent.keyDown(title, { key: "Enter", shiftKey: true });
  const note = view.getByRole("textbox", { name: "Edit note for Cedar field journal" });
  fireEvent.change(note, { target: { value: "Copper-only observation" } });
  const details = view.getByText("Inspect the current document").closest("details")!;
  details.open = true;
  fireEvent.change(within(details).getByRole("searchbox", { name: "Search outline" }), {
    target: { value: "copper-only" },
  });
  assert.match(within(details).getByRole("status").textContent!, /1 result/);
  assert.ok(within(details).getByText("Cedar field journal"));
});
