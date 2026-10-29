import { InvalidOutlineError, validateOutline, type OutlineNode } from "./index.js";

export interface OutlineParseOptions {
  readonly createId?: () => string;
  readonly spacesPerLevel?: number;
}
let sequence = 0;
/** Browser/SSR-safe default. Consumers syncing documents may inject their own persistent ID allocator. */
export function createOutlineId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `outline-${Date.now().toString(36)}-${(++sequence).toString(36)}`
  );
}

/** A deliberately small outline text format, not a general Markdown or HTML importer. */
export function parseOutlineText(
  text: string,
  { createId = createOutlineId, spacesPerLevel = 2 }: OutlineParseOptions = {},
): readonly OutlineNode[] {
  if (typeof text !== "string") throw new TypeError("Outline text must be a string.");
  if (!Number.isInteger(spacesPerLevel) || spacesPerLevel < 1)
    throw new RangeError("spacesPerLevel must be a positive integer.");
  type Mutable = { id: string; text: string; checked?: boolean; children: Mutable[] };
  const roots: Mutable[] = [];
  const parents: Mutable[] = [];
  const indents: number[] = [];
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (!raw.trim()) continue;
    const prefix = raw.match(/^[\t ]*/)?.[0] ?? "";
    const width = [...prefix].reduce(
      (total, char) =>
        char === "\t" ? total + spacesPerLevel - (total % spacesPerLevel) : total + 1,
      0,
    );
    while (indents.length && indents[indents.length - 1]! >= width) {
      indents.pop();
      parents.pop();
    }
    const depth = parents.length;
    let value = raw
      .slice(prefix.length)
      .replace(/^(?:[-*+]|\d+[.)])(?:[ \t]+|$)/, "")
      .trim();
    const task = value.match(/^\[([ xX])\](?:[ \t]+|$)/);
    if (task) value = value.slice(task[0].length);
    const node: Mutable = {
      id: createId(),
      text: value,
      children: [],
      ...(task ? { checked: task[1]!.toLowerCase() === "x" } : {}),
    };
    if (depth === 0) roots.push(node);
    else parents[depth - 1]!.children.push(node);
    parents.length = depth;
    parents.push(node);
    indents.push(width);
  }
  const issues = validateOutline(roots);
  if (issues.length) throw new InvalidOutlineError(issues);
  return roots;
}

export interface OutlineSerializeOptions {
  readonly format?: "markdown" | "tabs";
  readonly spacesPerLevel?: number;
}
/** Readable export is lossy (IDs/metadata are omitted). Use JSON for canonical persistence. */
export function serializeOutlineText<T>(
  nodes: readonly OutlineNode<T>[],
  { format = "markdown", spacesPerLevel = 2 }: OutlineSerializeOptions = {},
): string {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  if (!Number.isInteger(spacesPerLevel) || spacesPerLevel < 1)
    throw new RangeError("spacesPerLevel must be a positive integer.");
  const lines: string[] = [];
  const pending = nodes.map((node) => ({ node, depth: 0 })).reverse();
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    const indent = format === "tabs" ? "\t".repeat(depth) : " ".repeat(depth * spacesPerLevel);
    const bullet = format === "markdown" ? "- " : "";
    const check = node.checked === undefined ? "" : node.checked ? "[x] " : "[ ] ";
    // Continuation lines belong to the same item in canonical JSON; this text export
    // intentionally represents them as indented readable continuations.
    lines.push(`${indent}${bullet}${check}${node.text.replace(/\n/g, `\n${indent}  `)}`);
    for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--)
      pending.push({ node: node.children![i]!, depth: depth + 1 });
  }
  return lines.join("\n");
}

