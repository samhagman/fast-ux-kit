import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CalendarRange, Clock } from "lucide-react";
import { findOutlineNode } from "@fux/core";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { formatDate, formatDateToken, formatRepeat, spokenDate, type DateRepeat } from "./inline";
import { useOutlinerContext, type DatePickerRequest } from "./context";
import type { OutlineItem } from "./types";

/**
 * The date chip editor. A fine pointer gets a popover beside the chip (never wider than the
 * viewport); touch gets a bottom sheet like every other phone menu, with 44 px targets and
 * everything reachable. Both render one body, so they cannot drift apart:
 *
 *   pointer (popover, 18rem)              touch (sheet)
 *   ┌──────────────────────────────┐      ┌──────────────────────────────┐
 *   │ Today Tomorrow +1 week Remove│      │ Due date            [Remove] │
 *   │        ‹ November 2026 ›     │      │ Today 4:00 PM                │
 *   │  calendar                    │      │ [Today] [Tomorrow] [+1 week] │
 *   │ Once Daily Weekdays Weekly … │      │  calendar (44 px days)       │
 *   │ ◷ 16:00 [Set]   Remove time  │      │ Once Daily Weekdays …  ⇢     │
 *   └──────────────────────────────┘      │ ◷ [16:00] [Set]  Remove time │
 *                                         └──────────────────────────────┘
 *
 * Every action (a day, a preset, a repeat, a time, Remove time, Remove) rewrites the `!(…)`
 * token once: one undo step, spoken, and focus goes back to the row.
 */
export function OutlinerDatePicker() {
  const { ui } = useOutlinerContext();
  const coarse = useMediaQuery("(pointer: coarse)");
  const request = ui.datePicker;
  const L = ui.labels;
  // The close-focus callback runs after the request is cleared: remember whose picker it was.
  const lastRow = React.useRef<string | null>(null);
  // While the surface animates out it keeps showing what it showed (never an empty frame).
  const last = React.useRef<DatePickerRequest | null>(null);
  if (request) {
    lastRow.current = request.rowId;
    last.current = request;
  }
  const shown = request ?? last.current;
  const onOpenChange = (open: boolean) => !open && ui.setDatePicker(null);
  const onCloseAutoFocus = (event: Event) => ui.returnFocus(event, lastRow.current);
  const body = shown && <DatePickerBody key={`${shown.rowId}:${shown.start}:${shown.end}`} request={shown} touch={coarse} />;

  if (coarse)
    return (
      <Drawer open={!!request} onOpenChange={onOpenChange} autoFocus>
        <DrawerContent
          data-date-picker="sheet"
          aria-describedby={undefined}
          className="pb-[env(safe-area-inset-bottom)] outline-none"
          // Touch has no keyboard cursor: the sheet itself takes focus, not a ringed first button.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.target as HTMLElement | null)?.focus?.({ preventScroll: true });
          }}
          onCloseAutoFocus={onCloseAutoFocus}
        >
          <DrawerHeader className="flex-row items-center gap-2 px-4 pt-2 pb-1 text-start! md:text-start">
            <div className="min-w-0 flex-1">
              <DrawerTitle className="text-[15px]">{L.dueDate}</DrawerTitle>
              <DrawerDescription className="truncate text-[13px] tabular-nums">{shown ? formatDate({ value: shown.value, hasTime: shown.hasTime, end: shown.rangeEnd, endHasTime: shown.rangeEndHasTime }) : ""}</DrawerDescription>
            </div>
            {shown && <RemoveDate request={shown} touch />}
          </DrawerHeader>
          <div className="min-h-0 overflow-y-auto overscroll-contain">{body}</div>
        </DrawerContent>
      </Drawer>
    );
  return (
    <Popover open={!!request} onOpenChange={onOpenChange}>
      {shown && (
        <PopoverAnchor asChild>
          <span aria-hidden style={{ position: "fixed", left: shown.rect.left, top: shown.rect.top, width: shown.rect.width, height: shown.rect.height }} />
        </PopoverAnchor>
      )}
      <PopoverContent
        align="start"
        sideOffset={6}
        collisionPadding={8}
        aria-label={L.dueDate}
        data-date-picker="popover"
        className="w-[18rem] max-w-[calc(100vw-1rem)] p-0"
        // Back to the row it edits, selected, never <body> (⌘Z keeps working).
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

/** One rewrite of the token: `date` null removes it; the change is spoken and the picker closes. */
function useReplaceDate(request: DatePickerRequest) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  return (date: Date | null, hasTime = request.hasTime, repeat = request.repeat, end?: { readonly at: Date; readonly hasTime: boolean }) => {
    const node = findOutlineNode(ol.latestNodes(), request.rowId)?.node as OutlineItem | undefined;
    if (!node) return;
    const sameTime = date && request.time && date.getHours() === request.value.getHours() && date.getMinutes() === request.value.getMinutes();
    const token = date ? formatDateToken(date, hasTime, end ? undefined : repeat, { end: end?.at, endHasTime: end?.hasTime, time: sameTime ? request.time : undefined }) : "";
    const source = request.field === "note" ? (node.data?.note ?? "") : node.text;
    const next = (source.slice(0, request.start) + token + source.slice(request.end)).replace(/ {2,}/g, " ");
    ol.dispatch({ type: request.field === "note" ? "note" : "text", id: request.rowId, text: next });
    ui.announce(
      !date
        ? L.dateRemoved
        : end
          ? L.dateRange(spokenDate({ value: date, hasTime }), spokenDate({ value: end.at, hasTime: end.hasTime }))
          : L.dueOn(spokenDate({ value: date, hasTime }) + (repeat ? `, repeats every ${formatRepeat(repeat)}` : "")),
    );
    ui.setDatePicker(null);
  };
}

