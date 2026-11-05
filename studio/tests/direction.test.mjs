import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Portalled overlays render under <body>, outside a component's `dir`. Each shadcn primitive that
// portals must stamp the enclosing DirectionScope's direction (and nothing outside a scope), or an
// RTL outliner / machine view opens LTR dialogs, popovers, sheets and tooltips.
const PORTALLED = ["dialog", "popover", "drawer", "tooltip"];

for (const name of PORTALLED) {
  test(`${name}: portalled content stamps the scoped direction`, () => {
    const source = readFileSync(
      new URL(`../../src/components/ui/${name}.tsx`, import.meta.url),
      "utf8",
    );
    assert.match(source, /import \{ useScopedDirection \} from ".*\/direction\.js"/);
    assert.match(source, /const dir = useScopedDirection\(\)/);
    assert.match(source, /dir=\{dir\}/);
  });
}

test("useScopedDirection is undefined outside a DirectionScope (inherit the page's dir)", () => {
  const source = readFileSync(new URL("../../src/lib/direction.tsx", import.meta.url), "utf8");
  assert.match(source, /createContext<Dir \| undefined>\(undefined\)/);
});
