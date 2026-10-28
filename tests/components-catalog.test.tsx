import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom, browserErrors } from "./components-dom.js";
const { act, cleanup, render } = await import("@testing-library/react");
const { renderToString } = await import("react-dom/server");
const { ariaComponentManifest } = await import("../src/components/manifest.js");
const { ariaDemos } = await import("../examples/docs/demos/aria-demos.js");
afterEach(async () => {
  await act(async () => {
    cleanup();
    await new Promise<void>((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  });
  assert.deepEqual(browserErrors.splice(0), [], "no uncaught browser errors");
});
test("every styled family has a distinct documented API and runnable example", () => {
  assert.equal(
    new Set(ariaComponentManifest.map((entry) => entry.exportName)).size,
    ariaComponentManifest.length,
  );
  assert.deepEqual(
    Object.keys(ariaDemos).sort(),
    ariaComponentManifest.map((entry) => entry.exportName).sort(),
  );
  for (const entry of ariaComponentManifest) {
    assert.ok(ariaDemos[entry.exportName]?.code.trim());
    assert.ok(entry.description.length > 20);
  }
});
for (const entry of ariaComponentManifest) {
  test(`${entry.name} documented composition renders on server and client`, () => {
    const demo = ariaDemos[entry.exportName]!;
    const html = renderToString(demo.render());
    assert.ok(html.length > 0, "server render emits content");
    const view = render(demo.render());
    assert.ok(
      view.container.querySelector('[class*="fux-"]'),
      "uses actual styled component elements",
    );
    assert.equal(
      view.container.querySelector('[style*="NaN"]'),
      null,
      "no invalid computed geometry",
    );
    assert.equal(
      view.container.querySelector('[style*="undefined"]'),
      null,
      "no missing computed geometry",
    );
  });
}

test("every installed public owner family is explicitly classified without raw-export inflation", async () => {
  const { readdirSync } = await import("node:fs");
  const { componentManifest, ownerFamilyCoverage, ownerEntryPoints } =
    await import("../src/components/manifest.js");
  const familyNames = new Set(componentManifest.map((entry) => entry.name));
  const aria = readdirSync(
    new URL("../node_modules/react-aria-components/dist/types/exports", import.meta.url),
  )
    .filter((name) => name.endsWith(".d.ts") && name !== "index.d.ts")
    .map((name) => name.slice(0, -5));
  const ark = readdirSync(
    new URL("../node_modules/@ark-ui/react/dist/components", import.meta.url),
    { withFileTypes: true },
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  assert.deepEqual(
    ownerFamilyCoverage
      .filter((entry) => entry.owner === "aria")
      .map((entry) => entry.source)
      .sort(),
    aria.sort(),
  );
  assert.deepEqual(
    ownerFamilyCoverage
      .filter((entry) => entry.owner === "ark")
      .map((entry) => entry.source)
      .sort(),
    ark.sort(),
  );
  for (const entry of ownerFamilyCoverage) {
    if (entry.kind !== "utility")
      assert.ok(entry.canonical.length > 0, `${entry.owner}/${entry.source} has a canonical UI`);
    for (const family of entry.canonical)
      assert.ok(familyNames.has(family), `${family} is an implemented family`);
  }
  assert.ok(ownerEntryPoints.every((entry) => entry.styled === false));
});

test("utility catalog references real installed public exports", async () => {
  const { componentUtilities } = await import("../src/components/manifest.js");
  const aria = await import("../src/aria/index.js");
  const ark = await import("../src/ark/index.js");
  for (const utility of componentUtilities) {
    const owner = utility.exportName === "/ark" ? ark : aria;
    for (const name of utility.exports)
      assert.ok(name in owner, `${utility.name}: ${name} is exported`);
  }
});

test("written API inventory includes every canonical family, part and utility group", async () => {
  const { readFileSync } = await import("node:fs");
  const { componentManifest, componentUtilities, ownerFamilyCoverage } =
    await import("../src/components/manifest.js");
  const api = readFileSync(new URL("../docs/COMPONENT_API.md", import.meta.url), "utf8");
  assert.ok(api.includes(`**${componentManifest.length} canonical styled families**`));
  assert.ok(api.includes(`all ${ownerFamilyCoverage.length} public owner module entries`));
  for (const family of componentManifest) {
    const anatomy = api.split("\n").find((line) => line.startsWith(`- **${family.name}:**`));
    if (family.parts.length > 0) assert.ok(anatomy, `${family.name} has a named anatomy entry`);
    for (const part of family.parts)
      assert.ok(anatomy?.includes(`\`${part}\``), `${family.name} documents ${part}`);
    assert.ok(
      api.includes(`\`${family.exportName}\``),
      `${family.name} documents its actual export`,
    );
  }
  for (const utility of componentUtilities)
    assert.ok(
      api.includes(`### ${utility.name}\n`),
      `${utility.name} remains separately documented`,
    );
});
