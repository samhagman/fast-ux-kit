import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  ListChecks,
  LocateFixed,
  MoreHorizontal,
  PanelRight,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { machineTreeAncestors, type MachineTreeModel, type MachineTreeRow } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { Popover, PopoverContent, PopoverTrigger } from "../components/ui/popover.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import { useTreeBase } from "./machine-tree-controller.js";
import { useTreeLayout } from "./machine-tree-layout.js";
import { plural } from "./machine-tree-logic.js";
import { useTreeNavigation } from "./machine-tree-navigation.js";
import { IconButton } from "./machine-tree-primitives.js";
import { useTreeSimulation } from "./machine-tree-run.js";
import { useShortcutLabel } from "../lib/platform.js";

/** Selected path (or a quiet hint), diagnostics, find, go to, fold all, panel toggle. */
export function MachineTreeToolbar() {
  const { rows, topology, model } = useTreeBase();
  const layout = useTreeLayout();
  const nav = useTreeNavigation();
  const run = useTreeSimulation();
  const shortcut = useShortcutLabel();
  const ctl = {
    ...layout,
    ...nav,
    scenarios: run.scenarios,
    runAllScenarios: run.runAllScenarios,
    sim: run.sim,
  };
  const { selected, reveal, query, back, setBack } = nav;
  const crumbs =
    selected && rows.has(selected)
      ? [...machineTreeAncestors(topology, selected), selected].map((id) => rows.get(id)!)
      : null;
  // On a phone, an open find field takes the whole row: no truncated hint or crumb beside it.
  const findTakesRow = ctl.findVisible && ctl.isPhone;
  return (
    <div
      data-mt-toolbar=""
      className="flex h-11 shrink-0 items-center gap-1.5 border-b border-hairline px-3 coarse:h-13 max-sm:gap-0.5 max-sm:px-2"
    >
      <div
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1 overflow-hidden",
          findTakesRow && "hidden",
        )}
      >
        {/* "Back to …" after following a route: docked at the start of the path it left, so it never
            floats over a card (the canvas has no overlay of its own). Cleared by a send or a new run. */}
        <AnimatePresence initial={false}>
          {back && (
            <motion.span
              key={back.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={motionTokens.quick}
              className="flex shrink-0 items-center gap-1"
            >
              <button
                type="button"
                aria-label={`Back to ${back.label}`}
                onClick={() => {
                  const id = back.id;
                  setBack(null);
                  reveal(id);
                }}
                className="flex h-6 max-w-40 items-center gap-1 rounded-full border border-hairline bg-background ps-1.5 pe-2 text-[12px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground coarse:h-11 coarse:max-w-32 coarse:px-3"
              >
                <ArrowLeft aria-hidden className="size-3.5 shrink-0 rtl:rotate-180" />
                <span dir="auto" className="min-w-0 truncate">
                  {back.label}
                </span>
              </button>
              {(crumbs || !ctl.findVisible) && (
                <span aria-hidden className="mx-0.5 h-4 w-px bg-border" />
              )}
            </motion.span>
          )}
        </AnimatePresence>
        {crumbs ? (
          <nav aria-label="Selected path" className="flex min-w-0 flex-1 items-center gap-0.5">
            {crumbs.map((row, index) => (
              <React.Fragment key={row.id}>
                {/* Phones show parent › leaf: enough context for a transition, without the full path. */}
                {index > 0 && (
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      "size-3 shrink-0 text-muted-foreground/60 rtl:-scale-x-100",
                      index < crumbs.length - 1 && "max-sm:hidden",
                    )}
                  />
                )}
                <button
                  type="button"
                  dir="auto"
                  onClick={() => reveal(row.id)}
                  aria-current={index === crumbs.length - 1 ? "location" : undefined}
                  className={cn(
                    "min-w-0 truncate rounded-[5px] px-1 py-0.5 transition-colors hover:bg-muted coarse:min-h-11 coarse:min-w-11",
                    // The leaf is the point: it keeps its width (up to 60 %) and the parent truncates first.
                    index === crumbs.length - 1
                      ? "shrink-[0.25] font-medium text-foreground max-sm:max-w-[60%] max-sm:shrink-0"
                      : "text-muted-foreground",
                    index < crumbs.length - 2 && "max-sm:hidden",
                    row.kind === "transition" && "font-mono text-[11.5px]",
                  )}
                >
                  {row.kind === "transition" && !row.transition?.event ? "automatic" : row.label}
                </button>
              </React.Fragment>
            ))}
          </nav>
        ) : ctl.findVisible ? null : (
          <span className="truncate px-1 text-[12px] text-muted-foreground">
            <span className="coarse:hidden">
              Select a state to see its path
              {/* Only promise the shortcuts once they will actually be captured, and not while find is open. */}
              {ctl.findLive && (
                <>
                  {" · "}
                  <Kbd dir="ltr">{shortcut("mod", "K")}</Kbd> to go to
                </>
              )}
            </span>
            <span className="hidden coarse:inline">Tap a state to see its path</span>
          </span>
        )}
      </div>
      {model.issues.length > 0 && !findTakesRow && (
        <Diagnostics
          model={model}
          rows={rows}
          onReveal={reveal}
          open={ctl.diagnosticsOpen}
          onOpenChange={ctl.setDiagnosticsOpen}
        />
      )}
      <AnimatePresence initial={false} mode="popLayout">
        {ctl.findVisible ? (
          <motion.div
            key="search"
            initial={{ opacity: 0, width: 32 }}
            animate={{ opacity: 1, width: findTakesRow ? "100%" : "min(18rem, 56vw)" }}
            exit={{ opacity: 0, width: 32 }}
            transition={motionTokens.base}
            className={cn(
              "flex h-8 items-center overflow-hidden rounded-md border bg-background focus-within:border-signal/60 focus-within:ring-3 focus-within:ring-signal/15 coarse:h-11",
              findTakesRow && "min-w-0 flex-1",
            )}
          >
            <Search aria-hidden className="ms-2 size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={ctl.inputRef}
              autoFocus={!query}
              value={query}
              onChange={(event) => ctl.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  ctl.goMatch(event.shiftKey ? -1 : 1);
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  ctl.closeSearch(true);
                } else if (event.key === "ArrowDown" && ctl.currentMatch) {
                  event.preventDefault();
                  ctl.focusRow(ctl.currentMatch);
                }
              }}
              name="machine-tree-find"
              autoComplete="off"
              placeholder="Find state, event, guard…"
              aria-label="Find state or event"
              aria-describedby={query ? ctl.countId : undefined}
              className="h-full min-w-0 flex-1 bg-transparent px-2 outline-none placeholder:text-muted-foreground/70"
            />
            {query && (
              <span
                id={ctl.countId}
                aria-live="polite"
                className="me-0.5 shrink-0 font-mono text-[10.5px] whitespace-nowrap text-muted-foreground tabular-nums"
              >
                <bdi>
                  {ctl.matchIds.length ? `${ctl.matchPosition + 1}/${ctl.matchIds.length}` : "0"}
                </bdi>
              </span>
            )}
            {ctl.matchIds.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous match"
                  onClick={() => ctl.goMatch(-1)}
                  className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-muted coarse:size-11"
                >
                  <ChevronUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Next match"
                  onClick={() => ctl.goMatch(1)}
                  className="grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-muted coarse:size-11"
                >
                  <ChevronDown className="size-3.5" />
                </button>
              </>
            )}
            <button
              type="button"
              aria-label="Close search"
              onClick={() => ctl.closeSearch(true)}
              className="me-1 grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-muted coarse:me-0 coarse:size-11"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="btn"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <IconButton label="Find" kbd={shortcut("mod", "F")} onClick={ctl.openSearch}>
              <Search />
            </IconButton>
          </motion.div>
        )}
      </AnimatePresence>
      <IconButton
        label="Go to state"
        kbd={shortcut("mod", "K")}
        className="max-sm:hidden"
        onClick={() => ctl.setGotoOpen(true)}
      >
        <LocateFixed />
      </IconButton>
      <IconButton label="Collapse all" className="max-sm:hidden" onClick={ctl.collapseAll}>
        <ChevronsDownUp />
      </IconButton>
      <IconButton label="Expand all" className="max-sm:hidden" onClick={ctl.expandAll}>
        <ChevronsUpDown />
      </IconButton>
      {/* Phones: the same commands behind one overflow button (non-modal: the tree stays live). */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="More"
            className={cn("sm:hidden coarse:size-11", findTakesRow && "hidden")}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48" data-mt-portal="">
          <DropdownMenuItem className="coarse:min-h-11" onSelect={() => ctl.setGotoOpen(true)}>
            <LocateFixed /> Go to state…
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="coarse:min-h-11" onSelect={ctl.collapseAll}>
            <ChevronsDownUp /> Collapse all
          </DropdownMenuItem>
          <DropdownMenuItem className="coarse:min-h-11" onSelect={ctl.expandAll}>
            <ChevronsUpDown /> Expand all
          </DropdownMenuItem>
          {ctl.scenarios.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="coarse:min-h-11" onSelect={() => ctl.runAllScenarios()}>
                <ListChecks /> Run all scenarios
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <IconButton
        label={ctl.panel ? "Hide panel" : "Show panel"}
        pressed={ctl.panel}
        onClick={() => {
          if (ctl.panel) return ctl.setPanel(false);
          // Opening the panel mid-run with nothing selected lands on the run (on a phone: at the peek, tree visible above).
          if (ctl.sim.snapshot && !ctl.selected) ctl.openPanel("simulation");
          else ctl.openPanel(ctl.panelTab);
        }}
      >
        <PanelRight className="rtl:-scale-x-100" />
      </IconButton>
    </div>
  );
}

