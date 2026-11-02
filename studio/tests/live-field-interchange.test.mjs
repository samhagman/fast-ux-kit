// Nested styles across the clipboard and files: HTML copy nests and HTML paste nests back;
// Markdown for other apps is CommonMark that a CommonMark reader (micromark with GFM
// strikethrough) reads with the same styles on every character; a Markdown file from another
// app is read by CommonMark's rules, while the outliner's own text keeps its grammar.
//
//   cd studio && node --test tests/live-field-interchange.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { micromark } from "micromark";
import { gfmStrikethrough, gfmStrikethroughHtml } from "micromark-extension-gfm-strikethrough";
import { load, stopVite } from "./harness/outliner-dom.mjs";
import { corpus } from "./harness/inline-corpus.mjs";
import { bridge, fieldState, live, select, source, toggleMark } from "./harness/live-field.mjs";

after(() => stopVite());
const inline = await load("/src/registry/outliner/inline.tsx");
const ic = await load("/src/registry/outliner/interchange.ts");
const parseHtml = (html) => new JSDOM(html).window.document;
const NAME = { strong: "bold", em: "italic", del: "strike", code: "code", mark: "highlight" };
const ENTITY = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'" };
const signature = (char, kinds) => (/\s/.test(char) ? char : `${char}:${[...kinds].sort().join("+")}`);
const trim = (chars) => {
  let a = 0;
  let b = chars.length;
  while (a < b && /^\s$/.test(chars[a])) a++;
  while (b > a && /^\s$/.test(chars[b - 1])) b--;
  return chars.slice(a, b).join("|");
};
/** Every visible character of stored source with the styles our grammar gives it. */
const ours = (stored) => {
  const out = [];
  for (const segment of inline.parseInline(stored)) {
    if (segment.kind === "delimiter") continue;
    const kinds = (segment.marks ?? []).map((mark) => mark.kind);
    if (segment.kind === "code") kinds.push("code");
    // dates and item links show as stored; math is written as TeX, whose backslash escapes a
    // plain CommonMark reader resolves
    const token = stored.slice(segment.start, segment.end);
    const shown = segment.kind === "math" ? token.replace(/\\([!-/:-@[-`{-~])/g, "$1") : ["date", "ref"].includes(segment.kind) ? token : segment.display;
    for (const char of shown) out.push(signature(char, kinds));
  }
  return trim(out);
};
/** The same, as CommonMark with GFM strikethrough reads exported Markdown (highlight as <mark>). */
const commonmark = (markdown) => {
  const html = micromark(markdown, { allowDangerousHtml: true, extensions: [gfmStrikethrough()], htmlExtensions: [gfmStrikethroughHtml()] }).replace(/^<p>|<\/p>\n?$/g, "");
  const out = [];
  const open = [];
  const token = /<(\/?)(strong|em|del|code|mark)>|<[^>]*>|&(amp|lt|gt|quot|#39);|([^<&])/gu;
  for (let m = token.exec(html); m; m = token.exec(html)) {
    if (m[2]) {
      if (m[1]) open.splice(open.lastIndexOf(NAME[m[2]]), 1);
      else open.push(NAME[m[2]]);
    } else if (m[3] || m[4]) out.push(signature(m[3] ? ENTITY[m[3]] : m[4], open));
  }
  return trim(out);
};
const cm = (markdown) => micromark(markdown, { extensions: [gfmStrikethrough()], htmlExtensions: [gfmStrikethroughHtml()] });

test("HTML copy nests one element per style; HTML paste nests back without doubling a kind", () => {
  assert.ok(ic.exportOutlineHtml([{ id: "a", text: "**a *b***" }]).includes("<strong>a <em>b</em></strong>"));
  const styles = (text) =>
    inline
      .parseInline(text)
      .filter((s) => s.kind !== "delimiter")
      .map((s) => `${s.display}:${(s.marks ?? []).map((m) => m.kind).sort().join("+")}`)
      .join("|");
  for (const s of ["**a *b***", "*a **b** c*", "a ~~**s** x~~", "==a **b**== c", "**a** and *b*", "**bold `code` #tag**"]) {
    const html = ic.exportOutlineHtml([{ id: "a", text: s }]);
    const back = ic.importOutlineHtml(html, () => "x", parseHtml)[0].text;
    assert.equal(styles(back), styles(s), `${s} → ${html} → ${back}`);
  }
  assert.equal(ic.importOutlineHtml("<ul><li><b>a <b>b</b></b> c</li></ul>", () => "x", parseHtml)[0].text, "a **b** c", "bold inside bold adds nothing");
  assert.equal(ic.importOutlineHtml("<ul><li><b>a <i>b</i></b></li></ul>", () => "x", parseHtml)[0].text, "**a __b__**");
});

test("toMarkdown writes CommonMark from the parse: legacy __x__ is *x*, ~~ and == stay, no delimiter ever merges", () => {
  const cases = {
    "Use *x* and **a *b* c**": "Use *x* and **a *b* c**",
    "old __x__, new *y*, **b __i__**": "old *x*, new *y*, __b *i*__",
    "`__code__` and snake__case": "`__code__` and snake\\_\\_case",
    "~~gone~~ and ==marked==": "~~gone~~ and ==marked==",
    "**bold *both***": "__bold *both*__",
    "2*3*4": "2\\*3\\*4",
    "cost $5 and $10": "cost \\$5 and \\$10",
    "math $x$1 and $x$ ok": "math \\$x\\$1 and $x$ ok",
    "**a!**b": "<strong>a\\!</strong>b",
    "    indented": "indented",
    "# not a heading": "\\# not a heading",
    "### three hashes": "\\### three hashes",
    "1. not numbered": "1\\. not numbered",
    "- not a bullet": "\\- not a bullet",
    "---": "\\---",
    "snake_case_name": "snake_case_name",
    "#launch plan": "#launch plan",
  };
  for (const [stored, markdown] of Object.entries(cases)) assert.equal(ic.toMarkdown(stored), markdown, stored);
  assert.equal(ic.toMarkdown("==x==", { highlight: "html" }), "<mark>x</mark>");
});

test("exported Markdown reads with the same styles in CommonMark, over the corpus and every format command", () => {
  const bad = [];
  let cases = 0;
  const check = (stored) => {
    cases++;
    const md = ic.toMarkdown(stored, { highlight: "html" });
    if (ours(stored) !== commonmark(md)) bad.push({ stored, md });
  };
  // titles from the corpus (one line, no block structure; CommonMark replaces NUL characters)
  for (const s of corpus({ generated: 3000 }).all) if (!s.includes("\n") && !/^\s*(?:\||```|~~~|\$\$|!\[)/.test(s) && !s.includes("\0")) check(s);
  // every bold, italic and strike command over overlapping and touching styles
  for (const base of ["a b c", "**a b** c", "a *b c*", "**a *b* c**", "*a **b** c*", "x **y** z", "**a****b**", "word**s** and more", "__legacy__ and *new*", "***both*** end", "a ~~b~~ c", "abc def", "a!b (a)b"]) {
    const size = bridge.sourceToDoc("title", base).content.size;
    for (const kind of ["bold", "italic", "strike"])
      for (let from = 1; from < size - 1; from++)
        for (let to = from + 1; to <= size - 1; to++) {
          const state = select(fieldState("title", base, 0), from, to);
          let tr = null;
          if (!state || !toggleMark(state.schema.marks[kind], null, { removeWhenPresent: false })(state, (t) => (tr = t))) continue;
          check(source(live.applyCommand(state, { field: "title" }, tr).state));
        }
  }
  console.log(`CommonMark reading: ${cases - bad.length}/${cases} match`);
  assert.ok(cases > 3000);
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length} read differently`);
});

test("Markdown for other apps' clipboards is CommonMark; the downloaded file keeps the outliner's own spelling", () => {
  const nodes = [
    { id: "a", text: "Use __x__ and **b**", children: [{ id: "b", text: "# literal" }] },
    { id: "c", text: "done **now**", data: { completed: true } },
  ];
  assert.equal(ic.exportOutline(nodes, "markdown", { metadata: false }), "- Use *x* and **b**\n  - \\# literal\n- ~~done **now**~~");
  const own = ic.exportOutline(nodes, "markdown");
  assert.match(own, /^- Use __x__ and \*\*b\*\*$/m);
  assert.deepEqual(
    ic.importOutline(own, () => "x").map((n) => n.text),
    ["Use __x__ and **b**", "done **now**"],
    "the outliner's own file reads back exactly",
  );
});

test("a Markdown file from another app is read by CommonMark; the outliner's own text keeps its grammar", async () => {
  const file = ic.importMarkdownFile("- run __init__ first\n- *x* and **y**\n- ~~old~~ plan", cm, () => "x", parseHtml);
  assert.deepEqual(
    file.map((n) => n.text),
    ["run **init** first", "__x__ and **y**", "~~old~~ plan"],
  );
  assert.equal(ic.importOutline("- run __init__ first", () => "x")[0].text, "run __init__ first");
  for (const s of ["**a *b***", "a *b* c", "~~**s**~~ x"]) {
    const md = ic.toMarkdown(s);
    const back = ic.importMarkdownFile(md, cm, () => "x", parseHtml)[0].text;
    assert.equal(ic.toMarkdown(back), md, `${s} → ${md} → ${back}`);
  }
  const reader = await ic.loadCommonMark();
  assert.equal(reader("**a** <script>x</script>").includes("<script>"), false, "raw HTML in a file is escaped");
  assert.deepEqual(
    ic.importMarkdownFile("- one\n- **two**", reader, () => "x", parseHtml).map((n) => n.text),
    ["one", "**two**"],
  );
});
