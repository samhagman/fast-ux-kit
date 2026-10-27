import assert from "node:assert/strict";
import test from "node:test";
import {
  applyOutlineCommand,
  flattenVisible,
  InvalidOutlineError,
  toggleExpanded,
  validateOutline,
  type OutlineCommand,
  type OutlineNode,
} from "../src/core/index.js";

interface Metadata {
  locked?: boolean;
  note?: string;
}
const edit = { readOnly: false } as const;

function fixture(): readonly OutlineNode<Metadata>[] {
  return Object.freeze([
    Object.freeze({
      id: "a",
      text: "Alpha",
      children: Object.freeze([
        Object.freeze({
          id: "a1",
          text: "First",
          children: Object.freeze([Object.freeze({ id: "a1i", text: "Nested" })]),
        }),
        Object.freeze({ id: "a2", text: "Second" }),
      ]),
    }),
    Object.freeze({ id: "b", text: "Beta" }),
  ]);
}

function success<T>(
  nodes: readonly OutlineNode<T>[],
  command: OutlineCommand<T>,
): readonly OutlineNode<T>[] {
  const result = applyOutlineCommand(nodes, command, edit);
  assert.equal(result.ok, true);
  return result.nodes;
}

test("validation covers empty trees, invalid fields, duplicate ids and hidden data", () => {
  assert.deepEqual(validateOutline([]), []);
  assert.deepEqual(validateOutline(fixture()), []);
  const invalid = [{ id: "x", text: "Root", children: [{ id: "x", text: "Duplicate" }] }];
  assert.deepEqual(
    validateOutline(invalid).map((issue) => issue.code),
    ["duplicate-id"],
  );
  assert.deepEqual(validateOutline(invalid)[0]?.path, [0, 0]);
  const malformed = [
    { id: " ", text: 4, children: null },
    null,
  ] as unknown as readonly OutlineNode[];
  assert.equal(
    validateOutline(malformed).filter((issue) => issue.code === "invalid-node").length,
    3,
  );
  assert.equal(validateOutline(null as unknown as OutlineNode[])[0]?.code, "invalid-node");
  assert.throws(() => flattenVisible(invalid, new Set()), InvalidOutlineError);
});

test("validation detects object cycles and reused nodes without hanging", () => {
  const cyclic = { id: "cycle", text: "Cycle", children: [] as OutlineNode[] };
  cyclic.children.push(cyclic);
  assert.ok(validateOutline([cyclic]).some((issue) => issue.code === "cycle"));
  assert.throws(() => flattenVisible([cyclic], new Set(["cycle"])), /Invalid outline/);
  const shared = { id: "shared", text: "Shared" };
  assert.deepEqual(
    validateOutline([shared, shared]).map((issue) => issue.code),
    ["duplicate-id"],
  );
});

test("flattenVisible preserves input nodes and exposes tree accessibility metadata", () => {
  const nodes = fixture();
  const collapsed = flattenVisible(nodes, new Set());
  assert.deepEqual(
    collapsed.map((row) => row.id),
    ["a", "b"],
  );
  assert.strictEqual(collapsed[0]?.node, nodes[0]);
  const expanded = flattenVisible(nodes, new Set(["a", "a1", "missing"]));
  assert.deepEqual(
    expanded.map(({ id, parentId, depth, index, posInSet, setSize, hasChildren }) => ({
      id,
      parentId,
      depth,
      index,
      posInSet,
      setSize,
      hasChildren,
    })),
    [
      { id: "a", parentId: null, depth: 0, index: 0, posInSet: 1, setSize: 2, hasChildren: true },
      { id: "a1", parentId: "a", depth: 1, index: 1, posInSet: 1, setSize: 2, hasChildren: true },
      {
        id: "a1i",
        parentId: "a1",
        depth: 2,
        index: 2,
        posInSet: 1,
        setSize: 1,
        hasChildren: false,
      },
      { id: "a2", parentId: "a", depth: 1, index: 3, posInSet: 2, setSize: 2, hasChildren: false },
      { id: "b", parentId: null, depth: 0, index: 4, posInSet: 2, setSize: 2, hasChildren: false },
    ],
  );
});

test("expansion toggles immutably, separately from read-only document policy", () => {
  const current = new Set(["a"]);
  const expanded = toggleExpanded(current, "a1");
  assert.deepEqual([...expanded], ["a", "a1"]);
  assert.deepEqual([...current], ["a"]);
  assert.deepEqual([...toggleExpanded(expanded, "a")], ["a1"]);
  assert.notStrictEqual(current, expanded);
  assert.equal(flattenVisible(fixture(), expanded).length, 5);
});

