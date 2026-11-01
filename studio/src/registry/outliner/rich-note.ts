/**
 * Rich notes: a note is plain source text; its blocks are a projection of it, like inline marks.
 * This file is the pure half (parse); `rich-note-view.tsx` renders the blocks.
 *
 *   Partner needs sandbox credentials.      paragraph (line breaks kept)
 *   ## Results                               heading
 *   - [x] red-team sign-off                  list (nested by indentation, task items, 1. ordered)
 *   > quoted text                            quote
 *   | Model | Score |                        table (GFM pipes, :--: alignment)
 *   |-------|------:|
 *   ```python                                fenced code (``` or ~~~; the info string is its label)
 *   print("hi")
 *   ```
 *   ```embed:video                         a fence whose info string names a host renderer is
 *   dQw4w9WgXcQ                              an embed (see `renderers`); unknown ones stay code
 *   ```
 *   $$ \int_0^1 x\,dx $$                     display math (one line, or $$ … $$ on their own lines)
 *   ![Loss curve](https://… =640x360)        image on its own line: alt, optional size, "title"
 *   ---                                      rule
 *
 * Every range is a source offset into the note, so a click on rendered text maps back to an
 * exact caret, and search highlights land on the right characters.
 */
export interface SourceRange {
  readonly start: number;
  readonly end: number;
}

export type NoteBlock =
  | { readonly kind: "paragraph"; readonly start: number; readonly text: SourceRange }
  | { readonly kind: "heading"; readonly start: number; readonly level: 1 | 2 | 3 | 4 | 5 | 6; readonly text: SourceRange }
  | { readonly kind: "quote"; readonly start: number; readonly lines: readonly SourceRange[] }
  | { readonly kind: "list"; readonly start: number; readonly list: NoteList }
  | { readonly kind: "code"; readonly start: number; readonly lang: string; readonly code: SourceRange }
  | { readonly kind: "math"; readonly start: number; readonly tex: SourceRange }
  | {
      readonly kind: "image";
      readonly start: number;
      readonly alt: string;
      readonly url: string;
      readonly title?: string;
      readonly width?: number;
      readonly height?: number;
    }
  | {
      readonly kind: "table";
      readonly start: number;
      readonly align: readonly ("start" | "center" | "end" | null)[];
      readonly head: readonly SourceRange[];
      readonly rows: readonly (readonly SourceRange[])[];
    }
  | { readonly kind: "rule"; readonly start: number };

export interface NoteList {
  readonly ordered: boolean;
  /** First number of an ordered list ("3." starts at 3). */
  readonly first: number;
  readonly items: readonly NoteListItem[];
}
export interface NoteListItem {
  readonly start: number;
  /** The item's text (continuation lines included, joined by their newlines). */
  readonly text: SourceRange;
  /** `- [ ]` / `- [x]` task items. */
  readonly checked?: boolean;
  readonly children?: NoteList;
}

