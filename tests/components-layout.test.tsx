import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { Grid, Panel, Row, Split, Stack, Table } from "../src/components/index.js";

const { hydrateRoot } = await import("react-dom/client");
void dom;

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const css = ["components/catalog.css", "components/basic.css"].map(read).join("\n");

/** Every plain rule in the sheets, `@media` blocks included, as selector and declarations. */
const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selector: match[1]!.replace(/\/\*[\s\S]*?\*\//g, "").trim(),
  body: match[2]!,
}));
const rulesFor = (pattern: RegExp) => rules.filter((rule) => pattern.test(rule.selector));

/** The one spacing scale every layout uses. 12px is `sm-md`; every older step keeps its value. */
const SCALE = [
  ["none", "0px"],
  ["2xs", "0.125rem"],
  ["xs", "0.25rem"],
  ["sm", "0.5rem"],
  ["sm-md", "0.75rem"],
  ["md", "1rem"],
  ["lg", "1.5rem"],
  ["xl", "2rem"],
  ["2xl", "3rem"],
] as const;

test("Stack, Row, Grid and Split share one gap scale, and md is 16px for all of them", () => {
  for (const [step, value] of SCALE) {
    const declared = rulesFor(new RegExp(`\\[data-gap="${step}"\\]`));
    assert.equal(declared.length, 1, `gap="${step}" is declared once`);
    assert.equal(declared[0]!.selector, `.fux-layout[data-gap="${step}"]`, "on the shared class");
    assert.match(
      declared[0]!.body,
      new RegExp(`--fux-layout-gap:\\s*${value.replace(".", "\\.")};`),
    );
  }
  assert.match(
    rulesFor(/^\.fux-layout$/)
      .map((rule) => rule.body)
      .join(""),
    /gap:\s*var\(--fux-layout-gap\)/,
  );
  // Row once overrode the scale with its own 8px and had no md step, so `gap="md"` rendered 8px.
  for (const rule of rulesFor(/\.fux-(row|stack)\[data-gap/)) {
    assert.fail(`${rule.selector} forks the shared scale`);
  }
  const view = render(
    <>
      <Stack data-testid="stack" gap="md" />
      <Row data-testid="row" gap="md" />
      <Grid data-testid="grid" gap="md" />
      <Split data-testid="split" gap="md">
        <Split.Side />
        <Split.Main />
      </Split>
    </>,
  );
  for (const id of ["stack", "row", "grid", "split"]) {
    const element = view.getByTestId(id);
    assert.ok(element.classList.contains("fux-layout"), `${id} uses the shared scale`);
    assert.equal(element.getAttribute("data-gap"), "md");
  }
});

test("a Row with no gap stays 8px (sm); a Stack with no gap stays 16px (md)", () => {
  const view = render(
    <>
      <Row data-testid="row" />
      <Stack data-testid="stack" />
      <Grid data-testid="grid" />
      <Split data-testid="split">
        <Split.Main />
      </Split>
    </>,
  );
  assert.equal(view.getByTestId("row").getAttribute("data-gap"), "sm");
  assert.equal(view.getByTestId("stack").getAttribute("data-gap"), "md");
  assert.equal(view.getByTestId("grid").getAttribute("data-gap"), "md");
  assert.equal(view.getByTestId("split").getAttribute("data-gap"), "md");
});

test("Stack and Row render as the element asked for; lists keep list semantics", () => {
  const view = render(
    <>
      <Stack as="nav" aria-label="Sections" gap="sm">
        <a href="#one">One</a>
      </Stack>
      <Row as="ul" gap="xs" aria-label="Tags">
        <li>Design</li>
        <li>Research</li>
      </Row>
      <Stack as="article" data-testid="article" />
      <Stack as="section" aria-label="Plain section" />
      <Row data-testid="div" />
    </>,
  );
  const nav = view.getByRole("navigation", { name: "Sections" });
  assert.equal(nav.tagName, "NAV");
  assert.ok(nav.classList.contains("fux-stack") && nav.classList.contains("fux-layout"));
  const list = view.getByRole("list", { name: "Tags" });
  assert.equal(list.tagName, "UL");
  assert.equal(list.getAttribute("role"), "list", "a styled list keeps its role in WebKit");
  assert.ok(list.classList.contains("fux-row"));
  assert.equal(view.getAllByRole("listitem").length, 2);
  assert.equal(view.getByTestId("article").tagName, "ARTICLE");
  assert.equal(view.getByRole("region", { name: "Plain section" }).tagName, "SECTION");
  assert.equal(view.getByTestId("div").tagName, "DIV");
  assert.equal(view.getByTestId("div").getAttribute("role"), null);
  // A layout list drops the browser's bullets and indent; its gap is the spacing.
  const reset = rulesFor(/:is\(ul, ol\)\.fux-layout/);
  assert.equal(reset.length, 1);
  assert.match(reset[0]!.body, /list-style:\s*none/);
  assert.match(reset[0]!.body, /margin:\s*0/);
  assert.match(reset[0]!.body, /padding:\s*0/);
});

test("a ref reaches the element a layout renders", () => {
  const ref = React.createRef<HTMLElement>();
  render(<Stack as="section" ref={ref} />);
  assert.equal(ref.current?.tagName, "SECTION");
});

test("Grid fits as many columns of at least `min` as its own width holds", () => {
  const view = render(
    <>
      <Grid data-testid="grid" min="340px" gap="lg" align="start" style={{ color: "inherit" }}>
        <div>One</div>
        <div>Two</div>
      </Grid>
      <Grid data-testid="number" min={240} />
      <Grid data-testid="default" as="ul" />
    </>,
  );
  const grid = view.getByTestId("grid");
  assert.equal(grid.className, "fux-layout fux-grid");
  assert.equal(grid.getAttribute("data-gap"), "lg");
  assert.equal(grid.getAttribute("data-align"), "start");
  assert.equal(grid.style.getPropertyValue("--fux-grid-min"), "340px");
  assert.equal(grid.style.color, "inherit", "a consumer's style is kept");
  assert.equal(view.getByTestId("number").style.getPropertyValue("--fux-grid-min"), "240px");
  const fallback = view.getByTestId("default");
  assert.equal(fallback.getAttribute("data-align"), "stretch");
  assert.equal(fallback.style.getPropertyValue("--fux-grid-min"), "");
  assert.equal(fallback.getAttribute("role"), "list");
  const [base] = rulesFor(/^\.fux-grid$/);
  assert.ok(base, "a Grid rule");
  assert.match(base.body, /display:\s*grid/);
  // `min(…, 100%)` keeps one column from overflowing a container narrower than `min`.
  assert.match(
    base.body,
    /--fux-grid-min:\s*16rem/,
    "a nested Grid does not inherit its parent's min",
  );
  assert.match(
    base.body,
    /grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(min\(var\(--fux-grid-min\),\s*100%\),\s*1fr\)\)/,
  );
  for (const [align, value] of [
    ["start", "start"],
    ["center", "center"],
    ["end", "end"],
    ["stretch", "stretch"],
  ]) {
    const [rule] = rulesFor(new RegExp(`^\\.fux-grid\\[data-align="${align}"\\]$`));
    assert.match(rule?.body ?? "", new RegExp(`align-items:\\s*${value}`), `align="${align}"`);
  }
});

