import * as React from "react";
import { CalendarDays, CalendarRange, CornerDownRight, Repeat } from "lucide-react";
import { cn } from "../lib/utils.js";
import { MathTex } from "./math.js";

export * from "../core/outliner/inline.js";
import {
  type InlineStyle,
  type InlineMark,
  type InlineSegment,
  formatRepeat,
  parseInline,
  walkNested,
  inlineToPlain,
  inlineToLabel,
  formatDate,
  dateTone,
  type InlineRange,
} from "../core/outliner/inline.js";

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
  const segments = React.useMemo(
    () => shiftSegments(parseInline(source), offset),
    [source, offset],
  );
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
      next = {
        ...mark,
        start: mark.start + by,
        end: mark.end + by,
        contentStart: mark.contentStart + by,
        contentEnd: mark.contentEnd + by,
      };
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

const STYLE_ELEMENT: Record<InlineStyle, "strong" | "em" | "s" | "span"> = {
  bold: "strong",
  italic: "em",
  strike: "s",
  highlight: "span",
};

/** One element per style container, around the leaves inside it. */
const renderNested = (
  segments: readonly InlineSegment[],
  leaf: (segment: InlineSegment) => React.ReactNode,
) =>
  walkNested<React.ReactNode>(segments, leaf, (mark, children) =>
    React.createElement(
      STYLE_ELEMENT[mark.kind],
      { key: `s${mark.id}`, className: INLINE_CLASS[mark.kind] },
      ...children,
    ),
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
      const tone = segment.date
        ? dateTone(segment.date.value, undefined, segment.date.end)
        : "later";
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
          title={
            segment.date?.repeat ? `Repeats every ${formatRepeat(segment.date.repeat)}` : undefined
          }
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
          {segment.date?.repeat ? (
            <Repeat aria-hidden className="size-3" />
          ) : segment.date?.end ? (
            <CalendarRange aria-hidden className="size-3" />
          ) : (
            <CalendarDays aria-hidden className="size-3" />
          )}
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
  const owner = (
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element)
  )?.closest<HTMLElement>("[data-src]");
  if (!owner || !root.contains(owner)) return sourceLength;
  const base = Number(owner.dataset.src);
  // Chips and rendered blocks (math, images, code) are atomic: the caret lands at their start.
  if (owner.tagName === "BUTTON" || owner.dataset.atomic !== undefined) return base;
  return Math.min(sourceLength, base + (node.nodeType === Node.TEXT_NODE ? offset : 0));
}
