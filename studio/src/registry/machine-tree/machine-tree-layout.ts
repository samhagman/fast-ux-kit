/**
 * Layout concern of the Machine Tree controller: the panel (side panel on desktop, the shared
 * non-modal `MachineSheet` on phones), its tab, the sheet's snap and how much of the canvas it
 * covers, the overlays (⌘K, diagnostics), the refs the chrome measures, and the writing direction.
 * The sheet's geometry (peek, content-fit expanded height, drag) lives in the shared sheet.
 */
import * as React from "react";
import type { Dir } from "@/lib/direction";
import type { MachineTreePanelTab, MachineTreeProps } from "./machine-tree";
import type { MachineTreeSheetSnap } from "./machine-tree-logic";
import { useControllable } from "./machine-tree-store";
import { useTreeToaster, type TreeToaster } from "./machine-tree-primitives";
import type { MachineToasterHostState } from "@/registry/machine-shared/machine-toast";

export interface LayoutCtx {
  readonly isPhone: boolean;
  readonly coarse: boolean;
  readonly dir: Dir;
  readonly rootRef: React.RefObject<HTMLDivElement | null>;
  readonly scrollerRef: React.RefObject<HTMLDivElement | null>;
  /* panel */
  readonly panel: boolean;
  readonly setPanel: (open: boolean) => void;
  readonly panelTab: MachineTreePanelTab;
  readonly setPanelTab: (tab: MachineTreePanelTab | ((tab: MachineTreePanelTab) => MachineTreePanelTab)) => void;
  readonly openPanel: (tab: MachineTreePanelTab, expanded?: boolean) => void;
  /* phone sheet */
  readonly snap: MachineTreeSheetSnap;
  readonly setSnap: (snap: MachineTreeSheetSnap) => void;
  /** Pixels of the canvas the phone sheet covers at its target snap (0 when closed or on desktop). */
  readonly sheetInset: number;
  /** The sheet's `onOcclusionChange`. */
  readonly setSheetInset: (px: number) => void;
  /* overlays */
  readonly gotoOpen: boolean;
  readonly setGotoOpen: (open: boolean) => void;
  readonly diagnosticsOpen: boolean;
  readonly setDiagnosticsOpen: (open: boolean) => void;
  /* feedback */
  /** This instance's toasts (its own toaster, below its own toolbar). */
  readonly toast: TreeToaster;
  /** What `TreeToasterHost` renders (id, top offset), and the band a persistent toast covers. */
  readonly toaster: MachineToasterHostState;
}

export const LayoutContext = React.createContext<LayoutCtx | null>(null);
export function useTreeLayout(): LayoutCtx {
  const ctx = React.useContext(LayoutContext);
  if (!ctx) throw new Error("Machine Tree parts must be rendered inside <MachineTreeRoot>");
  return ctx;
}

export function useLayoutController(
  props: Pick<MachineTreeProps, "panelOpen" | "defaultPanelOpen" | "onPanelOpenChange" | "panelTab" | "defaultPanelTab" | "onPanelTabChange">,
  env: { readonly isPhone: boolean; readonly coarse: boolean; readonly dir: Dir; readonly rootRef: React.RefObject<HTMLDivElement | null>; readonly scrollerRef: React.RefObject<HTMLDivElement | null> },
): LayoutCtx {
  const [panel, setPanel] = useControllable<boolean>(props.panelOpen, () => props.defaultPanelOpen ?? false, props.onPanelOpenChange);
  const [panelTab, setPanelTab] = useControllable<MachineTreePanelTab>(props.panelTab, () => props.defaultPanelTab ?? "details", props.onPanelTabChange);
  const [snap, setSnap] = React.useState<MachineTreeSheetSnap>("peek");
  const [sheetInset, setSheetInset] = React.useState(0);
  const [gotoOpen, setGotoOpen] = React.useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = React.useState(false);
  const openPanel = React.useCallback(
    (tab: MachineTreePanelTab, expanded = false) => {
      setPanelTab(tab);
      setSnap(expanded ? "full" : "peek");
      setPanel(true);
    },
    [setPanel, setPanelTab],
  );
  const { isPhone, coarse, dir, rootRef, scrollerRef } = env;
  const { toast, host: toaster } = useTreeToaster(rootRef);
  return React.useMemo<LayoutCtx>(
    () => ({
      isPhone,
      coarse,
      dir,
      rootRef,
      scrollerRef,
      panel,
      setPanel,
      panelTab,
      setPanelTab,
      openPanel,
      snap,
      setSnap,
      sheetInset,
      setSheetInset,
      gotoOpen,
      setGotoOpen,
      diagnosticsOpen,
      setDiagnosticsOpen,
      toast,
      toaster,
    }),
    [isPhone, coarse, dir, rootRef, scrollerRef, panel, setPanel, panelTab, setPanelTab, openPanel, snap, sheetInset, gotoOpen, diagnosticsOpen, toast, toaster],
  );
}