test("Split puts the side on the edge its source order gives it and stacks below its own width", () => {
  const view = render(
    <>
      <Split data-testid="start" side="200px" stackBelow="620px" gap="lg" align="start">
        <Split.Side as="nav" aria-label="Pages">
          Pages
        </Split.Side>
        <Split.Main as="main">Article</Split.Main>
      </Split>
      <Split data-testid="end" side={180} stackBelow={500}>
        <Split.Main>Answer</Split.Main>
        <Split.Side as="aside" aria-label="Notes">
          Notes
        </Split.Side>
      </Split>
      <Split data-testid="default">
        <Split.Side>Side</Split.Side>
        <Split.Main>Main</Split.Main>
      </Split>
    </>,
  );
  const start = view.getByTestId("start");
  assert.equal(start.className, "fux-layout fux-split");
  assert.equal(start.getAttribute("data-gap"), "lg");
  assert.equal(start.getAttribute("data-align"), "start");
  assert.equal(start.style.getPropertyValue("--fux-split-side"), "200px");
  assert.equal(start.style.getPropertyValue("--fux-split-stack-below"), "620px");
  const nav = view.getByRole("navigation", { name: "Pages" });
  assert.equal(nav.className, "fux-split-side");
  assert.equal(nav.nextElementSibling?.tagName, "MAIN");
  assert.equal(nav.nextElementSibling?.className, "fux-split-main");
  const end = view.getByTestId("end");
  assert.equal(end.style.getPropertyValue("--fux-split-side"), "180px");
  assert.equal(end.style.getPropertyValue("--fux-split-stack-below"), "500px");
  assert.equal(end.lastElementChild, view.getByRole("complementary", { name: "Notes" }));
  const fallback = view.getByTestId("default");
  assert.equal(fallback.style.getPropertyValue("--fux-split-side"), "");
  assert.equal(fallback.getAttribute("data-align"), "stretch");
  const [base] = rulesFor(/^\.fux-split$/);
  assert.match(base?.body ?? "", /display:\s*flex/);
  assert.match(base?.body ?? "", /flex-wrap:\s*wrap/);
  assert.match(base?.body ?? "", /--fux-split-side:\s*16rem/);
  assert.match(base?.body ?? "", /--fux-split-stack-below:\s*40rem/);
  const [side] = rulesFor(/^\.fux-split-side$/);
  assert.match(side?.body ?? "", /flex:\s*1 1 var\(--fux-split-side\)/);
  // The main column refuses to be narrower than `stackBelow` minus the side and the gap, so the
  // pair wraps exactly when the Split itself is narrower than `stackBelow`, whatever the viewport.
  const [main] = rulesFor(/^\.fux-split-main$/);
  assert.match(main?.body ?? "", /flex:\s*9999 1 0/);
  assert.match(
    main?.body ?? "",
    /min-inline-size:\s*min\(\s*100%,\s*calc\(\s*var\(--fux-split-stack-below\) - var\(--fux-split-side\) - var\(--fux-layout-gap\)\s*\)\s*\)/,
  );
});

