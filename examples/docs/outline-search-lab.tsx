import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Label, TextArea, TextField } from "react-aria-components";
import { Button, Checkbox, Field } from "../../src/components/aria.js";
import {
  applyOutlineSort,
  createOutlineEditorState,
  findOutlineNode,
  getOutlineItemDetails,
  outlineTagInventory,
  reduceOutlineEditor,
  type OutlineAction,
  type OutlineItemDetails,
  type OutlineNode,
  type OutlineSortKey,
} from "../../src/core/index.js";
import { OutlineSearch } from "../../src/react/index.js";
import { PageHeading } from "./ui.js";

interface LabDetails extends OutlineItemDetails {
  readonly protected?: boolean;
  readonly hostOnly?: { readonly reference: string };
}
/** Fresh synthetic data for each mount/reset; never a service or file-backed document. */
function makeOutline(): readonly OutlineNode<LabDetails>[] {
  return [
    {
      id: "workshop",
      text: "Workshop #home",
      data: {
        note: "A small corner for making things.\nKeep the work surface clear.",
        dates: [{ start: 3000 }],
      },
      children: [
        {
          id: "lamp",
          text: "Repair desk lamp #home",
          checked: false,
          data: {
            note: "Choose a warm bulb #errands",
            hostOnly: { reference: "Kept by the host" },
          },
        },
        {
          id: "sketches",
          text: "Sketchbook #ideas",
          data: { note: "Draw the next project before buying materials." },
          children: [
            { id: "shelf", text: "A narrow shelf #ideas", data: { note: "Measure twice." } },
          ],
        },
      ],
    },
    {
      id: "garden",
      text: "Garden journal #outside",
      data: {
        note: "The first seedlings are planted.",
        completed: true,
        checkbox: false,
        dates: [{ start: 1000 }],
      },
    },
    {
      id: "reading",
      text: "Reading list #ideas",
      data: { note: "A quiet evening and a short chapter.", dates: [{ start: 2000 }] },
    },
    {
      id: "reference",
      text: "Zebra reference",
      data: { note: "This row is protected. Sorts cannot displace it.", protected: true },
    },
  ];
}
const locked = (node: OutlineNode<LabDetails>) => node.data?.protected === true;
const initialSession = () => ({
  editor: createOutlineEditorState(makeOutline()),
  message: "Reading mode. No document changes yet.",
});
interface DetailDraft {
  readonly title: string;
  readonly note: string;
  readonly completed: boolean;
  readonly checkbox: boolean;
}
const emptyDraft: DetailDraft = { title: "", note: "", completed: false, checkbox: false };
function draftFor(node: OutlineNode<LabDetails> | undefined): DetailDraft {
  if (!node) return emptyDraft;
  const details = getOutlineItemDetails(node);
  return {
    title: node.text,
    note: details.note ?? "",
    completed: details.completed === true,
    checkbox: details.checkbox === true,
  };
}
const sortLabels: readonly { key: OutlineSortKey; label: string }[] = [
  { key: "title", label: "Sort roots by title" },
  { key: "completion", label: "Sort roots by completion" },
  { key: "date", label: "Sort roots by date" },
  { key: "reverse", label: "Reverse root order" },
];

