import type { ToastClassnames } from "../components/ui/sonner.js";

/**
 * A toast's × inside its own card, at the inline end (sonner's default hangs it off the top-start
 * corner, outside the card). `top`: a multi-line toast (its icon aligns with the title too);
 * `center`: a one-line toast, the × beside its action. Direction-aware through sonner's own
 * position variables, so right-to-left mirrors it (`auto`, never `unset`: a custom property
 * inherits, so `unset` would bring back the toaster's 0).
 */
export function insideClose(align: "top" | "center"): ToastClassnames {
  const position =
    "[--toast-close-button-start:auto] [--toast-close-button-end:0.5rem] [--toast-close-button-transform:none] rtl:[--toast-close-button-start:0.5rem] rtl:[--toast-close-button-end:auto]";
  return {
    // A one-line toast keeps its action clear of the ×; a multi-line one only its title (the
    // body below runs full width under it).
    toast: align === "center" ? `${position} pe-11!` : position,
    closeButton: [
      "size-7! rounded-md! border-0! bg-transparent! text-muted-foreground transition-colors hover:bg-muted! hover:text-foreground coarse:size-11!",
      align === "top" ? "top-2!" : "top-1/2! -translate-y-1/2!",
    ].join(" "),
    ...(align === "top" ? { title: "pe-8", icon: "self-start mt-0.5" } : {}),
  };
}

/**
 * A toast about the rows you just changed must not cover them. Once the toast has laid out,
 * the row is scrolled (inside its own scroller) just clear of the front toast's resting box,
 * when the two overlap or the row sits below the visible list. Sonner anchors a bottom toast to its toaster's bottom edge, so the
 * resting box is that edge minus the toast's own height (its enter transform aside).
 */
export function keepClearOfToasts(row: HTMLElement | null | undefined, gap = 8) {
  const scroller = row?.closest<HTMLElement>("[data-outliner-scroll]");
  const toaster = document.querySelector<HTMLElement>(
    "[data-sonner-toaster][data-y-position=bottom]",
  );
  const front = toaster?.querySelector<HTMLElement>("[data-sonner-toast][data-front=true]");
  if (!row || !scroller || !toaster || !front) return;
  const box = row.getBoundingClientRect();
  const lane = toaster.getBoundingClientRect();
  const top = lane.bottom - front.offsetHeight - gap;
  const across = box.right > lane.left && box.left < lane.right;
  // Under the toast, or already scrolled out below the visible list (a drop after an auto-scroll).
  const hidden = box.bottom > scroller.getBoundingClientRect().bottom;
  if (box.bottom <= top || !(across || hidden)) return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  scroller.scrollBy({ top: box.bottom - top, behavior: reduce ? "auto" : "smooth" });
}
