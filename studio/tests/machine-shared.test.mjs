// Contract tests for the pieces Machine View and Machine Tree share (machine-shared/, lib/platform).
// Same pattern as machine-view.test.mjs: `node --test` plus Vite's own SSR loader, no framework.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({ root, logLevel: "error", server: { middlewareMode: true, hmr: false }, appType: "custom", optimizeDeps: { noDiscovery: true, include: [] } });
});
after(() => vite?.close());

/* ───────── structural issues (one helper, both components) ───────── */

const graph = {
  id: "m",
  label: "M",
  initialId: "a",
  nodes: [
    { id: "a", label: "A", kind: "atomic" },
    { id: "stuck", label: "Stuck", kind: "atomic" },
    { id: "done", label: "Done", kind: "final" },
    { id: "box", label: "Box", kind: "compound", initialId: "inner" },
    { id: "inner", label: "Inner", kind: "atomic", parentId: "box" },
    { id: "note", label: "a note", kind: "note", parentId: "a" },
  ],
  transitions: [
    { id: "t1", sourceId: "a", targetId: "stuck", event: "GO" },
    { id: "t2", sourceId: "a", targetId: "done", event: "END" },
    { id: "t3", sourceId: "a", targetId: "inner", event: "IN" },
    { id: "t4", sourceId: "box", targetId: "done", event: "LEAVE" },
    { id: "t5", sourceId: "box", targetId: "inner", event: "RESET" },
  ],
};

test("structuralIssues: dead ends and nested transitions, in Machine View's words", async () => {
  const { structuralIssues, deadEndStates } = await load("/src/registry/machine-shared/machine-issues.ts");
  // `stuck` is entered and has no way out; `inner` has no transition of its own but its container does;
  // `done` is final; `a` is a leaf with a note child (notes don't make a container) and has exits.
  assert.deepEqual(deadEndStates(graph).map((n) => n.id), ["stuck"]);
  const issues = structuralIssues(graph);
  assert.deepEqual(issues.map((i) => [i.code, i.nodeId ?? i.transitionId]), [["nested-transition", "t5"], ["dead-end", "stuck"]]);
  assert.equal(issues[1].message, "Stuck has no way out and isn't final.");
  assert.equal(issues[0].message, "Goes from Box into its own child Inner, so it exits and re-enters Box.");
  assert.ok(issues.every((i) => i.severity === "warning" && i.machineId === "m"));
});

