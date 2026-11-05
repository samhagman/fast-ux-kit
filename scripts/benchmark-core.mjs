// Run after `npm run build`. These are local Node model timings, not browser/device performance.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { cpus, platform, arch } from "node:os";
import {
  validateOutline,
  createOutlineEditorState,
  reduceOutlineEditor,
  exportOutlineJSON,
  importOutlineJSON,
  outlineIds,
} from "../dist/core/index.js";

function freezeTree(nodes) {
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop();
    if (node.children) {
      pending.push(...node.children);
      Object.freeze(node.children);
    }
    Object.freeze(node);
  }
  return Object.freeze(nodes);
}
function wide(count) {
  return freezeTree(
    Array.from({ length: count }, (_, index) => ({
      id: `n-${index}`,
      text: `A useful note ${index}`,
      ...(index % 5 === 0 ? { checked: false } : {}),
    })),
  );
}
function branched(count) {
  return freezeTree(
    Array.from({ length: count / 10 }, (_, root) => ({
      id: `root-${root}`,
      text: `Section ${root}`,
      children: Array.from({ length: 9 }, (_, child) => ({
        id: `child-${root}-${child}`,
        text: `Detail ${child}`,
      })),
    })),
  );
}
function deep(count) {
  let node = { id: `deep-${count - 1}`, text: "Last detail" };
  for (let index = count - 2; index >= 0; index--)
    node = { id: `deep-${index}`, text: `Level ${index}`, children: [node] };
  return freezeTree([node]);
}
const results = [];
function measure(fixture, operation, run) {
  run(); // Warm module/data paths before recording seven observations.
  const samples = Array.from({ length: 7 }, () => {
    const start = performance.now();
    run();
    return performance.now() - start;
  }).sort((a, b) => a - b);
  results.push({
    fixture,
    operation,
    minMs: +samples[0].toFixed(3),
    medianMs: +samples[3].toFixed(3),
    maxMs: +samples[6].toFixed(3),
  });
}
for (const count of [200, 2_000, 10_000]) {
  const nodes = wide(count),
    name = `wide-${count}`;
  const state = createOutlineEditorState(nodes);
  measure(name, "validate", () => assert.deepEqual(validateOutline(nodes), []));
  measure(name, "create-state", () => assert.equal(createOutlineEditorState(nodes).nodes, nodes));
  measure(name, "edit-last-title", () => {
    const next = reduceOutlineEditor(
      state,
      { type: "text", id: `n-${count - 1}`, text: "An updated detail" },
      { readOnly: false },
    );
    assert.equal(next.nodes.at(-1).text, "An updated detail");
    assert.equal(state.nodes, nodes);
  });
  measure(name, "indent-last-row", () => {
    const next = reduceOutlineEditor(
      state,
      { type: "indent", ids: [`n-${count - 1}`] },
      { readOnly: false },
    );
    assert.equal(next.nodes.length, count - 1);
    assert.equal(next.nodes.at(-1).children[0].id, `n-${count - 1}`);
  });
  measure(name, "canonical-roundtrip", () => {
    const roundtrip = importOutlineJSON(exportOutlineJSON(nodes));
    assert.equal(roundtrip.nodes.length, count);
    assert.equal(roundtrip.nodes.at(-1).id, `n-${count - 1}`);
  });
  const branches = branched(count),
    branchState = createOutlineEditorState(branches),
    last = count / 10 - 1;
  const moved = reduceOutlineEditor(
    branchState,
    { type: "move", ids: [`root-${last}`], direction: "up" },
    { readOnly: false },
  );
  assert.equal(moved.refusal, null);
  measure(`branched-${count}`, "new-lock-refuses-history-reparent", () => {
    const rejected = reduceOutlineEditor(
      moved,
      { type: "undo" },
      { readOnly: false, isLocked: (node) => node.id === `child-${last}-0` },
    );
    assert.ok(rejected.refusal);
    assert.equal(rejected.nodes, moved.nodes);
  });
}
for (const count of [120, 1_000]) {
  const nodes = deep(count),
    name = `deep-${count}`;
  measure(name, "iterative-validation", () => assert.deepEqual(validateOutline(nodes), []));
  measure(name, "create-state", () =>
    assert.equal(outlineIds(createOutlineEditorState(nodes).nodes).length, count),
  );
  if (count === 120)
    measure(name, "canonical-roundtrip-within-budget", () =>
      assert.equal(outlineIds(importOutlineJSON(exportOutlineJSON(nodes)).nodes).length, count),
    );
  else
    measure(name, "canonical-budget-refusal", () =>
      assert.throws(() => exportOutlineJSON(nodes), /validation budget/),
    );
}
console.log(
  JSON.stringify(
    {
      evidence:
        "Local Node model measurements only; no browser, render, physical-device or production-latency claim.",
      environment: {
        node: process.version,
        platform: platform(),
        architecture: arch(),
        cpu: cpus()[0]?.model,
      },
      methodology:
        "Frozen input trees; one warm-up then seven observations per operation; correctness assertions included. No arbitrary timing pass threshold.",
      results,
    },
    null,
    2,
  ),
);
