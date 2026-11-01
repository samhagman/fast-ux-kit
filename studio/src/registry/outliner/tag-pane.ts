import { parseInline } from "./inline";
import type { OutlineItem } from "./types";

/**
 * The tag pane's model, pure: every #tag and @mention across one or more documents, how many
 * items carry it and in how many documents, and which other tags appear on the same items
 * ("co-occurring"). A tag counts once per item (title and note together). Keys are lower case
 * (`#Launch` and `#launch` are one tag); the label is the first spelling seen.
 */
export interface TagEntry {
  readonly key: string;
  readonly label: string;
  readonly kind: "tag" | "mention";
  /** Items carrying it. */
  readonly count: number;
  /** Documents it appears in. */
  readonly documents: number;
}

export interface TagSource {
  readonly id: string;
  readonly nodes: readonly OutlineItem[];
}

export interface TagInventory {
  readonly tags: readonly TagEntry[];
  /** Per item (`documentId/itemId`): its tag keys. */
  readonly items: ReadonlyMap<string, readonly string[]>;
}

/** One document's items → their tag keys (and first spellings), cached by the node array. */
const perDocument = new WeakMap<readonly OutlineItem[], { readonly items: ReadonlyMap<string, readonly string[]>; readonly spelling: ReadonlyMap<string, string> }>();
function scanDocument(nodes: readonly OutlineItem[]) {
  let cached = perDocument.get(nodes);
  if (cached) return cached;
  const items = new Map<string, string[]>();
  const spelling = new Map<string, string>();
  const stack = [...nodes];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.children) stack.push(...node.children);
    // A mirror's copies are counted once, at their source.
    if (node.data?.mirrorOf) continue;
    const found = new Set<string>();
    for (const source of [node.text, node.data?.note ?? ""]) {
      if (!source.includes("#") && !source.includes("@")) continue;
      for (const segment of parseInline(source)) {
        if (segment.kind !== "tag" && segment.kind !== "mention") continue;
        const key = segment.display.toLowerCase();
        found.add(key);
        if (!spelling.has(key)) spelling.set(key, segment.display);
      }
    }
    if (found.size) items.set(node.id, [...found]);
  }
  perDocument.set(nodes, (cached = { items, spelling }));
  return cached;
}

export function tagInventory(sources: readonly TagSource[]): TagInventory {
  const counts = new Map<string, { label: string; count: number; documents: Set<string> }>();
  const items = new Map<string, readonly string[]>();
  for (const source of sources) {
    const scan = scanDocument(source.nodes);
    for (const [itemId, keys] of scan.items) {
      items.set(`${source.id}/${itemId}`, keys);
      for (const key of keys) {
        const entry = counts.get(key) ?? { label: scan.spelling.get(key) ?? key, count: 0, documents: new Set<string>() };
        entry.count++;
        entry.documents.add(source.id);
        counts.set(key, entry);
      }
    }
  }
  const tags = [...counts].map(([key, entry]): TagEntry => ({
    key,
    label: entry.label,
    kind: key.startsWith("@") ? "mention" : "tag",
    count: entry.count,
    documents: entry.documents.size,
  }));
  tags.sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  return { tags, items };
}

/**
 * Tags that appear on the same items as ALL of `selected`, with how many such items carry each
 * (most first). Empty when nothing is selected.
 */
export function coOccurring(inventory: TagInventory, selected: readonly string[]): readonly { readonly key: string; readonly label: string; readonly count: number }[] {
  if (!selected.length) return [];
  const want = selected.map((key) => key.toLowerCase());
  const tally = new Map<string, number>();
  for (const keys of inventory.items.values()) {
    if (!want.every((key) => keys.includes(key))) continue;
    for (const key of keys) if (!want.includes(key)) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  const labels = new Map(inventory.tags.map((tag) => [tag.key, tag.label]));
  return [...tally]
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** #tags and @mentions a search query asks for (bare, positive terms), lower case. */
export function tagsInQuery(query: string): readonly string[] {
  const out: string[] = [];
  for (const match of query.matchAll(/(?:^|\s)([#@][\p{L}\p{N}_.-]*[\p{L}\p{N}_-])(?=\s|$)/gu)) {
    const key = match[1]!.toLowerCase();
    if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** Add a tag to the query (AND), or take it out again when it is already there. */
export function toggleTagInQuery(query: string, tag: string): string {
  const key = tag.toLowerCase();
  if (tagsInQuery(query).includes(key)) {
    const kept = query
      .split(/\s+/)
      .filter((token) => token && token.toLowerCase() !== key)
      .join(" ");
    return kept;
  }
  return query.trim() ? `${query.trim()} ${tag}` : tag;
}
