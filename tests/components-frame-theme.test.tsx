import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import * as React from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import * as Components from "../src/components/index.js";
import { themeScopeInputs, themeScopeProperties } from "../src/core/theme-scope.js";

void dom;
const { Frame, ThemeScope, RadioGroup, Checkbox, Switch, ToggleButton } = Components;
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const surfaces = read("components/surfaces.css");
const theme = read("components/theme.css");

/** The rules of a stylesheet whose selector matches, as [selector, body] pairs. */
function rules(css: string, selector: RegExp): [string, string][] {
  const found: [string, string][] = [];
  const plain = css.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of plain.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) {
    const head = match[1]!
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
    if (selector.test(head)) found.push([head, match[2]!]);
  }
  return found;
}
/** Custom property declarations in a rule body, with the custom properties each one reads. */
function declarations(body: string): [string, string[]][] {
  const found: [string, string[]][] = [];
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))
    found.push([match[1]!, [...match[2]!.matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]!)]);
  return found;
}

// --- Frame -----------------------------------------------------------------------------------

test("Frame draws a decorative browser bar with the URL as plain text", () => {
  const view = render(
    <Frame url="example.test/t/7Hq2" label="Task page mock-up">
      <h2>Approve the request</h2>
      <button type="button">Send</button>
    </Frame>,
  );
  const frame = view.container.querySelector('[data-slot="frame"]')!;
  assert.ok(frame.classList.contains("fux-frame"));
  assert.equal(frame.getAttribute("data-chrome"), "browser", "browser chrome is the default");
  assert.equal(view.getByRole("group", { name: "Task page mock-up" }), frame);
  const bar = frame.querySelector(".fux-frame-bar")!;
  assert.equal(bar.getAttribute("aria-hidden"), "true", "the bar is decoration");
  assert.equal(bar.querySelectorAll(".fux-frame-dots > span").length, 3);
  const address = bar.querySelector(".fux-frame-address")!;
  assert.equal(address.tagName, "SPAN", "the address is text, not a field");
  assert.equal(address.textContent, "example.test/t/7Hq2");
  assert.equal(address.getAttribute("dir"), "ltr", "a URL reads left to right in any page");
  assert.equal(bar.querySelectorAll("input, [contenteditable], [tabindex]").length, 0);
  const viewport = frame.querySelector('[data-slot="frame-viewport"]')!;
  assert.ok(viewport.classList.contains("fux-frame-viewport"));
  // The framed content keeps its own semantics: nothing hides or disables it.
  assert.ok(view.getByRole("heading", { name: "Approve the request" }));
  assert.ok(view.getByRole("button", { name: "Send" }));
  assert.equal(viewport.closest("[aria-hidden], [inert]"), null);
});

test("Frame with chrome none is only the framed surface; without a label it adds no role", () => {
  const view = render(
    <Frame chrome="none" className="mock" id="m">
      <p>Plain</p>
    </Frame>,
  );
  const frame = view.container.querySelector('[data-slot="frame"]')!;
  assert.equal(frame.getAttribute("data-chrome"), "none");
  assert.equal(frame.querySelector(".fux-frame-bar"), null);
  assert.equal(frame.getAttribute("role"), null);
  assert.equal(frame.getAttribute("aria-label"), null);
  assert.match(frame.className, /\bfux-frame\b.*\bmock\b/);
  assert.equal(frame.id, "m");
  assert.equal(frame.querySelector('[data-slot="frame-viewport"]')!.textContent, "Plain");
});

test("Frame without a URL keeps the bar and draws no empty address", () => {
  const view = render(<Frame label="A blank page" />);
  assert.ok(view.container.querySelector(".fux-frame-bar .fux-frame-dots"));
  assert.equal(view.container.querySelector(".fux-frame-address"), null);
});

test("Frame styles are tokens only, logical, and respond to the frame's own width", () => {
  const frame = surfaces.slice(0, surfaces.indexOf("ThemeScope"));
  assert.doesNotMatch(frame, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|oklab|lab|lch)a?\(/i);
  assert.doesNotMatch(
    frame,
    /(?:margin|padding|border)-(?:left|right|top|bottom)\b|\b(?:left|right|top|bottom)\s*:|text-align:\s*(?:left|right)/,
  );
  assert.match(frame, /\.fux-frame-bar\s*\{[^}]*container-type:\s*inline-size/);
  assert.match(frame, /@container \(max-width: 16rem\)/);
  assert.doesNotMatch(frame, /@media/, "no viewport queries");
});

// --- ThemeScope ------------------------------------------------------------------------------

test("themeScopeProperties writes given inputs verbatim under private names, in a fixed order", () => {
  assert.deepEqual(
    themeScopeProperties({
      selection: "var(--brand)",
      fg: "  #111  ",
      bg: "",
      radius: "0",
      onPrimary: "white",
    }),
    {
      properties: {
        "--fux-scope-fg": "#111",
        "--fux-scope-on-primary": "white",
        "--fux-scope-radius": "0",
        "--fux-scope-selection": "var(--brand)",
      },
      given: ["fg", "on-primary", "radius", "selection"],
    },
  );
  assert.equal(themeScopeInputs.length, 12);
  for (const [, property] of themeScopeInputs) assert.match(property, /^--fux-scope-[a-z-]+$/);
});

