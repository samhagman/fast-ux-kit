import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { build } from "esbuild";
import { browserErrors, dom } from "./components-dom.js";

const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(root, "node_modules/.cache");
await mkdir(cache, { recursive: true });
const scratch = await mkdtemp(join(cache, "editorial-gallery-"));
const output = join(scratch, "fixtures.mjs");
await build({
  entryPoints: [join(root, "studio/src/pages/editorial-gallery.tsx")],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  packages: "external",
  alias: { "@samhagman/fast-ux-kit/editorial": join(root, "src/editorial/index.ts") },
  jsx: "automatic",
  logLevel: "silent",
});
interface Fixture {
  Component: ComponentType;
  selector: string;
}
const { editorialFixtures, EditorialSpecimen } = (await import(pathToFileURL(output).href)) as {
  editorialFixtures: Record<string, Fixture>;
  EditorialSpecimen: ComponentType;
};
const catalog = JSON.parse(await readFile(join(root, "src/editorial/catalog.json"), "utf8")) as {
  name: string;
}[];
Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    media,
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }),
});

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

test("every editorial family has one gallery fixture", () => {
  assert.equal(catalog.length, 35);
  assert.deepEqual(
    Object.keys(editorialFixtures).sort(),
    catalog.map((entry) => entry.name).sort(),
  );
});

for (const entry of catalog) {
  test(`editorial gallery renders ${entry.name}`, async () => {
    const fixture = editorialFixtures[entry.name]!;
    const view = render(createElement(fixture.Component));
    assert.ok(view.container.querySelector(fixture.selector), `rendered ${fixture.selector}`);
    assert.equal(view.container.querySelector("[style]"), null, "no inline styles");
  });
}

test("the explorable's sentence follows its controls", async () => {
  const view = render(createElement(editorialFixtures.Explorable!.Component));
  const readout = () => view.container.querySelector(".fux-explorable-readout")!.textContent;
  assert.match(readout()!, /typical reader gets through 920 words in about 4 minutes/);
  await act(async () => {
    fireEvent.click(view.container.querySelector('input[value="fast"]')!);
  });
  assert.match(readout()!, /fast reader gets through 920 words in about 3 minutes/);
  await act(async () => {
    fireEvent.change(view.container.querySelector('input[type="range"]')!, {
      target: { value: "1600" },
    });
  });
  assert.match(readout()!, /1600 words in about 5 minutes/);
});

test("a walkthrough marks the lines of the step a reader picks", async () => {
  const view = render(createElement(editorialFixtures.CodeWalkthrough!.Component));
  const marked = () =>
    [...view.container.querySelectorAll(".fux-code-line[data-marked]")].map((line) =>
      line.getAttribute("data-line"),
    );
  assert.deepEqual(marked(), ["1", "2", "3", "4", "5"]);
  await act(async () => {
    fireEvent.click(view.container.querySelectorAll(".fux-walkthrough-pick")[1]!);
  });
  assert.deepEqual(marked(), ["7", "8", "9"]);
  assert.equal(
    view.container.querySelector('.fux-playback-toggle[aria-pressed="true"]'),
    null,
    "picking a step pauses playback",
  );
});

test("the specimen article composes the families into one page", () => {
  const view = render(createElement(EditorialSpecimen));
  assert.equal(view.container.querySelectorAll(".fux-figure[data-numbered]").length, 3);
  // The Studio page owns the h1, so the specimen's headline is an h2 and the page has one h1.
  assert.equal(view.container.querySelectorAll("h1").length, 0);
  assert.equal(view.container.querySelector(".fux-headline")?.tagName, "H2");
  assert.ok(view.container.querySelector(".fux-status"));
});
