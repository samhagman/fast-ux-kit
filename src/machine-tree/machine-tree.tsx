import * as React from "react";

import { MotionConfig } from "motion/react";
import {
  type MachineDocument,
  type MachineEvent,
  type MachineGraph,
  type MachineRuntimeOptions,
  type MachineScenario,
  type MachineSnapshot,
  type MachineTreeActiveStates,
  type MachineTreeModel,
  type MachineTreeRow,
} from "../core/index.js";
import { cn } from "../lib/utils.js";
import { DirectionScope, type Dir } from "../lib/direction.js";
import {
  type MachineSimulation,
  type SendResult,
} from "../machine-shared/use-machine-simulation.js";
import { MachineTreeCanvas } from "./machine-tree-canvas.js";
import { ApiContext, BaseContext, useMachineTreeController } from "./machine-tree-controller.js";
import { GoToDialog } from "./machine-tree-goto.js";
import { LayoutContext } from "./machine-tree-layout.js";
import type { MachineTreeScenarioReport } from "./machine-tree-logic.js";
import type { MachineInspectionProps } from "../machine-shared/use-machine-inspection.js";
export { inspectionFrameKey } from "../machine-shared/use-machine-inspection.js";
export type {
  MachineInspectionProps,
  MachineInspectionAction,
} from "../machine-shared/use-machine-inspection.js";
import { NavigationContext } from "./machine-tree-navigation.js";
import { MachineTreePanel } from "./machine-tree-panel.js";
import { TreeToasterHost } from "./machine-tree-primitives.js";
import { SimulationContext } from "./machine-tree-run.js";
import { MachineTreeFooter } from "./machine-tree-simulation.js";
import { ModelCtx, StoreCtx } from "./machine-tree-store.js";
import { MachineTreeToolbar } from "./machine-tree-toolbar.js";

/**
 * Machine Tree View: the state-containment hierarchy as nested, wrapping blocks.
 *   • a state is a block as wide as max(header, its own routes); siblings flow and wrap
 *   • a compound encloses its children and sizes to them; a parallel state splits into region
 *     columns separated by dashed dividers (the statechart convention)
 *   • outgoing transitions hang below (outside) their owning state on a branch connector
 *
 * Data comes from the portable core: `buildMachineTree` (topology + exact active ids),
 * `projectMachineTree` (search with ancestor context, ARIA level/posinset/setsize),
 * `machineTreeAncestors` and `resolveMachineTreeTarget/Source` (duplicate-safe navigation).
 * The view is inert: selecting, folding, searching and following a target never execute
 * anything. Simulation is a separate, explicit local run over the host `runtime` map.
 *
 * Composition: `MachineTree` is the batteries-included layout of the parts below. Hosts that
 * want their own shell render `<MachineTreeRoot>` with any of `MachineTreeToolbar`,
 * `MachineTreeCanvas`, `MachineTreePanel`, `MachineTreeFooter` inside it, and can read the
 * controller with `useMachineTree()`.
 *
 * Rendering: rows subscribe to a tiny view store (focus, selection, peek, flash, match) through
 * `useSyncExternalStore` selectors, and every row component is memoized behind a stable model
 * context. Moving focus re-renders two rows, not the tree. Host guards never run during render:
 * blocked reasons are computed once per snapshot + payload.
 *
 * Row ids are the core's `machineTreeRowId(kind, machineId, elementId)` tuples, so hosts can
 * address rows for the controlled `selectedId` / `collapsedIds` props.
 *
 * Files (one registry item): this file is the public surface and the only import a host needs.
 *   machine-tree-controller.ts   shared base data + composition of the three concerns, the API
 *   machine-tree-layout.ts       LayoutCtx: panel, sheet snap + occlusion, overlays, refs, direction
 *   machine-tree-navigation.ts   NavigationCtx: selection, folds, find, focus hand-off, keyboard
 *   machine-tree-run.ts          SimulationCtx: run view, sends, fixes, lazy dry run, scenarios, feedback
 *   machine-tree-logic.ts        pure helpers (labels, blocked reasons, previews, scenario reports)
 *   machine-tree-store.ts        React infrastructure: row view store, row model context (shared helpers: machine-shared/, lib/platform)
 *   machine-tree-primitives.tsx  icon button and the per-instance 44px touch toaster
 *   machine-tree-canvas.tsx      the canvas and every tree row (machines, states, regions, routes)
 *   machine-tree-toolbar.tsx     breadcrumb, find, fold-all, diagnostics
 *   machine-tree-goto.tsx        the ⌘K palette (states, transitions, send)
 *   machine-tree-panel.tsx       side panel: Details, Code (and the phone sheet's body)
 *   (phone sheet)                machine-shared/machine-sheet.tsx, shared with Machine View
 *   machine-tree-simulation.tsx  the Simulation tab and the footer run controls
 */
