import { useMemo, useState } from "react";
import { Button } from "../../src/components/aria.js";
import { MachineTreeView } from "../../src/react/machine-tree-view.js";
import {
  buildMachineTree,
  createMachineSnapshot,
  getEnabledMachineTransitions,
  sendMachineEvent,
  type MachineEvent,
  type MachineSnapshot,
  type MachineTreeActiveStates,
} from "../../src/core/machine/index.js";
import { machineLabCases } from "./machine-lab-data.js";
import { Code, PageHeading } from "./ui.js";

const cases = [machineLabCases[1]!, machineLabCases[3]!, machineLabCases[0]!, machineLabCases[2]!];
const supplied: Readonly<Record<string, readonly MachineTreeActiveStates[]>> = {
  launch: [{ machineId: "launch", activeIds: ["launch-connecting", "launch-loading"] }],
  support: [{ machineId: "support", activeIds: ["support-intake"] }],
  release: [{ machineId: "release", activeIds: ["release-review"] }],
  incident: [{ machineId: "incident", activeIds: ["incident-review"] }],
};
const exampleCode = `const [selectedId, setSelectedId] = useState<string | null>(null);

<MachineTreeView
  value={document}
  label="Workflow structure"
  selectedId={selectedId}
  onSelectionChange={setSelectedId}
  activeStates={[{ machineId: "workflow", activeIds: observedStateIds }]}
/>
// Selection, search and folding never execute the machine.
// Keep event dispatch and authentication in your application.`;

