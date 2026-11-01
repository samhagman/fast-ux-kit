import { toast } from "sonner";
import { FileWarning } from "lucide-react";
import { analyzeImport, summarizeReport, type ImportFormat, type ImportReport } from "./import-report";
import { importOutline } from "./interchange";
import { insideClose } from "./toasts";

/** How many kinds of loss a toast lists before "and N more". */
const SHOWN = 4;

/**
 * Tell the user what an import kept and what it could not: one toast, its title the count
 * ("Imported 12 items · 3 things didn't survive"), its body one line per kind of loss with its
 * count and fate. A clean import is a plain success toast; `quiet` (a paste) says nothing then.
 */
export function reportImport(
  source: string,
  options: { readonly format?: ImportFormat; readonly quiet?: boolean; readonly items?: number } = {},
): ImportReport | null {
  let report: ImportReport;
  try {
    // Markdown and text are judged from what the importer made of them (pure: no document change).
    const nodes = options.format === "html" ? [] : importOutline(source, () => "r");
    report = analyzeImport(source, nodes, { ...(options.format ? { format: options.format } : {}), ...(options.items !== undefined ? { items: options.items } : {}) });
  } catch {
    return null;
  }
  if (!report.losses.length) {
    if (!options.quiet) toast.success(summarizeReport(report));
    return report;
  }
  const rest = report.losses.length - SHOWN;
  toast(summarizeReport(report), {
    id: "outliner-import-report",
    icon: <FileWarning className="size-4 text-warning" />,
    duration: 12_000,
    closeButton: true,
    classNames: insideClose("top"),
    description: (
      <ul data-import-report="" className="mt-1 space-y-0.5 text-[12px]">
        {report.losses.slice(0, SHOWN).map((loss) => (
          <li key={loss.key} className="flex items-baseline gap-2">
            <span className="w-7 shrink-0 text-end font-mono text-[11px] tabular-nums text-foreground">{loss.count.toLocaleString()}</span>
            <span className="min-w-0 flex-1 truncate text-foreground/90" title={loss.label}>{loss.label}</span>
            <span className="shrink-0 text-muted-foreground">{loss.fate}</span>
          </li>
        ))}
        {rest > 0 && <li className="ps-9 text-muted-foreground">and {rest} more kind{rest === 1 ? "" : "s"}</li>}
      </ul>
    ),
  });
  return report;
}
