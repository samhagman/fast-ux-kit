import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { dom, browserErrors } from "./components-dom.js";
Object.defineProperty(dom.window, "scrollTo", { value() {}, configurable: true });
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const { ComponentGallery, galleryEntries } = await import("../examples/docs/component-gallery.js");
const { DocsApp, componentId } = await import("../examples/docs/App.js");
const { componentManifest } = await import("../src/components/manifest.js");

afterEach(async () => {
  await act(async () => {
    cleanup();
    dom.window.history.replaceState(null, "", "/");
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught gallery errors");
});

async function gallery() {
  const view = render(<ComponentGallery />);
  await waitFor(() => assert.ok(view.getByRole("button", { name: "Save changes" })), {
    timeout: 10000,
  });
  return view;
}

test("the gallery is one complete family row with direct documentation links, not full docs", async () => {
  const view = await gallery();
  const ribbon = view.container.querySelector(".gallery-ribbon")!;
  assert.equal(ribbon.children.length, componentManifest.length);
  assert.equal(componentManifest.length, 86);
  assert.equal(new Set(galleryEntries.map((entry) => entry.name)).size, componentManifest.length);
  for (const entry of componentManifest) {
    const tile = ribbon.querySelector<HTMLElement>(`[data-family="${entry.name}"]`)!;
    assert.ok(tile, `${entry.name} has its own tile`);
    assert.ok(within(tile).getByRole("heading", { name: entry.name, level: 2 }));
    assert.equal(
      within(tile)
        .getByRole("link", { name: `${entry.name} documentation` })
        .getAttribute("href"),
      `#${componentId(entry.name)}`,
    );
  }
  assert.equal(
    view.container.querySelectorAll(".code-block, .demo-toolbar, .parts-grid").length,
    0,
  );
  assert.equal(view.queryByRole("button", { name: "Copy code" }), null);
  assert.equal(view.getAllByRole("option").length, componentManifest.length);
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("gallery previews are interactive and reset independently without removing a family", async () => {
  const view = await gallery();
  const tile = view.container.querySelector<HTMLElement>('[data-family="Button"]')!;
  fireEvent.click(within(tile).getByRole("button", { name: "Save changes" }));
  assert.ok(within(tile).getByText(/Saved 1 times/));
  fireEvent.click(within(tile).getByRole("button", { name: "Reset Button preview" }));
  assert.ok(within(tile).getByText(/Saved 0 times/));
  assert.equal(view.container.querySelectorAll(".gallery-tile").length, componentManifest.length);
});

test("distant previews release while the last focused preview keeps its local interaction", async () => {
  const view = await gallery();
  const select = view.getByRole("combobox", { name: "Jump to component" });
  const buttonTile = view.container.querySelector<HTMLElement>('[data-family="Button"]')!;
  const save = within(buttonTile).getByRole("button", { name: "Save changes" });
  act(() => save.focus());
  fireEvent.click(save);
  fireEvent.change(select, { target: { value: "Panel" } });
  assert.ok(within(buttonTile).getByText(/Saved 1 times/), "last focused demo remains mounted");
  assert.equal(
    view.container.querySelector('[data-family="IconButton"]')?.hasAttribute("data-live"),
    false,
    "unvisited distant neighbors are released",
  );
  assert.ok(view.container.querySelectorAll(".gallery-tile[data-live]").length <= 5);
  fireEvent.change(select, { target: { value: "Checkbox" } });
  act(() => view.getByRole("group", { name: "Checkbox preview" }).focus());
  assert.equal(within(buttonTile).queryByRole("button", { name: "Save changes" }), null);
  fireEvent.change(select, { target: { value: "Button" } });
  await waitFor(() => assert.ok(within(buttonTile).getByText(/Saved 0 times/)));
  assert.equal(view.container.querySelectorAll(".gallery-tile").length, 86);
});

test("category jumps focus a named preview and component jumps preserve full coverage", async () => {
  const view = await gallery();
  const categoryNav = view.getByRole("navigation", { name: "Component categories" });
  fireEvent.click(within(categoryNav).getByRole("button", { name: "Color" }));
  assert.equal(document.activeElement, view.getByRole("heading", { name: "ColorArea" }));
  assert.equal(
    within(categoryNav).getByRole("button", { name: "Color" }).getAttribute("aria-pressed"),
    "true",
  );
  const select = view.getByRole("combobox", { name: "Jump to component" });
  fireEvent.change(select, { target: { value: "ModalDialog" } });
  await waitFor(() => assert.ok(view.getByRole("button", { name: "Review changes" })));
  assert.match(view.container.querySelector(".gallery-position")?.textContent ?? "", /ModalDialog/);
  assert.equal(view.container.querySelectorAll(".gallery-tile").length, componentManifest.length);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Review changes" })));
  assert.ok(view.getByRole("dialog", { name: "Review changes" }));
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Done" })));
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
});

test("gallery keys navigate in logical direction only when the gallery itself is focused", async () => {
  const view = await gallery();
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  const select = view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement;
  const previous = view.getByRole("button", { name: "Previous component" }) as HTMLButtonElement;
  const next = view.getByRole("button", { name: "Next component" }) as HTMLButtonElement;
  assert.equal(previous.disabled, true);
  fireEvent.keyDown(region, { key: "ArrowRight" });
  assert.equal(select.value, galleryEntries[1]!.name);
  fireEvent.keyDown(region, { key: "End" });
  assert.equal(select.value, galleryEntries.at(-1)!.name);
  assert.equal(next.disabled, true);
  fireEvent.keyDown(region, { key: "Home" });
  assert.equal(select.value, galleryEntries[0]!.name);
  region.style.direction = "rtl";
  fireEvent.keyDown(region, { key: "ArrowLeft" });
  assert.equal(select.value, galleryEntries[1]!.name);
  fireEvent.keyDown(region, { key: "ArrowRight" });
  assert.equal(select.value, galleryEntries[0]!.name);
  fireEvent.keyDown(region, { key: "ArrowLeft", ctrlKey: true });
  assert.equal(select.value, galleryEntries[0]!.name);
  fireEvent.change(select, { target: { value: "Field" } });
  await waitFor(() => assert.ok(view.getByRole("textbox", { name: "Project name" })));
  const field = view.getByRole("textbox", { name: "Project name" });
  fireEvent.keyDown(field, { key: "ArrowRight" });
  assert.equal(select.value, "Field", "the input retains its own arrow-key behavior");
});

test("native gallery scroll selects the nearest family and remembers physical RTL offsets", async () => {
  const changes: { name: string; scrollLeft: number }[] = [];
  const view = render(<ComponentGallery onPositionChange={(position) => changes.push(position)} />);
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  const rect = (left: number, right: number) => ({
    x: left,
    y: 0,
    left,
    right,
    top: 0,
    bottom: 400,
    width: right - left,
    height: 400,
    toJSON() {},
  });
  region.style.direction = "rtl";
  region.getBoundingClientRect = () => rect(0, 700);
  for (const [index, tile] of [
    ...view.container.querySelectorAll<HTMLElement>(".gallery-tile"),
  ].entries())
    tile.getBoundingClientRect = () => rect(350 - (index - 4) * 350, 700 - (index - 4) * 350);
  region.scrollLeft = -1400;
  fireEvent.scroll(region);
  await waitFor(() => assert.equal(changes.at(-1)?.name, galleryEntries[4]!.name));
  assert.equal(changes.at(-1)?.scrollLeft, -1400);
  const next = view.getByRole("button", { name: "Next component" });
  fireEvent.click(next);
  assert.equal(region.scrollLeft, -1750, "jump follows native RTL negative offsets");
});

test("the last gallery location survives component documentation and back/forward routes", async () => {
  dom.window.history.replaceState(null, "", "/#components");
  const view = render(<DocsApp />);
  await waitFor(() => assert.ok(view.getByRole("button", { name: "Save changes" })), {
    timeout: 10000,
  });
  const select = view.getByRole("combobox", { name: "Jump to component" });
  fireEvent.change(select, { target: { value: "ColorWheel" } });
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  region.scrollLeft = 2500;
  act(() => view.getByRole("heading", { name: "ColorWheel", level: 2 }).focus());
  await act(async () => {
    dom.window.history.pushState(null, "", "/#color-wheel");
    dom.window.dispatchEvent(new dom.window.HashChangeEvent("hashchange"));
  });
  await waitFor(() => assert.ok(view.getByRole("heading", { name: "ColorWheel", level: 1 })));
  assert.ok(view.getByRole("button", { name: "Copy code" }));
  await act(async () => dom.window.history.back());
  await waitFor(() => assert.ok(view.getByRole("heading", { name: "All components", level: 1 })));
  assert.equal(
    (view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement).value,
    "ColorWheel",
  );
  assert.equal(
    view.getByRole("region", { name: "Interactive component gallery" }).scrollLeft,
    2500,
  );
  await act(async () => dom.window.history.forward());
  await waitFor(() => assert.ok(view.getByRole("heading", { name: "ColorWheel", level: 1 })));
  assert.equal(document.title, "ColorWheel — Fast UX Kit");
});

test("the gallery layout owns horizontal overflow, full targets, logical spacing and reduced motion", () => {
  const css = readFileSync(new URL("../examples/docs/gallery.css", import.meta.url), "utf8");
  assert.match(css, /\.gallery-ribbon\s*\{[^}]*display:\s*flex/s);
  assert.doesNotMatch(css.match(/\.gallery-ribbon\s*\{([^}]+)\}/)?.[1] ?? "", /flex-wrap:\s*wrap/);
  assert.match(css, /\.gallery-viewport\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(
    css,
    /\.gallery-preview\s*\{[^}]*position:\s*relative/s,
    "positioned assistive content must stay in its own scrolling preview",
  );
  assert.match(css, /\.gallery-jump select\s*\{[^}]*min-block-size:\s*44px/s);
  assert.match(css, /\.gallery-categories button\s*\{[^}]*min-block-size:\s*44px/s);
  assert.match(css, /\.gallery-action\s*\{[^}]*min-block-size:\s*44px/s);
  assert.match(css, /:dir\(rtl\)/);
  assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /@media\s*\(forced-colors:\s*active\)/);
  assert.doesNotMatch(css, /(?:margin|padding|border)-(?:left|right)\s*:/);
});
