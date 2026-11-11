import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowRight,
  Ban,
  Braces,
  CircleCheck,
  CircleX,
  ListChecks,
  ListVideo,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Zap,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { plural, useMachine } from "./machine-context.js";
import { Section } from "./inspector-fields.js";
import { EventChoices } from "./event-choices.js";
import { MachineValue } from "../machine-shared/machine-inspection-panel.js";

/** Run tab: start, the current configuration, events to send, payload, context, scenarios. */
export function RunPanel() {
  const mv = useMachine();
  /** Unguarded events that have their custom payload editor open. */
  const [customFor, setCustomFor] = React.useState<readonly string[]>([]);
  if (!mv.snapshot)
    return (
      <div className="grid gap-4">
        <div className="flex flex-col items-start gap-3">
          <div className="grid size-9 place-items-center rounded-lg border bg-muted/50">
            <Play className="size-4" />
          </div>
          <div>
            <p className="font-medium">
              <bdi>Run this machine locally</bdi>
            </p>
            <p className="mt-0.5 text-[12px] leading-4 text-muted-foreground">
              <bdi>
                Simulation uses the host's trusted guards and actions. It never talks to a backend.
              </bdi>
            </p>
          </div>
          <Button size="sm" onClick={mv.start} className="coarse:h-11">
            <Play /> Start simulation
          </Button>
        </div>
        {/* Scenarios span the panel's full content width, like every other control (no max-content overflow). */}
        <Scenarios />
      </div>
    );
  // One entry per event type; its transitions' guards and actions ride along on a second line, so
  // whatever a collapsed canvas chip hid behind "…" is readable here (on touch, a chip tap sends).
  //
  // An event is sent one of two ways. If nothing about it needs an input, it is a single row and
  // one click. If a guard decides it, or the specification knows payloads for it, it is a group
  // that lists those known inputs, each already tried against the live state.
  const events = new Map<
    string,
    { enabled: boolean; guarded: boolean; targets: string[]; details: string[] }
  >();
  const labelOf = (id: string) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id;
  for (const t of mv.graph.transitions) {
    if (!t.event || (!mv.candidates.enabled.has(t.id) && !mv.candidates.blocked.has(t.id)))
      continue;
    const entry = events.get(t.event) ?? {
      enabled: false,
      guarded: false,
      targets: [],
      details: [],
    };
    entry.enabled ||= mv.candidates.enabled.has(t.id) || mv.candidates.offered.has(t.id);
    entry.guarded ||= !!t.guard;
    entry.targets.push(labelOf(t.targetId));
    events.set(t.event, entry);
  }
  for (const [type, entry] of events) {
    const handlers = mv.graph.transitions.filter(
      (t) =>
        t.event === type && (mv.candidates.enabled.has(t.id) || mv.candidates.blocked.has(t.id)),
    );
    // With several targets each detail names its own ("[confident] → Auto-resolve").
    const several = new Set(entry.targets).size > 1;
    for (const t of handlers) {
      const detail = [
        t.guard ? `[${t.guard}]` : "",
        t.actions?.length ? `/ ${t.actions.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join(" ");
      if (detail) entry.details.push(several ? `${detail} → ${labelOf(t.targetId)}` : detail);
    }
  }
  // Current configuration grouped by region: leaf chips under their nearest container.
  const groups = new Map<string, string[]>();
  for (const id of mv.leafIds) {
    const node = mv.graph.nodes.find((n) => n.id === id);
    const parent = node?.parentId ? mv.graph.nodes.find((n) => n.id === node.parentId) : undefined;
    const key = parent?.label ?? "";
    groups.set(key, [...(groups.get(key) ?? []), node?.label ?? id]);
  }
  const lastBlocked = mv.blocked.at(-1);
  const showBlocked =
    lastBlocked && lastBlocked.after === (mv.snapshot.trace.at(-1)?.sequence ?? -1);
  return (
    <>
      <Section title="Current state">
        <div className="grid gap-1.5">
          {[...groups].map(([region, leaves]) => (
            <div key={region} className="flex flex-wrap items-center gap-1.5">
              {region && groups.size > 1 && (
                <span className="w-full font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                  {region}
                </span>
              )}
              {leaves.map((leaf) => (
                <motion.span
                  key={leaf}
                  layout
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={motionTokens.quick}
                  className="inline-flex h-6 items-center gap-1.5 rounded-md border border-signal/40 bg-signal-muted px-2 text-[12px] font-medium text-signal"
                >
                  <span className="size-1.5 rounded-full bg-signal" />
                  {leaf}
                </motion.span>
              ))}
            </div>
          ))}
          {mv.snapshot.status === "done" && (
            <span className="inline-flex h-6 w-fit items-center gap-1 rounded-md border border-success/40 bg-success/10 px-2 text-[12px] font-medium text-success">
              <CircleCheck className="size-3.5" /> Reached final
            </span>
          )}
        </div>
      </Section>
      <Section title="Send event">
        {events.size ? (
          <div className="grid gap-1.5">
            {[...events].map(([type, info], index) => {
              const options = mv.eventOptions(type);
              const choose =
                info.guarded ||
                options.length > 1 ||
                options.some((option) => option.payload !== undefined);
              const targets = (
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted-foreground">
                  <bdi>{[...new Set(info.targets)].join(", ")}</bdi>
                </span>
              );
              const heading = (
                <span className="grid min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="shrink-0 font-mono text-[11.5px] font-semibold">{type}</span>
                    <ArrowRight
                      aria-hidden
                      className="size-3 shrink-0 text-muted-foreground rtl:-scale-x-100"
                    />
                    {targets}
                  </span>
                  {info.details.length > 0 && (
                    <span className="truncate font-mono text-[10px] leading-3.5 text-muted-foreground">
                      <bdi>{info.details.join(" · ")}</bdi>
                    </span>
                  )}
                </span>
              );
              const zap = (
                <Zap
                  className={cn(
                    "size-3.5 shrink-0",
                    info.enabled ? "text-signal" : "text-muted-foreground",
                  )}
                />
              );
              if (choose)
                return (
                  <div
                    key={type}
                    role="group"
                    aria-label={`Send ${type}`}
                    data-mv-event={type}
                    className={cn(
                      "grid gap-1.5 rounded-md border p-1.5",
                      info.enabled ? "border-signal/25" : "border-dashed",
                    )}
                  >
                    <div className="flex min-h-6 items-center gap-2 px-1">
                      {zap}
                      {heading}
                      {!info.enabled && (
                        <span className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                          blocked
                        </span>
                      )}
                    </div>
                    <EventChoices event={type} />
                  </div>
                );
              const custom = customFor.includes(type);
              return (
                <div key={type} data-mv-event={type} className="grid gap-1.5">
                  <div className="flex items-stretch gap-1">
                    <button
                      type="button"
                      data-mv-focus-fallback={index === 0 ? "" : undefined}
                      // The bare event: whatever is typed in a custom payload is sent only from there.
                      onClick={() => mv.sendEvent(type, {})}
                      className="group flex min-h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-signal/35 px-2.5 py-1 text-start transition-colors hover:border-signal hover:bg-signal-muted coarse:min-h-11"
                    >
                      {zap}
                      {heading}
                    </button>
                    <button
                      type="button"
                      aria-label={`Send ${type} with a custom payload`}
                      aria-expanded={custom}
                      title="Custom payload"
                      onClick={() =>
                        setCustomFor(
                          custom ? customFor.filter((t) => t !== type) : [...customFor, type],
                        )
                      }
                      className={cn(
                        "grid w-8 shrink-0 place-items-center rounded-md border text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground coarse:w-11",
                        custom && "bg-muted/60 text-foreground",
                      )}
                    >
                      <Braces className="size-3.5" />
                    </button>
                  </div>
                  {custom && <EventChoices event={type} customOnly />}
                </div>
              );
            })}
          </div>
        ) : mv.snapshot.status === "done" ? (
          <div className="flex items-center justify-between gap-2 rounded-md border border-success/30 bg-success/8 px-2.5 py-1.5">
            <p className="text-[12px] text-success">
              <bdi>The machine finished.</bdi>
            </p>
            <Button
              size="sm"
              variant="outline"
              data-mv-focus-fallback=""
              onClick={mv.start}
              className="h-7 coarse:h-11"
            >
              <RotateCcw /> Restart
            </Button>
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            <bdi>No events are handled in this state.</bdi>
          </p>
        )}
        <AnimatePresence initial={false}>
          {showBlocked && (
            <motion.div
              key={lastBlocked.after + lastBlocked.event}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={motionTokens.quick}
              className="overflow-hidden"
            >
              <div className="mt-2 flex items-start gap-2 rounded-md border border-warning/35 bg-warning/8 px-2.5 py-1.5 text-[11.5px] leading-4">
                <Ban className="mt-px size-3.5 shrink-0 text-warning" />
                <span>
                  <span className="font-mono font-semibold">{lastBlocked.event}</span> blocked —{" "}
                  {lastBlocked.reason}
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Section>
      <Section title="Context">
        <MachineValue value={mv.snapshot.context} label="Local context" />
      </Section>
      <Scenarios />
    </>
  );
}

function Scenarios() {
  const mv = useMachine();
  if (!mv.scenarios.length) return null;
  const results = mv.scenarios
    .map((scenario) => mv.scenarioResults[scenario.id])
    .filter((r): r is NonNullable<typeof r> => !!r && r.passed !== undefined);
  const passed = results.filter((r) => r.passed).length;
  return (
    <Section
      title="Scenarios"
      badge={
        results.length > 0 && (
          <span
            aria-label={`${passed} of ${results.length} scenarios pass`}
            className={cn(
              "rounded-[4px] border px-1 font-mono text-[10px] leading-4 tracking-normal normal-case tabular-nums",
              passed === results.length
                ? "border-success/40 text-success"
                : "border-destructive/40 text-destructive",
            )}
          >
            {passed}/{results.length} pass
          </span>
        )
      }
      action={
        mv.playing ? (
          <Button
            variant="ghost"
            size="xs"
            onClick={mv.stop}
            className="-me-1 text-muted-foreground coarse:h-11"
          >
            <Square className="size-2.5 fill-current" /> Stop
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            onClick={mv.runAllScenarios}
            className="-me-1 text-muted-foreground coarse:h-11"
          >
            <ListChecks /> Run all
          </Button>
        )
      }
    >
      <ul className="grid gap-1">
        {mv.scenarios.map((scenario) => {
          const outcome = mv.playing === scenario.id ? undefined : mv.scenarioResults[scenario.id];
          return (
            <li key={scenario.id}>
              <button
                type="button"
                // aria-disabled, not disabled: the pressed button keeps focus while the scenario plays.
                aria-disabled={!!mv.playing}
                onClick={() => !mv.playing && mv.playScenario(scenario)}
                className="grid min-h-8 w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md border px-2.5 py-1 text-start transition-colors hover:bg-muted/60 aria-disabled:cursor-default aria-disabled:opacity-60 coarse:min-h-11"
              >
                {mv.playing === scenario.id ? (
                  <Sparkles className="size-3.5 text-signal" />
                ) : (
                  <ListVideo className="size-3.5 text-muted-foreground" />
                )}
                {/* The title keeps its width: it wraps to two lines before it would truncate, and the verdict sits on its own line. */}
                <span className="line-clamp-2 break-words">{scenario.label}</span>
                <span
                  dir="auto"
                  className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums"
                >
                  {plural(scenario.events.length, "event")}
                </span>
                <ScenarioVerdict outcome={outcome} />
              </button>
              {outcome && (
                <details className="px-2 py-1 text-2xs text-muted-foreground">
                  <summary className="cursor-pointer">
                    {outcome.cancelled ? "Cancelled" : "Scenario result"}
                  </summary>
                  <p>
                    Expected: {outcome.expectedActiveIds?.join(", ") ?? "No expectation supplied"}
                  </p>
                  <p>Actual: {outcome.activeIds.join(", ") || "Unavailable"}</p>
                  {outcome.blockedReasons?.map((reason, index) => (
                    <p key={index}>{reason}</p>
                  ))}
                  {outcome.result && (
                    <Button size="sm" variant="ghost" onClick={() => mv.inspectScenario(outcome)}>
                      Inspect {outcome.passed === false ? "failure" : "result"}
                    </Button>
                  )}
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** ✓/✗ against the scenario's expected configuration ("ran" when it declares none), on the row's second line. */
function ScenarioVerdict({
  outcome,
}: {
  readonly outcome?: { readonly passed?: boolean; readonly blocked: number };
}) {
  return (
    <AnimatePresence initial={false}>
      {outcome && (
        <motion.span
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          transition={motionTokens.quick}
          className="col-start-2 col-end-4 overflow-hidden"
        >
          <span
            className={cn(
              "mt-0.5 inline-flex h-4.5 items-center gap-1 rounded-[4px] px-1 font-mono text-[9.5px] tracking-wide uppercase",
              outcome.passed === undefined
                ? "bg-muted text-muted-foreground"
                : outcome.passed
                  ? "bg-success/12 text-success"
                  : "bg-destructive/12 text-destructive",
            )}
          >
            {outcome.passed === undefined ? null : outcome.passed ? (
              <CircleCheck className="size-3" />
            ) : (
              <CircleX className="size-3" />
            )}
            {outcome.passed === undefined ? "ran" : outcome.passed ? "pass" : "fail"}
            {outcome.blocked > 0 && (
              <span className="normal-case">· {outcome.blocked} blocked</span>
            )}
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}
