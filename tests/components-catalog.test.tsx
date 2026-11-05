import assert from "node:assert/strict";
import { after, afterEach, test } from "node:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { join } from "node:path";
import { createElement, type ComponentType } from "react";
import { build } from "esbuild";
import { browserErrors, dom } from "./components-dom.js";

const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = join(root, "node_modules/.cache");
await mkdir(cache, { recursive: true });
const scratch = await mkdtemp(join(cache, "component-catalog-"));
const output = join(scratch, "fixtures.mjs");
await build({
  entryPoints: [join(root, "studio/src/pages/components-page.tsx")],
  outfile: output,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2022",
  packages: "external",
  alias: { "@samhagman/fast-ux-kit/components": join(root, "src/components/index.tsx") },
  jsx: "automatic",
  logLevel: "silent",
});
interface Fixture {
  Component: ComponentType;
  selector: string;
  actions: readonly {
    target: string;
    event: string;
    value?: string;
    expect: string;
    text?: string;
  }[];
}
const { componentFixtures, ComponentsPage } = (await import(pathToFileURL(output).href)) as {
  componentFixtures: Record<string, Fixture>;
  ComponentsPage: ComponentType;
};
const catalog = JSON.parse(await readFile(join(root, "src/components/catalog.json"), "utf8")) as {
  name: string;
}[];
class PointerEventStub extends dom.window.MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
Object.defineProperty(dom.window, "PointerEvent", { configurable: true, value: PointerEventStub });
Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: PointerEventStub });
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
Object.defineProperty(dom.window.Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (media: string) => ({
    media,
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }),
});

Object.defineProperty(dom.window.HTMLCanvasElement.prototype, "getContext", {
  configurable: true,
  value: () => null,
});
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: async () => {} },
});

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
after(async () => {
  await rm(scratch, { recursive: true, force: true });
});

test("every canonical family has one working gallery fixture", () => {
  assert.equal(catalog.length, 86);
  assert.deepEqual(
    Object.keys(componentFixtures).sort(),
    catalog.map((entry) => entry.name).sort(),
  );
});

for (const entry of catalog) {
  test(`component gallery exercises ${entry.name}`, async () => {
    const fixture = componentFixtures[entry.name]!;
    const view = render(createElement(fixture.Component));
    const query = (selector: string) =>
      view.container.querySelector(selector) ?? document.querySelector(selector);
    await waitFor(() => assert.ok(query(fixture.selector), `rendered ${fixture.selector}`));
    for (const action of fixture.actions) {
      const element = query(action.target) as HTMLElement;
      assert.ok(element, `action target ${action.target}`);
      await act(async () => {
        if (action.event === "click") {
          element.focus();
          fireEvent.click(element);
        }
        if (action.event === "input")
          fireEvent.change(element, { target: { value: action.value } });
        if (action.event === "key") {
          element.focus();
          fireEvent.keyDown(element, { key: action.value });
          fireEvent.keyUp(element, { key: action.value });
        }
        if (action.event === "focus") {
          fireEvent.keyDown(document.body, { key: "Tab" });
          element.focus();
          fireEvent.focus(element);
        }
        if (action.event === "hover") {
          fireEvent.pointerEnter(element, { pointerType: "mouse" });
          fireEvent.mouseOver(element);
          fireEvent.mouseEnter(element);
          fireEvent.mouseMove(element);
        }
        if (action.event === "file")
          fireEvent.change(element, {
            target: {
              files: [
                new dom.window.File(["Synthetic test content"], "example.txt", {
                  type: "text/plain",
                }),
              ],
            },
          });
      });
      await waitFor(
        () => {
          const result = query(action.expect);
          assert.ok(result, `result ${action.expect}`);
          if (action.text)
            assert.ok(
              result.textContent?.includes(action.text),
              `${action.expect} contains ${action.text}`,
            );
        },
        { timeout: 2500 },
      );
    }
    if (entry.name === "Tooltip") {
      const tooltip = document.querySelector('[role="tooltip"]');
      const trigger = view.container.querySelector("button");
      assert.ok(
        tooltip?.id && trigger?.getAttribute("aria-describedby")?.split(/\s+/).includes(tooltip.id),
        "tooltip describes its trigger",
      );
    }
  });
}

test("gallery filtering and navigation keep the selected family usable", async () => {
  const view = render(createElement(ComponentsPage));
  assert.ok(view.getByRole("heading", { name: "Component library" }));
  assert.equal(view.container.querySelectorAll("[data-family]").length, 86);
  await act(async () => {
    fireEvent.change(view.getByRole("searchbox"), { target: { value: "ColorWheel" } });
  });
  assert.equal(view.container.querySelectorAll("[data-family]").length, 1);
  await act(async () => {
    fireEvent.click(view.container.querySelector('[data-family="ColorWheel"]')!);
  });
  assert.ok(view.getByRole("heading", { name: "ColorWheel" }));
  assert.ok(view.getByRole("slider", { name: "Hue wheel" }));
});
