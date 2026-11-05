import assert from "node:assert/strict";
import test from "node:test";
import * as Components from "../src/components/index.js";

test("all manifest parts resolve to supported public exports or compound members", () => {
  assert.equal(Components.componentManifest.length, 86);
  for (const entry of Components.componentManifest) {
    assert.ok(entry.exportName in Components, `${entry.name} has a public export`);
    assert.ok(entry.parts.length > 0, `${entry.name} declares its parts`);
    assert.equal(new Set(entry.parts).size, entry.parts.length, `${entry.name} has unique parts`);
    for (const part of entry.parts) {
      let value: unknown = Components;
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
