import type { MachineDocument, MachineGraph, MachineIssue, MachineNode } from "./types.js";
const kinds = new Set(["atomic", "compound", "parallel", "initial", "final", "submachine", "note"]);
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
export function machineAncestors(graph: MachineGraph, id: string): MachineNode[] {
  const result: MachineNode[] = [];
  const seen = new Set<string>();
  let node = graph.nodes.find((n) => n.id === id);
  while (node && !seen.has(node.id)) {
    result.push(node);
    seen.add(node.id);
    node = graph.nodes.find((n) => n.id === node!.parentId);
  }
  return result;
}
export function machineDescendants(graph: MachineGraph, id: string): string[] {
  return graph.nodes
    .filter((n) => machineAncestors(graph, n.id).some((p) => p.id === id))
    .map((n) => n.id);
}
/** Structural errors are separate from advisory incomplete-authoring warnings. */
export function validateMachineDocument(value: unknown): MachineIssue[] {
  const issues: MachineIssue[] = [];
  const add = (
    code: string,
    message: string,
    target: Partial<MachineIssue> = {},
    severity: "error" | "warning" = "error",
  ) => issues.push({ code, message, severity, ...target });
  if (
    !record(value) ||
    value.version !== 1 ||
    !text(value.rootId) ||
    !Array.isArray(value.machines)
  ) {
    add("invalid-document", "Expected a version 1 machine document with a root and machines.");
    return issues;
  }
  if (value.machines.length > 100) {
    add("document-limit", "A document supports at most 100 machines.");
    return issues;
  }
  const allIds = new Set<string>();
  const machineIds = new Set<string>();
  for (const raw of value.machines) {
    if (
      !record(raw) ||
      !text(raw.id) ||
      !text(raw.label) ||
      !Array.isArray(raw.nodes) ||
      !Array.isArray(raw.transitions)
    ) {
      add("invalid-machine", "Each machine needs an ID, label, nodes and transitions.");
      continue;
    }
    const machineId = raw.id;
    const target = { machineId };
    if (machineIds.has(machineId)) add("duplicate-machine", "Machine IDs must be unique.", target);
    machineIds.add(machineId);
    if (raw.nodes.length > 2000 || raw.transitions.length > 5000) {
      add("graph-limit", "A graph supports at most 2,000 nodes and 5,000 transitions.", target);
      continue;
    }
    const nodes = new Map<string, MachineNode>();
    for (const candidate of raw.nodes) {
      if (
        !record(candidate) ||
        !text(candidate.id) ||
        typeof candidate.label !== "string" ||
        typeof candidate.kind !== "string" ||
        !kinds.has(candidate.kind)
      ) {
        add("invalid-node", "Each node needs a valid ID, label and kind.", target);
        continue;
      }
      const n = candidate as unknown as MachineNode;
      const loc = { ...target, nodeId: n.id };
      if (allIds.has(n.id))
        add("duplicate-id", "Node and transition IDs must be document-wide unique.", loc);
      allIds.add(n.id);
      nodes.set(n.id, n);
      for (const key of [
        "parentId",
        "initialId",
        "machineId",
        "attachedToId",
        "description",
      ] as const)
        if (n[key] !== undefined && typeof n[key] !== "string")
          add("invalid-node-field", `${key} must be text.`, loc);
      for (const key of ["parentId", "initialId", "machineId", "attachedToId"] as const)
        if (n[key] !== undefined && !text(n[key]))
          add("empty-reference", `${key} must be a nonempty ID or omitted.`, loc);
      for (const key of ["entry", "exit", "tags"] as const)
        if (n[key] !== undefined && (!Array.isArray(n[key]) || !n[key]!.every(text)))
          add("invalid-node-field", `${key} must contain nonempty names.`, loc);
      if (
        n.position !== undefined &&
        (!record(n.position) ||
          !Number.isFinite(n.position.x) ||
          !Number.isFinite(n.position.y) ||
          Math.abs(n.position.x) > 1e6 ||
          Math.abs(n.position.y) > 1e6)
      )
        add(
          "invalid-position",
          "Positions must be finite coordinates within the canvas range.",
          loc,
        );
    }
    for (const n of nodes.values()) {
      const loc = { ...target, nodeId: n.id };
      if (
        n.attachedToId &&
        (n.kind !== "note" ||
          !nodes.has(n.attachedToId) ||
          nodes.get(n.attachedToId)?.kind === "note")
      )
        add(
          "invalid-note-attachment",
          "Only a note can attach to an existing state in the same machine.",
          loc,
        );
      if (n.parentId) {
        const p = nodes.get(n.parentId);
        if (!p) add("missing-parent", "The parent node does not exist in this machine.", loc);
        else if (p.kind !== "compound" && p.kind !== "parallel")
          add("invalid-parent", "Only compound and parallel nodes may contain states.", loc);
      }
      const seen = new Set([n.id]);
      let parent = n.parentId;
      let depth = 0;
      while (parent && nodes.has(parent)) {
        if (seen.has(parent)) {
          add("parent-cycle", "A node cannot contain itself or an ancestor.", loc);
          break;
        }
        seen.add(parent);
        parent = nodes.get(parent)?.parentId;
        if (++depth > 64) {
          add("depth-limit", "Hierarchy must not exceed 64 levels.", loc);
          break;
        }
      }
      if (
        n.initialId &&
        (nodes.get(n.initialId)?.parentId !== n.id || nodes.get(n.initialId)?.kind === "note")
      )
        add("invalid-initial", "An initial target must be a direct executable child.", loc);
      if (
        n.kind === "compound" &&
        !n.initialId &&
        ![...nodes.values()].some((c) => c.parentId === n.id && c.kind === "initial")
      )
        add("missing-initial", "Choose an initial state for this compound.", loc, "warning");
      if (n.kind === "submachine" && !n.machineId)
        add("missing-submachine", "Choose a referenced machine.", loc, "warning");
    }
    const transitions = raw.transitions;
    for (const t of transitions) {
      if (!record(t) || !text(t.id) || !text(t.sourceId) || !text(t.targetId)) {
        add("invalid-transition", "Transitions need an ID, source and target.", target);
        continue;
      }
      const loc = { ...target, transitionId: t.id };
      if (allIds.has(t.id))
        add("duplicate-id", "Node and transition IDs must be document-wide unique.", loc);
      allIds.add(t.id);
      if (!nodes.has(t.sourceId) || !nodes.has(t.targetId))
        add("missing-endpoint", "A transition endpoint is missing.", loc);
      if (nodes.get(t.sourceId)?.kind === "note" || nodes.get(t.targetId)?.kind === "note")
        add("note-transition", "Notes cannot participate in transitions.", loc);
      if (nodes.get(t.sourceId)?.kind === "final")
        add("final-transition", "Final states cannot have outgoing transitions.", loc);
      for (const key of ["event", "guard", "description"])
        if (t[key] !== undefined && typeof t[key] !== "string")
          add("invalid-transition-field", `${key} must be text.`, loc);
      if (t.internal !== undefined && typeof t.internal !== "boolean")
        add("invalid-transition-field", "internal must be boolean.", loc);
      if (t.actions !== undefined && (!Array.isArray(t.actions) || !t.actions.every(text)))
        add("invalid-transition-field", "Actions must contain nonempty names.", loc);
    }
    for (const n of nodes.values())
      if (n.kind === "initial") {
        const outgoing = transitions.filter((t) => record(t) && t.sourceId === n.id);
        if (outgoing.length !== 1)
          add(
            "initial-transition",
            "An initial marker needs exactly one outgoing transition.",
            { ...target, nodeId: n.id },
            "warning",
          );
      }
    if (
      raw.initialId !== undefined &&
      (typeof raw.initialId !== "string" ||
        !nodes.has(raw.initialId) ||
        nodes.get(raw.initialId)?.parentId ||
        nodes.get(raw.initialId)?.kind === "note")
    )
      add(
        "invalid-root-initial",
        "The machine initial state must be an executable root node.",
        target,
      );
    if (!raw.initialId && ![...nodes.values()].some((n) => !n.parentId && n.kind === "initial"))
      add("missing-root-initial", "Choose a starting state for this machine.", target, "warning");
    // Structural reachability ignores guard outcomes: a warning means no possible route,
    // not that a particular runtime context can satisfy an expression.
    const roots = [...nodes.values()].filter((n) => !n.parentId && n.kind !== "note");
    const start =
      roots.find((n) => n.id === raw.initialId) ??
      roots.find((n) => n.kind === "initial") ??
      roots[0];
    const reachable = new Set<string>();
    const pending = start ? [start.id] : [];
    while (pending.length) {
      const id = pending.pop()!;
      if (reachable.has(id)) continue;
      const node = nodes.get(id);
      if (!node) continue;
      reachable.add(id);
      if (node.parentId) pending.push(node.parentId);
      const children = [...nodes.values()].filter((n) => n.parentId === id && n.kind !== "note");
      if (node.kind === "parallel") pending.push(...children.map((n) => n.id));
      else if (node.kind === "compound") {
        const initial =
          children.find((n) => n.id === node.initialId) ??
          children.find((n) => n.kind === "initial") ??
          children[0];
        if (initial) pending.push(initial.id);
      }
      for (const edge of transitions)
        if (record(edge) && edge.sourceId === id && typeof edge.targetId === "string")
          pending.push(edge.targetId);
    }
    for (const node of nodes.values())
      if (node.kind !== "note" && !reachable.has(node.id))
        add(
          "unreachable-state",
          "No structural route reaches this state from the machine's initial configuration.",
          { ...target, nodeId: node.id },
          "warning",
        );
  }
  if (!machineIds.has(value.rootId)) add("missing-root", "The root machine does not exist.");
  for (const raw of value.machines)
    if (record(raw) && Array.isArray(raw.nodes))
      for (const n of raw.nodes)
        if (
          record(n) &&
          n.kind === "submachine" &&
          typeof n.machineId === "string" &&
          !machineIds.has(n.machineId)
        )
          add("missing-machine", "The referenced machine does not exist.", {
            machineId: String(raw.id),
            nodeId: String(n.id),
          });
  return issues;
}
export function parseMachineDocument(source: string): {
  ok: boolean;
  document?: MachineDocument;
  issues: readonly MachineIssue[];
} {
  if (source.length > 5_000_000)
    return {
      ok: false,
      issues: [
        {
          severity: "error",
          code: "import-limit",
          message: "Machine imports must be smaller than 5 million characters.",
        },
      ],
    };
  try {
    const value: unknown = JSON.parse(source);
    const pending: { value: unknown; depth: number }[] = [{ value, depth: 0 }];
    let entries = 0;
    while (pending.length) {
      const current = pending.pop()!;
      if (current.depth > 64 || ++entries > 100_000)
        return {
          ok: false,
          issues: [
            {
              severity: "error",
              code: "import-complexity",
              message: "Imported data exceeds the 64-level or 100,000-value safety limit.",
            },
          ],
        };
      if (current.value && typeof current.value === "object") {
        for (const key in current.value) {
          if (!Object.hasOwn(current.value, key)) continue;
          if (entries + pending.length >= 100_000)
            return {
              ok: false,
              issues: [
                {
                  severity: "error",
                  code: "import-complexity",
                  message: "Imported data exceeds the 100,000-value safety limit.",
                },
              ],
            };
          pending.push({
            value: (current.value as Record<string, unknown>)[key],
            depth: current.depth + 1,
          });
        }
      }
    }

    const issues = validateMachineDocument(value);
    return issues.some((i) => i.severity === "error")
      ? { ok: false, issues }
      : { ok: true, document: value as MachineDocument, issues };
  } catch {
    return {
      ok: false,
      issues: [
        { severity: "error", code: "invalid-json", message: "The document is not valid JSON." },
      ],
    };
  }
}
export function serializeMachineDocument(document: MachineDocument): string {
  return JSON.stringify(document, null, 2);
}
