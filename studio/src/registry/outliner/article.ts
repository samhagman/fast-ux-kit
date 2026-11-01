import type { OutlineItem } from "./types";

/**
 * Article view (`data.view: "article"`): a branch read as flowing prose instead of bullets.
 * Like the board, it is a projection of the same tree; nothing about the document changes.
 *
 *   Model card                     Model card
 *     Summary          (H2)    ⇒   Summary                       ← headings stay headings
 *       Halcyon-3 is …                Halcyon-3 is …             ← items become paragraphs
 *       ▢ Ship the eval table         ☐ Ship the eval table      ← tasks stay tickable
 *     Training data                Training data                 ← a top-level item with
 *       Licensed corpora …            Licensed corpora …           children reads as a section
 *         note: 4.1T tokens            4.1T tokens (its note, inline)
 *
 * Rules, in order:
 *   - an item with a heading level is a heading of that level;
 *   - at the article's top level, an item with children that is not a task is a section
 *     heading (outlines rarely mark headings; their top-level branches are the sections);
 *   - everything else is a paragraph; a paragraph's children follow it, indented one step,
 *     and under a numbered parent they carry their ordinal;
 *   - a heading's children start again at the left edge (a section flows, it does not nest);
 *   - completed items are left out while "hide completed" is on; folding is ignored (an
 *     article reads the whole branch).
 */
export type ArticleBlock =
  | {
      readonly kind: "heading";
      readonly node: OutlineItem;
      /** 1 (largest) to 3. */
      readonly level: 1 | 2 | 3;
    }
  | {
      readonly kind: "paragraph";
      readonly node: OutlineItem;
      /** Indentation steps (0 at a section's left edge; capped at 4). */
      readonly depth: number;
      /** "3." under a numbered parent. */
      readonly ordinal?: number;
      readonly task: boolean;
      readonly done: boolean;
    };

export const isArticle = (node: OutlineItem | null | undefined): boolean => node?.data?.view === "article";

const isDone = (node: OutlineItem) => node.checked === true || node.data?.completed === true;
const isTask = (node: OutlineItem) => node.checked !== undefined;

const cache = new WeakMap<readonly OutlineItem[], { readonly hide: boolean; readonly blocks: readonly ArticleBlock[] }>();

export function articleBlocks(items: readonly OutlineItem[], options: { readonly hideCompleted?: boolean } = {}): readonly ArticleBlock[] {
  const hide = !!options.hideCompleted;
  const cached = cache.get(items);
  if (cached && cached.hide === hide) return cached.blocks;
  const out: ArticleBlock[] = [];
  const walk = (nodes: readonly OutlineItem[], depth: number, top: boolean, numbered: boolean) => {
    let ordinal = 0;
    for (const node of nodes) {
      if (hide && isDone(node)) continue;
      ordinal++;
      const children = node.children ?? [];
      const heading = node.data?.heading;
      if (heading || (top && children.length > 0 && !isTask(node))) {
        out.push({ kind: "heading", node, level: heading ?? 2 });
        walk(children, 0, false, !!node.data?.numbered);
        continue;
      }
      out.push({
        kind: "paragraph",
        node,
        depth: Math.min(depth, 4),
        ...(numbered ? { ordinal } : {}),
        task: isTask(node),
        done: isDone(node),
      });
      if (children.length) walk(children, depth + 1, false, !!node.data?.numbered);
    }
  };
  walk(items, 0, true, false);
  cache.set(items, { hide, blocks: out });
  return out;
}
