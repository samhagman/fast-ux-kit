import { useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Button, Checkbox, ModalDialog, Row } from "../../src/components/aria.js";
import {
  OutlineEditor,
  RichContent,
  type OutlineEditorHandle,
  type OutlinePlugin,
  type RichRendererRegistry,
} from "../../src/react/index.js";
import {
  createOutlineEditorState,
  createOutlineJSONCodec,
  createReferenceCompletionProvider,
  editorVisibleRows,
  findOutlineNode,
  outlineIds,
  parseOutlineText,
  recognizeTextReferences,
  serializeOutlineText,
  type OutlineAction,
  type OutlineCodec,
  type OutlineEditorState,
  type OutlineNode,
} from "../../src/core/index.js";
import { validateRichDocument } from "../../src/rich/index.js";
import { Code, PageHeading } from "./ui.js";
import { OutlineInteractionDemo } from "./outline-interaction-demo.js";
import { labScenarios, type LabData, type LabScenario } from "./outliner-lab-data.js";

const canonicalJSON = createOutlineJSONCodec<LabData>();
// A portable outline codec cannot validate application-owned metadata. Validate
// everything this host interprets before import dispatch can replace the trial.
function validateLabNodes(
  nodes: readonly OutlineNode[],
): asserts nodes is readonly OutlineNode<LabData>[] {
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    const data: unknown = node.data;
    if (data !== undefined) {
      if (typeof data !== "object" || data === null || Array.isArray(data))
        throw new TypeError(`Row ${node.id}: lab metadata must be an object.`);
      const metadata = data as Record<string, unknown>;
      if (metadata.content !== undefined) validateRichDocument(metadata.content);
      if (metadata.reviewedBy !== undefined && typeof metadata.reviewedBy !== "string")
        throw new TypeError(`Row ${node.id}: reviewedBy must be a string.`);
    }
    pending.push(...(node.children ?? []));
  }
}
const jsonCodec: OutlineCodec<LabData> = {
  ...canonicalJSON,
  decode(source) {
    const nodes = canonicalJSON.decode(source);
    validateLabNodes(nodes);
    return nodes;
  },
};
const titleCodec: OutlineCodec<LabData> = {
  id: "lab-outline-titles",
  mimeType: "text/plain",
  encode: serializeOutlineText,
  decode: (source) => {
    const nodes = parseOutlineText(source);
    validateLabNodes(nodes);
    return nodes;
  },
};
const completionProvider = createReferenceCompletionProvider({
  id: "lab-local-references",
  trigger: "@",
  entities: [
    {
      id: "research",
      spelling: "research",
      label: "research",
      description: "Local research notes",
    },
    { id: "design", spelling: "design", label: "design", description: "Local design notes" },
    { id: "review", spelling: "review", label: "review", description: "Local review checklist" },
  ],
});
const providers = [completionProvider];
type Observation = "not-tested" | "observed" | "problem";
const observationLabels: Record<Observation, string> = {
  "not-tested": "Not tested",
  observed: "Observed as expected",
  problem: "Problem observed",
};
interface TrialEvent {
  readonly sequence: number;
  readonly action: string;
  readonly result: string;
  readonly revision: number;
  readonly undo: number;
  readonly redo: number;
}

