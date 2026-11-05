import type {
  MachineCommand,
  MachineCommandResult,
  MachineDocument,
  MachineGraph,
  MachineHistory,
} from "./types.js";
import { machineDescendants, validateMachineDocument } from "./model.js";
import { layoutMachineGraph } from "./layout.js";
export function applyMachineCommand(
  document: MachineDocument,
  command: MachineCommand,
): MachineCommandResult {
  const refusal = (message: string): MachineCommandResult => ({
    ok: false,
    document,
    issues: [{ code: "invalid-command", severity: "error", message }],
  });
  let candidate: MachineDocument;
  if (command.type === "add-machine")
    candidate = { ...document, machines: [...document.machines, command.machine] };
  else {
    const graph = document.machines.find((m) => m.id === command.machineId);
    if (!graph) return refusal("The machine does not exist.");
    let next: MachineGraph = graph;
    if (command.type === "add-node") next = { ...graph, nodes: [...graph.nodes, command.node] };
    else if (command.type === "add-transition")
      next = { ...graph, transitions: [...graph.transitions, command.transition] };
    else if (command.type === "update-machine") next = { ...graph, ...command.patch };
    else if (command.type === "layout") {
      const layout = layoutMachineGraph(graph, command.direction, false);
      next = {
        ...graph,
        nodes: graph.nodes.map((n) => {
          const p = layout.nodes.find((r) => r.id === n.id);
          return p ? { ...n, position: { x: p.x, y: p.y } } : n;
        }),
      };
    } else if (command.type === "delete-transition" || command.type === "update-transition") {
      if (!graph.transitions.some((t) => t.id === command.id))
        return refusal("The transition does not exist.");
      next = {
        ...graph,
        transitions:
          command.type === "delete-transition"
            ? graph.transitions.filter((t) => t.id !== command.id)
            : graph.transitions.map((t) =>
                t.id === command.id ? { ...t, ...command.patch, id: t.id } : t,
              ),
      };
    } else {
      if (!graph.nodes.some((n) => n.id === command.id)) return refusal("The node does not exist.");
      if (command.type === "delete-node") {
        const deleted = new Set(machineDescendants(graph, command.id));
        next = {
          ...graph,
          initialId: graph.initialId && deleted.has(graph.initialId) ? undefined : graph.initialId,
          nodes: graph.nodes
            .filter((n) => !deleted.has(n.id))
            .map((n) => ({
              ...n,
              ...(n.initialId && deleted.has(n.initialId) ? { initialId: undefined } : {}),
              ...(n.attachedToId && deleted.has(n.attachedToId) ? { attachedToId: undefined } : {}),
            })),
          transitions: graph.transitions.filter(
            (t) => !deleted.has(t.sourceId) && !deleted.has(t.targetId),
          ),
        };
      } else if (command.type === "move-node") {
        const layout = layoutMachineGraph(graph, command.direction ?? "LR");
        const origin = layout.nodes.find((n) => n.id === command.id)!;
        const ids = new Set(machineDescendants(graph, command.id));
        const dx = command.position.x - origin.x,
          dy = command.position.y - origin.y;
        next = {
          ...graph,
          nodes: graph.nodes.map((n) => {
            if (!ids.has(n.id)) return n;
            const rect = layout.nodes.find((r) => r.id === n.id);
            return rect ? { ...n, position: { x: rect.x + dx, y: rect.y + dy } } : n;
          }),
        };
      } else if (command.type === "reparent-node") {
        next = {
          ...graph,
          initialId:
            graph.initialId === command.id && command.parentId ? undefined : graph.initialId,
          nodes: graph.nodes.map((n) =>
            n.id === command.id
              ? { ...n, parentId: command.parentId }
              : n.initialId === command.id && n.id !== command.parentId
                ? { ...n, initialId: undefined }
                : n,
          ),
        };
      } else {
        next = {
          ...graph,
          nodes: graph.nodes.map((n) =>
            n.id === command.id ? { ...n, ...command.patch, id: n.id } : n,
          ),
        };
      }
    }
    candidate = { ...document, machines: document.machines.map((m) => (m === graph ? next : m)) };
  }
  const issues = validateMachineDocument(candidate);
  if (issues.some((i) => i.severity === "error")) return { ok: false, document, issues };
  return { ok: true, document: candidate, issues };
}
export function createMachineHistory(document: MachineDocument): MachineHistory {
  return { past: [], present: document, future: [] };
}
export function commitMachineHistory(
  history: MachineHistory,
  document: MachineDocument,
  limit = 100,
): MachineHistory {
  if (document === history.present) return history;
  const bounded = Math.max(1, Math.min(1000, Number.isFinite(limit) ? Math.floor(limit) : 100));
  return {
    past: [...history.past, history.present].slice(-bounded),
    present: document,
    future: [],
  };
}
export function undoMachineHistory(history: MachineHistory): MachineHistory {
  const previous = history.past.at(-1);
  return previous
    ? {
        past: history.past.slice(0, -1),
        present: previous,
        future: [history.present, ...history.future],
      }
    : history;
}
export function redoMachineHistory(history: MachineHistory): MachineHistory {
  const next = history.future[0];
  return next
    ? { past: [...history.past, history.present], present: next, future: history.future.slice(1) }
    : history;
}
