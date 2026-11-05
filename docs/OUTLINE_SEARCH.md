# Optional outline search reader

`OutlineSearch` is an opt-in, read-only local search surface. It does not replace an
application shell or activate `OutlineEditor`. An empty or whitespace-only query
shows an ordinary in-place `Outliner`, including when flat-results mode is selected.
Document order is preserved. Nothing in this component sorts or edits the document.

```tsx
<OutlineSearch
  nodes={canonicalNodes}
  getDetails={(node) => node.data?.outlineDetails}
  onReveal={(id) => navigateToCanonicalItem(id)}
/>
```

Use the library's shared tokens/components/reader styles and optional search skin.
`src/react/outline-search.css` is the source skin; the package entrypoint supplies
its integration. No stylesheet is injected by the component.

## Ownership and data contracts

- `nodes` is the canonical immutable outline snapshot, with unique IDs. Supply a new
  snapshot to update document content. Folding, query, result mode, completion
  visibility and note visibility are private view state—not document mutation,
  editor history, lock changes, or permission grants.
- `getDetails` uses `getOutlineItemDetails` from the portable productivity module.
  Without a getter, details are read from own data properties directly in `node.data`.
  Recognized details include `note`, `heading`, `color`, `completed`, `checkbox`,
  `numbered`, `dates`, `createdAt` and `editedAt`. Malformed fields are omitted.
  `checked` supplies the completion/checkbox fallbacks. A supplied getter replaces
  the metadata source, but not those fallbacks. The getter is trusted application
  code; its exceptions propagate. Notes shown and searched are the normalized
  plain `details.note` string, not HTML and not a rich document's derived text.
  More than 10,000 date metadata entries throws `RangeError` rather than silently
  truncating; validate application metadata at the host boundary before rendering.
- `query` controls the query when supplied; otherwise `defaultQuery` seeds local
  state. `onQueryChange` reports input, Clear and Escape requests. A controlled host
  must accept the new value for the visible query to change.
- `mode` controls `"context" | "flat"`; `defaultMode` defaults to `"context"`.
  `onModeChange` reports the mode toggle and Shift+Enter requests. Empty-query
  rendering remains a reader in either mode.
- `scopeId` includes its canonical node and descendants. Empty-query reading starts
  at that node. Searching preserves real ancestor titles for ancestry predicates,
  context and flat result paths, including ancestors outside the scope. A missing
  scope shows a status rather than silently searching everywhere.
- `onReveal(id)` is optional host navigation. Only original canonical IDs are
  emitted; the component performs no selection, persistence or edits for it.
- `onSearchEverywhere(query)` is rendered only if supplied. It passes the exact
  current query to host code. No network service or workspace-wide search is
  provided or implied.

A filtered context tree is an internal rendering projection, not a replacement
canonical document. Initially it contains only matching rows and their ancestor
paths—not all descendants of a matching branch. Explicit context controls can add
one level of nonmatching children at a time, as described below. Every trusted rendering slot, rich-content
getter and disclosure-label callback is adapted back to the original canonical
node object. No projection is exposed to an editing callback; this component has
no editing callbacks at all. Preserve the same boundary if integrating results
with a separate editor: issue an authorized operation against the original snapshot.

## Rendering and view controls

Context mode reuses `Outliner`. Ancestors that are not themselves matches are
labelled “Context ancestor”; matching source title/note substrings are safely
highlighted by default. Flat mode uses a semantic results list with ancestor paths,
notes and optional Reveal actions, preserving document order.

During a context search, a visible row with pruned eligible immediate children
offers “Show all children of {title}”. This reveals only those immediate children,
opens that parent in search folding state, and keeps the query intact. A newly
revealed branch has its own control for the next level; descendants are never
automatically revealed all at once. Nonmatching rows added this way are labelled
“Additional context” and use `data-search-kind="additional"`, distinct from
nonmatching ancestor paths (`"context"`) and true matches (`"match"`).

“Hide additional children of {title}” removes that explicit reveal and any deeper
reveal requests beneath it, while retaining every true match and required ancestor
path. Reveals are query-local: changing or clearing the query discards them.
Completion-hidden branches and out-of-scope siblings remain excluded. Toggling
flat mode shows true matches only; counts and highlights never treat additional
context as matches. All controls are view-only and canonical callbacks still
receive the original nodes. Ordinary reader folds are not changed.

