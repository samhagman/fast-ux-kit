import { browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { DescriptionList, Eyebrow, Heading, Text } from "../src/components/index.js";

const { hydrateRoot } = await import("react-dom/client");
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
/** A stylesheet without its comments. */
const sheet = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "");

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

/** The declarations of every rule whose selector mentions `needle`. */
function rules(css: string, needle: string) {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => match[1]!.includes(needle))
    .map((match) => match[2]!)
    .join("\n");
}

/** A page header as an application would write one. */
function Header() {
  return (
    <header>
      <Eyebrow>Workspace settings</Eyebrow>
      <Heading level={1}>Members</Heading>
      <Text tone="muted" size="sm">
        People who can open and edit this workspace.
      </Text>
      <DescriptionList
        layout="inline"
        items={[
          { term: "Owner", detail: "Rania Haddad" },
          { term: "Members", detail: "12" },
          { term: "Created", detail: <time dateTime="2028-02-12">12 February 2028</time> },
        ]}
      />
    </header>
  );
}

test("level is the element; size is the look, independent of level", () => {
  const view = render(
    <>
      {([1, 2, 3, 4, 5, 6] as const).map((level) => (
        <Heading key={level} level={level}>
          Level {level}
        </Heading>
      ))}
      <Heading level={3} size="display">
        Looks like a page title
      </Heading>
      <Heading level={1} size="subsection" id="small" className="my-heading">
        Small top heading
      </Heading>
    </>,
  );
  for (const level of [1, 2, 3, 4, 5, 6])
    assert.equal(view.getByRole("heading", { name: `Level ${level}` }).tagName, `H${level}`);
  // Without a size, the level picks one: h1 a title, h2 a section, h3 and below a subsection.
  assert.deepEqual(
    [1, 2, 3, 4, 5, 6].map((level) =>
      view.getByRole("heading", { name: `Level ${level}` }).getAttribute("data-size"),
    ),
    ["title", "section", "subsection", "subsection", "subsection", "subsection"],
  );
  const display = view.getByRole("heading", { level: 3, name: "Looks like a page title" });
  assert.equal(display.getAttribute("data-size"), "display");
  assert.ok(display.classList.contains("fux-heading"));
  const small = view.getByRole("heading", { level: 1, name: "Small top heading" });
  assert.equal(small.getAttribute("data-size"), "subsection");
  assert.equal(small.id, "small", "DOM props pass through");
  assert.ok(small.classList.contains("my-heading"), "className merges");
});

test("Text is a paragraph or a span, with a size and a tone", () => {
  const view = render(
    <>
      <Text>Body copy</Text>
      <Text as="span" size="sm" tone="muted">
        A muted note
      </Text>
      <Text size="lg" tone="error" role="note">
        3 notes could not be saved
      </Text>
    </>,
  );
  const body = view.getByText("Body copy");
  assert.equal(body.tagName, "P", "a paragraph by default");
  assert.equal(body.getAttribute("data-size"), "md");
  assert.equal(body.getAttribute("data-tone"), "default");
  assert.ok(body.classList.contains("fux-text"));
  const note = view.getByText("A muted note");
  assert.equal(note.tagName, "SPAN");
  assert.equal(note.getAttribute("data-size"), "sm");
  assert.equal(note.getAttribute("data-tone"), "muted");
  const error = view.getByRole("note");
  assert.equal(error.getAttribute("data-size"), "lg");
  assert.equal(error.getAttribute("data-tone"), "error");
  // A span sits inside another line, so without a size it keeps that line's size.
  const inline = render(
    <Text size="sm">
      Synced 2 minutes ago.{" "}
      <Text as="span" tone="muted">
        Next sync at 14:30.
      </Text>
    </Text>,
  );
  const span = inline.getByText("Next sync at 14:30.");
  assert.equal(span.tagName, "SPAN");
  assert.equal(span.hasAttribute("data-size"), false, "a span inherits its line's size");
  assert.equal(span.getAttribute("data-tone"), "muted");
  for (const tone of ["info", "success", "warning"] as const) {
    const one = render(<Text tone={tone}>{tone}</Text>);
    assert.equal(one.getByText(tone).getAttribute("data-tone"), tone);
  }
});

test("Eyebrow is a muted kicker line, a paragraph or a span", () => {
  const view = render(
    <>
      <Eyebrow>Step 2 of 3</Eyebrow>
      <Eyebrow as="span" tone="error" className="mine">
        Failed
      </Eyebrow>
    </>,
  );
  const kicker = view.getByText("Step 2 of 3");
  assert.equal(kicker.tagName, "P");
  assert.ok(kicker.classList.contains("fux-eyebrow"));
  assert.equal(kicker.getAttribute("data-tone"), "muted", "muted unless asked");
  const failed = view.getByText("Failed");
  assert.equal(failed.tagName, "SPAN");
  assert.equal(failed.getAttribute("data-tone"), "error");
  assert.ok(failed.classList.contains("mine"));
  // The kicker's capitals are a style: the text itself stays as written for screen readers.
  assert.equal(kicker.textContent, "Step 2 of 3");
});

