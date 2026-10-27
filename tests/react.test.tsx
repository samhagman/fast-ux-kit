import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import type { OutlineNode } from "../src/core/index.js";

// Browser globals must exist before React Aria's DOM feature checks initialize.
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://reader.test/",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "KeyboardEvent",
  "MouseEvent",
] as const) {
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
}
for (const name of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: dom.window[name].bind(dom.window),
  });
}
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
// jsdom lacks CSS.escape; React Aria uses it when looking up CSP metadata.
Object.defineProperty(globalThis, "CSS", {
  configurable: true,
  value: {
    escape: (value: string) =>
      [...String(value)]
        .map((char) =>
          /[a-zA-Z0-9_-]/.test(char) ? char : `\\${char.codePointAt(0)!.toString(16)} `,
        )
        .join(""),
  },
});
const { act, cleanup, fireEvent, render } = await import("@testing-library/react");
const { hydrateRoot } = await import("react-dom/client");
const { Outliner } = await import("../src/react/index.js");
const browserErrors: unknown[] = [];
dom.window.addEventListener("error", (event) => browserErrors.push(event.error));
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});

const nodes: readonly OutlineNode[] = Object.freeze([
  Object.freeze({
    id: "alpha",
    text: "Alpha",
    children: Object.freeze([
      Object.freeze({
        id: "nested",
        text: "Nested",
        children: Object.freeze([Object.freeze({ id: "leaf", text: "Leaf" })]),
      }),
    ]),
  }),
  Object.freeze({ id: "beta", text: "Beta" }),
]);
function controlledList(button: HTMLElement): HTMLElement {
  const list = document.getElementById(button.getAttribute("aria-controls")!);
  assert.ok(list, "disclosure references its child list, even when collapsed");
  return list;
}

test("semantic nested reader defaults expanded and folds without document mutation", () => {
  const before = JSON.stringify(nodes);
  const view = render(<Outliner nodes={nodes} aria-label="Project notes" className="app-reader" />);
  assert.ok(view.getByRole("region", { name: "Project notes" }).classList.contains("app-reader"));
  assert.equal(view.queryByRole("tree"), null);
  assert.equal(view.getAllByRole("list").length, 3);
  const button = view.getByRole("button", { name: "Collapse Alpha" });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  assert.equal(controlledList(button).hidden, false);
  fireEvent.click(button);
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(controlledList(button).hidden, true);
  assert.equal(view.getAllByRole("list").length, 1);
  assert.equal(view.queryByRole("button", { name: "Collapse Nested" }), null);
  fireEvent.click(view.getByRole("button", { name: "Expand Alpha" }));
  assert.ok(view.getByRole("button", { name: "Collapse Nested" }));
  assert.equal(JSON.stringify(nodes), before);
});

test("Enter and Space fold with normal native focus instead of tree keyboard trapping", () => {
  const view = render(<Outliner nodes={nodes} defaultExpandedIds={new Set()} />);
  const button = view.getByRole("button", { name: "Expand Alpha" });
  act(() => button.focus());
  assert.equal(document.activeElement, button);
  assert.notEqual(button.getAttribute("tabindex"), "-1");
  fireEvent.keyDown(button, { key: "Enter", code: "Enter", charCode: 13 });
  fireEvent.keyUp(button, { key: "Enter", code: "Enter", charCode: 13 });
  assert.equal(button.getAttribute("aria-expanded"), "true");
  fireEvent.keyDown(button, { key: " ", code: "Space", charCode: 32 });
  fireEvent.keyUp(button, { key: " ", code: "Space", charCode: 32 });
  assert.equal(button.getAttribute("aria-expanded"), "false");
  assert.equal(document.activeElement, button);
});

test("controlled expansion requests changes once and waits for parent props", () => {
  const original = new Set<string>();
  const changes: { ids: ReadonlySet<string>; id: string; isExpanded: boolean }[] = [];
  const onExpandedChange = (
    ids: ReadonlySet<string>,
    change: { id: string; isExpanded: boolean },
  ) => changes.push({ ids, ...change });
  const view = render(
    <StrictMode>
      <Outliner nodes={nodes} expandedIds={original} onExpandedChange={onExpandedChange} />
    </StrictMode>,
  );
  fireEvent.click(view.getByRole("button", { name: "Expand Alpha" }));
  assert.equal(changes.length, 1);
  assert.equal(changes[0]?.id, "alpha");
  assert.equal(changes[0]?.isExpanded, true);
  assert.deepEqual([...changes[0]!.ids], ["alpha"]);
  assert.deepEqual([...original], []);
  assert.ok(view.getByRole("button", { name: "Expand Alpha" }));
  view.rerender(
    <StrictMode>
      <Outliner nodes={nodes} expandedIds={changes[0]!.ids} onExpandedChange={onExpandedChange} />
    </StrictMode>,
  );
  assert.ok(view.getByRole("button", { name: "Collapse Alpha" }));
});

