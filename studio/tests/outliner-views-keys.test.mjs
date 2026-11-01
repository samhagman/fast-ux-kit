// The board and the mind map share the list's row keys (row-keys.ts) through a ViewNav,
// one cursor (the core caret row) and the same linger rule under Hide completed; search steps
// between matches; the ⌘/ sheet is generated from FIXED_KEYS and SHORTCUTS; announcements say
// what keys did, once. Driven in jsdom with keyboard events.
//
//   cd studio && node --test tests/outliner-views-keys.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let core, keymap, mindmap, board;
before(async () => {
  core = await load("@fux/core");
  keymap = await load("/src/registry/outliner/keymap.ts");
  mindmap = await load("/src/registry/outliner/mindmap.ts");
  board = await load("/src/registry/outliner/board.ts");
});
after(() => stopVite());

const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;
const same = (a, b) => a === b; // never assert.equal two DOM nodes (jsdom's diff never ends)

/* ───────────── Board ───────────── */

const boardDoc = () => [
  {
    id: "b",
    text: "Sprint",
    data: { view: "board" },
    children: [
      { id: "todo", text: "To do", children: [{ id: "c1", text: "One", checked: false }, { id: "c2", text: "Two", checked: false }] },
      { id: "doing", text: "Doing", children: [{ id: "c3", text: "Three", checked: false }, { id: "c4", text: "Four" }, { id: "c5", text: "Five" }] },
      { id: "done", text: "Done", children: [{ id: "c6", text: "Shipped", checked: true }] },
    ],
  },
];
const cursorOf = (surface) => surface.getAttribute("aria-activedescendant")?.replace(/^ol-row-/, "") ?? null;

test("board: Space×2 under Hide completed keeps the last visible card shown and targeted; leaving hides it; undo after leaving shows it, open", async () => {
  const ui = await mountOutliner({ defaultValue: boardDoc(), hoistedId: "b" });
  await ui.act(() => ui.ol().setView((view) => ({ ...view, hideCompleted: true })));
  const surface = () => ui.container.querySelector("[data-board]");
  await waitFor(() => !ui.container.querySelector('[data-row="c6"]'));
  await ui.act(() => surface().focus());
  // The last visible card of the board: c2 (the bottom of To do).
  await ui.key("ArrowDown");
  assert.equal(cursorOf(surface()), "c2");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c2").checked, true, "Space completes");
  assert.ok(ui.container.querySelector('[data-row="c2"]'), "the completed card lingers (it is still the target)");
  assert.equal(cursorOf(surface()), "c2", "and keeps the cursor");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c2").checked, false, "Space again reopens the same card");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c2").checked, true);
  await ui.key("ArrowUp");
  assert.equal(cursorOf(surface()), "c1");
  await waitFor(() => !ui.container.querySelector('[data-row="c2"]'));
  assert.equal(ui.ol().linger.ids.size, 0, "leaving lets it hide");
  await ui.key("z", { metaKey: true });
  assert.equal(find(ui.value(), "c2").checked, false, "undo after leaving reopens it");
  assert.ok(ui.container.querySelector('[data-row="c2"]'), "and it shows again (it matches the filter now)");
  assert.equal(cursorOf(surface()), "c2", "undo brings the cursor back to what it changed (core history)");
  assert.equal(ui.ol().linger.ids.size, 0, "undo never re-adds released linger");
  assert.match(ui.live(), /Undone/, "undo is said aloud");
  await ui.unmount();
});

