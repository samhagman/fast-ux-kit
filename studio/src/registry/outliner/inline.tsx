import * as React from "react";
import { CalendarDays, CornerDownRight, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Inline markup for outline titles and notes. The stored text is always plain source
 * (markdown-lite); formatting is a pure projection of it, so editing,
 * search, export and undo all operate on one canonical string.
 *
 *   **bold**  __italic__  ~~strike~~  `code`  ==highlight==
 *   [label](https://…)  https://bare.url  #tag  @person  !(2026-11-03 14:00)  [[Item title]]
 *   !(2026-11-03 every week)   a recurring date (completing its task moves it to the next occurrence)
 *   \*literal\*              a backslash makes the next markup character literal (pasted text uses it)
 */
export type InlineKind =
  | "text"
  | "bold"
  | "italic"
  | "strike"
  | "code"
  | "highlight"
  | "link"
  | "url"
  | "tag"
  | "mention"
  | "date"
  | "ref"
  /** `\x`: a markup character typed (or pasted) as plain text. The backslash is hidden. */
  | "escape";

export interface InlineSegment {
  readonly kind: InlineKind;
  /** Source range of the whole token, including markup. */
  readonly start: number;
  readonly end: number;
  /** Source range of the visible content. Chips render derived text; see `display`. */
  readonly contentStart: number;
  readonly contentEnd: number;
  readonly display: string;
  readonly href?: string;
  /** Internal link target id, from `[[label|id]]`. */
  readonly refId?: string;
  readonly date?: InlineDate;
}

/** How a recurring date repeats: every `interval` `unit`s, or every weekday (Mon–Fri). */
export interface DateRepeat {
  readonly unit: "day" | "week" | "month" | "year" | "weekday";
  readonly interval: number;
  /**
   * Monthly/yearly: the intended day of the month when the stored date was clamped (Jan 31 ->
   * Feb 28 is written `every month on 31`, so the next step returns to Mar 31, not Mar 28).
   */
  readonly day?: number;
}
export interface InlineDate {
  readonly value: Date;
  readonly hasTime: boolean;
  readonly repeat?: DateRepeat;
}

/** Characters that start inline markup; `\` before one makes it literal. */
export const MARKUP_CHARS = "\\`*_~=[]!#@()";

const PATTERN = new RegExp(
  [
    "(\\\\[\\\\`*_~=\\[\\]!#@()])", // 0 escape (checked first: it wins at its position)
    "(`[^`\\n]+`)", // 1 code
    "(\\*\\*[^*\\n]+\\*\\*)", // 2 bold
    "(__[^_\\n]+__)", // 3 italic
    "(~~[^~\\n]+~~)", // 4 strike
    "(==[^=\\n]+==)", // 5 highlight
    "(\\[\\[[^\\]\\n]+\\]\\])", // 6 internal ref
    // md link: the target may hold balanced parentheses (Wikipedia's Foo_(bar)), as in GFM
    "(\\[[^\\]\\n]+\\]\\((?:https?:\\/\\/|mailto:)(?:[^()\\s]|\\([^()\\s]*\\))+\\))", // 7 md link
    "(!\\(\\d{4}-\\d{2}-\\d{2}(?: \\d{2}:\\d{2})?(?: every [a-z0-9 ]{1,24})?\\))", // 8 date
    // bare url: may end in ")" here; an unbalanced closing paren is trimmed off in parseInline
    "(https?:\\/\\/[^\\s<]*[^\\s<.,;:!?\\]'\"])", // 9 bare url
    "((?<=^|[\\s(])#[\\p{L}\\p{N}_-]+)", // 10 tag
    "((?<=^|[\\s(])@[\\p{L}\\p{N}_.-]*[\\p{L}\\p{N}_-])", // 11 mention
  ].join("|"),
  "gu",
);

const REPEAT_UNITS: Record<string, DateRepeat["unit"]> = {
  day: "day", days: "day", daily: "day",
  week: "week", weeks: "week", weekly: "week",
  month: "month", months: "month", monthly: "month",
  year: "year", years: "year", yearly: "year",
  weekday: "weekday", weekdays: "weekday",
};
/** `week`, `2 weeks`, `weekday`, `month` … (the words after "every"). */
export function parseRepeat(rule: string): DateRepeat | null {
  const match = /^(?:(\d{1,3}) )?([a-z]+)(?: on (\d{1,2}))?$/.exec(rule.trim());
  if (!match) return null;
  const unit = REPEAT_UNITS[match[2]!];
  const interval = match[1] ? Number(match[1]) : 1;
  if (!unit || interval < 1 || (unit === "weekday" && interval !== 1)) return null;
  if (match[3] === undefined) return { unit, interval };
  const day = Number(match[3]);
  if ((unit !== "month" && unit !== "year") || day < 1 || day > 31) return null;
  return { unit, interval, day };
}
/** The rule as people read it: "week", "2 weeks", "weekday" (the anchor day is not repeated). */
export const formatRepeat = (repeat: DateRepeat) =>
  repeat.unit === "weekday" ? "weekday" : repeat.interval === 1 ? repeat.unit : `${repeat.interval} ${repeat.unit}s`;
/** The rule as stored after "every": `formatRepeat` plus the anchor day when there is one. */
export const formatRepeatToken = (repeat: DateRepeat) => formatRepeat(repeat) + (repeat.day ? ` on ${repeat.day}` : "");

export function parseDateToken(token: string): InlineDate | null {
  const match = /^!\((\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?(?: every ([a-z0-9 ]+))?\)$/.exec(token);
  if (!match) return null;
  const [, y, m, d, hh, mm, rule] = match;
  const value = new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0));
  if (Number.isNaN(value.getTime()) || value.getMonth() !== Number(m) - 1) return null;
  if (rule === undefined) return { value, hasTime: hh !== undefined };
  const repeat = parseRepeat(rule);
  return repeat ? { value, hasTime: hh !== undefined, repeat } : null;
}

/** One step of a repeat rule (months clamp to their last day: Jan 31 + 1 month = Feb 28, then back to Mar 31). */
function stepDate(date: Date, repeat: DateRepeat, anchor = date.getDate()): Date {
  const next = new Date(date);
  switch (repeat.unit) {
    case "day":
      next.setDate(next.getDate() + repeat.interval);
      break;
    case "week":
      next.setDate(next.getDate() + 7 * repeat.interval);
      break;
    case "weekday":
      do next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6);
      break;
    case "month":
    case "year": {
      const months = repeat.unit === "month" ? repeat.interval : 12 * repeat.interval;
      next.setDate(1);
      next.setMonth(next.getMonth() + months);
      const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
      next.setDate(Math.min(anchor, last));
      break;
    }
  }
  return next;
}

