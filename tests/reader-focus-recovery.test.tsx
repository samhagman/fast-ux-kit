import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { StrictMode } from "react";
import { browserErrors } from "./components-dom.js";
import type { OutlineNode } from "../src/core/index.js";
const { act, cleanup, render } = await import("@testing-library/react");
const { Outliner } = await import("../src/react/Outliner.js");
const nodes: readonly OutlineNode[] = [
  { id: "a", text: "Branch A", children: [{ id: "a-child", text: "Child A" }] },
  { id: "b", text: "Branch B", children: [{ id: "b-child", text: "Child B" }] },
];
const renderBody = (node: OutlineNode) => <a href={`#${node.id}`}>Link {node.id}</a>;
const base = { nodes, renderBody, enableHoist: true, "aria-label": "Audit reader" };
const reader = (view: ReturnType<typeof render>) =>
  view.getByRole("region", { name: "Audit reader" });
const focusChild = (view: ReturnType<typeof render>) => {
  const link = view.getByRole("link", { name: "Link a-child" });
  act(() => link.focus());
  return link;
};
afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

test("controlled hoist to an unrelated subtree recovers removed descendant focus to the reader", () => {
  const view = render(<Outliner {...base} hoistedId={null} />);
  const link = focusChild(view);
  view.rerender(<Outliner {...base} hoistedId="b" />);
  assert.equal(link.isConnected, false);
  assert.ok(document.activeElement === reader(view));
  assert.ok(view.getByRole("link", { name: "Link b-child" }));
});

test("host removal of a focused branch falls back to the section rather than document body", () => {
  const view = render(<Outliner {...base} />);
  const link = focusChild(view);
  view.rerender(<Outliner {...base} nodes={[nodes[1]!]} />);
  assert.equal(link.isConnected, false);
  assert.ok(document.activeElement === reader(view));
});

test("controlled parent collapse preserves the nearest visible ancestor disclosure recovery", () => {
  const view = render(<Outliner {...base} expandedIds={new Set(["a", "b"])} />);
  focusChild(view);
  view.rerender(<Outliner {...base} expandedIds={new Set(["b"])} />);
  assert.ok(document.activeElement === view.getByRole("button", { name: "Expand Branch A" }));
});

test("removing all nodes leaves a focusable empty reader as the recovery destination", () => {
  const view = render(<Outliner {...base} />);
  focusChild(view);
  view.rerender(<Outliner {...base} nodes={[]} />);
  assert.ok(document.activeElement === reader(view));
  assert.equal(reader(view).tabIndex, -1);
  assert.equal(view.queryByRole("link"), null);
});

test("focus deliberately moved outside is not stolen by subsequent hoist or removal", () => {
  const host = render(<button>External action</button>);
  const view = render(<Outliner {...base} hoistedId={null} />);
  focusChild(view);
  const outside = host.getByRole("button", { name: "External action" });
  act(() => outside.focus());
  view.rerender(<Outliner {...base} hoistedId="b" />);
  assert.ok(document.activeElement === outside);
  act(() => outside.blur());
  view.rerender(<Outliner {...base} nodes={[]} hoistedId={null} />);
  assert.ok(document.activeElement === document.body);
});

test("intentional blur to body clears ownership before an asynchronous host change removes the control", async () => {
  const view = render(<Outliner {...base} />);
  const link = focusChild(view);
  act(() => link.blur());
  assert.ok(document.activeElement === document.body);
  await act(async () => {
    await Promise.resolve();
  });
  view.rerender(<Outliner {...base} nodes={[nodes[1]!]} />);
  assert.ok(document.activeElement === document.body);
});

test("unrelated prop changes preserve a connected focused control and do not redirect intentionally blurred focus", () => {
  const view = render(<Outliner {...base} expandedIds={new Set(["a", "b"])} />);
  const link = focusChild(view);
  view.rerender(<Outliner {...base} expandedIds={new Set(["a"])} />);
  assert.ok(document.activeElement === link);
  act(() => link.blur());
  view.rerender(<Outliner {...base} expandedIds={new Set(["a", "b"])} />);
  assert.ok(document.activeElement === document.body);
});

test("hidden formerly focused host content can recover without treating a visible intentional blur as loss", () => {
  const body = (hidden: boolean) => (node: OutlineNode) => (
    <a hidden={hidden} href={`#${node.id}`}>
      Link {node.id}
    </a>
  );
  const view = render(<Outliner {...base} renderBody={body(false)} />);
  const link = focusChild(view);
  view.rerender(<Outliner {...base} renderBody={body(true)} />);
  // jsdom does not move focus when hidden is set; model that browser focus loss.
  act(() => link.blur());
  view.rerender(<Outliner {...base} renderBody={body(true)} />);
  assert.ok(document.activeElement === view.getByRole("button", { name: "Collapse Branch A" }));
});

test("StrictMode recovery is stable and does not invoke host view-change callbacks", () => {
  const changes: unknown[] = [];
  const view = render(
    <StrictMode>
      <Outliner
        {...base}
        hoistedId={null}
        onHoistChange={(id) => changes.push(id)}
        onExpandedChange={(ids) => changes.push(ids)}
      />
    </StrictMode>,
  );
  focusChild(view);
  view.rerender(
    <StrictMode>
      <Outliner
        {...base}
        hoistedId="b"
        onHoistChange={(id) => changes.push(id)}
        onExpandedChange={(ids) => changes.push(ids)}
      />
    </StrictMode>,
  );
  assert.ok(document.activeElement === reader(view));
  assert.deepEqual(changes, []);
});

test("unmount does not schedule recovery or steal focus from a remaining host control", async () => {
  const host = render(<button>Host remains</button>);
  const view = render(<Outliner {...base} />);
  focusChild(view);
  view.unmount();
  const button = host.getByRole("button", { name: "Host remains" });
  act(() => button.focus());
  await act(async () => {
    await Promise.resolve();
  });
  assert.ok(document.activeElement === button);
});

test("host removal of the focused leaf uses its captured surviving ancestor path", () => {
  const withSibling = [
    { ...nodes[0]!, children: [...nodes[0]!.children!, { id: "sibling", text: "Sibling" }] },
    nodes[1]!,
  ];
  const view = render(<Outliner {...base} nodes={withSibling} />);
  focusChild(view);
  view.rerender(
    <Outliner
      {...base}
      nodes={[{ ...nodes[0]!, children: [{ id: "sibling", text: "Sibling" }] }, nodes[1]!]}
    />,
  );
  assert.ok(document.activeElement === view.getByRole("button", { name: "Collapse Branch A" }));
});
