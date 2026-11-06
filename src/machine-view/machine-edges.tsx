import * as React from "react";
import { animate, motion, useMotionValue, useReducedMotion, type MotionValue } from "motion/react";
import {
  EdgeLabelRenderer,
  Position,
  getSmoothStepPath,
  getStraightPath,
  useInternalNode,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type Edge,
  type EdgeProps,
  type InternalNode,
} from "@xyflow/react";
// React Flow's own connection engine (a dependency of @xyflow/react, same version): our
// reconnect anchors sit where the ROUTED path ends, not at the handle positions.
import { XYHandle } from "@xyflow/system";
import { Ban, Check, Play, Zap } from "lucide-react";
import type { MachineTransition } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { ease, motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { useShortcutLabel } from "../lib/platform.js";
import { Textarea } from "../components/ui/textarea.js";
import { Popover, PopoverAnchor, PopoverContent } from "../components/ui/popover.js";
import {
  HEADER,
  LABEL_MAX,
  roundedPath,
  transitionLabel,
  type ChipFit,
  type LaidOutEdge,
} from "./layout.js";
import { MachineValue } from "../machine-shared/machine-inspection-panel.js";
import { useMachine, useDiagram } from "./machine-context.js";
import { DragContext } from "./machine-nodes.js";
import { describeBlocked, KEY } from "../machine-shared/machine-copy.js";

export type TransitionData = {
  readonly transition?: MachineTransition;
  readonly route?: LaidOutEdge;
  readonly synthetic?: "initial" | "note";
  /** Eventless transition out of an explicit `initial` pseudo-state: drawn as the initial arrow. */
  readonly fromInitial?: boolean;
  /** Perpendicular offset for live-drawn edges that share a node pair, so they never overlap. */
  readonly pairOffset?: number;
};
export type FlowEdge = Edge<TransitionData, "transition">;

/**
 * Per-instance edge plumbing from the canvas: SVG marker ids (unique per view, so two views
 * on one page never share or strip each other's arrowheads) and the re-target handler that
 * the custom reconnect anchors call.
 */
export interface EdgeEnv {
  readonly arrow: string;
  readonly arrowSignal: string;
  readonly reconnectable: boolean;
  readonly reconnect: (edgeId: string, connection: Connection) => void;
}
export const EdgeEnvContext = React.createContext<EdgeEnv>({
  arrow: "mv-arrow",
  arrowSignal: "mv-arrow-signal",
  reconnectable: false,
  reconnect: () => {},
});

/* ───────────────────────────── Path motion ───────────────────────────── */

const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
const shapeOf = (d: string) => d.replace(NUMBER, "#");
const GLIDE = { duration: 0.24, ease } as const;

/**
 * Edges move WITH their nodes on a relayout instead of blinking: a path whose command
 * structure is unchanged interpolates its numbers (same 240ms glide as the nodes); a path
 * whose structure changed crossfades from the old route (`ghost`). Live drags snap.
 */
function useGlidingPath(
  d: string,
  live: boolean,
): { readonly d: MotionValue<string>; readonly ghost: string | null; readonly fade: number } {
  const value = useMotionValue(d);
  const reduce = useReducedMotion();
  const previous = React.useRef(d);
  const [ghost, setGhost] = React.useState<{ d: string; key: number } | null>(null);
  React.useLayoutEffect(() => {
    const from = previous.current;
    previous.current = d;
    if (from === d) return;
    if (live || reduce) {
      value.set(d);
      return;
    }
    if (shapeOf(from) === shapeOf(value.get()) && shapeOf(from) === shapeOf(d)) {
      const animation = animate(value, d, GLIDE);
      return () => animation.stop();
    }
    value.set(d);
    setGhost({ d: from, key: performance.now() });
    const timer = window.setTimeout(() => setGhost(null), 260);
    return () => window.clearTimeout(timer);
  }, [d, live, reduce, value]);
  return { d: value, ghost: ghost?.d ?? null, fade: ghost?.key ?? 0 };
}

/** One path element with glide/crossfade; extra props go to the visible path. */
function GlidingPath({
  d,
  live,
  ghostStroke,
  ...props
}: { readonly d: string; readonly live: boolean; readonly ghostStroke?: string } & Omit<
  React.ComponentProps<typeof motion.path>,
  "d"
>) {
  const path = useGlidingPath(d, live);
  return (
    <>
      {path.ghost && (
        <motion.path
          key={`ghost-${path.fade}`}
          aria-hidden
          d={path.ghost}
          fill="none"
          style={props.style}
          stroke={ghostStroke}
          strokeWidth={1.25}
          markerEnd={props.markerEnd}
          initial={{ opacity: 0.9 }}
          animate={{ opacity: 0 }}
          transition={GLIDE}
        />
      )}
      <motion.g
        key={`edge-${path.fade}`}
        initial={path.fade ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={GLIDE}
      >
        <motion.path {...props} d={path.d} />
      </motion.g>
    </>
  );
}

/* ───────────────────────────── Transition edge ───────────────────────────── */

/** Every transition edge's base z (machine-canvas sets it on the flow edges). */
export const EDGE_Z = 10;

export function TransitionEdge({
  id,
  data,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  source,
  target,
}: EdgeProps<FlowEdge>) {
  const mv = useDiagram();
  const env = React.useContext(EdgeEnvContext);
  const { moving } = React.useContext(DragContext);
  const [reconnecting, setReconnecting] = React.useState(false);
  const route = data?.route;
  const transition = data?.transition;
  const sourceNode = useInternalNode(source);
  const targetNode = useInternalNode(target);
  const flow = useReactFlow();
  const live = moving.has(source) || moving.has(target);
  // The chip sits one layer above ITS OWN edge, mirroring React Flow's edge elevation (edge z +
  // the z of a nested endpoint), so a selected or dragged state (z 1000+) still draws over it.
  const chipZ =
    EDGE_Z +
    1 +
    Math.max(
      sourceNode?.parentId ? sourceNode.internals.z : 0,
      targetNode?.parentId ? targetNode.internals.z : 0,
    );
  const useRoute = route && !live;
  const nested =
    !useRoute && sourceNode && targetNode && source !== target
      ? contains(rectOf(sourceNode), rectOf(targetNode))
        ? "in"
        : contains(rectOf(targetNode), rectOf(sourceNode))
          ? "out"
          : null
      : null;
  let path: string;
  let labelX: number;
  let labelY: number;
  if (useRoute) {
    path = roundedPath(route.points);
    labelX = route.label
      ? route.label.x + route.label.width / 2
      : (route.points[0]!.x + route.points.at(-1)!.x) / 2;
    labelY = route.label
      ? route.label.y + route.label.height / 2
      : (route.points[0]!.y + route.points.at(-1)!.y) / 2;
  } else if (nested && sourceNode && targetNode) {
    const [outer, inner] = nested === "in" ? [sourceNode, targetNode] : [targetNode, sourceNode];
    const outerRect = rectOf(outer);
    const innerRect = rectOf(inner);
    // Obstacles: every other state inside the container; the child's own ancestors only by their header band.
    const obstacles: Rect[] = [];
    for (const n of flow.getNodes()) {
      if (n.id === outer.id || n.id === inner.id || n.type === "note") continue;
      const box = flow.getInternalNode(n.id);
      if (!box) continue;
      const r = rectOf(box);
      if (!contains(outerRect, r) || contains(innerRect, r)) continue;
      obstacles.push(contains(r, innerRect) ? { ...r, height: HEADER } : r);
    }
    const labelWidth = transition
      ? Math.min(LABEL_MAX, transitionLabel(transition).length * 6.7 + 18)
      : 0;
    [path, labelX, labelY] = nestedPath(
      outerRect,
      innerRect,
      obstacles,
      nested === "in",
      data?.pairOffset ?? 0,
      labelWidth,
    );
  } else if (sourceNode && targetNode && source !== target && data?.synthetic !== "note") {
    [path, labelX, labelY] = floatingPath(sourceNode, targetNode, data?.pairOffset ?? 0);
  } else {
    [path, labelX, labelY] = getSmoothStepPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
      borderRadius: 8,
    });
  }
  if (data?.synthetic === "note") {
    const [straight] = getStraightPath({ sourceX, sourceY, targetX, targetY });
    return (
      <GlidingPath
        d={straight}
        live={live}
        className="react-flow__edge-path"
        fill="none"
        style={{
          stroke: "color-mix(in oklab, var(--warning) 60%, transparent)",
          strokeDasharray: "1 4",
          strokeLinecap: "round",
          strokeWidth: 1.5,
        }}
      />
    );
  }
  if (data?.synthetic === "initial" || data?.fromInitial)
    return (
      <>
        {data?.fromInitial && (
          <path
            d={path}
            fill="none"
            stroke="transparent"
            strokeWidth={14}
            className="react-flow__edge-interaction"
          />
        )}
        <GlidingPath
          d={path}
          live={live}
          className="react-flow__edge-path"
          fill="none"
          markerEnd={`url(#${env.arrow})`}
          style={{
            stroke: "var(--foreground)",
            strokeOpacity: selected ? 0.9 : 0.55,
            strokeWidth: 1.25,
          }}
        />
      </>
    );

  const simulating = mv.mode === "simulate" && mv.simulating;
  const enabled = !!transition && mv.candidates.enabled.has(transition.id);
  const blocked = !!transition && mv.candidates.blocked.has(transition.id);
  const taken = !!transition && mv.takenIds.includes(transition.id);
  const stroke =
    taken || enabled ? "var(--signal)" : selected ? "var(--foreground)" : "var(--mv-edge)";
  const anchors = env.reconnectable && !!transition && !simulating && (
    <ReconnectAnchors
      id={id}
      d={path}
      source={source}
      target={target}
      selected={!!selected}
      onReconnecting={setReconnecting}
    />
  );
  // While an end is being dragged, React Flow's connection line is the edge.
  if (reconnecting) return anchors || null;
  return (
    <>
      <path d={path} fill="none" stroke="transparent" strokeWidth={14} className="cursor-pointer" />
      <GlidingPath
        d={path}
        live={live}
        fill="none"
        initial={false}
        animate={{
          stroke,
          opacity: simulating && !enabled && !taken ? 0.35 : 1,
          strokeWidth: taken ? 2 : selected || enabled ? 1.6 : 1.25,
        }}
        transition={motionTokens.base}
        markerEnd={`url(#${taken || enabled ? env.arrowSignal : env.arrow})`}
        ghostStroke={stroke}
        strokeDasharray={transition?.event ? undefined : "4 3"}
      />
      {taken && (
        <path
          key={mv.pingSequence}
          d={path}
          fill="none"
          stroke="var(--signal)"
          strokeWidth={2}
          className="mv-flow"
        />
      )}
      {anchors}
      {transition && (
        <EdgeLabelRenderer>
          <EdgeChip
            z={chipZ}
            transition={transition}
            fit={useRoute ? route.fit : undefined}
            id={id}
            x={labelX}
            y={labelY}
            glide={!live}
            selected={!!selected}
            simulating={simulating}
            enabled={enabled}
            blocked={blocked}
            taken={taken}
          />
        </EdgeLabelRenderer>
      )}
    </>
  );
}