test("local folds survive immutable prop changes and node reordering", () => {
  const view = render(<Outliner nodes={nodes} />);
  fireEvent.click(view.getByRole("button", { name: "Collapse Alpha" }));
  const changed = [
    nodes[1]!,
    { ...nodes[0]!, text: "Renamed Alpha" },
    { id: "new", text: "New branch", children: [{ id: "new-leaf", text: "New leaf" }] },
  ];
  view.rerender(<Outliner nodes={changed} defaultExpandedIds={new Set(["alpha", "new"])} />);
  assert.ok(view.getByRole("button", { name: "Expand Renamed Alpha" }));
  assert.ok(view.getByRole("button", { name: "Expand New branch" }));
});

test("rich content supports independent links, localized disclosure names, and render context", () => {
  let followed = 0;
  const contexts: number[] = [];
  const view = render(
    <Outliner
      nodes={nodes}
      getDisclosureLabel={(node, isExpanded) => `${isExpanded ? "Close" : "Open"} ${node.id}`}
      renderContent={(node, context) => {
        contexts.push(context.depth);
        return (
          <>
            <strong>{node.text}</strong>
            <a href={`#${node.id}`} onClick={() => followed++}>
              Read {node.text}
            </a>
          </>
        );
      }}
    />,
  );
  fireEvent.click(view.getByRole("link", { name: "Read Alpha" }));
  assert.equal(followed, 1);
  assert.ok(view.getByRole("button", { name: "Close alpha" }));
  assert.ok(contexts.includes(2));
  assert.equal(view.container.querySelector("button a"), null);
});

test("default text is escaped and read-only without source or editing UI", () => {
  const text = '<img src="x" onerror="alert(1)">';
  const view = render(<Outliner nodes={[{ id: "literal", text }]} />);
  assert.ok(view.getByText(text));
  assert.equal(view.container.querySelector("img,input,textarea,[contenteditable]"), null);
  assert.equal(
    view.container.querySelector("[data-read-only]")?.getAttribute("data-read-only"),
    "true",
  );
});

test("duplicate IDs and cycles fail predictably, including hidden descendants", () => {
  assert.throws(
    () =>
      render(
        <Outliner
          nodes={[
            { id: "same", text: "Root", children: [{ id: "same", text: "Hidden duplicate" }] },
          ]}
          defaultExpandedIds={new Set()}
        />,
      ),
    /Duplicate outline id/,
  );
  const cyclic = { id: "cycle", text: "Cycle", children: [] as OutlineNode[] };
  cyclic.children.push(cyclic);
  assert.throws(() => render(<Outliner nodes={[cyclic]} />), /cannot contain an ancestor/);
});

test("empty outlines and aria-labelledby work without an unwanted default name", () => {
  const view = render(
    <>
      <h2 id="outline-heading">Empty document</h2>
      <Outliner nodes={[]} aria-labelledby="outline-heading" />
    </>,
  );
  assert.ok(view.getByRole("region", { name: "Empty document" }));
  assert.equal(view.getByRole("region").hasAttribute("aria-label"), false);
  assert.equal(view.queryByRole("button"), null);
});

test("SSR IDs are deterministic, unique across readers, and hydrate without mismatches", async () => {
  const component = (
    <>
      <Outliner nodes={nodes} defaultExpandedIds={new Set()} />
      <Outliner nodes={nodes} />
    </>
  );
  const html = renderToString(component);
  assert.equal(renderToString(component), html);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  const controls = [...host.querySelectorAll("button")].map((button) =>
    button.getAttribute("aria-controls"),
  );
  assert.equal(new Set(controls).size, controls.length);
  for (const id of controls)
    assert.ok([...host.querySelectorAll("ul")].some((list) => list.id === id));
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, component, { onRecoverableError: (error) => errors.push(error) });
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(
      [...host.querySelectorAll("button")].map((button) => button.getAttribute("aria-controls")),
      controls,
    );
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});

test("mobile end disclosure and hoist breadcrumb return preserve reader-local folds and source", () => {
  const before = JSON.stringify(nodes);
  const view = render(<Outliner nodes={nodes} enableHoist />);
  assert.equal(view.getByRole("region").getAttribute("data-disclosure-position"), "end");
  fireEvent.click(view.getByRole("button", { name: "Collapse Nested" }));
  const origin = view.getByRole("button", { name: "Focus on Nested" });
  fireEvent.click(origin);
  assert.ok(view.getByRole("navigation", { name: "Outline path" }));
  assert.equal(view.queryByText("Beta"), null);
  assert.equal(view.getByRole("region").getAttribute("data-hoisted-id"), "nested");
  assert.ok(view.getByRole("button", { name: "Expand Nested" }));
  assert.equal(document.activeElement, view.getByRole("region"));
  fireEvent.click(view.getByRole("button", { name: "All notes" }));
  assert.ok(view.getByText("Beta"));
  assert.equal(document.activeElement, view.getByRole("button", { name: "Focus on Nested" }));
  assert.ok(view.getByRole("button", { name: "Expand Nested" }));
  assert.equal(JSON.stringify(nodes), before);
});

