import * as React from "react";
import { AnimatePresence, animate, motion, useDragControls, useMotionValue, useReducedMotion, type PanInfo } from "motion/react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

/**
 * The phone inspector sheet, shared by Machine View and Machine Tree so the two can't drift.
 *
 * A plain, NON-modal bottom section (role="complementary"), not a dialog: no scrim, no focus
 * trap, no inert or aria-hidden anywhere, so the canvas or tree above it stays live for taps,
 * Tab and screen readers. It docks inside whatever positioned box it is rendered in.
 *
 *   ┌──────────────────────────────────────────┐
 *   │            ▬▬  (grab pill, decorative)    │ ← one 44px bar: the whole bar drags the sheet
 *   │ Inspect  Run  Trace  Issues      ⌃    ×  │   (tabs too: a tap still switches tabs)
 *   ├──────────────────────────────────────────┤
 *   │ content (scrolls; only the visible part) │
 *   └──────────────────────────────────────────┘
 *
 * Snap points: a fixed `peek` fraction of the host, and `full`, which FITS THE CONTENT (bar +
 * active content) up to `max` of the host, so a short tab never opens into an empty sheet that
 * hides the canvas for nothing. Drag settles on the nearest stop (closed counts as one) with a
 * short fling projection. Keyboard: the bar's one Expand/Collapse button (Enter/Space), Esc
 * collapses then closes, × closes. Reduced motion settles instantly. Safe-area aware.
 *
 * Contract:
 *  - `open` / `snap` are controlled; every change goes out through `onOpenChange` / `onSnapChange`.
 *  - `tabs` is a slot for the bar (style triggers with `sheetTabListClass` / `sheetTabClass`).
 *    If the tabs are Radix Tabs, render the `<Tabs>` root AROUND the sheet (it may be
 *    `className="contents"`), so the bar's list and the content's panels share one root.
 *  - `onOcclusionChange(px)` reports how many px of the host the sheet covers at its TARGET
 *    snap (not its animated height), 0 when closed, so hosts keep their content clear of it.
 *  - `returnFocus` runs after the sheet closes while focus was inside it (×, Esc or drag).
 */
export type MachineSheetSnap = "peek" | "full";

export interface MachineSheetProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly snap: MachineSheetSnap;
  readonly onSnapChange: (snap: MachineSheetSnap) => void;
  /** Accessible name of the section and its controls ("Inspector" → "Expand inspector"). */
  readonly label?: string;
  /** The bar's tab list. */
  readonly tabs: React.ReactNode;
  /** The sheet's scrolling content (the active tab panel). */
  readonly children: React.ReactNode;
  readonly onOcclusionChange?: (px: number) => void;
  /** Peek height as a fraction of the host (default 0.45). */
  readonly peek?: number;
  /** Largest expanded height as a fraction of the host (default 0.94). */
  readonly max?: number;
  /** Move focus into the section when it opens (default true). */
  readonly autoFocus?: boolean;
  readonly returnFocus?: () => void;
  /** When this changes, the content scrolls back to the top (a new subject starts at the top). */
  readonly scrollKey?: unknown;
  readonly className?: string;
}

/** TabsList classes for the sheet bar: underline tabs that fill the bar's height. */
export const sheetTabListClass = "h-full! flex-1 justify-start gap-0 p-0";
/** TabsTrigger classes for the sheet bar: 44px tall, no bezel, underline only. */
export const sheetTabClass = "h-full! flex-none rounded-none border-0 px-3 text-ui after:bottom-0 group-data-horizontal/tabs:after:bottom-0 data-active:bg-transparent dark:data-active:bg-transparent";

/** Default snap fractions, exported so hosts can reason about the peek before it mounts. */
export const SHEET_PEEK = 0.45;
export const SHEET_MAX = 0.94;
/** The bar's height (h-11). */
export const SHEET_BAR = 44;

