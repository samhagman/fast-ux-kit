/**
 * The bridge between outline source (markdown-lite) and the editor document, built on the one
 * grammar the static render uses (`parseInline`, `parseNoteBlocks`). The document is always the
 * parse of some source, and writing it back is lossless because every node holds its own
 * spelling (schema.ts).
 *
 *   sourceToDoc       source → document (an open-ended word at the caret stays text while typed)
 *   serialize         document → source, with the source offsets every position collapses onto
 *   posToSource / sourceToPos   positions ⇄ source offsets
 *   normalizeTouched  after a format command: one container per run of a kind it touched
 *   stabilize         after a structural edit: escape or respell until the source reads back the same
 */
import type { Mark, Node as PMNode, Schema } from "prosemirror-model";
import { Transform } from "prosemirror-transform";
import { MARKUP_CHARS, parseInline, type InlineSegment } from "../inline.js";
import {
  isRichNote,
  lineEndAt,
  lineStartAt,
  noteBlockEnd,
  parseNoteBlocks,
  type NoteBlock,
  type NoteList,
  type SourceRange,
} from "../rich-note.js";
import {
  DEFAULT_SPELLING,
  STYLE_GROUP,
  noteSchema,
  titleSchema,
  type FieldKind,
} from "./schema.js";

export interface BuildOptions {
  /**
   * Source offset of the caret after an insertion. A tag, mention, bare URL or math token that
   * ends at the caret is still being typed: it stays text until the caret leaves it, so `#la`
   * is no chip mid-word and `$x$` waits to see whether a digit follows.
   */
  readonly caret?: number | null;
  /**
   * Source offset of the caret for whitespace only: blank space the caret stands in stays visible
   * content instead of being trimmed into a block's prefix or suffix (after any edit).
   */
  readonly whitespaceCaret?: number | null;
}

const CHIP_KINDS = new Set(["link", "url", "tag", "mention", "date", "ref", "math"]);
const PENDING_KINDS = new Set(["tag", "mention", "url", "math"]);
/** Style marks, outermost first when two end together (a tie-break only). */
const STYLE_RANK = new Map([
  ["highlight", 0],
  ["strike", 1],
  ["bold", 2],
  ["italic", 3],
  ["code", 4],
]);
const STYLES = ["bold", "italic", "strike", "highlight"] as const;

const isStyle = (mark: Mark) => mark.type.spec.group === STYLE_GROUP;
/** The styles a node is inside: a chip sits inside styles but never inside code. */
const stylesOf = (node: PMNode) =>
  node.type.name === "br"
    ? []
    : node.marks.filter((mark) => isStyle(mark) && (node.isText || mark.type.name !== "code"));

/* ───────────────────────────── source → document ───────────────────────────── */

