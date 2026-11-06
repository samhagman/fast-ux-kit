import * as React from "react";
import { toast } from "../components/ui/sonner.js";
import {
  applyMachineCommand,
  commitMachineHistory,
  redoMachineHistory,
  undoMachineHistory,
  validateMachineDocument,
  explainMachineEvent,
  previewMachineEvent,
  type MachineEventPreview,
  type MachineCommand,
  type MachineDirection,
  type MachineDocument,
  type MachineGraph,
  type MachineIssue,
  type MachineRuntimeOptions,
  type MachineScenario,
  type MachineSnapshot,
} from "../core/index.js";
import { machineToast, type MachineToaster } from "../machine-shared/machine-toast.js";
import { describeBlocked, describeSend, describeStart } from "../machine-shared/machine-copy.js";
import { structuralIssues } from "../machine-shared/machine-issues.js";
import {
  runMachineScenario,
  useMachineSimulation,
  type ScenarioStep,
  type ScenarioResult,
} from "../machine-shared/use-machine-simulation.js";
import { sameDocument } from "./controlled-document.js";
import { useControlledDocument, type DocumentChangeHandler } from "./use-controlled-document.js";
import {
  applyPinnedPositions,
  contentKey,
  isAncestor,
  isNestedTransition,
  layoutMachineAuto,
  type MachineGraphLayout,
  type MachineSizeHints,
} from "./layout.js";
import { countStates, plural } from "./machine-context.js";
import { createMachineLayoutEngine, type MachineLayoutWorkerOptions } from "./layout-worker.js";
import {
  useMachineInspection,
  type MachineInspectionProps,
} from "../machine-shared/use-machine-inspection.js";

/**
 * Machine View controller.
 *
 *  - Document: every edit is a core `MachineCommand` (or an atomic batch of them) applied
 *    through `applyMachineCommand` and committed as ONE bounded-history step.
 *  - Layout: ELK over the structure (cached by structure, so a drag never re-runs ELK),
 *    then the user's pinned positions on top. Measured DOM heights feed back as hints.
 *  - Simulation: the shared `useMachineSimulation` hook (cancellable scenarios, payload-aware
 *    candidates). This file only adds view concerns: mode, blocked-event feedback, per-step
 *    context capture and screen-reader announcements.
 *
 * Nothing here executes document strings: guards and actions resolve only through `runtime`.
 */
export type MachineMode = "design" | "simulate" | "inspect";
export type MachineSelection = { readonly type: "node" | "transition"; readonly id: string } | null;
export interface MachineNotice {
  readonly message: string;
  readonly tone?: "info" | "warning" | "error";
  readonly undo?: boolean;
}

/**
 * The document, React-style (`value` / `defaultValue` / `onChange`):
 *  - `defaultDocument` (uncontrolled): the view owns the document and its undo history; later
 *    changes to the prop are ignored (remount with a `key` to load another). `onDocumentChange`
 *    is a pure notification, e.g. autosave.
 *  - `document` (controlled): the view RENDERS this prop. Each edit, undo, redo and reset is a
 *    proposal reported to `onDocumentChange`; pass the document back (the same object, a clone,
 *    or a server copy with equal content, any number of renders later) to accept it as one
 *    history step, or veto it with `return false` / `meta.reject()`. See `controlled-document.ts`.
 *  - `document` + `readOnly` (or `editable={false}`), a live viewer: the view renders the prop as
 *    it changes and offers no edits, so it needs no `onDocumentChange`.
 * Switching between the two during a component's life is a bug (a dev build warns).
 */
export type MachineDocumentProps =
  /** Controlled: `onDocumentChange` is required (React's "value without onChange" rule). Without it nothing could ever be accepted, so at runtime such a view is read-only (and a dev build says so). */
  | {
      readonly document: MachineDocument;
      readonly defaultDocument?: never;
      readonly onDocumentChange: DocumentChangeHandler;
    }
  /**
   * Controlled read-only viewer (React's `value` + `readOnly`): renders whatever `document` is now,
   * e.g. a server copy that updates live, and never proposes an edit, so it takes no handler.
   */
  | {
      readonly document: MachineDocument;
      readonly defaultDocument?: never;
      readonly readOnly: true;
      readonly onDocumentChange?: never;
    }
  /** The same viewer, said as `editable={false}` (the two are one switch). */
  | {
      readonly document: MachineDocument;
      readonly defaultDocument?: never;
      readonly editable: false;
      readonly onDocumentChange?: never;
    }
  | {
      readonly document?: never;
      readonly defaultDocument: MachineDocument;
      readonly onDocumentChange?: DocumentChangeHandler;
    };

export type UseMachineViewOptions = MachineDocumentProps &
  MachineInspectionProps & {
    readonly defaultMode?: MachineMode;
    readonly layoutWorker?: MachineLayoutWorkerOptions;
    readonly runtime?: MachineRuntimeOptions;
    readonly scenarios?: readonly MachineScenario[];
    /** `false`: view and simulate only. Exactly the same switch as `readOnly` (including the handler-less viewer). */
    readonly editable?: boolean;
    /** Preset: view and simulate only (no palette, no edits, no drag). Same as `editable={false}`. With `document`, either one is a live viewer that needs no `onDocumentChange`. */
    readonly readOnly?: boolean;
    readonly defaultDirection?: MachineDirection | "auto";
    /** Controlled selection (pass with `onSelectionChange`); `undefined` leaves it uncontrolled. */
    readonly selection?: MachineSelection;
    readonly onSelectionChange?: (selection: MachineSelection) => void;
    /** Refusals, deletions and blocked events. Defaults to a sonner toast (with Undo when offered). */
    readonly onNotice?: (notice: MachineNotice, undo: () => void) => void;
  };

export interface BlockedEvent {
  /** Trace sequence the attempt was made after. */
  readonly after: number;
  readonly event: string;
  readonly reason: string;
  readonly payload?: unknown;
}

