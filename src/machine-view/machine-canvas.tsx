import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  applyNodeChanges,
  useInternalNode,
  useReactFlow,
  useStore,
  useStoreApi,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import {
  ChevronRight,
  CircleDot,
  Columns2,
  Maximize,
  Minus,
  Pencil,
  Plus,
  Square,
  SquareDashed,
  SquareStack,
  StickyNote,
  Target,
  Trash2,
} from "lucide-react";
import type { MachineCommand, MachineNode } from "../core/index.js";
import { useDirection } from "@base-ui/react/direction-provider";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import { HEADER, transitionLabel } from "./layout.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { KEY } from "../machine-shared/machine-copy.js";
import { KIND_LABEL, subtreeOf, useCanvas, useMachineChrome } from "./machine-context.js";
import {
  DragContext,
  buildNodes,
  nodeTypes,
  type FlowNode,
  type NodeHelp,
} from "./machine-nodes.js";
import {
  EDGE_Z,
  EdgeEnvContext,
  edgeTypes,
  type EdgeEnv,
  type FlowEdge,
  type TransitionData,
} from "./machine-edges.js";
import { ToolButton } from "./machine-toolbar.js";
import {
  PHONE_MIN_ZOOM,
  clearBand,
  fitToBand,
  overflowSides,
  panToward,
  placeToolbar,
  revealInBand,
  targetRects,
  viewportDuration,
  type OverflowSide,
  type Rect,
} from "./machine-viewport.js";

/* ───────────────────────────── Canvas ───────────────────────────── */

