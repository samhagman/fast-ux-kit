import { getOutlinePath } from "@fux/core";
import type { OutlineItem } from "./types";

/**
 * Deep links to items. A host can supply its own (`linkFor` on the Outliner, e.g. a share URL
 * with a slug); the default keeps the current page and sets `?zoom=<id>`, plus `?doc=<id>` in a
 * workspace, where the item id arrives qualified (`documentId/itemId`).
 *
 *   itemHref("abc", undefined, "https://app.test/notes?q=1#/outliner")
 *     → "https://app.test/notes?q=1&zoom=abc#/outliner"
 *   itemHref("abc", "plan/abc", …) → "…?doc=plan&zoom=abc#/outliner"
 *
 * Pasting such a link back into a title turns it into an item link (`[[title|id]]`):
 * `itemFromHref` reads it, and returns null for anything that is not this page.
 */
export function itemHref(id: string, qualified: string | undefined, base: string): string {
  const url = new URL(base);
  url.searchParams.delete("zoom");
  url.searchParams.delete("doc");
  const slash = qualified ? qualified.indexOf("/") : -1;
  if (qualified && slash > 0) {
    url.searchParams.set("doc", qualified.slice(0, slash));
    url.searchParams.set("zoom", qualified.slice(slash + 1));
  } else url.searchParams.set("zoom", id);
  return url.toString();
}

/** The item a pasted deep link names: `{ doc, id }`, or null when it is not a link to this page. */
export function itemFromHref(text: string, base: string): { readonly doc: string | null; readonly id: string } | null {
  const trimmed = text.trim();
  if (!/^https?:\/\/\S+$/.test(trimmed)) return null;
  let url: URL, here: URL;
  try {
    url = new URL(trimmed);
    here = new URL(base);
  } catch {
    return null;
  }
  if (url.origin !== here.origin || url.pathname !== here.pathname) return null;
  const id = url.searchParams.get("zoom");
  return id ? { doc: url.searchParams.get("doc"), id } : null;
}

/**
 * Where a deep link lands. An item with children opens zoomed into it; a leaf has nothing to
 * show on its own page, so it opens its parent's zoom (the document root for a top-level item)
 * with the leaf selected. Null when the item does not exist.
 *
 *   deepLinkTarget(nodes, "evals")      → { zoom: "evals", select: null }
 *   deepLinkTarget(nodes, "evals-128k") → { zoom: "evals", select: "evals-128k" }
 */
export function deepLinkTarget(nodes: readonly OutlineItem[], id: string): { readonly zoom: string | null; readonly select: string | null } | null {
  const path = getOutlinePath(nodes, id);
  const node = path.at(-1);
  if (!node) return null;
  if (node.children?.length) return { zoom: id, select: null };
  return { zoom: path.at(-2)?.id ?? null, select: id };
}

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Put a link on the clipboard: the URL as plain text, and `<a href>title</a>` for apps that
 * paste rich text (docs, mail). Falls back to plain text where rich clipboard writes are missing.
 */
export async function writeLinkToClipboard(href: string, title: string): Promise<void> {
  const clipboard = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  if (!clipboard) throw new Error("No clipboard");
  if (typeof ClipboardItem !== "undefined" && clipboard.write) {
    try {
      const html = `<a href="${escapeHtml(href)}">${escapeHtml(title)}</a>`;
      await clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([href], { type: "text/plain" }),
          "text/html": new Blob([html], { type: "text/html" }),
        }),
      ]);
      return;
    } catch {
      // Some browsers refuse text/html: plain text still works.
    }
  }
  await clipboard.writeText(href);
}
