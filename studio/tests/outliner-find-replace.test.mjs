// Find and replace: what matches (words only, never link targets or dates), match case and
// whole word, notes, replace one / replace all as ONE undo step, locked and read-only, and the
// bar in the real component driven with keys.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let fr, core, Toaster;
before(async () => {
  fr = await load("/src/registry/outliner/find-replace.ts");
  core = await load("@fux/core");
  ({ Toaster } = await load("/src/components/ui/sonner.tsx"));
});
after(() => stopVite());

const doc = () => [
  { id: "a", text: "Plan the **launch** with [[Launch notes|n]] !(2026-11-03)", data: { note: "Launch prep\nsee #launch and launchpad" } },
  { id: "b", text: "Relaunch later", children: [{ id: "b1", text: "launch day", children: [] }] },
  { id: "n", text: "Notes" },
  { id: "l", text: "Locked launch" },
];
const find = (nodes, id) => core.findOutlineNode(nodes, id)?.node;

test("find: matches words (inside formatting, tags), never link targets, dates or markup", () => {
  const matches = fr.findInOutline(doc(), "launch");
  const where = matches.map((m) => `${m.id}:${m.field}:${m.start}`);
  assert.ok(where.includes("a:title:11"), "inside **bold**");
  assert.ok(!matches.some((m) => m.id === "a" && m.field === "title" && m.start > 25), "not in the [[label|id]] target or the date token");
  assert.deepEqual(matches.filter((m) => m.field === "note").map((m) => m.start), [0, 17, 28], "notes, line by line, offsets in the whole note (incl. #launch)");
  assert.equal(fr.findInOutline(doc(), "launch", { notes: false }).filter((m) => m.field === "note").length, 0);
  assert.equal(fr.findInOutline(doc(), "Launch", { matchCase: true }).filter((m) => m.field === "title").length, 0, "case: only 'Launch' in a note");
  assert.deepEqual(
    fr.findInOutline(doc(), "launch", { wholeWord: true }).map((m) => m.id + m.field[0]),
    ["at", "an", "an", "b1t", "lt"],
    "whole word skips Relaunch and launchpad",
  );
  assert.deepEqual(fr.findInOutline(doc(), "launch", {}, "b").map((m) => m.id), ["b", "b1"], "scoped to the zoomed branch");
  assert.deepEqual(fr.findInOutline(doc(), ""), []);
  assert.deepEqual(fr.findInOutline(doc(), "a.c"), [], "the query is literal, never a pattern");
});

test("replace: all matches as one transaction, offsets intact, links and dates untouched, locked skipped", () => {
  const nodes = doc();
  const matches = fr.findInOutline(nodes, "launch");
  const plan = fr.planReplace(nodes, matches, "ship", (id) => id === "l");
  assert.equal(plan.skipped, 1);
  assert.equal(plan.replaced, matches.length - 1);
  const result = core.applyOutlineTransaction(nodes, plan.commands, { readOnly: false });
  assert.equal(result.ok, true);
  const next = result.nodes;
  assert.equal(find(next, "a").text, "Plan the **ship** with [[Launch notes|n]] !(2026-11-03)", "link label and target, date: untouched");
  assert.equal(find(next, "a").data.note, "ship prep\nsee #ship and shippad");
  assert.equal(find(next, "b").text, "Reship later");
  assert.equal(find(next, "l").text, "Locked launch", "locked");
  assert.equal(plan.commands.length, 3, "one update per changed item");
});

test("replace all: only prose — never TeX, image addresses or alt text, site-path link targets or embed and code fences", () => {
  const note = [
    "Intro about foo.",
    "$$",
    "\\frac{foo}{2}",
    "$$",
    "$$ foo^2 $$",
    "```math",
    "foo^3",
    "```",
    "![foo](/media/foo.png)",
    "[foo doc](/foo/page) and ![foo pic](https://x.test/foo.png) inline",
    "```embed:video",
    "foo-video-id",
    "```",
    "- a list foo",
    "> quoted foo",
    "| foo | bar |",
    "|-----|-----|",
    "| cell foo | x |",
    "Inline $foo$ math and `foo` code.",
  ].join("\n");
  const nodes = [{ id: "a", text: "Title foo [foo](/foo/x) ![foo](https://x.test/foo.png) $foo$", data: { note } }];
  const plan = fr.planReplace(nodes, fr.findInOutline(nodes, "foo"), "BAR");
  const result = core.applyOutlineTransaction(nodes, plan.commands, { readOnly: false });
  const next = find(result.nodes, "a");
  assert.equal(next.text, "Title BAR [BAR](/foo/x) ![foo](https://x.test/foo.png) $foo$", "title: the link label, not its target; no image; no math");
  const lines = next.data.note.split("\n");
  assert.equal(lines[0], "Intro about BAR.");
  assert.equal(lines[2], "\\frac{foo}{2}", "display math untouched");
  assert.equal(lines[4], "$$ foo^2 $$", "one-line display math untouched");
  assert.equal(lines[6], "foo^3", "a math fence untouched");
  assert.equal(lines[8], "![foo](/media/foo.png)", "an image block: alt and address untouched");
  assert.equal(lines[9], "[BAR doc](/foo/page) and ![foo pic](https://x.test/foo.png) inline", "site-path target and inline image untouched");
  assert.equal(lines[11], "foo-video-id", "an embed fence untouched");
  assert.equal(lines[13], "- a list BAR");
  assert.equal(lines[14], "> quoted BAR");
  assert.equal(lines[15], "| BAR | bar |");
  assert.equal(lines[17], "| cell BAR | x |");
  assert.equal(lines[18], "Inline $foo$ math and `BAR` code.", "inline math untouched; inline code is visible words");
  assert.equal(plan.replaced, 9);
});

