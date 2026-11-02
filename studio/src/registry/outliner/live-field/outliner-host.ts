/**
 * The outliner as one live field sees it (field-session.ts's FieldHost over useOutliner):
 *
 *   dispatch    typing renders after the paint (inside `transition`, as the textarea's did);
 *               everything else renders at once
 *   text, row   the newest document, never what the last render showed
 *   neighbour   the row a merge joins with, picked exactly as the core picks it
 */
import { editorVisibleRows, findOutlineNode, type OutlineAction } from "@fux/core";
import type { OutlineItem, OutlineItemData } from "../types";
import type { OutlinerController } from "../use-outliner";
import type { FieldHost } from "./field-session";

export function fieldHost(get: () => OutlinerController, transition: (run: () => void) => void = (run) => run()): FieldHost {
  return {
    dispatch: (action) => {
      const ol = get();
      const typed = action as OutlineAction<OutlineItemData>;
      const typing = (action.type === "text" || action.type === "note") && action.time !== undefined && action.time !== Number.NEGATIVE_INFINITY;
      if (!typing) return ol.dispatch(typed);
      let result: ReturnType<OutlinerController["dispatch"]> | null = null;
      transition(() => {
        result = ol.dispatch(typed, { afterPaint: true });
      });
      return result!;
    },
    currentSeq: () => get().currentSeq(),
    text: (id, field) => {
      const node = findOutlineNode(get().latestNodes(), id)?.node as OutlineItem | undefined;
      if (!node) return undefined;
      return field === "note" ? (node.data?.note ?? "") : node.text;
    },
    row: (id) => {
      const nodes = get().latestNodes();
      const found = findOutlineNode(nodes, id);
      if (!found) return null;
      const node = found.node as OutlineItem;
      const parent = found.parentId ? (findOutlineNode(nodes, found.parentId)?.node as OutlineItem | undefined) : undefined;
      return {
        parentId: found.parentId ?? null,
        checked: node.checked,
        data: node.data as Record<string, unknown> | undefined,
        parentData: parent?.data as Record<string, unknown> | undefined,
      };
    },
    neighbour: (id, direction) => {
      const rows = editorVisibleRows(get().latestState());
      const index = rows.findIndex((row) => row.id === id);
      const other = index < 0 ? undefined : rows[index + (direction === "backward" ? -1 : 1)];
      return other ? { id: other.id, text: other.node.text } : null;
    },
  };
}
