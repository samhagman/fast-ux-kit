import * as React from "react";
import { AnimatePresence, motion, useIsPresent } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  FilePlus,
  FileText,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Inbox,
  MoreHorizontal,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { Button } from "../components/ui/button.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu.js";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../components/ui/drawer.js";
import type { resolveLabels } from "./labels.js";
import type { OutlineDocument, OutlineItem, OutlineWorkspaceLayout } from "./types.js";
import { folderPath, libraryRows, starredDocuments, type LibraryRow } from "./library.js";
import { countItems } from "./workspace.js";
import { TagPane, type TagPaneProps } from "./outliner-tag-pane.js";
import { isComposingKey } from "./keymap.js";

/**
 * The workspace sidebar (a sheet on a phone): Documents and Tags.
 *
 *   ┌ Documents · Tags ─────── ⊕▢ ┐   Documents: starred first, then the folder tree (folders,
 *   │ STARRED                     │   then documents, at every level). Drag a grip (touch: hold
 *   │  ★ Launch plan          42  │   it) to reorder, or onto a folder to file a document; drag
 *   │ ▾ ▢ Projects             2  │   an outline item onto a document to move it there. Each row
 *   │     ▤ Launch plan       42  │   has one ⋯ menu (a bottom sheet on touch).
 *   │ ▤ Inbox (inbox)          3  │
 *   │ + New document              │   Tags: every #tag and @mention with counts, this document or
 *   └─────────────────────────────┘   all; a click filters, co-occurring tags narrow further.
 */
type Labels = ReturnType<typeof resolveLabels>;

export interface LibraryActions {
  readonly open: (documentId: string) => void;
  readonly createDocument: (folderId?: string | null) => void;
  readonly createFolder: (parentId?: string | null) => void;
  readonly renameDocument: (id: string, title: string) => void;
  readonly renameFolder: (id: string, title: string) => void;
  readonly startRename: (target: RenameTarget) => void;
  readonly cancelRename: () => void;
  readonly removeDocument: (id: string) => void;
  readonly removeFolder: (id: string) => void;
  readonly toggleFolder: (id: string, open?: boolean) => void;
  readonly toggleStar: (documentId: string) => void;
  readonly setInbox: (documentId: string) => void;
  /** File a document into a folder (null: top level), before another document or at the end. */
  readonly placeDocument: (id: string, folderId: string | null, beforeId?: string | null) => void;
  readonly moveFolder: (id: string, parentId: string | null, beforeId?: string | null) => void;
  readonly shift: (kind: "folder" | "document", id: string, delta: -1 | 1) => void;
}
export interface RenameTarget {
  readonly kind: "folder" | "document";
  readonly id: string;
}

export interface LibraryPanelProps {
  readonly documents: readonly OutlineDocument[];
  readonly layout: OutlineWorkspaceLayout;
  readonly activeId: string | null;
  readonly expanded: ReadonlySet<string>;
  readonly renaming: RenameTarget | null;
  readonly labels: Labels;
  readonly actions: LibraryActions;
  readonly tab: "documents" | "tags";
  readonly onTab: (tab: "documents" | "tags") => void;
  readonly tags: Omit<TagPaneProps, "labels">;
  readonly readOnly?: boolean;
}

