import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const C = await import("../src/components/aria.js");
const { CalendarDate } = await import("@internationalized/date");
const { arkAdvancedDemos } = await import("../examples/docs/demos/ark-advanced-demos.js");

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught DOM errors");
});
async function click(element: Element) {
  await act(async () => {
    if (element instanceof HTMLElement) element.focus();
    fireEvent.click(element);
  });
}

test("color slider can be named by the owner aria-label without a visible recipe label", () => {
  const raw = render(
    <C.Primitives.ColorSlider
      aria-label="Custom hue"
      channel="hue"
      colorSpace="hsb"
      defaultValue="#336699"
    >
      <C.Primitives.SliderTrack>
        <C.Primitives.ColorThumb />
      </C.Primitives.SliderTrack>
    </C.Primitives.ColorSlider>,
  );
  assert.ok(raw.getByRole("slider", { name: "Custom hue" }), "raw owner label semantics");
  raw.unmount();
  const view = render(
    <C.ColorSlider aria-label="Custom hue" channel="hue" colorSpace="hsb" defaultValue="#336699" />,
  );
  assert.ok(view.getByRole("slider", { name: "Custom hue" }));
});

test("color picker rejects disabled presets and discards invalid field drafts on blur", async () => {
  const changes: string[] = [];
  const view = render(
    <C.ColorPicker
      label="Brand"
      defaultValue="#336699"
      onChange={(color) => changes.push(color.toString("hex"))}
      colors={[
        { color: "#ff0000", label: "Unavailable red", isDisabled: true },
        { color: "#00ff00", label: "Available green" },
      ]}
    />,
  );
  await click(view.getByRole("option", { name: "Unavailable red" }));
  assert.deepEqual(changes, []);
  const input = view.getByRole("textbox", { name: "Color value" }) as HTMLInputElement;
  await act(async () => {
    input.focus();
    fireEvent.change(input, { target: { value: "#12" } });
    fireEvent.blur(input);
  });
  assert.equal(input.value.toUpperCase(), "#336699");
  assert.deepEqual(changes, []);
  await click(view.getByRole("option", { name: "Available green" }));
  assert.equal(input.value.toUpperCase(), "#00FF00");
});

test("range picker dismissal does not commit a single pending range endpoint", async () => {
  const changes: string[] = [];
  const view = render(
    <C.DateRangePicker
      label="Trip"
      defaultValue={{ start: new CalendarDate(2026, 10, 15), end: new CalendarDate(2026, 10, 18) }}
      onChange={(value) => changes.push(value ? `${value.start}/${value.end}` : "empty")}
    />,
  );
  const trigger = view.getByRole("button", { name: "Choose date range Trip" });
  await click(trigger);
  await click(view.getByRole("button", { name: /^Tuesday, October 20, 2026/ }));
  assert.deepEqual(changes, []);
  await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
  await waitFor(() => assert.equal(document.activeElement === trigger, true));
  assert.deepEqual(changes, []);
  await click(trigger);
  await click(view.getByRole("button", { name: /^Thursday, October 22, 2026/ }));
  assert.deepEqual(
    changes,
    [],
    "reopening starts a fresh range rather than completing the abandoned one",
  );
  await click(view.getByRole("button", { name: /^Saturday, October 24, 2026/ }));
  assert.deepEqual(changes, ["2026-10-22/2026-10-24"]);
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
});

test("week-duration calendar navigation is not announced as month navigation", async () => {
  const view = render(
    <C.Calendar
      aria-label="Week view"
      defaultFocusedValue={new CalendarDate(2026, 10, 15)}
      visibleDuration={{ weeks: 1 }}
    />,
  );
  const header = view.container.querySelector(".fux-calendar__header")! as HTMLElement;
  const next = within(header).getByRole("button", { name: "Next period" });
  assert.ok(within(header).getByRole("button", { name: "Previous period" }));
  const before = header.textContent;
  await click(next);
  assert.notEqual(header.textContent, before);
});

