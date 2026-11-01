// Rich content and views: math (KaTeX), rich notes (blocks, images, code, tables, embeds),
// lossless export of rich notes, the article view, the mind-map view and print.
//
//   cd studio && node --test tests/outliner-rich.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, inline, rich, interchange, article, mindmap, katex;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
  inline = await load("/src/registry/outliner/inline.tsx");
  rich = await load("/src/registry/outliner/rich-note.ts");
  interchange = await load("/src/registry/outliner/interchange.ts");
  article = await load("/src/registry/outliner/article.ts");
  mindmap = await load("/src/registry/outliner/mindmap.ts");
  katex = await load("/src/registry/outliner/katex-render.ts");
});
after(() => vite?.close());

/* ───────────── Math ───────────── */

test("math: $…$ and $$…$$ parse as math; currency and escapes stay text", () => {
  const kinds = (source) => inline.parseInline(source).map((s) => `${s.kind}:${s.display}`);
  assert.deepEqual(kinds("Euler $e^{i\\pi}+1=0$ ok"), ["text:Euler ", "math:e^{i\\pi}+1=0", "text: ok"]);
  assert.deepEqual(kinds("$$\\int_0^1 x\\,dx$$"), ["math:\\int_0^1 x\\,dx"]);
  for (const plain of ["$5 and $10", "Budget $5k–$10k", "costs $5.", "a$b$", "$x$5"])
    assert.deepEqual(kinds(plain), [`text:${plain}`], plain);
  assert.deepEqual(kinds("\\$x$"), ["escape:$", "text:x$"], "a backslash makes $ literal");
  assert.deepEqual(kinds("`$x$`"), ["code:$x$"], "code wins over math");
  // Pasted text keeps a would-be formula literal, and stays readable as plain text.
  const literal = inline.literalInline("between $x$ and $y$");
  assert.equal(literal, "between \\$x$ and \\$y$");
  assert.ok(inline.parseInline(literal).every((s) => s.kind !== "math"));
  assert.equal(inline.inlineToPlain("area $\\pi r^2$"), "area \\pi r^2", "search and export see the TeX source");
});

