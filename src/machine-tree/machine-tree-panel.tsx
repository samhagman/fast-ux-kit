import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "../components/ui/sonner.js";
import {
  ArrowRight,
  ArrowUpRight,
  CircleDot,
  CircleCheck,
  Copy,
  Lock,
  Play,
  Zap,
} from "lucide-react";
import {
  machineTreeAncestors,
  resolveMachineTreeSource,
  type MachineDocument,
  type MachineGraph,
  type MachineScenario,
  type MachineTreeModel,
  type MachineTreeRow,
} from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Kbd } from "../components/ui/kbd.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { MachineSheet, sheetTabClass, sheetTabListClass } from "../machine-shared/machine-sheet.js";
import { describeSend, KEY } from "../machine-shared/machine-copy.js";
import { useTreeBase } from "./machine-tree-controller.js";
import { useTreeLayout } from "./machine-tree-layout.js";
import { kindLabel, reasonOf, routeStateOf } from "./machine-tree-logic.js";
import { useTreeNavigation } from "./machine-tree-navigation.js";
import { useTreeSimulation } from "./machine-tree-run.js";
import { useTree } from "./machine-tree-store.js";
import { useShortcutLabel } from "../lib/platform.js";
import { SimulationTab } from "./machine-tree-simulation.js";
import type { MachineTreePanelTab } from "./machine-tree.js";

/**
 * Details / Simulation / Code. A side panel on desktop; on phones the shared non-modal
 * `MachineSheet` (machine-shared), the same sheet Machine View uses, so the two can't drift.
 */
