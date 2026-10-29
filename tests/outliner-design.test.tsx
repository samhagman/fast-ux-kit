import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { readFileSync } from "node:fs";
import { createRef } from "react";
import { renderToString } from "react-dom/server";
import { browserErrors } from "./components-dom.js";
import type { OutlineNode } from "../src/core/index.js";
import { importMarkdownDocument } from "../src/rich/index.js";
import type { OutlineEditorHandle } from "../src/react/OutlineEditor.js";

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { Outliner, OutlineEditor } = await import("../src/react/index.js");
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

const nodes: readonly OutlineNode[] = [
  {
    id: "project",
    text: "Project",
    children: [
      { id: "note", text: "A note" },
      { id: "task", text: "A task", checked: false },
    ],
  },
  { id: "other", text: "Another note" },
];

function row(container: HTMLElement, id: string): HTMLElement {
  const item = container.querySelector(`[data-node-id="${id}"]`);
  const result = item?.querySelector<HTMLElement>(":scope > .fast-ux-outliner__row");
  assert.ok(result);
  return result;
}

test("reader branch, leaf and task titles share a leading gutter with independent end disclosures", () => {
  const view = render(<Outliner nodes={nodes} enableHoist />);
  for (const id of ["project", "note", "task", "other"]) {
    const element = row(view.container, id);
    assert.ok(element.firstElementChild?.classList.contains("fast-ux-outliner__gutter"));
    assert.equal(element.querySelectorAll(":scope > .fast-ux-outliner__gutter").length, 1);
    assert.ok(element.children[1]?.classList.contains("fast-ux-outliner__content"));
  }
  assert.equal(
    row(view.container, "project").lastElementChild,
    view.getByRole("button", { name: "Collapse Project" }),
  );
  const task = view.getByRole("img", { name: "Incomplete task" });
  assert.ok(task.closest(".fast-ux-outliner__gutter"));
  assert.equal(view.queryByRole("checkbox"), null, "task status is not an editing control");
  assert.equal(view.queryByRole("textbox"), null);
  for (const svg of view.container.querySelectorAll("svg")) {
    assert.equal(svg.getAttribute("aria-hidden"), "true");
    assert.equal(svg.getAttribute("focusable"), "false");
  }
});

test("start disclosure occupies the gutter without losing task status or duplicating controls", () => {
  const view = render(
    <Outliner nodes={[{ ...nodes[0]!, checked: true }]} disclosurePosition="start" />,
  );
  const disclosure = view.getByRole("button", { name: "Collapse Project" });
  assert.ok(disclosure.closest(".fast-ux-outliner__gutter"));
  assert.equal(row(view.container, "project").querySelectorAll("button").length, 1);
  assert.ok(view.getByRole("img", { name: "Completed task" }));
  assert.equal(view.queryByRole("checkbox"), null);
  fireEvent.click(disclosure);
  assert.equal(disclosure.getAttribute("aria-expanded"), "false");
});

test("folded count and summary are reader-only cues, not new actions or document mutations", () => {
  const before = JSON.stringify(nodes);
  let changes = 0;
  const view = render(
    <Outliner
      nodes={nodes}
      renderCollapsed={() => <p>Details remain in this branch.</p>}
      onExpandedChange={() => changes++}
    />,
  );
  assert.equal(view.container.querySelector(".fast-ux-outliner__count"), null);
  fireEvent.click(view.getByRole("button", { name: "Collapse Project" }));
  const count = view.container.querySelector(".fast-ux-outliner__count");
  assert.equal(count?.textContent, "2");
  assert.equal(count?.getAttribute("aria-hidden"), "true");
  assert.ok(view.getByText("Details remain in this branch."));
  assert.equal(view.queryByText("A task"), null);
  fireEvent.click(view.getByRole("button", { name: "Expand Project" }));
  assert.equal(view.container.querySelector(".fast-ux-outliner__count"), null);
  assert.equal(changes, 2);
  assert.equal(JSON.stringify(nodes), before);
});

