import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors, dom } from "./components-dom.js";
const { act, cleanup, render } = await import("@testing-library/react");
const { UtilityPage } = await import("../examples/docs/utilities.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

test("virtualizer scrollport removes collection padding without concealing overflow", () => {
  const view = render(<UtilityPage id="utility-virtualizer" />);
  const viewport = view.getByRole("listbox", { name: "Five hundred notes" }) as HTMLElement;
  // Layout owns virtual item widths. Extra CSS padding on its measured scrollport
  // adds overflow even for short labels. This verifies the declaration contract;
  // jsdom cannot certify real scrollWidth/clientWidth or virtual scrolling.
  assert.equal(viewport.style.padding, "0px");
  assert.equal(viewport.style.overflow, "auto");
  assert.equal(viewport.style.height, "260px");
  assert.ok(viewport.classList.contains("fux-collection"));
  const code = [...view.container.querySelectorAll(".code-block code")]
    .map((element) => element.textContent)
    .join("\n");
  assert.match(code, /style=\{\{ height: 260, overflow: "auto", padding: 0 \}\}/);
  assert.doesNotMatch(code, /overflow(?:X)?: "hidden"/);
});

test("nonvirtual collection demo retains shared collection spacing", () => {
  const view = render(<UtilityPage id="utility-collections-and-data" />);
  const collection = view.getByRole("listbox", { name: "Editable notes" }) as HTMLElement;
  assert.ok(collection.classList.contains("fux-collection"));
  assert.equal(collection.style.padding, "");
  assert.equal(collection.style.overflowX, "");
});
