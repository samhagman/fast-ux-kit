import {
  parseOutlineSearch,
  searchOutline,
  type OutlineItemDetails,
  type OutlineSearchDiagnostic,
  type OutlineSearchMatch,
  type OutlineSearchRange,
  type OutlineSearchResult,
} from "@fux/core";
import { parseInline } from "./inline";
import { OUTLINE_COLORS, type OutlineItem } from "./types";

/**
 * Outliner search = the core grammar (`searchOutline`: terms, "phrases", -not, OR, #tags,
 * is:/has:/color:/heading:/parent:/ancestor:/in:) plus task and date filters that need to read
 * the outliner's inline `!(YYYY-MM-DD[ HH:MM])` dates. The core stays unchanged: this layer
 * lexes the query the same way, lifts its own operators out of each OR branch, runs the rest
 * through the core and intersects.
 *
 *   is:todo                 unchecked checkbox items          (is:done → is:completed, core)
 *   due:today | tomorrow    an item dated that day
 *   due:overdue             dated before today and not done
 *   due:week                dated today … today + 6
 *   due:none                no date                           (has:date: any date, core)
 *   due:2026-11-03          dated that day
 *   before:2026-11-03       dated before that day (after: likewise)
 *   links:<id>              links to that item with [[label|id]] (its backlinks)
 *   changed:today | yesterday | week | month | 2026-11-03
 *                           edited that day / in the last 7 or 30 days (`data.editedAt`); edited: is an alias
 *
 * Every filter negates (`-due:overdue`, `NOT is:todo`) and combines with AND / OR like the core
 * predicates. Day comparisons are local calendar days, the same rule the date chips use for
 * their "overdue / today" tone, so a filter and the chip colour never disagree.
 */
export interface OutlinerSearchOptions {
  readonly scopeId?: string;
  readonly maxResults?: number;
  /** Clock for date filters (tests pin it). */
  readonly now?: Date;
}

interface Token {
  /** Text as typed (after alias rewriting for unquoted operators). */
  readonly text: string;
  readonly start: number;
  readonly end: number;
  /** Fully quoted terms are literal: never operators, never keywords. */
  readonly quoted: boolean;
  readonly negative: boolean;
}

type FilterKind = "todo" | "due" | "before" | "after" | "links" | "changed";
interface Filter {
  readonly kind: FilterKind;
  readonly value: string;
  readonly negated: boolean;
  readonly start: number;
  readonly end: number;
  /** due:/before:/after: resolved to a local day number (days since epoch) when it names a date. */
  readonly day?: number;
}

const ALIASES: readonly [RegExp, string][] = [
  [/^is:(done|complete|checked)$/i, "is:completed"],
  [/^has:notes$/i, "has:note"],
  [/^has:(task|tasks|todo)$/i, "has:checkbox"],
  [/^has:dates$/i, "has:date"],
];

/** Same lexical rules as the core: whitespace splits outside quotes; a leading - negates. */
function lex(query: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < query.length) {
    if (/\s/u.test(query[cursor]!)) {
      cursor++;
      continue;
    }
    const start = cursor;
    let inQuote = false;
    while (cursor < query.length && (inQuote || !/\s/u.test(query[cursor]!))) {
      if (query[cursor] === "\\" && inQuote) cursor++;
      else if (query[cursor] === '"') inQuote = !inQuote;
      cursor++;
    }
    const raw = query.slice(start, cursor);
    const negative = raw.startsWith("-");
    const body = negative ? raw.slice(1) : raw;
    const quoted = body.startsWith('"');
    let text = raw;
    if (!quoted)
      for (const [pattern, replacement] of ALIASES)
        if (pattern.test(body)) text = (negative ? "-" : "") + replacement;
    tokens.push({ text, start, end: cursor, quoted, negative });
  }
  return tokens;
}

