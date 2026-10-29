import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const C = await import("../src/components/aria.js");
const { CalendarDate, Time } = await import("@internationalized/date");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});

test("complete color picker synchronizes a field, channels and palette without duplicate owners", async () => {
  const changes: string[] = [];
  const view = render(
    <C.ColorPicker
      label="Accent"
      defaultValue="#336699"
      onChange={(color) => changes.push(color.toString("hex"))}
      colors={[{ color: "#ff0000", label: "Red" }, "#00ff00"]}
    />,
  );
  assert.ok(view.getByRole("group", { name: "Accent" }));
  assert.equal(view.getByRole("textbox", { name: "Color value" }).getAttribute("value"), "#336699");
  const sliders = view.getAllByRole("slider");
  assert.equal(sliders.length, 3, "two-axis area, hue and alpha");
  for (const input of sliders)
    assert.ok(input.getAttribute("aria-label") || input.getAttribute("aria-labelledby"));
  await act(async () => {
    fireEvent.click(view.getByRole("option", { name: "Red" }));
  });
  assert.equal(changes.at(-1), "#FF0000");
  assert.equal(
    (view.getByRole("textbox", { name: "Color value" }) as HTMLInputElement).value.toUpperCase(),
    "#FF0000",
  );
});

test("color slider uses keyboard increments and retains custom owner style", async () => {
  const changes: number[] = [];
  const view = render(
    <C.ColorSlider
      label="Hue"
      channel="hue"
      defaultValue="hsl(120, 100%, 50%)"
      onChange={(color) => changes.push(color.getChannelValue("hue"))}
    />,
  );
  const input = view.getByRole("slider", { name: "Hue" });
  await act(async () => {
    input.focus();
    fireEvent.keyDown(input, { key: "ArrowRight" });
    fireEvent.keyUp(input, { key: "ArrowRight" });
  });
  assert.equal(changes.at(-1), 121);
  assert.ok(
    view.container.querySelector(".fux-slider__track")?.getAttribute("style")?.includes("gradient"),
  );
});

test("color wheel and standalone swatch expose accessible owner semantics", () => {
  const view = render(
    <>
      <C.ColorWheel label="Hue wheel" defaultValue="hsl(30, 80%, 50%)" />
      <C.ColorSwatch color="#ff0000" aria-label="Red preview" />
    </>,
  );
  assert.ok(view.getByRole("slider", { name: "Hue wheel" }));
  assert.ok(view.container.querySelector(".fux-color-wheel__track"));
  assert.ok(view.getByRole("img", { name: /Red preview/ }));
});

test("text and number recipes associate labels, descriptions, validation and bounds", async () => {
  const changes: number[] = [];
  const view = render(
    <>
      <C.TextArea label="Notes" hint="Optional details" rows={3} />
      <C.NumberField
        label="Quantity"
        defaultValue={2}
        minValue={1}
        maxValue={3}
        onChange={(value) => changes.push(value)}
      />
      <C.SearchField label="Search" defaultValue="draft" />
      <C.ColorField label="Hex" error="Choose a valid color" isInvalid={false} />
    </>,
  );
  assert.ok(view.getByRole("textbox", { name: "Notes" }).getAttribute("aria-describedby"));
  assert.equal(view.getByRole("textbox", { name: "Hex" }).getAttribute("aria-invalid"), "true");
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Increase Quantity" }));
  });
  assert.deepEqual(changes, [3]);
  assert.ok(
    (view.getByRole("button", { name: "Increase Quantity" }) as HTMLButtonElement).disabled,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  });
  assert.equal((view.getByRole("searchbox", { name: "Search" }) as HTMLInputElement).value, "");
});

test("choice controls preserve disabled values and controlled selection", async () => {
  const values: string[] = [];
  const view = render(
    <>
      <C.RadioGroup
        label="Plan"
        options={[
          { id: "a", label: "Basic" },
          { id: "b", label: "Pro", isDisabled: true },
        ]}
        onChange={(value) => values.push(value)}
      />
      <C.CheckboxGroup
        label="Channels"
        options={[{ id: "mail", label: "Email" }]}
        defaultValue={["mail"]}
      />
      <C.Switch label="Notifications" defaultSelected />
    </>,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("radio", { name: "Basic" }));
  });
  assert.deepEqual(values, ["a"]);
  assert.ok((view.getByRole("radio", { name: "Pro" }) as HTMLInputElement).disabled);
  assert.ok((view.getByRole("checkbox", { name: "Email" }) as HTMLInputElement).checked);
  assert.ok((view.getByRole("switch", { name: "Notifications" }) as HTMLInputElement).checked);
});

