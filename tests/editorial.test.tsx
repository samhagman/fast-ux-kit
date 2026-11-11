import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";
import * as Editorial from "../src/editorial/index.js";
import * as Components from "../src/components/index.js";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("every editorial family has a level, a job and public exports for all its parts", () => {
  const names = new Set<string>();
  for (const entry of Editorial.editorialManifest) {
    assert.ok(!names.has(entry.name), `${entry.name} is listed once`);
    names.add(entry.name);
    assert.ok(["atom", "molecule", "organism"].includes(entry.level), `${entry.name} has a level`);
    assert.ok(entry.job.endsWith("."), `${entry.name} states its job as a sentence`);
    assert.ok(entry.description.endsWith("."), `${entry.name} is described in a sentence`);
    for (const part of entry.parts) {
      let value: unknown = Editorial;
      for (const member of part.split(".")) {
        assert.ok(
          value !== null &&
            (typeof value === "object" || typeof value === "function") &&
            member in value,
          `${entry.name} exposes ${part}`,
        );
        value = (value as Record<string, unknown>)[member];
      }
      assert.ok(value, `${part} is available`);
    }
  }
  assert.deepEqual(
    Editorial.editorialLevels.map((level) => level.id),
    ["atom", "molecule", "organism"],
  );
});

test("families marked for the app catalog are exported from it and listed there", () => {
  const shared = Editorial.editorialManifest
    .filter((entry) => entry.app)
    .map((entry) => entry.name);
  assert.deepEqual(shared.sort(), [
    "BarList",
    "CodeBlock",
    "FileTree",
    "KeyChord",
    "Sparkline",
    "Terminal",
  ]);
  const catalog = new Set(Components.componentManifest.map((entry) => entry.name));
  for (const name of shared) {
    assert.ok(catalog.has(name), `${name} is in the app catalog`);
    assert.equal(
      (Components as Record<string, unknown>)[name],
      (Editorial as Record<string, unknown>)[name],
      `${name} is one implementation`,
    );
  }
});

test("an article renders to script-free markup with no style attributes", () => {
  const html = renderToStaticMarkup(
    h(
      Editorial.Article,
      null,
      h(Editorial.ArticleHeader, {
        kicker: "Fieldbook",
        title: "A headline",
        deck: "A deck.",
        byline: ["Ada Park", "February 2028"],
      }),
      h(
        Editorial.ArticleBody,
        null,
        h(
          "p",
          null,
          "Text with a ",
          h(Editorial.Term, { definition: "a short gloss" }, "term"),
          h(Editorial.MarginNote, null, "A tangent."),
          h(Editorial.Sparkline, { values: [4, 9, 6, 12], label: "Notes", unit: "notes" }),
          h(Editorial.KeyChord, { keys: "Cmd+K then S" }),
        ),
        h(
          Editorial.Figure,
          { caption: "What to notice.", credit: "Illustration." },
          h(Editorial.BarList, {
            label: "Sizes",
            items: [
              { label: "A", value: 3 },
              { label: "B", value: 6, marked: true },
            ],
          }),
        ),
        h(Editorial.CodeBlock, {
          code: 'const greeting = "hi"; // say it\nreturn 42;',
          language: "ts",
          filename: "a.ts",
          notes: [{ line: 2, text: "The answer." }],
        }),
        h(Editorial.Chronoline, {
          label: "Events",
          events: [
            { at: 0, label: "Start" },
            { at: 9, label: "End" },
          ],
        }),
        h(Editorial.Pipeline, {
          label: "Flow",
          active: 1,
          stages: [{ label: "One" }, { label: "Two", detail: "Second." }],
        }),
        h(Editorial.StatusReport, { summary: "A prototype.", works: ["A"], notYet: ["B"] }),
      ),
    ),
  );
  assert.doesNotMatch(html, /\sstyle=/, "no inline styles, so a strict style-src policy holds");
  assert.doesNotMatch(html, /<script/);
  assert.match(html, /class="fux-tok-string">&quot;hi&quot;</);
  assert.match(html, /class="fux-tok-comment">\/\/ say it</);
  assert.match(html, /data-line="2" data-marked=""/);
  assert.match(html, /aria-label="Notes: 4 notes to 12 notes"/);
  assert.match(html, /aria-current="step"/);
  assert.match(html, /role="note"/);
});