const bare = (token: Token, word: string) => !token.quoted && !token.negative && token.text === word;
const FILTER = /^(is):(todo)$|^(due|before|after|links|changed|edited):(.*)$/i;
function filterOf(token: Token): { kind: FilterKind; value: string } | null {
  if (token.quoted) return null;
  const match = FILTER.exec(token.negative ? token.text.slice(1) : token.text);
  if (!match) return null;
  if (match[1]) return { kind: "todo", value: "todo" };
  const word = match[3]!.toLowerCase();
  const kind = (word === "edited" ? "changed" : word) as FilterKind;
  // Ids are case-sensitive; date words are not.
  return { kind, value: kind === "links" ? match[4]! : match[4]!.toLowerCase() };
}

const DAY_MS = 86_400_000;
/** Local calendar day as an integer, so DST shifts never move a date across midnight. */
export const dayNumber = (date: Date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
function parseDay(value: string): number | "format" | "calendar" {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return "format";
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return "calendar";
  return dayNumber(date);
}
const DUE_WORDS = ["today", "tomorrow", "overdue", "week", "none"] as const;
const CHANGED_WORDS = ["today", "yesterday", "week", "month"] as const;

function validate(filter: { kind: FilterKind; value: string }, start: number, end: number): { day?: number; diagnostic?: OutlineSearchDiagnostic } {
  if (filter.kind === "todo") return {};
  if (filter.kind === "links")
    return filter.value ? {} : { diagnostic: { code: "invalid-query", message: "links: needs an item id.", start, end } };
  if (filter.kind === "due" && (DUE_WORDS as readonly string[]).includes(filter.value)) return {};
  if (filter.kind === "changed" && (CHANGED_WORDS as readonly string[]).includes(filter.value)) return {};
  const day = parseDay(filter.value);
  if (typeof day === "number") return { day };
  const message =
    day === "calendar"
      ? `${filter.value} is not a calendar date.`
      : filter.kind === "due"
        ? `due: takes today, tomorrow, overdue, week, none or a date like ${exampleDate()}.`
        : filter.kind === "changed"
          ? `changed: takes today, yesterday, week, month or a date like ${exampleDate(new Date(), 0)}.`
        : `${filter.kind}: needs a date like ${exampleDate()}.`;
  return { diagnostic: { code: "invalid-query", message, start, end } };
}
const pad = (n: number) => String(n).padStart(2, "0");
const isoDay = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const exampleDate = (now = new Date(), offset = 7) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));

interface DatedRange extends OutlineSearchRange {
  readonly day: number;
  readonly field: "title" | "note";
}
function datesOf(node: OutlineItem): DatedRange[] {
  const out: DatedRange[] = [];
  const scan = (source: string | undefined, field: "title" | "note") => {
    if (!source || !source.includes("!(")) return;
    for (const segment of parseInline(source))
      if (segment.kind === "date" && segment.date) out.push({ start: segment.start, end: segment.end, day: dayNumber(segment.date.value), field });
  };
  scan(node.text, "title");
  scan(node.data?.note, "note");
  return out;
}
const isDone = (node: OutlineItem) => node.checked === true || node.data?.completed === true;

/** Earliest inline date of an item as a local day number (agenda grouping), or null. */
export function firstDay(node: OutlineItem): number | null {
  let best: number | null = null;
  for (const date of datesOf(node)) if (best === null || date.day < best) best = date.day;
  return best;
}

/** Ids an item links to with `[[label|id]]` (title and note), cached by node identity. */
const linkCache = new WeakMap<OutlineItem, readonly string[]>();
const NO_LINKS: readonly string[] = [];
export function outgoingLinks(node: OutlineItem): readonly string[] {
  const note = node.data?.note;
  if (!node.text.includes("[[") && !note?.includes("[[")) return NO_LINKS;
  let ids = linkCache.get(node);
  if (!ids) {
    const found = new Set<string>();
    for (const source of [node.text, note ?? ""])
      if (source.includes("[["))
        for (const segment of parseInline(source)) if (segment.kind === "ref" && segment.refId) found.add(segment.refId);
    ids = found.size ? [...found] : NO_LINKS;
    linkCache.set(node, ids);
  }
  return ids;
}

