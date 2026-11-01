import * as React from "react";
import { useApplePlatform } from "@/lib/platform";
import type { OutlinerController } from "./use-outliner";
import type { OutlinerLabels } from "./labels";
import type { DateRepeat } from "./inline";
import type { OutlinerSettings } from "./settings";
import type { Keymap, ReservedShortcut } from "./keymap";
import type { OutlineAttachHandler, OutlinerItemCommands } from "./seams";

export type PaletteMode = "all" | "move" | "mirror";

export interface OutlinerUi {
  /** True while a row field owns DOM focus (edit session). */
  readonly editing: boolean;
  readonly setEditing: (editing: boolean) => void;
  readonly paletteOpen: boolean;
  readonly setPaletteOpen: (open: boolean) => void;
  readonly paletteMode: PaletteMode;
  readonly setPaletteMode: (mode: PaletteMode) => void;
  readonly shortcutsOpen: boolean;
  readonly setShortcutsOpen: (open: boolean) => void;
  readonly searchOpen: boolean;
  readonly setSearchOpen: (open: boolean) => void;
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  /** Focus the row list for keyboard selection mode. */
  readonly focusList: () => void;
  readonly announce: (message: string) => void;
  readonly datePicker: DatePickerRequest | null;
  readonly setDatePicker: (request: DatePickerRequest | null) => void;
  readonly head: string | null;
  /** DOM id of the search help strip (the search field's aria-describedby). */
  readonly searchHelpId: string;
  readonly setHead: (id: string | null) => void;
  readonly labels: OutlinerLabels;
  /**
   * A toast with Undo bound to the history entry on top right now. It is dismissed as soon as any
   * undo, redo or new edit supersedes that entry, and its Undo does nothing if it is stale.
   */
  readonly offerUndo: (message: string, options?: { readonly sticky?: boolean }) => void;
  /** Bring a row into view (works for virtual rows that are not mounted). */
  readonly scrollToRow: (id: string, align?: "auto" | "center") => void;
  readonly registerScroller: (scroll: ((id: string, align: "auto" | "center") => boolean) | null) => void;
  /** Phone action sheet (the long-press / ⋯ menu on touch). */
  readonly sheet: ActionSheetRequest | null;
  readonly setSheet: (request: ActionSheetRequest | null) => void;
  /**
   * Hand focus back after an overlay closes (menus, sheet, date picker, palette, dialogs): to the
   * tree with `selectId` selected, unless something else took focus on purpose. Never <body>.
   */
  readonly returnFocus: (event: Event | null, selectId?: string | null) => void;
  /** Recurring-date and completion feedback for any complete action (row, menu, key, swipe). */
  readonly announceToggle: (summary: import("./use-outliner").ToggleSummary) => void;
  /** What a host plugged in (a workspace: documents in ⌘K, a title editor, search scope). */
  readonly host: OutlinerHostSlots;
  /** The reader's preferences (settings.ts); the settings panel is their one editor. */
  readonly settings: OutlinerSettings;
  readonly updateSettings: (patch: Partial<OutlinerSettings>) => void;
  /** Active shortcuts: the keyboard profile plus remaps (keymap.ts). */
  readonly keymap: Keymap;
  readonly settingsOpen: boolean;
  readonly setSettingsOpen: (open: boolean) => void;
  readonly findOpen: boolean;
  readonly setFindOpen: (open: boolean) => void;
  /** Copy a deep link to an item (host `linkFor`, else `?zoom=`), with a toast. */
  readonly copyLink: (id: string) => void;
}

/** One extra ⌘K entry a host contributes (e.g. "Open document · Roadmap"). */
export interface OutlinerPaletteCommand {
  readonly id: string;
  readonly label: string;
  /** Extra words cmdk matches on (never shown). */
  readonly keywords?: string;
  readonly icon?: React.ReactNode;
  /** Right-aligned, muted (an item count, a shortcut). */
  readonly hint?: string;
  readonly run: () => void;
}
export interface OutlinerPaletteGroup {
  readonly heading: string;
  readonly commands: readonly OutlinerPaletteCommand[];
}

/**
 * Search scope a host can offer (a workspace: this document or all documents). While the scope
 * is "all", the outliner's body shows `renderResults(query)` instead of its own rows.
 */
