import type {
  MachineGraph,
  MachineDirection,
  MachineLayout,
  MachineLayoutNode,
  MachineNode,
} from "./types.js";
/** Collapse cycles before ranking, so back-edges never create runaway layout ranks. */
function siblingRanks(graph: MachineGraph, siblings: readonly MachineNode[]): Map<string, number> {
  const ids = new Set(siblings.map((n) => n.id));
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const representative = (id: string): string | undefined => {
    const seen = new Set<string>();
    let current: string | undefined = id;
    while (current && !seen.has(current)) {
      if (ids.has(current)) return current;
      seen.add(current);
      current = byId.get(current)?.parentId;
    }
    return undefined;
  };
  const edges = new Map(siblings.map((n) => [n.id, new Set<string>()]));
  for (const t of graph.transitions) {
    const source = representative(t.sourceId),
      target = representative(t.targetId);
    if (source && target && source !== target) edges.get(source)!.add(target);
  }
  for (const node of graph.nodes)
    if (node.kind === "note" && node.attachedToId) {
      const source = representative(node.attachedToId),
        target = representative(node.id);
      if (source && target && source !== target) edges.get(source)!.add(target);
    }
  // Iterative two-pass SCC partition avoids recursion and quadratic reachability storage.
  const visited = new Set<string>();
  const finished: string[] = [];
  for (const node of siblings) {
    if (visited.has(node.id)) continue;
    const stack: [string, boolean][] = [[node.id, false]];
    while (stack.length) {
      const [id, expanded] = stack.pop()!;
      if (expanded) {
        finished.push(id);
        continue;
      }
      if (visited.has(id)) continue;
      visited.add(id);
      stack.push([id, true]);
      for (const target of edges.get(id) ?? [])
        if (!visited.has(target)) stack.push([target, false]);
    }
  }
  const reverse = new Map(siblings.map((n) => [n.id, new Set<string>()]));
  for (const [source, targets] of edges)
    for (const target of targets) reverse.get(target)!.add(source);
  const component = new Map<string, number>();
  let count = 0;
  for (const start of finished.reverse()) {
    if (component.has(start)) continue;
    const pending = [start];
    while (pending.length) {
      const id = pending.pop()!;
      if (component.has(id)) continue;
      component.set(id, count);
      pending.push(...reverse.get(id)!);
    }
    count++;
  }
  const outgoing = Array.from({ length: count }, () => new Set<number>());
  const indegree = Array<number>(count).fill(0);
  const rank = Array<number>(count).fill(0);
  for (const [source, targets] of edges)
    for (const target of targets) {
      const a = component.get(source)!,
        b = component.get(target)!;
      if (a !== b && !outgoing[a]!.has(b)) {
        outgoing[a]!.add(b);
        indegree[b] = indegree[b]! + 1;
      }
    }
  const queue = indegree.flatMap((degree, index) => (degree === 0 ? [index] : []));
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i]!;
    for (const b of outgoing[a]!) {
      rank[b] = Math.max(rank[b]!, rank[a]! + 1);
      indegree[b] = indegree[b]! - 1;
      if (indegree[b] === 0) queue.push(b);
    }
  }
  return new Map(siblings.map((n) => [n.id, rank[component.get(n.id)!]!]));
}
/** Deterministic topology-aware hierarchical layout. All returned positions are absolute. */
export function layoutMachineGraph(
  graph: MachineGraph,
  direction: MachineDirection = "LR",
  preservePositions = true,
): MachineLayout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const header = (node: MachineNode) =>
    node.entry?.length || node.exit?.length ? 120 : node.description ? 96 : 64;
  const shift = (rects: readonly MachineLayoutNode[], dx: number, dy: number) =>
    rects.map((r) => ({ ...r, x: r.x + dx, y: r.y + dy }));
  const group = (
    siblings: readonly MachineNode[],
    depth: number,
    path: ReadonlySet<string>,
  ): MachineLayoutNode[] => {
    const ranks = siblingRanks(graph, siblings);
    const layers = new Map<number, { node: MachineNode; rects: MachineLayoutNode[] }[]>();
    for (const node of siblings) {
      if (path.has(node.id)) continue;
      const nextPath = new Set([...path, node.id]);
      const children =
        depth < 64 ? graph.nodes.filter((n) => n.parentId === node.id && !nextPath.has(n.id)) : [];
      const childRects = shift(group(children, depth + 1, nextPath), 24, header(node));
      const width = Math.max(
        node.kind === "initial" || node.kind === "final" ? 120 : 184,
        ...childRects.map((r) => r.x + r.width + 24),
      );
      const height = Math.max(
        node.kind === "submachine"
          ? 144
          : node.entry?.length || node.exit?.length
            ? 148
            : node.description
              ? 128
              : 104,
        ...childRects.map((r) => r.y + r.height + 24),
      );
      const rects = [{ id: node.id, x: 0, y: 0, width, height, depth }, ...childRects];
      const rank = ranks.get(node.id) ?? 0;
      const entries = layers.get(rank) ?? [];
      entries.push({ node, rects });
      layers.set(rank, entries);
    }
    const result: MachineLayoutNode[] = [];
    let major = 0;
    for (const [, entries] of [...layers].sort(([a], [b]) => a - b)) {
      let minor = 0;
      let majorSize = 0;
      for (const entry of entries) {
        const rect = entry.rects[0]!;
        result.push(
          ...shift(
            entry.rects,
            direction === "LR" ? major : minor,
            direction === "LR" ? minor : major,
          ),
        );
        minor += (direction === "LR" ? rect.height : rect.width) + 40;
        majorSize = Math.max(majorSize, direction === "LR" ? rect.width : rect.height);
      }
      major += majorSize + 80;
    }
    return result;
  };
  let result = shift(
    group(
      graph.nodes.filter((n) => !n.parentId || !byId.has(n.parentId)),
      0,
      new Set(),
    ),
    24,
    24,
  );
  const descendants = (id: string) => {
    const ids = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const node of graph.nodes)
        if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
          ids.add(node.id);
          changed = true;
        }
    }
    return ids;
  };
  if (preservePositions)
    for (const node of [...graph.nodes].sort(
      (a, b) =>
        (result.find((r) => r.id === a.id)?.depth ?? 0) -
        (result.find((r) => r.id === b.id)?.depth ?? 0),
    )) {
      if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y))
        continue;
      const rect = result.find((r) => r.id === node.id);
      if (!rect) continue;
      const dx = node.position.x - rect.x,
        dy = node.position.y - rect.y;
      const ids = descendants(node.id);
      result = result.map((r) => (ids.has(r.id) ? { ...r, x: r.x + dx, y: r.y + dy } : r));
    }
  // A manually positioned child may expand its ancestor in any direction.
  for (const ordered of [...result].sort((a, b) => b.depth - a.depth)) {
    const r = result.find((n) => n.id === ordered.id)!;
    const node = byId.get(r.id);
    const parentNode = node?.parentId ? byId.get(node.parentId) : undefined;
    const parentIndex = result.findIndex((p) => p.id === parentNode?.id);
    const p = result[parentIndex];
    if (!p || !parentNode) continue;
    const x = Math.min(p.x, r.x - 24),
      y = Math.min(p.y, r.y - header(parentNode));
    result[parentIndex] = {
      ...p,
      x,
      y,
      width: Math.max(p.x + p.width, r.x + r.width + 24) - x,
      height: Math.max(p.y + p.height, r.y + r.height + 24) - y,
    };
  }
  result.sort(
    (a, b) =>
      a.depth - b.depth ||
      graph.nodes.findIndex((n) => n.id === a.id) - graph.nodes.findIndex((n) => n.id === b.id),
  );
  return {
    nodes: result,
    width: Math.max(400, ...result.map((r) => r.x + r.width + 24)),
    height: Math.max(240, ...result.map((r) => r.y + r.height + 24)),
  };
}