export function LibraryPanel({
  documents,
  layout,
  activeId,
  expanded,
  renaming,
  labels: L,
  actions,
  tab,
  onTab,
  tags,
  readOnly,
}: LibraryPanelProps) {
  const rows = React.useMemo(
    () => libraryRows(documents, layout, expanded),
    [documents, layout, expanded],
  );
  const starred = React.useMemo(() => starredDocuments(documents, layout), [documents, layout]);
  const listRef = React.useRef<HTMLElement>(null);
  const drag = useLibraryDrag(listRef, rows, actions, layout);
  const focusRow = (id: string) =>
    requestAnimationFrame(() =>
      listRef.current?.querySelector<HTMLElement>(`[data-lib-focus="${CSS.escape(id)}"]`)?.focus(),
    );
  const onArrow = (from: HTMLElement, delta: -1 | 1) => {
    const all = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-lib-focus]") ?? [])];
    all[all.indexOf(from) + delta]?.focus();
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-hairline ps-2 pe-1.5">
        <div role="tablist" aria-label={L.library} className="flex flex-1 items-center gap-px">
          {(["documents", "tags"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              data-library-tab={value}
              onClick={() => onTab(value)}
              className={cn(
                "relative h-7 rounded-md px-2 font-mono text-[10.5px] font-medium tracking-wide uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal/30 coarse:h-10 coarse:px-3",
                tab === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {tab === value && (
                <motion.span
                  layoutId="library-tab"
                  transition={motionTokens.layout}
                  className="absolute inset-0 rounded-md bg-muted"
                />
              )}
              <span className="relative">{value === "documents" ? L.documents : L.tags}</span>
            </button>
          ))}
        </div>
        {tab === "documents" && (
          <>
            <span
              className="font-mono text-[10.5px] text-muted-foreground/70 tabular-nums"
              aria-label={L.documentCount(documents.length)}
            >
              {documents.length}
            </span>
            {!readOnly && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={L.newFolder}
                    onClick={() => actions.createFolder(null)}
                    className="coarse:size-10"
                  >
                    <FolderPlus />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{L.newFolder}</TooltipContent>
              </Tooltip>
            )}
          </>
        )}
      </div>
      {/* Tabs swap at once (no exit to wait for), the new one eases in. */}
      {tab === "tags" ? (
        <motion.div
          key="tags"
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={motionTokens.quick}
          className="flex min-h-0 flex-1 flex-col"
        >
          <TagPane {...tags} labels={L} />
        </motion.div>
      ) : (
        <motion.div
          key="documents"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={motionTokens.quick}
          className="flex min-h-0 flex-1 flex-col"
        >
          {/* text-ui lives here: cn() would drop it next to a text colour (it reads as one). */}
          <nav
            ref={listRef}
            aria-label={L.documents}
            className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-1.5 text-ui"
          >
            {starred.length > 0 && (
              <div
                role="group"
                aria-label={L.starredDocuments}
                className="mb-1.5 border-b border-hairline pb-1.5"
              >
                <div className="px-2 pt-0.5 pb-1 font-mono text-[10px] tracking-wide text-muted-foreground/80 uppercase">
                  {L.starredDocuments}
                </div>
                {starred.map((doc) => (
                  <button
                    key={doc.id}
                    type="button"
                    data-lib-focus={`star:${doc.id}`}
                    data-starred-doc={doc.id}
                    data-outline-drop={doc.id}
                    aria-current={doc.id === activeId ? "page" : undefined}
                    onClick={() => actions.open(doc.id)}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
                        event.preventDefault();
                        onArrow(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
                      }
                    }}
                    className={cn(
                      "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 data-[drop-over]:bg-signal-muted data-[drop-over]:ring-1 data-[drop-over]:ring-signal/40 coarse:h-11",
                      doc.id === activeId
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <Star className="size-3.5 shrink-0 fill-current text-warning" />
                    <span dir="auto" className="min-w-0 flex-1 truncate">
                      {doc.title || L.untitledDocument}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <ul className="space-y-px">
              <AnimatePresence initial={false}>
                {rows.map((row) => (
                  <LibraryEntry
                    key={`${row.kind}:${row.id}`}
                    row={row}
                    active={row.kind === "document" && row.id === activeId}
                    inbox={row.kind === "document" && row.id === layout.inboxId}
                    starred={row.kind === "document" && layout.starred.includes(row.id)}
                    renaming={renaming?.kind === row.kind && renaming.id === row.id}
                    labels={L}
                    layout={layout}
                    actions={actions}
                    readOnly={!!readOnly}
                    dragging={drag.state?.id === row.id}
                    onGrip={(event) => drag.start(event, row)}
                    onArrow={onArrow}
                    focusRow={focusRow}
                  />
                ))}
              </AnimatePresence>
            </ul>
            <LibraryDropIndicator state={drag.state} />
            {!rows.length && (
              <p className="px-2 py-6 text-center text-ui text-muted-foreground">{L.noDocuments}</p>
            )}
          </nav>
          {!readOnly && (
            <button
              type="button"
              data-new-document=""
              onClick={() => actions.createDocument()}
              className="mx-1.5 mb-1.5 flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground coarse:h-11"
            >
              <FilePlus className="size-3.5" /> {L.newDocument}
            </button>
          )}
        </motion.div>
      )}
    </div>
  );
}

/** Per level: a nested row's icon sits under its folder's name, so nesting reads at a glance. */
const INDENT = 20;

const itemCountCache = new WeakMap<readonly OutlineItem[], number>();
const itemCount = (nodes: readonly OutlineItem[]) => {
  let count = itemCountCache.get(nodes);
  if (count === undefined) itemCountCache.set(nodes, (count = countItems(nodes)));
  return count;
};

/* ───────────────────────────── One row ───────────────────────────── */

function LibraryEntry({
  row,
  active,
  inbox,
  starred,
  renaming,
  labels: L,
  layout,
  actions,
  readOnly,
  dragging,
  onGrip,
  onArrow,
  focusRow,
}: {
  readonly row: LibraryRow;
  readonly active: boolean;
  readonly inbox: boolean;
  readonly starred: boolean;
  readonly renaming: boolean;
  readonly labels: Labels;
  readonly layout: OutlineWorkspaceLayout;
  readonly actions: LibraryActions;
  readonly readOnly: boolean;
  readonly dragging: boolean;
  readonly onGrip: (event: React.PointerEvent) => void;
  readonly onArrow: (from: HTMLElement, delta: -1 | 1) => void;
  readonly focusRow: (id: string) => void;
}) {
  const folder = row.kind === "folder";
  const title = folder
    ? row.folder.title || L.untitledFolder
    : row.document.title || L.untitledDocument;
  const focusKey = `${row.kind}:${row.id}`;
  const menu = useEntryMenu(row, {
    inbox,
    starred,
    layout,
    actions,
    labels: L,
    readOnly,
    focusRow,
  });
  // A row on its way out (folded away, deleted) is no longer a row: not focusable, not a drop target.
  const present = useIsPresent();
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: dragging ? 0.45 : 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={motionTokens.base}
      data-lib-row={present ? "" : undefined}
      inert={!present}
      data-lib-kind={row.kind}
      data-lib-id={row.id}
      className="group/doc relative flex items-center rounded-md"
      style={{ paddingInlineStart: row.depth * INDENT }}
    >
      {active && (
        <motion.span
          layoutId="workspace-active-document"
          transition={motionTokens.layout}
          className="absolute inset-y-0 end-0 rounded-md border border-border bg-background"
          style={{ insetInlineStart: row.depth * INDENT }}
        />
      )}
      {!readOnly && (
        <span
          aria-hidden
          data-lib-grip=""
          onPointerDown={onGrip}
          className="relative grid h-8 w-4 shrink-0 cursor-grab touch-none place-items-center text-muted-foreground/50 opacity-0 transition-opacity group-hover/doc:opacity-100 active:cursor-grabbing coarse:h-11 coarse:w-6 coarse:opacity-60"
        >
          <GripVertical className="size-3" />
        </span>
      )}
      {readOnly && <span className="w-2 shrink-0" />}
      {renaming ? (
        <RenameField
          initial={folder ? row.folder.title : row.document.title}
          label={folder ? L.folderTitle : L.documentTitle}
          placeholder={folder ? L.untitledFolder : L.untitledDocument}
          onDone={(value) => {
            if (folder) actions.renameFolder(row.id, value);
            else actions.renameDocument(row.id, value);
            focusRow(focusKey);
          }}
          onCancel={() => {
            actions.cancelRename();
            focusRow(focusKey);
          }}
        />
      ) : (
        <button
          type="button"
          aria-expanded={folder ? row.expanded : undefined}
          aria-current={active ? "page" : undefined}
          aria-label={folder ? `${title}, ${L.folderContents(row.count)}` : undefined}
          data-lib-focus={focusKey}
          // F6 into the sidebar lands on the open document (focus.ts).
          data-focus-entry={active && !folder ? "" : undefined}
          {...(folder
            ? { "data-folder-open": row.id }
            : { "data-doc-open": row.id, "data-outline-drop": row.id })}
          onClick={() => (folder ? actions.toggleFolder(row.id) : actions.open(row.id))}
          onDoubleClick={() => !readOnly && actions.startRename({ kind: row.kind, id: row.id })}
          onKeyDown={(event) => {
            const mod = event.altKey || event.metaKey || event.ctrlKey;
            const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
            const forward = rtl ? "ArrowLeft" : "ArrowRight";
            const back = rtl ? "ArrowRight" : "ArrowLeft";
            if (mod && event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
              event.preventDefault();
              if (!readOnly) actions.shift(row.kind, row.id, event.key === "ArrowUp" ? -1 : 1);
              focusRow(focusKey);
            } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onArrow(event.currentTarget, event.key === "ArrowUp" ? -1 : 1);
            } else if (folder && event.key === forward) {
              event.preventDefault();
              if (!row.expanded) actions.toggleFolder(row.id, true);
              else onArrow(event.currentTarget, 1);
            } else if (event.key === back) {
              event.preventDefault();
              if (folder && row.expanded) actions.toggleFolder(row.id, false);
              else if (row.parentId) focusRow(`folder:${row.parentId}`);
            } else if (event.key === "F2" && !readOnly) {
              event.preventDefault();
              actions.startRename({ kind: row.kind, id: row.id });
            } else if (
              (event.key === "Delete" || event.key === "Backspace") &&
              (event.metaKey || event.ctrlKey) &&
              !readOnly
            ) {
              event.preventDefault();
              if (folder) actions.removeFolder(row.id);
              else actions.removeDocument(row.id);
            }
          }}
          className={cn(
            "relative flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md pe-1 text-start transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal/30 coarse:h-11",
            "data-[drop-over]:bg-signal-muted data-[drop-over]:text-foreground data-[drop-over]:ring-1 data-[drop-over]:ring-signal/40",
            active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {folder ? (
            <>
              <ChevronRight
                className={cn(
                  "-ms-1 size-3 shrink-0 opacity-60 transition-transform rtl:rotate-180",
                  row.expanded && "rotate-90 rtl:rotate-90",
                )}
              />
              {row.expanded ? (
                <FolderOpen className="size-3.5 shrink-0 opacity-70" />
              ) : (
                <Folder className="size-3.5 shrink-0 opacity-70" />
              )}
            </>
          ) : (
            <>
              {/* Where a folder has its chevron: a document lines up with the folders beside it. */}
              <span aria-hidden className="-ms-1 w-3 shrink-0" />
              {inbox ? (
                <Inbox className={cn("size-3.5 shrink-0", active ? "text-signal" : "opacity-70")} />
              ) : (
                <FileText
                  className={cn("size-3.5 shrink-0", active ? "text-signal" : "opacity-60")}
                />
              )}
            </>
          )}
          <span dir="auto" className="min-w-0 flex-1 truncate">
            {title}
          </span>
          {starred && <span className="sr-only">{L.starred}</span>}
          <span
            className="shrink-0 font-mono text-[10.5px] font-normal text-muted-foreground/70 tabular-nums"
            aria-hidden={folder}
          >
            {folder ? row.count : itemCount(row.document.nodes)}
          </span>
        </button>
      )}
      {menu}
    </motion.li>
  );
}

function RenameField({
  initial,
  label,
  placeholder,
  onDone,
  onCancel,
}: {
  readonly initial: string;
  readonly label: string;
  readonly placeholder: string;
  readonly onDone: (value: string) => void;
  readonly onCancel: () => void;
}) {
  const [draft, setDraft] = React.useState(initial);
  const done = React.useRef(false);
  const finish = (cancel: boolean) => {
    if (done.current) return;
    done.current = true;
    if (cancel) onCancel();
    else onDone(draft.replace(/\s+/g, " ").trim());
  };
  return (
    <input
      autoFocus
      aria-label={label}
      value={draft}
      dir="auto"
      placeholder={placeholder}
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(false)}
      onKeyDown={(event) => {
        if (isComposingKey(event)) return;
        if (event.key === "Enter") {
          event.preventDefault();
          finish(false);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(true);
        }
      }}
      className="relative h-7 min-w-0 flex-1 rounded-[5px] border border-signal/50 bg-background px-1.5 text-ui ring-3 ring-signal/15 outline-none coarse:h-10 coarse:text-[16px]"
    />
  );
}

/* ───────────────────────────── The ⋯ menu (a sheet on touch) ───────────────────────────── */

interface MenuEntry {
  readonly id: string;
  readonly label: string;
  readonly icon?: React.ReactNode;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
  readonly current?: boolean;
  readonly run?: () => void;
  readonly items?: readonly MenuEntry[];
}

function useEntryMenu(
  row: LibraryRow,
  {
    inbox,
    starred,
    layout,
    actions,
    labels: L,
    readOnly,
    focusRow,
  }: {
    readonly inbox: boolean;
    readonly starred: boolean;
    readonly layout: OutlineWorkspaceLayout;
    readonly actions: LibraryActions;
    readonly labels: Labels;
    readonly readOnly: boolean;
    readonly focusRow: (id: string) => void;
  },
) {
  const folder = row.kind === "folder";
  const title = folder
    ? row.folder.title || L.untitledFolder
    : row.document.title || L.untitledDocument;
  const focusKey = `${row.kind}:${row.id}`;
  const here = folder ? (row.folder.parentId ?? null) : row.parentId;
  const destinations: MenuEntry[] = [
    {
      id: "dest-top",
      label: L.folderTopLevel,
      icon: <FolderOpen />,
      current: here === null,
      run: () => (folder ? actions.moveFolder(row.id, null) : actions.placeDocument(row.id, null)),
    },
    ...layout.folders
      // A folder never moves into itself or its own subfolders.
      .filter((candidate) => !(folder && isInside(layout, candidate.id, row.id)))
      .map((candidate) => ({
        id: `dest-${candidate.id}`,
        label: [
          ...folderPath(layout, candidate.parentId ?? null, L.untitledFolder),
          candidate.title || L.untitledFolder,
        ].join(" › "),
        icon: <Folder />,
        current: here === candidate.id,
        run: () => {
          if (folder) actions.moveFolder(row.id, candidate.id);
          else actions.placeDocument(row.id, candidate.id);
          actions.toggleFolder(candidate.id, true);
        },
      })),
  ];
  const entries: (MenuEntry | "separator")[] = folder
    ? [
        {
          id: "new-doc",
          label: L.newDocumentHere,
          icon: <FilePlus />,
          disabled: readOnly,
          run: () => actions.createDocument(row.id),
        },
        {
          id: "new-folder",
          label: L.newSubfolder,
          icon: <FolderPlus />,
          disabled: readOnly,
          run: () => actions.createFolder(row.id),
        },
        "separator",
        {
          id: "rename",
          label: L.renameDocument,
          icon: <Pencil />,
          disabled: readOnly,
          run: () => actions.startRename({ kind: "folder", id: row.id }),
        },
        {
          id: "move",
          label: L.moveToFolder,
          icon: <FolderInput />,
          disabled: readOnly,
          items: destinations,
        },
        {
          id: "up",
          label: L.moveUp,
          icon: <ArrowUp />,
          disabled: readOnly,
          run: () => actions.shift("folder", row.id, -1),
        },
        {
          id: "down",
          label: L.moveDown,
          icon: <ArrowDown />,
          disabled: readOnly,
          run: () => actions.shift("folder", row.id, 1),
        },
        "separator",
        {
          id: "delete",
          label: L.deleteFolder,
          icon: <Trash2 />,
          destructive: true,
          disabled: readOnly,
          run: () => actions.removeFolder(row.id),
        },
      ]
    : [
        {
          id: "rename",
          label: L.renameDocument,
          icon: <Pencil />,
          disabled: readOnly,
          run: () => actions.startRename({ kind: "document", id: row.id }),
        },
        {
          id: "star",
          label: starred ? L.unstarDocument : L.starDocument,
          icon: <Star className={cn(starred && "fill-current")} />,
          run: () => actions.toggleStar(row.id),
        },
        {
          id: "inbox",
          label: inbox ? L.isInbox : L.setAsInbox,
          icon: <Inbox />,
          disabled: inbox || readOnly,
          run: () => actions.setInbox(row.id),
        },
        {
          id: "move",
          label: L.moveToFolder,
          icon: <FolderInput />,
          disabled: readOnly,
          items: destinations,
        },
        {
          id: "up",
          label: L.moveUp,
          icon: <ArrowUp />,
          disabled: readOnly,
          run: () => actions.shift("document", row.id, -1),
        },
        {
          id: "down",
          label: L.moveDown,
          icon: <ArrowDown />,
          disabled: readOnly,
          run: () => actions.shift("document", row.id, 1),
        },
        "separator",
        {
          id: "delete",
          label: L.deleteDocument,
          icon: <Trash2 />,
          destructive: true,
          disabled: readOnly,
          run: () => actions.removeDocument(row.id),
        },
      ];
  return (
    <EntryMenu
      title={title}
      label={L.actionsFor(title)}
      entries={entries}
      labels={L}
      onClosed={() => focusRow(focusKey)}
    />
  );
}

const isInside = (layout: OutlineWorkspaceLayout, id: string, ancestor: string) => {
  const byId = new Map(layout.folders.map((folder) => [folder.id, folder]));
  for (
    let at: string | null = id, guard = 0;
    at && guard <= layout.folders.length;
    at = byId.get(at)?.parentId ?? null, guard++
  )
    if (at === ancestor) return true;
  return false;
};

const coarseQuery = "(pointer: coarse)";
function useCoarse() {
  return React.useSyncExternalStore(
    (notify) => {
      const list = window.matchMedia?.(coarseQuery);
      list?.addEventListener?.("change", notify);
      return () => list?.removeEventListener?.("change", notify);
    },
    () => !!window.matchMedia?.(coarseQuery).matches,
    () => false,
  );
}

/** A row's actions: a dropdown with a pointer, a bottom sheet with 44 px rows on touch. */
function EntryMenu({
  title,
  label,
  entries,
  labels: L,
  onClosed,
}: {
  readonly title: string;
  readonly label: string;
  readonly entries: readonly (MenuEntry | "separator")[];
  readonly labels: Labels;
  readonly onClosed: () => void;
}) {
  const coarse = useCoarse();
  const [open, setOpen] = React.useState(false);
  const [page, setPage] = React.useState<MenuEntry | null>(null);
  const trigger = (
    <button
      type="button"
      aria-label={label}
      data-lib-menu=""
      onClick={coarse ? () => setOpen(true) : undefined}
      className="relative grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground opacity-0 transition-opacity group-hover/doc:opacity-100 group-focus-within/doc:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 coarse:size-10 coarse:opacity-60"
    >
      <MoreHorizontal className="size-3.5" />
    </button>
  );
  if (coarse) {
    const list = page?.items ?? entries;
    return (
      <>
        {trigger}
        <Drawer
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            if (!next) {
              setPage(null);
              onClosed();
            }
          }}
        >
          <DrawerContent className="pb-[env(safe-area-inset-bottom)]" data-library-sheet="">
            <DrawerHeader className="flex-row items-center gap-1 px-3 pt-2 pb-1 text-start">
              {page && (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={L.back}
                  onClick={() => setPage(null)}
                  className="-ms-1 size-10"
                >
                  <ChevronLeft className="rtl:rotate-180" />
                </Button>
              )}
              <DrawerTitle dir="auto" className="min-w-0 truncate text-ui font-semibold">
                {page ? page.label : title}
              </DrawerTitle>
              <DrawerDescription className="sr-only">{label}</DrawerDescription>
            </DrawerHeader>
            <motion.div
              key={page?.id ?? "root"}
              initial={{ opacity: 0, x: page ? 8 : -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={motionTokens.quick}
              role="menu"
              className="overflow-y-auto px-2 pb-2"
            >
              {list.map((entry, i) =>
                entry === "separator" ? (
                  <div key={`sep-${i}`} role="separator" className="my-1 h-px bg-hairline" />
                ) : (
                  <button
                    key={entry.id}
                    type="button"
                    role="menuitem"
                    disabled={entry.disabled}
                    aria-current={entry.current || undefined}
                    onClick={() => {
                      if (entry.items) return setPage(entry);
                      setOpen(false);
                      setPage(null);
                      // After the sheet closes (its focus return would steal a rename field's focus).
                      window.setTimeout(() => entry.run?.(), 0);
                    }}
                    className={cn(
                      "flex h-11 w-full items-center gap-3 rounded-md px-2.5 text-start text-[15px] transition-colors hover:bg-muted disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
                      entry.destructive && "text-destructive [&_svg]:text-destructive",
                      entry.current && "font-medium text-signal",
                    )}
                  >
                    {entry.icon}
                    <span dir="auto" className="min-w-0 flex-1 truncate">
                      {entry.label}
                    </span>
                    {entry.items && <ChevronRight className="rtl:rotate-180" />}
                  </button>
                ),
              )}
            </motion.div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  const item = (entry: MenuEntry) =>
    entry.items ? (
      <DropdownMenuSub key={entry.id}>
        <DropdownMenuSubTrigger disabled={entry.disabled}>
          {entry.icon} {entry.label}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
          {entry.items.map((child) => (
            <DropdownMenuItem
              key={child.id}
              disabled={child.disabled || child.current}
              onSelect={() => child.run?.()}
            >
              <span dir="auto" className="min-w-0 flex-1 truncate">
                {child.label}
              </span>
              {child.current && (
                <span className="font-mono text-[10px] text-muted-foreground">●</span>
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    ) : (
      <DropdownMenuItem
        key={entry.id}
        disabled={entry.disabled}
        variant={entry.destructive ? "destructive" : undefined}
        onSelect={() => entry.run?.()}
      >
        {entry.icon} {entry.label}
      </DropdownMenuItem>
    );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-52"
        onCloseAutoFocus={(event) => {
          // A rename field (or another document) that took focus keeps it.
          if (document.activeElement && document.activeElement !== document.body)
            event.preventDefault();
        }}
      >
        {entries.map((entry, i) =>
          entry === "separator" ? <DropdownMenuSeparator key={`sep-${i}`} /> : item(entry),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────────── Drag to reorder and file ───────────────────────────── */

interface LibraryDragState {
  readonly id: string;
  readonly kind: "folder" | "document";
  readonly label: string;
  readonly pointer: { readonly x: number; readonly y: number };
  /** Where it would land: a line above / below a row, or a folder lit up ("into"). */
  readonly drop: {
    readonly targetId: string;
    readonly targetKind: "folder" | "document";
    readonly zone: "before" | "after" | "into";
    readonly top: number;
    readonly height: number;
    readonly left: number;
  } | null;
}

/**
 * Pointer drag on a row's grip (mouse: past 4 px; touch: hold 300 ms). Over a folder's middle
 * the item goes INTO it (a folder that is folded opens after a beat); over a row's top or bottom
 * edge it goes before / after it, in that row's folder. Esc cancels.
 */
function useLibraryDrag(
  listRef: React.RefObject<HTMLElement | null>,
  rows: readonly LibraryRow[],
  actions: LibraryActions,
  layout: OutlineWorkspaceLayout,
) {
  const [state, setState] = React.useState<LibraryDragState | null>(null);
  const latest = React.useRef({ rows, actions, layout });
  latest.current = { rows, actions, layout };
  const start = React.useCallback(
    (event: React.PointerEvent, row: LibraryRow) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const touch = event.pointerType !== "mouse";
      const startX = event.clientX,
        startY = event.clientY;
      const pointerId = event.pointerId;
      const grip = event.currentTarget as HTMLElement;
      let active = false;
      let timer: number | undefined;
      let openTimer: number | undefined;
      let openFor: string | null = null;
      let current: LibraryDragState | null = null;
      const label = row.kind === "folder" ? row.folder.title : row.document.title;
      const activate = () => {
        active = true;
        grip.setPointerCapture?.(pointerId);
        navigator.vibrate?.(8);
      };
      if (touch) timer = window.setTimeout(activate, 300);
      const resolve = (y: number): LibraryDragState["drop"] => {
        const list = listRef.current;
        if (!list) return null;
        const box = list.getBoundingClientRect();
        const els = [...list.querySelectorAll<HTMLElement>("[data-lib-row]")];
        for (const el of els) {
          const rect = el.getBoundingClientRect();
          if (y < rect.top || y >= rect.bottom) continue;
          const targetId = el.dataset.libId!;
          const targetKind = el.dataset.libKind as "folder" | "document";
          if (targetId === row.id && targetKind === row.kind) return null;
          // Never into itself or its own subfolder.
          if (
            row.kind === "folder" &&
            targetKind === "folder" &&
            isInside(latest.current.layout, targetId, row.id)
          )
            return null;
          if (row.kind === "folder" && targetKind === "document") {
            const doc = latest.current.rows.find((r) => r.kind === "document" && r.id === targetId);
            if (doc?.parentId && isInside(latest.current.layout, doc.parentId, row.id)) return null;
          }
          const fraction = (y - rect.top) / rect.height;
          const zone =
            targetKind === "folder"
              ? fraction < 0.28
                ? "before"
                : fraction > 0.72
                  ? "after"
                  : "into"
              : fraction < 0.5
                ? "before"
                : "after";
          const depth = Number(el.style.paddingInlineStart.replace("px", "")) || 0;
          return {
            targetId,
            targetKind,
            zone,
            top: rect.top - box.top + list.scrollTop,
            height: rect.height,
            left: depth,
          };
        }
        return null;
      };
      const onMove = (move: PointerEvent) => {
        if (move.pointerId !== pointerId) return;
        if (!active) {
          const distance = Math.hypot(move.clientX - startX, move.clientY - startY);
          if (touch) {
            if (distance > 8) cleanup();
            return;
          }
          if (distance < 4) return;
          activate();
        }
        move.preventDefault();
        const drop = resolve(move.clientY);
        // Resting on a folded folder's middle opens it.
        const folded =
          drop?.zone === "into" &&
          latest.current.rows.some(
            (r) => r.kind === "folder" && r.id === drop.targetId && !r.expanded,
          )
            ? drop.targetId
            : null;
        if (folded !== openFor) {
          window.clearTimeout(openTimer);
          openFor = folded;
          if (folded)
            openTimer = window.setTimeout(
              () => latest.current.actions.toggleFolder(folded, true),
              650,
            );
        }
        current = {
          id: row.id,
          kind: row.kind,
          label: label || "",
          pointer: { x: move.clientX, y: move.clientY },
          drop,
        };
        setState(current);
      };
      const onUp = () => {
        const drop = current?.drop;
        if (active && drop) {
          const { actions: act, rows: all } = latest.current;
          const target = all.find((r) => r.kind === drop.targetKind && r.id === drop.targetId);
          if (target) {
            if (row.kind === "document") {
              if (target.kind === "folder" && drop.zone === "into")
                act.placeDocument(row.id, target.id, null);
              else if (target.kind === "folder")
                act.placeDocument(row.id, target.parentId, firstDocIn(all, target.parentId));
              else {
                const next = drop.zone === "before" ? target.id : nextDocAfter(all, target);
                act.placeDocument(row.id, target.parentId, next);
              }
            } else if (target.kind === "folder") {
              if (drop.zone === "into") {
                act.moveFolder(row.id, target.id, null);
                act.toggleFolder(target.id, true);
              } else
                act.moveFolder(
                  row.id,
                  target.parentId,
                  drop.zone === "before" ? target.id : nextFolderAfter(all, target),
                );
            } else act.moveFolder(row.id, target.parentId, null);
          }
        }
        if (active) {
          const swallow = (click: MouseEvent) => {
            click.stopPropagation();
            click.preventDefault();
          };
          window.addEventListener("click", swallow, { capture: true, once: true });
          setTimeout(() => window.removeEventListener("click", swallow, { capture: true }), 0);
        }
        cleanup();
      };
      const onKey = (key: KeyboardEvent) => {
        if (key.key !== "Escape") return;
        key.preventDefault();
        key.stopPropagation();
        current = null;
        cleanup();
      };
      const cleanup = () => {
        window.clearTimeout(timer);
        window.clearTimeout(openTimer);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", cleanup);
        window.removeEventListener("keydown", onKey, true);
        setState(null);
      };
      window.addEventListener("pointermove", onMove, { passive: false });
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", cleanup);
      window.addEventListener("keydown", onKey, true);
    },
    [listRef],
  );
  return { state, start };
}

const firstDocIn = (rows: readonly LibraryRow[], folderId: string | null) =>
  rows.find((r) => r.kind === "document" && r.parentId === folderId)?.id ?? null;
function nextDocAfter(rows: readonly LibraryRow[], target: LibraryRow): string | null {
  const siblings = rows.filter((r) => r.kind === "document" && r.parentId === target.parentId);
  return siblings[siblings.indexOf(target) + 1]?.id ?? null;
}
function nextFolderAfter(rows: readonly LibraryRow[], target: LibraryRow): string | null {
  const siblings = rows.filter((r) => r.kind === "folder" && r.parentId === target.parentId);
  return siblings[siblings.indexOf(target) + 1]?.id ?? null;
}

function LibraryDropIndicator({ state }: { readonly state: LibraryDragState | null }) {
  const drop = state?.drop;
  return (
    <>
      <AnimatePresence>
        {drop && (
          <motion.div
            key={drop.zone === "into" ? `into-${drop.targetId}` : "line"}
            aria-hidden
            initial={{ opacity: 0 }}
            animate={{
              opacity: 1,
              top:
                drop.zone === "into"
                  ? drop.top
                  : drop.zone === "before"
                    ? drop.top - 1
                    : drop.top + drop.height - 1,
            }}
            exit={{ opacity: 0 }}
            transition={{ top: { duration: 0.08 }, opacity: motionTokens.quick }}
            style={{
              insetInlineStart: 6 + drop.left,
              height: drop.zone === "into" ? drop.height : 2,
            }}
            className={cn(
              "pointer-events-none absolute inset-e-1.5 z-10 rounded-md",
              drop.zone === "into"
                ? "bg-signal/[0.08] ring-1 ring-signal/40 ring-inset"
                : "rounded-full bg-signal",
            )}
          />
        )}
      </AnimatePresence>
      {state && (
        <div
          aria-hidden
          style={{ position: "fixed", left: state.pointer.x + 14, top: state.pointer.y + 12 }}
          className="pointer-events-none z-50 flex max-w-56 items-center gap-2 rounded-md border bg-popover px-2 py-1 text-ui shadow-[0_8px_24px_-8px_rgb(0_0_0/0.25)]"
        >
          {state.kind === "folder" ? (
            <Folder className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{state.label || "…"}</span>
        </div>
      )}
    </>
  );
}