/** Inline content for `source`, which starts at `base` in the field's whole source. */
export function inlineNodes(
  schema: Schema,
  source: string,
  base: number,
  options: BuildOptions = {},
): PMNode[] {
  const out: PMNode[] = [];
  const caret = options.caret ?? null;
  const pushText = (value: string, marks: readonly Mark[] = []) =>
    value.split("\n").forEach((part, i) => {
      if (i > 0) out.push(schema.nodes.br!.create());
      if (part) out.push(schema.text(part, marks));
    });
  // One mark per container: each instance of a kind gets the next ordinal in the block, so
  // `**a****b**` stays two containers and a container split by an edit can be told from two.
  const containers = new Map<number, Mark>();
  const ordinals = new Map<string, number>();
  const nextSid = (kind: string) => {
    const sid = ordinals.get(kind) ?? 0;
    ordinals.set(kind, sid + 1);
    return sid;
  };
  const marksOf = (segment: InlineSegment): Mark[] =>
    (segment.marks ?? []).map((container, depth) => {
      let mark = containers.get(container.id);
      if (!mark) {
        const spelling = {
          open: source.slice(container.start, container.contentStart),
          close: source.slice(container.contentEnd, container.end),
        };
        mark = schema.marks[container.kind]!.create({
          ...spelling,
          sid: nextSid(container.kind),
          depth,
        });
        containers.set(container.id, mark);
      }
      return mark;
    });
  for (const segment of parseInline(source)) {
    const outer = marksOf(segment);
    switch (segment.kind) {
      case "delimiter":
        break; // its spelling lives in the container's mark
      case "text":
        pushText(segment.display, outer);
        break;
      case "escape":
        pushText(segment.display, [...outer, schema.marks.esc!.create()]);
        break;
      case "code": {
        const spelling = {
          open: source.slice(segment.start, segment.contentStart),
          close: source.slice(segment.contentEnd, segment.end),
        };
        pushText(segment.display, [
          ...outer,
          schema.marks.code!.create({ ...spelling, sid: nextSid("code") }),
        ]);
        break;
      }
      default: {
        const src = source.slice(segment.start, segment.end);
        const typing =
          caret !== null &&
          PENDING_KINDS.has(segment.kind) &&
          base + segment.start < caret &&
          caret <= base + segment.end;
        if (CHIP_KINDS.has(segment.kind) && !typing)
          out.push(schema.nodes.chip!.create({ kind: segment.kind, src }, null, outer));
        else pushText(src, outer);
      }
    }
  }
  return out;
}

export function titleToDoc(source: string, options: BuildOptions = {}): PMNode {
  const { nodes } = titleSchema;
  return nodes.doc!.create(
    null,
    nodes.line!.create(null, inlineNodes(titleSchema, source, 0, options)),
  );
}

const lineEnd = lineEndAt;
const lineStart = lineStartAt;

/** The block kinds whose first line the editor hides (a rule, an image, a fence or `$$` opener). */
const HIDES_ITS_LINE = new Set(["rule", "image", "code", "math"]);
const blankAt = (source: string, at: number) =>
  /^[ \t]*$/.test(source.slice(lineStart(source, at), lineEnd(source, at)));

/** A list whose last item (its deepest) has its text run to `end`. */
function extendLastItem(list: NoteList, end: number): NoteList {
  const items = [...list.items];
  const last = items.at(-1)!;
  items[items.length - 1] = last.children
    ? { ...last, children: extendLastItem(last.children, end) }
    : { ...last, text: { start: last.text.start, end } };
  return { ...list, items };
}

/**
 * Where a collapsed caret stands in a note shapes the document a little beyond the blocks the
 * static render shows, so the caret always has a line to stand on and nothing hides while it is
 * being typed. The source is never changed: the document writes back byte for byte.
 *
 *   caret on a line that opens a block      the line shows as its plain text while the caret is on
 *   the editor hides (`---`, `![a](…)`,      it (`---` stays text until ⏎ makes it a rule; a fence
 *   a fence or `$$` opener)                 opener does not turn the rest of the note into code)
 *   caret on a blank line right under a      that block's next line (a line break): the line typed
 *   paragraph or list item                  there continues it, as the source says
 *   caret on any other blank line            an empty paragraph of its own
 */
