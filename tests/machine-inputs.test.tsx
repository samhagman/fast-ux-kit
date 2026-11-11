import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import "./components-dom.js";
import * as React from "react";
import {
  createMachineSnapshot,
  describeMachinePayload,
  machineEventInputs,
  machineEventOptions,
  type MachineDocument,
  type MachineRuntimeOptions,
  type MachineScenario,
} from "../src/core/machine/index.js";
import { useMachineGraph } from "../src/machine-graph/use-machine-graph.js";
import { MachineContext } from "../src/machine-graph/machine-context.js";
import { RunPanel } from "../src/machine-graph/run-panel.js";
const { act, cleanup, fireEvent, render, renderHook } = await import("@testing-library/react");
afterEach(cleanup);

// A review that only a payload can approve, next to an event that needs nothing.
const doc: MachineDocument = {
  version: 1,
  rootId: "m",
  machines: [
    {
      id: "m",
      label: "Release",
      initialId: "review",
      nodes: [
        { id: "review", label: "Review", kind: "atomic" },
        { id: "publishing", label: "Publishing", kind: "atomic" },
        { id: "declined", label: "Declined", kind: "final" },
      ],
      transitions: [
        {
          id: "decide",
          sourceId: "review",
          targetId: "publishing",
          event: "DECIDE",
          guard: "approved",
        },
        { id: "decline", sourceId: "review", targetId: "declined", event: "DECLINE" },
      ],
    },
  ],
};
const graph = doc.machines[0]!;
const runtime: MachineRuntimeOptions = {
  guards: { approved: (_c, e) => (e.payload as { approved?: boolean })?.approved === true },
  guardDescriptions: { approved: () => "the reviewer has to approve" },
};
const scenarios: readonly MachineScenario[] = [
  { id: "yes", label: "Approved", events: [{ type: "DECIDE", payload: { approved: true } }] },
  { id: "no", label: "Refused", events: [{ type: "DECIDE", payload: { approved: false } }] },
  {
    id: "again",
    label: "Approved twice",
    events: [{ type: "DECIDE", payload: { approved: true } }],
  },
  { id: "out", label: "Declined", events: [{ type: "DECLINE" }] },
];

test("a payload is described the way a person would say it", () => {
  assert.equal(describeMachinePayload(undefined), "no payload");
  assert.equal(describeMachinePayload({}), "empty payload");
  assert.equal(describeMachinePayload({ approved: true }), "approved: true");
  assert.equal(describeMachinePayload({ by: "sam", score: 0.9 }), 'by: "sam", score: 0.9');
  assert.equal(describeMachinePayload({ nested: { a: 1 } }), '{"nested":{"a":1}}');
  assert.equal(describeMachinePayload(3), "3");
  assert.ok(describeMachinePayload({ note: "x".repeat(200) }).length <= 48);
});

test("known inputs come from the host first, then from each distinct scenario payload", () => {
  // Scenarios alone: two distinct payloads, no padding with a bare event nobody specified.
  assert.deepEqual(
    machineEventInputs("DECIDE", { scenarios }).map((input) => [input.label, input.source]),
    [
      ["approved: true", "scenario"],
      ["approved: false", "scenario"],
    ],
  );
  // An event a scenario sends bare is offered bare, and an unknown event falls back to bare.
  assert.deepEqual(machineEventInputs("DECLINE", { scenarios }), [
    { label: "no payload", source: "empty" },
  ]);
  assert.deepEqual(machineEventInputs("NOPE", { scenarios }), [
    { label: "no payload", source: "empty" },
  ]);
  // The host's own declaration leads, keeps its label, and is not repeated by a scenario.
  const declared = machineEventInputs("DECIDE", {
    scenarios,
    runtime: { eventInputs: { DECIDE: [{ label: "Approve", payload: { approved: true } }] } },
  });
  assert.deepEqual(
    declared.map((input) => [input.label, input.source]),
    [
      ["Approve", "declared"],
      ["approved: false", "scenario"],
    ],
  );
  // A prototype key is not a declaration.
  assert.equal(machineEventInputs("constructor", { runtime: { eventInputs: {} } }).length, 1);
});

