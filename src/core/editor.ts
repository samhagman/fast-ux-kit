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
  validateOutline,
  InvalidOutlineError,
  type OutlineNode,
  type OutlineEditPolicy,
  type OutlineCommandFailure,
  type OutlineCommandResult,
} from "./index.js";

export interface OutlineCaret {
  readonly id: string;
  readonly start: number;
  readonly end: number;
}
export interface OutlineSnapshot<T = unknown> {
  readonly nodes: readonly OutlineNode<T>[];
  readonly caret: OutlineCaret | null;
  readonly selection: ReadonlySet<string>;
}
export interface OutlineHistory<T = unknown> {
  readonly past: readonly OutlineSnapshot<T>[];
  readonly future: readonly OutlineSnapshot<T>[];
  readonly group: { readonly id: string; readonly time: number } | null;
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
      readonly type: "text";
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
      readonly afterId: string;
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
  | { readonly type: "caret"; readonly id: string; readonly start: number; readonly end: number }
  | { readonly type: "reveal"; readonly id: string; readonly start?: number; readonly end?: number }
  | { readonly type: "focus"; readonly id: string; readonly start?: number; readonly end?: number }
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
});
const clamp = (value: number, length: number) =>
  Math.max(0, Math.min(length, Number.isFinite(value) ? Math.trunc(value) : 0));

/** Reconcile trusted host content without putting server loads into user undo history. */
export function reconcileOutlineEditorState<T>(
  state: OutlineEditorState<T>,
  nodes: readonly OutlineNode<T>[],
): OutlineEditorState<T> {
  if (state.nodes === nodes) return state;
  const base = createOutlineEditorState(nodes, {
    expandedIds: state.expandedIds,
    hoistedId: state.hoistedId,
  });
  const ids = new Set(outlineIds(nodes));
  return {
    ...base,
    caret: state.caret && ids.has(state.caret.id) ? state.caret : null,
    selection: new Set([...state.selection].filter((id) => ids.has(id))),
    revision: state.revision + 1,
    focusVersion: state.focusVersion,
  };
}

