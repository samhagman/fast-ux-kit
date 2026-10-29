import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors, dom } from "./components-dom.js";
import {
  createOutlineJSONCodec,
  findOutlineNode,
  outlineIds,
  validateOutline,
} from "../src/core/index.js";
import { validateRichDocument } from "../src/rich/index.js";
import { labScenarios, type LabData } from "../examples/docs/outliner-lab-data.js";
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { OutlinerLab } = await import("../examples/docs/outliner-lab.js");

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
async function scenario(view: ReturnType<typeof render>, id: string) {
  await act(async () =>
    fireEvent.change(view.getByRole("combobox", { name: "Choose a scenario" }), {
      target: { value: id },
    }),
  );
}
async function enable(view: ReturnType<typeof render>) {
  await click(view.getByRole("checkbox", { name: "Enable editing" }));
}
function assertHistory(
  view: ReturnType<typeof render>,
  revision: number,
  past: number,
  future: number,
) {
  assert.equal(view.getByTestId("lab-revision").textContent, String(revision));
  assert.equal(view.getByTestId("lab-history").textContent, `${past} / ${future}`);
}

test("six independently authored fixtures have stable unique IDs, valid rich data and bounded scale", () => {
  assert.equal(labScenarios.length, 6);
  assert.equal(new Set(labScenarios.map((item) => item.id)).size, 6);
  for (const fixture of labScenarios) {
    assert.deepEqual(validateOutline(fixture.nodes), []);
    assert.ok(findOutlineNode(fixture.nodes, fixture.branch));
    assert.ok(findOutlineNode(fixture.nodes, fixture.target));
    assert.ok(findOutlineNode(fixture.nodes, "reference"));
    for (const id of outlineIds(fixture.nodes)) {
      const content = findOutlineNode(fixture.nodes, id)?.node.data?.content;
      if (content) validateRichDocument(content);
    }
  }
  assert.equal(outlineIds(labScenarios.find((item) => item.id === "scale")!.nodes).length, 253);
});

test("lab starts read-only and view actions do not add content history or self-report passes", async () => {
  const view = render(<OutlinerLab />);
  assert.ok(
    view
      .getByText("A small field notebook", { selector: "span" })
      .classList.contains("fast-ux-outliner__label"),
    "custom reveal targets retain the shared reader hierarchy label",
  );
  assert.equal(
    within(view.getByRole("region", { name: "Live outliner workspace" })).queryByRole("textbox") ===
      null,
    true,
  );
  assert.equal(view.queryByRole("dialog") === null, true);
  assertHistory(view, 0, 0, 0);
  await click(view.getByRole("button", { name: "Collapse all" }));
  assert.equal(
    view.queryByText("A folded detail is still part of the document", { selector: "span" }) ===
      null,
    true,
  );
  await click(view.getByRole("button", { name: "Reveal sample detail" }));
  await click(view.getByRole("button", { name: "Focus sample branch" }));
  assert.ok(view.getByRole("button", { name: "Return to document" }));
  await click(view.getByRole("button", { name: "Return to document" }));
  assertHistory(view, 0, 0, 0);
  assert.ok(view.getByText("Self-reported: 0 as expected · 0 problems · 3 not tested"));
  assert.equal(
    within(view.getByRole("region", { name: "Live outliner workspace" })).queryByRole("textbox") ===
      null,
    true,
  );
});

test("returning from a branch preserves keyboard focus on a stable, guarded navigation control", async () => {
  const view = render(<OutlinerLab />);
  await click(view.getByRole("button", { name: "Collapse all" }));
  await click(view.getByRole("button", { name: "Reveal sample detail" }));
  await click(view.getByRole("button", { name: "Focus sample branch" }));
  const returnButton = view.getByRole("button", {
    name: "Return to document",
  }) as HTMLButtonElement;
  assert.notEqual(returnButton.getAttribute("aria-disabled"), "true");
  await act(async () => {
    returnButton.focus();
    fireEvent.keyDown(returnButton, { key: "Enter", code: "Enter" });
    fireEvent.keyUp(returnButton, { key: "Enter", code: "Enter" });
  });
  await waitFor(() => assert.equal(returnButton.getAttribute("aria-disabled"), "true"));
  assert.equal(returnButton.disabled, false);
  assert.equal(document.activeElement === returnButton, true);
  assertHistory(view, 0, 0, 0);
  const recordedTrail = view.getByText(/^Recent action trail · \d+ recorded$/).textContent;
  await click(returnButton);
  assert.equal(view.getByText(/^Recent action trail · \d+ recorded$/).textContent, recordedTrail);
  assert.equal(document.activeElement === returnButton, true);
});

