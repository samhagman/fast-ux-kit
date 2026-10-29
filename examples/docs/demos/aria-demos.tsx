import { useState, type ReactNode } from "react";
import { CalendarDate, Time } from "@internationalized/date";
import * as C from "../../../src/components/aria.js";
import { TokenFieldValue } from "../../../src/aria/index.js";

export interface ComponentDemo {
  render: () => ReactNode;
  code: string;
  notes?: string[];
}
const options = [
  { id: "draft", label: "Draft", description: "Keep working privately" },
  { id: "review", label: "In review", description: "Ready for feedback" },
  { id: "done", label: "Done" },
];
const palette = [
  { color: "#315b8d", label: "Ocean" },
  { color: "#9a465c", label: "Rose" },
  { color: "#52724b", label: "Moss" },
  { color: "#9a6b24", label: "Amber" },
];
const date = new CalendarDate(2026, 10, 15);
const tree = [
  {
    id: "work",
    label: "Components",
    children: [
      { id: "design", label: "Color picker", href: "#color-picker" },
      { id: "research", label: "Outline reader", href: "#outline" },
    ],
  },
  { id: "archive", label: "Installation", href: "#installation" },
];
const demo = (render: () => ReactNode, code: string, notes?: string[]): ComponentDemo => ({
  render,
  code,
  notes,
});
function ButtonDemo() {
  const [count, setCount] = useState(0);
  const [action, setAction] = useState("Choose an action");
  return (
    <C.Stack>
      <C.Row wrap>
        <C.Button variant="primary" onPress={() => setCount((value) => value + 1)}>
          Save changes
        </C.Button>
        <C.Button onPress={() => setAction("Secondary action selected")}>Secondary</C.Button>
        <C.Button variant="quiet" onPress={() => setAction("Quiet action selected")}>
          Quiet
        </C.Button>
        <C.Button
          variant="danger"
          onPress={() => setAction("Delete preview — no data was removed")}
        >
          Delete preview
        </C.Button>
        <C.Button isDisabled>Disabled</C.Button>
      </C.Row>
      <output aria-live="polite">
        Saved {count} times · {action}
      </output>
    </C.Stack>
  );
}
function IconButtonDemo() {
  const [saved, setSaved] = useState(false);
  return (
    <C.Row>
      <C.IconButton
        label={saved ? "Remove bookmark" : "Bookmark"}
        onPress={() => setSaved((value) => !value)}
      >
        {saved ? "★" : "☆"}
      </C.IconButton>
      <span>{saved ? "Bookmarked" : "Not bookmarked"}</span>
    </C.Row>
  );
}
function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <C.Button onPress={() => setOpen(true)}>Review changes</C.Button>
      <C.ModalDialog
        title="Review changes"
        isOpen={open}
        onOpenChange={setOpen}
        footer={
          <C.Button variant="primary" onPress={() => setOpen(false)}>
            Done
          </C.Button>
        }
      >
        <p>
          Focus stays in this dialog until you close it. Escape closes it and restores focus to the
          trigger.
        </p>
        <C.Field label="Summary" />
      </C.ModalDialog>
    </>
  );
}
function DialogDemo() {
  return (
    <C.Primitives.DialogTrigger>
      <C.Button>Open dialog</C.Button>
      <C.Primitives.ModalOverlay isDismissable>
        <C.Primitives.Modal>
          <C.Dialog>
            {({ close }) => (
              <>
                <C.Primitives.Heading slot="title">Your choice</C.Primitives.Heading>
                <p>Compose a dialog inside the same owner's modal primitives.</p>
                <C.Button onPress={close}>Close dialog</C.Button>
              </>
            )}
          </C.Dialog>
        </C.Primitives.Modal>
      </C.Primitives.ModalOverlay>
    </C.Primitives.DialogTrigger>
  );
}
function SheetDemo() {
  const P = C.Primitives;
  return (
    <P.SheetTrigger>
      <C.Button>Open sheet</C.Button>
      <P.SheetOverlay>
        <P.SheetBackdrop />
        <P.Sheet>
          <P.SheetContent>
            {({ close }) => (
              <>
                <P.Heading slot="title">Quick settings</P.Heading>
                <C.Switch label="Email updates" defaultSelected />
                <p>This panel is keyboard dismissible and supports owner-managed swiping.</p>
                <C.Button onPress={close}>Close settings</C.Button>
              </>
            )}
          </P.SheetContent>
        </P.Sheet>
      </P.SheetOverlay>
    </P.SheetTrigger>
  );
}
function TagsDemo() {
  const [items, setItems] = useState([
    { id: "design", label: "Design" },
    { id: "research", label: "Research" },
    { id: "build", label: "Build" },
  ]);
  return (
    <C.Stack>
      <C.TagGroup
        label="Topics"
        items={items}
        onRemove={(keys) => setItems((values) => values.filter((item) => !keys.has(item.id)))}
      />
      <C.Button
        onPress={() =>
          setItems([
            { id: "design", label: "Design" },
            { id: "research", label: "Research" },
            { id: "build", label: "Build" },
          ])
        }
      >
        Reset tags
      </C.Button>
    </C.Stack>
  );
}
function MenuDemo() {
  const [action, setAction] = useState("No action yet");
  return (
    <C.Stack>
      <C.Menu
        label="Document actions"
        items={[
          { id: "duplicate", label: "Duplicate", shortcut: "⌘D" },
          { id: "rename", label: "Rename" },
          { id: "archive", label: "Archive", isDisabled: true },
        ]}
        onAction={(key) => setAction(String(key))}
      />
      <output aria-live="polite">{action}</output>
    </C.Stack>
  );
}
function FormDemo() {
  const [result, setResult] = useState("");
  return (
    <C.Form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setResult(`Ready to invite ${data.get("email")}`);
      }}
    >
      <C.Field
        name="email"
        label="Email address"
        type="email"
        isRequired
        hint="Use a valid address to submit."
      />
      <C.Button type="submit" variant="primary">
        Invite
      </C.Button>
      <output aria-live="polite">{result}</output>
    </C.Form>
  );
}
function FilesDemo() {
  const [names, setNames] = useState("No file selected");
  return (
    <C.Stack>
      <C.FileTrigger
        allowsMultiple
        onSelect={(files) =>
          setNames(files ? [...files].map((file) => file.name).join(", ") : "No file selected")
        }
      >
        <C.Button>Choose files</C.Button>
      </C.FileTrigger>
      <output aria-live="polite">{names}</output>
    </C.Stack>
  );
}
function DropDemo() {
  const [count, setCount] = useState(0);
  return (
    <C.DropZone aria-label="Attachments" onDrop={(event) => setCount(event.items.length)}>
      <C.Primitives.Text slot="label">Drop attachments here</C.Primitives.Text>
      <p>{count ? `${count} items received` : "Drag local files here, or use the chooser."}</p>
      <C.FileTrigger allowsMultiple onSelect={(files) => setCount(files?.length ?? 0)}>
        <C.Button>Choose files</C.Button>
      </C.FileTrigger>
    </C.DropZone>
  );
}
function TokenDemo() {
  const [value, setValue] = useState(
    () =>
      new TokenFieldValue([
        { type: "text", text: "Ask " },
        { type: "token", text: "Design team", value: "design" },
        { type: "text", text: " about " },
      ]),
  );
  return (
    <C.Primitives.TokenField value={value} onChange={setValue}>
      <C.Primitives.Label>Message</C.Primitives.Label>
      <C.Primitives.TokenInput>
        {(segment) => <C.Primitives.Token>{segment.text}</C.Primitives.Token>}
      </C.Primitives.TokenInput>
    </C.Primitives.TokenField>
  );
}
function ToolbarDemo() {
  const [action, setAction] = useState("No history changes");
  return (
    <C.Stack>
      <C.Toolbar aria-label="Document tools">
        <C.Button onPress={() => setAction("Undo requested — demo history")}>Undo</C.Button>
        <C.Button onPress={() => setAction("Redo requested — demo history")}>Redo</C.Button>
        <C.Separator orientation="vertical" />
        <C.ToggleButton>Bold</C.ToggleButton>
        <C.ToggleButton>Italic</C.ToggleButton>
      </C.Toolbar>
      <output aria-live="polite">{action}</output>
    </C.Stack>
  );
}
function RowDemo() {
  const [action, setAction] = useState("Choose an action");
  return (
    <C.Stack>
      <C.Row gap="sm" wrap>
        {["First", "Second", "Third"].map((name) => (
          <C.Button key={name} onPress={() => setAction(`${name} action selected`)}>
            {name} action
          </C.Button>
        ))}
      </C.Row>
      <output aria-live="polite">{action}</output>
    </C.Stack>
  );
}
function TableDemo() {
  return (
    <C.Table
      label="Project status"
      columns={[
        { id: "name", label: "Project", render: (row) => row.name },
        { id: "status", label: "Status", render: (row) => row.status },
      ]}
      rows={[
        { id: "a", name: "Navigation", status: "In review" },
        { id: "b", name: "Color controls", status: "Ready" },
        { id: "c", name: "Calendar", status: "Ready" },
      ]}
    />
  );
}

