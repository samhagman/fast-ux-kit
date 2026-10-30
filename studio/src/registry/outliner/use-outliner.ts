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
} from "@fux/core";
import {
  NO_BOOKMARKS,
  type OutlineBookmarks,
  type OutlineColor,
  type OutlineExportFormat,
  type OutlineItem,
  type OutlineItemData,
  type OutlineNoteDisplay,
} from "./types";
import { exportOutline, exportOutlineHtml, idsInPasteOrder, importOutline, importOutlineHtml, linkMarkup, looksLikeOutlineJSON, reidentify } from "./interchange";
import { dayNumber, firstDay, outgoingLinks, outlinerDetails, searchOutliner, searchSuggestions } from "./search-filters";
import { canonicalId, createMirror, hasMirrors, mirrorOf, mirrorsOfSource, syncMirrors } from "./mirrors";
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
} from "./controlled-outline";
import { formatDateToken, inlineToPlain, nextOccurrence, parseInline, repeatFor } from "./inline";

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
export type OutlineValueChangeHandler = (nodes: readonly OutlineItem[], meta: OutlineValueChangeEvent) => boolean | void;

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
  readonly summary?: { readonly descendants: number; readonly done: number; readonly tasks: number };
  /** How many items link here with `[[label|id]]` (backlinks). */
  readonly backlinks?: number;
  /** The row is a mirror (its source id), or a copy inside a mirror ("copy"). */
  readonly mirror?: string;
  /** Agenda view: this row opens a date group. */
  readonly agenda?: { readonly group: AgendaGroup; readonly count: number };
}

export type AgendaGroup = "overdue" | "today" | "tomorrow" | "week" | "later" | "earlier" | "none";
const AGENDA_ORDER: readonly AgendaGroup[] = ["overdue", "today", "tomorrow", "week", "later", "earlier", "none"];
export function agendaGroupOf(node: OutlineItem, today: number): AgendaGroup {
  const day = firstDay(node);
  if (day === null) return "none";
  if (day < today) return isCompleted(node) ? "earlier" : "overdue";
  return day === today ? "today" : day === today + 1 ? "tomorrow" : day <= today + 6 ? "week" : "later";
}

/** Search results; `pending` while a half-typed last token is held back (see `search`). */
export type OutlinerSearch = OutlineSearchResult & { readonly pending?: boolean };

