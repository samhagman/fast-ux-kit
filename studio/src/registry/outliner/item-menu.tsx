import * as React from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { findOutlineNode } from "@fux/core";
import { cn } from "@/lib/utils";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut } from "@/components/ui/command";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { useOutlinerContext, usePlatformKeys, type FocusReturn, type ItemMenuRequest, type OutlinerUi } from "./context";
import { fieldCaretRect, fieldReturn, type CaretField } from "./focus";
import { afterFocusReturn, filterValue, findEntry, itemActions, wordFilter, type ItemAction, type ItemEntry, type ItemSubmenu } from "./item-actions";
import { inlineToPlain, parseInline } from "./inline";
import { isComposingKey, isItemMenuKey, type ComboEvent } from "./keymap";
import { resolveTarget } from "./target";
import type { OutlinerController, OutlinerRow } from "./use-outliner";

/**
 * The item menu: the registry (item-actions.tsx) as a filterable list. One engine (cmdk) and
 * one set of keys for both ways in:
 *
 *   row mode   "/" · ⇧F10 · ContextMenu   a popover at the cursor row; its own filter field
 *                                          owns focus, Esc returns focus to the tree
 *   text mode  "/" at the start of a      attached under the caret; the field keeps focus and
 *              field or after a space     its "/query" is transient: never stored, never in
 *                                          history, removed by Esc, Enter or a click elsewhere
 *
 *   ┌ Item · Launch plan ─────────┐      keys (both modes)
 *   │ ⌕ d                         │      letters, space   filter (nothing runs)
 *   │ ▸ Date                    › │      ↑ ↓ Home End     move
 *   │   Duplicate                 │      ↵                run, or open a page
 *   │   Delete                 ⌫  │      →                open a page
 *   └─────────────────────────────┘      ← ⌫ (empty)      back a page
 *                                        Esc              back a page, else close
 *
 * Typing a query and pressing nothing else never changes the document. Ranking: words in the
 * label beat words elsewhere, then the closer (shorter) label, then shallower, then registry
 * order, so "d" is Date and "sel" is the Select page.
 */

/* ───────────────────────────── Ranking ───────────────────────────── */

export interface RankedEntry {
  readonly entry: ItemAction | ItemSubmenu;
  /** Page labels above it, when a search reaches into pages ("Date" for Tomorrow). */
  readonly path: readonly string[];
}

/** What a page shows for `search`: its own entries in order, or (searching) every match below it, best first. */
export function rankEntries(items: readonly ItemEntry[], search: string): readonly (RankedEntry | { readonly separator: string })[] {
  if (!search.trim()) return items.map((entry) => (entry.kind === "separator" ? { separator: entry.id } : { entry, path: [] }));
  const found: { ranked: RankedEntry; score: number; depth: number; order: number }[] = [];
  const walk = (entries: readonly ItemEntry[], path: readonly string[], disabled: boolean) => {
    for (const entry of entries) {
      if (entry.kind === "separator") continue;
      const off = disabled || !!entry.disabled;
      const score = wordFilter(filterValue(entry, path), search);
      if (score > 0) found.push({ ranked: { entry: off && !entry.disabled ? { ...entry, disabled: true } : entry, path }, score, depth: path.length, order: found.length });
      if (entry.kind === "submenu") walk(entry.items, [...path, entry.label], off);
    }
  };
  walk(items, [], false);
  return found
    .sort((a, b) => b.score - a.score || a.ranked.entry.label.length - b.ranked.entry.label.length || a.depth - b.depth || a.order - b.order)
    .map((item) => item.ranked);
}

/* ───────────────────────────── The model (keys, pages, highlight) ───────────────────────────── */

type Step = { readonly commandId: string; readonly label: string; readonly base: number };

/**
 * Pages are a stack of command ids (labels and enablement are re-read from the live registry).
 * `base` is how much of the query was typed before the page opened: what the page filters on is
 * the rest. Backspacing into that earlier text goes back a page on its own.
 */
