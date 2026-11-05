import type { OutlineItem } from "./types.js";

/**
 * Import loss report: after an import, say plainly what did NOT survive, with counts, instead of
 * letting it vanish. Pure and inert: OPML and HTML are read with DOMParser as data (never
 * rendered, nothing runs), Markdown and text are judged from what the importer produced.
 *
 *   OPML      attributes the outliner does not keep (_status="…" ×3), unknown colour labels,
 *             outline metadata in <head> (expansionState, ownerName …), link outlines' url=
 *   HTML      images, embeds and media, scripts and styles (removed), tables (flattened to
 *             lines), form controls, links with unsafe targets (kept as text)
 *   Markdown  top-level table rows, code fences and images (only a NOTE renders those: under a
 *             bullet they survive), raw HTML tags and front matter, all kept as plain text
 *   JSON      the outliner's own format: lossless, so never a report
 */
export type ImportFormat = "opml" | "html" | "markdown" | "text" | "json";

export interface ImportLoss {
  /** Stable key for tests and hosts (`opml-attribute:_status`, `html-images`, …). */
  readonly key: string;
  /** Plain words: "Images", "OPML attribute _status". */
  readonly label: string;
  readonly count: number;
  /** What happened to it, short: "dropped", "kept as text", "flattened to lines". */
  readonly fate: string;
}

export interface ImportReport {
  readonly format: ImportFormat;
  /** Items the import created. */
  readonly items: number;
  readonly losses: readonly ImportLoss[];
}

/** Attributes the OPML reader keeps (see interchange.ts `fromOpml`). */
const OPML_KEPT = new Set([
  "text",
  "_note",
  "colorLabel",
  "_color",
  "_heading",
  "_view",
  "_checkbox",
  "_complete",
]);
/** Common OPML attributes that carry nothing the outline loses (display hints, defaults). */
const OPML_HARMLESS = new Set(["type", "isComment", "isBreakpoint"]);
const OUTLINE_COLORS = new Set(["red", "orange", "yellow", "green", "blue", "purple"]);

export function detectImportFormat(source: string): ImportFormat {
  const trimmed = source.trimStart();
  if (/^<\?xml|^<opml/i.test(trimmed)) return "opml";
  if (/^[[{]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return "json";
    } catch {
      /* not JSON */
    }
  }
  if (/^<(?:!doctype|html|body|ul|ol|div|p|h[1-6]|table)\b/i.test(trimmed)) return "html";
  return /^\s*(?:[-*+]|\d+[.)])\s/m.test(source) || /^#{1,6}\s/m.test(source) ? "markdown" : "text";
}

type Parse = (source: string, type: DOMParserSupportedType) => Document;
const defaultParse: Parse = (source, type) => new DOMParser().parseFromString(source, type);

/** What an import of `source` (which produced `nodes`) lost. */
export function analyzeImport(
  source: string,
  nodes: readonly OutlineItem[],
  options: {
    readonly format?: ImportFormat;
    readonly parse?: Parse;
    /** Items created, when known (else counted from `nodes`). */ readonly items?: number;
  } = {},
): ImportReport {
  const format = options.format ?? detectImportFormat(source);
  const parse = options.parse ?? defaultParse;
  const items = options.items ?? countNodes(nodes);
  const losses =
    format === "opml"
      ? opmlLosses(source, parse)
      : format === "html"
        ? htmlLosses(source, parse)
        : format === "json"
          ? []
          : markdownLosses(nodes);
  return { format, items, losses: losses.filter((loss) => loss.count > 0) };
}

function countNodes(nodes: readonly OutlineItem[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    count++;
    if (node.children) stack.push(...node.children);
  }
  return count;
}

class Tally {
  private readonly map = new Map<string, ImportLoss>();
  add(key: string, label: string, fate: string, by = 1) {
    const prior = this.map.get(key);
    this.map.set(key, { key, label, fate, count: (prior?.count ?? 0) + by });
  }
  list(): ImportLoss[] {
    return [...this.map.values()].sort(
      (a, b) => b.count - a.count || a.label.localeCompare(b.label),
    );
  }
}

