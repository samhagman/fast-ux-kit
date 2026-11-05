// Board view: any item shown as columns (children) and cards (grandchildren). The pure model
// (board.ts), the view toggle, interchange round trips, and the real component in jsdom driven
// with keyboard and pointer events the way a user drives it.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, core, board, interchange, hook;
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
  board = await load("/src/registry/outliner/board.ts");
  interchange = await load("/src/registry/outliner/interchange.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
});
after(() => vite?.close());

const doc = () => [
  {
    id: "b",
    text: "Sprint",
    data: { view: "board" },
    children: [
      {
        id: "todo",
        text: "To do",
        children: [
          { id: "c1", text: "One", checked: false },
          { id: "c2", text: "Two" },
          {
            id: "c3",
            text: "Three",
            children: [
              { id: "c3a", text: "inside", checked: true },
              { id: "c3b", text: "more", checked: false },
            ],
          },
        ],
      },
      { id: "doing", text: "Doing", children: [{ id: "c4", text: "Four" }] },
      { id: "done", text: "Done" },
    ],
  },
  { id: "x", text: "Elsewhere" },
];
const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const kids = (nodes, id) => (find(nodes, id)?.children ?? []).map((n) => n.id);

/* ───────────── The pure model ───────────── */

test("board: columns are children, cards grandchildren; hide-completed filters cards only", () => {
  const b = doc()[0];
  const columns = board.boardColumns(b);
  assert.deepEqual(
    columns.map((c) => c.node.id),
    ["todo", "doing", "done"],
  );
  assert.deepEqual(
    columns[0].cards.map((c) => c.id),
    ["c1", "c2", "c3"],
  );
  const done = {
    ...b,
    children: [
      {
        ...b.children[0],
        children: [
          { id: "k", text: "k", checked: true },
          { id: "l", text: "l" },
        ],
      },
    ],
  };
  assert.deepEqual(
    board.boardColumns(done, { hideCompleted: true })[0].cards.map((c) => c.id),
    ["l"],
  );
  assert.equal(board.isBoard(b), true);
  assert.equal(board.isBoard(doc()[1]), false);
});

test("board: card meta counts what is inside a card", () => {
  const meta = board.cardMeta(doc()[0].children[0].children[2]);
  assert.deepEqual(meta, { descendants: 2, tasks: 2, done: 1, hasNote: false });
});

test("board: drop targets index the column WITHOUT the moving cards (the core drop contract)", () => {
  const b = doc()[0];
  assert.deepEqual(
    board.cardDrop(b, ["c1"], "todo", "c3"),
    { parentId: "todo", index: 1 },
    "before c3 once c1 has left",
  );
  assert.deepEqual(
    board.cardDrop(b, ["c1"], "doing", null),
    { parentId: "doing", index: 1 },
    "end of another column",
  );
  assert.deepEqual(
    board.cardDrop(b, ["c4"], "done", null),
    { parentId: "done", index: 0 },
    "into an empty column",
  );
  assert.equal(board.cardDrop(b, ["c1"], "nope", null), null);
  assert.deepEqual(board.columnDrop(b, "done", "todo"), { parentId: "b", index: 0 });
  assert.deepEqual(board.columnDrop(b, "todo", null), { parentId: "b", index: 2 });
  assert.equal(
    board.isNoopDrop(b, ["c2"], board.cardDrop(b, ["c2"], "todo", "c3")),
    true,
    "dropping a card where it already is",
  );
  assert.equal(board.isNoopDrop(b, ["c2"], board.cardDrop(b, ["c2"], "todo", "c1")), false);
});

test("board: arrow travel walks columns, clamps, and lands empty columns on their header", () => {
  const columns = board.boardColumns(doc()[0]);
  const at = (id) => board.locateOnBoard(columns, id);
  const go = (id, step) => board.idAt(columns, board.stepBoard(columns, at(id), step));
  assert.equal(go("c1", "down"), "c2");
  assert.equal(go("c3", "down"), "c3", "clamped at the end");
  assert.equal(go("c1", "up"), "todo", "above the first card is the column header");
  assert.equal(go("c3", "right"), "c4", "same position, clamped to the shorter column");
  assert.equal(go("c4", "right"), "done", "an empty column lands on its header");
  assert.equal(go("todo", "left"), "todo", "no column to the left");
  assert.equal(go("c2", "end"), "c3");
  assert.equal(go("c3", "home"), "c1");
  assert.equal(
    board.idAt(columns, board.stepBoard(columns, null, "down")),
    "c1",
    "entering the board lands on the first card",
  );
});

/* ───────────── Toggle and round trips ───────────── */

