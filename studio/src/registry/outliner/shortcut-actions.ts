import { toast } from "sonner";
import { isApplePlatform } from "@/lib/platform";
import type { OutlinerUi } from "./context";
import type { OutlinerController } from "./use-outliner";
import { shortcutDef, type ShortcutId } from "./keymap";
import { levelsAction, type OutlineLevels } from "./folding";
import { flattenActions, itemActions, type ItemAction } from "./item-actions";

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
    case "search": {
      // Already open: back into the field with its query selected, wherever focus is.
      const field = ui.searchOpen ? ui.rootRef.current?.querySelector<HTMLInputElement>('input[data-focus-region="search"]') : null;
      if (field) {
        field.focus();
        field.select();
      } else ui.setSearchOpen(true);
      return true;
    }
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
  // A chord an item command owns runs that registry entry: the menus' Complete, Heading 1, Zoom
  // in … are the same code, with the same enablement.
  const owned = runRegistryChord(id, { ol, ui, ids, rowId });
  if (owned !== null) return owned;
  switch (id) {
    case "moveUp":
    case "moveDown": {
      if (!ids.length) return false;
      const before = ol.latestNodes();
      const result = ol.dispatch({ type: "move", direction: id === "moveUp" ? "up" : "down", ids });
      // Said once, here: the row's new place is otherwise silent.
      if (!result.refusal && result.nodes !== before) ui.announce(id === "moveUp" ? ui.labels.movedUp : ui.labels.movedDown);
      return true;
    }
    case "fold": {
      if (!rowId) return false;
      if (ol.rowOf(rowId)?.hasChildren) toggleFold(ol, ui, rowId);
      return true;
    }
    case "zoomOut":
      ol.dispatch({ type: "hoist", id: ol.breadcrumbs.at(-2)?.id ?? null });
      return true;
    case "hideCompleted":
      toggleHideCompleted(ol, ui);
      return true;
    default:
      return false;
  }
}

/** Fold or unfold one item, said aloud (only `aria-expanded` changes otherwise). */
export function toggleFold(ol: OutlinerController, ui: OutlinerUi, id: string) {
  const opening = !ol.state.expandedIds.has(id);
  ol.dispatch({ type: "toggle", id });
  ui.announce(opening ? ui.labels.unfolded : ui.labels.folded);
}

/** Hide completed on or off, said aloud: rows leave or return all at once. */
export function toggleHideCompleted(ol: OutlinerController, ui: OutlinerUi) {
  const hide = !ol.view.hideCompleted;
  ol.setView((view) => ({ ...view, hideCompleted: hide }));
  ui.announce(hide ? ui.labels.completedHidden : ui.labels.completedShown);
}

/** The registry entry that matches, looked up for the target, then for the cursor row alone. */
function registryEntry(match: (action: ItemAction) => boolean, { ol, ui, ids, rowId }: ShortcutTarget): ItemAction | null | undefined {
  const rowIdOrLast = rowId ?? ids.at(-1) ?? null;
  const row = rowIdOrLast ? ol.rowOf(rowIdOrLast) : null;
  const isMac = typeof navigator !== "undefined" && isApplePlatform(navigator);
  const find = (targets: readonly string[]) =>
    row && targets.length ? flattenActions(itemActions({ ol, ui, ids: targets, row, isMac })).find(({ action }) => match(action))?.action : undefined;
  // Single-item entries (Zoom in, Copy link) are not offered for a range: they mean the cursor row.
  return find(ids) ?? (row ? find([row.id]) : null);
}
const chordEntry = (id: ShortcutId, target: ShortcutTarget) => registryEntry((action) => action.chord === id, target);

/**
 * Run a registry command by id from a key (⇧Enter → "item.note"). false: not handled (no such
 * entry, or a read-only outline, where the key goes on as before). A locked item says why.
 */
export function runEntry(commandId: string, target: ShortcutTarget): boolean {
  const entry = registryEntry((action) => action.commandId === commandId, target);
  if (!entry) return false;
  return runOrRefuse(entry, target);
}

function runOrRefuse(entry: ItemAction, target: ShortcutTarget): boolean {
  if (entry.disabled) {
    if (target.ol.readOnly) return false;
    toast(target.ui.labels.locked, { id: "outliner-refusal" });
    return true;
  }
  entry.run();
  return true;
}

/**
 * null: no item command owns this chord. Otherwise whether it ran. A disabled entry (a locked
 * item) says why instead of doing nothing; a read-only outline lets the key go, as before.
 */
function runRegistryChord(id: ShortcutId, target: ShortcutTarget): boolean | null {
  if (!REGISTRY_CHORDS.has(id)) return null;
  const entry = chordEntry(id, target);
  if (!entry) return false;
  return runOrRefuse(entry, target);
}

/** The chords whose action is an item command in the registry (item-actions.tsx). */
const REGISTRY_CHORDS: ReadonlySet<ShortcutId> = new Set<ShortcutId>(["complete", "checkbox", "heading1", "heading2", "heading3", "heading0", "zoomIn", "copyLink"]);
