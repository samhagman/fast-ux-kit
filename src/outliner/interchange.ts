import { createOutlineId } from "../core/text.js";
import { importOutlineText } from "../core/outliner/interchange.js";
import {
  formatDateToken,
  literalInline,
  parseDateToken,
  parseRepeat,
} from "../core/outliner/inline.js";
import { OUTLINE_COLORS, type OutlineItem, type OutlineItemData } from "../core/outliner/types.js";
export * from "../core/outliner/interchange.js";

/** Parse OPML with the browser XML adapter, otherwise use the portable text parser. */
export function importOutline(source: string, createId = createOutlineId): OutlineItem[] {
  const trimmed = source.trim();
  return /^<\?xml|^<opml/i.test(trimmed)
    ? fromOpml(trimmed, createId)
    : importOutlineText(source, createId);
}

const SAFE_HREF = /^(?:https?:\/\/|mailto:)/i;

function fromOpml(source: string, createId: () => string): OutlineItem[] {
  const doc = new DOMParser().parseFromString(source, "text/xml");
  if (doc.querySelector("parsererror")) return importOutlineText(source, createId);
  const read = (element: Element): OutlineItem => {
    const data: { -readonly [K in keyof OutlineItemData]: OutlineItemData[K] } = {};
    const note = element.getAttribute("_note");
    if (note) data.note = note;
    const color = element.getAttribute("colorLabel") ?? element.getAttribute("_color");
    if (color && (OUTLINE_COLORS as readonly string[]).includes(color))
      data.color = color as OutlineItemData["color"];
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

type HtmlParser = (html: string) => Document;
const defaultParser: HtmlParser = (html) => new DOMParser().parseFromString(html, "text/html");

const BLOCK = new Set([
  "P",
  "DIV",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "BLOCKQUOTE",
  "PRE",
  "SECTION",
  "ARTICLE",
  "HEADER",
  "FOOTER",
  "MAIN",
  "UL",
  "OL",
  "LI",
  "TABLE",
  "TR",
  "TD",
  "TH",
  "TBODY",
  "THEAD",
  "FIGURE",
  "DL",
  "DT",
  "DD",
]);
const SKIP = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "SVG",
  "IMG",
  "VIDEO",
  "AUDIO",
  "CANVAS",
  "HEAD",
  "TITLE",
  "META",
  "LINK",
  "BUTTON",
  "SELECT",
  "TEXTAREA",
  "INPUT",
]);
const isList = (el: Element) => el.tagName === "UL" || el.tagName === "OL";
const hasBlockChild = (el: Element) => [...el.children].some((child) => BLOCK.has(child.tagName));

