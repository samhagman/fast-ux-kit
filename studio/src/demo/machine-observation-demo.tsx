import * as React from "react";
import {
  applyMachineInspectionUpdate,
  type MachineDocument,
  type MachineInspectionFrame,
  type MachineInspectionSession,
  type MachinePendingWork,
  type MachinePresentation,
} from "@samhagman/fast-ux-kit/machine";
import type { MachineInspectionProps } from "@samhagman/fast-ux-kit/machine-graph";
import type { MachineTreeProps } from "@samhagman/fast-ux-kit/machine-tree";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@samhagman/fast-ux-kit/components/ui/select";

const MachineGraphView = React.lazy(() =>
  import("@samhagman/fast-ux-kit/machine-graph").then((module) => ({
    default: module.MachineGraphView,
  })),
);
const MachineTree = React.lazy(() =>
  import("@samhagman/fast-ux-kit/machine-tree").then((module) => ({ default: module.MachineTree })),
);

export const observationDocument: MachineDocument = {
  version: 1,
  rootId: "orders",
  machines: [
    {
      id: "orders",
      label: "Order coordination",
      initialId: "processing",
      nodes: [
        { id: "processing", label: "Processing", kind: "parallel" },
        {
          id: "review",
          label: "Review",
          kind: "compound",
          parentId: "processing",
          initialId: "waiting",
        },
        { id: "waiting", label: "Awaiting approval", kind: "atomic", parentId: "review" },
        { id: "approved", label: "Approved", kind: "final", parentId: "review" },
        {
          id: "fulfilment",
          label: "Fulfilment",
          kind: "compound",
          parentId: "processing",
          initialId: "queued",
        },
        { id: "queued", label: "Queued for dispatch", kind: "atomic", parentId: "fulfilment" },
        { id: "dispatched", label: "Dispatched", kind: "final", parentId: "fulfilment" },
        { id: "complete", label: "Complete", kind: "final" },
      ],
      transitions: [
        {
          id: "approval",
          sourceId: "waiting",
          targetId: "approved",
          event: "APPROVE",
          guard: "destinationConfirmed",
        },
        { id: "dispatch", sourceId: "queued", targetId: "dispatched", event: "DISPATCH" },
        { id: "finish", sourceId: "processing", targetId: "complete", event: "FINISH" },
      ],
    },
  ],
};
export const observationPresentation: MachinePresentation = {
  machineVersions: { orders: 2 },
  nodes: {
    waiting: {
      kindLabel: "approval",
      activities: [
        {
          id: "reminder",
          label: "Every 2m · send reminder",
          description: "A periodic activity supplied by the host; it does not exit this state.",
        },
      ],
    },
    queued: { kindLabel: "invoke", details: { operation: "Dispatch order", timeout: "30s" } },
  },
};
const initialWork: readonly MachinePendingWork[] = [
  {
    id: "task",
    kind: "task",
    label: "Confirm the destination",
    status: "waiting",
    stateId: "waiting",
  },
  {
    id: "call",
    kind: "invoke",
    label: "Dispatch request",
    status: "queued",
    stateId: "queued",
    attempts: 1,
  },
  {
    id: "timer",
    kind: "timer",
    label: "Approval reminder",
    status: "pending",
    dueAt: 1793910000000,
    stateId: "waiting",
  },
];
function observed(id: string, sequence: number, approved = false): MachineInspectionFrame {
  return {
    id,
    actorId: "order-42",
    machineId: "orders",
    runId: "example-run",
    machineVersion: 2,
    sequence,
    timestamp: 1793908800000 + sequence * 1000,
    committed: true,
    activeIds: ["processing", "review", approved ? "approved" : "waiting", "fulfilment", "queued"],
    status: "active",
    context: { destinationConfirmed: approved, order: { count: 3 } },
    contextReferences: {
      receipts: { label: "Archived receipts", bytes: 1048576, reference: "example:receipts" },
    },
    work: approved ? initialWork.filter((w) => w.kind !== "task") : initialWork,
    guidance: approved
      ? "The order is waiting for dispatch."
      : "Confirm the destination before approving.",
    availableEvents: [
      { type: "APPROVE", enabled: !approved, reason: approved ? "Already approved" : undefined },
    ],
  };
}
const initial: MachineInspectionSession = applyMachineInspectionUpdate(
  { id: "example-run", source: "committed", connection: "connected", frames: [] },
  {
    id: "initial",
    streamId: "orders",
    ordinal: 1,
    frames: [
      observed("observation-1", 1),
      { ...observed("other-order", 1), actorId: "order-43", runId: "other-run" },
    ],
    records: [
      {
        id: "started",
        actorId: "order-42",
        machineId: "orders",
        frameId: "observation-1",
        kind: "lifecycle",
        label: "Order started",
        timestamp: 1793908801000,
      },
    ],
  },
);

