import { createOutlineId, findOutlineNode, validateOutline } from "../index.js";
import { inlineToPlain } from "./inline.js";
import { reidentify } from "./interchange.js";
import { parseQualifiedId, qualifiedId } from "./workspace.js";
import type {
  OutlineDocument,
  OutlineFolder,
  OutlineItem,
  OutlineWorkspaceLayout,
} from "./types.js";

/**
 * The workspace library, framework-free and pure: folders for documents, starred documents, the
 * designated inbox, quick capture, and the document finder's ranking.
 *
 *   OutlineDocument.folderId   which folder a document lives in (absent or unknown: top level)
 *   layout.folders             nested folders (`parentId`), siblings in array order
 *   layout.starred             starred document ids, in star order
 *   layout.inboxId             the document quick capture files into
 *
 * Documents keep their order in the documents array; a folder lists its documents in that order.
 * Folders come first at every level, then documents. Folding a folder is reader state (the
 * sidebar's own), never part of the layout. Nothing here persists anything.
 */
export const EMPTY_LAYOUT: OutlineWorkspaceLayout = { folders: [], starred: [], inboxId: null };

/** A document's folder, or null when it sits at the top level (or its folder is gone). */
export function folderOf(layout: OutlineWorkspaceLayout, document: OutlineDocument): string | null {
  const id = document.folderId ?? null;
  return id && layout.folders.some((folder) => folder.id === id) ? id : null;
}

/* ───────────── Folders ───────────── */

export function createFolder(
  layout: OutlineWorkspaceLayout,
  title: string,
  parentId: string | null = null,
  id: string = createOutlineId(),
): { readonly layout: OutlineWorkspaceLayout; readonly id: string } {
  const parent =
    parentId && layout.folders.some((folder) => folder.id === parentId) ? parentId : null;
  return {
    layout: {
      ...layout,
      folders: [...layout.folders, { id, title, ...(parent ? { parentId: parent } : {}) }],
    },
    id,
  };
}

export function renameFolder(
  layout: OutlineWorkspaceLayout,
  id: string,
  title: string,
): OutlineWorkspaceLayout {
  const at = layout.folders.findIndex((folder) => folder.id === id);
  if (at < 0 || layout.folders[at]!.title === title) return layout;
  return {
    ...layout,
    folders: layout.folders.map((folder, i) => (i === at ? { ...folder, title } : folder)),
  };
}

/** Whether `id` is `ancestorId` or lies inside it. */
export function isWithin(
  layout: OutlineWorkspaceLayout,
  id: string | null,
  ancestorId: string,
): boolean {
  const byId = new Map(layout.folders.map((folder) => [folder.id, folder]));
  for (
    let at = id, guard = 0;
    at && guard <= layout.folders.length;
    at = byId.get(at)?.parentId ?? null, guard++
  )
    if (at === ancestorId) return true;
  return false;
}

/**
 * Move a folder into `parentId` (null: top level), before `beforeId` (a sibling folder) or at
 * the end. Moving a folder into itself or its own subfolder is refused (same layout back).
 */
export function moveFolder(
  layout: OutlineWorkspaceLayout,
  id: string,
  parentId: string | null,
  beforeId: string | null = null,
): OutlineWorkspaceLayout {
  const folder = layout.folders.find((candidate) => candidate.id === id);
  if (!folder || (parentId && isWithin(layout, parentId, id))) return layout;
  if (beforeId === id) return layout;
  const rest = layout.folders.filter((candidate) => candidate.id !== id);
  const moved: OutlineFolder = parentId ? { ...folder, parentId } : withoutParent(folder);
  let at = beforeId ? rest.findIndex((candidate) => candidate.id === beforeId) : -1;
  if (at < 0) {
    // After the last sibling in the new parent (array order is sibling order).
    const lastSibling = rest.findLastIndex(
      (candidate) => (candidate.parentId ?? null) === parentId,
    );
    at = lastSibling < 0 ? rest.length : lastSibling + 1;
  }
  const folders = [...rest.slice(0, at), moved, ...rest.slice(at)];
  return sameFolders(folders, layout.folders) ? layout : { ...layout, folders };
}
const withoutParent = ({ parentId: _parent, ...folder }: OutlineFolder): OutlineFolder => folder;
const sameFolders = (a: readonly OutlineFolder[], b: readonly OutlineFolder[]) =>
  a.length === b.length &&
  a.every(
    (folder, i) =>
      folder.id === b[i]!.id &&
      (folder.parentId ?? null) === (b[i]!.parentId ?? null) &&
      folder.title === b[i]!.title,
  );

