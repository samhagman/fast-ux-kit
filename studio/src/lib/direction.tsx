import * as React from "react";
import { Direction } from "radix-ui";

export type Dir = "ltr" | "rtl";

/**
 * The writing direction a component actually renders in: the explicit `dir` prop when given,
 * otherwise the computed direction of its root (inherited from any ancestor `dir`). Watches
 * ancestor `dir` attributes so a host flipping direction at runtime is followed.
 */
export function useResolvedDirection(ref: React.RefObject<HTMLElement | null>, dir?: Dir): Dir {
  const [resolved, setResolved] = React.useState<Dir>(dir ?? "ltr");
  React.useLayoutEffect(() => {
    if (dir) return setResolved(dir);
    const el = ref.current;
    if (!el) return;
    const read = () => setResolved(getComputedStyle(el).direction === "rtl" ? "rtl" : "ltr");
    read();
    const observer = new MutationObserver(read);
    for (let node: HTMLElement | null = el; node; node = node.parentElement)
      observer.observe(node, { attributes: true, attributeFilter: ["dir"] });
    return () => observer.disconnect();
  }, [ref, dir]);
  return resolved;
}

/**
 * Radix primitives (tabs, menus, scroll areas, popovers) default to LTR and stamp `dir="ltr"`
 * on their roots and portals unless a provider says otherwise. Every registry component wraps
 * its tree in this so overlays and panels mirror with the page.
 */
export function DirectionScope({ dir, children }: { readonly dir: Dir; readonly children: React.ReactNode }) {
  return (
    <ScopedDirection.Provider value={dir}>
      <Direction.Provider dir={dir}>{children}</Direction.Provider>
    </ScopedDirection.Provider>
  );
}

const ScopedDirection = React.createContext<Dir | undefined>(undefined);

/**
 * The enclosing `DirectionScope`'s direction, or undefined outside one. Portalled overlays
 * (dialogs, popovers) render under <body>, so they stamp this on their content to keep a
 * component's RTL; outside a scope they stamp nothing and inherit the page's `dir`.
 */
export function useScopedDirection(): Dir | undefined {
  return React.useContext(ScopedDirection);
}
