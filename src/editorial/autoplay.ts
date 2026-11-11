"use client";

import * as React from "react";

export interface AutoplayOptions {
  /** How many steps there are. */
  readonly count: number;
  /** Milliseconds each step is held. */
  readonly interval?: number;
  /** Start playing once the element is on screen. Reduced motion always starts paused. */
  readonly autoStart?: boolean;
  /** Stop at the last step instead of wrapping to the first. */
  readonly once?: boolean;
}
export interface Autoplay<T extends Element> {
  /** Attach to the element whose visibility gates playback. */
  readonly ref: React.RefObject<T | null>;
  readonly index: number;
  readonly playing: boolean;
  /** True after hydration: before it, render the static reading. */
  readonly ready: boolean;
  readonly toggle: () => void;
  /** Jump to a step. A reader who picks a step has taken over, so playback pauses. */
  readonly select: (index: number) => void;
}

/**
 * Subtle automatic motion a reader can pause. Steps advance on their own while the element is on
 * screen, never under reduced motion, and never before hydration (the server reading is step 0).
 */
export function useAutoplay<T extends Element = HTMLElement>({
  count,
  interval = 2600,
  autoStart = true,
  once = false,
}: AutoplayOptions): Autoplay<T> {
  const ref = React.useRef<T | null>(null);
  const [index, setIndex] = React.useState(0);
  const [wanted, setWanted] = React.useState(false);
  const [visible, setVisible] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    setReady(true);
    const calm = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    setWanted(autoStart && !calm);
  }, [autoStart]);

  React.useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries.some((entry) => entry.isIntersecting)),
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const playing = wanted && visible && count > 1;
  React.useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setIndex((current) => {
        if (current + 1 < count) return current + 1;
        if (once) {
          setWanted(false);
          return current;
        }
        return 0;
      });
    }, interval);
    return () => window.clearInterval(timer);
  }, [playing, count, interval, once]);

  const toggle = React.useCallback(() => setWanted((value) => !value), []);
  const select = React.useCallback(
    (next: number) => {
      setWanted(false);
      setIndex(Math.max(0, Math.min(count - 1, next)));
    },
    [count],
  );
  return { ref, index: Math.min(index, Math.max(0, count - 1)), playing, ready, toggle, select };
}
