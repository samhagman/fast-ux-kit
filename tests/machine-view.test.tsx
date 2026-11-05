import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "./components-dom.js";
import { StrictMode } from "react";
import { renderToString } from "react-dom/server";
import type { MachineDocument, MachineInspectionSession } from "../src/core/machine/types.js";
const { act, cleanup, fireEvent, render, waitFor } = await import("@testing-library/react");
const { MachineView } = await import("../src/react/machine-view.js");
afterEach(() => cleanup());
const fixture: MachineDocument = {
  version: 1,
  rootId: "main",
  machines: [
    {
      id: "main",
      label: "Delivery",
      initialId: "idle",
      nodes: [
        { id: "idle", label: "Ready", kind: "atomic" },
        { id: "running", label: "Running", kind: "atomic" },
        { id: "done", label: "Complete", kind: "final" },
      ],
      transitions: [
        { id: "start", sourceId: "idle", targetId: "running", event: "START", actions: ["count"] },
        { id: "finish", sourceId: "running", targetId: "done", event: "FINISH" },
      ],
    },
  ],
};
const inspection: MachineInspectionSession = {
  source: "committed",
  connection: "gap",
  sequence: 12,
  cursor: "12",
  frames: [
    {
      id: "f1",
      timestamp: 1,
      actorId: "root",
      machineId: "main",
      activeIds: ["idle"],
      context: { confidential: "hidden-value" },
    },
    {
      id: "f2",
      timestamp: 2,
      actorId: "root",
      machineId: "main",
      activeIds: ["running"],
      event: { type: "START" },
    },
  ],
  diagnostics: {
    effects: [{ id: "effect", label: "Delivery effect", status: "unknown", attempts: 2 }],
    tasks: [{ id: "task", label: "Approve delivery", status: "waiting" }],
    timers: [{ id: "timer", status: "pending", event: "RETRY" }],
  },
};

test("MachineView renders deterministic SSR with named graph and native accessible controls", () => {
  const html = renderToString(<MachineView defaultValue={fixture} />);
  assert.match(html, /aria-label="Machine view"/);
  assert.match(html, /aria-label="State graph"/);
  assert.match(html, /State: Ready/);
  assert.match(html, /Transition START from Ready to Running/);
  assert.doesNotMatch(html, /NaN|Infinity/);
});

test("uncontrolled edit, undo, redo and reset are distinct reversible steps", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  fireEvent.click(view.getByRole("button", { name: "Add state" }));
  assert.ok(view.getByRole("button", { name: "State: State 3" }));
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(view.queryByRole("button", { name: "State: State 3" }), null);
  fireEvent.click(view.getByRole("button", { name: "Redo" }));
  assert.ok(view.getByRole("button", { name: "State: State 3" }));
  fireEvent.click(view.getByRole("button", { name: "Reset" }));
  assert.equal(view.queryByRole("button", { name: "State: State 3" }), null);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.ok(view.getByRole("button", { name: "State: State 3" }));
});

