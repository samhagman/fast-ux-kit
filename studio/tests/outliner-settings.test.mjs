// Settings: the panel is the one editor of density, text size, notes, bullet click, keyboard
// profile and remapped shortcuts; controlled (`settings` + `onSettingsChange`) and uncontrolled
// (`defaultSettings`); no storage. Bullet behaviour; the shortcut recorder with conflicts.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { code, load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let settings;
before(async () => {
  settings = await load("/src/registry/outliner/settings.ts");
});
after(() => stopVite());

const doc = () => [
  { id: "a", text: "Alpha", data: { note: "a note" }, children: [{ id: "a1", text: "One" }] },
  { id: "b", text: "Beta" },
];
const radio = (group, value) => document.querySelector(`[data-setting="${group}"] [data-value="${value}"]`);

test("settings: stored values are sanitised; style variables follow density and size", () => {
  const s = settings.resolveSettings({ density: "cozy", fontSize: "huge", keyboard: "power", shortcuts: { fold: ["Mod+j"], bogus: 3 }, extra: 1 });
  assert.equal(s.density, "cozy");
  assert.equal(s.fontSize, "default", "an unknown size falls back");
  assert.deepEqual(s.shortcuts, { fold: ["Mod+j"] });
  assert.equal("extra" in s, false);
  assert.deepEqual(settings.resolveSettings(undefined), settings.DEFAULT_SETTINGS);
  const style = settings.settingsStyle(s);
  assert.equal(style["--ol-pad"], "6px");
  assert.equal(settings.settingsStyle({ ...s, fontSize: "large", density: "compact" })["--ol-text"], "16px");
});

test("uncontrolled: the panel edits the outliner's own settings and reports every change", async () => {
  const changes = [];
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { density: "compact" }, onSettingsChange: (s) => changes.push(s) });
  assert.equal(ui.root().dataset.density, "compact");
  await ui.act(() => ui.ui().setSettingsOpen(true));
  assert.ok(document.querySelector("[data-outliner-settings]"), "the panel opened (dialog on desktop)");
  await ui.click(radio("density", "cozy"));
  await ui.click(radio("font", "large"));
  await ui.click(radio("notes", "hide"));
  assert.equal(ui.root().dataset.density, "cozy");
  assert.equal(ui.root().dataset.fontSize, "large");
  assert.equal(ui.root().style.getPropertyValue("--ol-text"), "16px");
  assert.equal(ui.ol().view.noteDisplay, "hide", "the note display setting drives the view");
  assert.equal(changes.length, 3);
  assert.deepEqual({ ...changes.at(-1), shortcuts: undefined }, { density: "cozy", fontSize: "large", bulletClick: "zoom", keyboard: "standard", noteDisplay: "hide", shortcuts: undefined });
  assert.equal(globalThis.localStorage?.length ?? 0, 0, "no storage touched");
  await ui.unmount();
});

test("controlled: the panel asks; nothing changes until the host answers", async () => {
  const asked = [];
  const ui = await mountOutliner({ defaultValue: doc(), settings: { keyboard: "standard" }, onSettingsChange: (s) => asked.push(s) });
  await ui.act(() => ui.ui().setSettingsOpen(true));
  await ui.click(radio("profile", "power"));
  assert.equal(asked.at(-1).keyboard, "power");
  assert.equal(ui.root().dataset.keyboard, "standard", "not echoed yet");
  await ui.rerender({ defaultValue: doc(), settings: asked.at(-1), onSettingsChange: (s) => asked.push(s) });
  assert.equal(ui.root().dataset.keyboard, "power");
  assert.equal(ui.ui().keymap.profile, "power");
  await ui.unmount();
});

test("the view menu's note display writes the same setting (one owner)", async () => {
  const changes = [];
  const ui = await mountOutliner({ defaultValue: doc(), onSettingsChange: (s) => changes.push(s) });
  await ui.act(() => ui.ui().updateSettings({ noteDisplay: "first-line" }));
  assert.equal(ui.ol().view.noteDisplay, "first-line");
  assert.equal(changes.at(-1).noteDisplay, "first-line");
  await ui.unmount();
});

