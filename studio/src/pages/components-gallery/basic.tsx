// Gallery demos: Actions, inputs, selection controls, feedback and layout (basic.tsx).
import * as React from "react";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowRightIcon,
  BoldIcon,
  DownloadIcon,
  FilterIcon,
  ItalicIcon,
  ListIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  SettingsIcon,
  Trash2Icon,
  UnderlineIcon,
} from "lucide-react";
import * as C from "@samhagman/fast-ux-kit/components";
import {
  example,
  click,
  input,
  key,
  options,
  Variants,
  type ComponentFixture,
} from "./fixture-kit";

const stages = [
  { id: "draft", label: "Draft", description: "Only you can see it." },
  { id: "review", label: "Review", description: "Teammates can comment." },
  { id: "done", label: "Done", description: "Locked and archived.", disabled: true },
];

const channels = [
  { id: "email", label: "Email digest", description: "One summary each morning." },
  { id: "push", label: "Push notifications", description: "Only for mentions and replies." },
  { id: "sms", label: "Text messages" },
];

/** A formatting toolbar whose toggles keep their own pressed state. */
function FormattingToolbar({ report }: { report: (value: unknown) => void }) {
  const [on, setOn] = React.useState<Record<string, boolean>>({ Bold: true });
  const marks = [
    { name: "Bold", icon: <BoldIcon /> },
    { name: "Italic", icon: <ItalicIcon /> },
    { name: "Underline", icon: <UnderlineIcon /> },
  ];
  const aligns = [
    { name: "Align left", icon: <AlignLeftIcon /> },
    { name: "Align center", icon: <AlignCenterIcon /> },
    { name: "Align right", icon: <AlignRightIcon /> },
  ];
  return (
    <C.Toolbar.Root aria-label="Formatting">
      <C.Toolbar.Group aria-label="Text style">
        {marks.map((mark) => (
          <C.Toolbar.Button
            key={mark.name}
            aria-label={mark.name}
            aria-pressed={Boolean(on[mark.name])}
            onClick={() => {
              setOn((current) => ({ ...current, [mark.name]: !current[mark.name] }));
              report(mark.name);
            }}
          >
            {mark.icon}
          </C.Toolbar.Button>
        ))}
      </C.Toolbar.Group>
      <C.Toolbar.Separator />
      <C.Toolbar.Group aria-label="Alignment">
        {aligns.map((align) => (
          <C.Toolbar.Button
            key={align.name}
            aria-label={align.name}
            onClick={() => report(align.name)}
          >
            {align.icon}
          </C.Toolbar.Button>
        ))}
      </C.Toolbar.Group>
      <C.Toolbar.Separator />
      <C.Toolbar.Button aria-label="Bulleted list" onClick={() => report("List")}>
        <ListIcon />
      </C.Toolbar.Button>
    </C.Toolbar.Root>
  );
}

/** A profile form that validates on submit and shows its message under the field. */
function ProfileForm({ report }: { report: (value: unknown) => void }) {
  const [error, setError] = React.useState<string>();
  return (
    <C.Form
      onSubmit={(event) => {
        event.preventDefault();
        const email =
          (event.currentTarget.elements.namedItem("email") as HTMLInputElement | null)?.value ?? "";
        if (!email.includes("@")) {
          setError("Enter an address like name@example.test.");
          return;
        }
        setError(undefined);
        report("Submitted");
      }}
    >
      <C.Field label="Display name" name="name" defaultValue="Example" required />
      <C.Field
        label="Contact email"
        name="email"
        type="email"
        defaultValue="team@example.test"
        hint="Receipts and security notices go here."
        error={error}
        required
        onValueChange={() => setError(undefined)}
      />
      <C.Switch
        label="Product updates"
        description="A short note when something ships."
        defaultChecked
      />
      <C.Row justify="end" gap="sm">
        <C.Button type="reset" variant="ghost">
          Reset
        </C.Button>
        <C.Button type="submit">Save profile</C.Button>
      </C.Row>
    </C.Form>
  );
}

function SettingsPanel() {
  const [name, setName] = React.useState("Quarterly planning");
  return (
    <C.Panel>
      <C.Panel.Header>
        <div>
          <C.Panel.Title>Project settings</C.Panel.Title>
          <C.Panel.Description>Visible to everyone on this project.</C.Panel.Description>
        </div>
        <C.IconButton label="More settings" variant="ghost" size="icon-sm">
          <SettingsIcon />
        </C.IconButton>
      </C.Panel.Header>
      <C.Stack gap="md">
        <C.Field label="Project name" value={name} onValueChange={setName} />
        <C.Switch
          justified
          label="Archive when finished"
          description="Moves the project out of the sidebar after 30 days."
          defaultChecked
        />
      </C.Stack>
      <C.Panel.Footer>
        <C.Button variant="ghost">Cancel</C.Button>
        <C.Button>Save changes</C.Button>
      </C.Panel.Footer>
    </C.Panel>
  );
}

