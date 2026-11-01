import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api";
import { inlineToPlain, parseInline } from "./inline";
import type { OutlineItem } from "./types";

/**
 * Mind-map view (`data.view: "mindmap"`): the zoomed branch drawn as a map, the item in the
 * middle and its branches to either side. Like the board it is a projection of the same tree;
 * folding a node is the outline's own fold (reader state), so the list and the map agree.
 *
 *                       ┌ Evals ──┐                  ┌ Pricing ┐
 *          ┌ Red team ──┤         │      ┌──────────┐│         │
 *          │            └ Safety ─┼──────┤  Launch  ├┼ Docs ───┼─ FAQ
 *          └ Partners             │      └──────────┘│         └─ API ref
 *                                 └ Comms ┘           └ Support (+4)   ← folded: +count
 *
 * This file is the pure half: which nodes show, which side they sit on, keyboard travel, and
 * the layout (ELK, one layered pass per side, joined at the root). `outliner-mindmap.tsx` draws.
 */
export type MindSide = "root" | "start" | "end";

export interface MindMapNode {
  readonly id: string;
  readonly node: OutlineItem;
  readonly depth: number;
  readonly parentId: string | null;
  readonly side: MindSide;
  /** Children shown on the map (none while folded). */
  readonly childIds: readonly string[];
  readonly hasChildren: boolean;
  readonly folded: boolean;
  /** Descendants hidden by this node's fold (for the "+N" badge). */
  readonly hidden: number;
}

export interface MindGraph {
  readonly rootId: string;
  readonly nodes: ReadonlyMap<string, MindMapNode>;
  /** Document order (depth first). */
  readonly order: readonly string[];
  /** True when the node cap cut the map short. */
  readonly truncated: boolean;
}

/** The map stops growing here: past it, open a branch to see more. */
export const MIND_MAP_LIMIT = 400;

const countAll = (node: OutlineItem): number => (node.children ?? []).reduce((sum, child) => sum + 1 + countAll(child), 0);
const isDone = (node: OutlineItem) => node.checked === true || node.data?.completed === true;

/**
 * Which nodes show. The root is always open; any other node shows its children while it is
 * expanded in the outline. With four or more branches the root's children split into two
 * balanced halves by size (folds ignored, so folding never moves a branch across): the first
 * half on the end side, the rest on the start side.
 */
export function mindMapGraph(
  root: OutlineItem,
  expandedIds: ReadonlySet<string>,
  options: {
    readonly hideCompleted?: boolean;
    readonly limit?: number;
    /** Narrow screens grow the map to one side (a tall map fits a phone; a wide one shrinks to nothing). */
    readonly oneSided?: boolean;
    /** Nodes Hide completed keeps because they are still the target, and the path to them (target.ts linger). */
    readonly linger?: ReadonlySet<string>;
  } = {},
): MindGraph {
  const limit = options.limit ?? MIND_MAP_LIMIT;
  const keep = (node: OutlineItem) => !(options.hideCompleted && isDone(node)) || !!options.linger?.has(node.id);
  const nodes = new Map<string, MindMapNode>();
  const order: string[] = [];
  let truncated = false;
  const branches = (root.children ?? []).filter(keep);
  const sides = new Map<string, MindSide>();
  if (branches.length >= 4 && !options.oneSided) {
    // Balanced by full size, not visible size: folding a branch never moves others across.
    const weights = branches.map((branch) => 1 + countAll(branch));
    const total = weights.reduce((a, b) => a + b, 0);
    let running = 0;
    branches.forEach((branch, index) => {
      // Never leave a side empty: the last branch always goes to the start side.
      const end = index === 0 || (running + weights[index]! / 2 <= total / 2 && index < branches.length - 1);
      sides.set(branch.id, end ? "end" : "start");
      running += weights[index]!;
    });
  } else branches.forEach((branch) => sides.set(branch.id, "end"));

  const visit = (node: OutlineItem, depth: number, parentId: string | null, side: MindSide) => {
    if (order.length >= limit) {
      truncated = true;
      return;
    }
    order.push(node.id);
    const children = (node.children ?? []).filter(keep);
    const open = depth === 0 || expandedIds.has(node.id);
    const shown: string[] = [];
    nodes.set(node.id, {
      id: node.id,
      node,
      depth,
      parentId,
      side,
      childIds: shown,
      hasChildren: children.length > 0,
      folded: children.length > 0 && !open,
      hidden: children.length > 0 && !open ? countAll(node) : 0,
    });
    if (!open) return;
    for (const child of children) {
      if (order.length >= limit) {
        truncated = true;
        break;
      }
      shown.push(child.id);
      visit(child, depth + 1, node.id, depth === 0 ? (sides.get(child.id) ?? "end") : side);
    }
  };
  visit(root, 0, null, "root");
  return { rootId: root.id, nodes, order, truncated };
}

export type MindKey = "left" | "right" | "up" | "down" | "home";

/** Siblings on the same side, in order (the root's children split by side). */
function siblings(graph: MindGraph, node: MindMapNode): readonly string[] {
  if (!node.parentId) return [node.id];
  const parent = graph.nodes.get(node.parentId)!;
  return parent.childIds.filter((id) => graph.nodes.get(id)!.side === node.side);
}

