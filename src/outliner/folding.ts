import type { OutlineAction } from "../core/index.js";
import type { OutlineItemData } from "./types.js";

/**
 * "Show N levels": the rows N deep stay visible and everything deeper folds, scoped to the
 * zoomed branch (only its items change; folds elsewhere are untouched). One core action.
 *
 * The core's `expand-all` depth counts from the scope: unzoomed, a top-level item is depth 1, so
 * N visible levels means expanding through depth N − 1; zoomed, the zoomed item itself is depth
 * 1 (its children are the first visible level), so it is depth N.
 */
export type OutlineLevels = 1 | 2 | 3 | "all";

export function levelsAction(
  levels: OutlineLevels,
  hoistedId: string | null,
): OutlineAction<OutlineItemData> {
  if (levels === "all") return { type: "expand-all", expanded: true };
  return { type: "expand-all", expanded: true, depth: hoistedId ? levels : levels - 1 };
}
