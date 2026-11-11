import { AlertTriangle, CircleAlert, CircleCheck } from "lucide-react";
import { useMachine } from "./machine-context.js";

/** Issues tab: validation errors and warnings; a row selects (and reveals) what it is about. */
export function IssuesPanel() {
  const mv = useMachine();
  if (!mv.issues.length)
    return (
      <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/8 px-3 py-2.5 text-[12px] text-success">
        <CircleCheck className="size-4" /> No issues. Every state is reachable and valid.
      </div>
    );
  const subject = (issue: (typeof mv.issues)[number]) => {
    if (issue.nodeId) return mv.graph.nodes.find((n) => n.id === issue.nodeId)?.label;
    if (issue.transitionId) {
      const t = mv.graph.transitions.find((x) => x.id === issue.transitionId);
      return t ? `${t.event || "always"}` : undefined;
    }
    return mv.graph.label;
  };
  return (
    <ul className="grid gap-1.5">
      {mv.issues.map((issue, index) => (
        <li key={index}>
          <button
            type="button"
            onClick={() => {
              if (issue.nodeId) mv.reveal(issue.machineId ?? mv.machineId, issue.nodeId, "node");
              else if (issue.transitionId)
                mv.reveal(issue.machineId ?? mv.machineId, issue.transitionId, "transition");
            }}
            className="flex w-full items-start gap-2 rounded-lg border px-2.5 py-2 text-start transition-colors hover:bg-muted/60"
          >
            {issue.severity === "error" ? (
              <CircleAlert className="mt-px size-3.5 shrink-0 text-destructive" />
            ) : (
              <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
            )}
            <span className="text-[12px] leading-4">
              {subject(issue) && <span className="font-medium">{subject(issue)}: </span>}
              <span className="text-muted-foreground">{issue.message}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
