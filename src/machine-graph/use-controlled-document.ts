import * as React from "react";
import { createMachineHistory, type MachineDocument, type MachineHistory } from "../core/index.js";
import {
  initDocumentState,
  latestHistory,
  propose,
  reconcile,
  reject,
  sameDocument,
  type DocumentChangeMeta,
  type DocumentState,
  type Proposal,
} from "./controlled-document.js";

/**
 * React wiring for the document contract in `controlled-document.ts`: one owner for the
 * document, its bounded history and the host's answers. Machine Graph's controller builds on it;
 * it is also what the hook-level tests drive.
 *
 *   <MachineGraphView defaultDocument={doc} onDocumentChange={save} />   uncontrolled + notification
 *   <MachineGraphView document={doc} onDocumentChange={(next) => setDoc(next)} />   controlled
 *   <MachineGraphView document={serverDoc} readOnly />   controlled live viewer (no edits, no handler)
 *
 * Controlled hosts answer by passing the proposed document back (any number of renders later),
 * or veto with `return false` / `meta.reject()`.
 */
export interface DocumentChangeEvent extends DocumentChangeMeta {
  /** Veto this proposal (controlled only); callable now or later, e.g. when the server says no. */
  readonly reject: () => void;
}
/** Return `false` to veto (controlled only). Uncontrolled hosts are only notified. */
export type DocumentChangeHandler = (
  document: MachineDocument,
  meta: DocumentChangeEvent,
) => boolean | void;

export interface DocumentSource {
  /** Controlled: the document to render. Pass back what `onDocumentChange` proposes to accept it. */
  readonly document?: MachineDocument;
  /** Uncontrolled: the initial document. The view keeps its own undo history; later changes are ignored. */
  readonly defaultDocument?: MachineDocument;
  readonly onDocumentChange?: DocumentChangeHandler;
  /** Read-only on purpose: a `document` without `onDocumentChange` is a live viewer, not a mistake. */
  readonly readOnly?: boolean;
}

export interface ProposeCallbacks {
  /** Runs once the change is real: at once when uncontrolled, on the host's echo when controlled. */
  readonly onAccept?: () => void;
}

// Dev signal that survives being copied out of this Vite app: bundlers (webpack, Next.js,
// esbuild, Vite's own builds) replace `process.env.NODE_ENV` textually; a raw browser ESM
// load has no `process`, so it falls back to Vite's `(typeof process !== "undefined" && process.env.NODE_ENV !== "production")`.
declare const process: { readonly env: { readonly NODE_ENV?: string } } | undefined;
const NODE_ENV = typeof process !== "undefined" ? process.env.NODE_ENV : undefined;
export const DEV =
  NODE_ENV !== undefined
    ? NODE_ENV !== "production"
    : typeof process !== "undefined" && process.env.NODE_ENV !== "production";
/** How long a dev build waits for a controlled host to answer before it explains the contract. */
export const UNANSWERED_WARNING_MS = 5000;

const EMPTY: MachineDocument = {
  version: 1,
  rootId: "machine",
  machines: [{ id: "machine", label: "Machine", nodes: [], transitions: [] }],
};

export interface DocumentHooks {
  /** A proposal committed; `echoed` is the host's object for `proposed` (often a clone). */
  readonly onAccepted?: (proposed: MachineDocument, echoed: MachineDocument) => void;
  /** The host vetoed a proposal (and everything chained on it). */
  readonly onRejected?: (meta: DocumentChangeMeta) => void;
}

