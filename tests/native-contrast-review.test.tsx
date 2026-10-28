import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { HighlightText } = await import("../src/react/HighlightText.js");
const { Breadcrumbs, Primitives } = await import("../src/components/aria.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});
const highlights = [
  { key: "a", start: 0, end: 3, label: "First phrase" },
  { key: "b", start: 4, end: 7, label: "Second phrase" },
];

test("noninteractive highlights expose selected styling only for the selected range", () => {
  const view = render(<HighlightText text="one two" highlights={highlights} selectedKey="a" />);
  assert.equal(view.container.textContent, "one two");
  assert.equal(view.container.querySelectorAll("button").length, 0);
  assert.equal(view.container.querySelectorAll("mark[data-selected]").length, 1);
  assert.equal(view.container.querySelector("mark[data-selected]")?.textContent, "one");
  view.rerender(<HighlightText text="one two" highlights={highlights} />);
  assert.equal(view.container.querySelectorAll("[data-selected]").length, 0);
});

test("inline highlight actions keep false aria-pressed without false selected-style markers", async () => {
  const activations: string[] = [];
  const props = { text: "one two", highlights, onActivate: (key: string) => activations.push(key) };
  const view = render(<HighlightText {...props} />);
  const first = view.getByRole("button", { name: "First phrase" });
  const second = view.getByRole("button", { name: "Second phrase" });
  assert.equal(first.getAttribute("aria-pressed"), "false");
  assert.equal(second.getAttribute("aria-pressed"), "false");
  assert.equal(view.container.querySelectorAll("[data-selected]").length, 0);
  await act(async () => fireEvent.click(first));
  assert.deepEqual(activations, ["a"]);
  assert.equal(first.hasAttribute("data-selected"), false, "selection stays host controlled");
  view.rerender(<HighlightText {...props} selectedKey="a" />);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.equal(first.hasAttribute("data-selected"), true);
  assert.equal(second.hasAttribute("data-selected"), false);
  assert.equal(view.container.textContent, "one two");
});

test("fully occluded highlight actions follow the same selected-state marker contract", () => {
  const ranges = [
    { key: "front", start: 0, end: 3, label: "Front range" },
    { key: "covered", start: 0, end: 3, label: "Covered range" },
  ];
  const view = render(<HighlightText text="one" highlights={ranges} onActivate={() => {}} />);
  const extra = view.getByRole("button", { name: "Covered range" });
  assert.ok(extra.classList.contains("fux-highlight--extra"));
  assert.equal(extra.getAttribute("aria-pressed"), "false");
  assert.equal(extra.hasAttribute("data-selected"), false);
  view.rerender(
    <HighlightText text="one" highlights={ranges} selectedKey="covered" onActivate={() => {}} />,
  );
  assert.equal(view.container.querySelectorAll("[data-selected]").length, 1);
  assert.equal(
    view.getByRole("button", { name: "Covered range" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    view.getByRole("button", { name: "Front range" }).hasAttribute("data-selected"),
    false,
  );
  assert.equal(view.container.textContent, "one");
});

// Source-level cascade safeguards: jsdom is not a native CSS/contrast/layout engine.
// Native screenshots remain the acceptance gate for actual computed typography and paint.
function ruleContaining(css: string, selector: string) {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  const rule = rules.find((match) =>
    match[1]!
      .split(",")
      .map((part) => part.trim())
      .includes(selector),
  );
  assert.ok(rule, `Missing scoped CSS rule: ${selector}`);
  return { selectors: rule[1]!.trim(), body: rule[2]! };
}

test("inline highlight skin outranks generic button selection without replacing inherited typography", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const base = ruleContaining(css, "button.fux-control.fux-highlight");
  assert.match(base.body, /color:\s*inherit;/);
  assert.match(base.body, /font:\s*inherit;/);
  assert.match(base.body, /border:\s*0;/);
  assert.match(base.body, /background:\s*var\(--fux-highlight\);/);
  const selected = ruleContaining(css, "button.fux-control.fux-highlight[data-selected]");
  assert.match(selected.body, /background:\s*var\(--fux-selected\);/);
  assert.doesNotMatch(selected.body, /(?:color|font-size|font-weight):/);
  const focus = ruleContaining(css, "button.fux-control.fux-highlight[data-focus-visible]");
  assert.match(focus.body, /outline:\s*2px solid var\(--fux-focus\);/);
  assert.ok(css.indexOf(focus.selectors) > css.indexOf(selected.selectors));
});

test("breadcrumb current-page semantics stay owner-managed while dimming exemption stays narrowly scoped", () => {
  const view = render(
    <>
      <Breadcrumbs
        items={[
          { id: "home", label: "Home", href: "#home" },
          { id: "here", label: "Here" },
        ]}
      />
      <Primitives.Link isDisabled href="#unavailable">
        Unavailable link
      </Primitives.Link>
    </>,
  );
  const current = view.getByText("Here");
  assert.equal(current.getAttribute("aria-current"), "page");
  assert.equal(current.getAttribute("aria-disabled"), "true");
  assert.equal(current.hasAttribute("data-disabled"), true);
  assert.equal(current.closest("li")?.hasAttribute("data-current"), true);
  assert.equal(current.closest("li")?.hasAttribute("data-disabled"), true);
  assert.equal(view.getByText("Home").hasAttribute("data-disabled"), false);
  assert.equal(view.getByText("Unavailable link").hasAttribute("data-disabled"), true);
  const css = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  for (const selector of [
    ".fux-breadcrumbs__item[data-current]",
    ".fux-breadcrumbs__item[data-current] .fux-link[data-current]",
  ]) {
    const scoped = ruleContaining(css, selector);
    assert.match(scoped.body, /opacity:\s*1;/);
    assert.match(scoped.body, /cursor:\s*default;/);
    assert.ok(
      scoped.selectors
        .split(",")
        .every((part) => part.includes(".fux-breadcrumbs__item[data-current]")),
    );
  }
  assert.match(
    css,
    /opacity:\s*var\(--fux-disabled-opacity\);/,
    "general disabled dimming remains",
  );
});