test("themeScopeProperties ignores a value that is not one CSS value", () => {
  const { properties, given } = themeScopeProperties({
    fg: "red; background: url(https://example.test/x)",
    bg: "white } .x { color: red",
    accent: "blue\n",
    primary: "oklch(0.5 0.1 250)",
  });
  assert.deepEqual(properties, { "--fux-scope-primary": "oklch(0.5 0.1 250)" });
  assert.deepEqual(given, ["primary"]);
});

test("ThemeScope puts the inputs on an outer element and maps them on the inner one", () => {
  const view = render(
    <ThemeScope
      tokens={{ fg: "var(--foreground)", bg: "var(--page-bg)", selection: "teal" }}
      className="mine"
      dir="rtl"
      data-testid="scope"
    >
      <p>Inside</p>
    </ThemeScope>,
  );
  const inner = view.getByTestId("scope");
  const outer = inner.parentElement!;
  assert.equal(outer.getAttribute("data-slot"), "theme-scope-inputs");
  assert.ok(outer.classList.contains("fux-theme-inputs"));
  assert.equal(outer.style.getPropertyValue("--fux-scope-fg"), "var(--foreground)");
  assert.equal(outer.style.getPropertyValue("--fux-scope-bg"), "var(--page-bg)");
  assert.equal(outer.style.getPropertyValue("--fux-scope-selection"), "teal");
  assert.equal(outer.style.length, 3, "the outer element sets only the given inputs");
  assert.equal(inner.getAttribute("data-slot"), "theme-scope");
  assert.match(inner.className, /\bfux-theme-scope\b.*\bmine\b/);
  assert.equal(inner.getAttribute("data-tokens"), "fg bg selection");
  assert.equal(inner.getAttribute("dir"), "rtl");
  assert.equal(inner.getAttribute("style"), null, "the inner element sets nothing inline");
  assert.equal(inner.textContent, "Inside");
});

test("ThemeScope with no inputs maps nothing", () => {
  const view = render(<ThemeScope tokens={{}} data-testid="scope" />);
  const inner = view.getByTestId("scope");
  assert.equal(inner.getAttribute("data-tokens"), null);
  assert.equal(inner.parentElement!.getAttribute("style"), null);
});

test("every input has a mapping rule, and no mapping can refer to itself", () => {
  const scoped = rules(surfaces, /^\.fux-theme-scope\b/);
  assert.ok(scoped.length > 0);
  for (const [, property] of themeScopeInputs) {
    const name = property.slice("--fux-scope-".length);
    assert.ok(
      scoped.some(([head]) => head.includes(`[data-tokens~="${name}"]`)),
      `${name} is mapped`,
    );
  }
  // The union of every rule is the worst case; if it has no cycle, no combination of inputs does.
  const graph = new Map<string, Set<string>>();
  for (const [, body] of scoped)
    for (const [property, reads] of declarations(body)) {
      assert.doesNotMatch(property, /^--fux-scope-/, `the inner element never sets ${property}`);
      const edges = graph.get(property) ?? new Set<string>();
      for (const read of reads) edges.add(read);
      graph.set(property, edges);
    }
  const state = new Map<string, "open" | "done">();
  const visit = (node: string, path: string[]) => {
    if (state.get(node) === "done") return;
    assert.notEqual(state.get(node), "open", `cycle: ${[...path, node].join(" -> ")}`);
    state.set(node, "open");
    for (const next of graph.get(node) ?? []) if (graph.has(next)) visit(next, [...path, node]);
    state.set(node, "done");
  };
  for (const node of graph.keys()) visit(node, []);
});

test("ThemeScope restates every token the kit derives at :root from a token it maps", () => {
  const mapped = new Set<string>();
  for (const [, body] of rules(surfaces, /^\.fux-theme-scope\b/))
    for (const [property] of declarations(body)) mapped.add(property);
  const roots = [read("tokens.css"), read("editorial/editorial.css"), theme]
    .flatMap((css) => rules(css, /^:root$/))
    .flatMap(([, body]) => declarations(body));
  for (const [property, reads] of roots)
    if (reads.some((name) => mapped.has(name)))
      assert.ok(mapped.has(property), `${property} is derived from a mapped token`);
});

