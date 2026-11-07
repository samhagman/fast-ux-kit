import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
  Breadcrumbs,
  ComboBox,
  Disclosure,
  DisclosureGroup,
  ListBox,
  Menu,
  Select,
  Table,
  TagGroup,
  TagsInput,
  Tabs,
  TokenField,
  Tree,
  type TableColumn,
} from "../src/components/collections.js";

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
Object.defineProperty(globalThis, "DOMRect", { configurable: true, value: dom.window.DOMRect });
Object.defineProperty(dom.window.Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
Object.defineProperty(dom.window, "matchMedia", {
  configurable: true,
  value: (query: string) => ({
    matches: false,
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

interface Row {
  id: string;
  name: string;
  total: number;
}
const rows: Row[] = [
  { id: "a", name: "Alpha", total: 1200 },
  { id: "b", name: "Beta", total: 45.5 },
];
const columns: TableColumn<Row>[] = [
  { id: "name", label: "Name", allowsSorting: true, isRowHeader: true, render: (row) => row.name },
  {
    id: "total",
    label: "Total",
    allowsSorting: true,
    numeric: true,
    truncate: true,
    render: (row) => row.total,
  },
];

test("table header shows sort state with icons and aria-sort, and numbers align to the end", () => {
  const view = render(<Table label="Totals" rows={rows} columns={columns} />);
  const total = view.getByRole("columnheader", { name: /Total/ });
  assert.equal(total.getAttribute("aria-sort"), null);
  assert.ok(
    total.querySelector("svg[aria-hidden]"),
    "an unsorted column shows the sort affordance",
  );
  fireEvent.click(view.getByRole("button", { name: /Total/ }));
  assert.equal(total.getAttribute("aria-sort"), "ascending");
  fireEvent.click(view.getByRole("button", { name: /Total/ }));
  assert.equal(total.getAttribute("aria-sort"), "descending");
  assert.equal(view.getAllByRole("rowheader")[0]!.textContent, "Alpha");
  assert.ok(total.classList.contains("text-end"));
  const cell = view.getAllByRole("cell")[0]!;
  assert.ok(cell.classList.contains("tabular-nums"));
  assert.ok(cell.classList.contains("truncate"));
});

test("table header sticks by default and density, height and empty state are configurable", () => {
  const view = render(
    <Table label="Totals" rows={rows} columns={columns} density="compact" maxHeight={200} />,
  );
  assert.ok(view.container.querySelector("thead")!.classList.contains("sticky"));
  assert.equal(
    view.container.querySelector<HTMLElement>(".fux-table-scroll")!.style.maxBlockSize,
    "200px",
  );
  assert.ok(view.getAllByRole("cell")[0]!.classList.contains("h-8"));
  view.rerender(<Table label="Totals" rows={[]} columns={columns} stickyHeader={false} />);
  assert.ok(!view.container.querySelector("thead")!.classList.contains("sticky"));
  assert.match(view.container.textContent ?? "", /No rows/);
  assert.ok(view.container.querySelector("tbody svg[aria-hidden]"), "empty state carries an icon");
});

test("table loading state hides data and marks the table busy", () => {
  const view = render(<Table label="Totals" rows={rows} columns={columns} loading />);
  assert.equal(
    view.container.querySelector(".fux-table-scroll")!.getAttribute("aria-busy"),
    "true",
  );
  assert.equal(view.queryByText("Alpha"), null);
  assert.equal(view.container.querySelectorAll("tbody tr").length, 3);
});

test("tree rows carry icons, indentation guides and a disclosure that keeps its hit-area class", () => {
  const items = [
    {
      id: "root",
      label: "Root",
      description: "2",
      children: [{ id: "child", label: "Child", icon: <span data-testid="own-icon" /> }],
    },
  ];
  const view = render(<Tree label="Files" items={items} defaultExpandedIds={["root"]} />);
  const [root, child] = view.getAllByRole("treeitem");
  assert.equal(root!.querySelectorAll(".fux-tree-guide").length, 0);
  assert.equal(child!.querySelectorAll(".fux-tree-guide").length, 1);
  assert.ok(root!.querySelector(".fux-tree-icon svg"), "branches get a folder icon");
  assert.ok(child!.querySelector("[data-testid=own-icon]"), "a node's own icon wins");
  assert.ok(root!.querySelector("button.fux-tree-disclosure svg[aria-hidden]"));
  assert.ok(child!.querySelector("span.fux-tree-disclosure"), "leaves keep the same column");
  assert.equal(root!.querySelector(".fux-tree-trail")!.textContent, "2");
  view.rerender(
    <Tree label="Files" items={items} defaultExpandedIds={["root"]} showIcons={false} />,
  );
  assert.equal(view.getAllByRole("treeitem")[0]!.querySelector(".fux-tree-icon"), null);
});

test("tabs expose a variant, a sliding indicator slot and per-tab icon and badge", () => {
  const view = render(
    <Tabs
      label="Views"
      variant="underline"
      defaultValue="one"
      items={[
        {
          id: "one",
          label: "One",
          badge: 4,
          icon: <svg data-testid="tab-icon" />,
          content: "First",
        },
        { id: "two", label: "Two", content: "Second" },
      ]}
    />,
  );
  const list = view.getByRole("tablist", { name: "Views" });
  assert.equal(list.getAttribute("data-variant"), "underline");
  assert.equal(
    view.getByRole("tab", { name: /One/ }).querySelector(".fux-tab-badge")!.textContent,
    "4",
  );
  assert.ok(view.getByTestId("tab-icon"));
  fireEvent.click(view.getByRole("tab", { name: "Two" }));
  assert.ok(view.getByText("Second"));
  assert.equal(view.getByRole("tab", { name: "Two" }).getAttribute("aria-selected"), "true");
});

test("breadcrumb separators are decorative icons, never text, and the last item is the page", () => {
  const view = render(
    <Breadcrumbs
      items={[
        { id: "a", label: "Home", href: "/" },
        { id: "b", label: "Docs", href: "/docs" },
        { id: "c", label: "Page" },
      ]}
    />,
  );
  const nav = view.getByRole("navigation", { name: "Breadcrumbs" });
  assert.equal(nav.querySelectorAll("li svg[aria-hidden]").length, 2);
  assert.ok(!(nav.textContent ?? "").includes("/"));
  assert.equal(nav.querySelector("[aria-current=page]")!.textContent, "Page");
  assert.ok(nav.querySelector("ol")!.classList.contains("fux-breadcrumbs"));
});

test("disclosure toggles with a chevron and an accordion keeps its items", async () => {
  const view = render(
    <>
      <Disclosure title="More">Body</Disclosure>
      <DisclosureGroup
        defaultValue={["one"]}
        items={[
          { id: "one", title: "One", content: "First" },
          { id: "two", title: "Two", content: "Second", disabled: true },
        ]}
      />
    </>,
  );
  const more = view.getByRole("button", { name: "More" });
  assert.ok(more.querySelector("svg[aria-hidden]"));
  assert.equal(more.getAttribute("aria-expanded"), "false");
  fireEvent.click(more);
  await waitFor(() => assert.equal(more.getAttribute("aria-expanded"), "true"));
  assert.equal(view.getByRole("button", { name: "One" }).getAttribute("aria-expanded"), "true");
  assert.ok(view.getByRole("button", { name: "Two" }).hasAttribute("data-disabled"));
});

test("chips: tag groups remove with an icon button, show an empty state, tags input explains errors", () => {
  const removed: string[] = [];
  const view = render(
    <>
      <TagGroup label="Tags" tags={["a"]} onRemove={(tag) => removed.push(tag)} />
      <TagGroup label="None" tags={[]} emptyState="No tags yet" />
      <TagsInput label="Labels" placeholder="Add one" error="Too short" />
      <TokenField label="People" hint="Press Enter to add" placeholder="Name" />
    </>,
  );
  const remove = view.getByRole("button", { name: "Remove a" });
  assert.ok(remove.querySelector("svg[aria-hidden]"));
  assert.equal(remove.textContent, "");
  fireEvent.click(remove);
  assert.deepEqual(removed, ["a"]);
  assert.ok(view.getByText("No tags yet"));
  const labels = view.getByLabelText("Labels");
  assert.equal(labels.getAttribute("placeholder"), "Add one");
  assert.equal(labels.getAttribute("aria-invalid"), "true");
  assert.equal(
    document.getElementById(labels.getAttribute("aria-describedby")!)!.textContent,
    "Too short",
  );
  const people = view.getByLabelText("People");
  assert.equal(
    document.getElementById(people.getAttribute("aria-describedby")!)!.textContent,
    "Press Enter to add",
  );
});

const stages = [
  { id: "draft", label: "Draft", description: "Not shared", group: "Planning" },
  { id: "review", label: "In review", group: "Planning" },
  { id: "shipped", label: "Shipped", group: "Delivery", disabled: true },
];

test("list box groups options under labelled headings with separators between groups", () => {
  const view = render(<ListBox label="Stages" options={stages} defaultValue={["draft"]} />);
  const groups = view.getAllByRole("group");
  assert.equal(groups.length, 2);
  assert.equal(groups[0]!.getAttribute("aria-labelledby") ? true : false, true);
  assert.equal(
    document.getElementById(groups[1]!.getAttribute("aria-labelledby")!)!.textContent,
    "Delivery",
  );
  assert.equal(view.getAllByRole("separator").length, 1);
  assert.equal(view.getAllByRole("option").length, 3);
  assert.ok(view.getByText("Not shared"));
  assert.equal(view.getByRole("option", { name: /Draft/ }).getAttribute("aria-selected"), "true");
});

test("select shows group labels, descriptions and a check mark for the chosen option", async () => {
  const view = render(<Select label="Stage" options={stages} defaultValue="draft" />);
  fireEvent.click(view.getByRole("combobox"));
  await waitFor(() => assert.ok(document.querySelector("[role=listbox]")));
  assert.ok(view.getByText("Planning"));
  assert.ok(view.getByText("Delivery"));
  assert.ok(view.getByText("Not shared"));
  const chosen = view
    .getAllByRole("option")
    .find((option) => option.textContent?.includes("Draft"))!;
  assert.ok(chosen.querySelector("svg"), "the selected option carries a check icon");
});

test("combobox shows an empty state when nothing matches", async () => {
  const view = render(<ComboBox label="Stage" options={stages} emptyText="Nothing here" />);
  const input = view.getByRole("combobox", { name: "Stage" });
  fireEvent.click(view.getByRole("button", { name: "Show options" }));
  await waitFor(() => assert.ok(view.getAllByRole("option").length >= 3));
  fireEvent.change(input, { target: { value: "zzzz" } });
  await waitFor(() => assert.ok(view.getByText("Nothing here")));
});

test("menu items carry icons, shortcuts, group labels and destructive styling", async () => {
  const view = render(
    <Menu
      label="Actions"
      items={[
        {
          id: "rename",
          label: "Rename",
          shortcut: "F2",
          group: "Edit",
          icon: <svg data-testid="i" />,
        },
        { id: "delete", label: "Delete", group: "Danger", destructive: true },
      ]}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: /Actions/ }));
  await waitFor(() => assert.ok(view.getAllByRole("menuitem").length === 2));
  assert.ok(view.getByText("F2"));
  assert.ok(view.getByText("Edit"));
  assert.ok(view.getByText("Danger"));
  assert.ok(view.getByTestId("i"));
  assert.equal(
    view.getByRole("menuitem", { name: "Delete" }).getAttribute("data-variant"),
    "destructive",
  );
});