export const MachineCanvas = React.memo(function MachineCanvas() {
  const mv = useCanvas();
  const dir = useDirection();
  const chrome = useMachineChrome();
  const flow = useReactFlow<FlowNode, FlowEdge>();
  const viewportApi = useReactFlow();
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const dom = useStore((state) => state.domNode);
  React.useEffect(() => {
    if (width && height) mv.viewport.current = { width, height };
  }, [width, height, mv.viewport]);
  const [nodes, setNodes] = React.useState<FlowNode[]>([]);
  const [moving, setMoving] = React.useState<ReadonlySet<string>>(new Set());
  const [dropTarget, setDropTarget] = React.useState<string | null>(null);
  const [settling, setSettling] = React.useState(false);
  const settleTimer = React.useRef(0);
  const openedAt = React.useRef(-Infinity);
  React.useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const [rebuild, setRebuild] = React.useState(0);
  /** Hidden until the opening layout (estimate + measured pass) has settled: no first-paint jump. */
  const [revealed, setRevealed] = React.useState(false);
  const revealTimer = React.useRef(0);
  const revealBy = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(revealTimer.current), []);
  const layout = mv.layout;
  const design = mv.mode === "design" && mv.editable;
  const coarse = useMediaQuery("(pointer: coarse)");
  const selectedNode = mv.selection?.type === "node" ? mv.selection.id : null;
  const selectedEdge = mv.selection?.type === "transition" ? mv.selection.id : null;
  const nodesRef = React.useRef(nodes);
  nodesRef.current = nodes;
  React.useEffect(() => {
    const request = mv.revealRequest;
    if (!request || request.machineId !== mv.machineId || !layout) return;
    const edge = mv.graph.transitions.find((t) => t.id === request.id);
    const id = edge?.sourceId ?? request.id;
    if (!nodes.some((n) => n.id === id)) return;
    const timer = requestAnimationFrame(() => {
      const node = flow.getInternalNode(id);
      if (!node) return;
      // Let keyboard focus restoration finish before the explicit zoom owns the viewport.
      dom
        ?.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`)
        ?.focus({ preventScroll: true });
      const p = node.internals.positionAbsolute;
      const band = dom ? clearBand(dom, chrome.panelOpen ? chrome.sheetInset : 0, 12) : null;
      const zoom = Math.max(1, flow.getZoom());
      void flow.setViewport(
        {
          x:
            (band ? (band.x0 + band.x1) / 2 : width / 2) -
            (p.x + (node.measured.width ?? node.width ?? 160) / 2) * zoom,
          y:
            (band ? (band.y0 + band.y1) / 2 : height / 2) -
            (p.y + (node.measured.height ?? node.height ?? 60) / 2) * zoom,
          zoom,
        },
        {
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200,
        },
      );
    });
    return () => cancelAnimationFrame(timer);
  }, [mv.revealRequest, mv.machineId, layout, nodes.length, flow, dom]);
  // Per-instance ids: SVG markers and node descriptions never collide across two views on a page.
  const uid = React.useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const describedBy = React.useCallback((help: NodeHelp) => `mv-${uid}-help-${help}`, [uid]);

  /** Fits the machine into the clear band (between palette, controls, peek bar or sheet). */
  const fit = React.useCallback(
    (animate: boolean, overview = false) => {
      const el = viewportApi.getNodes().length ? (dom ?? null) : null;
      if (el)
        fitToBand(viewportApi, el, {
          compact: chrome.compact && !overview,
          sheetInset: chrome.panelOpen ? chrome.sheetInset : 0,
          animate,
          anchorId: [...mv.leafIds][0] ?? mv.graph.initialId,
        });
    },
    [viewportApi, dom, chrome.compact, chrome.panelOpen, chrome.sheetInset, mv.leafIds, mv.graph],
  );
  const fitRef = React.useRef(fit);
  fitRef.current = fit;

  // Rebuild flow nodes from each fresh layout. Positions come from layout (which already
  // honours the user's pinned positions); measurement and selection carry over.
  React.useEffect(() => {
    if (!layout) return;
    const before = new Map(
      nodesRef.current.map((n) => [n.id, flow.getInternalNode(n.id)?.internals.positionAbsolute]),
    );
    const next = buildNodes(layout, mv.graph, design, selectedNode, nodesRef.current, describedBy);
    const shifted = next.some((n) => {
      const was = before.get(n.id);
      const now = layout.nodes.get(n.id);
      return was && now && (Math.abs(was.x - now.x) > 0.5 || Math.abs(was.y - now.y) > 0.5);
    });
    setNodes(next);
    const pending = mv.fitPending.current;
    // Right after a machine opens, the measured-height pass is part of "loading": the canvas
    // stays invisible until layouts stop landing (or a short deadline), then fades in fitted.
    const opening = performance.now() - openedAt.current < 900;
    if (pending === "instant") {
      openedAt.current = performance.now();
      revealBy.current = performance.now() + 480;
      setRevealed(false);
    }
    const wait = revealBy.current - performance.now();
    if (wait > 0) {
      window.clearTimeout(revealTimer.current);
      revealTimer.current = window.setTimeout(() => setRevealed(true), Math.min(150, wait));
    }
    if (shifted && opening && !pending) {
      requestAnimationFrame(() => fitRef.current(false));
      return;
    }
    if (shifted && pending !== "instant") {
      // Relayout: nodes glide (CSS transform transition); edges glide with them (see GlidingPath).
      setSettling(true);
      window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => setSettling(false), 300);
      if (pending) {
        mv.fitPending.current = null;
        requestAnimationFrame(() => fitRef.current(true));
      }
      return;
    }
    if (pending) {
      mv.fitPending.current = null;
      requestAnimationFrame(() => fitRef.current(pending === "animate"));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, mv.layoutVersion, rebuild]);

  // A vetoed change (or one that never applied) snaps dragged nodes back to the document's layout.
  React.useEffect(() => {
    if (mv.refusals) setRebuild((v) => v + 1);
  }, [mv.refusals]);

  // Draggability follows the mode.
  React.useEffect(() => {
    setNodes((current) =>
      current.some((n) => n.type !== "initial" && n.draggable !== design)
        ? current.map((n) =>
            n.type === "initial" || n.draggable === design ? n : { ...n, draggable: design },
          )
        : current,
    );
  }, [design]);

  // Selection has ONE owner (mv.selection). This effect mirrors it into React Flow; React
  // Flow's own select changes are translated back in onNodesChange, never in render.
  React.useEffect(() => {
    setNodes((current) =>
      current.some((n) => !!n.selected !== (n.id === selectedNode))
        ? current.map((n) =>
            !!n.selected === (n.id === selectedNode)
              ? n
              : { ...n, selected: n.id === selectedNode },
          )
        : current,
    );
  }, [selectedNode]);

  const edges = React.useMemo<FlowEdge[]>(() => {
    if (!layout) return [];
    const transitions = new Map(mv.graph.transitions.map((t) => [t.id, t]));
    const kinds = new Map(mv.graph.nodes.map((n) => [n.id, n]));
    const out: FlowEdge[] = [];
    for (const route of layout.edges) {
      const transition = transitions.get(route.id);
      const source = kinds.get(route.sourceId);
      const target = kinds.get(route.targetId);
      const fromInitial = source?.kind === "initial" && !transition?.event;
      out.push({
        id: route.id,
        source: route.sourceId,
        target: route.targetId,
        type: "transition",
        data: {
          route: route.points.length > 1 ? route : undefined,
          transition,
          synthetic: route.synthetic,
          fromInitial,
        },
        selectable: !route.synthetic,
        // The arrow out of an initial pseudo-state is part of the dot ("starts here" lives on its target).
        focusable: !route.synthetic && !fromInitial,
        ...(route.synthetic || fromInitial ? { domAttributes: { "aria-hidden": true } } : {}),
        selected: route.id === selectedEdge,
        // The chip's own words (event [guard] / actions), then the route: one name for one transition.
        ariaLabel: transition
          ? `${transitionLabel(transition)}: ${source?.label ?? route.sourceId} to ${target?.label ?? route.targetId}`
          : undefined,
        zIndex: EDGE_Z,
      });
    }
    const pairs = new Map<string, FlowEdge[]>();
    for (const edge of out) {
      const key = [edge.source, edge.target].sort().join("|");
      pairs.set(key, [...(pairs.get(key) ?? []), edge]);
    }
    for (const group of pairs.values())
      if (group.length > 1)
        group.forEach((edge, i) => {
          (edge as { data: TransitionData }).data = {
            ...edge.data,
            pairOffset: (i - (group.length - 1) / 2) * 18,
          };
        });
    for (const note of mv.graph.nodes) {
      if (note.kind === "note" && note.attachedToId)
        out.push({
          id: `__note:${note.id}`,
          source: note.id,
          target: note.attachedToId,
          targetHandle: "note",
          type: "transition",
          data: { synthetic: "note" },
          selectable: false,
          focusable: false,
          reconnectable: false,
          domAttributes: { "aria-hidden": true },
          zIndex: 5,
        });
    }
    return out;
  }, [layout, mv.graph, selectedEdge]);

  /** Arrow-key moves (React Flow a11y) arrive as non-dragging position changes: debounce a burst into one commit. */
  const pointerDragging = React.useRef(false);
  const keyMoved = React.useRef(new Set<string>());
  const keyTimer = React.useRef(0);
  React.useEffect(() => () => window.clearTimeout(keyTimer.current), []);
  const heightsFor = React.useRef<{ id: string; height: number }[]>([]);
  const flushHeights = React.useRef(0);
  const onNodesChange = React.useCallback(
    (changes: NodeChange<FlowNode>[]) => {
      for (const change of changes) {
        if (change.type === "select" && change.selected && !change.id.startsWith("__"))
          mv.setSelection({ type: "node", id: change.id });
        if (
          change.type === "position" &&
          change.position &&
          !change.dragging &&
          !pointerDragging.current &&
          !change.id.startsWith("__")
        ) {
          if (!keyMoved.current.has(change.id))
            setMoving((current) => new Set([...current, ...subtreeOf(mv.graph, change.id)]));
          keyMoved.current.add(change.id);
          window.clearTimeout(keyTimer.current);
          keyTimer.current = window.setTimeout(() => {
            const ids = [...keyMoved.current];
            keyMoved.current.clear();
            for (const id of ids)
              commitRef.current(id, { allowReparent: false, viaKeyboard: true });
          }, 380);
        }
        if (change.type === "dimensions" && change.dimensions) {
          const node = nodesRef.current.find((n) => n.id === change.id);
          const laid = layout?.nodes.get(change.id);
          if (
            node &&
            laid &&
            (node.type === "state" || node.type === "note") &&
            Math.abs(laid.height - change.dimensions.height) > 1
          )
            heightsFor.current.push({ id: change.id, height: change.dimensions.height });
        }
      }
      setNodes((current) => applyNodeChanges(changes, current));
      if (heightsFor.current.length) {
        cancelAnimationFrame(flushHeights.current);
        flushHeights.current = requestAnimationFrame(() => {
          const batch = heightsFor.current;
          heightsFor.current = [];
          mv.reportHeights(batch);
        });
      }
    },
    [mv, layout],
  );
  const onEdgesChange = React.useCallback(
    (changes: EdgeChange<FlowEdge>[]) => {
      for (const change of changes) {
        if (change.type !== "select" || !change.selected || change.id.startsWith("__")) continue;
        if (mv.mode === "simulate" && mv.candidates.enabled.has(change.id)) continue;
        mv.setSelection({ type: "transition", id: change.id });
      }
    },
    [mv],
  );

  /** Deepest container under the dragged node's centre, outside its own subtree. */
  const findDropTarget = (id: string, subtree: ReadonlySet<string>) => {
    const dragged = flow.getInternalNode(id);
    if (!dragged) return undefined;
    const draggedNode = mv.graph.nodes.find((n) => n.id === id);
    if (!draggedNode || draggedNode.kind === "note") return draggedNode?.parentId;
    const cx = dragged.internals.positionAbsolute.x + (dragged.measured.width ?? 0) / 2;
    const cy =
      dragged.internals.positionAbsolute.y + Math.min(HEADER, dragged.measured.height ?? 0) / 2;
    let best: { id: string; depth: number } | undefined;
    for (const candidate of mv.graph.nodes) {
      if (
        (candidate.kind !== "compound" && candidate.kind !== "parallel") ||
        subtree.has(candidate.id)
      )
        continue;
      const box = flow.getInternalNode(candidate.id);
      if (!box) continue;
      const { x, y } = box.internals.positionAbsolute;
      if (
        cx < x ||
        cy < y ||
        cx > x + (box.measured.width ?? 0) ||
        cy > y + (box.measured.height ?? 0)
      )
        continue;
      let depth = 0;
      for (let p = candidate.parentId; p; p = mv.graph.nodes.find((n) => n.id === p)?.parentId)
        depth++;
      if (!best || depth > best.depth) best = { id: candidate.id, depth };
    }
    return best?.id;
  };

  /**
   * Ends a pointer drag or a keyboard-move burst as ONE history step. A drop into another
   * container is a reparent (the controller re-lays it out inside its new parent); anything
   * else pins the dragged position. Keyboard moves never reparent.
   */
  const commitDrag = (id: string, { allowReparent = true, viaKeyboard = false } = {}) => {
    const node = mv.graph.nodes.find((n) => n.id === id);
    const before = layout?.nodes.get(id);
    const internal = flow.getInternalNode(id);
    const subtree = subtreeOf(mv.graph, id);
    setMoving(new Set());
    setDropTarget(null);
    if (!node || !before || !internal) return;
    const at = internal.internals.positionAbsolute;
    const dx = Math.round(at.x - before.x);
    const dy = Math.round(at.y - before.y);
    const target = allowReparent ? findDropTarget(id, subtree) : node.parentId;
    if (node.kind !== "note" && target !== node.parentId) {
      if (!mv.reparent(id, target)) setRebuild((v) => v + 1);
      return;
    }
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const commands: MachineCommand[] = [
      {
        type: "update-node",
        machineId: mv.machineId,
        id,
        patch: { position: { x: Math.round(at.x), y: Math.round(at.y) } },
      },
    ];
    // Pinned descendants are absolute too: carry them by the same delta (from the latest
    // proposal, so a move right after another, before a slow host answers, does not undo it).
    for (const child of mv.latestGraph().nodes)
      if (child.id !== id && subtree.has(child.id) && child.position)
        commands.push({
          type: "update-node",
          machineId: mv.machineId,
          id: child.id,
          patch: { position: { x: child.position.x + dx, y: child.position.y + dy } },
        });
    const dir = [
      dx > 0 ? `${dx} right` : dx < 0 ? `${-dx} left` : "",
      dy > 0 ? `${dy} down` : dy < 0 ? `${-dy} up` : "",
    ]
      .filter(Boolean)
      .join(" and ");
    const ok = mv.run(commands, {
      label: `move ${node.label}`,
      ...(viaKeyboard
        ? { onAccept: () => mv.announce(`Moved ${node.label} ${dir}. Undo with Command Z.`) }
        : {}),
    });
    if (!ok) setRebuild((v) => v + 1); // invalid: snap back to the stored layout (a host veto does the same, below)
  };
  const commitRef = React.useRef(commitDrag);
  commitRef.current = commitDrag;

  const drag = React.useMemo(() => ({ moving, dropTarget }), [moving, dropTarget]);

  /** Re-target from the custom anchors on the routed path ends (see ReconnectAnchors). */
  const reconnect = (edgeId: string, connection: Connection) => {
    const t = mv.latestGraph().transitions.find((x) => x.id === edgeId);
    if (!t || !connection.source || !connection.target || mv.mode !== "design") return;
    if (connection.source === t.sourceId && connection.target === t.targetId) return;
    const name = (id: string) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id;
    const { source, target } = connection;
    mv.run(
      {
        type: "update-transition",
        machineId: mv.machineId,
        id: t.id,
        patch: { sourceId: source, targetId: target },
      },
      {
        label: `re-target ${t.event || "always"}`,
        onAccept: () => {
          mv.setSelection({ type: "transition", id: t.id });
          mv.notify({
            message: `${t.event || "always"} now goes ${name(source)} → ${name(target)}`,
            undo: true,
          });
          mv.announce(`Re-targeted ${t.event || "always"}: ${name(source)} to ${name(target)}`);
        },
      },
    );
  };
  const reconnectRef = React.useRef(reconnect);
  reconnectRef.current = reconnect;
  const edgeEnv = React.useMemo<EdgeEnv>(
    () => ({
      arrow: `mv-${uid}-arrow`,
      arrowSignal: `mv-${uid}-arrow-signal`,
      reconnectable: design,
      reconnect: (id, c) => reconnectRef.current(id, c),
    }),
    [uid, design],
  );

  return (
    <DragContext.Provider value={drag}>
      <EdgeEnvContext.Provider value={edgeEnv}>
        <svg aria-hidden width="0" height="0" className="absolute">
          <defs>
            <marker
              id={edgeEnv.arrow}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path
                d="M 1 1.5 L 9 5 L 1 8.5 z"
                fill="color-mix(in oklab, var(--foreground) 55%, transparent)"
              />
            </marker>
            <marker
              id={edgeEnv.arrowSignal}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M 1 1.5 L 9 5 L 1 8.5 z" fill="var(--signal)" />
            </marker>
          </defs>
        </svg>
        <NodeDescriptions idFor={describedBy} />
        <ReactFlow<FlowNode, FlowEdge>
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) =>
            !node.id.startsWith("__") && mv.setSelection({ type: "node", id: node.id })
          }
          onEdgeClick={(_, edge) => {
            const transition = edge.data?.transition;
            if (!transition) return;
            if (
              mv.mode === "simulate" &&
              transition.event &&
              (mv.candidates.enabled.has(transition.id) || mv.candidates.blocked.has(transition.id))
            )
              mv.sendEvent(transition.event);
            else mv.setSelection({ type: "transition", id: edge.id });
          }}
          onNodeDoubleClick={(_, node) => {
            const data = node.data as { node?: MachineNode };
            if (data?.node?.kind === "submachine" && data.node.machineId)
              mv.openMachine(data.node.machineId);
            else if (design && data?.node && data.node.kind !== "initial") mv.setRenaming(node.id);
          }}
          onNodeDragStart={(_, node) => {
            pointerDragging.current = true;
            setMoving(subtreeOf(mv.graph, node.id));
          }}
          onNodeDrag={(_, node) => {
            const target = findDropTarget(
              node.id,
              moving.size ? moving : subtreeOf(mv.graph, node.id),
            );
            const owner = mv.graph.nodes.find((n) => n.id === node.id)?.parentId;
            const next = target !== owner ? (target ?? "__root") : null;
            if (next !== dropTarget) setDropTarget(next);
          }}
          onNodeDragStop={(_, node) => {
            pointerDragging.current = false;
            commitDrag(node.id);
          }}
          onPaneClick={() => {
            mv.setSelection(null);
            mv.setRenaming(null);
          }}
          onConnect={(connection) => {
            if (!connection.source || !connection.target || mv.mode !== "design") return;
            const id = mv.freshId("t");
            const taken = new Set(
              mv
                .latestGraph()
                .transitions.filter((t) => t.sourceId === connection.source)
                .map((t) => t.event),
            );
            let event = "EVENT";
            for (let i = 2; taken.has(event); i++) event = `EVENT_${i}`;
            mv.run(
              {
                type: "add-transition",
                machineId: mv.machineId,
                transition: { id, sourceId: connection.source, targetId: connection.target, event },
              },
              {
                label: `connect ${event}`,
                onAccept: () => {
                  mv.setSelection({ type: "transition", id });
                  if (!chrome.compact) chrome.setPanelOpen(true);
                  mv.requestFocus("event");
                },
              },
            );
          }}
          // Re-targeting runs through our own anchors at the routed path ends (machine-edges).
          edgesReconnectable={false}
          ariaLabelConfig={{
            "edge.a11yDescription.default": edgeHelp(mv.mode, mv.editable, coarse),
          }}
          deleteKeyCode={null}
          selectionKeyCode={null}
          multiSelectionKeyCode={null}
          nodesConnectable={design}
          nodesFocusable
          edgesFocusable
          elementsSelectable
          minZoom={0.001}
          maxZoom={2}
          className={cn(
            "machine-flow",
            settling && "mv-settling",
            dropTarget === "__root" && "mv-drop-root",
            !revealed && "mv-unrevealed",
          )}
          // MIT attribution stays visible. Desktop: React Flow's own, at the logical end of the
          // canvas. Phone: it moves into the status bar (MachineStatusBar), so it never prints over
          // a note or a state above the peek bar or sheet.
          attributionPosition={dir === "rtl" ? "bottom-left" : "bottom-right"}
          proOptions={{ hideAttribution: chrome.compact }}
          data-mode={mv.mode}
          aria-label={`${mv.graph.label} statechart`}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            className="!bg-canvas [&_circle]:!fill-foreground/15"
          />
          {/* React Flow pins its own box to `direction: ltr`; this layer restores the page's
            direction so the palette and zoom/Fit controls sit at the logical start/end. */}
          <div
            dir={dir}
            data-mv-overlays
            className="pointer-events-none absolute inset-0 z-10 [&>*]:pointer-events-auto"
          >
            <ZoomControls onFit={() => fit(true, true)} />
            <AnimatePresence>{design && <DesignPalette key="palette" />}</AnimatePresence>
          </div>
          <ZoomVar />
          <OverflowHint />
          {chrome.minimap && (
            <MiniMap
              pannable
              zoomable
              position={dir === "rtl" ? "bottom-left" : "bottom-right"}
              ariaLabel="Minimap"
              className="!m-3 !mb-7 !rounded-lg !border !border-border !bg-surface !shadow-none"
              maskColor="color-mix(in oklab, var(--foreground) 6%, transparent)"
              nodeColor={(node) =>
                mv.activeSet.has(node.id)
                  ? "var(--signal)"
                  : "color-mix(in oklab, var(--foreground) 18%, transparent)"
              }
              nodeBorderRadius={4}
              style={{ width: 168, height: 104 }}
            />
          )}
          <SelectionToolbar />
          <Choreographer />
        </ReactFlow>
      </EdgeEnvContext.Provider>
    </DragContext.Provider>
  );
});

/**
 * Edge help, per mode, editability and pointer: it only names keys (or, on touch, gestures and
 * controls) that really do something here. Touch copy mirrors the tree's ("Tap a state…").
 */
const edgeHelp = (mode: string, editable: boolean, touch: boolean) =>
  touch
    ? mode === "simulate"
      ? "Tap to select the transition. Its event chip sends the event when it is available."
      : editable
        ? "Tap to select the transition. The bar at the bottom re-targets or deletes it."
        : "Tap to select the transition. The bar at the bottom opens its details."
    : mode === "simulate"
      ? "Enter selects the transition. Its event chip sends the event when it is available."
      : editable
        ? "Enter selects the transition. Delete removes it, Escape deselects. Drag either end to re-target it."
        : "Enter selects the transition, Escape deselects.";

/**
 * Node help, one hidden description per node kind (nodes point at theirs through
 * `aria-describedby`). Built per kind, mode, editability and pointer, so a note never promises A,
 * a read-only view never promises Delete, and a phone never promises a key it has no keyboard for.
 */
function NodeDescriptions({ idFor }: { readonly idFor: (help: NodeHelp) => string }) {
  const mv = useCanvas();
  const touch = useMediaQuery("(pointer: coarse)");
  const design = mv.mode === "design" && mv.editable;
  const simulate = mv.mode === "simulate";
  const text: Record<NodeHelp, string> = touch
    ? design
      ? {
          state:
            "Tap to select it. The bar at the bottom adds a connected state, renames or deletes it. Drag it to move it.",
          final:
            "Tap to select it. The bar at the bottom renames or deletes it. Drag it to move it.",
          submachine:
            "Tap to select it; its Open button opens the submachine. The bar at the bottom adds a connected state, renames or deletes it. Drag it to move it.",
          note: "Tap to select it. The bar at the bottom edits or deletes it. Drag it to move it.",
        }
      : {
          state: simulate
            ? "Tap to select it. Tap an available event chip to send it; the Run tab steps through the trace."
            : "Tap to select it. The bar at the bottom opens its details.",
          final: simulate
            ? "Tap to select it. The run ends here."
            : "Tap to select it. The bar at the bottom opens its details.",
          submachine: `Tap to select it; its Open button opens the submachine.${simulate ? " Tap an available event chip to send it." : ""}`,
          note: "Tap to select it.",
        }
    : design
      ? {
          state: `Enter selects it. Enter again or F2 renames it, A adds a connected state. ${MOVE} Delete removes it, Escape deselects.`,
          final: `Enter selects it. Enter again or F2 renames it. ${MOVE} Delete removes it, Escape deselects.`,
          submachine: `Enter selects it. Enter again or F2 renames it, A adds a connected state, its Open button opens the submachine. ${MOVE} Delete removes it, Escape deselects.`,
          note: `Enter selects it. Enter again or F2 edits the text. ${MOVE} Delete removes it, Escape deselects.`,
        }
      : {
          state: `Enter selects it, Escape deselects.${simulate ? TRACE : ""}`,
          final: `Enter selects it, Escape deselects.${simulate ? TRACE : ""}`,
          submachine: `Enter selects it, its Open button opens the submachine. Escape deselects.${simulate ? TRACE : ""}`,
          note: `Enter selects it, Escape deselects.`,
        };
  return (
    <div hidden>
      {(Object.keys(text) as NodeHelp[]).map((help) => (
        <div key={help} id={idFor(help)}>
          {text[help]}
        </div>
      ))}
    </div>
  );
}

const MOVE = "Arrow keys move it, Shift for bigger steps.";
const TRACE = " Left and right arrows step through the trace.";

/** Publishes the zoom as `--mv-zoom` so screen-size hit areas can compensate for it in CSS. */
function ZoomVar() {
  const zoom = useStore((state) => state.transform[2]);
  const dom = useStore((state) => state.domNode);
  React.useLayoutEffect(() => dom?.style.setProperty("--mv-zoom", String(zoom)), [dom, zoom]);
  return null;
}

const OVERFLOW_LABEL: Record<OverflowSide, string> = {
  l: "Pan left: more of the machine",
  r: "Pan right: more of the machine",
  t: "Pan up: more of the machine",
  b: "Pan down: more of the machine",
};

/**
 * Where the machine continues off-screen: a soft fade plus a button that pans about one view
 * that way (phones open at a readable zoom, so a wide machine is panned, not shrunk). The fades
 * never take pointer events; only the button does.
 *
 * "Off-screen" means outside the CLEAR BAND (`overflowSides`), not the pane: a final state
 * under the phone peek bar is hidden even though it is inside the canvas box. Each button docks
 * to the band's edge on its side (below the palette, above the peek bar, beside the zoom
 * controls), inset 8px, and slides along that edge to the spot that covers the least: states,
 * chips and drawn lines are its occluder cost, as for the selection toolbar.
 */
function OverflowHint() {
  const chrome = useMachineChrome();
  const flow = useReactFlow();
  const store = useStoreApi();
  const dom = useStore((state) => state.domNode);
  const transform = useStore((state) => state.transform);
  const width = useStore((state) => state.width);
  const height = useStore((state) => state.height);
  const mv = useCanvas();
  const sheetOpen = chrome.compact && chrome.panelOpen;
  const [hint, setHint] = React.useState<{
    sides: string;
    spots: Partial<Record<OverflowSide, { x: number; y: number; s: number }>>;
  }>({ sides: "", spots: {} });
  React.useLayoutEffect(() => {
    const none = () => setHint((current) => (current.sides ? { sides: "", spots: {} } : current));
    if (sheetOpen || !dom || !width) return none();
    const [tx, ty, k] = transform;
    const lookup = store.getState().nodeLookup;
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const n of lookup.values()) {
      if (n.parentId || n.hidden) continue;
      const p = n.internals.positionAbsolute;
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x + (n.measured.width ?? 0));
      y1 = Math.max(y1, p.y + (n.measured.height ?? 0));
    }
    const sides = overflowSides(
      { x0: tx + x0 * k, y0: ty + y0 * k, x1: tx + x1 * k, y1: ty + y1 * k },
      clearBand(dom, 0, 0),
    );
    if (!sides) return none();
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    const S = coarse ? 44 : 28;
    const band = clearBand(dom, 0, 8);
    const base = dom.getBoundingClientRect();
    const boxes: { box: Rect; weight: number }[] = [];
    for (const n of lookup.values()) {
      if (n.hidden) continue;
      const p = n.internals.positionAbsolute;
      const w = n.measured.width ?? 0,
        h = n.measured.height ?? 0;
      // A container only "owns" its header; its body is open canvas the button may sit on.
      const isGroup = n.type === "group";
      boxes.push({
        box: {
          x0: tx + p.x * k,
          y0: ty + p.y * k,
          x1: tx + (p.x + w) * k,
          y1: ty + (p.y + (isGroup ? Math.min(h, HEADER) : h)) * k,
        },
        weight: 1,
      });
    }
    const local = (r: DOMRect): Rect => ({
      x0: r.left - base.left,
      y0: r.top - base.top,
      x1: r.right - base.left,
      y1: r.bottom - base.top,
    });
    for (const chip of dom.querySelectorAll("[data-mv-chip]"))
      boxes.push({ box: local(chip.getBoundingClientRect()), weight: 2 });
    for (const path of dom.querySelectorAll<SVGPathElement>(
      ".react-flow__edge path.react-flow__edge-path",
    )) {
      const length = path.getTotalLength?.() ?? 0;
      for (let d = 0; d <= length; d += 10) {
        const q = path.getPointAtLength(d);
        boxes.push({
          box: {
            x0: tx + q.x * k - 3,
            y0: ty + q.y * k - 3,
            x1: tx + q.x * k + 3,
            y1: ty + q.y * k + 3,
          },
          weight: 6,
        });
      }
    }
    const cost = (x: number, y: number) => {
      const r = { x0: x, y0: y, x1: x + S, y1: y + S };
      return boxes.reduce(
        (sum, o) =>
          sum +
          Math.max(0, Math.min(r.x1, o.box.x1) - Math.max(r.x0, o.box.x0)) *
            Math.max(0, Math.min(r.y1, o.box.y1) - Math.max(r.y0, o.box.y0)) *
            o.weight,
        0,
      );
    };
    /** Spots along an edge, middle first (ties keep the middle). */
    const along = (from: number, to: number) => {
      const span = to - from - S;
      if (span <= 0) return [from];
      const steps = Math.max(2, Math.round(span / 24));
      const all = Array.from({ length: steps + 1 }, (_, i) => from + (span * i) / steps);
      return all.sort((a, b) => Math.abs(a - (from + span / 2)) - Math.abs(b - (from + span / 2)));
    };
    const spots: Partial<Record<OverflowSide, { x: number; y: number; s: number }>> = {};
    for (const side of sides.split("") as OverflowSide[]) {
      const candidates =
        side === "l" || side === "r"
          ? along(band.y0, band.y1).map((y) => ({ x: side === "l" ? band.x0 : band.x1 - S, y }))
          : along(band.x0, band.x1).map((x) => ({ x, y: side === "t" ? band.y0 : band.y1 - S }));
      let best = candidates[0]!,
        bestCost = Infinity;
      for (const c of candidates) {
        const value = cost(c.x, c.y);
        if (value < bestCost - 0.5) {
          best = c;
          bestCost = value;
        }
      }
      spots[side] = { x: Math.round(best.x), y: Math.round(best.y), s: S };
    }
    const next = { sides, spots };
    setHint((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
  }, [
    sheetOpen,
    dom,
    transform,
    width,
    height,
    store,
    mv.layout,
    mv.mode,
    chrome.compact,
    chrome.snap,
  ]);
  const { sides, spots } = hint;
  const hidden = !sides || sheetOpen;
  if (hidden) return null;
  const edge = "pointer-events-none absolute z-[5] from-canvas to-transparent";
  const button = (side: OverflowSide, icon: string) => {
    const spot = spots[side];
    if (!spot) return null;
    return (
      <button
        key={side}
        type="button"
        data-mv-overflow={side}
        aria-label={OVERFLOW_LABEL[side]}
        onClick={() => dom && panToward(flow, dom, side, 0)}
        style={{ left: spot.x, top: spot.y, width: spot.s, height: spot.s }}
        className="nodrag nopan pointer-events-auto absolute z-[6] grid place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="grid size-6 place-items-center rounded-full border bg-surface/95 text-muted-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)] transition-colors hover:text-foreground">
          <ChevronRight className={cn("size-3.5", icon)} />
        </span>
      </button>
    );
  };
  // Physical sides: `l` is the screen's left in either direction (the button pans that way).
  return (
    <div className="mv-overflow" dir="ltr">
      {sides.includes("l") && (
        <div className={cn(edge, "inset-y-0 left-0 w-11 bg-gradient-to-r")} />
      )}
      {sides.includes("r") && (
        <div className={cn(edge, "inset-y-0 right-0 w-11 bg-gradient-to-l")} />
      )}
      {sides.includes("b") && (
        <div className={cn(edge, "inset-x-0 bottom-0 h-11 bg-gradient-to-t")} />
      )}
      {sides.includes("t") && <div className={cn(edge, "inset-x-0 top-0 h-11 bg-gradient-to-b")} />}
      {sides.includes("l") && button("l", "rotate-180")}
      {sides.includes("r") && button("r", "")}
      {sides.includes("b") && button("b", "rotate-90")}
      {sides.includes("t") && button("t", "-rotate-90")}
    </div>
  );
}

function ZoomControls({ onFit }: { readonly onFit: () => void }) {
  const flow = useReactFlow();
  const chrome = useMachineChrome();
  const zoom = useStore((state) => state.transform[2]);
  const percent = zoom < 0.01 ? Math.round(zoom * 1000) / 10 : Math.round(zoom * 100);
  // Phones pinch to zoom: only Fit stays, in the corner the palette leaves free.
  if (chrome.compact)
    return (
      <div
        data-mv-occluder
        className="absolute end-3 top-3 z-10 rounded-lg border bg-surface p-0.5"
      >
        <ToolButton label="Fit to view" side="bottom" onClick={onFit} className="coarse:size-11">
          <Maximize />
        </ToolButton>
      </div>
    );
  return (
    <div
      data-mv-occluder
      className="absolute start-3 bottom-3 z-10 flex items-center gap-0.5 rounded-lg border bg-surface p-0.5"
    >
      <ToolButton
        label="Zoom out"
        className="coarse:size-11"
        onClick={() => flow.zoomOut({ duration: viewportDuration(160) })}
      >
        <Minus />
      </ToolButton>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`Zoom ${percent}%. Reset to 100%`}
            onClick={() => flow.zoomTo(1, { duration: viewportDuration(200) })}
            className="h-7 w-11 rounded-md font-mono text-[11px] text-muted-foreground tabular-nums transition-colors hover:bg-muted hover:text-foreground coarse:h-11"
          >
            {percent}%
          </button>
        </TooltipTrigger>
        <TooltipContent>Reset to 100%</TooltipContent>
      </Tooltip>
      <ToolButton
        label="Zoom in"
        className="coarse:size-11"
        onClick={() => flow.zoomIn({ duration: viewportDuration(160) })}
      >
        <Plus />
      </ToolButton>
      <ToolButton label="Fit to view" kbd="F" className="coarse:size-11" onClick={onFit}>
        <Maximize />
      </ToolButton>
    </div>
  );
}

/**
 * The add palette. Phones with the inspector sheet open fold it into one "+" button at the
 * start, so the row of seven 44px tools does not eat the sliver of canvas above the sheet (the
 * reveal keeps the selection in that sliver); a tap unfolds it.
 */
function DesignPalette() {
  const mv = useCanvas();
  const chrome = useMachineChrome();
  const [unfolded, setUnfolded] = React.useState(false);
  React.useEffect(() => setUnfolded(false), [chrome.panelOpen, chrome.snap]);
  const folded = chrome.compact && chrome.panelOpen && !unfolded;
  const host =
    mv.selection?.type === "node"
      ? mv.graph.nodes.find((n) => n.id === mv.selection!.id)
      : undefined;
  const parent = host && (host.kind === "compound" || host.kind === "parallel") ? host : undefined;
  const add = (kind: MachineNode["kind"], label: string) => {
    const latest = mv.latestGraph();
    const id = mv.freshId(kind);
    const where = parent ? { parentId: parent.id } : {};
    const commands: MachineCommand[] = [];
    if (kind === "submachine") {
      const child = mv.freshId("machine");
      commands.push({
        type: "add-machine",
        machine: {
          id: child,
          label: "New machine",
          initialId: `${child}-start`,
          nodes: [{ id: `${child}-start`, label: "Start", kind: "atomic" }],
          transitions: [],
        },
      });
      commands.push({
        type: "add-node",
        machineId: mv.machineId,
        node: { id, label, kind, machineId: child, ...where },
      });
    } else if (kind === "note") {
      const attach =
        host && host.kind !== "note" && host.kind !== "initial" ? { attachedToId: host.id } : {};
      commands.push({
        type: "add-node",
        machineId: mv.machineId,
        node: { id, label, kind, ...attach },
      });
    } else {
      commands.push({
        type: "add-node",
        machineId: mv.machineId,
        node: { id, label, kind, ...where },
      });
      // The first state in an empty compound becomes its initial child.
      const owner = parent && latest.nodes.find((n) => n.id === parent.id);
      if (
        owner?.kind === "compound" &&
        !owner.initialId &&
        kind !== "initial" &&
        !latest.nodes.some((n) => n.parentId === owner.id)
      )
        commands.push({
          type: "update-node",
          machineId: mv.machineId,
          id: owner.id,
          patch: { initialId: id },
        });
    }
    setUnfolded(false);
    mv.run(commands, {
      label: `add ${KIND_LABEL[kind]} ${label}`,
      onAccept: () => {
        mv.setSelection({ type: "node", id });
        if (kind !== "initial") mv.setRenaming(id);
        mv.announce(`Added ${KIND_LABEL[kind]} ${label}${parent ? ` inside ${parent.label}` : ""}`);
      },
    });
  };
  const items = [
    ["atomic", "State", Square],
    ["compound", "Compound", SquareDashed],
    ["parallel", "Parallel", Columns2],
    ["final", "Final", Target],
    ["initial", "Initial", CircleDot],
    ["submachine", "Submachine", SquareStack],
    ["note", "Note", StickyNote],
  ] as const;
  if (folded)
    return (
      <motion.div
        key="folded"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={motionTokens.quick}
        data-mv-occluder
        className="absolute start-3 top-3 z-10 rounded-lg border bg-surface p-0.5"
      >
        <ToolButton
          label="Add to machine"
          side="bottom"
          aria-expanded={false}
          onClick={() => setUnfolded(true)}
          className="coarse:size-11"
        >
          <Plus />
        </ToolButton>
      </motion.div>
    );
  return (
    <motion.div
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -6 }}
      transition={motionTokens.base}
      data-mv-occluder
      // Phones: one row of 44px targets, scrolling sideways if the width runs out before the Fit button.
      className={cn(
        "absolute start-3 top-3 z-10 flex rounded-lg border bg-surface p-0.5",
        chrome.compact
          ? "max-w-[calc(100%-5rem)] flex-row gap-0 overflow-x-auto [scrollbar-width:none]"
          : "flex-col gap-0.5",
      )}
      role="toolbar"
      aria-label="Add to machine"
      aria-orientation={chrome.compact ? "horizontal" : "vertical"}
    >
      {items.map(([kind, label, Icon]) => (
        <Tooltip key={kind}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 coarse:size-11"
              aria-label={`Add ${label.toLowerCase()}${parent && kind !== "note" && kind !== "submachine" ? ` inside ${parent.label}` : ""}`}
              onClick={() =>
                add(
                  kind,
                  kind === "note"
                    ? "Note"
                    : kind === "initial"
                      ? "Start"
                      : `New ${label.toLowerCase()}`,
                )
              }
            >
              <Icon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={chrome.compact ? "bottom" : "right"}>
            Add {label.toLowerCase()}
            {parent && kind !== "note" ? (
              <span className="text-muted-foreground"> inside {parent.label}</span>
            ) : null}
          </TooltipContent>
        </Tooltip>
      ))}
    </motion.div>
  );
}

/* ───────────────────────────── Selection toolbar ───────────────────────────── */

/** Flow-space point every this many px along each drawn edge is an obstacle for the toolbar. */
const EDGE_SAMPLE = 8;

/**
 * Quick actions for the selected state (design mode, desktop): add a connected state, rename,
 * delete. One canvas-level overlay, placed by `placeToolbar` (machine-viewport.ts) so it never
 * covers states, chips, arrowheads or edge lines; when no free slot is in view it pans the
 * camera to one. Phones dock these actions into the peek bar instead (machine-phone.tsx).
 */
function SelectionToolbar() {
  const mv = useCanvas();
  const chrome = useMachineChrome();
  const flow = useReactFlow();
  const store = useStoreApi();
  const transform = useStore((s) => s.transform);
  const width = useStore((s) => s.width);
  const height = useStore((s) => s.height);
  const dom = useStore((s) => s.domNode);
  const id = mv.selection?.type === "node" ? mv.selection.id : "";
  const internal = useInternalNode(id);
  const node = id ? mv.graph.nodes.find((n) => n.id === id) : undefined;
  const visible =
    !chrome.compact &&
    !!node &&
    !!internal &&
    !internal.dragging &&
    node.kind !== "initial" &&
    mv.mode === "design" &&
    mv.editable &&
    mv.renaming !== id;
  const ref = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<{
    x: number;
    y: number;
    side: "top" | "bottom" | "left" | "right";
  } | null>(null);
  /** One camera nudge per selection: a pan that lands is never followed by another. */
  const panned = React.useRef("");
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!visible || !el || !dom || !internal || !node) return setPlace(null);
    const [tx, ty, k] = transform;
    const base = dom.getBoundingClientRect();
    const screen = (x0: number, y0: number, x1: number, y1: number): Rect => ({
      x0: tx + x0 * k,
      y0: ty + y0 * k,
      x1: tx + x1 * k,
      y1: ty + y1 * k,
    });
    const p = internal.internals.positionAbsolute;
    const R = screen(
      p.x,
      p.y,
      p.x + (internal.measured.width ?? 0),
      p.y + (internal.measured.height ?? 0),
    );
    const ancestors = new Set<string>();
    for (let a = node.parentId; a; a = mv.graph.nodes.find((n) => n.id === a)?.parentId)
      ancestors.add(a);
    const obstacles: { box: Rect; weight: number }[] = [];
    for (const other of store.getState().nodeLookup.values()) {
      if (other.id === id || other.hidden) continue;
      const o = other.internals.positionAbsolute;
      const b = screen(
        o.x,
        o.y,
        o.x + (other.measured.width ?? 0),
        o.y + (other.measured.height ?? 0),
      );
      if (b.x0 >= R.x0 && b.y0 >= R.y0 && b.x1 <= R.x1 && b.y1 <= R.y1) continue; // own descendants
      obstacles.push({
        box: ancestors.has(other.id) ? { ...b, y1: Math.min(b.y1, b.y0 + HEADER * k) } : b,
        weight: 1,
      });
    }
    // Incoming arrowheads: the end of each stored route into this state, plus the entry side's middle.
    const heads = (mv.layout?.edges ?? [])
      .filter((e) => e.targetId === id && e.points.length > 1)
      .map((e) => e.points.at(-1)!);
    heads.push(
      mv.direction === "LR"
        ? { x: p.x, y: p.y + Math.min(HEADER, internal.measured.height ?? 0) / 2 }
        : { x: p.x + (internal.measured.width ?? 0) / 2, y: p.y },
    );
    for (const h of heads)
      obstacles.push({
        box: screen(h.x - 10 / k, h.y - 12 / k, h.x + 10 / k, h.y + 12 / k),
        weight: 3,
      });
    const local = (r: DOMRect): Rect => ({
      x0: r.left - base.left,
      y0: r.top - base.top,
      x1: r.right - base.left,
      y1: r.bottom - base.top,
    });
    for (const chip of dom.querySelectorAll("[data-mv-chip]"))
      obstacles.push({ box: local(chip.getBoundingClientRect()), weight: 1.5 });
    for (const hint of dom.querySelectorAll("[data-mv-overflow]"))
      obstacles.push({ box: local(hint.getBoundingClientRect()), weight: 4 });
    // Every drawn line (routes, live paths, note connectors), sampled in flow space.
    for (const path of dom.querySelectorAll<SVGPathElement>(
      ".react-flow__edge path.react-flow__edge-path, .react-flow__edge path[fill=none]:not([stroke=transparent])",
    )) {
      const length = path.getTotalLength?.() ?? 0;
      for (let d = 0; d <= length; d += EDGE_SAMPLE) {
        const q = path.getPointAtLength(d);
        obstacles.push({
          box: screen(q.x - 2 / k, q.y - 2 / k, q.x + 2 / k, q.y + 2 / k),
          weight: 2 * 4,
        });
      }
    }
    const band = clearBand(dom, 0, 6);
    const next = placeToolbar({
      node: R,
      head: Math.min(HEADER * k, R.y1 - R.y0),
      size: { w: el.offsetWidth, h: el.offsetHeight },
      band,
      canvas: { w: dom.clientWidth, h: dom.clientHeight },
      direction: mv.direction,
      obstacles,
    });
    if (next && (next.pan.dx || next.pan.dy) && panned.current !== id) {
      // No free slot in view, so nudge the camera instead of covering content.
      panned.current = id;
      const v = flow.getViewport();
      flow.setViewport(
        { x: v.x + next.pan.dx, y: v.y + next.pan.dy, zoom: v.zoom },
        { duration: viewportDuration(200) },
      );
    }
    const at = next && { x: next.x, y: next.y, side: next.side };
    setPlace((current) =>
      at &&
      current &&
      Math.abs(current.x - at.x) < 0.5 &&
      Math.abs(current.y - at.y) < 0.5 &&
      current.side === at.side
        ? current
        : at,
    );
  }, [
    visible,
    dom,
    internal,
    node,
    transform,
    width,
    height,
    mv.layout,
    mv.direction,
    mv.graph,
    id,
    store,
    flow,
  ]);
  React.useEffect(() => {
    if (!id) panned.current = "";
  }, [id]);
  if (!visible || !node) return null;
  const canConnect = node.kind !== "final" && node.kind !== "note";
  const side = place?.side ?? "top";
  return (
    <motion.div
      key={id}
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: place ? 1 : 0 }}
      transition={motionTokens.quick}
      role="toolbar"
      aria-label={`${node.label} actions`}
      style={{
        transform: place ? `translate(${place.x}px, ${place.y}px)` : undefined,
        visibility: place ? undefined : "hidden",
      }}
      className="nodrag nopan absolute start-0 top-0 z-20 flex items-center gap-0.5 rounded-lg border bg-surface p-0.5 shadow-[0_4px_16px_-8px_rgb(0_0_0/0.3)] rtl:start-auto rtl:left-0"
    >
      {canConnect && (
        <ToolButton
          label="Add connected state"
          kbd="A"
          side={side}
          onClick={() => mv.addConnected(id)}
          className="size-7"
        >
          <Plus />
        </ToolButton>
      )}
      <ToolButton
        label={node.kind === "note" ? "Edit text" : "Rename"}
        kbd="F2"
        side={side}
        onClick={() => mv.setRenaming(id)}
        className="size-7"
      >
        <Pencil />
      </ToolButton>
      <ToolButton
        label={`Delete ${node.kind === "note" ? "note" : "state"}`}
        kbd={KEY.delete}
        side={side}
        onClick={mv.deleteSelection}
        className="size-7 hover:text-destructive"
      >
        <Trash2 />
      </ToolButton>
    </motion.div>
  );
}

/* ───────────────────────────── Choreography ───────────────────────────── */

/**
 * The one place that moves the viewport on its own. After every simulation step, sheet
 * open/snap and selection change it runs `revealInBand` with a priority list, so the live
 * frontier (active leaves, enabled event chips, where they lead) lands in the clear band.
 */
function Choreographer() {
  const mv = useCanvas();
  const chrome = useMachineChrome();
  const flow = useReactFlow();
  const dom = useStore((s) => s.domNode);
  const mvRef = React.useRef(mv);
  mvRef.current = mv;
  const sheetInset = chrome.compact && chrome.panelOpen ? chrome.sheetInset : 0;
  const insetRef = React.useRef(sheetInset);
  insetRef.current = sheetInset;
  const minZoom = chrome.compact ? PHONE_MIN_ZOOM : 0.5;

  const frontier = React.useCallback(() => {
    const m = mvRef.current;
    if (!dom) return [];
    const leaves = [...m.leafIds];
    const enabled = [...m.candidates.enabled];
    const taken = [...m.takenIds];
    const targets = enabled
      .map((tid) => m.graph.transitions.find((t) => t.id === tid)?.targetId)
      .filter((x): x is string => !!x);
    const rects = (nodes: string[], chips: string[]) => targetRects(dom, { nodes, chips });
    return [
      rects([...leaves, ...targets], [...enabled, ...taken]),
      rects(leaves, enabled.length ? enabled : taken),
      rects(targets, enabled),
      rects([], enabled.length ? enabled : taken),
      rects(leaves.slice(0, 1), []),
    ];
  }, [dom]);

  /** Runs `fn` once the DOM reflects the latest commit (two frames), cancelling the previous request. */
  const pending = React.useRef(0);
  const schedule = React.useCallback((fn: () => void, delay = 0) => {
    cancelAnimationFrame(pending.current);
    const go = () =>
      (pending.current = requestAnimationFrame(
        () => (pending.current = requestAnimationFrame(fn)),
      ));
    if (delay) window.setTimeout(go, delay);
    else go();
  }, []);
  React.useEffect(() => () => cancelAnimationFrame(pending.current), []);

  // 1. Every simulation step (and replay scrub): follow the frontier.
  const frameKey = mv.snapshot
    ? `${mv.machineId}:${mv.snapshot.trace.length}:${mv.cursor}:${mv.candidates.enabled.size}`
    : "";
  React.useEffect(() => {
    if (!frameKey || !dom) return;
    schedule(
      () => revealInBand(flow, dom, frontier(), { minZoom, sheetInset: insetRef.current }),
      40,
    );
  }, [frameKey, dom, flow, frontier, minZoom, schedule]);

  // 2. Phone sheet opens or changes snap: keep what it is about above it.
  React.useEffect(() => {
    if (!chrome.compact || !chrome.panelOpen || !dom) return;
    schedule(() => {
      const m = mvRef.current;
      const sel = m.selection;
      const t =
        sel?.type === "transition" ? m.graph.transitions.find((x) => x.id === sel.id) : undefined;
      // What the sheet is about stays above it: the state, or the transition (its chip, then both ends).
      const groups =
        sel?.type === "node"
          ? [targetRects(dom, { nodes: [sel.id] })]
          : t
            ? [
                targetRects(dom, { nodes: [t.sourceId, t.targetId], chips: [t.id] }),
                targetRects(dom, { chips: [t.id] }),
              ]
            : m.snapshot
              ? frontier()
              : [];
      revealInBand(flow, dom, groups, { minZoom, sheetInset: insetRef.current });
    }, 40);
  }, [chrome.compact, chrome.panelOpen, sheetInset, dom, flow, frontier, minZoom, schedule]);

  // 3. A state selected from elsewhere (inspector list, issues, keyboard) that is out of view.
  const selected = mv.selection?.type === "node" ? mv.selection.id : null;
  const lastReveal = React.useRef(mv.revealRequest);
  React.useEffect(() => {
    const explicit = mv.revealRequest !== lastReveal.current;
    lastReveal.current = mv.revealRequest;
    // Explicit navigation already owns a readable zoom. Do not interrupt it with a
    // pan calculated from an intermediate animation frame.
    if (explicit) return;
    if (!selected || !dom) return;
    schedule(() => {
      if (dom.querySelector(".react-flow__node.dragging")) return;
      revealInBand(flow, dom, [targetRects(dom, { nodes: [selected] })], {
        when: "hidden",
        minZoom: null,
        sheetInset: insetRef.current,
      });
    }, 60);
  }, [selected, mv.revealRequest, dom, flow, schedule]);
  return null;
}
