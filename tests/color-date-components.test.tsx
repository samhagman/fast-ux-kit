import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createElement, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { browserErrors } from "./components-dom.js";
import { CalendarDate, Time, parseZonedDateTime } from "@internationalized/date";

const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const Colors = await import("../src/components/colors.js");
const Dates = await import("../src/components/dates.js");

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const click = async (element: HTMLElement) => {
  await act(async () => {
    element.focus();
    fireEvent.click(element);
  });
};

test("color values preserve transparent channels and immutable edits", () => {
  const original = Colors.parseColor("rgb(255 0 0 / 0)");
  const changed = original.toFormat("hsb").withChannelValue("hue", 120);
  assert.equal(original.getChannelValue("alpha"), 0);
  assert.equal(original.toString("hexa"), "#FF000000");
  assert.equal(changed.toString("hexa"), "#00FF0000");
  assert.throws(() => Colors.parseColor("#12"));
});

test("controlled color picker rejects invalid drafts and disabled presets", async () => {
  const changes: string[] = [];
  const view = render(
    createElement(Colors.ColorPicker, {
      label: "Accent",
      value: "#336699",
      onValueChange: (value) => changes.push(value.toString("hex")),
      colors: [
        { color: "red", label: "Red", disabled: true },
        { color: "lime", label: "Green" },
      ],
    }),
  );
  const field = view.getByRole("textbox", { name: "Color value" }) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(field, { target: { value: "#12" } });
  });
  await act(async () => {
    fireEvent.blur(field);
  });
  assert.equal(field.value, "#336699".toUpperCase());
  await click(view.getByRole("option", { name: "Red" }));
  assert.equal(changes.length, 0);
  await click(view.getByRole("option", { name: "Green" }));
  assert.deepEqual(changes, ["#00FF00"]);
  assert.equal(field.value, "#336699".toUpperCase());
  assert.equal(view.getAllByRole("slider").length, 3);
});

test("color area and Base slider respond to keyboard updates", async () => {
  const values: number[] = [];
  const view = render(
    createElement(Colors.ColorSlider, {
      label: "Hue",
      channel: "hue",
      defaultValue: "hsl(120 100% 50%)",
      onChange: (color) => values.push(color.getChannelValue("hue")),
    }),
  );
  const slider = view.getByRole("slider", { name: "Hue" });
  await act(async () => {
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyUp(slider, { key: "ArrowRight" });
  });
  assert.equal(values.at(-1), 121);
  view.unmount();
  const areaValues: number[] = [];
  const area = render(
    createElement(Colors.ColorArea, {
      label: "Channels",
      defaultValue: "hsl(120 50% 50%)",
      colorSpace: "hsl",
      yChannel: "lightness",
      onChange: (color) => areaValues.push(color.getChannelValue("lightness")),
    }),
  );
  await act(async () => {
    fireEvent.keyDown(area.getByRole("slider"), { key: "ArrowUp" });
  });
  assert.equal(areaValues.at(-1), 51);
});

test("calendar month pages retain leap dates and respect bounds", async () => {
  const values: string[] = [];
  const view = render(
    createElement(Dates.Calendar, {
      "aria-label": "Dates",
      defaultFocusedValue: new CalendarDate(2028, 2, 12),
      visibleDuration: { months: 2 },
      minValue: new CalendarDate(2028, 2, 10),
      onChange: (value) => values.push(String(value)),
    }),
  );
  assert.equal(view.getAllByRole("grid").length, 2);
  assert.equal(
    (view.getByRole("button", { name: /^Wednesday, February 9, 2028/ }) as HTMLButtonElement)
      .disabled,
    true,
  );
  await click(view.getByRole("button", { name: /^Tuesday, February 29, 2028/ }));
  assert.equal(values.at(-1), "2028-02-29");
  await click(view.getByRole("button", { name: "Next period" }));
  assert.ok(view.getByRole("button", { name: /^Wednesday, May 31, 2028/ }));
});

test("segmented date edits preserve a zoned value's time and zone", async () => {
  const values: import("../src/components/dates.js").DateValue[] = [];
  const view = render(
    createElement(Dates.DateField, {
      label: "Appointment",
      defaultValue: parseZonedDateTime("2028-02-29T14:30[America/New_York]"),
      granularity: "day",
      onChange: (value) => {
        if (value) values.push(value);
      },
    }),
  );
  await act(async () => {
    fireEvent.change(view.getByRole("spinbutton", { name: "day, Appointment" }), {
      target: { value: "28" },
    });
  });
  const result = values.at(-1) as ReturnType<typeof parseZonedDateTime>;
  assert.equal(result.day, 28);
  assert.equal(result.hour, 14);
  assert.equal(result.timeZone, "America/New_York");
});

