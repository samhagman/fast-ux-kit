import { browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import { DirectionScope } from "../src/lib/direction.js";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  Sheet,
  SheetContent,
  SheetTitle,
} from "../src/components/overlays.js";

/*
 * Sheet motion must ship in the stylesheet a consumer imports. Compile src/library.css exactly as
 * the build does, with no consumer Tailwind or animation plugin, and check the rules Sheet uses.
 */
const root = fileURLToPath(new URL("..", import.meta.url));
const shipped = execFileSync(
  process.execPath,
  [join(root, "node_modules/@tailwindcss/cli/dist/index.mjs"), "-i", "src/library.css", "--minify"],
  { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] },
);

const escape = (token: string) => token.replace(/[^\w-]/g, (char) => `\\${char}`);
const rules = [...shipped.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
  selectors: match[1]!.split(","),
  body: match[2]!,
}));
/** The declarations of the shipped rule whose selector list holds this exact selector. */
function declarations(selector: string) {
  const found = rules.filter((rule) => rule.selectors.includes(selector));
  assert.ok(found.length > 0, `The shipped stylesheet has no rule for ${selector}`);
  return found.map((rule) => rule.body).join(";");
}
const reducedMotion = [
  ...shipped.matchAll(/@media \(prefers-reduced-motion:\s*reduce\)\{((?:[^{}]*\{[^{}]*\})*)\}/g),
]
  .map((match) => match[1])
  .join("");

const sides = {
  top: ["-translate-y-full", "--tw-translate-y:-100%"],
  right: ["translate-x-full", "--tw-translate-x:100%"],
  bottom: ["translate-y-full", "--tw-translate-y:100%"],
  left: ["-translate-x-full", "--tw-translate-x:-100%"],
} as const;
type Side = keyof typeof sides;

function openSheet(side: Side) {
  render(
    <Sheet open onOpenChange={() => {}}>
      <SheetContent side={side}>
        <SheetTitle>Filters</SheetTitle>
      </SheetContent>
    </Sheet>,
  );
  const panel = document.querySelector<HTMLElement>('[data-slot="sheet-content"]');
  const overlay = document.querySelector<HTMLElement>('[data-slot="sheet-overlay"]');
  assert.ok(panel && overlay, "the open sheet renders its panel and overlay");
  return { panel, overlay };
}
const tokens = (element: Element) => element.className.split(/\s+/).filter(Boolean);

afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

test("every class a sheet and its overlay ask for ships in the kit stylesheet", () => {
  for (const side of Object.keys(sides) as Side[]) {
    const { panel, overlay } = openSheet(side);
    for (const token of [...tokens(panel), ...tokens(overlay)]) {
      assert.doesNotMatch(
        token,
        /animate-(?:in|out)|fade-(?:in|out)|slide-(?:in|out)|zoom-(?:in|out)/,
        `${side} sheet relies on an animation plugin utility: ${token}`,
      );
      assert.ok(shipped.includes(`.${escape(token)}`), `${side} sheet class ${token} has no rule`);
    }
    cleanup();
  }
});

test("a sheet slides fully in from its own side and back out over the standard duration", () => {
  for (const [side, [utility, offset]] of Object.entries(sides) as [Side, readonly string[]][]) {
    const { panel } = openSheet(side);
    const classes = tokens(panel);
    for (const phase of ["starting", "ending"] as const) {
      const token = `data-[side=${side}]:data-${phase}-style:${utility}`;
      assert.ok(classes.includes(token), `${side} sheet has ${token}`);
      const body = declarations(`.${escape(token)}[data-side=${side}][data-${phase}-style]`);
      assert.match(body, new RegExp(offset), `${side} sheet ${phase} offset`);
      assert.match(body, /translate:var\(--tw-translate-x\) var\(--tw-translate-y\)/);
    }
    for (const token of ["transition-transform", "duration-200", "ease-standard"]) {
      assert.ok(classes.includes(token), `${side} sheet has ${token}`);
    }
    cleanup();
  }
  assert.match(declarations(".transition-transform"), /transition-property:transform,translate/);
  assert.match(declarations(".duration-200"), /transition-duration:\.2s/);
  assert.match(
    declarations(".ease-standard"),
    /transition-timing-function:cubic-bezier\(\.2, ?0, ?0, ?1\)/,
  );
});

test("the sheet overlay fades in and out", () => {
  const { overlay } = openSheet("right");
  const classes = tokens(overlay);
  for (const phase of ["starting", "ending"] as const) {
    const token = `data-${phase}-style:opacity-0`;
    assert.ok(classes.includes(token), `overlay has ${token}`);
    assert.match(declarations(`.${escape(token)}[data-${phase}-style]`), /opacity:0/);
  }
  assert.ok(classes.includes("transition-opacity"));
  assert.match(declarations(".transition-opacity"), /transition-property:opacity/);
});

test("with reduced motion the sheet and its overlay appear without moving", () => {
  const { panel, overlay } = openSheet("left");
  assert.ok(tokens(panel).includes("motion-reduce:transition-none"));
  assert.ok(tokens(overlay).includes("motion-reduce:transition-none"));
  assert.match(reducedMotion, /\.motion-reduce\\:transition-none\{transition-property:none\}/);
});

test("in a right-to-left scope a right sheet keeps the same physical slide", () => {
  const ltr = tokens(openSheet("right").panel);
  cleanup();
  render(
    <DirectionScope dir="rtl">
      <Sheet open onOpenChange={() => {}}>
        <SheetContent side="right">
          <SheetTitle>Filters</SheetTitle>
        </SheetContent>
      </Sheet>
    </DirectionScope>,
  );
  const panel = document.querySelector<HTMLElement>('[data-slot="sheet-content"]')!;
  assert.equal(panel.getAttribute("dir"), "rtl");
  assert.deepEqual(tokens(panel), ltr, "the slide is anchored to the physical side");
});

test("the drawer overlay fades with shipped rules too", () => {
  render(
    <Drawer open onOpenChange={() => {}}>
      <DrawerContent>
        <DrawerTitle>Share</DrawerTitle>
      </DrawerContent>
    </Drawer>,
  );
  const overlay = document.querySelector<HTMLElement>('[data-slot="drawer-overlay"]');
  assert.ok(overlay, "the open drawer renders its overlay");
  for (const token of tokens(overlay)) {
    assert.ok(shipped.includes(`.${escape(token)}`), `drawer overlay class ${token} has no rule`);
  }
  assert.ok(tokens(overlay).includes("data-starting-style:opacity-0"));
  assert.ok(tokens(overlay).includes("motion-reduce:transition-none"));
});