test("a status report draws only the columns it has, and controls can render inert", () => {
  const both = renderToStaticMarkup(
    h(Editorial.StatusReport, {
      summary: "Local prototype.",
      works: ["Runs"],
      notYet: ["A release"],
    }),
  );
  assert.match(both, /data-kind="works"/);
  assert.match(both, /data-kind="not-yet"/);
  assert.doesNotMatch(both, /data-single/);
  const one = renderToStaticMarkup(
    h(Editorial.StatusReport, { summary: "Local.", works: ["Runs"] }),
  );
  assert.match(one, /data-single=""/);
  assert.doesNotMatch(one, /not-yet|Not yet/);
  const none = renderToStaticMarkup(h(Editorial.StatusReport, { summary: "Planned." }));
  assert.doesNotMatch(none, /fux-status-columns/);
  // The headline is the page's h1 unless the page already has one.
  assert.match(
    renderToStaticMarkup(h(Editorial.ArticleHeader, { title: "T" })),
    /<h1 class="fux-headline">/,
  );
  assert.match(
    renderToStaticMarkup(h(Editorial.ArticleHeader, { title: "T", titleAs: "h2" })),
    /<h2 class="fux-headline">/,
  );
  // Playback can sit in server markup, inert, so nothing shifts when the page hydrates.
  const inert = renderToStaticMarkup(
    h(Editorial.Playback, {
      playing: false,
      onToggle() {},
      index: 0,
      count: 2,
      label: "Demo",
      disabled: true,
    }),
  );
  assert.equal(inert.match(/disabled=""/g)?.length, 3);
  // A long line wraps instead of scrolling, so the listing is not a focusable scroll region.
  const code = renderToStaticMarkup(h(Editorial.CodeBlock, { code: "a", filename: "a.ts" }));
  assert.doesNotMatch(code, /tabindex|aria-label/);
});

test("the tokenizer keeps every character and marks only what it recognises", () => {
  const code = 'def area(r):\n    """Circle."""\n    return 3.14 * r ** 2  # approx';
  const lines = Editorial.tokenizeCode(code, "python");
  assert.equal(lines.map((line) => line.map((token) => token.text).join("")).join("\n"), code);
  const kinds = (line: number) => lines[line]!.filter((t) => t.kind !== "plain").map((t) => t.kind);
  assert.deepEqual(kinds(0), ["keyword"]);
  assert.deepEqual(kinds(1), ["string"]);
  assert.deepEqual(kinds(2), ["keyword", "number", "number", "comment"]);
  const unknown = Editorial.tokenizeCode("a <b> c", "klingon");
  assert.deepEqual(unknown, [[{ kind: "plain", text: "a <b> c" }]]);
  const open = Editorial.tokenizeCode('const s = "never closed', "ts");
  assert.equal(open[0]!.map((token) => token.text).join(""), 'const s = "never closed');
});

