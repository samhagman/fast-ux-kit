// Focus return (keyboard model, phase 3): every overlay hands focus back where it came from —
// the tree with the same cursor row, a field with the same selection (a backward one too), or
// on touch the control that opened it. Never <body>. A row deleted while an overlay is open hands
// over to its neighbour. F6 / ⇧F6 leave and re-enter the tree; Tab on a row that can't indent says
// why. With focus on <body>, keys reach the outliner only when it is the only one mounted.
//
//   cd studio && node --test tests/outliner-focus-return.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { code, domEnv, isField, load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let React, act, createRoot;
before(async () => {
  await domEnv();
  React = await import("react");
  act = React.act;
  ({ createRoot } = await import("react-dom/client"));
});
after(() => stopVite());

const doc = () => [
  { id: "p", text: "Plan launch" },
  { id: "q", text: "Quarterly review !(2026-11-05)" },
  { id: "r", text: "Retro notes" },
  { id: "b", text: "Board", data: { view: "board" }, children: [{ id: "col", text: "Todo", children: [{ id: "card", text: "Card" }] }] },
];

/** DOM nodes by identity: a failing deep diff of two jsdom nodes never finishes. */
const same = (actual, expected, message) => assert.ok(actual === expected, message);
const keydown = (el, key, init = {}) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
const dialog = () => document.querySelector("[role=dialog]");
const itemMenu = () => document.querySelector("[data-item-menu=popover]");
const where = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return "<body>";
  return `${el.tagName.toLowerCase()}${el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""}${el.dataset?.field ? `[field=${el.dataset.field}]` : ""}`;
};
/** Let closes, rAF hand-offs and the field's own caret effects settle. */
const settle = async (ui) => {
  for (let i = 0; i < 4; i++) await ui.frames();
};

/* ───────────── Where focus starts ───────────── */

async function fromRow(ui, id) {
  await ui.select(id);
  same(document.activeElement, ui.tree());
}
/** Editing `id` with a BACKWARD selection over [1, 4) (anchor 4, head 1). */
async function fromText(ui, id) {
  await ui.edit(id);
  const field = ui.field();
  assert.ok(field, "editing");
  await ui.act(() => {
    field.setSelectionRange(1, 4, "backward");
    field.dispatchEvent(new window.Event("select", { bubbles: true }));
  });
}
function expectRow(ui, id, label) {
  same(document.activeElement, ui.tree(), `${label}: focus is the tree (was ${where()})`);
  assert.equal(ui.ol().state.caret?.id, id, `${label}: the cursor is still on ${id}`);
}
function expectText(ui, id, label) {
  const field = ui.field();
  assert.ok(field, `${label}: focus is a field (was ${where()})`);
  assert.equal(field.closest("[data-row]")?.dataset.row, id, `${label}: the same row`);
  assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection], [1, 4, "backward"], `${label}: the same selection, backward`);
}

/* ───────────── Every overlay: open, close, check ───────────── */

