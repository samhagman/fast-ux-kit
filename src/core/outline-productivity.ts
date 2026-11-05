import {
  applyOutlineCommand,
  type OutlineNode,
  type OutlineCommandFailure,
  validateOutline,
  InvalidOutlineError,
} from "./index.js";
import { findOutlineNode } from "./tree.js";
import { recognizeTextReferences } from "./text-intelligence.js";
import {
  reduceOutlineEditor,
  type OutlineAction,
  type OutlineEditorOptions,
  type OutlineEditorState,
} from "./editor.js";

export interface OutlineDateRange {
  readonly start: number;
  readonly end?: number;
}
export interface OutlineItemDetails {
  readonly note?: string;
  readonly heading?: 1 | 2 | 3;
  readonly color?: string;
  readonly completed?: boolean;
  readonly checkbox?: boolean;
  readonly numbered?: boolean;
  readonly dates?: readonly OutlineDateRange[];
  readonly createdAt?: number;
  readonly editedAt?: number;
}
/** The host getter is trusted application code; its exceptions propagate to the caller. */
export type OutlineDetailsGetter<T = unknown> = (
  node: OutlineNode<T>,
) => OutlineItemDetails | undefined;

function ownData(value: unknown, key: PropertyKey): unknown {
  if (value === null || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}
/** Metadata date arrays larger than this fail explicitly rather than silently truncating. */
export const OUTLINE_DETAIL_DATE_LIMIT = 10_000;

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * Default details live directly in node.data. Only own data properties are read, so raw
 * metadata accessors are never called. Invalid fields are omitted; valid fields are copied.
 * Supplying a getter replaces that default source, not the checked/checkbox fallbacks.
 * Date arrays above OUTLINE_DETAIL_DATE_LIMIT (including sparse arrays) throw RangeError.
 */
export function getOutlineItemDetails<T>(
  node: OutlineNode<T>,
  getDetails?: OutlineDetailsGetter<T>,
): OutlineItemDetails {
  const source: unknown = getDetails ? getDetails(node) : ownData(node, "data");
  const checked = ownData(node, "checked");
  const result: {
    note?: string;
    heading?: 1 | 2 | 3;
    color?: string;
    completed: boolean;
    checkbox: boolean;
    numbered?: boolean;
    dates?: OutlineDateRange[];
    createdAt?: number;
    editedAt?: number;
  } = { completed: checked === true, checkbox: checked !== undefined };
  for (const key of ["note", "color"] as const) {
    const value = ownData(source, key);
    if (typeof value === "string") result[key] = value;
  }
  const heading = ownData(source, "heading");
  if (heading === 1 || heading === 2 || heading === 3) result.heading = heading;
  for (const key of ["completed", "checkbox", "numbered"] as const) {
    const value = ownData(source, key);
    if (typeof value === "boolean") result[key] = value;
  }
  for (const key of ["createdAt", "editedAt"] as const) {
    const value = ownData(source, key);
    if (finite(value)) result[key] = value;
  }
  const dates = ownData(source, "dates");
  if (Array.isArray(dates)) {
    result.dates = [];
    const length = ownData(dates, "length") as number;
    if (length > OUTLINE_DETAIL_DATE_LIMIT)
      throw new RangeError("Outline details contain too many date entries.");
    for (let index = 0; index < length; index++) {
      const date = ownData(dates, String(index));
      const start = ownData(date, "start"),
        end = ownData(date, "end");
      if (finite(start) && (end === undefined || (finite(end) && end >= start)))
        result.dates.push({ start, ...(end === undefined ? {} : { end: end as number }) });
    }
  }
  return result;
}

export interface OutlineTag {
  /** Trigger plus NFKC-normalized, locale-independent lower-case spelling. */
  readonly key: string;
  readonly trigger: string;
  /** First encountered original spelling, excluding the trigger. */
  readonly spelling: string;
  readonly count: number;
  readonly nodeIds: readonly string[];
}
/**
 * Pre-order inventory includes folded/completed branches and title/note occurrences.
 * Invalid input trees throw InvalidOutlineError before traversal.
 */
export function outlineTagInventory<T>(
  nodes: readonly OutlineNode<T>[],
  options: {
    readonly getDetails?: OutlineDetailsGetter<T>;
    readonly triggers?: readonly string[];
  } = {},
): readonly OutlineTag[] {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  const tags = new Map<
    string,
    {
      key: string;
      trigger: string;
      spelling: string;
      count: number;
      nodeIds: Set<string>;
    }
  >();
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    const details = getOutlineItemDetails(node, options.getDetails);
    for (const text of [node.text, details.note ?? ""]) {
      for (const reference of recognizeTextReferences(text, {
        triggers: options.triggers ?? ["#"],
      })) {
        const key = reference.trigger + reference.spelling.normalize("NFKC").toLowerCase();
        let tag = tags.get(key);
        if (!tag) {
          tag = {
            key,
            trigger: reference.trigger,
            spelling: reference.spelling,
            count: 0,
            nodeIds: new Set(),
          };
          tags.set(key, tag);
        }
        tag.count++;
        tag.nodeIds.add(node.id);
      }
    }
    for (let index = (node.children?.length ?? 0) - 1; index >= 0; index--)
      pending.push(node.children![index]!);
  }
  return [...tags.values()].map((tag) => ({ ...tag, nodeIds: [...tag.nodeIds] }));
}

