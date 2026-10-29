# Optional note editing

Notes are a separate, opt-in plain-text field. `OutlineEditor` still defaults to
read-only, and adding an adapter does not activate editing or change title keys.
No new persistence, collaboration, rich-text parser or service is supplied.

## Let the host own its data

```tsx
import { OutlineEditor, type OutlineNode, type OutlineNoteAdapter } from "@samhagman/fast-ux-kit";

interface ItemData {
  readonly note: string;
  readonly reference: string;
}
const noteAdapter: OutlineNoteAdapter<ItemData> = {
  read: (node) => node.data?.note,
  prepareData: (node, note) =>
    node.data ? { ok: true, data: { ...node.data, note } } : { ok: false },
};
const nodes: readonly OutlineNode<ItemData>[] = [
  { id: "one", text: "Field journal", data: { note: "", reference: "J-14" } },
];

<OutlineEditor defaultNodes={nodes} readOnly={false} noteAdapter={noteAdapter} />;
```

An adapter is trusted host code, never document-supplied code. Both functions must
be pure and deterministic; preparation must not mutate its arguments. `read`
returns a string (including `""`) for an editable note, or `undefined` when that
node has no note surface. A thrown exception or non-string result is unavailable.
To support empty notes on an optional property, return `node.data?.note ?? ""`
and explicitly define how your adapter constructs the rest of that host schema.

`prepareData` receives the latest canonical node, not a search projection or stale
render closure. It returns `{ ok: true, data }` or `{ ok: false }`. The editor
rereads the proposed node and requires the exact requested note before applying
one ordinary immutable data update. The library does not spread or infer how to
merge arbitrary `T`; preserving unrelated metadata is the host adapter's job.
Missing/malformed results, adapter failures, read-only mode, inherited locks and
host-policy refusal leave canonical nodes and history unchanged. A no-op does not
call preparation or create a revision.

## Field and keyboard contract

- Editing exposes an explicit **Edit note** action with a 44px target.
- A note textarea owns note input; it never goes through title splitting,
  structural paste, merge, row navigation or title completion acceptance.
- Enter adds a native newline. Tab inserts a literal tab. Shift+Tab retains native
  backward navigation. Paste inserts only plain text in this field.
- Escape finishes editing while retaining already-applied changes; it is not
  Cancel. **Return to title** is a nonmutating, explicit alternative.
- `noteKeyboardProfile="toggle"` additionally enables Shift+Enter title ↔ note.
  Without that prop, existing title Shift+Enter behavior is unchanged. Existing
  popup/plugin ownership and composition guards take priority.
- `OutlinePlugin.noteKeymap` is a separate optional hook receiving
  `OutlineNoteKeyContext` with `field: "note"`. Legacy title/row `keymap` hooks
  never receive note events. A consumed or refused action does not falsely switch
  fields. Adapters and plugins remain trusted application code.

Notes update canonical data immediately. Default search reads `data.note`; when
your adapter stores notes elsewhere, supply a matching `OutlineSearch.getDetails`
so search reads that same canonical field. The active note input is separate from title inputs and their
vertical-navigation geometry. Consumer `renderBody` remains mounted and additive;
it is never replaced by the note editor. In editing mode the default plain note
preview is omitted when a consumer body renderer owns that presentation. In
read-only mode the existing reader contract is unchanged: supply `renderBody` (or
another trusted reader renderer) if notes should be visible. Adapter presence
alone does not add new reader content.

## Portable actions and history

```ts
state = reduceOutlineEditor(
  state,
  { type: "note", id: "one", text: "A second observation", caret: 20, time: 1000 },
  { readOnly: false, noteAdapter },
);
```

`OutlineCaret.field?: "note"` distinguishes the field; omitted means title.
`focus`, `caret`, `reveal` and an explicit transaction caret accept this optional
field. Note offsets are UTF-16 offsets clamped to the adapter's current string.
Malformed or unavailable explicit note targets refuse rather than silently
retargeting title text. Existing title caret and history shapes remain unchanged.

Typing uses the existing bounded coalescing interval, additionally separated by
row and field. Note history retains the applied note caret for redo; undo/redo
reevaluate current mutation policy. Changes to reader folds are still local view
state, not document changes. This is local bounded history, not a remote revision
service or a claim about any other editor's grouping algorithm.

`reconcileOutlineEditorState(state, nodes, { noteAdapter })` lets a portable host
normalize note carets after authoritative replacement. React supplies its adapter
automatically. A same-identity adapter change can clamp or fall back to a title
caret without resetting content history. An actual external replacement clears
local history, while an accepted optimistic echo retains it. Removed/hidden
targets and unavailable adapters never leave an orphan note input.

## Verification boundaries

`editor-note-core.test.ts` and `outline-notes-react.test.tsx` exercise mutation,
field history, policy, controlled updates, opt-in keys, plugin isolation and
synthetic composition. `#outline-note-lab` is a resettable, read-first local host
composition with explicit editing, policy probes and canonical search. It uses
synthetic data only.

DOM emulation does not certify native IME, touch keyboards, accessibility reading
order or mobile clipboard behavior. Browser acceptance and exact aggregate check
results belong to the checked snapshot's evidence record. No completeness claim
is implied by this optional field.
