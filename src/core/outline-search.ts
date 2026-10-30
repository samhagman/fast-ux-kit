import type { OutlineNode } from "./index.js";
import { getOutlineItemDetails, type OutlineDetailsGetter } from "./outline-productivity.js";

export type OutlineSearchField = "all" | "title" | "note";
export interface OutlineSearchRange {
  /** UTF-16 offsets into the original, unmodified string; end is exclusive. */
  readonly start: number;
  readonly end: number;
}
export interface OutlineSearchDiagnostic {
  readonly code:
    | "query-limit"
    | "token-limit"
    | "invalid-query"
    | "unknown-operator"
    | "unsupported-operator"
    | "invalid-budget"
    | "invalid-outline"
    | "scope-not-found"
    | "visit-limit"
    | "result-limit"
    | "range-limit";
  readonly message: string;
  readonly start?: number;
  readonly end?: number;
}
export interface OutlineSearchPredicate {
  readonly kind: "text" | "is" | "has" | "color" | "heading" | "parent" | "ancestor";
  readonly value: string;
  readonly negated: boolean;
  readonly field: OutlineSearchField;
}
export interface OutlineSearchPlan {
  /** OR alternatives, each containing an implicit AND of predicates. */
  readonly groups: readonly (readonly OutlineSearchPredicate[])[];
  readonly diagnostics: readonly OutlineSearchDiagnostic[];
}
export interface OutlineSearchParseOptions {
  /** Defaults to 4096; the hard maximum is 65536 UTF-16 code units. */
  readonly maxQueryLength?: number;
  /** Defaults to 128; the hard maximum is 1024 lexical tokens. */
  readonly maxTokens?: number;
}
export interface OutlineSearchOptions<T = unknown> extends OutlineSearchParseOptions {
  readonly getDetails?: OutlineDetailsGetter<T>;
  /** Include this node and its descendants; ancestor predicates still see its real ancestors. */
  readonly scopeId?: string;
  /** Defaults to 1000, hard maximum 10000. Zero is permitted. */
  readonly maxResults?: number;
  /** Defaults to 10000, hard maximum 100000. Includes out-of-scope nodes. */
  readonly maxVisitedNodes?: number;
  /** Per match, across title and note. Defaults to 100, hard maximum 1000. */
  readonly maxMatchRanges?: number;
}
export interface OutlineSearchMatch {
  readonly id: string;
  readonly titleRanges: readonly OutlineSearchRange[];
  readonly noteRanges: readonly OutlineSearchRange[];
}
export interface OutlineSearchResult {
  readonly matches: readonly OutlineSearchMatch[];
  readonly matchedIds: readonly string[];
  /** Nonmatched ancestors needed for context, in document pre-order. */
  readonly contextAncestorIds: readonly string[];
  readonly diagnostics: readonly OutlineSearchDiagnostic[];
  readonly truncated: boolean;
  readonly visitedCount: number;
}

function budget(value: number | undefined, fallback: number, hard: number): number | undefined {
  return value === undefined
    ? fallback
    : Number.isSafeInteger(value) && value >= 0 && value <= hard
      ? value
      : undefined;
}

/**
 * Literal substring search: quoted phrases preserve spaces; a leading - or NOT
 * negates the next predicate. AND (also implicit) binds more tightly than OR.
 * Keywords must be uppercase; quote them to search for them literally.
 * in:title / in:note scope subsequent text in the current OR branch; in:all resets.
 * Parent and ancestor predicates search titles. There are no regexes, parentheses,
 * locale-dependent date predicates, or Unicode normalization in this grammar.
 * Any diagnostic makes a plan invalid; search never runs a partially parsed query.
 */