const columns = [
  { id: "name", label: "Name", isRowHeader: true, render: (row: { id: string }) => row.id },
];

test("Panel padding, edge and tone, and a band header that wraps", () => {
  const view = render(
    <>
      <Panel data-testid="flush" padding="none">
        <Panel.Header tone="band" wrap>
          <Panel.Title>Runs</Panel.Title>
        </Panel.Header>
        <Table label="Runs" columns={columns} rows={[{ id: "first" }]} />
        <Panel.Footer>Footer</Panel.Footer>
      </Panel>
      <Panel data-testid="top" edge="top" padding="sm" />
      <Panel data-testid="quiet" tone="quiet" padding="lg" />
      <Panel data-testid="plain">
        <Panel.Header>
          <Panel.Title>Plain</Panel.Title>
        </Panel.Header>
      </Panel>
    </>,
  );
  const flush = view.getByTestId("flush");
  assert.equal(flush.getAttribute("data-padding"), "none");
  const header = flush.querySelector(".fux-panel-header")!;
  assert.equal(header.getAttribute("data-tone"), "band");
  assert.equal(header.getAttribute("data-wrap"), "true", "like Stack's wrap");
  assert.ok(flush.querySelector(":scope > .fux-table-scroll"), "the table sits directly inside");
  assert.equal(view.getByTestId("top").getAttribute("data-edge"), "top");
  assert.equal(view.getByTestId("top").getAttribute("data-padding"), "sm");
  assert.equal(view.getByTestId("quiet").getAttribute("data-tone"), "quiet");
  assert.equal(view.getByTestId("quiet").getAttribute("data-padding"), "lg");
  // The defaults add nothing, so existing panels render exactly as before.
  const plain = view.getByTestId("plain");
  for (const name of ["data-padding", "data-edge", "data-tone"]) {
    assert.equal(plain.getAttribute(name), null, `no ${name} by default`);
  }
  const plainHeader = plain.querySelector(".fux-panel-header")!;
  assert.equal(plainHeader.getAttribute("data-tone"), null);
  assert.equal(plainHeader.getAttribute("data-wrap"), null);
});

