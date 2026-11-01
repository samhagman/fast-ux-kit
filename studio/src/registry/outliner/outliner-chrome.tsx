import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDownAZ,
  ArrowDown,
  ArrowUp,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleCheck,
  Copy,
  CornerDownRight,
  EyeOff,
  Focus,
  Heading1,
  Heading2,
  Heading3,
  IndentDecrease,
  IndentIncrease,
  Keyboard,
  ListOrdered,
  MoveRight,
  Palette,
  Redo2,
  Repeat2,
  Search,
  Star,
  History,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ChevronDown,
  CalendarRange,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import { findOutlineNode, getOutlinePath } from "@fux/core";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { motionTokens, rise } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { formatDateToken, formatRepeat, inlineToPlain, inlineToSpeech, spokenDate, type DateRepeat } from "./inline";
import { shortcutLabel, type Keymap, type ShortcutId } from "./keymap";
import { useOutlinerContext, usePlatformKeys, type PlatformKeys } from "./context";
import { COLOR_STYLES, OUTLINE_COLORS, type OutlineItem } from "./types";
import type { OutlinerRow } from "./use-outliner";
import { deleteItems, useItemActions, type ItemAction, type ItemEntry, type ItemSubmenu } from "./item-actions";
import { mirrorOf } from "./mirrors";
import { PrintCommandItem, ViewCommandItems } from "./outliner-views";

/* ───────────────────────────── Item menu ───────────────────────────── */

const DROPDOWN = {
  Item: DropdownMenuItem,
  Label: DropdownMenuLabel,
  Separator: DropdownMenuSeparator,
  Shortcut: DropdownMenuShortcut,
  Sub: DropdownMenuSub,
  SubContent: DropdownMenuSubContent,
  SubTrigger: DropdownMenuSubTrigger,
};
const CONTEXT = {
  Item: ContextMenuItem,
  Label: ContextMenuLabel,
  Separator: ContextMenuSeparator,
  Shortcut: ContextMenuShortcut,
  Sub: ContextMenuSub,
  SubContent: ContextMenuSubContent,
  SubTrigger: ContextMenuSubTrigger,
} as unknown as typeof DROPDOWN;

export { deleteItems };

/** The shared item actions (item-actions.tsx) as a dropdown (⋯) or a context menu (right-click). */
export function ItemMenuContent({
  ids,
  row,
  variant = "dropdown",
}: {
  readonly ids: readonly string[];
  readonly row: OutlinerRow;
  readonly variant?: "dropdown" | "context";
}) {
  const { ui } = useOutlinerContext();
  const M = variant === "context" ? CONTEXT : DROPDOWN;
  const entries = useItemActions(ids, row);
  const render = (entry: ItemEntry): React.ReactNode => {
    if (entry.kind === "separator") return <M.Separator key={entry.id} />;
    if (entry.kind === "submenu")
      return (
        <M.Sub key={entry.id}>
          <M.SubTrigger disabled={entry.disabled}>
            {entry.icon} <bdi>{entry.label}</bdi>
          </M.SubTrigger>
          <M.SubContent className="w-52">{entry.items.map(render)}</M.SubContent>
        </M.Sub>
      );
    return (
      <M.Item key={entry.id} variant={entry.destructive ? "destructive" : undefined} disabled={entry.disabled} onSelect={entry.run}>
        {entry.icon} <bdi>{entry.label}</bdi>
        {entry.current && <span className="ms-auto text-signal">●</span>}
        {entry.shortcut && <M.Shortcut dir="ltr">{entry.shortcut}</M.Shortcut>}
      </M.Item>
    );
  };
  return (
    <>
      {ids.length > 1 && (
        <M.Label className="font-mono text-2xs font-medium tracking-wide text-muted-foreground uppercase">
          <bdi>{ui.labels.selectionHeader(ids.length)}</bdi>
        </M.Label>
      )}
      {entries.map(render)}
    </>
  );
}

/* ───────────────────────────── Phone action sheet ───────────────────────────── */

/**
 * Touch: long-press (or ⋯) opens a modal bottom sheet titled with the item (or "4 items"), with
 * the same actions as the menus as 44 px rows. A submenu (Format, Color, Sort) slides in as a
 * second page with a Back row. The list scrolls inside the sheet; the safe area is respected.
 */
export function OutlinerActionSheet() {
  const { ol, ui } = useOutlinerContext();
  const request = ui.sheet;
  const last = React.useRef<typeof request>(null);
  if (request) last.current = request;
  // Board cards are not outline rows: the controller makes a row for any item.
  const row = request ? ol.rowOf(request.rowId) : null;
  const open = !!request && !!row;
  const content = React.useRef<HTMLDivElement>(null);
  /*
   * the target row is never covered. It is lifted to just under the toolbar (the list has
   * spare room below while the sheet is open), and the sheet is capped so it stops below the
   * row; a very tall row keeps at least its first lines in view.
   */
  const [maxHeight, setMaxHeight] = React.useState<number | undefined>(undefined);
  const rowId = open ? request.rowId : null;
  React.useLayoutEffect(() => {
    if (!rowId) {
      setMaxHeight(undefined);
      return;
    }
    const scroller = ui.rootRef.current?.querySelector<HTMLElement>("[data-outliner-scroll]");
    const el = scroller?.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowId)}"]`);
    if (!scroller || !el) return;
    scroller.setAttribute("data-sheet-open", "");
    const top = scroller.getBoundingClientRect().top;
    scroller.scrollTop += el.getBoundingClientRect().top - top - 8;
    const viewport = window.visualViewport?.height ?? window.innerHeight;
    const bottom = Math.min(el.getBoundingClientRect().bottom, top + viewport * 0.4);
    setMaxHeight(Math.max(viewport * 0.4, Math.floor(viewport - bottom - 12)));
  }, [rowId, ui.rootRef]);
  return (
    <Drawer open={open} onOpenChange={(next) => !next && ui.setSheet(null)} autoFocus>
      <DrawerContent
        ref={content}
        data-outliner-sheet
        style={maxHeight ? { maxHeight } : undefined}
        className="pb-[env(safe-area-inset-bottom)]"
        onOpenAutoFocus={(event) => {
          // Focus starts on the first real action (never <body>, never the drag handle).
          event.preventDefault();
          content.current?.querySelector<HTMLElement>("[role=menuitem]:not(:disabled)")?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          // A row selected only to mark the sheet's target goes back to unselected (no surprise
          // touch-selection mode); an action that changed the selection keeps its result.
          const closed = last.current;
          const selection = ol.latestSelection();
          if (closed?.marked && selection.size === 1 && selection.has(closed.rowId)) ol.dispatch({ type: "clear-selection" });
          // Focus goes back to the row the sheet acted on: its ⋯ button (focusing the tree
          // itself would select a row and drop the phone into selection mode). A field or a
          // dialog an action opened keeps its focus.
          event.preventDefault();
          requestAnimationFrame(() => {
            const active = document.activeElement;
            if (active && active !== document.body && !active.closest("[data-outliner-sheet]")) return;
            const root = ui.rootRef.current;
            const actions = (id: string) => root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(id)}"] [data-row-actions]`);
            const target =
              (closed && actions(closed.rowId)) ?? [...ol.latestSelection()].map(actions).find(Boolean) ?? null;
            if (target) {
              target.focus({ preventScroll: true });
              // The row was lifted under the toolbar while the sheet hid the ancestor strip: keep it clear of the strip.
              if (closed) ui.scrollToRow(closed.rowId);
            }
            // Never the tree on touch (it would select the first row and jump to the top): the toolbar.
            else root?.querySelector<HTMLElement>("[data-view-menu-trigger]")?.focus({ preventScroll: true });
          });
        }}
      >
        {request && row && (
          <ActionSheetBody
            ids={request.ids}
            row={row}
            onRun={(action) => {
              // "Select" asks for the selection on purpose: keep it after the sheet closes.
              if (action.id === "select" && last.current) last.current = { ...last.current, marked: false };
            }}
          />
        )}
      </DrawerContent>
    </Drawer>
  );
}

