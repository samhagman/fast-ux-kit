// Gallery demos: Files, specialized inputs and navigation aids (specialized.tsx).
import type * as React from "react";
import * as C from "@samhagman/fast-ux-kit/components";
import {
  BookOpen,
  Boxes,
  Columns3,
  Gauge,
  LayoutGrid,
  LifeBuoy,
  List,
  Rows3,
  Sparkles,
  Workflow,
} from "lucide-react";
import {
  example,
  click,
  key,
  options,
  fileAction,
  Variants,
  type ComponentFixture,
} from "./fixture-kit";

/** A file for the list demos: a name, a type and a size, without allocating the bytes. */
function sample(name: string, type: string, size: number) {
  const file = new File([""], name, { type, lastModified: Date.UTC(2028, 1, 12) });
  Object.defineProperty(file, "size", { value: size });
  return file;
}
const uploadFiles = [
  sample("quarterly-plan.pdf", "application/pdf", 1_258_291),
  sample("site-photo.png", "image/png", 3_460_300),
  sample("budget.csv", "text/csv", 48_220),
  sample("archive-2027.zip", "application/zip", 52_428_800),
];
const uploadStatus = (file: File): C.FileUploadStatus | undefined =>
  ({
    "quarterly-plan.pdf": { done: true },
    "site-photo.png": { progress: 64 },
    "archive-2027.zip": { error: "Larger than the 25 MB limit" },
  })[file.name];

const chip =
  "inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-sm text-muted-foreground whitespace-nowrap";

const project = {
  name: "Harbor renovation",
  id: 1024,
  active: true,
  archivedAt: null,
  budget: { currency: "USD", planned: 184500.5, approved: false },
  tags: ["permits", "electrical", "phase 2"],
  tasks: [
    { id: 1, title: "Submit permit application", done: true },
    { id: 2, title: "Order switchgear", done: false },
  ],
  notes: "Inspection moved to the second week of March; the crew lead has the revised drawings.",
  attachments: [],
};
const circular: Record<string, unknown> = { name: "Node A" };
circular.self = circular;

const slideClasses = "flex min-h-28 flex-col justify-center gap-1";
function Slide({ title, text }: { title: string; text: string }) {
  return (
    <div className={slideClasses}>
      <p className="text-base font-semibold">{title}</p>
      <p className="max-w-prose text-sm text-pretty text-muted-foreground">{text}</p>
    </div>
  );
}

function Header({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex w-full items-center justify-between gap-4 rounded-xl border bg-card px-3 py-2 shadow-xs">
      <span className="text-sm font-semibold">Fieldbook</span>
      {children}
    </div>
  );
}

