// Surfaces that must look right while they move and wherever they land: the folded-summary sheet
// keeps its content while it closes; the mind map never fits below readable type and shows one
// focus ring; submenu text lines up with the iconed parent menu; a toast's × sits inside its
// card; and an undo toast never covers the row it is about.
//
//   cd studio && node --test tests/outliner-surfaces.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { domEnv, load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let mindmap, toasts;
before(async () => {
  mindmap = await load("/src/registry/outliner/mindmap.ts");
  toasts = await load("/src/registry/outliner/toasts.ts");
});
after(() => stopVite());

const source = (name) => readFileSync(fileURLToPath(new URL(`../src/registry/outliner/${name}`, import.meta.url)), "utf8");

const doc = () => [
  {
    id: "p",
    text: "Project",
    children: [
      { id: "t1", text: "Write spec", checked: true },
      { id: "t2", text: "Review spec", checked: false },
      { id: "t3", text: "Ship it", checked: false },
    ],
  },
  { id: "q", text: "Other" },
];

/* ───────────── Folded summary: no wrong frame while closing ───────────── */

test("fold summary: while its popover closes it keeps listing the open tasks (never 'Every task here is done')", async () => {
  await domEnv();
  // Give the popover an exit animation, as the browser does, so it stays mounted (closing) until
  // its animationend: the frames a person sees while it fades away. The phone sheet shares the
  // same list (checked in the browser: every closing frame kept its tasks).
  const real = window.getComputedStyle;
  const animated = (el) => el?.closest?.("[data-fold-tasks]");
  window.getComputedStyle = globalThis.getComputedStyle = (el, pseudo) => {
    const style = real.call(window, el, pseudo);
    const name = () => (el.closest("[data-fold-tasks]").getAttribute("data-state") === "closed" ? "fade-out" : "fade-in");
    return animated(el) ? new Proxy(style, { get: (target, key) => (key === "animationName" ? name() : Reflect.get(target, key)) }) : style;
  };
  try {
    const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: [] });
    await ui.click(ui.row("p").querySelector("[data-fold-summary]"));
    const popover = await waitFor(() => document.querySelector("[data-fold-tasks]"));
    const listed = () => [...popover.querySelectorAll("[data-fold-task]")].map((el) => el.dataset.foldTask);
    assert.deepEqual(listed(), ["t2", "t3"]);
    await ui.act(() => popover.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    assert.equal(ui.row("p").querySelector("[data-fold-summary]").getAttribute("aria-expanded"), "false", "closing");
    assert.ok(popover.isConnected, "still on screen while it animates out");
    assert.equal(popover.getAttribute("data-state"), "closed");
    assert.deepEqual(listed(), ["t2", "t3"], "the exiting popover still shows its tasks");
    assert.doesNotMatch(popover.textContent, /Every task here is done/);
    assert.match(popover.querySelector("[role=group]").getAttribute("aria-label"), /2 open tasks/);
    await ui.act(() => popover.dispatchEvent(new window.Event("animationend", { bubbles: true })));
    await ui.unmount();
  } finally {
    window.getComputedStyle = globalThis.getComputedStyle = real;
  }
});

test("fold summary: the list is kept from its last open state, not recomputed empty on close", () => {
  const code = source("outliner-fold-tasks.tsx");
  assert.doesNotMatch(code, /open \? branchTasks\(node\) : \[\]/, "closing never empties the list");
  assert.match(code, /kept\.current/);
});

/* ───────────── Mind map: readable fit, one focus ring ───────────── */

const boxes = (count, { width = 120, height = 30, gap = 40 } = {}) => {
  const map = new Map([["root", { x: 0, y: count * gap * 0.5, width: 140, height: 40 }]]);
  for (let i = 0; i < count; i++) map.set(`n${i}`, { x: 220 + (i % 3) * 200, y: i * gap, width, height });
  return map;
};