test("editable rows reserve one leading control and keep selection separate from task state", () => {
  const ref = createRef<OutlineEditorHandle>();
  const view = render(
    <OutlineEditor ref={ref} defaultNodes={nodes} readOnly={false} showToolbar={false} />,
  );
  for (const id of ["project", "note", "task", "other"]) {
    const element = row(view.container, id);
    assert.ok(element.children[1]?.classList.contains("fast-ux-editor__text-container"));
    assert.equal(element.firstElementChild?.tagName, id === "task" ? "LABEL" : "BUTTON");
    const select = element.querySelector(".fast-ux-editor__select");
    assert.ok(select);
    assert.ok(
      element.children[1]!.compareDocumentPosition(select) & Node.DOCUMENT_POSITION_FOLLOWING,
      "selection follows the text instead of taking another leading column",
    );
  }
  const taskRow = row(view.container, "task");
  assert.ok(taskRow.querySelector(".fast-ux-editor__focus"));
  assert.ok(view.getByRole("button", { name: "Focus on A task" }));
  fireEvent.click(view.getByRole("button", { name: "Select A task" }));
  assert.equal(
    view.getByRole("button", { name: "Select A task" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(ref.current!.getState().revision, 0, "selection is not a task mutation");
  fireEvent.click(view.getByRole("checkbox", { name: "Complete A task" }));
  assert.equal(ref.current!.getState().nodes[0]!.children![1]!.checked, true);
  assert.equal(ref.current!.getState().revision, 1);
});

test("editor ancestry rails follow visible depth and stay decorative when folding or hoisting", () => {
  const view = render(<OutlineEditor defaultNodes={nodes} readOnly={false} />);
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__guides > span").length, 2);
  for (const guides of view.container.querySelectorAll(".fast-ux-editor__guides")) {
    assert.equal(guides.getAttribute("aria-hidden"), "true");
    assert.equal(guides.hasAttribute("tabindex"), false);
  }
  fireEvent.click(view.getByRole("button", { name: "Collapse Project" }));
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__guides").length, 0);
  assert.equal(view.container.querySelector(".fast-ux-outliner__count")?.textContent, "2");
  fireEvent.click(view.getByRole("button", { name: "Expand Project" }));
  fireEvent.click(view.getByRole("button", { name: "Focus on A note" }));
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__guides").length, 0);
  assert.ok(view.getByRole("textbox", { name: "Edit A note" }));
});

test("default editor retains the reader anatomy during SSR and never renders edit controls", () => {
  const html = renderToString(<OutlineEditor defaultNodes={nodes} />);
  assert.match(html, /data-read-only="true"/);
  assert.match(html, /fast-ux-outliner__gutter/);
  assert.doesNotMatch(html, /<textarea|type="checkbox"|fast-ux-editor__select/);
});

test("empty editor body slots add no padded wrapper and preserve visible bodies and rich precedence", () => {
  const props = { defaultNodes: nodes, readOnly: false };
  const view = render(<OutlineEditor {...props} renderBody={() => undefined} />);
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__body").length, 0);
  for (const empty of [null, false, true, ""] as const) {
    view.rerender(<OutlineEditor {...props} renderBody={() => empty} />);
    assert.equal(view.container.querySelectorAll(".fast-ux-editor__body").length, 0);
  }
  view.rerender(
    <OutlineEditor
      {...props}
      renderBody={(node) => node.id === "project" && <p>Visible body</p>}
    />,
  );
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__body").length, 1);
  assert.ok(view.getByText("Visible body"));
  const rich = importMarkdownDocument("Rich fallback");
  const getRichContent = (node: OutlineNode) => (node.id === "project" ? rich : undefined);
  view.rerender(<OutlineEditor {...props} getRichContent={getRichContent} />);
  assert.ok(view.getByText("Rich fallback"));
  view.rerender(
    <OutlineEditor {...props} getRichContent={getRichContent} renderBody={() => undefined} />,
  );
  assert.equal(
    view.queryByText("Rich fallback"),
    null,
    "an explicit empty body still overrides rich content",
  );
  assert.equal(view.container.querySelectorAll(".fast-ux-editor__body").length, 0);
  view.rerender(<OutlineEditor {...props} renderBody={() => 0} />);
  assert.equal(view.container.querySelector(".fast-ux-editor__body")?.textContent, "0");
  // A trusted fragment/child component can itself render nothing. The exported
  // stylesheet handles an empty DOM wrapper without inspecting host components.
  view.rerender(<OutlineEditor {...props} renderBody={() => <></>} />);
  const css = readFileSync(new URL("../src/react/editor.css", import.meta.url), "utf8");
  assert.match(css, /\.fast-ux-editor__body:empty\s*\{\s*display: none;/);
  assert.ok(view.container.querySelector(".fast-ux-editor__body:empty"));
});

test("row weight and selection selectors do not leak into trusted nested outline widgets", () => {
  const readerSkin = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const editorSkin = readFileSync(new URL("../src/react/editor.css", import.meta.url), "utf8");
  const nestedNodes = [{ id: "inner", text: "Independent leaf" }];
  const reader = render(
    <Outliner
      nodes={nodes}
      renderBody={(node) => node.id === "project" && <Outliner nodes={nestedNodes} />}
    />,
  );
  const readerBranchSelector = readerSkin.match(
    /(\.fast-ux-outliner__item\[data-has-children="true"\][^{]+)\{/,
  )?.[1];
  assert.ok(readerBranchSelector);
  assert.deepEqual(
    [...reader.container.querySelectorAll(readerBranchSelector)].map(
      (element) => element.textContent,
    ),
    ["Project"],
  );
  reader.unmount();
  const editor = render(
    <OutlineEditor
      defaultNodes={nodes}
      readOnly={false}
      renderBody={(node) =>
        node.id === "project" && <OutlineEditor defaultNodes={nestedNodes} readOnly={false} />
      }
    />,
  );
  const editorBranchSelector = editorSkin.match(
    /(\.fast-ux-editor__item\[data-has-children="true"\][^{]+)\{/,
  )?.[1];
  assert.ok(editorBranchSelector);
  assert.deepEqual(
    [...editor.container.querySelectorAll<HTMLTextAreaElement>(editorBranchSelector)].map(
      (element) => element.value,
    ),
    ["Project"],
  );
  fireEvent.click(editor.getByRole("button", { name: "Select Project" }));
  const selectedControlSelector = editorSkin.match(
    /(\.fast-ux-editor__item\[data-selected\][^{]+\.fast-ux-editor__select)\s*\{/,
  )?.[1];
  assert.ok(selectedControlSelector);
  assert.deepEqual(
    [...editor.container.querySelectorAll(selectedControlSelector)].map((element) =>
      element.getAttribute("aria-label"),
    ),
    ["Select Project"],
  );
});

test("component skins separate document guides, selection and 44px input targets", () => {
  const read = (file: string) => readFileSync(new URL(`../src/${file}`, import.meta.url), "utf8");
  const reader = read("styles.css");
  const editor = read("react/editor.css");
  assert.match(reader, /--outline-gutter:\s*1\.25rem/);
  assert.match(reader, /\.fast-ux-outliner__item > \.fast-ux-outliner__row:focus-within/);
  assert.doesNotMatch(reader, /\n\.fast-ux-outliner__row:focus-within/);
  assert.match(
    editor,
    /\.fast-ux-editor__item\[data-selected\] > \.fast-ux-editor__row\s*\{\s*background: transparent/,
  );
  assert.match(editor, /\.fast-ux-editor__input\s*\{[^}]*min-block-size: var\(--outline-target\)/);
  assert.match(
    editor,
    /\.fast-ux-editor__input\s*\{[^}]*padding: var\(--fux-outline-padding, 0\.625rem\) 0\.25rem/,
  );
  assert.match(
    editor,
    /\.fast-ux-editor__decoration\s*\{[^}]*padding-block: var\(--fux-outline-padding, 0\.625rem\)/,
  );
  assert.match(editor, /margin-inline-start: var\(--outline-content-offset\)/);
  assert.match(
    editor,
    /--outline-content-offset: calc\(var\(--outline-target\) \+ var\(--outline-gap, 0\.25rem\) \+ 0\.25rem\)/,
  );
  assert.match(editor, /\.fast-ux-editor__guides\s*\{[^}]*pointer-events: none/);
  assert.match(reader, /:dir\(rtl\).*fast-ux-outliner__chevron/);
  assert.match(editor, /@media \(forced-colors: active\)/);
});