export function noteToDoc(source: string, options: BuildOptions = {}): PMNode {
  const schema = noteSchema;
  const n = schema.nodes;
  if (!source) return n.doc!.create({ tail: "" }, n.para!.create());
  if (!isRichNote(source))
    return n.doc!.create(
      { tail: "" },
      n.para!.create(null, inlineNodes(schema, source, 0, options)),
    );
  let previousEnd = 0;
  const caret = options.whitespaceCaret ?? options.caret ?? null;
  let blocks: readonly NoteBlock[] = parseNoteBlocks(source);
  // The caret's own line, shown as text: parsed as a blank line so the blocks around it stand.
  let scan = source;
  let pending: { readonly start: number; readonly end: number } | null = null;
  if (caret !== null) {
    const from = lineStart(source, caret);
    const opener = blocks.find((block) => block.start === from);
    if (opener && HIDES_ITS_LINE.has(opener.kind)) {
      const to = lineEnd(source, caret);
      pending = { start: from, end: to };
      scan = source.slice(0, from) + source.slice(from, to).replace(/\S/g, " ") + source.slice(to);
      blocks = parseNoteBlocks(scan, { full: true });
    }
  }
  // A blank line the caret stands on, outside every block: before which block (or at the end).
  type Gap = {
    readonly before: number;
    readonly start: number;
    readonly end: number;
    readonly raw: boolean;
  };
  let gap: Gap | null = null;
  if (caret !== null && blankAt(scan, caret)) {
    let previous = -1;
    let at = blocks.length;
    for (let i = 0; i < blocks.length; i++) {
      if (caret < blocks[i]!.start) {
        at = i;
        break;
      }
      previous = noteBlockEnd(scan, blocks[i]!);
      if (caret <= previous) {
        at = -1; // inside (or at the end of) a block
        break;
      }
    }
    if (at >= 0) {
      const above = at > 0 ? blocks[at - 1]! : null;
      const continues =
        !pending &&
        above &&
        (above.kind === "paragraph" || above.kind === "list") &&
        /^\n[ \t]*$/.test(source.slice(previous, caret));
      if (continues) {
        const copy = [...blocks];
        copy[at - 1] =
          above.kind === "paragraph"
            ? { ...above, text: { start: above.text.start, end: caret } }
            : { ...above, list: extendLastItem(above.list, caret) };
        blocks = copy;
      } else
        gap = pending
          ? { before: at, start: pending.start, end: pending.end, raw: true }
          : { before: at, start: caret, end: caret, raw: false };
    }
  }
  // A line the blocks around it would swallow once blank (a fence line between list items) stays as read.
  if (pending && !gap) blocks = parseNoteBlocks(source);
  const textblock = (
    type: string,
    start: number,
    range: SourceRange,
    end: number,
    extra: Record<string, unknown> = {},
    inline = true,
  ) => {
    // Whitespace the caret stands in stays visible while typing: the block parser trims a
    // block's edges into its prefix and suffix, so a typed trailing space would otherwise vanish
    // and the next character land before it. The source is the same either way.
    let content = range;
    if (
      inline &&
      caret !== null &&
      caret > range.end &&
      caret <= end &&
      /^[ \t]*$/.test(source.slice(range.end, caret))
    )
      content = { start: content.start, end: caret };
    if (
      inline &&
      type === "para" &&
      caret !== null &&
      caret >= start &&
      caret < range.start &&
      /^[ \t]*$/.test(source.slice(start, range.start))
    )
      content = { start, end: content.end };
    const attrs = {
      lead: source.slice(previousEnd, start),
      prefix: source.slice(start, content.start),
      suffix: source.slice(content.end, end),
      ...extra,
    };
    previousEnd = end;
    const body = source.slice(content.start, content.end);
    return n[type]!.create(
      attrs,
      inline ? inlineNodes(schema, body, content.start, options) : body ? schema.text(body) : null,
    );
  };
  const atom = (type: string, start: number, end: number) => {
    const node = n[type]!.create({
      lead: source.slice(previousEnd, start),
      src: source.slice(start, end),
    });
    previousEnd = end;
    return node;
  };
  const list = (value: NoteList): PMNode =>
    n.list!.create(
      {
        ordered: value.ordered,
        first: value.first,
        tasks: value.items.some((item) => item.checked !== undefined),
      },
      value.items.map((item) => {
        const text = textblock("itemtext", item.start, item.text, lineEnd(source, item.text.end));
        return n.item!.create({ checked: item.checked ?? null }, [
          text,
          ...(item.children ? [list(item.children)] : []),
        ]);
      }),
    );
  const nodes: PMNode[] = [];
  const pushGap = (g: Gap) => {
    if (!g.raw)
      return nodes.push(textblock("para", g.start, { start: g.start, end: g.end }, g.end));
    // the line exactly as typed: no markup is read on a line that is about to become a block
    const node = n.para!.create(
      { lead: source.slice(previousEnd, g.start), prefix: "", suffix: "" },
      g.end > g.start ? schema.text(source.slice(g.start, g.end)) : null,
    );
    previousEnd = g.end;
    return nodes.push(node);
  };
  blocks.forEach((block, index) => {
    if (gap?.before === index) pushGap(gap);
    switch (block.kind) {
      case "paragraph":
        nodes.push(textblock("para", block.start, block.text, lineEnd(source, block.text.end)));
        break;
      case "heading":
        nodes.push(
          textblock("heading", block.start, block.text, lineEnd(source, block.text.end), {
            level: block.level,
          }),
        );
        break;
      case "list":
        nodes.push(list(block.list));
        break;
      case "quote":
        nodes.push(
          n.quote!.create(
            null,
            block.lines.map((line) =>
              textblock("qline", lineStart(source, line.start), line, line.end),
            ),
          ),
        );
        break;
      case "code":
      case "math": {
        const range = block.kind === "code" ? block.code : block.tex;
        const extra = block.kind === "code" ? { lang: block.lang } : {};
        nodes.push(
          textblock(
            block.kind === "code" ? "codeblock" : "mathblock",
            block.start,
            range,
            noteBlockEnd(source, block),
            extra,
            false,
          ),
        );
        break;
      }
      case "table": {
        const end = noteBlockEnd(source, block);
        nodes.push(
          textblock(
            "rawblock",
            block.start,
            { start: block.start, end },
            end,
            { kind: "table" },
            false,
          ),
        );
        break;
      }
      case "image":
      case "rule":
        nodes.push(atom(block.kind, block.start, lineEnd(source, block.start)));
        break;
    }
  });
  if (gap && gap.before >= blocks.length) pushGap(gap);
  return n.doc!.create(
    { tail: source.slice(previousEnd) },
    nodes.length ? nodes : [n.para!.create()],
  );
}

