/** Portable JSON-only rich content. Imported data never selects executable code or modules. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };
interface BlockBase {
  readonly id: string;
}
export interface MarkdownBlock extends BlockBase {
  readonly kind: "markdown";
  readonly source: string;
}
export interface ImageBlock extends BlockBase {
  readonly kind: "image";
  readonly src: string;
  readonly alt: string;
  readonly caption?: string;
}
export interface DrawingBlock extends BlockBase {
  readonly kind: "drawing";
  readonly label: string;
  readonly snapshot?: string;
  readonly data?: JsonValue;
}
export interface DiagramBlock extends BlockBase {
  readonly kind: "diagram";
  readonly renderer: string;
  readonly source: string;
  readonly label: string;
}
export interface MediaTrack {
  readonly src: string;
  readonly label: string;
  readonly language: string;
}
export interface VideoBlock extends BlockBase {
  readonly kind: "video";
  readonly src: string;
  readonly label: string;
  readonly poster?: string;
  readonly tracks?: readonly MediaTrack[];
  readonly transcript?: string;
}
export interface AudioBlock extends BlockBase {
  readonly kind: "audio";
  readonly src: string;
  readonly label: string;
  readonly transcript?: string;
}
export interface LinkBlock extends BlockBase {
  readonly kind: "link";
  readonly href: string;
  readonly label: string;
  readonly description?: string;
}
export interface ReactBlock extends BlockBase {
  readonly kind: "react";
  readonly renderer: string;
  readonly label: string;
  readonly props?: JsonValue;
}
export interface CalloutBlock extends BlockBase {
  readonly kind: "callout";
  readonly label: string;
  readonly blocks: readonly RichBlock[];
}
/** Unknown types are retained verbatim by the codec and are never executed. */
export interface UnknownBlock extends BlockBase {
  readonly kind: string;
  readonly [key: string]: JsonValue | undefined;
}
export type KnownRichBlock =
  | MarkdownBlock
  | ImageBlock
  | DrawingBlock
  | DiagramBlock
  | VideoBlock
  | AudioBlock
  | LinkBlock
  | ReactBlock
  | CalloutBlock;
