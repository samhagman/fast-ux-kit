import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createRef, useState } from "react";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor, within } = await import("@testing-library/react");
const C = await import("../src/components/index.js");
const P = await import("../src/components/primitives.js");
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value() {},
});
const { CalendarDate, Time } = await import("@internationalized/date");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
async function click(element: Element) {
  await act(async () => {
    if (element instanceof HTMLElement) element.focus();
    fireEvent.click(element);
  });
}

test("calendar visibleDuration exposes every requested month rather than only a wider heading", async () => {
  const view = render(
    <C.Calendar
      aria-label="Two-month calendar"
      defaultFocusedValue={new CalendarDate(2028, 2, 12)}
      visibleDuration={{ months: 2 }}
    />,
  );
  assert.ok(view.getByRole("button", { name: /Tuesday, February 29, 2028/ }));
  assert.ok(view.getByRole("button", { name: /Friday, March 31, 2028/ }));
  assert.equal(view.getAllByRole("grid").length, 2);
});
test("range calendar exposes both months and preserves cross-month endpoints", async () => {
  const view = render(
    <C.RangeCalendar
      aria-label="Two-month range"
      defaultValue={{ start: new CalendarDate(2028, 2, 29), end: new CalendarDate(2028, 3, 2) }}
      visibleDuration={{ months: 2 }}
    />,
  );
  assert.equal(view.getAllByRole("grid").length, 2);
  assert.ok(view.getByRole("button", { name: /Tuesday, February 29, 2028 selected$/ }));
  assert.ok(view.getByRole("button", { name: /Thursday, March 2, 2028 selected$/ }));
});
test("styled render props retain owner state, a consumer class function and forwarded DOM ref", async () => {
  const ref = createRef<HTMLButtonElement>();
  const view = render(
    <P.ToggleButton
      ref={ref}
      className={({ isSelected }) => (isSelected ? "host-selected" : "host-idle")}
    >
      {({ isSelected }) => (isSelected ? "Chosen" : "Choose")}
    </P.ToggleButton>,
  );
  assert.equal(ref.current?.className.includes("fux-control"), true);
  assert.equal(ref.current?.className.includes("host-idle"), true);
  await click(view.getByRole("button", { name: "Choose" }));
  assert.equal(ref.current?.className.includes("host-selected"), true);
  assert.equal(ref.current?.textContent, "Chosen");
});
test("combobox controlled input and replacement options do not retain stale collection content", async () => {
  const changes: string[] = [];
  const view = render(
    <C.ComboBox
      label="Repository"
      inputValue=""
      onInputChange={(value) => changes.push(value)}
      options={[{ id: "old", label: "Old entry" }]}
    />,
  );
  const input = view.getByRole("combobox") as HTMLInputElement;
  await act(async () => fireEvent.change(input, { target: { value: "search" } }));
  assert.equal(changes.at(-1), "search");
  assert.equal(input.value, "");
  view.rerender(
    <C.ComboBox
      label="Repository"
      inputValue=""
      onInputChange={(value) => changes.push(value)}
      options={[
        { id: "new", label: "New entry" },
        { id: "disabled", label: "Unavailable entry", isDisabled: true },
      ]}
    />,
  );
  await click(view.getByRole("button", { name: "Show options Repository" }));
  assert.ok(view.getByRole("option", { name: "New entry" }));
  assert.equal(view.queryByRole("option", { name: "Old entry" }), null);
  assert.equal(
    view.getByRole("option", { name: "Unavailable entry" }).getAttribute("aria-disabled"),
    "true",
  );
});
test("empty and long collections keep explicit empty states and text labels without fabricated selection", () => {
  const long = "A very long item label ".repeat(30);
  const view = render(
    <>
      <C.ListBox label="Empty choices" options={[]} renderEmptyState={() => "No choices yet"} />
      <C.Table
        label="Empty rows"
        columns={[
          { id: "name", label: "Name", render: (row: { id: string; name: string }) => row.name },
        ]}
        rows={[]}
        emptyState="Nothing to display"
      />
      <C.ListBox
        label="Long choices"
        options={[{ id: "long", label: long }]}
        selectionMode="single"
      />
    </>,
  );
  assert.ok(view.getByText("No choices yet"));
  assert.ok(view.getByText("Nothing to display"));
  const option = within(view.getByRole("listbox", { name: "Long choices" })).getByRole("option");
  assert.equal(option.textContent, long);
  assert.equal(option.getAttribute("aria-selected"), "false");
});
test("zero and transparent channel values remain controlled instead of falling back to defaults", async () => {
  const changes: number[] = [];
  const view = render(
    <>
      <C.NumberField
        label="Zero number"
        value={0}
        minValue={-1}
        maxValue={1}
        onChange={(value) => changes.push(value)}
      />
      <C.ColorSlider label="Alpha" channel="alpha" value={C.parseColor("rgba(255, 0, 0, 0)")} />
    </>,
  );
  assert.equal((view.getByRole("textbox", { name: "Zero number" }) as HTMLInputElement).value, "0");
  await click(view.getByRole("button", { name: "Increase Zero number" }));
  assert.equal(changes.at(-1), 1);
  assert.equal((view.getByRole("textbox", { name: "Zero number" }) as HTMLInputElement).value, "0");
  const slider = view.getByRole("slider", { name: "Alpha" }) as HTMLInputElement;
  assert.equal(slider.value, "0");
});
test("date leap-day and midnight values survive rerender and disabled inputs cannot emit edits", async () => {
  let changes = 0;
  const view = render(
    <>
      <C.DateField
        label="Leap day"
        value={new CalendarDate(2028, 2, 29)}
        isDisabled
        onChange={() => changes++}
      />
      <C.TimeField
        label="Midnight"
        value={new Time(0, 0)}
        hourCycle={24}
        isReadOnly
        onChange={() => changes++}
      />
    </>,
  );
  const day = view.getByRole("spinbutton", { name: /day, Leap day/i });
  assert.equal(day.getAttribute("aria-valuenow"), "29");
  await act(async () => fireEvent.keyDown(day, { key: "ArrowUp" }));
  const hour = view.getByRole("spinbutton", { name: /hour, Midnight/i });
  assert.equal(hour.getAttribute("aria-valuenow"), "0");
  await act(async () => fireEvent.keyDown(hour, { key: "ArrowUp" }));
  assert.equal(changes, 0);
});
test("nested same-owner popover Escape closes only the top overlay before the enclosing modal", async () => {
  function Example() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <C.Button onPress={() => setOpen(true)}>Open outer</C.Button>
        <C.ModalDialog title="Outer dialog" isOpen={open} onOpenChange={setOpen}>
          <C.Popover title="Inner dialog" trigger={<C.Button>Open inner</C.Button>}>
            <C.Field label="Inner field" />
          </C.Popover>
        </C.ModalDialog>
      </>
    );
  }
  const view = render(<Example />);
  await click(view.getByRole("button", { name: "Open outer" }));
  await click(view.getByRole("button", { name: "Open inner" }));
  const inner = await view.findByRole("dialog", { name: "Inner dialog" });
  await act(async () => {
    within(inner).getByRole("textbox", { name: "Inner field" }).focus();
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
  });
  await waitFor(() =>
    assert.equal(view.queryByRole("dialog", { name: "Inner dialog" }) === null, true),
  );
  assert.ok(view.getByRole("dialog", { name: "Outer dialog" }));
  await waitFor(() =>
    assert.equal(document.activeElement === view.getByRole("button", { name: "Open inner" }), true),
  );
  await act(async () => fireEvent.keyDown(document.activeElement!, { key: "Escape" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
});

test("convenience field, checkbox, calendar and table accept typed refs to their real owner roots", () => {
  const field = createRef<HTMLDivElement>(),
    checkbox = createRef<HTMLLabelElement>(),
    calendar = createRef<HTMLDivElement>(),
    table = createRef<HTMLTableElement>();
  render(
    <>
      <C.Field ref={field} label="Ref field" />
      <C.Checkbox ref={checkbox} label="Ref checkbox" />
      <C.Calendar
        ref={calendar}
        aria-label="Ref calendar"
        defaultValue={new CalendarDate(2028, 2, 29)}
      />
      <C.Table
        ref={table}
        label="Ref table"
        columns={[
          { id: "name", label: "Name", render: (row: { id: string; name: string }) => row.name },
        ]}
        rows={[{ id: "a", name: "One" }]}
      />
    </>,
  );
  assert.equal(field.current?.tagName, "DIV");
  assert.equal(checkbox.current?.tagName, "LABEL");
  assert.equal(calendar.current?.tagName, "DIV");
  assert.equal(table.current?.tagName, "TABLE");
});
test("nested locale direction changes slider keys without leaking RTL into the LTR subtree", async () => {
  const outer: number[] = [],
    inner: number[] = [];
  const view = render(
    <P.I18nProvider locale="ar-AE">
      <div dir="rtl">
        <C.Slider
          label="Outer RTL slider"
          defaultValue={50}
          onChange={(value) => outer.push(value)}
        />
        <P.I18nProvider locale="en-US">
          <div dir="ltr">
            <C.Slider
              label="Inner LTR slider"
              defaultValue={50}
              onChange={(value) => inner.push(value)}
            />
          </div>
        </P.I18nProvider>
      </div>
    </P.I18nProvider>,
  );
  await act(async () =>
    fireEvent.keyDown(view.getByRole("slider", { name: "Outer RTL slider" }), {
      key: "ArrowRight",
    }),
  );
  await act(async () =>
    fireEvent.keyDown(view.getByRole("slider", { name: "Inner LTR slider" }), {
      key: "ArrowRight",
    }),
  );
  assert.equal(outer.at(-1), 49);
  assert.equal(inner.at(-1), 51);
});
test("explicit primitive portal container retains a nested theme and direction scope with one overlay owner", async () => {
  function Example() {
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    return (
      <div data-theme="dark" dir="rtl">
        <div data-theme="light" dir="ltr" data-testid="local-scope">
          <div ref={setContainer} />
          {container && (
            <P.DialogTrigger>
              <P.Button>Scoped overlay</P.Button>
              <P.Popover UNSTABLE_portalContainer={container}>
                <P.Dialog>
                  <P.Heading slot="title">Local theme dialog</P.Heading>
                  <C.Field label="Local text" />
                </P.Dialog>
              </P.Popover>
            </P.DialogTrigger>
          )}
        </div>
      </div>
    );
  }
  const view = render(<Example />);
  await click(view.getByRole("button", { name: "Scoped overlay" }));
  const dialog = await view.findByRole("dialog", { name: "Local theme dialog" });
  assert.equal(dialog.closest("[data-theme]")?.getAttribute("data-theme"), "light");
  assert.equal(dialog.closest("[dir]")?.getAttribute("dir"), "ltr");
  assert.equal(view.getAllByRole("dialog").length, 1);
  await act(async () => fireEvent.keyDown(dialog, { key: "Escape" }));
  await waitFor(() => assert.equal(view.queryByRole("dialog") === null, true));
});

test("multi-month navigation advances both grids and duration changes do not retain stale months", async () => {
  const view = render(
    <C.Calendar
      aria-label="Paged months"
      defaultFocusedValue={new CalendarDate(2028, 2, 12)}
      visibleDuration={{ months: 2 }}
    />,
  );
  await click(view.getByRole("button", { name: /^Next (month|period)$/ }));
  assert.ok(view.getByRole("button", { name: /Wednesday, May 31, 2028/ }));
  assert.equal(view.queryByRole("button", { name: /Friday, March 31, 2028/ }), null);
  assert.equal(view.getAllByRole("grid").length, 2);
  view.rerender(
    <C.Calendar
      aria-label="Paged months"
      defaultFocusedValue={new CalendarDate(2028, 2, 12)}
      visibleDuration={{ months: 1 }}
    />,
  );
  assert.equal(view.getAllByRole("grid").length, 1);
});
test("multi-month calendar terminates at the maximum supported year without duplicate clamped months", () => {
  const view = render(
    <C.Calendar
      aria-label="Upper date bound"
      defaultFocusedValue={new CalendarDate(9999, 11, 1)}
      visibleDuration={{ months: 2 }}
    />,
  );
  assert.equal(view.getAllByRole("grid").length, 2);
  assert.equal(view.getAllByRole("button", { name: /Friday, December 31, 9999/ }).length, 1);
});