/**
 * The default notice. Desktop: a sonner toast (with Undo when offered). Phone shell: the shared
 * 44px touch toast in the view's own toaster under its toolbar (like the Machine Tree's), so it
 * never sits on the peek bar or the host's header, and its Undo is a real target.
 */
const defaultNotice = (
  notice: MachineNotice,
  undo: () => void,
  compact: boolean,
  toasterId?: string,
  touchToast: MachineToaster["show"] = machineToast,
) => {
  if (compact) {
    const tone =
      notice.tone === "error" ? "error" : notice.tone === "warning" ? "warning" : "default";
    // With an action it stays long enough to reach (Material snackbar: 4–10 s; WCAG 2.2.1).
    return touchToast(
      notice.undo ? `machine-notice-${Date.now()}` : "machine-notice",
      notice.message,
      {
        tone,
        ...(notice.undo
          ? { action: { label: "Undo", onClick: undo }, duration: ACTION_TOAST_MS }
          : {}),
      },
    );
  }
  (notice.tone === "error" ? toast.error : notice.tone === "warning" ? toast.warning : toast)(
    notice.message,
    {
      id: notice.undo ? undefined : `machine-notice${toasterId ? `-${toasterId}` : ""}`,
      ...(toasterId ? { toasterId } : {}),
      ...(notice.undo
        ? { action: { label: "Undo", onClick: undo }, duration: ACTION_TOAST_MS }
        : {}),
    },
  );
};

/** `startLead` for a plain Simulate / Restart (a scenario leads with its own name). */
const START = "\u0000start";

/** How long a notice with an Undo stays up. */
const ACTION_TOAST_MS = 6000;

const structureKey = (graph: MachineGraph) =>
  JSON.stringify([
    graph.id,
    graph.initialId,
    graph.nodes.map(({ position: _p, ...node }) => node),
    graph.transitions,
  ]);

/** Breadcrumb from the root to `id` through submachine references (BFS), else just [root, id]. */
function pathTo(document: MachineDocument, id: string): string[] {
  if (id === document.rootId) return [id];
  const queue: string[][] = [[document.rootId]];
  const seen = new Set([document.rootId]);
  while (queue.length) {
    const path = queue.shift()!;
    const machine = document.machines.find((m) => m.id === path.at(-1));
    for (const node of machine?.nodes ?? []) {
      if (node.kind !== "submachine" || !node.machineId || seen.has(node.machineId)) continue;
      const next = [...path, node.machineId];
      if (node.machineId === id) return next;
      seen.add(node.machineId);
      queue.push(next);
    }
  }
  return [document.rootId, id];
}

/** How a finished scenario went, kept per scenario id until the next run or a document edit. */
export interface ScenarioOutcome {
  readonly blockedReasons?: readonly string[];
  readonly passed?: boolean;
  readonly blocked: number;
  readonly activeIds: readonly string[];
  readonly expectedActiveIds?: readonly string[];
  readonly result?: ScenarioResult;
  readonly cancelled?: boolean;
}

/** Host chrome facts the controller needs but the document does not carry. */
export interface MachineViewHost {
  /** Narrow container (phone shell): regions stack and auto layout assumes a tall viewport. */
  readonly compact?: boolean;
  /** The canvas size before React Flow has measured it, so "auto" direction scores the real space. */
  readonly measureViewport?: () => { width: number; height: number } | null;
  /** A sonner `<Toaster id>` the shell mounted for this view; default desktop notices go there. */
  readonly toasterId?: string;
  /**
   * The phone shell's own touch toaster (below this view's toolbar, never over the host page's
   * header). Without it phone notices go to the page's toaster.
   */
  readonly touchToast?: MachineToaster["show"];
}

