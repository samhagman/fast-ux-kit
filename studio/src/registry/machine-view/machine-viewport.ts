import type { ReactFlowInstance } from "@xyflow/react";
import { HEADER } from "./layout";

type Flow = ReactFlowInstance;

/**
 * Viewport choreography: ONE notion of "the clear band" (the part of the canvas no floating
 * chrome covers) and two moves that respect it.
 *
 *  - Occluders are any element marked `data-mv-occluder` (palette, zoom/fit controls, phone
 *    peek bar) plus the minimap, measured live, plus the phone sheet's target inset (its snap
 *    height, not its animated height). A wide occluder shrinks the band from the nearer of
 *    top/bottom; a tall one from the nearer of start/end. RTL needs nothing special.
 *  - `fitToBand` fits the machine into the band (phones keep text readable and fit width).
 *  - `revealInBand` pans (and, if allowed, zooms out) so a set of targets lands in the band,
 *    trying priority groups in order and stopping at the first that fits.
 */
export interface Insets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}
export interface Band {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

export function occluderInsets(dom: HTMLElement, sheetInset = 0): Insets {
  const box = dom.getBoundingClientRect();
  const W = box.width,
    H = box.height;
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const scope = dom.closest("[data-slot=machine-view]") ?? dom;
  for (const el of scope.querySelectorAll<HTMLElement>("[data-mv-occluder], .react-flow__minimap")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const x0 = r.left - box.left,
      y0 = r.top - box.top,
      x1 = r.right - box.left,
      y1 = r.bottom - box.top;
    if (x1 <= 0 || y1 <= 0 || x0 >= W || y0 >= H) continue;
    if (r.width >= r.height) {
      if ((y0 + y1) / 2 < H / 2) inset.top = Math.max(inset.top, y1);
      else inset.bottom = Math.max(inset.bottom, H - y0);
    } else if ((x0 + x1) / 2 < W / 2) inset.left = Math.max(inset.left, x1);
    else inset.right = Math.max(inset.right, W - x0);
  }
  inset.bottom = Math.max(inset.bottom, sheetInset);
  return inset;
}

/** The clear band in canvas-local screen pixels, `margin` inside the occluders. */
export function clearBand(dom: HTMLElement, sheetInset = 0, margin = 8): Band {
  const insets = occluderInsets(dom, sheetInset);
  return { x0: insets.left + margin, y0: insets.top + margin, x1: dom.clientWidth - insets.right - margin, y1: dom.clientHeight - insets.bottom - margin };
}

/** Hidden content under this many screen px is not worth a pan button (it reads as a margin). */
export const OVERFLOW_MIN = 16;
export type OverflowSide = "l" | "r" | "t" | "b";

/**
 * Which physical sides the machine continues past, measured against the CLEAR BAND (inside the
 * palette, Fit, peek bar and sheet), not the pane: content that is inside the pane but under the
 * peek bar is still hidden. Pure: `content` and `band` are canvas-local screen rects.
 */
export function overflowSides(content: Rect, band: Band, min = OVERFLOW_MIN): string {
  if (!Number.isFinite(content.x0) || content.x1 <= content.x0) return "";
  return [content.x0 < band.x0 - min ? "l" : "", content.x1 > band.x1 + min ? "r" : "", content.y0 < band.y0 - min ? "t" : "", content.y1 > band.y1 + min ? "b" : ""].join("");
}

/** Canvas-local rects of the floating controls (palette, Fit, peek bar, minimap): what content should not sit under. */
export function occluderRects(dom: HTMLElement): Rect[] {
  const box = dom.getBoundingClientRect();
  const scope = dom.closest("[data-slot=machine-view]") ?? dom;
  const out: Rect[] = [];
  for (const el of scope.querySelectorAll<HTMLElement>("[data-mv-occluder], .react-flow__minimap")) {
    const r = el.getBoundingClientRect();
    if (r.width && r.height) out.push({ x0: r.left - box.left, y0: r.top - box.top, x1: r.right - box.left, y1: r.bottom - box.top });
  }
  return out;
}

/** Canvas-local rects of what must stay legible: state boxes (containers: their header only) and event chips. */
function contentRects(dom: HTMLElement, zoom: number): Rect[] {
  const box = dom.getBoundingClientRect();
  const out: Rect[] = [];
  for (const el of dom.querySelectorAll<HTMLElement>(".react-flow__node:not(.react-flow__node-initial):not(.react-flow__node-pseudo), [data-mv-chip]")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const group = el.classList.contains("react-flow__node-group");
    out.push({ x0: r.left - box.left, y0: r.top - box.top, x1: r.right - box.left, y1: r.top - box.top + (group ? Math.min(r.height, HEADER * zoom) : r.height) });
  }
  return out;
}

const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
export const viewportDuration = (ms: number) => (reducedMotion() ? 0 : ms);

/**
 * Phones never shrink text below a readable size: at 0.72 a 13px name renders at ~9.4px and
 * a 9.5px tag at ~6.8px, the smallest that still reads. A machine that does not fit at the
 * floor is start-aligned (the initial state is at the start in both directions) and the user
 * pans; the overflow hint is a button that does exactly that.
 */
export const PHONE_READABLE = 0.72;
export const PHONE_MIN_ZOOM = PHONE_READABLE;

export function fitToBand(flow: Flow, dom: HTMLElement, { compact, sheetInset = 0, animate = false }: { compact: boolean; sheetInset?: number; animate?: boolean }) {
  const nodes = flow.getNodes();
  if (!nodes.length || !dom.clientWidth) return;
  const b = flow.getNodesBounds(nodes);
  if (!b.width || !b.height) return;
  const band = clearBand(dom, sheetInset, compact ? 12 : 24);
  const W = band.x1 - band.x0,
    H = band.y1 - band.y0;
  if (W < 40 || H < 40) return;
  let z = Math.min(1.1, W / b.width, H / b.height);
  if (compact) z = Math.max(z, PHONE_READABLE);
  z = Math.max(0.2, z);
  const x = b.width * z <= W ? band.x0 + (W - b.width * z) / 2 - b.x * z : band.x0 - b.x * z;
  // Phones top-align: the free height sits below the machine, where the peek bar and sheet live.
  const y = b.height * z <= H && !compact ? band.y0 + (H - b.height * z) / 2 - b.y * z : band.y0 - b.y * z;
  return flow.setViewport({ x, y, zoom: z }, { duration: animate ? viewportDuration(260) : 0 });
}

/** Pans by about one band in `side`'s direction, never past the machine's far edge (the overflow hint's action). */
export function panToward(flow: Flow, dom: HTMLElement, side: "l" | "r" | "t" | "b", sheetInset = 0) {
  const nodes = flow.getNodes();
  if (!nodes.length) return;
  const b = flow.getNodesBounds(nodes);
  const band = clearBand(dom, sheetInset, 12);
  const { x, y, zoom } = flow.getViewport();
  const W = band.x1 - band.x0,
    H = band.y1 - band.y0;
  let nx = x,
    ny = y;
  // Content edges in screen space.
  const left = x + b.x * zoom,
    right = x + (b.x + b.width) * zoom,
    top = y + b.y * zoom,
    bottom = y + (b.y + b.height) * zoom;
  if (side === "r") nx = x - Math.min(W * 0.8, right - band.x1);
  if (side === "l") nx = x + Math.min(W * 0.8, band.x0 - left);
  if (side === "b") ny = y - Math.min(H * 0.8, bottom - band.y1);
  if (side === "t") ny = y + Math.min(H * 0.8, band.y0 - top);
  return flow.setViewport({ x: nx, y: ny, zoom }, { duration: viewportDuration(280) });
}

/** Canvas-local screen rects of nodes (by id) and event chips (by transition id). */
export function targetRects(dom: HTMLElement, { nodes = [], chips = [] }: { nodes?: readonly string[]; chips?: readonly string[] }): DOMRect[] {
  const box = dom.getBoundingClientRect();
  const out: DOMRect[] = [];
  const push = (el: Element | null) => {
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width || r.height) out.push(new DOMRect(r.left - box.left, r.top - box.top, r.width, r.height));
  };
  for (const id of nodes) push(dom.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`));
  for (const id of chips) push(dom.querySelector(`[data-mv-chip="${CSS.escape(id)}"]`));
  return out;
}

export interface RevealOptions {
  /** "clipped": act when any part is outside the band. "hidden": only when the centre is. */
  readonly when?: "clipped" | "hidden";
  /** Lowest zoom a reveal may zoom out to; `null` keeps the current zoom (pan only). */
  readonly minZoom?: number | null;
  readonly sheetInset?: number;
}

/**
 * Pans so the first group that fits lands inside the clear band. An axis that is already clear
 * stays put; a clipped axis is centred (or start-aligned when it cannot fit). If no group fits,
 * the last non-empty one is start-aligned at the lowest allowed zoom.
 */
export function revealInBand(flow: Flow, dom: HTMLElement, groups: readonly (readonly DOMRect[])[], options: RevealOptions = {}) {
  const { when = "clipped", minZoom = null, sheetInset = 0 } = options;
  const band = clearBand(dom, sheetInset, 10);
  const W = band.x1 - band.x0,
    H = band.y1 - band.y0;
  // A sliver above a full phone sheet still shows a chip: only a band with no room at all gives up.
  if (W < 40 || H < 28) return false;
  const { x, y, zoom } = flow.getViewport();
  const usable = groups.filter((g) => g.length);
  if (!usable.length) return false;
  for (let i = 0; i < usable.length; i++) {
    const g = usable[i]!;
    const sx0 = Math.min(...g.map((r) => r.left)),
      sy0 = Math.min(...g.map((r) => r.top)),
      sx1 = Math.max(...g.map((r) => r.right)),
      sy1 = Math.max(...g.map((r) => r.bottom));
    if (i === 0) {
      const inside = when === "hidden" ? inBand(band, (sx0 + sx1) / 2, (sy0 + sy1) / 2) : sx0 >= band.x0 && sx1 <= band.x1 && sy0 >= band.y0 && sy1 <= band.y1;
      if (inside) return false;
    }
    // Flow-space box of the group.
    const fx0 = (sx0 - x) / zoom,
      fy0 = (sy0 - y) / zoom,
      w = (sx1 - sx0) / zoom,
      h = (sy1 - sy0) / zoom;
    const needed = Math.min(zoom, W / w, H / h);
    const floor = minZoom ?? zoom;
    const last = i === usable.length - 1;
    if (needed < floor - 1e-3 && !last) continue;
    const z = Math.max(Math.min(needed, zoom), Math.min(floor, zoom));
    const fits = { x: w * z <= W + 0.5, y: h * z <= H + 0.5 };
    const axis = (start: number, size: number, b0: number, b1: number, fit: boolean, current: number) => {
      // At the current zoom an axis already inside the band is left alone.
      const s0 = current + start * z,
        s1 = s0 + size * z;
      if (z === zoom && s0 >= b0 && s1 <= b1) return current;
      return fit ? b0 + (b1 - b0 - size * z) / 2 - start * z : b0 - start * z;
    };
    let nx = axis(fx0, w, band.x0, band.x1, fits.x, x);
    let ny = axis(fy0, h, band.y0, band.y1, fits.y, y);
    // An axis that has to move has slack: the targets fit anywhere in the band along it. Spend it
    // so the floating controls (Fit, the folded "+", the palette) cover as little of the
    // surrounding states and chips as possible; the centred position wins ties.
    if (z === zoom) {
      const moveX = Math.abs(nx - x) >= 1 && fits.x,
        moveY = Math.abs(ny - y) >= 1 && fits.y;
      if (moveX || moveY) {
        const better = spendSlack(dom, zoom, { x: nx - x, y: ny - y }, { x: moveX ? [band.x0 - (nx + fx0 * z), band.x1 - (nx + (fx0 + w) * z)] : [0, 0], y: moveY ? [band.y0 - (ny + fy0 * z), band.y1 - (ny + (fy0 + h) * z)] : [0, 0] });
        nx += better.dx;
        ny += better.dy;
      }
    }
    if (Math.abs(nx - x) < 1 && Math.abs(ny - y) < 1 && z === zoom) return false;
    flow.setViewport({ x: nx, y: ny, zoom: z }, { duration: viewportDuration(280) });
    return true;
  }
  return false;
}

/**
 * The extra shift (within `range`, on top of the pan `base`) that leaves the least content under
 * the floating controls. Cost is overlap area; ties keep the smallest shift (the centred pan).
 */
function spendSlack(dom: HTMLElement, zoom: number, base: { x: number; y: number }, range: { x: readonly [number, number]; y: readonly [number, number] }) {
  const covers = occluderRects(dom);
  const content = contentRects(dom, zoom);
  if (!covers.length || !content.length) return { dx: 0, dy: 0 };
  const samples = ([lo, hi]: readonly [number, number]) => {
    if (hi - lo < 1) return [0];
    const out = [0];
    for (let i = 0; i <= 8; i++) out.push(lo + ((hi - lo) * i) / 8);
    return out;
  };
  const cost = (dx: number, dy: number) => {
    let sum = 0;
    for (const c of content) {
      const r = { x0: c.x0 + base.x + dx, y0: c.y0 + base.y + dy, x1: c.x1 + base.x + dx, y1: c.y1 + base.y + dy };
      for (const o of covers) sum += overlapArea(r, o);
    }
    return sum;
  };
  let best = { dx: 0, dy: 0, cost: cost(0, 0) };
  for (const dx of samples(range.x))
    for (const dy of samples(range.y)) {
      const value = cost(dx, dy);
      if (value < best.cost - 1 || (Math.abs(value - best.cost) <= 1 && Math.hypot(dx, dy) < Math.hypot(best.dx, best.dy))) best = { dx, dy, cost: value };
    }
  return best;
}

const inBand = (b: Band, x: number, y: number) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;

/* ───────────────────────────── Selection toolbar placement ───────────────────────────── */

export type ToolbarSide = "top" | "bottom" | "left" | "right";
export interface Rect {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}
export interface ToolbarScene {
  /** The selected node, canvas-local screen pixels. */
  readonly node: Rect;
  /** The node's header height in screen pixels (side placements centre on it). */
  readonly head: number;
  /** The toolbar's own size. */
  readonly size: { readonly w: number; readonly h: number };
  /** The clear band (inside palette, controls, peek bar, sheet). */
  readonly band: Band;
  /** The canvas box (a candidate may sit outside the band only if a pan can bring it in). */
  readonly canvas: { readonly w: number; readonly h: number };
  readonly direction: "LR" | "TB";
  /** Everything a toolbar should not cover, weighted: states, ancestor headers, chips, arrowheads, sampled edge points, overflow buttons. */
  readonly obstacles: readonly { readonly box: Rect; readonly weight: number }[];
}
export interface ToolbarPlacement {
  readonly x: number;
  readonly y: number;
  readonly side: ToolbarSide;
  /** What it still covers (0 = nothing). */
  readonly cost: number;
  /** Camera pan (screen px) that brings this slot and the node into the band; 0,0 when none is needed. */
  readonly pan: { readonly dx: number; readonly dy: number };
}

const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
/** Toolbar gap from the node it serves. */
export const TOOLBAR_GAP = 8;

/**
 * Where the quick-action toolbar goes: a pure function of rects, so it is testable.
 *
 * Candidates are ordered by flow direction (LR: above, where nothing enters; TB: beside, so
 * incoming arrows stay visible), each with a few slides along its edge. A candidate's cost is
 * what it would cover in the FLOW (states, chips, arrowheads, edge segments), which does not
 * change when the camera pans. So:
 *  1. the first zero-cost candidate already inside the band wins as is;
 *  2. else the cheapest flow cost wins, and if it sits outside the band the camera pans by the
 *     smallest vector that brings it (and the node) inside, when that fits;
 *  3. else (no pan fits) the cheapest candidate clamped into the band.
 */
export function placeToolbar(scene: ToolbarScene): ToolbarPlacement | null {
  const { node: R, head, size, band, direction, obstacles } = scene;
  const { w, h } = size;
  if (R.x1 < band.x0 || R.x0 > band.x1 || R.y1 < band.y0 || R.y0 > band.y1) return null;
  const cx = (R.x0 + R.x1) / 2;
  const midY = R.y0 + head / 2 - h / 2;
  const gap = TOOLBAR_GAP;
  const make = (key: string): { x: number; y: number; side: ToolbarSide }[] => {
    switch (key) {
      case "top":
        return [cx - w / 2, R.x1 - w, R.x0, cx + 14].map((x) => ({ x, y: R.y0 - gap - h, side: "top" as const }));
      case "bottom":
        return [cx - w / 2, R.x1 - w, R.x0].map((x) => ({ x, y: R.y1 + gap, side: "bottom" as const }));
      case "right":
        return [midY, R.y0, R.y0 - h - gap / 2].map((y) => ({ x: R.x1 + gap, y, side: "right" as const }));
      default:
        return [midY, R.y0].map((y) => ({ x: R.x0 - gap - w, y, side: "left" as const }));
    }
  };
  const order = direction === "LR" ? ["top", "bottom", "right", "left"] : ["right", "left", "top", "bottom"];
  const candidates = order.flatMap(make);
  const flowCost = (c: { x: number; y: number }) => {
    const t = { x0: c.x, y0: c.y, x1: c.x + w, y1: c.y + h };
    if (overlapArea(t, R) > 0) return Infinity;
    return obstacles.reduce((sum, o) => sum + overlapArea(t, o.box) * o.weight, 0);
  };
  const inBand = (c: { x: number; y: number }) => c.x >= band.x0 && c.y >= band.y0 && c.x + w <= band.x1 && c.y + h <= band.y1;
  /** Smallest pan that puts both the node and the slot inside the band, or null. */
  const panFor = (c: { x: number; y: number }) => {
    const x0 = Math.min(c.x, R.x0),
      y0 = Math.min(c.y, R.y0),
      x1 = Math.max(c.x + w, R.x1),
      y1 = Math.max(c.y + h, R.y1);
    if (x1 - x0 > band.x1 - band.x0 || y1 - y0 > band.y1 - band.y0) return null;
    const dx = x0 < band.x0 ? band.x0 - x0 : x1 > band.x1 ? band.x1 - x1 : 0;
    const dy = y0 < band.y0 ? band.y0 - y0 : y1 > band.y1 ? band.y1 - y1 : 0;
    return { dx, dy };
  };
  const scored = candidates.map((c, i) => ({ ...c, cost: flowCost(c), i }));
  const clean = scored.find((c) => c.cost < 1 && inBand(c));
  if (clean) return { x: clean.x, y: clean.y, side: clean.side, cost: 0, pan: { dx: 0, dy: 0 } };
  // Cheapest in the flow (ties keep the direction order); pan it into view if it is not already.
  const ranked = [...scored].filter((c) => Number.isFinite(c.cost)).sort((a, b) => a.cost - b.cost || a.i - b.i);
  for (const c of ranked) {
    const pan = inBand(c) ? { dx: 0, dy: 0 } : panFor(c);
    if (!pan) continue;
    // A pan is only worth it if it buys a cleaner slot than what fits without one.
    const stay = ranked.find((o) => inBand(o));
    if ((pan.dx || pan.dy) && stay && stay.cost <= c.cost) return { x: stay.x, y: stay.y, side: stay.side, cost: stay.cost, pan: { dx: 0, dy: 0 } };
    return { x: c.x + pan.dx, y: c.y + pan.dy, side: c.side, cost: c.cost, pan };
  }
  // Nothing fits even with a pan (tiny canvas): clamp the cheapest into the band.
  const clampX = (x: number) => Math.max(band.x0, Math.min(x, band.x1 - w));
  const clampY = (y: number) => Math.max(band.y0, Math.min(y, band.y1 - h));
  const fallback = scored
    .map((c) => ({ ...c, x: clampX(c.x), y: clampY(c.y) }))
    .map((c) => ({ ...c, cost: flowCost(c) }))
    .sort((a, b) => a.cost - b.cost || a.i - b.i)[0];
  return fallback && Number.isFinite(fallback.cost) ? { x: fallback.x, y: fallback.y, side: fallback.side, cost: fallback.cost, pan: { dx: 0, dy: 0 } } : null;
}
