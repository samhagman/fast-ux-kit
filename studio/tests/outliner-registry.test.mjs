// One registry, every surface (keyboard model, phase 2): the item actions are defined once
// (item-actions.tsx) and the `/` item menu, ⋯, right-click, the phone sheet, ⌘K and ⌘/ all show
// the same command ids, labels, enablement and live key hints. The item menu filters as you
// type and runs nothing until Enter; in a title its "/query" is transient (never stored, never in
// history, removed by Esc). A host command that throws never breaks a menu; a menu that outlived
// its target refuses.
//
//   cd studio && node --test tests/outliner-registry.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { code, domEnv, load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let registry, keymap, itemMenu, Toaster;
before(async () => {
  // The DOM first: the menu modules (Radix, cmdk) read it when they load.
  await domEnv();
  registry = await load("/src/registry/outliner/item-actions.tsx");
  keymap = await load("/src/registry/outliner/keymap.ts");
  itemMenu = await load("/src/registry/outliner/item-menu.tsx");
  ({ Toaster } = await load("/src/components/ui/sonner.tsx"));
});
after(() => stopVite());

const source = (name) => readFileSync(fileURLToPath(new URL(`../src/registry/outliner/${name}`, import.meta.url)), "utf8");

const doc = () => [
  {
    id: "p",
    text: "Plan launch",
    children: [
      { id: "c1", text: "Draft copy" },
      { id: "c2", text: "Review copy", checked: true },
      { id: "c3", text: "Ship" },
    ],
  },
  { id: "q", text: "Other" },
  { id: "r", text: "Retro" },
];
const find = (nodes, id) => {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = node.children && find(node.children, id);
    if (hit) return hit;
  }
  return undefined;
};
/** The document without edit stamps (they change on every edit by design). */
const content = (nodes) => JSON.parse(JSON.stringify(nodes, (key, value) => (key === "editedAt" || key === "createdAt" ? undefined : value)));
const ran = [];
const hostCommands = (ids) => [
  { id: "calendar", label: `Add ${ids.length} to calendar`, run: (targets) => ran.push(["calendar", targets]) },
  { id: "archive", label: "Archive", disabled: true, run: () => ran.push(["archive"]) },
];
const mount = (props = {}) => mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["p"], itemCommands: hostCommands, ...props });

/* ───────────── Reading a surface ───────────── */

const describe = (el) => ({
  label: el.querySelector("[data-command-label]")?.textContent ?? "",
  disabled: el.getAttribute("aria-disabled") === "true" || (el.hasAttribute("data-disabled") && el.getAttribute("data-disabled") !== "false") || !!el.disabled,
  hint: el.querySelector("[data-command-hint]")?.textContent ?? "",
  current: el.hasAttribute("data-current"),
});
const keydown = (el, key, init = {}) => el.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }));
const typeInto = (el, value) => {
  const proto = el.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  el.setSelectionRange(value.length, value.length);
  el.dispatchEvent(new window.Event("input", { bubbles: true }));
};

/** The registry's own answer for the fixture row: every leaf action, with its page's enablement. */
function expected(ui, ids = ["p"], rowId = "p") {
  const entries = registry.itemActions({ ol: ui.ol(), ui: ui.ui(), ids, row: ui.ol().rowOf(rowId), isMac: false });
  const out = new Map();
  for (const { action } of registry.flattenActions(entries)) out.set(action.commandId, { label: action.label, disabled: !!action.disabled, hint: action.shortcut ?? "", current: !!action.current, chord: action.chord });
  return { entries, out };
}

const popover = () => document.querySelector("[data-item-menu=popover]");
const menuInput = () => popover()?.querySelector("[data-item-menu-input]");
const selectedItem = () => popover()?.querySelector("[cmdk-item][data-selected=true]")?.dataset.command ?? null;
const pageLabel = () => popover()?.querySelector("[data-item-menu-back]") ? popover().querySelector("[data-item-menu-back]").nextElementSibling.textContent : null;

async function openMenu(ui, id = "p") {
  await ui.select(id);
  await ui.key("/");
  await ui.frames();
  await waitFor(() => menuInput() && document.activeElement === menuInput());
}
async function filter(ui, text) {
  await ui.act(() => typeInto(menuInput(), text));
  await ui.frames();
}

