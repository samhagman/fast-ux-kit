/** Portable, serializable graph data. IDs are unique across a document. */
export type MachineNodeKind =
  "atomic" | "compound" | "parallel" | "initial" | "final" | "submachine" | "note";
export type MachineDirection = "LR" | "TB";
export interface MachinePoint {
  readonly x: number;
  readonly y: number;
}
export interface MachineNode {
  readonly id: string;
  readonly label: string;
  readonly kind: MachineNodeKind;
  readonly parentId?: string;
  readonly position?: MachinePoint;
  readonly initialId?: string;
  readonly machineId?: string;
  readonly description?: string;
  /** Annotation relationship, not state hierarchy. Valid only on notes. */
  readonly attachedToId?: string;
  readonly entry?: readonly string[];
  readonly exit?: readonly string[];
  readonly tags?: readonly string[];
}
export interface MachineTransition {
  readonly id: string;
  readonly sourceId: string;
  readonly targetId: string;
  /** Empty/omitted event means an automatic transition. */
  readonly event?: string;
  /** Name resolved by a trusted consumer callback; never executed as source. */
  readonly guard?: string;
  readonly actions?: readonly string[];
  readonly description?: string;
  readonly internal?: boolean;
}
export interface MachineGraph {
  readonly id: string;
  readonly label: string;
  readonly initialId?: string;
  readonly nodes: readonly MachineNode[];
  readonly transitions: readonly MachineTransition[];
}
export interface MachineDocument {
  readonly version: 1;
  readonly rootId: string;
  readonly machines: readonly MachineGraph[];
}
export interface MachineIssue {
  readonly code: string;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly machineId?: string;
  readonly nodeId?: string;
  readonly transitionId?: string;
}
export type MachineCommand =
  | { readonly type: "add-node"; readonly machineId: string; readonly node: MachineNode }
  | {
      readonly type: "update-node";
      readonly machineId: string;
      readonly id: string;
      readonly patch: Partial<Omit<MachineNode, "id">>;
    }
  | {
      readonly type: "move-node";
      readonly machineId: string;
      readonly id: string;
      readonly position: MachinePoint;
      readonly direction?: MachineDirection;
    }
  | {
      readonly type: "reparent-node";
      readonly machineId: string;
      readonly id: string;
      readonly parentId?: string;
    }
  | { readonly type: "delete-node"; readonly machineId: string; readonly id: string }
  | {
      readonly type: "add-transition";
      readonly machineId: string;
      readonly transition: MachineTransition;
    }
  | {
      readonly type: "update-transition";
      readonly machineId: string;
      readonly id: string;
      readonly patch: Partial<Omit<MachineTransition, "id">>;
    }
  | { readonly type: "delete-transition"; readonly machineId: string; readonly id: string }
  | { readonly type: "add-machine"; readonly machine: MachineGraph }
  | {
      readonly type: "update-machine";
      readonly machineId: string;
      readonly patch: Partial<Pick<MachineGraph, "label" | "initialId">>;
    }
  | { readonly type: "layout"; readonly machineId: string; readonly direction: MachineDirection };