export interface OutlineDocument<T = unknown> {
  readonly version: 1;
  readonly nodes: readonly OutlineNode<T>[];
}
export function exportOutlineJSON<T>(nodes: readonly OutlineNode<T>[]): string {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  // Optional node fields may be omitted; nested metadata must round-trip exactly.
  const nodeObjects = new WeakSet<object>(outlineNodes(nodes));
  const active = new Set<object>();
  const pending: { value: unknown; depth: number; exit?: boolean }[] = [
    { value: { version: 1, nodes }, depth: 0 },
  ];
  let count = 0;
  while (pending.length) {
    const frame = pending.pop()!;
    const value = frame.value;
    if (frame.exit) {
      active.delete(value as object);
      continue;
    }
    if (++count > 100_000 || frame.depth > 256)
      throw new TypeError("Outline JSON exceeds its validation budget.");
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number" && Number.isFinite(value) && !Object.is(value, -0)) continue;
    if (typeof value !== "object" || value === null)
      throw new TypeError("Outline metadata must contain JSON values only.");
    if (active.has(value)) throw new TypeError("Outline JSON cannot contain cycles.");
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new TypeError("Outline JSON must contain plain objects.");
    const keys = Reflect.ownKeys(value);
    if (Array.isArray(value) && keys.length !== value.length + 1)
      throw new TypeError("Outline JSON arrays must be dense and have no extra properties.");
    active.add(value);
    pending.push({ ...frame, exit: true });
    for (const key of keys) {
      if (Array.isArray(value) && key === "length") continue;
      if (typeof key !== "string") throw new TypeError("Outline JSON cannot contain symbol keys.");
      if (Array.isArray(value) && (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))
        throw new TypeError("Outline JSON arrays must contain only indexed values.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!descriptor.enumerable || !("value" in descriptor))
        throw new TypeError("Outline JSON cannot contain accessors or hidden properties.");
      if (
        descriptor.value === undefined &&
        nodeObjects.has(value) &&
        ["children", "data", "checked"].includes(key)
      )
        continue;
      pending.push({ value: descriptor.value, depth: frame.depth + 1 });
    }
  }
  const json = JSON.stringify({ version: 1, nodes } satisfies OutlineDocument<T>, null, 2);
  if (json.length > 8_000_000) throw new TypeError("Outline JSON exceeds the output budget.");
  return json;
}

/** JSON data remains inert; host renderers are responsible for validating their own block schemas. */
export function importOutlineJSON<T = unknown>(json: string): OutlineDocument<T> {
  if (typeof json !== "string" || json.length > 8_000_000)
    throw new TypeError("Outline JSON exceeds the input budget.");
  const value: unknown = JSON.parse(json);
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const frame = pending.pop()!;
    if (++count > 100_000 || frame.depth > 256)
      throw new TypeError("Outline JSON exceeds its validation budget.");
    if (
      typeof frame.value === "number" &&
      (!Number.isFinite(frame.value) || Object.is(frame.value, -0))
    )
      throw new TypeError("Outline JSON numbers must round-trip exactly.");
    if (frame.value !== null && typeof frame.value === "object")
      for (const item of Object.values(frame.value))
        pending.push({ value: item, depth: frame.depth + 1 });
  }
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1)
    throw new TypeError("Unsupported outline document version.");
  const nodes = (value as { nodes?: unknown }).nodes as readonly OutlineNode<T>[];
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  return { version: 1, nodes };
}

function* outlineNodes<T>(nodes: readonly OutlineNode<T>[]): Generator<OutlineNode<T>> {
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    yield node;
    pending.push(...(node.children ?? []));
  }
}

/** A trusted host codec may use any textual format; decoded trees always cross model validation. */
export interface OutlineCodec<T = unknown> {
  readonly id: string;
  readonly mimeType: string;
  readonly encode: (nodes: readonly OutlineNode<T>[]) => string;
  readonly decode: (source: string) => readonly OutlineNode<T>[];
}
export function encodeOutline<T>(nodes: readonly OutlineNode<T>[], codec: OutlineCodec<T>): string {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  const source = codec.encode(nodes);
  if (typeof source !== "string") throw new TypeError("Outline codec must encode a string.");
  return source;
}
export function decodeOutline<T>(
  source: string,
  codec: OutlineCodec<T>,
): readonly OutlineNode<T>[] {
  if (typeof source !== "string") throw new TypeError("Outline codec source must be a string.");
  const nodes = codec.decode(source);
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  return nodes;
}
export function createOutlineJSONCodec<T = unknown>(): OutlineCodec<T> {
  return {
    id: "outline-json-v1",
    mimeType: "application/x-fast-ux-outline+json",
    encode: exportOutlineJSON,
    decode: (source) => importOutlineJSON<T>(source).nodes,
  };
}
