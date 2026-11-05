/**
 * The editing surface's document shape. The stored text stays markdown-lite source; the editor
 * document is always the parse of some source, and every node and mark that came from source
 * holds the exact spelling of the markup around its visible content, so writing it back
 * reproduces the source byte for byte (see source-doc.ts).
 *
 *   textblocks   lead    source between the previous block and this block's first line
 *                prefix  source from the line start to the visible content ("## ", "  - [ ] ")
 *                suffix  source from the content end to the end of the block (" ##", "\n```")
 *   atom blocks  lead + src (images, rules)
 *   doc.tail     source after the last block
 *
 *   style marks  bold, italic, strike, highlight, code: `open` / `close` spelling; `sid`, the
 *                container's ordinal in its block, so two touching containers of one kind stay two;
 *                `depth`, its nesting level as parsed, which orders containers with equal extents
 *   esc          a literal markup character, written back with its backslash
 *   chip         an inline atom holding a whole token (tag, mention, date, ref, link, URL, math)
 *   br           a line break inside a paragraph or list item
 */
import { Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import { INLINE_CLASS } from "../inline.js";
import { NOTE_CLASS } from "../rich-note.js";

export type FieldKind = "title" | "note";

/** The mark group every style belongs to (`esc` does not). */
export const STYLE_GROUP = "style";

/**
 * How a style made in the editor (⌘B, ⌘I …) is written: its marks have no spelling of their own
 * (`open: null`), and the writer uses these, with edge whitespace moved outside the delimiters.
 */
export const DEFAULT_SPELLING: Record<string, string> = {
  bold: "**",
  italic: "*",
  strike: "~~",
  highlight: "==",
  code: "`",
};

const style = (tag: string, kind: keyof typeof INLINE_CLASS, inclusive = true): MarkSpec => ({
  attrs: {
    open: { default: null },
    close: { default: null },
    sid: { default: 0 },
    depth: { default: null },
  },
  group: STYLE_GROUP,
  // Styles stack, one of each kind (a mark excludes its own type by default).
  inclusive,
  // The same nesting as the static render: each run sits in a span inside the element.
  toDOM: () => [tag, { class: INLINE_CLASS[kind] }, ["span", 0]],
  parseDOM: [],
});

const marks: Record<string, MarkSpec> = {
  bold: style("strong", "bold"),
  italic: style("em", "italic"),
  strike: style("s", "strike"),
  // Code is a leaf in the grammar: nothing nests inside it, and typing at its end never extends it.
  code: { ...style("code", "code", false), excludes: "code esc" },
  highlight: style("span", "highlight"),
  // A literal markup character (`\*`): inside styles, never inside code.
  esc: { inclusive: false, excludes: "esc code", toDOM: () => ["span", { "data-esc": "" }, 0] },
};

const blockAttrs = { lead: { default: "" }, prefix: { default: "" }, suffix: { default: "" } };
const LINE_CLASS = "whitespace-pre-wrap break-words";

const chip: NodeSpec = {
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  attrs: { kind: { default: "tag" }, src: { default: "" } },
  toDOM: (node) => [
    "span",
    { "data-chip": node.attrs.kind, contenteditable: "false" },
    node.attrs.src,
  ],
};
const br: NodeSpec = { group: "inline", inline: true, selectable: false, toDOM: () => ["br"] };
const text: NodeSpec = { group: "inline" };

/** A title: one line of inline content. */
export const titleSchema = new Schema({
  nodes: {
    doc: { content: "line" },
    line: {
      content: "inline*",
      attrs: blockAttrs,
      toDOM: () => ["div", { dir: "auto", class: LINE_CLASS }, 0],
    },
    text,
    chip,
    br,
  },
  marks,
});

const textblock = (className: string, extra: Record<string, unknown> = {}): NodeSpec => ({
  content: "inline*",
  attrs: { ...blockAttrs, ...extra },
  toDOM: () => ["div", { dir: "auto", class: `${className} ${LINE_CLASS}`.trim() }, 0],
});
const sourceBlock = (extra: Record<string, unknown>, toDOM: NodeSpec["toDOM"]): NodeSpec => ({
  group: "block",
  content: "text*",
  marks: "",
  code: true,
  attrs: { ...blockAttrs, ...extra },
  toDOM,
});

/**
 * A note: the blocks of rich-note.ts, each backed by its source. Text blocks carry the static
 * render's classes (NOTE_CLASS), so a note looks the same being read and being edited; code,
 * math, tables, images and task boxes have node views in field-view.tsx.
 */
export const noteSchema = new Schema({
  nodes: {
    doc: { content: "block+", attrs: { tail: { default: "" } } },
    para: { ...textblock(NOTE_CLASS.paragraph), group: "block" },
    heading: {
      ...textblock("", { level: { default: 1 } }),
      group: "block",
      toDOM: (node) => [
        "div",
        {
          dir: "auto",
          "data-heading": String(node.attrs.level),
          class: `${NOTE_CLASS.heading(node.attrs.level as number)} ${LINE_CLASS}`,
        },
        0,
      ],
    },
    list: {
      group: "block",
      content: "item+",
      // `tasks`: some item has a box (the list then has no markers); read off the items when parsed
      attrs: { ordered: { default: false }, first: { default: 1 }, tasks: { default: false } },
      toDOM: (node) => {
        const tasks = !!node.attrs.tasks;
        const start =
          node.attrs.ordered && node.attrs.first !== 1 ? { start: String(node.attrs.first) } : {};
        return [
          node.attrs.ordered ? "ol" : "ul",
          { class: NOTE_CLASS.list(!!node.attrs.ordered, tasks), ...start },
          0,
        ];
      },
    },
    item: {
      content: "itemtext list?",
      attrs: { checked: { default: null } },
      toDOM: (node) => ["li", { class: NOTE_CLASS.item(node.attrs.checked !== null) }, 0],
    },
    itemtext: textblock(""),
    quote: {
      group: "block",
      content: "qline+",
      toDOM: () => ["div", { class: NOTE_CLASS.quote }, 0],
    },
    qline: textblock(NOTE_CLASS.quoteLine),
    codeblock: sourceBlock({ lang: { default: "" } }, () => ["pre", ["code", 0]]),
    mathblock: sourceBlock({}, () => ["pre", { "data-math": "" }, 0]),
    /** A block the editor shows as its source (tables, until they are edited in place). */
    rawblock: sourceBlock({ kind: { default: "table" } }, () => ["pre", { "data-raw": "" }, 0]),
    image: {
      group: "block",
      atom: true,
      attrs: { lead: { default: "" }, src: { default: "" } },
      toDOM: (node) => ["div", { "data-image": "" }, node.attrs.src],
    },
    rule: {
      group: "block",
      atom: true,
      attrs: { lead: { default: "" }, src: { default: "---" } },
      toDOM: () => ["div", { role: "separator", class: NOTE_CLASS.rule }],
    },
    text,
    chip,
    br,
  },
  marks,
});

export const schemaFor = (field: FieldKind) => (field === "title" ? titleSchema : noteSchema);
