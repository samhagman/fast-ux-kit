// Frame, the kit boundary and ThemeScope in a real browser, on the built Studio gallery
// (`npm run docs:build` first). The cascade is what these promise, and only a browser computes it.
import { chromium } from "playwright-core";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import assert from "node:assert/strict";

const root = resolve("studio/dist");
const artifacts = resolve(process.env.BROWSER_ARTIFACTS ?? ".safe-tmp/surfaces-browser");
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
const check = (name, condition, detail) => {
  assert.ok(condition, `${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  checks.push(name);
};
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const errors = [];
  for (const scheme of ["light", "dark"])
    for (const width of [1280, 375]) {
      const page = await browser.newPage({
        viewport: { width, height: 900 },
        colorScheme: scheme,
        reducedMotion: "reduce",
      });
      page.on("pageerror", (error) => errors.push(error.message));
      // The Studio's theme follows the system until a person picks one.
      await page.addInitScript((theme) => localStorage.setItem("theme", theme), scheme);
      const at = `${width}px ${scheme}`;

      await page.goto(`${base}?Frame#/components/Frame`);
      const frame = page.locator('article[id="family-Frame"] .fux-frame').first();
      await frame.waitFor();
      const bar = await frame.evaluate((element) => {
        const bar = element.querySelector(".fux-frame-bar");
        return {
          hidden: bar.getAttribute("aria-hidden"),
          address: bar.querySelector(".fux-frame-address").textContent,
          dir: bar.querySelector(".fux-frame-address").getAttribute("dir"),
          group: element.getAttribute("role") + ":" + element.getAttribute("aria-label"),
        };
      });
      check(
        `${at}: the browser bar is decoration and shows the address`,
        bar.hidden === "true" && bar.address === "example.test/t/7Hq2" && bar.dir === "ltr",
        bar,
      );
      check(
        `${at}: the frame is a labelled group`,
        bar.group === "group:Task page, in a browser",
        bar,
      );
      await page
        .getByRole("group", { name: "Task page, in a browser" })
        .getByRole("button", { name: "Send answer" })
        .click();
      await page.getByText("Sent", { exact: true }).waitFor();
      check(`${at}: the content inside keeps its semantics and works`, true);
      check(
        `${at}: no frame reaches past the viewport`,
        await page.evaluate(() =>
          [...document.querySelectorAll('article[id="family-Frame"] .fux-frame')].every(
            (element) => element.getBoundingClientRect().right <= window.innerWidth,
          ),
        ),
      );
      const narrow = await frame.evaluate((element) => {
        const dots = element.querySelector(".fux-frame-dots");
        const wide = getComputedStyle(dots).display;
        element.style.inlineSize = "200px";
        const thin = getComputedStyle(dots).display;
        element.style.inlineSize = "";
        return { wide, thin };
      });
      check(
        `${at}: a narrow frame drops the dots, by its own width`,
        narrow.wide === "flex" && narrow.thin === "none",
        narrow,
      );

      // Kit boundary: the same custom markup in an article, without and with data-kit-boundary.
      const leak = await page.evaluate(() => {
        const pick = (label) => {
          const frame = document.querySelector(`[aria-label="${label}"]`);
          const link = frame.querySelector("a");
          const heading = frame.querySelector("h3");
          const article = frame.closest(".fux-article");
          return {
            link: getComputedStyle(link).color,
            ink: getComputedStyle(article).color,
            onPrimary: getComputedStyle(link).getPropertyValue("--primary-foreground"),
            decoration: getComputedStyle(link).textDecorationLine,
            headingMargin: getComputedStyle(heading).marginBlockStart,
          };
        };
        const probe = document.createElement("span");
        document.body.append(probe);
        const resolveColor = (value) => {
          probe.style.color = value;
          const out = getComputedStyle(probe).color;
          probe.style.color = "";
          return out;
        };
        const open = pick("Chat message, unbounded");
        const bounded = pick("Chat message, bounded");
        bounded.onPrimary = resolveColor(bounded.onPrimary);
        probe.remove();
        return { open, bounded };
      });
      check(
        `${at}: without a boundary the article's link reset reaches in (the old bug)`,
        leak.open.link === leak.open.ink && leak.open.headingMargin === "0px",
        leak.open,
      );
      check(
        `${at}: inside a boundary custom markup keeps its own link colour and margins`,
        leak.bounded.link === leak.bounded.onPrimary &&
          leak.bounded.link !== leak.bounded.ink &&
          leak.bounded.headingMargin === "12px",
        leak.bounded,
      );
      await page.screenshot({
        path: resolve(artifacts, `frame-${width}-${scheme}.png`),
        fullPage: false,
      });
      await frame.scrollIntoViewIfNeeded();
      await page
        .locator('article[id="family-Frame"]')
        .screenshot({ path: resolve(artifacts, `frame-card-${width}-${scheme}.png`) });

      // ThemeScope
      await page.goto(`${base}?ThemeScope#/components/ThemeScope`);
      const scope = page.locator('article[id="family-ThemeScope"] .fux-theme-scope').first();
      await scope.waitFor();
      const themed = await scope.evaluate((element) => {
        const probe = document.createElement("span");
        element.append(probe);
        const resolveColor = (value) => {
          probe.style.color = value;
          const out = getComputedStyle(probe).color;
          probe.style.color = "";
          return out;
        };
        const style = getComputedStyle(element);
        const radio = element.querySelector('[role="radio"][data-checked]');
        const button = element.querySelector('button[data-slot="button"]');
        const out = {
          fg: style.getPropertyValue("--foreground"),
          color: style.color,
          wantFg: resolveColor("oklch(0.26 0.03 160)"),
          background: style.backgroundColor,
          wantBg: resolveColor("oklch(0.985 0.012 95)"),
          radio: getComputedStyle(radio).backgroundColor,
          selection: resolveColor("oklch(0.55 0.15 45)"),
          button: getComputedStyle(button).backgroundColor,
          primary: resolveColor("oklch(0.36 0.07 160)"),
          radius: getComputedStyle(button).borderTopLeftRadius,
          font: style.fontFamily,
          heading: getComputedStyle(element.querySelector("h3")).fontFamily,
          edInk: resolveColor(style.getPropertyValue("--fux-ed-ink")),
        };
        probe.remove();
        return out;
      });
      check(
        `${at}: fg and bg reach the scope's text and ground`,
        themed.color === themed.wantFg && themed.background === themed.wantBg,
        themed,
      );
      check(
        `${at}: tokens the kit derives at :root follow the scope`,
        themed.edInk === themed.wantFg,
        themed,
      );
      check(
        `${at}: a selected radio takes the selection colour, apart from primary`,
        themed.radio === themed.selection &&
          themed.button === themed.primary &&
          themed.radio !== themed.button,
        themed,
      );
      check(
        `${at}: radius and both faces reach the scope`,
        themed.radius === "2px" &&
          /^Georgia/.test(themed.font) &&
          /^"Iowan Old Style"/.test(themed.heading),
        themed,
      );
      // Inputs that are var() of the very token they feed resolve to the surrounding value.
      const cycle = await page.evaluate(() => {
        const scope = [
          ...document.querySelectorAll('article[id="family-ThemeScope"] .fux-theme-scope'),
        ].find((element) => element.textContent.includes("Inputs can be var()"));
        const outer = scope.parentElement.parentElement;
        const inside = getComputedStyle(scope);
        const around = getComputedStyle(outer);
        const field = scope.querySelector("input");
        return {
          fg: inside.getPropertyValue("--foreground").trim(),
          aroundFg: around.getPropertyValue("--foreground").trim(),
          bg: inside.backgroundColor,
          aroundMuted: (() => {
            const probe = document.createElement("span");
            outer.append(probe);
            probe.style.color = "var(--muted)";
            const out = getComputedStyle(probe).color;
            probe.remove();
            return out;
          })(),
          radius: inside.getPropertyValue("--radius").trim(),
          aroundRadius: around.getPropertyValue("--radius").trim(),
          fieldRadius: getComputedStyle(field).borderTopLeftRadius,
        };
      });
      check(
        `${at}: fg: var(--foreground) is the surrounding foreground, not a cycle`,
        cycle.fg !== "" && cycle.fg === cycle.aroundFg,
        cycle,
      );
      check(
        `${at}: bg: var(--muted) paints the surrounding muted`,
        cycle.bg === cycle.aroundMuted,
        cycle,
      );
      check(
        `${at}: radius: calc(var(--radius) * 2) doubles the surrounding radius`,
        cycle.radius !== "" && cycle.fieldRadius !== "0px",
        cycle,
      );
      const toggle = await page.evaluate(() => {
        const scope = [
          ...document.querySelectorAll('article[id="family-ThemeScope"] .fux-theme-scope'),
        ].find((element) => element.textContent.includes("Primary stays primary"));
        const probe = document.createElement("span");
        scope.append(probe);
        probe.style.color = "var(--signal)";
        const signal = getComputedStyle(probe).color;
        probe.remove();
        const pressed = scope.querySelector('[data-slot="toggle-group-item"][data-pressed]');
        return {
          signal,
          pressed: getComputedStyle(pressed).color,
          radio: getComputedStyle(scope.querySelector('[role="radio"][data-checked]'))
            .backgroundColor,
        };
      });
      check(
        `${at}: selection alone recolours radios and pressed toggles`,
        toggle.radio === toggle.signal && toggle.pressed === toggle.signal,
        toggle,
      );
      await page
        .locator('article[id="family-ThemeScope"]')
        .screenshot({ path: resolve(artifacts, `theme-scope-${width}-${scheme}.png`) });
      check(
        `${at}: no theme scope reaches past the viewport`,
        await page.evaluate(() =>
          [...document.querySelectorAll('article[id="family-ThemeScope"] .fux-theme-scope')].every(
            (element) => element.getBoundingClientRect().right <= window.innerWidth,
          ),
        ),
      );

      // RTL: the bar mirrors (dots at the inline start), the address still reads left to right.
      await page.goto(`${base}?Frame#/components/Frame`);
      await frame.waitFor();
      await page.evaluate(() => (document.documentElement.dir = "rtl"));
      const rtl = await frame.evaluate((element) => {
        const dots = element.querySelector(".fux-frame-dots").getBoundingClientRect();
        const address = element.querySelector(".fux-frame-address");
        return {
          dotsRight: dots.right,
          addressRight: address.getBoundingClientRect().right,
          direction: getComputedStyle(address).direction,
        };
      });
      check(
        `${at}: in RTL the dots sit at the inline start and the URL stays LTR`,
        rtl.dotsRight > rtl.addressRight && rtl.direction === "ltr",
        rtl,
      );
      await page
        .locator('article[id="family-Frame"]')
        .screenshot({ path: resolve(artifacts, `frame-rtl-${width}-${scheme}.png`) });
      await page.close();
    }
  assert.deepEqual(errors, []);
  checks.push("No browser page errors");
  await writeFile(
    resolve(artifacts, "results.json"),
    JSON.stringify({ checks, browser: await browser.version() }, null, 2),
  );
  console.log(JSON.stringify({ checks: checks.length, artifacts }, null, 2));
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}