function opmlLosses(source: string, parse: Parse): ImportLoss[] {
  const doc = parse(source.trim(), "text/xml");
  const tally = new Tally();
  if (doc.querySelector("parsererror")) {
    tally.add("opml-unreadable", "OPML that could not be read as XML", "imported as text");
    return tally.list();
  }
  for (const element of doc.querySelectorAll("body outline")) {
    for (const attr of element.attributes) {
      const name = attr.name;
      if (OPML_KEPT.has(name) || OPML_HARMLESS.has(name) || !attr.value) continue;
      if (name === "url" || name === "htmlUrl" || name === "xmlUrl")
        tally.add(`opml-attribute:${name}`, `Link targets (${name})`, "dropped");
      else tally.add(`opml-attribute:${name}`, `OPML attribute ${name}`, "dropped");
    }
    const color = element.getAttribute("colorLabel") ?? element.getAttribute("_color");
    if (color && !OUTLINE_COLORS.has(color))
      tally.add("opml-color", "Unknown colour labels", "dropped");
    const heading = element.getAttribute("_heading");
    if (heading && !["1", "2", "3"].includes(heading))
      tally.add("opml-heading", "Heading levels below 3", "dropped");
  }
  const head = [...(doc.querySelector("head")?.children ?? [])].filter(
    (el) => el.tagName !== "title" && el.textContent?.trim(),
  );
  if (head.length)
    tally.add(
      "opml-head",
      `Document metadata (${head.map((el) => el.tagName).join(", ")})`,
      "dropped",
      head.length,
    );
  return tally.list();
}

const HTML_RULES: readonly (readonly [
  selector: string,
  key: string,
  label: string,
  fate: string,
])[] = [
  ["img, picture", "html-images", "Images", "dropped"],
  [
    "iframe, embed, object, video, audio, canvas, svg",
    "html-embeds",
    "Embeds and media",
    "dropped",
  ],
  ["script, style, noscript, template", "html-scripts", "Scripts and styles", "removed for safety"],
  ["table", "html-tables", "Tables", "flattened to lines"],
  [
    "select, textarea, button, input:not([type=checkbox])",
    "html-forms",
    "Form controls",
    "dropped",
  ],
];

function htmlLosses(source: string, parse: Parse): ImportLoss[] {
  const doc = parse(source, "text/html");
  const tally = new Tally();
  for (const [selector, key, label, fate] of HTML_RULES) {
    // Media nested in a dropped container counts once (a <picture> holds an <img>).
    const found = [...doc.querySelectorAll(selector)].filter(
      (el) => !el.parentElement?.closest(selector),
    );
    if (found.length) tally.add(key, label, fate, found.length);
  }
  const unsafe = [...doc.querySelectorAll("a[href]")].filter((a) => {
    const href = a.getAttribute("href")!.trim();
    return !/^(?:https?:\/\/|mailto:|#|\/|\.)/i.test(href) && /^[a-z][a-z0-9+.-]*:/i.test(href);
  });
  if (unsafe.length)
    tally.add("html-unsafe-links", "Links with unsafe targets", "kept as text", unsafe.length);
  return tally.list();
}

function markdownLosses(nodes: readonly OutlineItem[]): ImportLoss[] {
  const tally = new Tally();
  const stack = [...nodes];
  let fence = false;
  let first = true;
  let frontMatter = false;
  while (stack.length) {
    const node = stack.shift()!;
    const text = node.text.trim();
    if (first && text === "---") frontMatter = true;
    else if (frontMatter) {
      if (text === "---") frontMatter = false;
      tally.add("md-front-matter", "Front matter lines", "kept as items");
    } else if (/^(```|~~~)/.test(text)) {
      if (!fence) tally.add("md-code", "Code blocks outside a note", "kept as plain items");
      fence = !fence;
    } else if (fence) {
      // Lines inside the fence are part of the block already counted.
    } else if (/^\|.*\|$/.test(text))
      tally.add("md-tables", "Table rows outside a note", "kept as plain items");
    else if (/!\[[^\]]*\]\([^)]+\)/.test(text))
      tally.add("md-images", "Images in item titles", "kept as links");
    else if (/<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?>/i.test(text))
      tally.add("md-html", "Raw HTML tags", "kept as text");
    first = false;
    if (node.children) stack.unshift(...node.children);
  }
  return tally.list();
}

/** One short sentence for a toast title: "Imported 12 items · 3 things didn't survive". */
export function summarizeReport(report: ImportReport): string {
  const items = `Imported ${report.items.toLocaleString()} item${report.items === 1 ? "" : "s"}`;
  const lost = report.losses.reduce((sum, loss) => sum + loss.count, 0);
  return lost
    ? `${items} · ${lost.toLocaleString()} thing${lost === 1 ? "" : "s"} didn't survive`
    : items;
}
