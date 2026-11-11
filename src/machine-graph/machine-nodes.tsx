import * as React from "react";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import {
  CircleDot,
  Columns2,
  ExternalLink,
  SquareDashed,
  SquareStack,
  StickyNote,
} from "lucide-react";
import type { MachineGraph, MachineNode } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { simStateOf, type SimState } from "../machine-shared/machine-sim.js";
import { focusNextFrame } from "../machine-shared/machine-focus.js";
import { HEADER, type MachineGraphLayout } from "./layout.js";
import { KIND_LABEL, kindTag, useMachine, useDiagram } from "./machine-context.js";

/* ───────────────────────────── Flow node model ───────────────────────────── */

export type StateData = {
  readonly node: MachineNode;
  readonly container: boolean;
  readonly parallelRegion: boolean;
};
export type FlowNode =
  | Node<StateData, "state" | "group" | "note" | "pseudo">
  | Node<{ readonly owner: string | null }, "initial">;

/** Live drag state: which ids are moving (their stored routes are stale) and the drop target. */
export const DragContext = React.createContext<{
  readonly moving: ReadonlySet<string>;
  readonly dropTarget: string | null;
}>({ moving: new Set(), dropTarget: null });

/**
 * Where the machine starts, as a reader sees it: the initial state, or the state an explicit
 * initial pseudo-state points at (the pseudo-state itself is a dot, not a stop for focus).
 */
export function startsHere(graph: MachineGraph, node: MachineNode) {
  if (node.kind === "initial" || node.kind === "note") return false;
  const initial = graph.nodes.find((n) => n.id === graph.initialId);
  if (initial?.kind !== "initial") return node.id === graph.initialId;
  return graph.transitions.some(
    (t) => t.sourceId === initial.id && !t.event && t.targetId === node.id,
  );
}

