// Gallery demos: Collections, navigation and disclosure (collections.tsx).
import * as React from "react";
import {
  ArchiveIcon,
  CircleCheckIcon,
  CircleDashedIcon,
  CopyIcon,
  EyeIcon,
  FileCodeIcon,
  FileTextIcon,
  FolderIcon,
  HistoryIcon,
  LayoutListIcon,
  PencilIcon,
  RocketIcon,
  SettingsIcon,
  Share2Icon,
  Trash2Icon,
} from "lucide-react";
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, Variants, type ComponentFixture } from "./fixture-kit";

/** A fixed-width column so side-by-side field variants line up. */
const labelSuggestions = [
  "planning",
  "design",
  "research",
  "engineering",
  "marketing",
  "finance",
  "support",
  "legal",
  "operations",
  "security",
].map((label) => ({ id: label, label }));

/** A labels field with suggestions, and a switch that turns the suggestion list on and off. */
function TokenDemo({ report }: { report: (value: unknown) => void }) {
  const [suggest, setSuggest] = React.useState(true);
  // The labels live here, so turning suggestions on or off keeps what was picked.
  const [tokens, setTokens] = React.useState<readonly C.Token[]>([
    { id: "planning", label: "planning" },
  ]);
  return (
    <div className="flex max-w-md flex-col gap-4">
      <C.TokenField
        label="Labels"
        value={tokens}
        suggestions={labelSuggestions}
        autocomplete={suggest}
        placeholder="Add a label"
        hint={
          suggest
            ? "Type to filter the list, then ↑ ↓ and Enter to pick."
            : "Type a label exactly and press Enter."
        }
        onValueChange={(next) => {
          setTokens(next);
          report(next.map((token) => token.label));
        }}
      />
      <C.Switch
        label="Suggest as you type"
        description="The autocomplete prop: on by default when there are suggestions."
        checked={suggest}
        onCheckedChange={setSuggest}
      />
    </div>
  );
}

function Box({ children }: { children: React.ReactNode }) {
  return <div className="w-full max-w-64">{children}</div>;
}

const stages: C.CollectionOption[] = [
  {
    id: "draft",
    label: "Draft",
    description: "Not shared yet",
    icon: <CircleDashedIcon />,
    group: "Planning",
  },
  {
    id: "review",
    label: "In review",
    description: "Waiting on feedback",
    icon: <EyeIcon />,
    group: "Planning",
  },
  {
    id: "approved",
    label: "Approved",
    description: "Ready to schedule",
    icon: <CircleCheckIcon />,
    group: "Delivery",
  },
  { id: "shipped", label: "Shipped", icon: <RocketIcon />, group: "Delivery" },
  { id: "archived", label: "Archived", icon: <ArchiveIcon />, group: "Closed", disabled: true },
];
const plainStages: C.CollectionOption[] = stages.map(({ id, label, disabled }) => ({
  id,
  label,
  disabled,
}));