export const sourceToDoc = (field: FieldKind, source: string, options: BuildOptions = {}) =>
  field === "title" ? titleToDoc(source, options) : noteToDoc(source, options);

/* ───────────────────────────── document → source ───────────────────────────── */

/**
 * A document's source and, for each document position, the source offsets that collapse onto
 * it: hidden delimiters make one position stand for several offsets, from `lo` (the outer edge
 * before an opening delimiter or after a closing one) to `hi`. -1 where no caret can stand.
 */
export interface Serialized {
  readonly source: string;
  readonly lo: Int32Array;
  readonly hi: Int32Array;
}

/** Documents are immutable: each is written once, however often it is asked for. */
const written = new WeakMap<PMNode, Serialized>();
export function serialize(doc: PMNode): Serialized {
  let hit = written.get(doc);
  if (!hit) written.set(doc, (hit = write(doc)));
  return hit;
}
export const docToSource = (doc: PMNode) => serialize(doc).source;

function write(doc: PMNode): Serialized {
  let out = "";
  const size = doc.content.size;
  const lo = new Int32Array(size + 1).fill(-1);
  const hi = new Int32Array(size + 1).fill(-1);
  const at = (pos: number, low: number, high = low) => {
    if (lo[pos] === -1 || low < lo[pos]!) lo[pos] = low;
    if (high > hi[pos]!) hi[pos] = high;
  };
  const inline = (block: PMNode, start: number) => {
    let pos = start;
    at(pos, out.length);
    const open: Mark[] = []; // open containers, outermost first
    const children: PMNode[] = [];
    block.forEach((child) => children.push(child));
    const openOf = (mark: Mark) => (mark.attrs.open ?? DEFAULT_SPELLING[mark.type.name]) as string;
    const closeOf = (mark: Mark) =>
      (mark.attrs.close ?? DEFAULT_SPELLING[mark.type.name]) as string;
    // Marks compare by attributes; a key makes each lookup constant time, so writing stays linear.
    const keyOf = (mark: Mark) =>
      `${mark.type.name}|${mark.attrs.open}|${mark.attrs.close}|${mark.attrs.sid}|${mark.attrs.depth}`;
    const opened = new Set<string>(); // containers already opened in this block: a reopen is a split
    const lastChild = new Map<string, number>();
    children.forEach((child, k) => {
      for (const mark of stylesOf(child)) lastChild.set(keyOf(mark), k);
    });
    const carries = (k: number, mark: Mark) =>
      k < children.length && stylesOf(children[k]!).some((other) => other.eq(mark));
    /** Closed after child `k` although it continues later in the block: a split. */
    const splitAfter = (mark: Mark, k: number) =>
      !carries(k + 1, mark) && (lastChild.get(keyOf(mark)) ?? -1) > k + 1;
    // A container written by the editor, or reopened after a split, never starts or ends with
    // whitespace: that whitespace is written outside its delimiters. Parsed ones keep their bytes.
    const movableOpen = (mark: Mark) => mark.attrs.open === null || opened.has(keyOf(mark));
    let heldSpace = ""; // trailing whitespace, held until it is known what closes after it
    let heldFrom = 0;
    const flush = () => {
      for (let i = 0; i < heldSpace.length; i++) {
        out += heldSpace[i];
        at(heldFrom + i + 1, out.length);
      }
      heldSpace = "";
    };
    const closeTo = (keep: number, spaceOutside: boolean) => {
      if (!spaceOutside) flush();
      const before = out.length;
      while (open.length > keep) out += closeOf(open.pop()!);
      if (out.length > before) at(heldSpace ? heldFrom : pos, before, out.length);
      flush();
    };
    children.forEach((child, index) => {
      let want = stylesOf(child);
      const kept = () => {
        let k = 0;
        while (k < open.length && want.some((mark) => mark.eq(open[k]!))) k++;
        return k;
      };
      let keep = kept();
      // A new container never opens just to hold whitespace (it would be empty once the space
      // moves outside); one already open simply continues through it.
      if (child.isText && /^\s*$/.test(child.text!)) {
        const stillOpen = open.slice(0, keep);
        want = want.filter(
          (mark) => !(mark.attrs.open === null && !stillOpen.some((other) => other.eq(mark))),
        );
        keep = kept();
      }
      // Code is always innermost: a container that must open inside it closes the code first
      // and reopens it inside the new container.
      const codeAt = open.findIndex((mark) => mark.type.name === "code");
      if (
        codeAt >= 0 &&
        codeAt < keep &&
        want.some((mark) => mark.type.name !== "code" && !open.some((other) => other.eq(mark)))
      )
        keep = codeAt;
      closeTo(
        keep,
        open.slice(keep).some((mark) => mark.attrs.open === null || splitAfter(mark, index - 1)),
      );
      // Open what is missing: the container that runs furthest goes outside, then the one parsed
      // outside, then by rank; code innermost.
      const extents = new Map<Mark, number>();
      const extent = (mark: Mark) => {
        let end = extents.get(mark);
        if (end === undefined) {
          end = index;
          while (end < children.length && stylesOf(children[end]!).some((other) => other.eq(mark)))
            end++;
          extents.set(mark, end);
        }
        return end;
      };
      const isCode = (mark: Mark) => (mark.type.name === "code" ? 1 : 0);
      const parsedOrder = (a: Mark, b: Mark) =>
        a.attrs.depth !== null && b.attrs.depth !== null
          ? (a.attrs.depth as number) - (b.attrs.depth as number)
          : 0;
      const toOpen = want
        .filter((mark) => !open.some((other) => other.eq(mark)))
        .sort(
          (a, b) =>
            isCode(a) - isCode(b) ||
            extent(b) - extent(a) ||
            parsedOrder(a, b) ||
            STYLE_RANK.get(a.type.name)! - STYLE_RANK.get(b.type.name)!,
        );
      const text = child.isText ? child.text! : "";
      const inParsedCode = child.marks.some(
        (mark) => mark.type.name === "code" && mark.attrs.open !== null,
      );
      let skip = 0;
      if (toOpen.length) {
        // Leading whitespace of a new or reopened container goes before its opener (a parsed
        // code span keeps its inner spaces byte for byte).
        if (child.isText && toOpen.some(movableOpen) && !inParsedCode) {
          skip = /^\s*/.exec(text)![0].length;
          for (let i = 0; i < skip; i++) {
            out += text[i];
            at(pos + i + 1, out.length);
          }
        }
        const before = out.length;
        for (const mark of toOpen) {
          out += openOf(mark);
          open.push(mark);
          opened.add(keyOf(mark));
        }
        at(pos + skip, before, out.length);
      }
      if (child.isText) {
        const literal = child.marks.some((mark) => mark.type.name === "esc");
        const closingHere = open.filter((mark) => !carries(index + 1, mark));
        const moveTrail =
          !inParsedCode &&
          closingHere.some((mark) => mark.attrs.open === null || splitAfter(mark, index));
        const body = text.length - (moveTrail ? /\s*$/.exec(text.slice(skip))![0].length : 0);
        for (let i = skip; i < body; i++) {
          const char = text[i]!;
          if (literal && MARKUP_CHARS.includes(char)) out += "\\";
          out += char;
          at(pos + i + 1, out.length);
        }
        heldSpace = text.slice(body);
        heldFrom = pos + body;
        pos += text.length;
      } else {
        flush();
        out += child.type.name === "br" ? "\n" : String(child.attrs.src);
        pos += child.nodeSize;
        at(pos, out.length);
      }
    });
    closeTo(
      0,
      open.some((mark) => mark.attrs.open === null),
    );
  };
  const walk = (node: PMNode, pos: number) => {
    if (node.isTextblock) {
      out += node.attrs.lead + node.attrs.prefix;
      if (node.type.spec.code) {
        at(pos + 1, out.length);
        const value = node.textContent;
        for (let i = 0; i < value.length; i++) {
          out += value[i];
          at(pos + 2 + i, out.length);
        }
      } else inline(node, pos + 1);
      out += node.attrs.suffix;
      at(pos + node.nodeSize, out.length);
      return;
    }
    if (node.isAtom && node.isBlock) {
      at(pos, out.length);
      out += node.attrs.lead + node.attrs.src;
      at(pos + node.nodeSize, out.length);
      return;
    }
    let child = pos + 1;
    node.forEach((inner) => {
      walk(inner, child);
      child += inner.nodeSize;
    });
  };
  let pos = 0;
  doc.forEach((child) => {
    walk(child, pos);
    pos += child.nodeSize;
  });
  out += doc.attrs.tail ?? "";
  return { source: out, lo, hi };
}

