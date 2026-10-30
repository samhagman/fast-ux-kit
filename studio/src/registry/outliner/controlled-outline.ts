import {
  reconcileOutlineEditorState,
  reduceOutlineEditor,
  sameOutlineContent,
  type OutlineAction,
  type OutlineEditorOptions,
  type OutlineEditorState,
} from "@fux/core";
import type { OutlineItem, OutlineItemData } from "./types";

/**
 * The outliner's document contract, as a pure state machine (no React) so it can be tested
 * directly. It follows React's `value` / `defaultValue` / `onValueChange` convention and
 * Machine View's echo rules (`machine-view/controlled-document.ts`):
 *
 *   uncontrolled  `defaultValue`: the outliner owns the document and its undo history. Edits
 *                 commit at once; `onValueChange` is a pure notification (autosave).
 *
 *   controlled    `value`: the outliner RENDERS the prop. An edit, undo or redo is a PROPOSAL
 *                 reported to `onValueChange`; it stays pending until the host answers:
 *       - echo      the host passes that document back (same array, a clone, a server copy
 *                   with equal content): the proposal commits with its history, caret and
 *                   selection, and the host's array becomes `nodes`. An echoed undo keeps the
 *                   redo stack it proposed. With several proposals in flight, an echo commits
 *                   the newest one it matches and every one before it; later ones stay pending.
 *       - rejected  `onValueChange` returns `false` or calls `meta.reject()` (now or later):
 *                   that proposal and everything chained on it are dropped.
 *       - external  any other document (a collaborator, a reload) becomes ONE undoable history
 *                   step and every pending proposal is dropped.
 *     A host that keeps its old prop has not answered yet. A content-equal copy of what is
 *     shown is not a change.
 *
 * Reading state (caret, selection, folding, zoom) is never proposed: it applies at once, on
 * top of the newest proposal when one is in flight.
 */
export type OutlineEditor = OutlineEditorState<OutlineItemData>;
export type OutlineChangeReason = "edit" | "undo" | "redo";
export interface OutlineChangeMeta {
  readonly reason: OutlineChangeReason;
  /** The editor action that produced the change, e.g. "text", "split", "drop". */
  readonly action: OutlineAction<OutlineItemData>["type"];
}
export interface OutlineProposal {
  /** Monotonic, so a late `reject()` finds its proposal. */
  readonly id: number;
  /** Editor state as it will be once the host accepts (document, history, caret). */
  readonly target: OutlineEditor;
  readonly meta: OutlineChangeMeta;
}
export interface ControlledOutlineState {
  readonly editor: OutlineEditor;
  /** Unanswered proposals, oldest first; each builds on the one before. Empty when uncontrolled. */
  readonly pending: readonly OutlineProposal[];
  /** The last `value` reconciled. */
  readonly prop: readonly OutlineItem[] | undefined;
}

export const initOutlineState = (editor: OutlineEditor, prop?: readonly OutlineItem[]): ControlledOutlineState => ({
  editor,
  pending: [],
  prop,
});

/** What the next action builds on: the newest proposal counts, so edits in flight chain. */
export const latestEditor = (state: ControlledOutlineState) => state.pending.at(-1)?.target ?? state.editor;

const reasonOf = (action: OutlineAction<OutlineItemData>): OutlineChangeReason =>
  action.type === "undo" ? "undo" : action.type === "redo" ? "redo" : "edit";

export interface StepResult {
  readonly state: ControlledOutlineState;
  /** Set when the action changed content: what to report to `onValueChange`. */
  readonly proposal?: OutlineProposal;
  /** The editor after the action (what the caller reads for refusals or the new caret). */
  readonly result: OutlineEditor;
}

/**
 * A studio-layer rule applied inside the same step as a content edit (mirror sync): it may
 * rewrite the result's nodes and reading state, or refuse. Undo/redo restore snapshots and
 * skip it. Because it runs before history is read, an edit and its consequences are one entry.
 */
export type OutlineAfterEdit = (before: OutlineEditor, after: OutlineEditor, action: OutlineAction<OutlineItemData>) => OutlineEditor;

