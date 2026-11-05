import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk-api";
import type {
  MachineDirection,
  MachineGraph,
  MachineNode,
  MachineTransition,
} from "../core/index.js";
import { isNestedTransition } from "../machine-shared/machine-issues.js";

/**
 * Anti-corruption layer around ELK. Input: a portable MachineGraph. Output: absolute boxes
 * for every state (plus synthetic initial markers) and orthogonal edge routes with label
 * boxes, so the canvas never has to guess where a line or an event label goes.
 *
 * Two passes:
 *  1. `layoutMachine` — pure ELK over the structure (positions ignored). Deterministic, so the
 *     controller caches it by structure and skips ELK entirely when only positions change.
 *  2. `applyPinnedPositions` — the user's manual layout wins: pinned nodes (`node.position`,
 *     absolute canvas coordinates, the core convention) move with their subtree, containers
 *     grow to keep their children, and routes whose endpoints no longer match are dropped
 *     (the canvas draws those with a live smooth-step path instead).
 */
export interface LaidOutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly parentId?: string;
  /** Synthetic initial-state dot owned by `ownerId` (null owner = machine root). */
  readonly initialOf?: string | null;
}
export interface LaidOutEdge {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly label?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  /**
   * How much of the chip text fits where it sits: "full" (event [guard] / actions), "guard"
   * (event [guard] …) or "event" (event …). A long chip that would cross another line in its
   * corridor drops its actions (then its guard) instead of covering it; "…" says a part is
   * hidden, hovering or focusing the chip shows it in place, and the full text stays in its
   * tooltip and accessible name.
   */
  readonly fit?: ChipFit;
  readonly synthetic?: "initial" | "note";
}
export type ChipFit = "full" | "guard" | "event";
/** Chip text for a fit (the canvas renders the same parts; "…" marks a hidden part). */
export function chipText(t: MachineTransition, fit: ChipFit = "full"): string {
  const more = " …";
  if (fit === "event") return `${t.event || "always"}${t.guard || t.actions?.length ? more : ""}`;
  if (fit === "guard")
    return `${[t.event || "always", t.guard ? `[${t.guard}]` : ""].filter(Boolean).join(" ")}${t.actions?.length ? more : ""}`;
  return transitionLabel(t);
}
export const chipWidth = (text: string) => Math.min(LABEL_MAX, text.length * MONO + 18);
export interface MachineGraphLayout {
  readonly nodes: ReadonlyMap<string, LaidOutNode>;
  readonly edges: readonly LaidOutEdge[];
  readonly width: number;
  readonly height: number;
}
/** Layout knobs that depend on the host, not the document. */
export interface MachineLayoutOptions {
  /** Narrow containers: parallel regions stack vertically instead of sitting side by side. */
  readonly stackRegions?: boolean;
}
/** Measured content heights fed back from the DOM, keyed by node id and content signature. */
export type MachineSizeHints = ReadonlyMap<
  string,
  { readonly key: string; readonly height: number }
>;

const elk = new ELK();

export const INITIAL_SIZE = 14;
export const HEADER = 34;
/** Container padding (must match the ELK padding below). */
export const PAD = 14;
/** Minimum clear space between sibling boxes after a manual move. */
const GAP = 16;
const CHAR = 7.1;
const MONO = 6.7;
/** Mono label chip: max rendered width (keep in sync with the chip's max-w in the canvas). */
export const LABEL_MAX = 300;
/** Character counts of the kind tag rendered in each node header (see KIND_LABEL). */
const KIND_CHARS: Record<MachineNode["kind"], number> = {
  atomic: 5,
  compound: 8,
  parallel: 8,
  initial: 0,
  final: 5,
  submachine: 10,
  note: 0,
};

/** Content signature: a measured height is only trusted while this is unchanged. */
export const contentKey = (node: MachineNode) =>
  JSON.stringify([
    node.label,
    node.kind,
    node.description ?? "",
    node.entry ?? [],
    node.exit ?? [],
    node.tags ?? [],
  ]);

