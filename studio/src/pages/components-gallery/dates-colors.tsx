// Gallery demos: Date, time and color (dates.tsx, colors.tsx).
import * as React from "react";
import { CalendarDate, CalendarDateTime, Time, isWeekend } from "@internationalized/date";
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, date, Variants, type ComponentFixture } from "./fixture-kit";

// A fixed "today" keeps the marker in the same place whenever the gallery is opened.
const today = date.subtract({ days: 3 });
const weekendsOff = (day: CalendarDate) => isWeekend(day, "en-US");

/** A calendar sits on a quiet surface so its bounds read like a real date picker. */
function Panel({ children }: { readonly children: React.ReactNode }) {
  return <div className="w-fit max-w-full rounded-xl border bg-card shadow-xs">{children}</div>;
}

// Neutral hues: demo data, not a palette the kit prescribes.
const hues: readonly C.ColorSwatchOption[] = [
  { color: "#ef4444", label: "Red" },
  { color: "#f59e0b", label: "Amber" },
  { color: "#22c55e", label: "Green" },
  { color: "#06b6d4", label: "Cyan" },
  { color: "#3b82f6", label: "Blue" },
  { color: "#8b5cf6", label: "Violet" },
  { color: "#ec4899", label: "Pink" },
  { color: "#64748b", label: "Slate" },
];
const grays: readonly C.ColorSwatchOption[] = [
  { color: "#ffffff", label: "White" },
  { color: "#e2e8f0", label: "Mist" },
  { color: "#94a3b8", label: "Stone" },
  { color: "#475569", label: "Slate" },
  { color: "#0f172a", label: "Ink" },
  { color: "#0f172a00", label: "Clear" },
];

function ColorPopoverDemo() {
  const [color, setColor] = React.useState<C.ColorValue>(C.parseColor("#3b82f6"));
  return (
    <C.Popover>
      <C.PopoverTrigger asChild>
        <C.Button variant="outline" aria-label="Accent color">
          <C.ColorSwatch color={color} size="sm" aria-label="Current accent" />
          <span className="font-mono text-xs tabular-nums">{color.toString("hex")}</span>
        </C.Button>
      </C.PopoverTrigger>
      <C.PopoverContent align="start" className="w-72">
        <C.ColorPicker label="Accent color" value={color} onValueChange={setColor} colors={hues} />
      </C.PopoverContent>
    </C.Popover>
  );
}