test("math: KaTeX renders safely (trust off, errors as text, no throw)", () => {
  const ok = katex.texToMarkup("\\frac{a}{b}");
  assert.match(ok, /class="katex"/);
  assert.doesNotMatch(ok, /<math/, "html output only: the accessible name is the TeX source on our wrapper");
  const link = katex.texToMarkup("\\href{javascript:alert(1)}{click}");
  assert.doesNotMatch(link, /<a\b/i, "\\href is refused while trust is off");
  assert.doesNotMatch(link, /href="javascript/i);
  const html = katex.texToMarkup("\\htmlClass{evil}{x} \\url{https://example.com}");
  assert.doesNotMatch(html, /class="evil"/);
  const broken = katex.texToMarkup("\\frac{a}{");
  assert.match(broken, /katex-error/, "a formula that does not parse shows its source");
  assert.match(broken, /\\frac\{a\}\{/);
  // Macro bombs are bounded.
  assert.doesNotThrow(() => katex.texToMarkup("\\def\\a{\\a\\a}\\a"));
});

/* ───────────── Rich notes: blocks ───────────── */

const slice = (source, range) => source.slice(range.start, range.end);

test("rich notes: a plain note is one paragraph (renders as before)", () => {
  const source = "Partner needs sandbox credentials.\nSecond line, same paragraph.";
  assert.equal(rich.isRichNote(source), false);
  assert.deepEqual(rich.parseNoteBlocks(source), [{ kind: "paragraph", start: 0, text: { start: 0, end: source.length } }]);
  assert.equal(rich.isRichNote("Tag: `evals-2026.10`. #launch @dana"), false, "inline marks and tags are not blocks");
});

test("rich notes: every block kind, with exact source offsets", () => {
  const fence = "```";
  const source = [
    "## Results ##",
    "Intro line one",
    "line two",
    "",
    "- [x] red team",
    "- [ ] evals",
    "  - nested **bold**",
    "3. three",
    "4. four",
    "> quoted",
    "> more",
    "| Model | Score |",
    "|:------|------:|",
    "| A | 1 |",
    "| B \\| C | 2 |",
    `${fence}python`,
    "print('hi')",
    "",
    "x = 1",
    fence,
    "$$",
    "\\int_0^1 x\\,dx",
    "$$",
    "$$ a^2 + b^2 $$",
    "![Loss curve](https://example.com/loss.png =640x300 \"Loss\")",
    "![bad](javascript:alert(1))",
    "---",
    "C# is a language",
  ].join("\n");
  const blocks = rich.parseNoteBlocks(source);
  assert.deepEqual(blocks.map((b) => b.kind), ["heading", "paragraph", "list", "list", "quote", "table", "code", "math", "math", "image", "paragraph", "rule", "paragraph"]);
  const [heading, para, tasks, ordered, quote, table, code, math, math1, image, bad, , last] = blocks;
  assert.equal(heading.level, 2);
  assert.equal(slice(source, heading.text), "Results", "closing #s are dropped");
  assert.equal(slice(source, para.text), "Intro line one\nline two");
  assert.deepEqual(tasks.list.items.map((item) => [slice(source, item.text), item.checked]), [["red team", true], ["evals", false]]);
  assert.equal(slice(source, tasks.list.items[1].children.items[0].text), "nested **bold**", "indentation nests");
  assert.equal(ordered.list.ordered, true);
  assert.equal(ordered.list.first, 3);
  assert.deepEqual(quote.lines.map((line) => slice(source, line)), ["quoted", "more"]);
  assert.deepEqual(table.align, ["start", "end"]);
  assert.deepEqual(table.head.map((cell) => slice(source, cell)), ["Model", "Score"]);
  assert.deepEqual(table.rows.map((row) => row.map((cell) => slice(source, cell))), [["A", "1"], ["B \\| C", "2"]], "an escaped pipe is cell text");
  assert.equal(code.lang, "python");
  assert.equal(slice(source, code.code), "print('hi')\n\nx = 1", "code keeps blank lines");
  assert.equal(slice(source, math.tex), "\\int_0^1 x\\,dx");
  assert.equal(slice(source, math1.tex), "a^2 + b^2");
  assert.deepEqual({ alt: image.alt, url: image.url, w: image.width, h: image.height, title: image.title }, { alt: "Loss curve", url: "https://example.com/loss.png", w: 640, h: 300, title: "Loss" });
  assert.equal(slice(source, bad.text), "![bad](javascript:alert(1))", "non-http images are plain text, never loaded");
  assert.equal(slice(source, last.text), "C# is a language");
  assert.equal(rich.noteSummary("```js\nx\n```"), "js code");
});

test("rich notes: an unclosed fence runs to the end; site paths are images", () => {
  const blocks = rich.parseNoteBlocks("```\nno close\nstill code");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].kind, "code");
  assert.equal(rich.parseNoteBlocks("![chart](/demo/eval-curve.svg)")[0].kind, "image");
});

/* ───────────── Rich notes: rendering (SSR) ───────────── */

async function renderNote(source, renderers, extra = {}) {
  const React = await import("react");
  const { renderToString } = await import("react-dom/server");
  const view = await load("/src/registry/outliner/rich-note-view.tsx");
  return renderToString(
    React.createElement(view.RichContentProvider, { renderers }, React.createElement(view.RichNote, { source, ...extra })),
  );
}