export type OutlineNoteMode = "show" | "first-line" | "hide";
export interface OutlineProjectionRow<T = unknown> {
  readonly id: string;
  /** Always the canonical node, never a pruned/edited copy. */
  readonly node: OutlineNode<T>;
  readonly parentId: string | null;
  readonly depth: number;
  readonly details: OutlineItemDetails;
  readonly noteVisible: boolean;
  /** Display text only; details.note retains the full copied note in every mode. */
  readonly noteText: string;
}
/**
 * Reader-only flat projection: a completed row hides its entire branch. Filtering never
 * creates a replacement document; edit commands must target the original canonical tree.
 * Missing expandedIds means every branch is expanded. Note presentation never controls
 * branch expansion; a host can reveal details.note independently of first-line mode.
 * Invalid input trees throw InvalidOutlineError before traversal.
 */
export function projectOutline<T>(
  nodes: readonly OutlineNode<T>[],
  options: {
    readonly getDetails?: OutlineDetailsGetter<T>;
    readonly hideCompleted?: boolean;
    readonly expandedIds?: ReadonlySet<string>;
    readonly noteMode?: OutlineNoteMode;
  } = {},
): readonly OutlineProjectionRow<T>[] {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  const rows: OutlineProjectionRow<T>[] = [];
  const pending = nodes
    .map((node) => ({ node, parentId: null as string | null, depth: 0 }))
    .reverse();
  while (pending.length) {
    const frame = pending.pop()!;
    const details = getOutlineItemDetails(frame.node, options.getDetails);
    if (options.hideCompleted && details.completed) continue;
    const mode = options.noteMode ?? "show";
    const note = details.note ?? "";
    const noteText =
      mode === "hide"
        ? ""
        : mode === "first-line"
          ? note.split(/\r\n|[\r\n\u2028\u2029]/u, 1)[0]!
          : note;
    rows.push({
      ...frame,
      id: frame.node.id,
      details,
      noteVisible: mode !== "hide" && !!note,
      noteText,
    });
    if (options.expandedIds && !options.expandedIds.has(frame.node.id)) continue;
    for (let index = (frame.node.children?.length ?? 0) - 1; index >= 0; index--)
      pending.push({
        node: frame.node.children![index]!,
        parentId: frame.node.id,
        depth: frame.depth + 1,
      });
  }
  return rows;
}

export type OutlineSortKey = "title" | "completion" | "created" | "edited" | "date" | "reverse";
export interface OutlineSortRequest {
  /** null sorts roots; otherwise sort this node's immediate children only. */
  readonly parentId: string | null;
  /** Omitted means all immediate siblings. Selected siblings retain their original slots. */
  readonly ids?: readonly string[];
  readonly by: OutlineSortKey;
  readonly direction?: "ascending" | "descending";
}
export type OutlineSortPlan<T = unknown> =
  | {
      readonly ok: true;
      readonly nodes: readonly OutlineNode<T>[];
      readonly action: Extract<OutlineAction<T>, { readonly type: "transaction" }>;
    }
  | {
      readonly ok: false;
      readonly nodes: readonly OutlineNode<T>[];
      readonly reason: OutlineCommandFailure;
    };

/**
 * Pure preview, NOT edit authorization. Apply the action through reduceOutlineEditor, or
 * use applyOutlineSort. The reorder command checks every changed-index sibling's entire
 * subtree, so displaced locked siblings/descendants cannot slip past a source-only move.
 * Titles use NFKC lower-case code-unit order; ties retain document order. Missing numeric
 * values sort last in either direction. Date order uses the earliest valid range start.
 * Reverse ignores direction and reverses only requested slots. Prior roots remain untouched.
 */
