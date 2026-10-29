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

test("the responsive catalog retains every family and direct documentation link, not full docs", async () => {
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

test("native vertical gallery scroll selects the nearest family and remembers its position in RTL", async () => {
  const changes: { name: string; scrollLeft: number; scrollTop?: number }[] = [];
  const view = render(<ComponentGallery onPositionChange={(position) => changes.push(position)} />);
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  const rect = (top: number, bottom: number) => ({
    x: 0,
    y: top,
    left: 0,
    right: 700,
    top,
    bottom,
    width: 700,
    height: bottom - top,
    toJSON() {},
  });
  region.style.direction = "rtl";
  region.getBoundingClientRect = () => rect(0, 700);
  for (const [index, tile] of [
    ...view.container.querySelectorAll<HTMLElement>(".gallery-tile"),
  ].entries())
    tile.getBoundingClientRect = () => rect((index - 4) * 400, (index - 4) * 400 + 400);
  region.scrollTop = 1600;
  fireEvent.scroll(region);
  await waitFor(() => assert.equal(changes.at(-1)?.name, galleryEntries[4]!.name));
  assert.equal(changes.at(-1)?.scrollTop, 1600);
  assert.equal(changes.at(-1)?.scrollLeft, 0);
  fireEvent.click(view.getByRole("button", { name: "Next component" }));
  assert.equal(region.scrollTop, 2000, "vertical jump is direction-independent");
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
  region.scrollTop = 2500;
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
  assert.equal(view.getByRole("region", { name: "Interactive component gallery" }).scrollTop, 2500);
  await act(async () => dom.window.history.forward());
  await waitFor(() => assert.ok(view.getByRole("heading", { name: "ColorWheel", level: 1 })));
  assert.equal(document.title, "ColorWheel — Fast UX Kit");
});

test("the gallery layout uses a responsive vertical grid, full targets and reduced motion", () => {
  const css = readFileSync(new URL("../examples/docs/gallery.css", import.meta.url), "utf8");
  assert.match(css, /\.gallery-ribbon\s*\{[^}]*display:\s*grid/s);
  assert.match(css, /grid-template-columns:\s*repeat\(auto-fit/);
  assert.match(css, /\.gallery-viewport\s*\{[^}]*overflow-y:\s*auto/s);
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

test("catalog search jumps to a match without filtering any family and reports no matches", async () => {
  const view = await gallery();
  const search = view.getByRole("searchbox", { name: "Find in catalog" });
  fireEvent.change(search, { target: { value: "ColorWheel" } });
  fireEvent.click(view.getByRole("button", { name: "Find component" }));
  assert.equal(document.activeElement, view.getByRole("heading", { name: "ColorWheel", level: 2 }));
  assert.equal(view.container.querySelectorAll(".gallery-tile").length, 86);
  assert.match(
    view.container.querySelector(".gallery-find-status")!.textContent!,
    /1 matching family/,
  );
  fireEvent.change(search, { target: { value: "no-such-component-987" } });
  assert.equal(
    (view.getByRole("button", { name: "Find component" }) as HTMLButtonElement).disabled,
    true,
  );
  assert.match(
    view.container.querySelector(".gallery-find-status")!.textContent!,
    /0 matching families/,
  );
  fireEvent.change(search, { target: { value: "" } });
  assert.equal(
    (view.getByRole("button", { name: "Find component" }) as HTMLButtonElement).disabled,
    false,
  );
});

test("application compositions include a live outliner and a consumer-owned Machine View slot", async () => {
  const view = render(
    <ComponentGallery machinePreview={<button type="button">Inspect sample machine</button>} />,
  );
  assert.ok(view.getByRole("heading", { name: "Outliner", level: 2 }));
  assert.ok(view.getByRole("heading", { name: "Machine View", level: 2 }));
  assert.equal(
    view.getByRole("link", { name: "Open outliner lab" }).getAttribute("href"),
    "#outliner-lab",
  );
  assert.equal(
    view.getByRole("link", { name: "Open Machine View" }).getAttribute("href"),
    "#machine-view",
  );
  assert.ok(view.getByRole("button", { name: "Inspect sample machine" }));
  await waitFor(() =>
    assert.ok(view.getByRole("region", { name: "Interactive documentation outline" })),
  );
});

test("vertical catalog keys do not steal keys from preview controls", async () => {
  const view = await gallery();
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  const select = view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement;
  fireEvent.keyDown(region, { key: "ArrowDown" });
  assert.equal(select.value, galleryEntries[1]!.name);
  fireEvent.keyDown(region, { key: "ArrowUp" });
  assert.equal(select.value, galleryEntries[0]!.name);
  fireEvent.keyDown(view.getByRole("button", { name: "Save changes" }), { key: "ArrowDown" });
  assert.equal(select.value, galleryEntries[0]!.name);
});

test("finding multiple matches advances without removing unmatched cards", async () => {
  const view = await gallery();
  fireEvent.change(view.getByRole("searchbox", { name: "Find in catalog" }), {
    target: { value: "color" },
  });
  fireEvent.click(view.getByRole("button", { name: "Find component" }));
  const select = view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement;
  const first = select.value;
  fireEvent.click(view.getByRole("button", { name: "Next match" }));
  assert.notEqual(select.value, first);
  assert.equal(view.container.querySelectorAll(".gallery-tile").length, componentManifest.length);
});

test("vertical positions and search restore while legacy horizontal positions remain compatible", async () => {
  const view = render(
    <ComponentGallery
      initialPosition={{ name: "ColorWheel", scrollLeft: 0, scrollTop: 1800, query: "color" }}
    />,
  );
  assert.equal(view.getByRole("region", { name: "Interactive component gallery" }).scrollTop, 1800);
  assert.equal(
    (view.getByRole("searchbox", { name: "Find in catalog" }) as HTMLInputElement).value,
    "color",
  );
  assert.equal(
    (view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement).value,
    "ColorWheel",
  );
  view.unmount();
  const legacy = render(
    <ComponentGallery initialPosition={{ name: "Button", scrollLeft: 1400 }} />,
  );
  assert.equal(legacy.getByRole("region", { name: "Interactive component gallery" }).scrollTop, 0);
  assert.equal(
    (legacy.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement).value,
    "Button",
  );
});

test("scrolling a multi-column row does not replace its selected second family", async () => {
  const view = await gallery();
  const region = view.getByRole("region", { name: "Interactive component gallery" });
  const select = view.getByRole("combobox", { name: "Jump to component" }) as HTMLSelectElement;
  fireEvent.change(select, { target: { value: galleryEntries[1]!.name } });
  // jsdom rectangles all share a top edge, like two cards on the same grid row.
  fireEvent.scroll(region);
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
  assert.equal(select.value, galleryEntries[1]!.name);
});
