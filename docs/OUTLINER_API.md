# Outliner API

The implementation is native React and independently authored. It has no runtime bridge to another UI framework. Portable state transitions are exported separately from React components.

## Reader first

```tsx
import { Outliner } from "@samhagman/fast-ux-kit/react";
import { importMarkdownDocument, type RichOutlineData } from "@samhagman/fast-ux-kit/rich";
import type { OutlineNode } from "@samhagman/fast-ux-kit/core";
import "@samhagman/fast-ux-kit/styles.css";

const notes: readonly OutlineNode<RichOutlineData>[] = [
  {
    id: "notes",
    text: "Project notes",
    data: { content: importMarkdownDocument("## A document\n\nReadable **Markdown**.") },
    children: [{ id: "next", text: "Next steps" }],
  },
];

<Outliner
  nodes={notes}
  getRichContent={(node) => node.data?.content}
  enableHoist
  aria-label="Project notes"
/>;
```

`text` is a plain-text row title, not an implicit Markdown parser. Arbitrary Markdown belongs in a Markdown rich block; its exact source is preserved while its normal view is rendered prose. `data` is generic application data, so the host explicitly maps it with `getRichContent`. No raw source pane is shown by default.

`Outliner` renders nested disclosure lists, not an ARIA tree. Links, media, selection and interactive React children own their interactions. Disclosures default to the inline-end side, have 44px targets with the optional stylesheet, and share the same semantic tokens as other controls. `disclosurePosition="start"` is available. Expansion/hoisting never mutate nodes or authorize editing.

- `expandedIds` / `onExpandedChange` are controlled view state; `defaultExpandedIds` initializes local state. Initial branches expand by default.
- `enableHoist`, `hoistedId`, `defaultHoistedId`, `onHoistChange` and accessible breadcrumbs expose subtree navigation.
- `renderContent(node, context)` replaces the readable title/body; `context` contains depth, child/expansion state and `hoist()`.
- `renderBody`, `renderAccessory`, `renderStatus`, `renderSuffix` add trusted React content without replacing disclosure behavior. `renderCollapsed` adds a trusted summary only for a folded branch; it is shared by the reader and the editor's read-only mode.
- `getRichContent`, `richRegistry`, `allowMedia` configure rich documents. Remote media is denied unless allowed by host policy; unsafe protocols remain denied regardless of host policy.
- `getDisclosureLabel` and `getHoistLabel` localize control names.

Collapsed child lists retain their ARIA target but do not mount their descendants. Expanded inline rendering is limited to 128 levels and 5,000 rows, with visible notices rather than silent truncation; all canonical data remains intact. Hoist deeper content to inspect it. This is not virtualization.

## Explicit editing

```tsx
import { createRef } from "react";
import { OutlineEditor, type OutlineEditorHandle } from "@samhagman/fast-ux-kit/react";

const editor = createRef<OutlineEditorHandle>();

<OutlineEditor
  ref={editor}
  defaultNodes={[{ id: "a", text: "First item" }]}
  readOnly={false}
  onNodesChange={(nodes, action) => saveThroughApplicationService(nodes, action)}
/>;
```

`OutlineEditor` defaults to `readOnly={true}`. In that mode it renders the reader, retaining expansion, hoist, rich-content mapping and noneditable slots. It does not mount textareas, add buttons or task mutations. `readOnly={false}` is the explicit authoring boundary. UI policy is not server authorization.

### State ownership and persistence

Use `defaultNodes` for local editor ownership. Use `nodes` plus `onNodesChange` to exchange immutable snapshots with a host. Editing is **optimistic**, not a strictly blocking controlled input: discrete input advances an internal synchronous model before React commits, preventing rapid input from targeting a stale row.

- Passing an exact snapshot previously emitted by `onNodesChange` acknowledges it; acknowledging an older proposal does not erase newer typing.
- Passing an unrelated immutable nodes object is an authoritative host replacement. It clears user history and stale suggestion state while retaining viable view state.
- Change `resetKey` to reject optimistic edits even if the host retains/reuses the original `nodes` reference. A host cannot signal rejection merely by doing nothing.
- Host replacement is deliberately separate from a user `replace` action, which is an undoable edit subject to policy.
- `onStateChange(state, action)` observes navigation/selection as well as edits. Persist from `onNodesChange` or `revision`, not from every state change.