test("the tokenizer does not mistake names, apostrophes or fragments for syntax", () => {
  const marked = (code: string, language: string) =>
    Editorial.tokenizeCode(code, language).map((line) =>
      line.filter((token) => token.kind !== "plain").map((token) => `${token.kind}:${token.text}`),
    );
  // A keyword used as a member or an object key is a name.
  assert.deepEqual(marked('source: z.enum(["a"]).optional(),', "ts"), [['string:"a"']]);
  assert.deepEqual(marked("{from: 6, to: 10}", "ts"), [["number:6", "number:10"]]);
  assert.deepEqual(marked("switch (x) { default: return [...this.items]; }", "ts"), [
    ["keyword:switch", "keyword:default", "keyword:return", "keyword:this"],
  ]);
  assert.deepEqual(marked("const ok = a ? true : false;", "ts"), [
    ["keyword:const", "keyword:true", "keyword:false"],
  ]);
  // Python block keywords end in a colon and stay keywords.
  assert.deepEqual(marked("try:\n    pass\nelse:\n    pass", "python"), [
    ["keyword:try"],
    ["keyword:pass"],
    ["keyword:else"],
    ["keyword:pass"],
  ]);
  // An apostrophe in markup and a quote inside a regular expression do not swallow the line.
  assert.deepEqual(marked("<p>don't stop</p> // note", "tsx"), [["comment:// note"]]);
  assert.deepEqual(marked("const re = /it's/gi; const n = a / b / 2;", "ts"), [
    ["keyword:const", "string:/it's/gi", "keyword:const", "number:2"],
  ]);
  // `#` is a comment only where the language says so.
  assert.deepEqual(marked('echo $# "$1" # count', "sh"), [['string:"$1"', "comment:# count"]]);
  assert.deepEqual(marked("url: http://a.test/#top # home", "yaml"), [["comment:# home"]]);
  assert.deepEqual(marked("x = 1#c", "python"), [["number:1", "comment:#c"]]);
  // Language-specific strings.
  assert.deepEqual(marked("for (;;) yield return null;", "csharp"), [
    ["keyword:for", "keyword:yield", "keyword:return", "keyword:null"],
  ]);
  assert.deepEqual(marked(`var q = '"'; var p = @"C:\\dir ""x""";`, "cs"), [
    ["keyword:var", "string:'\"'", "keyword:var", 'string:@"C:\\dir ""x"""'],
  ]);
  assert.deepEqual(marked('let s = """\nhi "there"\n"""', "swift"), [
    ["keyword:let", 'string:"""'],
    ['string:hi "there"'],
    ['string:"""'],
  ]);
  assert.deepEqual(marked("a = '''\nx # not a comment\n'''", "toml"), [
    ["string:'''"],
    ["string:x # not a comment"],
    ["string:'''"],
  ]);
  // Windows line endings leave nothing behind.
  const crlf = Editorial.tokenizeCode("a\r\nb", "ts");
  assert.deepEqual(crlf, [[{ kind: "plain", text: "a" }], [{ kind: "plain", text: "b" }]]);
});

test("a file tree reads indented text, notes and the marked entry", () => {
  const html = renderToStaticMarkup(
    h(Editorial.FileTree, { tree: "app/\n  *main.ts  # entry\n  lib/\n    util.ts" }),
  );
  assert.match(html, /data-kind="folder"[^>]*>app\//);
  assert.match(html, /data-marked=""[^>]*>main\.ts</);
  assert.match(html, /fux-tree-note">entry</);
  assert.equal(html.match(/fux-tree-level/g)?.length, 3);
});

test("the editorial entry needs React and nothing else", async () => {
  const result = await build({
    stdin: {
      contents: 'export * from "./src/editorial/index.ts";',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    bundle: true,
    format: "esm",
    write: false,
    metafile: true,
    external: ["react", "react/jsx-runtime"],
  });
  const packages = Object.keys(result.metafile!.inputs).filter((name) =>
    name.includes("node_modules"),
  );
  assert.deepEqual(packages, [], "no dependency beyond React is bundled");
});

test("the editorial stylesheet stands alone and reads only its own tokens", () => {
  const css = read("editorial/editorial.css");
  assert.doesNotMatch(css, /@import|@apply|@tailwind/);
  const defined = new Set([...css.matchAll(/(--fux-ed-[a-z-]+)\s*:/g)].map((match) => match[1]));
  for (const match of css.matchAll(/var\((--fux-ed-[a-z-]+)/g))
    assert.ok(defined.has(match[1]), `Missing editorial token ${match[1]}`);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /:focus-visible/);
});
