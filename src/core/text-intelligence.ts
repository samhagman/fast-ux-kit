/** All coordinates are UTF-16 code-unit offsets, end-exclusive and local to one text surface. */
export interface TextRange {
  readonly start: number;
  readonly end: number;
}
export interface TextClassification extends TextRange {
  readonly kind: string;
}
export interface TextDiagnostic extends TextRange {
  readonly severity: "error" | "warning" | "information" | "hint";
  readonly message: string;
  readonly code?: string;
}
export interface TextAnalysis {
  readonly text: string;
  readonly classifications?: readonly TextClassification[];
  readonly diagnostics?: readonly TextDiagnostic[];
}
export interface TextCompletion {
  readonly id: string;
  readonly label: string;
  readonly insertText?: string;
  readonly detail?: string;
  readonly kind?: string;
  readonly matchText?: string;
}
export interface TextCompletionOffer {
  readonly range: TextRange;
  readonly items: readonly TextCompletion[];
}
export interface TextRequestContext {
  readonly surfaceId: string;
  readonly rowId: string;
  readonly text: string;
  readonly revision: number;
  readonly selection: TextRange;
}
export interface TextCompletionRequest extends TextRequestContext {
  readonly reason: "explicit" | "input";
  readonly signal: AbortSignal;
}
export interface TextHoverRequest extends TextRequestContext {
  readonly offset: number;
  readonly origin: "pointer" | "keyboard";
  readonly signal: AbortSignal;
}
export interface TextCompletionProvider {
  readonly id: string;
  readonly complete: (
    request: TextCompletionRequest,
  ) => TextCompletionOffer | null | Promise<TextCompletionOffer | null>;
  readonly shouldTrigger?: (context: TextRequestContext) => boolean;
}
export interface TextEdit extends TextRange {
  readonly text: string;
}

export function validTextRange(range: TextRange, text: string, allowEmpty = true): boolean {
  return (
    !!range &&
    Number.isInteger(range.start) &&
    Number.isInteger(range.end) &&
    range.start >= 0 &&
    range.end >= range.start &&
    range.end <= text.length &&
    (allowEmpty || range.end > range.start)
  );
}
export function sameTextContext(a: TextRequestContext, b: TextRequestContext): boolean {
  return (
    a.surfaceId === b.surfaceId &&
    a.rowId === b.rowId &&
    a.revision === b.revision &&
    a.text === b.text &&
    a.selection.start === b.selection.start &&
    a.selection.end === b.selection.end
  );
}
export function diagnosticsAt(
  diagnostics: readonly TextDiagnostic[],
  offset: number,
): readonly TextDiagnostic[] {
  return diagnostics.filter((item) =>
    item.start === item.end ? item.start === offset : item.start <= offset && offset < item.end,
  );
}
export function currentTextAnalysis(
  analysis: TextAnalysis | undefined,
  text: string,
): TextAnalysis | undefined {
  if (analysis?.text !== text) return undefined;
  return {
    text,
    classifications: analysis.classifications?.filter((item) => validTextRange(item, text, false)),
    diagnostics: analysis.diagnostics?.filter((item) => validTextRange(item, text)),
  };
}

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase();
export function filterCompletions(
  items: readonly TextCompletion[],
  query: string,
  replacedText?: string,
): readonly TextCompletion[] {
  const needle = normalized(query);
  const prefix: TextCompletion[] = [],
    interior: TextCompletion[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.id !== "string" ||
      !item.id ||
      seen.has(item.id) ||
      typeof item.label !== "string" ||
      (item.insertText !== undefined && typeof item.insertText !== "string") ||
      (item.matchText !== undefined && typeof item.matchText !== "string")
    )
      continue;
    seen.add(item.id);
    if (replacedText !== undefined && (item.insertText ?? item.label) === replacedText) continue;
    const candidate = normalized(item.matchText ?? item.label);
    if (candidate.startsWith(needle)) prefix.push(item);
    else if (candidate.includes(needle)) interior.push(item);
  }
  return [...prefix, ...interior];
}
export function acceptTextCompletion(
  text: string,
  offer: TextCompletionOffer,
  item: TextCompletion,
): { readonly text: string; readonly caret: number } | null {
  if (!validTextRange(offer.range, text)) return null;
  const replacement = item.insertText ?? item.label;
  return {
    text: text.slice(0, offer.range.start) + replacement + text.slice(offer.range.end),
    caret: offer.range.start + replacement.length,
  };
}

