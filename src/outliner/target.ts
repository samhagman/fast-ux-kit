import {
  editorVisibleRows,
  getOutlinePath,
  type OutlineNode,
  type OutlineEditorState,
} from "../core/index.js";

/**
 * What the next key acts on. One answer, used by the row keys, the drawn cursor,
 * `aria-activedescendant`, the filters (linger) and the post-action rules below.
 *
 *   row mode   ids = the selection (in visible order), else [cursor]
 *              cursor = core caret row: the moving end of a range; `clear-selection`
 *              keeps it, folds and zoom repair it (src/core/editor.ts reconcileInteraction)
 *   editing    ids = [caret row], cursor = caret row
 *
 * Pure: no React, no DOM.
 */
export type FieldName = "title" | "note";

export interface Target {
  /** Selection in visible order, else [cursor]. Empty when there is no visible row to act on. */
  readonly ids: readonly string[];
  /** The row the cursor is drawn on (row mode) or the caret row (editing). */
  readonly cursor: string | null;
}

/** The visible rows, as the controller projects them (folds, search, Hide completed, linger). */
export interface TargetRows {
  readonly rows: readonly { readonly id: string }[];
  readonly rowIndex: ReadonlyMap<string, number>;
}

type AnyEditor = OutlineEditorState<unknown>;
const NO_IDS: readonly string[] = [];

export function resolveTarget(state: AnyEditor, view: TargetRows, editing: boolean): Target {
  if (editing) {
    const id = state.caret?.id ?? null;
    return { ids: id ? [id] : NO_IDS, cursor: id };
  }
  const shown = (id: string | null | undefined): id is string => !!id && view.rowIndex.has(id);
  const position = (id: string) => view.rowIndex.get(id)!;
  const selected = [...state.selection].filter(shown).sort((a, b) => position(a) - position(b));
  const caret = state.caret?.id;
  const cursor = shown(caret)
    ? caret
    : shown(state.selectionAnchor)
      ? state.selectionAnchor
      : (selected.at(-1) ?? nearestShown(state, view, caret ?? state.selectionAnchor));
  return { ids: selected.length ? selected : cursor ? [cursor] : NO_IDS, cursor: cursor ?? null };
}

/**
 * The cursor's row is hidden by a filter (a search that no longer matches it, an undo that
 * re-completed it under Hide completed): the nearest shown row in document order, next first.
 */
function nearestShown(
  state: AnyEditor,
  view: TargetRows,
  from: string | null | undefined,
): string | null {
  if (!view.rows.length) return null;
  if (!from) return null;
  const order = editorVisibleRows(state).map((row) => row.id);
  let at = order.indexOf(from);
  if (at < 0) {
    // Folded away or deleted: start from its nearest ancestor that is still in the outline.
    const ancestor = [...getOutlinePath(state.nodes, from)]
      .reverse()
      .find((node) => order.includes(node.id));
    at = ancestor ? order.indexOf(ancestor.id) : -1;
  }
  if (at < 0) return null;
  // The same rule as delete's neighbour: the next shown row, else the previous one.
  for (let i = at; i < order.length; i++) if (view.rowIndex.has(order[i]!)) return order[i]!;
  for (let i = at - 1; i >= 0; i--) if (view.rowIndex.has(order[i]!)) return order[i]!;
  return null;
}

/** The target from core state alone (no projection): what an action is about to act on. */
export function targetIdsOf(state: AnyEditor): readonly string[] {
  if (state.selection.size) return [...state.selection];
  const id = state.caret?.id ?? state.selectionAnchor;
  return id ? [id] : NO_IDS;
}

/* ───────────────────────────── Linger ───────────────────────────── */

/**
 * Rows a filter would hide but the reader is still acting on (Space under Hide completed, an
 * edited search match). A controller input to the row projection.
 *
 * - A target row joins when an edit changes content while a filter is active.
 * - The set shrinks to what is still targeted (or still on the path to the target: ↓ from a
 *   lingering parent into its children keeps the parent) whenever the target moves, so moving
 *   the cursor off a lingering row lets it hide.
 * - A new session (query, Hide completed, search mode, zoom) or a remote replacement drops it.
 * - Undo/redo never adds to it: a row undone back into matching shows on its own.
 */
export interface LingerState {
  readonly session: string;
  readonly ids: ReadonlySet<string>;
}
export const NO_LINGER: LingerState = { session: "", ids: new Set() };

export function lingerSession(
  view: { readonly query: string; readonly hideCompleted: boolean; readonly searchMode: string },
  hoistedId: string | null,
): string {
  const query = view.query.trim();
  // No filter, no session: nothing can hide, so nothing lingers.
  if (!query && !view.hideCompleted) return "";
  return `${query}\u0000${view.hideCompleted ? 1 : 0}\u0000${view.searchMode}\u0000${hoistedId ?? ""}`;
}