/** Document position → source offset: `lo` is the earliest offset collapsing onto it, `hi` the latest. */
export function posToSource(map: Serialized, pos: number, side: "lo" | "hi" = "hi"): number {
  for (let p = Math.min(pos, map.lo.length - 1); p >= 0; p--)
    if (map.lo[p] !== -1) return side === "lo" ? map.lo[p]! : map.hi[p]!;
  return 0;
}

/** Source offset → the position it collapses onto; an offset inside hidden markup or a chip snaps to its edge. */
export function sourceToPos(map: Serialized, offset: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let p = 0; p < map.lo.length; p++) {
    const low = map.lo[p]!;
    if (low === -1) continue;
    const high = map.hi[p]!;
    if (offset >= low && offset <= high) return p;
    const distance = offset < low ? low - offset : offset - high;
    // ties go to the earlier position: an offset inside a chip lands at its start
    if (distance < bestDistance) {
      bestDistance = distance;
      best = p;
    }
  }
  return best;
}

/* ─────────────────────── keeping what was shown (structural edits) ─────────────────────── */

/**
 * A document made by a structural edit (split halves, a merge, a paste, a format command) must
 * read back the same after a save. Where plain text would parse into markup (`x__a` + `b__`
 * would turn "ab" italic; the left half `$x$` of `$x$1` would become math), the plain markup
 * character at the first difference becomes literal, until the source reads back as shown. A
 * `*` italic the flanking rule refuses where it stands is respelled `__` first. Typing never
 * comes here: there the document follows the source.
 */
