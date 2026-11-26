import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { NavigationTree, Tree, type TreeNode } from "../src/components/collections.js";

Object.defineProperty(dom.window.Element.prototype, "getAnimations", {
  configurable: true,
  value: () => [],
});
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

/**
 * Matches an accessible name as it is spoken. jsdom, like Chrome, pads the visually hidden
 * ", 3" with a space when it builds a name from content, so it arrives as "Inbox , 3".
 */
function spoken(expected: string) {
  return (name: string) => name.replace(/\s+,/g, ",") === expected;
}

/** The class names of a row's direct children, in reading order. */
function anatomy(row: Element) {
  return [...row.children].map((child) => child.className);
}

const mail: TreeNode[] = [
  {
    id: "folders",
    label: "Folders",
    badge: 5,
    children: [
      { id: "inbox", label: "Inbox", badge: 3, description: "today" },
      { id: "sent", label: "Sent" },
    ],
  },
];

test("tree badges sit at the row's inline end by default, after the label and its trail", () => {
  const view = render(<Tree label="Mail" items={mail} defaultExpandedIds={["folders"]} />);
  const inbox = view.getByRole("treeitem", { name: /Inbox/ });
  const badge = inbox.querySelector(".fux-tree-badge")!;
  assert.equal(badge.textContent, "3");
  assert.equal(badge.getAttribute("data-placement"), "end");
  assert.equal(inbox.lastElementChild, badge, "the badge is the row's last part");
  assert.equal(badge.previousElementSibling!.className, "fux-tree-trail");
  const nested = view.getByRole("treeitem", { name: /Folders/ });
  assert.equal(nested.lastElementChild!.textContent, "5");
});

test("tree badges sit just before the label, after the disclosure, guides and icon, at start", () => {
  const view = render(
    <Tree label="Mail" items={mail} defaultExpandedIds={["folders"]} badgePlacement="start" />,
  );
  const inbox = view.getByRole("treeitem", { name: /Inbox/ });
  assert.deepEqual(anatomy(inbox), [
    "fux-tree-guide",
    "fux-tree-disclosure",
    "fux-tree-icon",
    "fux-tree-badge",
    "fux-tree-label",
    "fux-tree-trail",
  ]);
  assert.equal(inbox.querySelector(".fux-tree-badge")!.getAttribute("data-placement"), "start");
});

test("a node's own badge placement overrides the tree's", () => {
  const view = render(
    <Tree
      label="Mail"
      badgePlacement="start"
      items={[
        { id: "inbox", label: "Inbox", badge: 3 },
        { id: "spam", label: "Spam", badge: 9, badgePlacement: "end" },
      ]}
    />,
  );
  const inbox = view.getByRole("treeitem", { name: /Inbox/ });
  const spam = view.getByRole("treeitem", { name: /Spam/ });
  assert.equal(inbox.querySelector(".fux-tree-label")!.previousElementSibling!.textContent, "3");
  assert.equal(spam.lastElementChild!.textContent, "9");
  assert.equal(spam.lastElementChild!.getAttribute("data-placement"), "end");

  view.rerender(
    <Tree
      label="Mail"
      items={[{ id: "inbox", label: "Inbox", badge: 3, badgePlacement: "start" }]}
    />,
  );
  assert.equal(
    view.getByRole("treeitem").querySelector(".fux-tree-badge")!.getAttribute("data-placement"),
    "start",
  );
});

test("a row's accessible name reads the label, then the badge, in either placement", () => {
  for (const badgePlacement of ["end", "start"] as const) {
    const view = render(
      <Tree
        label="Mail"
        badgePlacement={badgePlacement}
        defaultExpandedIds={["folders"]}
        items={[
          ...mail,
          {
            id: "drafts",
            label: "Drafts",
            badge: <span data-testid="dot" className="size-2 rounded-full bg-signal" />,
            badgeLabel: "unsaved changes",
          },
          { id: "zero", label: "Archive", badge: 0 },
        ]}
      />,
    );
    assert.ok(view.getByRole("treeitem", { name: spoken("Inbox, 3 today") }), badgePlacement);
    assert.ok(view.getByRole("treeitem", { name: spoken("Folders, 5") }), badgePlacement);
    assert.ok(
      view.getByRole("treeitem", { name: spoken("Drafts, unsaved changes") }),
      badgePlacement,
    );
    assert.ok(
      view.getByRole("treeitem", { name: spoken("Archive, 0") }),
      "a zero count still reads",
    );
    assert.ok(view.getByTestId("dot"), "a non-text badge still draws");
    cleanup();
  }
});