test("board: setView toggles data.view (one undo step) and list clears it", async () => {
  const view = await mountHook({ defaultValue: doc() });
  await view.run((ol) => ol.commands.setView(["x"], "board"));
  assert.equal(find(view.record.ol.state.nodes, "x").data.view, "board");
  await view.run((ol) => ol.commands.setView(["x"], "list"));
  assert.equal(
    find(view.record.ol.state.nodes, "x").data?.view,
    undefined,
    "list is the default: no data left behind",
  );
  await view.run((ol) => ol.dispatch({ type: "undo" }));
  assert.equal(find(view.record.ol.state.nodes, "x").data.view, "board");
  await view.unmount();
});

test("board: JSON, OPML and Markdown exports keep the view; clipboard Markdown stays plain", async () => {
  const nodes = doc();
  const json = interchange.exportOutline(nodes, "json");
  const back = interchange.importOutline(json);
  assert.equal(back[0].data.view, "board", "JSON round trip");
  const opml = interchange.exportOutline(nodes, "opml");
  assert.match(opml, /_view="board"/);
  await domEnv();
  assert.equal(interchange.importOutline(opml)[0].data.view, "board", "OPML round trip");
  assert.match(
    interchange.exportOutline(nodes, "markdown"),
    /^- Sprint <!-- ol view=board -->\n {2}- To do/,
    "Markdown carries the view in its metadata comment",
  );
  assert.equal(
    interchange.importOutline(interchange.exportOutline(nodes, "markdown"))[0].data.view,
    "board",
    "Markdown round trip",
  );
  assert.match(
    interchange.exportOutline(nodes, "markdown", { metadata: false }),
    /^- Sprint\n {2}- To do/,
    "clipboard Markdown stays plain",
  );
});

test("board: a card drag between columns is ONE core drop and one undo step", async () => {
  const view = await mountHook({ defaultValue: doc() });
  const b = find(view.record.ol.state.nodes, "b");
  const drop = board.cardDrop(b, ["c1"], "doing", "c4");
  await view.run((ol) =>
    ol.dispatch({ type: "drop", ids: ["c1"], parentId: drop.parentId, index: drop.index }),
  );
  assert.deepEqual(kids(view.record.ol.state.nodes, "doing"), ["c1", "c4"]);
  assert.deepEqual(kids(view.record.ol.state.nodes, "todo"), ["c2", "c3"]);
  await view.run((ol) => ol.dispatch({ type: "undo" }));
  assert.deepEqual(kids(view.record.ol.state.nodes, "todo"), ["c1", "c2", "c3"]);
  assert.deepEqual(kids(view.record.ol.state.nodes, "doing"), ["c4"]);
  await view.unmount();
});

/* ───────────── The real component (jsdom) ───────────── */

test("board UI: zoomed into a board item renders columns and cards, not the outline", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "b" });
  const columns = [...ui.container.querySelectorAll("[data-board-column]")].map(
    (c) => c.dataset.boardColumn,
  );
  assert.deepEqual(columns, ["todo", "doing", "done"]);
  assert.deepEqual(ui.cards("todo"), ["c1", "c2", "c3"]);
  assert.equal(
    ui.container.querySelector("[role=tree]"),
    null,
    "no outline rows while the board shows",
  );
  const toggle = ui.container.querySelector("[role=radiogroup]");
  assert.equal(toggle.querySelector("[aria-checked=true]").getAttribute("aria-label"), "Board");
  assert.match(
    ui.container.querySelector('[data-row="c3"]').textContent,
    /1\/2/,
    "a card shows task progress inside it",
  );
  await ui.unmount();
});

test("board UI: arrows travel, ⌥⇧→ moves a card to the next column, ⌘Z puts it back, Space completes", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "b" });
  const surface = ui.board();
  await ui.act(() => surface.focus());
  assert.equal(
    surface.getAttribute("aria-activedescendant"),
    "ol-row-c1",
    "focusing the board puts the cursor on the first card",
  );
  await ui.key("ArrowDown");
  assert.equal(surface.getAttribute("aria-activedescendant"), "ol-row-c2");
  await ui.key("ArrowRight");
  assert.equal(surface.getAttribute("aria-activedescendant"), "ol-row-c4");
  await ui.key("ArrowLeft");
  assert.equal(
    surface.getAttribute("aria-activedescendant"),
    "ol-row-c1",
    "back at the same position (the first card)",
  );
  await ui.key("ArrowDown");
  await ui.key("ArrowRight", { altKey: true, shiftKey: true });
  assert.deepEqual(
    ui.cards("doing"),
    ["c4", "c2"],
    "the card moved to the same position, clamped to the end",
  );
  assert.deepEqual(kids(ui.value(), "todo"), ["c1", "c3"]);
  assert.match(ui.live(), /Moved to Doing/);
  assert.equal(
    surface.getAttribute("aria-activedescendant"),
    "ol-row-c2",
    "the cursor travels with the card",
  );
  await ui.key("z", { metaKey: true });
  assert.deepEqual(ui.cards("todo"), ["c1", "c2", "c3"], "one undo step");
  await ui.key("ArrowUp");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c1").checked, true, "Space completes the cursor card");
  await ui.unmount();
});

