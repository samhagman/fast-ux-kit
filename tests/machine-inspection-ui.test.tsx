import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "./components-dom.js";
import * as React from "react";
import type { MachineDocument, MachineInspectionSession } from "../src/core/machine/index.js";
import {
  useMachineInspection,
  type MachineInspectionProps,
} from "../src/machine-shared/use-machine-inspection.js";
import { MachineInspectionPanel } from "../src/machine-shared/machine-inspection-panel.js";
const { render, cleanup, fireEvent, act } = await import("@testing-library/react");
afterEach(cleanup);
const doc: MachineDocument = {
  version: 1,
  rootId: "orders",
  machines: [
    {
      id: "orders",
      label: "Orders",
      nodes: [
        { id: "waiting", label: "Waiting", kind: "atomic" },
        { id: "done", label: "Done", kind: "final" },
      ],
      transitions: [],
    },
  ],
};
const session: MachineInspectionSession = {
  id: "run",
  source: "committed",
  connection: "connected",
  frames: [
    {
      id: "old",
      actorId: "order",
      machineId: "orders",
      timestamp: 1,
      activeIds: ["waiting"],
      status: "waiting",
      context: { count: 1 },
      work: [{ id: "approval", kind: "task", label: "Old approval", status: "waiting" }],
    },
    {
      id: "new",
      actorId: "order",
      machineId: "orders",
      timestamp: 2,
      activeIds: ["done"],
      status: "done",
      context: { count: 2 },
      work: [],
    },
  ],
};
function Harness(props: MachineInspectionProps) {
  const i = useMachineInspection(doc, props);
  return (
    <>
      <div data-testid="active">{[...i.activeSet].join(",")}</div>
      <MachineInspectionPanel inspection={i} />
    </>
  );
}
test("historical selection pins facts as updates arrive and eviction stays explicit", () => {
  const v = render(<Harness inspectionSession={session} showDiagnostics />);
  fireEvent.click(v.getByRole("button", { name: /waiting · old/ }));
  assert.equal(v.getByTestId("active").textContent, "waiting");
  assert.ok(v.getByText("Old approval"));
  v.rerender(
    <Harness
      inspectionSession={{
        ...session,
        frames: [...session.frames, { ...session.frames[1]!, id: "later" }],
      }}
      showDiagnostics
    />,
  );
  assert.equal(v.getByTestId("active").textContent, "waiting");
  v.rerender(
    <Harness inspectionSession={{ ...session, frames: session.frames.slice(1) }} showDiagnostics />,
  );
  assert.match(v.getByRole("status").textContent!, /unavailable/);
  assert.equal(v.queryByText("Old approval"), null);
  fireEvent.click(v.getByRole("button", { name: "Return to latest" }));
  assert.equal(v.getByTestId("active").textContent, "done");
});
test("controlled history refusal is respected and metadata is opt-in", () => {
  const proposals: (string | null)[] = [];
  const v = render(
    <Harness
      inspectionSession={session}
      inspectionFrameId={null}
      onInspectionFrameChange={(id) => proposals.push(id)}
    />,
  );
  fireEvent.click(v.getByRole("button", { name: /waiting · old/ }));
  assert.equal(proposals.length, 1);
  assert.equal(v.getByTestId("active").textContent, "done");
  assert.equal(v.queryByText("Context"), null);
  assert.equal(v.queryByText("Old approval"), null);
});
test("optional actions deduplicate, wait for observations and cannot change observed state", async () => {
  let calls = 0;
  let resolve!: () => void;
  const handler = () => {
    calls++;
    return new Promise<void>((r) => (resolve = r));
  };
  const props = {
    inspectionSession: session,
    inspectionActions: [{ id: "approve", label: "Approve" }],
    onInspectionAction: handler,
  };
  const v = render(<Harness {...props} />);
  const button = v.getByRole("button", { name: "Approve" });
  fireEvent.click(button);
  fireEvent.click(button);
  assert.equal(calls, 1);
  await act(async () => resolve());
  assert.match(v.getByRole("status").textContent!, /Waiting for an observation/);
  assert.equal(v.getByTestId("active").textContent, "done");
  assert.equal(button.getAttribute("aria-disabled"), "true");
  v.rerender(
    <Harness
      {...props}
      inspectionSession={{
        ...session,
        frames: [...session.frames, { ...session.frames[1]!, id: "confirmed" }],
      }}
    />,
  );
  assert.equal(v.getByRole("button", { name: "Approve" }).getAttribute("aria-disabled"), "false");
});
test("historical, disconnected and simulation feeds block live actions", () => {
  let calls = 0;
  const props = {
    inspectionSession: session,
    inspectionActions: [{ id: "retry", label: "Retry" }],
    onInspectionAction: () => {
      calls++;
    },
  };
  const v = render(<Harness {...props} inspectionFrameId="old" />);
  fireEvent.click(v.getByRole("button", { name: "Retry" }));
  assert.equal(calls, 0);
  for (const s of [
    { ...session, connection: "stale" as const },
    { ...session, source: "simulation" as const },
  ]) {
    v.rerender(<Harness {...props} inspectionSession={s} />);
    fireEvent.click(v.getByRole("button", { name: "Retry" }));
  }
  assert.equal(calls, 0);
});
test("version mismatch suppresses highlights and old pending work never leaks into history", () => {
  const versioned = {
    ...session,
    frames: session.frames.map((f) => ({ ...f, machineVersion: 2 })),
  };
  const v = render(
    <Harness
      inspectionSession={versioned}
      presentation={{ machineVersions: { orders: 1 } }}
      showDiagnostics
    />,
  );
  assert.equal(v.getByTestId("active").textContent, "");
  assert.match(v.getByRole("status").textContent!, /does not match/);
  assert.equal(v.queryByText("Old approval"), null);
});
test("unmount aborts an action and late completion is ignored", async () => {
  let signal: AbortSignal | undefined;
  let reject!: (e: Error) => void;
  const v = render(
    <Harness
      inspectionSession={session}
      inspectionActions={[{ id: "go", label: "Go" }]}
      onInspectionAction={(_id, _frame, r) => {
        signal = r.signal;
        return new Promise((_resolve, r) => (reject = r));
      }}
    />,
  );
  fireEvent.click(v.getByRole("button", { name: "Go" }));
  v.unmount();
  assert.equal(signal?.aborted, true);
  await act(async () => reject(new Error("late rejection")));
});