export function useControlledDocument(source: DocumentSource, hooks: DocumentHooks = {}) {
  const controlled = source.document !== undefined;
  const sourceRef = React.useRef(source);
  sourceRef.current = source;
  const hooksRef = React.useRef(hooks);
  hooksRef.current = hooks;

  /* ── Dev-only contract warnings (React's own value/defaultValue rules) ── */
  const wasControlled = React.useRef(controlled);
  const warned = React.useRef(new Set<string>());
  const warn = (key: string, message: string) => {
    if (!DEV || warned.current.has(key)) return;
    warned.current.add(key);
    console.error(`MachineGraphView: ${message}`);
  };
  if (wasControlled.current !== controlled)
    warn(
      "switch",
      `a component is changing from ${wasControlled.current ? "controlled" : "uncontrolled"} to ${controlled ? "controlled" : "uncontrolled"}. ` +
        "Decide between `document` (controlled) and `defaultDocument` (uncontrolled) for the lifetime of the component.",
    );
  wasControlled.current = controlled;
  if (controlled && source.defaultDocument !== undefined)
    warn(
      "both",
      "both `document` and `defaultDocument` were passed; `document` wins (controlled). Remove one.",
    );
  if (source.document === undefined && source.defaultDocument === undefined)
    warn("none", "pass `defaultDocument` (uncontrolled) or `document` (controlled).");
  if (controlled && !source.onDocumentChange && !source.readOnly)
    warn(
      "unhandled",
      "`document` was passed without `onDocumentChange`, so no edit can ever be accepted: the view is read-only. " +
        "Pass `onDocumentChange` (and the proposed document back) to edit, `defaultDocument` to let the view own the document, or `readOnly` to say read-only on purpose.",
    );

  const initial = React.useRef(source.document ?? source.defaultDocument ?? EMPTY).current;
  const [state, setState] = React.useState<DocumentState>(() =>
    initDocumentState(initial, createMachineHistory(initial)),
  );
  const ref = React.useRef(state);
  const write = (next: DocumentState) => {
    ref.current = next;
    setState(next);
  };
  const callbacks = React.useRef(new Map<number, ProposeCallbacks>());
  const nextId = React.useRef(1);
  /** Bumps on every veto, so fields that showed the vetoed text resync to the document. */
  const [refusals, setRefusals] = React.useState(0);

  const dropRejected = (dropped: readonly Proposal[]) => {
    if (!dropped.length) return;
    for (const p of dropped) callbacks.current.delete(p.id);
    setRefusals((n) => n + 1);
    hooksRef.current.onRejected?.(dropped[0]!.meta);
  };
  const rejectProposal = (id: number) => {
    const result = reject(ref.current, id);
    if (result.state === ref.current) return;
    write(result.state);
    dropRejected(result.dropped);
  };

  /** An edit, undo, redo or reset: commits now (uncontrolled) or waits for the host (controlled). */
  const proposeHistory = (
    target: MachineHistory,
    meta: DocumentChangeMeta,
    { onAccept }: ProposeCallbacks = {},
  ) => {
    const current = ref.current;
    if (target === latestHistory(current)) return false;
    const isControlled = sourceRef.current.document !== undefined;
    const id = nextId.current++;
    write(propose(current, target, meta, isControlled, id));
    if (isControlled && onAccept) callbacks.current.set(id, { onAccept });
    const answer = sourceRef.current.onDocumentChange?.(target.present, {
      ...meta,
      reject: () => rejectProposal(id),
    });
    if (!isControlled) onAccept?.();
    else if (answer === false) rejectProposal(id);
    return true;
  };

  // The host's answer to every render: echo (commit), external (one step), or nothing yet.
  const incoming = source.document;
  React.useLayoutEffect(() => {
    if (incoming === undefined) return;
    const result = reconcile(ref.current, incoming, true);
    if (result.state === ref.current) return;
    // A content-equal copy (a host that clones in render) only re-keys identity: no re-render,
    // or such a host would loop forever.
    if (result.outcome === "none") {
      ref.current = result.state;
      return;
    }
    write(result.state);
    const newest = result.accepted.at(-1);
    if (newest) hooksRef.current.onAccepted?.(newest.target.present, incoming);
    for (const p of result.accepted) {
      const cb = callbacks.current.get(p.id);
      callbacks.current.delete(p.id);
      cb?.onAccept?.();
    }
    for (const p of result.dropped) callbacks.current.delete(p.id);
  }, [incoming]);

  // Dev: a controlled host that never answers is almost always a listener that meant `defaultDocument`.
  const oldest = state.pending[0]?.id;
  React.useEffect(() => {
    if (!DEV || oldest === undefined) return;
    const timer = window.setTimeout(
      () =>
        warn(
          "unanswered",
          `onDocumentChange has not been answered for ${UNANSWERED_WARNING_MS / 1000}s. In controlled mode (\`document\`) pass the proposed document back to accept it, ` +
            "or return false / call meta.reject() to veto it. If you only want to be notified (autosave), pass `defaultDocument` instead of `document`.",
        ),
      UNANSWERED_WARNING_MS,
    );
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oldest]);

  // A host that clones in render (`document={structuredClone(doc)}`) hands over a new object
  // with the same content every render. Keep the identity it had, or everything keyed on the
  // document (memos, effects that reset on edit) would re-run each render and loop.
  const shown = React.useRef<MachineDocument | null>(null);
  let rendered = controlled ? source.document! : state.history.present;
  if (
    controlled &&
    shown.current &&
    shown.current !== rendered &&
    sameDocument(shown.current, rendered)
  )
    rendered = shown.current;
  else shown.current = rendered;

  return {
    /** What the view renders: the prop when controlled (identity-stable across content-equal copies), its own history's present otherwise. */
    document: rendered,
    /** Committed history (canUndo / canRedo read it). */
    history: state.history,
    /** The document as it was first mounted (Reset returns to it). */
    initial,
    controlled,
    /** Proposals still waiting for the host. */
    pending: state.pending.length,
    refusals,
    propose: proposeHistory,
    /** History the next proposal must build on (includes proposals in flight). Read from event handlers. */
    latest: () => latestHistory(ref.current),
  };
}
