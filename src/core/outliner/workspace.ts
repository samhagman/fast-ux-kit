import {
  createOutlineId,
  findOutlineNode,
  getOutlinePath,
  type OutlineSearchResult,
} from "../index.js";
import { inlineToPlain } from "./inline.js";
import { outgoingLinks, searchOutliner } from "./search-filters.js";
import type {
  OutlineDocument,
  OutlineExternalLinks,
  OutlineExternalRef,
  OutlineItem,
} from "./types.js";

/**
 * Multiple documents (the OutlinerWorkspace model), framework-free and pure.
 *
 * A workspace is an ordered list of `OutlineDocument`s. Each document is an ordinary outline;
 * the workspace adds only three things on top:
 *   1. list operations (create, rename, delete with restore, reorder) as pure functions;
 *   2. cross-document links: `[[label|documentId/itemId]]` (an item id never contains "/"),
 *      resolved and back-linked across documents through one cached index;
 *   3. search across every document.
 * Storage is the host's: this module never persists anything.
 */
export const DOCUMENT_SEPARATOR = "/";

export const qualifiedId = (documentId: string, itemId: string) =>
  `${documentId}${DOCUMENT_SEPARATOR}${itemId}`;

/** `doc/item` → its parts; null for a plain (same-document) id. */
export function parseQualifiedId(
  id: string,
): { readonly documentId: string; readonly itemId: string } | null {
  const at = id.indexOf(DOCUMENT_SEPARATOR);
  if (at <= 0 || at === id.length - 1) return null;
  return { documentId: id.slice(0, at), itemId: id.slice(at + 1) };
}

/* ───────────── List operations ───────────── */

export function createDocument(title = "", id: string = createOutlineId()): OutlineDocument {
  return { id, title, nodes: [{ id: createOutlineId(), text: "" }] };
}

export function renameDocument(
  documents: readonly OutlineDocument[],
  id: string,
  title: string,
): readonly OutlineDocument[] {
  const at = documents.findIndex((doc) => doc.id === id);
  if (at < 0 || documents[at]!.title === title) return documents;
  return documents.map((doc, i) => (i === at ? { ...doc, title } : doc));
}

export function replaceDocumentNodes(
  documents: readonly OutlineDocument[],
  id: string,
  nodes: readonly OutlineItem[],
): readonly OutlineDocument[] {
  const at = documents.findIndex((doc) => doc.id === id);
  if (at < 0 || documents[at]!.nodes === nodes) return documents;
  return documents.map((doc, i) => (i === at ? { ...doc, nodes } : doc));
}

/** What a delete took away, so Undo can put it back exactly where it was. */
export interface RemovedDocument {
  readonly document: OutlineDocument;
  readonly index: number;
}

export function removeDocument(
  documents: readonly OutlineDocument[],
  id: string,
): { readonly documents: readonly OutlineDocument[]; readonly removed: RemovedDocument | null } {
  const index = documents.findIndex((doc) => doc.id === id);
  if (index < 0) return { documents, removed: null };
  return {
    documents: documents.filter((_, i) => i !== index),
    removed: { document: documents[index]!, index },
  };
}

export function restoreDocument(
  documents: readonly OutlineDocument[],
  removed: RemovedDocument,
): readonly OutlineDocument[] {
  if (documents.some((doc) => doc.id === removed.document.id)) return documents;
  const index = Math.max(0, Math.min(documents.length, removed.index));
  return [...documents.slice(0, index), removed.document, ...documents.slice(index)];
}

export function moveDocument(
  documents: readonly OutlineDocument[],
  id: string,
  toIndex: number,
): readonly OutlineDocument[] {
  const from = documents.findIndex((doc) => doc.id === id);
  const to = Math.max(0, Math.min(documents.length - 1, toIndex));
  if (from < 0 || from === to) return documents;
  const next = documents.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** Which document should be shown after `removedId` goes: the next one, else the previous. */
export function neighbourAfterRemoval(
  documents: readonly OutlineDocument[],
  removedId: string,
): string | null {
  const at = documents.findIndex((doc) => doc.id === removedId);
  if (at < 0) return documents[0]?.id ?? null;
  return documents[at + 1]?.id ?? documents[at - 1]?.id ?? null;
}

export function countItems(nodes: readonly OutlineItem[]): number {
  let count = 0;
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.text || node.children?.length) count++;
    if (node.children) stack.push(...node.children);
  }
  return count;
}

/* ───────────── Cross-document links ───────────── */

/** Every item of one document by id, cached by the document's node array identity. */
const byIdCache = new WeakMap<readonly OutlineItem[], ReadonlyMap<string, OutlineItem>>();
function itemsById(nodes: readonly OutlineItem[]): ReadonlyMap<string, OutlineItem> {
  let map = byIdCache.get(nodes);
  if (!map) {
    const out = new Map<string, OutlineItem>();
    const stack = [...nodes];
    while (stack.length) {
      const node = stack.pop()!;
      out.set(node.id, node);
      if (node.children) stack.push(...node.children);
    }
    byIdCache.set(nodes, (map = out));
  }
  return map;
}