test("board UI: Enter edits the card; Enter at the end adds the next card; Escape returns to the board", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "b" });
  await ui.act(() => ui.board().focus());
  await ui.key("Enter");
  const field = ui.container.querySelector('[data-row="c1"] [data-field=title]');
  assert.ok(field, "the card's title is a field now");
  await ui.act(() =>
    field.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  const cards = ui.cards("todo");
  assert.equal(cards.length, 4);
  assert.equal(cards[1] !== "c2" && cards[2], "c2", "a new card right after the one being edited");
  const next = ui.container.querySelector(`[data-row="${cards[1]}"] [data-field=title]`);
  assert.ok(next, "and it is being edited");
  await ui.act(() =>
    next.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(
    core.findOutlineNode(ui.value(), cards[1]).parentId,
    "todo",
    "Tab never nests a card inside another",
  );
  await ui.act(() =>
    next.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(document.activeElement, ui.board(), "Escape hands the keyboard back to the board");
  assert.equal(ui.board().getAttribute("aria-activedescendant"), `ol-row-${cards[1]}`);
  await ui.unmount();
});

test("board UI: a mouse drag of a card into another column is one drop (real pointer events)", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "b" });
  // jsdom has no layout: give columns and cards boxes the way a browser would lay them out.
  const box = (el, left, top, width, height) =>
    (el.getBoundingClientRect = () => ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
    }));
  const columns = [...ui.container.querySelectorAll("[data-board-column]")];
  columns.forEach((col, i) => {
    box(col, 300 * i, 0, 280, 400);
    box(col.querySelector("[data-board-cards]"), 300 * i + 8, 40, 264, 300);
    [...col.querySelectorAll("[data-card]")].forEach((card, j) =>
      box(card, 300 * i + 8, 40 + j * 50, 264, 44),
    );
  });
  box(ui.board(), 0, 0, 900, 400);
  const card = ui.container.querySelector('[data-row="c2"]');
  const fire = (target, type, x, y) =>
    target.dispatchEvent(
      new window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
  const pointer = (target, type, x, y) => {
    const event = new window.MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperty(event, "pointerId", { value: 1 });
    Object.defineProperty(event, "pointerType", { value: "mouse" });
    target.dispatchEvent(event);
  };
  await ui.act(() => pointer(card, "pointerdown", 100, 110));
  await ui.act(() => pointer(window, "pointermove", 120, 110));
  await ui.act(() => pointer(window, "pointermove", 420, 50));
  await new Promise((resolve) => setTimeout(resolve, 40));
  await ui.act(() => pointer(window, "pointerup", 420, 50));
  fire(card, "click", 420, 50);
  assert.deepEqual(
    ui.cards("doing"),
    ["c2", "c4"],
    "dropped above Four (the pointer was over its top half)",
  );
  await ui.key("z", { metaKey: true });
  assert.deepEqual(ui.cards("todo"), ["c1", "c2", "c3"], "one undo step");
  await ui.unmount();
});

test("board UI: the zoomed title's List/Board control switches the view (an edit, undoable)", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "b" });
  const list = ui.container.querySelector('[role=radio][aria-label="List"]');
  await ui.act(() => list.click());
  assert.ok(ui.container.querySelector("[role=tree]"), "the outline is back");
  assert.equal(find(ui.value(), "b").data?.view, undefined);
  await ui.act(() => ui.container.querySelector('[role=radio][aria-label="Board"]').click());
  assert.ok(ui.board());
  await ui.unmount();
});

/* ───────────── Harness ───────────── */

let React, act, createRoot;
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
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollTo ??= function () {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
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
  function Probe() {
    record.ol = hook.useOutliner(props);
    return null;
  }
  const r = createRoot(window.document.createElement("div"));
  await act(async () => r.render(React.createElement(Probe)));
  return {
    record,
    run: (fn) => act(async () => void fn(record.ol)),
    unmount: () => act(async () => r.unmount()),
  };
}

async function mountOutliner(props) {
  await domEnv();
  const { Outliner } = await load("/src/registry/outliner/outliner.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  await act(async () =>
    r.render(
      React.createElement(
        TooltipProvider,
        null,
        React.createElement(Outliner, { ...props, ref: handle }),
      ),
    ),
  );
  const ui = {
    container,
    act: (fn) => act(async () => void fn()),
    board: () => container.querySelector("[data-board]"),
    cards: (column) =>
      [...container.querySelectorAll(`[data-board-column="${column}"] [data-card]`)].map(
        (card) => card.dataset.row,
      ),
    value: () => handle.current.getValue(),
    live: () =>
      container.querySelector("[data-slot=outliner] > [aria-live=polite]")?.textContent ?? "",
    key: (key, init = {}) =>
      act(async () => {
        (document.activeElement ?? ui.board()).dispatchEvent(
          new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
        );
        await new Promise((resolve) => setTimeout(resolve, 0));
      }),
    unmount: async () => {
      await act(async () => r.unmount());
      container.remove();
    },
  };
  return ui;
}