/**
 * Arrow-key travel, visual: toward the root or away from it depending on the node's side.
 * `rtl` mirrors the map (the end side is on the left). Returns the node to move to, or
 * `{ unfold }` when the way outward is a fold to open first; null when there is nowhere to go.
 */
export function stepMindMap(graph: MindGraph, fromId: string | null, key: MindKey, rtl = false): { readonly id: string } | { readonly unfold: string } | null {
  const from = fromId ? graph.nodes.get(fromId) : undefined;
  if (!from || key === "home") return { id: graph.rootId };
  const visual = rtl ? (key === "left" ? "right" : key === "right" ? "left" : key) : key;
  if (visual === "up" || visual === "down") {
    const row = siblings(graph, from);
    const at = row.indexOf(from.id) + (visual === "up" ? -1 : 1);
    return at >= 0 && at < row.length ? { id: row[at]! } : null;
  }
  const outward = from.side === "root" ? (visual === "right" ? "end" : "start") : from.side === "end" ? "right" : "left";
  if (from.side === "root") {
    const first = from.childIds.find((id) => graph.nodes.get(id)!.side === outward);
    return first ? { id: first } : null;
  }
  if (visual === outward) {
    if (from.folded) return { unfold: from.id };
    return from.childIds[0] ? { id: from.childIds[0] } : null;
  }
  return from.parentId ? { id: from.parentId } : null;
}

/**
 * The fold an arrow opens or closes before it travels (folding is ←/→, as in the list):
 * outward on a folded node unfolds it; inward on an open node with children folds it. The
 * centre never folds. null: the arrow travels (stepMindMap).
 */
export function foldMindMap(graph: MindGraph, fromId: string | null, key: "left" | "right", rtl = false): string | null {
  const from = fromId ? graph.nodes.get(fromId) : undefined;
  if (!from || from.side === "root") return null;
  const visual = rtl ? (key === "left" ? "right" : "left") : key;
  const outward = from.side === "end" ? "right" : "left";
  if (visual === outward) return from.folded ? from.id : null;
  return from.hasChildren && !from.folded ? from.id : null;
}

/* ───────────────────────────── Layout ───────────────────────────── */

export interface MindBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Node box metrics; the view's CSS must match (padding, line height, max width). */
export const MIND_METRICS = {
  root: { font: "600 15px 'Geist Variable', ui-sans-serif, system-ui, sans-serif", line: 20, padX: 14, padY: 10, max: 240 },
  branch: { font: "500 13px 'Geist Variable', ui-sans-serif, system-ui, sans-serif", line: 18, padX: 10, padY: 6, max: 200 },
  leaf: { font: "400 13px 'Geist Variable', ui-sans-serif, system-ui, sans-serif", line: 18, padX: 10, padY: 6, max: 200 },
  /** A task's checkbox and its gap. */
  task: 20,
  /** Lines a node shows before it clamps. */
  lines: 3,
} as const;

/**
 * The smallest zoom a fit may choose: node labels (13 px at 1:1) never render below 12 px. A map
 * bigger than that leaves the rest to panning instead of shrinking into unreadable type.
 */
export const MIN_LABEL_PX = 12;
export const MIN_FIT_ZOOM = MIN_LABEL_PX / 13;

/**
 * The viewport that shows a laid-out map. Desktop centres it (a small map at 1:1, a large one
 * fitted with a margin); a phone pins the one-sided map to the top. Neither goes below
 * `MIN_FIT_ZOOM`: then the root stays in view (at the start edge on a phone) and the user pans.
 */
export function fitMindMap(
  boxes: ReadonlyMap<string, MindBox>,
  rootId: string,
  host: { readonly width: number; readonly height: number },
  options: { readonly narrow?: boolean; readonly rtl?: boolean } = {},
): { x: number; y: number; zoom: number } {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const box of boxes.values()) {
    x1 = Math.min(x1, box.x);
    y1 = Math.min(y1, box.y);
    x2 = Math.max(x2, box.x + box.width);
    y2 = Math.max(y2, box.y + box.height);
  }
  const width = x2 - x1, height = y2 - y1;
  const root = boxes.get(rootId) ?? { x: x1, y: y1, width, height };
  const clamp = (value: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, value));
  if (options.narrow) {
    const pad = 20;
    const zoom = clamp(Math.min((host.width - pad * 2) / width, (host.height - pad * 2) / height), MIN_FIT_ZOOM, 1);
    const fitsAcross = width * zoom <= host.width - pad * 2;
    const x = fitsAcross
      ? (host.width - width * zoom) / 2 - x1 * zoom
      : options.rtl
        ? host.width - pad - x2 * zoom
        : pad - x1 * zoom;
    const top = pad - y1 * zoom;
    const y = height * zoom <= host.height - pad * 2 ? top : clamp(host.height / 2 - (root.y + root.height / 2) * zoom, host.height - pad - y2 * zoom, top);
    return { x, y, zoom };
  }
  // A small map at 1:1; a large one fitted with an 18% margin each side. When that would go below
  // readable, a tighter 24 px margin may still show it whole; failing that, the root is centred
  // at the readable floor and the rest is a pan away.
  const roomy = Math.min(1, host.width / (width * 1.36), host.height / (height * 1.36));
  const tight = Math.min(1, (host.width - 48) / width, (host.height - 48) / height);
  const zoom = roomy >= MIN_FIT_ZOOM ? roomy : Math.max(MIN_FIT_ZOOM, tight);
  const whole = roomy >= MIN_FIT_ZOOM || tight >= MIN_FIT_ZOOM;
  const [cx, cy] = whole ? [x1 + width / 2, y1 + height / 2] : [root.x + root.width / 2, root.y + root.height / 2];
  return { x: host.width / 2 - cx * zoom, y: host.height / 2 - cy * zoom, zoom };
}

