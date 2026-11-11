// The inline grammar with nested styles: one linear scanner, styles as containers around the
// segments inside them, today's priority between constructs. Static render, HTML copy and plain
// text stay byte-identical for every fixture string but the one that asks for `*emphasis*`.
// Eight root-relative link fixtures were intentionally refreshed when those links became live;
// their portable HTML still retains literal Markdown so a paste cannot change its origin.
//
//   cd studio && node --test tests/live-field-grammar.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { load, stopVite } from "./harness/outliner-dom.mjs";
import { corpus, fixtureStrings } from "./harness/inline-corpus.mjs";

let inline, ic, React, renderToStaticMarkup;
before(async () => {
  inline = await load("/src/registry/outliner/inline.tsx");
  ic = await load("/src/registry/outliner/interchange.ts");
  React = await import("react");
  ({ renderToStaticMarkup } = await import("react-dom/server"));
});
after(() => stopVite());

const html = (source, props = {}) =>
  renderToStaticMarkup(React.createElement(inline.InlineText, { source, ...props }));
/** Visible content with its styles: `[bi:x]` is bold + italic, `{kind:display}` a token. */
const show = (source) =>
  inline
    .parseInline(source)
    .filter((s) => s.kind !== "delimiter")
    .map((s) => {
      const body = s.kind === "text" ? s.display : `{${s.kind}:${s.display}}`;
      return s.marks?.length ? `[${s.marks.map((m) => m.kind[0]).join("")}:${body}]` : body;
    })
    .join("");
