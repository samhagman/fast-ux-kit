import { createOutlineId, exportOutlineJSON, importOutlineJSON } from "@fux/core";
import { formatDateToken, formatRepeatToken, inlineToPlain, literalInline, parseDateToken, parseInline, parseRepeat, walkNested, type InlineMark, type InlineSegment, type InlineStyle } from "./inline";
import { mirrorOf } from "./mirrors";
import { OUTLINE_COLORS, type OutlineExportFormat, type OutlineItem, type OutlineItemData } from "./types";

/**
 * Lossless-where-possible interchange.
 *
 *   JSON      everything (the outline as stored)
 *   OPML      title, note, checkbox, completion, heading, colour, view (attributes)
 *   Markdown  title, note, checkbox, completion, heading; view, colour, numbering and the
 *             created / edited times ride in an HTML comment at the end of the item's line,
 *             invisible where Markdown is rendered:
 *               - [x] Ship it <!-- ol view=board color=red numbered created=2026-10-31T09:00:00.000Z -->
 *   Text      title, note, checkbox, completion, heading; one tab per level, note lines one
 *             level deeper and quoted:
 *               Plan
 *               \t> a note line
 *               \tChild
 *
 * A title that would read back as markup ("[x] literal", "# not a heading", "~~struck~~",
 * "> not a note", "- not a bullet") is written with a leading backslash, which the import removes again, so
 * plain titles always come back as written. Markdown drops blank lines at the very start of
 * a note; mirrors are written once, as links to their source.
 *
 * Markdown copied to the clipboard for other apps (`metadata: false`) leaves the metadata
 * comments out and writes titles as CommonMark (`toMarkdown`), so other apps read the same
 * styles; the outliner's own clipboard flavour is JSON. The downloaded file keeps the
 * outliner's own spelling, which its import reads back exactly.
 */
export function exportOutline(
  nodes: readonly OutlineItem[],
  format: OutlineExportFormat,
  /** `metadata: false`: Markdown for other apps' clipboards, without the metadata comments. */
  options: { readonly metadata?: boolean } = {},
): string {
  switch (format) {
    case "json":
      // Lossless: mirrors keep `mirrorOf` and their copies (a paste re-links or keeps the content).
      return exportOutlineJSON(nodes);
    case "markdown":
      return outlineMarkdown(mirrorsAsLinks(nodes), 0, options.metadata !== false);
    case "opml":
      return toOpml(mirrorsAsLinks(nodes));
    case "text":
      return toText(mirrorsAsLinks(nodes));
  }
}

/**
 * Flat formats have no mirrors: a mirror is written once, as a link to its source
 * (`[[Title|source-id]]`), so its copied children are never duplicated in the file.
 */
export function mirrorsAsLinks(nodes: readonly OutlineItem[]): readonly OutlineItem[] {
  return nodes.map((node) => {
    const source = mirrorOf(node);
    if (source) {
      const { children: _copies, data: _data, ...rest } = node;
      return { ...rest, text: linkMarkup(node.text, source) };
    }
    return node.children ? { ...node, children: mirrorsAsLinks(node.children) } : node;
  });
}

/**
 * Plain label for a stored `[[label|id]]` link or an export: dates are written absolute
 * ("2026-10-31 10:00 every week"), never "Tomorrow", which would be wrong the next day.
 */
export const stableLabel = (source: string) =>
  inlineToPlain(source, undefined, { dates: "absolute" }).replace(/[[\]|]/g, "").replace(/\s+/g, " ").trim() || "Untitled";
/** The outline's own rename-safe link to `id`, labelled from its title. */
export const linkMarkup = (title: string, id: string) => `[[${stableLabel(title)}|${id}]]`;

/** Whether text is one of our JSON documents (`{"version":1,"nodes":[…]}`), cheaply. */
export const looksLikeOutlineJSON = (text: string) => /^\s*\{[\s\S]*"nodes"\s*:/.test(text.slice(0, 4096)) && /"version"\s*:\s*1\b/.test(text);

const REF_LINK = /\[\[([^\]|\n]+)\|([^\]\n]+)\]\]/g;
/**
 * New ids for a set of nodes (paste, import). `keep` may return the id to use (an existing id
 * that is free); otherwise a fresh one is made. Mirrors and `[[label|id]]` links that point
 * INSIDE the set follow their target to its new id; links outside the set are untouched.
 */
export function reidentify(
  nodes: readonly OutlineItem[],
  keep: (id: string) => string | null = () => null,
  createId: () => string = createOutlineId,
): OutlineItem[] {
  const map = new Map<string, string>();
  const assign = (items: readonly OutlineItem[]) =>
    items.forEach((node) => {
      map.set(node.id, keep(node.id) ?? createId());
      if (node.children) assign(node.children);
    });
  assign(nodes);
  const relink = (text: string) => (text.includes("[[") ? text.replace(REF_LINK, (whole, label, id) => (map.has(id) ? `[[${label}|${map.get(id)}]]` : whole)) : text);
  const rewrite = (node: OutlineItem): OutlineItem => {
    const data = node.data;
    let nextData = data;
    if (data?.mirrorOf && map.has(data.mirrorOf)) nextData = { ...data, mirrorOf: map.get(data.mirrorOf)! };
    if (data?.note?.includes("[[")) nextData = { ...nextData, note: relink(data.note) };
    return {
      ...node,
      id: map.get(node.id)!,
      text: relink(node.text),
      ...(nextData ? { data: nextData } : {}),
      ...(node.children ? { children: node.children.map(rewrite) } : {}),
    };
  };
  return nodes.map(rewrite);
}