export const metricsFor = (depth: number) => (depth === 0 ? MIND_METRICS.root : depth === 1 ? MIND_METRICS.branch : MIND_METRICS.leaf);

let canvas: CanvasRenderingContext2D | null | undefined;
function textWidth(text: string, font: string): number {
  if (canvas === undefined) {
    try {
      canvas = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    } catch {
      canvas = null;
    }
  }
  if (!canvas) return text.length * (font.startsWith("600") ? 8.2 : 7.1);
  canvas.font = font;
  return canvas.measureText(text).width;
}

/** A node's size from its text: one line up to the max width, then wrapping (clamped). */
export function measureMindMapNode(mind: MindMapNode, untitled = "Untitled"): { width: number; height: number } {
  const metrics = metricsFor(mind.depth);
  const text = inlineToPlain(mind.node.text) || untitled;
  const extra = mind.node.checked !== undefined ? MIND_METRICS.task : 0;
  // Chips are wider than their words (date: icon + padding; code: padding + border).
  const chips = parseInline(mind.node.text).reduce((sum, segment) => sum + (segment.kind === "date" ? 28 : segment.kind === "code" ? 10 : segment.kind === "ref" ? 16 : 0), 0);
  // A little slack: canvas metrics and the rendered font round differently, and a one-word
  // label must never wrap mid-word.
  const raw = textWidth(text, metrics.font) * 1.03 + chips + 4;
  const inner = Math.min(metrics.max, Math.ceil(raw));
  // Word wrap loses a little to ragged ends: give wrapped lines 8% slack.
  const lines = raw <= metrics.max ? 1 : Math.min(MIND_METRICS.lines, Math.ceil((raw * 1.08) / metrics.max));
  // + 2: the node's 1 px border on each side.
  return { width: Math.max(44, inner + extra + metrics.padX * 2 + 2), height: lines * metrics.line + metrics.padY * 2 + 2 };
}

let elk: InstanceType<typeof ELK> | null = null;

/**
 * Two layered passes (end side to the right, start side to the left; mirrored for RTL), joined
 * so the root sits at the same point in both. Returns top-left boxes keyed by node id.
 */
export async function layoutMindMap(
  graph: MindGraph,
  size: (mind: MindMapNode) => { width: number; height: number },
  options: { readonly rtl?: boolean } = {},
): Promise<Map<string, MindBox>> {
  elk ??= new ELK();
  const sizes = new Map<string, { width: number; height: number }>();
  for (const id of graph.order) sizes.set(id, size(graph.nodes.get(id)!));
  const pass = async (side: "end" | "start") => {
    const ids = graph.order.filter((id) => {
      const mind = graph.nodes.get(id)!;
      return mind.side === "root" || mind.side === side;
    });
    if (ids.length === 1 && side === "start") return null;
    const elkGraph: ElkNode = {
      id: `mind-${side}`,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": (side === "end") !== !!options.rtl ? "RIGHT" : "LEFT",
        "elk.layered.spacing.nodeNodeBetweenLayers": "44",
        "elk.spacing.nodeNode": "10",
        "elk.layered.nodePlacement.strategy": "BRANDES_KOEPF",
        "elk.layered.nodePlacement.bk.fixedAlignment": "BALANCED",
        "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
        "elk.layered.crossingMinimization.forceNodeModelOrder": "true",
        "elk.edgeRouting": "SPLINES",
      },
      children: ids.map((id) => ({ id, ...sizes.get(id)! })),
      edges: ids
        .filter((id) => graph.nodes.get(id)!.parentId)
        .map((id) => ({ id: `e-${id}`, sources: [graph.nodes.get(id)!.parentId!], targets: [id] })),
    };
    const result = await elk!.layout(elkGraph);
    return new Map((result.children ?? []).map((child) => [child.id, { x: child.x ?? 0, y: child.y ?? 0 }]));
  };
  const [end, start] = await Promise.all([pass("end"), pass("start")]);
  const boxes = new Map<string, MindBox>();
  const place = (positions: Map<string, { x: number; y: number }>) => {
    const root = positions.get(graph.rootId)!;
    for (const [id, at] of positions)
      boxes.set(id, { x: at.x - root.x, y: at.y - root.y, ...sizes.get(id)! });
  };
  place(end!);
  if (start) place(start);
  return boxes;
}
