import * as React from "react";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  RotateCcw,
  type LucideIcon,
} from "lucide-react";
import type {
  MachineFlow,
  MachineFlowArrival,
  MachineFlowBranch,
  MachineFlowLanding,
  MachineFlowRoute,
  MachineFlowStep,
  MachineTreeRow,
} from "../core/index.js";
import { Button } from "../components/ui/button.js";
import { cn } from "../lib/utils.js";
import { StateCell } from "./machine-tree-canvas.js";
import { useTreeLayout } from "./machine-tree-layout.js";
import { plural } from "./machine-tree-logic.js";
import { ModelCtx, StoreCtx, useTree, useView, type TreeModelCtx } from "./machine-tree-store.js";
import { useTreeBase } from "./machine-tree-controller.js";

/**
 * The flow outline: a container's states drawn in the order the machine moves through them.
 *
 *   ┌ Review ┐                 a state, then the routes that leave it
 *   ├──────────┬──────────┐    alternatives stand side by side; each label heads its column
 *   │ APPROVE  │ REJECT   │
 *   ▼          ▼          │
 *   ┌ Publish┐ ┌ Rejected┐│
 *   └──────────┴──────────┘    columns that flow back close into the spine
 *   ▼                          a solid arrowhead: the route above leads straight here
 *   ┌ Done ┐
 *
 * Placement comes from the core (`planMachineTreeFlow`); this file only draws it. The DOM keeps the
 * tree's own shape: a state's routes stay inside its tree item and sibling states stay siblings, so
 * DOM order is keyboard order. A column's label is its source state's own route row, set over the
 * column by a shared grid (the fork's tracks, passed down with `subgrid`).
 */

/** Every row a flow places, in the order it is drawn. */
function placed(steps: readonly MachineFlowStep[], into: string[] = []): string[] {
  for (const step of steps) {
    into.push(step.rowId);
    for (const column of step.columns) placed(column.steps, into);
  }
  return into;
}
const placedIds = new WeakMap<MachineFlow, readonly string[]>();
/** True when every state the flow places is on screen. A filtered or truncated tree draws the plain list. */
export function flowIsWhole(flow: MachineFlow, visible: ReadonlyMap<string, unknown>): boolean {
  let ids = placedIds.get(flow);
  if (!ids) placedIds.set(flow, (ids = placed(flow.steps)));
  return ids.every((id) => visible.has(id));
}

/** The steps of one spine, top to bottom. */
export function FlowSteps({
  steps,
  flow,
  column,
}: {
  readonly steps: readonly MachineFlowStep[];
  readonly flow: MachineFlow;
  /** These steps hang under a column head, whose line leads straight into the first of them. */
  readonly column?: boolean;
}) {
  return (
    <>
      {steps.map((step, index) => {
        // Nothing drawn above leads here: routes from further up meet at this state.
        const lead =
          step.linked || (column && index === 0) ? "linked" : index > 0 ? "met" : undefined;
        if (!step.columns.length)
          return <StateCell key={step.rowId} id={step.rowId} step={step} flow={flow} lead={lead} />;
        const last = step.columns.reduce((at, branch, i) => (branch.rejoins ? i : at), -1);
        return (
          <div
            key={step.rowId}
            role="none"
            data-mt-fork=""
            data-lead={lead}
            style={{ "--mt-cols": step.columns.length } as React.CSSProperties}
          >
            <StateCell id={step.rowId} step={step} flow={flow} />
            {step.columns.map((branch, i) => (
              <FlowColumn
                key={i}
                branch={branch}
                flow={flow}
                index={i}
                closes={i <= last}
                end={i === last}
              />
            ))}
          </div>
        );
      })}
    </>
  );
}

function FlowColumn({
  branch,
  flow,
  index,
  closes,
  end,
}: {
  readonly branch: MachineFlowBranch;
  readonly flow: MachineFlow;
  readonly index: number;
  /** The closing line runs under this column. */
  readonly closes: boolean;
  /** The closing line ends here. */
  readonly end: boolean;
}) {
  const { rows } = useTree();
  return (
    <div
      role="none"
      data-mt-col=""
      data-pass={branch.steps.length ? undefined : ""}
      data-rejoins={branch.rejoins || undefined}
      data-closes={closes ? (end ? "end" : "") : undefined}
      style={{ "--mt-col": index + 1 } as React.CSSProperties}
    >
      {/* Stacked (a narrow host): the labels are up in the state's own list, so each block says which it is. */}
      <span
        aria-hidden
        data-mt-caption=""
        className="font-mono text-[10.5px] text-muted-foreground"
      >
        {routeNames(branch.routes, rows).join(" · ")}
      </span>
      <FlowSteps steps={branch.steps} flow={flow} column />
      <span aria-hidden data-mt-close="" />
    </div>
  );
}