test("board: arrows walk the board in its visible order; Tab leaves cards alone; the keymap works on cards", async () => {
  const ui = await mountOutliner({ defaultValue: boardDoc(), hoistedId: "b" });
  const surface = () => ui.container.querySelector("[data-board]");
  await ui.act(() => surface().focus());
  const order = board.boardOrder(board.boardColumns(find(ui.value(), "b")));
  assert.deepEqual(order, ["todo", "c1", "c2", "doing", "c3", "c4", "c5", "done", "c6"]);
  // ↓ walks a column top to bottom, → goes column to column at the same position.
  const walk = [];
  for (let i = 0; i < 3; i++) {
    walk.push(cursorOf(surface()));
    await ui.key("ArrowDown");
  }
  assert.deepEqual(walk, ["c1", "c2", "c2"], "the first column, in order, clamped at the bottom");
  await ui.key("Home");
  assert.equal(cursorOf(surface()), "c1");
  const across = [cursorOf(surface())];
  for (let i = 0; i < 2; i++) {
    await ui.key("ArrowRight");
    across.push(cursorOf(surface()));
  }
  assert.deepEqual(across, ["c1", "c3", "c6"], "columns in order");
  await ui.key("End");
  assert.equal(cursorOf(surface()), "c6");
  await ui.key("ArrowLeft");
  await ui.key("End");
  assert.equal(cursorOf(surface()), "c5", "End: the bottom of the column");
  // Tab is not indent on a board: the browser takes it.
  const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await ui.act(() => surface().dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, false);
  assert.equal(core.findOutlineNode(ui.value(), "c5").parentId, "doing");
  // ⇧⌘C (checkbox) now answers on a card, through the registry, and says so.
  await ui.key("c", { ctrlKey: true, shiftKey: true, code: "KeyC" });
  assert.equal(find(ui.value(), "c5").checked, false, "a checkbox was added");
  assert.match(ui.live(), /Checkbox added/);
  // ⌘↵ completes through the same chord as the list.
  await ui.key("Enter", { ctrlKey: true });
  assert.equal(find(ui.value(), "c5").checked, true);
  // The keymap's move keys move a card within its column (and ⌥⇧→ across, as before).
  await ui.key("ArrowUp", { altKey: true, shiftKey: true });
  assert.deepEqual(find(ui.value(), "doing").children.map((n) => n.id), ["c3", "c5", "c4"]);
  await ui.unmount();
});

test("board: Delete takes the cursor card and lands on its neighbour in board order", async () => {
  const ui = await mountOutliner({ defaultValue: boardDoc(), hoistedId: "b" });
  const surface = () => ui.container.querySelector("[data-board]");
  await ui.act(() => surface().focus());
  await ui.key("ArrowRight");
  assert.equal(cursorOf(surface()), "c3");
  await ui.key("Backspace");
  assert.equal(find(ui.value(), "c3"), undefined);
  await ui.frames();
  assert.equal(cursorOf(surface()), "c4", "the next card in the board's order");
  await ui.unmount();
});

/* ───────────── Mind map ───────────── */

const mapDoc = () => [
  {
    id: "m",
    text: "Launch",
    data: { view: "mindmap" },
    children: [
      { id: "a", text: "Evals", checked: false, children: [{ id: "a1", text: "Red team", checked: false }] },
      { id: "b", text: "Docs", checked: false },
      { id: "c", text: "Comms", checked: false },
    ],
  },
];

test("mind map: pure travel and folding on the arrows", () => {
  const root = mapDoc()[0];
  const open = mindmap.mindMapGraph(root, new Set(["m", "a"]));
  assert.deepEqual(open.order, ["m", "a", "a1", "b", "c"], "visible order");
  assert.equal(mindmap.foldMindMap(open, "a", "left"), "a", "inward on an open branch folds it");
  assert.equal(mindmap.foldMindMap(open, "a", "right"), null, "outward on an open branch travels");
  assert.equal(mindmap.foldMindMap(open, "b", "left"), null, "a leaf: inward travels to the parent");
  assert.equal(mindmap.foldMindMap(open, "m", "left"), null, "the centre never folds");
  const folded = mindmap.mindMapGraph(root, new Set(["m"]));
  assert.equal(mindmap.foldMindMap(folded, "a", "right"), "a", "outward on a folded branch unfolds it");
  assert.equal(mindmap.foldMindMap(folded, "a", "left", true), "a", "mirrored for right-to-left");
  const hidden = mindmap.mindMapGraph({ ...root, children: [{ ...root.children[0], checked: true }, ...root.children.slice(1)] }, new Set(["m", "a"]), { hideCompleted: true });
  assert.deepEqual(hidden.order, ["m", "b", "c"], "Hide completed drops a done branch");
  const kept = mindmap.mindMapGraph({ ...root, children: [{ ...root.children[0], checked: true }, ...root.children.slice(1)] }, new Set(["m", "a"]), { hideCompleted: true, linger: new Set(["a"]) });
  assert.deepEqual(kept.order, ["m", "a", "a1", "b", "c"], "unless it lingers");
});

