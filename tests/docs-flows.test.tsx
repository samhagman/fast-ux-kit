import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
Object.defineProperty(dom.window, "scrollTo", { value() {}, configurable: true });
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { DocsApp } = await import("../examples/docs/App.js");
const { PageBoundary } = await import("../examples/docs/ui.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    dom.window.history.replaceState(null, "", "/");
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
async function at(id: string) {
  dom.window.history.replaceState(null, "", `/#${id}`);
  const view = render(<DocsApp />);
  await waitFor(
    () =>
      assert.equal(
        Boolean(view.queryByText(/Loading (interactive example|documentation)…/)),
        false,
      ),
    { timeout: 10000 },
  );
  return view;
}
function focus(input: HTMLTextAreaElement, offset: number) {
  act(() => {
    input.focus();
    input.setSelectionRange(offset, offset);
    fireEvent.select(input);
  });
}
test("selected-row controls expose atomic policy refusal, deletion and undo", async () => {
  const view = await at("editor");
  assert.equal(view.queryByRole("group", { name: "Selected rows" }), null);
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  const selection = view.getByRole("group", { name: "Selected rows" });
  assert.equal(
    (within(selection).getByRole("button", { name: "Delete selected" }) as HTMLButtonElement)
      .disabled,
    true,
  );
  fireEvent.click(within(selection).getByRole("button", { name: "Select all rows" }));
  fireEvent.click(within(selection).getByRole("button", { name: "Delete selected" }));
  assert.ok(view.getByText(/Action refused:/));
  assert.ok(view.getByRole("textbox", { name: "Edit A plan with room to grow" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Protect reference row" }));
  fireEvent.click(within(selection).getByRole("button", { name: "Delete selected" }));
  assert.equal(view.container.querySelectorAll(".editor-demo textarea").length, 0);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("textbox", { name: "Edit A plan with room to grow" }));
  assert.ok(view.getByRole("textbox", { name: "Edit A protected reference row" }));
});
test("document exports stay after the reading surface and open one explicit copy surface", async () => {
  const view = await at("editor"),
    reading = view.container.querySelector(".editor-demo")!,
    interchange = view.getByRole("region", { name: "Document interchange" });
  assert.ok(
    reading.compareDocumentPosition(interchange) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING,
  );
  assert.equal(view.queryByRole("dialog"), null);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Export JSON" })));
  const modal = view.getByRole("dialog", { name: "Export this local document" });
  assert.equal(within(modal).getAllByRole("button", { name: "Copy code" }).length, 1);
  assert.match(modal.textContent ?? "", /"version": 1/);
  await act(async () => fireEvent.click(within(modal).getByRole("button", { name: "Close" })));
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
});
test("Autocomplete filters a real collection and data utilities update local state", async () => {
  const view = await at("utility-autocomplete");
  const input = view.getByRole("searchbox", { name: "Find a note" });
  fireEvent.change(input, { target: { value: "research" } });
  await waitFor(() => assert.equal(view.getAllByRole("option").length, 1));
  fireEvent.click(view.getByRole("option", { name: "Research notes" }));
  assert.ok(view.getByText("Selected: Research notes"));
  view.unmount();
  const data = await at("utility-collections-and-data");
  fireEvent.click(data.getByRole("button", { name: "Add a note" }));
  assert.ok(data.getByRole("option", { name: "New note 1" }));
  fireEvent.click(data.getByRole("option", { name: "New note 1" }));
  fireEvent.click(data.getByRole("button", { name: "Remove selected" }));
  assert.equal(data.queryByRole("option", { name: "New note 1" }), null);
});
test("color parsing reports invalid values and locale context changes direction", async () => {
  const view = await at("utility-color-values"),
    input = view.getByRole("textbox", { name: "Color string" });
  assert.notEqual(input.getAttribute("aria-invalid"), "true");
  fireEvent.change(input, { target: { value: "not-a-color" } });
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(view.getByText(/No color is rendered/));
  fireEvent.change(input, { target: { value: "#112233" } });
  assert.notEqual(input.getAttribute("aria-invalid"), "true");
  assert.ok(view.getByText("#112233FF"));
  view.unmount();
  const locale = await at("utility-locale-and-routing");
  fireEvent.click(locale.getByRole("button", { name: "العربية" }));
  assert.equal(locale.container.querySelector(".locale-example")?.getAttribute("dir"), "rtl");
  assert.ok(locale.getByText("ar-AE · rtl"));
});
test("composition helpers preserve context ownership and disabled state", async () => {
  const view = await at("utility-composition-helpers");
  fireEvent.click(view.getByRole("button", { name: "First action" }));
  assert.ok(view.getByText("1 local actions"));
  fireEvent.click(view.getByRole("checkbox", { name: "Disable the composed actions" }));
  assert.equal(
    (view.getByRole("button", { name: "First action" }) as HTMLButtonElement).disabled,
    true,
  );
  assert.equal(
    (view.getByRole("button", { name: "Second action" }) as HTMLButtonElement).disabled,
    true,
  );
});
test("text intelligence exposes loading cancellation, unavailable fallback and diagnostics", async () => {
  const view = await at("text-intelligence");
  fireEvent.click(view.getByRole("checkbox", { name: "Enable the text intelligence playground" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Delay suggestions by 1.5 seconds" }));
  const input = view.getByRole("textbox", {
    name: "Edit Bring @design into the conversation",
  }) as HTMLTextAreaElement;
  focus(input, 8);
  await act(async () => fireEvent.keyDown(input, { key: " ", ctrlKey: true }));
  assert.ok(view.getByText("Loading suggestions"));
  await act(async () => fireEvent.keyDown(input, { key: "Escape" }));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1550)));
  assert.equal(view.queryByRole("listbox", { name: "Suggestions" }), null);
  assert.equal(view.queryByText("Loading suggestions"), null);
  fireEvent.click(view.getByRole("checkbox", { name: "Delay suggestions by 1.5 seconds" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Simulate unavailable suggestions" }));
  focus(input, 8);
  await act(async () => fireEvent.keyDown(input, { key: " ", ctrlKey: true }));
  await waitFor(() => assert.ok(view.getByText("Suggestions unavailable")));
  fireEvent.click(view.getByRole("button", { name: "Try a diagnostic" }));
  assert.ok(view.getByText(/This note is waiting for a next step\./));
});
test("mixed rich document keeps media inert until explicit playback and preserves fallback content", async () => {
  const view = await at("rich-content"),
    sample = view.container.querySelector(".rich-sample")!;
  assert.ok(within(sample as HTMLElement).getByRole("table"));
  assert.ok(sample.querySelector("video[controls]"));
  assert.ok(sample.querySelector("audio[controls]"));
  assert.equal(sample.querySelectorAll("[autoplay]").length, 0);
  assert.equal(sample.querySelectorAll("script,iframe").length, 0);
  assert.equal(sample.querySelector('img[src^="https:"]'), null);
  assert.match(
    sample.textContent ?? "",
    /Unsupported content: future-content\. Data is preserved\./,
  );
  assert.match(sample.textContent ?? "", /العربية/);
});
test("mobile navigation waits for a lazy page before focusing its heading", async () => {
  const view = await at("overview");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Browse components" })));
  const modal = view.getByRole("dialog", { name: "Browse the system" });
  const destination = within(modal).getByRole("link", { name: "Outliner extensions" });
  await act(async () => {
    fireEvent.click(destination);
    dom.window.history.pushState(null, "", "/#outliner-extensions");
    dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  });
  await waitFor(() => assert.equal(Boolean(view.queryByRole("dialog")), false));
  await waitFor(() =>
    assert.equal(
      document.activeElement ===
        view.getByRole("heading", { name: "Outliner extensions", level: 1 }),
      true,
    ),
  );
  assert.equal(document.title, "Outliner extensions — Fast UX Kit");
});
test("a failed page leaves an honest reload action rather than a blank document", () => {
  function BrokenModule(): never {
    throw new Error("Simulated unavailable module");
  }
  const view = render(
    <PageBoundary>
      <BrokenModule />
    </PageBoundary>,
  );
  assert.ok(view.getByRole("heading", { name: "The page could not load" }));
  assert.ok(view.getByRole("button", { name: "Reload documentation" }));
  assert.ok(view.getByText(/Reloading resets temporary example state/));
});
test("global component search does not steal focus from an active modal owner", async () => {
  const view = await at("editor");
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Import document" })));
  const modal = view.getByRole("dialog", { name: "Import a local document" });
  const input = within(modal).getByRole("textbox", { name: "Document to import" });
  const search = view.container.querySelector<HTMLInputElement>('#docs-nav input[type="search"]')!;
  let backgroundFocusAttempts = 0;
  const nativeFocus = search.focus;
  search.focus = () => {
    backgroundFocusAttempts++;
  };
  try {
    act(() => input.focus());
    fireEvent.keyDown(input, { key: "k", ctrlKey: true });
    assert.equal(backgroundFocusAttempts, 0);
    assert.equal(document.activeElement === input, true);
    assert.equal(view.getAllByRole("dialog").length, 1);
  } finally {
    search.focus = nativeFocus;
  }
});
