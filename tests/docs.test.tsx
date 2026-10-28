import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
Object.defineProperty(dom.window, "scrollTo", { value() {}, configurable: true });
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { DocsApp, allPages, componentId } = await import("../examples/docs/App.js");
const { componentManifest } = await import("../src/components/manifest.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    dom.window.history.replaceState(null, "", "/");
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught document errors");
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
async function navigate(id: string) {
  await act(async () => {
    dom.window.history.pushState(null, "", `/#${id}`);
    dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  });
  await waitFor(() => assert.equal(Boolean(document.querySelector(".example-loading")), false), {
    timeout: 10000,
  });
}
test("every family has a named left-nav page and a distinct stable route", async () => {
  const view = await at("overview"),
    nav = view.getByRole("navigation", { name: "Documentation" });
  assert.equal(new Set(allPages.map((page) => page.id)).size, allPages.length);
  for (const entry of componentManifest) {
    const link = within(nav).getByRole("link", { name: entry.name });
    assert.equal(link.getAttribute("href"), `#${componentId(entry.name)}`);
  }
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const anchor of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    assert.ok(
      anchor.hash === "#main" || allPages.some((page) => `#${page.id}` === anchor.hash),
      `registered route: ${anchor.hash}`,
    );
});
test("navigation search includes color families and composition parts, with an empty-state recovery", async () => {
  const view = await at("overview"),
    search = view.getByRole("searchbox", { name: "Find a component" }),
    nav = view.getByRole("navigation", { name: "Documentation" });
  fireEvent.change(search, { target: { value: "color" } });
  assert.ok(within(nav).getByRole("link", { name: "ColorPicker" }));
  assert.ok(within(nav).getByRole("link", { name: "ColorWheel" }));
  assert.equal(within(nav).queryByRole("link", { name: "Button" }), null);
  fireEvent.change(search, { target: { value: "CalendarCell" } });
  assert.ok(within(nav).getByRole("link", { name: "Calendar" }));
  fireEvent.change(search, { target: { value: "nothing-matches-this" } });
  assert.equal(nav.querySelectorAll("a").length, 0);
  fireEvent.click(within(nav).getByRole("button", { name: "Clear search" }));
  assert.equal((search as HTMLInputElement).value, "");
});
test("routes change content, title and current-page state without duplicating demos", async () => {
  const view = await at("overview");
  await navigate("color-picker");
  assert.ok(view.getByRole("heading", { name: "ColorPicker", level: 1 }));
  assert.equal(document.title, "ColorPicker — Fast UX Kit");
  assert.equal(
    view.getByRole("navigation", { name: "Documentation" }).querySelector('[aria-current="page"]')
      ?.textContent,
    "ColorPicker",
  );
  assert.equal(view.queryByRole("button", { name: "Try an action" }), null);
  await navigate("button");
  assert.ok(view.getByRole("button", { name: "Save changes" }));
  await navigate("overview");
  assert.ok(view.getByRole("button", { name: "Try an action" }));
});
test("overview actions and theme toggles update locally", async () => {
  const view = await at("overview");
  fireEvent.click(view.getByRole("button", { name: "Try an action" }));
  assert.ok(view.getByText("1 local action"));
  fireEvent.click(view.getByRole("button", { name: "Switch to dark theme" }));
  assert.equal(document.documentElement.dataset.theme, "dark");
  fireEvent.click(view.getByRole("button", { name: "Switch to light theme" }));
  assert.equal(document.documentElement.dataset.theme, "light");
});
test("component preview/code/reset and clipboard failure are usable", async () => {
  const view = await at("button");
  fireEvent.click(view.getByRole("button", { name: "Save changes" }));
  assert.ok(view.getByText(/Saved 1/));
  fireEvent.click(view.getByRole("button", { name: "Reset button example" }));
  assert.ok(view.getByText(/Saved 0/));
  fireEvent.click(view.getByRole("button", { name: "Code" }));
  assert.equal(view.queryByRole("button", { name: "Save changes" }), null);
  fireEvent.click(view.getAllByRole("button", { name: "Copy code" })[0]!);
  await waitFor(() => assert.ok(view.getByText(/Clipboard unavailable/)));
  fireEvent.click(view.getByRole("button", { name: "Preview" }));
  assert.ok(view.getByRole("button", { name: "Save changes" }));
});
test("mobile navigation is one dismissible modal and supports repeated use", async () => {
  const view = await at("overview"),
    trigger = view.getByRole("button", { name: "Browse components" });
  trigger.focus();
  for (let i = 0; i < 2; i++) {
    await act(async () => fireEvent.click(trigger));
    const modal = view.getByRole("dialog", { name: "Browse the system" });
    assert.equal(view.getAllByRole("dialog").length, 1);
    assert.ok(within(modal).getByRole("searchbox", { name: "Find a component" }));
    await act(async () =>
      fireEvent.click(within(modal).getByRole("button", { name: "Close navigation" })),
    );
    await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
    await waitFor(() => assert.equal(document.activeElement === trigger, true));
  }
});
test("reader folding never opens editing and reports local view state", async () => {
  const view = await at("outline");
  assert.equal(view.container.querySelectorAll("textarea").length, 0);
  fireEvent.click(view.getByRole("button", { name: "Collapse all" }));
  assert.ok(view.getByText(/0 expanded branches/));
  fireEvent.click(view.getByRole("button", { name: "Expand all" }));
  assert.ok(view.getByText(/4 expanded branches/));
  assert.ok(view.getByText(/0 document writes/));
});
test("editor import is gated, validated, reversible and can be dismissed", async () => {
  const view = await at("editor");
  assert.equal(view.container.querySelectorAll("textarea").length, 0);
  assert.equal(
    (view.getByRole("button", { name: "Import document" }) as HTMLButtonElement).disabled,
    true,
  );
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  assert.ok(view.container.querySelectorAll(".editor-demo textarea").length > 0);
  fireEvent.click(view.getByRole("checkbox", { name: "Protect reference row" }));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Import document" })));
  const modal = view.getByRole("dialog", { name: "Import a local document" });
  fireEvent.change(within(modal).getByRole("textbox", { name: "Document to import" }), {
    target: { value: "not JSON" },
  });
  fireEvent.click(within(modal).getByRole("button", { name: "Replace demo document" }));
  assert.ok(within(modal).getByRole("alert"));
  fireEvent.change(within(modal).getByRole("combobox", { name: "Format" }), {
    target: { value: "text" },
  });
  fireEvent.change(within(modal).getByRole("textbox", { name: "Document to import" }), {
    target: { value: "A fresh document\n  A useful detail" },
  });
  await act(async () =>
    fireEvent.click(within(modal).getByRole("button", { name: "Replace demo document" })),
  );
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
  assert.ok(view.getByRole("textbox", { name: "Edit A fresh document" }));
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("textbox", { name: "Edit A plan with room to grow" }));
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  assert.equal(view.container.querySelectorAll(".editor-demo textarea").length, 0);
});
test("rich playground demonstrates actual media, diagrams, React and safe fallbacks", async () => {
  const view = await at("rich-content");
  fireEvent.click(view.getByRole("button", { name: "Image" }));
  assert.equal(view.getByRole("img").getAttribute("src"), "./assets/field-study.svg");
  fireEvent.click(view.getByRole("button", { name: "Video" }));
  assert.ok(view.container.querySelector("video[controls] source"));
  fireEvent.click(view.getByRole("button", { name: "Diagram" }));
  assert.ok(view.getByRole("figure", { name: /design loop/ }));
  fireEvent.click(view.getByRole("button", { name: "React" }));
  fireEvent.click(view.getByRole("button", { name: "Start motion" }));
  assert.ok(view.getByRole("button", { name: "Pause motion" }));
  fireEvent.click(view.getByRole("button", { name: "Fallback" }));
  assert.ok(view.getByText(/image unavailable/));
  assert.equal(view.container.querySelector('img[src^="https:"]'), null);
});
for (const page of allPages)
  test(`documentation page ${page.name} mounts with a real heading and no missing demo`, async () => {
    const view = await at(page.id);
    assert.ok(view.getByRole("heading", { level: 1 }));
    assert.equal(
      Boolean(view.queryByText("This example could not render.")),
      false,
      `${page.name}: demo render boundary was reached`,
    );
    assert.equal(
      Boolean(view.queryByText("The example could not load")),
      false,
      `${page.name}: missing live example`,
    );
    const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
    assert.equal(new Set(ids).size, ids.length);
  });
