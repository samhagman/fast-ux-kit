import * as React from "react";
import { MachineObservationDemo } from "@/demo/machine-observation-demo";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import type {
  MachineDocument,
  MachineGraph,
  MachineRuntimeOptions,
  MachineScenario,
} from "@samhagman/fast-ux-kit/core";
import { machineLabCases } from "@/demo/machine-lab-data";
import { MachineTree } from "@samhagman/fast-ux-kit/machine-tree";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@samhagman/fast-ux-kit/components/ui/select";

interface TreeCase {
  readonly id: string;
  readonly label: string;
  readonly document: MachineDocument;
  readonly options: MachineRuntimeOptions;
  readonly scenarios: readonly MachineScenario[];
  readonly maxItems?: number;
}

/** A deliberately malformed import: exercises the core's diagnostics, recovery and error status. */
const malformed: MachineDocument = {
  version: 1,
  rootId: "broken",
  machines: [
    {
      id: "broken",
      label: "Imported workflow (malformed)",
      initialId: "b-start",
      nodes: [
        { id: "b-start", label: "Start", kind: "atomic" },
        { id: "b-orphan", label: "Orphaned step", kind: "atomic", parentId: "b-ghost" },
        { id: "b-group", label: "Grouped work", kind: "compound", initialId: "b-nope" },
        { id: "b-inner", label: "Inner task", kind: "atomic", parentId: "b-group" },
        { id: "b-sub", label: "External review", kind: "submachine", machineId: "absent" },
        { id: "b-start", label: "Start (duplicate id)", kind: "atomic" },
      ],
      transitions: [
        { id: "b-go", sourceId: "b-start", targetId: "b-group", event: "GO" },
        { id: "b-lost", sourceId: "b-inner", targetId: "b-missing", event: "FINISH" },
        { id: "b-dangling", sourceId: "b-gone", targetId: "b-start", event: "RESET" },
      ],
    },
  ],
};

/** A wide machine generated past a small item bound to show the truncation notice. */
function largeDocument(): MachineDocument {
  const nodes: MachineGraph["nodes"][number][] = [];
  const transitions: MachineGraph["transitions"][number][] = [];
  for (let g = 0; g < 10; g++) {
    nodes.push({ id: `g${g}`, label: `Stage ${g + 1}`, kind: "compound", initialId: `g${g}-s0` });
    for (let s = 0; s < 8; s++) {
      nodes.push({
        id: `g${g}-s${s}`,
        label: `Step ${g + 1}.${s + 1}`,
        kind: "atomic",
        parentId: `g${g}`,
      });
      if (s < 7)
        transitions.push({
          id: `g${g}-t${s}`,
          sourceId: `g${g}-s${s}`,
          targetId: `g${g}-s${s + 1}`,
          event: "NEXT",
        });
    }
    if (g < 9)
      transitions.push({
        id: `g${g}-done`,
        sourceId: `g${g}`,
        targetId: `g${g + 1}`,
        event: "ADVANCE",
      });
  }
  return {
    version: 1,
    rootId: "large",
    machines: [{ id: "large", label: "Large pipeline", initialId: "g0", nodes, transitions }],
  };
}

/**
 * Release approval again, with its publish attempt declared as a region: a named box the tree draws
 * shut until it is opened. Only the drawing differs; the machine runs exactly as the plain case does.
 */
const release = machineLabCases.find((lab) => lab.id === "release")!;
const withRegion: MachineDocument = {
  ...release.document,
  machines: release.document.machines.map((graph) => ({
    ...graph,
    regions: { publishing: { label: "Publish attempt" } },
    nodes: graph.nodes.map((node) =>
      node.id === "release-publish" || node.id === "release-retry"
        ? { ...node, region: "publishing" }
        : node,
    ),
  })),
};

const synthetic: readonly TreeCase[] = [
  {
    id: "regions",
    label: "Release approval, with a region",
    document: withRegion,
    options: release.options,
    scenarios: release.scenarios,
  },
  { id: "malformed", label: "Malformed import", document: malformed, options: {}, scenarios: [] },
  {
    id: "large",
    label: "Large (item limit)",
    document: largeDocument(),
    options: {},
    scenarios: [],
    maxItems: 120,
  },
];
const cases: readonly TreeCase[] = [...machineLabCases, ...synthetic];