/* ───────────────────────────── landings ───────────────────────────── */

const LANDING: Record<MachineFlowLanding, { readonly icon: LucideIcon; readonly words: string }> = {
  next: { icon: ArrowDown, words: "" },
  down: { icon: ArrowDown, words: "joins" },
  up: { icon: ArrowUp, words: "joins" },
  back: { icon: RotateCcw, words: "back to" },
  out: { icon: ArrowUpRight, words: "out to" },
  self: { icon: RotateCcw, words: "stays in" },
  into: { icon: ArrowDownRight, words: "into" },
  unknown: { icon: ArrowUpRight, words: "" },
};
/** How a route lands, as a glyph and a word or two in front of its target ("↺ back to Review"). */
export function Landing({ landing }: { readonly landing: MachineFlowLanding }) {
  const { icon: Icon, words } = LANDING[landing];
  return (
    <>
      <Icon
        aria-hidden
        className="size-3 shrink-0 self-center text-[color:var(--sim-icon,color-mix(in_oklab,var(--muted-foreground)_70%,transparent))] rtl:-scale-x-100"
      />
      {words && (
        <span className="whitespace-nowrap text-[color:var(--sim-tag,var(--muted-foreground))]">
          {words}
        </span>
      )}
    </>
  );
}
export const landingWords = (landing: MachineFlowLanding) => LANDING[landing].words;

/* ───────────────────────────── routes from inside a box ───────────────────────────── */

const eventOf = (row: MachineTreeRow | undefined) => row?.transition?.event || "automatic";
function routeNames(
  routes: readonly MachineFlowRoute[],
  rows: ReadonlyMap<string, MachineTreeRow>,
): string[] {
  return [
    ...new Set(
      routes.flatMap((route) => route.transitionRowIds.map((id) => eventOf(rows.get(id)))),
    ),
  ];
}
/** The states inside `box` that can hold the run. */
function leavesOf(
  box: MachineTreeRow,
  rows: ReadonlyMap<string, MachineTreeRow>,
): MachineTreeRow[] {
  const out: MachineTreeRow[] = [];
  const walk = (id: string) => {
    const row = rows.get(id);
    if (row?.kind !== "node" || row.node?.kind === "note") return;
    const kids = row.childIds.filter((child) => rows.get(child)?.kind === "node");
    if (kids.length) kids.forEach(walk);
    else out.push(row);
  };
  box.childIds.forEach(walk);
  return out;
}

interface SummaryLine {
  readonly events: readonly string[];
  readonly sources: readonly MachineTreeRow[];
}
/** One line per set of states the routes leave from: events that share their sources share a line. */
function summaryLines(
  route: MachineFlowRoute,
  rows: ReadonlyMap<string, MachineTreeRow>,
): SummaryLine[] {
  const byEvent = new Map<string, Set<string>>();
  for (const id of route.transitionRowIds) {
    const row = rows.get(id);
    if (!row?.parentId) continue;
    const event = eventOf(row);
    byEvent.set(event, (byEvent.get(event) ?? new Set()).add(row.parentId));
  }
  const lines = new Map<string, { events: string[]; sources: MachineTreeRow[] }>();
  for (const [event, sources] of byEvent) {
    const key = [...sources].join("\u0000");
    const line = lines.get(key) ?? {
      events: [],
      sources: [...sources].flatMap((id) => rows.get(id) ?? []),
    };
    line.events.push(event);
    lines.set(key, line);
  }
  return [...lines.values()];
}
/** What the summary says in words, for the box's accessible description. */
export function summaryText(
  route: MachineFlowRoute,
  rows: ReadonlyMap<string, MachineTreeRow>,
  links: ReadonlyMap<string, string>,
): string {
  const target = targetOf(route, rows, links);
  const where = target ? ` ${landingWords(route.landing) || "to"} ${target.label}` : "";
  return summaryLines(route, rows)
    .map(
      (line) =>
        `${line.events.join(", ")} from ${line.sources.map((source) => source.label).join(", ")}${where}`,
    )
    .join("; ");
}
/** Where the route's transitions go: the one state they all target, else the step they land on. */
function targetOf(
  route: MachineFlowRoute,
  rows: ReadonlyMap<string, MachineTreeRow>,
  links: ReadonlyMap<string, string>,
): MachineTreeRow | undefined {
  const targets = new Set(route.transitionRowIds.map((id) => links.get(id)));
  const only = targets.size === 1 ? [...targets][0] : undefined;
  return rows.get(only ?? route.landsOn ?? "");
}

