"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { Button } from "@base-ui/react/button";
import {
  applyMachineCommand,
  createMachineSnapshot,
  compareMachineInspectionContexts,
  searchMachineDocument,
  getEnabledMachineTransitions,
  layoutMachineGraph,
  parseMachineDocument,
  sendMachineEvent,
  serializeMachineDocument,
  validateMachineDocument,
} from "../core/machine/index.js";
import type {
  MachineCommand,
  MachineDirection,
  MachineDocument,
  MachineGraph,
  MachineInspectionFrame,
  MachineInspectionSession,
  MachineIssue,
  MachineLayoutNode,
  MachineNode,
  MachineNodeKind,
  MachineRuntimeOptions,
  MachineSnapshot,
  MachineTransition,
} from "../core/machine/types.js";

export type MachineViewMode = "edit" | "simulate" | "inspect";
export interface MachineViewChange {
  readonly reason: string;
  readonly command?: MachineCommand;
}
export interface MachineNodeRenderContext {
  readonly selected: boolean;
  readonly active: boolean;
  readonly readOnly: boolean;
  readonly openMachine: (id: string) => void;
}
export interface MachineViewProps {
  /** Controlled document. Changes are proposals until the host supplies the next value. */
  readonly value?: MachineDocument;
  readonly defaultValue?: MachineDocument;
  readonly onChange?: (document: MachineDocument, change: MachineViewChange) => void;
  readonly readOnly?: boolean;
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly selectedIds?: readonly string[];
  readonly defaultSelectedIds?: readonly string[];
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  readonly mode?: MachineViewMode;
  readonly defaultMode?: MachineViewMode;
  readonly onModeChange?: (mode: MachineViewMode) => void;
  readonly defaultMachineId?: string;
  readonly onMachineChange?: (machineId: string) => void;
  readonly defaultDirection?: MachineDirection;
  /** Fit once when a machine opens. Subsequent edits preserve the viewport. */
  readonly autoFit?: boolean;
  readonly runtimeOptions?: MachineRuntimeOptions;
  readonly initialContext?: Readonly<Record<string, unknown>>;
  readonly onSnapshotChange?: (snapshot: MachineSnapshot) => void;
  /** Committed host observations. Inspecting a frame never executes callbacks or effects. */
  readonly inspectionFrames?: readonly MachineInspectionFrame[];
  readonly inspectionStatus?: "connected" | "disconnected" | "stale" | "gap";
  readonly inspectionSession?: MachineInspectionSession;
  /** Bounded rendered history; older frames remain host-owned. Default 500, maximum 2000. */
  readonly maxInspectionFrames?: number;
  /** Explicit opt-in for context, payloads, metadata and operational diagnostics. */
  readonly showDiagnostics?: boolean;
  /** Explicit host dispatch only. Browsing history never calls this callback. */
  readonly onDispatchEvent?: (
    actorId: string,
    event: { readonly type: string; readonly payload?: unknown },
  ) => void | Promise<void>;
  readonly renderNode?: (node: MachineNode, context: MachineNodeRenderContext) => ReactNode;
  readonly renderInspector?: (
    selection: MachineNode | MachineTransition | undefined,
    graph: MachineGraph,
  ) => ReactNode;
  readonly renderEmpty?: ReactNode;
  readonly showToolbar?: boolean;
  readonly showInspector?: boolean;
  readonly historyLimit?: number;
}