test("explicit reader reveal scrolls the committed target once without taking focus or leaking work", async (context) => {
  const scrolls: { element: HTMLElement; options: boolean | ScrollIntoViewOptions | undefined }[] =
    [];
  context.mock.method(
    dom.window.HTMLElement.prototype,
    "scrollIntoView",
    function (this: HTMLElement, options?: boolean | ScrollIntoViewOptions) {
      scrolls.push({ element: this, options });
    },
  );
  const view = render(<OutlinerLab />);
  await scenario(view, "scale");
  assert.equal(scrolls.length, 0);
  await click(view.getByRole("button", { name: "Expand all" }));
  assert.equal(scrolls.length, 0);
  const reveal = view.getByRole("button", { name: "Reveal sample detail" });
  await act(async () => reveal.focus());
  await click(reveal);
  assert.equal(scrolls.length, 1);
  assert.equal(scrolls[0]!.element.textContent, "The leaf at level twelve: 雪 · שלום · 🧭");
  assert.equal(scrolls[0]!.element.isConnected, true);
  assert.deepEqual(scrolls[0]!.options, {
    behavior: "instant",
    block: "center",
    inline: "nearest",
  });
  assert.equal(document.activeElement === reveal, true);
  assertHistory(view, 0, 0, 0);
  await click(view.getByRole("button", { name: "Collapse all" }));
  assert.equal(scrolls.length, 1);
  await click(reveal);
  assert.equal(scrolls.length, 2);
  await click(view.getByRole("button", { name: "Reset this trial" }));
  await scenario(view, "rich");
  assert.equal(scrolls.length, 2);
  view.unmount();
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.equal(scrolls.length, 2);
});

test("edit-mode reveal delegates scrolling to the public editor rather than reader title scrolling", async (context) => {
  const scrolled: HTMLElement[] = [];
  context.mock.method(
    dom.window.HTMLElement.prototype,
    "scrollIntoView",
    function (this: HTMLElement) {
      scrolled.push(this);
    },
  );
  const view = render(<OutlinerLab />);
  await enable(view);
  await click(view.getByRole("button", { name: "Reveal sample detail" }));
  assert.ok(scrolled.length > 0);
  assert.equal(
    scrolled.every((element) => element.tagName === "TEXTAREA"),
    true,
  );
});

test("real policy probe is refused read-only and locked, then succeeds after unlock and is undoable", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "policy");
  await click(view.getByRole("button", { name: "Probe write gate" }));
  assert.ok(view.getByText("task: refused: read-only."));
  assertHistory(view, 0, 0, 0);
  await enable(view);
  await click(view.getByRole("button", { name: "Probe write gate" }));
  assert.ok(view.getByText("task: refused: locked."));
  assertHistory(view, 0, 0, 0);
  await click(view.getByRole("checkbox", { name: "Protect reference" }));
  await click(view.getByRole("button", { name: "Probe write gate" }));
  assertHistory(view, 1, 1, 0);
  await click(view.getByRole("button", { name: "Undo" }));
  assertHistory(view, 2, 0, 1);
  await click(view.getByRole("button", { name: "Redo" }));
  assertHistory(view, 3, 1, 0);
  await enable(view);
  assert.equal(
    within(view.getByRole("region", { name: "Live outliner workspace" })).queryByRole("textbox") ===
      null,
    true,
  );
  assertHistory(view, 3, 1, 0);
});

test("keyboard split and visible structural actions use the real editor state and history", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "structure");
  await enable(view);
  const input = view.getByRole("textbox", {
    name: "Edit Make room for the next idea",
  }) as HTMLTextAreaElement;
  await act(async () => {
    input.focus();
    input.setSelectionRange(9, 9);
    fireEvent.select(input);
    fireEvent.keyDown(input, { key: "Enter" });
  });
  assertHistory(view, 1, 1, 0);
  assert.ok(view.getByRole("textbox", { name: "Edit Make room" }));
  await click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Make room for the next idea" }));
  await click(view.getByRole("button", { name: "Select Make room for the next idea" }));
  await click(view.getByRole("button", { name: "Indent" }));
  assertHistory(view, 3, 1, 0);
  await click(view.getByRole("button", { name: "Undo" }));
  assertHistory(view, 4, 0, 1);
});