const escape = (ui) => ui.key("Escape");
const overlays = [
  {
    name: "search (Esc)",
    open: async (ui) => {
      await ui.key("f", { metaKey: true, code: "KeyF" });
      await waitFor(() => document.activeElement?.getAttribute("aria-label") === "Search outline");
    },
    close: escape,
  },
  {
    name: "search (close button)",
    open: async (ui) => {
      await ui.key("f", { metaKey: true, code: "KeyF" });
      await waitFor(() => document.activeElement?.getAttribute("aria-label") === "Search outline");
    },
    close: (ui) => ui.click(ui.root().querySelector('button[aria-label="Close search"]')),
  },
  {
    name: "⌘K palette",
    open: async (ui) => {
      await ui.key("k", { metaKey: true, code: "KeyK" });
      await waitFor(() => dialog()?.querySelector("[cmdk-input]") === document.activeElement);
    },
    close: escape,
  },
  {
    name: "⌘K Move to… finder",
    open: async (ui) => {
      await ui.act(() => {
        ui.ui().setPaletteMode("move");
        ui.ui().setPaletteOpen(true);
      });
      await waitFor(() => /Move 1 item/.test(dialog()?.querySelector("[cmdk-input]")?.getAttribute("placeholder") ?? ""));
    },
    close: escape,
  },
  {
    name: "⌘/ shortcut sheet",
    open: async (ui) => {
      await ui.key("/", { metaKey: true, code: "Slash" });
      await waitFor(() => document.querySelector("[data-shortcut-sheet]"));
    },
    close: escape,
  },
  {
    name: "item menu (/ or ⇧F10)",
    open: async (ui, mode) => {
      if (mode === "row") await ui.key("/");
      else await ui.key("F10", { shiftKey: true });
      await waitFor(() => itemMenu()?.querySelector("[data-item-menu-input]") === document.activeElement);
    },
    close: escape,
  },
  {
    name: "date picker (item menu › Pick a date…)",
    open: async (ui, mode) => {
      if (mode === "row") await ui.key("/");
      else await ui.key("F10", { shiftKey: true });
      const input = await waitFor(() => itemMenu()?.querySelector("[data-item-menu-input]"));
      await ui.act(() => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "pick");
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
      await ui.frames();
      await ui.act(() => keydown(document.activeElement, "Enter"));
      await waitFor(() => document.querySelector("[data-date-picker]")?.contains(document.activeElement));
    },
    close: escape,
  },
  {
    name: "find and replace",
    open: async (ui) => {
      await ui.key("f", { metaKey: true, altKey: true, code: "KeyF" });
      await waitFor(() => document.activeElement?.getAttribute("aria-label") === "Find");
    },
    close: escape,
  },
  {
    name: "Settings › Reset all shortcuts",
    open: async (ui) => {
      await ui.act(() => ui.ui().updateSettings({ shortcuts: { complete: ["Mod+Alt+k"] } }));
      await ui.act(() => ui.ui().setSettingsOpen(true));
      const settings = await waitFor(() => document.querySelector("[data-outliner-settings]"));
      const tab = [...settings.querySelectorAll("[role=tab], button")].find((el) => /^Shortcuts$/.test(el.textContent.trim()));
      await ui.act(() => {
        tab.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, cancelable: true }));
        tab.click();
      });
      const reset = await waitFor(() => [...settings.querySelectorAll("button")].find((el) => /Reset all/.test(el.textContent) && !el.disabled));
      await ui.act(() => {
        reset.focus();
        reset.click();
      });
      await settle(ui);
      assert.ok(settings.contains(document.activeElement), `Reset all keeps focus in the panel (was ${where()})`);
      assert.equal(ui.ui().settings.shortcuts?.complete, undefined, "the remap is gone");
    },
    close: escape,
  },
];

for (const overlay of overlays)
  for (const mode of ["row", "text"])
    test(`focus return: ${overlay.name}, from ${mode === "row" ? "the tree" : "a field (backward selection)"}`, async () => {
      const ui = await mountOutliner({ defaultValue: doc() });
      if (mode === "row") await fromRow(ui, "q");
      else await fromText(ui, "q");
      await overlay.open(ui, mode);
      await overlay.close(ui);
      await settle(ui);
      if (mode === "row") expectRow(ui, "q", overlay.name);
      else expectText(ui, "q", overlay.name);
      await ui.unmount();
    });

/* ───────────── Overlays that change the view: the new view's surface ───────────── */

for (const mode of ["row", "text"]) {
  test(`focus return: ⌘K "View as › Board", from ${mode === "row" ? "the tree" : "a field"}: the board has focus`, async () => {
    const ui = await mountOutliner({ defaultValue: [...doc(), { id: "v", text: "Plans", children: [{ id: "v1", text: "Column" }] }] });
    if (mode === "row") await fromRow(ui, "v");
    else await ui.edit("v");
    await ui.key("k", { metaKey: true, code: "KeyK" });
    const entry = await waitFor(() => dialog()?.querySelector('[data-command="view.board"]'));
    await ui.act(() => entry.click());
    await settle(ui);
    const board = ui.root().querySelector("[data-board]");
    assert.ok(board, "the board is shown");
    same(document.activeElement, board, `the board has the keyboard (was ${where()})`);
    await ui.unmount();
  });
  test(`zoom into a board (⌘]), from ${mode === "row" ? "the tree" : "a field"}: the board has focus, never <body>`, async () => {
    const ui = await mountOutliner({ defaultValue: doc() });
    if (mode === "row") await fromRow(ui, "b");
    else await ui.edit("b");
    await ui.key("]", { metaKey: true, code: "BracketRight" });
    await settle(ui);
    assert.equal(ui.ol().state.hoistedId, "b");
    const board = ui.root().querySelector("[data-board]");
    assert.ok(board, "the board is shown");
    if (mode === "row") same(document.activeElement, board, `the board has the keyboard (was ${where()})`);
    // Typing in its title: the caret stays in that title, now the zoomed one.
    else assert.equal(document.activeElement?.getAttribute("aria-label"), "Zoomed item title", `the zoomed title keeps the caret (was ${where()})`);
    await ui.unmount();
  });
}