/** Content-aware size estimate; measured DOM heights (when present and current) win. */
export function measureNode(
  node: MachineNode,
  hints?: MachineSizeHints,
): { width: number; height: number } {
  if (node.kind === "initial") return { width: INITIAL_SIZE, height: INITIAL_SIZE };
  const hint = hints?.get(node.id);
  const measured = hint && hint.key === contentKey(node) ? hint.height : undefined;
  if (node.kind === "note") {
    const lines = Math.max(1, Math.ceil((node.label.length * 6.1) / 162));
    return { width: 200, height: measured ?? 18 + lines * 16 };
  }
  const actions = (node.entry?.length ?? 0) + (node.exit?.length ?? 0);
  const longestAction = Math.max(
    0,
    ...[...(node.entry ?? []), ...(node.exit ?? [])].map((a) => a.length + 6),
  );
  const width = Math.round(
    Math.min(
      300,
      Math.max(
        164,
        node.label.length * 7.6 + 48 + KIND_CHARS[node.kind] * 6.4 + 12,
        longestAction * MONO + 28,
        (node.tags?.length ?? 0) * 72,
      ),
    ),
  );
  // Description wraps inside the final width (px-3 on both sides), clamped to three lines.
  const descLines = node.description
    ? Math.min(3, Math.ceil((node.description.length * 6.05) / (width - 24)))
    : 0;
  const hasBody = descLines || actions || node.tags?.length;
  const estimate =
    HEADER +
    (descLines ? descLines * 16 : 0) +
    (actions ? actions * 18 : 0) +
    (node.tags?.length ? 22 : 0) +
    (hasBody ? 14 : 0);
  return { width, height: Math.max(HEADER, measured ?? estimate) };
}

