// Multiple documents (OutlinerWorkspace): the pure list operations, cross-document links and
// backlinks, search across documents, and the real component in jsdom (switcher, keep-alive,
// create/rename/reorder, links that open another document, the search scope).
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { setFieldValue } from "./harness/outliner-dom.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, core, ws, hook;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  core = await load("@fux/core");
  ws = await load("/src/registry/outliner/workspace.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
});
after(() => vite?.close());

const docs = () => [
  {
    id: "a",
    title: "Alpha",
    nodes: [
      { id: "a1", text: "Goals", children: [{ id: "a2", text: "Ship it #launch" }] },
      { id: "a3", text: "See [[Notes|b/b1]] and [[Gone|b/zz]]" },
    ],
  },
  {
    id: "b",
    title: "Beta",
    nodes: [
      { id: "b1", text: "Notes about [[Goals|a/a1]]" },
      { id: "b2", text: "Ship the beta #launch" },
      { id: "bm", text: "", data: { mirrorOf: "b1" } },
    ],
  },
  { id: "c", title: "", nodes: [{ id: "c1", text: "Also [[Goals|a/a1]] and [[Ship|a/a2]]" }] },
];

/* ───────────── List operations ───────────── */

test("workspace: qualified ids split at the first slash; plain ids are not qualified", () => {
  assert.deepEqual(ws.parseQualifiedId("doc/item"), { documentId: "doc", itemId: "item" });
  assert.equal(ws.parseQualifiedId("item"), null);
  assert.equal(ws.parseQualifiedId("/x"), null);
  assert.equal(ws.qualifiedId("d", "i"), "d/i");
});

test("workspace: create, rename, delete with exact restore, reorder — pure and identity-keeping", () => {
  const list = docs();
  const created = ws.createDocument("New", "n");
  assert.equal(created.id, "n");
  assert.equal(created.nodes.length, 1, "a new document has one empty item to type into");
  const renamed = ws.renameDocument(list, "b", "Beta 2");
  assert.equal(renamed[1].title, "Beta 2");
  assert.equal(renamed[0], list[0], "untouched documents keep their identity");
  assert.equal(ws.renameDocument(list, "b", "Beta"), list, "a no-op returns the same array");
  const { documents, removed } = ws.removeDocument(list, "b");
  assert.deepEqual(
    documents.map((d) => d.id),
    ["a", "c"],
  );
  assert.deepEqual(
    ws.restoreDocument(documents, removed).map((d) => d.id),
    ["a", "b", "c"],
    "Undo puts it back where it was",
  );
  assert.equal(ws.restoreDocument(list, removed), list, "restoring twice never duplicates");
  assert.deepEqual(
    ws.moveDocument(list, "a", 2).map((d) => d.id),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    ws.moveDocument(list, "c", -5).map((d) => d.id),
    ["c", "a", "b"],
    "clamped",
  );
  assert.equal(ws.neighbourAfterRemoval(list, "c"), "b", "the last one falls back to the previous");
  assert.equal(ws.neighbourAfterRemoval(list, "a"), "b");
});

/* ───────────── Cross-document links ───────────── */

test("workspace: links resolve across documents; a missing target is null; plain ids are not external", () => {
  const list = docs();
  const links = ws.externalLinksFor(list, "a", () => {});
  assert.equal(links.resolve("b/b1"), "Notes about [[Goals|a/a1]]");
  assert.equal(links.resolve("b/zz"), null, "deleted target");
  assert.equal(links.resolve("a1"), undefined, "a same-document id is not this adapter's business");
  assert.equal(links.qualify("a2"), "a/a2");
});

test("workspace: backlinks come from OTHER documents, counted once (a mirror copy is not a second link)", () => {
  const list = docs();
  const links = ws.externalLinksFor(list, "a", () => {});
  assert.equal(links.counts.get("a1"), 2, "from b1 and c1 — not again from b's mirror of b1");
  assert.equal(links.counts.get("a2"), 1);
  const refs = links.backlinks("a1");
  assert.deepEqual(refs.map((r) => r.id).sort(), ["b/b1", "c/c1"]);
  assert.equal(
    refs.find((r) => r.id === "c/c1").context,
    "Untitled document",
    "context starts with the document title",
  );
});

test("workspace: [[ suggestions search other documents and skip this one", () => {
  const list = docs();
  const found = ws.suggestLinks(list, "a", "beta", 5);
  assert.deepEqual(
    found.map((r) => r.id),
    ["b/b2"],
  );
  assert.ok(
    !ws.suggestLinks(list, "a", "goals", 5).some((r) => r.id.startsWith("a/")),
    "never this document's own items",
  );
  assert.equal(found[0].context, "Beta");
});

