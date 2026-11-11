import type { MachineDocument, MachineGraph, MachineNode, MachineTransition } from "./types.js";

export type MachineTreeRowKind = "machine" | "node" | "transition";
export interface MachineTreeActiveStates {
  readonly machineId: string;
  readonly activeIds: readonly string[];
}
export type MachineTreeActiveState = MachineTreeActiveStates;
export interface MachineTreeOptions {
  readonly activeStates?: readonly MachineTreeActiveStates[];
  /** Ingested graph, node and transition records. Default 10,000; maximum 50,000. */
  readonly maxItems?: number;
  /** State containment depth. Deeper records are recovered at their graph root. */
  readonly maxDepth?: number;
}
export interface MachineTreeIssue {
  readonly code: string;
  readonly message: string;
  readonly rowId?: string;
  readonly machineId?: string;
}
/** A declared region: a presentation row its member states hang under (see `presentMachineTree`). */
export interface MachineTreeRegion {
  readonly name: string;
  /** The machine's own default for whether the box starts shut. */
  readonly collapsed: boolean;
  /** Member state rows, in document order. */
  readonly memberIds: readonly string[];
}
export interface MachineTreeRow {
  readonly id: string;
  /** Identity of this occurrence's containing machine row, including duplicates. */
  readonly machineRowId: string;
  readonly kind: MachineTreeRowKind;
  readonly machineId: string;
  readonly elementId: string;
  readonly label: string;
  readonly parentId?: string;
  readonly childIds: readonly string[];
  readonly depth: number;
  readonly graph: MachineGraph;
  readonly node?: MachineNode;
  readonly transition?: MachineTransition;
  readonly initial: boolean;
  /** Exact host-supplied state ID, not inferred execution. */
  readonly active: boolean;
  /** At least one contained state has an exact supplied active ID. */
  readonly activeDescendant: boolean;
  readonly recovered: boolean;
  /**
   * Set on a region row. Its `node` is a stand-in that is not in the document, so it is not a
   * state: do not count it, send it events or look its id up in the host's data.
   */
  readonly region?: MachineTreeRegion;
}
export interface MachineTreeModel {
  readonly rows: readonly MachineTreeRow[];
  readonly rootIds: readonly string[];
  readonly issues: readonly MachineTreeIssue[];
  readonly truncated: boolean;
}
export interface MachineTreeProjectionOptions {
  /** Undefined expands all branches; an empty set collapses every branch. */
  readonly expandedIds?: ReadonlySet<string>;
  readonly query?: string;
  readonly showNotes?: boolean;
  readonly showTransitions?: boolean;
  /** Visible output only. Default 1,000; hard maximum 50,000. */
  readonly maxVisibleRows?: number;
}
export interface MachineTreeVisibleRow extends MachineTreeRow {
  readonly level: number;
  readonly posInSet: number;
  readonly setSize: number;
  readonly hasChildren: boolean;
  readonly expanded: boolean;
  readonly match: boolean;
  readonly context: boolean;
}
export interface MachineTreeProjection {
  readonly rows: readonly MachineTreeVisibleRow[];
  /** Matches in the eligible bounded model, including matches beyond visible output. */
  readonly matchCount: number;
  readonly truncated: boolean;
}