/**
 * The core's `paste-nodes` asks for one id per node, children before their parent (post-order).
 * This hands back ids already chosen (see `reidentify`) in exactly that order.
 */
export function idsInPasteOrder(nodes: readonly OutlineItem[]): () => string {
  const queue: string[] = [];
  const visit = (node: OutlineItem) => {
    node.children?.forEach(visit);
    queue.push(node.id);
  };
  nodes.forEach(visit);
  let at = 0;
  return () => queue[at++] ?? createOutlineId();
}

function completed(node: OutlineItem) {
  return node.checked === true || node.data?.completed === true;
}

/** A title that an import would read as markup: a checkbox, heading, strike, quoted note or bullet. */
const TITLE_MARKUP = /^\\*(?:\[[ xX]\][ \t]|#{1,6}[ \t]|~~.+~~$|>|[-*+][ \t]|\d+[.)][ \t])/;
const escapeTitle = (title: string) => (TITLE_MARKUP.test(title) ? `\\${title}` : title);
const unescapeTitle = (title: string) => (title.startsWith("\\") && TITLE_MARKUP.test(title) ? title.slice(1) : title);
/** The item metadata comment (Markdown); `$` anchored, so only the line's last comment counts. */
const META = /[ \t]*<!-- ol((?: [a-z]+(?:=[^\s>]+)?)*) -->$/;
const ISO = (ms: number) => new Date(ms).toISOString();
function metaComment(node: OutlineItem): string {
  const data = node.data;
  const parts: string[] = [];
  if (data?.view && data.view !== "list") parts.push(`view=${data.view}`);
  if (data?.color) parts.push(`color=${data.color}`);
  if (data?.numbered) parts.push("numbered");
  if (typeof data?.createdAt === "number" && Number.isFinite(data.createdAt)) parts.push(`created=${ISO(data.createdAt)}`);
  if (typeof data?.editedAt === "number" && Number.isFinite(data.editedAt)) parts.push(`edited=${ISO(data.editedAt)}`);
  // A title that itself ends like a comment gets an (empty) one after it, so it stays the title's.
  if (!parts.length && !META.test(node.text)) return "";
  return ` <!-- ol${parts.map((part) => ` ${part}`).join("")} -->`;
}
/** Read (and strip) the metadata comment at the end of a line. */
function readMeta(line: string): { readonly line: string; readonly data: OutlineItemData } {
  const match = META.exec(line);
  if (!match) return { line, data: {} };
  const data: { -readonly [K in keyof OutlineItemData]: OutlineItemData[K] } = {};
  for (const part of match[1]!.trim().split(" ").filter(Boolean)) {
    const [key, value = ""] = part.split("=");
    if (key === "view" && (value === "board" || value === "article" || value === "mindmap")) data.view = value;
    else if (key === "color" && (OUTLINE_COLORS as readonly string[]).includes(value)) data.color = value as OutlineItemData["color"];
    else if (key === "numbered") data.numbered = true;
    else if (key === "created" || key === "edited") {
      const ms = Date.parse(value);
      if (Number.isFinite(ms)) data[key === "created" ? "createdAt" : "editedAt"] = ms;
    }
  }
  return { line: line.slice(0, match.index), data };
}

/**
 * The checkbox, heading and title of an item's line, as Markdown and text both write it.
 * `commonmark`: the title as other apps read Markdown (see `toMarkdown`).
 */
function itemLine(node: OutlineItem, commonmark = false): string {
  const box = node.checked !== undefined ? (node.checked ? "[x] " : "[ ] ") : "";
  const heading = node.data?.heading ? "#".repeat(node.data.heading) + " " : "";
  const struck = completed(node) && node.checked === undefined;
  if (commonmark) {
    const text = toMarkdown(node.text);
    return `${box}${heading}${struck && text ? (text.includes("~~") ? `<del>${text}</del>` : `~~${text}~~`) : text}`;
  }
  const text = escapeTitle(node.text);
  return `${box}${heading}${struck ? `~~${text}~~` : text}`;
}

function outlineMarkdown(nodes: readonly OutlineItem[], depth = 0, metadata = true): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const pad = "  ".repeat(depth);
    lines.push(`${pad}- ${itemLine(node, !metadata)}${metadata ? metaComment(node) : ""}`);
    // Rich notes keep their shape: blank lines, inner indentation (code, nested lists) and list
    // markers (escaped, so they stay note lines instead of becoming child items on import).
    const note = (node.data?.note ?? "").replace(/\s+$/, "");
    if (note) for (const line of note.split("\n")) lines.push(line.trim() ? `${pad}  ${escapeNoteLine(line)}` : "");
    const children = node.children?.length ? outlineMarkdown(node.children, depth + 1, metadata) : "";
    if (children) lines.push(children);
  }
  return lines.join("\n");
}

