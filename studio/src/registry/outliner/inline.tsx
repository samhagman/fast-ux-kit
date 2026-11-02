import * as React from "react";
import { CalendarDays, CalendarRange, CornerDownRight, Repeat } from "lucide-react";
import { cn } from "@/lib/utils";
import { MathTex } from "./math";

/**
 * Inline markup for outline titles and notes. The stored text is always plain source
 * (markdown-lite); formatting is a pure projection of it, so editing,
 * search, export and undo all operate on one canonical string.
 *
 *   **bold**  *italic*  ~~strike~~  `code`  ==highlight==  (also __italic__)
 *   Styles nest, one of each kind at a time: **bold *and italic***, ~~**a** b~~, ***both***.
 *   Code, links, dates, tags, mentions and math inside a style keep working: **see `x` #now**.
 *   [label](https://…)  https://bare.url  #tag  @person  !(2026-11-03 14:00)  [[Item title]]
 *   !(2026-11-03 every week)   a recurring date (completing its task moves it to the next occurrence)
 *   !(2026-11-03 → 2026-11-07)  a date range (also with times: `!(2026-11-03 09:00 → 11:00)`,
 *                           `!(2026-11-03 22:00 → 2026-11-04 06:00)`; `->` reads as `→`)
 *   $e^{i\pi}+1=0$          inline math (TeX, rendered by KaTeX; see math.tsx). Currency is safe:
 *                           the opening $ needs a non-space after it, the closing one a non-space
 *                           before it and no digit after it, so "$5 and $10" stays text
 *   \*literal\*              a backslash makes the next markup character literal (pasted text uses it)
 */
export type InlineKind =
  | "text"
  | "code"
  | "link"
  | "url"
  | "tag"
  | "mention"
  | "date"
  | "ref"
  /** `$tex$` (or `$$tex$$`): TeX source in `display`, rendered with KaTeX. */
  | "math"
  /** `\x`: a markup character typed (or pasted) as plain text. The backslash is hidden. */
  | "escape"
  /** A style's delimiter (`**`, `*`, `__`, `~~`, `==`): source only, never displayed. */
  | "delimiter";

/** A style that wraps other segments. Styles nest, but never inside one of their own kind. */
export type InlineStyle = "bold" | "italic" | "strike" | "highlight";

/** One style container: its kind and source range. Segments inside it list it in `marks`. */
export interface InlineMark {
  readonly kind: InlineStyle;
  /** Unique within one parse: segments that list the same id sit in the same container. */
  readonly id: number;
  /** Source range of the whole container, delimiters included. */
  readonly start: number;
  readonly end: number;
  /** Source range between the delimiters. */
  readonly contentStart: number;
  readonly contentEnd: number;
}

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
  /** The style containers around this segment, outermost first; absent outside any style. */
  readonly marks?: readonly InlineMark[];
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
  /**
   * The time of day as written (`[hours, minutes]`). It differs from `value`'s clock only when
   * that wall time does not exist that day (a daylight-saving gap: 02:30 becomes 03:30), and it is
   * what a recurring date keeps, so one spring-forward never moves a 02:30 task for good.
   */
  readonly time?: readonly [number, number];
  /** A range's last moment (`!(start → end)`); ranges never repeat. */
  readonly end?: Date;
  /** The range end names a time of day (not the whole day). */
  readonly endHasTime?: boolean;
}

/** Characters that start inline markup; `\` before one makes it literal. */
export const MARKUP_CHARS = "\\`*_~=[]!#@()$";

