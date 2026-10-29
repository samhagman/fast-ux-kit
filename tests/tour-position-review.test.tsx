import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { arkAdvancedDemos } = await import("../examples/docs/demos/ark-advanced-demos.js");
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
function rule(css: string, selector: string) {
  const blocks = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const found = blocks.find((block) => block[1]!.trim() === selector);
  assert.ok(found, `Missing scoped rule: ${selector}`);
  return found[2]!;
}

// These are CSS/DOM contract regressions, not native viewport or clipping tests.
// Actual initial/targeted/narrow screenshots must verify geometry after the build.
test("Tour dialog steps receive viewport positioning while targeted steps keep owner coordinates", async () => {
  const view = render(arkAdvancedDemos.Tour!.render());
  await click(view.getByRole("button", { name: "Start guided tour" }));
  const welcome = await view.findByRole("alertdialog", { name: "A quick introduction" });
  const dialogPositioner = welcome.parentElement!;
  assert.ok(dialogPositioner.matches('.fux-tour__positioner[data-type="dialog"]'));
  assert.equal(
    dialogPositioner.style.position,
    "",
    "dialog placement is intentionally a skin responsibility",
  );
  const css = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  const dialog = rule(css, '.fux-tour__positioner[data-type="dialog"]');
  assert.match(dialog, /position:\s*fixed;/);
  assert.match(dialog, /inset:\s*0;/);
  assert.match(dialog, /display:\s*grid;/);
  assert.match(dialog, /place-items:\s*center;/);
  assert.match(dialog, /padding:\s*1rem;/);
  assert.match(dialog, /pointer-events:\s*none;/);
  const content = rule(css, '.fux-tour__content[data-type="dialog"]');
  assert.match(content, /pointer-events:\s*auto;/);
  await click(view.getByRole("button", { name: "Next step" }));
  const targeted = await view.findByRole("alertdialog", { name: "An ordinary action" });
  const targetPositioner = targeted.parentElement!;
  assert.ok(targetPositioner.matches('.fux-tour__positioner[data-type="tooltip"]'));
  assert.equal(targetPositioner.style.position, "absolute");
  assert.equal(targetPositioner.matches('.fux-tour__positioner[data-type="dialog"]'), false);
  await waitFor(() => assert.ok(targetPositioner.style.getPropertyValue("--x")));
  assert.ok(targetPositioner.style.getPropertyValue("--available-height"));
  assert.match(targetPositioner.style.transform, /translate3d\(var\(--x\), var\(--y\), 0\)/);
  assert.equal(targetPositioner.style.zIndex, "var(--z-index)");
  const constrained = rule(css, '.fux-tour__content[data-type="tooltip"]');
  assert.match(constrained, /max-block-size:\s*min\(var\(--available-height,/);
  assert.match(constrained, /min-block-size:\s*0;/);
  assert.match(constrained, /overflow-y:\s*auto;/);
  assert.doesNotMatch(constrained, /(?:position|inset|transform|top|left):/);
});

test("Tour skin defines the owner's layer token and retains viewport-bounded scrollable content", () => {
  const css = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  const base = rule(css, ".fux-tour__positioner");
  assert.match(base, /--tour-z-index:\s*var\(--fux-z-modal\);/);
  assert.match(base, /z-index:\s*calc\(var\(--tour-layer,\s*2\)\s*\+\s*var\(--tour-z-index\)\);/);
  assert.doesNotMatch(
    base,
    /(?:position|inset|transform|top|left):/,
    "do not override tooltip owner geometry",
  );
  const specialized = readFileSync(
    new URL("../src/components/ark-specialized.css", import.meta.url),
    "utf8",
  );
  assert.match(specialized, /max-inline-size:\s*min\(24rem,\s*calc\(100vw - 2rem\)\);/);
  const advanced = readFileSync(
    new URL("../src/components/ark-advanced.css", import.meta.url),
    "utf8",
  );
  const content = rule(advanced, ".fux-tour__content");
  assert.match(content, /max-block-size:\s*calc\(100dvh - 2rem\);/);
  assert.match(content, /overflow-y:\s*auto;/);
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 40));
  });

test("demo restores its opener on Close, Escape and completion, and supports restart", async () => {
  for (const method of ["close", "escape", "complete"] as const) {
    const view = render(arkAdvancedDemos.Tour!.render());
    const opener = view.getByRole("button", { name: "Start guided tour" });
    act(() => opener.focus());
    await click(opener);
    await view.findByRole("alertdialog", { name: "A quick introduction" });
    await settle();
    if (method === "close") await click(view.getByRole("button", { name: /close tour/i }));
    if (method === "escape") {
      await act(async () => fireEvent.keyDown(view.getByRole("alertdialog"), { key: "Escape" }));
    }
    if (method === "complete") {
      await click(view.getByRole("button", { name: "Next step" }));
      await view.findByRole("alertdialog", { name: "An ordinary action" });
      await click(view.getByRole("button", { name: "Next step" }));
      await view.findByRole("alertdialog", { name: "You are ready" });
      await click(view.getByRole("button", { name: "Finish tour" }));
    }
    await waitFor(() => assert.equal(view.queryByRole("alertdialog") === null, true));
    await waitFor(() => assert.equal(document.activeElement === opener, true, method));
    await click(opener);
    await view.findByRole("alertdialog", { name: "A quick introduction" });
    assert.match(view.getByText(/^Tour:/).textContent ?? "", /started/);
    view.unmount();
  }
});

test("demo closing does not steal focus from the user's meaningful target outside the popup", async () => {
  const view = render(arkAdvancedDemos.Tour!.render());
  await click(view.getByRole("button", { name: "Start guided tour" }));
  await view.findByRole("alertdialog", { name: "A quick introduction" });
  await click(view.getByRole("button", { name: "Next step" }));
  await view.findByRole("alertdialog", { name: "An ordinary action" });
  await settle();
  const target = view.getByRole("button", { name: "Example action" });
  act(() => target.focus());
  assert.equal(document.activeElement === target, true);
  await act(async () => fireEvent.keyDown(target, { key: "Escape" }));
  await waitFor(() => assert.equal(view.queryByRole("alertdialog") === null, true));
  await settle();
  assert.equal(document.activeElement === target, true);
});

test("Code-style demo unmount removes Tour portals without delayed opener focus restoration", async () => {
  const view = render(
    <>
      <button type="button">Code view</button>
      {arkAdvancedDemos.Tour!.render()}
    </>,
  );
  const code = view.getByRole("button", { name: "Code view" });
  await click(view.getByRole("button", { name: "Start guided tour" }));
  await view.findByRole("alertdialog", { name: "A quick introduction" });
  await settle();
  // Model the documentation's conditional demo unmount, not browser Tab traversal.
  view.rerender(
    <>
      <button type="button">Code view</button>
    </>,
  );
  act(() => code.focus());
  await settle();
  assert.equal(view.queryByRole("alertdialog") === null, true);
  assert.equal(document.querySelector(".fux-tour__backdrop") === null, true);
  assert.equal(document.querySelector(".fux-tour__positioner") === null, true);
  assert.equal(document.activeElement === code, true);
});