test("rich notes: blocks render as semantic elements with caret offsets; nothing in the note runs", async () => {
  const fence = "```";
  const source = `<script>alert(1)</script> <b>x</b>\n\n- item $x^2$\n\n${fence}js\nlet a = 1;\n${fence}\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n![alt text](https://example.com/a.png =320x200)`;
  const html = await renderNote(source, {});
  assert.doesNotMatch(html, /<script/i, "document text is never markup");
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /<ul[^>]*><li/);
  assert.match(html, /role="math" aria-label="x\^2"/, "math is labelled with its TeX source");
  assert.match(html, /<pre[^>]*><code><span data-src="\d+">let a = 1;<\/span><\/code><\/pre>/);
  assert.match(html, /aria-label="Copy code"/);
  assert.match(html, /<table/);
  assert.match(html, /<img src="https:\/\/example.com\/a.png" alt="alt text" width="320" height="200" loading="lazy"/);
  // data-src offsets point at the source, so a click lands on the right character.
  const offset = Number(/<span data-src="(\d+)">let a = 1;/.exec(html)[1]);
  assert.equal(source.slice(offset, offset + 10), "let a = 1;");
});

test("rich notes: embeds render through the host's renderer map, with safe fallbacks", async () => {
  const React = await import("react");
  const fence = "```";
  const renderers = {
    "embed:video": ({ source, lang }) => React.createElement("figure", { "data-host-video": source.trim(), "data-lang": lang }),
    "embed:broken": () => {
      throw new Error("host bug");
    },
  };
  const html = await renderNote(`${fence}embed:video\nabc123\n${fence}`, renderers);
  assert.match(html, /<figure data-host-video="abc123" data-lang="embed:video"/);
  const missing = await renderNote(`${fence}embed:map\n51.5,-0.1\n${fence}`, renderers);
  assert.match(missing, /embed:map · no renderer/, "an unknown embed shows as labelled code");
  assert.match(missing, /51\.5,-0\.1/);
  const proto = await renderNote(`${fence}constructor\nx\n${fence}`, renderers);
  assert.match(proto, /<pre/, "only the map's own keys are renderers");
});

test("rich notes: a host renderer that throws falls back to code (client error boundary)", async () => {
  await domEnv();
  const view = await load("/src/registry/outliner/rich-note-view.tsx");
  const fence = "```";
  const host = document.createElement("div");
  const root = createRoot(host);
  const errors = console.error;
  console.error = () => {};
  try {
    await act(async () =>
      root.render(
        React.createElement(
          view.RichContentProvider,
          { renderers: { "embed:broken": () => { throw new Error("host bug"); } } },
          React.createElement(view.RichNote, { source: `before\n\n${fence}embed:broken\npayload\n${fence}` }),
        ),
      ),
    );
  } finally {
    console.error = errors;
  }
  assert.equal(host.querySelector("pre")?.textContent, "payload", "the block shows as code");
  assert.match(host.textContent, /before/, "the rest of the note still renders");
  await act(async () => root.unmount());
});

/* ───────────── Export round trips ───────────── */

const NOTE = [
  "## Results",
  "Intro",
  "",
  "- [x] red team",
  "  - nested",
  "1. first",
  "\\- literal dash",
  "```python",
  "def f():",
  "",
  "    return 1",
  "```",
  "$$ a^2 $$",
  "| A | B |",
  "|---|---|",
  "| 1 | 2 |",
  "![img](https://example.com/a.png)",
].join("\n");

test("export: rich notes survive Markdown, OPML and JSON round trips", async () => {
  // OPML import parses XML with the browser's DOMParser (jsdom's under Node).
  if (!globalThis.DOMParser) globalThis.DOMParser = new (await import("jsdom")).JSDOM("").window.DOMParser;
  const nodes = [
    { id: "a", text: "Model card $E=mc^2$", data: { note: NOTE, view: "article" }, children: [{ id: "b", text: "Child", data: { note: "plain" } }] },
    { id: "m", text: "Map", data: { view: "mindmap" } },
  ];
  for (const format of ["markdown", "opml", "json"]) {
    const text = interchange.exportOutline(nodes, format);
    const back = interchange.importOutline(text);
    const a = back[0];
    assert.equal(a.text, "Model card $E=mc^2$", format);
    assert.equal(a.data.note, NOTE, `${format}: the note comes back byte for byte`);
    assert.equal(a.children?.[0]?.data?.note, "plain", `${format}: the child is still a child`);
    assert.equal(a.children.length, 1, `${format}: note list items did not become children`);
    if (format !== "markdown") {
      assert.equal(a.data.view, "article", `${format}: the view travels`);
      assert.equal(back[1].data.view, "mindmap");
    }
  }
});

