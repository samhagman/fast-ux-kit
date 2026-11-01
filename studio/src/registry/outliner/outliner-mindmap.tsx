import * as React from "react";
import { animate, motion, useReducedMotion } from "motion/react";
import { Handle, Position, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node, type NodeProps } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import "./outliner-views.css";
import { Check, Maximize, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens, ease } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useScopedDirection } from "@/lib/direction";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOutlinerContext } from "./context";
import { InlineText, inlineToSpeech } from "./inline";
import {
  fitMindMap,
  layoutMindMap,
  measureMindMapNode,
  metricsFor,
  mindMapGraph,
  stepMindMap,
  type MindBox,
  type MindGraph,
  type MindKey,
  type MindMapNode,
} from "./mindmap";
import { COLOR_STYLES, type OutlineItem } from "./types";

/**
 * The mind map of a zoomed item. Pan by dragging (one finger on a phone), zoom with the wheel,
 * a pinch or the corner buttons. Click a node to zoom into it; its fold button (or Space) folds
 * it, which is the outline's own fold. Keyboard: the map is one tab stop; arrows travel,
 * Enter zooms in, Space folds, Home returns to the centre, 0 fits the map to the screen.
 *
 * Loaded on demand (outliner.tsx lazy-imports this file), so the layout engine and the canvas
 * only download when someone opens a mind map.
 */
export default function OutlinerMindMap({ root }: { readonly root: OutlineItem }) {
  return (
    <ReactFlowProvider>
      <MindMapCanvas root={root} />
    </ReactFlowProvider>
  );
}

interface MindData extends Record<string, unknown> {
  readonly mind: MindMapNode;
  readonly focused: boolean;
  readonly rtl: boolean;
  readonly domId: string;
  readonly onToggle: (id: string) => void;
}
type MindFlowNode = Node<MindData, "mind">;

const nodeTypes = { mind: MindMapNodeView };

