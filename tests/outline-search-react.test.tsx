import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import type { OutlineNode } from "../src/core/index.js";

const { act, cleanup, fireEvent, render, within } = await import("@testing-library/react");
const { OutlineSearch } = await import("../src/react/OutlineSearch.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

const leaf = Object.freeze({
  id: "leaf",
  text: "Find needle",
  data: Object.freeze({ note: "Needle note\nSecond line <script>not executable</script>" }),
});
const branch = Object.freeze({
  id: "branch",
  text: "Research",
  children: Object.freeze([leaf, Object.freeze({ id: "other", text: "Other child" })]),
});
const doneChild = Object.freeze({ id: "done-child", text: "Needle in completed branch" });
const nodes: readonly OutlineNode[] = Object.freeze([
  branch,
  Object.freeze({
    id: "done",
    text: "Finished",
    checked: true,
    children: Object.freeze([doneChild]),
  }),
  Object.freeze({ id: "last", text: "Unrelated" }),
]);
function searchInput(view: ReturnType<typeof render>): HTMLInputElement {
  return view.getByRole("searchbox", { name: "Search outline" }) as HTMLInputElement;
}

test("read-first view is immutable and read-only; search keeps context and clearing restores ordinary folds", () => {
  const before = JSON.stringify(nodes);
  const view = render(
    <StrictMode>
      <OutlineSearch nodes={nodes} />
    </StrictMode>,
  );
  assert.ok(view.getByText("Unrelated"));
  assert.equal(view.container.querySelector("[contenteditable]"), null);
  assert.equal(view.queryByRole("textbox"), null);
  assert.equal(view.queryByRole("button", { name: /edit/i }), null);
  fireEvent.click(view.getByRole("button", { name: "Collapse Research" }));
  assert.equal(view.queryByText("Other child"), null);
  fireEvent.change(searchInput(view), { target: { value: "needle" } });
  assert.match(view.getByRole("status").textContent!, /2 results/);
  assert.equal(view.queryByText("Unrelated"), null);
  assert.equal(view.queryByText("Other child"), null);
  assert.ok(view.getByRole("button", { name: "Collapse Research" }));
  assert.equal(view.container.querySelectorAll('[data-search-kind="context"]').length, 2);
  assert.ok(view.container.querySelector("mark")?.textContent?.toLowerCase().includes("needle"));
  fireEvent.click(view.getByRole("button", { name: "Collapse Research" }));
  fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  assert.ok(view.getByRole("button", { name: "Expand Research" }));
  assert.ok(view.getByText("Unrelated"));
  assert.equal(view.queryByText("Other child"), null);
  assert.equal(document.activeElement, searchInput(view));
  assert.equal(JSON.stringify(nodes), before);
});

test("flat results show real paths and safe notes; reveal and trusted slots use canonical identities", () => {
  const seen: OutlineNode[] = [];
  const revealed: string[] = [];
  const view = render(
    <OutlineSearch
      nodes={nodes}
      defaultQuery="needle"
      defaultMode="flat"
      onReveal={(id) => revealed.push(id)}
      renderSuffix={(node) => {
        seen.push(node);
        return null;
      }}
    />,
  );
  assert.ok(view.getByRole("list", { name: "Search results" }));
  assert.deepEqual(
    view.getAllByLabelText("Ancestor path").map((element) => element.textContent),
    ["Research", "Finished"],
  );
  assert.ok(view.getByText(/Second line <script>not executable<\/script>/));
  assert.equal(view.container.querySelector("script"), null);
  fireEvent.click(view.getByRole("button", { name: "Reveal Find needle" }));
  assert.deepEqual(revealed, [leaf.id]);
  assert.ok(seen.includes(leaf));
  assert.ok(seen.includes(doneChild));
  assert.ok(seen.every((node) => node === leaf || node === doneChild));
});

test("projected context rows never leak through trusted getters or render slots", () => {
  const seen: OutlineNode[] = [];
  const check = (node: OutlineNode) => {
    seen.push(node);
    return undefined;
  };
  const view = render(
    <OutlineSearch
      nodes={nodes}
      defaultQuery="in:title needle"
      getRichContent={check}
      renderBody={check}
      renderAccessory={check}
      renderStatus={check}
      renderSuffix={check}
      getDisclosureLabel={(node, expanded) => {
        seen.push(node);
        return `${expanded ? "Close" : "Open"} ${node.text}`;
      }}
    />,
  );
  assert.ok(view.getByRole("button", { name: "Close Research" }));
  assert.ok(seen.includes(branch));
  assert.equal(
    seen.find((node) => node.id === branch.id),
    branch,
  );
  const canonical = new Set<OutlineNode>([branch, leaf, doneChild, nodes[1]!]);
  assert.ok(seen.every((node) => canonical.has(node)));
});

test("invalid query, no results, and absent scope fail without showing an unfiltered document", () => {
  const view = render(<OutlineSearch nodes={nodes} defaultQuery={'"not closed'} />);
  assert.match(view.getByRole("status").textContent!, /invalid query/i);
  assert.equal(view.queryByText("Unrelated"), null);
  assert.equal(searchInput(view).getAttribute("aria-invalid"), "true");
  fireEvent.change(searchInput(view), { target: { value: "absent-term" } });
  assert.ok(view.getByText("No results in this view."));
  assert.match(view.getByRole("status").textContent!, /0 results/);
  view.rerender(<OutlineSearch nodes={nodes} scopeId="missing" />);
  assert.match(view.getByRole("status").textContent!, /scope was not found/);
  assert.equal(view.queryByText("Unrelated"), null);
});

test("note display and completed filters remain local and never alter search metadata", () => {
  const view = render(<OutlineSearch nodes={nodes} defaultQuery="in:note needle" />);
  assert.match(view.getByRole("status").textContent!, /1 result/);
  fireEvent.click(view.getByRole("button", { name: "Hide notes" }));
  assert.equal(view.queryByText(/Second line/), null);
  assert.match(view.getByRole("status").textContent!, /1 result/);
  fireEvent.click(view.getByRole("button", { name: "First-line notes" }));
  assert.match(
    view.container.querySelector(".fast-ux-outline-search__note")?.textContent ?? "",
    /Needle note/,
  );
  assert.equal(view.queryByText(/Second line/), null);
  fireEvent.click(view.getByRole("button", { name: "Show notes" }));
  assert.ok(view.getByText(/Second line/));
  fireEvent.change(searchInput(view), { target: { value: "needle" } });
  fireEvent.click(view.getByRole("button", { name: "Hide completed" }));
  assert.match(view.getByRole("status").textContent!, /1 result/);
  assert.equal(view.queryByRole("button", { name: "Collapse Finished" }), null);
  assert.equal(leaf.data.note.includes("Second line"), true);
  assert.equal(nodes[1]?.checked, true);
});

test("controlled query and mode request changes but do not take ownership", () => {
  const changed: string[] = [];
  const modes: string[] = [];
  const view = render(
    <OutlineSearch
      nodes={nodes}
      query="needle"
      mode="context"
      onQueryChange={(value) => changed.push(value)}
      onModeChange={(value) => modes.push(value)}
    />,
  );
  fireEvent.change(searchInput(view), { target: { value: "other" } });
  assert.deepEqual(changed, ["other"]);
  assert.equal(searchInput(view).value, "needle");
  fireEvent.keyDown(searchInput(view), { key: "Enter", shiftKey: true });
  assert.deepEqual(modes, ["flat"]);
  assert.equal(view.queryByRole("list", { name: "Search results" }), null);
  view.rerender(<OutlineSearch nodes={nodes} query="other" mode="flat" />);
  assert.ok(view.getByRole("list", { name: "Search results" }));
  assert.match(view.getByRole("status").textContent!, /1 result/);
});

test("keyboard behavior belongs only to its input; two instances remain independent", () => {
  const view = render(
    <>
      <OutlineSearch nodes={nodes} label="First" />
      <OutlineSearch nodes={nodes} label="Second" defaultQuery="other" />
    </>,
  );
  const first = within(view.getByRole("region", { name: "First" }));
  const second = within(view.getByRole("region", { name: "Second" }));
  const input = first.getByRole("searchbox") as HTMLInputElement;
  fireEvent.change(input, { target: { value: "needle" } });
  act(() => input.focus());
  fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
  assert.ok(first.getByRole("list", { name: "Search results" }));
  fireEvent.keyDown(input, { key: "Escape" });
  assert.equal(input.value, "");
  assert.equal(document.activeElement, input);
  assert.equal((second.getByRole("searchbox") as HTMLInputElement).value, "other");
  assert.match(second.getByRole("status").textContent!, /1 result/);
  fireEvent.change(input, { target: { value: "needle" } });
  fireEvent.keyDown(document.body, { key: "Escape" });
  assert.equal(input.value, "needle");
  fireEvent.keyDown(input, { key: "Escape", isComposing: true, keyCode: 229 });
  assert.equal(input.value, "needle");
  assert.notEqual(
    input.getAttribute("aria-describedby"),
    second.getByRole("searchbox").getAttribute("aria-describedby"),
  );
});

test("optional everywhere action is host-owned and omitted by default", () => {
  const calls: string[] = [];
  const view = render(<OutlineSearch nodes={nodes} defaultQuery="needle" />);
  assert.equal(view.queryByRole("button", { name: "Search everywhere" }), null);
  view.rerender(
    <OutlineSearch
      nodes={nodes}
      defaultQuery="needle"
      onSearchEverywhere={(value) => calls.push(value)}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Search everywhere" }));
  assert.deepEqual(calls, ["needle"]);
});

test("scope includes its root; empty query stays a reader even in flat mode", () => {
  const view = render(<OutlineSearch nodes={nodes} scopeId="branch" defaultMode="flat" />);
  assert.ok(view.getByRole("region", { name: "Outline results" }));
  assert.ok(view.getByText("Research"));
  assert.ok(view.getByText("Other child"));
  assert.equal(view.queryByText("Unrelated"), null);
});

test("bounded search reports partial results instead of promising an exhaustive count", () => {
  const many: OutlineNode[] = Array.from({ length: 1001 }, (_, index) => ({
    id: `row-${index}`,
    text: "needle",
  }));
  const view = render(<OutlineSearch nodes={many} defaultQuery="needle" defaultMode="flat" />);
  assert.match(view.getByRole("status").textContent!, /1000 results \(partial\)/);
  assert.ok(view.getByText(/Search results or highlights are incomplete/));
});

test("server rendering emits safe read-only initial results", () => {
  const html = renderToString(<OutlineSearch nodes={nodes} defaultQuery="needle" />);
  assert.match(html, /data-read-only="true"/);
  assert.match(html, /Search outline/);
  assert.match(html, /2 results/);
  assert.doesNotMatch(html, /contentEditable|<script/i);
  assert.equal(JSON.stringify(nodes).includes("Needle note"), true);
});

test("metadata checkbox/completion overrides apply consistently in both reader modes", () => {
  const override = Object.freeze({
    id: "override",
    text: "Needle overridden",
    checked: true,
    data: Object.freeze({ completed: false, checkbox: false }),
  });
  const plain = Object.freeze({
    id: "plain",
    text: "Needle plain",
    data: Object.freeze({ completed: true, checkbox: false }),
  });
  const task = Object.freeze({
    id: "task",
    text: "Needle task",
    checked: true,
    data: Object.freeze({ completed: false, checkbox: true }),
  });
  const original: readonly OutlineNode[] = Object.freeze([override, plain, task]);
  const seen: OutlineNode[] = [];
  const view = render(
    <OutlineSearch
      nodes={original}
      defaultQuery="needle"
      renderStatus={(node) => {
        seen.push(node);
        return <span>Custom {node.id}</span>;
      }}
    />,
  );
  assert.equal(view.queryByRole("img", { name: "Completed task" }), null);
  assert.ok(view.getByRole("img", { name: "Incomplete task" }));
  assert.ok(view.getByRole("img", { name: "Completed item" }));
  assert.ok(view.getByText("Custom override"));
  assert.ok(seen.includes(override));
  assert.equal(override.checked, true);
  fireEvent.click(view.getByRole("button", { name: "Flat results" }));
  assert.equal(view.queryByRole("img", { name: "Completed task" }), null);
  assert.ok(view.getByRole("img", { name: "Incomplete task" }));
  assert.ok(view.getByRole("img", { name: "Completed item" }));
  assert.ok(view.getByText("Custom plain"));
  fireEvent.click(view.getByRole("button", { name: "Hide completed" }));
  assert.equal(view.queryByRole("img", { name: "Completed item" }), null);
  assert.match(view.getByRole("status").textContent!, /2 results/);
  assert.equal(override.data.completed, false);
  assert.equal(plain.data.completed, true);
});

test("first-line notes recognize every portable logical line separator without hiding search text", () => {
  for (const separator of ["\r\n", "\r", "\n", "\u2028", "\u2029"]) {
    const local: OutlineNode[] = [
      { id: "line", text: "Line separators", data: { note: `First${separator}Needle second` } },
    ];
    const view = render(
      <OutlineSearch nodes={local} defaultQuery="in:note needle" defaultNoteMode="first-line" />,
    );
    assert.equal(
      view.container.querySelector(".fast-ux-outline-search__note")?.textContent,
      "First",
    );
    assert.match(view.getByRole("status").textContent!, /1 result/);
    fireEvent.click(view.getByRole("button", { name: "Show notes" }));
    assert.equal(
      view.container.querySelector(".fast-ux-outline-search__note")?.textContent,
      `First${separator}Needle second`,
    );
    view.unmount();
  }
});

const additionalLeaf = Object.freeze({ id: "additional-leaf", text: "Deep detail" });
const additionalBranch = Object.freeze({
  id: "additional-branch",
  text: "Extra branch",
  children: Object.freeze([additionalLeaf]),
});
const matchingChild = Object.freeze({ id: "matching-child", text: "Needle child" });
const completedExtra = Object.freeze({
  id: "completed-extra",
  text: "Finished extra",
  checked: true,
  children: Object.freeze([Object.freeze({ id: "completed-descendant", text: "Hidden below" })]),
});
const matchingParent = Object.freeze({
  id: "matching-parent",
  text: "Needle parent",
  children: Object.freeze([additionalBranch, matchingChild, completedExtra]),
});
const additionalNodes: readonly OutlineNode[] = Object.freeze([matchingParent]);

test("context search reveals immediate children one level at a time without changing matches or canonical identities", () => {
  const before = JSON.stringify(additionalNodes);
  const seen: OutlineNode[] = [];
  const revealed: string[] = [];
  const view = render(
    <OutlineSearch
      nodes={additionalNodes}
      defaultQuery="needle"
      renderAccessory={(node) => {
        seen.push(node);
        return null;
      }}
      getRichContent={(node) => {
        seen.push(node);
        return undefined;
      }}
      onReveal={(id) => revealed.push(id)}
    />,
  );
  assert.equal(view.queryByText("Extra branch"), null);
  assert.equal(view.queryByText("Deep detail"), null);
  const originalHighlightCount = view.container.querySelectorAll("mark").length;
  fireEvent.click(view.getByRole("button", { name: "Collapse Needle parent" }));
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  assert.ok(view.getByRole("button", { name: "Collapse Needle parent" }));
  assert.ok(view.getByText("Extra branch"));
  assert.equal(view.queryByText("Deep detail"), null);
  assert.equal(
    view.container.querySelector(
      '[data-node-id="additional-branch"] [data-search-kind="additional"]',
    )?.textContent,
    "Extra branch",
  );
  assert.match(view.getByRole("status").textContent!, /2 results/);
  assert.equal(view.container.querySelectorAll("mark").length, originalHighlightCount);
  assert.equal(searchInput(view).value, "needle");
  fireEvent.click(view.getByRole("button", { name: "Show all children of Extra branch" }));
  assert.ok(view.getByText("Deep detail"));
  assert.ok(view.getByRole("button", { name: "Collapse Extra branch" }));
  fireEvent.click(view.getByRole("button", { name: "Reveal Deep detail" }));
  assert.deepEqual(revealed, [additionalLeaf.id]);
  assert.ok(seen.includes(additionalBranch));
  assert.ok(seen.includes(additionalLeaf));
  const originals = new Set<OutlineNode>([
    matchingParent,
    additionalBranch,
    additionalLeaf,
    matchingChild,
    completedExtra,
  ]);
  assert.ok(seen.every((node) => originals.has(node)));
  assert.equal(view.container.querySelector("[contenteditable]"), null);
  assert.equal(JSON.stringify(additionalNodes), before);
});

test("hiding additional context retains true match paths and forgets deeper reveal requests", () => {
  const view = render(<OutlineSearch nodes={additionalNodes} defaultQuery="needle" />);
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  fireEvent.click(view.getByRole("button", { name: "Show all children of Extra branch" }));
  fireEvent.click(view.getByRole("button", { name: "Hide additional children of Needle parent" }));
  assert.equal(view.queryByText("Extra branch"), null);
  assert.equal(view.queryByText("Deep detail"), null);
  assert.ok(view.container.querySelector('[data-node-id="matching-child"]'));
  assert.match(view.getByRole("status").textContent!, /2 results/);
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  assert.ok(view.getByText("Extra branch"));
  assert.equal(view.queryByText("Deep detail"), null);
  fireEvent.click(view.getByRole("button", { name: "Flat results" }));
  assert.equal(view.queryByText("Extra branch"), null);
  assert.equal(
    view.queryByRole("button", { name: "Hide additional children of Needle parent" }),
    null,
  );
  assert.equal(view.getByRole("list", { name: "Search results" }).children.length, 2);
});

test("query changes and clearing reset additional context without disturbing ordinary folds", () => {
  const view = render(<OutlineSearch nodes={additionalNodes} />);
  fireEvent.click(view.getByRole("button", { name: "Collapse Needle parent" }));
  fireEvent.change(searchInput(view), { target: { value: "needle" } });
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  assert.ok(view.getByText("Extra branch"));
  fireEvent.change(searchInput(view), { target: { value: "parent" } });
  assert.equal(view.queryByText("Extra branch"), null);
  fireEvent.change(searchInput(view), { target: { value: "needle" } });
  assert.equal(view.queryByText("Extra branch"), null);
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  fireEvent.click(view.getByRole("button", { name: "Clear search" }));
  assert.ok(view.getByRole("button", { name: "Expand Needle parent" }));
  assert.equal(view.queryByRole("button", { name: "Show all children of Needle parent" }), null);
  assert.equal(document.activeElement, searchInput(view));
});

test("controlled query changes reset reveals, and completion-hidden branches stay excluded", () => {
  const view = render(
    <OutlineSearch nodes={additionalNodes} query="needle" defaultHideCompleted />,
  );
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  assert.ok(view.getByText("Extra branch"));
  assert.equal(view.queryByText("Finished extra"), null);
  assert.equal(view.queryByText("Hidden below"), null);
  fireEvent.click(view.getByRole("button", { name: "Collapse Needle parent" }));
  view.rerender(<OutlineSearch nodes={additionalNodes} query="parent" defaultHideCompleted />);
  view.rerender(<OutlineSearch nodes={additionalNodes} query="needle" defaultHideCompleted />);
  assert.ok(view.getByRole("button", { name: "Collapse Needle parent" }));
  assert.equal(view.queryByText("Extra branch"), null);
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle parent" }));
  assert.equal(view.queryByText("Finished extra"), null);
  assert.equal(completedExtra.checked, true);
});

test("additional-context controls cannot reveal siblings outside a search scope", () => {
  const view = render(
    <OutlineSearch nodes={additionalNodes} scopeId="matching-child" defaultQuery="needle" />,
  );
  assert.ok(view.container.querySelector('[data-node-id="matching-parent"]'));
  assert.equal(view.queryByRole("button", { name: "Show all children of Needle parent" }), null);
  assert.equal(view.queryByText("Extra branch"), null);
});

test("hiding a revealed parent preserves nonmatching ancestors of deep true matches", () => {
  const deepMatch = Object.freeze({ id: "deep-match", text: "Needle deeper" });
  const pathAncestor = Object.freeze({
    id: "path-ancestor",
    text: "Required ancestor",
    children: Object.freeze([deepMatch]),
  });
  const extraSibling = Object.freeze({ id: "extra-sibling", text: "Optional sibling" });
  const local: readonly OutlineNode[] = Object.freeze([
    Object.freeze({
      id: "local-parent",
      text: "Needle top",
      children: Object.freeze([pathAncestor, extraSibling]),
    }),
  ]);
  const view = render(<OutlineSearch nodes={local} defaultQuery="needle" />);
  fireEvent.click(view.getByRole("button", { name: "Show all children of Needle top" }));
  assert.ok(view.getByText("Optional sibling"));
  fireEvent.click(view.getByRole("button", { name: "Hide additional children of Needle top" }));
  assert.equal(view.queryByText("Optional sibling"), null);
  assert.ok(view.getByText("Required ancestor"));
  assert.ok(view.container.querySelector('[data-node-id="deep-match"]'));
  assert.equal(
    view.container.querySelector('[data-node-id="path-ancestor"] [data-search-kind="context"]')
      ?.textContent,
    "Required ancestor",
  );
  assert.match(view.getByRole("status").textContent!, /2 results/);
});
