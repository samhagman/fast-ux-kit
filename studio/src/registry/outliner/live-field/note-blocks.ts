/**
 * A note's block keys as source edits. The note is source text and its blocks are a reading of
 * it (rich-note.ts), so Enter, ⌫ at a block's start, ⌘↵ and a task click each compute the next
 * source and caret from the block the caret stands in; the field then shows the parse of the
 * result like after any other edit. No view, no editor state: plain strings in, plain strings out.
 *
 *   Enter          paragraph   a line break (at its very start: a new paragraph above)
 *                  list item   the next item (same marker, next number, an open task box);
 *                              on an empty item: out one level, or out of the list
 *                  quote       the next quoted line; on an empty one: out of the quote
 *                  heading     the next line is a paragraph
 *                  fence line  ``` or $$ alone: the block opens (and closes below the caret)
 *                  code, math  a line in the block
 *                  `|a|b|`     the row becomes a table's header, with a delimiter and an empty row
 *                  `---`, ![…] the line becomes its block; the caret goes below
 *   ⌫ at the start heading, list item, quote line: the block's marker goes (an empty one just
 *                  loses its last character, giving back what was typed); paragraph: joins the
 *                  block above; code or math with nothing in it: back to its opener line
 *   ⌘↵             a task: toggled; code, math or a table: the caret goes below the block
 */
import {
  FENCE,
  LIST,
  QUOTE,
  lineEndAt,
  lineStartAt,
  noteBlockEnd,
  parseNoteBlocks,
  type NoteBlock,
  type NoteList,
  type NoteListItem,
} from "../rich-note";

/** The next source and where the caret goes. */
export interface SourceEdit {
  readonly text: string;
  readonly caret: number;
}

const TABLE_ROW = /^[ \t]{0,3}\|.*\|[ \t]*$/;

/** The block holding source offset `at` (its first line to its last), and the block before it. */
function blockAt(source: string, at: number): { readonly block: NoteBlock | null; readonly before: NoteBlock | null; readonly after: NoteBlock | null; readonly previousEnd: number } {
  const blocks = parseNoteBlocks(source);
  let previousEnd = -1;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    if (at < block.start) return { block: null, before: blocks[i - 1] ?? null, after: block, previousEnd };
    const end = noteBlockEnd(source, block);
    if (at <= end) return { block, before: blocks[i - 1] ?? null, after: blocks[i + 1] ?? null, previousEnd };
    previousEnd = end;
  }
  return { block: null, before: blocks.at(-1) ?? null, after: null, previousEnd };
}

/** The deepest list item whose own lines hold `at`, with its parent item. */
function itemAt(source: string, list: NoteList, at: number, parent: NoteListItem | null = null): { readonly item: NoteListItem; readonly parent: NoteListItem | null } | null {
  for (const item of list.items) {
    if (item.children) {
      const inner = itemAt(source, item.children, at, item);
      if (inner) return inner;
    }
    if (at >= item.start && at <= lineEndAt(source, item.text.end)) return { item, parent };
  }
  return null;
}

/** An item's marker parts: indentation, marker, the space after it, a task box. */
function markerOf(source: string, item: NoteListItem) {
  const line = source.slice(item.start, lineEndAt(source, item.start));
  const m = LIST.exec(line)!;
  return { indent: m[1]!, marker: m[2]!, gap: m[3]!, box: m[4] ?? "", content: item.start + m[0].length };
}

const nextMarker = (marker: string) => {
  const number = /^(\d+)([.)])$/.exec(marker);
  return number ? `${Number(number[1]) + 1}${number[2]}` : marker;
};

const splice = (source: string, from: number, to: number, insert: string, caret: number): SourceEdit => ({
  text: source.slice(0, from) + insert + source.slice(to),
  caret,
});

/** The fence that closes an open code or math block. */
const closerOf = (source: string, block: Extract<NoteBlock, { kind: "code" | "math" }>) => {
  if (block.kind === "math") return "$$";
  const fence = FENCE.exec(source.slice(block.start, lineEndAt(source, block.start)))![1]!;
  return fence;
};
const isOpen = (source: string, block: Extract<NoteBlock, { kind: "code" | "math" }>) => (block.kind === "code" ? block.code : block.tex).end >= source.length;

/** A blank line right after `end` for the caret, with a blank line between it and what follows. */
function lineAfter(source: string, end: number): SourceEdit {
  const after = source.slice(end);
  if (!after) return { text: `${source}\n`, caret: end + 1 };
  const insert = after.startsWith("\n\n") ? "\n" : "\n\n";
  return { text: source.slice(0, end) + insert + after, caret: end + 1 };
}

/** ⌘↵ or ↓ past the end of a code, math or table block: close it if open, then the caret below it. */
function leave(source: string, block: NoteBlock): SourceEdit {
  if ((block.kind === "code" || block.kind === "math") && isOpen(source, block)) {
    const closed = `${source}${source.endsWith("\n") ? "" : "\n"}${closerOf(source, block)}`;
    return lineAfter(closed, closed.length);
  }
  return lineAfter(source, noteBlockEnd(source, block));
}