/** Classification touched by an edit is invalidated; unaffected ranges move with their text. */
export function mapTextRanges<T extends TextRange>(
  ranges: readonly T[],
  edit: TextEdit,
): readonly T[] {
  const delta = edit.text.length - (edit.end - edit.start);
  return ranges.flatMap((range) => {
    if (range.end <= edit.start) return [range];
    if (range.start >= edit.end)
      return [{ ...range, start: range.start + delta, end: range.end + delta }];
    return [];
  });
}
export interface TextSegment<T extends TextRange> extends TextRange {
  readonly text: string;
  readonly layers: readonly T[];
}
/** One flat segmentation handles overlapping layers without generating invalid nested markup. */
export function segmentText<T extends TextRange>(
  text: string,
  ranges: readonly T[],
): readonly TextSegment<T>[] {
  const usable = ranges.filter((range) => validTextRange(range, text, false));
  const boundaries = [
    ...new Set([0, text.length, ...usable.flatMap((range) => [range.start, range.end])]),
  ].sort((a, b) => a - b);
  return boundaries.slice(0, -1).map((start, index) => {
    const end = boundaries[index + 1]!;
    return {
      start,
      end,
      text: text.slice(start, end),
      layers: usable.filter((range) => range.start <= start && range.end >= end),
    };
  });
}

export interface TextReference extends TextRange {
  readonly trigger: string;
  readonly spelling: string;
}
export interface ReferenceEntity {
  readonly id: string;
  readonly spelling: string;
  readonly label?: string;
  readonly description?: string;
}
export interface ReferenceOptions {
  readonly triggers?: readonly string[];
  readonly exclusions?: readonly TextRange[];
  readonly boundary?: (previous: string | undefined) => boolean;
}
const referenceCharacter = /[\p{L}\p{M}\p{N}_\-]/u;
/** Recognition is plain text. Parsed hosts should provide syntax-aware exclusions. */
export function recognizeTextReferences(
  text: string,
  {
    triggers = ["@", "#"],
    exclusions = [],
    boundary = (previous) => previous === undefined || /\s|[([{]/u.test(previous),
  }: ReferenceOptions = {},
): readonly TextReference[] {
  const result: TextReference[] = [];
  for (let start = 0; start < text.length;) {
    const trigger = triggers.find((item) => item.length > 0 && text.startsWith(item, start));
    if (
      !trigger ||
      !boundary(start === 0 ? undefined : [...text.slice(0, start)].at(-1)) ||
      exclusions.some((range) => range.start <= start && start < range.end)
    ) {
      start += text.codePointAt(start)! > 0xffff ? 2 : 1;
      continue;
    }
    let end = start + trigger.length;
    for (const char of text.slice(end)) {
      if (!referenceCharacter.test(char)) break;
      end += char.length;
    }
    if (
      end > start + trigger.length &&
      !exclusions.some((range) => start < range.end && end > range.start)
    )
      result.push({ start, end, trigger, spelling: text.slice(start + trigger.length, end) });
    start = Math.max(end, start + trigger.length);
  }
  return result;
}

export function createReferenceCompletionProvider({
  id,
  trigger,
  entities,
  exclusions,
}: {
  readonly id: string;
  readonly trigger: string;
  readonly entities:
    readonly ReferenceEntity[] | ((context: TextRequestContext) => readonly ReferenceEntity[]);
  readonly exclusions?: (context: TextRequestContext) => readonly TextRange[];
}): TextCompletionProvider {
  const offer = (context: TextRequestContext): TextCompletionOffer | null => {
    if (context.selection.start !== context.selection.end) return null;
    const offset = context.selection.start;
    const blocked = exclusions?.(context) ?? [];
    if (blocked.some((range) => range.start <= offset && offset < range.end)) return null;
    let start = offset;
    while (start > 0) {
      const char = [...context.text.slice(0, start)].at(-1)!;
      if (!referenceCharacter.test(char)) break;
      start -= char.length;
    }
    start -= trigger.length;
    if (
      start < 0 ||
      context.text.slice(start, start + trigger.length) !== trigger ||
      (start > 0 && !/\s|[([{]/u.test([...context.text.slice(0, start)].at(-1)!))
    )
      return null;
    let end = offset;
    for (const char of context.text.slice(end)) {
      if (!referenceCharacter.test(char)) break;
      end += char.length;
    }
    const source = typeof entities === "function" ? entities(context) : entities;
    return {
      range: { start, end },
      items: source.map((entity) => ({
        id: entity.id,
        label: `${trigger}${entity.label ?? entity.spelling}`,
        insertText: `${trigger}${entity.spelling}`,
        matchText: `${trigger}${entity.spelling} ${entity.label ?? ""}`,
        ...(entity.description ? { detail: entity.description } : {}),
      })),
    };
  };
  return { id, shouldTrigger: (context) => offer(context) !== null, complete: offer };
}

export interface TextSnippet extends TextRange {
  readonly text: string;
  readonly truncatedStart: boolean;
  readonly truncatedEnd: boolean;
}
export function extractTextSnippets(
  text: string,
  ranges: readonly TextRange[],
  context = 40,
): readonly TextSnippet[] {
  const padding = Number.isFinite(context) ? Math.max(0, Math.floor(context)) : 40;
  const windows = ranges
    .filter((range) => validTextRange(range, text, false))
    .map((range) => ({
      start: Math.max(0, range.start - padding),
      end: Math.min(text.length, range.end + padding),
    }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const window of windows) {
    const last = merged.at(-1);
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged.map(({ start, end }) => ({
    start,
    end,
    text: text.slice(start, end),
    truncatedStart: start > 0,
    truncatedEnd: end < text.length,
  }));
}