/**
 * The next occurrence of a recurring date after it is completed: one step from the scheduled
 * day, then further steps until it lands after today, so a late completion never schedules
 * the task in the past (and keeps its weekday / day of month).
 */
export function nextOccurrence(date: InlineDate, now = new Date()): Date {
  if (!date.repeat) return date.value;
  const today = startOfDay(now).getTime();
  const anchor = date.repeat.day ?? date.value.getDate();
  let next = stepDate(date.value, date.repeat, anchor);
  for (let guard = 0; startOfDay(next).getTime() <= today && guard < 5000; guard++) next = stepDate(next, date.repeat, anchor);
  return next;
}

/** The rule to store with an occurrence: monthly/yearly keep the intended day when this one was clamped. */
export function repeatFor(date: Date, repeat: DateRepeat, anchor: number): DateRepeat {
  const { day: _day, ...rule } = repeat;
  return (repeat.unit === "month" || repeat.unit === "year") && date.getDate() < anchor ? { ...rule, day: anchor } : rule;
}

export function parseInline(source: string): readonly InlineSegment[] {
  const segments: InlineSegment[] = [];
  let cursor = 0;
  const text = (start: number, end: number) => {
    if (end > start)
      segments.push({
        kind: "text",
        start,
        end,
        contentStart: start,
        contentEnd: end,
        display: source.slice(start, end),
      });
  };
  PATTERN.lastIndex = 0;
  for (let match = PATTERN.exec(source); match; match = PATTERN.exec(source)) {
    const start = match.index;
    const token = match[0];
    const end = start + token.length;
    text(cursor, start);
    cursor = end;
    const wrap = (kind: InlineKind, open: number, close = open): InlineSegment => ({
      kind,
      start,
      end,
      contentStart: start + open,
      contentEnd: end - close,
      display: token.slice(open, token.length - close),
    });
    if (match[1]) segments.push({ kind: "escape", start, end, contentStart: start + 1, contentEnd: end, display: token.slice(1) });
    else if (match[2]) segments.push(wrap("code", 1));
    else if (match[3]) segments.push(wrap("bold", 2));
    else if (match[4]) segments.push(wrap("italic", 2));
    else if (match[5]) segments.push(wrap("strike", 2));
    else if (match[6]) segments.push(wrap("highlight", 2));
    else if (match[7]) {
      // [[label|id]] links by id (rename-safe); [[label]] falls back to title search.
      const inner = token.slice(2, -2);
      const bar = inner.lastIndexOf("|");
      if (bar > 0)
        segments.push({ kind: "ref", start, end, contentStart: start + 2, contentEnd: start + 2 + bar, display: inner.slice(0, bar), refId: inner.slice(bar + 1) });
      else segments.push(wrap("ref", 2));
    }
    else if (match[8]) {
      const close = token.indexOf("](");
      segments.push({
        kind: "link",
        start,
        end,
        contentStart: start + 1,
        contentEnd: start + close,
        display: token.slice(1, close),
        href: token.slice(close + 2, -1),
      });
    } else if (match[9]) {
      const date = parseDateToken(token);
      if (date) segments.push({ ...wrap("date", 2, 1), date });
      else text(start, end);
    } else if (match[10]) {
      // GFM's rule: a trailing ")" belongs to the URL only while its parentheses balance.
      let url = token;
      while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
      while (/[.,;:!?]$/.test(url)) url = url.slice(0, -1);
      if (url.length < token.length) {
        cursor = start + url.length;
        PATTERN.lastIndex = cursor;
      }
      segments.push({ kind: "url", start, end: start + url.length, contentStart: start, contentEnd: start + url.length, display: url, href: url });
    }
    else if (match[11]) segments.push(wrap("tag", 0));
    else if (match[12]) segments.push(wrap("mention", 0));
  }
  text(cursor, source.length);
  return segments;
}

