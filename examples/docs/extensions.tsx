import { useId, useMemo, useRef, useState } from "react";
import { Button, Checkbox, ModalDialog, Row, Stack } from "../../src/components/aria.js";
import {
  OutlineEditor,
  type OutlineEditorHandle,
  type OutlinePlugin,
} from "../../src/react/index.js";
import {
  exportOutlineJSON,
  importOutlineJSON,
  findOutlineNode,
  type OutlineAction,
  type OutlineCodec,
  type OutlineEditorState,
  type OutlineNode,
} from "../../src/core/index.js";
import { Code, type ComponentDemo } from "./ui.js";

const envelopeHeader = "FAST-UX-DEMO/1\n";
/** A small application envelope around the lossless canonical document format. */
export const demoEnvelopeCodec: OutlineCodec = {
  id: "demo-envelope-v1",
  mimeType: "application/x-fast-ux-demo-envelope",
  encode: (nodes) => envelopeHeader + exportOutlineJSON(nodes),
  decode: (source) => {
    if (!source.startsWith(envelopeHeader)) throw new Error("Expected a FAST-UX-DEMO/1 envelope.");
    return importOutlineJSON(source.slice(envelopeHeader.length)).nodes;
  },
};
const initialNodes: readonly OutlineNode[] = [
  {
    id: "draft",
    text: "Review the release notes",
    checked: false,
    data: { owner: "Design", reviewed: false, tags: ["local", "draft"] },
    children: [
      { id: "detail", text: "Preserve this nested detail and its metadata", data: { priority: 2 } },
    ],
  },
  { id: "review-log", text: "No review recorded", data: { kind: "audit" } },
];
function reviewAction(state: OutlineEditorState, author: string): OutlineAction {
  const draft = findOutlineNode(state.nodes, "draft")?.node;
  const data =
    draft?.data && typeof draft.data === "object" && !Array.isArray(draft.data) ? draft.data : {};
  return {
    type: "transaction",
    commands: [
      {
        type: "update",
        id: "draft",
        changes: { checked: true, data: { ...data, reviewed: true, reviewedBy: author } },
      },
      { type: "update", id: "review-log", changes: { text: `Review recorded by ${author}` } },
    ],
  };
}
export function ExtensionsDemo() {
  const editor = useRef<OutlineEditorHandle>(null);
  const sourceId = useId();
  const [editing, setEditing] = useState(false),
    [protect, setProtect] = useState(false),
    [reverse, setReverse] = useState(false);
  const [claims, setClaims] = useState({ primary: 0, fallback: 0 });
  const [observed, setObserved] = useState({ primary: 0, fallback: 0 });
  const [revision, setRevision] = useState(0),
    [past, setPast] = useState(0),
    [future, setFuture] = useState(0);
  const [message, setMessage] = useState(
    "Reading mode. Enable editing to change this local document.",
  );
  const [exported, setExported] = useState<string | null>(null),
    [importOpen, setImportOpen] = useState(false),
    [source, setSource] = useState("");
  const [importError, setImportError] = useState("");
  const plugins = useMemo<readonly OutlinePlugin[]>(() => {
    function plugin(id: "primary" | "fallback"): OutlinePlugin {
      return {
        id,
        keymap: (event, context) => {
          if (
            event.key !== "F2" ||
            event.altKey ||
            event.ctrlKey ||
            event.metaKey ||
            event.shiftKey
          )
            return undefined;
          setClaims((counts) => ({ ...counts, [id]: counts[id] + 1 }));
          return reviewAction(context.state, id);
        },
        afterAction: (action) => {
          if (action.type === "transaction")
            setObserved((counts) => ({ ...counts, [id]: counts[id] + 1 }));
        },
      };
    }
    const ordered = [plugin("primary"), plugin("fallback")];
    return reverse ? ordered.reverse() : ordered;
  }, [reverse]);
  function importEnvelope() {
    try {
      editor.current?.importWith(demoEnvelopeCodec, source);
      const state = editor.current?.getState();
      if (state?.refusal) setImportError(`Import refused: ${state.refusal}.`);
      else {
        setImportOpen(false);
        setImportError("");
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : "Invalid envelope.");
    }
  }
  return (
    <Stack gap="lg">
      <p>
        Two ordered plugins share one editor. F2 is claimed by the first plugin; both observe the
        resulting transaction. The visible action works without a hardware keyboard.
      </p>
      <Row wrap>
        <Checkbox label="Enable extension editing" isSelected={editing} onChange={setEditing} />
        <Checkbox label="Protect review log" isSelected={protect} onChange={setProtect} />
        <Checkbox label="Fallback plugin first" isSelected={reverse} onChange={setReverse} />
      </Row>
      <Row wrap>
        <Button
          isDisabled={!editing}
          onPress={() => {
            const state = editor.current?.getState();
            if (state) editor.current?.dispatch(reviewAction(state, "toolbar"));
          }}
        >
          Mark reviewed
        </Button>
        <Button
          isDisabled={!editing || !past}
          onPress={() => editor.current?.dispatch({ type: "undo" })}
        >
          Undo extension change
        </Button>
        <Button
          isDisabled={!editing || !future}
          onPress={() => editor.current?.dispatch({ type: "redo" })}
        >
          Redo extension change
        </Button>
      </Row>
      <p>
        Plugin order: {reverse ? "fallback → primary" : "primary → fallback"}. A protected log
        refuses the whole review transaction: neither row changes.
      </p>
      <div className="editor-demo">
        <OutlineEditor
          ref={editor}
          defaultNodes={initialNodes}
          readOnly={!editing}
          plugins={plugins}
          defaultExpandedIds={new Set()}
          aria-label="Extension outline"
          isLocked={(node) => protect && node.id === "review-log"}
          onStateChange={(state, action) => {
            setRevision(state.revision);
            setPast(state.history.past.length);
            setFuture(state.history.future.length);
            if (state.refusal) setMessage(`Action refused: ${state.refusal}.`);
            else if (!["caret", "focus", "select"].includes(action.type))
              setMessage(`Last action: ${action.type}.`);
          }}
          renderAccessory={(node) =>
            node.id === "draft" ? (
              <span className="fux-badge">{node.checked ? "Reviewed" : "Needs review"}</span>
            ) : null
          }
          renderCollapsed={(node) => (
            <span>{node.children?.length ?? 0} nested detail preserved</span>
          )}
          getPlaceholders={(parent) =>
            parent === null
              ? [{ id: "next-note", label: "Add a follow-up note", text: "Follow-up: " }]
              : []
          }
        />
      </div>
      <div className="editor-status" aria-label="Extension diagnostics">
        <span>Content revision {revision}</span>
        <span>
          Undo entries {past}; redo entries {future}
        </span>
        <span>
          Primary: {claims.primary} F2 claims; {observed.primary} transactions observed
        </span>
        <span>
          Fallback: {claims.fallback} F2 claims; {observed.fallback} transactions observed
        </span>
        <span role="status">{message}</span>
      </div>
      <details className="keyboard-guide">
        <summary>How to try the extension points</summary>
        <p>
          Enable editing, focus a row and press F2. Swap plugin order and press F2 again. Undo
          restores both the review marker and the log together. Turn on log protection to see the
          same policy apply to keyboard and toolbar actions. The follow-up prompt inserts a real row
          with ordinary undo history.
        </p>
      </details>
      <div>
        <h3>Local envelope interchange</h3>
        <p>
          This custom codec wraps canonical JSON, preserving IDs, nested rows, tasks and application
          metadata. Import is validated and undoable; nothing is uploaded.
        </p>
        <Row wrap>
          <Button
            variant="quiet"
            onPress={() => {
              try {
                setExported(editor.current?.exportWith(demoEnvelopeCodec) ?? "");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Cannot export document.");
              }
            }}
          >
            Export envelope
          </Button>
          <Button
            variant="quiet"
            isDisabled={!editing}
            onPress={() => {
              setImportError("");
              setImportOpen(true);
            }}
          >
            Import envelope
          </Button>
        </Row>
      </div>
      <ModalDialog
        title="Export extension envelope"
        isOpen={exported !== null}
        onOpenChange={(open) => {
          if (!open) setExported(null);
        }}
      >
        <Code title="Lossless local envelope">{exported ?? ""}</Code>
      </ModalDialog>
      <ModalDialog
        title="Import extension envelope"
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        footer={
          <Button isDisabled={!editing || !source.trim()} onPress={importEnvelope}>
            Apply envelope
          </Button>
        }
      >
        <label className="fux-field-label" htmlFor={sourceId}>
          Envelope source
        </label>
        <textarea
          id={sourceId}
          className="fux-textarea"
          rows={10}
          value={source}
          onChange={(event) => setSource(event.currentTarget.value)}
        />
        <p role="alert">{importError}</p>
      </ModalDialog>
    </Stack>
  );
}
export const extensionDemo: ComponentDemo = {
  render: () => <ExtensionsDemo />,
  code: `const plugins: readonly OutlinePlugin[] = [primary, fallback];
// First defined keymap result wins; actions still pass policy and history.
<OutlineEditor ref={editor} readOnly={!editing} plugins={plugins} />
editor.current?.dispatch({ type: "transaction", commands: [
  { type: "update", id: "draft", changes: { checked: true } },
  { type: "update", id: "review-log", changes: { text: "Reviewed" } },
] });
if (editor.current) {
  const saved = editor.current.exportWith(demoEnvelopeCodec);
  editor.current.importWith(demoEnvelopeCodec, saved);
}`,
  notes: [
    "Plugins are trusted application code, not executable document data.",
    "Custom codecs must return valid outline nodes. Only the canonical JSON payload is lossless for portable document metadata.",
    "F2 never bypasses read-only mode, locks or the shared transaction history.",
  ],
};
