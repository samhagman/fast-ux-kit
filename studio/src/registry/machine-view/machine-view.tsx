import * as React from "react";
import { createPortal } from "react-dom";
import "./machine-view.css";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { ReactFlowProvider, useReactFlow } from "@xyflow/react";
import "@xyflow/react/dist/base.css";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { useMachineView, type MachineViewController, type UseMachineViewOptions } from "./use-machine-view";
import { DirectionScope, useResolvedDirection, type Dir } from "@/lib/direction";
import { MachineInspector, MachineInspectorSheet } from "./machine-inspector";
import { COMPACT_BREAKPOINT, ChromeContext, MachineContext, PANEL_W, countStates, stepCursor, type MachineChrome, type SheetSnap } from "./machine-context";
import { MachineCanvas } from "./machine-canvas";
import { MachineStatusBar, MachineToolbar, ShortcutsDialog } from "./machine-toolbar";
import { PeekBar } from "./machine-phone";
import { MachineToasterHost, useMachineToaster } from "../machine-shared/machine-toast";

/**
 * Machine View: a statechart editor and simulator.
 *
 *   machine-view.tsx      shell: providers, key map, focus continuity, desktop/phone layout
 *   use-machine-view.ts   controller: document + history, layout, simulation, selection
 *   machine-canvas.tsx    React Flow canvas, palette, selection toolbar, viewport choreography
 *   machine-nodes.tsx     state / container / note / initial renderers
 *   machine-edges.tsx     transition edges, event chips, payload popover
 *   machine-phone.tsx     phone peek bar (with the selection's quick actions)
 *   ../machine-shared/machine-sheet.tsx  the non-modal phone sheet (shared with Machine Tree)
 *   machine-viewport.ts   the clear band (occluders) + fit / reveal math
 *   machine-toolbar.tsx   toolbar, breadcrumb, mode switch, status bar, shortcuts
 *   machine-inspector.tsx inspector shell (desktop panel / phone sheet); one file per tab:
 *                         inspect-panel · run-panel · trace-panel · issues-panel
 *   controlled-document.ts the document contract (controlled echo / rejection / external), pure
 *   use-controlled-document.ts its React wiring (value/default convention, dev warnings)
 */
/**
 * Props. The document follows React's value/default convention (see `MachineDocumentProps`):
 *
 *   <MachineView defaultDocument={doc} onDocumentChange={save} />           uncontrolled; save is notified
 *   <MachineView document={doc} onDocumentChange={(next) => setDoc(next)} /> controlled; pass it back to accept
 *   <MachineView document={serverDoc} readOnly />                          live read-only viewer
 */
export type MachineViewProps = UseMachineViewOptions & {
  readonly className?: string;
  /** Optional extra toolbar content (e.g. an example picker) rendered at the start. */
  readonly toolbarStart?: React.ReactNode;
  /** Writing direction; defaults to the direction inherited from the page. */
  readonly dir?: Dir;
};

/**
 * `Omit` that keeps a union a union. `MachineViewProps` is a union (controlled, read-only viewer,
 * uncontrolled), and the built-in `Omit` flattens a union to its common keys, so the result no
 * longer spreads back onto `<MachineView>`. Wrappers use this instead:
 *
 *   function FramedMachine({ className, ...rest }: MachineViewProps) { … <MachineView {...rest} className={cn("…", className)} /> }
 *   function Bare(props: DistributiveOmit<MachineViewProps, "className" | "toolbarStart">) { return <MachineView {...props} />; }
 */
export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export { useMachine, useMachineChrome, KIND_LABEL, kindTag, countStates, stepCursor } from "./machine-context";
export type { MachineViewController };
export type { MachineDocumentProps } from "./use-machine-view";
export type { DocumentChangeEvent, DocumentChangeHandler } from "./use-controlled-document";

export function MachineView(props: MachineViewProps) {
  return (
    <MotionConfig reducedMotion="user">
      <ReactFlowProvider>
        <MachineViewInner {...props} />
      </ReactFlowProvider>
    </MotionConfig>
  );
}

