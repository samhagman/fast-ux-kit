/**
 * Touch swipe on a row, two stages each way. "Forward" is toward the inline end (right in LTR,
 * left in RTL), the way an indent moves the row:
 *
 *   ← back                                   forward →
 *   outdent ◀── delete ◀──── │ ────▶ complete ──▶ indent
 *          −80    −36        0        36       80     (row offset, px)
 *
 * The row trails the finger at half speed (elastic), so these are the row's own offsets: a
 * finger travels ~72 px to complete or delete and ~160 px to indent or outdent.
 */
export type SwipeIntent = "complete" | "delete" | "indent" | "outdent";

export const SWIPE_COMMIT = 36;
export const SWIPE_LONG = 80;

export function swipeIntent(offset: number, rtl: boolean): SwipeIntent | null {
  const forward = rtl ? -offset : offset;
  if (forward >= SWIPE_LONG) return "indent";
  if (forward >= SWIPE_COMMIT) return "complete";
  if (forward <= -SWIPE_LONG) return "outdent";
  if (forward <= -SWIPE_COMMIT) return "delete";
  return null;
}