/** A note line that reads as a list item (`- x`, `1. x`) gets one more leading backslash. */
const NOTE_BULLET = /^\\*[ \t]*(?:[-*+]|\d+[.)])[ \t]+\S/;
const escapeNoteLine = (line: string) => (NOTE_BULLET.test(line) ? `\\${line}` : line);
const unescapeNoteLine = (line: string) => (line.startsWith("\\") && NOTE_BULLET.test(line) ? line.slice(1) : line);

/**
 * One title or note line as CommonMark (with GFM strikethrough), written from its parse so
 * another app reads the same styles on every character:
 *
 *   - each style gets the delimiter that CommonMark's flanking rules accept where it lands
 *     (`**` or `__`, `*` or `_`, `~~`); where none can open and close there (`**a!**b`), it is
 *     written as inline HTML (`<strong>a!</strong>b`), which is CommonMark as well;
 *   - whitespace at a style's edges is written outside its delimiters;
 *   - literal text is escaped, except `_` between two letters or digits, which never emphasizes;
 *   - a line start that would read as a list, heading, quote or rule is escaped, and leading
 *     whitespace (which CommonMark drops, or reads as code from four spaces) is left out;
 *   - highlight stays `==x==` (`<mark>` with `highlight: "html"`); math stays `$…$` as TeX;
 *     dates and item links, which have no CommonMark form, are written to show as they are stored.
 */
export function toMarkdown(source: string, options: { readonly highlight?: "==" | "html" } = {}): string {
  const tree = walkNested<MarkdownNode>(parseInline(source), (segment) => ({ text: leafMarkdown(segment, source) }), (mark, children) => ({ mark, children }));
  return writeMarkdown(tree, options.highlight ?? "==")
    .split("\n")
    .map((line) =>
      line
        .replace(/^[ \t]+/, "")
        .replace(/^(?:#{1,6}|[-+>]|\d+[.)])(?=\s|$)/, (marker: string) => marker.replace(/[-+>#.)]/, "\\$&"))
        .replace(/^-(?=(?:\s*-){2,}\s*$)/, "\\-"),
    )
    .join("\n");
}

type MarkdownNode = { readonly text: string } | { readonly mark: InlineMark; readonly children: readonly MarkdownNode[] };

const MD_SPELLINGS: Record<InlineStyle, readonly string[]> = { bold: ["**", "__"], italic: ["*", "_"], strike: ["~~"], highlight: [] };
const MD_HTML: Record<InlineStyle, string> = { bold: "strong", italic: "em", strike: "del", highlight: "mark" };
const mdSpace = (char: string | undefined) => char === undefined || /\s/u.test(char);
const mdPunct = (char: string | undefined) => char !== undefined && /[\p{P}\p{S}]/u.test(char);
const leftFlanking = (before: string | undefined, after: string | undefined) => !mdSpace(after) && (!mdPunct(after) || mdSpace(before) || mdPunct(before));
const rightFlanking = (before: string | undefined, after: string | undefined) => !mdSpace(before) && (!mdPunct(before) || mdSpace(after) || mdPunct(after));

/** Whether delimiter `run` can open before `first` (after `before`) and close after `last` (before `after`). */
function delimits(run: string, before: string | undefined, first: string, last: string, after: string | undefined): boolean {
  const char = run[0]!;
  // never against the same character: the runs would merge into another one
  if (before === char || first === char || last === char || after === char) return false;
  if (char !== "_") return leftFlanking(before, first) && rightFlanking(last, after);
  const opens = leftFlanking(before, first) && (!rightFlanking(before, first) || mdPunct(before));
  const closes = rightFlanking(last, after) && (!leftFlanking(last, after) || mdPunct(after));
  return opens && closes;
}

function writeMarkdown(nodes: readonly MarkdownNode[], highlight: "==" | "html"): string {
  let out = "";
  nodes.forEach((node, index) => {
    if ("text" in node) {
      out += node.text;
      return;
    }
    const inner = writeMarkdown(node.children, highlight);
    const lead = /^\s*/u.exec(inner)![0];
    const body = inner.slice(lead.length).replace(/\s+$/u, "");
    const trail = inner.slice(lead.length + body.length);
    out += lead;
    if (body) {
      // what follows: the next text, or a sibling style, which always starts with punctuation
      const next = nodes[index + 1];
      const after = trail ? trail[0] : next ? ("text" in next ? next.text[0] : "<") : undefined;
      const kind = node.mark.kind;
      const run =
        kind === "highlight" ? (highlight === "==" ? "==" : undefined) : MD_SPELLINGS[kind].find((candidate) => delimits(candidate, out.at(-1), body[0]!, body.at(-1)!, after));
      out += run ? run + body + run : `<${MD_HTML[kind]}>${body}</${MD_HTML[kind]}>`;
    }
    out += trail;
  });
  return out;
}

const MD_LITERAL = /[\\`*_[\]<>~!&|=$]/g;
/** One leaf as CommonMark: text escaped, code fenced, links kept, other tokens as written. */
function leafMarkdown(segment: InlineSegment, source: string): string {
  switch (segment.kind) {
    case "text":
    case "escape":
      return segment.display.replace(MD_LITERAL, (char, at: number, all: string) =>
        char === "_" && /[\p{L}\p{N}]/u.test(all[at - 1] ?? "") && /[\p{L}\p{N}]/u.test(all[at + 1] ?? "") ? char : `\\${char}`,
      );
    case "code": {
      const fence = "`".repeat(Math.max(0, ...(segment.display.match(/`+/g) ?? []).map((run) => run.length)) + 1);
      const pad = /^[` ]|[` ]$/.test(segment.display) && segment.display.trim() ? " " : "";
      return fence + pad + segment.display + pad + fence;
    }
    case "link":
      return `[${segment.display.replace(MD_LITERAL, "\\$&")}](${segment.href})`;
    case "url":
      // A bare URL is plain text to CommonMark, so markup inside it would format: such a URL is
      // written as an autolink, or escaped where it cannot be one.
      if (!MD_LITERAL.test(segment.display.replace(/\b_\b/g, ""))) return segment.display;
      return /[>\p{Cc}]/u.test(segment.display) ? segment.display.replace(MD_LITERAL, "\\$&") : `<${segment.display}>`;
    case "tag":
    case "mention":
      return segment.display;
    case "math":
      // TeX between dollars, as math-aware Markdown readers expect it
      return source.slice(segment.start, segment.end);
    default:
      // dates and item links have no CommonMark form: their tokens, shown as written
      return source.slice(segment.start, segment.end).replace(MD_LITERAL, "\\$&");
  }
}

