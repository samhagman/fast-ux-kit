// Optional local browser fixture. Does not launch a browser/server or publish anything.
// Run after docs:build; the next ordinary docs:build removes these extra fixture assets.
import { access, writeFile } from "node:fs/promises";
import { build } from "esbuild";
await access(".docs-site/index.html");
await build({
  entryPoints: ["tests/browser/focus-navigation.tsx"],
  bundle: true,
  format: "esm",
  outfile: ".docs-site/focus-navigation.js",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  legalComments: "linked",
});
await writeFile(
  ".docs-site/focus-navigation.html",
  `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Native outline focus checks</title><link rel="stylesheet" href="./focus-navigation.css">
<style>body{font:16px/1.5 system-ui;margin:0;background:#f6f8f4;color:#223329}main{max-width:760px;margin:auto;padding:24px}label{display:block;margin-block:12px}select{font:inherit;margin-inline:12px;padding:8px}output{display:block;margin-block:12px}.fast-ux-editor{border:1px solid #96a398;padding:8px;margin-block:12px}</style>
</head><body><div id="root"></div><script type="module" src="./focus-navigation.js"></script></body></html>`,
);
console.log(
  "Built local-only focus fixture: /focus-navigation.html. Rebuild ordinary docs before packaging.",
);