`revision` increases for content changes only. Expansion, hoist, caret and selection do not increment it. Undo/redo restore document snapshots and caret/selection while retaining current reader folding. Continuous typing in one row coalesces within `typingGroupMs` (default 750ms); structural changes form separate transactions. `historyLimit` defaults to 100.

### Imperative handle and portable operations

The ref exposes `getState()`, `dispatch(action)`, `reveal(id, caret?)`, `exportJSON()` and `exportText()`.

Core exports include:

- Validation, visible rows, locations, ancestor paths and selected-root normalization.
- Immutable update/insert/remove/move plus atomic multi-command transactions.
- Indent, adoption-aware outdent, contiguous sibling-root movement across branch boundaries and visual-gap drop planning.
- `createOutlineEditorState`, `reduceOutlineEditor`, `editorVisibleRows`, trusted host reconciliation and platform-neutral shortcut resolution.
- Readable outline codecs and versioned canonical JSON.

Actions cover text, split/merge, insertion/deletion, indentation, movement/drop, plain/structured paste, task toggles, history, replacement, selection, focus/reveal, hoist and scoped expansion. The reducer is DOM- and React-free; browser focus, composition, clipboard, drag and geometry are owned by React.

### Keyboard contract

| Context     | Shortcut                                    | Result                                                                               |
| ----------- | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| Text        | Return                                      | Split; at the beginning of nonempty text, insert above and retain the original caret |
| Text        | Shift+Return                                | Native internal newline                                                              |
| Text        | Backspace at start / Delete at end          | Merge with previous / next visible row                                               |
| Both        | Tab / Shift+Tab; modifier+`]` / `[`         | Indent / outdent                                                                     |
| Both        | Alt+Shift+Up/Down or modifier+Shift+Up/Down | Move roots as a unit                                                                 |
| Both        | Modifier+Return                             | Toggle selected task states atomically                                               |
| Both        | Modifier+Z / Modifier+Shift+Z; Ctrl+Y       | Undo / redo                                                                          |
| Text        | Ctrl+Space                                  | Request completions                                                                  |
| Text        | Alt+F1; named Info button                   | Request contextual information                                                       |
| Text        | Escape                                      | Enter row selection                                                                  |
| Row         | Up/Down, optionally Shift                   | Navigate / extend selection                                                          |
| Row         | Left/Right                                  | Fold/parent or expand/child; Right can enter a collapsed custom view                 |
| Row         | Return                                      | Return to text                                                                       |
| Row         | Space / Delete                              | Toggle tasks / delete selection                                                      |
| Row         | Modifier+A                                  | Select visible rows                                                                  |
| Row         | Escape                                      | Focus the container; normal Tab can leave                                            |
| Suggestions | Up/Down, Return/Tab, Escape                 | Cycle, accept, dismiss before structural shortcuts                                   |

“Modifier” means Control or Command. Composition suppresses structural shortcuts and completion acceptance. Vertical text navigation crosses only first/last visual-line boundaries; horizontal caret preservation is approximate, not a pixel-perfect layout guarantee.

Text/row Escape is owned by the editor and does not also dismiss an enclosing
dialog. From the focused editor container, Tab/Shift+Tab uses native traversal
from the corresponding editor boundary; an enclosing modal remains responsible
for containment and wrapping. A further container Escape is available to that
modal. Ordinary entry still reaches the editor's controls. Standalone canceled
Tab retains/restores the container; a modal's owner may instead move focus to
another control inside its scope, and the editor does not override that destination.

### Policy, rich data and clipboard

`isLocked(node)` is intentionally conservative: locked nodes protect their subtree and structural relationship; moving an ancestor that carries a locked descendant is refused. For more application-specific structural rules, `canChange(before, after, action)` examines the complete proposed document. Refusals remain atomic and are announced; `getRefusalMessage` localizes them. Policies are reevaluated during history travel and replacement, including every ancestor's parent and sibling position; preserving a locked leaf's immediate parent does not permit relocating the branch that carries it. Changes to an unlocked ancestor's text remain allowed when protected descendants and their full positions are unchanged.

A merge never silently discards the removed row's `data`: it refuses unless the host supplies `mergeData(left, right)`. The host owns the semantics of combining rich content. The surviving row's task identity is retained.

