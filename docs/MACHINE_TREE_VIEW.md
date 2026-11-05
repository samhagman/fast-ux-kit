# Machine Tree View

`MachineTreeView` is a read-only hierarchy-first React presentation of a
`MachineDocument`. It is separate from the spatial `MachineView`, not a mode,
editor, actor-lifecycle tree, interpreter or universal runtime adapter.

```tsx
import { useState } from "react";
import { MachineTreeView } from "@samhagman/fast-ux-kit/react";
import { machineTreeRowId, type MachineDocument } from "@samhagman/fast-ux-kit/machine";
import "@samhagman/fast-ux-kit/tokens.css";
import "@samhagman/fast-ux-kit/machine-tree.css";

function Hierarchy({ document }: { document: MachineDocument }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  return (
    <MachineTreeView
      value={document}
      label="Workflow hierarchy"
      selectedId={selectedId}
      onSelectionChange={setSelectedId}
      defaultExpandedIds={[machineTreeRowId("machine", document.rootId)]}
    />
  );
}
```

The root entry also exports the component and portable helpers. The aggregate
`styles.css` already includes the tree skin. The `/machine` entry stays React/DOM
free; no new dependency or runtime service is required.

## Structure is not execution

Machine roots contain states using only graph-local parent IDs. Outgoing
transitions appear under their source; their destinations are links, not
containment. Compound, parallel, initial, final, reference and note distinctions
remain visible. Initial markers are declarative, never inferred from ordering.
References reveal another machine root instead of recursively inlining it.

`activeStates` accepts `{ machineId, activeIds }` entries. **Active** means an
exact supplied state ID; **Active within** only means a contained descendant was
supplied. Neither selection nor a destination establishes execution. Multiple
branches may be active. Unknown IDs do not fabricate rows or activity. Supplied
IDs refer to the first accepted occurrence when invalid duplicate IDs exist.

Selection, expansion, search and reveal never execute guards, actions, timers or
events. Text is rendered inertly, not parsed as HTML or code. `renderLabel` and
`renderDetails` are trusted React hooks owned by the host, not imported data.
Do not install a competing row focus manager through these hooks.

## View-state ownership

- Selection: `selectedId`, `defaultSelectedId`, `onSelectionChange(id, row)`.
- Folding: `expandedIds`, `defaultExpandedIds`, `onExpandedChange(ids)`.
- Search: `query`, `defaultQuery`, `onQueryChange(query)`.
- Kind filters: `showTransitions` / `onShowTransitionsChange` and
  `showNotes` / `onShowNotesChange`. Omitting either controlled value uses its
  `defaultShowTransitions` or `defaultShowNotes` initial value. Refused filter
  proposals remain refused, including reveal requests.

Selection and expansion use **row IDs**, not raw state IDs. Use
`machineTreeRowId(kind, machineId, elementId)` or IDs returned by the projection.
The tuple encoding distinguishes machine, node and transition identities and
preserves invalid duplicate occurrences without overwriting them. Stable unique
document IDs remain the normal contract; duplicate occurrence indexes are not
durable identities across arbitrary malformed-document reordering.

Omitting a controlled prop uses local state. Controlled callbacks are proposals:
the host must return the accepted value. A refused selection does not silently
change it. Focus remains independent. Removed or hidden selections are described
instead of silently choosing an unrelated row. Initial folding expands all
branches unless `defaultExpandedIds` is supplied; an empty array collapses all.

Search is a case-insensitive literal substring search over topology metadata,
not an expression language or a search of runtime payloads/context. Matches retain
ancestor context. Search expansion does not overwrite saved folds; clearing the
query restores them. Note and transition filters exclude those kinds. Target
reveal requests a cleared query, required ancestor expansion and selection, then
focuses only when the target is visible. A controlled host can refuse any part;
the view does not bypass the refused filter or fabricate success.

## Keyboard and presentation

The hierarchy uses nested state surfaces with wrapping sibling groups. Outgoing
transition routes sit outside their source state border and include explicit
inline destination buttons. Missing destinations remain inert text; self-target
navigation is safe. Route controls keep non-overlapping 44px hit targets. The
machine root title remains visible while generic header, keyboard instructions,
idle counts and footer stay available to assistive technology without dominating
the canvas. Search results and truncation remain visible.

The tree uses one roving tab stop. Up/Down move visible rows; Home/End go to the
boundaries; Right expands or enters and Left folds or moves to the parent (logical
directions reverse in RTL). Enter/Space select, never dispatch. Typeahead moves
focus by label. Search Enter selects/focuses its first match; Escape clears search.
Inline destination and reference controls are separate native button stops.
Nested controls, composition and modified navigation retain their own ownership.
Owned keys prevent page jumps and focused rows scroll using nearest alignment.

Folding a focused descendant repairs focus to a visible ancestor without pulling
focus from an unrelated input. Focus, selection and activity have separate text
and styles. The details panel includes inert state/transition metadata and
explicit source, destination or reference actions; absent targets remain visible
but cannot navigate.

`showToolbar`, `showSearch`, `showInspector`, `defaultShowNotes`,
`defaultShowTransitions`, `className`, `style`, `dir` and `renderEmpty` support
compact composition. Search belongs to the toolbar, so hiding the toolbar also
hides its search input. The library skin uses logical properties, wrapping,
44px targets, focus indicators and reduced-motion styling. SSR is supported.

## Portable projection and limits

`buildMachineTree(document, options)` produces rows, roots, structure issues and
truncation. `projectMachineTree(model, options)` derives visible tree levels,
sibling positions, match/context flags and output truncation.
`machineTreeAncestors`, `findMachineTreeRow`, `resolveMachineTreeSource` and
`resolveMachineTreeTarget` support host navigation without React.

Default ingestion is 10,000 graph/node/transition records; `maxItems` caps at
50,000. Default containment depth is 64, configurable up to 256. Excess-depth or
invalid-parent states recover at their graph root with diagnostics; parent cycles
terminate rather than recursing. Transition rows can be one level deeper. The
visible output defaults to 1,000 rows; `maxVisibleRows` caps at 50,000. Diagnostics
cap at 200 including an omission notice. Supplied activity entries and IDs are
bounded separately at 50,000. Truncation is disclosed, not labeled complete.

These are typed inert-data limits, not a hostile-object sandbox. String lengths,
metadata arrays and executable Proxy objects are not globally memory/CPU bounded.
Normalize and authorize input upstream. The component does not certify activity
authenticity, causal ordering, service lifecycle, delay/history semantics or
compatibility with other runtimes.

## Examples and verification

`#machine-tree-view` and the component gallery use the public component with
original synthetic examples. The lab's explicit local simulation is a host
composition using the existing trusted pure runtime; the tree cannot dispatch it.

Core, React DOM, lab and packed-consumer tests cover projection, malformed data,
controlled proposals, focus/keyboard ownership, inert rendering, SSR and exports.
Exact browser-layout and full-check results belong to the candidate's evidence
record. DOM tests do not certify physical touch, native IME or assistive technology.