function LocalCounter() {
  const [count, setCount] = useState(0);
  return (
    <div className="lab-react-block">
      <span>Trusted React counter: {count}</span>
      <Button variant="quiet" onPress={() => setCount(count + 1)}>
        Add one locally
      </Button>
      <small>Application UI state only; not a document write. Remounting resets it.</small>
    </div>
  );
}
const richRegistry: RichRendererRegistry = {
  diagrams: {
    "lab-flow": ({ block }) => (
      <figure className="lab-flow">
        <ol>
          {block.source.split(" → ").map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <figcaption>{block.label}</figcaption>
      </figure>
    ),
  },
  react: { "lab-counter": () => <LocalCounter /> },
};

function reviewAction(
  state: OutlineEditorState<LabData>,
  reviewer: string,
): OutlineAction<LabData> {
  const draft = findOutlineNode(state.nodes, "draft")?.node;
  return {
    type: "transaction",
    commands: [
      {
        type: "update",
        id: "draft",
        changes: { checked: true, data: { ...draft?.data, reviewedBy: reviewer } },
      },
      { type: "update", id: "reference", changes: { text: `Reference: reviewed by ${reviewer}` } },
    ],
  };
}

export function OutlinerLab() {
  const [scenarioId, setScenarioId] = useState("read");
  const [generation, setGeneration] = useState(0);
  const [editing, setEditing] = useState(false);
  const scenario = labScenarios.find((item) => item.id === scenarioId)!;
  const selectorId = useId();
  return (
    <div className="outliner-lab">
      <PageHeading
        category="Outliner"
        title="Outliner lab"
        description="A real, resettable outliner. Read first; edit deliberately."
      />
      <OutlineInteractionDemo />
      <h2>Advanced capability trials</h2>
      <div className="lab-scenario-bar">
        <label className="lab-scenario-picker" htmlFor={selectorId}>
          Choose a scenario
          <select
            id={selectorId}
            value={scenarioId}
            onChange={(event) => {
              setEditing(false);
              setScenarioId(event.currentTarget.value);
            }}
          >
            {labScenarios.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.title}
              </option>
            ))}
          </select>
        </label>
        <Checkbox label="Enable editing" isSelected={editing} onChange={setEditing} />
        <Button
          variant="quiet"
          onPress={() => {
            setEditing(false);
            setGeneration((value) => value + 1);
          }}
        >
          Reset this trial
        </Button>
        <p>
          Local-only fixtures. Switching or resetting clears edits, history and observations, and
          turns editing off.
        </p>
      </div>
      <LabSession key={`${scenario.id}-${generation}`} scenario={scenario} editing={editing} />
    </div>
  );
}

