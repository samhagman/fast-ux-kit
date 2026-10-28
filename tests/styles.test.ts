import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("all shared semantic tokens used by component, reader and editor skins are defined", () => {
  const css = ["tokens.css", "components.css", "styles.css", "react/editor.css"]
    .map(read)
    .join("\n");
  const defined = new Set([...css.matchAll(/(--fux-[a-z-]+)\s*:/g)].map((match) => match[1]));
  for (const match of css.matchAll(/var\((--fux-[a-z-]+)/g)) {
    assert.ok(defined.has(match[1]), `Missing semantic token ${match[1]}`);
  }
});

test("theme target overrides cannot shrink baseline shared controls below 44px", () => {
  for (const path of ["components.css", "styles.css", "react/editor.css"]) {
    assert.match(read(path), /max\(44px, var\(--fux-target(?:, 44px)?\)\)/);
  }
});

test("block links preserve stacked content and readable fields have distinct semantic roles", () => {
  const css = read("components.css");
  assert.match(css, /\.fux-link\[data-variant="block"\]\s*\{\s*display: block;/);
  assert.match(css, /\.fux-input\s*\{\s*font-size: var\(--fux-input-font-size\);/);
  assert.match(css, /\.fux-error\s*\{\s*color: var\(--fux-error-text\);/);
  assert.match(css, /\.fux-checkbox__mark\s*\{[^}]*flex: none;/);
});