export function transitionLabel(t: MachineTransition): string {
  return [
    t.event || "always",
    t.guard ? `[${t.guard}]` : "",
    t.actions?.length ? `/ ${t.actions.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * "auto" lays out both ways and keeps the orientation that reads best: fit is capped at
 * 100% (a graph that fits either way at full size prefers left-to-right), and top-to-bottom
 * must win clearly (8%), or be the only orientation that fits at 90% or more.
 */
export async function layoutMachineAuto(
  graph: MachineGraph,
  direction: MachineDirection | "auto",
  viewport = { width: 960, height: 600 },
  hints?: MachineSizeHints,
  options: MachineLayoutOptions = {},
): Promise<MachineGraphLayout & { readonly direction: MachineDirection }> {
  if (direction !== "auto")
    return { ...(await layoutMachine(graph, direction, hints, options)), direction };
  const [lr, tb] = await Promise.all([
    layoutMachine(graph, "LR", hints, options),
    layoutMachine(graph, "TB", hints, options),
  ]);
  // Score against the space a fit really gets (minus floating chrome and margins).
  const W = Math.max(200, viewport.width - 110),
    H = Math.max(200, viewport.height - 90);
  const fit = (l: MachineGraphLayout) => Math.min(1, W / l.width, H / l.height);
  return pickDirection(fit(lr), fit(tb)) === "TB"
    ? { ...tb, direction: "TB" }
    : { ...lr, direction: "LR" };
}

/** Fit zoom at or above which text reads at its designed size (9.5px tags stay ≥ ~8.5px). */
export const READABLE_ZOOM = 0.9;
/**
 * "auto" picks by the zoom each direction would fit at (1 = no shrink), never by graph shape:
 *  1. the direction that fits at a readable zoom (≥ 0.9) wins; left-to-right when both do;
 *  2. else the more readable one, with a small bias to left-to-right (it reads best), so
 *     top-to-bottom must fit at least 8% larger.
 * E.g. the incident example in an 860×750 desktop band: LR 0.46, TB 0.77 → TB.
 */
export function pickDirection(lrZoom: number, tbZoom: number): MachineDirection {
  if (lrZoom >= READABLE_ZOOM) return "LR";
  if (tbZoom >= READABLE_ZOOM) return "TB";
  return tbZoom > lrZoom * 1.08 ? "TB" : "LR";
}

export { isAncestor, isNestedTransition } from "../machine-shared/machine-issues.js";

export async function layoutMachine(
  graph: MachineGraph,
  direction: MachineDirection,
  hints?: MachineSizeHints,
  options: MachineLayoutOptions = {},
): Promise<MachineGraphLayout> {
  const children = new Map<string | undefined, MachineNode[]>();
  for (const node of graph.nodes) {
    if (node.kind === "note") continue;
    const key = node.parentId;
    children.set(key, [...(children.get(key) ?? []), node]);
  }
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const isContainer = (node: MachineNode) => children.has(node.id);
  const syntheticEdges: ElkExtendedEdge[] = [];

  const build = (parentId: string | undefined): ElkNode[] => {
    const list: ElkNode[] = [];
    const owner = parentId ? byId.get(parentId) : undefined;
    const initialId = parentId ? owner?.initialId : graph.initialId;
    const parallel = owner?.kind === "parallel";
    // An explicit `initial` pseudo-state already is the dot: never draw a second one.
    if (
      initialId &&
      !parallel &&
      byId.get(initialId)?.kind !== "initial" &&
      children.get(parentId)?.some((n) => n.id === initialId)
    ) {
      const markerId = `__init:${parentId ?? "root"}`;
      list.push({ id: markerId, width: INITIAL_SIZE, height: INITIAL_SIZE });
      syntheticEdges.push({
        id: `__init-edge:${parentId ?? "root"}`,
        sources: [markerId],
        targets: [initialId],
      });
    }
    for (const node of children.get(parentId) ?? []) {
      if (isContainer(node)) {
        list.push({
          id: node.id,
          layoutOptions: {
            "elk.padding": `[top=${HEADER + PAD},left=${PAD},bottom=${PAD},right=${PAD}]`,
            "elk.direction":
              node.kind === "parallel"
                ? direction === "LR"
                  ? "DOWN"
                  : "RIGHT"
                : direction === "LR"
                  ? "RIGHT"
                  : "DOWN",
            "elk.spacing.nodeNode": node.kind === "parallel" ? "12" : "28",
            "elk.layered.spacing.nodeNodeBetweenLayers": "40",
            "elk.nodeSize.constraints": "MINIMUM_SIZE",
            "elk.nodeSize.minimum": `(${Math.max(180, node.label.length * CHAR + 110)},${HEADER + 40})`,
          },
          children: build(node.id),
        });
      } else {
        list.push({ id: node.id, ...measureNode(node, hints) });
      }
    }
    return list;
  };

  // A transition into (or out of) the state's own descendant has no sensible hierarchical
  // route: ELK loops it over the container header. It is drawn live as an internal arrow.
  const nested = graph.transitions.filter(
    (t) => byId.has(t.sourceId) && byId.has(t.targetId) && isNestedTransition(graph, t),
  );
  const edges: ElkExtendedEdge[] = graph.transitions
    .filter((t) => byId.has(t.sourceId) && byId.has(t.targetId) && !nested.includes(t))
    .map((t) => {
      const text = transitionLabel(t);
      return {
        id: t.id,
        sources: [t.sourceId],
        targets: [t.targetId],
        labels: [
          {
            id: `${t.id}:label`,
            text,
            width: Math.min(LABEL_MAX, text.length * MONO + 18),
            height: 20,
          },
        ],
      };
    });

  const root: ElkNode = {
    id: "__root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": direction === "LR" ? "RIGHT" : "DOWN",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN",
      "elk.edgeRouting": "ORTHOGONAL",
      "elk.layered.spacing.nodeNodeBetweenLayers": "44",
      "elk.spacing.nodeNode": "24",
      "elk.spacing.edgeNode": "18",
      "elk.spacing.edgeEdge": "12",
      "elk.spacing.edgeLabel": "4",
      "elk.layered.spacing.edgeNodeBetweenLayers": "20",
      "elk.edgeLabels.inline": "true",
      "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
      "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
      "elk.json.edgeCoords": "ROOT",
      "elk.json.shapeCoords": "ROOT",
      "elk.padding": "[top=24,left=24,bottom=24,right=24]",
    },
    children: build(undefined),
    edges: [...syntheticEdges, ...edges],
  };

  // With INCLUDE_CHILDREN, ELK uses the root direction everywhere: unconnected regions share a
  // layer (side by side in TB, stacked in LR). To stack them in TB, chain them with invisible
  // ordering edges so each region takes the next layer.
  if (options.stackRegions && direction === "TB") {
    for (const owner of graph.nodes.filter((n) => n.kind === "parallel")) {
      const regions = (children.get(owner.id) ?? []).filter((n) => n.kind !== "initial");
      for (let i = 1; i < regions.length; i++)
        (root.edges as ElkExtendedEdge[]).push({
          id: `__order:${owner.id}:${i}`,
          sources: [regions[i - 1]!.id],
          targets: [regions[i]!.id],
        });
    }
  }
  const result = await elk.layout(root);
  const nodes = new Map<string, LaidOutNode>();
  const visit = (items: ElkNode[] | undefined, parentId?: string) => {
    for (const item of items ?? []) {
      const initialOf = item.id.startsWith("__init:")
        ? item.id.slice(7).replace(/^root$/, "") || null
        : undefined;
      nodes.set(item.id, {
        id: item.id,
        x: item.x ?? 0,
        y: item.y ?? 0,
        width: item.width ?? 0,
        height: item.height ?? 0,
        parentId,
        ...(initialOf !== undefined ? { initialOf } : {}),
      });
      visit(item.children, item.id);
    }
  };
  visit(result.children);

  // Parallel regions read as one band: align them on the cross axis and give them one
  // extent (same height side by side, same width stacked). Region contents move with them;
  // routes that cross a region boundary are re-drawn live.
  const shifted = new Map<string, { dx: number; dy: number }>();
  const subtreeIds = (id: string): string[] => [
    id,
    ...[...nodes.values()].filter((n) => n.parentId === id).flatMap((n) => subtreeIds(n.id)),
  ];
  for (const owner of graph.nodes.filter((n) => n.kind === "parallel" && nodes.has(n.id))) {
    const regions = [...nodes.values()].filter(
      (n) => n.parentId === owner.id && !n.id.startsWith("__"),
    );
    if (regions.length < 2) continue;
    // Mirrors the parallel's elk.direction above: side by side (RIGHT) or stacked (DOWN).
    const horizontal = !(direction === "LR" || options.stackRegions);
    const start = Math.min(...regions.map((r) => (horizontal ? r.y : r.x)));
    const extent =
      Math.max(...regions.map((r) => (horizontal ? r.y + r.height : r.x + r.width))) - start;
    for (const r of regions) {
      const delta = horizontal ? { dx: 0, dy: start - r.y } : { dx: start - r.x, dy: 0 };
      for (const id of subtreeIds(r.id)) {
        const b = nodes.get(id)!;
        nodes.set(id, { ...b, x: b.x + delta.dx, y: b.y + delta.dy });
        if (delta.dx || delta.dy) shifted.set(id, delta);
      }
      const moved = nodes.get(r.id)!;
      nodes.set(r.id, horizontal ? { ...moved, height: extent } : { ...moved, width: extent });
    }
  }

  // Notes float beside the state they annotate; they never participate in routing.
  for (const note of graph.nodes.filter((n) => n.kind === "note")) {
    const anchor = note.attachedToId ? nodes.get(note.attachedToId) : undefined;
    const size = measureNode(note, hints);
    const x = anchor ? anchor.x + anchor.width + 28 : (result.width ?? 0) + 24;
    const y = anchor ? anchor.y + anchor.height + 18 : 24;
    nodes.set(note.id, { id: note.id, x, y, ...size });
  }

  // What a chip must never cover: every state box, and container headers.
  const obstacles = [...nodes.values()].map((n) =>
    children.has(n.id) ? { x: n.x, y: n.y, width: n.width, height: HEADER } : n,
  );
  // Pass 1: every route, so each chip can be kept off the OTHER routes (shared bus lanes included).
  const routed: { edge: ElkExtendedEdge; points: { x: number; y: number }[]; label?: Box }[] = [];
  const byTransition = new Map(graph.transitions.map((t) => [t.id, t]));
  const laidEdges: LaidOutEdge[] = [];
  for (const edge of (result.edges ?? []) as ElkExtendedEdge[]) {
    const section = edge.sections?.[0];
    if (!section || edge.id.startsWith("__order:")) continue;
    const ds = shifted.get(edge.sources[0]!) ?? { dx: 0, dy: 0 };
    const dt = shifted.get(edge.targets[0]!) ?? { dx: 0, dy: 0 };
    if (ds.dx !== dt.dx || ds.dy !== dt.dy) {
      laidEdges.push({
        id: edge.id,
        sourceId: edge.sources[0]!,
        targetId: edge.targets[0]!,
        points: [],
        ...(edge.id.startsWith("__init-edge:") ? { synthetic: "initial" as const } : {}),
      });
      continue;
    }
    const move = (p: { x: number; y: number }) => ({ x: p.x + ds.dx, y: p.y + ds.dy });
    const raw = edge.labels?.[0];
    const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map(move);
    routed.push({
      edge,
      points,
      ...(raw
        ? {
            label: {
              x: (raw.x ?? 0) + ds.dx,
              y: (raw.y ?? 0) + ds.dy,
              width: raw.width ?? 0,
              height: raw.height ?? 0,
            },
          }
        : {}),
    });
  }
  // Pass 2: chips. Already placed chips, plus ELK's boxes for the ones still to come, so a move never crowds either.
  const placedLabels: Box[] = [];
  const pendingLabels = new Map(
    routed.flatMap((r) => (r.label ? [[r.edge.id, r.label] as const] : [])),
  );
  for (const { edge, points, label } of routed) {
    const lanes = routed.filter((other) => other.edge.id !== edge.id).map((other) => other.points);
    let box: Box | undefined;
    let fit: ChipFit = "full";
    if (label) {
      pendingLabels.delete(edge.id);
      const others = [...placedLabels, ...pendingLabels.values()];
      let best = placeLabel(points, label, obstacles, others, lanes);
      // No clean spot for the full chip: try it shorter (drop actions, then the guard) before accepting a collision.
      const t = byTransition.get(edge.id);
      for (const shorter of ["guard", "event"] as const) {
        if (best.cost === 0 || !t) break;
        const width = chipWidth(chipText(t, shorter));
        if (width >= label.width - 1) continue;
        const cx = label.x + label.width / 2;
        const tried = placeLabel(
          points,
          { ...label, x: cx - width / 2, width },
          obstacles,
          others,
          lanes,
        );
        if (tried.cost + 1 < best.cost) {
          best = tried;
          fit = shorter;
        }
      }
      box = best.box;
      placedLabels.push(box);
    }
    laidEdges.push({
      id: edge.id,
      sourceId: edge.sources[0]!,
      targetId: edge.targets[0]!,
      points,
      ...(box ? { label: box, ...(fit !== "full" ? { fit } : {}) } : {}),
      ...(edge.id.startsWith("__init-edge:") ? { synthetic: "initial" as const } : {}),
    });
  }
  for (const t of nested)
    laidEdges.push({ id: t.id, sourceId: t.sourceId, targetId: t.targetId, points: [] });
  return bounded(nodes, laidEdges);
}

type Box = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.width + gap &&
  b.x < a.x + a.width + gap &&
  a.y < b.y + b.height + gap &&
  b.y < a.y + a.height + gap;

type Point = { readonly x: number; readonly y: number };

/** Does segment a→b pass through the box (Liang–Barsky clip)? */
export function segmentHitsBox(a: Point, b: Point, box: Box): boolean {
  let t0 = 0,
    t1 = 1;
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const edges: [number, number][] = [
    [-dx, a.x - box.x],
    [dx, box.x + box.width - a.x],
    [-dy, a.y - box.y],
    [dy, box.y + box.height - a.y],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return false;
    } else {
      const r = q / p;
      if (p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

/** Arc-length samples along a polyline: the point, its distance from the start, and its distance to the nearest bend or end. */
function samplePath(points: readonly Point[], step: number) {
  const out: { x: number; y: number; s: number; corner: number }[] = [];
  let travelled = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (!len) continue;
    for (let d = 0; d < len; d += step)
      out.push({
        x: a.x + ((b.x - a.x) * d) / len,
        y: a.y + ((b.y - a.y) * d) / len,
        s: travelled + d,
        corner: Math.min(d, len - d),
      });
    travelled += len;
  }
  return out;
}

/** Clear space a chip keeps from every state box and container header. */
export const CHIP_NODE_GAP = 10;
/** Clear space a chip keeps from other chips. */
export const CHIP_CHIP_GAP = 6;

/**
 * Where an event chip goes: ON its own line, at the spot nearest ELK's choice that is clear.
 * Clear means: no state or container header within CHIP_NODE_GAP, no other chip within
 * CHIP_CHIP_GAP, and no OTHER route through it. The last rule is what keeps a chip off a shared
 * bus lane (every out-edge of a node leaves through one lane, so a chip centred there sat on
 * its siblings' lines and hugged the source border): the chip slides along its own path, past
 * the fork, onto a segment only it uses. When nothing is fully clear, the least-bad spot wins.
 */
export function placeLabel(
  points: readonly Point[],
  label: Box,
  obstacles: readonly Box[],
  placed: readonly Box[] = [],
  lanes: readonly (readonly Point[])[] = [],
): { box: Box; cost: number } {
  if (points.length < 2) return { box: label, cost: 0 };
  const at = (x: number, y: number): Box => ({
    ...label,
    x: x - label.width / 2,
    y: y - label.height / 2,
  });
  const inflate = (b: Box, by: number): Box => ({
    x: b.x - by,
    y: b.y - by,
    width: b.width + by * 2,
    height: b.height + by * 2,
  });
  const cost = (box: Box) => {
    let c = 0;
    for (const o of obstacles) if (overlaps(box, o, CHIP_NODE_GAP)) c += 100;
    for (const p of placed) if (overlaps(box, p, CHIP_CHIP_GAP)) c += 60;
    const hit = inflate(box, 2);
    for (const lane of lanes)
      for (let i = 1; i < lane.length; i++)
        if (segmentHitsBox(lane[i - 1]!, lane[i]!, hit)) c += 40;
    return c;
  };
  const near = nearestOnPath(points, {
    x: label.x + label.width / 2,
    y: label.y + label.height / 2,
  });
  const elkCost = near.d <= 6 ? cost(label) : Infinity;
  if (elkCost === 0) return { box: label, cost: 0 };
  const samples = samplePath(points, 4);
  const preferred = samples.reduce(
    (best, p) =>
      Math.hypot(p.x - near.x, p.y - near.y) < Math.hypot(best.x - near.x, best.y - near.y)
        ? p
        : best,
    samples[0]!,
  );
  let best: { box: Box; score: number; cost: number } = {
    box: label,
    score: elkCost,
    cost: elkCost,
  };
  for (const p of samples) {
    const box = at(p.x, p.y);
    const c = cost(box);
    // Stay near ELK's choice; a chip centred on a bend reads as belonging to neither leg.
    const score = c + Math.abs(p.s - preferred.s) * 0.02 + (p.corner < 8 ? 3 : 0);
    if (score < best.score) best = { box, score, cost: c };
  }
  return { box: best.box, cost: Number.isFinite(best.cost) ? best.cost : 1000 };
}

/** Nearest point on a polyline. */
function nearestOnPath(points: readonly Point[], p: Point) {
  let best = { x: points[0]!.x, y: points[0]!.y, d: Infinity };
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!,
      b = points[i]!;
    const len = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    const t = len
      ? Math.max(0, Math.min(1, ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len))
      : 0;
    const x = a.x + t * (b.x - a.x),
      y = a.y + t * (b.y - a.y);
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < best.d) best = { x, y, d };
  }
  return best;
}

function bounded(
  nodes: ReadonlyMap<string, LaidOutNode>,
  edges: readonly LaidOutEdge[],
): MachineGraphLayout {
  let width = 0;
  let height = 0;
  for (const node of nodes.values()) {
    width = Math.max(width, node.x + node.width + 24);
    height = Math.max(height, node.y + node.height + 24);
  }
  return { nodes, edges, width, height };
}

/**
 * Pinned positions win; ELK fills the rest. Shallow pins move first and carry their subtree,
 * deeper pins then place themselves; containers grow (never shrink) to keep every child
 * inside their padding. A route survives only when both endpoints moved by the same delta
 * and neither was resized (it is translated); otherwise it is dropped and drawn live.
 */
export function applyPinnedPositions(
  raw: MachineGraphLayout,
  graph: MachineGraph,
): MachineGraphLayout {
  const pinned = graph.nodes.filter((n) => n.position && raw.nodes.has(n.id));
  if (!pinned.length) return raw;
  const boxes = new Map<
    string,
    {
      x: number;
      y: number;
      width: number;
      height: number;
      parentId?: string;
      initialOf?: string | null;
    }
  >();
  for (const [id, box] of raw.nodes) boxes.set(id, { ...box });
  const childrenOf = new Map<string, string[]>();
  for (const box of raw.nodes.values())
    if (box.parentId)
      childrenOf.set(box.parentId, [...(childrenOf.get(box.parentId) ?? []), box.id]);
  const subtree = (id: string): string[] => [id, ...(childrenOf.get(id) ?? []).flatMap(subtree)];
  const depthOf = (id: string) => {
    let d = 0;
    for (let p = raw.nodes.get(id)?.parentId; p; p = raw.nodes.get(p)?.parentId) d++;
    return d;
  };
  for (const node of [...pinned].sort((a, b) => depthOf(a.id) - depthOf(b.id))) {
    const box = boxes.get(node.id)!;
    const dx = node.position!.x - box.x;
    const dy = node.position!.y - box.y;
    if (!dx && !dy) continue;
    for (const id of subtree(node.id)) {
      const b = boxes.get(id)!;
      b.x += dx;
      b.y += dy;
    }
    // The synthetic initial dot follows the state it points at.
    for (const b of boxes.values()) {
      if (b.initialOf === undefined) continue;
      const route = raw.edges.find(
        (e) => e.synthetic === "initial" && e.sourceId === `__init:${b.initialOf ?? "root"}`,
      );
      if (route?.targetId === node.id) {
        b.x += dx;
        b.y += dy;
      }
    }
  }
  // Notes that are not pinned keep their offset from the state they annotate.
  for (const note of graph.nodes) {
    if (note.kind !== "note" || note.position || !note.attachedToId) continue;
    const anchorRaw = raw.nodes.get(note.attachedToId);
    const anchor = boxes.get(note.attachedToId);
    const b = boxes.get(note.id);
    if (!anchorRaw || !anchor || !b) continue;
    b.x += anchor.x - anchorRaw.x;
    b.y += anchor.y - anchorRaw.y;
  }
  // A pinned state never sits on a sibling: unpinned siblings it lands on are pushed out of
  // the way (with their subtree) along the shortest axis, a few passes at most.
  const pinnedSet = new Set(pinned.map((n) => n.id));
  const siblings = new Map<string | undefined, string[]>();
  for (const [id, b] of boxes)
    if (raw.nodes.get(id)) siblings.set(b.parentId, [...(siblings.get(b.parentId) ?? []), id]);
  const pushed = new Set<string>();
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const group of siblings.values()) {
      for (const pinId of group.filter((id) => pinnedSet.has(id) || pushed.has(id))) {
        const p = boxes.get(pinId)!;
        for (const otherId of group) {
          if (otherId === pinId || pinnedSet.has(otherId)) continue;
          const o = boxes.get(otherId)!;
          if (!overlaps(p, o, GAP - 1)) continue;
          const right = p.x + p.width + GAP - o.x;
          const down = p.y + p.height + GAP - o.y;
          const left = o.x + o.width + GAP - p.x;
          const up = o.y + o.height + GAP - p.y;
          const min = Math.min(right, down, left, up);
          const [dx, dy] =
            min === down
              ? [0, down]
              : min === right
                ? [right, 0]
                : min === up
                  ? [0, -up]
                  : [-left, 0];
          for (const id of subtree(otherId)) {
            const b = boxes.get(id)!;
            b.x += dx;
            b.y += dy;
          }
          pushed.add(otherId);
          moved = true;
        }
      }
    }
    if (!moved) break;
  }
  // Grow containers deepest-first so a child dragged past an edge stays visibly inside.
  const resized = new Set<string>();
  for (const id of [...childrenOf.keys()].sort((a, b) => depthOf(b) - depthOf(a))) {
    const p = boxes.get(id)!;
    let x0 = p.x,
      y0 = p.y,
      x1 = p.x + p.width,
      y1 = p.y + p.height;
    for (const childId of childrenOf.get(id)!) {
      const c = boxes.get(childId)!;
      x0 = Math.min(x0, c.x - PAD);
      y0 = Math.min(y0, c.y - HEADER - PAD);
      x1 = Math.max(x1, c.x + c.width + PAD);
      y1 = Math.max(y1, c.y + c.height + PAD);
    }
    if (x0 !== p.x || y0 !== p.y || x1 !== p.x + p.width || y1 !== p.y + p.height) {
      resized.add(id);
      Object.assign(p, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
    }
  }
  const delta = (id: string) => {
    const a = raw.nodes.get(id)!;
    const b = boxes.get(id)!;
    return { dx: b.x - a.x, dy: b.y - a.y };
  };
  const edges: LaidOutEdge[] = [];
  for (const edge of raw.edges) {
    if (!boxes.has(edge.sourceId) || !boxes.has(edge.targetId)) continue;
    const s = delta(edge.sourceId);
    const t = delta(edge.targetId);
    const intact =
      s.dx === t.dx && s.dy === t.dy && !resized.has(edge.sourceId) && !resized.has(edge.targetId);
    if (!intact) {
      edges.push({
        id: edge.id,
        sourceId: edge.sourceId,
        targetId: edge.targetId,
        points: [],
        ...(edge.synthetic ? { synthetic: edge.synthetic } : {}),
      });
      continue;
    }
    if (!s.dx && !s.dy) {
      edges.push(edge);
      continue;
    }
    edges.push({
      ...edge,
      points: edge.points.map((p) => ({ x: p.x + s.dx, y: p.y + s.dy })),
      ...(edge.label
        ? { label: { ...edge.label, x: edge.label.x + s.dx, y: edge.label.y + s.dy } }
        : {}),
    });
  }
  const nodes = new Map<string, LaidOutNode>();
  for (const [id, b] of boxes) nodes.set(id, { id, ...b });
  return bounded(nodes, edges);
}

/** Rounded orthogonal path through ELK's bend points. */
export function roundedPath(points: readonly { x: number; y: number }[], radius = 8): string {
  if (points.length < 2) return "";
  let d = `M ${points[0]!.x} ${points[0]!.y}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1]!,
      curr = points[i]!,
      next = points[i + 1]!;
    const inLen = Math.hypot(curr.x - prev.x, curr.y - prev.y);
    const outLen = Math.hypot(next.x - curr.x, next.y - curr.y);
    if (!inLen || !outLen) continue;
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const ax = curr.x - ((curr.x - prev.x) / inLen) * r;
    const ay = curr.y - ((curr.y - prev.y) / inLen) * r;
    const bx = curr.x + ((next.x - curr.x) / outLen) * r;
    const by = curr.y + ((next.y - curr.y) / outLen) * r;
    d += ` L ${ax} ${ay} Q ${curr.x} ${curr.y} ${bx} ${by}`;
  }
  const last = points.at(-1)!;
  return `${d} L ${last.x} ${last.y}`;
}