test("zoom into an article: its scroller takes focus (no cursor there), never <body>", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "a", text: "Essay", data: { view: "article" }, children: [{ id: "a1", text: "Para" }] }, { id: "z", text: "Other" }] });
  await fromRow(ui, "a");
  await ui.key("]", { metaKey: true, code: "BracketRight" });
  await settle(ui);
  assert.equal(ui.ol().state.hoistedId, "a");
  same(document.activeElement, ui.root().querySelector("[data-outliner-scroll]"), `the article scroller (was ${where()})`);
  await ui.unmount();
});

/* ───────────── The origin row is deleted while the overlay is open ───────────── */

test("focus return: the row an overlay came from is deleted meanwhile → its neighbour, never <body>", async () => {
  for (const mode of ["row", "text"]) {
    const ui = await mountOutliner({ defaultValue: doc() });
    if (mode === "row") await fromRow(ui, "q");
    else await fromText(ui, "q");
    await ui.key("k", { metaKey: true, code: "KeyK" });
    await waitFor(() => dialog());
    // Another tab (or a collaborator) removes it.
    await ui.act(() => ui.handle.current.removeItems(["q"]));
    await escape(ui);
    await settle(ui);
    expectRow(ui, "r", `${mode}: the next row`);
    await ui.unmount();
  }
  // The last row: the previous one.
  const ui = await mountOutliner({ defaultValue: doc().slice(0, 3) });
  await fromRow(ui, "r");
  await ui.key("k", { metaKey: true, code: "KeyK" });
  await waitFor(() => dialog());
  await ui.act(() => ui.handle.current.removeItems(["r"]));
  await escape(ui);
  await settle(ui);
  expectRow(ui, "q", "the last row: the previous one");
  await ui.unmount();
});

/* ───────────── Esc → Enter ───────────── */

test("Esc then Enter resumes editing at the saved caret, not at the end; after moving away, Enter edits at the end", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await fromText(ui, "p");
  await ui.key("Escape");
  await settle(ui);
  same(document.activeElement, ui.tree(), "Esc: row mode");
  await ui.key("Enter");
  await settle(ui);
  expectText(ui, "p", "Enter after Esc");
  await ui.key("Escape");
  await ui.key("ArrowDown");
  await ui.key("ArrowUp");
  await ui.key("Enter");
  await settle(ui);
  const field = ui.field();
  assert.deepEqual([field.selectionStart, field.selectionEnd], ["Plan launch".length, "Plan launch".length], "the cursor left the row: Enter edits at the end");
  await ui.unmount();
});

/* ───────────── Touch: back to the trigger ───────────── */

test("touch: the ⋯ menu closes back to its ⋯ button (the trigger), never the tree or <body>", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    const trigger = ui.row("q").querySelector("[data-row-actions]");
    assert.ok(trigger, "the row's ⋯ button");
    await ui.act(() => {
      trigger.focus();
      trigger.click();
    });
    await waitFor(() => document.querySelector("[data-outliner-sheet], [role=menu]"));
    await escape(ui);
    await settle(ui);
    await waitFor(() => !document.querySelector("[data-outliner-sheet], [role=menu]"));
    await settle(ui);
    same(document.activeElement, trigger, `the ⋯ button (was ${where()})`);
    // Nothing reopens it later (a press is not a long press) and nothing takes focus from the trigger.
    await ui.act(() => new Promise((resolve) => setTimeout(resolve, 700)));
    same(document.activeElement, trigger, `still the ⋯ button once the sheet is fully gone (was ${where()})`);
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});

/* ───────────── F6 regions and Tab ───────────── */

test("F6 / ⇧F6 from an unindentable row with no selection: toolbar ⇄ tree; with search open, toolbar → search → tree", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await fromRow(ui, "p");
  await ui.key("Escape");
  assert.equal(ui.selection().length, 0, "no selection");
  assert.equal(ui.ol().state.caret?.id, "p", "the cursor stays on p");
  const before = JSON.stringify(ui.value());
  await ui.key("Tab");
  assert.equal(JSON.stringify(ui.value()), before, "Tab on the first row changes nothing");
  assert.match(ui.live(), /Can't indent here: .*F6/, "and says why, and how to leave");
  same(document.activeElement, ui.tree(), "Tab stays in the tree");
  const toolbar = () => ui.root().querySelector("[data-outliner-toolbar]");
  await ui.key("F6");
  assert.ok(toolbar().contains(document.activeElement), `F6: the toolbar (was ${where()})`);
  await ui.key("F6");
  same(document.activeElement, ui.tree(), "F6 again: back to the tree");
  assert.equal(ui.ol().state.caret?.id, "p", "on the same cursor row");
  await ui.key("F6", { shiftKey: true });
  assert.ok(toolbar().contains(document.activeElement), "⇧F6 from the tree: the toolbar");
  await ui.key("F6", { shiftKey: true });
  same(document.activeElement, ui.tree(), "⇧F6 again: the tree");
  // With search open, it is a region of its own.
  await ui.act(() => ui.ui().setSearchOpen(true));
  await settle(ui);
  const search = () => ui.root().querySelector('input[aria-label="Search outline"]');
  await ui.act(() => ui.tree().focus());
  await ui.key("F6");
  assert.ok(toolbar().contains(document.activeElement) && document.activeElement !== search(), "tree → toolbar");
  await ui.key("F6");
  same(document.activeElement, search(), "toolbar → search");
  await ui.key("F6");
  same(document.activeElement, ui.tree(), "search → tree");
  await ui.key("F6", { shiftKey: true });
  same(document.activeElement, search(), "⇧F6: tree → search");
  await ui.unmount();
});