test("export: ordinary Markdown continuation lines still import as notes", () => {
  const back = interchange.importOutline("- Item\n  first line\n\n  second paragraph\n- Next");
  assert.equal(back[0].data.note, "first line\n\nsecond paragraph");
  assert.equal(back[1].text, "Next");
});

/* ───────────── Article view ───────────── */

test("article: headings stay headings, sections from top-level branches, tasks and ordinals", () => {
  const items = [
    { id: "s", text: "Summary", data: { heading: 1 }, children: [{ id: "p", text: "Para", children: [{ id: "pp", text: "Deeper" }] }] },
    { id: "sec", text: "Section", children: [{ id: "t", text: "Task", checked: false }, { id: "d", text: "Done", checked: true }] },
    { id: "n", text: "Numbered", data: { numbered: true, heading: 3 }, children: [{ id: "n1", text: "one" }, { id: "n2", text: "two" }] },
    { id: "solo", text: "A lone paragraph" },
    { id: "lt", text: "Top task", checked: false, children: [{ id: "lt1", text: "sub" }] },
  ];
  const blocks = article.articleBlocks(items);
  assert.deepEqual(
    blocks.map((b) => [b.node.id, b.kind, b.kind === "heading" ? b.level : b.depth, b.ordinal ?? null]),
    [
      ["s", "heading", 1, null],
      ["p", "paragraph", 0, null],
      ["pp", "paragraph", 1, null],
      ["sec", "heading", 2, null],
      ["t", "paragraph", 0, null],
      ["d", "paragraph", 0, null],
      ["n", "heading", 3, null],
      ["n1", "paragraph", 0, 1],
      ["n2", "paragraph", 0, 2],
      ["solo", "paragraph", 0, null],
      ["lt", "paragraph", 0, null],
      ["lt1", "paragraph", 1, null],
    ],
  );
  assert.equal(blocks.find((b) => b.node.id === "d").done, true);
  assert.equal(blocks.find((b) => b.node.id === "t").task, true);
  assert.equal(article.articleBlocks(items), blocks, "cached per node identity");
  const hidden = article.articleBlocks(items, { hideCompleted: true });
  assert.ok(!hidden.some((b) => b.node.id === "d"), "hide completed hides done items");
});

/* ───────────── Mind map ───────────── */

const mapRoot = {
  id: "r",
  text: "Root",
  children: [
    { id: "a", text: "Alpha", children: [{ id: "a1", text: "a1" }, { id: "a2", text: "a2" }] },
    { id: "b", text: "Beta", children: [{ id: "b1", text: "b1" }] },
    { id: "c", text: "Gamma", children: [{ id: "c1", text: "c1" }, { id: "c2", text: "c2", children: [{ id: "c2x", text: "deep" }] }] },
    { id: "d", text: "Delta" },
  ],
};

test("mind map: sides balance, folds hide children (and never move branches across)", () => {
  const all = new Set(["a", "b", "c", "c2"]);
  const g = mindmap.mindMapGraph(mapRoot, all);
  const side = (graph, id) => graph.nodes.get(id).side;
  assert.deepEqual(["a", "b", "c", "d"].map((id) => side(g, id)), ["end", "end", "start", "start"]);
  assert.equal(side(g, "c2x"), "start", "descendants inherit their branch's side");
  const folded = mindmap.mindMapGraph(mapRoot, new Set(["b", "c", "c2"]));
  assert.equal(folded.nodes.get("a").folded, true);
  assert.equal(folded.nodes.get("a").hidden, 2);
  assert.ok(!folded.nodes.has("a1"));
  assert.deepEqual(["a", "b", "c", "d"].map((id) => side(folded, id)), ["end", "end", "start", "start"], "folding a never moves b, c or d");
  const small = mindmap.mindMapGraph({ ...mapRoot, children: mapRoot.children.slice(0, 2) }, all);
  assert.deepEqual(["a", "b"].map((id) => side(small, id)), ["end", "end"], "a small map grows to one side");
  const capped = mindmap.mindMapGraph(mapRoot, all, { limit: 4 });
  assert.equal(capped.order.length, 4);
  assert.equal(capped.truncated, true);
});

