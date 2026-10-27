import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir(".demo", { recursive: true });
await build({
  entryPoints: ["examples/smoke/App.tsx"],
  bundle: true,
  format: "esm",
  outdir: ".demo",
  entryNames: "app",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  sourcemap: false,
});
await copyFile("examples/smoke/index.html", ".demo/index.html");