function useMenuModel(
  entries: readonly ItemEntry[],
  query: string,
  { onRun, onClose, onPage }: { readonly onRun: (action: ItemAction) => void; readonly onClose: () => void; readonly onPage?: () => void },
) {
  const [stack, setStack] = React.useState<readonly Step[]>([]);
  const steps = stack.filter((step) => step.base <= query.length);
  const top = steps.at(-1);
  const page = top ? findEntry(entries, top.commandId) : null;
  const items = page?.kind === "submenu" ? page.items : entries;
  const search = query.slice(top?.base ?? 0);
  const ranked = rankEntries(items, search);
  const choices = ranked.flatMap((item) => ("entry" in item && !item.entry.disabled ? [item.entry] : []));
  const [active, setActive] = React.useState<string>("");
  const first = choices[0]?.commandId ?? "";
  const key = `${top?.commandId ?? ""}\u0000${search}`;
  const shownKey = React.useRef(key);
  // A new page or a new search highlights its first choice; a highlight that went away too.
  const current = shownKey.current !== key || !choices.some((choice) => choice.commandId === active) ? first : active;
  React.useEffect(() => {
    shownKey.current = key;
    if (current !== active) setActive(current);
  });
  const enter = (submenu: ItemSubmenu, base: number) => {
    setStack([...steps, { commandId: submenu.commandId, label: submenu.label, base }]);
    onPage?.();
  };
  const back = () => {
    setStack(steps.slice(0, -1));
    onPage?.();
  };
  const activate = (entry: ItemAction | ItemSubmenu, base: number) => {
    if (entry.disabled) return;
    if (entry.kind === "submenu") enter(entry, base);
    else onRun(entry);
  };
  const highlighted = choices.find((choice) => choice.commandId === current) ?? null;
  const move = (to: number) => {
    if (!choices.length) return;
    setActive(choices[(to + choices.length) % choices.length]!.commandId);
  };
  /**
   * One key. "handled" consumes it; "pass" lets it reach the filter text (letters, space, ⌫).
   * `base` is the query length a page opened now would start from.
   */
  const onKey = (event: { readonly key: string; readonly shiftKey?: boolean }, base: number, attached: boolean): "handled" | "pass" => {
    const at = choices.findIndex((choice) => choice.commandId === current);
    switch (event.key) {
      case "ArrowDown":
        move(at + 1);
        return "handled";
      case "ArrowUp":
        move(at < 0 ? -1 : at - 1);
        return "handled";
      case "Home":
        move(0);
        return "handled";
      case "End":
        move(choices.length - 1);
        return "handled";
      case "Enter":
        if (highlighted) activate(highlighted, base);
        return "handled";
      case "Tab":
        // Tab never runs a command (and never leaves the menu half-way).
        return "handled";
      case "ArrowRight":
        if (highlighted?.kind === "submenu") {
          enter(highlighted, base);
          return "handled";
        }
        return attached ? "handled" : "pass";
      case "ArrowLeft":
        if (top && !search) {
          back();
          return "handled";
        }
        return attached ? "handled" : "pass";
      case "Backspace":
        if (top && !search) {
          back();
          return "handled";
        }
        return "pass";
      case "Escape":
        if (top) back();
        else onClose();
        return "handled";
      default:
        return "pass";
    }
  };
  return { page: page?.kind === "submenu" ? page : null, top, ranked, active: current, setActive, activate, back, onKey, search };
}

/* ───────────────────────────── The list ───────────────────────────── */