export function MachineTreePage() {
  const [caseId, setCaseId] = React.useState(
    () =>
      cases.find((c) => c.id === new URLSearchParams(window.location.search).get("machine"))?.id ??
      "launch",
  );
  const lab = cases.find((c) => c.id === caseId)!;
  // Exercises the controlled API: the find query round-trips through `?q=`, and the run reports out.
  const [query, setQuery] = React.useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  );
  const [run, setRun] = React.useState("");
  // `?pair`: a second, independent instance of the same machine (instance isolation: toasts, ⌘K, focus).
  const [pair] = React.useState(() => new URLSearchParams(window.location.search).has("pair"));
  // `?dir=rtl`: a right-to-left host (the tree mirrors; its toasts, ⌘K and sheet follow).
  const [dir] = React.useState<"rtl" | undefined>(() =>
    new URLSearchParams(window.location.search).get("dir") === "rtl" ? "rtl" : undefined,
  );
  // Two instances of one machine need distinct accessible names (tree and notifications landmarks).
  const machineLabel =
    lab.document.machines.find((m) => m.id === lab.document.rootId)?.label ?? lab.label;
  const writeParam = (key: string, value: string) => {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url);
  };
  const [inspectDemo, setInspectDemo] = React.useState(
    () => new URLSearchParams(window.location.search).get("inspect") === "1",
  );
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-background/60 px-4">
        <h1 className="text-ui font-semibold max-sm:sr-only">Machine Tree</h1>
        <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden">
          registry/machine-tree
        </span>
        {run && (
          <span
            aria-live="off"
            className="font-mono text-[11px] text-muted-foreground max-md:hidden"
          >
            onSimulationChange → {run}
          </span>
        )}
        <div className="ms-auto flex items-center gap-2">
          <Button
            size="sm"
            variant={inspectDemo ? "secondary" : "outline"}
            aria-pressed={inspectDemo}
            onClick={() => setInspectDemo((value) => !value)}
          >
            Inspect sample run
          </Button>
          {!inspectDemo && (
            <>
              <span className="text-ui text-muted-foreground max-sm:hidden">Example</span>
              <Select
                value={caseId}
                onValueChange={(id) => {
                  setCaseId(id);
                  setRun("");
                  writeParam("machine", id);
                  // A query belongs to the machine it was typed against.
                  setQuery("");
                  writeParam("q", "");
                }}
              >
                {/* `data-[size=sm]:h-7` out-specifies a bare `coarse:h-11`: match its variant to win on touch. */}
                <SelectTrigger size="sm" className="w-48 text-ui coarse:data-[size=sm]:h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {machineLabCases.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-ui">
                      {c.label}
                    </SelectItem>
                  ))}
                  <SelectSeparator />
                  {synthetic.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-ui">
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>
      <div
        className={
          pair ? "grid min-h-0 flex-1 grid-rows-2 gap-4 p-0 sm:p-4" : "min-h-0 flex-1 p-0 sm:p-4"
        }
      >
        {inspectDemo ? (
          <MachineObservationDemo dir={dir} view="tree" />
        ) : (
          <MachineTree
            key={caseId}
            document={lab.document}
            runtime={lab.options}
            scenarios={lab.scenarios}
            {...(lab.maxItems ? { maxItems: lab.maxItems } : {})}
            {...(dir ? { dir } : {})}
            {...(pair ? { label: `${machineLabel} (top)` } : {})}
            query={query}
            onQueryChange={(next) => {
              setQuery(next);
              writeParam("q", next);
            }}
            onSimulationChange={(snapshot) =>
              setRun(
                snapshot
                  ? `${snapshot.status}${snapshot.status === "error" && snapshot.error ? ` (${snapshot.error})` : ""} · ${plural(Math.max(0, snapshot.trace.length - 1), "step")}`
                  : "",
              )
            }
            className="h-full max-sm:rounded-none max-sm:border-x-0"
          />
        )}
        {pair && !inspectDemo && (
          <MachineTree
            key={`${caseId}-pair`}
            document={lab.document}
            runtime={lab.options}
            scenarios={lab.scenarios}
            label={`${machineLabel} (bottom)`}
            {...(dir ? { dir } : {})}
            className="h-full min-h-0 max-sm:rounded-none max-sm:border-x-0"
          />
        )}
      </div>
    </div>
  );
}
