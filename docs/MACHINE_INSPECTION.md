# Supplied machine observations

The polished `MachineGraphView` and `MachineTree` accept the same `MachineInspectionProps`.
Portable types and ingestion helpers come from `/machine` or `/core`. React action
types and `inspectionFrameKey` are exported by both polished view entries.
`MachineDocument` stays version 1. These APIs add no workflow engine or transport.

```tsx
import { applyMachineInspectionUpdate } from "@samhagman/fast-ux-kit/machine";
import { MachineGraphView } from "@samhagman/fast-ux-kit/machine-graph";

const next = applyMachineInspectionUpdate(session, {
  id: "delivery-42",
  streamId: "parcel-7",
  ordinal: 42,
  cursor: "opaque-current",
  previousCursor: "opaque-previous",
  continuity: "contiguous",
  frames: [
    {
      id: "observation-42",
      actorId: "parcel-7",
      runId: "run-1",
      machineId: "shipping",
      machineVersion: 3,
      sequence: 8,
      timestamp: Date.now(),
      committed: true,
      status: "waiting",
      activeIds: ["packing", "packing.review"],
      work: [{ id: "approval-1", kind: "task", label: "Confirm address", status: "waiting" }],
    },
  ],
  records: [
    {
      id: "journal-42",
      actorId: "parcel-7",
      machineId: "shipping",
      frameId: "observation-42",
      kind: "task",
      label: "Address confirmation opened",
    },
  ],
});

<MachineGraphView
  document={document}
  readOnly
  inspectionSession={next}
  inspectionActorId={actorId}
  onInspectionActorChange={setActorId}
  inspectionFrameId={frameId}
  onInspectionFrameChange={setFrameId}
/>;
```

`null` history selection follows latest. Selecting history pins the retained
observation while updates arrive; Return to latest is explicit. An unknown,
ambiguous, or evicted ID stays unavailable. Controlled callbacks propose changes;
the app must supply accepted values. Use `inspectionFrameKey(frame)` to qualify
IDs by stream. Actor choices come from retained frames. A distinct `session.id`
resets uncontrolled actor/history state.

Snapshots and journal records have independent IDs. Several records can accompany
one commit, and records or metadata updates need not transition state. Use a new
observation ID when updating work at an unchanged state sequence. Do not mutate
retained objects: the helper makes new collections and keeps supplied facts by
reference. It does not clone or validate arbitrary transport objects.

Update IDs, frame IDs and record IDs are scoped to `streamId`. Duplicate deliveries
are suppressed; the first observation with an identity wins. Duplicate identities
within one batch reject the whole batch. `ordinal` is an increasing delivery
order, separate from optional state `sequence`, which may stay equal for metadata.
Streams order independently. Cursors are opaque and never parsed. State sequence
jumps do not prove a gap. A previous-cursor mismatch or an explicit gap marks
continuity unavailable; use a fresh session after recovery. Feed normalized,
validated immutable data. The old `appendMachineInspectionFrame` retains its
original stricter sequence rules.

Retention defaults to 500 observations and 2,000 journal records, configurable up
to 10,000 each. Delivery, observation and journal deduplication each retain the newest 10,000
identities, independently of display retention. Overlapping deliveries within
that window cannot resurrect evicted history. Supply monotonic ordinals and
normalize overlapping pages in the host for feeds that can outlive those windows. The views bound
retained observations to the newest 2,000, initially display 50 history choices,
and disclose truncation. No retention boundary implies an event never happened.

## Facts, context and pending work

Run status, connection freshness, version and topology mismatch remain distinct.
`presentation.machineVersions` supplies expected graph versions. Missing graph
or version mismatch suppresses activity; unknown state IDs are reported without
fabricating nodes. Active ancestors and simultaneous parallel leaves are shown
separately. Status strings are inert host-provided descriptions.

`frame.work` holds observation-specific timers, tasks, invokes, effects,
subscriptions, agents or other work, including queued/retrying statuses, attempts
and due times. Absence means unavailable; an empty list means none supplied.
Historical views never borrow current session work. `guidance`, `availableEvents`,
`runId`, `machineVersion` and `definitionId` provide optional generic identity and
guidance. Available events are displayed facts, not executable controls.

`showDiagnostics` opts into bounded payload/context, metadata, work details and
comparisons. Missing context, explicit null, and unloaded `contextReferences` are
different. References are labels; the kit never fetches them. Comparisons use
actual retained observations of the same actor, machine, run, stream and version.
They do not establish causality. Limits truncate deep/large values and descriptor
reading avoids invoking property getters. Host-supplied React renderers are
trusted application code.

The journal filters accepted, rejected, ignored, task, timer, effect and lifecycle
records independently of observation history. A record's optional `frameId`
links to that observation and remains unavailable after eviction.

## App actions and presentation

No real actions exist by default. Apps supply `inspectionActions` with ID, label,
enabled flag and unavailable reason, and handle `onInspectionAction(id, frame,
{ id: mutationId, signal, input })`. The callback may return a promise. Pending
requests block duplicate submissions; rejection is displayed and allows retry.
Success waits for a later observation and never edits displayed execution state.
Requests are aborted when their actor/session/current observation or connection
scope changes, and on unmount. Hosts must honor the signal and enforce their own
authorization, concurrency, validation, idempotency and side effects.

Actions require the latest connected, matching observation. History, stale or
disconnected feeds and simulation-sourced sessions explain their unavailability.
`renderInspectionAction({ action, disabled, pending, submit })` supplies trusted
custom input controls; retain disabled/pending semantics and call `submit(input)`
only after user intent. `renderInspectionDetails(frame)` adds trusted details.

`presentation.nodes[id]` supports `kindLabel`, in-state `activities` and inert
details; `presentation.transitions[id]` supports trigger descriptions. These are
presentation metadata, not new structural node kinds. Represent a targetless
handler as activity on its state, not as a fabricated self-transition. Definition
strings, expressions and payloads are never evaluated by inspection.
