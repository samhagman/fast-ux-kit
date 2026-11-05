/**
 * The live field's code is a chunk of its own: fetched once, the first time something asks for
 * it (an outliner mounting asks while idle), never part of the page's first load.
 *
 * Until it arrives a row edits with the plain field it always had. The server and the first
 * client render agree on "not loaded" (useSyncExternalStore's server snapshot), so a page that
 * hydrates with a row being edited never mismatches.
 */
import * as React from "react";

export type LiveFieldModule = typeof import("./field-view.js");

let loaded: LiveFieldModule | null = null;
let pending: Promise<LiveFieldModule> | null = null;
const listeners = new Set<() => void>();

export function loadLiveField(): Promise<LiveFieldModule> {
  pending ??= import("./field-view.js").then(
    (module) => {
      loaded = module;
      for (const listener of listeners) listener();
      return module;
    },
    (error: unknown) => {
      pending = null; // a failed fetch can be tried again
      throw error;
    },
  );
  return pending;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** The loaded module, or null (not yet, or on the server). Asks for it on first use. */
export function useLiveField(): LiveFieldModule | null {
  const module = React.useSyncExternalStore(
    subscribe,
    () => loaded,
    () => null,
  );
  React.useEffect(() => {
    if (!loaded) loadLiveField().catch(() => {});
  }, []);
  return module;
}
