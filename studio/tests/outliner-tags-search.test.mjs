// Tags and saved searches in the real component: typing `#la` or `@ma` in a title opens the
// caret-anchored suggestions (known tags with counts, plus the new spelling), arrows choose and
// Enter inserts; clicking an inline tag chip filters the outline by it; and a query saved from
// the bookmarks menu is listed there, re-applies on choosing it, and can be removed.
//
//   cd studio && node --test tests/outliner-tags-search.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

after(() => stopVite());

const doc = () => [
  { id: "ship", text: "Ship to tenants #launch", checked: false },
  { id: "comms", text: "Draft the announcement #launch @marco" },
  { id: "drill", text: "Kill switch drill #perf @maya" },
  { id: "loose", text: "Loose end" },
];
const text = (ui, id) => ui.value().find((n) => n.id === id).text;

/** Make the open field read `value` by typing what differs (the caret ends up at the end). */
async function type(ui, value) {
  await ui.setValue(value);
  await ui.frames();
}
const listbox = () => document.querySelector("[role=listbox]");
const options = () => [...(listbox()?.querySelectorAll("[role=option]") ?? [])].map((el) => el.textContent);

/* ───────────── Tag and mention autocomplete ───────────── */

test("autocomplete: #la suggests known tags with counts plus the new spelling; Enter inserts the chosen one", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("loose");
  await type(ui, "Loose end #la");
  const box = await waitFor(listbox);
  assert.equal(box.getAttribute("aria-label"), "Tags");
  assert.deepEqual(options(), ["launch2", "lanew"], "the known #launch (2 items), then the new #la");
  const field = ui.field();
  assert.equal(field.getAttribute("aria-expanded"), "true");
  assert.equal(field.getAttribute("aria-activedescendant"), box.querySelector("[role=option]").id, "the first is active");
  await ui.key("Enter");
  assert.equal(text(ui, "loose"), "Loose end #launch ", "Enter inserted the tag and a space");
  await waitFor(() => !listbox());
  assert.equal(ui.field()?.getAttribute("aria-expanded"), "false", "the menu closed");
  await ui.unmount();
});

test("autocomplete: arrows choose; @ma lists people; Escape dismisses without inserting", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("loose");
  await type(ui, "Loose end @ma");
  await waitFor(listbox);
  assert.equal(listbox().getAttribute("aria-label"), "People");
  assert.deepEqual(options().slice(0, 2).map((o) => o.replace(/\d+$/, "")), ["marco", "maya"]);
  await ui.key("ArrowDown");
  await ui.key("Enter");
  assert.equal(text(ui, "loose"), "Loose end @maya ", "the second suggestion");
  await type(ui, "Loose end @maya #pe");
  await waitFor(listbox);
  await ui.key("Escape");
  await waitFor(() => !listbox());
  assert.equal(text(ui, "loose"), "Loose end @maya #pe", "nothing inserted");
  assert.ok(ui.field(), "still editing: Escape only closed the menu");
  await ui.unmount();
});

test("autocomplete: clicking a suggestion inserts it (the field keeps focus)", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("loose");
  await type(ui, "Loose end #pe");
  await waitFor(listbox);
  const perf = [...listbox().querySelectorAll("[role=option]")].find((el) => el.textContent.startsWith("perf"));
  await ui.click(perf);
  assert.equal(text(ui, "loose"), "Loose end #perf ");
  assert.equal(document.activeElement, ui.field(), "the caret stayed in the title");
  await ui.unmount();
});

/* ───────────── Click a tag to filter ───────────── */

test("tag chip: clicking an inline #tag filters the outline by it", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const chip = [...ui.row("drill").querySelectorAll("[data-ol-title] button")].find((b) => b.textContent === "#perf");
  assert.ok(chip, "the tag renders as a chip");
  await ui.click(chip);
  await ui.frames();
  assert.equal(ui.ol().view.query, "#perf", "the query is the tag");
  assert.deepEqual([...ui.ol().search.matchedIds], ["drill"], "only the tagged item matches");
  assert.equal(ui.field(), null, "a chip click never starts editing");
  // A mention filters the same way.
  await ui.act(() => ui.handle.current.search(""));
  const mention = [...ui.row("comms").querySelectorAll("[data-ol-title] button")].find((b) => b.textContent === "@marco");
  await ui.click(mention);
  assert.equal(ui.ol().view.query, "@marco");
  assert.deepEqual([...ui.ol().search.matchedIds], ["comms"]);
  await ui.unmount();
});

