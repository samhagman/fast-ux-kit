import { build } from "esbuild";
import { mkdir, copyFile, rm, readFile, writeFile, readdir } from "node:fs/promises";
// Local-only output. Publishing and access control are separate, explicit steps.
await rm(".docs-site", { recursive: true, force: true });
await mkdir(".docs-site", { recursive: true });
const result = await build({
  entryPoints: ["examples/docs/main.tsx"],
  bundle: true,
  format: "esm",
  outdir: ".docs-site",
  entryNames: "app-[hash]",
  metafile: true,
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: true,
  sourcemap: false,
  legalComments: "linked",
});
const outputs = Object.keys(result.metafile.outputs);
const js = outputs.find((file) => file.endsWith(".js"));
const css = outputs.find((file) => file.endsWith(".css"));
if (!js || !css) throw new Error("Missing documentation assets.");
const html = (await readFile("examples/docs/index.html", "utf8"))
  .replace("./app.js", `./${js.split("/").at(-1)}`)
  .replace("./app.css", `./${css.split("/").at(-1)}`);
await writeFile(".docs-site/index.html", html);
for (const file of ["favicon.svg"]) {
  await copyFile(`examples/docs/${file}`, `.docs-site/${file}`);
}
const packageRoots = new Set();
for (const [input, detail] of Object.entries(result.metafile.outputs[js].inputs)) {
  if (detail.bytesInOutput === 0) continue;
  const match = input.match(/^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//);
  if (match) packageRoots.add(match[1]);
}
const licenses = [];
for (const root of [...packageRoots].sort()) {
  const pkg = JSON.parse(await readFile(`${root}/package.json`, "utf8"));
  const files = (await readdir(root)).filter((file) =>
    /^(licen[sc]e|notice|copying)(\.|$)/i.test(file),
  );
  if (files.length === 0) throw new Error(`Missing bundled package license: ${pkg.name}`);
  const content = [];
  for (const file of files.sort())
    content.push(`${file}\n${await readFile(`${root}/${file}`, "utf8")}`);
  licenses.push(
    `${pkg.name}@${pkg.version} (${pkg.license ?? "see notice"})\n${"=".repeat(72)}\n${content.join("\n\n")}`,
  );
}
await writeFile(".docs-site/THIRD_PARTY_LICENSES.txt", licenses.join("\n\n"));
console.log("Static docs built in .docs-site; not published.");
