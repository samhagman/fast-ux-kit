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
const retired = /react-aria|@ark-ui|@zag-js|@radix-ui|radix-ui|node_modules\/(cmdk|vaul|sonner)\//;
const heavy = /prosemirror|elkjs|@xyflow|katex|react-easy-crop|signature_pad/;

test("a single catalog Button excludes retired owners and heavyweight tools", async () => {
  const result = await bundle(
    'import { Button } from "./src/components/index.tsx"; export { Button };',
  );
  assert.equal(
    result.used.some(
      (name) =>
        retired.test(name) ||
        heavy.test(name) ||
        /src\/(outliner|machine-graph|machine-tree|react|rich)\//.test(name),
    ),
    false,
  );
  assert.ok(result.bytes < 100_000, `Button runtime grew to ${result.bytes} bytes`);
});
test("catalog Button and direct primitive retain the same dependencies", async () => {
  const combined = await bundle(
    'import { Button } from "./src/components/index.tsx"; export { Button };',
  );
  const direct = await bundle(
    'import { Button } from "./src/components/ui/button.tsx"; export { Button };',
  );
  assert.ok(
    Math.abs(combined.bytes - direct.bytes) < 100,
    "Only export identifier minification may differ",
  );
  assert.deepEqual(
    combined.used.filter((name) => name.includes("node_modules")).sort(),
    direct.used.filter((name) => name.includes("node_modules")).sort(),
  );
});
test("a specialized Tour excludes independent capability engines", async () => {
  const result = await bundle(
    'import { Tour } from "./src/components/index.tsx"; export { Tour };',
  );
  assert.equal(
    result.used.some((name) => retired.test(name) || heavy.test(name)),
    false,
  );
  assert.ok(result.used.some((name) => name.includes("@base-ui/react")));
  assert.ok(result.bytes < 180_000, `Tour runtime grew to ${result.bytes} bytes`);
});
test("catalog metadata has no interactive runtime", async () => {
  const result = await bundle(
    'import { componentManifest } from "./src/components/manifest.ts"; export { componentManifest };',
  );
  assert.equal(
    result.used.some((name) => name.includes("node_modules")),
    false,
  );
  assert.ok(result.bytes < 40_000);
});
test("portable core excludes DOM and React runtimes", async () => {
  const result = await bundle('export * from "./src/core/index.ts";');
  assert.equal(
    result.used.some((name) =>
      /node_modules\/(react|react-dom|@base-ui)|src\/(components|react|outliner|machine-graph|machine-tree)\//.test(
        name,
      ),
    ),
    false,
  );
});