test("bullet behaviour: zoom (default) or fold; ⌥-click does the other; a leaf always zooms", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const bullet = (id) => ui.row(id).querySelector("[data-drag-handle]");
  await ui.click(bullet("a"));
  assert.equal(ui.ol().state.hoistedId, "a", "default: a bullet click zooms");
  await ui.act(() => ui.handle.current.zoomTo(null));
  await ui.click(bullet("a"), { altKey: true });
  assert.equal(ui.ol().rows.find((r) => r.id === "a").expanded, false, "⌥-click folds instead");
  await ui.act(() => ui.ol().dispatch({ type: "expand", ids: ["a"], expanded: true }));
  await ui.act(() => ui.ui().updateSettings({ bulletClick: "fold" }));
  await ui.click(bullet("a"));
  assert.equal(ui.ol().rows.find((r) => r.id === "a").expanded, false, "fold setting: a click folds");
  assert.equal(ui.ol().state.hoistedId, null);
  await ui.click(bullet("a"));
  assert.equal(ui.ol().rows.find((r) => r.id === "a").expanded, true, "and unfolds");
  await ui.click(bullet("a"), { altKey: true });
  assert.equal(ui.ol().state.hoistedId, "a", "⌥-click zooms");
  await ui.act(() => ui.handle.current.zoomTo(null));
  await ui.click(bullet("b"));
  assert.equal(ui.ol().state.hoistedId, "b", "a leaf has nothing to fold: it zooms");
  await ui.unmount();
});

test("shortcut recorder: record, warn on a conflict, replace; refuse reserved keys; reset", async () => {
  const changes = [];
  const ui = await mountOutliner({ defaultValue: doc(), defaultSettings: { keyboard: "power" }, onSettingsChange: (s) => changes.push(s) });
  await ui.act(() => ui.ui().setSettingsOpen(true));
  await ui.click(document.querySelector('[data-setting="settings-tab"] [data-value="shortcuts"]'));
  const record = (id) => document.querySelector(`[data-shortcut-record="${id}"]`);
  await waitFor(() => record("heading1"));
  await ui.click(record("heading1"));
  assert.ok(record("heading1").hasAttribute("data-recording"));
  await ui.act(() => record("heading1").dispatchEvent(new window.KeyboardEvent("keydown", { key: "Alt", altKey: true, bubbles: true, cancelable: true })));
  assert.ok(record("heading1").hasAttribute("data-recording"), "a lone modifier keeps listening");
  await ui.act(() => record("heading1").dispatchEvent(new window.KeyboardEvent("keydown", { key: "¡", code: code("1"), metaKey: true, altKey: true, bubbles: true, cancelable: true })));
  const notice = document.querySelector("[data-shortcut-pending]");
  assert.match(notice.textContent, /Ctrl Alt 1 is already used by Show 1 level/);
  assert.equal(changes.length, 0, "nothing saved yet");
  await ui.click([...notice.querySelectorAll("button")].find((b) => /Use here/.test(b.textContent)));
  assert.deepEqual(changes.at(-1).shortcuts, { heading1: ["Mod+Alt+1"], levels1: [] });
  assert.match(record("levels1").getAttribute("aria-label"), /Set a shortcut for Show 1 level/, "the other action lost it");
  // In the outline the key now means Heading 1.
  await ui.act(() => ui.ui().setSettingsOpen(false));
  await ui.edit("b");
  await ui.key("1", { metaKey: true, altKey: true, code: code("1") });
  assert.equal(ui.value().find((n) => n.id === "b").data?.heading, 1);
  await ui.act(() => ui.ui().setSettingsOpen(true));
  await waitFor(() => record("settings"));
  await ui.click(record("settings"));
  await ui.act(() => record("settings").dispatchEvent(new window.KeyboardEvent("keydown", { key: "o", metaKey: true, bubbles: true, cancelable: true })));
  assert.match(document.querySelector("[data-shortcut-pending]").textContent, /reserved for the app \(Open document\)/);
  await ui.click(record("settings"));
  await ui.act(() => record("settings").dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", shiftKey: true, code: "KeyS", bubbles: true, cancelable: true })));
  assert.match(document.querySelector("[data-shortcut-pending]").textContent, /Add ⌘\/Ctrl or ⌥\/Alt/);
  await ui.click(record("settings"));
  await ui.act(() => record("settings").dispatchEvent(new window.KeyboardEvent("keydown", { key: "s", metaKey: true, altKey: true, code: "KeyS", bubbles: true, cancelable: true })));
  assert.deepEqual(changes.at(-1).shortcuts.settings, ["Mod+Alt+s"], "a free key is saved at once");
  await ui.click(document.querySelector('[aria-label="Reset Show 1 level"]'));
  assert.equal("levels1" in changes.at(-1).shortcuts, false, "reset one");
  const resetAll = [...document.querySelectorAll("[data-outliner-settings] button")].find((b) => /Reset all/.test(b.textContent));
  await ui.click(resetAll);
  assert.deepEqual(changes.at(-1).shortcuts, {}, "reset all");
  await ui.unmount();
});

test("phone: the panel is a bottom sheet with 44px segments", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: doc() });
    await ui.act(() => ui.ui().setSettingsOpen(true));
    assert.ok(document.querySelector('[data-outliner-settings][data-slot="drawer-content"]'), "a drawer, not a dialog");
    assert.match(document.querySelector('[data-setting="density"]').className, /coarse:h-11/);
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});
