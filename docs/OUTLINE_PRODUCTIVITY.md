# Portable outline productivity

The optional `OutlineSearchLab` docs example combines public reader, search and
productivity APIs with a small synthetic in-memory document. Its default is
reading, not editing. It is not an application shell, remote index or persistence
service. Reset starts a fresh local trial, including history and view state.

## Details are host-owned metadata

`OutlineItemDetails` is an optional-field, readonly contract:

- `note?: string`, `heading?: 1 | 2 | 3`, `color?: string`;
- `completed?: boolean`, `checkbox?: boolean`, `numbered?: boolean`;
- `dates?: readonly { start: number; end?: number }[]`;
- finite numeric `createdAt?: number` and `editedAt?: number`.

`getOutlineItemDetails(node, getDetails?)` reads details directly from `node.data`
by default. A supplied `OutlineDetailsGetter<T>` replaces that metadata source.
It is trusted host code: exceptions propagate rather than being converted into
an empty result. Returned metadata is still normalized by the helper.

Only own data properties are read. Metadata property accessors are not invoked.
Invalid fields are deliberately omitted, and valid date entries are copied.
Date values must be finite, with `end >= start` when present. More than
`OUTLINE_DETAIL_DATE_LIMIT` (10,000) date entries, including sparse array slots,
throws `RangeError`; there is no silently truncated successful result.

Completion defaults to `node.checked === true`; checkbox presence defaults to
`node.checked !== undefined`. Valid explicit `completed` and `checkbox` details
override those defaults independently. A plain completed item therefore need not
be a checkbox task. Details are presentation/search metadata, not an authorization
mechanism and not automatic document changes.

```ts
import { getOutlineItemDetails } from "@samhagman/fast-ux-kit/core";

const details = getOutlineItemDetails(node);
// Or map application metadata without changing the canonical node:
const mapped = getOutlineItemDetails(node, (item) => item.data?.outlineDetails);
```

The adapter's return type must satisfy `OutlineItemDetails`; the application owns
its broader data schema. A normalized details object is not a replacement for
`node.data`: it omits unknown host fields and malformed interpreted values.

## Tag inventory

`outlineTagInventory(nodes, { getDetails?, triggers? })` scans titles and notes
in document pre-order, including folded and completed branches. The default
trigger is `#`; hosts can explicitly request other triggers such as `@`.
Recognition uses ordinary text boundaries, so an email address does not become
a mention simply because it contains `@`.

Each `OutlineTag` exposes:

- `key`: trigger plus NFKC-normalized, locale-independent lower-case spelling;
- `trigger` and the first encountered original `spelling`;
- `count`: occurrence count across titles and notes;
- `nodeIds`: distinct canonical IDs in first-encounter order.

Inventory is not a query parser or syntax-aware rich-document index. Hosts with
parsed content should define the appropriate text source and exclusions at their
own boundary. Invalid input trees throw `InvalidOutlineError` before traversal.

## View-only projection

`projectOutline(nodes, options?)` returns flat `OutlineProjectionRow<T>` values.
Every row's `node` is the original canonical object, accompanied by `id`,
`parentId`, `depth`, normalized `details`, `noteVisible` and display `noteText`.
It never produces a replacement canonical outline.

Options include `getDetails`, `hideCompleted`, `expandedIds` and `noteMode`:

- `hideCompleted` omits each completed row and its entire branch from this view.
- Missing `expandedIds` means all branches are expanded; a supplied set limits
  traversal to expanded branches without changing document children.
- `noteMode: "show"` displays the full note and is the default.
- `noteMode: "first-line"` displays the first logical line.
- `noteMode: "hide"` makes `noteText` empty and `noteVisible` false.

The full note remains available in `details.note` in every mode. A host can reveal
it independently of branch folding. Projection validates the input tree first
and throws `InvalidOutlineError` for malformed structure, cycles or duplicate IDs.

**Never send a filtered/search/projected tree into a reducer as a document
replacement.** Keep canonical roots as the source of truth, and address edits by
canonical ID. Visibility is neither edit authority nor deletion.

## Stable sorting and editor integration

`planOutlineSort(nodes, request, getDetails?)` previews an immediate-sibling sort.
`request.parentId` is `null` for roots or a canonical parent ID for its immediate
children. Optional `ids` selects siblings; selected rows keep their existing
slots, even when those slots are nonadjacent. Unselected rows do not move.
Missing IDs, duplicate selections, mixed-parent selections and invalid targets
produce typed refusals rather than partial changes.
Recognized request fields must be own data properties: accessor/inherited fields
and failed descriptor reads are refused. An unreadable selection never widens to
all siblings. Omitted or explicitly `undefined` optional fields retain defaults.

Supported `by` keys are `title`, `completion`, `created`, `edited`, `date`, and
`reverse`. Optional `direction` is `"ascending" | "descending"`. Titles use NFKC
lower-case code-unit ordering. Completion sorts incomplete before completed in
ascending order. Date uses the earliest valid range start. Missing numeric keys
sort last in either direction. Ties preserve the original document order.
`reverse` reverses the selected slots and ignores direction.

Successful plans expose `nodes` as a preview and `action` as an ordinary
transaction containing one `reorder` command. The preview is **not edit
authorization**. Use `reduceOutlineEditor(state, plan.action, policy)` or the
convenience integration:

```ts
import { applyOutlineSort } from "@samhagman/fast-ux-kit/core";

const next = applyOutlineSort(
  state,
  { parentId: null, by: "title" },
  { readOnly: false, isLocked: (node) => node.data?.protected === true },
);
```

The reducer retains ordinary `readOnly`, `isLocked`, `canChange`, undo/redo and
caret behavior. Edit permission requires explicit `readOnly: false`. Reorder
validates an exact sibling permutation and checks every changed placement,
including displaced siblings and their locked descendants, plus protected
parents/ancestors. Refusal is atomic. IDs, data and subtrees are retained; prior
roots remain unchanged. A no-op sort preserves the roots reference and adds no
undo step. A successful change is one undo step.

## The local lab's explicit editing boundary

The reader's Reveal callback selects a canonical item in a separate details pane
and focuses its heading. This is host navigation, not a document edit.
In reading mode that pane is text only. “Enable local editing” reveals drafts for
title, note, completed state and checkbox presence. Draft typing does not change
the outline or its search results. Save sends one update transaction and merges
interpreted fields into the current canonical `node.data`, preserving unknown
host data. Checkbox removal uses `checked: null`; explicit completion metadata
can still represent a plain completed item.

Turning editing off discards unsaved drafts. Repeated unchanged saves are
disabled. A dirty draft blocks switching the selected item and undo/redo until
Save or the explicit Discard action; an attempted switch reports the reason
without losing draft content. Undo, redo and root sorting also require explicit editing enable.
Failures are visible without partial edits. The protected synthetic reference
cannot be changed or displaced; title/date sorts can succeed while reverse or
completion sorts demonstrate policy refusal. Tag buttons only seed a query.

The example uses token-based semantic controls and a normal in-place outline,
not a card per node. No network request, service write, file write or browser
storage is part of its behavior. Reader folds, search mode, note display,
completion visibility and details selection remain local view state.

## Verification scope

Portable productivity and search tests cover data/policy behavior separately.
`tests/outline-search-lab.test.tsx` is the integration coverage for read-first
behavior, explicit saves/search refresh, retained host fields, sort/history/lock
behavior, draft cancellation and repeated resettable trials. DOM tests do not
certify browser layout, target geometry or assistive-technology behavior; those
need the docs example's normal browser QA.
