# Machine View

The polished canvas is `MachineView` from `@samhagman/fast-ux-kit/machine-view`.
It uses shared shadcn-style controls and Base UI, React Flow for the canvas, and
ELK for layout. Import `tokens.css` and `machine-view.css` for the supplied skin.

```tsx
import { MachineView } from "@samhagman/fast-ux-kit/machine-view";
import "@samhagman/fast-ux-kit/tokens.css";
import "@samhagman/fast-ux-kit/machine-view.css";

<MachineView document={document} readOnly inspectionSession={session} />;
```

Use `defaultDocument` for local editing, or `document` plus `onDocumentChange` for
controlled editing. A controlled viewer uses `document` and `readOnly` (or
`editable={false}`). Existing editor, import, selection, undo and redo behavior
is unchanged. A new React key resets a distinct document's transient state.

The toolbar separates Design (View when read-only), Inspect run, and Simulate.
An inspection session initially opens inspection; `defaultMode` can choose another
initial mode. [Shared inspection contracts](MACHINE_INSPECTION.md) describe actor
and history control, actions, context, pending work and presentation hooks.

Simulation is the existing pure local interpreter, configured through `runtime`.
Guards must be synchronous; actions must be pure context transformations. Hovering
or keyboard-focusing an enabled event deliberately computes a cached dry run;
it never advances the current snapshot. Cache entries expire when the snapshot or
payload changes. `runtime.guardDescriptions` may explain a blocked named guard.
The kit never guesses a payload that would satisfy a guard.

The scoped command palette (toolbar button or Mod+K inside this view) separates
navigation, view controls, and simulation execution. Looking up a state or
transition never dispatches an event. Scenarios show exact expected versus actual
active configurations, blocked steps and cancellation. Inspect failure opens the
retained local trace without running callbacks again. Trace timestamps come from
local execution; unavailable microstep contexts stay unavailable.

Layout runs in a lazy browser worker. The published worker asset is resolved
relative to the machine entry using `new URL(..., import.meta.url)`; a consumer
bundler must support module workers (Studio uses Vite). `layoutWorker` accepts
`{ enabled: false }` for a lazy in-process fallback or `{ createWorker }` for a
host-managed asset location. Workers returned by the factory are owned by the view
and terminated on unmount. Construction is SSR-safe. Late results are discarded;
the last usable diagram remains visible during layout. Observation updates do not
rerun topology layout or reset pan/zoom. Fit deliberately restores an overview;
Focus selection uses a readable scale. On a narrow canvas, the opening readable
view anchors on an active or initial state instead of an empty corner of a large
graph. Keep document identity stable when only runtime observations change.

## Legacy `/react` API

The following reference describes the older `MachineView` exported from `/react`.
Its `value`, `onChange`, `runtimeOptions`, render hooks, and controlled mode props
belong to that older component. They are not the polished `/machine-view` props.
Both exports remain supported; they have different public interfaces.

Machine View is a React statechart workspace with three deliberately separate jobs:

1. **Edit** a portable graph document, including hierarchy and referenced graphs.
2. **Simulate** a bounded local model with trusted, pure callbacks.
3. **Inspect** normalized observations supplied by an application.

It is not a production orchestration engine, a transport, an authentication boundary, or a universal runtime adapter. The interactive documentation includes four synthetic examples and a deterministic scenario tester. Nothing in those examples calls a service, publishes a document, or sends a real approval.

## Document model

A version-1 `MachineDocument` contains a root machine ID and a list of `MachineGraph` values. Each graph contains uniquely identified nodes and transitions. Node kinds are `atomic`, `compound`, `parallel`, `initial`, `final`, `submachine`, and `note`. IDs for nodes and transitions are document-wide unique. Parent links create hierarchy; `initialId` chooses an immediate child. A submachine node references another graph by `machineId`. Notes can attach to a node with `attachedToId`; an annotation is not an executable state.