/* ───────────────────────────── Reconnect anchors ───────────────────────────── */

const NUMBERS = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
/** First and last point of an SVG path (every path here starts with M and ends on a point). */
function pathEnds(d: string) {
  const n = (d.match(NUMBERS) ?? []).map(Number);
  if (n.length < 4) return null;
  return {
    start: { x: n[0]!, y: n[1]! },
    end: { x: n.at(-2)!, y: n.at(-1)! },
    before: { x: n.at(-4)!, y: n.at(-3)! },
    after: { x: n[2]!, y: n[3]! },
  };
}

/**
 * Drag either end of a transition to re-target it. React Flow draws its updaters at the
 * handle positions, but our routes leave and enter wherever ELK put them (a back-edge leaves
 * a node's top and enters the other's bottom), so its circles floated on empty canvas. These
 * sit on the real path ends: the target one covers the arrowhead you see.
 */
function ReconnectAnchors({
  id,
  d,
  source,
  target,
  selected,
  onReconnecting,
}: {
  readonly id: string;
  readonly d: string;
  readonly source: string;
  readonly target: string;
  readonly selected: boolean;
  readonly onReconnecting: (on: boolean) => void;
}) {
  const env = React.useContext(EdgeEnvContext);
  const store = useStoreApi();
  const zoom = useStore((s) => s.transform[2]);
  // Screen-sized grab zones: 20px across with a mouse, 44px on touch (where they only exist on the selected edge).
  const coarse = useMediaQuery("(pointer: coarse)");
  const ends = pathEnds(d);
  if (!ends) return null;
  if (coarse && !selected) return null;
  const r = Math.max(6, Math.min(40, (coarse ? 22 : 10) / zoom));
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, by: number) => {
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    return { x: from.x + ((to.x - from.x) / len) * by, y: from.y + ((to.y - from.y) / len) * by };
  };
  // Centre the target zone on the arrowhead (just short of the end), the source zone just past the start.
  const at = {
    source: toward(ends.start, ends.after, Math.min(6, r / 2)),
    target: toward(ends.end, ends.before, Math.min(6, r / 2)),
  };
  const begin = (
    event: React.MouseEvent<SVGCircleElement> | React.TouchEvent<SVGCircleElement>,
    end: "source" | "target",
  ) => {
    if ("button" in event && event.button !== 0) return;
    event.stopPropagation();
    const state = store.getState();
    const edge = state.edgeLookup.get(id);
    if (!edge) return;
    // Dragging the target end keeps the source fixed, and vice versa.
    const fixed =
      end === "target"
        ? { nodeId: source, id: edge.sourceHandle ?? null, type: "source" as const }
        : { nodeId: target, id: edge.targetHandle ?? null, type: "target" as const };
    XYHandle.onPointerDown(event.nativeEvent, {
      autoPanOnConnect: state.autoPanOnConnect,
      connectionMode: state.connectionMode,
      connectionRadius: state.connectionRadius,
      domNode: state.domNode,
      handleId: fixed.id,
      nodeId: fixed.nodeId,
      nodeLookup: state.nodeLookup,
      isTarget: fixed.type === "target",
      edgeUpdaterType: fixed.type,
      lib: state.lib,
      flowId: state.rfId,
      cancelConnection: state.cancelConnection,
      panBy: state.panBy,
      isValidConnection: (...args) => state.isValidConnection?.(...args) ?? true,
      onConnect: (connection) => env.reconnect(id, connection),
      onConnectStart: () => onReconnecting(true),
      onConnectEnd: (...args) => store.getState().onConnectEnd?.(...args),
      onReconnectEnd: () => onReconnecting(false),
      updateConnection: state.updateConnection,
      getTransform: () => store.getState().transform,
      getFromHandle: () => store.getState().connection.fromHandle,
      dragThreshold: state.connectionDragThreshold,
      handleDomNode: event.currentTarget,
    });
  };
  return (
    <>
      {(["source", "target"] as const).map((end) => (
        <g key={end}>
          {/* A small visible grip; the grab zone around it is invisible and screen-sized. */}
          <circle
            aria-hidden
            className="mv-reconnect-dot pointer-events-none"
            cx={at[end].x}
            cy={at[end].y}
            r={Math.max(2.5, 4.5 / zoom)}
          />
          <circle
            data-mv-reconnect={end}
            className={`mv-reconnect nodrag nopan react-flow__edgeupdater-${end}`}
            cx={at[end].x}
            cy={at[end].y}
            r={r}
            fill="transparent"
            stroke="transparent"
            onMouseDown={(event) => begin(event, end)}
            onTouchStart={(event) => begin(event, end)}
          />
        </g>
      ))}
    </>
  );
}