/** Move a folder one place among its siblings (⌥⇧↑ / ⌥⇧↓). */
export function shiftFolder(
  layout: OutlineWorkspaceLayout,
  id: string,
  delta: -1 | 1,
): OutlineWorkspaceLayout {
  const folder = layout.folders.find((candidate) => candidate.id === id);
  if (!folder) return layout;
  const siblings = layout.folders.filter(
    (candidate) => (candidate.parentId ?? null) === (folder.parentId ?? null),
  );
  const at = siblings.indexOf(folder);
  const target = siblings[at + delta];
  if (!target) return layout;
  return moveFolder(
    layout,
    id,
    folder.parentId ?? null,
    delta < 0 ? target.id : (siblings[at + 2]?.id ?? null),
  );
}

/** What a folder delete changed, so Undo puts back exactly that. */
export interface RemovedFolder {
  readonly folder: OutlineFolder;
  readonly index: number;
  /** Subfolders that moved up a level (to the deleted folder's parent). */
  readonly folders: readonly string[];
  /** Documents that moved up a level. */
  readonly documents: readonly string[];
}

/**
 * Delete a folder WITHOUT deleting what is in it: its documents and subfolders move up to its
 * parent (nothing is ever lost by tidying folders). Undo with `restoreFolder`.
 */
export function removeFolder(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  id: string,
): {
  readonly documents: readonly OutlineDocument[];
  readonly layout: OutlineWorkspaceLayout;
  readonly removed: RemovedFolder | null;
} {
  const index = layout.folders.findIndex((folder) => folder.id === id);
  if (index < 0) return { documents, layout, removed: null };
  const folder = layout.folders[index]!;
  const parent = folder.parentId ?? null;
  const movedFolders: string[] = [];
  const folders = layout.folders.flatMap((candidate, i) => {
    if (i === index) return [];
    if (candidate.parentId !== id) return [candidate];
    movedFolders.push(candidate.id);
    return [parent ? { ...candidate, parentId: parent } : withoutParent(candidate)];
  });
  const movedDocs: string[] = [];
  const nextDocs = documents.map((doc) => {
    if (doc.folderId !== id) return doc;
    movedDocs.push(doc.id);
    return withFolder(doc, parent);
  });
  return {
    documents: movedDocs.length ? nextDocs : documents,
    layout: { ...layout, folders },
    removed: { folder, index, folders: movedFolders, documents: movedDocs },
  };
}

export function restoreFolder(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  removed: RemovedFolder,
): { readonly documents: readonly OutlineDocument[]; readonly layout: OutlineWorkspaceLayout } {
  if (layout.folders.some((folder) => folder.id === removed.folder.id))
    return { documents, layout };
  const children = new Set(removed.folders);
  const rest = layout.folders.map((folder) =>
    children.has(folder.id) ? { ...folder, parentId: removed.folder.id } : folder,
  );
  const at = Math.max(0, Math.min(rest.length, removed.index));
  const docs = new Set(removed.documents);
  return {
    documents: documents.map((doc) =>
      docs.has(doc.id) ? withFolder(doc, removed.folder.id) : doc,
    ),
    layout: { ...layout, folders: [...rest.slice(0, at), removed.folder, ...rest.slice(at)] },
  };
}

const withFolder = (doc: OutlineDocument, folderId: string | null): OutlineDocument => {
  if ((doc.folderId ?? null) === folderId) return doc;
  if (folderId) return { ...doc, folderId };
  const { folderId: _folder, ...rest } = doc;
  return rest;
};

/**
 * Put a document into `folderId` (null: top level), just before `beforeId` (another document)
 * or after the last document already there. One pure step: the folder and the order together.
 */
export function placeDocument(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  id: string,
  folderId: string | null,
  beforeId: string | null = null,
): readonly OutlineDocument[] {
  const doc = documents.find((candidate) => candidate.id === id);
  if (!doc || beforeId === id) return documents;
  const target =
    folderId && layout.folders.some((folder) => folder.id === folderId) ? folderId : null;
  const rest = documents.filter((candidate) => candidate.id !== id);
  let at = beforeId ? rest.findIndex((candidate) => candidate.id === beforeId) : -1;
  if (at < 0) {
    const last = rest.findLastIndex((candidate) => folderOf(layout, candidate) === target);
    at = last < 0 ? rest.length : last + 1;
  }
  const next = [...rest.slice(0, at), withFolder(doc, target), ...rest.slice(at)];
  // Same folder, same order among its documents: nothing a reader can see changed.
  const order = (list: readonly OutlineDocument[]) =>
    list
      .filter((candidate) => folderOf(layout, candidate) === target)
      .map((candidate) => candidate.id)
      .join("\u0000");
  if (folderOf(layout, doc) === target && order(next) === order(documents)) return documents;
  return next.every((candidate, i) => candidate === documents[i]) ? documents : next;
}

