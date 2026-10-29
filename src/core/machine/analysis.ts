import type { MachineDocument, MachineInspectionFrame } from "./types.js";

export interface MachineSearchMatch {
  readonly machineId: string;
  readonly elementId: string;
  readonly kind: "node" | "transition";
  readonly label: string;
}
export interface MachineSearchOptions {
  readonly maxResults?: number;
}
function limit(value: number | undefined, fallback: number, ceiling: number): number {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(0, Math.min(ceiling, Math.floor(value)));
}
/** Searches original elements in document order, including every referenced graph.
 * Transitions have events, not labels; their display label falls back to their ID.
 * The returned list is capped (default 100, hard maximum 1,000). A miss scans
 * the entire typed document; the cap bounds results, not input or scan time.
 */
export function searchMachineDocument(
  document: MachineDocument,
  query: string,
  options: MachineSearchOptions = {},
): readonly MachineSearchMatch[] {
  const needle = query.trim().toLowerCase();
  const maximum = limit(options.maxResults, 100, 1000);
  if (!needle || maximum === 0) return [];
  const matches: MachineSearchMatch[] = [];
  const includes = (values: readonly (string | undefined)[]) =>
    values.some((value) => value?.toLowerCase().includes(needle));
  for (const machine of document.machines) {
    for (const node of machine.nodes) {
      if (
        includes([
          node.id,
          node.label,
          node.description,
          ...(node.entry ?? []),
          ...(node.exit ?? []),
          ...(node.tags ?? []),
        ])
      ) {
        matches.push({
          machineId: machine.id,
          elementId: node.id,
          kind: "node",
          label: node.label,
        });
        if (matches.length === maximum) return matches;
      }
    }
    for (const transition of machine.transitions) {
      if (
        includes([
          transition.id,
          transition.event,
          transition.description,
          transition.guard,
          ...(transition.actions ?? []),
        ])
      ) {
        matches.push({
          machineId: machine.id,
          elementId: transition.id,
          kind: "transition",
          label: transition.event || transition.id,
        });
        if (matches.length === maximum) return matches;
      }
    }
  }
  return matches;
}

export type MachineContextContinuity = "unknown" | "contiguous" | "gap";
export interface MachineContextDiffOptions {
  readonly continuity?: MachineContextContinuity;
  readonly maxDepth?: number;
  /** Total inspected values across both contexts. */
  readonly maxItems?: number;
  readonly maxEntries?: number;
  /** Total characters in entry paths and before/after previews. */
  readonly maxOutputLength?: number;
}
export interface MachineContextDiffEntry {
  /** RFC 6901 JSON Pointer; the empty string denotes the context root. */
  readonly path: string;
  readonly kind: "added" | "removed" | "changed" | "unsupported";
  readonly before: string;
  readonly after: string;
}
export interface MachineContextDiff {
  readonly status: "available" | "unavailable";
  readonly entries: readonly MachineContextDiffEntry[];
  readonly truncated: boolean;
  readonly warnings: readonly string[];
  readonly continuity: MachineContextContinuity;
}
type Tree =
  | { kind: "scalar"; value: null | boolean | number | string }
  | { kind: "object" | "array"; children: Map<string, Tree> }
  | { kind: "unsupported" | "truncated" };
const unsupported: Tree = { kind: "unsupported" };
const truncatedTree: Tree = { kind: "truncated" };
/** Reads data descriptors only. Accessors are never invoked. Proxies are not a
 * supported transport: reflective operations may trigger their traps; errors are
 * caught, but callers must supply ordinary data rather than executable proxies.
 */
function ownValue(object: object, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(object, key);
  return descriptor && "value" in descriptor ? descriptor.value : undefined;
}

/** Compares two supplied snapshots, not events or runtime causality. Only finite
 * JSON primitives, ordinary arrays and plain records are supported. Missing
 * context is unavailable; null is a value. Traversal, entries and output are
 * capped independently. JavaScript own-key enumeration still allocates the
 * complete key list; these are comparison/output limits, not a sandbox against
 * arbitrary executable objects or an input-memory limit. Uninspected or
 * unsupported data never counts as equal.
 */
