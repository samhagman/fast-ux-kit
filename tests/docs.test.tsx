import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";

// Browser globals must exist before React Aria's DOM feature checks initialize.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://reader.test/",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "NodeFilter",
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "EventTarget",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
for (const name of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name].bind(dom.window),
  });
}
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
// jsdom lacks CSS.escape; React Aria uses it when looking up CSP metadata.
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: {
    escape: (value: string) =>
      [...String(value)]
        .map((char) =>
          /[a-zA-Z0-9_-]/.test(char) ? char : `\\${char.codePointAt(0)!.toString(16)} `,
        )
        .join(""),
  },
});
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { DocsApp } = await import("../examples/docs/App.js");
afterEach(() => cleanup());

test("docs navigation filters sections and has unique working anchors", () => {
  const view = render(<DocsApp />);
  const ids = [...view.container.querySelectorAll("[id]")].map((el) => el.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const anchor of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    assert.ok(document.getElementById(anchor.hash.slice(1)), `target exists: ${anchor.hash}`);
  }
  fireEvent.change(view.getByRole("textbox", { name: "Find a section" }), {
    target: { value: "tokens" },
  });
  const nav = view.getByRole("navigation", { name: "Documentation" });
  assert.equal(nav.querySelectorAll("a").length, 1);
  assert.match(nav.textContent ?? "", /Design tokens/);
});

test("docs controls update only local demo state and switch theme", async () => {
  const view = render(<DocsApp />);
  fireEvent.click(view.getByRole("button", { name: "Primary action" }));
  assert.ok(view.getByText(/Demo actions: 1/));
  fireEvent.click(view.getByRole("button", { name: "Switch to dark theme" }));
  assert.equal(document.documentElement.dataset.theme, "dark");
  fireEvent.click(view.getByRole("button", { name: "Switch to light theme" }));
  assert.equal(document.documentElement.dataset.theme, "light");
  fireEvent.click(view.getByRole("button", { name: "Collapse all" }));
  assert.ok(view.getByText(/0 expanded branches/));
  fireEvent.click(view.getByRole("button", { name: "Expand all" }));
  assert.ok(view.getByText(/3 expanded branches/));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Next" }));
  });
  assert.ok(view.getByText("Showing page 2 of 5."));
});

test("docs editor is opt-in and clipboard failure has a manual fallback", async () => {
  const view = render(<DocsApp />);
  assert.equal(view.container.querySelectorAll(".editor-demo textarea").length, 0);
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  assert.ok(view.container.querySelectorAll(".editor-demo textarea").length > 0);
  fireEvent.click(view.getByRole("checkbox", { name: "Enable editing in this demo" }));
  assert.equal(view.container.querySelectorAll(".editor-demo textarea").length, 0);
  fireEvent.click(view.getAllByRole("button", { name: "Copy code" })[0]!);
  await waitFor(() => assert.ok(view.getByText(/Clipboard unavailable/)));
});

test("docs menu and dialog can be opened and dismissed repeatedly", async () => {
  const view = render(<DocsApp />);
  const menu = view.getByRole("button", { name: "Menu" });
  fireEvent.click(menu);
  assert.equal(menu.getAttribute("aria-expanded"), "true");
  fireEvent.click(view.getByRole("link", { name: "Design tokens" }));
  assert.equal(menu.getAttribute("aria-expanded"), "false");
  for (let index = 0; index < 2; index++) {
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Open dialog" }));
    });
    assert.ok(view.getByRole("dialog", { name: "A little more context" }));
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Close" }));
    });
    await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
  }
});
