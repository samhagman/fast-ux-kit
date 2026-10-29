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
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught showcase errors");
});

async function at(route: string) {
  dom.window.history.replaceState(null, "", `/#${route}`);
  const view = render(<DocsApp />);
  await waitFor(
    () => assert.equal(Boolean(view.container.querySelector(".example-loading")), false),
    {
      timeout: 10000,
    },
  );
  return view;
}

async function follow(link: HTMLElement) {
  await act(async () => {
    fireEvent.click(link);
    // Let the browser-like hash navigation finish; do not replace the route manually.
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  await waitFor(() => assert.equal(Boolean(document.querySelector(".example-loading")), false), {
    timeout: 10000,
  });
}

test("overview offers the lab and complete component catalog before the live composition", async () => {
  const view = await at("overview");
  const main = view.getByRole("main");
  const primary = within(main).getByRole("link", { name: "Open the outliner lab" });
  const components = within(main).getByRole("link", { name: "Explore all components" });
  assert.equal(primary.getAttribute("href"), "#outliner-lab");
  assert.equal(components.getAttribute("href"), "#components");
  assert.ok(primary.classList.contains("primary-link"));
  const composition = view.getByRole("button", { name: "Try an action" });
  assert.ok(primary.compareDocumentPosition(composition) & Node.DOCUMENT_POSITION_FOLLOWING);
  assert.ok(components.compareDocumentPosition(composition) & Node.DOCUMENT_POSITION_FOLLOWING);
  const pathway = within(main).getByRole("region", { name: "A document, not a dashboard." });
  assert.equal(within(pathway).getAllByRole("listitem").length, 3);
  assert.equal(within(pathway).getByRole("link").getAttribute("href"), "#outliner-lab");
  assert.equal(main.querySelector("textarea"), null, "overview remains read-first");
});

test("capability map makes the requested features and their actual routes discoverable", async () => {
  const view = await at("overview");
  const map = view.getByRole("region", { name: "Follow a feature all the way through." });
  assert.deepEqual(
    within(map)
      .getAllByRole("term")
      .map((term) => term.textContent),
    [
      "One styled component system",
      "Read, fold and navigate",
      "Edit, structure and history",
      "Policy and interchange",
      "Rich documents and embeds",
      "Plugins and text intelligence",
    ],
  );
  const destinations = new Set(
    [...map.querySelectorAll<HTMLAnchorElement>("a")].map((link) => link.hash.slice(1)),
  );
  for (const id of [
    "components",
    "system-coverage",
    "color-picker",
    "tokens",
    "outline",
    "outliner-lab",
    "editor",
    "rich-content",
    "outliner-extensions",
    "text-intelligence",
    "highlight-text",
    "accessibility",
  ]) {
    assert.ok(destinations.has(id), `${id} is directly linked`);
  }
  for (const id of destinations) assert.ok(allPages.some((page) => page.id === id));
  assert.match(map.textContent!, /not server authorization/);
  assert.match(map.textContent!, /not a lossless arbitrary-Markdown codec/);
  assert.match(map.textContent!, /Physical Android\/iOS, IME and assistive-technology/);
  assert.match(map.textContent!, /unverified gates/);
  assert.match(map.textContent!, /not a claim of complete parity or release readiness/);
});

test("the promoted Outliner group preserves every individually named component and color route", async () => {
  const view = await at("overview");
  const nav = view.getByRole("navigation", { name: "Documentation" });
  const groups = within(nav).getAllByRole("heading", { level: 2 });
  assert.deepEqual(
    groups.slice(0, 3).map((heading) => heading.textContent),
    ["Get started", "Foundations", "Outliner"],
  );
  assert.equal(
    within(nav).getByRole("link", { name: "Outliner lab" }).getAttribute("href"),
    "#outliner-lab",
  );
  for (const entry of componentManifest) {
    assert.equal(
      within(nav).getByRole("link", { name: entry.name }).getAttribute("href"),
      `#${componentId(entry.name)}`,
    );
  }
  const color = within(nav).getByRole("region", { name: "Color" });
  assert.equal(within(color).getAllByRole("link").length, 7);
  assert.equal(new Set(allPages.map((page) => page.id)).size, allPages.length);
});

test("feature search finds the lab without replacing the named component navigation", async () => {
  const view = await at("overview");
  const nav = view.getByRole("navigation", { name: "Documentation" });
  const search = within(nav).getByRole("searchbox", { name: "Find a component" });
  for (const feature of ["policy", "history", "plugins", "intelligence"]) {
    fireEvent.change(search, { target: { value: feature } });
    assert.ok(within(nav).getByRole("link", { name: "Outliner lab" }), feature);
  }
  fireEvent.change(search, { target: { value: "ColorWheel" } });
  assert.ok(within(nav).getByRole("link", { name: "ColorWheel" }));
  fireEvent.change(search, { target: { value: "" } });
  assert.ok(within(nav).getByRole("link", { name: "Outliner lab" }));
  assert.ok(within(nav).getByRole("link", { name: "Button" }));
});

test("the primary link opens the standalone lazy lab and supports leaving and returning", async () => {
  const view = await at("overview");
  await follow(view.getByRole("link", { name: "Open the outliner lab" }));
  const heading = await view.findByRole("heading", { name: "Outliner lab", level: 1 });
  assert.equal(dom.window.location.hash, "#outliner-lab");
  assert.equal(document.title, "Outliner lab — Fast UX Kit");
  await waitFor(() => assert.equal(document.activeElement === heading, true));
  const nav = view.getByRole("navigation", { name: "Documentation" });
  assert.equal(
    within(nav).getByRole("link", { name: "Outliner lab" }).getAttribute("aria-current"),
    "page",
  );
  assert.equal(view.queryByRole("heading", { name: "The page could not load" }), null);
  const workspace = view.getByRole("region", { name: "Live outliner workspace" });
  assert.equal(workspace.querySelectorAll("textarea").length, 0, "the document starts read-only");
  const notes = view.getByLabelText("Your local trial notes (avoid private data)");
  assert.equal(notes.closest("details")?.open, false, "trial notes are secondary and closed");
  await follow(within(nav).getByRole("link", { name: "Overview" }));
  assert.ok(view.getByRole("link", { name: "Open the outliner lab" }));
  await follow(within(nav).getByRole("link", { name: "Outliner lab" }));
  assert.ok(await view.findByRole("heading", { name: "Outliner lab", level: 1 }));
});

test("mobile navigation can find and open the lab, closing its navigation dialog", async () => {
  const view = await at("overview");
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Browse components" })));
  const modal = view.getByRole("dialog", { name: "Browse the system" });
  fireEvent.change(within(modal).getByRole("searchbox", { name: "Find a component" }), {
    target: { value: "outliner lab" },
  });
  await follow(within(modal).getByRole("link", { name: "Outliner lab" }));
  assert.ok(await view.findByRole("heading", { name: "Outliner lab", level: 1 }));
  await waitFor(() =>
    assert.equal(view.queryByRole("dialog", { name: "Browse the system" }), null),
  );
  assert.equal(dom.window.location.hash, "#outliner-lab");
});