/** Move a document one place among the documents of its own folder. */
export function shiftDocument(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  id: string,
  delta: -1 | 1,
): readonly OutlineDocument[] {
  const doc = documents.find((candidate) => candidate.id === id);
  if (!doc) return documents;
  const folder = folderOf(layout, doc);
  const siblings = documents.filter((candidate) => folderOf(layout, candidate) === folder);
  const at = siblings.indexOf(doc);
  if (!siblings[at + delta]) return documents;
  return placeDocument(
    documents,
    layout,
    id,
    folder,
    delta < 0 ? siblings[at - 1]!.id : (siblings[at + 2]?.id ?? null),
  );
}

/** "Projects › Q3" for a folder (plain titles, outermost first). */
export function folderPath(
  layout: OutlineWorkspaceLayout,
  folderId: string | null,
  untitled = "Untitled folder",
): readonly string[] {
  const byId = new Map(layout.folders.map((folder) => [folder.id, folder]));
  const out: string[] = [];
  for (
    let at = folderId, guard = 0;
    at && byId.has(at) && guard <= layout.folders.length;
    guard++
  ) {
    const folder = byId.get(at)!;
    out.unshift(folder.title || untitled);
    at = folder.parentId ?? null;
  }
  return out;
}

/* ───────────── The sidebar tree ───────────── */

export type LibraryRow =
  | {
      readonly kind: "folder";
      readonly id: string;
      readonly folder: OutlineFolder;
      readonly depth: number;
      readonly parentId: string | null;
      readonly expanded: boolean;
      readonly count: number;
      readonly empty: boolean;
    }
  | {
      readonly kind: "document";
      readonly id: string;
      readonly document: OutlineDocument;
      readonly depth: number;
      readonly parentId: string | null;
    };

/**
 * The visible rows of the library: at each level its folders (in order), then its documents
 * (in documents order). `count` is every document inside a folder, nested ones included.
 */
export function libraryRows(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  expanded: ReadonlySet<string>,
): readonly LibraryRow[] {
  const known = new Set(layout.folders.map((folder) => folder.id));
  const foldersIn = new Map<string | null, OutlineFolder[]>();
  for (const folder of layout.folders) {
    const parent =
      folder.parentId && known.has(folder.parentId) && folder.parentId !== folder.id
        ? folder.parentId
        : null;
    const list = foldersIn.get(parent) ?? [];
    list.push(folder);
    foldersIn.set(parent, list);
  }
  const docsIn = new Map<string | null, OutlineDocument[]>();
  for (const doc of documents) {
    const folder = folderOf(layout, doc);
    const list = docsIn.get(folder) ?? [];
    list.push(doc);
    docsIn.set(folder, list);
  }
  const total = new Map<string, number>();
  const seen = new Set<string>();
  const countOf = (id: string): number => {
    if (total.has(id)) return total.get(id)!;
    if (seen.has(id)) return 0; // a cycle in host data never loops
    seen.add(id);
    const sum =
      (docsIn.get(id)?.length ?? 0) +
      (foldersIn.get(id) ?? []).reduce((acc, child) => acc + countOf(child.id), 0);
    total.set(id, sum);
    return sum;
  };
  const rows: LibraryRow[] = [];
  const visited = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const folder of foldersIn.get(parent) ?? []) {
      if (visited.has(folder.id)) continue;
      visited.add(folder.id);
      const open = expanded.has(folder.id);
      const empty = !(foldersIn.get(folder.id)?.length || docsIn.get(folder.id)?.length);
      rows.push({
        kind: "folder",
        id: folder.id,
        folder,
        depth,
        parentId: parent,
        expanded: open,
        count: countOf(folder.id),
        empty,
      });
      if (open) walk(folder.id, depth + 1);
    }
    for (const document of docsIn.get(parent) ?? [])
      rows.push({ kind: "document", id: document.id, document, depth, parentId: parent });
  };
  walk(null, 0);
  return rows;
}

/* ───────────── Starred documents and the inbox ───────────── */

export function toggleStar(
  layout: OutlineWorkspaceLayout,
  documentId: string,
): { readonly layout: OutlineWorkspaceLayout; readonly starred: boolean } {
  const starred = !layout.starred.includes(documentId);
  return {
    layout: {
      ...layout,
      starred: starred
        ? [...layout.starred, documentId]
        : layout.starred.filter((id) => id !== documentId),
    },
    starred,
  };
}

/** Starred documents that still exist, in star order. */
export function starredDocuments(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
): readonly OutlineDocument[] {
  const byId = new Map(documents.map((doc) => [doc.id, doc]));
  return layout.starred.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
}

