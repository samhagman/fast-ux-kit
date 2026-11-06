// Gallery demos: Date, time and color (dates.tsx, colors.tsx).
import { Time } from "@internationalized/date";
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, date, type ComponentFixture } from "./fixture-kit";

export const datesColorsFixtures: Readonly<Record<string, ComponentFixture>> = {
  Calendar: example(
    "Choose a date or page through months.",
    (s) => (
      <C.Calendar
        aria-label="Choose day"
        defaultValue={date}
        onValueChange={(value) => s.report(value?.toString())}
      />
    ),
    '[role="grid"]',
    [click('button[aria-label^="Sunday, February 13"]', ".fixture-status", "2028-02-13")],
  ),
  RangeCalendar: example(
    "Choose a start and end date.",
    (s) => (
      <C.RangeCalendar
        aria-label="Choose range"
        defaultValue={{ start: date, end: date.add({ days: 2 }) }}
        onValueChange={(value) => s.report(value ? `${value.start}/${value.end}` : "Cleared")}
      />
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
      <C.DateField
        label="Date"
        defaultValue={date}
        onValueChange={(value) => s.report(value?.toString())}
      />
    ),
    'input[aria-label="day, Date"]',
    [key('input[aria-label="day, Date"]', "ArrowUp", ".fixture-status", "2028-02-13")],
  ),
  DatePicker: example(
    "Use either date segments or the calendar popover.",
    (s) => (
      <C.DatePicker
        label="Due date"
        defaultValue={date}
        onValueChange={(value) => s.report(value?.toString())}
      />
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
      <C.DateRangePicker
        label="Trip"
        defaultValue={{ start: date, end: date.add({ days: 2 }) }}
        onValueChange={(value) => s.report(value ? `${value.start}/${value.end}` : "Cleared")}
      />
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
      <C.TimeField
        label="Time"
        defaultValue={new Time(14, 30)}
        hourCycle={24}
        onValueChange={(value) => s.report(value?.toString())}
      />
    ),
    'input[aria-label="minute, Time"]',
    [key('input[aria-label="minute, Time"]', "ArrowUp", ".fixture-status", "14:31")],
  ),
  ColorArea: example(
    "Arrow keys adjust two color channels.",
    (s) => (
      <C.ColorArea
        label="Saturation and brightness"
        defaultValue="#336699"
        onValueChange={(value) => s.report(value.toString("hex"))}
      />
    ),
    '[role="slider"]',
    [key('[role="slider"]', "ArrowUp", ".fixture-status", "#")],
  ),
  ColorField: example(
    "Enter a CSS color and press Enter.",
    (s) => (
      <C.ColorField
        label="Color"
        defaultValue="#336699"
        onValueChange={(value) => s.report(value.toString("hex"))}
      />
    ),
    "input",
    [input("input", "#ff0000", ""), key("input", "Enter", ".fixture-status", "#FF0000")],
  ),
  ColorPicker: example(
    "Area, channels, text and presets share one value.",
    (s) => (
      <C.ColorPicker
        label="Accent"
        defaultValue="#336699"
        colors={[
          { color: "#ef4444", label: "Red" },
          { color: "#22c55e", label: "Green" },
        ]}
        onValueChange={(value) => s.report(value.toString("hex"))}
      />
    ),
    "fieldset",
    [click('button[aria-label="Green"]', ".fixture-status", "#22C55E")],
  ),
  ColorSlider: example(
    "Adjust a single color channel with arrow keys.",
    (s) => (
      <C.ColorSlider
        label="Hue"
        channel="hue"
        defaultValue="hsl(120 100% 50%)"
        onValueChange={(value) => s.report(value.getChannelValue("hue"))}
      />
    ),
    'input[type="range"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "121")],
  ),
  ColorSwatch: example(
    "A named preview communicates its color accessibly.",
    () => <C.ColorSwatch color="#336699" aria-label="Blue accent" />,
    '[role="img"][aria-label="Blue accent"]',
  ),
  ColorSwatchPicker: example(
    "Choose a named color preset.",
    (s) => (
      <C.ColorSwatchPicker
        label="Colors"
        colors={[
          { color: "#ef4444", label: "Red" },
          { color: "#22c55e", label: "Green" },
        ]}
        onValueChange={(value) => s.report(value.toString("hex"))}
      />
    ),
    '[role="listbox"]',
    [click('button[aria-label="Green"]', ".fixture-status", "#22C55E")],
  ),
  ColorWheel: example(
    "Arrow keys rotate the hue.",
    (s) => (
      <C.ColorWheel
        label="Hue wheel"
        defaultValue="hsl(120 100% 50%)"
        onValueChange={(value) => s.report(value.getChannelValue("hue"))}
      />
    ),
    '[role="slider"]',
    [key('[role="slider"]', "ArrowRight", ".fixture-status", "121")],
  ),
};
