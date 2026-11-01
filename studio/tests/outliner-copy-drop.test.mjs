// ⌥-drag copies: links inside the copied branch follow the copies (links to items outside stay),
// and copies are new items (a fresh created time, so `created:today` finds them).
//
//   cd studio && node --test tests/outliner-copy-drop.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { load, mountOutliner, stopVite } from "./harness/outliner-dom.mjs";

let copyDrop, core;
before(async () => {
  copyDrop = await load("/src/registry/outliner/copy-drop.ts");
  core = await load("@fux/core");
});
after(() => stopVite());

const OLD = Date.UTC(2025, 0, 1);
const doc = () => [
  {
    id: "p",
    text: "Parent",
    data: { createdAt: OLD, editedAt: OLD, color: "red" },
    children: [
      { id: "c1", text: "see [[Sib|c2]] and [[Outside|q]]", data: { createdAt: OLD, note: "also [[Sib|c2]]" } },
      { id: "c2", text: "Sib", data: { createdAt: OLD } },
    ],
  },
  { id: "q", text: "Outside" },
];

test("copy drop: links inside the copy point at the copies; links outside stay; stamps are dropped", () => {
  let n = 0;
  const { commands, created } = copyDrop.copyDropCommands(doc(), ["p"], { parentId: null, index: 2 }, () => `n${++n}`);
  assert.deepEqual(created, ["n1"]);
  const copy = commands[0].node;
  assert.deepEqual([copy.id, ...copy.children.map((c) => c.id)], ["n1", "n2", "n3"]);
  assert.equal(copy.children[0].text, "see [[Sib|n3]] and [[Outside|q]]", "the sibling link follows its copy; the outside link stays");
  assert.equal(copy.children[0].data.note, "also [[Sib|n3]]", "in notes too");
  assert.deepEqual(copy.data, { color: "red" }, "other data is copied; created/edited are not");
  assert.equal(copy.children[1].data, undefined);
});

test("component: a dropped copy is stamped as created now; the original keeps its times", async () => {
  const ui = await mountOutliner({ defaultValue: doc() });
  const start = Date.now();
  const { commands, created } = copyDrop.copyDropCommands(ui.value(), ["p"], { parentId: null, index: 2 });
  await ui.act(() => ui.ol().dispatch({ type: "transaction", commands }));
  const nodes = ui.value();
  const copy = core.findOutlineNode(nodes, created[0]).node;
  assert.ok(copy.data.createdAt >= start, "the copy is new");
  assert.ok(copy.children.every((child) => child.data.createdAt >= start), "and so is everything inside it");
  assert.equal(core.findOutlineNode(nodes, "p").node.data.createdAt, OLD, "the original is untouched");
  await ui.unmount();
});