test("controlled edits remain proposals until the host accepts and external replacements clear history", () => {
  const proposals: MachineDocument[] = [];
  const view = render(<MachineView value={fixture} onChange={(next) => proposals.push(next)} />);
  fireEvent.click(view.getByRole("button", { name: "Add state" }));
  assert.equal(proposals.length, 1);
  assert.equal(view.queryByRole("button", { name: "State: State 3" }), null);
  assert.equal((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled, true);
  view.rerender(<MachineView value={proposals[0]} onChange={(next) => proposals.push(next)} />);
  assert.ok(view.getByRole("button", { name: "State: State 3" }));
  assert.equal((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled, false);
  view.rerender(<MachineView value={{ ...fixture }} onChange={(next) => proposals.push(next)} />);
  assert.equal((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled, true);
});

test("read-only refuses mutation controls and keyboard delete, while selecting and simulating remain available", () => {
  let changed = 0;
  const view = render(<MachineView defaultValue={fixture} readOnly onChange={() => changed++} />);
  const ready = view.getByRole("button", { name: "State: Ready" });
  fireEvent.click(ready);
  fireEvent.keyDown(ready, { key: "Delete" });
  assert.equal(changed, 0);
  assert.ok(ready.isConnected);
  assert.equal((view.getByLabelText("State name") as HTMLInputElement).disabled, true);
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  assert.ok(view.getByRole("button", { name: "START" }));
});

test("keyboard graph navigation, movement and connection commands are available without drag", () => {
  let latest = fixture;
  const view = render(<MachineView defaultValue={fixture} onChange={(next) => (latest = next)} />);
  const ready = view.getByRole("button", { name: "State: Ready" });
  fireEvent.click(ready);
  fireEvent.keyDown(ready, { key: "ArrowRight" });
  assert.equal(document.activeElement?.getAttribute("aria-label"), "State: Running");
  const running = view.getByRole("button", { name: "State: Running" });
  fireEvent.keyDown(running, { key: "ArrowDown", altKey: true });
  assert.ok(latest.machines[0]!.nodes.find((node) => node.id === "running")!.position);
  fireEvent.click(view.getByRole("button", { name: "Connect from Ready" }));
  fireEvent.click(view.getByRole("button", { name: "Connect to Complete" }));
  assert.equal(latest.machines[0]!.transitions.length, 3);
  assert.ok(view.getByLabelText("Event"));
});

test("guard status is explicit and unresolved guards cannot be enabled by UI source text", () => {
  const guarded: MachineDocument = {
    ...fixture,
    machines: [
      {
        ...fixture.machines[0]!,
        transitions: [{ ...fixture.machines[0]!.transitions[0]!, guard: "approved" }],
      },
    ],
  };
  const view = render(<MachineView defaultValue={guarded} />);
  fireEvent.click(view.getByRole("button", { name: "Transition START from Ready to Running" }));
  assert.ok(view.getByText("Unresolved guard: disabled during local simulation."));
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  assert.equal(view.queryByRole("button", { name: "START" }), null);
});

test("simulation transitions and trace scrubbing never re-execute actions", () => {
  let actions = 0;
  const view = render(
    <MachineView
      defaultValue={fixture}
      runtimeOptions={{
        actions: {
          count: (context) => {
            actions++;
            return { ...context, count: actions };
          },
        },
      }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  fireEvent.click(view.getByRole("button", { name: "START" }));
  assert.equal(actions, 1);
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
  fireEvent.click(view.getByRole("button", { name: "Replay recorded steps" }));
  const panel = view.getByRole("tabpanel");
  fireEvent.keyDown(panel, { key: "Home" });
  fireEvent.keyDown(panel, { key: "End" });
  assert.equal(actions, 1);
  fireEvent.keyDown(panel, { key: "Escape" });
  assert.equal(actions, 1);
  assert.equal(document.activeElement?.textContent, "Replay recorded steps");
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
});

test("inspection is topology-only by default and diagnostics require an explicit opt-in", () => {
  const view = render(
    <MachineView defaultValue={fixture} defaultMode="inspect" inspectionSession={inspection} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  assert.match(view.getByText(/gap · committed history/).textContent ?? "", /gap/);
  assert.equal(view.queryByText(/hidden-value/), null);
  assert.equal(view.queryByText("Delivery effect"), null);
  view.rerender(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      inspectionSession={inspection}
      showDiagnostics
    />,
  );
  assert.ok(view.getByText("Delivery effect"));
  assert.ok(view.getByText("Unknown outcome"));
  assert.ok(view.getByText("Approve delivery"));
});

test("host dispatch is explicit, blocks repeated pending requests and reports rejection without optimistic state", async () => {
  let reject!: (reason?: unknown) => void;
  let requests = 0;
  const view = render(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      inspectionSession={{ ...inspection, connection: "connected" }}
      onDispatchEvent={() => {
        requests++;
        return new Promise<void>((_, no) => {
          reject = no;
        });
      }}
    />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  fireEvent.change(view.getByLabelText("Event type"), { target: { value: "START" } });
  await act(async () =>
    fireEvent.click(view.getByRole("button", { name: "Request host dispatch" })),
  );
  assert.equal(requests, 1);
  const pending = view.getByRole("button", { name: "Request pending…" }) as HTMLButtonElement;
  assert.equal(pending.disabled, true);
  fireEvent.click(pending);
  assert.equal(requests, 1);
  await act(async () => reject(new Error("no permission")));
  assert.match(
    view.getByRole("status", { name: "Machine announcements" }).textContent ?? "",
    /Host dispatch failed/,
  );
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
});

test("invalid import is rejected and does not change graph", () => {
  let changes = 0;
  const view = render(<MachineView defaultValue={fixture} onChange={() => changes++} />);
  fireEvent.click(view.getByRole("tab", { name: "Data" }));
  fireEvent.change(view.getByLabelText("Import document JSON"), {
    target: { value: '{"version":1,"machines":[]}' },
  });
  fireEvent.click(view.getByRole("button", { name: "Import document" }));
  assert.equal(changes, 0);
  assert.ok(view.getByText("Validation"));
});

test("comma-separated action fields preserve draft separators until blur", () => {
  let latest = fixture;
  const view = render(<MachineView defaultValue={fixture} onChange={(next) => (latest = next)} />);
  fireEvent.click(view.getByRole("button", { name: "State: Ready" }));
  const field = view.getByLabelText("Entry actions (comma separated)") as HTMLInputElement;
  fireEvent.change(field, { target: { value: "first, " } });
  assert.equal(field.value, "first, ");
  fireEvent.change(field, { target: { value: "first, second" } });
  fireEvent.blur(field);
  assert.deepEqual(latest.machines[0]!.nodes[0]!.entry, ["first", "second"]);
});

test("strict mode and unknown timestamp inspection render without unsafe date errors", () => {
  const view = render(
    <StrictMode>
      <MachineView
        defaultValue={fixture}
        defaultMode="inspect"
        inspectionFrames={[{ ...inspection.frames[0]!, timestamp: 1e100 }]}
      />
    </StrictMode>,
  );
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  assert.ok(view.getByText("Unknown"));
});

function pointer(target: Element, type: string, x: number, y: number) {
  const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
  Object.defineProperty(event, "pointerId", { value: 1 });
  fireEvent(target, event);
}

test("pointer drag reparents into a container in one undoable step and cancellation is inert", async () => {
  const { layoutMachineGraph } = await import("../src/core/machine/layout.js");
  const nested: MachineDocument = {
    version: 1,
    rootId: "m",
    machines: [
      {
        id: "m",
        label: "Nested",
        nodes: [
          { id: "group", label: "Group", kind: "compound", position: { x: 100, y: 100 } },
          { id: "loose", label: "Loose", kind: "atomic", position: { x: 500, y: 100 } },
        ],
        transitions: [],
      },
    ],
  };
  let latest = nested;
  let changes = 0;
  const view = render(
    <MachineView
      defaultValue={nested}
      onChange={(next) => {
        latest = next;
        changes++;
      }}
    />,
  );
  const rects = layoutMachineGraph(nested.machines[0]!);
  const group = rects.nodes.find((node) => node.id === "group")!;
  const loose = rects.nodes.find((node) => node.id === "loose")!;
  const button = view.getByRole("button", { name: "State: Loose" });
  pointer(button, "pointerdown", loose.x + 50 + 32, loose.y + 22 + 32);
  pointer(button, "pointermove", group.x + 50 + 32, group.y + 70 + 32);
  pointer(button, "pointerup", group.x + 50 + 32, group.y + 70 + 32);
  assert.equal(latest.machines[0]!.nodes.find((node) => node.id === "loose")!.parentId, "group");
  assert.equal(changes, 1);
  fireEvent.click(view.getByRole("button", { name: "Undo" }));
  assert.equal(latest.machines[0]!.nodes.find((node) => node.id === "loose")!.parentId, undefined);
  const beforeCancel = changes;
  pointer(button, "pointerdown", 550, 120);
  pointer(button, "pointermove", 600, 200);
  pointer(button, "pointercancel", 600, 200);
  assert.equal(changes, beforeCancel);
});

test("port drag connects at the destination while an aborted port drag creates no edge", async () => {
  const { layoutMachineGraph } = await import("../src/core/machine/layout.js");
  let latest = fixture;
  const view = render(<MachineView defaultValue={fixture} onChange={(next) => (latest = next)} />);
  const rects = layoutMachineGraph(fixture.machines[0]!);
  const source = rects.nodes.find((node) => node.id === "idle")!;
  const target = rects.nodes.find((node) => node.id === "done")!;
  const port = view.getByRole("button", { name: "Connect from Ready" });
  pointer(port, "pointerdown", source.x + source.width + 32, source.y + 22 + 32);
  pointer(port, "pointermove", target.x + 20 + 32, target.y + 20 + 32);
  pointer(port, "pointerup", target.x + 20 + 32, target.y + 20 + 32);
  assert.equal(latest.machines[0]!.transitions.length, 3);
  assert.equal(latest.machines[0]!.transitions.at(-1)!.targetId, "done");
  pointer(port, "pointerdown", source.x + source.width + 32, source.y + 22 + 32);
  pointer(port, "pointermove", target.x + 20 + 32, target.y + 20 + 32);
  pointer(port, "pointercancel", target.x + 20 + 32, target.y + 20 + 32);
  assert.equal(latest.machines[0]!.transitions.length, 3);
});

test("timeline bounds disable prev and next and controlled modes reveal their relevant panel", () => {
  const view = render(
    <MachineView defaultValue={fixture} mode="edit" inspectionSession={inspection} />,
  );
  view.rerender(
    <MachineView defaultValue={fixture} mode="inspect" inspectionSession={inspection} />,
  );
  assert.ok(view.getByRole("heading", { name: "Committed observation" }));
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  assert.equal(
    (view.getByRole("button", { name: "Next recorded step" }) as HTMLButtonElement).disabled,
    true,
  );
  fireEvent.click(view.getByRole("button", { name: "First recorded step" }));
  assert.equal(
    (view.getByRole("button", { name: "Previous recorded step" }) as HTMLButtonElement).disabled,
    true,
  );
  assert.ok(view.getByRole("button", { name: "State: Ready, active" }));
  fireEvent.click(view.getByRole("button", { name: "Return to latest" }));
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
});

test("controlled host cloning an accepted proposal preserves undo history", () => {
  let next: MachineDocument | undefined;
  const view = render(
    <MachineView
      value={fixture}
      onChange={(proposal) => {
        next = structuredClone(proposal);
      }}
    />,
  );
  fireEvent.click(view.getByRole("button", { name: "Add state" }));
  view.rerender(<MachineView value={next} />);
  assert.equal((view.getByRole("button", { name: "Undo" }) as HTMLButtonElement).disabled, false);
});

test("retained history pruning never silently substitutes a latest frame under a historical caption", () => {
  const view = render(
    <MachineView defaultValue={fixture} defaultMode="inspect" inspectionSession={inspection} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: "First recorded step" }));
  view.rerender(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      inspectionSession={{ ...inspection, frames: [inspection.frames[1]!] }}
    />,
  );
  assert.equal(view.queryByRole("button", { name: "State: Running, active" }), null);
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  assert.match(view.getByRole("alert").textContent ?? "", /no longer available/);
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: "Return to latest" }));
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
});

test("deleting a focused graph item restores focus to the graph region", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  const ready = view.getByRole("button", { name: "State: Ready" });
  ready.focus();
  fireEvent.click(ready);
  fireEvent.keyDown(ready, { key: "Delete" });
  assert.equal(document.activeElement, view.getByRole("region", { name: "State graph" }));
});

test("replay scrubbing does not evaluate guard callbacks or dispatch through submitted forms", () => {
  let guards = 0;
  const guarded: MachineDocument = {
    ...fixture,
    machines: [
      {
        ...fixture.machines[0]!,
        transitions: [
          { ...fixture.machines[0]!.transitions[0]!, guard: "allow" },
          fixture.machines[0]!.transitions[1]!,
        ],
      },
    ],
  };
  const options = {
    guards: {
      allow: () => {
        guards++;
        return true;
      },
    },
  };
  const view = render(<MachineView defaultValue={guarded} runtimeOptions={options} />);
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  fireEvent.click(view.getByRole("button", { name: "Replay recorded steps" }));
  const before = guards;
  fireEvent.keyDown(view.getByRole("tabpanel"), { key: "Home" });
  fireEvent.keyDown(view.getByRole("tabpanel"), { key: "End" });
  assert.equal(guards, before);
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  fireEvent.change(view.getByLabelText("Event type"), { target: { value: "START" } });
  fireEvent.submit(view.getByRole("button", { name: "Send event" }).closest("form")!);
  assert.ok(view.getByRole("button", { name: "State: Ready, active" }));
  assert.equal(guards, before);
});

test("malformed external documents show a recoverable validation alert instead of throwing", () => {
  const view = render(
    <MachineView
      value={{ version: 1, rootId: "bad", machines: [{}] } as unknown as MachineDocument}
    />,
  );
  assert.ok(view.getByRole("alert"));
  view.rerender(<MachineView value={fixture} />);
  assert.ok(view.getByRole("button", { name: "State: Ready" }));
});

test("notes can attach to an atomic state without becoming runtime children", () => {
  let next = fixture;
  const view = render(
    <MachineView defaultValue={fixture} onChange={(document) => (next = document)} />,
  );
  fireEvent.click(view.getByRole("button", { name: "State: Ready" }));
  fireEvent.click(view.getByRole("button", { name: "Add note" }));
  const note = next.machines[0]!.nodes.find((node) => node.kind === "note")!;
  assert.equal(note.attachedToId, "idle");
  assert.equal(note.parentId, undefined);
  assert.equal((view.getByLabelText("Attached state") as HTMLSelectElement).value, "idle");
});

test("eligible graph transitions offer explicit event dispatch without forcing an edge", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  fireEvent.click(view.getByRole("button", { name: "Transition START from Ready to Running" }));
  fireEvent.click(view.getByRole("button", { name: "Send START" }));
  assert.ok(view.getByRole("button", { name: "State: Running, active" }));
});

