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
  IndentDecrease,
  IndentIncrease,
  Keyboard,
  MoveRight,
  Redo2,
  Search,
  Star,
  History,
  StickyNote,
  Trash2,
  Undo2,
  X,
  ChevronDown,
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
import { inlineToPlain, inlineToSpeech } from "./inline";
import { FIXED_KEYS, SHORTCUT_GROUPS, SHORTCUTS, fixedKeyText, formatCombo, shortcutLabel, type Keymap, type ShortcutGroup, type ShortcutId } from "./keymap";
import { useOutlinerContext, usePlatformKeys, type PlatformKeys } from "./context";
import type { OutlineItem } from "./types";
import type { OutlinerRow } from "./use-outliner";
import { afterFocusReturn, deleteItems, flattenActions, filterValue, findEntry, itemActions, useItemActions, wordFilter, type ItemAction, type ItemEntry, type ItemSubmenu } from "./item-actions";
import { mirrorOf } from "./mirrors";
import { PrintCommandItem } from "./outliner-views";
import { resolveTarget } from "./target";
import { toggleHideCompleted } from "./shortcut-actions";

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
  // Inside a submenu an entry without a glyph is inset by the icon column, so its text lines up
  // with the iconed rows (and the parent menu's text column).
  const render = (entry: ItemEntry, inSub = false): React.ReactNode => {
    if (entry.kind === "separator") return <M.Separator key={entry.id} />;
    if (entry.kind === "submenu")
      return (
        <M.Sub key={entry.id}>
          <M.SubTrigger disabled={entry.disabled} data-command={entry.commandId} data-command-kind="page">
            {entry.icon} <bdi data-command-label="">{entry.label}</bdi>
          </M.SubTrigger>
          <M.SubContent className="w-52">{entry.items.map((item) => render(item, true))}</M.SubContent>
        </M.Sub>
      );
    return (
      <M.Item
        key={entry.id}
        inset={inSub && !entry.icon ? true : undefined}
        variant={entry.destructive ? "destructive" : undefined}
        disabled={entry.disabled}
        data-command={entry.commandId}
        data-command-kind="action"
        data-current={entry.current ? "" : undefined}
        // An entry that opens its own surface (a field, the date picker, the palette) runs once
        // this menu has let go of focus, so its focus return never undoes the new focus.
        onSelect={entry.opensSurface ? () => afterFocusReturn(entry.run) : entry.run}
      >
        {entry.icon} <bdi data-command-label="">{entry.label}</bdi>
        {entry.current && <span className="ms-auto text-signal">●</span>}
        {entry.shortcut && <M.Shortcut dir="ltr" data-command-hint="">{entry.shortcut}</M.Shortcut>}
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
      {entries.map((entry) => render(entry))}
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
          // Focus goes back to the row the sheet acted on: its ⋯ button, the trigger (focusing
          // the tree itself would select a row and drop the phone into selection mode). A field or
          // a dialog an action opened keeps its focus.
          const trigger = closed ? ui.rootRef.current?.querySelector<HTMLElement>(`[data-row="${CSS.escape(closed.rowId)}"] [data-row-actions]`) : null;
          ui.returnFocus(event, trigger ? { kind: "trigger", element: trigger } : null);
          // The row was lifted under the toolbar while the sheet hid the ancestor strip: keep it clear of the strip.
          if (closed) requestAnimationFrame(() => ui.scrollToRow(closed.rowId));
          event.preventDefault();
        }}
      >
        {request && row && (
          <ActionSheetBody
            ids={request.ids}
            row={row}
            onRun={(action) => {
              // "Select" asks for the selection on purpose: keep it after the sheet closes.
              if (action.commandId === "item.select" && last.current) last.current = { ...last.current, marked: false };
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
            <SheetRow key={entry.id} entry={entry.id} kind="page" label={entry.label} icon={entry.icon} disabled={entry.disabled} trailing={<ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />} onClick={() => turn(entry)} />
          ) : (
            <SheetRow
              key={entry.id}
              entry={entry.id}
              kind="action"
              current={entry.current}
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
  kind,
  current,
  back,
  onClick,
}: {
  readonly entry?: string;
  readonly kind?: "page" | "action";
  readonly current?: boolean;
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
      data-command={entry}
      data-command-kind={kind}
      data-current={current ? "" : undefined}
      data-sheet-back={back ? "" : undefined}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 w-full outline-none focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 items-center gap-3 rounded-lg px-3 text-start text-[15px] transition-colors active:bg-muted disabled:opacity-40 [&>svg]:size-[18px] [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
        destructive && "text-destructive [&>svg]:text-destructive",
      )}
    >
      {icon}
      <bdi data-command-label={back ? undefined : ""} className="block min-w-0 flex-1 truncate text-start">{label}</bdi>
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
  const { modKey, isMac } = usePlatformKeys();
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
   * What item commands act on: the one target (target.ts), the selection, else the cursor row (the
   * row a tap or the keyboard left, or the item being edited). A phone rarely has a selection, and
   * "Move to…" must still be there for the row you were on.
   */
  const target = resolveTarget(ol.state, ol.viewRows(), false);
  const selection = target.ids;
  const targetRow = selection.length ? ol.rowOf(target.cursor ?? selection.at(-1)!) : null;
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
  const hoistedNode = ol.hoisted;
  const hoistedRow = ui.paletteOpen && hoistedNode ? ol.rowOf(hoistedNode.id) : null;

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
  /** A registry entry: a palette mode switches in place; a surface opens once the palette let go. */
  const runAction = (action: ItemAction) => () => {
    if (action.paletteMode) return action.run();
    close();
    if (action.opensSurface) afterFocusReturn(action.run);
    else action.run();
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
            {targetRow && (
              <>
                <PaletteItemGroup
                  heading={ol.state.selection.size ? `Selection · ${selection.length}` : `Item · ${inlineToPlain(targetRow.node.text) || L.untitled}`}
                  entries={itemActions({ ol, ui, ids: selection, row: targetRow, isMac })}
                  run={runAction}
                />
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
              {hoistedRow && (
                <RegistryItems
                  entries={pageItems(itemActions({ ol, ui, ids: [hoistedRow.id], row: hoistedRow, isMac }), "item.view")}
                  run={runAction}
                  target={inlineToPlain(hoistedRow.node.text) || L.untitled}
                  skipCurrent
                />
              )}
              <PrintCommandItem run={run} />
              <CommandItem onSelect={run(() => ol.dispatch({ type: "expand-all", expanded: true }))}>
                <ChevronsUpDown /> Expand all
              </CommandItem>
              <CommandItem onSelect={run(() => ol.dispatch({ type: "expand-all", expanded: false }))}>
                <ChevronsDownUp /> Collapse all
              </CommandItem>
              <CommandItem onSelect={run(() => toggleHideCompleted(ol, ui))}>
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

/** The registry's items in ⌘K: every leaf, flattened, its page shown before its label ("Date › Tomorrow"). */
function PaletteItemGroup({ heading, entries, run }: { readonly heading: string; readonly entries: readonly ItemEntry[]; readonly run: (action: ItemAction) => () => void }) {
  return (
    <CommandGroup heading={heading} data-command-group="item">
      <RegistryItems entries={entries} run={run} />
    </CommandGroup>
  );
}

function RegistryItems({
  entries,
  run,
  target,
  skipCurrent,
}: {
  readonly entries: readonly ItemEntry[];
  readonly run: (action: ItemAction) => () => void;
  /** Append "· Item title" (the Actions group, where the target is not obvious). */
  readonly target?: string;
  /** Leave out the current choice ("View as List" while it is a list). */
  readonly skipCurrent?: boolean;
}) {
  return (
    <>
      {flattenActions(entries)
        .filter(({ action }) => !(skipCurrent && action.current))
        .map(({ action, path }) => (
          <CommandItem
            key={action.commandId}
            value={filterValue(action, path) + (target ? `\u0002${target}` : "")}
            disabled={action.disabled}
            data-command={action.commandId}
            data-command-kind="action"
            data-current={action.current ? "" : undefined}
            onSelect={run(action)}
            className={cn(action.destructive && "text-destructive [&_svg]:text-destructive!")}
          >
            {action.icon ?? <span aria-hidden className="size-4 shrink-0" />}
            <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate">
              {path.length > 0 && <span className="shrink-0 text-muted-foreground">{path.join(" › ")} ›</span>}
              <bdi data-command-label="" className="truncate">
                {action.label}
              </bdi>
              {target && <span className="ms-1 min-w-0 truncate text-muted-foreground">· {target}</span>}
            </span>
            {action.current && <span className="text-signal">●</span>}
            {action.shortcut && (
              <CommandShortcut dir="ltr" data-command-hint="">
                {action.shortcut}
              </CommandShortcut>
            )}
          </CommandItem>
        ))}
    </>
  );
}

/** The entries of one page of the registry (empty when it is not there). */
function pageItems(entries: readonly ItemEntry[], commandId: string): readonly ItemEntry[] {
  const page = findEntry(entries, commandId);
  return page?.kind === "submenu" ? page.items : [];
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

/**
 * The ⌘/ sheet, generated: every fixed row key (keymap.ts FIXED_KEYS, what the row handler
 * runs) and every remappable shortcut (SHORTCUTS, with the live profile and remaps), each group
 * followed by the few keys that belong to a field or a gesture rather than to either table.
 */
export function shortcutsFor({ modKey, isMac }: PlatformKeys, keymap: Keymap): readonly { readonly group: string; readonly items: readonly (readonly [string, string])[] }[] {
  // Remappable keys come from the active keymap (profile + remaps), so this sheet never lies.
  const k = (id: ShortcutId) => shortcutLabel(keymap, id, isMac) || "—";
  const combo = (value: string) => formatCombo(value, isMac);
  const power = keymap.profile === "power";
  const alt = isMac ? "⌥" : "Alt ";
  const extras: Record<ShortcutGroup, readonly (readonly [string, string])[]> = {
    Document: [
      ["Item actions (type to filter, ↵ runs)", `/ · ${combo("Shift+F10")}`],
      ["Next · previous match", `${combo("Enter")} · ${combo("Shift+Enter")} in search`],
      ["Flat results", `${combo("Alt+Enter")} in search`],
      ["Toolbar · search · outline", `F6 · ${combo("Shift+F6")}`],
    ],
    Structure: [["Undo · Redo", `${combo("Mod+z")} · ${combo("Mod+Shift+z")}`]],
    Folding: [],
    Writing: [
      ["New item (while editing)", combo("Enter")],
      ["Edit note (from a title)", combo("Shift+Enter")],
      [power ? "Line break in a note (↵ starts the next item)" : "Line break in a note", power ? combo("Mod+Shift+Enter") : combo("Enter")],
      ["Indent · Outdent (while editing)", `Tab · ${combo("Shift+Tab")}`],
      ["Merge with previous", `${combo("Backspace")} at start`],
      ["Select item (leave the field)", "Esc"],
    ],
    Formatting: [["Tag · Mention · Date", "#tag · @name · !(2026-11-03)"]],
  };
  return [
    {
      group: "Rows",
      items: [
        ...FIXED_KEYS.map((def) => [def.label, fixedKeyText(def, isMac)] as const),
        ["Add or remove a row", `${modKey}-click`],
        ["Select all", `${combo("Mod+a")} twice`],
        ["Copy · Cut · Paste", `${modKey}C · X · V`],
        ["Copy while dragging", `${alt}-drag`],
      ],
    },
    ...SHORTCUT_GROUPS.map((group) => ({
      group,
      items: [...SHORTCUTS.filter((def) => def.group === group).map((def) => [def.label, k(def.id)] as const), ...extras[group]],
    })),
    {
      group: "Board and mind map",
      items: [
        ["Move a card or column across", `${combo("Alt+Shift+ArrowLeft")} · ${combo("Alt+Shift+ArrowRight")}`],
        ["Mind map: zoom into a node", combo("Enter")],
        ["Mind map: fit to screen", "0"],
        ["Mind map: zoom the canvas", "+ · −"],
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

export { OutlinerDatePicker } from "./outliner-date-picker";