const sha = (value) => createHash("sha256").update(value).digest("hex").slice(0, 12);
const MARKUP = /[\\`*_~=[\]!#@$]|https?:/;

test("fixture parity: static HTML, HTML copy and plain text match the flat grammar's, but for the *emphasis* note", () => {
  const golden = JSON.parse(
    readFileSync(new URL("./fixtures/inline-parity.json", import.meta.url), "utf8"),
  );
  const checked = [];
  const changed = [];
  for (const s of fixtureStrings()) {
    if (!MARKUP.test(s)) {
      // no markup character: one plain run in any version of the grammar
      const segments = inline.parseInline(s);
      assert.ok(
        segments.length <= 1 && segments.every((x) => x.kind === "text" && !x.marks),
        JSON.stringify(s),
      );
      continue;
    }
    const want = golden[sha(s)];
    if (!want) continue; // a fixture added after the record: nothing to compare
    checked.push(s);
    const copy = ic.exportOutlineHtml([{ id: "x", text: s }]);
    const plain = inline.inlineToPlain(s, undefined, { dates: "absolute" });
    if (sha(`${html(s)}\u0000${copy}\u0000${plain}`) !== want) changed.push(s);
  }
  console.log(
    `parity: ${checked.length} fixture strings with markup compared, ${changed.length} read differently`,
  );
  assert.ok(
    checked.length >= 800,
    "the retained fixtures still exercise at least 800 baseline markup cases",
  );
  assert.equal(changed.length, 1, JSON.stringify(changed.map((s) => s.slice(0, 80))));
  assert.match(changed[0], /paragraph with \*emphasis\*/);
});

test("styles nest, one of each kind; a container never holds its own delimiter as text", () => {
  const cases = {
    "**a *b* c**": "[b:a ][bi:b][b: c]",
    "*a **b** c*": "[i:a ][ib:b][i: c]",
    "***x***": "[bi:x]",
    "**bold *and italic***": "[b:bold ][bi:and italic]",
    "***b** i*": "[ib:b][i: i]",
    "~~**struck bold**~~": "[sb:struck bold]",
    "==a **b**== c": "[h:a ][hb:b] c",
    "**a __b__ c**": "[b:a ][bi:b][b: c]",
    "Use *x* here": "Use [i:x] here",
    "2*3*4": "2*3*4",
    "a * b * c": "a * b * c",
    "snake*x*y": "snake*x*y",
    "**2*3**": "**2*3**",
    __a_b__: "__a_b__",
    "**a****b**": "[b:a][b:b]",
    "****x****": "**[b:x]**",
    "**a ~~b** c~~": "[b:a ~~b] c~~",
    "\\**not**": "{escape:*}*not**",
    foo__bar__baz: "foo[i:bar]baz",
    "**unclosed": "**unclosed",
    "**a\nb**": "**a\nb**",
  };
  for (const [source, expected] of Object.entries(cases))
    assert.equal(show(source), expected, source);
});

test("tokens inside a style stay live; a style's edge clips an open word and stops a closed token", () => {
  const cases = {
    "**see https://x.y**": "[b:see ][b:{url:https://x.y}]",
    "**a\\*b**": "**a{escape:*}b**",
    "**a `c` b**": "[b:a ][b:{code:c}][b: b]",
    "__a $x$ b__": "[i:a ][i:{math:x}][i: b]",
    "** #tag**": "[b: ][b:{tag:#tag}]",
    "**#launch**": "[b:{tag:#launch}]",
    "*@ann*": "[i:{mention:@ann}]",
    "t__ag #t__ here": "t[i:ag ][i:{tag:#t}] here",
    "**a `b** c`": "[b:a `b] c`",
    "`code **x**`": "{code:code **x**}",
    "$a*b*c$": "{math:a*b*c}",
    "[**l**](https://x.y)": "{link:**l**}",
    "a*#b and x__#y": "a*#b and x__#y",
    "x__#y__": "x[i:{tag:#y}]",
    "cost $5 and $10": "cost $5 and $10",
  };
  for (const [source, expected] of Object.entries(cases))
    assert.equal(show(source), expected, source);
  const url = inline.parseInline("**see https://x.y**").find((s) => s.kind === "url");
  assert.equal(url.href, "https://x.y", "a URL never swallows the closing delimiter");
});

test("every parse covers its source in order, styles nest properly, never twice one kind, never across a line", () => {
  const { all } = corpus();
  for (const s of all) {
    const segments = inline.parseInline(s);
    let at = 0;
    for (const segment of segments) {
      assert.equal(segment.start, at, JSON.stringify(s));
      at = segment.end;
      const marks = segment.marks ?? [];
      assert.equal(
        new Set(marks.map((m) => m.kind)).size,
        marks.length,
        `one of each kind: ${JSON.stringify(s)}`,
      );
      for (let i = 0; i < marks.length; i++) {
        const mark = marks[i];
        assert.ok(mark.start <= segment.start && segment.end <= mark.end, JSON.stringify(s));
        assert.ok(
          !s.slice(mark.start, mark.end).includes("\n"),
          `line-local: ${JSON.stringify(s)}`,
        );
        if (i > 0)
          assert.ok(
            marks[i - 1].contentStart <= mark.start && mark.end <= marks[i - 1].contentEnd,
            JSON.stringify(s),
          );
      }
    }
    assert.equal(at, s.length, JSON.stringify(s));
  }
});

test("static render nests one element per container, with today's classes and source offsets", () => {
  const out = html("**a *b* c**");
  assert.equal((out.match(/<strong/g) ?? []).length, 1, out);
  assert.match(
    out,
    /<strong class="font-semibold"><span data-src="2">a <\/span><em class="italic"><span data-src="5">b<\/span><\/em><span data-src="7"> c<\/span><\/strong>/,
  );
  assert.match(
    html("Use *x* here"),
    /<em class="italic"><span data-src="5">x<\/span><\/em>/,
    "a single-star italic renders",
  );
  assert.equal(inline.inlineToPlain("**a *b* c** #t"), "a b c #t");
  assert.equal(inline.inlineToSpeech("**a *b* c** #t"), "a b c tag t");
  assert.equal(inline.inlineToLabel("**Plan *now*** #t"), "Plan now");
});

test("a line at an offset (a rich note's line) keeps one wrapper per container and its search marks", () => {
  const wrappers = (out) => (out.match(/bg-signal-muted/g) ?? []).length;
  assert.equal(wrappers(html("==a **b** c==")), 1);
  const shifted = html("==a **b** c==", { offset: 100, marks: [{ start: 106, end: 107 }] });
  assert.equal(wrappers(shifted), 1, shifted);
  assert.match(shifted, /<mark[^>]*data-src="106"[^>]*>b<\/mark>/);
});

test("walkNested groups by container, skips delimiters, and folds any tree", () => {
  const tree = inline.walkNested(
    inline.parseInline("x **a *b*** `c`"),
    (s) => (s.kind === "text" ? s.display : `{${s.kind}}`),
    (mark, children) => `${mark.kind}(${children.join("")})`,
  );
  assert.deepEqual(tree, ["x ", "bold(a italic(b))", " ", "{code}"]);
  assert.deepEqual(
    inline.walkNested(
      inline.parseInline("**a****b**"),
      (s) => s.display,
      (mark, children) => `${mark.id}:${children.join("")}`,
    ),
    ["0:a", "1:b"],
    "two touching containers of one kind stay two",
  );
});

test("literalInline keeps every character literal, escapes only what would open markup, and stays linear", () => {
  const LIVE = new Set(["text", "url", "tag", "mention", "escape"]);
  const bad = [];
  for (const s of corpus().all) {
    const literal = inline.literalInline(s);
    const segments = inline.parseInline(literal);
    if (inline.inlineToPlain(literal) !== s || segments.some((x) => x.marks || !LIVE.has(x.kind)))
      bad.push(s);
  }
  assert.deepEqual(bad, []);
  const cases = {
    "[[Launch goals|goals-1]] __init__ #tag https://x.dev/a_b":
      "\\[[Launch goals|goals-1]] \\__init__ #tag https://x.dev/a_b",
    "between $x$ and $y$": "between \\$x$ and \\$y$",
    "[x] typed box": "[x] typed box",
    "**a *b* c**": "\\**a \\*b* c**",
    "\\*": "\\\\*",
    "a\\_b": "a\\\\_b",
    "->**[l](https://u.v)!(2026-11-03)$x$xhttps://e.com/p---\\]!(2026-11-03)==__": null,
  };
  for (const [raw, want] of Object.entries(cases)) {
    const literal = inline.literalInline(raw);
    assert.equal(inline.inlineToPlain(literal), raw, raw);
    if (want !== null) assert.equal(literal, want, raw);
  }
});

test("linear parse: 16 KB of dense markup (measured, reported)", () => {
  const unit = "**a *b* `c` ~~d~~ ==e== $x$ #t @m [l](https://x.y) !(2026-11-03) \\* ";
  const dense = unit.repeat(Math.ceil(16384 / unit.length)).slice(0, 16384);
  const time = (fn) => {
    fn();
    const start = performance.now();
    for (let i = 0; i < 5; i++) fn();
    return (performance.now() - start) / 5;
  };
  const parse = time(() => inline.parseInline(dense));
  const literal = time(() => inline.literalInline(dense));
  const double = time(() => inline.parseInline(dense + dense));
  console.log(
    `16 KB dense line: parseInline ${parse.toFixed(2)} ms, literalInline ${literal.toFixed(2)} ms, 32 KB parse ${double.toFixed(2)} ms`,
  );
  assert.ok(double < parse * 6 + 5, "doubling the input does not square the time");
});
