// Polish pass: deep links to leaves, the ⋯ menu as a sheet on touch (and never truncating its
// shortcuts with a pointer), 44 px touch targets, short inline code staying on one line, the
// settings tabs cross-fading without a blank frame, and ⌘⇧Space not completing the selection.
//
//   cd studio && node --test tests/outliner-polish.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load, media, mountOutliner, stopVite, waitFor } from "./harness/outliner-dom.mjs";

let permalink, inline, settings;
before(async () => {
  permalink = await load("/src/registry/outliner/permalink.ts");
  inline = await load("/src/registry/outliner/inline.tsx");
  settings = await load("/src/registry/outliner/settings.ts");
});
after(() => stopVite());

const css = (name) =>
  readFileSync(fileURLToPath(new URL(`../../src/outliner/${name}`, import.meta.url)), "utf8");

const doc = () => [
  {
    id: "plan",
    text: "Plan",
    children: [
      {
        id: "evals",
        text: "Evals",
        children: [{ id: "needle", text: "128k needle tests", checked: false }],
      },
      { id: "ship", text: "Ship it", checked: false },
    ],
  },
  { id: "loose", text: "Loose end" },
];

const withCoarse = async (fn) => {
  media["(pointer: coarse)"] = true;
  media["(max-width: 639px)"] = true;
  try {
    await fn();
  } finally {
    delete media["(pointer: coarse)"];
    delete media["(max-width: 639px)"];
  }
};

/* ───────────── Deep links ───────────── */

test("deep link: a branch opens zoomed into it; a leaf opens its parent's zoom with the leaf selected", () => {
  const nodes = doc();
  assert.deepEqual(permalink.deepLinkTarget(nodes, "evals"), { zoom: "evals", select: null });
  assert.deepEqual(permalink.deepLinkTarget(nodes, "needle"), { zoom: "evals", select: "needle" });
  assert.deepEqual(permalink.deepLinkTarget(nodes, "ship"), { zoom: "plan", select: "ship" });
  assert.deepEqual(
    permalink.deepLinkTarget(nodes, "loose"),
    { zoom: null, select: "loose" },
    "a top-level leaf opens the document root",
  );
  assert.equal(permalink.deepLinkTarget(nodes, "missing"), null);
});

test("handle.openLink: a leaf never opens an empty zoom", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["plan", "evals"] });
  await ui.act(() => assert.equal(ui.handle.current.openLink("needle"), true));
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "evals", "zoomed into the parent");
  assert.deepEqual(ui.selection(), ["needle"], "with the leaf selected");
  await ui.act(() => ui.handle.current.openLink("evals"));
  await ui.frames();
  assert.equal(ui.ol().state.hoistedId, "evals", "a branch zooms into itself");
  assert.equal(ui.handle.current.openLink("nope"), false);
  await ui.unmount();
});

/* ───────────── Inline code ───────────── */

test("inline code: a short token stays on one line; a long snippet may wrap", () => {
  assert.equal(inline.isShortCode("halcyon-3"), true);
  assert.equal(inline.isShortCode("evals-2026.10"), true);
  assert.equal(inline.isShortCode("a much longer snippet with spaces"), false);
  assert.equal(inline.isShortCode("x".repeat(40)), false);
});

test("inline code renders nowrap for short tokens only", async () => {
  const ui = await mountOutliner({
    defaultValue: [
      {
        id: "a",
        text: "Ships behind the `halcyon-3` alias and `run the whole long evaluation suite`",
      },
    ],
  });
  const codes = [...ui.row("a").querySelectorAll("code")];
  assert.equal(codes.length, 2);
  assert.match(codes[0].className, /whitespace-nowrap/, "halcyon-3 never breaks at its hyphen");
  assert.doesNotMatch(codes[1].className, /whitespace-nowrap/, "a sentence of code still wraps");
  await ui.unmount();
});

/* ───────────── ⋯ menu ───────────── */

