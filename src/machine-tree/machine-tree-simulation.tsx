import * as React from "react";
import { motion } from "motion/react";
import {
  Activity,
  ArrowRight,
  ChevronRight,
  CircleCheck,
  CircleStop,
  Code2,
  ListChecks,
  Lock,
  Play,
  RotateCcw,
  Square,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { type MachineGraph, type MachineScenario } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Separator } from "../components/ui/separator.js";
import { Textarea } from "../components/ui/textarea.js";
import { useMachineTree, useTreeBase } from "./machine-tree-controller.js";
import { useTreeLayout } from "./machine-tree-layout.js";
import {
  type MachineTreeFix,
  type MachineTreeScenarioReport,
  leafLabels,
  modCombo,
  plural,
  traceEventLabel,
} from "./machine-tree-logic.js";
import { IconButton } from "./machine-tree-primitives.js";
import { useTreeSimulation } from "./machine-tree-run.js";
import { useTree, useView } from "./machine-tree-store.js";
import { useModKey, useShortcutLabel } from "../lib/platform.js";

/** Run controls + status line. Built on the public `MachineTreeApi` plus the footer notice. */
export function MachineTreeFooter() {
  const api = useMachineTree();
  const { rootGraph } = useTreeBase();
  const { notice, applyFix, view } = useTreeSimulation();
  const { simulation } = api;
  // The dry run of the event under the pointer or focus, said in one line where the notice goes.
  const previewEvent = useView((state) => state.previewEvent);
  const previewVia = useView((state) => state.previewVia);
  const preview = previewEvent ? view.previewOf(previewEvent) : undefined;
  const MOD = useModKey();
  const shortcut = useShortcutLabel();
  const running = simulation.status !== "idle";
  const statusLabels = leafLabels(rootGraph, simulation.activeLeafIds);
  const replaying = simulation.replayStep !== null;
  return (
    // A focus zone: Simulate ⇄ Restart / Stop swap under the pointer, and focus follows to the new control.
    <div
      data-mt-zone=""
      className="flex h-11 shrink-0 items-center gap-1.5 border-t border-hairline px-2 coarse:h-[calc(3.25rem+env(safe-area-inset-bottom))] coarse:pb-[env(safe-area-inset-bottom)]"
    >
      {running ? (
        <>
          {/* Same word as the error card: an errored run is retried, a live one restarted. */}
          <IconButton
            label={simulation.status === "error" ? "Retry" : "Restart"}
            onClick={api.start}
          >
            <RotateCcw />
          </IconButton>
          <IconButton label="Stop" onClick={api.stop}>
            <Square className="size-3 fill-current" />
          </IconButton>
        </>
      ) : (
        <Button size="sm" className="coarse:h-11" onClick={api.start}>
          <Play className="fill-current" /> Simulate
        </Button>
      )}
      <Separator orientation="vertical" className="mx-1 h-4" />
      {/* Visual status only; announcements go through the single sr-only live region. */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
        <span
          aria-hidden
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            !running
              ? "bg-muted-foreground/40"
              : simulation.status === "error"
                ? "bg-destructive"
                : simulation.status === "done"
                  ? "bg-success"
                  : "bg-signal",
          )}
        />
        {!running ? (
          <span className="truncate">Not running</span>
        ) : simulation.status === "error" ? (
          <span className="truncate text-destructive">Stopped — {simulation.error}</span>
        ) : (
          <>
            {/* Narrow footers name the first active state and count the rest ("Connected +1") instead
                of truncating the second to a bare ellipsis; the full list is the title and the sr text. */}
            <span
              title={statusLabels.join(", ")}
              className="flex min-w-0 items-center gap-1 text-foreground/80"
            >
              <span className="sr-only">{`${simulation.status === "done" && !replaying ? "Final: " : ""}${statusLabels.join(", ")}`}</span>
              <span aria-hidden dir="auto" className="min-w-0 truncate max-md:hidden">
                {simulation.status === "done" && !replaying
                  ? `Final · ${statusLabels.join(" · ")}`
                  : statusLabels.join(" · ")}
              </span>
              <span aria-hidden dir="auto" className="min-w-0 truncate md:hidden">
                {simulation.status === "done" && !replaying
                  ? `Final · ${statusLabels[0] ?? ""}`
                  : (statusLabels[0] ?? "")}
              </span>
              {statusLabels.length > 1 && (
                <span
                  aria-hidden
                  className="shrink-0 rounded-[4px] bg-muted px-1 text-[10px] leading-4 tabular-nums md:hidden"
                >
                  +<bdi>{statusLabels.length - 1}</bdi>
                </span>
              )}
            </span>
            <span className="shrink-0 tabular-nums">
              ·{" "}
              <bdi>
                {replaying
                  ? `step ${simulation.replayStep}/${simulation.steps}`
                  : plural(simulation.steps, "step")}
              </bdi>
            </span>
            {preview ? (
              // `data-mt-preview`: while this line shows (md and up), a route pill doesn't repeat it in a tooltip.
              <span
                data-mt-preview=""
                className="flex min-w-0 items-center gap-1 text-signal max-md:hidden"
              >
                · <bdi className="font-semibold">{preview.event}</bdi>
                <ArrowRight aria-hidden className="size-3 shrink-0 rtl:rotate-180" />
                <bdi dir="auto" className="min-w-0 truncate">
                  {preview.to.join(", ")}
                </bdi>
                {/* A tree route sends on click: name the gesture that opens its target instead. */}
                {previewVia && (
                  <span className="shrink-0 text-muted-foreground coarse:hidden">
                    ·{" "}
                    <bdi dir="ltr">
                      {previewVia === "pointer" ? modCombo(MOD, "click") : shortcut("mod", "↵")}
                    </bdi>{" "}
                    to open
                  </span>
                )}
              </span>
            ) : (
              notice && (
                <span className="flex min-w-0 items-center gap-1.5 max-md:hidden">
                  <span
                    className={cn(
                      "min-w-0 truncate",
                      notice.tone === "warn"
                        ? "text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]"
                        : "text-muted-foreground",
                    )}
                  >
                    · {notice.short ?? notice.text}
                  </span>
                  {notice.fix && (
                    <button
                      type="button"
                      onClick={() => applyFix(notice.fix!, notice.rowId)}
                      className="mt-hit shrink-0 rounded-[5px] border border-signal/45 px-1.5 text-[10.5px] text-signal transition-colors hover:bg-signal-muted"
                    >
                      Try {notice.fix.text}
                    </button>
                  )}
                </span>
              )
            )}
          </>
        )}
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-1">
        {running && (
          <Button
            variant={api.panelOpen && api.panelTab === "simulation" ? "secondary" : "ghost"}
            size="sm"
            className="text-muted-foreground coarse:h-11 coarse:min-w-11"
            onClick={() => api.openPanel("simulation")}
          >
            <Activity /> <span className="max-sm:sr-only">Simulation</span>
          </Button>
        )}
        <Button
          variant={api.panelOpen && api.panelTab === "code" ? "secondary" : "ghost"}
          size="sm"
          onClick={() => api.openPanel("code", { expanded: true })}
          className="text-muted-foreground coarse:h-11 coarse:min-w-11"
        >
          <Code2 /> <span className="max-sm:sr-only">Code</span>
        </Button>
      </div>
    </div>
  );
}