Selected-root copy/cut writes readable `text/plain` and canonical `application/x-fast-ux-outline+json`. Cut proceeds only if the complete canonical format can be serialized and read back from the event clipboard. Structured paste regenerates every node ID and retains metadata and collapsed descendants. Invalid structured data refuses rather than silently substituting a lossy import. Actual OS/WebView custom-format retention remains a device-validation gate.

JSON uses `{ version: 1, nodes }`. Export/import share 8,000,000-character, 100,000-value and 256-container-depth budgets. Metadata must be plain JSON: no cycles, functions, accessors, symbols, sparse arrays, nonfinite numbers or negative zero. Optional node fields may be omitted. Text export is explicitly lossy for identity, metadata and multiline semantics; it is not a general Markdown document importer.

### Drag and insertion

An explicit reorder handle owns pointer dragging; ordinary text/body touches do not start a drag. An 8px threshold separates press from drag. Gap/depth previews, cycle/policy refusal, selected-root movement, cancellation and edge auto-scroll are implemented. Up/Down on the focused handle provides keyboard reorder. Host replacement, deletion, scope changes and unmount cancel obsolete drag work. Real touch scroll-versus-drag and edge geometry require the device gate below.

`getPlaceholders(parent)` provides transient insertion prompts with `id`, `label`, optional initial `text`, sibling `index` and `caret`. Each prompt has an empty typing surface and its existing activation button. Button activation or Enter in an empty prompt uses the supplied initial text/caret. Direct typing or paste instead inserts the complete entered text verbatim as one canonical node in one transaction, at the prompt's parent/index; it does not prepend the button's default text. Composition waits for its end before materializing, and trailing input cannot insert twice. A policy/plugin refusal retains the local draft; editing it or pressing Enter retries. Focus transfers to the accepted real row. Prompts are not document nodes or selection/history entries before insertion and are absent from the reader. Keep prompt IDs stable while editing; changing/removing a prompt intentionally discards its local draft.

## Extension contracts

`OutlinePlugin` supplies `id`, optional `beforeAction`, `afterAction` and completion providers. Returning `null` from `beforeAction` consumes an action. Public pure transitions and the ref allow application commands without synthetic DOM events. Render slots retain the application's React context; they do not persist React elements into document data.

Text intelligence is a reusable vocabulary, not a network/AI service:

- Coordinates are UTF-16 code units, local to one row, with exclusive range ends.
- `getTextAnalysis(node)` supplies classifications and diagnostics tied to the exact current text. Stale text or invalid ranges are ignored.
- Classifications have open-ended kinds; diagnostics support error, warning, information and hint, including point diagnostics.
- `segmentText` composes overlapping layers; `mapTextRanges` shifts unaffected ranges and invalidates touched classification.
- `recognizeTextReferences` supports Unicode names and host-supplied syntax exclusions. References remain plain spellings; stable entity binding and notifications are application concerns.
- `HighlightText` and `extractTextSnippets` reuse these range contracts for read-only evidence. Every actionable highlight retains one keyboard stop, including a fully covered range.

```tsx
import { createReferenceCompletionProvider } from "@samhagman/fast-ux-kit/core";

const people = createReferenceCompletionProvider({
  id: "people",
  trigger: "@",
  entities: [{ id: "person-1", spelling: "alex", label: "Alex Rivera" }],
  exclusions: (context) => syntaxRangesToExclude(context.text),
});

<OutlineEditor
  defaultNodes={nodes}
  readOnly={false}
  completionProviders={[people]}
  hoverProviders={[
    {
      id: "definitions",
      hover: async ({ rowId, text, offset, signal }) => {
        const definition = await lookupDefinition({ rowId, text, offset, signal });
        return (
          definition && { range: definition.range, content: <DefinitionCard value={definition} /> }
        );
      },
    },
  ]}
  renderAccessory={(node) => <RowActions node={node} />}
  renderCollapsed={(node) => <SubtreeSummary node={node} />}
  getPlaceholders={() => [{ id: "decision", label: "Add decision", text: "Decision: ", caret: 10 }]}
/>;
```

Provider responses never execute HTML or imported modules. Providers may be synchronous or asynchronous. Requests snapshot surface, row, exact text, content revision, selection, provider identity and request generation; stale results cannot reopen dismissed UI or edit another row. Superseded work receives an abort signal, but freshness checks remain authoritative. Errors/empty/loading are distinct and do not disable ordinary typing.