test("ThemeScope's mappings are tokens only", () => {
  const scope = surfaces.slice(surfaces.indexOf("ThemeScope"));
  assert.doesNotMatch(scope, /#[0-9a-f]{3,8}\b|\b(?:rgb|hsl|oklch|lab|lch)a?\(/i);
});

test("a ThemeScope heading face reaches the kit's heading utility", () => {
  assert.match(theme, /--font-heading: var\(--fux-font-heading, var\(--font-sans\)\);/);
});

test("server markup hydrates unchanged", async () => {
  const tree = (
    <ThemeScope tokens={{ fg: "var(--foreground)", radius: "0", fontHead: '"Serif", serif' }}>
      <Frame url="example.test/t/7Hq2" label="Mock-up">
        <p>Body</p>
      </Frame>
      <Frame chrome="none">
        <p>Plain</p>
      </Frame>
    </ThemeScope>
  );
  const html = renderToString(tree);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.append(container);
  const server = container.innerHTML;
  assert.match(server, /data-tokens="fg radius font-head"/);
  assert.match(server, /--fux-scope-fg:var\(--foreground\)/);
  const recoverable: unknown[] = [];
  const consoleErrors: unknown[] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => void consoleErrors.push(args);
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(container, tree, {
        onRecoverableError: (error) => void recoverable.push(error),
      });
    });
  } finally {
    console.error = original;
  }
  assert.deepEqual(recoverable, []);
  assert.deepEqual(consoleErrors, []);
  assert.equal(container.innerHTML, server);
  await act(async () => root!.unmount());
  container.remove();
});

// --- Selection colour ------------------------------------------------------------------------

test("selected choices use the selection colour, which falls back to their old colours", () => {
  assert.match(theme, /--color-selection: var\(--selection, var\(--primary\)\);/);
  assert.match(
    theme,
    /--color-selection-foreground: var\(--selection-foreground, var\(--primary-foreground\)\);/,
  );
  assert.match(theme, /--color-selection-text: var\(--selection, var\(--signal\)\);/);
  assert.match(theme, /--color-selection-muted: var\(--selection-muted, var\(--signal-muted\)\);/);
  const view = render(
    <>
      <RadioGroup
        label="Answer"
        defaultValue="yes"
        options={[
          { id: "yes", label: "Yes" },
          { id: "no", label: "No" },
        ]}
      />
      <Checkbox label="Notify me" defaultChecked />
      <Switch label="Archive" defaultChecked />
      <ToggleButton defaultPressed aria-label="Bold">
        B
      </ToggleButton>
    </>,
  );
  const radio = view.getAllByRole("radio")[0]!;
  const checkbox = view.getByRole("checkbox");
  const toggle = view.getByRole("button", { name: "Bold" });
  const switchControl = view.getByRole("switch");
  const classes = (element: Element) => String(element.getAttribute("class"));
  for (const [name, element] of [
    ["radio", radio],
    ["checkbox", checkbox],
    ["switch", switchControl],
  ] as const) {
    assert.match(classes(element), /data-checked:bg-selection\b/, `${name} fills with selection`);
    assert.doesNotMatch(classes(element), /data-checked:(?:bg|border)-primary\b/, name);
  }
  assert.match(classes(radio), /data-checked:border-selection\b/);
  assert.match(classes(radio.querySelector("span")!), /\bbg-selection-foreground\b/);
  assert.match(classes(checkbox), /data-checked:text-selection-foreground\b/);
  assert.match(classes(toggle), /aria-pressed:text-selection-text\b/);
  assert.match(classes(toggle), /aria-pressed:bg-selection-muted\b/);
  assert.doesNotMatch(classes(toggle), /pressed:(?:bg|text)-signal/);
  assert.match(
    read("components/overlays-media.css"),
    /\.fux-sliding-group\[data-indicator\]::before \{\s*content: "";\s*background: var\(--selection-muted, var\(--signal-muted\)\);/,
  );
  assert.match(read("components/ui/field.tsx"), /has-data-checked:border-selection\/30/);
});

// --- Kit boundary ----------------------------------------------------------------------------

const boundary = (root: string) =>
  `:not(:where(${root} [data-kit-boundary], ${root} [data-kit-boundary] *))`;

test("the article's base element styles stop at a kit boundary, at the same specificity", () => {
  const editorial = read("editorial/editorial.css");
  const base = rules(editorial, /^\.fux-article :where\(/);
  assert.equal(base.length, 4, "the four base rules: block margins, links, link hover, focus");
  for (const [head] of base)
    assert.ok(head.includes(boundary(".fux-article")), `${head} ends at a boundary`);
});

test("rich content's element styles stop at a kit boundary, at the same specificity", () => {
  const styles = read("styles.css")
    .replace(/\s+/g, " ")
    .replace(/\(\s+/g, "(")
    .replace(/\s+\)/g, ")");
  const block = styles.indexOf(`.fast-ux-rich ${boundary(".fast-ux-rich")} {`);
  assert.ok(block >= 0, "one block holds the element styles and ends at a boundary");
  const nested = styles.slice(block, styles.indexOf("@media", block));
  for (const element of ["table", "th, td", "figure", "img, video", "pre", "aside", "a", "p"])
    assert.match(nested, new RegExp(`&:is\\(${element.replace(/[()]/g, "\\$&")}[,)]`), element);
  assert.doesNotMatch(
    styles,
    /\.fast-ux-rich (?:table|th|td|figure|img|video|audio|pre|aside|a|p|blockquote|:is)\b/,
    "no element style outside the block",
  );
});
