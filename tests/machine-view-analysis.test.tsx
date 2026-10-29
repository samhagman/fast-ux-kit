import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import "./components-dom.js";
import type { MachineDocument, MachineInspectionFrame } from "../src/core/machine/types.js";
const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { MachineView } = await import("../src/react/machine-view.js");
afterEach(() => cleanup());

test("historical frame sequence is distinct from the latest session sequence and cursor", () => {
  const view = render(
    <MachineView
      defaultValue={fixture}
      mode="inspect"
      inspectionSession={{
        source: "committed",
        connection: "connected",
        sequence: 14,
        cursor: "cursor-14",
        frames: [frame("historical", { sequence: 11 }), frame("latest", { sequence: 14 })],
      }}
    />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /TICK historical/ }));
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  assert.equal(view.getByText("Frame sequence").nextElementSibling?.textContent, "11");
  assert.equal(view.getByText("Session sequence").nextElementSibling?.textContent, "14");
  assert.equal(view.getByText("Session cursor").nextElementSibling?.textContent, "cursor-14");
  assert.equal(view.queryByText("Sequence", { exact: true }), null);
  assert.equal(view.queryByText("Cursor", { exact: true }), null);
});
const fixture: MachineDocument = {
  version: 1,
  rootId: "main",
  machines: [
    {
      id: "main",
      label: "Main",
      initialId: "ready",
      nodes: [
        { id: "ready", label: "Ready", kind: "atomic" },
        { id: "child", label: "Child", kind: "submachine", machineId: "nested" },
      ],
      transitions: [],
    },
    {
      id: "nested",
      label: "Nested",
      initialId: "nested-ready",
      nodes: [
        { id: "nested-ready", label: "Nested ready", kind: "atomic" },
        { id: "done", label: "Nested done", kind: "final" },
      ],
      transitions: [
        { id: "finish", sourceId: "nested-ready", targetId: "done", event: "FINISH_NESTED" },
      ],
    },
  ],
};
function frame(id: string, options: Partial<MachineInspectionFrame> = {}): MachineInspectionFrame {
  return {
    id,
    timestamp: 1,
    actorId: "actor",
    machineId: "main",
    activeIds: ["ready"],
    status: "running",
    event: { type: "TICK" },
    ...options,
  };
}
const first = frame("f1", {
  context: { privateKey: "before" },
  event: { type: "START", payload: { privatePayload: "payload-secret" } },
});
const second = frame("f2", { context: { privateKey: "after" } });

test("Find keyboard selects a stable cross-machine identity at readable scale without mutation", () => {
  let changed = 0;
  const view = render(<MachineView defaultValue={fixture} readOnly onChange={() => changed++} />);
  fireEvent.click(view.getByRole("button", { name: "Zoom out" }));
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  const input = view.getByRole("searchbox", { name: "Find state or transition" });
  assert.equal(document.activeElement, input);
  fireEvent.change(input, { target: { value: "Nested ready" } });
  fireEvent.keyDown(input, { key: "Enter" });
  assert.equal(document.activeElement, view.getByRole("button", { name: "State: Nested ready" }));
  assert.equal(view.getByLabelText("Zoom level").textContent, "100%");
  assert.equal(changed, 0);
});

test("Find Escape restores its invoking tab; transition results focus the real transition", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  fireEvent.keyDown(view.getByRole("searchbox"), { key: "Escape" });
  assert.equal(document.activeElement, view.getByRole("tab", { name: "Find" }));
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "FINISH_NESTED" } });
  fireEvent.keyDown(view.getByRole("searchbox"), { key: "Enter" });
  assert.equal(
    document.activeElement,
    view.getByRole("button", { name: "Transition FINISH_NESTED from Nested ready to Nested done" }),
  );
});

test("Find renders at most 50 matches and does not search host diagnostics", () => {
  const many: MachineDocument = {
    version: 1,
    rootId: "main",
    machines: [
      {
        id: "main",
        label: "Main",
        nodes: Array.from({ length: 70 }, (_, i) => ({
          id: `n${i}`,
          label: `Match ${i}`,
          kind: "atomic" as const,
        })),
        transitions: [],
      },
    ],
  };
  const view = render(
    <MachineView defaultValue={many} mode="inspect" inspectionFrames={[first]} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "Match" } });
  assert.equal(view.container.querySelectorAll(".fux-machine__search-results li").length, 50);
  assert.match(view.getByRole("tabpanel").textContent ?? "", /limit 50/);
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "privateKey" } });
  assert.ok(view.getByText("No topology matches."));
  assert.doesNotMatch(view.getByRole("tabpanel").textContent ?? "", /payload-secret|before/);
});