/** Uses the existing trusted, pure local runtime outside the presentation component. */
export function MachineTreeLab() {
  const [caseId, setCaseId] = useState(cases[0]!.id);
  const current = cases.find((item) => item.id === caseId)!;
  const [generation, setGeneration] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acceptSelection, setAcceptSelection] = useState(true);
  const [showSupplied, setShowSupplied] = useState(true);
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(null);
  const [viewMessage, setViewMessage] = useState("No selection requests yet.");
  const [showCode, setShowCode] = useState(false);
  const eventChoices = useMemo(() => {
    const seen = new Set<string>();
    return current.scenarios
      .flatMap((scenario) => scenario.events)
      .filter((event) => {
        const key = JSON.stringify(event);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }, [current]);
  const activity = snapshot
    ? [{ machineId: snapshot.machineId, activeIds: snapshot.activeIds }]
    : showSupplied
      ? supplied[current.id]
      : undefined;
  function reset(nextId = current.id) {
    setCaseId(nextId);
    setSnapshot(null);
    setSelectedId(null);
    setAcceptSelection(true);
    setShowSupplied(true);
    setViewMessage("No selection requests yet.");
    setGeneration((value) => value + 1);
  }
  function send(event: MachineEvent) {
    if (!snapshot) return;
    setSnapshot(sendMachineEvent(current.document, snapshot, event, current.options));
  }
  return (
    <article className="machine-tree-lab">
      <PageHeading
        category="State machines"
        title="Machine Tree View"
        description="Nested behavior in a readable document flow. Follow a state, unfold a branch, or reveal where an event leads."
      />
      <p>
        <strong>A different view of the same model.</strong> This is a separate reusable component,
        not a canvas mode. Containment, transition routes and supplied observations stay distinct.
      </p>
      <div className="machine-lab__controls">
        <label className="machine-tree-lab__example">
          Example
          <select
            aria-label="Choose a machine tree example"
            value={caseId}
            onChange={(event) => reset(event.target.value)}
          >
            {cases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="machine-lab__check">
          <input
            type="checkbox"
            checked={showSupplied}
            disabled={snapshot !== null}
            onChange={(event) => setShowSupplied(event.target.checked)}
          />
          Show supplied sample activity
        </label>
        <label className="machine-lab__check">
          <input
            type="checkbox"
            checked={acceptSelection}
            onChange={(event) => setAcceptSelection(event.target.checked)}
          />
          Accept selection requests
        </label>
        <Button variant="quiet" onPress={() => reset()}>
          Reset tree example
        </Button>
      </div>
      <p>{current.description}</p>
      <MachineTreeView
        key={`${caseId}-${generation}`}
        value={current.document}
        label="Machine hierarchy explorer"
        activeStates={activity}
        selectedId={selectedId}
        onSelectionChange={(id, row) => {
          if (acceptSelection) setSelectedId(id);
          setViewMessage(
            acceptSelection
              ? `Selected ${row?.label ?? "nothing"}. No event was sent.`
              : "The host kept its current selection. Focus and selection are separate.",
          );
        }}
      />
      <p role="status" aria-label="Tree lab view state">
        {viewMessage}
      </p>
      <section className="machine-tree-lab__section" aria-labelledby="tree-lab-activity">
        <span className="eyebrow">OBSERVE</span>
        <h2 id="tree-lab-activity">Activity is supplied, not inferred</h2>
        <p>
          Sample mode supplies leaf IDs only. Their containers say “Active within”, not “Active”. A
          host can also report compound states explicitly. Neither selection nor a transition target
          establishes active execution.
        </p>
        <p>
          Choose Nested handoff to follow a referenced graph. Its states remain independently
          scoped; opening the reference does not invoke it.
        </p>
      </section>
      <section className="machine-tree-lab__section" aria-labelledby="tree-lab-simulation">
        <span className="eyebrow">TRY A LOCAL PATH</span>
        <h2 id="tree-lab-simulation">Explicit synthetic simulation</h2>
        <p>
          The controls below use the existing pure local runtime outside Machine Tree View. They run
          only trusted example guards/actions, never services, clocks or a backend. Tree navigation
          never sends these events.
        </p>
        <div className="machine-lab__controls">
          <Button
            onPress={() =>
              setSnapshot(
                createMachineSnapshot(
                  current.document,
                  current.document.rootId,
                  {},
                  current.options,
                ),
              )
            }
          >
            {snapshot ? "Restart local simulation" : "Begin local simulation"}
          </Button>
          <Button variant="quiet" isDisabled={!snapshot} onPress={() => setSnapshot(null)}>
            Stop local simulation
          </Button>
        </div>
        <p role="status" aria-label="Tree lab runtime state">
          {snapshot
            ? `Local simulation · ${snapshot.status} · sequence ${snapshot.sequence}.`
            : "No local simulation running. Sample activity is only supplied view data."}
        </p>
        {snapshot && (
          <>
            <div
              className="machine-lab__controls"
              role="group"
              aria-label="Local simulation events"
            >
              {eventChoices.map((event) => {
                const payloadLabel =
                  event.payload === undefined ? "" : ` ${JSON.stringify(event.payload)}`;
                return (
                  <Button
                    key={JSON.stringify(event)}
                    variant="secondary"
                    isDisabled={
                      !getEnabledMachineTransitions(
                        current.document,
                        snapshot,
                        event,
                        current.options,
                      ).length
                    }
                    onPress={() => send(event)}
                  >
                    Send {event.type}
                    {payloadLabel}
                  </Button>
                );
              })}
            </div>
            <details>
              <summary>Local context and event history</summary>
              <pre>
                {JSON.stringify(
                  {
                    context: snapshot.context,
                    activeIds: snapshot.activeIds,
                    events: snapshot.trace.map((step) => ({
                      sequence: step.sequence,
                      event: step.event,
                      activeIds: step.activeIds,
                    })),
                  },
                  null,
                  2,
                )}
              </pre>
            </details>
            {snapshot.error && <p role="alert">{snapshot.error}</p>}
          </>
        )}
      </section>
      <section className="machine-tree-lab__section" aria-labelledby="tree-lab-integration">
        <span className="eyebrow">INTEGRATE</span>
        <h2 id="tree-lab-integration">One document, independent views</h2>
        <p>
          Share a MachineDocument with the spatial Machine View, or render this hierarchy on its
          own. Portable projection helpers expose original IDs, ancestors, destination resolution,
          diagnostics and visible rows without React.
        </p>
        <p>
          Controlled callbacks are proposals. This lab can refuse selection without changing the
          source. Search retains ancestor context and never rewrites saved folding; target reveal
          clears search only when the host accepts it.
        </p>
        <Button variant="quiet" onPress={() => setShowCode(!showCode)}>
          {showCode ? "Hide integration example" : "Show integration example"}
        </Button>
        {showCode && <Code>{exampleCode}</Code>}
      </section>
    </article>
  );
}

export function MachineTreeGalleryPreview() {
  const sample = cases[0]!;
  const expanded = useMemo(
    () =>
      buildMachineTree(sample.document)
        .rows.filter((row) => row.kind === "machine" || row.node?.kind === "parallel")
        .map((row) => row.id),
    [sample],
  );
  return (
    <MachineTreeView
      value={sample.document}
      label="Parallel readiness tree preview"
      activeStates={supplied.launch}
      defaultExpandedIds={expanded}
      showSearch={false}
      showToolbar={false}
      showInspector={false}
    />
  );
}
