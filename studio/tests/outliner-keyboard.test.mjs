// Keyboard: the keymap (profiles, remaps, conflicts, reserved keys), the power profile in the
// real component, Shift+↑/↓ growing a row selection from a title, ⌘/Ctrl-click selection, and
// the shortcut sheet following the active profile.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { code, load, media, mountOutliner, stopVite } from "./harness/outliner-dom.mjs";

let keymap;
before(async () => {
  keymap = await load("/src/registry/outliner/keymap.ts");
});
after(() => stopVite());

const doc = () => [
  { id: "a", text: "Alpha", children: [{ id: "a1", text: "One" }, { id: "a2", text: "Two" }, { id: "a3", text: "Three" }] },
  { id: "b", text: "Beta", data: { note: "line one" }, children: [{ id: "b1", text: "Deep", children: [{ id: "b1x", text: "Deeper" }] }] },
  { id: "c", text: "Gamma" },
];
const kids = (nodes, id) => (id ? nodes.find((n) => n.id === id)?.children ?? [] : nodes).map((n) => n.id);

/* ───────────── The keymap (pure) ───────────── */

test("keymap: combos normalise (modifier order, key case, ⌥ digits by physical key)", () => {
  assert.equal(keymap.normalizeCombo("shift+mod+X"), "Mod+Shift+x");
  assert.equal(keymap.comboFromEvent({ key: "¡", code: "Digit1", metaKey: true, altKey: true }), "Mod+Alt+1", "⌥ changes the character, not the combo");
  assert.equal(keymap.comboFromEvent({ key: "H", code: "KeyH", ctrlKey: true, shiftKey: true }), "Mod+Shift+h");
  assert.equal(keymap.comboFromEvent({ key: "Meta", metaKey: true }), null, "a lone modifier is not a combo");
  assert.equal(keymap.formatCombo("Mod+Alt+Shift+ArrowUp", true), "⌥⇧⌘↑");
  assert.equal(keymap.formatCombo("Mod+Alt+1", false), "Ctrl Shift Alt 1".replace(" Shift", ""));
});

test("keymap: the standard profile is unchanged; power adds ⌘↑/↓ moves and ⌥⌘1–3 levels, moving headings to ⌥⇧", () => {
  const standard = keymap.buildKeymap("standard");
  const power = keymap.buildKeymap("power");
  assert.equal(keymap.matchShortcut(standard, { key: "ArrowUp", metaKey: true }, "row"), null, "⌘↑ means nothing in standard");
  assert.equal(keymap.matchShortcut(standard, { key: "ArrowUp", altKey: true, shiftKey: true }, "text"), "moveUp");
  assert.equal(keymap.matchShortcut(standard, { key: "1", code: "Digit1", metaKey: true, altKey: true }, "text"), "heading1");
  assert.equal(keymap.matchShortcut(power, { key: "ArrowUp", metaKey: true }, "text"), "moveUp");
  assert.equal(keymap.matchShortcut(power, { key: "2", code: "Digit2", metaKey: true, altKey: true }, "row"), "levels2");
  assert.equal(keymap.matchShortcut(power, { key: "1", code: "Digit1", altKey: true, shiftKey: true }, "text"), "heading1");
  assert.deepEqual(keymap.findConflicts(standard), [], "standard has no conflicts");
  assert.deepEqual(keymap.findConflicts(power), [], "power has no conflicts");
  assert.equal(keymap.matchShortcut(standard, { key: "b", metaKey: true }, "row"), null, "formatting answers only while editing text");
  assert.equal(keymap.matchShortcut(standard, { key: "k", metaKey: true }, "global"), "palette");
});

