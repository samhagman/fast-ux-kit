// Measures the layout primitives in a real browser: the gap scale, Grid's columns and Split's
// stacking, each sized by its own container rather than the viewport, in both directions.
// Run `npm run build` first; it reads the built components and stylesheet from `dist/`.
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(".");
const require = createRequire(resolve(root, "package.json"));
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const C = await import(pathToFileURL(resolve(root, "dist/components/index.js")).href);
const stylesheet = await readFile(resolve(root, "dist/library.css"), "utf8");
const h = React.createElement;

const cases = [];
const failures = [];
const check = (name, run) => cases.push({ name, run });

/** Renders `element` into a box of `width` px with the given direction and returns the page. */
async function mount(page, element, { width = 1000, dir = "ltr" } = {}) {
  const markup = renderToStaticMarkup(h("div", { id: "box", dir, style: { width } }, element));
  await page.setContent(
    `<!doctype html><html><head><style>${stylesheet}</style><style>body{margin:0;padding:16px}` +
      `.cell{min-block-size:20px;background:var(--muted)}</style></head><body>${markup}</body></html>`,
  );
}
const rect = (page, selector) =>
  page.$eval(selector, (element) => {
    const box = element.getBoundingClientRect();
    return { x: box.x, y: box.y, width: box.width, height: box.height };
  });
const style = (page, selector, property) =>
  page.$eval(selector, (element, name) => getComputedStyle(element)[name], property);
const cells = (count) =>
  Array.from({ length: count }, (_, index) => h("div", { className: "cell", key: index }));
const near = (actual, expected, label, tolerance = 1) => {
  if (Math.abs(actual - expected) > tolerance)
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
};
const equal = (actual, expected, label) => {
  if (actual !== expected)
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
};

const scale = [
  ["none", 0],
  ["2xs", 2],
  ["xs", 4],
  ["sm", 8],
  ["sm-md", 12],
  ["md", 16],
  ["lg", 24],
  ["xl", 32],
  ["2xl", 48],
];

check("Row gap=md is 16px, the same as Stack's md", async (page) => {
  await mount(
    page,
    h(
      React.Fragment,
      null,
      h(C.Row, { id: "row", gap: "md" }, cells(2)),
      h(C.Stack, { id: "stack", gap: "md" }, cells(2)),
    ),
  );
  equal(await style(page, "#stack", "rowGap"), "16px", "Stack md");
  equal(await style(page, "#row", "columnGap"), "16px", "Row md");
});

check("a Row with no gap stays 8px and a Stack with no gap stays 16px", async (page) => {
  await mount(
    page,
    h(
      React.Fragment,
      null,
      h(C.Row, { id: "row" }, cells(2)),
      h(C.Stack, { id: "stack" }, cells(2)),
    ),
  );
  equal(await style(page, "#row", "columnGap"), "8px", "Row default");
  equal(await style(page, "#stack", "rowGap"), "16px", "Stack default");
});

check(
  "every step of the one scale renders the same px in Stack, Row, Grid and Split",
  async (page) => {
    const families = [
      ["Stack", (gap) => h(C.Stack, { id: `stack-${gap}`, gap }, cells(2))],
      ["Row", (gap) => h(C.Row, { id: `row-${gap}`, gap }, cells(2))],
      ["Grid", (gap) => h(C.Grid, { id: `grid-${gap}`, gap, min: "10px" }, cells(2))],
      ["Split", (gap) => h(C.Split, { id: `split-${gap}`, gap }, h(C.Split.Side), h(C.Split.Main))],
    ];
    await mount(
      page,
      h(React.Fragment, null, ...families.flatMap(([, make]) => scale.map(([gap]) => make(gap)))),
    );
    for (const [family] of families)
      for (const [gap, px] of scale)
        equal(
          await style(page, `#${family.toLowerCase()}-${gap}`, "columnGap"),
          `${px}px`,
          `${family} ${gap}`,
        );
  },
);

check("Grid fits columns to its own width, not the viewport's", async (page) => {
  const grid = h(C.Grid, { id: "grid", min: "340px", gap: "lg", align: "start" }, cells(4));
  for (const [width, columns] of [
    [1248, 3],
    [728, 2],
    [700, 1],
    [343, 1],
  ]) {
    await mount(page, grid, { width });
    const tracks = (await style(page, "#grid", "gridTemplateColumns")).split(" ").length;
    equal(tracks, columns, `${width}px box`);
  }
  await mount(page, grid, { width: 300 });
  near(
    (await rect(page, "#grid > .cell")).width,
    300,
    "a box narrower than min holds one full column",
  );
  equal(await page.$eval("#box", (box) => box.scrollWidth <= box.clientWidth), true, "no overflow");
  equal(await style(page, "#grid", "alignItems"), "start", "align");
});

check("Split: side by side at stackBelow and wider, stacked below it", async (page) => {
  const split = h(
    C.Split,
    { id: "split", side: "200px", stackBelow: "620px", gap: "lg" },
    h(C.Split.Side, { id: "side" }, "Side"),
    h(C.Split.Main, { id: "main" }, "Main"),
  );
  for (const width of [1000, 620]) {
    await mount(page, split, { width });
    const side = await rect(page, "#side");
    const main = await rect(page, "#main");
    near(side.width, 200, `${width}px: the side keeps its width`);
    near(side.y, main.y, `${width}px: one row`);
    near(main.x, side.x + 200 + 24, `${width}px: main follows the gap`);
    near(main.width, width - 224, `${width}px: main takes the rest`);
  }
  for (const width of [619, 343, 200]) {
    await mount(page, split, { width });
    const side = await rect(page, "#side");
    const main = await rect(page, "#main");
    near(side.width, width, `${width}px: the side spans the box`);
    near(main.width, width, `${width}px: main spans the box`);
    near(main.y, side.y + side.height + 24, `${width}px: main stacks under the side`);
    equal(
      await page.$eval("#box", (box) => box.scrollWidth <= box.clientWidth),
      true,
      "no overflow",
    );
  }
});

