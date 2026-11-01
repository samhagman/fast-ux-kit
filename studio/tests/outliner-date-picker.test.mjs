// The date chip editor in the real component: a click on a date chip opens it (a popover with a
// pointer, a bottom sheet on touch); picking a day, adding a time, Remove time and Remove each
// rewrite the token once (one undo step each), are spoken, and close the picker.
//
//   cd studio && node --test tests/outliner-date-picker.test.mjs
//
import { after, test } from "node:test";
import assert from "node:assert/strict";
import { media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

after(() => stopVite());

const doc = () => [
  { id: "t", text: "Review !(2026-11-05) today" },
  { id: "u", text: "Other" },
];
const text = (ui) => ui.value().find((n) => n.id === "t").text;
const chip = (ui) => [...ui.row("t").querySelectorAll("[data-ol-title] button")].find((b) => b.querySelector("svg"));
const picker = () => document.querySelector("[data-date-picker]");
const button = (label) => [...picker().querySelectorAll("button")].find((b) => b.textContent.trim() === label);
const day = (iso) => picker().querySelector(`[data-day="${iso}"] button, td[data-day="${iso}"] button`);

async function open(ui) {
  await ui.click(chip(ui));
  return waitFor(picker);
}
/** Gone, and its focus handed back to the row (as a person reopening it a moment later). */
const closed = async (ui) => {
  await waitFor(() => !document.querySelector("[data-date-picker]"));
  await ui.frames();
};

test("date picker: pick a day, add a time, Remove time, Remove — one undo step each", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const steps = () => ui.ol().state.history.past.length;
  const start = steps();
  const surface = await open(ui);
  assert.equal(surface.dataset.datePicker, "popover", "a popover with a pointer");
  assert.equal(surface.getAttribute("aria-label"), "Due date");
  assert.match(surface.className, /max-w-\[calc\(100vw-1rem\)\]/, "never wider than the viewport");
  assert.equal(button("Remove time"), undefined, "a whole day has no time to remove");
  // A day from the calendar.
  await ui.click(day("2026-11-12"));
  assert.equal(text(ui), "Review !(2026-11-12) today");
  assert.equal(steps(), start + 1, "one step");
  assert.match(ui.live(), /Due /, "spoken");
  await closed(ui);
  // Add a time.
  await open(ui);
  await ui.click(button("Add time"));
  const input = picker().querySelector('input[type="time"]');
  assert.ok(input, "a time field appears");
  assert.equal(input.value, "09:00", "suggesting the morning");
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "16:30");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.click(button("Set"));
  assert.equal(text(ui), "Review !(2026-11-12 16:30) today");
  assert.equal(steps(), start + 2);
  await closed(ui);
  // The timed chip opens with its time, and Remove time goes back to the whole day.
  await open(ui);
  assert.equal(picker().querySelector('input[type="time"]').value, "16:30");
  await ui.click(button("Remove time"));
  assert.equal(text(ui), "Review !(2026-11-12) today");
  assert.equal(steps(), start + 3);
  await closed(ui);
  // Remove drops the token (and the doubled space).
  await open(ui);
  await ui.click(button("Remove"));
  assert.equal(text(ui), "Review today");
  assert.equal(steps(), start + 4);
  assert.match(ui.live(), /Date removed/);
  await closed(ui);
  // Each was its own step.
  for (const expected of ["Review !(2026-11-12) today", "Review !(2026-11-12 16:30) today", "Review !(2026-11-12) today", "Review !(2026-11-05) today"]) {
    await ui.act(() => ui.handle.current.undo());
    assert.equal(text(ui), expected);
  }
  await ui.unmount();
});

test("date picker: a repeat keeps the time of day; a range keeps its end when the time changes", async () => {
  const ui = await mountOutliner({ defaultValue: [{ id: "t", text: "Standup !(2026-11-05 09:15)" }, { id: "r", text: "Offsite !(2026-11-03 → 2026-11-06)" }] });
  await open(ui);
  await ui.click(button("Weekly"));
  assert.equal(text(ui), "Standup !(2026-11-05 09:15 every week)");
  await closed(ui);
  // The range: add a start time, the end stays.
  const rangeChip = [...ui.row("r").querySelectorAll("[data-ol-title] button")].find((b) => b.querySelector("svg"));
  await ui.click(rangeChip);
  await waitFor(picker);
  await ui.click(button("Add time"));
  const input = picker().querySelector('input[type="time"]');
  await ui.act(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "10:00");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.act(() => input.form.requestSubmit ? input.form.requestSubmit() : input.form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
  assert.equal(ui.value().find((n) => n.id === "r").text, "Offsite !(2026-11-03 10:00 → 2026-11-06)", "Enter in the time field sets it; the range keeps its end");
  await ui.unmount();
});

test("date picker on touch: a bottom sheet, 44 px targets, Remove and Remove time reachable", async () => {
  media["(pointer: coarse)"] = true;
  try {
    const ui = await mountOutliner({ defaultValue: [{ id: "t", text: "Review !(2026-11-05 16:00)" }] });
    const surface = await open(ui);
    assert.equal(surface.dataset.datePicker, "sheet", "a sheet, like the other phone menus");
    assert.equal(document.querySelector("[data-date-picker=popover]"), null, "no popover");
    for (const label of ["Today", "Tomorrow", "+1 week", "Once", "Weekly", "Range", "Set", "Remove time", "Remove"]) {
      const el = button(label);
      assert.ok(el, `${label} is in the sheet`);
      assert.match(el.className, /\bh-11\b/, `${label} is a 44 px target`);
    }
    assert.match(picker().querySelector("[data-date-time] label").className, /\bh-11\b/, "the time field too");
    const repeatRow = picker().querySelector("[data-repeat-row]");
    assert.match(repeatRow.className, /\bgrid-cols-3\b/, "every repeat choice in view: a grid, not a sideways scroller");
    assert.doesNotMatch(repeatRow.className, /overflow-x-auto/);
    assert.equal(repeatRow.querySelectorAll("button").length, 6, "Once, Daily, Weekdays, Weekly, Monthly, Range");
    assert.match(picker().innerHTML, /\[--cell-size:--spacing\(11\)\]/, "44 px days");
    await ui.click(button("Remove time"));
    assert.equal(ui.value()[0].text, "Review !(2026-11-05)");
    await ui.unmount();
  } finally {
    delete media["(pointer: coarse)"];
  }
});
