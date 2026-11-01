import type { FocusReturn } from "./context";
import type { FieldName } from "./target";

/**
 * Where keyboard focus goes. Three small rules, DOM only (no React):
 *
 *   1. A FocusReturn bookmark is taken whenever focus leaves the tree or a field, so every
 *      overlay (search, ⌘K, ⌘O, capture, menus, dialogs, the date picker) can hand it back:
 *
 *        tree ──focusout──▶ { row, id }                       ┐
 *        field ─focusout──▶ { text, id, field, anchor, head } ├─▶ ui.returnFocus() puts it back
 *        ⋯ (touch) ───────▶ { trigger, element }              ┘   (row gone → its neighbour)
 *
 *   2. F6 / ⇧F6 walk the regions of the page part we live in:
 *        sidebar → toolbar → search (when open) → tree → sidebar …
 *
 *   3. Keys that land on <body> belong to an outliner only when it was the last one used, or it
 *      is the only one mounted and not inert. Two outliners on a page never both answer.
 */

/** Read a field's selection as anchor (fixed end) and head (moving end): a backward selection keeps its direction. */
export function fieldReturn(el: HTMLTextAreaElement | HTMLInputElement, id: string, field: FieldName): Extract<FocusReturn, { kind: "text" }> {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? start;
  const backward = el.selectionDirection === "backward";
  return { kind: "text", id, field, anchor: backward ? end : start, head: backward ? start : end };
}

/** The bookmark for an element that is losing focus, or null when it is not a place to come back to. */
export function bookmarkFor(
  el: Element,
  places: { readonly tree: Element | null; readonly cursor: () => string | null; readonly coarse: boolean },
): FocusReturn | null {
  if (places.tree && el === places.tree) {
    const id = places.cursor();
    return id ? { kind: "row", id } : null;
  }
  if (el instanceof HTMLTextAreaElement && el.dataset.field) {
    const id = el.closest<HTMLElement>("[data-row]")?.dataset.row;
    if (id) return fieldReturn(el, id, el.dataset.field === "note" ? "note" : "title");
  }
  // Touch has no tree cursor: an overlay goes back to the control that opened it.
  if (places.coarse && el instanceof HTMLElement && (el.tagName === "BUTTON" || el.getAttribute("role") === "button")) return { kind: "trigger", element: el };
  return null;
}

/**
 * The neighbour of a row that is gone: the next row that was shown after it and still is,
 * else the previous one, else its nearest shown ancestor. `before` is the row list when the
 * bookmark was taken; `shown` asks the live projection.
 */
export function neighbourOf(
  id: string,
  before: readonly { readonly id: string; readonly parentId?: string | null }[],
  shown: (id: string) => boolean,
): string | null {
  const at = before.findIndex((row) => row.id === id);
  if (at < 0) return null;
  for (let i = at + 1; i < before.length; i++) if (shown(before[i]!.id)) return before[i]!.id;
  for (let i = at - 1; i >= 0; i--) if (shown(before[i]!.id)) return before[i]!.id;
  const parents = new Map(before.map((row) => [row.id, row.parentId ?? null]));
  for (let parent = parents.get(id) ?? null; parent; parent = parents.get(parent) ?? null) if (shown(parent)) return parent;
  return null;
}

/* ───────────── F6 regions ───────────── */

export type FocusRegion = "sidebar" | "toolbar" | "search" | "tree";
export const REGION_ORDER: readonly FocusRegion[] = ["sidebar", "toolbar", "search", "tree"];

const FOCUSABLE = "button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex='-1'])";

const usable = (el: Element): el is HTMLElement =>
  el instanceof HTMLElement && el.isConnected && !el.closest("[inert]") && !el.closest("[hidden]") && !el.closest(".hidden");

/** The element a region hands focus to: its marked entry, else itself if focusable, else its first control. */
function entryOf(region: HTMLElement): HTMLElement | null {
  const marked = [...region.querySelectorAll<HTMLElement>("[data-focus-entry]")].find(usable);
  if (marked) return marked;
  if (region.matches(FOCUSABLE)) return region;
  // A region's own controls only, never one of a nested region (the toolbar's search field).
  return [...region.querySelectorAll<HTMLElement>(FOCUSABLE)].find((el) => usable(el) && el.closest("[data-focus-region]") === region) ?? null;
}

/**
 * Move focus to the next (or, `back`, the previous) region from `from`. The scope is the
 * workspace when there is one (its sidebar is a region), else this outliner. Returns false when
 * there is nowhere to go, so the key can stay the browser's.
 */
export function cycleRegion(from: Element, back: boolean): boolean {
  const scope = from.closest("[data-focus-scope]") ?? from.closest("[data-slot=outliner]");
  if (!scope) return false;
  const all = [...scope.querySelectorAll<HTMLElement>("[data-focus-region]")].filter(usable);
  const regions = REGION_ORDER.flatMap((name) => {
    const el = all.find((candidate) => candidate.dataset.focusRegion === name);
    const entry = el && entryOf(el);
    return el && entry ? [{ name, el, entry }] : [];
  });
  if (!regions.length || (regions.length === 1 && regions[0]!.el.contains(from))) return false;
  const current = from.closest<HTMLElement>("[data-focus-region]");
  const at = regions.findIndex((region) => region.el === current);
  const next = at < 0 ? (back ? regions.length - 1 : 0) : (at + (back ? -1 : 1) + regions.length) % regions.length;
  regions[next]!.entry.focus({ preventScroll: true });
  return true;
}

/* ───────────── Who owns keys on <body> ───────────── */

const mounted = new Set<HTMLElement>();

/** Track a mounted outliner root; returns the unregister. */
export function registerOutliner(root: HTMLElement): () => void {
  mounted.add(root);
  return () => mounted.delete(root);
}

/** True when `root` is the only mounted outliner that is not inert (a workspace's hidden documents are). */
export function isSoleOutliner(root: HTMLElement | null): boolean {
  if (!root) return false;
  const live = [...mounted].filter((el) => el.isConnected && !el.closest("[inert]"));
  return live.length === 1 && live[0] === root;
}