export const datesColorsFixtures: Readonly<Record<string, ComponentFixture>> = {
  Calendar: example(
    "Choose a date or page through months.",
    (s) => (
      <>
        <Panel>
          <C.Calendar
            aria-label="Choose day"
            defaultValue={date}
            todayValue={today}
            onValueChange={(value) => s.report(value?.toString())}
          />
        </Panel>
        <Variants title="Unavailable days and bounds">
          <Panel>
            <C.Calendar
              aria-label="Weekdays only"
              defaultValue={date.add({ days: 2 })}
              todayValue={today}
              isDateUnavailable={weekendsOff}
            />
          </Panel>
          <Panel>
            <C.Calendar
              aria-label="Bounded to one fortnight"
              defaultFocusedValue={date}
              minValue={date.subtract({ days: 4 })}
              maxValue={date.add({ days: 9 })}
              todayValue={today}
            />
          </Panel>
        </Variants>
        <Variants title="Two months">
          <Panel>
            <C.Calendar
              aria-label="Two months"
              defaultValue={date.add({ days: 10 })}
              visibleDuration={{ months: 2 }}
              todayValue={today}
            />
          </Panel>
        </Variants>
        <Variants title="States">
          <Panel>
            <C.Calendar aria-label="Disabled calendar" defaultValue={date} disabled />
          </Panel>
          <Panel>
            <C.Calendar aria-label="Read-only calendar" defaultValue={date} readOnly />
          </Panel>
          <Panel>
            <C.Calendar aria-label="Invalid calendar" defaultValue={date} isInvalid />
          </Panel>
        </Variants>
        <Variants title="Right to left">
          <Panel>
            <C.Calendar
              aria-label="Hebrew calendar"
              locale="he-IL"
              dir="rtl"
              defaultValue={date}
              todayValue={today}
            />
          </Panel>
        </Variants>
      </>
    ),
    '[role="grid"]',
    [click('button[aria-label^="Sunday, February 13"]', ".fixture-status", "2028-02-13")],
  ),
  RangeCalendar: example(
    "Choose a start and end date.",
    (s) => (
      <>
        <Panel>
          <C.RangeCalendar
            aria-label="Choose range"
            defaultValue={{ start: date, end: date.add({ days: 2 }) }}
            todayValue={today}
            onValueChange={(value) => s.report(value ? `${value.start}/${value.end}` : "Cleared")}
          />
        </Panel>
        <Variants title="Ranges that cross rows">
          <Panel>
            <C.RangeCalendar
              aria-label="Across weeks"
              defaultValue={{ start: date.add({ days: 5 }), end: date.add({ days: 15 }) }}
              todayValue={today}
            />
          </Panel>
          <Panel>
            <C.RangeCalendar
              aria-label="Single day"
              defaultValue={{ start: date.add({ days: 3 }), end: date.add({ days: 3 }) }}
              todayValue={today}
            />
          </Panel>
        </Variants>
        <Variants title="Two months">
          <Panel>
            <C.RangeCalendar
              aria-label="Two months range"
              defaultValue={{ start: date.add({ days: 12 }), end: date.add({ days: 36 }) }}
              visibleDuration={{ months: 2 }}
              todayValue={today}
            />
          </Panel>
        </Variants>
        <Variants title="Unavailable days and states">
          <Panel>
            <C.RangeCalendar
              aria-label="Weekdays only range"
              isDateUnavailable={weekendsOff}
              defaultValue={{ start: date.add({ days: 2 }), end: date.add({ days: 4 }) }}
            />
          </Panel>
          <Panel>
            <C.RangeCalendar
              aria-label="Disabled range"
              disabled
              defaultValue={{ start: date, end: date.add({ days: 3 }) }}
            />
          </Panel>
          <Panel>
            <C.RangeCalendar
              aria-label="Invalid range"
              isInvalid
              defaultValue={{ start: date, end: date.add({ days: 3 }) }}
            />
          </Panel>
        </Variants>
      </>
    ),
    '[role="grid"]',
    [
      click('button[aria-label^="Tuesday, February 15"]', "[data-selection-start]"),
      click(
        'button[aria-label^="Thursday, February 17"]',
        ".fixture-status",
        "2028-02-15/2028-02-17",
      ),
    ],
  ),
  DateField: example(
    "Date segments preserve calendar values.",
    (s) => (
      <>
        <C.DateField
          label="Date"
          defaultValue={date}
          onValueChange={(value) => s.report(value?.toString())}
        />
        <Variants title="Content" layout="grid">
          <C.DateField label="Start date" hint="Shown on the invoice." />
          <C.DateField label="Due date" isRequired defaultValue={date.add({ days: 30 })} />
          <C.DateField
            label="Appointment"
            granularity="minute"
            hourCycle={12}
            defaultValue={new CalendarDateTime(2028, 2, 12, 14, 30)}
          />
          <C.DateField label="Datum" locale="de-DE" defaultValue={date} />
        </Variants>
        <Variants title="States" layout="grid">
          <C.DateField
            label="Delivery date"
            defaultValue={date}
            isInvalid
            error="Choose a weekday."
          />
          <C.DateField label="Archived on" defaultValue={date} disabled />
          <C.DateField label="Created on" defaultValue={date} readOnly hint="Set automatically." />
        </Variants>
      </>
    ),
    'input[aria-label="day, Date"]',
    [key('input[aria-label="day, Date"]', "ArrowUp", ".fixture-status", "2028-02-13")],
  ),
  DatePicker: example(
    "Use either date segments or the calendar popover.",
    (s) => (
      <>
        <C.DatePicker
          label="Due date"
          defaultValue={date}
          todayValue={today}
          onValueChange={(value) => s.report(value?.toString())}
        />
        <Variants title="Content" layout="grid">
          <C.DatePicker label="Start date" hint="Work begins on this day." todayValue={today} />
          <C.DatePicker
            label="Review by"
            isRequired
            defaultValue={date.add({ days: 14 })}
            minValue={date}
            todayValue={today}
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.DatePicker
            label="Ship date"
            defaultValue={date}
            isInvalid
            error="Pick a date after the kickoff."
          />
          <C.DatePicker label="Closed on" defaultValue={date} disabled />
          <C.DatePicker label="Opened on" defaultValue={date} readOnly />
        </Variants>
      </>
    ),
    'button[aria-label="Choose date Due date"]',
    [
      click('button[aria-label="Choose date Due date"]', '[role="dialog"]'),
      click('button[aria-label^="Sunday, February 13"]', ".fixture-status", "2028-02-13"),
    ],
  ),
  DateRangePicker: example(
    "Choose both endpoints before the range commits.",
    (s) => (
      <>
        <C.DateRangePicker
          label="Trip"
          defaultValue={{ start: date, end: date.add({ days: 2 }) }}
          todayValue={today}
          onValueChange={(value) => s.report(value ? `${value.start}/${value.end}` : "Cleared")}
        />
        <Variants title="Content" layout="stack">
          <C.DateRangePicker label="Sprint" hint="Pick the first and last day." />
          <C.DateRangePicker
            label="Reporting period"
            isRequired
            defaultValue={{ start: date.subtract({ days: 20 }), end: date.add({ days: 9 }) }}
          />
        </Variants>
        <Variants title="States" layout="stack">
          <C.DateRangePicker
            label="Booking window"
            isInvalid
            error="The end date must come after the start."
            defaultValue={{ start: date, end: date.add({ days: 6 }) }}
          />
          <C.DateRangePicker
            label="Closed window"
            disabled
            defaultValue={{ start: date, end: date.add({ days: 6 }) }}
          />
          <C.DateRangePicker
            label="Past window"
            readOnly
            defaultValue={{ start: date, end: date.add({ days: 6 }) }}
          />
        </Variants>
      </>
    ),
    'button[aria-label="Choose date range Trip"]',
    [
      click('button[aria-label="Choose date range Trip"]', '[role="dialog"]'),
      click('button[aria-label^="Tuesday, February 15"]', "[data-selection-start]"),
      click(
        'button[aria-label^="Thursday, February 17"]',
        ".fixture-status",
        "2028-02-15/2028-02-17",
      ),
    ],
  ),
  TimeField: example(
    "Adjust local time without converting to a browser Date.",
    (s) => (
      <>
        <C.TimeField
          label="Time"
          defaultValue={new Time(14, 30)}
          hourCycle={24}
          onValueChange={(value) => s.report(value?.toString())}
        />
        <Variants title="Formats" layout="grid">
          <C.TimeField label="Start" hourCycle={12} defaultValue={new Time(9, 15)} />
          <C.TimeField
            label="Precise time"
            granularity="second"
            hourCycle={24}
            defaultValue={new Time(7, 5, 30)}
          />
          <C.TimeField
            label="Hour only"
            granularity="hour"
            hourCycle={24}
            defaultValue={new Time(18)}
          />
          <C.TimeField label="Reminder" hint="Local to your device." />
        </Variants>
        <Variants title="States" layout="grid">
          <C.TimeField
            label="Opens at"
            hourCycle={24}
            defaultValue={new Time(23, 0)}
            isInvalid
            error="Opening time must be before closing."
          />
          <C.TimeField label="Closed at" hourCycle={24} defaultValue={new Time(17, 0)} disabled />
          <C.TimeField label="Logged at" hourCycle={24} defaultValue={new Time(9, 41)} readOnly />
        </Variants>
      </>
    ),
    'input[aria-label="minute, Time"]',
    [key('input[aria-label="minute, Time"]', "ArrowUp", ".fixture-status", "14:31")],
  ),
  ColorArea: example(
    "Arrow keys adjust two color channels.",
    (s) => (
      <>
        <C.ColorArea
          label="Saturation and brightness"
          defaultValue="#336699"
          onValueChange={(value) => s.report(value.toString("hex"))}
        />
        <Variants title="Channels" layout="grid">
          <C.ColorArea
            label="Saturation and lightness"
            colorSpace="hsl"
            yChannel="lightness"
            defaultValue="#d9480f"
          />
          <C.ColorArea label="Violet area" defaultValue="#8b5cf6" />
        </Variants>
        <Variants title="States" layout="grid">
          <C.ColorArea label="Disabled area" defaultValue="#336699" disabled />
          <C.ColorArea label="Read-only area" defaultValue="#336699" readOnly />
        </Variants>
      </>
    ),
    '[role="slider"]',
    [key('[role="slider"]', "ArrowUp", ".fixture-status", "#")],
  ),
  ColorField: example(
    "Enter a CSS color and press Enter.",
    (s) => (
      <>
        <C.ColorField
          label="Color"
          defaultValue="#336699"
          onValueChange={(value) => s.report(value.toString("hex"))}
        />
        <Variants title="Content" layout="grid">
          <C.ColorField
            label="Brand color"
            defaultValue="#8b5cf6"
            hint="A hex value or any CSS color."
          />
          <C.ColorField
            label="Overlay"
            defaultValue="rgb(15 23 42 / 0.4)"
            hint="Includes opacity."
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.ColorField
            label="Badge color"
            defaultValue="#ef4444"
            isInvalid
            error="This color is too light for white text."
          />
          <C.ColorField label="Locked color" defaultValue="#64748b" disabled />
          <C.ColorField label="Inherited color" defaultValue="#22c55e" readOnly />
        </Variants>
      </>
    ),
    "input",
    [input("input", "#ff0000", ""), key("input", "Enter", ".fixture-status", "#FF0000")],
  ),
  ColorPicker: example(
    "Area, channels, text and presets share one value.",
    (s) => (
      <>
        <C.ColorPicker
          label="Accent"
          defaultValue="#336699"
          colors={[
            { color: "#ef4444", label: "Red" },
            { color: "#22c55e", label: "Green" },
            { color: "#3b82f6", label: "Blue" },
            { color: "#f59e0b", label: "Amber" },
            { color: "#8b5cf6", label: "Violet" },
            { color: "#0f172a", label: "Ink" },
          ]}
          onValueChange={(value) => s.report(value.toString("hex"))}
        />
        <Variants title="In a popover">
          <ColorPopoverDemo />
        </Variants>
        <Variants title="Variants">
          <C.ColorPicker label="Opaque fill" defaultValue="#06b6d4" showAlpha={false} />
          <C.ColorPicker
            label="Translucent overlay"
            defaultValue="rgb(15 23 42 / 0.45)"
            colors={grays}
          />
          <C.ColorPicker label="Disabled picker" defaultValue="#8b5cf6" colors={hues} disabled />
        </Variants>
      </>
    ),
    "fieldset",
    [click('button[aria-label="Green"]', ".fixture-status", "#22C55E")],
  ),
  ColorSlider: example(
    "Adjust a single color channel with arrow keys.",
    (s) => (
      <>
        <C.ColorSlider
          label="Hue"
          channel="hue"
          defaultValue="hsl(120 100% 50%)"
          onValueChange={(value) => s.report(value.getChannelValue("hue"))}
        />
        <Variants title="Channels" layout="grid">
          <C.ColorSlider label="Saturation" channel="saturation" defaultValue="#3b82f6" />
          <C.ColorSlider label="Brightness" channel="brightness" defaultValue="#3b82f6" />
          <C.ColorSlider label="Red" channel="red" defaultValue="#3b82f6" />
          <C.ColorSlider label="Opacity" channel="alpha" defaultValue="rgb(59 130 246 / 0.6)" />
        </Variants>
        <Variants title="Orientation and states">
          <C.ColorSlider
            label="Vertical"
            channel="hue"
            orientation="vertical"
            defaultValue="hsl(210 90% 55%)"
          />
          <div className="flex min-w-48 flex-1 flex-col gap-4">
            <C.ColorSlider label="Disabled" channel="hue" defaultValue="#8b5cf6" disabled />
            <C.ColorSlider label="Read-only" channel="hue" defaultValue="#8b5cf6" readOnly />
          </div>
        </Variants>
      </>
    ),
    'input[type="range"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "121")],
  ),
  ColorSwatch: example(
    "A named preview communicates its color accessibly.",
    () => (
      <>
        <C.ColorSwatch color="#336699" aria-label="Blue accent" />
        <Variants title="Sizes">
          <C.ColorSwatch color="#8b5cf6" size="sm" aria-label="Violet, small" />
          <C.ColorSwatch color="#8b5cf6" size="md" aria-label="Violet, medium" />
          <C.ColorSwatch color="#8b5cf6" size="lg" aria-label="Violet, large" />
        </Variants>
        <Variants title="Transparency">
          <C.ColorSwatch color="rgb(59 130 246 / 0.7)" size="lg" aria-label="Blue at 70%" />
          <C.ColorSwatch color="rgb(59 130 246 / 0.35)" size="lg" aria-label="Blue at 35%" />
          <C.ColorSwatch color="rgb(59 130 246 / 0)" size="lg" aria-label="Fully transparent" />
        </Variants>
        <Variants title="In context" layout="stack">
          {hues.slice(0, 4).map((hue) => (
            <div key={hue.label} className="flex items-center gap-3 text-sm">
              <C.ColorSwatch color={hue.color} aria-label={hue.label} />
              <span className="w-16 font-medium">{hue.label}</span>
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {C.parseColor(hue.color).toString("hex")}
              </span>
            </div>
          ))}
        </Variants>
      </>
    ),
    '[role="img"][aria-label="Blue accent"]',
  ),
  ColorSwatchPicker: example(
    "Choose a named color preset.",
    (s) => (
      <>
        <C.ColorSwatchPicker
          label="Colors"
          defaultValue="#3b82f6"
          colors={hues}
          onValueChange={(value) => s.report(value.toString("hex"))}
        />
        <Variants title="Sizes" layout="stack">
          <C.ColorSwatchPicker
            label="Small colors"
            size="sm"
            defaultValue="#22c55e"
            colors={hues}
          />
          <C.ColorSwatchPicker
            label="Large colors"
            size="lg"
            defaultValue="#ec4899"
            colors={hues}
          />
        </Variants>
        <Variants title="Transparent and neutral">
          <C.ColorSwatchPicker label="Surface colors" defaultValue="#0f172a00" colors={grays} />
        </Variants>
        <Variants title="States" layout="stack">
          <C.ColorSwatchPicker
            label="One option unavailable"
            defaultValue="#06b6d4"
            colors={hues.map((hue) =>
              hue.label === "Amber" ? { ...hue, label: "Amber, unavailable", disabled: true } : hue,
            )}
          />
          <C.ColorSwatchPicker
            label="Disabled colors"
            defaultValue="#8b5cf6"
            colors={hues}
            disabled
          />
        </Variants>
      </>
    ),
    '[role="listbox"]',
    [click('button[aria-label="Green"]', ".fixture-status", "#22C55E")],
  ),
  ColorWheel: example(
    "Arrow keys rotate the hue.",
    (s) => (
      <>
        <C.ColorWheel
          label="Hue wheel"
          defaultValue="hsl(120 100% 50%)"
          onValueChange={(value) => s.report(value.getChannelValue("hue"))}
        />
        <Variants title="Sizes and states">
          <C.ColorWheel
            label="Compact wheel"
            outerRadius={64}
            innerRadius={48}
            defaultValue="hsl(260 80% 60%)"
          />
          <C.ColorWheel
            label="Disabled wheel"
            outerRadius={64}
            innerRadius={48}
            defaultValue="hsl(30 90% 55%)"
            disabled
          />
        </Variants>
      </>
    ),
    '[role="slider"]',
    [key('[role="slider"]', "ArrowRight", ".fixture-status", "121")],
  ),
};
