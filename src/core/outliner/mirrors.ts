import type { OutlineItem, OutlineItemData } from "./types.js";

/**
 * Mirrors: one item shown (and edited) in several places, like mirrored blocks in other outliners or
 * block embeds. A studio-layer feature over the unchanged core.
 *
 * Storage is denormalized on purpose. A mirror is an ordinary node that names its source in
 * `data.mirrorOf` and carries a COPY of the source's text, checkbox, data and children. Copies of
 * descendants get derived ids (`<mirror id>~<source descendant id>`). Because every copy is a real
 * node, everything else just works on mirrors: caret, selection, keyboard, drag, folding (per
 * place), search, the virtual list and undo.
 *
 * After every edit, `syncMirrors` keeps each group (a source plus its mirrors) identical:
 *   - the WRITER is the one instance that changed: the source if it changed, else the first
 *     mirror that existed before and changed (typing in a mirror edits the source);
 *   - every other instance is regenerated from the writer, reusing objects for unchanged
 *     subtrees (identity is preserved, so the typing fast path and memoized rows still hold);
 *   - a node created inside a mirror (Enter, paste) becomes a source node; its id inside the
 *     mirror is renamed to the derived id and the caret follows (`renames`).
 * It runs inside the same reducer step as the edit, so an edit and its propagation are ONE
 * history entry: undo and redo restore snapshots that are already in sync.
 *
 * Rules:
 *   - deleting a mirror never touches the source; deleting the source turns its mirrors into
 *     ordinary items (their copied content is kept, nothing dangles);
 *   - a mirror inside its own source (or a source inside its mirror) is refused, never looped;
 *   - a mirror of a mirror points at the original source;
 *   - edits that reach a locked source node through a mirror are refused.
 *
 * Copies inside a mirror are not independent: nested mirrors are carried along as part of the
 * copy, and only top-level mirrors (not inside another mirror) form groups.
 */
export const MIRROR_SEPARATOR = "~";

export type MirrorRefusal = "locked" | "descendant-move";
export type MirrorSync =
  | {
      readonly ok: true;
      readonly nodes: readonly OutlineItem[];
      readonly renames: ReadonlyMap<string, string>;
    }
  | { readonly ok: false; readonly reason: MirrorRefusal };

export const mirrorOf = (node: OutlineItem): string | undefined =>
  typeof node.data?.mirrorOf === "string" && node.data.mirrorOf ? node.data.mirrorOf : undefined;

/** Whether any node in this subtree list is a mirror. Cached by identity: O(changed path) per edit. */
const subtreeCache = new WeakMap<OutlineItem, boolean>();
function nodeHasMirror(node: OutlineItem): boolean {
  let cached = subtreeCache.get(node);
  if (cached === undefined) {
    cached = !!mirrorOf(node) || (node.children ?? []).some(nodeHasMirror);
    subtreeCache.set(node, cached);
  }
  return cached;
}
export const hasMirrors = (nodes: readonly OutlineItem[]) => nodes.some(nodeHasMirror);

interface Located {
  readonly node: OutlineItem;
  /** Ancestor ids, root first. */
  readonly path: readonly string[];
  /** Inside a mirror's copied subtree (or the mirror root itself). */
  readonly inCopy: boolean;
}
function index(nodes: readonly OutlineItem[]) {
  const byId = new Map<string, Located>();
  const mirrors: Located[] = [];
  const walk = (items: readonly OutlineItem[], path: readonly string[], inCopy: boolean) => {
    for (const node of items) {
      const isMirror = !!mirrorOf(node);
      const entry = { node, path, inCopy: inCopy || isMirror };
      byId.set(node.id, entry);
      if (isMirror && !inCopy) mirrors.push(entry);
      if (node.children) walk(node.children, [...path, node.id], inCopy || isMirror);
    }
  };
  walk(nodes, [], false);
  return { byId, mirrors };
}

const prefixOf = (mirrorId: string) => mirrorId + MIRROR_SEPARATOR;