function MenuList({
  model,
  heading,
  base,
  labels,
  listId,
}: {
  readonly model: ReturnType<typeof useMenuModel>;
  readonly heading: string;
  readonly base: number;
  readonly labels: OutlinerUi["labels"];
  readonly listId?: string;
}) {
  return (
    <>
      <div className="flex min-h-8 items-center gap-1 px-2 pt-1 font-mono text-2xs font-medium tracking-wide text-muted-foreground uppercase coarse:min-h-11">
        {model.page ? (
          <button
            type="button"
            tabIndex={-1}
            data-item-menu-back=""
            aria-label={labels.back}
            onMouseDown={(event) => event.preventDefault()}
            onClick={model.back}
            className="-ms-1 grid size-6 place-items-center rounded-md hover:bg-muted coarse:size-11"
          >
            <ChevronLeft className="size-3.5 rtl:rotate-180" />
          </button>
        ) : null}
        <bdi className="min-w-0 truncate">{model.page ? model.page.label : heading}</bdi>
      </div>
      <CommandList id={listId} className="max-h-[min(60vh,340px)] px-1 pb-1">
        <CommandEmpty className="py-4 text-[12px] text-muted-foreground">{labels.noResults}</CommandEmpty>
        {model.ranked.map((item, index) => {
          if ("separator" in item) return <CommandSeparator key={item.separator} className="my-1" alwaysRender />;
          const { entry, path } = item;
          return (
            <CommandItem
              key={`${entry.commandId}:${index}`}
              value={entry.commandId}
              disabled={entry.disabled}
              data-command={entry.commandId}
              data-command-kind={entry.kind === "submenu" ? "page" : "action"}
              data-current={entry.kind === "action" && entry.current ? "" : undefined}
              onSelect={() => model.activate(entry, base)}
              className={cn(
                "h-7 gap-2 text-ui coarse:h-11 coarse:text-[15px] [&_svg]:text-muted-foreground",
                entry.kind === "action" && entry.destructive && "text-destructive [&_svg]:text-destructive",
              )}
            >
              {/* A glyph-less entry keeps the icon column, so every label starts in one line. */}
              {entry.icon ?? <span aria-hidden className="w-4 shrink-0 coarse:w-4" />}
              <span className="flex min-w-0 flex-1 items-baseline gap-1 truncate">
                {path.length > 0 && <span className="shrink-0 text-muted-foreground">{path.join(" › ")} ›</span>}
                <bdi data-command-label="" className="truncate">
                  {entry.label}
                </bdi>
              </span>
              {entry.kind === "action" && entry.current && <span className="text-signal">●</span>}
              {entry.kind === "action" && entry.shortcut && (
                <CommandShortcut dir="ltr" data-command-hint="" className="tracking-normal">
                  {entry.shortcut}
                </CommandShortcut>
              )}
              {entry.kind === "submenu" && <ChevronRight className="ms-auto rtl:rotate-180" />}
            </CommandItem>
          );
        })}
      </CommandList>
    </>
  );
}

const headingFor = (ol: OutlinerController, ui: OutlinerUi, ids: readonly string[], row: OutlinerRow) => {
  if (ids.length > 1) return ui.labels.selectionHeader(ids.length);
  const resolve = (id: string) => {
    const node = findOutlineNode(ol.state.nodes, id)?.node;
    return node ? inlineToPlain(node.text) : null;
  };
  return inlineToPlain(row.node.text, resolve) || ui.labels.untitled;
};

/* ───────────────────────────── Row mode: the popover ───────────────────────────── */

/** When the keyboard asked for a menu last: the browser's own context menu for that key is suppressed. */
let keyboardMenuAt = 0;
/** The keyboard (⇧F10, ContextMenu) just opened the item menu: swallow the native menu that follows it. */
export function suppressKeyboardContextMenu(event: React.MouseEvent) {
  if (Date.now() - keyboardMenuAt < 800) event.preventDefault();
}

/**
 * Open the item menu on the target (the selection, else the cursor row) or on the row being
 * edited. Returns false when there is nothing to act on.
 */