test("slider supports named range thumbs and independent keyboard updates", async () => {
  const changes: number[][] = [];
  const view = render(
    <C.Slider
      label="Budget"
      defaultValue={[20, 80]}
      thumbLabels={["Minimum", "Maximum"]}
      onChange={(value) => changes.push(value)}
    />,
  );
  assert.equal(view.getAllByRole("slider").length, 2);
  const minimum = view.getByRole("slider", { name: "Minimum Budget" });
  await act(async () => {
    minimum.focus();
    fireEvent.keyDown(minimum, { key: "ArrowRight" });
    fireEvent.keyUp(minimum, { key: "ArrowRight" });
  });
  assert.deepEqual(changes.at(-1), [21, 80]);
});

test("calendar supplies labeled navigation and date selection", async () => {
  const changes: string[] = [];
  const view = render(
    <C.Calendar
      aria-label="Delivery"
      defaultValue={new CalendarDate(2026, 10, 15)}
      onChange={(value) => changes.push(value.toString())}
    />,
  );
  assert.ok(view.getByRole("button", { name: "Previous month" }));
  assert.ok(view.getByRole("grid", { name: /October 2026/ }));
  const nextDate = view.getByRole("button", { name: /Friday, October 16, 2026/ });
  await act(async () => {
    fireEvent.click(nextDate);
  });
  assert.equal(changes.at(-1), "2026-10-16");
});

test("date and time fields expose segmented spinbuttons and error descriptions", () => {
  const view = render(
    <>
      <C.DateField label="Start" defaultValue={new CalendarDate(2026, 10, 15)} hint="Local date" />
      <C.TimeField label="Time" defaultValue={new Time(14, 30)} />
      <C.DateRangePicker label="Trip" />
      <C.DatePicker label="Deadline" error="Required" />
    </>,
  );
  assert.ok(view.getByRole("group", { name: "Start" }));
  assert.ok(view.getByRole("spinbutton", { name: /^month, Start$/ }));
  assert.ok(view.getByRole("spinbutton", { name: /^hour, Time$/ }));
  assert.ok(view.getByRole("button", { name: "Choose date range Trip" }));
  assert.ok(view.getByText("Required"));
});

test("select opens a real listbox and reports owner selection", async () => {
  const selected: unknown[] = [];
  const view = render(
    <C.Select
      label="Priority"
      options={[
        { id: "low", label: "Low" },
        { id: "high", label: "High" },
      ]}
      onSelectionChange={(value) => selected.push(value)}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: /Priority/ }));
  });
  assert.ok(view.getByRole("listbox"));
  await act(async () => {
    fireEvent.click(view.getByRole("option", { name: "High" }));
  });
  assert.deepEqual(selected, ["high"]);
  await waitFor(() => assert.ok(view.queryByRole("listbox") === null));
});

test("combobox filters its typed collection", async () => {
  const view = render(
    <C.ComboBox
      label="City"
      options={[
        { id: "oslo", label: "Oslo" },
        { id: "paris", label: "Paris" },
      ]}
    />,
  );
  const input = view.getByRole("combobox", { name: "City" });
  await act(async () => {
    input.focus();
    fireEvent.change(input, { target: { value: "Os" } });
  });
  assert.ok(view.getByRole("option", { name: "Oslo" }));
  assert.ok(view.queryByRole("option", { name: "Paris" }) === null);
});

test("tabs and disclosures keep controlled keyboard and expanded semantics", async () => {
  const view = render(
    <>
      <C.Tabs
        label="Views"
        items={[
          { id: "one", label: "Overview", content: "First panel" },
          { id: "two", label: "Details", content: "Second panel" },
        ]}
      />
      <C.DisclosureGroup items={[{ id: "question", title: "Question", content: "Answer" }]} />
    </>,
  );
  const first = view.getByRole("tab", { name: "Overview" });
  await act(async () => {
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
  });
  assert.equal(view.getByRole("tab", { name: "Details" }).getAttribute("aria-selected"), "true");
  assert.ok(view.getByRole("tabpanel", { name: "Details" }));
  const trigger = view.getByRole("button", { name: "Question" });
  await act(async () => {
    fireEvent.click(trigger);
  });
  assert.equal(trigger.getAttribute("aria-expanded"), "true");
  assert.ok(view.getByText("Answer"));
});

test("table, grid list, tree and removable tags expose real collection items", async () => {
  const removed: unknown[] = [];
  const view = render(
    <>
      <C.Table
        label="Tasks"
        columns={[{ id: "name", label: "Name", render: (row) => row.name }]}
        rows={[{ id: "a", name: "Draft" }]}
      />
      <C.GridList label="Files" items={[{ id: "f", label: "Report" }]} />
      <C.Tree
        label="Folders"
        items={[{ id: "parent", label: "Projects", children: [{ id: "child", label: "Website" }] }]}
      />
      <C.TagGroup
        label="Topics"
        items={[{ id: "ux", label: "UX" }]}
        onRemove={(keys) => removed.push([...keys])}
      />
    </>,
  );
  assert.ok(view.getByRole("grid", { name: "Tasks" }));
  assert.ok(view.getByRole("rowheader", { name: "Draft" }));
  assert.ok(view.getByRole("grid", { name: "Files" }));
  const expand = view.getByRole("button", { name: "Expand Projects" });
  await act(async () => {
    fireEvent.click(expand);
  });
  assert.ok(view.getByText("Website"));
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Remove UX" }));
  });
  assert.deepEqual(removed, [["ux"]]);
});