/** Enter in a note with the selection `from`–`to` (source offsets). */
export function noteEnter(source: string, from: number, to: number = from): SourceEdit {
  const text = to > from ? source.slice(0, from) + source.slice(to) : source;
  const caret = from;
  const ls = lineStartAt(text, caret);
  const le = lineEndAt(text, caret);
  const line = text.slice(ls, le);
  const { block, before, previousEnd } = blockAt(text, caret);
  const newline = () => splice(text, caret, caret, "\n", caret + 1);
  if (!block) {
    // A blank line outside every block. Right under a paragraph or list item it shows as that
    // block's next line, and Enter starts a paragraph; elsewhere it already is an empty one.
    const continues = before && (before.kind === "paragraph" || before.kind === "list") && /^\n[ \t]*$/.test(text.slice(previousEnd, caret));
    return continues ? newline() : { text, caret };
  }
  switch (block.kind) {
    case "rule":
    case "image":
      // The line is finished: it becomes its block, and the caret goes below it.
      return splice(text, le, le, "\n", le + 1);
    case "code":
    case "math": {
      const opener = lineEndAt(text, block.start);
      if (caret <= opener && isOpen(text, block)) {
        // ``` or $$ on its own: the block opens, closed right below the caret; what followed stays prose.
        return splice(text, opener, opener, `\n\n${closerOf(text, block)}`, opener + 1);
      }
      return newline();
    }
    case "table":
      return newline();
    case "list": {
      const found = itemAt(text, block.list, caret);
      if (!found) return newline();
      const { item, parent } = found;
      const m = markerOf(text, item);
      const itemLine = { start: item.start, end: lineEndAt(text, item.start) };
      if (!text.slice(item.text.start, item.text.end).trim()) {
        if (m.indent && parent) {
          // An empty nested item steps out one level.
          const outer = markerOf(text, parent).indent;
          return splice(text, itemLine.start, itemLine.start + m.indent.length, outer, caret - (m.indent.length - outer.length));
        }
        // An empty item leaves the list: its line goes, and two blank lines end the list there, so
        // what is typed next (a paragraph, or a new list) never joins it.
        const sep = itemLine.start > 0 ? "\n\n" : "";
        return splice(text, itemLine.start, itemLine.end, sep, itemLine.start + sep.length);
      }
      const fresh = `${m.indent}${m.marker}${m.gap}${m.box ? "[ ] " : ""}`;
      // At the very start of an item: a new empty item above, the text stays where it is.
      if (caret <= m.content) return splice(text, item.start, item.start, `${fresh}\n`, caret + fresh.length + 1);
      const next = `\n${m.indent}${nextMarker(m.marker)}${m.gap}${m.box ? "[ ] " : ""}`;
      return splice(text, caret, caret, next, caret + next.length);
    }
    case "quote": {
      const q = QUOTE.exec(line)?.[0] ?? "> ";
      if (!line.slice(q.length).trim()) return splice(text, ls, le, "", ls);
      if (caret <= ls + q.length) return splice(text, ls, ls, `${q}\n`, caret + q.length + 1);
      return splice(text, caret, caret, `\n${q}`, caret + 1 + q.length);
    }
    case "heading": {
      // At its start a heading moves down, leaving a line above for the caret.
      if (caret <= block.text.start && block.text.end > block.text.start) return splice(text, ls, ls, "\n", ls);
      return newline();
    }
    case "paragraph": {
      if (caret === le && TABLE_ROW.test(line)) {
        const cells = line.trim().replace(/^\||\|$/g, "").split(/(?<!\\)\|/).length;
        const delimiter = `|${Array.from({ length: cells }, () => " --- ").join("|")}|`;
        const row = `|${Array.from({ length: cells }, () => "   ").join("|")}|`;
        return splice(text, le, le, `\n${delimiter}\n${row}`, le + delimiter.length + 4);
      }
      // At the very start of a paragraph with something in it: a new paragraph above it.
      if (caret <= block.text.start && block.text.end > block.text.start) {
        const rich = parseNoteBlocks(text).length > 1 || text.slice(0, ls).trim() !== "" || /\n[ \t]*\n/.test(text);
        return splice(text, ls, ls, rich ? "\n\n" : "\n", ls);
      }
      return newline();
    }
  }
}

