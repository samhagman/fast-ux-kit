import type { OutlineCollaboration, OutlineFieldEvent } from "./collaboration.js";
import * as React from "react";
import {
  createOutlineEditorState,
  createOutlineId,
  findOutlineNode,
  getOutlineItemDetails,
  getOutlinePath,
  importOutlineJSON,
  outlineTagInventory,
  planOutlineSort,
  selectionRoots,
  type OutlineAction,
  type OutlineCommand,
  type OutlineEditorOptions,
  type OutlineItemDetails,
  type OutlineSearchResult,
  type OutlineSortKey,
  type OutlineTag,
} from "../core/index.js";
import {
  NO_BOOKMARKS,
  type OutlineBookmarks,
  type OutlineExternalLinks,
  type OutlineItemView,
  type OutlineColor,
  type OutlineExportFormat,
  type OutlineItem,
  type OutlineItemData,
  type OutlineNoteDisplay,
} from "./types.js";
import {
  exportOutline,
  exportOutlineHtml,
  idsInPasteOrder,
  importOutline,
  importOutlineHtml,
  linkMarkup,
  looksLikeOutlineJSON,
  reidentify,
} from "./interchange.js";
import {
  agendaDay,
  dayNumber,
  outgoingLinks,
  outlinerDetails,
  searchOutliner,
  searchSuggestions,
} from "./search-filters.js";
import {
  canonicalId,
  createMirror,
  hasMirrors,
  mirrorOf,
  mirrorsOfSource,
  syncMirrors,
} from "./mirrors.js";
import {
  initOutlineState,
  latestEditor,
  reconcileOutline,
  rejectOutlineProposal,
  stepOutline,
  type ControlledOutlineState,
  type OutlineChangeMeta,
  type OutlineAfterEdit,
  type OutlineEditor,
} from "./controlled-outline.js";
import {
  formatDateToken,
  inlineToPlain,
  nextOccurrence,
  parseInline,
  repeatFor,
  type DateRepeat,
  type InlineDate,
} from "./inline.js";
import { sortResults, type ResultSort } from "./result-sort.js";
import {
  createdRoots,
  lingerPaths,
  lingerSession,
  navRows,
  neighbourOf,
  nextLinger,
  NO_LINGER,
  targetIdsOf,
  type LingerState,
  type SelectPolicy,
  type TargetRows,
  type ViewNav,
} from "./target.js";

/**
 * The outliner controller. It owns exactly two kinds of state:
 *   1. the portable core editor state (document, caret, selection, folds, hoist, history)
 *   2. reader view state (search, hide-completed, note display)
 * Everything visible is derived from those in `rows`. Document changes flow out through
 * onValueChange.
 */
export interface OutlineValueChangeEvent extends OutlineChangeMeta {
  /** Veto this change (controlled only); callable now or later, e.g. when the server says no. */
  readonly reject: () => void;
}
/** Return `false` to veto (controlled only). Uncontrolled hosts are only notified. */
export type OutlineValueChangeHandler = (
  nodes: readonly OutlineItem[],
  meta: OutlineValueChangeEvent,
) => boolean | void;

export interface UseOutlinerOptions {
  /**
   * Controlled document: the outliner renders this value. Each edit, undo and redo is proposed
   * through `onValueChange`; pass the proposed nodes back to accept (any number of renders
   * later), or return `false` / call `meta.reject()` to veto. See `controlled-outline.ts`.
   */
  readonly value?: readonly OutlineItem[];
  /** Uncontrolled: the initial document. The outliner owns it and its undo history. */
  readonly defaultValue?: readonly OutlineItem[];
  readonly onValueChange?: OutlineValueChangeHandler;
  /** Controlled collaboration: remote values bypass snapshot history; host owns undo and cursors. */
  readonly collaboration?: OutlineCollaboration;
  readonly readOnly?: boolean;
  readonly isLocked?: (node: OutlineItem) => boolean;
  readonly defaultExpandedIds?: Iterable<string>;
  /**
   * Controlled only: show the newest pending proposal while the host has not answered yet (an
   * async store round trip), so typing never snaps back. A veto rolls it back. Default true;
   * false renders strictly what the host has echoed (React's controlled-input rule).
   */
  readonly optimistic?: boolean;
  /** Starred items and saved searches (controlled). Pair with onBookmarksChange. */
  readonly bookmarks?: OutlineBookmarks;
  /** Initial bookmarks when uncontrolled. */
  readonly defaultBookmarks?: OutlineBookmarks;
  readonly onBookmarksChange?: (bookmarks: OutlineBookmarks) => void;
  /**
   * History-lite (default true): edits stamp `data.editedAt` (and new items `createdAt`), so
   * `changed:today` / `edited:week` search and the "edited" sort work. False leaves data alone.
   */
  readonly trackEdits?: boolean;
  /**
   * Links that leave this document (`[[label|doc/item]]`) and backlinks from other documents,
   * supplied by a multi-document host (OutlinerWorkspace). Without it, such links read as missing.
   */
  readonly externalLinks?: OutlineExternalLinks;
  /**
   * Told after every undo and redo that moved through history: `from` is the entry travelled
   * over, `to` the entry that now stands for it on the other stack. A host that joins steps
   * across documents (OutlinerWorkspace's moves) uses it to travel its other documents too.
   */
  readonly onHistoryTravel?: (travel: OutlineHistoryTravel) => void;
  /** Preflight linked workspace history. False refuses the whole action; nodes rebase its snapshot. */
  readonly onBeforeHistoryTravel?: (
    travel: OutlineHistoryTravelRequest,
  ) => false | readonly OutlineItem[] | void;
}

export interface OutlineHistoryTravelRequest {
  readonly direction: "undo" | "redo";
  readonly from: unknown;
  readonly nodes: readonly OutlineItem[];
}

export interface OutlineHistoryTravel {
  readonly direction: "undo" | "redo";
  /** Opaque history entries, compared by identity. */
  readonly from: unknown;
  readonly to: unknown;
}

/**
 * Mark nodes about to be passed to a `replace` (or `paste-nodes`) action: these ids arrive
 * intact from elsewhere (a move between documents), so stamping leaves them alone.
 */
export function carryIds(nodes: readonly OutlineItem[], ids: ReadonlySet<string>) {
  if (ids.size) carriedIds.set(nodes, ids);
}

export interface OutlinerRow {
  readonly id: string;
  readonly node: OutlineItem;
  readonly parentId: string | null;
  readonly depth: number;
  readonly index: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly details: OutlineItemDetails;
  readonly completed: boolean;
  readonly locked: boolean;
  /** 1-based ordinal when the parent numbers its children. */
  readonly ordinal?: number;
  /** 1-based position among visible siblings, for aria-posinset / aria-setsize. */
  readonly posInSet?: number;
  readonly setSize?: number;
  /** Search: this row is shown only as an ancestor of a match. */
  readonly context?: boolean;
  readonly match?: OutlineSearchResult["matches"][number];
  /** Flat-results path (plain text ancestor titles). */
  readonly path?: readonly string[];
  /** Current titles of `[[label|id]]` targets in this row ("\u0000" = deleted); re-renders links on rename. */
  readonly refKey?: string;
  /** Folded summary: descendants and task progress. */
  readonly summary?: {
    readonly descendants: number;
    readonly done: number;
    readonly tasks: number;
  };
  /** How many items link here with `[[label|id]]` (backlinks). */
  readonly backlinks?: number;
  /** The row is a mirror (its source id), or a copy inside a mirror ("copy"). */
  readonly mirror?: string;
  /** Agenda view: this row opens a date group. */
  readonly agenda?: { readonly group: AgendaGroup; readonly count: number };
}

export type AgendaGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "earlier" | "none";
const AGENDA_ORDER: readonly AgendaGroup[] = [
  "overdue",
  "today",
  "tomorrow",
  "week",
  "later",
  "earlier",
  "none",
];
export function agendaGroupOf(node: OutlineItem, today: number): AgendaGroup {
  // A range under way sits under Today; anything else under its first day.
  const day = agendaDay(node, today);
  if (day === null) return "none";
  if (day < today) return isCompleted(node) ? "earlier" : "overdue";
  return day === today
    ? "today"
    : day === today + 1
      ? "tomorrow"
      : day <= today + 6
        ? "week"
        : "later";
}

/** Search results; `pending` while a half-typed last token is held back (see `search`). */
export type OutlinerSearch = OutlineSearchResult & { readonly pending?: boolean };

export interface OutlinerView {
  readonly query: string;
  readonly searchMode: "filter" | "flat" | "agenda";
  /** Order of flat results (see result-sort.tsx); the agenda keeps its date groups. */
  readonly resultSort?: ResultSort;
  readonly hideCompleted: boolean;
  readonly noteDisplay: OutlineNoteDisplay;
  /**
   * A read-only reader's own choice of view per item (list, board, article, mind map): local,
   * never written to the document, whose `data.view` stays the author's default.
   */
  readonly views?: Readonly<Record<string, OutlineItemView>>;
}

