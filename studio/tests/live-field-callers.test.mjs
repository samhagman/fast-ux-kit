// Every reader of `parseInline` under nested styles: text inside a style is a `text` segment
// (with `marks`), tokens inside a style keep their kind, and delimiters are `delimiter` segments
// that no reader treats as content.
//
//   cd studio && node --test tests/live-field-callers.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, stopVite } from "./harness/outliner-dom.mjs";

let find, tags, filters, hook, mind, menu, ic;
before(async () => {
  find = await load("/src/registry/outliner/find-replace.ts");
  tags = await load("/src/registry/outliner/tag-pane.ts");
  filters = await load("/src/registry/outliner/search-filters.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
  mind = await load("/src/registry/outliner/mindmap.ts");
  menu = await load("/src/registry/outliner/item-menu.tsx");
  ic = await load("/src/registry/outliner/interchange.ts");
});
after(() => stopVite());

test("find and replace: words inside nested styles are found; delimiters never are", () => {
  const nodes = [{ id: "a", text: "Ship **beta *now*** and `beta`" }];
  const hits = find.findInOutline(nodes, "beta").map((m) => nodes[0].text.slice(m.start, m.end));
  assert.deepEqual(hits, ["beta", "beta"]);
  assert.deepEqual(
    find.findInOutline(nodes, "now").map((m) => m.start),
    [13],
  );
  assert.deepEqual(
    find.findInOutline([{ id: "a", text: "a **b** *c* ~~d~~" }], "*"),
    [],
    "a delimiter is not text",
  );
  assert.deepEqual(
    find.findInOutline([{ id: "a", text: "2 * 3" }], "*").length,
    1,
    "a literal star is",
  );
});

test("tag pane: tags and mentions inside styles count, including at a style's start", () => {
  const inventory = tags.tagInventory([
    { id: "d", nodes: [{ id: "a", text: "**#launch** and *@ann* and __x #y__" }] },
  ]);
  assert.deepEqual(inventory.tags.map((t) => t.key).sort(), ["#launch", "#y", "@ann"]);
  assert.deepEqual(
    tags.tagInventory([{ id: "d", nodes: [{ id: "a", text: "a*#b and x__#y" }] }]).tags,
    [],
    "a sigil glued to a stray delimiter is no tag",
  );
});

test("search filters: dates and item links inside styles are found", () => {
  const day = filters.dayNumber(new Date(2026, 10, 3));
  assert.equal(filters.firstDay({ id: "a", text: "**due !(2026-11-03)**" }), day);
  assert.deepEqual(filters.outgoingLinks({ id: "a", text: "*see [[Plan|p-1]] now*" }), ["p-1"]);
  const result = filters.searchOutliner(
    [
      { id: "a", text: "**ship !(2026-11-03)**" },
      { id: "b", text: "other" },
    ],
    "has:date",
  );
  assert.deepEqual(result.matchedIds, ["a"]);
});

test("recurring dates advance inside a style and keep its delimiters", () => {
  const advanced = hook.advanceRecurring(
    "**Water plants !(2026-11-03 every week)**",
    new Date(2026, 10, 3, 12),
  );
  assert.equal(advanced.text, "**Water plants !(2026-11-10 every week)**");
  assert.equal(hook.titleDate("*by !(2026-11-03)*").start, 4);
});

test("mind map: a code or date chip inside a style is as wide as one outside it", () => {
  const width = (text) =>
    mind.measureMindMapNode({
      id: "a",
      node: { id: "a", text },
      depth: 1,
      side: "end",
      parentId: null,
      children: [],
    }).width;
  assert.equal(width("**`code`**"), width("`code`"));
  assert.equal(width("*!(2026-11-03)*"), width("!(2026-11-03)"));
});

test("the / menu: a slash inside code, math or a link stays text, inside a style too", () => {
  assert.equal(menu.findSlashToken("**a `x /y`**", 9), null);
  assert.equal(menu.findSlashToken("*see [l](https://a.b/c)*", 20), null);
  assert.deepEqual(menu.findSlashToken("**bold** /me", 12), { start: 9, query: "me" });
  assert.deepEqual(menu.findSlashToken("*it* /x", 7), { start: 5, query: "x" });
});

test("interchange: HTML copy writes nested styles around their tokens", () => {
  const html = ic.exportOutlineHtml([{ id: "a", text: "**see `x` and #t**" }]);
  assert.ok(html.includes("<strong>see <code>x</code> and #t</strong>"), html);
});