test("time fields retain midnight and reject edits while read only", async () => {
  let changes = 0;
  const view = render(
    createElement(Dates.TimeField, {
      label: "Time",
      value: new Time(0, 0),
      hourCycle: 24,
      readOnly: true,
      onChange: () => changes++,
    }),
  );
  const hour = view.getByRole("spinbutton", { name: "hour, Time" }) as HTMLInputElement;
  assert.equal(hour.value, "0");
  await act(async () => {
    fireEvent.keyDown(hour, { key: "ArrowUp" });
  });
  assert.equal(changes, 0);
});

test("range picker abandons unfinished selections when its popover closes", async () => {
  const changes: string[] = [];
  const view = render(
    createElement(Dates.DateRangePicker, {
      label: "Trip",
      defaultValue: { start: new CalendarDate(2028, 2, 10), end: new CalendarDate(2028, 2, 12) },
      onChange: (value) => changes.push(value ? `${value.start}/${value.end}` : "empty"),
    }),
  );
  const trigger = view.getByRole("button", { name: "Choose date range Trip" });
  await click(trigger);
  await click(await view.findByRole("button", { name: /^Sunday, February 20, 2028/ }));
  assert.equal(changes.length, 0);
  await act(async () => {
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  });
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
  await click(trigger);
  await click(await view.findByRole("button", { name: /^Tuesday, February 22, 2028/ }));
  assert.equal(changes.length, 0);
  await click(view.getByRole("button", { name: /^Thursday, February 24, 2028/ }));
  assert.deepEqual(changes, ["2028-02-22/2028-02-24"]);
  await waitFor(() => assert.equal(view.queryByRole("dialog"), null));
});

test("horizontal color sliders reserve room for endpoint hit targets", async () => {
  const values: number[] = [];
  const view = render(
    createElement(Colors.ColorSlider, {
      label: "Hue",
      channel: "hue",
      defaultValue: "hsl(120 100% 50%)",
      onChange: (color) => values.push(color.getChannelValue("hue")),
    }),
  );
  const control = view.container.querySelector<HTMLElement>(".fux-slider__control");
  assert.equal(control?.style.paddingInline, "12px");
  const input = view.getByRole("slider", { name: "Hue" });
  await act(async () => {
    fireEvent.keyDown(input, { key: "End" });
  });
  assert.equal(values.at(-1), 360);
});

test("color area pointer, gradient, thumb and keyboard share the RTL direction", async () => {
  const changes: number[] = [];
  const view = render(
    createElement(Colors.ColorArea, {
      label: "RTL color",
      dir: "rtl",
      defaultValue: "red",
      onChange: (color) => changes.push(color.getChannelValue("saturation")),
    }),
  );
  const area = view.getByRole("slider", { name: "RTL color" });
  area.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 }) as DOMRect;
  await act(async () => {
    area.dispatchEvent(
      new MouseEvent("pointerdown", {
        bubbles: true,
        button: 0,
        clientX: 75,
        clientY: 50,
      }),
    );
  });
  assert.ok(Math.abs(changes.at(-1)! - 25) < 0.01);
  const thumb = area.querySelector<HTMLElement>(".fux-color-thumb")!;
  assert.equal(thumb.style.insetInlineStart, "25%");
  assert.equal(thumb.style.transform, "translate(50%, -50%)");
  assert.match(
    renderToStaticMarkup(createElement(Colors.ColorArea, { dir: "rtl", defaultValue: "red" })),
    /linear-gradient\(to left/,
  );
  await act(async () => {
    fireEvent.keyDown(area, { key: "ArrowLeft" });
  });
  assert.ok(Math.abs(changes.at(-1)! - 26) < 0.01);
});

test("a controlled empty range can be entered through its fields", async () => {
  const changes: string[] = [];
  function ControlledRange() {
    const [value, setValue] = useState<import("../src/components/dates.js").DateRange | null>(null);
    return createElement(Dates.DateRangePicker, {
      label: "Trip",
      name: "trip",
      value,
      placeholderValue: new CalendarDate(2028, 2, 10),
      onChange: (next) => {
        changes.push(next ? `${next.start}/${next.end}` : "empty");
        setValue(next);
      },
    });
  }
  const view = render(createElement(ControlledRange));
  const start = view.getByRole("spinbutton", { name: "day, Start Trip" }) as HTMLInputElement;
  const end = view.getByRole("spinbutton", { name: "day, End Trip" }) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(start, { target: { value: "11" } });
  });
  assert.equal(start.value, "11");
  assert.equal(end.value, "");
  assert.deepEqual(changes, []);
  await act(async () => {
    fireEvent.change(end, { target: { value: "15" } });
  });
  assert.deepEqual(changes, ["2028-02-11/2028-02-15"]);
  assert.equal(start.value, "11");
  assert.equal(end.value, "15");
  assert.equal(
    view.container.querySelector<HTMLInputElement>('input[name="trip"]')?.value,
    "2028-02-11/2028-02-15",
  );
});

