# Outliner seams: what a host app plugs in

The outliner is a document editor. It does not own accounts, servers, files or other apps.
Each of those concerns meets the outliner at a typed seam: a prop, a callback or a method
on the imperative handle (`ref`). This page lists them by concern.

Every seam is optional. Without it, the outliner offers nothing for that concern; it never
fakes one.

The behaviour of each seam is tested in `studio/tests/outliner-seams.test.mjs`.

```
                         ┌──────────────────────── host app ─────────────────────────┐
  accounts · ACLs ──────▶│ readOnly · isLocked · onValueChange(veto) · linkFor        │
  sync engine ◀────────▶ │ value / onValueChange(meta, reject) · trackEdits · replace │
  version store ◀──────▶ │ onHistory · ref.replace · ref.getValue · ref.exportAs      │
  file storage ◀──────── │ onAttach(files, target) → links in the note                │
  calendar · mail · API  │ itemCommands · paletteGroups · ref.insertItems · search    │
                         └─────────────────────────┬──────────────────────────────────┘
                                                   │ props, callbacks, ref
                                             <Outliner />
```

## 1. Sharing and permissions

Who may see or change what is the host's decision. The outliner enforces it and explains
each refusal.

| Seam                                                  | Type                             | What it does                                                                                                                                                                                     |
| ----------------------------------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `readOnly`                                            | `boolean`                        | No edits at all. Folding, zoom, search and copy still work. Editing chrome (replace, recorder edits, drag) is off.                                                                               |
| `isLocked`                                            | `(node: OutlineItem) => boolean` | Per-item lock. It covers the item and everything inside it. Edits, moves, drops, replace-all matches and swipe actions on locked items are refused. Find and replace counts the skipped matches. |
| `onValueChange` returning `false`, or `meta.reject()` | `OutlineValueChangeHandler`      | Controlled mode: the server can refuse a change after the fact. The outliner rolls it back and says "Change not accepted".                                                                       |
| `linkFor`                                             | `(id: string) => string`         | The URL that "Copy item link" writes, for example a share link with a slug or an access token the host minted. Default: this page with `?zoom=<id>`, plus `?doc=<id>` in a workspace.            |
| `labels.locked` / `labels.readOnly`                   | `string`                         | What a refusal says.                                                                                                                                                                             |

Presence and ACL UI (avatars, "shared with") belong in the host's own chrome. Use
`headerStart` or a `paletteGroups` entry.

## 2. Offline sync

The outliner never fetches or stores anything. A sync engine sits behind the controlled
props.

