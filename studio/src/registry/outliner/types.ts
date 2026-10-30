import type { OutlineNode } from "@fux/core";

/** Item metadata lives in node.data; the core's details reader understands every field. */
export interface OutlineItemData {
  readonly note?: string;
  readonly heading?: 1 | 2 | 3;
  readonly color?: OutlineColor;
  /** Completion for items without a checkbox. Checkbox items use node.checked. */
  readonly completed?: boolean;
  /** Children render as an ordered list. */
  readonly numbered?: boolean;
  readonly createdAt?: number;
  readonly editedAt?: number;
  /** This item mirrors another (live copy). See mirrors.ts. */
  readonly mirrorOf?: string;
}

export type OutlineItem = OutlineNode<OutlineItemData>;

export const OUTLINE_COLORS = ["red", "orange", "yellow", "green", "blue", "purple"] as const;
export type OutlineColor = (typeof OUTLINE_COLORS)[number];

/** Label swatches stay muted so color reads as a tag, never as an alert. Rows show a start stripe
 *  (`bar`) plus the faintest tint (`row`), so a colour never reads as focus or selection. */
export const COLOR_STYLES: Record<
  OutlineColor,
  { readonly dot: string; readonly row: string; readonly bar: string; readonly label: string }
> = {
  red: { dot: "bg-[oklch(0.64_0.19_25)]", row: "bg-[oklch(0.64_0.19_25/0.03)]", bar: "bg-[oklch(0.64_0.19_25)]", label: "Red" },
  orange: { dot: "bg-[oklch(0.72_0.16_55)]", row: "bg-[oklch(0.72_0.16_55/0.035)]", bar: "bg-[oklch(0.72_0.16_55)]", label: "Orange" },
  yellow: { dot: "bg-[oklch(0.8_0.15_90)]", row: "bg-[oklch(0.82_0.15_90/0.045)]", bar: "bg-[oklch(0.8_0.15_90)]", label: "Yellow" },
  green: { dot: "bg-[oklch(0.66_0.14_150)]", row: "bg-[oklch(0.66_0.14_150/0.03)]", bar: "bg-[oklch(0.66_0.14_150)]", label: "Green" },
  blue: { dot: "bg-[oklch(0.62_0.16_250)]", row: "bg-[oklch(0.62_0.16_250/0.025)]", bar: "bg-[oklch(0.62_0.16_250)]", label: "Blue" },
  purple: { dot: "bg-[oklch(0.6_0.18_300)]", row: "bg-[oklch(0.6_0.18_300/0.03)]", bar: "bg-[oklch(0.6_0.18_300)]", label: "Purple" },
};

export type OutlineNoteDisplay = "show" | "first-line" | "hide";
export type OutlineExportFormat = "markdown" | "opml" | "text" | "json";

/**
 * Starred items and saved searches. Items are kept by id (rename-safe; deleted items are skipped
 * when shown). The host persists this through `bookmarks` + `onBookmarksChange` (or seeds it with
 * `defaultBookmarks`); the outliner itself never touches storage.
 *
 * Extension point: a multi-document host can widen `items` entries to `documentId:itemId` and
 * route clicks through its own `onHoistChange` / navigation; the outliner treats ids it cannot
 * find in this document as "not here" and leaves them alone.
 */
export interface OutlineBookmarks {
  readonly items: readonly string[];
  readonly searches: readonly OutlineSavedSearch[];
}
export interface OutlineSavedSearch {
  readonly query: string;
  /** Shown instead of the query when set. */
  readonly label?: string;
}
export const NO_BOOKMARKS: OutlineBookmarks = { items: [], searches: [] };
