import assert from "node:assert/strict";
import test from "node:test";
import { cn } from "../src/lib/utils.js";

test("cn keeps the theme's own text sizes next to colours, and later sizes still win", () => {
  assert.equal(cn("text-ui text-muted-foreground"), "text-ui text-muted-foreground");
  assert.equal(cn("text-2xs text-signal"), "text-2xs text-signal");
  assert.equal(cn("text-sm text-ui"), "text-ui");
  assert.equal(cn("text-ui text-sm"), "text-sm");
});
