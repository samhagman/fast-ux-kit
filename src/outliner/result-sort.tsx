import * as React from "react";
import { motion } from "motion/react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { inlineToPlain } from "./inline.js";
import { firstDay } from "./search-filters.js";
import type { OutlineItem } from "./types.js";

/**
 * How flat search results are ordered. "outline" is document order (the default); "date" puts the
 * soonest inline date first (undated last); "title" is A → Z; "document" (results across a
 * workspace) groups by document title, each in outline order. Ties always keep outline order,
 * so a sort never shuffles equal results.
 */
export type ResultSort = "outline" | "date" | "title" | "document";

export interface SortableResult {
  readonly node: OutlineItem;
  /** Outline (pre-order) position: the tiebreak. */
  readonly order: number;
  /** For results across documents: the document's title. */
  readonly document?: string;
}

const collator =
  typeof Intl !== "undefined"
    ? new Intl.Collator(undefined, { sensitivity: "base", numeric: true })
    : null;
const compareText = (a: string, b: string) =>
  collator ? collator.compare(a, b) : a < b ? -1 : a > b ? 1 : 0;

const titleCache = new WeakMap<OutlineItem, string>();
const titleOf = (node: OutlineItem) => {
  let title = titleCache.get(node);
  if (title === undefined)
    titleCache.set(
      node,
      (title = inlineToPlain(node.text, undefined, { dates: "absolute" }).trim()),
    );
  return title;
};

export function sortResults<T extends SortableResult>(
  results: readonly T[],
  by: ResultSort,
): readonly T[] {
  if (by === "outline") return results;
  const keyed = results.map((result) => ({
    result,
    day: by === "date" ? firstDay(result.node) : null,
  }));
  keyed.sort((left, right) => {
    const a = left.result,
      b = right.result;
    let order = 0;
    if (by === "date")
      order =
        left.day === null
          ? right.day === null
            ? 0
            : 1
          : right.day === null
            ? -1
            : left.day - right.day;
    else if (by === "title") order = compareText(titleOf(a.node), titleOf(b.node));
    else if (by === "document") order = compareText(a.document ?? "", b.document ?? "");
    return order || a.order - b.order;
  });
  return keyed.map(({ result }) => result);
}

export const RESULT_SORT_LABELS: Record<ResultSort, string> = {
  outline: "Outline",
  date: "Date",
  title: "Title",
  document: "Document",
};

/**
 * The compact sort switch over flat results: a radiogroup of small text tabs (44 px tall on
 * touch). Arrow keys move between options, like any radiogroup.
 */
export function ResultSortControl({
  value,
  onChange,
  options,
  label = "Sort results",
  className,
}: {
  readonly value: ResultSort;
  readonly onChange: (value: ResultSort) => void;
  readonly options: readonly ResultSort[];
  readonly label?: string;
  readonly className?: string;
}) {
  const id = React.useId();
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex items-center gap-px rounded-md border border-hairline p-px",
        className,
      )}
    >
      {options.map((option, index) => {
        const on = option === value;
        return (
          <button
            key={option}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            data-result-sort={option}
            onClick={() => onChange(option)}
            onKeyDown={(event) => {
              const step =
                event.key === "ArrowRight" || event.key === "ArrowDown"
                  ? 1
                  : event.key === "ArrowLeft" || event.key === "ArrowUp"
                    ? -1
                    : 0;
              if (!step) return;
              event.preventDefault();
              const rtl =
                getComputedStyle(event.currentTarget).direction === "rtl" &&
                (event.key === "ArrowRight" || event.key === "ArrowLeft");
              const next = (index + (rtl ? -step : step) + options.length) % options.length;
              onChange(options[next]!);
              refs.current[next]?.focus();
            }}
            className={cn(
              "relative h-5 rounded-[4px] px-1.5 font-sans text-[11px] font-medium tracking-normal normal-case transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal/30 coarse:h-9 coarse:px-2.5",
              on ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={`result-sort-${id}`}
                transition={motionTokens.layout}
                className="absolute inset-0 rounded-[4px] bg-muted"
              />
            )}
            <span className="relative">{RESULT_SORT_LABELS[option]}</span>
          </button>
        );
      })}
    </div>
  );
}
