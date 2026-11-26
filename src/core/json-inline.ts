/**
 * Portable rules for showing JSON values as text: how a primitive reads, and when a small
 * object or array is short enough to draw on one line. No React or DOM.
 */

export type JsonLeafKind =
  "string" | "number" | "boolean" | "null" | "undefined" | "bigint" | "function" | "symbol";

export interface JsonLeaf {
  readonly kind: JsonLeafKind;
  /** Strings are quoted, bigints end in `n`; everything else is `String(value)`. */
  readonly text: string;
}

/** The kind and text of a value that has no entries, or undefined for an object or array. */
export function jsonLeaf(value: unknown): JsonLeaf | undefined {
  if (value !== null && typeof value === "object") return undefined;
  if (value === null) return { kind: "null", text: "null" };
  if (typeof value === "string") return { kind: "string", text: JSON.stringify(value) };
  if (typeof value === "bigint") return { kind: "bigint", text: `${value}n` };
  return { kind: typeof value as JsonLeafKind, text: String(value) };
}

/** One piece of an inline value, in reading order. */
export type JsonInlinePart =
  | { readonly part: "bracket"; readonly text: "{" | "}" | "[" | "]" }
  | { readonly part: "key"; readonly text: string }
  | { readonly part: "colon"; readonly text: ":" }
  | { readonly part: "space"; readonly text: " " }
  | { readonly part: "value"; readonly kind: JsonLeafKind; readonly text: string };

export interface JsonInline {
  readonly kind: "object" | "array";
  readonly parts: readonly JsonInlinePart[];
  /** The parts joined, such as `{ SUBMIT: "review" }` or `["a"]`. */
  readonly text: string;
  /** How many objects and arrays are nested, counting the value itself. */
  readonly depth: number;
}

export interface JsonInlineLimits {
  /** Most nested objects and arrays drawn on one line. Default `JSON_INLINE_MAX_DEPTH`. */
  readonly maxDepth?: number;
  /** Most characters of inline text, brackets included. Default `JSON_INLINE_MAX_LENGTH`. */
  readonly maxLength?: number;
}

export const JSON_INLINE_MAX_DEPTH = 3;
export const JSON_INLINE_MAX_LENGTH = 40;

/**
 * The one-line form of a small object or array, or undefined when it should stay expandable.
 *
 * A value is small when it has exactly one entry and that entry is a primitive or is itself
 * small, as in `{ SUBMIT: "review" }`, `{ on: { SUBMIT: "review" } }`, `["a"]` or
 * `[{ id: 1 }]`. Empty values, values with two or more entries, cycles, and values deeper
 * than `maxDepth` or longer than `maxLength` characters are not small.
 */
export function inlineJson(value: unknown, limits: JsonInlineLimits = {}): JsonInline | undefined {
  const maxDepth = limits.maxDepth ?? JSON_INLINE_MAX_DEPTH;
  const maxLength = limits.maxLength ?? JSON_INLINE_MAX_LENGTH;
  if (value === null || typeof value !== "object") return undefined;
  const wrappers: { array: boolean; key: string }[] = [];
  const seen = new Set<object>();
  let current: unknown = value;
  while (current !== null && typeof current === "object") {
    if (seen.has(current) || wrappers.length >= maxDepth) return undefined;
    seen.add(current);
    const entries = Object.entries(current);
    if (entries.length !== 1) return undefined;
    const [key, entry] = entries[0]!;
    wrappers.push({ array: Array.isArray(current), key });
    current = entry;
  }
  const leaf = jsonLeaf(current)!;
  const open: JsonInlinePart[] = [];
  const close: JsonInlinePart[] = [];
  for (const { array, key } of wrappers) {
    if (array) {
      open.push({ part: "bracket", text: "[" });
      close.unshift({ part: "bracket", text: "]" });
    } else {
      open.push(
        { part: "bracket", text: "{" },
        { part: "space", text: " " },
        { part: "key", text: key },
        { part: "colon", text: ":" },
        { part: "space", text: " " },
      );
      close.unshift({ part: "space", text: " " }, { part: "bracket", text: "}" });
    }
  }
  const parts = [...open, { part: "value" as const, ...leaf }, ...close];
  const text = parts.map((part) => part.text).join("");
  if (text.length > maxLength) return undefined;
  return { kind: wrappers[0]!.array ? "array" : "object", parts, text, depth: wrappers.length };
}
