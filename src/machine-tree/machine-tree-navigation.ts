/**
 * Navigation concern of the Machine Tree controller: selection, folds, find, focus (roving stop,
 * reveal, the focus hand-off) and the WAI tree keyboard.
 */
import * as React from "react";
import {
  machineTreeAncestors,
  projectMachineTree,
  type MachineTreeVisibleRow,
} from "../core/index.js";
import type { MachineTreeProps } from "./machine-tree.js";
import type { TreeBase } from "./machine-tree-controller.js";
import type { LayoutCtx } from "./machine-tree-layout.js";
import { TABBABLE, TYPEAHEAD_MS, isFoldable } from "./machine-tree-logic.js";
import { useControllable, useEvent } from "./machine-tree-store.js";
import { focusNextFrame } from "../machine-shared/machine-focus.js";

export interface NavigationCtx {
  readonly focused: string | null;
  readonly focusContainer: (id: string | null) => void;
  /* selection */
  readonly selected: string | null;
  readonly select: (id: string | null) => void;
  /** Unfold ancestors, bypass a hiding search, select, focus and flash a row. `from` offers "Back to". */
  readonly reveal: (id: string, from?: string) => void;
  /** From the panel: on a phone the sheet drops to its peek first so the target is visible. */
  readonly revealFromPanel: (id: string) => void;
  readonly follow: (id: string) => void;
  readonly back: { readonly id: string; readonly label: string } | null;
  readonly setBack: (back: { readonly id: string; readonly label: string } | null) => void;
  /* folds + projection */
  readonly collapsed: ReadonlySet<string>;
  readonly setCollapsed: (
    ids: ReadonlySet<string> | ((ids: ReadonlySet<string>) => ReadonlySet<string>),
  ) => void;
  readonly toggle: (id: string) => void;
  readonly collapseAll: () => void;
  readonly expandAll: () => void;
  readonly projected: ReadonlyMap<string, MachineTreeVisibleRow>;
  readonly visible: ReadonlyMap<string, MachineTreeVisibleRow>;
  readonly order: readonly string[];
  /* find */
  readonly query: string;
  readonly setQuery: (query: string) => void;
  readonly deferredQuery: string;
  readonly searching: boolean;
  readonly findVisible: boolean;
  /** The user's last interaction was inside this tree, so ⌘F / ⌘K are captured. */
  readonly findLive: boolean;
  readonly openSearch: () => void;
  readonly closeSearch: (focus: boolean) => void;
  readonly goMatch: (delta: number) => void;
  readonly matchIds: readonly string[];
  readonly matchPosition: number;
  readonly currentMatch: string | undefined;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly countId: string;
  readonly helpId: string;
  /* focus */
  readonly focusRow: (id: string) => void;
  /** Focus (and select) `id` as a hand-off: no preview, no tooltip, scrolled into view. */
  readonly handOffTo: (id: string) => void;
  readonly restoreFocus: () => void;
  readonly noteFocus: (el: HTMLElement) => void;
  /**
   * Call before a state change that is likely to unmount the focused control (Simulate → Restart,
   * Stop). Blurs it while styles are clean, so the commit never removes a focused element (in
   * Chrome that forces a synchronous style + layout pass mid-commit: ~100 ms on the large example).
   * The focus hand-off then puts focus back on the same control, or on its zone's replacement.
   */
  readonly parkFocus: () => void;
  readonly setFocusId: (id: string) => void;
  readonly setPeek: (id: string | null) => void;
  readonly onTreeKeyDown: (event: React.KeyboardEvent) => void;
}

export const NavigationContext = React.createContext<NavigationCtx | null>(null);
export function useTreeNavigation(): NavigationCtx {
  const ctx = React.useContext(NavigationContext);
  if (!ctx) throw new Error("Machine Tree parts must be rendered inside <MachineTreeRoot>");
  return ctx;
}