test("mind map fit: a big map on a phone never drops below readable type (labels ≥ 12 px); the root stays in view", () => {
  assert.ok(13 * mindmap.MIN_FIT_ZOOM >= 12 - 1e-9, "13 px labels render at 12 px or more");
  const map = boxes(60);
  const phone = { width: 390, height: 560 };
  const view = mindmap.fitMindMap(map, "root", phone, { narrow: true });
  assert.ok(view.zoom >= mindmap.MIN_FIT_ZOOM, `zoom ${view.zoom} is readable`);
  const root = map.get("root");
  const left = root.x * view.zoom + view.x;
  const top = root.y * view.zoom + view.y;
  assert.ok(left >= 0 && left + root.width * view.zoom <= phone.width, "the root is across the screen");
  assert.ok(top >= 0 && top + root.height * view.zoom <= phone.height, "and on it vertically");
  // RTL: the one-sided map grows to the left, so the root pins to the right edge.
  const mirrored = new Map([...map].map(([id, b]) => [id, { ...b, x: -b.x - b.width }]));
  const rtl = mindmap.fitMindMap(mirrored, "root", phone, { narrow: true, rtl: true });
  const rootRtl = mirrored.get("root");
  assert.ok(rootRtl.x * rtl.zoom + rtl.x + rootRtl.width * rtl.zoom <= phone.width + 0.5, "RTL root in view");
});

test("mind map fit: a small map is shown whole at 1:1; desktop fits big maps but not below readable", () => {
  const small = boxes(3);
  const desk = { width: 1100, height: 700 };
  assert.equal(mindmap.fitMindMap(small, "root", desk).zoom, 1, "never past 1:1");
  const medium = boxes(14);
  const fitted = mindmap.fitMindMap(medium, "root", desk);
  assert.ok(fitted.zoom < 1 && fitted.zoom >= mindmap.MIN_FIT_ZOOM);
  const huge = mindmap.fitMindMap(boxes(400), "root", desk);
  assert.equal(huge.zoom, mindmap.MIN_FIT_ZOOM, "floored at readable");
  const phone = mindmap.fitMindMap(small, "root", { width: 390, height: 600 }, { narrow: true });
  assert.ok(phone.zoom >= mindmap.MIN_FIT_ZOOM && phone.zoom <= 1);
});

test("mind map focus: the canvas draws no ring of its own; the focused node's ring shows only under keyboard focus", () => {
  const code = source("outliner-mindmap.tsx");
  const canvas = /data-mindmap=""\s+className="([^"]+)"/.exec(code)?.[1] ?? "";
  assert.ok(canvas, "found the canvas classes");
  assert.doesNotMatch(canvas, /focus-visible:ring/, "no canvas ring");
  assert.match(canvas, /group\/map/);
  assert.match(code, /focused && "group-focus-visible\/map:ring-3/, "the node ring follows the map's keyboard focus");
  assert.doesNotMatch(code, /focused && "ring-3/, "never an always-on ring");
});

/* ───────────── Submenus line up with the iconed parent ───────────── */

test("submenus: entries without a glyph are inset by the icon column (Show levels, Notes, Sort children)", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["p"] });
  const trigger = ui.container.querySelector("[data-view-menu-trigger]");
  await ui.act(() => {
    trigger.focus();
    trigger.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  const levels = await waitFor(() => [...document.querySelectorAll("[role=menu] [role=menuitem]")].find((el) => el.textContent.trim() === "Show levels"));
  assert.ok(levels.querySelector("svg"), "the parent row has a glyph");
  await ui.act(() => {
    levels.focus();
    levels.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true, cancelable: true }));
  });
  const sub = await waitFor(() => [...document.querySelectorAll("[role=menu]")].find((menu) => /Show 2 levels/.test(menu.textContent) && !/Expand all/.test(menu.textContent)));
  const entries = [...sub.querySelectorAll("[role=menuitem]")];
  assert.ok(entries.length >= 4);
  for (const entry of entries) assert.ok(entry.hasAttribute("data-inset"), `${entry.textContent} is inset`);
  await ui.unmount();
  // The same rule in the item menu (Sort children), and never a stray inset elsewhere.
  const chrome = source("outliner-chrome.tsx");
  assert.match(chrome, /inset=\{inSub && !entry\.icon \? true : undefined\}/, "item submenus inset glyph-less entries");
  assert.doesNotMatch(chrome + source("outliner-menu.tsx"), /inset=\{(?:inSub && )?!\w+\.icon\}/, 'never a bare boolean: data-inset="false" would still match the inset selector');
});

