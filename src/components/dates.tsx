"use client";

import * as React from "react";
import { Popover } from "@base-ui/react/popover";
import { useDirection } from "@base-ui/react/direction-provider";
import { cn } from "../lib/utils.js";
import {
  CalendarDate,
  CalendarDateTime,
  ZonedDateTime,
  Time,
  DateFormatter,
  endOfMonth,
  endOfWeek,
  getDayOfWeek,
  startOfWeek,
  today,
  toCalendarDate,
  type DateDuration,
} from "@internationalized/date";

export type DateValue = CalendarDate | CalendarDateTime | ZonedDateTime;
export type TimeValue = Time | CalendarDateTime | ZonedDateTime;
export interface DateRange<T extends DateValue = CalendarDate> {
  start: T;
  end: T;
}

interface Flags {
  isDisabled?: boolean;
  disabled?: boolean;
  isReadOnly?: boolean;
  readOnly?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  locale?: string;
  dir?: "ltr" | "rtl";
}
interface DateStateProps<T> {
  value?: T | null;
  defaultValue?: T | null;
  onChange?: (value: T | null) => void;
  onValueChange?: (value: T | null) => void;
}
interface CalendarOptions<T extends DateValue> extends Flags {
  previousLabel?: string;
  nextLabel?: string;
  focusedValue?: T | null;
  defaultFocusedValue?: T;
  onFocusChange?: (value: T) => void;
  minValue?: DateValue;
  maxValue?: DateValue;
  isDateUnavailable?: (date: T) => boolean;
  visibleDuration?: DateDuration;
  className?: string;
  style?: React.CSSProperties;
  id?: string;
  ref?: React.Ref<HTMLDivElement>;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}
export interface CalendarProps<T extends DateValue = CalendarDate>
  extends CalendarOptions<T>, DateStateProps<T> {}
export interface RangeCalendarProps<T extends DateValue = CalendarDate>
  extends CalendarOptions<T>, DateStateProps<DateRange<T>> {}

function useValue<T>(props: DateStateProps<T>) {
  const [local, setLocal] = React.useState<T | null>(props.defaultValue ?? null);
  const value = props.value === undefined ? local : props.value;
  const update = (next: T | null) => {
    if (props.value === undefined) setLocal(next);
    props.onChange?.(next);
    props.onValueChange?.(next);
  };
  return [value, update] as const;
}

function applyDate<T extends DateValue>(source: T | null | undefined, date: CalendarDate): T {
  if (!source) return date as T;
  return source.set({ era: date.era, year: date.year, month: date.month, day: date.day }) as T;
}

function sameDate(a: DateValue | null | undefined, b: DateValue | null | undefined) {
  return Boolean(a && b && toCalendarDate(a).compare(toCalendarDate(b)) === 0);
}

function periodStart(date: CalendarDate, duration: DateDuration, locale: string) {
  return duration.weeks || duration.days ? startOfWeek(date, locale) : date.set({ day: 1 });
}

function periodEnd(start: CalendarDate, duration: DateDuration) {
  if (duration.days || duration.weeks)
    return start.add({ days: (duration.days ?? (duration.weeks ?? 1) * 7) - 1 });
  return endOfMonth(
    start.add({ months: Math.max(1, duration.months ?? (duration.years ?? 0) * 12) - 1 }),
  );
}

function monthsInPeriod(start: CalendarDate, end: CalendarDate) {
  const months = [start.set({ day: 1 })];
  for (let index = 1; index < 120; index++) {
    const next = start.set({ day: 1 }).add({ months: index });
    if (next.compare(months[months.length - 1]!) <= 0 || next.compare(end) > 0) break;
    months.push(next);
  }
  return months;
}

interface CalendarSurfaceProps<T extends DateValue> extends CalendarOptions<T> {
  selected: T | null;
  range?: DateRange<T> | null;
  onSelect: (date: T) => void;
}