export function openItemMenu(
  ol: OutlinerController,
  ui: OutlinerUi,
  from: { readonly kind: "row" } | Extract<FocusReturn, { kind: "text" }>,
  viaKeyboard = true,
): boolean {
  const target = from.kind === "row" ? resolveTarget(ol.state, ol.viewRows(), false) : { ids: [from.id], cursor: from.id };
  const rowId = target.cursor ?? target.ids.at(-1);
  if (!rowId || !target.ids.length) return false;
  if (viaKeyboard) keyboardMenuAt = Date.now();
  const root = ui.rootRef.current;
  const rowEl = root?.querySelector<HTMLElement>(`[data-row="${CSS.escape(rowId)}"]`);
  const el = rowEl?.querySelector<HTMLElement>("[data-ol-title], [data-ol-editor], textarea") ?? rowEl ?? ui.listRef.current;
  const box = el?.getBoundingClientRect();
  ui.setItemMenu({
    rowId,
    ids: target.ids,
    revision: ol.currentSeq(),
    rect: { left: box?.left ?? 0, top: box?.top ?? 0, width: box?.width ?? 0, height: box?.height ?? 0 },
    returnTo: from.kind === "row" ? { kind: "row", id: rowId } : from,
  });
  return true;
}

export function OutlinerItemMenu() {
  const { ol, ui } = useOutlinerContext();
  const request = ui.itemMenu;
  // While it animates out it keeps showing what it showed; a row deleted under it keeps its last face.
  const last = React.useRef<{ request: ItemMenuRequest; row: OutlinerRow } | null>(null);
  const row = request ? (ol.rowOf(request.rowId) ?? (last.current?.request === request ? last.current.row : null)) : null;
  if (request && row) last.current = { request, row };
  const shown = request && row ? { request, row } : last.current;
  return (
    <Popover open={!!request && !!row} onOpenChange={(open) => !open && ui.setItemMenu(null)}>
      {shown && (
        <PopoverAnchor asChild>
          <span aria-hidden style={{ position: "fixed", left: shown.request.rect.left, top: shown.request.rect.top, width: Math.max(1, shown.request.rect.width), height: shown.request.rect.height }} />
        </PopoverAnchor>
      )}
      {shown && <ItemMenuPopover key={`${shown.request.rowId}:${shown.request.revision}:${shown.request.ids.join(",")}`} request={shown.request} row={shown.row} />}
    </Popover>
  );
}

function ItemMenuPopover({ request, row }: { readonly request: ItemMenuRequest; readonly row: OutlinerRow }) {
  const { isMac } = usePlatformKeys();
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const entries = itemActions({ ol, ui, ids: request.ids, row, isMac });
  const [query, setQuery] = React.useState("");
  // Set when an entry runs: an entry that opens its own surface keeps the focus it takes.
  const ran = React.useRef<ItemAction | null>(null);
  const close = () => ui.setItemMenu(null);
  const model = useMenuModel(entries, query, {
    onRun: (action) => {
      ran.current = action;
      close();
      // A surface (the palette, a field, the date picker) opens once this one has let go.
      if (action.opensSurface) afterFocusReturn(action.run);
      else action.run();
    },
    onClose: close,
    // A page has a filter of its own: it starts empty.
    onPage: () => setQuery(""),
  });
  const listId = React.useId();
  return (
    <PopoverContent
      side="bottom"
      align="start"
      sideOffset={4}
      collisionPadding={12}
      data-item-menu="popover"
      aria-label={L.itemMenu}
      className="w-72 max-w-[calc(100vw-1.5rem)] gap-0 p-0"
      onEscapeKeyDown={(event) => {
        // Esc closes one level: a page goes back, the root closes.
        if (model.page) {
          event.preventDefault();
          model.back();
        }
      }}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        const action = ran.current;
        ran.current = null;
        if (action?.opensSurface) return;
        // Back where the menu came from: the tree (the cursor stays), or the field with its selection.
        // An action whose result becomes the target (Duplicate) hands the tree its result instead.
        const result = action?.select === "result" && request.returnTo?.kind === "row" ? [...ol.latestSelection()][0] : undefined;
        ui.returnFocus(null, result ? { kind: "row", id: result } : request.returnTo);
      }}
    >
      <Command
        shouldFilter={false}
        loop
        value={model.active}
        onValueChange={model.setActive}
        label={L.itemMenu}
        className="rounded-lg! bg-transparent p-0"
        onKeyDown={(event) => {
          if (isComposingKey(event) || event.key === "Escape") return;
          if (model.onKey(event, 0, false) === "handled") {
            event.preventDefault();
            event.stopPropagation();
          }
        }}
      >
        <div className="px-1 pt-1">
          <CommandInput value={query} onValueChange={setQuery} placeholder={L.itemMenuFilter} aria-label={L.itemMenuFilter} aria-controls={listId} data-item-menu-input="" />
        </div>
        <MenuList model={model} heading={headingFor(ol, ui, request.ids, row)} base={0} labels={L} listId={listId} />
      </Command>
    </PopoverContent>
  );
}

