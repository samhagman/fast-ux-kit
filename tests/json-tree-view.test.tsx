import { browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { JsonTreeView } from "../src/components/specialized.js";

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

const machine = {
  initial: "draft",
  states: {
    draft: { on: { SUBMIT: "review" } },
    review: { on: { APPROVE: "done", REJECT: "draft" } },
    done: { type: "final" },
  },
  tags: ["a"],
  pair: ["a", "b"],
  rows: [{ id: 1 }],
  empty: {},
  none: [],
};
/** Every path in a value, so the whole tree renders open. */
function allIds(value: unknown, path = "$"): string[] {
  if (value === null || typeof value !== "object") return [path];
  return [
    path,
    ...Object.entries(value).flatMap(([key, entry]) => allIds(entry, `${path}/${key}`)),
  ];
}
const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[role="treeitem"]'));
/** Level, visible text and a `+` for an expandable row. The screen-reader copy is left out. */
const rowText = (container: HTMLElement) =>
  rows(container).map((row) => {
    const visible = row.cloneNode(true) as HTMLElement;
    visible.querySelectorAll(".sr-only").forEach((node) => node.remove());
    const open = row.hasAttribute("aria-expanded") ? " +" : "";
    return `${row.getAttribute("aria-level")} ${visible.textContent}${open}`;
  });
const counts = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-json-part="count"]')).map(
    (node) => node.textContent,
  );

test("json tree view shows key counts by default and renders none when they are off", () => {
  const view = render(
    <JsonTreeView value={machine} label="Machine" defaultExpandedIds={["$", "$/states"]} />,
  );
  assert.deepEqual(counts(view.container), [
    "7 keys",
    "3 keys",
    "1 key",
    "1 key",
    "1 key",
    "1 item",
    "2 items",
    "1 item",
    "0 keys",
    "0 items",
  ]);
  assert.ok(view.getByRole("button", { name: "Collapse Machine {7}" }));
  view.rerender(
    <JsonTreeView
      value={machine}
      label="Machine"
      defaultExpandedIds={["$", "$/states"]}
      showCounts={false}
    />,
  );
  assert.equal(view.container.querySelector('[data-json-part="count"]'), null);
  assert.doesNotMatch(view.container.textContent ?? "", /\d+ (keys?|items?)/);
  // Nothing stands in for the count in the names either: no hidden text, no braces.
  assert.ok(view.getByRole("treeitem", { name: "Machine" }));
  assert.ok(view.getByRole("button", { name: "Collapse Machine" }));
  assert.ok(view.getByRole("button", { name: "Expand draft" }));
  assert.ok(view.getByRole("treeitem", { name: "draft" }));
  // Leaves keep their values.
  assert.ok(view.getByRole("treeitem", { name: 'initial "draft"' }));
});

test("json tree view keeps every object expandable unless small values are inlined", () => {
  const view = render(
    <JsonTreeView value={machine} label="Machine" defaultExpandedIds={allIds(machine)} />,
  );
  assert.equal(rows(view.container).length, 22);
  const draft = view.getByRole("treeitem", { name: "draft 1 key" });
  assert.equal(draft.getAttribute("aria-expanded"), "true");
  assert.equal(view.container.querySelector('[data-json-part="inline"]'), null);

  view.rerender(
    <JsonTreeView
      value={machine}
      label="Machine"
      defaultExpandedIds={allIds(machine)}
      inlineSmallValues
    />,
  );
  assert.deepEqual(rowText(view.container), [
    "1 Machine7 keys +",
    '2 initial:"draft"',
    "2 states3 keys +",
    '3 draft:{ on: { SUBMIT: "review" } }',
    "3 review1 key +",
    "4 on2 keys +",
    '5 APPROVE:"done"',
    '5 REJECT:"draft"',
    '3 done:{ type: "final" }',
    '2 tags:["a"]',
    "2 pair2 items +",
    '3 0:"a"',
    '3 1:"b"',
    "2 rows:[{ id: 1 }]",
    "2 empty0 keys",
    "2 none0 items",
  ]);
});

