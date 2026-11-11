/**
 * A small, dependency-free tokenizer for code listings. It marks comments, strings, numbers and
 * keywords, which is as much colour as an editorial listing wants. It never evaluates anything.
 */
export type CodeTokenKind = "plain" | "comment" | "string" | "number" | "keyword";
export interface CodeToken {
  readonly kind: CodeTokenKind;
  readonly text: string;
}

interface Grammar {
  readonly line: readonly string[];
  readonly block?: readonly [open: string, close: string];
  readonly quotes: readonly string[];
  readonly triple?: boolean;
  readonly keywords: ReadonlySet<string>;
  /** `#` starts a comment only at the start of a line or after a space (`$#`, `url#fragment`). */
  readonly spacedComment?: boolean;
  /** `{ from: 1 }` is a property name, not the keyword. */
  readonly objectKeys?: boolean;
  /** `/…/flags` after an operator is a regular expression. */
  readonly regex?: boolean;
  /** `@"…"` runs across lines and escapes a quote by doubling it. */
  readonly verbatim?: boolean;
}

const words = (list: string) => new Set(list.split(" ").filter(Boolean));
const SCRIPT = words(
  "as async await break case catch class const continue default delete do else enum export extends false finally for from function if implements import in instanceof interface let new null of private protected public readonly return satisfies static super switch this throw true try type typeof undefined var void while yield",
);
const GRAMMARS: Record<string, Grammar> = {
  script: {
    line: ["//"],
    block: ["/*", "*/"],
    quotes: ['"', "'", "`"],
    keywords: SCRIPT,
    objectKeys: true,
    regex: true,
  },
  json: { line: [], quotes: ['"'], keywords: words("true false null") },
  python: {
    line: ["#"],
    quotes: ['"', "'"],
    triple: true,
    keywords: words(
      "and as assert async await break class continue def del elif else except False finally for from global if import in is lambda None nonlocal not or pass raise return True try while with yield self",
    ),
  },
  shell: {
    line: ["#"],
    spacedComment: true,
    quotes: ['"', "'"],
    keywords: words("if then else elif fi for while do done case esac in function return export"),
  },
  csharp: {
    line: ["//"],
    block: ["/*", "*/"],
    quotes: ['"', "'"],
    verbatim: true,
    keywords: words(
      "abstract as async await base bool break byte case catch char class const continue decimal default delegate do double else enum event false finally float for foreach goto if in int interface internal is lock long nameof namespace new null object operator out override params partial private protected public readonly record ref return sealed short static string struct switch this throw true try typeof uint ulong using var virtual void when where while yield",
    ),
  },
  swift: {
    line: ["//"],
    block: ["/*", "*/"],
    quotes: ['"'],
    triple: true,
    keywords: words(
      "as async await break case catch class continue default defer do else enum extension false final for func guard if import in init let nil private protocol public return self static struct switch throw throws true try var where while",
    ),
  },
  css: { line: [], block: ["/*", "*/"], quotes: ['"', "'"], keywords: words("") },
  yaml: {
    line: ["#"],
    spacedComment: true,
    quotes: ['"', "'"],
    keywords: words("true false null yes no"),
  },
  toml: { line: ["#"], quotes: ['"', "'"], triple: true, keywords: words("true false") },
  text: { line: [], quotes: [], keywords: words("") },
};
const ALIASES: Record<string, string> = {
  js: "script",
  jsx: "script",
  ts: "script",
  tsx: "script",
  mjs: "script",
  javascript: "script",
  typescript: "script",
  jsonc: "script",
  py: "python",
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  cs: "csharp",
  yml: "yaml",
};

const IDENT = /[A-Za-z_$][\w$]*/y;
const NUMBER = /(?:0[xX][\da-fA-F_]+|\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)/y;

// Not `<` or `>`: in markup, `</p>` is far more common than a regex after a comparison.
const REGEX_AFTER = new Set("(,=:[!&|?{};+-*%~^".split(""));
const REGEX_AFTER_WORD = new Set([
  "return",
  "typeof",
  "case",
  "in",
  "of",
  "void",
  "throw",
  "yield",
]);

/** Where a regular expression literal starting at `start` ends, or -1 if this `/` is division. */
function regexEnd(code: string, start: number): number {
  let inClass = false;
  for (let j = start + 1; j < code.length; j += 1) {
    const char = code[j]!;
    if (char === "\n") return -1;
    if (char === "\\") j += 1;
    else if (char === "[") inClass = true;
    else if (char === "]") inClass = false;
    else if (char === "/" && !inClass) {
      if (j === start + 1) return -1;
      let end = j + 1;
      while (end < code.length && /[a-z]/.test(code[end]!)) end += 1;
      return end;
    }
  }
  return -1;
}

