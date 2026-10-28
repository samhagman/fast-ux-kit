import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
import { encodeOutline, decodeOutline, type OutlineNode } from "../src/core/index.js";
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { ExtensionsDemo, demoEnvelopeCodec } = await import("../examples/docs/extensions.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
async function click(element: Element) {
  await act(async () => fireEvent.click(element));
}
async function enable(view: ReturnType<typeof render>) {
  await click(view.getByRole("checkbox", { name: "Enable extension editing" }));
}
const draft = (view: ReturnType<typeof render>) =>
  view.getByRole("textbox", { name: "Edit Review the release notes" }) as HTMLTextAreaElement;
test("custom envelope round-trips nested portable metadata and rejects unknown headers", () => {
  const nodes: readonly OutlineNode[] = [
    {
      id: "a",
      text: "Line one\nLine two",
      checked: false,
      data: { zero: 0, flags: [true, null], value: "雪" },
      children: [{ id: "b", text: "Child", data: { a: [1, 2] } }],
    },
  ];
  assert.deepEqual(
    decodeOutline(encodeOutline(nodes, demoEnvelopeCodec), demoEnvelopeCodec),
    nodes,
  );
  assert.throws(() => decodeOutline("not an envelope", demoEnvelopeCodec), /Expected/);
  assert.throws(() => decodeOutline("FAST-UX-DEMO/1\n{}", demoEnvelopeCodec));
});
test("extensions begin in reader mode, expose collapsed detail and intentionally enable editing", async () => {
  const view = render(<ExtensionsDemo />);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(
    (view.getByRole("button", { name: "Mark reviewed" }) as HTMLButtonElement).disabled,
    true,
  );
  assert.ok(view.getByText("1 nested detail preserved"));
  await enable(view);
  assert.ok(draft(view));
  assert.ok(view.getByRole("button", { name: "Add a follow-up note" }));
});
test("toolbar review is one atomic history entry and lock refusal does not partially mutate", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("button", { name: "Mark reviewed" }));
  assert.ok(view.getByText("Reviewed", { selector: "span" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Review recorded by toolbar" }));
  assert.ok(view.getByText("Undo entries 1; redo entries 0"));
  await click(view.getByRole("button", { name: "Undo extension change" }));
  assert.ok(view.getByText("Needs review", { selector: "span" }));
  assert.ok(view.getByRole("textbox", { name: "Edit No review recorded" }));
  await click(view.getByRole("button", { name: "Redo extension change" }));
  assert.ok(view.getByText("Reviewed", { selector: "span" }));
  await click(view.getByRole("button", { name: "Undo extension change" }));
  await click(view.getByRole("checkbox", { name: "Protect review log" }));
  await click(view.getByRole("button", { name: "Mark reviewed" }));
  assert.ok(view.getByText("Needs review", { selector: "span" }));
  assert.ok(view.getByText("Action refused: locked."));
  assert.ok(view.getByText("Undo entries 0; redo entries 1"));
});
test("ordered F2 plugins visibly change precedence and both observe accepted and refused transactions", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await act(async () => fireEvent.keyDown(draft(view), { key: "F2" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Review recorded by primary" }));
  assert.ok(view.getByText("Primary: 1 F2 claims; 1 transactions observed"));
  assert.ok(view.getByText("Fallback: 0 F2 claims; 1 transactions observed"));
  await click(view.getByRole("checkbox", { name: "Fallback plugin first" }));
  await act(async () => fireEvent.keyDown(draft(view), { key: "F2" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Review recorded by fallback" }));
  assert.ok(view.getByText("Primary: 1 F2 claims; 2 transactions observed"));
  assert.ok(view.getByText("Fallback: 1 F2 claims; 2 transactions observed"));
  await click(view.getByRole("checkbox", { name: "Protect review log" }));
  await click(view.getByRole("checkbox", { name: "Fallback plugin first" }));
  await act(async () => fireEvent.keyDown(draft(view), { key: "F2" }));
  assert.ok(view.getByText("Action refused: locked."));
  assert.ok(view.getByText("Primary: 2 F2 claims; 3 transactions observed"));
});
test("ghost prompt inserts an editable row and undo removes only that insertion", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("button", { name: "Add a follow-up note" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Follow-up:" }));
  await click(view.getByRole("button", { name: "Undo extension change" }));
  assert.equal(view.queryByRole("textbox", { name: "Edit Follow-up:" }), null);
  assert.ok(draft(view));
});
test("the visible insertion policy scenario retains a refused prompt and retries without retyping", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("checkbox", { name: "Pause note insertion" }));
  const prompt = view.getByRole("textbox", {
    name: "Add a follow-up note: type here",
  }) as HTMLTextAreaElement;
  await act(async () => {
    prompt.focus();
    fireEvent.change(prompt, {
      target: { value: "Keep this draft", selectionStart: 15, selectionEnd: 15 },
    });
  });
  assert.equal(prompt.value, "Keep this draft");
  assert.equal(document.activeElement, prompt);
  assert.equal(view.queryByRole("textbox", { name: "Edit Keep this draft" }), null);
  assert.ok(view.getByText("Undo entries 0; redo entries 0"));
  assert.ok(view.getByText("Action refused: locked."));
  await click(view.getByRole("checkbox", { name: "Pause note insertion" }));
  await act(async () => {
    prompt.focus();
    fireEvent.keyDown(prompt, { key: "Enter" });
  });
  const inserted = view.getByRole("textbox", { name: "Edit Keep this draft" });
  assert.equal(document.activeElement, inserted);
  assert.equal(prompt.value, "");
  assert.ok(view.getByText("Undo entries 1; redo entries 0"));
  await click(view.getByRole("button", { name: "Undo extension change" }));
  assert.equal(view.queryByRole("textbox", { name: "Edit Keep this draft" }), null);
});
test("public handle envelope export/import preserves nested metadata and imports are undoable", async () => {
  const view = render(<ExtensionsDemo />);
  await click(view.getByRole("button", { name: "Export envelope" }));
  const exported = await view.findByRole("dialog", { name: "Export extension envelope" });
  const source = exported.querySelector("code")!.textContent!;
  const original = decodeOutline(source, demoEnvelopeCodec);
  assert.equal(original[0]?.children?.[0]?.id, "detail");
  assert.deepEqual(original[0]?.data, {
    owner: "Design",
    reviewed: false,
    tags: ["local", "draft"],
  });
  assert.equal(within(exported).getAllByRole("button", { name: "Copy code" }).length, 1);
  await click(within(exported).getByRole("button", { name: "Close" }));
  await enable(view);
  await click(view.getByRole("button", { name: "Mark reviewed" }));
  await click(view.getByRole("button", { name: "Import envelope" }));
  const importer = await view.findByRole("dialog", { name: "Import extension envelope" });
  await act(async () =>
    fireEvent.change(within(importer).getByRole("textbox", { name: "Envelope source" }), {
      target: { value: source },
    }),
  );
  await click(within(importer).getByRole("button", { name: "Apply envelope" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
  assert.ok(view.getByText("Needs review", { selector: "span" }));
  await click(view.getByRole("button", { name: "Undo extension change" }));
  assert.ok(view.getByText("Reviewed", { selector: "span" }));
});
test("invalid envelopes stay in the import dialog and do not mutate the document", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("button", { name: "Import envelope" }));
  const importer = await view.findByRole("dialog", { name: "Import extension envelope" });
  await act(async () =>
    fireEvent.change(within(importer).getByRole("textbox", { name: "Envelope source" }), {
      target: { value: "invalid" },
    }),
  );
  await click(within(importer).getByRole("button", { name: "Apply envelope" }));
  assert.ok(within(importer).getByText("Expected a FAST-UX-DEMO/1 envelope."));
  assert.ok(view.getByText("Content revision 0"));
});

test("returning to reader mode preserves review content and history without editable controls", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("button", { name: "Mark reviewed" }));
  await enable(view);
  assert.equal(view.queryByRole("textbox"), null);
  assert.ok(view.getByText("Reviewed", { selector: "span" }));
  assert.equal(
    (view.getByRole("button", { name: "Undo extension change" }) as HTMLButtonElement).disabled,
    true,
  );
  await enable(view);
  await click(view.getByRole("button", { name: "Undo extension change" }));
  assert.ok(view.getByText("Needs review", { selector: "span" }));
});
test("valid envelope imports still respect protected rows and preserve the rejected source for correction", async () => {
  const view = render(<ExtensionsDemo />);
  await enable(view);
  await click(view.getByRole("checkbox", { name: "Protect review log" }));
  await click(view.getByRole("button", { name: "Import envelope" }));
  const importer = await view.findByRole("dialog", { name: "Import extension envelope" });
  const source = demoEnvelopeCodec.encode([
    { id: "draft", text: "Replacement draft" },
    { id: "review-log", text: "Changed protected log" },
  ]);
  const input = within(importer).getByRole("textbox", {
    name: "Envelope source",
  }) as HTMLTextAreaElement;
  await act(async () => fireEvent.change(input, { target: { value: source } }));
  await click(within(importer).getByRole("button", { name: "Apply envelope" }));
  assert.ok(within(importer).getByText("Import refused: locked."));
  assert.equal(input.value, source);
  assert.ok(view.getByText("Content revision 0"));
  await click(within(importer).getByRole("button", { name: "Close" }));
  assert.ok(draft(view));
});
