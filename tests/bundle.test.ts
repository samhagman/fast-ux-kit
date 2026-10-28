import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function bundle(source: string) {
  const result = await build({
    stdin: { contents: source, resolveDir: process.cwd(), loader: "tsx" },
    bundle: true,
    format: "esm",
    write: false,
    metafile: true,
    minify: true,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const used = Object.entries(Object.values(result.metafile!.outputs)[0]!.inputs)
    .filter(([, detail]) => detail.bytesInOutput > 0)
    .map(([name]) => name);
  return { bytes: result.outputFiles![0]!.contents.length, used };
}
test("a single combined-entry Button does not ship optional owners or the outliner", async () => {
  const result = await bundle(
    'import { Button } from "./src/components/index.tsx"; export { Button };',
  );
  assert.equal(
    result.used.some((name) => /@ark-ui|@zag-js|src\/react|src\/rich/.test(name)),
    false,
  );
  assert.ok(
    result.bytes < 100_000,
    `Button plus React owner runtime grew to ${result.bytes} bytes`,
  );
});
test("the Aria-only and combined entries tree-shake a Button to the same runtime", async () => {
  const combined = await bundle(
    'import { Button } from "./src/components/index.tsx"; export { Button };',
  );
  const aria = await bundle(
    'import { Button } from "./src/components/aria.tsx"; export { Button };',
  );
  assert.equal(combined.bytes, aria.bytes);
  assert.deepEqual(
    combined.used.filter((name) => name.includes("node_modules")).sort(),
    aria.used.filter((name) => name.includes("node_modules")).sort(),
  );
});
test("a specialized family does not retain every other family or a second owner", async () => {
  const result = await bundle(
    'import { Tour, useTour } from "./src/components/index.tsx"; export { Tour, useTour };',
  );
  assert.equal(
    result.used.some((name) =>
      /react-aria-components|@zag-js\/(image-cropper|signature-pad|carousel|date-picker|password-input)/.test(
        name,
      ),
    ),
    false,
  );
  assert.ok(result.used.some((name) => name.includes("@zag-js/tour")));
  assert.ok(result.bytes < 200_000, `Tour runtime grew to ${result.bytes} bytes`);
});
test("catalog metadata has no interactive-owner runtime", async () => {
  const result = await bundle(
    'import { componentManifest } from "./src/components/manifest.ts"; export { componentManifest };',
  );
  assert.equal(
    result.used.some((name) => name.includes("node_modules")),
    false,
  );
  assert.ok(result.bytes < 40_000);
});