export function SimulationTab({
  scenarios,
  rootGraph,
  contexts,
  onStart,
  onStop,
  touch,
}: {
  readonly scenarios: readonly MachineScenario[];
  readonly rootGraph: MachineGraph;
  readonly contexts: ReadonlyMap<number, Readonly<Record<string, unknown>>>;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly touch: boolean;
}) {
  const { model } = useTreeBase();
  const { setDiagnosticsOpen } = useTreeLayout();
  const { sim, playScenario, reports, runAllScenarios, payloads } = useTreeSimulation();
  const snapshot = sim.snapshot;
  const trace = snapshot?.trace ?? [];
  const steps = Math.max(0, trace.length - 1);
  const current = sim.cursor ?? trace.length - 1;
  const errored = snapshot?.status === "error";
  // The payload editor only matters while events can be sent: live and running.
  const sendable = snapshot?.status === "running" && sim.cursor === null;
  // Content first: the editor sits behind a one-line disclosure until asked for.
  const [payloadOpen, setPayloadOpen] = React.useState(false);
  const payloadRef = React.useRef<HTMLTextAreaElement>(null);
  const shownContext = snapshot
    ? sim.cursor !== null
      ? contexts.get(trace[sim.cursor]?.sequence ?? -1)
      : snapshot.context
    : undefined;
  const listRef = React.useRef<HTMLOListElement>(null);
  const payloadId = React.useId();
  const scrub = (index: number) => {
    const clamped = Math.max(0, Math.min(trace.length - 1, index));
    sim.setCursor(clamped === trace.length - 1 ? null : clamped);
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-step="${clamped}"]`)?.focus(),
    );
  };
  const checked = scenarios
    .map((s) => reports.get(s.id))
    .filter((r): r is MachineTreeScenarioReport => r?.passed !== undefined);
  const passedCount = checked.filter((r) => r.passed).length;
  const active = leafLabels(rootGraph, sim.frame?.activeIds ?? []);
  const { sendEvent, applyFix, setPreview, sim: view, handoff } = useTree();
  // What can fire right now, as one-tap chips: on a phone this is the whole point of the peek.
  const enabledEvents = sendable ? view.enabledEvents : [];
  // …and the blocked ones a scenario payload would unlock, as one-tap fixes (one per event).
  const fixChips = sendable
    ? // Also when the same event is enabled on another route: the payload picks the guarded one (incident: CLASSIFIED).
      [
        ...new Map(
          rootGraph.transitions.flatMap((t) => {
            const fix = view.fixes.get(t.id)?.[0];
            return fix ? [[`${fix.event}\u0000${fix.text}`, fix] as const] : [];
          }),
        ).values(),
      ]
    : [];
  const previewProps = (type: string) => ({
    onPointerEnter: () => setPreview(type),
    onPointerLeave: () => setPreview(null),
    // Keyboard focus previews; a programmatic focus hand-off after a tap doesn't (it would hide the notice).
    onFocus: () => !handoff.active && setPreview(type),
    onBlur: () => setPreview(null),
  });
  const hasPayload = sim.payloadText.trim().length > 0;
  const stateHeading =
    sim.cursor !== null
      ? `State at step ${sim.cursor}`
      : snapshot?.status === "done"
        ? "Final state"
        : "Current state";
  return (
    <div data-mt-zone="" className="grid gap-4 max-sm:gap-3">
      {!snapshot ? (
        <div className="grid gap-3">
          <p className="text-[12px] leading-4 text-muted-foreground">
            Run the root machine locally. Enabled events become buttons in the tree; targets stay
            navigation-only. Guards and actions come from the host runtime.
          </p>
          <Button size="sm" className="w-max coarse:h-11" onClick={onStart}>
            <Play className="fill-current" /> Start
          </Button>
        </div>
      ) : errored ? (
        // An errored run has no usable state, payload or history: say what happened and offer the way out.
        <div
          role="alert"
          className="grid gap-2 rounded-lg border border-destructive/40 bg-[color-mix(in_oklab,var(--destructive)_7%,var(--surface))] p-2.5"
        >
          <div className="flex items-center gap-1.5 font-mono text-[10px] tracking-wide text-destructive uppercase">
            <TriangleAlert aria-hidden className="size-3" /> Simulation stopped
          </div>
          <p className="text-[12px] leading-4">{snapshot.error ?? "The run errored."}</p>
          <p className="text-[11px] leading-4 text-muted-foreground">
            No events can be sent. Fix the document, then retry.
          </p>
          <div className="flex flex-wrap gap-1">
            <Button size="xs" variant="outline" className="coarse:h-11" onClick={onStart}>
              <RotateCcw /> Retry
            </Button>
            {model.issues.length > 0 && (
              <Button
                size="xs"
                variant="ghost"
                className="coarse:h-11"
                onClick={() => setDiagnosticsOpen(true)}
              >
                <TriangleAlert className="text-warning" /> See{" "}
                {plural(model.issues.length, "diagnostic")}
              </Button>
            )}
            <Button
              size="xs"
              variant="ghost"
              className="text-muted-foreground coarse:h-11"
              onClick={onStop}
            >
              <CircleStop /> Stop simulation
            </Button>
          </div>
        </div>
      ) : (
        <>
          {/* A focus zone that is itself focusable: when the last SEND chip leaves (the run finished), focus lands here. */}
          <section
            data-mt-zone=""
            tabIndex={-1}
            aria-label={`${stateHeading}: ${active.join(", ")}`}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {stateHeading}
              </h3>
              {/* Phones: the footer right below already has Restart and Stop; offer them once. */}
              {!touch && (
                <div className="-my-1 flex items-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Restart simulation"
                    onClick={onStart}
                  >
                    <RotateCcw />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Stop simulation"
                    onClick={onStop}
                  >
                    <Square className="size-2.5 fill-current" />
                  </Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-1">
              {active.map((label) => (
                <span
                  key={label}
                  dir="auto"
                  className="rounded-md border border-signal/40 bg-signal-muted px-1.5 py-0.5 text-[12px] font-medium text-signal"
                >
                  {label}
                </span>
              ))}
            </div>
            {(enabledEvents.length > 0 || fixChips.length > 0) && (
              <div
                data-mt-zone=""
                className="mt-2 flex flex-wrap items-center gap-1"
                role="group"
                aria-label="Send an event"
              >
                <span className="me-0.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  Send
                </span>
                {enabledEvents.map((type) => {
                  const preview = view.previewOf(type);
                  return (
                    <button
                      key={type}
                      type="button"
                      data-mt-prefer=""
                      aria-label={
                        preview ? `Send ${type}, moves to ${preview.to.join(", ")}` : `Send ${type}`
                      }
                      onClick={() => sendEvent(type)}
                      {...previewProps(type)}
                      className="flex h-6 items-center gap-1 rounded-[5px] border border-signal/50 px-1.5 font-mono text-[11px] font-semibold text-signal transition-colors hover:bg-signal hover:text-signal-foreground coarse:h-11 coarse:px-3"
                    >
                      <Zap aria-hidden className="size-2.5 fill-current" />
                      {type}
                    </button>
                  );
                })}
                {fixChips.map((fix: MachineTreeFix) => (
                  <button
                    key={`${fix.event}${fix.text}`}
                    type="button"
                    aria-label={`${fix.event} is blocked; try it with ${fix.text}`}
                    onClick={() => applyFix(fix)}
                    className="flex h-6 min-w-0 items-center gap-1 rounded-[5px] border border-dashed border-warning/70 px-1.5 font-mono text-[11px] transition-colors hover:bg-muted coarse:h-11 coarse:px-3"
                  >
                    <Lock aria-hidden className="size-2.5 shrink-0 text-warning" />
                    <span className="font-semibold">{fix.event}</span>
                    <span className="min-w-0 truncate text-muted-foreground">try {fix.text}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
          {sendable || hasPayload ? (
            payloadOpen ? (
              <section>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor={payloadId}
                    className="text-2xs font-medium tracking-wide text-muted-foreground uppercase"
                  >
                    Event payload
                  </label>
                  <span className="flex items-center gap-1">
                    <span
                      className={cn(
                        "font-mono text-[10px]",
                        sim.payload.ok ? "text-muted-foreground" : "text-destructive",
                      )}
                    >
                      {sim.payload.ok ? (hasPayload ? "JSON ✓" : "none") : "invalid JSON"}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="coarse:size-11"
                      aria-label="Hide payload editor"
                      aria-expanded
                      onClick={() => setPayloadOpen(false)}
                    >
                      <ChevronRight className="rotate-90 rtl:-rotate-90" />
                    </Button>
                  </span>
                </div>
                <Textarea
                  ref={payloadRef}
                  id={payloadId}
                  value={sim.payloadText}
                  onChange={(event) => sim.setPayloadText(event.target.value)}
                  spellCheck={false}
                  placeholder={`e.g. ${payloads[0]?.text ?? '{ "key": "value" }'}`}
                  aria-invalid={!sim.payload.ok}
                  className="min-h-14 font-mono text-[11px] leading-4"
                />
                <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                  Sent with every event until cleared; guards and “enabled” read it. A “try” fix
                  sends its payload once.
                </p>
                {payloads.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {payloads.map((s) => (
                      <button
                        key={`${s.event}${s.text}`}
                        type="button"
                        onClick={() => sim.setPayloadText(s.text)}
                        className={cn(
                          "rounded-md border px-1.5 py-0.5 font-mono text-[10.5px] transition-colors hover:bg-muted coarse:min-h-11",
                          sim.payloadText === s.text &&
                            "border-signal/50 bg-signal-muted text-signal",
                        )}
                      >
                        <span className="text-muted-foreground">{s.event}</span> {s.text}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ) : (
              // One line: what every send carries (sticky until cleared), with clear right there.
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-expanded={false}
                  onClick={() => {
                    setPayloadOpen(true);
                    requestAnimationFrame(() => payloadRef.current?.focus());
                  }}
                  className="flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-md px-1 text-start font-mono text-[11px] text-muted-foreground transition-colors hover:bg-muted coarse:h-11"
                >
                  <span className="text-2xs font-medium tracking-wide uppercase">Payload</span>
                  <span className={cn("min-w-0 flex-1 truncate", hasPayload && "text-foreground")}>
                    {hasPayload ? sim.payloadText.trim() : "none"}
                  </span>
                  {hasPayload && (
                    <span className="shrink-0 rounded-[4px] border border-hairline px-1 text-[10px]">
                      sent with every event
                    </span>
                  )}
                  <ChevronRight aria-hidden className="size-3.5 shrink-0 rtl:-scale-x-100" />
                </button>
                {hasPayload && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="coarse:size-11"
                    aria-label="Clear payload"
                    onClick={() => sim.setPayloadText("")}
                  >
                    <X />
                  </Button>
                )}
              </div>
            )
          ) : null}
          <section>
            <h3 className="mb-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              Context{sim.cursor !== null && ` after step ${sim.cursor}`}
            </h3>
            <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-2.5 font-mono text-[11px] leading-4">
              {shownContext
                ? JSON.stringify(shownContext, null, 2)
                : "— (automatic microstep; no separate snapshot)"}
            </pre>
          </section>
          <section>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                History · <bdi>{plural(steps, "step")}</bdi>
              </h3>
              {sim.cursor !== null && (
                <button
                  type="button"
                  onClick={() => sim.setCursor(null)}
                  className="rounded-full border border-signal/40 px-2 font-mono text-[10px] text-signal hover:bg-signal-muted coarse:min-h-11"
                >
                  Back to live
                </button>
              )}
            </div>
            <ol
              ref={listRef}
              aria-label={touch ? "Simulation history" : "Simulation history; arrow keys scrub"}
              className="grid gap-1"
              onKeyDown={(event) => {
                if (["ArrowLeft", "ArrowUp"].includes(event.key)) {
                  event.preventDefault();
                  scrub(current - 1);
                } else if (["ArrowRight", "ArrowDown"].includes(event.key)) {
                  event.preventDefault();
                  scrub(current + 1);
                }
              }}
            >
              {trace.map((entry, index) => {
                const isCurrent = index === current;
                return (
                  <motion.li
                    key={entry.sequence}
                    initial={{ opacity: 0, y: -3 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={motionTokens.quick}
                  >
                    <button
                      type="button"
                      data-step={index}
                      tabIndex={isCurrent ? 0 : -1}
                      aria-current={isCurrent ? "step" : undefined}
                      onClick={() => scrub(index)}
                      className={cn(
                        "grid w-full grid-cols-[1.25rem_1fr] gap-x-2 rounded-md border px-2 py-1 text-start font-mono text-[11px] transition-colors hover:bg-muted/60 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 coarse:min-h-11",
                        isCurrent && "border-signal/50 bg-signal-muted",
                        sim.cursor !== null && index > sim.cursor && "text-muted-foreground",
                      )}
                    >
                      <span className="text-muted-foreground tabular-nums">{index}</span>
                      <span className="flex min-w-0 flex-wrap items-center gap-x-1.5">
                        <span
                          className={cn(
                            "shrink-0 font-semibold",
                            !entry.event && "font-normal text-muted-foreground italic",
                          )}
                        >
                          {traceEventLabel(entry.event)}
                        </span>
                        <ArrowRight
                          aria-hidden
                          className="size-3 shrink-0 text-muted-foreground rtl:rotate-180"
                        />
                        <span dir="auto" className="min-w-0 break-words text-muted-foreground">
                          {leafLabels(rootGraph, entry.activeIds).join(", ")}
                        </span>
                      </span>
                      {entry.actions.length > 0 && (
                        <span className="col-start-2 truncate text-[10px] text-muted-foreground">
                          / {entry.actions.join(", ")}
                        </span>
                      )}
                      {entry.note && (
                        <span className="col-start-2 text-[10px] text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
                          {entry.note}
                        </span>
                      )}
                    </button>
                  </motion.li>
                );
              })}
            </ol>
          </section>
        </>
      )}
      {scenarios.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              Scenarios
              {checked.length > 0 && (
                <span
                  className={cn(
                    "rounded-[4px] border px-1 font-mono text-[10px] leading-4 tracking-normal normal-case tabular-nums",
                    passedCount === checked.length
                      ? "border-success/40 text-success"
                      : "border-destructive/40 text-destructive",
                  )}
                >
                  {passedCount}/{checked.length} pass
                </span>
              )}
            </h3>
            <Button
              variant="ghost"
              size="xs"
              className="-me-1 text-muted-foreground coarse:h-11"
              onClick={() => runAllScenarios()}
            >
              <ListChecks /> Run all
            </Button>
          </div>
          <ul className="grid gap-1">
            {scenarios.map((scenario) => {
              const playing = sim.playing === scenario.id;
              const report = playing ? undefined : reports.get(scenario.id);
              // A refusal the scenario expects (it still passes) is information, not a warning.
              const expected = report?.passed === true;
              return (
                <li key={scenario.id}>
                  <button
                    type="button"
                    onClick={() => (playing ? sim.stop() : void playScenario(scenario))}
                    className={cn(
                      "flex h-8 w-full items-center gap-2 rounded-md border px-2.5 text-start transition-colors hover:bg-muted/60 coarse:h-11",
                      playing && "border-signal/50",
                    )}
                  >
                    {playing ? (
                      <Square aria-hidden className="size-2.5 fill-current text-signal" />
                    ) : (
                      <Play aria-hidden className="size-3" />
                    )}
                    <span className="min-w-0 flex-1 truncate">{scenario.label}</span>
                    {report && (
                      <span
                        className={cn(
                          "flex items-center gap-0.5 rounded-[4px] border px-1 font-mono text-[10px] leading-4",
                          report.stoppedAt !== undefined && "border-border text-muted-foreground",
                          report.stoppedAt === undefined &&
                            report.passed === true &&
                            "border-success/40 text-success",
                          report.stoppedAt === undefined &&
                            report.passed === false &&
                            "border-destructive/40 text-destructive",
                          report.stoppedAt === undefined &&
                            report.passed === undefined &&
                            "border-border text-muted-foreground",
                        )}
                      >
                        {report.stoppedAt !== undefined ? (
                          <span
                            title={`Stopped at step ${report.stoppedAt} of ${scenario.events.length}: you took over`}
                          >
                            stopped{" "}
                            <bdi className="tabular-nums">
                              {report.stoppedAt}/{scenario.events.length}
                            </bdi>
                          </span>
                        ) : report.passed === true ? (
                          <>
                            <CircleCheck aria-hidden className="size-2.5" /> pass
                          </>
                        ) : report.passed === false ? (
                          "fail"
                        ) : report.blocked.length ? (
                          `${report.blocked.length} refused`
                        ) : (
                          "done"
                        )}
                      </span>
                    )}
                    {/* Once a verdict is shown, the event count gives the label its room back. */}
                    {(playing || !report) && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {playing ? "stop" : plural(scenario.events.length, "event")}
                      </span>
                    )}
                  </button>
                  {report && report.blocked.length > 0 && (
                    <ul
                      className={cn(
                        "mt-1 grid gap-0.5 ps-2.5 font-mono text-[10.5px] leading-4",
                        expected
                          ? "text-muted-foreground"
                          : "text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]",
                      )}
                    >
                      {report.blocked.map((text) => (
                        <li key={text}>
                          {text}
                          {expected && " · refused as expected"}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
