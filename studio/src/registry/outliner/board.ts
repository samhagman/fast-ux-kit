import type { OutlineItem } from "./types";

/**
 * Board view: any item can be shown as a board (`data.view: "board"`). Its children are the
 * columns and its grandchildren the cards; deeper items belong to a card (open it to see them).
 * Nothing about the document changes shape: a board is a projection of the same tree, so every
 * board gesture is an ordinary core action (`drop`, `move`, `insert`, …) and one undo step.
 *
 *    Launch board            ┌ To do ──────┐ ┌ Doing ──────┐ ┌ Done ───────┐
 *      To do                 │ ▢ Draft FAQ │ │ ▢ Eval run  │ │ ☑ Kickoff   │
 *        Draft FAQ      ⇒    │ ▢ Pricing   │ │             │ │             │
 *        Pricing             │ + Add card  │ │ + Add card  │ │ + Add card  │
 *      Doing                 └─────────────┘ └─────────────┘ └─────────────┘
 *        Eval run
 *      Done
 *        Kickoff
 */
export const isBoard = (node: OutlineItem | null | undefined): boolean => node?.data?.view === "board";

export interface BoardColumn {
  readonly node: OutlineItem;
  readonly cards: readonly OutlineItem[];
}

/**
 * The columns and the cards they show. Hide completed drops done cards, except those still
 * lingering (target.ts): a card completed with Space stays until the cursor leaves it.
 */
export function boardColumns(board: OutlineItem, options: { readonly hideCompleted?: boolean; readonly linger?: ReadonlySet<string> } = {}): BoardColumn[] {
  const keep = (card: OutlineItem) => !isDone(card) || !!options.linger?.has(card.id);
  return (board.children ?? []).map((node) => ({
    node,
    cards: options.hideCompleted ? (node.children ?? []).filter(keep) : (node.children ?? []),
  }));
}

/** The board in reading order: each column's header, then its cards. */
export const boardOrder = (columns: readonly BoardColumn[]): string[] => columns.flatMap((column) => [column.node.id, ...column.cards.map((card) => card.id)]);

const isDone = (node: OutlineItem) => node.checked === true || node.data?.completed === true;

/** What a card shows under its title: how much is inside it, task progress, whether it has a note. */
export interface CardMeta {
  readonly descendants: number;
  readonly tasks: number;
  readonly done: number;
  readonly hasNote: boolean;
}
const metaCache = new WeakMap<OutlineItem, CardMeta>();
export function cardMeta(card: OutlineItem): CardMeta {
  const cached = metaCache.get(card);
  if (cached) return cached;
  let descendants = 0,
    tasks = 0,
    done = 0;
  const stack = [...(card.children ?? [])];
  while (stack.length) {
    const node = stack.pop()!;
    descendants++;
    if (node.checked !== undefined || node.data?.completed !== undefined) {
      tasks++;
      if (isDone(node)) done++;
    }
    if (node.children) stack.push(...node.children);
  }
  const meta = { descendants, tasks, done, hasNote: !!card.data?.note };
  metaCache.set(card, meta);
  return meta;
}

/** A core `drop` target: the parent and the index among its children AFTER the moving items leave. */
export interface BoardDrop {
  readonly parentId: string;
  readonly index: number;
}

/**
 * Where a card lands: in `columnId`, before `beforeId` (null: at the end). Indices count the
 * column's children without the cards being moved, which is what the core's `drop` expects.
 */
export function cardDrop(board: OutlineItem, moving: readonly string[], columnId: string, beforeId: string | null): BoardDrop | null {
  const column = board.children?.find((node) => node.id === columnId);
  if (!column || moving.includes(columnId)) return null;
  const staying = (column.children ?? []).filter((card) => !moving.includes(card.id));
  const at = beforeId === null ? -1 : staying.findIndex((card) => card.id === beforeId);
  return { parentId: column.id, index: at < 0 ? staying.length : at };
}

/** Where a column lands among the board's columns, before `beforeId` (null: last). */
export function columnDrop(board: OutlineItem, columnId: string, beforeId: string | null): BoardDrop | null {
  const columns = board.children ?? [];
  if (!columns.some((node) => node.id === columnId)) return null;
  const staying = columns.filter((node) => node.id !== columnId);
  const at = beforeId === null ? -1 : staying.findIndex((node) => node.id === beforeId);
  return { parentId: board.id, index: at < 0 ? staying.length : at };
}

/** Whether a drop would leave everything where it is (no history entry for a no-op). */
export function isNoopDrop(board: OutlineItem, ids: readonly string[], drop: BoardDrop): boolean {
  if (ids.length !== 1) return false;
  const parent = drop.parentId === board.id ? board : board.children?.find((node) => node.id === drop.parentId);
  const siblings = parent?.children ?? [];
  const from = siblings.findIndex((node) => node.id === ids[0]);
  return from >= 0 && from === drop.index;
}

/** Board cursor: a column header (card = -1) or a card. */
export interface BoardCursor {
  readonly column: number;
  readonly card: number;
}

/** Locate an id on the board (a column or a card); null when it is not shown there. */
export function locateOnBoard(columns: readonly BoardColumn[], id: string | null | undefined): BoardCursor | null {
  if (!id) return null;
  for (let column = 0; column < columns.length; column++) {
    if (columns[column]!.node.id === id) return { column, card: -1 };
    const card = columns[column]!.cards.findIndex((node) => node.id === id);
    if (card >= 0) return { column, card };
  }
  return null;
}

export type BoardStep = "up" | "down" | "left" | "right" | "home" | "end";

/**
 * Arrow-key travel. Up/down walk a column (the header is above the first card); left/right go to
 * the neighbouring column at the same position (clamped; an empty column lands on its header).
 * `left`/`right` are visual: the caller swaps them in right-to-left layouts.
 */
export function stepBoard(columns: readonly BoardColumn[], from: BoardCursor | null, step: BoardStep): BoardCursor | null {
  if (!columns.length) return null;
  if (!from) return { column: 0, card: columns[0]!.cards.length ? 0 : -1 };
  const { column, card } = from;
  const cards = columns[column]?.cards.length ?? 0;
  switch (step) {
    case "up":
      return { column, card: Math.max(-1, card - 1) };
    case "down":
      return { column, card: Math.min(cards - 1, card + 1) };
    case "home":
      return { column, card: cards ? 0 : -1 };
    case "end":
      return { column, card: cards - 1 };
    case "left":
    case "right": {
      const next = column + (step === "left" ? -1 : 1);
      if (next < 0 || next >= columns.length) return from;
      const length = columns[next]!.cards.length;
      return { column: next, card: card < 0 ? -1 : Math.min(card, length - 1) };
    }
  }
}

export const idAt = (columns: readonly BoardColumn[], cursor: BoardCursor | null): string | null =>
  !cursor ? null : cursor.card < 0 ? (columns[cursor.column]?.node.id ?? null) : (columns[cursor.column]?.cards[cursor.card]?.id ?? null);