function LabSession({ scenario, editing }: { scenario: LabScenario; editing: boolean }) {
  const editor = useRef<OutlineEditorHandle<LabData>>(null);
  const [protect, setProtect] = useState(scenario.id === "policy");
  const [rtl, setRtl] = useState(false);
  const [reversePlugins, setReversePlugins] = useState(false);
  const [lastClaim, setLastClaim] = useState("No plugin key claimed yet.");
  const [state, setState] = useState(() =>
    createOutlineEditorState(scenario.nodes, { expandedIds: new Set(scenario.expanded) }),
  );
  const previous = useRef(state);
  const revealTarget = useRef<HTMLSpanElement>(null);
  const pendingReaderReveal = useRef(false);
  const metadataRefusal = useRef<string | null>(null);
  const [hostRefusal, setHostRefusal] = useState<string | null>(null);
  const eventSequence = useRef(0);
  const [events, setEvents] = useState<readonly TrialEvent[]>([]);
  const [message, setMessage] = useState("Fresh trial. Reading mode; no actions recorded.");
  const [observations, setObservations] = useState<readonly Observation[]>(
    scenario.checks.map(() => "not-tested"),
  );
  const [notes, setNotes] = useState("");
  const [exported, setExported] = useState<{
    title: string;
    source: string;
    description: string;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFormat, setImportFormat] = useState<"json" | "titles">("json");
  const [importSource, setImportSource] = useState("");
  const [importError, setImportError] = useState("");
  const importId = useId();
  const notesId = useId();
  const checkId = useId();
  useLayoutEffect(() => {
    if (!pendingReaderReveal.current) return;
    pendingReaderReveal.current = false;
    // The public handle expands reader-local ancestors, but deliberately owns
    // DOM focus/scroll only in edit mode. Scroll this host-rendered title once
    // after its newly visible DOM commits; do not move focus or schedule work.
    if (!editing)
      revealTarget.current?.scrollIntoView({
        behavior: "instant",
        block: "center",
        inline: "nearest",
      });
  }, [state.focusVersion, editing]);
  const plugins = useMemo<readonly OutlinePlugin<LabData>[]>(() => {
    if (scenario.id !== "intelligence") return [];
    const names = reversePlugins ? ["fallback", "primary"] : ["primary", "fallback"];
    return names.map((name) => ({
      id: `lab-${name}`,
      keymap: (event, context) => {
        if (event.key !== "F2" || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)
          return undefined;
        setLastClaim(`${name} claimed F2. See the action trail for acceptance or refusal.`);
        return reviewAction(context.state, name);
      },
    }));
  }, [scenario.id, reversePlugins]);

  function dispatch(action: OutlineAction<LabData>) {
    editor.current?.dispatch(action);
  }
  function observe(next: OutlineEditorState<LabData>, action: OutlineAction<LabData>) {
    const before = previous.current;
    previous.current = next;
    setState(next);
    const validationMessage = metadataRefusal.current;
    metadataRefusal.current = null;
    setHostRefusal(next.refusal ? validationMessage : null);
    if (["caret", "focus"].includes(action.type)) return;
    const result = next.refusal
      ? validationMessage
        ? `Refused: invalid lab metadata (${validationMessage})`
        : `Refused: ${next.refusal}`
      : next.revision !== before.revision
        ? "Content changed"
        : "No content change";
    setMessage(`${action.type}: ${result.toLowerCase()}.`);
    const entry = {
      sequence: ++eventSequence.current,
      action: action.type,
      result,
      revision: next.revision,
      undo: next.history.past.length,
      redo: next.history.future.length,
    };
    setEvents((current) => [entry, ...current].slice(0, 8));
  }
  function exportDocument(format: "json" | "titles") {
    try {
      const source = editor.current?.exportWith(format === "json" ? jsonCodec : titleCodec);
      if (source === undefined) return;
      setExported({
        title: format === "json" ? "Export outline JSON" : "Export outline titles",
        source,
        description:
          format === "json"
            ? "Canonical document data: IDs, hierarchy, tasks and portable metadata. This is not an export of reader folds, history, provider state or the trusted counter’s local UI state."
            : "Title-text format only. IDs, rich bodies and application metadata are not preserved. This is not an arbitrary Markdown document codec.",
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    }
  }
  function applyImport() {
    if (!editing) return;
    try {
      editor.current?.importWith(importFormat === "json" ? jsonCodec : titleCodec, importSource);
      const refusal = editor.current?.getState().refusal;
      if (refusal)
        setImportError(
          `Import refused: ${refusal}. Your input is preserved. Check reference protection before retrying.`,
        );
      else {
        setImportOpen(false);
        setImportError("");
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Import failed validation.");
    }
  }
  function openReport() {
    const report = [
      "OUTLINER LAB — LOCAL MANUAL OBSERVATIONS",
      `Scenario: ${scenario.title}`,
      "These are self-reported observations, not automated certification or device coverage.",
      `Mode: ${editing ? "editing" : "reading"}; reference protection: ${protect ? "on" : "off"}; direction: ${rtl ? "RTL" : "LTR"}`,
      `Content revision: ${state.revision}; undo: ${state.history.past.length}; redo: ${state.history.future.length}`,
      `Rows: ${outlineIds(state.nodes).length}; visible: ${editorVisibleRows(state).length}; selected: ${state.selection.size}`,
      `Hoist: ${state.hoistedId ?? "full document"}; caret: ${state.caret ? `${state.caret.id} ${state.caret.start}–${state.caret.end}` : "none"}; current refusal: ${hostRefusal ?? state.refusal ?? "none"}`,
      "",
      "MANUAL CHECKS",
      ...scenario.checks.map(
        (check, index) => `${observationLabels[observations[index] ?? "not-tested"]}: ${check}`,
      ),
      "",
      "TESTER NOTES",
      notes || "No notes recorded.",
      "",
      "RECENT ACTIONS (newest first)",
      ...events.map(
        (event) =>
          `${event.sequence}. ${event.action}: ${event.result}; revision ${event.revision}; undo ${event.undo}; redo ${event.redo}`,
      ),
      "",
      "Not certified here: real-device touch/IME, TalkBack or other screen readers, performance budgets, all browser clipboard integrations, and the complete product contract.",
    ].join("\n");
    setExported({
      title: "Copy this trial report",
      source: report,
      description:
        "Includes only this trial’s diagnostics and your recorded observations. Copy it before switching scenarios; nothing is saved or sent automatically.",
    });
  }
  const selected = state.selection.size;
  const hasReference = !!findOutlineNode(state.nodes, "reference");
  const hasTarget = !!findOutlineNode(state.nodes, scenario.target);
  const hasBranch = !!findOutlineNode(state.nodes, scenario.branch);
  const reviewedBy = findOutlineNode(state.nodes, "draft")?.node.data?.reviewedBy;
  return (
    <>
      <section className="lab-workspace" aria-label="Live outliner workspace">
        <div className="lab-controls" role="group" aria-label="Reader navigation">
          <Button variant="quiet" onPress={() => dispatch({ type: "expand-all", expanded: true })}>
            Expand all
          </Button>
          <Button variant="quiet" onPress={() => dispatch({ type: "expand-all", expanded: false })}>
            Collapse all
          </Button>
          <Button
            variant="quiet"
            onPress={() => dispatch({ type: "expand-all", expanded: true, depth: 1 })}
          >
            Show one level
          </Button>
          <Button
            variant="quiet"
            isDisabled={!hasBranch}
            onPress={() => dispatch({ type: "hoist", id: scenario.branch })}
          >
            Focus sample branch
          </Button>
          <Button
            variant="quiet"
            aria-disabled={!state.hoistedId}
            onPress={() => {
              // Keep the navigation control focused after returning. A native
              // disabled button would discard focus as soon as hoist clears.
              if (state.hoistedId) dispatch({ type: "hoist", id: null });
            }}
          >
            Return to document
          </Button>
          <Button
            variant="quiet"
            isDisabled={!hasTarget}
            onPress={() => {
              pendingReaderReveal.current = !editing;
              editor.current?.reveal(scenario.target);
            }}
          >
            Reveal sample detail
          </Button>
        </div>
        {editing && (
          <div className="lab-selection" role="group" aria-label="Selection and history actions">
            <span>{selected} selected</span>
            <Button variant="quiet" onPress={() => dispatch({ type: "select-all" })}>
              Select all
            </Button>
            <Button
              variant="quiet"
              isDisabled={!selected}
              onPress={() => dispatch({ type: "clear-selection" })}
            >
              Clear selection
            </Button>
            <Button isDisabled={!selected} onPress={() => dispatch({ type: "indent" })}>
              Indent
            </Button>
            <Button isDisabled={!selected} onPress={() => dispatch({ type: "outdent" })}>
              Outdent
            </Button>
            <Button
              isDisabled={!selected}
              onPress={() => dispatch({ type: "move", direction: "up" })}
            >
              Move up
            </Button>
            <Button
              isDisabled={!selected}
              onPress={() => dispatch({ type: "move", direction: "down" })}
            >
              Move down
            </Button>
            <Button
              isDisabled={!selected}
              onPress={() => dispatch({ type: "tasks", ids: [...state.selection] })}
            >
              Toggle tasks
            </Button>
            <Button
              variant="danger"
              isDisabled={!selected}
              onPress={() => dispatch({ type: "delete" })}
            >
              Delete selected
            </Button>
            <Button
              isDisabled={!state.history.past.length}
              onPress={() => dispatch({ type: "undo" })}
            >
              Undo
            </Button>
            <Button
              isDisabled={!state.history.future.length}
              onPress={() => dispatch({ type: "redo" })}
            >
              Redo
            </Button>
          </div>
        )}
        <div className="lab-document" dir={rtl ? "rtl" : "ltr"}>
          <div className="lab-document-heading">
            <span>SYNTHETIC FIELD NOTES</span>
            <span>
              {editing ? "Editing · local changes are undoable" : "Reading · select text freely"}
            </span>
          </div>
          <OutlineEditor<LabData>
            ref={editor}
            defaultNodes={scenario.nodes}
            defaultExpandedIds={new Set(scenario.expanded)}
            readOnly={!editing}
            showToolbar={false}
            aria-label="Outliner lab document"
            isLocked={(node) => protect && node.id === "reference"}
            canChange={(_before, after) => {
              try {
                validateLabNodes(after);
                return true;
              } catch (error) {
                metadataRefusal.current =
                  error instanceof Error ? error.message : "Invalid host metadata.";
                return false;
              }
            }}
            onStateChange={observe}
            plugins={plugins}
            completionProviders={scenario.id === "intelligence" ? providers : undefined}
            getTextAnalysis={
              scenario.id === "intelligence"
                ? (node) => ({
                    text: node.text,
                    classifications: recognizeTextReferences(node.text).map((token) => ({
                      ...token,
                      kind: "reference",
                    })),
                  })
                : undefined
            }
            renderContent={(node) => (
              <span
                className="fast-ux-outliner__label"
                ref={node.id === scenario.target ? revealTarget : undefined}
              >
                {node.text}
              </span>
            )}
            renderBody={(node) =>
              node.data?.content ? (
                <RichContent
                  document={node.data.content}
                  registry={richRegistry}
                  allowMedia={() => false}
                />
              ) : null
            }
            renderAccessory={(node) =>
              node.id === "reference" && protect ? (
                <span className="lab-protected">Protected</span>
              ) : null
            }
          />
        </div>
        <div className="lab-policy" role="group" aria-label="Trial settings">
          <Checkbox label="Protect reference" isSelected={protect} onChange={setProtect} />
          <Checkbox label="RTL preview" isSelected={rtl} onChange={setRtl} />
          <Button
            variant="quiet"
            isDisabled={!hasReference}
            onPress={() => dispatch({ type: "task", id: "reference" })}
          >
            Probe write gate
          </Button>
          <p>
            The probe attempts a real task change on the reference. Reading mode or protection
            should refuse it. Client policy is not server authorization.
          </p>
        </div>
        {scenario.id === "intelligence" && (
          <div className="lab-extensions" role="group" aria-label="Extension trial">
            <Checkbox
              label="Fallback plugin first"
              isSelected={reversePlugins}
              onChange={setReversePlugins}
            />
            <Button
              isDisabled={!editing}
              onPress={() => {
                const current = editor.current?.getState();
                if (current) dispatch(reviewAction(current, "toolbar"));
              }}
            >
              Run review transaction
            </Button>
            <p>
              F2 order: {reversePlugins ? "fallback → primary" : "primary → fallback"}. {lastClaim}{" "}
              Accepted reviewer: {reviewedBy ?? "none"}.
            </p>
          </div>
        )}
        <p className="lab-live-status" role="status">
          {message}
        </p>
      </section>
      <details className="lab-guide">
        <summary>
          Scenario guide <span>{scenario.title}</span>
        </summary>
        <div className="lab-guide-content" aria-label="Scenario guide">
          <div>
            <span className="lab-eyebrow">THE TRIAL</span>
            <h2>{scenario.title}</h2>
            <p>{scenario.summary}</p>
          </div>
          <ol>
            {scenario.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      </details>
      <section className="lab-observatory" aria-label="Live diagnostics">
        <div className="lab-section-heading">
          <div>
            <span className="lab-eyebrow">OBSERVED STATE</span>
            <h2>Look behind the interaction</h2>
          </div>
          <span>Live model values, not a pass score</span>
        </div>
        <dl className="lab-metrics">
          <div>
            <dt>Content revision</dt>
            <dd data-testid="lab-revision">{state.revision}</dd>
          </div>
          <div>
            <dt>Undo / redo entries</dt>
            <dd data-testid="lab-history">
              {state.history.past.length} / {state.history.future.length}
            </dd>
          </div>
          <div>
            <dt>Visible / total rows</dt>
            <dd>
              {editorVisibleRows(state).length} / {outlineIds(state.nodes).length}
            </dd>
          </div>
          <div>
            <dt>Selected rows</dt>
            <dd>{selected}</dd>
          </div>
        </dl>
        <dl className="lab-detail-metrics">
          <div>
            <dt>Focused branch</dt>
            <dd>{state.hoistedId ?? "Full document"}</dd>
          </div>
          <div>
            <dt>Caret (UTF-16 offsets)</dt>
            <dd>
              {state.caret
                ? `${state.caret.id}: ${state.caret.start}–${state.caret.end}`
                : "No text caret"}
            </dd>
          </div>
          <div>
            <dt>Selected IDs</dt>
            <dd>{[...state.selection].join(", ") || "None"}</dd>
          </div>
          <div>
            <dt>Current refusal</dt>
            <dd>{hostRefusal ?? state.refusal ?? "None"}</dd>
          </div>
        </dl>
        <details className="lab-action-trail">
          <summary>Recent action trail · {events.length} recorded</summary>
          <p>
            Last eight non-caret/focus actions. “No content change” can be navigation, a no-op or a
            boundary—not proof that a test passed.
          </p>
          {events.length ? (
            <ol>
              {events.map((event) => (
                <li key={event.sequence}>
                  <strong>{event.action}</strong> — {event.result}. Revision {event.revision}; undo{" "}
                  {event.undo}, redo {event.redo}.
                </li>
              ))}
            </ol>
          ) : (
            <p>No actions recorded yet.</p>
          )}
        </details>
      </section>
      <section className="lab-evaluation" aria-label="Manual evaluation">
        <span className="lab-eyebrow">YOUR OBSERVATIONS</span>
        <h2>Judge the result, not the button click</h2>
        <p>
          These checks start untested. Record what you actually observe on your device; no
          interaction marks itself as passed.
        </p>
        <ol className="lab-checks">
          {scenario.checks.map((check, index) => (
            <li key={check}>
              <label htmlFor={`${checkId}-${index}`}>{check}</label>
              <select
                id={`${checkId}-${index}`}
                value={observations[index]}
                onChange={(event) => {
                  const value = event.currentTarget.value as Observation;
                  setObservations((current) =>
                    current.map((item, at) => (at === index ? value : item)),
                  );
                }}
              >
                {Object.entries(observationLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ol>
        <p className="lab-observation-summary">
          Self-reported: {observations.filter((item) => item === "observed").length} as expected ·{" "}
          {observations.filter((item) => item === "problem").length} problems ·{" "}
          {observations.filter((item) => item === "not-tested").length} not tested
        </p>
        <details>
          <summary>Add device notes or reproduction steps</summary>
          <label htmlFor={notesId}>Your local trial notes (avoid private data)</label>
          <textarea
            id={notesId}
            className="fux-textarea"
            rows={3}
            value={notes}
            onChange={(event) => setNotes(event.currentTarget.value)}
            placeholder="Device/browser, action, expected result, actual result…"
          />
        </details>
        <p className="lab-limits">
          Not certified by this playground: Android / TalkBack, real-device IME, all screen readers,
          performance budgets or complete interaction parity. A browser demo and its tests are only
          part of the acceptance evidence.
        </p>
      </section>
      <details className="lab-keyboard">
        <summary>Keyboard, clipboard & import test recipes</summary>
        <div className="lab-recipes">
          <div>
            <h3>Text and row modes</h3>
            <p>
              Enter splits a row; Shift + Enter inserts a line break. Escape enters row selection.
              Arrow keys navigate; Shift + arrows extend selection. Tab / Shift + Tab indent or
              outdent; Alt + Shift + arrows move rows. Ctrl / ⌘ + Z undoes; Shift + Ctrl / ⌘ + Z
              redoes. Test caret boundaries and IME on your actual device.
            </p>
          </div>
          <div>
            <h3>Use your real clipboard</h3>
            <p>
              Enable editing, Escape to select a row, then Ctrl / ⌘ + C or X. Select a destination
              and paste with Ctrl / ⌘ + V. Inspect nesting and metadata with JSON export. Within
              text mode, selected text uses ordinary text copy. Browser permissions and available
              MIME types affect clipboard behavior; a successful export copy does not certify
              structural clipboard.
            </p>
          </div>
          <div>
            <h3>Round-trip and refusal</h3>
            <p>
              Export JSON, edit the trial, then import that saved JSON. Compare the result and undo
              the import. Load the malformed example to test validation; cancel should leave the
              document unchanged. A protected reference can refuse replacement. Title text
              intentionally loses IDs and metadata; do not use it for a lossless rich-document
              round-trip.
            </p>
          </div>
        </div>
      </details>
      <section className="lab-more" aria-label="More outliner capabilities">
        <h2>Go deeper into the same public components</h2>
        <div>
          <a href="#outliner-extensions">
            Extension workbench →
            <span>
              Ordered plugins, atomic commands, insertion policies, typed prompts and a custom
              codec.
            </span>
          </a>
          <a href="#text-intelligence">
            Text intelligence →
            <span>
              Delayed and unavailable providers, cancellation, diagnostics and token information.
            </span>
          </a>
          <a href="#rich-content">
            Rich-content gallery →
            <span>
              Markdown, drawings, diagrams, images, audio/video, trusted React and reduced motion.
            </span>
          </a>
        </div>
      </section>
      <section className="lab-interchange" aria-label="Export, import and trial report">
        <div>
          <span className="lab-eyebrow">TAKE A SNAPSHOT</span>
          <h2>Source when you need it. Never in the way.</h2>
          <p>
            Exports open in an explicit modal with one whole-copy action. Imports replace this local
            trial through normal policy and undo history.
          </p>
        </div>
        <Row wrap>
          <Button onPress={() => exportDocument("json")}>Export JSON</Button>
          <Button variant="quiet" onPress={() => exportDocument("titles")}>
            Export title text
          </Button>
          <Button
            isDisabled={!editing}
            onPress={() => {
              setImportError("");
              setImportOpen(true);
            }}
          >
            Import document
          </Button>
          <Button variant="quiet" onPress={openReport}>
            Copy trial report
          </Button>
        </Row>
      </section>
      <ModalDialog
        title={exported?.title ?? "Export"}
        isOpen={exported !== null}
        onOpenChange={(open) => {
          if (!open) setExported(null);
        }}
      >
        <p>{exported?.description}</p>
        <Code title="Whole local snapshot">{exported?.source ?? ""}</Code>
      </ModalDialog>
      <ModalDialog
        title="Import into this trial"
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        footer={
          <Button isDisabled={!editing || !importSource.trim()} onPress={applyImport}>
            Apply import
          </Button>
        }
      >
        <p>
          Validated replacement, not a merge. Cancel leaves the document unchanged. Successful
          changes are undoable; protection still applies.
        </p>
        <label className="lab-import-format">
          Import format
          <select
            value={importFormat}
            onChange={(event) => {
              setImportFormat(event.currentTarget.value as "json" | "titles");
              setImportError("");
            }}
          >
            <option value="json">Canonical outline JSON</option>
            <option value="titles">Outline title text (lossy)</option>
          </select>
        </label>
        {importFormat === "titles" && (
          <p>
            Title text does not preserve IDs, rich content or application metadata, and is not an
            arbitrary Markdown codec.
          </p>
        )}
        <Row wrap>
          <Button
            variant="quiet"
            onPress={() => {
              setImportFormat("json");
              setImportSource(jsonCodec.encode(scenario.nodes));
              setImportError("");
            }}
          >
            Load scenario JSON
          </Button>
          <Button
            variant="quiet"
            onPress={() => {
              setImportFormat("json");
              setImportSource("{ not valid JSON");
              setImportError("");
            }}
          >
            Load malformed example
          </Button>
        </Row>
        <label htmlFor={importId}>Import source</label>
        <textarea
          id={importId}
          className="fux-textarea"
          rows={9}
          value={importSource}
          onChange={(event) => setImportSource(event.currentTarget.value)}
        />
        {importError && <p role="alert">{importError}</p>}
      </ModalDialog>
    </>
  );
}