/** Inline style read from the attribute text: the parsed document is inert, never rendered. */
const styleOf = (el: Element, prop: string) => {
  const match = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`, "i").exec(
    el.getAttribute("style") ?? "",
  );
  return match?.[1]!.trim().toLowerCase() ?? "";
};
function markOf(el: Element): readonly [string, string] | null {
  const tag = el.tagName;
  const weight = styleOf(el, "font-weight");
  const normalWeight = weight === "normal" || weight === "400" || weight === "lighter";
  if (
    ((tag === "B" || tag === "STRONG") && !normalWeight) ||
    weight === "bold" ||
    weight === "bolder" ||
    Number(weight) >= 600
  )
    return ["**", "**"];
  const fontStyle = styleOf(el, "font-style");
  if (((tag === "I" || tag === "EM") && fontStyle !== "normal") || fontStyle === "italic")
    return ["__", "__"];
  if (
    tag === "S" ||
    tag === "DEL" ||
    tag === "STRIKE" ||
    styleOf(el, "text-decoration").includes("line-through") ||
    styleOf(el, "text-decoration-line").includes("line-through")
  )
    return ["~~", "~~"];
  if (
    tag === "CODE" ||
    tag === "KBD" ||
    tag === "SAMP" ||
    /monospace|courier|consolas|menlo/.test(styleOf(el, "font-family"))
  )
    return ["`", "`"];
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
    const date =
      parseDateToken(`!(${value.replace("T", " ").slice(0, 16)})`) ??
      parseDateToken(`!(${value.slice(0, 10)})`);
    const repeat = parseRepeat(el.getAttribute("data-repeat") ?? "") ?? undefined;
    const endValue = el.getAttribute("data-end") ?? "";
    const end = endValue
      ? (parseDateToken(`!(${endValue.replace("T", " ").slice(0, 16)})`) ??
        parseDateToken(`!(${endValue.slice(0, 10)})`))
      : null;
    if (date && end && end.value >= date.value)
      return formatDateToken(date.value, date.hasTime, undefined, {
        end: end.value,
        endHasTime: end.hasTime,
      });
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
export function importOutlineHtml(
  html: string,
  createId = createOutlineId,
  parse: HtmlParser = defaultParser,
): OutlineItem[] {
  type Mutable = {
    id: string;
    text: string;
    checked?: boolean;
    data?: { -readonly [K in keyof OutlineItemData]: OutlineItemData[K] };
    children: Mutable[];
  };
  const doc = parse(html);

  const make = (
    lines: readonly string[],
    el: Element | null,
    headingTag?: string,
  ): Mutable | null => {
    const clean = lines.map(lineClean).filter(Boolean);
    let title = (clean[0] ?? "").replace(/^[•◦▪‣·]\s*/u, "");
    const node: Mutable = { id: createId(), text: "", children: [] };
    // Checkbox state: a real checkbox, common to-do class names, ARIA, or a typed glyph prefix.
    // Only this item's own box: one inside a nested list belongs to that child.
    const owner = el?.tagName === "LI" ? el : (el?.closest("li") ?? null);
    const input =
      el &&
      [...el.querySelectorAll("input[type=checkbox], [role=checkbox], .checkbox")].find(
        (box) => box.closest("li") === owner,
      );
    if (input) {
      node.checked =
        input.hasAttribute("checked") ||
        input.getAttribute("aria-checked") === "true" ||
        input.classList.contains("checkbox-on") ||
        !!el?.querySelector(".to-do-children-checked");
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
        if (child.nodeType === 1 && /^H[1-6]$/.test((child as Element).tagName))
          heading ??= (child as Element).tagName;
        return inlineMarkup(child);
      })
      .join("");
    return { lines: text.split("\n"), heading };
  };

  const readList = (list: Element, into: Mutable[], parent?: Mutable, depth = 0) => {
    if (parent && list.tagName === "OL") parent.data = { ...parent.data, numbered: true };
    // Some doc editors flatten nesting into aria-level on siblings; real nesting also works.
    // aria-level is absolute; a list nested `depth` deep starts at that level.
    const stack: { level: number; items: Mutable[]; owner?: Mutable }[] = [
      { level: depth, items: into, owner: parent },
    ];
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
      for (const nested of child.children)
        if (isList(nested)) readList(nested, node.children, node, at + 1);
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
          const lines = inlineMarkup(el)
            .split("\n")
            .filter((line) => line.trim());
          const heading = /^H[1-3]$/.test(el.tagName) ? el.tagName : undefined;
          if (heading || lines.length <= 1) {
            const node = make(lines.length ? [lines.join(" ")] : [], el, heading);
            if (node) roots.push(node);
          } else
            for (const line of lines) {
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
      .map(({ children, ...rest }) => ({
        ...rest,
        ...(children.length ? { children: freeze(children) } : {}),
      }));
  return freeze(roots);
}

/**
 * A Markdown FILE written by another app. CommonMark decides what its markup means (`__init__`
 * is bold there, not the outliner's italic), so a CommonMark reader turns it into HTML and the
 * HTML importer reads that. `toHtml` is that reader: `loadCommonMark()` loads one on demand.
 * Paste, the outliner's own Markdown download and text or OPML never come through here.
 */
export function importMarkdownFile(
  markdown: string,
  toHtml: (markdown: string) => string,
  createId = createOutlineId,
  parse?: HtmlParser,
): OutlineItem[] {
  return importOutlineHtml(toHtml(markdown), createId, parse);
}

/**
 * The CommonMark reader (with GFM strikethrough), loaded only when a Markdown file is imported.
 * Raw HTML in the file is escaped, never passed through; the HTML importer reads the result
 * inertly either way.
 */
export async function loadCommonMark(): Promise<(markdown: string) => string> {
  const [{ micromark }, { gfmStrikethrough, gfmStrikethroughHtml }] = await Promise.all([
    import("micromark"),
    import("micromark-extension-gfm-strikethrough"),
  ]);
  return (markdown) =>
    micromark(markdown, {
      extensions: [gfmStrikethrough()],
      htmlExtensions: [gfmStrikethroughHtml()],
    });
}