test("Machine Tree shows the shared structural warnings on the right rows (SSR)", async () => {
  const { MachineTree } = await load("/src/registry/machine-tree/machine-tree.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const api = { current: null };
  const document = { version: 1, rootId: "m", machines: [graph] };
  const html = renderToString(React.createElement(TooltipProvider, null, React.createElement(MachineTree, { document, apiRef: api })));
  // The row's accessible name carries its diagnostic.
  assert.match(html, /Stuck, state, diagnostic: Stuck has no way out and isn(&#x27;|')t final\./);
  // A transition-level warning names its route row too, and the toolbar count includes both.
  assert.match(html, /RESET, to Inner[^"]*diagnostic: Goes from Box into its own child Inner, so it exits and re-enters Box\./);
  const count = Number(html.match(/<bdi>(\d+) diagnostics<\/bdi>/)?.[1]);
  const { buildMachineTree } = await load("@fux/core");
  assert.equal(count, buildMachineTree(document).issues.length + 2, "core issues + the two shared warnings");
});

/* ───────── simulation emphasis tokens ───────── */

test("simStateOf: one mapping for both components", async () => {
  const { simStateOf } = await load("/src/registry/machine-shared/machine-sim.ts");
  assert.equal(simStateOf({ leaf: true, ancestor: false, simulating: true }), "active");
  assert.equal(simStateOf({ leaf: false, ancestor: true, simulating: true }), "ancestor");
  assert.equal(simStateOf({ leaf: false, ancestor: false, simulating: true }), "inactive");
  assert.equal(simStateOf({ leaf: false, ancestor: false, simulating: false }), undefined, "not simulating: design colours");
  assert.equal(simStateOf({ leaf: true, ancestor: false, simulating: false }), "active", "host-supplied active states still read as active");
});

// oklch → linear sRGB → WCAG luminance, composited the way machine-sim.css mixes (srgb / oklab).
const parseOklch = (css, scope, name) => {
  const block = css.match(new RegExp(`${scope.replace(".", "\\.")}\\s*\\{([^}]*)\\}`))[1];
  const [, L, C, h] = block.match(new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`));
  return [+L, +C, +h];
};
const toOklab = ([L, C, h]) => [L, C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
const oklabToLinear = ([L, a, b]) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => Math.min(1, Math.max(0, v)));
};
const enc = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const mixSrgb = (x, y, p) => x.map((c, i) => dec(enc(c) * p + enc(y[i]) * (1 - p)));
const mixOklab = (x, y, p) => oklabToLinear(x.map((c, i) => c * p + y[i] * (1 - p)));
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const ratio = (x, y) => { const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p); return (hi + 0.05) / (lo + 0.05); };

test("sim tokens keep text ≥ 4.5:1 on their own surfaces, light and dark", () => {
  const theme = readFileSync(new URL("../src/index.css", import.meta.url), "utf8");
  const sim = readFileSync(new URL("../src/registry/machine-shared/machine-sim.css", import.meta.url), "utf8");
  // The inactive surface is card 55% over canvas (srgb); the active one is signal 7% over card (oklab).
  assert.match(sim, /--sim-surface: color-mix\(in srgb, var\(--card\) 55%, var\(--canvas\)\)/);
  assert.match(sim, /--sim-surface: color-mix\(in oklab, var\(--signal\) 7%, var\(--card\)\)/);
  assert.doesNotMatch(sim, /color-mix\(in oklch/, "never mix a neutral in oklch (it tints pink)");
  for (const scope of [":root", ".dark"]) {
    const v = (name, css = theme) => parseOklch(css, scope, name);
    const lin = (c) => oklabToLinear(toOklab(c));
    const inactiveSurface = mixSrgb(lin(v("card")), lin(v("canvas")), 0.55);
    const activeSurface = mixOklab(toOklab(v("signal")), toOklab(v("card")), 0.07);
    const muted = ratio(lin(v("sim-muted", sim)), inactiveSurface);
    const active = ratio(lin(v("muted-foreground")), activeSurface);
    const name = ratio(lin(v("foreground")), inactiveSurface);
    assert.ok(muted >= 4.5, `${scope} inactive text ${muted.toFixed(2)}:1`);
    assert.ok(active >= 4.5, `${scope} active body text ${active.toFixed(2)}:1`);
    assert.ok(name >= 7, `${scope} inactive names ${name.toFixed(2)}:1`);
  }
});

/* ───────── platform labels, focus hand-off, sheet ───────── */

test("shortcut labels: SSR renders Ctrl; formatShortcut per platform", async () => {
  const { useModKey, useShortcutLabel, formatShortcut, isApplePlatform } = await load("/src/lib/platform.ts");
  function Probe() {
    const label = useShortcutLabel();
    return React.createElement("span", null, `${useModKey()}|${label("mod", "shift", "Z")}`);
  }
  assert.equal(renderToString(React.createElement(Probe)), "<span>Ctrl|Ctrl Shift Z</span>", "the server never guesses Apple");
  assert.equal(formatShortcut(true, "mod", "shift", "Z"), "⇧⌘Z");
  assert.equal(formatShortcut(true, "mod", "↵"), "⌘↵");
  assert.equal(formatShortcut(false, "mod", "↵"), "Ctrl ↵");
  assert.equal(isApplePlatform({ platform: "MacIntel" }), true);
  assert.equal(isApplePlatform({ platform: "Win32" }), false);
  assert.equal(isApplePlatform(undefined), false);
});

test("focus hand-off marks only the component's own focus moves", async () => {
  const { createFocusHandoff } = await load("/src/registry/machine-shared/machine-focus.ts");
  const handoff = createFocusHandoff();
  const seen = [];
  const el = { focus: (options) => seen.push([handoff.active, options]) };
  handoff.focus(el);
  handoff.focus(null);
  assert.deepEqual(seen, [[true, { preventScroll: true }]]);
  assert.equal(handoff.active, false, "cleared after the call");
  assert.throws(() => handoff.focus({ focus: () => { throw new Error("x"); } }));
  assert.equal(handoff.active, false, "cleared even when focus throws");
});

test("shared sheet: SSR-safe, non-modal host, shared tab classes", async () => {
  const sheet = await load("/src/registry/machine-shared/machine-sheet.tsx");
  const html = renderToString(
    React.createElement(sheet.MachineSheet, { open: true, onOpenChange() {}, snap: "peek", onSnapChange() {}, tabs: null, children: "body" }),
  );
  // The host is pointer-transparent and the server renders no section (it needs the host's height).
  assert.match(html, /data-slot="machine-sheet-host"/);
  assert.match(html, /pointer-events-none/);
  assert.doesNotMatch(html, /aria-modal|inert|aria-hidden="true"/);
  assert.equal(sheet.SHEET_BAR, 44);
  assert.ok(sheet.SHEET_PEEK > 0 && sheet.SHEET_PEEK < sheet.SHEET_MAX && sheet.SHEET_MAX < 1);
  assert.match(sheet.sheetTabClass, /h-full!/);
});

/* ───────── one vocabulary (machine-copy): both components say the same sentences ───────── */

test("machine-copy: start, send, blocked and finish sentences", async () => {
  const copy = await load("/src/registry/machine-shared/machine-copy.ts");
  assert.equal(copy.describeStart(["Draft"]), "Simulation started — now in Draft");
  assert.equal(copy.describeStart(["A"], false, "Playing scenario Happy path"), "Playing scenario Happy path — now in A");
  assert.equal(copy.describeSend("SUBMIT", ["Review"]), "SUBMIT fired — now in Review");
  assert.equal(copy.describeSend("DECLINE", ["Declined"], true), "DECLINE fired — now in Declined; the machine finished");
  assert.equal(copy.describeSend("CONNECTED", ["Connected", "Loading settings"]), "CONNECTED fired — now in Connected and Loading settings");
  assert.equal(copy.describeSend("X", []), "X fired — now in no state");
  assert.equal(copy.describeBlocked("DECIDE", copy.guardIsFalse("approved")), "DECIDE blocked — guard approved is false");
  assert.equal(copy.guardIsFalse(["a", "b"]), "guard a / b is false");
  assert.equal(copy.listOf(["A", "B", "C"]), "A, B and C");
  assert.equal(copy.plural(1, "state"), "1 state");
  assert.equal(copy.plural(2, "state"), "2 states");
  assert.equal(copy.plural(2, "entry", "entries"), "2 entries");
  assert.equal(copy.modCombo("⌘", "K"), "⌘-K");
  assert.equal(copy.modCombo("Ctrl", "K"), "Ctrl+K");
});

test("machine-copy: one plural and one key-cap vocabulary, used by both components", async () => {
  const copy = await load("/src/registry/machine-shared/machine-copy.ts");
  const tree = await load("/src/registry/machine-tree/machine-tree-logic.ts");
  const view = await load("/src/registry/machine-view/machine-context.ts");
  assert.equal(tree.plural, copy.plural, "the tree's plural is the shared one");
  assert.equal(view.plural, copy.plural, "Machine View's plural is the shared one");
  assert.equal(tree.modCombo, copy.modCombo);
  assert.equal(copy.KEY.enter, "↵");
  assert.equal(copy.KEY.escape, "esc");
  // No sentence is built outside machine-copy, and no key cap is spelled out by hand.
  const dirs = ["machine-view", "machine-tree"];
  const { readdirSync } = await import("node:fs");
  for (const dir of dirs) {
    const base = new URL(`../src/registry/${dir}/`, import.meta.url);
    for (const file of readdirSync(base).filter((f) => /\.tsx?$/.test(f))) {
      const src = readFileSync(new URL(file, base), "utf8");
      assert.doesNotMatch(src, /fired — now in|now in \$\{|: now in/, `${dir}/${file} builds a send/start sentence by hand`);
      assert.doesNotMatch(src, /Guard [“"]|“\$\{g\}”/, `${dir}/${file} quotes or capitalises a guard`);
      assert.doesNotMatch(src, /<Kbd[^>]*>(Esc|esc|Enter|↵)<\/Kbd>|kbd="Esc"|<kbd/, `${dir}/${file} spells a key cap by hand`);
      assert.doesNotMatch(src, /const plural = /, `${dir}/${file} has its own plural`);
    }
  }
});

test("per-instance toaster: toasts carry their owner and a persistent marker; ids are namespaced", async () => {
  const src = readFileSync(new URL("../src/registry/machine-shared/machine-toast.tsx", import.meta.url), "utf8");
  assert.match(src, /data-persistent=\{persistent \|\| undefined\}/);
  assert.match(src, /"data-machine-toast-owner": id/);
  const view = readFileSync(new URL("../src/registry/machine-view/machine-view.tsx", import.meta.url), "utf8");
  assert.match(view, /useMachineToaster\(root, \{ toolbar: "\[data-mv-toolbar\]" \}\)/, "Machine View's phone shell has its own toaster under its toolbar");
});