/**
 * Routes that leave from inside a box, in words: which events, and which state inside each leaves
 * from. A shut box hides those states, so this line is the only place the picture can say it.
 *
 * It is a picture of transitions that are tree items in their own right, inside the box: so it is
 * hidden from assistive technology (the box's description carries the same words) and its controls
 * are pointer-only. The keyboard path to the same states is opening the box.
 */
export function SummaryRoute({
  box,
  route,
  connector,
  last,
}: {
  readonly box: MachineTreeRow;
  readonly route: MachineFlowRoute;
  readonly connector: "elbow" | "none";
  readonly last: boolean;
}) {
  const { rows, links, reveal } = useTree();
  const lines = summaryLines(route, rows);
  const leaves = React.useMemo(() => leavesOf(box, rows), [box, rows]);
  const target = targetOf(route, rows, links);
  const quiet = route.landing === "next" && route.exact;
  return (
    <li
      role="none"
      aria-hidden
      data-mt-summary=""
      className="relative flex w-fit max-w-full min-h-6 items-center gap-2 ps-4"
    >
      <RouteConnector connector={connector} last={last} />
      <div className="py-0.5 ps-1 font-mono text-[11px] leading-5">
        {lines.slice(0, 5).map((line) => {
          const everywhere =
            line.sources.length > 2 &&
            line.sources.length === leaves.length &&
            line.sources.every((source) => leaves.includes(source));
          const shared = (line.sources[0]?.node?.tags ?? []).filter((tag) =>
            line.sources.every((source) => source.node?.tags?.includes(tag)),
          );
          return (
            <div
              key={line.events.join("\u0000")}
              className="flex flex-wrap items-baseline gap-x-1.5"
            >
              <span className="font-semibold whitespace-nowrap">
                {line.events.slice(0, 2).join(" · ")}
                {line.events.length > 2 && ` +${line.events.length - 2}`}
              </span>
              <span className="text-muted-foreground italic">from</span>
              {everywhere ? (
                <span className="text-muted-foreground">
                  any of its {plural(leaves.length, "state")}
                </span>
              ) : line.sources.length > 3 ? (
                // Too many to name: say how many, and what they have in common when they share a tag.
                <span className="text-muted-foreground">
                  <b className="font-semibold text-foreground">{line.sources.length}</b>{" "}
                  {shared.join(" ")} of its {plural(leaves.length, "state")}
                </span>
              ) : (
                line.sources.map((source, index) => (
                  <React.Fragment key={source.id}>
                    {index > 0 && (
                      <span className="text-muted-foreground">
                        {index === line.sources.length - 1 ? "and" : ","}
                      </span>
                    )}
                    <span
                      dir="auto"
                      title="Open the box and show this state"
                      onClick={(event) => {
                        event.stopPropagation();
                        reveal(source.id, box.id);
                      }}
                      className="cursor-pointer font-sans text-[12px] font-semibold hover:text-signal"
                    >
                      {source.label}
                    </span>
                  </React.Fragment>
                ))
              )}
            </div>
          );
        })}
        {lines.length > 5 && <div className="text-muted-foreground">+{lines.length - 5} more</div>}
      </div>
      {!quiet && target && (
        <span
          onClick={(event) => {
            event.stopPropagation();
            reveal(target.id, box.id);
          }}
          className="flex cursor-pointer items-baseline gap-1 rounded-[5px] border border-dashed border-border px-1.5 font-mono text-[11px] leading-5 hover:border-foreground/30"
        >
          <Landing landing={route.landing} />
          <b dir="auto" className="font-sans text-[12px] font-semibold">
            {target.label}
          </b>
        </span>
      )}
    </li>
  );
}