function ActionSheetBody({ ids, row, onRun }: { readonly ids: readonly string[]; readonly row: OutlinerRow; readonly onRun: (action: ItemAction) => void }) {
  const { ol, ui } = useOutlinerContext();
  const entries = useItemActions(ids, row);
  const [page, setPage] = React.useState<ItemSubmenu | null>(null);
  const list = React.useRef<HTMLDivElement>(null);
  // Paging keeps keyboard focus: into a page lands on its first item, Back on the entry that opened it.
  const cameFrom = React.useRef<string | null>(null);
  const turned = React.useRef(false);
  React.useEffect(() => {
    if (!turned.current) return;
    const el = list.current;
    const target = page
      ? el?.querySelector<HTMLElement>("[role=menuitem]:not([data-sheet-back]):not(:disabled)")
      : cameFrom.current
        ? el?.querySelector<HTMLElement>(`[data-entry="${CSS.escape(cameFrom.current)}"]`)
        : null;
    target?.focus({ preventScroll: true });
  }, [page]);
  const turn = (next: ItemSubmenu | null) => {
    turned.current = true;
    if (next) cameFrom.current = next.id;
    setPage(next);
  };
  const resolve = (id: string) => {
    const node = findOutlineNode(ol.state.nodes, id)?.node;
    return node ? inlineToPlain(node.text) : null;
  };
  const title = ids.length > 1 ? ui.labels.selectionHeader(ids.length) : inlineToPlain(row.node.text, resolve) || ui.labels.untitled;
  const path = getOutlinePath(ol.state.nodes, row.id)
    .slice(0, -1)
    .map((node) => inlineToPlain(node.text) || ui.labels.untitled)
    .join(" › ");
  const run = (action: ItemAction) => {
    onRun(action);
    ui.setSheet(null);
    // Let the sheet start closing first: actions that open the palette or a field need focus.
    requestAnimationFrame(() => action.run());
  };
  const items = page ? page.items : entries;
  return (
    <>
      <DrawerHeader className="gap-0 px-4 pt-2 pb-2 text-start! md:text-start">
        <DrawerTitle className="line-clamp-2 text-[15px] leading-6 font-semibold">{title}</DrawerTitle>
        {/* The path above the item (a top-level item has none: the title already says it all,
            so the description is for screen readers only rather than repeating the title). */}
        <DrawerDescription className={cn("font-mono text-[11px] text-muted-foreground", !page && ids.length === 1 && !path && "sr-only")}>
          {page ? page.label : ids.length > 1 ? `${ui.labels.actionsForSelection(ids.length)}` : path || inlineToSpeech(row.node.text, resolve)}
        </DrawerDescription>
      </DrawerHeader>
      <motion.div
        ref={list}
        key={page?.id ?? "root"}
        initial={{ opacity: 0, x: page ? 12 : -12 }}
        animate={{ opacity: 1, x: 0 }}
        transition={motionTokens.quick}
        role="menu"
        aria-label={page ? page.label : title}
        className="max-h-[60vh] min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline px-2 py-1"
      >
        {page && (
          <SheetRow back label={ui.labels.back} icon={<ChevronLeft className="rtl:rotate-180" />} onClick={() => turn(null)} />
        )}
        {items.map((entry) =>
          entry.kind === "separator" ? (
            <div key={entry.id} role="separator" className="mx-2 my-1 h-px bg-hairline" />
          ) : entry.kind === "submenu" ? (
            <SheetRow key={entry.id} entry={entry.id} label={entry.label} icon={entry.icon} disabled={entry.disabled} trailing={<ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />} onClick={() => turn(entry)} />
          ) : (
            <SheetRow
              key={entry.id}
              entry={entry.id}
              label={entry.label}
              icon={entry.icon}
              disabled={entry.disabled}
              destructive={entry.destructive}
              trailing={entry.current ? <span className="text-signal">●</span> : undefined}
              onClick={() => run(entry)}
            />
          ),
        )}
      </motion.div>
    </>
  );
}

function SheetRow({
  label,
  icon,
  trailing,
  disabled,
  destructive,
  entry,
  back,
  onClick,
}: {
  readonly entry?: string;
  readonly back?: boolean;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly trailing?: React.ReactNode;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      data-entry={entry}
      data-sheet-back={back ? "" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 items-center gap-3 rounded-lg px-3 text-start text-[15px] transition-colors active:bg-muted disabled:opacity-40 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
        destructive && "text-destructive [&>svg]:text-destructive",
      )}
    >
      {icon}
      <bdi className="block min-w-0 flex-1 truncate text-start">{label}</bdi>
      {trailing}
    </button>
  );
}

/* ───────────────────────────── Bulk selection bar ───────────────────────────── */