/** The linger set after one dispatch. Returns `linger` itself when nothing changed. */
export function nextLinger(
  linger: LingerState,
  session: string,
  change: {
    readonly kind: "edit" | "history" | "replace" | "view";
    readonly before: readonly string[];
    readonly after: readonly string[];
    /** Ids an `after` row needs shown to be seen (its ancestors). */
    readonly afterPaths?: (ids: readonly string[]) => Iterable<string>;
  },
): LingerState {
  if (!session || change.kind === "replace")
    return !linger.ids.size && linger.session === session ? linger : { session, ids: new Set() };
  const base = linger.session === session ? linger.ids : new Set<string>();
  let ids: Set<string>;
  if (change.kind === "edit") ids = new Set([...base, ...change.before, ...change.after]);
  else {
    if (!base.size) return linger.session === session ? linger : { session, ids: base };
    const kept = new Set([...change.after, ...(change.afterPaths?.(change.after) ?? [])]);
    ids = new Set([...base].filter((id) => kept.has(id)));
  }
  if (
    linger.session === session &&
    ids.size === linger.ids.size &&
    [...ids].every((id) => linger.ids.has(id))
  )
    return linger;
  return { session, ids };
}

/** Linger ids plus every ancestor they need to be seen (a completed parent, a non-matching path). */
export function lingerPaths(
  nodes: readonly OutlineNode<unknown>[],
  linger: ReadonlySet<string>,
): { readonly shown: ReadonlySet<string>; readonly ancestors: ReadonlySet<string> } {
  const shown = new Set<string>(),
    ancestors = new Set<string>();
  for (const id of linger) {
    const path = getOutlinePath(nodes, id);
    if (!path.length) continue;
    for (const node of path.slice(0, -1)) {
      shown.add(node.id);
      ancestors.add(node.id);
    }
    shown.add(id);
  }
  return { shown, ancestors };
}

/* ───────────────────────────── After an action ───────────────────────────── */

/**
 * Where the target goes after a command:
 *   keep       the selection survives the edit (the core keeps selection ∩ live ids). The default.
 *   result     paste and duplicate select what they created.
 *   neighbour  delete selects the next visible survivor, else the previous one.
 */
export type SelectPolicy = "keep" | "result" | "neighbour";

/** Top-level ids present in `after` but not in `before`, in document order. */
export function createdRoots(
  before: readonly OutlineNode<unknown>[],
  after: readonly OutlineNode<unknown>[],
): string[] {
  const old = new Set<string>();
  const stack = [...before];
  while (stack.length) {
    const node = stack.pop()!;
    old.add(node.id);
    if (node.children) stack.push(...node.children);
  }
  const roots: string[] = [];
  const walk = (items: readonly OutlineNode<unknown>[]) => {
    for (const node of items) {
      if (!old.has(node.id)) roots.push(node.id);
      else if (node.children) walk(node.children);
    }
  };
  walk(after);
  return roots;
}

/** The "neighbour" rule over the rows shown before the delete: next survivor, else previous. */
export function neighbourOf(
  rows: readonly { readonly id: string }[],
  removed: ReadonlySet<string>,
  survives: (id: string) => boolean,
): string | null {
  const first = rows.findIndex((row) => removed.has(row.id));
  const alive = (row: { readonly id: string }) => !removed.has(row.id) && survives(row.id);
  return (
    (rows.slice(first + 1).find(alive) ?? rows.slice(0, Math.max(first, 0)).reverse().find(alive))
      ?.id ?? null
  );
}

/* ───────────────────────────── Views ───────────────────────────── */

/**
 * How the cursor travels in a view. The list, the board and the mind map each give one; the
 * shared row handler (row-keys.ts) runs the same FIXED_KEYS, chords and registry commands on all
 * three and asks the view only where the cursor goes next.
 *
 *   visibleIds   what the view shows, in its reading order: the target resolves against it and
 *                only these rows can linger.
 *   next         the row an arrow (or Home/End) lands on, null when there is nowhere to go.
 *                left/right are visual (the view mirrors them for right-to-left).
 *   foldAt       the fold ←/→ opens or closes before it travels (list, mind map), else null.
 *   leaves       fixed commands the view gives back to the browser (Tab on a board: a card
 *                never nests under another).
 */
export type NavDirection = "up" | "down" | "left" | "right" | "first" | "last";
export interface ViewNav {
  readonly view: "list" | "board" | "mindmap";
  visibleIds(): readonly string[];
  next(id: string | null, dir: NavDirection): string | null;
  foldAt?(id: string, dir: "left" | "right"): string | null;
  readonly leaves?: ReadonlySet<string>;
}

/** A view's visible order as target rows (for resolveTarget). */
export function navRows(ids: readonly string[]): TargetRows {
  return {
    rows: ids.map((id) => ({ id })),
    rowIndex: new Map(ids.map((id, index) => [id, index])),
  };
}

/** Rows shown under a filter (Hide completed) plus the lingering targets and the path to them. */
export function lingerShown(
  nodes: readonly OutlineNode<unknown>[],
  linger: LingerState,
): ReadonlySet<string> {
  return linger.ids.size ? lingerPaths(nodes, linger.ids).shown : linger.ids;
}
