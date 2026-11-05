/**
 * Focus moved by a component itself, shared by Machine View and Machine Tree.
 *
 *  - `createFocusHandoff()` marks the focus call as the component's own: handlers read
 *    `handoff.active` to tell it from a user's Tab or arrow key, so a hand-off never starts a
 *    dry-run preview or opens a tooltip. Create one per component instance.
 *  - `focusNextFrame(el)` focuses after the current render settles (the control that had focus
 *    has just unmounted), only if the target is still in the document, never scrolling.
 */
export interface FocusHandoff {
  readonly active: boolean;
  readonly focus: (el: HTMLElement | null | undefined) => void;
}

export function createFocusHandoff(): FocusHandoff {
  let active = false;
  return {
    get active() {
      return active;
    },
    focus(el) {
      if (!el) return;
      active = true;
      try {
        el.focus({ preventScroll: true });
      } finally {
        active = false;
      }
    },
  };
}

/**
 * Focus `target` (an element, or a function that finds it then) on the next frame, if it is
 * still connected. Pass a `handoff` to mark the move as the component's own. Returns a cancel.
 */
export function focusNextFrame(
  target: HTMLElement | null | undefined | (() => HTMLElement | null | undefined),
  handoff?: FocusHandoff,
): () => void {
  if (typeof requestAnimationFrame === "undefined") return () => {};
  const frame = requestAnimationFrame(() => {
    const el = typeof target === "function" ? target() : target;
    if (!el?.isConnected) return;
    if (handoff) handoff.focus(el);
    else el.focus({ preventScroll: true });
  });
  return () => cancelAnimationFrame(frame);
}