test("diagnostic display is bounded and cycle safe without invoking accessors", () => {
  let getterCalls = 0;
  const context: Record<string, unknown> = { long: "x".repeat(20000) };
  context.self = context;
  Object.defineProperty(context, "secretGetter", {
    enumerable: true,
    get() {
      getterCalls++;
      return "never";
    },
  });
  const view = render(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      showDiagnostics
      inspectionFrames={[{ ...inspection.frames[0]!, context }]}
    />,
  );
  assert.ok(view.getByText(/Circular reference/));
  assert.equal(getterCalls, 0);
  const pre = view.container.querySelector("pre")!;
  assert.ok(pre.textContent!.length < 16050);
  assert.match(pre.textContent!, /truncated/);
});

test("disconnected and simulated observations never authorize host dispatch", () => {
  let calls = 0;
  const view = render(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      inspectionSession={inspection}
      onDispatchEvent={() => {
        calls++;
      }}
    />,
  );
  fireEvent.change(view.getByLabelText("Event type"), { target: { value: "START" } });
  fireEvent.submit(view.getByRole("button", { name: "Request host dispatch" }).closest("form")!);
  assert.equal(calls, 0);
  assert.ok(view.getByText(/Dispatch unavailable while gap/));
  view.rerender(
    <MachineView
      defaultValue={fixture}
      defaultMode="inspect"
      inspectionSession={{ ...inspection, source: "simulation", connection: "connected" }}
      onDispatchEvent={() => {
        calls++;
      }}
    />,
  );
  fireEvent.submit(view.getByRole("button", { name: "Request host dispatch" }).closest("form")!);
  assert.equal(calls, 0);
  assert.ok(view.getByText("Dispatch unavailable from a simulation recording."));
});

