import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";

const root = resolve("studio/dist");
const artifacts = resolve(process.env.BROWSER_ARTIFACTS ?? ".safe-tmp/note-page-browser");
await mkdir(artifacts, { recursive: true });
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, "http://localhost").pathname;
    const file = resolve(
      root,
      `.${decodeURIComponent(pathname === "/" ? "/index.html" : pathname)}`,
    );
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    const bytes = await readFile(file);
    response
      .writeHead(200, { "Content-Type": types[extname(file)] ?? "application/octet-stream" })
      .end(bytes);
  } catch {
    response.writeHead(404).end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const checks = [];
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    reducedMotion: "reduce",
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/?pages=1#/outliner`);
  await page.getByRole("heading", { name: "One notebook. Any page type." }).waitFor();
  await page.getByText("A notebook, many kinds of pages", { exact: true }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "outline-desktop.png"), fullPage: true });
  checks.push("Existing Outliner renders inside the extension page host");
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await page.getByRole("img", { name: "Sketch with 3 dots" }).waitFor();
  await page.getByRole("button", { name: "Add a dot" }).click();
  await page.getByRole("img", { name: "Sketch with 4 dots" }).waitFor();
  await page.getByRole("button", { name: "Ideas", exact: true }).click();
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await page.getByRole("img", { name: "Sketch with 4 dots" }).waitFor();
  checks.push("A custom editor emits changes and retains its page data across navigation");
  await page.getByRole("button", { name: "Read-only off", exact: true }).click();
  assert.equal(await page.getByRole("button", { name: "Add a dot" }).isDisabled(), true);
  await page.screenshot({ path: resolve(artifacts, "sketch-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "Read-only on", exact: true }).click();
  await page.getByRole("button", { name: "Add a dot" }).focus();
  await page.keyboard.press("Enter");
  await page.getByRole("img", { name: "Sketch with 5 dots" }).waitFor();
  checks.push("Read-only blocks edits and keyboard activation works after enabling editing");
  await page.getByRole("button", { name: "Missing editor", exact: true }).click();
  await page
    .getByText("The example.uninstalled editor is not installed. Your data is preserved.")
    .waitFor();
  assert.equal(await page.getByRole("button", { name: "Add a dot" }).count(), 0);
  await page.screenshot({ path: resolve(artifacts, "missing-editor.png"), fullPage: true });
  checks.push("Unknown type displays a non-destructive fallback, with no editor controls");
  await page.getByRole("button", { name: "Sketch", exact: true }).click();
  await page.getByRole("button", { name: "dark theme", exact: true }).click();
  await page.screenshot({ path: resolve(artifacts, "sketch-dark.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Switch to light theme", exact: true }).click();
  assert.equal(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    true,
  );
  await page.getByRole("button", { name: "Add a dot" }).click();
  await page.getByRole("img", { name: "Sketch with 6 dots" }).waitFor();
  await page.screenshot({ path: resolve(artifacts, "sketch-narrow.png"), fullPage: true });
  checks.push(
    "Dark theme and 390px narrow layout render; narrow layout has no document overflow and remains interactive",
  );
  assert.deepEqual(errors, []);
  checks.push("No browser page errors");
  await writeFile(
    resolve(artifacts, "results.json"),
    JSON.stringify(
      {
        checks,
        browser: await browser.version(),
        viewports: ["1280x900", "390x844"],
        limitations: [
          "Viewport emulation, not physical mobile or assistive-technology testing",
          "In-memory synthetic demo, not application persistence or Excalidraw integration",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ checks, artifacts }, null, 2));
} finally {
  await browser?.close();
  await new Promise((resolve) => server.close(resolve));
}
