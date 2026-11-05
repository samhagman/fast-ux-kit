import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  CornerDownRight,
  ExternalLink,
  FastForward,
  History,
  LogIn,
  LogOut,
  Lock,
  TriangleAlert,
  Zap,
} from "lucide-react";
import { type MachineTreeRow, type MachineTreeVisibleRow } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import { useTreeBase } from "./machine-tree-controller.js";
import { useTreeLayout } from "./machine-tree-layout.js";
import {
  hiddenActiveLeaves,
  hiddenCount,
  isFoldable,
  kindLabel,
  modCombo,
  plural,
  reasonOf,
  routeStateOf,
  shortReason,
} from "./machine-tree-logic.js";
import { useTreeNavigation } from "./machine-tree-navigation.js";
import { useTreeSimulation } from "./machine-tree-run.js";
import { FLAG, useRowFlags, useTree } from "./machine-tree-store.js";
import { useModKey } from "../lib/platform.js";
import { simStateOf, type SimState } from "../machine-shared/machine-sim.js";

/** The scrollable dot-grid canvas holding the tree, the truncation notice and the replay cue. */
export function MachineTreeCanvas() {
  const { model, rows, rootGraph, documentItems, label, elements, stateRowIds } = useTreeBase();
  const layout = useTreeLayout();
  const nav = useTreeNavigation();
  const { sim } = useTreeSimulation();
  const MOD = useModKey();
  const { visible } = nav;
  const { sheetInset } = layout;
  const ctl = { ...layout, ...nav, documentItems };
  const roots = model.rootIds.filter((id) => visible.has(id));
  // On a phone the sheet covers the bottom of the canvas: keep scroll targets above it.
  const covered = sheetInset ? `${sheetInset}px` : undefined;
  useLiveCardClearOfToast({
    band: layout.toaster.covered,
    rootRef: layout.rootRef,
    scrollerRef: layout.scrollerRef,
    liveRow: () =>
      [...sim.leafIds]
        .map((id) => elements.get(stateRowIds.get(id) ?? ""))
        .find((el): el is HTMLElement => !!el),
  });
  const steps = sim.snapshot ? Math.max(0, sim.snapshot.trace.length - 1) : 0;
  return (
    <div className="relative flex min-w-0 flex-1 flex-col">
      {model.truncated && (
        <div
          role="status"
          className="flex shrink-0 items-center gap-2 border-b border-hairline bg-[color-mix(in_oklab,var(--warning)_9%,var(--surface))] px-3 py-1.5 text-[12px]"
        >
          <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warning" />
          <span>
            Showing <bdi className="font-mono tabular-nums">{model.rows.length}</bdi> of{" "}
            <bdi className="font-mono tabular-nums">{ctl.documentItems}</bdi> items — raise{" "}
            <code className="font-mono text-[11px]">maxItems</code> to see all. Counts in headings
            are document totals.
          </span>
        </div>
      )}
      <div className="relative flex min-h-0 flex-1">
        <div
          ref={ctl.scrollerRef}
          className="min-w-0 flex-1 overflow-auto bg-canvas"
          style={{
            backgroundImage:
              "radial-gradient(color-mix(in oklab, var(--foreground) 9%, transparent) 1px, transparent 1px)",
            backgroundSize: "16px 16px",
            scrollPaddingBottom: covered,
          }}
          onClick={(event) => event.target === event.currentTarget && ctl.select(null)}
        >
          <div
            role="tree"
            aria-label={`${label} state hierarchy`}
            aria-describedby={ctl.helpId}
            onKeyDown={ctl.onTreeKeyDown}
            onClick={(event) => event.target === event.currentTarget && ctl.select(null)}
            className="grid min-h-full content-start gap-8 p-4 sm:p-6"
            style={covered ? { paddingBottom: `calc(${covered} + 1rem)` } : undefined}
          >
            {roots.map((id, index) => (
              <MachineSection
                key={id}
                id={id}
                primary={index === 0 && rows.get(id)?.machineId === rootGraph.id}
                divided={index > 0}
              />
            ))}
            {ctl.searching && ctl.matchIds.length === 0 && (
              <div
                role="status"
                className="justify-self-center rounded-lg border border-dashed px-4 py-3 text-center text-[12px] text-muted-foreground"
              >
                No state or event matches “<span dir="auto">{ctl.deferredQuery.trim()}</span>”.
              </div>
            )}
          </div>
          <span id={ctl.helpId} hidden>
            {ctl.coarse
              ? "Tap a state to select it. Tap a transition to go to its target; while simulating, tap an enabled event to send it."
              : `Arrow keys move between states and transitions; left and right fold or enter; type letters to jump. On a transition, right arrow focuses its target and Enter follows it; ${modCombo(MOD, "Enter")} follows directly. While simulating, Enter or a click on an enabled event sends it, and ${modCombo(MOD, "click")} follows its target. ${modCombo(MOD, "K")} goes to any state.`}
          </span>
        </div>
        {/* Replay cue: the canvas is showing history, not the live run. The one "Live" control besides the panel's. */}
        <AnimatePresence>
          {sim.cursor !== null && sim.snapshot && (
            <motion.div
              key="replay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionTokens.quick}
              className="pointer-events-none absolute inset-0 z-10 ring-1 ring-signal/35 ring-inset"
            >
              {/* A replay stepper: ◀ ▶ walk the history; Live returns (and hands focus back to the tree). */}
              <div
                role="group"
                aria-label="Replay"
                className="pointer-events-auto absolute end-3 top-3 flex h-7 items-center gap-0.5 rounded-full border border-signal/35 bg-popover ps-2.5 pe-1 font-mono text-[11px] text-signal shadow-sm coarse:h-11"
              >
                <History aria-hidden className="me-1 size-3.5" />
                <span className="me-0.5">
                  Step <bdi className="tabular-nums">{sim.cursor}</bdi>/
                  <bdi className="tabular-nums">{steps}</bdi>
                </span>
                <button
                  type="button"
                  aria-label="Previous step"
                  disabled={sim.cursor <= 0}
                  onClick={() => sim.setCursor(Math.max(0, (sim.cursor ?? 0) - 1))}
                  className="mt-hit grid size-5 place-items-center rounded-full transition-colors hover:bg-signal-muted disabled:opacity-40"
                >
                  <ChevronLeft aria-hidden className="size-3.5 rtl:-scale-x-100" />
                </button>
                <button
                  type="button"
                  aria-label="Next step"
                  onClick={() => {
                    const next = (sim.cursor ?? 0) + 1;
                    sim.setCursor(next >= steps ? null : next);
                    // Stepping past the end is "Live": the stepper leaves, so focus returns to the tree.
                    if (next >= steps) ctl.restoreFocus();
                  }}
                  className="mt-hit grid size-5 place-items-center rounded-full transition-colors hover:bg-signal-muted"
                >
                  <ChevronRight aria-hidden className="size-3.5 rtl:-scale-x-100" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sim.setCursor(null);
                    ctl.restoreFocus();
                  }}
                  className="mt-hit ms-0.5 rounded-full bg-signal px-2 py-0.5 text-[10.5px] text-signal-foreground transition-opacity hover:opacity-90"
                >
                  Live
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * A persistent touch toast sits under the toolbar until it is used or closed. In a short tree
 * (a phone host giving it ~300px) that band can be the whole top of the viewport, right where the
 * live card the user just tapped is. While one is up, the live card is moved below it:
 *
 *   ┌ toolbar ────────────────┐        ┌ toolbar ────────────────┐
 *   │▒ DECIDE blocked … [Try] ▒│        │▒ DECIDE blocked … [Try] ▒│  ← band (`covered` px)
 *   │▒▒▒ Review ▒▒▒▒▒▒▒▒▒▒▒▒▒▒│   →    │ ┃ Review    ACTIVE      │  ← live card, clear
 *   │   DECIDE [approved] →   │        │   DECIDE [approved] →   │
 *
 * By scrolling back when there is room above, else by a temporary top inset on the tree (the
 * scroll is at 0: nothing above to reveal). The inset goes when the toast does. Nothing moves when
 * the card is already clear (a full-height tree), or for short-lived toasts (`band` is 0).
 */
function useLiveCardClearOfToast({
  band,
  rootRef,
  scrollerRef,
  liveRow,
}: {
  readonly band: number;
  readonly rootRef: React.RefObject<HTMLElement | null>;
  readonly scrollerRef: React.RefObject<HTMLElement | null>;
  readonly liveRow: () => HTMLElement | undefined;
}) {
  const liveRowRef = React.useRef(liveRow);
  liveRowRef.current = liveRow;
  React.useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    const tree = scroller?.querySelector<HTMLElement>('[role="tree"]');
    if (!scroller || !tree) return;
    const reset = () => void (tree.style.paddingTop = "");
    if (!band) return reset();
    const bar = rootRef.current?.querySelector("[data-mt-toolbar]")?.getBoundingClientRect();
    const card = liveRowRef.current()?.getBoundingClientRect();
    if (!bar || !card) return;
    const clear = bar.bottom + band;
    const top = scroller.getBoundingClientRect().top;
    // Covered: some of the card is in the viewport, and its top edge is under the toast.
    if (!(card.top < clear && card.bottom > top)) return;
    const shift = Math.ceil(clear - card.top);
    if (scroller.scrollTop >= shift) {
      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      scroller.scrollTo({ top: scroller.scrollTop - shift, behavior: reduced ? "auto" : "smooth" });
    } else {
      // Not enough above to scroll back to: open the gap at the top instead, then sit at 0.
      const inset = shift - scroller.scrollTop;
      reset();
      tree.style.paddingTop = `${(parseFloat(getComputedStyle(tree).paddingTop) || 0) + inset}px`;
      scroller.scrollTop = 0;
    }
  }, [band, rootRef, scrollerRef]);
}

