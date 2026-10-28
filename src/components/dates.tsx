"use client";
import * as A from "react-aria-components";
import type { ReactNode, Ref } from "react";
import * as P from "./primitives.js";

interface FieldDetails {
  label: ReactNode;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLDivElement>;
}
interface CalendarLabels {
  previousLabel?: string;
  nextLabel?: string;
}
export interface CalendarProps<T extends A.DateValue>
  extends Omit<A.CalendarProps<T>, "children" | "className">, CalendarLabels {
  ref?: Ref<HTMLDivElement>;
}
export interface RangeCalendarProps<T extends A.DateValue>
  extends Omit<A.RangeCalendarProps<T>, "children" | "className">, CalendarLabels {
  ref?: Ref<HTMLDivElement>;
}
function CalendarContents({
  previousLabel,
  nextLabel,
  state,
}: CalendarLabels & {
  state: Pick<A.CalendarRenderProps["state"], "visibleDuration" | "visibleRange">;
}) {
  // Read the owner’s resolved range, including contextual calendars in pickers.
  // Month offsets preserve its pagination, focus and locale-specific calendar.
  const offsets = [0];
  if (state.visibleDuration.months || state.visibleDuration.years) {
    const firstMonth = state.visibleRange.start.set({ day: 1 });
    let previousMonth = firstMonth;
    for (let offset = 1; ; offset++) {
      const month = firstMonth.add({ months: offset }).set({ day: 1 });
      // Calendar arithmetic may clamp at its supported era/year boundary.
      // Stop if an offset no longer advances, rather than repeating forever.
      if (month.compare(previousMonth) <= 0 || month.compare(state.visibleRange.end) > 0) break;
      offsets.push(offset);
      previousMonth = month;
    }
  }
  return (
    <>
      <header className="fux-calendar__header">
        <P.Button
          slot="previous"
          aria-label={previousLabel ?? (offsets.length > 1 ? "Previous period" : "Previous month")}
        >
          <span aria-hidden="true" className="fux-directional">
            ‹
          </span>
        </P.Button>
        <P.Heading />
        <P.Button
          slot="next"
          aria-label={nextLabel ?? (offsets.length > 1 ? "Next period" : "Next month")}
        >
          <span aria-hidden="true" className="fux-directional">
            ›
          </span>
        </P.Button>
      </header>
      <div className="fux-calendar__months">
        {offsets.map((offset) => (
          <P.CalendarGrid key={offset} offset={{ months: offset }}>
            <P.CalendarGridHeader>
              {(day) => <P.CalendarHeaderCell>{day}</P.CalendarHeaderCell>}
            </P.CalendarGridHeader>
            <P.CalendarGridBody>
              {(date) => (
                <P.CalendarCell
                  date={date}
                  style={({ isOutsideMonth }) =>
                    offsets.length > 1 && isOutsideMonth ? { visibility: "hidden" } : undefined
                  }
                />
              )}
            </P.CalendarGridBody>
          </P.CalendarGrid>
        ))}
      </div>
      <P.Text slot="errorMessage" className="fux-error" />
    </>
  );
}
export function Calendar<T extends A.DateValue>({
  previousLabel,
  nextLabel,
  ...props
}: CalendarProps<T>) {
  return (
    <P.Calendar {...props}>
      {({ state }) => (
        <CalendarContents state={state} previousLabel={previousLabel} nextLabel={nextLabel} />
      )}
    </P.Calendar>
  );
}
export function RangeCalendar<T extends A.DateValue>({
  previousLabel,
  nextLabel,
  ...props
}: RangeCalendarProps<T>) {
  return (
    <P.RangeCalendar {...props}>
      {({ state }) => (
        <CalendarContents state={state} previousLabel={previousLabel} nextLabel={nextLabel} />
      )}
    </P.RangeCalendar>
  );
}
function Segments({ slot }: { slot?: string }) {
  return <P.DateInput slot={slot}>{(segment) => <P.DateSegment segment={segment} />}</P.DateInput>;
}
function Details({ hint, error }: Pick<FieldDetails, "hint" | "error">) {
  return (
    <>
      {hint && <P.Text slot="description">{hint}</P.Text>}
      <P.FieldError>{error}</P.FieldError>
    </>
  );
}
export interface DateFieldProps<T extends A.DateValue>
  extends Omit<A.DateFieldProps<T>, "children" | "className">, FieldDetails {}
export function DateField<T extends A.DateValue>({
  label,
  hint,
  error,
  ...props
}: DateFieldProps<T>) {
  return (
    <P.DateField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <Segments />
      <Details hint={hint} error={error} />
    </P.DateField>
  );
}
export interface TimeFieldProps<T extends A.TimeValue>
  extends Omit<A.TimeFieldProps<T>, "children" | "className">, FieldDetails {}
export function TimeField<T extends A.TimeValue>({
  label,
  hint,
  error,
  ...props
}: TimeFieldProps<T>) {
  return (
    <P.TimeField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <Segments />
      <Details hint={hint} error={error} />
    </P.TimeField>
  );
}
export interface DatePickerProps<T extends A.DateValue>
  extends Omit<A.DatePickerProps<T>, "children" | "className">, FieldDetails, CalendarLabels {
  openLabel?: string;
}
export function DatePicker<T extends A.DateValue>({
  label,
  hint,
  error,
  openLabel = "Choose date",
  previousLabel,
  nextLabel,
  ...props
}: DatePickerProps<T>) {
  return (
    <P.DatePicker {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Group>
        <Segments />
        <P.Button aria-label={openLabel}>▦</P.Button>
      </P.Group>
      <Details hint={hint} error={error} />
      <P.Popover>
        <P.Dialog>
          <Calendar previousLabel={previousLabel} nextLabel={nextLabel} />
        </P.Dialog>
      </P.Popover>
    </P.DatePicker>
  );
}
export interface DateRangePickerProps<T extends A.DateValue>
  extends Omit<A.DateRangePickerProps<T>, "children" | "className">, FieldDetails, CalendarLabels {
  openLabel?: string;
}
export function DateRangePicker<T extends A.DateValue>({
  label,
  hint,
  error,
  openLabel = "Choose date range",
  previousLabel,
  nextLabel,
  ...props
}: DateRangePickerProps<T>) {
  return (
    <P.DateRangePicker {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Group className="fux-date-range">
        <Segments slot="start" />
        <span aria-hidden="true">–</span>
        <Segments slot="end" />
        <P.Button aria-label={openLabel}>▦</P.Button>
      </P.Group>
      <Details hint={hint} error={error} />
      <P.Popover>
        <P.Dialog>
          <RangeCalendar previousLabel={previousLabel} nextLabel={nextLabel} />
        </P.Dialog>
      </P.Popover>
    </P.DateRangePicker>
  );
}