test("manual outcomes and report are explicit, and reset clears edits, observations and editing mode", async () => {
  const view = render(<OutlinerLab />);
  const check = labScenarios[0]!.checks[0]!;
  await act(async () =>
    fireEvent.change(view.getByRole("combobox", { name: check }), { target: { value: "problem" } }),
  );
  assert.ok(view.getByText("Self-reported: 0 as expected · 1 problems · 2 not tested"));
  await click(view.getByRole("button", { name: "Copy trial report" }));
  const report = await view.findByRole("dialog", { name: "Copy this trial report" });
  assert.match(
    report.querySelector("code")!.textContent!,
    /Problem observed: Reading and selecting/,
  );
  assert.match(report.querySelector("code")!.textContent!, /not automated certification/);
  assert.equal(within(report).getAllByRole("button", { name: "Copy code" }).length, 1);
  await click(within(report).getByRole("button", { name: "Close" }));
  await enable(view);
  await click(view.getByRole("button", { name: "Probe write gate" }));
  assertHistory(view, 1, 1, 0);
  await click(view.getByRole("button", { name: "Reset this trial" }));
  assertHistory(view, 0, 0, 0);
  assert.equal(
    within(view.getByRole("region", { name: "Live outliner workspace" })).queryByRole("textbox") ===
      null,
    true,
  );
  assert.ok(view.getByText("Self-reported: 0 as expected · 0 problems · 3 not tested"));
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable editing" }) as HTMLInputElement).checked,
    false,
  );
});

test("scenario switch retains the selector, discards previous trial state and starts reading again", async () => {
  const view = render(<OutlinerLab />);
  const selector = view.getByRole("combobox", { name: "Choose a scenario" });
  await enable(view);
  await click(view.getByRole("button", { name: "Probe write gate" }));
  await act(async () => selector.focus());
  await scenario(view, "policy");
  assert.equal(document.activeElement === selector, true);
  assertHistory(view, 0, 0, 0);
  assert.equal(
    within(view.getByRole("region", { name: "Live outliner workspace" })).queryByRole("textbox") ===
      null,
    true,
  );
  assert.equal(
    (view.getByRole("checkbox", { name: "Protect reference" }) as HTMLInputElement).checked,
    true,
  );
});

test("malformed import keeps its input and cancellation leaves content unchanged", async () => {
  const view = render(<OutlinerLab />);
  await enable(view);
  await click(view.getByRole("button", { name: "Import document" }));
  const importer = await view.findByRole("dialog", { name: "Import into this trial" });
  await click(within(importer).getByRole("button", { name: "Load malformed example" }));
  await click(within(importer).getByRole("button", { name: "Apply import" }));
  assert.ok(within(importer).getByRole("alert").textContent);
  assert.equal(
    (within(importer).getByRole("textbox", { name: "Import source" }) as HTMLTextAreaElement).value,
    "{ not valid JSON",
  );
  await click(within(importer).getByRole("button", { name: "Close" }));
  assertHistory(view, 0, 0, 0);
});

