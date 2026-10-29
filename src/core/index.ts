/** Portable, framework-independent outline model. Expansion is reader state, not document data. */
export interface OutlineNode<T = unknown> {
  readonly id: string;
  readonly text: string;
  readonly children?: readonly OutlineNode<T>[];
  readonly data?: T;
  /** Present for task items; absent for ordinary outline items. */
  readonly checked?: boolean;
}

export interface OutlineValidationIssue {
  readonly code: "invalid-node" | "duplicate-id" | "cycle";
  readonly path: readonly number[];
  readonly message: string;
}

/** Check the complete tree, including collapsed descendants, without recursive calls. */
export function validateOutline<T>(
  nodes: readonly OutlineNode<T>[],
): readonly OutlineValidationIssue[] {
  const issues: OutlineValidationIssue[] = [];
  if (!Array.isArray(nodes))
    return [{ code: "invalid-node", path: [], message: "Outline roots must be an array." }];
  const ids = new Set<string>();
  const ancestors = new Set<object>();
  type Frame = { node: unknown; path: number[]; exit?: boolean };
  const stack: Frame[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) stack.push({ node: nodes[i], path: [i] });
  while (stack.length) {
    const frame = stack.pop()!;
    const { node, path } = frame;
    if (typeof node !== "object" || node === null || Array.isArray(node)) {
      issues.push({ code: "invalid-node", path, message: "Each outline node must be an object." });
      continue;
    }
    if (frame.exit) {
      ancestors.delete(node);
      continue;
    }
    if (ancestors.has(node)) {
      issues.push({ code: "cycle", path, message: "Outline nodes cannot contain an ancestor." });
      continue;
    }
    const candidate = node as Partial<OutlineNode<T>>;
    if (
      typeof candidate.id !== "string" ||
      !candidate.id.trim() ||
      typeof candidate.text !== "string"
    ) {
      issues.push({
        code: "invalid-node",
        path,
        message: "Each node needs a non-empty string id and string text.",
      });
    }
    if (typeof candidate.id === "string") {
      if (ids.has(candidate.id))
        issues.push({
          code: "duplicate-id",
          path,
          message: `Duplicate outline id: ${candidate.id}`,
        });
      ids.add(candidate.id);
    }
    if (candidate.checked !== undefined && typeof candidate.checked !== "boolean")
      issues.push({
        code: "invalid-node",
        path,
        message: "Task checked state must be boolean when provided.",
      });
    if (candidate.children !== undefined && !Array.isArray(candidate.children)) {
      issues.push({
        code: "invalid-node",
        path,
        message: "Node children must be an array when provided.",
      });
      continue;
    }
    ancestors.add(node);
    stack.push({ node, path, exit: true });
    if (candidate.children) {
      for (let i = candidate.children.length - 1; i >= 0; i--) {
        stack.push({ node: candidate.children[i], path: [...path, i] });
      }
    }
  }
  return issues;
}

export class InvalidOutlineError extends Error {
  readonly issues: readonly OutlineValidationIssue[];
  constructor(issues: readonly OutlineValidationIssue[]) {
    super(`Invalid outline: ${issues.map((issue) => issue.message).join(" ")}`);
    this.name = "InvalidOutlineError";
    this.issues = issues;
  }
}

export interface VisibleOutlineRow<T = unknown> {
  readonly node: OutlineNode<T>;
  readonly id: string;
  readonly parentId: string | null;
  /** Zero-based nesting depth and visible row index. */
  readonly depth: number;
  readonly index: number;
  readonly hasChildren: boolean;
  /** One-based sibling position, suitable for aria-posinset. */
  readonly posInSet: number;
  readonly setSize: number;
}

/** Pre-order visible rows. Invalid hidden data is rejected too; input is never modified. */
export function flattenVisible<T>(
  nodes: readonly OutlineNode<T>[],
  expandedIds: ReadonlySet<string>,
): readonly VisibleOutlineRow<T>[] {
  const issues = validateOutline(nodes);
  if (issues.length) throw new InvalidOutlineError(issues);
  const rows: VisibleOutlineRow<T>[] = [];
  type Pending = {
    node: OutlineNode<T>;
    parentId: string | null;
    depth: number;
    posInSet: number;
    setSize: number;
  };
  const stack: Pending[] = [];
  for (let i = nodes.length - 1; i >= 0; i--) {
    stack.push({
      node: nodes[i]!,
      parentId: null,
      depth: 0,
      posInSet: i + 1,
      setSize: nodes.length,
    });
  }
  while (stack.length) {
    const row = stack.pop()!;
    const children = row.node.children ?? [];
    rows.push({ ...row, id: row.node.id, index: rows.length, hasChildren: children.length > 0 });
    if (expandedIds.has(row.node.id)) {
      for (let i = children.length - 1; i >= 0; i--) {
        stack.push({
          node: children[i]!,
          parentId: row.node.id,
          depth: row.depth + 1,
          posInSet: i + 1,
          setSize: children.length,
        });
      }
    }
  }
  return rows;
}