export function OutlinerBulkBar() {
  const { modKey, shift } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const ids = [...ol.state.selection];
  const show = !ui.editing && ids.length > 1;
  const disabled = ol.readOnly;
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          variants={rise}
          initial="initial"
          animate="animate"
          exit="exit"
          role="toolbar"
          aria-label="Selection actions"
          className="absolute inset-x-0 bottom-10 z-20 mx-auto max-sm:bottom-3 flex w-max max-w-[calc(100%-1.5rem)] items-center gap-0.5 rounded-lg border bg-popover p-1 text-popover-foreground shadow-[0_8px_30px_-12px_rgb(0_0_0/0.25),0_1px_2px_rgb(0_0_0/0.06)]"
        >
          <span dir="ltr" className="flex h-7 items-center gap-1.5 ps-2 pe-1.5 text-ui font-medium tabular-nums">
            <motion.span key={ids.length} initial={{ y: -4, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={motionTokens.quick}>
              {ids.length}
            </motion.span>
            <span className="text-muted-foreground">selected</span>
          </span>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <BarButton label="Complete" kbd="Space" disabled={disabled} onClick={() => ui.announceToggle(ol.commands.toggleComplete(ids))}>
            <CircleCheck />
          </BarButton>
          <BarButton label="Outdent" kbd={`${shift}Tab`} disabled={disabled} onClick={() => ol.dispatch({ type: "outdent", ids })}>
            <IndentDecrease />
          </BarButton>
          <BarButton label="Indent" kbd="Tab" disabled={disabled} onClick={() => ol.dispatch({ type: "indent", ids })}>
            <IndentIncrease />
          </BarButton>
          <BarButton
            label="Move to…"
            kbd={`${shift}${modKey}M`}
            disabled={disabled}
            onClick={() => {
              ui.setPaletteMode("move");
              ui.setPaletteOpen(true);
            }}
          >
            <MoveRight />
          </BarButton>
          <BarButton label="Duplicate" disabled={disabled} onClick={() => ol.commands.duplicate(ids)}>
            <Copy />
          </BarButton>
          <BarButton
            label="Delete"
            kbd="⌫"
            disabled={disabled}
            onClick={() => deleteItems({ ol, ui }, ids)}
            className="hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 />
          </BarButton>
          <Separator orientation="vertical" className="mx-1 h-4" />
          <BarButton label="Clear selection" kbd="Esc" onClick={() => ol.dispatch({ type: "clear-selection" })}>
            <X />
          </BarButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function BarButton({
  label,
  kbd,
  children,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { readonly label: string; readonly kbd?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className={cn("text-foreground/80 coarse:size-11", className)} {...props}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {label} {kbd && <Kbd dir="ltr">{kbd}</Kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

/* ───────────────────────────── Phone editing bar ───────────────────────────── */

/**
 * On coarse pointers the keyboard hides Tab/arrows/modifiers. This bar docks above the
 * on-screen keyboard (tracked via visualViewport) and exposes structural edits.
 */
export function OutlinerMobileBar() {
  const { ol, ui } = useOutlinerContext();
  const coarse = useMediaQuery("(pointer: coarse)");
  const offset = useKeyboardOffset();
  const caret = ol.state.caret;
  const show = coarse && ui.editing && !!caret;
  if (!caret) return null;
  const ids = [caret.id];
  const row = ol.rows.find((candidate) => candidate.id === caret.id);
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 48, opacity: 0 }}
          transition={motionTokens.base}
          role="toolbar"
          aria-label="Editing tools"
          onPointerDown={(event) => event.preventDefault()}
          style={{ bottom: offset }}
          className="fixed inset-x-0 z-50 flex items-center border-t bg-popover/95 py-1 ps-1 pe-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md"
        >
          <div className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]">
          <MobileTool label="Outdent" onClick={() => ol.dispatch({ type: "outdent", ids })}>
            <IndentDecrease />
          </MobileTool>
          <MobileTool label="Indent" onClick={() => ol.dispatch({ type: "indent", ids })}>
            <IndentIncrease />
          </MobileTool>
          <MobileTool label="Move up" onClick={() => ol.dispatch({ type: "move", direction: "up", ids })}>
            <ArrowUp />
          </MobileTool>
          <MobileTool label="Move down" onClick={() => ol.dispatch({ type: "move", direction: "down", ids })}>
            <ArrowDown />
          </MobileTool>
          <Separator orientation="vertical" className="mx-0.5 h-5" />
          <MobileTool label="Complete" active={row?.completed} onClick={() => ui.announceToggle(ol.commands.toggleComplete(ids))}>
            <CircleCheck />
          </MobileTool>
          <MobileTool label="Checkbox" active={row?.details.checkbox} onClick={() => ol.commands.toggleCheckbox(ids)}>
            <CheckSquare />
          </MobileTool>
          <MobileTool
            label="Note"
            active={caret.field === "note"}
            onClick={() =>
              caret.field === "note"
                ? ol.dispatch({ type: "focus", id: caret.id, start: row?.node.text.length ?? 0 })
                : ol.dispatch({ type: "focus", id: caret.id, field: "note", start: (row?.details.note ?? "").length })
            }
          >
            <StickyNote />
          </MobileTool>
          </div>
          <Separator orientation="vertical" className="mx-1 h-5" />
          <MobileTool label="Undo" disabled={!ol.canUndo} onClick={() => ol.dispatch({ type: "undo" })}>
            <Undo2 />
          </MobileTool>
          <MobileTool label="Redo" disabled={!ol.canRedo} onClick={() => ol.dispatch({ type: "redo" })}>
            <Redo2 />
          </MobileTool>
          <button
            type="button"
            onClick={() => {
              (document.activeElement as HTMLElement | null)?.blur();
              ui.setEditing(false);
            }}
            className="flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-ui font-medium text-signal active:bg-muted"
          >
            Done
            <ChevronDown className="size-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function MobileTool({
  label,
  active,
  children,
  ...props
}: React.ComponentProps<"button"> & { readonly label: string; readonly active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-foreground/80 transition-colors active:bg-muted disabled:opacity-40 [&_svg]:size-[18px]",
        active && "bg-signal-muted text-signal",
      )}
      {...props}
    >
      {children}
    </button>
  );
}

function useKeyboardOffset() {
  const [offset, setOffset] = React.useState(0);
  React.useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const on = () => setOffset(Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop));
    viewport.addEventListener("resize", on);
    viewport.addEventListener("scroll", on);
    on();
    return () => {
      viewport.removeEventListener("resize", on);
      viewport.removeEventListener("scroll", on);
    };
  }, []);
  return offset;
}

/* ───────────────────────────── Command palette / finder ───────────────────────────── */