/* ───────────── Keys on <body> ───────────── */

const bodyKey = (key, init = {}) => act(async () => {
  document.body.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
  await new Promise((resolve) => setTimeout(resolve, 0));
});
const blur = () => act(async () => document.activeElement?.blur?.());

test("fresh load, one outliner: ⌘K, ⌘F, ⌘/ and ↓ work with focus on <body>", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await blur();
  same(document.activeElement, document.body);
  await bodyKey("k", { metaKey: true, code: "KeyK" });
  assert.equal(ui.ui().paletteOpen, true, "⌘K opens the palette");
  await ui.act(() => ui.ui().setPaletteOpen(false));
  await settle(ui);
  await blur();
  await bodyKey("f", { metaKey: true, code: "KeyF" });
  assert.equal(ui.ui().searchOpen, true, "⌘F opens search");
  await ui.act(() => ui.ui().setSearchOpen(false));
  await settle(ui);
  await blur();
  await bodyKey("/", { metaKey: true, code: "Slash" });
  assert.equal(ui.ui().shortcutsOpen, true, "⌘/ opens the shortcut sheet");
  await ui.act(() => ui.ui().setShortcutsOpen(false));
  await settle(ui);
  await blur();
  await bodyKey("ArrowDown");
  same(document.activeElement, ui.tree(), "↓ puts the keyboard in the tree");
  await ui.unmount();
});

test("fresh load, two outliners: keys on <body> reach neither", async () => {
  const one = await mountOutliner({ defaultValue: doc() });
  const two = await mountOutliner({ defaultValue: doc() });
  await blur();
  await bodyKey("k", { metaKey: true, code: "KeyK" });
  await bodyKey("f", { metaKey: true, code: "KeyF" });
  await bodyKey("/", { metaKey: true, code: "Slash" });
  await bodyKey("ArrowDown");
  for (const ui of [one, two]) {
    assert.equal(ui.ui().paletteOpen, false, "no palette");
    assert.equal(ui.ui().searchOpen, false, "no search");
    assert.equal(ui.ui().shortcutsOpen, false, "no shortcut sheet");
  }
  same(document.activeElement, document.body, "↓ went nowhere");
  // Once one of them was used, it is the one that answers.
  await one.select("p");
  await blur();
  await bodyKey("k", { metaKey: true, code: "KeyK" });
  assert.equal(one.ui().paletteOpen, true, "the last one used answers");
  assert.equal(two.ui().paletteOpen, false);
  await one.unmount();
  await two.unmount();
});

test('a "/" typed while a closing menu leaves focus on <body> opens the item menu once focus is back', async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await fromRow(ui, "q");
  await blur();
  await bodyKey("/");
  await settle(ui);
  assert.ok(itemMenu(), "the item menu opened");
  assert.equal(ui.ui().itemMenu?.rowId, "q", "on the cursor row");
  await escape(ui);
  await settle(ui);
  expectRow(ui, "q", "and closes back to the tree");
  await ui.unmount();
});

/* ───────────── The workspace: ⌘O and quick capture ───────────── */

async function mountWorkspace(props) {
  const { OutlinerWorkspace } = await load("/src/registry/outliner/outliner-workspace.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  await act(async () => r.render(React.createElement(TooltipProvider, null, React.createElement(OutlinerWorkspace, { ...props, ref: handle }))));
  const frames = () => act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
  const pane = (id) => container.querySelector(`[data-document="${id}"]`);
  return {
    container,
    pane,
    frames,
    tree: (id) => pane(id).querySelector("[role=tree]"),
    act: (fn) => act(async () => void (await fn())),
    unmount: async () => {
      await act(async () => r.unmount());
      container.remove();
    },
  };
}
const workspaceDocs = () => [
  { id: "a", title: "Alpha", nodes: [{ id: "a1", text: "First item" }, { id: "a2", text: "Second item" }] },
  { id: "c", title: "Gamma", nodes: [{ id: "c1", text: "Other" }] },
];
const windowKey = (key, init) => window.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));