test("JSON import restores a changed trial and undo restores the pre-import state", async () => {
  const view = render(<OutlinerLab />);
  await enable(view);
  await click(view.getByRole("button", { name: "Probe write gate" }));
  assertHistory(view, 1, 1, 0);
  await click(view.getByRole("button", { name: "Import document" }));
  const importer = await view.findByRole("dialog", { name: "Import into this trial" });
  await click(within(importer).getByRole("button", { name: "Load scenario JSON" }));
  await click(within(importer).getByRole("button", { name: "Apply import" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
  assertHistory(view, 2, 2, 0);
  await click(view.getByRole("button", { name: "Undo" }));
  assertHistory(view, 3, 1, 1);
});

test("host metadata is validated before import commits, preserving the trial for correction and retry", async () => {
  const view = render(<OutlinerLab />);
  await enable(view);
  await click(view.getByRole("button", { name: "Probe write gate" }));
  await click(view.getByRole("button", { name: "Import document" }));
  const importer = await view.findByRole("dialog", { name: "Import into this trial" });
  const input = within(importer).getByRole("textbox", {
    name: "Import source",
  }) as HTMLTextAreaElement;
  const genericCodec = createOutlineJSONCodec();
  for (const metadata of [{ content: {} }, { reviewedBy: { unexpected: true } }, null, []]) {
    const invalid = genericCodec.encode([
      { id: "draft", text: "Invalid host metadata", data: metadata },
    ]);
    await act(async () => fireEvent.change(input, { target: { value: invalid } }));
    await click(within(importer).getByRole("button", { name: "Apply import" }));
    assert.ok(within(importer).getByRole("alert").textContent);
    assert.equal(input.value, invalid);
    assertHistory(view, 1, 1, 0);
    assert.ok(
      view.container.querySelector('textarea[aria-label="Edit Make room for the next idea"]'),
    );
  }
  const corrected = [
    {
      id: "draft",
      text: "Valid application metadata",
      data: { reviewedBy: "local tester", extra: { preserved: true } },
    },
  ];
  await act(async () =>
    fireEvent.change(input, { target: { value: genericCodec.encode(corrected) } }),
  );
  await click(within(importer).getByRole("button", { name: "Apply import" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
  assertHistory(view, 2, 2, 0);
  await click(view.getByRole("button", { name: "Export JSON" }));
  const exporter = await view.findByRole("dialog", { name: "Export outline JSON" });
  assert.deepEqual(genericCodec.decode(exporter.querySelector("code")!.textContent!), corrected);
  await click(within(exporter).getByRole("button", { name: "Close" }));
  await click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Make room for the next idea" }));
  assertHistory(view, 3, 1, 1);
});

test("protected JSON replacement preserves rejected input and title export declares its loss", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "policy");
  await enable(view);
  await click(view.getByRole("button", { name: "Import document" }));
  const importer = await view.findByRole("dialog", { name: "Import into this trial" });
  const replacement = createOutlineJSONCodec<LabData>().encode([
    { id: "reference", text: "Changed protected reference" },
  ]);
  await act(async () =>
    fireEvent.change(within(importer).getByRole("textbox", { name: "Import source" }), {
      target: { value: replacement },
    }),
  );
  await click(within(importer).getByRole("button", { name: "Apply import" }));
  assert.match(within(importer).getByRole("alert").textContent!, /Import refused: locked/);
  assert.equal(
    (within(importer).getByRole("textbox", { name: "Import source" }) as HTMLTextAreaElement).value,
    replacement,
  );
  await click(within(importer).getByRole("button", { name: "Close" }));
  assertHistory(view, 0, 0, 0);
  await click(view.getByRole("button", { name: "Export title text" }));
  const exporter = await view.findByRole("dialog", { name: "Export outline titles" });
  assert.ok(
    within(exporter).getByText(/IDs, rich bodies and application metadata are not preserved/),
  );
});

test("structured clipboard cannot bypass host metadata validation and a corrected paste remains undoable", async () => {
  const view = render(<OutlinerLab />);
  await enable(view);
  await click(view.getByRole("button", { name: "Select Make room for the next idea" }));
  const row = view.container.querySelector('[data-node-id="draft"]')!;
  const codec = createOutlineJSONCodec();
  for (const data of [{ content: {} }, { reviewedBy: { unexpected: true } }]) {
    const source = codec.encode([{ id: "copied", text: "Rejected clipboard row", data }]);
    await act(async () =>
      fireEvent.paste(row, {
        clipboardData: {
          getData: (type: string) => (type === "application/x-fast-ux-outline+json" ? source : ""),
        },
      }),
    );
    assertHistory(view, 0, 0, 0);
    assert.ok(view.getByText(/paste-nodes: refused: invalid lab metadata/));
    assert.equal(
      view.queryByRole("textbox", { name: "Edit Rejected clipboard row" }) === null,
      true,
    );
  }
  const source = codec.encode([
    { id: "copied", text: "Accepted clipboard row", data: { reviewedBy: "tester" } },
  ]);
  await act(async () =>
    fireEvent.paste(row, {
      clipboardData: {
        getData: (type: string) => (type === "application/x-fast-ux-outline+json" ? source : ""),
      },
    }),
  );
  assertHistory(view, 1, 1, 0);
  assert.ok(view.getByRole("textbox", { name: "Edit Accepted clipboard row" }));
  await click(view.getByRole("button", { name: "Undo" }));
  assertHistory(view, 2, 0, 1);
  assert.equal(view.queryByRole("textbox", { name: "Edit Accepted clipboard row" }) === null, true);
});

test("rich scenario renders actual content and safe fallbacks while counter state is not a document edit", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "rich");
  assert.ok(view.getByRole("table"));
  assert.ok(view.getByText("Unsupported content: future-format. Data is preserved."));
  assert.equal(view.container.querySelector('img[src^="https://example.invalid"]'), null);
  await click(view.getByRole("button", { name: "Add one locally" }));
  assert.ok(view.getByText("Trusted React counter: 1"));
  assertHistory(view, 0, 0, 0);
  await click(view.getByRole("button", { name: "Export JSON" }));
  const exporter = await view.findByRole("dialog", { name: "Export outline JSON" });
  const nodes = createOutlineJSONCodec<LabData>().decode(
    exporter.querySelector("code")!.textContent!,
  );
  assert.deepEqual(nodes, labScenarios.find((item) => item.id === "rich")!.nodes);
  assert.equal(within(exporter).getAllByRole("button", { name: "Copy code" }).length, 1);
});

test("ordered F2 plugins compose on the lab editor and a protected transaction does not partially apply", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "intelligence");
  await enable(view);
  const input = view.getByRole("textbox", { name: "Edit Ask @research about the next idea" });
  await act(async () => fireEvent.keyDown(input, { key: "F2" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Reference: reviewed by primary" }));
  assertHistory(view, 1, 1, 0);
  await click(view.getByRole("checkbox", { name: "Fallback plugin first" }));
  await act(async () => fireEvent.keyDown(input, { key: "F2" }));
  assert.ok(view.getByRole("textbox", { name: "Edit Reference: reviewed by fallback" }));
  assertHistory(view, 2, 2, 0);
  await click(view.getByRole("checkbox", { name: "Protect reference" }));
  await click(view.getByRole("checkbox", { name: "Fallback plugin first" }));
  await act(async () => fireEvent.keyDown(input, { key: "F2" }));
  assert.ok(view.getByText("transaction: refused: locked."));
  assert.ok(view.getByRole("textbox", { name: "Edit Reference: reviewed by fallback" }));
  assertHistory(view, 2, 2, 0);
});

test("local @ suggestions are accepted explicitly and can be undone", async () => {
  const view = render(<OutlinerLab />);
  await scenario(view, "intelligence");
  await enable(view);
  const input = view.getByRole("textbox", {
    name: "Edit Type @ here to find a local reference",
  }) as HTMLTextAreaElement;
  await act(async () => {
    input.focus();
    fireEvent.change(input, { target: { value: "Ask @", selectionStart: 5, selectionEnd: 5 } });
  });
  await view.findByRole("listbox", { name: "Suggestions" });
  await act(async () => fireEvent.keyDown(input, { key: "Enter" }));
  await waitFor(() => assert.match(input.value, /^Ask @\w+/));
  await click(view.getByRole("button", { name: "Undo" }));
  assert.equal(input.value, "Ask @");
});

test("task-first lab puts its live document before optional guidance and trial policy chrome", () => {
  const view = render(<OutlinerLab />);
  const document = view.getByRole("region", { name: "Outliner lab document" });
  const policy = view.getByRole("group", { name: "Trial settings" });
  const guide = view.container.querySelector<HTMLDetailsElement>(".lab-guide")!;
  assert.equal(guide.open, false);
  assert.match(guide.querySelector("summary")!.textContent!, /Scenario guide/);
  assert.ok(document.compareDocumentPosition(policy) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(document.compareDocumentPosition(guide) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(view.getByRole("button", { name: "Expand all" }));
  assert.ok(view.getByRole("button", { name: "Reveal sample detail" }));
  assert.equal(
    (view.getByRole("checkbox", { name: "Enable editing" }) as HTMLInputElement).checked,
    false,
  );
});