/** Remove up to `columns` of leading indentation (a tab counts four). */
function dedent(raw: string, columns: number): string {
  let at = 0,
    width = 0;
  while (at < raw.length && width < columns && (raw[at] === " " || raw[at] === "\t")) {
    width += raw[at] === "\t" ? 4 : 1;
    at++;
  }
  return raw.slice(at);
}

function toText(nodes: readonly OutlineItem[], depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const pad = "\t".repeat(depth);
    // A title ending like a metadata comment keeps it: an empty one follows (see metaComment).
    lines.push(pad + itemLine(node) + (META.test(node.text) ? " <!-- ol -->" : ""));
    const note = (node.data?.note ?? "").replace(/\s+$/, "");
    if (note) for (const line of note.split("\n")) lines.push(`${pad}\t>${line ? ` ${line}` : ""}`);
    if (node.children?.length) lines.push(toText(node.children, depth + 1));
  }
  return lines.join("\n");
}

const xml = (value: string) => value.replace(/[&<>"'\n\r\t]/g, (char) => `&#${char.charCodeAt(0)};`);

function toOpml(nodes: readonly OutlineItem[]): string {
  const walk = (items: readonly OutlineItem[], depth: number): string =>
    items
      .map((node) => {
        const pad = "  ".repeat(depth + 2);
        const attrs = [
          `text="${xml(node.text)}"`,
          node.data?.note ? `_note="${xml(node.data.note)}"` : "",
          completed(node) ? `_complete="true"` : "",
          node.checked !== undefined ? `_checkbox="true"` : "",
          node.data?.color ? `colorLabel="${node.data.color}"` : "",
          node.data?.heading ? `_heading="${node.data.heading}"` : "",
          node.data?.view && node.data.view !== "list" ? `_view="${node.data.view}"` : "",
        ]
          .filter(Boolean)
          .join(" ");
        return node.children?.length
          ? `${pad}<outline ${attrs}>\n${walk(node.children, depth + 1)}\n${pad}</outline>`
          : `${pad}<outline ${attrs}/>`;
      })
      .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>Outline</title></head>\n  <body>\n${walk(nodes, 0)}\n  </body>\n</opml>`;
}

/**
 * Paste/import: OPML when it looks like OPML, otherwise indented text or Markdown bullets.
 * Never evaluates or renders HTML; DOMParser is used only as an XML tokenizer.
 */
export function importOutline(source: string, createId = createOutlineId): OutlineItem[] {
  const trimmed = source.trim();
  if (/^<\?xml|^<opml/i.test(trimmed)) return fromOpml(trimmed, createId);
  if (looksLikeOutlineJSON(trimmed)) {
    try {
      // Our own .json download: lossless, with fresh ids (mirrors and links re-pointed).
      return reidentify(importOutlineJSON<OutlineItemData>(trimmed).nodes as readonly OutlineItem[], undefined, createId);
    } catch {
      // Not a valid outline after all: read it as text.
    }
  }
  return fromIndented(source, createId);
}

function fromOpml(source: string, createId: () => string): OutlineItem[] {
  const doc = new DOMParser().parseFromString(source, "text/xml");
  if (doc.querySelector("parsererror")) return fromIndented(source, createId);
  const read = (element: Element): OutlineItem => {
    const data: { -readonly [K in keyof OutlineItemData]: OutlineItemData[K] } = {};
    const note = element.getAttribute("_note");
    if (note) data.note = note;
    const color = element.getAttribute("colorLabel") ?? element.getAttribute("_color");
    if (color && (OUTLINE_COLORS as readonly string[]).includes(color)) data.color = color as OutlineItemData["color"];
    const heading = Number(element.getAttribute("_heading"));
    if (heading === 1 || heading === 2 || heading === 3) data.heading = heading;
    const view = element.getAttribute("_view");
    if (view === "board" || view === "article" || view === "mindmap") data.view = view;
    const checkbox = element.getAttribute("_checkbox") === "true";
    const complete = element.getAttribute("_complete") === "true";
    if (complete && !checkbox) data.completed = true;
    const children = [...element.children].filter((child) => child.tagName === "outline").map(read);
    return {
      id: createId(),
      text: element.getAttribute("text") ?? "",
      ...(checkbox ? { checked: complete } : {}),
      ...(Object.keys(data).length ? { data } : {}),
      ...(children.length ? { children } : {}),
    };
  };
  const body = doc.querySelector("body");
  return body ? [...body.children].filter((child) => child.tagName === "outline").map(read) : [];
}

/**
 * Indented text and Markdown lists. Depth comes from indentation (a tab, or any consistent run
 * of spaces: each line nests under the nearest less-indented line). A deeper line WITHOUT a
 * bullet under a BULLETED item is that item's note (Markdown's continuation line); under a plain
 * line it is a child, so tab-indented text from an editor, a mail or our own text export nests.
 */
function fromIndented(source: string, createId: () => string): OutlineItem[] {
  type Mutable = { id: string; text: string; checked?: boolean; data?: OutlineItemData; children: Mutable[] };
  const roots: Mutable[] = [];
  const stack: { indent: number; content: number; node: Mutable; bulleted: boolean }[] = [];
  let blanks = 0;
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) {
      blanks++;
      continue;
    }
    const gap = blanks;
    blanks = 0;
    const indent = raw.match(/^[\t ]*/)![0].replace(/\t/g, "    ").length;
    let line = raw.trim();
    const bullet = /^(?:[-*+]|\d+[.)])\s+/.exec(line);
    // Text export's note lines: quoted, one level under a plain (unbulleted) item.
    if (!bullet && stack.length && indent > stack.at(-1)!.indent && !stack.at(-1)!.bulleted && /^>(?: |$)/.test(line)) {
      const owner = stack.at(-1)!.node;
      const text = raw.trimStart().replace(/^> ?/, "").trimEnd();
      const previous = owner.data?.note;
      owner.data = { ...owner.data, note: previous !== undefined ? previous + "\n" + text : text };
      continue;
    }
    if (!bullet && stack.length && indent > stack.at(-1)!.indent && stack.at(-1)!.bulleted) {
      // Continuation lines under a bullet become that item's note, keeping their indentation
      // past the item's text column and the blank lines between them (rich notes).
      const top = stack.at(-1)!;
      const owner = top.node;
      const text = unescapeNoteLine(dedent(raw, top.content).trimEnd());
      const previous = owner.data?.note;
      owner.data = { ...owner.data, note: previous ? previous + "\n".repeat(gap + 1) + text : text };
      continue;
    }
    if (bullet) line = line.slice(bullet[0].length);
    const meta = readMeta(line);
    line = meta.line;
    const node: Mutable = { id: createId(), text: line, children: [], ...(Object.keys(meta.data).length ? { data: meta.data } : {}) };
    const box = /^\[( |x|X)\]\s+/.exec(line);
    if (box) {
      node.checked = box[1] !== " ";
      node.text = line.slice(box[0].length);
    }
    const heading = /^(#{1,3})\s+/.exec(node.text);
    if (heading) {
      node.data = { ...node.data, heading: heading[1]!.length as 1 | 2 | 3 };
      node.text = node.text.slice(heading[0].length);
    }
    // A wholly struck-through title is how Markdown export writes "done" without a checkbox.
    const struck = /^~~(.+)~~$/.exec(node.text);
    if (struck && node.checked === undefined) {
      node.data = { ...node.data, completed: true };
      node.text = struck[1]!;
    }
    // "\[x] literal", "\# not a heading": the backslash only kept the markup literal.
    node.text = unescapeTitle(node.text);
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    (stack.at(-1)?.node.children ?? roots).push(node);
    stack.push({ indent, content: indent + (bullet?.[0].length ?? 0), node, bulleted: !!bullet });
  }
  const freeze = (items: Mutable[]): OutlineItem[] =>
    items.map(({ children, ...rest }) => ({
      ...rest,
      ...(children.length ? { children: freeze(children) } : {}),
    }));
  return freeze(roots);
}

/* ───────────────────────────── Rich clipboard (text/html) ───────────────────────────── */

const esc = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i;

/** "Sat, Oct 31, 2026, 10:00 AM": the same text whatever day it is read. */
const absoluteDate = (date: { readonly value: Date; readonly hasTime: boolean }) =>
  date.value.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(date.hasTime ? { hour: "numeric", minute: "2-digit" } : {}),
  });

const HTML_STYLE: Record<InlineStyle, string> = { bold: "strong", italic: "em", strike: "s", highlight: "mark" };
/** One title or note line as HTML: every run escaped, markup mapped to semantic tags. */
export function inlineHtml(source: string, resolveRef?: (id: string) => string | null): string {
  return walkNested<string>(
    parseInline(source),
    (segment) => leafHtml(segment, resolveRef),
    (mark, children) => `<${HTML_STYLE[mark.kind]}>${children.join("")}</${HTML_STYLE[mark.kind]}>`,
  ).join("");
}
function leafHtml(segment: InlineSegment, resolveRef?: (id: string) => string | null): string {
  const text = esc(segment.display);
  switch (segment.kind) {
    case "code":
      return `<code>${text}</code>`;
    case "math":
      // TeX stays TeX between dollars (what math-aware editors paste back as a formula).
      return `$${text}$`;
    case "link":
    case "url":
      return segment.href && SAFE_HREF.test(segment.href) ? `<a href="${esc(segment.href)}">${text}</a>` : text;
    case "date": {
      if (!segment.date) return text;
      // The time as written (a wall time in a daylight-saving gap is not the instant's clock).
      const token = formatDateToken(segment.date.value, segment.date.hasTime, undefined, { time: segment.date.time }).slice(2, -1);
      // Absolute text (a pasted "Tomorrow" would be wrong tomorrow); the rule rides along.
      const repeat = segment.date.repeat ? ` data-repeat="${esc(formatRepeatToken(segment.date.repeat))}"` : "";
      if (segment.date.end) {
        // A range: the start is the <time>, its end rides along (and reads after an arrow).
        const end = { value: segment.date.end, hasTime: !!segment.date.endHasTime };
        const endToken = formatDateToken(end.value, end.hasTime).slice(2, -1).replace(" ", "T");
        return `<time datetime="${esc(token.replace(" ", "T"))}" data-end="${esc(endToken)}">${esc(absoluteDate(segment.date))} → ${esc(absoluteDate(end))}</time>`;
      }
      return `<time datetime="${esc(token.replace(" ", "T"))}"${repeat}>${esc(absoluteDate(segment.date))}</time>`;
    }
    case "ref":
      // An internal link stays a link (`#<item id>`, which a host can route), labelled with
      // the target's current title.
      return segment.refId
        ? `<a href="#${esc(encodeURIComponent(segment.refId))}">${esc(resolveRef?.(segment.refId) || segment.display)}</a>`
        : esc(segment.display);
    default:
      return text;
  }
}

/**
 * Nested `<ul><li>` for other apps (doc editors, note apps, mail): formatting, links, dates, checkbox
 * state, headings and notes. Every string is escaped; only http(s)/mailto links are emitted.
 */
export function exportOutlineHtml(nodes: readonly OutlineItem[], resolveRef?: (id: string) => string | null): string {
  const list = (items: readonly OutlineItem[], ordered: boolean): string =>
    `<${ordered ? "ol" : "ul"}>${items.map(item).join("")}</${ordered ? "ol" : "ul"}>`;
  const item = (node: OutlineItem): string => {
    const box = node.checked !== undefined ? `<input type="checkbox" disabled${node.checked ? " checked" : ""}> ` : "";
    let title = inlineHtml(node.text, resolveRef);
    if (node.checked === undefined && node.data?.completed) title = `<s>${title}</s>`;
    const heading = node.data?.heading;
    const head = heading ? `<h${heading}>${box}${title}</h${heading}>` : `${box}${title}`;
    const lines = (node.data?.note ?? "").split("\n").filter(Boolean).map((line) => inlineHtml(line, resolveRef));
    // After a block heading a <br> would add a blank line in Docs and Mail: the note is a <p> there.
    const note = !lines.length ? "" : heading ? `<p>${lines.join("<br>")}</p>` : lines.map((line) => `<br><span>${line}</span>`).join("");
    const children = node.children?.length ? list(node.children, !!node.data?.numbered) : "";
    return `<li>${head}${note}${children}</li>`;
  };
  return `<meta charset="utf-8">${list(mirrorsAsLinks(nodes), false)}`;
}

/** Whether pasted HTML carries outline structure worth importing (lists or several blocks). */
export function htmlHasStructure(html: string): boolean {
  if (/<(?:ul|ol|li)\b/i.test(html)) return true;
  return (html.match(/<(?:p|div|h[1-6]|blockquote|pre)\b/gi)?.length ?? 0) >= 2;
}

type HtmlParser = (html: string) => Document;
const defaultParser: HtmlParser = (html) => new DOMParser().parseFromString(html, "text/html");

const BLOCK = new Set(["P", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "SECTION", "ARTICLE", "HEADER", "FOOTER", "MAIN", "UL", "OL", "LI", "TABLE", "TR", "TD", "TH", "TBODY", "THEAD", "FIGURE", "DL", "DT", "DD"]);
const SKIP = new Set(["SCRIPT", "STYLE", "TEMPLATE", "NOSCRIPT", "IFRAME", "OBJECT", "EMBED", "SVG", "IMG", "VIDEO", "AUDIO", "CANVAS", "HEAD", "TITLE", "META", "LINK", "BUTTON", "SELECT", "TEXTAREA", "INPUT"]);
const isList = (el: Element) => el.tagName === "UL" || el.tagName === "OL";
const hasBlockChild = (el: Element) => [...el.children].some((child) => BLOCK.has(child.tagName));

/** Inline style read from the attribute text: the parsed document is inert, never rendered. */
const styleOf = (el: Element, prop: string) => {
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(el.getAttribute("style") ?? "");
  return match?.[1]!.trim().toLowerCase() ?? "";
};
function markOf(el: Element): readonly [string, string] | null {
  const tag = el.tagName;
  const weight = styleOf(el, "font-weight");
  const normalWeight = weight === "normal" || weight === "400" || weight === "lighter";
  if (((tag === "B" || tag === "STRONG") && !normalWeight) || weight === "bold" || weight === "bolder" || Number(weight) >= 600) return ["**", "**"];
  const fontStyle = styleOf(el, "font-style");
  if (((tag === "I" || tag === "EM") && fontStyle !== "normal") || fontStyle === "italic") return ["__", "__"];
  if (tag === "S" || tag === "DEL" || tag === "STRIKE" || styleOf(el, "text-decoration").includes("line-through") || styleOf(el, "text-decoration-line").includes("line-through")) return ["~~", "~~"];
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP" || /monospace|courier|consolas|menlo/.test(styleOf(el, "font-family"))) return ["`", "`"];
  if (tag === "MARK") return ["==", "=="];
  return null;
}

/** Visible text of an element as outline markup lines ("\n" = a line break). Never renders. */
function inlineMarkup(node: Node): string {
  // Text is literal: only the importer's own markers (from tags and styles) create formatting,
  // so "[[Launch goals|goals-1]]" or "__init__" typed in a pasted document stays text.
  if (node.nodeType === 3) return literalInline((node.textContent ?? "").replace(/[\s ]+/g, " "));
  if (node.nodeType !== 1) return "";
  const el = node as Element;
  const tag = el.tagName;
  if (SKIP.has(tag) || isList(el)) return "";
  if (tag === "BR") return "\n";
  if (tag === "TIME") {
    const value = el.getAttribute("datetime") ?? "";
    const date = parseDateToken(`!(${value.replace("T", " ").slice(0, 16)})`) ?? parseDateToken(`!(${value.slice(0, 10)})`);
    const repeat = parseRepeat(el.getAttribute("data-repeat") ?? "") ?? undefined;
    const endValue = el.getAttribute("data-end") ?? "";
    const end = endValue ? (parseDateToken(`!(${endValue.replace("T", " ").slice(0, 16)})`) ?? parseDateToken(`!(${endValue.slice(0, 10)})`)) : null;
    if (date && end && end.value >= date.value) return formatDateToken(date.value, date.hasTime, undefined, { end: end.value, endHasTime: end.hasTime });
    if (date) return formatDateToken(date.value, date.hasTime, repeat);
  }
  // Styles nest (`<b>a <i>b</i></b>` is bold around italic); a style inside one of its own kind
  // adds nothing (its delimiters already show in `inner`, so the line keeps the inner one).
  const inner = [...el.childNodes].map(inlineMarkup).join("");
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const label = inner.trim();
    if (!SAFE_HREF.test(href) || /[\n\]]/.test(label)) return inner;
    // encodeURIComponent leaves ( and ) alone; they would close the Markdown link early.
    const safe = href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
    return !label || label === href ? safe : `[${label}](${safe})`;
  }
  const mark = markOf(el);
  if (!mark) return BLOCK.has(tag) ? `\n${inner}\n` : inner;
  // Markers hug the text: "**word** " never "**word **", and never span a line break.
  return inner
    .split("\n")
    .map((line) => {
      const core = line.trim();
      if (!core || core.includes(mark[0])) return line;
      const lead = line.slice(0, line.indexOf(core));
      return `${lead}${mark[0]}${core}${mark[1]}${line.slice(lead.length + core.length)}`;
    })
    .join("\n");
}

