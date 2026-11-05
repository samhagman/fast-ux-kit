import * as React from "react";
import { CalendarDate, Time } from "@internationalized/date";
import * as C from "@samhagman/fast-ux-kit/components";

export interface FixtureAction {
  target: string;
  event: "click" | "input" | "key" | "focus" | "hover" | "file";
  value?: string;
  expect: string;
  text?: string;
}
export interface ComponentFixture {
  Component: React.ComponentType;
  selector: string;
  instructions: string;
  actions: readonly FixtureAction[];
}
interface DemoState {
  report: (value: unknown) => void;
  open: boolean;
  setOpen: (value: boolean) => void;
  page: number;
  setPage: (value: number) => void;
}
function example(
  instructions: string,
  render: (state: DemoState) => React.ReactNode,
  selector: string,
  actions: readonly FixtureAction[] = [],
): ComponentFixture {
  function Component() {
    const [status, setStatus] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [page, setPage] = React.useState(0);
    const report = (value: unknown) =>
      setStatus(Array.isArray(value) ? value.join(", ") : String(value ?? "Cleared"));
    return (
      <div className="component-fixture">
        {render({ report, open, setOpen, page, setPage })}
        <output className="fixture-status" aria-live="polite">
          {status}
        </output>
      </div>
    );
  }
  return { Component, selector, instructions, actions };
}
const click = (target: string, expect = ".fixture-status", text?: string): FixtureAction => ({
  target,
  event: "click",
  expect,
  text,
});
const input = (target: string, value: string, text = value): FixtureAction => ({
  target,
  event: "input",
  value,
  expect: ".fixture-status",
  text,
});
const key = (target: string, value: string, expect: string, text?: string): FixtureAction => ({
  target,
  event: "key",
  value,
  expect,
  text,
});
const options = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done", disabled: true },
];
const date = new CalendarDate(2028, 2, 12);
const tree = [
  {
    id: "project",
    label: "Project",
    children: [
      { id: "plan", label: "Plan" },
      { id: "notes", label: "Notes" },
    ],
  },
];
const svgImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#cdd8cc"/><circle cx="220" cy="180" r="96" fill="#49624d"/><path d="M320 340 480 80 620 340" fill="#9aaa80"/></svg>')}`;
const fileAction: FixtureAction = {
  target: 'input[type="file"]',
  event: "file",
  expect: ".fixture-status",
  text: "example.txt",
};