/** Leaf tokens: each is one segment, matched where it starts. */
const LEAF = {
  escape: "(\\\\[\\\\`*_~=\\[\\]!#@()$])",
  code: "(`[^`\\n]+`)",
  ref: "(\\[\\[[^\\]\\n]+\\]\\])",
  // md link: the target may hold balanced parentheses (Wikipedia's Foo_(bar)), as in GFM
  link: "(\\[[^\\]\\n]+\\]\\((?:https?:\\/\\/|mailto:)(?:[^()\\s]|\\([^()\\s]*\\))+\\))",
  // a date, a range, or a recurring date
  date: "(!\\(\\d{4}-\\d{2}-\\d{2}(?: \\d{2}:\\d{2})?(?: ?(?:→|->) ?(?:\\d{4}-\\d{2}-\\d{2}(?: \\d{2}:\\d{2})?|\\d{2}:\\d{2}))?(?: every [a-z0-9 ]{1,24})?\\))",
  // bare url: may end in ")" here; an unbalanced closing paren is trimmed off when it is read
  url: "(https?:\\/\\/[^\\s<]*[^\\s<.,;:!?\\]'\"])",
  tag: "((?<=^|[\\s(])#[\\p{L}\\p{N}_-]+)",
  mention: "((?<=^|[\\s(])@[\\p{L}\\p{N}_.-]*[\\p{L}\\p{N}_-])",
  math: "((?<![\\p{L}\\p{N}$\\\\])(?:\\$\\$[^$\\n]+?\\$\\$|\\$(?![\\s$])[^$\\n]*?[^\\s$\\\\]\\$)(?![\\p{N}$]))",
} as const;

/**
 * The scanner's alternation. At each position the earliest alternative wins; a style shows up
 * here as its opening delimiter only, and the scanner decides from there whether it closes.
 */
const SCAN = new RegExp(
  [
    LEAF.escape, // 1 (checked first: it wins at its position)
    LEAF.code, // 2
    "(\\*\\*)", // 3 bold, or bold + italic (`***`)
    "(__)", // 4 italic
    "(~~)", // 5 strike
    "(==)", // 6 highlight
    LEAF.ref, // 7
    LEAF.link, // 8
    LEAF.date, // 9
    LEAF.url, // 10
    LEAF.tag, // 11
    LEAF.mention, // 12
    LEAF.math, // 13
    "(\\*)", // 14 italic (last: a single star is the weakest opener)
  ].join("|"),
  "gu",
);
const GROUP = { escape: 1, code: 2, stars: 3, under: 4, strike: 5, highlight: 6, ref: 7, link: 8, date: 9, url: 10, tag: 11, mention: 12, math: 13, star: 14 } as const;
/** Words that stay live in pasted text (`literalInline`): bare URLs, #tags and @mentions. */
const LIVE_WORDS = new RegExp([LEAF.url, LEAF.tag, LEAF.mention].join("|"), "gu");
/** The same words, matched only at the start of a string. */
const WORD_AT = {
  url: new RegExp(LEAF.url, "uy"),
  tag: new RegExp(LEAF.tag, "uy"),
  mention: new RegExp(LEAF.mention, "uy"),
} as const;
const wordAt = (kind: keyof typeof WORD_AT, text: string) => {
  const pattern = WORD_AT[kind];
  pattern.lastIndex = 0;
  return pattern.exec(text)?.[0] ?? null;
};

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
  const match =
    /^!\((\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?(?: ?(?:→|->) ?(?:(\d{4})-(\d{2})-(\d{2}))?(?: ?(\d{2}):(\d{2}))?)?(?: every ([a-z0-9 ]+))?\)$/.exec(token);
  if (!match) return null;
  const [, y, m, d, hh, mm, ey, em, ed, eh, emin, rule] = match;
  const value = localDate(y!, m!, d!, hh, mm);
  if (!value) return null;
  const time = hh !== undefined ? ([Number(hh), Number(mm)] as const) : undefined;
  const base = { value, hasTime: hh !== undefined, ...(time ? { time } : {}) };
  const ranged = ey !== undefined || eh !== undefined;
  if (ranged) {
    // `→ 11:00` ends the same day, or the next one when it is earlier than the start (an
    // overnight `22:00 → 02:00`); a bare `→` with nothing after it is not a range.
    if (rule !== undefined || (ey === undefined && hh === undefined)) return null;
    let end = ey !== undefined ? localDate(ey, em!, ed!, eh, emin) : localDate(y!, m!, d!, eh, emin);
    if (!end) return null;
    if (ey === undefined && end.getTime() < value.getTime()) end = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1, Number(eh), Number(emin));
    const endHasTime = eh !== undefined;
    // A date-only end means the end of that day; an end before the start is not a range.
    const last = endHasTime ? end : new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999);
    if (last.getTime() < value.getTime()) return null;
    return { ...base, end, endHasTime };
  }
  if (rule === undefined) return base;
  const repeat = parseRepeat(rule);
  return repeat ? { ...base, repeat } : null;
}

