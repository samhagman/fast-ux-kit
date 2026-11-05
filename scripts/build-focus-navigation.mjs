import { mkdir, copyFile, cp, writeFile } from "node:fs/promises";
import { build } from "esbuild";

await mkdir(".demo", { recursive: true });
await build({
  entryPoints: ["tests/browser/focus-navigation.tsx"],
  bundle: true,
  format: "esm",
  outfile: ".demo/focus-navigation.js",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  legalComments: "linked",
});
await copyFile("dist/library.css", ".demo/library.css");
await cp("dist/fonts", ".demo/fonts", { recursive: true });
await writeFile(
  ".demo/index.html",
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Outline focus checks</title><link rel="stylesheet" href="./library.css">
<style>body{font:16px/1.5 system-ui;margin:0}main{max-width:760px;margin:auto;padding:24px}label{display:block;margin-block:12px}select{font:inherit;margin-inline:12px;padding:8px}output{display:block;margin-block:12px}.fast-ux-editor{border:1px solid var(--border);padding:8px;margin-block:12px}</style>
</head><body><div id="root"></div><script type="module" src="./focus-navigation.js"></script></body></html>`,
);
console.log("Built focus-navigation fixture in .demo after the library build.");
