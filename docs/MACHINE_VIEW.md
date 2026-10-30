# Machine View

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

### Explicit dispatch

Omit `onDispatchEvent` for observation-only integration. If supplied, it is a request handler owned by the application: validate current authority, actor, payload, freshness and lifecycle before performing work. A UI request is not proof that the host accepted or committed it. Do not optimistically advance the observed state; wait for a new authorized frame. Handle callback refusal/error and pending work visibly. Browsing old frames must never invoke this callback.

## Accessibility and verification

Use the labeled structural controls as well as the canvas. Do not rely only on color to distinguish active/selected states. Keep visible focus, 44px targets, text equivalents, narrow-layout containment and reduced-motion preferences when customizing. Test keyboard-only navigation, nested graph return, host updates while inspecting history, invalid JSON, callback failures and disconnected/gap states in your own application.

The package tests and synthetic lab are not screen-reader, touch, IME, production-load or cross-runtime certification. Run the documented checks on the exact candidate and verify the actual rendered component before release.
