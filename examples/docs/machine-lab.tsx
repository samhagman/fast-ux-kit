import { useMemo, useState } from "react";
import { Button } from "../../src/components/aria.js";
import { MachineView, type MachineViewMode } from "../../src/react/machine-view.js";
import {
  appendMachineInspectionFrame,
  machineTransitionCoverage,
  runMachineScenario,
  validateMachineDocument,
  type MachineDocument,
  type MachineInspectionSession,
  type MachineSnapshot,
} from "../../src/core/machine/index.js";
import { machineLabCases, machineLabInspection, machineLabObservedAt } from "./machine-lab-data.js";
import { Code, PageHeading } from "./ui.js";

type ScenarioResult = ReturnType<typeof runMachineScenario> & { id: string; label: string };
const sampleCode = `const [document, setDocument] = useState(initialDocument);

<MachineView
  value={document}
  onChange={setDocument}
  runtimeOptions={{ guards: trustedGuards, actions: pureActions }}
  inspectionSession={authorizedObservations}
  showDiagnostics={false}
/>`;

/** Converts a local test trace to view data, not to a committed host history. */
export function scenarioInspection(snapshot: MachineSnapshot): MachineInspectionSession {
  return {
    source: "simulation",
    connection: "connected",
    sequence: snapshot.sequence,
    frames: snapshot.trace.map((step) => ({
      id: `test-${step.sequence}`,
      sequence: step.sequence,
      timestamp: machineLabObservedAt + step.sequence * 1000,
      actorId: "local-test",
      machineId: snapshot.machineId,
      activeIds: step.activeIds,
      transitionIds: step.transitionIds,
      event: { type: step.event || "automatic" },
      status: step.sequence === snapshot.sequence ? snapshot.status : "recorded",
      // A trace does not contain historical context. Never backfill it with final context.
      ...(step.sequence === snapshot.sequence ? { context: snapshot.context } : {}),
    })),
  };
}