export { useMachineTree } from "./machine-tree-controller.js";
export type {
  MachineTreeFix,
  MachineTreeScenarioReport,
  MachineTreeSheetSnap,
} from "./machine-tree-logic.js";
export { MachineTreeCanvas, MachineTreeFooter, MachineTreePanel, MachineTreeToolbar };

export type MachineTreePanelTab = "details" | "simulation" | "code" | "runtime";
export type MachineTreeMode = "view" | "simulate" | "inspect";

export interface MachineTreeProps extends MachineInspectionProps {
  readonly mode?: MachineTreeMode;
  readonly defaultMode?: MachineTreeMode;
  readonly onModeChange?: (mode: MachineTreeMode) => void;
  /** Show one container without changing saved folds or selection. Search still spans the document. */
  readonly focusedRowId?: string | null;
  readonly defaultFocusedRowId?: string | null;
  readonly onFocusedRowChange?: (rowId: string | null) => void;
  readonly document: MachineDocument;
  readonly runtime?: MachineRuntimeOptions;
  readonly scenarios?: readonly MachineScenario[];
  readonly className?: string;
  /** Controlled side panel / phone sheet. */
  readonly panelOpen?: boolean;
  readonly defaultPanelOpen?: boolean;
  readonly onPanelOpenChange?: (open: boolean) => void;
  readonly panelTab?: MachineTreePanelTab;
  readonly defaultPanelTab?: MachineTreePanelTab;
  readonly onPanelTabChange?: (tab: MachineTreePanelTab) => void;
  /** Controlled selection (row id). `null` = nothing selected; omit for uncontrolled. */
  readonly selectedId?: string | null;
  readonly defaultSelectedId?: string | null;
  readonly onSelectedChange?: (rowId: string | null, row: MachineTreeRow | undefined) => void;
  /** Controlled fold state: row ids of collapsed containers / machines. */
  readonly collapsedIds?: ReadonlySet<string>;
  readonly defaultCollapsedIds?: Iterable<string>;
  readonly onCollapsedChange?: (rowIds: ReadonlySet<string>) => void;
  /** Controlled find query. A non-empty query keeps the find field open. */
  readonly query?: string;
  readonly defaultQuery?: string;
  readonly onQueryChange?: (query: string) => void;
  /** Host-supplied active states (e.g. an external actor), shown while no local simulation runs. */
  readonly activeStates?: readonly MachineTreeActiveStates[];
  /** Share one run between views: pass `useMachineSimulation(...)` from the host. */
  readonly simulation?: MachineSimulation;
  /** Called with the live snapshot whenever the local run changes (`null` when stopped). */
  readonly onSimulationChange?: (snapshot: MachineSnapshot | null) => void;
  /** Topology ingestion bound passed to the core (default 10,000). */
  readonly maxItems?: number;
  /**
   * ⌘F / Ctrl+F opens find when the user's last pointer or focus interaction was inside this
   * component, even if focus has fallen back to the page body. Default true.
   */
  readonly captureFindShortcut?: boolean;
  /** Writing direction. Defaults to the direction inherited from the page (followed live). */
  readonly dir?: Dir;
  /**
   * Names this instance for assistive tech: the tree is "{label} state hierarchy" and its toasts
   * region "{label} notifications". Defaults to the root machine's label; give two instances of
   * the same machine on one page distinct labels.
   */
  readonly label?: string;
}

/** What a running (or idle) local simulation looks like from outside. */
export interface MachineTreeSimulationState {
  readonly status: "idle" | MachineSnapshot["status"];
  /** The run's error message when `status === "error"`. */
  readonly error: string | null;
  /** The live snapshot (`null` when idle). Its trace is the full history. */
  readonly snapshot: MachineSnapshot | null;
  /** Events taken since start; never negative. */
  readonly steps: number;
  /** The history step being replayed, or `null` when showing the live run. */
  readonly replayStep: number | null;
  readonly playingScenarioId: string | null;
  /** Deepest active state ids of the frame on screen (replay-aware). */
  readonly activeLeafIds: readonly string[];
  readonly enabledTransitionIds: ReadonlySet<string>;
  readonly blockedTransitionIds: ReadonlySet<string>;
}

/**
 * The Machine Tree contract, returned by `useMachineTree()` inside a `<MachineTreeRoot>`.
 * Memoized: its identity changes only when one of these values does, and every function is
 * stable for the life of the root. Row ids are the core's `machineTreeRowId` tuples.
 */
export interface MachineTreeApi {
  readonly mode: MachineTreeMode;
  readonly setMode: (mode: MachineTreeMode) => void;
  readonly focusedRowId: string | null;
  readonly focusContainer: (rowId: string | null) => void;
  readonly document: MachineDocument;
  readonly rootMachine: MachineGraph;
  /** The core projection on screen (rows, issues, active flags, truncation). */
  readonly model: MachineTreeModel;