/** The designated inbox, when it still exists. */
export function inboxOf(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
): OutlineDocument | null {
  return (layout.inboxId && documents.find((doc) => doc.id === layout.inboxId)) || null;
}

/** A captured item: a fresh id, the text as typed, stamped created/edited now. */
export function captureItem(
  text: string,
  now = Date.now(),
  id: string = createOutlineId(),
): OutlineItem {
  return {
    id,
    text: text.replace(/\s*\n\s*/g, " ").trim(),
    data: { createdAt: now, editedAt: now },
  };
}

/**
 * Append items to a document's top level (a document's lone empty starter item is replaced, so
 * the first capture into a new inbox is not item two). An id the document already uses is
 * replaced by a fresh one (links and mirrors inside the items follow), so a document never holds
 * two items with one id. Pure: for documents that are not open.
 */
export function appendToDocument(
  documents: readonly OutlineDocument[],
  documentId: string,
  items: readonly OutlineItem[],
  createId: () => string = createOutlineId,
): readonly OutlineDocument[] {
  const at = documents.findIndex((doc) => doc.id === documentId);
  if (at < 0 || !items.length) return documents;
  const doc = documents[at]!;
  const placed = placeAtEnd(doc.nodes, items, createId);
  return documents.map((candidate, i) =>
    i === at ? { ...candidate, nodes: placed.nodes } : candidate,
  );
}

/** Remove items (whole subtrees) from a document by id. Pure: for documents that are not open. */
export function removeFromDocument(
  documents: readonly OutlineDocument[],
  documentId: string,
  ids: ReadonlySet<string>,
): readonly OutlineDocument[] {
  const at = documents.findIndex((doc) => doc.id === documentId);
  if (at < 0) return documents;
  const nodes = pruneItems(documents[at]!.nodes, ids);
  return nodes === documents[at]!.nodes
    ? documents
    : documents.map((doc, i) => (i === at ? { ...doc, nodes } : doc));
}

/* ───────────── Items between documents (one workspace edit) ───────────── */

/**
 * Moving items to another document, or filing a capture into the inbox, changes several
 * documents at once. It is planned here as ONE edit: a `DocumentChange` per document it touches.
 *
 *   move "Red-team review" (launch/e-11) to Partner program
 *     launch    before → after   item removed; its own [[…|e-11]] links now read partners/e-11
 *     partners  before → after   item appended (fresh id if e-11 is taken there); links rebased
 *     notes     before → after   [[…|launch/e-11]] → [[…|partners/e-11]]
 *
 * The workspace applies the changes together and undoes or redoes them together. `before` and
 * `after` are exact snapshots; `forward` and `backward` re-apply the same edit on top of later
 * edits in that document, for when its exact snapshot no longer applies.
 */
export interface DocumentChange {
  readonly documentId: string;
  readonly before: readonly OutlineItem[];
  readonly after: readonly OutlineItem[];
  /** Ids that arrive intact from another document: a move, not an edit (never re-stamped). */
  readonly carried?: ReadonlySet<string>;
  readonly forward: (nodes: readonly OutlineItem[]) => readonly OutlineItem[];
  readonly backward: (nodes: readonly OutlineItem[]) => readonly OutlineItem[];
}

export interface ItemTransfer {
  readonly changes: readonly DocumentChange[];
  /** The top-level items as they now are in the target, in order (ids may be fresh). */
  readonly roots: readonly string[];
  /** Every moved item's id in the source → its id in the target. */
  readonly ids: ReadonlyMap<string, string>;
  /** Re-plan a move using the subtrees that exist now, preserving edits made since the move. */
  readonly travel?: (
    documents: readonly OutlineDocument[],
    direction: "undo" | "redo",
  ) => readonly DocumentChange[] | null;
  /** Remove obsolete copies from ordinary history snapshots after a cross-document move. */
  readonly project?: (
    documentId: string,
    nodes: readonly OutlineItem[],
    current: readonly OutlineItem[],
    moved: boolean,
  ) => readonly OutlineItem[];
}

/** Every id in a tree. */
export function idsIn(nodes: readonly OutlineItem[]): Set<string> {
  const out = new Set<string>();
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    out.add(node.id);
    if (node.children) stack.push(...node.children);
  }
  return out;
}

/** The tree without the items in `ids` (and their subtrees). Untouched branches keep identity. */
export function pruneItems(
  nodes: readonly OutlineItem[],
  ids: ReadonlySet<string>,
): readonly OutlineItem[] {
  let changed = false;
  const out: OutlineItem[] = [];
  for (const node of nodes) {
    if (ids.has(node.id)) {
      changed = true;
      continue;
    }
    const children = node.children ? pruneItems(node.children, ids) : undefined;
    if (children !== node.children) {
      changed = true;
      out.push({ ...node, children: children! });
    } else out.push(node);
  }
  return changed ? out : nodes;
}

