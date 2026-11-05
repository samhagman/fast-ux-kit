// Outliner rich clipboard (interchange.ts): text/html export and inert HTML paste import.
// The browser's DOMParser is the tokenizer; under Node the same parser API comes from jsdom.
//
//   cd studio && node --test tests/
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { JSDOM } from "jsdom";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite;
let mod;
const { window } = new JSDOM("");
const parse = (html) => new window.DOMParser().parseFromString(html, "text/html");
let n = 0;
const id = () => `n${++n}`;
before(async () => {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  mod = await vite.ssrLoadModule("/src/registry/outliner/interchange.ts");
});
after(() => vite?.close());

/** Drops generated ids so trees compare by content. */
const shape = (nodes) =>
  nodes.map(({ id: _id, children, ...rest }) => ({
    ...rest,
    ...(children ? { children: shape(children) } : {}),
  }));
const importHtml = (html) => shape(mod.importOutlineHtml(html, id, parse));

const sample = [
  {
    id: "a",
    text: "Ship **all tenants** by __Q4__ — see [dashboard](https://example.com/d?x=1&y=2) !(2026-11-03)",
    checked: false,
    data: { heading: 2, note: "Owner: `rin`\nSecond line ==hot==" },
    children: [
      { id: "b", text: "~~Old plan~~ replaced", checked: true },
      { id: "c", text: "Plain child", data: { completed: true } },
    ],
  },
  {
    id: "d",
    text: "Numbered parent",
    data: { numbered: true },
    children: [{ id: "e", text: "Step one" }],
  },
  { id: "f", text: "Links to [[Launch goals|a]] and #tag @rin" },
];

test("export: nested lists with semantic inline tags, checkbox state, headings and notes", () => {
  const html = mod.exportOutlineHtml(sample, (refId) => (refId === "a" ? "Ship it" : null));
  assert.match(
    html,
    /^<meta charset="utf-8"><ul><li><h2><input type="checkbox" disabled> Ship <strong>all tenants<\/strong> by <em>Q4<\/em>/,
  );
  assert.match(
    html,
    /<a href="https:\/\/example\.com\/d\?x=1&amp;y=2">dashboard<\/a>/,
    "attributes are escaped",
  );
  assert.match(html, /<time datetime="2026-11-03">[^<]+<\/time>/);
  assert.match(html, /<\/h2><p>Owner: <code>rin<\/code><br>Second line <mark>hot<\/mark><\/p>/);
  assert.match(
    html,
    /<ul><li><input type="checkbox" disabled checked> <s>Old plan<\/s> replaced<\/li><li><s>Plain child<\/s><\/li><\/ul>/,
  );
  assert.match(html, /<li>Numbered parent<ol><li>Step one<\/li><\/ol><\/li>/);
  // An internal link stays a link (to the item's id), labelled with its target's current title.
  assert.match(
    html,
    /Links to <a href="#a">Ship it<\/a> and #tag @rin/,
    "id links export as links with their target's current title",
  );
});

test("export escapes everything: no document string becomes markup", () => {
  const html = mod.exportOutlineHtml([
    {
      id: "x",
      text: `<img src=x onerror="alert(1)"> & <script>alert(2)</script>`,
      data: { note: "</li><li>forged" },
    },
    { id: "y", text: "[click](javascript:alert(1)) **<b>bold</b>**" },
  ]);
  assert.ok(!/<img|<script|<\/li><li>forged|href="javascript/i.test(html), html);
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &lt;script&gt;/);
  assert.match(html, /<strong>&lt;b&gt;bold&lt;\/b&gt;<\/strong>/);
});

test("round trip: our own HTML imports back to the same structure", () => {
  const html = mod.exportOutlineHtml(sample);
  const back = importHtml(html);
  assert.equal(back.length, 3);
  assert.equal(back[0].checked, false);
  assert.equal(back[0].data.heading, 2);
  assert.equal(
    back[0].text,
    "Ship **all tenants** by __Q4__ — see [dashboard](https://example.com/d?x=1&y=2) !(2026-11-03)",
  );
  assert.equal(back[0].data.note, "Owner: `rin`\nSecond line ==hot==");
  assert.deepEqual(back[0].children[0], { text: "~~Old plan~~ replaced", checked: true });
  assert.deepEqual(back[0].children[1], { text: "Plain child", data: { completed: true } });
  assert.deepEqual(back[1], {
    text: "Numbered parent",
    data: { numbered: true },
    children: [{ text: "Step one" }],
  });
});