const noteAdapter: NonNullable<OutlineEditorOptions<OutlineItemData>["noteAdapter"]> = {
  read: (node) => node.data?.note ?? "",
  prepareData: (node, note) => {
    const { note: _previous, ...rest } = node.data ?? {};
    return { ok: true, data: note ? { ...rest, note } : rest };
  },
};

export const isCompleted = (node: OutlineItem) =>
  node.checked === true || node.data?.completed === true;

/** Immutable nodes ⇒ a subtree's summary can be cached by identity. */
const summaryCache = new WeakMap<
  OutlineItem,
  { descendants: number; tasks: number; done: number }
>();
function summarize(node: OutlineItem) {
  const cached = summaryCache.get(node);
  if (cached) return cached;
  const result = summarizeUncached(node);
  summaryCache.set(node, result);
  return result;
}
function summarizeUncached(node: OutlineItem) {
  let descendants = 0,
    tasks = 0,
    done = 0;
  const stack = [...(node.children ?? [])];
  while (stack.length) {
    const next = stack.pop()!;
    descendants++;
    if (next.checked !== undefined || next.data?.completed !== undefined) {
      tasks++;
      if (isCompleted(next)) done++;
    }
    // A mirror's copied children are counted where they live (its source), never twice.
    if (!mirrorOf(next)) stack.push(...(next.children ?? []));
  }
  return { descendants, tasks, done };
}

const DEV = typeof process !== "undefined" && process.env.NODE_ENV !== "production";
/** How long a dev build waits for a controlled host to answer before it explains the contract. */
export const UNANSWERED_WARNING_MS = 5000;

const sameRanges = (
  a: readonly { start: number; end: number }[],
  b: readonly { start: number; end: number }[],
) =>
  a === b ||
  (a.length === b.length &&
    a.every((range, i) => range.start === b[i]!.start && range.end === b[i]!.end));
const sameMatch = (a: OutlinerRow["match"], b: OutlinerRow["match"]) =>
  a === b ||
  (!!a &&
    !!b &&
    sameRanges(a.titleRanges, b.titleRanges) &&
    sameRanges(a.noteRanges, b.noteRanges));
const samePath = (a?: readonly string[], b?: readonly string[]) =>
  a === b ||
  ((a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((part, i) => part === b![i]));

/**
 * Whether two trees have the same shape (ids in the same places, numbering unchanged), collecting
 * the nodes that were replaced, parents before children. Identical subtrees are skipped whole.
 */
function sameShape(
  a: readonly OutlineItem[],
  b: readonly OutlineItem[],
  changed: OutlineItem[],
): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const before = a[i]!,
      after = b[i]!;
    if (before === after) continue;
    if (before.id !== after.id || !!before.data?.numbered !== !!after.data?.numbered) return false;
    // A new or removed [[link]] changes another row's backlink count: take the full walk.
    if (
      outgoingLinks(before) !== outgoingLinks(after) &&
      outgoingLinks(before).join() !== outgoingLinks(after).join()
    )
      return false;
    if (mirrorOf(before) !== mirrorOf(after)) return false;
    changed.push(after);
    if (!sameShape(before.children ?? NO_CHILDREN, after.children ?? NO_CHILDREN, changed))
      return false;
  }
  return true;
}
const NO_CHILDREN: readonly OutlineItem[] = [];

/** Tag inventory walks (and validates) the whole document: computed only when something asks. */
const tagCache = new WeakMap<readonly OutlineItem[], readonly OutlineTag[]>();
function tagsOf(nodes: readonly OutlineItem[]): readonly OutlineTag[] {
  let tags = tagCache.get(nodes);
  if (!tags) {
    tags = [...outlineTagInventory(nodes, { triggers: ["#", "@"] })].sort(
      (a, b) => b.count - a.count || a.spelling.localeCompare(b.spelling),
    );
    tagCache.set(nodes, tags);
  }
  return tags;
}

/** Reverse link index (target id → linking item ids), skipping mirror copies (counted once at the source). */
const linkIndexCache = new WeakMap<
  readonly OutlineItem[],
  ReadonlyMap<string, readonly string[]>
>();
export function linkIndexOf(nodes: readonly OutlineItem[]): ReadonlyMap<string, readonly string[]> {
  let index = linkIndexCache.get(nodes);
  if (index) return index;
  const out = new Map<string, string[]>();
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (mirrorOf(node)) continue;
    for (const target of outgoingLinks(node)) {
      if (target === node.id) continue;
      const list = out.get(target);
      if (list) list.push(node.id);
      else out.set(target, [node.id]);
    }
    if (node.children) stack.push(...node.children);
  }
  index = out;
  linkIndexCache.set(nodes, index);
  return index;
}

const clean = (data: OutlineItemData) => {
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(data))
    if (entry !== undefined && entry !== false) out[key] = entry;
  return Object.keys(out).length ? (out as OutlineItemData) : undefined;
};

/**
 * Completing a task whose title carries a recurring date (`!(2026-11-03 every week)`) moves the
 * date to its next occurrence instead (the usual recurring-task behaviour). Returns the new title, or
 * null when the title has no recurring date.
 */
export function advanceRecurring(
  text: string,
  now = new Date(),
): { text: string; next: Date } | null {
  let out = "";
  let at = 0;
  let next: Date | null = null;
  for (const segment of parseInline(text)) {
    if (segment.kind !== "date" || !segment.date?.repeat) continue;
    const date = nextOccurrence(segment.date, now);
    // The time as WRITTEN, not the clock of an instant that fell into a daylight-saving gap
    // (02:30 on spring-forward day reads 03:30): every later occurrence is 02:30 again.
    const time = segment.date.time ?? [
      segment.date.value.getHours(),
      segment.date.value.getMinutes(),
    ];
    if (segment.date.hasTime) date.setHours(time[0], time[1], 0, 0);
    // A clamped month end keeps its intended day (`every month on 31`) for the step after.
    const repeat = repeatFor(
      date,
      segment.date.repeat,
      segment.date.repeat.day ?? segment.date.value.getDate(),
    );
    out +=
      text.slice(at, segment.start) + formatDateToken(date, segment.date.hasTime, repeat, { time });
    at = segment.end;
    next ??= date;
  }
  return next ? { text: out + text.slice(at), next } : null;
}

/** A title's first `!(…)` date: where it is and what it says (null: no date). */
export function titleDate(
  text: string,
): { readonly start: number; readonly end: number; readonly date: InlineDate } | null {
  const segment = parseInline(text).find(
    (candidate) => candidate.kind === "date" && candidate.date,
  );
  return segment?.date ? { start: segment.start, end: segment.end, date: segment.date } : null;
}

/**
 * A title with its first date set to `day` (the time of day and the repeat kept), cleared
 * (`null`), or added at the end when it has none. A range keeps its length. Returns the text
 * unchanged when nothing applies (clearing a title without a date).
 */
export function withTitleDate(text: string, day: Date | null): string {
  const found = titleDate(text);
  if (!day)
    return found
      ? (text.slice(0, found.start) + text.slice(found.end)).replace(/ {2,}/g, " ").trim()
      : text;
  const at = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  if (!found) return `${text.replace(/\s+$/, "")}${text.trim() ? " " : ""}${formatDateToken(at)}`;
  const { date } = found;
  if (date.hasTime)
    at.setHours(date.time?.[0] ?? date.value.getHours(), date.time?.[1] ?? date.value.getMinutes());
  const end = date.end
    ? new Date(at.getTime() + (date.end.getTime() - date.value.getTime()))
    : undefined;
  const token = formatDateToken(at, date.hasTime, date.repeat, {
    end,
    endHasTime: date.endHasTime,
    time: date.time,
  });
  return text.slice(0, found.start) + token + text.slice(found.end);
}

/** A title whose first date repeats by `repeat` (undefined: once). No date yet: today, repeating. A range becomes its start. */
export function withTitleRepeat(text: string, repeat: DateRepeat | undefined): string {
  const found = titleDate(text);
  if (!found)
    return repeat
      ? `${text.replace(/\s+$/, "")}${text.trim() ? " " : ""}${formatDateToken(new Date(new Date().setHours(0, 0, 0, 0)), false, repeat)}`
      : text;
  const { date } = found;
  const rule = repeat ? repeatFor(date.value, repeat, date.value.getDate()) : undefined;
  return (
    text.slice(0, found.start) +
    formatDateToken(date.value, date.hasTime, rule, { time: date.time }) +
    text.slice(found.end)
  );
}

/**
 * The mirror rule for one edit (see mirrors.ts): propagate, rename ids created inside a mirror
 * (the caret and selection follow), or refuse.
 */