test("DescriptionList renders real dl, dt and dd, one group per item", () => {
  const view = render(<Header />);
  const list = view.container.querySelector("dl")!;
  assert.ok(list.classList.contains("fux-dl"));
  assert.equal(list.getAttribute("data-layout"), "inline");
  const groups = [...list.children];
  assert.deepEqual(
    groups.map((group) => group.tagName),
    ["DIV", "DIV", "DIV"],
    "each term and detail pair is a div, which a dl allows",
  );
  for (const group of groups)
    assert.deepEqual(
      [...group.children].map((child) => child.tagName),
      ["DT", "DD"],
    );
  assert.deepEqual(
    [...list.querySelectorAll("dt")].map((term) => term.textContent),
    ["Owner", "Members", "Created"],
  );
  assert.equal(list.querySelector("dd time")?.getAttribute("dateTime"), "2028-02-12");
  const stacked = render(<DescriptionList items={[{ term: "Plan", detail: "Team" }]} id="plan" />);
  const plain = stacked.container.querySelector("dl")!;
  assert.equal(plain.getAttribute("data-layout"), "stacked", "stacked unless asked");
  assert.equal(plain.id, "plan");
});

test("server markup equals the hydrated markup", async () => {
  const tree = (
    <>
      <Header />
      <div dir="rtl" lang="ar">
        <Eyebrow>إعدادات المساحة</Eyebrow>
        <Heading level={2} size="display">
          الأعضاء
        </Heading>
        <DescriptionList layout="inline" items={[{ term: "المالك", detail: "رانيا حداد" }]} />
      </div>
    </>
  );
  const html = renderToString(tree);
  assert.equal(renderToString(tree), html, "server rendering is stable");
  assert.match(html, /<h2 class="fux-heading" data-size="display"/);
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
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});

test("right to left: the text families follow their host and use logical sides only", () => {
  const view = render(
    <div dir="rtl">
      <Header />
    </div>,
  );
  for (const element of view.container.querySelectorAll(".fux-heading, .fux-text, .fux-dl"))
    assert.equal(element.hasAttribute("dir"), false, "no direction of their own unless asked");
  const css = sheet("components/text.css");
  assert.doesNotMatch(
    css,
    /\b(left|right|margin-left|margin-right|padding-left|padding-right|border-left|border-right|text-align:\s*(left|right))\b/,
    "start/end properties instead of left/right",
  );
  // Letter spacing pulls joined scripts apart, so the kicker drops it for them.
  assert.match(css, /\.fux-eyebrow:lang\(ar\)/);
  assert.match(rules(css, ":lang(ar)"), /letter-spacing:\s*0/);
});

test("every style reads a theme token, so a consumer theme restyles the text families", () => {
  const css = sheet("components/text.css");
  const literal =
    /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(white|black|red|blue|green|gray|grey)\b/i;
  const declarations = [...css.matchAll(/([a-z-]+)\s*:\s*([^;{}]+);/g)];
  assert.ok(declarations.length > 20, "the families are styled");
  for (const [, property, value] of declarations) {
    if (/(^|-)color$|^background|^border/.test(property!))
      assert.doesNotMatch(value!, literal, `${property}: ${value} uses tokens, not literal colors`);
    if (/^(font-size|font-family|font-weight|letter-spacing|line-height)$/.test(property!))
      // A reset to zero is the one literal (the joined-script kicker).
      assert.match(value!, /var\(--|^0$/, `${property}: ${value} reads a token`);
  }
  // Colors come from the theme's roles; status tones mix the theme's tone with its foreground.
  assert.match(rules(css, '[data-tone="muted"]'), /var\(--muted-foreground\)/);
  for (const [tone, token] of [
    ["info", "--signal"],
    ["success", "--success"],
    ["warning", "--warning"],
    ["error", "--destructive"],
  ])
    assert.match(rules(css, `[data-tone="${tone}"]`), new RegExp(`var\\(${token}\\)`));
  // Every kit token read without a fallback is defined, in the shared token sheet or locally.
  const defined = new Set(
    [...(read("tokens.css") + css).matchAll(/(--fux-[a-z0-9-]+)\s*:/g)].map((match) => match[1]),
  );
  for (const [, token] of css.matchAll(/var\((--fux-[a-z0-9-]+)\)/g))
    assert.ok(defined.has(token), `${token} is defined`);
  // The heading sizes are tokens, including the display size the kit lacked.
  for (const size of ["display", "title", "section", "subsection"])
    assert.match(read("tokens.css"), new RegExp(`--fux-heading-${size}:`));
  // Headings take the theme's heading font, and kickers its mono font.
  assert.match(
    rules(css, ".fux-heading"),
    /font-family:\s*var\(--font-heading,\s*var\(--font-sans\)\)/,
  );
  assert.match(rules(css, ".fux-eyebrow"), /font-family:\s*var\(--font-mono/);
  // Both stylesheet entries load the text styles.
  assert.match(read("library.css"), /@import "\.\/components\/text\.css";/);
  assert.match(read("components.css"), /@import "\.\/components\/text\.css";/);
});

test("responsive: display headings shrink with their container, inline lists wrap with theirs", () => {
  const css = sheet("components/text.css");
  // A display heading scales with its container's width, between the title and display sizes.
  assert.match(
    rules(css, '.fux-heading[data-size="display"]'),
    /font-size:\s*clamp\(var\(--fux-heading-title\),[^;]*cqi[^;]*,\s*var\(--fux-heading-display\)\)/,
  );
  // An inline list puts each detail beside its term while there is room and under it when not,
  // decided by the list's own width rather than the viewport's.
  const inline = rules(css, '.fux-dl[data-layout="inline"] > div');
  assert.match(inline, /flex-wrap:\s*wrap/);
  assert.doesNotMatch(css, /@media[^{]*width/, "no viewport breakpoints");
});