const openViewMenu = async (ui) => {
  const trigger = ui.container.querySelector("[data-view-menu-trigger]");
  assert.ok(trigger, "the ⋯ trigger");
  await ui.act(() => {
    trigger.focus();
    trigger.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await ui.frames();
};

test("⋯ menu with a pointer: a dropdown whose shortcuts never truncate", async () => {
  const ui = await mountOutliner({
    defaultValue: doc(),
    menuCommands: [{ id: "capture", label: "Quick capture", hint: "⌘⇧␣", run: () => {} }],
  });
  await openViewMenu(ui);
  const menu = document.querySelector("[role=menu]");
  assert.ok(menu, "a dropdown menu");
  assert.equal(document.querySelector("[data-menu-sheet]"), null, "no sheet with a pointer");
  assert.match(menu.className, /w-auto/, "the menu sizes to its content");
  assert.match(menu.className, /min-w-60/);
  const shortcuts = [...menu.querySelectorAll("[data-slot=dropdown-menu-shortcut]")];
  assert.ok(
    shortcuts.some((s) => s.textContent === "⌘⇧␣"),
    "the host's capture hint is shown",
  );
  for (const s of shortcuts) {
    assert.match(s.className, /shrink-0/, `${s.textContent} does not shrink`);
    assert.match(s.className, /whitespace-nowrap/, `${s.textContent} does not wrap`);
  }
  const label = [...menu.querySelectorAll("[role=menuitem]")]
    .find((item) => /Quick capture/.test(item.textContent))
    .querySelector("span");
  assert.match(label.className, /truncate/, "the label truncates instead");
  await ui.unmount();
});

test("⋯ menu on touch: a bottom sheet with 44 px rows, pages for submenus, and the host's entries", async () => {
  await withCoarse(async () => {
    let ran = 0;
    const ui = await mountOutliner({
      defaultValue: doc(),
      menuCommands: [{ id: "demo-reset", label: "Demo: reset", run: () => ran++ }],
    });
    const focusCalls = [];
    const focus = window.HTMLElement.prototype.focus;
    window.HTMLElement.prototype.focus = function (options) {
      if (this.hasAttribute?.("data-sheet-entry")) focusCalls.push(options);
      return focus.call(this, options);
    };
    try {
      await openViewMenu(ui);
      await waitFor(() => focusCalls.length > 0);
    } finally {
      window.HTMLElement.prototype.focus = focus;
    }
    const sheet = document.querySelector("[data-menu-sheet]");
    assert.ok(sheet, "a sheet, not a dropdown");
    assert.equal(
      focusCalls[0]?.focusVisible,
      false,
      "a tap-opened sheet lands on its first row without a focus ring",
    );
    assert.equal(document.querySelector("[role=menu][data-slot=dropdown-menu-content]"), null);
    const rows = () => [...document.querySelectorAll("[data-menu-sheet] [data-sheet-entry]")];
    const row = (id) => document.querySelector(`[data-menu-sheet] [data-sheet-entry="${id}"]`);
    assert.ok(
      rows().every((el) => /min-h-11/.test(el.className)),
      "every row is 44 px",
    );
    assert.ok(row("commands"), "a phone reaches the palette from here");
    assert.ok(row("host-demo-reset"), "host entries are there");
    assert.ok(row("settings") && row("find-replace") && row("export"));
    // A submenu is a page with a Back button; a single-choice page checks the current value.
    await ui.click(row("notes"));
    assert.ok(document.querySelector("[data-menu-sheet] [data-sheet-back]"), "a Back button");
    assert.equal(
      document.querySelector("[data-menu-sheet] [role=radiogroup]")?.getAttribute("aria-label"),
      "Notes",
    );
    assert.equal(row("show").getAttribute("aria-checked"), "true");
    await ui.click(row("first-line"));
    assert.equal(ui.ol().view.noteDisplay, "first-line", "choosing a page entry applies it");
    // A checkbox entry reports its state.
    await openViewMenu(ui);
    await waitFor(() => row("hide-completed"));
    assert.equal(row("hide-completed").getAttribute("role"), "menuitemcheckbox");
    assert.equal(row("hide-completed").getAttribute("aria-checked"), "false");
    await ui.click(row("host-demo-reset"));
    await waitFor(() => ran === 1);
    assert.equal(ran, 1, "a host entry runs");
    await ui.unmount();
  });
});

/* ───────────── 44 px touch targets ───────────── */

test("touch targets: the first line, the toolbar, row ⋯, checkboxes, the bulk bar are all 44 px", async () => {
  // The first line shares the action target on both pointer types.
  const rule = css("outliner-settings.css");
  assert.match(rule, /--ol-row-pad:\s*max\(/);
  assert.match(
    rule,
    /calc\(\(max\(44px, var\(--fux-target, 44px\)\) - var\(--ol-leading\)\) \/ 2\)/,
  );
  assert.match(rule, /@media \(pointer: coarse\) \{[\s\S]*?--ol-touch-pad:\s*4px/);
  for (const density of ["compact", "cozy"])
    for (const fontSize of ["small", "default", "large"]) {
      const style = settings.settingsStyle(settings.resolveSettings({ density, fontSize }));
      const leading = parseFloat(style["--ol-leading"]);
      const pad = parseFloat(style["--ol-pad"]);
      for (const touchPad of [0, 4]) {
        const height = leading + 2 * Math.max(pad + touchPad, (44 - leading) / 2);
        assert.ok(height >= 44, `${density}/${fontSize}: the line is ${height} px`);
      }
    }
  // The toolbar: every control in it (the host's too) is at least 44 × 44 on touch.
  const toolbarRule = css("outliner.css").match(
    /@media \(pointer: coarse\) \{[\s\S]*?\[data-outliner-toolbar\] :is\(button, \[role="button"\]\) \{([^}]*)\}/,
  );
  assert.ok(toolbarRule, "a coarse-pointer rule for the toolbar's controls");
  assert.match(toolbarRule[1], /min-width:\s*2\.75rem/);
  assert.match(toolbarRule[1], /min-height:\s*2\.75rem/);
  await withCoarse(async () => {
    const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["plan", "evals"] });
    const toolbar = ui.container.querySelector("[data-outliner-toolbar]");
    assert.ok(toolbar, "the toolbar is marked");
    for (const label of ["Search", "View and document options"])
      assert.ok(
        toolbar.querySelector(`[aria-label="${label}"]`),
        `${label} sits in the toolbar (so the 44 px rule covers it)`,
      );
    assert.ok(toolbar.querySelector('[aria-label^="Bookmarks"]'), "Bookmarks sits in the toolbar");
    // Row ⋯: 44 wide and the line's height (44 on touch).
    const dots = ui.row("ship").querySelector("[data-row-actions]");
    assert.match(dots.className, /\bw-11\b/);
    assert.match(dots.className, /h-\[var\(--ol-line\)\]/);
    // Checkbox: 20 px box plus 13 px on every side of its 18 px padding box = 44.
    const box = ui.row("ship").querySelector("[role=checkbox]");
    assert.match(box.className, /coarse:size-5/);
    assert.match(box.className, /coarse:after:-inset-\[13px\]/);
    assert.match(
      box.parentElement.className,
      /coarse:w-11/,
      "its column is 44 wide, so the title never takes its hit area",
    );
    // The selection bar's buttons.
    await ui.select("ship");
    await ui.act(() => ui.ol().dispatch({ type: "select", id: "loose", extend: true }));
    await ui.frames();
    const bar = document.querySelector("[role=toolbar]");
    assert.ok(bar, "the selection bar is up");
    assert.ok(bar.querySelectorAll("button[data-size^=icon]").length > 0);
    for (const button of bar.querySelectorAll("button[data-size^=icon]"))
      assert.match(
        button.className,
        /coarse:size-11/,
        `${button.getAttribute("aria-label")} is 44 px`,
      );
    await ui.unmount();
  });
});

/* ───────────── Settings tabs ───────────── */

test("settings: a shorter fixed-height dialog, and switching tabs never leaves a blank frame", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  await ui.act(() => ui.ui().setSettingsOpen(true));
  const dialog = document.querySelector("[data-outliner-settings]");
  assert.match(dialog.className, /h-\[min\(80vh,452px\)\]/);
  const tab = (value) => dialog.querySelector(`[data-settings-tab="${value}"]`);
  assert.ok(tab("general"));
  const shortcuts = [...dialog.querySelectorAll("button, [role=radio]")].find(
    (b) => b.textContent.trim() === "Shortcuts",
  );
  await ui.click(shortcuts);
  // The incoming tab is in the document at once (the old one fades out over it, popLayout),
  // never after the old one has finished leaving.
  assert.ok(tab("shortcuts"), "the new tab mounts in the same commit");
  await waitFor(() => !tab("general"));
  assert.ok(tab("shortcuts"));
  await ui.unmount();
});

/* ───────────── Keys ───────────── */

test("⌘⇧Space (quick capture) never completes the selection; plain Space does", async () => {
  const ui = await mountOutliner({ defaultValue: doc(), defaultExpandedIds: ["plan"] });
  await ui.select("ship");
  await ui.key(" ", { metaKey: true, shiftKey: true, code: "Space" });
  assert.equal(ui.value()[0].children[1].checked, false, "⌘⇧Space left it alone");
  await ui.key(" ", { code: "Space" });
  assert.equal(ui.value()[0].children[1].checked, true, "Space completes it");
  await ui.unmount();
});
