import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { renderToString } from "react-dom/server";
import {
  importMarkdownDocument,
  exportMarkdownDocument,
  parseRichDocument,
  serializeRichDocument,
  safeRichUrl,
  validateRichDocument,
  type RichDocument,
} from "../src/rich/index.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://rich.test/",
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
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { RichContent } = await import("../src/react/RichContent.js");
afterEach(cleanup);

const mixedMarkdown =
  "\uFEFF# Notes العربية 🧭\r\n\r\nA **strong** paragraph with *emphasis*, ~~removed~~ and [link](https://example.com).  \r\nNext line.\r\n\r\n> Quoted\r\n\r\n- [x] Done\r\n  - [ ] Nested\r\n\r\n| Key | Value |\r\n| --- | --- |\r\n| A | 2 |\r\n\r\n```js\r\nconst value = '<script>inert</script>';\r\n```\r\n\r\nFootnote[^one].\r\n\r\n[^one]: Footnote body.\r\n\r\n:::unsupported preserve exact\r\n";
function rich(blocks: RichDocument["blocks"]): RichDocument {
  return { schema: "fast-ux-rich", version: 1, blocks };
}

test("whole Markdown import and canonical JSON preserve every source code unit and unknown block data", () => {
  const document = importMarkdownDocument(mixedMarkdown);
  const source = JSON.stringify(document);
  assert.equal(exportMarkdownDocument(document), mixedMarkdown);
  const json = serializeRichDocument(document);
  assert.equal(serializeRichDocument(parseRichDocument(json)), json);
  assert.equal(exportMarkdownDocument(parseRichDocument(json)), mixedMarkdown);
  assert.equal(JSON.stringify(document), source);
  const unknown = rich([
    {
      id: "future",
      kind: "future-v3",
      payload: { ordered: [1, false, null, "עברית"], nested: { source: "<unsafe/>" } },
    },
  ]);
  assert.deepEqual(parseRichDocument(serializeRichDocument(unknown)), unknown);
  assert.throws(() => exportMarkdownDocument(unknown), /cannot be exported losslessly/);
});

test("malformed schemas, known blocks, duplicate IDs, cycles and non-JSON data are rejected", () => {
  for (const value of [
    null,
    [],
    {},
    { schema: "fast-ux-rich", version: 2, blocks: [] },
    rich([{ id: "x", kind: "image", src: 123 } as never]),
    rich([
      { id: "a", kind: "markdown", source: "a" },
      { id: "a", kind: "custom" },
    ]),
  ])
    assert.throws(() => validateRichDocument(value));
  const cyclic: Record<string, unknown> = { id: "cycle", kind: "future" };
  cyclic.self = cyclic;
  assert.throws(() => validateRichDocument(rich([cyclic as never])), /cycles/);
  assert.throws(
    () => validateRichDocument(rich([{ id: "bad", kind: "future", value: undefined } as never])),
    /JSON values/,
  );
  assert.throws(
    () => validateRichDocument(rich([{ id: "bad", kind: "future", value: Number.NaN } as never])),
    /JSON values/,
  );
  assert.throws(
    () => validateRichDocument(rich([{ id: "negative-zero", kind: "future", value: -0 }])),
    /JSON values/,
  );
  assert.throws(
    () =>
      parseRichDocument(
        '{"schema":"fast-ux-rich","version":1,"blocks":[{"id":"negative-zero","kind":"future","value":-0}]}',
      ),
    /JSON values/,
  );
  assert.throws(
    () => validateRichDocument(rich([{ id: "bad", kind: "future", value: new Date() } as never])),
    /plain JSON/,
  );
  assert.throws(() => parseRichDocument("{ broken"));
  let calls = 0;
  const accessor = {
    id: "bad",
    kind: "future",
    get value() {
      calls++;
      return "x";
    },
  };
  assert.throws(() => validateRichDocument(rich([accessor])), /accessors/);
  assert.equal(calls, 0);
  const sparse = new Array(2);
  sparse[1] = "a";
  const decorated = [1];
  Object.assign(decorated, { extra: "discarded" });
  for (const value of [sparse, decorated])
    assert.throws(
      () => validateRichDocument(rich([{ id: "bad", kind: "future", value } as never])),
      /dense/,
    );
  const hidden = { id: "bad", kind: "future" };
  Object.defineProperty(hidden, "lost", { value: true });
  assert.throws(() => validateRichDocument(rich([hidden])), /hidden/);
});

test("URL policy rejects executable, opaque and whitespace-obfuscated schemes", () => {
  for (const url of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:image/svg+xml,x",
    "blob:https://a/x",
    "vbscript:a",
    "java\nscript:a",
    "\tjavascript:a",
    "//remote.test/a",
    "\\remote.test/a",
    "https://safe.test/\u0000x",
    "javascript%3a:alert(1)",
  ])
    assert.equal(safeRichUrl(url), undefined, url);
  for (const url of [
    "https://example.com/a",
    "http://example.com",
    "#section",
    "/docs/path",
    "../file",
    "mailto:person@example.com",
    "tel:+123",
  ])
    assert.equal(safeRichUrl(url), url);
  assert.equal(safeRichUrl("mailto:person@example.com", "media"), undefined);
});