test("a non-text badge without a label speaks for itself", () => {
  const view = render(
    <Tree
      label="Mail"
      items={[{ id: "flagged", label: "Flagged", badge: <span role="img" aria-label="urgent" /> }]}
    />,
  );
  const row = view.getByRole("treeitem", { name: /Flagged/ });
  assert.equal(row.querySelector(".fux-tree-badge")!.getAttribute("aria-hidden"), null);
  assert.match(row.textContent ?? "", /^Flagged$/);
  assert.ok(view.getByRole("treeitem", { name: "Flagged urgent" }));
});

test("navigation tree links keep working and carry the badge in their names", () => {
  const actions: string[] = [];
  const view = render(
    <NavigationTree
      label="Browse"
      onAction={(id) => actions.push(id)}
      items={[
        { id: "inbox", label: "Inbox", href: "/inbox", badge: 3 },
        { id: "spam", label: "Spam", href: "/spam", badge: 9, badgePlacement: "start" },
        { id: "off", label: "Archive", href: "/archive", badge: 1, disabled: true },
        { id: "plain", label: "Plain", href: "/plain" },
      ]}
    />,
  );
  const inbox = view.getByRole("link", { name: spoken("Inbox, 3") });
  assert.equal(inbox.getAttribute("href"), "/inbox");
  assert.equal(
    inbox.querySelector(".fux-tree-badge"),
    null,
    "the drawn badge sits beside the link",
  );
  assert.ok(
    view.getByRole("treeitem", { name: spoken("Inbox, 3") }),
    "the row name is not doubled",
  );
  assert.equal(view.getByRole("link", { name: spoken("Spam, 9") }).getAttribute("href"), "/spam");
  assert.ok(
    view.getByRole("treeitem", { name: spoken("Archive, 1") }),
    "a disabled row still reads it",
  );
  assert.equal(view.queryByRole("link", { name: /Archive/ }), null);
  assert.equal(view.getByRole("link", { name: "Plain" }).getAttribute("aria-label"), null);
  // jsdom cannot follow a link, so the click stops at the tree, as the Studio demo does.
  view.container.addEventListener("click", (event) => event.preventDefault());
  fireEvent.click(inbox);
  assert.deepEqual(actions, ["inbox"]);
});

test("trees without badges render exactly as before, whatever the placement", () => {
  const plain: TreeNode[] = [
    { id: "docs", label: "Docs", children: [{ id: "guide", label: "Guide", description: "2" }] },
  ];
  const view = render(<Tree label="Files" items={plain} defaultExpandedIds={["docs"]} />);
  const markup = view.container.innerHTML;
  assert.equal(view.container.querySelector(".fux-tree-badge, .sr-only"), null);
  assert.deepEqual(anatomy(view.getByRole("treeitem", { name: /Guide/ })), [
    "fux-tree-guide",
    "fux-tree-disclosure",
    "fux-tree-icon",
    "fux-tree-label",
    "fux-tree-trail",
  ]);
  assert.ok(view.getByRole("treeitem", { name: "Guide 2" }));
  view.rerender(
    <Tree label="Files" items={plain} defaultExpandedIds={["docs"]} badgePlacement="start" />,
  );
  assert.equal(view.container.innerHTML, markup);
  cleanup();
  const nav = render(
    <NavigationTree label="Browse" items={[{ id: "docs", label: "Docs", href: "/docs" }]} />,
  );
  const link = nav.getByRole("link", { name: "Docs" });
  assert.equal(link.innerHTML, "Docs");
});

test("badged trees render the same on the server and the client", () => {
  const tree = <Tree label="Mail" items={mail} defaultExpandedIds={["folders"]} />;
  const server = renderToString(tree);
  assert.match(server, /fux-tree-badge/);
  const view = render(tree);
  assert.equal(view.container.innerHTML, server);
});

test("badge styles keep the badge whole, place it with logical margins and clip hidden text", () => {
  const css = readFileSync(new URL("../src/components/collections.css", import.meta.url), "utf8");
  const rule = (selector: string) => {
    const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1] ?? "";
  };
  assert.match(rule(".fux-tree-badge"), /flex: none;/, "a long label cannot squeeze the badge");
  assert.match(rule('.fux-tree-badge[data-placement="end"]'), /margin-inline-start:/);
  assert.match(rule('.fux-tree-badge[data-placement="start"]'), /margin-inline-end:/);
  assert.doesNotMatch(css.slice(css.indexOf(".fux-tree-badge")), /margin-(left|right):/);
  // The hidden ", 3" sits after the label text; the label must contain it, or a truncated
  // label lets it hang outside the row and the tree gains a horizontal scrollbar.
  assert.match(rule(".fux-tree-label"), /position: relative;[\s\S]*overflow: hidden;/);
});