type Rect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};
const rectOf = (n: InternalNode): Rect => ({
  ...n.internals.positionAbsolute,
  width: n.measured.width ?? 0,
  height: n.measured.height ?? 0,
});
const contains = (a: Rect, b: Rect) =>
  b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height;

/**
 * Container ↔ own descendant: a straight internal arrow between the child and the nearest
 * container wall whose path is clear (no other state, no ancestor header), never a loop
 * over the header. `inward` draws wall → child (the container is the source).
 */
function nestedPath(
  container: Rect,
  child: Rect,
  obstacles: readonly Rect[],
  inward: boolean,
  offset: number,
  labelWidth: number,
): [string, number, number] {
  const cy = child.y + HEADER / 2 + offset;
  const cx = child.x + child.width / 2 + offset;
  const candidates: [number, { x: number; y: number }, { x: number; y: number }][] = [
    [child.x - container.x, { x: container.x, y: cy }, { x: child.x, y: cy }],
    [
      container.x + container.width - child.x - child.width,
      { x: container.x + container.width, y: cy },
      { x: child.x + child.width, y: cy },
    ],
    [child.y - container.y - HEADER, { x: cx, y: container.y + HEADER }, { x: cx, y: child.y }],
    [
      container.y + container.height - child.y - child.height,
      { x: cx, y: container.y + container.height },
      { x: cx, y: child.y + child.height },
    ],
  ];
  const clear = ([, a, b]: (typeof candidates)[number]) =>
    !obstacles.some(
      (o) =>
        Math.max(a.x, b.x) > o.x + 1 &&
        Math.min(a.x, b.x) < o.x + o.width - 1 &&
        Math.max(a.y, b.y) > o.y + 1 &&
        Math.min(a.y, b.y) < o.y + o.height - 1,
    );
  const sorted = [...candidates].sort((p, q) => p[0] - q[0]);
  const [length, wall, edge] = sorted.find(clear) ?? sorted[0]!;
  const [from, to] = inward ? [wall, edge] : [edge, wall];
  const [path] = getStraightPath({
    sourceX: from.x,
    sourceY: from.y,
    targetX: to.x,
    targetY: to.y,
  });
  // The chip hugs the container wall (the end that names the container), not the busy middle.
  const horizontal = wall.y === edge.y;
  const half = (horizontal ? labelWidth : 20) / 2 + 6;
  if (length < half * 2) return [path, (from.x + to.x) / 2, (from.y + to.y) / 2];
  const ux = Math.sign(edge.x - wall.x),
    uy = Math.sign(edge.y - wall.y);
  return [path, wall.x + ux * half, wall.y + uy * half];
}