test("workspace: search runs the outliner's query language over every document", () => {
  const hits = ws.searchDocuments(docs(), "#launch");
  assert.deepEqual(
    hits.map((h) => [h.document.id, h.result.matchedIds]),
    [
      ["a", ["a2"]],
      ["b", ["b2"]],
    ],
  );
  const bad = ws.searchDocuments(docs(), "due:2026-02-30");
  assert.equal(bad.length, 1);
  assert.ok(bad[0].result.diagnostics.length, "an invalid query reports once, not per document");
});

test("workspace: the hook counts backlinks from other documents on rows and re-resolves link titles", async () => {
  await domEnv();
  const list = docs();
  const links = ws.externalLinksFor(list, "a", () => {});
  const view = await mountHook({ defaultValue: list[0].nodes, externalLinks: links });
  const row = (id) => view.record.ol.rows.find((r) => r.id === id);
  assert.equal(row("a1").backlinks, 2);
  const before = row("a3").refKey;
  const renamed = ws.replaceDocumentNodes(list, "b", [{ id: "b1", text: "Renamed notes" }]);
  await view.rerender({
    defaultValue: list[0].nodes,
    externalLinks: ws.externalLinksFor(renamed, "a", () => {}),
  });
  assert.notEqual(row("a3").refKey, before, "a rename in another document re-renders the link");
  assert.equal(row("a1").backlinks, 1, "and the counts follow");
  await view.unmount();
});

/* ───────────── The real component (jsdom) ───────────── */

test("workspace UI: the switcher lists documents; switching keeps the other one mounted but inert", async () => {
  const ui = await mountWorkspace({ defaultDocuments: docs() });
  assert.deepEqual(
    ui.docButtons().map((b) => b.dataset.docOpen),
    ["a", "b", "c"],
  );
  assert.equal(ui.pane("a").hasAttribute("inert"), false);
  await ui.act(() => ui.docButton("b").click());
  assert.equal(ui.pane("b").hasAttribute("inert"), false, "Beta is shown");
  assert.equal(
    ui.pane("a").hasAttribute("inert"),
    true,
    "Alpha stays mounted (history, zoom, scroll) but inert",
  );
  assert.equal(ui.docButton("b").getAttribute("aria-current"), "page");
  await ui.unmount();
});

test("workspace UI: a cross-document link opens its document at the item", async () => {
  const ui = await mountWorkspace({ defaultDocuments: docs() });
  const link = [...ui.pane("a").querySelectorAll("button")].find(
    (b) => b.textContent === "Notes about Goals",
  );
  assert.ok(link, "the link reads its target's current title (from document b)");
  await ui.act(() => link.click());
  await ui.until(() =>
    ui.pane("b")?.querySelector("[role=tree]")?.getAttribute("aria-activedescendant"),
  );
  assert.equal(ui.pane("b").hasAttribute("inert"), false, "Beta opened");
  assert.equal(
    ui.pane("b").querySelector("[role=tree]").getAttribute("aria-activedescendant"),
    "ol-row-b1",
    "and its item is the cursor",
  );
  await ui.unmount();
});

test("workspace UI: new document, rename in place, reorder from the keyboard; edits flow out", async () => {
  const changes = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    onDocumentsChange: (next) => changes.push(next),
  });
  const newButtons = [...ui.container.querySelectorAll("button")].filter(
    (b) =>
      b.textContent.trim() === "New document" || b.getAttribute("aria-label") === "New document",
  );
  assert.equal(
    newButtons.length,
    1,
    "one New document control (not a header icon and a footer button)",
  );
  await ui.act(() => newButtons[0].click());
  const input = ui.container.querySelector('input[aria-label="Document title"]');
  assert.ok(input, "a new document starts with its name being typed");
  await ui.act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "Gamma");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.act(() =>
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  const latest = () => changes.at(-1);
  assert.deepEqual(
    latest().map((d) => d.title),
    ["Alpha", "Gamma", "Beta", ""],
    "created after the open document, named",
  );
  const gamma = latest()[1].id;
  await ui.act(() =>
    ui.docButton(gamma).dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "ArrowDown",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.deepEqual(
    latest().map((d) => d.title),
    ["Alpha", "Beta", "Gamma", ""],
    "⌥⇧↓ moves it down",
  );
  // Typing in the open document reaches the host as the new document list.
  const handle = ui.handle.current.active();
  await ui.act(() => handle.focusItem(latest()[2].nodes[0].id, { edit: true }));
  const field = ui.pane(gamma).querySelector("[data-field=title]");
  await ui.act(() => setFieldValue(field, "First line"));
  await ui.frames();
  assert.equal(latest().find((d) => d.id === gamma).nodes[0].text, "First line");
  await ui.unmount();
});