/** A local calendar date (and wall time); null when the day does not exist (Feb 30). */
function localDate(y: string, m: string, d: string, hh?: string, mm?: string): Date | null {
  if (hh !== undefined && (Number(hh) > 23 || Number(mm) > 59)) return null;
  const value = new Date(Number(y), Number(m) - 1, Number(d), Number(hh ?? 0), Number(mm ?? 0));
  if (Number.isNaN(value.getTime()) || value.getMonth() !== Number(m) - 1 || value.getDate() !== Number(d)) return null;
  return value;
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

/**
 * Parse inline source into a flat list of segments in source order. Styles do not become
 * segments of their own: every segment inside one lists it in `marks` (outermost first), and its
 * delimiters are `delimiter` segments. Walk the list as a tree with `walkNested`.
 *
 * One left-to-right scan. At each position the earliest alternative of `SCAN` wins, so a style
 * that starts first contains what follows. A style's content is scanned the same way within its
 * bounds, with its own kind excluded; every scan only moves forward, so the parse is linear.
 */
export function parseInline(source: string): readonly InlineSegment[] {
  const scan: Scan = { source, out: [], ids: 0 };
  scanRange(scan, 0, source.length, 0, []);
  return scan.out;
}

interface Scan {
  readonly source: string;
  readonly out: InlineSegment[];
  ids: number;
}

/** Delimiter lengths and where the closing one starts, for a style that matched. */
interface Closed {
  readonly open: number;
  readonly closeStart: number;
  readonly close: number;
}

const STYLE_BIT: Record<InlineStyle, number> = { bold: 1, italic: 2, strike: 4, highlight: 8 };
const isWord = (char: string | undefined) => char !== undefined && /[\p{L}\p{N}]/u.test(char);
const isSpace = (char: string | undefined) => char !== undefined && /\s/u.test(char);

function scanRange(scan: Scan, lo: number, hi: number, excluded: number, marks: readonly InlineMark[]) {
  const { source, out } = scan;
  let cursor = lo;
  let pos = lo;
  const pushText = (from: number, to: number) => {
    if (to > from) out.push(withMarks({ kind: "text", start: from, end: to, contentStart: from, contentEnd: to, display: source.slice(from, to) }, marks));
  };
  const pushLeaf = (segment: InlineSegment) => {
    pushText(cursor, segment.start);
    out.push(withMarks(segment, marks));
    cursor = pos = segment.end;
  };
  const pushStyle = (kind: InlineStyle, start: number, closed: Closed) => {
    pushText(cursor, start);
    const mark: InlineMark = { kind, id: scan.ids++, start, contentStart: start + closed.open, contentEnd: closed.closeStart, end: closed.closeStart + closed.close };
    const inside = [...marks, mark];
    out.push({ kind: "delimiter", start, end: mark.contentStart, contentStart: mark.contentStart, contentEnd: mark.contentStart, display: "", marks: inside });
    scanRange(scan, mark.contentStart, mark.contentEnd, excluded | STYLE_BIT[kind], inside);
    out.push({ kind: "delimiter", start: mark.contentEnd, end: mark.end, contentStart: mark.end, contentEnd: mark.end, display: "", marks: inside });
    cursor = pos = mark.end;
  };
  // A #tag or @mention may open a style's content (`**#launch**`), where nothing precedes it.
  if (marks.length && (source[lo] === "#" || source[lo] === "@")) {
    const word = wordAt(source[lo] === "#" ? "tag" : "mention", source.slice(lo, hi));
    if (word) pushLeaf({ kind: source[lo] === "#" ? "tag" : "mention", start: lo, end: lo + word.length, contentStart: lo, contentEnd: lo + word.length, display: word });
  }
  while (pos < hi) {
    SCAN.lastIndex = pos;
    const match = SCAN.exec(source);
    if (!match || match.index >= hi) break;
    const start = match.index;
    if (match[GROUP.stars] || match[GROUP.star]) {
      const bold = match[GROUP.stars] && !(excluded & STYLE_BIT.bold) ? closeBold(source, start, lo, hi, excluded) : null;
      const italic = bold || excluded & STYLE_BIT.italic ? null : closeItalic(source, start, lo, hi, excluded);
      if (bold) pushStyle("bold", start, bold);
      else if (italic) pushStyle("italic", start, italic);
      else pos = start + 1;
      continue;
    }
    const double = match[GROUP.under] ? "italic" : match[GROUP.strike] ? "strike" : match[GROUP.highlight] ? "highlight" : null;
    if (double) {
      const closed = excluded & STYLE_BIT[double] ? null : closeDouble(source, start, hi);
      if (closed) pushStyle(double, start, closed);
      else pos = start + 1;
      continue;
    }
    let token = match[0];
    if (start + token.length > hi) {
      // The style around it ends first. A bare URL, #tag or @mention ends there too; a token
      // with its own closer (code, link, date, ref, math) cannot cross a style's edge.
      const kind = match[GROUP.url] ? "url" : match[GROUP.tag] ? "tag" : match[GROUP.mention] ? "mention" : null;
      const clipped = kind ? wordAt(kind, source.slice(start, hi)) : null;
      if (!clipped) {
        pos = start + 1;
        continue;
      }
      token = clipped;
    }
    pushLeaf(leafOf(match, token, start));
  }
  pushText(cursor, hi);
}

const withMarks = (segment: InlineSegment, marks: readonly InlineMark[]): InlineSegment => (marks.length ? { ...segment, marks } : segment);

/** The segment for a leaf token that starts at `start` (`match` tells which alternative it is). */
function leafOf(match: RegExpExecArray, token: string, start: number): InlineSegment {
  const end = start + token.length;
  const wrap = (kind: InlineKind, open: number, close = open): InlineSegment => ({
    kind,
    start,
    end,
    contentStart: start + open,
    contentEnd: end - close,
    display: token.slice(open, token.length - close),
  });
  if (match[GROUP.escape]) return { kind: "escape", start, end, contentStart: start + 1, contentEnd: end, display: token.slice(1) };
  if (match[GROUP.code]) return wrap("code", 1);
  if (match[GROUP.ref]) {
    // [[label|id]] links by id (rename-safe); [[label]] falls back to title search.
    const inner = token.slice(2, -2);
    const bar = inner.lastIndexOf("|");
    return bar > 0
      ? { kind: "ref", start, end, contentStart: start + 2, contentEnd: start + 2 + bar, display: inner.slice(0, bar), refId: inner.slice(bar + 1) }
      : wrap("ref", 2);
  }
  if (match[GROUP.link]) {
    const close = token.indexOf("](");
    return { kind: "link", start, end, contentStart: start + 1, contentEnd: start + close, display: token.slice(1, close), href: token.slice(close + 2, -1) };
  }
  if (match[GROUP.date]) {
    const date = parseDateToken(token);
    return date ? { ...wrap("date", 2, 1), date } : wrap("text", 0);
  }
  if (match[GROUP.url]) {
    // GFM's rule: a trailing ")" belongs to the URL only while its parentheses balance. What is
    // trimmed off is scanned again as ordinary source.
    let url = token;
    while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) url = url.slice(0, -1);
    while (/[.,;:!?]$/.test(url)) url = url.slice(0, -1);
    return { kind: "url", start, end: start + url.length, contentStart: start, contentEnd: start + url.length, display: url, href: url };
  }
  if (match[GROUP.tag]) return wrap("tag", 0);
  if (match[GROUP.mention]) return wrap("mention", 0);
  return wrap("math", token.startsWith("$$") ? 2 : 1);
}

