import { commitMachineHistory, type MachineDocument, type MachineHistory } from "@fux/core";

/**
 * The document contract, as a pure state machine (no React), so it can be tested directly.
 * It follows React's `value` / `defaultValue` / `onChange` convention:
 *
 *   uncontrolled  `defaultDocument`: the view owns the document and its undo history. Edits
 *                 commit at once; `onDocumentChange`, if given, is a pure notification (the
 *                 autosave / analytics host). Later changes to `defaultDocument` are ignored.
 *
 *   controlled    `document`: the view RENDERS the prop. An edit, undo, redo or reset is a
 *                 PROPOSAL reported to `onDocumentChange`; it stays pending until the host
 *                 answers, however many renders (or server round trips) that takes:
 *       - echo      the host passes back that document (same object, a clone, or a server copy
 *                   with equal content): the proposal commits as ONE history step, with the
 *                   host's object as `present`. An echoed undo/redo keeps the redo/undo stack
 *                   it proposed. Several proposals can be in flight (edit, edit, undo before the
 *                   first echo): an echo commits the newest proposal it matches and every
 *                   proposal before it; later ones stay pending.
 *       - rejected  the host says no: `onDocumentChange` returns `false`, or it calls
 *                   `meta.reject()` (sync or later). The proposal and every proposal chained on
 *                   it are dropped; nothing commits. A host that just keeps its old prop has
 *                   not answered yet: the proposal stays pending.
 *       - external  the host passes something else (a collaborator's change, a reload): that
 *                   document is one history step and every pending proposal is dropped.
 *     A content-equal copy of what is already shown is not a change.
 *
 * `reconcile` runs once per render with the current prop; `propose` and `reject` run from
 * event handlers (or host callbacks).
 */
export type DocumentChangeReason = "edit" | "undo" | "redo" | "reset";
export interface DocumentChangeMeta {
  readonly reason: DocumentChangeReason;
  /** What the change was, e.g. "rename Draft to Review" (undo/redo name what they reverse). */
  readonly label?: string;
}

export interface Proposal {
  /** Monotonic id, so a late `reject()` finds its proposal. */
  readonly id: number;
  /** History as it will be once the host accepts. */
  readonly target: MachineHistory;
  readonly meta: DocumentChangeMeta;
}
export interface DocumentState {
  readonly history: MachineHistory;
  /** Unanswered proposals, oldest first; each builds on the one before it. Always empty when uncontrolled. */
  readonly pending: readonly Proposal[];
  /** The last `document` prop reconciled. */
  readonly prop: MachineDocument;
}
export type ReconcileOutcome = "none" | "echo" | "external";
export interface ReconcileResult {
  readonly state: DocumentState;
  readonly outcome: ReconcileOutcome;
  /** Proposals this render committed (echo), oldest first. */
  readonly accepted: readonly Proposal[];
  /** Proposals an external document superseded. */
  readonly dropped: readonly Proposal[];
}

export const initDocumentState = (document: MachineDocument, history: MachineHistory): DocumentState => ({ history, pending: [], prop: document });

/** Structural equality with an identity fast path: hosts that structurally share (immer) compare in O(changed). */
export function sameDocument(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const other = b as unknown[];
    return a.length === other.length && a.every((item, i) => sameDocument(item, other[i]));
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => sameDocument((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** The history the next proposal builds on: the newest unanswered proposal counts, so edits in flight chain. */
export const latestHistory = (state: DocumentState) => state.pending.at(-1)?.target ?? state.history;
/** The document the next proposal builds on. */
export const latestDocument = (state: DocumentState) => latestHistory(state).present;

/** An edit/undo/redo/reset. Uncontrolled: commits now. Controlled: waits for the host's answer. */
export function propose(state: DocumentState, target: MachineHistory, meta: DocumentChangeMeta, controlled: boolean, id = 0): DocumentState {
  if (target === latestHistory(state)) return state;
  return controlled ? { ...state, pending: [...state.pending, { id, target, meta }] } : { ...state, history: target, pending: [] };
}

/** The host vetoed proposal `id`: it and every proposal chained on it are dropped. Unknown ids are a no-op. */
export function reject(state: DocumentState, id: number): { readonly state: DocumentState; readonly dropped: readonly Proposal[] } {
  const at = state.pending.findIndex((p) => p.id === id);
  if (at < 0) return { state, dropped: [] };
  return { state: { ...state, pending: state.pending.slice(0, at) }, dropped: state.pending.slice(at) };
}

const NONE = { accepted: [], dropped: [] } as const;

/** The view's answer to the current `document` prop. Pure; returns the same state when nothing changed. */
export function reconcile(state: DocumentState, incoming: MachineDocument, controlled: boolean): ReconcileResult {
  if (incoming === state.prop) return { state, outcome: "none", ...NONE };
  if (controlled) {
    // The newest proposal this document answers (the host may coalesce several into one echo).
    for (let i = state.pending.length - 1; i >= 0; i--) {
      const proposal = state.pending[i]!;
      if (!sameDocument(incoming, proposal.target.present)) continue;
      return {
        state: { history: { ...proposal.target, present: incoming }, pending: state.pending.slice(i + 1), prop: incoming },
        outcome: "echo",
        accepted: state.pending.slice(0, i + 1),
        dropped: [],
      };
    }
  }
  // A clone of what is already shown (a host re-rendering with a copy) is not a change.
  if (sameDocument(incoming, state.history.present)) return { state: { ...state, history: { ...state.history, present: incoming }, prop: incoming }, outcome: "none", ...NONE };
  return { state: { history: commitMachineHistory(state.history, incoming), pending: [], prop: incoming }, outcome: "external", accepted: [], dropped: state.pending };
}