export function planOutlineSort<T>(
  nodes: readonly OutlineNode<T>[],
  request: OutlineSortRequest,
  getDetails?: OutlineDetailsGetter<T>,
): OutlineSortPlan<T> {
  const fail = (reason: OutlineCommandFailure): OutlineSortPlan<T> => ({
    ok: false,
    nodes,
    reason,
  });
  if (validateOutline(nodes).length) return fail("invalid-outline");
  const fields: Record<string, unknown> = {};
  // A mutation request is stricter than optional presentation metadata: an
  // unreadable selection must never silently become a request to sort all rows.
  try {
    if (request === null || typeof request !== "object" || Array.isArray(request))
      return fail("invalid-command");
    for (const key of ["parentId", "by", "direction", "ids"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(request, key);
      if (!descriptor) {
        if (Reflect.has(request, key)) return fail("invalid-command");
      } else {
        if (!("value" in descriptor)) return fail("invalid-command");
        fields[key] = descriptor.value;
      }
    }
  } catch {
    return fail("invalid-command");
  }
  const { parentId, by, direction, ids: requestedIds } = fields;
  let selectedLength: number | undefined;
  try {
    if (requestedIds !== undefined) {
      if (!Array.isArray(requestedIds)) return fail("invalid-command");
      const descriptor = Object.getOwnPropertyDescriptor(requestedIds, "length");
      if (
        !descriptor ||
        !("value" in descriptor) ||
        !Number.isSafeInteger(descriptor.value) ||
        descriptor.value < 0
      )
        return fail("invalid-command");
      selectedLength = descriptor.value;
    }
  } catch {
    return fail("invalid-command");
  }
  if (
    (parentId !== null && typeof parentId !== "string") ||
    !["title", "completion", "created", "edited", "date", "reverse"].includes(by as string) ||
    (direction !== undefined && direction !== "ascending" && direction !== "descending")
  )
    return fail("invalid-command");
  const parent = parentId === null ? undefined : findOutlineNode(nodes, parentId as string);
  if (parentId !== null && !parent) return fail("not-found");
  const siblings = parent ? (parent.node.children ?? []) : nodes;
  const siblingIds = new Set(siblings.map((node) => node.id));
  const selected = new Set<string>();
  if (selectedLength !== undefined) {
    const length = selectedLength;
    if (length > siblings.length) return fail("invalid-command");
    for (let index = 0; index < length; index++) {
      const id = ownData(requestedIds, String(index));
      if (typeof id !== "string" || selected.has(id)) return fail("invalid-command");
      // Valid selections need only O(1) sibling membership, not a full-tree scan
      // per selected row. Resolve a non-sibling only to report the failure kind.
      if (!siblingIds.has(id))
        return fail(findOutlineNode(nodes, id) ? "invalid-command" : "not-found");
      selected.add(id);
    }
  } else for (const node of siblings) selected.add(node.id);
  const chosen = siblings.filter((node) => selected.has(node.id));
  let sorted: readonly OutlineNode<T>[];
  if (by === "reverse") sorted = [...chosen].reverse();
  else {
    const keys = chosen.map((node, index) => {
      const details = getOutlineItemDetails(node, getDetails);
      let key: string | number | undefined;
      switch (by) {
        case "title":
          key = node.text.normalize("NFKC").toLowerCase();
          break;
        case "completion":
          key = details.completed ? 1 : 0;
          break;
        case "created":
          key = details.createdAt;
          break;
        case "edited":
          key = details.editedAt;
          break;
        case "date": {
          let earliest: number | undefined;
          for (const date of details.dates ?? [])
            if (earliest === undefined || date.start < earliest) earliest = date.start;
          key = earliest;
          break;
        }
      }
      return { node, index, key };
    });
    const sign = direction === "descending" ? -1 : 1;
    keys.sort((left, right) => {
      if (left.key === undefined) return right.key === undefined ? left.index - right.index : 1;
      if (right.key === undefined) return -1;
      const order = left.key < right.key ? -1 : left.key > right.key ? 1 : 0;
      return order ? order * sign : left.index - right.index;
    });
    sorted = keys.map(({ node }) => node);
  }
  let next = 0;
  const ids = siblings.map((node) => (selected.has(node.id) ? sorted[next++]!.id : node.id));
  const command = { type: "reorder" as const, parentId: parentId as string | null, ids };
  const preview = applyOutlineCommand(nodes, command, { readOnly: false });
  if (!preview.ok) return fail(preview.reason);
  return { ok: true, nodes: preview.nodes, action: { type: "transaction", commands: [command] } };
}

/** Atomic editor integration: normal read-only, lock, canChange, history and caret rules apply. */
export function applyOutlineSort<T>(
  state: OutlineEditorState<T>,
  request: OutlineSortRequest,
  options: OutlineEditorOptions<T> = {},
  getDetails?: OutlineDetailsGetter<T>,
): OutlineEditorState<T> {
  const plan = planOutlineSort(state.nodes, request, getDetails);
  if (!plan.ok) return { ...state, refusal: plan.reason };
  return reduceOutlineEditor(state, plan.action, options);
}