test("Markdown renders semantic GFM rather than raw source, with tasks read-only and external links explicit", () => {
  const document = importMarkdownDocument(mixedMarkdown);
  const before = serializeRichDocument(document);
  const view = render(<RichContent document={document} />);
  assert.ok(view.getByRole("heading", { level: 1, name: /Notes العربية/ }));
  assert.equal(view.container.querySelectorAll("strong").length, 1);
  assert.equal(view.container.querySelectorAll("del").length, 1);
  assert.ok(view.getByRole("table"));
  assert.ok(view.container.querySelector("blockquote"));
  assert.ok(view.container.querySelector("pre code"));
  assert.ok(
    view
      .getByRole("link", { name: /link.*opens in new tab/ })
      .getAttribute("rel")
      ?.includes("noopener"),
  );
  assert.ok(view.getByRole("link", { name: /Back to reference/ }));
  const tasks = view.getAllByRole("checkbox") as HTMLInputElement[];
  assert.equal(tasks.length, 2);
  assert.ok(tasks.every((task) => task.disabled));
  assert.ok(view.getByRole("checkbox", { name: "Completed: Done" }));
  assert.ok(view.getByRole("checkbox", { name: "Incomplete: Nested" }));
  fireEvent.click(tasks[0]!);
  assert.equal(serializeRichDocument(document), before);
  assert.equal(view.container.querySelector("textarea,[contenteditable]"), null);
});

test("untrusted HTML, MDX and unsafe links/images stay inert and remote media defaults denied", () => {
  const source =
    '# Safe\n\n<script>globalThis.pwned=true</script>\n\n<img src="https://evil.test/a" onerror="alert(1)">\n\n[bad](javascript:alert%281%29) ![bad image](data:image/svg+xml,evil)\n\n![remote](https://remote.test/image.png)\n\n<MyComponent import="evil" />\n\n```jsx\nwindow.pwned = true\n```';
  const document = importMarkdownDocument(source);
  const view = render(<RichContent document={document} />);
  assert.equal(view.container.querySelector("script,iframe,img,svg,object,embed"), null);
  assert.equal(view.container.querySelector("a[href^='javascript']"), null);
  assert.ok(view.getByText("remote: image unavailable."));
  assert.equal((globalThis as { pwned?: boolean }).pwned, undefined);
  assert.equal(exportMarkdownDocument(document), source);
});

test("rich block registry, safe drawing, transcripts, unknown fallback and media failures", () => {
  const document = rich([
    { id: "image", kind: "image", src: "https://media.test/image.png", alt: "Photo" },
    {
      id: "drawing",
      kind: "drawing",
      snapshot: "https://media.test/drawing.png",
      label: "Sketch",
      data: { strokes: [[1, 2]] },
    },
    { id: "diagram", kind: "diagram", renderer: "chart", source: "opaque grammar", label: "Flow" },
    {
      id: "video",
      kind: "video",
      src: "https://media.test/video.mp4",
      label: "Demo video",
      tracks: [{ src: "https://media.test/captions.vtt", label: "English", language: "en" }],
      transcript: "Spoken content",
    },
    {
      id: "audio",
      kind: "audio",
      src: "https://media.test/audio.mp3",
      label: "Recording",
      transcript: "Audio words",
    },
    {
      id: "link",
      kind: "link",
      href: "https://example.com",
      label: "Bookmark",
      description: "Description",
    },
    { id: "react", kind: "react", renderer: "pulse", label: "Animation", props: { value: 2 } },
    { id: "missing", kind: "react", renderer: "__proto__", label: "Missing" },
    { id: "custom", kind: "future", payload: { preserved: true } },
    {
      id: "callout",
      kind: "callout",
      label: "Important",
      blocks: [{ id: "inner", kind: "markdown", source: "**Nested content**" }],
    },
  ]);
  const before = serializeRichDocument(document);
  const view = render(
    <RichContent
      document={document}
      allowMedia={(url) => url.startsWith("https://media.test/")}
      registry={{
        diagrams: {
          chart: ({ block }) => <figure aria-label={block.label}>Readable diagram</figure>,
        },
        react: {
          pulse: ({ reducedMotion }) => (
            <span data-animation={reducedMotion ? "still" : "active"}>Trusted animation</span>
          ),
        },
      }}
    />,
  );
  assert.ok(view.getByRole("img", { name: "Photo" }));
  assert.ok(view.getByRole("img", { name: "Sketch" }));
  assert.ok(view.getByRole("figure", { name: "Flow" }));
  assert.equal(view.getByText("Trusted animation").getAttribute("data-animation"), "still");
  assert.ok(view.getByText("Missing: interactive renderer unavailable."));
  assert.ok(view.getByText("Unsupported content: future. Data is preserved."));
  const video = view.container.querySelector("video")!;
  assert.equal(video.preload, "none");
  assert.equal(video.autoplay, false);
  assert.equal(video.controls, true);
  assert.equal(video.querySelector("track")?.getAttribute("kind"), "captions");
  assert.ok(view.getByText("Spoken content"));
  fireEvent.error(view.getByRole("img", { name: "Photo" }));
  assert.ok(view.getByText("Photo: image unavailable."));
  fireEvent.error(video.querySelector("source")!);
  assert.ok(view.getByText("Demo video: media unavailable."));
  assert.equal(serializeRichDocument(document), before);
});