/**
 * Plain readable text for breadcrumbs, finders, labels and announcements; id links read their
 * target's current title. Dates read relative ("Tomorrow 10:00 AM") unless `dates: "absolute"`
 * ("2026-10-31 10:00 every week"), which anything stored or exported must use.
 */
export function inlineToPlain(
  source: string,
  resolveRef?: (id: string) => string | null,
  options?: { readonly dates?: "relative" | "absolute" },
): string {
  const absolute = options?.dates === "absolute";
  return parseInline(source)
    .map((segment) =>
      segment.kind === "date" && segment.date
        ? absolute
          ? formatDateToken(segment.date.value, segment.date.hasTime, segment.date.repeat).slice(2, -1)
          : formatDate(segment.date) + (segment.date.repeat ? ` every ${formatRepeat(segment.date.repeat)}` : "")
        : segment.refId && resolveRef
          ? (resolveRef(segment.refId) ?? segment.display)
          : segment.display,
    )
    .join("");
}

/**
 * A link's visible title: the target's words without its chips (dates, #tags, @mentions), so an
 * internal link reads "Red-team review", not "Red-team review Sun, Nov 1 @marco #safety".
 */
export function inlineToLabel(source: string): string {
  return parseInline(source)
    .filter((segment) => segment.kind !== "date" && segment.kind !== "tag" && segment.kind !== "mention")
    .map((segment) => segment.display)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Text for screen readers and announcements: id links read their target's title, dates read as
 * words ("due today at 4:00 PM", "due Monday, November 2") instead of the chip's terse label, a
 * #tag reads as "tag launch" (the sigil alone is ambiguous) and an @mention as the name.
 */
export function inlineToSpeech(source: string, resolveRef?: (id: string) => string | null): string {
  return parseInline(source)
    .map((segment) =>
      segment.kind === "date" && segment.date
        ? `due ${spokenDate(segment.date)}${segment.date.repeat ? `, repeats every ${formatRepeat(segment.date.repeat)}` : ""}`
        : segment.kind === "tag"
          ? `tag ${segment.display.slice(1)}`
          : segment.kind === "mention"
            ? segment.display.slice(1)
          : segment.refId && resolveRef
            ? (resolveRef(segment.refId) ?? segment.display)
            : segment.display,
    )
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

export function spokenDate(date: { value: Date; hasTime: boolean }, now = new Date()): string {
  const diff = Math.round((startOfDay(date.value).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const time = date.hasTime ? ` at ${date.value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}` : "";
  const day =
    diff === 0
      ? "today"
      : diff === 1
        ? "tomorrow"
        : diff === -1
          ? "yesterday"
          : date.value.toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
              year: date.value.getFullYear() === now.getFullYear() ? undefined : "numeric",
            });
  return day + time;
}

export function formatDate(date: { value: Date; hasTime: boolean }, now = new Date()): string {
  const day = startOfDay(date.value).getTime();
  const today = startOfDay(now).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const time = date.hasTime
    ? " " + date.value.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : "";
  if (diff === 0) return "Today" + time;
  if (diff === 1) return "Tomorrow" + time;
  if (diff === -1) return "Yesterday" + time;
  const sameYear = date.value.getFullYear() === now.getFullYear();
  return (
    date.value.toLocaleDateString(undefined, {
      weekday: Math.abs(diff) < 7 ? "short" : undefined,
      month: "short",
      day: "numeric",
      year: sameYear ? undefined : "numeric",
    }) + time
  );
}

export function dateTone(date: Date, now = new Date()): "overdue" | "today" | "soon" | "later" {
  const diff = Math.round((startOfDay(date).getTime() - startOfDay(now).getTime()) / 86_400_000);
  return diff < 0 ? "overdue" : diff === 0 ? "today" : diff <= 3 ? "soon" : "later";
}

export function formatDateToken(date: Date, withTime = false, repeat?: DateRepeat): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `!(${day}${withTime ? ` ${pad(date.getHours())}:${pad(date.getMinutes())}` : ""}${repeat ? ` every ${formatRepeatToken(repeat)}` : ""})`;
}

/**
 * Text as literal outline source: every character that would start markup gets a backslash, so
 * pasted text from another app never turns into formatting or links by accident. Bare URLs,
 * #tags and @mentions stay live (they are words, not markers).
 */
export function literalInline(text: string): string {
  let out = "";
  let rest = text;
  for (let guard = 0; guard < 10_000; guard++) {
    const marker = parseInline(rest).find((segment) => !LIVE_KINDS.has(segment.kind));
    if (!marker) return out + rest;
    out += rest.slice(0, marker.start) + "\\" + rest[marker.start];
    rest = rest.slice(marker.start + 1);
  }
  return out + rest;
}
const LIVE_KINDS = new Set<InlineKind>(["text", "url", "tag", "mention"]);

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

export interface InlineRange {
  readonly start: number;
  readonly end: number;
}

interface InlineTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  readonly source: string;
  /** Source offsets to highlight, e.g. search matches. */
  readonly marks?: readonly InlineRange[];
  readonly onTag?: (tag: string) => void;
  readonly onRef?: (title: string, id?: string) => void;
  readonly onDate?: (segment: InlineSegment, el: HTMLElement) => void;
  /**
   * The live title SOURCE of a `[[label|id]]` target (null: deleted). The link shows its words
   * without chips on one line (`inlineToLabel`); the full plain title is its tooltip.
   */
  readonly resolveRef?: (id: string) => string | null;
}