function RemoveDate({ request, touch }: { readonly request: DatePickerRequest; readonly touch: boolean }) {
  const { ol, ui } = useOutlinerContext();
  const replace = useReplaceDate(request);
  return (
    <Button
      variant="ghost"
      size={touch ? "default" : "xs"}
      data-date-remove=""
      className={cn("shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive", touch ? "h-11 px-3 text-[15px]" : "ms-auto")}
      disabled={ol.readOnly}
      onClick={() => replace(null)}
    >
      {ui.labels.removeDate}
    </Button>
  );
}

const pad = (value: number) => String(value).padStart(2, "0");
const dayOnly = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

function DatePickerBody({ request, touch }: { readonly request: DatePickerRequest; readonly touch: boolean }) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const replace = useReplaceDate(request);
  /**
   * Range mode (`!(start → end)`): the first click picks the start, the second the end. It opens
   * on when the token already is a range. Ranges and repeats exclude each other.
   */
  const [rangeMode, setRangeMode] = React.useState(!!request.rangeEnd);
  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  /** The time field: shown while the token has a time, or once "Add time" asked for one. */
  const current = request.hasTime ? `${pad(request.time?.[0] ?? request.value.getHours())}:${pad(request.time?.[1] ?? request.value.getMinutes())}` : null;
  const [timeOpen, setTimeOpen] = React.useState(request.hasTime);
  const [time, setTime] = React.useState(current ?? "09:00");
  const timeRef = React.useRef<HTMLInputElement>(null);
  const end = request.rangeEnd ? { at: request.rangeEnd, hasTime: !!request.rangeEndHasTime } : undefined;

  /** A day from a preset or the calendar keeps the token's time of day. */
  const atDay = (day: Date, from: Date, hasTime: boolean) => {
    const date = dayOnly(day);
    if (hasTime) date.setHours(from.getHours(), from.getMinutes());
    return date;
  };
  const onDay = (day: Date) => {
    if (!rangeMode) return replace(atDay(day, request.value, request.hasTime), request.hasTime, request.repeat);
    if (!rangeStart) {
      setRangeStart(day);
      ui.announce(L.pickRangeEnd);
      return;
    }
    const [first, lastDay] = day < rangeStart ? [day, rangeStart] : [rangeStart, day];
    const start = atDay(first, request.value, request.hasTime);
    const sameDay = first.toDateString() === lastDay.toDateString();
    // One day picked twice is a plain date again (a timed range keeps its end time).
    if (sameDay && !(request.hasTime && request.rangeEndHasTime && request.rangeEnd)) return replace(start, request.hasTime, undefined);
    const endAt = request.rangeEnd && request.rangeEndHasTime ? atDay(lastDay, request.rangeEnd, true) : atDay(lastDay, lastDay, false);
    replace(start, request.hasTime, undefined, { at: endAt, hasTime: !!(request.rangeEnd && request.rangeEndHasTime) });
  };
  /** Set (or change) the time of day; a range keeps its end. */
  const commitTime = () => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) return;
    const date = dayOnly(request.value);
    date.setHours(Number(match[1]), Number(match[2]));
    replace(date, true, request.repeat, end);
  };
  /** Back to a whole day (a range's end too). */
  const removeTime = () => replace(dayOnly(request.value), false, request.repeat, end && { at: dayOnly(end.at), hasTime: false });

  const quick = (label: string, days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return { label, date };
  };
  const repeats: readonly (readonly [string, DateRepeat | undefined])[] = [
    ["Once", undefined],
    ["Daily", { unit: "day", interval: 1 }],
    ["Weekdays", { unit: "weekday", interval: 1 }],
    ["Weekly", { unit: "week", interval: 1 }],
    ["Monthly", { unit: "month", interval: 1 }],
  ];
  const sameRepeat = (a?: DateRepeat, b?: DateRepeat) => a?.unit === b?.unit && a?.interval === b?.interval;
  const on = "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal";
  // Touch: 44 px everything; pointer: the condensed xs buttons.
  const size = touch ? "default" : "xs";
  const btn = touch ? "h-11 px-3 text-[15px]" : "";
  const row = cn("flex items-center gap-1 border-t border-hairline", touch ? "px-3 py-1.5" : "p-1.5");
  const disabled = ol.readOnly;

  return (
    <div className="flex flex-col" data-date-picker-body="">
      <div className={cn("flex gap-1", touch ? "px-3 pb-1.5" : "border-b border-hairline p-1.5")} role="group" aria-label="Quick dates">
        {[quick("Today", 0), quick("Tomorrow", 1), quick("+1 week", 7)].map((option) => (
          <Button key={option.label} variant={touch ? "outline" : "ghost"} size={size} className={cn(btn, touch && "flex-1")} disabled={disabled} onClick={() => onDay(option.date)}>
            {option.label}
          </Button>
        ))}
        {!touch && <RemoveDate request={request} touch={false} />}
      </div>
      <Calendar
        {...(rangeMode
          ? {
              mode: "range" as const,
              selected: rangeStart ? { from: rangeStart, to: undefined } : { from: request.value, to: request.rangeEnd ?? request.value },
              onSelect: (_range: unknown, day: Date) => onDay(day),
            }
          : { mode: "single" as const, selected: request.value, onSelect: (date: Date | undefined) => date && onDay(date) })}
        defaultMonth={request.value}
        disabled={disabled}
        className={cn("mx-auto bg-transparent", touch && "[--cell-size:--spacing(11)] [&_.rdp-day_button]:text-[15px]")}
      />
      <AnimatePresence initial={false}>
        {rangeMode && (
          <motion.p
            key={rangeStart ? "end" : "start"}
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={motionTokens.quick}
            aria-live="polite"
            className="px-3 pb-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase"
          >
            {rangeStart ? L.pickRangeEnd : L.pickRangeStart}
          </motion.p>
        )}
      </AnimatePresence>
      {/* Repeat: wraps with a pointer; on touch a 3×2 grid of 44 px chips, every choice in view. */}
      <div className={cn(row, touch ? "grid grid-cols-3" : "flex-wrap")} role="group" aria-label={L.repeat} data-repeat-row="">
        {repeats.map(([label, repeat]) => {
          const active = !rangeMode && sameRepeat(repeat, request.repeat);
          return (
            <Button
              key={label}
              variant="ghost"
              size={size}
              aria-pressed={active}
              disabled={disabled}
              className={cn(btn, "shrink-0", active && on)}
              onClick={() => replace(request.value, request.hasTime, repeat)}
            >
              {label}
            </Button>
          );
        })}
        <Button
          variant="ghost"
          size={size}
          aria-pressed={rangeMode}
          disabled={disabled}
          className={cn(btn, "shrink-0 gap-1", rangeMode && on)}
          onClick={() => {
            setRangeStart(null);
            // Leaving range mode on a range keeps just its start.
            if (rangeMode && request.rangeEnd) replace(request.value, request.hasTime, undefined);
            else setRangeMode((value) => !value);
          }}
        >
          <CalendarRange className={touch ? "size-4" : "size-3"} /> {L.dateRangeMode}
        </Button>
      </div>
      <div className={row} data-date-time="">
        {timeOpen ? (
          <form
            className="flex min-w-0 flex-1 items-center gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              commitTime();
            }}
          >
            <label className={cn("flex shrink-0 items-center rounded-md border border-hairline bg-surface px-2 focus-within:border-signal/50", touch ? "h-11" : "h-6")}>
              <input
                ref={timeRef}
                type="time"
                aria-label={L.timeOfDay}
                value={time}
                required
                disabled={disabled}
                onChange={(event) => setTime(event.target.value)}
                className={cn("bg-transparent font-mono text-foreground tabular-nums outline-none [&::-webkit-calendar-picker-indicator]:opacity-60", touch ? "text-[15px]" : "text-[12px]")}
              />
            </label>
            <Button type="submit" variant="ghost" size={size} className={cn(btn, "shrink-0")} disabled={disabled || time === current}>
              {L.setTime}
            </Button>
          </form>
        ) : (
          <Button
            variant="ghost"
            size={size}
            className={cn(btn, "gap-1 text-muted-foreground")}
            disabled={disabled}
            onClick={() => {
              setTimeOpen(true);
              requestAnimationFrame(() => timeRef.current?.focus());
            }}
          >
            <Clock className={touch ? "size-4" : "size-3"} /> {L.addTime}
          </Button>
        )}
        {request.hasTime && (
          <Button variant="ghost" size={size} className={cn(btn, "ms-auto shrink-0 text-muted-foreground")} disabled={disabled} onClick={removeTime}>
            {L.removeTime}
          </Button>
        )}
      </div>
    </div>
  );
}
