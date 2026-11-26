import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createElement as h } from "react";
import { act } from "react";
import { renderToStaticMarkup, renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { wcagContrast } from "culori";
import { dom } from "./components-dom.js";
import * as Editorial from "../src/editorial/index.js";
import * as Core from "../src/core/index.js";
import type { TerminalLine, TerminalSegment } from "../src/core/terminal.js";

const { Terminal } = Editorial;
const { parseAnsi, terminalCopyText, terminalRows, TERMINAL_TONES } = Core;
const ESC = "\u001b";
const css = readFileSync(new URL("../src/editorial/editorial.css", import.meta.url), "utf8");

function parse(html: string) {
  const host = dom.window.document.createElement("div");
  host.innerHTML = html;
  return host;
}
/** The text a selection copies: everything except prompts and decorative segments. */
function copiedText(root: Element) {
  const clone = root.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll(".fux-terminal-prompt, [data-decorative]"))
    hidden.remove();
  return (clone.querySelector("pre")!.textContent ?? "").replace(/\n$/, "");
}
/** What a screen reader is given: the text outside aria-hidden nodes. */
function spokenText(root: Element) {
  const clone = root.cloneNode(true) as Element;
  for (const hidden of clone.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return clone.querySelector("pre")!.textContent ?? "";
}

test("existing string transcripts render exactly as before", () => {
  // Captured from the 0.4.0 Terminal before styled text existed.
  assert.equal(
    renderToString(h(Terminal, { title: "zsh" }, "\n$ fieldbook export\nWrote 42 notes\n$ ls\n\n")),
    '<div class="fux-terminal"><div class="fux-terminal-title">zsh</div><pre class="fux-terminal-pre"><span class="fux-terminal-line" data-kind="in"><span class="fux-terminal-prompt" aria-hidden="true">$<!-- --> </span>fieldbook export<!-- -->\n</span><span class="fux-terminal-line" data-kind="out">Wrote 42 notes<!-- -->\n</span><span class="fux-terminal-line" data-kind="in"><span class="fux-terminal-prompt" aria-hidden="true">$<!-- --> </span>ls<!-- -->\n</span></pre></div>',
  );
  assert.equal(
    renderToString(
      h(
        Terminal,
        { prompt: ">", className: "x" },
        `> run\n>noSpace\nout <b>bold</b> & ${ESC}[31mred${ESC}[0m`,
      ),
    ),
    '<div class="fux-terminal x"><pre class="fux-terminal-pre"><span class="fux-terminal-line" data-kind="in"><span class="fux-terminal-prompt" aria-hidden="true">&gt;<!-- --> </span>run<!-- -->\n</span><span class="fux-terminal-line" data-kind="out">&gt;noSpace<!-- -->\n</span><span class="fux-terminal-line" data-kind="out">out &lt;b&gt;bold&lt;/b&gt; &amp; \u001b[31mred\u001b[0m<!-- -->\n</span></pre></div>',
    "without `ansi`, escape codes stay literal text, as before",
  );
  const plain = renderToStaticMarkup(h(Terminal, null, "$ ls\nout"));
  assert.doesNotMatch(plain, /data-ground|data-tone|fux-terminal-text/);
});

test("segments render with their tone hooks and keep the text", () => {
  const lines: TerminalLine[] = [
    [
      { text: "▍", tone: "accent", decorative: true },
      { text: "$ " },
      { text: "fieldbook ", tone: "bold" },
      { text: "sync" },
    ],
    [
      { text: "✓ ready", tone: ["bold", "success"] },
      { text: " at " },
      { text: "https://notes.test/a", tone: "link" },
    ],
    [
      { text: "label: ", tone: "dim" },
      { text: "warn", tone: "warning" },
      { text: " fail", tone: "danger" },
      { text: " note", tone: "info" },
    ],
    // Unknown tones from untyped callers are dropped, so only the fixed set reaches the page.
    [{ text: "plain", tone: ["teal", "#ff0000"] as never }],
    "$ typed as a string",
  ];
  const html = renderToStaticMarkup(h(Terminal, null, lines));
  const root = parse(html);
  const rows = [...root.querySelectorAll(".fux-terminal-line")];
  assert.deepEqual(
    rows.map((row) => row.getAttribute("data-kind")),
    ["in", "out", "out", "out", "in"],
    "a line after its decorative lead still reads as typed",
  );
  const first = rows[0]!;
  const marker = first.firstElementChild!;
  assert.equal(marker.getAttribute("data-decorative"), "");
  assert.equal(marker.getAttribute("aria-hidden"), "true");
  assert.equal(marker.getAttribute("data-tone"), "accent");
  assert.equal(marker.nextElementSibling!.className, "fux-terminal-prompt");
  assert.equal(first.querySelector('[data-tone="bold"]')!.textContent, "fieldbook ");
  assert.equal(rows[1]!.querySelector('[data-tone="bold success"]')!.textContent, "✓ ready");
  assert.equal(rows[1]!.querySelector('[data-tone="link"]')!.textContent, "https://notes.test/a");
  for (const tone of ["dim", "warning", "danger", "info"])
    assert.ok(rows[2]!.querySelector(`[data-tone="${tone}"]`), `${tone} has a hook`);
  assert.equal(rows[3]!.querySelector("span"), null);
  assert.equal(rows[3]!.textContent, "plain\n");
  assert.doesNotMatch(html, /teal|#ff0000|\sstyle=/);
  // Tone spans add no roles or labels: a screen reader reads the words, not the styling.
  for (const span of root.querySelectorAll(".fux-terminal-text:not([data-decorative])"))
    assert.deepEqual([...span.attributes].map((attribute) => attribute.name).sort(), [
      "class",
      "data-tone",
    ]);
  assert.equal(
    spokenText(root),
    "fieldbook sync\n✓ ready at https://notes.test/a\nlabel: warn fail note\nplain\ntyped as a string\n",
  );
});

test("the prompt is found and removed across segment edges", () => {
  const rows = terminalRows([
    [
      { text: "$", tone: "dim" },
      { text: " ls -la", tone: "bold" },
    ],
  ]);
  assert.equal(rows[0]!.kind, "in");
  assert.deepEqual(rows[0]!.segments, [{ text: "ls -la", tone: "bold" }]);
  const custom = terminalRows([[{ text: "> " }, { text: "go" }]], { prompt: ">" });
  assert.deepEqual(custom[0], { kind: "in", lead: [], segments: [{ text: "go" }] });
  // A decorative segment after the text start is not a lead.
  const late = terminalRows([[{ text: "out " }, { text: "•", decorative: true }]]);
  assert.equal(late[0]!.kind, "out");
  assert.equal(late[0]!.lead.length, 0);
});

test("the ANSI reader maps colours, bold, dim and reset onto tones", () => {
  const tones = (line: readonly TerminalSegment[]) =>
    line.map((segment) => [segment.text, segment.tone ?? null]);
  assert.deepEqual(
    tones(
      parseAnsi(
        `${ESC}[30ma${ESC}[31mb${ESC}[32mc${ESC}[33md${ESC}[34me${ESC}[35mf${ESC}[36mg${ESC}[37mh${ESC}[39mi`,
      )[0]!,
    ),
    [
      ["a", "dim"],
      ["b", "danger"],
      ["c", "success"],
      ["d", "warning"],
      ["e", "info"],
      ["f", "accent"],
      ["g", "link"],
      ["hi", null],
    ],
  );
  assert.deepEqual(
    tones(
      parseAnsi(
        `${ESC}[90ma${ESC}[91mb${ESC}[92mc${ESC}[93md${ESC}[94me${ESC}[95mf${ESC}[96mg${ESC}[97mh`,
      )[0]!,
    ),
    [
      ["a", "dim"],
      ["b", "danger"],
      ["c", "success"],
      ["d", "warning"],
      ["e", "info"],
      ["f", "accent"],
      ["g", "link"],
      ["h", null],
    ],
  );
  assert.deepEqual(
    tones(
      parseAnsi(`${ESC}[1mB${ESC}[2mD${ESC}[22mN${ESC}[1;32mG${ESC}[0mR${ESC}[2;31mX${ESC}[mZ`)[0]!,
    ),
    [
      ["B", "bold"],
      ["D", ["bold", "dim"]],
      ["N", null],
      ["G", ["bold", "success"]],
      ["R", null],
      ["X", ["dim", "danger"]],
      ["Z", null],
    ],
  );
  // Style carries across lines, as in a real terminal, until it is reset.
  assert.deepEqual(parseAnsi(`${ESC}[32mone\ntwo${ESC}[0m\nthree`), [
    [{ text: "one", tone: "success" }],
    [{ text: "two", tone: "success" }],
    [{ text: "three" }],
  ]);
  // Extended colours: the first 16 of 256 map; the rest and direct RGB carry no tone, and their
  // numbers are never read as other codes (the 1 in 2;1;2;3 is not bold).
  assert.deepEqual(
    tones(
      parseAnsi(
        `${ESC}[38;5;2ma${ESC}[38;5;9mb${ESC}[38;5;200mc${ESC}[38;2;1;2;3md${ESC}[48;5;1;4me${ESC}[38:2::9:9:9mf`,
      )[0]!,
    ),
    [
      ["a", "success"],
      ["b", "danger"],
      ["cdef", null],
    ],
  );
  // Adjacent text with the same style is one segment.
  assert.deepEqual(parseAnsi(`${ESC}[32mok${ESC}[32m done`), [
    [{ text: "ok done", tone: "success" }],
  ]);
});

test("the ANSI reader drops other sequences and malformed ones without losing text", () => {
  const text = (source: string) =>
    parseAnsi(source)
      .map((line) => line.map((segment) => segment.text).join(""))
      .join("\n");
  assert.equal(text(`${ESC}[2K${ESC}[1Aclear${ESC}[?25l`), "clear");
  assert.equal(text(`${ESC}]0;window title\u0007after`), "after");
  assert.equal(text(`${ESC}]8;;https://notes.test${ESC}\\link${ESC}]8;;${ESC}\\`), "link");
  assert.equal(
    text(`${ESC}]0;never ended\nnext line`),
    "\nnext line",
    "an open OSC ends at the line",
  );
  assert.equal(text(`${ESC}(Bcharset ${ESC}7saved${ESC}8`), "charset saved");
  assert.equal(text(`a${ESC}[31`), "a", "an unfinished sequence at the end is dropped");
  assert.equal(text(`a${ESC}[3\u0007b`), "ab", "a sequence broken by a control is dropped");
  assert.equal(text(`a${ESC}[31\nb`), "a\nb");
  assert.equal(text(`a${ESC}`), "a");
  assert.equal(text(`a${ESC}${ESC}[32mb`), "ab");
  assert.equal(text("bell\u0007 back\bspace\r\ncrlf\ttab\u007f"), "bell backspace\ncrlf\ttab");
  // A malformed SGR sets no tone; the colour before it stays.
  const lines = parseAnsi(`${ESC}[32mok${ESC}[3;x${ESC}[31;!m still`);
  assert.deepEqual(lines, [[{ text: "ok still", tone: "success" }]]);
  // The reader is linear: a long run of escapes and text does not slow it to a crawl.
  const long = `${ESC}[1;31m${"x".repeat(1000)}`.repeat(200);
  const started = performance.now();
  assert.equal(text(long).length, 200_000);
  assert.ok(performance.now() - started < 2000);
});

test("ANSI output renders as text, never as markup", () => {
  const source = `${ESC}[31m<img src=x onerror="alert(1)">${ESC}[0m <script>alert(2)</script>\n$ ${ESC}[1mrm${ESC}[0m -i <b>`;
  const html = renderToStaticMarkup(h(Terminal, { ansi: true }, source));
  assert.doesNotMatch(html, /<img|<script|<b>|\u001b/);
  assert.match(html, /data-tone="danger">&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;</);
  const root = parse(html);
  assert.equal(root.querySelector("img, script, b"), null);
  const rows = root.querySelectorAll(".fux-terminal-line");
  assert.equal(rows[1]!.getAttribute("data-kind"), "in");
  assert.equal(rows[1]!.querySelector('[data-tone="bold"]')!.textContent, "rm");
});

test("copying gives the plain text: no codes, prompts or decorative markers", () => {
  const source = `\n$ ${ESC}[1mfieldbook${ESC}[0m sync\n${ESC}[32m✓${ESC}[0m synced ${ESC}[36mhttps://notes.test${ESC}[0m\n`;
  const expected = "fieldbook sync\n✓ synced https://notes.test";
  assert.equal(terminalCopyText(source, { ansi: true }), expected);
  const ansiRoot = parse(renderToStaticMarkup(h(Terminal, { ansi: true }, source)));
  assert.equal(copiedText(ansiRoot), expected);
  assert.doesNotMatch(ansiRoot.textContent ?? "", /\u001b|\[\d+m/);

  const lines: TerminalLine[] = [
    [{ text: "▍", tone: "success", decorative: true }, { text: "$ deploy" }],
    [
      { text: "│ ", tone: "dim", decorative: true },
      { text: "done", tone: "success" },
    ],
  ];
  assert.equal(terminalCopyText(lines), "deploy\ndone");
  const root = parse(renderToStaticMarkup(h(Terminal, null, lines)));
  assert.equal(copiedText(root), "deploy\ndone");
  // Prompts and decorations are drawn with user-select: none, so a selection skips them too.
  assert.match(css, /\.fux-terminal-prompt\s*\{[^}]*user-select:\s*none/);
  assert.match(css, /\.fux-terminal-text\[data-decorative\]\s*\{[^}]*user-select:\s*none/);
});

test("styled transcripts hydrate without a mismatch", async () => {
  const lines: TerminalLine[] = [
    [{ text: "▍", tone: "accent", decorative: true }, { text: "$ ls" }],
    [{ text: "ok", tone: ["bold", "success"] }, { text: " two" }],
    "plain",
  ];
  const element = h(
    "div",
    null,
    h(Terminal, { ground: "dark", title: "zsh" }, lines),
    h(Terminal, { ansi: true }, `$ ${ESC}[2mrun${ESC}[0m\n${ESC}[31mfail`),
  );
  const host = dom.window.document.createElement("div");
  host.innerHTML = renderToString(element);
  dom.window.document.body.append(host);
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  await act(async () => {
    root = hydrateRoot(host, element, { onRecoverableError: (error) => errors.push(error) });
  });
  assert.deepEqual(errors, []);
  assert.equal(host.querySelector(".fux-terminal")!.getAttribute("data-ground"), "dark");
  await act(async () => root!.unmount());
  host.remove();
});

// --- The stylesheet: tone variables for both grounds --------------------------------------------

function rootToken(name: string): string {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, `${name} is defined`);
  return match[1]!.trim();
}
/** The declarations of every rule whose selector list ends with this selector. */
function block(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const bodies = [...css.matchAll(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, "g"))].map(
    (match) => match[1]!,
  );
  assert.ok(bodies.length, `${selector} has a rule`);
  return bodies.join("\n");
}

test("every tone has a rule that reads its own variable", () => {
  for (const tone of TERMINAL_TONES)
    assert.match(
      block(`.fux-terminal-text[data-tone~="${tone}"]`),
      new RegExp(`color:\\s*var\\(--fux-terminal-${tone}\\)`),
    );
  // Colour roles are declared after bold, so a bold colour keeps its colour.
  assert.ok(css.indexOf('[data-tone~="bold"]') < css.indexOf('[data-tone~="success"]'));
});

test("light and dark tone defaults resolve per ground and keep 4.5:1", () => {
  const colours = ["dim", "success", "warning", "danger", "info", "link"] as const;
  const page = block(".fux-terminal");
  const dark = block(':where(.dark) .fux-terminal,\n.fux-terminal[data-ground="dark"]');
  const light = block('.fux-terminal[data-ground="light"]');
  for (const tone of colours) {
    assert.match(page, new RegExp(`--fux-terminal-${tone}: var\\(--fux-terminal-light-${tone}\\)`));
    assert.match(dark, new RegExp(`--fux-terminal-${tone}: var\\(--fux-terminal-dark-${tone}\\)`));
    assert.match(
      light,
      new RegExp(`--fux-terminal-${tone}: var\\(--fux-terminal-light-${tone}\\)`),
    );
  }
  const ownDark = block('.fux-terminal[data-ground="dark"]');
  for (const [token, value] of [
    ["--fux-ed-raised", "ground"],
    ["--fux-ed-ink", "ink"],
    ["--fux-ed-ink-soft", "output"],
    ["--fux-ed-accent", "accent"],
  ]) {
    assert.match(ownDark, new RegExp(`${token}: var\\(--fux-terminal-dark-${value}\\)`));
    assert.match(light, new RegExp(`${token}: var\\(--fux-terminal-light-${value}\\)`));
  }

  // The terminal's own grounds, the kit's papers and the app theme's light and dark cards.
  const grounds = {
    light: [
      rootToken("--fux-terminal-light-ground"),
      "#fbfbf8",
      "#f4f1ea",
      "oklch(0.965 0.003 265)",
    ],
    dark: [rootToken("--fux-terminal-dark-ground"), "oklch(0.185 0.005 265)", "#232830"],
  };
  for (const side of ["light", "dark"] as const) {
    for (const role of [...colours, "ink", "output", "accent"]) {
      const colour = rootToken(`--fux-terminal-${side}-${role}`);
      for (const ground of grounds[side]) {
        const ratio = wcagContrast(colour, ground);
        assert.ok(ratio >= 4.5, `${side} ${role} ${colour} on ${ground} is ${ratio.toFixed(2)}:1`);
      }
    }
  }
});

test("a terminal can paint its own ground, and themes override tones by token", () => {
  const html = renderToStaticMarkup(h(Terminal, { ground: "light" }, "$ ls"));
  assert.match(html, /^<div class="fux-terminal" data-ground="light">/);
  // Tones read tokens defined at :root, so a theme sets them once on any ancestor.
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  for (const side of ["light", "dark"])
    for (const tone of ["dim", "success", "warning", "danger", "info", "link"])
      assert.match(root, new RegExp(`--fux-terminal-${side}-${tone}:`));
});

test("the terminal model is portable and shared by both entries", () => {
  assert.equal(Editorial.parseAnsi, Core.parseAnsi);
  assert.equal(Editorial.terminalCopyText, Core.terminalCopyText);
  const source = readFileSync(new URL("../src/core/terminal.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "react|document\.|window\.|innerHTML/);
});