function MindMapCanvas({ root }: { readonly root: OutlineItem }) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const flow = useReactFlow();
  const reduce = useReducedMotion();
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 639px)");
  const hostRef = React.useRef<HTMLDivElement>(null);
  // The outliner's direction scope (follows a host flipping `dir` at runtime).
  const rtl = useScopedDirection() === "rtl";
  const graph = React.useMemo(
    () => mindMapGraph(root, ol.state.expandedIds, { hideCompleted: ol.view.hideCompleted, oneSided: narrow }),
    [root, ol.state.expandedIds, ol.view.hideCompleted, narrow],
  );
  const [boxes, setBoxes] = React.useState<Map<string, MindBox> | null>(null);
  /** What the current boxes were laid out for (fit once per root, width class and direction). */
  const layoutKey = React.useRef("");
  React.useEffect(() => {
    let cancelled = false;
    const key = `${root.id}:${narrow}:${rtl}`;
    // Measure with the real font: wait for webfonts before the first layout.
    const fonts = typeof document !== "undefined" && document.fonts ? document.fonts.ready : Promise.resolve();
    void fonts.then(() => layoutMindMap(graph, (mind) => measureMindMapNode(mind, L.untitled), { rtl })).then((next) => {
      if (cancelled) return;
      layoutKey.current = key;
      setBoxes(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, rtl, L.untitled]);

  // Positions glide to their new places after a fold (edges follow, since they are drawn from
  // the node positions each frame). New nodes grow out of their parent's old position.
  const shown = useGlide(boxes, graph, !!reduce);

  const [focusId, setFocusId] = React.useState<string>(root.id);
  React.useEffect(() => {
    if (!graph.nodes.has(focusId)) setFocusId(root.id);
  }, [graph, focusId, root.id]);
  const domPrefix = React.useId();
  const domId = (id: string) => `${domPrefix}-mind-${id}`;

  const toggle = React.useCallback(
    (id: string) => {
      ol.dispatch({ type: "toggle", id });
    },
    [ol],
  );

  const nodes = React.useMemo<MindFlowNode[]>(() => {
    if (!shown) return [];
    return graph.order.flatMap((id) => {
      const box = shown.get(id);
      const mind = graph.nodes.get(id)!;
      if (!box) return [];
      return [
        {
          id,
          type: "mind" as const,
          position: { x: box.x, y: box.y },
          width: box.width,
          height: box.height,
          draggable: false,
          selectable: false,
          data: { mind, focused: id === focusId, rtl, domId: domId(id), onToggle: toggle },
        },
      ];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, graph, focusId, rtl, toggle]);

  const edges = React.useMemo<Edge[]>(() => {
    if (!shown) return [];
    return graph.order.flatMap((id) => {
      const mind = graph.nodes.get(id)!;
      if (!mind.parentId || !shown.has(id)) return [];
      const right = (mind.side === "end") !== rtl;
      return [
        {
          id: `e-${id}`,
          source: mind.parentId,
          target: id,
          sourceHandle: right ? "out-right" : "out-left",
          targetHandle: right ? "in-left" : "in-right",
          type: "default",
          focusable: false,
          selectable: false,
          // Structure is announced by the tree (aria-level); edges are decoration.
          ariaRole: "presentation",
          domAttributes: { "aria-hidden": true },
          className: cn("ol-mind-edge", mind.depth === 1 && "ol-mind-edge-branch"),
        },
      ];
    });
  }, [shown, graph, rtl]);

  /**
   * Fit the whole map (`fitMindMap`): desktop centres it, a phone pins it to the top edge, and
   * neither shrinks labels below 12 px (a bigger map keeps its root in view and pans instead).
   */
  const fit = React.useCallback(
    (duration: number) => {
      const host = hostRef.current;
      if (!boxes?.size || !host) return;
      void flow.setViewport(fitMindMap(boxes, root.id, { width: host.clientWidth, height: host.clientHeight }, { narrow, rtl }), { duration });
    },
    [boxes, flow, narrow, rtl, root.id],
  );

  // Fit once the first layout lands (and whenever the map's root changes). It fits the
  // layout's own bounds (not the gliding positions), so a refit lands where the nodes are going.
  const fitted = React.useRef<string | null>(null);
  React.useEffect(() => {
    const key = layoutKey.current;
    if (!boxes || fitted.current === key) return;
    const first = fitted.current === null;
    fitted.current = key;
    requestAnimationFrame(() => fit(first || reduce ? 0 : 260));
  }, [boxes, fit, reduce]);

  /** Keep the focused node on screen (pan only; the zoom stays the user's). */
  const reveal = React.useCallback(
    (id: string) => {
      const box = boxes?.get(id);
      const host = hostRef.current;
      if (!box || !host) return;
      const { x, y, zoom } = flow.getViewport();
      const left = box.x * zoom + x;
      const top = box.y * zoom + y;
      const margin = 32;
      const inside = left > margin && top > margin && left + box.width * zoom < host.clientWidth - margin && top + box.height * zoom < host.clientHeight - margin;
      if (!inside) void flow.setCenter(box.x + box.width / 2, box.y + box.height / 2, { zoom, duration: reduce ? 0 : 220 });
    },
    [boxes, flow, reduce],
  );

  const zoomInto = (id: string) => {
    if (id === root.id) return;
    ol.dispatch({ type: "hoist", id });
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    const keys: Record<string, MindKey> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "up", ArrowDown: "down", Home: "home" };
    const key = keys[event.key];
    if (key) {
      event.preventDefault();
      event.stopPropagation();
      const step = stepMindMap(graph, focusId, key, rtl);
      if (!step) return;
      if ("unfold" in step) {
        toggle(step.unfold);
        return;
      }
      setFocusId(step.id);
      reveal(step.id);
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      zoomInto(focusId);
    } else if (event.key === " " && !event.metaKey && !event.ctrlKey && !event.altKey) {
      // Plain Space only (⌘⇧Space is quick capture).
      event.preventDefault();
      event.stopPropagation();
      const mind = graph.nodes.get(focusId);
      if (mind?.hasChildren && mind.depth > 0) toggle(focusId);
    } else if (event.key === "0" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      fit(reduce ? 0 : 260);
    } else if ((event.key === "=" || event.key === "+") && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void flow.zoomIn({ duration: reduce ? 0 : 160 });
    } else if (event.key === "-" && !event.metaKey && !event.ctrlKey) {
      event.preventDefault();
      void flow.zoomOut({ duration: reduce ? 0 : 160 });
    }
  };

  const title = inlineToSpeech(root.text) || L.untitled;
  return (
    <motion.div
      ref={hostRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: boxes ? 1 : 0.001 }}
      transition={motionTokens.base}
      data-mindmap=""
      className="ol-mindmap relative h-full min-h-[360px] w-full touch-none overflow-hidden border-y border-hairline bg-[color-mix(in_srgb,var(--muted)_35%,var(--surface))] group/map outline-none sm:rounded-lg sm:border"
      role="tree"
      aria-label={L.mindMap(title)}
      aria-activedescendant={domId(focusId)}
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
      <ReactFlow<MindFlowNode, Edge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        zoomOnDoubleClick={false}
        panOnScroll={false}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_, node) => {
          setFocusId(node.id);
          zoomInto(node.id);
        }}
        onlyRenderVisibleElements={graph.order.length > 150}
      />
      {/* Corner controls: zoom and fit (44 px on touch). A phone keeps them in the start
          corner: the end corner belongs to the floating capture button. */}
      <div className="absolute end-2 bottom-2 z-10 max-sm:start-2 max-sm:end-auto flex items-center gap-0.5 rounded-lg border border-hairline bg-surface/95 p-0.5 shadow-[0_1px_2px_rgb(0_0_0/0.05)] backdrop-blur-sm">
        <MapButton label="Zoom out" onClick={() => void flow.zoomOut({ duration: reduce ? 0 : 160 })}>
          <Minus />
        </MapButton>
        <MapButton label="Zoom in" onClick={() => void flow.zoomIn({ duration: reduce ? 0 : 160 })}>
          <Plus />
        </MapButton>
        <MapButton label={L.fitView} onClick={() => fit(reduce ? 0 : 260)}>
          <Maximize />
        </MapButton>
      </div>
      {!coarse && (
        <div aria-hidden className="pointer-events-none absolute start-3 bottom-2.5 z-10 font-mono text-[10.5px] text-muted-foreground/80 max-sm:hidden">
          {L.mindMapHelp}
          {graph.truncated && ` · first ${graph.order.length} items`}
        </div>
      )}
    </motion.div>
  );
}