test("simulation context stays private unless diagnostics are explicitly enabled", () => {
  const view = render(
    <MachineView
      defaultValue={fixture}
      defaultMode="simulate"
      initialContext={{ privateValue: "never-show-by-default" }}
    />,
  );
  assert.equal(view.queryByText(/never-show-by-default/), null);
  view.rerender(
    <MachineView
      defaultValue={fixture}
      defaultMode="simulate"
      initialContext={{ privateValue: "never-show-by-default" }}
      showDiagnostics
    />,
  );
  assert.ok(view.getByText(/never-show-by-default/));
});

test("StrictMode initial simulation does not duplicate entry actions or snapshot notifications", () => {
  let actions = 0;
  let notifications = 0;
  const entry: MachineDocument = {
    ...fixture,
    machines: [
      {
        ...fixture.machines[0]!,
        nodes: fixture.machines[0]!.nodes.map((node) =>
          node.id === "idle" ? { ...node, entry: ["entry"] } : node,
        ),
      },
    ],
  };
  render(
    <StrictMode>
      <MachineView
        defaultValue={entry}
        defaultMode="simulate"
        runtimeOptions={{
          actions: {
            entry: (context) => {
              actions++;
              return context;
            },
          },
        }}
        onSnapshotChange={() => notifications++}
      />
    </StrictMode>,
  );
  assert.equal(actions, 1);
  assert.equal(notifications, 1);
});