interface Line {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[ \t]*([^\s`]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?/;
const LIST = /^([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+)(\[[ xX]\][ \t]+)?/;
// Images by http(s) URL or a site path ("/media/x.png"); never javascript:, data: or other
// schemes, and never a protocol-relative "//host/x.png" (another site, like seams.ts refuses).
const IMAGE = /^ {0,3}!\[([^\]\n]*)\]\(((?:https?:\/\/|\/(?!\/))[^\s()]+)(?:[ \t]+=(\d{1,5})x(\d{1,5}))?(?:[ \t]+"([^"\n]*)")?\)[ \t]*$/;
const MATH_ONE = /^ {0,3}\$\$(.+)\$\$[ \t]*$/;
const MATH_FENCE = /^ {0,3}\$\$[ \t]*$/;
const TABLE_DELIMITER = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(?:\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;

/** Cheap pre-check: a note with none of these is one paragraph (the common case). */
const BLOCKISH = /(^|\n)[ \t]*(?:#{1,6}[ \t]|[-*+][ \t]|\d{1,9}[.)][ \t]|>|```|~~~|\$\$|!\[|\||[-*_](?:[ \t]*[-*_]){2,}[ \t]*(?:\n|$))|\n[ \t]*\n/;

export const isRichNote = (source: string): boolean => BLOCKISH.test(source);

function splitLines(source: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (;;) {
    const at = source.indexOf("\n", start);
    const end = at < 0 ? source.length : at;
    lines.push({ start, end, text: source.slice(start, end) });
    if (at < 0) return lines;
    start = at + 1;
  }
}

const blank = (line: Line | undefined) => !line || !line.text.trim();
const indentOf = (text: string) => text.match(/^[\t ]*/)![0].replace(/\t/g, "    ").length;

/** A range with surrounding spaces trimmed (content offsets stay exact). */
function trimmed(source: string, start: number, end: number): SourceRange {
  while (start < end && /[ \t]/.test(source[start]!)) start++;
  while (end > start && /[ \t]/.test(source[end - 1]!)) end--;
  return { start, end };
}

function tableCells(source: string, line: Line): SourceRange[] {
  const cells: SourceRange[] = [];
  let from = line.start;
  const text = line.text;
  const lead = text.match(/^[ \t]*\|?/)![0].length;
  from = line.start + lead;
  let end = line.end;
  const tail = text.match(/\|?[ \t]*$/)![0];
  // A trailing pipe closes the row; an escaped one (\|) is cell text.
  if (tail.startsWith("|") && source[line.end - tail.length - 1] !== "\\") end = line.end - tail.length;
  let cell = from;
  for (let at = from; at <= end; at++) {
    if (at === end || (source[at] === "|" && source[at - 1] !== "\\")) {
      cells.push(trimmed(source, cell, at));
      cell = at + 1;
    }
  }
  return cells;
}

function isTableStart(lines: readonly Line[], i: number): boolean {
  const line = lines[i];
  const next = lines[i + 1];
  return !!line && !!next && line.text.includes("|") && TABLE_DELIMITER.test(next.text) && next.text.includes("-");
}

/** Does this line begin a block other than a paragraph? (A paragraph stops before it.) */
function startsBlock(lines: readonly Line[], i: number): boolean {
  const text = lines[i]!.text;
  return (
    FENCE.test(text) ||
    HEADING.test(text) ||
    RULE.test(text) ||
    QUOTE.test(text) ||
    LIST.test(text) ||
    IMAGE.test(text) ||
    MATH_ONE.test(text) ||
    MATH_FENCE.test(text) ||
    isTableStart(lines, i)
  );
}

export function parseNoteBlocks(source: string): readonly NoteBlock[] {
  if (!source) return [];
  if (!isRichNote(source)) return [{ kind: "paragraph", start: 0, text: { start: 0, end: source.length } }];
  const lines = splitLines(source);
  const blocks: NoteBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const text = line.text;
    if (blank(line)) {
      i++;
      continue;
    }
    const fence = FENCE.exec(text);
    if (fence) {
      const marker = fence[1]!;
      let close = i + 1;
      while (close < lines.length && !new RegExp(`^ {0,3}${marker[0] === "`" ? "`" : "~"}{${marker.length},}[ \\t]*$`).test(lines[close]!.text)) close++;
      const codeStart = i + 1 < lines.length ? lines[i + 1]!.start : line.end;
      const codeEnd = close < lines.length ? Math.max(codeStart, lines[close]!.start - 1) : source.length;
      blocks.push({ kind: "code", start: line.start, lang: fence[2] ?? "", code: { start: codeStart, end: Math.max(codeStart, codeEnd) } });
      i = close + 1;
      continue;
    }
    const mathOne = MATH_ONE.exec(text);
    if (mathOne) {
      const open = text.indexOf("$$") + 2;
      blocks.push({ kind: "math", start: line.start, tex: trimmed(source, line.start + open, line.start + text.lastIndexOf("$$")) });
      i++;
      continue;
    }
    if (MATH_FENCE.test(text)) {
      let close = i + 1;
      while (close < lines.length && !MATH_FENCE.test(lines[close]!.text)) close++;
      const texStart = i + 1 < lines.length ? lines[i + 1]!.start : line.end;
      const texEnd = close < lines.length ? Math.max(texStart, lines[close]!.start - 1) : source.length;
      blocks.push({ kind: "math", start: line.start, tex: { start: texStart, end: Math.max(texStart, texEnd) } });
      i = close + 1;
      continue;
    }
    const heading = HEADING.exec(text);
    if (heading) {
      const open = text.indexOf(heading[1]!) + heading[1]!.length;
      const content = trimmed(source, line.start + open, line.end);
      // Optional closing #s ("## Title ##") are not part of the title; "C#" keeps its #.
      let close = content.end;
      while (close > content.start && source[close - 1] === "#") close--;
      const end = close < content.end && (close === content.start || /[ \t]/.test(source[close - 1]!)) ? trimmed(source, content.start, close).end : content.end;
      blocks.push({ kind: "heading", start: line.start, level: heading[1]!.length as 1 | 2 | 3 | 4 | 5 | 6, text: { start: content.start, end } });
      i++;
      continue;
    }
    if (RULE.test(text)) {
      blocks.push({ kind: "rule", start: line.start });
      i++;
      continue;
    }
    const image = IMAGE.exec(text);
    if (image) {
      blocks.push({
        kind: "image",
        start: line.start,
        alt: image[1]!.trim(),
        url: image[2]!,
        ...(image[5] ? { title: image[5] } : {}),
        ...(image[3] && image[4] ? { width: Number(image[3]), height: Number(image[4]) } : {}),
      });
      i++;
      continue;
    }
    if (isTableStart(lines, i)) {
      const head = tableCells(source, line);
      const align = tableCells(source, lines[i + 1]!).map(({ start, end }) => {
        const cell = source.slice(start, end);
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "end" : left ? "start" : null;
      });
      const rows: SourceRange[][] = [];
      let at = i + 2;
      while (at < lines.length && !blank(lines[at]) && lines[at]!.text.includes("|")) rows.push(tableCells(source, lines[at++]!));
      blocks.push({ kind: "table", start: line.start, align, head, rows });
      i = at;
      continue;
    }
    if (QUOTE.test(text)) {
      const quoted: SourceRange[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!.text)) {
        const current = lines[i]!;
        quoted.push({ start: current.start + QUOTE.exec(current.text)![0].length, end: current.end });
        i++;
      }
      blocks.push({ kind: "quote", start: line.start, lines: quoted });
      continue;
    }
    if (LIST.test(text)) {
      const { list, next } = parseList(source, lines, i);
      blocks.push({ kind: "list", start: line.start, list });
      i = next;
      continue;
    }
    // Paragraph: until a blank line or the start of another block.
    let last = i;
    while (last + 1 < lines.length && !blank(lines[last + 1]) && !startsBlock(lines, last + 1)) last++;
    blocks.push({ kind: "paragraph", start: line.start, text: trimmed(source, line.start, lines[last]!.end) });
    i = last + 1;
  }
  return blocks;
}

/**
 * A list and its nested lists, by indentation: a marker indented past the previous item's
 * marker nests under it. A non-marker line indented under an item continues its text.
 */
function parseList(source: string, lines: readonly Line[], from: number): { list: NoteList; next: number } {
  type Item = { start: number; text: { start: number; end: number }; checked?: boolean; indent: number; content: number; children?: Draft };
  type Draft = { ordered: boolean; first: number; items: Item[]; indent: number };
  const top: Draft = { ordered: false, first: 1, items: [], indent: -1 };
  const stack: Draft[] = [];
  let i = from;
  for (; i < lines.length; i++) {
    const line = lines[i]!;
    if (blank(line)) {
      // A blank line ends the list unless the next line is still part of it.
      const next = lines[i + 1];
      if (next && !blank(next) && (LIST.test(next.text) || indentOf(next.text) > 0) && stack.length) continue;
      break;
    }
    const marker = LIST.exec(line.text);
    if (!marker) {
      const owner = stack.at(-1)?.items.at(-1);
      // Continuation text: indented under the item (or a lazy line right after it).
      if (owner && !startsBlock(lines, i) && (indentOf(line.text) > 0 || !blank(lines[i - 1]))) {
        owner.text = { start: owner.text.start, end: trimmed(source, line.start, line.end).end };
        continue;
      }
      break;
    }
    const indent = indentOf(marker[1]!);
    const ordered = /\d/.test(marker[2]!);
    while (stack.length > 1 && indent < stack.at(-1)!.indent) stack.pop();
    // Switching between bullets and numbers at the top level starts a new list (CommonMark).
    if (stack.length === 1 && indent <= top.indent && ordered !== top.ordered) break;
    let list = stack.at(-1);
    if (!list) {
      top.ordered = ordered;
      top.first = ordered ? parseInt(marker[2]!, 10) : 1;
      top.indent = indent;
      stack.push(top);
      list = top;
    } else if (indent > list.indent && list.items.length && indent >= list.items.at(-1)!.indent + 1) {
      const parent = list.items.at(-1)!;
      parent.children = { ordered, first: ordered ? parseInt(marker[2]!, 10) : 1, items: [], indent };
      stack.push(parent.children);
      list = parent.children;
    }
    const box = marker[4];
    const contentStart = line.start + marker[0].length;
    list.items.push({
      start: line.start,
      indent,
      content: contentStart,
      text: trimmed(source, contentStart, line.end),
      ...(box ? { checked: box[1] !== " " } : {}),
    });
  }
  const freeze = (draft: Draft): NoteList => ({
    ordered: draft.ordered,
    first: draft.first,
    items: draft.items.map((item) => ({
      start: item.start,
      text: item.text,
      ...(item.checked !== undefined ? { checked: item.checked } : {}),
      ...(item.children ? { children: freeze(item.children) } : {}),
    })),
  });
  return { list: freeze(top), next: i };
}

/** Plain text of a note for places that cannot show blocks (one-line previews, labels). */
export function noteSummary(source: string): string {
  const first = parseNoteBlocks(source)[0];
  if (!first) return "";
  switch (first.kind) {
    case "paragraph":
    case "heading":
      return source.slice(first.text.start, first.text.end).split("\n")[0]!;
    case "quote":
      return source.slice(first.lines[0]!.start, first.lines[0]!.end);
    case "list":
      return source.slice(first.list.items[0]!.text.start, first.list.items[0]!.text.end).split("\n")[0]!;
    case "image":
      return first.alt || "Image";
    case "code":
      return first.lang ? `${first.lang} code` : "Code";
    case "math":
      return `$${source.slice(first.tex.start, first.tex.end)}$`;
    case "table":
      return "Table";
    case "rule":
      return "";
  }
}
