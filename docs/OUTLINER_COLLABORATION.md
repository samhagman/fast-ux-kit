# Provider-neutral collaboration and image rows

`Outliner` remains storage-free. A controlled host can supply `collaboration` to own replicated editing without a CRDT dependency in the kit:

```tsx
<Outliner
  value={nodes}
  onValueChange={(next, meta) => {
    // meta.base is the EXACT snapshot this local operation used, not a later prop.
    // meta.operation contains the full command; meta.beforeCaret / afterCaret use UTF-16.
    adapter.applyLocal(meta.base, next, meta.operation);
    setNodes(next); // echo local acceptance promptly, before another remote publication
  }}
  collaboration={{
    canUndo: adapter.canUndo,
    canRedo: adapter.canRedo,
    undo: () => adapter.undo(),
    redo: () => adapter.redo(),
    mapCaret: (caret, before, incoming) => adapter.mapCaret(caret, before, incoming),
    onFieldEvent: (event) => adapter.fieldEvent(event),
  }}
/>
```

The adapter above is illustrative host code, not a provided implementation. Public types are
`OutlineCollaboration` and `OutlineFieldEvent`, exported from `/outliner`.

## Remote updates and history

Local content-equal echoes still accept pending proposals. Other incoming values are remote
in collaboration mode: they reconcile stable IDs and reading state, clear native snapshot
history and never create an undo entry. Unanswered local proposals are dropped as before;
therefore accept local operations synchronously and serialize remote publication with local
editing. Do not diff a stale proposal against a newer remote snapshot and interpret missing
nodes as deliberate deletes. `meta.base`, `meta.operation`, `meta.beforeCaret`, and
`meta.afterCaret` provide the needed originating context. Existing `action` and `reason`
fields remain unchanged.

Undo and redo use the supplied availability/callbacks even when native stacks are empty.
Read-only refuses history mutation. `onBeforeHistoryTravel` remains a preflight veto; its
`from` may be undefined for delegated history and `nodes` is the current document. The
external engine owns its history callbacks; native `onHistoryTravel` is not emitted for it.
Do not put remote, seed, migration or restoration snapshots into local undo captures.

`mapCaret` is pure and called for unmatched remote values, not local echoes. It maps UTF-16
source offsets through the host's stable CRDT anchors. Returning null clears the caret.
Normal reconciliation clamps offsets and resolves a deleted focused node. Keep this callback
referentially stable and publish immutable arrays. No remote operation should remount the
whole Outliner or replace node IDs.

## Composition and field selection

Row title/note editors report selection, composition-start and composition-end events with
itemId, field, text, anchor and head. Backward selections preserve direction. The live editor
reports composition-end after committing the composed source. The fallback textarea reports
native composition lifecycle. Buffer incoming **value publication** during composition and
flush it after the local change has been applied; do not merely hide a remote render while
changing the local base. Page-level host navigation must dispose its own composition buffer.
These hooks do not implement a CRDT binding or guarantee IME correctness by themselves.
Test your binding with actual IMEs, surrogate pairs, focused-row deletion and concurrent
split/merge, and keep user-local folds/selection out of shared document storage.

## Images use existing row architecture

An image is a Markdown image block in `OutlineItem.data.note`, not a new node kind. Paste a
clipboard image into an empty title row: `onAttach(files, {itemId,field})` stores the file and
returns `{name,href,kind:'image'}`. The same row gains an image block in its note, retaining
its stable ID and empty text. The existing rich-note renderer displays it in place. No new
card layout, HTML storage or parallel image-row schema is introduced. Persist the resulting
nodes AND host-owned file bytes. URLs must be http(s) or same-site paths; ephemeral blob/data
URLs are not accepted. The host should validate MIME/size and authorize private asset reads.

The returned attachments append to the latest row note as one edit. A deleted row, unmounted
field, new attach handler, current read-only state or locked row rejects late completion.
Upload rejection is announced without changing existing content. The host owns cleanup of
uploaded files whose insertion is refused; the library never deletes remote assets.

Studio `?attachments=1#/outliner` exercises the real clipboard route and reload persistence
using a public bundled synthetic illustration. It does not upload or retain clipboard bytes.