test("mind map: arrow keys travel visually (mirrored for RTL), unfolding on the way out", () => {
  const g = mindmap.mindMapGraph(mapRoot, new Set(["a", "c"]));
  const step = (from, key, rtl) => mindmap.stepMindMap(g, from, key, rtl);
  assert.deepEqual(step("r", "right"), { id: "a" });
  assert.deepEqual(step("r", "left"), { id: "c" });
  assert.deepEqual(step("a", "right"), { id: "a1" });
  assert.deepEqual(step("a1", "left"), { id: "a" });
  assert.deepEqual(step("a", "left"), { id: "r" });
  assert.deepEqual(step("a", "down"), { id: "b" });
  assert.equal(step("b", "down"), null, "siblings on the same side only");
  assert.deepEqual(step("b", "right"), { unfold: "b" }, "outward from a folded node opens it");
  assert.deepEqual(step("c", "left"), { id: "c1" }, "start side: left goes outward");
  assert.deepEqual(step("c", "right"), { id: "r" });
  assert.deepEqual(step("r", "left", true), { id: "a" }, "RTL mirrors");
  assert.deepEqual(step("c1", "home"), { id: "r" });
});

test("mind map: ELK layout puts branches on their sides without overlaps", async () => {
  const g = mindmap.mindMapGraph(mapRoot, new Set(["a", "b", "c", "c2"]));
  const boxes = await mindmap.layoutMindMap(g, (mind) => mindmap.measureMindMapNode(mind));
  assert.equal(boxes.size, g.order.length);
  const r = boxes.get("r");
  assert.deepEqual([r.x, r.y], [0, 0], "the root anchors the map");
  for (const id of ["a", "b", "a1"]) assert.ok(boxes.get(id).x > r.x + r.width, `${id} is right of the root`);
  for (const id of ["c", "d", "c2x"]) assert.ok(boxes.get(id).x + boxes.get(id).width < r.x, `${id} is left of the root`);
  const list = [...boxes.entries()];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const [ia, a] = list[i];
      const [ib, b] = list[j];
      const apart = a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y;
      assert.ok(apart, `${ia} and ${ib} overlap`);
    }
  const rtl = await mindmap.layoutMindMap(g, (mind) => mindmap.measureMindMapNode(mind), { rtl: true });
  assert.ok(rtl.get("a").x < 0, "RTL: the end side is on the left");
});

/* ───────────── The outliner, mounted (jsdom): article view, switching views, print ───────────── */

const media = {};
let React, act, createRoot;
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
  for (const key of ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "KeyboardEvent", "MouseEvent", "FocusEvent", "CustomEvent", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"])
    Object.defineProperty(globalThis, key, { value: key === "window" ? window : window[key], configurable: true, writable: true });
  globalThis.ResizeObserver = window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = (query) => ({ matches: !!media[query], media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.HTMLElement.prototype.scrollTo = function () {};
  window.scrollTo = globalThis.scrollTo = () => {};
  const error = console.error;
  console.error = (...args) => (String(args[0]).includes("not wrapped in act") ? undefined : error(...args));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const doc = () => [
  {
    id: "card",
    text: "Model card",
    data: { view: "article", note: "Lead paragraph with $x^2$." },
    children: [
      { id: "h", text: "Summary", data: { heading: 1 }, children: [{ id: "p", text: "Body **text**.", data: { note: "| A | B |\n|---|---|\n| 1 | 2 |" } }] },
      { id: "t", text: "Ship it", checked: false },
    ],
  },
  { id: "other", text: "Other" },
];

async function mountOutliner(props = {}) {
  await domEnv();
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const handle = React.createRef();
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () =>
    root.render(React.createElement(TooltipProvider, null, React.createElement(Outliner, { ref: handle, defaultValue: doc(), hoistedId: "card", ...props }))),
  );
  await act(async () => sleep(30));
  return { host, handle, unmount: () => act(async () => root.unmount()) };
}
const click = (el) => act(async () => void el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })));

