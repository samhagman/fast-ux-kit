import * as React from "react";
import { ArrowRight, CircleDot, Lock, Workflow, Zap } from "lucide-react";
import { machineTreeAncestors } from "@fux/core";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Kbd } from "@/components/ui/kbd";
import { useTreeBase } from "./machine-tree-controller";
import { useTreeLayout } from "./machine-tree-layout";
import { kindLabel, reasonOf, routeStateOf, shortReason, type RouteState } from "./machine-tree-logic";
import { useTreeNavigation } from "./machine-tree-navigation";
import { useTreeSimulation } from "./machine-tree-run";
import { useApplePlatform, useShortcutLabel } from "@/lib/platform";
import { KEY } from "@/registry/machine-shared/machine-copy";

/**
 * How well `query` names an item: lower is better, `null` = no match. A label that starts with
 * the query beats one with a word that does, which beats a substring; the path and kind only
 * count as word prefixes (so "retr" finds "Retry available", never "Draft" by a stray subsequence).
 */
function rank(query: string, label: string, context: string): number | null {
  if (!query) return 0;
  const name = label.toLowerCase();
  if (name === query) return 0;
  if (name.startsWith(query)) return 1;
  const words = (text: string) => text.split(/[\s_\-./›→:]+/);
  if (words(name).some((word) => word.startsWith(query))) return 2;
  if (name.includes(query)) return 3;
  if (words(context.toLowerCase()).some((word) => word.startsWith(query))) return 4;
  return null;
}

/** A Send that matched only the names of the states it leaves or enters: listed last, never highlighted. */
const SEND_BY_CONTEXT = 5;

interface PaletteItem {
  readonly id: string;
  readonly kind: "state" | "machine" | "transition" | "send";
  readonly label: string;
  readonly meta: string;
  readonly context: string;
  readonly badge: string;
  /** States: the tree's own run vocabulary — "leaf" is the live state, "ancestor" contains it. */
  readonly live?: "leaf" | "ancestor" | undefined;
  /** Transitions while simulating: the same live status the tree's route rows show. */
  readonly status?: RouteState;
  readonly reason?: string;
  /** transition rows: where ⌘↵ goes. */
  readonly target?: string | undefined;
  /** send items, and transitions that can fire now: the event ↵ (send items) or ⇧↵ sends. */
  readonly event?: string | undefined;
}

/** What a choice does once the dialog has closed: go to the row, follow its target, or send its event. */
type PaletteAction = "go" | "follow" | "send";

/**
 * ⌘K: one palette for states, machines and transitions (by event), plus "Send" for the events
 * that can fire right now. Ranked by prefix, then word prefix, then substring. ↵ goes to the
 * row, ⌘↵ follows a transition to its target, ⇧↵ sends the highlighted row's event.
 *
 * Sending is never a side effect of looking something up. ↵ sends only on a Send row, and a Send
 * row is highlighted only when it is the unambiguous best match: on a tie (the event's exact name
 * is also a transition's) the Transitions row wins, and ⇧↵ sends from there. The empty palette
 * pins the short "Send now" list on top but highlights the live state (↵ = "go to where I am").
 */