/** Split source into lines of tokens. Unknown languages render as plain text. */
export function tokenizeCode(source: string, language = "text"): CodeToken[][] {
  const code = source.replace(/\r\n?/g, "\n");
  const key = language.toLowerCase();
  const grammar = GRAMMARS[ALIASES[key] ?? key] ?? GRAMMARS.text!;
  const tokens: CodeToken[] = [];
  const push = (kind: CodeTokenKind, text: string) => {
    if (!text) return;
    const last = tokens.at(-1);
    if (last && last.kind === kind) tokens[tokens.length - 1] = { kind, text: last.text + text };
    else tokens.push({ kind, text });
  };
  /** The last character before `at` that is not a space or tab, and the word it ends, if any. */
  const before = (at: number) => {
    let j = at - 1;
    while (j >= 0 && (code[j] === " " || code[j] === "\t")) j -= 1;
    if (j < 0) return { char: "", word: "" };
    let k = j;
    while (k >= 0 && /[\w$]/.test(code[k]!)) k -= 1;
    return { char: code[j]!, word: code.slice(k + 1, j + 1) };
  };
  const after = (at: number) => {
    let j = at;
    while (j < code.length && (code[j] === " " || code[j] === "\t")) j += 1;
    return code[j] ?? "";
  };
  let i = 0;
  while (i < code.length) {
    const lineComment = grammar.line.find((mark) => code.startsWith(mark, i));
    const spaced = i === 0 || /\s/.test(code[i - 1]!);
    if (lineComment && (!grammar.spacedComment || spaced)) {
      const end = code.indexOf("\n", i);
      const stop = end === -1 ? code.length : end;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (grammar.block && code.startsWith(grammar.block[0], i)) {
      const end = code.indexOf(grammar.block[1], i + grammar.block[0].length);
      const stop = end === -1 ? code.length : end + grammar.block[1].length;
      push("comment", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (grammar.verbatim && code.startsWith('@"', i)) {
      let j = i + 2;
      while (j < code.length) {
        if (code[j] === '"' && code[j + 1] === '"') j += 2;
        else if (code[j] === '"') break;
        else j += 1;
      }
      const stop = Math.min(code.length, j + 1);
      push("string", code.slice(i, stop));
      i = stop;
      continue;
    }
    if (grammar.regex && code[i] === "/") {
      const { char, word } = before(i);
      const opens =
        char === "" || char === "\n" || REGEX_AFTER.has(char) || REGEX_AFTER_WORD.has(word);
      const stop = opens ? regexEnd(code, i) : -1;
      if (stop !== -1) {
        push("string", code.slice(i, stop));
        i = stop;
        continue;
      }
    }
    const quote = grammar.quotes.find((mark) => code.startsWith(mark, i));
    if (quote) {
      const triple = grammar.triple && code.startsWith(quote.repeat(3), i) ? quote.repeat(3) : null;
      const close = triple ?? quote;
      const multiline = Boolean(triple) || quote === "`";
      let j = i + close.length;
      let closed = false;
      while (j < code.length) {
        if (code[j] === "\\") j += 2;
        else if (code.startsWith(close, j)) {
          closed = true;
          break;
        } else if (!multiline && code[j] === "\n") break;
        else j += 1;
      }
      // A quote that never closes on its line is an apostrophe in prose or markup, not a string.
      if (!closed && !multiline) {
        push("plain", quote);
        i += quote.length;
        continue;
      }
      const stop = Math.min(code.length, closed ? j + close.length : j);
      push("string", code.slice(i, stop));
      i = stop;
      continue;
    }
    IDENT.lastIndex = i;
    const ident = IDENT.exec(code);
    if (ident) {
      const word = ident[0];
      let keyword = grammar.keywords.has(word);
      if (keyword) {
        const prev = before(i).char;
        // `z.enum(…)` and `{ from: 1 }` use the word as a name.
        const member = prev === "." && code[i - 2] !== ".";
        const objectKey =
          grammar.objectKeys === true &&
          word !== "default" &&
          after(i + word.length) === ":" &&
          (prev === "{" || prev === "," || prev === "\n" || prev === "");
        if (member || objectKey) keyword = false;
      }
      push(keyword ? "keyword" : "plain", word);
      i += word.length;
      continue;
    }
    NUMBER.lastIndex = i;
    const number = NUMBER.exec(code);
    if (number) {
      push("number", number[0]);
      i += number[0].length;
      continue;
    }
    push("plain", code[i]!);
    i += 1;
  }
  const lines: CodeToken[][] = [[]];
  for (const token of tokens) {
    const parts = token.text.split("\n");
    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ kind: token.kind, text: part });
    });
  }
  return lines;
}