const REF = /\[\[([^\]\n]+)\]\]/g;
/**
 * Rewrite `[[label|target]]` link targets in titles and notes. `rewrite` returns the new target,
 * or null to leave the link alone. Items without a changed link keep their identity.
 */
export function rewriteLinks(
  nodes: readonly OutlineItem[],
  rewrite: (target: string) => string | null,
): readonly OutlineItem[] {
  const text = (source: string) =>
    source.includes("[[")
      ? source.replace(REF, (whole, inner: string) => {
          const bar = inner.lastIndexOf("|");
          if (bar <= 0) return whole;
          const next = rewrite(inner.slice(bar + 1));
          return next === null ? whole : `[[${inner.slice(0, bar)}|${next}]]`;
        })
      : source;
  let changed = false;
  const out = nodes.map((node) => {
    const title = text(node.text);
    const note = node.data?.note;
    const nextNote = note ? text(note) : note;
    const children = node.children ? rewriteLinks(node.children, rewrite) : undefined;
    if (title === node.text && nextNote === note && children === node.children) return node;
    changed = true;
    return {
      ...node,
      text: title,
      ...(nextNote !== note ? { data: { ...node.data, note: nextNote } } : {}),
      ...(children ? { children } : {}),
    };
  });
  return changed ? out : nodes;
}

/** A link target as written in `documentId`: its own items by bare id, others as `doc/item`. */
const relativeTo = (documentId: string, qualified: string) => {
  const parts = parseQualifiedId(qualified);
  return parts && parts.documentId === documentId ? parts.itemId : qualified;
};
const qualifyIn = (documentId: string, target: string) =>
  parseQualifiedId(target) ? target : qualifiedId(documentId, target);
/** Links in `documentId` whose (qualified) target `moves` maps somewhere else are re-pointed. */
const relinkIn = (documentId: string, moves: ReadonlyMap<string, string>) => (target: string) => {
  const moved = moves.get(qualifyIn(documentId, target));
  if (moved === undefined) return null;
  const written = relativeTo(documentId, moved);
  return written === target ? null : written;
};

const isBlankStarter = (nodes: readonly OutlineItem[]) =>
  nodes.length === 1 && !nodes[0]!.text && !nodes[0]!.children?.length && !nodes[0]!.data?.note;

/**
 * Items placed after a document's last top-level item. Ids it does not use yet are kept (a move
 * keeps its links); a taken one, or a mirror copy's derived id, gets a fresh id.
 */
function placeAtEnd(
  nodes: readonly OutlineItem[],
  items: readonly OutlineItem[],
  createId: () => string,
) {
  const blank = isBlankStarter(nodes);
  const taken = idsIn(blank ? [] : nodes);
  const ids = new Map<string, string>();
  const placed = reidentify(
    items,
    (id) => {
      const at = id.lastIndexOf("~");
      const candidate = at < 0 ? id : id.slice(at + 1);
      if (!candidate || taken.has(candidate)) return null;
      taken.add(candidate);
      return candidate;
    },
    () => {
      let id = createId();
      while (taken.has(id)) id = createId();
      taken.add(id);
      return id;
    },
  );
  const record = (before: readonly OutlineItem[], after: readonly OutlineItem[]) =>
    before.forEach((node, i) => {
      ids.set(node.id, after[i]!.id);
      if (node.children) record(node.children, after[i]!.children ?? []);
    });
  record(items, placed);
  return { nodes: blank ? placed : [...nodes, ...placed], items: placed, ids, blank };
}

/** Put whole subtrees back where they were (their parent and index), skipping ones present. */
function reinsert(
  nodes: readonly OutlineItem[],
  places: readonly {
    readonly node: OutlineItem;
    readonly parentId: string | null;
    readonly index: number;
  }[],
) {
  let out = nodes;
  for (const place of places) {
    const present = idsIn(out);
    if (present.has(place.node.id)) continue;
    // A descendant id taken since (never in practice) gets a fresh one rather than a duplicate.
    const [node] = reidentify([place.node], (id) => (present.has(id) ? null : id));
    const insert = (siblings: readonly OutlineItem[]) => {
      const list = [...siblings];
      list.splice(Math.min(place.index, list.length), 0, node!);
      return list;
    };
    const into = (items: readonly OutlineItem[]): readonly OutlineItem[] | null => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]!;
        if (item.id === place.parentId)
          return items.map((candidate, j) =>
            j === i ? { ...candidate, children: insert(candidate.children ?? []) } : candidate,
          );
        const children = item.children ? into(item.children) : null;
        if (children)
          return items.map((candidate, j) => (j === i ? { ...candidate, children } : candidate));
      }
      return null;
    };
    out = (place.parentId && into(out)) || insert(out);
  }
  return out;
}

