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

test("compact baseline separates text, input, surface borders and outline geometry without shrinking targets", () => {
  const tokens = read("tokens.css");
  assert.match(tokens, /--fux-radius:\s*0\.25rem/);
  assert.match(tokens, /--fux-radius-lg:\s*0\.375rem/);
  assert.match(tokens, /--fux-font-size:\s*0\.9375rem/);
  assert.match(tokens, /--fux-input-font-size:\s*max\(1rem, var\(--fux-font-size\)\)/);
  assert.match(tokens, /--fux-border-subtle:/);
  assert.match(tokens, /--fux-outline-indent:/);
  assert.match(tokens, /--fux-outline-padding:/);
  for (const file of ["styles.css", "react/editor.css"]) {
    assert.match(read(file), /var\(--fux-outline-indent, 1rem\)/);
    assert.match(read(file), /var\(--fux-outline-padding, 0\.625rem\)/);
  }
  assert.match(read("styles.css"), /border-inline-start: 1px solid var\(--fux-border-subtle/);
});

test("editor input, text decoration and placeholder retain readable input typography at compact density", () => {
  const css = read("react/editor.css");
  const sharedTypography = css.match(
    /\.fast-ux-editor__input,\s*\.fast-ux-editor__decoration\s*\{([^}]+)\}/,
  )?.[1];
  assert.ok(sharedTypography, "input and decoration use one shared typography rule");
  assert.match(
    sharedTypography,
    /font:\s*inherit;\s*font-size:\s*var\(--fux-input-font-size,\s*1rem\);/,
  );
  assert.match(sharedTypography, /line-height:\s*1\.5;/);
  const placeholderTypography = css.match(/\.fast-ux-editor__placeholder-input\s*\{([^}]+)\}/)?.[1];
  assert.ok(placeholderTypography, "placeholder input has a readable typography rule");
  assert.match(
    placeholderTypography,
    /font:\s*inherit;\s*font-size:\s*var\(--fux-input-font-size,\s*1rem\);/,
  );
  assert.match(
    read("tokens.css"),
    /--fux-input-font-size:\s*max\(1rem,\s*var\(--fux-font-size\)\);/,
  );
});