test("controlled range drafts restore the host value when a completed edit is rejected", async () => {
  const changes: unknown[] = [];
  const view = render(
    createElement(Dates.DateRangePicker, {
      label: "Trip",
      value: null,
      placeholderValue: new CalendarDate(2028, 2, 10),
      onChange: (next) => changes.push(next),
    }),
  );
  const start = view.getByRole("spinbutton", { name: "day, Start Trip" }) as HTMLInputElement;
  const end = view.getByRole("spinbutton", { name: "day, End Trip" }) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(start, { target: { value: "11" } });
  });
  await act(async () => {
    fireEvent.change(end, { target: { value: "15" } });
  });
  assert.equal(changes.length, 1);
  assert.equal(start.value, "");
  assert.equal(end.value, "");
});

test("meridiem edits respect both bounds and still accept a permitted time", async () => {
  for (const [hour, period, min, max, expected] of [
    [10, "pm", 9, 17, null],
    [14, "am", 9, 17, null],
    [10, "pm", 9, 23, "22:00:00"],
  ] as const) {
    const changes: string[] = [];
    const view = render(
      createElement(Dates.TimeField, {
        label: "Appointment",
        defaultValue: new Time(hour),
        minValue: new Time(min),
        maxValue: new Time(max),
        hourCycle: 12,
        onChange: (next) => changes.push(String(next)),
      }),
    );
    const meridiem = view.getByRole("combobox", {
      name: "day period, Appointment",
    }) as HTMLSelectElement;
    await act(async () => {
      fireEvent.change(meridiem, { target: { value: period } });
    });
    assert.deepEqual(changes, expected ? [expected] : []);
    assert.equal(meridiem.value, expected ? period : hour < 12 ? "am" : "pm");
    view.unmount();
  }
});

test("unavailable in-range calendar dates remain navigable and cannot be selected", async () => {
  const changes: string[] = [];
  const view = render(
    createElement(Dates.Calendar, {
      defaultFocusedValue: new CalendarDate(2028, 2, 11),
      isDateUnavailable: (date) => date.day === 12,
      onChange: (next) => changes.push(String(next)),
    }),
  );
  const friday = view.getByRole("button", { name: /^Friday, February 11, 2028/ });
  const saturday = view.getByRole("button", { name: /^Saturday, February 12, 2028/ });
  const sunday = view.getByRole("button", { name: /^Sunday, February 13, 2028/ });
  await act(async () => {
    friday.focus();
    fireEvent.keyDown(friday, { key: "ArrowRight" });
  });
  assert.equal(document.activeElement, saturday);
  assert.equal(saturday.getAttribute("aria-disabled"), "true");
  await click(saturday);
  assert.deepEqual(changes, []);
  await act(async () => {
    fireEvent.keyDown(saturday, { key: "ArrowRight" });
  });
  assert.equal(document.activeElement, sunday);
  await click(sunday);
  assert.deepEqual(changes, ["2028-02-13"]);
});

test("horizontal RTL color sliders align their gradient and keyboard direction", async () => {
  const changes: number[] = [];
  const props = {
    dir: "rtl" as const,
    label: "Hue",
    channel: "hue" as const,
    defaultValue: "hsl(120 100% 50%)",
    onChange: (color: import("../src/components/colors.js").ColorValue) =>
      changes.push(color.getChannelValue("hue")),
  };
  const view = render(createElement(Colors.ColorSlider, props));
  const slider = view.getByRole("slider", { name: "Hue" });
  await act(async () => {
    slider.focus();
    fireEvent.keyDown(slider, { key: "ArrowLeft" });
    fireEvent.keyUp(slider, { key: "ArrowLeft" });
  });
  assert.equal(changes.at(-1), 121);
  assert.match(renderToStaticMarkup(createElement(Colors.ColorSlider, props)), /to left/);
  assert.match(
    renderToStaticMarkup(createElement(Colors.ColorSlider, { ...props, orientation: "vertical" })),
    /to top/,
  );
});