for (const [family, action] of [
  ["ImageCropper", "Zoom in"],
  ["Tour", "Example action"],
] as const) {
  test(`${family} demo action does not submit an enclosing application form`, async () => {
    let submissions = 0;
    const view = render(
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submissions++;
        }}
      >
        {arkAdvancedDemos[family]!.render()}
      </form>,
    );
    await click(view.getByRole("button", { name: action }));
    assert.equal(submissions, 0, "local demonstration controls must not submit the host form");
  });
}

for (const [name, element, opener] of [
  [
    "DatePicker",
    <C.DatePicker label="Date width" defaultValue={new CalendarDate(2026, 10, 15)} />,
    "Choose date Date width",
  ],
  [
    "DateRangePicker",
    <C.DateRangePicker
      label="Range width"
      defaultValue={{ start: new CalendarDate(2026, 10, 15), end: new CalendarDate(2026, 10, 18) }}
    />,
    "Choose date range Range width",
  ],
] as const) {
  test(`${name} uses a scoped intrinsic-width popup and a decorative vector opener`, async () => {
    const view = render(element);
    const trigger = view.getByRole("button", { name: opener });
    assert.ok(
      trigger.querySelector('svg[aria-hidden="true"]'),
      "calendar icon must not depend on a font glyph",
    );
    await click(trigger);
    const dialog = await view.findByRole("dialog");
    assert.ok(
      dialog.closest(".fux-popover--calendar"),
      "only date popovers opt into intrinsic sizing",
    );
    assert.ok(dialog.closest(".fux-popover"), "base owner popover styling is retained");
  });
}

test("collection popovers do not inherit calendar-only intrinsic sizing", async () => {
  const view = render(<C.Menu label="Actions" items={[{ id: "rename", label: "Rename" }]} />);
  await click(view.getByRole("button", { name: "Actions" }));
  const menu = await view.findByRole("menu");
  assert.ok(menu.closest(".fux-popover"));
  assert.equal(menu.closest(".fux-popover--calendar"), null);
});

test("color slider retains external group naming and the owner's default channel name", () => {
  const view = render(
    <>
      <span id="review-hue-name">External hue label</span>
      <C.ColorSlider
        aria-labelledby="review-hue-name"
        channel="hue"
        colorSpace="hsb"
        defaultValue="#336699"
      />
      <C.ColorSlider channel="alpha" defaultValue="#336699" />
    </>,
  );
  assert.ok(view.getByRole("group", { name: "External hue label" }));
  assert.ok(view.getByRole("slider", { name: "Alpha" }));
});

test("day-duration calendars preserve explicitly supplied navigation labels", () => {
  const view = render(
    <C.RangeCalendar
      aria-label="Working days"
      visibleDuration={{ days: 3 }}
      defaultFocusedValue={new CalendarDate(2026, 10, 15)}
      previousLabel="Earlier dates"
      nextLabel="Later dates"
    />,
  );
  const header = view.container.querySelector(".fux-calendar__header")! as HTMLElement;
  assert.ok(within(header).getByRole("button", { name: "Earlier dates" }));
  assert.ok(within(header).getByRole("button", { name: "Later dates" }));
});

test("outliner vector row selectors retain named toggle semantics and additive selection", async () => {
  const { OutlineEditor } = await import("../src/react/index.js");
  const view = render(
    <OutlineEditor
      readOnly={false}
      defaultNodes={[
        { id: "a", text: "Alpha" },
        { id: "b", text: "Beta" },
      ]}
    />,
  );
  const first = view.getByRole("button", { name: "Select Alpha" });
  const second = view.getByRole("button", { name: "Select Beta" });
  for (const control of [first, second]) {
    assert.ok(control.querySelector('svg[aria-hidden="true"][focusable="false"]'));
    assert.equal(control.textContent, "", "decorative vectors do not add visible label text");
    assert.equal(control.getAttribute("aria-pressed"), "false");
    assert.equal(control.querySelector("svg path"), null);
  }
  await click(first);
  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.ok(first.querySelector("svg path"));
  await act(async () => fireEvent.click(second, { shiftKey: true }));
  assert.equal(first.getAttribute("aria-pressed"), "true");
  assert.equal(second.getAttribute("aria-pressed"), "true");
  assert.ok(second.querySelector("svg path"));
});