/* A single `*` follows the flanking rule: it opens before a non-space, never right after a word
   character, `\` or another star, and closes the mirror way. `lo`/`hi` bound what it can see. */
function starOpens(s: string, at: number, lo: number, hi: number) {
  const next = at + 1 < hi ? s[at + 1] : undefined;
  if (next === undefined || isSpace(next) || next === "*") return false;
  const prev = at > lo ? s[at - 1] : undefined;
  return !(isWord(prev) || prev === "\\" || prev === "*");
}
function starCloses(s: string, at: number, lo: number, hi: number) {
  const prev = at > lo ? s[at - 1] : undefined;
  if (prev === undefined || isSpace(prev) || prev === "*" || prev === "\\") return false;
  const next = at + 1 < hi ? s[at + 1] : undefined;
  return !(isWord(next) || next === "*");
}
/** How many stars run from `at` (within `hi`), and whether the run starts at `at`. */
function starRun(s: string, at: number, lo: number, hi: number) {
  let end = at;
  while (end < hi && s[end] === "*") end++;
  return { length: end - at, first: at === lo || s[at - 1] !== "*" };
}

/**
 * `**…**` opening at `at`. The content holds no `*` of its own and no line break, and the first
 * run of two or more stars closes it, except that it may hold one single-star italic, and a run
 * of exactly three stars opens or closes bold and italic together (`***both***`).
 */