interface Invoice {
  id: string;
  customer: string;
  status: "Paid" | "Pending" | "Overdue";
  amount: number;
  due: string;
}
const invoices: Invoice[] = [
  {
    id: "INV-1001",
    customer: "Fieldstone Supply Co-op",
    status: "Paid",
    amount: 1280,
    due: "2028-01-09",
  },
  {
    id: "INV-1002",
    customer: "Harbor Lane Studio",
    status: "Pending",
    amount: 460.5,
    due: "2028-02-14",
  },
  {
    id: "INV-1003",
    customer: "Juniper Print Works",
    status: "Overdue",
    amount: 2975,
    due: "2028-01-28",
  },
  {
    id: "INV-1004",
    customer: "Marlow & Finch Architects",
    status: "Paid",
    amount: 8120,
    due: "2028-02-02",
  },
  {
    id: "INV-1005",
    customer: "Quill Street Books",
    status: "Pending",
    amount: 94.2,
    due: "2028-03-01",
  },
  {
    id: "INV-1006",
    customer: "Redwood Bicycle Repair",
    status: "Paid",
    amount: 315,
    due: "2028-02-21",
  },
  {
    id: "INV-1007",
    customer: "Tidewater Climbing Gym",
    status: "Overdue",
    amount: 1740,
    due: "2028-01-19",
  },
  {
    id: "INV-1008",
    customer: "Wren and Sparrow Bakery",
    status: "Pending",
    amount: 688.75,
    due: "2028-03-12",
  },
];
const manyInvoices: Invoice[] = Array.from({ length: 14 }, (_, index) => ({
  ...invoices[index % invoices.length]!,
  id: `INV-${2001 + index}`,
}));

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const shortDate = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const statusTone: Record<Invoice["status"], string> = {
  Paid: "bg-success/12 text-success",
  Pending: "bg-warning/18 text-foreground",
  Overdue: "bg-destructive/10 text-destructive",
};
function StatusBadge({ status }: { status: Invoice["status"] }) {
  return (
    <span
      className={C.cn(
        "inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-xs font-medium",
        statusTone[status],
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}
const invoiceColumns: C.TableColumn<Invoice>[] = [
  {
    id: "id",
    label: "Invoice",
    isRowHeader: true,
    allowsSorting: true,
    width: 112,
    render: (row) => <span className="font-mono text-xs">{row.id}</span>,
  },
  {
    id: "customer",
    label: "Customer",
    allowsSorting: true,
    truncate: true,
    width: "13rem",
    render: (row) => row.customer,
  },
  {
    id: "status",
    label: "Status",
    allowsSorting: true,
    render: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: "due",
    label: "Due",
    allowsSorting: true,
    sortValue: (row) => row.due,
    render: (row) => (
      <span className="whitespace-nowrap">
        {shortDate.format(new Date(`${row.due}T00:00:00Z`))}
      </span>
    ),
  },
  {
    id: "amount",
    label: "Amount",
    allowsSorting: true,
    numeric: true,
    render: (row) => money.format(row.amount),
  },
];

const workspace: C.TreeNode[] = [
  {
    id: "workspace",
    label: "workspace",
    children: [
      {
        id: "docs",
        label: "docs",
        children: [
          { id: "onboarding", label: "onboarding.md" },
          { id: "roadmap", label: "roadmap.md" },
        ],
      },
      {
        id: "src",
        label: "src",
        children: [
          {
            id: "components",
            label: "components",
            children: [
              { id: "button", label: "button.tsx", icon: <FileCodeIcon /> },
              { id: "dialog", label: "dialog.tsx", icon: <FileCodeIcon /> },
            ],
          },
          { id: "index", label: "index.ts", icon: <FileCodeIcon /> },
        ],
      },
      { id: "package", label: "package.json" },
    ],
  },
];
const sections: C.TreeNode[] = [
  {
    id: "start",
    label: "Getting started",
    icon: <RocketIcon />,
    children: [
      { id: "install", label: "Installation", href: "#/components" },
      { id: "first", label: "Your first view", href: "#/components" },
    ],
  },
  {
    id: "guides",
    label: "Guides",
    icon: <LayoutListIcon />,
    children: [
      { id: "forms", label: "Forms and validation", href: "#/components" },
      { id: "tables", label: "Data tables", href: "#/components" },
      { id: "theming", label: "Theming", href: "#/components", disabled: true },
    ],
  },
  { id: "changelog", label: "Changelog", icon: <HistoryIcon />, href: "#/components" },
];

const actions: C.MenuOption[] = [
  { id: "rename", label: "Rename", icon: <PencilIcon />, shortcut: "F2", group: "Edit" },
  { id: "duplicate", label: "Duplicate", icon: <CopyIcon />, shortcut: "⌘D", group: "Edit" },
  {
    id: "share",
    label: "Share…",
    icon: <Share2Icon />,
    description: "Invite people",
    group: "Share",
  },
  { id: "export", label: "Export", icon: <FileTextIcon />, disabled: true, group: "Share" },
  {
    id: "delete",
    label: "Delete",
    icon: <Trash2Icon />,
    destructive: true,
    shortcut: "⌫",
    group: "Danger zone",
  },
];

const sampleTags = ["planning", "design", "research", "accessibility", "q3-launch", "needs-review"];

export const collectionsFixtures: Readonly<Record<string, ComponentFixture>> = {
  Select: example(
    "Open the menu and choose a stage. Options can carry icons, descriptions and group headings.",
    (s) => (
      <div className="flex flex-col gap-8">
        <Box>
          <C.Select label="Stage" options={stages} onValueChange={s.report} />
        </Box>
        <Variants title="States" layout="grid">
          <C.Select label="With hint" options={plainStages} hint="Moves the card to that column." />
          <C.Select label="Invalid" options={plainStages} error="Pick a stage to continue." />
          <C.Select label="Disabled" options={plainStages} defaultValue="draft" disabled />
          <C.Select label="Read-only" options={plainStages} defaultValue="shipped" readOnly />
        </Variants>
        <Variants title="Multiple" layout="grid">
          <C.Select
            label="Visible stages"
            options={plainStages}
            multiple
            defaultValue={["draft", "review"]}
          />
        </Variants>
      </div>
    ),
    'button[role="combobox"]',
    [
      click('button[role="combobox"]', '[role="option"]'),
      click('[role="option"]', ".fixture-status", "draft"),
    ],
  ),
  ComboBox: example(
    "Type to filter or open all options. Text that matches nothing shows an empty state.",
    (s) => (
      <div className="flex flex-col gap-8">
        <Box>
          <C.ComboBox
            label="Stage"
            options={stages}
            placeholder="Search stages…"
            onValueChange={s.report}
          />
        </Box>
        <Variants title="States" layout="grid">
          <C.ComboBox
            label="With hint"
            options={plainStages}
            hint="Start typing to narrow the list."
          />
          <C.ComboBox label="Invalid" options={plainStages} error="Choose one of the stages." />
          <C.ComboBox label="Disabled" options={plainStages} disabled defaultValue="draft" />
          <C.ComboBox
            label="Nothing matches"
            options={plainStages}
            defaultInputValue="zzz"
            emptyText="No stage matches that text"
            hint="Open the list to see the empty state."
          />
        </Variants>
      </div>
    ),
    'input[role="combobox"]',
    [
      click('button[aria-label="Show options"]', '[role="option"]'),
      click('[role="option"]', ".fixture-status", "draft"),
    ],
  ),
  ListBox: example(
    "Choose an item with pointer or keyboard. Type to jump, hold Shift to extend.",
    (s) => (
      <div className="flex flex-col gap-8">
        <Box>
          <C.ListBox label="Stages" options={stages} onValueChange={s.report} />
        </Box>
        <Variants title="Multiple selection" layout="grid">
          <C.ListBox
            label="Visible stages"
            options={plainStages}
            multiple
            defaultValue={["draft", "review"]}
          />
        </Variants>
        <Variants title="Compact, no groups" layout="grid">
          <C.ListBox
            label="Sort by"
            options={[
              { id: "name", label: "Name" },
              { id: "updated", label: "Last updated" },
              { id: "owner", label: "Owner", disabled: true },
            ]}
            defaultValue={["updated"]}
          />
        </Variants>
      </div>
    ),
    '[role="listbox"]',
    [click('[role="option"]', ".fixture-status", "draft")],
  ),
  GridList: example(
    "Rows use grid semantics with keyboard selection. Controls inside a row do not select it.",
    (s) => (
      <div className="flex flex-col gap-8">
        <Box>
          <C.GridList label="Stages" items={stages} onValueChange={s.report} />
        </Box>
        <Variants title="Custom rows" layout="grid">
          <C.GridList
            label="Recent files"
            items={[
              { id: "a", label: "launch-plan.md", description: "Edited 2 hours ago" },
              { id: "b", label: "budget-q3.csv", description: "Edited yesterday" },
              { id: "c", label: "brand-guide.pdf", description: "Edited last week" },
            ]}
            multiple
            defaultValue={["b"]}
            renderItem={(item) => (
              <>
                <FileTextIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate">{item.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.description}</span>
                </span>
              </>
            )}
          />
        </Variants>
      </div>
    ),
    '[role="grid"]',
    [click('[role="row"]', ".fixture-status", "draft")],
  ),
  Table: example(
    "Sort any column, or select rows with the pointer or arrow keys. The header stays put while rows scroll.",
    (s) => (
      <div className="flex flex-col gap-8">
        <C.Table
          label="Documents"
          rows={invoices}
          columns={invoiceColumns}
          multiple
          defaultValue={["INV-1004"]}
          onSortChange={(sort) => s.report(sort.direction)}
        />
        <Variants title="Compact density" layout="stack">
          <div className="w-full">
            <C.Table
              label="Compact invoices"
              rows={invoices.slice(0, 5)}
              columns={invoiceColumns}
              density="compact"
            />
          </div>
        </Variants>
        <Variants title="Sticky header, scrolling body" layout="stack">
          <div className="w-full">
            <C.Table
              label="Many invoices"
              rows={manyInvoices}
              columns={invoiceColumns}
              maxHeight={248}
              density="compact"
            />
          </div>
        </Variants>
        <Variants title="Empty and loading" layout="stack">
          <div className="w-full">
            <C.Table
              label="No invoices"
              rows={[]}
              columns={invoiceColumns}
              emptyState="No invoices match these filters"
            />
          </div>
          <div className="w-full">
            <C.Table label="Loading invoices" rows={[]} columns={invoiceColumns} loading />
          </div>
        </Variants>
      </div>
    ),
    'table[aria-label="Documents"]',
    [click("th button", ".fixture-status", "ascending")],
  ),
  Tree: example(
    "Expand a folder with the pointer or the arrow keys. Selected rows are marked with the accent.",
    () => (
      <div className="flex flex-col gap-8">
        <C.Tree
          label="Documents"
          items={workspace}
          defaultExpandedIds={["workspace", "docs"]}
          defaultValue={["roadmap"]}
        />
        <Variants title="Without icons, with counts and a disabled branch" layout="grid">
          <C.Tree
            label="Boards"
            showIcons={false}
            defaultExpandedIds={["active"]}
            items={[
              {
                id: "active",
                label: "Active boards",
                description: "3",
                children: [
                  { id: "web", label: "Website refresh", description: "12" },
                  { id: "mobile", label: "Mobile app", description: "7" },
                ],
              },
              {
                id: "archive",
                label: "Archive",
                description: "—",
                disabled: true,
                children: [{ id: "old", label: "Old board" }],
              },
            ]}
          />
          <C.Tree
            label="Settings"
            multiple
            defaultExpandedIds={["general"]}
            items={[
              {
                id: "general",
                label: "General",
                icon: <SettingsIcon />,
                children: [
                  { id: "profile", label: "Profile", icon: <FolderIcon /> },
                  { id: "notifications", label: "Notifications", icon: <FolderIcon /> },
                ],
              },
            ]}
          />
        </Variants>
      </div>
    ),
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  NavigationTree: example(
    "Navigate a document hierarchy. Rows with a link open it; the current page stays highlighted.",
    () => (
      <div
        className="w-full max-w-xs"
        // Demo links point back at this page, so a click only moves the selection.
        onClickCapture={(event) => {
          if ((event.target as Element).closest("a")) event.preventDefault();
        }}
      >
        <C.NavigationTree
          label="Browse documents"
          items={sections}
          defaultExpandedIds={["start", "guides"]}
          defaultValue={["install"]}
        />
      </div>
    ),
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  TagGroup: example(
    "Remove a tag while preserving the remaining tags.",
    (s) => (
      <div className="flex flex-col gap-8">
        <C.TagGroup label="Tags" tags={["planning", "design"]} onRemove={s.report} />
        <Variants title="Wrapping and truncation" layout="stack">
          <div className="w-full max-w-sm">
            <C.TagGroup
              label="Project tags"
              tags={[
                ...sampleTags,
                "a-deliberately-long-tag-name-that-has-to-be-clipped-somewhere",
              ]}
              onRemove={() => {}}
            />
          </div>
        </Variants>
        <Variants title="Read-only and empty" layout="stack">
          <C.TagGroup label="Applied labels" tags={["stable", "v2"]} />
          <C.TagGroup label="No labels" tags={[]} emptyState="No tags yet" />
        </Variants>
      </div>
    ),
    '[role="group"][aria-label="Tags"]',
    [click('button[aria-label="Remove planning"]', ".fixture-status", "planning")],
  ),
  TokenField: example(
    "Type to see matching suggestions; arrow keys and Enter pick one. Flip the switch to turn suggestions off.",
    (s) => (
      <div className="flex flex-col gap-8">
        <TokenDemo report={s.report} />
        <Variants title="Free typing" layout="grid">
          <C.TokenField
            label="Recipients"
            suggestions={[
              { id: "avery", label: "Avery Chen" },
              { id: "riley", label: "Riley Okafor" },
              { id: "taylor", label: "Taylor Novak" },
            ]}
            createToken={(text) => ({ id: text.toLowerCase(), label: text })}
            placeholder="Name or email"
            hint="Pick a suggestion or press Enter to add what you typed."
          />
        </Variants>
        <Variants title="States" layout="grid">
          <C.TokenField label="Empty" placeholder="Add a recipient" />
          <C.TokenField
            label="Disabled"
            disabled
            defaultValue={[
              { id: "a", label: "design" },
              { id: "b", label: "research" },
            ]}
          />
          <C.TokenField
            label="Many tokens"
            defaultValue={sampleTags.map((tag) => ({ id: tag, label: tag }))}
          />
          <C.TokenField
            label="Rejects unknown text"
            suggestions={[{ id: "design", label: "design" }]}
            placeholder="Try any text"
          />
        </Variants>
      </div>
    ),
    "input",
    [input("input", "design", ""), key("input", "Enter", ".fixture-status", "planning, design")],
  ),
  Menu: example(
    "Choose an action from a keyboard-operable menu. Items can carry icons, shortcuts and groups.",
    (s) => (
      <div className="flex flex-col gap-8">
        <div>
          <C.Menu label="Actions" items={actions} onAction={s.report} />
        </div>
        <Variants title="Plain items">
          <C.Menu
            label="Sort by"
            items={[
              { id: "name", label: "Name" },
              { id: "date", label: "Date modified" },
              { id: "size", label: "Size", disabled: true },
            ]}
          />
        </Variants>
      </div>
    ),
    "button",
    [click("button", '[role="menuitem"]'), click('[role="menuitem"]', ".fixture-status", "rename")],
  ),
  Tabs: example(
    "Switch between document views. The indicator slides to the active tab.",
    () => (
      <div className="flex flex-col gap-10">
        <C.Tabs
          label="Document view"
          defaultValue="overview"
          items={[
            {
              id: "overview",
              label: "Overview",
              icon: <LayoutListIcon />,
              content: <p>A summary of the document.</p>,
            },
            { id: "comments", label: "Comments", badge: 3, content: <p>Three open comments.</p> },
            {
              id: "history",
              label: "History",
              icon: <HistoryIcon />,
              content: <p>History view of every change.</p>,
            },
          ]}
        />
        <Variants title="Underline" layout="stack">
          <div className="w-full">
            <C.Tabs
              label="Project sections"
              variant="underline"
              defaultValue="tasks"
              items={[
                { id: "tasks", label: "Tasks", badge: 12, content: <p>Twelve tasks are open.</p> },
                { id: "files", label: "Files", content: <p>Shared files live here.</p> },
                { id: "members", label: "Members", content: <p>Everyone with access.</p> },
                { id: "billing", label: "Billing", disabled: true, content: <p>Billing.</p> },
              ]}
            />
          </div>
        </Variants>
        <Variants title="Vertical" layout="stack">
          <C.Tabs
            label="Settings sections"
            orientation="vertical"
            variant="underline"
            defaultValue="general"
            items={[
              { id: "general", label: "General", content: <p>General settings.</p> },
              {
                id: "notifications",
                label: "Notifications",
                content: <p>Notification settings.</p>,
              },
              { id: "security", label: "Security", content: <p>Security settings.</p> },
            ]}
          />
        </Variants>
      </div>
    ),
    '[role="tablist"]',
    [click('[role="tab"]:last-of-type', '[role="tabpanel"]', "History view")],
  ),
  Breadcrumbs: example(
    "The current location is announced as a page.",
    () => (
      <div className="flex flex-col gap-8">
        <C.Breadcrumbs
          items={[
            { id: "home", label: "Home", href: "#home" },
            { id: "projects", label: "Projects", href: "#projects" },
            { id: "notes", label: "Launch plan" },
          ]}
        />
        <Variants title="Long labels and many levels" layout="stack">
          <div className="w-full max-w-sm">
            <C.Breadcrumbs
              label="Deep path"
              items={[
                { id: "a", label: "Workspace", href: "#a" },
                { id: "b", label: "Quarterly planning", href: "#b" },
                { id: "c", label: "2028 roadmap", href: "#c" },
                { id: "d", label: "Customer research interviews and synthesis notes", href: "#d" },
                { id: "e", label: "Draft" },
              ]}
            />
          </div>
        </Variants>
      </div>
    ),
    'nav[aria-label="Breadcrumbs"] [aria-current="page"]',
  ),
  Disclosure: example(
    "Expand optional details.",
    () => (
      <div className="flex flex-col gap-8">
        <C.Disclosure title="Details">
          <p data-example-details>Additional detail is visible.</p>
        </C.Disclosure>
        <Variants title="Open by default, disabled" layout="stack">
          <div className="w-full max-w-md">
            <C.Disclosure title="Advanced options" defaultOpen>
              <p>
                These options change how the export is generated. Most projects can leave them
                alone.
              </p>
            </C.Disclosure>
          </div>
          <C.Disclosure title="Locked section" disabled>
            <p>Hidden.</p>
          </C.Disclosure>
        </Variants>
      </div>
    ),
    "button",
    [click("button", "[data-example-details]", "Additional detail")],
  ),
  DisclosureGroup: example(
    "Open an accordion section.",
    () => (
      <div className="flex flex-col gap-8">
        <div className="w-full max-w-md">
          <C.DisclosureGroup
            items={[
              {
                id: "one",
                title: "How do exports work?",
                content: <p>First section content: exports run in the background.</p>,
              },
              {
                id: "two",
                title: "Can I schedule them?",
                content: <p>Yes, pick a time under Schedule.</p>,
              },
              {
                id: "three",
                title: "Who can download the file?",
                content: <p>Anyone with edit access.</p>,
              },
              { id: "four", title: "Archived questions", disabled: true, content: <p>Hidden.</p> },
            ]}
          />
        </div>
        <Variants title="Several open at once" layout="stack">
          <div className="w-full max-w-md">
            <C.DisclosureGroup
              multiple
              defaultValue={["a", "b"]}
              items={[
                { id: "a", title: "Overview", content: <p>A short summary of the plan.</p> },
                {
                  id: "b",
                  title: "Timeline",
                  content: <p>Three milestones across the quarter.</p>,
                },
                { id: "c", title: "Budget", content: <p>Approved at the start of the quarter.</p> },
              ]}
            />
          </div>
        </Variants>
      </div>
    ),
    "button",
    [click("button", '[role="region"]', "First section content")],
  ),
  TagsInput: example(
    "Enter tags and remove them independently.",
    (s) => (
      <div className="flex flex-col gap-8">
        <Box>
          <C.TagsInput
            label="Tags"
            defaultValue={["planning"]}
            placeholder="Add a tag"
            suggestions={["design", "research"]}
            onValueChange={s.report}
          />
        </Box>
        <Variants title="States" layout="grid">
          <C.TagsInput label="Empty" placeholder="Add a tag" hint="Press Enter or comma to add." />
          <C.TagsInput
            label="Invalid"
            defaultValue={["x"]}
            error="Tags need at least two characters."
          />
          <C.TagsInput label="Disabled" disabled defaultValue={["design", "research"]} />
          <C.TagsInput label="Many tags" defaultValue={sampleTags} />
        </Variants>
      </div>
    ),
    "input",
    [input("input", "design", ""), key("input", "Enter", ".fixture-status", "planning, design")],
  ),
};