/* Identity-preserving translation between a source subtree and a mirror's copy of it. */
const copies = new WeakMap<OutlineItem, Map<string, OutlineItem>>();
const originals = new WeakMap<OutlineItem, Map<string, OutlineItem>>();
function remember(original: OutlineItem, prefix: string, copy: OutlineItem) {
  let byPrefix = copies.get(original);
  if (!byPrefix) copies.set(original, (byPrefix = new Map()));
  byPrefix.set(prefix, copy);
  let back = originals.get(copy);
  if (!back) originals.set(copy, (back = new Map()));
  back.set(prefix, original);
}

/** The source subtree as a mirror shows it: ids prefixed. Unchanged input ⇒ the same objects. */
function materialize(node: OutlineItem, prefix: string): OutlineItem {
  const cached = copies.get(node)?.get(prefix);
  if (cached) return cached;
  const copy: OutlineItem = {
    ...node,
    id: prefix + node.id,
    ...(node.children
      ? { children: node.children.map((child) => materialize(child, prefix)) }
      : {}),
  };
  remember(node, prefix, copy);
  return copy;
}

/** A mirror's copy back to source form: prefixed ids stripped, new nodes keep theirs. */
function canonicalize(
  node: OutlineItem,
  prefix: string,
  created: Map<string, string>,
): OutlineItem {
  const cached = originals.get(node)?.get(prefix);
  if (cached) return cached;
  const derived = node.id.startsWith(prefix);
  const id = derived ? node.id.slice(prefix.length) : node.id;
  if (!derived) created.set(node.id, prefix + node.id);
  const before = created.size;
  const original: OutlineItem = {
    ...node,
    id,
    ...(node.children
      ? { children: node.children.map((child) => canonicalize(child, prefix, created)) }
      : {}),
  };
  // The edited copy IS the mirror's view of this original (unless ids inside it get renamed).
  if (derived && created.size === before) remember(original, prefix, node);
  return original;
}

/** Shared content of an instance root: everything except its own id, mirrorOf and position. */
function sharedData(node: OutlineItem): Omit<OutlineItemData, "mirrorOf"> | undefined {
  if (!node.data) return undefined;
  const { mirrorOf: _own, ...rest } = node.data;
  return Object.keys(rest).length ? rest : undefined;
}
function withContent(
  target: OutlineItem,
  from: OutlineItem,
  children: readonly OutlineItem[] | undefined,
  mirrorId?: string,
): OutlineItem {
  const data = sharedData(from);
  const nextData = mirrorId ? { ...data, mirrorOf: mirrorId } : data;
  const same =
    target.text === from.text &&
    target.checked === from.checked &&
    sameChildren(target.children, children) &&
    shallowEqual(sharedData(target), data) &&
    (mirrorId ? target.data?.mirrorOf === mirrorId : !mirrorOf(target));
  if (same) return target;
  const { checked: _c, data: _d, children: _ch, ...rest } = target;
  return {
    ...rest,
    text: from.text,
    ...(from.checked !== undefined ? { checked: from.checked } : {}),
    ...(nextData ? { data: nextData } : {}),
    ...(children?.length ? { children } : {}),
  };
}
const sameChildren = (a?: readonly OutlineItem[], b?: readonly OutlineItem[]) =>
  (a?.length ?? 0) === (b?.length ?? 0) && (a ?? []).every((node, i) => node === b![i]);
function shallowEqual(a?: object, b?: object) {
  if (a === b) return true;
  const ka = Object.keys(a ?? {}),
    kb = Object.keys(b ?? {});
  return (
    ka.length === kb.length &&
    ka.every((key) => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)?.[key])
  );
}