test("every command is read-only by default and failures retain original roots", () => {
  const nodes = fixture();
  const commands: OutlineCommand<Metadata>[] = [
    { type: "update", id: "a", changes: { text: "Changed" } },
    { type: "insert", parentId: null, node: { id: "c", text: "New" } },
    { type: "remove", id: "a" },
    { type: "move", id: "a", parentId: "b" },
  ];
  for (const command of commands) {
    const result = applyOutlineCommand(nodes, command);
    assert.deepEqual(result, { ok: false, nodes, reason: "read-only" });
    assert.strictEqual(result.nodes, nodes);
    assert.equal(applyOutlineCommand(nodes, command, { readOnly: true }).ok, false);
  }
});

test("updates clone the modified path only and no-op updates preserve roots", () => {
  const nodes = fixture();
  const updated = success(nodes, {
    type: "update",
    id: "a1i",
    changes: { text: "Changed", data: { note: "metadata" } },
  });
  assert.notStrictEqual(updated, nodes);
  assert.notStrictEqual(updated[0], nodes[0]);
  assert.strictEqual(updated[1], nodes[1]);
  assert.strictEqual(updated[0]?.children?.[1], nodes[0]?.children?.[1]);
  assert.equal(updated[0]?.children?.[0]?.children?.[0]?.text, "Changed");
  assert.equal(nodes[0]?.children?.[0]?.children?.[0]?.text, "Nested");
  assert.strictEqual(
    success(nodes, { type: "update", id: "a", changes: { text: "Alpha" } }),
    nodes,
  );
  assert.strictEqual(success(nodes, { type: "update", id: "a", changes: {} }), nodes);
  const extraFields = { text: "Changed", id: "b", children: [] };
  const supportedOnly = success(nodes, { type: "update", id: "a", changes: extraFields });
  assert.equal(supportedOnly[0]?.id, "a");
  assert.strictEqual(supportedOnly[0]?.children, nodes[0]?.children);
});

test("inserts support root and leaf destinations, append by default, and reject duplicate subtrees", () => {
  const nodes = fixture();
  const leafInsert = success(nodes, {
    type: "insert",
    parentId: "b",
    node: { id: "b1", text: "Child" },
  });
  assert.equal(leafInsert[1]?.children?.[0]?.id, "b1");
  assert.strictEqual(leafInsert[0], nodes[0]);
  const rootInsert = success(nodes, {
    type: "insert",
    parentId: null,
    index: 1,
    node: { id: "c", text: "Root" },
  });
  assert.deepEqual(
    rootInsert.map((node) => node.id),
    ["a", "c", "b"],
  );
  const duplicate = applyOutlineCommand(
    nodes,
    {
      type: "insert",
      parentId: "b",
      node: { id: "c", text: "Root", children: [{ id: "a2", text: "Duplicate hidden id" }] },
    },
    edit,
  );
  assert.deepEqual(duplicate, { ok: false, nodes, reason: "invalid-outline" });
});

test("remove deletes a subtree without mutating its siblings", () => {
  const nodes = fixture();
  const removed = success(nodes, { type: "remove", id: "a1" });
  assert.deepEqual(
    removed[0]?.children?.map((node) => node.id),
    ["a2"],
  );
  assert.strictEqual(removed[0]?.children?.[0], nodes[0]?.children?.[1]);
  assert.strictEqual(removed[1], nodes[1]);
  assert.equal(nodes[0]?.children?.length, 2);
});

test("moves preserve node identity, relocate across adjusted paths, and use post-removal indexes", () => {
  const nodes = fixture();
  const moved = success(nodes, { type: "move", id: "a1", parentId: "b" });
  assert.strictEqual(moved[1]?.children?.[0], nodes[0]?.children?.[0]);
  assert.deepEqual(
    moved[0]?.children?.map((node) => node.id),
    ["a2"],
  );
  const rootIntoFollowingRoot = success(nodes, { type: "move", id: "a", parentId: "b" });
  assert.equal(rootIntoFollowingRoot.length, 1);
  assert.strictEqual(rootIntoFollowingRoot[0]?.children?.[0], nodes[0]);
  const reordered = success(nodes, { type: "move", id: "a1", parentId: "a", index: 1 });
  assert.deepEqual(
    reordered[0]?.children?.map((node) => node.id),
    ["a2", "a1"],
  );
  assert.strictEqual(success(nodes, { type: "move", id: "a1", parentId: "a", index: 0 }), nodes);
  const promoted = success(nodes, { type: "move", id: "a1i", parentId: null, index: 0 });
  assert.deepEqual(
    promoted.map((node) => node.id),
    ["a1i", "a", "b"],
  );
  assert.deepEqual(validateOutline(promoted), []);
});