/** One editor action. Content changes commit (uncontrolled) or become a proposal (controlled). */
export function stepOutline(
  state: ControlledOutlineState,
  action: OutlineAction<OutlineItemData>,
  options: OutlineEditorOptions<OutlineItemData>,
  controlled: boolean,
  id = 0,
  afterEdit?: OutlineAfterEdit,
): StepResult {
  const base = latestEditor(state);
  let result = reduceOutlineEditor(base, action, options);
  if (afterEdit && result.nodes !== base.nodes && action.type !== "undo" && action.type !== "redo") result = afterEdit(base, result, action);
  if (result === base) return { state, result };
  const changed = result.nodes !== base.nodes;
  const proposal = changed ? { id, target: result, meta: { reason: reasonOf(action), action: action.type } } : undefined;
  if (controlled && proposal) return { state: { ...state, pending: [...state.pending, proposal] }, proposal, result };
  if (!state.pending.length) return { state: { ...state, editor: result }, proposal, result };
  // Reading state on top of an edit in flight rides along with that proposal.
  const last = state.pending.at(-1)!;
  return { state: { ...state, pending: [...state.pending.slice(0, -1), { ...last, target: result }] }, result };
}

/** The host vetoed proposal `id`: it and every proposal chained on it are dropped. */
export function rejectOutlineProposal(state: ControlledOutlineState, id: number) {
  const at = state.pending.findIndex((proposal) => proposal.id === id);
  if (at < 0) return { state, dropped: [] as readonly OutlineProposal[] };
  return { state: { ...state, pending: state.pending.slice(0, at) }, dropped: state.pending.slice(at) };
}

export type OutlineReconcileOutcome = "none" | "echo" | "external" | "invalid";
export interface OutlineReconcileResult {
  readonly state: ControlledOutlineState;
  readonly outcome: OutlineReconcileOutcome;
  readonly accepted: readonly OutlineProposal[];
  readonly dropped: readonly OutlineProposal[];
}

const withNodes = (editor: OutlineEditor, nodes: readonly OutlineItem[]): OutlineEditor =>
  editor.nodes === nodes ? editor : { ...editor, nodes };

/** The outliner's answer to the current `value`. Pure; returns the same state when nothing changed. */
export function reconcileOutline(
  state: ControlledOutlineState,
  incoming: readonly OutlineItem[],
  options: Pick<OutlineEditorOptions<OutlineItemData>, "noteAdapter" | "historyLimit"> = {},
): OutlineReconcileResult {
  const none = { accepted: [], dropped: [] };
  if (incoming === state.prop) return { state, outcome: "none", ...none };
  // The newest proposal this document answers (a host may coalesce several into one echo).
  for (let i = state.pending.length - 1; i >= 0; i--) {
    const proposal = state.pending[i]!;
    if (!sameOutlineContent(incoming, proposal.target.nodes)) continue;
    return {
      state: { editor: withNodes(proposal.target, incoming), pending: state.pending.slice(i + 1), prop: incoming },
      outcome: "echo",
      accepted: state.pending.slice(0, i + 1),
      dropped: [],
    };
  }
  if (sameOutlineContent(incoming, state.editor.nodes))
    return { state: { ...state, editor: withNodes(state.editor, incoming), prop: incoming }, outcome: "none", ...none };
  let next: OutlineEditor;
  try {
    next = reconcileOutlineEditorState(state.editor, incoming, options);
  } catch {
    // An invalid document from the host never replaces a valid one; keep showing what we have.
    return { state: { ...state, prop: incoming }, outcome: "invalid", ...none };
  }
  const { editor } = state;
  const entry = { nodes: editor.nodes, caret: editor.caret, selection: editor.selection, selectionAnchor: editor.selectionAnchor };
  const limit = Math.max(1, options.historyLimit ?? 100);
  return {
    state: {
      editor: { ...next, history: { past: [...editor.history.past, entry].slice(-limit), future: [], group: null } },
      pending: [],
      prop: incoming,
    },
    outcome: "external",
    accepted: [],
    dropped: state.pending,
  };
}
