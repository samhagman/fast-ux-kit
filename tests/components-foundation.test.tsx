import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { Field, TextArea, NumberField, Editable, Toolbar, Form } from "../src/components/basic.js";
import {
  ListBox,
  ComboBox,
  GridList,
  Tree,
  NavigationTree,
  Table,
  TokenField,
  TagsInput,
  Breadcrumbs,
} from "../src/components/collections.js";
import {
  FileUpload,
  Timer,
  Carousel,
  JsonTreeView,
  NavigationMenu,
  SegmentGroup,
  Pagination,
} from "../src/components/specialized.js";

Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: true,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }),
});
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

function descriptions(element: HTMLElement) {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

test("field, textarea and number controls retain labels and error associations", () => {
  const view = render(
    <>
      <Field label="Title" hint="Short title" error="Title is required" />
      <TextArea label="Notes" hint="More detail" error="Notes are required" />
      <NumberField label="Count" defaultValue={2} hint="Whole number" error="Too few" />
    </>,
  );
  for (const [name, hint, error] of [
    ["Title", "Short title", "Title is required"],
    ["Notes", "More detail", "Notes are required"],
    ["Count", "Whole number", "Too few"],
  ]) {
    const input = view.getByLabelText(name!);
    assert.match(descriptions(input), new RegExp(hint!));
    assert.match(descriptions(input), new RegExp(error!));
    assert.equal(input.getAttribute("aria-invalid"), "true");
  }
});

test("editable commits once, escapes without commit and respects IME", async () => {
  const changes: string[] = [];
  const view = render(
    <Editable
      label="Title"
      defaultValue="Original"
      onValueChange={(value) => changes.push(value)}
    />,
  );
  fireEvent.click(view.getByRole("button"));
  fireEvent.change(view.getByRole("textbox"), { target: { value: "Changed" } });
  fireEvent.keyDown(view.getByRole("textbox"), { key: "Enter", isComposing: true });
  assert.ok(view.getByRole("textbox"));
  fireEvent.keyDown(view.getByRole("textbox"), { key: "Enter" });
  assert.deepEqual(changes, ["Changed"]);
  fireEvent.click(view.getByRole("button"));
  fireEvent.change(view.getByRole("textbox"), { target: { value: "Canceled" } });
  fireEvent.keyDown(view.getByRole("textbox"), { key: "Escape" });
  assert.deepEqual(changes, ["Changed"]);
  assert.equal(view.getByRole("button").textContent, "Changed");
});

const options = [
  { id: "a", label: "Alpha" },
  { id: "disabled", label: "Disabled", disabled: true },
  { id: "b", label: "Beta" },
  { id: "c", label: "Bravo" },
];
test("list selection supports ranges from the focused item, skips disabled and retains controlled values", () => {
  const selected: string[][] = [];
  const view = render(
    <ListBox
      label="Choices"
      options={options}
      multiple
      onValueChange={(ids) => selected.push([...ids])}
    />,
  );
  const rows = view.getAllByRole("option");
  act(() => rows[0]!.focus());
  fireEvent.keyDown(rows[0]!, { key: "ArrowDown", shiftKey: true });
  assert.deepEqual(selected.at(-1), ["a", "b"]);
  assert.equal(document.activeElement, rows[2]);
  fireEvent.keyDown(rows[2]!, { key: "a", ctrlKey: true });
  assert.deepEqual(selected.at(-1), ["a", "b", "c"]);
  view.rerender(
    <ListBox
      label="Choices"
      options={options}
      value={["a"]}
      onValueChange={(ids) => selected.push([...ids])}
    />,
  );
  fireEvent.click(rows[2]!);
  assert.equal(rows[0]!.getAttribute("aria-selected"), "true");
  assert.equal(rows[2]!.getAttribute("aria-selected"), "false");
});

test("grid item controls do not change row selection", () => {
  const selected: string[][] = [];
  const view = render(
    <GridList
      label="Items"
      items={options}
      onValueChange={(ids) => selected.push([...ids])}
      renderItem={(item) => <button>{item.label}</button>}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Beta" }));
  assert.equal(selected.length, 0);
});

test("tree disclosure works with pointers and keys, disabled branches stay closed", () => {
  const view = render(
    <Tree
      label="Tree"
      items={[
        { id: "root", label: "Root", children: [{ id: "child", label: "Child" }] },
        { id: "off", label: "Off", disabled: true, children: [{ id: "hidden", label: "Hidden" }] },
      ]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Expand Root" }));
  assert.equal(view.getAllByRole("treeitem").length, 3);
  const root = view.getByRole("treeitem", { name: /Root/ });
  fireEvent.keyDown(root, { key: "ArrowRight" });
  assert.match(document.activeElement?.textContent ?? "", /Child/);
  fireEvent.keyDown(view.getByRole("treeitem", { name: /Off/ }), { key: "ArrowRight" });
  assert.equal(view.queryByRole("treeitem", { name: /Hidden/ }), null);
  fireEvent.keyDown(document.activeElement!, { key: "ArrowLeft" });
  assert.equal(document.activeElement, root);
});

test("table sorting uses actual field values and selectable rows have grid semantics", () => {
  const selected: string[][] = [];
  const view = render(
    <Table
      label="People"
      rows={[
        { id: "two", rank: 2 },
        { id: "one", rank: 1 },
      ]}
      columns={[
        {
          id: "rank",
          label: "Rank",
          allowsSorting: true,
          isRowHeader: true,
          render: (row) => row.rank,
        },
      ]}
      onValueChange={(ids) => selected.push([...ids])}
    />,
  );
  assert.ok(view.getByRole("grid", { name: "People" }));
  fireEvent.click(view.getByRole("button", { name: /Rank/ }));
  assert.equal(view.getAllByRole("rowheader")[0]!.textContent, "1");
  const rows = view.getAllByRole("row");
  act(() => rows[1]!.focus());
  fireEvent.keyDown(rows[1]!, { key: "ArrowDown" });
  assert.deepEqual(selected.at(-1), ["two"]);
  fireEvent.click(view.getByRole("button", { name: /Rank/ }));
  assert.equal(view.getAllByRole("rowheader")[0]!.textContent, "2");
});

test("structured tokens retain ids and form values while plain tags remain strings", () => {
  const selected: unknown[] = [];
  const view = render(
    <>
      <TokenField
        label="Recipients"
        name="recipient"
        suggestions={[{ id: "u42", label: "Taylor", value: "person@example.test" }]}
        onValueChange={(tokens) => selected.push(tokens)}
      />
      <TagsInput label="Tags" />
    </>,
  );
  const input = view.getByRole("combobox", { name: "Recipients" });
  fireEvent.change(input, { target: { value: "Taylor" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(selected.at(-1), [{ id: "u42", label: "Taylor", value: "person@example.test" }]);
  assert.equal(
    view.container.querySelector<HTMLInputElement>('input[type="hidden"]')?.value,
    "person@example.test",
  );
  fireEvent.click(view.getByRole("button", { name: "Remove Taylor" }));
  assert.deepEqual(selected.at(-1), []);
  fireEvent.change(view.getByRole("combobox", { name: "Tags" }), { target: { value: "work" } });
  fireEvent.keyDown(view.getByRole("combobox", { name: "Tags" }), { key: "Enter" });
  assert.ok(view.getByRole("button", { name: "Remove work" }));
});

test("upload accumulates within limits and rejected selections keep existing files", () => {
  const changes: File[][] = [];
  const view = render(
    <FileUpload
      label="Upload"
      multiple
      maxFiles={2}
      accept="image/png"
      onFilesChange={(files) => changes.push([...files])}
    />,
  );
  const zone = view.getByRole("group", { name: "Upload" });
  const png = (name: string) => new dom.window.File(["data"], name, { type: "image/png" });
  const first = png("first.png");
  fireEvent.drop(zone, { dataTransfer: { files: [first] } });
  fireEvent.drop(zone, { dataTransfer: { files: [png("second.png"), png("third.png")] } });
  assert.deepEqual(
    changes.at(-1)?.map((file) => file.name),
    ["first.png", "second.png"],
  );
  assert.match(view.getByRole("alert").textContent ?? "", /third.png/);
  fireEvent.drop(zone, {
    dataTransfer: { files: [new dom.window.File(["text"], "bad.txt", { type: "text/plain" })] },
  });
  assert.deepEqual(
    changes.at(-1)?.map((file) => file.name),
    ["first.png", "second.png"],
  );
  assert.ok(view.getByText("first.png"));
});

test("timer pauses, resets duration and completes only its active run", async () => {
  let complete = 0;
  const view = render(<Timer label="Countdown" seconds={0.12} onComplete={() => complete++} />);
  fireEvent.click(view.getByRole("button", { name: "Start" }));
  fireEvent.click(view.getByRole("button", { name: "Pause" }));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 180));
  });
  assert.equal(complete, 0);
  view.rerender(<Timer label="Countdown" seconds={0.05} onComplete={() => complete++} />);
  fireEvent.click(view.getByRole("button", { name: "Start" }));
  await waitFor(() => assert.equal(complete, 1));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });
  assert.equal(complete, 1);
  assert.equal((view.getByRole("button", { name: "Start" }) as HTMLButtonElement).disabled, true);
});

test("carousel supports RTL keyboard navigation without stealing descendant input keys", () => {
  const view = render(
    <Carousel label="Gallery">
      <div>First</div>
      <input aria-label="Caption" />
      <div>Third</div>
    </Carousel>,
  );
  const viewport = view.getByLabelText("Gallery slides");
  viewport.style.direction = "rtl";
  act(() => viewport.focus());
  fireEvent.keyDown(viewport, { key: "ArrowLeft" });
  assert.equal(view.getByText("2 / 3").textContent, "2 / 3");
  fireEvent.keyDown(view.getByRole("textbox"), { key: "ArrowLeft" });
  assert.ok(view.getByText("2 / 3"));
  fireEvent.keyDown(viewport, { key: "End" });
  assert.ok(view.getByText("3 / 3"));
});

test("navigation surfaces expose native safe links and JSON accepts an object value", () => {
  const view = render(
    <>
      <NavigationTree label="Navigation" items={[{ id: "docs", label: "Docs", href: "/docs" }]} />
      <Breadcrumbs
        items={[
          { id: "bad", label: "Bad", href: "javascript:alert(1)" },
          { id: "good", label: "Good", href: "/good" },
        ]}
      />
      <NavigationMenu label="Main" items={[{ id: "home", label: "Home", href: "/" }]} />
      <JsonTreeView value={{ key: "value" }} />
    </>,
  );
  assert.equal(view.getByRole("link", { name: "Docs" }).getAttribute("href"), "/docs");
  assert.equal(view.queryByRole("link", { name: "Bad" }), null);
  assert.equal(view.getByRole("link", { name: "Home" }).getAttribute("href"), "/");
  assert.ok(view.getByRole("tree", { name: "JSON" }));
  assert.match(
    renderToString(
      <Form>
        <Toolbar.Root aria-label="Editing">
          <Toolbar.Button>Save</Toolbar.Button>
        </Toolbar.Root>
      </Form>,
    ),
    /fux-row/,
  );
});

test("form submits named text and textarea fields with composed primitive classes", async () => {
  Object.defineProperty(globalThis, "FormData", { value: dom.window.FormData, configurable: true });
  let submitted: Record<string, unknown> | undefined;
  const formRef = React.createRef<HTMLFormElement>();
  const view = render(
    <Form
      ref={formRef}
      className={() => "custom-form"}
      onFormSubmit={(values) => {
        submitted = values;
      }}
    >
      <Field label="Subject" name="subject" defaultValue="Hello" />
      <TextArea label="Body" name="body" defaultValue="Longer text" />
      <button type="submit">Send</button>
    </Form>,
  );
  assert.equal(formRef.current, view.container.querySelector("form"));
  assert.ok(formRef.current?.classList.contains("fux-field"));
  assert.ok(formRef.current?.classList.contains("custom-form"));
  fireEvent.submit(formRef.current!);
  await waitFor(() => assert.deepEqual(submitted, { subject: "Hello", body: "Longer text" }));
});

test("toolbar keeps native ref, state styles and roving keyboard behavior", async () => {
  const first = React.createRef<HTMLButtonElement>();
  const view = render(
    <Toolbar.Root aria-label="Format" className={(state) => `toolbar-${state.orientation}`}>
      <Toolbar.Button ref={first} className={(state) => (state.disabled ? "off" : "on")}>
        Bold
      </Toolbar.Button>
      <Toolbar.Button>Italic</Toolbar.Button>
    </Toolbar.Root>,
  );
  assert.ok(view.getByRole("toolbar").classList.contains("fux-row"));
  assert.ok(view.getByRole("toolbar").classList.contains("toolbar-horizontal"));
  assert.equal(first.current, view.getByRole("button", { name: "Bold" }));
  assert.ok(first.current?.classList.contains("fux-control"));
  assert.ok(first.current?.classList.contains("on"));
  act(() => first.current?.focus());
  fireEvent.keyDown(first.current!, { key: "ArrowRight" });
  await waitFor(() => assert.equal(document.activeElement?.textContent, "Italic"));
});

test("collection restores removed focused items without stealing outside focus", () => {
  const view = render(
    <>
      <ListBox label="Rows" options={options} />
      <button>Outside</button>
    </>,
  );
  act(() => view.getByRole("option", { name: "Beta" }).focus());
  view.rerender(
    <>
      <ListBox label="Rows" options={options.filter((item) => item.id !== "b")} />
      <button>Outside</button>
    </>,
  );
  assert.equal(document.activeElement, view.getByRole("option", { name: "Alpha" }));
  act(() => view.getByRole("button", { name: "Outside" }).focus());
  view.rerender(
    <>
      <ListBox label="Rows" options={options.filter((item) => item.id === "c")} />
      <button>Outside</button>
    </>,
  );
  assert.equal(document.activeElement, view.getByRole("button", { name: "Outside" }));
});

test("token creation skips empty text and associates rejected values with its input", () => {
  const created: string[] = [];
  const view = render(
    <TokenField
      label="People"
      createToken={(text) => {
        created.push(text);
        return null;
      }}
    />,
  );
  // No suggestions: a plain text field (it offers no list to choose from).
  const input = view.getByRole("textbox", { name: "People" });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(created, []);
  fireEvent.change(input, { target: { value: "Unknown" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(created, ["Unknown"]);
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(descriptions(input), /Choose an available token/);
});

test("segment selection stays singular and cannot be cleared by pressing the active segment", () => {
  const changes: string[] = [];
  const view = render(
    <SegmentGroup
      label="View"
      defaultValue="list"
      items={[
        { id: "list", label: "List" },
        { id: "grid", label: "Grid" },
      ]}
      onValueChange={(value) => changes.push(value)}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Grid" }));
  fireEvent.click(view.getByRole("button", { name: "Grid" }));
  assert.equal(view.getByRole("button", { name: "Grid" }).getAttribute("aria-pressed"), "true");
  assert.equal(view.getByRole("button", { name: "List" }).getAttribute("aria-pressed"), "false");
  assert.deepEqual(changes, ["grid"]);
});

test("combobox label identifies the editable input", () => {
  const view = render(<ComboBox label="Project stage" options={options} />);
  const input = view.getByRole("combobox", { name: "Project stage" });
  assert.equal(input.tagName, "INPUT");
  fireEvent.click(view.getByText("Project stage", { selector: "label" }));
  assert.equal(
    view.getByRole("button", { name: "Show options" }).getAttribute("aria-label"),
    "Show options",
  );
});

test("pagination wraps narrow layouts while preserving page selection", () => {
  const values: number[] = [];
  const view = render(
    <Pagination label="Results" count={50} onPageChange={(page) => values.push(page)} />,
  );
  assert.equal(view.getByRole("navigation", { name: "Results" }).style.flexWrap, "wrap");
  fireEvent.click(view.getByRole("button", { name: "Page 2" }));
  fireEvent.click(view.getByRole("button", { name: "Next" }));
  assert.deepEqual(values, [2, 3]);
  assert.equal(view.getByRole("button", { name: "Page 3" }).getAttribute("aria-current"), "page");
});