test("Panel CSS: each padding step, a flush frame for a table, the top edge and the tones", () => {
  const body = (selector: string) => {
    const found = rules.filter((rule) => rule.selector === selector);
    assert.equal(found.length, 1, `one rule for ${selector}`);
    return found[0]!.body;
  };
  assert.match(body('.fux-panel.fux-surface[data-padding="none"]'), /--fux-panel-pad:\s*0px/);
  assert.match(body('.fux-panel.fux-surface[data-padding="sm"]'), /--fux-panel-pad:\s*0\.75rem/);
  assert.match(body('.fux-panel.fux-surface[data-padding="md"]'), /--fux-panel-pad:\s*1\.25rem/);
  assert.match(body('.fux-panel.fux-surface[data-padding="lg"]'), /--fux-panel-pad:\s*1\.75rem/);
  // Flush: the header and footer keep a readable inset that lines up with a table's cells.
  assert.match(
    body('.fux-panel.fux-surface[data-padding="none"]'),
    /--fux-panel-inset:\s*0\.75rem/,
  );
  assert.match(
    body(".fux-panel-header"),
    /padding:\s*1rem var\(--fux-panel-inset, 1\.25rem\) 0\.875rem/,
  );
  assert.match(body(".fux-panel-footer"), /padding:\s*0\.75rem var\(--fux-panel-inset, 1\.25rem\)/);
  const frame = body('.fux-panel.fux-surface[data-padding="none"] > .fux-table-scroll');
  assert.match(frame, /border:\s*0/);
  assert.match(frame, /border-radius:\s*0/);
  assert.match(
    body('.fux-panel.fux-surface[data-padding="none"] > .fux-table-scroll:first-child'),
    /border-start-start-radius:\s*inherit/,
  );
  assert.match(
    body('.fux-panel.fux-surface[data-padding="none"] > .fux-table-scroll:last-child'),
    /border-end-end-radius:\s*inherit/,
  );
  const top = body('.fux-panel.fux-surface[data-edge="top"]');
  assert.match(top, /border-width:\s*0;[\s\S]*border-block-start-width:\s*1px/);
  assert.match(top, /border-radius:\s*0/);
  assert.match(top, /box-shadow:\s*none/);
  assert.match(top, /background:\s*transparent/);
  assert.match(top, /--fux-panel-pad-inline:\s*0px/);
  const quiet = body('.fux-panel.fux-surface[data-tone="quiet"]');
  assert.match(quiet, /box-shadow:\s*none/);
  assert.match(quiet, /background:\s*var\(--muted\)/);
  assert.match(quiet, /border-color:\s*var\(--hairline\)/);
  const band = body('.fux-panel-header[data-tone="band"]');
  assert.match(band, /background:\s*var\(--muted\)/);
  assert.match(body(".fux-panel-header[data-wrap]"), /flex-wrap:\s*wrap/);
});

const literalColor =
  /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(white|black)\b/i;
const physicalSide =
  /\b(margin|padding|border)-(left|right|top|bottom)\b|\b(left|right|top|bottom)\s*:|text-align:\s*(left|right)|border-(top|bottom)-(left|right)-radius/;

test("the layout rules use theme tokens for colour and logical sides only", () => {
  const layout = rules.filter((rule) =>
    /fux-(layout|grid|split|panel)|:is\(ul, ol\)/.test(rule.selector),
  );
  assert.ok(layout.length > 20);
  for (const rule of layout) {
    const declarations = rule.body.replace(/\/\*[\s\S]*?\*\//g, "");
    // The panel's existing drop shadow is a neutral tint of black; every new colour is a token.
    const colours = declarations.replace(/box-shadow:\s*0 1px 2px color-mix\([^;]*\);/, "");
    assert.doesNotMatch(colours, literalColor, `${rule.selector} uses tokens only`);
    assert.doesNotMatch(declarations, physicalSide, `${rule.selector} uses logical sides`);
  }
});

function Page() {
  return (
    <Stack as="article" gap="lg">
      <Row as="nav" aria-label="Breadcrumbs" gap="sm-md">
        <a href="#home">Home</a>
      </Row>
      <Grid min="20rem" gap="2xl" align="center">
        <Panel tone="quiet" padding="sm">
          One
        </Panel>
        <Panel edge="top">Two</Panel>
      </Grid>
      <Split side="12rem" stackBelow="36rem" gap="2xs">
        <Split.Side as="aside">Notes</Split.Side>
        <Split.Main>
          <Panel padding="none">
            <Panel.Header tone="band" wrap>
              <Panel.Title>Runs</Panel.Title>
            </Panel.Header>
            <Table label="Runs" columns={columns} rows={[{ id: "first" }]} />
          </Panel>
        </Split.Main>
      </Split>
    </Stack>
  );
}

test("server markup equals the hydrated markup, left to right and right to left", async () => {
  const tree = (
    <>
      <Page />
      <div dir="rtl">
        <Page />
      </div>
    </>
  );
  const html = renderToString(tree);
  assert.equal(renderToString(tree), html, "stable server output");
  assert.match(html, /style="--fux-grid-min:20rem"/);
  assert.match(html, /style="--fux-split-side:12rem;--fux-split-stack-below:36rem"/);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  const server = host.innerHTML;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, tree, { onRecoverableError: (error) => errors.push(error) });
    });
    assert.deepEqual(errors, [], "no hydration mismatch");
    assert.equal(host.innerHTML, server, "hydration changes nothing");
    const rtl = host.querySelector('[dir="rtl"] .fux-split')!;
    assert.equal(rtl.closest("[dir]")?.getAttribute("dir"), "rtl", "the split follows its host");
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});