test("slider paint leaves horizontal, vertical and RTL percentage geometry with the owner", () => {
  for (const orientation of ["horizontal", "vertical"] as const) {
    for (const locale of ["en-US", "ar-AE"]) {
      const view = render(
        <C.Primitives.I18nProvider locale={locale}>
          <C.Slider label="Range geometry" defaultValue={[20, 80]} orientation={orientation} />
        </C.Primitives.I18nProvider>,
      );
      const fill = view.container.querySelector<HTMLElement>(".fux-slider__fill")!;
      assert.equal(fill.dataset.orientation, orientation);
      if (orientation === "horizontal") {
        assert.equal(fill.style.insetInlineStart, "20%");
        assert.equal(fill.style.width, "60%");
        assert.equal(fill.style.height, "100%");
      } else {
        assert.equal(fill.style.bottom, "20%");
        assert.equal(fill.style.height, "60%");
        assert.equal(fill.style.width, "100%");
      }
      view.unmount();
    }
  }
});

test("slider skin paints a thin pseudo-element rail rather than the full owner-sized fill", () => {
  const css = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
    assert.ok(match, `Missing rule: ${selector}`);
    return match[1]!;
  };
  const host = rule(".fux-slider__fill");
  assert.match(host, /top:\s*0;/);
  assert.doesNotMatch(host, /(?:background|transform|width|height|inline-size|block-size):/);
  const horizontal = rule(".fux-slider__fill::before");
  assert.match(horizontal, /block-size:\s*0\.375rem;/);
  assert.match(horizontal, /inset-inline:\s*0;/);
  assert.match(horizontal, /background:\s*var\(--fux-accent\);/);
  const vertical = rule('.fux-slider__fill[data-orientation="vertical"]::before');
  assert.match(vertical, /inline-size:\s*0\.375rem;/);
  assert.match(vertical, /block-size:\s*100%;/);
  assert.match(vertical, /top:\s*0;/);
});

test("range-only highlight receives real owner endpoint markers without changing single-date calendars", () => {
  const view = render(
    <>
      <C.Calendar aria-label="Single date" defaultValue={new CalendarDate(2026, 10, 15)} />
      <C.RangeCalendar
        aria-label="Date interval"
        defaultValue={{
          start: new CalendarDate(2026, 10, 15),
          end: new CalendarDate(2026, 10, 18),
        }}
      />
    </>,
  );
  const calendars = view.container.querySelectorAll(".fux-calendar");
  assert.equal(calendars.length, 2);
  assert.equal(calendars[0]!.classList.contains("fux-calendar--range"), false);
  const range = calendars[1]!;
  assert.equal(range.classList.contains("fux-calendar--range"), true);
  assert.equal(range.querySelectorAll("[data-selected]").length, 4);
  assert.equal(range.querySelector("[data-selection-start]")?.textContent, "15");
  assert.equal(range.querySelector("[data-selection-end]")?.textContent, "18");
  assert.equal(
    range.querySelectorAll("[data-selected]:not([data-selection-start]):not([data-selection-end])")
      .length,
    2,
  );
});

test("connected range paint does not outrank invalid-date feedback", () => {
  const css = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  const invalid = css.match(
    /\.fux-calendar--range \.fux-calendar__cell\[data-invalid\]\s*\{([^}]*)\}/,
  );
  assert.ok(invalid, "range-specific paint requires equally specific invalid feedback");
  assert.match(invalid[1]!, /background:\s*var\(--fux-danger\);/);
  assert.match(invalid[1]!, /color:\s*var\(--fux-on-danger\);/);
  assert.ok(
    css.indexOf(invalid[0]) > css.indexOf(".fux-calendar--range .fux-calendar__cell:is("),
    "invalid feedback follows endpoint paint in the cascade",
  );
});