/** Details for the core's own predicates: inline dates count for `has:date`. */
export const outlinerDetails = (node: OutlineItem): OutlineItemDetails => {
  const dates = datesOf(node);
  return { ...(node.data ?? {}), ...(dates.length ? { dates: dates.map((date) => ({ start: date.day * DAY_MS })) } : {}) };
};

/** One filter against one node: whether it holds, and (positive date filters) which dates made it hold. */
function test(filter: Filter, node: OutlineItem, today: number): { ok: boolean; hits: readonly DatedRange[] } {
  if (filter.kind === "todo") return { ok: (node.checked === false) !== filter.negated, hits: [] };
  if (filter.kind === "links") return { ok: outgoingLinks(node).includes(filter.value) !== filter.negated, hits: [] };
  if (filter.kind === "changed") {
    const at = node.data?.editedAt;
    const day = typeof at === "number" && Number.isFinite(at) ? dayNumber(new Date(at)) : null;
    const span = { today: 0, yesterday: -1, week: 6, month: 29 }[filter.value as (typeof CHANGED_WORDS)[number]];
    const ok =
      day !== null &&
      (filter.value === "yesterday" ? day === today - 1 : span !== undefined ? day <= today && day >= today - span : day === filter.day);
    return { ok: ok !== filter.negated, hits: [] };
  }
  const dates = datesOf(node);
  let hits: DatedRange[];
  if (filter.kind === "due" && filter.value === "none") return { ok: !dates.length !== filter.negated, hits: [] };
  if (filter.kind === "before") hits = dates.filter((date) => date.day < filter.day!);
  else if (filter.kind === "after") hits = dates.filter((date) => date.day > filter.day!);
  else if (filter.value === "today") hits = dates.filter((date) => date.day === today);
  else if (filter.value === "tomorrow") hits = dates.filter((date) => date.day === today + 1);
  else if (filter.value === "week") hits = dates.filter((date) => date.day >= today && date.day <= today + 6);
  else if (filter.value === "overdue") hits = isDone(node) ? [] : dates.filter((date) => date.day < today);
  else hits = dates.filter((date) => date.day === filter.day);
  const ok = hits.length > 0;
  return { ok: ok !== filter.negated, hits: filter.negated ? [] : hits };
}

interface Branch {
  readonly filters: readonly Filter[];
  readonly core: readonly Token[];
}

const EMPTY: Omit<OutlineSearchResult, "diagnostics"> = { matches: [], matchedIds: [], contextAncestorIds: [], truncated: false, visitedCount: 0 };
const failed = (diagnostics: readonly OutlineSearchDiagnostic[]): OutlineSearchResult => ({ ...EMPTY, diagnostics });

