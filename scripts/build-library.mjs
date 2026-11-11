import { cp, mkdir, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
function run(script, args) {
  const result = spawnSync(process.execPath, [join(root, script), ...args], {
    cwd: root,
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await rm(join(root, "dist"), { recursive: true, force: true });
run("node_modules/typescript/bin/tsc", ["-p", "tsconfig.build.json"]);
await mkdir(join(root, "dist"), { recursive: true });
run("node_modules/@tailwindcss/cli/dist/index.mjs", [
  "-i",
  "src/library.css",
  "-o",
  "dist/library.css",
  "--minify",
]);
await cp(join(root, "src/tokens.css"), join(root, "dist/tokens.css"));
// Editorial UI ships its own plain stylesheet, so a static page can use it without the app layer.
await build({
  entryPoints: [join(root, "src/editorial/editorial.css")],
  outfile: join(root, "dist/editorial.css"),
  bundle: true,
  minify: true,
  logLevel: "warning",
});
await cp(
  join(root, "src/machine-graph/layout-worker-entry.js"),
  join(root, "dist/machine-graph/layout-worker-entry.js"),
);
await cp(join(root, "node_modules/katex/dist/fonts"), join(root, "dist/fonts"), {
  recursive: true,
});