export function nodeAriaLabel(graph: MachineGraph, node: MachineNode) {
  const out = graph.transitions.filter((t) => t.sourceId === node.id).length;
  const kind =
    node.kind === "atomic"
      ? "state"
      : node.kind === "note"
        ? "note"
        : `${kindTag(graph, node)} state`;
  const parent = node.parentId ? graph.nodes.find((n) => n.id === node.parentId)?.label : undefined;
  return [
    `${node.label}, ${kind}`,
    node.kind !== "note" ? `${out} outgoing` : "",
    parent ? `in ${parent}` : "",
    startsHere(graph, node) ? "starts here" : "",
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * Which key-help text a node is described by. The texts themselves depend on mode and
 * editability (see `NodeDescriptions` in the canvas); the kind decides which keys apply.
 */
export type NodeHelp = "state" | "final" | "note" | "submachine";
export const nodeHelpOf = (node: MachineNode): NodeHelp =>
  node.kind === "note"
    ? "note"
    : node.kind === "final"
      ? "final"
      : node.kind === "submachine"
        ? "submachine"
        : "state";

export function buildNodes(
  layout: MachineGraphLayout,
  graph: MachineGraph,
  draggable: boolean,
  selectedId: string | null,
  previous: readonly FlowNode[],
  describedBy: (help: NodeHelp) => string,
): FlowNode[] {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const prev = new Map(previous.map((n) => [n.id, n]));
  const next: FlowNode[] = [];
  for (const laid of layout.nodes.values()) {
    const parent = laid.parentId ? layout.nodes.get(laid.parentId) : undefined;
    const position = { x: laid.x - (parent?.x ?? 0), y: laid.y - (parent?.y ?? 0) };
    const old = prev.get(laid.id);
    const common = {
      id: laid.id,
      position,
      width: laid.width,
      ...(parent ? { parentId: parent.id } : {}),
      // Keep React Flow's measurement across rebuilds so handles and edges stay attached.
      ...(old?.measured ? { measured: old.measured } : {}),
    };
    if (laid.initialOf !== undefined) {
      next.push({
        ...common,
        height: laid.height,
        type: "initial",
        data: { owner: laid.initialOf },
        selectable: false,
        draggable: false,
        focusable: false,
        domAttributes: { "aria-hidden": true },
      });
      continue;
    }
    const node = byId.get(laid.id);
    if (!node) continue;
    const container = graph.nodes.some(
      (child) => child.parentId === node.id && child.kind !== "note",
    );
    const parentNode = node.parentId ? byId.get(node.parentId) : undefined;
    const type =
      node.kind === "initial"
        ? "pseudo"
        : node.kind === "note"
          ? "note"
          : container
            ? "group"
            : "state";
    next.push({
      ...common,
      // Containers and the initial dot have fixed boxes; content nodes grow to their content
      // and report the measured height back to layout.
      ...(container || node.kind === "initial" ? { height: laid.height } : {}),
      type,
      data: { node, container, parallelRegion: parentNode?.kind === "parallel" },
      selected: node.id === selectedId,
      draggable,
      ariaLabel: nodeAriaLabel(graph, node),
      // A pseudo-state is a dot: its meaning ("starts here") lives in its target's label.
      ...(node.kind === "initial"
        ? { focusable: false, domAttributes: { "aria-hidden": true } }
        : { domAttributes: { "aria-describedby": describedBy(nodeHelpOf(node)) } }),
      ...(container ? { style: { zIndex: 0 } } : {}),
    } as FlowNode);
  }
  return next;
}

/* ───────────────────────────── Node renderers ───────────────────────────── */

function handles(direction: "LR" | "TB") {
  const [target, source] =
    direction === "LR" ? [Position.Left, Position.Right] : [Position.Top, Position.Bottom];
  return (
    <>
      <Handle type="target" position={target} className="machine-handle" />
      <Handle type="source" position={source} className="machine-handle" />
      {/* Annotation anchor: notes sit to the right of the state they describe. */}
      <Handle
        id="note"
        type="target"
        position={Position.Right}
        isConnectable={false}
        className="!pointer-events-none !opacity-0"
      />
    </>
  );
}

/** Simulation emphasis for a node: see machine-shared/machine-sim.css (shared with Machine Tree). */
export type { SimState };
function useNodeState(id: string) {
  const mv = useDiagram();
  const active = mv.activeSet.has(id);
  const leaf = mv.leafIds.has(id);
  const simulating = mv.simulating;
  const sim: SimState = simStateOf({ leaf, ancestor: active && !leaf, simulating });
  return { mv, active, leaf, simulating, sim };
}

/** Inline rename: Enter commits (one undo step), Esc cancels, blur commits. */
function InlineName({
  node,
  className,
}: {
  readonly node: MachineNode;
  readonly className?: string;
}) {
  const mv = useMachine();
  const [draft, setDraft] = React.useState(node.label);
  const done = React.useRef(false);
  const ref = React.useRef<HTMLInputElement>(null);
  // A freshly added node is hidden until React Flow measures it; keep trying for a few frames.
  React.useEffect(() => {
    let tries = 0;
    let frame = 0;
    const attempt = () => {
      const el = ref.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      if (window.document.activeElement === el) el.select();
      else if (tries++ < 20) frame = requestAnimationFrame(attempt);
    };
    frame = requestAnimationFrame(attempt);
    return () => cancelAnimationFrame(frame);
  }, []);
  /** Keyboard exits (Enter, Esc) hand focus back to the node; a blur leaves it where the user put it. */
  const returnFocus = () => {
    focusNextFrame(ref.current?.closest<HTMLElement>(".react-flow__node"));
  };
  const commit = (viaKeyboard = false) => {
    if (done.current) return;
    done.current = true;
    const label = draft.trim();
    if (viaKeyboard) returnFocus();
    if (label && label !== node.label)
      mv.run(
        { type: "update-node", machineId: mv.machineId, id: node.id, patch: { label } },
        {
          label: `rename ${node.label} to ${label}`,
          onAccept: () => mv.announce(`Renamed to ${label}`),
        },
      );
    mv.setRenaming(null);
  };
  return (
    <input
      ref={ref}
      name="state-name"
      aria-label={`Rename ${node.label}`}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") commit(true);
        else if (event.key === "Escape") {
          done.current = true;
          returnFocus();
          mv.setRenaming(null);
        }
      }}
      className={cn(
        "nodrag nopan min-w-0 flex-1 rounded-[4px] bg-muted/30 px-1 -mx-1 outline-none ring-1 ring-foreground/10 focus-visible:ring-foreground/50",
        className,
      )}
    />
  );
}