test("details collapse retains selection and deliberate selection details reopen it", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  fireEvent.click(view.getByRole("button", { name: "State: Ready" }));
  const hide = view.getByRole("button", { name: "Hide details" });
  assert.equal(hide.getAttribute("aria-expanded"), "true");
  fireEvent.click(hide);
  assert.equal(view.queryByRole("complementary", { name: "Machine inspector" }), null);
  assert.equal(
    view.getByRole("button", { name: "State: Ready" }).getAttribute("aria-pressed"),
    "true",
  );
  assert.equal(
    view.getByRole("button", { name: "Show details" }).getAttribute("aria-expanded"),
    "false",
  );
  fireEvent.click(view.getByRole("button", { name: "Show selection details" }));
  assert.ok(view.getByRole("complementary", { name: "Machine inspector" }));
  assert.equal((view.getByLabelText("State name") as HTMLInputElement).value, "Ready");
});

test("host-disabled inspector cannot be opened by local controls or mode changes", () => {
  const view = render(<MachineView defaultValue={fixture} showInspector={false} />);
  fireEvent.click(view.getByRole("button", { name: "State: Ready" }));
  assert.equal(view.queryByRole("button", { name: "Show selection details" }), null);
  assert.equal(view.queryByRole("button", { name: "Hide details" }), null);
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  assert.equal(view.queryByRole("complementary", { name: "Machine inspector" }), null);
});

test("focus selection restores readable scale without changing the document", () => {
  let changes = 0;
  const view = render(<MachineView defaultValue={fixture} onChange={() => changes++} />);
  assert.equal(view.queryByRole("button", { name: "Focus selection" }), null);
  fireEvent.click(view.getByRole("button", { name: "Zoom out" }));
  fireEvent.click(view.getByRole("button", { name: "State: Ready" }));
  fireEvent.click(view.getByRole("button", { name: "Focus selection" }));
  assert.equal(view.getByLabelText("Zoom level").textContent, "100%");
  assert.equal(document.activeElement, view.getByRole("button", { name: "State: Ready" }));
  assert.equal(changes, 0);
});

test("validation and runtime navigation deliberately reopen collapsed details", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  fireEvent.click(view.getByRole("button", { name: "Hide details" }));
  fireEvent.click(view.getByRole("button", { name: "Show 0 validation issues" }));
  assert.ok(view.getByRole("heading", { name: "Validation" }));
  fireEvent.click(view.getByRole("button", { name: "Hide details" }));
  fireEvent.click(view.getByRole("button", { name: "Simulate" }));
  assert.ok(view.getByRole("heading", { name: "Local simulation" }));
});