/** The elbow that ties a side route to the spine. Routes that sit on the spine need none. */
export function RouteConnector({
  connector,
  last,
  live,
}: {
  readonly connector: "elbow" | "none";
  readonly last: boolean;
  readonly live?: boolean;
}) {
  if (connector === "none") return null;
  return (
    <>
      <span
        aria-hidden
        className={cn(
          "absolute start-0 top-0 h-3 w-3 rounded-es-[6px] border-s border-b coarse:h-[22px]",
          live ? "border-signal/60" : "border-border",
        )}
      />
      {!last && (
        <span
          aria-hidden
          className="absolute start-0 top-3 bottom-0 border-s border-border coarse:top-[22px]"
        />
      )}
    </>
  );
}

/* ───────────────────────────── arrivals ───────────────────────────── */

/**
 * Where else a state is reached from, under its header: routes that do not come straight from the
 * state drawn above ("also from"), states several routes meet at, and routes that come in from
 * outside the box ("in from"). Each route already names this state at its own end, so this is a
 * picture for the eye: hidden from assistive technology, pointer-only.
 */
export function ArrivalNotes({
  row,
  flow,
}: {
  readonly row: MachineTreeRow;
  readonly flow: MachineFlow | undefined;
}) {
  const arrivals = flow?.arrivals.get(row.id);
  const entries = flow?.entries.get(row.id);
  if (!flow || (!arrivals?.length && !entries?.length)) return null;
  const meet = flow.meets.has(row.id);
  return (
    <>
      {arrivals?.length ? (
        <ArrivalLine
          row={row}
          arrivals={arrivals}
          lead={meet ? "routes meet here from" : flow.owned.has(row.id) ? "also from" : "from"}
          strong={meet}
        />
      ) : null}
      {entries?.length ? (
        <ArrivalLine row={row} arrivals={entries} lead="in from" entering />
      ) : null}
    </>
  );
}
function ArrivalLine({
  row,
  arrivals,
  lead,
  strong,
  entering,
}: {
  readonly row: MachineTreeRow;
  readonly arrivals: readonly MachineFlowArrival[];
  readonly lead: string;
  readonly strong?: boolean;
  readonly entering?: boolean;
}) {
  const { rows, reveal } = useTree();
  // One entry per state it comes from, however many of that state's routes arrive.
  const bySource = new Map<string, MachineFlowArrival>();
  for (const arrival of arrivals) {
    const known = bySource.get(arrival.sourceRowId);
    bySource.set(
      arrival.sourceRowId,
      known
        ? {
            ...known,
            transitionRowIds: [...known.transitionRowIds, ...arrival.transitionRowIds],
            back: known.back || arrival.back,
          }
        : arrival,
    );
  }
  const sources = [...bySource.values()];
  return (
    <div
      aria-hidden
      data-mt-arrivals=""
      className="flex flex-wrap items-baseline gap-x-1 border-t border-dashed border-border px-2.5 py-1 font-mono text-[10.5px] leading-4 text-muted-foreground"
    >
      {entering && (
        <ArrowDownRight aria-hidden className="size-3 shrink-0 self-center rtl:-scale-x-100" />
      )}
      <span className={cn(strong && "font-semibold text-foreground")}>{lead}</span>
      {sources.slice(0, 3).map((arrival, index) => {
        const source = rows.get(arrival.sourceRowId);
        const names = [...new Set(arrival.transitionRowIds.map((id) => eventOf(rows.get(id))))];
        return (
          <React.Fragment key={arrival.sourceRowId}>
            {index > 0 && <span>,</span>}
            <span
              onClick={(event) => {
                event.stopPropagation();
                reveal(arrival.sourceRowId, row.id);
              }}
              className="group/from cursor-pointer"
            >
              {arrival.back && (
                <RotateCcw aria-hidden className="me-0.5 inline size-2.5 rtl:-scale-x-100" />
              )}
              <b dir="auto" className="font-semibold text-foreground group-hover/from:text-signal">
                {source?.label ?? "a missing state"}
              </b>{" "}
              · {names.slice(0, 2).join(", ")}
              {names.length > 2 && ` +${names.length - 2}`}
            </span>
          </React.Fragment>
        );
      })}
      {sources.length > 3 && <span>, +{sources.length - 3} more</span>}
    </div>
  );
}

/* ───────────────────────────── a shut box's status ───────────────────────────── */