export function useNavigationController(
  props: Pick<
    MachineTreeProps,
    | "selectedId"
    | "defaultSelectedId"
    | "onSelectedChange"
    | "collapsedIds"
    | "defaultCollapsedIds"
    | "onCollapsedChange"
    | "query"
    | "defaultQuery"
    | "onQueryChange"
    | "captureFindShortcut"
    | "focusedRowId"
    | "defaultFocusedRowId"
    | "onFocusedRowChange"
  >,
  base: TreeBase,
  layout: LayoutCtx,
  /** Late-bound to the simulation concern: Enter / click on a row (send while simulating, else select). */
  activate: (id: string) => void,
): NavigationCtx {
  const { topology, model, rows, links, store, elements, handoff, announce, sim } = base;
  const {
    isPhone,
    panel,
    snap,
    setSnap,
    setPanelTab,
    sheetInset,
    setGotoOpen,
    rootRef,
    dir,
    toast,
  } = layout;
  const captureFindShortcut = props.captureFindShortcut ?? true;

  const [selected, setSelectedRaw] = useControllable<string | null>(
    props.selectedId,
    () => props.defaultSelectedId ?? null,
    (id) => props.onSelectedChange?.(id, id ? rows.get(id) : undefined),
  );
  const [collapsed, setCollapsed] = useControllable<ReadonlySet<string>>(
    props.collapsedIds,
    () => new Set(props.defaultCollapsedIds ?? []),
    props.onCollapsedChange,
  );
  const [query, setQuery] = useControllable<string>(
    props.query,
    () => props.defaultQuery ?? "",
    props.onQueryChange,
  );
  const [focusedValue, setFocused] = useControllable<string | null>(
    props.focusedRowId,
    () => props.defaultFocusedRowId ?? null,
    props.onFocusedRowChange,
  );
  const focusRowValue = focusedValue ? rows.get(focusedValue) : undefined;
  const focused =
    focusRowValue &&
    (focusRowValue.kind === "machine" ||
      focusRowValue.childIds.some((id) => rows.get(id)?.kind === "node"))
      ? focusedValue
      : null;
  const focusContainer = useEvent((id: string | null) => {
    const row = id ? rows.get(id) : undefined;
    if (
      id &&
      (!row ||
        !(row.kind === "machine" || row.childIds.some((child) => rows.get(child)?.kind === "node")))
    )
      return;
    setFocused(id);
  });
  const deferredQuery = React.useDeferredValue(query);
  const searching = deferredQuery.trim().length > 0;
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [matchIndex, setMatchIndex] = React.useState(0);
  const [spotlight, setSpotlight] = React.useState<string | null>(null);
  const [back, setBack] = React.useState<{ id: string; label: string } | null>(null);
  const [findLive, setFindLive] = React.useState(false);
  const countId = React.useId();
  const helpId = React.useId();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const pendingFocus = React.useRef<{ id: string; delay: number } | null>(null);
  const flashTimer = React.useRef<number | undefined>(undefined);
  const revealTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(
    () => () => {
      window.clearTimeout(flashTimer.current);
      window.clearTimeout(revealTimer.current);
    },
    [],
  );

  const select = useEvent((id: string | null) => {
    setSelectedRaw(id);
    if (id && !sim.snapshot) setPanelTab((tab) => (tab === "simulation" ? "details" : tab));
  });

  /* — projection: search reveals matches + ancestor context without touching folds — */
  const projection = React.useMemo(
    () =>
      projectMachineTree(model, { query: deferredQuery, showNotes: false, maxVisibleRows: 50_000 }),
    [model, deferredQuery],
  );
  const { projected, visible, order } = React.useMemo(() => {
    const projected = new Map(projection.rows.map((row) => [row.id, row]));
    const visible = new Map<string, MachineTreeVisibleRow>();
    const order: string[] = [];
    const hidden = new Set<string>();
    const focusedIds = new Set<string>();
    if (focused && !searching) {
      const visit = (id: string) => {
        if (focusedIds.has(id)) return;
        focusedIds.add(id);
        for (const child of rows.get(id)?.childIds ?? []) visit(child);
      };
      visit(focused);
    }
    for (const row of projection.rows) {
      if (focused && !searching && !focusedIds.has(row.id)) continue;
      const parent = row.parentId ? projected.get(row.parentId) : undefined;
      // A folded compound hides its states but keeps its own outgoing routes; a folded machine hides everything.
      const folded =
        !searching &&
        row.id !== focused &&
        parent &&
        parent.id !== focused &&
        collapsed.has(parent.id) &&
        (row.kind === "node" || parent.kind === "machine");
      if ((row.parentId && hidden.has(row.parentId)) || folded) {
        hidden.add(row.id);
        continue;
      }
      visible.set(
        row.id,
        focused && !searching
          ? {
              ...row,
              level: row.level - (projected.get(focused)?.level ?? 1) + 1,
              ...(row.id === focused ? { posInSet: 1, setSize: 1 } : {}),
            }
          : row,
      );
      order.push(row.id);
    }
    return { projected, visible, order };
  }, [projection, collapsed, searching, focused, rows]);

  const matchIds = React.useMemo(
    () => (searching ? order.filter((id) => visible.get(id)!.match) : []),
    [order, visible, searching],
  );
  const matchPosition = matchIds.length ? Math.min(matchIndex, matchIds.length - 1) : -1;
  const currentMatch = matchPosition >= 0 ? matchIds[matchPosition] : undefined;
  React.useEffect(() => {
    setMatchIndex(0);
    setSpotlight(null);
  }, [deferredQuery]);
  // A controlled, non-empty query keeps the field visible.
  const findVisible = searchOpen || query.length > 0;

  /* — publish hot state to the row store (before paint) — */
  React.useLayoutEffect(() => {
    store.set({ selected, match: currentMatch ?? null, spotlight });
  }, [store, selected, currentMatch, spotlight]);
  // A fold that hides the focused or selected row hands both to the nearest visible ancestor (the
  // collapsed container): focus never falls to <body>, and Details / the breadcrumb never go stale.
  // Rows hidden by search are left alone (that is a filter, not a fold).
  React.useLayoutEffect(() => {
    const nearestVisible = (id: string) =>
      [...machineTreeAncestors(topology, id)].reverse().find((ancestor) => visible.has(ancestor));
    const focus = store.get().focus;
    if (focus && !visible.has(focus)) {
      const to = projected.has(focus) ? nearestVisible(focus) : undefined;
      const hadFocus = !!elements.get(focus)?.contains(window.document.activeElement);
      store.set({ focus: to ?? null });
      if (to && hadFocus) handoff.focus(elements.get(to));
    }
    if (
      selected &&
      projected.has(selected) &&
      !visible.has(selected) &&
      (!focused || machineTreeAncestors(topology, selected).includes(focused))
    ) {
      const to = nearestVisible(selected);
      if (to) setSelectedRaw(to);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, visible]);

  const faceOf = (id: string) => {
    const el = elements.get(id);
    return (el?.querySelector<HTMLElement>(":scope > [data-mt-face]") ?? el) || undefined;
  };
  const scrollToRow = (
    id: string,
    behavior: ScrollBehavior = "auto",
    block: ScrollLogicalPosition = "nearest",
  ) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    faceOf(id)?.scrollIntoView({ block, inline: "nearest", behavior: reduce ? "auto" : behavior });
  };
  const setFocusId = React.useCallback((id: string) => store.set({ focus: id }), [store]);
  const setPeek = React.useCallback((id: string | null) => store.set({ peek: id }), [store]);
  const focusRow = useEvent((id: string) => {
    store.set({ focus: id });
    elements.get(id)?.focus({ preventScroll: true });
    scrollToRow(id);
  });
  const handOffTo = useEvent((id: string) => {
    store.set({ focus: id });
    setSelectedRaw(id);
    handoff.focus(elements.get(id));
    scrollToRow(id, "smooth", "nearest");
  });
  // Deferred focus after reveal: the element may only exist after this render.
  React.useEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    const el = elements.get(pending.id);
    if (!el) return;
    pendingFocus.current = null;
    el.focus({ preventScroll: true });
    const timer = window.setTimeout(
      () => scrollToRow(pending.id, "smooth", "center"),
      pending.delay,
    );
    return () => window.clearTimeout(timer);
  });

  const toggle = React.useCallback(
    (id: string) => {
      if (id === focused) {
        setFocused(null);
        return;
      }
      setCollapsed((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [setCollapsed, focused, setFocused],
  );

  const reveal = useEvent((id: string, from?: string) => {
    const target = rows.get(id);
    if (!target) return;
    if (focused && id !== focused && !machineTreeAncestors(topology, id).includes(focused)) {
      setFocused(null);
      if (props.focusedRowId !== undefined && props.focusedRowId !== null && !searching) {
        announce("Return to the full hierarchy to reveal this item");
        return;
      }
    }
    const ancestors = machineTreeAncestors(topology, id);
    const wasFolded = ancestors.some((ancestor) => collapsed.has(ancestor));
    if (wasFolded)
      setCollapsed((current) => {
        const next = new Set(current);
        for (const ancestor of ancestors) next.delete(ancestor);
        return next;
      });
    if (searching && !projected.has(id)) {
      setQuery("");
      setSearchOpen(false);
      toast.show("mt-search", `Cleared search to show ${target.label}`);
    } else if (searching) setSpotlight(id);
    setSelectedRaw(id);
    store.set({ focus: id, flash: id });
    pendingFocus.current = { id, delay: wasFolded ? 240 : 0 };
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(
      () => store.get().flash === id && store.set({ flash: null }),
      1100,
    );
    const fromRow = from ? rows.get(from) : undefined;
    setBack(
      fromRow
        ? {
            id: fromRow.id,
            label:
              fromRow.kind === "transition"
                ? (rows.get(fromRow.parentId ?? "")?.label ?? fromRow.label)
                : fromRow.label,
          }
        : null,
    );
    announce(`Moved to ${target.label}${target.kind === "machine" ? " machine" : ""}`);
  });
  const revealFromPanel = useEvent((id: string) => {
    if (!isPhone || !panel || snap === "peek") return reveal(id);
    setSnap("peek");
    window.clearTimeout(revealTimer.current);
    revealTimer.current = window.setTimeout(() => reveal(id), 180);
  });
  const follow = useEvent((id: string) => {
    const target = links.get(id);
    if (target) reveal(target, id);
    else announce("Target is unavailable");
  });

  /** Where focus goes when the sheet or a dialog closes under it: the tree's roving stop. */
  const restoreFocus = useEvent(() => {
    const stop = store.get().focus ?? order[0];
    if (stop) focusNextFrame(() => elements.get(stop), handoff);
  });

  /**
   * Focus hand-off. Every focus inside the component records the element and its `[data-mt-zone]`
   * ancestors. When a render removes the focused control (a "Try with" card that flips, a SEND chip
   * that is no longer enabled, Simulate turning into Restart), focus goes to the zone's preferred
   * control (`[data-mt-prefer]`), else the zone itself (if focusable), else its first tabbable
   * control, else the tree's roving stop. Never <body>.
   */
  const lastFocus = React.useRef<{ el: HTMLElement; zones: HTMLElement[] } | null>(null);
  const parked = React.useRef(false);
  const parkFocus = React.useCallback(() => {
    const active = window.document.activeElement as HTMLElement | null;
    if (
      !active ||
      active === window.document.body ||
      !(rootRef.current?.contains(active) || active.closest("[data-mt-portal]"))
    )
      return;
    parked.current = true;
    active.blur();
  }, [rootRef]);
  const noteFocus = React.useCallback((el: HTMLElement) => {
    const zones: HTMLElement[] = [];
    for (
      let zone = el.closest<HTMLElement>("[data-mt-zone]");
      zone;
      zone = zone.parentElement?.closest<HTMLElement>("[data-mt-zone]") ?? null
    )
      zones.push(zone);
    lastFocus.current = { el, zones };
  }, []);
  React.useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const last = lastFocus.current;
      const active = window.document.activeElement;
      const wasParked = parked.current;
      parked.current = false;
      if (!last || (active && active !== window.document.body)) return;
      // A parked control that survived the change gets focus straight back.
      if (last.el.isConnected) return void (wasParked && handoff.focus(last.el));
      for (const zone of last.zones) {
        if (!zone.isConnected) continue;
        const next =
          zone.querySelector<HTMLElement>(`:is(${TABBABLE})[data-mt-prefer]`) ??
          (zone.hasAttribute("tabindex") ? zone : zone.querySelector<HTMLElement>(TABBABLE));
        if (next) return handoff.focus(next);
      }
      const stop = store.get().focus ?? order[0];
      if (stop) handoff.focus(elements.get(stop));
    });
    return () => cancelAnimationFrame(frame);
  });

  // Phone: whenever the sheet opens or changes height, keep the selected row clear of it.
  React.useEffect(() => {
    if (!sheetInset || !selected) return;
    const timer = window.setTimeout(() => scrollToRow(selected, "smooth", "nearest"), 60);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheetInset]);

  /* — search — */
  const openSearch = useEvent(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  });
  const goMatch = useEvent((delta: number) => {
    if (!matchIds.length) return;
    const next = (Math.max(0, matchPosition) + delta + matchIds.length) % matchIds.length;
    setMatchIndex(next);
    store.set({ focus: matchIds[next]! });
    scrollToRow(matchIds[next]!, "smooth", "center");
  });
  React.useEffect(() => {
    if (currentMatch) scrollToRow(currentMatch, "smooth", "center");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMatch]);
  const closeSearch = useEvent((focus: boolean) => {
    const keep = currentMatch;
    setQuery("");
    setSearchOpen(false);
    if (keep) reveal(keep);
    else if (focus) {
      const stop = store.get().focus ?? order[0];
      if (stop) requestAnimationFrame(() => elements.get(stop)?.focus({ preventScroll: true }));
    }
  });

  /* — ⌘F / ⌘K: owned when the user's last pointer/focus interaction was inside this component — */
  const lastInside = React.useRef(false);
  React.useEffect(() => {
    if (!captureFindShortcut) return;
    const onInteract = (event: Event) => {
      const target = event.target as Element | null;
      const inside = !!(rootRef.current?.contains(target) || target?.closest?.("[data-mt-portal]"));
      // Someone else's dialog doesn't change ownership either way.
      if (!inside && target?.closest?.("[role=dialog]")) return;
      lastInside.current = inside;
      setFindLive(inside);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !lastInside.current) return;
      const key = event.key.toLowerCase();
      if (!(event.metaKey || event.ctrlKey) || event.altKey || (key !== "f" && key !== "k")) return;
      const focused = window.document.activeElement;
      if (
        focused &&
        focused !== window.document.body &&
        !rootRef.current?.contains(focused) &&
        !focused.closest("[data-mt-portal]")
      )
        return;
      event.preventDefault();
      if (key === "k") setGotoOpen(true);
      else openSearch();
    };
    window.document.addEventListener("pointerdown", onInteract, true);
    window.document.addEventListener("focusin", onInteract, true);
    window.document.addEventListener("keydown", onKey);
    return () => {
      window.document.removeEventListener("pointerdown", onInteract, true);
      window.document.removeEventListener("focusin", onInteract, true);
      window.document.removeEventListener("keydown", onKey);
    };
  }, [captureFindShortcut, openSearch, rootRef, setGotoOpen]);

  /* — keyboard (WAI tree pattern + simulation actions) — */
  const typeahead = React.useRef({ text: "", at: -Infinity });
  const onTreeKeyDown = useEvent((keyEvent: React.KeyboardEvent) => {
    const target = keyEvent.target as HTMLElement;
    const item = target.closest<HTMLElement>("[data-mt-item]");
    const id = item?.dataset.rowId;
    if (!item || !id) return;
    const sub = target !== item && target.hasAttribute("data-substop");
    const index = order.indexOf(id);
    const row = visible.get(id);
    if (!row) return;
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    const foldable = isFoldable(row, projected);
    const open = foldable && (searching || id === focused || !collapsed.has(id));
    // Selection follows focus (single-select tree): Details and the breadcrumb track the arrow keys.
    const move = (next: string) => {
      focusRow(next);
      select(next);
    };
    const go = (next: string | undefined) => {
      if (!next) return;
      keyEvent.preventDefault();
      move(next);
    };
    switch (keyEvent.key) {
      case "ArrowDown":
        return go(order[index + 1]);
      case "ArrowUp":
        return go(order[index - 1]);
      case "Home":
        return go(order[0]);
      case "End":
        return go(order.at(-1));
      case forward: {
        if (sub) return;
        keyEvent.preventDefault();
        const next = order[index + 1];
        if (
          row.kind === "transition" ||
          (row.node?.kind === "submachine" && !(next && visible.get(next)?.parentId === id))
        )
          item.querySelector<HTMLElement>("[data-substop]")?.focus();
        else if (foldable && !open) toggle(id);
        else if (next && visible.get(next)?.parentId === id) move(next);
        return;
      }
      case backward: {
        keyEvent.preventDefault();
        if (sub) return item.focus();
        if (foldable && open && !searching) return toggle(id);
        if (row.parentId && visible.has(row.parentId)) move(row.parentId);
        return;
      }
      case "Enter":
      case " ": {
        keyEvent.preventDefault();
        // The inner stop (a target link) is not a nested button: the tree owns its activation.
        if (sub) return follow(id);
        if (keyEvent.altKey || keyEvent.metaKey || keyEvent.ctrlKey) follow(id);
        else activate(id);
        return;
      }
      case "Escape":
        if (sub) return void (keyEvent.preventDefault(), item.focus());
        if (findVisible) return void (keyEvent.preventDefault(), inputRef.current?.focus());
        if (back) return setBack(null);
        return select(null);
      default: {
        if (keyEvent.key === "/" && !keyEvent.metaKey && !keyEvent.ctrlKey) {
          keyEvent.preventDefault();
          return openSearch();
        }
        // Type-ahead (WAI tree pattern): characters typed within 500 ms build one prefix. A fresh
        // prefix starts after the focused row; a growing one may stay on it ("Re" → "Ret").
        if (
          keyEvent.key.length === 1 &&
          /\S/.test(keyEvent.key) &&
          !keyEvent.metaKey &&
          !keyEvent.ctrlKey &&
          !keyEvent.altKey
        ) {
          const now = keyEvent.timeStamp;
          const buffer = typeahead.current;
          const continuing = now - buffer.at < TYPEAHEAD_MS;
          const prefix = (continuing ? buffer.text : "") + keyEvent.key.toLowerCase();
          typeahead.current = { text: prefix, at: now };
          // Repeating one letter ("rrr") cycles through rows starting with it.
          const cycling = prefix.length > 1 && [...prefix].every((c) => c === prefix[0]);
          const needle = cycling ? prefix[0]! : prefix;
          const startAt = continuing && !cycling ? 0 : 1;
          for (let step = startAt; step <= order.length; step++) {
            const candidate = order[(index + step) % order.length]!;
            if (visible.get(candidate)!.label.toLowerCase().startsWith(needle))
              return go(candidate);
          }
          keyEvent.preventDefault();
        }
      }
    }
  });

  const containers = React.useMemo(
    () =>
      topology.rows
        .filter(
          (row) => row.kind === "node" && row.childIds.some((id) => rows.get(id)?.kind === "node"),
        )
        .map((row) => row.id),
    [topology, rows],
  );
  const collapseAll = useEvent(() => setCollapsed(new Set(containers)));
  const expandAll = useEvent(() => setCollapsed(new Set()));

  return React.useMemo<NavigationCtx>(
    () => ({
      focused,
      focusContainer,
      selected,
      select,
      reveal,
      revealFromPanel,
      follow,
      back,
      setBack,
      collapsed,
      setCollapsed,
      toggle,
      collapseAll,
      expandAll,
      projected,
      visible,
      order,
      query,
      setQuery,
      deferredQuery,
      searching,
      findVisible,
      findLive,
      openSearch,
      closeSearch,
      goMatch,
      matchIds,
      matchPosition,
      currentMatch,
      inputRef,
      countId,
      helpId,
      focusRow,
      handOffTo,
      restoreFocus,
      noteFocus,
      parkFocus,
      setFocusId,
      setPeek,
      onTreeKeyDown,
    }),
    [
      focused,
      focusContainer,
      selected,
      select,
      reveal,
      revealFromPanel,
      follow,
      back,
      collapsed,
      setCollapsed,
      toggle,
      collapseAll,
      expandAll,
      projected,
      visible,
      order,
      query,
      setQuery,
      deferredQuery,
      searching,
      findVisible,
      findLive,
      openSearch,
      closeSearch,
      goMatch,
      matchIds,
      matchPosition,
      currentMatch,
      countId,
      helpId,
      focusRow,
      handOffTo,
      restoreFocus,
      noteFocus,
      parkFocus,
      setFocusId,
      setPeek,
      onTreeKeyDown,
    ],
  );
}