/** Container width, not viewport width: the component may sit in any layout. */
function useCompact(ref: React.RefObject<HTMLElement | null>) {
  const [compact, setCompact] = React.useState(() => typeof window !== "undefined" && window.innerWidth < COMPACT_BREAKPOINT);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setCompact(el.getBoundingClientRect().width < COMPACT_BREAKPOINT);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref]);
  return compact;
}

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && !!target.closest("input,textarea,select,[contenteditable=true],[role=combobox],[role=menu],[role=listbox]");

/**
 * Focus never falls to <body>. Whenever the focused element inside the view unmounts (an
 * inspector row that swaps the panel, the last event in the Run tab, opening a submachine,
 * deleting from the toolbar) focus moves to the next sensible place:
 *   inside the inspector → its `[data-mv-focus-fallback]` control, else the active tab panel;
 *   anywhere else        → the selected node, else the machine's initial state, else the view.
 * Runs after every commit of the view (cheap: one `isConnected` check), retrying a few frames
 * while a freshly opened machine lays out.
 */
function useFocusContinuity(root: React.RefObject<HTMLDivElement | null>, mv: MachineViewController) {
  const last = React.useRef<{ el: HTMLElement; inInspector: boolean } | null>(null);
  const mvRef = React.useRef(mv);
  mvRef.current = mv;
  const frame = React.useRef(0);
  /** If the last focused element is gone and nothing else holds focus, place it (retrying while a machine lays out). */
  const check = React.useCallback(() => {
    const lost = last.current;
    if (!lost || lost.el.isConnected) return;
    cancelAnimationFrame(frame.current);
    let tries = 0;
    frame.current = requestAnimationFrame(function attempt() {
      const host = root.current;
      const active = window.document.activeElement;
      if (!host || (active && active !== window.document.body && active.isConnected)) return; // someone else placed focus
      const m = mvRef.current;
      const panel = lost.inInspector ? host.querySelector<HTMLElement>("[data-slot=machine-inspector] [role=tabpanel][data-state=active]") : null;
      const node = (id: string | undefined) => (id ? host.querySelector<HTMLElement>(`.react-flow__node[data-id="${CSS.escape(id)}"]`) : null);
      const next = panel
        ? (panel.querySelector<HTMLElement>("[data-mv-focus-fallback]:not(:disabled)") ?? panel)
        : (node(m.selection?.type === "node" ? m.selection.id : undefined) ?? node(m.graph.initialId) ?? host.querySelector<HTMLElement>(".react-flow__node[tabindex]"));
      if (!next && tries++ < 30) {
        frame.current = requestAnimationFrame(attempt);
        return;
      }
      // focusin records the new element as `last`, so the next loss is caught too.
      (next ?? host).focus({ preventScroll: true });
    });
  }, [root]);
  React.useEffect(() => {
    const el = root.current;
    if (!el) return;
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target as HTMLElement;
      last.current = { el: target, inInspector: !!target.closest("[data-slot=machine-inspector]") };
    };
    // A pointer press that moves focus to nothing (the canvas background) is the user's choice.
    let pressedAt = -Infinity;
    const onPointerDown = () => (pressedAt = performance.now());
    // Focus can also drop to <body> without an unmount: React Flow re-orders node elements on a
    // reparent, and moving a focused element blurs it. Put it back where it was.
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget) return;
      const target = event.target as HTMLElement;
      const byUser = performance.now() - pressedAt < 400;
      requestAnimationFrame(() => {
        if (window.document.activeElement && window.document.activeElement !== window.document.body) return;
        if (!target.isConnected) return check();
        if (!byUser && el.contains(target)) target.focus({ preventScroll: true });
      });
    };
    el.addEventListener("focusin", onFocusIn);
    el.addEventListener("focusout", onFocusOut);
    window.document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      el.removeEventListener("focusin", onFocusIn);
      el.removeEventListener("focusout", onFocusOut);
      window.document.removeEventListener("pointerdown", onPointerDown, true);
      cancelAnimationFrame(frame.current);
    };
  }, [root, check]);
  React.useEffect(check);
}

