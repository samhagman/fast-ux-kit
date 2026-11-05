import type {
  MachineDocument,
  MachineRuntimeOptions,
  MachineScenario,
  MachineInspectionSession,
} from "@samhagman/fast-ux-kit/core";

export interface MachineLabCase {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly document: MachineDocument;
  readonly scenarios: readonly MachineScenario[];
  readonly options: MachineRuntimeOptions;
}
const release: MachineDocument = {
  version: 1,
  rootId: "release",
  machines: [
    {
      id: "release",
      label: "Release approval",
      initialId: "release-draft",
      nodes: [
        {
          id: "release-draft",
          label: "Draft",
          kind: "atomic",
          description: "Prepare an internal release note.",
        },
        {
          id: "release-review",
          label: "Review",
          kind: "atomic",
          tags: ["human decision"],
          description: "A reviewer chooses whether the note is ready.",
        },
        {
          id: "release-publish",
          label: "Publishing",
          kind: "atomic",
          entry: ["countAttempt"],
          tags: ["mock effect"],
        },
        {
          id: "release-retry",
          label: "Retry available",
          kind: "atomic",
          description: "Only the synthetic, retry-safe operation may be retried.",
        },
        { id: "release-done", label: "Released", kind: "final" },
        { id: "release-declined", label: "Declined", kind: "final" },
        {
          id: "release-note",
          label: "No message or document is published by this example.",
          kind: "note",
          attachedToId: "release-publish",
        },
      ],
      transitions: [
        {
          id: "release-submit",
          sourceId: "release-draft",
          targetId: "release-review",
          event: "SUBMIT",
        },
        {
          id: "release-approve",
          sourceId: "release-review",
          targetId: "release-publish",
          event: "DECIDE",
          guard: "approved",
          actions: ["recordApproval"],
        },
        {
          id: "release-reject",
          sourceId: "release-review",
          targetId: "release-declined",
          event: "DECLINE",
        },
        {
          id: "release-success",
          sourceId: "release-publish",
          targetId: "release-done",
          event: "SUCCEEDED",
        },
        {
          id: "release-failure",
          sourceId: "release-publish",
          targetId: "release-retry",
          event: "FAILED",
        },
        {
          id: "release-again",
          sourceId: "release-retry",
          targetId: "release-publish",
          event: "RETRY",
        },
      ],
    },
  ],
};
const parallel: MachineDocument = {
  version: 1,
  rootId: "launch",
  machines: [
    {
      id: "launch",
      label: "Parallel launch readiness",
      initialId: "launch-active",
      nodes: [
        {
          id: "launch-active",
          label: "Preparing",
          kind: "parallel",
          description: "Both regions complete before the explicit FINISH event.",
        },
        {
          id: "launch-connection",
          label: "Connection",
          kind: "compound",
          parentId: "launch-active",
          initialId: "launch-connecting",
        },
        {
          id: "launch-connecting",
          label: "Connecting",
          kind: "atomic",
          parentId: "launch-connection",
        },
        {
          id: "launch-connected",
          label: "Connected",
          kind: "final",
          parentId: "launch-connection",
        },
        {
          id: "launch-config",
          label: "Configuration",
          kind: "compound",
          parentId: "launch-active",
          initialId: "launch-loading",
        },
        {
          id: "launch-loading",
          label: "Loading settings",
          kind: "atomic",
          parentId: "launch-config",
        },
        { id: "launch-loaded", label: "Settings ready", kind: "final", parentId: "launch-config" },
        { id: "launch-done", label: "Launched", kind: "final" },
      ],
      transitions: [
        {
          id: "launch-connect",
          sourceId: "launch-connecting",
          targetId: "launch-connected",
          event: "CONNECTED",
          actions: ["markConnected"],
        },
        {
          id: "launch-load",
          sourceId: "launch-loading",
          targetId: "launch-loaded",
          event: "CONFIGURED",
          actions: ["markConfigured"],
        },
        {
          id: "launch-finish",
          sourceId: "launch-active",
          targetId: "launch-done",
          event: "FINISH",
          guard: "ready",
        },
      ],
    },
  ],
};
const incident: MachineDocument = {
  version: 1,
  rootId: "incident",
  machines: [
    {
      id: "incident",
      label: "Incident triage",
      initialId: "incident-new",
      nodes: [
        { id: "incident-new", label: "New report", kind: "initial" },
        { id: "incident-triage", label: "Classifying", kind: "atomic", tags: ["mock agent"] },
        { id: "incident-review", label: "Human review", kind: "atomic", tags: ["approval"] },
        { id: "incident-work", label: "Investigating", kind: "atomic" },
        {
          id: "incident-unknown",
          label: "Outcome unknown",
          kind: "atomic",
          description: "Observation only. An unknown external outcome is not a retry instruction.",
        },
        { id: "incident-done", label: "Resolved", kind: "final" },
      ],
      transitions: [
        { id: "incident-start", sourceId: "incident-new", targetId: "incident-triage" },
        {
          id: "incident-confident",
          sourceId: "incident-triage",
          targetId: "incident-work",
          event: "CLASSIFIED",
          guard: "confident",
        },
        {
          id: "incident-fallback",
          sourceId: "incident-triage",
          targetId: "incident-review",
          event: "CLASSIFIED",
        },
        {
          id: "incident-approved",
          sourceId: "incident-review",
          targetId: "incident-work",
          event: "APPROVE",
        },
        {
          id: "incident-lost",
          sourceId: "incident-work",
          targetId: "incident-unknown",
          event: "UNKNOWN",
        },
        {
          id: "incident-observed",
          sourceId: "incident-unknown",
          targetId: "incident-done",
          event: "CONFIRMED",
        },
        {
          id: "incident-resolve",
          sourceId: "incident-work",
          targetId: "incident-done",
          event: "RESOLVE",
        },
      ],
    },
  ],
};
const support: MachineDocument = {
  version: 1,
  rootId: "support",
  machines: [
    {
      id: "support",
      label: "Support handoff",
      initialId: "support-open",
      nodes: [
        { id: "support-open", label: "Open case", kind: "compound", initialId: "support-intake" },
        { id: "support-intake", label: "Intake", kind: "atomic", parentId: "support-open" },
        {
          id: "support-specialist",
          label: "Specialist process",
          kind: "submachine",
          parentId: "support-open",
          machineId: "specialist",
          description: "Navigate to the referenced graph. The local simulator does not invoke it.",
        },
        { id: "support-closed", label: "Closed", kind: "final" },
      ],
      transitions: [
        {
          id: "support-handoff",
          sourceId: "support-intake",
          targetId: "support-specialist",
          event: "HANDOFF",
        },
        {
          id: "support-close",
          sourceId: "support-open",
          targetId: "support-closed",
          event: "CLOSE",
        },
      ],
    },
    {
      id: "specialist",
      label: "Specialist checklist",
      initialId: "specialist-assess",
      nodes: [
        { id: "specialist-assess", label: "Assess", kind: "atomic" },
        { id: "specialist-complete", label: "Recommendation ready", kind: "final" },
      ],
      transitions: [
        {
          id: "specialist-finish",
          sourceId: "specialist-assess",
          targetId: "specialist-complete",
          event: "FINISH",
        },
      ],
    },
  ],
};
const payload = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
export const machineLabCases: readonly MachineLabCase[] = [
  {
    id: "release",
    label: "Release approval",
    description: "A guarded human decision, a mocked operation, and a retry-safe failure path.",
    document: release,
    options: {
      guards: { approved: (_context, event) => payload(event.payload).approved === true },
      actions: {
        countAttempt: (context) => ({ ...context, attempts: Number(context.attempts ?? 0) + 1 }),
        recordApproval: (context) => ({ ...context, approved: true }),
      },
    },
    scenarios: [
      {
        id: "release-happy",
        label: "Approved and released",
        events: [
          { type: "SUBMIT" },
          { type: "DECIDE", payload: { approved: true } },
          { type: "SUCCEEDED" },
        ],
        expectedActiveIds: ["release-done"],
      },
      {
        id: "release-recovered",
        label: "Retry-safe recovery",
        events: [
          { type: "SUBMIT" },
          { type: "DECIDE", payload: { approved: true } },
          { type: "FAILED" },
          { type: "RETRY" },
          { type: "SUCCEEDED" },
        ],
        expectedActiveIds: ["release-done"],
      },
      {
        id: "release-no",
        label: "Review declined",
        events: [{ type: "SUBMIT" }, { type: "DECLINE" }],
        expectedActiveIds: ["release-declined"],
      },
      {
        id: "release-blocked",
        label: "Approval guard blocks",
        events: [{ type: "SUBMIT" }, { type: "DECIDE", payload: { approved: false } }],
        expectedActiveIds: ["release-review"],
      },
    ],
  },
  {
    id: "launch",
    label: "Parallel readiness",
    description:
      "Connection and configuration progress independently; FINISH is enabled only after both regions complete.",
    document: parallel,
    options: {
      guards: { ready: (context) => context.connected === true && context.configured === true },
      actions: {
        markConnected: (context) => ({ ...context, connected: true }),
        markConfigured: (context) => ({ ...context, configured: true }),
      },
    },
    scenarios: [
      {
        id: "launch-connected-first",
        label: "Connection completes first",
        events: [{ type: "CONNECTED" }, { type: "CONFIGURED" }, { type: "FINISH" }],
        expectedActiveIds: ["launch-done"],
      },
      {
        id: "launch-config-first",
        label: "Configuration completes first",
        events: [{ type: "CONFIGURED" }, { type: "CONNECTED" }, { type: "FINISH" }],
        expectedActiveIds: ["launch-done"],
      },
    ],
  },
  {
    id: "incident",
    label: "Incident triage",
    description:
      "A bounded automatic start, confidence guard, human fallback and an unknown-outcome boundary.",
    document: incident,
    options: {
      guards: {
        confident: (_context, event) => Number(payload(event.payload).confidence ?? 0) >= 0.8,
      },
    },
    scenarios: [
      {
        id: "incident-direct",
        label: "Confident classification",
        events: [{ type: "CLASSIFIED", payload: { confidence: 0.95 } }, { type: "RESOLVE" }],
        expectedActiveIds: ["incident-done"],
      },
      {
        id: "incident-human",
        label: "Human fallback",
        events: [
          { type: "CLASSIFIED", payload: { confidence: 0.3 } },
          { type: "APPROVE" },
          { type: "RESOLVE" },
        ],
        expectedActiveIds: ["incident-done"],
      },
      {
        id: "incident-uncertain",
        label: "Observe unknown outcome",
        events: [{ type: "CLASSIFIED", payload: { confidence: 0.9 } }, { type: "UNKNOWN" }],
        expectedActiveIds: ["incident-unknown"],
      },
      {
        id: "incident-confirmed",
        label: "Confirm outcome independently",
        events: [
          { type: "CLASSIFIED", payload: { confidence: 0.9 } },
          { type: "UNKNOWN" },
          { type: "CONFIRMED" },
        ],
        expectedActiveIds: ["incident-done"],
      },
    ],
  },
  {
    id: "support",
    label: "Nested handoff",
    description:
      "Compound state navigation, a parent-owned transition and a separately browsable submachine.",
    document: support,
    options: {},
    scenarios: [
      {
        id: "support-handoff-close",
        label: "Handoff then close",
        events: [{ type: "HANDOFF" }, { type: "CLOSE" }],
        expectedActiveIds: ["support-closed"],
      },
      {
        id: "support-direct-close",
        label: "Close during intake",
        events: [{ type: "CLOSE" }],
        expectedActiveIds: ["support-closed"],
      },
    ],
  },
];