export function stabilize(field: FieldKind, doc: PMNode, options: BuildOptions = {}): PMNode {
  let current = doc;
  const respelled = new Set<string>();
  for (let guard = 0; guard < 64; guard++) {
    const fresh = sourceToDoc(field, docToSource(current), options);
    if (fresh.eq(current)) return current;
    // The same containers in the spelling they were written in, or only whitespace moved
    // outside a container: what the reader sees is unchanged, so that is the stable document.
    if (withoutSpelling(fresh) === withoutSpelling(current) || reading(fresh) === reading(current))
      return fresh;
    const at = current.content.findDiffStart(fresh.content);
    if (at === null) return current;
    const italic = respellItalic(current, at, respelled);
    if (italic) {
      current = italic;
      continue;
    }
    let target = -1;
    current.nodesBetween(at, current.content.size, (node, pos) => {
      if (target >= 0) return false;
      if (
        !node.isText ||
        node.marks.some((mark) => mark.type.name === "code" || mark.type.name === "esc")
      )
        return true;
      const text = node.text!;
      for (let i = Math.max(0, at - pos); i < text.length; i++)
        if (MARKUP_CHARS.includes(text[i]!)) {
          target = pos + i;
          break;
        }
      return false;
    });
    if (target < 0) return current;
    current = new Transform(current).addMark(
      target,
      target + 1,
      current.type.schema.marks.esc!.create(),
    ).doc;
  }
  return current;
}

