import * as React from "react";
import { FileText, Folder, Inbox, Star } from "lucide-react";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Kbd } from "@/components/ui/kbd";
import type { resolveLabels } from "./labels";
import type { OutlineDocument, OutlineWorkspaceLayout } from "./types";
import { findInLibrary, type FinderEntry } from "./library";

type Labels = ReturnType<typeof resolveLabels>;

/**
 * ⌘O: jump to any document (or folder) by a few letters of its name. Fuzzy (in order, not
 * necessarily adjacent: "lp" finds "Launch plan"), recent first when empty, the folder path as
 * context. Enter opens a document; a folder is revealed in the sidebar.
 *
 *   ┌ ⌕ lau|                                      ┐
 *   │ ▤ [La]unch plan          Projects       ★   │
 *   │ ▤ Partner p[la]n…        Archive            │
 *   │ ▢ [Lau]nches             folder             │
 *   └ ↑ ↓ choose  ↵ open                  Esc close ┘
 */
export function DocumentFinder({
  open,
  onOpenChange,
  documents,
  layout,
  recent,
  activeId,
  labels: L,
  onDocument,
  onFolder,
  coarse,
  documentsOnly = false,
  title,
  enterAction,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly documents: readonly OutlineDocument[];
  readonly layout: OutlineWorkspaceLayout;
  readonly recent: readonly string[];
  readonly activeId: string | null;
  readonly labels: Labels;
  readonly onDocument: (id: string) => void;
  readonly onFolder: (id: string) => void;
  readonly coarse: boolean;
  /** Pick a document only (no folders): the "Move to document…" target picker. */
  readonly documentsOnly?: boolean;
  /** Replaces the placeholder, e.g. "Move 2 items to…". */
  readonly title?: string;
  /** What Enter does, for the footer hint (defaults to "open"). */
  readonly enterAction?: string;
}) {
  const [query, setQuery] = React.useState("");
  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);
  const results = React.useMemo(
    // The open document is not "recent": ⌘O, Enter goes back to the one before (like switching apps).
    () => (open ? findInLibrary(documents, layout, query, recent.filter((id) => id !== activeId), { document: L.untitledDocument, folder: L.untitledFolder }).slice(0, 60) : []),
    [open, documents, layout, query, recent, activeId, L],
  );
  const docs = results.filter((entry) => entry.kind === "document");
  const folders = documentsOnly ? [] : results.filter((entry) => entry.kind === "folder");
  const choose = (entry: FinderEntry) => {
    onOpenChange(false);
    // After the dialog has handed focus back, so the opened document can take it.
    window.setTimeout(() => (entry.kind === "document" ? onDocument(entry.id) : onFolder(entry.id)), 0);
  };
  const row = (entry: FinderEntry) => (
    <CommandItem key={`${entry.kind}:${entry.id}`} value={`${entry.kind}:${entry.id}`} onSelect={() => choose(entry)} data-finder-entry={entry.id} className="gap-2 coarse:min-h-11">
      {entry.kind === "folder" ? <Folder /> : entry.id === layout.inboxId ? <Inbox /> : <FileText />}
      <span dir="auto" className="min-w-0 flex-1 truncate">
        <Marked text={entry.title} marks={entry.marks} />
      </span>
      {entry.kind === "document" && layout.starred.includes(entry.id) && <Star aria-label={L.starred} className="size-3 fill-current text-warning" />}
      {entry.id === activeId && <span className="font-mono text-[10px] text-signal">●</span>}
      {entry.path.length > 0 && (
        <span dir="auto" className="max-w-[40%] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground">
          {entry.path.join(" › ")}
        </span>
      )}
    </CommandItem>
  );
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange} title={title ?? L.findDocument} description={L.findDocumentHelp} className="top-[18%] translate-y-0 sm:max-w-xl">
      <Command shouldFilter={false} loop className="rounded-none bg-transparent">
        <CommandInput value={query} onValueChange={setQuery} placeholder={title ?? L.findDocumentPlaceholder} aria-label={title ?? L.findDocument} className="coarse:text-[16px]" />
        <CommandList className="max-h-[min(60vh,22rem)]">
          <CommandEmpty>{L.noDocumentMatches(query)}</CommandEmpty>
          {docs.length > 0 && <CommandGroup heading={query.trim() ? L.documents : L.recentDocuments}>{docs.map(row)}</CommandGroup>}
          {folders.length > 0 && <CommandGroup heading={L.folders}>{folders.map(row)}</CommandGroup>}
        </CommandList>
        {!coarse && (
          // The same footer as the command palette: one family of key hints.
          <div className="flex items-center gap-3 border-t px-3 py-2 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Kbd dir="ltr">↑</Kbd>
              <Kbd dir="ltr">↓</Kbd> {L.choose}
            </span>
            <span className="flex items-center gap-1">
              <Kbd dir="ltr">↵</Kbd> {(enterAction ?? L.openAction).toLowerCase()}
            </span>
            <span className="ms-auto flex items-center gap-1">
              <Kbd dir="ltr">Esc</Kbd> {L.closeAction}
            </span>
          </div>
        )}
      </Command>
    </CommandDialog>
  );
}

/** The title with its matched letters emphasised. */
function Marked({ text, marks }: { readonly text: string; readonly marks: readonly number[] }) {
  if (!marks.length) return <>{text}</>;
  const set = new Set(marks);
  const out: React.ReactNode[] = [];
  let run = "";
  let inMark = false;
  const flush = (key: number) => {
    if (!run) return;
    out.push(inMark ? <mark key={key} className="rounded-[2px] bg-transparent font-semibold text-foreground underline decoration-signal/60 underline-offset-2">{run}</mark> : run);
    run = "";
  };
  text.split("").forEach((char, i) => {
    const marked = set.has(i);
    if (marked !== inMark) {
      flush(i);
      inMark = marked;
    }
    run += char;
  });
  flush(text.length);
  return <>{out}</>;
}
