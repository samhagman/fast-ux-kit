import { createOutlineId, findOutlineNode, outlineIds, selectionRoots, type OutlineCommand } from "@fux/core";
import { reidentify } from "./interchange";
import type { OutlineItem, OutlineItemData } from "./types";

/**
 * ⌥/Alt-drag: the dragged items are copied (fresh ids all the way down) to where the drop line
 * is, and the originals stay. The drop target comes from the same `planOutlineDrop` a move uses,
 * whose index counts the siblings that remain once the moving items leave; a copy leaves
 * nothing, so the index is mapped back onto the full sibling list here.
 */
export interface CopyDropTarget {
  readonly parentId: string | null;
  /** Index among the siblings that are not being dragged (the core drop contract). */
  readonly index: number;
}

/**
 * Deep copies with new ids, made together: a link or mirror inside the copied items that points
 * at another copied item points at its copy; one to an item outside stays as it is. Copies are
 * new items, so their created and edited times are dropped (stamping gives them "now").
 */
export function cloneWithFreshIds(nodes: readonly OutlineItem[], createId: () => string = createOutlineId): readonly OutlineItem[] {
  const fresh = (node: OutlineItem): OutlineItem => {
    const { createdAt: _created, editedAt: _edited, ...data } = node.data ?? {};
    const { data: _data, ...rest } = node;
    return {
      ...rest,
      ...(Object.keys(data).length ? { data } : {}),
      ...(node.children ? { children: node.children.map(fresh) } : {}),
    };
  };
  return reidentify(nodes, () => null, createId).map(fresh);
}

export function copyDropCommands(
  nodes: readonly OutlineItem[],
  ids: readonly string[],
  target: CopyDropTarget,
  createId: () => string = createOutlineId,
): { readonly commands: readonly OutlineCommand<OutlineItemData>[]; readonly created: readonly string[] } {
  const roots = selectionRoots(nodes, new Set(ids));
  const dragged = new Set(roots.flatMap((id) => outlineIds([findOutlineNode(nodes, id)!.node])));
  const parent = target.parentId ? (findOutlineNode(nodes, target.parentId)?.node as OutlineItem | undefined) : undefined;
  if (target.parentId && !parent) return { commands: [], created: [] };
  const siblings = (parent ? parent.children : nodes) ?? [];
  const staying = siblings.filter((node) => !dragged.has(node.id));
  let at = target.index < staying.length ? siblings.indexOf(staying[target.index]!) : siblings.length;
  const commands: OutlineCommand<OutlineItemData>[] = [];
  const created: string[] = [];
  const copies = cloneWithFreshIds(roots.map((id) => findOutlineNode(nodes, id)!.node as OutlineItem), createId);
  for (const copy of copies) {
    created.push(copy.id);
    commands.push({ type: "insert", parentId: target.parentId, index: at++, node: copy });
  }
  return { commands, created };
}