async function itemMenuSurface(ui) {
  await openMenu(ui);
  const out = new Map();
  const collect = () => {
    for (const el of popover().querySelectorAll("[data-command-kind=action]")) out.set(el.dataset.command, describe(el));
    return [...popover().querySelectorAll("[data-command-kind=page]")].map((el) => el.dataset.command);
  };
  for (const page of collect()) {
    await ui.click(popover().querySelector(`[data-command="${page}"]`));
    await waitFor(() => popover().querySelector("[data-item-menu-back]"));
    collect();
    await ui.key("ArrowLeft");
    await waitFor(() => !popover().querySelector("[data-item-menu-back]"));
  }
  await ui.key("Escape");
  await waitFor(() => !popover());
  return out;
}

async function radixSurface(ui, open) {
  await open();
  const root = await waitFor(() => document.querySelector("[role=menu]"));
  const out = new Map();
  const collect = (menu) => {
    for (const el of menu.querySelectorAll("[data-command-kind=action]")) out.set(el.dataset.command, describe(el));
  };
  collect(root);
  for (const trigger of [...root.querySelectorAll("[data-command-kind=page]")]) {
    await ui.act(() => {
      trigger.focus();
      keydown(trigger, "ArrowRight");
    });
    const sub = await waitFor(() => [...document.querySelectorAll("[role=menu]")].find((menu) => menu !== root && menu.querySelector("[data-command-kind=action]")));
    collect(sub);
    await ui.act(() => keydown(document.activeElement && sub.contains(document.activeElement) ? document.activeElement : sub.querySelector("[role=menuitem]"), "ArrowLeft"));
    await waitFor(() => !sub.isConnected);
  }
  await ui.act(() => keydown(document.activeElement ?? root, "Escape"));
  await waitFor(() => !document.querySelector("[role=menu]"));
  await ui.frames();
  return out;
}
const openDropdown = (ui) => async () => {
  await ui.select("p");
  const button = ui.row("p").querySelector("[data-row-menu]");
  await ui.act(() => {
    const down = new window.MouseEvent("pointerdown", { bubbles: true, cancelable: true, button: 0 });
    Object.defineProperty(down, "pointerType", { value: "mouse" });
    button.dispatchEvent(down);
  });
};
const openContext = (ui) => async () => {
  await ui.select("p");
  await ui.act(() => ui.row("p").querySelector("[data-ol-title]").dispatchEvent(new window.MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 10, clientY: 10 })));
};

async function sheetSurface(ui) {
  await ui.act(() => ui.ui().setSheet({ rowId: "p", ids: ["p"] }));
  const sheet = await waitFor(() => document.querySelector("[data-outliner-sheet]"));
  const out = new Map();
  const collect = () => {
    for (const el of sheet.querySelectorAll("[data-command-kind=action]")) out.set(el.dataset.command, describe(el));
    return [...sheet.querySelectorAll("[data-command-kind=page]")].map((el) => el.dataset.command);
  };
  for (const page of collect()) {
    await ui.click(sheet.querySelector(`[data-command="${page}"]`));
    await waitFor(() => sheet.querySelector("[data-sheet-back]"));
    collect();
    await ui.click(sheet.querySelector("[data-sheet-back]"));
    await waitFor(() => !sheet.querySelector("[data-sheet-back]"));
  }
  await ui.act(() => ui.ui().setSheet(null));
  return out;
}

async function paletteSurface(ui) {
  await ui.select("p");
  await ui.act(() => ui.ui().setPaletteOpen(true));
  const group = await waitFor(() => document.querySelector("[role=dialog] [data-command-group=item]"));
  const out = new Map();
  for (const el of group.querySelectorAll("[data-command]")) out.set(el.dataset.command, describe(el));
  await ui.act(() => ui.ui().setPaletteOpen(false));
  await ui.frames();
  return out;
}

/* ───────────── The surface matrix ───────────── */

