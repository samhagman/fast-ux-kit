import * as React from "react";

/**
 * Platform-dependent shortcut labels, shared by every registry component.
 *
 * SSR-stable: nothing reads `navigator` at module load or during the server render. The server
 * (and the hydration pass) render the neutral "Ctrl" labels; an Apple client switches to "⌘"
 * right after hydrating, never mid-markup, so there is no hydration mismatch.
 *
 *   const MOD = useModKey();                 // "⌘" | "Ctrl"
 *   const label = useShortcutLabel();
 *   label("mod", "shift", "Z");              // "⇧⌘Z" on Apple, "Ctrl Shift Z" elsewhere
 */

export type ModKey = "⌘" | "Ctrl";
export type ShortcutPart = "mod" | "shift" | "alt" | (string & {});

/** True on macOS / iOS / iPadOS. Pure: pass the navigator (or a stand-in in tests). */
export function isApplePlatform(nav: { readonly platform?: string; readonly userAgent?: string } | undefined): boolean {
  return !!nav && /Mac|iPhone|iPad/i.test(nav.platform || nav.userAgent || "");
}

/**
 * A shortcut as the platform writes it. Apple: modifier glyphs in ⌃⌥⇧⌘ order, no spaces
 * ("⇧⌘Z", "⌘↵"). Elsewhere: words joined by spaces ("Ctrl Shift Z", "Ctrl ↵").
 */
export function formatShortcut(apple: boolean, ...parts: readonly ShortcutPart[]): string {
  const has = (p: ShortcutPart) => parts.includes(p);
  const keys = parts.filter((p) => p !== "mod" && p !== "shift" && p !== "alt");
  if (apple) return `${has("alt") ? "⌥" : ""}${has("shift") ? "⇧" : ""}${has("mod") ? "⌘" : ""}${keys.join("")}`;
  return [has("mod") ? "Ctrl" : "", has("shift") ? "Shift" : "", has("alt") ? "Alt" : "", ...keys].filter(Boolean).join(" ");
}

const noSubscribe = () => () => {};
/** Whether this client is an Apple platform. `false` on the server and during hydration. */
export function useApplePlatform(): boolean {
  return React.useSyncExternalStore(
    noSubscribe,
    () => isApplePlatform(navigator),
    () => false,
  );
}

/** The platform's shortcut modifier label: "⌘" on Apple, "Ctrl" elsewhere (and on the server). */
export function useModKey(): ModKey {
  return useApplePlatform() ? "⌘" : "Ctrl";
}

/** `formatShortcut` bound to this client's platform. */
export function useShortcutLabel(): (...parts: readonly ShortcutPart[]) => string {
  const apple = useApplePlatform();
  return React.useCallback((...parts: readonly ShortcutPart[]) => formatShortcut(apple, ...parts), [apple]);
}