test("retained custom submit callbacks cannot act on a superseded observation; stale feeds abort requests", () => {
  let submit: (() => void) | undefined;
  let signal: AbortSignal | undefined;
  let calls = 0;
  const props: MachineInspectionProps = {
    inspectionSession: session,
    inspectionActions: [{ id: "approve", label: "Approve" }],
    renderInspectionAction: (args) => {
      submit = args.submit;
      return <button aria-disabled={args.disabled}>Custom approval</button>;
    },
    onInspectionAction: (_id, _frame, request) => {
      calls++;
      signal = request.signal;
      return new Promise<void>(() => {});
    },
  };
  const view = render(<Harness {...props} />);
  const retained = submit!;
  const updated = {
    ...session,
    frames: [...session.frames, { ...session.frames[1]!, id: "newer" }],
  };
  view.rerender(<Harness {...props} inspectionSession={updated} />);
  act(() => retained());
  assert.equal(calls, 0);
  act(() => submit!());
  assert.equal(calls, 1);
  view.rerender(<Harness {...props} inspectionSession={{ ...updated, connection: "stale" }} />);
  assert.equal(signal?.aborted, true);
});

test("retained custom submit is refused after history navigation, eligibility changes and unmount", () => {
  let submit: (() => void) | undefined;
  let calls = 0;
  const props: MachineInspectionProps = {
    inspectionSession: session,
    inspectionActions: [{ id: "retry", label: "Retry" }],
    onInspectionAction: () => {
      calls++;
    },
    renderInspectionAction: (args) => {
      submit = args.submit;
      return <button>Retry with input</button>;
    },
  };
  const view = render(<Harness {...props} />);
  const retained = submit!;
  view.rerender(<Harness {...props} inspectionFrameId="old" />);
  act(() => retained());
  assert.equal(calls, 0);
  view.rerender(
    <Harness
      {...props}
      inspectionSession={{
        ...session,
        frames: session.frames.map((f) => ({ ...f, machineId: "unavailable" })),
      }}
    />,
  );
  act(() => retained());
  assert.equal(calls, 0);
  view.rerender(<Harness {...props} onInspectionAction={undefined} />);
  act(() => retained());
  assert.equal(calls, 0);
  view.rerender(<Harness {...props} />);
  view.unmount();
  act(() => retained());
  assert.equal(calls, 0);
});