test("moves into self or descendants are rejected atomically", () => {
  const nodes = fixture();
  for (const parentId of ["a", "a1", "a1i"]) {
    const result = applyOutlineCommand(nodes, { type: "move", id: "a", parentId }, edit);
    assert.deepEqual(result, { ok: false, nodes, reason: "descendant-move" });
  }
});

test("move matrix preserves every node exactly once across root, ancestor and leaf destinations", () => {
  const ids = ["a", "a1", "a1i", "a2", "b"];
  for (const id of ids) {
    for (const parentId of [null, ...ids]) {
      const nodes = fixture();
      const result = applyOutlineCommand(nodes, { type: "move", id, parentId }, edit);
      if (!result.ok) {
        assert.equal(result.reason, "descendant-move");
        assert.strictEqual(result.nodes, nodes);
        continue;
      }
      assert.deepEqual(validateOutline(result.nodes), []);
      const rows = flattenVisible(result.nodes, new Set(ids));
      assert.deepEqual(rows.map((row) => row.id).sort(), [...ids].sort());
      const original = flattenVisible(nodes, new Set(ids));
      assert.strictEqual(
        rows.find((row) => row.id === id)?.node,
        original.find((row) => row.id === id)?.node,
      );
      assert.deepEqual(
        original.map((row) => row.id),
        ["a", "a1", "a1i", "a2", "b"],
      );
    }
  }
});

test("locks protect descendants, ancestors, destinations, and hidden subtrees", () => {
  const nodes = fixture();
  const policy = { readOnly: false, isLocked: (node: OutlineNode<Metadata>) => node.id === "a1i" };
  for (const command of [
    { type: "remove", id: "a" },
    { type: "move", id: "a1", parentId: "b" },
    { type: "update", id: "a1i", changes: { text: "Changed" } },
    { type: "insert", parentId: "a1i", node: { id: "new", text: "New" } },
    { type: "move", id: "b", parentId: "a1i" },
  ] satisfies OutlineCommand<Metadata>[]) {
    assert.deepEqual(applyOutlineCommand(nodes, command, policy), {
      ok: false,
      nodes,
      reason: "locked",
    });
  }
  const ancestorLocked = {
    readOnly: false,
    isLocked: (node: OutlineNode<Metadata>) => node.id === "a",
  };
  assert.equal(
    applyOutlineCommand(
      nodes,
      { type: "update", id: "a2", changes: { text: "No" } },
      ancestorLocked,
    ).ok,
    false,
  );
  // Updating an unlocked ancestor's own text does not alter a locked descendant.
  assert.equal(
    applyOutlineCommand(nodes, { type: "update", id: "a", changes: { text: "Allowed" } }, policy)
      .ok,
    true,
  );
  // Reading and expanding locked content remains available.
  assert.equal(flattenVisible(nodes, new Set(["a", "a1"])).length, 5);
});

test("invalid indexes and missing ids fail without any partial deletion", () => {
  const nodes = fixture();
  for (const index of [-1, 0.5, Infinity, NaN, 3]) {
    const moved = applyOutlineCommand(
      nodes,
      { type: "move", id: "a1", parentId: "b", index },
      edit,
    );
    assert.deepEqual(moved, { ok: false, nodes, reason: "invalid-index" });
    const inserted = applyOutlineCommand(
      nodes,
      { type: "insert", parentId: "b", index, node: { id: "new", text: "New" } },
      edit,
    );
    assert.deepEqual(inserted, { ok: false, nodes, reason: "invalid-index" });
  }
  const commands: OutlineCommand<Metadata>[] = [
    { type: "update", id: "missing", changes: { text: "No" } },
    { type: "remove", id: "missing" },
    { type: "move", id: "a1", parentId: "missing" },
    { type: "insert", parentId: "missing", node: { id: "new", text: "New" } },
  ];
  for (const command of commands)
    assert.deepEqual(applyOutlineCommand(nodes, command, edit), {
      ok: false,
      nodes,
      reason: "not-found",
    });
});

test("document commands reject invalid input trees even when corruption is collapsed", () => {
  const nodes = [{ id: "a", text: "First", children: [{ id: "a", text: "Duplicate" }] }];
  assert.deepEqual(applyOutlineCommand(nodes, { type: "remove", id: "a" }, edit), {
    ok: false,
    nodes,
    reason: "invalid-outline",
  });
});
