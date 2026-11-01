import * as React from "react";
import { motion } from "motion/react";
import { ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { inlineToPlain } from "./inline";
import { isCompleted } from "./use-outliner";
import { mirrorOf } from "./mirrors";
import type { OutlinerLabels } from "./labels";
import type { OutlineItem } from "./types";

/**
 * A folded row's summary chip ("2/5 +3"). With tasks inside, it opens the open tasks of the
 * branch, to tick without unfolding (desktop: a popover; touch: a sheet). Each tick is one undo
 * step and the chip's counts follow at once. Without tasks it simply unfolds, as before.
 */
export interface FoldSummaryCounts {
  readonly descendants: number;
  readonly tasks: number;
  readonly done: number;
}

export interface FoldTask {
  readonly id: string;
  readonly node: OutlineItem;
  /** Where it sits under the folded row ("Phase 2 › QA"), empty for a direct child. */
  readonly path: string;
}

/** Tasks inside a branch in document order, by the same rule the summary counts them. */
export function branchTasks(root: OutlineItem): readonly FoldTask[] {
  const out: FoldTask[] = [];
  const walk = (items: readonly OutlineItem[], path: readonly string[]) => {
    for (const node of items) {
      if (node.checked !== undefined || node.data?.completed !== undefined) out.push({ id: node.id, node, path: path.join(" › ") });
      // A mirror's copies are counted at their source, never twice.
      if (node.children && !mirrorOf(node)) walk(node.children, [...path, inlineToPlain(node.text) || "Untitled"]);
    }
  };
  walk(root.children ?? [], []);
  return out;
}

const MAX_LISTED = 40;

export function FoldTasks({
  node,
  summary,
  disabled,
  coarse,
  labels,
  onExpand,
  onToggle,
  isLocked,
  onClose,
}: {
  readonly node: OutlineItem;
  readonly summary: FoldSummaryCounts;
  readonly disabled: boolean;
  readonly coarse: boolean;
  readonly labels: OutlinerLabels;
  readonly onExpand: () => void;
  readonly onToggle: (id: string) => void;
  readonly isLocked: (id: string) => boolean;
  /** Focus goes back to the outline (desktop) when the popover closes. */
  readonly onClose: (event: Event) => void;
}) {
  const [open, setOpen] = React.useState(false);
  /*
   * Which tasks the list shows is decided when it opens: a ticked task stays (checked, so it can
   * be unticked) until the list closes, instead of jumping out from under the pointer.
   */
  const [listed, setListed] = React.useState<readonly string[]>([]);
  const live = React.useMemo(() => (open ? branchTasks(node) : null), [open, node]);
  // While the sheet or popover animates out it keeps its last list (never a "nothing open" frame).
  const kept = React.useRef<readonly FoldTask[]>([]);
  if (live) kept.current = live;
  const tasks = live ?? kept.current;
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const shown = listed.flatMap((id) => (byId.get(id) ? [byId.get(id)!] : []));
  const openCount = tasks.filter((task) => !isCompleted(task.node)).length;
  const progress = summary.tasks ? summary.done / summary.tasks : 0;
  const listRef = React.useRef<HTMLDivElement>(null);

  const show = () => {
    const open = branchTasks(node).filter((task) => !isCompleted(task.node));
    setListed(open.slice(0, MAX_LISTED).map((task) => task.id));
    setOpen(true);
  };
  const chip = (
    <button
      type="button"
      tabIndex={-1}
      data-fold-summary=""
      aria-haspopup={summary.tasks ? "dialog" : undefined}
      aria-expanded={summary.tasks ? open : undefined}
      onClick={(event) => {
        event.stopPropagation();
        if (summary.tasks) show();
        else onExpand();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={
        summary.tasks
          ? labels.summaryTasks(summary.done, summary.tasks, summary.descendants)
          : `Expand ${summary.descendants} hidden item${summary.descendants === 1 ? "" : "s"}`
      }
      title={summary.tasks ? `${labels.tasksDone(summary.done, summary.tasks)} · ${summary.descendants} hidden` : `${summary.descendants} hidden`}
      className={cn(
        "relative ms-2 inline-flex h-[18px] translate-y-[-1px] items-center gap-1.5 rounded-[5px] border border-hairline bg-muted/50 px-1.5 align-middle font-mono text-[10.5px] text-muted-foreground tabular-nums no-underline transition-colors after:absolute after:-inset-1 hover:border-border hover:text-foreground coarse:after:-inset-3",
        open && "border-signal/40 text-foreground",
      )}
    >
      {summary.tasks > 0 ? (
        <span className="flex items-center gap-1.5">
          <span className="relative h-[3px] w-4 overflow-hidden rounded-full bg-foreground/15" aria-hidden>
            <motion.span
              className="absolute inset-y-0 start-0 rounded-full"
              initial={false}
              animate={{ width: `${progress * 100}%`, backgroundColor: progress >= 1 ? "var(--success)" : "var(--signal)" }}
              transition={motionTokens.base}
            />
          </span>
          <motion.span key={summary.done} initial={{ opacity: 0.4, y: -2 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.quick}>
            {summary.done}/{summary.tasks}
          </motion.span>
          {summary.descendants > summary.tasks && <span className="text-muted-foreground/60">+{summary.descendants - summary.tasks}</span>}
        </span>
      ) : (
        <span>{summary.descendants}</span>
      )}
    </button>
  );
  if (!summary.tasks) return chip;

  const header = (
    <div className="flex items-baseline gap-2">
      <span className="min-w-0 flex-1 truncate font-medium">{inlineToPlain(node.text) || labels.untitled}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">{labels.tasksDone(summary.done, summary.tasks)}</span>
    </div>
  );
  const list = (
    <div
      ref={listRef}
      role="group"
      aria-label={labels.openTasks(openCount)}
      className="max-h-[min(50vh,320px)] overflow-y-auto overscroll-contain py-1"
      onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const boxes = [...(listRef.current?.querySelectorAll<HTMLElement>("[role=checkbox]") ?? [])];
        const at = boxes.indexOf(document.activeElement as HTMLElement);
        boxes[Math.max(0, Math.min(boxes.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
      }}
    >
      {shown.length === 0 && <p className="px-3 py-2 text-ui text-muted-foreground">{labels.noOpenTasks}</p>}
      {shown.map((task) => {
        const done = isCompleted(task.node);
        const locked = disabled || isLocked(task.id);
        return (
          <button
            key={task.id}
            type="button"
            role="checkbox"
            aria-checked={done}
            data-fold-task={task.id}
            disabled={locked}
            onClick={() => onToggle(task.id)}
            className="flex w-full items-start gap-2.5 rounded-md px-2.5 py-1.5 text-start text-ui outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 disabled:opacity-50 coarse:min-h-11 coarse:items-center coarse:text-[15px]"
          >
            <span
              aria-hidden
              className={cn(
                "mt-[3px] grid size-[15px] shrink-0 place-items-center rounded-[4px] border transition-[background-color,border-color] duration-150 coarse:mt-0 coarse:size-5",
                done ? "border-signal bg-signal text-signal-foreground" : "border-foreground/30 bg-background",
              )}
            >
              <svg viewBox="0 0 12 12" className="size-2.5">
                <motion.path
                  d="M2.5 6.2 5 8.6 9.6 3.6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={false}
                  animate={{ pathLength: done ? 1 : 0, opacity: done ? 1 : 0 }}
                  transition={motionTokens.quick}
                />
              </svg>
            </span>
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate transition-colors", done && "text-muted-foreground line-through decoration-muted-foreground/60")}>
                {/* Plain words: links and chips would be controls inside a control. */}
                {inlineToPlain(task.node.text) || labels.untitled}
              </span>
              {task.path && <span className="block truncate text-2xs text-muted-foreground">{task.path}</span>}
            </span>
          </button>
        );
      })}
      {openCount > shown.filter((task) => !isCompleted(task.node)).length && (
        <p className="px-3 py-1 font-mono text-2xs text-muted-foreground">{labels.moreTasks(openCount - shown.filter((task) => !isCompleted(task.node)).length)}</p>
      )}
    </div>
  );
  const expand = (
    <button
      type="button"
      onClick={() => {
        setOpen(false);
        onExpand();
      }}
      className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-start text-ui text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted coarse:min-h-11 coarse:text-[15px]"
    >
      <ChevronsUpDown className="size-3.5 coarse:size-[18px]" />
      {labels.showHidden(summary.descendants)}
    </button>
  );
  const focusFirst = (event: Event) => {
    event.preventDefault();
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>("[role=checkbox]:not(:disabled)")?.focus({ preventScroll: true }));
  };

  if (coarse)
    return (
      <>
        {chip}
        <Drawer open={open} onOpenChange={setOpen} autoFocus>
          <DrawerContent
            className="pb-[env(safe-area-inset-bottom)] outline-none"
            data-fold-tasks-sheet=""
            // Touch has no keyboard cursor: the sheet itself takes focus, not a ringed first row.
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              (event.target as HTMLElement | null)?.focus?.({ preventScroll: true });
            }}
          >
            <DrawerHeader className="gap-0 px-4 pt-2 pb-2 text-start! md:text-start">
              <DrawerTitle className="text-[15px]">{header}</DrawerTitle>
              <DrawerDescription className="text-[13px]">{labels.openTasks(openCount)}</DrawerDescription>
            </DrawerHeader>
            <div className="border-t border-hairline px-2">{list}</div>
            <div className="border-t border-hairline px-2 py-1">{expand}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>{chip}</PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={12}
        data-fold-tasks=""
        className="w-80 gap-0 p-1"
        onOpenAutoFocus={focusFirst}
        onCloseAutoFocus={onClose}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-2.5 pt-1.5 pb-1 text-ui">{header}</div>
        <div className="border-y border-hairline">{list}</div>
        <div className="pt-1">{expand}</div>
      </PopoverContent>
    </Popover>
  );
}