export function parseOutlineSearch(
  query: string,
  options: OutlineSearchParseOptions = {},
): OutlineSearchPlan {
  const diagnostics: OutlineSearchDiagnostic[] = [];
  const maxLength = budget(options.maxQueryLength, 4096, 65536);
  const maxTokens = budget(options.maxTokens, 128, 1024);
  const fail = (
    code: OutlineSearchDiagnostic["code"],
    message: string,
    start = 0,
    end = query.length,
  ) => {
    diagnostics.push({ code, message, start, end });
  };
  if (maxLength === undefined || maxTokens === undefined) {
    fail("invalid-budget", "Query budgets must be nonnegative integers within their hard limits.");
    return { groups: [], diagnostics };
  }
  if (query.length > maxLength) {
    fail("query-limit", "The query exceeds the configured length limit.");
    return { groups: [], diagnostics };
  }
  const tokens: {
    value: string;
    quoted: boolean;
    negative: boolean;
    start: number;
    end: number;
  }[] = [];
  let cursor = 0;
  while (cursor < query.length) {
    if (/\s/u.test(query[cursor]!)) {
      cursor++;
      continue;
    }
    if (tokens.length >= maxTokens) {
      fail("token-limit", "The query exceeds the configured token limit.", cursor);
      return { groups: [], diagnostics };
    }
    const start = cursor;
    const negative = query[cursor] === "-";
    if (negative) cursor++;
    let value = "",
      quoted = false,
      inQuote = false;
    while (cursor < query.length) {
      const char = query[cursor]!;
      if (!inQuote && /\s/u.test(char)) break;
      if (char === '"') {
        if (!inQuote && (quoted || (value.length > 0 && !value.endsWith(":")))) {
          fail(
            "invalid-query",
            "A quoted phrase must start a term or an operator value.",
            cursor,
            cursor + 1,
          );
        }
        if (inQuote && cursor + 1 < query.length && !/\s/u.test(query[cursor + 1]!)) {
          fail(
            "invalid-query",
            "A quoted phrase must end at a token boundary.",
            cursor,
            cursor + 1,
          );
        }
        quoted = true;
        inQuote = !inQuote;
        cursor++;
        continue;
      }
      if (inQuote && char === "\\" && (query[cursor + 1] === '"' || query[cursor + 1] === "\\")) {
        value += query[cursor + 1];
        cursor += 2;
        continue;
      }
      value += char;
      cursor++;
    }
    if (inQuote) fail("invalid-query", "A quoted phrase is not closed.", start, cursor);
    if (!value) fail("invalid-query", "A search term cannot be empty.", start, cursor);
    tokens.push({ value, quoted, negative, start, end: cursor });
  }
  const groups: OutlineSearchPredicate[][] = [];
  let group: OutlineSearchPredicate[] = [];
  let field: OutlineSearchField = "all",
    negateNext = false,
    needsTerm = false;
  for (const token of tokens) {
    const { value, start, end } = token;
    if (!token.quoted && !token.negative && ["OR", "AND", "NOT"].includes(value)) {
      if (value === "NOT") {
        if (negateNext) fail("invalid-query", "Repeated NOT is not supported.", start, end);
        negateNext = true;
        needsTerm = true;
      } else {
        if (!group.length || needsTerm)
          fail("invalid-query", `${value} needs a predicate on both sides.`, start, end);
        if (value === "OR") {
          groups.push(group);
          group = [];
          field = "all";
        }
        needsTerm = true;
      }
      continue;
    }
    const negated = negateNext !== token.negative;
    negateNext = false;
    const colon = value.indexOf(":");
    let kind: OutlineSearchPredicate["kind"] = "text",
      operand = value;
    // A fully quoted token is literal, including colons. Operator values may be quoted.
    const raw = query.slice(start + (token.negative ? 1 : 0), end);
    if (colon !== -1 && !raw.startsWith('"')) {
      const operator = value.slice(0, colon).toLowerCase();
      operand = value.slice(colon + 1);
      if (operator === "in") {
        if (negated || !["title", "note", "all"].includes(operand)) {
          fail(
            "invalid-query",
            "in: accepts title, note, or all and cannot be negated.",
            start,
            end,
          );
        } else field = operand as OutlineSearchField;
        needsTerm = true;
        continue;
      }
      const recognized = ["is", "has", "color", "heading", "parent", "ancestor"];
      if (!recognized.includes(operator)) {
        fail(
          /date|created|edited|before|after|due|within|since|until/u.test(operator)
            ? "unsupported-operator"
            : "unknown-operator",
          `The ${operator || "empty"}: operator is not supported.`,
          start,
          end,
        );
        continue;
      }
      kind = operator as OutlineSearchPredicate["kind"];
      const valid =
        operand.length > 0 &&
        (kind !== "is" || ["completed", "heading"].includes(operand)) &&
        (kind !== "has" || ["checkbox", "note", "children", "color", "date"].includes(operand)) &&
        (kind !== "heading" || ["1", "2", "3"].includes(operand));
      if (!valid) fail("invalid-query", `Invalid value for ${operator}:.`, start, end);
    }
    group.push({ kind, value: operand, negated, field });
    needsTerm = false;
  }
  if (needsTerm || negateNext)
    fail("invalid-query", "The query ends without a required predicate.");
  if (group.length) groups.push(group);
  return { groups: diagnostics.length ? [] : groups, diagnostics };
}