/**
 * Formatted projection of an inline source string. Each visible run carries its source
 * offset in `data-src` so a pointer position maps back to an exact caret.
 */
export const InlineText = React.memo(function InlineText({
  source,
  marks,
  onTag,
  onRef,
  onDate,
  resolveRef,
  className,
  ...props
}: InlineTextProps) {
  const segments = React.useMemo(() => parseInline(source), [source]);
  return (
    // dir="auto": a Latin title inside an RTL outline (or the reverse) keeps its own order.
    <span dir="auto" className={cn("whitespace-pre-wrap break-words", className)} {...props}>
      {segments.map((segment) => (
        <Segment
          key={segment.start}
          segment={segment}
          marks={marks}
          onTag={onTag}
          onRef={onRef}
          onDate={onDate}
          resolveRef={resolveRef}
        />
      ))}
    </span>
  );
});

function Runs({
  segment,
  marks,
}: {
  readonly segment: InlineSegment;
  readonly marks?: readonly InlineRange[];
}) {
  const { contentStart: from, contentEnd: to, display } = segment;
  const hits = (marks ?? [])
    .map((mark) => ({ start: Math.max(mark.start, from), end: Math.min(mark.end, to) }))
    .filter((mark) => mark.end > mark.start)
    .sort((a, b) => a.start - b.start);
  if (!hits.length) return <span data-src={from}>{display}</span>;
  const out: React.ReactNode[] = [];
  let at = from;
  for (const hit of hits) {
    if (hit.start > at)
      out.push(
        <span key={`t${at}`} data-src={at}>
          {display.slice(at - from, hit.start - from)}
        </span>,
      );
    out.push(
      <mark
        key={`m${hit.start}`}
        data-src={hit.start}
        className="rounded-[3px] bg-warning/30 text-inherit ring-1 ring-warning/40 dark:bg-warning/25"
      >
        {display.slice(hit.start - from, hit.end - from)}
      </mark>,
    );
    at = hit.end;
  }
  if (at < to)
    out.push(
      <span key={`t${at}`} data-src={at}>
        {display.slice(at - from)}
      </span>,
    );
  return <>{out}</>;
}