test("inline values are one leaf row with the leaf colouring hooks", () => {
  const view = render(
    <JsonTreeView
      value={machine}
      label="Machine"
      defaultExpandedIds={["$", "$/states"]}
      inlineSmallValues
    />,
  );
  const draft = view.getByRole("treeitem", { name: 'draft { on: { SUBMIT: "review" } }' });
  assert.equal(draft.hasAttribute("aria-expanded"), false);
  assert.equal(draft.querySelector("button"), null);
  const inline = draft.querySelector<HTMLElement>('[data-json-part="inline"]')!;
  assert.equal(inline.getAttribute("data-json-kind"), "object");
  assert.equal(inline.title, '{ on: { SUBMIT: "review" } }');
  // Isolated left to right, so a right-to-left tree cannot reorder its brackets and quotes.
  assert.equal(inline.getAttribute("dir"), "ltr");
  const parts = Array.from(inline.querySelectorAll("[data-json-part], [data-json-kind]")).map(
    (node) =>
      `${node.getAttribute("data-json-part") ?? node.getAttribute("data-json-kind")}=${node.textContent}`,
  );
  assert.deepEqual(parts, [
    "bracket={",
    "key=on",
    "colon=:",
    "bracket={",
    "key=SUBMIT",
    "colon=:",
    'string="review"',
    "bracket=}",
    "bracket=}",
  ]);
  // The parent's colon is the same hidden separator a plain leaf uses.
  assert.equal(
    draft.querySelector(':scope [data-json-part="colon"][aria-hidden]')?.textContent,
    ":",
  );
  const tags = view.getByRole("treeitem", { name: 'tags ["a"]' });
  assert.equal(
    tags.querySelector('[data-json-part="inline"]')?.getAttribute("data-json-kind"),
    "array",
  );
  assert.ok(view.getByRole("treeitem", { name: "rows [{ id: 1 }]" }));
});

test("inline values stop at three levels and forty characters", () => {
  const value = {
    three: { a: { b: { c: 1 } } },
    four: { a: { b: { c: { d: 1 } } } },
    short: { note: "x".repeat(28) },
    long: { note: "x".repeat(29) },
  };
  const view = render(
    <JsonTreeView
      value={value}
      label="Caps"
      defaultExpandedIds={allIds(value)}
      inlineSmallValues
    />,
  );
  assert.deepEqual(rowText(view.container), [
    "1 Caps4 keys +",
    "2 three:{ a: { b: { c: 1 } } }",
    "2 four1 key +",
    "3 a:{ b: { c: { d: 1 } } }",
    `2 short:{ note: "${"x".repeat(28)}" }`,
    "2 long1 key +",
    `3 note:"${"x".repeat(29)}"`,
  ]);
});

test("inline rows join the keyboard order as ordinary leaves", () => {
  const view = render(
    <JsonTreeView
      value={{ draft: { on: { SUBMIT: "review" } }, pair: [1, 2] }}
      label="Keys"
      defaultExpandedIds={["$"]}
      inlineSmallValues
    />,
  );
  const root = view.getByRole("treeitem", { name: "Keys 2 keys" });
  act(() => root.focus());
  fireEvent.keyDown(root, { key: "ArrowDown" });
  const draft = view.getByRole("treeitem", { name: 'draft { on: { SUBMIT: "review" } }' });
  assert.equal(document.activeElement, draft);
  // A leaf has nothing to open: the right arrow leaves the tree as it was.
  fireEvent.keyDown(draft, { key: "ArrowRight" });
  assert.equal(rows(view.container).length, 3);
  assert.equal(document.activeElement, draft);
  fireEvent.keyDown(draft, { key: "ArrowLeft" });
  assert.equal(document.activeElement, root);
  fireEvent.keyDown(root, { key: "End" });
  const pair = view.getByRole("treeitem", { name: "pair 2 items" });
  assert.equal(document.activeElement, pair);
  fireEvent.keyDown(pair, { key: "ArrowRight" });
  assert.equal(rows(view.container).length, 5);
});

test("default options render the same markup as before", () => {
  const ids = allIds(machine);
  const plain = renderToStaticMarkup(
    <JsonTreeView value={machine} label="Machine" defaultExpandedIds={ids} />,
  );
  const explicit = renderToStaticMarkup(
    <JsonTreeView
      value={machine}
      label="Machine"
      defaultExpandedIds={ids}
      showCounts
      inlineSmallValues={false}
    />,
  );
  assert.equal(plain, explicit);
  assert.doesNotMatch(plain, /data-json-part="(inline|bracket)"/);
  const view = render(<JsonTreeView value={machine} label="Machine" defaultExpandedIds={ids} />);
  assert.deepEqual(rowText(view.container), [
    "1 Machine7 keys +",
    '2 initial:"draft"',
    "2 states3 keys +",
    "3 draft1 key +",
    "4 on1 key +",
    '5 SUBMIT:"review"',
    "3 review1 key +",
    "4 on2 keys +",
    '5 APPROVE:"done"',
    '5 REJECT:"draft"',
    "3 done1 key +",
    '4 type:"final"',
    "2 tags1 item +",
    '3 0:"a"',
    "2 pair2 items +",
    '3 0:"a"',
    '3 1:"b"',
    "2 rows1 item +",
    "3 01 key +",
    "4 id:1",
    "2 empty0 keys",
    "2 none0 items",
  ]);
});