export interface MachineCommandResult {
  readonly ok: boolean;
  readonly document: MachineDocument;
  readonly issues: readonly MachineIssue[];
}
export interface MachineHistory {
  readonly past: readonly MachineDocument[];
  readonly present: MachineDocument;
  readonly future: readonly MachineDocument[];
}
export interface MachineLayoutNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly depth: number;
}
export interface MachineLayout {
  readonly nodes: readonly MachineLayoutNode[];
  readonly width: number;
  readonly height: number;
}
export interface MachineEvent {
  readonly type: string;
  readonly payload?: unknown;
}
export interface MachineTraceEntry {
  readonly sequence: number;
  readonly event: string;
  readonly transitionIds: readonly string[];
  readonly entered: readonly string[];
  readonly exited: readonly string[];
  readonly actions: readonly string[];
  readonly activeIds: readonly string[];
  readonly note?: string;
}
export interface MachineSnapshot {
  readonly machineId: string;
  readonly activeIds: readonly string[];
  readonly status: "running" | "done" | "error";
  readonly context: Readonly<Record<string, unknown>>;
  readonly trace: readonly MachineTraceEntry[];
  readonly sequence: number;
  readonly error?: string;
}
export interface MachineRuntimeOptions {
  /** Optional plain-language guard explanations. Never interpreted as executable source. */
  readonly guardDescriptions?: Readonly<
    Record<string, (context: Readonly<Record<string, unknown>>, event: MachineEvent) => string>
  >;
  readonly guards?: Readonly<
    Record<string, (context: Readonly<Record<string, unknown>>, event: MachineEvent) => boolean>
  >;
  /** Actions must be pure. Return the next context; external effects belong to the host. */
  readonly actions?: Readonly<
    Record<
      string,
      (
        context: Readonly<Record<string, unknown>>,
        event: MachineEvent,
      ) => Readonly<Record<string, unknown>>
    >
  >;
  readonly maxMicrosteps?: number;
  readonly traceLimit?: number;
}
/** Host-owned live inspection protocol; transporting or executing a runtime is not implied. */
export interface MachineInspectionFrame {
  readonly id: string;
  /** Optional monotonic source sequence. Omit when the source cannot prove ordering. */
  readonly sequence?: number;
  /** False identifies a speculative frame; committed feeds reject it. */
  readonly committed?: boolean;
  readonly timestamp: number;
  readonly actorId: string;
  readonly parentActorId?: string;
  readonly machineId: string;
  readonly activeIds: readonly string[];
  readonly status?: string;
  readonly event?: MachineEvent;
  readonly transitionIds?: readonly string[];
  readonly context?: Readonly<Record<string, unknown>>;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly streamId?: string;
  readonly runId?: string;
  readonly machineVersion?: string | number;
  readonly definitionId?: string;
  /** These facts belong to this observation, never to whichever frame is latest. */
  readonly work?: readonly MachinePendingWork[];
  readonly diagnostics?: MachineInspectionDiagnostics;
  readonly guidance?: string;
  readonly contextReferences?: Readonly<Record<string, MachineDataReference>>;
  readonly availableEvents?: readonly {
    readonly type: string;
    readonly enabled: boolean;
    readonly reason?: string;
  }[];
}