test("keymap: assigning detects conflicts, refuses reserved and modifier-less keys, replaces on request, resets", () => {
  const map = keymap.buildKeymap("power");
  const taken = keymap.checkAssignment(map, "heading1", "Mod+Alt+1");
  assert.equal(taken.ok, true);
  assert.deepEqual(taken.conflicts, ["levels1"], "⌥⌘1 is Show 1 level in power");
  const kept = keymap.buildKeymap("power", keymap.assignShortcut(map, "heading1", "Mod+Alt+1"));
  assert.deepEqual(keymap.findConflicts(kept).map((c) => c.combo), ["Mod+Alt+1"], "assigned without replacing: a known conflict");
  const replaced = keymap.buildKeymap("power", keymap.assignShortcut(map, "heading1", "Mod+Alt+1", { replace: true }));
  assert.deepEqual(replaced.bindings.get("heading1"), ["Mod+Alt+1"]);
  assert.deepEqual(replaced.bindings.get("levels1"), [], "the other action lost the key");
  assert.deepEqual(keymap.findConflicts(replaced), []);
  const host = keymap.checkAssignment(map, "settings", "Mod+o");
  assert.equal(host.ok, false);
  assert.equal(host.reserved.label, "Open document", "a workspace's ⌘O is refused");
  assert.equal(keymap.checkAssignment(map, "settings", "Mod+Shift+Space").reserved.label, "Quick capture");
  assert.equal(keymap.checkAssignment(map, "settings", "Mod+z").reserved.owner, "fixed");
  assert.equal(keymap.checkAssignment(map, "settings", "Mod+w").reserved.owner, "browser");
  assert.equal(keymap.checkAssignment(map, "settings", "Shift+s").reason, "needs-modifier");
  assert.equal(keymap.checkAssignment(map, "settings", "Mod+Alt+s", [{ combo: "Mod+Alt+s", label: "Sync", owner: "host" }]).reserved.label, "Sync", "a host adds its own");
  assert.deepEqual(keymap.checkAssignment(map, "bold", "Mod+.").conflicts, ["fold"], "text and item scopes overlap");
  const reset = keymap.resetShortcut(replaced.overrides, "levels1");
  assert.deepEqual(keymap.buildKeymap("power", reset).bindings.get("levels1"), ["Mod+Alt+1"]);
  assert.deepEqual(keymap.assignShortcut(map, "levels1", "Mod+Alt+1"), {}, "an override equal to the profile is not a change");
});

/* ───────────── The component ───────────── */

test("power profile: ⌘↑/↓ swap the edited item and the selected rows; standard leaves ⌘↑ alone", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { keyboard: "power" } });
  await ui.edit("a2");
  assert.equal(ui.field()?.dataset.field, "title");
  await ui.key("ArrowUp", { metaKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a2", "a1", "a3"], "the edited item moved up");
  await ui.select("a2");
  await ui.key("ArrowDown", { metaKey: true });
  await ui.key("ArrowDown", { metaKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a3", "a2"], "the selected row moved down twice");
  await ui.act(() => ui.ui().updateSettings({ keyboard: "standard" }));
  await ui.key("ArrowUp", { metaKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a1", "a3", "a2"], "standard: ⌘↑ does not move");
  assert.deepEqual(ui.selection(), ["a3"], "(it travels, as before)");
  await ui.key("ArrowUp", { altKey: true, shiftKey: true });
  assert.deepEqual(kids(ui.value(), "a"), ["a3", "a1", "a2"], "standard keeps ⌥⇧↑");
  await ui.unmount();
});

test("power profile: ⌥⌘1–3 show levels (scoped to zoom); headings move to ⌥⇧1; ⌘. still folds", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { keyboard: "power" } });
  await ui.select("a");
  await ui.key("1", { metaKey: true, altKey: true, code: code("1") });
  assert.deepEqual(ui.ol().rows.map((r) => r.id), ["a", "b", "c"], "1 level: top level only");
  assert.match(ui.live(), /Showing 1 level/, "announced");
  await ui.key("2", { metaKey: true, altKey: true, code: code("2") });
  assert.deepEqual(ui.ol().rows.map((r) => r.id), ["a", "a1", "a2", "a3", "b", "b1", "c"], "2 levels");
  await ui.key("0", { metaKey: true, altKey: true, code: code("0") });
  assert.ok(ui.ol().rows.some((r) => r.id === "b1x"), "all levels");
  await ui.act(() => ui.handle.current.zoomTo("b"));
  await ui.key("1", { metaKey: true, altKey: true, code: code("1") });
  assert.deepEqual(ui.ol().rows.map((r) => r.id), ["b1"], "zoomed: the zoomed item's children, folded");
  assert.ok(ui.ol().state.expandedIds.has("a"), "folds outside the zoom are untouched");
  await ui.act(() => ui.handle.current.zoomTo(null));
  await ui.edit("c");
  await ui.key("1", { altKey: true, shiftKey: true, code: code("1") });
  assert.equal(ui.value().find((n) => n.id === "c").data?.heading, 1, "⌥⇧1 is Heading 1 in power");
  await ui.unmount();
});

test("power profile: Enter in a note starts the next item; ⌘⇧↵ is the line break (standard: Enter is)", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { keyboard: "power" } });
  await ui.act(() => ui.ol().dispatch({ type: "focus", id: "c", field: "note", start: 0 }));
  await ui.act(() => ui.ui().setEditing(true));
  await ui.frames();
  assert.equal(ui.field()?.dataset.field, "note");
  await ui.act(() => ui.ol().dispatch({ type: "note", id: "c", text: "first", caret: 5 }));
  await ui.frames();
  ui.field().setSelectionRange(5, 5);
  await ui.key("Enter", { metaKey: true, shiftKey: true });
  assert.equal(ui.value().find((n) => n.id === "c").data.note, "first\n", "⌘⇧↵ inserted a line break");
  assert.equal(ui.value().find((n) => n.id === "c").checked, undefined, "and did not complete the item");
  await ui.key("Enter");
  assert.equal(ui.value().length, 4, "Enter started a new item after it");
  assert.equal(ui.value()[3].text, "");
  await ui.unmount();
});

