import { findOutlineNode, type OutlineCommand } from "@fux/core";
import { parseInline, type InlineKind } from "./inline";
import { canonicalId } from "./mirrors";
import { parseNoteBlocks, type NoteList } from "./rich-note";
import type { OutlineItem, OutlineItemData } from "./types";

/**
 * Find and replace over a document's titles and notes, as pure functions.
 *
 * Matches only ever fall inside what a reader sees as words: plain runs, the inside of
 * formatting, link labels, #tags and @mentions. Link targets (site paths too), date tokens,
 * inline and display math, images (address and alt text), code and embed fences, and markup
 * characters are never matched, so a replace can't break a link, a formula, an image, an embed,
 * a date or a format. A match never spans two runs for the same reason. Copies shown inside a mirror are skipped (their
 * source is matched once, where it lives).
 */
export interface FindOptions {
  readonly matchCase?: boolean;
  readonly wholeWord?: boolean;
  /** Search notes too (default true). */
  readonly notes?: boolean;
}

export interface FindMatch {
  readonly id: string;
  readonly field: "title" | "note";
  /** Source offsets in the title, or in the whole note. */
  readonly start: number;
  readonly end: number;
}

/** Kinds whose visible text is prose to search; styled text (bold, italic …) is `text` inside its style. */
const WORDS: ReadonlySet<InlineKind> = new Set<InlineKind>(["text", "code", "link", "tag", "mention"]);

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The matcher for a query, or null for an empty one. */
export function findPattern(query: string, options: FindOptions = {}): RegExp | null {
  if (!query) return null;
  const body = escapeRegExp(query);
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(source, `gu${options.matchCase ? "" : "i"}`);
}

/**
 * Ranges inside a plain-text run that are not prose: the target of a `[label](target)` link (any
 * target, site paths included; only its label is words) and the whole of an `![alt](src)` image.
 */
const LINKISH = /(!?)\[([^\]\n]*)\]\(([^()\s]*)\)/g;
function hiddenIn(text: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  LINKISH.lastIndex = 0;
  for (let match = LINKISH.exec(text); match; match = LINKISH.exec(text)) {
    const labelEnd = match.index + 1 + match[1]!.length + match[2]!.length;
    out.push(match[1] ? { start: match.index, end: match.index + match[0].length } : { start: labelEnd, end: match.index + match[0].length });
  }
  return out;
}

/** Matches in one line of inline source (offsets shifted by `offset`). */
function matchLine(line: string, offset: number, pattern: RegExp, out: { start: number; end: number }[]) {
  for (const segment of parseInline(line)) {
    if (!WORDS.has(segment.kind)) continue;
    // An inline image, ![alt](https://…): its alt text and address are not prose.
    if (segment.kind === "link" && line[segment.start - 1] === "!") continue;
    const text = line.slice(segment.contentStart, segment.contentEnd);
    const hidden = segment.kind === "text" ? hiddenIn(text) : [];
    pattern.lastIndex = 0;
    for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
      if (!match[0].length) {
        pattern.lastIndex++;
        continue;
      }
      const from = match.index,
        to = from + match[0].length;
      if (hidden.some((range) => from < range.end && to > range.start)) continue;
      const start = offset + segment.contentStart + from;
      out.push({ start, end: start + match[0].length });
    }
  }
}

/** Ranges of the note a reader sees as prose: no code or embed fences, math, images or rules. */
function proseRanges(note: string): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  const list = (items: NoteList) =>
    items.items.forEach((item) => {
      out.push(item.text);
      if (item.children) list(item.children);
    });
  for (const block of parseNoteBlocks(note)) {
    switch (block.kind) {
      case "paragraph":
      case "heading":
        out.push(block.text);
        break;
      case "quote":
        out.push(...block.lines);
        break;
      case "list":
        list(block.list);
        break;
      case "table":
        out.push(...block.head, ...block.rows.flat());
        break;
      // code (and embed) fences, display math, images and rules hold no prose.
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Ranges of `pattern` in a title (one inline line) or a note (its prose blocks, line by line). */
export function matchText(source: string, pattern: RegExp, multiline: boolean): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  if (!multiline) {
    matchLine(source, 0, pattern, out);
    return out;
  }
  for (const range of proseRanges(source)) {
    let offset = range.start;
    for (const line of source.slice(range.start, range.end).split("\n")) {
      matchLine(line, offset, pattern, out);
      offset += line.length + 1;
    }
  }
  return out;
}

/**
 * Every match in document order (a title before its note, a parent before its children).
 * `scopeId`: only that item and what is inside it (the zoomed branch).
 */
export function findInOutline(nodes: readonly OutlineItem[], query: string, options: FindOptions = {}, scopeId?: string | null): readonly FindMatch[] {
  const pattern = findPattern(query, options);
  if (!pattern) return [];
  const scope = scopeId ? findOutlineNode(nodes, scopeId)?.node : undefined;
  const roots = scope ? [scope as OutlineItem] : nodes;
  const out: FindMatch[] = [];
  const walk = (items: readonly OutlineItem[]) => {
    for (const node of items) {
      // A mirror and the copies inside it show their source: matched there, once.
      if (canonicalId(nodes, node.id) !== null) continue;
      for (const range of matchText(node.text, pattern, false)) out.push({ id: node.id, field: "title", ...range });
      const note = node.data?.note;
      if (note && options.notes !== false) for (const range of matchText(note, pattern, true)) out.push({ id: node.id, field: "note", ...range });
      if (node.children) walk(node.children);
    }
  };
  walk(roots);
  return out;
}

export interface ReplacePlan {
  /** One transaction: a replace-all is one undo step. */
  readonly commands: readonly OutlineCommand<OutlineItemData>[];
  readonly replaced: number;
  /** Matches left alone because their item is locked. */
  readonly skipped: number;
}

/** The updates that replace `matches` with `replacement` (literal text, never a pattern). */
export function planReplace(
  nodes: readonly OutlineItem[],
  matches: readonly FindMatch[],
  replacement: string,
  isLocked: (id: string) => boolean = () => false,
): ReplacePlan {
  const byItem = new Map<string, FindMatch[]>();
  let skipped = 0;
  for (const match of matches) {
    if (isLocked(match.id)) {
      skipped++;
      continue;
    }
    byItem.set(match.id, [...(byItem.get(match.id) ?? []), match]);
  }
  const commands: OutlineCommand<OutlineItemData>[] = [];
  let replaced = 0;
  for (const [id, list] of byItem) {
    const node = findOutlineNode(nodes, id)?.node as OutlineItem | undefined;
    if (!node) continue;
    const splice = (source: string, field: "title" | "note") => {
      // From the end, so earlier offsets stay true; overlapping ranges (never produced) are dropped.
      const ranges = list.filter((match) => match.field === field).sort((a, b) => b.start - a.start);
      let text = source;
      let floor = Infinity;
      for (const range of ranges) {
        if (range.end > floor || range.end > text.length) continue;
        text = text.slice(0, range.start) + replacement + text.slice(range.end);
        floor = range.start;
        replaced++;
      }
      return text;
    };
    const title = splice(node.text, "title");
    const note = node.data?.note ? splice(node.data.note, "note") : undefined;
    const changes: { text?: string; data?: OutlineItemData } = {};
    if (title !== node.text) changes.text = title;
    if (note !== undefined && note !== node.data?.note) changes.data = { ...node.data, note };
    if (changes.text !== undefined || changes.data) commands.push({ type: "update", id, changes });
  }
  return { commands, replaced, skipped };
}