| Seam                          | Type                                                         | What it does                                                                                                                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value` + `onValueChange`     | `readonly OutlineItem[]`, `(nodes, meta) => boolean \| void` | Every change is proposed with `meta.reason` (`"edit"`, `"undo"`, `"redo"`) and `meta.action` (the editor action, for example `"text"` or `"drop"`). Edits show optimistically, chain while unanswered, and roll back on `meta.reject()`, even late, when the server says no. |
| `optimistic`                  | `boolean` (default `true`)                                   | `false` renders only what the host echoed.                                                                                                                                                                                                                                   |
| A new `value` from the server |                                                              | A remote change arriving as a new `value` is reconciled into the document. Local typing drafts and history stay coherent.                                                                                                                                                    |
| `trackEdits`                  | `boolean` (default `true`)                                   | Stamps `data.createdAt` and `data.editedAt`, so a merge can prefer the newest edit per item. Ids are stable across moves (cut + paste keeps ids).                                                                                                                            |
| `ref.replace(nodes)`          | `(nodes) => boolean`                                         | Apply a merged document as ONE undo step (uncontrolled hosts).                                                                                                                                                                                                               |
| `ref.getValue()`              | `() => readonly OutlineItem[]`                               | The newest document, including edits not yet echoed. Use it for a flush on `visibilitychange` or before unload.                                                                                                                                                              |

## 3. Remote version history

| Seam                                      | Type                 | What it does                                                                                                                      |
| ----------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `onHistory`                               | `() => void`         | Adds "Version history…" to ⌘K and to the ⋯ menu. The host opens its own list of versions.                                         |
| `ref.replace(nodes)`                      | `(nodes) => boolean` | Restore a version as one undo step, so a wrong restore is one ⌘Z away. A controlled host can instead pass the version as `value`. |
| `ref.exportAs("json")` / `ref.getValue()` |                      | Snapshot the document for the version store. JSON round-trips losslessly, ids included.                                           |

## 4. File attachments

| Seam       | Type                                                                                       | What it does                                                                                                                                                                                                                                                          |
| ---------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `onAttach` | `(files: readonly File[], target: { itemId, field }) => OutlineAttachment[] \| Promise<…>` | Called when files are pasted or dropped into an item's title or note. The host uploads or stores them and returns `{ name, href, kind? }`. The outliner appends `![name](href)` for images and `[name](href)` for anything else to the item's note, as one undo step. |

Only `https:`, `http:` and same-site paths are accepted as `href`. `data:`, `javascript:`
and protocol-relative URLs are dropped (`safeAttachmentHref` in `seams.ts`).

Images render through the rich note view: they load lazily and open in a lightbox. Previews
of other file types can come from a trusted `renderers` entry.

## 5. Integrations: calendar, email, web clipper, API

| Seam                                                         | Type                                       | What it does                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------ | ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `itemCommands`                                               | `(ids) => OutlinerItemCommand[]`           | Host actions on items, such as "Add to calendar", "Email this" or "Send to…". They appear on every item surface: the `/` item menu (also ⇧F10), the ⋯ menu, the right-click menu, the phone action sheet and ⌘K. They run with the ids they act on. A command that throws (while listed, read or run) is reported as a toast and the rest of the menu keeps working. |
| `paletteGroups`                                              | `OutlinerPaletteGroup[]`                   | Document-level commands in ⌘K, such as "Email this outline" or "Import from…".                                                                                                                                                                                                                                                                                       |
| `menuCommands`                                               | `OutlinerPaletteCommand[]`                 | The same, at the top of the ⋯ menu (a bottom sheet on touch). This is a phone's way in. `OutlinerWorkspace` takes it too and lists it after its own entries.                                                                                                                                                                                                         |
| `ref.insertItems(nodes)`                                     | `(nodes) => string[]`                      | A web clipper, an inbound email or an API call adds items as one undo step. Returns the new ids.                                                                                                                                                                                                                                                                     |
| `ref.exportAs(format)`                                       | `"markdown" \| "opml" \| "text" \| "json"` | Send content out.                                                                                                                                                                                                                                                                                                                                                    |
| `ref.search(query)` / `ref.focusItem(id)` / `ref.zoomTo(id)` |                                            | Deep links and notifications open the right place.                                                                                                                                                                                                                                                                                                                   |
| `ref.restoreFocus()`                                         |                                            | A host dialog closing (its own finder, a share sheet) hands the keyboard back where the reader left the outline: the tree on its row, or a field with its selection. Never `<body>`.                                                                                                                                                                                 |
| `ref.openLink(id)` / `deepLinkTarget(nodes, id)`             |                                            | Open a deep link: an item with children opens zoomed into it; a leaf opens its parent's zoom with the leaf selected, never an empty page.                                                                                                                                                                                                                            |
| Dates                                                        | `!(2026-11-03 10:00 every week)` tokens    | A calendar sync reads due dates with `parseInline` from `inline.tsx` (its `date` segments). The search operators `due:`, `before:` and `after:` select what to sync.                                                                                                                                                                                                 |
| `renderers`                                                  | `OutlineRenderers`                         | Trusted embeds in notes (` ```embed:<key> `), drawn by the host's own React components.                                                                                                                                                                                                                                                                              |

## Keys a host keeps for itself

`reservedShortcuts: ReservedShortcut[]` names the keys the host's own UI answers to.
Shortcut remapping refuses them.

The defaults already reserve two workspace keys:

- ⌘O: Open document
- ⌘⇧Space: Quick capture

The defaults also reserve the browser's own keys, such as ⌘W and ⌘T.

## Where the reader's preferences live

`settings` / `defaultSettings` / `onSettingsChange` carry these preferences:

- density
- text size
- bullet click
- keyboard profile
- note display
- remapped shortcuts

The outliner never stores them. The host decides where they go: `localStorage`, a user
profile, a team default. The studio demo page keeps them in `localStorage`.

## Atomic workspace persistence

`OutlinerWorkspace` accepts `onWorkspaceChange(snapshot)`, where the snapshot contains
`documents` and `layout`. It fires once after a logical operation has completed, including
cross-document moves and their undo/redo, folder deletion/restoration, and inbox creation.
It does not fire for navigation, folding, prop echoes or refused operations. The existing
`onDocumentsChange` and `onLayoutChange` callbacks remain supported. They run first, in that
order, when their respective data changes, and receive the completed transaction.

Use `ref.getWorkspace()` for the newest complete snapshot, including local changes that a
controlled host has not echoed. An unchanged controlled prop leaves those changes pending.
A changed prop replaces that part of the workspace. The host owns save ordering, durable
storage, conflict detection and authentication.

Cross-document history moves the current subtree, including its latest text, notes and
children. Missing documents, missing original parents, conflicting ids and lock refusals
stop the whole operation before any document changes. An outliner can preflight linked
history with `onBeforeHistoryTravel`, returning `false` to refuse or a node array to rebase
the snapshot. Workspace history remains session-local. Closing enough documents to evict
their editors can discard their local undo stacks, while documents remain intact.
