import * as React from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../components/ui/command.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import { useMachine } from "./machine-context.js";
import { useDirection } from "@base-ui/react/direction-provider";

/** Navigation and execution are separate named groups; selecting a state never sends. */
export function MachineCommands({
  open,
  onOpenChange,
  fit,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly fit: () => void;
}) {
  const mv = useMachine();
  const dir = useDirection();
  const chosen = React.useRef<(() => void) | null>(null);
  const choose = (fn: () => void) => {
    chosen.current = fn;
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onCloseAutoFocus={(event) => {
          if (chosen.current) {
            event.preventDefault();
            const fn = chosen.current;
            chosen.current = null;
            requestAnimationFrame(fn);
          }
        }}
        dir={dir}
        className="overflow-hidden p-0 sm:max-w-lg"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Machine commands</DialogTitle>
          <DialogDescription>
            Navigate the document, control this view, or explicitly run a local simulation action.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Find a state, event or scenario…" />
          <CommandList>
            <CommandEmpty>No matching commands</CommandEmpty>
            <CommandGroup heading="Navigate states and transitions">
              {mv.document.machines.flatMap((m) =>
                [
                  ...m.nodes
                    .filter((n) => n.kind !== "note")
                    .map((n) => ({ id: n.id, label: n.label, kind: "node" as const })),
                  ...m.transitions.map((t) => ({
                    id: t.id,
                    label: t.event || "Automatic transition",
                    kind: "transition" as const,
                  })),
                ].map((item) => (
                  <CommandItem
                    key={`${m.id}:${item.id}`}
                    value={`navigate ${m.label} ${item.label} ${item.id}`}
                    onSelect={() => choose(() => mv.reveal(m.id, item.id, item.kind))}
                  >
                    {item.label}
                    <span className="ms-auto text-2xs text-muted-foreground">{m.label}</span>
                  </CommandItem>
                )),
              )}
            </CommandGroup>
            <CommandGroup heading="View">
              <CommandItem value="Fit overview" onSelect={() => choose(fit)}>
                Fit overview
              </CommandItem>
              <CommandItem
                value="Focus selection"
                disabled={!mv.selection}
                onSelect={() =>
                  choose(() => {
                    if (mv.selection) mv.reveal(mv.machineId, mv.selection.id, mv.selection.type);
                  })
                }
              >
                Focus selection
              </CommandItem>
              {mv.inspection.session && (
                <CommandItem
                  value="Observe run"
                  onSelect={() => choose(() => mv.setMode("inspect"))}
                >
                  Observe run
                </CommandItem>
              )}
            </CommandGroup>
            {mv.mode === "simulate" && (
              <CommandGroup heading="Send a simulation event">
                {[
                  ...new Set(
                    mv.graph.transitions
                      .filter((t) => t.event && mv.activeSet.has(t.sourceId))
                      .map((t) => t.event!),
                  ),
                ].map((type) => (
                  <CommandItem
                    key={type}
                    value={`send simulation ${type}`}
                    disabled={!mv.sim.payload.ok || mv.cursor !== null}
                    onSelect={() =>
                      choose(() => {
                        mv.sendEvent(type);
                      })
                    }
                  >
                    Send {type}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading="Local simulation">
              <CommandItem value="Start restart simulation" onSelect={() => choose(mv.start)}>
                {mv.snapshot ? "Restart simulation" : "Start simulation"}
              </CommandItem>
              {mv.scenarios.map((s) => (
                <CommandItem
                  key={s.id}
                  value={`run scenario ${s.label}`}
                  onSelect={() =>
                    choose(() => {
                      void mv.playScenario(s);
                    })
                  }
                >
                  Run scenario: {s.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
