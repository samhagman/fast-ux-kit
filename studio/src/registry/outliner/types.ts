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
  /**
   * How the item shows its children when zoomed in: "board" lays children out as columns and
   * grandchildren as cards (see board.ts); "article" reads the branch as flowing prose
   * (article.ts); "mindmap" draws it as a map (mindmap.ts). Absent means the outline (list) view.
   */
  readonly view?: OutlineItemView;
}

export type OutlineItemView = "list" | "board" | "article" | "mindmap";

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

/**
 * One document of a multi-document workspace (`OutlinerWorkspace`). Plain data: the host stores
 * it however it likes. Cross-document links are written `[[label|documentId/itemId]]`.
 */
export interface OutlineDocument {
  readonly id: string;
  readonly title: string;
  readonly nodes: readonly OutlineItem[];
  /** The folder it lives in (`OutlineWorkspaceLayout.folders`); absent or unknown: top level. */
  readonly folderId?: string;
}

/** A folder of documents. Nested by `parentId`; siblings keep their array order. */
export interface OutlineFolder {
  readonly id: string;
  readonly title: string;
  readonly parentId?: string;
}

/**
 * How a workspace's documents are organised, as plain data the host stores beside them (see
 * library.ts): folders, starred documents and the inbox quick capture files into. Which folders
 * are open is the reader's own state and never part of it.
 */
export interface OutlineWorkspaceLayout {
  readonly folders: readonly OutlineFolder[];
  /** Starred (bookmarked) document ids, in star order. */
  readonly starred: readonly string[];
  /** The document quick capture files into; null or missing: one is made on first capture. */
  readonly inboxId?: string | null;
}

/** A link target or backlink source in another document, for chips, panels and autocomplete. */
export interface OutlineExternalRef {
  /** The link id as written in `[[label|id]]` (`documentId/itemId`). */
  readonly id: string;
  /** The item's title source (inline markup; rendered or flattened by the caller). */
  readonly title: string;
  /** Where it lives, plain text: "Document › Parent › Item's parent". */
  readonly context: string;
}

/**
 * Links that leave this document, resolved by a multi-document host (OutlinerWorkspace builds
 * one per document). The outliner only reads it: it never touches other documents itself.
 */
export interface OutlineExternalLinks {
  /** A link target's title source; null when it was deleted; undefined when `id` is not external. */
  resolve(id: string): string | null | undefined;
  /** Follow an external link (switch document, reveal the item). */
  open(id: string): void;
  /** Items in OTHER documents that link to `itemId` of this one. */
  backlinks(itemId: string): readonly OutlineExternalRef[];
  /** Backlink counts per item id of this document; a new Map identity means "something changed". */
  readonly counts: ReadonlyMap<string, number>;
  /** Link targets in other documents whose title contains `query` (for `[[` autocomplete). */
  suggest(query: string, limit: number): readonly OutlineExternalRef[];
  /** The id other documents use to link to `itemId` of this one (`documentId/itemId`). */
  qualify(itemId: string): string;
}
