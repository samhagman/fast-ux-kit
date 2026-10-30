import { createOutlineId, exportOutlineJSON, importOutlineJSON } from "@fux/core";
import { formatDateToken, formatRepeatToken, inlineToPlain, literalInline, parseDateToken, parseInline, parseRepeat } from "./inline";
import { mirrorOf } from "./mirrors";
import { OUTLINE_COLORS, type OutlineExportFormat, type OutlineItem, type OutlineItemData } from "./types";

/**
 * Lossless-where-possible interchange. Markdown and OPML carry title, note, checkbox,
 * completion and heading; colors and numbering survive only in JSON (and OPML attributes).
 */
export function exportOutline(nodes: readonly OutlineItem[], format: OutlineExportFormat): string {
  switch (format) {
    case "json":
      // Lossless: mirrors keep `mirrorOf` and their copies (a paste re-links or keeps the content).
      return exportOutlineJSON(nodes);
    case "markdown":
      return toMarkdown(mirrorsAsLinks(nodes));
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

function toMarkdown(nodes: readonly OutlineItem[], depth = 0): string {
  const lines: string[] = [];
  for (const node of nodes) {
    const pad = "  ".repeat(depth);
    const box = node.checked !== undefined ? (node.checked ? "[x] " : "[ ] ") : "";
    const heading = node.data?.heading ? "#".repeat(node.data.heading) + " " : "";
    const title = completed(node) && node.checked === undefined ? `~~${node.text}~~` : node.text;
    lines.push(`${pad}- ${box}${heading}${title}`);
    for (const line of (node.data?.note ?? "").split("\n").filter(Boolean))
      lines.push(`${pad}  ${line}`);
    if (node.children?.length) lines.push(toMarkdown(node.children, depth + 1));
  }
  return lines.filter(Boolean).join("\n");
}

function toText(nodes: readonly OutlineItem[], depth = 0): string {
  return nodes
    .map((node) =>
      [
        "\t".repeat(depth) + node.text,
        node.children?.length ? toText(node.children, depth + 1) : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .join("\n");
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
  const stack: { indent: number; node: Mutable; bulleted: boolean }[] = [];
  for (const raw of source.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const indent = raw.match(/^[\t ]*/)![0].replace(/\t/g, "    ").length;
    let line = raw.trim();
    const bullet = /^(?:[-*+]|\d+[.)])\s+/.exec(line);
    if (!bullet && stack.length && indent > stack.at(-1)!.indent && stack.at(-1)!.bulleted) {
      // Continuation lines under a bullet become that item's note.
      const owner = stack.at(-1)!.node;
      owner.data = { ...owner.data, note: [owner.data?.note, line].filter(Boolean).join("\n") };
      continue;
    }
    if (bullet) line = line.slice(bullet[0].length);
    const node: Mutable = { id: createId(), text: line, children: [] };
    const box = /^\[( |x|X)\]\s+/.exec(line);
    if (box) {
      node.checked = box[1] !== " ";
      node.text = line.slice(box[0].length);
    }
    const heading = /^(#{1,3})\s+/.exec(node.text);
    if (heading) {
      node.data = { heading: heading[1]!.length as 1 | 2 | 3 };
      node.text = node.text.slice(heading[0].length);
    }
    // A wholly struck-through title is how Markdown export writes "done" without a checkbox.
    const struck = /^~~(.+)~~$/.exec(node.text);
    if (struck && node.checked === undefined) {
      node.data = { ...node.data, completed: true };
      node.text = struck[1]!;
    }
    while (stack.length && stack.at(-1)!.indent >= indent) stack.pop();
    (stack.at(-1)?.node.children ?? roots).push(node);
    stack.push({ indent, node, bulleted: !!bullet });
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

/** One title or note line as HTML: every run escaped, markup mapped to semantic tags. */
function inlineHtml(source: string, resolveRef?: (id: string) => string | null): string {
  return parseInline(source)
    .map((segment) => {
      const text = esc(segment.display);
      switch (segment.kind) {
        case "bold":
          return `<strong>${text}</strong>`;
        case "italic":
          return `<em>${text}</em>`;
        case "strike":
          return `<s>${text}</s>`;
        case "code":
          return `<code>${text}</code>`;
        case "highlight":
          return `<mark>${text}</mark>`;
        case "link":
        case "url":
          return segment.href && SAFE_HREF.test(segment.href) ? `<a href="${esc(segment.href)}">${text}</a>` : text;
        case "date": {
          if (!segment.date) return text;
          const token = formatDateToken(segment.date.value, segment.date.hasTime).slice(2, -1);
          // Absolute text (a pasted "Tomorrow" would be wrong tomorrow); the rule rides along.
          const repeat = segment.date.repeat ? ` data-repeat="${esc(formatRepeatToken(segment.date.repeat))}"` : "";
          return `<time datetime="${esc(token.replace(" ", "T"))}"${repeat}>${esc(absoluteDate(segment.date))}</time>`;
        }
        case "ref":
          return esc((segment.refId && resolveRef?.(segment.refId)) || segment.display);
        default:
          return text;
      }
    })
    .join("");
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
function inlineMarkup(node: Node, styled = false): string {
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
    if (date) return formatDateToken(date.value, date.hasTime, repeat);
  }
  const inner = [...el.childNodes].map((child) => inlineMarkup(child, styled || !!markOf(el))).join("");
  if (tag === "A") {
    const href = el.getAttribute("href") ?? "";
    const label = inner.trim();
    if (!SAFE_HREF.test(href) || /[\n\]]/.test(label)) return inner;
    // encodeURIComponent leaves ( and ) alone; they would close the Markdown link early.
    const safe = href.replace(/\(/g, "%28").replace(/\)/g, "%29").replace(/\s/g, "%20");
    return !label || label === href ? safe : `[${label}](${safe})`;
  }
  const mark = styled ? null : markOf(el);
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
