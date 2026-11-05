import * as React from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { ArrowUpRight, CornerDownRight, MoreHorizontal, Plus, StickyNote } from "lucide-react";
import { toast } from "../components/ui/sonner.js";
import { createOutlineId } from "../core/index.js";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "../components/ui/context-menu.js";
import { InlineText, inlineToPlain, inlineToSpeech, sourceOffsetFromPoint } from "./inline.js";
import { useOutlinerContext } from "./context.js";
import { ItemMenuContent } from "./outliner-chrome.js";
import { matchShortcut } from "./keymap.js";
import { onRowKey } from "./row-keys.js";
import { lingerShown, navRows, resolveTarget, type NavDirection, type ViewNav } from "./target.js";
import { rowForNode, type OutlinerRow } from "./use-outliner.js";
import { COLOR_STYLES, type OutlineItem } from "./types.js";
import {
  boardColumns,
  boardOrder,
  cardDrop,
  cardMeta,
  columnDrop,
  idAt,
  isNoopDrop,
  locateOnBoard,
  stepBoard,
  type BoardColumn,
  type BoardDrop,
  type BoardStep,
} from "./board.js";
import type { BoardFieldNav } from "./outliner.js";

/** Parts of the outliner the board renders (passed in, so the two modules don't import each other). */
export interface BoardParts {
  readonly RowField: React.ComponentType<{
    readonly row: OutlinerRow;
    readonly field: "title" | "note";
    readonly board?: BoardFieldNav;
  }>;
  readonly TaskCheckbox: React.ComponentType<{
    readonly checked: boolean;
    readonly disabled: boolean;
    readonly onToggle: () => void;
    readonly label?: string;
    readonly className?: string;
  }>;
  /** Follow an internal link: unzoom if needed, reveal and select the item. */
  readonly reveal: (id: string) => void;
}

const domId = (id: string) => `ol-row-${id}`;
/** Layout animation only while it stays cheap. */
const ANIMATE_CARDS = 160;

interface DragState {
  readonly kind: "card" | "column";
  readonly ids: readonly string[];
  readonly label: string;
  readonly pointer: { readonly x: number; readonly y: number };
  readonly target: BoardDrop | null;
  /** Indicator, in the board's content coordinates. */
  readonly line: {
    readonly x: number;
    readonly y: number;
    readonly length: number;
    readonly vertical: boolean;
  } | null;
}

/**
 * The board projection of a zoomed item (see board.ts). One focusable surface, like the outline's
 * tree: the cursor is the selection anchor (aria-activedescendant), so selection, clipboard,
 * the bulk bar, menus, the phone sheet and Escape-from-edit all work unchanged.
 */