export function StateNode({ id, data, selected }: NodeProps<Node<StateData, "state">>) {
  const { mv, leaf, sim } = useNodeState(id);
  const node = data.node;
  // "Not here" inside a container that IS live: the card recedes into its (signal-tinted) region
  // instead of standing out as the brightest thing in it (machine-graph.css, `data-sim-recessed`).
  const recessed = sim === "inactive" && !!node.parentId && mv.activeSet.has(node.parentId);
  const final = node.kind === "final";
  const sub = node.kind === "submachine";
  const renaming = mv.renaming === id;
  const actions = [
    ...(node.entry ?? []).map((a) => ["entry", a] as const),
    ...(node.exit ?? []).map((a) => ["exit", a] as const),
  ];
  return (
    <div
      data-sim={sim}
      data-preview={
        mv.preview?.entered.includes(id)
          ? "enter"
          : mv.preview?.exited.includes(id)
            ? "exit"
            : undefined
      }
      data-sim-recessed={recessed || undefined}
      className={cn(
        // Simulation dims by colour tokens (≥ 4.5:1), never by opacity.
        "group/state relative w-full rounded-[10px] border border-[color:var(--sim-border,var(--mv-node-border))] bg-[var(--sim-surface,var(--card))] text-card-foreground transition-[border-color,box-shadow,background-color] duration-200",
        final && "outline-1 outline-offset-[3px] outline-border",
        leaf && "shadow-[0_0_0_2px_color-mix(in_oklab,var(--signal)_8%,transparent)]",
        leaf && final && "outline-signal/60",
        selected &&
          !leaf &&
          "border-foreground/60 shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_8%,transparent)]",
        selected && leaf && "shadow-[0_0_0_2px_color-mix(in_oklab,var(--signal)_14%,transparent)]",
        !leaf && !selected && "hover:border-foreground/25",
      )}
    >
      {handles(mv.direction)}
      <div className="flex items-center gap-2 px-3" style={{ height: HEADER }}>
        {final ? (
          <CircleDot
            className={cn(
              "size-3.5 shrink-0",
              leaf ? "text-signal" : "text-[color:var(--sim-icon,var(--muted-foreground))]",
            )}
          />
        ) : sub ? (
          <SquareStack className="size-3.5 shrink-0 text-[color:var(--sim-icon,var(--muted-foreground))]" />
        ) : (
          <span
            className={cn(
              "relative size-2 shrink-0 rounded-full transition-colors",
              leaf
                ? "bg-signal"
                : "bg-[var(--sim-icon,color-mix(in_oklab,var(--foreground)_25%,transparent))]",
            )}
          >
            {leaf && (
              <span
                key={mv.pingSequence}
                className="absolute inset-0 animate-ping rounded-full bg-signal/60 [animation-iteration-count:2] motion-reduce:hidden"
              />
            )}
          </span>
        )}
        {renaming ? (
          <InlineName node={node} className="h-6 text-[13px] font-semibold" />
        ) : (
          <span
            className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.005em] text-[color:var(--sim-name,var(--card-foreground))]"
            title={node.label}
          >
            {node.label}
          </span>
        )}
        {sub && node.machineId ? (
          // The submachine's kind tag is its Open control: inside the header, never straddling the border.
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              mv.openMachine(node.machineId!);
            }}
            aria-label={`Open ${mv.machines.find((m) => m.id === node.machineId)?.label ?? "submachine"}`}
            title="Open submachine"
            className="nodrag relative -me-1.5 flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 font-mono text-[9.5px] leading-5 tracking-wider text-[color:var(--sim-tag,var(--muted-foreground))] uppercase transition-colors after:absolute after:-inset-1.5 hover:bg-muted hover:text-foreground coarse:after:-inset-3"
          >
            open <ExternalLink className="size-2.5" />
          </button>
        ) : (
          <span className="shrink-0 font-mono text-[9.5px] tracking-wider text-[color:var(--sim-tag,var(--muted-foreground))] uppercase">
            {mv.presentation?.nodes?.[id]?.kindLabel ?? KIND_LABEL[node.kind]}
          </span>
        )}
      </div>
      {!!mv.presentation?.nodes?.[id]?.activities?.length && (
        <ul className="flex flex-col gap-1 border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
          {mv.presentation.nodes[id]!.activities!.slice(0, 4).map((a) => (
            <li key={a.id} title={a.description}>
              {a.label}
            </li>
          ))}
          {mv.presentation.nodes[id]!.activities!.length > 4 && <li>More activities in details</li>}
        </ul>
      )}
      {(node.description || actions.length > 0 || node.tags?.length) && (
        <div className="space-y-1.5 border-t border-hairline px-3 pt-1.5 pb-2">
          {node.description && (
            <p className="line-clamp-3 text-[11.5px] leading-4 break-words text-[color:var(--sim-text,var(--muted-foreground))]">
              {node.description}
            </p>
          )}
          {actions.length > 0 && (
            <ul className="space-y-0.5">
              {actions.map(([phase, action]) => (
                <li
                  key={phase + action}
                  className="flex h-4 items-center gap-1.5 font-mono text-[10.5px]"
                >
                  <span className="text-[color:var(--sim-tag,var(--muted-foreground))]">
                    {phase}
                  </span>
                  <span className="truncate text-[color:var(--sim-text,color-mix(in_oklab,var(--foreground)_85%,transparent))]">
                    {action}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {node.tags?.length ? (
            <div className="flex flex-wrap gap-1">
              {node.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-[4px] border border-hairline bg-muted/60 px-1.5 font-mono text-[10px] leading-4 text-[color:var(--sim-tag,var(--muted-foreground))]"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function GroupNode({ id, data, selected }: NodeProps<Node<StateData, "group">>) {
  const { mv, sim } = useNodeState(id);
  const { dropTarget } = React.useContext(DragContext);
  const node = data.node;
  const parallel = node.kind === "parallel";
  const dropping = dropTarget === id;
  const tag = kindTag(mv.graph, node);
  return (
    <div
      data-sim={sim}
      className={cn(
        "relative h-full w-full rounded-[12px] border transition-[border-color,background-color,box-shadow] duration-200",
        data.parallelRegion
          ? "border-transparent bg-[color-mix(in_oklab,var(--foreground)_2.5%,transparent)]"
          : "border-[color:var(--sim-border,var(--mv-node-border))] bg-[color-mix(in_oklab,var(--foreground)_1.5%,transparent)]",
        parallel && "bg-transparent",
        sim === "ancestor" && "border-[color:var(--sim-border)] bg-[var(--sim-surface)]",
        selected &&
          "border-foreground/55 shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_7%,transparent)]",
        dropping &&
          "border-solid border-signal bg-signal-muted shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_16%,transparent)]",
      )}
    >
      {handles(mv.direction)}
      <div
        className="flex items-center gap-2 border-b border-hairline px-3"
        style={{ height: HEADER }}
      >
        {parallel ? (
          <Columns2 className="size-3.5 shrink-0 text-[color:var(--sim-icon,var(--muted-foreground))]" />
        ) : (
          <SquareDashed className="size-3.5 shrink-0 text-[color:var(--sim-icon,var(--muted-foreground))]" />
        )}
        {mv.renaming === id ? (
          <InlineName node={node} className="h-6 text-[12.5px] font-semibold" />
        ) : (
          <span className="min-w-0 truncate text-[12.5px] font-semibold text-[color:var(--sim-name,var(--foreground))]">
            {node.label}
          </span>
        )}
        <span className="ms-auto shrink-0 font-mono text-[9.5px] tracking-wider text-[color:var(--sim-tag,var(--muted-foreground))] uppercase">
          {dropping ? "drop to move here" : tag}
        </span>
      </div>
    </div>
  );
}

export function NoteNode({ id, data, selected }: NodeProps<Node<StateData, "note">>) {
  const mv = useDiagram();
  return (
    <div
      className={cn(
        "flex w-full gap-2 rounded-lg border border-dashed border-warning/45 bg-[color-mix(in_oklab,var(--warning)_7%,var(--card))] px-2.5 py-2 text-[11.5px] leading-4 text-foreground/80",
        selected && "border-solid border-warning",
      )}
    >
      <StickyNote className="mt-px size-3.5 shrink-0 text-warning" />
      {mv.renaming === id ? (
        <InlineName node={data.node} className="text-[11.5px]" />
      ) : (
        <span className="min-w-0 break-words">{data.node.label}</span>
      )}
      <Handle
        type="source"
        position={Position.Left}
        className="machine-handle"
        isConnectable={false}
      />
    </div>
  );
}

/** The filled initial dot: synthetic markers and explicit `initial` pseudo-states alike. */
export function InitialNode({ data, selected }: NodeProps<FlowNode>) {
  const mv = useDiagram();
  const node = (data as Partial<StateData>).node;
  // While simulating, a start dot reads like the region it starts: full strength while its owner
  // is live (the machine root always is), dimmed with the same `data-sim` tokens when it is not.
  // So two regions in the same state always show the same dot.
  const owner = node ? node.parentId : (data as { owner: string | null }).owner;
  const dimmed = mv.simulating && !!owner && !mv.activeSet.has(owner);
  return (
    <div
      className="relative grid h-full w-full place-items-center"
      data-sim={dimmed ? "inactive" : undefined}
      title={node ? `${node.label} (initial)` : undefined}
    >
      <span
        className={cn(
          "size-3 rounded-full bg-[var(--sim-icon,var(--foreground))] transition-[background-color,box-shadow] duration-200",
          selected && "shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_18%,transparent)]",
        )}
      />
      {node && (
        <Handle
          type="target"
          position={mv.direction === "LR" ? Position.Left : Position.Top}
          className="!pointer-events-none !opacity-0"
          isConnectable={false}
        />
      )}
      <Handle
        type="source"
        position={mv.direction === "LR" ? Position.Right : Position.Bottom}
        className="machine-handle"
        isConnectable={!!node}
      />
    </div>
  );
}

export const nodeTypes = {
  state: StateNode,
  group: GroupNode,
  note: NoteNode,
  initial: InitialNode,
  pseudo: InitialNode,
};