/**
 * Live route for an edge whose stored ELK route is stale (an endpoint was moved by hand):
 * leave each node from the side facing the other, so a moved state never forces a loop.
 */
function floatingPath(s: InternalNode, t: InternalNode, offset: number): [string, number, number] {
  const sw = s.measured.width ?? 0,
    sh = s.measured.height ?? 0,
    tw = t.measured.width ?? 0,
    th = t.measured.height ?? 0;
  const sa = s.internals.positionAbsolute,
    ta = t.internals.positionAbsolute;
  const dx = ta.x + tw / 2 - (sa.x + sw / 2);
  const dy = ta.y + th / 2 - (sa.y + sh / 2);
  const horizontal = Math.abs(dx) - (sw + tw) / 2 > Math.abs(dy) - (sh + th) / 2;
  const clampY = (box: { y: number }, h: number, y: number) =>
    Math.min(box.y + h - 8, Math.max(box.y + 8, y));
  const clampX = (box: { x: number }, w: number, x: number) =>
    Math.min(box.x + w - 8, Math.max(box.x + 8, x));
  const [path, labelX, labelY] = horizontal
    ? getSmoothStepPath({
        sourceX: dx > 0 ? sa.x + sw : sa.x,
        sourceY: clampY(sa, sh, sa.y + Math.min(sh, HEADER * 1.5) / 2 + offset),
        sourcePosition: dx > 0 ? Position.Right : Position.Left,
        targetX: dx > 0 ? ta.x : ta.x + tw,
        targetY: clampY(ta, th, ta.y + Math.min(th, HEADER * 1.5) / 2 + offset),
        targetPosition: dx > 0 ? Position.Left : Position.Right,
        borderRadius: 8,
      })
    : getSmoothStepPath({
        sourceX: clampX(sa, sw, sa.x + sw / 2 + offset),
        sourceY: dy > 0 ? sa.y + sh : sa.y,
        sourcePosition: dy > 0 ? Position.Bottom : Position.Top,
        targetX: clampX(ta, tw, ta.x + tw / 2 + offset),
        targetY: dy > 0 ? ta.y : ta.y + th,
        targetPosition: dy > 0 ? Position.Top : Position.Bottom,
        borderRadius: 8,
      });
  // Chips of paired edges sit apart along the shared corridor.
  return horizontal
    ? [path, labelX, labelY + offset * 0.4]
    : [path, labelX + offset, labelY + offset * 1.4];
}

