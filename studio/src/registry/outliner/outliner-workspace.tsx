import * as React from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { FileInput, FilePlus, FileText, FolderPlus, Inbox, PanelLeft, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Kbd } from "@/components/ui/kbd";
import { Outliner, type OutlinerHandle, type OutlinerProps } from "./outliner";
import type { OutlineHistoryTravel } from "./use-outliner";
import { usePlatformKeys, type OutlinerStarredDocuments, type OutlinerPaletteCommand, type OutlinerPaletteGroup, type OutlinerSearchScope } from "./context";
import { resolveLabels } from "./labels";
import { inlineToPlain } from "./inline";
import type { OutlineDocument, OutlineExternalLinks, OutlineItem, OutlineWorkspaceLayout } from "./types";
import {
  createDocument,
  crossBacklinks,
  neighbourAfterRemoval,
  parseQualifiedId,
  qualifiedId,
  removeDocument,
  renameDocument,
  replaceDocumentNodes,
  resolveLink,
  restoreDocument,
  searchDocuments,
  suggestLinks,
} from "./workspace";
import { outgoingLinks } from "./search-filters";
import {
  EMPTY_LAYOUT,
  captureItem,
  createFolder,
  folderOf,
  inboxOf,
  moveFolder,
  placeDocument,
  planAppend,
  planItemMove,
  removeFolder,
  renameFolder,
  repairDuplicateIds,
  restoreFolder,
  shiftDocument,
  shiftFolder,
  starredDocuments,
  toggleStar,
  type DocumentChange,
} from "./library";
import { LibraryPanel, type LibraryActions, type RenameTarget } from "./outliner-library";
import { DocumentFinder } from "./outliner-finder";
import { CaptureFab, QuickCapture } from "./outliner-capture";
import { ResultSortControl, sortResults, type ResultSort } from "./result-sort";
import { tagsInQuery } from "./tag-pane";
import "./outliner-library.css";
import type { OutlinerItemCommands } from "./seams";

/**
 * Several outlines in one place: a compact document switcher — a sidebar
 * on desktop, a sheet on a phone — beside one Outliner per open document.
 *
 *   ┌ Documents ─────┐┌ ☰  Roadmap › Q3                      ⌕  ⋯  Commands ⌘K ┐
 *   │ ▸ Launch plan  ││ Roadmap                                                   │
 *   │ ▸ Roadmap   ●  ││ • Q3 … [[Launch goals|launch/goals-1]]  ← resolves across │
 *   │ ▸ Meeting notes││                                          documents        │
 *   │ + New document │└───────────────────────────────────────────────────────────┘
 *   └────────────────┘
 *
 * Documents are plain data (`OutlineDocument`): controlled (`documents` + `onDocumentsChange`) or
 * uncontrolled (`defaultDocuments`); nothing is stored anywhere by the component. Each recently
 * opened document stays mounted (inert and invisible while another is shown), so switching back
 * keeps its undo history, zoom and scroll position exactly where they were.
 */
export interface OutlinerWorkspaceProps
  extends Omit<
    OutlinerProps,
    | "value"
    | "defaultValue"
    | "onValueChange"
    | "title"
    | "hoistedId"
    | "onHoistChange"
    | "ref"
    | "headerStart"
    | "onTitleChange"
    | "paletteGroups"
    | "searchScope"
    | "externalLinks"
    | "toolbar"
    | "onExternalDrop"
    | "itemCommands"
    | "starredDocuments"
    | "onHistoryTravel"
  > {
  /** Controlled documents. Pair with onDocumentsChange. */
  readonly documents?: readonly OutlineDocument[];
  /** Uncontrolled: the initial documents (the workspace owns them afterwards). */
  readonly defaultDocuments?: readonly OutlineDocument[];
  readonly onDocumentsChange?: (documents: readonly OutlineDocument[]) => void;
  /** The open document (controlled). Pair with onActiveChange. */
  readonly activeId?: string | null;
  readonly defaultActiveId?: string | null;
  readonly onActiveChange?: (id: string | null) => void;
  /**
   * Folders, starred documents and the inbox (controlled; see library.ts). Pair with
   * onLayoutChange. A document's folder is its own `folderId`.
   */
  readonly layout?: OutlineWorkspaceLayout;
  readonly defaultLayout?: OutlineWorkspaceLayout;
  readonly onLayoutChange?: (layout: OutlineWorkspaceLayout) => void;
  readonly ref?: React.Ref<OutlinerWorkspaceHandle>;
}

export interface OutlinerWorkspaceHandle {
  /** Open a document (optionally revealing one of its items). False when it does not exist. */
  open(documentId: string, itemId?: string): boolean;
  /** The open document's outliner handle. */
  active(): OutlinerHandle | null;
  /** The current documents, including edits a controlled host has not echoed yet. */
  getDocuments(): readonly OutlineDocument[];
  /** Create a document after the open one and open it. Returns its id. */
  create(title?: string): string;
  /** The current layout (folders, starred, inbox). */
  getLayout(): OutlineWorkspaceLayout;
  /** File `text` into the inbox as a new item (quick capture). Returns its id, or null. */
  capture(text: string): string | null;
  /** Open the ⌘O document finder. */
  find(): void;
}

/** How many documents stay mounted (and so keep history, zoom and scroll) at once. */
const KEEP_ALIVE = 6;

