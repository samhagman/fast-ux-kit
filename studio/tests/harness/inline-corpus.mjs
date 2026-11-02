// Strings for the inline-grammar suites: every string literal in the studio and root test files
// and the studio demo fixture (a superset of every title and note they use), plus hand-written
// edge cases and seeded random concatenations of markup fragments. Not a test file itself.
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const studio = fileURLToPath(new URL("../..", import.meta.url));
const repo = path.resolve(studio, "..");
const ts = createRequire(path.join(studio, "package.json"))("typescript");

/** Every string and template piece in one source file, in order. */
export function literalsOf(file) {
  const text = readFileSync(file, "utf8");
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, text);
  const S = ts.SyntaxKind;
  const VALUE = new Set([S.Identifier, S.CloseParenToken, S.CloseBracketToken, S.NumericLiteral, S.StringLiteral, S.ThisKeyword]);
  const STRINGS = new Set([S.StringLiteral, S.NoSubstitutionTemplateLiteral, S.TemplateHead, S.TemplateMiddle, S.TemplateTail]);
  const out = [];
  const braces = []; // brace depth inside each open template expression
  let previous = S.Unknown;
  for (let kind = scanner.scan(); kind !== S.EndOfFileToken; kind = scanner.scan()) {
    // A slash after a value divides; anywhere else it starts a regular expression.
    if ((kind === S.SlashToken || kind === S.SlashEqualsToken) && !VALUE.has(previous)) kind = scanner.reScanSlashToken();
    if (kind === S.OpenBraceToken && braces.length) braces[braces.length - 1]++;
    if (kind === S.CloseBraceToken && braces.length) {
      if (braces.at(-1) === 0) {
        braces.pop();
        kind = scanner.reScanTemplateToken(false);
      } else braces[braces.length - 1]--;
    }
    if (kind === S.TemplateHead || kind === S.TemplateMiddle) braces.push(0);
    previous = kind;
    if (STRINGS.has(kind)) out.push(scanner.getTokenValue());
  }
  return out;
}

/** Files whose strings are fixtures; the grammar suites and this corpus are written for nesting. */
export function fixtureFiles() {
  const files = [path.join(studio, "src/demo/outliner-fixture.ts")];
  const own = /(^|\/)(live-field-[^/]*|inline-corpus\.mjs)$/;
  for (const dir of [path.join(studio, "tests"), path.join(repo, "tests")])
    for (const name of readdirSync(dir, { recursive: true }).sort()) if (/\.(mjs|ts|tsx)$/.test(name) && !own.test(name)) files.push(path.join(dir, name));
  return files;
}

/** Unique fixture strings, in file order. */
export function fixtureStrings() {
  const seen = new Set();
  for (const file of fixtureFiles()) for (const value of literalsOf(file)) seen.add(value);
  return [...seen];
}

/** Hand-written edge cases: escapes, unclosed and touching styles, every token, block shapes. */
export const EDGE_CASES = [
  "",
  " ",
  "\n",
  "  leading and trailing  ",
  "\\*not italic\\* and \\#not-a-tag and \\[not\\](a link)",
  "trailing backslash \\",
  "\\\\ double backslash",
  "**unclosed bold",
  "__unclosed italic and ~~unclosed strike and `unclosed code and ==unclosed",
  "**a __b__ c**",
  "**a****b**",
  "__a____b__ ~~a~~~~b~~",
  "__legacy italic__ and *star* and _under_",
  "***both*** and ***b** i* and **b *i***",
  "**~~x~~** and ~~**x**~~ and ==*~~x~~*== and ~~**==a==**~~",
  "2*3*4 and a * b * c and *a*b",
  "**see https://x.y** and **a\\*b** and **#launch** and *@ann*",
  "!(2026-11-03 -> 2026-11-07) and !(2026-11-03 → 2026-11-07) and !(2026-11-03 09:00 -> 11:00)",
  "!(2026-11-03 every week) !(2026-02-30) !(2026-11-03 every fortnight)",
  "[[Title]] and [[label|doc/id]] and [[a|b|c]] and [[unclosed",
  "$5 and $10",
  "$x$1",
  "$x$ $$y$$ $ z $ \\$5 $a$$b$",
  "#tag #3 #2 priority ##double word#hash (#paren) @mention @a.b.",
  "https://example.com/path_(x)). and (https://a.b/c) [label](https://x.y/(z))",
  "[label](javascript:alert(1)) [ok](mailto:a@b.c)",
  "emoji 👩🏽‍💻 **bold 🎉** `code 🎈`",
  "tab\tseparated\ttext",
  "| a | b |\n|---|:-:|\n| 1 | 2 \\| 3 |\n| x |",
  "```js\nconst a = 1;\n```\nafter",
  "$$\n\\int_0^1 x\\,dx\n$$",
  "# H1\n## H2 ##\n###### H6\n####### seven\n#nospace",
  "- a\n  - b\n    - [x] c\n- [ ] d\n\n- e after blank\n1. one\n3) three",
  "> quote line\n>no space\n> **bold** in quote",
  "para one\n\n\n\npara two after blank lines\n\n",
  "line one\nline two\nline three",
  "a\u0000nul and ​zero-width and ‮rtl override",
  "مرحبا **عالم** #وسم",
];

/** Seeded random concatenations of markup fragments (the same strings on every run). */
export function generatedStrings(count = 6000, seed = 7) {
  let x = seed >>> 0;
  const rand = () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inline = ["**", "__", "*", "_", "~~", "`", "==", "[", "]", "(", ")", "[[", "]]", "|", "#", "##", "@", "!", "!(2026-11-03)", "!(2026-11-03 -> 11:00)", "$", "$$", "\\", " ", "  ", "\t", "a", "word", "x", "5", "https://e.com/p", "->", "→", "#tag", "@ann", "$x$", "[l](https://u.v)", "[[T|i]]", "é", "🎉"];
  const block = ["", "\n", "\n\n", "- ", "  - ", "1. ", "- [ ] ", "- [x] ", "> ", "# ", "## ", "```", "~~~", "$$", "---", "| a | b |\n|---|---|\n", "![a](https://e.com/i.png =1x2)", "    "];
  const out = [];
  for (let i = 0; i < count; i++) {
    let s = "";
    const parts = 1 + Math.floor(rand() * 14);
    for (let p = 0; p < parts; p++) s += rand() < 0.25 ? block[Math.floor(rand() * block.length)] : inline[Math.floor(rand() * inline.length)];
    out.push(s);
  }
  return out;
}

/** Fixtures, edge cases and generated strings, each once. */
export function corpus({ generated = 6000 } = {}) {
  const seen = new Set();
  const keep = (list) => list.filter((value) => !seen.has(value) && seen.add(value));
  const fixtures = keep(fixtureStrings());
  const edges = keep(EDGE_CASES);
  const random = keep(generatedStrings(generated));
  return { fixtures, edges, random, all: [...fixtures, ...edges, ...random] };
}