export interface OutlinerSearchScope {
  readonly value: "document" | "all";
  readonly onChange: (scope: "document" | "all") => void;
  readonly renderResults: (query: string) => React.ReactNode;
  /** Matches across every document, for the count in the search field. */
  readonly count?: (query: string) => number;
  /** What the results across documents show, for the status footer (matches, and in how many documents). */
  readonly stats?: (query: string) => { readonly matches: number; readonly documents: number };
  /** Told whenever this outline's query changes (a workspace keeps its tag pane in step). */
  readonly onQueryChange?: (query: string) => void;
}

/** Starred documents in the bookmarks menu (a workspace host). */
export interface OutlinerStarredDocuments {
  readonly items: readonly { readonly id: string; readonly title: string }[];
  readonly open: (id: string) => void;
  readonly unstar: (id: string) => void;
  /** Whether the document this outliner shows is starred, and how to toggle it. */
  readonly current: boolean;
  readonly toggleCurrent: () => void;
}

export interface OutlinerHostSlots {
  /** Rendered first in the toolbar (a workspace's documents button). */
  readonly headerStart?: React.ReactNode;
  /** Makes the document title editable in place. */
  readonly onTitleChange?: (title: string) => void;
  readonly paletteGroups?: readonly OutlinerPaletteGroup[];
  readonly searchScope?: OutlinerSearchScope;
  /** Extra entries at the top of the ⋯ view menu (a phone's way to host features: Find document…). */
  readonly menuCommands?: readonly OutlinerPaletteCommand[];
  /**
   * Rows dragged out of the outline onto an element marked `data-outline-drop="<target>"` (a
   * workspace's documents): the host moves them. Return true when it took them.
   */
  readonly onExternalDrop?: (ids: readonly string[], target: string) => boolean;
  /** Starred documents of a workspace, listed in the bookmarks menu beside starred items. */
  readonly starredDocuments?: OutlinerStarredDocuments;
  /** A share/deep link for an item (see SEAMS.md); default: this page with `?zoom=<id>`. */
  readonly linkFor?: (id: string) => string;
  /** Files pasted or dropped into a field: the host stores them and returns links. */
  readonly onAttach?: OutlineAttachHandler;
  /** Opens the host's version history ("Version history…" in ⌘K and the ⋯ menu). */
  readonly onHistory?: () => void;
  /** Host actions on items, shown in every item menu and the phone sheet. */
  readonly itemCommands?: OutlinerItemCommands;
  /** Keys the host uses itself: remapping refuses them (beyond the outliner's own list). */
  readonly reservedShortcuts?: readonly ReservedShortcut[];
}

export interface ActionSheetRequest {
  readonly rowId: string;
  readonly ids: readonly string[];
  /** The row was selected only to mark it while the sheet is open (cleared on close). */
  readonly marked?: boolean;
}

export interface DatePickerRequest {
  readonly rowId: string;
  readonly field: "title" | "note";
  /** Source range of the `!(…)` token being edited. */
  readonly start: number;
  readonly end: number;
  readonly value: Date;
  readonly hasTime: boolean;
  readonly repeat?: DateRepeat;
  /** The token is a range (`!(start → end)`): its end. */
  readonly rangeEnd?: Date;
  readonly rangeEndHasTime?: boolean;
  /** The time of day as written (see InlineDate.time). */
  readonly time?: readonly [number, number];
  readonly rect: DOMRect;
}

export const OutlinerContext = React.createContext<
  { readonly ol: OutlinerController; readonly ui: OutlinerUi } | null
>(null);

export function useOutlinerContext() {
  const value = React.useContext(OutlinerContext);
  if (!value) throw new Error("Outliner parts must render inside <Outliner>.");
  return value;
}

export interface PlatformKeys {
  readonly isMac: boolean;
  readonly modKey: string;
  readonly alt: string;
  readonly shift: string;
}

/** Shortcut glyphs for this client. SSR-stable: "Ctrl" on the server and during hydration. */
export function usePlatformKeys(): PlatformKeys {
  const isMac = useApplePlatform();
  return React.useMemo(
    () => ({ isMac, modKey: isMac ? "⌘" : "Ctrl", alt: isMac ? "⌥" : "Alt ", shift: isMac ? "⇧" : "Shift " }),
    [isMac],
  );
}