function MachineViewInner(props: MachineViewProps) {
  const { className, toolbarStart, dir } = props;
  const root = React.useRef<HTMLDivElement>(null);
  const direction = useResolvedDirection(root, dir);
  const compact = useCompact(root);
  // The canvas size before React Flow measures it: the real canvas column (no magic chrome numbers).
  const column = React.useRef<HTMLDivElement>(null);
  const measureViewport = React.useCallback(() => {
    const box = column.current?.getBoundingClientRect();
    return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : null;
  }, []);
  // Desktop notices go to this view's own toaster, anchored above its status bar (see ViewToaster).
  const toasterId = `machine-view-${React.useId()}`;
  // Phone notices go to this view's own touch toaster, under its toolbar (the tree does the same).
  const touch = useMachineToaster(root, { toolbar: "[data-mv-toolbar]" });
  const mv = useMachineView(props, {
    compact,
    measureViewport,
    toasterId: compact ? undefined : toasterId,
    touchToast: touch.toast.show,
  });
  const flow = useReactFlow();
  /** Selection as it was before React Flow handled this keydown (Enter selects first). */
  const selectedBeforeKey = React.useRef<string | null>(null);
  const [panelPref, setPanelPref] = React.useState<boolean | null>(null);
  const panelOpen = panelPref ?? !compact;
  const [snap, setSnap] = React.useState<SheetSnap>("peek");
  const [sheetInset, setSheetInset] = React.useState(0);
  const [minimapPref, setMinimapPref] = React.useState<boolean | null>(null);
  const minimap = !compact && (minimapPref ?? countStates(mv.graph) >= 12);
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  // Switching between phone and desktop shells resets the panel to that shell's default.
  React.useEffect(() => setPanelPref(null), [compact]);
  useFocusContinuity(root, mv);

  const chrome = React.useMemo<MachineChrome>(
    () => ({
      compact,
      panelOpen,
      setPanelOpen: setPanelPref,
      snap,
      setSnap,
      sheetInset,
      setSheetInset,
      minimap,
      setMinimap: setMinimapPref,
      showShortcuts: () => setShortcutsOpen(true),
    }),
    [compact, panelOpen, snap, sheetInset, minimap],
  );

  // Shortcuts live on the document while the component is "active" (focus inside, or the
  // pointer over it with nothing else focused), so undo still works after a delete moves
  // focus to <body>.
  const hovered = React.useRef(false);
  const mvRef = React.useRef(mv);
  mvRef.current = mv;
  const chromeRef = React.useRef(chrome);
  chromeRef.current = chrome;
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const el = root.current;
      if (!el) return;
      const focusInside = el.contains(window.document.activeElement);
      const idle = window.document.activeElement === window.document.body;
      if (!focusInside && !(idle && hovered.current)) return;
      if (event.defaultPrevented || isTyping(event.target)) return;
      if (window.document.querySelector("[role=dialog][data-state=open]") && !el.contains(event.target as globalThis.Node | null)) return;
      const m = mvRef.current;
      const c = chromeRef.current;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && (key === "z" || key === "y")) {
        if (m.mode !== "design" || !m.editable) return;
        event.preventDefault();
        if (key === "y" || event.shiftKey) m.redo();
        else m.undo();
        return;
      }
      if (mod || event.altKey) return;
      const designNode = m.mode === "design" && m.editable && m.selection?.type === "node" ? m.selection.id : null;
      if ((event.key === "Backspace" || event.key === "Delete") && m.mode === "design" && m.selection) {
        // Read-only: Delete does nothing (no "read-only" error toast for a key the copy never offered).
        if (!m.editable) return;
        event.preventDefault();
        if (m.deleteSelection()) el.focus();
      } else if (event.key === "Escape") {
        if (m.cursor !== null) m.setCursor(null);
        else if (m.renaming) m.setRenaming(null);
        else if (c.compact && c.panelOpen && c.snap === "full") c.setSnap("peek");
        else if (c.compact && c.panelOpen) c.setPanelOpen(false);
        else if (m.selection) m.setSelection(null);
        else return;
        event.preventDefault();
      } else if ((event.key === "Enter" || event.key === "F2") && designNode) {
        // One meaning per key: Enter on a node selects it; Enter on the node that was already
        // selected (or on the canvas itself) renames it. F2 renames the selection from anywhere.
        const target = event.target as HTMLElement | null;
        const nodeEl = target?.closest?.(".react-flow__node");
        const onSelected = nodeEl?.getAttribute("data-id") === designNode && selectedBeforeKey.current === designNode;
        const onCanvas = target === el || !!target?.classList?.contains("react-flow__pane") || target?.classList?.contains("react-flow");
        if (event.key === "F2" || onSelected || onCanvas) {
          event.preventDefault();
          m.setRenaming(designNode);
        }
      } else if (key === "a" && designNode && !event.shiftKey) {
        event.preventDefault();
        m.addConnected(designNode);
      } else if (key === "f") {
        event.preventDefault();
        const id = m.selection?.type === "node" ? m.selection.id : null;
        flow.fitView({
          duration: 260,
          padding: 0.2,
          maxZoom: 1.2,
          ...(id ? { nodes: [{ id }] } : {}),
        });
      } else if ((event.key === "ArrowLeft" || event.key === "ArrowRight") && m.snapshot && m.mode === "simulate") {
        event.preventDefault();
        stepCursor(m, event.key === "ArrowLeft" ? -1 : 1);
      } else if (event.key === "?") {
        setShortcutsOpen(true);
      }
    };
    window.document.addEventListener("keydown", onKey);
    return () => window.document.removeEventListener("keydown", onKey);
  }, [flow]);

  return (
    <DirectionScope dir={direction}>
      <MachineContext.Provider value={mv}>
        <ChromeContext.Provider value={chrome}>
          <div
            ref={root}
            dir={dir}
            tabIndex={-1}
            data-slot="machine-view"
            // Proposals waiting on a controlled host (styling and tests can key on it).
            data-pending={mv.pendingChanges > 0 || undefined}
            onKeyDownCapture={() => (selectedBeforeKey.current = mv.selection?.type === "node" ? mv.selection.id : null)}
            onPointerEnter={() => (hovered.current = true)}
            onPointerLeave={() => (hovered.current = false)}
            className={cn("relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface text-ui outline-none", className)}
          >
            <MachineToolbar toolbarStart={toolbarStart} />
            <div className="relative flex min-h-0 flex-1">
              <div ref={column} data-mv-column className="relative min-w-0 flex-1">
                <CanvasBoundary resetKey={mv.machineId}>
                  <MachineCanvas />
                </CanvasBoundary>
                {compact && !panelOpen && <PeekBar />}
                {compact && (
                  <CanvasBoundary resetKey={mv.machineId} label="inspector">
                    <MachineInspectorSheet />
                  </CanvasBoundary>
                )}
              </div>
              {!compact && (
                <AnimatePresence initial={false}>
                  {panelOpen && (
                    <motion.aside
                      aria-label="Inspector"
                      initial={{ width: 0, opacity: 0 }}
                      animate={{ width: "var(--panel-w)", opacity: 1 }}
                      exit={{ width: 0, opacity: 0 }}
                      transition={motionTokens.base}
                      className="shrink-0 overflow-hidden border-s border-hairline bg-surface"
                      style={{ "--panel-w": `${PANEL_W}px` } as React.CSSProperties}
                    >
                      <div className="h-full w-[var(--panel-w)]">
                        <CanvasBoundary resetKey={mv.machineId} label="inspector">
                          <MachineInspector />
                        </CanvasBoundary>
                      </div>
                    </motion.aside>
                  )}
                </AnimatePresence>
              )}
            </div>
            <MachineStatusBar />
            <div aria-live="polite" aria-atomic className="sr-only">
              {mv.announcement}
            </div>
            <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
            {!compact && <ViewToaster id={toasterId} direction={direction} />}
            {compact && <MachineToasterHost id={touch.host.id} top={touch.host.top} dir={direction} label={NOTICES_LABEL} />}
          </div>
        </ChromeContext.Provider>
      </MachineContext.Provider>
    </DirectionScope>
  );
}