Transitions name source and target nodes, an optional event, optional guard, and optional actions. An omitted or empty event is automatic. Guards and actions are names, **not executable expressions**. Descriptions, entry/exit action names and tags are display metadata unless resolved by trusted runtime options.

Validate untrusted data with `validateMachineDocument` or parse it with `parseMachineDocument`. Treat diagnostics as structured issues, not HTML. The format supports bounded graphs and hierarchy, not arbitrary object graphs. Importing JSON does not install callbacks, execute JavaScript, or establish permission to run a host operation.

## Controlled React usage

```tsx
import { useState } from "react";
import { MachineView } from "@samhagman/fast-ux-kit/react";
import type { MachineDocument } from "@samhagman/fast-ux-kit/core";
import "@samhagman/fast-ux-kit/tokens.css";
import "@samhagman/fast-ux-kit/machine.css";

function Workspace({ initial }: { initial: MachineDocument }) {
  const [document, setDocument] = useState(initial);
  return (
    <MachineView
      value={document}
      onChange={(next, change) => {
        // Validate application policy before accepting this edit proposal.
        setDocument(next);
      }}
      label="Workflow design"
    />
  );
}
```

The standalone skin uses shared theme tokens. Import `tokens.css` before `machine.css` for the default theme, or provide your own compatible CSS variables. The machine stylesheet contains fallback values but is not a separate theme system.

`value` makes document ownership explicit. `onChange` proposes a new document; the host accepts it by supplying that value. `defaultValue` is for component-owned documents. Do not switch between ownership modes during a mounted session. `readOnly` prevents document editing but still permits navigation and inspection. Selection and mode can also be controlled through `selectedIds`/`onSelectionChange` and `mode`/`onModeChange`.

The edit history is local to this workspace. It does not undo external application work. Use a new React `key` when switching to a distinct document/session whose transient state should reset. Keep object identity stable unless the document actually changes.

Render hooks accept trusted React: `renderNode`, `renderInspector`, and `renderEmpty`. Custom controls must preserve labels, focus and keyboard access. Do not inject unsanitized HTML. `showToolbar` and `showInspector` are presentation choices, not authorization controls.

## Navigation and presentation

`autoFit` defaults to `true`: a new graph fits the available canvas. A user-adjusted viewport is preserved across container resizing. Fit restores an overview; zoom, pan and Reset canvas view affect only the view, never the document. `direction` chooses left-to-right or top-to-bottom layout.

Hide details expands the canvas without clearing selection or changing the machine. Show details restores the same inspector panel; Runtime and validation actions open their panel deliberately. Select a node and choose Focus selection to center it at a readable scale of at least 100%. Overview descriptions and action summaries are visually shortened; complete values remain in the inspector. The host's `showInspector={false}` disables the inspector entirely.

Canvas nodes and transitions have labeled buttons. The expandable state list provides structural navigation without dragging. State positions, parents and transition endpoints can be changed through labeled inspector controls. Replay supports Arrow keys, Home, End and Escape; returning to latest restores the unchanged live snapshot and replay trigger focus.

### Find across graphs

The **Find** inspector panel searches state and transition IDs, display names/events, descriptions, tags and named actions/guards across every graph. The state list's existing search remains local to the current graph. Choose a result to open its graph, select the original element and focus it at a readable scale. Enter chooses the first result; Escape closes Find and restores its tab trigger. Finding never edits a document or dispatches an event. In Simulate mode, opening a different graph clears the current local simulation and replay, as ordinary graph navigation does; the Find panel warns before that action. Host observations are unchanged. The UI caps results at 50; refine a broad query. Observation payloads and context are not part of topology search.

`searchMachineDocument(document, query, { maxResults })` is also available from the portable machine entry. Results retain `machineId`, `elementId`, `kind` and `label`; an empty query returns no results. The result count is bounded (100 by default, maximum 1,000), not the full document scan. Pass a validated, bounded document.

## Local simulation contract

Portable helpers are exported from `@samhagman/fast-ux-kit/machine` (also available from the core entry):