/** A deterministic synthetic host: no network requests, credentials or external actions. */
export function MachineObservationDemo({
  dir,
  view = "canvas",
}: {
  readonly dir?: "rtl" | "ltr";
  readonly view?: "canvas" | "tree";
}) {
  const [session, setSession] = React.useState(initial);
  const [reject, setReject] = React.useState(false);
  const serial = React.useRef(1);
  const [actor, setActor] = React.useState("order-42");
  const latest = session.frames.findLast((frame) => frame.actorId === actor);
  const append = (
    kind: "accepted" | "rejected" | "effect" = "accepted",
    approved?: boolean,
    actorId = actor,
  ) => {
    const n = ++serial.current;
    setSession((s) => {
      const previous = s.frames.findLast((frame) => frame.actorId === actorId)!;
      const nextApproved = approved ?? previous.activeIds.includes("approved");
      return applyMachineInspectionUpdate(s, {
        id: `update-${n}`,
        streamId: "orders",
        ordinal: n,
        cursor: `cursor:${n}`,
        frames: [
          {
            ...observed(
              `observation-${n}`,
              kind === "accepted" ? (previous.sequence ?? 0) + 1 : (previous.sequence ?? 0),
              nextApproved,
            ),
            actorId,
            runId: previous.runId,
            timestamp: 1793908800000 + n * 1000,
            ...(kind === "effect"
              ? {
                  work: previous.work?.map((work) =>
                    work.kind === "invoke"
                      ? { ...work, status: "retrying", attempts: (work.attempts ?? 0) + 1 }
                      : work,
                  ),
                }
              : kind === "rejected"
                ? { work: previous.work }
                : {}),
          },
        ],
        records: [
          {
            id: `record-${n}`,
            actorId,
            machineId: "orders",
            frameId: `observation-${n}`,
            kind,
            label:
              kind === "rejected"
                ? "APPROVE rejected"
                : kind === "effect"
                  ? "Dispatch retry scheduled"
                  : "Observation committed",
            outcome: kind === "rejected" ? "Destination requires confirmation" : undefined,
            timestamp: 1793908800000 + n * 1000,
          },
        ],
      });
    });
  };
  const inspection: MachineInspectionProps = {
    inspectionSession: session,
    inspectionActorId: actor,
    onInspectionActorChange: setActor,
    showDiagnostics: true,
    presentation: observationPresentation,
    inspectionActions: [
      {
        id: "approve",
        label: "Approve destination",
        enabled: latest?.activeIds.includes("waiting"),
        reason: "The destination is already approved",
      },
    ],
    onInspectionAction: async (_id, frame, request) => {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 350);
        request.signal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("Request cancelled"));
          },
          { once: true },
        );
      });
      if (request.signal.aborted) return;
      if (reject) throw new Error("The host rejected this request");
      append("accepted", true, frame.actorId);
    },
  };
  const demoProps = {
    document: observationDocument,
    dir,
    ...inspection,
    runtime: {
      guards: {
        destinationConfirmed: (_c, event) =>
          (event.payload as { confirmed?: boolean } | undefined)?.confirmed === true,
      },
      guardDescriptions: {
        destinationConfirmed: () => "Send a payload with confirmed set to true",
      },
    },
    scenarios: [
      {
        id: "approved",
        label: "Approval succeeds",
        events: [{ type: "APPROVE", payload: { confirmed: true } }],
        expectedActiveIds: ["processing", "review", "approved", "fulfilment", "queued"],
      },
      {
        id: "blocked",
        label: "Missing confirmation",
        events: [{ type: "APPROVE" }],
        expectedActiveIds: ["processing", "review", "approved", "fulfilment", "queued"],
      },
    ],
    className: "min-h-0 flex-1",
  } satisfies MachineTreeProps;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex shrink-0 flex-wrap items-center gap-2 text-ui">
        <span className="me-auto text-muted-foreground">Synthetic run · no external actions</span>
        <Button size="sm" variant="outline" onClick={() => append()}>
          Advance run
        </Button>
        <Button size="sm" variant="outline" onClick={() => append("effect")}>
          Update work
        </Button>
        <Button size="sm" variant="outline" onClick={() => append("rejected")}>
          Record rejection
        </Button>
        <Select
          value={session.connection}
          onValueChange={(v) =>
            setSession((s) => ({ ...s, connection: v as MachineInspectionSession["connection"] }))
          }
        >
          <SelectTrigger aria-label="Feed connection" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {["connected", "stale", "disconnected", "gap"].map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant={reject ? "secondary" : "ghost"}
          aria-pressed={reject}
          onClick={() => setReject((v) => !v)}
        >
          Reject requests
        </Button>
      </div>
      <React.Suspense fallback={<p>Loading inspection view…</p>}>
        {view === "tree" ? (
          <MachineTree {...demoProps} />
        ) : (
          <MachineGraphView {...demoProps} readOnly />
        )}
      </React.Suspense>
    </div>
  );
}
