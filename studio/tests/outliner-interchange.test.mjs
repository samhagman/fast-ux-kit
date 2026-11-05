// Markdown and text round trips: plain titles come back exactly as written (markup-looking
// titles are escaped on export), and Markdown carries view, colour, numbering and the created /
// edited times in a metadata comment; text keeps notes, checkboxes and completion.
//
//   cd studio && node --test tests/outliner-interchange.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, stopVite } from "./harness/outliner-dom.mjs";

let ic;
before(async () => {
  ic = await load("/src/registry/outliner/interchange.ts");
});
after(() => stopVite());

const strip = (nodes) =>
  nodes.map(({ id: _id, children, ...rest }) => ({
    ...rest,
    ...(children?.length ? { children: strip(children) } : {}),
  }));
const roundTrip = (nodes, format) =>
  strip(ic.importOutline(ic.exportOutline(nodes, format), () => "x"));

const LITERAL_TITLES = [
  "~~cancelled idea~~",
  "# not a heading, literal",
  "### three hashes",
  "[x] literal brackets",
  "[ ] open brackets",
  "> not a quote",
  "\\[x] already escaped by hand",
  "\\# and this",
  "ends like a comment <!-- ol view=board -->",
  "- looks like a bullet",
  "1. looks numbered",
  "plain",
];

for (const format of ["markdown", "text"]) {
  test(`${format}: titles that look like markup come back as literal text`, () => {
    const nodes = LITERAL_TITLES.map((text, i) => ({ id: `t${i}`, text }));
    const back = roundTrip(nodes, format);
    assert.deepEqual(
      back.map((node) => node.text),
      LITERAL_TITLES,
    );
    assert.ok(
      back.every((node) => node.checked === undefined && !node.data),
      "no checkbox, heading or completion appeared",
    );
  });

  test(`${format}: checkboxes, completion, headings and notes survive (also with markup-looking titles)`, () => {
    const nodes = [
      { id: "a", text: "[x] literal in a task", checked: false },
      { id: "b", text: "~~struck~~ and done", data: { completed: true } },
      { id: "c", text: "# literal under a heading", data: { heading: 2 } },
      {
        id: "d",
        text: "Task done",
        checked: true,
        data: { note: "first line\n\n  indented code\n> quoted\n- not a child" },
        children: [{ id: "e", text: "> child, not a note" }],
      },
    ];
    const back = roundTrip(nodes, format);
    assert.deepEqual(back, strip(nodes));
  });
}

test("markdown: view, colour, numbering and created/edited times ride in a metadata comment", () => {
  const created = Date.UTC(2026, 9, 31, 9, 0, 0, 123);
  const edited = created + 60_000;
  const nodes = [
    {
      id: "a",
      text: "Board",
      data: { view: "board", color: "red", numbered: true, createdAt: created, editedAt: edited },
      children: [{ id: "b", text: "Column", data: { createdAt: created } }],
    },
    { id: "m", text: "Map", data: { view: "mindmap", color: "blue" } },
  ];
  const md = ic.exportOutline(nodes, "markdown");
  assert.match(
    md,
    /^- Board <!-- ol view=board color=red numbered created=2026-10-31T09:00:00\.123Z edited=2026-10-31T09:01:00\.123Z -->$/m,
  );
  assert.deepEqual(roundTrip(nodes, "markdown"), strip(nodes));
  // Clipboard Markdown for other apps carries no comments.
  assert.doesNotMatch(ic.exportOutline(nodes, "markdown", { metadata: false }), /<!--/);
  // Someone else's comment (or a malformed value) stays text or is ignored.
  const [foreign] = ic.importOutline(
    "- Item <!-- a note for humans -->\n- Bad <!-- ol view=wall color=pink created=yesterday -->",
  );
  assert.equal(foreign.text, "Item <!-- a note for humans -->");
  const bad = ic.importOutline("- Bad <!-- ol view=wall color=pink created=yesterday -->")[0];
  assert.equal(bad.text, "Bad");
  assert.equal(bad.data, undefined, "unknown values are dropped, not guessed");
});

test("text: notes are quoted lines one level down; tab-indented text from elsewhere still nests", () => {
  const nodes = [
    {
      id: "p",
      text: "Plan",
      data: { note: "\nafter a blank line" },
      children: [{ id: "c", text: "Child" }],
    },
  ];
  const text = ic.exportOutline(nodes, "text");
  assert.equal(text, "Plan\n\t>\n\t> after a blank line\n\tChild");
  assert.deepEqual(roundTrip(nodes, "text"), strip(nodes));
  const plain = ic.importOutline("Top\n\tUnder\n\t\tDeeper");
  assert.equal(plain[0].children[0].children[0].text, "Deeper");
});
