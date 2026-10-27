import {
  applyOutlineCommand,
  type OutlineNode,
  type OutlineCommand,
  type OutlineCommandResult,
  type OutlineEditPolicy,
} from "./index.js";

export interface OutlineLocation<T = unknown> {
  readonly node: OutlineNode<T>;
  readonly parentId: string | null;
  readonly index: number;
  readonly ancestors: readonly OutlineNode<T>[];
}

/** Returns a location in pre-order. Callers at external data boundaries should validate first. */
export function findOutlineNode<T>(
  nodes: readonly OutlineNode<T>[],
  id: string,
): OutlineLocation<T> | undefined {
  const pending: OutlineLocation<T>[] = nodes
    .map((node, index) => ({ node, index, parentId: null, ancestors: [] }))
    .reverse();
  while (pending.length) {
    const location = pending.pop()!;
    if (location.node.id === id) return location;
    const children = location.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index--)
      pending.push({
        node: children[index]!,
        index,
        parentId: location.node.id,
        ancestors: [...location.ancestors, location.node],
      });
  }
  return undefined;
}

export function getOutlinePath<T>(
  nodes: readonly OutlineNode<T>[],
  id: string,
): readonly OutlineNode<T>[] {
  const location = findOutlineNode(nodes, id);
  return location ? [...location.ancestors, location.node] : [];
}

export function outlineIds<T>(nodes: readonly OutlineNode<T>[]): readonly string[] {
  const ids: string[] = [];
  const pending = [...nodes].reverse();
  while (pending.length) {
    const node = pending.pop()!;
    ids.push(node.id);
    for (let i = (node.children?.length ?? 0) - 1; i >= 0; i--) pending.push(node.children![i]!);
  }
  return ids;
}

/** Selected descendants are carried by their selected ancestor, never operated on twice. */
export function selectionRoots<T>(
  nodes: readonly OutlineNode<T>[],
  selected: ReadonlySet<string>,
): readonly string[] {
  return outlineIds(nodes).filter(
    (id) =>
      selected.has(id) &&
      !findOutlineNode(nodes, id)!.ancestors.some((ancestor) => selected.has(ancestor.id)),
  );
}

/** A batch is atomic, including policy refusals part-way through. */
export function applyOutlineTransaction<T>(
  nodes: readonly OutlineNode<T>[],
  commands: readonly OutlineCommand<T>[],
  policy: OutlineEditPolicy<T> = {},
): OutlineCommandResult<T> {
  if (policy.readOnly !== false) return { ok: false, nodes, reason: "read-only" };
  let next = nodes;
  for (const command of commands) {
    const result = applyOutlineCommand(next, command, policy);
    if (!result.ok) return { ...result, nodes };
    next = result.nodes;
  }
  return { ok: true, nodes: next };
}

export function indentOutlineNode<T>(
  nodes: readonly OutlineNode<T>[],
  id: string,
  policy: OutlineEditPolicy<T> = {},
): OutlineCommandResult<T> {
  const source = findOutlineNode(nodes, id);
  if (!source) return { ok: false, nodes, reason: "not-found" };
  if (!source.index) return { ok: true, nodes };
  const siblings =
    source.parentId === null ? nodes : findOutlineNode(nodes, source.parentId)!.node.children!;
  return applyOutlineCommand(
    nodes,
    { type: "move", id, parentId: siblings[source.index - 1]!.id },
    policy,
  );
}

/** Promote after its parent; following siblings become children to preserve visual order. */
export function outdentOutlineNode<T>(
  nodes: readonly OutlineNode<T>[],
  id: string,
  policy: OutlineEditPolicy<T> = {},
): OutlineCommandResult<T> {
  const source = findOutlineNode(nodes, id);
  if (!source) return { ok: false, nodes, reason: "not-found" };
  if (source.parentId === null) return { ok: true, nodes };
  const parent = findOutlineNode(nodes, source.parentId)!;
  const younger = (parent.node.children ?? []).slice(source.index + 1);
  return applyOutlineTransaction(
    nodes,
    [
      ...younger.map((node): OutlineCommand<T> => ({ type: "move", id: node.id, parentId: id })),
      { type: "move", id, parentId: parent.parentId, index: parent.index + 1 },
    ],
    policy,
  );
}