test("each input is tried against the snapshot: where it leads, or why it is refused", () => {
  const snapshot = createMachineSnapshot(doc, "m", {}, runtime);
  const options = machineEventOptions(
    doc,
    graph,
    snapshot,
    "DECIDE",
    machineEventInputs("DECIDE", { scenarios }),
    runtime,
  );
  assert.deepEqual(options[0]?.preview?.transitionIds, ["decide"]);
  assert.equal(options[0]?.reason, undefined);
  assert.equal(options[1]?.preview, undefined);
  assert.equal(options[1]?.reason, "the reviewer has to approve");
  // Trying inputs sends nothing.
  assert.equal(snapshot.sequence, 0);
  assert.deepEqual(snapshot.activeIds, ["review"]);
});

test("the view offers a guarded transition through its known input instead of a refused click", async () => {
  const hook = renderHook(() => useMachineGraph({ defaultDocument: doc, runtime, scenarios }));
  await act(async () => hook.result.current.start());
  const mv = () => hook.result.current;
  // Bare, DECIDE is blocked; with a known input it is available. The canvas shows it as offered.
  assert.deepEqual([...mv().candidates.blocked], ["decide"]);
  assert.deepEqual([...mv().candidates.offered], ["decide"]);
  assert.deepEqual([...mv().candidates.enabled], ["decline"]);
  assert.deepEqual(
    mv()
      .eventOptions("DECIDE")
      .map((option) => [option.label, !!option.preview]),
    [
      ["approved: true", true],
      ["approved: false", false],
    ],
  );
  // A refused input is still sendable, and is recorded as a refusal.
  await act(async () => void mv().sendEvent("DECIDE", { payload: { approved: false } }));
  assert.deepEqual(mv().snapshot?.activeIds, ["review"]);
  assert.equal(mv().blocked.at(-1)?.reason, "the reviewer has to approve");
  // The chosen input is what is sent, whatever is typed in the custom payload box.
  await act(async () => mv().sim.setPayloadText("{ not json"));
  await act(async () => void mv().sendEvent("DECIDE", { payload: { approved: true } }));
  assert.deepEqual(mv().snapshot?.activeIds, ["publishing"]);
  assert.deepEqual(mv().steps.current.get(mv().snapshot!.trace.at(-1)!.sequence)?.payload, {
    approved: true,
  });
  assert.deepEqual([...mv().candidates.offered], []);
});

function Panel() {
  const mv = useMachineGraph({ defaultDocument: doc, runtime, scenarios });
  return (
    <MachineContext.Provider value={mv}>
      <RunPanel />
    </MachineContext.Provider>
  );
}

test("the Run panel lists a guarded event's inputs, and one click sends the one that passes", () => {
  const view = render(<Panel />);
  fireEvent.click(view.getByRole("button", { name: /Start simulation/ }));
  const group = view.getByRole("group", { name: "Send DECIDE" });
  const choices = Array.from(group.querySelectorAll("[data-mv-choice]"));
  assert.deepEqual(
    choices.map((choice) => [choice.getAttribute("data-mv-choice"), choice.textContent]),
    [
      ["passes", "approved: truePublishing"],
      ["blocked", "approved: falseblockedthe reviewer has to approve"],
    ],
  );
  // No JSON box until it is asked for.
  assert.equal(view.container.querySelector("textarea"), null);
  // The unguarded event stays a single row.
  assert.equal(view.queryByRole("group", { name: "Send DECLINE" }), null);
  fireEvent.click(choices[0]!);
  assert.equal(view.queryByRole("group", { name: "Send DECIDE" }), null);
  assert.match(view.container.textContent ?? "", /Publishing/);
});

test("a custom payload is still there for anything the specification does not cover", () => {
  const view = render(<Panel />);
  fireEvent.click(view.getByRole("button", { name: /Start simulation/ }));
  const group = view.getByRole("group", { name: "Send DECIDE" });
  fireEvent.click(view.getByRole("button", { name: "Custom payload" }));
  const field = group.querySelector("textarea")!;
  const status = () => group.querySelector('[role="status"]')?.textContent;
  assert.equal(status(), "Blocked: the reviewer has to approve.");
  fireEvent.change(field, { target: { value: "{ nope" } });
  assert.equal(status(), "Payload is not valid JSON.");
  fireEvent.change(field, { target: { value: '{"approved": true}' } });
  assert.equal(status(), "Goes to Publishing.");
  fireEvent.click(view.getByRole("button", { name: "Send" }));
  assert.equal(view.queryByRole("group", { name: "Send DECIDE" }), null);
});