export function searchOutliner(nodes: readonly OutlineItem[], query: string, options: OutlinerSearchOptions = {}): OutlineSearchResult {
  const maxResults = options.maxResults ?? 1000;
  const tokens = lex(query);
  const coreOptions = { scopeId: options.scopeId, maxResults, getDetails: outlinerDetails };
  if (!tokens.some(filterOf)) return searchOutline(nodes, tokens.map((token) => token.text).join(" "), coreOptions);

  // Structure (quotes, AND/OR/NOT placement) is the core's to judge: ask it about a shadow query
  // in which each filter is a placeholder predicate. Then judge the filter values ourselves.
  const shadow = tokens.map((token) => (filterOf(token) ? (token.negative ? "-has:children" : "has:children") : token.text));
  const structural = parseOutlineSearch(shadow.join(" ")).diagnostics;
  if (structural.length) return failed(structural.map((d) => ({ ...d, start: undefined, end: undefined })));

  const branches: Branch[] = [];
  let filters: Filter[] = [],
    core: Token[] = [];
  const diagnostics: OutlineSearchDiagnostic[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (bare(token, "OR")) {
      branches.push({ filters, core });
      filters = [];
      core = [];
      continue;
    }
    if (bare(token, "AND")) continue; // AND is implicit; dropping it keeps the core branch valid
    const notNext = bare(token, "NOT") && tokens[i + 1] && filterOf(tokens[i + 1]!);
    const target = notNext ? tokens[++i]! : token;
    const filter = filterOf(target);
    if (!filter) {
      core.push(token);
      continue;
    }
    const start = notNext ? token.start : target.start;
    const { day, diagnostic } = validate(filter, start, target.end);
    if (diagnostic) diagnostics.push(diagnostic);
    filters.push({ ...filter, negated: target.negative !== !!notNext, start, end: target.end, ...(day === undefined ? {} : { day }) });
  }
  branches.push({ filters, core });
  if (diagnostics.length) return failed(diagnostics);

  // One pre-order index of the document: order, parents and scope for every node.
  const index = new Map<string, { readonly node: OutlineItem; readonly parent: string | null; readonly order: number; readonly inScope: boolean }>();
  const walk = (items: readonly OutlineItem[], parent: string | null, inScope: boolean) => {
    for (const node of items) {
      const scoped = inScope || node.id === options.scopeId;
      index.set(node.id, { node, parent, order: index.size, inScope: scoped });
      if (node.children) walk(node.children, node.id, scoped);
    }
  };
  walk(nodes, null, options.scopeId === undefined);
  if (options.scopeId !== undefined && !index.has(options.scopeId))
    return failed([{ code: "scope-not-found", message: "The requested search scope does not exist." }]);

  const today = dayNumber(options.now ?? new Date());
  const found = new Map<string, { title: OutlineSearchRange[]; note: OutlineSearchRange[] }>();
  let truncated = false;
  let visitedCount = 0;
  const add = (id: string, title: readonly OutlineSearchRange[], note: readonly OutlineSearchRange[]) => {
    const entry = found.get(id) ?? { title: [], note: [] };
    for (const range of title) if (!entry.title.some((r) => r.start === range.start && r.end === range.end)) entry.title.push(range);
    for (const range of note) if (!entry.note.some((r) => r.start === range.start && r.end === range.end)) entry.note.push(range);
    found.set(id, entry);
  };
  for (const branch of branches) {
    let candidates: readonly OutlineSearchMatch[];
    if (branch.core.length) {
      const result = searchOutline(nodes, branch.core.map((token) => token.text).join(" "), { ...coreOptions, maxResults: 10_000 });
      if (result.diagnostics.some((d) => d.code !== "result-limit" && d.code !== "visit-limit")) return failed(result.diagnostics);
      truncated ||= result.truncated;
      visitedCount = Math.max(visitedCount, result.visitedCount);
      candidates = result.matches;
    } else {
      candidates = [...index.values()].filter((entry) => entry.inScope).map((entry) => ({ id: entry.node.id, titleRanges: [], noteRanges: [] }));
      visitedCount = Math.max(visitedCount, index.size);
    }
    for (const candidate of candidates) {
      const node = index.get(candidate.id)?.node;
      if (!node) continue;
      const title = [...candidate.titleRanges],
        note = [...candidate.noteRanges];
      let ok = true;
      for (const filter of branch.filters) {
        const verdict = test(filter, node, today);
        if (!verdict.ok) {
          ok = false;
          break;
        }
        for (const hit of verdict.hits) (hit.field === "title" ? title : note).push({ start: hit.start, end: hit.end });
      }
      if (ok) add(candidate.id, title, note);
    }
  }

  const ordered = [...found.keys()].sort((a, b) => index.get(a)!.order - index.get(b)!.order);
  const out: OutlineSearchDiagnostic[] = [];
  if (ordered.length > maxResults) {
    ordered.length = maxResults;
    truncated = true;
    out.push({ code: "result-limit", message: "The result budget was reached; more matches exist." });
  }
  const byStart = (a: OutlineSearchRange, b: OutlineSearchRange) => a.start - b.start || a.end - b.end;
  const matches = ordered.map((id) => {
    const entry = found.get(id)!;
    return { id, titleRanges: entry.title.sort(byStart), noteRanges: entry.note.sort(byStart) };
  });
  const matched = new Set(ordered);
  const context = new Set<string>();
  for (const id of ordered)
    for (let parent = index.get(id)!.parent; parent && !context.has(parent); parent = index.get(parent)!.parent)
      if (!matched.has(parent)) context.add(parent);
  return {
    matches,
    matchedIds: ordered,
    contextAncestorIds: [...context].sort((a, b) => index.get(a)!.order - index.get(b)!.order),
    diagnostics: out,
    truncated,
    visitedCount,
  };
}

