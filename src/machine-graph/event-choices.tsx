import * as React from "react";
import { ArrowRight, Ban, Braces, ChevronRight, Play } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Button } from "../components/ui/button.js";
import { Textarea } from "../components/ui/textarea.js";
import { useMachine } from "./machine-context.js";

/**
 * The ways to send one event during a simulation.
 *
 *   ▶ approved: true                → Publishing      a known input that moves the machine
 *   ⊘ approved: false                    blocked      a known input the guard refuses right now
 *     guard approved is false
 *   › Custom payload                                  anything else, typed as JSON
 *
 * Known inputs come from the host's `eventInputs` and from the machine's scenarios, and each one
 * has already been tried against the live snapshot. So the list answers the question the bare
 * JSON box could not: what do I send, and where does it go? A refused input can still be sent,
 * because watching a guard refuse is part of simulating.
 */
export function EventChoices({
  event,
  onSent,
  customOnly = false,
  className,
}: {
  readonly event: string;
  /** Called after a send that moved the machine. */
  readonly onSent?: () => void;
  /** Skip the known inputs and show only the custom payload editor, opened. */
  readonly customOnly?: boolean;
  readonly className?: string;
}) {
  const mv = useMachine();
  const id = React.useId();
  const options = customOnly ? [] : mv.eventOptions(event);
  const [custom, setCustom] = React.useState(customOnly || !!mv.sim.payloadText.trim());
  const labelOf = (nodeId: string) => mv.graph.nodes.find((n) => n.id === nodeId)?.label ?? nodeId;
  const targetsOf = (transitionIds: readonly string[]) => [
    ...new Set(
      transitionIds
        .map((tid) => mv.graph.transitions.find((t) => t.id === tid)?.targetId)
        .filter((target): target is string => !!target)
        .map(labelOf),
    ),
  ];
  const send = (input?: { readonly payload?: unknown }) => {
    const result = mv.sendEvent(event, input);
    if (result?.changed) onSent?.();
  };

  // The typed payload, judged the same way the known inputs are.
  const invalid = !mv.sim.payload.ok;
  const typedTakes = mv.graph.transitions.filter(
    (t) => t.event === event && mv.candidates.enabled.has(t.id),
  );
  const typedTargets = typedTakes.length ? targetsOf(typedTakes.map((t) => t.id)) : null;

  return (
    <div className={cn("grid gap-1", className)}>
      {options.map((option, index) => {
        const targets = option.preview ? targetsOf(option.preview.transitionIds) : [];
        return (
          <button
            key={index}
            type="button"
            data-mv-choice={option.preview ? "passes" : "blocked"}
            onClick={() => send({ payload: option.payload })}
            className={cn(
              "group grid min-h-8 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md border px-2 py-1 text-start transition-colors coarse:min-h-11",
              option.preview
                ? "border-signal/35 hover:border-signal hover:bg-signal-muted"
                : "border-dashed hover:border-foreground/30 hover:bg-muted/50",
            )}
          >
            {option.preview ? (
              <Play aria-hidden className="size-3 shrink-0 fill-current text-signal" />
            ) : (
              <Ban aria-hidden className="size-3 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 truncate font-mono text-[11.5px]">
              <bdi>{option.label}</bdi>
            </span>
            {option.preview ? (
              <span className="flex min-w-0 items-center gap-1 text-[11.5px] text-muted-foreground">
                <ArrowRight aria-hidden className="size-3 shrink-0 rtl:-scale-x-100" />
                <span className="truncate">
                  <bdi>{targets.join(", ") || "stays here"}</bdi>
                </span>
              </span>
            ) : (
              <span className="shrink-0 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
                blocked
              </span>
            )}
            {option.reason && (
              <span className="col-start-2 col-end-4 text-[11px] leading-4 text-muted-foreground">
                <bdi>{option.reason}</bdi>
              </span>
            )}
          </button>
        );
      })}
      {!customOnly && (
        <button
          type="button"
          aria-expanded={custom}
          aria-controls={`${id}-custom`}
          onClick={() => setCustom(!custom)}
          className="flex min-h-7 w-fit items-center gap-1 rounded-md px-1 text-[11.5px] text-muted-foreground transition-colors hover:text-foreground coarse:min-h-11"
        >
          <ChevronRight
            aria-hidden
            className={cn("size-3 transition-transform rtl:-scale-x-100", custom && "rotate-90")}
          />
          <Braces aria-hidden className="size-3" /> Custom payload
        </button>
      )}
      {custom && (
        <div id={`${id}-custom`} className="grid gap-1.5">
          <label htmlFor={`${id}-payload`} className="sr-only">
            {event} payload, as JSON
          </label>
          <Textarea
            id={`${id}-payload`}
            name="event-payload"
            placeholder='{ "key": "value" }'
            value={mv.sim.payloadText}
            onChange={(e) => mv.sim.setPayloadText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !invalid) {
                e.preventDefault();
                send();
              }
            }}
            aria-invalid={invalid}
            aria-describedby={`${id}-outcome`}
            className="min-h-12 resize-none font-mono text-[11.5px]"
          />
          <div className="flex items-start justify-between gap-2">
            <p
              id={`${id}-outcome`}
              role="status"
              className={cn(
                "min-w-0 text-[11px] leading-4",
                invalid ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {invalid
                ? `${(mv.sim.payload as { error: string }).error}.`
                : typedTargets
                  ? `Goes to ${typedTargets.join(", ") || "the same state"}.`
                  : `Blocked: ${mv.explainEvent(event)}.`}
            </p>
            <Button size="sm" variant="outline" disabled={invalid} onClick={() => send()}>
              <Play /> Send
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