test("progress and meters expose numeric and indeterminate semantics", () => {
  const view = render(
    <>
      <C.ProgressBar label="Upload" value={35} />
      <C.ProgressBar label="Loading" isIndeterminate />
      <C.Meter label="Storage" value={70} />
    </>,
  );
  assert.equal(
    view.getByRole("progressbar", { name: "Upload" }).getAttribute("aria-valuenow"),
    "35",
  );
  assert.equal(
    view.getByRole("progressbar", { name: "Loading" }).getAttribute("aria-valuenow"),
    null,
  );
  assert.equal(view.getByRole("meter", { name: "Storage" }).getAttribute("aria-valuenow"), "70");
});

test("styled primitive preserves refs and functional class names", async () => {
  let node: HTMLButtonElement | null = null;
  const view = render(
    <C.Primitives.ToggleButton
      ref={(value) => {
        node = value;
      }}
      className={({ isSelected }) => (isSelected ? "chosen" : "idle")}
    >
      Pin
    </C.Primitives.ToggleButton>,
  );
  const button = view.getByRole("button", { name: "Pin" });
  assert.equal(node, button);
  assert.ok(button.classList.contains("fux-control"));
  assert.ok(button.classList.contains("idle"));
  await act(async () => {
    fireEvent.click(button);
  });
  assert.ok(button.classList.contains("chosen"));
});

test("controlled color values do not drift before the host accepts a change", async () => {
  const changes: string[] = [];
  const view = render(
    <C.ColorPicker
      label="Brand"
      value="#336699"
      colors={[{ color: "#ff0000", label: "Red" }]}
      onChange={(color) => changes.push(color.toString("hex"))}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("option", { name: "Red" }));
  });
  assert.deepEqual(changes, ["#FF0000"]);
  assert.equal(
    (view.getByRole("textbox", { name: "Color value" }) as HTMLInputElement).value.toUpperCase(),
    "#336699",
  );
  view.rerender(
    <C.ColorPicker label="Brand" value="#ff0000" colors={[{ color: "#ff0000", label: "Red" }]} />,
  );
  assert.equal(
    (view.getByRole("textbox", { name: "Color value" }) as HTMLInputElement).value.toUpperCase(),
    "#FF0000",
  );
});

test("date picker opens, dismisses, restores focus and can be reopened", async () => {
  const view = render(
    <C.DatePicker label="Deadline" defaultValue={new CalendarDate(2026, 10, 15)} />,
  );
  const trigger = view.getByRole("button", { name: "Choose date Deadline" });
  for (let round = 0; round < 2; round++) {
    await act(async () => {
      trigger.focus();
      fireEvent.click(trigger);
    });
    assert.ok(view.getByRole("dialog"));
    await act(async () => {
      fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
    });
    await waitFor(() => assert.ok(view.queryByRole("dialog") === null));
    await waitFor(() => assert.ok(document.activeElement === trigger, "focus returns to trigger"));
  }
});