test("media protocol deny outranks app policy; denied sources do not create fetching elements", () => {
  const document = rich([
    { id: "i", kind: "image", src: "data:image/svg+xml,evil", alt: "Unsafe image" },
    { id: "v", kind: "video", src: "javascript:evil", label: "Unsafe video" },
    {
      id: "d",
      kind: "diagram",
      renderer: "module/path",
      source: "alert(1)",
      label: "Unknown diagram",
    },
  ]);
  const html = renderToString(<RichContent document={document} allowMedia={() => true} />);
  assert.equal(/<(img|video|script|iframe|object)\b/.test(html), false);
  assert.match(html, /Unsafe image/);
  assert.match(html, /Unknown diagram/);
});

test("rich SSR is deterministic, source budgets preserve source and JSON depth is bounded", () => {
  const document = importMarkdownDocument(mixedMarkdown);
  assert.equal(
    renderToString(<RichContent document={document} />),
    renderToString(<RichContent document={document} />),
  );
  const large = importMarkdownDocument("a".repeat(200_001));
  assert.match(renderToString(<RichContent document={large} />), /rendering budget/);
  assert.equal(exportMarkdownDocument(large).length, 200_001);
  let nested: unknown = true;
  for (let i = 0; i < 70; i++) nested = { nested };
  assert.throws(
    () => validateRichDocument(rich([{ id: "deep", kind: "future", data: nested } as never])),
    /budget/,
  );
});

test("multiple Markdown blocks scope footnote targets and labels uniquely", () => {
  const source = "Reference[^same].\n\n[^same]: Footnote body.";
  const view = render(
    <>
      <RichContent
        document={rich([
          { id: "a", kind: "markdown", source },
          { id: "b", kind: "markdown", source },
        ])}
      />
      <RichContent document={importMarkdownDocument(source)} />
    </>,
  );
  const ids = [...view.container.querySelectorAll("[id]")].map((element) => element.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const link of view.container.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
    assert.ok(document.getElementById(link.getAttribute("href")!.slice(1)));
  for (const link of view.container.querySelectorAll<HTMLElement>("[aria-describedby]"))
    assert.ok(document.getElementById(link.getAttribute("aria-describedby")!));
});

test("a failed trusted renderer recovers when its immutable block data or registered component changes", () => {
  const originalError = console.error;
  const caught: unknown[] = [];
  console.error = (...args: unknown[]) => caught.push(args);
  try {
    const Renderer = ({ block }: { block: import("../src/rich/index.js").ReactBlock }) => {
      if (!(block.props as { ready?: boolean })?.ready) throw new Error("Fixture unavailable");
      return <span>Recovered content</span>;
    };
    const registry = { react: { card: Renderer } };
    const bad = rich([
      { id: "card", kind: "react", renderer: "card", label: "Card", props: { ready: false } },
    ]);
    const view = render(<RichContent document={bad} registry={registry} />);
    assert.ok(view.getByText("Card: renderer unavailable."));
    const good = rich([
      { id: "card", kind: "react", renderer: "card", label: "Card", props: { ready: true } },
    ]);
    view.rerender(<RichContent document={good} registry={registry} />);
    assert.ok(view.getByText("Recovered content"));
    view.rerender(<RichContent document={bad} registry={registry} />);
    assert.ok(view.getByText("Card: renderer unavailable."));
    view.rerender(
      <RichContent
        document={bad}
        registry={{ react: { card: () => <span>Replacement renderer</span> } }}
      />,
    );
    assert.ok(view.getByText("Replacement renderer"));
    assert.ok(caught.length > 0);
  } finally {
    console.error = originalError;
  }
});

test("application-defined block kinds use only explicit own-property trusted registry entries", () => {
  const document = rich([
    { id: "metric", kind: "metric", value: 7 },
    { id: "prototype", kind: "__proto__", value: 8 },
  ]);
  const before = serializeRichDocument(document);
  const view = render(
    <RichContent
      document={document}
      registry={{
        blocks: {
          metric: ({ block, reducedMotion }) => (
            <output aria-label="Metric" data-reduced={reducedMotion}>
              {"value" in block && typeof block.value === "number" ? block.value : "Unavailable"}
            </output>
          ),
        },
      }}
    />,
  );
  assert.equal(view.getByLabelText("Metric").textContent, "7");
  assert.equal(view.getByLabelText("Metric").getAttribute("data-reduced"), "true");
  assert.ok(view.getByText("Unsupported content: __proto__. Data is preserved."));
  assert.equal(serializeRichDocument(document), before);
});
