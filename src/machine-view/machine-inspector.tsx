import * as React from "react";
import { cn } from "../lib/utils.js";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs.js";
import { ScrollArea } from "../components/ui/scroll-area.js";
import { MachineSheet, sheetTabClass, sheetTabListClass } from "../machine-shared/machine-sheet.js";
import { focusNextFrame } from "../machine-shared/machine-focus.js";
import { plural, useMachine, useMachineChrome } from "./machine-context.js";
import { InspectPanel } from "./inspect-panel.js";
import { RunPanel } from "./run-panel.js";
import { TracePanel } from "./trace-panel.js";
import { IssuesPanel } from "./issues-panel.js";
import {
  MachineInspectionPanel,
  MachinePresentationDetails,
} from "../machine-shared/machine-inspection-panel.js";

/**
 * The inspector: four tabs (Inspect, Run, Trace, Issues). One component, two shells:
 *  - desktop: a side panel (bezelled tab list, scrolling body);
 *  - phone: the shared non-modal `MachineSheet` (underline tabs in its 44px bar).
 * The panels themselves live one per file, split at the tab seams.
 */
type Tab = "inspect" | "simulate" | "trace" | "issues";
const TABS = ["inspect", "simulate", "trace", "issues"] as const;

function useInspectorTab() {
  const mv = useMachine();
  const [tab, setTab] = React.useState<Tab>(mv.mode === "simulate" ? "simulate" : "inspect");
  React.useEffect(() => {
    if (mv.mode === "simulate") setTab((current) => (current === "inspect" ? "simulate" : current));
    else setTab((current) => (current === "simulate" || current === "trace" ? "inspect" : current));
  }, [mv.mode]);
  React.useEffect(() => {
    if (mv.selection && mv.mode === "design") setTab("inspect");
  }, [mv.selection, mv.mode]);
  React.useEffect(() => {
    if (mv.traceRequest) setTab("trace");
  }, [mv.traceRequest]);
  // A new subject starts at the top: the scroll offset belongs to what was shown before.
  const subject = `${tab}:${mv.selection?.type ?? ""}:${mv.selection?.id ?? ""}:${mv.machineId}`;
  return { tab, setTab, subject };
}

function TabTriggers({ sheet }: { readonly sheet: boolean }) {
  const mv = useMachine();
  const errors = mv.issues.filter((i) => i.severity === "error").length;
  const count = mv.issues.length;
  const trigger = sheet ? sheetTabClass : "text-ui";
  return (
    <TabsList
      variant={sheet ? "line" : "default"}
      className={sheet ? sheetTabListClass : "grid h-8 w-full grid-cols-4 coarse:h-11"}
    >
      <TabsTrigger value="inspect" className={trigger}>
        Inspect
      </TabsTrigger>
      <TabsTrigger value="simulate" className={trigger}>
        Run
      </TabsTrigger>
      <TabsTrigger value="trace" className={trigger}>
        Trace
        {mv.snapshot?.trace.length ? (
          <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
            {mv.snapshot.trace.length}
          </span>
        ) : null}
      </TabsTrigger>
      <TabsTrigger
        value="issues"
        className={trigger}
        aria-label={
          count
            ? `Issues, ${plural(errors, "error")}, ${plural(count - errors, "warning")}`
            : "Issues, none"
        }
      >
        Issues
        {count > 0 && (
          <span
            className={cn(
              "grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9.5px]",
              errors ? "bg-destructive/15 text-destructive" : "bg-warning/15 text-warning",
            )}
          >
            {count}
          </span>
        )}
      </TabsTrigger>
    </TabsList>
  );
}

function Panels() {
  const mv = useMachine();
  return TABS.map((value) => (
    <TabsContent
      key={value}
      value={value}
      className="m-0 p-3 duration-200 ease-[var(--ease-standard)] data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:slide-in-from-bottom-1 max-md:pt-2"
    >
      {value === "inspect" ? (
        <div
          key={mv.mode === "inspect" ? "inspection" : (mv.selection?.id ?? "machine")}
          className="animate-in fade-in-0 duration-200"
        >
          {mv.mode === "inspect" ? (
            <>
              <MachinePresentationDetails
                presentation={mv.presentation}
                id={mv.selection?.id}
                kind={mv.selection?.type}
              />
              <MachineInspectionPanel inspection={mv.inspection} onReveal={mv.reveal} />
            </>
          ) : (
            <InspectPanel />
          )}
        </div>
      ) : value === "simulate" ? (
        <RunPanel />
      ) : value === "trace" ? (
        <TracePanel />
      ) : (
        <IssuesPanel />
      )}
    </TabsContent>
  ));
}

/** Desktop side panel. */
export function MachineInspector() {
  const { tab, setTab, subject } = useInspectorTab();
  const scroller = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const viewport = scroller.current?.querySelector<HTMLElement>(
      "[data-slot=scroll-area-viewport]",
    );
    if (viewport) viewport.scrollTop = 0;
  }, [subject]);
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      data-slot="machine-inspector"
      className="flex h-full flex-col gap-0"
    >
      <div className="border-b border-hairline px-2 py-1.5">
        <TabTriggers sheet={false} />
      </div>
      <ScrollArea
        ref={scroller}
        className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block"
      >
        <Panels />
      </ScrollArea>
    </Tabs>
  );
}

/**
 * Phone: the same tabs in the shared sheet. Closing it (×, Esc, drag) hands focus back to the
 * selected node, else to the peek bar.
 */
export function MachineInspectorSheet() {
  const mv = useMachine();
  const chrome = useMachineChrome();
  const { tab, setTab, subject } = useInspectorTab();
  const root = React.useRef<HTMLDivElement>(null);
  const mvRef = React.useRef(mv);
  mvRef.current = mv;
  const returnFocus = React.useCallback(() => {
    const view = root.current?.closest<HTMLElement>("[data-slot=machine-view]");
    if (!view) return;
    const sel = mvRef.current.selection;
    const node =
      sel?.type === "node"
        ? view.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(sel.id)}"]`)
        : null;
    // The sheet's section is gone by the next frame; the canvas node (or peek bar) is not.
    focusNextFrame(
      () => node ?? view.querySelector<HTMLElement>("[data-slot=machine-peek]") ?? view,
    );
  }, []);
  return (
    // `contents`: the Tabs root only joins the bar's list and the panels; the sheet positions itself.
    <Tabs
      ref={root}
      value={tab}
      onValueChange={(value) => setTab(value as Tab)}
      data-slot="machine-inspector"
      className="contents"
    >
      <MachineSheet
        open={chrome.panelOpen}
        onOpenChange={chrome.setPanelOpen}
        snap={chrome.snap}
        onSnapChange={chrome.setSnap}
        onOcclusionChange={chrome.setSheetInset}
        returnFocus={returnFocus}
        scrollKey={subject}
        tabs={<TabTriggers sheet />}
      >
        <Panels />
      </MachineSheet>
    </Tabs>
  );
}
