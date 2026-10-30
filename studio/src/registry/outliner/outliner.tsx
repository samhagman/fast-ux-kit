import * as React from "react";
import "./outliner.css";
import { AnimatePresence, LayoutGroup, MotionConfig, motion, useAnimate, useMotionValue, useTransform, animate as animateValue, type PanInfo } from "motion/react";
import {
  CalendarDays,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  Command,
  CornerDownRight,
  CornerUpLeft,
  FileDown,
  FileUp,
  Home,
  Keyboard,
  ListTree,
  Ban,
  Lock,
  MoreHorizontal,
  Plus,
  Redo2,
  Repeat2,
  Star,
  Search,
  StickyNote,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createOutlineId, findOutlineNode, getOutlinePath, planOutlineDrop } from "@fux/core";
import { useVirtualizer } from "@tanstack/react-virtual";
import { textareaAtVisualBoundary, textareaCaretRect } from "@fux/text-geometry";
import { cn } from "@/lib/utils";
import { DirectionScope, useResolvedDirection, type Dir } from "@/lib/direction";
import { useMediaQuery } from "@/hooks/use-media-query";
import { motionTokens } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { InlineText, inlineToLabel, inlineToPlain, inlineToSpeech, sourceOffsetFromPoint } from "./inline";
import { AutocompletePopover, useAutocomplete } from "./autocomplete";
import { OutlinerContext, useOutlinerContext, usePlatformKeys, type OutlinerUi, type PaletteMode, type ActionSheetRequest } from "./context";
import type { OutlinerController } from "./use-outliner";
import { useOutliner, type OutlinerRow, type ToggleSummary, type UseOutlinerOptions } from "./use-outliner";
import { COLOR_STYLES, type OutlineExportFormat, type OutlineItem } from "./types";
import { resolveLabels, type OutlinerLabels } from "./labels";
import { mirrorOf } from "./mirrors";
import { htmlHasStructure } from "./interchange";
import { searchSuggestions } from "./search-filters";
import {
  ItemMenuContent,
  OutlinerActionSheet,
  OutlinerBookmarksMenu,
  OutlinerBulkBar,
  OutlinerCommandPalette,
  OutlinerDatePicker,
  OutlinerMobileBar,
  OutlinerShortcuts,
  deleteItems,
} from "./outliner-chrome";

export interface OutlinerProps extends UseOutlinerOptions {
  /** Zoomed item (controlled). Pair with onHoistChange to sync zoom with the URL. */
  readonly hoistedId?: string | null;
  readonly onHoistChange?: (id: string | null) => void;
  /** Document title shown when no item is zoomed. */
  readonly title?: string;
  readonly className?: string;
  /** Show the header toolbar (breadcrumbs, search, view and document menus). */
  readonly toolbar?: boolean;
  readonly placeholder?: string;
  /** Writing direction. Defaults to the direction inherited from the page. */
  readonly dir?: Dir;
  /** User-facing strings (toolbar, menus, toasts, announcements). Pass only what you change. */
  readonly labels?: Partial<OutlinerLabels>;
  /** Imperative handle (React 19 ref-as-prop; same contract forwardRef gave). */
  readonly ref?: React.Ref<OutlinerHandle>;
}

/** What a host can do from outside: `const ref = useRef<OutlinerHandle>(null)`. */
export interface OutlinerHandle {
  /** Focus the tree (keyboard selection mode). */
  focus(): void;
  /** Reveal (unfold, zoom out if needed), select and scroll to an item; `edit` puts the caret in it. */
  focusItem(id: string, options?: { readonly edit?: boolean }): boolean;
  /** Zoom into an item (null: the document root). */
  zoomTo(id: string | null): void;
  /** The current document, including edits a controlled host has not echoed yet. */
  getValue(): readonly OutlineItem[];
  undo(): void;
  redo(): void;
  /** Set the search query (opens the field); "" clears it. */
  search(query: string): void;
  exportAs(format: OutlineExportFormat): string;
}

/** Indentation per level comes from --ol-indent (22px, 16px on narrow screens). */
const indentPx = (el?: Element | null) =>
  parseFloat(getComputedStyle(el ?? document.documentElement).getPropertyValue("--ol-indent")) || 22;