function MapButton({ label, onClick, children }: { readonly label: string; readonly onClick: () => void; readonly children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          tabIndex={-1}
          onClick={onClick}
          className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground coarse:size-10 [&_svg]:size-3.5"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** Tween positions between layouts (≈ base duration); instant under reduced motion. */
function useGlide(target: Map<string, MindBox> | null, graph: MindGraph, reduce: boolean): Map<string, MindBox> | null {
  const [shown, setShown] = React.useState(target);
  const current = React.useRef(target);
  React.useEffect(() => {
    if (!target) return;
    const from = current.current;
    if (!from || reduce) {
      current.current = target;
      setShown(target);
      return;
    }
    const start = new Map<string, MindBox>();
    for (const [id, box] of target) {
      let origin = from.get(id);
      // A node that just appeared grows out of the nearest ancestor that was already there.
      for (let up = graph.nodes.get(id)?.parentId; !origin && up; up = graph.nodes.get(up)?.parentId ?? null) {
        const parent = from.get(up);
        if (parent) origin = { ...box, x: parent.x + (parent.width - box.width) / 2, y: parent.y + (parent.height - box.height) / 2 };
      }
      start.set(id, origin ?? box);
    }
    const controls = animate(0, 1, {
      duration: motionTokens.base.duration + 0.04,
      ease,
      onUpdate: (t) => {
        const frame = new Map<string, MindBox>();
        for (const [id, box] of target) {
          const a = start.get(id)!;
          frame.set(id, { ...box, x: a.x + (box.x - a.x) * t, y: a.y + (box.y - a.y) * t });
        }
        current.current = frame;
        setShown(frame);
      },
      onComplete: () => {
        current.current = target;
        setShown(target);
      },
    });
    return () => controls.stop();
  }, [target, graph, reduce]);
  return shown;
}

function MindMapNodeView({ data }: NodeProps<MindFlowNode>) {
  const { mind, focused, rtl, domId, onToggle } = data;
  const { ui } = useOutlinerContext();
  const node = mind.node;
  const metrics = metricsFor(mind.depth);
  const done = node.checked === true || node.data?.completed === true;
  const task = node.checked !== undefined;
  const color = node.data?.color ? COLOR_STYLES[node.data.color] : null;
  // The fold button sits just outside the outer edge (away from the root), in physical terms:
  // the map is laid out mirrored for right-to-left already.
  const outerRight = mind.side === "root" ? false : (mind.side === "end") !== rtl;
  const handle = "!pointer-events-none !size-px !min-w-0 !border-0 !bg-transparent !opacity-0";
  return (
    <div
      id={domId}
      role="treeitem"
      aria-level={mind.depth + 1}
      aria-selected={focused}
      aria-expanded={mind.hasChildren ? !mind.folded : undefined}
      aria-label={`${inlineToSpeech(node.text) || ui.labels.untitled}${task ? (done ? ", done" : ", to do") : ""}${mind.folded ? `, folded, ${mind.hidden} inside` : ""}`}
      data-mind-node={mind.id}
      data-depth={mind.depth}
      className={cn(
        "group/mind relative flex h-full w-full cursor-pointer items-center gap-1.5 rounded-lg border bg-surface text-start transition-[box-shadow,border-color,background-color] duration-150",
        mind.depth === 0
          ? "border-foreground/80 bg-foreground text-background shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
          : mind.depth === 1
            ? "border-border shadow-[0_1px_1px_rgb(0_0_0/0.04)] hover:border-foreground/30"
            : "border-hairline hover:border-foreground/25",
        // One focus indicator: the focused node's ring, only while the map has keyboard focus
        // (the canvas itself draws none).
        focused && "group-focus-visible/map:ring-3 group-focus-visible/map:ring-signal/35",
        focused && mind.depth > 0 && "group-focus-visible/map:border-signal/70",
      )}
      style={{ paddingInline: metrics.padX, paddingBlock: metrics.padY }}
    >
      <Handle type="target" id="in-left" position={Position.Left} isConnectable={false} className={handle} />
      <Handle type="target" id="in-right" position={Position.Right} isConnectable={false} className={handle} />
      <Handle type="source" id="out-left" position={Position.Left} isConnectable={false} className={handle} />
      <Handle type="source" id="out-right" position={Position.Right} isConnectable={false} className={handle} />
      {/* The colour stripe sits on the edge facing the root (physical, like the fold button:
          the layout is already mirrored for right-to-left). */}
      {color && mind.depth > 0 && (
        <span aria-hidden data-mind-stripe={outerRight ? "left" : "right"} className={cn("absolute inset-y-1.5 w-[2px] rounded-full opacity-80", outerRight ? "left-1" : "right-1", color.bar)} />
      )}
      {task && (
        <span
          aria-hidden
          className={cn(
            "grid size-3.5 shrink-0 place-items-center rounded-[4px] border",
            done ? "border-signal bg-signal text-signal-foreground" : mind.depth === 0 ? "border-background/50" : "border-foreground/30",
          )}
        >
          {done && <Check className="size-2.5" strokeWidth={3} />}
        </span>
      )}
      <span
        dir="auto"
        className={cn(
          "line-clamp-3 min-w-0 flex-1 break-words",
          mind.depth === 0 ? "text-[15px] leading-5 font-semibold" : mind.depth === 1 ? "text-[13px] leading-[18px] font-medium" : "text-[13px] leading-[18px]",
          done && "text-muted-foreground line-through decoration-muted-foreground/50",
        )}
      >
        <InlineText source={node.text || ui.labels.untitled} />
      </span>
      {mind.hasChildren && mind.depth > 0 && (
        <button
          type="button"
          tabIndex={-1}
          aria-label={mind.folded ? `Unfold (${mind.hidden})` : "Fold"}
          onClick={(event) => {
            event.stopPropagation();
            onToggle(mind.id);
          }}
          className={cn(
            "nodrag nopan absolute top-1/2 z-10 grid h-[18px] min-w-[18px] -translate-y-1/2 place-items-center rounded-full border bg-surface px-1 font-mono text-[10px] leading-none text-muted-foreground tabular-nums shadow-[0_1px_1px_rgb(0_0_0/0.05)] transition-[opacity,color,border-color] duration-150 after:absolute after:-inset-2 hover:border-foreground/40 hover:text-foreground coarse:after:-inset-3",
            outerRight ? "right-0 translate-x-[calc(100%+5px)]" : "left-0 -translate-x-[calc(100%+5px)]",
            mind.folded ? "border-foreground/25 opacity-100" : "border-hairline opacity-0 group-hover/mind:opacity-100 coarse:opacity-100",
            focused && "opacity-100",
          )}
        >
          {mind.folded ? `+${mind.hidden}` : <Minus className="size-2.5" />}
        </button>
      )}
    </div>
  );
}