/** Highlights the active query inside rendered text; never injects HTML. */
export function Highlight({ text }: { readonly text: string }) {
  const { query } = useTree();
  if (!query) return <>{text}</>;
  const lower = text.toLowerCase();
  const needle = query.toLowerCase();
  const parts: React.ReactNode[] = [];
  let from = 0;
  for (let at = lower.indexOf(needle); at >= 0 && needle; at = lower.indexOf(needle, from)) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark key={at} className="mt-mark">
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

/** When a row matches only on text it doesn't show (ids, source label, description), say what matched. */
export function hiddenMatch(
  row: MachineTreeVisibleRow,
  shown: readonly (string | undefined)[],
  query: string,
  rows: ReadonlyMap<string, MachineTreeRow>,
): string | null {
  if (!row.match || !query) return null;
  const needle = query.toLowerCase();
  if (shown.some((text) => text?.toLowerCase().includes(needle))) return null;
  const source = row.kind === "transition" ? rows.get(row.parentId ?? "")?.label : undefined;
  if (source?.toLowerCase().includes(needle)) return `source ${source}`;
  const id = row.transition?.id ?? row.node?.id;
  if (id?.toLowerCase().includes(needle)) return `id ${id}`;
  if ((row.transition?.description ?? row.node?.description)?.toLowerCase().includes(needle))
    return "description";
  return "metadata";
}

/* ───────────────────────────── Tree items ───────────────────────────── */

/** Shared treeitem wiring: roving tabindex, ARIA position, selection, focus tracking. */
export function useItemProps(
  row: MachineTreeVisibleRow,
  flags: number,
  label: string,
  extra: { expanded?: boolean | undefined; disabled?: boolean; description?: string } = {},
) {
  const { select, setFocusId, refFor, activate, follow } = useTree();
  return {
    ref: refFor(row.id),
    role: "treeitem",
    "data-mt-item": "",
    "data-row-id": row.id,
    tabIndex: flags & FLAG.stop ? 0 : -1,
    "aria-level": row.level,
    "aria-posinset": row.posInSet,
    "aria-setsize": row.setSize,
    "aria-selected": !!(flags & FLAG.selected),
    "aria-expanded": extra.expanded,
    "aria-disabled": extra.disabled || undefined,
    "aria-label": label,
    "aria-description": extra.description || undefined,
    onFocus: (event: React.FocusEvent) =>
      event.target === event.currentTarget && setFocusId(row.id),
    onClick: (event: React.MouseEvent) => {
      event.stopPropagation();
      // ⌘/Ctrl/Alt-click on a route follows it (as ⌘↵ does); a plain click activates (sends while simulating).
      if (row.kind === "transition")
        (event.metaKey || event.ctrlKey || event.altKey ? follow : activate)(row.id);
      else select(row.id);
    },
  } as const;
}

/**
 * Diagnostic triangle. Pointer and touch: tap opens the message (a popover, not a hover-only
 * tooltip). Keyboard and AT: the message is already in the row's accessible name, and the
 * toolbar's Diagnostics popover lists every issue, so the mark itself stays out of the tab order.
 */
export function IssueMark({ messages }: { readonly messages: readonly string[] | undefined }) {
  if (!messages?.length) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          aria-hidden
          title={messages.join(" ")}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          className="mt-hit grid size-4 shrink-0 cursor-help place-items-center rounded-[4px] hover:bg-[color-mix(in_oklab,var(--warning)_16%,transparent)]"
        >
          <TriangleAlert className="size-3.5 text-warning" />
        </span>
      </PopoverTrigger>
      <PopoverContent
        data-mt-portal=""
        side="top"
        align="start"
        className="w-64 p-2.5 text-[12px] leading-4"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <div className="mb-1 flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
          <TriangleAlert aria-hidden className="size-3 text-warning" /> Diagnostic
        </div>
        {messages.map((message) => (
          <p key={message}>{message}</p>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** "● Connected" (or "● 2 active") on a folded container that holds the run; pings on entry. */
export function HiddenActive({
  leaves,
  pingKey,
  entered,
}: {
  readonly leaves: readonly MachineTreeRow[];
  readonly pingKey: number;
  readonly entered: boolean;
}) {
  if (!leaves.length) return null;
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-[4px] border border-signal/35 bg-signal-muted px-1 font-mono text-[10px] leading-4 text-signal">
      <span aria-hidden className="relative flex size-1.5 shrink-0">
        {entered && (
          <span key={pingKey} className="mt-ping absolute inset-0 rounded-full bg-signal" />
        )}
        <span className="relative size-1.5 rounded-full bg-signal" />
      </span>
      <bdi dir="auto" className="max-w-36 truncate">
        {leaves.length === 1 ? leaves[0]!.label : `${leaves.length} active`}
      </bdi>
    </span>
  );
}

export const MachineSection = React.memo(function MachineSection({
  id,
  primary,
  divided,
}: {
  readonly id: string;
  readonly primary: boolean;
  readonly divided: boolean;
}) {
  const {
    visible,
    projected,
    collapsed,
    searching,
    toggle,
    rows,
    sim,
    rootMachineId,
    first,
    issues,
  } = useTree();
  const flags = useRowFlags(id, first);
  const row = visible.get(id)!;
  const notes = row.graph.nodes.filter((n) => n.kind === "note" && !n.parentId);
  const states = row.graph.nodes.filter((n) => n.kind !== "note").length;
  const foldable = isFoldable(row, projected);
  const open = foldable && (searching || !collapsed.has(id));
  const referencedBy = primary
    ? undefined
    : [...rows.values()].find(
        (r) => r.node?.kind === "submachine" && r.node.machineId === row.machineId,
      );
  const running = sim.live && row.machineId === rootMachineId;
  const hidden = running && foldable && !open ? hiddenActiveLeaves(row, rows) : [];
  const label = [
    `${row.label}, machine`,
    !primary ? "referenced" : "",
    plural(states, "state"),
    hidden.length ? `active: ${hidden.map((leaf) => leaf.label).join(", ")}` : "",
    issues.get(id)?.length ? `diagnostic: ${issues.get(id)!.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const item = useItemProps(row, flags, label, {
    expanded: foldable ? open : undefined,
    description: notes.map((n) => n.label).join(". "),
  });
  return (
    <div {...item} className={cn("min-w-0", divided && "border-t border-dashed pt-6")}>
      <div
        data-mt-face
        className={cn(
          "mb-3 flex w-fit max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-md pe-1 transition-colors",
          flags & FLAG.selected && "bg-muted",
          flags & FLAG.match && "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)]",
          flags & FLAG.flash && "mt-flash",
        )}
      >
        {foldable && (
          <span
            aria-hidden
            onClick={(event) => (event.stopPropagation(), toggle(id))}
            className="mt-hit grid size-5 cursor-pointer place-items-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ChevronRight
              className={cn(
                "size-3.5 transition-transform duration-150 rtl:-scale-x-100",
                open && "rotate-90 rtl:-rotate-90",
              )}
            />
          </span>
        )}
        <span
          dir="auto"
          className={cn(
            "font-semibold tracking-[-0.01em]",
            primary ? "text-[17px]" : "text-[15px]",
          )}
        >
          <Highlight text={row.label} />
        </span>
        <IssueMark messages={issues.get(id)} />
        <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">
          <bdi>{plural(states, "state")}</bdi> ·{" "}
          <bdi>{plural(row.graph.transitions.length, "transition")}</bdi>
        </span>
        {!primary && (
          <span
            dir="auto"
            className="rounded-[4px] border border-hairline bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground"
          >
            {referencedBy ? (
              <>
                referenced by <bdi>{referencedBy.label}</bdi>
              </>
            ) : (
              "referenced"
            )}
          </span>
        )}
        {hidden.length ? (
          <HiddenActive
            leaves={hidden}
            pingKey={sim.pingKey}
            entered={hidden.some((leaf) => sim.entered.has(leaf.elementId))}
          />
        ) : (
          running && <span aria-hidden className="size-1.5 rounded-full bg-signal" />
        )}
      </div>
      {notes.length > 0 && !searching && (
        <p
          dir="auto"
          className="-mt-1.5 mb-3 max-w-prose text-[11.5px] leading-4 text-muted-foreground italic"
        >
          {notes.map((n) => n.label).join(" ")}
        </p>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={motionTokens.base}
            className="-m-1 overflow-hidden p-1"
          >
            <Children parent={row} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/** A sibling group: state cells flow and wrap; a parallel's regions sit side by side as columns. */
export function Children({
  parent,
  parallel,
}: {
  readonly parent: MachineTreeRow;
  readonly parallel?: boolean;
}) {
  const { visible } = useTree();
  const states = parent.childIds.filter((id) => visible.get(id)?.kind === "node");
  // Recovered transitions (missing source) hang off the machine itself.
  const orphans =
    parent.kind === "machine"
      ? parent.childIds.filter((id) => visible.get(id)?.kind === "transition")
      : [];
  return (
    <>
      <div
        role="group"
        className={cn(
          parallel
            ? "flex items-stretch max-md:flex-col"
            : "flex flex-wrap items-start gap-x-2.5 gap-y-3",
        )}
      >
        {states.map((id) => (
          <StateCell key={id} id={id} region={parallel} />
        ))}
      </div>
      {orphans.length > 0 && (
        <RouteList ids={orphans} label={`${parent.label} unattached transitions`} />
      )}
    </>
  );
}

export const StateCell = React.memo(function StateCell({
  id,
  region,
}: {
  readonly id: string;
  readonly region?: boolean | undefined;
}) {
  const { visible, projected, collapsed, searching, links, rows, first, issues, layoutEpoch } =
    useTree();
  const flags = useRowFlags(id, first);
  const row = visible.get(id)!;
  const node = row.node!;
  const container = row.childIds.some((c) => projected.get(c)?.kind === "node");
  const open = container && (searching || !collapsed.has(id));
  const routes = row.childIds.filter((c) => visible.get(c)?.kind === "transition");
  const leaf = row.active && !row.activeDescendant;
  const contains = row.activeDescendant;
  const parts = [
    row.label,
    kindLabel(row, rows.get(row.parentId ?? "")).toLowerCase(),
    row.initial && node.kind !== "initial" ? "initial" : "",
    leaf ? "active" : contains && open ? "contains active state" : "",
    container && !open ? `${hiddenCount(row, rows)} hidden` : "",
    container && !open && contains
      ? `active: ${hiddenActiveLeaves(row, rows)
          .map((r) => r.label)
          .join(", ")}`
      : "",
    // The dry-run words describe *another* row's preview: never on the row that holds focus (it was
    // just followed or arrowed to while the pointer still rests on the route).
    flags & FLAG.stop
      ? ""
      : flags & FLAG.ghostEnter
        ? "would be entered"
        : flags & FLAG.ghostExit
          ? "would be left"
          : "",
    node.kind === "submachine"
      ? `opens ${rows.get(links.get(id) ?? "")?.label ?? "an unavailable machine"}`
      : "",
    issues.get(id)?.length ? `diagnostic: ${issues.get(id)!.join(" ")}` : "",
  ].filter(Boolean);
  const item = useItemProps(row, flags, parts.join(", "), {
    expanded: container ? open : undefined,
    description: node.description ?? "",
  });
  return (
    <motion.div
      {...item}
      layout="position"
      layoutDependency={layoutEpoch}
      transition={{ layout: motionTokens.layout }}
      className={cn(
        "flex min-w-0 max-w-full flex-col",
        region
          ? // Region columns: dashed dividers between them (a top rule once they stack on phones).
            "min-w-[12rem] grow basis-auto border-dashed border-border px-3 first:ps-0 last:pe-0 [&:not(:first-child)]:border-s max-md:min-w-0 max-md:basis-auto max-md:px-0 max-md:[&:not(:first-child)]:border-s-0 max-md:[&:not(:first-child)]:border-t max-md:[&:not(:first-child)]:pt-2 max-md:[&:not(:last-child)]:pb-2"
          : "w-max",
      )}
    >
      <StateBlock
        row={row}
        flags={flags}
        container={container}
        open={open}
        region={region}
        leaf={leaf}
        contains={contains}
      />
      {routes.length > 0 && <RouteList ids={routes} label={`${row.label} transitions`} />}
    </motion.div>
  );
});

export function StateBlock({
  row,
  flags,
  container,
  open,
  region,
  leaf,
  contains,
}: {
  readonly row: MachineTreeVisibleRow;
  readonly flags: number;
  readonly container: boolean;
  readonly open: boolean;
  readonly region?: boolean | undefined;
  readonly leaf: boolean;
  readonly contains: boolean;
}) {
  const { toggle, searching, sim, links, rows, follow, rootMachineId, query, issues } = useTree();
  const node = row.node!;
  const isSelected = !!(flags & FLAG.selected);
  const isMatch = !!(flags & FLAG.match);
  const final = node.kind === "final";
  const sub = node.kind === "submachine";
  const parallel = node.kind === "parallel";
  const pseudo = node.kind === "initial";
  const context = searching && row.context && !(flags & FLAG.spotlight);
  const pinging = leaf && row.machineId === rootMachineId && sim.entered.has(row.elementId);
  const subTarget = sub ? rows.get(links.get(row.id) ?? "") : undefined;
  const kind = kindLabel(row, rows.get(row.parentId ?? ""));
  const hasBody =
    !container && !!(node.description || node.entry?.length || node.exit?.length || sub);
  const matchedVia = searching
    ? hiddenMatch(
        row,
        [
          row.label,
          ...(node.tags ?? []),
          ...(hasBody ? [node.description, ...(node.entry ?? []), ...(node.exit ?? [])] : []),
        ],
        query,
        rows,
      )
    : null;
  const hiddenLeaves =
    container && !open && contains && row.machineId === rootMachineId
      ? hiddenActiveLeaves(row, rows)
      : [];
  // Simulation emphasis through the shared `data-sim` tokens (machine-sim.css), exactly as Machine
  // View's nodes: colour, never opacity. Only the root machine runs; other machines keep design colours.
  const simulating = sim.live && row.machineId === rootMachineId;
  const simState: SimState = simStateOf({ leaf, ancestor: contains, simulating });
  // Every state that can hold the run reserves the live dot's slot while a run is on, so a send moves
  // the dot without resizing two cards (and reflowing a parallel's columns).
  const dotSlot = leaf || (simulating && !container && !region && !pseudo);
  const header = (
    <div
      className={cn(
        "group/head flex items-center gap-2 transition-colors",
        region ? "min-h-7 rounded-md px-1 coarse:min-h-11" : "min-h-9 px-2.5 py-1 coarse:min-h-11",
        container && open && !region && "border-b border-hairline",
        // Folded: the hidden-count / active chips wrap under the label on a narrow screen instead of squeezing it.
        container && !open && "flex-wrap gap-y-1",
        // Current search match: tint the header, not another frame around the enclosure.
        isMatch &&
          (region
            ? "bg-[color-mix(in_oklab,var(--warning)_14%,transparent)]"
            : "rounded-t-[9px] bg-[color-mix(in_oklab,var(--warning)_12%,transparent)]"),
        isMatch && !region && !(container && open) && "rounded-b-[9px]",
      )}
    >
      {container && (
        <span
          aria-hidden
          onClick={(event) => {
            event.stopPropagation();
            toggle(row.id);
          }}
          className="mt-hit -ms-1 grid size-5 shrink-0 cursor-pointer place-items-center rounded-[5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight
            className={cn(
              "size-3.5 transition-transform duration-150 ease-[var(--ease-standard)] rtl:-scale-x-100",
              open && "rotate-90 rtl:-rotate-90",
            )}
          />
        </span>
      )}
      {row.initial && !pseudo && (
        <Tooltip>
          <TooltipTrigger asChild>
            <CornerDownRight
              aria-hidden
              className="size-3.5 shrink-0 text-[color:var(--sim-icon,var(--muted-foreground))] rtl:-scale-x-100"
            />
          </TooltipTrigger>
          <TooltipContent>Initial state</TooltipContent>
        </Tooltip>
      )}
      {pseudo && <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground/70" />}
      {final && (
        <CircleDot
          aria-hidden
          className={cn(
            "size-3.5 shrink-0",
            leaf ? "text-signal" : "text-[color:var(--sim-icon,var(--muted-foreground))]",
          )}
        />
      )}
      {sub && (
        <ExternalLink
          aria-hidden
          className="size-3.5 shrink-0 text-[color:var(--sim-icon,var(--muted-foreground))] rtl:-scale-x-100"
        />
      )}
      <span
        dir="auto"
        title={row.label}
        className={cn(
          "line-clamp-2 min-w-0 leading-5 tracking-[-0.005em] break-words",
          region
            ? // A region's name is a quiet column caption; it reads as a name only while the run is in it.
              cn(
                "text-[12px] font-medium",
                simState === "active" || simState === "ancestor"
                  ? "text-[color:var(--sim-name)]"
                  : "text-[color:var(--sim-text,var(--muted-foreground))]",
              )
            : "text-[13px] font-semibold text-[color:var(--sim-name,var(--card-foreground))]",
          (context || pseudo) && "font-medium text-[color:var(--sim-text,var(--muted-foreground))]",
        )}
      >
        <Highlight text={row.label} />
      </span>
      <IssueMark messages={issues.get(row.id)} />
      {/* Kind badge sits beside the label, not at the far edge of a wide header. */}
      {(parallel || (node.kind === "compound" && !region)) && (
        <span
          className={cn(
            "shrink-0 font-mono text-[9.5px] tracking-wider text-[color:var(--sim-tag,var(--muted-foreground))] uppercase",
            // Compounds are obvious from their enclosure; reveal the badge on header hover/focus only.
            node.kind === "compound" &&
              "opacity-0 transition-opacity group-hover/head:opacity-100 coarse:hidden",
          )}
        >
          {kind}
        </span>
      )}
      {dotSlot && (
        <span aria-hidden className={cn("relative flex size-1.5 shrink-0", !leaf && "invisible")}>
          {pinging && (
            <span key={sim.pingKey} className="mt-ping absolute inset-0 rounded-full bg-signal" />
          )}
          <span className="relative size-1.5 rounded-full bg-signal" />
        </span>
      )}
      {node.tags?.map((tag) => (
        <span
          key={tag}
          dir="auto"
          className="shrink-0 rounded-[4px] border border-hairline px-1 font-mono text-[10px] leading-4 text-[color:var(--sim-tag,var(--muted-foreground))]"
        >
          <Highlight text={tag} />
        </span>
      ))}
      {matchedVia && (
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
          matched {matchedVia}
        </span>
      )}
      {container && !open && (
        <span className="ms-auto flex shrink-0 items-center gap-1">
          {hiddenLeaves.length > 0 && (
            <HiddenActive
              leaves={hiddenLeaves}
              pingKey={sim.pingKey}
              entered={hiddenLeaves.some((leaf) => sim.entered.has(leaf.elementId))}
            />
          )}
          <span className="rounded-[4px] bg-muted px-1 font-mono text-[10px] leading-4 text-[color:var(--sim-tag,var(--muted-foreground))] tabular-nums">
            <bdi>{hiddenCount(row, rows)}</bdi>
          </span>
        </span>
      )}
    </div>
  );
  return (
    <div
      data-mt-face
      data-active={leaf}
      data-sim={simState}
      data-region={region || undefined}
      className={cn(
        "relative w-full transition-[border-color,background-color,box-shadow,outline-color] duration-200",
        region
          ? // A region is a column inside its parallel, not another box.
            cn("rounded-md", isSelected && "bg-muted/70")
          : cn(
              // Border and fill come from the shared sim tokens while a run is on (active, ancestor,
              // inactive), and fall back to the design colours otherwise.
              "rounded-[10px] border border-[color:var(--sim-border,var(--border))] text-card-foreground",
              container
                ? "bg-[var(--sim-surface,color-mix(in_oklab,var(--foreground)_1.5%,var(--card)))]"
                : "min-w-40 bg-[var(--sim-surface,var(--card))]",
              pseudo && "border-dashed bg-transparent",
              final && "mt-final",
              // The live leaf's glow (stronger in dark, where the 7% tint all but disappears).
              leaf &&
                "shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_16%,transparent)] dark:shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_24%,transparent)]",
              isSelected &&
                !leaf &&
                "border-foreground/55 shadow-[0_0_0_3px_color-mix(in_oklab,var(--foreground)_8%,transparent)]",
              isSelected &&
                leaf &&
                "shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_30%,transparent)] dark:shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_36%,transparent)]",
              !leaf && !isSelected && !contains && "hover:border-foreground/25",
            ),
        flags & FLAG.peek && "mt-peek",
        flags & FLAG.flash && "mt-flash",
        flags & FLAG.ghostEnter && "mt-ghost-enter",
      )}
    >
      {/* The live leaf's rail: the one solid signal stroke on screen, kept under any dry-run ghost. */}
      {leaf && !region && <span aria-hidden className="mt-rail" />}
      {/* Dry-run tag: absolutely placed so a preview never reflows the tree. */}
      {flags & FLAG.ghostEnter ? (
        // A glyph, not a word: an event can be literally named NEXT. The row's name says "would be entered".
        <span
          aria-hidden
          className="mt-ghost-tag pointer-events-none absolute -top-2 end-2 z-10 grid h-3.5 place-items-center rounded-[3px] px-1"
        >
          <LogIn className="size-2.5 rtl:-scale-x-100" />
        </span>
      ) : flags & FLAG.ghostExit ? (
        // Would be left: the live card stays as it is; only this outlined tag marks the exit.
        <span
          aria-hidden
          data-exit=""
          className="mt-ghost-tag pointer-events-none absolute -top-2 end-2 z-10 grid h-3.5 place-items-center rounded-[3px] px-1"
        >
          <LogOut className="size-2.5 rtl:-scale-x-100" />
        </span>
      ) : null}
      {header}
      {hasBody && (
        <div className="space-y-1 border-t border-hairline px-2.5 pt-1.5 pb-2">
          {node.description && (
            <p
              dir="auto"
              title={node.description}
              className="line-clamp-2 max-w-72 text-[11.5px] leading-4 text-[color:var(--sim-text,var(--muted-foreground))]"
            >
              <Highlight text={node.description} />
            </p>
          )}
          {[
            ...(node.entry ?? []).map((a) => ["entry", a] as const),
            ...(node.exit ?? []).map((a) => ["exit", a] as const),
          ].map(([phase, action]) => (
            <div key={phase + action} className="flex items-center gap-1.5 font-mono text-[10.5px]">
              <span className="text-[color:var(--sim-tag,var(--muted-foreground))]">{phase}</span>
              <span className="break-all text-[color:var(--sim-text,var(--card-foreground))]">
                <Highlight text={action} />
              </span>
            </div>
          ))}
          {sub &&
            (subTarget ? (
              // Not a nested button: the treeitem owns activation (→ then Enter, or ⌘Enter); pointers click it.
              <span
                tabIndex={-1}
                data-substop
                onClick={(event) => {
                  event.stopPropagation();
                  follow(row.id);
                }}
                className="mt-hit inline-flex w-fit cursor-pointer items-center gap-1 rounded-[3px] font-mono text-[11px] text-signal underline decoration-signal/30 underline-offset-[3px] transition-colors outline-none hover:decoration-signal focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span dir="auto">{subTarget.label}</span>
                <ArrowUpRight aria-hidden className="size-3 rtl:-scale-x-100" />
              </span>
            ) : (
              <span className="font-mono text-[11px] text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
                referenced machine unavailable
              </span>
            ))}
        </div>
      )}
      <AnimatePresence initial={false}>
        {container && open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={motionTokens.base}
            className="overflow-hidden"
          >
            <div className={region ? "pt-1.5" : "p-2.5"}>
              <Children parent={row} parallel={parallel} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function RouteList({
  ids,
  label,
}: {
  readonly ids: readonly string[];
  readonly label: string;
}) {
  return (
    <ul role="group" aria-label={label} className="ms-3.5 mt-0.5">
      {ids.map((id, index) => (
        <RouteRow key={id} id={id} last={index === ids.length - 1} />
      ))}
    </ul>
  );
}

export const RouteRow = React.memo(function RouteRow({
  id,
  last,
}: {
  readonly id: string;
  readonly last: boolean;
}) {
  const {
    visible,
    rows,
    links,
    sim,
    setPeek,
    setPreview,
    follow,
    activate,
    searching,
    rootMachineId,
    first,
    query,
    handoff,
    issues,
    coarse,
  } = useTree();
  const [tipOpen, setTipOpen] = React.useState(false);
  const pillRef = React.useRef<HTMLSpanElement | null>(null);
  const MOD = useModKey();
  const flags = useRowFlags(id, first);
  const row = visible.get(id)!;
  const t = row.transition!;
  const target = rows.get(links.get(id) ?? "");
  const state = routeStateOf(row, sim, rootMachineId);
  const taken = sim.running && row.machineId === rootMachineId && sim.taken.has(t.id);
  const running = state !== "idle";
  const enabled = state === "enabled";
  const blocked = state === "blocked";
  const reason = reasonOf(row, state, sim);
  // While simulating, routes that can't fire recede through the shared `data-sim="inactive"` tokens
  // (colour, not opacity: text stays ≥ 4.5:1), as Machine View's chips do; blocked routes stay legible
  // because their reason is the point. A search's context rows recede to the plain muted colour.
  // An errored run dims nothing (its states keep design colours too).
  const inactive = state === "inactive" && !taken && sim.live;
  const recede = inactive || (searching && row.context && !(flags & FLAG.spotlight));
  const event = t.event || "";
  const targetLabel = target?.label ?? t.targetId;
  const matchedVia = searching
    ? hiddenMatch(
        row,
        [event || "automatic", t.guard, targetLabel, t.actions?.join(", ")],
        query,
        rows,
      )
    : null;
  // Dry run: hovering or focusing an enabled route ghosts the states it would enter and leave
  // (computed lazily on that hover/focus, never for every route on every frame).
  const canPreview = enabled && !!event;
  // While it can fire, the whole route is one Send target for every pointer: a click lands the same
  // wherever it hits the row (its target text included). ⌘/Ctrl-click, ⌘↵ and Details' "to" link follow.
  const sendsOnClick = canPreview;
  // The focused route also says where it would go (the dry run is computed for that one row only).
  const preview = canPreview && flags & FLAG.stop ? sim.previewOf(event) : undefined;
  const label = [
    event ? `${event}` : "Automatic transition",
    t.guard ? `guard ${t.guard}` : "",
    `to ${targetLabel}${target ? "" : " (missing)"}`,
    row.recovered ? "source state missing" : "",
    // Touch: no Enter key to promise (a screen reader's double-tap activates the row).
    enabled
      ? `enabled, ${coarse ? "double-tap" : "press Enter"} to send${preview ? `, moves to ${preview.to.join(", ")}` : ""}`
      : "",
    // Only a blocked route says why in its name, without repeating the event ("blocked: guard ready is
    // false"); an inactive one is just aria-disabled (Enter explains).
    blocked ? `blocked: ${shortReason(reason, t.event)}` : "",
    blocked && sim.fixes.has(t.id) ? `fix: send with ${sim.fixes.get(t.id)![0]!.text}` : "",
    taken ? "just taken" : "",
    // Transition-level diagnostics (a missing target, a nested transition) are named like a state's.
    issues.get(id)?.length ? `diagnostic: ${issues.get(id)!.join(" ")}` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const item = useItemProps(row, flags, label, {
    disabled: running && !enabled,
    description: [t.actions?.length ? `actions ${t.actions.join(", ")}` : "", t.description ?? ""]
      .filter(Boolean)
      .join(". "),
  });
  const pill = (
    <span
      ref={pillRef}
      className={cn(
        "flex items-center gap-1 rounded-[5px] border px-1.5 font-semibold transition-colors",
        !event && "font-normal text-muted-foreground italic",
        !running && "border-transparent group-hover/route:bg-muted",
        // No hover fill of its own: the whole row tints as one Send button (see the face below).
        enabled && "border-signal/50 text-signal",
        blocked && "cursor-not-allowed border-dashed border-warning/70",
        state === "inactive" && "cursor-not-allowed border-transparent",
        recede && "font-medium text-[color:var(--sim-tag,var(--muted-foreground))]",
        flags & FLAG.match && "bg-[color-mix(in_oklab,var(--warning)_18%,transparent)]",
      )}
    >
      {enabled && <Zap aria-hidden className="size-2.5 fill-current" />}
      {blocked && <Lock aria-hidden className="size-2.5 text-warning" />}
      {/* While a run is on every event pill keeps its status glyph's slot, so a send that enables one
          route and retires another never resizes the cards above them (a parallel's columns stay put). */}
      {running && !enabled && !blocked && !!event && (
        <span aria-hidden className="size-2.5 shrink-0" />
      )}
      {!event && <FastForward aria-hidden className="size-2.5 rtl:-scale-x-100" />}
      {/* One inline run: the pill is a flex row, so bare text + <mark> fragments would each get the gap. */}
      <span className="whitespace-nowrap">{event ? <Highlight text={event} /> : "automatic"}</span>
    </span>
  );
  const tip =
    running && reason ? (
      reason
    ) : canPreview ? (
      <PreviewTip
        event={event}
        follow={target ? modCombo(MOD, "click") : undefined}
        target={targetLabel}
      />
    ) : null;
  return (
    <li
      {...item}
      onFocus={(focusEvent) => {
        item.onFocus(focusEvent);
        // Keyboard focus previews; a programmatic hand-off after a tap doesn't (it would hide the notice).
        if (focusEvent.target === focusEvent.currentTarget)
          setPreview(canPreview && !handoff.active ? event : null, "key");
      }}
      onBlur={(blurEvent) =>
        blurEvent.target === blurEvent.currentTarget && canPreview && setPreview(null)
      }
      onPointerEnter={(pointer) =>
        canPreview && pointer.pointerType === "mouse" && setPreview(event, "pointer")
      }
      onPointerLeave={() => canPreview && setPreview(null)}
      // Content-wide (not cell-wide): the row's hit box is what it shows, so its middle is the route, not blank space.
      className={cn(
        "group/route relative flex w-fit max-w-full min-h-6 items-center ps-4 coarse:min-h-11",
        sendsOnClick && "cursor-pointer",
      )}
    >
      {/* Branch connector: a quarter-round from the owning block down into each route. */}
      <span
        aria-hidden
        className={cn(
          "absolute start-0 top-0 h-3 w-3 rounded-es-[6px] border-s border-b coarse:h-[22px]",
          enabled || taken ? "border-signal/60" : "border-border",
        )}
      />
      {!last && (
        <span
          aria-hidden
          className="absolute start-0 top-3 bottom-0 border-s border-border coarse:top-[22px]"
        />
      )}
      {/* Hang-indent grid: the event sits in column one; guard → target / actions wrap in column two,
          so a continuation line starts under the guard, never under the event badge. */}
      <div
        data-mt-face
        data-sim={inactive ? "inactive" : undefined}
        className={cn(
          "grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-1.5 rounded-[6px] py-0.5 ps-1 pe-1.5 font-mono text-[11px] leading-5 transition-[background-color,color] duration-150",
          flags & FLAG.selected && "bg-muted",
          taken && "bg-signal-muted",
          // While it can send, the row is one button: one hover tint across pill, guard and target.
          sendsOnClick && "group-hover/route:bg-signal-muted",
          flags & FLAG.flash && "mt-flash",
        )}
      >
        <span className="flex items-center gap-1.5">
          {row.recovered && (
            <span
              className="flex items-center gap-1 text-[10px] text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]"
              title="The source state is missing; shown at the machine root"
            >
              <TriangleAlert aria-hidden className="size-3" /> no source
            </span>
          )}
          {tip ? (
            <Tooltip
              open={tipOpen}
              onOpenChange={(open) => {
                // The footer already says "EVENT → target · ⌘-click to open" while it shows the dry run:
                // a second copy floating over the cards only hides them. Narrow footers (and hosts
                // without one) don't show it, so there the pill keeps its tooltip.
                const footerSays =
                  canPreview &&
                  !!pillRef.current
                    ?.closest("[data-slot=machine-tree]")
                    ?.querySelector("[data-mt-preview]")
                    ?.getClientRects().length;
                setTipOpen(open && !footerSays);
              }}
            >
              <TooltipTrigger asChild>{pill}</TooltipTrigger>
              {/* Below the pill: routes hang under the state they leave, so above would cover that card (the live one). */}
              <TooltipContent
                side="bottom"
                align="start"
                sideOffset={4}
                collisionPadding={8}
                className="max-w-72"
              >
                {tip}
              </TooltipContent>
            </Tooltip>
          ) : (
            pill
          )}
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
          {t.guard && (
            <span
              className={cn(
                "whitespace-nowrap",
                blocked
                  ? "text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]"
                  : "text-[color:var(--sim-tag,var(--muted-foreground))]",
              )}
            >
              [<Highlight text={t.guard} />]
            </span>
          )}
          <ArrowRight
            aria-hidden
            className="size-3 shrink-0 self-center text-[color:var(--sim-icon,color-mix(in_oklab,var(--muted-foreground)_70%,transparent))] rtl:rotate-180"
          />
          {/* Not a nested button: the treeitem owns activation (→ then Enter, or ⌘Enter); pointers click it. */}
          <span
            tabIndex={-1}
            data-substop
            dir="auto"
            // The peek is a hover/keyboard preview: a tap has no hover-out, so touch (and pointer focus)
            // never raises one, and a click that sends clears it.
            onPointerEnter={(pointer) =>
              target && pointer.pointerType === "mouse" && setPeek(target.id)
            }
            onPointerLeave={() => setPeek(null)}
            onFocus={(focus) =>
              target && focus.currentTarget.matches(":focus-visible") && setPeek(target.id)
            }
            onBlur={() => setPeek(null)}
            onClick={(e) => {
              e.stopPropagation();
              // The second click of a double-click/double-tap: the first already sent (or followed);
              // acting again would follow the now-disabled route and bury the "fired" sentence.
              if (e.detail > 1) return;
              if (sendsOnClick && !(e.metaKey || e.ctrlKey || e.altKey)) {
                setPeek(null);
                activate(id);
                // The send belongs to the route: focus its treeitem (named, in the roving order), not
                // this nameless inner stop. A hand-off, so the row doesn't start a dry run of its own.
                const owner = e.currentTarget.closest<HTMLElement>("[data-mt-item]");
                if (owner) handoff.focus(owner);
              } else follow(id);
            }}
            className={cn(
              // While simulating the link is only its visible text (no 44px coarse halo), so a tap on the
              // rest of a wide row reaches the row. Idle, following is the route's only action.
              !running && "mt-hit",
              "cursor-pointer rounded-[3px] text-start break-words underline underline-offset-[3px] transition-colors outline-none focus-visible:outline-2 focus-visible:outline-ring",
              !target
                ? "text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))] decoration-warning/50"
                : sendsOnClick
                  ? // Part of the Send button, not a link: plain text, no link colour (⌘-click still opens it).
                    "text-foreground no-underline"
                  : recede
                    ? "text-[color:var(--sim-tag,var(--muted-foreground))] decoration-border hover:text-signal hover:decoration-signal"
                    : "text-signal decoration-signal/30 hover:decoration-signal",
            )}
          >
            <Highlight text={targetLabel} />
          </span>
          {t.actions?.length ? (
            <span className="text-[color:var(--sim-tag,var(--muted-foreground))]">
              / <Highlight text={t.actions.join(", ")} />
            </span>
          ) : null}
          {matchedVia && (
            <span className="text-[10px] text-muted-foreground">· matched {matchedVia}</span>
          )}
          <IssueMark messages={issues.get(id)} />
        </span>
      </div>
    </li>
  );
});

/** Tooltip body for an enabled route: the dry run, computed only once the tooltip opens. */
function PreviewTip({
  event,
  follow,
  target,
}: {
  readonly event: string;
  readonly follow?: string | undefined;
  readonly target: string;
}) {
  const { sim } = useTree();
  const preview = sim.previewOf(event);
  // One column: the tooltip is a flex row, and the follow hint is a second line, not a second cell.
  // Isolated runs, as in the footer: an RTL page must not turn "⌘-click" into "click-⌘".
  return (
    <span className="flex flex-col gap-0.5">
      <span>
        Send <bdi dir="ltr">{event}</bdi>
        {preview && (
          <>
            {" → "}
            <bdi dir="auto">{preview.to.join(", ")}</bdi>
          </>
        )}
      </span>
      {follow && (
        <span className="opacity-70">
          <bdi dir="ltr">{follow}</bdi> to open <bdi dir="auto">{target}</bdi>
        </span>
      )}
    </span>
  );
}