export interface OutlinerView {
  readonly query: string;
  readonly searchMode: "filter" | "flat" | "agenda";
  readonly hideCompleted: boolean;
  readonly noteDisplay: OutlineNoteDisplay;
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
const summaryCache = new WeakMap<OutlineItem, { descendants: number; tasks: number; done: number }>();
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

const DEV = !!import.meta.env?.DEV;
/** How long a dev build waits for a controlled host to answer before it explains the contract. */
export const UNANSWERED_WARNING_MS = 5000;

const sameRanges = (a: readonly { start: number; end: number }[], b: readonly { start: number; end: number }[]) =>
  a === b || (a.length === b.length && a.every((range, i) => range.start === b[i]!.start && range.end === b[i]!.end));
const sameMatch = (a: OutlinerRow["match"], b: OutlinerRow["match"]) =>
  a === b || (!!a && !!b && sameRanges(a.titleRanges, b.titleRanges) && sameRanges(a.noteRanges, b.noteRanges));
const samePath = (a?: readonly string[], b?: readonly string[]) =>
  a === b || (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((part, i) => part === b![i]);

/**
 * Whether two trees have the same shape (ids in the same places, numbering unchanged), collecting
 * the nodes that were replaced, parents before children. Identical subtrees are skipped whole.
 */
function sameShape(a: readonly OutlineItem[], b: readonly OutlineItem[], changed: OutlineItem[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const before = a[i]!,
      after = b[i]!;
    if (before === after) continue;
    if (before.id !== after.id || !!before.data?.numbered !== !!after.data?.numbered) return false;
    // A new or removed [[link]] changes another row's backlink count: take the full walk.
    if (outgoingLinks(before) !== outgoingLinks(after) && outgoingLinks(before).join() !== outgoingLinks(after).join()) return false;
    if (mirrorOf(before) !== mirrorOf(after)) return false;
    changed.push(after);
    if (!sameShape(before.children ?? NO_CHILDREN, after.children ?? NO_CHILDREN, changed)) return false;
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
const linkIndexCache = new WeakMap<readonly OutlineItem[], ReadonlyMap<string, readonly string[]>>();
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
  for (const [key, entry] of Object.entries(data)) if (entry !== undefined && entry !== false) out[key] = entry;
  return Object.keys(out).length ? (out as OutlineItemData) : undefined;
};

/**
 * Completing a task whose title carries a recurring date (`!(2026-11-03 every week)`) moves the
 * date to its next occurrence instead (the usual recurring-task behaviour). Returns the new title, or
 * null when the title has no recurring date.
 */
export function advanceRecurring(text: string, now = new Date()): { text: string; next: Date } | null {
  let out = "";
  let at = 0;
  let next: Date | null = null;
  for (const segment of parseInline(text)) {
    if (segment.kind !== "date" || !segment.date?.repeat) continue;
    const date = nextOccurrence(segment.date, now);
    if (segment.date.hasTime) date.setHours(segment.date.value.getHours(), segment.date.value.getMinutes(), 0, 0);
    // A clamped month end keeps its intended day (`every month on 31`) for the step after.
    const repeat = repeatFor(date, segment.date.repeat, segment.date.repeat.day ?? segment.date.value.getDate());
    out += text.slice(at, segment.start) + formatDateToken(date, segment.date.hasTime, repeat);
    at = segment.end;
    next ??= date;
  }
  return next ? { text: out + text.slice(at), next } : null;
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
    const renameSet = (ids: ReadonlySet<string>) => (sync.renames.size ? new Set([...ids].map(rename)) : ids);
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

/** The studio-layer rules for one edit: stamp what changed, then keep mirrors in sync. */
export function outlinerAfterEdit(isLocked: UseOutlinerOptions["isLocked"], trackEdits = true): OutlineAfterEdit {
  const mirror = mirrorAfterEdit(isLocked);
  return (before, after, action) => {
    const nodes = trackEdits ? stampEdits(before.nodes, after.nodes) : after.nodes;
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
  return keys.length === Object.keys(right).length && keys.every((key) => (left as Record<string, unknown>)[key] === (right as Record<string, unknown>)[key]);
};
/**
 * History-lite: every edited item gets `data.editedAt` (epoch ms; new items also `createdAt`),
 * the fields the core's details, sort ("edited") and the `changed:` search read. Diffed along
 * identity (untouched subtrees are skipped whole); a moved item is not an edit.
 */
export function stampEdits(before: readonly OutlineItem[], after: readonly OutlineItem[], now = Date.now()): readonly OutlineItem[] {
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
  const list = (items: readonly OutlineItem[], previous: readonly OutlineItem[] | undefined): readonly OutlineItem[] => {
    if (items === previous) return items;
    const siblings = new Map((previous ?? []).map((node) => [node.id, node]));
    let changed = false;
    const out = items.map((node) => {
      const prior = siblings.get(node.id) ?? lookup(node.id);
      if (prior === node) return node;
      const children = node.children ? list(node.children, prior?.children) : undefined;
      let next = children === node.children ? node : { ...node, children: children! };
      if (!prior || !sameContent(prior, node)) {
        const data = next.data ?? {};
        const fresh = typeof data.editedAt === "number" && now - data.editedAt >= 0 && now - data.editedAt < STAMP_WINDOW_MS;
        if (!fresh || (!prior && data.createdAt === undefined))
          next = { ...next, data: { ...data, editedAt: fresh ? data.editedAt : now, ...(!prior && data.createdAt === undefined ? { createdAt: now } : {}) } };
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
  if (controlled && options.defaultValue !== undefined) warn("both", "both `value` and `defaultValue` were passed; `value` wins (controlled). Remove one.");

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
  const afterEdit = React.useMemo(() => outlinerAfterEdit(isLocked, trackEdits), [isLocked, trackEdits]);
  const afterEditRef = React.useRef(afterEdit);
  afterEditRef.current = afterEdit;

  // The host's answer to this render's `value`: echo (commit), external (one step), or nothing yet.
  const incoming = options.value;
  const reconciled = React.useMemo(
    () => (incoming === undefined ? null : reconcileOutline(store.current, incoming, editorOptions.current)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [incoming, version],
  );
  // What renders: the newest pending proposal (optimistic, the default) or only what the host
  // echoed. Uncontrolled there is nothing pending, so both are the editor itself.
  const optimistic = options.optimistic !== false;
  const current = reconciled?.state ?? store.current;
  const state = optimistic ? latestEditor(current) : current.editor;
  const renderedSeq = seq.current;
  React.useLayoutEffect(() => {
    // The render above already shows the answer; only the store catches up (no second render).
    if (reconciled && reconciled.state !== store.current) store.current = reconciled.state;
    if (reconciled?.outcome === "invalid") warn("invalid", "`value` is not a valid outline (duplicate or missing ids); it was ignored.");
  });

  /**
   * The last veto, for the notice ("Change not accepted", announced): `count` proposals (edits)
   * were rolled back. `seq` changes on every veto so the same count twice still notifies.
   */
  const [rejection, setRejection] = React.useState<{ readonly seq: number; readonly count: number } | null>(null);
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
  const dispatch = React.useCallback((action: OutlineAction<OutlineItemData>, options?: { readonly afterPaint?: boolean }): OutlineEditor => {
    const isControlled = optionsRef.current.value !== undefined;
    const id = nextId.current++;
    const step = stepOutline(store.current, action, editorOptions.current, isControlled, id, afterEditRef.current);
    if (step.state === store.current) return step.result;
    if (step.proposal) seq.current++;
    store.current = step.state;
    if (options?.afterPaint) renderSoon();
    else bump();
    if (step.proposal) {
      const answer = optionsRef.current.onValueChange?.(step.result.nodes, { ...step.proposal.meta, reject: () => rejectProposal(id) });
      if (isControlled && answer === false) rejectProposal(id);
    }
    return step.result;
  }, [rejectProposal, renderSoon]);

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

  /*
   * A half-typed last token (`due:`, `before:2026-1`, `is:todo du`) is unfinished, not wrong:
   * the results of the query without it are held (no flash of "invalid" or "no matches") while
   * the help strip offers completions. A colon-less word ("du") still searches as text unless
   * that finds nothing, in which case it reads as an operator being typed.
   */
  const search = React.useMemo<OutlinerSearch | null>(() => {
    const query = view.query.trim();
    if (!query) return null;
    const run = (q: string) => searchOutliner(state.nodes, q, { scopeId: state.hoistedId ?? undefined, maxResults: 2000 });
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
  const [ownBookmarks, setOwnBookmarks] = React.useState<OutlineBookmarks>(() => options.defaultBookmarks ?? NO_BOOKMARKS);
  const bookmarks = options.bookmarks ?? ownBookmarks;
  const bookmarksRef = React.useRef(bookmarks);
  bookmarksRef.current = bookmarks;
  const updateBookmarks = React.useCallback((change: (current: OutlineBookmarks) => OutlineBookmarks) => {
    const next = change(bookmarksRef.current);
    if (next === bookmarksRef.current) return;
    bookmarksRef.current = next;
    if (optionsRef.current.bookmarks === undefined) setOwnBookmarks(next);
    optionsRef.current.onBookmarksChange?.(next);
  }, []);

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
      return map.get(id);
    };
  }, [state.nodes]);
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
    readonly rows: readonly OutlinerRow[];
    readonly index: ReadonlyMap<string, number>;
    readonly hasRefs: boolean;
  } | null>(null);
  /** Row positions by id; the typing fast path keeps the order, so it keeps the map too. */
  const rowIndexCache = React.useRef(new WeakMap<readonly OutlinerRow[], ReadonlyMap<string, number>>());
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
      last.isLocked === isLocked
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
          const parentLocked = parentRow ? parentRow.locked : prev.locked && !(isLocked?.(prev.node) ?? false);
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
    const keep = (row: Omit<OutlinerRow, "details"> & { details?: OutlineItemDetails }): OutlinerRow => {
      const prev = previous.get(row.id);
      const details = prev && prev.node === row.node ? prev.details : getOutlineItemDetails(row.node);
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

    const links = linkIndexOf(state.nodes);
    if (searching && view.searchMode !== "filter") {
      // Flat results, or the agenda: the same results grouped Overdue / Today / … by first date.
      let ordered = search.matches.map((match) => ({ match, location: findOutlineNode(state.nodes, match.id) }));
      const today = dayNumber(new Date());
      const groupOf = new Map<string, AgendaGroup>();
      if (view.searchMode === "agenda") {
        for (const { match, location } of ordered) if (location) groupOf.set(match.id, agendaGroupOf(location.node as OutlineItem, today));
        const rank = (id: string) => AGENDA_ORDER.indexOf(groupOf.get(id) ?? "none");
        const day = (location?: { node: unknown }) => (location ? (firstDay(location.node as OutlineItem) ?? Infinity) : Infinity);
        ordered = ordered
          .map((entry, order) => ({ ...entry, order }))
          .sort((a, b) => rank(a.match.id) - rank(b.match.id) || day(a.location) - day(b.location) || a.order - b.order);
      }
      const counts = new Map<AgendaGroup, number>();
      for (const group of groupOf.values()) counts.set(group, (counts.get(group) ?? 0) + 1);
      let lastGroup: AgendaGroup | null = null;
      for (const { match, location } of ordered) {
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
          locked: !!isLocked && [...location.ancestors, node].some((n) => isLocked(n as OutlineItem)),
          match,
          path: location.ancestors.map((ancestor) => inlineToPlain(ancestor.text)),
          backlinks: links.get(node.id)?.length,
          mirror: mirrorOf(node),
          agenda: opens ? { group: group!, count: counts.get(group!) ?? 0 } : undefined,
        });
      }
      rowCache.current = next;
      projection.current = null;
      return out;
    }

    const hoistLocked =
      !!isLocked && !!state.hoistedId && getOutlinePath(state.nodes, state.hoistedId).some((node) => isLocked(node as OutlineItem));
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
    const sourceLocked = (id: string) => !!isLocked && getOutlinePath(state.nodes, id).some((node) => isLocked(node as OutlineItem));
    const walk = (items: readonly OutlineItem[], depth: number, parent: OutlineItem | null, parentLocked: boolean, copyPrefix: string | null) => {
      let ordinal = 0;
      const shown = items.filter(
        (node) =>
          !(searching && !matches.has(node.id) && !contextIds.has(node.id)) &&
          !(view.hideCompleted && isCompleted(node) && !matches.has(node.id)),
      );
      for (const node of shown) {
        const completed = isCompleted(node);
        const hasChildren = !!node.children?.length;
        const expanded = searching
          ? contextIds.has(node.id) || (hasChildren && state.expandedIds.has(node.id))
          : hasChildren && state.expandedIds.has(node.id);
        const source = copyPrefix === null ? mirrorOf(node) : undefined;
        const canonical = copyPrefix !== null && node.id.startsWith(copyPrefix) ? nodeById(node.id.slice(copyPrefix.length)) : undefined;
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
          context: searching ? !matches.has(node.id) : undefined,
          match: matches.get(node.id),
          summary: hasChildren && !expanded ? summarize(node) : undefined,
          // A mirror or a copy in one shows its source's backlinks (it is the same item).
          backlinks: links.get(source ?? (copyPrefix !== null && node.id.startsWith(copyPrefix) ? node.id.slice(copyPrefix.length) : node.id))?.length,
          mirror: source ?? (copyPrefix !== null ? "copy" : undefined),
        });
        if (expanded && node.children) walk(node.children, depth + 1, node, locked, source ? node.id + "~" : copyPrefix);
      }
    };
    const hoistMirror = hoisted && hasMirrors([hoisted]) ? hoistedCopyPrefix(state.nodes, hoisted.id) : null;
    walk(hoisted ? (hoisted.children ?? []) : state.nodes, 0, hoisted ?? null, hoistLocked, hoistMirror);
    rowCache.current = next;
    const index = new Map(out.map((row, i) => [row.id, i]));
    rowIndexCache.current.set(out, index);
    // Only an unfiltered projection can be patched by later keystrokes.
    projection.current = searching
      ? null
      : { nodes: state.nodes, expandedIds: state.expandedIds, hoistedId: state.hoistedId, view, isLocked, rows: out, index, hasRefs: out.some((row) => row.refKey !== undefined) };
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.nodes, state.expandedIds, state.hoistedId, hoisted, search, view, isLocked, titlesFor]);


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
    const updateData = (ids: readonly string[], patch: (node: OutlineItem) => OutlineItemData | undefined) =>
      dispatch({
        type: "transaction",
        commands: ids.flatMap((id): OutlineCommand<OutlineItemData>[] => {
          const node = nodeOf(id);
          if (!node) return [];
          return [{ type: "update", id, changes: { data: patch(node) } }];
        }),
      });
    const sort = (parentId: string | null, by: OutlineSortKey, direction: "ascending" | "descending" = "ascending") => {
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
        return candidate;
      });
      if (!nodes.length) return 0;
      const before = nodesNow();
      const next = dispatch({ type: "paste-nodes", afterId, nodes, createId: idsInPasteOrder(nodes) });
      if (next.refusal || next.nodes === before) return 0;
      // Select what was pasted, so the next paste (or ⌘Z, Tab, Delete) acts on it — not on the last row.
      const first = nodes[0]!.id;
      if (findOutlineNode(next.nodes, first)) dispatch({ type: "select", id: first });
      return nodes.length;
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
              : { type: "update", id: node.id, changes: { data: clean({ ...node.data, completed: target }) } };
          }),
        });
        return { completed: target, advanced };
      },
      toggleCheckbox(ids: readonly string[]) {
        const nodes = ids.map(nodeOf).filter(Boolean) as OutlineItem[];
        const add = nodes.some((node) => node.checked === undefined);
        dispatch({
          type: "transaction",
          commands: nodes.map((node) => ({
            type: "update",
            id: node.id,
            changes: add
              ? { checked: node.checked ?? node.data?.completed === true, data: clean({ ...node.data, completed: undefined }) }
              : { checked: null, data: clean({ ...node.data, completed: node.checked === true }) },
          })),
        });
      },
      setHeading(ids: readonly string[], heading: 1 | 2 | 3 | undefined) {
        updateData(ids, (node) => clean({ ...node.data, heading }));
      },
      setColor(ids: readonly string[], color: OutlineColor | undefined) {
        updateData(ids, (node) => clean({ ...node.data, color }));
      },
      toggleNumbered(ids: readonly string[]) {
        const on = !ids.every((id) => nodeOf(id)?.data?.numbered);
        updateData(ids, (node) => clean({ ...node.data, numbered: on }));
      },
      duplicate(ids: readonly string[]) {
        const last = ids.at(-1);
        if (!last) return;
        const clone = (node: OutlineItem): OutlineItem => ({
          ...node,
          id: createOutlineId(),
          ...(node.children ? { children: node.children.map(clone) } : {}),
        });
        dispatch({
          type: "paste-nodes",
          afterId: last,
          nodes: ids.map(nodeOf).filter(Boolean).map((node) => clone(node!)),
          createId: createOutlineId,
        });
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
      remove(ids: readonly string[]): { readonly items: number; readonly descendants: number; readonly selected: string | null } {
        const { rows } = latest.current;
        const before = latestEditor(store.current);
        const roots = selectionRoots(before.nodes, new Set(ids));
        const descendants = roots.reduce((sum, id) => {
          const node = findOutlineNode(before.nodes, id)?.node as OutlineItem | undefined;
          return sum + (node ? summarize(node).descendants : 0);
        }, 0);
        const next = dispatch({ type: "delete", ids });
        if (next.refusal || next.nodes === before.nodes) return { items: 0, descendants: 0, selected: null };
        const removed = new Set(ids);
        const gone = (row: OutlinerRow) => !findOutlineNode(next.nodes, row.id) || removed.has(row.id);
        const first = rows.findIndex((row) => removed.has(row.id));
        const neighbour =
          rows.slice(first + 1).find((row) => !gone(row)) ?? rows.slice(0, Math.max(first, 0)).reverse().find((row) => !gone(row));
        if (neighbour) dispatch({ type: "select", id: neighbour.id });
        return { items: roots.length, descendants, selected: neighbour?.id ?? null };
      },
      moveTo(ids: readonly string[], parentId: string | null) {
        const parent = parentId ? nodeOf(parentId) : null;
        dispatch({ type: "drop", ids, parentId, index: (parent ? parent.children : nodesNow())?.length ?? 0 });
        if (parentId) dispatch({ type: "expand", ids: [parentId], expanded: true });
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
        return linkIndexOf(nodes).get(canonicalId(nodes, id) ?? id)?.slice().reverse() ?? [];
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
      /** A rename-safe link to an item, in the outline's own `[[label|id]]` form. */
      linkTo(id: string) {
        const node = nodeOf(id);
        // A copy inside a mirror dies with the mirror: link to the item it shows.
        return linkMarkup(node?.text ?? "", canonicalId(nodesNow(), id) ?? id);
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
      importHtml(html: string, afterId?: string) {
        const nodes = importOutlineHtml(html);
        if (nodes.length) dispatch({ type: "paste-nodes", afterId, nodes, createId: createOutlineId });
        return nodes.length;
      },
      importText(text: string, afterId?: string) {
        // A downloaded .json document is ours: lossless, identity-keeping.
        if (looksLikeOutlineJSON(text)) {
          const count = importJSON(text, afterId);
          if (count !== null) return count;
        }
        const nodes = importOutline(text);
        if (nodes.length) dispatch({ type: "paste-nodes", afterId, nodes, createId: createOutlineId });
        return nodes.length;
      },
      /* ── Bookmarks: starred items and saved searches (host-persisted) ── */
      toggleBookmark(rawId: string) {
        // Starring a mirror (or a copy in one) stars the item it shows: copies die with the mirror.
        const id = canonicalId(nodesNow(), rawId) ?? rawId;
        let added = false;
        updateBookmarks((current) => {
          added = !current.items.includes(id);
          return { ...current, items: added ? [...current.items, id] : current.items.filter((item) => item !== id) };
        });
        return added;
      },
      saveSearch(query: string, label?: string) {
        const trimmed = query.trim();
        if (!trimmed) return;
        updateBookmarks((current) =>
          current.searches.some((saved) => saved.query === trimmed)
            ? current
            : { ...current, searches: [...current.searches, label ? { query: trimmed, label } : { query: trimmed }] },
        );
      },
      removeSearch(query: string) {
        updateBookmarks((current) => ({ ...current, searches: current.searches.filter((saved) => saved.query !== query) }));
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rowIndex = rowIndexCache.current.get(rows) ?? new Map(rows.map((row, i) => [row.id, i]));
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
    /** The last controlled veto (null until one happens). */
    rejection,
    /** Content revision this render shows (see RowField's typing draft). */
    renderedSeq,
    /** Newest content revision, including edits not rendered yet. */
    currentSeq: () => seq.current,
    /** The top undo entry right now: an Undo offer is only honest while this is unchanged. */
    historyTop: () => latestEditor(store.current).history.past.at(-1),
    latestSelection: () => latestEditor(store.current).selection,
    /** The newest document (what the next edit builds on), for imperative reads. */
    latestNodes: () => latestEditor(store.current).nodes as readonly OutlineItem[],
    /** Whether an item (or one of its ancestors) is locked by the host's policy. */
    isItemLocked: (id: string) => !!isLocked && getOutlinePath(state.nodes, id).some((node) => isLocked(node as OutlineItem)),
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
  };
}

export type OutlinerController = ReturnType<typeof useOutliner>;