/* ───────────── Saved searches ───────────── */

async function openBookmarks(ui) {
  const trigger = ui.container.querySelector('button[aria-label^="Bookmarks"]');
  assert.ok(trigger, "the bookmarks trigger");
  await ui.act(() => {
    trigger.focus();
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  await ui.frames();
  return waitFor(() => document.querySelector("[role=menu]"));
}
const menuItems = () => [...document.querySelectorAll("[role=menu] [role=menuitem]")];
const item = (pattern) => menuItems().find((el) => pattern.test(el.textContent.trim()) || pattern.test(el.getAttribute("aria-label") ?? ""));

test("saved searches: save the current query, it is listed, choosing it re-applies it, remove takes it out", async () => {
  const changes = [];
  const ui = await mountOutliner({ defaultValue: doc(), onBookmarksChange: (b) => changes.push(b) });
  await ui.act(() => ui.handle.current.search("#launch is:todo"));
  await openBookmarks(ui);
  const save = item(/^Save/);
  assert.ok(save, "“Save” offers the current query");
  assert.match(save.textContent, /#launch is:todo/);
  await ui.click(save);
  assert.deepEqual(changes.at(-1).searches, [{ query: "#launch is:todo" }], "saved as host state");
  // Another query, then the saved one from the menu.
  await ui.act(() => ui.handle.current.search("#perf"));
  await openBookmarks(ui);
  assert.equal(item(/^Save/)?.textContent.includes("#perf"), true, "the new query can be saved too");
  const saved = menuItems().find((el) => el.textContent === "#launch is:todo");
  assert.ok(saved, "the saved search is listed");
  await ui.click(saved);
  assert.equal(ui.ol().view.query, "#launch is:todo", "choosing it re-applies the query");
  assert.deepEqual([...ui.ol().search.matchedIds], ["ship"]);
  // Remove it with its own × entry.
  await openBookmarks(ui);
  assert.equal(item(/^Save/), undefined, "the current query is already saved");
  const remove = item(/Remove saved search #launch is:todo/);
  assert.ok(remove, "a remove entry beside it");
  await ui.click(remove);
  assert.deepEqual(changes.at(-1).searches, [], "removed");
  await ui.frames();
  assert.equal(menuItems().some((el) => el.textContent === "#launch is:todo"), false, "no longer listed");
  await ui.unmount();
});

/* ───────────── Phone ───────────── */

test("phone: while searching, the bookmarks stay beside the field, so the query can be saved", async () => {
  media["(pointer: coarse)"] = true;
  media["(max-width: 639px)"] = true;
  try {
    const changes = [];
    const ui = await mountOutliner({ defaultValue: doc(), onBookmarksChange: (b) => changes.push(b) });
    await ui.act(() => ui.handle.current.search("#perf"));
    const crumbs = ui.container.querySelector('nav[aria-label="Breadcrumb"]');
    assert.match(crumbs.className, /\bhidden\b/, "the search field took the toolbar");
    await openBookmarks(ui);
    const save = item(/^Save/);
    assert.ok(save, "Save is reachable from search");
    await ui.click(save);
    assert.deepEqual(changes.at(-1).searches, [{ query: "#perf" }]);
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
    delete media["(max-width: 639px)"];
  }
});

test("phone: suggestions are 44 px rows and drop the keyboard hints", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.edit("loose");
    await type(ui, "Loose end #la");
    const box = await waitFor(listbox);
    for (const option of box.querySelectorAll("[role=option]")) assert.match(option.className, /coarse:h-11/);
    assert.match(box.lastElementChild.className, /coarse:hidden/, "no ↑↓ / ↵ / esc strip on touch");
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});