export function MachineLab() {
  const [caseId, setCaseId] = useState(machineLabCases[0]!.id);
  const selectedCase = machineLabCases.find((item) => item.id === caseId)!;
  const [document, setDocument] = useState<MachineDocument>(selectedCase.document);
  const [mode, setMode] = useState<MachineViewMode>("edit");
  const [editable, setEditable] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [results, setResults] = useState<readonly ScenarioResult[]>([]);
  const [inspection, setInspection] = useState<MachineInspectionSession>(machineLabInspection);
  const [connection, setConnection] = useState<MachineInspectionSession["connection"]>("connected");
  const [requestBehavior, setRequestBehavior] = useState<"off" | "record" | "reject">("off");
  const [requestCount, setRequestCount] = useState(0);
  const [lastRequest, setLastRequest] = useState("");
  const [status, setStatus] = useState("");
  const [showCode, setShowCode] = useState(false);
  const graph = document.machines.find((item) => item.id === document.rootId)!;
  const errors = useMemo(
    () => validateMachineDocument(document).filter((item) => item.severity === "error"),
    [document],
  );
  const coverage = useMemo(
    () =>
      machineTransitionCoverage(
        results.flatMap((result) => result.snapshot.trace),
        graph.transitions.map((transition) => transition.id),
      ),
    [results, graph],
  );
  const session = useMemo(() => ({ ...inspection, connection }), [inspection, connection]);
  function chooseCase(id: string) {
    const next = machineLabCases.find((item) => item.id === id);
    if (!next) return;
    setCaseId(id);
    setDocument(next.document);
    setMode("edit");
    setResults([]);
    setEditable(false);
    setDiagnostics(false);
    setRequestBehavior("off");
    setRequestCount(0);
    setLastRequest("");
    setInspection({ source: "live", connection: "connected", frames: [] });
    setConnection("connected");
    setGeneration((value) => value + 1);
    setStatus(`${next.label} loaded. Temporary edits and test results reset.`);
  }
  function recordChange(next: MachineDocument) {
    setDocument(next);
    setResults([]);
    if (inspection.source === "simulation")
      setInspection({ source: "simulation", connection: "connected", frames: [] });
    setStatus("Local graph updated. Previous test results and simulated traces were cleared.");
  }
  function runScenarios() {
    const next = selectedCase.scenarios.map((scenario) => ({
      id: scenario.id,
      label: scenario.label,
      ...runMachineScenario(document, scenario, selectedCase.options),
    }));
    setResults(next);
    setStatus(
      `${next.filter((item) => item.passed === true).length} of ${next.length} scenarios passed on this graph.`,
    );
  }
  function loadCommittedExample() {
    setCaseId("release");
    setDocument(machineLabCases[0]!.document);
    setMode("inspect");
    setEditable(false);
    setResults([]);
    setInspection(machineLabInspection);
    setRequestCount(0);
    setLastRequest("");
    setRequestBehavior("off");
    setConnection("connected");
    setGeneration((value) => value + 1);
    setStatus("Synthetic committed observations loaded. No live service is connected.");
  }
  function appendObservation() {
    const sequence = (inspection.sequence ?? 12) + 1;
    setInspection((current) => ({
      ...appendMachineInspectionFrame(
        current,
        {
          id: `frame-${sequence}`,
          sequence,
          committed: true,
          timestamp: machineLabObservedAt + sequence * 1000,
          actorId: "release-coordinator",
          machineId: "release",
          activeIds: ["release-publish"],
          status: "active",
          event: { type: "DECIDE", payload: { approved: true } },
          transitionIds: ["release-approve"],
          context: { attempts: 1, approved: true },
        },
        100,
      ),
      cursor: `demo:${sequence}`,
    }));
    setStatus(
      `Synthetic observation ${sequence} appended. Historical selection remains view-only.`,
    );
  }
  function dispatchRequest(actorId: string, event: { type: string; payload?: unknown }) {
    if (requestBehavior === "reject")
      throw new Error("Demo host refused the request. No state was changed.");
    setRequestCount((count) => count + 1);
    setLastRequest(`${event.type} → ${actorId}`);
    setStatus("Request recorded locally. It does not change the observed machine.");
  }
  return (
    <article className="machine-lab">
      <PageHeading
        category="Experiences"
        title="Machine View"
        description="An editable statechart, a bounded simulator, and a careful window into host-owned observations."
        owner="Fast UX"
      />
      <div className="machine-lab__intro">
        <p>
          <strong>Follow the behavior, not just the boxes.</strong> Select a state, trace an event,
          or inspect a recorded step. Everything here is synthetic and stays in this page.
        </p>
        <a href="#machine-lab-contract">
          Integration &amp; boundaries <span aria-hidden="true">↓</span>
        </a>
      </div>
      <div className="machine-lab__controls">
        <label>
          Example
          <select
            aria-label="Choose a machine example"
            value={caseId}
            onChange={(event) => chooseCase(event.target.value)}
          >
            {machineLabCases.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="machine-lab__check">
          <input
            type="checkbox"
            checked={editable}
            onChange={(event) => setEditable(event.target.checked)}
          />
          Enable local graph editing
        </label>
        <Button variant="quiet" onPress={() => chooseCase(caseId)}>
          Reset example
        </Button>
      </div>
      <p className="machine-lab__case-note">{selectedCase.description}</p>
      <MachineView
        key={generation}
        value={document}
        onChange={recordChange}
        readOnly={!editable}
        label="Interactive machine workspace"
        mode={mode}
        onModeChange={setMode}
        runtimeOptions={selectedCase.options}
        inspectionSession={session}
        showDiagnostics={diagnostics}
        onDispatchEvent={requestBehavior === "off" ? undefined : dispatchRequest}
      />
      <p role="status" className="machine-lab__status">
        {status ||
          "Select a state to inspect it. Editing is off; simulation and navigation are available."}
      </p>

      <div className="machine-lab__lower">
        <section className="machine-lab__panel" aria-labelledby="machine-lab-tests">
          <div className="machine-lab__section-title">
            <div>
              <span className="machine-lab__eyebrow">REPRODUCE</span>
              <h2 id="machine-lab-tests">Scenario tester</h2>
            </div>
            <Button onPress={runScenarios} isDisabled={errors.length > 0}>
              Run {selectedCase.scenarios.length} scenarios
            </Button>
          </div>
          <p>
            Each path starts fresh, runs pure callbacks, and compares the exact final active-state
            set. Tests use your current local graph.
          </p>
          {!results.length ? (
            <p className="machine-lab__empty">Not run. No coverage or pass is claimed yet.</p>
          ) : (
            <>
              <p data-testid="machine-lab-coverage">
                <strong>
                  {results.filter((item) => item.passed === true).length}/{results.length} passed
                </strong>{" "}
                · {coverage.visited.length}/{graph.transitions.length} root-graph transitions
                observed
              </p>
              <meter
                min={0}
                max={1}
                value={coverage.ratio}
                aria-label="Observed transition coverage"
              />
              <ul className="machine-lab__results">
                {results.map((result) => (
                  <li key={result.id}>
                    <div>
                      <strong>{result.label}</strong>
                      <span data-result={result.passed ? "pass" : "fail"}>
                        {result.passed === true
                          ? "Passed"
                          : result.passed === false
                            ? "Failed"
                            : "No assertion"}
                      </span>
                    </div>
                    <p>
                      {result.snapshot.error ??
                        `${result.snapshot.trace.length} recorded steps · ${result.snapshot.status}`}
                    </p>
                    <Button
                      variant="quiet"
                      onPress={() => {
                        setInspection(scenarioInspection(result.snapshot));
                        setConnection("connected");
                        setMode("inspect");
                        setRequestBehavior("off");
                        setStatus(
                          `Viewing ${result.label}: simulated trace, not committed host data.`,
                        );
                      }}
                    >
                      Inspect {result.label.toLowerCase()}
                    </Button>
                  </li>
                ))}
              </ul>
              {!!coverage.unvisited.length && (
                <details>
                  <summary>Unobserved transitions ({coverage.unvisited.length})</summary>
                  <ul>
                    {coverage.unvisited.map((id) => (
                      <li key={id}>
                        <code>{id}</code>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </>
          )}
          <p className="machine-lab__fine">
            Observed edge coverage is not proof of every path, payload, timing or production
            behavior. Referenced submachines are separate graphs and are not included in this
            root-graph coverage count.
          </p>
        </section>

        <section className="machine-lab__panel" aria-labelledby="machine-lab-host">
          <div className="machine-lab__section-title">
            <div>
              <span className="machine-lab__eyebrow">OBSERVE</span>
              <h2 id="machine-lab-host">Host inspection lab</h2>
            </div>
          </div>
          <p>
            Explore a fixed approval trace with a coordinator, a child actor and pending work. These
            are sample observations, not a running backend.
          </p>
          <Button onPress={loadCommittedExample}>Load committed sample</Button>
          <div className="machine-lab__host-controls">
            <label>
              Connection
              <select
                aria-label="Inspection connection"
                value={connection}
                onChange={(event) =>
                  setConnection(event.target.value as MachineInspectionSession["connection"])
                }
              >
                {["connected", "stale", "disconnected", "gap"].map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            <label className="machine-lab__check">
              <input
                type="checkbox"
                checked={diagnostics}
                onChange={(event) => setDiagnostics(event.target.checked)}
              />
              Show optional diagnostic payloads
            </label>
            <Button
              variant="quiet"
              isDisabled={inspection.source !== "committed" || caseId !== "release"}
              onPress={appendObservation}
            >
              Append synthetic observation
            </Button>
            <label>
              Host request callback
              <select
                aria-label="Host request behavior"
                value={requestBehavior}
                onChange={(event) =>
                  setRequestBehavior(event.target.value as typeof requestBehavior)
                }
              >
                <option value="off">None — observation only</option>
                <option value="record">Record request locally</option>
                <option value="reject">Demonstrate host refusal</option>
              </select>
            </label>
          </div>
          <p data-testid="machine-lab-requests">
            {requestCount} local requests recorded{lastRequest ? ` · ${lastRequest}` : ""}
          </p>
          <p className="machine-lab__fine">
            History browsing never dispatches. Recording a request does not approve a task, fire a
            timer, retry an effect, or update a snapshot. An unknown effect outcome is deliberately
            not a retry button.
          </p>
        </section>
      </div>
      <section
        id="machine-lab-contract"
        className="machine-lab__contract"
        aria-labelledby="machine-lab-contract-heading"
      >
        <span className="machine-lab__eyebrow">INTEGRATE</span>
        <h2 id="machine-lab-contract-heading">A view with explicit boundaries</h2>
        <div className="machine-lab__contract-grid">
          <div>
            <h3>Own the document</h3>
            <p>
              Accept or reject edit proposals through controlled value and onChange. View navigation
              is not document history. Named guard and action callbacks are trusted code you supply,
              never source strings from imported JSON.
            </p>
          </div>
          <div>
            <h3>Own execution</h3>
            <p>
              The local simulator supports nested and parallel states, guarded events, bounded
              automatic transitions and pure context actions. It does not run services, clocks,
              arbitrary code, or referenced submachines.
            </p>
          </div>
          <div>
            <h3>Own the data boundary</h3>
            <p>
              Normalize and redact host observations before passing them in. Diagnostics start
              hidden. The component does not authenticate a stream, prove commits, implement
              transport, or grant permission to dispatch.
            </p>
          </div>
        </div>
        <Button
          variant="quiet"
          aria-expanded={showCode}
          onPress={() => setShowCode((value) => !value)}
        >
          {showCode ? "Hide integration example" : "Show integration example"}
        </Button>
        {showCode && <Code>{sampleCode}</Code>}
      </section>
    </article>
  );
}

const galleryDocument: MachineDocument = {
  version: 1,
  rootId: "preview",
  machines: [
    {
      id: "preview",
      label: "Review flow",
      initialId: "preview-ready",
      nodes: [
        { id: "preview-ready", label: "Ready", kind: "atomic" },
        { id: "preview-review", label: "Review", kind: "atomic" },
        { id: "preview-complete", label: "Complete", kind: "final" },
      ],
      transitions: [
        {
          id: "preview-submit",
          sourceId: "preview-ready",
          targetId: "preview-review",
          event: "SUBMIT",
        },
        {
          id: "preview-approve",
          sourceId: "preview-review",
          targetId: "preview-complete",
          event: "APPROVE",
        },
      ],
    },
  ],
};
export function MachineGalleryPreview() {
  return (
    <MachineView
      defaultValue={galleryDocument}
      label="Machine View gallery preview"
      className="machine-gallery-preview"
      readOnly
      showToolbar={false}
      showInspector={false}
    />
  );
}