test("controlled hoist waits for props, supports ancestors, and does not modify folding", () => {
  const changes: (string | null)[] = [];
  const expandedIds = new Set(["alpha", "nested"]);
  const props = {
    nodes,
    enableHoist: true,
    expandedIds,
    onHoistChange: (id: string | null) => changes.push(id),
  };
  const view = render(<Outliner {...props} hoistedId={null} />);
  fireEvent.click(view.getByRole("button", { name: "Focus on Nested" }));
  assert.deepEqual(changes, ["nested"]);
  assert.equal(view.queryByRole("navigation"), null);
  view.rerender(<Outliner {...props} hoistedId="nested" />);
  fireEvent.click(view.getByRole("button", { name: "Alpha" }));
  assert.deepEqual(changes, ["nested", "alpha"]);
  assert.deepEqual([...expandedIds], ["alpha", "nested"]);
  view.rerender(<Outliner {...props} hoistedId="removed" />);
  assert.ok(view.getByText("Beta"));
  assert.equal(view.queryByRole("navigation"), null);
});

test("hidden descendants are unmounted, removing embedded interactive content from tab and accessibility flow", () => {
  const calls: string[] = [];
  const view = render(
    <Outliner
      nodes={nodes}
      defaultExpandedIds={new Set()}
      renderContent={(node) => {
        calls.push(node.id);
        return <a href={`#${node.id}`}>{node.text}</a>;
      }}
    />,
  );
  assert.deepEqual(calls, ["alpha", "beta"]);
  assert.equal(view.container.querySelector('a[href="#leaf"]'), null);
  fireEvent.click(view.getByRole("button", { name: "Expand Alpha" }));
  assert.ok(view.getByRole("link", { name: "Nested" }));
  assert.equal(view.container.querySelector('a[href="#leaf"]'), null);
});

test("controlled collapse returns focus from an unmounted descendant to the visible disclosure", () => {
  const renderContent = (node: OutlineNode) => <a href={`#${node.id}`}>{node.text}</a>;
  const view = render(
    <Outliner
      nodes={nodes}
      expandedIds={new Set(["alpha", "nested"])}
      renderContent={renderContent}
    />,
  );
  act(() => view.getByRole("link", { name: "Leaf" }).focus());
  view.rerender(<Outliner nodes={nodes} expandedIds={new Set()} renderContent={renderContent} />);
  assert.equal(document.activeElement, view.getByRole("button", { name: "Expand Alpha" }));
});

test("deep collapsed SSR is lazy; expanded depth and breadth limits fail visibly without losing data", () => {
  let node: OutlineNode = { id: "deep-2500", text: "Bottom" };
  for (let depth = 2499; depth >= 0; depth--)
    node = { id: `deep-${depth}`, text: `Level ${depth}`, children: [node] };
  const collapsed = renderToString(<Outliner nodes={[node]} defaultExpandedIds={new Set()} />);
  assert.equal(collapsed.includes("Bottom"), false);
  const expanded = renderToString(<Outliner nodes={[node]} />);
  assert.match(expanded, /128-level inline rendering limit/);
  const broad = Array.from({ length: 5_001 }, (_, index) => ({
    id: `wide-${index}`,
    text: `Wide ${index}`,
  }));
  assert.match(renderToString(<Outliner nodes={broad} />), /5,000-row inline rendering limit/);
  assert.equal(broad.length, 5_001);
});

test("typed rich content is readable through getRichContent and trusted renderContent retains precedence", async () => {
  const { importMarkdownDocument } = await import("../src/rich/index.js");
  const document = importMarkdownDocument("# Readable title\n\nA **rich body**.");
  const view = render(
    <Outliner
      nodes={[{ id: "rich", text: "Title", data: { content: document } }]}
      getRichContent={(node) => node.data?.content}
    />,
  );
  assert.ok(view.getByRole("heading", { name: "Readable title" }));
  assert.ok(view.getByText("rich body"));
  view.rerender(
    <Outliner
      nodes={[{ id: "rich", text: "Title", data: { content: document } }]}
      getRichContent={(node) => node.data?.content}
      renderContent={() => <em>App-owned renderer</em>}
    />,
  );
  assert.ok(view.getByText("App-owned renderer"));
  assert.equal(view.queryByRole("heading"), null);
});

test("a pending controlled hoist does not steal focus when unrelated folding props update", () => {
  const props = { nodes, enableHoist: true, hoistedId: null, onHoistChange: () => {} };
  const view = render(<Outliner {...props} expandedIds={new Set(["alpha", "nested"])} />);
  const button = view.getByRole("button", { name: "Focus on Nested" });
  act(() => button.focus());
  fireEvent.click(button);
  view.rerender(<Outliner {...props} expandedIds={new Set(["alpha"])} />);
  assert.equal(document.activeElement, button);
});
