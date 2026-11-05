export interface OutlineKeyEvent {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly altKey?: boolean;
  readonly shiftKey?: boolean;
  readonly isComposing?: boolean;
}
export type OutlineKeyIntent =
  | "split"
  | "line-break"
  | "indent"
  | "outdent"
  | "move-up"
  | "move-down"
  | "undo"
  | "redo"
  | "task"
  | "completion"
  | "hover"
  | "row-mode"
  | "edit-mode"
  | "delete-selection"
  | "select-all"
  | "up"
  | "down"
  | "left"
  | "right"
  | "merge-backward"
  | "merge-forward"
  | "exit";
/** Platform-neutral shortcut intent. The input surface decides boundary-sensitive operations. */
export function resolveOutlineKey(
  event: OutlineKeyEvent,
  mode: "text" | "row",
): OutlineKeyIntent | null {
  if (event.isComposing) return null;
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();
  if (mod && !event.altKey && key === "z") return event.shiftKey ? "redo" : "undo";
  if (event.ctrlKey && !event.metaKey && key === "y") return "redo";
  if (mod && key === "enter") return "task";
  if (event.ctrlKey && key === " ") return "completion";
  if (event.altKey && key === "f1") return "hover";
  if (
    (event.altKey && event.shiftKey && key === "arrowup") ||
    (mod && event.shiftKey && key === "arrowup")
  )
    return "move-up";
  if (
    (event.altKey && event.shiftKey && key === "arrowdown") ||
    (mod && event.shiftKey && key === "arrowdown")
  )
    return "move-down";
  if (mod && key === "]") return "indent";
  if (mod && key === "[") return "outdent";
  if (key === "tab" && !mod && !event.altKey) return event.shiftKey ? "outdent" : "indent";
  if (mode === "row") {
    if (mod && key === "a") return "select-all";
    if (key === "enter") return "edit-mode";
    if (key === "escape") return "exit";
    if (key === " ") return "task";
    if (key === "backspace" || key === "delete") return "delete-selection";
    if (key === "arrowup") return "up";
    if (key === "arrowdown") return "down";
    if (key === "arrowleft") return "left";
    if (key === "arrowright") return "right";
  } else {
    if (key === "enter") return event.shiftKey ? "line-break" : "split";
    if (key === "escape") return "row-mode";
    if (!mod && !event.altKey && key === "backspace") return "merge-backward";
    if (!mod && !event.altKey && key === "delete") return "merge-forward";
    if (!mod && !event.altKey && key === "arrowup") return "up";
    if (!mod && !event.altKey && key === "arrowdown") return "down";
  }
  return null;
}