function closeBold(s: string, at: number, lo: number, hi: number, excluded: number): Closed | null {
  let k = at + 2;
  if (k >= hi) return null;
  let italic = -1; // where an italic inside opened, while it is open
  if (s[k] === "*") {
    const run = starRun(s, at, lo, hi);
    if (excluded & STYLE_BIT.italic || !run.first || run.length !== 3 || k + 1 >= hi || isSpace(s[k + 1])) return null;
    italic = k++;
  }
  for (; k < hi; k++) {
    const char = s[k];
    if (char === "\n") return null;
    if (char !== "*") continue;
    const run = starRun(s, k, lo, hi).length;
    if (italic < 0) {
      if (run >= 2) return k > at + 2 ? { open: 2, closeStart: k, close: 2 } : null;
      if (excluded & STYLE_BIT.italic || !starOpens(s, k, lo, hi)) return null;
      italic = k;
    } else if (run === 1 && k > italic + 1 && starCloses(s, k, lo, hi)) italic = -1;
    else if (run === 3 && k > italic + 1 && !isSpace(s[k - 1])) return { open: 2, closeStart: k + 1, close: 2 };
    else return null;
  }
  return null;
}

/** `*…*` opening at `at`: flanking stars; the content may hold one `**` bold. */
function closeItalic(s: string, at: number, lo: number, hi: number, excluded: number): Closed | null {
  let k: number;
  let bold = -1; // where a bold inside opened, while it is open
  if (s[at + 1] === "*") {
    // a run of exactly three opens italic around a bold that starts with it (`***b** c*`)
    const run = starRun(s, at, lo, hi);
    const prev = at > lo ? s[at - 1] : undefined;
    if (excluded & STYLE_BIT.bold || !run.first || run.length !== 3 || isWord(prev) || prev === "\\") return null;
    bold = at + 1;
    k = at + 3;
    if (k >= hi || isSpace(s[k])) return null;
  } else {
    if (!starOpens(s, at, lo, hi)) return null;
    k = at + 1;
  }
  while (k < hi) {
    const char = s[k];
    if (char === "\n") return null;
    if (char !== "*") {
      k++;
      continue;
    }
    const run = starRun(s, k, lo, hi).length;
    if (bold < 0) {
      if (run === 1) return k > at + 1 && starCloses(s, k, lo, hi) ? { open: 1, closeStart: k, close: 1 } : null;
      if (run !== 2 || excluded & STYLE_BIT.bold) return null;
      bold = k;
      k += 2;
    } else if (run === 2 && k > bold + 2) {
      bold = -1;
      k += 2;
    } else if (run === 3 && k > bold + 2 && !isSpace(s[k - 1])) {
      const next = k + 3 < hi ? s[k + 3] : undefined;
      return isWord(next) || next === "*" ? null : { open: 1, closeStart: k + 2, close: 1 };
    } else return null;
  }
  return null;
}

/** `__…__`, `~~…~~` and `==…==`: no delimiter character and no line break inside. */
function closeDouble(s: string, at: number, hi: number): Closed | null {
  const char = s[at]!;
  let k = at + 2;
  if (k >= hi || s[k] === char) return null;
  while (k < hi && s[k] !== char) {
    if (s[k] === "\n") return null;
    k++;
  }
  return k + 1 < hi && s[k + 1] === char ? { open: 2, closeStart: k, close: 2 } : null;
}

/**
 * Walk segments as a tree: consecutive segments in the same container (by id) become one
 * `wrap(mark, children)`; everything else is a `leaf`. Delimiters are skipped. The static
 * render, HTML copy and Markdown export all read styles through this one walker.
 */