/** Pure editor state machine. Reading/navigation and document editing have separate authority. */
export function reduceOutlineEditor<T>(
  state: OutlineEditorState<T>,
  action: OutlineAction<T>,
  options: OutlineEditorOptions<T> = {},
): OutlineEditorState<T> {
  if (!action || typeof action !== "object" || typeof action.type !== "string")
    return { ...state, refusal: "invalid-command" };
  const fail = (reason: OutlineCommandFailure): OutlineEditorState<T> => ({
    ...state,
    refusal: reason,
  });
  const focus = (id: string, start = 0, end = start): OutlineEditorState<T> => {
    const location = findOutlineNode(state.nodes, id);
    if (!location) return fail("not-found");
    const expandedIds = new Set(state.expandedIds);
    location.ancestors.forEach((node) => expandedIds.add(node.id));
    return {
      ...state,
      expandedIds,
      caret: {
        id,
        start: clamp(start, location.node.text.length),
        end: clamp(end, location.node.text.length),
      },
      selection: new Set(),
      selectionAnchor: id,
      focusVersion: state.focusVersion + 1,
      refusal: null,
    };
  };
  if (action.type === "caret") {
    const node = findOutlineNode(state.nodes, action.id)?.node;
    if (!node) return fail("not-found");
    const start = clamp(action.start, node.text.length),
      end = clamp(action.end, node.text.length);
    if (
      state.caret?.id === action.id &&
      state.caret.start === start &&
      state.caret.end === end &&
      !state.selection.size
    )
      return state;
    return {
      ...state,
      caret: { id: action.id, start, end },
      selection: new Set(),
      selectionAnchor: action.id,
    };
  }
  if (action.type === "focus" || action.type === "reveal") {
    const next = focus(action.id, action.start, action.end);
    return action.type === "reveal" &&
      state.hoistedId &&
      !getOutlinePath(state.nodes, action.id).some((node) => node.id === state.hoistedId)
      ? { ...next, hoistedId: null }
      : next;
  }
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
    let next = { ...state, expandedIds, refusal: null };
    // A hidden focused descendant returns to the nearest visible ancestor.
    if (state.caret) {
      const visible = new Set(editorVisibleRows(next).map((row) => row.id));
      if (!visible.has(state.caret.id)) {
        const parent = [...getOutlinePath(state.nodes, state.caret.id)]
          .reverse()
          .find((node) => visible.has(node.id));
        next = {
          ...next,
          caret: parent ? { id: parent.id, start: 0, end: 0 } : null,
          focusVersion: state.focusVersion + 1,
        };
      }
    }
    return next;
  }
  if (action.type === "hoist") {
    if (action.id !== null && !findOutlineNode(state.nodes, action.id)) return fail("not-found");
    const expandedIds = new Set(state.expandedIds);
    if (action.id) expandedIds.add(action.id);
    return {
      ...state,
      hoistedId: action.id,
      expandedIds,
      selection: new Set(),
      selectionAnchor: null,
      refusal: null,
    };
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
    if (options.canChange && !options.canChange(state.nodes, result.nodes, action))
      return fail("locked");
    if (result.nodes === state.nodes) return { ...state, refusal: null };
    const ids = new Set(outlineIds(result.nodes));
    const coalesce =
      group !== null &&
      state.history.group?.id === group.id &&
      group.time >= state.history.group.time &&
      group.time - state.history.group.time <= (options.typingGroupMs ?? 750);
    const past = coalesce
      ? state.history.past
      : [...state.history.past, snapshot(state)].slice(-Math.max(1, options.historyLimit ?? 100));
    return {
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
    };
  };
  if (action.type === "undo" || action.type === "redo") {
    const stack = action.type === "undo" ? state.history.past : state.history.future;
    const restored = stack.at(-1);
    if (!restored) return state;
    // Locking is re-evaluated at travel time: history is not a backdoor around policy.
    if (options.isLocked) {
      for (const id of outlineIds(state.nodes)) {
        const current = findOutlineNode(state.nodes, id)!;
        if (!options.isLocked(current.node) && !current.ancestors.some(options.isLocked)) continue;
        const previous = findOutlineNode(restored.nodes, id);
        if (
          !previous ||
          previous.node !== current.node ||
          previous.parentId !== current.parentId ||
          previous.index !== current.index
        )
          return fail("locked");
      }
    }
    if (options.canChange && !options.canChange(state.nodes, restored.nodes, action))
      return fail("locked");
    const ids = new Set(outlineIds(restored.nodes));
    return {
      ...state,
      ...restored,
      hoistedId: state.hoistedId && ids.has(state.hoistedId) ? state.hoistedId : null,
      history:
        action.type === "undo"
          ? {
              past: state.history.past.slice(0, -1),
              future: [...state.history.future, snapshot(state)],
              group: null,
            }
          : {
              past: [...state.history.past, snapshot(state)],
              future: state.history.future.slice(0, -1),
              group: null,
            },
      revision: state.revision + 1,
      focusVersion: state.focusVersion + 1,
      refusal: null,
    };
  }
  if (action.type === "replace") {
    if (validateOutline(action.nodes).length) return fail("invalid-outline");
    if (
      options.isLocked &&
      outlineIds(state.nodes).some((id) => {
        const current = findOutlineNode(state.nodes, id)!;
        const next = findOutlineNode(action.nodes, id);
        return (
          (options.isLocked!(current.node) || current.ancestors.some(options.isLocked!)) &&
          (!next ||
            next.node !== current.node ||
            next.parentId !== current.parentId ||
            next.index !== current.index)
        );
      })
    )
      return fail("locked");
    return finish({ ok: true, nodes: action.nodes }, null);
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
    const source = findOutlineNode(state.nodes, action.afterId);
    if (!source) return fail("not-found");
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
        parentId: source.parentId,
        index: source.index + 1 + index,
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
      action.parentId !== undefined ? action.parentId : (after?.parentId ?? state.hoistedId);
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
      return finish(outdentOutlineNode(state.nodes, action.id, policy));
    const start = clamp(action.start, source.node.text.length),
      end = Math.max(start, clamp(action.end ?? start, source.node.text.length));
    const prefix = source.node.text.slice(0, start),
      suffix = source.node.text.slice(end);
    if (start === 0 && end === 0 && source.node.text.length > 0) {
      const inserted = applyOutlineCommand(
        state.nodes,
        {
          type: "insert",
          parentId: source.parentId,
          index: source.index,
          node: { id: action.newId, text: "" },
        },
        policy,
      );
      return finish(inserted, { id: source.node.id, start: 0, end: 0 });
    }
    const asChild = !!source.node.children?.length && state.expandedIds.has(source.node.id);
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
    if (!/[\r\n]/.test(action.text))
      return reduceOutlineEditor(
        state,
        {
          type: "text",
          id: action.id,
          text: source.node.text.slice(0, start) + action.text + source.node.text.slice(end),
          caret: start + action.text.length,
        },
        options,
      );
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
        { type: "insert", parentId: source.parentId, index: source.index + i, node: parsed[i]! },
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
      return next.nodes !== state.nodes ? { ...next, selection: state.selection } : next;
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
      return next.nodes !== state.nodes ? { ...next, selection: state.selection } : next;
    }
    if (action.type === "outdent") ids.reverse();

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
      ? { ...result, selection: state.selection }
      : result;
  }
  return fail("invalid-command");
}
