import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../examples/docs/docs.css", import.meta.url), "utf8");
function colors(source: string) {
  return Object.fromEntries(
    [...source.matchAll(/(--[\w-]+):\s*(#[\da-f]{3,6})\s*;/gi)].map((match) => [
      match[1]!,
      match[2]!,
    ]),
  );
}
function luminance(hex: string) {
  let value = hex.replace("#", "");
  if (value.length === 3) value = [...value].map((channel) => channel + channel).join("");
  const channels = [0, 2, 4]
    .map((offset) => parseInt(value.slice(offset, offset + 2), 16) / 255)
    .map((channel) => (channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
function contrast(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (values[1]! + 0.05) / (values[0]! + 0.05);
}
for (const theme of ["light", "dark"])
  test(`documentation ${theme} palette has contrast in its explicit text/focus role pairs`, () => {
    const block = css.match(new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`))?.[1];
    assert.ok(block);
    const values = colors(block);
    for (const [foreground, background] of [
      ["--ink", "--page"],
      ["--subtle", "--page"],
      ["--fux-text", "--fux-surface"],
      ["--fux-muted", "--fux-surface"],
      ["--fux-on-accent", "--fux-accent"],
      ["--fux-on-danger", "--fux-danger"],
      ["--code-text", "--code"],
    ]) {
      const ratio = contrast(values[foreground!]!, values[background!]!);
      assert.ok(ratio >= 4.5, `${theme} ${foreground}/${background}: ${ratio.toFixed(2)}:1`);
    }
    assert.ok(contrast(values["--fux-focus"]!, values["--fux-surface"]!) >= 3);
  });
test("dark code copy controls own their hover surface even in the light page theme", () => {
  const block = css.match(/\.code-toolbar \.fux-control\s*\{([^}]+)\}/)?.[1];
  assert.ok(block);
  const values = colors(block);
  assert.ok(
    values["--fux-surface-hover"],
    "do not inherit the pale page hover surface behind pale code-toolbar text",
  );
  assert.ok(contrast(values["--fux-quiet-text"]!, values["--fux-surface-hover"]!) >= 4.5);
});
test("source import text keeps a readable input font rather than an iOS-zoom-sized code font", () => {
  const block = [...css.matchAll(/\.docs-field textarea\s*\{([^}]+)\}/g)].at(-1)?.[1];
  assert.match(block ?? "", /16px\/1\.6/);
});
test("navigation search owns its target size, not just its decorative wrapper", () => {
  const block = css.match(/\.nav-search input\s*\{([^}]+)\}/)?.[1];
  assert.match(block ?? "", /min-block-size:\s*44px/);
});
test("calendar grids contain narrow overflow without clipping the entire demonstration", () => {
  const components = readFileSync(new URL("../src/components.css", import.meta.url), "utf8");
  const months = components.match(/\.fux-calendar__months\s*\{([^}]+)\}/)?.[1];
  assert.match(months ?? "", /overflow-x:\s*auto/);
  assert.match(months ?? "", /max-inline-size:\s*100%/);
  const cell = components.match(/\.fux-calendar__cell\s*\{([^}]+)\}/)?.[1];
  assert.match(cell ?? "", /inline-size:\s*max\(44px,/);
  for (const frame of css.matchAll(/\.demo-(?:frame|stage)\s*\{([^}]+)\}/g)) {
    assert.doesNotMatch(frame[1]!, /overflow(?:-x)?:\s*(hidden|auto|scroll)/);
  }
});