/** Fixed synthetic observation time keeps server and client output deterministic. */
export const machineLabObservedAt = Date.UTC(2026, 0, 15, 10, 0, 0);
export const machineLabInspection: MachineInspectionSession = {
  source: "committed",
  connection: "connected",
  sequence: 12,
  cursor: "demo:12",
  continuity: "contiguous",
  frames: [
    {
      id: "frame-10",
      sequence: 10,
      committed: true,
      timestamp: machineLabObservedAt,
      actorId: "release-coordinator",
      machineId: "release",
      activeIds: ["release-draft"],
      status: "active",
      context: { attempts: 0, approved: false },
      metadata: { version: "demo-v1", instance: "demo-release-17" },
    },
    {
      id: "frame-11",
      sequence: 11,
      committed: true,
      timestamp: machineLabObservedAt + 1000,
      actorId: "release-coordinator",
      machineId: "release",
      activeIds: ["release-review"],
      status: "waiting",
      event: { type: "SUBMIT" },
      transitionIds: ["release-submit"],
      context: { attempts: 0, approved: false },
    },
    {
      id: "frame-worker",
      sequence: 12,
      committed: true,
      timestamp: machineLabObservedAt + 1200,
      actorId: "review-helper",
      parentActorId: "release-coordinator",
      machineId: "release",
      activeIds: ["release-review"],
      status: "active",
      event: { type: "REVIEW_REQUESTED" },
    },
  ],
  diagnostics: {
    timers: [
      {
        id: "review-deadline",
        dueAt: machineLabObservedAt + 86400000,
        event: "EXPIRED",
        status: "pending",
      },
    ],
    effects: [
      { id: "check-17", label: "Check release policy", status: "succeeded", attempts: 1 },
      { id: "notify-17", label: "Reviewer notification", status: "unknown", attempts: 1 },
    ],
    tasks: [
      {
        id: "approval-17",
        label: "Review the release note",
        status: "waiting",
        assignee: "Demo reviewer",
      },
    ],
    messages: [
      {
        id: "message-1",
        sourceActorId: "release-coordinator",
        targetActorId: "review-helper",
        event: "REVIEW_REQUESTED",
        timestamp: machineLabObservedAt + 1100,
      },
    ],
  },
};