/** Expansion is deliberately independent of edit authorization (including read-only readers). */
export function toggleExpanded(expandedIds: ReadonlySet<string>, id: string): ReadonlySet<string> {
  const next = new Set(expandedIds);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

export interface OutlineEditPolicy<T = unknown> {
  /** Safe default: document edits require an explicit false. */
  readonly readOnly?: boolean;
  /** A locked node protects its subtree and structural relationship. */
  readonly isLocked?: (node: OutlineNode<T>) => boolean;
}

export type OutlineCommand<T = unknown> =
  | {
      readonly type: "update";
      readonly id: string;
      readonly changes: {
        readonly text?: string;
        readonly data?: T;
        readonly checked?: boolean | null;
      };
    }
  | {
      readonly type: "insert";
      readonly parentId: string | null;
      readonly index?: number;
      readonly node: OutlineNode<T>;
    }
  | { readonly type: "remove"; readonly id: string }
  | {
      readonly type: "move";
      readonly id: string;
      readonly parentId: string | null;
      readonly index?: number;
    };

export type OutlineCommandFailure =
  | "read-only"
  | "invalid-outline"
  | "not-found"
  | "locked"
  | "invalid-index"
  | "invalid-command"
  | "descendant-move";

export type OutlineCommandResult<T = unknown> =
  | { readonly ok: true; readonly nodes: readonly OutlineNode<T>[] }
  | {
      readonly ok: false;
      readonly nodes: readonly OutlineNode<T>[];
      readonly reason: OutlineCommandFailure;
    };

interface Located<T> {
  node: OutlineNode<T>;
  path: readonly number[];
  ancestors: readonly OutlineNode<T>[];
}

function locate<T>(nodes: readonly OutlineNode<T>[], id: string): Located<T> | undefined {
  const stack: Located<T>[] = [];
  for (let i = nodes.length - 1; i >= 0; i--)
    stack.push({ node: nodes[i]!, path: [i], ancestors: [] });
  while (stack.length) {
    const item = stack.pop()!;
    if (item.node.id === id) return item;
    const children = item.node.children ?? [];
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({
        node: children[i]!,
        path: [...item.path, i],
        ancestors: [...item.ancestors, item.node],
      });
    }
  }
  return undefined;
}

/** Replace one sibling list, cloning only ancestors on its path. */
function replaceChildren<T>(
  nodes: readonly OutlineNode<T>[],
  parentPath: readonly number[],
  children: readonly OutlineNode<T>[],
): readonly OutlineNode<T>[] {
  if (!parentPath.length) return children;
  const chain: { siblings: readonly OutlineNode<T>[]; index: number; node: OutlineNode<T> }[] = [];
  let siblings = nodes;
  for (const index of parentPath) {
    const node = siblings[index]!;
    chain.push({ siblings, index, node });
    siblings = node.children ?? [];
  }
  let result = children;
  for (let i = chain.length - 1; i >= 0; i--) {
    const entry = chain[i]!;
    const copy = entry.siblings.slice();
    copy[entry.index] = { ...entry.node, children: result };
    result = copy;
  }
  return result;
}

function siblingsAt<T>(
  nodes: readonly OutlineNode<T>[],
  path: readonly number[],
): readonly OutlineNode<T>[] {
  let result = nodes;
  for (const index of path) result = result[index]!.children ?? [];
  return result;
}

function subtreeLocked<T>(
  node: OutlineNode<T>,
  isLocked: (node: OutlineNode<T>) => boolean,
): boolean {
  const stack = [node];
  while (stack.length) {
    const current = stack.pop()!;
    if (isLocked(current)) return true;
    for (const child of current.children ?? []) stack.push(child);
  }
  return false;
}

/**
 * Immutable document commands. A failed command always returns the exact original roots.
 * A move index is measured in destination siblings AFTER removing the source; omission appends.
 * Locked ancestors prevent edits; remove/move also protect every descendant of the source.
 */