export const specializedFixtures: Readonly<Record<string, ComponentFixture>> = {
  DropZone: example(
    "Drop a text file on the zone, or choose one. The zone highlights while a file is dragged over it.",
    (s) => (
      <>
        <C.DropZone
          label="Choose file"
          accept=".txt"
          maxSize={2_097_152}
          onFilesChange={(files) => s.report(files.map((file) => file.name))}
        />
        <Variants title="States" layout="stack">
          <C.DropZone
            label="Attach photos"
            accept="image/*"
            multiple
            maxFiles={4}
            maxSize={10_485_760}
          />
          <C.DropZone label="Attach receipt" compact accept="application/pdf" maxSize={5_242_880} />
          <C.DropZone label="Replace logo" invalid hint="Choose a PNG or SVG under 1 MB.">
            That file type is not supported
          </C.DropZone>
          <C.DropZone label="Import contacts" disabled accept=".csv" />
        </Variants>
      </>
    ),
    '[data-slot="dropzone"]',
    [fileAction],
  ),
  FileTrigger: example(
    "Choose a file through the native file dialog.",
    (s) => (
      <>
        <div>
          <C.FileTrigger
            label="Choose file"
            accept=".txt"
            onFilesChange={(files) => s.report(files.map((file) => file.name))}
          />
        </div>
        <Variants title="Variants">
          <C.FileTrigger label="Default" variant="default" />
          <C.FileTrigger label="Secondary" variant="secondary" />
          <C.FileTrigger label="Ghost" variant="ghost" />
        </Variants>
        <Variants title="Sizes and states">
          <C.FileTrigger label="Small" size="sm" />
          <C.FileTrigger label="Large" size="lg" />
          <C.FileTrigger label="Disabled" disabled />
        </Variants>
      </>
    ),
    'input[type="file"]',
    [fileAction],
  ),
  AngleSlider: example(
    "Drag the dial, or focus it and use the arrow keys. Shift or Page Up and Down move in tens.",
    (s) => (
      <>
        <C.AngleSlider label="Rotation" defaultValue={45} onValueChange={s.report} />
        <Variants title="Steps and states">
          <C.AngleSlider label="Snaps to 15 degrees" defaultValue={90} step={15} />
          <C.AngleSlider label="Horizon" defaultValue={270} />
          <C.AngleSlider label="Disabled" defaultValue={135} disabled />
        </Variants>
      </>
    ),
    '[role="slider"]',
    [key('[role="slider"]', "ArrowRight", ".fixture-status", "46")],
  ),
  Carousel: example(
    "Browse the slides with the arrows, the dots or the keyboard.",
    () => (
      <>
        <C.Carousel label="Release notes">
          <Slide
            title="Faster search"
            text="Results appear as you type, and the index now updates in the background."
          />
          <Slide
            title="Shared notebooks"
            text="Invite a teammate to a notebook and see their cursor while you edit together."
          />
          <Slide
            title="Offline mode"
            text="Keep working without a connection. Changes sync when you are back online."
          />
        </C.Carousel>
        <Variants title="Edge cases" layout="stack">
          <C.Carousel label="Single slide">
            <Slide
              title="Only one slide"
              text="Both arrows are disabled and the count reads 1 / 1."
            />
          </C.Carousel>
          <C.Carousel label="Many slides">
            {Array.from({ length: 8 }, (_, index) => (
              <Slide
                key={index}
                title={`Chapter ${index + 1}`}
                text="The dots stay centered and the current one is stretched."
              />
            ))}
          </C.Carousel>
        </Variants>
      </>
    ),
    '[aria-roledescription="carousel"]',
    [click('button[aria-label="Next"]', "output", "2 / 3")],
  ),
  Clipboard: example(
    "Copy the example text to the clipboard. The icon turns into a check for a moment.",
    () => (
      <>
        <C.Clipboard value="Example note" label="Copy note" />
        <Variants title="Shapes">
          <C.Clipboard value="https://example.com/invite/4f9a" label="Copy link" iconOnly />
          <C.Clipboard value="npm install example" label="Copy command" variant="secondary" />
          <C.Clipboard value="x" label="Copy" variant="ghost" size="sm" />
        </Variants>
        <Variants title="In a field" layout="stack">
          <div className="flex w-full max-w-sm items-center gap-2">
            <C.Input aria-label="Invite link" readOnly value="https://example.com/invite/4f9a" />
            <C.Clipboard
              value="https://example.com/invite/4f9a"
              label="Copy invite link"
              iconOnly
            />
          </div>
        </Variants>
      </>
    ),
    "button",
    [click("button", '[role="status"]', "Copied")],
  ),
  DownloadTrigger: example(
    "The link exposes a file download action.",
    () => (
      <>
        <div>
          <C.DownloadTrigger href="/demo/eval-curve.svg" filename="example.svg">
            Download sample
          </C.DownloadTrigger>
        </div>
        <Variants title="Variants">
          <C.DownloadTrigger href="/demo/eval-curve.svg" variant="default">
            Download report
          </C.DownloadTrigger>
          <C.DownloadTrigger href="/demo/eval-curve.svg" variant="secondary">
            Export data
          </C.DownloadTrigger>
          <C.DownloadTrigger href="/demo/eval-curve.svg" variant="ghost" size="sm">
            Save copy
          </C.DownloadTrigger>
        </Variants>
        <Variants title="Pending and unavailable">
          <C.DownloadTrigger href="/demo/eval-curve.svg" pending>
            Preparing archive
          </C.DownloadTrigger>
          <C.DownloadTrigger href="javascript:void(0)">Blocked</C.DownloadTrigger>
        </Variants>
      </>
    ),
    'a[download="example.svg"]',
  ),
  FileUpload: example(
    "Select a file and review the file list. Drop several to see the total.",
    (s) => (
      <>
        <C.FileUpload
          label="Upload file"
          accept=".txt"
          onFilesChange={(files) => s.report(files.map((file) => file.name))}
        />
        <Variants title="Progress, success and errors" layout="stack">
          <C.FileUpload
            label="Project documents"
            multiple
            maxSize={26_214_400}
            defaultFiles={uploadFiles}
            status={uploadStatus}
          />
        </Variants>
        <Variants title="Layouts and states" layout="stack">
          <C.FileUpload label="Profile photo" accept="image/*" maxSize={5_242_880} compact />
          <C.FileUpload label="Locked uploads" disabled defaultFiles={uploadFiles.slice(0, 1)} />
        </Variants>
      </>
    ),
    'input[type="file"]',
    [fileAction],
  ),
  JsonTreeView: example(
    "Expand structured data in a keyboard-operable tree. Arrow keys open and close branches.",
    () => (
      <>
        <C.JsonTreeView
          value={project}
          label="Project record"
          defaultExpandedIds={["$", "$/budget", "$/tasks"]}
        />
        <Variants title="Shapes" layout="grid">
          <C.JsonTreeView
            value={[1, 2.5, -3, "four", null, true, false]}
            label="Mixed list"
            defaultExpandedIds={["$"]}
          />
          <C.JsonTreeView
            value={{ empty: {}, none: [], deep: { a: { b: { c: { d: "bottom" } } } } }}
            label="Empty and deep"
            defaultExpandedIds={["$", "$/deep", "$/deep/a", "$/deep/a/b"]}
          />
          <C.JsonTreeView value={circular} label="Circular" defaultExpandedIds={["$"]} />
        </Variants>
      </>
    ),
    '[role="tree"]',
    [key('[role="treeitem"]', "ArrowRight", '[role="treeitem"][aria-expanded="true"]')],
  ),
  Marquee: example(
    "Pause or resume the moving content. It also pauses while you hover or focus it.",
    () => (
      <>
        <C.Marquee label="Highlights">
          {["Outline", "Search", "Notes", "Sync", "Export", "Templates"].map((name) => (
            <span key={name} className={chip}>
              <Sparkles aria-hidden className="size-3.5" />
              {name}
            </span>
          ))}
        </C.Marquee>
        <Variants title="Speeds" layout="stack">
          <C.Marquee label="Slow ticker" duration={40}>
            <span className="text-sm text-muted-foreground">
              Release 2.4 is out. Read the notes. Share feedback. Join the beta.
            </span>
          </C.Marquee>
          <C.Marquee label="Fast ticker" duration={8}>
            <span className="font-mono text-sm text-muted-foreground">
              build 1042 passed · build 1043 passed · build 1044 running
            </span>
          </C.Marquee>
        </Variants>
      </>
    ),
    '[data-slot="marquee"]',
    [click("button", 'button[aria-pressed="true"]', "Resume motion")],
  ),
  NavigationMenu: example(
    "Open a section to see its panel. Arrow keys move between the sections.",
    () => (
      <>
        <Header>
          <C.NavigationMenu
            label="Site sections"
            items={[
              {
                id: "docs",
                label: "Documentation",
                children: <C.Link href="#guide">Read the guide</C.Link>,
              },
              {
                id: "product",
                label: "Product",
                links: [
                  {
                    id: "boards",
                    label: "Boards",
                    description: "Plan work in columns and swimlanes.",
                    href: "#boards",
                    icon: <Columns3 />,
                  },
                  {
                    id: "automation",
                    label: "Automation",
                    description: "Run actions when a card changes.",
                    href: "#automation",
                    icon: <Workflow />,
                  },
                  {
                    id: "reports",
                    label: "Reports",
                    description: "Track throughput and cycle time.",
                    href: "#reports",
                    icon: <Gauge />,
                  },
                  {
                    id: "integrations",
                    label: "Integrations",
                    description: "Connect the tools you already use.",
                    href: "#integrations",
                    icon: <Boxes />,
                  },
                ],
              },
              { id: "home", label: "Home", href: "#home", current: true },
            ]}
          />
        </Header>
        <Variants title="Plain links and one panel" layout="stack">
          <Header>
            <C.NavigationMenu
              label="Help sections"
              items={[
                { id: "overview", label: "Overview", href: "#overview", current: true },
                { id: "pricing", label: "Pricing", href: "#pricing" },
                {
                  id: "help",
                  label: "Help",
                  links: [
                    {
                      id: "guides",
                      label: "Guides",
                      description: "Short walkthroughs for common tasks.",
                      href: "#guides",
                      icon: <BookOpen />,
                    },
                    {
                      id: "support",
                      label: "Support",
                      description: "Talk to a person.",
                      href: "#support",
                      icon: <LifeBuoy />,
                    },
                  ],
                },
              ]}
            />
          </Header>
        </Variants>
      </>
    ),
    '[aria-label="Site sections"]',
    [click("button", 'a[href="#guide"]', "Read the guide")],
  ),
  QrCode: example(
    "The QR contains a synthetic example URL.",
    () => (
      <>
        <C.QrCode
          value="https://example.com/notebook"
          label="Notebook QR"
          caption="example.com/notebook"
        />
        <Variants title="Sizes and error correction">
          <C.QrCode value="https://example.com/a" label="Small QR" size={96} />
          <C.QrCode
            value="https://example.com/join?room=4f9a"
            label="High correction QR"
            correction="H"
            size={128}
            caption="Level H"
          />
          <C.QrCode
            value="WIFI:T:WPA;S:Guest;P:welcome-2028;;"
            label="Wi-Fi QR"
            size={128}
            caption="Guest network"
          />
        </Variants>
        <Variants title="Too large">
          <C.QrCode value={"x".repeat(4000)} label="Oversized QR" />
        </Variants>
      </>
    ),
    'svg[role="img"] path[d]',
  ),
  RatingGroup: example(
    "Choose a rating. Hover previews it, and the arrow keys change it.",
    (s) => (
      <>
        <C.RatingGroup label="Rating" onValueChange={s.report} />
        <Variants title="Half stars and states" layout="grid">
          <C.RatingGroup label="Half stars" allowHalf defaultValue="3.5" />
          <C.RatingGroup label="Read-only" readOnly defaultValue="4" />
          <C.RatingGroup label="Disabled" disabled defaultValue="2" />
          <C.RatingGroup label="Three levels" max={3} defaultValue="2" />
        </Variants>
      </>
    ),
    '[role="radiogroup"]',
    [click('[role="radio"]', ".fixture-status", "1")],
  ),
  SegmentGroup: example(
    "Choose a view from a segmented control. The highlight slides to the new choice.",
    (s) => (
      <>
        <C.SegmentGroup label="View" items={options} onValueChange={s.report} />
        <Variants title="Sizes">
          <C.SegmentGroup label="Small" size="sm" defaultValue="draft" items={options} />
          <C.SegmentGroup label="Default" defaultValue="draft" items={options} />
          <C.SegmentGroup label="Large" size="lg" defaultValue="draft" items={options} />
        </Variants>
        <Variants title="With icons and full width" layout="stack">
          <C.SegmentGroup
            label="Layout"
            defaultValue="list"
            items={[
              { id: "list", label: "List", icon: <List /> },
              { id: "grid", label: "Grid", icon: <LayoutGrid /> },
              { id: "board", label: "Board", icon: <Rows3 /> },
            ]}
          />
          <div className="w-full max-w-md">
            <C.SegmentGroup
              label="Range"
              fullWidth
              defaultValue="week"
              items={[
                { id: "day", label: "Day" },
                { id: "week", label: "Week" },
                { id: "month", label: "Month" },
              ]}
            />
          </div>
        </Variants>
      </>
    ),
    '[aria-label="View"]',
    [click("button", ".fixture-status", "draft")],
  ),
  Steps: example(
    "Move through a short sequence. Completed steps show a check and fill the connecting line.",
    (s) => (
      <>
        <C.Steps
          label="Setup"
          items={[
            { id: "create", title: "Create account", description: "Choose a name and a password." },
            { id: "invite", title: "Invite your team", description: "Add people by email." },
            { id: "review", title: "Review" },
          ]}
          value={s.page}
          onValueChange={s.setPage}
        />
        <Variants title="Horizontal" layout="stack">
          <div className="w-full">
            <C.Steps
              label="Checkout"
              orientation="horizontal"
              value={1}
              items={[
                { id: "cart", title: "Cart" },
                { id: "shipping", title: "Shipping" },
                { id: "payment", title: "Payment" },
                { id: "done", title: "Confirmation" },
              ]}
            />
          </div>
        </Variants>
        <Variants title="States" layout="grid">
          <C.Steps
            label="With an error"
            value={2}
            items={[
              { id: "a", title: "Upload", description: "Finished" },
              { id: "b", title: "Validate", description: "Two rows need attention", error: true },
              { id: "c", title: "Import" },
            ]}
          />
          <C.Steps
            label="All complete"
            value={3}
            items={[
              { id: "a", title: "Plan" },
              { id: "b", title: "Build" },
              { id: "c", title: "Ship" },
            ]}
          />
        </Variants>
      </>
    ),
    'nav[aria-label="Setup"]',
    [click("li:last-child button", 'li[aria-current="step"]', "Review")],
  ),
  Timer: example(
    "Start, pause or reset a one-minute timer.",
    (s) => (
      <>
        <C.Timer label="Focus timer" seconds={60} onComplete={() => s.report("Time is up")} />
        <Variants title="Durations" layout="grid">
          <C.Timer label="Quick break" seconds={5} />
          <C.Timer label="Work session" seconds={1500} />
        </Variants>
      </>
    ),
    'output[aria-label="Time remaining"]',
    [click("button", "button", "Pause")],
  ),
  Toc: example(
    "The current section is marked in a document outline.",
    () => (
      <>
        <C.Toc
          activeId="intro"
          items={[
            { id: "intro", label: "Introduction" },
            { id: "details", label: "Details", level: 2 },
            { id: "edge", label: "Edge cases", level: 3 },
            { id: "usage", label: "Usage" },
            { id: "faq", label: "Frequently asked questions" },
          ]}
        />
        <Variants title="Without a heading, deeper section active" layout="grid">
          <C.Toc
            label="Sections"
            heading={false}
            activeId="b2"
            items={[
              { id: "a", label: "Overview" },
              { id: "b", label: "Installing" },
              { id: "b1", label: "From a package manager", level: 2 },
              { id: "b2", label: "From source", level: 2 },
              { id: "c", label: "Configuration" },
            ]}
          />
        </Variants>
      </>
    ),
    'nav a[aria-current="location"]',
  ),
  Pagination: example(
    "Move between result pages.",
    (s) => (
      <>
        <C.Pagination label="Results" count={50} onPageChange={s.report} />
        <Variants title="Many pages" layout="stack">
          <C.Pagination label="Search results" count={400} defaultPage={12} />
          <C.Pagination label="Last pages" count={400} defaultPage={40} />
        </Variants>
        <Variants title="Compact and single page" layout="stack">
          <C.Pagination label="Compact results" compact count={120} defaultPage={2} />
          <C.Pagination label="One page" count={8} />
        </Variants>
      </>
    ),
    'nav[aria-label="Results"]',
    [click('button[aria-label="Page 2"]', ".fixture-status", "2")],
  ),
};
