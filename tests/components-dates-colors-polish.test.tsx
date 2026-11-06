import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { browserErrors } from "./components-dom.js";
import { CalendarDate, Time } from "@internationalized/date";

const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const Colors = await import("../src/components/colors.js");
const Dates = await import("../src/components/dates.js");

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const feb = (day: number) => new CalendarDate(2028, 2, day);

test("calendar marks the given day as today and keeps the server markup free of it", async () => {
  const props = { "aria-label": "Dates", defaultFocusedValue: feb(12), todayValue: feb(9) };
  const view = render(createElement(Dates.Calendar, props));
  const today = view.container.querySelectorAll("[data-today]");
  assert.equal(today.length, 1);
  assert.equal(today[0]?.getAttribute("aria-current"), "date");
  assert.match(today[0]?.getAttribute("aria-label") ?? "", /^Wednesday, February 9, 2028/);
  // Without a given date the local "today" is resolved after mount, never during render.
  assert.doesNotMatch(
    renderToStaticMarkup(createElement(Dates.Calendar, { defaultFocusedValue: feb(12) })),
    /data-today/,
  );
});

test("calendar navigation uses icon buttons, not text glyphs, and weekday headers carry full names", () => {
  const view = render(createElement(Dates.Calendar, { defaultFocusedValue: feb(12) }));
  for (const name of ["Previous month", "Next month"]) {
    const button = view.getByRole("button", { name });
    assert.equal(button.textContent, "");
    assert.ok(button.querySelector("svg"));
  }
  const headers = [...view.container.querySelectorAll("th")];
  assert.equal(headers.length, 7);
  assert.ok(headers.every((header) => header.getAttribute("abbr")));
});

test("range calendar flags its band, caps and unavailable cells for styling", () => {
  const view = render(
    createElement(Dates.RangeCalendar, {
      defaultFocusedValue: feb(12),
      defaultValue: { start: feb(14), end: feb(17) },
      isDateUnavailable: (date) => date.day === 20,
    }),
  );
  const band = [...view.container.querySelectorAll("td[data-in-range]")];
  assert.deepEqual(
    band.map((cell) => cell.textContent),
    ["14", "15", "16", "17"],
  );
  assert.equal(view.container.querySelectorAll("td[data-range-start]").length, 1);
  assert.equal(view.container.querySelectorAll("td[data-range-end]").length, 1);
  assert.equal(
    view.container.querySelector("td[data-range-start]")?.textContent,
    "14",
    "the start cap is the first day",
  );
  const unavailable = view.container.querySelector("button[data-unavailable]");
  assert.equal(unavailable?.textContent, "20");
});

test("only selected days turn destructive when a calendar is invalid", () => {
  const view = render(
    createElement(Dates.Calendar, {
      defaultFocusedValue: feb(12),
      defaultValue: feb(12),
      isInvalid: true,
    }),
  );
  const selected = view.container.querySelectorAll("button[data-selected][data-invalid]");
  assert.equal(selected.length, 1);
});

test("pickers open from a calendar icon, and the popup focuses the focused day", async () => {
  const view = render(
    createElement(Dates.DatePicker, { label: "Due date", defaultValue: feb(12) }),
  );
  const trigger = view.getByRole("button", { name: "Choose date Due date" });
  assert.equal(trigger.textContent, "");
  assert.ok(trigger.querySelector("svg"), "the calendar button shows an icon");
  await act(async () => {
    trigger.focus();
    fireEvent.click(trigger);
    await new Promise((resolve) => setTimeout(resolve, 50));
  });
  const dialog = await view.findByRole("dialog");
  assert.ok(dialog.querySelector(".fux-calendar"));
  assert.match(document.activeElement?.getAttribute("aria-label") ?? "", /February 12, 2028/);
});

test("empty segments show a format hint and minutes read as two digits", () => {
  const empty = render(createElement(Dates.DateField, { label: "Start" }));
  const day = empty.getByRole("spinbutton", { name: "day, Start" }) as HTMLInputElement;
  assert.equal(day.placeholder, "dd");
  assert.equal(day.value, "");
  assert.equal(day.hasAttribute("data-placeholder"), true);
  empty.unmount();
  const time = render(
    createElement(Dates.TimeField, { label: "Start", value: new Time(9, 5), hourCycle: 24 }),
  );
  assert.equal(
    (time.getByRole("spinbutton", { name: "hour, Start" }) as HTMLInputElement).value,
    "9",
  );
  assert.equal(
    (time.getByRole("spinbutton", { name: "minute, Start" }) as HTMLInputElement).value,
    "05",
  );
});