const EMPTY: MachineDocument = {
  version: 1,
  rootId: "main",
  machines: [{ id: "main", label: "Untitled machine", nodes: [], transitions: [] }],
};
const KINDS: readonly MachineNodeKind[] = [
  "atomic",
  "compound",
  "parallel",
  "initial",
  "final",
  "submachine",
  "note",
];
const KIND_LABEL: Record<MachineNodeKind, string> = {
  atomic: "State",
  compound: "Compound",
  parallel: "Parallel",
  initial: "Initial",
  final: "Final",
  submachine: "Submachine",
  note: "Note",
};
type Panel = "find" | "selection" | "runtime" | "trace" | "issues" | "data";
type History = { past: readonly MachineDocument[]; future: readonly MachineDocument[] };
type Pending = { before: MachineDocument; after: MachineDocument; history: History };
type Drag = {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
};
function diagnosticValue(value: unknown, key: string): unknown {
  if (value === null || typeof value !== "object") return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor && "value" in descriptor ? descriptor.value : undefined;
  } catch {
    return undefined;
  }
}
function displayJSON(value: unknown) {
  const seen = new WeakSet<object>();
  let entries = 0;
  function bounded(input: unknown, depth: number): unknown {
    if (++entries > 500) return "[Display truncated: entry limit]";
    if (typeof input === "string")
      return input.length > 2000 ? `${input.slice(0, 2000)}… [text truncated]` : input;
    if (typeof input === "bigint") return `${input}n`;
    if (input === null || typeof input !== "object")
      return typeof input === "function" ? "[Function omitted]" : input;
    if (seen.has(input)) return "[Circular reference]";
    if (depth >= 6) return "[Display truncated: depth limit]";
    seen.add(input);
    const result: Record<string, unknown> | unknown[] = Array.isArray(input)
      ? []
      : Object.create(null);
    const keys: string[] = [];
    let omitted = false;
    for (const key in input) {
      if (!Object.hasOwn(input, key)) continue;
      if (keys.length >= 50) {
        omitted = true;
        break;
      }
      keys.push(key);
    }
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(input, key);
      const next =
        descriptor && "value" in descriptor
          ? bounded(descriptor.value, depth + 1)
          : "[Accessor omitted]";
      if (Array.isArray(result)) result.push(next);
      else result[key] = next;
      if (entries >= 500) break;
    }
    if (omitted) {
      if (Array.isArray(result)) result.push("[Additional entries omitted]");
      else result["…"] = "Additional entries omitted";
    }
    return result;
  }
  try {
    const text = JSON.stringify(bounded(value, 0), null, 2) ?? "null";
    return text.length > 16000 ? `${text.slice(0, 16000)}\n… [display truncated]` : text;
  } catch {
    return "This value cannot be represented safely for display.";
  }
}
function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}
function isField(target: EventTarget | null) {
  return (
    target instanceof Element &&
    Boolean(target.closest("input,textarea,select,[contenteditable=true]"))
  );
}
function idFor(document: MachineDocument, prefix: string) {
  const used = new Set(
    document.machines.flatMap((graph) => [
      graph.id,
      ...graph.nodes.map((node) => node.id),
      ...graph.transitions.map((edge) => edge.id),
    ]),
  );
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}
function Glyph({ kind }: { kind: MachineNodeKind }) {
  return (
    <svg className="fux-machine__glyph" viewBox="0 0 20 20" aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="1.5">
        {kind === "initial" ? (
          <circle cx="10" cy="10" r="4" fill="currentColor" />
        ) : kind === "final" ? (
          <>
            <circle cx="10" cy="10" r="7" />
            <circle cx="10" cy="10" r="3.5" fill="currentColor" />
          </>
        ) : kind === "parallel" ? (
          <>
            <rect x="3" y="3" width="14" height="14" rx="2" />
            <path d="M10 4v12" strokeDasharray="2 2" />
          </>
        ) : kind === "compound" ? (
          <>
            <rect x="2" y="3" width="16" height="14" rx="2" />
            <rect x="6" y="8" width="8" height="5" rx="1" />
          </>
        ) : kind === "submachine" ? (
          <>
            <rect x="2" y="4" width="16" height="12" rx="2" />
            <path d="M6 9v4h8V9M10 6v5" />
          </>
        ) : kind === "note" ? (
          <>
            <path d="M4 2h8l4 4v12H4zM12 2v5h4M7 10h6M7 13h6" />
          </>
        ) : (
          <rect x="3" y="5" width="14" height="10" rx="3" />
        )}
      </g>
    </svg>
  );
}
function Control({
  children,
  label,
  pressed,
  disabled,
  onClick,
  className = "",
}: {
  children: ReactNode;
  label?: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}) {
  return (
    <Button
      className={`fux-machine__button ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
function Field({
  label,
  value,
  onChange,
  disabled,
  multiline = false,
  commitOnBlur = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  commitOnBlur?: boolean;
}) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const current = commitOnBlur ? draft : value;
  const change = (next: string) => (commitOnBlur ? setDraft(next) : onChange(next));
  return (
    <label className="fux-machine__field" htmlFor={id}>
      <span>{label}</span>
      {multiline ? (
        <textarea
          id={id}
          value={current}
          disabled={disabled}
          onChange={(event) => change(event.target.value)}
          onBlur={() => {
            if (commitOnBlur && draft !== value) onChange(draft);
          }}
          rows={3}
        />
      ) : (
        <input
          id={id}
          value={current}
          disabled={disabled}
          onChange={(event) => change(event.target.value)}
          onBlur={() => {
            if (commitOnBlur && draft !== value) onChange(draft);
          }}
        />
      )}
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <label className="fux-machine__field" htmlFor={id}>
      <span>{label}</span>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {children}
      </select>
    </label>
  );
}
function validTimestamp(timestamp: number) {
  const date = new Date(timestamp);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "Unknown";
}
function DiagnosticPanel({
  diagnostics,
}: {
  diagnostics: NonNullable<MachineInspectionSession["diagnostics"]>;
}) {
  return (
    <div className="fux-machine__diagnostics">
      {diagnostics.timers && (
        <details open>
          <summary>Timers · {diagnostics.timers.length}</summary>
          <ul>
            {diagnostics.timers.map((item) => (
              <li key={item.id}>
                <strong>{item.event ?? item.id}</strong>
                <span className="fux-machine__badge">{item.status}</span>
                {item.dueAt !== undefined && <small>Due {validTimestamp(item.dueAt)}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {diagnostics.effects && (
        <details open>
          <summary>Effect attempts · {diagnostics.effects.length}</summary>
          <ul>
            {diagnostics.effects.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span className="fux-machine__badge">
                  {item.status === "unknown" ? "Unknown outcome" : item.status}
                </span>
                <small>
                  {item.attempts ?? 0} attempts
                  {item.retryAt !== undefined ? ` · Retry ${validTimestamp(item.retryAt)}` : ""}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
      {diagnostics.tasks && (
        <details open>
          <summary>Human tasks · {diagnostics.tasks.length}</summary>
          <ul>
            {diagnostics.tasks.map((item) => (
              <li key={item.id}>
                <strong>{item.label}</strong>
                <span className="fux-machine__badge">{item.status}</span>
                {item.assignee && <small>{item.assignee}</small>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {diagnostics.messages && (
        <details>
          <summary>Actor messages · {diagnostics.messages.length}</summary>
          <ul>
            {diagnostics.messages.map((item) => (
              <li key={item.id}>
                <strong>{item.event}</strong>
                <small>
                  {item.sourceActorId ?? "External"} → {item.targetActorId}
                </small>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
function edgeGeometry(
  from: MachineLayoutNode,
  to: MachineLayoutNode,
  direction: MachineDirection,
  lane: number,
) {
  if (from.id === to.id) {
    const x = from.x + from.width;
    const y = from.y + Math.min(22, from.height / 2);
    return {
      d: `M ${x} ${y} C ${x + 90 + lane * 12} ${y - 90} ${x + 90 + lane * 12} ${y + 90} ${x} ${y + 24}`,
      x: x + 65 + lane * 12,
      y: y + 8,
    };
  }
  if (direction === "TB") {
    const x1 = from.x + from.width / 2;
    const y1 = from.y + from.height;
    const x2 = to.x + to.width / 2;
    const y2 = to.y;
    const gap = Math.max(38, Math.abs(y2 - y1) / 2) + lane * 18;
    return {
      d: `M ${x1} ${y1} C ${x1} ${y1 + gap} ${x2} ${y2 - gap} ${x2} ${y2}`,
      x: (x1 + x2) / 2 + lane * 8,
      y: (y1 + y2) / 2,
    };
  }
  const x1 = from.x + from.width;
  const y1 = from.y + Math.min(22, from.height / 2);
  const x2 = to.x;
  const y2 = to.y + Math.min(22, to.height / 2);
  const gap = Math.max(42, Math.abs(x2 - x1) / 2) + lane * 18;
  return {
    d: `M ${x1} ${y1} C ${x1 + gap} ${y1} ${x2 - gap} ${y2} ${x2} ${y2}`,
    x: (x1 + x2) / 2,
    y: (y1 + y2) / 2 + lane * 14,
  };
}

/** A graph editor and inspection surface. Runtime transport and side effects remain host-owned. */
export function MachineView(props: MachineViewProps) {
  const document = props.value ?? props.defaultValue ?? EMPTY;
  const issues = useMemo(() => validateMachineDocument(document), [document]);
  const unsafe = issues.filter((issue) =>
    [
      "invalid-document",
      "invalid-machine",
      "invalid-node",
      "invalid-node-field",
      "invalid-transition",
      "invalid-transition-field",
      "document-limit",
      "graph-limit",
      "depth-limit",
      "duplicate-id",
      "duplicate-machine",
    ].includes(issue.code),
  );
  if (unsafe.length)
    return (
      <section
        className={`fux-machine ${props.className ?? ""}`}
        style={props.style}
        aria-label={props.label ?? "Machine view"}
      >
        <div className="fux-machine__panel" role="alert">
          <h3>Invalid machine document</h3>
          <ul>
            {unsafe.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
          <p>Validate external data with parseMachineDocument before displaying it.</p>
        </div>
      </section>
    );
  return <MachineViewSurface {...props} validationIssues={issues} />;
}
function MachineViewSurface({
  value,
  defaultValue = EMPTY,
  onChange,
  readOnly = false,
  label = "Machine view",
  className = "",
  style,
  selectedIds: controlledSelection,
  defaultSelectedIds = [],
  onSelectionChange,
  mode: controlledMode,
  defaultMode = "edit",
  onModeChange,
  defaultMachineId,
  onMachineChange,
  defaultDirection = "LR",
  autoFit = true,
  runtimeOptions,
  initialContext = {},
  onSnapshotChange,
  inspectionFrames: suppliedFrames = [],
  inspectionStatus: suppliedStatus = "connected",
  inspectionSession,
  maxInspectionFrames = 500,
  showDiagnostics = false,
  onDispatchEvent,
  renderNode,
  renderInspector,
  renderEmpty,
  showToolbar = true,
  showInspector = true,
  historyLimit = 100,
  validationIssues,
}: MachineViewProps & { readonly validationIssues: readonly MachineIssue[] }) {
  const allInspectionFrames = inspectionSession?.frames ?? suppliedFrames;
  const inspectionFrames = allInspectionFrames.slice(
    -Math.max(1, Math.min(2000, Math.floor(finite(maxInspectionFrames, 500)))),
  );
  const inspectionStatus = inspectionSession?.connection ?? suppliedStatus;
  const [internal, setInternal] = useState(defaultValue);
  const document = value ?? internal;
  const initial = useRef(document);
  const [history, setHistory] = useState<History>({ past: [], future: [] });
  const previous = useRef(document);
  const pending = useRef<Pending | undefined>(undefined);
  const [selection, setSelection] = useState<readonly string[]>(defaultSelectedIds);
  const selected = controlledSelection ?? selection;
  const [localMode, setLocalMode] = useState(defaultMode);
  const mode = controlledMode ?? localMode;
  const previousMode = useRef(mode);
  const [machineId, setMachineId] = useState(defaultMachineId ?? document.rootId);
  const graph =
    document.machines.find((item) => item.id === machineId) ??
    document.machines.find((item) => item.id === document.rootId) ??
    document.machines[0];
  const [breadcrumbs, setBreadcrumbs] = useState<readonly string[]>([machineId]);
  const [direction, setDirection] = useState<MachineDirection>(defaultDirection);
  const [panel, setPanel] = useState<Panel>(
    (controlledMode ?? defaultMode) === "edit" ? "selection" : "runtime",
  );
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const inspectorVisible = showInspector && !inspectorCollapsed;
  const [announcement, setAnnouncement] = useState("");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 32, y: 32 });
  const [connecting, setConnecting] = useState<string | undefined>();
  const [drag, setDrag] = useState<Drag | undefined>();
  const dragRef = useRef<Drag | undefined>(undefined);
  const portDrag = useRef<
    { id: string; pointerId: number; x: number; y: number; moved: boolean } | undefined
  >(undefined);
  const suppressPortClick = useRef(false);
  const [connectionPoint, setConnectionPoint] = useState<{ x: number; y: number } | undefined>();
  const panDrag = useRef<
    { pointerId: number; x: number; y: number; left: number; top: number } | undefined
  >(undefined);
  const [snapshot, setSnapshot] = useState<MachineSnapshot | undefined>();
  const initialSimulation = useRef<
    { document: MachineDocument; machineId: string; snapshot: MachineSnapshot } | undefined
  >(undefined);
  const [traceCursor, setTraceCursor] = useState<number | undefined>();
  const [actorId, setActorId] = useState("");
  const [frameCursor, setCursor] = useState<string | undefined>();
  const [frameMachine, setFrameMachine] = useState<string | undefined>();
  const [dispatchPending, setDispatchPending] = useState(false);
  const dispatchLock = useRef(false);
  const [eventType, setEventType] = useState("");
  const [eventPayload, setEventPayload] = useState("");
  const [importText, setImportText] = useState("");
  const [importIssues, setImportIssues] = useState<readonly MachineIssue[]>([]);
  const [query, setQuery] = useState("");
  const [findQuery, setFindQuery] = useState("");
  const [timelineQuery, setTimelineQuery] = useState("");
  const findInput = useRef<HTMLInputElement>(null);
  const focusFindInput = useRef(false);
  const findTab = useRef<HTMLButtonElement>(null);
  const pendingSearch = useRef<
    { machineId: string; elementId: string; kind: "node" | "transition" } | undefined
  >(undefined);
  const findResults = useMemo(
    () => searchMachineDocument(document, findQuery, { maxResults: 50 }),
    [document, findQuery],
  );
  const replayRef = useRef<HTMLButtonElement>(null);
  const restoreReplayFocus = useRef(false);
  const rootRef = useRef<HTMLElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>());
  const edgeRefs = useRef(new Map<string, HTMLButtonElement>());
  const fitMachine = useRef<string | undefined>(undefined);
  const viewportTouched = useRef(false);
  const latestFit = useRef<() => void>(() => {});
  const focusAfterChange = useRef(false);
  const pendingFitDocument = useRef<MachineDocument | undefined>(undefined);
  const pendingRevealId = useRef<string | undefined>(undefined);
  const pendingIssueFocus = useRef<MachineIssue | undefined>(undefined);
  const uid = useId().replace(/:/g, "");
  const editable = mode === "edit" && !readOnly;
  const issues = useMemo(
    () => (value !== undefined ? validationIssues : validateMachineDocument(document)),
    [document, value, validationIssues],
  );
  const layout = useMemo(
    () =>
      graph ? layoutMachineGraph(graph, direction, true) : { nodes: [], width: 640, height: 360 },
    [graph, direction],
  );
  const rectangles = useMemo(() => new Map(layout.nodes.map((item) => [item.id, item])), [layout]);
  const displayRectangles = useMemo(() => {
    if (!drag || !graph) return rectangles;
    const origin = rectangles.get(drag.id);
    if (!origin) return rectangles;
    const descendants = new Set([drag.id]);
    for (let pass = 0; pass < graph.nodes.length; pass++)
      for (const node of graph.nodes)
        if (node.parentId && descendants.has(node.parentId)) descendants.add(node.id);
    return new Map(
      [...rectangles].map(([id, rect]) => [
        id,
        descendants.has(id)
          ? { ...rect, x: rect.x + drag.x - origin.x, y: rect.y + drag.y - origin.y }
          : rect,
      ]),
    );
  }, [rectangles, drag, graph]);
  const selectedNode = graph?.nodes.find((node) => selected.includes(node.id));
  const selectedEdge = selectedNode
    ? undefined
    : graph?.transitions.find((edge) => selected.includes(edge.id));
  const actorIds = [...new Set(inspectionFrames.map((frame) => frame.actorId))];
  const activeActorId = actorId || (actorIds[0] ?? "");
  const actorFrames = inspectionFrames.filter((frame) => frame.actorId === activeActorId);
  function setFrameCursor(id: string | undefined) {
    setCursor(id);
    setFrameMachine(
      id === undefined ? undefined : actorFrames.find((item) => item.id === id)?.machineId,
    );
    if (id !== undefined) setActorId(activeActorId);
  }
  const frame =
    frameCursor === undefined
      ? actorFrames[actorFrames.length - 1]
      : actorFrames.find((item) => item.id === frameCursor && item.machineId === frameMachine);
  const missingFrame = frameCursor !== undefined && !frame;
  const timelineNeedle = timelineQuery.trim().toLowerCase();
  const filteredFrames = actorFrames.filter(
    (item) =>
      !timelineNeedle ||
      [item.id, item.event?.type ?? "", item.status ?? "observed"].some((text) =>
        text.toLowerCase().includes(timelineNeedle),
      ),
  );
  const pinnedFrame = frameCursor && frame && !filteredFrames.includes(frame) ? frame : undefined;
  const previousFrame = frame
    ? actorFrames
        .slice(0, actorFrames.indexOf(frame))
        .filter((item) => item.machineId === frame.machineId)
        .at(-1)
    : undefined;
  const diagnosticContext = showDiagnostics ? diagnosticValue(frame, "context") : undefined;
  const diagnosticPayload = showDiagnostics
    ? diagnosticValue(diagnosticValue(frame, "event"), "payload")
    : undefined;
  const diagnosticMetadata = showDiagnostics ? diagnosticValue(frame, "metadata") : undefined;
  const contextComparison =
    showDiagnostics && frame
      ? compareMachineInspectionContexts(previousFrame, frame, {
          continuity:
            inspectionStatus === "gap" ? "gap" : (inspectionSession?.continuity ?? "unknown"),
        })
      : undefined;
  const traceFrame =
    traceCursor === undefined
      ? undefined
      : snapshot?.trace.find((entry) => entry.sequence === traceCursor);
  const activeIds = new Set(
    mode === "inspect"
      ? frame?.machineId === graph?.id
        ? (frame?.activeIds ?? [])
        : []
      : mode === "simulate"
        ? (traceFrame?.activeIds ?? snapshot?.activeIds ?? [])
        : [],
  );
  if (graph)
    for (let pass = 0; pass < graph.nodes.length; pass++)
      for (const node of graph.nodes)
        if (activeIds.has(node.id) && node.parentId) activeIds.add(node.parentId);
  const highlightedEdges = new Set(
    mode === "inspect"
      ? (frame?.transitionIds ?? [])
      : mode === "simulate"
        ? (traceFrame?.transitionIds ?? snapshot?.trace.at(-1)?.transitionIds ?? [])
        : [],
  );
  const enabled = useMemo(
    () =>
      snapshot && mode === "simulate"
        ? getEnabledMachineTransitions(document, snapshot, undefined, runtimeOptions)
        : [],
    [document, snapshot, mode, runtimeOptions],
  );
  const enabledEvents = [
    ...new Set(
      enabled.map((edge) => edge.event).filter((event): event is string => Boolean(event)),
    ),
  ];
  const historyCap = Math.max(1, Math.min(1000, Math.floor(finite(historyLimit, 100))));

  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      setPanel(mode === "edit" ? "selection" : "runtime");
      setInspectorCollapsed(false);
      setConnecting(undefined);
      setTraceCursor(undefined);
    }
  }, [mode]);
  useEffect(() => {
    if (previous.current === document) return;
    if (
      pending.current &&
      (pending.current.after === document ||
        serializeMachineDocument(pending.current.after) === serializeMachineDocument(document))
    )
      setHistory(pending.current.history);
    else if (value !== undefined) setHistory({ past: [], future: [] });
    pending.current = undefined;
    previous.current = document;
    setSnapshot(undefined);
    setTraceCursor(undefined);
    setConnecting(undefined);
  }, [document, value]);
  useEffect(() => {
    if (mode === "simulate" && graph && !snapshot) {
      const cached = initialSimulation.current;
      if (cached?.document === document && cached.machineId === graph.id) {
        setSnapshot(cached.snapshot);
        return;
      }
      const next = createMachineSnapshot(document, graph.id, initialContext, runtimeOptions);
      initialSimulation.current = { document, machineId: graph.id, snapshot: next };
      setSnapshot(next);
      onSnapshotChange?.(next);
    }
  }, [mode, graph, snapshot, document, initialContext, runtimeOptions, onSnapshotChange]);
  useEffect(() => {
    if (
      mode === "inspect" &&
      frame &&
      document.machines.some((item) => item.id === frame.machineId) &&
      graph?.id !== frame.machineId
    ) {
      setMachineId(frame.machineId);
      setBreadcrumbs([frame.machineId]);
    }
  }, [mode, frame, document]);

  useEffect(() => {
    if (panel === "find" && focusFindInput.current) {
      focusFindInput.current = false;
      findInput.current?.focus();
    }
  }, [panel]);
  useEffect(() => {
    const issue = pendingIssueFocus.current;
    if (issue && graph && (!issue.machineId || issue.machineId === graph.id)) {
      pendingIssueFocus.current = undefined;
      if (issue.nodeId) focusNode(issue.nodeId);
      else if (issue.transitionId) {
        const edge = graph.transitions.find((item) => item.id === issue.transitionId);
        const from = edge && rectangles.get(edge.sourceId);
        const to = edge && rectangles.get(edge.targetId);
        const view = viewportRef.current;
        if (from && to && view) {
          const point = edgeGeometry(from, to, direction, 0);
          setPan({
            x: view.clientWidth / 2 - point.x * zoom,
            y: view.clientHeight / 2 - point.y * zoom,
          });
        }
        setPanel("selection");
        edgeRefs.current.get(issue.transitionId)?.focus({ preventScroll: true });
      }
    }
  }, [graph, selected, direction, rectangles, zoom]);
  useEffect(() => {
    if (
      pendingRevealId.current &&
      graph?.nodes.some((node) => node.id === pendingRevealId.current)
    ) {
      const id = pendingRevealId.current;
      pendingRevealId.current = undefined;
      focusNode(id);
    }
    if (focusAfterChange.current) {
      focusAfterChange.current = false;
      viewportRef.current?.focus();
    }
  }, [document]);
  useEffect(() => {
    if (!graph) return;
    const committedFit =
      pendingFitDocument.current &&
      (pendingFitDocument.current === document ||
        serializeMachineDocument(pendingFitDocument.current) ===
          serializeMachineDocument(document));
    if (!committedFit && (!autoFit || fitMachine.current === graph.id)) return;
    const timer = requestAnimationFrame(() => {
      if (
        viewportRef.current &&
        viewportRef.current.clientWidth > 0 &&
        (committedFit || !viewportTouched.current)
      ) {
        fit();
        fitMachine.current = graph.id;
        pendingFitDocument.current = undefined;
      }
    });
    return () => cancelAnimationFrame(timer);
  }, [graph?.id, autoFit, document, layout]);
  useEffect(() => {
    viewportTouched.current = false;
    if (!autoFit || !viewportRef.current || typeof ResizeObserver === "undefined") return;
    let previousWidth = -1,
      previousHeight = -1;
    const observer = new ResizeObserver(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;
      const width = viewport.clientWidth,
        height = viewport.clientHeight;
      if (width === previousWidth && height === previousHeight) return;
      previousWidth = width;
      previousHeight = height;
      if (width > 0 && height > 0 && !viewportTouched.current) {
        latestFit.current();
        fitMachine.current = graph?.id;
      }
    });
    observer.observe(viewportRef.current);
    return () => observer.disconnect();
  }, [graph?.id, autoFit]);
  useEffect(() => {
    const match = pendingSearch.current;
    if (!match || match.machineId !== graph?.id) return;
    pendingSearch.current = undefined;
    viewportTouched.current = true;
    const scale = Math.max(1, zoom);
    setZoom(scale);
    const node = match.kind === "node" ? rectangles.get(match.elementId) : undefined;
    const edge =
      match.kind === "transition"
        ? graph.transitions.find((item) => item.id === match.elementId)
        : undefined;
    const from = edge && rectangles.get(edge.sourceId);
    const to = edge && rectangles.get(edge.targetId);
    const point = node
      ? { x: node.x + Math.min(node.width / 2, 128), y: node.y + 24 }
      : from && to
        ? edgeGeometry(from, to, direction, 0)
        : undefined;
    const view = viewportRef.current;
    if (point && view)
      setPan({
        x: view.clientWidth / 2 - point.x * scale,
        y: Math.min(view.clientHeight / 2, 180) - point.y * scale,
      });
    (match.kind === "node" ? nodeRefs : edgeRefs).current
      .get(match.elementId)
      ?.focus({ preventScroll: true });
  }, [graph, selected, rectangles, direction, zoom, panel]);
  useEffect(() => {
    if (panel === "runtime" && restoreReplayFocus.current) {
      restoreReplayFocus.current = false;
      replayRef.current?.focus();
    }
  }, [panel]);

  function select(ids: readonly string[]) {
    if (controlledSelection === undefined) setSelection(ids);
    onSelectionChange?.(ids);
  }
  function choose(id: string, additive = false) {
    select(
      additive
        ? selected.includes(id)
          ? selected.filter((item) => item !== id)
          : [...selected, id]
        : [id],
    );
    setPanel("selection");
  }
  function accept(
    next: MachineDocument,
    reason: string,
    command?: MachineCommand,
    nextHistory: History = { past: [...history.past, document].slice(-historyCap), future: [] },
  ) {
    if (!editable || next === document) return;
    if (value === undefined) {
      setInternal(next);
      setHistory(nextHistory);
      previous.current = next;
    } else pending.current = { before: document, after: next, history: nextHistory };
    onChange?.(next, { reason, command });
    setAnnouncement(reason);
    setSnapshot(undefined);
    setTraceCursor(undefined);
  }
  function command(commandValue: MachineCommand, reason: string) {
    if (!editable) return;
    const result = applyMachineCommand(document, commandValue);
    if (result.ok) {
      if (commandValue.type === "layout") {
        pendingFitDocument.current = result.document;
        viewportTouched.current = false;
      }
      accept(result.document, reason, commandValue);
    } else {
      setAnnouncement(result.issues.map((issue) => issue.message).join(" "));
      setImportIssues(result.issues);
      setPanel("issues");
    }
  }
  function undo() {
    const next = history.past.at(-1);
    if (!next || !editable) return;
    accept(next, "Undid last change", undefined, {
      past: history.past.slice(0, -1),
      future: [document, ...history.future],
    });
  }
  function redo() {
    const next = history.future[0];
    if (!next || !editable) return;
    accept(next, "Redid last change", undefined, {
      past: [...history.past, document],
      future: history.future.slice(1),
    });
  }
  function revealDetails(nextPanel: Panel = panel) {
    if (!showInspector) return;
    setInspectorCollapsed(false);
    setPanel(nextPanel);
  }
  function selectSearchResult(match: {
    machineId: string;
    elementId: string;
    kind: "node" | "transition";
  }) {
    pendingSearch.current = match;
    if (match.machineId !== graph?.id) openMachine(match.machineId);
    select([match.elementId]);
    setPanel("selection");
    setAnnouncement(`Selected ${match.kind} ${match.elementId} in ${match.machineId}`);
  }
  function focusSelection() {
    if (!selectedNode) return;
    const rect = rectangles.get(selectedNode.id);
    const view = viewportRef.current;
    if (!rect || !view) return;
    viewportTouched.current = true;
    const nextZoom = Math.max(1, zoom);
    setZoom(nextZoom);
    setPan({
      x: view.clientWidth / 2 - (rect.x + Math.min(rect.width / 2, 128)) * nextZoom,
      y: Math.min(view.clientHeight / 2, 180) - (rect.y + 24) * nextZoom,
    });
    nodeRefs.current.get(selectedNode.id)?.focus({ preventScroll: true });
    setAnnouncement(`Focused ${selectedNode.label} at ${Math.round(nextZoom * 100)} percent`);
  }
  function setMode(next: MachineViewMode) {
    setInspectorCollapsed(false);
    if (controlledMode === undefined) setLocalMode(next);
    onModeChange?.(next);
    setConnecting(undefined);
    setTraceCursor(undefined);
    setPanel(next === "edit" ? "selection" : "runtime");
    setAnnouncement(
      next === "inspect"
        ? "Inspecting committed host observations. No effects execute."
        : next === "simulate"
          ? "Local simulation. Document editing paused."
          : "Document editing enabled.",
    );
  }
  function openMachine(id: string, crumbIndex?: number) {
    if (!document.machines.some((item) => item.id === id)) return;
    setMachineId(id);
    setBreadcrumbs(
      crumbIndex === undefined ? [...breadcrumbs, id] : breadcrumbs.slice(0, crumbIndex + 1),
    );
    select([]);
    setConnecting(undefined);
    setSnapshot(undefined);
    setTraceCursor(undefined);
    setPan({ x: 32, y: 32 });
    setZoom(1);
    onMachineChange?.(id);
  }
  function focusNode(id: string, additive = false) {
    viewportTouched.current = true;
    choose(id, additive);
    const rect = rectangles.get(id);
    const view = viewportRef.current;
    if (rect && view)
      setPan({
        x: view.clientWidth / 2 - (rect.x + rect.width / 2) * zoom,
        y: Math.min(view.clientHeight / 2, 180) - (rect.y + 24) * zoom,
      });
    nodeRefs.current.get(id)?.focus({ preventScroll: true });
  }
  function focusIssue(issue: MachineIssue) {
    setInspectorCollapsed(false);
    pendingIssueFocus.current = issue;
    if (issue.machineId && issue.machineId !== graph?.id) openMachine(issue.machineId);
    if (issue.nodeId || issue.transitionId) select([issue.nodeId ?? issue.transitionId!]);
    setAnnouncement(issue.message);
  }
  function addNode(kind: MachineNodeKind) {
    if (!graph || !editable) return;
    const id = idFor(document, kind);
    const parentId =
      kind === "note"
        ? selectedNode?.parentId
        : selectedNode && ["compound", "parallel"].includes(selectedNode.kind)
          ? selectedNode.id
          : undefined;
    const parent = parentId ? rectangles.get(parentId) : undefined;
    const attached = kind === "note" && selectedNode?.kind !== "note" ? selectedNode : undefined;
    const attachedRect = attached ? rectangles.get(attached.id) : undefined;
    const position = attachedRect
      ? { x: attachedRect.x + attachedRect.width + 48, y: attachedRect.y }
      : parent
        ? {
            x: parent.x + 24,
            y:
              parent.y + 72 + graph.nodes.filter((node) => node.parentId === parentId).length * 128,
          }
        : { x: graph.nodes.length ? layout.width + 48 : 24, y: 24 };
    pendingRevealId.current = id;
    command(
      {
        type: "add-node",
        machineId: graph.id,
        node: {
          id,
          label: `${KIND_LABEL[kind]} ${graph.nodes.filter((node) => node.kind === kind).length + 1}`,
          kind,
          parentId,
          position,
          ...(attached ? { attachedToId: attached.id } : {}),
        },
      },
      `Added ${KIND_LABEL[kind].toLowerCase()}`,
    );
    select([id]);
    setPanel("selection");
  }
  function connect(targetId: string, sourceId = connecting) {
    if (!graph || !sourceId || !editable) return;
    const id = idFor(document, "transition");
    command(
      {
        type: "add-transition",
        machineId: graph.id,
        transition: { id, sourceId, targetId, event: "NEXT" },
      },
      "Connected states",
    );
    setConnecting(undefined);
    setConnectionPoint(undefined);
    select([id]);
    setPanel("selection");
  }
  function deleteSelection() {
    if (!editable || !graph || !selected.length) return;
    let next = document;
    for (const id of selected) {
      const currentGraph = next.machines.find((item) => item.id === graph.id)!;
      const type = currentGraph.nodes.some((node) => node.id === id)
        ? "delete-node"
        : currentGraph.transitions.some((edge) => edge.id === id)
          ? "delete-transition"
          : undefined;
      if (!type) continue;
      const result = applyMachineCommand(next, { type, machineId: graph.id, id });
      if (result.ok) next = result.document;
    }
    focusAfterChange.current = true;
    accept(next, `Deleted ${selected.length} selected item${selected.length === 1 ? "" : "s"}`);
    select([]);
    setConnecting(undefined);
  }
  function fit() {
    const view = viewportRef.current;
    if (!view) return;
    const minX = Math.min(0, ...layout.nodes.map((item) => item.x));
    const minY = Math.min(0, ...layout.nodes.map((item) => item.y));
    const width = Math.max(1, ...layout.nodes.map((item) => item.x + item.width)) - minX;
    const height = Math.max(1, ...layout.nodes.map((item) => item.y + item.height)) - minY;
    const next = Math.max(
      0.2,
      Math.min(1.25, (view.clientWidth - 64) / width, (view.clientHeight - 64) / height),
    );
    setZoom(next);
    setPan({
      x: (view.clientWidth - width * next) / 2 - minX * next,
      y: (view.clientHeight - height * next) / 2 - minY * next,
    });
  }
  latestFit.current = fit;
  function adjustZoom(factor: number) {
    viewportTouched.current = true;
    const next = Math.max(0.2, Math.min(2, zoom * factor));
    const view = viewportRef.current;
    const cx = (view?.clientWidth ?? 640) / 2;
    const cy = (view?.clientHeight ?? 360) / 2;
    setPan({ x: cx - ((cx - pan.x) * next) / zoom, y: cy - ((cy - pan.y) * next) / zoom });
    setZoom(next);
  }
  function send(type: string) {
    if (!type.trim()) {
      setAnnouncement("Enter an event type.");
      return;
    }
    let payload: unknown;
    if (eventPayload.trim()) {
      try {
        payload = JSON.parse(eventPayload);
      } catch {
        setAnnouncement("Event payload must be valid JSON.");
        return;
      }
    }
    if (mode === "inspect") {
      if (
        onDispatchEvent &&
        activeActorId &&
        frame &&
        inspectionStatus === "connected" &&
        inspectionSession?.source !== "simulation" &&
        !dispatchLock.current &&
        !frameCursor
      ) {
        dispatchLock.current = true;
        setDispatchPending(true);
        Promise.resolve()
          .then(() => onDispatchEvent(activeActorId, { type: type.trim(), payload }))
          .then(
            () =>
              setAnnouncement(
                `Requested ${type.trim()} for ${activeActorId}. Waiting for host observation.`,
              ),
            () =>
              setAnnouncement(
                "Host dispatch failed. No successful delivery or state change is assumed.",
              ),
          )
          .finally(() => {
            dispatchLock.current = false;
            setDispatchPending(false);
          });
      }
      return;
    }
    if (!snapshot || mode !== "simulate" || traceCursor !== undefined) return;
    const next = sendMachineEvent(
      document,
      snapshot,
      { type: type.trim(), payload },
      runtimeOptions,
    );
    setSnapshot(next);
    setTraceCursor(undefined);
    onSnapshotChange?.(next);
    setAnnouncement(next.error ?? `Sent ${type.trim()}. ${next.activeIds.length} active states.`);
  }
  function restart() {
    if (!graph) return;
    const next = createMachineSnapshot(document, graph.id, initialContext, runtimeOptions);
    setSnapshot(next);
    setTraceCursor(undefined);
    onSnapshotChange?.(next);
    setAnnouncement("Simulation restarted");
  }
  function nodeKey(event: KeyboardEvent<HTMLButtonElement>, node: MachineNode) {
    if (event.altKey && editable && /^Arrow/.test(event.key)) {
      event.preventDefault();
      const rect = rectangles.get(node.id);
      if (!rect || !graph) return;
      const step = event.shiftKey ? 1 : 16;
      command(
        {
          type: "move-node",
          direction,
          machineId: graph.id,
          id: node.id,
          position: {
            x: Math.max(
              0,
              rect.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0),
            ),
            y: Math.max(
              0,
              rect.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0),
            ),
          },
        },
        "Moved state",
      );
      return;
    }
    if (/^Arrow/.test(event.key)) {
      event.preventDefault();
      const origin = rectangles.get(node.id);
      if (!origin) return;
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
      const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
      const candidates = layout.nodes
        .filter(
          (item) =>
            item.id !== node.id &&
            (forward
              ? horizontal
                ? item.x > origin.x
                : item.y > origin.y
              : horizontal
                ? item.x < origin.x
                : item.y < origin.y),
        )
        .sort(
          (a, b) =>
            Math.abs(a.x - origin.x) +
            Math.abs(a.y - origin.y) -
            (Math.abs(b.x - origin.x) + Math.abs(b.y - origin.y)),
        );
      if (candidates[0]) {
        focusNode(candidates[0].id, event.shiftKey);
      }
    }
  }
  function rootKey(event: KeyboardEvent<HTMLElement>) {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return;
    if (panel === "find" && event.key === "Escape") {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      setPanel("selection");
      findTab.current?.focus();
      return;
    }
    if (
      isField(event.target) &&
      !(
        event.key === "Escape" &&
        (connecting || traceCursor !== undefined || frameCursor !== undefined)
      )
    )
      return;
    if (event.key === "Escape") {
      if (traceCursor !== undefined || frameCursor !== undefined) {
        setTraceCursor(undefined);
        setFrameCursor(undefined);
        restoreReplayFocus.current = true;
        setPanel("runtime");
        setAnnouncement("Returned to latest state without replaying actions");
      } else {
        setConnecting(undefined);
        select([]);
        setAnnouncement("Selection cleared");
      }
    }
    if (
      panel === "trace" &&
      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key) &&
      event.target instanceof Element &&
      event.target.closest("[role=tabpanel]")
    ) {
      event.preventDefault();
      const entries =
        mode === "inspect"
          ? actorFrames.map((item) => item.id)
          : (snapshot?.trace.map((item) => String(item.sequence)) ?? []);
      const current =
        mode === "inspect"
          ? frameCursor
          : traceCursor === undefined
            ? undefined
            : String(traceCursor);
      const index = current === undefined ? entries.length - 1 : entries.indexOf(current);
      const next =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? entries.length - 1
            : Math.max(
                0,
                Math.min(entries.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)),
              );
      if (entries[next]) {
        if (mode === "inspect") setFrameCursor(entries[next]);
        else setTraceCursor(Number(entries[next]));
      }
    }
    if ((event.key === "Delete" || event.key === "Backspace") && editable && selected.length) {
      event.preventDefault();
      deleteSelection();
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z" && editable) {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if (
      (event.metaKey || event.ctrlKey) &&
      event.key.toLowerCase() === "a" &&
      event.target === viewportRef.current &&
      graph
    ) {
      event.preventDefault();
      select(graph.nodes.map((node) => node.id));
    }
  }
  function startDrag(event: PointerEvent<HTMLButtonElement>, node: MachineNode) {
    if (!editable || event.button !== 0 || connecting) return;
    const rect = rectangles.get(node.id);
    if (!rect) return;
    const next = {
      id: node.id,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: rect.x,
      y: rect.y,
      moved: false,
    };
    dragRef.current = next;
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function moveDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const dx = (event.clientX - current.startX) / zoom;
    const dy = (event.clientY - current.startY) / zoom;
    if (Math.abs(dx) + Math.abs(dy) < 4 && !current.moved) return;
    const next = { ...current, moved: true };
    dragRef.current = next;
    setDrag({ ...next, x: Math.max(0, current.x + dx), y: Math.max(0, current.y + dy) });
  }
  function endDrag(event: PointerEvent<HTMLButtonElement>, canceled = false) {
    const current = dragRef.current;
    if (!current || current.pointerId !== event.pointerId) return;
    dragRef.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (!canceled && current.moved && drag && graph) {
      const moved = applyMachineCommand(document, {
        type: "move-node",
        direction,
        machineId: graph.id,
        id: current.id,
        position: { x: Math.round(drag.x), y: Math.round(drag.y) },
      });
      if (moved.ok) {
        const view = viewportRef.current?.getBoundingClientRect();
        const point = {
          x: (event.clientX - (view?.left ?? 0) - pan.x) / zoom,
          y: (event.clientY - (view?.top ?? 0) - pan.y) / zoom,
        };
        const excluded = new Set([current.id]);
        for (let pass = 0; pass < graph.nodes.length; pass++)
          for (const node of graph.nodes)
            if (node.parentId && excluded.has(node.parentId)) excluded.add(node.id);
        const target = graph.nodes
          .filter(
            (node) =>
              !excluded.has(node.id) && (node.kind === "compound" || node.kind === "parallel"),
          )
          .map((node) => ({ node, rect: rectangles.get(node.id) }))
          .filter(
            (item) =>
              item.rect &&
              point.x >= item.rect.x &&
              point.x <= item.rect.x + item.rect.width &&
              point.y >= item.rect.y + 44 &&
              point.y <= item.rect.y + item.rect.height,
          )
          .sort((a, b) => (b.rect?.depth ?? 0) - (a.rect?.depth ?? 0))[0]?.node;
        const oldParent = graph.nodes.find((node) => node.id === current.id)?.parentId;
        if (target?.id !== oldParent) {
          const reparented = applyMachineCommand(moved.document, {
            type: "reparent-node",
            machineId: graph.id,
            id: current.id,
            parentId: target?.id,
          });
          if (reparented.ok)
            accept(
              reparented.document,
              target ? `Moved state into ${target.label}` : "Moved state to machine root",
            );
          else setAnnouncement(reparented.issues.map((issue) => issue.message).join(" "));
        } else accept(moved.document, "Moved state");
      }
      select([current.id]);
    }
    setDrag(undefined);
  }
  function startPortDrag(event: PointerEvent<HTMLButtonElement>, id: string) {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    suppressPortClick.current = false;
    portDrag.current = {
      id,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      moved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }
  function movePortDrag(event: PointerEvent<HTMLButtonElement>) {
    const current = portDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    if (
      !current.moved &&
      Math.abs(event.clientX - current.x) + Math.abs(event.clientY - current.y) < 6
    )
      return;
    current.moved = true;
    setConnecting(current.id);
    const rect = viewportRef.current?.getBoundingClientRect();
    setConnectionPoint({
      x: (event.clientX - (rect?.left ?? 0) - pan.x) / zoom,
      y: (event.clientY - (rect?.top ?? 0) - pan.y) / zoom,
    });
  }
  function endPortDrag(event: PointerEvent<HTMLButtonElement>, cancelled = false) {
    const current = portDrag.current;
    if (!current || current.pointerId !== event.pointerId) return;
    portDrag.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (current.moved) {
      suppressPortClick.current = true;
      if (!cancelled && graph) {
        const view = viewportRef.current?.getBoundingClientRect();
        const x = (event.clientX - (view?.left ?? 0) - pan.x) / zoom;
        const y = (event.clientY - (view?.top ?? 0) - pan.y) / zoom;
        const target = graph.nodes
          .filter((node) => node.kind !== "note")
          .map((node) => ({ node, rect: rectangles.get(node.id) }))
          .filter(
            (item) =>
              item.rect &&
              x >= item.rect.x &&
              x <= item.rect.x + item.rect.width &&
              y >= item.rect.y &&
              y <= item.rect.y + item.rect.height,
          )
          .sort((a, b) => (b.rect?.depth ?? 0) - (a.rect?.depth ?? 0))[0]?.node;
        if (target) connect(target.id, current.id);
        else
          setAnnouncement(
            "Connection not created. Choose a destination state or Escape to cancel.",
          );
      } else setConnecting(undefined);
    }
    setConnectionPoint(undefined);
  }
  function updateNode(patch: Partial<Omit<MachineNode, "id">>) {
    if (graph && selectedNode)
      command(
        { type: "update-node", machineId: graph.id, id: selectedNode.id, patch },
        "Updated state",
      );
  }
  function updateEdge(patch: Partial<Omit<MachineTransition, "id">>) {
    if (graph && selectedEdge)
      command(
        { type: "update-transition", machineId: graph.id, id: selectedEdge.id, patch },
        "Updated transition",
      );
  }

  if (!graph)
    return (
      <section className={`fux-machine ${className}`} aria-label={label} style={style}>
        <p role="alert">
          No machine is available. Supply a document containing at least one machine.
        </p>
      </section>
    );
  const stageWidth = Math.max(layout.width + 160, 640);
  const stageHeight = Math.max(layout.height + 120, 360);
  const visibleNodes = graph.nodes.filter(
    (node) =>
      !query ||
      `${node.label} ${node.kind} ${node.tags?.join(" ") ?? ""}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const knownGuards = Object.keys(runtimeOptions?.guards ?? {});
  const replayItems =
    mode === "inspect"
      ? actorFrames.map((item) => item.id)
      : (snapshot?.trace.map((item) => String(item.sequence)) ?? []);
  const replayCurrent =
    mode === "inspect" ? frameCursor : traceCursor === undefined ? undefined : String(traceCursor);
  const replayIndex =
    replayCurrent === undefined ? replayItems.length - 1 : replayItems.indexOf(replayCurrent);
  function jumpReplay(index: number) {
    const id = replayItems[Math.max(0, Math.min(replayItems.length - 1, index))];
    if (id === undefined) return;
    if (mode === "inspect") setFrameCursor(id);
    else setTraceCursor(Number(id));
  }
  const sourceLabel =
    inspectionSession?.source === "simulation"
      ? "Simulation recording"
      : inspectionSession?.source === "live"
        ? "Live runtime observation"
        : "Committed observation";

  return (
    <section
      ref={rootRef}
      className={`fux-machine ${className}`}
      style={style}
      aria-label={label}
      data-mode={mode}
      onKeyDown={rootKey}
    >
      {showToolbar && (
        <>
          <header className="fux-machine__toolbar">
            <div className="fux-machine__identity">
              <span className="fux-machine__mark" aria-hidden="true">
                ◇
              </span>
              <div>
                <strong>{graph.label}</strong>
                <small>
                  {graph.nodes.filter((node) => node.kind !== "note").length} states ·{" "}
                  {graph.transitions.length} transitions
                </small>
              </div>
            </div>
            <div className="fux-machine__modes" role="group" aria-label="Machine mode">
              <Control pressed={mode === "edit"} onClick={() => setMode("edit")}>
                {readOnly ? "View" : "Edit"}
              </Control>
              <Control pressed={mode === "simulate"} onClick={() => setMode("simulate")}>
                Simulate
              </Control>
              <Control pressed={mode === "inspect"} onClick={() => setMode("inspect")}>
                Inspect
              </Control>
            </div>
            <div className="fux-machine__history" role="group" aria-label="Edit history">
              <Control label="Undo" disabled={!editable || !history.past.length} onClick={undo}>
                ↶
              </Control>
              <Control label="Redo" disabled={!editable || !history.future.length} onClick={redo}>
                ↷
              </Control>
              <Control
                disabled={!editable || document === initial.current}
                onClick={() => {
                  accept(initial.current, "Reset document; undo is available");
                  select([]);
                }}
              >
                Reset
              </Control>
            </div>
            {showInspector && (
              <Button
                className="fux-machine__button"
                aria-expanded={inspectorVisible}
                aria-controls={`${uid}-inspector`}
                onClick={() => setInspectorCollapsed(!inspectorCollapsed)}
              >
                {inspectorVisible ? "Hide details" : "Show details"}
              </Button>
            )}
          </header>
          <div className="fux-machine__subbar">
            <nav className="fux-machine__breadcrumbs" aria-label="Machine breadcrumb">
              {breadcrumbs.map((id, index) => (
                <span key={`${id}-${index}`}>
                  <Control
                    disabled={index === breadcrumbs.length - 1}
                    onClick={() => openMachine(id, index)}
                  >
                    {document.machines.find((item) => item.id === id)?.label ?? id}
                  </Control>
                  {index < breadcrumbs.length - 1 && <span aria-hidden="true">/</span>}
                </span>
              ))}
            </nav>
            <label className="fux-machine__inline-select">
              <span className="fux-machine__sr">Choose machine</span>
              <select
                aria-label="Choose machine"
                value={graph.id}
                onChange={(event) => {
                  setBreadcrumbs([event.target.value]);
                  setMachineId(event.target.value);
                  setSnapshot(undefined);
                  select([]);
                  onMachineChange?.(event.target.value);
                }}
                disabled={mode === "simulate"}
              >
                {document.machines.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="fux-machine__layout" role="group" aria-label="Graph layout">
              <Control
                pressed={direction === "LR"}
                disabled={!editable}
                onClick={() => {
                  setDirection("LR");
                  command(
                    { type: "layout", machineId: graph.id, direction: "LR" },
                    "Applied left-to-right layout",
                  );
                }}
              >
                Left → right
              </Control>
              <Control
                pressed={direction === "TB"}
                disabled={!editable}
                onClick={() => {
                  setDirection("TB");
                  command(
                    { type: "layout", machineId: graph.id, direction: "TB" },
                    "Applied top-to-bottom layout",
                  );
                }}
              >
                Top ↓ down
              </Control>
              <Control
                disabled={!editable}
                onClick={() =>
                  command(
                    { type: "layout", machineId: graph.id, direction },
                    "Applied automatic layout",
                  )
                }
              >
                Auto layout
              </Control>
            </div>
          </div>
        </>
      )}
      <div className="fux-machine__workspace" data-inspector={inspectorVisible || undefined}>
        <div className="fux-machine__main">
          {showToolbar && (
            <div className="fux-machine__palette" role="group" aria-label="Add state">
              {KINDS.map((kind) => (
                <Control
                  key={kind}
                  label={`Add ${KIND_LABEL[kind].toLowerCase()}`}
                  disabled={!editable}
                  onClick={() => addNode(kind)}
                >
                  <Glyph kind={kind} />
                  <span>{KIND_LABEL[kind]}</span>
                </Control>
              ))}
            </div>
          )}
          <div className="fux-machine__canvas-wrap">
            <div
              ref={viewportRef}
              className="fux-machine__viewport"
              role="region"
              aria-label="State graph"
              aria-describedby={`${uid}-instructions`}
              tabIndex={0}
              onPointerDown={(event) => {
                if (
                  event.target !== event.currentTarget &&
                  !(
                    event.target instanceof Element && event.target.hasAttribute("data-pan-surface")
                  )
                )
                  return;
                if (event.button !== 0) return;
                viewportTouched.current = true;
                panDrag.current = {
                  pointerId: event.pointerId,
                  x: event.clientX,
                  y: event.clientY,
                  left: pan.x,
                  top: pan.y,
                };
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event) => {
                const start = panDrag.current;
                if (start?.pointerId === event.pointerId)
                  setPan({
                    x: start.left + event.clientX - start.x,
                    y: start.top + event.clientY - start.y,
                  });
              }}
              onPointerUp={(event) => {
                if (panDrag.current?.pointerId === event.pointerId) {
                  panDrag.current = undefined;
                  event.currentTarget.releasePointerCapture?.(event.pointerId);
                }
              }}
              onPointerCancel={() => {
                panDrag.current = undefined;
              }}
              onKeyDown={(event) => {
                if (event.target !== event.currentTarget) return;
                if (/^Arrow/.test(event.key)) {
                  event.preventDefault();
                  viewportTouched.current = true;
                  setPan({
                    x:
                      pan.x +
                      (event.key === "ArrowLeft" ? 40 : event.key === "ArrowRight" ? -40 : 0),
                    y: pan.y + (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0),
                  });
                } else if (event.key === "+" || event.key === "=") {
                  event.preventDefault();
                  adjustZoom(1.2);
                } else if (event.key === "-") {
                  event.preventDefault();
                  adjustZoom(1 / 1.2);
                } else if (event.key === "0") {
                  event.preventDefault();
                  fit();
                }
              }}
            >
              <div
                className="fux-machine__stage"
                data-pan-surface=""
                style={{
                  width: stageWidth,
                  height: stageHeight,
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                }}
              >
                <svg
                  className="fux-machine__edges"
                  width={stageWidth}
                  height={stageHeight}
                  aria-hidden="true"
                  data-pan-surface=""
                >
                  <defs>
                    <marker
                      id={`${uid}-arrow`}
                      viewBox="0 0 10 10"
                      refX="9"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 1 1 L 9 5 L 1 9 z" fill="context-stroke" />
                    </marker>
                  </defs>
                  {graph.nodes
                    .filter((node) => node.kind === "note" && node.attachedToId)
                    .map((node) => {
                      const note = displayRectangles.get(node.id);
                      const owner = displayRectangles.get(node.attachedToId!);
                      return note && owner ? (
                        <path
                          key={`annotation-${node.id}`}
                          className="fux-machine__annotation"
                          d={`M ${owner.x + owner.width} ${owner.y + 22} L ${note.x} ${note.y + 22}`}
                        />
                      ) : null;
                    })}
                  {connecting && connectionPoint && displayRectangles.get(connecting) && (
                    <path
                      className="fux-machine__edge fux-machine__edge--pending"
                      d={`M ${displayRectangles.get(connecting)!.x + displayRectangles.get(connecting)!.width} ${displayRectangles.get(connecting)!.y + 22} L ${connectionPoint.x} ${connectionPoint.y}`}
                      markerEnd={`url(#${uid}-arrow)`}
                    />
                  )}
                  {graph.transitions.map((edge, index) => {
                    const from = displayRectangles.get(edge.sourceId);
                    const to = displayRectangles.get(edge.targetId);
                    if (!from || !to) return null;
                    const lane = graph.transitions
                      .slice(0, index)
                      .filter(
                        (item) =>
                          item.sourceId === edge.sourceId && item.targetId === edge.targetId,
                      ).length;
                    const path = edgeGeometry(from, to, direction, lane);
                    return (
                      <path
                        key={edge.id}
                        d={path.d}
                        className="fux-machine__edge"
                        data-selected={selected.includes(edge.id) || undefined}
                        data-active={highlightedEdges.has(edge.id) || undefined}
                        markerEnd={`url(#${uid}-arrow)`}
                      />
                    );
                  })}
                </svg>
                {[...graph.nodes]
                  .sort(
                    (a, b) =>
                      (rectangles.get(a.id)?.depth ?? 0) - (rectangles.get(b.id)?.depth ?? 0),
                  )
                  .map((node) => {
                    const rect = displayRectangles.get(node.id);
                    if (!rect) return null;
                    const point = rect;
                    const container = node.kind === "compound" || node.kind === "parallel";
                    const selectedState = selected.includes(node.id);
                    const active = activeIds.has(node.id);
                    return (
                      <div
                        key={node.id}
                        className="fux-machine__node"
                        data-kind={node.kind}
                        data-selected={selectedState || undefined}
                        data-active={active || undefined}
                        data-dimmed={(query && !visibleNodes.includes(node)) || undefined}
                        data-node-id={node.id}
                        style={{
                          left: point.x,
                          top: point.y,
                          width: rect.width,
                          height: rect.height,
                          zIndex: container ? rect.depth + 1 : rect.depth + 3,
                        }}
                      >
                        <button
                          type="button"
                          className="fux-machine__node-label"
                          ref={(element) => {
                            if (element) nodeRefs.current.set(node.id, element);
                            else nodeRefs.current.delete(node.id);
                          }}
                          aria-label={`${KIND_LABEL[node.kind]}: ${node.label}${active ? ", active" : ""}`}
                          aria-pressed={selectedState}
                          onClick={(event) => {
                            if (connecting) connect(node.id);
                            else choose(node.id, event.shiftKey || event.metaKey || event.ctrlKey);
                          }}
                          onKeyDown={(event) => nodeKey(event, node)}
                          onDoubleClick={() => {
                            if (node.kind === "submachine" && node.machineId)
                              openMachine(node.machineId);
                          }}
                          onPointerDown={(event) => startDrag(event, node)}
                          onPointerMove={moveDrag}
                          onPointerUp={(event) => endDrag(event)}
                          onPointerCancel={(event) => endDrag(event, true)}
                        >
                          <Glyph kind={node.kind} />
                          <span>{node.label}</span>
                          {active && (
                            <span className="fux-machine__active-dot" aria-hidden="true" />
                          )}
                        </button>
                        {renderNode ? (
                          <div className="fux-machine__node-body">
                            {renderNode(node, {
                              selected: selectedState,
                              active,
                              readOnly: !editable,
                              openMachine,
                            })}
                          </div>
                        ) : (
                          !container &&
                          node.kind !== "initial" &&
                          node.kind !== "final" && (
                            <div className="fux-machine__node-body fux-machine__node-body--summary">
                              <span className="fux-machine__kind">{KIND_LABEL[node.kind]}</span>
                              {node.description && <p>{node.description}</p>}
                              {Boolean(node.entry?.length) && (
                                <small>entry / {node.entry!.join(", ")}</small>
                              )}
                              {Boolean(node.exit?.length) && (
                                <small>exit / {node.exit!.join(", ")}</small>
                              )}
                              {Boolean(node.tags?.length) && (
                                <div className="fux-machine__tags">
                                  {node.tags!.map((tag) => (
                                    <span key={tag}>{tag}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        )}
                        {node.kind === "submachine" && node.machineId && (
                          <button
                            type="button"
                            className="fux-machine__open"
                            onClick={() => openMachine(node.machineId!)}
                            aria-label={`Open submachine ${node.label}`}
                          >
                            Open machine ↗
                          </button>
                        )}
                        {editable && node.kind !== "note" && (
                          <>
                            <button
                              type="button"
                              className="fux-machine__port fux-machine__port--out"
                              aria-label={`Connect from ${node.label}`}
                              aria-pressed={connecting === node.id}
                              onPointerDown={(event) => startPortDrag(event, node.id)}
                              onPointerMove={movePortDrag}
                              onPointerUp={(event) => endPortDrag(event)}
                              onPointerCancel={(event) => endPortDrag(event, true)}
                              onClick={() => {
                                if (suppressPortClick.current) {
                                  suppressPortClick.current = false;
                                  return;
                                }
                                setConnecting(connecting === node.id ? undefined : node.id);
                                select([node.id]);
                                setAnnouncement(
                                  `Choose a destination for ${node.label}, or press Escape to cancel.`,
                                );
                              }}
                            >
                              <span />
                            </button>
                            {connecting && (
                              <button
                                type="button"
                                className="fux-machine__port fux-machine__port--in"
                                aria-label={`Connect to ${node.label}`}
                                onClick={() => connect(node.id)}
                              >
                                <span />
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                {graph.transitions.map((edge, index) => {
                  const from = displayRectangles.get(edge.sourceId);
                  const to = displayRectangles.get(edge.targetId);
                  if (!from || !to) return null;
                  const lane = graph.transitions
                    .slice(0, index)
                    .filter(
                      (item) => item.sourceId === edge.sourceId && item.targetId === edge.targetId,
                    ).length;
                  const path = edgeGeometry(from, to, direction, lane);
                  return (
                    <button
                      type="button"
                      key={edge.id}
                      ref={(element) => {
                        if (element) edgeRefs.current.set(edge.id, element);
                        else edgeRefs.current.delete(edge.id);
                      }}
                      className="fux-machine__edge-label"
                      style={{ left: path.x, top: path.y }}
                      aria-label={`Transition ${edge.event || "automatic"} from ${graph.nodes.find((node) => node.id === edge.sourceId)?.label ?? edge.sourceId} to ${graph.nodes.find((node) => node.id === edge.targetId)?.label ?? edge.targetId}`}
                      aria-pressed={selected.includes(edge.id)}
                      data-active={highlightedEdges.has(edge.id) || undefined}
                      onClick={(event) => choose(edge.id, event.shiftKey)}
                    >
                      <span>{edge.event || "always"}</span>
                      {edge.guard && <small>[{edge.guard}]</small>}
                      {Boolean(edge.actions?.length) && <small>/ {edge.actions!.join(", ")}</small>}
                    </button>
                  );
                })}
              </div>
              {!graph.nodes.length && (
                <div className="fux-machine__empty">
                  {renderEmpty ?? (
                    <>
                      <span aria-hidden="true">◇</span>
                      <h3>A machine starts with a state</h3>
                      <p>
                        {editable
                          ? "Add a state above, then connect it to another. Every edit can be undone."
                          : "This machine does not contain any states."}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
            {connecting && (
              <div className="fux-machine__connection-hint" role="status">
                Choose a destination state
                <Control onClick={() => setConnecting(undefined)}>Cancel</Control>
              </div>
            )}
            {(selectedNode || selectedEdge) && (
              <div
                className="fux-machine__selection-tools"
                role="group"
                aria-label="Selection view"
              >
                {selectedNode && <Control onClick={focusSelection}>Focus selection</Control>}
                {showInspector && !inspectorVisible && (
                  <Control
                    label="Show selection details"
                    onClick={() => revealDetails("selection")}
                  >
                    Details
                  </Control>
                )}
              </div>
            )}
            <div
              className="fux-machine__canvas-controls"
              role="group"
              aria-label="Canvas navigation"
            >
              <Control label="Zoom out" disabled={zoom <= 0.2} onClick={() => adjustZoom(1 / 1.2)}>
                −
              </Control>
              <output aria-label="Zoom level">{Math.round(zoom * 100)}%</output>
              <Control label="Zoom in" disabled={zoom >= 2} onClick={() => adjustZoom(1.2)}>
                +
              </Control>
              <Control
                onClick={() => {
                  viewportTouched.current = false;
                  fit();
                }}
              >
                Fit
              </Control>
              <Control
                label="Reset canvas view"
                onClick={() => {
                  viewportTouched.current = true;
                  setZoom(1);
                  setPan({ x: 32, y: 32 });
                }}
              >
                1:1
              </Control>
            </div>
            <div className="fux-machine__canvas-caption">
              {mode === "edit"
                ? readOnly
                  ? "Read-only document"
                  : "Drag to move · select to inspect"
                : mode === "simulate"
                  ? traceFrame
                    ? `Simulation history · step ${traceFrame.sequence}`
                    : "Local simulation · editing paused"
                  : missingFrame
                    ? "Historical observation unavailable"
                    : frameCursor
                      ? `Historical ${sourceLabel.toLowerCase()}`
                      : `Latest ${sourceLabel.toLowerCase()}`}
            </div>
          </div>
          <details className="fux-machine__outline">
            <summary>State list & keyboard controls</summary>
            <p id={`${uid}-instructions`}>
              Tab to states. Arrow keys move between states. Shift-click selects several. Alt +
              arrow moves a state; add Shift for one-pixel steps. Delete removes selection. Command
              or Control + Z undoes. Escape cancels a connection. Focus the canvas to pan with
              arrows, zoom with +/−, or fit with 0.
            </p>
            <Field label="Find state" value={query} onChange={setQuery} />
            <ul>
              {visibleNodes.map((node) => (
                <li
                  key={node.id}
                  style={{ paddingInlineStart: `${(rectangles.get(node.id)?.depth ?? 0) * 12}px` }}
                >
                  <Control pressed={selected.includes(node.id)} onClick={() => focusNode(node.id)}>
                    <Glyph kind={node.kind} />
                    {node.label}
                    {activeIds.has(node.id) && <span className="fux-machine__badge">active</span>}
                  </Control>
                </li>
              ))}
            </ul>
          </details>
        </div>
        {showInspector && (
          <aside
            id={`${uid}-inspector`}
            className="fux-machine__inspector"
            aria-label="Machine inspector"
            hidden={!inspectorVisible}
          >
            <div className="fux-machine__tabs" role="tablist" aria-label="Inspector panels">
              {(
                [
                  ["selection", "Selection"],
                  ["find", "Find"],
                  ["runtime", "Runtime"],
                  ["trace", "Trace"],
                  ["issues", `Issues ${issues.length + importIssues.length}`],
                  ["data", "Data"],
                ] as const
              ).map(([id, name], index, tabs) => (
                <button
                  type="button"
                  role="tab"
                  ref={id === "find" ? findTab : undefined}
                  id={`${uid}-tab-${id}`}
                  aria-selected={panel === id}
                  aria-controls={`${uid}-panel-${id}`}
                  tabIndex={panel === id ? 0 : -1}
                  key={id}
                  onClick={() => {
                    if (id === "find") {
                      if (panel === "find") findInput.current?.focus();
                      else focusFindInput.current = true;
                    }
                    setPanel(id);
                  }}
                  onKeyDown={(event) => {
                    let next = index;
                    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
                    else if (event.key === "ArrowLeft")
                      next = (index + tabs.length - 1) % tabs.length;
                    else if (event.key === "Home") next = 0;
                    else if (event.key === "End") next = tabs.length - 1;
                    else return;
                    event.preventDefault();
                    setPanel(tabs[next]![0]);
                    (
                      event.currentTarget.parentElement?.children[next] as HTMLElement | undefined
                    )?.focus();
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div
              className="fux-machine__panel"
              role="tabpanel"
              id={`${uid}-panel-${panel}`}
              aria-labelledby={`${uid}-tab-${panel}`}
              tabIndex={0}
            >
              {panel === "find" && (
                <div className="fux-machine__find">
                  <h3>Find state or transition</h3>
                  <p className="fux-machine__hint">
                    Search topology across all machines. Private observation data is never searched.
                    Enter selects the first result; Escape closes Find.
                  </p>
                  {mode === "simulate" && (
                    <p className="fux-machine__hint">
                      Opening another graph clears this local simulation and replay; host
                      observations are unchanged.
                    </p>
                  )}
                  <div className="fux-machine__find-field">
                    <label htmlFor={`${uid}-find`}>Find state or transition</label>
                    <input
                      id={`${uid}-find`}
                      ref={findInput}
                      type="search"
                      onKeyDown={(event) => {
                        if (
                          event.defaultPrevented ||
                          event.nativeEvent.isComposing ||
                          event.altKey ||
                          event.ctrlKey ||
                          event.metaKey ||
                          event.shiftKey
                        )
                          return;
                        if (event.key === "Enter") {
                          event.preventDefault();
                          const match = findResults[0];
                          if (match) selectSearchResult(match);
                        }
                      }}
                      value={findQuery}
                      onChange={(event) => setFindQuery(event.target.value)}
                    />
                  </div>
                  <p role="status">
                    {findQuery.trim()
                      ? `${findResults.length} results${findResults.length === 50 ? " (limit 50; refine your search)" : ""}`
                      : "Enter a state or transition name or ID."}
                  </p>
                  {findQuery.trim() && !findResults.length && <p>No topology matches.</p>}
                  <ul className="fux-machine__search-results">
                    {findResults.map((match) => (
                      <li key={JSON.stringify([match.machineId, match.kind, match.elementId])}>
                        <Control onClick={() => selectSearchResult(match)}>
                          <span>{match.label}</span>
                          <small>
                            {match.machineId} · {match.kind} · {match.elementId}
                          </small>
                        </Control>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {panel === "selection" && (
                <>
                  {renderInspector?.(selectedNode ?? selectedEdge, graph)}
                  {selectedNode ? (
                    <>
                      <div className="fux-machine__panel-heading">
                        <Glyph kind={selectedNode.kind} />
                        <h3>{KIND_LABEL[selectedNode.kind]}</h3>
                        <code>{selectedNode.id}</code>
                      </div>
                      <Field
                        label="State name"
                        value={selectedNode.label}
                        disabled={!editable}
                        onChange={(label) => updateNode({ label })}
                      />
                      <SelectField
                        label="State kind"
                        value={selectedNode.kind}
                        disabled={!editable}
                        onChange={(kind) => updateNode({ kind: kind as MachineNodeKind })}
                      >
                        {KINDS.map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </option>
                        ))}
                      </SelectField>
                      <Field
                        label="Description"
                        value={selectedNode.description ?? ""}
                        multiline
                        disabled={!editable}
                        onChange={(description) => updateNode({ description })}
                      />
                      <SelectField
                        label="Parent state"
                        value={selectedNode.parentId ?? ""}
                        disabled={!editable}
                        onChange={(parentId) =>
                          command(
                            {
                              type: "reparent-node",
                              machineId: graph.id,
                              id: selectedNode.id,
                              parentId: parentId || undefined,
                            },
                            "Changed parent state",
                          )
                        }
                      >
                        <option value="">Machine root</option>
                        {graph.nodes
                          .filter(
                            (node) =>
                              node.id !== selectedNode.id &&
                              ["compound", "parallel"].includes(node.kind),
                          )
                          .map((node) => (
                            <option value={node.id} key={node.id}>
                              {node.label}
                            </option>
                          ))}
                      </SelectField>
                      {selectedNode.kind === "note" && (
                        <SelectField
                          label="Attached state"
                          value={selectedNode.attachedToId ?? ""}
                          disabled={!editable}
                          onChange={(attachedToId) =>
                            updateNode({ attachedToId: attachedToId || undefined })
                          }
                        >
                          <option value="">Standalone note</option>
                          {graph.nodes
                            .filter((node) => node.kind !== "note")
                            .map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.label}
                              </option>
                            ))}
                        </SelectField>
                      )}
                      {["compound", "parallel"].includes(selectedNode.kind) && (
                        <SelectField
                          label="Initial child"
                          value={selectedNode.initialId ?? ""}
                          disabled={!editable || selectedNode.kind === "parallel"}
                          onChange={(initialId) =>
                            updateNode({ initialId: initialId || undefined })
                          }
                        >
                          <option value="">Use initial marker or first state</option>
                          {graph.nodes
                            .filter(
                              (node) => node.parentId === selectedNode.id && node.kind !== "note",
                            )
                            .map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.label}
                              </option>
                            ))}
                        </SelectField>
                      )}
                      {selectedNode.kind === "submachine" && (
                        <>
                          <SelectField
                            label="Referenced machine"
                            value={selectedNode.machineId ?? ""}
                            disabled={!editable}
                            onChange={(machineId) =>
                              updateNode({ machineId: machineId || undefined })
                            }
                          >
                            <option value="">Choose a machine</option>
                            {document.machines
                              .filter((item) => item.id !== graph.id)
                              .map((item) => (
                                <option key={item.id} value={item.id}>
                                  {item.label}
                                </option>
                              ))}
                          </SelectField>
                          {selectedNode.machineId && (
                            <Control onClick={() => openMachine(selectedNode.machineId!)}>
                              Open referenced machine ↗
                            </Control>
                          )}
                          <p className="fux-machine__hint">
                            The local simulator treats a submachine as an opaque state. Send its
                            outcome event explicitly.
                          </p>
                        </>
                      )}
                      <Field
                        label="Entry actions (comma separated)"
                        key={`${selectedNode.id}-entry`}
                        commitOnBlur
                        value={selectedNode.entry?.join(", ") ?? ""}
                        disabled={!editable}
                        onChange={(text) =>
                          updateNode({
                            entry: text
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <Field
                        label="Exit actions (comma separated)"
                        key={`${selectedNode.id}-exit`}
                        commitOnBlur
                        value={selectedNode.exit?.join(", ") ?? ""}
                        disabled={!editable}
                        onChange={(text) =>
                          updateNode({
                            exit: text
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <Field
                        label="Tags (comma separated)"
                        key={`${selectedNode.id}-tags`}
                        commitOnBlur
                        value={selectedNode.tags?.join(", ") ?? ""}
                        disabled={!editable}
                        onChange={(text) =>
                          updateNode({
                            tags: text
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      <div className="fux-machine__coordinate-fields">
                        {(["x", "y"] as const).map((axis) => (
                          <label className="fux-machine__field" key={axis}>
                            <span>Position {axis.toUpperCase()}</span>
                            <input
                              type="number"
                              min={0}
                              step={16}
                              disabled={!editable}
                              value={Math.round(rectangles.get(selectedNode.id)?.[axis] ?? 0)}
                              onChange={(event) => {
                                const rect = rectangles.get(selectedNode.id);
                                if (rect && Number.isFinite(event.target.valueAsNumber))
                                  command(
                                    {
                                      type: "move-node",
                                      direction,
                                      machineId: graph.id,
                                      id: selectedNode.id,
                                      position: {
                                        x: rect.x,
                                        y: rect.y,
                                        [axis]: Math.max(0, event.target.valueAsNumber),
                                      },
                                    },
                                    "Moved state",
                                  );
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      <Control
                        disabled={!editable || selectedNode.kind === "note"}
                        onClick={() => {
                          setConnecting(selectedNode.id);
                          setAnnouncement("Choose a destination state");
                        }}
                      >
                        Connect to another state
                      </Control>
                    </>
                  ) : selectedEdge ? (
                    <>
                      <div className="fux-machine__panel-heading">
                        <h3>Transition</h3>
                        <code>{selectedEdge.id}</code>
                      </div>
                      <Field
                        label="Event"
                        value={selectedEdge.event ?? ""}
                        disabled={!editable}
                        onChange={(event) => updateEdge({ event })}
                      />
                      <p className="fux-machine__hint">
                        An empty event is automatic. Guards are names resolved by the host, never
                        executable expressions.
                      </p>
                      <Field
                        label="Guard"
                        value={selectedEdge.guard ?? ""}
                        disabled={!editable}
                        onChange={(guard) => updateEdge({ guard: guard || undefined })}
                      />
                      {selectedEdge.guard && (
                        <p className="fux-machine__hint">
                          {knownGuards.includes(selectedEdge.guard)
                            ? "Resolved by a supplied guard callback."
                            : "Unresolved guard: disabled during local simulation."}
                        </p>
                      )}
                      <Field
                        label="Actions (comma separated)"
                        key={`${selectedEdge.id}-actions`}
                        commitOnBlur
                        value={selectedEdge.actions?.join(", ") ?? ""}
                        disabled={!editable}
                        onChange={(text) =>
                          updateEdge({
                            actions: text
                              .split(",")
                              .map((item) => item.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                      {(["sourceId", "targetId"] as const).map((key) => (
                        <SelectField
                          key={key}
                          label={key === "sourceId" ? "Source state" : "Target state"}
                          value={selectedEdge[key]}
                          disabled={!editable}
                          onChange={(id) => updateEdge({ [key]: id })}
                        >
                          {graph.nodes
                            .filter((node) => node.kind !== "note")
                            .map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.label}
                              </option>
                            ))}
                        </SelectField>
                      ))}
                      {mode === "simulate" && (
                        <div className="fux-machine__transition-event">
                          <Control
                            disabled={
                              !selectedEdge.event ||
                              !enabled.some((edge) => edge.id === selectedEdge.id) ||
                              traceCursor !== undefined
                            }
                            onClick={() => send(selectedEdge.event ?? "")}
                          >
                            {selectedEdge.event
                              ? `Send ${selectedEdge.event}`
                              : "Automatic transition"}
                          </Control>
                          <p className="fux-machine__hint">
                            {!selectedEdge.event
                              ? "Automatic transitions are settled by the simulator, not manually forced."
                              : !enabled.some((edge) => edge.id === selectedEdge.id)
                                ? "Not currently enabled: the source may be inactive or its guard unresolved or false."
                                : "Send this event to the whole active configuration. Priority and guards choose the transition; this edge is not forced."}
                          </p>
                        </div>
                      )}
                      <Field
                        label="Transition description"
                        value={selectedEdge.description ?? ""}
                        disabled={!editable}
                        multiline
                        onChange={(description) => updateEdge({ description })}
                      />
                      <label className="fux-machine__check">
                        <input
                          type="checkbox"
                          checked={selectedEdge.internal ?? false}
                          disabled={!editable}
                          onChange={(event) => updateEdge({ internal: event.target.checked })}
                        />
                        Internal transition
                      </label>
                    </>
                  ) : (
                    <>
                      <h3>Inspect the machine</h3>
                      <p>
                        Select a state or transition on the canvas. Use the state list for a
                        keyboard-friendly overview.
                      </p>
                      <Field
                        label="Machine name"
                        value={graph.label}
                        disabled={!editable}
                        onChange={(label) =>
                          command(
                            { type: "update-machine", machineId: graph.id, patch: { label } },
                            "Renamed machine",
                          )
                        }
                      />
                      <SelectField
                        label="Initial state"
                        value={graph.initialId ?? ""}
                        disabled={!editable}
                        onChange={(initialId) =>
                          command(
                            {
                              type: "update-machine",
                              machineId: graph.id,
                              patch: { initialId: initialId || undefined },
                            },
                            "Changed initial state",
                          )
                        }
                      >
                        <option value="">Use initial marker or first state</option>
                        {graph.nodes
                          .filter((node) => !node.parentId && node.kind !== "note")
                          .map((node) => (
                            <option key={node.id} value={node.id}>
                              {node.label}
                            </option>
                          ))}
                      </SelectField>
                      <Control
                        disabled={!editable}
                        onClick={() => {
                          const id = idFor(document, "machine");
                          command(
                            {
                              type: "add-machine",
                              machine: { id, label: "New machine", nodes: [], transitions: [] },
                            },
                            "Added machine",
                          );
                        }}
                      >
                        Add machine
                      </Control>
                    </>
                  )}
                  {selected.length > 0 && (
                    <div className="fux-machine__selection-actions">
                      <span>{selected.length} selected</span>
                      <Control
                        disabled={!editable}
                        onClick={deleteSelection}
                        className="fux-machine__danger"
                      >
                        Delete selection
                      </Control>
                      <Control onClick={() => select([])}>Clear selection</Control>
                    </div>
                  )}
                </>
              )}
              {panel === "runtime" && (
                <>
                  <h3>{mode === "inspect" ? sourceLabel : "Local simulation"}</h3>
                  {mode === "edit" ? (
                    <>
                      <p>
                        Explore event-driven behavior without changing the graph. Pure host
                        callbacks resolve named guards and context actions.
                      </p>
                      <Control onClick={() => setMode("simulate")}>Start simulation</Control>
                    </>
                  ) : mode === "simulate" ? (
                    <>
                      <div className="fux-machine__runtime-status">
                        <span className="fux-machine__badge">{snapshot?.status ?? "starting"}</span>
                        <span>Step {snapshot?.sequence ?? 0}</span>
                        <Control onClick={restart}>Restart</Control>
                      </div>
                      {snapshot?.error && <p role="alert">{snapshot.error}</p>}
                      <h4>Active states</h4>
                      <ul className="fux-machine__active-list">
                        {snapshot?.activeIds.map((id) => (
                          <li key={id}>
                            <Control onClick={() => focusNode(id)}>
                              {graph.nodes.find((node) => node.id === id)?.label ?? id}
                            </Control>
                          </li>
                        ))}
                      </ul>
                      <h4>Available events</h4>
                      {enabledEvents.length ? (
                        <div className="fux-machine__event-buttons">
                          {enabledEvents.map((event) => (
                            <Control
                              key={event}
                              onClick={() => send(event)}
                              disabled={Boolean(traceFrame)}
                            >
                              {event}
                            </Control>
                          ))}
                        </div>
                      ) : (
                        <p className="fux-machine__hint">
                          No enabled named event. Unknown guards remain disabled.
                        </p>
                      )}
                      {traceFrame && (
                        <p className="fux-machine__hint">
                          You are inspecting a past step. Return to the latest step to send events.
                        </p>
                      )}
                      <button
                        ref={replayRef}
                        type="button"
                        className="fux-machine__button"
                        disabled={!snapshot?.trace.length}
                        onClick={() => {
                          setPanel("trace");
                          setTraceCursor(snapshot?.trace[0]?.sequence);
                        }}
                      >
                        Replay recorded steps
                      </button>
                      {showDiagnostics ? (
                        <details>
                          <summary>Context</summary>
                          <pre>{displayJSON(snapshot?.context ?? initialContext)}</pre>
                        </details>
                      ) : (
                        <p className="fux-machine__hint">
                          Context is hidden. The host can explicitly enable diagnostics.
                        </p>
                      )}
                      <p className="fux-machine__hint">
                        A bounded local model, not a production runtime. No timers, network calls or
                        effects execute. Submachines accept explicit outcome events.
                      </p>
                    </>
                  ) : (
                    <>
                      {inspectionFrames.length < allInspectionFrames.length && (
                        <p className="fux-machine__hint">
                          Showing the latest {inspectionFrames.length} of{" "}
                          {allInspectionFrames.length} host observations. Older frames are not
                          mounted.
                        </p>
                      )}
                      {missingFrame && (
                        <p role="alert">
                          The selected historical observation is no longer available. Return to
                          latest to continue; no newer observation has been substituted.
                        </p>
                      )}
                      <p className="fux-machine__connection-state" data-status={inspectionStatus}>
                        <span aria-hidden="true">●</span> {inspectionStatus} ·{" "}
                        {inspectionSession?.source ?? "committed"} history
                      </p>
                      {!frame && !missingFrame && activeActorId && (
                        <p role="status">
                          Selected actor {activeActorId} is unavailable: no retained observation.
                        </p>
                      )}
                      {actorIds.length ? (
                        <>
                          <SelectField
                            label="Actor"
                            value={activeActorId}
                            onChange={(id) => {
                              setActorId(id);
                              setFrameCursor(undefined);
                            }}
                          >
                            {actorId && !actorIds.includes(actorId) && (
                              <option value={actorId}>{actorId} (unavailable)</option>
                            )}
                            {actorIds.map((id) => {
                              const latest = inspectionFrames
                                .filter((item) => item.actorId === id)
                                .at(-1);
                              return (
                                <option value={id} key={id}>
                                  {latest?.parentActorId ? "↳ " : ""}
                                  {id}
                                </option>
                              );
                            })}
                          </SelectField>
                          {frame && (
                            <>
                              <dl className="fux-machine__facts">
                                <dt>Status</dt>
                                <dd>{frame.status ?? "unknown"}</dd>
                                <dt>Observation</dt>
                                <dd>{frame.id}</dd>
                                <dt>Machine</dt>
                                <dd>{frame.machineId}</dd>
                                <dt>Timestamp</dt>
                                <dd>
                                  {Number.isFinite(frame.timestamp)
                                    ? validTimestamp(frame.timestamp)
                                    : "Unknown"}
                                </dd>
                                <dt>Parent actor</dt>
                                <dd>{frame.parentActorId ?? "Root actor"}</dd>
                                {frame.sequence !== undefined && (
                                  <>
                                    <dt>Frame sequence</dt>
                                    <dd>{frame.sequence}</dd>
                                  </>
                                )}
                                {inspectionSession?.sequence !== undefined && (
                                  <>
                                    <dt>Session sequence</dt>
                                    <dd>{inspectionSession.sequence}</dd>
                                  </>
                                )}
                                {inspectionSession?.cursor && (
                                  <>
                                    <dt>Session cursor</dt>
                                    <dd>{inspectionSession.cursor}</dd>
                                  </>
                                )}
                                {inspectionSession?.continuity && (
                                  <>
                                    <dt>Continuity</dt>
                                    <dd>{inspectionSession.continuity}</dd>
                                  </>
                                )}
                              </dl>
                              {inspectionSession?.lastRejected && (
                                <p className="fux-machine__hint" role="status">
                                  Rejected observation {inspectionSession.lastRejected.frameId}:{" "}
                                  {inspectionSession.lastRejected.reason}. The displayed state was
                                  not replaced.
                                </p>
                              )}
                              {inspectionSession?.hasUnsequencedFrames && (
                                <p className="fux-machine__hint">
                                  Some observations have no source sequence; continuity is not
                                  established.
                                </p>
                              )}
                              {showDiagnostics ? (
                                <>
                                  <details open>
                                    <summary>Context</summary>
                                    {diagnosticContext === undefined ? (
                                      <p>Context unavailable for this observation.</p>
                                    ) : (
                                      <pre>{displayJSON(diagnosticContext)}</pre>
                                    )}
                                  </details>
                                  <details open>
                                    <summary>Observed event payload</summary>
                                    {diagnosticPayload === undefined ? (
                                      <p>Event payload unavailable for this observation.</p>
                                    ) : (
                                      <pre>{displayJSON(diagnosticPayload)}</pre>
                                    )}
                                  </details>
                                  <details open>
                                    <summary>Context comparison</summary>
                                    <p>
                                      Before: {previousFrame?.id ?? "Unavailable"} · After:{" "}
                                      {frame.id}
                                    </p>
                                    <p className="fux-machine__hint">
                                      Previous retained observation for the same actor and machine.
                                      Differences do not establish event causality.
                                    </p>
                                    {contextComparison?.warnings.map((warning, index) => (
                                      <p key={index}>{warning}</p>
                                    ))}
                                    {contextComparison?.status === "available" ? (
                                      <>
                                        {!contextComparison.entries.length && (
                                          <p>
                                            {contextComparison.truncated ||
                                            contextComparison.warnings.some((warning) =>
                                              /unsupported|accessor/i.test(warning),
                                            )
                                              ? "Comparison incomplete; complete equality is not established."
                                              : "No context differences in the supported values compared."}
                                          </p>
                                        )}
                                        <ul className="fux-machine__context-diff">
                                          {contextComparison.entries.map((entry, index) => (
                                            <li key={index}>
                                              <strong>
                                                {entry.path || "Context root"} · {entry.kind}
                                              </strong>
                                              <pre>
                                                Before: {entry.before}
                                                {"\n"}After: {entry.after}
                                              </pre>
                                            </li>
                                          ))}
                                        </ul>
                                        {contextComparison.truncated && (
                                          <p>
                                            Comparison truncated; not all differences are shown.
                                          </p>
                                        )}
                                      </>
                                    ) : (
                                      <p>Context comparison unavailable.</p>
                                    )}
                                  </details>
                                  <details>
                                    <summary>Runtime metadata</summary>
                                    {diagnosticMetadata === undefined ? (
                                      <p>Runtime metadata unavailable for this observation.</p>
                                    ) : (
                                      <pre>{displayJSON(diagnosticMetadata)}</pre>
                                    )}
                                  </details>
                                  {inspectionSession?.diagnostics && (
                                    <DiagnosticPanel diagnostics={inspectionSession.diagnostics} />
                                  )}
                                </>
                              ) : (
                                <p className="fux-machine__hint">
                                  Topology only. Private context and operational diagnostics are
                                  hidden unless the host explicitly enables them.
                                </p>
                              )}
                              <p className="fux-machine__hint">
                                {sourceLabel}. The source is supplied by the host; replay does not
                                re-execute it. Host data may include timers, effect attempts,
                                retries, human tasks and delivery state; the viewer does not execute
                                them.
                              </p>
                            </>
                          )}
                        </>
                      ) : (
                        <p>
                          No inspection frames supplied. Connect an authorized host adapter through
                          the inspectionFrames prop.
                        </p>
                      )}
                    </>
                  )}
                  {mode !== "edit" && (
                    <form
                      className="fux-machine__event-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        send(eventType);
                      }}
                    >
                      <h4>{mode === "inspect" ? "Explicit host request" : "Send an event"}</h4>
                      <Field
                        label="Event type"
                        value={eventType}
                        onChange={setEventType}
                        disabled={mode === "inspect" && !onDispatchEvent}
                      />
                      <Field
                        label="Event payload (JSON, optional)"
                        multiline
                        value={eventPayload}
                        onChange={setEventPayload}
                        disabled={mode === "inspect" && !onDispatchEvent}
                      />
                      <Button
                        type="submit"
                        className="fux-machine__button"
                        disabled={
                          !eventType.trim() ||
                          (mode === "simulate" && Boolean(traceFrame)) ||
                          (mode === "inspect" &&
                            (!onDispatchEvent ||
                              !activeActorId ||
                              !frame ||
                              Boolean(frameCursor) ||
                              dispatchPending ||
                              inspectionStatus !== "connected" ||
                              inspectionSession?.source === "simulation"))
                        }
                      >
                        {mode === "inspect"
                          ? dispatchPending
                            ? "Request pending…"
                            : "Request host dispatch"
                          : "Send event"}
                      </Button>
                      {mode === "inspect" && (
                        <p className="fux-machine__hint">
                          {onDispatchEvent
                            ? !frame
                              ? "Dispatch unavailable: the selected actor has no retained observation. Select an available actor."
                              : inspectionStatus !== "connected"
                                ? `Dispatch unavailable while ${inspectionStatus}. Reconnect and establish current state first.`
                                : inspectionSession?.source === "simulation"
                                  ? "Dispatch unavailable from a simulation recording."
                                  : "Dispatch is explicit and host-owned. The graph changes only after a new observation arrives."
                            : "Read-only inspection. No dispatch callback supplied."}
                        </p>
                      )}
                    </form>
                  )}
                </>
              )}
              {panel === "trace" && (
                <>
                  <h3>{mode === "inspect" ? "Observation timeline" : "Simulation trace"}</h3>
                  <p className="fux-machine__hint">
                    Scrubbing highlights recorded states without replaying actions or effects. Arrow
                    keys step; Home and End jump; Escape returns to the unchanged latest state.
                  </p>
                  <div
                    className="fux-machine__replay-controls"
                    role="group"
                    aria-label="Replay navigation"
                  >
                    <Control
                      label="First recorded step"
                      disabled={replayIndex <= 0}
                      onClick={() => jumpReplay(0)}
                    >
                      ⇤
                    </Control>
                    <Control
                      label="Previous recorded step"
                      disabled={replayIndex <= 0}
                      onClick={() => jumpReplay(replayIndex - 1)}
                    >
                      ←
                    </Control>
                    <span>
                      {replayItems.length
                        ? `${replayIndex + 1} / ${replayItems.length}`
                        : "No steps"}
                    </span>
                    <Control
                      label="Next recorded step"
                      disabled={replayIndex >= replayItems.length - 1}
                      onClick={() => jumpReplay(replayIndex + 1)}
                    >
                      →
                    </Control>
                    <Control
                      label="Last recorded step"
                      disabled={replayIndex >= replayItems.length - 1}
                      onClick={() => jumpReplay(replayItems.length - 1)}
                    >
                      ⇥
                    </Control>
                  </div>
                  <Control
                    disabled={mode === "inspect" ? !frameCursor : traceCursor === undefined}
                    onClick={() => {
                      setFrameCursor(undefined);
                      setTraceCursor(undefined);
                    }}
                  >
                    Return to latest
                  </Control>
                  {mode === "inspect" && (
                    <div className="fux-machine__timeline-filter">
                      <Field
                        label="Filter observations by event, frame ID or status"
                        value={timelineQuery}
                        onChange={setTimelineQuery}
                      />
                      <Control disabled={!timelineQuery} onClick={() => setTimelineQuery("")}>
                        Clear observation filter
                      </Control>
                      <p role="status">
                        {filteredFrames.length} of {actorFrames.length} observations match.
                        Navigation follows all retained observations, not just matches.
                      </p>
                      {missingFrame && (
                        <p role="alert">
                          Selected observation {frameCursor} is unavailable; no newer observation
                          has been substituted.
                        </p>
                      )}
                      {pinnedFrame && (
                        <div className="fux-machine__pinned-frame">
                          <strong>Selected observation (outside filter)</strong>
                          <p>
                            {pinnedFrame.id} · {pinnedFrame.event?.type ?? "Snapshot"} ·{" "}
                            {pinnedFrame.status ?? "observed"}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  {mode === "inspect" ? (
                    filteredFrames.length ? (
                      <ol className="fux-machine__trace">
                        {filteredFrames.map((item) => (
                          <li key={item.id}>
                            <Control
                              pressed={frame?.id === item.id}
                              onClick={() => setFrameCursor(item.id)}
                            >
                              <span>{item.event?.type ?? "Snapshot"}</span>
                              <small>
                                {item.id} · {item.status ?? "observed"}
                              </small>
                            </Control>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p>
                        {actorFrames.length
                          ? "No observations match this filter."
                          : "No host observations."}
                      </p>
                    )
                  ) : snapshot?.trace.length ? (
                    <ol className="fux-machine__trace">
                      {snapshot.trace.map((entry) => (
                        <li key={entry.sequence}>
                          <Control
                            pressed={traceCursor === entry.sequence}
                            onClick={() => setTraceCursor(entry.sequence)}
                          >
                            <span>
                              <b>{entry.sequence}</b> {entry.event}
                            </span>
                            <small>
                              {entry.transitionIds.length} transitions · {entry.actions.length}{" "}
                              actions
                            </small>
                          </Control>
                          {entry.note && <p>{entry.note}</p>}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <p>Start a simulation to record local steps.</p>
                  )}
                  {traceFrame && (
                    <details open>
                      <summary>Step details</summary>
                      <pre>{displayJSON(traceFrame)}</pre>
                    </details>
                  )}
                </>
              )}
              {panel === "issues" && (
                <>
                  <h3>Validation</h3>
                  <p className="fux-machine__hint">
                    Structural issues are separate from runtime errors. Select an issue to locate
                    its state or transition.
                  </p>
                  {issues.length + importIssues.length === 0 ? (
                    <p className="fux-machine__success">No structural issues found.</p>
                  ) : (
                    <ul className="fux-machine__issues">
                      {[...issues, ...importIssues].map((issue, index) => (
                        <li key={`${issue.code}-${index}`} data-severity={issue.severity}>
                          <Control onClick={() => focusIssue(issue)}>
                            <span className="fux-machine__badge">{issue.severity}</span>
                            <span>{issue.message}</span>
                          </Control>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
              {panel === "data" && (
                <>
                  <h3>Portable document</h3>
                  <p className="fux-machine__hint">
                    JSON contains graph data, not executable code. Copy it to your own storage.
                    Imported changes can be undone.
                  </p>
                  <label className="fux-machine__field">
                    <span>Document JSON</span>
                    <textarea
                      rows={10}
                      readOnly
                      value={serializeMachineDocument(document)}
                      onFocus={(event) => event.currentTarget.select()}
                    />
                  </label>
                  <Field
                    label="Import document JSON"
                    value={importText}
                    onChange={setImportText}
                    multiline
                    disabled={!editable}
                  />
                  <Control
                    disabled={!editable || !importText.trim()}
                    onClick={() => {
                      const result = parseMachineDocument(importText);
                      setImportIssues(result.issues);
                      if (result.ok && result.document) {
                        pendingFitDocument.current = result.document;
                        accept(result.document, "Imported document");
                        setMachineId(result.document.rootId);
                        setBreadcrumbs([result.document.rootId]);
                        select([]);
                        setImportText("");
                      } else {
                        setAnnouncement("Import rejected. Review validation issues.");
                        setPanel("issues");
                      }
                    }}
                  >
                    Import document
                  </Control>
                </>
              )}
            </div>
          </aside>
        )}
      </div>
      <footer className="fux-machine__footer">
        <span>
          {mode === "edit"
            ? readOnly
              ? "Read only"
              : "Editing"
            : mode === "simulate"
              ? "Simulation"
              : "Inspection"}
        </span>
        <span>{selected.length ? `${selected.length} selected` : "Nothing selected"}</span>
        {showInspector ? (
          <button
            type="button"
            onClick={() => revealDetails("issues")}
            aria-label={`Show ${issues.length} validation issues`}
          >
            {issues.length ? `${issues.length} issues` : "✓ Valid structure"}
          </button>
        ) : (
          <span>{issues.length ? `${issues.length} issues` : "✓ Valid structure"}</span>
        )}
      </footer>
      <div
        className="fux-machine__sr"
        role="status"
        aria-label="Machine announcements"
        aria-live="polite"
        aria-atomic="true"
      >
        {announcement}
      </div>
    </section>
  );
}