/** The main example: fields keep a readable measure instead of stretching across the page. */
const people = [
  { name: "Avery Chen", team: "Design" },
  { name: "Jordan Patel", team: "Engineering" },
  { name: "Riley Okafor", team: "Design" },
  { name: "Sam Lindqvist", team: "Support" },
  { name: "Morgan Reyes", team: "Engineering" },
  { name: "Quinn Adebayo", team: "Product" },
  { name: "Taylor Novak", team: "Design" },
  { name: "Casey Moreau", team: "Finance" },
];
/** `text` with the part matching `query` marked. */
function Highlight({ text, query }: { text: string; query: string }) {
  const at = query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1;
  if (at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <mark className="rounded-sm bg-signal/15 px-px text-foreground">
        {text.slice(at, at + query.length)}
      </mark>
      {text.slice(at + query.length)}
    </>
  );
}
/** A search over a small team directory: results filter under the field as you type. */
function PeopleSearch({ report }: { report: (value: unknown) => void }) {
  const [query, setQuery] = React.useState("");
  const needle = query.trim().toLowerCase();
  const matches = people.filter((person) =>
    `${person.name} ${person.team}`.toLowerCase().includes(needle),
  );
  return (
    <div className="flex max-w-md flex-col gap-2">
      <C.SearchField
        label="Search people"
        placeholder="Name or team"
        hint="Try a team such as Design."
        value={query}
        onValueChange={(value) => {
          setQuery(value);
          report(value);
        }}
      />
      <div className="overflow-hidden rounded-lg border bg-card">
        <p
          aria-live="polite"
          className="border-b border-hairline px-3 py-1.5 font-mono text-[11px] text-muted-foreground"
        >
          {matches.length === 1 ? "1 person" : `${matches.length} people`}
        </p>
        {matches.length ? (
          <ul
            aria-label="Matching people"
            className="max-h-56 divide-y divide-hairline overflow-y-auto"
          >
            {matches.map((person) => (
              <li key={person.name} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
                >
                  {person.name
                    .split(" ")
                    .map((part) => part[0])
                    .join("")}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">
                  <Highlight text={person.name} query={query.trim()} />
                </span>
                <span className="text-xs text-muted-foreground">
                  <Highlight text={person.team} query={query.trim()} />
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            No one matches “{query.trim()}”.
          </p>
        )}
      </div>
    </div>
  );
}
const Lead = ({ children }: { children: React.ReactNode }) => (
  <div className="w-full max-w-md">{children}</div>
);
/** The main example for actions: sized to its content. */
const LeadRow = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-3">{children}</div>
);

const swatch = (width: string) => (
  <div className="h-6 rounded-md bg-muted ring-1 ring-border ring-inset" style={{ width }} />
);
/** The shared layout gap scale, in px. */
const gapScale = [
  ["none", 0],
  ["2xs", 2],
  ["xs", 4],
  ["sm", 8],
  ["sm-md", 12],
  ["md", 16],
  ["lg", 24],
  ["xl", 32],
  ["2xl", 48],
] as const satisfies readonly (readonly [C.LayoutGap, number])[];
const boards = [
  ["Draft", 4],
  ["Review", 2],
  ["Approved", 11],
  ["Scheduled", 6],
  ["Published", 23],
  ["Archived", 38],
] as const;
interface RecentInvoice {
  id: string;
  customer: string;
  amount: string;
}
const recentInvoices: readonly RecentInvoice[] = [
  { id: "INV-2041", customer: "Northwind", amount: "$1,240.00" },
  { id: "INV-2040", customer: "Globex", amount: "$860.50" },
  { id: "INV-2039", customer: "Initech", amount: "$3,075.00" },
];
const recentColumns: C.TableColumn<RecentInvoice>[] = [
  { id: "id", label: "Invoice", isRowHeader: true, render: (row) => row.id },
  { id: "customer", label: "Customer", render: (row) => row.customer },
  { id: "amount", label: "Amount", numeric: true, render: (row) => row.amount },
];

export const basicFixtures: Readonly<Record<string, ComponentFixture>> = {
  Button: example(
    "Save records an action below. Try keyboard focus, then Space or Enter.",
    (s) => (
      <>
        <LeadRow>
          <C.Button onClick={() => s.report("Saved")}>Save</C.Button>
        </LeadRow>
        <Variants title="Variants">
          <C.Button>Primary</C.Button>
          <C.Button variant="secondary">Secondary</C.Button>
          <C.Button variant="outline">Outline</C.Button>
          <C.Button variant="ghost">Ghost</C.Button>
          <C.Button variant="destructive">Delete</C.Button>
          <C.Button variant="link">Link</C.Button>
        </Variants>
        <Variants title="Sizes">
          <C.Button size="xs">Extra small</C.Button>
          <C.Button size="sm">Small</C.Button>
          <C.Button>Default</C.Button>
          <C.Button size="lg">Large</C.Button>
          <C.Button size="xl">Extra large</C.Button>
        </Variants>
        <Variants title="With icons">
          <C.Button>
            <PlusIcon data-icon="inline-start" />
            New project
          </C.Button>
          <C.Button variant="outline">
            <DownloadIcon data-icon="inline-start" />
            Export
          </C.Button>
          <C.Button variant="secondary">
            Continue
            <ArrowRightIcon data-icon="inline-end" />
          </C.Button>
          <C.Button variant="destructive">
            <Trash2Icon data-icon="inline-start" />
            Delete
          </C.Button>
        </Variants>
        <Variants title="States">
          <C.Button disabled>Disabled</C.Button>
          <C.Button variant="outline" disabled>
            Disabled
          </C.Button>
          <C.Button aria-busy="true" disabled>
            <Loader2Icon
              className="animate-spin motion-reduce:animate-none"
              data-icon="inline-start"
            />
            Saving
          </C.Button>
          <C.Button variant="outline" aria-busy="true" disabled>
            <Loader2Icon
              className="animate-spin motion-reduce:animate-none"
              data-icon="inline-start"
            />
            Refreshing
          </C.Button>
          <C.Button aria-invalid="true" variant="outline">
            Invalid
          </C.Button>
        </Variants>
      </>
    ),
    "button",
    [click("button", ".fixture-status", "Saved")],
  ),
  IconButton: example(
    "The icon has a named, full-size action target.",
    (s) => (
      <>
        <LeadRow>
          <C.IconButton label="Add item" variant="outline" onClick={() => s.report("Added")}>
            <PlusIcon />
          </C.IconButton>
        </LeadRow>
        <Variants title="Variants">
          <C.IconButton label="Refresh" variant="default">
            <RefreshCwIcon />
          </C.IconButton>
          <C.IconButton label="Refresh" variant="secondary">
            <RefreshCwIcon />
          </C.IconButton>
          <C.IconButton label="Refresh" variant="outline">
            <RefreshCwIcon />
          </C.IconButton>
          <C.IconButton label="Refresh" variant="ghost">
            <RefreshCwIcon />
          </C.IconButton>
          <C.IconButton label="Delete" variant="destructive">
            <Trash2Icon />
          </C.IconButton>
        </Variants>
        <Variants title="Sizes">
          {(["icon-xs", "icon-sm", "icon", "icon-lg", "icon-xl"] as const).map((size) => (
            <C.IconButton key={size} label={`Add (${size})`} variant="outline" size={size}>
              <PlusIcon />
            </C.IconButton>
          ))}
        </Variants>
        <Variants title="States">
          <C.IconButton label="Download" variant="outline" disabled>
            <DownloadIcon />
          </C.IconButton>
          <C.IconButton label="Refreshing" variant="outline" aria-busy="true" disabled>
            <Loader2Icon className="animate-spin motion-reduce:animate-none" />
          </C.IconButton>
        </Variants>
      </>
    ),
    'button[aria-label="Add item"]',
    [click("button", ".fixture-status", "Added")],
  ),
  Link: example(
    "Open the linked section with a native link.",
    () => (
      <>
        <LeadRow>
          <C.Link href="#component-details">Component details</C.Link>
        </LeadRow>
        <Variants title="In running text" layout="stack">
          <p className="m-0 max-w-prose text-sm leading-6 text-pretty">
            Billing changes take effect at the start of the next cycle. Read the{" "}
            <C.Link inline href="#component-details">
              plan comparison
            </C.Link>{" "}
            before upgrading, or{" "}
            <C.Link inline href="#component-details">
              contact support
            </C.Link>{" "}
            if something looks wrong.
          </p>
        </Variants>
        <Variants title="External and disabled" layout="stack">
          <C.Link href="https://example.test/docs" external>
            Documentation
          </C.Link>
          <C.Link href="#component-details" aria-disabled="true">
            Unavailable until the next release
          </C.Link>
        </Variants>
      </>
    ),
    'a[href="#component-details"]',
  ),
  Toolbar: example(
    "Tab enters the toolbar; arrow keys move between actions.",
    (s) => (
      <>
        <FormattingToolbar report={s.report} />
        <Variants title="Text actions with a filter" layout="stack">
          <C.Toolbar.Root aria-label="Invoice list">
            <C.Toolbar.Button>
              <FilterIcon />
              Filter
            </C.Toolbar.Button>
            <C.Toolbar.Button>
              <DownloadIcon />
              Export
            </C.Toolbar.Button>
            <C.Toolbar.Separator />
            <C.Toolbar.Input aria-label="Search invoices" placeholder="Search invoices" />
            <C.Toolbar.Link href="#component-details">Help</C.Toolbar.Link>
          </C.Toolbar.Root>
        </Variants>
        <Variants title="Disabled actions" layout="stack">
          <C.Toolbar.Root aria-label="Selection">
            <C.Toolbar.Button disabled>
              <Trash2Icon />
              Delete
            </C.Toolbar.Button>
            <C.Toolbar.Button disabled>
              <DownloadIcon />
              Download
            </C.Toolbar.Button>
            <C.Toolbar.Button>
              <PlusIcon />
              New
            </C.Toolbar.Button>
          </C.Toolbar.Root>
        </Variants>
      </>
    ),
    '[role="toolbar"]',
    [click("button", ".fixture-status", "Bold")],
  ),
  Field: example(
    "Edit a labeled text field.",
    (s) => (
      <>
        <Lead>
          <C.Field label="Project name" hint="A short working title." onValueChange={s.report} />
        </Lead>
        <Variants title="Anatomy" layout="grid">
          <C.Field label="Work email" type="email" required hint="We only use it for receipts." />
          <C.Field
            className="sm:col-span-2"
            label="Website"
            startAddon="https://"
            endAddon=".example.test"
            defaultValue="studio"
          />
          <C.Field
            label="Budget"
            inputMode="decimal"
            startAddon="$"
            endAddon="USD"
            defaultValue="1,200"
          />
          <C.Field label="Reference" defaultValue="INV-2028-0042" readOnly hint="Read only." />
        </Variants>
        <Variants title="States" layout="grid">
          <C.Field label="Username" defaultValue="a b" error="Usernames cannot contain spaces." />
          <C.Field label="Region" defaultValue="Northern Europe" disabled />
          <C.Field
            label="Description"
            defaultValue="A very long working title that keeps going to check how the field handles overflowing text"
            hint="Long values scroll inside the input instead of growing it."
          />
        </Variants>
      </>
    ),
    "input",
    [input("input", "Notebook")],
  ),
  TextArea: example(
    "Enter a multi-line note.",
    (s) => (
      <>
        <Lead>
          <C.TextArea label="Notes" rows={4} onValueChange={s.report} />
        </Lead>
        <Variants title="With a limit and hint" layout="grid">
          <C.TextArea
            label="Summary"
            rows={3}
            maxLength={120}
            defaultValue="Moved the launch review to Thursday."
            hint="Shown in the weekly digest."
          />
          <C.TextArea
            label="Reason"
            rows={3}
            required
            error="Tell us why the request was declined."
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.TextArea label="Internal note" rows={3} disabled defaultValue="Locked by an admin." />
          <C.TextArea
            label="Audit log"
            rows={3}
            readOnly
            defaultValue="Created on 12 February 2028."
          />
        </Variants>
      </>
    ),
    "textarea",
    [input("textarea", "A useful note")],
  ),
  SearchField: example(
    "Type a name or a team (try Design) and the list filters as you type. Escape or the clear button empties it.",
    (s) => (
      <>
        <PeopleSearch report={s.report} />
        <Variants title="With a value and a hint" layout="grid">
          <C.SearchField label="Search tasks" defaultValue="quarterly review" />
          <C.SearchField
            label="Search documents"
            placeholder="Title or author"
            hint="Matches titles and authors."
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.SearchField label="Search archive" disabled defaultValue="invoices" />
          <C.SearchField label="Search" error="Search is unavailable offline." />
        </Variants>
        <Variants title="In a filter bar" layout="stack">
          <C.Row className="w-full" align="end">
            <div className="min-w-0 flex-1">
              <C.SearchField label="Search invoices" placeholder="Customer or number" />
            </div>
            <C.Button variant="outline">
              <FilterIcon data-icon="inline-start" />
              Filter
            </C.Button>
          </C.Row>
        </Variants>
      </>
    ),
    'input[type="search"]',
    [input("input", "calendar")],
  ),
  NumberField: example(
    "Adjust a bounded quantity with the steppers or the arrow keys.",
    (s) => (
      <>
        <Lead>
          <C.NumberField
            label="Copies"
            defaultValue={2}
            min={1}
            max={10}
            onValueChange={s.report}
          />
        </Lead>
        <Variants title="Units and formats" layout="grid">
          <C.NumberField label="Font size" defaultValue={14} min={8} max={72} unit="pt" />
          <C.NumberField
            label="Unit price"
            defaultValue={24.5}
            step={0.25}
            min={0}
            format={{ style: "currency", currency: "USD" }}
          />
          <C.NumberField
            label="Discount"
            defaultValue={0.15}
            step={0.05}
            min={0}
            max={1}
            format={{ style: "percent" }}
            hint="Applied to every line."
          />
          <C.NumberField label="Seats" defaultValue={5} min={1} required />
        </Variants>
        <Variants title="States" layout="grid">
          <C.NumberField label="Quantity" defaultValue={0} min={1} error="Order at least one." />
          <C.NumberField label="Locked" defaultValue={3} disabled />
        </Variants>
      </>
    ),
    "input",
    [click('button[aria-label="Increase"]', ".fixture-status", "3")],
  ),
  Checkbox: example(
    "Toggle a single preference.",
    (s) => (
      <>
        <C.Checkbox label="Send updates" onCheckedChange={s.report} />
        <Variants title="With a description" layout="stack">
          <C.Checkbox
            label="Share anonymous usage data"
            description="Helps us find slow screens. Never includes document text."
          />
          <C.Checkbox
            label="I have read the retention policy and agree that exported files are deleted after ninety days"
            required
          />
        </Variants>
        <Variants title="States" layout="stack">
          <C.Checkbox label="Checked" defaultChecked />
          <C.Checkbox label="Disabled" disabled />
          <C.Checkbox label="Disabled and checked" disabled defaultChecked />
          <C.Checkbox label="Invalid until accepted" aria-invalid="true" />
        </Variants>
      </>
    ),
    '[role="checkbox"]',
    [click('[role="checkbox"]', '[role="checkbox"][aria-checked="true"]')],
  ),
  CheckboxGroup: example(
    "Select several channels independently.",
    (s) => (
      <>
        <C.CheckboxGroup label="Channels" options={options} onValueChange={s.report} />
        <Variants title="Descriptions and a hint" layout="stack">
          <C.CheckboxGroup
            label="Notify me by"
            options={channels}
            defaultValue={["email"]}
            hint="You can change this at any time."
          />
        </Variants>
        <Variants title="Horizontal and invalid" layout="grid">
          <C.CheckboxGroup
            label="Weekdays"
            orientation="horizontal"
            options={[
              { id: "mon", label: "Mon" },
              { id: "wed", label: "Wed" },
              { id: "fri", label: "Fri" },
            ]}
            defaultValue={["mon", "fri"]}
          />
          <C.CheckboxGroup
            label="Reviewers"
            options={[
              { id: "ana", label: "Design review" },
              { id: "ben", label: "Security review" },
            ]}
            error="Choose at least one reviewer."
          />
        </Variants>
      </>
    ),
    '[role="checkbox"]',
    [click('[role="checkbox"]', ".fixture-status", "draft")],
  ),
  RadioGroup: example(
    "Select one stage.",
    (s) => (
      <>
        <C.RadioGroup label="Stage" options={options} onValueChange={s.report} />
        <Variants title="Descriptions" layout="stack">
          <C.RadioGroup
            label="Visibility"
            options={stages}
            defaultValue="review"
            hint="Done is unavailable until every task is closed."
          />
        </Variants>
        <Variants title="Horizontal and invalid" layout="grid">
          <C.RadioGroup
            label="Billing cycle"
            orientation="horizontal"
            options={[
              { id: "monthly", label: "Monthly" },
              { id: "yearly", label: "Yearly" },
            ]}
            defaultValue="yearly"
          />
          <C.RadioGroup
            label="Plan"
            options={[
              { id: "free", label: "Free" },
              { id: "team", label: "Team" },
            ]}
            error="Pick a plan to continue."
          />
        </Variants>
      </>
    ),
    '[role="radiogroup"]',
    [click('[role="radio"]', ".fixture-status", "draft")],
  ),
  Switch: example(
    "Toggle automatic saving.",
    (s) => (
      <>
        <C.Switch label="Autosave" onCheckedChange={s.report} />
        <Variants title="Settings rows" layout="stack">
          <C.Panel className="w-full">
            <C.Switch
              justified
              label="Weekly summary"
              description="Every Monday morning."
              defaultChecked
            />
            <C.Switch
              justified
              label="Mentions"
              description="When someone tags you in a comment."
              defaultChecked
            />
            <C.Switch justified label="Product news" />
          </C.Panel>
        </Variants>
        <Variants title="States" layout="stack">
          <C.Switch label="On" defaultChecked />
          <C.Switch label="Disabled" disabled />
          <C.Switch label="Disabled and on" disabled defaultChecked />
        </Variants>
      </>
    ),
    '[role="switch"]',
    [click('[role="switch"]', '[role="switch"][aria-checked="true"]')],
  ),
  Slider: example(
    "Arrow keys adjust a numeric value.",
    (s) => (
      <>
        <Lead>
          <C.Slider label="Volume" defaultValue={30} onValueChange={s.report} />
        </Lead>
        <Variants title="Range and formats" layout="stack">
          <C.Slider
            label="Price range"
            className="w-full max-w-md"
            defaultValue={[20, 60]}
            thumbLabels={["Minimum price", "Maximum price"]}
            format={{ style: "currency", currency: "USD", maximumFractionDigits: 0 }}
          />
          <C.Slider
            label="Opacity"
            className="w-full max-w-md"
            min={0}
            max={1}
            step={0.05}
            defaultValue={0.65}
            format={{ style: "percent" }}
          />
        </Variants>
        <Variants title="Disabled" layout="stack">
          <C.Slider label="Brightness" className="w-full max-w-md" defaultValue={80} disabled />
        </Variants>
      </>
    ),
    'input[type="range"]',
    [key('input[type="range"]', "ArrowRight", ".fixture-status", "31")],
  ),
  ProgressBar: example(
    "A labeled progress indicator exposes its current value.",
    () => (
      <>
        <Lead>
          <C.ProgressBar label="Upload" value={65} hint="Uploading 3 of 5 files" />
        </Lead>
        <Variants title="States" layout="stack">
          <C.ProgressBar
            label="Preparing export"
            className="w-full max-w-md"
            value={null}
            hint="This can take a minute."
          />
          <C.ProgressBar
            label="Backup"
            className="w-full max-w-md"
            value={100}
            hint="Finished at 09:41"
          />
          <C.ProgressBar label="Import" className="w-full max-w-md" value={0} />
        </Variants>
      </>
    ),
    '[role="progressbar"][aria-valuenow="65"]',
  ),
  Meter: example(
    "A meter describes a bounded measurement; colour follows the low and high thresholds.",
    () => (
      <>
        <Lead>
          <C.Meter
            label="Storage"
            value={45}
            low={60}
            high={85}
            optimum={0}
            hint="45 GB of 100 GB"
          />
        </Lead>
        <Variants title="Lower is better" layout="grid">
          <C.Meter label="Storage" value={45} low={60} high={85} optimum={0} />
          <C.Meter label="Storage" value={72} low={60} high={85} optimum={0} />
          <C.Meter label="Storage" value={94} low={60} high={85} optimum={0} />
        </Variants>
        <Variants title="Higher is better" layout="grid">
          <C.Meter label="Battery" value={12} low={20} high={60} optimum={100} />
          <C.Meter label="Battery" value={48} low={20} high={60} optimum={100} />
          <C.Meter label="Battery" value={91} low={20} high={60} optimum={100} />
        </Variants>
        <Variants title="No thresholds" layout="stack">
          <C.Meter label="Profile completeness" className="w-full max-w-md" value={60} />
        </Variants>
      </>
    ),
    '[role="meter"][aria-valuenow="45"]',
  ),
  Form: example(
    "Submit a form without leaving this page. Clear the email to see the inline error.",
    (s) => (
      <>
        <Lead>
          <ProfileForm report={s.report} />
        </Lead>
        <Variants title="Sign in" layout="stack">
          <C.Form className="w-full max-w-sm" onSubmit={(event) => event.preventDefault()}>
            <C.Field label="Email" name="email" type="email" autoComplete="email" required />
            <C.PasswordInput label="Password" name="password" required />
            <C.Button type="submit">Sign in</C.Button>
          </C.Form>
        </Variants>
      </>
    ),
    "form",
    [click('button[type="submit"]', ".fixture-status", "Submitted")],
  ),
  Stack: example(
    "A vertical stack uses shared spacing tokens.",
    () => (
      <>
        <C.Stack>
          <C.Field label="Project name" defaultValue="Quarterly planning" />
          <C.TextArea
            label="Description"
            rows={2}
            defaultValue="Goals and risks for the quarter."
          />
          <C.Switch label="Archive when finished" />
        </C.Stack>
        <Variants title="Gap scale" layout="grid">
          {gapScale.map(([gap, px]) => (
            <div key={gap} className="flex flex-col gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                gap=&quot;{gap}&quot; · {px}px
              </span>
              <C.Stack gap={gap}>
                {swatch("100%")}
                {swatch("100%")}
                {swatch("100%")}
              </C.Stack>
            </div>
          ))}
        </Variants>
        <Variants title="Alignment" layout="grid">
          {(["start", "center", "end"] as const).map((align) => (
            <div key={align} className="flex flex-col gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                align=&quot;{align}&quot;
              </span>
              <C.Stack gap="xs" align={align}>
                {swatch("100%")}
                {swatch("60%")}
                {swatch("30%")}
              </C.Stack>
            </div>
          ))}
        </Variants>
        <Variants title="As a list" layout="stack">
          <C.Stack as="ul" gap="sm-md" aria-label="Release checklist" className="text-sm">
            <li>Run the checks on the exact snapshot</li>
            <li>Record the results in the pull request</li>
            <li>Ask the steward to confirm</li>
          </C.Stack>
        </Variants>
      </>
    ),
    ".fux-stack input",
  ),
  Row: example(
    "A row aligns actions horizontally.",
    () => (
      <>
        <C.Row justify="between" wrap className="w-full">
          <h4 className="m-0 text-base font-semibold tracking-tight">Invoices</h4>
          <C.Row gap="sm">
            <C.Button variant="outline">
              <DownloadIcon data-icon="inline-start" />
              Export
            </C.Button>
            <C.Button>
              <PlusIcon data-icon="inline-start" />
              New invoice
            </C.Button>
          </C.Row>
        </C.Row>
        <Variants title="Filter bar" layout="stack">
          <C.Row className="w-full" align="end">
            <div className="min-w-0 flex-1">
              <C.SearchField label="Search" placeholder="Customer or number" />
            </div>
            <C.Button variant="outline">
              <FilterIcon data-icon="inline-start" />
              Filter
            </C.Button>
          </C.Row>
        </Variants>
        <Variants title="Wrapping" layout="stack">
          <C.Row wrap gap="sm" className="max-w-sm">
            {["Design", "Research", "Finance", "Legal", "Operations", "Support"].map((tag) => (
              <C.Button key={tag} variant="secondary" size="sm">
                {tag}
              </C.Button>
            ))}
          </C.Row>
        </Variants>
        <Variants title="Justify" layout="stack">
          {(["start", "center", "end", "between"] as const).map((justify) => (
            <C.Row key={justify} justify={justify} className="w-full rounded-lg border p-2">
              {swatch("3rem")}
              {swatch("3rem")}
              {swatch("3rem")}
            </C.Row>
          ))}
        </Variants>
        <Variants title="Gap scale, shared with Stack" layout="stack">
          {gapScale.map(([gap, px]) => (
            <C.Row key={gap} gap="md">
              <span className="w-24 font-mono text-xs text-muted-foreground">
                {gap} · {px}px
              </span>
              <C.Row gap={gap}>
                {swatch("1.5rem")}
                {swatch("1.5rem")}
                {swatch("1.5rem")}
              </C.Row>
            </C.Row>
          ))}
        </Variants>
        <Variants title="As navigation" layout="stack">
          <C.Row as="nav" aria-label="Report sections" gap="sm-md" wrap>
            {["Summary", "Revenue", "Costs", "Forecast"].map((section) => (
              <C.Link key={section} href="#component-details">
                {section}
              </C.Link>
            ))}
          </C.Row>
        </Variants>
      </>
    ),
    ".fux-row > button",
  ),
  Grid: example(
    "Cards fill as many columns of at least 13rem as the grid is wide. Narrow the window to see them reflow.",
    () => (
      <>
        <C.Grid min="13rem" gap="sm-md">
          {boards.map(([title, count]) => (
            <C.Panel key={title} padding="sm">
              <C.Panel.Title>{title}</C.Panel.Title>
              <C.Panel.Description>{count} documents</C.Panel.Description>
            </C.Panel>
          ))}
        </C.Grid>
        <Variants title="Sized by its own container, not the window" layout="stack">
          <div className="w-full max-w-sm rounded-lg border border-dashed p-3">
            <C.Grid min="8rem" gap="sm">
              {boards.map(([title]) => (
                <div key={title} className="rounded-md bg-muted px-3 py-2 text-sm">
                  {title}
                </div>
              ))}
            </C.Grid>
          </div>
        </Variants>
        <Variants title="Alignment" layout="grid">
          {(["stretch", "start"] as const).map((align) => (
            <div key={align} className="flex flex-col gap-2">
              <span className="font-mono text-xs text-muted-foreground">
                align=&quot;{align}&quot;
              </span>
              <C.Grid min="6rem" gap="sm" align={align}>
                <div className="rounded-md bg-muted p-2 text-sm">Short</div>
                <div className="rounded-md bg-muted p-2 text-sm">
                  A longer note that wraps onto more lines
                </div>
              </C.Grid>
            </div>
          ))}
        </Variants>
      </>
    ),
    ".fux-grid .fux-panel",
  ),
  Split: example(
    "A side column beside the main one. Below 36rem of its own width the two stack, side first.",
    () => (
      <>
        <C.Split side="12rem" stackBelow="36rem" gap="lg">
          <C.Split.Side as="nav" aria-label="Guide sections">
            <C.Stack as="ul" gap="xs" className="text-sm">
              {["Install", "Configure", "Deploy", "Troubleshoot"].map((section) => (
                <li key={section}>
                  <C.Link href="#component-details">{section}</C.Link>
                </li>
              ))}
            </C.Stack>
          </C.Split.Side>
          <C.Split.Main>
            <C.Stack gap="sm">
              <h4 className="m-0 text-base font-semibold tracking-tight">Install</h4>
              <p className="m-0 text-sm text-muted-foreground">
                Add the package, then load its stylesheet once at the root of the application.
              </p>
            </C.Stack>
          </C.Split.Main>
        </C.Split>
        <Variants title="Side on the inline end" layout="stack">
          <C.Split side="14rem" stackBelow="32rem" className="w-full">
            <C.Split.Main>
              <C.Panel>
                <C.Panel.Title>Quarterly summary</C.Panel.Title>
                <C.Panel.Description>Revenue rose 12% on the quarter.</C.Panel.Description>
              </C.Panel>
            </C.Split.Main>
            <C.Split.Side as="aside" aria-label="Notes">
              <C.Panel tone="quiet" padding="sm">
                <p className="m-0 text-sm">Figures are unaudited until the 15th.</p>
              </C.Panel>
            </C.Split.Side>
          </C.Split>
        </Variants>
        <Variants title="Stacked in a narrow container" layout="stack">
          <div className="w-full max-w-xs rounded-lg border border-dashed p-3">
            <C.Split side="8rem" stackBelow="24rem" gap="sm">
              <C.Split.Side className="rounded-md bg-muted px-3 py-2 text-sm">Side</C.Split.Side>
              <C.Split.Main className="rounded-md bg-muted px-3 py-2 text-sm">Main</C.Split.Main>
            </C.Split>
          </div>
        </Variants>
      </>
    ),
    ".fux-split nav a",
  ),
  Panel: example(
    "A neutral surface groups related information.",
    () => (
      <>
        <SettingsPanel />
        <Variants title="Plain and stat panels" layout="grid">
          <C.Panel>
            <h3 className="m-0 text-sm font-semibold">Document information</h3>
            <p className="mt-1 mb-0 text-sm text-muted-foreground">Updated just now.</p>
          </C.Panel>
          <C.Panel>
            <C.Panel.Title>Storage</C.Panel.Title>
            <C.Panel.Description>45 GB of 100 GB used</C.Panel.Description>
            <div className="mt-3">
              <C.Meter label="Used" value={45} low={60} high={85} optimum={0} />
            </div>
          </C.Panel>
        </Variants>
        <Variants title="Padding" layout="grid">
          {(["sm", "md", "lg"] as const).map((padding) => (
            <C.Panel key={padding} padding={padding}>
              <C.Panel.Title>padding=&quot;{padding}&quot;</C.Panel.Title>
              <C.Panel.Description>
                {{ sm: "12px", md: "20px, the default", lg: "28px" }[padding]}
              </C.Panel.Description>
            </C.Panel>
          ))}
        </Variants>
        <Variants title="Flush, with a table and a band header" layout="stack">
          <C.Panel padding="none" className="w-full">
            <C.Panel.Header tone="band" wrap>
              <div>
                <C.Panel.Title>Recent invoices</C.Panel.Title>
                <C.Panel.Description>Paid and open, newest first.</C.Panel.Description>
              </div>
              <C.Button variant="outline" size="sm">
                <DownloadIcon data-icon="inline-start" />
                Export
              </C.Button>
            </C.Panel.Header>
            <C.Table label="Recent invoices" rows={recentInvoices} columns={recentColumns} />
            <C.Panel.Footer>
              <C.Button variant="ghost" size="sm">
                View all
              </C.Button>
            </C.Panel.Footer>
          </C.Panel>
        </Variants>
        <Variants title="Top edge and quiet" layout="grid">
          <C.Panel edge="top">
            <C.Panel.Title>edge=&quot;top&quot;</C.Panel.Title>
            <C.Panel.Description>A rule along the top, nothing else.</C.Panel.Description>
          </C.Panel>
          <C.Panel tone="quiet">
            <C.Panel.Title>tone=&quot;quiet&quot;</C.Panel.Title>
            <C.Panel.Description>A muted surface without a shadow.</C.Panel.Description>
          </C.Panel>
        </Variants>
      </>
    ),
    ".fux-panel h3",
  ),
  Editable: example(
    "Activate the title, edit it and press Enter. Escape cancels.",
    (s) => (
      <>
        <Lead>
          <C.Editable label="Title" defaultValue="Untitled" onValueChange={s.report} />
        </Lead>
        <Variants title="States" layout="stack">
          <C.Editable label="Subtitle" placeholder="Add a subtitle" />
          <C.Editable label="Owner" defaultValue="Platform team" disabled />
          <div className="w-56 max-w-full">
            <C.Editable
              label="Headline"
              defaultValue="A very long headline that should be cut off with an ellipsis"
            />
          </div>
        </Variants>
      </>
    ),
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
      <>
        <C.Fieldset legend="Preferences" description="Choose what lands in your inbox.">
          <C.Checkbox label="Weekly summary" defaultChecked />
          <C.Checkbox label="Mentions" />
        </C.Fieldset>
        <Variants title="A group of fields" layout="stack">
          <C.Fieldset legend="Shipping address" className="w-full max-w-md">
            <C.Stack gap="md">
              <C.Field label="Street" autoComplete="address-line1" />
              <C.Row align="start">
                <div className="min-w-0 flex-1">
                  <C.Field label="City" />
                </div>
                <div className="w-28">
                  <C.Field label="Postcode" />
                </div>
              </C.Row>
            </C.Stack>
          </C.Fieldset>
        </Variants>
        <Variants title="Disabled" layout="stack">
          <C.Fieldset legend="Billing contact" disabled className="w-full max-w-md">
            <C.Field label="Name" defaultValue="Finance team" />
          </C.Fieldset>
        </Variants>
      </>
    ),
    "fieldset[aria-labelledby]",
  ),
  PasswordInput: example(
    "Reveal or hide the password.",
    () => (
      <>
        <Lead>
          <C.PasswordInput label="Password" defaultValue="example-password" />
        </Lead>
        <Variants title="States" layout="grid">
          <C.PasswordInput
            label="New password"
            autoComplete="new-password"
            hint="At least 12 characters."
            required
          />
          <C.PasswordInput
            label="Confirm password"
            defaultValue="short"
            error="Passwords do not match."
          />
          <C.PasswordInput label="Locked" defaultValue="hidden-value" disabled />
        </Variants>
      </>
    ),
    'input[type="password"]',
    [click('button[aria-label="Show password"]', 'input[type="text"]')],
  ),
  PinInput: example(
    "Enter a verification code one digit at a time.",
    (s) => (
      <>
        <Lead>
          <C.PinInput label="Verification code" length={4} onValueChange={s.report} />
        </Lead>
        <Variants title="Grouped and hinted" layout="stack">
          <C.PinInput
            label="Security code"
            length={6}
            groupSize={3}
            hint="Sent to your phone, valid for 10 minutes."
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.PinInput label="Prefilled" length={4} defaultValue="48" />
          <C.PinInput label="Masked" length={4} mask defaultValue="1234" />
          <C.PinInput
            label="Wrong code"
            length={4}
            defaultValue="0000"
            error="That code is not valid."
          />
          <C.PinInput label="Locked" length={4} defaultValue="1234" disabled />
        </Variants>
      </>
    ),
    "input",
    [input("input", "1", "1")],
  ),
};