/** ⌫ with a collapsed caret: the edit, or null when it is an ordinary ⌫ the editor does. */
export function noteBackspace(source: string, caret: number): SourceEdit | null {
  const ls = lineStartAt(source, caret);
  const { block, before, previousEnd } = blockAt(source, caret);
  const unchanged = { text: source, caret };
  const joinAbove = (): SourceEdit | null => {
    if (!before) return caret > 0 ? splice(source, 0, caret, "", 0) : null;
    const end = previousEnd;
    switch (before.kind) {
      case "rule":
      case "image": {
        // the block above is one line: it goes
        const from = before.start;
        const to = Math.min(source.length, lineEndAt(source, before.start) + 1);
        return splice(source, from, to, "", caret - (to - from));
      }
      case "code":
      case "math":
      case "table":
        return { text: source, caret: before.kind === "table" ? end : (before.kind === "code" ? before.code : before.tex).end };
      default:
        return splice(source, end, caret, "", end);
    }
  };
  if (!block) return joinAbove();
  switch (block.kind) {
    case "heading": {
      if (caret !== block.text.start) return null;
      if (block.text.end === block.text.start) return splice(source, caret - 1, caret, "", caret - 1);
      return splice(source, ls, block.text.start, "", ls);
    }
    case "list": {
      const found = itemAt(source, block.list, caret);
      if (!found) return null;
      const { item, parent } = found;
      const m = markerOf(source, item);
      if (caret !== m.content) return null;
      if (item.text.end === item.text.start) return splice(source, caret - 1, caret, "", caret - 1);
      if (m.box) {
        const at = m.content - m.box.length;
        return splice(source, at, m.content, "", at);
      }
      if (m.indent) {
        const outer = parent ? markerOf(source, parent).indent : "";
        return splice(source, item.start, item.start + m.indent.length, outer, caret - (m.indent.length - outer.length));
      }
      return splice(source, item.start, m.content, "", item.start);
    }
    case "quote": {
      const q = QUOTE.exec(source.slice(ls, lineEndAt(source, ls)))?.[0] ?? "";
      if (caret !== ls + q.length) return null;
      return splice(source, ls, ls + q.length, "", ls);
    }
    case "code":
    case "math": {
      const range = block.kind === "code" ? block.code : block.tex;
      // On the opener line itself (being typed): an ordinary ⌫.
      if (caret !== range.start || lineStartAt(source, caret) === block.start) return null;
      if (range.end > range.start) return unchanged;
      const opener = source.slice(block.start, lineEndAt(source, block.start));
      return splice(source, block.start, noteBlockEnd(source, block), opener, block.start + opener.length);
    }
    case "table":
      return caret === block.start ? unchanged : null;
    case "paragraph":
      return caret === block.text.start ? joinAbove() : null;
    case "rule":
    case "image":
      return null;
  }
}

/** ⌘↵: a task toggles; code, math or a table is left below. Null: not in one of those. */
export function noteModEnter(source: string, caret: number): SourceEdit | null {
  const { block } = blockAt(source, caret);
  if (!block) return null;
  if (block.kind === "list") {
    const found = itemAt(source, block.list, caret);
    if (found?.item.checked === undefined) return null;
    return { text: toggleTask(source, found.item.start) ?? source, caret };
  }
  if (block.kind === "code" || block.kind === "math" || block.kind === "table") return leave(source, block);
  return null;
}

/** ↓ on the last line of a code, math or table block that ends the note: the caret goes below it. */
export function noteDownOut(source: string, caret: number): SourceEdit | null {
  const { block, after } = blockAt(source, caret);
  if (!block || after || (block.kind !== "code" && block.kind !== "math" && block.kind !== "table")) return null;
  const last = block.kind === "table" ? noteBlockEnd(source, block) : (block.kind === "code" ? block.code : block.tex).end;
  if (caret < lineStartAt(source, last)) return null;
  return leave(source, block);
}

/** The task at `itemStart` checked or unchecked; null when that line is not a task. */
export function toggleTask(source: string, itemStart: number): string | null {
  const line = source.slice(itemStart, lineEndAt(source, itemStart));
  const m = LIST.exec(line);
  if (!m?.[4]) return null;
  const at = itemStart + m[1]!.length + m[2]!.length + m[3]!.length + 1;
  return source.slice(0, at) + (source[at] === " " ? "x" : " ") + source.slice(at + 1);
}

/** The task item whose line holds `at` (its line start), or null. */
export function taskAt(source: string, at: number): number | null {
  const { block } = blockAt(source, at);
  if (block?.kind !== "list") return null;
  const found = itemAt(source, block.list, at);
  return found && found.item.checked !== undefined ? found.item.start : null;
}

/**
 * Typing rewrites at a note's line start, right after the space: `[]␣` and `[ ]␣` become a task
 * item, `[x]␣` a done one; `-␣[]␣` gets its box spelled `[ ]`.
 */
export function noteRewrite(before: string): { from: number; to: number; insert: string } | null {
  const m = /(^|\n)([ \t]*)((?:[-*+][ \t]+)?)\[( ?|[xX])\][ \t]$/.exec(before);
  if (!m || (m[3] && m[4] !== "")) return null;
  const from = m.index + m[1]!.length + m[2]!.length;
  return { from, to: before.length, insert: `${m[3] || "- "}[${m[4]!.trim() ? "x" : " "}] ` };
}

/** Whether source offset `at` is in a note's prose (a paragraph, heading, list item or quote), not code, math or a table. */
export function inProse(source: string, at: number): boolean {
  const { block } = blockAt(source, at);
  return !block || block.kind === "paragraph" || block.kind === "heading" || block.kind === "list" || block.kind === "quote";
}
