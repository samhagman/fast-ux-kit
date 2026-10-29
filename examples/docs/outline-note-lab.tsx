import { useEffect, useRef, useState } from "react";
import { Button, Checkbox } from "../../src/components/aria.js";
import {
  type OutlineEditorState,
  type OutlineNode,
  type OutlineNoteAdapter,
} from "../../src/core/index.js";
import { OutlineEditor, OutlineSearch, type OutlineEditorHandle } from "../../src/react/index.js";
import { PageHeading } from "./ui.js";

interface NoteData {
  readonly note: string;
  readonly protected?: boolean;
  readonly reference: string;
}
function makeOutline(): readonly OutlineNode<NoteData>[] {
  return [
    {
      id: "cedar",
      text: "Cedar field journal",
      data: {
        note: "A cool morning beside the trail.\nBring a pencil next time.",
        reference: "C-17",
      },
      children: [{ id: "maple", text: "Maple observation", data: { note: "", reference: "M-23" } }],
    },
    {
      id: "archive",
      text: "Protected reference",
      data: { note: "This entry remains unchanged.", protected: true, reference: "A-08" },
    },
  ];
}
const noteAdapter: OutlineNoteAdapter<NoteData> = {
  read: (node) => node.data?.note,
  prepareData: (node, note) =>
    node.data ? { ok: true, data: { ...node.data, note } } : { ok: false },
};
const locked = (node: OutlineNode<NoteData>) => node.data?.protected === true;

/** A host-owned, synthetic local document. No persistence or service connection. */
export function OutlineNoteLab() {
  const [nodes, setNodes] = useState(makeOutline);
  const [editing, setEditing] = useState(false);
  const [profile, setProfile] = useState(false);
  const [paused, setPaused] = useState(false);
  const [run, setRun] = useState(0);
  const [state, setState] = useState<OutlineEditorState<NoteData> | null>(null);
  const editor = useRef<OutlineEditorHandle<NoteData>>(null);
  // Host replacement is reconciliation, not an emitted editor action.
  useEffect(() => {
    setState(editor.current?.getState() ?? null);
  }, [nodes, run]);
  function reset() {
    setNodes(makeOutline());
    setEditing(false);
    setProfile(false);
    setPaused(false);
    setState(null);
    setRun((value) => value + 1);
  }
  return (
    <article className="outliner-lab">
      <PageHeading
        category="Outliner"
        title="Outline note lab"
        description="A separate note field, immediate local updates and field-aware history. Reading never enables editing."
      />
      <div className="lab-controls" role="group" aria-label="Note lab controls">
        <Checkbox label="Enable local note editing" isSelected={editing} onChange={setEditing} />
        <Checkbox
          label="Enable Shift+Enter field switching"
          isSelected={profile}
          onChange={setProfile}
        />
        <Checkbox label="Pause document changes" isSelected={paused} onChange={setPaused} />
        <Button variant="quiet" onPress={reset}>
          Reset note lab
        </Button>
      </div>
      <p>
        Choose Edit note after enabling editing. Enter adds a line; Tab inserts a tab. Escape
        finishes editing and keeps the changes. Return to title is also available without a
        shortcut. Shift+Enter switching is a separate opt-in.
      </p>
      <OutlineEditor
        key={run}
        ref={editor}
        nodes={nodes}
        onNodesChange={setNodes}
        onStateChange={setState}
        readOnly={!editing}
        noteAdapter={noteAdapter}
        noteKeyboardProfile={profile ? "toggle" : undefined}
        isLocked={locked}
        canChange={() => !paused}
        renderBody={
          !editing
            ? (node) =>
                node.data?.note ? <p style={{ whiteSpace: "pre-wrap" }}>{node.data.note}</p> : null
            : undefined
        }
        renderSuffix={(node) => (node.data ? <span>Reference {node.data.reference}</span> : null)}
        aria-label="Local field journal"
      />
      <div className="lab-controls" role="group" aria-label="Local note history">
        <Button
          isDisabled={!editing || !state?.history.past.length}
          onPress={() => editor.current?.dispatch({ type: "undo" })}
        >
          Undo local change
        </Button>
        <Button
          isDisabled={!editing || !state?.history.future.length}
          onPress={() => editor.current?.dispatch({ type: "redo" })}
        >
          Redo local change
        </Button>
        <Button
          onPress={() => {
            setNodes(makeOutline());
          }}
        >
          Replace with fresh local document
        </Button>
      </div>
      <p role="status" aria-label="Note lab state">
        Revision {state?.revision ?? 0}. Undo {state?.history.past.length ?? 0}. Redo{" "}
        {state?.history.future.length ?? 0}.
        {state?.refusal ? ` Change refused: ${state.refusal}.` : ""}
        {state?.caret
          ? ` Active field: ${state.caret.field ?? "title"}.`
          : " No text field active."}
      </p>
      <details>
        <summary>Inspect the current document</summary>
        <p>
          Search reads the same canonical notes immediately. The reference metadata stays
          host-owned.
        </p>
        <OutlineSearch nodes={nodes} label="Field journal search" />
      </details>
      <p>
        This page uses a typed adapter to preserve its known metadata. The library does not guess
        how arbitrary host data should be merged. External replacement clears local history;
        optimistic echoes retain it. Nothing is saved outside this page.
      </p>
    </article>
  );
}