export function OutlinerBoard({
  board,
  parts,
}: {
  readonly board: OutlineItem;
  readonly parts: BoardParts;
}) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const { RowField, TaskCheckbox } = parts;
  const coarse = useMediaQuery("(pointer: coarse)");
  // A card completed under Hide completed stays while it is still the target (target.ts linger).
  const linger = React.useMemo(
    () => lingerShown(ol.state.nodes, ol.linger),
    [ol.state.nodes, ol.linger],
  );
  const columns = React.useMemo(
    () => boardColumns(board, { hideCompleted: ol.view.hideCompleted, linger }),
    [board, ol.view.hideCompleted, linger],
  );
  const boardLocked = ol.isItemLocked(board.id);
  // Locks inherit down the tree: a column's lock covers its cards.
  const lockedIds = React.useMemo(() => {
    const out = new Set<string>();
    for (const column of columns) {
      const columnLocked = boardLocked || ol.isItemLocked(column.node.id);
      if (columnLocked) out.add(column.node.id);
      for (const card of column.cards)
        if (columnLocked || ol.isItemLocked(card.id)) out.add(card.id);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns, boardLocked]);
  const editableId = (id: string) => !ol.readOnly && !lockedIds.has(id);
  const rowOf = (node: OutlineItem, parentId: string, depth: number): OutlinerRow =>
    rowForNode(node, { parentId, depth, locked: lockedIds.has(node.id) });

  const selection = ol.state.selection;
  const caret = ui.editing ? ol.state.caret : null;
  // The cursor is the outline's (target.ts), resolved against what the board shows. Just zoomed in
  // (the caret still on the board item itself), there is none yet: entering lands on the first card.
  const target = resolveTarget(ol.state, navRows(boardOrder(columns)), false);
  const cursorId =
    !ui.editing && (selection.size || ol.state.caret?.id !== board.id) ? target.cursor : null;
  const cardCount = columns.reduce((sum, column) => sum + column.cards.length, 0);
  const animate = cardCount <= ANIMATE_CARDS;
  const listRef = ui.listRef;

  const rtl = () => !!listRef.current && getComputedStyle(listRef.current).direction === "rtl";
  const reveal = (id: string) =>
    requestAnimationFrame(() =>
      listRef.current
        ?.querySelector(`[data-row="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
  const select = (
    id: string,
    event?: { shiftKey?: boolean; metaKey?: boolean; ctrlKey?: boolean },
  ) => {
    ol.dispatch({
      type: "select",
      id,
      extend: !!event?.shiftKey,
      toggle: !!(event?.metaKey || event?.ctrlKey),
    });
    ui.focusList();
    reveal(id);
  };
  const edit = (id: string, start?: number) => {
    if (!editableId(id)) return select(id);
    const text = ol.rowOf(id)?.node.text ?? "";
    ol.dispatch({ type: "focus", id, start: start ?? text.length });
    ui.setEditing(true);
  };
  const open = (id: string) => {
    ol.dispatch({ type: "hoist", id });
    ui.setEditing(false);
  };
  const addCard = (column: OutlineItem, index = column.children?.length ?? 0) => {
    const id = createOutlineId();
    ol.dispatch({ type: "insert", id, parentId: column.id, index });
    ol.dispatch({ type: "focus", id });
    ui.setEditing(true);
    reveal(id);
  };
  const addColumn = () => {
    const id = createOutlineId();
    ol.dispatch({ type: "insert", id, parentId: board.id, index: board.children?.length ?? 0 });
    ol.dispatch({ type: "focus", id });
    ui.setEditing(true);
    reveal(id);
  };
  const columnTitle = (id: string) => {
    const column = board.children?.find((node) => node.id === id);
    return column ? inlineToPlain(column.text) || L.untitled : L.untitled;
  };
  const moveTo = (ids: readonly string[], drop: BoardDrop, kind: "card" | "column") => {
    if (isNoopDrop(board, ids, drop)) return false;
    const before = ol.latestNodes();
    const result = ol.dispatch({ type: "drop", ids, parentId: drop.parentId, index: drop.index });
    if (result.refusal || result.nodes === before) return false;
    if (kind === "card") ui.announce(L.cardMoved(columnTitle(drop.parentId)));
    else ui.announce(L.columnMoved(drop.index + 1, board.children?.length ?? 0));
    return true;
  };

  /* ── Keyboard: the shared row keys (row-keys.ts) plus the board's own moves ── */
  const live = React.useRef({ columns, rtl });
  live.current = { columns, rtl };
  const travel = React.useMemo<ViewNav>(() => {
    const steps: Record<NavDirection, BoardStep> = {
      up: "up",
      down: "down",
      left: "left",
      right: "right",
      first: "home",
      last: "end",
    };
    return {
      view: "board",
      visibleIds: () => boardOrder(live.current.columns),
      next(id, dir) {
        const { columns, rtl } = live.current;
        let step = steps[dir];
        // ←/→ are visual: a right-to-left board runs its columns the other way.
        if (rtl() && (step === "left" || step === "right"))
          step = step === "left" ? "right" : "left";
        return idAt(columns, stepBoard(columns, locateOnBoard(columns, id), step));
      },
      // Tab never nests a card under another: it leaves the board, as from any other widget.
      leaves: new Set(["item.indent", "item.outdent"]),
    };
  }, []);
  React.useLayoutEffect(() => {
    ol.setViewNav(travel);
    return () => {
      if (ol.viewNav() === travel) ol.setViewNav(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [travel]);

  /** The board's own structure keys: a card moves within and across columns, a column header moves its column. */
  const moveKey = (event: React.KeyboardEvent): boolean => {
    const mod = event.metaKey || event.ctrlKey;
    const chord = matchShortcut(ui.keymap, event, "row");
    const sideways =
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      (event.altKey || mod) &&
      event.shiftKey;
    const vertical = chord === "moveUp" || chord === "moveDown";
    if (!sideways && !vertical) return false;
    const here = locateOnBoard(columns, cursorId);
    event.preventDefault();
    if (!here) return true;
    const id = idAt(columns, here)!;
    if (!editableId(id)) {
      toast(ol.readOnly ? L.readOnly : L.locked, { id: "outliner-refusal" });
      return true;
    }
    const flip = (step: "left" | "right") => (rtl() ? (step === "left" ? "right" : "left") : step);
    const dir = vertical
      ? chord === "moveUp"
        ? "up"
        : "down"
      : flip(event.key === "ArrowLeft" ? "left" : "right");
    if (here.card < 0) {
      // A column header moves the whole column left/right.
      if (dir !== "left" && dir !== "right") return true;
      const to = here.column + (dir === "left" ? -1 : 1);
      if (to < 0 || to >= columns.length) return true;
      const others = columns.filter((_, i) => i !== here.column);
      const drop = columnDrop(
        board,
        id,
        dir === "left" ? others[to]!.node.id : (others[to + 1]?.node.id ?? null),
      );
      if (drop) moveTo([id], drop, "column");
    } else if (dir === "left" || dir === "right") {
      const to = here.column + (dir === "left" ? -1 : 1);
      const column = columns[to];
      if (!column || !editableId(column.node.id)) return true;
      const before = column.cards[Math.min(here.card, column.cards.length)]?.id ?? null;
      const drop = cardDrop(board, [id], column.node.id, before);
      if (drop) moveTo([id], drop, "card");
    } else {
      const cards = columns[here.column]!.cards;
      const to = here.card + (dir === "up" ? -1 : 1);
      if (to < 0 || to >= cards.length) return true;
      const others = cards.filter((card) => card.id !== id);
      const drop = cardDrop(board, [id], columns[here.column]!.node.id, others[to]?.id ?? null);
      if (drop) moveTo([id], drop, "card");
    }
    reveal(id);
    return true;
  };
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (ui.editing || event.target !== event.currentTarget) return;
    if (moveKey(event)) return;
    onRowKey(event, ol, ui, travel, { reveal });
  };

  /* ── Field navigation while editing a card or a column title ── */
  const nav = React.useMemo<BoardFieldNav>(
    () => ({
      step: (id, direction) => {
        const at = locateOnBoard(columns, id);
        if (!at) return null;
        const next = stepBoard(columns, at, direction);
        const target = idAt(columns, next);
        return target && target !== id ? target : null;
      },
      addAfter: (id) => {
        const at = locateOnBoard(columns, id);
        if (!at) return;
        const column = columns[at.column]!.node;
        // A column title's Enter starts its first card; a card's adds the one after it.
        const index =
          at.card < 0 ? 0 : (column.children ?? []).findIndex((card) => card.id === id) + 1;
        addCard(column, index);
      },
      removeEmpty: (id, next) => {
        ol.dispatch({ type: "delete", ids: [id] });
        if (next) {
          const text = ol.rowOf(next)?.node.text ?? "";
          ol.dispatch({ type: "focus", id: next, start: text.length });
        } else {
          ui.setEditing(false);
          ui.focusList();
        }
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns],
  );

  /* ── Pointer drag (cards and columns) ── */
  const drag = useBoardDrag({
    board,
    columns,
    coarse,
    moveTo,
    select,
    openSheet: (id) => openSheet(id),
  });
  const openSheet = (id: string) => {
    const many = selection.has(id) && selection.size > 1;
    (document.activeElement as HTMLElement | null)?.blur?.();
    const marked = !many && !selection.has(id);
    if (marked) ol.dispatch({ type: "select", id });
    ui.setSheet({ rowId: id, ids: many ? [...selection] : [id], marked });
    navigator.vibrate?.(8);
  };

  const menuFor = (
    row: OutlinerRow,
    label: string,
    className?: string,
    scope: "card" | "column" = "card",
  ) =>
    coarse ? (
      <button
        type="button"
        tabIndex={-1}
        data-row-actions
        aria-label={L.actionsFor(label)}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          openSheet(row.id);
        }}
        className={cn(
          "relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground after:absolute after:-inset-1.5 active:bg-muted",
          className,
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
            aria-label={L.actionsFor(label)}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-[opacity,background-color] hover:bg-muted hover:text-foreground data-[state=open]:bg-muted data-[state=open]:opacity-100",
              scope === "card"
                ? "group-hover/card:opacity-100"
                : "group-hover/column-head:opacity-100",
              className,
            )}
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          collisionPadding={12}
          className="w-56"
          onCloseAutoFocus={(event) => ui.returnFocus(event, row.id)}
        >
          <ItemMenuContent ids={selection.has(row.id) ? [...selection] : [row.id]} row={row} />
        </DropdownMenuContent>
      </DropdownMenu>
    );

  const renderCard = (card: OutlineItem, column: BoardColumn, index: number) => {
    const row = rowOf(card, column.node.id, 1);
    const editable = editableId(card.id);
    const editingField = caret?.id === card.id ? (caret.field ?? "title") : null;
    const selected = !ui.editing && selection.has(card.id);
    const cursor = cursorId === card.id;
    const meta = cardMeta(card);
    const color =
      card.data?.color && card.data.color in COLOR_STYLES ? COLOR_STYLES[card.data.color] : null;
    const spoken = inlineToSpeech(card.text) || L.untitled;
    const dragging = drag.state?.ids.includes(card.id) ?? false;
    const task = card.checked !== undefined;
    const body = (
      <motion.div
        layout={animate && !dragging ? "position" : false}
        layoutId={animate ? `card-${card.id}` : undefined}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: dragging ? 0.35 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{
          layout: motionTokens.layout,
          opacity: motionTokens.quick,
          scale: motionTokens.quick,
        }}
        role="listitem"
        id={domId(card.id)}
        data-row={card.id}
        data-card=""
        aria-current={cursor ? "true" : undefined}
        aria-posinset={index + 1}
        aria-setsize={column.cards.length}
        aria-label={`${spoken}${row.completed ? ", completed" : ""}${task && !row.completed ? ", task" : ""}${meta.descendants ? `, ${meta.descendants} inside` : ""}${meta.hasNote ? ", has note" : ""}${row.locked ? ", locked" : ""}`}
        onPointerDown={(event) =>
          !editingField &&
          drag.start(event, "card", card.id, inlineToPlain(card.text) || L.untitled)
        }
        onClick={(event) => {
          if (editingField || drag.consumeClick()) return;
          select(card.id, event);
        }}
        onDoubleClick={(event) => {
          if (editingField || (event.target as Element).closest("textarea,button,[data-ol-editor]"))
            return;
          open(card.id);
        }}
        onContextMenu={coarse ? (event) => event.preventDefault() : undefined}
        className={cn(
          "group/card relative rounded-lg border bg-surface px-2.5 py-2 text-[13.5px] leading-5 transition-[border-color,box-shadow,background-color] duration-150",
          "border-hairline shadow-[0_1px_0_rgb(0_0_0/0.03)] hover:border-border dark:bg-foreground/[0.035]",
          !editingField && "select-none",
          coarse && !editingField && "[-webkit-touch-callout:none]",
          selected && "border-signal/45 bg-signal-muted/40",
          cursor && "border-signal/70 ring-2 ring-signal/20",
          editingField && "border-signal/60 ring-2 ring-signal/15 cursor-text",
        )}
      >
        {color && (
          <span
            aria-hidden
            className={cn(
              "absolute inset-y-2 start-0 w-[3px] rounded-e-full opacity-80",
              color.bar,
            )}
          />
        )}
        <div className="flex items-start gap-2">
          {task && (
            <span className="flex h-5 shrink-0 items-center">
              <TaskCheckbox
                checked={row.completed}
                disabled={!editable}
                label={`${row.completed ? L.markIncomplete : L.complete}: ${spoken}`}
                onToggle={() => {
                  ui.announceToggle(ol.commands.toggleComplete([card.id]));
                  if (!coarse && !ui.editing) select(card.id);
                }}
              />
            </span>
          )}
          <div
            className={cn(
              "min-w-0 flex-1",
              row.completed &&
                editingField !== "title" &&
                "text-muted-foreground line-through decoration-muted-foreground/60",
            )}
          >
            {editingField === "title" ? (
              <RowField row={row} field="title" board={nav} />
            ) : (
              <span
                className={cn("block min-h-5", editable ? "cursor-text" : "cursor-default")}
                onClick={(event) => {
                  if (drag.consumeClick() || event.shiftKey || event.metaKey || event.ctrlKey)
                    return;
                  if (!editable) return;
                  event.stopPropagation();
                  edit(
                    card.id,
                    sourceOffsetFromPoint(
                      event.currentTarget,
                      event.clientX,
                      event.clientY,
                      card.text.length,
                    ),
                  );
                }}
              >
                {card.text ? (
                  <InlineText
                    source={card.text}
                    onTag={(tag) => ol.setView((view) => ({ ...view, query: tag }))}
                    onRef={(title, id) => {
                      if (id && !ol.rowOf(id) && ol.external?.resolve(id) !== undefined)
                        ol.external.open(id);
                      else if (id) parts.reveal(id);
                      else ol.setView((view) => ({ ...view, query: `"${title}"` }));
                    }}
                    resolveRef={(id) => ol.rowOf(id)?.node.text ?? ol.external?.resolve(id) ?? null}
                  />
                ) : (
                  <span className="text-muted-foreground/50">{L.untitled}</span>
                )}
              </span>
            )}
          </div>
          {!coarse && (
            <button
              type="button"
              tabIndex={-1}
              aria-label={`${L.openCard}: ${spoken}`}
              title={L.openCard}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                open(card.id);
              }}
              className="-mt-0.5 grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-hover/card:opacity-100 hover:bg-muted hover:text-foreground"
            >
              <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
            </button>
          )}
          {menuFor(row, spoken, coarse ? "-me-1 -mt-1.5" : "-me-1 -mt-0.5")}
        </div>
        {editingField === "note" ? (
          <div className="mt-1 ps-0.5">
            <RowField row={row} field="note" board={nav} />
          </div>
        ) : (
          card.data?.note &&
          ol.view.noteDisplay !== "hide" && (
            <p
              dir="auto"
              className="mt-1 line-clamp-2 text-[12px] leading-[18px] text-muted-foreground"
            >
              {inlineToPlain(card.data.note)}
            </p>
          )
        )}
        {(meta.descendants > 0 || meta.hasNote) && (
          <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground tabular-nums">
            {meta.descendants > 0 && (
              <button
                type="button"
                tabIndex={-1}
                aria-label={`${L.openCard}: ${meta.descendants} inside`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  open(card.id);
                }}
                className="relative inline-flex h-[18px] items-center gap-1 rounded-[5px] border border-hairline px-1 transition-colors after:absolute after:-inset-1 hover:border-border hover:text-foreground coarse:after:-inset-3"
              >
                {meta.tasks > 0 ? (
                  <>
                    <span
                      className="relative h-[3px] w-3.5 overflow-hidden rounded-full bg-foreground/15"
                      aria-hidden
                    >
                      <span
                        className={cn(
                          "absolute inset-y-0 start-0 rounded-full",
                          meta.done === meta.tasks ? "bg-success" : "bg-signal",
                        )}
                        style={{ width: `${(meta.done / meta.tasks) * 100}%` }}
                      />
                    </span>
                    {meta.done}/{meta.tasks}
                  </>
                ) : (
                  <>
                    <CornerDownRight className="size-3 rtl:-scale-x-100" /> {meta.descendants}
                  </>
                )}
              </button>
            )}
            {meta.hasNote && ol.view.noteDisplay === "hide" && (
              <StickyNote aria-hidden className="size-3" />
            )}
          </div>
        )}
      </motion.div>
    );
    if (coarse || editingField) return <React.Fragment key={card.id}>{body}</React.Fragment>;
    return (
      <ContextMenu key={card.id}>
        <ContextMenuTrigger asChild>{body}</ContextMenuTrigger>
        <ContextMenuContent
          collisionPadding={12}
          onCloseAutoFocus={(event) => ui.returnFocus(event, card.id)}
          className="max-h-[min(70vh,var(--available-height))] w-56 overflow-y-auto"
        >
          <ItemMenuContent
            variant="context"
            ids={selection.has(card.id) ? [...selection] : [card.id]}
            row={row}
          />
        </ContextMenuContent>
      </ContextMenu>
    );
  };

  const renderColumn = (column: BoardColumn) => {
    const node = column.node;
    const row = rowOf(node, board.id, 0);
    const editable = editableId(node.id);
    const editingTitle = caret?.id === node.id;
    const cursor = cursorId === node.id;
    const selected = !ui.editing && selection.has(node.id);
    const title = inlineToPlain(node.text) || L.untitled;
    const color =
      node.data?.color && node.data.color in COLOR_STYLES ? COLOR_STYLES[node.data.color] : null;
    const dragging = drag.state?.kind === "column" && drag.state.ids.includes(node.id);
    const done = column.cards.filter(
      (card) => card.checked === true || card.data?.completed === true,
    ).length;
    return (
      <motion.section
        key={node.id}
        layout={animate && !dragging ? "position" : false}
        transition={{ layout: motionTokens.layout }}
        data-board-column={node.id}
        animate={{ opacity: dragging ? 0.4 : 1 }}
        className="group/column flex w-[272px] shrink-0 snap-center flex-col rounded-xl border border-hairline bg-muted/35 max-sm:w-[calc(100%-1.5rem)] dark:bg-foreground/[0.025]"
      >
        <div
          role="heading"
          aria-level={3}
          id={domId(node.id)}
          data-row={node.id}
          aria-current={cursor ? "true" : undefined}
          onPointerDown={(event) => !editingTitle && drag.start(event, "column", node.id, title)}
          onClick={(event) => {
            if (editingTitle || drag.consumeClick()) return;
            select(node.id, event);
          }}
          className={cn(
            "group/column-head relative flex min-h-10 items-center gap-2 rounded-t-xl px-3 pt-2 pb-1.5 coarse:min-h-12",
            editable && !editingTitle && "cursor-grab active:cursor-grabbing",
            coarse && !editingTitle && "select-none [-webkit-touch-callout:none]",
            (cursor || selected) && "bg-foreground/[0.04]",
          )}
        >
          {cursor && (
            <motion.span
              layoutId="board-column-cursor"
              aria-hidden
              transition={motionTokens.layout}
              className="absolute inset-x-3 top-0 h-[2px] rounded-full bg-signal"
            />
          )}
          {color && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", color.dot)} />}
          <div className="min-w-0 flex-1 text-[13px] leading-5 font-semibold">
            {editingTitle ? (
              <RowField row={row} field="title" board={nav} />
            ) : (
              <span
                className={cn("block truncate", editable ? "cursor-text" : "cursor-default")}
                onClick={(event) => {
                  if (
                    drag.consumeClick() ||
                    !editable ||
                    event.shiftKey ||
                    event.metaKey ||
                    event.ctrlKey
                  )
                    return;
                  event.stopPropagation();
                  edit(node.id);
                }}
              >
                {node.text ? (
                  <InlineText source={node.text} />
                ) : (
                  <span className="font-normal text-muted-foreground/60">{L.untitled}</span>
                )}
              </span>
            )}
          </div>
          <span
            className="shrink-0 font-mono text-[10.5px] font-normal text-muted-foreground tabular-nums"
            aria-hidden
          >
            {done > 0 ? `${done}/${column.cards.length}` : column.cards.length}
          </span>
          {menuFor(row, title, undefined, "column")}
        </div>
        <div
          role="list"
          aria-label={L.column(title, column.cards.length)}
          data-board-cards={node.id}
          className="flex min-h-12 flex-col gap-1.5 px-2 pb-1"
        >
          <AnimatePresence initial={false}>
            {column.cards.map((card, index) => renderCard(card, column, index))}
          </AnimatePresence>
          {!column.cards.length && (
            <div
              aria-hidden
              className="grid h-10 place-items-center rounded-lg border border-dashed border-border/70 font-mono text-[10.5px] text-muted-foreground/70"
            >
              {L.emptyColumn}
            </div>
          )}
        </div>
        {editable && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => addCard(node)}
            className="group/add mx-2 mt-0.5 mb-2 flex h-8 items-center gap-2 rounded-md px-1.5 text-ui text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground coarse:h-11"
          >
            <Plus className="size-3.5 transition-transform group-hover/add:rotate-90" />
            {L.addCard}
          </button>
        )}
      </motion.section>
    );
  };

  const focusFirst = () => {
    if (cursorId || !columns.length) return;
    const id = idAt(columns, stepBoard(columns, null, "down"));
    if (id) ol.dispatch({ type: "select", id });
  };

  return (
    <div className="relative">
      <div
        ref={listRef}
        data-focus-entry=""
        role="group"
        aria-roledescription={L.board}
        aria-label={inlineToSpeech(board.text) || L.untitled}
        aria-activedescendant={cursorId ? domId(cursorId) : undefined}
        tabIndex={ui.editing ? -1 : 0}
        data-board=""
        onFocus={(event) => event.target === event.currentTarget && focusFirst()}
        onKeyDown={onKeyDown}
        className="relative flex snap-x snap-mandatory items-start gap-3 overflow-x-auto overscroll-x-contain px-3 pt-1 pb-6 outline-none [scrollbar-width:thin] max-sm:[scrollbar-width:none] sm:snap-none sm:ps-[48px] sm:pe-6 max-sm:scroll-px-3"
      >
        <LayoutGroup id={`board-${board.id}`}>{columns.map(renderColumn)}</LayoutGroup>
        {!boardLocked && !ol.readOnly && (
          <div className="flex w-[272px] shrink-0 snap-center flex-col gap-2 max-sm:w-[calc(100%-1.5rem)]">
            <button
              type="button"
              tabIndex={-1}
              onClick={addColumn}
              className="flex h-10 items-center gap-2 rounded-xl border border-dashed border-border px-3 text-ui text-muted-foreground transition-colors hover:border-foreground/25 hover:bg-muted/40 hover:text-foreground coarse:h-12"
            >
              <Plus className="size-3.5" /> {L.addColumn}
            </button>
            {!columns.length && (
              <p className="px-1 text-[12px] text-muted-foreground">{L.emptyBoard}</p>
            )}
          </div>
        )}
        <BoardDropLine drag={drag.state} />
      </div>
      <BoardGhost drag={drag.state} />
    </div>
  );
}

function BoardDropLine({ drag }: { readonly drag: DragState | null }) {
  const line = drag?.line;
  return (
    <AnimatePresence>
      {line && (
        <motion.div
          key={drag!.kind}
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, left: line.x, top: line.y }}
          exit={{ opacity: 0 }}
          transition={{
            left: { duration: 0.08 },
            top: { duration: 0.08 },
            opacity: motionTokens.quick,
          }}
          style={
            line.vertical ? { width: 2, height: line.length } : { height: 2, width: line.length }
          }
          className="pointer-events-none absolute z-10 rounded-full bg-signal"
        />
      )}
    </AnimatePresence>
  );
}

function BoardGhost({ drag }: { readonly drag: DragState | null }) {
  return (
    <AnimatePresence>
      {drag && (
        <motion.div
          key="ghost"
          aria-hidden
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={motionTokens.quick}
          style={{ position: "fixed", left: drag.pointer.x + 14, top: drag.pointer.y + 14 }}
          className="pointer-events-none z-50 flex max-w-64 items-center gap-2 rounded-md border bg-popover px-2 py-1 text-ui shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]"
        >
          <span
            className={cn(
              "shrink-0 bg-signal",
              drag.kind === "column" ? "h-2.5 w-1 rounded-full" : "size-1.5 rounded-full",
            )}
          />
          <span className="truncate">{drag.label}</span>
          {!drag.target && (
            <span className="shrink-0 font-mono text-[10px] text-destructive">can't drop</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Pointer drag on the board. Mouse: press and move 4 px. Touch: hold 350 ms (a short buzz), then
 * move; holding without moving opens the action sheet instead. The drop is ONE core `drop` (one
 * undo step). The board and the page auto-scroll near their edges; Esc cancels.
 */
function useBoardDrag({
  board,
  columns,
  coarse,
  moveTo,
  select,
  openSheet,
}: {
  readonly board: OutlineItem;
  readonly columns: readonly BoardColumn[];
  readonly coarse: boolean;
  readonly moveTo: (ids: readonly string[], drop: BoardDrop, kind: "card" | "column") => boolean;
  readonly select: (id: string) => void;
  readonly openSheet: (id: string) => void;
}) {
  const { ol, ui } = useOutlinerContext();
  const [state, setState] = React.useState<DragState | null>(null);
  const latest = React.useRef({ board, columns, moveTo, select, openSheet, ol });
  latest.current = { board, columns, moveTo, select, openSheet, ol };
  const swallowClick = React.useRef(false);

  const start = React.useCallback(
    (event: React.PointerEvent, kind: "card" | "column", id: string, title: string) => {
      const { ol } = latest.current;
      if (event.button !== 0 || ol.readOnly || ol.isItemLocked(id)) return;
      if (
        (event.target as Element).closest(
          "button,a,textarea,input,[role=checkbox],[data-ol-editor]",
        )
      )
        return;
      const touch = event.pointerType !== "mouse";
      const pointerId = event.pointerId;
      const startX = event.clientX,
        startY = event.clientY;
      const selection = ol.state.selection;
      const ids =
        kind === "card" && selection.has(id) && selection.size > 1 ? [...selection] : [id];
      const label = ids.length > 1 ? `${ids.length} items` : title;
      let active = false;
      let moved = false;
      let timer: number | undefined;
      let frame = 0;
      let pointer = { x: startX, y: startY };
      let current: DragState | null = null;
      const surface = ui.listRef.current;
      const page = surface?.closest<HTMLElement>("[data-outliner-scroll]") ?? null;

      const measure = (x: number, y: number): DragState => {
        const { board, columns } = latest.current;
        const el = ui.listRef.current!;
        const box = el.getBoundingClientRect();
        const rtl = getComputedStyle(el).direction === "rtl";
        const local = (rx: number, ry: number) => ({
          x: rx - box.left + el.scrollLeft,
          y: ry - box.top + el.scrollTop,
        });
        const columnEls = [...el.querySelectorAll<HTMLElement>("[data-board-column]")];
        if (kind === "column") {
          const others = columnEls.filter((col) => col.dataset.boardColumn !== id);
          const before = others.find((col) => {
            const r = col.getBoundingClientRect();
            return rtl ? x > r.left + r.width / 2 : x < r.left + r.width / 2;
          });
          const target = columnDrop(board, id, before?.dataset.boardColumn ?? null);
          const ref = before ?? others.at(-1);
          let line: DragState["line"] = null;
          if (ref) {
            const r = ref.getBoundingClientRect();
            const edge = before ? (rtl ? r.right + 6 : r.left - 6) : rtl ? r.left - 6 : r.right + 6;
            const p = local(edge, r.top);
            line = { x: p.x - 1, y: p.y, length: Math.max(48, r.height), vertical: true };
          }
          return { kind, ids, label, pointer: { x, y }, target, line };
        }
        // Cards: the column under the pointer (nearest by x), then the gap by y.
        let column = columnEls[0];
        let best = Infinity;
        for (const col of columnEls) {
          const r = col.getBoundingClientRect();
          const distance = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
          if (distance < best) {
            best = distance;
            column = col;
          }
        }
        const columnId = column?.dataset.boardColumn;
        const node = columns.find((c) => c.node.id === columnId)?.node;
        if (!column || !node || ol.isItemLocked(node.id))
          return { kind, ids, label, pointer: { x, y }, target: null, line: null };
        const cards = [...column.querySelectorAll<HTMLElement>("[data-card]")].filter(
          (card) => !ids.includes(card.dataset.row!),
        );
        const before = cards.find((card) => {
          const r = card.getBoundingClientRect();
          return y < r.top + r.height / 2;
        });
        const target = cardDrop(board, ids, node.id, before?.dataset.row ?? null);
        const list = column
          .querySelector<HTMLElement>("[data-board-cards]")!
          .getBoundingClientRect();
        const anchorY = before
          ? before.getBoundingClientRect().top - 4
          : cards.length
            ? cards.at(-1)!.getBoundingClientRect().bottom + 3
            : list.top + 4;
        const p = local(list.left + 8, anchorY);
        return {
          kind,
          ids,
          label,
          pointer: { x, y },
          target,
          line: { x: p.x, y: p.y - 1, length: list.width - 16, vertical: false },
        };
      };
      const update = () => {
        current = measure(pointer.x, pointer.y);
        setState(current);
      };
      const tick = () => {
        if (!active) return;
        const el = ui.listRef.current;
        if (el) {
          const r = el.getBoundingClientRect();
          const edge = 48;
          const dx =
            pointer.x < r.left + edge
              ? -(r.left + edge - pointer.x)
              : pointer.x > r.right - edge
                ? pointer.x - (r.right - edge)
                : 0;
          if (dx) el.scrollLeft += Math.max(-20, Math.min(20, dx / 2.5));
        }
        if (page) {
          const r = page.getBoundingClientRect();
          const dy =
            pointer.y < r.top + 40
              ? -(r.top + 40 - pointer.y)
              : pointer.y > r.bottom - 40
                ? pointer.y - (r.bottom - 40)
                : 0;
          if (dy) page.scrollTop += Math.max(-18, Math.min(18, dy / 3));
        }
        update();
        frame = requestAnimationFrame(tick);
      };
      const activate = () => {
        active = true;
        ui.setEditing(false);
        (event.target as Element | null)?.releasePointerCapture?.(pointerId);
        navigator.vibrate?.(8);
        update();
        frame = requestAnimationFrame(tick);
      };
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        const distance = Math.hypot(move.clientX - startX, move.clientY - startY);
        if (!active) {
          if (touch) {
            // Moving before the hold completes is a scroll, not a drag.
            if (distance > 8) cleanup();
            return;
          }
          if (distance < 4) return;
          activate();
        }
        if (distance > 6) moved = true;
        move.preventDefault();
        pointer = { x: move.clientX, y: move.clientY };
      };
      // While a touch drag is live the page must not scroll under the finger.
      const onTouchMove = (touchEvent: TouchEvent) => {
        if (active) touchEvent.preventDefault();
      };
      const onUp = (up: PointerEvent) => {
        if (up.pointerId !== pointerId) return;
        const final = current;
        const wasActive = active;
        cleanup();
        if (!wasActive) return;
        swallowClick.current = true;
        setTimeout(() => (swallowClick.current = false), 0);
        if (touch && !moved) {
          // Held still: the action sheet (the phone's menu), not a drag.
          latest.current.openSheet(id);
          return;
        }
        if (final?.target && latest.current.moveTo(final.ids, final.target, kind))
          latest.current.select(id);
      };
      const onKey = (key: KeyboardEvent) => {
        if (key.key === "Escape" && active) {
          key.preventDefault();
          key.stopPropagation();
          cleanup();
        }
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        cancelAnimationFrame(frame);
        active = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("keydown", onKey, true);
        current = null;
        setState(null);
      };
      const onCancel = (cancel: PointerEvent) => cancel.pointerId === pointerId && cleanup();
      if (touch) timer = window.setTimeout(activate, 350);
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      window.addEventListener("touchmove", onTouchMove, { passive: false });
      window.addEventListener("keydown", onKey, true);
    },
    [ui],
  );
  /** True once for the click that ends a drag (so it doesn't also select or edit). */
  const consumeClick = React.useCallback(() => swallowClick.current, []);
  void coarse;
  return { state, start, consumeClick };
}