/** Qualified links leaving one document: target link id → the item ids (in it) that link there. */
const outgoingCache = new WeakMap<readonly OutlineItem[], ReadonlyMap<string, readonly string[]>>();
function qualifiedLinksOf(nodes: readonly OutlineItem[]): ReadonlyMap<string, readonly string[]> {
  let map = outgoingCache.get(nodes);
  if (!map) {
    const out = new Map<string, string[]>();
    const walk = (items: readonly OutlineItem[]) => {
      for (const node of items) {
        // A mirror's copies are counted once, at their source.
        if (node.data?.mirrorOf) continue;
        for (const target of outgoingLinks(node)) {
          if (!parseQualifiedId(target)) continue;
          const list = out.get(target);
          if (list) list.push(node.id);
          else out.set(target, [node.id]);
        }
        if (node.children) walk(node.children);
      }
    };
    walk(nodes);
    outgoingCache.set(nodes, (map = out));
  }
  return map;
}

export interface ResolvedLink {
  readonly document: OutlineDocument;
  readonly node: OutlineItem;
}

export function resolveLink(
  documents: readonly OutlineDocument[],
  id: string,
): ResolvedLink | null {
  const parts = parseQualifiedId(id);
  if (!parts) return null;
  const document = documents.find((doc) => doc.id === parts.documentId);
  const node = document ? itemsById(document.nodes).get(parts.itemId) : undefined;
  return document && node ? { document, node } : null;
}

/** "Document › Parent › …" for an item, plain text. */
export function contextOf(document: OutlineDocument, itemId: string): string {
  const path = getOutlinePath(document.nodes, itemId)
    .slice(0, -1)
    .map((node) => inlineToPlain(node.text));
  return [document.title || "Untitled document", ...path].join(" › ");
}

/**
 * Backlinks INTO `documentId` from every other document: local item id → the linking items, as
 * refs (their own qualified ids, so a click can open them).
 */
export function crossBacklinks(
  documents: readonly OutlineDocument[],
  documentId: string,
): ReadonlyMap<string, readonly OutlineExternalRef[]> {
  const out = new Map<string, OutlineExternalRef[]>();
  const prefix = documentId + DOCUMENT_SEPARATOR;
  for (const document of documents) {
    if (document.id === documentId) continue;
    for (const [target, sources] of qualifiedLinksOf(document.nodes)) {
      if (!target.startsWith(prefix)) continue;
      const itemId = target.slice(prefix.length);
      const list = out.get(itemId) ?? [];
      for (const source of sources) {
        const node = itemsById(document.nodes).get(source);
        if (node)
          list.push({
            id: qualifiedId(document.id, source),
            title: node.text,
            context: contextOf(document, source),
          });
      }
      out.set(itemId, list);
    }
  }
  return out;
}

/**
 * The `OutlineExternalLinks` adapter for one document of a workspace. `open` is the host's
 * navigation. Pure apart from that callback; rebuild it whenever the OTHER documents change.
 */
export function externalLinksFor(
  documents: readonly OutlineDocument[],
  documentId: string,
  open: (id: string) => void,
): OutlineExternalLinks {
  const backlinks = crossBacklinks(documents, documentId);
  const counts = new Map<string, number>();
  for (const [itemId, refs] of backlinks) counts.set(itemId, refs.length);
  return {
    resolve: (id) => {
      if (!parseQualifiedId(id)) return undefined;
      return resolveLink(documents, id)?.node.text ?? null;
    },
    open,
    backlinks: (itemId) => backlinks.get(itemId) ?? [],
    counts,
    suggest: (query, limit) => suggestLinks(documents, documentId, query, limit),
    qualify: (itemId) => qualifiedId(documentId, itemId),
  };
}

/** Items in other documents whose plain title contains `query` (case-insensitive), for `[[`. */
export function suggestLinks(
  documents: readonly OutlineDocument[],
  exceptId: string,
  query: string,
  limit = 6,
): readonly OutlineExternalRef[] {
  const q = query.trim().toLowerCase();
  const out: OutlineExternalRef[] = [];
  for (const document of documents) {
    if (document.id === exceptId) continue;
    const walk = (items: readonly OutlineItem[]): boolean => {
      for (const node of items) {
        if (out.length >= limit) return true;
        const plain = inlineToPlain(node.text);
        if (plain && (!q || plain.toLowerCase().includes(q)) && !node.data?.mirrorOf)
          out.push({
            id: qualifiedId(document.id, node.id),
            title: node.text,
            context: contextOf(document, node.id),
          });
        if (node.children && walk(node.children)) return true;
      }
      return false;
    };
    if (walk(document.nodes)) break;
  }
  return out;
}

/* ───────────── Search across documents ───────────── */

export interface DocumentSearchHit {
  readonly document: OutlineDocument;
  readonly result: OutlineSearchResult;
}

/** The outliner's own query language, run over every document (documents without matches are left out). */
export function searchDocuments(
  documents: readonly OutlineDocument[],
  query: string,
  maxPerDocument = 200,
): readonly DocumentSearchHit[] {
  if (!query.trim()) return [];
  const hits: DocumentSearchHit[] = [];
  for (const document of documents) {
    const result = searchOutliner(document.nodes, query, { maxResults: maxPerDocument });
    if (result.diagnostics.length) return [{ document, result }];
    if (result.matches.length) hits.push({ document, result });
  }
  return hits;
}

/** A document's item, for the "open document at item" route. */
export function hasItem(document: OutlineDocument, itemId: string): boolean {
  return !!findOutlineNode(document.nodes, itemId);
}
