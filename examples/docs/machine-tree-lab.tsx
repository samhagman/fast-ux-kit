import { useMemo, useRef, useState } from "react";
import { Button as AriaButton, Tabs, TabList, Tab, TabPanel } from "react-aria-components";
import { Button } from "../../src/components/aria.js";
import { MachineTreeView } from "../../src/react/machine-tree-view.js";
import {
  buildMachineTree,
  projectMachineTree,
  machineTreeAncestors,
  createMachineSnapshot,
  getEnabledMachineTransitions,
  sendMachineEvent,
  type MachineEvent,
  type MachineSnapshot,
  type MachineTreeActiveStates,
} from "../../src/core/machine/index.js";
import { machineLabCases } from "./machine-lab-data.js";
import { Code } from "./ui.js";

const cases = [machineLabCases[1]!, machineLabCases[3]!, machineLabCases[0]!, machineLabCases[2]!];
const supplied: Readonly<Record<string, readonly MachineTreeActiveStates[]>> = {
  launch: [{ machineId: "launch", activeIds: ["launch-connecting", "launch-loading"] }],
  support: [{ machineId: "support", activeIds: ["support-intake"] }],
  release: [{ machineId: "release", activeIds: ["release-review"] }],
  incident: [{ machineId: "incident", activeIds: ["incident-review"] }],
};
const exampleCode = `<MachineTreeView
  value={document}
  selectedId={selectedId}
  onSelectionChange={setSelectedId}
  activeStates={observedStates}
  showToolbar={false}
  showInspector={false}
/>
// View operations do not dispatch events.`;