export interface MachineDataReference {
  readonly label: string;
  readonly bytes?: number;
  readonly reference?: string;
}
export interface MachinePendingWork {
  readonly id: string;
  readonly kind: "timer" | "task" | "effect" | "invoke" | "subscription" | "agent" | "other";
  readonly label: string;
  readonly status: string;
  readonly stateId?: string;
  readonly dueAt?: number;
  readonly since?: number;
  readonly attempts?: number;
  readonly details?: Readonly<Record<string, unknown>>;
}
/** A journal entry is not a snapshot. A commit can contain many entries or no transition. */
export interface MachineJournalRecord {
  readonly id: string;
  readonly actorId: string;
  readonly machineId: string;
  readonly streamId?: string;
  readonly runId?: string;
  readonly machineVersion?: string | number;
  readonly frameId?: string;
  readonly sequence?: number;
  readonly timestamp?: number;
  readonly kind:
    "accepted" | "rejected" | "ignored" | "task" | "timer" | "effect" | "lifecycle" | "other";
  readonly label: string;
  readonly outcome?: string;
  readonly nodeIds?: readonly string[];
  readonly transitionIds?: readonly string[];
  readonly event?: MachineEvent;
  readonly details?: Readonly<Record<string, unknown>>;
}
/** Optional display data; never changes topology, runtime semantics or document version. */
export interface MachinePresentation {
  readonly machineVersions?: Readonly<Record<string, string | number>>;
  readonly nodes?: Readonly<
    Record<
      string,
      {
        readonly kindLabel?: string;
        /** Targetless handlers and periodic work remain activities, not invented self edges. */
        readonly activities?: readonly {
          readonly id: string;
          readonly label: string;
          readonly description?: string;
        }[];
        readonly details?: Readonly<Record<string, unknown>>;
      }
    >
  >;
  readonly transitions?: Readonly<
    Record<string, { readonly trigger?: string; readonly description?: string }>
  >;
}
export interface MachineInspectionUpdate {
  readonly id: string;
  readonly streamId: string;
  /** Transport order, independent of a machine's state/journal sequence. */
  readonly ordinal?: number;
  readonly sequence?: number;
  readonly cursor?: string;
  readonly previousCursor?: string;
  readonly committed?: boolean;
  readonly frames?: readonly MachineInspectionFrame[];
  readonly records?: readonly MachineJournalRecord[];
  readonly continuity?: "unknown" | "contiguous" | "gap";
  readonly connection?: MachineInspectionSession["connection"];
}
/** Diagnostic payloads are optional; views must default to topology-only display. */
export interface MachineInspectionDiagnostics {
  readonly timers?: readonly {
    readonly id: string;
    readonly dueAt?: number;
    readonly event?: string;
    readonly status: "pending" | "fired" | "cancelled";
  }[];
  readonly effects?: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: "pending" | "running" | "succeeded" | "failed" | "unknown";
    readonly attempts?: number;
    readonly retryAt?: number;
  }[];
  readonly tasks?: readonly {
    readonly id: string;
    readonly label: string;
    readonly status: "waiting" | "approved" | "rejected" | "completed";
    readonly assignee?: string;
  }[];
  readonly messages?: readonly {
    readonly id: string;
    readonly sourceActorId?: string;
    readonly targetActorId: string;
    readonly event: string;
    readonly timestamp: number;
  }[];
}
export interface MachineInspectionSession {
  /** Change identity when loading a different run/feed. */
  readonly id?: string;
  readonly source: "committed" | "live" | "simulation";
  readonly connection: "connected" | "stale" | "disconnected" | "gap";
  readonly cursor?: string;
  readonly sequence?: number;
  /** Continuity is only established by explicit source sequence numbers. */
  readonly continuity?: "unknown" | "contiguous" | "gap";
  /** Sticky until the host starts a fresh/resynchronized session. */
  readonly hasUnsequencedFrames?: boolean;
  readonly lastRejected?: {
    readonly frameId: string;
    readonly reason: "uncommitted" | "late" | "invalid-sequence";
  };
  readonly frames: readonly MachineInspectionFrame[];
  readonly diagnostics?: MachineInspectionDiagnostics;
  readonly records?: readonly MachineJournalRecord[];
  readonly streams?: Readonly<
    Record<
      string,
      { readonly ordinal?: number; readonly cursor?: string; readonly sequence?: number }
    >
  >;
  readonly acceptedUpdateIds?: readonly string[];
  /** Recent identities survive display retention, so overlapping deliveries cannot resurrect evicted facts. */
  readonly acceptedFrameIds?: readonly string[];
  readonly acceptedRecordIds?: readonly string[];
  readonly omittedFrames?: number;
  readonly omittedRecords?: number;
  readonly lastUpdateRejection?: {
    readonly updateId: string;
    readonly reason: "uncommitted" | "late" | "invalid-order" | "duplicate-identity";
  };
}
/** Adapters are explicitly versioned and supplied by the host. No runtime is bundled. */
export interface MachineInspectionAdapter<T = unknown> {
  readonly id: string;
  readonly version: string;
  readonly normalize: (input: T) => MachineInspectionFrame | null;
}
export interface MachineScenario {
  readonly id: string;
  readonly label: string;
  readonly events: readonly MachineEvent[];
  readonly expectedActiveIds?: readonly string[];
}