/** The `*` italic run nearest the difference, respelled `__` (each run tried once). */
function respellItalic(doc: PMNode, at: number, tried: Set<string>): PMNode | null {
  let best: { from: number; to: number; mark: Mark } | null = null;
  doc.descendants((node, pos) => {
    if (!node.isInline) return true;
    const mark = node.marks.find(
      (m) => m.type.name === "italic" && (m.attrs.open === "*" || m.attrs.open === null),
    );
    if (!mark) return false;
    if (best && best.mark.eq(mark) && best.to === pos) best = { ...best, to: pos + node.nodeSize };
    else if (!best || Math.abs(pos - at) < Math.abs(best.from - at))
      best = { from: pos, to: pos + node.nodeSize, mark };
    return false;
  });
  if (!best) return null;
  const { from, to, mark } = best as { from: number; to: number; mark: Mark };
  const key = `${from}:${to}`;
  if (tried.has(key)) return null;
  tried.add(key);
  return new Transform(doc)
    .removeMark(from, to, mark)
    .addMark(from, to, mark.type.create({ ...mark.attrs, open: "__", close: "__" })).doc;
}

/** Whether a document is exactly the parse of its own source. */
export const isStable = (field: FieldKind, doc: PMNode, options: BuildOptions = {}) =>
  sourceToDoc(field, docToSource(doc), options).eq(doc);

/**
 * `stabilize` with its result checked. The document returned is always the parse of its own
 * source. When escaping cannot keep what was shown (`$x$` + `1` is no longer math), the grammar's
 * reading wins and `exact` is false, so the caller can refuse or report the edit.
 */
export function stabilizeChecked(
  field: FieldKind,
  doc: PMNode,
  options: BuildOptions = {},
): { doc: PMNode; exact: boolean } {
  const stable = stabilize(field, doc, options);
  if (isStable(field, stable, options)) return { doc: stable, exact: true };
  const reparsed = sourceToDoc(field, docToSource(stable), options);
  return { doc: reparsed, exact: withoutSid(reparsed) === withoutSid(stable) };
}

const withoutKeys = (doc: PMNode, keys: ReadonlySet<string>) =>
  JSON.stringify(doc.toJSON(), (key, value: unknown) => (keys.has(key) ? undefined : value));