/* ───────────────────────────── Text mode: "/" in a field ───────────────────────────── */

/** Kinds of text where "/" is just a character: code, math, links, URLs. */
const LITERAL_KINDS = new Set(["code", "math", "url", "link", "ref", "date"]);

/**
 * The `/query` ending at `caret`, or null when "/" here is plain text: not at the start of the
 * field or after whitespace (`a/b`, `https://`, `\/`), or inside code, math or a link.
 */
export function findSlashToken(value: string, caret: number): { readonly start: number; readonly query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)\/([\p{L}\p{N}_.\- ]{0,24})$/u.exec(before);
  if (!match) return null;
  const start = match.index + match[1]!.length;
  if (parseInline(value).some((segment) => LITERAL_KINDS.has(segment.kind) && segment.start < start && start < segment.end)) return null;
  // Still being typed (not closed yet): an odd count of unescaped markers before it.
  const open = (marker: string) => (value.slice(0, start).match(new RegExp(`(?<!\\\\)\\${marker}`, "g"))?.length ?? 0) % 2 === 1;
  if (open("`") || open("$")) return null;
  return { start, query: match[2]! };
}

/** A key on the field, as the menu reads it (React's on a textarea, the live field's own). */
type SlashKeyEvent = ComboEvent & {
  readonly currentTarget: CaretField;
  readonly nativeEvent?: { readonly isComposing?: boolean; readonly keyCode?: number };
  preventDefault(): void;
  stopPropagation(): void;
};

interface Transient {
  /** The field's text with the `/query` in it (shown, never stored). */
  readonly text: string;
  readonly start: number;
  readonly caret: number;
}

/**
 * The text-mode menu for one field (RowField). While open, the field shows `value` and the
 * document does not change: `onChange` returns true for edits of the query itself.
 */