  /* selection + navigation */
  readonly selectedId: string | null;
  readonly selectedRow: MachineTreeRow | undefined;
  readonly select: (rowId: string | null) => void;
  /** Unfold ancestors, clear a hiding search, select, focus and flash a row. */
  readonly reveal: (rowId: string) => void;
  /** Opens the ⌘K "Go to state" palette. */
  readonly openGoTo: () => void;

  /* find */
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly openFind: () => void;

  /* panel (side panel on desktop, non-modal sheet on phones) */
  readonly panelOpen: boolean;
  readonly setPanelOpen: (open: boolean) => void;
  readonly panelTab: MachineTreePanelTab;
  readonly setPanelTab: (tab: MachineTreePanelTab) => void;
  readonly openPanel: (tab: MachineTreePanelTab, options?: { readonly expanded?: boolean }) => void;

  /* folds */
  readonly collapsedIds: ReadonlySet<string>;
  readonly setCollapsedIds: (rowIds: ReadonlySet<string>) => void;
  readonly toggle: (rowId: string) => void;
  readonly expandAll: () => void;
  readonly collapseAll: () => void;

  /* simulation (local, explicit; guards and actions only through the host runtime) */
  readonly simulation: MachineTreeSimulationState;
  readonly start: () => void;
  readonly stop: () => void;
  /** Sends an event (with the payload editor's payload when given a type). Takes over a playing scenario. */
  readonly send: (event: string | MachineEvent) => SendResult | null;
  /** Replay a history step (`null` = back to live). */
  readonly setReplayStep: (step: number | null) => void;
  readonly runScenario: (scenarioId: string) => void;
  /** Runs every scenario headlessly (instant, live run untouched) and records the reports. */
  readonly runAllScenarios: () => { readonly passed: number; readonly total: number };
  readonly scenarioReports: ReadonlyMap<string, MachineTreeScenarioReport>;
}

/* ───────────────────────────── parts ───────────────────────────── */

/** Provider + frame. Compose any of the parts inside it. */
export function MachineTreeRoot({
  children,
  ...props
}: MachineTreeProps & { readonly children: React.ReactNode }) {
  const ctl = useMachineTreeController(props);
  const { layout, nav } = ctl;
  return (
    <DirectionScope dir={layout.dir}>
      <ApiContext.Provider value={ctl.api}>
        <BaseContext.Provider value={ctl.base}>
          <LayoutContext.Provider value={layout}>
            <NavigationContext.Provider value={nav}>
              <SimulationContext.Provider value={ctl.run}>
                <StoreCtx.Provider value={ctl.base.store}>
                  <ModelCtx.Provider value={ctl.modelCtx}>
                    <MotionConfig reducedMotion="user">
                      <div
                        ref={layout.rootRef}
                        data-slot="machine-tree"
                        dir={props.dir}
                        // Portalled parts (dialog, popovers) bubble here too: the focus hand-off sees them all.
                        onFocus={(event) => nav.noteFocus(event.target as HTMLElement)}
                        onKeyDown={(event) => {
                          if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
                          const key = event.key.toLowerCase();
                          if (key === "f") {
                            event.preventDefault();
                            nav.openSearch();
                          } else if (key === "k") {
                            event.preventDefault();
                            layout.setGotoOpen(true);
                          }
                        }}
                        className={cn(
                          "relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface text-ui",
                          props.className,
                        )}
                      >
                        {children}
                        <GoToDialog />
                        <TreeToasterHost
                          id={layout.toaster.id}
                          top={layout.toaster.top}
                          dir={layout.dir}
                          label={`${ctl.base.label} notifications`}
                        />
                        <span className="sr-only" role="status" aria-live="polite">
                          {ctl.announcement.polite}
                        </span>
                        <span className="sr-only" role="alert" aria-live="assertive">
                          {ctl.announcement.assertive}
                        </span>
                      </div>
                    </MotionConfig>
                  </ModelCtx.Provider>
                </StoreCtx.Provider>
              </SimulationContext.Provider>
            </NavigationContext.Provider>
          </LayoutContext.Provider>
        </BaseContext.Provider>
      </ApiContext.Provider>
    </DirectionScope>
  );
}

/** The batteries-included composition. */
export function MachineTree(props: MachineTreeProps) {
  return (
    <MachineTreeRoot {...props}>
      <MachineTreeToolbar />
      {/* `relative`: the phone sheet docks inside this row, above the footer's run controls. */}
      <div className="relative flex min-h-0 flex-1">
        <MachineTreeCanvas />
        <MachineTreePanel />
      </div>
      <MachineTreeFooter />
    </MachineTreeRoot>
  );
}
