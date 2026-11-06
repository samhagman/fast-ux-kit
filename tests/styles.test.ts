import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");

test("all shared semantic tokens used by component, reader and editor skins are defined", () => {
  const css = ["tokens.css", "components/catalog.css", "styles.css", "react/editor.css"]
    .map(read)
    .join("\n");
  const defined = new Set([...css.matchAll(/(--fux-[a-z-]+)\s*:/g)].map((match) => match[1]));
  for (const match of css.matchAll(/var\((--fux-[a-z-]+)/g)) {
    assert.ok(defined.has(match[1]), `Missing semantic token ${match[1]}`);
  }
});

test("the outliner and editor keep their own touch targets; theme overrides cannot shrink them", () => {
  for (const path of ["styles.css", "react/editor.css"]) {
    assert.match(read(path), /max\(44px, var\(--fux-target(?:, 44px)?\)\)/);
  }
});

test("components take the size their variant gives them: no hidden 44px floor", () => {
  const sheets = ["catalog", "basic", "collections", "color-date", "overlays-media", "specialized"];
  for (const name of sheets) {
    const css = read(`components/${name}.css`);
    assert.doesNotMatch(css, /44px|--fux-target/, `${name}.css sets no minimum target size`);
  }
  const sources = ["basic", "collections", "colors", "dates", "overlays", "media", "specialized"]
    .map((name) => `components/${name}.tsx`)
    .concat(
      ["button", "toggle", "checkbox", "switch", "select", "dropdown-menu", "context-menu"].map(
        (name) => `components/ui/${name}.tsx`,
      ),
    );
  for (const path of sources) {
    assert.doesNotMatch(
      read(path),
      /coarse:(?:after:)?(?:min-)?[hw]-11|coarse:size-11|after:size-11|after:min-h-11/,
      `${path} has no touch-only 44px floor`,
    );
  }
});

test("the button scale is distinct, from xs to xl", () => {
  const button = read("components/ui/button.tsx");
  for (const [size, height] of [
    ["xs", "h-6"],
    ["sm", "h-7"],
    ["default", "h-8"],
    ["lg", "h-9"],
    ["xl", "h-11"],
  ])
    assert.match(
      button,
      new RegExp(`\\b${size}:\\s*\\n?\\s*"${height}\\b`),
      `${size} is ${height}`,
    );
  assert.match(button, /"icon-xl": "size-11/);
  assert.match(read("components/ui/toggle.tsx"), /xl: "h-11 min-w-11/);
});

test("shared controls preserve focus, logical sizing and readable fields", () => {
  const css = read("components/catalog.css");
  assert.match(css, /:focus-visible/);
  // Fields read at 16px where a phone would zoom into smaller text, and match the UI (14px) on desktop.
  assert.match(css, /font-size: var\(--fux-control-font-size, 1rem\)/);
  const tokens = read("tokens.css");
  assert.match(tokens, /--fux-control-font-size: var\(--fux-input-font-size\);/);
  assert.match(
    tokens,
    /@media \(min-width: 48rem\) and \(pointer: fine\) \{\s*:root \{\s*--fux-control-font-size: 0\.875rem;/,
  );
  assert.match(css, /\.fux-error[^}]*color: var\(--destructive\)/);
  // Reduced motion is handled where each family's motion lives: the area stylesheets.
  const areas = ["basic", "collections", "color-date", "specialized"].map((name) =>
    read(`components/${name}.css`),
  );
  assert.match(areas.join("\n"), /prefers-reduced-motion/);
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

test("date ranges put each endpoint on its own line on narrow screens", () => {
  assert.match(read("components/color-date.css"), /flex: 1 1 170px/);
});