check(
  "Split in right to left, and with the side after main, puts the side on the inline end",
  async (page) => {
    const sideFirst = h(
      C.Split,
      { side: "200px", stackBelow: "620px" },
      h(C.Split.Side, { id: "side" }),
      h(C.Split.Main, { id: "main" }),
    );
    await mount(page, sideFirst, { width: 800, dir: "rtl" });
    let side = await rect(page, "#side");
    let main = await rect(page, "#main");
    near(side.x + side.width, 16 + 800, "rtl: the side starts on the right");
    near(main.x + main.width, side.x - 16, "rtl: main sits to its left");
    const sideLast = h(
      C.Split,
      { side: "200px", stackBelow: "620px" },
      h(C.Split.Main, { id: "main" }),
      h(C.Split.Side, { id: "side" }),
    );
    await mount(page, sideLast, { width: 800 });
    side = await rect(page, "#side");
    main = await rect(page, "#main");
    near(side.x + side.width, 16 + 800, "side last: on the right in ltr");
    near(side.width, 200, "side last keeps its width");
    near(main.x, 16, "main first starts the row");
    await mount(page, sideLast, { width: 500 });
    side = await rect(page, "#side");
    main = await rect(page, "#main");
    equal(side.y > main.y, true, "stacked, the side follows main in reading order");
  },
);

check(
  "Panel padding none: header and footer flush, a table inside loses its frame",
  async (page) => {
    const columns = [{ id: "name", label: "Name", isRowHeader: true, render: (row) => row.id }];
    await mount(
      page,
      h(
        C.Panel,
        { id: "panel", padding: "none" },
        h(
          C.Panel.Header,
          { id: "header", tone: "band", wrap: true },
          h(C.Panel.Title, null, "Runs"),
        ),
        h(C.Table, { label: "Runs", columns, rows: [{ id: "first" }] }),
        h(C.Panel.Footer, { id: "footer" }, "Footer"),
      ),
      { width: 600 },
    );
    const panel = await rect(page, "#panel");
    const header = await rect(page, "#header");
    const footer = await rect(page, "#footer");
    const table = await rect(page, "#panel > .fux-table-scroll");
    near(header.x, panel.x + 1, "header starts at the panel's inner edge");
    near(header.width, panel.width - 2, "header spans the panel");
    near(header.y, panel.y + 1, "header sits at the top");
    near(table.y, header.y + header.height, "the table starts under the header");
    near(table.width, panel.width - 2, "the table spans the panel");
    near(footer.y, table.y + table.height, "the footer follows the table");
    near(footer.y + footer.height, panel.y + panel.height - 1, "the footer sits at the bottom");
    equal(
      await style(page, "#panel > .fux-table-scroll", "borderTopWidth"),
      "0px",
      "no table frame",
    );
    equal(
      await style(page, "#header", "paddingInlineStart"),
      "12px",
      "header text lines up with cells",
    );
    equal(await style(page, "#header", "flexWrap"), "wrap", "the header wraps");
    equal(
      (await style(page, "#header", "backgroundColor")) !== "rgba(0, 0, 0, 0)",
      true,
      "the band is filled",
    );
  },
);

check("Panel edge=top draws only the top edge; tone=quiet drops the shadow", async (page) => {
  await mount(
    page,
    h(
      React.Fragment,
      null,
      h(C.Panel, { id: "top", edge: "top" }, "Top"),
      h(C.Panel, { id: "quiet", tone: "quiet" }, "Quiet"),
    ),
  );
  equal(await style(page, "#top", "borderTopWidth"), "1px", "top edge");
  for (const side of ["borderBottomWidth", "borderLeftWidth", "borderRightWidth"])
    equal(await style(page, "#top", side), "0px", side);
  equal(await style(page, "#top", "paddingInlineStart"), "0px", "content lines up with the rule");
  equal(await style(page, "#quiet", "boxShadow"), "none", "quiet has no shadow");
});

check("Stack as ul: no bullets, no indent, list semantics", async (page) => {
  await mount(
    page,
    h(C.Stack, { as: "ul", id: "list" }, h("li", null, "One"), h("li", null, "Two")),
  );
  equal(await style(page, "#list", "listStyleType"), "none", "no bullets");
  equal(await style(page, "#list", "paddingInlineStart"), "0px", "no indent");
  equal(
    await page.$eval("#list", (list) => list.tagName + ":" + list.getAttribute("role")),
    "UL:list",
    "role",
  );
});

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  for (const { name, run } of cases) {
    try {
      await run(page);
      console.log(`ok - ${name}`);
    } catch (error) {
      failures.push(name);
      console.log(`not ok - ${name}\n  ${String(error?.message ?? error).split("\n")[0]}`);
    }
  }
  console.log(
    `# ${cases.length - failures.length} of ${cases.length} passed in ${await browser.version()}`,
  );
} finally {
  await browser.close();
}
if (failures.length) process.exit(1);
