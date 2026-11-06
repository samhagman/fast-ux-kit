/**
 * Machine Tree, React half of the model: small hooks, the per-instance row view store, and the
 * row-facing model context. Pure helpers live in `machine-tree-logic.ts`.
 */
import * as React from "react";
import type {
  MachineEvent,
  MachineTreeModel,
  MachineTreeRow,
  MachineTreeVisibleRow,
} from "../core/index.js";
import type { SendResult } from "../machine-shared/use-machine-simulation.js";
import type { FocusHandoff } from "../machine-shared/machine-focus.js";
import type { MachineTreeFix, SimView } from "./machine-tree-logic.js";

/* ───────────────────────────── hooks ───────────────────────────── */

export function useControllable<T>(
  controlled: T | undefined,
  initial: () => T,
  onChange?: (value: T) => void,
) {
  const [inner, setInner] = React.useState(initial);
  const value = controlled !== undefined ? controlled : inner;
  const ref = React.useRef(value);
  ref.current = value;
  const changeRef = React.useRef(onChange);
  changeRef.current = onChange;
  const set = React.useCallback((next: T | ((previous: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(ref.current) : next;
    if (Object.is(resolved, ref.current)) return;
    ref.current = resolved;
    setInner(resolved);
    changeRef.current?.(resolved);
  }, []);
  return [value, set] as const;
}

/** A stable function identity that always calls the latest closure (event handlers only). */
export function useEvent<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  const ref = React.useRef(fn);
  React.useLayoutEffect(() => {
    ref.current = fn;
  });
  return React.useCallback((...args: A) => ref.current(...args), []);
}

/* Focus hand-off lives in machine-shared/machine-focus.ts (shared with Machine View); the
 * platform modifier label in lib/platform.ts; media queries in hooks/use-media-query.ts. */

/* ───────────────────────────── view store ─────────────────────────────
 * Hot, per-row ephemeral state. Rows read it through boolean selectors, so a focus move
 * re-renders exactly the two rows whose answer changed. */

export interface ViewState {
  readonly focus: string | null;
  readonly selected: string | null;
  readonly peek: string | null;
  readonly flash: string | null;
  readonly match: string | null;
  readonly spotlight: string | null;
  /** Dry-run preview: the event being hovered/focused and the rows it would enter and exit. */
  readonly previewEvent: string | null;
  /** How a tree route raised the preview ("pointer" hover, "key" focus): the footer names the follow gesture. */
  readonly previewVia: "pointer" | "key" | null;
  readonly ghostEnter: ReadonlySet<string> | null;
  readonly ghostExit: ReadonlySet<string> | null;
}
export interface ViewStore {
  readonly get: () => ViewState;
  readonly set: (patch: Partial<ViewState>) => void;
  readonly subscribe: (listener: () => void) => () => void;
}
export function createViewStore(): ViewStore {
  let state: ViewState = {
    focus: null,
    selected: null,
    peek: null,
    flash: null,
    match: null,
    spotlight: null,
    previewEvent: null,
    previewVia: null,
    ghostEnter: null,
    ghostExit: null,
  };
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      if (
        (Object.keys(patch) as (keyof ViewState)[]).every((key) =>
          Object.is(state[key], patch[key]),
        )
      )
        return;
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
export const StoreCtx = React.createContext<ViewStore | null>(null);
export function useView<T>(select: (state: ViewState) => T): T {
  const store = React.useContext(StoreCtx)!;
  const get = () => select(store.get());
  return React.useSyncExternalStore(store.subscribe, get, get);
}
export const FLAG = {
  selected: 1,
  peek: 2,
  flash: 4,
  match: 8,
  spotlight: 16,
  stop: 32,
  ghostEnter: 64,
  ghostExit: 128,
} as const;
/** One subscription per row: a bitmask of the view flags that concern it. */
export function useRowFlags(id: string, first: string | undefined): number {
  return useView(
    (s) =>
      (s.selected === id ? FLAG.selected : 0) |
      (s.peek === id ? FLAG.peek : 0) |
      (s.flash === id ? FLAG.flash : 0) |
      (s.match === id ? FLAG.match : 0) |
      (s.spotlight === id ? FLAG.spotlight : 0) |
      ((s.focus ?? first) === id ? FLAG.stop : 0) |
      (s.ghostEnter?.has(id) ? FLAG.ghostEnter : 0) |
      (s.ghostExit?.has(id) ? FLAG.ghostExit : 0),
  );
}

/* ───────────────────────────── row model context ─────────────────────────────
 * What every row reads. Stable between keystrokes: only changes when data, folds, search or the
 * simulation frame do, so a focus move never re-renders the tree. */

export interface TreeModelCtx {
  readonly inspectionMachineId?: string;
  readonly presentation?: import("../core/index.js").MachinePresentation;
  readonly model: MachineTreeModel;
  readonly rows: ReadonlyMap<string, MachineTreeRow>;
  /** Projection rows (search-filtered, unfolded), keyed by id. */
  readonly projected: ReadonlyMap<string, MachineTreeVisibleRow>;
  /** Rows actually rendered (projection minus folds). */
  readonly visible: ReadonlyMap<string, MachineTreeVisibleRow>;
  /** First visible row: the roving tab stop until something is focused. */
  readonly first: string | undefined;
  readonly links: ReadonlyMap<string, string>;
  readonly issues: ReadonlyMap<string, readonly string[]>;
  readonly rootMachineId: string;
  readonly searching: boolean;
  readonly query: string;
  readonly collapsed: ReadonlySet<string>;
  /**
   * Changes only when the tree can reflow (folds, search). Layout-animated cells measure on this,
   * not on every render, so a simulation frame never makes 100+ cells read their geometry.
   */
  readonly layoutEpoch: object;
  readonly sim: SimView;
  /** Coarse pointer (touch): larger targets, no hover-only affordances. */
  readonly coarse: boolean;
  readonly handoff: FocusHandoff;
  readonly toggle: (rowId: string) => void;
  readonly select: (rowId: string | null) => void;
  readonly setFocusId: (rowId: string) => void;
  readonly setPeek: (rowId: string | null) => void;
  readonly follow: (rowId: string) => void;
  readonly reveal: (rowId: string, from?: string) => void;
  readonly activate: (rowId: string) => void;
  readonly sendEvent: (event: string | MachineEvent) => SendResult | null;
  /** Sends a fix's payload once (the payload editor is left alone); `rowId` gets focus back. */
  readonly applyFix: (fix: MachineTreeFix, rowId?: string) => void;
  /** Shows (or clears) the dry-run ghost for an enabled event. */
  readonly setPreview: (event: string | null, via?: "pointer" | "key") => void;
  readonly refFor: (rowId: string) => (el: HTMLElement | null) => void;
}
export const ModelCtx = React.createContext<TreeModelCtx | null>(null);
export const useTree = () => React.useContext(ModelCtx)!;
