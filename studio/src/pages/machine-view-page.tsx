import * as React from "react";
import type { MachineDocument } from "@samhagman/fast-ux-kit/core";
import { machineLabCases } from "@/demo/machine-lab-data";
import {
  MachineView,
  type DistributiveOmit,
  type DocumentChangeHandler,
  type MachineViewProps,
} from "@samhagman/fast-ux-kit/machine-view";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@samhagman/fast-ux-kit/components/ui/select";

/**
 * Demo hosts for the document contract (`?host=`), each a real integration shape:
 *
 *   (none)   uncontrolled: `defaultDocument`, the view owns the document
 *   listen   uncontrolled + `onDocumentChange` as a notification (autosave): counts saves
 *   clone    controlled: echoes a structuredClone of every proposal in the same tick (a store)
 *   late     controlled: echoes a clone LATE_MS later (a server round trip)
 *   reject   controlled: vetoes every proposal (`return false`)
 *
 * `?readonly=1`: the read-only preset (view and simulate only). With `&controlled=1` it is a live
 * viewer: `document` + `readOnly`, no `onDocumentChange`; "Push update" plays a server changing the
 * document, and the view re-renders from the prop. `?dir=rtl`: a right-to-left page.
 */
type Host = "listen" | "clone" | "late" | "reject";
const HOSTS: readonly Host[] = ["listen", "clone", "late", "reject"];
const LATE_MS = 600;

export function MachineViewPage() {
  const [caseId, setCaseId] = React.useState(
    () =>
      machineLabCases.find(
        (c) => c.id === new URLSearchParams(window.location.search).get("machine"),
      )?.id ?? machineLabCases[0]!.id,
  );
  const lab = machineLabCases.find((c) => c.id === caseId)!;
  const params = new URLSearchParams(window.location.search);
  const host = HOSTS.find((h) => h === params.get("host"));
  const readOnly = params.get("readonly") === "1";
  const viewer = readOnly && params.get("controlled") === "1";
  const [revision, setRevision] = React.useState(0);
  const served = React.useMemo(() => revised(lab.document, revision), [lab.document, revision]);
  const dir = params.get("dir") === "rtl" ? "rtl" : undefined;
  const [saves, setSaves] = React.useState(0);
  const shared = {
    runtime: lab.options,
    scenarios: lab.scenarios,
    readOnly,
    dir,
    className: "h-full max-sm:rounded-none max-sm:border-x-0",
  } as const;
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-background/60 px-4">
        <h1 className="text-ui font-semibold">Machine View</h1>
        <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden">
          registry/machine-view
        </span>
        {host && (
          <span data-demo-host={host} className="font-mono text-[10.5px] text-muted-foreground">
            host: {host}
            {host === "listen" ? ` · ${saves} saved` : host === "late" ? ` · ${LATE_MS}ms` : ""}
          </span>
        )}
        {viewer && (
          <>
            <span data-demo-host="viewer" className="font-mono text-[10.5px] text-muted-foreground">
              viewer · rev {revision}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-ui coarse:h-9"
              onClick={() => setRevision((n) => n + 1)}
            >
              Push update
            </Button>
          </>
        )}
        <div className="ms-auto flex items-center gap-2">
          <span className="text-ui text-muted-foreground max-sm:hidden">Example</span>
          <Select value={caseId} onValueChange={setCaseId}>
            <SelectTrigger size="sm" className="w-48 text-ui max-sm:w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {machineLabCases.map((c) => (
                <SelectItem key={c.id} value={c.id} className="text-ui">
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-0 sm:p-4">
        {viewer ? (
          <MachineView key={caseId} document={served} {...shared} readOnly />
        ) : host === "clone" || host === "late" || host === "reject" ? (
          <ControlledMachineView key={caseId} mode={host} initial={lab.document} {...shared} />
        ) : (
          <MachineView
            key={caseId}
            defaultDocument={lab.document}
            onDocumentChange={host === "listen" ? () => setSaves((n) => n + 1) : undefined}
            {...shared}
          />
        )}
      </div>
    </div>
  );
}

function ControlledMachineView({
  mode,
  initial,
  ...rest
}: {
  readonly mode: "clone" | "late" | "reject";
  readonly initial: MachineDocument;
} & DistributiveOmit<MachineViewProps, "document" | "defaultDocument" | "onDocumentChange">) {
  const [document, setDocument] = React.useState(initial);
  const timers = React.useRef(new Set<number>());
  React.useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  const onDocumentChange: DocumentChangeHandler = (next) => {
    if (mode === "reject") return false;
    if (mode === "clone") return setDocument(structuredClone(next));
    const timer = window.setTimeout(() => {
      timers.current.delete(timer);
      setDocument(structuredClone(next));
    }, LATE_MS);
    timers.current.add(timer);
  };
  return <MachineView {...rest} document={document} onDocumentChange={onDocumentChange} />;
}

/** A "server" edit for the live viewer demo: revision n renames the root machine (rev 0 is the example as is). */
function revised(document: MachineDocument, revision: number): MachineDocument {
  if (!revision) return document;
  return {
    ...document,
    machines: document.machines.map((m) =>
      m.id === document.rootId ? { ...m, label: `${m.label} (rev ${revision})` } : m,
    ),
  };
}
