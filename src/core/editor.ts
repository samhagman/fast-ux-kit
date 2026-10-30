import {
  applyOutlineCommand,
  applyOutlineTransaction,
  findOutlineNode,
  flattenVisible,
  getOutlinePath,
  indentOutlineNode,
  moveOutlineSelection,
  outlineIds,
  outdentOutlineNode,
  parseOutlineText,
  selectionRoots,
  sameOutlineContent,
  validateOutline,
  InvalidOutlineError,
  type OutlineNode,
  type OutlineEditPolicy,
  type OutlineCommandFailure,
  type OutlineCommandResult,
  type OutlineCommand,
} from "./index.js";

/** Trusted host code owns note storage; callbacks must be pure and immutable. */
export interface OutlineNoteAdapter<T = unknown> {
  readonly read: (node: OutlineNode<T>) => string | undefined;
  readonly prepareData: (
    current: OutlineNode<T>,
    note: string,
  ) => { readonly ok: true; readonly data: T } | { readonly ok: false };
}

export interface OutlineCaret {
  /** Omitted means title; note offsets never use title length. */
  readonly field?: "note";
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
export interface OutlineSnapshot<T = unknown> {
  readonly nodes: readonly OutlineNode<T>[];
  readonly caret: OutlineCaret | null;
  readonly selection: ReadonlySet<string>;
  readonly selectionAnchor?: string | null;
}
export interface OutlineHistorySnapshot<T = unknown> extends OutlineSnapshot<T> {
  /** Applied note caret retained independently of later navigation. */
  readonly redoCaret?: OutlineCaret;
  /** Future entries retain the original pre-edit caret across intervening navigation. */
  readonly undoCaret?: OutlineCaret | null;
}
export interface OutlineHistory<T = unknown> {
  readonly past: readonly OutlineHistorySnapshot<T>[];
  readonly future: readonly OutlineHistorySnapshot<T>[];
  readonly group: { readonly id: string; readonly time: number; readonly field?: "note" } | null;
}
export interface OutlineEditorState<T = unknown> extends OutlineSnapshot<T> {
  readonly expandedIds: ReadonlySet<string>;
  readonly hoistedId: string | null;
  readonly selectionAnchor: string | null;
  readonly history: OutlineHistory<T>;
  /** Increments only when content changes, never for folding/focus/selection. */
  readonly revision: number;
  readonly focusVersion: number;
  readonly refusal: OutlineCommandFailure | null;
}
export interface OutlineEditorOptions<T = unknown> extends OutlineEditPolicy<T> {
  readonly historyLimit?: number;
  readonly typingGroupMs?: number;
  readonly noteAdapter?: OutlineNoteAdapter<T>;
  /** Refuse or explain any whole-document structural transition. */
  readonly canChange?: (
    before: readonly OutlineNode<T>[],
    after: readonly OutlineNode<T>[],
    action: OutlineAction<T>,
  ) => boolean;
  /** Required to merge a row carrying application data without losing that data. */
  readonly mergeData?: (left: OutlineNode<T>, right: OutlineNode<T>) => T;
}
export type OutlineAction<T = unknown> =
  | {
      readonly type: "transaction";
      readonly commands: readonly OutlineCommand<T>[];
      readonly caret?: OutlineCaret;
    }
  | {
      readonly type: "text";
      readonly id: string;
      readonly text: string;
      readonly caret?: number;
      readonly time?: number;
    }
  | {
      readonly type: "note";
      readonly id: string;
      readonly text: string;
      readonly caret?: number;
      readonly time?: number;
    }
  | {
      readonly type: "split";
      readonly id: string;
      readonly start: number;
      readonly end?: number;
      readonly newId: string;
    }
  | { readonly type: "merge"; readonly id: string; readonly direction: "backward" | "forward" }
  | {
      readonly type: "insert";
      readonly id: string;
      readonly afterId?: string;
      readonly text?: string;
      readonly parentId?: string | null;
      readonly index?: number;
      readonly caret?: number;
    }
  | { readonly type: "delete"; readonly ids?: readonly string[] }
  | { readonly type: "indent" | "outdent"; readonly ids?: readonly string[] }
  | { readonly type: "move"; readonly direction: "up" | "down"; readonly ids?: readonly string[] }
  | {
      readonly type: "drop";
      readonly ids: readonly string[];
      readonly parentId: string | null;
      readonly index: number;
    }
  | {
      readonly type: "paste";
      readonly id: string;
      readonly start: number;
      readonly end?: number;
      readonly text: string;
      readonly createId: () => string;
    }
  | {
      readonly type: "paste-nodes";
      readonly afterId?: string;
      readonly nodes: readonly OutlineNode<T>[];
      readonly createId: () => string;
    }
  | { readonly type: "tasks"; readonly ids: readonly string[] }
  | { readonly type: "task"; readonly id: string; readonly checked?: boolean | null }
  | { readonly type: "undo" | "redo" }
  | { readonly type: "replace"; readonly nodes: readonly OutlineNode<T>[] }
  | { readonly type: "toggle"; readonly id: string }
  | { readonly type: "expand"; readonly ids: readonly string[]; readonly expanded: boolean }
  | { readonly type: "expand-all"; readonly expanded: boolean; readonly depth?: number }
  | { readonly type: "hoist"; readonly id: string | null }
  | {
      readonly type: "caret";
      readonly field?: "note";
      readonly id: string;
      readonly start: number;
      readonly end: number;
    }
  | {
      readonly type: "reveal";
      readonly field?: "note";
      readonly id: string;
      readonly start?: number;
      readonly end?: number;
    }
  | {
      readonly type: "focus";
      readonly field?: "note";
      readonly id: string;
      readonly start?: number;
      readonly end?: number;
    }
  | {
      readonly type: "select";
      readonly id: string;
      readonly extend?: boolean;
      readonly toggle?: boolean;
    }
  | { readonly type: "select-all" | "clear-selection" };

export function createOutlineEditorState<T>(
  nodes: readonly OutlineNode<T>[],
  options: { readonly expandedIds?: ReadonlySet<string>; readonly hoistedId?: string | null } = {},
): OutlineEditorState<T> {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  return {
    nodes,
    caret: null,
    selection: new Set(),
    selectionAnchor: null,
    expandedIds: new Set(options.expandedIds ?? outlineIds(nodes)),
    hoistedId:
      options.hoistedId && findOutlineNode(nodes, options.hoistedId) ? options.hoistedId : null,
    history: { past: [], future: [], group: null },
    revision: 0,
    focusVersion: 0,
    refusal: null,
  };
}

export function editorVisibleRows<T>(state: OutlineEditorState<T>) {
  const hoisted = state.hoistedId ? findOutlineNode(state.nodes, state.hoistedId)?.node : undefined;
  return flattenVisible(hoisted ? [hoisted] : state.nodes, state.expandedIds);
}
const snapshot = <T>(state: OutlineEditorState<T>): OutlineSnapshot<T> => ({
  nodes: state.nodes,
  caret: state.caret,
  selection: state.selection,
  selectionAnchor: state.selectionAnchor,
});
const clamp = (value: number, length: number) =>
  Math.max(0, Math.min(length, Number.isFinite(value) ? Math.trunc(value) : 0));

/** History/replacement must preserve protected nodes and their complete structural placement.
 * Compare positions, not ancestor object identities: editing an unlocked ancestor title is valid.
 * A position counts only siblings that keep the same parent on both sides, so inserting or
 * deleting an unlocked neighbour is not a move of the locked node, while reordering it is.
 */
function changesLockedStructure<T>(
  before: readonly OutlineNode<T>[],
  after: readonly OutlineNode<T>[],
  isLocked: (node: OutlineNode<T>) => boolean,
): boolean {
  interface Location {
    node: OutlineNode<T>;
    parentId: string | null;
    index: number;
  }
  const parents = (roots: readonly OutlineNode<T>[]) => {
    const map = new Map<string, string | null>();
    const pending: { nodes: readonly OutlineNode<T>[]; parentId: string | null }[] = [
      { nodes: roots, parentId: null },
    ];
    while (pending.length) {
      const { nodes, parentId } = pending.pop()!;
      for (const node of nodes) {
        map.set(node.id, parentId);
        if (node.children) pending.push({ nodes: node.children, parentId: node.id });
      }
    }
    return map;
  };
  const beforeParents = parents(before),
    afterParents = parents(after);
  /** Index among the siblings that sit under the same parent in the other snapshot. */
  const sharedIndexes = (
    siblings: readonly OutlineNode<T>[],
    parentId: string | null,
    other: Map<string, string | null>,
  ) => {
    let index = 0;
    return siblings.map((node) => (other.get(node.id) === parentId ? index++ : -1));
  };
  const nextLocations = new Map<string, Location>();
  const nextPending: { nodes: readonly OutlineNode<T>[]; parentId: string | null }[] = [
    { nodes: after, parentId: null },
  ];
  while (nextPending.length) {
    const { nodes, parentId } = nextPending.pop()!;
    const indexes = sharedIndexes(nodes, parentId, beforeParents);
    for (const [position, node] of nodes.entries()) {
      nextLocations.set(node.id, { node, parentId, index: indexes[position]! });
      if (node.children) nextPending.push({ nodes: node.children, parentId: node.id });
    }
  }
  const pending: {
    nodes: readonly OutlineNode<T>[];
    parentId: string | null;
    inheritedLock: boolean;
    stableParent: boolean;
  }[] = [{ nodes: before, parentId: null, inheritedLock: false, stableParent: true }];
  while (pending.length) {
    const current = pending.pop()!;
    const indexes = sharedIndexes(current.nodes, current.parentId, afterParents);
    for (const [position, node] of current.nodes.entries()) {
      const next = nextLocations.get(node.id);
      const protectedNode = current.inheritedLock || isLocked(node);
      const stablePlacement =
        current.stableParent &&
        !!next &&
        next.parentId === current.parentId &&
        next.index === indexes[position];
      if (protectedNode && (!stablePlacement || next?.node !== node)) return true;
      if (node.children)
        pending.push({
          nodes: node.children,
          parentId: node.id,
          inheritedLock: protectedNode,
          stableParent: stablePlacement,
        });
    }
  }
  return false;
}

/** Unavailable adapters or fields never invent note content. */
function readNote<T>(node: OutlineNode<T>, adapter?: OutlineNoteAdapter<T>): string | null {
  if (!adapter) return null;
  try {
    const value = adapter.read(node);
    return typeof value === "string" ? value : null;
  } catch {
    return null;
  }
}

/** Keep interaction targets visible without reopening reader-local folds. */
function reconcileInteraction<T>(
  state: OutlineEditorState<T>,
  options: Pick<OutlineEditorOptions<T>, "noteAdapter"> = {},
): OutlineEditorState<T> {
  const rows = editorVisibleRows(state);
  const visible = new Map(rows.map((row) => [row.id, row.node]));
  let caret = state.caret;
  if (caret) {
    const target = visible.get(caret.id);
    if (target) {
      const note = caret.field === "note" ? readNote(target, options.noteAdapter) : null;
      const length = note === null ? target.text.length : note.length;
      caret = {
        id: caret.id,
        start: clamp(caret.start, length),
        end: clamp(caret.end, length),
        ...(note === null ? {} : { field: "note" as const }),
      };
    } else {
      const ancestor = [...getOutlinePath(state.nodes, caret.id)]
        .reverse()
        .find((node) => visible.has(node.id));
      const fallback = ancestor ?? rows[0]?.node;
      caret = fallback ? { id: fallback.id, start: 0, end: 0 } : null;
    }
  }
  const selection = new Set([...state.selection].filter((id) => visible.has(id)));
  if (state.selection.size && !selection.size && caret) selection.add(caret.id);
  return {
    ...state,
    caret,
    selection,
    selectionAnchor:
      state.selectionAnchor && visible.has(state.selectionAnchor)
        ? state.selectionAnchor
        : (caret?.id ?? null),
  };
}

/** Reconcile trusted host content without putting server loads into user undo history. */
export function reconcileOutlineEditorState<T>(
  state: OutlineEditorState<T>,
  nodes: readonly OutlineNode<T>[],
  options: Pick<OutlineEditorOptions<T>, "noteAdapter"> = {},
): OutlineEditorState<T> {
  if (state.nodes === nodes) {
    if (state.caret?.field !== "note") return state;
    const next = reconcileInteraction(state, options);
    if (
      next.caret?.id === state.caret.id &&
      next.caret?.field === state.caret.field &&
      next.caret?.start === state.caret.start &&
      next.caret?.end === state.caret.end
    )
      return state;
    return {
      ...next,
      focusVersion: state.focusVersion + 1,
      history: { ...state.history, group: null },
    };
  }
  const base = createOutlineEditorState(nodes, {
    expandedIds: state.expandedIds,
    hoistedId: state.hoistedId,
  });
  const next = reconcileInteraction(
    {
      ...base,
      caret:
        state.caret && !findOutlineNode(nodes, state.caret.id)
          ? (() => {
              const ancestor = [...getOutlinePath(state.nodes, state.caret!.id)]
                .reverse()
                .find((node) => findOutlineNode(nodes, node.id));
              return ancestor ? { id: ancestor.id, start: 0, end: 0 } : state.caret;
            })()
          : state.caret,
      selection: state.selection,
      selectionAnchor: state.selectionAnchor,
      revision: state.revision + 1,
      focusVersion: state.focusVersion + 1,
    },
    options,
  );
  return next;
}

/** A recognized field must be an own data property, never an inherited/accessor fallback. */
function validCaretField(value: object): boolean {
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, "field");
    if (!descriptor) return !Reflect.has(value, "field");
    return "value" in descriptor && (descriptor.value === undefined || descriptor.value === "note");
  } catch {
    return false;
  }
}