test("mind map: Space completes (×2 under Hide completed on the last node), ←/→ fold, Enter zooms in; one cursor with the outline", async () => {
  const zooms = [];
  const ui = await mountOutliner({ defaultValue: mapDoc(), hoistedId: "m", onHoistChange: (id) => zooms.push(id) });
  const map = await waitFor(() => ui.container.querySelector("[data-mindmap]"), 8000);
  await ui.act(() => ui.ol().setView((view) => ({ ...view, hideCompleted: true })));
  await ui.act(() => map.focus());
  const cursor = () => ui.ol().state.caret?.id;
  assert.equal(cursor(), "m", "entering the map puts the cursor on its centre");
  assert.equal(map.getAttribute("aria-activedescendant")?.endsWith("-mind-m"), true, "aria-activedescendant names it");
  // Travel: the first branch, its child, back, then the last branch (Comms).
  await ui.key("ArrowRight");
  assert.equal(cursor(), "a");
  await ui.key("ArrowDown");
  assert.equal(cursor(), "b", "↓: the next branch on the same side, in order");
  await ui.key("ArrowDown");
  assert.equal(cursor(), "c", "the last node");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c").checked, true, "Space completes, it no longer folds");
  assert.equal(cursor(), "c", "the cursor stays on it");
  assert.ok(ui.ol().linger.ids.has("c"), "it lingers under Hide completed");
  await ui.key(" ");
  assert.equal(find(ui.value(), "c").checked, false, "Space again reopens it");
  await ui.key(" ");
  await ui.key("ArrowUp");
  assert.equal(cursor(), "b");
  assert.equal(ui.ol().linger.ids.size, 0, "leaving releases it (it hides)");
  await ui.key("z", { metaKey: true });
  assert.equal(find(ui.value(), "c").checked, false, "undo after leaving reopens it");
  assert.equal(cursor(), "c", "and brings the cursor back to it (core history)");
  // The map lays out asynchronously (ELK, then the glide), so a node that comes back is drawn
  // once that layout lands, not within the key's tick.
  const shown = await waitFor(() => ui.container.querySelector('[data-mind-node="c"]'), 8000).catch(() => null);
  assert.ok(shown, "it shows: open again, not lingering");
  assert.equal(ui.ol().linger.ids.size, 0);
  // ←/→ fold: inward on an open branch folds it, outward unfolds it.
  await ui.key("ArrowUp");
  await ui.key("ArrowUp");
  assert.equal(cursor(), "a");
  assert.equal(ui.ol().state.expandedIds.has("a"), true);
  await ui.key("ArrowLeft");
  assert.equal(ui.ol().state.expandedIds.has("a"), false, "← folds the branch it is on");
  assert.match(ui.live(), /Folded/);
  await ui.key("ArrowRight");
  assert.equal(ui.ol().state.expandedIds.has("a"), true, "→ unfolds it");
  assert.match(ui.live(), /Unfolded/);
  // Tab leaves the map alone.
  const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
  await ui.act(() => map.dispatchEvent(tab));
  assert.equal(tab.defaultPrevented, false);
  // Enter zooms in (a map has no field to edit in).
  await ui.key("Enter");
  assert.equal(zooms.at(-1), "a", "Enter asks to zoom into the node");
  await ui.unmount();
});

/* ───────────── Search ───────────── */

const searchDoc = () => [
  { id: "p", text: "Plan", children: [{ id: "p1", text: "audit logs" }, { id: "p2", text: "other" }] },
  { id: "q", text: "audit trail" },
  { id: "r", text: "notes", children: [{ id: "r1", text: "final audit" }] },
];
const searchInput = () => document.querySelector('input[data-focus-region="search"]');