test("surface matrix: the item menu, ⋯, right-click, the phone sheet and ⌘K show the same commands, labels, enablement and hints; ⌘/ shows every chord", async () => {
  const ui = await mount();
  await ui.select("p");
  const { out: want } = expected(ui);
  // The registry itself: every page reached, a host command (and a disabled one), something disabled.
  for (const id of ["item.complete", "date.tomorrow", "date.pick", "repeat.weekly", "select.children", "select.completed", "view.board", "format.h1", "color.red", "sort.az", "item.indent", "host.calendar", "host.archive", "item.delete"])
    assert.ok(want.has(id), `the registry has ${id}`);
  assert.equal(want.get("host.calendar").label, "Add 1 to calendar");
  assert.equal(want.get("host.archive").disabled, true);
  assert.equal(want.get("date.clear").disabled, true, "nothing to clear: disabled everywhere");
  // A chord's hint is the live keymap's, everywhere.
  for (const [id, entry] of want) if (entry.chord) assert.equal(entry.hint, keymap.primaryShortcut(ui.ui().keymap, entry.chord, false) ?? "", `${id} hints its chord`);
  assert.equal(want.get("item.delete").hint, "Del", "Windows names the key");

  const surfaces = {
    menu: await itemMenuSurface(ui),
    dropdown: await radixSurface(ui, openDropdown(ui)),
    context: await radixSurface(ui, openContext(ui)),
    sheet: await sheetSurface(ui),
    palette: await paletteSurface(ui),
  };
  for (const [name, got] of Object.entries(surfaces)) {
    const exceptions = new Set(registry.SURFACE_EXCEPTIONS[name]);
    const ids = [...want.keys()].filter((id) => !exceptions.has(id));
    assert.deepEqual([...got.keys()].sort(), ids.sort(), `${name}: the same command ids`);
    for (const id of ids) {
      const { chord: _chord, ...entry } = want.get(id);
      // The phone sheet has no keyboard: it shows no key hints (the one written difference).
      const hint = name === "sheet" ? "" : entry.hint;
      assert.deepEqual(got.get(id), { ...entry, hint }, `${name}: ${id}`);
    }
  }
  // ⌘/ lists keys: every chorded command's key is on the sheet ("chorded-only").
  assert.equal(registry.SURFACE_EXCEPTIONS.shortcuts, "chorded-only");
  await ui.act(() => ui.ui().setShortcutsOpen(true));
  const sheet = await waitFor(() => document.querySelector("[data-shortcut-sheet]"));
  for (const [id, entry] of want) if (entry.chord && entry.hint) assert.ok(sheet.textContent.includes(entry.hint), `⌘/ shows ${id}'s ${entry.hint}`);
  assert.match(sheet.textContent, /Item actions/, "and the item menu's own keys");
  await ui.unmount();
});

test("one command through every surface makes the same change (Complete)", async () => {
  const results = [];
  const run = async (how) => {
    const ui = await mount();
    await how(ui);
    await waitFor(() => find(ui.value(), "p")?.data?.completed === true);
    results.push(content(ui.value()));
    await ui.unmount();
  };
  const click = async (ui, selector) => ui.click(await waitFor(() => document.querySelector(selector)));
  await run(async (ui) => {
    await openMenu(ui);
    await filter(ui, "complete");
    await ui.key("Enter");
  });
  await run(async (ui) => {
    await openDropdown(ui)();
    await click(ui, '[role=menu] [data-command="item.complete"]');
  });
  await run(async (ui) => {
    await openContext(ui)();
    await click(ui, '[role=menu] [data-command="item.complete"]');
  });
  await run(async (ui) => {
    await ui.act(() => ui.ui().setSheet({ rowId: "p", ids: ["p"] }));
    await click(ui, '[data-outliner-sheet] [data-command="item.complete"]');
    await ui.frames();
  });
  await run(async (ui) => {
    await ui.select("p");
    await ui.act(() => ui.ui().setPaletteOpen(true));
    await click(ui, '[data-command-group=item] [data-command="item.complete"]');
  });
  await run(async (ui) => {
    await ui.select("p");
    await ui.key("Enter", { metaKey: true });
  });
  assert.equal(results.length, 6);
  for (const result of results.slice(1)) assert.deepEqual(result, results[0]);
});

/* ───────────── Host commands that throw ───────────── */