test("remapped shortcuts take effect at once, and the old key stops working", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.select("a");
  await ui.act(() => ui.ui().updateSettings({ shortcuts: { fold: ["Mod+Alt+j"] } }));
  await ui.key(".", { metaKey: true });
  assert.equal(ui.ol().rows.find((r) => r.id === "a").expanded, true, "⌘. no longer folds");
  await ui.key("j", { metaKey: true, altKey: true, code: code("j") });
  assert.equal(ui.ol().rows.find((r) => r.id === "a").expanded, false, "⌥⌘J folds");
  await ui.unmount();
});

test("⇧↑/⇧↓ at a title's edge grow a row selection, then keep growing in the tree", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("a2");
  await ui.key("ArrowUp", { shiftKey: true });
  assert.equal(ui.field(), null, "left the field");
  assert.deepEqual(ui.selection().sort(), ["a1", "a2"]);
  await ui.key("ArrowUp", { shiftKey: true });
  assert.deepEqual(ui.selection().sort(), ["a", "a1", "a2"], "the next ⇧↑ extends in the tree");
  await ui.edit("a2");
  ui.field().setSelectionRange(1, 1);
  // Mid-text, but the selection's moving end at the very end: ⇧↓ grows rows downward.
  ui.field().setSelectionRange(1, ui.field().value.length, "forward");
  await ui.key("ArrowDown", { shiftKey: true });
  assert.deepEqual(ui.selection().sort(), ["a2", "a3"]);
  await ui.unmount();
});

test("⌘/Ctrl-click adds and removes rows (non-contiguous), also from a bullet and while editing", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const title = (id) => ui.row(id).querySelector("[data-ol-title]");
  await ui.select("a1");
  await ui.click(title("a3"), { metaKey: true });
  assert.deepEqual(ui.selection().sort(), ["a1", "a3"], "a gap stays a gap");
  await ui.click(ui.row("c").querySelector("[data-drag-handle]"), { ctrlKey: true });
  assert.deepEqual(ui.selection().sort(), ["a1", "a3", "c"], "a bullet ⌘-click selects instead of zooming");
  assert.equal(ui.ol().state.hoistedId, null);
  await ui.click(title("a3"), { metaKey: true });
  assert.deepEqual(ui.selection().sort(), ["a1", "c"], "a second ⌘-click removes");
  await ui.edit("a2");
  await ui.click(title("c"), { metaKey: true });
  assert.equal(ui.field(), null, "editing ended");
  assert.deepEqual(ui.selection().sort(), ["a2", "c"], "the edited row and the clicked one, in one click");
  await ui.unmount();
});

test("phone: in selection mode taps add and remove rows (non-contiguous), and never start editing", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    const title = (id) => ui.row(id).querySelector("[data-ol-title]");
    // The action sheet's "Select" puts the row in the selection: selection mode starts.
    await ui.act(() => ui.ui().setSheet({ rowId: "a1", ids: ["a1"] }));
    const select = [...document.querySelectorAll("[data-outliner-sheet] [role=menuitem]")].find((el) => el.textContent.includes("Select"));
    await ui.click(select);
    await ui.frames();
    assert.deepEqual(ui.selection(), ["a1"]);
    await ui.click(title("a3"));
    await ui.click(title("c"));
    assert.deepEqual(ui.selection().sort(), ["a1", "a3", "c"], "taps add rows with gaps");
    assert.equal(ui.field(), null, "no field opened");
    await ui.click(title("a3"));
    assert.deepEqual(ui.selection().sort(), ["a1", "c"], "a tap on a selected row removes it");
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});

test("the shortcut sheet shows the active profile and remaps", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { keyboard: "power", shortcuts: { copyLink: ["Mod+Alt+l"] } } });
  await ui.act(() => ui.ui().setShortcutsOpen(true));
  const sheet = document.querySelector("[data-shortcut-sheet]");
  assert.equal(sheet.dataset.shortcutSheet, "power");
  const row = (label) => [...sheet.querySelectorAll("dl > div")].find((el) => el.querySelector("dt").textContent === label)?.querySelector("dd").textContent;
  assert.match(row("Move up"), /Ctrl ↑/, "power's ⌘↑ (Ctrl on this platform)");
  assert.match(row("Show 1 · 2 · 3 levels"), /Ctrl Alt 1/);
  assert.match(row("Copy item link"), /Ctrl Alt L/, "a remap shows");
  await ui.unmount();
});