/** Path-copying replacement of nodes by id (unchanged branches keep their identity). */
function replaceNodes(
  nodes: readonly OutlineItem[],
  next: ReadonlyMap<string, OutlineItem>,
): readonly OutlineItem[] {
  if (!next.size) return nodes;
  let changed = false;
  const out = nodes.map((node) => {
    const replaced = next.get(node.id);
    if (replaced) {
      changed ||= replaced !== node;
      return replaced;
    }
    if (!node.children) return node;
    const children = replaceNodes(node.children, next);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? out : nodes;
}

/** Root source of a mirror (a mirror of a mirror points at the original). */
function resolveSource(id: string, byId: ReadonlyMap<string, Located>): Located | undefined {
  const seen = new Set<string>();
  let entry = byId.get(id);
  while (entry && mirrorOf(entry.node) && !seen.has(entry.node.id)) {
    seen.add(entry.node.id);
    entry = byId.get(mirrorOf(entry.node)!);
  }
  return entry && !mirrorOf(entry.node) ? entry : undefined;
}

/**
 * Bring every mirror group in `after` in line (see the module comment). `before` is the document
 * the edit started from (null at load: sources win). Pure; returns `after` itself when there is
 * nothing to do.
 */
export function syncMirrors(
  before: readonly OutlineItem[] | null,
  after: readonly OutlineItem[],
  isLocked?: (node: OutlineItem) => boolean,
): MirrorSync {
  const renames = new Map<string, string>();
  if (!hasMirrors(after) && !(before && hasMirrors(before)))
    return { ok: true, nodes: after, renames };
  const beforeIndex = before ? index(before) : null;
  const rescued = rescueEscapedCopies(beforeIndex, after, renames, isLocked);
  if (!rescued.ok) return rescued;
  let nodes = rescued.nodes;
  if (!hasMirrors(nodes)) return { ok: true, nodes, renames };
  const beforeById = beforeIndex?.byId ?? null;
  // Pass 2 settles a writer that was itself regenerated in pass 1 (nested groups); sources win.
  for (let pass = 0; pass < 3; pass++) {
    const { byId, mirrors } = index(nodes);
    const updates = new Map<string, OutlineItem>();
    const groups = new Map<string, Located[]>();
    for (const mirror of mirrors) {
      const source = resolveSource(mirrorOf(mirror.node)!, byId);
      if (!source || source.inCopy) {
        // Orphan (source deleted, or pasted from elsewhere): it becomes an ordinary item.
        const { data: _data, ...plain } = mirror.node;
        const rest = sharedData(mirror.node);
        updates.set(mirror.node.id, rest ? { ...plain, data: rest } : plain);
        continue;
      }
      if (mirror.path.includes(source.node.id) || source.path.includes(mirror.node.id))
        return { ok: false, reason: "descendant-move" };
      const list = groups.get(source.node.id) ?? [source];
      list.push(mirror);
      groups.set(source.node.id, list);
    }
    for (const [sourceId, members] of groups) {
      const source = members[0]!;
      const changed = (entry: Located) => beforeById?.get(entry.node.id)?.node !== entry.node;
      const existed = (entry: Located) => !!beforeById?.has(entry.node.id);
      const writer =
        !beforeById || changed(source)
          ? source
          : (members.slice(1).find((entry) => existed(entry) && changed(entry)) ?? source);
      const created = new Map<string, string>();
      const prefix = writer === source ? "" : prefixOf(writer.node.id);
      const canonicalChildren =
        writer === source
          ? source.node.children
          : writer.node.children?.map((child) => canonicalize(child, prefix, created));
      if (writer !== source) {
        // Editing through a mirror must respect the source's locks (the core only saw the copy).
        if (isLocked && lockedChange(source, canonicalChildren, writer.node, isLocked, byId))
          return { ok: false, reason: "locked" };
        updates.set(sourceId, withContent(source.node, writer.node, canonicalChildren));
        for (const [from, to] of created) renames.set(from, to);
      }
      for (const member of members.slice(1)) {
        const children = canonicalChildren?.map((child) =>
          materialize(child, prefixOf(member.node.id)),
        );
        updates.set(member.node.id, withContent(member.node, writer.node, children, sourceId));
      }
    }
    const next = replaceNodes(nodes, updates);
    if (next === nodes) break;
    nodes = next;
  }
  return { ok: true, nodes, renames };
}

/** Path-copying removal of the node with `id` (and its subtree). */
function removeNode(nodes: readonly OutlineItem[], id: string): readonly OutlineItem[] {
  let changed = false;
  const out: OutlineItem[] = [];
  for (const node of nodes) {
    if (node.id === id) {
      changed = true;
      continue;
    }
    if (node.children) {
      const children = removeNode(node.children, id);
      if (children !== node.children) {
        changed = true;
        out.push(
          children.length ? { ...node, children } : (({ children: _gone, ...rest }) => rest)(node),
        );
        continue;
      }
    }
    out.push(node);
  }
  return changed ? out : nodes;
}

/**
 * A copy that has LEFT its mirror (Shift+Tab, a drag or "Move to" out of it) is the source item
 * moving there: it takes back the source's ids (its descendants too) and the source node it
 * shadowed is removed, so links, bookmarks and host records keyed on the id survive the move
 * ("move out of a mirror"). A copy pasted or dropped into ANOTHER mirror's copy is
 * left to the normal rule (it becomes a new child of that mirror's source).
 */
function rescueEscapedCopies(
  before: ReturnType<typeof index> | null,
  after: readonly OutlineItem[],
  renames: Map<string, string>,
  isLocked?: (node: OutlineItem) => boolean,
): MirrorSync {
  const now = index(after);
  const mirrorIds = new Set(now.mirrors.map((entry) => entry.node.id));
  for (const entry of before?.mirrors ?? []) mirrorIds.add(entry.node.id);
  if (!mirrorIds.size) return { ok: true, nodes: after, renames };
  const escaped: { readonly entry: Located; readonly prefix: string; readonly mirrorId: string }[] =
    [];
  const crossed: {
    readonly id: string;
    readonly prefix: string;
    readonly mirrorId: string;
    readonly into: string;
  }[] = [];
  const topMirrors = new Set(now.mirrors.map((entry) => entry.node.id));
  for (const entry of now.byId.values()) {
    const at = entry.node.id.indexOf(MIRROR_SEPARATOR);
    if (at <= 0) continue;
    const mirrorId = entry.node.id.slice(0, at);
    if (!mirrorIds.has(mirrorId)) continue;
    const prefix = prefixOf(mirrorId);
    // Only the root of a moved subtree (its descendants travel with it).
    if (entry.path.some((id) => id.startsWith(prefix))) continue;
    if (!entry.inCopy) {
      escaped.push({ entry, prefix, mirrorId });
      continue;
    }
    // A copy dropped into ANOTHER mirror (of the same source, or of a different one): the item
    // it stands for moves there — into that mirror's source, at the matching place.
    const into = entry.path.find((id) => topMirrors.has(id));
    if (into && into !== mirrorId && !mirrorOf(entry.node))
      crossed.push({ id: entry.node.id, prefix, mirrorId, into });
  }
  let nodes = after;
  for (const move of crossed) {
    const result = moveAcrossMirrors(nodes, before, move, renames, isLocked);
    if (result === "locked") return { ok: false, reason: "locked" };
    if (result) nodes = result;
  }
  for (const { entry, prefix, mirrorId } of escaped) {
    const created = new Map<string, string>();
    const canonical = canonicalize(entry.node, prefix, created);
    const shadow = before?.byId.get(canonical.id) ?? now.byId.get(canonical.id);
    // Moving a source item out through its mirror respects the source's locks.
    if (
      isLocked &&
      shadow &&
      (isLocked(shadow.node) ||
        shadow.path.some((id) => {
          const node = now.byId.get(id)?.node;
          return !!node && isLocked(node);
        }))
    )
      return { ok: false, reason: "locked" };
    // Remove the shadow only when it IS the source item the copy stands for (it sits in that
    // mirror's source subtree); an unrelated node that merely shares the id is never touched —
    // the clash check below then keeps the derived ids instead.
    const mirrorNode = now.byId.get(mirrorId)?.node ?? before?.byId.get(mirrorId)?.node;
    const sourceId = mirrorNode ? mirrorOf(mirrorNode) : undefined;
    const inSource =
      !!shadow && !!sourceId && (shadow.node.id === sourceId || shadow.path.includes(sourceId));
    let next = inSource ? removeNode(nodes, canonical.id) : nodes;
    // Any other clash (a source id already used elsewhere) keeps the derived ids: never duplicate.
    const taken = new Set<string>();
    const collect = (items: readonly OutlineItem[]) =>
      items.forEach((node) => {
        if (node.id === entry.node.id) return;
        taken.add(node.id);
        if (node.children) collect(node.children);
      });
    collect(next);
    const clash = (node: OutlineItem): boolean =>
      taken.has(node.id) || !!node.children?.some(clash);
    if (clash(canonical)) continue;
    next = replaceNodes(next, new Map([[entry.node.id, canonical]]));
    nodes = next;
    const record = (node: OutlineItem) => {
      if (node.id.startsWith(prefix)) renames.set(node.id, node.id.slice(prefix.length));
      node.children?.forEach(record);
    };
    record(entry.node);
  }
  return { ok: true, nodes, renames };
}

/** Path-copying insertion of `node` as child `index` of `parentId`. */
function insertNode(
  nodes: readonly OutlineItem[],
  parentId: string,
  index: number,
  node: OutlineItem,
): readonly OutlineItem[] {
  return nodes.map((item) => {
    if (item.id === parentId) {
      const children = [...(item.children ?? [])];
      children.splice(Math.max(0, Math.min(children.length, index)), 0, node);
      return { ...item, children };
    }
    if (!item.children) return item;
    const children = insertNode(item.children, parentId, index, node);
    return children === item.children ? item : { ...item, children };
  });
}

/**
 * The copy `move.id` (from mirror `move.mirrorId`) now sits inside mirror `move.into`. Rewrite that
 * as the source item moving into `move.into`'s source at the matching position, so it keeps its
 * id and nothing is duplicated or lost (two mirrors of one source used to race: whichever came
 * first in the document won, and the item could vanish). Null leaves it to the normal rule.
 */
function moveAcrossMirrors(
  nodes: readonly OutlineItem[],
  before: ReturnType<typeof index> | null,
  move: {
    readonly id: string;
    readonly prefix: string;
    readonly mirrorId: string;
    readonly into: string;
  },
  renames: Map<string, string>,
  isLocked?: (node: OutlineItem) => boolean,
): readonly OutlineItem[] | "locked" | null {
  const now = index(nodes);
  const entry = now.byId.get(move.id);
  const target = now.byId.get(move.into);
  if (!entry || !target) return null;
  const destination = resolveSource(mirrorOf(target.node)!, now.byId);
  if (!destination || destination.inCopy) return null;
  // The parent it was dropped under, as the destination source sees it.
  const intoPrefix = prefixOf(move.into);
  const parentId = entry.path.at(-1)!;
  const sourceParent =
    parentId === move.into
      ? destination.node.id
      : parentId.startsWith(intoPrefix)
        ? parentId.slice(intoPrefix.length)
        : null;
  if (!sourceParent || !now.byId.has(sourceParent)) return null;
  const created = new Map<string, string>();
  const canonical = canonicalize(entry.node, move.prefix, created);
  if (created.size) return null; // a fresh node inside the moved copy: the normal rule handles it
  const shadow = now.byId.get(canonical.id) ?? before?.byId.get(canonical.id);
  const mirrorNode = now.byId.get(move.mirrorId)?.node ?? before?.byId.get(move.mirrorId)?.node;
  const originId = mirrorNode ? mirrorOf(mirrorNode) : undefined;
  const isOrigin =
    !!shadow && !!originId && (shadow.node.id === originId || shadow.path.includes(originId));
  if (shadow && !isOrigin) return null; // the id belongs to something else: never touch it
  if (isLocked) {
    const lockedAt = (id: string) => {
      const located = now.byId.get(id);
      return (
        !!located &&
        (isLocked(located.node) ||
          located.path.some((p) => {
            const n = now.byId.get(p)?.node;
            return !!n && isLocked(n);
          }))
      );
    };
    if ((shadow && lockedAt(canonical.id)) || lockedAt(sourceParent)) return "locked";
  }
  // Position among the destination's children: the siblings before it in the mirror, minus any
  // stale copy of the item itself (same source: the mirror still shows it at its old place).
  const siblings =
    (parentId === move.into ? target.node.children : now.byId.get(parentId)?.node.children) ?? [];
  const position = siblings
    .slice(
      0,
      siblings.findIndex((node) => node.id === move.id),
    )
    .filter((node) => node.id !== intoPrefix + canonical.id).length;
  let next = removeNode(nodes, move.id);
  if (shadow && now.byId.has(canonical.id)) next = removeNode(next, canonical.id);
  next = insertNode(next, sourceParent, position, canonical);
  const record = (node: OutlineItem) => {
    const id = node.id.startsWith(move.prefix) ? node.id.slice(move.prefix.length) : node.id;
    renames.set(node.id, intoPrefix + id);
    node.children?.forEach(record);
  };
  record(entry.node);
  return next;
}

function lockedChange(
  source: Located,
  canonicalChildren: readonly OutlineItem[] | undefined,
  writer: OutlineItem,
  isLocked: (node: OutlineItem) => boolean,
  byId: ReadonlyMap<string, Located>,
): boolean {
  const pathLocked = source.path.some((id) => {
    const node = byId.get(id)?.node;
    return node ? isLocked(node) : false;
  });
  const rootChanged =
    writer.text !== source.node.text ||
    writer.checked !== source.node.checked ||
    !shallowEqual(sharedData(writer), sharedData(source.node));
  if (
    (pathLocked || isLocked(source.node)) &&
    (rootChanged || !sameChildren(canonicalChildren, source.node.children))
  )
    return true;
  // A locked descendant must come through untouched (same object) in the new children.
  const next = new Map<string, OutlineItem>();
  const collect = (items?: readonly OutlineItem[]) =>
    items?.forEach((node) => (next.set(node.id, node), collect(node.children)));
  collect(canonicalChildren);
  let refused = false;
  const visit = (items?: readonly OutlineItem[]) =>
    items?.forEach((node) => {
      if (refused) return;
      if (isLocked(node) && next.get(node.id) !== node) refused = true;
      else visit(node.children);
    });
  visit(source.node.children);
  return refused;
}

/** A new mirror of `sourceId` (resolved to the original source), ready to insert. */
export function createMirror(
  nodes: readonly OutlineItem[],
  sourceId: string,
  id: string,
): OutlineItem | null {
  const { byId } = index(nodes);
  const source = resolveSource(sourceId, byId);
  if (!source) return null;
  const node = source.node;
  return {
    id,
    text: node.text,
    ...(node.checked !== undefined ? { checked: node.checked } : {}),
    data: { ...sharedData(node), mirrorOf: node.id },
    ...(node.children?.length
      ? { children: node.children.map((child) => materialize(child, prefixOf(id))) }
      : {}),
  };
}

/** Ids of the top-level mirrors of a source (for "Mirrored in N places"). */
export function mirrorsOfSource(nodes: readonly OutlineItem[], sourceId: string): string[] {
  if (!hasMirrors(nodes)) return [];
  return index(nodes)
    .mirrors.filter((entry) => mirrorOf(entry.node) === sourceId)
    .map((entry) => entry.node.id);
}

/** For a mirror or a copy inside one: the source node it shows (null for ordinary nodes). */
export function canonicalId(nodes: readonly OutlineItem[], id: string): string | null {
  if (!hasMirrors(nodes)) return null;
  const { byId } = index(nodes);
  const entry = byId.get(id);
  if (!entry?.inCopy) return null;
  const rootId = [...entry.path, id].find((candidate) => mirrorOf(byId.get(candidate)!.node))!;
  if (rootId === id) return mirrorOf(entry.node)!;
  return id.startsWith(prefixOf(rootId)) ? id.slice(prefixOf(rootId).length) : null;
}