test("timeline filters pin historical identity across append and preserve full-history navigation", () => {
  let dispatched = 0;
  const props = {
    defaultValue: fixture,
    mode: "inspect" as const,
    onDispatchEvent: () => {
      dispatched++;
    },
  };
  const view = render(<MachineView {...props} inspectionFrames={[first, second]} />);
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /START f1/ }));
  fireEvent.change(view.getByLabelText("Filter observations by event, frame ID or status"), {
    target: { value: "f2" },
  });
  assert.ok(view.getByText("Selected observation (outside filter)"));
  view.rerender(<MachineView {...props} inspectionFrames={[first, second, frame("f3")]} />);
  assert.match(view.container.querySelector(".fux-machine__pinned-frame")?.textContent ?? "", /f1/);
  fireEvent.click(view.getByRole("button", { name: "Next recorded step" }));
  assert.equal(view.queryByText("Selected observation (outside filter)"), null);
  assert.equal(view.getByRole("button", { name: /TICK f2/ }).getAttribute("aria-pressed"), "true");
  fireEvent.change(view.getByLabelText("Filter observations by event, frame ID or status"), {
    target: { value: "no-match" },
  });
  assert.ok(view.getByText("No observations match this filter."));
  fireEvent.click(view.getByRole("button", { name: "Clear observation filter" }));
  assert.equal(view.queryByText("No observations match this filter."), null);
  assert.equal(dispatched, 0);
});

test("eviction never substitutes another actor with an identical frame ID", () => {
  const view = render(
    <MachineView defaultValue={fixture} mode="inspect" inspectionFrames={[first, second]} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /START f1/ }));
  view.rerender(
    <MachineView
      defaultValue={fixture}
      mode="inspect"
      inspectionFrames={[frame("f1", { actorId: "other" })]}
    />,
  );
  assert.match(view.getByRole("alert").textContent ?? "", /Selected observation f1 is unavailable/);
  assert.equal(view.queryByRole("button", { name: /TICK f1/ }), null);
});

test("diagnostics are opt-in and compare only previous retained same actor and machine", () => {
  const frames = [
    first,
    frame("unrelated", { actorId: "other", context: { unrelatedSecret: true } }),
    second,
  ];
  const view = render(
    <MachineView defaultValue={fixture} mode="inspect" inspectionFrames={frames} />,
  );
  assert.doesNotMatch(
    view.container.textContent ?? "",
    /privateKey|privatePayload|unrelatedSecret|Context comparison/,
  );
  view.rerender(
    <MachineView defaultValue={fixture} mode="inspect" inspectionFrames={frames} showDiagnostics />,
  );
  assert.ok(view.getByText("Before: f1 · After: f2"));
  assert.match(view.container.textContent ?? "", /privateKey/);
  assert.doesNotMatch(view.container.textContent ?? "", /unrelatedSecret/);
  assert.match(view.container.textContent ?? "", /continuity|Continuity/);
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /START f1/ }));
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  assert.match(view.container.textContent ?? "", /payload-secret/);
  assert.ok(view.getByText("Context comparison unavailable."));
});

test("omitted context and payload are unavailable rather than synthetic empty objects", () => {
  const view = render(
    <MachineView
      defaultValue={fixture}
      mode="inspect"
      inspectionFrames={[first, frame("missing")]}
      showDiagnostics
    />,
  );
  assert.ok(view.getByText("Context unavailable for this observation."));
  assert.ok(view.getByText("Event payload unavailable for this observation."));
  assert.ok(view.getByText("Context comparison unavailable."));
});

test("diagnostic display never evaluates omitted accessor values", () => {
  let reads = 0;
  const event = { type: "TICK" };
  Object.defineProperty(event, "payload", {
    get() {
      reads++;
      throw new Error("Do not evaluate");
    },
  });
  const observed = frame("accessor", { event });
  Object.defineProperty(observed, "context", {
    get() {
      reads++;
      throw new Error("Do not evaluate");
    },
  });
  const view = render(
    <MachineView
      defaultValue={fixture}
      mode="inspect"
      inspectionFrames={[first, observed]}
      showDiagnostics
    />,
  );
  assert.ok(view.getByText("Context unavailable for this observation."));
  assert.ok(view.getByText("Event payload unavailable for this observation."));
  assert.equal(reads, 0);
});

test("same-actor reused frame ID in another machine does not replace a historical selection", () => {
  const view = render(
    <MachineView defaultValue={fixture} mode="inspect" inspectionFrames={[first, second]} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /START f1/ }));
  view.rerender(
    <MachineView
      defaultValue={fixture}
      mode="inspect"
      inspectionFrames={[frame("f1", { machineId: "nested", activeIds: ["nested-ready"] })]}
    />,
  );
  assert.match(view.getByRole("alert").textContent ?? "", /Selected observation f1 is unavailable/);
});