// ordinals only: a cut or a join renumbers them, and neither changes what a reader sees
const SID = new Set(["sid", "depth"]);
const SPELLING = new Set(["sid", "depth", "open", "close"]);
const withoutSid = (doc: PMNode) => withoutKeys(doc, SID);
const withoutSpelling = (doc: PMNode) => withoutKeys(doc, SPELLING);

/** What a reader sees: each character with its styles (a space's styles do not count), each chip. */
export function reading(doc: PMNode): string {
  const out: string[] = [];
  doc.descendants((node) => {
    if (node.isBlock) {
      if (node.isTextblock) out.push(`¶${node.type.name}`);
      return true;
    }
    const kinds = stylesOf(node)
      .map((mark) => mark.type.name)
      .sort()
      .join("+");
    if (node.isText)
      for (const char of node.text!) out.push(/\s/.test(char) ? char : `${char}:${kinds}`);
    else out.push(`${node.type.name}:${node.attrs.src ?? ""}:${kinds}`);
    return false;
  });
  return out.join("|");
}

/* ─────────────────────── format commands ─────────────────────── */

let freshSid = 1_000_000;

/**
 * After a format command (⌘B, ⌘I, a paste …), each run of a kind that the command touched
 * becomes one container written by the editor:
 *   - a new style against or over an existing one of its kind takes it over (`**a**` + ⌘B on `b`
 *     gives `**ab**`, never `**a****b**`);
 *   - a parsed container the command shrank or split loses its spelling, so the whitespace rule
 *     applies to what is left (`**a b** c` minus bold on `a` gives `a **b** c`).
 * Containers the command did not touch (same mark, same extent as before) keep their bytes.
 */
export function normalizeTouched(before: PMNode, doc: PMNode): PMNode {
  const start = before.content.findDiffStart(doc.content);
  if (start === null) return doc;
  const end = before.content.findDiffEnd(doc.content)!;
  const lo = start - 1;
  const hi = Math.max(end.b, start) + 1;
  const tr = new Transform(doc);
  const extentIn = (block: PMNode, mark: Mark) => {
    let size = 0;
    block.forEach((child) => {
      if (child.marks.some((other) => other.eq(mark))) size += child.nodeSize;
    });
    return size;
  };
  doc.descendants((block, at) => {
    if (!block.isTextblock) return true;
    const from = at + 1;
    const to = from + block.content.size;
    if (to < lo || from > hi) return false;
    // the same block before the command (same position while it starts before the change)
    const old = from <= start ? before.resolve(Math.min(from, before.content.size)).parent : null;
    for (const kind of STYLES) {
      const runs: { from: number; to: number; marks: Mark[] }[] = [];
      let run: { from: number; to: number; marks: Mark[] } | null = null;
      block.forEach((child, offset) => {
        const p = from + offset;
        const mark =
          child.type.name === "br" ? undefined : child.marks.find((m) => m.type.name === kind);
        if (!mark) {
          run = null;
          return;
        }
        if (run && run.to === p) {
          run.to = p + child.nodeSize;
          if (!run.marks.some((m) => m.eq(mark))) run.marks.push(mark);
        } else runs.push((run = { from: p, to: p + child.nodeSize, marks: [mark] }));
      });
      for (const r of runs) {
        if (r.to < lo || r.from > hi) continue;
        const only = r.marks.length === 1 ? r.marks[0]! : null;
        const length = r.to - r.from;
        const untouched =
          only !== null &&
          only.attrs.open !== null &&
          old?.type === block.type &&
          extentIn(block, only) === length &&
          extentIn(old, only) === length;
        if (untouched) continue;
        const type = doc.type.schema.marks[kind]!;
        tr.removeMark(r.from, r.to, type).addMark(
          r.from,
          r.to,
          type.create({ open: null, close: null, sid: freshSid++, depth: null }),
        );
      }
    }
    return false;
  });
  return tr.doc;
}
