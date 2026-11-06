// Gallery demos: Collections, navigation and disclosure (collections.tsx).
import * as C from "@samhagman/fast-ux-kit/components";
import { example, click, input, key, options, tree, type ComponentFixture } from "./fixture-kit";

export const collectionsFixtures: Readonly<Record<string, ComponentFixture>> = {
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
  TagsInput: example(
    "Enter tags and remove them independently.",
    (s) => <C.TagsInput label="Tags" defaultValue={["planning"]} onValueChange={s.report} />,
    "input",
    [input("input", "design", ""), key("input", "Enter", ".fixture-status", "planning, design")],
  ),
};
