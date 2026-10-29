import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
for (const key of ["HTMLIFrameElement", "HTMLAnchorElement", "ShadowRoot", "Range"] as const)
  Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
const frameWindow = Object.getOwnPropertyDescriptor(
  dom.window.HTMLIFrameElement.prototype,
  "contentWindow",
)!;
Object.defineProperty(dom.window.HTMLIFrameElement.prototype, "contentWindow", {
  configurable: true,
  get() {
    const win = frameWindow.get!.call(this);
    if (win && !win.ResizeObserver) win.ResizeObserver = globalThis.ResizeObserver;
    return win;
  },
});
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { arkUtilityDemos } = await import("../examples/docs/demos/ark-utility-demos.js");
const { componentUtilities } = await import("../src/components/manifest.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
test("optional infrastructure catalog has an actual example for every documented group", () => {
  assert.deepEqual(
    Object.keys(arkUtilityDemos).sort(),
    componentUtilities
      .filter((item) => item.exportName === "/ark")
      .map((item) => item.name)
      .sort(),
  );
});
for (const [name, demo] of Object.entries(arkUtilityDemos)) {
  test(`${name} utility composition renders server and client content`, () => {
    assert.ok(renderToString(demo.render()).length > 0);
    const view = render(demo.render());
    assert.ok(view.container.textContent?.trim());
  });
}

test("locale provider updates formatted output without changing the underlying amount", async () => {
  const view = render(arkUtilityDemos["Optional owner environment"]!.render());
  assert.ok(view.getByText("€1,234.56"));
  await act(async () => {
    fireEvent.change(view.getByRole("combobox", { name: "Formatting locale" }), {
      target: { value: "de-DE" },
    });
  });
  assert.ok(view.getByText(/1\.234,56/));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Open isolated preview" }));
  });
  assert.equal(view.getByTitle("Isolated document preview").tagName, "IFRAME");
});

test("collection filtering operates on data without additional selectable controls", async () => {
  const view = render(arkUtilityDemos["Optional collections"]!.render());
  assert.ok(view.getByText("3 items: Draft, Review, Done"));
  await act(async () => {
    fireEvent.change(view.getByRole("textbox", { name: "Filter collection" }), {
      target: { value: "rev" },
    });
  });
  assert.ok(view.getByText("1 items: Review"));
  assert.equal(view.queryByRole("listbox"), null);
});

test("presence and local portal content share visibility without remounting the destination", async () => {
  const view = render(arkUtilityDemos["Mounting and presence"]!.render());
  const destination = view.getByLabelText("Local portal destination") as HTMLDivElement;
  assert.equal(destination.hidden, true);
  assert.equal(destination.textContent, "");
  assert.equal(getComputedStyle(destination).display, "none");
  for (let cycle = 0; cycle < 2; cycle++) {
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Show mounted content" }));
    });
    assert.ok(view.getByText("Presence-controlled content"));
    assert.equal(view.getByLabelText("Local portal destination"), destination);
    assert.equal(destination.hidden, false);
    assert.notEqual(getComputedStyle(destination).display, "none");
    assert.equal(destination.childElementCount, 1);
    assert.ok(destination.textContent?.includes("Content rendered into the local portal"));
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Hide mounted content" }));
    });
    await waitFor(() => assert.ok(view.queryByText("Presence-controlled content") === null));
    assert.equal(view.getByLabelText("Local portal destination"), destination);
    assert.equal(destination.hidden, true);
    assert.equal(getComputedStyle(destination).display, "none");
    assert.equal(destination.textContent, "");
    assert.equal(destination.childElementCount, 0);
  }
});

test("focus utility only activates explicitly and offers a direct exit", async () => {
  const view = render(arkUtilityDemos["Mounting and presence"]!.render());
  const start = view.getByRole("button", { name: "Start focus exercise" });
  await act(async () => {
    start.focus();
    fireEvent.click(start);
  });
  await waitFor(() =>
    assert.ok(view.getByRole("group", { name: "Focus exercise" }).contains(document.activeElement)),
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Finish focus exercise" }));
  });
  assert.ok(view.getByText("The focus exercise is inactive."));
  await waitFor(() => assert.ok(document.activeElement === start));
});

test("highlight treats query text as text and updates the visible marks", async () => {
  const view = render(arkUtilityDemos["Formatting and text"]!.render());
  assert.equal(view.container.querySelectorAll("mark").length, 2);
  await act(async () => {
    fireEvent.change(view.getByRole("textbox", { name: "Highlight query" }), {
      target: { value: "structure" },
    });
  });
  assert.equal(view.container.querySelectorAll("mark").length, 1);
  assert.equal(view.container.querySelector("mark")?.textContent, "structure");
});

test("hotkey is opt-in, scoped, and ignored while typing in a text input", async () => {
  const view = render(arkUtilityDemos["Optional hotkeys"]!.render());
  const region = view.getByRole("group", { name: "Shortcut practice area" });
  async function press(target: Element) {
    await act(async () => {
      fireEvent.keyDown(target, { key: "K", code: "KeyK", shiftKey: true });
      fireEvent.keyUp(target, { key: "K", code: "KeyK", shiftKey: true });
    });
  }
  await act(async () => {
    region.focus();
  });
  await press(region);
  assert.ok(view.getByText("Shortcut activated 0 times"));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Enable local shortcut" }));
    region.focus();
  });
  await press(region);
  assert.ok(view.getByText("Shortcut activated 1 times"));
  const input = view.getByRole("textbox", { name: "Typing stays ordinary" });
  await act(async () => {
    input.focus();
  });
  await press(input);
  assert.ok(view.getByText("Shortcut activated 1 times"));
  await press(document.body);
  assert.ok(view.getByText("Shortcut activated 1 times"));
});
