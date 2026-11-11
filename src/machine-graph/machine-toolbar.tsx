import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group.js";
import {
  ArrowLeftRight,
  ArrowUpDown,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Box,
  Eye,
  Keyboard,
  MoreHorizontal,
  PanelRight,
  Pause,
  Play,
  Redo2,
  RotateCcw,
  Square,
  Undo2,
  Wand2,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { Separator } from "../components/ui/separator.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import { useShortcutLabel } from "../lib/platform.js";
import { KEY } from "../machine-shared/machine-copy.js";
import {
  countStates,
  countTransitions,
  plural,
  useMachine,
  useMachineChrome,
} from "./machine-context.js";

/* ───────────────────────────── Toolbar ───────────────────────────── */

export function MachineToolbar({ toolbarStart }: { readonly toolbarStart?: React.ReactNode }) {
  const shortcut = useShortcutLabel();
  const mv = useMachine();
  const chrome = useMachineChrome();
  const simulating = mv.mode === "simulate";
  const layoutTools = mv.mode === "design" && mv.editable;
  // Orientation is view state: read-only views may flip it too, unless that would drop manual positions (an edit).
  const canFlip = !simulating && (mv.editable || mv.pinnedCount === 0);
  const saving = useSaving();
  return (
    <div
      data-mv-toolbar=""
      className="relative flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-2 coarse:h-12"
    >
      {/* A slow controlled host is thinking: a 1px hairline, only after 150 ms so fast hosts never flash it. */}
      {saving && (
        <span
          aria-hidden
          data-mv-saving
          className="mv-saving pointer-events-none absolute inset-x-0 -bottom-px h-px overflow-hidden"
        />
      )}
      {toolbarStart}
      <MachinePath />
      <ModeSwitch />
      <div className="ms-auto flex items-center gap-0.5">
        <ToolButton
          label="Machine commands"
          kbd={shortcut("mod", "K")}
          onClick={chrome.showCommands}
        >
          <Keyboard />
        </ToolButton>
        {/* Phones reserve this two-button slot (Undo/Redo, or Restart/Stop) even while it is empty, so
            the first edit or a mode switch never shoves the mode switch out from under the thumb. */}
        <div
          className={cn(
            "flex items-center justify-end gap-0.5",
            chrome.compact && "min-w-[58px] coarse:min-w-[90px]",
          )}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {simulating ? (
              <motion.div
                key="sim"
                initial={{ opacity: 0, x: 6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 6 }}
                transition={motionTokens.quick}
                className="flex items-center gap-0.5"
              >
                <ToolButton label="Restart simulation" onClick={mv.start}>
                  <RotateCcw />
                </ToolButton>
                <ToolButton label="Stop simulation" kbd={KEY.escape} onClick={mv.stop}>
                  <Square className="fill-current" />
                </ToolButton>
              </motion.div>
            ) : (
              // Undo/Redo always fill the slot while editing, disabled until there is history (on phones
              // too: the slot is reserved anyway, so honest disabled buttons beat a blank gap). A
              // read-only view has no history to walk, so it never shows them.
              mv.editable && (
                <motion.div
                  key="design"
                  initial={{ opacity: 0, x: 6 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 6 }}
                  transition={motionTokens.quick}
                  className="flex items-center gap-0.5"
                >
                  <ToolButton
                    label="Undo"
                    kbd={shortcut("mod", "Z")}
                    disabled={!mv.canUndo}
                    onClick={mv.undo}
                  >
                    <Undo2 />
                  </ToolButton>
                  <ToolButton
                    label="Redo"
                    kbd={shortcut("mod", "shift", "Z")}
                    disabled={!mv.canRedo}
                    onClick={mv.redo}
                  >
                    <Redo2 />
                  </ToolButton>
                </motion.div>
              )
            )}
          </AnimatePresence>
        </div>
        {!chrome.compact && (
          <>
            {/* The separator splits history from layout; with no history (read-only) there is nothing to split. */}
            {mv.editable && <Separator orientation="vertical" className="mx-1 h-4" />}
            <ToolButton
              label={mv.direction === "LR" ? "Lay out top to bottom" : "Lay out left to right"}
              disabled={!canFlip}
              onClick={() => mv.setDirection(mv.direction === "LR" ? "TB" : "LR")}
            >
              {mv.direction === "LR" ? <ArrowUpDown /> : <ArrowLeftRight />}
            </ToolButton>
            {mv.editable && (
              <ToolButton
                label={
                  mv.pinnedCount ? `Auto layout (resets ${mv.pinnedCount} moved)` : "Auto layout"
                }
                disabled={!layoutTools}
                onClick={mv.autoLayout}
              >
                <Wand2 />
              </ToolButton>
            )}
          </>
        )}
        <MoreMenu />
        {/* Phones: the peek bar opens the inspector, so the toolbar spends no slot on it. */}
        {!chrome.compact && (
          <ToolButton
            label={chrome.panelOpen ? "Hide inspector" : "Show inspector"}
            onClick={() => chrome.setPanelOpen(!chrome.panelOpen)}
            pressed={chrome.panelOpen}
          >
            <PanelRight />
          </ToolButton>
        )}
      </div>
    </div>
  );
}

/** Breadcrumb through submachines; the last crumb switches to any machine in the document. */
function MachinePath() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  const crumbs = chrome.compact ? mv.path.slice(-1) : mv.path;
  const offset = mv.path.length - crumbs.length;
  return (
    // Phones: the title takes all the room the toolbar leaves and ellipsizes only when it truly overflows.
    <nav
      aria-label="Machine path"
      className={cn("flex min-w-0 items-center gap-0.5", chrome.compact && "flex-1")}
    >
      {crumbs.map((id, i) => {
        const index = i + offset;
        const machine = mv.machines.find((m) => m.id === id);
        const last = index === mv.path.length - 1;
        if (last && mv.machines.length > 1)
          return (
            <React.Fragment key={id + index}>
              {index > 0 && (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Machine: ${machine?.label ?? id}. Switch machine`}
                    className="flex h-7 min-w-0 items-center gap-1 rounded-md px-1.5 font-medium transition-colors hover:bg-muted data-[state=open]:bg-muted coarse:h-11"
                  >
                    <span
                      className={cn("truncate", !chrome.compact && "max-w-44")}
                      title={machine?.label ?? id}
                    >
                      {machine?.label ?? id}
                    </span>
                    <ChevronsUpDown className="size-3 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-2xs tracking-wide text-muted-foreground uppercase">
                    Machines in this document
                  </DropdownMenuLabel>
                  {mv.machines.map((m) => (
                    <DropdownMenuItem
                      key={m.id}
                      onSelect={() => mv.switchMachine(m.id)}
                      className="gap-2 text-ui"
                    >
                      <Check
                        className={cn(
                          "size-3.5",
                          m.id === mv.machineId ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <span className="min-w-0 flex-1 truncate">{m.label}</span>
                      {m.id === mv.document.rootId && (
                        <span className="rounded-[4px] bg-muted px-1 font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
                          root
                        </span>
                      )}
                      <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                        {countStates(m)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </React.Fragment>
          );
        return (
          <React.Fragment key={id + index}>
            {index > 0 && (
              <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
            )}
            <button
              type="button"
              onClick={() => mv.goToMachine(index)}
              aria-current={last ? "page" : undefined}
              title={machine?.label ?? id}
              className={cn(
                "h-7 min-w-0 truncate rounded-md px-1.5 transition-colors hover:bg-muted coarse:h-11",
                !chrome.compact && "max-w-44",
                last ? "font-medium" : "text-muted-foreground",
              )}
            >
              {machine?.label ?? id}
            </button>
          </React.Fragment>
        );
      })}
    </nav>
  );
}

/** A single roving tab stop for the mode controls. */
function ModeSwitch() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  return (
    <ToggleGroup
      value={[mv.mode]}
      onValueChange={(value) => {
        if (value[0] === "design" || value[0] === "simulate" || value[0] === "inspect")
          mv.setMode(value[0]);
      }}
      aria-label="Mode"
      className={cn(
        "flex items-center rounded-lg border bg-muted/50 p-0.5",
        chrome.compact ? "ms-1" : "absolute start-1/2 -translate-x-1/2 rtl:translate-x-1/2",
      )}
    >
      {(
        [
          // Read-only: the first mode only looks, so it says so.
          mv.canEdit ? (["design", "Design", Box] as const) : (["design", "View", Eye] as const),
          ...(mv.inspection.session ? [["inspect", "Inspect run", Eye] as const] : []),
          ["simulate", "Simulate", Play] as const,
        ] as const
      ).map(([id, label, Icon]) => {
        const active = mv.mode === id;
        return (
          <ToggleGroupItem
            key={id}
            value={id}
            aria-label={label}
            className={cn(
              "relative flex h-7 items-center gap-1.5 rounded-md px-2.5 text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 coarse:h-11 coarse:px-3",
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {active && (
              <motion.span
                layoutId={`machine-mode-${mv.document.rootId}`}
                transition={motionTokens.layout}
                className="absolute inset-0 rounded-md border border-border bg-background shadow-[0_1px_1px_rgb(0_0_0/0.04)]"
              />
            )}
            <Icon className="relative size-3.5" />
            <span className={cn("relative", chrome.compact && "sr-only")}>{label}</span>
          </ToggleGroupItem>
        );
      })}
    </ToggleGroup>
  );
}

function MoreMenu() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  const layoutTools = mv.mode === "design" && mv.editable;
  const canFlip = mv.mode === "design" && (mv.editable || mv.pinnedCount === 0);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="More actions"
              className="coarse:size-11"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>More</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56">
        {chrome.compact && (
          <>
            <DropdownMenuItem
              disabled={!canFlip}
              onSelect={() => mv.setDirection(mv.direction === "LR" ? "TB" : "LR")}
              className="text-ui"
            >
              {mv.direction === "LR" ? <ArrowUpDown /> : <ArrowLeftRight />}{" "}
              {mv.direction === "LR" ? "Top to bottom" : "Left to right"}
            </DropdownMenuItem>
            {mv.editable && (
              <DropdownMenuItem
                disabled={!layoutTools}
                onSelect={mv.autoLayout}
                className="text-ui"
              >
                <Wand2 /> Auto layout
              </DropdownMenuItem>
            )}
            {mv.editable && <DropdownMenuSeparator />}
          </>
        )}
        {!chrome.compact && (
          <DropdownMenuCheckboxItem
            checked={chrome.minimap}
            onCheckedChange={(on) => chrome.setMinimap(!!on)}
            className="text-ui"
          >
            Minimap
          </DropdownMenuCheckboxItem>
        )}
        {/* A touch-only device has no keyboard to take shortcuts from (a tablet with one is a fine pointer too). */}
        <DropdownMenuItem onSelect={chrome.showShortcuts} className="text-ui coarse:hidden">
          <Keyboard /> Keyboard shortcuts{" "}
          <span className="ms-auto font-mono text-[10px] text-muted-foreground">?</span>
        </DropdownMenuItem>
        {mv.editable && (
          <>
            <DropdownMenuSeparator className="coarse:hidden" />
            <DropdownMenuItem
              disabled={!mv.canReset}
              onSelect={mv.resetDocument}
              className="text-ui"
            >
              <RotateCcw /> Reset document
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ToolButton({
  label,
  kbd,
  pressed,
  children,
  side,
  className,
  ...props
}: React.ComponentProps<typeof Button> & {
  readonly label: string;
  readonly kbd?: string;
  readonly pressed?: boolean;
  readonly side?: "top" | "right" | "bottom" | "left";
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          aria-pressed={pressed}
          className={cn("coarse:size-11", pressed && "bg-muted text-foreground", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side}>
        {label} {kbd && <Kbd dir="ltr">{kbd}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  const shortcut = useShortcutLabel();
  // Each row: its keys (one cap per key or combination, the same glyph vocabulary as the tree's
  // palette), or plain prose for a gesture. Prose is never set in a key cap.
  const rows: readonly (readonly [string, readonly string[] | { readonly prose: string }])[] = [
    ["Undo / redo", [shortcut("mod", "Z"), shortcut("mod", "shift", "Z")]],
    ["Delete selection", [KEY.delete]],
    ["Select focused state or edge", [KEY.enter]],
    ["Rename selected state", [KEY.enter, "F2"]],
    ["Move selected state (⇧ larger)", [KEY.left, KEY.up, KEY.right, KEY.down]],
    ["Add a connected state", ["A"]],
    ["Fit selection (or all)", ["F"]],
    ["Deselect · close sheet · back to live", [KEY.escape]],
    ["Step the trace (simulate)", [KEY.left, KEY.right]],
    ["Re-target a transition", { prose: "drag its arrowhead" }],
    ["Move between nodes", [KEY.tab]],
  ];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-[14px]">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-[12px]">
            Active while the machine view has focus or the pointer.
          </DialogDescription>
        </DialogHeader>
        <dl className="divide-y divide-hairline rounded-lg border">
          {rows.map(([label, keys]) => (
            <div key={label} className="flex h-8 items-center justify-between gap-3 px-2.5 text-ui">
              <dt className="text-muted-foreground">{label}</dt>
              <dd dir="ltr" className="flex shrink-0 items-center gap-1">
                {"prose" in keys ? (
                  <span className="text-[12px] text-muted-foreground">{keys.prose}</span>
                ) : (
                  keys.map((key) => <Kbd key={key}>{key}</Kbd>)
                )}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Status bar ───────────────────────────── */

/** True while a controlled host has proposals unanswered for more than 150 ms. */
function useSaving() {
  const pending = useMachine().pendingChanges > 0;
  const [late, setLate] = React.useState(false);
  React.useEffect(() => {
    if (!pending) return setLate(false);
    const timer = window.setTimeout(() => setLate(true), SAVING_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return pending && late;
}
const SAVING_DELAY_MS = 150;

export function MachineStatusBar() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  const errors = mv.issues.filter((i) => i.severity === "error").length;
  const warnings = mv.issues.length - errors;
  const leafs = [...mv.leafIds].map((id) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id);
  // Phones with the peek bar showing: it already names the live states and "done", so the
  // status bar keeps only the mode word and validity (one "done" on screen, not two).
  const peekShowing = chrome.compact && !chrome.panelOpen;
  const saving = useSaving();
  const status =
    mv.mode === "inspect"
      ? `${mv.inspection.historical ? "history" : "observing"} · ${mv.inspection.session?.connection ?? "unavailable"}`
      : mv.snapshot
        ? mv.cursor !== null
          ? `replay ${mv.cursor + 1}/${mv.snapshot.trace.length}`
          : mv.snapshot.status === "done"
            ? peekShowing
              ? "simulation ended"
              : "done"
            : "simulating"
        : mv.editable
          ? mv.mode
          : "view";
  // Every piece is bidi-isolated (`dir="auto"`): "6 states" never renders as "states 6" in RTL.
  return (
    <div
      data-mv-statusbar
      className="flex h-7 shrink-0 items-center gap-3 border-t border-hairline bg-muted/30 px-3 font-mono text-[10.5px] text-muted-foreground tabular-nums"
    >
      <span className="flex shrink-0 items-center gap-1.5">
        <span
          className={cn(
            "size-1.5 rounded-full",
            mv.snapshot
              ? mv.snapshot.status === "done"
                ? "bg-success"
                : "bg-signal"
              : "bg-muted-foreground/50",
          )}
        />
        <span dir="auto">{status}</span>
      </span>
      {mv.snapshot && !peekShowing && (
        <span dir="auto" className="min-w-0 truncate text-foreground/80">
          {leafs.join(" · ")}
        </span>
      )}
      {!chrome.compact && <span dir="auto">{plural(countStates(mv.graph), "state")}</span>}
      {!chrome.compact && (
        <span dir="auto">{plural(countTransitions(mv.graph), "transition")}</span>
      )}
      {!chrome.compact && mv.pinnedCount > 0 && <span dir="auto">{mv.pinnedCount} moved</span>}
      {saving && (
        <span
          dir="auto"
          data-mv-saving
          className="shrink-0 animate-in text-foreground/70 fade-in-0 duration-200"
        >
          saving…
        </span>
      )}
      <span
        dir="auto"
        className={cn(
          "ms-auto shrink-0",
          errors ? "text-destructive" : warnings ? "text-warning" : "",
        )}
      >
        {errors || warnings
          ? [
              errors ? `${errors} error${errors === 1 ? "" : "s"}` : "",
              warnings ? `${warnings} warning${warnings === 1 ? "" : "s"}` : "",
            ]
              .filter(Boolean)
              .join(" · ")
          : "valid"}
      </span>
      {mv.playing && (
        <span className="flex shrink-0 items-center gap-1 text-signal">
          <Pause className="size-3" /> playing
        </span>
      )}
      {/* Phones: the canvas has no free corner for React Flow's MIT attribution, so it lives here. */}
      {chrome.compact && (
        <a
          href="https://reactflow.dev"
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-[9.5px] text-muted-foreground/80 transition-colors hover:text-foreground"
        >
          React Flow
        </a>
      )}
      {!chrome.compact && mv.mode === "design" && (
        <button
          type="button"
          onClick={chrome.showShortcuts}
          className="flex shrink-0 items-center gap-1 transition-colors hover:text-foreground"
          aria-label="Keyboard shortcuts"
        >
          <Kbd className="h-4 min-w-4 px-1 text-[9.5px]">?</Kbd>
        </button>
      )}
    </div>
  );
}