test("Find can focus a result while controlled selection remains host-owned", () => {
  const proposals: (readonly string[])[] = [];
  const view = render(
    <MachineView
      defaultValue={fixture}
      selectedIds={[]}
      onSelectionChange={(ids) => proposals.push(ids)}
    />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  fireEvent.change(view.getByRole("searchbox"), { target: { value: "Ready" } });
  fireEvent.keyDown(view.getByRole("searchbox"), { key: "Enter" });
  assert.equal(document.activeElement, view.getByRole("button", { name: "State: Ready" }));
  assert.deepEqual(proposals.at(-1), ["ready"]);
  assert.equal(
    view.getByRole("button", { name: "State: Ready" }).getAttribute("aria-pressed"),
    "false",
  );
});

test("Find tab arrow navigation preserves tablist focus and does not cancel Tab", () => {
  const view = render(<MachineView defaultValue={fixture} />);
  const selectionTab = view.getByRole("tab", { name: "Selection" });
  selectionTab.focus();
  fireEvent.keyDown(selectionTab, { key: "ArrowRight" });
  const findTab = view.getByRole("tab", { name: "Find" });
  assert.equal(findTab.getAttribute("aria-selected"), "true");
  assert.equal(document.activeElement, findTab);
  assert.equal(fireEvent.keyDown(findTab, { key: "Tab" }), true);
  // jsdom does not implement browser sequential Tab navigation. The search input
  // remains a native, enabled tab stop; browser traversal is covered separately.
  const input = view.getByRole("searchbox") as HTMLInputElement;
  assert.equal(input.tabIndex, 0);
  assert.equal(input.disabled, false);
  fireEvent.click(findTab);
  assert.equal(document.activeElement, input);
});

test("Find ignores composing, modified and already-prevented keyboard activation", () => {
  const proposals: (readonly string[])[] = [];
  const view = render(
    <MachineView defaultValue={fixture} onSelectionChange={(ids) => proposals.push(ids)} />,
  );
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  const input = view.getByRole("searchbox");
  fireEvent.change(input, { target: { value: "Ready" } });
  for (const key of ["Enter", "Escape"]) {
    fireEvent.keyDown(input, { key, isComposing: true });
    for (const modifier of ["altKey", "ctrlKey", "metaKey", "shiftKey"]) {
      fireEvent.keyDown(input, { key, [modifier]: true });
    }
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    event.preventDefault();
    fireEvent(input, event);
  }
  assert.equal(proposals.length, 0);
  assert.equal(view.getByRole("tab", { name: "Find" }).getAttribute("aria-selected"), "true");
  assert.equal(document.activeElement, input);
  assert.equal(input.closest("form"), null);
  fireEvent.keyDown(input, { key: "Enter" });
  assert.deepEqual(proposals.at(-1), ["ready"]);
});

test("an evicted actor cannot dispatch after Return to latest; available actor restores eligibility", async () => {
  let dispatched = 0;
  const props = {
    defaultValue: fixture,
    mode: "inspect" as const,
    onDispatchEvent: () => {
      dispatched++;
    },
  };
  const view = render(<MachineView {...props} inspectionFrames={[first, second]} />);
  fireEvent.click(view.getByRole("tab", { name: "Trace" }));
  fireEvent.click(view.getByRole("button", { name: /START f1/ }));
  view.rerender(
    <MachineView {...props} inspectionFrames={[frame("other-latest", { actorId: "other" })]} />,
  );
  fireEvent.click(view.getByRole("button", { name: "Return to latest" }));
  fireEvent.click(view.getByRole("tab", { name: "Runtime" }));
  fireEvent.change(view.getByLabelText("Event type"), { target: { value: "START" } });
  const dispatch = view.getByRole("button", { name: "Request host dispatch" }) as HTMLButtonElement;
  assert.equal(dispatch.disabled, true);
  assert.ok(view.getByText("Selected actor actor is unavailable: no retained observation."));
  // Direct form submission also exercises the handler guard, not just button state.
  fireEvent.submit(dispatch.closest("form")!);
  await Promise.resolve();
  assert.equal(dispatched, 0);
  fireEvent.change(view.getByLabelText("Actor"), { target: { value: "other" } });
  assert.equal(dispatch.disabled, false);
  assert.equal(dispatched, 0);
});

test("Find warns that opening another graph clears local simulation", () => {
  const view = render(<MachineView defaultValue={fixture} mode="simulate" />);
  fireEvent.click(view.getByRole("tab", { name: "Find" }));
  assert.ok(
    view.getByText(
      "Opening another graph clears this local simulation and replay; host observations are unchanged.",
    ),
  );
});