for (const surface of ["⌘O finder", "quick capture"])
  for (const mode of ["row", "text"])
    test(`workspace focus return: ${surface}, from ${mode === "row" ? "the tree" : "a field (backward selection)"}`, async () => {
      const ws = await mountWorkspace({ defaultDocuments: workspaceDocs(), defaultLayout: { folders: [], starred: [], inboxId: null }, defaultActiveId: "a" });
      const tree = ws.tree("a");
      await ws.act(() => tree.focus());
      await ws.act(() => keydown(tree, "ArrowDown"));
      await ws.frames();
      const cursor = tree.getAttribute("aria-activedescendant");
      assert.ok(cursor, "a cursor row");
      if (mode === "text") {
        await ws.act(() => keydown(tree, "Enter"));
        await ws.frames();
        const field = document.activeElement;
        assert.ok(isField(field), "editing");
        await ws.act(() => {
          field.setSelectionRange(1, 4, "backward");
          field.dispatchEvent(new window.Event("select", { bubbles: true }));
        });
      }
      if (surface === "⌘O finder") {
        await ws.act(() => windowKey("o", { metaKey: true, code: "KeyO" }));
        await waitFor(() => document.querySelector('input[aria-label="Find document"]') === document.activeElement);
      } else {
        await ws.act(() => windowKey(" ", { metaKey: true, shiftKey: true, code: "Space" }));
        // A dialog with a fine pointer, a sheet on a phone (jsdom has no desktop media query).
        await waitFor(() => document.querySelector("[data-capture-dialog] textarea, [data-capture-sheet] textarea") === document.activeElement);
      }
      await ws.act(() => keydown(document.activeElement, "Escape"));
      for (let i = 0; i < 4; i++) await ws.frames();
      if (mode === "row") {
        same(document.activeElement, ws.tree("a"), `${surface}: the tree (was ${where()})`);
        assert.equal(ws.tree("a").getAttribute("aria-activedescendant"), cursor, "the same cursor row");
      } else {
        const field = document.activeElement;
        assert.ok(isField(field), `${surface}: a field (was ${where()})`);
        assert.ok(ws.pane("a").contains(field), "in the same document");
        assert.deepEqual([field.selectionStart, field.selectionEnd, field.selectionDirection], [1, 4, "backward"], "the same selection, backward");
      }
      await ws.unmount();
    });

test("workspace: F6 walks sidebar → toolbar → tree and back with ⇧F6", async () => {
  const ws = await mountWorkspace({ defaultDocuments: workspaceDocs(), defaultLayout: { folders: [], starred: [], inboxId: null }, defaultActiveId: "a" });
  const sidebar = ws.container.querySelector("[data-focus-region=sidebar]");
  if (!sidebar) {
    // jsdom has no desktop media query: the sidebar is a sheet there. Region order is still
    // checked inside the pane (toolbar ⇄ tree); the browser pass covers the sidebar.
    const tree = ws.tree("a");
    await ws.act(() => tree.focus());
    await ws.act(() => keydown(tree, "F6"));
    assert.ok(ws.pane("a").querySelector("[data-outliner-toolbar]").contains(document.activeElement), "tree → toolbar");
    await ws.act(() => keydown(document.activeElement, "F6"));
    same(document.activeElement, ws.tree("a"), "toolbar → tree");
    await ws.unmount();
    return;
  }
  const tree = ws.tree("a");
  await ws.act(() => tree.focus());
  await ws.act(() => keydown(tree, "F6"));
  assert.ok(sidebar.contains(document.activeElement), `tree → sidebar (was ${where()})`);
  assert.equal(document.activeElement.dataset.docOpen, "a", "on the open document");
  await ws.act(() => keydown(document.activeElement, "F6"));
  assert.ok(ws.pane("a").querySelector("[data-outliner-toolbar]").contains(document.activeElement), "sidebar → toolbar");
  await ws.act(() => keydown(document.activeElement, "F6"));
  same(document.activeElement, ws.tree("a"), "toolbar → tree");
  await ws.act(() => keydown(document.activeElement, "F6", { shiftKey: true }));
  assert.ok(ws.pane("a").querySelector("[data-outliner-toolbar]").contains(document.activeElement), "⇧F6: tree → toolbar");
  await ws.unmount();
});

void code;
