import type * as React from "react";

/**
 * Typed hooks for what a host app owns and the outliner does not (see SEAMS.md): file storage,
 * version history, integrations and share links. Each is optional; without it the outliner
 * simply offers nothing for that concern.
 */

/** A stored file the host hands back for an attach (paste or drop of files into a field). */
export interface OutlineAttachment {
  /** Shown as the link or image text. */
  readonly name: string;
  /** Where the host stored it: https:, or a same-site path. Never a data: or javascript: URL. */
  readonly href: string;
  /** "image" renders inline in the note (`![name](href)`); anything else is a link. */
  readonly kind?: "image" | "file";
}

export interface OutlineAttachTarget {
  readonly itemId: string;
  readonly field: "title" | "note";
}

/**
 * Store files dropped or pasted into an item (upload them, keep them offline …) and return
 * where they live. The outliner appends them to that item's note as one undo step.
 */
export type OutlineAttachHandler = (
  files: readonly File[],
  target: OutlineAttachTarget,
) => readonly OutlineAttachment[] | Promise<readonly OutlineAttachment[]>;

/** One host action on items (an integration: "Add to calendar", "Email this", "Send to…"). */
export interface OutlinerItemCommand {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly run: (ids: readonly string[]) => void;
}

/** Host actions for the items an item menu, context menu or phone sheet acts on. */
export type OutlinerItemCommands = (ids: readonly string[]) => readonly OutlinerItemCommand[];

/** Only http(s) and same-site paths are accepted as attachment targets. */
export function safeAttachmentHref(href: string): boolean {
  return /^https?:\/\//i.test(href) || (href.startsWith("/") && !href.startsWith("//"));
}

/** Markup for attachments, one per line: an image embeds, a file links. */
export function attachmentMarkup(attachments: readonly OutlineAttachment[]): string {
  return attachments
    .filter((attachment) => safeAttachmentHref(attachment.href))
    .map((attachment) => {
      const name = attachment.name.replace(/[[\]\n]/g, " ").trim() || "file";
      return attachment.kind === "image"
        ? `![${name}](${attachment.href})`
        : `[${name}](${attachment.href})`;
    })
    .join("\n");
}