export type RichBlock = KnownRichBlock | UnknownBlock;
export interface RichDocument {
  readonly schema: "fast-ux-rich";
  readonly version: 1;
  readonly blocks: readonly RichBlock[];
}
export interface RichOutlineData {
  readonly content: RichDocument;
}
export const RICH_LIMITS = Object.freeze({
  maxDepth: 64,
  maxValues: 100_000,
  maxBlocks: 10_000,
  maxSourceLength: 2_000_000,
  maxJsonLength: 8_000_000,
});

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** Bounded iterative JSON validation also rejects cycles, accessors, custom prototypes and nonfinite values. */
function checkJson(value: unknown): void {
  const active = new Set<object>();
  const stack: { value: unknown; depth: number; exit?: boolean }[] = [{ value, depth: 0 }];
  let count = 0;
  while (stack.length) {
    const frame = stack.pop()!;
    if (frame.exit) {
      active.delete(frame.value as object);
      continue;
    }
    if (++count > RICH_LIMITS.maxValues || frame.depth > RICH_LIMITS.maxDepth)
      throw new TypeError("Rich JSON exceeds the validation budget.");
    const item = frame.value;
    if (item === null || typeof item === "boolean" || typeof item === "string") continue;
    if (typeof item === "number" && Number.isFinite(item) && !Object.is(item, -0)) continue;
    if (typeof item !== "object" || item === null)
      throw new TypeError("Rich content must contain only JSON values.");
    if (active.has(item)) throw new TypeError("Rich content cannot contain cycles.");
    if (
      !Array.isArray(item) &&
      Object.getPrototypeOf(item) !== Object.prototype &&
      Object.getPrototypeOf(item) !== null
    )
      throw new TypeError("Rich content must use plain JSON objects.");
    if (Object.getOwnPropertySymbols(item).length)
      throw new TypeError("Rich JSON cannot contain symbol keys.");
    const keys = Object.keys(item);
    if (keys.length + count > RICH_LIMITS.maxValues)
      throw new TypeError("Rich JSON exceeds the validation budget.");
    if (Array.isArray(item)) {
      if (keys.length !== item.length || keys.some((key, index) => key !== String(index)))
        throw new TypeError("Rich JSON arrays must be dense and contain only indexed values.");
      if (Object.getOwnPropertyNames(item).length !== keys.length + 1)
        throw new TypeError("Rich JSON arrays cannot contain hidden properties.");
    } else if (Object.getOwnPropertyNames(item).length !== keys.length)
      throw new TypeError("Rich JSON objects cannot contain hidden properties.");
    active.add(item);
    stack.push({ ...frame, exit: true });
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!("value" in descriptor)) throw new TypeError("Rich content cannot contain accessors.");
      stack.push({ value: descriptor.value, depth: frame.depth + 1 });
    }
  }
}
function required(block: Record<string, unknown>, ...keys: string[]): void {
  for (const key of keys)
    if (typeof block[key] !== "string")
      throw new TypeError(`Rich ${String(block.kind)} block requires string ${key}.`);
}
function optional(block: Record<string, unknown>, ...keys: string[]): void {
  for (const key of keys)
    if (block[key] !== undefined && typeof block[key] !== "string")
      throw new TypeError(`Rich block ${key} must be a string.`);
}
export function validateRichDocument(value: unknown): asserts value is RichDocument {
  checkJson(value);
  if (
    !record(value) ||
    value.schema !== "fast-ux-rich" ||
    value.version !== 1 ||
    !Array.isArray(value.blocks)
  )
    throw new TypeError("Unsupported rich document schema or version.");
  const pending = [...value.blocks];
  const ids = new Set<string>();
  while (pending.length) {
    const block: unknown = pending.pop();
    if (
      !record(block) ||
      typeof block.id !== "string" ||
      !block.id.trim() ||
      typeof block.kind !== "string" ||
      !block.kind.trim()
    )
      throw new TypeError("Each rich block needs a stable id and kind.");
    if (ids.has(block.id)) throw new TypeError(`Duplicate rich block id: ${block.id}`);
    ids.add(block.id);
    if (ids.size > RICH_LIMITS.maxBlocks)
      throw new TypeError("Rich document exceeds its block budget.");
    switch (block.kind) {
      case "markdown":
        required(block, "source");
        if ((block.source as string).length > RICH_LIMITS.maxSourceLength)
          throw new TypeError("Markdown source exceeds its budget.");
        break;
      case "image":
        required(block, "src", "alt");
        optional(block, "caption");
        break;
      case "drawing":
        required(block, "label");
        optional(block, "snapshot");
        break;
      case "diagram":
        required(block, "renderer", "source", "label");
        break;
      case "react":
        required(block, "renderer", "label");
        break;
      case "link":
        required(block, "href", "label");
        optional(block, "description");
        break;
      case "video":
      case "audio":
        required(block, "src", "label");
        optional(block, "transcript", "poster");
        if (block.tracks !== undefined) {
          if (!Array.isArray(block.tracks)) throw new TypeError("Media tracks must be an array.");
          for (const track of block.tracks) {
            if (!record(track)) throw new TypeError("Invalid media track.");
            required(track, "src", "label", "language");
          }
        }
        break;
      case "callout":
        required(block, "label");
        if (!Array.isArray(block.blocks)) throw new TypeError("Callout blocks must be an array.");
        for (const child of block.blocks) pending.push(child);
        break;
    }
  }
}
/** Whole-document source codec, not the outline title-text codec. Source remains byte-for-byte untouched. */
export function importMarkdownDocument(source: string, id = "markdown"): RichDocument {
  const document: RichDocument = {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [{ id, kind: "markdown", source }],
  };
  validateRichDocument(document);
  return document;
}
/** Only an untouched single Markdown block has a lossless Markdown export contract. Mixed rich documents use JSON. */
export function exportMarkdownDocument(document: RichDocument): string {
  validateRichDocument(document);
  const block = document.blocks[0];
  if (document.blocks.length !== 1 || block?.kind !== "markdown")
    throw new TypeError(
      "Mixed rich content cannot be exported losslessly as Markdown; use rich JSON.",
    );
  return (block as MarkdownBlock).source;
}
/** Canonical key ordering; no semantic normalization of source strings or unknown fields. */
export function serializeRichDocument(document: RichDocument): string {
  validateRichDocument(document);
  const sorted = (value: unknown): unknown =>
    Array.isArray(value)
      ? value.map(sorted)
      : record(value)
        ? Object.fromEntries(
            Object.keys(value)
              .sort()
              .map((key) => [key, sorted(value[key])]),
          )
        : value;
  const json = JSON.stringify(sorted(document));
  if (json.length > RICH_LIMITS.maxJsonLength)
    throw new TypeError("Rich JSON exceeds its byte budget.");
  return json;
}
export function parseRichDocument(json: string): RichDocument {
  if (typeof json !== "string" || json.length > RICH_LIMITS.maxJsonLength)
    throw new TypeError("Rich JSON exceeds its input budget.");
  const value: unknown = JSON.parse(json);
  validateRichDocument(value);
  return value;
}
/** Protocol allowlist shared by rich links and media. No data/blob/javascript or protocol-relative URLs. */
export function safeRichUrl(value: string, purpose: "link" | "media" = "link"): string | undefined {
  if (
    typeof value !== "string" ||
    !value ||
    /[\u0000-\u0020\u007f-\u009f\\]/u.test(value) ||
    value.startsWith("//")
  )
    return undefined;
  const protocol = /^([a-z][a-z\d+.-]*):/i.exec(value)?.[1]?.toLowerCase();
  if (
    protocol &&
    !(purpose === "link" ? ["https", "http", "mailto", "tel"] : ["https", "http"]).includes(
      protocol,
    )
  )
    return undefined;
  // A colon before any path/query/fragment is an unrecognized scheme, including encoded obfuscation.
  if (!protocol && /^[^/?#]*:/.test(value)) return undefined;
  return value;
}