export function MachineSheet(props: MachineSheetProps) {
  const { open, onOcclusionChange } = props;
  const hostRef = React.useRef<HTMLDivElement>(null);
  const [host, setHost] = React.useState(0);
  React.useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    setHost(el.clientHeight);
    const observer = new ResizeObserver(() => setHost(el.clientHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const report = React.useRef(onOcclusionChange);
  report.current = onOcclusionChange;
  React.useEffect(() => {
    if (!open) report.current?.(0);
  }, [open]);
  React.useEffect(() => () => report.current?.(0), []);
  return (
    // Pointer-transparent host: only the sheet itself takes touches.
    <div ref={hostRef} data-slot="machine-sheet-host" className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
      <AnimatePresence>{open && host > 0 && <SheetSection key="sheet" {...props} host={host} />}</AnimatePresence>
    </div>
  );
}

function SheetSection({
  host,
  snap,
  onSnapChange,
  onOpenChange,
  onOcclusionChange,
  label = "Inspector",
  tabs,
  children,
  peek: peekFraction = SHEET_PEEK,
  max = SHEET_MAX,
  autoFocus = true,
  returnFocus,
  scrollKey,
  className,
}: MachineSheetProps & { readonly host: number }) {
  const reduce = useReducedMotion();
  const transition = reduce ? { duration: 0 } : motionTokens.base;
  const barRef = React.useRef<HTMLDivElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const section = React.useRef<HTMLElement>(null);
  // Content-fit expanded height: bar + natural content height, between the peek and `max`.
  const [content, setContent] = React.useState(0);
  React.useLayoutEffect(() => {
    const bar = barRef.current;
    const body = contentRef.current;
    if (!bar || !body) return;
    const measure = () => setContent(bar.offsetHeight + body.offsetHeight + 8);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(body);
    return () => observer.disconnect();
  }, []);
  const peek = Math.round(host * peekFraction);
  const full = Math.max(peek, Math.min(Math.round(host * max), content || Infinity));
  const expandable = full > peek + 4;
  const expanded = snap === "full";
  const offsetOf = (s: MachineSheetSnap) => (s === "full" ? 0 : full - peek);

  const y = useMotionValue(full);
  const controls = useDragControls();
  const settle = (target: number) => animate(y, target, transition);
  // When the content-fit height changes (another tab, a row that grew), keep the visible top
  // edge where it is for this frame, then glide to the snap: no jump, no flash.
  const lastFull = React.useRef(full);
  const report = React.useRef(onOcclusionChange);
  report.current = onOcclusionChange;
  React.useLayoutEffect(() => {
    const top = lastFull.current - y.get();
    lastFull.current = full;
    y.set(full - top);
    const animation = settle(offsetOf(snap));
    report.current?.(expanded ? full : peek);
    return () => animation.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snap, full, peek]);

  // A new subject starts at the top.
  React.useLayoutEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]");
    if (viewport) viewport.scrollTop = 0;
  }, [scrollKey]);

  // Opening moves focus into the sheet; closing (any way) while focus is inside hands it back.
  const returnRef = React.useRef(returnFocus);
  returnRef.current = returnFocus;
  // Layout effect: its cleanup runs before the section leaves the DOM, while focus is still inside.
  React.useLayoutEffect(() => {
    const el = section.current;
    if (autoFocus) el?.focus({ preventScroll: true });
    return () => {
      if (!el?.contains(window.document.activeElement)) return;
      requestAnimationFrame(() => {
        // Still mounted (a StrictMode re-run, not a close): leave focus alone.
        if (el.isConnected) return;
        returnRef.current?.();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => onOpenChange(false);
  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    // Project the fling a little forward, then settle on the nearest stop (closed counts as one).
    const projected = y.get() + info.velocity.y * 0.18;
    const stops = [...(expandable ? [{ to: "full" as const, at: 0 }] : []), { to: "peek" as const, at: full - peek }, { to: "closed" as const, at: full }];
    const nearest = stops.reduce((best, stop) => (Math.abs(stop.at - projected) < Math.abs(best.at - projected) ? stop : best));
    if (nearest.to === "closed") return close();
    if (nearest.to === snap) settle(offsetOf(snap));
    else onSnapChange(nearest.to);
  };
  const startDrag = (event: React.PointerEvent) => {
    const target = event.target as Element;
    // The whole bar drags; its buttons keep their taps (tabs drag too: a tap never moves, so it still switches tabs).
    if (target.closest("button:not([role=tab]), input, textarea, select")) return;
    controls.start(event);
  };
  const name = label.toLowerCase();
  return (
    <motion.section
      ref={section}
      tabIndex={-1}
      role="complementary"
      aria-label={label}
      data-slot="machine-sheet"
      data-snap={snap}
      style={{ y, height: full }}
      drag="y"
      dragListener={false}
      dragControls={controls}
      dragConstraints={{ top: 0, bottom: full }}
      dragElastic={{ top: 0.04, bottom: 0.2 }}
      dragMomentum={false}
      onDragEnd={onDragEnd}
      exit={{ y: full, transition }}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        event.preventDefault();
        if (expanded) onSnapChange("peek");
        else close();
      }}
      className={cn(
        "pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-2xl border border-b-0 border-hairline bg-surface shadow-[0_-10px_28px_-14px_rgb(0_0_0/0.35)] outline-none",
        className,
      )}
    >
      {/* Only the visible part scrolls: at the peek the content ends at the visible edge. */}
      <div className="flex min-h-0 flex-col pb-[env(safe-area-inset-bottom)]" style={{ height: expanded ? full : peek }}>
        <div ref={barRef} data-sheet-bar="" onPointerDown={startDrag} className="relative box-content flex h-11 shrink-0 cursor-grab touch-none items-center gap-1 border-b border-hairline ps-1 pe-1 active:cursor-grabbing">
          <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1 mx-auto h-1 w-8 rounded-full bg-foreground/20" />
          {tabs}
          {(expandable || expanded) && (
            <Button variant="ghost" size="icon-sm" className="shrink-0 coarse:size-11" aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`} aria-expanded={expanded} onClick={() => onSnapChange(expanded ? "peek" : "full")}>
              {expanded ? <ChevronDown /> : <ChevronUp />}
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="shrink-0 coarse:size-11" aria-label={`Close ${name}`} onClick={close}>
            <X />
          </Button>
        </div>
        <ScrollArea ref={scrollRef} className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div ref={contentRef}>{children}</div>
        </ScrollArea>
      </div>
    </motion.section>
  );
}