export function mirrorAfterEdit(isLocked: UseOutlinerOptions["isLocked"]): OutlineAfterEdit {
  return (before, after) => {
    if (!hasMirrors(after.nodes) && !hasMirrors(before.nodes)) return after;
    const sync = syncMirrors(before.nodes, after.nodes, isLocked);
    if (!sync.ok) return { ...before, refusal: sync.reason };
    if (sync.nodes === after.nodes && !sync.renames.size) return after;
    const rename = (id: string) => sync.renames.get(id) ?? id;
    const renameSet = (ids: ReadonlySet<string>) =>
      sync.renames.size ? new Set([...ids].map(rename)) : ids;
    return {
      ...after,
      nodes: sync.nodes,
      caret: after.caret ? { ...after.caret, id: rename(after.caret.id) } : null,
      selection: renameSet(after.selection),
      selectionAnchor: after.selectionAnchor ? rename(after.selectionAnchor) : null,
      expandedIds: renameSet(after.expandedIds),
      hoistedId: after.hoistedId ? rename(after.hoistedId) : null,
    };
  };
}

/**
 * Ids a `paste-nodes` brings back unchanged (a cut + paste is a MOVE, not new content), keyed by
 * that action's node array. Stamping skips them, so a moved item keeps its `createdAt` and does
 * not show up as "changed" (see importJSON).
 */
const carriedIds = new WeakMap<readonly OutlineItem[], ReadonlySet<string>>();

/** The studio-layer rules for one edit: stamp what changed, then keep mirrors in sync. */
export function outlinerAfterEdit(
  isLocked: UseOutlinerOptions["isLocked"],
  trackEdits = true,
): OutlineAfterEdit {
  const mirror = mirrorAfterEdit(isLocked);
  return (before, after, action) => {
    const carried =
      action.type === "paste-nodes" || action.type === "replace"
        ? carriedIds.get(action.nodes as readonly OutlineItem[])
        : undefined;
    const nodes = trackEdits
      ? stampEdits(before.nodes, after.nodes, Date.now(), carried)
      : after.nodes;
    return mirror(before, nodes === after.nodes ? after : { ...after, nodes }, action);
  };
}

/** Edits within this window reuse an item's stamp, so typing doesn't churn `data` per key. */
const STAMP_WINDOW_MS = 60_000;
const sameContent = (a: OutlineItem, b: OutlineItem) => {
  if (a.text !== b.text || a.checked !== b.checked) return false;
  const { editedAt: _a, createdAt: _ac, ...left } = a.data ?? {};
  const { editedAt: _b, createdAt: _bc, ...right } = b.data ?? {};
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every(
      (key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key],
    )
  );
};
/**
 * History-lite: every edited item gets `data.editedAt` (epoch ms; new items also `createdAt`),
 * the fields the core's details, sort ("edited") and the `changed:` search read. Diffed along
 * identity (untouched subtrees are skipped whole); a moved item is not an edit.
 */
export function stampEdits(
  before: readonly OutlineItem[],
  after: readonly OutlineItem[],
  now = Date.now(),
  /** Ids that arrive unchanged from elsewhere (a cut + paste move): not edits, never stamped. */
  carried?: ReadonlySet<string>,
): readonly OutlineItem[] {
  let all: Map<string, OutlineItem> | null = null;
  const lookup = (id: string) => {
    if (!all) {
      all = new Map();
      const stack = [...before];
      while (stack.length) {
        const node = stack.pop()!;
        all.set(node.id, node);
        if (node.children) stack.push(...node.children);
      }
    }
    return all.get(id);
  };
  const list = (
    items: readonly OutlineItem[],
    previous: readonly OutlineItem[] | undefined,
  ): readonly OutlineItem[] => {
    if (items === previous) return items;
    const siblings = new Map((previous ?? []).map((node) => [node.id, node]));
    let changed = false;
    const out = items.map((node) => {
      const prior = siblings.get(node.id) ?? lookup(node.id);
      if (prior === node) return node;
      const children = node.children ? list(node.children, prior?.children) : undefined;
      let next = children === node.children ? node : { ...node, children: children! };
      if (!prior && carried?.has(node.id)) {
        // Moved here intact (cut + paste): not an edit.
      } else if (!prior || !sameContent(prior, node)) {
        const data = next.data ?? {};
        const fresh =
          typeof data.editedAt === "number" &&
          now - data.editedAt >= 0 &&
          now - data.editedAt < STAMP_WINDOW_MS;
        if (!fresh || (!prior && data.createdAt === undefined))
          next = {
            ...next,
            data: {
              ...data,
              editedAt: fresh ? data.editedAt : now,
              ...(!prior && data.createdAt === undefined ? { createdAt: now } : {}),
            },
          };
      }
      if (next !== node) changed = true;
      return next;
    });
    return changed ? out : items;
  };
  return list(after, before);
}

/** Zoomed into a mirror (or a copy inside one): its children are copies under that prefix. */
function hoistedCopyPrefix(nodes: readonly OutlineItem[], id: string): string | null {
  const path = getOutlinePath(nodes, id) as readonly OutlineItem[];
  const root = path.find((node) => mirrorOf(node));
  return root ? root.id + "~" : null;
}

export interface ToggleSummary {
  /** The completion state the toggle set (recurring tasks stay open and advance instead). */
  readonly completed: boolean;
  readonly advanced: readonly { readonly id: string; readonly next: Date }[];
}