export function useSlashMenu({
  ol,
  ui,
  row,
  field,
  ref,
}: {
  readonly ol: OutlinerController;
  readonly ui: OutlinerUi;
  readonly row: OutlinerRow;
  readonly field: "title" | "note";
  readonly ref: React.RefObject<CaretField | null>;
}) {
  const { isMac } = usePlatformKeys();
  const [transient, setTransient] = React.useState<Transient | null>(null);
  const live = React.useRef(transient);
  live.current = transient;
  const query = transient ? transient.text.slice(transient.start + 1, transient.caret) : "";
  const stored = () => {
    const node = findOutlineNode(ol.latestNodes(), row.id)?.node;
    return field === "note" ? ((node?.data as { note?: string } | undefined)?.note ?? "") : (node?.text ?? "");
  };
  /** Take the `/query` out again; the caret goes back to where "/" was typed. */
  const dismiss = (focus = true) => {
    const was = live.current;
    if (!was) return;
    live.current = null;
    setTransient(null);
    ol.dispatch({ type: "caret", id: row.id, start: was.start, end: was.start, ...(field === "note" ? { field: "note" as const } : {}) });
    if (focus)
      requestAnimationFrame(() => {
        const el = ref.current;
        if (el && document.activeElement === (el as unknown)) el.setSelectionRange(was.start, was.start);
      });
  };
  const entries = transient ? itemActions({ ol, ui, ids: [row.id], row, isMac }) : [];
  const model = useMenuModel(entries, query, {
    onRun: (action) => {
      dismiss();
      if (action.opensSurface) afterFocusReturn(action.run);
      else action.run();
    },
    onClose: () => dismiss(),
  });

  /** A field edit: true when it only typed (or erased) the transient query, so the caller must not store it. */
  const onChange = (el: CaretField): boolean => {
    const text = el.value;
    const caret = el.selectionStart;
    // Notes are prose: "/" is only a menu in a title (as before).
    if (field !== "title" || caret !== el.selectionEnd) {
      if (live.current) setTransient(null);
      return false;
    }
    const token = findSlashToken(text, caret);
    if (token && text.slice(0, token.start) + text.slice(caret) === stored()) {
      const next = { text, start: token.start, caret };
      live.current = next;
      setTransient(next);
      return true;
    }
    // Anything else (a character no command has, a 25th one): the text is real now.
    if (live.current) {
      live.current = null;
      setTransient(null);
    }
    return false;
  };
  /** A caret move: true while the menu owns it. Moving away from the query removes it. */
  const onSelect = (el: CaretField): boolean => {
    const was = live.current;
    if (!was) return false;
    if (el.selectionStart !== was.caret || el.selectionEnd !== was.caret) dismiss();
    return true;
  };
  /** True when the key belonged to the menu. */
  const onKeyDown = (event: SlashKeyEvent): boolean => {
    const el = event.currentTarget;
    if (!live.current) {
      if (!isItemMenuKey(event)) return false;
      event.preventDefault();
      event.stopPropagation();
      return openItemMenu(ol, ui, fieldReturn(el, row.id, field)) || true;
    }
    if (isComposingKey(event)) return false;
    // A chord (⌘B, ⌘Z …) would act on text that is not stored: the query goes first, the key with it.
    if (event.metaKey || event.ctrlKey || event.altKey) {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
      return true;
    }
    // Characters (and ⌫) edit the query; every other key is the menu's, so the field never splits,
    // indents, merges or walks away from text it has not stored.
    if (model.onKey(event, query.length, true) === "pass" && (event.key.length === 1 || event.key === "Backspace")) return false;
    event.preventDefault();
    event.stopPropagation();
    return true;
  };

  const listId = React.useId();
  const [activeId, setActiveId] = React.useState<string | undefined>(undefined);
  const panelRef = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = panelRef.current?.querySelector<HTMLElement>(`[cmdk-item][data-value="${CSS.escape(model.active)}"]`);
    setActiveId(el?.id || undefined);
  });
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  const start = transient?.start;
  React.useLayoutEffect(() => {
    if (start === undefined || !ref.current) return setRect(null);
    setRect(fieldCaretRect(ref.current, start));
  }, [start, ref]);

  const below = rect ? rect.bottom + 300 < window.innerHeight : true;
  const panel =
    transient && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={panelRef}
            data-item-menu="attached"
            role="dialog"
            aria-label={ui.labels.itemMenu}
            onMouseDown={(event) => event.preventDefault()}
            style={{
              position: "fixed",
              left: Math.max(8, Math.min((rect?.left ?? 0) - 6, window.innerWidth - 296)),
              ...(below ? { top: (rect?.bottom ?? 0) + 6 } : { bottom: window.innerHeight - (rect?.top ?? 0) + 6 }),
            }}
            className="z-[60] w-72 max-w-[calc(100vw-1rem)] overflow-hidden rounded-lg border bg-popover text-popover-foreground shadow-[0_10px_38px_-10px_rgb(0_0_0/0.22),0_1px_3px_rgb(0_0_0/0.06)]"
          >
            <Command shouldFilter={false} loop value={model.active} onValueChange={model.setActive} label={ui.labels.itemMenu} className="rounded-lg! bg-transparent p-0">
              <MenuList model={model} heading={headingFor(ol, ui, [row.id], row)} base={query.length} labels={ui.labels} listId={listId} />
            </Command>
          </div>,
          document.body,
        )
      : null;

  return {
    open: !!transient,
    /** The field shows this while the menu is open. */
    value: transient?.text ?? null,
    onChange,
    onSelect,
    onKeyDown,
    dismiss,
    panel,
    aria: transient ? { controls: listId, activedescendant: activeId } : null,
  };
}