/* ───────────────────────────── Event chip ───────────────────────────── */

function EdgeChip({
  z,
  transition,
  fit = "full",
  id,
  x,
  y,
  glide,
  selected,
  simulating,
  enabled,
  blocked,
  taken,
}: {
  readonly z: number;
  readonly transition: MachineTransition;
  readonly fit?: ChipFit;
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly glide: boolean;
  readonly selected: boolean;
  readonly simulating: boolean;
  readonly enabled: boolean;
  readonly blocked: boolean;
  readonly taken: boolean;
}) {
  const mv = useDiagram();
  const chipRef = React.useRef<HTMLButtonElement>(null);
  // The popover belongs to the transition, not to the chip's current variant: it stays open
  // while the payload flips the guard (blocked ↔ enabled) and closes only on send or dismiss.
  const [open, setOpen] = React.useState(false);
  const guarded = simulating && !!transition.guard && !!transition.event && (enabled || blocked);
  const guardedBlock = guarded && blocked;
  React.useEffect(() => {
    if (!guarded) setOpen(false);
  }, [guarded]);
  const popup = guardedBlock || (guarded && open);
  const meta = taken ? "text-signal" : "text-[color:var(--sim-tag,var(--muted-foreground))]";
  const head = (
    <>
      {enabled && !taken && <Play className="size-2.5 shrink-0 fill-current" />}
      <span className="font-semibold">{transition.event || "always"}</span>
      {transition.guard && fit !== "event" && (
        <span className={cn("shrink-0", meta)}>[{transition.guard}]</span>
      )}
    </>
  );
  const actions = transition.actions?.length ? (
    <span className={cn("min-w-0 truncate", meta)}>/ {transition.actions.join(", ")}</span>
  ) : null;
  const hidden =
    (fit === "event" && (!!transition.guard || !!transition.actions?.length)) ||
    (fit === "guard" && !!transition.actions?.length);
  const label = simulating
    ? enabled
      ? `Send ${transitionLabel(transition)}`
      : guardedBlock
        ? `${transition.event} is blocked. Opens the payload editor`
        : `${transitionLabel(transition)}, not available now`
    : `Select transition ${transitionLabel(transition)}`;
  return (
    <Popover open={open && guarded} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          ref={chipRef}
          type="button"
          data-mv-chip={id}
          onPointerEnter={() => mv.previewEvent(transition.event ?? null)}
          onPointerLeave={() => mv.previewEvent(null)}
          onFocus={() => mv.previewEvent(transition.event ?? null)}
          onBlur={() => mv.previewEvent(null)}
          data-enabled={enabled || undefined}
          data-sim={
            simulating && !enabled && !taken && !guardedBlock && !selected ? "inactive" : undefined
          }
          onClick={(event) => {
            event.stopPropagation();
            if (guardedBlock || open) return setOpen(!open);
            if (simulating && (enabled || blocked) && transition.event)
              mv.sendEvent(transition.event);
            else mv.setSelection({ type: "transition", id });
          }}
          style={{
            transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
            maxWidth: LABEL_MAX,
            zIndex: z,
          }}
          aria-label={label}
          // Only a chip that opens the payload editor advertises a popup.
          aria-haspopup={popup ? "dialog" : undefined}
          aria-expanded={popup ? open : undefined}
          className={cn(
            "nodrag nopan pointer-events-auto absolute flex items-center gap-1 rounded-[6px] border px-1.5 font-mono text-[10.5px] leading-[18px] whitespace-nowrap transition-[opacity,border-color,background-color,color,box-shadow] duration-200 coarse:leading-6",
            // Hit area (::after, see CSS): ≥ 28 screen px, ≥ 44 on touch, at any zoom, without growing the chip.
            "mv-chip",
            hidden && "group/chip hover:!z-[2000] focus-visible:!z-[2000]",
            glide && "mv-chip-glide",
            selected
              ? "border-foreground/50 text-foreground"
              : "border-[color:var(--sim-border,var(--mv-node-border))] text-[color:var(--sim-tag,color-mix(in_oklab,var(--foreground)_85%,transparent))]",
            // Unavailable chips recede by colour (machine-sim.css), never by opacity: their text keeps ≥ 4.5:1.
            "bg-[var(--sim-surface,var(--surface))]",
            guardedBlock && "cursor-pointer border-dashed hover:border-foreground/40",
            open && "ring-2 ring-ring/40",
            enabled &&
              "cursor-pointer border-signal/50 text-signal hover:bg-[color-mix(in_oklab,var(--signal)_14%,var(--surface))]",
            taken &&
              "border-signal bg-[color-mix(in_oklab,var(--signal)_12%,var(--surface))] text-signal",
          )}
        >
          {head}
          {/* A part that did not fit hides behind "…" and shows in place on hover or keyboard focus
              (the chip grows over its neighbours for that moment). No `title` tooltip: it would
              repeat the accessible name as a description, and the in-place expansion already shows
              it. On touch the same text is in the peek bar (Design) and the Run tab rows (Simulate). */}
          {fit === "full"
            ? actions
            : hidden && (
                <>
                  <span
                    aria-hidden
                    className={cn(
                      "shrink-0 group-hover/chip:hidden group-focus-visible/chip:hidden",
                      meta,
                    )}
                  >
                    …
                  </span>
                  <span className="hidden items-center gap-1 group-hover/chip:flex group-focus-visible/chip:flex">
                    {fit === "event" && transition.guard && (
                      <span className={cn("shrink-0", meta)}>[{transition.guard}]</span>
                    )}
                    {actions}
                  </span>
                </>
              )}
        </button>
      </PopoverAnchor>
      {guarded && (
        <PayloadPopover
          event={transition.event!}
          guard={transition.guard!}
          passes={enabled}
          onSent={() => setOpen(false)}
          onInteractOutside={(event) => {
            if (chipRef.current?.contains(event.target as globalThis.Node)) event.preventDefault();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            chipRef.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </Popover>
  );
}

/** Guarded event from the canvas: edit the payload and send without leaving the graph. */
function PayloadPopover({
  event,
  guard,
  passes,
  onSent,
  onInteractOutside,
  onCloseAutoFocus,
}: {
  readonly event: string;
  readonly guard: string;
  readonly passes: boolean;
  readonly onSent: () => void;
  readonly onInteractOutside: (event: Event) => void;
  readonly onCloseAutoFocus: (event: Event) => void;
}) {
  const shortcut = useShortcutLabel();
  const mv = useMachine();
  const id = React.useId();
  const invalid = !mv.sim.payload.ok;
  const sequence = mv.snapshot?.trace.at(-1)?.sequence;
  const lastBlocked = mv.blocked.at(-1);
  const refused = lastBlocked && lastBlocked.event === event && lastBlocked.after === sequence;
  const send = () => {
    const result = mv.sendEvent(event);
    if (result?.changed) onSent();
  };
  return (
    <PopoverContent
      side="top"
      className="w-76 gap-2 p-3"
      onInteractOutside={onInteractOutside}
      onCloseAutoFocus={onCloseAutoFocus}
      aria-label={`${event} payload`}
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <Zap className="size-3.5 text-muted-foreground" />
        <span className="font-mono font-semibold">{event}</span>
        <span className="text-muted-foreground">
          guarded by <span className="font-mono">{guard}</span>
        </span>
      </div>
      <p
        role="status"
        className={cn(
          "flex items-start gap-1.5 rounded-md px-2 py-1.5 text-[11.5px] leading-4",
          passes ? "bg-signal-muted text-signal" : "bg-muted/70 text-muted-foreground",
        )}
      >
        {passes ? (
          <Check className="mt-px size-3.5 shrink-0" />
        ) : (
          <Ban className="mt-px size-3.5 shrink-0" />
        )}
        <span>
          {/* The shared sentences (machine-copy): the same words as the toast, live region and tree. */}
          {passes
            ? `${event} can fire — guard ${guard} passes now.`
            : `${describeBlocked(event, mv.explainEvent(event))}.${refused ? " The last send was refused." : ""}`}
        </span>
      </p>
      <MachineValue value={mv.snapshot?.context} label="Context" />
      <label htmlFor={id} className="text-[11px] text-muted-foreground">
        Event payload (JSON, optional)
      </label>
      <Textarea
        id={id}
        name="event-payload"
        value={mv.sim.payloadText}
        onChange={(e) => mv.sim.setPayloadText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !invalid) {
            e.preventDefault();
            send();
          }
        }}
        aria-invalid={invalid}
        aria-describedby={invalid ? `${id}-error` : undefined}
        placeholder="{ }"
        className="min-h-16 resize-none font-mono text-[11.5px]"
      />
      {invalid && (
        <span id={`${id}-error`} className="text-[11px] text-destructive">
          {(mv.sim.payload as { error: string }).error}
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground coarse:hidden">
          <Kbd dir="ltr">{shortcut("mod", KEY.enter)}</Kbd> send <Kbd>{KEY.escape}</Kbd> close
        </span>
        <Button size="sm" disabled={invalid} onClick={send} className="coarse:ms-auto">
          <Play /> Send {event}
        </Button>
      </div>
    </PopoverContent>
  );
}

export const edgeTypes = { transition: TransitionEdge };