test("search: ⌘F twice comes back to the query; Enter / ⇧Enter step matches and wrap", async () => {
  const ui = await mountOutliner({ defaultValue: searchDoc() });
  await ui.select("p");
  await ui.key("f", { ctrlKey: true, code: "KeyF" });
  await ui.frames();
  const input = searchInput();
  assert.ok(input && same(document.activeElement, input), "⌘F focuses search");
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "audit");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const cursor = () => ui.ol().state.caret?.id;
  const steps = [];
  for (let i = 0; i < 4; i++) {
    await ui.key("Enter");
    steps.push(cursor());
  }
  assert.deepEqual(steps, ["p1", "q", "r1", "p1"], "Enter: next match only (context rows skipped), wrapping");
  assert.ok(same(document.activeElement, input), "the field keeps focus, so Enter steps again");
  assert.match(ui.live(), /1 of 3/, "the position is said");
  await ui.key("Enter", { shiftKey: true });
  assert.equal(cursor(), "r1", "⇧Enter steps back and wraps");
  await ui.key("ArrowDown");
  assert.ok(same(document.activeElement, ui.tree()), "↓ goes into the tree");
  assert.equal(cursor(), "r1", "on the match Enter stepped to");
  // ⌘F again, from the tree, with search already open: back into the field, query selected.
  await ui.key("f", { ctrlKey: true, code: "KeyF" });
  assert.ok(same(document.activeElement, searchInput()), "⌘F refocuses the open search");
  assert.equal(searchInput().selectionStart, 0);
  assert.equal(searchInput().selectionEnd, "audit".length, "with its query selected");
  assert.equal(ui.ol().view.query, "audit", "the query and filter stay");
  // Flat results moved to ⌥↵ (⇧↵ steps back).
  await ui.key("Enter", { altKey: true });
  assert.equal(ui.ol().view.searchMode, "flat");
  await ui.unmount();
});

/* ───────────── ⇧Enter opens the note ───────────── */

test("row mode: ⇧Enter opens the cursor row's note (an empty one too); read-only and locked refuse", async () => {
  const doc = () => [{ id: "a", text: "Alpha" }, { id: "b", text: "Beta", data: { note: "Some note" } }, { id: "l", text: "Locked" }];
  let ui = await mountOutliner({ defaultValue: doc(), isLocked: (node) => node.id === "l" });
  await ui.select("a");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.field, "note", "the note field of a row without a note");
  assert.equal(ui.ol().state.caret?.id, "a");
  await ui.key("Escape");
  await ui.select("b");
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.equal(ui.field()?.dataset.field, "note");
  assert.equal(ui.field().selectionStart, "Some note".length, "at the end of the note");
  await ui.key("Escape");
  await ui.select("l");
  const before = JSON.stringify(ui.value());
  await ui.key("Enter", { shiftKey: true });
  await ui.frames();
  assert.ok(!ui.field(), "a locked row opens no field");
  assert.equal(JSON.stringify(ui.value()), before);
  await ui.unmount();
  ui = await mountOutliner({ defaultValue: doc(), readOnly: true });
  await ui.select("a");
  const shiftEnter = new window.KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
  await ui.act(() => ui.tree().dispatchEvent(shiftEnter));
  await ui.frames();
  assert.ok(!ui.field(), "read-only: no field");
  await ui.unmount();
});

/* ───────────── Range indent through the UI ───────────── */