/* ───────────── Toasts ───────────── */

test("toasts: the × sits inside the card at the inline end (mirrored in RTL); a long toast's icon aligns with its title", () => {
  const top = toasts.insideClose("top");
  assert.match(top.toast, /\[--toast-close-button-start:auto\]/);
  assert.match(top.toast, /\[--toast-close-button-end:0\.5rem\]/);
  assert.match(top.toast, /\[--toast-close-button-transform:none\]/, "not hung off the corner");
  assert.match(top.toast, /rtl:\[--toast-close-button-start:0\.5rem\]/);
  assert.match(top.title, /pe-8/, "the title never runs under it");
  assert.match(toasts.insideClose("center").toast, /pe-11!/, "a one-line toast keeps its action clear of it");
  assert.match(top.closeButton, /top-2!/);
  assert.match(top.closeButton, /coarse:size-11!/, "44 px on touch");
  assert.match(top.icon, /self-start/);
  const center = toasts.insideClose("center");
  assert.match(center.closeButton, /top-1\/2!/, "a one-line toast: beside its action");
  assert.match(source("outliner-import-report.tsx"), /classNames: insideClose\("top"\)/, "the import report uses it");
  assert.match(source("outliner.tsx"), /insideClose\("center"\)/, "so does a sticky undo toast");
});

test("toasts: a row covered by the front toast scrolls just clear of it; a row elsewhere stays put", () => {
  const rect = (top, height, left = 0, width = 900) => ({ top, bottom: top + height, left, right: left + width, width, height, x: left, y: top, toJSON() {} });
  document.body.innerHTML = "";
  const scroller = document.createElement("div");
  scroller.setAttribute("data-outliner-scroll", "");
  const row = document.createElement("div");
  scroller.append(row);
  const toaster = document.createElement("ol");
  toaster.setAttribute("data-sonner-toaster", "");
  toaster.setAttribute("data-y-position", "bottom");
  const front = document.createElement("li");
  front.setAttribute("data-sonner-toast", "");
  front.setAttribute("data-front", "true");
  Object.defineProperty(front, "offsetHeight", { value: 56 });
  toaster.append(front);
  document.body.append(scroller, toaster);
  // A 1440×900 window: the toaster sits 24 px above the bottom, 356 px wide at the right.
  toaster.getBoundingClientRect = () => rect(876, 0, 1060, 356);
  const scrolls = [];
  scroller.scrollBy = (options) => scrolls.push(options.top);
  row.getBoundingClientRect = () => rect(822, 28, 320);
  toasts.keepClearOfToasts(row);
  assert.deepEqual(scrolls, [850 - (876 - 56 - 8)], "scrolled up by exactly the overlap");
  row.getBoundingClientRect = () => rect(500, 28, 320);
  toasts.keepClearOfToasts(row);
  assert.equal(scrolls.length, 1, "a row above the toast stays");
  scroller.getBoundingClientRect = () => rect(105, 750);
  row.getBoundingClientRect = () => rect(822, 28, 0, 600);
  toasts.keepClearOfToasts(row);
  assert.equal(scrolls.length, 1, "a row beside the toast (no horizontal overlap) stays");
  row.getBoundingClientRect = () => rect(927, 28, 0, 600);
  toasts.keepClearOfToasts(row);
  assert.deepEqual(scrolls.at(-1), 955 - 812, "a row left below the visible list comes up into view");
  document.body.innerHTML = "";
});
