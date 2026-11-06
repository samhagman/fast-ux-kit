import * as React from "react";
import {
  compareMachineInspectionContexts,
  type MachineInspectionFrame,
  type MachinePresentation,
} from "../core/index.js";
import { Button } from "../components/ui/button.js";
import { Badge } from "../components/ui/badge.js";
import { Input } from "../components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select.js";
import { inspectionFrameKey, type MachineInspectionController } from "./use-machine-inspection.js";

export function inspectionTime(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && Math.abs(value) <= 8.64e15
    ? new Date(value).toISOString()
    : "Time unavailable";
}
export function MachinePresentationDetails({
  presentation,
  id,
  kind,
}: {
  readonly presentation?: MachinePresentation;
  readonly id?: string;
  readonly kind?: "node" | "transition";
}) {
  if (!id) return null;
  const node = kind === "node" ? presentation?.nodes?.[id] : undefined;
  const transition = kind === "transition" ? presentation?.transitions?.[id] : undefined;
  if (!node && !transition) return null;
  return (
    <section
      aria-label="Selected behavior"
      className="mb-3 flex flex-col gap-2 border-b border-hairline pb-3"
    >
      <h3 className="font-medium">{node?.kindLabel ?? transition?.trigger ?? id}</h3>
      {node?.activities?.map((a) => (
        <div key={a.id}>
          <p>{a.label}</p>
          {a.description && (
            <p className="whitespace-pre-wrap text-2xs text-muted-foreground">{a.description}</p>
          )}
        </div>
      ))}
      {transition?.description && <p>{transition.description}</p>}
      {node?.details && <MachineValue value={node.details} label="Behavior details" />}
    </section>
  );
}
/** Bounded inert preview, using the portable descriptor-only reader (no JSON.stringify of host objects). */
export function MachineValue({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label: string;
}) {
  const base: MachineInspectionFrame = {
    id: "preview",
    actorId: "preview",
    machineId: "preview",
    timestamp: 0,
    activeIds: [],
    context: {},
  };
  const entries = compareMachineInspectionContexts(
    base,
    { ...base, context: { value } },
    { maxDepth: 8, maxItems: 400, maxEntries: 40, maxOutputLength: 6000 },
  );
  return (
    <details className="min-w-0 rounded-md border border-hairline px-2.5 py-2">
      <summary className="cursor-pointer text-ui">{label}</summary>
      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all font-mono text-[11px] text-muted-foreground">
        {entries.entries
          .map((e) => `${e.path.replace(/^\/value/, "") || "/"}: ${e.after}`)
          .join("\n") || (value === undefined ? "Unavailable" : "No values")}
        {entries.truncated ? "\nPreview truncated" : ""}
      </pre>
    </details>
  );
}
export function MachineInspectionPanel({
  inspection,
  onReveal,
}: {
  readonly inspection: MachineInspectionController;
  readonly onReveal?: (machineId: string, id: string, kind: "node" | "transition") => void;
}) {
  const i = inspection,
    f = i.frame;
  const [query, setQuery] = React.useState("");
  const [kind, setKind] = React.useState("all");
  const [historyLimit, setHistoryLimit] = React.useState(50);
  const records = (i.session?.records ?? [])
    .slice(-2000)
    .filter(
      (r) =>
        r.actorId === i.actorId &&
        (kind === "all" || r.kind === kind) &&
        `${r.label} ${r.outcome ?? ""} ${r.kind}`.toLowerCase().includes(query.toLowerCase()),
    );
  const labelId = React.useId();
  return (
    <div data-slot="machine-inspection" className="flex min-w-0 flex-col gap-3 text-ui">
      {!i.session ? (
        <p className="text-muted-foreground">Supply an inspection session to observe a run.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{i.session.source}</Badge>
            <span data-inspection-connection className="text-muted-foreground">
              {i.session.connection}
            </span>
            {i.session.continuity && (
              <span className="text-muted-foreground">History {i.session.continuity}</span>
            )}
          </div>
          <label htmlFor={`${labelId}-actor`}>Actor</label>
          <Select value={i.actorId ?? ""} onValueChange={(v) => i.selectActor(v)}>
            <SelectTrigger id={`${labelId}-actor`} className="w-full">
              <SelectValue placeholder="No actors" />
            </SelectTrigger>
            <SelectContent>
              {i.actors.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {f ? (
            <section aria-label="Observation" className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <strong>{f.status ?? "Status unavailable"}</strong>
                {f.machineVersion !== undefined && (
                  <span className="font-mono text-2xs">v{f.machineVersion}</span>
                )}
              </div>
              <p className="break-all text-2xs text-muted-foreground">
                {f.runId ? `${f.runId} · ` : ""}
                {f.machineId} · {inspectionTime(f.timestamp)}
                {f.sequence !== undefined ? ` · #${f.sequence}` : ""}
              </p>
              {f.guidance && <p className="whitespace-pre-wrap">{f.guidance}</p>}
              {f.availableEvents && (
                <details>
                  <summary className="cursor-pointer">Available events</summary>
                  {f.availableEvents.slice(0, 100).map((e) => (
                    <p key={e.type} className="mt-1 text-2xs">
                      {e.type} · {e.enabled ? "available" : "blocked"}
                      {e.reason ? ` · ${e.reason}` : ""}
                    </p>
                  ))}
                </details>
              )}
              {i.mismatch && (
                <p role="status" className="text-warning">
                  Observation topology or version does not match. Activity is not highlighted.
                </p>
              )}
              {!!i.unknownIds.length && (
                <p role="status" className="break-words text-warning">
                  Unknown active states: {i.unknownIds.join(", ")}
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                {f.activeIds.map((id, index) => (
                  <Button
                    key={`${id}-${index}`}
                    size="sm"
                    variant="ghost"
                    onClick={() => onReveal?.(f.machineId, id, "node")}
                  >
                    {id}
                  </Button>
                ))}
              </div>
              {i.props.showDiagnostics && (
                <>
                  <MachineValue value={f.event?.payload} label="Event payload" />
                  <MachineValue value={f.context} label="Context" />
                  {f.contextReferences && (
                    <MachineValue value={f.contextReferences} label="Unloaded context references" />
                  )}
                  <details>
                    <summary className="cursor-pointer">Context changes</summary>
                    <p className="mt-1 text-2xs text-muted-foreground">
                      {i.previous ? `${i.previous.id} → ${f.id}` : "Previous context unavailable"}.
                      Supplied observations; differences do not establish causality.
                    </p>
                    {i.diff?.entries.map((e) => (
                      <p key={e.path} className="mt-1 break-all font-mono text-[11px]">
                        {e.kind} {e.path || "/"}: {e.before} → {e.after}
                      </p>
                    ))}
                    {i.diff?.truncated && <p>Comparison truncated</p>}
                  </details>
                  {f.diagnostics && (
                    <MachineValue value={f.diagnostics} label="Additional diagnostics" />
                  )}
                  {f.metadata && <MachineValue value={f.metadata} label="Observation metadata" />}
                </>
              )}
              <section aria-label="Pending work" className="flex flex-col gap-2">
                <h3 className="font-medium">Pending work</h3>
                {f.work === undefined ? (
                  <p className="text-muted-foreground">Work unavailable for this observation</p>
                ) : f.work.length === 0 ? (
                  <p className="text-muted-foreground">No pending work supplied</p>
                ) : (
                  f.work.slice(0, 200).map((w) => (
                    <div key={w.id} className="rounded-md border border-hairline px-2.5 py-2">
                      <div className="flex items-start justify-between gap-2">
                        <span>{w.label}</span>
                        <Badge variant="outline">{w.status}</Badge>
                      </div>
                      <p className="text-2xs text-muted-foreground">
                        {w.kind}
                        {w.dueAt !== undefined ? ` · due ${inspectionTime(w.dueAt)}` : ""}
                        {w.attempts !== undefined ? ` · attempt ${w.attempts}` : ""}
                      </p>
                      {w.stateId && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onReveal?.(f.machineId, w.stateId!, "node")}
                        >
                          {w.stateId}
                        </Button>
                      )}
                      {i.props.showDiagnostics && w.details && (
                        <MachineValue value={w.details} label="Work details" />
                      )}
                    </div>
                  ))
                )}
                {(f.work?.length ?? 0) > 200 && <p>Work list truncated</p>}
              </section>
              {i.props.renderInspectionDetails?.(f)}
            </section>
          ) : (
            <p role="status" className="text-muted-foreground">
              {i.historical
                ? "Selected observation is unavailable. It may have left retained history."
                : "No observation available"}
            </p>
          )}
          {i.historical && (
            <Button variant="outline" size="sm" onClick={() => i.selectFrame(null)}>
              Return to latest
            </Button>
          )}
          {!!i.props.inspectionActions?.length && (
            <section aria-label="Workflow actions" className="flex flex-col gap-2">
              <h3 className="font-medium">Actions</h3>
              {i.actionBlock && <p className="text-2xs text-muted-foreground">{i.actionBlock}</p>}
              {i.props.inspectionActions.map((action) => {
                const request = i.requests[action.id];
                const disabled = !!i.actionBlock || action.enabled === false || !!request?.pending;
                const args = {
                  action,
                  disabled,
                  pending: !!request?.pending,
                  submit: (input?: unknown) => {
                    void i.submit(action, input);
                  },
                };
                return (
                  <div key={action.id}>
                    {i.props.renderInspectionAction ? (
                      i.props.renderInspectionAction(args)
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        aria-disabled={disabled}
                        className="aria-disabled:opacity-50"
                        onClick={() => {
                          if (!disabled) args.submit();
                        }}
                      >
                        {action.label}
                      </Button>
                    )}
                    {action.enabled === false && action.reason && (
                      <p className="text-2xs text-muted-foreground">{action.reason}</p>
                    )}
                    {request && (
                      <p role="status" className="mt-1 text-2xs text-muted-foreground">
                        {request.message}
                      </p>
                    )}
                  </div>
                );
              })}
            </section>
          )}
          <section aria-label="Observation history" className="flex flex-col gap-2">
            <h3 className="font-medium">Observations</h3>
            <p className="text-2xs text-muted-foreground">
              Showing {Math.min(historyLimit, i.actorFrames.length)} of {i.actorFrames.length}{" "}
              retained observations
            </p>
            {i.actorFrames.slice(-historyLimit).map((frame) => (
              <Button
                key={inspectionFrameKey(frame)}
                variant="ghost"
                size="sm"
                aria-pressed={frame === f}
                className="h-auto min-h-9 justify-start whitespace-normal text-start coarse:min-h-11"
                onClick={() => i.selectFrame(inspectionFrameKey(frame))}
              >
                {frame.event?.type ?? frame.status ?? "Observation"} ·{" "}
                {frame.sequence === undefined ? frame.id : `#${frame.sequence}`}
                <span className="ms-auto text-2xs text-muted-foreground">
                  {inspectionTime(frame.timestamp).slice(11, 19)}
                </span>
              </Button>
            ))}
            {historyLimit < i.actorFrames.length && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setHistoryLimit((n) => Math.min(2000, n + 100))}
              >
                Show earlier observations
              </Button>
            )}
            {((i.session.omittedFrames ?? 0) > 0 || i.session.frames.length > 2000) && (
              <p className="text-2xs text-muted-foreground">Earlier observations omitted</p>
            )}
          </section>
          <section aria-label="Journal" className="flex flex-col gap-2">
            <h3 className="font-medium">Journal</h3>
            <Input
              aria-label="Filter journal"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter journal…"
            />
            <Select value={kind} onValueChange={(v) => setKind(v)}>
              <SelectTrigger aria-label="Journal kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[
                  "all",
                  "accepted",
                  "rejected",
                  "ignored",
                  "task",
                  "timer",
                  "effect",
                  "lifecycle",
                  "other",
                ].map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {records.length ? (
              records.slice(-200).map((r) => (
                <div
                  key={JSON.stringify([r.streamId, r.id])}
                  className="rounded-md border border-hairline px-2.5 py-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{r.kind}</Badge>
                    <span>{r.label}</span>
                  </div>
                  <p className="mt-1 text-2xs text-muted-foreground">
                    {r.outcome ? `${r.outcome} · ` : ""}
                    {inspectionTime(r.timestamp)}
                  </p>
                  {r.frameId && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => i.selectFrame(JSON.stringify([r.streamId ?? "", r.frameId]))}
                    >
                      View observation
                    </Button>
                  )}
                  {r.nodeIds?.slice(0, 20).map((id) => (
                    <Button
                      key={id}
                      variant="ghost"
                      size="sm"
                      onClick={() => onReveal?.(r.machineId, id, "node")}
                    >
                      {id}
                    </Button>
                  ))}
                  {r.transitionIds?.slice(0, 20).map((id) => (
                    <Button
                      key={id}
                      variant="ghost"
                      size="sm"
                      onClick={() => onReveal?.(r.machineId, id, "transition")}
                    >
                      {id}
                    </Button>
                  ))}
                  {i.props.showDiagnostics && r.details && (
                    <MachineValue value={r.details} label="Record details" />
                  )}
                </div>
              ))
            ) : (
              <p className="text-muted-foreground">No matching journal records</p>
            )}
            {(records.length > 200 || (i.session.omittedRecords ?? 0) > 0) && (
              <p className="text-2xs text-muted-foreground">Earlier records omitted</p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
