import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Ban,
  ChevronLeft,
  ChevronRight,
  CornerDownRight,
  LogIn,
  LogOut,
  Zap,
} from "lucide-react";
import type { MachineTraceEntry } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { stepCursor, useMachine } from "./machine-context.js";
import { Kbd } from "../components/ui/kbd.js";
import { KEY } from "../machine-shared/machine-copy.js";

/** Trace tab: the step list with replay scrubbing and per-step detail (entered, exited, actions, context diff). */
/** Top-level keys whose values changed between two contexts. */
function contextDiff(
  before: Readonly<Record<string, unknown>> | undefined,
  after: Readonly<Record<string, unknown>> | undefined,
) {
  if (!after) return [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)]);
  return [...keys]
    .filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after[k]))
    .map((k) => [k, before?.[k], after[k]] as const);
}
const show = (value: unknown) => (value === undefined ? "—" : JSON.stringify(value));

export function TracePanel() {
  const mv = useMachine();
  const trace = mv.snapshot?.trace ?? [];
  const [open, setOpen] = React.useState<number | null>(null);
  const list = React.useRef<HTMLOListElement>(null);
  const idPrefix = React.useId();
  if (!mv.snapshot)
    return (
      <p className="text-[12px] text-muted-foreground">
        <bdi>Start a simulation to record a trace.</bdi>
      </p>
    );
  const label = (id: string) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id;
  const current = mv.cursor ?? trace.length - 1;
  const select = (index: number) =>
    mv.setCursor(index >= trace.length - 1 ? null : Math.max(0, index));
  const context = (entry: MachineTraceEntry, index: number) =>
    index === trace.length - 1
      ? mv.snapshot!.context
      : mv.steps.current.get(entry.sequence)?.context;
  return (
    <>
      <div className="mb-3 flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Previous step"
          disabled={current <= 0}
          onClick={() => stepCursor(mv, -1)}
          className="coarse:size-11"
        >
          <ChevronLeft className="rtl:-scale-x-100" />
        </Button>
        <input
          type="range"
          aria-label="Replay position"
          aria-valuetext={`Step ${current + 1} of ${trace.length}`}
          min={0}
          max={Math.max(0, trace.length - 1)}
          value={current}
          onChange={(event) => select(Number(event.target.value))}
          className="mx-1 h-1 flex-1 cursor-pointer accent-[var(--signal)]"
        />
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Next step"
          disabled={current >= trace.length - 1}
          onClick={() => stepCursor(mv, 1)}
          className="coarse:size-11"
        >
          <ChevronRight className="rtl:-scale-x-100" />
        </Button>
        <span className="w-12 text-end font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {current + 1}/{trace.length}
        </span>
      </div>
      {mv.cursor !== null && (
        <button
          type="button"
          onClick={() => mv.setCursor(null)}
          className="mb-2 flex w-full items-center justify-between rounded-md bg-signal-muted px-2.5 py-1.5 text-start text-[11.5px] text-signal"
        >
          Viewing a past step. Return to live.{" "}
          <Kbd className="h-4 min-w-4 px-1 text-[9.5px]">{KEY.escape}</Kbd>
        </button>
      )}
      <ol
        ref={list}
        role="listbox"
        aria-label="Trace steps"
        aria-activedescendant={`${idPrefix}-step-${current}`}
        tabIndex={0}
        onKeyDown={(event) => {
          const keys: Record<string, number> = {
            ArrowUp: current - 1,
            ArrowLeft: current - 1,
            ArrowDown: current + 1,
            ArrowRight: current + 1,
            Home: 0,
            End: trace.length - 1,
          };
          if (event.key in keys) {
            event.preventDefault();
            event.stopPropagation();
            select(keys[event.key]!);
          } else if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(open === current ? null : current);
          } else if (event.key === "Escape" && mv.cursor !== null) {
            event.preventDefault();
            event.stopPropagation();
            mv.setCursor(null);
          }
        }}
        className="relative rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {trace.map((entry, index) => {
          const selected = index === current;
          const expanded = open === index;
          const blocked = mv.blocked.filter((b) => b.after === entry.sequence);
          const diff =
            index > 0
              ? contextDiff(context(trace[index - 1]!, index - 1), context(entry, index))
              : [];
          const payload = mv.steps.current.get(entry.sequence)?.payload;
          return (
            <li
              key={entry.sequence}
              id={`${idPrefix}-step-${index}`}
              role="option"
              aria-selected={selected}
              className="relative ps-5"
            >
              <span
                className={cn(
                  "absolute start-[6px] top-0 bottom-0 w-px",
                  index === trace.length - 1 && !blocked.length
                    ? "bg-gradient-to-b from-border to-transparent"
                    : "bg-border",
                )}
              />
              <span
                className={cn(
                  "absolute start-[3px] top-[11px] size-[7px] rounded-full border transition-colors",
                  selected ? "border-signal bg-signal" : "border-foreground/30 bg-surface",
                )}
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => {
                  select(index);
                  setOpen(expanded ? null : index);
                  list.current?.focus();
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-1.5 py-1.5 text-start transition-colors hover:bg-muted/60 coarse:min-h-11",
                  selected && "bg-muted/70",
                )}
              >
                <span className="font-mono text-[11px] font-semibold">
                  {index === 0 ? "start" : entry.event}
                </span>
                <CornerDownRight className="size-3 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">
                  {entry.activeIds.map(label).join(", ")}
                </span>
                {diff.length > 0 && (
                  <span className="shrink-0 font-mono text-[9.5px] text-warning">
                    Δ{diff.length}
                  </span>
                )}
                <ChevronRight
                  className={cn(
                    "size-3 shrink-0 text-muted-foreground transition-transform",
                    expanded && "rotate-90",
                  )}
                />
              </button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={motionTokens.quick}
                    className="overflow-hidden"
                  >
                    <dl className="mb-2 ms-1.5 grid gap-1 rounded-md border border-hairline p-2 font-mono text-[10.5px]">
                      {payload !== undefined && (
                        <div className="flex gap-1.5">
                          <span className="text-muted-foreground">payload</span>{" "}
                          <span className="min-w-0 break-all">{JSON.stringify(payload)}</span>
                        </div>
                      )}
                      {entry.exited.length > 0 && (
                        <div className="flex gap-1.5">
                          <LogOut className="mt-px size-3 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">exit</span>{" "}
                          {entry.exited.map(label).join(", ")}
                        </div>
                      )}
                      {entry.entered.length > 0 && (
                        <div className="flex gap-1.5">
                          <LogIn className="mt-px size-3 shrink-0 text-signal" />
                          <span className="text-muted-foreground">enter</span>{" "}
                          {entry.entered.map(label).join(", ")}
                        </div>
                      )}
                      {entry.actions.length > 0 && (
                        <div className="flex gap-1.5">
                          <Zap className="mt-px size-3 shrink-0 text-warning" />
                          <span className="text-muted-foreground">run</span>{" "}
                          {entry.actions.join(", ")}
                        </div>
                      )}
                      {diff.map(([key, before, after]) => (
                        <div key={key} className="flex flex-wrap gap-1.5">
                          <span className="text-muted-foreground">ctx.{key}</span>
                          <span className="text-muted-foreground line-through decoration-foreground/30">
                            {show(before)}
                          </span>
                          <ArrowRight className="mt-px size-3 text-muted-foreground rtl:-scale-x-100" />
                          <span>{show(after)}</span>
                        </div>
                      ))}
                      {entry.note && <div className="text-muted-foreground">{entry.note}</div>}
                      {!entry.exited.length &&
                        !entry.entered.length &&
                        !entry.actions.length &&
                        !entry.note &&
                        !diff.length && <div className="text-muted-foreground">No change</div>}
                    </dl>
                  </motion.div>
                )}
              </AnimatePresence>
              {blocked.map((b, i) => (
                <div
                  key={i}
                  className="mb-1 ms-1.5 flex items-start gap-1.5 rounded-md border border-dashed border-warning/40 px-1.5 py-1 font-mono text-[10.5px]"
                >
                  <Ban className="mt-0.5 size-3 shrink-0 text-warning" />
                  <span className="font-semibold">{b.event}</span>
                  <span
                    className="min-w-0 break-words text-muted-foreground"
                    title={
                      b.payload !== undefined ? `payload ${JSON.stringify(b.payload)}` : undefined
                    }
                  >
                    blocked — {b.reason}
                  </span>
                </div>
              ))}
            </li>
          );
        })}
      </ol>
    </>
  );
}