/**
 * Move items (with their subtrees) from one document to the end of another, as one edit across
 * the workspace: fresh ids where the target already uses one, and every link to a moved item,
 * in every document, re-pointed to where it now lives. Null when there is nothing to move.
 */
export function planItemMove(
  documents: readonly OutlineDocument[],
  sourceId: string,
  ids: readonly string[],
  targetId: string,
  createId: () => string = createOutlineId,
): ItemTransfer | null {
  const source = documents.find((doc) => doc.id === sourceId);
  const target = documents.find((doc) => doc.id === targetId);
  if (!source || !target || sourceId === targetId) return null;
  const wanted = new Set(ids);
  // The outermost wanted items, in document order, with where they sat.
  const places: { node: OutlineItem; parentId: string | null; index: number }[] = [];
  const walk = (items: readonly OutlineItem[], parentId: string | null) =>
    items.forEach((node, index) => {
      if (wanted.has(node.id)) places.push({ node, parentId, index });
      else if (node.children) walk(node.children, node.id);
    });
  walk(source.nodes, null);
  if (!places.length) return null;
  const removed = idsIn(places.map((place) => place.node));
  const placed = placeAtEnd(
    target.nodes,
    places.map((place) => place.node),
    createId,
  );
  const landed = new Set(placed.ids.values());
  const moves = new Map<string, string>();
  const back = new Map<string, string>();
  for (const [from, to] of placed.ids) {
    moves.set(qualifiedId(sourceId, from), qualifiedId(targetId, to));
    back.set(qualifiedId(targetId, to), qualifiedId(sourceId, from));
  }
  // The moved items' own links were written in the source: rebase them onto the target.
  const items = rewriteLinks(placed.items, (link) => {
    if (!parseQualifiedId(link)) return landed.has(link) ? null : qualifiedId(sourceId, link);
    const written = relativeTo(targetId, moves.get(link) ?? link);
    return written === link ? null : written;
  });
  const roots = items.map((item) => item.id);
  const changes: DocumentChange[] = [];
  const sourceAfter = rewriteLinks(pruneItems(source.nodes, removed), relinkIn(sourceId, moves));
  changes.push({
    documentId: sourceId,
    before: source.nodes,
    after: sourceAfter,
    forward: (nodes) => rewriteLinks(pruneItems(nodes, removed), relinkIn(sourceId, moves)),
    backward: (nodes) => rewriteLinks(reinsert(nodes, places), relinkIn(sourceId, back)),
  });
  const targetAfter = [
    ...rewriteLinks(placed.blank ? [] : target.nodes, relinkIn(targetId, moves)),
    ...items,
  ];
  changes.push({
    documentId: targetId,
    before: target.nodes,
    after: targetAfter,
    carried: landed,
    forward: (nodes) => {
      const present = idsIn(nodes);
      return [
        ...rewriteLinks(nodes, relinkIn(targetId, moves)),
        ...items.filter((item) => !present.has(item.id)),
      ];
    },
    backward: (nodes) => rewriteLinks(pruneItems(nodes, landed), relinkIn(targetId, back)),
  });
  for (const doc of documents) {
    if (doc.id === sourceId || doc.id === targetId) continue;
    const after = rewriteLinks(doc.nodes, relinkIn(doc.id, moves));
    if (after === doc.nodes) continue;
    changes.push({
      documentId: doc.id,
      before: doc.nodes,
      after,
      forward: (nodes) => rewriteLinks(nodes, relinkIn(doc.id, moves)),
      backward: (nodes) => rewriteLinks(nodes, relinkIn(doc.id, back)),
    });
  }
  const sourceRoots = places.map((place) => place.node.id);
  const sourceIds = new Set(placed.ids.keys());
  const project = (
    documentId: string,
    nodes: readonly OutlineItem[],
    current: readonly OutlineItem[],
    moved: boolean,
  ) => {
    const absentIds = moved ? sourceIds : landed;
    const absentDocument = moved ? sourceId : targetId;
    const ownerDocument = moved ? targetId : sourceId;
    const ownerRoots = moved ? roots : sourceRoots;
    let next = documentId === absentDocument ? pruneItems(nodes, absentIds) : nodes;
    if (documentId === ownerDocument) {
      const missing = ownerRoots.flatMap((id) =>
        !findOutlineNode(next, id)
          ? [findOutlineNode(current, id)?.node].filter((node): node is OutlineItem => !!node)
          : [],
      );
      if (missing.length) next = [...next, ...missing];
    }
    return rewriteLinks(next, relinkIn(documentId, moved ? moves : back));
  };
  const travel = (
    current: readonly OutlineDocument[],
    direction: "undo" | "redo",
  ): readonly DocumentChange[] | null => {
    const fromId = direction === "undo" ? targetId : sourceId;
    const toId = direction === "undo" ? sourceId : targetId;
    const from = current.find((doc) => doc.id === fromId);
    const to = current.find((doc) => doc.id === toId);
    if (!from || !to) return null;
    const rootIds = direction === "undo" ? roots : sourceRoots;
    const moving = rootIds.map((id) => findOutlineNode(from.nodes, id)?.node);
    if (moving.some((node) => !node)) return null;
    const rename =
      direction === "undo" ? new Map([...placed.ids].map(([a, b]) => [b, a])) : placed.ids;
    const currentIds = idsIn(moving as OutlineItem[]);
    const arrivedIds = new Set([...currentIds].map((id) => rename.get(id) ?? id));
    const taken = idsIn(to.nodes);
    if ([...arrivedIds].some((id) => taken.has(id))) return null;
    if (
      direction === "undo" &&
      places.some((place) => place.parentId && !findOutlineNode(to.nodes, place.parentId))
    )
      return null;
    const locations = new Map(
      [...currentIds].map((id) => [
        qualifiedId(fromId, id),
        qualifiedId(toId, rename.get(id) ?? id),
      ]),
    );
    const renamed = reidentify(moving as OutlineItem[], (id) => rename.get(id) ?? id);
    const carried = rewriteLinks(renamed, (link) => {
      if (!parseQualifiedId(link)) return arrivedIds.has(link) ? null : qualifiedId(fromId, link);
      const written = relativeTo(toId, locations.get(link) ?? link);
      return written === link ? null : written;
    });
    const result: DocumentChange[] = [];
    for (const doc of current) {
      let after = doc.nodes;
      if (doc.id === fromId) after = pruneItems(after, currentIds);
      if (doc.id === toId)
        after =
          direction === "undo"
            ? reinsert(
                after,
                places.map((place, index) => ({ ...place, node: carried[index]! })),
              )
            : [...(isBlankStarter(after) ? [] : after), ...carried];
      after = rewriteLinks(after, relinkIn(doc.id, locations));
      if (validateOutline(after).length) return null;
      if (after !== doc.nodes)
        result.push({
          documentId: doc.id,
          before: doc.nodes,
          after,
          ...(doc.id === toId ? { carried: arrivedIds } : {}),
          forward: () => after,
          backward: () => doc.nodes,
        });
    }
    return result;
  };
  return { changes, roots, ids: placed.ids, travel, project };
}