export const componentFixtures: Readonly<Record<string, ComponentFixture>> = {
  Button: example(
    "Save records an action below.",
    (s) => <C.Button onClick={() => s.report("Saved")}>Save</C.Button>,
    "button",
    [click("button", ".fixture-status", "Saved")],
  ),
  IconButton: example(
    "The icon has a named, full-size action target.",
    (s) => (
      <C.IconButton label="Add item" onClick={() => s.report("Added")}>
        +
      </C.IconButton>
    ),
    'button[aria-label="Add item"]',
    [click("button", ".fixture-status", "Added")],
  ),
  Link: example(
    "Open the linked section with a native link.",
    () => <C.Link href="#component-details">Component details</C.Link>,
    'a[href="#component-details"]',
  ),
  ToggleButton: example(
    "Toggle emphasis with a pointer or Space.",
    (s) => <C.ToggleButton onPressedChange={s.report}>Emphasis</C.ToggleButton>,
    'button[aria-pressed="false"]',
    [click("button", 'button[aria-pressed="true"]')],
  ),
  ToggleButtonGroup: example(
    "Choose an alignment.",
    (s) => (
      <C.ToggleButtonGroup defaultValue={["left"]} onValueChange={s.report}>
        <C.ToggleButtonGroupItem value="left">Left</C.ToggleButtonGroupItem>
        <C.ToggleButtonGroupItem value="center">Center</C.ToggleButtonGroupItem>
      </C.ToggleButtonGroup>
    ),
    '[data-slot="toggle-group"]',
    [click('[data-slot="toggle-group-item"]:last-child', ".fixture-status", "center")],
  ),
  Toolbar: example(
    "Tab enters the toolbar; arrow keys move between actions.",
    (s) => (
      <C.Toolbar.Root aria-label="Formatting" className="fux-row">
        <C.Toolbar.Button className="fux-control" onClick={() => s.report("Bold")}>
          Bold
        </C.Toolbar.Button>
        <C.Toolbar.Button className="fux-control" onClick={() => s.report("Italic")}>
          Italic
        </C.Toolbar.Button>
      </C.Toolbar.Root>
    ),
    '[role="toolbar"]',
    [click("button", ".fixture-status", "Bold")],
  ),
  Field: example(
    "Edit a labeled text field.",
    (s) => <C.Field label="Project name" hint="A short working title." onValueChange={s.report} />,
    "input",
    [input("input", "Notebook")],
  ),
  TextArea: example(
    "Enter a multi-line note.",
    (s) => <C.TextArea label="Notes" rows={4} onValueChange={s.report} />,
    "textarea",
    [input("textarea", "A useful note")],
  ),
  SearchField: example(
    "Search text is reported as it changes.",
    (s) => <C.SearchField label="Search documents" onValueChange={s.report} />,
    'input[type="search"]',
    [input("input", "calendar")],
  ),
  NumberField: example(
    "Adjust a bounded quantity.",
    (s) => (
      <C.NumberField label="Copies" defaultValue={2} min={1} max={10} onValueChange={s.report} />
    ),
    "input",
    [click('button[aria-label="Increase"]', ".fixture-status", "3")],
  ),
  Checkbox: example(
    "Toggle a single preference.",
    (s) => <C.Checkbox label="Send updates" onCheckedChange={s.report} />,
    '[role="checkbox"]',
    [click('[role="checkbox"]', '[role="checkbox"][aria-checked="true"]')],
  ),
  CheckboxGroup: example(
    "Select several channels independently.",
    (s) => <C.CheckboxGroup label="Channels" options={options} onValueChange={s.report} />,
    '[role="checkbox"]',
    [click('[role="checkbox"]', ".fixture-status", "draft")],
  ),
  RadioGroup: example(
    "Select one stage.",
    (s) => <C.RadioGroup label="Stage" options={options} onValueChange={s.report} />,
    '[role="radiogroup"]',
    [click('[role="radio"]', ".fixture-status", "draft")],
  ),
  Switch: example(
    "Toggle automatic saving.",
    (s) => <C.Switch label="Autosave" onCheckedChange={s.report} />,
    '[role="switch"]',
    [click('[role="switch"]', '[role="switch"][aria-checked="true"]')],
  ),
  Slider: example(
    "Arrow keys adjust a numeric value.",
    (s) => <C.Slider label="Volume" defaultValue={30} onValueChange={s.report} />,
    'input[type="range"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "31")],
  ),
  Select: example(
    "Open the menu and choose a stage.",
    (s) => <C.Select label="Stage" options={options} onValueChange={s.report} />,
    'button[role="combobox"]',
    [
      click('button[role="combobox"]', '[role="option"]'),
      click('[role="option"]', ".fixture-status", "draft"),
    ],
  ),
  ComboBox: example(
    "Type to filter or open all options.",
    (s) => <C.ComboBox label="Stage" options={options} onValueChange={s.report} />,
    'input[role="combobox"]',
    [
      click('button[aria-label="Show options"]', '[role="option"]'),
      click('[role="option"]', ".fixture-status", "draft"),
    ],
  ),
  ListBox: example(
    "Choose an item with pointer or keyboard.",
    (s) => <C.ListBox label="Stages" options={options} onValueChange={s.report} />,
    '[role="listbox"]',
    [click('[role="option"]', ".fixture-status", "draft")],
  ),
  GridList: example(
    "Items use grid semantics and keyboard selection.",
    (s) => <C.GridList label="Stages" items={options} onValueChange={s.report} />,
    '[role="grid"]',
    [click('[role="row"]', ".fixture-status", "draft")],
  ),
  Table: example(
    "Sort the names without changing the source rows.",
    (s) => (
      <C.Table
        label="Documents"
        rows={[
          { id: "b", name: "Beta" },
          { id: "a", name: "Alpha" },
        ]}
        columns={[
          {
            id: "name",
            label: "Name",
            render: (row) => row.name,
            allowsSorting: true,
            compare: (a, b) => a.name.localeCompare(b.name),
          },
        ]}
        onSortChange={(sort) => s.report(sort.direction)}
      />
    ),
    'table[aria-label="Documents"]',
    [click("th button", ".fixture-status", "ascending")],
  ),
  Tree: example(
    "Expand Project to reveal its children.",
    () => <C.Tree label="Documents" items={tree} />,
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  NavigationTree: example(
    "Navigate a document hierarchy.",
    () => <C.NavigationTree label="Browse documents" items={tree} />,
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  TagGroup: example(
    "Remove a tag while preserving the remaining tags.",
    (s) => <C.TagGroup label="Tags" tags={["planning", "design"]} onRemove={s.report} />,
    '[role="group"][aria-label="Tags"]',
    [click('button[aria-label="Remove planning"]', ".fixture-status", "planning")],
  ),
  TokenField: example(
    "Enter a token and press Enter.",
    (s) => (
      <C.TokenField
        label="Tokens"
        defaultValue={[{ id: "planning", label: "planning" }]}
        suggestions={[{ id: "design", label: "design" }]}
        onValueChange={(tokens) => s.report(tokens.map((token) => token.label))}
      />
    ),
    "input",
    [input("input", "design", ""), key("input", "Enter", ".fixture-status", "planning, design")],
  ),
  Menu: example(
    "Choose an action from a keyboard-operable menu.",
    (s) => <C.Menu label="Actions" items={options} onAction={s.report} />,
    "button",
    [click("button", '[role="menuitem"]'), click('[role="menuitem"]', ".fixture-status", "draft")],
  ),
  Tabs: example(
    "Switch between two document views.",
    () => (
      <C.Tabs
        label="Document view"
        defaultValue="notes"
        items={[
          { id: "notes", label: "Notes", content: <p>Notes view</p> },
          { id: "history", label: "History", content: <p>History view</p> },
        ]}
      />
    ),
    '[role="tablist"]',
    [click('[role="tab"]:last-child', '[role="tabpanel"]', "History view")],
  ),
  Breadcrumbs: example(
    "The current location is announced as a page.",
    () => (
      <C.Breadcrumbs
        items={[
          { id: "home", label: "Home", href: "#home" },
          { id: "notes", label: "Notes" },
        ]}
      />
    ),
    'nav[aria-label="Breadcrumbs"] [aria-current="page"]',
  ),
  Disclosure: example(
    "Expand optional details.",
    () => (
      <C.Disclosure title="Details">
        <p data-example-details>Additional detail is visible.</p>
      </C.Disclosure>
    ),
    "button",
    [click("button", "[data-example-details]", "Additional detail")],
  ),
  DisclosureGroup: example(
    "Open an accordion section.",
    () => (
      <C.DisclosureGroup
        items={[
          { id: "one", title: "First section", content: <p>First section content</p> },
          { id: "two", title: "Second section", content: <p>Second section content</p> },
        ]}
      />
    ),
    "button",
    [click("button", '[role="region"]', "First section content")],
  ),
  Dialog: example(
    "Open a dialog with a title and description.",
    () => (
      <C.Dialog>
        <C.DialogTrigger render={<C.Button />}>Open dialog</C.DialogTrigger>
        <C.DialogContent>
          <C.DialogTitle>Document details</C.DialogTitle>
          <C.DialogDescription>Review this synthetic example.</C.DialogDescription>
        </C.DialogContent>
      </C.Dialog>
    ),
    "button",
    [click("button", '[role="dialog"]', "Document details")],
  ),
  ModalDialog: example(
    "Open and dismiss a controlled modal.",
    (s) => (
      <>
        <C.Button onClick={() => s.setOpen(true)}>Open modal</C.Button>
        <C.ModalDialog
          title="Confirm action"
          description="A controlled modal example."
          open={s.open}
          onOpenChange={s.setOpen}
        >
          <p>Modal content</p>
        </C.ModalDialog>
      </>
    ),
    "button",
    [click("button", '[role="dialog"]', "Confirm action")],
  ),
  Popover: example(
    "Open contextual content beside its trigger.",
    () => (
      <C.Popover>
        <C.PopoverTrigger render={<C.Button variant="outline" />}>Open popover</C.PopoverTrigger>
        <C.PopoverContent>
          <p>Contextual information</p>
        </C.PopoverContent>
      </C.Popover>
    ),
    "button",
    [click("button", '[role="dialog"]', "Contextual information")],
  ),
  Tooltip: example(
    "Hover or focus the trigger to reveal its description.",
    () => (
      <C.TooltipProvider>
        <C.Tooltip>
          <C.TooltipTrigger render={<C.Button variant="outline" />}>
            Keyboard shortcut
          </C.TooltipTrigger>
          <C.TooltipContent>Press Control K</C.TooltipContent>
        </C.Tooltip>
      </C.TooltipProvider>
    ),
    "button",
    [{ target: "button", event: "hover", expect: '[role="tooltip"]', text: "Press Control K" }],
  ),
  Sheet: example(
    "Open a side sheet with a named heading.",
    () => (
      <C.Sheet>
        <C.SheetTrigger render={<C.Button variant="outline" />}>Open sheet</C.SheetTrigger>
        <C.SheetContent>
          <C.SheetTitle>Document settings</C.SheetTitle>
          <C.SheetDescription>Settings stay local to this example.</C.SheetDescription>
        </C.SheetContent>
      </C.Sheet>
    ),
    "button",
    [click("button", '[role="dialog"]', "Document settings")],
  ),
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
  ProgressBar: example(
    "A labeled progress indicator exposes its current value.",
    () => <C.ProgressBar label="Upload" value={65} />,
    '[role="progressbar"][aria-valuenow="65"]',
  ),
  Meter: example(
    "A meter describes a bounded measurement.",
    () => <C.Meter label="Storage" value={45} />,
    '[role="meter"][aria-valuenow="45"]',
  ),
  DropZone: example(
    "Drop or choose a text file.",
    (s) => (
      <C.DropZone
        label="Choose file"
        accept=".txt"
        onFilesChange={(files) => s.report(files.map((file) => file.name))}
      />
    ),
    ".fux-dropzone",
    [fileAction],
  ),
  FileTrigger: example(
    "Choose a file through the native file dialog.",
    (s) => (
      <C.FileTrigger
        label="Choose file"
        accept=".txt"
        onFilesChange={(files) => s.report(files.map((file) => file.name))}
      />
    ),
    'input[type="file"]',
    [fileAction],
  ),
  Form: example(
    "Submit a form without leaving this page.",
    (s) => (
      <C.Form
        onSubmit={(event) => {
          event.preventDefault();
          s.report("Submitted");
        }}
      >
        <C.Field label="Name" name="name" defaultValue="Example" />
        <C.Button type="submit">Submit</C.Button>
      </C.Form>
    ),
    "form",
    [click('button[type="submit"]', ".fixture-status", "Submitted")],
  ),
  Separator: example(
    "A semantic separator divides related content.",
    () => (
      <>
        <p>Before</p>
        <C.Separator decorative={false} />
        <p>After</p>
      </>
    ),
    '[role="separator"]',
  ),
  Stack: example(
    "A vertical stack uses shared spacing tokens.",
    () => (
      <C.Stack>
        <C.Panel>First item</C.Panel>
        <C.Panel>Second item</C.Panel>
      </C.Stack>
    ),
    ".fux-stack > .fux-panel",
  ),
  Row: example(
    "A row aligns actions horizontally.",
    () => (
      <C.Row>
        <C.Button variant="outline">Cancel</C.Button>
        <C.Button>Save</C.Button>
      </C.Row>
    ),
    ".fux-row > button",
  ),
  Panel: example(
    "A neutral surface groups related information.",
    () => (
      <C.Panel>
        <h3>Document information</h3>
        <p>Updated just now.</p>
      </C.Panel>
    ),
    ".fux-panel h3",
  ),
  AngleSlider: example(
    "Arrow keys adjust the angle.",
    (s) => <C.AngleSlider label="Rotation" defaultValue={45} onValueChange={s.report} />,
    '[role="slider"]',
    [key('[role="slider"]', "ArrowRight", ".fixture-status", "46")],
  ),
  Avatar: example(
    "Initials are shown when an image is unavailable.",
    () => <C.Avatar alt="Example Reader" fallback="ER" />,
    ".fux-avatar-fallback",
  ),
  Carousel: example(
    "Browse two slides with the Next action.",
    () => (
      <C.Carousel label="Examples">
        <C.Panel>First slide</C.Panel>
        <C.Panel>Second slide</C.Panel>
      </C.Carousel>
    ),
    '[aria-roledescription="carousel"]',
    [click("button:last-child", "output", "2 / 2")],
  ),
  Clipboard: example(
    "Copy the example text to the clipboard.",
    () => <C.Clipboard value="Example note" label="Copy note" />,
    "button",
    [click("button", '[role="status"]', "Copied")],
  ),
  DownloadTrigger: example(
    "The link exposes a file download action.",
    () => (
      <C.DownloadTrigger href="/demo/eval-curve.svg" filename="example.svg">
        Download sample
      </C.DownloadTrigger>
    ),
    'a[download="example.svg"]',
  ),
  Drawer: example(
    "Open a drawer with a title and dismissal action.",
    () => (
      <C.Drawer>
        <C.DrawerTrigger render={<C.Button variant="outline" />}>Open drawer</C.DrawerTrigger>
        <C.DrawerContent>
          <C.DrawerTitle>Quick actions</C.DrawerTitle>
          <C.DrawerDescription>Choose a document action.</C.DrawerDescription>
        </C.DrawerContent>
      </C.Drawer>
    ),
    "button",
    [click("button", '[role="dialog"]', "Quick actions")],
  ),
  Editable: example(
    "Activate the title, edit it and press Enter.",
    (s) => <C.Editable label="Title" defaultValue="Untitled" onValueChange={s.report} />,
    'button[aria-label="Edit Title"]',
    [
      click("button", "input"),
      input("input", "New title", ""),
      key("input", "Enter", ".fixture-status", "New title"),
    ],
  ),
  Fieldset: example(
    "Related controls share a legend.",
    () => (
      <C.Fieldset legend="Preferences">
        <C.Checkbox label="Weekly summary" />
      </C.Fieldset>
    ),
    "fieldset[aria-labelledby]",
  ),
  FileUpload: example(
    "Select a file and review the file list.",
    (s) => (
      <C.FileUpload
        label="Upload file"
        accept=".txt"
        onFilesChange={(files) => s.report(files.map((file) => file.name))}
      />
    ),
    'input[type="file"]',
    [fileAction],
  ),
  FloatingPanel: example(
    "Open a panel, then move or resize it with its keyboard controls.",
    () => (
      <C.FloatingPanel title="Scratchpad" trigger="Open scratchpad">
        <C.Field label="Quick note" />
      </C.FloatingPanel>
    ),
    "button",
    [click("button", '[role="dialog"]', "Scratchpad")],
  ),
  HoverCard: example(
    "Focus the profile link to reveal a preview.",
    () => (
      <C.HoverCard>
        <C.HoverCardTrigger render={<C.Button variant="outline" />}>
          Profile preview
        </C.HoverCardTrigger>
        <C.HoverCardContent>
          <p>Example Reader</p>
          <p>A synthetic profile.</p>
        </C.HoverCardContent>
      </C.HoverCard>
    ),
    "button",
    [
      {
        target: "button",
        event: "focus",
        expect: '[data-slot="hover-card-content"]',
        text: "Example Reader",
      },
    ],
  ),
  ImageCropper: example(
    "Adjust image zoom or rotation.",
    (s) => (
      <C.ImageCropper
        src={svgImage}
        alt="Geometric landscape"
        onValueChange={(value) => s.report(`Zoom ${value.zoom.toFixed(2)}`)}
      />
    ),
    'section[aria-label="Crop Geometric landscape"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "Zoom 1.05")],
  ),
  JsonTreeView: example(
    "Expand structured data in a keyboard-operable tree.",
    () => <C.JsonTreeView value={{ title: "Example", complete: false }} label="Document data" />,
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  Marquee: example(
    "Pause or resume the moving content.",
    () => (
      <C.Marquee label="Highlights">
        <span>Outline · Search · Notes · Outline · Search · Notes</span>
      </C.Marquee>
    ),
    ".fux-marquee",
    [click("button", 'button[aria-pressed="true"]', "Resume motion")],
  ),
  NavigationMenu: example(
    "Open a navigation section.",
    () => (
      <C.NavigationMenu
        label="Site sections"
        items={[
          {
            id: "docs",
            label: "Documentation",
            children: <C.Link href="#guide">Read the guide</C.Link>,
          },
          { id: "home", label: "Home", href: "#home" },
        ]}
      />
    ),
    '[aria-label="Site sections"]',
    [click("button", 'a[href="#guide"]', "Read the guide")],
  ),
  PasswordInput: example(
    "Reveal or hide the password.",
    () => <C.PasswordInput label="Password" defaultValue="example-password" />,
    'input[type="password"]',
    [click('button[aria-label="Show password"]', 'input[type="text"]')],
  ),
  PinInput: example(
    "Enter a verification code one digit at a time.",
    (s) => <C.PinInput label="Verification code" length={4} onValueChange={s.report} />,
    "input",
    [input("input", "1", "1")],
  ),
  QrCode: example(
    "The QR contains a synthetic example URL.",
    () => <C.QrCode value="https://example.com/notebook" label="Notebook QR" />,
    'svg[role="img"] path[d]',
  ),
  RatingGroup: example(
    "Choose a rating.",
    (s) => <C.RatingGroup label="Rating" onValueChange={s.report} />,
    '[role="radiogroup"]',
    [click('[role="radio"]', ".fixture-status", "1")],
  ),
  ScrollArea: example(
    "Scroll the bounded list of notes.",
    () => (
      <C.ScrollArea className="h-40">
        <div className="fux-stack">
          {Array.from({ length: 15 }, (_, index) => (
            <p key={index}>Note {index + 1}</p>
          ))}
        </div>
      </C.ScrollArea>
    ),
    '[data-slot="scroll-area-viewport"]',
  ),
  SegmentGroup: example(
    "Choose a view from a segmented control.",
    (s) => <C.SegmentGroup label="View" items={options} onValueChange={s.report} />,
    '[aria-label="View"]',
    [click("button", ".fixture-status", "draft")],
  ),
  SignaturePad: example(
    "Draw a signature or switch to keyboard entry.",
    (s) => (
      <C.SignaturePad
        label="Signature"
        onValueChange={(value) =>
          s.report(value.mode === "type" ? value.text : `${value.strokes.length} strokes`)
        }
      />
    ),
    'canvas[aria-label="Signature drawing surface"]',
    [click('button[aria-pressed="false"]:nth-child(2)', "input"), input("input", "Example Reader")],
  ),
  Splitter: example(
    "Drag the divider or use its arrow keys to resize panels.",
    () => (
      <C.Splitter.Root style={{ minHeight: 160 }}>
        <C.Splitter.Panel defaultSize={50}>
          <C.Panel>Outline</C.Panel>
        </C.Splitter.Panel>
        <C.Splitter.Handle />
        <C.Splitter.Panel defaultSize={50}>
          <C.Panel>Details</C.Panel>
        </C.Splitter.Panel>
      </C.Splitter.Root>
    ),
    '[role="separator"]',
  ),
  Steps: example(
    "Move through a short sequence.",
    (s) => (
      <C.Steps
        label="Setup"
        items={[
          { id: "create", title: "Create" },
          { id: "review", title: "Review" },
        ]}
        value={s.page}
        onValueChange={s.setPage}
      />
    ),
    'nav[aria-label="Setup"]',
    [click("li:last-child button", 'li[aria-current="step"]', "Review")],
  ),
  TagsInput: example(
    "Enter tags and remove them independently.",
    (s) => <C.TagsInput label="Tags" defaultValue={["planning"]} onValueChange={s.report} />,
    "input",
    [input("input", "design", ""), key("input", "Enter", ".fixture-status", "planning, design")],
  ),
  Timer: example(
    "Start, pause or reset a one-minute timer.",
    () => <C.Timer label="Focus timer" seconds={60} />,
    'output[aria-label="Time remaining"]',
    [click("button", "button", "Pause")],
  ),
  Toast: example(
    "Show a transient notification.",
    () => (
      <>
        <C.Button onClick={() => C.toast("Saved example")}>Show toast</C.Button>
        <C.Toast />
      </>
    ),
    "button",
    [click("button", "[data-sonner-toast]", "Saved example")],
  ),
  Toc: example(
    "The current section is marked in a document outline.",
    () => (
      <C.Toc
        activeId="intro"
        items={[
          { id: "intro", label: "Introduction" },
          { id: "details", label: "Details", level: 2 },
        ]}
      />
    ),
    'nav a[aria-current="location"]',
  ),
  Tour: example(
    "Step through a short guided introduction.",
    () => (
      <C.Tour
        steps={[
          { id: "start", title: "Welcome", description: "Start with a document." },
          { id: "finish", title: "All set", description: "Your notebook is ready." },
        ]}
      />
    ),
    "button",
    [click("button", '[role="dialog"]', "Welcome")],
  ),
  Pagination: example(
    "Move between result pages.",
    (s) => <C.Pagination label="Results" count={50} onPageChange={s.report} />,
    'nav[aria-label="Results"]',
    [click('button[aria-label="Page 2"]', ".fixture-status", "2")],
  ),
};

export function ComponentsPage() {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState("Button");
  const entries = C.componentManifest.filter((entry) =>
    `${entry.name} ${entry.category} ${entry.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const current = C.componentManifest.find((entry) => entry.name === selected)!;
  const fixture = componentFixtures[selected];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="border-b px-5 py-5 md:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fast UX Kit
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Component library</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {C.componentManifest.length} families
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Explore the controls, data views and interactions that make up the kit.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex min-h-0 flex-col border-b md:w-64 md:shrink-0 md:border-e md:border-b-0">
          <div className="p-3">
            <C.SearchField label="Find a component" value={query} onValueChange={setQuery} />
          </div>
          <nav
            aria-label="Component families"
            className="flex max-h-52 gap-1 overflow-auto p-2 md:max-h-none md:flex-1 md:flex-col"
          >
            {entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                data-family={entry.name}
                aria-current={selected === entry.name ? "page" : undefined}
                onClick={() => setSelected(entry.name)}
                className={C.cn(
                  "min-h-11 shrink-0 rounded-md px-3 py-2 text-start text-sm",
                  selected === entry.name
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {entry.name}
              </button>
            ))}
            {!entries.length && (
              <p className="p-3 text-sm text-muted-foreground">No matching components.</p>
            )}
          </nav>
        </aside>
        <section
          id="component-details"
          className="min-h-0 min-w-0 flex-1 overflow-auto px-5 py-7 md:px-10"
          aria-labelledby="component-heading"
        >
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {current.category}
            </p>
            <h2 id="component-heading" className="mt-3 text-3xl font-semibold tracking-tight">
              {current.name}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {current.description}
            </p>
            <div className="my-8 border-y py-8" data-component-fixture={selected}>
              {fixture && <fixture.Component key={selected} />}
            </div>
            <h3 className="text-sm font-medium">Try it</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{fixture?.instructions}</p>
            <p className="mt-8 font-mono text-xs text-muted-foreground">
              import &#123; {current.exportName} &#125; from
              &quot;@samhagman/fast-ux-kit/components&quot;
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
