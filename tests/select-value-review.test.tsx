import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { Select, Primitives } = await import("../src/components/aria.js");
const options = [
  { id: "draft", label: "Draft", description: "Keep working privately" },
  { id: "review", label: "Review", description: "Ready for feedback" },
  { id: "done", label: "Done", description: "Finished work" },
];
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
const valueElement = (view: ReturnType<typeof render>) =>
  view.container.querySelector<HTMLElement>(".fux-select__value")!;
async function click(element: Element) {
  await act(async () => {
    fireEvent.click(element);
  });
}

test("collapsed Select renders only the selected label while list options retain descriptions", async () => {
  const view = render(<Select label="Status" options={options} defaultValue="draft" />);
  assert.equal(valueElement(view).textContent, "Draft");
  assert.equal(
    valueElement(view).querySelector(".fux-hint"),
    null,
    "the trigger does not inherit option description styles",
  );
  await click(view.getByRole("button", { name: "Draft Status" }));
  const option = view.getByRole("option", { name: "Review" });
  assert.ok(within(option).getByText("Ready for feedback"));
  await click(option);
  assert.equal(valueElement(view).textContent, "Review");
});

test("Select preserves the owner's default and custom empty-selection placeholders", () => {
  const view = render(
    <Primitives.I18nProvider locale="en-US">
      <Select label="Empty" options={options} value={null} />
    </Primitives.I18nProvider>,
  );
  assert.equal(valueElement(view).textContent, "Select an item");
  assert.equal(valueElement(view).hasAttribute("data-placeholder"), true);
  view.rerender(
    <Primitives.I18nProvider locale="en-US">
      <Select label="Empty" options={options} value={null} placeholder="Choose a status" />
    </Primitives.I18nProvider>,
  );
  assert.equal(valueElement(view).textContent, "Choose a status");
  assert.equal(valueElement(view).hasAttribute("data-placeholder"), true);
});

test("multi Select joins selected text values through the owner and retains its open-on-selection behavior", async () => {
  const changes: (string | number)[][] = [];
  const view = render(
    <Primitives.I18nProvider locale="en-US">
      <Select
        label="Statuses"
        options={options}
        selectionMode="multiple"
        defaultValue={["draft", "review"]}
        onChange={(keys) => changes.push(keys)}
      />
    </Primitives.I18nProvider>,
  );
  const formatter = new Intl.ListFormat("en-US", { type: "conjunction" });
  assert.equal(valueElement(view).textContent, formatter.format(["Draft", "Review"]));
  await click(view.getByRole("button", { name: /Statuses/ }));
  await click(view.getByRole("option", { name: "Done" }));
  assert.deepEqual(changes.at(-1), ["draft", "review", "done"]);
  assert.equal(valueElement(view).textContent, formatter.format(["Draft", "Review", "Done"]));
  assert.ok(view.getByRole("listbox"), "multi selection remains open by default");
});

test("controlled multi selection waits for host acceptance and respects locale list punctuation", async () => {
  const changes: (string | number)[][] = [];
  const view = render(
    <Primitives.I18nProvider locale="es-ES">
      <Select
        label="Estados"
        options={options}
        selectionMode="multiple"
        value={["draft"]}
        onChange={(keys) => changes.push(keys)}
      />
    </Primitives.I18nProvider>,
  );
  await click(view.getByRole("button", { name: /Estados/ }));
  await click(view.getByRole("option", { name: "Review" }));
  assert.deepEqual(changes.at(-1), ["draft", "review"]);
  assert.equal(valueElement(view).textContent, "Draft");
  view.rerender(
    <Primitives.I18nProvider locale="es-ES">
      <Select
        label="Estados"
        options={options}
        selectionMode="multiple"
        value={["draft", "review"]}
      />
    </Primitives.I18nProvider>,
  );
  assert.equal(
    valueElement(view).textContent,
    new Intl.ListFormat("es-ES", { type: "conjunction" }).format(["Draft", "Review"]),
  );
  view.rerender(
    <Primitives.I18nProvider locale="es-ES">
      <Select
        label="Estados"
        options={options}
        selectionMode="multiple"
        value={[]}
        placeholder="Elige estados"
      />
    </Primitives.I18nProvider>,
  );
  assert.equal(valueElement(view).textContent, "Elige estados");
  assert.equal(valueElement(view).hasAttribute("data-placeholder"), true);
});

test("replaced labels update selected text without leaking old or new descriptions", () => {
  const view = render(<Select label="Status" options={options} value="draft" />);
  view.rerender(
    <Select
      label="Status"
      options={[{ id: "draft", label: "Private draft", description: "Updated explanation" }]}
      value="draft"
    />,
  );
  assert.equal(valueElement(view).textContent, "Private draft");
});

// Selection mode retains the owner's dependent value and callback types.
const invalidSingle = (
  // @ts-expect-error Explicit single selection does not accept an array value.
  <Select selectionMode="single" label="Single" options={options} value={["draft"]} />
);
const invalidMultiple = (
  // @ts-expect-error Explicit multiple selection requires an array, not a scalar value.
  <Select selectionMode="multiple" label="Many" options={options} value="draft" />
);
void [invalidSingle, invalidMultiple];
