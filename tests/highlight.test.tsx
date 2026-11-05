import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { renderToString } from "react-dom/server";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://highlight.test/",
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
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
] as const)
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
for (const name of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const)
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name].bind(dom.window),
  });
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
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { HighlightText } = await import("../src/react/HighlightText.js");
afterEach(cleanup);

test("source-based highlights preserve text, Unicode/RTL, literal HTML, and render no controls by default", () => {
  const text = "مرحبا 🧭 <script>not executable</script> world";
  const view = render(
    <HighlightText
      text={text}
      highlights={[
        { key: "arabic", start: 0, end: 5, tone: "reference", label: "Greeting" },
        { key: "emoji", start: 6, end: 8 },
      ]}
      className="app-text"
    />,
  );
  assert.equal(view.container.textContent, text);
  assert.equal(view.container.querySelector("script"), null);
  assert.equal(view.container.querySelectorAll("mark").length, 2);
  assert.equal(view.queryByRole("button"), null);
  assert.ok(view.container.querySelector(".app-text"));
  assert.equal(view.container.querySelector("[data-tone]")?.getAttribute("data-tone"), "reference");
});

test("overlaps are flat, narrowest-first, and selectedKey overrides deterministic precedence", () => {
  const text = "abcdefghij";
  const highlights = [
    { key: "wide", start: 0, end: 10 },
    { key: "narrow", start: 2, end: 5 },
    { key: "later", start: 3, end: 8 },
  ];
  const view = render(<HighlightText text={text} highlights={highlights} />);
  assert.equal(view.container.textContent, text);
  assert.equal(view.container.querySelector("mark mark"), null);
  assert.equal(
    [...view.container.querySelectorAll('[data-highlight-key="narrow"]')]
      .map((element) => element.textContent)
      .join(""),
    "cde",
  );
  view.rerender(<HighlightText text={text} highlights={highlights} selectedKey="wide" />);
  assert.equal(view.container.querySelectorAll("mark").length, 1);
  assert.equal(view.container.querySelector("mark")?.getAttribute("data-selected"), "true");
  assert.equal(view.container.textContent, text);
});

test("each overlapping highlight has one keyboard stop including fully covered ranges", () => {
  const calls: string[] = [];
  const text = "abcdefghij";
  const highlights = [
    { key: "wide", start: 0, end: 10, label: "Whole token" },
    { key: "same", start: 0, end: 10, label: "Alternate token" },
    { key: "narrow", start: 2, end: 5, label: "Inner token" },
  ];
  const view = render(
    <HighlightText
      text={text}
      highlights={highlights}
      onActivate={(key, range) => {
        assert.equal(range.key, key);
        calls.push(key);
      }}
    />,
  );
  assert.equal(view.container.textContent, text);
  assert.equal(view.container.querySelector("button button"), null);
  const tabbable = view
    .getAllByRole("button")
    .filter((button) => button.getAttribute("tabindex") !== "-1");
  assert.equal(tabbable.length, 3);
  assert.equal(
    new Set(tabbable.map((button) => button.getAttribute("data-highlight-key"))).size,
    3,
  );
  const button = view.getByRole("button", { name: "Alternate token" });
  act(() => button.focus());
  fireEvent.keyDown(button, { key: "Enter", code: "Enter", charCode: 13 });
  // jsdom does not synthesize the native click produced by keyboard activation.
  fireEvent.click(button);
  fireEvent.keyUp(button, { key: "Enter", code: "Enter", charCode: 13 });
  fireEvent.keyDown(button, { key: " ", code: "Space", charCode: 32 });
  fireEvent.keyUp(button, { key: " ", code: "Space", charCode: 32 });
  fireEvent.click(button);
  assert.deepEqual(calls, ["same", "same"]);
  assert.equal(document.activeElement, button);
  fireEvent.click(view.getByRole("button", { name: "Inner token" }));
  assert.deepEqual(calls, ["same", "same", "narrow"]);
});

test("invalid and duplicate ranges are ignored without modifying source or accepted ranges", () => {
  const text = "0123456789";
  const highlights = Object.freeze([
    Object.freeze({ key: "valid", start: 1, end: 3 }),
    Object.freeze({ key: "valid", start: 5, end: 8 }),
    Object.freeze({ key: "negative", start: -1, end: 3 }),
    Object.freeze({ key: "reversed", start: 5, end: 3 }),
    Object.freeze({ key: "empty", start: 1, end: 1 }),
    Object.freeze({ key: "fraction", start: 1.5, end: 3 }),
    Object.freeze({ key: "outside", start: 3, end: 99 }),
  ]);
  const before = JSON.stringify(highlights);
  const view = render(<HighlightText text={text} highlights={highlights} />);
  assert.equal(view.container.textContent, text);
  assert.equal(view.container.querySelectorAll("mark").length, 1);
  assert.equal(view.container.querySelector("mark")?.textContent, "12");
  assert.equal(JSON.stringify(highlights), before);
});

test("action selection is controlled and does not invent edits; SSR output deterministic", () => {
  const highlights = [
    { key: "a", start: 0, end: 3, label: "Alpha" },
    { key: "b", start: 4, end: 7, label: "Beta" },
  ];
  const selected: string[] = [];
  const props = { text: "one two", highlights, onActivate: (key: string) => selected.push(key) };
  const view = render(<HighlightText {...props} selectedKey="a" />);
  fireEvent.click(view.getByRole("button", { name: "Beta" }));
  assert.deepEqual(selected, ["b"]);
  assert.equal(view.getByRole("button", { name: "Alpha" }).getAttribute("aria-pressed"), "true");
  view.rerender(<HighlightText {...props} selectedKey="b" />);
  assert.equal(view.getByRole("button", { name: "Beta" }).getAttribute("aria-pressed"), "true");
  assert.equal(view.container.textContent, "one two");
  assert.equal(
    renderToString(<HighlightText {...props} selectedKey="b" />),
    renderToString(<HighlightText {...props} selectedKey="b" />),
  );
});