/** One dot per state inside a shut box, the current ones filled: how much is in there, and where the run is. */
export function LeafDots({ box }: { readonly box: MachineTreeRow }) {
  const { rows } = useTree();
  const leaves = React.useMemo(() => leavesOf(box, rows), [box, rows]);
  if (leaves.length < 2 || leaves.length > 8) return null;
  return (
    <span aria-hidden data-mt-dots="" className="flex shrink-0 items-center gap-[3px]">
      {leaves.map((leaf) => (
        <span
          key={leaf.id}
          title={leaf.label}
          className={cn(
            "size-[5px] rounded-full",
            leaf.active
              ? "bg-signal"
              : "bg-[color-mix(in_oklab,var(--foreground)_20%,transparent)]",
          )}
        />
      ))}
    </span>
  );
}

/* ───────────────────────────── looking inside a shut box ───────────────────────────── */

/** The kit HoverCard's pauses, so resting on a box feels like every other hover in the kit. */
const LOOK_OPEN_MS = 300;
const LOOK_CLOSE_MS = 150;
/** More rows than a screen holds: do not draw them all just to find out they do not fit. */
const LOOK_MAX_ROWS = 90;
const LOOK_ROOM = 10;

interface Looking {
  /** The pointer came to rest on a shut box (mouse only). */
  readonly enter: (rowId: string) => void;
  readonly leave: () => void;
}
const LookCtx = React.createContext<Looking | null>(null);
/** Pointer handlers for a shut box's face; undefined where looking inside is not offered. */
export function useLookInside(rowId: string, offered: boolean) {
  const looking = React.useContext(LookCtx);
  if (!looking || !offered) return undefined;
  return {
    onPointerEnter: (event: React.PointerEvent) =>
      event.pointerType === "mouse" && looking.enter(rowId),
    onPointerLeave: () => looking.leave(),
  };
}

const noop = () => {};
const noRef = () => noop;

/**
 * Resting the pointer on a shut box floats its inside over the canvas: the same drawing as opening
 * it, with the run where it really is. It is for looking. It sits outside the tree (inert, so it
 * takes no focus, no keys and is not read out), changes no fold and no selection, and one click on
 * it opens the box in place. A box too big for the canvas offers that click instead.
 *
 *   ┌ canvas ─────────────────────────┐
 *   │  ┌ Publish attempt  REGION ┐    │   resting here …
 *   │  ╔═══════════════════════════╗  │   … floats this over whatever is below
 *   │  ║ ┌ Publishing ┐            ║  │
 *   │  ║ └ FAILED ─► ┌ Retry ┐     ║  │
 *   │  ╚═══════════════════════════╝  │
 */