function bounded(value: number | undefined, fallback: number, maximum: number, minimum = 0) {
  return value === undefined || !Number.isFinite(value)
    ? fallback
    : Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

/** Tuple encoding avoids delimiter and prototype-key collisions. Occurrences are
 * only needed for invalid duplicate identities; canonical data uses zeroes.
 */
export function machineTreeRowId(
  kind: MachineTreeRowKind,
  machineId: string,
  elementId = machineId,
  occurrence = 0,
  machineOccurrence = 0,
): string {
  return JSON.stringify([machineId, machineOccurrence, kind, elementId, occurrence]);
}

type MutableRow = Omit<
  MachineTreeRow,
  "parentId" | "childIds" | "depth" | "activeDescendant" | "recovered" | "initial"
> & {
  parentId?: string;
  childIds: string[];
  depth: number;
  activeDescendant: boolean;
  recovered: boolean;
  initial: boolean;
};

/** Projects typed, inert document data; it never executes a machine or mutates
 * the document. State containment and actor parentage are deliberately separate.
 * Ingestion is bounded by maxItems (including graph roots); transition rows can
 * be one level deeper than maxDepth. Input strings/arrays and executable Proxy
 * objects are not sandboxed. Duplicate references resolve to the first accepted
 * occurrence and are diagnosed, while duplicate records remain visible.
 * Diagnostics are capped at 200, including an omission notice. Supplied active
 * entries and IDs are capped at 50,000 independently of topology ingestion.
 */
export function buildMachineTree(
  document: MachineDocument,
  options: MachineTreeOptions = {},
): MachineTreeModel {
  const maximum = bounded(options.maxItems, 10_000, 50_000);
  const maxDepth = bounded(options.maxDepth, 64, 256, 1);
  const rows: MutableRow[] = [];
  const byId = new Map<string, MutableRow>();
  const rootIds: string[] = [];
  const issues: MachineTreeIssue[] = [];
  let issuesOmitted = false;
  const graphOccurrences = new Map<string, number>();
  const active = new Map<string, Set<string>>();
  let activeItems = 0;
  let activeTruncated = false;
  for (const entry of options.activeStates ?? []) {
    if (++activeItems > 50_000) {
      activeTruncated = true;
      break;
    }
    const ids = active.get(entry.machineId) ?? new Set<string>();
    for (const id of entry.activeIds) {
      if (++activeItems > 50_000) {
        activeTruncated = true;
        break;
      }
      ids.add(id);
    }
    active.set(entry.machineId, ids);
    if (activeTruncated) break;
  }
  let truncated = false;
  const add = (row: MutableRow) => {
    rows.push(row);
    byId.set(row.id, row);
  };
  const issue = (code: string, message: string, row?: MutableRow) => {
    if (issues.length >= 199) {
      issuesOmitted = true;
      return;
    }
    issues.push({ code, message, ...(row ? { rowId: row.id, machineId: row.machineId } : {}) });
  };
  if (activeTruncated)
    issue(
      "active-limit",
      "Supplied active-state limit reached; active highlighting is incomplete.",
    );
  // Index iteration avoids copying the entire graph collection for root ordering.
  const rootIndex = document.machines.findIndex((graph) => graph.id === document.rootId);
  if (rootIndex < 0) issue("missing-root", "The document root machine is unavailable.");
  const graphAt = (index: number) =>
    rootIndex < 0 ? index : index === 0 ? rootIndex : index <= rootIndex ? index - 1 : index;
  for (let index = 0; index < document.machines.length; index++) {
    if (rows.length >= maximum) {
      truncated = true;
      break;
    }
    const graph = document.machines[graphAt(index)]!;
    const graphOccurrence = graphOccurrences.get(graph.id) ?? 0;
    graphOccurrences.set(graph.id, graphOccurrence + 1);
    const machineRowId = machineTreeRowId("machine", graph.id, graph.id, 0, graphOccurrence);
    const root: MutableRow = {
      id: machineRowId,
      machineRowId,
      kind: "machine",
      machineId: graph.id,
      elementId: graph.id,
      label: graph.label,
      graph,
      childIds: [],
      depth: 0,
      initial: false,
      active: false,
      activeDescendant: false,
      recovered: false,
    };
    add(root);
    rootIds.push(root.id);
    if (graphOccurrence)
      issue(
        "duplicate-machine",
        "Duplicate machine ID; references use its first occurrence.",
        root,
      );
    const nodes: MutableRow[] = [];
    const firstNode = new Map<string, MutableRow>();
    const nodeOccurrences = new Map<string, number>();
    for (const node of graph.nodes) {
      if (rows.length >= maximum) {
        truncated = true;
        break;
      }
      const occurrence = nodeOccurrences.get(node.id) ?? 0;
      nodeOccurrences.set(node.id, occurrence + 1);
      const row: MutableRow = {
        id: machineTreeRowId("node", graph.id, node.id, occurrence, graphOccurrence),
        machineRowId,
        kind: "node",
        machineId: graph.id,
        elementId: node.id,
        label: node.label,
        graph,
        node,
        childIds: [],
        depth: 1,
        parentId: root.id,
        initial: node.kind === "initial",
        active:
          node.kind !== "note" &&
          node.kind !== "initial" &&
          (active.get(graph.id)?.has(node.id) ?? false),
        activeDescendant: false,
        recovered: false,
      };
      add(row);
      nodes.push(row);
      if (occurrence)
        issue("duplicate-node", "Duplicate node ID; references use its first occurrence.", row);
      else firstNode.set(node.id, row);
    }
    for (const row of nodes) {
      const parentId = row.node!.parentId;
      if (parentId === undefined) continue;
      const parent = firstNode.get(parentId);
      if (parent && (parent.node!.kind === "compound" || parent.node!.kind === "parallel")) {
        row.parentId = parent.id;
      } else {
        row.recovered = true;
        issue(
          "invalid-parent",
          "Missing or non-container parent; placed at the machine root.",
          row,
        );
      }
    }
    // Break each containment cycle once, in deterministic document order.
    const done = new Set<string>();
    for (const row of nodes) {
      const path: MutableRow[] = [];
      const pathIndex = new Map<string, number>();
      let current: MutableRow | undefined = row;
      while (current?.kind === "node" && !done.has(current.id)) {
        if (pathIndex.has(current.id)) {
          current.parentId = root.id;
          current.recovered = true;
          issue(
            "parent-cycle",
            "Containment cycle broken at this node; placed at the machine root.",
            current,
          );
          break;
        }
        pathIndex.set(current.id, path.length);
        path.push(current);
        current = current.parentId ? byId.get(current.parentId) : undefined;
      }
      for (const entry of path) done.add(entry.id);
    }
    for (const row of nodes) {
      let depth = 1;
      let parent = row.parentId ? byId.get(row.parentId) : undefined;
      while (parent?.kind === "node" && depth <= maxDepth) {
        depth++;
        parent = parent.parentId ? byId.get(parent.parentId) : undefined;
      }
      if (depth > maxDepth) {
        row.parentId = root.id;
        row.recovered = true;
        issue("depth-limit", "Containment depth limit reached; placed at the machine root.", row);
      }
    }
    // Initial pointers describe direct executable children, not arbitrary IDs.
    // Resolve after recovery so malformed containment cannot invent a badge.
    const markInitial = (owner: MutableRow, initialId: string | undefined) => {
      if (initialId === undefined) return;
      const target = firstNode.get(initialId);
      const container =
        owner.kind === "machine" ||
        owner.node?.kind === "compound" ||
        owner.node?.kind === "parallel";
      const declaredParent = owner.kind === "machine" ? undefined : owner.elementId;
      if (
        container &&
        target &&
        target.node!.kind !== "note" &&
        target.node!.parentId === declaredParent &&
        target.parentId === owner.id
      ) {
        target.initial = true;
      } else {
        issue(
          "invalid-initial",
          "Initial target is not an available direct executable child.",
          owner,
        );
      }
    };
    markInitial(root, graph.initialId);
    for (const row of nodes) markInitial(row, row.node!.initialId);
    for (const row of nodes) byId.get(row.parentId!)!.childIds.push(row.id);
    const transitionOccurrences = new Map<string, number>();
    for (const transition of graph.transitions) {
      if (rows.length >= maximum) {
        truncated = true;
        break;
      }
      const occurrence = transitionOccurrences.get(transition.id) ?? 0;
      transitionOccurrences.set(transition.id, occurrence + 1);
      const source = firstNode.get(transition.sourceId);
      const validSource = source?.node?.kind !== "note" ? source : undefined;
      const row: MutableRow = {
        id: machineTreeRowId("transition", graph.id, transition.id, occurrence, graphOccurrence),
        machineRowId,
        kind: "transition",
        machineId: graph.id,
        elementId: transition.id,
        label: transition.event || "Automatic transition",
        graph,
        transition,
        parentId: validSource?.id ?? root.id,
        childIds: [],
        depth: 1,
        initial: false,
        active: false,
        activeDescendant: false,
        recovered: !validSource,
      };
      add(row);
      byId.get(row.parentId!)!.childIds.push(row.id);
      if (occurrence)
        issue(
          "duplicate-transition",
          "Duplicate transition ID; references use its first occurrence.",
          row,
        );
      if (!validSource)
        issue(
          "missing-source",
          "Transition source is unavailable; shown at the machine root.",
          row,
        );
      if (!firstNode.has(transition.targetId))
        issue("missing-target", "Transition target is unavailable.", row);
      else if (firstNode.get(transition.targetId)!.node!.kind === "note")
        issue("invalid-target", "An annotation cannot be a transition target.", row);
    }
  }
  if (truncated) issue("item-limit", "Input item limit reached; the tree is incomplete.");
  const acceptedGraphs = new Set(
    rows.filter((row) => row.kind === "machine").map((row) => row.machineId),
  );
  for (const row of rows) {
    if (
      row.node?.kind === "submachine" &&
      (!row.node.machineId || !acceptedGraphs.has(row.node.machineId))
    )
      issue("missing-submachine", "Referenced machine is unavailable in this tree.", row);
  }
  // Iterative preorder makes the output directly useful for keyboard traversal.
  const ordered: MutableRow[] = [];
  const stack = [...rootIds].reverse().map((id) => ({ id, depth: 0 }));
  while (stack.length) {
    const entry = stack.pop()!;
    const row = byId.get(entry.id)!;
    row.depth = entry.depth;
    ordered.push(row);
    for (let i = row.childIds.length - 1; i >= 0; i--)
      stack.push({ id: row.childIds[i]!, depth: entry.depth + 1 });
  }
  for (let i = ordered.length - 1; i >= 0; i--) {
    const row = ordered[i]!;
    if ((row.active || row.activeDescendant) && row.parentId)
      byId.get(row.parentId)!.activeDescendant = true;
  }
  if (issuesOmitted)
    issues.push({ code: "issue-limit", message: "Additional tree diagnostics were omitted." });
  return { rows: ordered, rootIds, issues, truncated: truncated || activeTruncated };
}

/** Returns root-to-parent row IDs, never the requested row itself. */
export function machineTreeAncestors(model: MachineTreeModel, rowId: string): readonly string[] {
  const byId = new Map(model.rows.map((row) => [row.id, row]));
  const result: string[] = [];
  const seen = new Set<string>([rowId]);
  let row = byId.get(rowId);
  while (row?.parentId && !seen.has(row.parentId)) {
    seen.add(row.parentId);
    result.push(row.parentId);
    row = byId.get(row.parentId);
  }
  return result.reverse();
}

/** Canonical lookup uses the first accepted occurrence, including invalid duplicates. */
export function findMachineTreeRow(
  model: MachineTreeModel,
  machineId: string,
  kind: MachineTreeRowKind,
  elementId = machineId,
): MachineTreeRow | undefined {
  return model.rows.find((row) => row.id === machineTreeRowId(kind, machineId, elementId));
}

/** Resolve the first ingested node, not the first preorder position. A later
 * duplicate may appear earlier in the flattened hierarchy. Machine root order
 * retains the occurrence numbering even when the same graph object is reused.
 */
function canonicalNodeInMachine(
  model: MachineTreeModel,
  owner: MachineTreeRow,
  elementId: string,
): MachineTreeRow | undefined {
  let occurrence = 0;
  for (const row of model.rows) {
    if (row.kind !== "machine" || row.machineId !== owner.machineId) continue;
    if (row.id === owner.machineRowId) {
      const id = machineTreeRowId("node", owner.machineId, elementId, 0, occurrence);
      return model.rows.find((candidate) => candidate.id === id);
    }
    occurrence++;
  }
  return undefined;
}

/** Resolves a transition's target in its source graph occurrence, or a referenced
 * machine's first occurrence. Resolution is navigation, never transition firing.
 */
export function resolveMachineTreeTarget(
  model: MachineTreeModel,
  rowId: string,
): MachineTreeRow | undefined {
  const row = model.rows.find((entry) => entry.id === rowId);
  if (row?.transition) {
    const target = canonicalNodeInMachine(model, row, row.transition.targetId);
    return target?.node?.kind === "note" ? undefined : target;
  }
  if (row?.node?.kind === "submachine" && row.node.machineId)
    return findMachineTreeRow(model, row.node.machineId, "machine");
  return undefined;
}

/** Resolves a transition's valid source within its machine-row occurrence.
 * Repeated graph objects are not an identity boundary; row IDs are.
 */
export function resolveMachineTreeSource(
  model: MachineTreeModel,
  rowId: string,
): MachineTreeRow | undefined {
  const row = model.rows.find((entry) => entry.id === rowId);
  if (!row?.transition) return undefined;
  const source = canonicalNodeInMachine(model, row, row.transition.sourceId);
  return source?.node?.kind === "note" ? undefined : source;
}

function searchText(row: MachineTreeRow): string[] {
  return [
    // A region's id is made up for the tree; only its title is something a person would search for.
    row.region ? undefined : row.elementId,
    row.label,
    row.node?.description,
    ...(row.node?.tags ?? []),
    ...(row.node?.entry ?? []),
    ...(row.node?.exit ?? []),
    row.node?.meta?.kind,
    row.node?.meta?.summary,
    ...(row.node?.meta?.details ?? []).flatMap((detail) => [detail.label, detail.value]),
    row.transition?.description,
    row.transition?.sourceId,
    row.transition?.targetId,
    row.transition?.guard,
    ...(row.transition?.actions ?? []),
  ].filter((value): value is string => value !== undefined);
}

/** Search reveals only matches and their ancestor context, independent of saved
 * folding. Empty search restores the supplied folding exactly. Search examines
 * the bounded model, not diagnostic payloads; text lengths are not capped.
 */
export function projectMachineTree(
  model: MachineTreeModel,
  options: MachineTreeProjectionOptions = {},
): MachineTreeProjection {
  const maximum = bounded(options.maxVisibleRows, 1000, 50_000);
  const query = options.query?.trim().toLowerCase() ?? "";
  const eligible = new Map(
    model.rows
      .filter(
        (row) =>
          (options.showNotes !== false || row.node?.kind !== "note") &&
          (options.showTransitions !== false || row.kind !== "transition"),
      )
      .map((row) => [row.id, row]),
  );
  const matches = new Set<string>();
  const included = new Set<string>();
  if (query) {
    for (const row of eligible.values()) {
      if (!searchText(row).some((text) => text.toLowerCase().includes(query))) continue;
      matches.add(row.id);
      let current: MachineTreeRow | undefined = row;
      while (current && !included.has(current.id)) {
        included.add(current.id);
        current = current.parentId ? eligible.get(current.parentId) : undefined;
      }
    }
  }
  const children = (ids: readonly string[]) =>
    ids.filter((id) => eligible.has(id) && (!query || included.has(id)));
  const roots = children(model.rootIds);
  const stack = roots
    .map((id, index) => ({ id, level: 1, posInSet: index + 1, setSize: roots.length }))
    .reverse();
  const rows: MachineTreeVisibleRow[] = [];
  const visited = new Set<string>();
  while (stack.length && rows.length < maximum) {
    const next = stack.pop()!;
    if (visited.has(next.id)) continue;
    visited.add(next.id);
    const row = eligible.get(next.id)!;
    const childIds = children(row.childIds);
    const expanded =
      childIds.length > 0 &&
      (Boolean(query) || options.expandedIds === undefined || options.expandedIds.has(row.id));
    rows.push({
      ...row,
      level: next.level,
      posInSet: next.posInSet,
      setSize: next.setSize,
      hasChildren: childIds.length > 0,
      expanded,
      match: matches.has(row.id),
      context: Boolean(query) && !matches.has(row.id),
    });
    if (expanded)
      for (let i = childIds.length - 1; i >= 0; i--)
        stack.push({
          id: childIds[i]!,
          level: next.level + 1,
          posInSet: i + 1,
          setSize: childIds.length,
        });
  }
  return { rows, matchCount: matches.size, truncated: model.truncated || stack.length > 0 };
}