export function GoToDialog() {
  const { topology, rows, links, rootGraph } = useTreeBase();
  const { gotoOpen, setGotoOpen } = useTreeLayout();
  const { reveal, restoreFocus } = useTreeNavigation();
  /** What was chosen: acted on once the dialog has really closed (see onCloseAutoFocus). */
  const chosen = React.useRef<{ readonly item: PaletteItem; readonly action: PaletteAction } | null>(null);
  const { view, sendAndFocusActive } = useTreeSimulation();
  const shortcut = useShortcutLabel();
  const apple = useApplePlatform();
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState("");
  React.useEffect(() => {
    if (!gotoOpen) setQuery("");
    else chosen.current = null;
  }, [gotoOpen]);

  const all = React.useMemo<{ states: PaletteItem[]; transitions: PaletteItem[] }>(() => {
    if (!gotoOpen) return { states: [], transitions: [] };
    const pathOf = (id: string) =>
      machineTreeAncestors(topology, id)
        .map((ancestor) => rows.get(ancestor)?.label)
        .filter(Boolean)
        .join(" › ");
    const states: PaletteItem[] = [];
    const transitions: PaletteItem[] = [];
    for (const row of topology.rows) {
      if (row.kind === "machine" || (row.kind === "node" && row.node?.kind !== "note")) {
        const path = pathOf(row.id);
        const kind = kindLabel(row, rows.get(row.parentId ?? ""));
        states.push({ id: row.id, kind: row.kind === "machine" ? "machine" : "state", label: row.label, meta: path, context: `${path} ${kind}`, badge: kind });
      } else if (row.kind === "transition" && row.transition) {
        const source = rows.get(row.parentId ?? "")?.label ?? row.transition.sourceId;
        const targetId = links.get(row.id);
        const target = rows.get(targetId ?? "")?.label ?? row.transition.targetId;
        transitions.push({
          id: row.id,
          kind: "transition",
          label: row.transition.event || "automatic",
          meta: `${source} → ${target}`,
          context: `${source} ${target} ${row.transition.guard ?? ""} ${(row.transition.actions ?? []).join(" ")}`,
          badge: row.transition.guard ? `[${row.transition.guard}]` : "transition",
          target: targetId,
        });
      }
    }
    return { states, transitions };
  }, [gotoOpen, topology, rows, links]);

  const needle = query.trim().toLowerCase();
  const groups = React.useMemo(() => {
    type Scored = { readonly item: PaletteItem; readonly index: number; readonly score: number };
    // Equal scores keep document order, except that a route that can fire now leads (then a blocked one).
    const tier = (item: PaletteItem) => (item.status === "enabled" ? 0 : item.status === "blocked" ? 1 : 2);
    const scored = (items: readonly PaletteItem[], score: (item: PaletteItem) => number | null) =>
      items
        .map((item, index) => ({ item, index, score: score(item) }))
        .filter((entry): entry is Scored => entry.score !== null)
        .sort((a, b) => a.score - b.score || tier(a.item) - tier(b.item) || a.index - b.index);
    // Dry runs are lazy: computed here only while the palette is open, once per enabled event.
    const send: PaletteItem[] = gotoOpen
      ? view.enabledEvents.map((type) => {
          const preview = view.previewOf(type);
          // Findable by the states it leaves and enters too: "Classifying" lists "Send CLASSIFIED".
          const routes = rootGraph.transitions.filter((t) => t.event === type && view.enabled.has(t.id));
          const names = routes.flatMap((t) => [t.sourceId, t.targetId]).map((id) => rootGraph.nodes.find((n) => n.id === id)?.label ?? "");
          return { id: `send:${type}`, kind: "send", label: `Send ${type}`, meta: preview ? `→ ${preview.to.join(", ")}` : "", context: names.join(" "), badge: "enabled", event: type };
        })
      : [];
    const liveOf = (id: string): PaletteItem["live"] => {
      const row = rows.get(id);
      if (!row || row.kind !== "node" || row.machineId !== rootGraph.id || !row.active) return undefined;
      return row.activeDescendant ? "ancestor" : "leaf";
    };
    const statusOf = (item: PaletteItem): PaletteItem => {
      const row = rows.get(item.id);
      const status = row ? routeStateOf(row, view, rootGraph.id) : "idle";
      if (status === "idle" || !row) return item;
      return {
        ...item,
        status,
        badge: status === "inactive" ? item.badge : status,
        reason: status === "blocked" ? shortReason(reasonOf(row, status, view), row.transition?.event) : undefined,
        event: status === "enabled" && row.transition?.event ? row.transition.event : undefined,
      };
    };
    // A Send is ranked by what it says (its label and event) only. Matching just the names of the
    // states it leaves or enters keeps it listed, but ranked after everything (SEND_BY_CONTEXT):
    // a state's name + ↵ must go to that state, never fire an event.
    const sendScore = (item: PaletteItem) => {
      const own = [rank(needle, item.label, ""), rank(needle, item.event ?? "", "")].filter((s): s is number => s !== null);
      if (own.length) return Math.min(...own);
      return rank(needle, "", item.context) === null ? null : SEND_BY_CONTEXT;
    };
    const ranked = [
      // `order` breaks a tie between groups' best matches. Navigation is the safe default: states,
      // then transitions, and a Send last, so it leads only when it is strictly the best match.
      { heading: "States and machines", order: 0, entries: scored(all.states, (item) => rank(needle, item.label, item.context)).map((e) => ({ ...e, item: { ...e.item, live: liveOf(e.item.id) } })) },
      // Transitions only once there is something to look for: the empty palette stays a state list.
      { heading: "Transitions", order: 1, entries: needle ? scored(all.transitions.map(statusOf), (item) => rank(needle, item.label, item.context)) : [] },
      // Empty query: pinned on top (it is short, and it is what a running palette is for).
      { heading: "Send now", order: needle ? 2 : -1, entries: scored(send, sendScore) },
    ].filter((group) => group.entries.length > 0);
    // Groups follow their best match (so the first row is the best match anywhere); the empty palette by `order`.
    ranked.sort((a, b) => (needle ? a.entries[0]!.score - b.entries[0]!.score : 0) || a.order - b.order);
    return ranked.map((group) => ({ heading: group.heading, items: group.entries.map((e) => e.item), scores: group.entries.map((e) => e.score) }));
  }, [needle, all, gotoOpen, view, rows, rootGraph]);
  const flat = React.useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const activeItem = flat.find((item) => item.id === active);
  // What is highlighted as the query changes. Empty: the live state (the first live leaf), else the
  // first state. Typed: the best match, where a Send never wins a tie (the groups sort it after an
  // equal state or transition) and a Send found only by a state's name is never highlighted.
  const preferred = React.useMemo(() => {
    if (!needle) {
      const states = flat.filter((item) => item.kind !== "send");
      return (states.find((item) => item.live === "leaf") ?? states[0])?.id ?? "";
    }
    for (const group of groups) for (const [i, item] of group.items.entries()) if (!(item.kind === "send" && group.scores[i] === SEND_BY_CONTEXT)) return item.id;
    return "";
  }, [groups, flat, needle]);
  React.useEffect(() => setActive(preferred), [preferred, flat]);

  // The choice is acted on in onCloseAutoFocus: by then the dialog has unmounted and Radix has
  // lifted its aria-hidden from the tree, so focus never lands inside a hidden subtree.
  const choose = (item: PaletteItem, action: PaletteAction) => {
    chosen.current = { item, action };
    setGotoOpen(false);
  };
  // ⇧↵ sends the highlighted row's event (a Send row, or a transition that can fire now).
  const sendable = activeItem?.event;

  return (
    // Composed from Dialog + Command (not CommandDialog) so the title lives inside the dialog and
    // leaves the page's accessibility tree when it closes.
    <Dialog open={gotoOpen} onOpenChange={setGotoOpen}>
      <DialogContent data-mt-portal="" showCloseButton={false} className="top-[18%] translate-y-0 overflow-hidden rounded-xl! p-0 max-sm:top-3" onCloseAutoFocus={(event) => {
          // Not back to whatever opened it (often <body> after ⌘K). A choice moves focus itself: a send
          // to the state the run is now in, a go-to to its row. Otherwise: the tree's roving stop.
          event.preventDefault();
          const choice = chosen.current;
          chosen.current = null;
          if (!choice) restoreFocus();
          else if (choice.action === "send" && choice.item.event) sendAndFocusActive(choice.item.event);
          else reveal(choice.action === "follow" && choice.item.target ? choice.item.target : choice.item.id);
        }}>
        <DialogTitle className="sr-only">Go to</DialogTitle>
        <DialogDescription className="sr-only">Jump to a state, machine or transition by name. While simulating, choose a Send row, or press {apple ? "Shift-Enter" : "Shift+Enter"} on an enabled transition, to send its event.</DialogDescription>
        <Command
          loop
          shouldFilter={false}
          value={active}
          onValueChange={setActive}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.nativeEvent.isComposing || !activeItem) return;
            // Default-prevented: cmdk skips its own ↵ (the row's onSelect).
            if (event.metaKey || event.ctrlKey) {
              event.preventDefault();
              choose(activeItem, "follow");
            } else if (event.shiftKey) {
              event.preventDefault();
              if (activeItem.event) choose(activeItem, "send");
            }
          }}
        >
          <CommandInput value={query} onValueChange={setQuery} placeholder="Go to state, event or transition…" />
          <CommandList>
            <CommandEmpty>
              {/* Isolated, so an RTL page doesn't move the closing quote and period to the front. */}
              <span dir="auto">Nothing matches “{query.trim()}”.</span>
            </CommandEmpty>
            {groups.map((group) => (
              <CommandGroup key={group.heading} heading={group.heading}>
                {group.items.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    // ↵ / click: a Send row sends (it says so); every other row is navigation.
                    onSelect={() => choose(item, item.kind === "send" ? "send" : "go")}
                    // The tree's run vocabulary: the live state wears the signal rail, dot and name;
                    // a state that contains it keeps signal on its icon only.
                    className={cn("coarse:min-h-11", item.live === "leaf" && "before:absolute before:inset-y-2 before:start-0 before:w-0.5 before:rounded-full before:bg-signal")}
                  >
                    {item.kind === "machine" ? (
                      <Workflow aria-hidden className="text-muted-foreground" />
                    ) : item.kind === "transition" ? (
                      item.status === "enabled" ? (
                        // `!`: the highlighted row's selected style recolours child svgs to foreground.
                        <Zap aria-hidden className="fill-current text-signal!" />
                      ) : item.status === "blocked" ? (
                        <Lock aria-hidden className="text-warning!" />
                      ) : (
                        <ArrowRight aria-hidden className="text-muted-foreground rtl:rotate-180" />
                      )
                    ) : item.kind === "send" ? (
                      <Zap aria-hidden className="fill-current text-signal!" />
                    ) : item.live === "leaf" ? (
                      // A span, not an svg: the item's selected style recolours direct svg children.
                      <span aria-hidden className="grid size-4 shrink-0 place-items-center">
                        <span className="size-1.5 rounded-full bg-signal shadow-[0_0_0_3px_color-mix(in_oklab,var(--signal)_22%,transparent)]" />
                      </span>
                    ) : (
                      <CircleDot aria-hidden className={item.live === "ancestor" ? "text-signal!" : "text-muted-foreground"} />
                    )}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        dir="auto"
                        className={cn(
                          "truncate",
                          (item.kind === "transition" || item.kind === "send") && "font-mono text-[12px] font-semibold",
                          (item.live === "leaf" || item.kind === "send" || item.status === "enabled") && "text-signal",
                          item.status === "inactive" && "font-medium text-muted-foreground",
                        )}
                      >
                        {item.label}
                      </span>
                      {item.meta && (
                        <span dir="auto" className="truncate font-mono text-[10.5px] text-muted-foreground">
                          {item.meta}
                        </span>
                      )}
                      {item.reason && (
                        <span dir="auto" className="truncate text-[11px] text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
                          {item.reason}
                        </span>
                      )}
                    </span>
                    <span className={cn("shrink-0 font-mono text-[10px] tracking-wide uppercase", item.live === "leaf" || item.status === "enabled" || item.kind === "send" ? "text-signal" : "text-muted-foreground")}>
                      {item.live === "leaf" ? "active" : item.badge}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
          <div aria-hidden className="flex items-center gap-3 border-t border-hairline px-3 py-1.5 font-mono text-[10.5px] text-muted-foreground coarse:hidden">
            <span>
              <Kbd>{KEY.enter}</Kbd> {activeItem?.kind === "send" ? "send" : "go"}
            </span>
            {sendable && activeItem?.kind !== "send" && (
              <span className="text-signal">
                <Kbd dir="ltr">{shortcut("shift", KEY.enter)}</Kbd> send
              </span>
            )}
            {activeItem?.target && (
              <span>
                <Kbd dir="ltr">{shortcut("mod", KEY.enter)}</Kbd> follow
              </span>
            )}
            <span className="ms-auto">
              <Kbd>{KEY.escape}</Kbd> close
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