/* ───────────── AltGr and IME input are text, never shortcuts ───────────── */

test("keymap: AltGr (reported as Ctrl+Alt on Windows and Linux) types its character, never a shortcut", () => {
  const power = keymap.buildKeymap("power");
  const standard = keymap.buildKeymap("standard");
  // German layout: AltGr+0 is "}", AltGr+Q is "@"; with the AltGraph state, and without it.
  const brace = { key: "}", code: "Digit0", ctrlKey: true, altKey: true };
  const at = { key: "@", code: "KeyQ", ctrlKey: true, altKey: true };
  const flagged = (event) => ({ ...event, getModifierState: (key) => key === "AltGraph" });
  for (const event of [brace, flagged(brace)]) {
    assert.equal(keymap.comboFromEvent(event), null, "AltGr+0 is text");
    assert.equal(keymap.matchShortcut(standard, event, "text"), null, "not Normal text (Mod+Alt+0)");
    assert.equal(keymap.matchShortcut(power, event, "row"), null, "not Show all levels (Mod+Alt+0)");
  }
  assert.equal(keymap.comboFromEvent(at), null);
  assert.equal(keymap.isAltGraphText(brace, false), true);
  assert.equal(keymap.isAltGraphText(brace, true), false, "Apple keyboards have no AltGr (⌥ never sets Ctrl)");
  // A real Ctrl+Alt chord types its own key: still the shortcut.
  assert.equal(keymap.matchShortcut(standard, { key: "1", code: "Digit1", ctrlKey: true, altKey: true }, "text"), "heading1");
  assert.equal(keymap.matchShortcut(standard, { key: "h", code: "KeyH", ctrlKey: true, altKey: true }, "row"), "hideCompleted");
  assert.equal(keymap.comboFromEvent({ key: "Enter", ctrlKey: true, altKey: true }), "Mod+Alt+Enter", "named keys are never AltGr text");
  // IME: composing, or Safari's committing Enter (keyCode 229).
  assert.equal(keymap.comboFromEvent({ key: "Enter", metaKey: true, isComposing: true }), null);
  assert.equal(keymap.isComposingKey({ key: "Enter", keyCode: 229 }), true);
  assert.equal(keymap.isComposingKey({ nativeEvent: { isComposing: true } }), true);
  assert.equal(keymap.isComposingKey({ key: "Enter", keyCode: 13 }), false);
});

test("component: AltGr text in a title is typed, not taken as a heading shortcut", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("a2");
  const event = new window.KeyboardEvent("keydown", { key: "¡", code: "Digit1", ctrlKey: true, altKey: true, bubbles: true, cancelable: true });
  await ui.act(() => ui.field().dispatchEvent(event));
  assert.equal(event.defaultPrevented, false, "the browser types the character");
  assert.equal(ui.value()[0].children[1].data?.heading, undefined, "no heading");
  await ui.key("1", { code: "Digit1", ctrlKey: true, altKey: true });
  assert.equal(ui.value()[0].children[1].data?.heading, 1, "a real Ctrl+Alt+1 still makes a heading");
  await ui.unmount();
});

test("component: an Enter that commits an IME candidate never splits, indents or submits", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.edit("a2");
  const before = JSON.stringify(ui.value());
  for (const init of [{ isComposing: true }, { keyCode: 229 }]) {
    const enter = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...init });
    await ui.act(() => ui.field().dispatchEvent(enter));
    assert.equal(enter.defaultPrevented, false, `the IME keeps its Enter (${Object.keys(init)[0]})`);
    const tab = new window.KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true, ...init });
    await ui.act(() => ui.field().dispatchEvent(tab));
  }
  assert.equal(JSON.stringify(ui.value()), before, "no split, no indent");
  await ui.key("Enter");
  assert.equal(ui.value()[0].children.length, 4, "a plain Enter still splits");
  // The find bar: a composing Enter does not step to the next match.
  await ui.act(() => ui.handle.current.find("o"));
  await ui.frames();
  const field = document.querySelector('[data-slot=outliner] input[aria-describedby="ol-find-status"]') ?? document.querySelector("[data-slot=outliner] [aria-label='Find and replace'] input");
  assert.ok(field, "the find field is open");
  const status = () => document.getElementById("ol-find-status")?.textContent;
  const shown = status();
  const composing = new window.KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true });
  await ui.act(() => field.dispatchEvent(composing));
  assert.equal(composing.defaultPrevented, false);
  assert.equal(status(), shown, "still on the same match");
  await ui.unmount();
});