export function compareMachineInspectionContexts(
  beforeFrame?: MachineInspectionFrame,
  afterFrame?: MachineInspectionFrame,
  options: MachineContextDiffOptions = {},
): MachineContextDiff {
  const warnings = new Set<string>();
  const entries: MachineContextDiffEntry[] = [];
  let truncated = false;
  let continuity: MachineContextContinuity = "unknown";
  const result = (status: MachineContextDiff["status"]): MachineContextDiff => ({
    status,
    entries,
    truncated,
    warnings: [...warnings],
    continuity,
  });
  let beforeContext: unknown;
  let afterContext: unknown;
  try {
    if (!beforeFrame || !afterFrame) {
      warnings.add("Two frames are required to compare context.");
      return result("unavailable");
    }
    const actor = ownValue(beforeFrame, "actorId");
    const machine = ownValue(beforeFrame, "machineId");
    if (
      typeof actor !== "string" ||
      typeof machine !== "string" ||
      actor !== ownValue(afterFrame, "actorId") ||
      machine !== ownValue(afterFrame, "machineId")
    ) {
      warnings.add("Frames must belong to the same actor and machine.");
      return result("unavailable");
    }
    const a = ownValue(beforeFrame, "sequence");
    const b = ownValue(afterFrame, "sequence");
    const sequenced =
      typeof a === "number" &&
      typeof b === "number" &&
      Number.isSafeInteger(a) &&
      Number.isSafeInteger(b) &&
      a >= 0 &&
      b >= 0;
    if (options.continuity === "gap" || (sequenced && b !== a + 1)) continuity = "gap";
    else if (options.continuity === "contiguous" && sequenced && b === a + 1)
      continuity = "contiguous";
    if (continuity !== "contiguous")
      warnings.add(
        continuity === "gap"
          ? "Source sequences are nonconsecutive, out of order, or the session reports a gap; intervening observations or missing data may exist."
          : "Continuity is unknown; arrival order does not prove adjacent snapshots.",
      );
    beforeContext = ownValue(beforeFrame, "context");
    afterContext = ownValue(afterFrame, "context");
    if (beforeContext === undefined || afterContext === undefined) {
      warnings.add("Context is missing or inaccessible in one or both frames.");
      return result("unavailable");
    }
  } catch {
    warnings.add("Frame properties could not be safely inspected.");
    return result("unavailable");
  }
  const maxDepth = limit(options.maxDepth, 8, 32);
  const maxItems = limit(options.maxItems, 2000, 10000);
  const maxEntries = limit(options.maxEntries, 100, 1000);
  const maxOutput = limit(options.maxOutputLength, 16000, 100000);
  let inspected = 0;
  const markTruncated = (): Tree => {
    truncated = true;
    warnings.add("Comparison limits reached; uninspected data may differ.");
    return truncatedTree;
  };
  const markUnsupported = (): Tree => {
    warnings.add(
      "Unsupported values or accessors were not evaluated; equality is unknown for those paths.",
    );
    return unsupported;
  };
  const ancestors = new Set<object>();
  const inspect = (value: unknown, depth: number): Tree => {
    if (inspected >= maxItems) return markTruncated();
    inspected++;
    if (value === null || typeof value === "boolean") return { kind: "scalar", value };
    if (typeof value === "string") {
      // Do not retain arbitrarily large strings or claim their equality.
      if (value.length > maxOutput) return markTruncated();
      return { kind: "scalar", value };
    }
    if (typeof value === "number" && Number.isFinite(value)) return { kind: "scalar", value };
    if (typeof value !== "object") return markUnsupported();
    if (ancestors.has(value)) return markUnsupported();
    if (depth >= maxDepth) return markTruncated();
    ancestors.add(value);
    try {
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (!array && prototype !== Object.prototype && prototype !== null) return markUnsupported();
      const children = new Map<string, Tree>();
      // Reflecting own keys does not evaluate getters. Key enumeration itself is
      // provided by JavaScript; only the bounded prefix is subsequently inspected.
      const keys = Reflect.ownKeys(value);
      for (const key of keys) {
        if (typeof key === "symbol") {
          inspected++;
          return markUnsupported();
        }
        if (array && key === "length") continue;
        if (inspected >= maxItems || key.length > maxOutput) {
          markTruncated();
          return truncatedTree;
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, key);
        if (
          !descriptor ||
          !("value" in descriptor) ||
          !descriptor.enumerable ||
          (array && !/^(0|[1-9]\d*)$/.test(key))
        ) {
          inspected++;
          children.set(key, markUnsupported());
        } else children.set(key, inspect(descriptor.value, depth + 1));
      }
      if (array && children.size !== ownValue(value, "length")) return markUnsupported();
      return { kind: array ? "array" : "object", children };
    } catch {
      return markUnsupported();
    } finally {
      ancestors.delete(value);
    }
  };
  const before = inspect(beforeContext, 0);
  const after = inspect(afterContext, 0);
  const preview = (tree?: Tree): string => {
    if (!tree) return "[absent]";
    if (tree.kind === "scalar") return JSON.stringify(tree.value);
    if (tree.kind === "object" || tree.kind === "array")
      return `[${tree.kind}: ${tree.children.size} entries]`;
    return `[${tree.kind}]`;
  };
  let outputLength = 0;
  const add = (path: string, kind: MachineContextDiffEntry["kind"], a?: Tree, b?: Tree) => {
    if (entries.length >= maxEntries || outputLength >= maxOutput) {
      markTruncated();
      return;
    }
    const left = preview(a);
    const right = preview(b);
    const length = path.length + left.length + right.length;
    if (entries.length >= maxEntries || outputLength + length > maxOutput) {
      markTruncated();
      return;
    }
    entries.push({ path, kind, before: left, after: right });
    outputLength += length;
  };
  const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
  const compare = (a: Tree | undefined, b: Tree | undefined, path: string): void => {
    if (a?.kind === "truncated" || b?.kind === "truncated") return;
    if (a?.kind === "unsupported" || b?.kind === "unsupported") {
      add(path, "unsupported", a, b);
      return;
    }
    if (!a || !b) {
      add(path, a ? "removed" : "added", a, b);
      return;
    }
    if (a.kind !== b.kind) {
      add(path, "changed", a, b);
      return;
    }
    if (a.kind === "scalar" && b.kind === "scalar") {
      if (a.value !== b.value) add(path, "changed", a, b);
      return;
    }
    if (
      (a.kind === "object" || a.kind === "array") &&
      (b.kind === "object" || b.kind === "array")
    ) {
      for (const [key, child] of a.children)
        compare(child, b.children.get(key), `${path}/${pointer(key)}`);
      for (const [key, child] of b.children)
        if (!a.children.has(key)) compare(undefined, child, `${path}/${pointer(key)}`);
    }
  };
  compare(before, after, "");
  return result("available");
}