- `createMachineSnapshot(document, machineId?, context?, options?)`
- `sendMachineEvent(document, snapshot, event, options?)`
- `replayMachineEvents(document, events, options?, machineId?, context?)`
- `getEnabledMachineTransitions(document, snapshot, event?, options?)`
- `runMachineScenario(document, scenario, options?)`
- `machineTransitionCoverage(frames, transitionIds)`

The local simulator enters compound initial states and all parallel regions. Active IDs include ancestors. Candidate transitions are ordered deepest-first; an ordered guarded alternative takes precedence over its fallback. `getEnabledMachineTransitions` returns ordered enabled candidates, not the final selected set. A deeper source or an earlier alternative can shadow another candidate; `sendMachineEvent` resolves conflicts before taking transitions. Nonconflicting parallel regions can respond to one event. Parent exits leave their active descendants. A graph finishes at an active top-level final. Final children do not automatically finish their parent; use an explicit parent completion event and a guard where appropriate. Automatic transitions settle within a microstep budget; a cycle exceeding that budget yields an error rather than looping indefinitely.

Named guards are resolved from `runtimeOptions.guards`. Missing, throwing, or asynchronous guards do not enable a transition. Candidate queries may call guards, so guards must also be pure and synchronous. Named actions and entry/exit actions resolve from `runtimeOptions.actions` and return a context object. These callbacks must be pure: do not send network requests, schedule work, mutate shared context, or call external providers. A thrown/invalid action result is an error, not success. Display names without registered actions do not magically execute work.

### Explicit exclusions

There are no wall-clock timers, invoked services, automatically executed submachines, generated completion events, persistence guarantees or host side effects. A submachine is browsable topology and an opaque local state; model its outcome with an explicit event. Pending timer/effect/task data belongs to host inspection. History-state and choice-state runtime semantics are not part of the node-kind contract. There is no claim of complete compatibility with another statechart format or runtime.

The `trace` records active IDs, transitions, entry/exit sets and action names. It does not include every historical context value. Do not display the final context as though it belonged to an earlier trace step. Trace retention is bounded; absence from a retained trace does not prove an event never happened.

## Scenario tester and coverage

A `MachineScenario` is a named event sequence with optional `expectedActiveIds`. The expectation compares the exact active set, including ancestors. A scenario without an expectation has no pass/fail claim. A scenario error cannot pass. Every run begins from a fresh snapshot and uses only the supplied pure callbacks.

Coverage is the intersection of observed transition IDs and the provided transition inventory. It measures **observed edges**, not all paths, all payloads, temporal behavior, reachable states, or production correctness. Bound test generation in the host. Referenced graph coverage is separate. The documentation tester clears stale results when the graph changes and never reports a pass before running.

## Host inspection

```tsx
<MachineView
  value={topology}
  readOnly
  mode="inspect"
  inspectionSession={session}
  showDiagnostics={false}
/>
```

`MachineInspectionSession` carries a source (`committed`, `live`, or `simulation`), connection condition (`connected`, `stale`, `disconnected`, or `gap`), optional cursor/sequence, and frames. Each frame has stable identity, timestamp, actor ID, machine ID and active state IDs. Parent actor IDs describe actor relationships. Context, transition IDs, event and metadata are optional.

Only label data `committed` when the producer has established that fact. The component cannot verify transaction commits, gap-free replay, authorization, clock correctness or provenance. A disconnected shell is not live data. Normalize runtime-specific versions in a host-owned `MachineInspectionAdapter`; its explicit ID/version is a compatibility boundary, not certification.

`appendMachineInspectionFrame` supplies a bounded immutable buffer; the first accepted frame for an ID wins. When explicit source sequence numbers are supplied, it rejects invalid or late/equal numbers and records gaps. Committed feeds reject explicitly speculative (`committed: false`) frames. Timestamps alone do not establish continuity. It does not recover stream gaps or prove the producer's claims. The host must still validate cursor, instance, version, authorization and actor identity before appending. Handle gaps explicitly instead of presenting a false empty history. `selectMachineInspectionFrame` only reads an observation; it never dispatches.

