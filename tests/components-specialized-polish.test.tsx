import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  AngleSlider,
  Carousel,
  Clipboard,
  DownloadTrigger,
  DropZone,
  FileUpload,
  JsonTreeView,
  Marquee,
  NavigationMenu,
  Pagination,
  QrCode,
  RatingGroup,
  SegmentGroup,
  Steps,
  Timer,
  Toc,
} from "../src/components/specialized.js";

Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});
class PointerEventStub extends dom.window.MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? "mouse";
  }
}
Object.defineProperty(dom.window, "PointerEvent", { configurable: true, value: PointerEventStub });
Object.defineProperty(globalThis, "PointerEvent", { configurable: true, value: PointerEventStub });
const copied: string[] = [];
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: { writeText: async (text: string) => void copied.push(text) },
});
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

function sample(name: string, type: string, size: number) {
  const file = new dom.window.File([""], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

test("pagination pins the ends around a three-page window and keeps its names", () => {
  const view = render(<Pagination label="Results" count={400} defaultPage={12} />);
  const nav = view.getByRole("navigation", { name: "Results" });
  // Pages sliding in or out of the window stay mounted but inert: only reachable buttons count.
  const labels = Array.from(nav.querySelectorAll("button:not([inert])")).map(
    (button) => button.getAttribute("aria-label") ?? button.textContent,
  );
  // Each gap is a button that names the pages it hides.
  assert.deepEqual(labels, [
    "Previous",
    "Page 1",
    "Go to page, pages 2 to 10 are hidden",
    "Page 11",
    "Page 12",
    "Page 13",
    "Go to page, pages 14 to 39 are hidden",
    "Page 40",
    "Next",
  ]);
  // Every slot is sized in rem, so the selection box and the number in it always agree.
  const current = view.getByRole("button", { name: "Page 12" });
  const marker = current.parentElement!.querySelector<HTMLElement>("span.pointer-events-none")!;
  assert.equal(marker.style.inlineSize, current.style.inlineSize);
  assert.match(current.style.inlineSize, /^[\d.]+rem$/);
  for (const hidden of nav.querySelectorAll("button[inert]")) {
    assert.equal(hidden.getAttribute("tabindex"), "-1", "an off-window page takes no focus");
    assert.equal(hidden.getAttribute("aria-hidden"), "true");
  }
  // The strip moves, the selection keeps its middle slot: page 13 is now in the middle.
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  const after = Array.from(nav.querySelectorAll("button:not([inert])")).map(
    (button) => button.getAttribute("aria-label") ?? button.textContent,
  );
  assert.deepEqual(after.slice(3, 6), ["Page 12", "Page 13", "Page 14"]);
  assert.equal(view.getByRole("button", { name: "Page 13" }).getAttribute("aria-current"), "page");
  // At the last page the window stops and the selection moves to the pinned end.
  fireEvent.click(view.getByRole("button", { name: "Page 40" }));
  const end = Array.from(nav.querySelectorAll("button:not([inert])")).map(
    (button) => button.getAttribute("aria-label") ?? button.textContent,
  );
  // The trailing gap hides nothing now, so it is out of reach; the leading one still jumps.
  assert.deepEqual(end, [
    "Previous",
    "Page 1",
    "Go to page, pages 2 to 36 are hidden",
    "Page 37",
    "Page 38",
    "Page 39",
    "Page 40",
    "Next",
  ]);
  view.rerender(<Pagination label="Results" count={50} defaultPage={1} />);
  // Five pages: nothing is hidden behind an ellipsis.
  assert.equal(view.getAllByRole("button", { name: /^Page / }).length, 5);
  assert.equal(view.getByRole("button", { name: "Page 5" }).getAttribute("aria-current"), "page");
});

test("compact pagination reads out the page and keeps icon buttons named", () => {
  const pages: number[] = [];
  const view = render(
    <Pagination
      label="Compact"
      compact
      count={120}
      defaultPage={2}
      onPageChange={(p) => pages.push(p)}
    />,
  );
  assert.match(view.getByRole("navigation").textContent ?? "", /Page 2 of 12/);
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  fireEvent.click(view.getByRole("button", { name: "Previous" }));
  assert.deepEqual(pages, [3, 2]);
  assert.equal(view.queryByRole("button", { name: "Page 3" }), null);
});

test("a gap opens a field for the exact page, and the compact readout does the same", async () => {
  const pages: number[] = [];
  const view = render(
    <Pagination label="Results" count={400} defaultPage={12} onPageChange={(p) => pages.push(p)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Go to page, pages 14 to 39 are hidden" }));
  const field = (await waitFor(() => view.getByLabelText("Go to page"))) as HTMLInputElement;
  assert.equal(field.value, "12", "the field starts on the current page");
  assert.equal(field.max, "40");
  // Not a page: nothing changes and the field stays open to be corrected.
  fireEvent.change(field, { target: { value: "2.5" } });
  fireEvent.submit(field.form!);
  assert.deepEqual(pages, []);
  assert.ok(view.queryByLabelText("Go to page"));
  fireEvent.change(field, { target: { value: "27" } });
  fireEvent.submit(field.form!);
  assert.deepEqual(pages, [27]);
  assert.equal(view.getByRole("button", { name: "Page 27" }).getAttribute("aria-current"), "page");
  await waitFor(() => assert.equal(view.queryByLabelText("Go to page"), null));
  view.unmount();

  // Past the last page goes to the last page.
  const compact = render(
    <Pagination
      label="Compact"
      compact
      count={120}
      defaultPage={2}
      onPageChange={(p) => pages.push(p)}
    />,
  );
  fireEvent.click(compact.getByRole("button", { name: "Page 2 of 12" }));
  const jump = (await waitFor(() => compact.getByLabelText("Go to page"))) as HTMLInputElement;
  fireEvent.change(jump, { target: { value: "99" } });
  fireEvent.submit(jump.form!);
  assert.deepEqual(pages, [27, 12]);
  assert.ok(compact.getByRole("button", { name: "Page 12 of 12" }));
  compact.unmount();

  // One page: there is nowhere to jump, so the readout is plain text.
  const single = render(<Pagination label="One" compact count={8} />);
  assert.match(single.getByRole("navigation").textContent ?? "", /Page 1 of 1/);
  assert.equal(single.queryByRole("button", { name: /Page 1 of 1/ }), null);
});

test("clipboard confirms a copy, then returns to its resting state", async () => {
  const view = render(<Clipboard value="Invite link" label="Copy link" resetDelay={40} />);
  const button = view.getByRole("button", { name: "Copy link" });
  fireEvent.click(button);
  await waitFor(() => assert.equal(view.getByRole("status").textContent, "Copied"));
  assert.deepEqual(copied.at(-1), "Invite link");
  assert.equal(button.getAttribute("data-copied"), "true");
  await waitFor(() => assert.equal(view.getByRole("status").textContent, ""));
  assert.equal(button.getAttribute("data-copied"), null);
});

test("icon-only clipboard stays named and announces without visible text", async () => {
  const view = render(
    <Clipboard value="x" label="Copy invite" iconOnly copiedLabel="Link copied" />,
  );
  const button = view.getByRole("button", { name: "Copy invite" });
  assert.equal(button.textContent, "");
  fireEvent.click(button);
  await waitFor(() => assert.equal(view.getByRole("status").textContent, "Link copied"));
  assert.match(view.getByRole("status").className, /sr-only/);
});

test("download trigger shows a pending state without navigating", () => {
  let clicks = 0;
  const view = render(
    <DownloadTrigger
      href="/files/report.csv"
      filename="report.csv"
      pending
      onClick={() => clicks++}
    >
      Preparing
    </DownloadTrigger>,
  );
  const link = view.getByRole("link", { name: "Preparing" });
  assert.equal(link.getAttribute("aria-busy"), "true");
  assert.equal(link.getAttribute("aria-disabled"), "true");
  assert.equal(link.getAttribute("download"), "report.csv");
  assert.equal(link.querySelector("svg.animate-spin") !== null, true);
  assert.equal(fireEvent.click(link), false);
  assert.equal(clicks, 0);
  view.rerender(
    <DownloadTrigger href="/files/report.csv" onClick={(event) => event.preventDefault()}>
      Download
    </DownloadTrigger>,
  );
  fireEvent.click(view.getByRole("link", { name: "Download" }));
  view.rerender(<DownloadTrigger href="javascript:void(0)" />);
  assert.match(view.getByRole("alert").textContent ?? "", /unavailable/);
});

test("drop zone describes its limits and shows a drag-over state", () => {
  const view = render(<DropZone label="Attach" accept="image/*,.pdf" maxSize={5_242_880} />);
  const zone = view.getByRole("group", { name: "Attach" });
  assert.match(zone.getAttribute("aria-describedby") ?? "", /.+/);
  assert.equal(view.getByText("Images, PDF, up to 5 MB") !== null, true);
  fireEvent.dragOver(zone);
  assert.equal(zone.getAttribute("data-dragging"), "true");
  assert.ok(view.getByText("Release to add files"));
  fireEvent.dragLeave(zone);
  assert.equal(zone.getAttribute("data-dragging"), null);
  view.rerender(<DropZone label="Attach" invalid hint="Choose a PNG." />);
  assert.equal(zone.getAttribute("data-invalid"), "true");
  assert.ok(view.getByText("Choose a PNG."));
});

test("upload rows show type, size, progress, success and failure and can be removed", () => {
  const files = [
    sample("plan.pdf", "application/pdf", 1_258_291),
    sample("photo.png", "image/png", 3_460_300),
    sample("big.zip", "application/zip", 52_428_800),
    sample("notes.txt", "text/plain", 800),
  ];
  const changes: number[] = [];
  const view = render(
    <FileUpload
      label="Documents"
      multiple
      defaultFiles={files}
      onFilesChange={(next) => changes.push(next.length)}
      status={(file) =>
        ({
          "plan.pdf": { done: true },
          "photo.png": { progress: 64 },
          "big.zip": { error: "Over the limit" },
        })[file.name]
      }
    />,
  );
  const list = view.getByRole("list", { name: "Documents files" });
  const rows = Array.from(list.querySelectorAll("li"));
  assert.deepEqual(
    rows.map((row) => row.getAttribute("data-state")),
    ["done", "uploading", "error", "ready"],
  );
  assert.match(rows[0]!.textContent ?? "", /1\.2 MB · Uploaded/);
  assert.match(rows[1]!.textContent ?? "", /3\.3 MB · 64%/);
  assert.match(rows[2]!.textContent ?? "", /50 MB · Over the limit/);
  assert.match(rows[3]!.textContent ?? "", /800 B/);
  const progress = view.getByRole("progressbar", { name: "Uploading photo.png" });
  assert.equal(progress.getAttribute("aria-valuenow"), "64");
  assert.ok(
    rows.every((row) => row.querySelector("svg")),
    "every row carries an icon",
  );
  assert.match(view.getByText("4 files").parentElement?.textContent ?? "", /55 MB/);
  fireEvent.click(view.getByRole("button", { name: "Remove notes.txt" }));
  assert.deepEqual(changes, [3]);
  assert.equal(view.queryByText("notes.txt"), null);
});

test("an upload rejection marks the zone invalid and reports once", async () => {
  const view = render(<FileUpload label="Photo" accept="image/png" maxSize={100} />);
  const zone = view.getByRole("group", { name: "Photo" });
  fireEvent.drop(zone, {
    dataTransfer: { files: [sample("note.txt", "text/plain", 10)] },
  });
  assert.equal(view.getAllByRole("alert").length, 1);
  assert.match(view.getByRole("alert").textContent ?? "", /note\.txt has an unsupported file type/);
  assert.equal(zone.getAttribute("data-invalid"), "true");
});

test("angle slider keeps its slider semantics with a decorative dial", () => {
  const values: number[] = [];
  const view = render(
    <AngleSlider label="Rotation" defaultValue={90} onValueChange={(v) => values.push(v)} />,
  );
  const slider = view.getByRole("slider", { name: "Rotation" });
  assert.equal(slider.getAttribute("aria-valuetext"), "90 degrees");
  assert.equal(slider.style.getPropertyValue("--angle"), "90deg");
  assert.equal(slider.querySelectorAll("svg[aria-hidden] line").length, 36);
  fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
  fireEvent.keyDown(slider, { key: "End" });
  assert.deepEqual(values, [100, 360]);
  assert.equal(slider.style.getPropertyValue("--angle"), "360deg");
});

test("rating group supports half stars, a preview and read-only", () => {
  const values: string[] = [];
  const view = render(
    <RatingGroup
      label="Quality"
      allowHalf
      defaultValue="3.5"
      onValueChange={(v) => values.push(String(v))}
    />,
  );
  const radios = view.getAllByRole("radio");
  assert.equal(radios.length, 10);
  assert.deepEqual(
    radios.slice(0, 3).map((radio) => radio.getAttribute("aria-label")),
    ["0.5 stars", "1 star", "1.5 stars"],
  );
  assert.equal(view.getByRole("radio", { name: "3.5 stars" }).getAttribute("aria-checked"), "true");
  assert.ok(view.getByText("3.5 / 5"));
  fireEvent.click(view.getByRole("radio", { name: "5 stars" }));
  assert.deepEqual(values, ["5"]);
  assert.ok(view.getByText("5 / 5"));
  view.rerender(<RatingGroup label="Quality" readOnly value="2" />);
  fireEvent.click(view.getByRole("radio", { name: "4 stars" }));
  assert.equal(view.getByRole("radio", { name: "2 stars" }).getAttribute("aria-checked"), "true");
});

test("segment group renders a sliding indicator behind the selection", () => {
  const view = render(
    <SegmentGroup
      label="Layout"
      size="lg"
      defaultValue="grid"
      items={[
        { id: "list", label: "List" },
        { id: "grid", label: "Grid", icon: <svg data-testid="icon" /> },
      ]}
    />,
  );
  const indicator = view.container.querySelector('[data-slot="segment-indicator"]')!;
  assert.ok(indicator);
  assert.equal(indicator.classList.contains("hidden"), false);
  assert.equal(view.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"), "true");
  assert.ok(view.getByTestId("icon"));
});

test("steps mark complete, current, upcoming and error states, and can be display-only", () => {
  const picked: number[] = [];
  const items = [
    { id: "a", title: "Account", description: "Pick a name" },
    { id: "b", title: "Review", error: true },
    { id: "c", title: "Done" },
  ];
  const view = render(
    <Steps label="Setup" items={items} value={1} onValueChange={(i) => picked.push(i)} />,
  );
  const rows = Array.from(view.container.querySelectorAll("li"));
  assert.deepEqual(
    rows.map((row) => row.getAttribute("data-state")),
    ["complete", "error", "upcoming"],
  );
  assert.equal(rows[1]!.getAttribute("aria-current"), "step");
  assert.ok(view.getByText("Pick a name"));
  fireEvent.click(view.getByRole("button", { name: /Done/ }));
  assert.deepEqual(picked, [2]);
  view.rerender(<Steps label="Setup" items={items} value={0} orientation="horizontal" />);
  assert.equal(view.queryAllByRole("button").length, 0);
  assert.equal(
    view.getByRole("navigation", { name: "Setup" }).getAttribute("data-orientation"),
    "horizontal",
  );
});

test("toc shows a heading, nesting depth and the active section", () => {
  const view = render(
    <Toc
      activeId="b"
      items={[
        { id: "a", label: "Intro" },
        { id: "b", label: "Detail", level: 2 },
      ]}
    />,
  );
  assert.ok(view.getByText("On this page", { selector: "p" }));
  const link = view.getByRole("link", { name: "Detail" });
  assert.equal(link.getAttribute("aria-current"), "location");
  assert.equal((link.parentElement as HTMLElement).style.getPropertyValue("--toc-level"), "2");
  view.rerender(<Toc heading={false} items={[{ id: "a", label: "Intro" }]} />);
  assert.equal(view.queryByText("On this page", { selector: "p" }), null);
  assert.ok(view.getByRole("navigation", { name: "On this page" }));
});

test("navigation menu opens a panel of titled, described links", async () => {
  const view = render(
    <NavigationMenu
      label="Main"
      items={[
        {
          id: "product",
          label: "Product",
          links: [
            {
              id: "boards",
              label: "Boards",
              description: "Plan work in columns.",
              href: "/boards",
            },
            { id: "bad", label: "Blocked", href: "javascript:alert(1)" },
          ],
        },
        { id: "home", label: "Home", href: "/", current: true },
      ]}
    />,
  );
  assert.equal(view.getByRole("link", { name: "Home" }).getAttribute("aria-current"), "page");
  fireEvent.click(view.getByRole("button", { name: /Product/ }));
  await waitFor(() => assert.ok(document.querySelector('a[href="/boards"]')));
  const link = document.querySelector('a[href="/boards"]')!;
  assert.match(link.textContent ?? "", /Boards\s*Plan work in columns\./);
  assert.equal(document.querySelector('a[href^="javascript"]'), null);
});

test("json tree view labels value types and counts for containers", () => {
  const view = render(
    <JsonTreeView
      value={{ name: "Harbor", size: 3, live: true, none: null, tags: ["a", "b"], empty: {} }}
      label="Record"
      defaultExpandedIds={["$"]}
    />,
  );
  const kinds = (kind: string) =>
    Array.from(view.container.querySelectorAll("[data-json-kind]"))
      .filter((node) => node.getAttribute("data-json-kind") === kind)
      .map((node) => node.textContent);
  assert.deepEqual(kinds("string"), ['"Harbor"']);
  assert.deepEqual(kinds("number"), ["3"]);
  assert.deepEqual(kinds("boolean"), ["true"]);
  assert.deepEqual(kinds("null"), ["null"]);
  const counts = Array.from(view.container.querySelectorAll('[data-json-part="count"]')).map(
    (node) => node.textContent,
  );
  assert.deepEqual(counts, ["6 keys", "2 items", "0 keys"]);
  // The accessible label of each row is unchanged by the richer rendering.
  assert.ok(view.getByRole("treeitem", { name: /Record/ }));
  const circular: Record<string, unknown> = { id: 1 };
  circular.self = circular;
  view.rerender(<JsonTreeView value={circular} label="Loop" defaultExpandedIds={["$"]} />);
  assert.deepEqual(kinds("note"), ["[Circular]"]);
});

test("qr code frames the code and captions it, or explains why it cannot", () => {
  const view = render(
    <QrCode value="https://example.com/a" label="Link QR" caption="example.com/a" />,
  );
  const figure = view.container.querySelector("figure")!;
  assert.ok(figure.querySelector('svg[role="img"][aria-label="Link QR"] path[d]'));
  assert.equal(figure.querySelector("figcaption")?.textContent, "example.com/a");
  view.rerender(<QrCode value={"x".repeat(4000)} />);
  assert.match(view.getByRole("alert").textContent ?? "", /too large/);
});

test("timer shows tabular digits, swaps Start and Pause, and announces completion", async () => {
  let complete = 0;
  const view = render(<Timer label="Break" seconds={0.1} onComplete={() => complete++} />);
  const readout = view.getByLabelText("Time remaining");
  assert.equal(readout.textContent, "0:01");
  assert.match(readout.className, /tabular-nums/);
  assert.equal(readout.getAttribute("aria-live"), "off");
  const start = view.getByRole("button", { name: "Start" });
  assert.ok(start.querySelector("svg"));
  fireEvent.click(start);
  assert.ok(view.getByRole("button", { name: "Pause" }));
  await waitFor(() => assert.equal(complete, 1));
  await waitFor(() => assert.equal(view.getByRole("group").getAttribute("data-state"), "finished"));
  assert.ok(view.getByText("Time is up"));
  fireEvent.click(view.getByRole("button", { name: "Reset" }));
  assert.equal(view.getByRole("group").getAttribute("data-state"), "idle");
});

test("marquee loops two copies, hides the duplicate and pauses on request", () => {
  const view = render(
    <Marquee label="News">
      <a href="/one">One</a>
    </Marquee>,
  );
  const copies = view.container.querySelectorAll(".fux-marquee-copy");
  assert.equal(copies.length, 2);
  assert.equal(copies[1]!.getAttribute("aria-hidden"), "true");
  assert.equal(copies[1]!.hasAttribute("inert"), true);
  assert.equal(view.getAllByRole("link", { name: "One" }).length, 1);
  const group = view.getByRole("group", { name: "News" });
  fireEvent.click(view.getByRole("button", { name: "Pause motion" }));
  assert.equal(group.getAttribute("data-paused"), "true");
  assert.ok(
    view.getByRole("button", { name: "Resume motion" }).getAttribute("aria-pressed"),
    "true",
  );
});

test("carousel indicators name each slide and move the count", () => {
  const view = render(
    <Carousel label="Tips">
      <div>One</div>
      <div>Two</div>
      <div>Three</div>
    </Carousel>,
  );
  const dots = view.getAllByRole("button", { name: /^Go to slide/ });
  assert.equal(dots.length, 3);
  assert.equal(dots[0]!.getAttribute("aria-current"), "true");
  fireEvent.click(dots[2]!);
  assert.ok(view.getByText("3 / 3"));
  assert.equal(dots[2]!.getAttribute("aria-current"), "true");
  assert.equal((view.getByRole("button", { name: "Next" }) as HTMLButtonElement).disabled, true);
  fireEvent.click(view.getByRole("button", { name: "Previous" }));
  assert.ok(view.getByText("2 / 3"));
});

test("the new surfaces use logical properties only", () => {
  const view = render(
    <>
      <Toc items={[{ id: "a", label: "A" }]} />
      <Steps label="Steps" items={[{ id: "a", title: "A" }]} />
      <Pagination label="Pages" count={30} />
    </>,
  );
  const physical = /(?:^|\s)(?:ml|mr|pl|pr|left|right|text-left|text-right|border-l|border-r)-/;
  for (const element of Array.from(view.container.querySelectorAll("[class]")))
    assert.doesNotMatch(String(element.getAttribute("class")), physical);
});
