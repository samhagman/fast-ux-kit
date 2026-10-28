import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

// The owner's canvas export draws at the image's intrinsic size. jsdom cannot
// verify SVG decoding or canvas pixels; the saved native PNG is the acceptance gate.
test("crop sample has explicit intrinsic dimensions matching its opaque SVG coordinate space", () => {
  const svg = readFileSync(
    new URL("../examples/docs/assets/field-study.svg", import.meta.url),
    "utf8",
  );
  const document = new JSDOM(svg, { contentType: "image/svg+xml" }).window.document;
  const root = document.documentElement;
  const [x, y, width, height] = root.getAttribute("viewBox")!.split(/\s+/).map(Number);
  assert.equal(x, 0);
  assert.equal(y, 0);
  assert.ok(width! > 0 && height! > 0);
  assert.equal(
    root.getAttribute("width"),
    String(width),
    "canvas must not infer an SVG default width",
  );
  assert.equal(
    root.getAttribute("height"),
    String(height),
    "canvas must not infer an SVG default height",
  );
  const background = root.querySelector("rect")!;
  assert.equal(background.getAttribute("width"), String(width));
  assert.equal(background.getAttribute("height"), String(height));
  assert.match(background.getAttribute("fill")!, /^#[0-9a-f]{6}$/i);
  assert.equal(
    root.querySelector("image, foreignObject, script"),
    null,
    "the sample stays self-contained",
  );
  assert.equal(root.querySelectorAll("[href], [xlink\\:href]").length, 0);
});