/** Runtime callers and extension adapters receive an atomic refusal for malformed actions. */
function validAction<T>(action: OutlineAction<T>): boolean {
  if (!action || typeof action !== "object" || Array.isArray(action)) return false;
  const value = action as unknown as Record<string, unknown>;
  const string = (key: string) => typeof value[key] === "string";
  const optionalString = (key: string) => value[key] === undefined || string(key);
  const number = (key: string) => typeof value[key] === "number" && Number.isFinite(value[key]);
  const optionalNumber = (key: string) => value[key] === undefined || number(key);
  const optionalBoolean = (key: string) =>
    value[key] === undefined || typeof value[key] === "boolean";
  const ids = (optional = false) =>
    (optional && value.ids === undefined) ||
    (Array.isArray(value.ids) && value.ids.every((id) => typeof id === "string"));
  switch (action.type) {
    case "text":
    case "note":
      return (
        string("id") &&
        string("text") &&
        optionalNumber("caret") &&
        (value.time === undefined || number("time") || value.time === Number.NEGATIVE_INFINITY)
      );
    case "split":
      return string("id") && string("newId") && number("start") && optionalNumber("end");
    case "merge":
      return string("id") && ["backward", "forward"].includes(action.direction);
    case "insert":
      return (
        string("id") &&
        optionalString("afterId") &&
        optionalString("text") &&
        (value.parentId === undefined || value.parentId === null || string("parentId")) &&
        optionalNumber("index") &&
        optionalNumber("caret")
      );
    case "delete":
    case "indent":
    case "outdent":
      return ids(true);
    case "move":
      return ids(true) && ["up", "down"].includes(action.direction);
    case "drop":
      return ids() && (value.parentId === null || string("parentId")) && number("index");
    case "paste":
      return (
        string("id") &&
        string("text") &&
        number("start") &&
        optionalNumber("end") &&
        typeof value.createId === "function"
      );
    case "paste-nodes":
      return (
        optionalString("afterId") &&
        Array.isArray(value.nodes) &&
        typeof value.createId === "function"
      );
    case "tasks":
      return ids();
    case "task":
      return string("id") && (value.checked === null || optionalBoolean("checked"));
    case "replace":
      return Array.isArray(value.nodes);
    case "toggle":
      return string("id");
    case "expand":
      return ids() && typeof value.expanded === "boolean";
    case "expand-all":
      return (
        typeof value.expanded === "boolean" &&
        (value.depth === undefined ||
          (number("depth") && Number.isInteger(value.depth) && (value.depth as number) >= 0))
      );
    case "hoist":
      return value.id === null || string("id");
    case "caret":
      return string("id") && number("start") && number("end") && validCaretField(action);
    case "focus":
    case "reveal":
      return (
        string("id") && optionalNumber("start") && optionalNumber("end") && validCaretField(action)
      );
    case "select":
      return string("id") && optionalBoolean("extend") && optionalBoolean("toggle");
    case "transaction":
      return (
        Array.isArray(value.commands) &&
        (action.caret === undefined ||
          (!!action.caret &&
            typeof action.caret.id === "string" &&
            Number.isFinite(action.caret.start) &&
            Number.isFinite(action.caret.end) &&
            validCaretField(action.caret)))
      );
    case "undo":
    case "redo":
    case "select-all":
    case "clear-selection":
      return true;
    default:
      return false;
  }
}