export function applyOutlineCommand<T>(
  nodes: readonly OutlineNode<T>[],
  command: OutlineCommand<T>,
  policy: OutlineEditPolicy<T> = {},
): OutlineCommandResult<T> {
  const fail = (reason: OutlineCommandFailure): OutlineCommandResult<T> => ({
    ok: false,
    nodes,
    reason,
  });
  if (policy.readOnly !== false) return fail("read-only");
  if (validateOutline(nodes).length) return fail("invalid-outline");
  if (
    typeof command !== "object" ||
    command === null ||
    Array.isArray(command) ||
    typeof command.type !== "string"
  )
    return fail("invalid-command");
  if (
    (command.type === "update" || command.type === "remove" || command.type === "move") &&
    typeof command.id !== "string"
  )
    return fail("invalid-command");
  if (
    (command.type === "insert" || command.type === "move") &&
    command.parentId !== null &&
    typeof command.parentId !== "string"
  )
    return fail("invalid-command");
  if (
    command.type === "update" &&
    (typeof command.changes !== "object" ||
      command.changes === null ||
      Array.isArray(command.changes))
  )
    return fail("invalid-command");
  const isLocked = policy.isLocked ?? (() => false);
  const protectedLocation = (item: Located<T>) =>
    item.ancestors.some(isLocked) || isLocked(item.node);
  const validIndex = (index: number, length: number) =>
    Number.isInteger(index) && index >= 0 && index <= length;
  if (command.type === "update" || command.type === "remove" || command.type === "move") {
    const source = locate(nodes, command.id);
    if (!source) return fail("not-found");
    if (protectedLocation(source)) return fail("locked");
    const parentPath = source.path.slice(0, -1);
    const sourceIndex = source.path[source.path.length - 1]!;
    const siblings = siblingsAt(nodes, parentPath);
    if (command.type === "update") {
      if (command.changes.text !== undefined && typeof command.changes.text !== "string")
        return fail("invalid-command");
      if (
        command.changes.checked !== undefined &&
        command.changes.checked !== null &&
        typeof command.changes.checked !== "boolean"
      )
        return fail("invalid-command");
      const changedChecked =
        Object.hasOwn(command.changes, "checked") &&
        (command.changes.checked ?? undefined) !== source.node.checked;
      const changedText =
        command.changes.text !== undefined && command.changes.text !== source.node.text;
      const changedData =
        Object.hasOwn(command.changes, "data") &&
        !Object.is(command.changes.data, source.node.data);
      if (!changedText && !changedData && !changedChecked) return { ok: true, nodes };
      // Copy only supported fields: JavaScript callers cannot smuggle id/children changes
      // through an update and bypass structural validation or lock protection.
      const next = {
        ...source.node,
        ...(changedText ? { text: command.changes.text! } : {}),
        ...(changedData ? { data: command.changes.data } : {}),
        ...(changedChecked ? { checked: command.changes.checked ?? undefined } : {}),
      };
      const copy = siblings.slice();
      copy[sourceIndex] = next;
      return { ok: true, nodes: replaceChildren(nodes, parentPath, copy) };
    }
    if (subtreeLocked(source.node, isLocked)) return fail("locked");
    const withoutSource = siblings.filter((_, index) => index !== sourceIndex);
    if (command.type === "remove")
      return { ok: true, nodes: replaceChildren(nodes, parentPath, withoutSource) };
    const destination = command.parentId === null ? undefined : locate(nodes, command.parentId);
    if (command.parentId !== null && !destination) return fail("not-found");
    if (
      destination &&
      (destination.node.id === source.node.id ||
        destination.ancestors.some((node) => node.id === source.node.id))
    )
      return fail("descendant-move");
    if (destination && protectedLocation(destination)) return fail("locked");
    const removed = replaceChildren(nodes, parentPath, withoutSource);
    const relocatedParent =
      command.parentId === null ? undefined : locate(removed, command.parentId)!;
    const targetPath = relocatedParent?.path ?? [];
    const targetSiblings = relocatedParent?.node.children ?? (relocatedParent ? [] : removed);
    const index = command.index ?? targetSiblings.length;
    if (!validIndex(index, targetSiblings.length)) return fail("invalid-index");
    if (command.parentId === (source.ancestors.at(-1)?.id ?? null) && index === sourceIndex)
      return { ok: true, nodes };
    const copy = targetSiblings.slice();
    copy.splice(index, 0, source.node);
    return { ok: true, nodes: replaceChildren(removed, targetPath, copy) };
  }
  if (command.type === "insert") {
    const destination = command.parentId === null ? undefined : locate(nodes, command.parentId);
    if (command.parentId !== null && !destination) return fail("not-found");
    if (destination && protectedLocation(destination)) return fail("locked");
    const path = destination?.path ?? [];
    const siblings = destination?.node.children ?? (destination ? [] : nodes);
    const index = command.index ?? siblings.length;
    if (!validIndex(index, siblings.length)) return fail("invalid-index");
    // Validate together so inserted subtrees cannot reuse any existing id or object ancestry.
    if (validateOutline([...nodes, command.node]).length) return fail("invalid-outline");
    const copy = siblings.slice();
    copy.splice(index, 0, command.node);
    return { ok: true, nodes: replaceChildren(nodes, path, copy) };
  }
  return fail("invalid-command");
}

export * from "./tree.js";
export * from "./text.js";
export * from "./editor.js";

export * from "./text-intelligence.js";

export * from "./keymap.js";

export * from "./hover.js";