test("range Tab where the first row can't indent: nothing moves and the reason is said", async () => {
  const doc = () => [{ id: "p", text: "Parent", children: [{ id: "a", text: "A" }, { id: "b", text: "B" }] }];
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a");
  await ui.key("ArrowDown", { shiftKey: true });
  assert.deepEqual(ui.selection().sort(), ["a", "b"]);
  const before = JSON.stringify(ui.value());
  await ui.key("Tab");
  assert.equal(JSON.stringify(ui.value()), before, "no partial indent");
  assert.match(ui.live(), /Can't indent here: there is no item above it/);
  assert.deepEqual(ui.selection().sort(), ["a", "b"], "the range stays the target");
  await ui.unmount();
});

/* ───────────── ⌘/ sheet ───────────── */

test("⌘/ lists every FIXED_KEYS entry and every chord", async () => {
  const ui = await mountOutliner({ defaultValue: searchDoc(), defaultSettings: { shortcuts: { settings: ["Mod+Alt+,"] } } });
  await ui.act(() => ui.ui().setShortcutsOpen(true));
  const sheet = await waitFor(() => document.querySelector("[data-shortcut-sheet]"));
  const rows = [...sheet.querySelectorAll("section")].flatMap((section) =>
    [...section.querySelectorAll("dl > div")].map((el) => ({ group: section.querySelector("h3").textContent, label: el.querySelector("dt").textContent, keys: el.querySelector("dd").textContent })),
  );
  const isMac = false; // jsdom's navigator is not Apple
  for (const def of keymap.FIXED_KEYS) {
    const row = rows.find((r) => r.group === "Rows" && r.label === def.label);
    assert.ok(row, `the sheet lists ${def.command} (${def.label})`);
    assert.equal(row.keys, keymap.fixedKeyText(def, isMac));
  }
  const map = ui.ui().keymap;
  for (const def of keymap.SHORTCUTS) {
    const row = rows.find((r) => r.group === def.group && r.label === def.label);
    assert.ok(row, `the sheet lists the chord ${def.id}`);
    assert.equal(row.keys, keymap.shortcutLabel(map, def.id, isMac) || "—", `${def.id}: its live keys`);
  }
  assert.match(rows.find((r) => r.label === "Settings").keys, /Ctrl Alt ,/, "a remap shows");
  assert.ok(rows.some((r) => r.label === "Edit note" && r.keys === "Shift Enter"), "⇧Enter is a fixed key");
  await ui.unmount();
});

/* ───────────── Announcements ───────────── */

test("announcements: move, fold, hide completed, checkbox and undo are said once; delete only by its toast", async () => {
  const doc = () => [{ id: "a", text: "A", children: [{ id: "a1", text: "A1" }] }, { id: "b", text: "B" }, { id: "c", text: "C", checked: true }];
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("b");
  await ui.key("ArrowUp", { altKey: true, shiftKey: true });
  assert.equal(ui.value()[0].id, "b");
  assert.match(ui.live(), /^Moved up/);
  await ui.key("ArrowDown", { altKey: true, shiftKey: true });
  assert.match(ui.live(), /^Moved down/);
  await ui.key("z", { ctrlKey: true });
  assert.match(ui.live(), /^Undone/);
  await ui.key("z", { ctrlKey: true, shiftKey: true });
  assert.match(ui.live(), /^Redone/);
  await ui.select("a");
  await ui.key("ArrowLeft");
  assert.match(ui.live(), /^Folded/);
  await ui.key(".", { ctrlKey: true, code: "Period" });
  assert.match(ui.live(), /^Unfolded/, "the fold chord too");
  await ui.key("h", { ctrlKey: true, altKey: true, code: "KeyH" });
  assert.match(ui.live(), /^Completed items hidden/);
  await ui.key("h", { ctrlKey: true, altKey: true, code: "KeyH" });
  assert.match(ui.live(), /^Completed items shown/);
  await ui.key("c", { ctrlKey: true, shiftKey: true, code: "KeyC" });
  assert.match(ui.live(), /^Checkbox added/);
  await ui.key("c", { ctrlKey: true, shiftKey: true, code: "KeyC" });
  assert.match(ui.live(), /^Checkbox removed/);
  const said = ui.live();
  await ui.key("Backspace");
  assert.equal(find(ui.value(), "a"), undefined);
  assert.equal(ui.live(), said, "delete's receipt is the Undo toast's alone (no second readout)");
  await ui.unmount();
});

/* ───────────── Palette, submenus, article, Settings ───────────── */

test("palette: aria-activedescendant names the highlighted command as soon as it opens", async () => {
  const ui = await mountOutliner({ defaultValue: searchDoc() });
  await ui.select("p");
  await ui.act(() => {
    ui.ui().setPaletteMode("all");
    ui.ui().setPaletteOpen(true);
  });
  const input = await waitFor(() => document.querySelector("[cmdk-input]"));
  const id = await waitFor(() => input.getAttribute("aria-activedescendant"));
  const option = document.getElementById(id);
  assert.ok(option, "it names a real option");
  assert.equal(option.getAttribute("aria-selected"), "true", "the highlighted one");
  await ui.unmount();
});

test("submenus: Esc goes back one level, focus on the item that opened it", async () => {
  const { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } = await load("/src/components/ui/dropdown-menu.tsx");
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const h = React.createElement;
  await React.act(async () =>
    root.render(
      h(DropdownMenu, { defaultOpen: true },
        h(DropdownMenuTrigger, null, "Options"),
        h(DropdownMenuContent, null,
          h(DropdownMenuItem, null, "First"),
          h(DropdownMenuSub, null,
            h(DropdownMenuSubTrigger, null, "Show levels"),
            h(DropdownMenuSubContent, null, h(DropdownMenuItem, null, "Show 1 level")))))),
  );
  // Open the submenu the way a keyboard does: → on its item.
  const trigger = await waitFor(() => document.querySelector("[data-slot=dropdown-menu-sub-trigger]"));
  await React.act(async () => trigger.focus());
  await React.act(async () => trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true })));
  const sub = await waitFor(() => document.querySelector("[data-slot=dropdown-menu-sub-content]"));
  const item = sub.querySelector("[role=menuitem]");
  await React.act(async () => item.focus());
  await React.act(async () => item.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await waitFor(() => !document.querySelector("[data-slot=dropdown-menu-sub-content]"));
  assert.ok(document.querySelector("[data-slot=dropdown-menu-content]"), "the parent menu stays open");
  assert.equal(document.activeElement?.textContent, "Show levels", "focus is back on the submenu's item");
  await React.act(async () => document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
  await waitFor(() => !document.querySelector("[data-slot=dropdown-menu-content]"));
  await React.act(async () => root.unmount());
  host.remove();
});

