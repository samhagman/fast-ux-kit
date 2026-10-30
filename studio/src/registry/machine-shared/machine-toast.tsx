/**
 * The touch toast, shared by Machine View and Machine Tree: one sentence, at most one action,
 * and a close button, each a 44px target on coarse pointers (sonner's built-in action and close
 * buttons are 24 and 20 px). Shown at the top so it never covers a phone's run controls, peek
 * bar or sheet. `persistent` keeps it until used, closed or replaced. Same `id` replaces in place.
 *
 *   machineToast("mt-reason", "DECIDE blocked — guard approved is false", {
 *     action: { label: 'Try {"approved":true}', onClick: applyFix },
 *     persistent: true,
 *   });
 *
 * `attrs` stamps host markers on the toast's root (the tree marks its portals with
 * `data-mt-portal` so its keyboard shortcuts keep working while focus is inside one).
 *
 * `toasterId` sends the toast to a component's own `<Toaster id>` (sonner's per-toaster routing)
 * instead of the page's: the Machine Tree gives each instance one, offset below its own toolbar.
 * Without it the toast goes to the page's toaster, as before. `useMachineToaster` +
 * `MachineToasterHost` (below) give a component instance that toaster.
 */
import * as React from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { CircleAlert, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface MachineToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

export interface MachineToastOptions {
  readonly action?: MachineToastAction | undefined;
  /** Auto-dismiss after this many ms (default 2600). Ignored when `persistent`. */
  readonly duration?: number;
  readonly persistent?: boolean;
  /** "warning" and "error" add a leading glyph; the sentence carries the meaning. */
  readonly tone?: "default" | "warning" | "error";
  readonly attrs?: Readonly<Record<`data-${string}`, string>>;
  /** Render in the `<Toaster id={toasterId}>` instead of the page's toaster. */
  readonly toasterId?: string | undefined;
}

export function machineToast(id: string, text: string, options: MachineToastOptions = {}) {
  const { action, persistent, tone = "default", attrs, toasterId } = options;
  // Short actions ("Undo") sit inline on the sentence's row; long ones (a JSON payload) wrap to their own row.
  const inlineAction = !!action && action.label.length <= 12;
  toast.custom(
    (toastId) => (
      <div
        {...attrs}
        data-slot="machine-toast"
        data-persistent={persistent || undefined}
        // The sentence gets the full width; the action (often a JSON payload) wraps to its own row
        // instead of truncating beside it.
        className="flex w-[var(--width,356px)] max-w-[calc(100vw-2rem)] flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border bg-popover py-1.5 ps-3 pe-1.5 text-ui text-popover-foreground shadow-lg"
      >
        {tone === "warning" && <TriangleAlert aria-hidden className="size-3.5 shrink-0 text-warning" />}
        {tone === "error" && <CircleAlert aria-hidden className="size-3.5 shrink-0 text-destructive" />}
        <p dir="auto" className={cn("min-w-0 flex-1 py-1 leading-[18px]", action && !inlineAction && "basis-[calc(100%-3.25rem)]")}>
          {text}
        </p>
        {action && (
          <Button
            size="sm"
            variant="outline"
            className={cn("max-w-full min-w-0 font-mono text-[11px] coarse:h-11 coarse:px-3", inlineAction ? "shrink-0" : "order-last me-auto")}
            onClick={() => {
              toast.dismiss(toastId);
              action.onClick();
            }}
          >
            <span className="truncate">{action.label}</span>
          </Button>
        )}
        {(persistent || action) && (
          <Button variant="ghost" size="icon-sm" aria-label="Dismiss" className="shrink-0 text-muted-foreground coarse:size-11" onClick={() => toast.dismiss(toastId)}>
            <X />
          </Button>
        )}
      </div>
    ),
    { id, position: "top-center", duration: persistent ? Infinity : (options.duration ?? 2600), ...(toasterId ? { toasterId } : {}) },
  );
}

export const dismissMachineToast = (id: string) => toast.dismiss(id);

/** One component instance's toasts: the shared `machineToast`, routed to that instance's own toaster. */
export interface MachineToaster {
  readonly show: (id: string, text: string, options?: Omit<MachineToastOptions, "attrs" | "toasterId">) => void;
  readonly dismiss: (id: string) => void;
}

/** What `MachineToasterHost` renders, plus how much of the instance a persistent toast covers. */
export interface MachineToasterHostState {
  readonly id: string;
  /** Viewport offset of the toaster's top edge (below the instance's toolbar). */
  readonly top: number | undefined;
  /**
   * Pixels below the toolbar's bottom edge that a PERSISTENT toast of this instance covers (toast
   * bottom plus a gap), 0 while none is up. A host keeps what matters clear of it (the tree
   * scrolls its live card below this band); short-lived toasts leave nothing to keep clear.
   */
  readonly covered: number;
}

/**
 * A per-instance toaster, shared by Machine View (phone shell) and Machine Tree. The instance
 * renders its own sonner `<Toaster id>` (`MachineToasterHost`) offset below its own toolbar
 * (`toolbar`, a selector inside `rootRef`), so the toolbar stays reachable under a persistent toast
 * and nothing lands on the host page's own header. Nothing is written to the page: two
 * instances, and the page's toaster, never move each other. Toast ids are namespaced per instance.
 *
 * The toaster is `position: fixed`, so the offset is a viewport coordinate: measured when a toast
 * is shown, clamped to the viewport (a toolbar scrolled away or below the fold still gets a
 * visible toast), and re-measured (once per frame at most) on scroll, resize and toast mount for
 * as long as one of this instance's toasts is up. Nothing listens while none is.
 */
export function useMachineToaster(
  rootRef: React.RefObject<HTMLElement | null>,
  { toolbar, attrs }: { readonly toolbar: string; readonly attrs?: Readonly<Record<`data-${string}`, string>> },
): { readonly toast: MachineToaster; readonly host: MachineToasterHostState } {
  const id = React.useId();
  const [top, setTop] = React.useState<number | undefined>(undefined);
  const [covered, setCovered] = React.useState(0);
  /** Stops the scroll / resize / mount tracking; set while it runs. */
  const untrack = React.useRef<(() => void) | null>(null);
  React.useEffect(() => () => untrack.current?.(), []);
  const attrsRef = React.useRef(attrs);
  attrsRef.current = attrs;
  const toaster = React.useMemo<MachineToaster>(() => {
    const ours = () => toast.getToasts().some((t) => String(t.id).startsWith(id));
    const measure = () => {
      const bar = rootRef.current?.querySelector(toolbar)?.getBoundingClientRect();
      if (!bar) {
        setTop(undefined);
        return setCovered(0);
      }
      // Room for one toast (and its action row) below the offset; never above the viewport's top.
      const next = Math.round(Math.max(8, Math.min(bar.bottom + 8, window.innerHeight - TOAST_ROOM)));
      setTop(next);
      // Layout heights, not rects: a toast still sliding in reports its final size.
      const persistent = [...window.document.querySelectorAll<HTMLElement>(`[data-machine-toast-owner="${id}"][data-persistent]`)];
      const height = ours() ? Math.max(0, ...persistent.map((el) => el.offsetHeight)) : 0;
      setCovered(height ? Math.max(0, Math.round(next + height + 8 - bar.bottom)) : 0);
    };
    const track = () => {
      if (untrack.current) return;
      let frame = 0;
      const tick = () => {
        frame = 0;
        if (!ours()) {
          setCovered(0);
          return untrack.current?.();
        }
        measure();
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(tick);
      };
      // Capture: any scroller between the page and the instance moves the toolbar, not just the window.
      window.addEventListener("scroll", schedule, { capture: true, passive: true });
      window.addEventListener("resize", schedule);
      // The host's own layout (a panel opening above the instance) moves it without a scroll or resize.
      const observer = new ResizeObserver(schedule);
      observer.observe(window.document.documentElement);
      if (rootRef.current) observer.observe(rootRef.current);
      // A toast mounting, being replaced or leaving changes what is covered.
      const mutations = new MutationObserver(schedule);
      mutations.observe(window.document.body, { childList: true, subtree: true });
      schedule();
      untrack.current = () => {
        cancelAnimationFrame(frame);
        window.removeEventListener("scroll", schedule, { capture: true });
        window.removeEventListener("resize", schedule);
        observer.disconnect();
        mutations.disconnect();
        untrack.current = null;
      };
    };
    return {
      show(toastId, text, options = {}) {
        measure();
        machineToast(`${id}${toastId}`, text, { ...options, toasterId: id, attrs: { ...attrsRef.current, "data-machine-toast-owner": id } });
        track();
      },
      dismiss: (toastId) => dismissMachineToast(`${id}${toastId}`),
    };
  }, [id, rootRef, toolbar]);
  return React.useMemo(() => ({ toast: toaster, host: { id, top, covered } }), [toaster, id, top, covered]);
}

/** Viewport height kept free below a toast's top edge: one toast with an action row. */
const TOAST_ROOM = 120;

/** The instance's own toaster, portalled to <body> so a transformed host can't trap its fixed position. */
export function MachineToasterHost({ id, top, dir, label }: { readonly id: string; readonly top: number | undefined; readonly dir: "ltr" | "rtl"; readonly label: string }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  const offset = top === undefined ? undefined : { top };
  // No hotkey of its own: alt+T stays the page toaster's. `customAriaLabel`: sonner otherwise
  // appends the (empty) hotkey to the region's name, leaving a trailing space.
  return createPortal(<Toaster id={id} position="top-center" dir={dir} hotkey={[]} customAriaLabel={label} offset={offset} mobileOffset={offset} />, window.document.body);
}