export function OutlinerCommandPalette() {
  const { modKey, shift, isMac } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const mode = ui.paletteMode;
  const picking = mode === "move" || mode === "mirror";
  // Switching to "Move to…" / "Mirror to…" starts a fresh search for the destination (the words
  // typed to find the command are not a destination).
  const [search, setSearch] = React.useState("");
  React.useEffect(() => setSearch(""), [mode, ui.paletteOpen]);
  // Jump targets parse every title, so build them only while the palette is open — not on
  // every keystroke of a closed palette.
  const items = React.useMemo(() => {
    const out: { id: string; text: string; path: string; mirror: boolean }[] = [];
    if (!ui.paletteOpen) return out;
    const walk = (nodes: readonly OutlineItem[], path: string[], inMirror: boolean) => {
      for (const node of nodes) {
        const text = inlineToPlain(node.text);
        const mirror = inMirror || !!mirrorOf(node);
        out.push({ id: node.id, text, path: path.join(" › "), mirror });
        if (node.children) walk(node.children, [...path, text], mirror);
      }
    };
    walk(ol.state.nodes, [], false);
    return out;
  }, [ol.state.nodes, ui.paletteOpen]);

  // The tag inventory walks the whole document: only an open palette asks for it.
  const tags = ui.paletteOpen ? ol.tags : [];
  const coarse = useMediaQuery("(pointer: coarse)");
  /*
   * What item commands act on: the selection, else the cursor row (the anchor a tap or the
   * keyboard left, or the item being edited). A phone rarely has a selection, and "Move to…"
   * must still be there for the row you were on.
   */
  const cursorRow = ol.state.selectionAnchor ?? ol.state.caret?.id ?? null;
  const selection = ol.state.selection.size
    ? [...ol.state.selection]
    : cursorRow && findOutlineNode(ol.state.nodes, cursorRow)
      ? [cursorRow]
      : [];
  const moving = picking ? (selection.length ? selection : ol.state.caret ? [ol.state.caret.id] : []) : [];
  // Never a destination inside what moves, nor inside a mirror's copy (or its source: a loop).
  const blocked = new Set(moving.flatMap((id) => collectAllIds(findOutlineNode(ol.state.nodes, id)?.node)));
  const destinations = items.filter((item) => !blocked.has(item.id) && !(mode === "mirror" && item.mirror));
  const bookmarked = ui.paletteOpen
    ? ol.bookmarks.items.flatMap((id) => {
        const item = items.find((candidate) => candidate.id === id);
        return item ? [item] : [];
      })
    : [];
  const query = ol.view.query.trim();
  const selectedNode = selection.length === 1 ? (findOutlineNode(ol.state.nodes, selection[0]!)?.node as OutlineItem | undefined) : undefined;
  const hoistedNode = ol.hoisted;

  const close = () => ui.setPaletteOpen(false);
  /**
   * Move with a receipt: "Moved 2 items to Ideas parking lot · Undo". It is a toast (the toast
   * region speaks it: one live channel), raised once the palette has closed, so the page it speaks
   * from is no longer hidden behind the modal.
   */
  const moveWithReceipt = (parentId: string | null) => {
    const count = ol.commands.moveTo(moving, parentId);
    if (!count) return;
    const node = parentId ? (findOutlineNode(ol.latestNodes(), parentId)?.node as OutlineItem | undefined) : undefined;
    const destination = parentId ? inlineToPlain(node?.text ?? "") || L.untitled : L.topLevel;
    window.setTimeout(() => ui.offerUndo(L.movedTo(count, destination)), 220);
  };
  const run = (fn: () => void) => () => {
    fn();
    close();
  };
  const jump = (id: string) => {
    const path = getOutlinePath(ol.state.nodes, id);
    const outside = ol.state.hoistedId && !path.some((node) => node.id === ol.state.hoistedId);
    const go = () => {
      ol.dispatch({ type: "reveal", id });
      ol.dispatch({ type: "select", id });
      requestAnimationFrame(() => {
        ui.focusList();
        ui.scrollToRow(id, "center");
      });
    };
    if (outside) {
      ol.dispatch({ type: "hoist", id: null });
      requestAnimationFrame(go);
    } else go();
  };
  // Sorting follows the real selection only (a remembered cursor must not change what "sort" means).
  const sorted = [...ol.state.selection];
  const sortHere = (by: "title" | "date" | "completion" | "created" | "edited", direction?: "descending") =>
    run(() => ol.commands.sortChildren(sorted.length === 1 ? sorted[0]! : ol.state.hoistedId, by, direction));
  const sortScope = sorted.length === 1 ? "children" : ol.state.hoistedId ? "this level" : "top level";

  return (
    <CommandDialog
      open={ui.paletteOpen}
      onOpenChange={ui.setPaletteOpen}
      title={mode === "move" ? "Move items" : mode === "mirror" ? "Mirror items" : "Command palette"}
      description={picking ? "Choose a destination" : "Jump to an item or run a command"}
      className="top-[18%] translate-y-0 sm:max-w-xl"
      onCloseAutoFocus={(event) => {
        // Return to the document (and its restored selection), never to <body>.
        if (ui.editing) return;
        ui.returnFocus(event);
      }}
    >
      <Command loop filter={wordFilter} className="rounded-none bg-transparent">
      <CommandInput
        value={search}
        onValueChange={setSearch}
        placeholder={
          mode === "move"
            ? `Move ${moving.length} item${moving.length === 1 ? "" : "s"} to…`
            : mode === "mirror"
              ? `Mirror ${moving.length} item${moving.length === 1 ? "" : "s"} into…`
              : "Jump to item or type a command…"
        }
      />
      <CommandList className="max-h-[min(60vh,420px)]">
        <CommandEmpty>No matches.</CommandEmpty>
        {picking ? (
          <CommandGroup heading={mode === "mirror" ? "Mirror into" : "Destination"}>
            <CommandItem
              value="__top-level__ top level document root"
              onSelect={run(() => {
                if (mode === "move") moveWithReceipt(null);
                else if (ol.commands.mirrorTo(moving, null).length) ui.announce(L.mirrored(moving.length));
              })}
            >
              <CornerDownRight /> Top level
            </CommandItem>
            {destinations.map((item) => (
              <CommandItem
                key={item.id}
                value={`${item.text}\u0001${item.path}\u0000${item.id}`}
                onSelect={run(() => {
                  if (mode === "move") moveWithReceipt(item.id);
                  else if (ol.commands.mirrorTo(moving, item.id).length) ui.announce(L.mirrored(moving.length));
                })}
              >
                <CornerDownRight className="opacity-50" />
                <span className="min-w-0 flex-1 truncate">{item.text || L.untitled}</span>
                {item.path && <span className="max-w-[45%] shrink-0 truncate text-2xs text-muted-foreground">{item.path}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : (
          <>
            {selection.length > 0 && !ol.readOnly && (
              <>
                <CommandGroup
                  heading={
                    ol.state.selection.size
                      ? `Selection · ${selection.length}`
                      : `Item · ${inlineToPlain((findOutlineNode(ol.state.nodes, selection[0]!)?.node as OutlineItem | undefined)?.text ?? "") || L.untitled}`
                  }
                >
                  <CommandItem onSelect={run(() => ui.announceToggle(ol.commands.toggleComplete(selection)))}>
                    <CircleCheck /> Toggle complete
                    <CommandShortcut dir="ltr">Space</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={run(() => ol.dispatch({ type: "indent", ids: selection }))}>
                    <IndentIncrease /> Indent
                    <CommandShortcut dir="ltr">Tab</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={run(() => ol.dispatch({ type: "outdent", ids: selection }))}>
                    <IndentDecrease /> Outdent
                    <CommandShortcut dir="ltr">{shift}Tab</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={() => ui.setPaletteMode("move")}>
                    <MoveRight /> {L.moveTo}
                    <CommandShortcut dir="ltr">{shift}{modKey}M</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={() => ui.setPaletteMode("mirror")}>
                    <Repeat2 /> {L.mirrorTo}
                  </CommandItem>
                  {([1, 2, 3] as const).map((level) => {
                    const Icon = level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3;
                    return (
                      <CommandItem key={level} onSelect={run(() => ol.commands.setHeading(selection, level))}>
                        <Icon /> Heading {level}
                      </CommandItem>
                    );
                  })}
                  <CommandItem onSelect={run(() => ol.commands.duplicate(selection))}>
                    <Copy /> Duplicate
                  </CommandItem>
                  {selectedNode && <ViewCommandItems item={selectedNode} run={run} />}
                  {selection.length === 1 && (
                    <CommandItem
                      onSelect={run(() => {
                        const added = ol.commands.toggleBookmark(selection[0]!);
                        ui.announce(added ? L.bookmarked : L.bookmarkRemoved);
                      })}
                    >
                      <Star /> {ol.bookmarks.items.includes(ol.commands.identityOf(selection[0]!)) ? L.removeBookmark : L.bookmark}
                    </CommandItem>
                  )}
                  <CommandItem onSelect={run(() => deleteItems({ ol, ui }, selection))}>
                    <Trash2 /> Delete
                    <CommandShortcut dir="ltr">⌫</CommandShortcut>
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {selection.length > 0 && !ol.readOnly && (
              <>
                <CommandGroup heading="Format selection">
                  <CommandItem onSelect={run(() => ol.commands.toggleCheckbox(selection))}>
                    <CheckSquare /> Toggle checkbox
                    <CommandShortcut dir="ltr">{shift}{modKey}C</CommandShortcut>
                  </CommandItem>
                  <CommandItem onSelect={run(() => ol.commands.toggleNumbered(selection))}>
                    <ListOrdered /> Number children
                  </CommandItem>
                  {OUTLINE_COLORS.map((color) => (
                    <CommandItem key={color} value={`color ${color}`} onSelect={run(() => ol.commands.setColor(selection, color))}>
                      <span className={cn("size-2.5 rounded-full", COLOR_STYLES[color].dot)} /> Color: {COLOR_STYLES[color].label}
                    </CommandItem>
                  ))}
                  <CommandItem value="color none clear" onSelect={run(() => ol.commands.setColor(selection, undefined))}>
                    <Palette /> Clear color
                  </CommandItem>
                  {selection.length === 1 && (
                    <>
                      <CommandItem onSelect={run(() => ol.dispatch({ type: "hoist", id: selection[0]! }))}>
                        <Focus /> Zoom in
                        <CommandShortcut dir="ltr">{modKey}]</CommandShortcut>
                      </CommandItem>
                      <CommandItem
                        onSelect={run(() => {
                          const node = findOutlineNode(ol.state.nodes, selection[0]!)?.node as OutlineItem | undefined;
                          ol.dispatch({ type: "focus", id: selection[0]!, field: "note", start: (node?.data?.note ?? "").length });
                          ui.setEditing(true);
                        })}
                      >
                        <StickyNote /> Edit note
                        <CommandShortcut dir="ltr">{shift}↵</CommandShortcut>
                      </CommandItem>
                    </>
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {(
              <>
                <CommandGroup heading={L.bookmarks}>
                  {bookmarked.map((item) => (
                    <CommandItem key={item.id} value={`bookmark ${item.text}\u0000${item.id}`} onSelect={run(() => ol.dispatch({ type: "hoist", id: item.id }))}>
                      <Star className="fill-current text-warning" />
                      <span className="min-w-0 flex-1 truncate">{item.text || L.untitled}</span>
                      {item.path && <span className="max-w-[45%] shrink-0 truncate text-2xs text-muted-foreground">{item.path}</span>}
                    </CommandItem>
                  ))}
                  <CommandItem
                    value={`saved search ${L.recentlyChanged} ${RECENTLY_CHANGED_QUERY} history edited`}
                    onSelect={run(() => {
                      ol.setView((view) => ({ ...view, query: RECENTLY_CHANGED_QUERY }));
                      ui.setSearchOpen(true);
                    })}
                  >
                    <History />
                    <span className="min-w-0 flex-1 truncate">{L.recentlyChanged}</span>
                    <span className="shrink-0 font-mono text-2xs text-muted-foreground" dir="ltr">{RECENTLY_CHANGED_QUERY}</span>
                  </CommandItem>
                  {ol.bookmarks.searches.map((saved) => (
                    <CommandItem
                      key={saved.query}
                      value={`saved search ${saved.label ?? ""} ${saved.query}`}
                      onSelect={run(() => {
                        ol.setView((view) => ({ ...view, query: saved.query }));
                        ui.setSearchOpen(true);
                      })}
                    >
                      <Search />
                      <span className="min-w-0 flex-1 truncate">{saved.label ?? saved.query}</span>
                      {saved.label && <span className="shrink-0 font-mono text-2xs text-muted-foreground" dir="ltr">{saved.query}</span>}
                    </CommandItem>
                  ))}
                  {query && !ol.bookmarks.searches.some((saved) => saved.query === query) && (
                    <CommandItem
                      value={`save search ${query}`}
                      onSelect={run(() => {
                        ol.commands.saveSearch(query);
                        toast.success(L.searchSaved);
                      })}
                    >
                      <Star /> Save search <span className="font-mono text-muted-foreground" dir="ltr">{query}</span>
                    </CommandItem>
                  )}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            {(ui.host.paletteGroups ?? []).map((group) => (
              <React.Fragment key={group.heading}>
                <CommandGroup heading={group.heading}>
                  {group.commands.map((command) => (
                    <CommandItem key={command.id} value={`${command.label} ${command.keywords ?? ""}\u0000${command.id}`} onSelect={run(command.run)}>
                      {command.icon}
                      <span className="min-w-0 flex-1 truncate">{command.label}</span>
                      {command.hint && <span className="shrink-0 font-mono text-2xs text-muted-foreground tabular-nums">{command.hint}</span>}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </React.Fragment>
            ))}
            <CommandGroup heading="Actions">
              {hoistedNode && !ol.readOnly && <ViewCommandItems item={hoistedNode} run={run} showTarget />}
              <PrintCommandItem run={run} />
              <CommandItem onSelect={run(() => ol.dispatch({ type: "expand-all", expanded: true }))}>
                <ChevronsUpDown /> Expand all
              </CommandItem>
              <CommandItem onSelect={run(() => ol.dispatch({ type: "expand-all", expanded: false }))}>
                <ChevronsDownUp /> Collapse all
              </CommandItem>
              <CommandItem onSelect={run(() => ol.setView((view) => ({ ...view, hideCompleted: !view.hideCompleted })))}>
                <EyeOff /> {ol.view.hideCompleted ? "Show completed" : "Hide completed"}
                <CommandShortcut dir="ltr">{shortcutLabel(ui.keymap, "hideCompleted", isMac)}</CommandShortcut>
              </CommandItem>
              <CommandItem onSelect={run(() => ui.setSearchOpen(true))}>
                <Focus /> Search in outline
                <CommandShortcut dir="ltr">{shortcutLabel(ui.keymap, "search", isMac)}</CommandShortcut>
              </CommandItem>
              {!ol.readOnly && (
                <>
                  <CommandItem value={`sort ${sortScope} a z title`} onSelect={sortHere("title")}>
                    <ArrowDownAZ /> Sort {sortScope} A → Z
                  </CommandItem>
                  <CommandItem value={`sort ${sortScope} by date due`} onSelect={sortHere("date")}>
                    <ArrowDownAZ /> Sort {sortScope} by date
                  </CommandItem>
                  <CommandItem value={`sort ${sortScope} by completion incomplete first done`} onSelect={sortHere("completion")}>
                    <ArrowDownAZ /> Sort {sortScope} by completion
                  </CommandItem>
                  <CommandItem value={`sort ${sortScope} by created time newest`} onSelect={sortHere("created", "descending")}>
                    <ArrowDownAZ /> Sort {sortScope} by created, newest first
                  </CommandItem>
                  <CommandItem value={`sort ${sortScope} by edited time modified recent`} onSelect={sortHere("edited", "descending")}>
                    <ArrowDownAZ /> Sort {sortScope} by edited, most recent first
                  </CommandItem>
                </>
              )}
              <CommandItem
                onSelect={run(async () => {
                  await navigator.clipboard.writeText(ol.commands.copyMarkdown());
                  toast.success(L.copiedMarkdown);
                })}
              >
                <Copy /> Copy outline as Markdown
              </CommandItem>
              <CommandItem
                onSelect={run(() => {
                  const blob = new Blob([ol.commands.exportAs("opml")], { type: "text/x-opml" });
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(blob);
                  link.download = "outline.opml";
                  link.click();
                  URL.revokeObjectURL(link.href);
                })}
              >
                <Copy /> Export as OPML
              </CommandItem>
              <CommandItem onSelect={run(() => ui.setShortcutsOpen(true))}>
                <Keyboard /> Keyboard shortcuts
                <CommandShortcut dir="ltr">{modKey}/</CommandShortcut>
              </CommandItem>
            </CommandGroup>
            {tags.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Tags">
                  {tags.slice(0, 12).map((tag) => (
                    <CommandItem
                      key={tag.key}
                      value={`${tag.trigger}${tag.spelling} tag`}
                      onSelect={run(() => {
                        ol.setView((view) => ({ ...view, query: `${tag.trigger}${tag.spelling}` }));
                        ui.setSearchOpen(true);
                      })}
                    >
                      <bdi className="font-mono text-signal">{tag.trigger}{tag.spelling}</bdi>
                      <span className="ms-auto font-mono text-2xs text-muted-foreground tabular-nums">{tag.count}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
            <CommandGroup heading="Jump to item">
              {items.map((item) => (
                <CommandItem key={item.id} value={`${item.text}\u0001${item.path}\u0000${item.id}`} onSelect={run(() => jump(item.id))}>
                  <span className="size-1 shrink-0 rounded-full bg-foreground/40" />
                  <span className="min-w-0 flex-1 truncate">{item.text || L.untitled}</span>
                  {item.path && <span className="max-w-[45%] shrink-0 truncate text-2xs text-muted-foreground">{item.path}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
      {!coarse && <div className="flex items-center gap-3 border-t px-3 py-2 text-2xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> navigate
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> {mode === "move" ? "move here" : mode === "mirror" ? "mirror here" : "select"}
        </span>
        <span className="ms-auto flex items-center gap-1">
          <Kbd>Esc</Kbd> close
        </span>
      </div>}
      </Command>
    </CommandDialog>
  );
}

/** Built-in saved search: what changed this week (history-lite, `data.editedAt`). */
export const RECENTLY_CHANGED_QUERY = "changed:week";

/**
 * Bookmarks in the header: starred items (click zooms in) and saved searches (click runs), plus
 * the built-in "Recently changed". The zoomed item can be starred, and the current query saved,
 * from here. Each entry's remove control is its own menu item beside it (never a button nested
 * inside a menuitem), so arrow keys reach it and touch has a 44 px target. On a phone this is
 * the only way in, so the trigger stays visible there.
 */
export function OutlinerBookmarksMenu() {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const items = ol.bookmarks.items.flatMap((id) => {
    const node = findOutlineNode(ol.state.nodes, id)?.node as OutlineItem | undefined;
    return node ? [{ id, title: inlineToPlain(node.text) || L.untitled }] : [];
  });
  const query = ol.view.query.trim();
  const zoomed = ol.state.hoistedId;
  const zoomedId = zoomed ? ol.commands.identityOf(zoomed) : null;
  // A workspace's starred documents come first: bookmarks of whole documents.
  const docs = ui.host.starredDocuments;
  const count = items.length + ol.bookmarks.searches.length + (docs?.items.length ?? 0);
  const run = (search: string) => {
    ol.setView((view) => ({ ...view, query: search }));
    ui.setSearchOpen(true);
  };
  const pair = "flex items-stretch gap-0.5";
  const remove = "w-8 shrink-0 justify-center px-0 text-muted-foreground coarse:w-11";
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={count ? `${L.bookmarks} (${count})` : L.bookmarks}>
              <Star />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{L.bookmarks}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-1.5rem)]" onCloseAutoFocus={(event) => ui.returnFocus(event)}>
        {docs && (
          <>
            <DropdownMenuLabel className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">{L.documents}</DropdownMenuLabel>
            {docs.items.map((doc) => (
              <div key={doc.id} role="none" className={pair}>
                <DropdownMenuItem className="min-w-0 flex-1" data-starred-document={doc.id} onSelect={() => docs.open(doc.id)}>
                  <FileText className="text-warning" />
                  <span dir="auto" className="min-w-0 flex-1 truncate">{doc.title}</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  aria-label={L.removeStarred(doc.title)}
                  className={remove}
                  onSelect={(event) => {
                    event.preventDefault();
                    docs.unstar(doc.id);
                  }}
                >
                  <X className="size-3.5" />
                </DropdownMenuItem>
              </div>
            ))}
            <DropdownMenuItem onSelect={docs.toggleCurrent}>
              <Star className={cn(docs.current && "fill-current")} /> {docs.current ? L.unstarDocument : L.starDocument}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuLabel className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Starred</DropdownMenuLabel>
        {items.length === 0 && <div className="px-2 py-1.5 text-[12px] text-muted-foreground">Star an item from its menu.</div>}
        {items.map((item) => (
          <div key={item.id} role="none" className={pair}>
            <DropdownMenuItem className="min-w-0 flex-1" onSelect={() => ol.dispatch({ type: "hoist", id: item.id })}>
              <Star className="fill-current text-warning" />
              <span dir="auto" className="min-w-0 flex-1 truncate">{item.title}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={L.removeStarred(item.title)}
              className={remove}
              onSelect={(event) => {
                event.preventDefault();
                ol.commands.toggleBookmark(item.id);
                ui.announce(L.bookmarkRemoved);
              }}
            >
              <X className="size-3.5" />
            </DropdownMenuItem>
          </div>
        ))}
        {zoomedId && !ol.bookmarks.items.includes(zoomedId) && (
          <DropdownMenuItem onSelect={() => ui.announce(ol.commands.toggleBookmark(zoomed!) ? L.bookmarked : L.bookmarkRemoved)}>
            <Star /> Star this zoom
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-2xs font-medium tracking-wide text-muted-foreground uppercase">Saved searches</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => run(RECENTLY_CHANGED_QUERY)}>
          <History />
          <span className="min-w-0 flex-1 truncate">{L.recentlyChanged}</span>
          <span dir="ltr" className="font-mono text-[10.5px] text-muted-foreground">{RECENTLY_CHANGED_QUERY}</span>
        </DropdownMenuItem>
        {ol.bookmarks.searches.map((saved) => (
          <div key={saved.query} role="none" className={pair}>
            <DropdownMenuItem className="min-w-0 flex-1" onSelect={() => run(saved.query)}>
              <Search />
              <span className="min-w-0 flex-1 truncate">{saved.label ?? saved.query}</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              aria-label={L.removeSavedSearch(saved.label ?? saved.query)}
              className={remove}
              onSelect={(event) => {
                event.preventDefault();
                ol.commands.removeSearch(saved.query);
              }}
            >
              <X className="size-3.5" />
            </DropdownMenuItem>
          </div>
        ))}
        {query && query !== RECENTLY_CHANGED_QUERY && !ol.bookmarks.searches.some((saved) => saved.query === query) && (
          <DropdownMenuItem
            onSelect={() => {
              ol.commands.saveSearch(query);
              toast.success(L.searchSaved);
            }}
          >
            <Star /> Save <span className="truncate font-mono text-muted-foreground" dir="ltr">{query}</span>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Every typed word must appear (prefix-weighted); avoids fuzzy noise like "red" ⇒ "Freeze". A
 * word in the item's own title outranks the same word in its path ("launch comms" finds the
 * "Launch comms" item before its children).
 */
function wordFilter(value: string, search: string) {
  // Anything after U+0000 is a uniqueness key (an item id), never matched; U+0001 starts the path.
  const [title = "", path = ""] = value.split("\u0000")[0]!.toLowerCase().split("\u0001");
  const words = search.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return 1;
  let score = 0;
  for (const word of words) {
    const inTitle = title.indexOf(word);
    const at = inTitle >= 0 ? inTitle : path.indexOf(word);
    if (at < 0) return 0;
    const haystack = inTitle >= 0 ? title : path;
    score += (at === 0 || /\s/.test(haystack[at - 1]!) ? 2 : 1) * (inTitle >= 0 ? 2 : 1);
  }
  return score / (words.length * 4);
}

function collectAllIds(node?: OutlineItem): string[] {
  if (!node) return [];
  const out: string[] = [];
  const stack = [node];
  while (stack.length) {
    const next = stack.pop()!;
    out.push(next.id);
    stack.push(...(next.children ?? []));
  }
  return out;
}

/* ───────────────────────────── Shortcuts sheet ───────────────────────────── */

function shortcutsFor({ modKey, shift, isMac }: PlatformKeys, keymap: Keymap): readonly { readonly group: string; readonly items: readonly (readonly [string, string])[] }[] {
  // Remappable keys come from the active keymap (profile + remaps), so this sheet never lies.
  const k = (...ids: ShortcutId[]) => ids.map((id) => shortcutLabel(keymap, id, isMac) || "—").join(" · ");
  const power = keymap.profile === "power";
  return [
  {
    group: "Writing",
    items: [
      ["New item", "↵"],
      ["Add / edit note", `${shift}↵`],
      [power ? "Line break in a note (↵ starts the next item)" : "Line break in a note", power ? `${shift}${modKey}↵` : "↵"],
      ["Indent · Outdent", `Tab · ${shift}Tab`],
      ["Merge with previous", "⌫ at start"],
      ["Complete", k("complete")],
      ["Checkbox", k("checkbox")],
      ["Heading 1 · 2 · 3", k("heading1", "heading2", "heading3")],
      ["Normal text", k("heading0")],
    ],
  },
  {
    group: "Formatting",
    items: [
      ["Bold", k("bold")],
      ["Italic", k("italic")],
      ["Inline code", k("code")],
      ["Strikethrough", k("strike")],
      ["Highlight", k("highlight")],
      ["Tag · Mention · Date", "#tag · @name · !(2026-11-03)"],
    ],
  },
  {
    group: "Structure",
    items: [
      ["Move up", k("moveUp")],
      ["Move down", k("moveDown")],
      ["Move to…", k("moveTo")],
      ["Zoom in · out", k("zoomIn", "zoomOut")],
      ["Copy item link", k("copyLink")],
      ["Undo · Redo", `${modKey}Z · ${shift}${modKey}Z`],
    ],
  },
  {
    group: "Folding",
    items: [
      ["Fold · unfold", k("fold")],
      ["Show 1 · 2 · 3 levels", k("levels1", "levels2", "levels3")],
      ["Show all levels", k("levelsAll")],
      ["Hide completed", k("hideCompleted")],
    ],
  },
  {
    group: "Selection",
    items: [
      ["Select item", "Esc while editing"],
      ["Extend selection (also from a title)", `${shift}↑ · ${shift}↓`],
      ["Add or remove a row", `${modKey}-click`],
      ["Select all", `${modKey}A twice`],
      ["Delete selected", "⌫"],
      ["Copy · Cut · Paste", `${modKey}C · X · V`],
      ["Copy while dragging", `${isMac ? "⌥" : "Alt"}-drag`],
    ],
  },
  {
    group: "Navigate",
    items: [
      ["Command palette", k("palette")],
      ["Search", k("search")],
      ["Find and replace", k("findReplace")],
      ["Flat results", `${shift}↵ in search`],
      ["Settings", k("settings")],
    ],
  },
  ];
}

export function OutlinerShortcuts() {
  const keys = usePlatformKeys();
  const { ui } = useOutlinerContext();
  return (
    <Dialog open={ui.shortcutsOpen} onOpenChange={ui.setShortcutsOpen}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        onCloseAutoFocus={(event) => ui.returnFocus(event)}
        // The sheet is for reading: focus the sheet itself, not its one link.
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement | null)?.focus?.();
        }}
      >
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            {ui.keymap.profile === "power" ? "Power profile. " : ""}Everything works without a mouse. On touch devices, the editing bar provides the same structure tools.{" "}
            <button
              type="button"
              className="text-signal underline-offset-2 hover:underline"
              onClick={() => {
                ui.setShortcutsOpen(false);
                window.setTimeout(() => ui.setSettingsOpen(true), 0);
              }}
            >
              Change shortcuts…
            </button>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2" data-shortcut-sheet={ui.keymap.profile}>
          {shortcutsFor(keys, ui.keymap).map((section) => (
            <section key={section.group}>
              <h3 className="mb-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">{section.group}</h3>
              <dl className="divide-y divide-hairline">
                {section.items.map(([label, keys]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-1.5 text-ui">
                    <dt>{label}</dt>
                    <dd dir="ltr" className="font-mono text-[11px] whitespace-nowrap text-muted-foreground">{keys}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Date chip editor ───────────────────────────── */

export function OutlinerDatePicker() {
  const { ol, ui } = useOutlinerContext();
  const request = ui.datePicker;
  const L = ui.labels;
  // The close-focus callback runs after the request is cleared: remember whose picker it was.
  const lastRow = React.useRef<string | null>(null);
  if (request) lastRow.current = request.rowId;
  /**
   * Range mode (`!(start → end)`): the first click picks the start, the second the end. It opens
   * on when the token already is a range. Ranges and repeats exclude each other.
   */
  const [rangeMode, setRangeMode] = React.useState(false);
  const [rangeStart, setRangeStart] = React.useState<Date | null>(null);
  const requestKey = request ? `${request.rowId}:${request.start}` : null;
  React.useEffect(() => {
    setRangeMode(!!request?.rangeEnd);
    setRangeStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);
  /** Replace the token; `date` null removes it. Focus returns to the row, the change is spoken. */
  const replace = (date: Date | null, hasTime = request?.hasTime ?? false, repeat = request?.repeat, end?: { readonly at: Date; readonly hasTime: boolean }) => {
    if (!request) return;
    const node = findOutlineNode(ol.latestNodes(), request.rowId)?.node as OutlineItem | undefined;
    if (!node) return;
    const sameTime = date && request.time && date.getHours() === request.value.getHours() && date.getMinutes() === request.value.getMinutes();
    const token = date ? formatDateToken(date, hasTime, end ? undefined : repeat, { end: end?.at, endHasTime: end?.hasTime, time: sameTime ? request.time : undefined }) : "";
    const source = request.field === "note" ? (node.data?.note ?? "") : node.text;
    const next = (source.slice(0, request.start) + token + source.slice(request.end)).replace(/ {2,}/g, " ");
    ol.dispatch({ type: request.field === "note" ? "note" : "text", id: request.rowId, text: next });
    ui.announce(
      !date
        ? L.dateRemoved
        : end
          ? L.dateRange(spokenDate({ value: date, hasTime }), spokenDate({ value: end.at, hasTime: end.hasTime }))
          : L.dueOn(spokenDate({ value: date, hasTime }) + (repeat ? `, repeats every ${formatRepeat(repeat)}` : "")),
    );
    ui.setDatePicker(null);
  };
  /** A day from a preset or the calendar keeps the token's time of day. */
  const atDay = (day: Date, from: Date, hasTime: boolean) => {
    const date = new Date(day.getFullYear(), day.getMonth(), day.getDate());
    if (hasTime) date.setHours(from.getHours(), from.getMinutes());
    return date;
  };
  const onDay = (day: Date) => {
    if (!request) return;
    if (!rangeMode) return replace(atDay(day, request.value, request.hasTime), request.hasTime, request.repeat);
    if (!rangeStart) {
      setRangeStart(day);
      ui.announce(L.pickRangeEnd);
      return;
    }
    const [first, last] = day < rangeStart ? [day, rangeStart] : [rangeStart, day];
    const start = atDay(first, request.value, request.hasTime);
    const sameDay = first.toDateString() === last.toDateString();
    // One day picked twice is a plain date again (a timed range keeps its end time).
    if (sameDay && !(request.hasTime && request.rangeEndHasTime && request.rangeEnd)) return replace(start, request.hasTime, undefined);
    const endAt = request.rangeEnd && request.rangeEndHasTime ? atDay(last, request.rangeEnd, true) : atDay(last, last, false);
    replace(start, request.hasTime, undefined, { at: endAt, hasTime: !!(request.rangeEnd && request.rangeEndHasTime) });
  };
  const quick = (label: string, days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return { label, date };
  };
  const repeats: readonly (readonly [string, DateRepeat | undefined])[] = [
    ["Once", undefined],
    ["Daily", { unit: "day", interval: 1 }],
    ["Weekdays", { unit: "weekday", interval: 1 }],
    ["Weekly", { unit: "week", interval: 1 }],
    ["Monthly", { unit: "month", interval: 1 }],
  ];
  const sameRepeat = (a?: DateRepeat, b?: DateRepeat) => a?.unit === b?.unit && a?.interval === b?.interval;
  return (
    <Popover open={!!request} onOpenChange={(open) => !open && ui.setDatePicker(null)}>
      {request && (
        <PopoverAnchor asChild>
          <span
            aria-hidden
            style={{ position: "fixed", left: request.rect.left, top: request.rect.top, width: request.rect.width, height: request.rect.height }}
          />
        </PopoverAnchor>
      )}
      <PopoverContent
        align="start"
        sideOffset={6}
        aria-label="Due date"
        className="w-auto p-0"
        // Back to the row it edits, selected, never <body> (⌘Z keeps working).
        onCloseAutoFocus={(event) => ui.returnFocus(event, lastRow.current)}
      >
        {request && (
          <div className="flex flex-col">
            <div className="flex gap-1 border-b p-1.5">
              {[quick("Today", 0), quick("Tomorrow", 1), quick("+1 week", 7)].map((option) => (
                <Button key={option.label} variant="ghost" size="xs" disabled={ol.readOnly} onClick={() => onDay(option.date)}>
                  {option.label}
                </Button>
              ))}
              <Button
                variant="ghost"
                size="xs"
                className="ms-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={ol.readOnly}
                onClick={() => replace(null)}
              >
                Remove
              </Button>
            </div>
            {rangeMode ? (
              <Calendar
                mode="range"
                selected={rangeStart ? { from: rangeStart, to: undefined } : { from: request.value, to: request.rangeEnd ?? request.value }}
                defaultMonth={request.value}
                onSelect={(_range, day) => onDay(day)}
                disabled={ol.readOnly}
              />
            ) : (
              <Calendar
                mode="single"
                selected={request.value}
                defaultMonth={request.value}
                onSelect={(date) => date && onDay(date)}
                disabled={ol.readOnly}
              />
            )}
            <AnimatePresence initial={false}>
              {rangeMode && (
                <motion.p
                  key={rangeStart ? "end" : "start"}
                  initial={{ opacity: 0, y: -2 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={motionTokens.quick}
                  aria-live="polite"
                  className="px-3 pb-1.5 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase"
                >
                  {rangeStart ? L.pickRangeEnd : L.pickRangeStart}
                </motion.p>
              )}
            </AnimatePresence>
            <div className="flex flex-wrap items-center gap-1 border-t p-1.5" role="group" aria-label="Repeat">
              {repeats.map(([label, repeat]) => {
                const on = !rangeMode && sameRepeat(repeat, request.repeat);
                return (
                  <Button
                    key={label}
                    variant="ghost"
                    size="xs"
                    aria-pressed={on}
                    disabled={ol.readOnly}
                    className={cn(on && "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal")}
                    onClick={() => replace(request.value, request.hasTime, repeat)}
                  >
                    {label}
                  </Button>
                );
              })}
              <Button
                variant="ghost"
                size="xs"
                aria-pressed={rangeMode}
                disabled={ol.readOnly}
                className={cn("gap-1", rangeMode && "bg-signal-muted text-signal hover:bg-signal-muted hover:text-signal")}
                onClick={() => {
                  setRangeStart(null);
                  // Leaving range mode on a range keeps just its start.
                  if (rangeMode && request.rangeEnd) replace(request.value, request.hasTime, undefined);
                  else setRangeMode((on) => !on);
                }}
              >
                <CalendarRange className="size-3" /> {L.dateRangeMode}
              </Button>
              {request.hasTime && (
                <Button variant="ghost" size="xs" className="ms-auto text-muted-foreground" disabled={ol.readOnly} onClick={() => replace(request.value, false)}>
                  Remove time
                </Button>
              )}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