export function LookInside({ children }: { readonly children: React.ReactNode }) {
  const store = React.useContext(StoreCtx)!;
  const tree = useTree();
  const { scrollerRef } = useTreeLayout();
  const { elements } = useTreeBase();
  const id = useView((state) => state.look);
  const hostRef = React.useRef<HTMLDivElement>(null);
  const floatRef = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<number | undefined>(undefined);
  const [placed, setPlaced] = React.useState<{ left: number; top: number; fits: boolean } | null>(
    null,
  );

  const looking = React.useMemo<Looking>(() => {
    const later = (ms: number, look: string | null) => {
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => store.set({ look }), ms);
    };
    return {
      enter: (rowId) =>
        store.get().look === rowId
          ? window.clearTimeout(timer.current)
          : later(LOOK_OPEN_MS, rowId),
      leave: () => later(LOOK_CLOSE_MS, null),
    };
  }, [store]);
  React.useEffect(() => () => window.clearTimeout(timer.current), []);

  const box = id ? tree.projected.get(id) : undefined;
  // Only a box that is on screen and shut has an inside to look at.
  const shut = !!box && !tree.searching && tree.visible.has(box.id) && tree.collapsed.has(box.id);
  React.useEffect(() => {
    if (id && !shut) store.set({ look: null });
  }, [id, shut, store]);

  // The box's own rows, as they would be on screen if it were open. Boxes shut inside it stay shut.
  const inside = React.useMemo(() => {
    if (!box || !shut) return null;
    const rows = new Map(tree.visible);
    const walk = (rowId: string, top: boolean): boolean => {
      const row = tree.projected.get(rowId);
      if (!row) return true;
      rows.set(rowId, row);
      const folded = !top && tree.collapsed.has(rowId);
      for (const child of row.childIds)
        if (!folded || tree.projected.get(child)?.kind === "transition")
          if (!walk(child, false)) return false;
      return rows.size - tree.visible.size <= LOOK_MAX_ROWS;
    };
    return walk(box.id, true) ? rows : "many";
  }, [box, shut, tree.visible, tree.projected, tree.collapsed]);

  const floated = React.useMemo<TreeModelCtx | null>(() => {
    if (!box || !inside || inside === "many") return null;
    const collapsed = new Set(tree.collapsed);
    collapsed.delete(box.id);
    return {
      ...tree,
      visible: inside,
      collapsed,
      // A picture of the rows, not the rows: it registers nothing and does nothing.
      refFor: noRef,
      toggle: noop,
      select: noop,
      setFocusId: noop,
      setPeek: noop,
      follow: noop,
      reveal: noop,
      activate: noop,
      setPreview: noop,
      applyFix: noop,
      sendEvent: () => null,
    };
  }, [box, inside, tree]);

  // Placed over the box once its real size is known; a float that would not fit is not shown.
  React.useLayoutEffect(() => {
    const host = hostRef.current;
    const float = floatRef.current;
    const face = box ? elements.get(box.id)?.querySelector<HTMLElement>("[data-mt-face]") : null;
    if (!host || !float || !face || !shut) return setPlaced(null);
    const area = host.getBoundingClientRect();
    const at = face.getBoundingClientRect();
    // Without layout (a test environment) there is nothing to measure against: show it.
    const measured = area.width > 0 && area.height > 0;
    const fits =
      inside !== "many" &&
      (!measured ||
        (float.offsetWidth <= area.width - LOOK_ROOM * 2 &&
          float.offsetHeight <= area.height - LOOK_ROOM * 2));
    const clamp = (want: number, size: number, room: number) =>
      Math.max(LOOK_ROOM, Math.min(want, room - size - LOOK_ROOM));
    setPlaced(
      fits
        ? {
            left: clamp(at.left - area.left, float.offsetWidth, area.width),
            top: clamp(at.top - area.top, float.offsetHeight, area.height),
            fits,
          }
        : {
            left: clamp(at.left - area.left + 8, 280, area.width),
            top: clamp(at.bottom - area.top - 6, 40, area.height),
            fits,
          },
    );
  }, [box, shut, inside, elements, floated]);

  // The float is pinned to the canvas, so it cannot follow the tree when it scrolls.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || !id) return;
    const close = () => {
      window.clearTimeout(timer.current);
      store.set({ look: null });
    };
    scroller.addEventListener("scroll", close, { passive: true });
    return () => scroller.removeEventListener("scroll", close);
  }, [id, scrollerRef, store]);

  const open = () => {
    if (!box) return;
    window.clearTimeout(timer.current);
    store.set({ look: null });
    tree.toggle(box.id);
  };
  const count = box && shut ? leavesOf(box, tree.rows).length : 0;
  return (
    <LookCtx.Provider value={looking}>
      <div ref={hostRef} className="relative flex min-h-0 min-w-0 flex-1">
        {children}
        {box && shut && (
          <div
            ref={floatRef}
            data-mt-float={placed?.fits === false ? "prompt" : ""}
            onPointerEnter={() => window.clearTimeout(timer.current)}
            onPointerLeave={looking.leave}
            onClick={placed?.fits ? open : undefined}
            title={placed?.fits ? "Click to open it here" : undefined}
            style={{
              left: placed?.left ?? 0,
              top: placed?.top ?? 0,
              // Measured first, shown once it is known to fit.
              visibility: placed ? "visible" : "hidden",
            }}
            className={cn(
              "absolute z-20 rounded-[11px] bg-card shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_10%,transparent),0_18px_48px_-8px_color-mix(in_oklab,var(--foreground)_28%,transparent)]",
              placed?.fits !== false && "cursor-pointer",
            )}
          >
            {placed?.fits === false ? (
              <div className="flex items-center gap-2.5 py-1 ps-1 pe-3 font-mono text-[11px] whitespace-nowrap text-muted-foreground">
                <Button size="xs" onClick={open}>
                  Click to open
                </Button>
                {plural(count, "state")}, too many to float here
              </div>
            ) : (
              floated && (
                // Inert: no focus, no keys, not read out, and a click lands on the float itself.
                <div inert aria-hidden>
                  <ModelCtx.Provider value={floated}>
                    <StateCell id={box.id} />
                  </ModelCtx.Provider>
                </div>
              )
            )}
          </div>
        )}
      </div>
    </LookCtx.Provider>
  );
}