async function mountWithToaster(props) {
  const { createElement, Fragment } = await import("react");
  const all = { defaultValue: doc(), defaultExpandedIds: ["p"], ...props };
  return mountOutliner(all, { wrap: (make) => createElement(Fragment, null, make(all), createElement(Toaster, { duration: 60_000 })) });
}
const toastText = () => [...document.querySelectorAll("[data-sonner-toast]")].map((el) => el.textContent).join(" | ");

test("a host command that throws (listing, label or run) leaves every menu usable and says so", async () => {
  // Listing throws.
  let ui = await mountWithToaster({ itemCommands: () => { throw new Error("listing broke"); } });
  const quiet = console.error;
  console.error = () => {};
  try {
    await radixSurface(ui, openDropdown(ui)).then((menu) => assert.ok(menu.has("item.complete") && menu.has("item.delete"), "the built-in entries are all there"));
    await waitFor(() => /couldn't load/.test(toastText()));
    await openMenu(ui);
    await filter(ui, "complete");
    await ui.key("Enter");
    assert.equal(find(ui.value(), "p").data?.completed, true, "the menu still runs");
    await ui.unmount();

    // A label getter throws: only that command is left out.
    ui = await mountWithToaster({ itemCommands: () => [{ id: "bad", get label() { throw new Error("label broke"); }, run() {} }, { id: "ok", label: "Fine one", run() {} }] });
    const menu = await radixSurface(ui, openDropdown(ui));
    assert.ok(menu.has("host.ok") && !menu.has("host.bad"));
    await ui.unmount();

    // Run throws (and an async one rejects): a toast, and the next command still works.
    ui = await mountWithToaster({
      itemCommands: () => [
        { id: "boom", label: "Explode", run() { throw new Error("run broke"); } },
        { id: "later", label: "Explode later", run: () => Promise.reject(new Error("async broke")) },
      ],
    });
    await openMenu(ui);
    await filter(ui, "explode");
    await ui.key("Enter");
    await waitFor(() => /Explode didn't work/.test(toastText()));
    await openMenu(ui);
    await filter(ui, "explode later");
    await ui.key("Enter");
    await waitFor(() => /Explode later didn't work/.test(toastText()));
    await openMenu(ui);
    await filter(ui, "complete");
    await ui.key("Enter");
    assert.equal(find(ui.value(), "p").data?.completed, true);
    await ui.unmount();
  } finally {
    console.error = quiet;
  }
});

/* ───────────── The item menu by keyboard ───────────── */

test("item menu: letters and spaces only filter (a–z with no Enter: zero revisions); ↑↓ Home End move; Esc closes back to the tree", async () => {
  const ui = await mount();
  await openMenu(ui);
  const before = { revision: ui.ol().state.revision, history: ui.ol().state.history.past.length, value: content(ui.value()) };
  let typed = "";
  for (const letter of "abcdefghijklmnopqrstuvwxyz ") {
    typed += letter;
    await ui.act(() => {
      keydown(menuInput(), letter, { code: code(letter) });
      typeInto(menuInput(), typed);
    });
  }
  await ui.frames();
  assert.equal(ui.ol().state.revision, before.revision, "no document revision");
  assert.equal(ui.ol().state.history.past.length, before.history);
  assert.deepEqual(content(ui.value()), before.value);
  assert.ok(popover(), "still open");
  assert.match(popover().textContent, /No results/, "zero matches keeps the menu open with No results");
  await filter(ui, "");
  const first = selectedItem();
  assert.equal(first, "item.select", "the first choice is highlighted");
  await ui.key("ArrowDown");
  assert.equal(selectedItem(), "item.complete");
  await ui.key("End");
  assert.equal(selectedItem(), "item.delete");
  await ui.key("ArrowDown");
  assert.equal(selectedItem(), first, "it wraps");
  await ui.key("Home");
  assert.equal(selectedItem(), first);
  await ui.key("ArrowUp");
  assert.equal(selectedItem(), "item.delete");
  await ui.key("Tab");
  assert.ok(popover(), "Tab runs nothing and stays");
  assert.equal(ui.ol().state.revision, before.revision);
  await ui.key("Escape");
  await waitFor(() => !popover());
  await ui.frames();
  assert.equal(document.activeElement, ui.tree(), "focus is back on the tree");
  assert.equal(ui.tree().getAttribute("aria-activedescendant"), ui.row("p").id, "on the same cursor row");
  await ui.unmount();
});

test("item menu: pages open with Enter or →, go back with ← or ⌫ on an empty filter, and Esc closes one level", async () => {
  const ui = await mount();
  await openMenu(ui);
  await filter(ui, "d");
  assert.equal(selectedItem(), "item.date", '"d" is Date');
  await ui.key("Enter");
  assert.equal(pageLabel(), "Date");
  assert.equal(menuInput().value, "", "a page starts with its own empty filter");
  await ui.key("Backspace");
  assert.equal(pageLabel(), null, "⌫ on an empty filter: back");
  await filter(ui, "repeat");
  assert.equal(selectedItem(), "item.repeat");
  await ui.key("ArrowRight");
  assert.equal(pageLabel(), "Repeat");
  await ui.key("ArrowLeft");
  assert.equal(pageLabel(), null, "←: back");
  await filter(ui, "sel");
  assert.equal(selectedItem(), "item.selectMore", '"sel" is the Select page');
  await ui.key("Enter");
  assert.equal(pageLabel(), "Select");
  await ui.key("Escape");
  assert.ok(popover(), "Esc in a page goes back one level");
  assert.equal(pageLabel(), null);
  await ui.key("Escape");
  await waitFor(() => !popover());
  await ui.unmount();
});

test("item menu: / d ⏎ tom ⏎ sets tomorrow and the cursor stays; / sel ⏎ child ⏎ selects the children; ⇧F10 opens the same menu", async () => {
  const ui = await mount();
  await openMenu(ui);
  await filter(ui, "d");
  await ui.key("Enter");
  await filter(ui, "tom");
  assert.equal(selectedItem(), "date.tomorrow");
  const history = ui.ol().state.history.past.length;
  await ui.key("Enter");
  await waitFor(() => !popover());
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const pad = (n) => String(n).padStart(2, "0");
  assert.equal(find(ui.value(), "p").text, `Plan launch !(${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())})`);
  assert.equal(ui.ol().state.history.past.length, history + 1, "one undo step");
  await ui.frames();
  assert.equal(document.activeElement, ui.tree());
  assert.deepEqual(ui.selection(), ["p"], "the cursor stays");
  assert.equal(ui.tree().getAttribute("aria-activedescendant"), ui.row("p").id);

  // Repeat ▸ Weekly on the dated row, then Clear date.
  await openMenu(ui);
  await filter(ui, "weekly");
  await ui.key("Enter");
  assert.match(find(ui.value(), "p").text, /every week\)$/);
  await openMenu(ui);
  await filter(ui, "clear date");
  await ui.key("Enter");
  assert.equal(find(ui.value(), "p").text, "Plan launch");

  await openMenu(ui);
  await filter(ui, "sel");
  await ui.key("Enter");
  await filter(ui, "child");
  assert.equal(selectedItem(), "select.children");
  await ui.key("Enter");
  await waitFor(() => !popover());
  assert.deepEqual(ui.selection().sort(), ["c1", "c2", "c3"]);

  // ⇧F10 and the ContextMenu key open the same menu on the target.
  await ui.select("q");
  await ui.key("F10", { shiftKey: true });
  await ui.frames();
  await waitFor(() => menuInput());
  assert.match(popover().textContent, /Other/, "named after the cursor row");
  await ui.key("Escape");
  await waitFor(() => !popover());
  await ui.frames();
  assert.equal(document.activeElement, ui.tree());
  await ui.key("ContextMenu");
  await ui.frames();
  await waitFor(() => menuInput());
  await ui.key("Escape");
  await waitFor(() => !popover());
  await ui.unmount();
});

test("item menu: the pointer works too (click a page, click an action)", async () => {
  const ui = await mount();
  await openMenu(ui);
  await ui.click(popover().querySelector('[data-command="item.format"]'));
  await waitFor(() => pageLabel() === "Format");
  await ui.click(popover().querySelector('[data-command="format.h2"]'));
  await waitFor(() => !popover());
  assert.equal(find(ui.value(), "p").data?.heading, 2);
  await ui.unmount();
});

test("item menu: Pick a date… opens the date picker from the keyboard; a pick adds the date as its own word", async () => {
  const ui = await mount();
  await openMenu(ui, "q");
  await filter(ui, "pick");
  assert.equal(selectedItem(), "date.pick");
  await ui.key("Enter");
  const picker = await waitFor(() => document.querySelector("[data-date-picker]"));
  await ui.frames();
  assert.ok(picker.contains(document.activeElement), "the picker has focus");
  const today = [...picker.querySelectorAll("button")].find((b) => b.textContent.trim() === "Today");
  await ui.click(today);
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  assert.equal(find(ui.value(), "q").text, `Other !(${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())})`);
  await ui.unmount();
});

test("item menu: a target deleted while the menu is open refuses with a toast and touches no other row", async () => {
  const ui = await mountWithToaster({ itemCommands: hostCommands });
  await openMenu(ui, "q");
  await filter(ui, "complete");
  await ui.act(() => ui.handle.current.removeItems(["q"]));
  const after = content(ui.value());
  assert.equal(find(after, "q"), undefined);
  await ui.key("Enter");
  await waitFor(() => /That item is gone/.test(toastText()));
  assert.deepEqual(content(ui.value()), after, "nothing else changed");
  await waitFor(() => !popover());
  await ui.frames();
  assert.equal(document.activeElement, ui.tree(), "focus goes back to the tree, never <body>");
  await ui.unmount();
});

/* ───────────── "/" while typing ───────────── */

async function typeField(ui, value) {
  await ui.setValue(value);
  await ui.frames();
}
const attached = () => document.querySelector("[data-item-menu=attached]");

test("text /: the query is shown but never stored or in history; Esc removes exactly the /query; Enter runs as one undo step", async () => {
  const ui = await mount();
  await ui.edit("q");
  await typeField(ui, "Other ");
  await ui.act(() => ui.ol().dispatch({ type: "caret", id: "q", start: 6, end: 6 }));
  const before = { revision: ui.ol().state.revision, history: ui.ol().state.history.past.length };
  await typeField(ui, "Other /");
  assert.ok(attached(), "the menu opened under the caret");
  assert.equal(ui.field().value, "Other /");
  await typeField(ui, "Other /hea");
  assert.equal(find(ui.value(), "q").text, "Other ", "the query is not stored");
  assert.equal(ui.ol().state.revision, before.revision, "no revision");
  assert.equal(ui.ol().state.history.past.length, before.history, "nothing in history");
  assert.equal(ui.field().getAttribute("aria-expanded"), "true");
  assert.ok(ui.field().getAttribute("aria-activedescendant"), "the highlighted command is the field's active descendant");
  await ui.key("Escape");
  await waitFor(() => !attached());
  await ui.frames();
  assert.ok(ui.field(), "still editing");
  assert.equal(ui.field().value, "Other ", "exactly the /query is gone, nothing before it");
  assert.equal(ui.field().selectionStart, 6, "the caret is where / was typed");
  assert.equal(ui.ol().state.history.past.length, before.history, "still nothing in history");

  // Enter: the command runs; only it is in history.
  await typeField(ui, "Other /heading 1");
  assert.equal(document.querySelector("[data-item-menu=attached] [cmdk-item][data-selected=true]")?.dataset.command, "format.h1");
  await ui.key("Enter");
  await waitFor(() => !attached());
  assert.equal(find(ui.value(), "q").data?.heading, 1);
  assert.equal(find(ui.value(), "q").text, "Other ");
  assert.equal(ui.ol().state.history.past.length, before.history + 1, "one step: the command");
  assert.equal(ui.field()?.value, "Other ");
  await ui.act(() => ui.handle.current.undo());
  assert.equal(find(ui.value(), "q").data?.heading, undefined, "⌘Z undoes the command; no typing step came with it");
  assert.equal(find(ui.value(), "q").text, "Other ");

  // Pages in a field: Enter opens one; its filter is what follows.
  await ui.edit("q");
  await typeField(ui, "Other /da");
  await ui.key("Enter");
  await typeField(ui, "Other /datom");
  assert.equal(document.querySelector("[data-item-menu=attached] [cmdk-item][data-selected=true]")?.dataset.command, "date.tomorrow");
  await ui.key("Escape");
  assert.ok(attached(), "Esc in a page goes back a level");
  await ui.key("Escape");
  await waitFor(() => !attached());
  assert.equal(ui.field().value, "Other ");
  // A character no command has: the text was real after all, and is stored as typed.
  await typeField(ui, "Other /");
  await typeField(ui, "Other /!");
  assert.equal(attached(), null);
  assert.equal(find(ui.value(), "q").text, "Other /!");
  await ui.unmount();
});

test("text /: no menu in code, in math, after a backslash, inside a word or a URL; in a note only on a prose line", async () => {
  const ui = await mount();
  await ui.edit("q");
  for (const value of ["Other `x /", "Other $x /", "Other \\/", "Other a/", "Other https:/", "Other https://", "Other `a /b` and"]) {
    await typeField(ui, value);
    assert.equal(attached(), null, `no menu for ${JSON.stringify(value)}`);
    assert.equal(find(ui.value(), "q").text, value, "typed as text");
  }
  // Pure function: the same rules.
  assert.equal(itemMenu.findSlashToken("a /b", 4)?.query, "b");
  assert.equal(itemMenu.findSlashToken("/", 1)?.start, 0, "the start of a field");
  assert.equal(itemMenu.findSlashToken("see `co /de`", 9), null, "inside a closed code span");
  assert.equal(itemMenu.findSlashToken("[[x /y|id]]", 5), null, "inside a link");
  await ui.act(() => ui.ol().dispatch({ type: "focus", id: "q", field: "note", start: 0 }));
  await ui.frames();
  await typeField(ui, "/");
  assert.ok(attached(), "a note's prose line has the menu");
  await ui.key("Escape");
  await waitFor(() => !attached());
  await typeField(ui, "```\n/");
  assert.equal(attached(), null, "not inside a code block");
  await ui.unmount();
});

test("text: ⇧F10 in a field opens the item menu and Esc puts the caret back", async () => {
  const ui = await mount();
  await ui.edit("q");
  ui.field().setSelectionRange(2, 4);
  await ui.key("F10", { shiftKey: true });
  await ui.frames();
  await waitFor(() => menuInput() && document.activeElement === menuInput());
  await ui.key("Escape");
  await waitFor(() => !popover());
  await ui.frames();
  assert.ok(ui.field(), "back in the field");
  assert.deepEqual([ui.field().selectionStart, ui.field().selectionEnd], [2, 4], "with its selection");
  await ui.unmount();
});

/* ───────────── Remapping shows everywhere ───────────── */

test("remap Complete in Settings: the new keys show in the item menu, ⋯, ⌘K and ⌘/", async () => {
  const ui = await mount();
  await ui.act(() => ui.ui().updateSettings({ shortcuts: { complete: ["Mod+Alt+k"] } }));
  const hint = "Ctrl Alt K";
  await openMenu(ui);
  await filter(ui, "complete");
  assert.equal(popover().querySelector('[data-command="item.complete"] [data-command-hint]').textContent, hint, "item menu");
  await ui.key("Escape");
  await waitFor(() => !popover());
  const dropdown = await radixSurface(ui, openDropdown(ui));
  assert.equal(dropdown.get("item.complete").hint, hint, "⋯");
  const palette = await paletteSurface(ui);
  assert.equal(palette.get("item.complete").hint, hint, "⌘K");
  await ui.act(() => ui.ui().setShortcutsOpen(true));
  const sheet = await waitFor(() => document.querySelector("[data-shortcut-sheet]"));
  assert.match(sheet.textContent, /CompleteCtrl Alt K/, "⌘/");
  await ui.act(() => ui.ui().setShortcutsOpen(false));
  // And the key itself runs the same entry.
  await ui.select("q");
  await ui.key("k", { ctrlKey: true, altKey: true, code: code("k") });
  assert.equal(find(ui.value(), "q").data?.completed, true);
  await ui.unmount();
});

/* ───────────── Keys and labels ───────────── */

test("keymap: ⌘D is the browser's (refused); Windows labels name keys in Ctrl Alt Shift order", () => {
  const map = keymap.buildKeymap();
  const check = keymap.checkAssignment(map, "complete", "Mod+d");
  assert.equal(check.ok, false);
  assert.equal(check.reason, "reserved");
  assert.equal(check.reserved.owner, "browser");
  assert.equal(keymap.formatCombo("Mod+Alt+Shift+1", false), "Ctrl Alt Shift 1");
  assert.equal(keymap.formatCombo("Mod+Alt+Shift+1", true), "⌥⇧⌘1");
  assert.equal(keymap.formatCombo("Shift+Enter", false), "Shift Enter");
  assert.equal(keymap.formatCombo("Mod+Enter", false), "Ctrl Enter");
  assert.equal(keymap.formatCombo("Mod+Enter", true), "⌘↵");
  assert.equal(keymap.fixedKeyHint("item.delete", false), "Del");
  assert.equal(keymap.fixedKeyHint("item.delete", true), "⌫");
  assert.equal(keymap.fixedKeyHint("item.outdent", false), "Shift Tab");
  assert.equal(keymap.isItemMenuKey({ key: "F10", shiftKey: true }), true);
  assert.equal(keymap.isItemMenuKey({ key: "F10" }), false);
  assert.equal(keymap.isItemMenuKey({ key: "ContextMenu" }), true);
});

test("registry: self-inverse metadata and select policies are declared", async () => {
  const ui = await mount();
  await ui.select("p");
  const { entries } = expected(ui);
  const get = (id) => registry.findEntry(entries, id);
  assert.equal(get("item.complete").inverse, "self-when-uniform");
  assert.equal(get("format.h1").inverse, "self-when-uniform");
  assert.equal(get("item.indent").inverse, "item.outdent");
  assert.equal(get("item.duplicate").select, "result");
  assert.equal(get("item.delete").select, "neighbour");
  assert.equal(get("date.pick").opensSurface, true);
  assert.equal(get("item.move").paletteMode, "move");
  // Ranking: label words first, then the closer label.
  const ranked = (items, search) => itemMenu.rankEntries(items, search).filter((item) => "entry" in item).map((item) => item.entry.commandId);
  assert.equal(ranked(entries, "d")[0], "item.date");
  assert.equal(ranked(entries, "sel")[0], "item.selectMore");
  assert.equal(ranked(entries, "tomorrow")[0], "date.tomorrow", "a search reaches into pages");
  await ui.unmount();
});

/* ───────────── One definition (grep) ───────────── */

test("grep: no hand-written item actions remain in the palette, the views or the slash list", () => {
  const chrome = source("outliner-chrome.tsx");
  const palette = chrome.slice(chrome.indexOf("export function OutlinerCommandPalette"), chrome.indexOf("export const RECENTLY_CHANGED_QUERY"));
  for (const call of ["toggleComplete(", "toggleCheckbox(", "setHeading(", "setColor(", "toggleNumbered(", "duplicate(", "deleteItems(", '"indent"', '"outdent"', "toggleBookmark(selection", 'field: "note"'])
    assert.ok(!palette.includes(call), `the palette has no hand-written ${call}`);
  assert.ok(palette.includes("itemActions("), "the palette's item group is the registry");
  const views = source("outliner-views.tsx");
  assert.doesNotMatch(views, /ViewCommandItems/);
  assert.doesNotMatch(views, /setItemView\(ol, ui, item\.id, view\)\)\}/, "no View as CommandItem");
  const autocomplete = source("autocomplete.tsx");
  assert.doesNotMatch(autocomplete, /"slash"|Heading 1|setHeading|toggleCheckbox|toggleNumbered/, "no item list in the slash autocomplete");
  const shortcuts = source("shortcut-actions.ts");
  assert.doesNotMatch(shortcuts, /toggleComplete|toggleCheckbox|toggleHeading|copyLink\(/, "chords delegate to the registry");
  assert.match(source("SEAMS.md"), /`\/` item menu/, "SEAMS.md names every surface that shows itemCommands");
});