/** A focused host workspace; execution remains an explicit trusted local example. */
export function MachineTreeLab({
  dark: controlledDark,
  onThemeChange,
}: {
  dark?: boolean;
  onThemeChange?: (dark: boolean) => void;
} = {}) {
  const [caseId, setCaseId] = useState(cases[0]!.id);
  const current = cases.find((item) => item.id === caseId)!;
  const [generation, setGeneration] = useState(0);
  const [query, setQuery] = useState("");
  const [showNotes, setShowNotes] = useState(true);
  const [showTransitions, setShowTransitions] = useState(true);
  const [expandedIds, setExpandedIds] = useState<readonly string[]>(() =>
    buildMachineTree(current.document)
      .rows.filter((row) => row.childIds.length > 0)
      .map((row) => row.id),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [acceptSelection, setAcceptSelection] = useState(true);
  const [showSupplied, setShowSupplied] = useState(false);
  const [snapshot, setSnapshot] = useState<MachineSnapshot | null>(null);
  const [viewMessage, setViewMessage] = useState("No selection requests yet.");
  const [panel, setPanel] = useState<string | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [localDark, setLocalDark] = useState(false);
  const dark = controlledDark ?? localDark;
  const panelButton = useRef<HTMLButtonElement>(null);
  const examplesButton = useRef<HTMLButtonElement>(null);
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
  const model = useMemo(
    () => buildMachineTree(current.document, { activeStates: activity }),
    [current, activity],
  );
  const selected = model.rows.find((row) => row.id === selectedId);
  const projection = useMemo(
    () =>
      projectMachineTree(model, {
        query,
        expandedIds: new Set(expandedIds),
        showNotes,
        showTransitions,
      }),
    [model, query, expandedIds, showNotes, showTransitions],
  );
  const selectionHidden = Boolean(
    selected && !projection.rows.some((row) => row.id === selected.id),
  );
  const selectionPath = selected
    ? [...machineTreeAncestors(model, selected.id), selected.id]
        .map((id) => model.rows.find((row) => row.id === id)!)
        .filter(Boolean)
    : [];
  const declaredInitialId =
    selected?.kind === "machine" ? selected.graph.initialId : selected?.node?.initialId;
  function showSelected() {
    if (!selected) return;
    setQuery("");
    if (selected.kind === "transition") setShowTransitions(true);
    if (selected.node?.kind === "note") setShowNotes(true);
    setExpandedIds([...new Set([...expandedIds, ...machineTreeAncestors(model, selected.id)])]);
    setViewMessage(`Shown ${selected.label} in the tree. No event was sent.`);
  }
  function reset(nextId = current.id) {
    setCaseId(nextId);
    setShowNotes(true);
    setShowTransitions(true);
    const next = cases.find((item) => item.id === nextId)!;
    setQuery("");
    setExpandedIds(
      buildMachineTree(next.document)
        .rows.filter((row) => row.childIds.length > 0)
        .map((row) => row.id),
    );
    setSnapshot(null);
    setSelectedId(null);
    setAcceptSelection(true);
    setShowSupplied(false);
    setViewMessage("No selection requests yet.");
    setGeneration((value) => value + 1);
  }
  function begin() {
    setSnapshot(
      createMachineSnapshot(current.document, current.document.rootId, {}, current.options),
    );
    setPanel("simulation");
  }
  function send(event: MachineEvent) {
    if (snapshot) setSnapshot(sendMachineEvent(current.document, snapshot, event, current.options));
  }
  function closePanel() {
    setPanel(null);
    panelButton.current?.focus();
  }
  return (
    <article
      className="machine-tree-lab"
      data-tree-theme={dark ? "dark" : "light"}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.defaultPrevented) return;
        if (examplesOpen) {
          setExamplesOpen(false);
          examplesButton.current?.focus();
        } else if (panel) closePanel();
      }}
    >
      <header className="machine-tree-lab__topbar">
        <a
          className="machine-tree-lab__brand"
          href="#components"
          aria-label="Back to component gallery"
        >
          <span aria-hidden="true">f.</span> FAST / UX
        </a>
        <h1 tabIndex={-1}>MACHINE TREE</h1>
        <div className="machine-tree-lab__top-actions">
          <AriaButton
            ref={examplesButton}
            className="machine-tree-lab__text-button"
            aria-expanded={examplesOpen}
            aria-controls="tree-examples"
            onPress={() => setExamplesOpen(!examplesOpen)}
          >
            Examples
          </AriaButton>
          <AriaButton
            className="machine-tree-lab__icon-button"
            aria-label="Help and view options"
            aria-expanded={panel === "help"}
            onPress={() => setPanel(panel === "help" ? null : "help")}
          >
            <span aria-hidden="true">?</span>
          </AriaButton>
        </div>
      </header>
      {examplesOpen && (
        <section
          id="tree-examples"
          className="machine-tree-lab__examples"
          aria-label="Machine examples"
        >
          <label className="machine-tree-lab__example">
            Example
            <select
              aria-label="Choose a machine tree example"
              value={caseId}
              onChange={(event) => {
                reset(event.target.value);
                setExamplesOpen(false);
                examplesButton.current?.focus();
              }}
            >
              {cases.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <p>{current.description}</p>
          <Button variant="quiet" onPress={() => reset()}>
            Reset tree example
          </Button>
          <Button
            variant="quiet"
            onPress={() => {
              setExamplesOpen(false);
              examplesButton.current?.focus();
            }}
          >
            Close examples
          </Button>
        </section>
      )}
      <div
        className={`machine-tree-lab__workspace${panel ? " machine-tree-lab__workspace--split" : ""}`}
      >
        <div className="machine-tree-lab__canvas">
          <MachineTreeView
            key={`${caseId}-${generation}`}
            value={current.document}
            label="Machine hierarchy explorer"
            activeStates={activity}
            selectedId={selectedId}
            query={query}
            onQueryChange={setQuery}
            showNotes={showNotes}
            onShowNotesChange={setShowNotes}
            showTransitions={showTransitions}
            onShowTransitionsChange={setShowTransitions}
            expandedIds={expandedIds}
            onExpandedChange={setExpandedIds}
            showToolbar={toolsOpen}
            showInspector={false}
            renderLabel={(row) => {
              if (!snapshot || !row.transition) return row.label;
              const transition = row.transition;
              const event = eventChoices.find(
                (choice) =>
                  choice.type === transition.event &&
                  getEnabledMachineTransitions(
                    current.document,
                    snapshot,
                    choice,
                    current.options,
                  ).some((item) => item.id === transition.id),
              );
              return (
                <AriaButton
                  className="machine-tree-lab__route-event"
                  aria-label={`Send event ${transition.event || row.label} from ${transition.sourceId}`}
                  isDisabled={!event}
                  onPress={() => {
                    if (event) send(event);
                  }}
                >
                  {row.label}
                </AriaButton>
              );
            }}
            onSelectionChange={(id, row) => {
              if (acceptSelection) setSelectedId(id);
              setViewMessage(
                acceptSelection
                  ? `Selected ${row?.label ?? "nothing"}. No event was sent.`
                  : "The host kept its current selection. Focus and selection are separate.",
              );
            }}
          />
        </div>
        {panel && (
          <aside className="machine-tree-lab__sidebar" aria-label="Workspace panel">
            <Tabs selectedKey={panel} onSelectionChange={(key) => setPanel(String(key))}>
              <div className="machine-tree-lab__panel-header">
                <TabList aria-label="Workspace panels">
                  <Tab id="details">Details</Tab>
                  <Tab id="simulation">Simulation</Tab>
                  <Tab id="integration">Integration</Tab>
                  <Tab id="help">Help</Tab>
                </TabList>
                <AriaButton
                  className="machine-tree-lab__icon-button"
                  aria-label="Close workspace panel"
                  onPress={closePanel}
                >
                  <span aria-hidden="true">×</span>
                </AriaButton>
              </div>
              <TabPanel id="details">
                <h2>{selected?.label ?? "Selection details"}</h2>
                {selected ? (
                  <>
                    <ol className="machine-tree-lab__path" aria-label="Selected item tree path">
                      {selectionPath.map((row) => (
                        <li key={row.id}>
                          <span>{row.label}</span> <code>{row.elementId}</code>
                        </li>
                      ))}
                    </ol>
                    {selectionHidden && (
                      <p role="status">This selection is outside the visible tree.</p>
                    )}
                    <Button variant="quiet" onPress={showSelected}>
                      Show selected item
                    </Button>
                    <dl>
                      <dt>Machine</dt>
                      <dd>{selected.graph.label}</dd>
                      <dt>ID</dt>
                      <dd>{selected.elementId}</dd>
                      <dt>Kind</dt>
                      <dd>{selected.node?.kind ?? selected.kind}</dd>
                      {declaredInitialId !== undefined && (
                        <>
                          <dt>Declared initial child</dt>
                          <dd>{declaredInitialId || "Empty ID"}</dd>
                        </>
                      )}
                      {selected.initial && (
                        <>
                          <dt>Initial</dt>
                          <dd>Declared initial child</dd>
                        </>
                      )}
                      {selected.active && (
                        <>
                          <dt>Observation</dt>
                          <dd>Supplied active state</dd>
                        </>
                      )}
                      {selected.activeDescendant && !selected.active && (
                        <>
                          <dt>Observation</dt>
                          <dd>Contains a supplied active state</dd>
                        </>
                      )}
                    </dl>
                    {selected.node?.description && <p>{selected.node.description}</p>}
                    {selected.node?.entry?.length ? (
                      <p>Entry: {selected.node.entry.join(", ")}</p>
                    ) : null}
                    {selected.node?.exit?.length ? (
                      <p>Exit: {selected.node.exit.join(", ")}</p>
                    ) : null}
                    {selected.node?.tags?.length ? (
                      <p>Tags: {selected.node.tags.join(", ")}</p>
                    ) : null}
                    {selected.transition && (
                      <dl>
                        <dt>Event</dt>
                        <dd>{selected.transition.event || "Automatic (declarative)"}</dd>
                        <dt>Source</dt>
                        <dd>{selected.transition.sourceId}</dd>
                        <dt>Target</dt>
                        <dd>{selected.transition.targetId}</dd>
                        <dt>Guard</dt>
                        <dd>{selected.transition.guard || "None declared"}</dd>
                        <dt>Actions</dt>
                        <dd>{selected.transition.actions?.join(", ") || "None declared"}</dd>
                      </dl>
                    )}
                  </>
                ) : (
                  <p>
                    Select a state or route to inspect its inert metadata. Target links navigate
                    without sending an event.
                  </p>
                )}
              </TabPanel>
              <TabPanel id="simulation">
                <h2>Local simulation</h2>
                <p>Run the trusted example locally. No services, timers or backend are started.</p>
                <div className="machine-tree-lab__panel-actions">
                  <Button onPress={begin}>
                    {snapshot ? "Restart local simulation" : "Begin local simulation"}
                  </Button>
                  <Button variant="quiet" isDisabled={!snapshot} onPress={() => setSnapshot(null)}>
                    Stop local simulation
                  </Button>
                </div>
                {snapshot && (
                  <>
                    <div
                      className="machine-tree-lab__events"
                      role="group"
                      aria-label="Local simulation events"
                    >
                      {eventChoices.map((event) => (
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
                          {event.payload === undefined ? "" : ` ${JSON.stringify(event.payload)}`}
                        </Button>
                      ))}
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
              </TabPanel>
              <TabPanel id="integration">
                <h2>One document, independent views</h2>
                <p>
                  Use the reusable read-only component with your own document and supplied activity.
                  Controlled callbacks propose changes; the host decides whether to accept them.
                </p>
                <Code>{exampleCode}</Code>
                <p>
                  Selection, search and folding never execute guards, actions or events. Imported
                  data is text, not executable code.
                </p>
              </TabPanel>
              <TabPanel id="help">
                <h2>Explore the hierarchy</h2>
                <p>
                  Arrow keys move or fold. Home and End jump. Enter or Space selects. Follow an
                  underlined destination to reveal its state.
                </p>
                <label className="machine-lab__check">
                  <input
                    type="checkbox"
                    checked={toolsOpen}
                    onChange={(event) => setToolsOpen(event.target.checked)}
                  />
                  Show search and tree tools
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
                <p>
                  Activity is supplied, not inferred. Opening a referenced machine does not invoke
                  it.
                </p>
                <a href="#machine-view">Open spatial Machine View</a>
              </TabPanel>
            </Tabs>
          </aside>
        )}
      </div>
      <footer className="machine-tree-lab__bottom-bar">
        <AriaButton
          className="machine-tree-lab__icon-button machine-tree-lab__play"
          aria-label={snapshot ? "Stop local simulation" : "Begin local simulation"}
          onPress={() => (snapshot ? setSnapshot(null) : begin())}
        >
          <span aria-hidden="true">{snapshot ? "■" : "▷"}</span>
        </AriaButton>
        <p
          className={snapshot ? "machine-tree-lab__runtime" : "sr-only"}
          role="status"
          aria-label="Tree lab runtime state"
        >
          {snapshot
            ? `Local simulation · ${snapshot.status} · sequence ${snapshot.sequence}.`
            : "No local simulation running. Sample activity is only supplied view data."}
        </p>
        <span className="machine-tree-lab__bottom-spacer" />
        <AriaButton
          className="machine-tree-lab__icon-button"
          aria-label={`Switch to ${dark ? "light" : "dark"} theme`}
          onPress={() => {
            setLocalDark(!dark);
            onThemeChange?.(!dark);
          }}
        >
          <span aria-hidden="true">{dark ? "☼" : "☾"}</span>
        </AriaButton>
        <AriaButton
          ref={panelButton}
          className="machine-tree-lab__icon-button machine-tree-lab__panel-toggle"
          aria-label="Toggle workspace panel"
          aria-expanded={panel !== null}
          onPress={() => setPanel(panel ? null : "details")}
        >
          <span aria-hidden="true">‹›</span>
        </AriaButton>
      </footer>
      <p className="sr-only" role="status" aria-label="Tree lab view state">
        {viewMessage}
      </p>
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
