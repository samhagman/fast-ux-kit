import type { OutlineEditor } from "./controlled-outline.js";
import type { OutlineItem } from "./types.js";

/** UTF-16 source offsets, not rendered rich-text positions. Never persisted by the library. */
export interface OutlineFieldEvent {
  readonly kind: "selection" | "composition-start" | "composition-end";
  readonly itemId: string;
  readonly field: "title" | "note";
  readonly anchor: number;
  readonly head: number;
  readonly text: string;
}
/** Trusted, provider-neutral binding. The host owns CRDT state, transport and persistence. */
export interface OutlineCollaboration {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undo: () => void;
  readonly redo: () => void;
  /** Pure: map the old caret through a remote transaction. Null clears it. */
  readonly mapCaret?: (
    caret: OutlineEditor["caret"],
    before: readonly OutlineItem[],
    incoming: readonly OutlineItem[],
  ) => OutlineEditor["caret"];
  /** Buffer incoming document publication while composing; publish after composition-end. */
  readonly onFieldEvent?: (event: OutlineFieldEvent) => void;
}