test("workspace UI: search scope 'all documents' shows grouped results that open their document", async () => {
  const ui = await mountWorkspace({ defaultDocuments: docs() });
  const handle = ui.handle.current.active();
  await ui.act(() => handle.search("#launch"));
  const scope = ui.pane("a").querySelector('button[aria-label^="Search scope"]');
  assert.ok(scope, "the scope toggle is in the search field");
  await ui.act(() => scope.click());
  const results = [...ui.pane("a").querySelectorAll("[data-scope-result]")];
  assert.deepEqual(
    results.map((r) => r.textContent.replace(/\s+/g, " ").trim().slice(0, 13)),
    ["Ship it #laun", "Ship the beta"],
  );
  await ui.act(() => results[1].click());
  // Opening a document that was never mounted takes a few frames (it mounts, then reveals).
  await ui.until(() =>
    ui.pane("b")?.querySelector("[role=tree]")?.getAttribute("aria-activedescendant"),
  );
  assert.equal(ui.pane("b").hasAttribute("inert"), false);
  assert.equal(
    ui.pane("b").querySelector("[role=tree]").getAttribute("aria-activedescendant"),
    "ol-row-b2",
  );
  await ui.unmount();
});

test("workspace UI: in 'all documents' the status footer reports the shown results, across how many documents", async () => {
  const ui = await mountWorkspace({ defaultDocuments: docs() });
  const handle = ui.handle.current.active();
  await ui.act(() => handle.search("#launch"));
  const footer = () =>
    [...ui.pane("a").querySelectorAll("div")].find((el) =>
      /^Searching/.test(el.firstElementChild?.textContent ?? ""),
    )?.textContent ?? "";
  assert.match(footer(), /Searching · 1 match/, "this document: its own match");
  assert.match(footer(), /rows/);
  await ui.act(() => ui.pane("a").querySelector('button[aria-label^="Search scope"]').click());
  const shown = ui.pane("a").querySelectorAll("[data-scope-result]").length;
  assert.equal(shown, 2);
  assert.match(footer(), /Searching · 2 matches/, "the results the list shows");
  assert.match(footer(), /across 2 documents/);
  assert.doesNotMatch(footer(), /rows/, "not this document's row count");
  await ui.unmount();
});

test("workspace UI: controlled documents render what the host passes", async () => {
  let host = docs();
  const ui = await mountWorkspace({ documents: host, onDocumentsChange: (next) => (host = next) });
  await ui.rerender({
    documents: ws.renameDocument(host, "a", "Alpha prime"),
    onDocumentsChange: () => {},
  });
  assert.match(ui.docButton("a").textContent, /Alpha prime/);
  await ui.unmount();
});

/* ───────────── Harness ───────────── */