test("date and time fields share one frame that reflects invalid, disabled and read-only", () => {
  const states = [
    ["isInvalid", "data-invalid"],
    ["disabled", "data-disabled"],
    ["readOnly", "data-readonly"],
  ] as const;
  for (const [prop, attribute] of states) {
    const view = render(
      createElement(Dates.DateField, { label: "Date", defaultValue: feb(12), [prop]: true }),
    );
    const frame = view.container.querySelector(".fux-date-input");
    assert.ok(frame?.hasAttribute(attribute), `${prop} marks the frame`);
    view.unmount();
  }
  const error = render(
    createElement(Dates.DateField, { label: "Date", defaultValue: feb(12), error: "Too late." }),
  );
  assert.ok(error.container.querySelector(".fux-date-input[data-invalid]"));
  assert.equal(
    error.container.querySelector(".fux-error svg")?.getAttribute("aria-hidden"),
    "true",
  );
  assert.ok(error.getByText("Too late."));
});

test("required fields mark their label visually without changing its accessible name", () => {
  const view = render(createElement(Dates.DateField, { label: "Due", isRequired: true }));
  const star = view.container.querySelector(".fux-label__required");
  assert.equal(star?.getAttribute("aria-hidden"), "true");
  assert.ok(view.getByRole("group", { name: "Due" }));
});

test("swatches paint their color over a checkerboard so transparency stays visible", () => {
  const view = render(
    createElement(Colors.ColorSwatch, { color: "rgb(59 130 246 / 0.4)", size: "lg" }),
  );
  const swatch = view.getByRole("img") as HTMLElement;
  assert.ok(swatch.classList.contains("fux-checker"));
  assert.equal(swatch.dataset.size, "lg");
  const fill = swatch.querySelector<HTMLElement>(".fux-color-swatch__fill")!;
  assert.match(fill.style.backgroundColor, /\/ 0\.4/);
});

test("the selected preset shows a check and the others do not", async () => {
  const view = render(
    createElement(Colors.ColorSwatchPicker, {
      label: "Colors",
      defaultValue: "#22c55e",
      size: "sm",
      colors: [
        { color: "#ef4444", label: "Red" },
        { color: "#22c55e", label: "Green" },
      ],
    }),
  );
  const green = view.getByRole("option", { name: "Green" });
  const red = view.getByRole("option", { name: "Red" });
  assert.equal(green.getAttribute("aria-selected"), "true");
  assert.ok(green.querySelector(".fux-color-swatch__check"));
  assert.equal(red.querySelector(".fux-color-swatch__check"), null);
  await act(async () => {
    fireEvent.click(red);
  });
  assert.ok(red.querySelector(".fux-color-swatch__check"));
  assert.equal(green.querySelector(".fux-color-swatch__check"), null);
  assert.equal(view.getByRole("listbox", { name: "Colors" }).getAttribute("data-size"), "sm");
});

test("thumbs paint their own color and the opacity ramp sits on a checkerboard", () => {
  const view = render(
    createElement(Colors.ColorSlider, {
      label: "Opacity",
      channel: "alpha",
      defaultValue: "rgb(59 130 246 / 0.5)",
    }),
  );
  const track = view.container.querySelector<HTMLElement>(".fux-slider__track")!;
  assert.ok(track.classList.contains("fux-checker"));
  assert.match(track.style.getPropertyValue("--fux-gradient"), /linear-gradient\(to right/);
  const thumb = view.container.querySelector<HTMLElement>(".fux-color-thumb")!;
  assert.ok(thumb.classList.contains("fux-color-fill"));
  assert.ok(thumb.style.getPropertyValue("--fux-fill"));
  assert.equal(
    view.container.querySelector<HTMLElement>(".fux-slider__control")?.style.paddingInline,
    "12px",
  );
});

test("a color field previews its value and flags errors without losing the label link", () => {
  const view = render(
    createElement(Colors.ColorField, {
      label: "Brand",
      defaultValue: "#8b5cf6",
      error: "Too light.",
    }),
  );
  const input = view.getByRole("textbox", { name: "Brand" }) as HTMLInputElement;
  assert.equal(input.value, "#8B5CF6");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.ok(input.getAttribute("aria-describedby"));
  const chip = view.container.querySelector<HTMLElement>(".fux-color-field__chip")!;
  assert.equal(chip.getAttribute("aria-hidden"), "true");
  assert.ok(chip.style.getPropertyValue("--fux-fill"));
});

test("the color wheel previews the current color in its center", () => {
  const view = render(createElement(Colors.ColorWheel, { defaultValue: "hsl(120 100% 50%)" }));
  const preview = view.container.querySelector<HTMLElement>(".fux-color-wheel__preview")!;
  assert.equal(preview.getAttribute("aria-hidden"), "true");
  assert.ok(preview.style.getPropertyValue("--fux-fill"));
});

test("the color picker keeps one accessible group and shows a single value field", () => {
  const view = render(
    createElement(Colors.ColorPicker, {
      label: "Accent",
      defaultValue: "#336699",
      colors: ["#ef4444", "#22c55e"],
    }),
  );
  assert.ok(view.getByRole("group", { name: "Accent" }));
  assert.equal(view.getAllByRole("textbox").length, 1);
  assert.equal(view.getAllByRole("option").length, 2);
});