/** File items at the end of a document (quick capture into the inbox), as one edit. */
export function planAppend(
  documents: readonly OutlineDocument[],
  documentId: string,
  items: readonly OutlineItem[],
  createId: () => string = createOutlineId,
): ItemTransfer | null {
  const doc = documents.find((candidate) => candidate.id === documentId);
  if (!doc || !items.length) return null;
  const placed = placeAtEnd(doc.nodes, items, createId);
  const landed = new Set(placed.ids.values());
  return {
    changes: [
      {
        documentId,
        before: doc.nodes,
        after: placed.nodes,
        forward: (nodes) => {
          const present = idsIn(nodes);
          return [...nodes, ...placed.items.filter((item) => !present.has(item.id))];
        },
        backward: (nodes) => pruneItems(nodes, landed),
      },
    ],
    roots: placed.items.map((item) => item.id),
    ids: placed.ids,
  };
}

/**
 * A document whose ids repeat (data written by an older version, or by hand) cannot be opened.
 * Every repeat after the first gets a fresh id. Null when nothing repeats.
 */
export function repairDuplicateIds(
  nodes: readonly OutlineItem[],
  createId: () => string = createOutlineId,
): readonly OutlineItem[] | null {
  const seen = new Set<string>();
  let repaired = false;
  const fix = (items: readonly OutlineItem[]): readonly OutlineItem[] =>
    items.map((node) => {
      let id = node.id;
      if (!id || seen.has(id)) {
        repaired = true;
        do id = createId();
        while (seen.has(id));
      }
      seen.add(id);
      const children = node.children ? fix(node.children) : undefined;
      return id === node.id && children === node.children
        ? node
        : { ...node, id, ...(children ? { children } : {}) };
    });
  const out = fix(nodes);
  return repaired ? out : null;
}

/* ───────────── The document finder (⌘O) ───────────── */

export interface FinderEntry {
  readonly kind: "document" | "folder";
  readonly id: string;
  readonly title: string;
  /** The folders it is in, outermost first. */
  readonly path: readonly string[];
  /** Match positions in `title`, for highlighting. */
  readonly marks: readonly number[];
  readonly score: number;
}

