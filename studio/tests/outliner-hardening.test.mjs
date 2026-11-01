// Small hardening cases: protocol-relative image addresses are refused, an overnight time-only
// range ends the next day, and an embed whose renderer threw renders again once it is fixed.
//
//   cd studio && node --test tests/outliner-hardening.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { domEnv, load, stopVite } from "./harness/outliner-dom.mjs";

let rich, inline;
before(async () => {
  rich = await load("/src/registry/outliner/rich-note.ts");
  inline = await load("/src/registry/outliner/inline.tsx");
});
after(() => stopVite());

test("images: https and site paths load; a protocol-relative //host address is plain text", () => {
  assert.equal(rich.parseNoteBlocks("![x](https://example.com/p.png)")[0].kind, "image");
  assert.equal(rich.parseNoteBlocks("![x](/media/p.png)")[0].kind, "image");
  assert.equal(rich.parseNoteBlocks("![x](//tracker.example/p.png)")[0].kind, "paragraph", "another site, never loaded");
});

test("dates: an overnight time-only range (22:00 → 02:00) ends the next day", () => {
  const date = inline.parseDateToken("!(2026-11-03 22:00 → 02:00)");
  assert.ok(date, "a range, not plain text");
  assert.equal(date.end.getDate(), 4);
  assert.equal(date.end.getHours(), 2);
  assert.equal(date.endHasTime, true);
  assert.equal(inline.dateTokenOf(date), "!(2026-11-03 22:00 → 2026-11-04 02:00)", "written back with its end day");
  const same = inline.parseDateToken("!(2026-11-03 09:00 → 11:00)");
  assert.equal(same.end.getDate(), 3, "a later time stays the same day");
  assert.equal(inline.parseDateToken("!(2026-11-07 → 2026-11-03)"), null, "an explicit end before the start is still no range");
});

test("embeds: a renderer that threw renders again after the host fixes it", async () => {
  await domEnv();
  const React = await import("react");
  const { createRoot } = await import("react-dom/client");
  const view = await load("/src/registry/outliner/rich-note-view.tsx");
  const fence = "```";
  const source = `${fence}embed:chart\npayload\n${fence}`;
  const host = document.createElement("div");
  const root = createRoot(host);
  const render = (renderers) =>
    React.act(async () => root.render(React.createElement(view.RichContentProvider, { renderers }, React.createElement(view.RichNote, { source }))));
  const quiet = console.error;
  console.error = () => {};
  try {
    await render({ "embed:chart": () => { throw new Error("host bug"); } });
    assert.equal(host.querySelector("pre")?.textContent, "payload", "broken: shown as code");
    await render({ "embed:chart": ({ source: body }) => React.createElement("figure", { "data-chart": body.trim() }) });
    assert.ok(host.querySelector('figure[data-chart="payload"]'), "fixed: the embed renders");
  } finally {
    console.error = quiet;
    await React.act(async () => root.unmount());
  }
});