const lineClean = (value: string) => value.replace(/[ \t]+/g, " ").trim();
const BOX_PREFIX = /^(?:\[( |x|X)\]|([☐□])|([☑☒✅✓✔]))\s+/u;

/** Paste from other apps: nested lists (doc editors, note apps, web pages) become nested items. */
export function importOutlineHtml(html: string, createId = createOutlineId, parse: HtmlParser = defaultParser): OutlineItem[] {
  type Mutable = { id: string; text: string; checked?: boolean; data?: { -readonly [K in keyof OutlineItemData]: OutlineItemData[K] }; children: Mutable[] };
  const doc = parse(html);

  const make = (lines: readonly string[], el: Element | null, headingTag?: string): Mutable | null => {
    const clean = lines.map(lineClean).filter(Boolean);
    let title = (clean[0] ?? "").replace(/^[•◦▪‣·]\s*/u, "");
    const node: Mutable = { id: createId(), text: "", children: [] };
    // Checkbox state: a real checkbox, common to-do class names, ARIA, or a typed glyph prefix.
    // Only this item's own box: one inside a nested list belongs to that child.
    const owner = el?.tagName === "LI" ? el : el?.closest("li") ?? null;
    const input = el && [...el.querySelectorAll("input[type=checkbox], [role=checkbox], .checkbox")].find((box) => box.closest("li") === owner);
    if (input) {
      node.checked =
        input.hasAttribute("checked") || input.getAttribute("aria-checked") === "true" || input.classList.contains("checkbox-on") || !!el?.querySelector(".to-do-children-checked");
    }
    const box = BOX_PREFIX.exec(title);
    if (box) {
      node.checked = node.checked ?? (box[1] ? box[1] !== " " : !!box[3]);
      title = title.slice(box[0].length);
    }
    const heading = headingTag ? Number(headingTag.slice(1)) : 0;
    if (heading >= 1 && heading <= 3) node.data = { heading: heading as 1 | 2 | 3 };
    const struck = /^~~([^~]+)~~$/.exec(title);
    if (struck && node.checked === undefined) {
      node.data = { ...node.data, completed: true };
      title = struck[1]!;
    }
    node.text = title;
    const note = clean.slice(1).join("\n");
    if (note) node.data = { ...node.data, note };
    return title || note ? node : null;
  };

  /** Title + note lines of a list item, excluding its nested lists. */
  const itemLines = (li: Element): { lines: string[]; heading?: string } => {
    let heading: string | undefined;
    const text = [...li.childNodes]
      .map((child) => {
        if (child.nodeType === 1 && /^H[1-6]$/.test((child as Element).tagName)) heading ??= (child as Element).tagName;
        return inlineMarkup(child);
      })
      .join("");
    return { lines: text.split("\n"), heading };
  };

  const readList = (list: Element, into: Mutable[], parent?: Mutable, depth = 0) => {
    if (parent && list.tagName === "OL") parent.data = { ...parent.data, numbered: true };
    // Some doc editors flatten nesting into aria-level on siblings; real nesting also works.
    // aria-level is absolute; a list nested `depth` deep starts at that level.
    const stack: { level: number; items: Mutable[]; owner?: Mutable }[] = [{ level: depth, items: into, owner: parent }];
    for (const child of list.children) {
      if (isList(child)) {
        const owner = stack.at(-1)!.items.at(-1);
        if (owner) readList(child, owner.children, owner, stack.at(-1)!.level + 1);
        else readList(child, stack.at(-1)!.items, parent, stack.at(-1)!.level);
        continue;
      }
      if (child.tagName !== "LI") continue;
      const aria = Number(child.getAttribute("aria-level"));
      const level = aria >= 1 ? Math.max(depth, aria - 1) : stack.at(-1)!.level;
      while (stack.length > 1 && stack.at(-1)!.level > level) stack.pop();
      if (level > stack.at(-1)!.level) {
        const owner = stack.at(-1)!.items.at(-1);
        if (owner) stack.push({ level, items: owner.children, owner });
      }
      const { lines, heading } = itemLines(child);
      const node = make(lines, child, heading) ?? { id: createId(), text: "", children: [] };
      stack.at(-1)!.items.push(node);
      const at = stack.at(-1)!.level;
      for (const nested of child.children) if (isList(nested)) readList(nested, node.children, node, at + 1);
    }
  };

  const roots: Mutable[] = [];
  const walk = (container: Element) => {
    let pending = "";
    const flush = () => {
      for (const line of pending.split("\n")) {
        const node = make([line], null);
        if (node) roots.push(node);
      }
      pending = "";
    };
    for (const child of container.childNodes) {
      if (child.nodeType !== 1) {
        pending += inlineMarkup(child);
        continue;
      }
      const el = child as Element;
      if (SKIP.has(el.tagName)) continue;
      if (isList(el)) {
        flush();
        readList(el, roots);
      } else if (BLOCK.has(el.tagName) || hasBlockChild(el)) {
        flush();
        if (hasBlockChild(el)) walk(el);
        else {
          const lines = inlineMarkup(el).split("\n").filter((line) => line.trim());
          const heading = /^H[1-3]$/.test(el.tagName) ? el.tagName : undefined;
          if (heading || lines.length <= 1) {
            const node = make(lines.length ? [lines.join(" ")] : [], el, heading);
            if (node) roots.push(node);
          } else for (const line of lines) {
            const node = make([line], null);
            if (node) roots.push(node);
          }
        }
      } else pending += inlineMarkup(el);
    }
    flush();
  };
  if (doc.body) walk(doc.body);

  const freeze = (items: Mutable[]): OutlineItem[] =>
    items
      .filter((item) => item.text || item.children.length || item.data?.note)
      .map(({ children, ...rest }) => ({ ...rest, ...(children.length ? { children: freeze(children) } : {}) }));
  return freeze(roots);
}

/**
 * A Markdown FILE written by another app. CommonMark decides what its markup means (`__init__`
 * is bold there, not the outliner's italic), so a CommonMark reader turns it into HTML and the
 * HTML importer reads that. `toHtml` is that reader: `loadCommonMark()` loads one on demand.
 * Paste, the outliner's own Markdown download and text or OPML never come through here.
 */
export function importMarkdownFile(markdown: string, toHtml: (markdown: string) => string, createId = createOutlineId, parse?: HtmlParser): OutlineItem[] {
  return importOutlineHtml(toHtml(markdown), createId, parse);
}

/**
 * The CommonMark reader (with GFM strikethrough), loaded only when a Markdown file is imported.
 * Raw HTML in the file is escaped, never passed through; the HTML importer reads the result
 * inertly either way.
 */
export async function loadCommonMark(): Promise<(markdown: string) => string> {
  const [{ micromark }, { gfmStrikethrough, gfmStrikethroughHtml }] = await Promise.all([import("micromark"), import("micromark-extension-gfm-strikethrough")]);
  return (markdown) => micromark(markdown, { extensions: [gfmStrikethrough()], htmlExtensions: [gfmStrikethroughHtml()] });
}