const stop = (event: React.SyntheticEvent) => event.stopPropagation();

function Segment({
  segment,
  marks,
  onTag,
  onRef,
  onDate,
  resolveRef,
}: {
  readonly segment: InlineSegment;
  readonly marks?: readonly InlineRange[];
  readonly resolveRef?: (id: string) => string | null;
  readonly onTag?: (tag: string) => void;
  readonly onRef?: (title: string, id?: string) => void;
  readonly onDate?: (segment: InlineSegment, el: HTMLElement) => void;
}) {
  const runs = <Runs segment={segment} marks={marks} />;
  switch (segment.kind) {
    case "text":
    case "escape":
      return runs;
    case "bold":
      return <strong className="font-semibold">{runs}</strong>;
    case "italic":
      return <em className="italic">{runs}</em>;
    case "strike":
      return <s className="text-muted-foreground decoration-muted-foreground/70">{runs}</s>;
    case "code":
      return (
        <code className="rounded-[4px] border border-hairline bg-muted px-1 py-px font-mono text-[0.86em] text-foreground/90">
          {runs}
        </code>
      );
    case "highlight":
      return (
        <span className="rounded-[3px] bg-signal-muted px-0.5 text-foreground">
          {runs}
        </span>
      );
    case "link":
    case "url":
      return (
        <a
          href={segment.href}
          target="_blank"
          rel="noreferrer noopener"
          onPointerDown={stop}
          onClick={stop}
          className="text-signal underline decoration-signal/35 underline-offset-[3px] transition-colors hover:decoration-signal"
        >
          {segment.kind === "url" ? (
            <span data-src={segment.contentStart}>{shortUrl(segment.display)}</span>
          ) : (
            runs
          )}
        </a>
      );
    case "tag":
    case "mention":
      return (
        <button
          type="button"
          tabIndex={-1}
          dir="auto"
          data-src={segment.contentStart}
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            onTag?.(segment.display);
          }}
          className={cn(
            "inline rounded-[4px] px-0.5 font-medium transition-colors",
            segment.kind === "tag"
              ? "text-signal hover:bg-signal-muted"
              : "text-foreground/80 hover:bg-muted",
          )}
        >
          <Runs segment={segment} marks={marks} />
        </button>
      );
    case "ref": {
      const live = segment.refId && resolveRef ? resolveRef(segment.refId) : undefined;
      const missing = live === null;
      const label = live ? inlineToLabel(live) || inlineToPlain(live) : undefined;
      return (
        <button
          type="button"
          tabIndex={-1}
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            onRef?.(segment.display, segment.refId);
          }}
          title={missing ? "Linked item was deleted" : live ? inlineToPlain(live) : undefined}
          className={cn(
            "inline-flex max-w-full items-baseline gap-0.5 rounded-[4px] px-0.5 align-bottom underline decoration-dotted underline-offset-[3px]",
            missing ? "text-muted-foreground line-through" : "text-signal hover:bg-signal-muted",
          )}
        >
          <CornerDownRight aria-hidden className="size-3 shrink-0 self-center opacity-70" />
          {label ? (
            <span data-src={segment.contentStart} className="min-w-0 max-w-[32ch] truncate">
              {label}
            </span>
          ) : (
            runs
          )}
        </button>
      );
    }
    case "date": {
      const tone = segment.date ? dateTone(segment.date.value) : "later";
      // A date filter (due:, before:, after:) marks the whole token: the chip lights up like a text match.
      const marked = marks?.some((mark) => mark.start < segment.end && mark.end > segment.start);
      return (
        <button
          type="button"
          tabIndex={-1}
          dir="auto"
          data-src={segment.contentStart}
          data-repeat={segment.date?.repeat ? formatRepeat(segment.date.repeat) : undefined}
          title={segment.date?.repeat ? `Repeats every ${formatRepeat(segment.date.repeat)}` : undefined}
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            onDate?.(segment, event.currentTarget);
          }}
          className={cn(
            "mx-px inline-flex translate-y-[-1px] items-center gap-1 rounded-[5px] border px-1.5 align-middle text-[11.5px] leading-[18px] font-medium tabular-nums transition-colors",
            tone === "overdue" && "border-destructive/25 bg-destructive/8 text-destructive",
            tone === "today" && "border-signal/30 bg-signal-muted text-signal",
            tone === "soon" && "border-warning/30 bg-warning/10 text-foreground/85",
            tone === "later" && "border-border bg-muted/60 text-muted-foreground",
            marked && "ring-2 ring-warning/45 ring-offset-0",
          )}
        >
          {segment.date?.repeat ? <Repeat aria-hidden className="size-3" /> : <CalendarDays aria-hidden className="size-3" />}
          {segment.date ? formatDate(segment.date) : segment.display}
        </button>
      );
    }
  }
}

function shortUrl(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname === "/" ? "" : parsed.pathname;
    const value = parsed.host.replace(/^www\./, "") + path;
    return value.length > 42 ? value.slice(0, 40) + "…" : value;
  } catch {
    return url;
  }
}


/** Map a viewport point inside an InlineText to a caret offset in its source string. */
export function sourceOffsetFromPoint(
  root: HTMLElement,
  x: number,
  y: number,
  sourceLength: number,
): number {
  const doc = root.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const position = doc.caretPositionFromPoint(x, y);
    node = position?.offsetNode ?? null;
    offset = position?.offset ?? 0;
  } else if (doc.caretRangeFromPoint) {
    const range = doc.caretRangeFromPoint(x, y);
    node = range?.startContainer ?? null;
    offset = range?.startOffset ?? 0;
  }
  if (!node || !root.contains(node)) return sourceLength;
  const owner = (node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element))?.closest<HTMLElement>(
    "[data-src]",
  );
  if (!owner || !root.contains(owner)) return sourceLength;
  const base = Number(owner.dataset.src);
  if (owner.tagName === "BUTTON") return base;
  return Math.min(sourceLength, base + (node.nodeType === Node.TEXT_NODE ? offset : 0));
}