export function MachineTreePanel() {
  const { document, scenarios, rootGraph, topology } = useTreeBase();
  const { isPhone, panel, snap, setSnap, setPanel, setSheetInset, panelTab, setPanelTab } =
    useTreeLayout();
  const { restoreFocus, selected, revealFromPanel } = useTreeNavigation();
  const run = useTreeSimulation();
  const onTab = React.useCallback(
    (value: string) => setPanelTab(value as MachineTreePanelTab),
    [setPanelTab],
  );
  const body = (
    <PanelBody
      selected={selected}
      onReveal={revealFromPanel}
      document={document}
      scenarios={scenarios}
      rootGraph={rootGraph}
      topology={topology}
      contexts={run.contexts}
      onStart={run.start}
      onStop={run.stop}
      touch={isPhone}
    />
  );
  if (isPhone)
    return (
      // `contents`: the Tabs root only joins the bar's list and the panels; the sheet positions itself.
      <Tabs value={panelTab} onValueChange={onTab} className="contents">
        <MachineSheet
          open={panel}
          onOpenChange={setPanel}
          snap={snap}
          onSnapChange={setSnap}
          // Keeps scroll targets and the Back pill above the sheet (canvas + navigation read it).
          onOcclusionChange={setSheetInset}
          // The tree keeps focus where the user is: opening the sheet never pulls it off the row.
          autoFocus={false}
          returnFocus={restoreFocus}
          // A new subject (another selection, another tab) starts at the top.
          scrollKey={panelTab === "details" ? `details:${selected ?? ""}` : panelTab}
          tabs={<PanelTabs sheet />}
        >
          {body}
        </MachineSheet>
      </Tabs>
    );
  return (
    // Width snaps once (one reflow), content slides in.
    <AnimatePresence initial={false}>
      {panel && (
        <motion.aside
          key="panel"
          aria-label="Inspector"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: motionTokens.instant }}
          transition={motionTokens.quick}
          className="w-[19.5rem] shrink-0 overflow-hidden border-s border-hairline bg-surface"
        >
          <motion.div
            initial={{ y: 4 }}
            animate={{ y: 0 }}
            transition={motionTokens.base}
            className="h-full"
          >
            <Tabs value={panelTab} onValueChange={onTab} className="flex h-full flex-col gap-0">
              <div className="flex shrink-0 items-center gap-1 border-b border-hairline px-2 py-1.5">
                <PanelTabs sheet={false} />
              </div>
              <ScrollArea className="min-h-0 flex-1">{body}</ScrollArea>
            </Tabs>
          </motion.div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/* ───────────────────────────── Side panel ───────────────────────────── */

/** The three tab triggers: segmented on desktop, the shared sheet's 44px underline tabs on phones. */
function PanelTabs({ sheet }: { readonly sheet: boolean }) {
  const trigger = sheet ? sheetTabClass : "text-ui";
  return (
    <TabsList
      variant={sheet ? "line" : "default"}
      className={sheet ? sheetTabListClass : "grid h-8 flex-1 grid-cols-3 coarse:h-11"}
    >
      <TabsTrigger value="details" className={trigger}>
        Details
      </TabsTrigger>
      <TabsTrigger value="simulation" className={trigger}>
        Simulation
      </TabsTrigger>
      <TabsTrigger value="code" className={trigger}>
        Code
      </TabsTrigger>
    </TabsList>
  );
}

/** The tab panels. Rendered inside a `<Tabs>` root (the side panel's, or the one around the sheet). */
export const PanelBody = React.memo(function PanelBody({
  selected,
  onReveal,
  document,
  scenarios,
  rootGraph,
  topology,
  contexts,
  onStart,
  onStop,
  touch,
}: {
  readonly selected: string | null;
  readonly onReveal: (id: string) => void;
  readonly document: MachineDocument;
  readonly scenarios: readonly MachineScenario[];
  readonly rootGraph: MachineGraph;
  readonly topology: MachineTreeModel;
  readonly contexts: ReadonlyMap<number, Readonly<Record<string, unknown>>>;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly touch: boolean;
}) {
  const { rows, links } = useTree();
  const shortcut = useShortcutLabel();
  const row = selected ? rows.get(selected) : undefined;
  const code = React.useMemo(() => JSON.stringify(document, null, 2), [document]);
  return (
    <>
      <TabsContent
        value="details"
        className="m-0 p-3 duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0 max-sm:pt-2"
      >
        {row ? (
          <Details
            key={row.id}
            row={row}
            topology={topology}
            reveal={onReveal}
            links={links}
            rows={rows}
          />
        ) : (
          <p className="text-[12px] leading-4 text-muted-foreground">
            {touch ? (
              "Tap a state or transition to inspect it. Tap a blue target to jump to it."
            ) : (
              <>
                Select a state or transition. <Kbd>{KEY.up}</Kbd> <Kbd>{KEY.down}</Kbd> move,{" "}
                <Kbd>{KEY.left}</Kbd> <Kbd>{KEY.right}</Kbd> fold or enter,{" "}
                <Kbd dir="ltr">{shortcut("mod", KEY.enter)}</Kbd> follows a target,{" "}
                <Kbd dir="ltr">{shortcut("mod", "F")}</Kbd> finds.
              </>
            )}
          </p>
        )}
      </TabsContent>
      <TabsContent
        value="simulation"
        className="m-0 p-3 duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0 max-sm:pt-2"
      >
        <SimulationTab
          scenarios={scenarios}
          rootGraph={rootGraph}
          contexts={contexts}
          onStart={onStart}
          onStop={onStop}
          touch={touch}
        />
      </TabsContent>
      <TabsContent
        value="code"
        className="m-0 p-3 duration-200 data-[state=active]:animate-in data-[state=active]:fade-in-0 max-sm:pt-2"
      >
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
            machine.json · read-only
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Copy JSON"
            className="coarse:size-11"
            onClick={() =>
              navigator.clipboard?.writeText(code).then(
                () => toast("Copied machine JSON"),
                () => toast("Copy failed"),
              )
            }
          >
            <Copy />
          </Button>
        </div>
        <CodeBlock value={code} />
      </TabsContent>
    </>
  );
});

export function Details({
  row,
  topology,
  reveal,
  links,
  rows,
}: {
  readonly row: MachineTreeRow;
  readonly topology: MachineTreeModel;
  readonly reveal: (id: string) => void;
  readonly links: ReadonlyMap<string, string>;
  readonly rows: ReadonlyMap<string, MachineTreeRow>;
}) {
  const kind = kindLabel(row, rows.get(row.parentId ?? ""));
  const link = (id: string | undefined, fallback: string) => {
    const target = id ? rows.get(id) : undefined;
    return target ? (
      // A coarse hit area without a taller row, so link rows keep the same rhythm as text rows.
      <button
        type="button"
        dir="auto"
        className="mt-hit text-start text-signal hover:underline"
        onClick={() => reveal(target.id)}
      >
        {target.kind === "transition" && !target.transition?.event ? "automatic" : target.label}
      </button>
    ) : (
      <span className="text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
        {fallback} (missing)
      </span>
    );
  };
  const incoming = React.useMemo(
    () =>
      row.kind === "node"
        ? topology.rows.filter((r) => r.kind === "transition" && links.get(r.id) === row.id)
        : [],
    [row, topology, links],
  );
  const outgoing = row.childIds.filter((id) => rows.get(id)?.kind === "transition");
  // Transitions a state answers through its containers (statechart inheritance), nearest first:
  // at "Specialist process", CLOSE from "Open case" fires too and belongs in this list.
  const inherited = React.useMemo(() => {
    if (row.kind !== "node") return [];
    const groups: { readonly from: MachineTreeRow; readonly routes: readonly MachineTreeRow[] }[] =
      [];
    for (const id of [...machineTreeAncestors(topology, row.id)].reverse()) {
      const ancestor = rows.get(id);
      if (ancestor?.kind !== "node" || ancestor.machineId !== row.machineId) continue;
      const routes = ancestor.childIds
        .map((child) => rows.get(child))
        .filter((child): child is MachineTreeRow => child?.kind === "transition");
      if (routes.length) groups.push({ from: ancestor, routes });
    }
    return groups;
  }, [row, topology, rows]);
  const inheritedCount = inherited.reduce((n, group) => n + group.routes.length, 0);
  const source = row.transition ? resolveMachineTreeSource(topology, row.id) : undefined;
  return (
    <div className="animate-in fade-in-0 duration-200">
      <div className="mb-3">
        <div className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          {kind}
        </div>
        <div dir="auto" className="mt-0.5 text-[15px] font-semibold break-words">
          {row.kind === "transition" && !row.transition?.event ? "automatic" : row.label}
        </div>
        {(row.node?.description || row.transition?.description) && (
          <p dir="auto" className="mt-1 text-[12px] leading-4 text-muted-foreground">
            {row.node?.description ?? row.transition?.description}
          </p>
        )}
      </div>
      {/* Baseline-aligned so a taller (coarse) link button doesn't drop below its label. */}
      <dl className="grid grid-cols-[5rem_1fr] items-baseline gap-x-2 gap-y-1.5 font-mono text-[11.5px] [&_dd]:min-w-0 [&_dd]:break-words [&_dt]:text-muted-foreground">
        {row.transition && (
          <>
            <dt>from</dt>
            <dd>{link(source?.id, row.transition.sourceId)}</dd>
            <dt>to</dt>
            <dd>{link(links.get(row.id), row.transition.targetId)}</dd>
            {row.transition.guard && (
              <>
                <dt>guard</dt>
                <dd>{row.transition.guard}</dd>
              </>
            )}
            {row.transition.actions?.length ? (
              <>
                <dt>actions</dt>
                <dd>{row.transition.actions.join(", ")}</dd>
              </>
            ) : null}
            {row.transition.internal && (
              <>
                <dt>mode</dt>
                <dd>internal</dd>
              </>
            )}
          </>
        )}
        {row.node && (
          <>
            <dt>id</dt>
            <dd>{row.node.id}</dd>
            {row.node.tags?.length ? (
              <>
                <dt>tags</dt>
                <dd>{row.node.tags.join(", ")}</dd>
              </>
            ) : null}
            {row.node.entry?.length ? (
              <>
                <dt>entry</dt>
                <dd>{row.node.entry.join(", ")}</dd>
              </>
            ) : null}
            {row.node.exit?.length ? (
              <>
                <dt>exit</dt>
                <dd>{row.node.exit.join(", ")}</dd>
              </>
            ) : null}
            {row.node.kind === "submachine" && (
              <>
                <dt>machine</dt>
                <dd>{link(links.get(row.id), row.node.machineId ?? "—")}</dd>
              </>
            )}
          </>
        )}
        {row.kind === "machine" && (
          <>
            <dt>id</dt>
            <dd>{row.machineId}</dd>
          </>
        )}
      </dl>
      {row.transition && <RouteStatus row={row} reveal={reveal} />}
      {row.kind === "node" &&
        (incoming.length > 0 || outgoing.length > 0 || inheritedCount > 0) && (
          <div className="mt-4 grid gap-3">
            {[
              ["Outgoing", outgoing.map((id) => rows.get(id)!)],
              ["Incoming", incoming],
            ].map(([title, list]) =>
              (list as MachineTreeRow[]).length ? (
                <section key={title as string}>
                  <h3 className="mb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                    {title as string} · <bdi>{(list as MachineTreeRow[]).length}</bdi>
                  </h3>
                  <ul className="grid gap-0.5 font-mono text-[11px]">
                    {(list as MachineTreeRow[]).map((t) =>
                      title === "Outgoing" ? (
                        <OutgoingRoute key={t.id} route={t} reveal={reveal} />
                      ) : (
                        <li key={t.id}>
                          <button
                            type="button"
                            onClick={() => reveal(t.id)}
                            className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted coarse:min-h-11"
                          >
                            <span
                              className={cn(
                                "font-semibold",
                                !t.transition?.event && "font-normal text-muted-foreground italic",
                              )}
                            >
                              {t.transition?.event || "automatic"}
                            </span>
                            <ArrowRight
                              aria-hidden
                              className="size-3 shrink-0 text-muted-foreground rtl:rotate-180"
                            />
                            <span dir="auto" className="truncate text-muted-foreground">
                              from {rows.get(t.parentId ?? "")?.label ?? "?"}
                            </span>
                          </button>
                        </li>
                      ),
                    )}
                  </ul>
                </section>
              ) : null,
            )}
            {inheritedCount > 0 && (
              <section>
                <h3 className="mb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                  Inherited · <bdi>{inheritedCount}</bdi>
                </h3>
                <div className="grid gap-1.5">
                  {inherited.map(({ from, routes }) => (
                    <div key={from.id}>
                      <div className="mb-0.5 ps-1.5 text-[11px] text-muted-foreground">
                        from{" "}
                        <button
                          type="button"
                          dir="auto"
                          className="mt-hit text-start text-foreground hover:underline"
                          onClick={() => reveal(from.id)}
                        >
                          {from.label}
                        </button>
                      </div>
                      <ul className="grid gap-0.5 font-mono text-[11px]">
                        {routes.map((t) => (
                          <OutgoingRoute key={t.id} route={t} reveal={reveal} from={from.label} />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
    </div>
  );
}

/**
 * One outgoing route in Details. While simulating it carries the same live status as the tree
 * (⚡ enabled with a Send button, 🔒 blocked with its reason); the row itself still goes to the route.
 */
function OutgoingRoute({
  route,
  reveal,
  from,
}: {
  readonly route: MachineTreeRow;
  readonly reveal: (id: string) => void;
  readonly from?: string;
}) {
  const { sim, rootMachineId, rows, links, sendEvent } = useTree();
  const t = route.transition;
  const state = routeStateOf(route, sim, rootMachineId);
  const event = t?.event ?? "";
  const target = rows.get(links.get(route.id) ?? "")?.label ?? t?.targetId;
  const reason = state === "blocked" ? reasonOf(route, state, sim) : "";
  return (
    <li className="grid gap-0.5">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => reveal(route.id)}
          aria-label={`${event || "automatic"} to ${target}${from ? `, inherited from ${from}` : ""}${state === "enabled" ? ", enabled" : state === "blocked" ? `, ${reason}` : ""}`}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted coarse:min-h-11"
        >
          {state === "enabled" && (
            <Zap aria-hidden className="size-3 shrink-0 fill-current text-signal" />
          )}
          {state === "blocked" && <Lock aria-hidden className="size-3 shrink-0 text-warning" />}
          <span
            className={cn(
              "font-semibold",
              !event && "font-normal text-muted-foreground italic",
              state === "enabled" && "text-signal",
              state === "inactive" && "font-medium text-muted-foreground",
            )}
          >
            {event || "automatic"}
          </span>
          <ArrowRight
            aria-hidden
            className="size-3 shrink-0 text-muted-foreground rtl:rotate-180"
          />
          <span dir="auto" className="truncate text-muted-foreground">
            {target}
          </span>
        </button>
        {state === "enabled" && event && (
          <Button
            size="xs"
            variant="outline"
            className="shrink-0 border-signal/50 font-mono text-[10.5px] text-signal coarse:h-11"
            aria-label={`Send ${event}`}
            onClick={() => sendEvent(event)}
          >
            <Zap className="fill-current" /> Send
          </Button>
        )}
      </div>
      {reason && (
        <p className="ps-6 font-sans text-[11px] leading-4 text-[color-mix(in_oklab,var(--warning)_62%,var(--foreground))]">
          {reason}
        </p>
      )}
    </li>
  );
}

/**
 * While simulating: can this route fire right now, why not, and the one-tap fix. A focus zone:
 * when its button unmounts (the card flips to "Just taken"), focus lands on the card's next
 * action ("Go to …") instead of falling to <body>.
 */
function RouteStatus({
  row,
  reveal,
}: {
  readonly row: MachineTreeRow;
  readonly reveal: (id: string) => void;
}) {
  const { sim, rootMachineId, sendEvent, applyFix, setPreview, rows, links, handoff } = useTree();
  const state = routeStateOf(row, sim, rootMachineId);
  if (state === "idle" || !row.transition) return null;
  const t = row.transition;
  const reason = reasonOf(row, state, sim);
  const fixes = state === "blocked" ? (sim.fixes.get(t.id) ?? []) : [];
  const taken = sim.taken.has(t.id);
  const targetRow = rows.get(links.get(row.id) ?? "");
  const target = targetRow?.label ?? t.targetId;
  const justTaken = taken && state === "inactive";
  const preview = state === "enabled" && t.event ? sim.previewOf(t.event) : undefined;
  const title =
    state === "enabled"
      ? "Enabled"
      : state === "blocked"
        ? "Blocked"
        : justTaken
          ? "Just taken"
          : sim.error !== null
            ? "Run stopped"
            : "Not available";
  return (
    <div
      role="group"
      aria-label={`Simulation status: ${title}`}
      tabIndex={-1}
      data-mt-zone=""
      className="mt-3 rounded-lg border border-hairline bg-muted/30 p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <div className="flex items-start gap-2">
        {state === "enabled" ? (
          <Zap aria-hidden className="mt-0.5 size-3.5 shrink-0 fill-current text-signal" />
        ) : state === "blocked" ? (
          <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-warning" />
        ) : justTaken ? (
          <CircleCheck aria-hidden className="mt-0.5 size-3.5 shrink-0 text-signal" />
        ) : (
          <CircleDot aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] tracking-wide text-muted-foreground uppercase">
            {title}
            {taken && !justTaken && " · just taken"}
          </div>
          <p className="mt-0.5 text-[12px] leading-4">
            {state === "enabled"
              ? `${t.event} can fire now with the current payload${preview ? ` → ${preview.to.join(", ")}` : ""}.`
              : justTaken
                ? `${describeSend(t.event || "Automatic transition", [target])}.`
                : reason}
          </p>
        </div>
      </div>
      {state === "enabled" && t.event && (
        <Button
          size="xs"
          className="mt-2 coarse:h-11"
          onClick={() => sendEvent(t.event!)}
          onPointerEnter={() => setPreview(t.event!)}
          onPointerLeave={() => setPreview(null)}
          onFocus={() => !handoff.active && setPreview(t.event!)}
          onBlur={() => setPreview(null)}
        >
          <Zap className="fill-current" /> Send {t.event}
        </Button>
      )}
      {fixes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {fixes.map((fix) => (
            <Button
              key={fix.text}
              variant="outline"
              size="xs"
              className="font-mono text-[10.5px] coarse:h-11"
              onClick={() => applyFix(fix)}
            >
              <Play className="fill-current" /> Try with {fix.text}
            </Button>
          ))}
        </div>
      )}
      {justTaken && targetRow && (
        <Button
          data-mt-prefer=""
          variant="ghost"
          size="xs"
          className="mt-2 -ms-1.5 text-signal coarse:h-11"
          onClick={() => reveal(targetRow.id)}
        >
          Go to <span dir="auto">{target}</span>
          <ArrowUpRight aria-hidden className="rtl:-scale-x-100" />
        </Button>
      )}
    </div>
  );
}

/** Minimal JSON highlighter (keys, strings, numbers, literals). Text-only; never HTML. */
export function CodeBlock({ value }: { readonly value: string }) {
  const tokens = React.useMemo(() => {
    const out: { text: string; kind: string }[] = [];
    const pattern =
      /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)|([{}[\],])/g;
    let last = 0;
    for (let match = pattern.exec(value); match; match = pattern.exec(value)) {
      if (match.index > last) out.push({ text: value.slice(last, match.index), kind: "plain" });
      if (match[1]) {
        out.push({ text: match[1], kind: match[2] ? "key" : "string" });
        if (match[2]) out.push({ text: match[2], kind: "plain" });
      } else if (match[3]) out.push({ text: match[3], kind: "literal" });
      else if (match[4]) out.push({ text: match[4], kind: "number" });
      else out.push({ text: match[5]!, kind: "punct" });
      last = pattern.lastIndex;
    }
    out.push({ text: value.slice(last), kind: "plain" });
    return out;
  }, [value]);
  return (
    <pre
      dir="ltr"
      className="overflow-x-auto rounded-lg border bg-muted/30 p-2.5 font-mono text-[11px] leading-[1.55]"
    >
      {tokens.map((token, index) => (
        <span
          key={index}
          className={cn(
            token.kind === "key" && "text-foreground",
            token.kind === "string" &&
              "text-[oklch(0.55_0.13_150)] dark:text-[oklch(0.78_0.12_150)]",
            token.kind === "number" && "text-[oklch(0.58_0.16_50)] dark:text-[oklch(0.8_0.13_60)]",
            token.kind === "literal" && "text-signal",
            (token.kind === "punct" || token.kind === "plain") && "text-muted-foreground",
          )}
        >
          {token.text}
        </span>
      ))}
    </pre>
  );
}