The familiar trusted slots are `renderContent`, `renderBody`, `renderAccessory`,
`renderCollapsed`, `renderStatus`, `renderSuffix`, `getRichContent`, `richRegistry`,
`allowMedia` and `getDisclosureLabel`. `disclosurePosition` controls reader
geometry. `renderContent` takes precedence over rich content. Flat results pass the
canonical depth and child information; their render context's `hoist` requests
`onReveal` when present. Context results retain the reader's local hoist behavior.
`renderCollapsed` only applies to context reader branches. The default metadata
note is followed by any additional `renderBody` content. Trusted renderers own
safety and semantics of their returned React content; strings are never parsed
as HTML. Rich-renderer output is not rewritten to add search highlights.

`defaultExpandedIds` seeds ordinary reader folding; omitted means initial branches
are expanded. Search initially expands matching paths and uses separate ephemeral
folds. Changing the query resets those search folds. Clearing restores ordinary
reader folds. These states never write to node fields or another reader instance.

`defaultHideCompleted` seeds the local “Hide completed” toggle. It removes a
completed row and its entire branch from the view. It does not change query
metadata, canonical completion flags or search scope. Result counts reflect
matches remaining after this local filter; the portable search still runs on the
canonical snapshot and its budgets apply before the view filter. Normalized
`checkbox` controls whether a read-only task glyph is shown; normalized `completed`
controls its checked state. Metadata overrides of `node.checked` therefore apply
to filtering and display consistently. A completed non-checkbox item instead
receives a plain “Completed” status. Flat results use the same semantic task/plain
completion status. User `renderStatus` content is additive. Projected `checked`
values are display-only; every callback still receives the original node.

`defaultNoteMode` is `"show" | "first-line" | "hide"` and defaults to `"show"`.
The note buttons only change display. First-line uses the first logical CRLF, CR,
LF, U+2028 or U+2029-delimited line. Note-hidden text remains searchable, and the full note remains
in canonical metadata. Notes are not tied to branch folds.

## Local query grammar and limits

The component delegates to `searchOutline` in `src/core/outline-search.ts`; it does
not implement another query parser. Queries support literal terms, quoted phrases,
implicit/uppercase `AND`, uppercase `OR`, uppercase `NOT` or leading `-`, `in:title`,
`in:note`, `in:all`, and the documented `is:`, `has:`, `color:`, `heading:`, `parent:`
and `ancestor:` predicates. This is not regular-expression or date-comparison
search. Unknown/unsupported operators and malformed queries fail closed, with a
visible status and diagnostic messages. Exact grammar and Unicode/source-offset
behavior are specified by the portable search module.

Default portable limits apply: 4096 UTF-16 query units, 128 tokens, 1000 returned
matches, 10000 visited nodes and 100 highlight ranges per match. A partial count is
explicitly labelled; diagnostics distinguish limit truncation from invalid input.
A local completion filter can hide returned matches without retrieving additional
ones beyond the portable budget. Search results are not a full document index or
an exhaustive result promise when truncated. Ordinary reader rendering retains
its existing independent row/depth limits.

The standalone portable search validates only the visited prefix when it stops at
a budget; partial results do not certify unseen document structure. This React
surface separately validates the complete canonical outline before projecting it.

## Accessibility and keyboard boundaries

The labelled input, live count/status, Clear button, view toggles and optional
host actions use the shared Base UI component layer. The reader retains native nested-list
semantics instead of pretending to be an editable ARIA tree. Search-specific keys
apply only while its own input is focused:

- Escape requests an empty query and keeps focus in that input.
- Shift+Enter requests flat mode without moving focus.
- Composing/IME events and modified shortcut combinations are not intercepted.

There are no global keyboard listeners or editor shortcuts. Multiple instances
have independent local state and unique description IDs. Controls preserve 44px
minimum targets, semantic tokens, logical RTL geometry, visible focus and reduced
motion. SSR uses stable React IDs and does not read browser state during render.
These contracts are not a claim of full application parity, remote search, mobile
device certification, or assistive-technology certification.