`maxInspectionFrames` defaults to 500 and is capped at 2,000 in the React view. Supply already-bounded, redacted sessions in the host as well. A historical selection stays pinned by identity as new frames arrive; if retention removes that frame, the view reports it unavailable rather than silently substituting the latest frame.

### Sensitive diagnostics

Topology-only inspection is the default. `showDiagnostics` is an explicit opt-in for context/metadata and optional pending timers, effects, human tasks and actor messages. Redact before passing data to React; hiding a panel is not a secrecy boundary, because supplied data is still in browser memory. Bound values and labels. Do not pass credentials, tokens, private provider receipts or unrelated personal data.

Pending effects may have `unknown` outcomes. Unknown is not equivalent to failed and is not permission to retry. Task labels are not approval forms and display is not authorization to answer. A due time is supplied observation data, not a running scheduler.

### Recorded event detail and context comparison

The observation timeline can be filtered by event type, frame ID or status. Filtering changes only the visible list: a selected historical observation remains pinned even when outside the filter. Replay controls still navigate **all retained observations**, not just matches. Appending data never silently moves a pinned selection. Clear the filter or return to latest deliberately; an evicted observation stays unavailable.

With diagnostics enabled, Runtime shows the selected observation's supplied event payload and context. An omitted value is **unavailable**, not an empty object. Context comparison uses the previous retained observation for the same actor and machine; it shows both frame IDs and never reconstructs old values from a later snapshot or reruns callbacks. Frame differences do not prove which event caused a change. Source sequences can be nonconsecutive because another actor intervened or data is missing; a session gap remains explicit.

The portable helper `compareMachineInspectionContexts(before, after, options)` returns `status`, `entries`, `truncated`, `warnings` and `continuity`. Each entry has an RFC 6901 JSON Pointer `path`, an added/removed/changed/unsupported `kind`, and bounded textual before/after previews. Missing context or mismatched actor/machine returns unavailable. Null is distinct from absent. The helper does not cross sessions: hosts must validate session/instance identity and start a new keyed view when a session changes.

Defaults cap comparison depth at 8, inspected values across both contexts at 2,000, entries at 100 and combined path/value-preview characters at 16,000. Options may lower these limits or raise them to hard caps of depth 32, 10,000 inspected values, 1,000 entries and 100,000 output characters. Truncated or unsupported input never proves equality. Plain records/arrays and finite JSON primitives are supported; getters and functions are not invoked, and cycles/exotic values are marked unsupported. JavaScript own-key enumeration itself may allocate a full key list before bounded processing. Executable proxies are not a supported input or a sandbox boundary: normalize to ordinary bounded data in the host first.

A useful debugging loop is to load the synthetic committed sample, enable diagnostic payloads, append an observation, and compare the coordinator's approval/attempt values. Switch to the child actor to see explicit missing context instead of fabricated history. Filter the timeline while a historical frame is selected, then append again: the selected evidence remains unchanged.

### Explicit dispatch

Omit `onDispatchEvent` for observation-only integration. If supplied, it is a request handler owned by the application: validate current authority, actor, payload, freshness and lifecycle before performing work. A UI request is not proof that the host accepted or committed it. Do not optimistically advance the observed state; wait for a new authorized frame. Handle callback refusal/error and pending work visibly. Browsing old frames must never invoke this callback.

## Accessibility and verification

Use the labeled structural controls as well as the canvas. Do not rely only on color to distinguish active/selected states. Keep visible focus, 44px targets, text equivalents, narrow-layout containment and reduced-motion preferences when customizing. Test keyboard-only navigation, nested graph return, host updates while inspecting history, invalid JSON, callback failures and disconnected/gap states in your own application.

The package tests and synthetic lab are not screen-reader, touch, IME, production-load or cross-runtime certification. Run the documented checks on the exact candidate and verify the actual rendered component before release.
