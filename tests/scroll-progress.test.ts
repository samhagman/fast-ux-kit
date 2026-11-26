import assert from "node:assert/strict";
import test from "node:test";
import { scrollProgress } from "../src/core/scroll-progress.js";

const evenly = [0, 300, 600];

test("scroll progress is a whole stop index at each stop", () => {
  assert.equal(scrollProgress(evenly, 0), 0);
  assert.equal(scrollProgress(evenly, 300), 1);
  assert.equal(scrollProgress(evenly, 600), 2);
});

test("scroll progress interpolates between neighbouring stops", () => {
  assert.equal(scrollProgress(evenly, 150), 0.5);
  assert.equal(scrollProgress(evenly, 75), 0.25);
  assert.equal(scrollProgress(evenly, 450), 1.5);
  // Uneven stops interpolate within their own span.
  assert.equal(scrollProgress([0, 100, 400], 250), 1.5);
});

test("scroll progress clamps before the first and past the last stop", () => {
  assert.equal(scrollProgress(evenly, -40), 0);
  assert.equal(scrollProgress(evenly, 900), 2);
});

test("scroll progress settles sub-pixel layout on the nearest stop", () => {
  assert.equal(scrollProgress(evenly, 299.5), 1);
  assert.equal(scrollProgress(evenly, 600.4), 2);
  assert.equal(scrollProgress([0, 299.6, 599.2], 599), 2);
  // A wider tolerance is the caller's choice; none keeps the raw fraction.
  assert.ok(scrollProgress(evenly, 299.5, 0) < 1);
});

test("scroll progress has no motion with fewer than two stops or a zero span", () => {
  assert.equal(scrollProgress([], 120), 0);
  assert.equal(scrollProgress([0], 120), 0);
  assert.equal(scrollProgress([0, 0, 300], 150), 1.5);
});