/** An optional, resettable host composition: searching remains a reader, not an editor. */
export function OutlineSearchLab() {
  const [session, setSession] = useState(initialSession);
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DetailDraft>(emptyDraft);
  const [run, setRun] = useState(0);
  const headingId = useId();
  const detailsId = useId();
  const detailsHeading = useRef<HTMLHeadingElement>(null);
  const node = selectedId ? findOutlineNode(session.editor.nodes, selectedId)?.node : undefined;
  const details = node ? getOutlineItemDetails(node) : undefined;
  const dirty =
    !!node &&
    (draft.title !== node.text ||
      draft.note !== (details?.note ?? "") ||
      draft.completed !== (details?.completed === true) ||
      draft.checkbox !== (details?.checkbox === true));
  const tags = useMemo(() => outlineTagInventory(session.editor.nodes), [session.editor.nodes]);
  useEffect(() => {
    setDraft(draftFor(node));
  }, [node, editing]);

  function dispatch(action: OutlineAction<LabDetails>, success: string) {
    if (editing && dirty) {
      setSession((before) => ({
        ...before,
        message: "Save or discard the selected draft before undoing or redoing.",
      }));
      return;
    }
    setSession((before) => {
      const next = reduceOutlineEditor(before.editor, action, {
        readOnly: !editing,
        isLocked: locked,
      });
      return {
        editor: next,
        message: next.refusal
          ? `Change refused: ${next.refusal}. Nothing changed.`
          : next.nodes === before.editor.nodes
            ? "No content change."
            : success,
      };
    });
  }
  function save() {
    if (!node || !editing || !dirty) return;
    setSession((before) => {
      // Resolve again inside the state update: never merge data from a stale projection.
      const current = findOutlineNode(before.editor.nodes, node.id)?.node;
      if (!current) return { ...before, message: "Change refused: item no longer exists." };
      const currentDetails = getOutlineItemDetails(current);
      if (
        draft.title === current.text &&
        draft.note === (currentDetails.note ?? "") &&
        draft.completed === (currentDetails.completed === true) &&
        draft.checkbox === (currentDetails.checkbox === true)
      )
        return { ...before, message: "No content change." };
      const next = reduceOutlineEditor(
        before.editor,
        {
          type: "transaction",
          commands: [
            {
              type: "update",
              id: current.id,
              changes: {
                text: draft.title,
                checked: draft.checkbox ? draft.completed : null,
                data: {
                  ...current.data,
                  note: draft.note,
                  completed: draft.completed,
                  checkbox: draft.checkbox,
                },
              },
            },
          ],
        },
        { readOnly: !editing, isLocked: locked },
      );
      return {
        editor: next,
        message: next.refusal
          ? `Change refused: ${next.refusal}. Nothing changed.`
          : "Saved selected item as one undo step. Search now uses the updated outline.",
      };
    });
  }
  function sort(by: OutlineSortKey) {
    if (!editing) return;
    setSession((before) => {
      const next = applyOutlineSort(
        before.editor,
        { parentId: null, by },
        { readOnly: !editing, isLocked: locked },
      );
      return {
        editor: next,
        message: next.refusal
          ? `Sort refused: ${next.refusal}. Nothing changed.`
          : next.nodes === before.editor.nodes
            ? "Root order is already unchanged."
            : "Root order changed as one undo step.",
      };
    });
  }
  function reset() {
    setSession(initialSession());
    setEditing(false);
    setQuery("");
    setSelectedId(null);
    setDraft(emptyDraft);
    setRun((value) => value + 1);
  }

  return (
    <article className="outliner-lab" aria-labelledby={headingId}>
      <PageHeading
        category="Outliner"
        title="Outline search lab"
        description="Read, search and inspect a small local outline. Editing is an explicit, separate choice."
      />
      <h2 id={headingId}>Try a local outline</h2>
      <p>
        Search, folding, note visibility and hiding completed branches only change the view. They
        never edit the document.
      </p>
      <div className="lab-controls" role="group" aria-label="Local editing controls">
        <Checkbox label="Enable local editing" isSelected={editing} onChange={setEditing} />
        <Button
          isDisabled={!editing || !session.editor.history.past.length}
          onPress={() => dispatch({ type: "undo" }, "Undid one local change.")}
        >
          Undo local change
        </Button>
        <Button
          isDisabled={!editing || !session.editor.history.future.length}
          onPress={() => dispatch({ type: "redo" }, "Redid one local change.")}
        >
          Redo local change
        </Button>
        <Button variant="quiet" onPress={reset}>
          Reset local outline
        </Button>
      </div>
      <p role="status" aria-label="Local changes">
        {session.message}
      </p>
      <p>
        Document revision: <output aria-label="Document revision">{session.editor.revision}</output>
        . Nothing is saved outside this page.
      </p>
      <section aria-label="Tag inventory">
        <h3>Start with a tag</h3>
        <div className="lab-controls">
          {tags.map((tag) => (
            <Button
              key={tag.key}
              variant="quiet"
              aria-label={`Search tag ${tag.trigger}${tag.spelling}`}
              onPress={() => setQuery(tag.trigger + tag.spelling)}
            >
              {tag.trigger}
              {tag.spelling} · {tag.count}
            </Button>
          ))}
        </div>
      </section>
      <OutlineSearch
        key={run}
        nodes={session.editor.nodes}
        query={query}
        onQueryChange={setQuery}
        onReveal={(id) => {
          if (editing && dirty && id !== selectedId) {
            setSession((before) => ({
              ...before,
              message: "Save or discard the selected draft before revealing another item.",
            }));
            detailsHeading.current?.focus();
            detailsHeading.current?.scrollIntoView({ block: "nearest" });
            return;
          }
          setSelectedId(id);
          detailsHeading.current?.focus();
          detailsHeading.current?.scrollIntoView({ block: "nearest" });
        }}
        label="Local outline search"
      />
      <section aria-label="Root sorting">
        <h3>Sort immediate roots</h3>
        <p>
          These commands move whole branches, not search results. The protected reference stays
          protected, including when another row would displace it.
        </p>
        <div className="lab-controls">
          {sortLabels.map(({ key, label }) => (
            <Button key={key} isDisabled={!editing} onPress={() => sort(key)}>
              {label}
            </Button>
          ))}
        </div>
      </section>
      <section aria-labelledby={detailsId}>
        <h3 id={detailsId} ref={detailsHeading} tabIndex={-1}>
          Selected item details
        </h3>
        {!node ? (
          <p>Use a row’s Reveal button to inspect its canonical item here.</p>
        ) : (
          <>
            <p>
              Selected item: <strong>{node.text}</strong>
            </p>
            {locked(node) && (
              <p>This item is protected. Saves and sorts that move it are refused atomically.</p>
            )}
            {node.data?.hostOnly && <p>Host-only reference: {node.data.hostOnly.reference}</p>}
            {!editing ? (
              <>
                <p>Reading mode. Enable local editing to change this item.</p>
                <dl>
                  <dt>Title</dt>
                  <dd>{node.text}</dd>
                  <dt>Note</dt>
                  <dd style={{ whiteSpace: "pre-wrap" }}>{details?.note || "No note"}</dd>
                  <dt>Completed</dt>
                  <dd>{details?.completed ? "Yes" : "No"}</dd>
                  <dt>Checkbox</dt>
                  <dd>{details?.checkbox ? "Shown" : "Not shown"}</dd>
                </dl>
              </>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  save();
                }}
              >
                <Field
                  label="Selected title"
                  value={draft.title}
                  onChange={(title) => setDraft((before) => ({ ...before, title }))}
                />
                <TextField
                  className="fux-field"
                  value={draft.note}
                  onChange={(note) => setDraft((before) => ({ ...before, note }))}
                >
                  <Label className="fux-label">Selected note</Label>
                  <TextArea
                    className="fux-input"
                    style={{ minBlockSize: "6rem", resize: "vertical" }}
                  />
                </TextField>
                <Checkbox
                  label="Item completed"
                  isSelected={draft.completed}
                  onChange={(completed) => setDraft((before) => ({ ...before, completed }))}
                />
                <Checkbox
                  label="Show item checkbox"
                  isSelected={draft.checkbox}
                  onChange={(checkbox) => setDraft((before) => ({ ...before, checkbox }))}
                />
                <Button type="submit" variant="primary" isDisabled={!dirty}>
                  Save selected item
                </Button>
                <Button
                  type="button"
                  variant="quiet"
                  onPress={() => {
                    setDraft(draftFor(node));
                    setSession((before) => ({
                      ...before,
                      message: "Discarded the selected draft. No document change.",
                    }));
                  }}
                >
                  Discard selected draft
                </Button>
              </form>
            )}
          </>
        )}
      </section>
      <p>
        Draft fields do not change search until Save. Save or discard a dirty draft before revealing
        another item or using history. Turning editing off discards unsaved drafts. Undo and redo
        are ordinary reducer actions; view projections never enter the reducer.
      </p>
    </article>
  );
}