/* ───────────────────────────── Diagnostics ───────────────────────────── */

export function Diagnostics({
  model,
  rows,
  onReveal,
  open,
  onOpenChange,
}: {
  readonly model: MachineTreeModel;
  readonly rows: ReadonlyMap<string, MachineTreeRow>;
  readonly onReveal: (id: string) => void;
  /** Controlled so other parts (the error card's "See diagnostics") can open it. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-6 shrink-0 items-center gap-1 rounded-full border border-warning/40 bg-[color-mix(in_oklab,var(--warning)_10%,var(--surface))] px-2 font-mono text-[10.5px] text-foreground/80 transition-colors hover:bg-[color-mix(in_oklab,var(--warning)_18%,var(--surface))] coarse:h-11"
        >
          <TriangleAlert aria-hidden className="size-3 text-warning" />
          <bdi>{plural(model.issues.length, "diagnostic")}</bdi>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" data-mt-portal="">
        <div className="border-b border-hairline px-3 py-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          Document diagnostics
        </div>
        <ul className="max-h-72 overflow-auto p-1">
          {model.issues.map((issue, index) => {
            const row = issue.rowId ? rows.get(issue.rowId) : undefined;
            return (
              <li key={index}>
                <button
                  type="button"
                  disabled={!row}
                  onClick={() => {
                    if (!row) return;
                    onOpenChange(false);
                    onReveal(row.id);
                  }}
                  className="grid w-full gap-0.5 rounded-md px-2 py-1.5 text-start transition-colors enabled:hover:bg-muted coarse:min-h-11"
                >
                  <span className="text-[12px] leading-4">{issue.message}</span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {issue.code}
                    {row && (
                      <>
                        {" · "}
                        <span dir="auto" className="text-signal">
                          {row.label}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