test("doc editor: guid wrapper, styled spans, sibling-nested lists", () => {
  const docs = `<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><ul style="margin-top:0">
    <li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr"><span style="font-weight:700;">Launch</span><span style="font-weight:400;"> checklist</span></p></li>
    <ul><li aria-level="2"><p><span style="font-style:italic;">Draft</span><span> the </span><span style="text-decoration:line-through;">memo</span></p></li>
        <li aria-level="2"><p><a href="https://docs.example.com/x"><span style="color:#1155cc;text-decoration:underline;">spec</span></a></p></li></ul>
    <li aria-level="1"><p><span style="font-family:'Courier New',monospace;">npm ci</span></p></li></ul></b>`;
  assert.deepEqual(importHtml(docs), [
    {
      text: "**Launch** checklist",
      children: [
        { text: "__Draft__ the ~~memo~~" },
        { text: "[spec](https://docs.example.com/x)" },
      ],
    },
    { text: "`npm ci`" },
  ]);
});

test("doc editor flat lists: aria-level alone nests items", () => {
  const flat = `<ul><li aria-level="1">One</li><li aria-level="2">One.a</li><li aria-level="3">deep</li><li aria-level="2">One.b</li><li aria-level="1">Two</li></ul>`;
  assert.deepEqual(importHtml(flat), [
    { text: "One", children: [{ text: "One.a", children: [{ text: "deep" }] }, { text: "One.b" }] },
    { text: "Two" },
  ]);
});

test("note app and task list: to-dos keep their checked state, headings and toggles nest", () => {
  const todoHtml = `<ul class="to-do-list"><li><div class="checkbox checkbox-on"></div><span class="to-do-children-checked">Book venue</span></li></ul>
    <ul class="to-do-list"><li><div class="checkbox checkbox-off"></div><span class="to-do-children-unchecked">Send invites</span></li></ul>
    <h2>Agenda</h2><ul><li>Intro<ul><li>Welcome <code>v2</code></li></ul></li></ul>`;
  assert.deepEqual(importHtml(todoHtml), [
    { text: "Book venue", checked: true },
    { text: "Send invites", checked: false },
    { text: "Agenda", data: { heading: 2 } },
    { text: "Intro", children: [{ text: "Welcome `v2`" }] },
  ]);
  const github = `<ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled checked> done<ul><li class="task-list-item"><input type="checkbox" disabled> open child</li></ul></li></ul>`;
  assert.deepEqual(importHtml(github), [
    { text: "done", checked: true, children: [{ text: "open child", checked: false }] },
  ]);
});

test("paste is inert: scripts, styles, images, handlers and unsafe links are dropped, never run", () => {
  const evil = `<ul><li onclick="alert(1)">Safe <script>window.hacked = 1</script><img src="x" onerror="window.hacked = 2">text<style>li{color:red}</style>
    <a href="javascript:alert(1)">bad link</a> <a href="https://ok.example/">good</a></li></ul>`;
  assert.deepEqual(importHtml(evil), [{ text: "Safe text bad link [good](https://ok.example/)" }]);
  assert.equal(window.hacked, undefined);
});

test("paragraphs become items; plain inline HTML stays one item; structure detection", () => {
  assert.deepEqual(importHtml("<p>First</p><p>Second <b>bold</b></p><h3>Head</h3>"), [
    { text: "First" },
    { text: "Second **bold**" },
    { text: "Head", data: { heading: 3 } },
  ]);
  assert.equal(mod.htmlHasStructure("<span>just <b>one</b> run</span>"), false);
  assert.equal(mod.htmlHasStructure("<p>a</p><p>b</p>"), true);
  assert.equal(mod.htmlHasStructure("<ul><li>a</li></ul>"), true);
  assert.deepEqual(
    importHtml("<ul><li>[x] typed box</li><li>☐ glyph box</li><li>• bullet glyph</li></ul>"),
    [
      { text: "typed box", checked: true },
      { text: "glyph box", checked: false },
      { text: "bullet glyph" },
    ],
  );
});
