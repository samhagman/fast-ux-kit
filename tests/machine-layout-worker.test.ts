import test from "node:test";
import assert from "node:assert/strict";
import { createMachineLayoutEngine } from "../src/machine-graph/layout-worker.js";

test("layout worker is lazy, correlates concurrent responses and releases only its owned worker", async () => {
  const messages: { id: number; graph: { id: string } }[] = [];
  let created = 0,
    terminated = 0;
  const worker = {
    onmessage: null as ((event: { data: unknown }) => void) | null,
    onerror: null,
    onmessageerror: null,
    postMessage(message: (typeof messages)[number]) {
      messages.push(message);
    },
    terminate() {
      terminated++;
    },
  };
  const engine = createMachineLayoutEngine({
    createWorker: () => {
      created++;
      return worker as unknown as Worker;
    },
  });
  assert.equal(created, 0);
  const a = engine.layout({ id: "a" });
  const b = engine.layout({ id: "b" });
  assert.equal(created, 1);
  assert.equal(messages.length, 2);
  worker.onmessage!({ data: { id: messages[1]!.id, graph: { id: "b", width: 20 } } });
  worker.onmessage!({ data: { id: messages[0]!.id, graph: { id: "a", width: 10 } } });
  assert.equal((await a).width, 10);
  assert.equal((await b).width, 20);
  engine.dispose();
  assert.equal(terminated, 1);
});
test("disposing in-flight layout rejects it without starting main-thread work", async () => {
  let terminate = 0;
  const engine = createMachineLayoutEngine({
    createWorker: () =>
      ({
        postMessage() {},
        terminate() {
          terminate++;
        },
      }) as unknown as Worker,
  });
  const pending = engine.layout({ id: "root" });
  engine.dispose();
  await assert.rejects(pending, /released/);
  assert.equal(terminate, 1);
});
test("unavailable worker has an operational lazy fallback", async () => {
  const engine = createMachineLayoutEngine({
    createWorker: () => {
      throw new Error("blocked by host policy");
    },
  });
  const result = await engine.layout({
    id: "root",
    children: [{ id: "state", width: 80, height: 40 }],
  });
  assert.ok(result.children?.[0]?.x !== undefined);
  engine.dispose();
});
