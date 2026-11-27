// `chrome="none"` on Machine Graph and Machine Tree in a real browser, on the built Studio
// (`npm run docs:build` first): the machine is whole and centred in its box at desktop and phone
// widths, light and dark, left to right and right to left, on a plain ground (no dot grid, no React
// Flow attribution); it refits when the box resizes; the wheel and a drag stay the page's. The graph
// is one named image with no tab stops. The tree is one named group whose only tab stops are its
// fold buttons, and folding a container refits it, still whole and centred.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";

const root = resolve("studio/dist");
const artifacts = resolve(
  process.env.BROWSER_ARTIFACTS ?? ".safe-tmp/machine-presentation-browser",
);
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
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const base = `http://127.0.0.1:${server.address().port}/`;
let browser;
const checks = [];
// A failed check is recorded and the run carries on, so one run reports every failure; it fails at the end.
const failures = [];
const check = (name, condition, detail) => {
  if (condition) checks.push(name);
  else {
    const failure = `${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`;
    failures.push(failure);
    console.error(`FAIL ${failure}`);
  }
};

/** How the picture sits in its box: the gaps on each side, in screen px. */
const placement = (page, box, content) =>
  page.evaluate(
    ([boxSelector, contentSelector]) => {
      const outer = document.querySelector(boxSelector).getBoundingClientRect();
      const parts = [...document.querySelectorAll(contentSelector)]
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width && rect.height);
      const left = Math.min(...parts.map((r) => r.left));
      const right = Math.max(...parts.map((r) => r.right));
      const top = Math.min(...parts.map((r) => r.top));
      const bottom = Math.max(...parts.map((r) => r.bottom));
      return {
        parts: parts.length,
        left: Math.round(left - outer.left),
        right: Math.round(outer.right - right),
        top: Math.round(top - outer.top),
        bottom: Math.round(outer.bottom - bottom),
      };
    },
    [box, content],
  );
const centred = (gaps, margin) =>
  gaps.parts > 0 &&
  Math.min(gaps.left, gaps.right, gaps.top, gaps.bottom) >= margin &&
  Math.abs(gaps.left - gaps.right) <= 2 &&
  Math.abs(gaps.top - gaps.bottom) <= 2;

/** Waits until the selector's box and transform stop changing (layout passes, the reveal fade). */
async function settled(page, selector) {
  let last = "";
  for (let i = 0; i < 40; i++) {
    const now = await page.evaluate((s) => {
      const element = document.querySelector(s);
      return element
        ? JSON.stringify([
            element.getBoundingClientRect(),
            element.style.transform,
            getComputedStyle(element).opacity,
          ])
        : "";
    }, selector);
    if (now && now === last) return;
    last = now;
    await page.waitForTimeout(150);
  }
}