function CalendarSurface<T extends DateValue>({
  selected,
  range,
  onSelect,
  ...props
}: CalendarSurfaceProps<T>) {
  const direction = useDirection();
  const locale = props.locale ?? "en-US";
  const duration = props.visibleDuration ?? { months: 1 };
  const initialValue = toCalendarDate(
    props.focusedValue ?? props.defaultFocusedValue ?? selected ?? range?.start ?? today("UTC"),
  );
  const initial =
    props.minValue && initialValue.compare(toCalendarDate(props.minValue)) < 0
      ? toCalendarDate(props.minValue)
      : props.maxValue && initialValue.compare(toCalendarDate(props.maxValue)) > 0
        ? toCalendarDate(props.maxValue)
        : initialValue;
  const [localFocus, setLocalFocus] = React.useState(initial);
  const focus = props.focusedValue ? toCalendarDate(props.focusedValue) : localFocus;
  const [start, setStart] = React.useState(() => periodStart(initial, duration, locale));
  const end = periodEnd(start, duration);
  const shortPeriod = Boolean(duration.days || duration.weeks);
  const months = shortPeriod ? [start] : monthsInPeriod(start, end);
  const disabled = Boolean(props.disabled ?? props.isDisabled);
  const readOnly = Boolean(props.readOnly ?? props.isReadOnly);
  const refs = React.useRef(new Map<string, HTMLButtonElement>());
  const focusRequested = React.useRef(false);
  const dateFormatter = new DateFormatter(locale, { dateStyle: "full", timeZone: "UTC" });
  const monthFormatter = new DateFormatter(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  const dayFormatter = new DateFormatter(locale, { weekday: "short", timeZone: "UTC" });
  const heading = shortPeriod
    ? `${dateFormatter.format(start.toDate("UTC"))} – ${dateFormatter.format(end.toDate("UTC"))}`
    : months.length === 1
      ? monthFormatter.format(start.toDate("UTC"))
      : `${monthFormatter.format(start.toDate("UTC"))} – ${monthFormatter.format(end.toDate("UTC"))}`;
  const outOfBounds = (date: CalendarDate) =>
    Boolean(props.minValue && date.compare(toCalendarDate(props.minValue)) < 0) ||
    Boolean(props.maxValue && date.compare(toCalendarDate(props.maxValue)) > 0);
  const unavailable = (date: CalendarDate) =>
    disabled ||
    outOfBounds(date) ||
    Boolean(props.isDateUnavailable?.(applyDate(selected ?? range?.start, date)));

  React.useEffect(() => {
    if (props.focusedValue) {
      const next = toCalendarDate(props.focusedValue);
      if (next.compare(start) < 0 || next.compare(end) > 0)
        setStart(periodStart(next, duration, locale));
    }
  }, [props.focusedValue?.toString()]);
  React.useEffect(() => {
    if (focusRequested.current) {
      refs.current.get(focus.toString())?.focus();
      focusRequested.current = false;
    }
  }, [focus.toString(), start.toString()]);

  const moveFocus = (next: CalendarDate) => {
    if (props.minValue && next.compare(toCalendarDate(props.minValue)) < 0)
      next = toCalendarDate(props.minValue);
    if (props.maxValue && next.compare(toCalendarDate(props.maxValue)) > 0)
      next = toCalendarDate(props.maxValue);
    if (props.focusedValue === undefined) setLocalFocus(next);
    props.onFocusChange?.(applyDate(selected ?? range?.start, next));
    if (next.compare(start) < 0 || next.compare(end) > 0)
      setStart(periodStart(next, duration, locale));
    focusRequested.current = true;
  };
  const step: DateDuration = shortPeriod
    ? { days: duration.days ?? (duration.weeks ?? 1) * 7 }
    : { months: Math.max(1, duration.months ?? (duration.years ?? 0) * 12) };
  const page = (backward: boolean) => {
    const next = backward ? start.subtract(step) : start.add(step);
    if (next.compare(start) === 0) return;
    setStart(next);
    if (props.focusedValue === undefined) setLocalFocus(next);
    props.onFocusChange?.(applyDate(selected ?? range?.start, next));
  };
  const previousDisabled =
    disabled ||
    start.subtract(step).compare(start) >= 0 ||
    Boolean(props.minValue && start.compare(toCalendarDate(props.minValue)) <= 0);
  const nextDisabled =
    disabled ||
    start.add(step).compare(start) <= 0 ||
    Boolean(props.maxValue && end.compare(toCalendarDate(props.maxValue)) >= 0);
  const monthHeading = React.useId();
  return (
    <div
      ref={props.ref}
      id={props.id}
      dir={props.dir ?? direction}
      role="group"
      aria-label={props["aria-label"] ?? (range ? "Date range" : "Calendar")}
      aria-labelledby={props["aria-labelledby"]}
      className={["fux-calendar", range !== undefined && "fux-calendar--range", props.className]
        .filter(Boolean)
        .join(" ")}
      style={props.style}
    >
      <header className="fux-calendar__header">
        <button
          type="button"
          className="fux-control"
          aria-label={
            props.previousLabel ??
            (shortPeriod || months.length > 1 ? "Previous period" : "Previous month")
          }
          disabled={previousDisabled}
          onClick={() => page(true)}
        >
          ‹
        </button>
        <h2 id={monthHeading} className="fux-heading" aria-live="polite">
          {heading}
        </h2>
        <button
          type="button"
          className="fux-control"
          aria-label={
            props.nextLabel ?? (shortPeriod || months.length > 1 ? "Next period" : "Next month")
          }
          disabled={nextDisabled}
          onClick={() => page(false)}
        >
          ›
        </button>
      </header>
      <div className="fux-calendar__months">
        {months.map((month) => {
          const gridStart = shortPeriod ? start : startOfWeek(month, locale);
          const gridEnd = shortPeriod ? end : endOfWeek(endOfMonth(month), locale);
          const cells: CalendarDate[] = [];
          for (let index = 0; index < 370; index++) {
            const date = gridStart.add({ days: index });
            if (date.compare(gridEnd) > 0 || (index > 0 && date.compare(cells[index - 1]!) <= 0))
              break;
            cells.push(date);
          }
          const weeks = Array.from({ length: Math.ceil(cells.length / 7) }, (_, index) =>
            cells.slice(index * 7, index * 7 + 7),
          );
          return (
            <table
              key={month.toString()}
              role="grid"
              className="fux-calendar__grid"
              aria-label={shortPeriod ? heading : monthFormatter.format(month.toDate("UTC"))}
            >
              <thead>
                <tr>
                  {Array.from({ length: 7 }, (_, day) => (
                    <th key={day} scope="col" className="fux-calendar__header-cell">
                      {dayFormatter.format(gridStart.add({ days: day }).toDate("UTC"))}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weeks.map((week) => (
                  <tr key={week[0]!.toString()}>
                    {week.map((date) => {
                      const outside = !shortPeriod && date.month !== month.month;
                      const hidden = months.length > 1 && outside;
                      const inRange = Boolean(
                        range &&
                        date.compare(toCalendarDate(range.start)) >= 0 &&
                        date.compare(toCalendarDate(range.end)) <= 0,
                      );
                      const isSelected = range === undefined ? sameDate(date, selected) : inRange;
                      const isUnavailable = unavailable(date);
                      return (
                        <td key={date.toString()}>
                          {hidden ? null : (
                            <button
                              type="button"
                              className="fux-calendar__cell"
                              ref={(element) => {
                                if (element) refs.current.set(date.toString(), element);
                                else refs.current.delete(date.toString());
                              }}
                              tabIndex={sameDate(date, focus) ? 0 : -1}
                              disabled={disabled || outOfBounds(date)}
                              aria-disabled={isUnavailable || undefined}
                              aria-label={`${dateFormatter.format(date.toDate("UTC"))}${isSelected ? " selected" : ""}`}
                              aria-pressed={isSelected}
                              data-selected={isSelected ? "" : undefined}
                              data-outside-month={outside ? "" : undefined}
                              data-unavailable={isUnavailable ? "" : undefined}
                              data-selection-start={
                                range && sameDate(date, range.start) ? "" : undefined
                              }
                              data-selection-end={
                                range && sameDate(date, range.end) ? "" : undefined
                              }
                              data-invalid={props.isInvalid ? "" : undefined}
                              onFocus={() => {
                                if (props.focusedValue === undefined) setLocalFocus(date);
                              }}
                              onClick={() => {
                                if (!readOnly && !isUnavailable) {
                                  moveFocus(date);
                                  onSelect(applyDate(selected ?? range?.start, date));
                                }
                              }}
                              onKeyDown={(event) => {
                                const rtl =
                                  event.currentTarget.closest("[dir]")?.getAttribute("dir") ===
                                  "rtl";
                                let next: CalendarDate | undefined;
                                if (event.key === "ArrowRight")
                                  next = date.add({ days: rtl ? -1 : 1 });
                                if (event.key === "ArrowLeft")
                                  next = date.add({ days: rtl ? 1 : -1 });
                                if (event.key === "ArrowDown") next = date.add({ days: 7 });
                                if (event.key === "ArrowUp") next = date.add({ days: -7 });
                                if (event.key === "Home")
                                  next = date.subtract({ days: getDayOfWeek(date, locale) });
                                if (event.key === "End")
                                  next = date.add({ days: 6 - getDayOfWeek(date, locale) });
                                if (event.key === "PageDown")
                                  next = date.add(event.shiftKey ? { years: 1 } : { months: 1 });
                                if (event.key === "PageUp")
                                  next = date.subtract(
                                    event.shiftKey ? { years: 1 } : { months: 1 },
                                  );
                                if (next) {
                                  event.preventDefault();
                                  moveFocus(next);
                                }
                              }}
                            >
                              {date.day}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })}
      </div>
    </div>
  );
}

export function Calendar<T extends DateValue = CalendarDate>(props: CalendarProps<T>) {
  const [value, setValue] = useValue(props);
  return <CalendarSurface {...props} selected={value} onSelect={setValue} />;
}

export function RangeCalendar<T extends DateValue = CalendarDate>(props: RangeCalendarProps<T>) {
  const [value, setValue] = useValue(props);
  const [anchor, setAnchor] = React.useState<T | null>(null);
  return (
    <CalendarSurface
      {...props}
      selected={anchor ?? value?.start ?? null}
      range={anchor ? { start: anchor, end: anchor } : value}
      onSelect={(date) => {
        if (!anchor) setAnchor(date);
        else {
          setValue(
            date.compare(anchor) < 0 ? { start: date, end: anchor } : { start: anchor, end: date },
          );
          setAnchor(null);
        }
      }}
    />
  );
}

interface FieldDetails extends Flags {
  label: React.ReactNode;
  hint?: string;
  error?: string;
  name?: string;
  id?: string;
  className?: string;
  ref?: React.Ref<HTMLDivElement>;
  hourCycle?: 12 | 24;
  granularity?: "day" | "hour" | "minute" | "second";
  hideTimeZone?: boolean;
}
export interface DateFieldProps<T extends DateValue = CalendarDate>
  extends FieldDetails, DateStateProps<T> {
  minValue?: DateValue;
  maxValue?: DateValue;
  placeholderValue?: T;
}
export interface TimeFieldProps<T extends TimeValue = Time>
  extends FieldDetails, DateStateProps<T> {
  minValue?: TimeValue;
  maxValue?: TimeValue;
  placeholderValue?: T;
}

function compareValues(left: DateValue | TimeValue, right: DateValue | TimeValue): number {
  if (left instanceof ZonedDateTime && right instanceof ZonedDateTime) return left.compare(right);
  if ("calendar" in left && "calendar" in right) {
    const days = toCalendarDate(left).compare(toCalendarDate(right));
    if (days) return days;
  }
  const time = (value: DateValue | TimeValue) =>
    "hour" in value
      ? ((value.hour * 60 + value.minute) * 60 + value.second) * 1000 + value.millisecond
      : 0;
  return time(left) - time(right);
}

type SegmentKey = "year" | "month" | "day" | "hour" | "minute" | "second";
interface SegmentsProps<T extends DateValue | TimeValue> extends FieldDetails {
  value: T | null;
  placeholderValue?: T;
  onValue: (value: T | null) => void;
  timeOnly?: boolean;
  minValue?: DateValue | TimeValue;
  maxValue?: DateValue | TimeValue;
}

function Segments<T extends DateValue | TimeValue>({
  value,
  placeholderValue,
  onValue,
  timeOnly,
  ...props
}: SegmentsProps<T>) {
  const locale = props.locale ?? "en-US";
  const source = value ?? placeholderValue ?? (timeOnly ? new Time(0, 0) : today("UTC"));
  const disabled = Boolean(props.disabled ?? props.isDisabled);
  const readOnly = Boolean(props.readOnly ?? props.isReadOnly);
  const label = typeof props.label === "string" ? props.label : timeOnly ? "Time" : "Date";
  const dateKeys = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  })
    .formatToParts(new Date(Date.UTC(2020, 5, 15)))
    .filter((part) => ["year", "month", "day"].includes(part.type))
    .map((part) => part.type as SegmentKey);
  const timeKeys: SegmentKey[] =
    props.granularity === "hour"
      ? ["hour"]
      : props.granularity === "second"
        ? ["hour", "minute", "second"]
        : ["hour", "minute"];
  const twelveHour =
    props.hourCycle === 12 ||
    (props.hourCycle === undefined &&
      ["h11", "h12"].includes(
        new Intl.DateTimeFormat(locale, { hour: "numeric" }).resolvedOptions().hourCycle ?? "",
      ));
  const keys = timeOnly
    ? timeKeys
    : "hour" in source && props.granularity !== "day"
      ? [...dateKeys, ...timeKeys]
      : dateKeys;
  const commit = (next: T | null) => {
    if (disabled || readOnly) return;
    if (next && props.minValue && compareValues(next, props.minValue) < 0) return;
    if (next && props.maxValue && compareValues(next, props.maxValue) > 0) return;
    onValue(next);
  };
  const change = (key: SegmentKey, raw: string) => {
    if (disabled || readOnly) return;
    if (raw === "") {
      commit(null);
      return;
    }
    const number = Number(raw);
    if (!Number.isInteger(number)) return;
    const nextNumber =
      key === "hour" && twelveHour && "hour" in source
        ? (number % 12) + (source.hour >= 12 ? 12 : 0)
        : number;
    const next = source.set({ [key]: nextNumber }) as T;
    commit(next);
  };
  return (
    <div className="fux-date-input" style={{ display: "flex", alignItems: "center", gap: 4 }}>
      {keys.map((key, index) => {
        const date = source as DateValue;
        const max =
          key === "year"
            ? 9999
            : key === "month"
              ? date.calendar.getMonthsInYear(date)
              : key === "day"
                ? date.calendar.getDaysInMonth(date)
                : key === "hour"
                  ? twelveHour
                    ? 12
                    : 23
                  : 59;
        const min =
          ["year", "month", "day"].includes(key) || (key === "hour" && twelveHour) ? 1 : 0;
        const raw =
          value && key in value ? (value as unknown as Record<SegmentKey, number>)[key] : "";
        const number =
          key === "hour" && twelveHour && typeof raw === "number" ? raw % 12 || 12 : raw;
        return (
          <React.Fragment key={key}>
            {index > 0 && (
              <span aria-hidden="true">
                {key === "minute" || key === "second" ? ":" : index === dateKeys.length ? " " : "/"}
              </span>
            )}
            <input
              type="number"
              className="fux-date-segment"
              aria-label={`${key}, ${label}`}
              aria-required={props.isRequired || undefined}
              required={props.isRequired}
              aria-invalid={Boolean(props.error) || props.isInvalid || undefined}
              min={min}
              max={max}
              value={number}
              disabled={disabled}
              readOnly={readOnly}
              style={{ width: key === "year" ? "5ch" : "3ch", minHeight: 44 }}
              onChange={(event) => change(key, event.target.value)}
              onKeyDown={(event) => {
                if (disabled || readOnly) return;
                if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                  event.preventDefault();
                  const amount = event.key === "ArrowUp" ? 1 : -1;
                  // The rendered segment keys belong to the active date or time value.
                  const next = source.cycle(key as never, amount) as T;
                  commit(next);
                }
                if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                  const fields = Array.from(
                    event.currentTarget.parentElement!.querySelectorAll("input"),
                  );
                  const position = fields.indexOf(event.currentTarget);
                  fields[position + (event.key === "ArrowRight" ? 1 : -1)]?.focus();
                }
              }}
            />
          </React.Fragment>
        );
      })}
      {keys.includes("hour") && twelveHour && (
        <select
          className="fux-input"
          aria-label={`day period, ${label}`}
          disabled={disabled || readOnly}
          value={"hour" in source && source.hour >= 12 ? "pm" : "am"}
          onChange={(event) => {
            if (!disabled && !readOnly && "hour" in source)
              commit(
                source.set({
                  hour: (source.hour % 12) + (event.target.value === "pm" ? 12 : 0),
                }) as T,
              );
          }}
        >
          <option value="am">AM</option>
          <option value="pm">PM</option>
        </select>
      )}
      {props.name && (
        <input
          type="hidden"
          name={props.name}
          value={value?.toString() ?? ""}
          disabled={disabled}
        />
      )}
    </div>
  );
}

function FieldFrame({ children, ...props }: FieldDetails & { children: React.ReactNode }) {
  const generatedId = React.useId();
  const id = props.id ?? generatedId;
  return (
    <div
      ref={props.ref}
      id={id}
      className={cn("fux-field", props.className)}
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={props.hint || props.error ? `${id}-details` : undefined}
    >
      <div className="fux-label" id={`${id}-label`}>
        {props.label}
      </div>
      {children}
      {(props.hint || props.error) && (
        <div id={`${id}-details`} className={props.error ? "fux-error" : "fux-hint"}>
          {props.error ?? props.hint}
        </div>
      )}
    </div>
  );
}

export function DateField<T extends DateValue = CalendarDate>(props: DateFieldProps<T>) {
  const [value, update] = useValue(props);
  return (
    <FieldFrame {...props}>
      <Segments {...props} value={value} onValue={update} />
    </FieldFrame>
  );
}

export function TimeField<T extends TimeValue = Time>(props: TimeFieldProps<T>) {
  const [value, update] = useValue(props);
  return (
    <FieldFrame {...props}>
      <Segments {...props} value={value} onValue={update} timeOnly />
    </FieldFrame>
  );
}

export interface DatePickerProps<T extends DateValue = CalendarDate>
  extends DateFieldProps<T>, CalendarOptions<T> {
  openLabel?: string;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export function DatePicker<T extends DateValue = CalendarDate>(props: DatePickerProps<T>) {
  const [value, update] = useValue(props);
  const [localOpen, setLocalOpen] = React.useState(props.defaultOpen ?? false);
  const open = props.isOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (props.isOpen === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  const label = typeof props.label === "string" ? props.label : "Date";
  const disabled = Boolean(props.disabled ?? props.isDisabled);
  const readOnly = Boolean(props.readOnly ?? props.isReadOnly);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <FieldFrame {...props}>
        <div className="fux-date-group" style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Segments {...props} value={value} onValue={update} />
          <Popover.Trigger
            className="fux-control"
            disabled={disabled || readOnly}
            aria-label={`${props.openLabel ?? "Choose date"} ${label}`}
          >
            ▦
          </Popover.Trigger>
        </div>
      </FieldFrame>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup className="fux-popover fux-popover--calendar" aria-label={label}>
            <Calendar
              {...props}
              ref={undefined}
              value={value}
              onChange={(next) => {
                update(next);
                setOpen(false);
              }}
              onValueChange={undefined}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export interface DateRangePickerProps<T extends DateValue = CalendarDate>
  extends FieldDetails, CalendarOptions<T>, DateStateProps<DateRange<T>> {
  placeholderValue?: T;
  openLabel?: string;
  isOpen?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}
export function DateRangePicker<T extends DateValue = CalendarDate>(
  props: DateRangePickerProps<T>,
) {
  const [value, update] = useValue(props);
  const [startDraft, setStartDraft] = React.useState<T | null>(value?.start ?? null);
  const [endDraft, setEndDraft] = React.useState<T | null>(value?.end ?? null);
  React.useEffect(() => {
    setStartDraft(value?.start ?? null);
    setEndDraft(value?.end ?? null);
  }, [value?.start.toString(), value?.end.toString()]);
  const commitRange = (next: DateRange<T> | null) => {
    update(next);
    if (props.value !== undefined) {
      setStartDraft(value?.start ?? null);
      setEndDraft(value?.end ?? null);
    }
  };
  const [localOpen, setLocalOpen] = React.useState(props.defaultOpen ?? false);
  const open = props.isOpen ?? localOpen;
  const setOpen = (next: boolean) => {
    if (props.isOpen === undefined) setLocalOpen(next);
    props.onOpenChange?.(next);
  };
  const label = typeof props.label === "string" ? props.label : "Date range";
  const disabled = Boolean(props.disabled ?? props.isDisabled);
  const readOnly = Boolean(props.readOnly ?? props.isReadOnly);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <FieldFrame {...props}>
        <div
          className="fux-date-group fux-date-range"
          style={{ display: "flex", alignItems: "center", gap: 8 }}
        >
          <Segments
            {...props}
            name={undefined}
            label={`Start ${label}`}
            value={startDraft}
            onValue={(start) => {
              setStartDraft(start);
              if (start && endDraft && start.compare(endDraft) <= 0)
                commitRange({ start, end: endDraft });
              else if (!start && value) commitRange(null);
            }}
          />
          <span aria-hidden="true">–</span>
          <Segments
            {...props}
            name={undefined}
            label={`End ${label}`}
            value={endDraft}
            onValue={(end) => {
              setEndDraft(end);
              if (startDraft && end && startDraft.compare(end) <= 0)
                commitRange({ start: startDraft, end });
              else if (!end && value) commitRange(null);
            }}
          />
          {props.name && (
            <input
              type="hidden"
              name={props.name}
              value={value ? `${value.start}/${value.end}` : ""}
              disabled={disabled}
            />
          )}
          <Popover.Trigger
            className="fux-control"
            disabled={disabled || readOnly}
            aria-label={`${props.openLabel ?? "Choose date range"} ${label}`}
          >
            ▦
          </Popover.Trigger>
        </div>
      </FieldFrame>
      <Popover.Portal>
        <Popover.Positioner sideOffset={8} align="start">
          <Popover.Popup className="fux-popover fux-popover--calendar" aria-label={label}>
            <RangeCalendar
              {...props}
              ref={undefined}
              value={value}
              onChange={(next) => {
                update(next);
                setOpen(false);
              }}
              onValueChange={undefined}
            />
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