let React, act, createRoot;
const media = { "(min-width: 768px)": true };
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
  }
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "FocusEvent",
    "CustomEvent",
    "MutationObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "DOMParser",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? window : window[key],
      configurable: true,
      writable: true,
    });
  globalThis.ResizeObserver = window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = (query) => ({
    matches: !!media[query],
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollTo ??= function () {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.scrollTo = globalThis.scrollTo = () => {};
  globalThis.CSS = {
    escape: (value) => String(value).replace(/["\\]/g, "\\$&"),
    supports: () => false,
  };
  const error = console.error;
  console.error = (...args) =>
    String(args[0]).includes("not wrapped in act") ? undefined : error(...args);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  // The live title field's chunk first, so a title is never briefly the plain field.
  await (await load("/src/registry/outliner/live-field/load.ts")).loadLiveField();
  ({ createRoot } = await import("react-dom/client"));
}

async function mountHook(props) {
  await domEnv();
  const record = { ol: null };
  function Probe(p) {
    record.ol = hook.useOutliner(p);
    return null;
  }
  const r = createRoot(window.document.createElement("div"));
  await act(async () => r.render(React.createElement(Probe, props)));
  return {
    record,
    rerender: (next) => act(async () => r.render(React.createElement(Probe, next))),
    unmount: () => act(async () => r.unmount()),
  };
}

async function mountWorkspace(props) {
  await domEnv();
  const { OutlinerWorkspace } = await load("/src/registry/outliner/outliner-workspace.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  const render = (p) =>
    act(async () =>
      r.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(OutlinerWorkspace, { ...p, ref: handle }),
        ),
      ),
    );
  await render(props);
  const frames = () => act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
  return {
    container,
    handle,
    act: (fn) => act(async () => void fn()),
    frames,
    /** Wait (in 16 ms steps, up to 1.5 s) until `check()` is truthy: slow mounts never flake. */
    until: async (check) => {
      for (let i = 0; i < 90 && !check(); i++)
        await act(async () => new Promise((resolve) => setTimeout(resolve, 16)));
    },
    rerender: render,
    docButtons: () => [...container.querySelectorAll("[data-doc-open]")],
    docButton: (id) => container.querySelector(`[data-doc-open="${id}"]`),
    pane: (id) => container.querySelector(`[data-document="${id}"]`),
    unmount: async () => {
      await act(async () => r.unmount());
      container.remove();
    },
  };
}

test("workspace bookmarks stay scoped to their originating document and missing entries start empty", async () => {
  const changes = [];
  let bookmarks = { a: { items: ["a1"], searches: [{ query: "#alpha" }] } };
  const props = {
    defaultDocuments: docs(),
    bookmarks: { items: ["b1"], searches: [{ query: "legacy" }] },
    documentBookmarks: bookmarks,
    onDocumentBookmarksChange: (id, value) => changes.push({ id, value }),
  };
  const ui = await mountWorkspace(props);
  await ui.act(() => ui.handle.current.active().zoomTo("a1"));
  assert.ok(ui.pane("a").querySelector('button[aria-label="Remove bookmark"]'));
  await ui.act(() => ui.handle.current.open("b"));
  await ui.until(() => ui.pane("b")?.querySelector('[role="tree"]'));
  await ui.act(() => ui.handle.current.active().zoomTo("b1"));
  const add = ui.pane("b").querySelector('button[aria-label="Add bookmark"]');
  assert.ok(add, "a missing mapped document does not inherit global bookmarks");
  await ui.act(() => add.click());
  assert.equal(changes.at(-1).id, "b");
  assert.deepEqual(changes.at(-1).value, { items: ["b1"], searches: [] });
  bookmarks = { ...bookmarks, b: changes.at(-1).value };
  await ui.rerender({ ...props, documentBookmarks: bookmarks });
  await ui.act(() => ui.handle.current.active().search("#beta"));
  const trigger = ui.pane("b").querySelector('button[aria-label^="Bookmarks"]');
  await ui.act(() => {
    trigger.focus();
    const event = new window.KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    if (trigger.dispatchEvent(event)) trigger.click();
  });
  await ui.until(() => document.querySelector('[role="menu"]'));
  const save = [...document.querySelectorAll('[role="menuitem"]')].find((item) =>
    /^Save #beta/.test(item.textContent.trim()),
  );
  assert.ok(save, "the current document can save its search");
  await ui.act(() => save.click());
  assert.equal(changes.at(-1).id, "b");
  assert.deepEqual(changes.at(-1).value, { items: ["b1"], searches: [{ query: "#beta" }] });
  bookmarks = { ...bookmarks, b: changes.at(-1).value };
  await ui.rerender({ ...props, documentBookmarks: bookmarks });
  await ui.act(() => ui.handle.current.open("a"));
  assert.ok(ui.pane("a").querySelector('button[aria-label="Remove bookmark"]'));
  assert.deepEqual(bookmarks.a, { items: ["a1"], searches: [{ query: "#alpha" }] });
  assert.equal(
    ui.pane("a").querySelector('button[aria-label^="Bookmarks"]').getAttribute("aria-label"),
    "Bookmarks (2)",
  );
  await ui.unmount();
});

test("workspace preserves the inherited global bookmark callback when the document map is omitted", async () => {
  const legacy = [];
  const scoped = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    bookmarks: { items: ["a1"], searches: [] },
    onBookmarksChange: (value) => legacy.push(value),
    onDocumentBookmarksChange: (...value) => scoped.push(value),
  });
  await ui.act(() => ui.handle.current.active().zoomTo("a1"));
  const remove = ui.pane("a").querySelector('button[aria-label="Remove bookmark"]');
  assert.ok(remove);
  await ui.act(() => remove.click());
  assert.deepEqual(legacy, [{ items: [], searches: [] }]);
  assert.deepEqual(scoped, []);
  await ui.unmount();
});