test("outliner: a zoomed article item reads as prose; ticking a task is one undo step", async () => {
  const view = await mountOutliner();
  const prose = view.host.querySelector("[data-article]");
  assert.ok(prose, "the article view is shown");
  assert.equal(view.host.querySelector("[role=tree]"), null, "no bullet tree in article view");
  assert.equal(prose.querySelector("h3")?.textContent, "Summary");
  assert.equal(prose.querySelector("p strong")?.textContent, "text", "inline marks render");
  assert.ok(prose.querySelector("table"), "notes render rich, inline");
  const box = prose.querySelector("[role=checkbox]");
  await click(box);
  const ticked = view.handle.current.getValue()[0].children[1];
  assert.equal(ticked.checked, true);
  await act(async () => view.handle.current.undo());
  assert.equal(view.handle.current.getValue()[0].children[1].checked, false, "one undo restores it");
  await view.unmount();
});

test("outliner: the view switcher changes data.view (an undoable edit) and the body follows", async () => {
  const view = await mountOutliner();
  const radios = [...view.host.querySelectorAll("[data-view-switcher] [role=radio]")];
  assert.deepEqual(radios.map((r) => r.dataset.view), ["list", "board", "article", "mindmap"]);
  assert.equal(radios.find((r) => r.getAttribute("aria-checked") === "true").dataset.view, "article");
  await click(radios[0]);
  assert.equal(view.handle.current.getValue()[0].data.view, undefined, "list: the field is removed");
  assert.ok(view.host.querySelector("[role=tree]"), "the outline is back");
  await click(view.host.querySelector('[data-view="mindmap"]'));
  assert.equal(view.handle.current.getValue()[0].data.view, "mindmap");
  assert.ok(view.host.querySelector("[data-mindmap-slot]"), "the mind map slot mounts (its engine loads lazily)");
  await act(async () => view.handle.current.undo());
  assert.equal(view.handle.current.getValue()[0].data.view, undefined);
  await view.unmount();
});

test("print: the current zoom prints as a chrome-free article, then cleans up", async () => {
  const view = await mountOutliner();
  const { requestPrint } = await load("/src/registry/outliner/outliner-print.tsx");
  let printed = null;
  window.print = () => {
    const sheet = document.querySelector(".ol-print-root");
    printed = sheet && {
      parent: sheet.parentElement === document.body,
      title: sheet.querySelector("h1")?.textContent,
      crumb: sheet.querySelector("header p")?.textContent,
      article: !!sheet.querySelector("[data-article]"),
      heading: sheet.querySelector("[data-article] h3")?.textContent,
      chrome: !!sheet.querySelector("[data-view-switcher], [role=tree], button[aria-label='Copy code']"),
      eagerImages: [...sheet.querySelectorAll("img")].every((img) => img.loading === "eager"),
    };
  };
  // A request from another outliner (a different owner) prints nothing here.
  await act(async () => requestPrint({}, "card"));
  await act(async () => sleep(30));
  assert.equal(view.host.ownerDocument.querySelectorAll(".ol-print-root").length, 0);
  // The outliner's own request (the ⌘K command and the handle both go through it).
  await act(async () => view.handle.current.print());
  await act(async () => sleep(120));
  assert.ok(printed, "window.print ran once the sheet was ready");
  assert.deepEqual(printed, { parent: true, title: "Model card", crumb: "Untitled", article: true, heading: "Summary", chrome: false, eagerImages: true });
  await act(async () => void window.dispatchEvent(new window.Event("afterprint")));
  assert.equal(document.querySelector(".ol-print-root"), null, "the print copy leaves after printing");
  await view.unmount();
});