export function Outliner({ title = "Untitled", className, toolbar = true, placeholder, hoistedId, onHoistChange, dir, labels: labelOverrides, ref, ...options }: OutlinerProps) {
  const ol = useOutliner(options);
  // Zoom is reader state the host may own (e.g. ?zoom= in the URL for Back/Forward).
  const reported = React.useRef(ol.state.hoistedId);
  React.useEffect(() => {
    if (hoistedId !== undefined && hoistedId !== ol.state.hoistedId && hoistedId !== reported.current) {
      reported.current = hoistedId;
      ol.dispatch({ type: "hoist", id: hoistedId });
    }
  }, [hoistedId, ol]);
  React.useEffect(() => {
    if (ol.state.hoistedId !== reported.current) {
      reported.current = ol.state.hoistedId;
      onHoistChange?.(ol.state.hoistedId);
    }
  }, [ol.state.hoistedId, onHoistChange]);
  const [editing, setEditing] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [paletteMode, setPaletteMode] = React.useState<PaletteMode>("all");
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false);
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [datePicker, setDatePicker] = React.useState<OutlinerUi["datePicker"]>(null);
  const [sheet, setSheet] = React.useState<ActionSheetRequest | null>(null);
  /** Moving end of a keyboard range selection (the anchor stays put). */
  const [head, setHead] = React.useState<string | null>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const direction = useResolvedDirection(rootRef, dir);
  const searchHelpId = React.useId();
  const labels = React.useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);
  const live = React.useRef({ ol, labels });
  live.current = { ol, labels };

  /*
   * an Undo offer is bound to the history entry it was made at. Any undo, redo or new edit
   * replaces that entry; the toast is dismissed then, and a stale click does nothing.
   */
  const undoOffer = React.useRef<{ readonly id: string | number; readonly entry: unknown } | null>(null);
  const offerUndo = React.useCallback((text: string, opts?: { readonly sticky?: boolean }) => {
    const { ol } = live.current;
    const entry = ol.historyTop();
    if (!entry) return;
    if (undoOffer.current) toast.dismiss(undoOffer.current.id);
    const id = toast(text, {
      duration: opts?.sticky ? Infinity : 5000,
      closeButton: opts?.sticky,
      action: {
        label: live.current.labels.undoAction,
        onClick: () => {
          if (live.current.ol.historyTop() === entry) live.current.ol.dispatch({ type: "undo" });
        },
      },
      onDismiss: () => {
        if (undoOffer.current?.id === id) undoOffer.current = null;
      },
    });
    undoOffer.current = { id, entry };
  }, []);
  const historyTop = ol.state.history.past.at(-1);
  React.useEffect(() => {
    const offer = undoOffer.current;
    if (offer && offer.entry !== live.current.ol.historyTop()) {
      toast.dismiss(offer.id);
      undoOffer.current = null;
    }
  }, [historyTop, ol.state.history.future]);

  const scroller = React.useRef<((id: string, align: "auto" | "center") => boolean) | null>(null);
  const scrollToRow = React.useCallback((id: string, align: "auto" | "center" = "auto") => {
    if (scroller.current?.(id, align)) return;
    const el = listRef.current?.querySelector(`[data-row="${CSS.escape(id)}"]`);
    el?.scrollIntoView({ block: align === "center" ? "center" : "nearest" });
  }, []);
  const registerScroller = React.useCallback((scroll: ((id: string, align: "auto" | "center") => boolean) | null) => {
    scroller.current = scroll;
  }, []);
  /**
   * every overlay (menus, sheet, date picker, palette, dialogs) closes back to the tree,
   * never to <body>, unless the action it ran moved focus somewhere on purpose (a field).
   */
  const returnFocus = React.useCallback((event: Event | null, selectId?: string | null) => {
    // Touch has no keyboard cursor: focusing the tree would select a row and drop the phone into
    // selection mode. Let the overlay hand focus back to its own trigger instead (never <body>).
    if (!selectId && event && window.matchMedia?.("(pointer: coarse)").matches) {
      requestAnimationFrame(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        // No trigger to go back to (a dialog opened from a menu): the cursor row's ⋯, else the toolbar.
        const root = rootRef.current;
        const anchor = live.current.ol.state.selectionAnchor;
        const target =
          (anchor && root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(anchor)}"] [data-row-actions]`)) ||
          root?.querySelector<HTMLElement>("[data-slot=outliner] > div button:not(:disabled)");
        target?.focus({ preventScroll: true });
      });
      return;
    }
    event?.preventDefault();
    const before = document.activeElement;
    requestAnimationFrame(() => {
      const active = document.activeElement;
      const lost = !active || active === document.body || active === before || !!active.closest("[data-slot$=menu-trigger],[data-slot=drawer-content],[data-slot=popover-content]");
      if (!lost && rootRef.current?.contains(active)) return;
      if (!lost && active !== listRef.current) return;
      const { ol } = live.current;
      if (selectId && ol.rows.some((row) => row.id === selectId) && !ol.state.selection.has(selectId)) ol.dispatch({ type: "select", id: selectId });
      listRef.current?.focus({ preventScroll: true });
      if (selectId) scrollToRow(selectId);
    });
  }, [scrollToRow]);
  // A repeated sentence ("Indented" twice) must be read again: alternate a no-break space so the
  // live region's text actually changes.
  const announce = React.useCallback((text: string) => setMessage((prev) => (prev === text ? `${text}\u00a0` : text)), []);
  const announceToggle = React.useCallback((summary: ToggleSummary) => {
    const { labels } = live.current;
    if (summary.advanced.length) {
      const next = summary.advanced[0]!.next;
      const text = labels.nextOccurrence(next.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }));
      announce(text);
      offerUndo(text);
    } else announce(summary.completed ? labels.markedComplete : labels.markedIncomplete);
  }, [offerUndo]);

  const ui = React.useMemo<OutlinerUi>(
    () => ({
      editing,
      setEditing,
      paletteOpen,
      setPaletteOpen,
      paletteMode,
      setPaletteMode,
      shortcutsOpen,
      setShortcutsOpen,
      searchOpen,
      setSearchOpen,
      listRef,
      rootRef,
      focusList: () => listRef.current?.focus({ preventScroll: true }),
      announce,
      datePicker,
      setDatePicker,
      head,
      setHead,
      searchHelpId,
      labels,
      offerUndo,
      scrollToRow,
      registerScroller,
      sheet,
      setSheet,
      returnFocus,
      announceToggle,
    }),
    [editing, paletteOpen, paletteMode, shortcutsOpen, searchOpen, datePicker, head, searchHelpId, labels, offerUndo, scrollToRow, registerScroller, sheet, returnFocus, announceToggle],
  );

  React.useImperativeHandle(
    ref,
    (): OutlinerHandle => ({
      focus: () => listRef.current?.focus({ preventScroll: true }),
      focusItem: (id, opts) => {
        const { ol } = live.current;
        const path = getOutlinePath(ol.latestNodes(), id);
        if (!path.length) return false;
        if (ol.state.hoistedId && !path.some((node) => node.id === ol.state.hoistedId)) ol.dispatch({ type: "hoist", id: null });
        ol.dispatch({ type: "reveal", id });
        if (opts?.edit && !ol.readOnly) {
          ol.dispatch({ type: "focus", id, start: path.at(-1)!.text.length });
          setEditing(true);
        } else {
          ol.dispatch({ type: "select", id });
          setEditing(false);
          requestAnimationFrame(() => listRef.current?.focus({ preventScroll: true }));
        }
        requestAnimationFrame(() => scrollToRow(id, "center"));
        return true;
      },
      zoomTo: (id) => live.current.ol.dispatch({ type: "hoist", id }),
      getValue: () => live.current.ol.latestNodes(),
      undo: () => live.current.ol.dispatch({ type: "undo" }),
      redo: () => live.current.ol.dispatch({ type: "redo" }),
      search: (query) => {
        live.current.ol.setView((view) => ({ ...view, query }));
        setSearchOpen(!!query);
      },
      exportAs: (format) => live.current.ol.commands.exportAs(format),
    }),
    [scrollToRow],
  );

  // Surface refusals (locked, read-only) as a quiet toast rather than a silent no-op.
  const refusal = ol.state.refusal;
  React.useEffect(() => {
    if (!refusal) return;
    const text =
      refusal === "locked"
        ? labels.locked
        : refusal === "read-only"
          ? labels.readOnly
          : refusal === "descendant-move"
            ? labels.cannotMoveInside
            : null;
    if (text) toast(text, { id: "outliner-refusal", icon: <Lock className="size-3.5" /> });
  }, [refusal, ol.state]);

  // a controlled host's veto is never silent: one deduplicated notice, also announced.
  const rejection = ol.rejection;
  React.useEffect(() => {
    if (!rejection) return;
    const text = labels.changeRejected(rejection.count);
    announce(text);
    toast(text, { id: "outliner-veto", icon: <Ban className="size-3.5" /> });
  }, [rejection, labels]);

  // ⌘K / ⌘F / ⌘/ also work when focus has fallen back to <body> (after a dialog, Back, etc).
  const lastActive = React.useRef(false);
  React.useEffect(() => {
    const onPointer = (event: Event) => {
      // Dialogs portal outside the root; they don't count as leaving the outliner.
      const target = event.target as Element | null;
      if (target?.closest?.("[role=dialog]")) return;
      lastActive.current = !!rootRef.current?.contains(target);
    };
    const onKey = (event: KeyboardEvent) => {
      if (document.activeElement !== document.body || !lastActive.current) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key.toLowerCase();
      if (mod && (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey))) {
        // Focus fell back to <body> after something inside the outliner: undo still works.
        event.preventDefault();
        live.current.ol.dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
      } else if (mod && (key === "k" || key === "f" || key === "/")) {
        event.preventDefault();
        if (key === "k") {
          setPaletteMode("all");
          setPaletteOpen(true);
        } else if (key === "f") setSearchOpen(true);
        else setShortcutsOpen(true);
      } else if (!mod && (key === "arrowdown" || key === "arrowup" || key === "j" || key === "k")) {
        listRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("focusin", onPointer, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("focusin", onPointer, true);
      document.removeEventListener("keydown", onKey);
    };
  }, []);
  // Closing a dialog returns focus to the document (unless something else took it).
  const overlayOpen = paletteOpen || shortcutsOpen;
  // The selection a dialog was opened over comes back when it closes (if nothing replaced it).
  const savedSelection = React.useRef<readonly string[]>([]);
  React.useEffect(() => {
    if (overlayOpen) {
      savedSelection.current = [...ol.state.selection];
      return;
    }
    const saved = savedSelection.current;
    if (saved.length && !ol.state.selection.size && !editing && saved.every((id) => ol.rows.some((row) => row.id === id))) {
      ol.dispatch({ type: "select", id: saved[0]! });
      for (const id of saved.slice(1)) ol.dispatch({ type: "select", id, toggle: true });
    }
    savedSelection.current = [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlayOpen]);
  React.useEffect(() => {
    if (overlayOpen) return;
    const id = requestAnimationFrame(() => {
      if (document.activeElement === document.body && lastActive.current) listRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [overlayOpen]);

  // Global document shortcuts while focus is anywhere inside the outliner.
  const onRootKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();
    const target = event.target as HTMLElement;
    // Safety valve: "editing" with no editor mounted (it never appeared) must not trap the keyboard.
    if (key === "escape" && editing && target.tagName !== "TEXTAREA" && !target.closest("[role=dialog]")) {
      setEditing(false);
      return;
    }
    if (mod && (key === "z" || (key === "y" && event.ctrlKey && !event.metaKey)) && !event.defaultPrevented) {
      // ⌘Z / ⇧⌘Z from anywhere in the outliner (zoomed-title checkbox, toolbar, crumbs). Row
      // fields and the tree handle their own; native inputs (search, palette) keep native undo.
      if (target.tagName === "INPUT" || (target.isContentEditable ?? false)) return;
      event.preventDefault();
      ol.dispatch({ type: key === "y" || event.shiftKey ? "redo" : "undo" });
    } else if (mod && key === "k") {
      event.preventDefault();
      setPaletteMode("all");
      setPaletteOpen(true);
    } else if (mod && key === "f") {
      event.preventDefault();
      setSearchOpen(true);
    } else if (mod && key === "/") {
      event.preventDefault();
      setShortcutsOpen(true);
    } else if (mod && event.shiftKey && key === "m") {
      event.preventDefault();
      setPaletteMode("move");
      setPaletteOpen(true);
    }
  };

  return (
    <OutlinerContext.Provider value={{ ol, ui }}>
      <DirectionScope dir={direction}>
      <MotionConfig reducedMotion="user">
      <div
        ref={rootRef}
        dir={dir}
        onKeyDown={onRootKeyDown}
        onBlur={() => {
          // Field swaps (title ⇄ note, row → row) unmount the focused textarea, which blurs
          // with no relatedTarget. Decide after the swap settles, from the real active element.
          requestAnimationFrame(() => {
            const active = document.activeElement;
            if (!rootRef.current?.contains(active) || active?.tagName !== "TEXTAREA") setEditing(false);
          });
        }}
        data-slot="outliner"
        className={cn(
          "group/outliner relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-surface text-ui text-foreground [--ol-indent:22px] max-sm:[--ol-indent:16px]",
          className,
        )}
      >
        {toolbar && <OutlinerHeader title={title} />}
        <SearchHelp />
        <OutlinerErrorBoundary>
          <OutlinerBody title={title} placeholder={placeholder} />
        </OutlinerErrorBoundary>
        <OutlinerStatusBar />
        <OutlinerBulkBar />
        <OutlinerMobileBar />
        <OutlinerCommandPalette />
        <OutlinerShortcuts />
        <OutlinerDatePicker />
        <OutlinerActionSheet />
        <div aria-live="polite" className="sr-only">
          {message}
        </div>
      </div>
      </MotionConfig>
      </DirectionScope>
    </OutlinerContext.Provider>
  );
}

/** A render fault in the document shows a calm recovery panel instead of a white screen. */
class OutlinerErrorBoundary extends React.Component<{ readonly children: React.ReactNode }, { readonly error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="grid flex-1 place-items-center p-8">
        <div className="max-w-sm text-center">
          <p className="font-medium">This view hit a problem.</p>
          <p className="mt-1 text-[12px] text-muted-foreground">Your document is unchanged. Re-render the view to continue.</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Re-render
          </Button>
        </div>
      </div>
    );
  }
}

/* ───────────────────────────── Header ───────────────────────────── */

function OutlinerHeader({ title }: { readonly title: string }) {
  const { isMac, modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const crumbs = ol.breadcrumbs;
  // on a phone an open search takes the whole toolbar row (crumbs and menus step aside).
  const narrow = useMediaQuery("(max-width: 639px)");
  const phoneSearch = narrow && (ui.searchOpen || !!ol.view.query);
  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline px-2">
      <nav aria-label="Breadcrumb" className={cn("flex min-w-0 flex-1 items-center", phoneSearch && "hidden")}>
        <AnimatePresence initial={false}>
          {crumbs.length > 0 && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: "auto" }}
              exit={{ opacity: 0, width: 0 }}
              transition={motionTokens.quick}
              className="shrink-0 overflow-hidden"
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={L.zoomOut}
                    onClick={() => ol.dispatch({ type: "hoist", id: crumbs.at(-2)?.id ?? null })}
                  >
                    <CornerUpLeft />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {L.zoomOut} <Kbd dir="ltr">{modKey}[</Kbd>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
        <ol className="flex min-w-0 items-center gap-0.5 text-ui">
          <li className="flex min-w-0 items-center">
            <button
              type="button"
              onClick={() => ol.dispatch({ type: "hoist", id: null })}
              className={cn(
                "flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 transition-colors hover:bg-muted",
                crumbs.length ? "text-muted-foreground hover:text-foreground" : "font-medium",
              )}
            >
              <Home className="size-3.5 shrink-0 opacity-70" />
              <span className="truncate max-sm:sr-only">{title}</span>
            </button>
          </li>
          <AnimatePresence initial={false}>
            {crumbs.map((node, index) => {
              const last = index === crumbs.length - 1;
              // Collapse the middle of long paths on narrow screens.
              const middle = index > 0 && index < crumbs.length - 1;
              return (
                <motion.li
                  key={node.id}
                  layout="position"
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={motionTokens.quick}
                  className={cn("flex min-w-0 items-center", middle && "max-md:hidden")}
                >
                  <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60 rtl:rotate-180" />
                  <button
                    type="button"
                    aria-current={last ? "page" : undefined}
                    onClick={() => ol.dispatch({ type: "hoist", id: node.id })}
                    className={cn(
                      "h-7 max-w-48 truncate rounded-md px-1.5 transition-colors hover:bg-muted",
                      last ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {inlineToPlain(node.text) || "Untitled"}
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ol>
      </nav>
      <OutlinerSearchField wide={phoneSearch} />
      <div className={cn("flex items-center gap-0.5", phoneSearch && "hidden")}>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={L.undo}
              disabled={!ol.canUndo || ol.readOnly}
              onClick={() => ol.dispatch({ type: "undo" })}
              className="max-sm:hidden"
            >
              <Undo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {L.undo} <Kbd dir="ltr">{modKey}Z</Kbd>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={L.redo}
              disabled={!ol.canRedo || ol.readOnly}
              onClick={() => ol.dispatch({ type: "redo" })}
              className="max-sm:hidden"
            >
              <Redo2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {L.redo} <Kbd dir="ltr">{isMac ? "⇧⌘Z" : "Ctrl Y"}</Kbd>
          </TooltipContent>
        </Tooltip>
        <OutlinerBookmarksMenu />
        <ViewMenu />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="ms-1 gap-1.5 px-2 text-muted-foreground max-sm:hidden"
              onClick={() => {
                ui.setPaletteMode("all");
                ui.setPaletteOpen(true);
              }}
            >
              <span className="text-ui">{L.commands}</span>
              <Kbd dir="ltr" className="h-4 px-1 font-sans text-[10.5px]">{modKey}K</Kbd>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Commands &amp; jump to item</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

function OutlinerSearchField({ wide = false }: { readonly wide?: boolean }) {
  const { modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const input = React.useRef<HTMLInputElement>(null);
  const open = ui.searchOpen || !!ol.view.query;
  React.useEffect(() => {
    if (ui.searchOpen) input.current?.focus();
  }, [ui.searchOpen]);
  // A half-typed operator ("due:") is unfinished, not wrong: the help strip offers completions.
  const completing = React.useMemo(() => searchSuggestions(ol.view.query).length > 0, [ol.view.query]);
  const diagnostics = completing ? [] : (ol.search?.diagnostics ?? []);
  const count = ol.search?.matchedIds.length ?? 0;
  const dated = /(?:^|\s)-?(?:due|before|after):|has:dates?\b/i.test(ol.view.query);
  const setMode = (mode: "filter" | "flat" | "agenda") =>
    ol.setView((view) => ({ ...view, searchMode: view.searchMode === mode ? "filter" : mode }));
  const iconButton =
    "relative me-0.5 grid size-6 shrink-0 place-items-center rounded-[5px] after:absolute coarse:size-8 coarse:after:-inset-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";
  return (
    <div className={cn("flex items-center", wide && "min-w-0 flex-1")}>
      <AnimatePresence initial={false} mode="popLayout">
        {open ? (
          <motion.div
            key="field"
            initial={{ opacity: 0, width: 32 }}
            animate={{ opacity: 1, width: wide ? "100%" : "var(--search-w)" }}
            exit={{ opacity: 0, width: 32 }}
            transition={motionTokens.base}
            className="relative flex h-8 items-center overflow-hidden rounded-md border bg-background [--search-w:min(18rem,46vw)] focus-within:border-signal/60 focus-within:ring-3 focus-within:ring-signal/15 coarse:h-10"
          >
            <Search className="ms-2 size-3.5 shrink-0 text-muted-foreground" />
            <input
              ref={input}
              value={ol.view.query}
              aria-label={L.searchOutline}
              aria-invalid={diagnostics.length > 0}
              aria-describedby={ui.searchHelpId}
              placeholder={L.searchPlaceholder}
              dir="auto"
              onChange={(event) => ol.setView((view) => ({ ...view, query: event.target.value }))}
              onKeyDown={(event) => {
                const completion = event.key === "Tab" && !event.shiftKey ? searchSuggestions(ol.view.query)[0] : undefined;
                if (completion) {
                  // Tab completes the operator or value being typed (shown in the help strip).
                  event.preventDefault();
                  ol.setView((view) => ({ ...view, query: completion.query }));
                } else if (event.key === "Escape") {
                  event.stopPropagation();
                  ol.setView((view) => ({ ...view, query: "" }));
                  ui.setSearchOpen(false);
                  ui.focusList();
                } else if (event.key === "Enter" && event.shiftKey) {
                  event.preventDefault();
                  setMode("flat");
                } else if (event.key === "ArrowDown" || event.key === "Enter") {
                  event.preventDefault();
                  const first = ol.rows.find((row) => !row.context);
                  if (first) ol.dispatch({ type: "select", id: first.id });
                  ui.focusList();
                }
              }}
              className="h-full min-w-0 flex-1 bg-transparent px-2 text-ui outline-none placeholder:text-muted-foreground/70 coarse:text-[16px]"
            />
            {ol.view.query && (
              <span
                aria-live="off"
                className={cn(
                  "me-1 shrink-0 font-mono text-[11px] tabular-nums",
                  diagnostics.length ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {completing ? <span className="font-sans text-ui text-muted-foreground/80">…</span> : diagnostics.length ? "invalid" : `${count}${ol.search?.truncated ? "+" : ""}`}
              </span>
            )}
            {dated && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-pressed={ol.view.searchMode === "agenda"}
                    aria-label={L.agenda}
                    onClick={() => setMode("agenda")}
                    className={cn(iconButton, ol.view.searchMode === "agenda" && "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal")}
                  >
                    <CalendarDays className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{L.agenda}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-pressed={ol.view.searchMode === "flat"}
                  aria-label={L.flatResults}
                  onClick={() => setMode("flat")}
                  className={cn(iconButton, ol.view.searchMode === "flat" && "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal")}
                >
                  <ListTree className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {ol.view.searchMode === "flat" ? L.showInOutline : L.flatResults} <Kbd dir="ltr">⇧↵</Kbd>
              </TooltipContent>
            </Tooltip>
            <button
              type="button"
              aria-label={L.closeSearch}
              onClick={() => {
                ol.setView((view) => ({ ...view, query: "" }));
                ui.setSearchOpen(false);
              }}
              className={cn(iconButton, "me-1")}
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        ) : (
          <motion.div key="button" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={L.search} onClick={() => ui.setSearchOpen(true)}>
                  <Search />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {L.search} <Kbd dir="ltr">{modKey}F</Kbd>
              </TooltipContent>
            </Tooltip>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ViewMenu() {
  const { isMac, modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const fileInput = React.useRef<HTMLInputElement>(null);
  const download = (format: "markdown" | "opml" | "json") => {
    const text = ol.commands.exportAs(format);
    const blob = new Blob([text], { type: format === "opml" ? "text/x-opml" : "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `outline.${format === "markdown" ? "md" : format}`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <>
      <input
        ref={fileInput}
        type="file"
        accept=".opml,.xml,.md,.txt,.json"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          if (!file) return;
          const count = ol.commands.importText(await file.text(), ol.rows.at(-1)?.id);
          toast.success(`Imported ${count} item${count === 1 ? "" : "s"}`);
          event.target.value = "";
        }}
      />
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={ui.labels.viewOptions}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>View &amp; document</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60" onCloseAutoFocus={(event) => ui.returnFocus(event)}>
          {/* a phone has no ⌘K and no room for the Commands button: the palette (jump to
              item, move to, every action) opens from here. */}
          <DropdownMenuItem
            className="sm:hidden"
            onSelect={() => {
              ui.setPaletteMode("all");
              ui.setPaletteOpen(true);
            }}
          >
            <Command /> {ui.labels.commands}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="sm:hidden" />
          <DropdownMenuLabel className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">View</DropdownMenuLabel>
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => ol.dispatch({ type: "expand-all", expanded: true })}>
              <ChevronsUpDown /> Expand all
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ol.dispatch({ type: "expand-all", expanded: false })}>
              <ChevronsDownUp /> Collapse all
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <ListTree /> Expand to level
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {[1, 2, 3].map((depth) => (
                  <DropdownMenuItem
                    key={depth}
                    onSelect={() => {
                      ol.dispatch({ type: "expand-all", expanded: false });
                      ol.dispatch({ type: "expand-all", expanded: true, depth });
                    }}
                  >
                    Level {depth}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuCheckboxItem
              checked={ol.view.hideCompleted}
              onCheckedChange={(hideCompleted) => ol.setView((view) => ({ ...view, hideCompleted }))}
            >
              Hide completed
              <DropdownMenuShortcut>{isMac ? "⌥⌘H" : "Ctrl Alt H"}</DropdownMenuShortcut>
            </DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <StickyNote /> Notes
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup
                  value={ol.view.noteDisplay}
                  onValueChange={(value) =>
                    ol.setView((view) => ({ ...view, noteDisplay: value as typeof view.noteDisplay }))
                  }
                >
                  <DropdownMenuRadioItem value="show">Show full notes</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="first-line">First line only</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hide">Hide notes</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Document</DropdownMenuLabel>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FileDown /> Export
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onSelect={async () => {
                  await navigator.clipboard.writeText(ol.commands.exportAs("markdown"));
                  toast.success("Copied as Markdown");
                }}
              >
                Copy as Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download("markdown")}>Download .md</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download("opml")}>Download .opml</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => download("json")}>Download .json</DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuItem disabled={ol.readOnly} onSelect={() => fileInput.current?.click()}>
            <FileUp /> {ui.labels.importFile}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => ui.setShortcutsOpen(true)}>
            <Keyboard /> Keyboard shortcuts
            <DropdownMenuShortcut>{modKey}/</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}

/* ───────────────────────────── Body / list ───────────────────────────── */

function OutlinerBody({ title, placeholder }: { readonly title: string; readonly placeholder?: string }) {
  const { ol, ui } = useOutlinerContext();
  const drag = useRowDrag();
  const hoisted = ol.hoisted;
  const selection = ol.state.selection;
  const caretId = ui.editing ? ol.state.caret?.id : undefined;
  // The cursor row's parent guide lights up (the chain of guides the cursor sits on).
  const litParents = React.useMemo(() => {
    const cursor = caretId ?? ol.state.selectionAnchor;
    const chain = new Set<string>();
    if (!cursor) return chain;
    const byId = (id: string) => ol.rows[ol.rowIndex.get(id) ?? -1];
    for (let row = byId(cursor); row?.parentId; row = byId(row.parentId)) chain.add(row.parentId);
    return chain;
  }, [caretId, ol.state.selectionAnchor, ol.rows, ol.rowIndex]);
  // A row's guides light from its parent upward while that ancestor is on the cursor's path.
  const rowIndex = ol.rowIndex;
  const rowById = { get: (id: string) => ol.rows[rowIndex.get(id) ?? -1] };
  const litLevelsFor = (row: OutlinerRow) => {
    let lit = 0;
    for (let parent = row.parentId; parent && litParents.has(parent); parent = rowById.get(parent)?.parentId ?? null) lit++;
    return lit;
  };
  const coarse = useMediaQuery("(pointer: coarse)");
  const selecting = coarse && !ui.editing && selection.size > 0;
  const animateLayout = ol.rows.length <= 160;
  // a veto's rollback paints in ONE step: rows it removes leave at once, not over 200 ms.
  const lastRejection = React.useRef(ol.rejection);
  const rollback = lastRejection.current !== ol.rejection;
  React.useEffect(() => {
    lastRejection.current = ol.rejection;
  });
  const anchor = !ui.editing ? ol.state.selectionAnchor : null;
  const cursorId = !ui.editing ? (ui.head && selection.has(ui.head) ? ui.head : anchor) : null;
  React.useEffect(() => {
    if (ui.head && selection.size && !selection.has(ui.head)) ui.setHead(null);
  }, [selection, ui]);
  // The cursor row is conveyed by aria-activedescendant; range size is not, so say it.
  const selectedCount = selection.size;
  const lastCount = React.useRef(selectedCount);
  React.useEffect(() => {
    const previous = lastCount.current;
    lastCount.current = selectedCount;
    // Only growing/shrinking ranges: collapses come from actions (delete, Esc) that announce themselves.
    if (selectedCount === previous || selectedCount <= 1) return;
    const timer = setTimeout(() => ui.announce(`${selectedCount} items selected`), 150);
    return () => clearTimeout(timer);
  }, [selectedCount, ui]);
  // Callback-ref state: children's layout effects run before a parent's object ref attaches.
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const [zoomScope, animateZoom] = useAnimate<HTMLDivElement>();
  const zoomKey = ol.state.hoistedId ?? "root";
  const previousZoom = React.useRef(zoomKey);
  const zoomScroll = React.useRef(new Map<string, number>());
  // Search keeps your place: start at the top of the results, restore the reading position on clear.
  const queryActive = !!ol.view.query.trim();
  const searchScroll = React.useRef<number | null>(null);
  // Remember each zoom level's scroll as the user scrolls. Reading scrollTop inside the zoom
  // effect is too late: by then the new level has rendered and the browser has clamped it.
  React.useEffect(() => {
    if (!scrollEl) return;
    const record = () => {
      if (searchScroll.current === null) zoomScroll.current.set(previousZoom.current, scrollEl.scrollTop);
    };
    scrollEl.addEventListener("scroll", record, { passive: true });
    return () => scrollEl.removeEventListener("scroll", record);
  }, [scrollEl]);
  React.useLayoutEffect(() => {
    if (previousZoom.current === zoomKey || !zoomScope.current) return;
    const from = previousZoom.current;
    previousZoom.current = zoomKey;
    animateZoom(zoomScope.current, { opacity: [0, 1], y: [6, 0] }, motionTokens.base);
    const top = zoomScroll.current.get(zoomKey) ?? 0;
    // Zooming out (one level or several via breadcrumbs): land on the deepest visible item on
    // the path you came from, as outliners conventionally do. Rows outside a virtual window are
    // reached by focusing the list first, so the virtualizer scrolls the new cursor into view.
    const visible = new Set(ol.rows.map((row) => row.id));
    const cameFrom =
      from === "root"
        ? null
        : (getOutlinePath(ol.state.nodes, from)
            .map((node) => node.id)
            .reverse()
            .find((id) => visible.has(id)) ?? null);
    scrollEl?.scrollTo({ top });
    if (cameFrom) {
      ui.focusList();
      ol.dispatch({ type: "select", id: cameFrom });
      ui.setHead(cameFrom);
      requestAnimationFrame(() => {
        const el = ui.listRef.current?.querySelector(`[data-row="${CSS.escape(cameFrom)}"]`);
        const box = el?.getBoundingClientRect();
        const view = scrollEl?.getBoundingClientRect();
        if (!el || (box && view && (box.top < view.top || box.bottom > view.bottom))) ui.scrollToRow(cameFrom, "center");
      });
      ui.announce(`Zoomed out to ${ol.hoisted ? inlineToSpeech(ol.hoisted.text, live.current.resolveRef) : "the document"}`);
    } else {
      ui.announce(ol.hoisted ? `Zoomed into ${inlineToSpeech(ol.hoisted.text, live.current.resolveRef)}` : "Document root");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomKey]);
  React.useLayoutEffect(() => {
    if (!scrollEl) return;
    if (queryActive && searchScroll.current === null) {
      // The results have already rendered (and clamped scrollTop): use the recorded position.
      searchScroll.current = zoomScroll.current.get(previousZoom.current) ?? scrollEl.scrollTop;
      scrollEl.scrollTop = 0;
    } else if (!queryActive && searchScroll.current !== null) {
      const top = searchScroll.current;
      searchScroll.current = null;
      // The full list (and a virtual list's total height) can arrive well after the query
      // clears, so keep restoring until the position sticks — but yield as soon as the user
      // scrolls on their own.
      const deadline = performance.now() + 2000;
      let cancelled = false;
      const cancel = () => (cancelled = true);
      const events = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
      for (const type of events) scrollEl.addEventListener(type, cancel, { once: true, passive: true });
      const restore = () => {
        if (cancelled) return;
        scrollEl.scrollTop = top;
        if (Math.abs(scrollEl.scrollTop - top) > 1 && performance.now() < deadline) requestAnimationFrame(restore);
        else for (const type of events) scrollEl.removeEventListener(type, cancel);
      };
      requestAnimationFrame(restore);
    }
  }, [queryActive, scrollEl]);
  // While the phone sheet is open the list has room below its content, so the sheet can lift its
  // target row clear of itself even near the end of the document (OutlinerActionSheet scrolls).
  const sheetRow = ui.sheet?.rowId ?? null;
  React.useLayoutEffect(() => {
    scrollEl?.toggleAttribute("data-sheet-open", !!sheetRow);
  }, [sheetRow, scrollEl]);
  const live = React.useRef<LiveHandle>(null!);
  live.current = {
    ol,
    ui,
    startDrag: drag.start,
    resolveRef: (id) => {
      const node = findOutlineNode(ol.state.nodes, id)?.node;
      return node ? inlineToPlain(node.text) || "Untitled" : null;
    },
    refSource: (id) => {
      const node = findOutlineNode(ol.state.nodes, id)?.node;
      return node ? node.text || "Untitled" : null;
    },
    revealItem: (id, title) => {
      if (id) revealItem(ol, ui, id);
      else ol.setView((view) => ({ ...view, query: `"${title}"` }));
    },
  };
  // Clipboard while the tree has focus. The browser aims copy/cut/paste at the DOM selection's
  // node (often a stale text node, e.g. the title), not the focused tree, so listen on the
  // document and act whenever the tree is the active element.
  React.useEffect(() => {
    const handle = (event: ClipboardEvent) => {
      const { ol, ui } = live.current;
      if (document.activeElement !== ui.listRef.current || ui.editing || !event.clipboardData) return;
      const ids = [...ol.state.selection];
      if (event.type === "paste") {
        if (ol.readOnly) return;
        const count = readClipboard(event.clipboardData, ol, ids.at(-1) ?? ol.rows.at(-1)?.id);
        if (count === null) return;
        event.preventDefault();
        ui.announce(ui.labels.pasted(count));
        return;
      }
      if (!ids.length || (event.type === "cut" && ol.readOnly)) return;
      event.preventDefault();
      writeClipboard(event.clipboardData, ol, ids);
      if (event.type === "cut") deleteItems({ ol, ui }, ids, "cut");
      else ui.announce(ui.labels.copied(ids.length));
    };
    for (const type of ["copy", "cut", "paste"] as const) document.addEventListener(type, handle);
    return () => {
      for (const type of ["copy", "cut", "paste"] as const) document.removeEventListener(type, handle);
    };
  }, []);
  const isSel = (index: number) => !ui.editing && index >= 0 && index < ol.rows.length && selection.has(ol.rows[index]!.id);
  // children of a selected row move and delete with it, so they sit in a lighter band.
  const insideSelection = (row: OutlinerRow) => {
    if (ui.editing || !selection.size) return false;
    for (let parent = row.parentId; parent; parent = rowById.get(parent)?.parentId ?? null) if (selection.has(parent)) return true;
    return false;
  };
  const edgeOf = (row: OutlinerRow): RowViewProps["selectionEdge"] => {
    const index = rowIndex.get(row.id) ?? -1;
    const before = isSel(index - 1),
      after = isSel(index + 1);
    return before && after ? "middle" : before ? "last" : after ? "first" : "single";
  };
  const renderRow = (row: OutlinerRow) => (
    <OutlineRowView
      selectionEdge={!ui.editing && selection.has(row.id) ? edgeOf(row) : undefined}
      key={row.id}
      row={row}
      editingField={caretId === row.id ? (ol.state.caret?.field ?? "title") : undefined}
      selected={!ui.editing && selection.has(row.id)}
      cursor={!ui.editing && cursorId === row.id && selection.has(row.id)}
      litLevels={litLevelsFor(row)}
      dragging={drag.state?.ids.includes(row.id) ?? false}
      flat={searching && ol.view.searchMode === "flat"}
      readOnly={ol.readOnly}
      noteDisplay={ol.view.noteDisplay}
      selecting={selecting}
      rangeMode={!ui.editing && selection.size > 1}
      animateLayout={animateLayout}
      coarse={coarse}
      carried={!selection.has(row.id) && insideSelection(row)}
      starred={ol.bookmarks.items.includes(identityOfRow(row))}
    />
  );

  const searching = !!ol.view.query.trim();
  const empty = ol.rows.length === 0;

  return (
    <div ref={setScrollEl} data-outliner-scroll className="relative min-h-0 flex-1 scroll-pb-20 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
      <AncestorStrip scrollEl={scrollEl} />
      <div className="mx-auto w-full max-w-[52rem] px-3 pt-4 pb-24 sm:px-6 sm:pt-5">
        {/* Zoom crossfade only for animated (small) documents: a virtual list must never be
            mounted twice (both copies would fight over the shared list and scroll refs). */}
        {/* Zoom transition animates this one stable node in place; the list (and any virtual
            window inside it) is never mounted twice. */}
        <div ref={zoomScope}>
            <DocumentTitle title={title} />
            {searching && ol.view.searchMode === "flat" && (
              <div className="mb-1 ps-[30px] text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {ol.rows.length} result{ol.rows.length === 1 ? "" : "s"}
              </div>
            )}
            <div
              ref={ui.listRef}
              role="tree"
              aria-label={hoisted ? inlineToSpeech(hoisted.text) : title}
              aria-multiselectable
              aria-activedescendant={cursorId && selection.has(cursorId) ? rowDomId(cursorId) : undefined}
              tabIndex={ui.editing ? -1 : 0}
              onFocus={(event) => {
                // Keyboard entry: the tree is one tab stop; landing on it selects a row.
                if (event.target !== event.currentTarget || selection.size || !ol.rows.length) return;
                const first = ol.rows.find((row) => row.id === ol.state.selectionAnchor) ?? ol.rows[0]!;
                ol.dispatch({ type: "select", id: first.id });
              }}
              onKeyDown={(event) => onSelectionKey(event, ol, ui)}
              className="relative outline-none"
            >
              <LiveContext.Provider value={live}>
              {animateLayout ? (
                <LayoutGroup>
                  <AnimatePresence initial={false} custom={rollback}>
                    {ol.rows.map(renderRow)}
                  </AnimatePresence>
                </LayoutGroup>
              ) : (
                <VirtualRows rows={ol.rows} renderRow={renderRow} scrollEl={scrollEl} listRef={ui.listRef} focusId={caretId ?? cursorId} editing={ui.editing} register={ui.registerScroller} />
              )}
              </LiveContext.Provider>
              <DropIndicator drag={drag.state} />
            </div>
            {empty && <EmptyState searching={searching} placeholder={placeholder} />}
            {!empty && !searching && !ol.readOnly && (
              <button
                type="button"
                onClick={() => {
                  const id = ol.commands.addChild(ol.state.hoistedId);
                  ol.dispatch({ type: "focus", id });
                  ui.setEditing(true);
                }}
                className="group/add mt-1 flex h-7 items-center gap-2 rounded-md ps-[26px] pe-2 text-muted-foreground/70 transition-colors hover:text-foreground coarse:h-9"
              >
                <Plus className="size-3.5 transition-transform group-hover/add:rotate-90" />
                <span className="text-ui">{ui.labels.addItem}</span>
              </button>
            )}
        </div>
      </div>
    </div>
  );
}

/**
 * Sticky ancestor strip: scrolled deep into a big branch, the top row's ancestors pin under the
 * toolbar as a compact breadcrumb (click one to zoom into it), so you never lose where you are.
 * It overlays the list (zero-height sticky host: nothing below shifts) and appears only while
 * the top row's parent has scrolled away.
 */
function AncestorStrip({ scrollEl }: { readonly scrollEl: HTMLDivElement | null }) {
  const { ol, ui } = useOutlinerContext();
  const [topId, setTopId] = React.useState<string | null>(null);
  const live = React.useRef(ol);
  live.current = ol;
  React.useEffect(() => {
    if (!scrollEl) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const list = ui.listRef.current;
      if (!list || scrollEl.scrollTop < 24) return setTopId(null);
      const edge = scrollEl.getBoundingClientRect().top + STRIP_HEIGHT;
      // Rows are flat and in visual order: binary-search the first one still showing below the strip.
      const rows = list.querySelectorAll<HTMLElement>(":scope [data-row]");
      let lo = 0,
        hi = rows.length - 1,
        found: HTMLElement | null = null;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (rows[mid]!.getBoundingClientRect().bottom > edge) {
          found = rows[mid]!;
          hi = mid - 1;
        } else lo = mid + 1;
      }
      const id = found?.dataset.row ?? null;
      const { rows: all, rowIndex } = live.current;
      const row = id ? all[rowIndex.get(id) ?? -1] : undefined;
      const parent = row?.parentId ? list.querySelector<HTMLElement>(`[data-row="${CSS.escape(row.parentId)}"]`) : null;
      // The parent still in view (its title above the edge is still readable) needs no strip.
      const parentShown = !!parent && parent.getBoundingClientRect().top >= scrollEl.getBoundingClientRect().top;
      setTopId(row && row.depth > 0 && !parentShown ? row.id : null);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    scrollEl.addEventListener("scroll", schedule, { passive: true });
    schedule();
    return () => {
      scrollEl.removeEventListener("scroll", schedule);
      cancelAnimationFrame(frame);
    };
  }, [scrollEl, ui.listRef, ol.rows]);
  const chain = React.useMemo(() => {
    const out: OutlinerRow[] = [];
    for (let row = topId ? ol.rows[ol.rowIndex.get(topId) ?? -1] : undefined; row?.parentId; ) {
      row = ol.rows[ol.rowIndex.get(row.parentId) ?? -1];
      if (row) out.unshift(row);
    }
    return out;
  }, [topId, ol.rows, ol.rowIndex]);
  const key = chain.map((row) => row.id).join("/");
  // The phone sheet lifts its target to the top: the strip must not cover it.
  const visible = chain.length > 0 && !ui.sheet;
  const shown = chain.length > 3 ? chain.slice(-3) : chain;
  // The strip overlays the list, so keep the cursor row clear of it (WCAG 2.4.11): every
  // scrollIntoView and the virtualizer honour the container's top scroll padding.
  const navRef = React.useRef<HTMLElement>(null);
  React.useLayoutEffect(() => {
    if (!scrollEl) return;
    const pad = () => (scrollEl.style.scrollPaddingTop = visible ? `${(navRef.current?.offsetHeight ?? STRIP_HEIGHT) + 4}px` : "");
    pad();
    const frame = requestAnimationFrame(pad);
    return () => {
      cancelAnimationFrame(frame);
      scrollEl.style.scrollPaddingTop = "";
    };
  }, [scrollEl, visible]);
  return (
    <div className="pointer-events-none sticky top-0 z-10 h-0">
      <AnimatePresence initial={false}>
        {visible && (
          <motion.nav
            key="strip"
            ref={navRef}
            aria-label={ui.labels.ancestors}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={motionTokens.quick}
            className="pointer-events-auto absolute inset-x-0 top-0 border-b border-hairline bg-[color-mix(in_srgb,var(--surface)_92%,transparent)] backdrop-blur-sm"
          >
            <motion.ol
              key={key}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: 1 }}
              transition={motionTokens.quick}
              className="mx-auto flex h-7 w-full max-w-[52rem] min-w-0 items-center gap-0.5 px-3 font-mono text-[11px] text-muted-foreground sm:px-6 coarse:h-10"
            >
              {chain.length > shown.length && (
                <li aria-hidden className="shrink-0 px-1 text-muted-foreground/60">
                  …
                </li>
              )}
              {shown.map((row, index) => (
                <li key={row.id} className="flex min-w-0 items-center">
                  {(index > 0 || chain.length > shown.length) && <ChevronRight aria-hidden className="size-3 shrink-0 text-muted-foreground/50 rtl:rotate-180" />}
                  <button
                    type="button"
                    onClick={() => ol.dispatch({ type: "hoist", id: row.id })}
                    title={inlineToPlain(row.node.text) || ui.labels.untitled}
                    className={cn(
                      "h-6 max-w-[16rem] truncate rounded-[5px] px-1.5 transition-colors hover:bg-muted hover:text-foreground coarse:h-9",
                      index === shown.length - 1 && "text-foreground/80",
                    )}
                  >
                    <span dir="auto">{inlineToLabel(row.node.text) || inlineToPlain(row.node.text) || ui.labels.untitled}</span>
                  </button>
                </li>
              ))}
            </motion.ol>
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
const STRIP_HEIGHT = 28;

/** Row exit: collapse calmly, or at once when a veto rolls the row back (`custom` = rollback). */
const ROW_PRESENCE = {
  exit: (rollback?: boolean) => (rollback ? { opacity: 0, height: 0, transition: { duration: 0 } } : { opacity: 0, height: 0 }),
};

const NO_COUNT = { total: 0, done: 0 } as const;
const checkboxCache = new WeakMap<OutlinerRow["node"], { readonly total: number; readonly done: number }>();
function checkboxCount(node: OutlinerRow["node"]): { readonly total: number; readonly done: number } {
  const cached = checkboxCache.get(node);
  if (cached) return cached;
  // A mirror is counted where it lives (its source), never twice.
  if (mirrorOf(node)) return NO_COUNT;
  let total = node.checked !== undefined ? 1 : 0,
    done = node.checked ? 1 : 0;
  for (const child of node.children ?? []) {
    const count = checkboxCount(child);
    total += count.total;
    done += count.done;
  }
  const result = { total, done };
  checkboxCache.set(node, result);
  return result;
}

function DocumentTitle({ title }: { readonly title: string }) {
  const { ol } = useOutlinerContext();
  const hoisted = ol.hoisted;
  // Per-subtree counts cached by node identity: a keystroke recounts only the edited path.
  const tasks = React.useMemo(() => {
    let total = 0,
      done = 0;
    for (const node of hoisted ? (hoisted.children ?? []) : ol.state.nodes) {
      const count = checkboxCount(node);
      total += count.total;
      done += count.done;
    }
    return { total, done };
  }, [ol.state.nodes, hoisted]);
  const ratio = tasks.total ? tasks.done / tasks.total : 0;
  return (
    <header className="mb-3 ps-[30px]">
      {hoisted ? <ZoomTitle /> : <h2 className="text-[22px] leading-8 font-semibold tracking-[-0.015em] text-balance">{title}</h2>}
      {hoisted?.data?.note && (
        <p dir="auto" className="mt-0.5 text-ui whitespace-pre-wrap text-muted-foreground">{hoisted.data.note}</p>
      )}
      {hoisted && <ZoomConnections item={hoisted} />}
      {tasks.total > 0 && (
        <div className="mt-2 flex items-center gap-2.5">
          <div className="h-1 w-28 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.total} aria-valuenow={tasks.done} aria-label="Tasks complete">
            <motion.div
              className="h-full rounded-full bg-signal"
              initial={false}
              animate={{ width: `${ratio * 100}%`, backgroundColor: ratio >= 1 ? "var(--success)" : "var(--signal)" }}
              transition={motionTokens.slow}
            />
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            <bdi>{tasks.done.toLocaleString()}/{tasks.total.toLocaleString()}</bdi> tasks
          </span>
        </div>
      )}
    </header>
  );
}

/** Syntax chips shown under an empty search field (core grammar + the outliner's task/date filters). */
function searchHints(now = new Date()) {
  const week = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7);
  const iso = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  return ["is:todo", "due:today", "due:overdue", "due:week", `before:${iso}`, "#tag", "@person", '"exact phrase"', "-exclude", "a OR b", "is:done", "has:date", "has:note", "color:red", "heading:2", "parent:goals", "in:title"];
}

/**
 * Inline query help under the search field, one of three states:
 *   typing a token  completions for it (operators, then values: due: → today, overdue, week …); Tab takes the first
 *   invalid query   the parser's reason (e.g. "2026-02-30 is not a calendar date.")
 *   empty query     syntax chips
 */
function SearchHelp() {
  const { ol, ui } = useOutlinerContext();
  const diagnostic = ol.search?.diagnostics[0];
  const suggestions = React.useMemo(() => searchSuggestions(ol.view.query), [ol.view.query]);
  const hints = React.useMemo(() => searchHints(), []);
  const active = ui.searchOpen || !!ol.view.query;
  // Completing a half-typed token beats the parser's complaint about it ("due:" is not wrong, just unfinished).
  const mode = !active ? null : suggestions.length ? "complete" : diagnostic ? "error" : !ol.view.query ? "hints" : null;
  const setQuery = (query: string) => {
    ol.setView((view) => ({ ...view, query }));
    requestAnimationFrame(() => {
      const input = ui.rootRef.current?.querySelector<HTMLInputElement>("input[aria-label='Search outline']");
      input?.focus();
      input?.setSelectionRange(query.length, query.length);
    });
  };
  const chip =
    "shrink-0 rounded-[5px] border border-hairline bg-background px-1.5 font-mono leading-5 text-muted-foreground transition-colors hover:border-border hover:text-foreground coarse:h-11 coarse:rounded-md coarse:px-2.5 coarse:text-[12px] coarse:leading-[42px]";
  return (
    <AnimatePresence initial={false}>
      {mode && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={motionTokens.quick}
          className="shrink-0 overflow-hidden border-b border-hairline bg-muted/30"
        >
          <div id={ui.searchHelpId} dir="ltr" className="flex items-center gap-1.5 overflow-x-auto px-3 py-1.5 text-[11px] [scrollbar-width:none] coarse:gap-2 coarse:py-2">
            {mode === "error" ? (
              <span role="status" className="flex items-center gap-1.5 text-destructive">
                <span className="size-1.5 rounded-full bg-destructive" />
                {diagnostic!.message}
              </span>
            ) : mode === "complete" ? (
              <>
                <span className="flex shrink-0 items-center gap-1 text-muted-foreground coarse:hidden">
                  <Kbd className="h-4 px-1 font-sans text-[10px]">Tab</Kbd>
                </span>
                {suggestions.map((suggestion, index) => (
                  <motion.button
                    key={suggestion.label}
                    type="button"
                    initial={{ opacity: 0, y: 2 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...motionTokens.quick, delay: index * 0.015 }}
                    title={suggestion.hint}
                    aria-label={`${suggestion.label}, ${suggestion.hint}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery(suggestion.query)}
                    className={cn(chip, "flex items-center gap-1.5", index === 0 && "border-signal/40 text-foreground")}
                  >
                    {suggestion.label}
                    <span className="font-sans text-muted-foreground/70">{suggestion.hint}</span>
                  </motion.button>
                ))}
              </>
            ) : (
              <>
                <span className="shrink-0 text-muted-foreground">Try</span>
                {hints.map((hint) => (
                  <button
                    key={hint}
                    type="button"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery(hint)}
                    className={chip}
                  >
                    {hint}
                  </button>
                ))}
              </>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * The zoomed item's title, shown the way its row shows it: a task keeps its checkbox (its own tab
 * stop, announced), a colour keeps its start stripe, a heading keeps its level, a completed item
 * reads struck through. The text is editable in place; Enter starts its first child.
 */
function ZoomTitle() {
  const { ol, ui } = useOutlinerContext();
  const hoisted = ol.hoisted!;
  const [editing, setEditing] = React.useState(false);
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [hoisted.text, editing]);
  const locked = ol.isItemLocked(hoisted.id);
  const editable = !ol.readOnly && !locked;
  const task = hoisted.checked !== undefined;
  const completed = hoisted.checked === true || hoisted.data?.completed === true;
  const color = hoisted.data?.color && hoisted.data.color in COLOR_STYLES ? COLOR_STYLES[hoisted.data.color] : null;
  const heading = hoisted.data?.heading;
  const starred = ol.bookmarks.items.includes(ol.commands.identityOf(hoisted.id));
  const className = "block w-full text-[22px] leading-8 font-semibold tracking-[-0.015em]";
  const title = editing ? (
    <textarea
      ref={ref}
      autoFocus
      rows={1}
      aria-label="Zoomed item title"
      value={hoisted.text}
      onChange={(event) => ol.dispatch({ type: "text", id: hoisted.id, text: event.target.value, time: Date.now() })}
      onBlur={() => setEditing(false)}
      onKeyDown={(event) => {
        if (event.key === "Escape") setEditing(false);
        if (event.key === "Enter") {
          event.preventDefault();
          setEditing(false);
          const id = createOutlineId();
          ol.dispatch({ type: "insert", id, parentId: hoisted.id, index: 0 });
          ui.setEditing(true);
        }
      }}
      className={cn(className, "resize-none overflow-hidden border-0 bg-transparent p-0 caret-signal outline-none")}
    />
  ) : (
    <h2
      className={cn(
        className,
        "text-balance transition-colors duration-200",
        editable && "cursor-text",
        completed && "text-muted-foreground line-through decoration-muted-foreground/50 decoration-2",
      )}
      onClick={() => editable && setEditing(true)}
    >
      <InlineText source={hoisted.text || ui.labels.untitled} />
      {heading && (
        <span
          aria-label={`Heading ${heading}`}
          className="ms-2 inline-block translate-y-[-3px] rounded-[4px] border border-hairline px-1 align-middle font-mono text-[10.5px] leading-4 font-medium tracking-normal text-muted-foreground no-underline"
        >
          H{heading}
        </span>
      )}
    </h2>
  );
  return (
    <div className="relative flex items-start">
      {color && (
        <span aria-hidden className={cn("absolute inset-y-1.5 w-[2px] rounded-full opacity-75", task ? "-start-[33px]" : "-start-[29px]", color.bar)} />
      )}
      {task && (
        // Sized to the 22 px title (cap height), sitting in the bullet column, not the stripe gutter.
        <span className="-ms-[25px] me-[5px] flex h-8 shrink-0 items-center">
          <TaskCheckbox
            focusable
            checked={completed}
            disabled={!editable}
            label={`${completed ? ui.labels.markIncomplete : ui.labels.complete}: ${inlineToSpeech(hoisted.text) || ui.labels.untitled}`}
            className="size-5 rounded-[5px] coarse:size-6 [&_svg]:size-3.5"
            onToggle={() => ui.announceToggle(ol.commands.toggleComplete([hoisted.id]))}
          />
        </span>
      )}
      <div className="min-w-0 flex-1">{title}</div>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-pressed={starred}
            aria-label={starred ? ui.labels.removeBookmark : ui.labels.bookmark}
            onClick={() => ui.announce(ol.commands.toggleBookmark(hoisted.id) ? ui.labels.bookmarked : ui.labels.bookmarkRemoved)}
            className={cn(
              "relative ms-2 mt-1.5 grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground/70 transition-colors after:absolute after:-inset-1 hover:bg-muted hover:text-foreground coarse:size-9",
              starred && "text-warning hover:text-warning",
            )}
          >
            <Star className={cn("size-3.5", starred && "fill-current")} />
          </button>
        </TooltipTrigger>
        <TooltipContent>{starred ? ui.labels.removeBookmark : ui.labels.bookmark}</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Follow a link or a mirror: unzoom if needed, unfold, select, scroll into view, focus the tree. */
function revealItem(ol: OutlinerController, ui: OutlinerUi, id: string) {
  if (!findOutlineNode(ol.latestNodes(), id)) {
    toast(ui.labels.linkedItemDeleted);
    return;
  }
  const go = () => {
    ol.dispatch({ type: "reveal", id });
    ol.dispatch({ type: "select", id });
    ui.setEditing(false);
    requestAnimationFrame(() => {
      ui.focusList();
      ui.scrollToRow(id, "center");
    });
  };
  const outside = ol.state.hoistedId && !getOutlinePath(ol.latestNodes(), id).some((node) => node.id === ol.state.hoistedId);
  if (outside || ol.state.hoistedId === id) {
    // Zooming out lands on the item you came from; the link's target wins after that settles.
    ol.dispatch({ type: "hoist", id: null });
    requestAnimationFrame(go);
  } else go();
}

/**
 * Under a zoomed title: what points here. "Linked from N" lists the items that link to it with
 * [[label|id]] (click to reveal; the whole set is also `links:<id>` in search), plus where it is
 * mirrored, or which item it mirrors.
 */
function ZoomConnections({ item }: { readonly item: OutlineItem }) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const nodes = ol.state.nodes;
  const sources = React.useMemo(() => ol.commands.backlinks(item.id), [nodes, item.id, ol.commands]);
  const mirrors = React.useMemo(() => ol.commands.mirrorsOf(item.id), [nodes, item.id, ol.commands]);
  const mirrorSource = mirrorOf(item);
  if (!sources.length && !mirrors.length && !mirrorSource) return null;
  const titleOf = (id: string) => {
    const node = findOutlineNode(nodes, id)?.node;
    return node ? inlineToPlain(node.text) || L.untitled : L.untitled;
  };
  const pathOf = (id: string) =>
    getOutlinePath(nodes, id)
      .slice(0, -1)
      .map((node) => inlineToPlain(node.text))
      .join(" › ");
  const entry = (id: string, icon: React.ReactNode) => (
    <li key={id}>
      <button
        type="button"
        onClick={() => revealItem(ol, ui, id)}
        className="group/link flex w-full min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-start transition-colors hover:bg-muted coarse:min-h-11 coarse:items-center"
      >
        <span className="translate-y-px text-muted-foreground/70 [&>svg]:size-3">{icon}</span>
        <span dir="auto" className="min-w-0 truncate text-ui text-foreground/90">{titleOf(id)}</span>
        <span dir="auto" className="ms-auto max-w-[45%] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground">{pathOf(id)}</span>
      </button>
    </li>
  );
  return (
    <motion.section
      initial={{ opacity: 0, y: 2 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTokens.base}
      aria-label="Connections"
      className="mt-2.5 -ms-1.5 max-w-xl border-s border-hairline ps-1.5"
    >
      {mirrorSource && (
        <button
          type="button"
          onClick={() => revealItem(ol, ui, mirrorSource)}
          className="flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase transition-colors hover:bg-muted hover:text-foreground"
        >
          <Repeat2 className="size-3" /> {L.mirrorOf(titleOf(mirrorSource))}
        </button>
      )}
      {sources.length > 0 && (
        <>
          <div className="flex items-center gap-2 px-1.5 pt-0.5">
            <span className="font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">{L.linkedFrom(sources.length)}</span>
            {sources.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  ol.setView((view) => ({ ...view, query: `links:${ol.commands.identityOf(item.id)}`, searchMode: "flat" }));
                  ui.setSearchOpen(true);
                }}
                className="font-mono text-[10.5px] text-signal hover:underline"
              >
                {L.showLinksInSearch}
              </button>
            )}
          </div>
          <ul>{sources.slice(0, 6).map((id) => entry(id, <CornerDownRight />))}</ul>
        </>
      )}
      {mirrors.length > 0 && (
        <>
          <div className="px-1.5 pt-1 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">{L.mirroredIn(mirrors.length)}</div>
          <ul>{mirrors.slice(0, 6).map((id) => entry(id, <Repeat2 />))}</ul>
        </>
      )}
    </motion.section>
  );
}

/** IDE-style status strip: interaction mode, document revision, scope and the escape hatches. */
function OutlinerStatusBar() {
  const { modKey } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const selected = ol.state.selection.size;
  const searching = !!ol.view.query.trim();
  const matches = ol.search?.matchedIds.length ?? 0;
  // The footer follows the field: a half-typed token is "typing…", never "invalid".
  const typing = searching && (ol.search?.pending || searchSuggestions(ol.view.query).length > 0);
  const mode = ol.readOnly
    ? L.readOnlyMode
    : ui.editing
      ? ol.state.caret?.field === "note"
        ? L.editingNote
        : L.editing
      : selected
        ? L.selected(selected)
        : searching
          ? L.searching(matches)
          : L.browsing;
  return (
    <div className="flex h-7 shrink-0 items-center gap-3 border-t border-hairline bg-muted/30 px-3 font-mono text-[10.5px] text-muted-foreground tabular-nums max-sm:hidden">
      <span className="flex items-center gap-1.5">
        <motion.span
          key={mode}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={motionTokens.quick}
          className={cn(
            "size-1.5 rounded-full",
            ui.editing ? "bg-signal" : selected ? "bg-warning" : ol.readOnly ? "bg-muted-foreground/60" : searching ? "bg-signal/70" : "bg-success",
          )}
        />
        {mode}
      </span>
      <span>{ol.rows.length.toLocaleString()} {ol.rows.length === 1 ? "row" : "rows"}</span>
      {ol.state.history.past.length > 0 && (
        <span>
          {ol.state.history.past.length} {ol.state.history.past.length === 1 ? "change" : "changes"}
        </span>
      )}
      {searching &&
        (typing ? (
          <span>{L.typingQuery}</span>
        ) : ol.search?.diagnostics.length ? (
          <span className="text-destructive">{L.invalidQuery}</span>
        ) : (
          <span className="text-signal">{ol.view.searchMode === "agenda" ? "agenda view" : ol.view.searchMode === "flat" ? "flat results" : "filtered outline"}</span>
        ))}
      {ol.view.hideCompleted && (
        <button type="button" className="text-signal hover:underline" onClick={() => ol.setView((view) => ({ ...view, hideCompleted: false }))}>
          completed hidden
        </button>
      )}
      <span className="ms-auto flex items-center gap-3">
        <button type="button" dir="ltr" onClick={() => ui.setShortcutsOpen(true)} className="transition-colors hover:text-foreground">
          {modKey}/ shortcuts
        </button>
        <span className="flex items-center gap-1" dir="ltr">
          <Lock className={cn("size-3", !ol.readOnly && "hidden")} />
          {ol.canUndo ? `${modKey}Z to undo` : ""}
        </span>
      </span>
    </div>
  );
}

function EmptyState({ searching, placeholder }: { readonly searching: boolean; readonly placeholder?: string }) {
  const { ol, ui } = useOutlinerContext();
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={motionTokens.base}
      className="flex flex-col items-start gap-2 ps-[30px] py-6"
    >
      {searching ? (
        <>
          <p className="text-ui text-muted-foreground">
            {ui.labels.noMatches("")}
            <span dir="auto" className="font-mono text-foreground">{ol.view.query}</span>
          </p>
          {ol.search?.diagnostics[0] && (
            <p className="font-mono text-[11px] text-destructive">{ol.search.diagnostics[0].message}</p>
          )}
          <Button variant="outline" size="sm" onClick={() => ol.setView((view) => ({ ...view, query: "" }))}>
            {ui.labels.clearSearch}
          </Button>
        </>
      ) : (
        <button
          type="button"
          disabled={ol.readOnly}
          onClick={() => {
            const id = ol.commands.addChild(ol.state.hoistedId);
            ol.dispatch({ type: "focus", id });
            ui.setEditing(true);
          }}
          className="text-ui text-muted-foreground transition-colors hover:text-foreground"
        >
          {placeholder ?? ui.labels.emptyDocument}
        </button>
      )}
    </motion.div>
  );
}

/* ───────────────────────────── Row ───────────────────────────── */

interface RowViewProps {
  readonly row: OutlinerRow;
  readonly editingField?: "title" | "note";
  readonly selected: boolean;
  readonly cursor: boolean;
  /** Guides at levels [0, litLevels) are lit: their ancestors contain the cursor row. */
  readonly litLevels: number;
  readonly dragging: boolean;
  readonly flat: boolean;
  readonly readOnly: boolean;
  readonly noteDisplay: OutlinerController["view"]["noteDisplay"];
  /** Touch selection mode: taps toggle selection instead of editing. */
  readonly selecting: boolean;
  readonly animateLayout: boolean;
  /** Where this row sits in a contiguous selected block (selected rows merge into one band). */
  readonly selectionEdge?: "single" | "first" | "middle" | "last";
  /** Several rows are selected: only the cursor (head) row offers ⋯, for the whole selection. */
  readonly rangeMode?: boolean;
  /** Touch device: long-press and ⋯ open the action sheet instead of menus. */
  readonly coarse?: boolean;
  /** An ancestor is selected: this row moves and deletes with it (lighter band). */
  readonly carried?: boolean;
  readonly starred?: boolean;
}

/**
 * Pure presentational row. It never subscribes to the outliner context: all render inputs
 * are props (so React.memo holds across keystrokes) and handlers read the latest
 * controller from a stable ref at event time.
 */
const OutlineRowView = React.memo(function OutlineRowView({
  row,
  editingField,
  selected,
  cursor,
  litLevels,
  dragging,
  flat,
  readOnly,
  noteDisplay,
  selecting,
  animateLayout,
  selectionEdge,
  rangeMode = false,
  coarse = false,
  carried = false,
  starred = false,
}: RowViewProps) {
  const live = useLive();
  const labels = live.current.ui.labels;
  const { node, details } = row;
  const titleRef = React.useRef<HTMLSpanElement>(null);
  const heading = details.heading;
  const color = details.color && details.color in COLOR_STYLES ? COLOR_STYLES[details.color as keyof typeof COLOR_STYLES] : null;
  const noteText = details.note ?? "";
  const showNote = editingField === "note" || (noteText && noteDisplay !== "hide");
  const editable = !readOnly && !row.locked;
  // Screen readers hear dates as words ("due today at 4:00 PM"), not the chip's "Today 4:00 PM".
  const spoken = inlineToSpeech(node.text, live.current.resolveRef) || "Untitled";

  const beginEdit = (event: React.MouseEvent, field: "title" | "note", source: string, el: HTMLElement | null) => {
    const { ol, ui } = live.current;
    if (selecting) {
      ol.dispatch({ type: "select", id: row.id, toggle: true });
      return;
    }
    if (event.defaultPrevented) return;
    if (!editable) {
      // Locked or read-only rows can't be edited, but a click still selects them.
      ol.dispatch({ type: "select", id: row.id });
      ui.setHead(row.id);
      ui.focusList();
      return;
    }
    const offset = el ? sourceOffsetFromPoint(el, event.clientX, event.clientY, source.length) : source.length;
    ol.dispatch({ type: "focus", id: row.id, start: offset, ...(field === "note" ? { field: "note" } : {}) });
    ui.setEditing(true);
  };

  /* touch long-press opens the action sheet (not a desktop dropdown over the row). */
  const press = React.useRef<{ timer: number; x: number; y: number; fired: boolean } | null>(null);
  const clearPress = () => {
    if (press.current) window.clearTimeout(press.current.timer);
  };
  const openSheet = () => {
    const { ol, ui } = live.current;
    const many = ol.state.selection.has(row.id) && ol.state.selection.size > 1;
    // The target is marked (selected) and lifted into the space above the sheet, never covered.
    // The modal sheet hides the page from assistive tech: nothing behind it may keep focus.
    (document.activeElement as HTMLElement | null)?.blur?.();
    const marked = !many && !ol.state.selection.has(row.id);
    if (marked) ol.dispatch({ type: "select", id: row.id });
    ui.setSheet({ rowId: row.id, ids: many ? [...ol.state.selection] : [row.id], marked });
    navigator.vibrate?.(8);
  };
  const touch: React.HTMLAttributes<HTMLDivElement> =
    coarse && !editingField
      ? {
          onPointerDown: (event) => {
            if (event.pointerType === "mouse" || (event.target as Element).closest("[data-drag-handle],[role=checkbox],a")) return;
            clearPress();
            const state = { x: event.clientX, y: event.clientY, fired: false, timer: 0 };
            state.timer = window.setTimeout(() => {
              state.fired = true;
              openSheet();
            }, 480);
            press.current = state;
          },
          onPointerMove: (event) => {
            if (press.current && !press.current.fired && Math.hypot(event.clientX - press.current.x, event.clientY - press.current.y) > 8) {
              clearPress();
              press.current = null;
            }
          },
          onPointerUp: clearPress,
          onPointerCancel: () => {
            clearPress();
            press.current = null;
          },
          onContextMenu: (event) => {
            // Android fires contextmenu for a long-press: same sheet, once.
            event.preventDefault();
            if (!press.current?.fired) {
              clearPress();
              press.current = { x: 0, y: 0, timer: 0, fired: true };
              openSheet();
            }
          },
          onClickCapture: (event) => {
            if (press.current?.fired) {
              event.preventDefault();
              event.stopPropagation();
            }
            press.current = null;
          },
        }
      : {};
  React.useEffect(() => () => clearPress(), []);

  return (
    <motion.div
      layout={animateLayout ? "position" : false}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: dragging ? 0.35 : 1, height: "auto" }}
      variants={ROW_PRESENCE}
      exit="exit"
      transition={{ layout: motionTokens.layout, height: motionTokens.base, opacity: motionTokens.quick }}
      role="treeitem"
      id={rowDomId(row.id)}
      aria-level={row.depth + 1}
      aria-posinset={row.posInSet}
      aria-setsize={row.setSize}
      aria-expanded={row.hasChildren ? row.expanded : undefined}
      aria-selected={selected}
      aria-label={`${row.agenda ? `${labels.agendaGroups[row.agenda.group]}: ` : ""}${spoken}${row.completed ? ", completed" : ""}${noteText ? ", has note" : ""}${row.locked ? ", locked" : ""}${row.mirror && row.mirror !== "copy" ? ", mirror" : ""}${row.backlinks ? `, ${labels.linkedFrom(row.backlinks).toLowerCase()}` : ""}`}
      data-row={row.id}
      className="relative"
    >
      {row.agenda && (
        <div aria-hidden className="flex items-baseline gap-2 ps-[30px] pt-3 pb-1 font-mono text-[10.5px] font-medium tracking-wide text-muted-foreground uppercase first:pt-0">
          <span className={cn(row.agenda.group === "overdue" && "text-destructive", row.agenda.group === "today" && "text-signal")}>{labels.agendaGroups[row.agenda.group]}</span>
          <span className="text-muted-foreground/60 tabular-nums">{row.agenda.count}</span>
          <span className="h-px flex-1 self-center bg-hairline" />
        </div>
      )}
      <SwipeRow row={row} disabled={!!editingField || !editable}>
      <ContextMenu modal={false}>
      <ContextMenuTrigger asChild disabled={!!editingField || coarse}>
      <div
        {...touch}
        className={cn(
          "group/row relative flex items-start rounded-md transition-colors duration-100 coarse:[-webkit-touch-callout:none]",
          coarse && !editingField && "select-none",
          !selected && !editingField && !cursor && !carried && color?.row,
          carried && "bg-foreground/[0.025] dark:bg-foreground/[0.045]",
          selected && "bg-foreground/[0.06] dark:bg-foreground/[0.09]",
          selected && selectionEdge === "middle" && "rounded-none",
          selected && selectionEdge === "first" && "rounded-b-none",
          selected && selectionEdge === "last" && "rounded-t-none",
          cursor && "bg-foreground/[0.09] dark:bg-foreground/[0.13]",
          row.context && "opacity-55",
          editingField && "bg-foreground/[0.03]",
        )}
        style={{ paddingInlineStart: `calc(var(--ol-indent) * ${row.depth})` }}
        onClick={(event) => {
          const { ol, ui } = live.current;
          if (ui.editing || readOnly) return;
          if (event.shiftKey || event.metaKey || event.ctrlKey) {
            event.preventDefault();
            ol.dispatch({ type: "select", id: row.id, extend: event.shiftKey, toggle: event.metaKey || event.ctrlKey });
            ui.focusList();
          }
        }}
      >
        {/* Colour label: a start stripe at the item's own indent (plus the faintest tint), so a
            coloured row never reads as the cursor or the selection band. */}
        {/* hidden on every selected row, so it never stands next to the cursor bar. */}
        {color && !selected && !carried && (
          <span
            aria-hidden
            className={cn("pointer-events-none absolute inset-y-[6px] w-[2px] rounded-full opacity-75 coarse:inset-y-[10px]", color.bar)}
            style={{ insetInlineStart: `calc(var(--ol-indent) * ${row.depth} + 1px)` }}
          />
        )}
        {cursor && (
          <motion.span
            layoutId="outliner-cursor"
            aria-hidden
            transition={motionTokens.layout}
            className="pointer-events-none absolute inset-y-1 start-0.5 w-[3px] rounded-full bg-signal"
          />
        )}
        {/* Indent guides: one hairline per ancestor level, continuous across rows. */}
        {Array.from({ length: row.depth }, (_, level) => (
          <span
            key={level}
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-y-0 w-px transition-colors duration-150",
              level >= row.depth - litLevels ? "bg-signal/40" : "bg-border",
            )}
            style={{ insetInlineStart: `calc(var(--ol-indent) * ${level} + 17px)` }}
          />
        ))}

        {/* Disclosure */}
        <div className="relative flex h-7 w-[22px] shrink-0 items-center justify-center coarse:h-9 coarse:w-7">
          {row.hasChildren && !flat && (
            <button
              type="button"
              tabIndex={-1}
              aria-hidden
              onClick={(event) => {
                event.stopPropagation();
                const { ol } = live.current;
                if (event.altKey) ol.dispatch({ type: "expand", ids: subtreeIds(row.node), expanded: !row.expanded });
                else ol.dispatch({ type: "toggle", id: row.id });
              }}
              className={cn(
                "grid size-5 place-items-center rounded-[5px] text-muted-foreground/80 transition-[opacity,background-color,color] hover:bg-muted hover:text-foreground coarse:size-8",
                row.expanded ? "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100 coarse:opacity-60" : "opacity-60 group-hover/row:opacity-100",
              )}
            >
              <motion.span animate={{ rotate: row.expanded ? 90 : 0 }} transition={motionTokens.quick} className="grid rtl:-scale-x-100">
                <ChevronRight className="size-3.5" />
              </motion.span>
            </button>
          )}
        </div>

        {/* Bullet (or ordinal): click zooms in, drag moves. */}
        <div className={cn("relative flex h-7 min-w-[18px] shrink-0 items-center justify-center coarse:h-9 coarse:min-w-7", details.checkbox && "coarse:hidden")}>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden
            data-drag-handle
            onPointerDown={(event) => live.current.startDrag(event, row)}
            onClick={(event) => {
              event.stopPropagation();
              const { ol, ui } = live.current;
              ol.dispatch({ type: "hoist", id: row.id });
              ui.setEditing(false);
            }}
            className={cn(
              "group/bullet grid h-[18px] min-w-[18px] cursor-grab touch-none place-items-center rounded-full active:cursor-grabbing coarse:h-7 coarse:min-w-7",
              row.ordinal !== undefined && "rounded-[5px] px-0.5 hover:bg-muted",
            )}
          >
            {row.ordinal !== undefined ? (
              <span dir="ltr" className={cn("font-mono text-[11px] text-muted-foreground tabular-nums", color && "text-foreground/80")}>{row.ordinal}.</span>
            ) : (
              <span
                className={cn(
                  "block rounded-full transition-[width,height,background-color,box-shadow] duration-150",
                  color ? color.dot : "bg-foreground/55",
                  "size-[5px] group-hover/bullet:size-[7px]",
                  row.hasChildren && !row.expanded && "size-[6px] shadow-[0_0_0_4px_color-mix(in_srgb,var(--foreground)_10%,transparent)]",
                  row.completed && !color && "bg-foreground/25",
                  // A mirror's bullet is a ring: the same item, shown here too (the conventional cue).
                  row.mirror && row.mirror !== "copy" && "bg-transparent ring-[1.5px] ring-signal/70",
                )}
              />
            )}
          </button>
        </div>

        {details.checkbox && (
          <div className="flex h-7 w-6 shrink-0 items-center justify-center coarse:h-9 coarse:w-9">
            <TaskCheckbox
              checked={row.completed}
              disabled={!editable}
              onToggle={() => {
                const { ol, ui } = live.current;
                ui.announceToggle(ol.commands.toggleComplete([row.id]));
                // a click in browse mode leaves the keyboard on this row (↑ ↓ Space keep
                // working). Touch has no keyboard cursor; a field being edited keeps its caret.
                if (!coarse && !ui.editing) {
                  ol.dispatch({ type: "select", id: row.id });
                  ui.setHead(row.id);
                  ui.focusList();
                }
              }}
            />
          </div>
        )}

        {/* Content */}
        <div className="min-w-0 flex-1 py-[3px] pe-1 coarse:py-[7px]">
          {flat && row.path && row.path.length > 0 && (
            <div className="mb-px truncate text-2xs text-muted-foreground">{row.path.join(" › ")}</div>
          )}
          <div className={cn("relative", headingClass(heading))}>
            {editingField === "title" ? (
              <RowField row={row} field="title" />
            ) : (
              <span
                ref={titleRef}
                onMouseDown={(event) => {
                  if (editable && !event.shiftKey && !event.metaKey && !event.ctrlKey) event.preventDefault();
                }}
                onClick={(event) => {
                  if (event.shiftKey || event.metaKey || event.ctrlKey) return;
                  event.stopPropagation();
                  beginEdit(event, "title", node.text, titleRef.current);
                }}
                className={cn(
                  "block min-h-[22px] cursor-text transition-colors duration-200",
                  !editable && "cursor-default",
                  row.completed && "text-muted-foreground line-through decoration-muted-foreground/60",
                )}
              >
                {node.text ? (
                  <InlineText
                    source={node.text}
                    marks={row.match?.titleRanges}
                    onTag={(tag) => live.current.ol.setView((view) => ({ ...view, query: tag }))}
                    onRef={(title, id) => live.current.revealItem(id, title)}
                    resolveRef={(id) => live.current.refSource(id)}
                    onDate={(segment, el) =>
                      segment.date &&
                      editable &&
                      live.current.ui.setDatePicker({
                        rowId: row.id,
                        field: "title",
                        start: segment.start,
                        end: segment.end,
                        value: segment.date.value,
                        hasTime: segment.date.hasTime,
                        repeat: segment.date.repeat,
                        rect: el.getBoundingClientRect(),
                      })
                    }
                  />
                ) : (
                  <span className="text-muted-foreground/50">{editable ? "Untitled" : "—"}</span>
                )}
                {row.locked && <Lock aria-hidden className="ms-1.5 inline size-3 -translate-y-px text-muted-foreground" />}
                <RowBadges row={row} starred={starred} />
                {row.summary && row.summary.descendants > 0 && (
                  <FoldSummary summary={row.summary} onExpand={() => live.current.ol.dispatch({ type: "toggle", id: row.id })} />
                )}
              </span>
            )}
          </div>
          <AnimatePresence initial={false}>
            {showNote && (
              <motion.div
                key="note"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={motionTokens.quick}
                className="overflow-hidden"
              >
                {editingField === "note" ? (
                  <RowField row={row} field="note" />
                ) : (
                  <NoteDisplay row={row} firstLine={noteDisplay === "first-line"} readOnly={readOnly} onEdit={(event, el) => beginEdit(event, "note", noteText, el)} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Trailing meta + actions */}
        <div className="flex h-7 shrink-0 items-center gap-1 ps-1 coarse:h-9">
          {coarse ? (
            <button
              type="button"
              tabIndex={-1}
              data-row-actions
              aria-label={rangeMode && cursor ? labels.actionsForSelection(live.current.ol.state.selection.size) : labels.actionsFor(spoken)}
              onClick={(event) => {
                event.stopPropagation();
                openSheet();
              }}
              className={cn(
                "grid size-9 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-focus-within/row:opacity-60 active:bg-muted",
                selected && "opacity-60",
                rangeMode && selected && !cursor && "invisible",
              )}
            >
              <MoreHorizontal className="size-4" />
            </button>
          ) : (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                tabIndex={-1}
                aria-label={rangeMode && cursor ? labels.actionsForSelection(live.current.ol.state.selection.size) : labels.actionsFor(spoken)}
                onClick={(event) => event.stopPropagation()}
                className={cn(
                  "grid size-6 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-[opacity,background-color] group-hover/row:opacity-100 group-focus-within/row:opacity-100 hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:opacity-100",
                  rangeMode && cursor && "opacity-70",
                  rangeMode && selected && !cursor && "invisible",
                )}
              >
                <MoreHorizontal className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" collisionPadding={12} className="w-56" onCloseAutoFocus={(event) => live.current.ui.returnFocus(event)}>
              <ItemMenuContent ids={selected ? [...live.current.ol.state.selection] : [row.id]} row={row} />
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
      </ContextMenuTrigger>
      <ContextMenuContent collisionPadding={12} onCloseAutoFocus={(event) => live.current.ui.returnFocus(event)} className="max-h-[min(70vh,var(--radix-context-menu-content-available-height))] w-56 overflow-y-auto">
        <ItemMenuContent variant="context" ids={selected ? [...live.current.ol.state.selection] : [row.id]} row={row} />
      </ContextMenuContent>
      </ContextMenu>
      </SwipeRow>
    </motion.div>
  );
});

const rowDomId = (id: string) => `ol-row-${id}`;
/** The id links and bookmarks name a row by: a mirror names its source, a copy the item it shows. */
const identityOfRow = (row: OutlinerRow) =>
  row.mirror === "copy" ? row.id.slice(row.id.indexOf("~") + 1) : (row.mirror ?? row.id);

/** Clipboard flavors: lossless JSON (colors, numbering, notes) for outliners, Markdown for everyone else. */
const OUTLINE_MIME = "application/x-fast-outline+json";
/** Three flavors: lossless JSON (us), nested-list HTML (doc editors, note apps, mail), Markdown (everyone). */
function writeClipboard(data: DataTransfer, ol: OutlinerController, ids: readonly string[]) {
  data.setData("text/plain", ol.commands.exportAs("markdown", ids));
  data.setData("text/html", ol.commands.exportHtml(ids));
  data.setData(OUTLINE_MIME, ol.commands.exportAs("json", ids));
}
/** Paste: our JSON first, then structured HTML from other apps, then Markdown/OPML/indented text. */
function readClipboard(data: DataTransfer, ol: OutlinerController, afterId?: string): number | null {
  const json = data.getData(OUTLINE_MIME);
  if (json) {
    const count = ol.commands.importJSON(json, afterId);
    if (count !== null) return count;
  }
  const html = data.getData("text/html");
  if (html && htmlHasStructure(html)) {
    const count = ol.commands.importHtml(html, afterId);
    if (count) return count;
  }
  const text = data.getData("text/plain");
  return text ? ol.commands.importText(text, afterId) : null;
}

/**
 * Windowed rendering for large documents: only rows near the viewport mount, measured for
 * their real (wrapping, note-bearing) height. The cursor row is scrolled into the window
 * before it needs focus, so keyboard travel never lands on an unmounted row.
 */
function VirtualRows({
  rows,
  renderRow,
  scrollEl,
  listRef,
  focusId,
  editing = false,
  register,
}: {
  readonly rows: readonly OutlinerRow[];
  readonly renderRow: (row: OutlinerRow) => React.ReactNode;
  readonly scrollEl: HTMLDivElement | null;
  readonly listRef: React.RefObject<HTMLDivElement | null>;
  readonly focusId: string | null | undefined;
  /** Entering edit mode on a row scrolled out of the window must bring it back (its editor mounts there). */
  readonly editing?: boolean;
  readonly register: OutlinerUi["registerScroller"];
}) {
  const [margin, setMargin] = React.useState(0);
  React.useLayoutEffect(() => {
    const list = listRef.current;
    if (scrollEl && list) setMargin(list.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop);
  }, [scrollEl, listRef]);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => 28,
    overscan: 14,
    scrollMargin: margin,
    // The sticky ancestor strip pads the top while shown; keyboard scrolling must clear it.
    scrollPaddingStart: Number.parseFloat(scrollEl?.style.scrollPaddingTop || "0") || 0,
    getItemKey: (index) => rows[index]!.id,
  });
  // ui.scrollToRow reaches rows outside the window (delete's new selection, links, crumbs).
  const rowsRef = React.useRef(rows);
  rowsRef.current = rows;
  React.useEffect(() => {
    register((id, align) => {
      const index = rowsRef.current.findIndex((row) => row.id === id);
      if (index < 0) return false;
      virtualizer.scrollToIndex(index, { align });
      return true;
    });
    return () => register(null);
  }, [register, virtualizer]);
  // Follow the cursor only when the cursor itself moves while the outliner has focus; a
  // re-filter or a background index shift must never yank the viewport.
  // Keyed on edit mode too: Enter turns the cursor into the caret on the SAME id, and a row
  // outside the window would otherwise "edit" with no editor mounted.
  const focusKey = focusId ? `${focusId}${editing ? "|edit" : ""}` : null;
  const lastFocus = React.useRef(focusKey);
  React.useLayoutEffect(() => {
    if (focusKey === lastFocus.current) return;
    lastFocus.current = focusKey;
    if (!focusId || !listRef.current?.contains(document.activeElement) && document.activeElement !== listRef.current) return;
    const index = rows.findIndex((row) => row.id === focusId);
    if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" });
  }, [focusKey, focusId, rows, virtualizer, listRef]);
  return (
    <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {virtualizer.getVirtualItems().map((item) => (
        <div
          key={item.key}
          data-index={item.index}
          ref={virtualizer.measureElement}
          className="absolute inset-x-0 top-0"
          style={{ transform: `translateY(${item.start - margin}px)` }}
        >
          {renderRow(rows[item.index]!)}
        </div>
      ))}
    </div>
  );
}

interface LiveHandle {
  readonly ol: OutlinerController;
  readonly ui: OutlinerUi;
  readonly startDrag: (event: React.PointerEvent, row: OutlinerRow) => void;
  /** Follow an internal link: by id when known, else search by title. */
  readonly revealItem: (id: string | undefined, title: string) => void;
  /** Current plain title of a link target, or null when it was deleted. */
  readonly resolveRef: (id: string) => string | null;
  /** A link target's raw title source (the link renders its words without chips). */
  readonly refSource: (id: string) => string | null;
}
/** Stable identity forever; `.current` is refreshed every render of <Outliner>. */
const LiveContext = React.createContext<React.RefObject<LiveHandle> | null>(null);
const useLive = () => React.useContext(LiveContext)!;

/**
 * Touch-only swipe actions: right completes, left deletes (with undo). The action is
 * revealed under the row as it moves; past the threshold the icon commits with a nudge.
 */
function SwipeRow({ row, disabled, children }: { readonly row: OutlinerRow; readonly disabled: boolean; readonly children: React.ReactNode }) {
  const live = useLive();
  const coarse = useMediaQuery("(pointer: coarse)");
  const x = useMotionValue(0);
  const completeOpacity = useTransform(x, [0, 24, 72], [0, 0.6, 1]);
  const deleteOpacity = useTransform(x, [-72, -24, 0], [1, 0.6, 0]);
  const iconScale = useTransform(x, [-96, -72, 0, 72, 96], [1.15, 1, 0.8, 1, 1.15]);
  if (!coarse || disabled) return <>{children}</>;
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const { ol } = live.current;
    const offset = info.offset.x;
    if (offset > 72) {
      live.current.ui.announceToggle(ol.commands.toggleComplete([row.id]));
      navigator.vibrate?.(6);
    } else if (offset < -72) {
      deleteItems(live.current, [row.id]);
    }
    animateValue(x, 0, motionTokens.layout);
  };
  return (
    <div className="relative overflow-hidden rounded-md">
      <motion.div aria-hidden style={{ opacity: completeOpacity }} className="absolute inset-0 flex items-center bg-success/15 ps-4 text-success">
        <motion.span style={{ scale: iconScale }}>
          <CircleCheck className="size-5" />
        </motion.span>
      </motion.div>
      <motion.div aria-hidden style={{ opacity: deleteOpacity }} className="absolute inset-0 flex items-center justify-end bg-destructive/12 pe-4 text-destructive">
        <motion.span style={{ scale: iconScale }}>
          <Trash2 className="size-5" />
        </motion.span>
      </motion.div>
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.5}
        dragSnapToOrigin={false}
        style={{ x }}
        onDragEnd={onDragEnd}
        className="relative bg-surface"
      >
        {children}
      </motion.div>
    </div>
  );
}

function headingClass(heading?: 1 | 2 | 3) {
  return heading === 1
    ? "text-[17px] leading-[26px] font-semibold tracking-[-0.01em]"
    : heading === 2
      ? "text-[15px] leading-[22px] font-semibold"
      : heading === 3
        ? "text-[14px] leading-[22px] font-semibold text-foreground/85"
        : "text-[14px] leading-[22px]";
}

function NoteDisplay({
  row,
  firstLine,
  readOnly,
  onEdit,
}: {
  readonly row: OutlinerRow;
  readonly firstLine: boolean;
  readonly readOnly: boolean;
  readonly onEdit: (event: React.MouseEvent, el: HTMLElement | null) => void;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const note = row.details.note ?? "";
  return (
    <span
      ref={ref}
      onMouseDown={(event) => !readOnly && event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onEdit(event, ref.current);
      }}
      className={cn(
        "block cursor-text pt-px text-[13px] leading-5 text-muted-foreground",
        firstLine && "truncate",
        row.completed && "opacity-70",
      )}
    >
      <InlineText source={firstLine ? note.split("\n")[0]! : note} marks={row.match?.noteRanges} />
    </span>
  );
}

/**
 * Quiet trailing marks after a title: a star (bookmarked), a mirror glyph (click reveals the
 * source) and "linked from N" (click zooms in, where the backlinks panel lists them).
 */
function RowBadges({ row, starred }: { readonly row: OutlinerRow; readonly starred: boolean }) {
  const live = useLive();
  const labels = live.current.ui.labels;
  const source = row.mirror && row.mirror !== "copy" ? row.mirror : null;
  if (!starred && !source && !row.backlinks) return null;
  const chip =
    "relative ms-1.5 inline-flex h-[18px] translate-y-[-1px] items-center gap-1 rounded-[5px] px-1 align-middle font-mono text-[10.5px] text-muted-foreground no-underline transition-colors after:absolute after:-inset-1 hover:bg-muted hover:text-foreground coarse:after:-inset-3";
  return (
    <>
      {starred && <Star aria-hidden className="ms-1.5 inline size-3 -translate-y-px fill-current text-warning/80" />}
      {source && (
        <button
          type="button"
          tabIndex={-1}
          title={labels.mirrorOf(live.current.resolveRef(source) ?? labels.untitled)}
          aria-label={labels.mirrorOf(live.current.resolveRef(source) ?? labels.untitled)}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            live.current.revealItem(source, "");
          }}
          className={cn(chip, "text-signal/80")}
        >
          <Repeat2 className="size-3" />
        </button>
      )}
      {!!row.backlinks && (
        <button
          type="button"
          tabIndex={-1}
          title={labels.linkedFrom(row.backlinks)}
          aria-label={labels.linkedFrom(row.backlinks)}
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => {
            event.stopPropagation();
            live.current.ol.dispatch({ type: "hoist", id: row.id });
            live.current.ui.setEditing(false);
          }}
          className={cn(chip, "border border-hairline")}
        >
          <CornerDownRight className="size-3 -scale-x-100 rtl:scale-x-100" />
          <bdi className="tabular-nums">{row.backlinks}</bdi>
        </button>
      )}
    </>
  );
}

function FoldSummary({ summary, onExpand }: { readonly summary: NonNullable<OutlinerRow["summary"]>; readonly onExpand: () => void }) {
  const progress = summary.tasks ? summary.done / summary.tasks : 0;
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={(event) => {
        event.stopPropagation();
        onExpand();
      }}
      onMouseDown={(event) => event.preventDefault()}
      aria-label={`Expand ${summary.descendants} hidden item${summary.descendants === 1 ? "" : "s"}${summary.tasks ? `, ${summary.done} of ${summary.tasks} tasks done` : ""}`}
      title={summary.tasks ? `${summary.done} of ${summary.tasks} tasks done · ${summary.descendants} hidden` : `${summary.descendants} hidden`}
      className="relative ms-2 inline-flex h-[18px] translate-y-[-1px] items-center gap-1.5 rounded-[5px] border border-hairline bg-muted/50 px-1.5 align-middle after:absolute after:-inset-1 coarse:after:-inset-3 font-mono text-[10.5px] text-muted-foreground tabular-nums no-underline transition-colors hover:border-border hover:text-foreground"
    >
      {summary.tasks > 0 && (
        <span className="flex items-center gap-1.5">
          <span className="relative h-[3px] w-4 overflow-hidden rounded-full bg-foreground/15" aria-hidden>
            <motion.span
              className="absolute inset-y-0 start-0 rounded-full"
              initial={false}
              animate={{ width: `${progress * 100}%`, backgroundColor: progress >= 1 ? "var(--success)" : "var(--signal)" }}
              transition={motionTokens.base}
            />
          </span>
          {summary.done}/{summary.tasks}
          {summary.descendants > summary.tasks && <span className="text-muted-foreground/60">+{summary.descendants - summary.tasks}</span>}
        </span>
      )}
      {summary.tasks === 0 && <span>{summary.descendants}</span>}
    </button>
  );
}

function TaskCheckbox({
  checked,
  disabled,
  onToggle,
  focusable = false,
  label,
  className,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly onToggle: () => void;
  /** Rows are one tab stop (the tree); the zoomed title's box is its own stop. */
  readonly focusable?: boolean;
  readonly label?: string;
  readonly className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Mark incomplete" : "Mark complete")}
      disabled={disabled}
      tabIndex={focusable ? 0 : -1}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className={cn(
        "relative grid size-[15px] place-items-center rounded-[4px] border transition-[background-color,border-color,transform] duration-150 outline-none after:absolute after:-inset-1.5 focus-visible:ring-3 focus-visible:ring-signal/30 active:scale-90 disabled:opacity-60 coarse:size-5 coarse:after:-inset-3",
        checked ? "border-signal bg-signal text-signal-foreground" : "border-foreground/30 bg-background hover:border-foreground/55",
        className,
      )}
    >
      <svg viewBox="0 0 12 12" className="size-2.5" aria-hidden>
        <motion.path
          d="M2.5 6.2 5 8.6 9.6 3.6"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={false}
          animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
          transition={motionTokens.quick}
        />
      </svg>
    </button>
  );
}

/* ───────────────────────────── Editing field ───────────────────────────── */

const NATIVE_FIELD_SIZING = typeof CSS !== "undefined" && CSS.supports?.("field-sizing", "content");

function RowField({ row, field }: { readonly row: OutlinerRow; readonly field: "title" | "note" }) {
  const { ol, ui } = useOutlinerContext();
  const ref = React.useRef<HTMLTextAreaElement>(null);
  /** Set when a handled key moves the caret elsewhere; React's synthetic select for the same
   *  keydown would otherwise report this field's stale selection and undo that move. */
  const suppressSelect = React.useRef(false);
  const committed = field === "title" ? row.node.text : (row.details.note ?? "");
  /*
   * a keystroke paints from this local draft; the document update (and every part of the
   * outliner that renders from it) follows as a transition. The store itself updates
   * synchronously, so the next key, Enter or ⌘Z always builds on every character typed. The draft
   * is current only while it is ahead of what has rendered (`renderedSeq`): any later render
   * (the transition, an undo, a refusal) shows the document again.
   */
  const [draft, setDraft] = React.useState<{ readonly text: string; readonly seq: number } | null>(null);
  const value = draft && draft.seq > ol.renderedSeq ? draft.text : committed;
  const ac = useAutocomplete(ol, row, field);
  const listId = React.useId();

  // Autosize: native field-sizing where supported, otherwise measure on value and width changes.
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || NATIVE_FIELD_SIZING) return;
    const fit = () => {
      el.style.height = "0px";
      el.style.height = `${el.scrollHeight}px`;
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement ?? el);
    return () => observer.disconnect();
  }, [value]);

  // Focus + caret placement whenever the core moves the caret to this field.
  const caret = ol.state.caret;
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !caret || caret.id !== row.id) return;
    if ((caret.field ?? "title") !== field) return;
    // Typing in this very field: the browser already placed and revealed the caret. Skipping
    // the forced layout of scrollIntoView keeps each keystroke to one layout pass.
    if (document.activeElement === el && el.selectionStart === caret.start && el.selectionEnd === caret.end) return;
    // Keys typed after this render's document (draft ahead): the browser's caret is the truth.
    if (document.activeElement === el && draft && draft.seq > ol.renderedSeq) return;
    if (document.activeElement !== el) el.focus({ preventScroll: true });
    if (el.selectionStart !== caret.start || el.selectionEnd !== caret.end) el.setSelectionRange(caret.start, caret.end);
    el.scrollIntoView({ block: "nearest" });
    // focusVersion changes signal deliberate caret moves (split, merge, undo, navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ol.state.focusVersion, row.id, field]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const el = event.currentTarget;
    if (event.nativeEvent.isComposing) return;
    if (ac.onKeyDown(event)) {
      suppressSelect.current = true;
      return;
    }
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key;
    const lower = key.toLowerCase();
    const start = el.selectionStart,
      end = el.selectionEnd;
    const dispatch = ol.dispatch;
    suppressSelect.current = false;
    const prevent = () => {
      event.preventDefault();
      event.stopPropagation();
      suppressSelect.current = true;
    };

    if (mod && lower === "z") {
      prevent();
      dispatch({ type: event.shiftKey ? "redo" : "undo" });
      return;
    }
    if (event.ctrlKey && !event.metaKey && lower === "y") {
      prevent();
      dispatch({ type: "redo" });
      return;
    }
    if (key === "Escape") {
      prevent();
      ui.setEditing(false);
      ui.focusList();
      dispatch({ type: "select", id: row.id });
      ui.setHead(row.id);
      return;
    }
    if (key === "Enter" && mod) {
      prevent();
      ui.announceToggle(ol.commands.toggleComplete([row.id]));
      return;
    }
    if (key === "Enter" && event.shiftKey && !mod) {
      prevent();
      if (field === "title") dispatch({ type: "focus", id: row.id, field: "note", start: (row.details.note ?? "").length });
      else dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      return;
    }
    if (field === "note") {
      // Notes are multiline: plain Enter inserts a newline. Arrow keys leave at the edges.
      if (key === "ArrowUp" && textareaAtVisualBoundary(el, "up")) {
        prevent();
        dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      } else if (key === "ArrowDown" && textareaAtVisualBoundary(el, "down")) {
        prevent();
        moveVertical(row.id, "down", el);
      } else if (key === "Backspace" && start === 0 && end === 0 && !value) {
        prevent();
        dispatch({ type: "focus", id: row.id, start: row.node.text.length });
      }
      if (key !== "Tab") return;
    }
    if (key === "Enter") {
      prevent();
      dispatch({ type: "split", id: row.id, start, end, newId: createOutlineId() });
      return;
    }
    if (key === "Tab") {
      prevent();
      dispatch({ type: event.shiftKey ? "outdent" : "indent", ids: [row.id] });
      return;
    }
    if (key === "Backspace" && start === 0 && end === 0 && !mod) {
      prevent();
      if (!value && !row.hasChildren && row.details.checkbox) {
        ol.commands.toggleCheckbox([row.id]);
        return;
      }
      dispatch({ type: "merge", id: row.id, direction: "backward" });
      return;
    }
    if (key === "Delete" && start === value.length && end === value.length && !mod) {
      prevent();
      dispatch({ type: "merge", id: row.id, direction: "forward" });
      return;
    }
    if ((event.altKey && event.shiftKey) || (mod && event.shiftKey)) {
      if (key === "ArrowUp" || key === "ArrowDown") {
        prevent();
        dispatch({ type: "move", direction: key === "ArrowUp" ? "up" : "down", ids: [row.id] });
        return;
      }
    }
    if (key === "ArrowUp" && !mod && !event.shiftKey && !event.altKey && textareaAtVisualBoundary(el, "up")) {
      prevent();
      moveVertical(row.id, "up", el);
      return;
    }
    if (key === "ArrowDown" && !mod && !event.shiftKey && !event.altKey && textareaAtVisualBoundary(el, "down")) {
      prevent();
      moveVertical(row.id, "down", el);
      return;
    }
    if (mod && key === ".") {
      prevent();
      if (row.hasChildren) dispatch({ type: "toggle", id: row.id });
      return;
    }
    if (mod && key === "]") {
      prevent();
      dispatch({ type: "hoist", id: row.id });
      return;
    }
    if (mod && key === "[") {
      prevent();
      const crumbs = ol.breadcrumbs;
      dispatch({ type: "hoist", id: crumbs.at(-2)?.id ?? null });
      return;
    }
    if (mod && event.shiftKey && lower === "c") {
      prevent();
      ol.commands.toggleCheckbox([row.id]);
      return;
    }
    if (mod && event.altKey && ["1", "2", "3", "0"].includes(key)) {
      prevent();
      ol.commands.setHeading([row.id], key === "0" ? undefined : (Number(key) as 1 | 2 | 3));
      return;
    }
    if (mod && event.altKey && lower === "h") {
      prevent();
      ol.setView((view) => ({ ...view, hideCompleted: !view.hideCompleted }));
      return;
    }
    if (mod && lower === "a" && start === 0 && end === value.length) {
      prevent();
      ui.setEditing(false);
      dispatch({ type: "select-all" });
      ui.focusList();
      return;
    }
    const wrap = (open: string, close = open) => {
      prevent();
      const selected = value.slice(start, end);
      const next = value.slice(0, start) + open + selected + close + value.slice(end);
      dispatch({ type: field === "note" ? "note" : "text", id: row.id, text: next, caret: end + open.length });
      requestAnimationFrame(() => el.setSelectionRange(start + open.length, end + open.length));
    };
    if (mod && !event.shiftKey && lower === "b") return wrap("**");
    if (mod && !event.shiftKey && lower === "i") return wrap("__");
    if (mod && !event.shiftKey && lower === "e") return wrap("`");
    if (mod && event.shiftKey && lower === "x") return wrap("~~");
    if (mod && event.shiftKey && lower === "h") return wrap("==");
  };

  const moveVertical = (id: string, direction: "up" | "down", el: HTMLTextAreaElement) => {
    const index = ol.rows.findIndex((candidate) => candidate.id === id);
    const target = ol.rows[direction === "up" ? index - 1 : index + 1];
    if (!target) return;
    const caretRect = textareaCaretRect(el, el.selectionStart);
    const targetEl = ui.listRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(target.id)}"] [data-src]`)?.closest<HTMLElement>("span.block");
    let offset = direction === "up" ? target.node.text.length : 0;
    if (targetEl) {
      const box = targetEl.getBoundingClientRect();
      const y = direction === "up" ? box.bottom - 6 : box.top + 6;
      offset = sourceOffsetFromPoint(targetEl, caretRect.left, y, target.node.text.length);
    }
    ol.dispatch({ type: "focus", id: target.id, start: offset });
  };

  return (
    <>
    <AutocompletePopover anchor={ref.current} state={ac} listId={listId} />
    <textarea
      ref={ref}
      rows={1}
      value={value}
      data-field={field}
      aria-label={field === "title" ? "Item text" : "Item note"}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={ac.open}
      aria-controls={ac.open ? listId : undefined}
      aria-activedescendant={ac.open ? `${listId}-${ac.active}` : undefined}
      spellCheck
      onMouseDown={() => (suppressSelect.current = false)}
      onChange={(event) => {
        const text = event.target.value;
        const caret = event.target.selectionStart;
        // The host hears about it now (its own render is a transition); ours follows the paint.
        React.startTransition(() => {
          ol.dispatch({ type: field === "note" ? "note" : "text", id: row.id, text, caret, time: Date.now() }, { afterPaint: true });
        });
        setDraft({ text, seq: ol.currentSeq() });
        ac.sync(event.target, true);
      }}
      onSelect={(event) => {
        const el = event.currentTarget;
        // React can deliver a trailing select for a field that just lost focus (e.g. after
        // Shift+Enter moved to the note); only the focused field may report the caret.
        if (suppressSelect.current || !el.isConnected || document.activeElement !== el) return;
        ac.sync(el);
        ol.dispatch({
          type: "caret",
          id: row.id,
          start: el.selectionStart,
          end: el.selectionEnd,
          ...(field === "note" ? { field: "note" as const } : {}),
        });
      }}
      onFocus={() => ui.setEditing(true)}
      onKeyDown={onKeyDown}
      onPaste={(event) => {
        const text = event.clipboardData.getData("text/plain");
        const rich = event.clipboardData.types.includes(OUTLINE_MIME) || htmlHasStructure(event.clipboardData.getData("text/html"));
        if (field === "note" || (!text.includes("\n") && !rich)) return;
        // One parser for every paste path (row, list, file import): lossless JSON flavor first,
        // then Markdown/OPML/indented text.
        event.preventDefault();
        const replaceEmpty = !row.node.text && !row.hasChildren;
        const count = readClipboard(event.clipboardData, ol, row.id) ?? 0;
        if (count && replaceEmpty) ol.dispatch({ type: "delete", ids: [row.id] });
        ui.announce(ui.labels.pasted(count));
      }}
      placeholder={field === "note" ? "Note" : ""}
      dir="auto"
      className={cn(
        "block w-full resize-none overflow-hidden border-0 bg-transparent p-0 outline-none [field-sizing:content] placeholder:text-muted-foreground/50",
        field === "title" ? "min-h-[22px] caret-signal" : "pt-px text-[13px] leading-5 text-muted-foreground caret-signal",
        field === "title" && row.completed && "text-muted-foreground",
      )}
    />
    </>
  );
}

/* ───────────────────────────── Row-selection keyboard mode ───────────────────────────── */

function onSelectionKey(event: React.KeyboardEvent, ol: ReturnType<typeof useOutliner>, ui: OutlinerUi) {
  if (ui.editing || event.target !== event.currentTarget) return;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key;
  const rows = ol.rows;
  const selection = [...ol.state.selection];
  // Movement starts from the moving end of a range (head), falling back to the anchor.
  const anchor =
    ui.head && (ol.state.selection.has(ui.head) || !ol.state.selection.size) ? ui.head : ol.state.selectionAnchor;
  const index = rows.findIndex((row) => row.id === anchor);
  const prevent = () => event.preventDefault();
  const go = (next: number, extend = false) => {
    const target = rows[Math.max(0, Math.min(rows.length - 1, next))];
    if (!target) return;
    ol.dispatch({ type: "select", id: target.id, extend });
    ui.setHead(target.id);
    ui.listRef.current?.querySelector(`[data-row="${CSS.escape(target.id)}"]`)?.scrollIntoView({ block: "nearest" });
  };
  if (mod && key.toLowerCase() === "z") {
    prevent();
    ol.dispatch({ type: event.shiftKey ? "redo" : "undo" });
  } else if (key === "ArrowDown" && (event.altKey || mod) && event.shiftKey) {
    prevent();
    ol.dispatch({ type: "move", direction: "down", ids: selection });
  } else if (key === "ArrowUp" && (event.altKey || mod) && event.shiftKey) {
    prevent();
    ol.dispatch({ type: "move", direction: "up", ids: selection });
  } else if (key === "ArrowDown") {
    prevent();
    go(index < 0 ? 0 : index + 1, event.shiftKey);
  } else if (key === "ArrowUp") {
    prevent();
    go(index < 0 ? rows.length - 1 : index - 1, event.shiftKey);
  } else if (key === "Home") {
    prevent();
    go(0, event.shiftKey);
  } else if (key === "End") {
    prevent();
    go(rows.length - 1, event.shiftKey);
  } else if (key === "ArrowRight" && anchor) {
    prevent();
    const row = rows[index];
    if (row?.hasChildren && !row.expanded) ol.dispatch({ type: "toggle", id: row.id });
    else go(index + 1);
  } else if (key === "ArrowLeft" && anchor) {
    prevent();
    const row = rows[index];
    if (row?.hasChildren && row.expanded) ol.dispatch({ type: "toggle", id: row.id });
    else if (row?.parentId) go(rows.findIndex((candidate) => candidate.id === row.parentId));
  } else if (key === "Enter" && anchor && !ol.readOnly) {
    prevent();
    if (mod) ui.announceToggle(ol.commands.toggleComplete(selection));
    else {
      const row = rows[index];
      ol.dispatch({ type: "focus", id: anchor, start: row?.node.text.length ?? 0 });
      ui.setEditing(true);
    }
  } else if (key === " " && selection.length) {
    prevent();
    ui.announceToggle(ol.commands.toggleComplete(selection));
  } else if (key === "Tab" && selection.length) {
    prevent();
    const outcome = ol.commands.shift(selection, event.shiftKey ? "outdent" : "indent");
    // Refusals toast on their own; a no-op (nothing to indent under) says so instead of lying.
    if (outcome === "moved") ui.announce(event.shiftKey ? "Outdented" : "Indented");
    else if (outcome === "noop") ui.announce(event.shiftKey ? "Can't outdent further" : "Can't indent here");
  } else if ((key === "Backspace" || key === "Delete") && selection.length && !ol.readOnly) {
    prevent();
    deleteItems({ ol, ui }, selection);
  } else if (key === "Escape") {
    prevent();
    if (anchor) ui.setHead(anchor);
    ol.dispatch({ type: "clear-selection" });
  } else if (mod && key.toLowerCase() === "a") {
    prevent();
    ol.dispatch({ type: "select-all" });
  } else if (mod && key === "]" && anchor) {
    prevent();
    ol.dispatch({ type: "hoist", id: anchor });
  } else if (mod && key === "[") {
    prevent();
    ol.dispatch({ type: "hoist", id: ol.breadcrumbs.at(-2)?.id ?? null });
  } else if (mod && key === "." && anchor) {
    prevent();
    ol.dispatch({ type: "toggle", id: anchor });
  }
}

function subtreeIds(node: OutlinerRow["node"]): string[] {
  const ids: string[] = [];
  const stack = [node];
  while (stack.length) {
    const next = stack.pop()!;
    if (next.children?.length) ids.push(next.id);
    stack.push(...(next.children ?? []));
  }
  return ids;
}

/* ───────────────────────────── Drag to reorder ───────────────────────────── */

interface DragState {
  readonly ids: readonly string[];
  readonly label: string;
  readonly pointer: { readonly x: number; readonly y: number };
  readonly gap: number;
  readonly depth: number;
  readonly top: number;
  readonly left: number;
  readonly valid: boolean;
  /** A folded row the pointer rests on: it opens after HOVER_EXPAND_MS (list-relative box). */
  readonly hover: { readonly id: string; readonly top: number; readonly height: number } | null;
}

/** How long the pointer rests on a folded row during a drag before it opens. */
const HOVER_EXPAND_MS = 600;

/**
 * Pointer-driven move. The bullet is the handle (mouse: drag past 4px; touch: long-press).
 * Horizontal offset chooses nesting depth; the core's planOutlineDrop resolves the final
 * parent/index so a gap never adopts the row below it by accident. Resting on a folded row
 * opens it; rows opened that way fold again unless the drop landed inside them, and Esc
 * cancels the whole drag (and folds them all back).
 */
function useRowDrag() {
  const { ol, ui } = useOutlinerContext();
  const [state, setState] = React.useState<DragState | null>(null);
  const live = React.useRef<DragState | null>(null);
  // Rows change mid-drag (hover-expand): handlers read the controller of the latest render.
  const latest = React.useRef(ol);
  latest.current = ol;
  const baseDepth = ol.breadcrumbs.length;

  const start = React.useCallback(
    (event: React.PointerEvent, row: OutlinerRow) => {
      if (ol.readOnly || row.locked || event.button !== 0 || ol.view.query) return;
      const startX = event.clientX,
        startY = event.clientY;
      const touch = event.pointerType !== "mouse";
      const pointerId = event.pointerId;
      const target = event.currentTarget as HTMLElement;
      let active = false;
      let timer: number | undefined;
      const ids = ol.state.selection.has(row.id) ? [...ol.state.selection] : [row.id];
      const moving = new Set(ids);
      const label = ids.length > 1 ? `${ids.length} items` : inlineToPlain(row.node.text) || "Untitled";
      const scroller = ui.listRef.current?.closest<HTMLElement>("[data-outliner-scroll]") ?? null;
      let pointer = { x: startX, y: startY };
      let frame = 0;
      /** Folded rows this drag opened, in order; folded back unless the drop lands inside. */
      const opened: string[] = [];
      let hoverId: string | null = null;
      let hoverTimer: number | undefined;
      const clearHover = () => {
        window.clearTimeout(hoverTimer);
        hoverTimer = undefined;
        hoverId = null;
      };
      // Auto-scroll while the pointer rests near the scroller's top or bottom edge.
      const tick = () => {
        if (!active || !scroller) return;
        const box = scroller.getBoundingClientRect();
        const edge = 48;
        const delta = pointer.y < box.top + edge ? -(box.top + edge - pointer.y) : pointer.y > box.bottom - edge ? pointer.y - (box.bottom - edge) : 0;
        if (delta) {
          scroller.scrollTop += Math.max(-18, Math.min(18, delta / 3));
          update(pointer.x, pointer.y);
        }
        frame = requestAnimationFrame(tick);
      };
      const onKey = (key: KeyboardEvent) => {
        if (key.key === "Escape" && active) {
          key.preventDefault();
          key.stopPropagation();
          live.current = null;
          cleanup(null);
        }
      };

      const activate = () => {
        active = true;
        frame = requestAnimationFrame(tick);
        window.addEventListener("keydown", onKey, true);
        target.setPointerCapture?.(pointerId);
        navigator.vibrate?.(8);
        ui.setEditing(false);
      };
      if (touch) timer = window.setTimeout(activate, 260);

      const update = (x: number, y: number) => {
        const list = ui.listRef.current;
        if (!list) return;
        const rows = latest.current.rows;
        const rowEls = [...list.querySelectorAll<HTMLElement>("[data-row]")].filter((el) => !moving.has(el.dataset.row!));
        const listBox = list.getBoundingClientRect();
        let gap = rowEls.length;
        let lineTop = rowEls.length ? rowEls.at(-1)!.getBoundingClientRect().bottom - listBox.top : 0;
        let over: { id: string; top: number; height: number } | null = null;
        for (let i = 0; i < rowEls.length; i++) {
          const box = rowEls[i]!.getBoundingClientRect();
          if (!over && y >= box.top && y < box.bottom) over = { id: rowEls[i]!.dataset.row!, top: box.top - listBox.top, height: box.height };
          if (y < box.top + box.height / 2) {
            gap = i;
            lineTop = box.top - listBox.top;
            break;
          }
        }
        // Resting on a folded row opens it after a beat; moving off it cancels the timer.
        const overRow = over ? rows.find((r) => r.id === over!.id) : undefined;
        const folded = overRow && overRow.hasChildren && !overRow.expanded && !overRow.locked ? overRow.id : null;
        if (folded !== hoverId) {
          clearHover();
          if (folded) {
            hoverId = folded;
            hoverTimer = window.setTimeout(() => {
              if (!active || hoverId !== folded) return;
              latest.current.dispatch({ type: "expand", ids: [folded], expanded: true });
              opened.push(folded);
              clearHover();
              navigator.vibrate?.(4);
              // The children just mounted: re-measure gaps under the resting pointer.
              requestAnimationFrame(() => requestAnimationFrame(() => active && update(pointer.x, pointer.y)));
            }, HOVER_EXPAND_MS);
          }
        }
        const visibleIds = rowEls.map((el) => el.dataset.row!);
        const prev = gap > 0 ? rows.find((r) => r.id === visibleIds[gap - 1]) : undefined;
        const originDepth = rows.find((r) => r.id === row.id)?.depth ?? 0;
        const unit = indentPx(list);
        const rtl = getComputedStyle(list).direction === "rtl";
        const wanted = originDepth + Math.round((x - startX) / unit) * (rtl ? -1 : 1);
        const maxDepth = prev ? prev.depth + 1 : 0;
        const depth = Math.max(0, Math.min(maxDepth, wanted));
        const allVisible = rows.map((r) => r.id);
        const gapInAll = gap < visibleIds.length ? allVisible.indexOf(visibleIds[gap]!) : allVisible.length;
        const remainingBefore = allVisible.slice(0, gapInAll).filter((id) => !moving.has(id)).length;
        const plan = planOutlineDrop(latest.current.state.nodes, allVisible, ids, remainingBefore, depth + baseDepth);
        const next: DragState = {
          ids,
          label,
          pointer: { x, y },
          gap,
          depth,
          top: lineTop,
          left: depth * unit + 30,
          valid: !!plan && plan.depth >= baseDepth,
          hover: hoverId && over?.id === hoverId ? over : null,
        };
        live.current = next;
        setState(next);
      };

      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        if (!active) {
          const distance = Math.hypot(move.clientX - startX, move.clientY - startY);
          if (touch) {
            if (distance > 8) cleanup(null);
            return;
          }
          if (distance < 4) return;
          activate();
        }
        move.preventDefault();
        pointer = { x: move.clientX, y: move.clientY };
        update(move.clientX, move.clientY);
      };
      const onUp = () => {
        const final = live.current;
        let landedIn: string | null = null;
        if (active && final?.valid) {
          const current = latest.current;
          const allVisible = current.rows.map((r) => r.id);
          const list = ui.listRef.current!;
          const rowEls = [...list.querySelectorAll<HTMLElement>("[data-row]")].filter((el) => !moving.has(el.dataset.row!));
          const visibleIds = rowEls.map((el) => el.dataset.row!);
          const gapInAll = final.gap < visibleIds.length ? allVisible.indexOf(visibleIds[final.gap]!) : allVisible.length;
          const remainingBefore = allVisible.slice(0, gapInAll).filter((id) => !moving.has(id)).length;
          const plan = planOutlineDrop(current.state.nodes, allVisible, ids, remainingBefore, final.depth + baseDepth);
          if (plan) {
            current.dispatch({ type: "drop", ids, parentId: plan.parentId, index: plan.index });
            landedIn = plan.parentId;
          }
        }
        if (active) {
          // Swallow the click that follows a drag so it doesn't zoom.
          const swallow = (click: MouseEvent) => {
            click.stopPropagation();
            click.preventDefault();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        }
        cleanup(landedIn);
      };
      /** `landedIn`: the drop's parent (its ancestors stay open); null folds every hover-opened row. */
      const cleanup = (landedIn: string | null) => {
        window.clearTimeout(timer);
        clearHover();
        cancelAnimationFrame(frame);
        window.removeEventListener("keydown", onKey, true);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        if (opened.length) {
          const current = latest.current;
          const keep = new Set(landedIn ? getOutlinePath(current.state.nodes, landedIn).map((node) => node.id) : []);
          const refold = opened.filter((id) => !keep.has(id));
          if (refold.length) current.dispatch({ type: "expand", ids: refold, expanded: false });
        }
        live.current = null;
        setState(null);
      };
      const onCancel = () => cleanup(null);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
    },
    [ol, ui, baseDepth],
  );
  return { state, start };
}

function DropIndicator({ drag }: { readonly drag: DragState | null }) {
  return (
    <AnimatePresence>
      {drag?.hover && (
        <motion.div
          key={`hover-${drag.hover.id}`}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={motionTokens.quick}
          style={{ top: drag.hover.top, height: drag.hover.height }}
          className="pointer-events-none absolute inset-x-0 z-0 overflow-hidden rounded-md bg-signal/[0.06] ring-1 ring-signal/20 ring-inset"
        >
          {/* Fills while the folded row waits to open: the wait is visible, never a surprise. */}
          <motion.span
            className="absolute inset-y-0 start-0 block bg-signal/[0.07]"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: HOVER_EXPAND_MS / 1000, ease: "linear" }}
          />
        </motion.div>
      )}
      {drag && (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: drag.valid ? 1 : 0.35, top: drag.top - 1, insetInlineStart: drag.left }}
          exit={{ opacity: 0 }}
          transition={{ top: { duration: 0.08 }, insetInlineStart: { duration: 0.08 }, opacity: motionTokens.quick }}
          className="pointer-events-none absolute inset-e-0 z-10 h-0.5 rounded-full bg-signal"
        >
          <span className="absolute -top-[3px] -start-1 size-2 rounded-full border-2 border-signal bg-surface" />
        </motion.div>
      )}
      {drag && (
        <motion.div
          key="ghost"
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={motionTokens.quick}
          // Below and after the pointer, so the row being dropped onto stays readable.
          style={{ position: "fixed", left: drag.pointer.x + 14, top: drag.pointer.y + 14 }}
          className="pointer-events-none z-50 flex max-w-64 items-center gap-2 rounded-md border bg-popover px-2 py-1 text-ui shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]"
        >
          <span className="size-1.5 shrink-0 rounded-full bg-signal" />
          <span className="truncate">{drag.label}</span>
          {!drag.valid && <span className="shrink-0 font-mono text-[10px] text-destructive">can't drop</span>}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

