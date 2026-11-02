import type * as React from "react";
import type { OutlinerUi } from "./context";
import type { OutlinerController } from "./use-outliner";
import { deleteItems } from "./item-actions";
import { openItemMenu } from "./item-menu";
import { isItemMenuKey, matchFixedKey, matchShortcut } from "./keymap";
import { runEntry, runItemShortcut, toggleFold } from "./shortcut-actions";
import { resolveTarget, type NavDirection, type ViewNav } from "./target";

/**
 * The one row-mode key handler. The list, the board and the mind map all call it with
 * their own `ViewNav`; the keys mean the same everywhere:
 *
 *   remappable chords   keymap → runItemShortcut (registry entries: complete, headings, zoom …)
 *   "/" ⇧F10 ContextMenu the item menu
 *   FIXED_KEYS          Space completes · Enter edits (or opens, where a view can't edit in place)
 *                       ⇧Enter opens the note · Tab/⇧Tab indent · ⌫ deletes · Esc collapses
 *                       arrows/Home/End/Page travel where the view says (nav.next), and ←/→
 *                       open or close a fold first where the view has one (nav.foldAt)
 *
 * A view adds only what is its own (a board's ⌥⇧ arrows move cards across columns, a map's 0
 * fits it) before calling this.
 */
export function onRowKey(event: React.KeyboardEvent, ol: OutlinerController, ui: OutlinerUi, nav: ViewNav, extra?: RowKeyExtras): void {
  if (ui.editing || event.target !== event.currentTarget) return;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key;
  // The one target (target.ts), resolved against what this view shows.
  const target = resolveTarget(ol.state, ol.viewRows(), false);
  const cursor = target.cursor;
  const prevent = () => event.preventDefault();
  const go = (to: string | null, extend = false) => {
    if (!to) return;
    // The drawn cursor stands in for a row a filter hid: a range grows from what you see.
    if (extend && cursor && ol.state.caret?.id !== cursor) ol.dispatch({ type: "select", id: cursor });
    ol.dispatch({ type: "select", id: to, extend });
    (extra?.reveal ?? defaultReveal(ui))(to);
  };
  // Remappable shortcuts first (profile + remaps): moving, folding, zoom, levels, complete …
  const action = mod || event.altKey ? matchShortcut(ui.keymap, event, "row") : null;
  if (action && runItemShortcut(action, { ol, ui, ids: target.ids, rowId: cursor })) {
    prevent();
    return;
  }
  if (mod && key.toLowerCase() === "z") {
    prevent();
    ol.dispatch({ type: event.shiftKey ? "redo" : "undo" });
    return;
  }
  if ((key === "ArrowDown" || key === "ArrowUp") && (event.altKey || mod) && event.shiftKey) {
    // A remapped move key no longer moves; it must not fall through to plain travel either.
    prevent();
    return;
  }
  if (mod && key.toLowerCase() === "a") {
    prevent();
    ol.dispatch({ type: "select-all" });
    return;
  }
  // The item menu: "/" (typed, so ⇧ may be part of it), ⇧F10 and the ContextMenu key.
  if ((key === "/" && !mod && !event.altKey) || isItemMenuKey(event)) {
    if (openItemMenu(ol, ui, { kind: "row" })) prevent();
    return;
  }
  // The keys nobody remaps: one table (keymap.ts FIXED_KEYS), one command each.
  const fixed = matchFixedKey(event);
  if (!fixed || nav.leaves?.has(fixed.command)) return;
  const { command, extend } = fixed;
  const travel = (dir: NavDirection) => {
    prevent();
    go(nav.next(cursor, dir), extend);
  };
  switch (command) {
    case "cursor.down":
      return travel("down");
    case "cursor.up":
      return travel("up");
    case "cursor.first":
      return travel("first");
    case "cursor.last":
      return travel("last");
    case "cursor.pageDown":
    case "cursor.pageUp": {
      const down = command === "cursor.pageDown";
      if (!extra?.page) return travel(down ? "last" : "first");
      prevent();
      go(extra.page(cursor, down ? "down" : "up"), extend);
      return;
    }
    case "cursor.in":
    case "cursor.out": {
      if (!cursor) return;
      prevent();
      // ArrowRight / ArrowLeft as pressed; the view decides what that means in its direction.
      const dir = key === "ArrowRight" ? "right" : "left";
      const fold = nav.foldAt?.(cursor, dir);
      if (fold) toggleFold(ol, ui, fold);
      else go(nav.next(cursor, dir));
      return;
    }
    case "item.edit": {
      if (ol.readOnly) return;
      if (!cursor) {
        // An empty level (a new document, a zoom into a leaf): Enter starts its first item, as
        // the empty state's button does.
        if (ol.rows.length || ol.view.query.trim() || extra?.enter) return;
        prevent();
        const id = ol.commands.addChild(ol.state.hoistedId);
        ol.dispatch({ type: "focus", id });
        ui.setEditing(true);
        return;
      }
      prevent();
      if (extra?.enter) extra.enter(cursor);
      // Back to the caret Esc left, else the end of the title.
      else ui.resumeEditing(cursor);
      return;
    }
    case "item.note": {
      // ⇧Enter: straight into the cursor row's note, as ⇧Enter does from its title.
      if (!cursor || extra?.enter) return;
      if (runEntry("item.note", { ol, ui, ids: [cursor], rowId: cursor })) prevent();
      return;
    }
    case "item.complete":
      // Plain Space only (⌘⇧Space is quick capture). The target stays, so Space again reopens.
      if (!target.ids.length) return;
      prevent();
      ui.announceToggle(ol.commands.toggleComplete(target.ids));
      return;
    case "item.indent":
    case "item.outdent": {
      if (!target.ids.length) return;
      prevent();
      const outdent = command === "item.outdent";
      const outcome = ol.commands.shift(target.ids, outdent ? "outdent" : "indent");
      // Refusals toast on their own; a no-op (nothing to indent under) says so instead of lying.
      // Tab stays indent: where it can't, it says why and how to leave the tree instead.
      if (outcome === "moved") ui.announce(outdent ? ui.labels.outdented : ui.labels.indented);
      else if (outcome === "noop") ui.announce(outdent ? ui.labels.cannotOutdentWhy : ui.labels.cannotIndentWhy);
      return;
    }
    case "item.delete": {
      // The zoomed item is never deleted from inside its own zoom (a mind map's centre).
      const ids = target.ids.filter((id) => id !== ol.state.hoistedId);
      if (!ids.length || ol.readOnly) return;
      prevent();
      deleteItems({ ol, ui }, ids);
      return;
    }
    case "selection.escape": {
      // The Esc ladder in row mode: a range collapses to its cursor, then the search filter
      // clears, then a lone selected row is let go (the cursor stays), then nothing.
      const selected = ol.state.selection.size;
      if (selected > 1) {
        prevent();
        ol.dispatch({ type: "clear-selection" });
      } else if (ol.view.query.trim()) {
        prevent();
        ol.setView((view) => ({ ...view, query: "" }));
        ui.setSearchOpen(false);
      } else if (selected) {
        prevent();
        ol.dispatch({ type: "clear-selection" });
      }
      return;
    }
  }
}

