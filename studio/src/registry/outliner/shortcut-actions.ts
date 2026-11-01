import type { OutlinerUi } from "./context";
import type { OutlinerController } from "./use-outliner";
import { shortcutDef, type ShortcutId } from "./keymap";
import { levelsAction, type OutlineLevels } from "./folding";

/**
 * What each remappable shortcut does. Key handlers only ask the keymap which action a key
 * means, then run it here, so a remap changes the key and never the behaviour.
 */
export interface ShortcutTarget {
  readonly ol: OutlinerController;
  readonly ui: OutlinerUi;
  /** What item actions act on: the edited row, or the selection. */
  readonly ids: readonly string[];
  /** The row a single-item action (zoom, fold, link) means. */
  readonly rowId: string | null;
}

/** Text formatting is applied by the field (it owns the caret); these are its marks. */
export const FORMAT_MARKS: Partial<Record<ShortcutId, string>> = {
  bold: "**",
  italic: "__",
  code: "`",
  strike: "~~",
  highlight: "==",
};

const LEVELS: Partial<Record<ShortcutId, OutlineLevels>> = { levels1: 1, levels2: 2, levels3: 3, levelsAll: "all" };
const HEADINGS: Partial<Record<ShortcutId, 1 | 2 | 3 | undefined>> = { heading1: 1, heading2: 2, heading3: 3, heading0: undefined };

/** Show N levels of the zoomed branch (or the document), announced. */
export function showLevels(ol: OutlinerController, ui: OutlinerUi, levels: OutlineLevels) {
  ol.dispatch(levelsAction(levels, ol.state.hoistedId));
  ui.announce(ui.labels.levelsShown(levels === "all" ? 0 : levels));
}

export function runGlobalShortcut(id: ShortcutId, { ui }: Pick<ShortcutTarget, "ui">): boolean {
  switch (id) {
    case "palette":
      ui.setPaletteMode("all");
      ui.setPaletteOpen(true);
      return true;
    case "moveTo":
      ui.setPaletteMode("move");
      ui.setPaletteOpen(true);
      return true;
    case "search":
      ui.setSearchOpen(true);
      return true;
    case "shortcuts":
      ui.setShortcutsOpen(true);
      return true;
    case "findReplace":
      ui.setFindOpen(true);
      return true;
    case "settings":
      ui.setSettingsOpen(true);
      return true;
    default:
      return false;
  }
}

/** Runs an item-scoped action; false when it does not apply here (nothing to act on). */
export function runItemShortcut(id: ShortcutId, { ol, ui, ids, rowId }: ShortcutTarget): boolean {
  if (shortcutDef(id).scope === "global") return runGlobalShortcut(id, { ui });
  const levels = LEVELS[id];
  if (levels !== undefined) {
    showLevels(ol, ui, levels);
    return true;
  }
  if (id in HEADINGS) {
    if (!ids.length) return false;
    ol.commands.setHeading(ids, HEADINGS[id]);
    return true;
  }
  switch (id) {
    case "moveUp":
    case "moveDown":
      if (!ids.length) return false;
      ol.dispatch({ type: "move", direction: id === "moveUp" ? "up" : "down", ids });
      return true;
    case "complete":
      if (!ids.length || ol.readOnly) return false;
      ui.announceToggle(ol.commands.toggleComplete(ids));
      return true;
    case "fold": {
      if (!rowId) return false;
      if (ol.rowOf(rowId)?.hasChildren) ol.dispatch({ type: "toggle", id: rowId });
      return true;
    }
    case "zoomIn":
      if (!rowId) return false;
      ol.dispatch({ type: "hoist", id: rowId });
      return true;
    case "zoomOut":
      ol.dispatch({ type: "hoist", id: ol.breadcrumbs.at(-2)?.id ?? null });
      return true;
    case "checkbox":
      if (!ids.length) return false;
      ol.commands.toggleCheckbox(ids);
      return true;
    case "hideCompleted":
      ol.setView((view) => ({ ...view, hideCompleted: !view.hideCompleted }));
      return true;
    case "copyLink":
      if (!rowId) return false;
      ui.copyLink(rowId);
      return true;
    default:
      return false;
  }
}
