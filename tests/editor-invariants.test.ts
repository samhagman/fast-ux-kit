import assert from "node:assert/strict";
import test from "node:test";
import {
  createOutlineEditorState,
  editorVisibleRows,
  findOutlineNode,
  outlineIds,
  reduceOutlineEditor,
  validateOutline,
  type OutlineAction,
  type OutlineNode,
} from "../src/core/index.js";

/** Independently generated transition sequences: deterministic seeds are reproducible failures. */
test("seeded mixed transitions preserve immutable trees, valid caret scopes and reader authority", () => {
  let randomState = 0x2a6d49;
  const next = (limit: number) => {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState % Math.max(1, limit);
  };
  let serial = 0;
  const id = () => `generated-${serial++}`;
  for (let tree = 0; tree < 80; tree++) {
    const makeNode = (depth: number): OutlineNode => ({
      id: id(),
      text: ["Alpha", "🧭 note", "العربية", "", "line\nnext"][next(5)]!,
      ...(depth && next(3)
        ? { children: Array.from({ length: 1 + next(3) }, () => makeNode(depth - 1)) }
        : {}),
    });
    let state = createOutlineEditorState(Array.from({ length: 1 + next(4) }, () => makeNode(3)));
    for (let step = 0; step < 70; step++) {
      const visible = editorVisibleRows(state),
        row = visible[next(visible.length)];
      const all = outlineIds(state.nodes),
        any = all[next(all.length)];
      const actions: OutlineAction[] = [
        { type: "insert", id: id(), text: "New" },
        { type: "undo" },
        { type: "redo" },
        { type: "expand-all", expanded: next(2) === 1, depth: next(4) },
        { type: "hoist", id: next(3) === 0 ? null : (any ?? null) },
      ];
      if (row)
        actions.push(
          { type: "focus", id: row.id, start: next(row.node.text.length + 1) },
          { type: "select", id: row.id, extend: next(2) === 0 },
          { type: "toggle", id: row.id },
          { type: "text", id: row.id, text: `${row.node.text}x`, time: step },
          { type: "split", id: row.id, start: next(row.node.text.length + 1), newId: id() },
          { type: "merge", id: row.id, direction: next(2) ? "backward" : "forward" },
          { type: "indent", ids: [row.id] },
          { type: "outdent", ids: [row.id] },
          { type: "move", ids: [row.id], direction: next(2) ? "up" : "down" },
          { type: "delete", ids: [row.id] },
          { type: "task", id: row.id },
          { type: "paste", id: row.id, start: 0, text: "Paste\n  Child", createId: id },
        );
      const action = actions[next(actions.length)]!;
      const before = JSON.stringify(state.nodes),
        previous = state;
      const reader = reduceOutlineEditor(previous, action);
      assert.strictEqual(
        reader.nodes,
        previous.nodes,
        `reader authority ${tree}:${step}:${action.type}`,
      );
      state = reduceOutlineEditor(previous, action, { readOnly: false });
      assert.equal(
        JSON.stringify(previous.nodes),
        before,
        `immutability ${tree}:${step}:${action.type}`,
      );
      assert.deepEqual(
        validateOutline(state.nodes),
        [],
        `valid tree ${tree}:${step}:${action.type}`,
      );
      assert.equal(state.revision, previous.revision + (state.nodes !== previous.nodes ? 1 : 0));
      const visibleIds = new Set(editorVisibleRows(state).map((item) => item.id));
      if (state.caret) {
        assert.ok(visibleIds.has(state.caret.id), `visible caret ${tree}:${step}:${action.type}`);
        const node = findOutlineNode(state.nodes, state.caret.id)!.node;
        assert.ok(state.caret.start >= 0 && state.caret.end <= node.text.length);
      }
      for (const selected of state.selection)
        assert.ok(visibleIds.has(selected), `visible selection ${tree}:${step}:${action.type}`);
    }
  }
});