export function useOutliner(options: UseOutlinerOptions) {
  const { readOnly = false, isLocked } = options;
  const controlled = options.value !== undefined;
  const editorOptions = React.useRef<OutlineEditorOptions<OutlineItemData>>({});
  editorOptions.current = {
    readOnly,
    isLocked,
    noteAdapter,
    historyLimit: 200,
    typingGroupMs: 900,
    mergeData: (left, right) => {
      const note = [left.data?.note, right.data?.note].filter(Boolean).join("\n");
      return { ...right.data, ...left.data, ...(note ? { note } : {}) };
    },
  };
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  // External links change identity whenever another document changes: read them through a ref
  // and re-project only when the backlink counts (their version) change.
  const external = options.externalLinks;
  const externalCounts = external?.counts;

  /* ── Dev-only contract warnings (React's own value/defaultValue rules) ── */
  const wasControlled = React.useRef(controlled);
  const warned = React.useRef(new Set<string>());
  const warn = (key: string, message: string) => {
    if (!DEV || warned.current.has(key)) return;
    warned.current.add(key);
    console.error(`Outliner: ${message}`);
  };
  if (wasControlled.current !== controlled)
    warn(
      "switch",
      `a component is changing from ${wasControlled.current ? "controlled" : "uncontrolled"} to ${controlled ? "controlled" : "uncontrolled"}. ` +
        "Decide between `value` (controlled) and `defaultValue` (uncontrolled) for the lifetime of the component.",
    );
  wasControlled.current = controlled;
  if (controlled && options.defaultValue !== undefined)
    warn(
      "both",
      "both `value` and `defaultValue` were passed; `value` wins (controlled). Remove one.",
    );

  /*
   * One store for the editor state and the host's answers (see controlled-outline.ts). It lives
   * in a ref so a dispatch can read the result synchronously and report it to the host inside
   * the same event (the host's setState then batches with ours: one render per keystroke).
   */
  const store = React.useRef<ControlledOutlineState>(null!);
  if (!store.current) {
    const initial = options.value ?? options.defaultValue ?? [];
    // Mirrors load in sync with their sources (a host may store only `{ data: { mirrorOf } }`).
    const synced = syncMirrors(null, initial);
    store.current = initOutlineState(
      createOutlineEditorState(synced.ok ? synced.nodes : initial, {
        expandedIds: options.defaultExpandedIds ? new Set(options.defaultExpandedIds) : undefined,
      }),
      options.value,
    );
  }
  const [version, bump] = React.useReducer((n: number) => n + 1, 0);
  const nextId = React.useRef(1);
  /** Counts content changes; a row's local typing draft is current while it is ahead of this. */
  const seq = React.useRef(0);
  const trackEdits = options.trackEdits !== false;
  const afterEdit = React.useMemo(
    () => outlinerAfterEdit(isLocked, trackEdits),
    [isLocked, trackEdits],
  );
  const afterEditRef = React.useRef(afterEdit);
  afterEditRef.current = afterEdit;

  // The host's answer to this render's `value`: echo (commit), external (one step), or nothing yet.
  const incoming = options.value;
  const reconciled = React.useMemo(
    () =>
      incoming === undefined
        ? null
        : reconcileOutline(store.current, incoming, {
            ...editorOptions.current,
            collaboration: options.collaboration,
          }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incoming, version, options.collaboration],
  );
  // What renders: the newest pending proposal (optimistic, the default) or only what the host
  // echoed. Uncontrolled there is nothing pending, so both are the editor itself.
  const optimistic = options.optimistic !== false;
  const current = reconciled?.state ?? store.current;
  const state = optimistic ? latestEditor(current) : current.editor;
  // An external value can be text this field emitted earlier (for example a
  // delegated undo before its deferred typing render). Mark it newer than that
  // local draft; otherwise FieldSession mistakes the undo for an older echo and
  // keeps showing the removed text. Derive for this render, commit the clock in
  // the layout effect, and never tick again for an already-reconciled value.
  const externalChange = reconciled?.outcome === "external" && reconciled.state !== store.current;
  const renderedSeq = seq.current + (externalChange ? 1 : 0);
  React.useLayoutEffect(() => {
    // The render above already shows the answer; only the store catches up (no second render).
    if (reconciled && reconciled.state !== store.current) {
      store.current = reconciled.state;
      seq.current = Math.max(seq.current, renderedSeq);
    }
    if (reconciled?.outcome === "invalid")
      warn("invalid", "`value` is not a valid outline (duplicate or missing ids); it was ignored.");
  });

  /**
   * The last veto, for the notice ("Change not accepted", announced): `count` proposals (edits)
   * were rolled back. `seq` changes on every veto so the same count twice still notifies.
   */
  const [rejection, setRejection] = React.useState<{
    readonly seq: number;
    readonly count: number;
  } | null>(null);
  const rejectProposal = React.useCallback((id: number) => {
    const result = rejectOutlineProposal(store.current, id);
    if (result.state === store.current) return;
    store.current = result.state;
    // A typing draft must not outlive its veto: the rollback paints in this one render.
    seq.current++;
    setRejection((last) => ({ seq: (last?.seq ?? 0) + 1, count: result.dropped.length }));
    bump();
  }, []);

  /** Every edit goes through here; returns the editor after the action. */
  /*
   * A typing keystroke paints first (the row shows its local draft), then the outliner renders
   * the new document: after the next frame, as a transition (interruptible by the next key).
   * Any other dispatch renders at once and so also carries every keystroke before it.
   */
  const deferred = React.useRef(false);
  /** Rows kept visible past the active filter while they are the target (target.ts LingerState). */
  const linger = React.useRef<LingerState>(NO_LINGER);
  /** The board or mind map on screen: its visible order is what the target and linger mean. Null: the list. */
  const viewNav = React.useRef<ViewNav | null>(null);
  /** The rows the reader sees now, in order: the registered view's, else the list's. */
  const shownRows = (): readonly { readonly id: string }[] =>
    viewNav.current ? navRows(viewNav.current.visibleIds()).rows : latest.current.rows;
  /** The reader view at dispatch time (declared before `view`, assigned once it exists). */
  const viewRef = React.useRef<OutlinerView>(null!);
  /** The last action type that changed content (the touch adapter reads it). */
  const lastEdit = React.useRef<{
    readonly type: OutlineAction<OutlineItemData>["type"];
    readonly seq: number;
  } | null>(null);
  const renderSoon = React.useCallback(() => {
    if (deferred.current) return;
    deferred.current = true;
    requestAnimationFrame(() =>
      setTimeout(() => {
        deferred.current = false;
        React.startTransition(bump);
      }, 0),
    );
  }, []);
  const dispatch = React.useCallback(
    (
      action: OutlineAction<OutlineItemData>,
      options?: { readonly afterPaint?: boolean },
    ): OutlineEditor => {
      const isControlled = optionsRef.current.value !== undefined;
      const id = nextId.current++;
      const travel = action.type === "undo" || action.type === "redo" ? action.type : null;
      const base = latestEditor(store.current);
      const history = base.history;
      const from =
        travel === "undo"
          ? history.past.at(-1)
          : travel === "redo"
            ? history.future.at(-1)
            : undefined;
      const binding = optionsRef.current.collaboration;
      if (travel && binding) {
        if (optionsRef.current.readOnly) return base;
        const allowed = travel === "undo" ? binding.canUndo : binding.canRedo;
        if (
          allowed &&
          optionsRef.current.onBeforeHistoryTravel?.({
            direction: travel,
            from,
            nodes: base.nodes,
          }) !== false
        )
          binding[travel]();
        return base;
      }
      let starting = store.current;
      if (travel && from) {
        const wanted = optionsRef.current.onBeforeHistoryTravel?.({
          direction: travel,
          from,
          nodes: from.nodes,
        });
        if (wanted === false) return base;
        if (wanted && wanted !== from.nodes) {
          const stack = travel === "undo" ? "past" : "future";
          const editor = {
            ...base,
            history: {
              ...base.history,
              [stack]: [...base.history[stack].slice(0, -1), { ...from, nodes: wanted }],
            },
          };
          starting = starting.pending.length
            ? {
                ...starting,
                pending: [
                  ...starting.pending.slice(0, -1),
                  { ...starting.pending.at(-1)!, target: editor },
                ],
              }
            : { ...starting, editor };
        }
      }
      const step = stepOutline(
        starting,
        action,
        editorOptions.current,
        isControlled,
        id,
        afterEditRef.current,
      );
      if (step.state === store.current) return step.result;
      if (step.proposal) seq.current++;
      store.current = step.state;
      // Linger (target.ts): rows the reader acts on stay visible under a filter until the target moves on.
      const after = latestEditor(step.state);
      const edited = after.nodes !== base.nodes;
      if (edited) lastEdit.current = { type: action.type, seq: (lastEdit.current?.seq ?? 0) + 1 };
      const session = lingerSession(viewRef.current, after.hoistedId);
      // Only rows the reader can see (or that this edit created) can linger: a range that spans
      // filtered-out rows never brings them back.
      const seen = session ? new Set(shownRows().map((row) => row.id)) : null;
      const visible = (ids: readonly string[]) =>
        seen ? ids.filter((id) => seen.has(id) || !findOutlineNode(base.nodes, id)) : ids;
      linger.current = nextLinger(linger.current, session, {
        kind: action.type === "replace" ? "replace" : travel ? "history" : edited ? "edit" : "view",
        before: visible(targetIdsOf(base)),
        after: visible(targetIdsOf(after)),
        afterPaths: (ids) =>
          ids.flatMap((id) =>
            getOutlinePath(after.nodes, id)
              .slice(0, -1)
              .map((node) => node.id),
          ),
      });
      if (options?.afterPaint) renderSoon();
      else bump();
      if (step.proposal) {
        const answer = optionsRef.current.onValueChange?.(step.result.nodes, {
          ...step.proposal.meta,
          reject: () => rejectProposal(id),
        });
        if (isControlled && answer === false) rejectProposal(id);
      }
      if (travel && from !== undefined && !step.result.refusal) {
        const after = latestEditor(store.current).history;
        const to = travel === "undo" ? after.future.at(-1) : after.past.at(-1);
        if (to !== undefined && to !== from)
          optionsRef.current.onHistoryTravel?.({ direction: travel, from, to });
      }
      return step.result;
    },
    [rejectProposal, renderSoon],
  );

  // Dev: a controlled host that never answers is almost always a listener that meant `defaultValue`.
  const oldest = store.current.pending[0]?.id;
  React.useEffect(() => {
    if (!DEV || oldest === undefined) return;
    const timer = window.setTimeout(
      () =>
        warn(
          "unanswered",
          `onValueChange has not been answered for ${UNANSWERED_WARNING_MS / 1000}s. In controlled mode (\`value\`) pass the proposed nodes back to accept them, ` +
            "or return false / call meta.reject() to veto. If you only want to be notified (autosave), pass `defaultValue` instead of `value`.",
        ),
      UNANSWERED_WARNING_MS,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldest]);

  const [view, setView] = React.useState<OutlinerView>({
    query: "",
    searchMode: "filter",
    hideCompleted: false,
    noteDisplay: "show",
  });
  viewRef.current = view;
  // A remote replacement of the document drops every lingering row (target.ts).
  if (reconciled?.outcome === "external") linger.current = NO_LINGER;
  // A new filter session (query, Hide completed, mode, zoom) starts with nothing lingering, and
  // going back to an earlier one never revives what lingered there.
  const lingerKey = lingerSession(view, state.hoistedId);
  if (linger.current.session !== lingerKey)
    linger.current = { session: lingerKey, ids: NO_LINGER.ids };
  const lingerIds = linger.current.ids;

  /*
   * A half-typed last token (`due:`, `before:2026-1`, `is:todo du`) is unfinished, not wrong:
   * the results of the query without it are held (no flash of "invalid" or "no matches") while
   * the help strip offers completions. A colon-less word ("du") still searches as text unless
   * that finds nothing, in which case it reads as an operator being typed.
   */
  const search = React.useMemo<OutlinerSearch | null>(() => {
    const query = view.query.trim();
    if (!query) return null;
    const run = (q: string) =>
      searchOutliner(state.nodes, q, { scopeId: state.hoistedId ?? undefined, maxResults: 2000 });
    if (searchSuggestions(view.query).length) {
      const last = query.split(/\s+/).at(-1)!;
      const held = query.slice(0, query.length - last.length).trim();
      if (last.includes(":")) return held ? { ...run(held), pending: true as const } : null;
      const literal = run(query);
      if (literal.matchedIds.length || !held) return literal;
      return { ...run(held), pending: true as const };
    }
    return run(query);
  }, [state.nodes, view.query, state.hoistedId]);
  /** Bookmarks: controlled (`bookmarks`) or owned (`defaultBookmarks`); persisted by the host. */
  const [ownBookmarks, setOwnBookmarks] = React.useState<OutlineBookmarks>(
    () => options.defaultBookmarks ?? NO_BOOKMARKS,
  );
  const bookmarks = options.bookmarks ?? ownBookmarks;
  const bookmarksRef = React.useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const updateBookmarks = React.useCallback(
    (change: (current: OutlineBookmarks) => OutlineBookmarks) => {
      const next = change(bookmarksRef.current);
      if (next === bookmarksRef.current) return;
      bookmarksRef.current = next;
      if (optionsRef.current.bookmarks === undefined) setOwnBookmarks(next);
      optionsRef.current.onBookmarksChange?.(next);
    },
    [],
  );

  const hoisted = state.hoistedId ? findOutlineNode(state.nodes, state.hoistedId)?.node : undefined;

  // Row objects are reused when nothing they render changed, so memoized rows skip work.
  const rowCache = React.useRef(new Map<string, OutlinerRow>());
  // Title index for id links: built lazily, only when a visible row links by id. A document
  // without links (the common case, and the 2,740-row stress sample) never walks for it.
  const titlesFor = React.useMemo(() => {
    let map: Map<string, string> | null = null;
    return (id: string) => {
      if (!map) {
        map = new Map();
        const stack = [...state.nodes];
        while (stack.length) {
          const node = stack.pop()!;
          map.set(node.id, node.text);
          stack.push(...(node.children ?? []));
        }
      }
      const local = map.get(id);
      if (local !== undefined) return local;
      // `[[label|doc/item]]`: another document's item, through the host.
      return optionsRef.current.externalLinks?.resolve(id) ?? undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes, externalCounts]);
  const refKeyOf = (node: OutlineItem) => {
    if (!node.text.includes("|")) return undefined;
    const ids = [...node.text.matchAll(/\[\[[^\]|\n]+\|([^\]\n]+)\]\]/g)].map((match) => match[1]!);
    return ids.length ? ids.map((id) => titlesFor(id) ?? "\u0000").join("\u0001") : undefined;
  };
  /** The last full projection, for the typing fast path below. */
  const projection = React.useRef<{
    readonly nodes: readonly OutlineItem[];
    readonly expandedIds: ReadonlySet<string>;
    readonly hoistedId: string | null;
    readonly view: OutlinerView;
    readonly isLocked: UseOutlinerOptions["isLocked"];
    readonly externalCounts?: ReadonlyMap<string, number>;
    readonly rows: readonly OutlinerRow[];
    readonly index: ReadonlyMap<string, number>;
    readonly hasRefs: boolean;
  } | null>(null);
  /** Row positions by id; the typing fast path keeps the order, so it keeps the map too. */
  const rowIndexCache = React.useRef(
    new WeakMap<readonly OutlinerRow[], ReadonlyMap<string, number>>(),
  );
  const rows = React.useMemo<readonly OutlinerRow[]>(() => {
    const previous = rowCache.current;
    /*
     * Typing fast path. A keystroke replaces one node and (by path copying) its ancestors; the
     * tree keeps its shape, folding and view. Then only those rows change: diff the two trees
     * along identity (unchanged subtrees are skipped whole) and patch them into the previous
     * array, instead of re-walking all 2,740 rows. Anything structural takes the full walk.
     */
    const last = projection.current;
    if (
      last &&
      !search &&
      !view.hideCompleted &&
      !last.hasRefs &&
      last.view === view &&
      last.expandedIds === state.expandedIds &&
      last.hoistedId === state.hoistedId &&
      last.isLocked === isLocked &&
      last.externalCounts === externalCounts
    ) {
      const changed: OutlineItem[] = [];
      if (sameShape(last.nodes, state.nodes, changed)) {
        const out = last.rows.slice();
        let refs = false;
        for (const node of changed) {
          const at = last.index.get(node.id);
          if (at === undefined) continue; // inside a fold: its visible ancestor is patched instead
          const prev = out[at]!;
          const parentRow = prev.parentId ? out[last.index.get(prev.parentId) ?? -1] : undefined;
          const parentLocked = parentRow
            ? parentRow.locked
            : prev.locked && !(isLocked?.(prev.node) ?? false);
          const refKey = refKeyOf(node);
          refs ||= refKey !== undefined;
          const row: OutlinerRow = {
            ...prev,
            node,
            details: getOutlineItemDetails(node),
            completed: isCompleted(node),
            locked: prev.mirror ? prev.locked : parentLocked || (!!isLocked && isLocked(node)),
            refKey,
            summary: prev.hasChildren && !prev.expanded ? summarize(node) : undefined,
          };
          out[at] = row;
          previous.set(node.id, row);
        }
        projection.current = { ...last, nodes: state.nodes, rows: out, hasRefs: refs };
        rowIndexCache.current.set(out, last.index);
        return out;
      }
    }
    const next = new Map<string, OutlinerRow>();
    const out: OutlinerRow[] = [];
    const keep = (
      row: Omit<OutlinerRow, "details"> & { details?: OutlineItemDetails },
    ): OutlinerRow => {
      const prev = previous.get(row.id);
      const details =
        prev && prev.node === row.node ? prev.details : getOutlineItemDetails(row.node);
      const candidate = { ...row, details } as OutlinerRow;
      const same =
        prev &&
        prev.node === row.node &&
        prev.depth === row.depth &&
        prev.parentId === row.parentId &&
        prev.expanded === row.expanded &&
        prev.hasChildren === row.hasChildren &&
        prev.completed === row.completed &&
        prev.locked === row.locked &&
        prev.ordinal === row.ordinal &&
        prev.posInSet === row.posInSet &&
        prev.setSize === row.setSize &&
        prev.context === row.context &&
        sameMatch(prev.match, row.match) &&
        prev.summary === row.summary &&
        prev.refKey === row.refKey &&
        prev.backlinks === row.backlinks &&
        prev.mirror === row.mirror &&
        prev.agenda?.group === row.agenda?.group &&
        prev.agenda?.count === row.agenda?.count &&
        samePath(prev.path, row.path);
      const result = same ? prev : candidate;
      next.set(row.id, result);
      out.push(result);
      return result;
    };
    const searching = search && !search.diagnostics.length;
    const matches = new Map(search?.matches.map((match) => [match.id, match]));
    const contextIds = new Set(search?.contextAncestorIds);
    // Lingering targets (and the path to them) stay through the filter until the cursor moves on.
    const lingering = lingerIds.size ? lingerPaths(state.nodes, lingerIds) : null;

    const links = linkIndexOf(state.nodes);
    // Local backlinks plus links from other documents (a workspace host).
    const countBacklinks = (index: ReadonlyMap<string, readonly string[]>, id: string) =>
      (index.get(id)?.length ?? 0) + (externalCounts?.get(id) ?? 0) || undefined;
    if (searching && view.searchMode !== "filter") {
      // Flat results, or the agenda: the same results grouped Overdue / Today / … by first date.
      let ordered = search.matches.map((match) => ({
        match,
        location: findOutlineNode(state.nodes, match.id),
      }));
      const today = dayNumber(new Date());
      const groupOf = new Map<string, AgendaGroup>();
      if (view.searchMode === "agenda") {
        for (const { match, location } of ordered)
          if (location) groupOf.set(match.id, agendaGroupOf(location.node as OutlineItem, today));
        const rank = (id: string) => AGENDA_ORDER.indexOf(groupOf.get(id) ?? "none");
        const day = (location?: { node: unknown }) =>
          location ? (agendaDay(location.node as OutlineItem, today) ?? Infinity) : Infinity;
        ordered = ordered
          .map((entry, order) => ({ ...entry, order }))
          .sort(
            (a, b) =>
              rank(a.match.id) - rank(b.match.id) ||
              day(a.location) - day(b.location) ||
              a.order - b.order,
          );
      } else if (view.resultSort && view.resultSort !== "outline") {
        const located = ordered.flatMap((entry, order) =>
          entry.location ? [{ ...entry, node: entry.location.node as OutlineItem, order }] : [],
        );
        ordered = [...sortResults(located, view.resultSort)];
      }
      const counts = new Map<AgendaGroup, number>();
      for (const group of groupOf.values()) counts.set(group, (counts.get(group) ?? 0) + 1);
      let lastGroup: AgendaGroup | null = null;
      // A lingering row that stopped matching keeps the place it had in the results.
      const listed: {
        readonly match?: (typeof ordered)[number]["match"];
        readonly location: (typeof ordered)[number]["location"];
      }[] = [...ordered];
      for (const id of lingerIds) {
        if (matches.has(id)) continue;
        const location = findOutlineNode(state.nodes, id);
        if (location)
          listed.splice(Math.min(previous.get(id)?.index ?? listed.length, listed.length), 0, {
            location,
          });
      }
      for (const { match, location } of listed) {
        if (!location) continue;
        const node = location.node as OutlineItem;
        const group = groupOf.get(node.id);
        const opens = group !== undefined && group !== lastGroup;
        if (group) lastGroup = group;
        keep({
          id: node.id,
          node,
          parentId: location.ancestors.at(-1)?.id ?? null,
          depth: 0,
          index: out.length,
          hasChildren: !!node.children?.length,
          expanded: false,
          completed: isCompleted(node),
          locked:
            !!isLocked && [...location.ancestors, node].some((n) => isLocked(n as OutlineItem)),
          match,
          path: location.ancestors.map((ancestor) => inlineToPlain(ancestor.text)),
          backlinks: countBacklinks(links, node.id),
          mirror: mirrorOf(node),
          agenda: opens ? { group: group!, count: counts.get(group!) ?? 0 } : undefined,
        });
      }
      rowCache.current = next;
      projection.current = null;
      return out;
    }

    const hoistLocked =
      !!isLocked &&
      !!state.hoistedId &&
      getOutlinePath(state.nodes, state.hoistedId).some((node) => isLocked(node as OutlineItem));
    // Copies inside a mirror take their lock from the source node they show.
    let byId: Map<string, OutlineItem> | null = null;
    const nodeById = (id: string) => {
      if (!byId) {
        byId = new Map();
        const stack = [...state.nodes];
        while (stack.length) {
          const node = stack.pop()!;
          byId.set(node.id, node);
          if (node.children) stack.push(...node.children);
        }
      }
      return byId.get(id);
    };
    const sourceLocked = (id: string) =>
      !!isLocked && getOutlinePath(state.nodes, id).some((node) => isLocked(node as OutlineItem));
    const walk = (
      items: readonly OutlineItem[],
      depth: number,
      parent: OutlineItem | null,
      parentLocked: boolean,
      copyPrefix: string | null,
    ) => {
      let ordinal = 0;
      const shown = items.filter(
        (node) =>
          !!lingering?.shown.has(node.id) ||
          (!(searching && !matches.has(node.id) && !contextIds.has(node.id)) &&
            !(view.hideCompleted && isCompleted(node) && !matches.has(node.id))),
      );
      for (const node of shown) {
        const completed = isCompleted(node);
        const hasChildren = !!node.children?.length;
        const expanded = searching
          ? contextIds.has(node.id) ||
            !!lingering?.ancestors.has(node.id) ||
            (hasChildren && state.expandedIds.has(node.id))
          : hasChildren && state.expandedIds.has(node.id);
        const source = copyPrefix === null ? mirrorOf(node) : undefined;
        const canonical =
          copyPrefix !== null && node.id.startsWith(copyPrefix)
            ? nodeById(node.id.slice(copyPrefix.length))
            : undefined;
        const locked =
          parentLocked ||
          (!!isLocked && isLocked(node)) ||
          (!!source && sourceLocked(source)) ||
          (!!canonical && !!isLocked && isLocked(canonical));
        ordinal++;
        keep({
          id: node.id,
          node,
          parentId: parent?.id ?? null,
          depth,
          index: out.length,
          hasChildren,
          expanded,
          completed,
          locked,
          ordinal: parent?.data?.numbered ? items.indexOf(node) + 1 : undefined,
          posInSet: ordinal,
          setSize: shown.length,
          refKey: refKeyOf(node),
          context: searching ? !matches.has(node.id) && !lingerIds.has(node.id) : undefined,
          match: matches.get(node.id),
          summary: hasChildren && !expanded ? summarize(node) : undefined,
          // A mirror or a copy in one shows its source's backlinks (it is the same item).
          backlinks: countBacklinks(
            links,
            source ??
              (copyPrefix !== null && node.id.startsWith(copyPrefix)
                ? node.id.slice(copyPrefix.length)
                : node.id),
          ),
          mirror: source ?? (copyPrefix !== null ? "copy" : undefined),
        });
        if (expanded && node.children)
          walk(node.children, depth + 1, node, locked, source ? node.id + "~" : copyPrefix);
      }
    };
    const hoistMirror =
      hoisted && hasMirrors([hoisted]) ? hoistedCopyPrefix(state.nodes, hoisted.id) : null;
    walk(
      hoisted ? (hoisted.children ?? []) : state.nodes,
      0,
      hoisted ?? null,
      hoistLocked,
      hoistMirror,
    );
    rowCache.current = next;
    const index = new Map(out.map((row, i) => [row.id, i]));
    rowIndexCache.current.set(out, index);
    // Only an unfiltered projection can be patched by later keystrokes.
    projection.current = searching
      ? null
      : {
          nodes: state.nodes,
          expandedIds: state.expandedIds,
          hoistedId: state.hoistedId,
          view,
          isLocked,
          externalCounts,
          rows: out,
          index,
          hasRefs: out.some((row) => row.refKey !== undefined),
        };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.nodes,
    state.expandedIds,
    state.hoistedId,
    hoisted,
    search,
    view,
    isLocked,
    titlesFor,
    externalCounts,
    lingerIds,
  ]);

  const breadcrumbs = React.useMemo(
    () => (state.hoistedId ? getOutlinePath(state.nodes, state.hoistedId) : []),
    [state.nodes, state.hoistedId],
  ) as readonly OutlineItem[];

  /** Latest state and rows for commands that must read selection-time context (`remove`). */
  const latest = React.useRef({ rows });
  latest.current = { rows };
  const commands = React.useMemo(() => {
    // Commands read the newest document at call time (a typing draft may not have rendered yet).
    const nodesNow = () => latestEditor(store.current).nodes;
    const nodeOf = (id: string) => findOutlineNode(nodesNow(), id)?.node as OutlineItem | undefined;
    const updateData = (
      ids: readonly string[],
      patch: (node: OutlineItem) => OutlineItemData | undefined,
    ) =>
      dispatch({
        type: "transaction",
        commands: ids.flatMap((id): OutlineCommand<OutlineItemData>[] => {
          const node = nodeOf(id);
          if (!node) return [];
          return [{ type: "update", id, changes: { data: patch(node) } }];
        }),
      });
    /** Rewrite titles as one transaction (rows whose title would not change are left out). */
    const retitle = (ids: readonly string[], rewrite: (text: string) => string) =>
      dispatch({
        type: "transaction",
        commands: ids.flatMap((id): OutlineCommand<OutlineItemData>[] => {
          const node = nodeOf(id);
          if (!node) return [];
          const text = rewrite(node.text);
          return text === node.text ? [] : [{ type: "update", id, changes: { text } }];
        }),
      });
    const sort = (
      parentId: string | null,
      by: OutlineSortKey,
      direction: "ascending" | "descending" = "ascending",
    ) => {
      // Inline !(dates) count for the date sort (the core reads them through the details getter).
      const plan = planOutlineSort(nodesNow(), { parentId, by, direction }, outlinerDetails);
      if (plan.ok) dispatch(plan.action);
      return plan.ok;
    };
    /**
     * Lossless paste from our own clipboard flavor (or a .json file). An id that is free here
     * is kept, so cut + paste is a MOVE (links, bookmarks and host records survive; a copy cut
     * from a mirror pastes back as its source item). Taken ids are regenerated, with mirrors
     * and links inside the paste re-pointed. Null when the text is not ours.
     */
    const importJSON = (json: string, afterId?: string): number | null => {
      let parsed: readonly OutlineItem[];
      try {
        parsed = importOutlineJSON<OutlineItemData>(json).nodes as readonly OutlineItem[];
      } catch {
        return null;
      }
      const taken = new Set<string>();
      const kept = new Set<string>();
      const stack = [...nodesNow()];
      while (stack.length) {
        const node = stack.pop()!;
        taken.add(node.id);
        if (node.children) stack.push(...node.children);
      }
      const nodes = reidentify(parsed, (id) => {
        // A copy's derived id (`mirror~item`) is never kept as is: only its canonical source id,
        // and only when that is free. A derived id kept here would later be "rescued" onto a
        // canonical id that is already in use (a second paste after a mirror cut).
        const at = id.lastIndexOf("~");
        const candidate = at < 0 ? id : id.slice(at + 1);
        if (!candidate || taken.has(candidate)) return null;
        taken.add(candidate);
        kept.add(candidate);
        return candidate;
      });
      if (!nodes.length) return 0;
      const before = nodesNow();
      // A kept id is the same item coming back (cut + paste): a move, not new content.
      if (kept.size) carriedIds.set(nodes, kept);
      const next = dispatch({
        type: "paste-nodes",
        afterId,
        nodes,
        createId: idsInPasteOrder(nodes),
      });
      if (next.refusal || next.nodes === before) return 0;
      // Select what was pasted, so the next paste (or ⌘Z, Tab, Delete) acts on it — not on the last row.
      selectCreated(
        nodes.map((node) => node.id),
        next.nodes,
        afterId,
      );
      return nodes.length;
    };
    /**
     * The "result" select policy (target.ts): what an action created becomes the target. Pasted
     * inside a mirror, the item lives at its source; the copy the user pasted into (`mirror~id`,
     * right where they are working) is what gets selected.
     */
    const selectCreated = (
      ids: readonly string[],
      nodes: readonly OutlineItem[],
      afterId?: string,
    ) => {
      const prefix = afterId ? hoistedCopyPrefix(nodes, afterId) : null;
      const targets = ids
        .map((id) => (prefix && findOutlineNode(nodes, prefix + id) ? prefix + id : id))
        .filter((id) => findOutlineNode(nodes, id));
      targets.forEach((id, index) => dispatch({ type: "select", id, toggle: index > 0 }));
    };
    /** Insert whole items after `afterId`; `select: "result"` targets them (row mode), "keep" leaves the caret on the last one. */
    const pasteNodes = (
      nodes: readonly OutlineItem[],
      afterId: string | undefined,
      select: SelectPolicy,
    ) => {
      const before = nodesNow();
      const next = dispatch({ type: "paste-nodes", afterId, nodes, createId: createOutlineId });
      if (select === "result" && !next.refusal && next.nodes !== before)
        selectCreated(
          createdRoots(before, next.nodes).filter((id) => !id.includes("~")),
          next.nodes,
          afterId,
        );
    };
    return {
      /**
       * Complete (or reopen) items. A recurring task being completed moves to its next date
       * instead and stays open; all of it is one undo step.
       */
      toggleComplete(ids: readonly string[]): ToggleSummary {
        const nodes = ids.map(nodeOf).filter(Boolean) as OutlineItem[];
        const target = !nodes.every(isCompleted);
        const advanced: { id: string; next: Date }[] = [];
        dispatch({
          type: "transaction",
          commands: nodes.map((node): OutlineCommand<OutlineItemData> => {
            const recurring = target ? advanceRecurring(node.text) : null;
            if (recurring) {
              advanced.push({ id: node.id, next: recurring.next });
              return { type: "update", id: node.id, changes: { text: recurring.text } };
            }
            return node.checked !== undefined
              ? { type: "update", id: node.id, changes: { checked: target } }
              : {
                  type: "update",
                  id: node.id,
                  changes: { data: clean({ ...node.data, completed: target }) },
                };
          }),
        });
        return { completed: target, advanced };
      },
      /** Adds checkboxes (unless every item has one: then removes them). "added" / "removed", or null when nothing changed. */
      toggleCheckbox(ids: readonly string[]): "added" | "removed" | null {
        const nodes = ids.map(nodeOf).filter(Boolean) as OutlineItem[];
        const add = nodes.some((node) => node.checked === undefined);
        const before = nodesNow();
        const result = dispatch({
          type: "transaction",
          commands: nodes.map((node) => ({
            type: "update",
            id: node.id,
            changes: add
              ? {
                  checked: node.checked ?? node.data?.completed === true,
                  data: clean({ ...node.data, completed: undefined }),
                }
              : { checked: null, data: clean({ ...node.data, completed: node.checked === true }) },
          })),
        });
        return result.refusal || result.nodes === before ? null : add ? "added" : "removed";
      },
      setHeading(ids: readonly string[], heading: 1 | 2 | 3 | undefined) {
        updateData(ids, (node) => clean({ ...node.data, heading }));
      },
      /** The heading chord: a level the whole target already has turns it back to text (self-inverse). */
      toggleHeading(ids: readonly string[], heading: 1 | 2 | 3 | undefined) {
        const off =
          heading !== undefined &&
          ids.length > 0 &&
          ids.every((id) => nodeOf(id)?.data?.heading === heading);
        updateData(ids, (node) => clean({ ...node.data, heading: off ? undefined : heading }));
      },
      /** Date ▸: set every target's first date to `day` (null clears it), one undo step. */
      setDate(ids: readonly string[], day: Date | null) {
        retitle(ids, (text) => withTitleDate(text, day));
      },
      /** Repeat ▸: every target's first date repeats by `repeat` (undefined: once), one undo step. */
      setRepeat(ids: readonly string[], repeat: DateRepeat | undefined) {
        retitle(ids, (text) => withTitleRepeat(text, repeat));
      },
      setColor(ids: readonly string[], color: OutlineColor | undefined) {
        updateData(ids, (node) => clean({ ...node.data, color }));
      },
      /** Show items as a board, an article, a mind map, or as the outline ("list": no field). */
      setView(ids: readonly string[], view: OutlineItemView) {
        const value =
          view === "board" || view === "article" || view === "mindmap" ? view : undefined;
        updateData(ids, (node) => clean({ ...node.data, view: value }));
      },
      toggleNumbered(ids: readonly string[]) {
        const on = !ids.every((id) => nodeOf(id)?.data?.numbered);
        updateData(ids, (node) => clean({ ...node.data, numbered: on }));
      },
      /** Copies right after the last item; the copies become the target ("result" policy). */
      duplicate(ids: readonly string[]) {
        const last = ids.at(-1);
        if (!last) return;
        const clone = (node: OutlineItem): OutlineItem => ({
          ...node,
          id: createOutlineId(),
          ...(node.children ? { children: node.children.map(clone) } : {}),
        });
        pasteNodes(
          ids
            .map(nodeOf)
            .filter(Boolean)
            .map((node) => clone(node!)),
          last,
          "result",
        );
      },
      /** Indent or outdent `ids`: "moved", "refused" (policy — it toasts on its own) or "noop". */
      shift(ids: readonly string[], direction: "indent" | "outdent"): "moved" | "refused" | "noop" {
        const before = nodesNow();
        const next = dispatch({ type: direction, ids });
        return next.refusal ? "refused" : next.nodes !== before ? "moved" : "noop";
      },
      /**
       * Deletes `ids` and selects the nearest surviving visible row, so the cursor never falls
       * off the list. Reports what went: top-level items and their descendants (0 when refused).
       */
      remove(ids: readonly string[]): {
        readonly items: number;
        readonly descendants: number;
        readonly selected: string | null;
      } {
        const rows = shownRows();
        const before = latestEditor(store.current);
        const roots = selectionRoots(before.nodes, new Set(ids));
        const descendants = roots.reduce((sum, id) => {
          const node = findOutlineNode(before.nodes, id)?.node as OutlineItem | undefined;
          return sum + (node ? summarize(node).descendants : 0);
        }, 0);
        const next = dispatch({ type: "delete", ids });
        if (next.refusal || next.nodes === before.nodes)
          return { items: 0, descendants: 0, selected: null };
        // The "neighbour" select policy (target.ts): next visible survivor, else the previous one.
        const neighbour = neighbourOf(
          rows,
          new Set(ids),
          (id) => !!findOutlineNode(next.nodes, id),
        );
        if (neighbour) dispatch({ type: "select", id: neighbour });
        return { items: roots.length, descendants, selected: neighbour };
      },
      /** Move items to the end of `parentId` (null: top level). Returns how many moved (0: refused or nothing). */
      moveTo(ids: readonly string[], parentId: string | null): number {
        const parent = parentId ? nodeOf(parentId) : null;
        const before = nodesNow();
        const result = dispatch({
          type: "drop",
          ids,
          parentId,
          index: (parent ? parent.children : nodesNow())?.length ?? 0,
        });
        if (result.refusal || result.nodes === before) return 0;
        if (parentId) dispatch({ type: "expand", ids: [parentId], expanded: true });
        return selectionRoots(before, new Set(ids)).length;
      },
      /**
       * Place a live mirror of each item at the end of `parentId` (null: top level). A mirror of
       * a mirror (or of a copy inside one) mirrors the original source. Returns the new ids.
       */
      mirrorTo(ids: readonly string[], parentId: string | null): string[] {
        const nodes = nodesNow();
        const parent = parentId ? nodeOf(parentId) : null;
        let index = (parent ? parent.children : nodes)?.length ?? 0;
        const created: string[] = [];
        const insert: OutlineCommand<OutlineItemData>[] = [];
        for (const id of ids) {
          const sourceId = canonicalId(nodes, id) ?? id;
          const mirror = createMirror(nodes, sourceId, createOutlineId());
          if (!mirror) continue;
          created.push(mirror.id);
          insert.push({ type: "insert", parentId, index: index++, node: mirror });
        }
        if (!insert.length) return [];
        const result = dispatch({ type: "transaction", commands: insert });
        if (result.refusal) return [];
        if (parentId) dispatch({ type: "expand", ids: [parentId], expanded: true });
        return created;
      },
      /** Where an item is mirrored (top-level mirror ids). */
      mirrorsOf(id: string) {
        return mirrorsOfSource(nodesNow(), id);
      },
      /** Ids of the items that link here with `[[label|id]]`, in document order. */
      backlinks(id: string): readonly string[] {
        const nodes = nodesNow();
        return (
          linkIndexOf(nodes)
            .get(canonicalId(nodes, id) ?? id)
            ?.slice()
            .reverse() ?? []
        );
      },
      /** The id that names an item for links and bookmarks: a mirror (or a copy in one) names its source. */
      identityOf(id: string): string {
        return canonicalId(nodesNow(), id) ?? id;
      },
      sortChildren: sort,
      addChild(parentId: string | null, text = "") {
        const id = createOutlineId();
        const parent = parentId ? nodeOf(parentId) : null;
        dispatch({
          type: "insert",
          id,
          parentId,
          index: (parent ? parent.children : nodesNow())?.length ?? 0,
          text,
        });
        return id;
      },
      exportAs(format: OutlineExportFormat, ids?: readonly string[]) {
        const nodes = ids?.length ? (ids.map(nodeOf).filter(Boolean) as OutlineItem[]) : nodesNow();
        return exportOutline(nodes, format);
      },
      /** Markdown for another app's clipboard: no metadata comments (see interchange.ts). */
      copyMarkdown(ids?: readonly string[]) {
        const nodes = ids?.length ? (ids.map(nodeOf).filter(Boolean) as OutlineItem[]) : nodesNow();
        return exportOutline(nodes, "markdown", { metadata: false });
      },
      /** A rename-safe link to an item, in the outline's own `[[label|id]]` form. */
      linkTo(id: string) {
        const node = nodeOf(id);
        // A copy inside a mirror dies with the mirror: link to the item it shows. In a workspace
        // the link names its document too, so it works pasted anywhere.
        const target = canonicalId(nodesNow(), id) ?? id;
        const external = optionsRef.current.externalLinks;
        return linkMarkup(node?.text ?? "", external ? external.qualify(target) : target);
      },
      /** Lossless paste from our own clipboard flavor; ids are regenerated. Null when not ours. */
      importJSON,
      /** Rich clipboard flavor for other apps: nested lists with formatting (links resolve to titles). */
      exportHtml(ids: readonly string[]) {
        const nodes = ids.map(nodeOf).filter(Boolean) as OutlineItem[];
        return exportOutlineHtml(nodes, (id) => {
          const target = nodeOf(id);
          return target ? inlineToPlain(target.text, undefined, { dates: "absolute" }) : null;
        });
      },
      /** Paste of another app's HTML (doc editors, note apps, the web): parsed inertly, never rendered. */
      importHtml(html: string, afterId?: string, select: SelectPolicy = "keep") {
        const nodes = importOutlineHtml(html);
        if (nodes.length) pasteNodes(nodes, afterId, select);
        return nodes.length;
      },
      importText(text: string, afterId?: string, select: SelectPolicy = "keep") {
        // A downloaded .json document is ours: lossless, identity-keeping.
        if (looksLikeOutlineJSON(text)) {
          const count = importJSON(text, afterId);
          if (count !== null) return count;
        }
        const nodes = importOutline(text);
        if (nodes.length) pasteNodes(nodes, afterId, select);
        return nodes.length;
      },
      /* ── Bookmarks: starred items and saved searches (host-persisted) ── */
      toggleBookmark(rawId: string) {
        // Starring a mirror (or a copy in one) stars the item it shows: copies die with the mirror.
        const id = canonicalId(nodesNow(), rawId) ?? rawId;
        let added = false;
        updateBookmarks((current) => {
          added = !current.items.includes(id);
          return {
            ...current,
            items: added ? [...current.items, id] : current.items.filter((item) => item !== id),
          };
        });
        return added;
      },
      saveSearch(query: string, label?: string) {
        const trimmed = query.trim();
        if (!trimmed) return;
        updateBookmarks((current) =>
          current.searches.some((saved) => saved.query === trimmed)
            ? current
            : {
                ...current,
                searches: [
                  ...current.searches,
                  label ? { query: trimmed, label } : { query: trimmed },
                ],
              },
        );
      },
      removeSearch(query: string) {
        updateBookmarks((current) => ({
          ...current,
          searches: current.searches.filter((saved) => saved.query !== query),
        }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowIndex = rowIndexCache.current.get(rows) ?? new Map(rows.map((row, i) => [row.id, i]));
  const lockedPath = (id: string, nodes: readonly OutlineItem[]) =>
    !!isLocked && getOutlinePath(nodes, id).some((node) => isLocked(node as OutlineItem));
  return {
    state,
    dispatch,
    rows,
    /** Position of each visible row by id (stable while typing). */
    rowIndex,
    view,
    setView,
    search,
    /** #tags and @mentions by frequency. Lazy: typing never pays for the inventory. */
    get tags() {
      return tagsOf(state.nodes);
    },
    hoisted: hoisted as OutlineItem | undefined,
    breadcrumbs,
    commands,
    readOnly,
    bookmarks,
    /** Links to and from other documents (a workspace host); undefined in a single document. */
    external,
    /** The last controlled veto (null until one happens). */
    rejection,
    /** Content revision this render shows (see RowField's typing draft). */
    renderedSeq,
    /** Newest content revision, including edits not rendered yet. */
    currentSeq: () => seq.current,
    /** The top undo entry right now: an Undo offer is only honest while this is unchanged. */
    historyTop: () => latestEditor(store.current).history.past.at(-1),
    /** Both ends of history right now: what an undo and a redo would travel. */
    historyStacks: () => {
      const { past, future } = latestEditor(store.current).history;
      return { undo: past.at(-1), redo: future.at(-1) };
    },
    latestSelection: () => latestEditor(store.current).selection,
    /** The newest editor state (selection, caret, folds) for handlers that run before a render. */
    latestState: () => latestEditor(store.current),
    /** The last action that changed content, numbered (null before any): the touch adapter's cue. */
    lastEdit: () => lastEdit.current,
    /** The newest document (what the next edit builds on), for imperative reads. */
    latestNodes: () => latestEditor(store.current).nodes as readonly OutlineItem[],
    /** Whether an item (or one of its ancestors) is locked by the host's policy. */
    isItemLocked: (id: string) => lockedPath(id, state.nodes),
    /**
     * A row for any item: the visible one, or one made from the document for items the outline is
     * not showing (a board's cards, a folded item), so menus and the phone sheet work on them too.
     */
    rowOf: (id: string): OutlinerRow | null => {
      const visible = rows[rowIndex.get(id) ?? -1];
      if (visible) return visible;
      const location = findOutlineNode(state.nodes, id);
      if (!location) return null;
      return rowForNode(location.node as OutlineItem, {
        parentId: location.parentId ?? null,
        depth: location.ancestors.length,
        locked: lockedPath(id, state.nodes),
      });
    },
    canUndo: options.collaboration?.canUndo ?? state.history.past.length > 0,
    canRedo: options.collaboration?.canRedo ?? state.history.future.length > 0,
    reportField: (event: OutlineFieldEvent) =>
      optionsRef.current.collaboration?.onFieldEvent?.(event),
    /** Rows a filter would hide that stay because they are still the target (target.ts). */
    linger: linger.current,
    /** A board or mind map registers how its cursor travels while it is on screen (null: back to the list). */
    setViewNav: (nav: ViewNav | null) => {
      viewNav.current = nav;
    },
    /** The registered view's travel, else null (the list). */
    viewNav: () => viewNav.current,
    /** What the target resolves against: the view on screen (board, mind map) or the list. */
    viewRows: (): TargetRows =>
      viewNav.current ? navRows(viewNav.current.visibleIds()) : { rows, rowIndex },
  };
}

export type OutlinerController = ReturnType<typeof useOutliner>;

/** A projection row for a node the outline is not listing (board cards and columns). */
export function rowForNode(
  node: OutlineItem,
  at: {
    readonly parentId: string | null;
    readonly depth: number;
    readonly locked: boolean;
    readonly index?: number;
  },
): OutlinerRow {
  return {
    id: node.id,
    node,
    parentId: at.parentId,
    depth: at.depth,
    index: at.index ?? 0,
    hasChildren: !!node.children?.length,
    expanded: true,
    details: getOutlineItemDetails(node),
    completed: isCompleted(node),
    locked: at.locked,
    mirror: mirrorOf(node),
  };
}