export function walkNested<T>(
  segments: readonly InlineSegment[],
  leaf: (segment: InlineSegment) => T | null,
  wrap: (mark: InlineMark, children: T[]) => T,
  depth = 0,
): T[] {
  const out: T[] = [];
  for (let i = 0; i < segments.length; ) {
    const segment = segments[i]!;
    const mark = segment.marks?.[depth];
    if (!mark) {
      const node = segment.kind === "delimiter" ? null : leaf(segment);
      if (node !== null) out.push(node);
      i++;
      continue;
    }
    let j = i + 1;
    while (j < segments.length && segments[j]!.marks?.[depth]?.id === mark.id) j++;
    out.push(wrap(mark, walkNested(segments.slice(i, j), leaf, wrap, depth + 1)));
    i = j;
  }
  return out;
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
          ? dateTokenOf(segment.date).slice(2, -1)
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
        ? segment.date.end
          ? `from ${spokenDate(segment.date)} to ${spokenDate({ value: segment.date.end, hasTime: !!segment.date.endHasTime })}`
          : `due ${spokenDate(segment.date)}${segment.date.repeat ? `, repeats every ${formatRepeat(segment.date.repeat)}` : ""}`
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

export function formatDate(date: { value: Date; hasTime: boolean; end?: Date; endHasTime?: boolean }, now = new Date()): string {
  if (date.end) {
    // "Tue 9:00 AM → 11:00 AM" on one day; "Nov 3 → Nov 7" across days.
    const sameDay = startOfDay(date.end).getTime() === startOfDay(date.value).getTime();
    const end = sameDay
      ? date.endHasTime ? timeOf(date.end) : ""
      : formatDate({ value: date.end, hasTime: !!date.endHasTime }, now);
    return end ? `${formatDate({ value: date.value, hasTime: date.hasTime }, now)} → ${end}` : formatDate({ value: date.value, hasTime: date.hasTime }, now);
  }
  const day = startOfDay(date.value).getTime();
  const today = startOfDay(now).getTime();
  const diff = Math.round((day - today) / 86_400_000);
  const time = date.hasTime ? " " + timeOf(date.value) : "";
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
const timeOf = (date: Date) => date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Chip tone. A range is "today" while it is under way and overdue only once it has ended. */
export function dateTone(date: Date, now = new Date(), end?: Date): "overdue" | "today" | "soon" | "later" {
  const diffOf = (value: Date) => Math.round((startOfDay(value).getTime() - startOfDay(now).getTime()) / 86_400_000);
  const diff = diffOf(date);
  if (end && diff <= 0) return diffOf(end) < 0 ? "overdue" : "today";
  return diff < 0 ? "overdue" : diff === 0 ? "today" : diff <= 3 ? "soon" : "later";
}

/**
 * `!(…)` source for a date. `time` writes the wall time as intended when it differs from the
 * instant's clock (a daylight-saving gap); `end` makes a range (`!(start → end)`), its end time
 * shortened to `→ HH:MM` on the same day.
 */
export function formatDateToken(
  date: Date,
  withTime = false,
  repeat?: DateRepeat,
  extra?: { readonly end?: Date; readonly endHasTime?: boolean; readonly time?: readonly [number, number] },
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const dayOf = (value: Date) => `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const clock = (value: Date, wall?: readonly [number, number]) => `${pad(wall?.[0] ?? value.getHours())}:${pad(wall?.[1] ?? value.getMinutes())}`;
  let token = dayOf(date) + (withTime ? ` ${clock(date, extra?.time)}` : "");
  const end = extra?.end;
  if (end) {
    const sameDay = dayOf(end) === dayOf(date);
    if (sameDay && extra.endHasTime && withTime) token += ` → ${clock(end)}`;
    else if (!sameDay || extra.endHasTime) token += ` → ${dayOf(end)}${extra.endHasTime ? ` ${clock(end)}` : ""}`;
    return `!(${token})`;
  }
  return `!(${token}${repeat ? ` every ${formatRepeatToken(repeat)}` : ""})`;
}
/** The canonical token for a parsed date (ranges, repeats and the written time included). */
export const dateTokenOf = (date: InlineDate) =>
  formatDateToken(date.value, date.hasTime, date.repeat, { end: date.end, endHasTime: date.endHasTime, time: date.time });

/**
 * Text as literal outline source: every character that would start markup gets a backslash, so
 * pasted text from another app never turns into formatting or links by accident. Bare URLs,
 * #tags and @mentions stay live (they are words, not markers). Text that would not form markup
 * is left as written, so only the character that opens each construct gets its backslash.
 */
export function literalInline(text: string): string {
  // A backslash that would escape the next character is itself escaped first.
  let out = text.replace(/\\(?=[\\`*_~=[\]!#@()$])/g, "\\\\");
  // Escaping an opener can expose another construct (`___x__`, a URL inside a link): a few passes.
  for (let pass = 0; pass < 4; pass++) {
    const segments = parseInline(out);
    if (readsAs(segments, text)) return out;
    out = escapeOpeners(out, segments);
  }
  return readsAs(parseInline(out), text) ? out : escapeAll(text);
}

const LIVE_KINDS = new Set<InlineKind>(["text", "url", "tag", "mention", "escape"]);
/** Plain words only (no style, no token but live words and escapes), showing exactly `text`. */
const readsAs = (segments: readonly InlineSegment[], text: string) =>
  segments.every((segment) => !segment.marks && LIVE_KINDS.has(segment.kind)) && segments.map((segment) => segment.display).join("") === text;

/** A backslash before the first character of every style and non-live token. */
function escapeOpeners(source: string, segments: readonly InlineSegment[]): string {
  const at = new Set<number>();
  for (const segment of segments) {
    for (const mark of segment.marks ?? []) at.add(mark.start);
    if (!LIVE_KINDS.has(segment.kind) && segment.kind !== "delimiter") at.add(segment.start);
  }
  let out = "";
  let from = 0;
  for (const offset of [...at].sort((a, b) => a - b)) {
    out += source.slice(from, offset) + "\\";
    from = offset;
  }
  return out + source.slice(from);
}

/**
 * Every markup character escaped, outside live words. Always plain: a bare URL reads up to the
 * next space whatever surrounds it, so everything touching one is kept as written.
 */
function escapeAll(text: string): string {
  let out = "";
  let at = 0;
  LIVE_WORDS.lastIndex = 0;
  for (let match = LIVE_WORDS.exec(text); match; match = LIVE_WORDS.exec(text)) {
    let end = match.index + match[0].length;
    if (match[1]) {
      while (end < text.length && !/[\s<]/u.test(text[end]!)) end++;
      LIVE_WORDS.lastIndex = end;
    }
    out += escapeMarkup(text.slice(at, match.index)) + text.slice(match.index, end);
    at = end;
  }
  return out + escapeMarkup(text.slice(at));
}
/** Parentheses alone never start markup (`!(` is escaped at its `!`), so they stay bare. */
const escapeMarkup = (text: string) => text.replace(/[\\`*_~=[\]!#@$]/g, "\\$&");

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
  /**
   * Where `source` starts inside a longer string (a line of a rich note): `data-src` offsets and
   * `marks` are then positions in that longer string, so a click maps to the right caret.
   */
  readonly offset?: number;
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
  offset = 0,
  className,
  ...props
}: InlineTextProps) {
  const segments = React.useMemo(() => shiftSegments(parseInline(source), offset), [source, offset]);
  return (
    // dir="auto": a Latin title inside an RTL outline (or the reverse) keeps its own order.
    <span dir="auto" className={cn("whitespace-pre-wrap break-words", className)} {...props}>
      {renderNested(segments, (segment) => (
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

/** Segments moved by `by` source offsets; a container shared by several segments moves once. */
function shiftSegments(segments: readonly InlineSegment[], by: number): readonly InlineSegment[] {
  if (by === 0) return segments;
  const moved = new Map<number, InlineMark>();
  const move = (mark: InlineMark) => {
    let next = moved.get(mark.id);
    if (!next) {
      next = { ...mark, start: mark.start + by, end: mark.end + by, contentStart: mark.contentStart + by, contentEnd: mark.contentEnd + by };
      moved.set(mark.id, next);
    }
    return next;
  };
  return segments.map((segment) => ({
    ...segment,
    start: segment.start + by,
    end: segment.end + by,
    contentStart: segment.contentStart + by,
    contentEnd: segment.contentEnd + by,
    ...(segment.marks ? { marks: segment.marks.map(move) } : {}),
  }));
}

/** Class names of the inline styles, shared by the static render and the editing surface. */
export const INLINE_CLASS = {
  bold: "font-semibold",
  italic: "italic",
  strike: "text-muted-foreground decoration-muted-foreground/70",
  highlight: "rounded-[3px] bg-signal-muted px-0.5 text-foreground",
  code: "rounded-[4px] border border-hairline bg-muted px-1 py-px font-mono text-[0.86em] text-foreground/90 box-decoration-clone",
} as const;

const STYLE_ELEMENT: Record<InlineStyle, "strong" | "em" | "s" | "span"> = { bold: "strong", italic: "em", strike: "s", highlight: "span" };

/** One element per style container, around the leaves inside it. */
const renderNested = (segments: readonly InlineSegment[], leaf: (segment: InlineSegment) => React.ReactNode) =>
  walkNested<React.ReactNode>(segments, leaf, (mark, children) =>
    React.createElement(STYLE_ELEMENT[mark.kind], { key: `s${mark.id}`, className: INLINE_CLASS[mark.kind] }, ...children),
  );

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

/**
 * Whether tags, mentions, item links and dates are tab stops. Off in the outline, whose
 * tree is one tab stop (its rows reach these through ⌘K and the item menu); on where text is
 * read rather than browsed row by row (the article view). A chip with nothing to do stays out.
 */
export const InlineChipsFocusable = React.createContext(false);
/** The ring a focusable chip shows under keyboard focus. */
const chipFocus = "outline-none focus-visible:ring-2 focus-visible:ring-signal/45";

/** Inline code short enough to keep on one line: one word, at most 24 characters. */
export const isShortCode = (text: string) => text.length <= 24 && !/\s/.test(text);

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
  const focusable = React.useContext(InlineChipsFocusable);
  const stopFor = (handler: unknown) => (focusable && handler ? 0 : -1);
  switch (segment.kind) {
    case "text":
    case "escape":
      return runs;
    case "delimiter":
      return null;
    case "code":
      return (
        <code
          className={cn(
            INLINE_CLASS.code,
            // A short token (an identifier, a flag, `halcyon-3`) never breaks at its hyphen or
            // slash; a long snippet still wraps so it can never push the line off a phone.
            isShortCode(segment.display) && "whitespace-nowrap",
          )}
        >
          {runs}
        </code>
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
    case "math":
      return <MathTex tex={segment.display} src={segment.start} />;
    case "tag":
    case "mention":
      return (
        <button
          type="button"
          tabIndex={stopFor(onTag)}
          dir="auto"
          data-src={segment.contentStart}
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            onTag?.(segment.display);
          }}
          className={cn(
            "inline rounded-[4px] px-0.5 font-medium transition-colors",
            chipFocus,
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
          tabIndex={stopFor(onRef)}
          onPointerDown={stop}
          onClick={(event) => {
            stop(event);
            onRef?.(segment.display, segment.refId);
          }}
          title={missing ? "Linked item was deleted" : live ? inlineToPlain(live) : undefined}
          className={cn(
            "inline-flex max-w-full items-baseline gap-0.5 rounded-[4px] px-0.5 align-bottom underline decoration-dotted underline-offset-[3px]",
            chipFocus,
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
      const tone = segment.date ? dateTone(segment.date.value, undefined, segment.date.end) : "later";
      // A date filter (due:, before:, after:) marks the whole token: the chip lights up like a text match.
      const marked = marks?.some((mark) => mark.start < segment.end && mark.end > segment.start);
      return (
        <button
          type="button"
          tabIndex={stopFor(onDate)}
          dir="auto"
          data-src={segment.contentStart}
          data-repeat={segment.date?.repeat ? formatRepeat(segment.date.repeat) : undefined}
          data-range={segment.date?.end ? "" : undefined}
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
            chipFocus,
          )}
        >
          {segment.date?.repeat ? <Repeat aria-hidden className="size-3" /> : segment.date?.end ? <CalendarRange aria-hidden className="size-3" /> : <CalendarDays aria-hidden className="size-3" />}
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
  // Chips and rendered blocks (math, images, code) are atomic: the caret lands at their start.
  if (owner.tagName === "BUTTON" || owner.dataset.atomic !== undefined) return base;
  return Math.min(sourceLength, base + (node.nodeType === Node.TEXT_NODE ? offset : 0));
}