/* ───────────────────────────── Notices ───────────────────────────── */

/**
 * The desktop view's own sonner toaster. The page's toaster sits in the window's corner, which is
 * exactly where a full-height view keeps its status bar ("valid", "?") and the React Flow
 * attribution, and the view's own end corner is the inspector (its "Delete state" row). So this
 * one is pinned to the CANVAS column's end corner, just above the status bar, the attribution
 * and the minimap, and follows the view as it resizes, scrolls or opens and closes the inspector.
 * In RTL that corner is the canvas's bottom-left. Phones use the shared per-instance touch toaster
 * (`MachineToasterHost`, under the view's toolbar) instead.
 *
 * It is portalled to <body>, like the Machine Tree's: offsets are viewport coordinates, and a
 * transformed or `contain`ed ancestor (a shadcn Dialog, an animated card) would otherwise become
 * the containing block of its fixed position and misplace it. The canvas column is never narrower
 * than 768 − 320 px on the desktop shell, so the 356 px toast always fits inside it.
 */
function ViewToaster({ id, direction }: { readonly id: string; readonly direction: Dir }) {
  const [offset, setOffset] = React.useState<{ bottom: number; side: number } | null>(null);
  // The view is found from inside: the shell's own ref is attached only after this child's effects run.
  const anchor = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const el = anchor.current?.closest<HTMLElement>('[data-slot="machine-view"]');
    if (!el) return;
    const measure = () => {
      const view = el.getBoundingClientRect();
      const canvas = el.querySelector<HTMLElement>("[data-mv-column]")?.getBoundingClientRect() ?? view;
      // Clear of the status bar and of React Flow's attribution and minimap in the canvas corner above it.
      const floor = Math.min(
        view.bottom,
        ...["[data-mv-statusbar]", ".react-flow__attribution", ".react-flow__minimap"].map((q) => el.querySelector(q)?.getBoundingClientRect().top ?? Infinity),
      );
      const bottom = Math.round(window.innerHeight - floor + NOTICE_GAP);
      const side = Math.round(direction === "rtl" ? canvas.left + NOTICE_GAP : window.innerWidth - canvas.right + NOTICE_GAP);
      setOffset((old) => (old && old.bottom === bottom && old.side === side ? old : { bottom, side }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The inspector opening or closing resizes the column, not the view.
    const column = el.querySelector("[data-mv-column]");
    if (column) observer.observe(column);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [direction]);
  const rtl = direction === "rtl";
  return (
    <>
      <span ref={anchor} hidden />
      {offset &&
        createPortal(
          <Toaster
            id={id}
            dir={direction}
            position={rtl ? "bottom-left" : "bottom-right"}
            offset={rtl ? { bottom: offset.bottom, left: offset.side } : { bottom: offset.bottom, right: offset.side }}
            // The page's toaster owns the global shortcut; this one is reached like any live region.
            hotkey={[]}
            // The whole label: sonner would append the (empty) hotkey after a space.
            customAriaLabel={NOTICES_LABEL}
          />,
          window.document.body,
        )}
    </>
  );
}
/** The notifications landmark's name, the same on both shells. */
const NOTICES_LABEL = "Machine view notifications";
/** Space between a notice and the status bar or the view's edge. */
const NOTICE_GAP = 8;

/* ───────────────────────────── Error boundary ───────────────────────────── */

class CanvasBoundary extends React.Component<{ readonly children: React.ReactNode; readonly resetKey: string; readonly label?: string }, { readonly error: Error | null; readonly key: string }> {
  state = { error: null as Error | null, key: this.props.resetKey };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  static getDerivedStateFromProps(props: { resetKey: string }, state: { key: string; error: Error | null }) {
    return props.resetKey !== state.key ? { key: props.resetKey, error: null } : null;
  }
  componentDidCatch(error: Error) {
    console.error(`[MachineView] ${this.props.label ?? "canvas"} crashed`, error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center bg-canvas p-6">
        <div className="flex max-w-72 flex-col items-center gap-3 text-center">
          <div className="grid size-9 place-items-center rounded-lg border bg-surface">
            <TriangleAlert className="size-4 text-warning" />
          </div>
          <div>
            <p className="font-medium">The {this.props.label ?? "canvas"} hit a problem</p>
            <p className="mt-1 text-[12px] leading-4 text-muted-foreground">Your document is safe. Reload this view to continue where you left off.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            <RefreshCw /> Reload {this.props.label ?? "canvas"}
          </Button>
        </div>
      </div>
    );
  }
}