/* ───────────────────────────── Query hints ───────────────────────────── */

export interface SearchSuggestion {
  /** What the chip shows, e.g. "due:overdue". */
  readonly label: string;
  /** Plain-words meaning, for the chip title and screen readers. */
  readonly hint: string;
  /** The whole query after accepting it. */
  readonly query: string;
}

const OPERATORS: readonly (readonly [string, string])[] = [
  ["is:", "state"],
  ["has:", "content"],
  ["due:", "date"],
  ["before:", "dated before"],
  ["after:", "dated after"],
  ["changed:", "edited when"],
  ["color:", "colour label"],
  ["heading:", "heading level"],
  ["parent:", "parent title"],
  ["in:", "title or note only"],
];
function valuesFor(operator: string, now: Date): readonly (readonly [string, string])[] {
  const day = (offset: number) => isoDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset));
  switch (operator) {
    case "is":
      return [["todo", "open checkbox"], ["done", "completed"], ["heading", "any heading"]];
    case "has":
      return [["note", "has a note"], ["checkbox", "is a task"], ["date", "has a date"], ["children", "has children"], ["color", "has a colour"]];
    case "due":
      return [["today", "dated today"], ["overdue", "past and not done"], ["week", "next 7 days"], ["tomorrow", "dated tomorrow"], ["none", "no date"]];
    case "before":
    case "after":
      return [[day(0), "today"], [day(7), "in a week"]];
    case "changed":
    case "edited":
      return [["today", "edited today"], ["week", "last 7 days"], ["yesterday", "edited yesterday"], ["month", "last 30 days"], [day(0), "that day"]];
    case "color":
      return OUTLINE_COLORS.map((color) => [color, `${color} label`] as const);
    case "heading":
      return [["1", "heading 1"], ["2", "heading 2"], ["3", "heading 3"]];
    case "in":
      return [["title", "titles only"], ["note", "notes only"], ["all", "titles and notes"]];
    default:
      return [];
  }
}

/** Completions for the token being typed at the end of `query` (operators, then their values). */
export function searchSuggestions(query: string, now = new Date()): readonly SearchSuggestion[] {
  if (!query || /\s$/.test(query)) return [];
  const tokens = lex(query);
  const last = tokens.at(-1);
  if (!last || last.quoted || last.end !== query.length) return [];
  const raw = query.slice(last.start);
  const sign = raw.startsWith("-") ? "-" : "";
  const body = raw.slice(sign.length).toLowerCase();
  const head = query.slice(0, last.start);
  const colon = body.indexOf(":");
  if (colon < 0) {
    if (body.length < 2) return [];
    return OPERATORS.filter(([name]) => name.startsWith(body) && name !== body).map(([name, hint]) => ({
      label: sign + name,
      hint,
      query: head + sign + name,
    }));
  }
  const operator = body.slice(0, colon);
  const partial = body.slice(colon + 1);
  return valuesFor(operator, now)
    .filter(([value]) => value.startsWith(partial) && value !== partial)
    .map(([value, hint]) => ({ label: `${sign}${operator}:${value}`, hint, query: `${head}${sign}${operator}:${value} ` }));
}