interface Location<T> {
  readonly node: OutlineNode<T>;
  readonly parent?: Location<T>;
  readonly order: number;
  /** Strict-ancestor matches, inherited once per visited node rather than rewalking paths. */
  readonly ancestorMatches: ReadonlySet<string>;
}
function literalPattern(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu");
}

/**
 * Searches every node regardless of folding, without document or reader-state writes.
 * ECMAScript Unicode simple case-insensitive matching preserves original UTF-16
 * offsets (no normalization, accent stripping, locale folding, or multi-letter folds).
 * Malformed/cyclic/duplicate nodes in the visited prefix fail closed. Budgets return
 * an explicit prefix and diagnostic; truncated results do not certify unseen structure.
 * Consumers must inspect truncated before treating results as exhaustive.
 * Ancestor predicates cost at most one title test per visited node and unique value,
 * including ancestors outside scope. Context paths stop at their first already-known node.
 */
export function searchOutline<T>(
  nodes: readonly OutlineNode<T>[],
  query: string,
  options: OutlineSearchOptions<T> = {},
): OutlineSearchResult {
  const plan = parseOutlineSearch(query, options);
  const patterns = new Map<string, RegExp>();
  const contains = (text: string, value: string): boolean => {
    let pattern = patterns.get(value);
    if (!pattern) {
      pattern = literalPattern(value);
      patterns.set(value, pattern);
    }
    pattern.lastIndex = 0;
    return pattern.test(text);
  };
  const ancestorValues = new Set(
    plan.groups.flatMap((group) =>
      group
        .filter((predicate) => predicate.kind === "ancestor")
        .map((predicate) => predicate.value),
    ),
  );
  const diagnostics = [...plan.diagnostics];
  const maxResults = budget(options.maxResults, 1000, 10000);
  const maxVisits = budget(options.maxVisitedNodes, 10000, 100000);
  const maxRanges = budget(options.maxMatchRanges, 100, 1000);
  const matches: OutlineSearchMatch[] = [];
  const context = new Map<string, Location<T>>();
  let visitedCount = 0,
    truncated = false;
  const result = (): OutlineSearchResult => {
    const matchedIds = matches.map((match) => match.id);
    const matched = new Set(matchedIds);
    return {
      matches,
      matchedIds,
      contextAncestorIds: [...context.values()]
        .filter((entry) => !matched.has(entry.node.id))
        .sort((a, b) => a.order - b.order)
        .map((entry) => entry.node.id),
      diagnostics,
      truncated,
      visitedCount,
    };
  };
  if (maxResults === undefined || maxVisits === undefined || maxRanges === undefined) {
    diagnostics.push({
      code: "invalid-budget",
      message: "Search budgets must be nonnegative integers within their hard limits.",
    });
    return result();
  }
  if (diagnostics.length || !plan.groups.length) return result();
  const invalid = (message: string): OutlineSearchResult => {
    diagnostics.push({ code: "invalid-outline", message });
    matches.length = 0;
    context.clear();
    return result();
  };
  if (!Array.isArray(nodes)) return invalid("Outline roots must be an array.");
  const seen = new Set<object>(),
    ids = new Set<string>();
  const stack: {
    nodes: readonly OutlineNode<T>[];
    index: number;
    parent?: Location<T>;
    inScope: boolean;
  }[] = [{ nodes, index: 0, inScope: options.scopeId === undefined }];
  let foundScope = options.scopeId === undefined;
  while (stack.length) {
    const frame = stack[stack.length - 1]!;
    if (frame.index >= frame.nodes.length) {
      stack.pop();
      continue;
    }
    if (visitedCount >= maxVisits) {
      diagnostics.push({
        code: "visit-limit",
        message: "The visited-node budget was reached; results are incomplete.",
      });
      truncated = true;
      break;
    }
    const node = frame.nodes[frame.index++]!;
    visitedCount++;
    if (
      !node ||
      typeof node !== "object" ||
      Array.isArray(node) ||
      typeof node.id !== "string" ||
      !node.id.trim() ||
      typeof node.text !== "string" ||
      (node.children !== undefined && !Array.isArray(node.children)) ||
      (node.checked !== undefined && typeof node.checked !== "boolean")
    )
      return invalid("An outline node has invalid fields.");
    if (seen.has(node) || ids.has(node.id))
      return invalid("Outline nodes must have unique identities and IDs, without cycles.");
    seen.add(node);
    ids.add(node.id);
    const ancestorMatches = new Set<string>();
    if (frame.parent) {
      for (const value of ancestorValues) {
        if (frame.parent.ancestorMatches.has(value) || contains(frame.parent.node.text, value))
          ancestorMatches.add(value);
      }
    }
    const location: Location<T> = {
      node,
      ...(frame.parent ? { parent: frame.parent } : {}),
      order: visitedCount,
      ancestorMatches,
    };
    const inScope = frame.inScope || node.id === options.scopeId;
    if (node.id === options.scopeId) foundScope = true;
    if (node.children?.length)
      stack.push({ nodes: node.children, index: 0, parent: location, inScope });
    if (!inScope) continue;
    const details = getOutlineItemDetails(node, options.getDetails);
    const note = details.note ?? "";
    const testPredicate = (predicate: OutlineSearchPredicate): boolean => {
      const value = predicate.value;
      let matched = false;
      switch (predicate.kind) {
        case "text":
          matched =
            (predicate.field !== "note" && contains(node.text, value)) ||
            (predicate.field !== "title" && contains(note, value));
          break;
        case "is":
          matched =
            value === "completed" ? details.completed === true : details.heading !== undefined;
          break;
        case "has":
          matched =
            value === "checkbox"
              ? details.checkbox === true
              : value === "note"
                ? note.length > 0
                : value === "children"
                  ? !!node.children?.length
                  : value === "color"
                    ? !!details.color
                    : !!details.dates?.length;
          break;
        case "color":
          matched = details.color?.toLowerCase() === value.toLowerCase();
          break;
        case "heading":
          matched = details.heading === Number(value);
          break;
        case "parent":
          matched = !!location.parent && contains(location.parent.node.text, value);
          break;
        case "ancestor":
          matched = location.ancestorMatches.has(value);
          break;
      }
      return predicate.negated ? !matched : matched;
    };
    const matchingGroups = plan.groups.filter((group) => group.every(testPredicate));
    if (!matchingGroups.length) continue;
    if (matches.length >= maxResults) {
      diagnostics.push({
        code: "result-limit",
        message: "The result budget was reached; more matches exist.",
      });
      truncated = true;
      break;
    }
    const titleRanges: OutlineSearchRange[] = [],
      noteRanges: OutlineSearchRange[] = [];
    let rangeLimited = false;
    const addRanges = (text: string, value: string, target: OutlineSearchRange[]) => {
      const pattern = literalPattern(value);
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text))) {
        const range = { start: match.index, end: match.index + match[0].length };
        if (target.some((existing) => existing.start === range.start && existing.end === range.end))
          continue;
        if (titleRanges.length + noteRanges.length >= maxRanges) {
          rangeLimited = true;
          break;
        }
        target.push(range);
      }
    };
    for (const group of matchingGroups)
      for (const predicate of group) {
        if (predicate.kind !== "text" || predicate.negated) continue;
        if (predicate.field !== "note") addRanges(node.text, predicate.value, titleRanges);
        if (predicate.field !== "title") addRanges(note, predicate.value, noteRanges);
      }
    titleRanges.sort((a, b) => a.start - b.start || a.end - b.end);
    noteRanges.sort((a, b) => a.start - b.start || a.end - b.end);
    matches.push({ id: node.id, titleRanges, noteRanges });
    for (let ancestor = location.parent; ancestor; ancestor = ancestor.parent) {
      // Every earlier insertion also inserted all of its ancestors, so this path is covered.
      if (context.has(ancestor.node.id)) break;
      context.set(ancestor.node.id, ancestor);
    }
    if (rangeLimited) {
      if (!diagnostics.some((entry) => entry.code === "range-limit"))
        diagnostics.push({
          code: "range-limit",
          message: "Some highlight ranges exceeded the per-match budget.",
        });
      truncated = true;
    }
  }
  if (!foundScope && !truncated)
    diagnostics.push({
      code: "scope-not-found",
      message: "The requested search scope does not exist.",
    });
  return result();
}