/** What a view adds to the shared handler beyond travel. */
export interface RowKeyExtras {
  /** Bring a row into view after the cursor lands on it (default: scroll its element into view). */
  readonly reveal?: (id: string) => void;
  /** PageUp/PageDown (default: the view's first/last). */
  readonly page?: (from: string | null, dir: "up" | "down") => string | null;
  /** Enter where the view cannot edit in place (the mind map opens the node). ⇧Enter is then left alone. */
  readonly enter?: (id: string) => void;
}

const defaultReveal = (ui: OutlinerUi) => (id: string) =>
  ui.listRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`)?.scrollIntoView({ block: "nearest", inline: "nearest" });

/** The list's travel: the projected rows in order; ←/→ fold, unfold, or go to the parent / next row. */
export function listNav(ol: Pick<OutlinerController, "rows" | "rowIndex">): ViewNav {
  const { rows, rowIndex } = ol;
  const at = (index: number) => rows[Math.max(0, Math.min(rows.length - 1, index))]?.id ?? null;
  return {
    view: "list",
    visibleIds: () => rows.map((row) => row.id),
    next(id, dir) {
      const index = id ? (rowIndex.get(id) ?? -1) : -1;
      switch (dir) {
        case "first":
          return at(0);
        case "last":
          return at(rows.length - 1);
        case "down":
        case "right":
          return at(index < 0 ? 0 : index + 1);
        case "up":
          return at(index < 0 ? rows.length - 1 : index - 1);
        case "left": {
          const parent = rows[index]?.parentId;
          return parent && rowIndex.has(parent) ? parent : null;
        }
      }
    },
    foldAt(id, dir) {
      const row = rows[rowIndex.get(id) ?? -1];
      if (!row?.hasChildren) return null;
      return (dir === "right") !== row.expanded ? row.id : null;
    },
  };
}
