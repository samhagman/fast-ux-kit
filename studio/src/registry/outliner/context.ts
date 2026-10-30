import * as React from "react";
import { useApplePlatform } from "@/lib/platform";
import type { OutlinerController } from "./use-outliner";
import type { OutlinerLabels } from "./labels";
import type { DateRepeat } from "./inline";

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
