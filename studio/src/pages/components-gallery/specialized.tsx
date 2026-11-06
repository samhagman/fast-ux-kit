// Gallery demos: Files, specialized inputs and navigation aids (specialized.tsx).
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, key, options, fileAction, type ComponentFixture } from "./fixture-kit";

export const specializedFixtures: Readonly<Record<string, ComponentFixture>> = {
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
  AngleSlider: example(
    "Arrow keys adjust the angle.",
    (s) => <C.AngleSlider label="Rotation" defaultValue={45} onValueChange={s.report} />,
    '[role="slider"]',
    [key('[role="slider"]', "ArrowRight", ".fixture-status", "46")],
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
  SegmentGroup: example(
    "Choose a view from a segmented control.",
    (s) => <C.SegmentGroup label="View" items={options} onValueChange={s.report} />,
    '[aria-label="View"]',
    [click("button", ".fixture-status", "draft")],
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
  Timer: example(
    "Start, pause or reset a one-minute timer.",
    () => <C.Timer label="Focus timer" seconds={60} />,
    'output[aria-label="Time remaining"]',
    [click("button", "button", "Pause")],
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
  Pagination: example(
    "Move between result pages.",
    (s) => <C.Pagination label="Results" count={50} onPageChange={s.report} />,
    'nav[aria-label="Results"]',
    [click('button[aria-label="Page 2"]', ".fixture-status", "2")],
  ),
};