/**
 * Fuzzy subsequence match of `query` in `text` (case-insensitive): every query character in
 * order. Word starts and runs score higher, gaps lower; null when it does not match at all.
 */
export function fuzzyMatch(
  query: string,
  text: string,
): { readonly score: number; readonly marks: readonly number[] } | null {
  const q = query.toLowerCase().replace(/\s+/g, "");
  if (!q) return { score: 0, marks: [] };
  const t = text.toLowerCase();
  // Greedy from each possible start of the first character; keep the best.
  let best: { score: number; marks: number[] } | null = null;
  for (let start = t.indexOf(q[0]!); start >= 0; start = t.indexOf(q[0]!, start + 1)) {
    const marks = [start];
    let at = start;
    for (let i = 1; i < q.length; i++) {
      const next = t.indexOf(q[i]!, at + 1);
      if (next < 0) {
        at = -1;
        break;
      }
      marks.push(next);
      at = next;
    }
    if (at < 0) break; // a later start cannot match more characters
    let score = 0;
    for (let i = 0; i < marks.length; i++) {
      const pos = marks[i]!;
      const wordStart = pos === 0 || /[\s\-_/.›]/.test(t[pos - 1]!);
      score += wordStart ? 10 : 1;
      if (i > 0 && pos === marks[i - 1]! + 1) score += 6;
      else if (i > 0) score -= Math.min(4, pos - marks[i - 1]! - 1);
    }
    if (marks[0] === 0) score += 8;
    score -= text.length * 0.02; // shorter titles win ties
    if (!best || score > best.score) best = { score, marks };
  }
  return best;
}

/** The most recent edit in a document (epoch ms; 0 when nothing is stamped). Cached by identity. */
const editedCache = new WeakMap<readonly OutlineItem[], number>();
export function lastEdited(document: OutlineDocument): number {
  let at = editedCache.get(document.nodes);
  if (at !== undefined) return at;
  at = 0;
  const stack = [...document.nodes];
  while (stack.length) {
    const node = stack.pop()!;
    const edited = node.data?.editedAt;
    if (typeof edited === "number" && edited > at) at = edited;
    if (node.children) stack.push(...node.children);
  }
  editedCache.set(document.nodes, at);
  return at;
}

/**
 * Finder results. Without a query: documents most recently OPENED first (`recent`, newest
 * first), then by last edit, then folders. With one: fuzzy title matches (a folder path match
 * counts a little), recency breaking near-ties.
 */
export function findInLibrary(
  documents: readonly OutlineDocument[],
  layout: OutlineWorkspaceLayout,
  query: string,
  recent: readonly string[] = [],
  untitled = { document: "Untitled document", folder: "Untitled folder" },
): readonly FinderEntry[] {
  const rank = new Map(recent.map((id, i) => [id, i]));
  const recency = (doc: OutlineDocument) => {
    const at = rank.get(doc.id);
    return at === undefined ? 0 : 6 - Math.min(5, at);
  };
  const entries: (FinderEntry & { readonly order: number; readonly edited: number })[] = [];
  const q = query.trim();
  documents.forEach((doc, order) => {
    const title = inlineToPlain(doc.title) || untitled.document;
    const path = folderPath(layout, folderOf(layout, doc), untitled.folder);
    if (!q) {
      entries.push({
        kind: "document",
        id: doc.id,
        title,
        path,
        marks: [],
        score: recency(doc),
        order,
        edited: lastEdited(doc),
      });
      return;
    }
    const own = fuzzyMatch(q, title);
    const viaPath = own ? null : fuzzyMatch(q, [...path, title].join(" › "));
    if (!own && !viaPath) return;
    entries.push({
      kind: "document",
      id: doc.id,
      title,
      path,
      marks: own?.marks ?? [],
      score: (own ? own.score : viaPath!.score - 6) + recency(doc),
      order,
      edited: lastEdited(doc),
    });
  });
  layout.folders.forEach((folder, order) => {
    const title = folder.title || untitled.folder;
    const path = folderPath(layout, folder.parentId ?? null, untitled.folder);
    if (!q) {
      entries.push({
        kind: "folder",
        id: folder.id,
        title,
        path,
        marks: [],
        score: -100,
        order: documents.length + order,
        edited: 0,
      });
      return;
    }
    const match = fuzzyMatch(q, title);
    if (match)
      entries.push({
        kind: "folder",
        id: folder.id,
        title,
        path,
        marks: match.marks,
        score: match.score - 2,
        order: documents.length + order,
        edited: 0,
      });
  });
  entries.sort((a, b) => b.score - a.score || b.edited - a.edited || a.order - b.order);
  return entries.map(({ order: _order, edited: _edited, ...entry }) => entry);
}