test("anchored popover dismisses without leaving its dialog or focus behind", async () => {
  const view = render(
    <C.Popover title="Details" trigger={<C.Button>Details trigger</C.Button>}>
      <C.Field label="Note" />
    </C.Popover>,
  );
  const trigger = view.getByRole("button", { name: "Details trigger" });
  await act(async () => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  assert.ok(view.getByRole("dialog", { name: "Details" }));
  await act(async () => {
    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
  });
  await waitFor(() => assert.ok(view.queryByRole("dialog") === null));
  await waitFor(() => assert.ok(document.activeElement === trigger, "focus returns to trigger"));
});

test("sheet uses one modal owner and cleans up after Escape", async () => {
  const P = C.Primitives;
  const view = render(
    <P.SheetTrigger>
      <C.Button>Settings</C.Button>
      <P.SheetOverlay>
        <P.SheetBackdrop />
        <P.Sheet>
          <P.SheetContent>
            <P.Heading slot="title">Settings panel</P.Heading>
            <C.Switch label="Updates" />
          </P.SheetContent>
        </P.Sheet>
      </P.SheetOverlay>
    </P.SheetTrigger>,
  );
  const trigger = view.getByRole("button", { name: "Settings" });
  await act(async () => {
    trigger.focus();
    fireEvent.click(trigger);
  });
  assert.equal(view.getAllByRole("dialog", { name: "Settings panel" }).length, 1);
  await act(async () => {
    fireEvent.keyDown(view.getByRole("dialog"), { key: "Escape" });
  });
  await waitFor(() => assert.ok(view.queryByRole("dialog") === null));
  await waitFor(() => assert.ok(document.activeElement === trigger, "focus returns to trigger"));
});

test("menu actions and disabled choices preserve owner behavior", async () => {
  const actions: unknown[] = [];
  const view = render(
    <C.Menu
      label="Actions"
      items={[
        { id: "save", label: "Save", shortcut: "⌘S" },
        { id: "delete", label: "Delete", isDisabled: true },
      ]}
      onAction={(key) => actions.push(key)}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Actions" }));
  });
  assert.equal(
    view.getByRole("menuitem", { name: "Delete" }).getAttribute("aria-disabled"),
    "true",
  );
  await act(async () => {
    fireEvent.click(view.getByRole("menuitem", { name: "Delete" }));
  });
  assert.deepEqual(actions, []);
  await act(async () => {
    fireEvent.click(view.getByRole("menuitem", { name: /Save/ }));
  });
  assert.deepEqual(actions, ["save"]);
  await waitFor(() => assert.ok(view.queryByRole("menu") === null));
});

test("controlled selections retain the host's value until rerender", async () => {
  const changes: unknown[] = [];
  const options = [
    { id: "a", label: "Alpha" },
    { id: "b", label: "Beta" },
  ];
  const view = render(
    <C.ListBox
      label="Letters"
      options={options}
      selectionMode="single"
      selectedKeys={["a"]}
      onSelectionChange={(keys) => changes.push([...keys])}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("option", { name: "Beta" }));
  });
  assert.deepEqual(changes, [["b"]]);
  assert.equal(view.getByRole("option", { name: "Alpha" }).getAttribute("aria-selected"), "true");
  view.rerender(
    <C.ListBox label="Letters" options={options} selectionMode="single" selectedKeys={["b"]} />,
  );
  assert.equal(view.getByRole("option", { name: "Beta" }).getAttribute("aria-selected"), "true");
});

test("table sorting is explicit host state with a visible direction indicator", async () => {
  const changes: unknown[] = [];
  const columns = [
    {
      id: "name",
      label: "Name",
      allowsSorting: true,
      render: (row: { id: string; name: string }) => row.name,
    },
  ];
  const rows = [{ id: "a", name: "Alpha" }];
  const view = render(
    <C.Table
      label="Sorted records"
      columns={columns}
      rows={rows}
      onSortChange={(value) => changes.push(value)}
    />,
  );
  await act(async () => {
    fireEvent.click(view.getByRole("columnheader", { name: /Name/ }));
  });
  assert.deepEqual(changes, [{ column: "name", direction: "ascending" }]);
  view.rerender(
    <C.Table
      label="Sorted records"
      columns={columns}
      rows={rows}
      sortDescriptor={{ column: "name", direction: "ascending" }}
    />,
  );
  assert.equal(
    view.getByRole("columnheader", { name: /Name/ }).getAttribute("aria-sort"),
    "ascending",
  );
  assert.ok(view.container.querySelector(".fux-table__sort")?.textContent?.includes("↑"));
});

test("disabled and readonly input states reach their native editing elements", () => {
  const view = render(
    <>
      <C.TextArea label="Read only" isReadOnly defaultValue="Keep" />
      <C.NumberField label="Disabled number" isDisabled defaultValue={3} />
      <C.DateField label="Disabled date" isDisabled />
      <C.ColorField label="Disabled color" isDisabled defaultValue="#336699" />
      <C.Slider label="Disabled slider" isDisabled />
    </>,
  );
  assert.ok((view.getByRole("textbox", { name: "Read only" }) as HTMLTextAreaElement).readOnly);
  assert.ok((view.getByRole("textbox", { name: "Disabled number" }) as HTMLInputElement).disabled);
  assert.ok((view.getByRole("textbox", { name: "Disabled color" }) as HTMLInputElement).disabled);
  assert.ok((view.getByRole("slider", { name: "Disabled slider" }) as HTMLInputElement).disabled);
});

test("RTL locale changes keyboard progression without custom key managers", async () => {
  const view = render(
    <C.Primitives.I18nProvider locale="ar">
      <C.Tabs
        label="Views"
        items={[
          { id: "first", label: "First", content: "One" },
          { id: "second", label: "Second", content: "Two" },
        ]}
      />
    </C.Primitives.I18nProvider>,
  );
  const first = view.getByRole("tab", { name: "First" });
  await act(async () => {
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
  });
  assert.equal(view.getByRole("tab", { name: "Second" }).getAttribute("aria-selected"), "true");
});