export const ariaDemos: Record<string, ComponentDemo> = {
  Button: demo(
    () => <ButtonDemo />,
    `<Button variant="primary" onPress={save}>Save changes</Button>`,
    [
      "Use onPress for a single keyboard, touch and pointer action path.",
      "Disabled and pending states retain owner semantics.",
    ],
  ),
  IconButton: demo(
    () => <IconButtonDemo />,
    `<IconButton label="Bookmark" onPress={bookmark}>☆</IconButton>`,
    [
      "The label is required. Icon content is decorative and must not contain another interactive element.",
    ],
  ),
  Link: demo(
    () => (
      <C.Row wrap>
        <C.Link href="#installation">Read installation</C.Link>
        <C.Link href="#components" variant="block">
          Browse components →
        </C.Link>
      </C.Row>
    ),
    `<Link href="/guide">Read the guide</Link>`,
  ),
  ToggleButton: demo(
    () => <C.ToggleButton>Pin to sidebar</C.ToggleButton>,
    `<ToggleButton defaultSelected>Pin to sidebar</ToggleButton>`,
  ),
  ToggleButtonGroup: demo(
    () => (
      <C.ToggleButtonGroup selectionMode="multiple" aria-label="Text emphasis">
        <C.ToggleButton id="bold">Bold</C.ToggleButton>
        <C.ToggleButton id="italic">Italic</C.ToggleButton>
        <C.ToggleButton id="underline">Underline</C.ToggleButton>
      </C.ToggleButtonGroup>
    ),
    `<ToggleButtonGroup selectionMode="multiple" aria-label="Text emphasis">
  <ToggleButton id="bold">Bold</ToggleButton>
  <ToggleButton id="italic">Italic</ToggleButton>
</ToggleButtonGroup>`,
  ),
  Toolbar: demo(
    () => <ToolbarDemo />,
    `<Toolbar aria-label="Document tools">
  <Button>Undo</Button>
  <Button>Redo</Button>
  <Separator orientation="vertical" />
  <ToggleButton>Bold</ToggleButton>
</Toolbar>`,
  ),
  Field: demo(
    () => (
      <C.Field
        label="Project name"
        defaultValue="A considered workspace"
        hint="A name your team will recognize."
      />
    ),
    `<Field label="Project name" name="project" hint="A short, descriptive name." />`,
  ),
  TextArea: demo(
    () => (
      <C.TextArea
        label="Project brief"
        defaultValue="Make the everyday work feel effortless."
        hint="Plain text, with room to think."
      />
    ),
    `<TextArea label="Project brief" rows={4} hint="Plain text, with room to think." />`,
  ),
  SearchField: demo(
    () => <C.SearchField label="Search documents" placeholder="Try a title or keyword" />,
    `<SearchField label="Search documents" onSubmit={search} />`,
  ),
  NumberField: demo(
    () => (
      <C.NumberField
        label="Team seats"
        minValue={1}
        maxValue={20}
        defaultValue={4}
        hint="Between 1 and 20 seats."
      />
    ),
    `<NumberField label="Team seats" minValue={1} maxValue={20} defaultValue={4} />`,
  ),
  Checkbox: demo(
    () => (
      <C.Stack gap="xs">
        <C.Checkbox label="Include supporting notes" defaultSelected />
        <C.Checkbox label="Some items selected" isIndeterminate />
        <C.Checkbox label="Unavailable option" isDisabled />
      </C.Stack>
    ),
    `<Checkbox label="Include supporting notes" defaultSelected />`,
  ),
  CheckboxGroup: demo(
    () => (
      <C.CheckboxGroup
        label="Notifications"
        options={[
          { id: "comments", label: "Comments" },
          { id: "mentions", label: "Mentions" },
          { id: "updates", label: "Weekly updates" },
        ]}
        defaultValue={["comments", "mentions"]}
      />
    ),
    `<CheckboxGroup label="Notifications" defaultValue={["comments"]}
  options={[{ id: "comments", label: "Comments" }, { id: "mentions", label: "Mentions" }]} />`,
  ),
  RadioGroup: demo(
    () => (
      <C.RadioGroup
        label="Visibility"
        defaultValue="team"
        options={[
          { id: "private", label: "Private", description: "Only you can access this project." },
          { id: "team", label: "Team", description: "Everyone in the workspace." },
        ]}
      />
    ),
    `<RadioGroup label="Visibility" defaultValue="team"
  options={[{ id: "private", label: "Private" }, { id: "team", label: "Team" }]} />`,
  ),
  Switch: demo(
    () => <C.Switch label="Email notifications" defaultSelected />,
    `<Switch label="Email notifications" defaultSelected />`,
  ),
  Slider: demo(
    () => (
      <C.Stack>
        <C.Slider label="Zoom" defaultValue={50} />
        <C.Slider
          label="Price range"
          defaultValue={[20, 80]}
          thumbLabels={["Minimum", "Maximum"]}
        />
      </C.Stack>
    ),
    `<Slider label="Price range" defaultValue={[20, 80]}
  thumbLabels={["Minimum", "Maximum"]} />`,
    ["Name every thumb in a multi-thumb range."],
  ),
  Select: demo(
    () => <C.Select label="Status" options={options} defaultSelectedKey="draft" />,
    `<Select label="Status" defaultSelectedKey="draft"
  options={[{ id: "draft", label: "Draft" }, { id: "done", label: "Done" }]} />`,
  ),
  ComboBox: demo(
    () => <C.ComboBox label="Find a status" options={options} />,
    `<ComboBox label="Find a status"
  options={[{ id: "draft", label: "Draft" }, { id: "done", label: "Done" }]} />`,
  ),
  ListBox: demo(
    () => (
      <C.ListBox
        label="Document status"
        options={options}
        selectionMode="single"
        defaultSelectedKeys={["draft"]}
      />
    ),
    `<ListBox label="Document status" selectionMode="single"
  options={[{ id: "draft", label: "Draft" }, { id: "done", label: "Done" }]} />`,
  ),
  GridList: demo(
    () => (
      <C.GridList
        label="Projects"
        selectionMode="multiple"
        items={[
          { id: "navigation", label: "Navigation", description: "Wayfinding and hierarchy" },
          { id: "editor", label: "Editor", description: "Writing and structure" },
          { id: "controls", label: "Controls", description: "Selection and input" },
        ]}
      />
    ),
    `<GridList label="Projects" selectionMode="multiple"
  items={[{ id: "navigation", label: "Navigation", description: "Wayfinding and hierarchy" }]} />`,
  ),
  Table: demo(
    () => <TableDemo />,
    `<Table label="Project status"
  columns={[
    { id: "name", label: "Project", render: row => row.name },
    { id: "status", label: "Status", render: row => row.status }
  ]}
  rows={[{ id: "a", name: "Navigation", status: "In review" }]} />`,
    [
      "The recipe supplies a first-column row header. Use Primitives for resizing, sections, load-more rows or custom interactive cells.",
      "Sorting is host-owned: handle onSortChange and supply sorted rows.",
    ],
  ),
  Tree: demo(
    () => (
      <C.Tree
        label="Workspace folders"
        items={tree}
        selectionMode="single"
        defaultExpandedKeys={["work"]}
      />
    ),
    `<Tree label="Workspace folders" selectionMode="single"
  items={[{ id: "work", label: "Workspace", children: [{ id: "design", label: "Design" }] }]} />`,
  ),
  NavigationTree: demo(
    () => (
      <C.NavigationTree
        label="Workspace navigation"
        items={tree}
        defaultExpandedKeys={["work"]}
        selectedRoute="#color-picker"
      />
    ),
    `<NavigationTree label="Workspace navigation" selectedRoute="/design"
  items={[{ id: "design", label: "Design", href: "/design" }]} />`,
  ),
  TagGroup: demo(
    () => <TagsDemo />,
    `const [items, setItems] = useState([{ id: "design", label: "Design" }]);
<TagGroup label="Topics" items={items}
  onRemove={keys => setItems(values => values.filter(item => !keys.has(item.id)))} />`,
  ),
  "Primitives.TokenField": demo(
    () => <TokenDemo />,
    `import { Primitives as P } from "@samhagman/fast-ux-kit/components";
import { TokenFieldValue } from "@samhagman/fast-ux-kit/aria";

const [value, setValue] = useState(() => new TokenFieldValue([
  { type: "text", text: "Ask " },
  { type: "token", text: "Design team", value: "design" }
]));
<P.TokenField value={value} onChange={setValue}>
  <P.Label>Message</P.Label>
  <P.TokenInput>{segment => <P.Token>{segment.text}</P.Token>}</P.TokenInput>
</P.TokenField>`,
    ["Token values are structured data, not HTML. Rendering remains consumer-controlled."],
  ),
  Menu: demo(
    () => <MenuDemo />,
    `<Menu label="Document actions" onAction={handleAction}
  items={[{ id: "duplicate", label: "Duplicate", shortcut: "⌘D" }, { id: "rename", label: "Rename" }]} />`,
  ),
  Tabs: demo(
    () => (
      <C.Tabs
        label="Project information"
        items={[
          {
            id: "overview",
            label: "Overview",
            content: <p>A clear starting point for the work ahead.</p>,
          },
          { id: "activity", label: "Activity", content: <p>Your latest changes appear here.</p> },
          { id: "settings", label: "Settings", content: <C.Switch label="Share with team" /> },
        ]}
      />
    ),
    `<Tabs label="Project information" items={[
  { id: "overview", label: "Overview", content: <p>Overview content</p> },
  { id: "activity", label: "Activity", content: <p>Activity content</p> }
]} />`,
  ),
  Breadcrumbs: demo(
    () => (
      <C.Breadcrumbs
        items={[
          { id: "workspace", label: "Overview", href: "#overview" },
          { id: "projects", label: "Components", href: "#components" },
          { id: "design", label: "Breadcrumbs" },
        ]}
      />
    ),
    `<Breadcrumbs items={[
  { id: "projects", label: "Projects", href: "/projects" },
  { id: "design", label: "Design" }
]} />`,
  ),
  Disclosure: demo(
    () => (
      <C.Disclosure title="What is included?">
        <p>Keyboard interaction, accessible naming, shared visual tokens and clear ownership.</p>
      </C.Disclosure>
    ),
    `<Disclosure title="What is included?">
  <p>Keyboard interaction, accessible naming and shared visual tokens.</p>
</Disclosure>`,
  ),
  DisclosureGroup: demo(
    () => (
      <C.DisclosureGroup
        allowsMultipleExpanded
        items={[
          {
            id: "accessibility",
            title: "Accessibility",
            content: <p>Use the keyboard to move focus and expand a section.</p>,
          },
          {
            id: "themes",
            title: "Themes",
            content: <p>Shared semantic tokens support light and dark appearances.</p>,
          },
        ]}
      />
    ),
    `<DisclosureGroup allowsMultipleExpanded items={[
  { id: "accessibility", title: "Accessibility", content: <p>Keyboard-first behavior.</p> },
  { id: "themes", title: "Themes", content: <p>Shared semantic tokens.</p> }
]} />`,
  ),
  Dialog: demo(
    () => <DialogDemo />,
    `const P = Primitives;
<P.DialogTrigger>
  <Button>Open dialog</Button>
  <P.ModalOverlay isDismissable><P.Modal><Dialog>
    {({ close }) => <><P.Heading slot="title">Your choice</P.Heading>
      <Button onPress={close}>Close</Button></>}
  </Dialog></P.Modal></P.ModalOverlay>
</P.DialogTrigger>`,
  ),
  ModalDialog: demo(
    () => <ModalDemo />,
    `const [open, setOpen] = useState(false);
<Button onPress={() => setOpen(true)}>Review changes</Button>
<ModalDialog title="Review changes" isOpen={open} onOpenChange={setOpen}>
  <Field label="Summary" />
</ModalDialog>`,
    ["Escape and outside interaction dismiss by default. Focus returns to the triggering element."],
  ),
  Popover: demo(
    () => (
      <C.Popover trigger={<C.Button>About this project</C.Button>} title="Project details">
        <p>A small anchored surface for related information and controls.</p>
        <C.Switch label="Follow updates" />
      </C.Popover>
    ),
    `<Popover trigger={<Button>Project details</Button>} title="Project details">
  <p>A small anchored surface for related content.</p>
</Popover>`,
  ),
  Tooltip: demo(
    () => (
      <C.Tooltip content="Save a private copy of this document">
        <C.Button>Save a copy</C.Button>
      </C.Tooltip>
    ),
    `<Tooltip content="Save a private copy of this document">
  <Button>Save a copy</Button>
</Tooltip>`,
    [
      "Tooltips add context; they must not contain interactive content or replace the control's label.",
    ],
  ),
  "Primitives.Sheet": demo(
    () => <SheetDemo />,
    `const P = Primitives;
<P.SheetTrigger>
  <Button>Open sheet</Button>
  <P.SheetOverlay><P.SheetBackdrop /><P.Sheet><P.SheetContent>
    {({ close }) => <><P.Heading slot="title">Quick settings</P.Heading>
      <Button onPress={close}>Close settings</Button></>}
  </P.SheetContent></P.Sheet></P.SheetOverlay>
</P.SheetTrigger>`,
  ),
  Calendar: demo(
    () => <C.Calendar aria-label="Delivery date" defaultValue={date} />,
    `<Calendar aria-label="Delivery date" defaultValue={new CalendarDate(2026, 10, 15)} />`,
    ["Date values come from @internationalized/date. Locale is inherited from I18nProvider."],
  ),
  RangeCalendar: demo(
    () => (
      <C.RangeCalendar
        aria-label="Travel dates"
        visibleDuration={{ months: 2 }}
        defaultValue={{ start: date, end: new CalendarDate(2026, 11, 2) }}
      />
    ),
    `<RangeCalendar aria-label="Travel dates" visibleDuration={{ months: 2 }} defaultValue={{
  start: new CalendarDate(2026, 10, 15), end: new CalendarDate(2026, 11, 2)
}} />`,
    [
      "Each visible month has its own owner-managed grid. Grids wrap at narrow widths without shrinking date targets.",
    ],
  ),
  DateField: demo(
    () => (
      <C.DateField
        label="Start date"
        defaultValue={date}
        hint="Use the arrow keys to adjust each segment."
      />
    ),
    `<DateField label="Start date" defaultValue={new CalendarDate(2026, 10, 15)} />`,
  ),
  DatePicker: demo(
    () => <C.DatePicker label="Deadline" defaultValue={date} />,
    `<DatePicker label="Deadline" defaultValue={new CalendarDate(2026, 10, 15)} />`,
  ),
  DateRangePicker: demo(
    () => (
      <C.DateRangePicker
        label="Travel dates"
        defaultValue={{ start: date, end: new CalendarDate(2026, 10, 20) }}
      />
    ),
    `<DateRangePicker label="Travel dates" defaultValue={{
  start: new CalendarDate(2026, 10, 15), end: new CalendarDate(2026, 10, 20)
}} />`,
  ),
  TimeField: demo(
    () => <C.TimeField label="Meeting time" defaultValue={new Time(14, 30)} />,
    `<TimeField label="Meeting time" defaultValue={new Time(14, 30)} />`,
  ),
  ColorArea: demo(
    () => (
      <C.ColorArea
        label="Saturation and brightness"
        defaultValue="hsb(210, 70%, 70%)"
        colorSpace="hsb"
        xChannel="saturation"
        yChannel="brightness"
      />
    ),
    `<ColorArea label="Saturation and brightness" defaultValue="hsb(210, 70%, 70%)"
  colorSpace="hsb" xChannel="saturation" yChannel="brightness" />`,
    ["Arrow keys adjust the two channels. Values are announced together."],
  ),
  ColorField: demo(
    () => (
      <C.ColorField label="Accent color" defaultValue="#315b8d" hint="Enter a hexadecimal color." />
    ),
    `<ColorField label="Accent color" defaultValue="#315b8d" />`,
  ),
  ColorPicker: demo(
    () => <C.ColorPicker label="Accent color" defaultValue="#315b8d" colors={palette} />,
    `<ColorPicker label="Accent color" defaultValue="#315b8d"
  colors={[{ color: "#315b8d", label: "Ocean" }, { color: "#9a465c", label: "Rose" }]} />`,
    [
      "The picker has one shared color state. Area, hue, opacity, value and presets remain synchronized.",
      "Use labels to translate the channel and preset captions.",
    ],
  ),
  ColorSlider: demo(
    () => <C.ColorSlider label="Hue" channel="hue" defaultValue="hsl(210, 70%, 50%)" />,
    `<ColorSlider label="Hue" channel="hue" defaultValue="hsl(210, 70%, 50%)" />`,
  ),
  ColorSwatch: demo(
    () => (
      <C.Row wrap>
        {palette.map((color) => (
          <C.ColorSwatch key={color.label} color={color.color} aria-label={color.label} />
        ))}
      </C.Row>
    ),
    `<ColorSwatch color="#315b8d" aria-label="Ocean" />`,
    [
      "A computed color description is included in the accessible name. Color remains visible in forced-colors mode.",
    ],
  ),
  ColorSwatchPicker: demo(
    () => <C.ColorSwatchPicker label="Preset colors" colors={palette} defaultValue="#315b8d" />,
    `<ColorSwatchPicker label="Preset colors" defaultValue="#315b8d"
  colors={[{ color: "#315b8d", label: "Ocean" }, { color: "#9a465c", label: "Rose" }]} />`,
  ),
  ColorWheel: demo(
    () => <C.ColorWheel label="Hue" defaultValue="hsl(210, 70%, 50%)" />,
    `<ColorWheel label="Hue" defaultValue="hsl(210, 70%, 50%)" />`,
    [
      "Optional innerRadius and outerRadius control the ring geometry; the default ring retains a generous touch target.",
    ],
  ),
  ProgressBar: demo(
    () => (
      <C.Stack>
        <C.ProgressBar label="Uploading attachments" value={64} />
        <C.ProgressBar label="Preparing preview" isIndeterminate />
      </C.Stack>
    ),
    `<ProgressBar label="Uploading attachments" value={64} />
<ProgressBar label="Preparing preview" isIndeterminate />`,
  ),
  Meter: demo(
    () => <C.Meter label="Storage used" value={38} />,
    `<Meter label="Storage used" value={38} />`,
  ),
  DropZone: demo(
    () => <DropDemo />,
    `<DropZone aria-label="Attachments" onDrop={handleDrop}>
  <Primitives.Text slot="label">Drop attachments here</Primitives.Text>
  <FileTrigger onSelect={handleFiles}><Button>Choose files</Button></FileTrigger>
</DropZone>`,
    [
      "Receiving files is not uploading them. Validate file content and enforce limits in your application.",
    ],
  ),
  FileTrigger: demo(
    () => <FilesDemo />,
    `<FileTrigger allowsMultiple onSelect={handleFiles}>
  <Button>Choose files</Button>
</FileTrigger>`,
    ["A file chooser returns local File objects. No network request is made by this primitive."],
  ),
  Form: demo(
    () => <FormDemo />,
    `<Form onSubmit={event => { event.preventDefault(); save(new FormData(event.currentTarget)); }}>
  <Field name="email" label="Email address" type="email" isRequired />
  <Button type="submit" variant="primary">Invite</Button>
</Form>`,
  ),
  Separator: demo(
    () => (
      <C.Stack>
        <span>Project details</span>
        <C.Separator />
        <span>Related information</span>
      </C.Stack>
    ),
    `<Separator />`,
  ),
  Stack: demo(
    () => (
      <C.Stack gap="md">
        <C.Panel padding="md">First item</C.Panel>
        <C.Panel padding="md">Second item</C.Panel>
        <C.Panel padding="md">Third item</C.Panel>
      </C.Stack>
    ),
    `<Stack gap="md"><Panel>First item</Panel><Panel>Second item</Panel></Stack>`,
  ),
  Row: demo(
    () => <RowDemo />,
    `<Row gap="sm" wrap><Button>First action</Button><Button>Second action</Button></Row>`,
  ),
  Panel: demo(
    () => (
      <C.Stack>
        <C.Panel padding="lg">A quiet base surface.</C.Panel>
        <C.Panel padding="lg" tone="raised">
          A raised surface.
        </C.Panel>
        <C.Panel padding="lg" tone="tinted">
          A subtly tinted surface.
        </C.Panel>
      </C.Stack>
    ),
    `<Panel as="section" padding="lg" tone="tinted" aria-label="Project details">
  Project details
</Panel>`,
  ),
};