Completion matching normalizes Unicode, prefers prefixes and excludes exact no-op replacements. Mid-token acceptance filters by the caret prefix while replacing the complete offered range. Acceptance is one undo transaction. Suggestions keep text focus and expose listbox/active-descendant semantics.

Hover supports pointer dwell, keyboard requests and a named touch affordance. Its popup accepts interactive host React content, remains open while entered, and closes with Escape or its close button. Text-anchored popups use viewport collision placement and clean up scroll/resize observers. Their default portal stays inside the nearest dialog focus/stacking scope; `popupContainer` supplies an explicit host scope. Popup-owned Escape/acceptance keys do not accidentally dismiss an enclosing modal. Geometry is not portable domain state and remains subject to real-browser verification.

## Verification and release boundaries

See [PARITY.md](PARITY.md) for passing executable contracts, deliberate differences, blocked browser checks and remaining release gates. No “100% equivalent”, Android-ready or assistive-technology certification is claimed by this draft.

## Command, key and codec composition

Plugins are trusted application adapters, not executable document content. Keymaps run
in plugin order **after** IME and open-popup ownership. Return `undefined` to delegate,
`null` to consume the key without editing, or an action to use ordinary policy/history.
A multi-command `transaction` commits once, or refuses without partial changes.

```tsx
import type { OutlinePlugin } from "@samhagman/fast-ux-kit/react";
import { createOutlineJSONCodec } from "@samhagman/fast-ux-kit/core";

const markReviewed: OutlinePlugin = {
  id: "mark-reviewed",
  keymap: (event, { rowId }) =>
    event.key === "F2"
      ? {
          type: "transaction",
          commands: [{ type: "update", id: rowId, changes: { checked: true } }],
        }
      : undefined,
};

const canonical = createOutlineJSONCodec();
const saved = editor.current?.exportWith(canonical);
if (saved) editor.current?.importWith(canonical, saved);
```

A custom `OutlineCodec<T>` provides `id`, `mimeType`, `encode(nodes): string` and
`decode(source): readonly OutlineNode<T>[]`. `encodeOutline`/`decodeOutline` validate
tree shape at the seam. Codec-specific source budgets and fidelity are the host's
contract; codecs must not execute imported source. Handle `importWith` throws on a
decode/validation error; valid imports dispatch an undoable `replace` subject to
read-only, locks, plugin interception and whole-transition policy. The codec's MIME
label does not automatically register OS clipboard support.

The rich registry also accepts `blocks`, a map from application-defined block kind
to trusted React component receiving `{ block, reducedMotion }`. Built-in kinds
retain their default rendering; unknown, unregistered kinds retain safe visible
fallbacks. Only own registry properties resolve. Host data must remain immutable;
a failed registered renderer is retried when its block or component identity changes.

## Interaction edge contracts

- Alt-press a reader or editor disclosure to expand/collapse its complete branch.
  `onExpandedChange` includes `affectedIds` and `recursive` alongside `id` and
  `isExpanded`; one gesture emits one callback. Other branches retain local folds.
- At a hoisted root, split and structural paste insert children rather than invisible
  siblings. Outdent and empty-final-child Return stop at the scope boundary. Explicit
  `reveal` can leave a scope; ordinary `focus` cannot target an unrelated hidden row.
- Collapse and history travel keep current folds and repair caret/selection to a
  visible ancestor. Host replacement clamps surviving offsets and clears user history.
- Row-mode readable paste inserts parsed subtrees; text-mode paste edits the title
  at its selected range. An empty editable container accepts both readable and
  canonical paste. Native copy/cut in embedded inputs is not intercepted.
- Readable import skips blank lines, recognizes common list/task markers, retains
  empty marked list items, and follows indentation changes. `spacesPerLevel` sets
  tab stops (default 2); it is not an arbitrary Markdown parser. `[x]literal` without
  separating whitespace remains literal text.
- Pure no-op drops and net-zero transactions do not create content revisions/history.
  Explicit host/user replacement remains a distinct operation.
- Drag previews include a nesting-level cue and a terminal insertion gap. On narrow
  screens editor controls wrap rather than hiding the selection control. Real touch
  geometry and accessibility remain open device gates.
- Text popups listen to visual-viewport resize/scroll, so placement can react to a
  mobile keyboard. The coordinate contract is tested with mocks, not certified on
  an Android keyboard or browser zoom.