/** Wheels and drags over the picture: neither is prevented, and the picture does not move. */
async function staysStill(page, picture, moving) {
  const centre = await page.locator(picture).evaluate((element) => {
    const r = element.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  const before = await page.locator(moving).evaluate((element) => element.getAttribute("style"));
  await page.evaluate(() => {
    window.__wheels = [];
    window.addEventListener("wheel", (event) => window.__wheels.push(event.defaultPrevented), {
      passive: true,
    });
  });
  await page.mouse.move(centre.x, centre.y);
  await page.mouse.wheel(0, 240);
  await page.mouse.down();
  await page.mouse.move(centre.x + 80, centre.y + 40, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  const after = await page.locator(moving).evaluate((element) => element.getAttribute("style"));
  const wheels = await page.evaluate(() => window.__wheels);
  return { moved: before !== after, wheels };
}

/**
 * Tabs from the page's own Presentation button, twelve times: what focus lands on inside the
 * picture, as "tag name" (a fold button reads "button Fold Preparing").
 */
async function tabStops(page, picture) {
  await page.getByRole("button", { name: "Presentation" }).focus();
  const inside = [];
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate((s) => {
      const active = document.activeElement;
      if (!active || !document.querySelector(s).contains(active)) return null;
      return `${active.tagName.toLowerCase()} ${active.getAttribute("aria-label") ?? ""}`.trim();
    }, picture);
    if (stop) inside.push(stop);
  }
  return inside;
}

/** The ground behind the machine: no background image, and the same colour as the surface token. */
const ground = (page, selector) =>
  page.evaluate((s) => {
    const element = document.querySelector(s);
    const probe = document.createElement("div");
    probe.style.background = "var(--surface)";
    element.appendChild(probe);
    const surface = getComputedStyle(probe).backgroundColor;
    probe.remove();
    const style = getComputedStyle(element);
    return { image: style.backgroundImage, color: style.backgroundColor, surface };
  }, selector);

try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [];
  for (const dir of ["ltr", "rtl"])
    for (const scheme of ["light", "dark"])
      for (const width of [1280, 375]) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          colorScheme: scheme,
          reducedMotion: "reduce",
        });
        page.on("pageerror", (error) => errors.push(error.message));
        await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
        const at = `${width}px ${scheme} ${dir}`;
        const query = `?chrome=none${dir === "rtl" ? "&dir=rtl" : ""}`;

        /* ── Machine Graph ── */
        const graph = '[data-slot="machine-graph"][data-chrome="none"]';
        await page.goto(`${base}${query}#/machine-graph`);
        await page.locator(`${graph} .react-flow__node`).first().waitFor();
        await settled(page, `${graph} .react-flow__viewport`);
        const graphChrome = await page.evaluate(
          (g) =>
            [
              "[data-mv-toolbar]",
              "[data-mv-statusbar]",
              "aside[aria-label=Inspector]",
              ".react-flow__minimap",
              "[data-mv-occluder]",
              "[data-mv-overflow]",
              "[data-slot=machine-peek]",
              "[data-slot=machine-sheet-host]",
            ].filter((s) => document.querySelector(g).querySelector(s)),
          graph,
        );
        check(`${at}: graph shows only the machine`, graphChrome.length === 0, graphChrome);
        const graphMarks = await page.evaluate(
          (g) => ({
            attribution: document.querySelectorAll(`${g} .react-flow__attribution`).length,
            pattern: document.querySelectorAll(`${g} .react-flow__background, ${g} pattern`).length,
          }),
          graph,
        );
        check(
          `${at}: graph has no React Flow attribution`,
          graphMarks.attribution === 0,
          graphMarks,
        );
        check(`${at}: graph has no dot grid`, graphMarks.pattern === 0, graphMarks);
        const graphGround = await ground(page, `${graph} .react-flow`);
        check(
          `${at}: graph sits on the plain surface`,
          graphGround.image === "none" && graphGround.color === graphGround.surface,
          graphGround,
        );
        const graphGaps = await placement(page, graph, `${graph} .react-flow__node`);
        check(`${at}: graph is whole and centred in its box`, centred(graphGaps, 16), graphGaps);
        const graphName = await page
          .getByRole("img", { name: "Release approval statechart" })
          .count();
        check(`${at}: graph is one image named "Release approval statechart"`, graphName === 1);
        const graphText = await page
          .locator(graph)
          .evaluate(
            (element) =>
              document.getElementById(element.getAttribute("aria-describedby"))?.textContent,
          );
        check(
          `${at}: graph is described in words`,
          /states: Draft, Review/.test(graphText ?? "") &&
            / from Draft to Review/.test(graphText ?? ""),
          graphText,
        );
        const graphStops = await tabStops(page, graph);
        check(`${at}: graph has no tab stops`, graphStops.length === 0, graphStops);
        const graphStill = await staysStill(page, graph, `${graph} .react-flow__viewport`);
        check(
          `${at}: graph lets the wheel and a drag through, and does not move`,
          !graphStill.moved && graphStill.wheels.length > 0 && graphStill.wheels.every((p) => !p),
          graphStill,
        );
        await page
          .locator(graph)
          .screenshot({ path: resolve(artifacts, `graph-${width}-${scheme}-${dir}.png`) });
        // The box resizes (the window does): the machine is refitted, still whole and centred.
        await page.setViewportSize({ width: width === 1280 ? 900 : 340, height: 700 });
        await page.waitForTimeout(300);
        await settled(page, `${graph} .react-flow__viewport`);
        const resized = await placement(page, graph, `${graph} .react-flow__node`);
        check(`${at}: graph refits when its box resizes`, centred(resized, 16), resized);
        await page.setViewportSize({ width, height: 900 });

        /* ── Machine Tree ── */
        const tree = '[data-slot="machine-tree"][data-chrome="none"]';
        await page.goto(`${base}${query}#/machine-tree`);
        await page.locator(`${tree} [data-mt-fit]`).waitFor();
        await settled(page, `${tree} [data-mt-fit]`);
        const treeChrome = await page.evaluate(
          (t) =>
            ["[data-mt-toolbar]", "[data-slot=machine-sheet-host]", "[role=tree]"].filter((s) =>
              document.querySelector(t).querySelector(s),
            ),
          tree,
        );
        check(`${at}: tree shows only the machine`, treeChrome.length === 0, treeChrome);
        const canvas = `${tree} [data-mt-canvas]`;
        // Measured against the tree's own box, which clips: a canvas taller than the box would hide
        // the bottom of a picture that is "centred" in the canvas.
        const treeGaps = await placement(page, tree, `${tree} [data-mt-fit]`);
        check(`${at}: tree is whole and centred in its box`, centred(treeGaps, 0), treeGaps);
        const scale = await page
          .locator(`${tree} [data-mt-fit]`)
          .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
        check(`${at}: tree is never enlarged`, scale > 0 && scale <= 1, scale);
        const treeName = await page
          .getByRole("group", { name: "Parallel launch readiness state hierarchy" })
          .count();
        const treeImage = await page.getByRole("img", { name: /state hierarchy$/ }).count();
        check(
          `${at}: tree is one group named "Parallel launch readiness state hierarchy", not an image`,
          treeName === 1 && treeImage === 0,
          { treeName, treeImage },
        );
        const treeText = await page
          .locator(tree)
          .evaluate(
            (element) =>
              document.getElementById(element.getAttribute("aria-describedby"))?.textContent,
          );
        check(
          `${at}: tree is described in words`,
          /states: Preparing, Connection/.test(treeText ?? ""),
          treeText,
        );
        const treeGround = await ground(page, canvas);
        check(
          `${at}: tree sits on the plain surface, no dot grid`,
          treeGround.image === "none" && treeGround.color === treeGround.surface,
          treeGround,
        );
        const treeStops = await tabStops(page, tree);
        check(
          `${at}: Tab reaches only the tree's fold buttons, each once`,
          treeStops.length > 0 &&
            treeStops.every((stop) => /^button (Fold|Unfold) \S/.test(stop)) &&
            new Set(treeStops).size === treeStops.length,
          treeStops,
        );
        const treeStill = await staysStill(page, canvas, `${tree} [data-mt-fit]`);
        const scrolled = await page.locator(canvas).evaluate((element) => element.scrollTop);
        check(
          `${at}: tree lets the wheel and a drag through, and does not scroll or move`,
          !treeStill.moved && scrolled === 0 && treeStill.wheels.every((p) => !p),
          { ...treeStill, scrolled },
        );
        await page
          .locator(tree)
          .screenshot({ path: resolve(artifacts, `tree-${width}-${scheme}-${dir}.png`) });
        await page.setViewportSize({ width: width === 1280 ? 900 : 340, height: 700 });
        await page.waitForTimeout(300);
        await settled(page, `${tree} [data-mt-fit]`);
        const treeResized = await placement(page, tree, `${tree} [data-mt-fit]`);
        check(`${at}: tree refits when its box resizes`, centred(treeResized, 0), treeResized);
        await page.setViewportSize({ width, height: 900 });
        await page.waitForTimeout(300);
        await settled(page, `${tree} [data-mt-fit]`);

        // Fold a container with a click: the outline changes, and is refitted whole and centred.
        const size = () =>
          page
            .locator(`${tree} [data-mt-fit]`)
            .evaluate((element) => [element.offsetWidth, element.offsetHeight].join("x"));
        const before = await size();
        const foldPreparing = page.getByRole("button", { name: "Fold Preparing" });
        check(
          `${at}: tree's Preparing has a fold button, expanded`,
          (await foldPreparing.getAttribute("aria-expanded")) === "true",
        );
        await foldPreparing.click();
        await settled(page, `${tree} [data-mt-fit]`);
        const unfold = page.getByRole("button", { name: "Unfold Preparing" });
        const folded = {
          expanded: await unfold.getAttribute("aria-expanded"),
          before,
          after: await size(),
          inside: await page
            .locator(`${tree} [data-mt-fit]`)
            .evaluate((element) => element.textContent.includes("Loading settings")),
        };
        check(
          `${at}: a click folds Preparing: "Unfold Preparing", collapsed, its inside hidden`,
          folded.expanded === "false" && folded.before !== folded.after && !folded.inside,
          folded,
        );
        const foldedGaps = await placement(page, tree, `${tree} [data-mt-fit]`);
        const foldedScale = await page
          .locator(`${tree} [data-mt-fit]`)
          .evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
        check(
          `${at}: folded, the tree is refitted whole and centred, never enlarged`,
          centred(foldedGaps, 0) && foldedScale > 0 && foldedScale <= 1,
          { ...foldedGaps, scale: foldedScale },
        );
        const scrolledFolded = await page.locator(canvas).evaluate((element) => element.scrollTop);
        check(`${at}: folding scrolls nothing`, scrolledFolded === 0, scrolledFolded);
        await page
          .locator(tree)
          .screenshot({ path: resolve(artifacts, `tree-folded-${width}-${scheme}-${dir}.png`) });
        // And with the keyboard: Enter on the focused button unfolds it again.
        await unfold.focus();
        await page.keyboard.press("Enter");
        await settled(page, `${tree} [data-mt-fit]`);
        const reopened = page.getByRole("button", { name: "Fold Preparing" });
        check(
          `${at}: Enter on "Unfold Preparing" opens it again, refitted`,
          (await reopened.getAttribute("aria-expanded")) === "true" &&
            (await size()) === before &&
            centred(await placement(page, tree, `${tree} [data-mt-fit]`), 0),
        );
        await page.close();
      }

  // Control: the full view does capture the wheel (it zooms), so the checks above are not vacuous.
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    reducedMotion: "reduce",
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${base}#/machine-graph`);
  const full = '[data-slot="machine-graph"]:not([data-chrome])';
  await page.locator(`${full} .react-flow__node`).first().waitFor();
  await settled(page, `${full} .react-flow__viewport`);
  const fullWheel = await staysStill(
    page,
    `${full} [data-mv-column]`,
    `${full} .react-flow__viewport`,
  );
  check(
    // Captured: the wheel never reaches the page (React Flow stops it), or arrives prevented.
    "control: the full view captures the wheel and moves",
    fullWheel.moved && (fullWheel.wheels.length === 0 || fullWheel.wheels.some((p) => p)),
    fullWheel,
  );
  const peek = await page.locator(`${full} [data-mv-toolbar]`).count();
  check("control: the full view has its toolbar", peek === 1);
  const fullMarks = await page.evaluate(
    (g) => ({
      attribution: document.querySelectorAll(`${g} .react-flow__attribution`).length,
      grid: document.querySelectorAll(`${g} .react-flow__background`).length,
    }),
    full,
  );
  check(
    "control: the full graph keeps React Flow's attribution and its dot grid",
    fullMarks.attribution === 1 && fullMarks.grid === 1,
    fullMarks,
  );
  await page
    .locator(full)
    .screenshot({ path: resolve(artifacts, "control-graph-full-1280-light.png") });
  await page.setViewportSize({ width: 375, height: 812 });
  await page.waitForTimeout(400);
  check(
    "control: the full view at 375px is the phone shell (peek bar)",
    (await page.locator(`${full} [data-slot=machine-peek]`).count()) === 1,
  );
  // Control: the full tree keeps its dot grid and its navigable tree.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}#/machine-tree`);
  const fullTree = '[data-slot="machine-tree"]:not([data-chrome])';
  await page.locator(`${fullTree} [role=tree]`).waitFor();
  const fullTreeGround = await ground(page, `${fullTree} [data-mt-canvas]`);
  check(
    "control: the full tree keeps its dot grid",
    fullTreeGround.image.includes("radial-gradient"),
    fullTreeGround,
  );
  await page.close();

  check("No browser page errors", errors.length === 0, errors);
  await writeFile(
    resolve(artifacts, "results.json"),
    JSON.stringify({ checks, failures, browser: await browser.version() }, null, 2),
  );
  console.log(
    JSON.stringify({ checks: checks.length, failures: failures.length, artifacts }, null, 2),
  );
  assert.deepEqual(failures, [], `${failures.length} check(s) failed`);
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
