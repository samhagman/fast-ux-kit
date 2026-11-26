import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import test from "node:test";
import * as Components from "../src/components/index.js";

const packageName = "@samhagman/fast-ux-kit";
const families = Components.componentManifest.filter((entry) => entry.layer === "family");
const primitives = Components.componentManifest.filter((entry) => entry.layer === "primitive");

/** Loads the source module a published import path points at. */
async function load(importPath: string): Promise<Record<string, unknown>> {
  if (importPath === `${packageName}/components`) return Components;
  const file = importPath.match(/^@samhagman\/fast-ux-kit\/components\/ui\/([a-z-]+)$/)?.[1];
  assert.ok(file, `${importPath} is a published components entry`);
  return (await import(`../src/components/ui/${file}.js`)) as Record<string, unknown>;
}

test("all manifest parts resolve to supported public exports or compound members", async () => {
  assert.equal(families.length, 92);
  assert.equal(primitives.length, 11);
  assert.equal(Components.componentManifest.length, families.length + primitives.length);
  for (const entry of Components.componentManifest) {
    const module = await load(entry.importPath);
    assert.ok(entry.exportName in module, `${entry.name} has a public export`);
    assert.ok(entry.parts.length > 0, `${entry.name} declares its parts`);
    assert.equal(new Set(entry.parts).size, entry.parts.length, `${entry.name} has unique parts`);
    for (const part of entry.parts) {
      let value: unknown = module;
      for (const member of part.split(".")) {
        assert.ok(
          value !== null &&
            (typeof value === "object" || typeof value === "function") &&
            member in value,
          `${entry.name} exposes ${part}`,
        );
        value = (value as Record<string, unknown>)[member];
      }
      assert.ok(value, `${part} is available`);
    }
  }
});

test("families import from /components and primitives from their own components/ui module", () => {
  const names = new Set(Components.componentManifest.map((entry) => entry.name));
  assert.equal(names.size, Components.componentManifest.length, "entry names are unique");
  for (const entry of families) assert.equal(entry.importPath, `${packageName}/components`);
  for (const entry of primitives) {
    assert.match(entry.importPath, /^@samhagman\/fast-ux-kit\/components\/ui\/[a-z-]+$/);
    assert.ok(!(entry.exportName in Components), `${entry.name} is not also a /components export`);
  }
});

// Every shadcn-layer file is either listed as a primitive or served by the family named here.
const coveredBy: Readonly<Record<string, string | null>> = {
  breadcrumb: "Breadcrumbs",
  button: "Button",
  calendar: "Calendar",
  checkbox: "Checkbox",
  dialog: "Dialog",
  drawer: "Drawer",
  field: "Field",
  "hover-card": "HoverCard",
  input: "Field",
  popover: "Popover",
  progress: "ProgressBar",
  resizable: "Splitter",
  "scroll-area": "ScrollArea",
  select: "Select",
  separator: "Separator",
  sheet: "Sheet",
  sonner: "Toast",
  switch: "Switch",
  tabs: "Tabs",
  textarea: "TextArea",
  "toggle-group": "ToggleButtonGroup",
  toggle: "ToggleButton",
  tooltip: "Tooltip",
  // Internal helpers for the layer (render props, dismissal); not a component.
  compat: null,
};

test("every components/ui file is listed as a primitive or covered by a family", () => {
  const files = readdirSync(new URL("../src/components/ui/", import.meta.url))
    .filter((file) => file.endsWith(".tsx"))
    .map((file) => file.slice(0, -".tsx".length));
  const listed = new Set(primitives.map((entry) => entry.importPath.split("/").at(-1)!));
  for (const file of files) {
    const family = coveredBy[file];
    if (listed.has(file)) {
      assert.equal(family, undefined, `${file} is listed and also marked covered`);
      continue;
    }
    assert.ok(family !== undefined, `components/ui/${file} is listed or has a covering family`);
    if (family)
      assert.ok(
        families.some((entry) => entry.name === family),
        `${family} covers components/ui/${file}`,
      );
  }
  assert.deepEqual(
    [...listed].filter((file) => !files.includes(file)),
    [],
    "listed files exist",
  );
});