export function OutlinerWorkspace({
  documents,
  defaultDocuments,
  onDocumentsChange,
  activeId: activeProp,
  defaultActiveId,
  onActiveChange,
  layout: layoutProp,
  defaultLayout,
  onLayoutChange,
  ref,
  className,
  labels: labelOverrides,
  menuCommands: hostMenuCommands,
  ...outlinerProps
}: OutlinerWorkspaceProps) {
  const L = React.useMemo(() => resolveLabels(labelOverrides), [labelOverrides]);
  const { modKey } = usePlatformKeys();
  /* ── Documents: controlled or owned ── */
  const [own, setOwn] = React.useState<readonly OutlineDocument[]>(() => defaultDocuments ?? [createDocument("")]);
  const controlled = documents !== undefined;
  const docs = documents ?? own;
  const docsRef = React.useRef(docs);
  docsRef.current = docs;
  const commit = React.useCallback(
    (next: readonly OutlineDocument[]) => {
      if (next === docsRef.current) return;
      docsRef.current = next;
      if (!controlled) setOwn(next);
      onDocumentsChange?.(next);
    },
    [controlled, onDocumentsChange],
  );

  /* ── Layout: folders, starred documents, the inbox (controlled or owned) ── */
  const [ownLayout, setOwnLayout] = React.useState<OutlineWorkspaceLayout>(() => defaultLayout ?? EMPTY_LAYOUT);
  const layout = layoutProp ?? ownLayout;
  const layoutRef = React.useRef(layout);
  layoutRef.current = layout;
  const commitLayout = React.useCallback(
    (next: OutlineWorkspaceLayout) => {
      if (next === layoutRef.current) return;
      layoutRef.current = next;
      if (layoutProp === undefined) setOwnLayout(next);
      onLayoutChange?.(next);
    },
    [layoutProp, onLayoutChange],
  );
  /** Open folders: the reader's own state, never part of the layout. All open at first. */
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(() => new Set(layout.folders.map((folder) => folder.id)));
  const toggleFolder = React.useCallback((id: string, open?: boolean) => {
    setExpanded((current) => {
      const want = open ?? !current.has(id);
      if (want === current.has(id)) return current;
      const next = new Set(current);
      if (want) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);
  const revealFolder = React.useCallback((folderId: string | null) => {
    if (!folderId) return;
    const byId = new Map(layoutRef.current.folders.map((folder) => [folder.id, folder]));
    setExpanded((current) => {
      const next = new Set(current);
      for (let at: string | null = folderId, guard = 0; at && guard < 64; at = byId.get(at)?.parentId ?? null, guard++) next.add(at);
      return next.size === current.size ? current : next;
    });
  }, []);

  /* ── The open document ── */
  const [ownActive, setOwnActive] = React.useState<string | null>(() => defaultActiveId ?? docs[0]?.id ?? null);
  const requested = activeProp !== undefined ? activeProp : ownActive;
  const activeId = requested && docs.some((doc) => doc.id === requested) ? requested : (docs[0]?.id ?? null);
  const activate = React.useCallback(
    (id: string | null) => {
      if (activeProp === undefined) setOwnActive(id);
      onActiveChange?.(id);
    },
    [activeProp, onActiveChange],
  );

  /* ── Keep-alive: the recently opened documents stay mounted ── */
  const [mounted, setMounted] = React.useState<readonly string[]>(() => (activeId ? [activeId] : []));
  const live = mounted.filter((id) => docs.some((doc) => doc.id === id));
  const shown = activeId && !live.includes(activeId) ? [activeId, ...live].slice(0, KEEP_ALIVE) : live;
  /** Documents opened in this session, newest first (the finder's "recent"). */
  const [recent, setRecent] = React.useState<readonly string[]>(() => (activeId ? [activeId] : []));
  React.useEffect(() => {
    if (!activeId) return;
    setMounted((list) => (list[0] === activeId ? list : [activeId, ...list.filter((id) => id !== activeId)].slice(0, KEEP_ALIVE)));
    setRecent((list) => (list[0] === activeId ? list : [activeId, ...list.filter((id) => id !== activeId)].slice(0, 30)));
    // The open document's folder opens in the sidebar.
    const doc = docsRef.current.find((candidate) => candidate.id === activeId);
    if (doc) revealFolder(folderOf(layoutRef.current, doc));
  }, [activeId, revealFolder]);

  /* ── Per-document zoom memory (scroll is kept by the mounted outliner itself) ── */
  const [zoom, setZoom] = React.useState<Readonly<Record<string, string | null>>>({});
  const handles = React.useRef(new Map<string, OutlinerHandle>());
  const pendingReveal = React.useRef<{ readonly documentId: string; readonly itemId: string } | null>(null);
  /** The document a reveal already focused (its own item): the switch-focus fallback leaves it alone. */
  const revealed = React.useRef<string | null>(null);
  const open = React.useCallback(
    (documentId: string, itemId?: string) => {
      if (!docsRef.current.some((doc) => doc.id === documentId)) return false;
      activate(documentId);
      if (itemId) pendingReveal.current = { documentId, itemId };
      return true;
    },
    [activate],
  );
  // Reveal once the target document is the visible one (it may have had to mount first).
  React.useEffect(() => {
    const pending = pendingReveal.current;
    if (!pending || pending.documentId !== activeId) return;
    const frame = requestAnimationFrame(() => {
      const handle = handles.current.get(pending.documentId);
      if (!handle) return;
      pendingReveal.current = null;
      revealed.current = pending.documentId;
      if (!handle.focusItem(pending.itemId)) toast(L.linkedItemDeleted);
    });
    return () => cancelAnimationFrame(frame);
  });
  // Switching documents never strands the keyboard on <body> (or inside the now-inert pane, e.g.
  // after ⌘K "Open document"): the newly shown document's tree takes it, unless a reveal does.
  const shownBefore = React.useRef(activeId);
  React.useEffect(() => {
    if (shownBefore.current === activeId) return;
    shownBefore.current = activeId;
    if (!pendingReveal.current || pendingReveal.current.documentId !== activeId) revealed.current = null;
    // Wait out a closing dialog (the palette hands focus back to the pane it was opened from).
    let frame = 0;
    let frames = 0;
    const settle = () => {
      const active = document.activeElement;
      if (active?.closest("[role=dialog]") && frames++ < 40) {
        frame = requestAnimationFrame(settle);
        return;
      }
      const stranded = !active || active === document.body || !!active.closest("[inert]");
      // A reveal focuses its own item (one frame later); focusing the tree here as well would
      // race it and select the first row instead.
      if (revealed.current === activeId) return;
      if (stranded && activeId && !pendingReveal.current) handles.current.get(activeId)?.focus();
      else if (stranded && frames++ < 40) frame = requestAnimationFrame(settle);
    };
    frame = requestAnimationFrame(settle);
    return () => cancelAnimationFrame(frame);
  }, [activeId]);
  const openLink = React.useCallback(
    (id: string) => {
      const parts = parseQualifiedId(id);
      if (!parts || !open(parts.documentId, parts.itemId)) toast(L.linkedItemDeleted);
    },
    [open, L],
  );

  /* ── Create, rename, delete with undo, reorder ── */
  const [renaming, setRenaming] = React.useState<RenameTarget | null>(null);
  /** A new document: after the open one (in its folder), or at the end of `folderId`. */
  const create = React.useCallback(
    (title = "", folderId?: string | null) => {
      const current = docsRef.current;
      const activeDoc = current.find((candidate) => candidate.id === activeId);
      const folder = folderId !== undefined ? folderId : activeDoc ? folderOf(layoutRef.current, activeDoc) : null;
      const doc = { ...createDocument(title), ...(folder ? { folderId: folder } : {}) };
      const at = current.findIndex((candidate) => candidate.id === activeId);
      const placed = folderId === undefined && at >= 0 ? [...current.slice(0, at + 1), doc, ...current.slice(at + 1)] : placeDocument([...current, doc], layoutRef.current, doc.id, folder);
      commit(placed);
      revealFolder(folder);
      activate(doc.id);
      if (!title) setRenaming({ kind: "document", id: doc.id });
      return doc.id;
    },
    [activeId, commit, activate, revealFolder],
  );
  const rename = React.useCallback((id: string, title: string) => commit(renameDocument(docsRef.current, id, title)), [commit]);
  const remove = React.useCallback(
    (id: string) => {
      const before = docsRef.current;
      const next = neighbourAfterRemoval(before, id);
      const { documents: after, removed } = removeDocument(before, id);
      if (!removed) return;
      // A deleted inbox is no inbox: the next capture makes a new one (Undo gives this one back).
      const wasInbox = layoutRef.current.inboxId === id;
      commit(after);
      if (wasInbox) commitLayout({ ...layoutRef.current, inboxId: null });
      if (id === activeId) activate(next);
      toast(L.documentDeleted(removed.document.title || L.untitledDocument), {
        action: {
          label: L.undoAction,
          onClick: () => {
            commit(restoreDocument(docsRef.current, removed));
            if (wasInbox && !inboxOf(docsRef.current, layoutRef.current)) commitLayout({ ...layoutRef.current, inboxId: id });
            activate(removed.document.id);
          },
        },
      });
    },
    [activeId, activate, commit, commitLayout, L],
  );

  /* ── Folders, stars and the inbox ── */
  const library = React.useMemo<LibraryActions>(
    () => ({
      open: (id) => {
        open(id);
        if (!desktopRef.current) setSheetOpen(false);
      },
      createDocument: (folderId) => create("", folderId),
      createFolder: (parentId) => {
        const made = createFolder(layoutRef.current, "", parentId ?? null);
        commitLayout(made.layout);
        revealFolder(parentId ?? null);
        toggleFolder(made.id, true);
        setRenaming({ kind: "folder", id: made.id });
      },
      renameDocument: (id, title) => {
        rename(id, title);
        setRenaming(null);
      },
      renameFolder: (id, title) => {
        commitLayout(renameFolder(layoutRef.current, id, title));
        setRenaming(null);
      },
      startRename: setRenaming,
      cancelRename: () => setRenaming(null),
      removeDocument: (id) => remove(id),
      removeFolder: (id) => {
        const result = removeFolder(docsRef.current, layoutRef.current, id);
        if (!result.removed) return;
        const removed = result.removed;
        commit(result.documents);
        commitLayout(result.layout);
        toast(L.folderDeleted(removed.folder.title || L.untitledFolder, removed.documents.length), {
          action: {
            label: L.undoAction,
            onClick: () => {
              const back = restoreFolder(docsRef.current, layoutRef.current, removed);
              commit(back.documents);
              commitLayout(back.layout);
              toggleFolder(removed.folder.id, true);
            },
          },
        });
      },
      toggleFolder,
      toggleStar: (documentId) => {
        const result = toggleStar(layoutRef.current, documentId);
        commitLayout(result.layout);
        toast(result.starred ? L.documentStarred : L.documentUnstarred, { id: "workspace-star" });
      },
      setInbox: (documentId) => {
        commitLayout({ ...layoutRef.current, inboxId: documentId });
        const doc = docsRef.current.find((candidate) => candidate.id === documentId);
        toast(L.inboxSet(doc?.title || L.untitledDocument), { id: "workspace-inbox" });
      },
      placeDocument: (id, folderId, beforeId) => {
        commit(placeDocument(docsRef.current, layoutRef.current, id, folderId, beforeId ?? null));
        revealFolder(folderId);
      },
      moveFolder: (id, parentId, beforeId) => {
        commitLayout(moveFolder(layoutRef.current, id, parentId, beforeId ?? null));
        revealFolder(parentId);
      },
      shift: (kind, id, delta) => {
        if (kind === "folder") commitLayout(shiftFolder(layoutRef.current, id, delta));
        else commit(shiftDocument(docsRef.current, layoutRef.current, id, delta));
      },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, create, rename, remove, commit, commitLayout, toggleFolder, revealFolder, L],
  );

  /*
   * ── Edits that span documents: one step, undone and redone together ──
   * A move between documents (or a capture into the inbox) changes several documents. Each open
   * one records its side as ONE step in its own history; a closed one's side is plain data. The
   * sides are joined (`linked`): undo or redo any of them (⌘Z in either document, or the toast)
   * and the workspace travels the others too. When a side can no longer travel exactly (that
   * document was edited since, or closed and reopened), the same change is re-applied on top of
   * what is there instead, so an item is never lost and never in two places.
   */
  const linked = React.useRef<LinkedEdit[]>([]);
  const travelling = React.useRef(false);
  const nodesOf = (documentId: string): readonly OutlineItem[] | null =>
    handles.current.get(documentId)?.getValue() ?? docsRef.current.find((doc) => doc.id === documentId)?.nodes ?? null;
  /** The documents as they are right now (an open one's newest edits included). */
  const currentDocs = (): readonly OutlineDocument[] =>
    docsRef.current.map((doc) => {
      const nodes = handles.current.get(doc.id)?.getValue();
      return nodes && nodes !== doc.nodes ? { ...doc, nodes } : doc;
    });
  /** Write a document: through its outliner when open (one undo step there), else as data. */
  const writeNodes = (documentId: string, nodes: readonly OutlineItem[], carried?: ReadonlySet<string>): { readonly ok: boolean; readonly entry: unknown } => {
    const handle = handles.current.get(documentId);
    if (handle) {
      const ok = handle.replace(nodes, carried ? { carried } : undefined);
      return { ok, entry: ok ? handle.history().undo : null };
    }
    if (!docsRef.current.some((doc) => doc.id === documentId)) return { ok: false, entry: null };
    commit(replaceDocumentNodes(docsRef.current, documentId, nodes));
    return { ok: true, entry: null };
  };
  /** Move one side of a linked edit: exactly through its history when it can, else re-applied. */
  const travelSide = (side: LinkedSide, direction: "undo" | "redo") => {
    const handle = handles.current.get(side.documentId);
    if (handle && side.entry !== null) {
      const stacks = handle.history();
      if ((direction === "undo" ? stacks.undo : stacks.redo) === side.entry) {
        handle[direction](); // its travel hook re-points side.entry
        return;
      }
    }
    const current = nodesOf(side.documentId);
    if (!current) return; // the document is gone
    const want =
      direction === "undo"
        ? current === side.after ? side.before : side.backward(current)
        : current === side.before ? side.after : side.forward(current);
    if (want !== current) writeNodes(side.documentId, want, direction === "redo" ? side.carried : undefined);
    // A re-applied change is an ordinary step in that document, not one that travels.
    side.entry = null;
  };
  const travelEdit = (edit: LinkedEdit, direction: "undo" | "redo", except?: LinkedSide) => {
    edit.done = direction === "redo";
    travelling.current = true;
    try {
      for (const side of edit.sides) if (side !== except) travelSide(side, direction);
    } finally {
      travelling.current = false;
    }
  };
  /** Apply a planned cross-document edit; null (and nothing changed) when a document refuses. */
  const applyLinked = (changes: readonly DocumentChange[]): LinkedEdit | null => {
    const sides: LinkedSide[] = [];
    for (const change of changes) {
      const written = writeNodes(change.documentId, change.after, change.carried);
      if (!written.ok) {
        travelEdit({ sides, done: true }, "undo");
        return null;
      }
      sides.push({ ...change, entry: written.entry });
    }
    const edit: LinkedEdit = { sides, done: true };
    linked.current = [...linked.current.slice(-49), edit];
    return edit;
  };
  /** Still exactly as the edit left it everywhere (the Undo offer is honest only then). */
  const untouchedSince = (edit: LinkedEdit) =>
    edit.done &&
    edit.sides.every((side) => {
      const handle = handles.current.get(side.documentId);
      return handle && side.entry !== null ? handle.history().undo === side.entry : nodesOf(side.documentId) === side.after;
    });
  /** Every open document's outliner reports its undo / redo here: a linked step takes the rest along. */
  const travelHandlers = React.useRef(new Map<string, (travel: OutlineHistoryTravel) => void>());
  const travelFor = (documentId: string) => {
    let handler = travelHandlers.current.get(documentId);
    if (!handler)
      travelHandlers.current.set(
        documentId,
        (handler = (travel) => {
          for (const edit of linked.current)
            for (const side of edit.sides) {
              if (side.documentId !== documentId || side.entry !== travel.from) continue;
              side.entry = travel.to;
              if (travelling.current || edit.done === (travel.direction === "redo")) return;
              travelEdit(edit, travel.direction, side);
              return;
            }
        }),
      );
    return handler;
  };
  /** The workspace's own Undo toasts: dismissed as soon as their edit is no longer the latest. */
  const undoToast = React.useRef<{ readonly id: string | number; readonly edit: LinkedEdit | null; readonly valid: () => boolean } | null>(null);
  /** Show an Undo toast for a workspace edit; it replaces the previous one. */
  const offerUndo = (text: string, options: { readonly undo: () => void; readonly open: () => void; readonly valid: () => boolean; readonly edit: LinkedEdit | null }) => {
    if (undoToast.current) toast.dismiss(undoToast.current.id);
    const id = toast(text, {
      action: { label: L.openAction, onClick: options.open },
      cancel: { label: L.undoAction, onClick: options.undo },
      onDismiss: () => {
        if (undoToast.current?.id === id) undoToast.current = null;
      },
    });
    undoToast.current = { id, edit: options.edit, valid: options.valid };
  };
  React.useEffect(() => {
    const offer = undoToast.current;
    if (offer && !offer.valid()) {
      toast.dismiss(offer.id);
      undoToast.current = null;
    }
  });

  /* ── Quick capture: one field that files into the inbox from anywhere ── */
  const [captureOpen, setCaptureOpen] = React.useState(false);
  const capture = React.useCallback(
    (text: string): string | null => {
      if (!text.trim() || outlinerProps.readOnly) return null;
      const item = captureItem(text);
      const inbox = inboxOf(docsRef.current, layoutRef.current);
      let itemId = item.id;
      let undo: () => void;
      let valid: () => boolean;
      let edit: LinkedEdit | null = null;
      let target: OutlineDocument;
      if (!inbox) {
        // No inbox yet: one is made (first in the list) and remembered as the inbox.
        const made = { ...createDocument(L.inbox), nodes: [item] };
        target = made;
        commit([made, ...docsRef.current]);
        commitLayout({ ...layoutRef.current, inboxId: made.id });
        // Undo takes the new inbox away again, while it holds only the capture.
        valid = () => nodesOf(made.id) === made.nodes;
        undo = () => {
          if (!valid()) return;
          commit(docsRef.current.filter((doc) => doc.id !== made.id));
          if (layoutRef.current.inboxId === made.id) commitLayout({ ...layoutRef.current, inboxId: null });
        };
      } else {
        target = inbox;
        const plan = planAppend(currentDocs(), inbox.id, [item]);
        edit = plan ? applyLinked(plan.changes) : null;
        if (!plan || !edit) return null;
        itemId = plan.roots[0]!;
        const filed = edit;
        valid = () => untouchedSince(filed);
        undo = () => {
          if (untouchedSince(filed)) travelEdit(filed, "undo");
        };
      }
      offerUndo(L.capturedTo(target.title || L.inbox), { undo, open: () => open(target.id, itemId), valid, edit });
      return itemId;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [outlinerProps.readOnly, commit, commitLayout, open, L],
  );

  /* ── Move items to another document: drag onto it in the sidebar, or "Move to document…" ── */
  const moveItems = React.useCallback(
    (sourceId: string, ids: readonly string[], targetId: string): boolean => {
      const target = docsRef.current.find((doc) => doc.id === targetId);
      if (!handles.current.has(sourceId) || !target || targetId === sourceId || outlinerProps.readOnly) return false;
      // The target mounts first (hidden), so the move is a step in ITS history too: ⌘Z there undoes it.
      if (!handles.current.has(targetId))
        flushSync(() => setMounted((list) => [...list.slice(0, 1), targetId, ...list.slice(1).filter((id) => id !== targetId)].slice(0, KEEP_ALIVE)));
      const plan = planItemMove(currentDocs(), sourceId, ids, targetId);
      if (!plan) return false;
      const edit = applyLinked(plan.changes);
      if (!edit) {
        toast(L.cannotMoveItems, { id: "workspace-move" });
        return false;
      }
      const first = plan.roots[0]!;
      offerUndo(L.movedToDocument(plan.roots.length, target.title || L.untitledDocument), {
        // Only while nothing has happened since in any of the documents (never a later edit).
        undo: () => {
          if (untouchedSince(edit)) travelEdit(edit, "undo");
        },
        open: () => open(targetId, first),
        valid: () => untouchedSince(edit),
        edit,
      });
      return true;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, L, outlinerProps.readOnly],
  );
  const moveRef = React.useRef(moveItems);
  moveRef.current = moveItems;
  const dropHandlers = React.useRef(new Map<string, (ids: readonly string[], target: string) => boolean>());
  const dropFor = (sourceId: string) => {
    let handler = dropHandlers.current.get(sourceId);
    if (!handler) dropHandlers.current.set(sourceId, (handler = (ids, targetId) => moveRef.current(sourceId, ids, targetId)));
    return handler;
  };
  /** "Move to document…" in every item menu and the phone sheet: the finder picks the target. */
  const [moving, setMoving] = React.useState<{ readonly sourceId: string; readonly ids: readonly string[] } | null>(null);
  const commandHandlers = React.useRef(new Map<string, OutlinerItemCommands>());
  const commandsFor = (sourceId: string) => {
    let handler = commandHandlers.current.get(sourceId);
    if (!handler)
      commandHandlers.current.set(
        sourceId,
        (handler = () =>
          docsRef.current.length > 1 && !readOnlyRef.current
            ? [{ id: "move-to-document", label: `${L.moveToDocument}…`, icon: <FileInput />, run: (ids) => setMoving({ sourceId, ids }) }]
            : []),
      );
    return handler;
  };
  /** Starred documents for each pane's bookmarks menu (stable until stars or titles change). */
  const starredKey = starredDocuments(docs, layout).map((doc) => `${doc.id}\u0000${doc.title}`).join("\u0001");
  const starredCache = React.useMemo(() => new Map<string, OutlinerStarredDocuments>(), [starredKey]);
  const starredFor = (documentId: string): OutlinerStarredDocuments => {
    let made = starredCache.get(documentId);
    if (!made)
      starredCache.set(
        documentId,
        (made = {
          items: starredDocuments(docsRef.current, layoutRef.current).map((doc) => ({ id: doc.id, title: doc.title || L.untitledDocument })),
          open: (id) => open(id),
          unstar: (id) => library.toggleStar(id),
          current: layoutRef.current.starred.includes(documentId),
          toggleCurrent: () => library.toggleStar(documentId),
        }),
      );
    return made;
  };
  const readOnlyRef = React.useRef(outlinerProps.readOnly);
  readOnlyRef.current = outlinerProps.readOnly;

  /* ── ⌘O finder and ⌘⇧Space capture, from anywhere in the workspace ── */
  const [finderOpen, setFinderOpen] = React.useState(false);
  const lastPointer = React.useRef<"pane" | "sidebar" | null>(null);
  const activeRef = React.useRef(activeId);
  activeRef.current = activeId;
  const rootRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod || event.altKey) return;
      const active = document.activeElement;
      const inside = !active || active === document.body || !!rootRef.current?.contains(active);
      if (!inside) return;
      // From the sidebar (outside every outline), ⌘K / ⌘F / ⌘/ still reach the open document.
      const inPane = !!active?.closest("[data-document]") || !!active?.closest("[role=dialog]");
      const fromSidebar = active && active !== document.body ? !inPane : lastPointer.current === "sidebar";
      if (fromSidebar && ["k", "f", "/"].includes(event.key.toLowerCase())) {
        const handle = activeRef.current ? handles.current.get(activeRef.current) : null;
        if (!handle) return;
        event.preventDefault();
        handle.focus();
        const init = { key: event.key, code: event.code, metaKey: event.metaKey, ctrlKey: event.ctrlKey, shiftKey: event.shiftKey, bubbles: true, cancelable: true };
        document.activeElement?.dispatchEvent(new KeyboardEvent("keydown", init));
        return;
      }
      if (event.key.toLowerCase() === "o" && !event.shiftKey) {
        event.preventDefault();
        setCaptureOpen(false);
        setFinderOpen(true);
      } else if (event.shiftKey && (event.code === "Space" || event.key === " ")) {
        event.preventDefault();
        setFinderOpen(false);
        setCaptureOpen(true);
      }
    };
    // Where the last pointer went in the workspace (a click on the sidebar can leave focus on <body>).
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      lastPointer.current = !rootRef.current?.contains(target) ? null : target?.closest("[data-document]") ? "pane" : "sidebar";
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
    };
  }, []);
  const revealFolderRow = (folderId: string) => {
    const folder = layoutRef.current.folders.find((candidate) => candidate.id === folderId);
    revealFolder(folder?.parentId ?? null);
    toggleFolder(folderId, true);
    setTab("documents");
    if (desktopRef.current) setCollapsed(false);
    else setSheetOpen(true);
    let tries = 0;
    const focus = () => {
      const el = rootRef.current?.ownerDocument.querySelector<HTMLElement>(`[data-lib-focus="folder:${CSS.escape(folderId)}"]`);
      if (el) el.focus();
      else if (tries++ < 20) requestAnimationFrame(focus);
    };
    requestAnimationFrame(focus);
  };

  /* ── Tags: the sidebar's second tab ── */
  const [tab, setTab] = React.useState<"documents" | "tags">("documents");
  const [tagScope, setTagScope] = React.useState<"document" | "all">("document");
  const selectTags = (keys: readonly string[]) => {
    setScope(keys.length && tagScope === "all" ? "all" : "document");
    if (activeId) handles.current.get(activeId)?.search(keys.join(" "));
    // A phone shows the results: the sheet steps aside.
    if (!desktopRef.current && keys.length) setSheetOpen(false);
  };

  React.useImperativeHandle(
    ref,
    (): OutlinerWorkspaceHandle => ({
      open,
      active: () => (activeId ? (handles.current.get(activeId) ?? null) : null),
      getDocuments: () => docsRef.current,
      create,
      getLayout: () => layoutRef.current,
      capture,
      find: () => setFinderOpen(true),
    }),
    [open, activeId, create, capture],
  );

  /* ── Cross-document links: one adapter per document, stable until what it shows changes ── */
  const adapters = React.useRef(new Map<string, { readonly key: string; readonly links: OutlineExternalLinks }>());
  const linksFor = (documentId: string): OutlineExternalLinks => {
    const backlinks = crossBacklinks(docs, documentId);
    const counts = new Map<string, number>();
    for (const [itemId, refs] of backlinks) counts.set(itemId, refs.length);
    // The titles this document's own cross links show (a rename elsewhere re-renders them).
    const self = docs.find((doc) => doc.id === documentId);
    const shownTitles = self ? outgoingTitles(self.nodes, docs) : "";
    const key = [...counts].map(([id, n]) => `${id}:${n}`).join(",") + "|" + shownTitles + "|" + docs.map((doc) => `${doc.id}=${doc.title}`).join(",");
    const cached = adapters.current.get(documentId);
    if (cached?.key === key) return cached.links;
    const links: OutlineExternalLinks = {
      resolve: (id) => (parseQualifiedId(id) ? (resolveLink(docsRef.current, id)?.node.text ?? null) : undefined),
      open: openLink,
      backlinks: (itemId) => crossBacklinks(docsRef.current, documentId).get(itemId) ?? [],
      counts,
      suggest: (query, limit) => suggestLinks(docsRef.current, documentId, query, limit),
      qualify: (itemId) => qualifiedId(documentId, itemId),
    };
    adapters.current.set(documentId, { key, links });
    return links;
  };

  /* ── ⌘K: open any document, or make a new one ── */
  const paletteGroups = React.useMemo<readonly OutlinerPaletteGroup[]>(
    () => [
      {
        heading: L.documents,
        commands: [
          ...docs.map((doc) => ({
            id: `open-${doc.id}`,
            label: L.openDocument(doc.title || L.untitledDocument),
            keywords: "open document switch go to",
            icon: <FileText />,
            hint: doc.id === activeId ? "●" : undefined,
            run: () => open(doc.id),
          })),
          { id: "new-document", label: L.newDocument, keywords: "create add document", icon: <FilePlus />, run: () => create() },
          { id: "find-document", label: `${L.findDocument}…`, keywords: "open switch fuzzy finder jump", icon: <Search />, hint: `${modKey}O`, run: () => setFinderOpen(true) },
          { id: "quick-capture", label: L.quickCapture, keywords: "inbox capture add note thought", icon: <Inbox />, hint: `${modKey}⇧Space`, run: () => setCaptureOpen(true) },
          ...(activeId
            ? [
                {
                  id: "star-document",
                  label: layout.starred.includes(activeId) ? L.unstarDocument : L.starDocument,
                  keywords: "bookmark favourite favorite document",
                  icon: <Star />,
                  run: () => library.toggleStar(activeId),
                },
              ]
            : []),
          { id: "new-folder", label: L.newFolder, keywords: "create add folder group", icon: <FolderPlus />, run: () => library.createFolder(null) },
        ],
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docs.map((doc) => `${doc.id}\u0000${doc.title}`).join("\u0001"), activeId, L, layout.starred, library, modKey],
  );
  /** The ⋯ view menu's top entries (a phone has no ⌘O): find, capture. */
  const menuCommands = React.useMemo<readonly OutlinerPaletteCommand[]>(
    () => [
      { id: "find-document", label: `${L.findDocument}…`, icon: <Search />, hint: `${modKey}O`, run: () => setFinderOpen(true) },
      { id: "quick-capture", label: L.quickCapture, icon: <Inbox />, hint: `${modKey}⇧␣`, run: () => setCaptureOpen(true) },
      // The host's own entries (menuCommands on the workspace) follow the workspace's.
      ...(hostMenuCommands ?? []),
    ],
    [L, modKey, hostMenuCommands],
  );

  /* ── Search scope: this document or all of them ── */
  const [scope, setScope] = React.useState<"document" | "all">("document");
  const [resultSort, setResultSort] = React.useState<ResultSort>("document");
  /** Each document's current query (the tag pane follows the open one's). */
  const [queries, setQueries] = React.useState<Readonly<Record<string, string>>>({});
  const scopes = React.useMemo(() => new Map<string, OutlinerSearchScope>(), [scope, open, L, resultSort]);
  const searchScopeFor = (documentId: string): OutlinerSearchScope => {
    let made = scopes.get(documentId);
    if (!made)
      scopes.set(
        documentId,
        (made = {
          value: scope,
          onChange: setScope,
          renderResults: (query) => <WorkspaceResults query={query} documents={docsRef.current} labels={L} onOpen={open} sort={resultSort} onSort={setResultSort} />,
          count: (query) => searchDocuments(docsRef.current, query).reduce((sum, hit) => sum + hit.result.matches.length, 0),
          onQueryChange: (query) => setQueries((all) => ((all[documentId] ?? "") === query ? all : { ...all, [documentId]: query })),
        }),
      );
    return made;
  };

  /* ── Layout ── */
  const desktop = useMediaQuery("(min-width: 768px)");
  const desktopRef = React.useRef(desktop);
  desktopRef.current = desktop;
  const [collapsed, setCollapsed] = React.useState(false);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const switcher = React.useMemo(() => (
    <>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={L.documents}
          aria-expanded={desktop ? !collapsed : sheetOpen}
          data-documents-trigger=""
          onClick={() => (desktop ? setCollapsed((value) => !value) : setSheetOpen(true))}
          className="coarse:size-10"
        >
          <PanelLeft className="rtl:-scale-x-100" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{L.documents}</TooltipContent>
    </Tooltip>
    {desktop && !outlinerProps.readOnly && (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label={L.quickCapture} data-capture-trigger="" onClick={() => setCaptureOpen(true)}>
            <Inbox />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {L.quickCapture} <Kbd dir="ltr">{modKey}⇧Space</Kbd>
        </TooltipContent>
      </Tooltip>
    )}
    </>
  ), [desktop, collapsed, sheetOpen, L, modKey, outlinerProps.readOnly]);
  // The tags the open document's search asks for: typing a query by hand keeps the pane honest.
  const activeQuery = React.useMemo(() => tagsInQuery(activeId ? (queries[activeId] ?? "") : ""), [queries, activeId]);
  const list = (
    <LibraryPanel
      documents={docs}
      layout={layout}
      activeId={activeId}
      expanded={expanded}
      renaming={renaming}
      labels={L}
      actions={library}
      tab={tab}
      onTab={setTab}
      readOnly={outlinerProps.readOnly}
      tags={{
        documents: docs,
        activeId,
        scope: tagScope,
        onScope: (next) => {
          setTagScope(next);
          if (activeQuery.length) setScope(next === "all" ? "all" : "document");
        },
        selected: activeQuery,
        onSelect: selectTags,
      }}
    />
  );
  const onValueChange = React.useCallback(
    (documentId: string) => (nodes: readonly OutlineItem[]) => commit(replaceDocumentNodes(docsRef.current, documentId, nodes)),
    [commit],
  );
  const changeHandlers = React.useRef(new Map<string, (nodes: readonly OutlineItem[]) => void>());
  const handlerFor = (documentId: string) => {
    let handler = changeHandlers.current.get(documentId);
    if (!handler) changeHandlers.current.set(documentId, (handler = (nodes) => onValueChange(documentId)(nodes)));
    return handler;
  };
  const titleHandlers = React.useRef(new Map<string, (title: string) => void>());
  const titleFor = (documentId: string) => {
    let handler = titleHandlers.current.get(documentId);
    if (!handler) titleHandlers.current.set(documentId, (handler = (title) => rename(documentId, title)));
    return handler;
  };
  const zoomHandlers = React.useRef(new Map<string, (id: string | null) => void>());
  const zoomFor = (documentId: string) => {
    let handler = zoomHandlers.current.get(documentId);
    if (!handler) zoomHandlers.current.set(documentId, (handler = (id) => setZoom((all) => (all[documentId] === id ? all : { ...all, [documentId]: id }))));
    return handler;
  };

  /* ── A document that cannot be shown stays contained (DocumentBoundary); remount or repair it ── */
  const [epochs, setEpochs] = React.useState<Readonly<Record<string, number>>>({});
  const remountHandlers = React.useRef(new Map<string, () => void>());
  const remountFor = (documentId: string) => {
    let handler = remountHandlers.current.get(documentId);
    if (!handler) remountHandlers.current.set(documentId, (handler = () => setEpochs((all) => ({ ...all, [documentId]: (all[documentId] ?? 0) + 1 }))));
    return handler;
  };
  const repairHandlers = React.useRef(new Map<string, () => void>());
  const repairFor = (documentId: string) => {
    let handler = repairHandlers.current.get(documentId);
    if (!handler)
      repairHandlers.current.set(
        documentId,
        (handler = () => {
          const doc = docsRef.current.find((candidate) => candidate.id === documentId);
          const repaired = doc ? repairDuplicateIds(doc.nodes) : null;
          if (repaired) commit(replaceDocumentNodes(docsRef.current, documentId, repaired));
          remountFor(documentId)();
        }),
      );
    return handler;
  };

  return (
    <div ref={rootRef} data-slot="outliner-workspace" className={cn("relative flex min-h-0 overflow-hidden rounded-xl border bg-surface", className)}>
      <AnimatePresence initial={false}>
        {desktop && !collapsed && (
          <motion.aside
            key="documents"
            aria-label={L.documents}
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 248, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={motionTokens.base}
            className="shrink-0 overflow-hidden border-e border-hairline bg-muted/25 dark:bg-foreground/[0.02]"
          >
            <div className="flex h-full w-[248px] flex-col">{list}</div>
          </motion.aside>
        )}
      </AnimatePresence>
      <div className="relative min-w-0 flex-1">
        {!docs.length && (
          <div className="grid h-full place-items-center p-8 text-center">
            <div>
              <p className="text-ui text-muted-foreground">{L.noDocuments}</p>
              <Button className="mt-3" size="sm" variant="outline" onClick={() => create()}>
                <FilePlus /> {L.newDocument}
              </Button>
            </div>
          </div>
        )}
        {shown.map((id) => {
          const doc = docs.find((candidate) => candidate.id === id);
          if (!doc) return null;
          return (
            <DocumentPane
              key={`${id}:${epochs[id] ?? 0}`}
              id={id}
              active={id === activeId}
              nodes={doc.nodes}
              controlled={controlled}
              title={doc.title || L.untitledDocument}
              outliner={outlinerProps}
              labels={labelOverrides}
              handles={handles.current}
              onValueChange={handlerFor(id)}
              hoistedId={zoom[id] ?? null}
              onHoistChange={zoomFor(id)}
              onTitleChange={titleFor(id)}
              externalLinks={linksFor(id)}
              headerStart={switcher}
              paletteGroups={paletteGroups}
              searchScope={searchScopeFor(id)}
              menuCommands={menuCommands}
              onExternalDrop={dropFor(id)}
              itemCommands={commandsFor(id)}
              starredDocuments={starredFor(id)}
              onHistoryTravel={travelFor(id)}
              onRemount={remountFor(id)}
              onRepair={outlinerProps.readOnly ? null : repairFor(id)}
            />
          );
        })}
      </div>
      {!desktop && (
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            className="w-[86%] max-w-xs gap-0 p-0 pt-[env(safe-area-inset-top)]"
            showCloseButton={false}
            onOpenAutoFocus={(event) => {
              // Start on the open document (not the first button, whose tooltip would pop up on focus).
              event.preventDefault();
              const target = event.currentTarget as HTMLElement | null;
              requestAnimationFrame(() => target?.querySelector<HTMLElement>("[data-doc-open][aria-current=page]")?.focus({ preventScroll: true }));
            }}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>{L.documents}</SheetTitle>
              <SheetDescription>{L.documents}</SheetDescription>
            </SheetHeader>
            {list}
          </SheetContent>
        </Sheet>
      )}
      {!desktop && !outlinerProps.readOnly && <CaptureFab labels={L} onClick={() => setCaptureOpen(true)} />}
      <QuickCapture
        open={captureOpen}
        onOpenChange={setCaptureOpen}
        inboxTitle={inboxOf(docs, layout)?.title || null}
        onCapture={(text) => capture(text) !== null}
        labels={L}
        phone={!desktop}
        modKey={modKey}
      />
      <DocumentFinder
        open={!!moving}
        onOpenChange={(next) => !next && setMoving(null)}
        documents={docs.filter((doc) => doc.id !== moving?.sourceId)}
        layout={layout}
        recent={recent}
        activeId={null}
        labels={L}
        coarse={!desktop}
        documentsOnly
        title={moving ? L.moveItemsTo(moving.ids.length) : undefined}
        enterAction={L.moveAction}
        onDocument={(id) => {
          if (moving) {
            moveItems(moving.sourceId, moving.ids, id);
            // The row whose menu opened the picker has left with the move, so the dialog's focus
            // return lands on <body>: hand it to the source outline (⌘Z there undoes the move).
            handles.current.get(moving.sourceId)?.focus();
          }
          setMoving(null);
        }}
        onFolder={() => {}}
      />
      <DocumentFinder
        open={finderOpen}
        onOpenChange={setFinderOpen}
        documents={docs}
        layout={layout}
        recent={recent}
        activeId={activeId}
        labels={L}
        coarse={!desktop}
        onDocument={(id) => {
          open(id);
          if (!desktop) setSheetOpen(false);
        }}
        onFolder={revealFolderRow}
      />
    </div>
  );
}

/** One document's side of a cross-document edit, and where its step sits in that document's history. */
interface LinkedSide extends DocumentChange {
  /** The history entry that stands for this side right now (null: closed, or no longer travels). */
  entry: unknown;
}
interface LinkedEdit {
  readonly sides: readonly LinkedSide[];
  /** Applied (true) or undone (false). */
  done: boolean;
}

interface DocumentPaneProps {
  readonly id: string;
  readonly active: boolean;
  readonly nodes: readonly OutlineItem[];
  readonly controlled: boolean;
  readonly title: string;
  readonly outliner: Omit<OutlinerWorkspaceProps, "documents" | "defaultDocuments" | "onDocumentsChange" | "activeId" | "defaultActiveId" | "onActiveChange" | "ref" | "className" | "labels">;
  readonly labels: OutlinerProps["labels"];
  readonly handles: Map<string, OutlinerHandle>;
  readonly onValueChange: (nodes: readonly OutlineItem[]) => void;
  readonly hoistedId: string | null;
  readonly onHoistChange: (id: string | null) => void;
  readonly onTitleChange: (title: string) => void;
  readonly externalLinks: OutlineExternalLinks;
  readonly headerStart: React.ReactNode;
  readonly paletteGroups: readonly OutlinerPaletteGroup[];
  readonly searchScope: OutlinerSearchScope;
  readonly menuCommands: readonly OutlinerPaletteCommand[];
  readonly onExternalDrop: (ids: readonly string[], target: string) => boolean;
  readonly itemCommands: OutlinerItemCommands;
  readonly starredDocuments: OutlinerStarredDocuments;
  readonly onHistoryTravel: (travel: OutlineHistoryTravel) => void;
  /** Mount the document afresh (its error state cleared). */
  readonly onRemount: () => void;
  /** Give repeated ids fresh ones, then remount (null: read-only). */
  readonly onRepair: (() => void) | null;
}

/**
 * One mounted document. Memoized (host props compared shallowly), so typing in the open document
 * never re-renders the hidden ones; an uncontrolled pane ignores later `nodes` (it owns them).
 */
const DocumentPane = React.memo(
  function DocumentPane({ id, active, nodes, controlled, title, outliner, labels, handles, onRemount, onRepair, ...rest }: DocumentPaneProps) {
    const ref = React.useCallback(
      (handle: OutlinerHandle | null) => {
        if (handle) handles.set(id, handle);
        else handles.delete(id);
      },
      [handles, id],
    );
    return (
      <div data-document={id} inert={!active} className={cn("absolute inset-0 flex", !active && "invisible")}>
        <DocumentBoundary title={title} labels={labels} resetKey={controlled ? nodes : null} onRetry={onRemount} onRepair={onRepair}>
          <Outliner
            {...outliner}
            {...rest}
            labels={labels}
            ref={ref}
            className="h-full w-full min-w-0 rounded-none border-0"
            title={title}
            {...(controlled ? { value: nodes } : { defaultValue: nodes })}
          />
        </DocumentBoundary>
      </div>
    );
  },
  (a, b) => {
    for (const key of Object.keys(b) as (keyof DocumentPaneProps)[]) {
      if (key === "outliner") continue;
      if (key === "nodes" && !b.controlled) continue;
      if (a[key] !== b[key]) return false;
    }
    const ka = Object.keys(a.outliner) as (keyof DocumentPaneProps["outliner"])[];
    const kb = Object.keys(b.outliner);
    return ka.length === kb.length && ka.every((key) => a.outliner[key] === b.outliner[key]);
  },
);

/**
 * One document that throws while rendering (data it cannot open, a host renderer that fails)
 * shows a contained notice instead of taking the whole workspace down. A controlled document
 * clears the notice when the host sends new nodes; Try again and Repair remount it.
 */
class DocumentBoundary extends React.Component<
  {
    readonly title: string;
    readonly labels: OutlinerProps["labels"];
    readonly resetKey: unknown;
    readonly onRetry: () => void;
    readonly onRepair: (() => void) | null;
    readonly children: React.ReactNode;
  },
  { readonly error: Error | null }
> {
  override state: { readonly error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidUpdate(previous: { readonly resetKey: unknown }) {
    if (this.state.error && previous.resetKey !== this.props.resetKey) this.setState({ error: null });
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const L = resolveLabels(this.props.labels);
    return (
      <div role="alert" data-document-error="" className="grid h-full w-full place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="text-ui font-medium">{L.documentFailed(this.props.title)}</p>
          <p className="mt-1 text-[13px] text-muted-foreground">{L.documentFailedHint}</p>
          <p dir="auto" className="mt-2 truncate font-mono text-[11px] text-muted-foreground">{error.message}</p>
          <div className="mt-4 flex justify-center gap-2">
            {this.props.onRepair && (
              <Button size="sm" className="coarse:h-11" onClick={this.props.onRepair}>
                {L.repairDocument}
              </Button>
            )}
            <Button size="sm" variant="outline" className="coarse:h-11" onClick={this.props.onRetry}>
              {L.tryAgain}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

/** Resolved titles of a document's own cross-document links (part of its adapter's cache key). */
const titleCache = new WeakMap<readonly OutlineItem[], { readonly docs: readonly OutlineDocument[]; readonly key: string }>();
function outgoingTitles(nodes: readonly OutlineItem[], docs: readonly OutlineDocument[]): string {
  const cached = titleCache.get(nodes);
  if (cached?.docs === docs) return cached.key;
  const parts: string[] = [];
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    for (const target of outgoingLinks(node)) if (parseQualifiedId(target)) parts.push(`${target}=${resolveLink(docs, target)?.node.text ?? "\u0000"}`);
    if (node.children) stack.push(...node.children);
  }
  const key = parts.join("\u0001");
  titleCache.set(nodes, { docs, key });
  return key;
}

type Labels = ReturnType<typeof resolveLabels>;

/* ───────────────────────────── Results across documents ───────────────────────────── */

function WorkspaceResults({
  query,
  documents,
  labels: L,
  onOpen,
  sort,
  onSort,
}: {
  readonly query: string;
  readonly documents: readonly OutlineDocument[];
  readonly labels: Labels;
  readonly onOpen: (documentId: string, itemId: string) => boolean;
  /** "document": grouped by document (A → Z); "date" / "title": one flat list across documents. */
  readonly sort: ResultSort;
  readonly onSort: (sort: ResultSort) => void;
}) {
  const hits = React.useMemo(() => searchDocuments(documents, query), [documents, query]);
  const diagnostic = hits[0]?.result.diagnostics[0];
  const total = hits.reduce((sum, hit) => sum + hit.result.matches.length, 0);
  const flat = React.useMemo(() => {
    const all = hits.flatMap(({ document, result }) =>
      result.matches.flatMap((match, order) => {
        const node = findIn(document.nodes, match.id);
        return node ? [{ node, order, documentId: document.id, document: document.title || L.untitledDocument }] : [];
      }),
    );
    // Across documents the tiebreak is the document, then outline order inside it.
    const docOrder = new Map(documents.map((doc, i) => [doc.id, i]));
    const ranked = all.map((entry) => ({ ...entry, order: (docOrder.get(entry.documentId) ?? 0) * 1_000_000 + entry.order }));
    return sortResults(ranked, sort === "outline" ? "document" : sort);
  }, [hits, documents, sort, L]);
  const listRef = React.useRef<HTMLDivElement>(null);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const all = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-scope-result]") ?? [])];
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const next = all[at + (event.key === "ArrowDown" ? 1 : -1)];
    event.preventDefault();
    if (next) next.focus();
    else if (event.key === "ArrowUp") (listRef.current?.closest("[data-slot=outliner]")?.querySelector("input[aria-label]") as HTMLElement | null)?.focus();
  };
  if (diagnostic) return <p className="ps-[30px] font-mono text-[11px] text-destructive">{diagnostic.message}</p>;
  const result = (documentId: string, node: OutlineItem, context: string) => (
    <li key={`${documentId}/${node.id}`}>
      <button
        type="button"
        data-scope-result=""
        onClick={() => onOpen(documentId, node.id)}
        className="flex w-full min-w-0 items-baseline gap-2 rounded-md px-1.5 py-1 text-start outline-none transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 coarse:min-h-11 coarse:items-center"
      >
        <span className="size-1 shrink-0 translate-y-[-2px] rounded-full bg-foreground/40" />
        <span dir="auto" className="min-w-0 truncate text-ui">{inlineToPlain(node.text) || L.untitled}</span>
        <span dir="auto" className="ms-auto max-w-[45%] shrink-0 truncate font-mono text-[10.5px] text-muted-foreground">
          {context}
        </span>
      </button>
    </li>
  );
  const grouped = sort === "document" || sort === "outline";
  const groups = grouped
    ? [...new Set(flat.map((entry) => entry.documentId))].map((id) => ({ id, entries: flat.filter((entry) => entry.documentId === id) }))
    : [];
  return (
    <div ref={listRef} onKeyDown={onKeyDown} className="ps-[26px]">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10.5px] tracking-wide text-muted-foreground uppercase">
        <Search className="size-3" /> <span className="me-auto">{L.allDocuments} · {total}</span>
        {total > 1 && <ResultSortControl value={sort === "outline" ? "document" : sort} options={["document", "date", "title"]} onChange={onSort} />}
      </div>
      {!hits.length && <p className="py-4 text-ui text-muted-foreground">{L.noMatches(query)}</p>}
      {grouped ? (
        groups.map(({ id, entries }) => (
          <motion.section key={id} layout="position" initial={{ opacity: 0, y: 2 }} animate={{ opacity: 1, y: 0 }} transition={motionTokens.quick} className="mb-3">
            <h3 className="flex items-center gap-2 px-1.5 pb-1 text-[12px] font-semibold">
              <FileText className="size-3.5 text-muted-foreground" />
              <span dir="auto" className="min-w-0 truncate">{entries[0]!.document}</span>
              <span className="font-mono text-[10.5px] font-normal text-muted-foreground tabular-nums">{entries.length}</span>
            </h3>
            <ul>{entries.slice(0, 50).map((entry) => result(entry.documentId, entry.node, pathOf(documents.find((doc) => doc.id === entry.documentId)!.nodes, entry.node.id)))}</ul>
          </motion.section>
        ))
      ) : (
        <motion.ul key={sort} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={motionTokens.quick}>
          {flat.slice(0, 200).map((entry) => result(entry.documentId, entry.node, entry.document))}
        </motion.ul>
      )}
    </div>
  );
}

function findIn(nodes: readonly OutlineItem[], id: string): OutlineItem | null {
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.id === id) return node;
    if (node.children) stack.push(...node.children);
  }
  return null;
}
function pathOf(nodes: readonly OutlineItem[], id: string): string {
  const walk = (items: readonly OutlineItem[], trail: string[]): string[] | null => {
    for (const node of items) {
      if (node.id === id) return trail;
      if (node.children) {
        const found = walk(node.children, [...trail, inlineToPlain(node.text)]);
        if (found) return found;
      }
    }
    return null;
  };
  return (walk(nodes, []) ?? []).join(" › ");
}