/** Pure editor state machine. Reading/navigation and document editing have separate authority. */
export function reduceOutlineEditor<T>(
  state: OutlineEditorState<T>,
  action: OutlineAction<T>,
  options: OutlineEditorOptions<T> = {},
): OutlineEditorState<T> {
  if (!validAction(action)) return { ...state, refusal: "invalid-command" };
  const fail = (reason: OutlineCommandFailure): OutlineEditorState<T> => ({
    ...state,
    refusal: reason,
  });
  const focus = (id: string, start = 0, end = start, field?: "note"): OutlineEditorState<T> => {
    const location = findOutlineNode(state.nodes, id);
    if (!location) return fail("not-found");
    if (
      field === "note" &&
      options.isLocked &&
      [...location.ancestors, location.node].some(options.isLocked)
    )
      return fail("locked");
    const note = field === "note" ? readNote(location.node, options.noteAdapter) : null;
    if (field === "note" && note === null) return fail("invalid-command");
    const length = note === null ? location.node.text.length : note.length;
    const outside =
      state.hoistedId &&
      ![...location.ancestors, location.node].some((node) => node.id === state.hoistedId);
    if (outside && action.type !== "reveal") return fail("invalid-command");
    const expandedIds = new Set(state.expandedIds);
    location.ancestors.forEach((node) => expandedIds.add(node.id));
    return {
      ...state,
      expandedIds,
      hoistedId: outside ? null : state.hoistedId,
      caret: {
        id,
        start: clamp(start, length),
        end: clamp(end, length),
        ...(field === "note" ? { field } : {}),
      },
      selection: new Set(),
      selectionAnchor: id,
      history: { ...state.history, group: null },
      focusVersion: state.focusVersion + 1,
      refusal: null,
    };
  };
  if (action.type === "caret") {
    const node = findOutlineNode(state.nodes, action.id)?.node;
    if (!node) return fail("not-found");
    if (
      action.field === "note" &&
      options.isLocked &&
      getOutlinePath(state.nodes, action.id).some(options.isLocked)
    )
      return fail("locked");
    const note = action.field === "note" ? readNote(node, options.noteAdapter) : null;
    if (action.field === "note" && note === null) return fail("invalid-command");
    const length = note === null ? node.text.length : note.length;
    const start = clamp(action.start, length),
      end = clamp(action.end, length);
    if (
      state.caret?.id === action.id &&
      state.caret.field === action.field &&
      state.caret.start === start &&
      state.caret.end === end &&
      !state.selection.size
    )
      return state;
    return {
      ...state,
      caret: {
        id: action.id,
        start,
        end,
        ...(action.field === "note" ? { field: action.field } : {}),
      },
      selection: new Set(),
      selectionAnchor: action.id,
      history: { ...state.history, group: null },
    };
  }
  if (action.type === "focus" || action.type === "reveal")
    return focus(action.id, action.start, action.end, action.field);
  if (action.type === "clear-selection")
    return { ...state, selection: new Set(), selectionAnchor: null };
  if (action.type === "select-all") {
    const ids = editorVisibleRows(state).map((row) => row.id);
    return {
      ...state,
      selection: new Set(ids),
      selectionAnchor: ids[0] ?? null,
      history: { ...state.history, group: null },
    };
  }
  if (action.type === "select") {
    const rows = editorVisibleRows(state).map((row) => row.id);
    const index = rows.indexOf(action.id);
    if (index < 0) return fail("not-found");
    const anchor = state.selectionAnchor ?? state.caret?.id ?? action.id;
    const start = rows.indexOf(anchor);
    const selection =
      action.extend && start >= 0
        ? new Set(rows.slice(Math.min(start, index), Math.max(start, index) + 1))
        : action.toggle
          ? new Set(state.selection)
          : new Set<string>();
    if (!action.extend) {
      if (action.toggle && selection.has(action.id)) selection.delete(action.id);
      else selection.add(action.id);
    }
    return {
      ...state,
      caret: { id: action.id, start: 0, end: 0 },
      focusVersion: state.focusVersion + 1,
      selection,
      selectionAnchor: action.extend ? anchor : action.id,
      history: { ...state.history, group: null },
      refusal: null,
    };
  }
  if (action.type === "toggle" || action.type === "expand" || action.type === "expand-all") {
    const expandedIds = new Set(state.expandedIds);
    const scoped = state.hoistedId
      ? findOutlineNode(state.nodes, state.hoistedId)?.node
      : undefined;
    const scopeDepth = scoped ? getOutlinePath(state.nodes, scoped.id).length - 1 : 0;
    const ids =
      action.type === "expand-all"
        ? outlineIds(scoped ? [scoped] : state.nodes)
        : action.type === "toggle"
          ? [action.id]
          : action.ids;
    for (const id of ids) {
      const expanded = action.type === "toggle" ? !expandedIds.has(id) : action.expanded;
      const depthAllowed =
        action.type !== "expand-all" ||
        action.depth === undefined ||
        getOutlinePath(state.nodes, id).length - scopeDepth <= action.depth;
      if (expanded && depthAllowed) expandedIds.add(id);
      else expandedIds.delete(id);
    }
    const next = reconcileInteraction({ ...state, expandedIds, refusal: null }, options);
    return {
      ...next,
      focusVersion:
        next.caret?.id !== state.caret?.id ? state.focusVersion + 1 : state.focusVersion,
    };
  }

  if (action.type === "hoist") {
    if (action.id !== null && !findOutlineNode(state.nodes, action.id)) return fail("not-found");
    const expandedIds = new Set(state.expandedIds);
    if (action.id) expandedIds.add(action.id);
    return reconcileInteraction(
      {
        ...state,
        hoistedId: action.id,
        expandedIds,
        caret: state.caret ?? (action.id ? { id: action.id, start: 0, end: 0 } : null),
        selection: new Set(),
        selectionAnchor: null,
        history: { ...state.history, group: null },
        focusVersion: state.focusVersion + 1,
        refusal: null,
      },
      options,
    );
  }
  // Every remaining intent can mutate content, including history and replacement.
  if (options.readOnly !== false) return fail("read-only");
  const policy = options;
  const finish = (
    result: OutlineCommandResult<T>,
    caret = state.caret,
    group: OutlineHistory<T>["group"] = null,
    expandedIds = state.expandedIds,
  ): OutlineEditorState<T> => {
    if (!result.ok) return fail(result.reason);
    if (action.type !== "replace" && sameOutlineContent(state.nodes, result.nodes))
      return { ...state, refusal: null };
    if (options.canChange && !options.canChange(state.nodes, result.nodes, action))
      return fail("locked");
    if (result.nodes === state.nodes) return { ...state, refusal: null };
    const ids = new Set(outlineIds(result.nodes));
    const coalesce =
      group !== null &&
      state.history.group?.id === group.id &&
      state.history.group.field === group.field &&
      group.time >= state.history.group.time &&
      group.time - state.history.group.time <= (options.typingGroupMs ?? 750);
    const noteCaret = action.type === "note" && caret?.field === "note" ? caret : undefined;
    const entry: OutlineHistorySnapshot<T> = {
      ...snapshot(state),
      ...(noteCaret ? { redoCaret: noteCaret } : {}),
    };
    const past = coalesce
      ? noteCaret && state.history.past.length
        ? [
            ...state.history.past.slice(0, -1),
            { ...state.history.past.at(-1)!, redoCaret: noteCaret },
          ]
        : state.history.past
      : [...state.history.past, entry].slice(-Math.max(1, options.historyLimit ?? 100));
    return reconcileInteraction(
      {
        ...state,
        nodes: result.nodes,
        caret: caret && ids.has(caret.id) ? caret : null,
        expandedIds,
        hoistedId: state.hoistedId && ids.has(state.hoistedId) ? state.hoistedId : null,
        selection: new Set(),
        selectionAnchor: caret?.id ?? null,
        history: { past, future: [], group },
        revision: state.revision + 1,
        focusVersion: state.focusVersion + 1,
        refusal: null,
      },
      options,
    );
  };
  if (action.type === "transaction") {
    const result = applyOutlineTransaction(state.nodes, action.commands, policy);
    if (result.ok && action.caret?.field === "note") {
      const target = findOutlineNode(result.nodes, action.caret.id)?.node;
      if (!target) return fail("not-found");
      if (options.isLocked && getOutlinePath(result.nodes, action.caret.id).some(options.isLocked))
        return fail("locked");
      if (readNote(target, options.noteAdapter) === null) return fail("invalid-command");
    }
    return finish(result, action.caret ?? state.caret);
  }
  if (action.type === "undo" || action.type === "redo") {
    const stack = action.type === "undo" ? state.history.past : state.history.future;
    const restored = stack.at(-1);
    if (!restored) return state;
    // Locking is re-evaluated at travel time: history is not a backdoor around policy.
    if (options.isLocked && changesLockedStructure(state.nodes, restored.nodes, options.isLocked))
      return fail("locked");
    if (options.canChange && !options.canChange(state.nodes, restored.nodes, action))
      return fail("locked");
    const ids = new Set(outlineIds(restored.nodes));
    const reciprocal: OutlineHistorySnapshot<T> = {
      ...snapshot(state),
      ...(restored.redoCaret
        ? {
            redoCaret: restored.redoCaret,
            ...(action.type === "undo"
              ? { caret: restored.redoCaret, undoCaret: restored.caret }
              : restored.undoCaret !== undefined
                ? { caret: restored.undoCaret }
                : {}),
          }
        : {}),
    };
    return reconcileInteraction(
      {
        ...state,
        nodes: restored.nodes,
        caret: restored.caret,
        selection: restored.selection,
        selectionAnchor: restored.selectionAnchor ?? restored.caret?.id ?? null,
        hoistedId: state.hoistedId && ids.has(state.hoistedId) ? state.hoistedId : null,
        history:
          action.type === "undo"
            ? {
                past: state.history.past.slice(0, -1),
                future: [...state.history.future, reciprocal],
                group: null,
              }
            : {
                past: [...state.history.past, reciprocal],
                future: state.history.future.slice(0, -1),
                group: null,
              },
        revision: state.revision + 1,
        focusVersion: state.focusVersion + 1,
        refusal: null,
      },
      options,
    );
  }
  if (action.type === "replace") {
    if (validateOutline(action.nodes).length) return fail("invalid-outline");
    if (options.isLocked && changesLockedStructure(state.nodes, action.nodes, options.isLocked))
      return fail("locked");
    return finish({ ok: true, nodes: action.nodes }, null);
  }
  if (action.type === "note") {
    const current = findOutlineNode(state.nodes, action.id)?.node;
    if (!current) return fail("not-found");
    if (options.isLocked && getOutlinePath(state.nodes, action.id).some(options.isLocked))
      return fail("locked");
    const note = readNote(current, options.noteAdapter);
    if (note === null) return fail("invalid-command");
    if (note === action.text) return { ...state, refusal: null };
    let data: T;
    try {
      const prepared = options.noteAdapter!.prepareData(current, action.text);
      if (
        !prepared ||
        typeof prepared !== "object" ||
        Array.isArray(prepared) ||
        prepared.ok !== true ||
        !Object.prototype.hasOwnProperty.call(prepared, "data")
      )
        return fail("invalid-command");
      data = prepared.data;
      if (readNote({ ...current, data }, options.noteAdapter) !== action.text)
        return fail("invalid-command");
    } catch {
      return fail("invalid-command");
    }
    const caret = clamp(action.caret ?? action.text.length, action.text.length);
    return finish(
      applyOutlineTransaction(
        state.nodes,
        [{ type: "update", id: action.id, changes: { data } }],
        policy,
      ),
      { id: action.id, start: caret, end: caret, field: "note" },
      { id: action.id, time: action.time ?? 0, field: "note" },
    );
  }
  if (action.type === "text") {
    const result = applyOutlineCommand(
      state.nodes,
      { type: "update", id: action.id, changes: { text: action.text } },
      policy,
    );
    const caret = clamp(action.caret ?? action.text.length, action.text.length);
    return finish(
      result,
      { id: action.id, start: caret, end: caret },
      { id: action.id, time: action.time ?? 0 },
    );
  }
  if (action.type === "tasks") {
    const ids = [...new Set(action.ids)];
    const commands = ids.map((id) => {
      const node = findOutlineNode(state.nodes, id)?.node;
      return { type: "update" as const, id, changes: { checked: !node?.checked } };
    });
    return finish(applyOutlineTransaction(state.nodes, commands, policy));
  }
  if (action.type === "paste-nodes") {
    const source =
      action.afterId === undefined ? undefined : findOutlineNode(state.nodes, action.afterId);
    if (action.afterId !== undefined && !source) return fail("not-found");
    if (validateOutline(action.nodes).length) return fail("invalid-outline");
    const copies = new Map<OutlineNode<T>, OutlineNode<T>>();
    const stack = action.nodes.map((node) => ({ node, exit: false })).reverse();
    while (stack.length) {
      const frame = stack.pop()!;
      if (frame.exit) {
        copies.set(frame.node, {
          ...frame.node,
          id: action.createId(),
          ...(frame.node.children
            ? { children: frame.node.children.map((child) => copies.get(child)!) }
            : {}),
        });
        continue;
      }
      stack.push({ ...frame, exit: true });
      for (let index = (frame.node.children?.length ?? 0) - 1; index >= 0; index--)
        stack.push({ node: frame.node.children![index]!, exit: false });
    }
    const copied = action.nodes.map((node) => copies.get(node)!);
    const pasted = applyOutlineTransaction(
      state.nodes,
      copied.map((node, index) => ({
        type: "insert" as const,
        parentId: source
          ? source.node.id === state.hoistedId
            ? source.node.id
            : source.parentId
          : state.hoistedId,
        index: source
          ? source.node.id === state.hoistedId
            ? index
            : source.index + 1 + index
          : (state.hoistedId
              ? (findOutlineNode(state.nodes, state.hoistedId)!.node.children?.length ?? 0)
              : state.nodes.length) + index,
        node,
      })),
      policy,
    );
    const last = copied.at(-1);
    return finish(
      pasted,
      last ? { id: last.id, start: last.text.length, end: last.text.length } : state.caret,
      null,
      new Set([...state.expandedIds, ...outlineIds(copied)]),
    );
  }
  if (action.type === "task") {
    const node = findOutlineNode(state.nodes, action.id)?.node;
    if (!node) return fail("not-found");
    return finish(
      applyOutlineCommand(
        state.nodes,
        {
          type: "update",
          id: action.id,
          changes: { checked: action.checked === undefined ? !node.checked : action.checked },
        },
        policy,
      ),
    );
  }
  if (action.type === "insert") {
    const after = action.afterId ? findOutlineNode(state.nodes, action.afterId) : undefined;
    if (action.afterId && !after) return fail("not-found");
    const node: OutlineNode<T> = { id: action.id, text: action.text ?? "" };
    const parentId =
      action.parentId !== undefined
        ? action.parentId
        : after?.node.id === state.hoistedId
          ? state.hoistedId
          : (after?.parentId ?? state.hoistedId);
    return finish(
      applyOutlineCommand(
        state.nodes,
        {
          type: "insert",
          parentId,
          ...(action.index !== undefined
            ? { index: action.index }
            : after && parentId === after.parentId
              ? { index: after.index + 1 }
              : {}),
          node,
        },
        policy,
      ),
      {
        id: node.id,
        start: clamp(action.caret ?? 0, node.text.length),
        end: clamp(action.caret ?? 0, node.text.length),
      },
    );
  }
  if (action.type === "split") {
    const source = findOutlineNode(state.nodes, action.id);
    if (!source) return fail("not-found");
    // Return on an empty final child exits one nesting level instead of accumulating blanks.
    const siblings = source.parentId
      ? findOutlineNode(state.nodes, source.parentId)!.node.children!
      : state.nodes;
    if (
      !source.node.text &&
      !source.node.children?.length &&
      source.parentId !== null &&
      source.index === siblings.length - 1 &&
      source.node.id !== state.hoistedId
    )
      return source.parentId === state.hoistedId
        ? state
        : finish(outdentOutlineNode(state.nodes, action.id, policy));
    const start = clamp(action.start, source.node.text.length),
      end = Math.max(start, clamp(action.end ?? start, source.node.text.length));
    const prefix = source.node.text.slice(0, start),
      suffix = source.node.text.slice(end);
    if (start === 0 && end === 0 && source.node.text.length > 0) {
      const inserted = applyOutlineCommand(
        state.nodes,
        {
          type: "insert",
          parentId: source.node.id === state.hoistedId ? source.node.id : source.parentId,
          index: source.node.id === state.hoistedId ? 0 : source.index,
          node: { id: action.newId, text: "" },
        },
        policy,
      );
      return finish(inserted, { id: source.node.id, start: 0, end: 0 });
    }
    const asChild =
      source.node.id === state.hoistedId ||
      (!!source.node.children?.length && state.expandedIds.has(source.node.id));
    const newNode: OutlineNode<T> = {
      id: action.newId,
      text: suffix,
      ...(source.node.checked !== undefined ? { checked: false } : {}),
    };
    const result = applyOutlineTransaction(
      state.nodes,
      [
        { type: "update", id: source.node.id, changes: { text: prefix } },
        {
          type: "insert",
          parentId: asChild ? source.node.id : source.parentId,
          index: asChild ? 0 : source.index + 1,
          node: newNode,
        },
      ],
      policy,
    );
    return finish(result, { id: action.newId, start: 0, end: 0 });
  }
  if (action.type === "merge") {
    const rows = editorVisibleRows(state);
    const index = rows.findIndex((row) => row.id === action.id);
    const previous = rows[index - 1],
      next = rows[index + 1];
    const left = action.direction === "backward" ? previous?.node : rows[index]?.node;
    const right = action.direction === "backward" ? rows[index]?.node : next?.node;
    if (!left || !right || right.id === state.hoistedId) return state;
    if (right.data !== undefined && !options.mergeData) return fail("invalid-command");
    // Move surviving children before deleting their old parent; never discard hidden content.
    let candidate = state.nodes;
    const rightLocation = findOutlineNode(state.nodes, right.id)!;
    let childIndex = rightLocation.parentId === left.id ? rightLocation.index : undefined;
    for (const child of right.children ?? []) {
      const moved = applyOutlineCommand(
        candidate,
        {
          type: "move",
          id: child.id,
          parentId: left.id,
          ...(childIndex === undefined ? {} : { index: childIndex++ }),
        },
        policy,
      );
      if (!moved.ok) return fail(moved.reason);
      candidate = moved.nodes;
    }
    const result = applyOutlineTransaction(
      candidate,
      [
        {
          type: "update",
          id: left.id,
          changes: {
            text: left.text + right.text,
            ...(options.mergeData ? { data: options.mergeData(left, right) } : {}),
          },
        },
        { type: "remove", id: right.id },
      ],
      policy,
    );
    const expanded = new Set(state.expandedIds);
    if (right.children?.length) expanded.add(left.id);
    return finish(
      result.ok ? result : { ...result, nodes: state.nodes },
      { id: left.id, start: left.text.length, end: left.text.length },
      null,
      expanded,
    );
  }
  if (action.type === "paste") {
    const source = findOutlineNode(state.nodes, action.id);
    if (!source) return fail("not-found");
    const start = clamp(action.start, source.node.text.length),
      end = Math.max(start, clamp(action.end ?? start, source.node.text.length));
    if (!/[\r\n]/.test(action.text)) {
      const text = source.node.text.slice(0, start) + action.text + source.node.text.slice(end);
      const caret = start + action.text.length;
      return finish(
        applyOutlineCommand(
          state.nodes,
          { type: "update", id: action.id, changes: { text } },
          policy,
        ),
        { id: action.id, start: caret, end: caret },
      );
    }
    const parsed = parseOutlineText(action.text, {
      createId: action.createId,
    }) as readonly OutlineNode<T>[];
    if (!parsed.length) return state;
    let candidate = state.nodes;
    const first = parsed[0]!;
    const update = applyOutlineCommand(
      candidate,
      {
        type: "update",
        id: source.node.id,
        changes: { text: source.node.text.slice(0, start) + first.text },
      },
      policy,
    );
    if (!update.ok) return fail(update.reason);
    candidate = update.nodes;
    for (const child of first.children ?? []) {
      const inserted = applyOutlineCommand(
        candidate,
        { type: "insert", parentId: source.node.id, node: child },
        policy,
      );
      if (!inserted.ok) return fail(inserted.reason);
      candidate = inserted.nodes;
    }
    for (let i = 1; i < parsed.length; i++) {
      const inserted = applyOutlineCommand(
        candidate,
        {
          type: "insert",
          parentId: source.node.id === state.hoistedId ? source.node.id : source.parentId,
          index: source.node.id === state.hoistedId ? i - 1 : source.index + i,
          node: parsed[i]!,
        },
        policy,
      );
      if (!inserted.ok) return fail(inserted.reason);
      candidate = inserted.nodes;
    }
    const last = parsed.at(-1)!;
    const finalId = parsed.length === 1 ? source.node.id : last.id;
    const finalNode = findOutlineNode(candidate, finalId)!.node;
    const tail = source.node.text.slice(end);
    const appended = applyOutlineCommand(
      candidate,
      { type: "update", id: finalId, changes: { text: finalNode.text + tail } },
      policy,
    );
    const expanded = new Set([...state.expandedIds, source.node.id, ...outlineIds(parsed)]);
    return finish(
      appended,
      { id: finalId, start: finalNode.text.length, end: finalNode.text.length },
      null,
      expanded,
    );
  }
  if (
    action.type === "delete" ||
    action.type === "indent" ||
    action.type === "outdent" ||
    action.type === "move" ||
    action.type === "drop"
  ) {
    const requested =
      action.ids ??
      (state.selection.size ? [...state.selection] : state.caret ? [state.caret.id] : []);
    const ids = [...selectionRoots(state.nodes, new Set(requested))];
    if (!ids.length) return state;
    if (ids.some((id) => id === state.hoistedId) && action.type !== "delete") return state;
    let candidate = state.nodes;
    const expanded = new Set(state.expandedIds);
    if (action.type === "move") {
      const moved = moveOutlineSelection(
        state.nodes,
        ids,
        action.direction,
        policy,
        state.hoistedId,
      );
      if (moved.ok)
        for (const id of ids) {
          const parent = findOutlineNode(moved.nodes, id)?.parentId;
          if (parent) expanded.add(parent);
        }
      const next = finish(moved, state.caret, null, expanded);
      return next.nodes !== state.nodes
        ? reconcileInteraction(
            {
              ...next,
              selection: state.selection,
              selectionAnchor: state.selectionAnchor,
            },
            options,
          )
        : next;
    }
    if (action.type === "drop") {
      if (action.parentId !== null) {
        const path = getOutlinePath(state.nodes, action.parentId);
        if (path.some((node) => ids.includes(node.id))) return fail("descendant-move");
        if (state.hoistedId && !path.some((node) => node.id === state.hoistedId))
          return fail("invalid-command");
      } else if (state.hoistedId) return fail("invalid-command");
      const moving = ids.map((id) => findOutlineNode(state.nodes, id)!.node);
      const result = applyOutlineTransaction(
        state.nodes,
        [
          ...ids.map((id) => ({ type: "remove" as const, id })),
          ...moving.map((node, index) => ({
            type: "insert" as const,
            parentId: action.parentId,
            index: action.index + index,
            node,
          })),
        ],
        policy,
      );
      if (action.parentId) expanded.add(action.parentId);
      const next = finish(result, state.caret, null, expanded);
      return next.nodes !== state.nodes
        ? reconcileInteraction(
            {
              ...next,
              selection: state.selection,
              selectionAnchor: state.selectionAnchor,
            },
            options,
          )
        : next;
    }
    if (action.type === "outdent") {
      if (
        state.hoistedId &&
        ids.some((id) => findOutlineNode(state.nodes, id)?.parentId === state.hoistedId)
      )
        return state;
      ids.reverse();
    }

    for (const id of ids) {
      let result: OutlineCommandResult<T>;
      if (action.type === "delete")
        result = applyOutlineCommand(candidate, { type: "remove", id }, policy);
      else if (action.type === "indent") {
        result = indentOutlineNode(candidate, id, policy);
        if (result.ok) {
          const parent = findOutlineNode(result.nodes, id)?.parentId;
          if (parent) expanded.add(parent);
        }
      } else if (action.type === "outdent") {
        const before = findOutlineNode(candidate, id)!.node.children?.length ?? 0;
        result = outdentOutlineNode(candidate, id, policy);
        if (result.ok && (findOutlineNode(result.nodes, id)!.node.children?.length ?? 0) > before)
          expanded.add(id);
      } else return fail("invalid-command");
      if (!result.ok) return fail(result.reason);
      candidate = result.nodes;
    }
    let caret = state.caret;
    if (action.type === "delete") {
      const rows = editorVisibleRows(state),
        first = rows.findIndex((row) => ids.includes(row.id));
      const survivor = [
        ...rows.slice(0, Math.max(0, first)).reverse(),
        ...rows.slice(Math.max(0, first)),
      ].find((row) => findOutlineNode(candidate, row.id));
      caret = survivor
        ? { id: survivor.id, start: survivor.node.text.length, end: survivor.node.text.length }
        : null;
    }
    const result = finish({ ok: true, nodes: candidate }, caret, null, expanded);
    return action.type !== "delete" && result.nodes !== state.nodes
      ? reconcileInteraction(
          {
            ...result,
            selection: state.selection,
            selectionAnchor: state.selectionAnchor,
          },
          options,
        )
      : result;
  }
  return fail("invalid-command");
}