export function moveOutlineSelection<T>(
  nodes: readonly OutlineNode<T>[],
  ids: readonly string[],
  direction: "up" | "down",
  policy: OutlineEditPolicy<T> = {},
  scopeId: string | null = null,
): OutlineCommandResult<T> {
  if (policy.readOnly !== false) return { ok: false, nodes, reason: "read-only" };
  const roots = selectionRoots(nodes, new Set(ids)).map((id) => findOutlineNode(nodes, id)!);
  if (!roots.length) return { ok: true, nodes };
  const first = roots[0]!,
    last = roots.at(-1)!;
  if (
    roots.some(
      (item, index) => item.parentId !== first.parentId || item.index !== first.index + index,
    )
  )
    return { ok: false, nodes, reason: "invalid-command" };
  if (roots.some((item) => item.node.id === scopeId)) return { ok: true, nodes };
  const siblings =
    first.parentId === null ? nodes : findOutlineNode(nodes, first.parentId)!.node.children!;
  let parentId = first.parentId,
    index = direction === "up" ? first.index - 1 : first.index + 1;
  if (
    (direction === "up" && first.index === 0) ||
    (direction === "down" && last.index === siblings.length - 1)
  ) {
    if (first.parentId === null || first.parentId === scopeId) return { ok: true, nodes };
    const parent = findOutlineNode(nodes, first.parentId)!;
    const uncles =
      parent.parentId === null ? nodes : findOutlineNode(nodes, parent.parentId)!.node.children!;
    const uncle = uncles[parent.index + (direction === "up" ? -1 : 1)];
    if (uncle) {
      parentId = uncle.id;
      index = direction === "up" ? (uncle.children?.length ?? 0) : 0;
    } else {
      parentId = parent.parentId;
      index = parent.index + (direction === "up" ? 0 : 1);
    }
  }
  return applyOutlineTransaction(
    nodes,
    [
      ...roots.map((item): OutlineCommand<T> => ({ type: "remove", id: item.node.id })),
      ...roots.map((item, offset): OutlineCommand<T> => ({
        type: "insert",
        parentId,
        index: index + offset,
        node: item.node,
      })),
    ],
    policy,
  );
}

export function moveOutlineNode<T>(
  nodes: readonly OutlineNode<T>[],
  id: string,
  direction: "up" | "down",
  policy: OutlineEditPolicy<T> = {},
): OutlineCommandResult<T> {
  if (!findOutlineNode(nodes, id)) return { ok: false, nodes, reason: "not-found" };
  return moveOutlineSelection(nodes, [id], direction, policy);
}

export interface OutlineDropTarget {
  readonly parentId: string | null;
  readonly index: number;
  readonly depth: number;
}
/**
 * A visual gap is computed after removing the moving roots. Only preceding rows may
 * become parents; the untouched row below a gap is never adopted accidentally.
 */
export function planOutlineDrop<T>(
  nodes: readonly OutlineNode<T>[],
  visibleIds: readonly string[],
  movingIds: readonly string[],
  gap: number,
  requestedDepth: number,
): OutlineDropTarget | null {
  const moving = selectionRoots(nodes, new Set(movingIds));
  if (!moving.length || !Number.isFinite(gap) || !Number.isFinite(requestedDepth)) return null;
  const removedIds = new Set(
    moving.flatMap((id) => outlineIds([findOutlineNode(nodes, id)!.node])),
  );
  const remaining = visibleIds.filter((id) => !removedIds.has(id));
  const position = Math.max(0, Math.min(remaining.length, Math.floor(gap)));
  const previous = position > 0 ? findOutlineNode(nodes, remaining[position - 1]!) : undefined;
  const depth = Math.max(
    0,
    Math.min(previous ? previous.ancestors.length + 1 : 0, Math.floor(requestedDepth)),
  );
  const parent = depth === 0 ? undefined : [...previous!.ancestors, previous!.node][depth - 1];
  const siblings = parent?.children ?? nodes;
  const surviving = siblings.filter((node) => !removedIds.has(node.id));
  let index = 0;
  if (previous) {
    const chain = [...previous.ancestors, previous.node];
    const precedingSibling = chain[depth];
    index = precedingSibling
      ? surviving.findIndex((node) => node.id === precedingSibling.id) + 1
      : 0;
  }
  return { parentId: parent?.id ?? null, index, depth };
}