export function useMachineView(options: UseMachineViewOptions, host: MachineViewHost = {}) {
  const compact = !!host.compact;
  const { runtime } = options;
  // A controlled document with no `onDocumentChange` can never accept an edit: read-only.
  const answerable = options.document === undefined || !!options.onDocumentChange;
  /** `readOnly` and `editable={false}` are one switch. */
  const readOnly = !!options.readOnly || options.editable === false;
  const canEdit = !readOnly && answerable;
  const optionsRef = React.useRef(options);
  optionsRef.current = options;
  const compactRef = React.useRef(compact);
  compactRef.current = compact;
  const toasterRef = React.useRef(host.toasterId);
  toasterRef.current = host.toasterId;
  const touchToastRef = React.useRef(host.touchToast);
  touchToastRef.current = host.touchToast;
  const notify = React.useCallback((notice: MachineNotice) => {
    const undo = () => historyApi.current.undo();
    const custom = optionsRef.current.onNotice;
    if (custom) custom(notice, undo);
    else defaultNotice(notice, undo, compactRef.current, toasterRef.current, touchToastRef.current);
  }, []);

  /* ── Document + bounded history (controlled or not: see controlled-document.ts) ── */
  const [announcement, setAnnouncementText] = React.useState("");
  // A repeat of the same sentence ("Change was not accepted." twice) must still change the live
  // region's text, or screen readers stay silent: alternate a trailing no-break space.
  const flip = React.useRef(false);
  const setAnnouncement = React.useCallback((text: string) => {
    flip.current = !flip.current;
    setAnnouncementText(flip.current ? `${text}\u00A0` : text);
  }, []);
  /** What each history state was made by, so undo and redo can say what they did. */
  const describedBy = React.useRef(new WeakMap<MachineDocument, string>());
  const doc = useControlledDocument(
    { ...options, readOnly },
    {
      // An echo's object (often a clone) inherits the label of the proposal it answered.
      onAccepted: (proposed, echoed) => {
        const label = describedBy.current.get(proposed);
        if (label) describedBy.current.set(echoed, label);
      },
      // A vetoed change says so, instead of the "Added …" it would have said: to screen readers
      // and on screen (one notice id, so a burst of vetoes is one toast, not a stack).
      onRejected: (meta) => {
        const text =
          meta.reason === "undo"
            ? "Undo was not accepted."
            : meta.reason === "redo"
              ? "Redo was not accepted."
              : "Change was not accepted.";
        setAnnouncement(text);
        notify({ message: text.slice(0, -1), tone: "warning" });
      },
    },
  );
  const { controlled, history } = doc;
  const document = doc.document;
  const initialDocument = doc.initial;
  const [path, setPath] = React.useState<readonly string[]>([document.rootId]);
  const graph = (document.machines.find((m) => m.id === path.at(-1)) ??
    document.machines.find((m) => m.id === document.rootId) ??
    document.machines[0]) as MachineGraph;
  const machineId = graph.id;
  /**
   * The machine every command is BUILT from: the newest proposal in flight (a slow controlled
   * host), else what is drawn. Proposals chain on `doc.latest()`, so their inputs (free event
   * names, what a delete takes with it, pinned positions) must come from the same place, or two
   * quick "A" presses would both add NEXT. Read it in event handlers, never in render.
   */
  const latestGraph = React.useCallback(
    (): MachineGraph => doc.latest().present.machines.find((m) => m.id === machineId) ?? graph,
    [doc, machineId, graph],
  );
  /** An id no node or transition in the latest document uses (two adds in one millisecond stay distinct). */
  const freshId = React.useCallback(
    (prefix: string) => {
      const taken = new Set<string>();
      for (const m of doc.latest().present.machines) {
        taken.add(m.id);
        for (const n of m.nodes) taken.add(n.id);
        for (const t of m.transitions) taken.add(t.id);
      }
      const stamp = Date.now().toString(36);
      let id = `${prefix}-${stamp}`;
      for (let i = 2; taken.has(id); i++) id = `${prefix}-${stamp}-${i}`;
      return id;
    },
    [doc],
  );
  // An undo can remove the machine on screen (e.g. an added submachine): fall back to root.
  React.useEffect(() => {
    if (path.at(-1) !== machineId) setPath([document.rootId]);
  }, [path, machineId, document.rootId]);

  const [mode, setModeState] = React.useState<MachineMode>(
    options.defaultMode ?? (options.inspectionSession ? "inspect" : "design"),
  );
  const editable = canEdit && mode === "design";
  const inspection = useMachineInspection(document, options);
  const [innerSelection, setInnerSelection] = React.useState<MachineSelection>(null);
  const controlledSelection = options.selection !== undefined;
  const selection = controlledSelection ? options.selection! : innerSelection;
  const selectionRef = React.useRef(selection);
  selectionRef.current = selection;
  const setSelection = React.useCallback((next: MachineSelection) => {
    const current = selectionRef.current;
    if (
      current === next ||
      (current && next && current.type === next.type && current.id === next.id)
    )
      return;
    selectionRef.current = next;
    if (optionsRef.current.selection === undefined) setInnerSelection(next);
    optionsRef.current.onSelectionChange?.(next);
  }, []);
  // Selection never outlives what it points at (delete, undo, machine switch).
  React.useEffect(() => {
    if (!selection) return;
    const exists =
      selection.type === "node"
        ? graph.nodes.some((n) => n.id === selection.id)
        : graph.transitions.some((t) => t.id === selection.id);
    if (!exists) setSelection(null);
  }, [graph, selection]);

  /** Inline rename on the canvas (after add, or on double-click). */
  const [renaming, setRenaming] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (renaming && selection?.id !== renaming) setRenaming(null);
  }, [renaming, selection]);
  /** One-shot focus request for an inspector field (after connect: the event name). */
  /** `target`: the selected transition's To field opens (phone Re-target). */
  const [focusRequest, setFocusRequest] = React.useState<{
    readonly field: "event" | "name" | "target";
    readonly nonce: number;
  } | null>(null);
  const requestFocus = (field: "event" | "name" | "target") =>
    setFocusRequest({ field, nonce: Date.now() });
  const [revealRequest, setRevealRequest] = React.useState<{
    machineId: string;
    id: string;
    nonce: number;
  } | null>(null);
  const reveal = (machineId: string, id: string, type: "node" | "transition") => {
    const target = document.machines.find((m) => m.id === machineId);
    if (!target || !(type === "node" ? target.nodes : target.transitions).some((n) => n.id === id))
      return;
    switchMachine(machineId);
    setSelection({ type, id });
    setRevealRequest({ machineId, id, nonce: Date.now() });
  };
  const announce = React.useCallback((text: string) => setAnnouncement(text), []);

  const issues = React.useMemo<readonly MachineIssue[]>(() => {
    const core = validateMachineDocument(document).filter(
      (issue) => !issue.machineId || issue.machineId === machineId,
    );
    // View-level advice the core does not flag (shared with Machine Tree, same words).
    return [...core, ...structuralIssues(graph, machineId)];
  }, [document, machineId, graph]);

  /**
   * Applies core commands as ONE proposed history step. Returns false when a command is invalid
   * (nothing is proposed). `onAccept` runs once the change is real (at once when uncontrolled, on
   * the host's echo when controlled): selection, inline rename and announcements go there, so a
   * vetoed or still-pending change never claims to have happened.
   */
  const [invalidCount, setInvalidCount] = React.useState(0);
  const run = React.useCallback(
    (
      commands: MachineCommand | readonly MachineCommand[],
      meta: {
        readonly label?: string;
        readonly onAccept?: (proposed: MachineDocument) => void;
      } = {},
    ) => {
      const list = Array.isArray(commands) ? commands : [commands as MachineCommand];
      if (!editable) {
        notify({ message: "This machine is read-only.", tone: "error" });
        return false;
      }
      // Build on the latest proposal, so edits in flight chain instead of overwriting.
      const latest = doc.latest();
      const base = latest.present;
      let next = base;
      for (const command of list) {
        const result = applyMachineCommand(next, command);
        if (!result.ok) {
          notify({
            message:
              result.issues.find((i) => i.severity === "error")?.message ??
              "That change isn't valid.",
            tone: "error",
          });
          setInvalidCount((n) => n + 1);
          return false;
        }
        next = result.document;
      }
      const label = meta.label ?? describeCommands(list, base);
      describedBy.current.set(next, label);
      doc.propose(
        commitMachineHistory(latest, next),
        { reason: "edit", label },
        { onAccept: meta.onAccept && (() => meta.onAccept!(next)) },
      );
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editable, notify, controlled],
  );
  const undo = () => {
    const h = doc.latest();
    if (!h.past.length) return;
    const what = describedBy.current.get(h.present);
    const say = what ? `Undid ${what}` : "Undid the last change";
    doc.propose(
      undoMachineHistory(h),
      { reason: "undo", ...(what ? { label: what } : {}) },
      { onAccept: () => setAnnouncement(say) },
    );
  };
  const redo = () => {
    const h = doc.latest();
    if (!h.future.length) return;
    const next = redoMachineHistory(h);
    const what = describedBy.current.get(next.present);
    const say = what ? `Redid ${what}` : "Redid the change";
    doc.propose(
      next,
      { reason: "redo", ...(what ? { label: what } : {}) },
      { onAccept: () => setAnnouncement(say) },
    );
  };
  const historyApi = React.useRef({ undo });
  historyApi.current = { undo };

  /* ── Layout: ELK (cached by structure) + pinned positions + measured hints ── */
  const [requestedDirection, setRequestedDirection] = React.useState<MachineDirection | "auto">(
    options.defaultDirection ?? "auto",
  );
  const [direction, setResolvedDirection] = React.useState<MachineDirection>("LR");
  const viewport = React.useRef(
    compact ? { width: 390, height: 640 } : { width: 960, height: 600 },
  );
  const [layout, setLayout] = React.useState<MachineGraphLayout | null>(null);
  const [layoutVersion, setLayoutVersion] = React.useState(0);
  const [layoutError, setLayoutError] = React.useState<string | null>(null);
  const layoutEngine = React.useMemo(
    () => createMachineLayoutEngine(options.layoutWorker),
    [options.layoutWorker?.enabled, options.layoutWorker?.createWorker],
  );
  React.useEffect(() => () => layoutEngine.dispose(), [layoutEngine]);
  const [hints, setHints] = React.useState<MachineSizeHints>(() => new Map());
  const elkCache = React.useRef(
    new Map<string, MachineGraphLayout & { direction: MachineDirection }>(),
  );
  /** Set by tools that should end with an animated fit once their layout lands. */
  const fitPending = React.useRef<"instant" | "animate" | null>("instant");

  const hostRef = React.useRef(host);
  hostRef.current = host;
  const viewportFor = () => {
    const measured = hostRef.current.measureViewport?.();
    const v = measured && measured.width > 0 && measured.height > 0 ? measured : viewport.current;
    return compact ? { width: Math.min(v.width, 480), height: Math.max(v.height, 560) } : v;
  };
  React.useEffect(() => {
    let live = true;
    const structure = structureKey(graph);
    const hintKey = JSON.stringify(
      [...hints].filter(([id]) => graph.nodes.some((n) => n.id === id)),
    );
    const keyFor = (dir: string) => `${dir}|${compact ? "stack" : "wide"}|${hintKey}|${structure}`;
    const finish = (raw: MachineGraphLayout & { direction: MachineDirection }) => {
      if (!live) return;
      setLayoutError(null);
      setResolvedDirection(raw.direction);
      // Auto picks once; afterwards the orientation is stable across edits.
      if (requestedDirection === "auto") setRequestedDirection(raw.direction);
      setLayout(applyPinnedPositions(raw, graph));
      setLayoutVersion((v) => v + 1);
    };
    const cached = elkCache.current.get(keyFor(requestedDirection));
    if (cached) finish(cached);
    else
      layoutMachineAuto(graph, requestedDirection, viewportFor(), hints, {
        stackRegions: compact,
        engine: layoutEngine,
      })
        .then((raw) => {
          const cache = elkCache.current;
          cache.set(keyFor(requestedDirection), raw);
          cache.set(keyFor(raw.direction), raw);
          while (cache.size > 24) cache.delete(cache.keys().next().value!);
          finish(raw);
        })
        .catch((error) => {
          if (live) setLayoutError(error instanceof Error ? error.message : "Layout failed");
        });
    return () => {
      live = false;
    };
  }, [graph, requestedDirection, hints, compact, layoutEngine]);

  /** The canvas reports natural content heights; differences > 1px re-run layout once. */
  const reportHeights = React.useCallback(
    (entries: readonly { id: string; height: number }[]) => {
      setHints((current) => {
        let next: Map<string, { key: string; height: number }> | null = null;
        for (const { id, height } of entries) {
          const node = graph.nodes.find((n) => n.id === id);
          if (!node) continue;
          const key = contentKey(node);
          const prev = current.get(id);
          if (prev && prev.key === key && Math.abs(prev.height - height) <= 1) continue;
          next ??= new Map(current);
          next.set(id, { key, height: Math.ceil(height) });
        }
        return next ?? current;
      });
    },
    [graph],
  );

  const pinnedIds = graph.nodes.filter((n) => n.position).map((n) => n.id);
  const unpin = (): MachineCommand[] =>
    latestGraph()
      .nodes.filter((n) => n.position)
      .map((n) => ({ type: "update-node", machineId, id: n.id, patch: { position: undefined } }));
  /** Explicit reset: drop every manual position in one undo step, then fit. */
  const autoLayout = () => {
    fitPending.current = "animate";
    const commands = unpin();
    if (!commands.length) {
      setLayoutVersion((v) => v + 1);
      return;
    }
    const count = commands.length;
    run(commands, {
      onAccept: () =>
        notify({ message: `Auto layout restored ${plural(count, "moved state")}`, undo: true }),
    });
  };
  /** Orientation is view state; flipping it also drops manual positions (an edit), so read-only views flip only an unpinned layout. */
  const setDirection = (next: MachineDirection) => {
    fitPending.current = "animate";
    const commands = unpin();
    if (commands.length) {
      if (!editable) return;
      run(commands);
    }
    setRequestedDirection(next);
  };

  /* ── Simulation (shared hook) + view concerns ── */
  const sim = useMachineSimulation(document, graph, runtime);
  const [blocked, setBlocked] = React.useState<readonly BlockedEvent[]>([]);
  /** Context and payload captured per trace sequence, so a step can show what changed. */
  const steps = React.useRef(
    new Map<
      number,
      { context: Readonly<Record<string, unknown>>; payload?: unknown; timestamp?: number }
    >(),
  );
  const pendingPayload = React.useRef<unknown>(undefined);
  /** A finished scenario's verdict rides along with its last step's announcement (it lands in the same tick). */
  const scenarioVerdict = React.useRef<string | null>(null);
  const snapshot = sim.snapshot;
  /** What a fresh run (Simulate, Restart, a scenario) leads its first announcement with; null while none is starting. */
  const startLead = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!snapshot) return;
    const entry = snapshot.trace.at(-1);
    if (!entry || steps.current.has(entry.sequence)) return;
    steps.current.set(entry.sequence, {
      context: snapshot.context,
      payload: pendingPayload.current,
      timestamp: Date.now(),
    });
    pendingPayload.current = undefined;
    const lead = startLead.current;
    startLead.current = null;
    // A step after the start, or the start itself (said once, naming the state it starts in).
    if (snapshot.trace.length < 2 && lead === null) return;
    const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
    const verdict = scenarioVerdict.current;
    scenarioVerdict.current = null;
    // Leaves only: "now in Connected and Settings ready", not every active ancestor.
    const leaves = entry.activeIds
      .filter(
        (id) => !entry.activeIds.some((other) => other !== id && isAncestor(graph, id, other)),
      )
      .map(label);
    const done = snapshot.status === "done";
    // An eventless step is caused by whatever came before it: the event that settled into it, or
    // the start itself (a machine that begins through an initial pseudo-state). One shared sentence
    // for each (machine-copy), the same words Machine Tree says.
    const cause = snapshot.trace.findLast((e) => e.event)?.event;
    const head =
      !cause || cause === "@start"
        ? describeStart(leaves, done, lead && lead !== START ? lead : undefined)
        : describeSend(cause, leaves, done);
    announce(`${head}${verdict ? `. ${verdict}` : ""}`);
  }, [snapshot, graph, announce]);
  React.useEffect(() => {
    if (!snapshot) return;
    announce(
      sim.cursor === null
        ? "Back to the live state"
        : `Viewing step ${sim.cursor + 1} of ${snapshot.trace.length}`,
    );
    // Only the cursor moving should announce.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sim.cursor]);

  const resetRun = () => {
    scenarioVerdict.current = null;
    steps.current = new Map();
    pendingPayload.current = undefined;
    setBlocked([]);
  };
  const start = () => {
    resetRun();
    // Said by the trace effect once the run's first frame lands: "Simulation started — now in Draft".
    startLead.current = START;
    sim.start();
    setModeState("simulate");
  };
  const stop = () => {
    sim.stop();
    resetRun();
    setModeState(options.inspectionSession ? "inspect" : "design");
    announce(
      options.inspectionSession
        ? "Simulation stopped. Inspection mode."
        : "Simulation stopped. Design mode.",
    );
  };
  const setMode = (next: MachineMode) => {
    if (next === mode) return;
    if (next === "simulate") start();
    else {
      sim.stop();
      resetRun();
      setModeState(next);
    }
  };

  /** Why `type` did not move `before`. Guards are opaque host functions, so the copy never guesses which input they read. */
  const explainBlock = (type: string, before: MachineSnapshot | null, payload?: unknown) => {
    return explainMachineEvent(graph, before, { type, payload }, runtime);
  };
  const [previewType, setPreviewType] = React.useState<string | null>(null);
  const previewCache = React.useMemo(
    () => new Map<string, MachineEventPreview | undefined>(),
    [snapshot, sim.payload, document, runtime],
  );
  const previewEvent = (type: string | null) => {
    if (mode !== "simulate" || !snapshot || sim.cursor !== null || !sim.payload.ok)
      return setPreviewType(null);
    if (type && !previewCache.has(type))
      previewCache.set(
        type,
        previewMachineEvent(document, snapshot, { type, payload: sim.payload.value }, runtime),
      );
    setPreviewType(type);
  };
  React.useEffect(() => setPreviewType(null), [snapshot, sim.payload, mode, sim.cursor]);
  const preview = previewType ? previewCache.get(previewType) : undefined;
  const recordBlock = (
    type: string,
    before: MachineSnapshot | null,
    payload: unknown,
    source: "manual" | "scenario",
  ) => {
    const reason = explainBlock(type, before, payload);
    const after = before?.trace.at(-1)?.sequence ?? 0;
    setBlocked((list) => [
      ...list,
      { after, event: type, reason, ...(payload !== undefined ? { payload } : {}) },
    ]);
    // A scenario's blocks are part of its result (badge, trace rows, verdict), not an alarm.
    if (source === "scenario") return;
    const sentence = describeBlocked(type, reason);
    notify({ message: sentence, tone: "warning" });
    announce(sentence);
  };

  const sendEvent = (type: string) => {
    if (!sim.snapshot) return null;
    if (!sim.payload.ok) {
      notify({ message: `${sim.payload.error}. Fix it to send ${type}.`, tone: "error" });
      announce(`${type} not sent: payload is not valid JSON`);
      return null;
    }
    const payload = sim.payload.value;
    const before = sim.snapshot;
    pendingPayload.current = payload;
    const result = sim.send(type);
    if (result && !result.changed) {
      pendingPayload.current = undefined;
      recordBlock(type, before, payload, "manual");
    }
    return result;
  };
  const [scenarioResults, setScenarioResults] = React.useState<
    Readonly<Record<string, ScenarioOutcome>>
  >({});
  const [traceRequest, setTraceRequest] = React.useState(0);
  const scenarioToken = React.useRef(0);
  React.useEffect(() => {
    scenarioToken.current++;
    return () => {
      scenarioToken.current++;
    };
  }, [document, graph.id]);
  // Results describe the document they ran against: any edit makes them stale.
  React.useEffect(() => setScenarioResults({}), [document]);
  const playScenario = async (scenario: MachineScenario) => {
    const token = ++scenarioToken.current;
    resetRun();
    setModeState("simulate");
    setScenarioResults(({ [scenario.id]: _stale, ...rest }) => rest);
    // Said with the scenario's first frame: "Playing scenario Happy path — now in Draft".
    startLead.current = `Playing scenario ${scenario.label}`;
    // Every step reports here, refusals included, so a scenario block reads exactly like a manual one.
    const onStep = (step: ScenarioStep) => {
      if (step.changed) pendingPayload.current = step.payload;
      else recordBlock(step.event, step.before, step.payload, "scenario");
    };
    const result = await sim.playScenario(scenario, onStep);
    if (token !== scenarioToken.current) return;
    if (!result) {
      setScenarioResults((current) =>
        current[scenario.id]
          ? current
          : { ...current, [scenario.id]: { cancelled: true, blocked: 0, activeIds: [] } },
      );
      return;
    }
    const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
    const ended = result.activeIds.map(label).join(", ");
    setScenarioResults((current) => ({
      ...current,
      [scenario.id]: {
        passed: result.passed,
        blocked: result.blocked.length,
        activeIds: result.activeIds,
        expectedActiveIds: scenario.expectedActiveIds,
        result,
        blockedReasons: result.blocked.map(
          (step) =>
            `Step ${step.index + 1}: ${step.event} — ${explainBlock(step.event, step.before, step.payload)}`,
        ),
      },
    }));
    const blockedNote = result.blocked.length ? `, ${result.blocked.length} blocked` : "";
    const missing = (scenario.expectedActiveIds ?? [])
      .filter((id) => !result.activeIds.includes(id))
      .map(label)
      .join(", ");
    const verdict =
      result.passed === undefined
        ? `Scenario ${scenario.label} finished in ${ended}${blockedNote}.`
        : result.passed
          ? `Scenario ${scenario.label} passed: ended in ${ended}${blockedNote}.`
          : `Scenario ${scenario.label} failed: expected ${missing}, ended in ${ended}.`;
    // Said now (covers a scenario whose last step was refused) and again with the last step's
    // own announcement, which React commits after this line.
    scenarioVerdict.current = result.steps.at(-1)?.changed ? verdict : null;
    announce(verdict);
    if (result.passed === false)
      notify({
        message: `Scenario “${scenario.label}” failed · expected ${missing}, ended in ${ended}`,
        tone: "error",
      });
  };

  /**
   * "Run all": every scenario headless and instant through the shared runner (same steps and
   * pass rule as an animated run), so the live simulation is untouched.
   */
  const runAllScenarios = () => {
    scenarioToken.current++;
    const list = options.scenarios ?? [];
    if (!list.length) return;
    const next: Record<string, ScenarioOutcome> = {};
    for (const scenario of list) {
      const result = runMachineScenario(document, graph.id, scenario, runtime);
      next[scenario.id] = {
        ...(result.passed !== undefined ? { passed: result.passed } : {}),
        blocked: result.blocked.length,
        activeIds: result.activeIds,
        expectedActiveIds: scenario.expectedActiveIds,
        result,
        blockedReasons: result.blocked.map(
          (step) =>
            `Step ${step.index + 1}: ${step.event} — ${explainBlock(step.event, step.before, step.payload)}`,
        ),
      };
    }
    setScenarioResults(next);
    const checked = Object.values(next).filter((r) => r.passed !== undefined);
    const failed = checked.filter((r) => !r.passed).length;
    announce(
      `Ran ${plural(list.length, "scenario")}: ${checked.length - failed} of ${checked.length} passed${failed ? `, ${failed} failed` : ""}.`,
    );
  };

  /* ── Machines ── */
  const leaveMachine = () => {
    if (sim.snapshot) stop();
    setSelection(null);
    setRenaming(null);
    setRequestedDirection(options.defaultDirection ?? "auto");
    fitPending.current = "instant";
  };
  const openMachine = (id: string) => {
    const machine = document.machines.find((m) => m.id === id);
    if (!machine || id === machineId) return;
    leaveMachine();
    setPath((current) => [...current, id]);
    announce(
      `Opened ${machine.label}, ${plural(countStates(machine), "state")}. Breadcrumb leads back to ${graph.label}.`,
    );
  };
  const goToMachine = (index: number) => {
    if (index === path.length - 1) return;
    leaveMachine();
    setPath((current) => current.slice(0, index + 1));
  };
  const switchMachine = (id: string) => {
    if (id === machineId) return;
    leaveMachine();
    setPath(pathTo(document, id));
  };

  /* ── High-level editing helpers ── */
  const deleteSelection = () => {
    if (!selection || mode !== "design") return false;
    const graph = latestGraph();
    const label = (id: string) => graph.nodes.find((n) => n.id === id)?.label ?? id;
    if (selection.type === "node") {
      // Gone already in a proposal in flight (Delete pressed twice before a slow echo): nothing to do.
      const node = graph.nodes.find((n) => n.id === selection.id);
      if (!node) return false;
      const doomed = new Set([node.id]);
      for (let grew = true; grew;) {
        grew = false;
        for (const n of graph.nodes)
          if (n.parentId && doomed.has(n.parentId) && !doomed.has(n.id)) {
            doomed.add(n.id);
            grew = true;
          }
      }
      const edges = graph.transitions.filter(
        (t) => doomed.has(t.sourceId) || doomed.has(t.targetId),
      ).length;
      // "Deleted “Review”", "… and 4 transitions", "…, 3 nested states and 2 transitions".
      const parts = [
        doomed.size > 1 ? plural(doomed.size - 1, "nested state") : "",
        edges ? plural(edges, "transition") : "",
      ].filter(Boolean);
      const extra =
        parts.length === 2
          ? `, ${parts[0]} and ${parts[1]}`
          : parts.length
            ? ` and ${parts[0]}`
            : "";
      return run(
        { type: "delete-node", machineId, id: node.id },
        {
          onAccept: () => {
            setSelection(null);
            notify({ message: `Deleted “${node.label}”${extra}`, undo: true });
            announce(`Deleted ${node.label}`);
          },
        },
      );
    }
    const t = graph.transitions.find((x) => x.id === selection.id);
    if (!t) return false;
    return run(
      { type: "delete-transition", machineId, id: t.id },
      {
        onAccept: () => {
          setSelection(null);
          notify({
            message: `Deleted ${t.event || "always"}: ${label(t.sourceId)} → ${label(t.targetId)}`,
            undo: true,
          });
          announce(`Deleted transition ${t.event || "always"}`);
        },
      },
    );
  };
  /**
   * Moves `id` (and its subtree) into `parentId` (undefined = machine root) as ONE undo step.
   * The moved subtree's manual positions, and any pins already inside the destination, are
   * dropped so ELK places the node inside its new parent and sizes the container around it.
   * Warns (with Undo) when the move turns a transition into a parent→descendant one or leaves
   * the old container without an initial state.
   */
  const reparent = (id: string, parentId: string | undefined) => {
    const graph = latestGraph();
    const node = graph.nodes.find((n) => n.id === id);
    if (!node || node.parentId === parentId || node.kind === "note") return false;
    const subtree = new Set([id]);
    for (let grew = true; grew;) {
      grew = false;
      for (const n of graph.nodes)
        if (n.parentId && subtree.has(n.parentId) && !subtree.has(n.id)) {
          subtree.add(n.id);
          grew = true;
        }
    }
    if (parentId && subtree.has(parentId)) return false;
    const host = parentId ? graph.nodes.find((n) => n.id === parentId) : undefined;
    const commands: MachineCommand[] = [{ type: "reparent-node", machineId, id, parentId }];
    const hostHasInitial =
      host &&
      (host.initialId || graph.nodes.some((n) => n.parentId === host.id && n.kind === "initial"));
    if (host?.kind === "compound" && !hostHasInitial && node.kind !== "initial")
      commands.push({ type: "update-node", machineId, id: host.id, patch: { initialId: id } });
    for (const n of graph.nodes) {
      if (!n.position) continue;
      const inDestination =
        parentId !== undefined && n.id !== parentId && isAncestor(graph, parentId, n.id);
      if (subtree.has(n.id) || inDestination)
        commands.push({ type: "update-node", machineId, id: n.id, patch: { position: undefined } });
    }
    // What this move breaks, computed against the document before it.
    const oldOwner = node.parentId ? graph.nodes.find((n) => n.id === node.parentId) : undefined;
    const orphaned = oldOwner
      ? oldOwner.kind === "compound" && oldOwner.initialId === id
      : graph.initialId === id && parentId !== undefined;
    const into = host?.label ?? graph.label;
    return run(commands, {
      onAccept: (proposed) => {
        const next = proposed.machines.find((m) => m.id === machineId);
        if (!next) return;
        const newlyNested = next.transitions.filter(
          (t) => isNestedTransition(next, t) && !isNestedTransition(graph, t),
        );
        const warnings = [
          ...newlyNested.map(
            (t) =>
              `${t.event || "always"} now ${isAncestor(next, t.sourceId, t.targetId) ? "enters its own child" : "leaves to its own container"}`,
          ),
          orphaned ? `${oldOwner?.label ?? graph.label} has no initial state` : "",
        ].filter(Boolean);
        notify({
          message: `Moved “${node.label}” into ${into}${warnings.length ? ` · ${warnings.join(" · ")}` : ""}`,
          undo: true,
          ...(warnings.length ? { tone: "warning" as const } : {}),
        });
        announce(
          `Moved ${node.label} into ${into}.${warnings.length ? ` Warning: ${warnings.join(". ")}.` : ""}`,
        );
      },
    });
  };
  /** Adds a state after `fromId` (same parent) joined by a fresh NEXT event, then renames it inline. One undo step. */
  const addConnected = (fromId: string) => {
    const graph = latestGraph();
    const node = graph.nodes.find((n) => n.id === fromId);
    if (
      !node ||
      mode !== "design" ||
      node.kind === "final" ||
      node.kind === "note" ||
      node.kind === "initial"
    )
      return false;
    const next = freshId("atomic");
    // Free event names come from the latest proposal: a second press before the echo gets NEXT_2.
    const taken = new Set(
      graph.transitions.filter((t) => t.sourceId === fromId).map((t) => t.event),
    );
    let event = "NEXT";
    for (let i = 2; taken.has(event); i++) event = `NEXT_${i}`;
    const commands: MachineCommand[] = [
      {
        type: "add-node",
        machineId,
        node: {
          id: next,
          label: "New state",
          kind: "atomic",
          ...(node.parentId ? { parentId: node.parentId } : {}),
        },
      },
      {
        type: "add-transition",
        machineId,
        transition: { id: freshId("t"), sourceId: fromId, targetId: next, event },
      },
    ];
    // Selected, renamed and announced only once the host has the new state (a late echo
    // would otherwise select a node that does not exist yet, and a veto would still say "Added").
    return run(commands, {
      label: `add a state after ${node.label}`,
      onAccept: () => {
        setSelection({ type: "node", id: next });
        setRenaming(next);
        announce(`Added New state after ${node.label}, connected by ${event}. Type a name.`);
      },
    });
  };
  const canReset = document !== initialDocument && !sameDocument(document, initialDocument);
  const resetDocument = () => {
    if (!canReset) return;
    if (sim.snapshot) stop();
    setSelection(null);
    setPath([initialDocument.rootId]);
    fitPending.current = "animate";
    describedBy.current.set(initialDocument, "reset");
    doc.propose(
      commitMachineHistory(doc.latest(), initialDocument),
      { reason: "reset", label: "reset" },
      { onAccept: () => notify({ message: "Reset to the original document", undo: true }) },
    );
  };

  return {
    document,
    graph,
    machineId,
    machines: document.machines,
    path,
    openMachine,
    goToMachine,
    switchMachine,
    mode,
    setMode,
    selection,
    setSelection,
    renaming,
    setRenaming,
    focusRequest,
    requestFocus,
    revealRequest,
    reveal,
    announcement,
    announce,
    // layout
    direction,
    setDirection,
    autoLayout,
    pinnedCount: pinnedIds.length,
    /** Canvas size hint for automatic orientation. */
    viewport,
    layout,
    layoutVersion,
    layoutError,
    fitPending,
    reportHeights,
    // document
    issues,
    run,
    /** The machine to build a command from (includes proposals in flight). Event handlers only. */
    latestGraph,
    /** A node/transition/machine id unused in the latest document. */
    freshId,
    undo,
    redo,
    compact,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
    canReset,
    /** True when the host controls the document (see `MachineDocumentProps`). */
    controlled,
    /** Proposals still waiting for a controlled host's answer. */
    pendingChanges: doc.pending,
    /** Bumps whenever a change is refused (an invalid command or a host veto): fields showing the refused text resync. */
    refusals: doc.refusals + invalidCount,
    resetDocument,
    deleteSelection,
    reparent,
    addConnected,
    editable,
    canEdit,
    inspection,
    presentation: options.presentation,
    notify,
    // simulation
    sim,
    snapshot,
    start,
    stop,
    sendEvent,
    explainEvent: (type: string) =>
      explainBlock(type, snapshot, sim.payload.ok ? sim.payload.value : undefined),
    cursor: sim.cursor,
    setCursor: sim.setCursor,
    frame:
      mode === "inspect"
        ? inspection.frame?.machineId === machineId && !inspection.mismatch
          ? {
              activeIds: inspection.frame.activeIds,
              transitionIds: inspection.frame.transitionIds ?? [],
            }
          : null
        : sim.frame,
    activeSet:
      mode === "inspect"
        ? inspection.frame?.machineId === machineId
          ? inspection.activeSet
          : new Set<string>()
        : sim.activeSet,
    leafIds:
      mode === "inspect"
        ? inspection.frame?.machineId === machineId
          ? inspection.leafIds
          : new Set<string>()
        : sim.leafIds,
    candidates: sim.candidates,
    scenarios: options.scenarios ?? [],
    playScenario,
    runAllScenarios,
    inspectScenario: (outcome: ScenarioOutcome) => {
      if (!outcome.result) return;
      resetRun();
      for (const step of outcome.result.steps) {
        if (!steps.current.has(step.before.sequence))
          steps.current.set(step.before.sequence, { context: step.before.context });
        if (step.changed)
          steps.current.set(step.after.sequence, {
            context: step.after.context,
            payload: step.payload,
            timestamp: step.timestamp,
          });
      }
      const failed = outcome.result.steps.findIndex(
        (step) => !step.changed || step.after.status === "error",
      );
      sim.inspectScenario(outcome.result, failed < 0 ? outcome.result.steps.length - 1 : failed);
      setModeState("simulate");
      setTraceRequest((n) => n + 1);
    },
    traceRequest,
    scenarioResults,
    playing: sim.playing,
    blocked,
    steps,
    preview,
    previewEvent,
  };
}

export type MachineViewController = ReturnType<typeof useMachineView>;
export type { DocumentChangeMeta, DocumentChangeReason } from "./controlled-document.js";

/** A short past-tense-ready description of a command batch, for "Undid …" announcements. */
function describeCommands(list: readonly MachineCommand[], before: MachineDocument): string {
  const first = list[0];
  if (!first) return "the last change";
  const machine =
    "machineId" in first ? before.machines.find((m) => m.id === first.machineId) : undefined;
  const name = (id: string) => machine?.nodes.find((n) => n.id === id)?.label ?? id;
  const event = (id: string) => machine?.transitions.find((t) => t.id === id)?.event || "always";
  switch (first.type) {
    case "add-node":
      return `add ${first.node.label}`;
    case "delete-node":
      return `delete ${name(first.id)}`;
    case "reparent-node":
      return `move ${name(first.id)}`;
    case "update-node":
      return "position" in first.patch && Object.keys(first.patch).length === 1
        ? first.patch.position
          ? `move ${name(first.id)}`
          : `auto layout`
        : `edit ${name(first.id)}`;
    case "add-transition":
      return `add ${first.transition.event || "always"}`;
    case "delete-transition":
      return `delete ${event(first.id)}`;
    case "update-transition":
      return `edit ${event(first.id)}`;
    case "add-machine":
      return list[1]?.type === "add-node"
        ? `add ${list[1].node.label}`
        : `add ${first.machine.label}`;
    default:
      return "the last change";
  }
}
