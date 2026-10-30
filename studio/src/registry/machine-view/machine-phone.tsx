import { motion } from "motion/react";
import { Direction } from "radix-ui";
import { ChevronUp, Pencil, Plus, Spline, Trash2 } from "lucide-react";
import { motionTokens } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { countStates, kindTag, plural, useMachine, useMachineChrome } from "./machine-context";
import { transitionLabel } from "./layout";

/* ───────────────────────────── Phone shell ───────────────────────────── */

/**
 * Phone: the selection (or the live state) in a slim bar that opens the inspector sheet at its
 * peek. In Design it also carries the selection's quick actions, so phones never float a
 * toolbar over the graph: the actions dock here, as 44px targets.
 *   state       add connected · rename · delete
 *   transition  re-target (opens the sheet on its To field) · delete
 *
 * The open button's accessible name is its visible text plus ", open inspector" (WCAG 2.5.3,
 * label in name), built as one string so no stray space lands before the comma. Interpolated
 * names and counts are bidi-isolated (`<bdi>` / `dir="auto"`) so an English count never reorders
 * inside a right-to-left page, and a Hebrew name never reorders an English one. The flexible name
 * slot keeps the page's direction and isolates only its text, so in RTL it hugs the start (right)
 * edge: a `dir="auto"` slot would resolve to LTR for an English name and align it left.
 */
export function PeekBar() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  const node = mv.selection?.type === "node" ? mv.graph.nodes.find((n) => n.id === mv.selection!.id) : undefined;
  const transition = mv.selection?.type === "transition" ? mv.graph.transitions.find((t) => t.id === mv.selection!.id) : undefined;
  const label = (id: string) => mv.graph.nodes.find((n) => n.id === id)?.label ?? id;
  // The route reads in the page's direction: "Review → Publishing", or in RTL "Publishing ← Review".
  const arrow = Direction.useDirection() === "rtl" ? "←" : "→";
  const live = mv.snapshot ? [...mv.leafIds].map(label).join(" · ") : null;
  const events = mv.candidates.enabled.size;
  const design = mv.mode === "design" && mv.editable;
  const nodeActions = !!node && design && node.kind !== "initial" && mv.renaming !== node.id;
  const edgeActions = !!transition && design;
  const open = () => {
    chrome.setSnap("peek");
    chrome.setPanelOpen(true);
  };
  // Events the live state can take now (not events sent): "1 available event".
  const liveStatus = mv.snapshot?.status === "done" ? "done" : events ? plural(events, "available event") : "no events";
  const visible = live
    ? `${live}, ${liveStatus}`
    : node
      ? `${node.label}${nodeActions ? "" : `, ${kindTag(mv.graph, node)}`}`
      : transition
        ? `${transitionLabel(transition)}, ${label(transition.sourceId)} ${arrow} ${label(transition.targetId)}`
        : `${mv.graph.label}, ${plural(countStates(mv.graph), "state")}`;
  const retarget = () => {
    open();
    mv.requestFocus("target");
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTokens.base}
      data-mv-occluder
      className="absolute inset-x-3 bottom-3 z-10 mb-[env(safe-area-inset-bottom)] flex h-11 items-center rounded-xl border bg-surface/95 shadow-[0_6px_24px_-12px_rgb(0_0_0/0.35)] backdrop-blur"
    >
      <button type="button" onClick={open} data-slot="machine-peek" aria-expanded={false} aria-label={`${visible}, open inspector`} className="flex h-full min-w-0 flex-1 items-center gap-2 rounded-xl ps-3 pe-2 text-start outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
        {live ? (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-signal" />
            <span className="min-w-0 flex-1 truncate font-medium">
              <bdi>{live}</bdi>
            </span>
            <span dir="auto" className="shrink-0 font-mono text-[10.5px] text-signal">
              {liveStatus}
            </span>
          </>
        ) : node ? (
          <>
            <span aria-hidden className="size-2 shrink-0 rounded-full bg-foreground/30" />
            <span className="min-w-0 flex-1 truncate font-medium">
              <bdi>{node.label}</bdi>
            </span>
            {!nodeActions && (
              <span dir="auto" className="shrink-0 font-mono text-[9.5px] tracking-wider text-muted-foreground uppercase">
                {kindTag(mv.graph, node)}
              </span>
            )}
          </>
        ) : transition ? (
          // Two lines in the same 44px bar: the full label (event, guard, actions: whatever a
          // collapsed canvas chip had to hide behind "…") over the route it takes.
          <span className="flex min-w-0 flex-1 flex-col justify-center gap-px">
            <span className="truncate font-mono text-[11px] leading-4">
              <bdi>
                <span className="font-semibold">{transition.event || "always"}</span>
                {transition.guard && <span className="text-muted-foreground"> [{transition.guard}]</span>}
                {!!transition.actions?.length && <span className="text-muted-foreground"> / {transition.actions.join(", ")}</span>}
              </bdi>
            </span>
            <span className="truncate text-[11px] leading-3.5 text-muted-foreground">
              <bdi>{label(transition.sourceId)}</bdi> {arrow} <bdi>{label(transition.targetId)}</bdi>
            </span>
          </span>
        ) : (
          <>
            <span className="min-w-0 flex-1 truncate font-medium">
              <bdi>{mv.graph.label}</bdi>
            </span>
            <span dir="auto" className="shrink-0 font-mono text-[10.5px] text-muted-foreground">
              {plural(countStates(mv.graph), "state")}
            </span>
          </>
        )}
        <ChevronUp aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </button>
      {nodeActions && node && (
        <div role="toolbar" aria-label={`${node.label} actions`} className="flex shrink-0 items-center border-s border-hairline pe-0.5">
          {node.kind !== "final" && node.kind !== "note" && (
            <Button variant="ghost" size="icon-sm" className="coarse:size-11" aria-label="Add connected state" onClick={() => mv.addConnected(node.id)}>
              <Plus />
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" className="coarse:size-11" aria-label={node.kind === "note" ? "Edit text" : "Rename"} onClick={() => mv.setRenaming(node.id)}>
            <Pencil />
          </Button>
          <Button variant="ghost" size="icon-sm" className="hover:text-destructive coarse:size-11" aria-label={`Delete ${node.kind === "note" ? "note" : "state"}`} onClick={mv.deleteSelection}>
            <Trash2 />
          </Button>
        </div>
      )}
      {edgeActions && transition && (
        <div role="toolbar" aria-label={`${transition.event || "always"} actions`} className="flex shrink-0 items-center border-s border-hairline pe-0.5">
          <Button variant="ghost" size="icon-sm" className="coarse:size-11" aria-label="Re-target: choose where it goes" onClick={retarget}>
            <Spline />
          </Button>
          <Button variant="ghost" size="icon-sm" className="hover:text-destructive coarse:size-11" aria-label="Delete transition" onClick={mv.deleteSelection}>
            <Trash2 />
          </Button>
        </div>
      )}
    </motion.div>
  );
}