test("article: item links and tags are tab stops there, not in the outline", async () => {
  const doc = () => [
    { id: "art", text: "Story", data: { view: "article" }, children: [{ id: "x", text: "See [[Other|o]] and #docs" }] },
    { id: "o", text: "Other #docs" },
  ];
  const ui = await mountOutliner({ defaultValue: doc(), hoistedId: "art" });
  const article = await waitFor(() => ui.container.querySelector("[data-article]"));
  const chips = [...article.querySelectorAll("button")].filter((el) => /Other|#docs|docs/.test(el.textContent));
  assert.ok(chips.length >= 2, "the link and the tag render as buttons");
  for (const chip of chips) assert.equal(chip.tabIndex, 0, `${chip.textContent} is a tab stop`);
  await ui.unmount();
  const list = await mountOutliner({ defaultValue: doc() });
  const listChip = [...list.container.querySelectorAll('[data-row="o"] button')].find((el) => /docs/.test(el.textContent));
  assert.equal(listChip?.tabIndex, -1, "in the outline the tree stays one tab stop");
  await list.unmount();
});

test("Settings: tabs are a tablist; each shortcut section is one tab stop with arrow roving", async () => {
  const ui = await mountOutliner({ defaultValue: searchDoc() });
  await ui.act(() => ui.ui().setSettingsOpen(true));
  const dialog = await waitFor(() => document.querySelector("[data-outliner-settings]"));
  const tablist = dialog.querySelector("[role=tablist]");
  assert.ok(tablist, "the section switcher is a tablist");
  const tabs = [...tablist.querySelectorAll("[role=tab]")];
  assert.equal(tabs.length, 2);
  assert.equal(tabs[0].getAttribute("aria-selected"), "true");
  await ui.click(tabs[1]);
  const panel = await waitFor(() => dialog.querySelector('[role=tabpanel][data-settings-tab="shortcuts"]'));
  assert.equal(panel.getAttribute("aria-labelledby"), tabs[1].id);
  const lists = [...panel.querySelectorAll("ul")];
  for (const list of lists) {
    const stops = [...list.querySelectorAll("button")].filter((el) => el.tabIndex >= 0 && !el.disabled);
    assert.equal(stops.length, 1, `${list.getAttribute("aria-label")}: one tab stop`);
  }
  const stopsInPanel = [...panel.querySelectorAll("button,input")].filter((el) => el.tabIndex >= 0 && !el.disabled).length;
  assert.ok(stopsInPanel <= 2 + lists.length, `${stopsInPanel} tab stops on the panel (was ~31)`);
  const first = lists[0].querySelector("[data-shortcut-record]");
  await ui.act(() => first.focus());
  await ui.act(() => first.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true })));
  const second = lists[0].querySelectorAll("[data-shortcut-record]")[1];
  assert.ok(same(document.activeElement, second), "↓ moves to the next shortcut");
  assert.equal(second.tabIndex, 0, "and it becomes the section's tab stop");
  assert.equal(first.tabIndex, -1);
  for (const el of [...tabs, first]) assert.match(el.className, /focus-visible:ring/, "a focus ring");
  assert.match(first.className, /coarse:h-11/, "44px on touch");
  await ui.unmount();
});
