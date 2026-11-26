import * as React from "react";

/** `""` at rest, then the result of the last copy until the confirmation times out. */
export type CopyStatus = "" | "copied" | "failed";

export interface UseCopyOptions {
  /** How long the result stays, in milliseconds. */
  readonly resetDelay?: number;
  readonly onError?: (error: Error) => void;
}

const subscribe = () => () => {};

/**
 * Writes text to the system clipboard and holds the outcome long enough for a control to confirm
 * it. React-only, so the editorial entry can share it with the app components.
 *
 * `ready` is false in server markup and during hydration, and true once the page can copy. A
 * control that renders on the server can stay inert until then.
 */
export function useCopy({ resetDelay = 2000, onError }: UseCopyOptions = {}) {
  const [status, setStatus] = React.useState<CopyStatus>("");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(timer.current);
    };
  }, []);
  const ready = React.useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  /**
   * Copies `text`. When the browser refuses, `fallback` (the element that shows the text) is
   * selected instead, so the reader can still copy it by hand.
   */
  const copy = async (text: string, fallback?: Element | null): Promise<boolean> => {
    clearTimeout(timer.current);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch (error) {
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
    if (!mounted.current) return copied;
    if (!copied && fallback) {
      const range = document.createRange();
      range.selectNodeContents(fallback);
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    setStatus(copied ? "copied" : "failed");
    timer.current = setTimeout(() => setStatus(""), resetDelay);
    return copied;
  };
  return { status, copy, ready };
}