test("component: ⌥⌘F opens the bar; typing reveals the first match; Enter steps; replace one, then all as ONE undo step", async () => {
  // With the page's toaster: a receipt that offers Undo is spoken by the toast region.
  const { createElement, Fragment } = await import("react");
  const props = { defaultValue: doc(), defaultExpandedIds: [], isLocked: (node) => node.id === "l" };
  const ui = await mountOutliner(props, { wrap: (make) => createElement(Fragment, null, make(props), createElement(Toaster, { duration: 60_000 })) });
  await ui.select("n");
  await ui.key("f", { metaKey: true, altKey: true, code: "KeyF" });
  const input = document.querySelector('[data-find-replace] input[aria-label="Find"]');
  assert.ok(input, "the bar opened");
  await ui.frames();
  assert.equal(document.activeElement, input, "focus is in Find");
  await ui.act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, "launch");
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  await ui.frames();
  assert.match(document.querySelector("#ol-find-status").textContent, /1 of 7/);
  assert.deepEqual(ui.selection(), ["a"], "the first match is the cursor row");
  for (let i = 0; i < 4; i++) await ui.key("Enter");
  assert.deepEqual(ui.selection(), ["b"], "Enter steps (title, three in the note, then b)");
  await ui.key("Enter");
  assert.ok(ui.ol().rows.some((r) => r.id === "b1"), "a match inside a fold unfolds to show it");
  await ui.key("Enter", { shiftKey: true });
  assert.deepEqual(ui.selection(), ["b"], "⇧Enter steps back");

  const replace = document.querySelector('[data-find-replace] input[aria-label="Replace with"]');
  await ui.act(() => {
    replace.focus();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(replace, "ship");
    replace.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const before = ui.ol().state.history.past.length;
  await ui.key("Enter");
  assert.equal(find(ui.value(), "b").text, "Reship later", "Enter in Replace replaces the current match");
  assert.match(document.querySelector("#ol-find-status").textContent, /of 6/);
  await ui.key("Enter", { metaKey: true });
  assert.equal(ui.ol().state.history.past.length, before + 2, "replace one + replace all: two undo steps");
  assert.match(document.querySelector("#ol-find-status").textContent, /of 1|No results/, "only the locked match is left");
  assert.equal(find(ui.value(), "l").text, "Locked launch");
  // One live channel: a receipt with Undo is the toast, which speaks it; the polite region does not repeat it.
  const toasts = () => [...document.querySelectorAll("[data-sonner-toast]")].map((el) => el.textContent).join(" | ");
  await waitFor(() => /locked match skipped/.test(toasts()));
  assert.doesNotMatch(ui.live(), /locked match skipped/);
  await ui.act(() => ui.handle.current.undo());
  assert.equal(find(ui.value(), "a").data.note, "Launch prep\nsee #launch and launchpad", "one undo restores every replacement");
  assert.equal(find(ui.value(), "b").text, "Reship later", "(the single replace is its own step)");
  await ui.key("Escape");
  assert.equal(ui.ui().findOpen, false, "Esc closes (the bar animates out)");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(document.activeElement, ui.tree(), "and the keyboard is back on the tree");
  await ui.unmount();
});

test("component: read-only offers find without replace; the handle opens it with a query", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), readOnly: true });
  await ui.act(() => ui.handle.current.find("later"));
  await ui.frames();
  assert.equal(document.querySelector('[data-find-replace] input[aria-label="Find"]').value, "later");
  assert.equal(document.querySelector('[data-find-replace] input[aria-label="Replace with"]'), null);
  assert.match(document.querySelector("#ol-find-status").textContent, /1 of 1/);
  await ui.unmount();
});

test("highlights: a match maps to the DOM text it renders as (data-src runs)", async () => {
  const { rangeForMatch } = await load("/src/registry/outliner/outliner-find-replace.tsx");
  const ui = await mountOutliner({ defaultValue: doc() });
  const title = ui.row("a").querySelector("[data-ol-title]");
  const range = rangeForMatch(title, 11, 17);
  assert.equal(range?.toString(), "launch", "inside the bold run");
  await ui.unmount();
});
