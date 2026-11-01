import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CaseSensitive, ChevronDown, ChevronUp, Replace, ReplaceAll, WholeWord, X } from "lucide-react";
import { getOutlinePath } from "@fux/core";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/hooks/use-media-query";
import { collapse } from "@/lib/motion";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOutlinerContext, usePlatformKeys } from "./context";
import { findInOutline, planReplace, type FindMatch } from "./find-replace";
import { inlineToPlain } from "./inline";
import { isComposingKey } from "./keymap";

/**
 * Find and replace, docked under the toolbar (one bar on every screen; on a phone its inputs
 * take the full width and its buttons are 44 px). Matches are highlighted in the rows with the
 * CSS Custom Highlight API, so rows render exactly as before; the current match is revealed
 * (its branch unfolds), becomes the cursor row and scrolls into view.
 *
 *   Enter / ⇧Enter      next / previous        ⌥C  match case    ⌥W  whole word
 *   Enter in Replace    replace this one       ⌘Enter  replace all (one undo step)
 *   Esc                 close, cursor on the current match
 *
 * Locked items are skipped (and counted); a read-only outline offers find only.
 */
export function FindReplaceBar({ seed }: { readonly seed?: { readonly query: string } | null }) {
  const { ui } = useOutlinerContext();
  return <AnimatePresence initial={false}>{ui.findOpen && <FindReplacePanel key="find" seed={seed} />}</AnimatePresence>;
}

function FindReplacePanel({ seed }: { readonly seed?: { readonly query: string } | null }) {
  const { ol, ui } = useOutlinerContext();
  const { modKey, alt } = usePlatformKeys();
  const L = ui.labels;
  const coarse = useMediaQuery("(pointer: coarse)");
  const [query, setQuery] = React.useState(() => seed?.query ?? "");
  const [replacement, setReplacement] = React.useState("");
  const [matchCase, setMatchCase] = React.useState(false);
  const [wholeWord, setWholeWord] = React.useState(false);
  const [showReplace, setShowReplace] = React.useState(!ol.readOnly);
  const [index, setIndex] = React.useState(0);
  const findRef = React.useRef<HTMLInputElement>(null);
  const replaceRef = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (seed) setQuery(seed.query);
  }, [seed]);
  React.useEffect(() => {
    // Opened from a menu, whose close hands focus back to its trigger a beat later: take it once
    // more after that, unless the reader has already moved on.
    const take = (first: boolean) => {
      const active = document.activeElement;
      // Only from where opening left it: nowhere, the menu, or the menu's trigger. Never from
      // the tree or a field the reader went to (Esc may already have closed the bar).
      const fromOpener = !active || active === document.body || !!active.closest("[role=menu],[role=menuitem],[data-view-menu-trigger],[data-slot$=menu-trigger]");
      if ((!first && !fromOpener) || !findRef.current?.isConnected) return;
      findRef.current?.focus();
      findRef.current?.select();
    };
    const frame = requestAnimationFrame(() => take(true));
    const timer = window.setTimeout(() => take(false), 240);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  const scopeId = ol.state.hoistedId;
  const matches = React.useMemo(
    () => findInOutline(ol.state.nodes, query, { matchCase, wholeWord }, scopeId),
    [ol.state.nodes, query, matchCase, wholeWord, scopeId],
  );
  const current = matches.length ? Math.min(index, matches.length - 1) : -1;
  const match = current >= 0 ? matches[current]! : null;

  /** Bring a match into view: unfold to it, make it the cursor row, scroll it to the middle. */
  const reveal = React.useCallback(
    (target: FindMatch | null) => {
      if (!target) return;
      ol.dispatch({ type: "reveal", id: target.id });
      // Fine pointers get the cursor on it (Esc lands there); touch has no cursor, and a
      // selection would turn taps into selection mode: the highlight alone marks it.
      if (!coarse) {
        ol.dispatch({ type: "select", id: target.id });
      }
      requestAnimationFrame(() => ui.scrollToRow(target.id, "center"));
    },
    [ol, ui, coarse],
  );
  // The query or options changed: show the first match (typing searches as you go).
  const shownKey = `${query}\u0000${matchCase}\u0000${wholeWord}`;
  const lastKey = React.useRef("");
  React.useEffect(() => {
    if (lastKey.current === shownKey) return;
    lastKey.current = shownKey;
    setIndex(0);
    if (matches[0]) reveal(matches[0]);
  }, [shownKey, matches, reveal]);

  const step = (by: number) => {
    if (!matches.length) return;
    const next = (current + by + matches.length) % matches.length;
    setIndex(next);
    reveal(matches[next]!);
    // The "n of m" status beside the field is the live region (one channel).
  };

  const replaceCurrent = () => {
    if (!match || ol.readOnly) return;
    const plan = planReplace(ol.latestNodes(), [match], replacement, (id) => ol.isItemLocked(id));
    if (!plan.commands.length) {
      // Locked: say so and move on to the next match.
      ui.announce(L.locked);
      step(1);
      return;
    }
    ol.dispatch({ type: "transaction", commands: plan.commands });
    // The same index is now the next match (the replaced one is gone, unless it still matches).
    const after = findInOutline(ol.latestNodes(), query, { matchCase, wholeWord }, scopeId);
    const sameStillMatches = replacement.length > 0 && after[current]?.id === match.id && after[current]?.start === match.start;
    const nextIndex = after.length ? (sameStillMatches ? current + 1 : current) % after.length : 0;
    setIndex(nextIndex);
    if (after[nextIndex]) reveal(after[nextIndex]!);
  };
  const replaceEvery = () => {
    if (!matches.length || ol.readOnly) return;
    const plan = planReplace(ol.latestNodes(), matches, replacement, (id) => ol.isItemLocked(id));
    if (plan.commands.length) ol.dispatch({ type: "transaction", commands: plan.commands });
    const text = L.replaced(plan.replaced, plan.skipped);
    // A receipt with Undo is a toast, which speaks it; nothing replaced is only said.
    if (plan.replaced) ui.offerUndo(text);
    else ui.announce(text);
    setIndex(0);
  };
  const close = () => {
    ui.setFindOpen(false);
    clearHighlights();
    // A match was revealed: the tree, on it (Esc lands where you were looking). No match: back
    // where find was opened from, the row or the field and its caret.
    if (match) ui.returnFocus(null, { kind: "row", id: match.id });
    else ui.returnFocus(null);
  };

  useFindHighlights(ui.listRef, matches, match);

  const onKeys = (event: React.KeyboardEvent, field: "find" | "replace") => {
    if (isComposingKey(event)) return;
    const code = event.nativeEvent.code;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
    } else if (event.altKey && !event.metaKey && !event.ctrlKey && code === "KeyC") {
      event.preventDefault();
      setMatchCase((value) => !value);
    } else if (event.altKey && !event.metaKey && !event.ctrlKey && code === "KeyW") {
      event.preventDefault();
      setWholeWord((value) => !value);
    } else if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();
      if (field === "replace" && (event.metaKey || event.ctrlKey)) replaceEvery();
      else if (field === "replace") replaceCurrent();
      else step(event.shiftKey ? -1 : 1);
    }
  };

  const status = !query ? "" : matches.length ? L.matchPosition(current + 1, matches.length) : L.noResults;
  const scopeTitle = scopeId ? inlineToPlain(getOutlinePath(ol.state.nodes, scopeId).at(-1)?.text ?? "") : "";
  const iconButton =
    "grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 disabled:pointer-events-none disabled:opacity-40 coarse:size-11";
  const toggle = (on: boolean) =>
    cn("grid size-6 shrink-0 place-items-center rounded-[5px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 coarse:size-9", on && "bg-signal/12 text-signal hover:text-signal");
  const input =
    "h-7 min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground/60 coarse:h-11 coarse:text-[16px]";

  return (
    <motion.div
      variants={collapse}
      initial="initial"
      animate="animate"
      exit="exit"
      role="search"
      aria-label={L.findReplace}
      data-find-replace=""
      className="shrink-0 overflow-hidden border-b border-hairline bg-muted/25"
    >
      <div className="flex flex-col gap-1 px-2 py-1.5 sm:flex-row sm:items-start sm:gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {!ol.readOnly && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={L.toggleReplace} aria-expanded={showReplace} onClick={() => setShowReplace((value) => !value)} className={cn(iconButton, "coarse:hidden")}>
                  <motion.span animate={{ rotate: showReplace ? 0 : -90 }} transition={{ duration: 0.14 }} className="grid rtl:-scale-x-100">
                    <ChevronDown className="size-3.5" />
                  </motion.span>
                </button>
              </TooltipTrigger>
              <TooltipContent>{L.toggleReplace}</TooltipContent>
            </Tooltip>
          )}
          <div className="flex h-7 min-w-0 flex-1 items-center gap-1 rounded-md border border-hairline bg-surface ps-2 pe-0.5 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/15 coarse:h-11">
            <input
              ref={findRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => onKeys(event, "find")}
              placeholder={L.find}
              aria-label={L.find}
              aria-describedby="ol-find-status"
              spellCheck={false}
              className={input}
            />
            <span id="ol-find-status" aria-live="polite" className={cn("shrink-0 px-1 font-mono text-[10.5px] text-muted-foreground tabular-nums", query && !matches.length && "text-destructive")}>
              {status}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={L.matchCase} aria-pressed={matchCase} onClick={() => setMatchCase((value) => !value)} className={toggle(matchCase)}>
                  <CaseSensitive className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {L.matchCase} <span className="font-mono opacity-70" dir="ltr">{alt}C</span>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button type="button" aria-label={L.wholeWord} aria-pressed={wholeWord} onClick={() => setWholeWord((value) => !value)} className={toggle(wholeWord)}>
                  <WholeWord className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {L.wholeWord} <span className="font-mono opacity-70" dir="ltr">{alt}W</span>
              </TooltipContent>
            </Tooltip>
          </div>
          <button type="button" aria-label={L.previousMatch} disabled={!matches.length} onClick={() => step(-1)} className={iconButton}>
            <ChevronUp className="size-4" />
          </button>
          <button type="button" aria-label={L.nextMatch} disabled={!matches.length} onClick={() => step(1)} className={iconButton}>
            <ChevronDown className="size-4" />
          </button>
          <button type="button" aria-label={L.closeFind} onClick={close} className={iconButton}>
            <X className="size-4" />
          </button>
        </div>
        <AnimatePresence initial={false}>
          {showReplace && !ol.readOnly && (
            <motion.div
              key="replace"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.14 }}
              className="flex min-w-0 items-center gap-1 overflow-hidden sm:flex-1 max-sm:ps-0"
            >
              <div className="flex h-7 min-w-0 flex-1 items-center rounded-md border border-hairline bg-surface px-2 focus-within:border-signal/50 focus-within:ring-2 focus-within:ring-signal/15 coarse:h-11">
                <input
                  ref={replaceRef}
                  value={replacement}
                  onChange={(event) => setReplacement(event.target.value)}
                  onKeyDown={(event) => onKeys(event, "replace")}
                  placeholder={L.replaceWith}
                  aria-label={L.replaceWith}
                  spellCheck={false}
                  className={input}
                />
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={L.replaceOne} disabled={!match} onClick={replaceCurrent} className={iconButton}>
                    <Replace className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {L.replaceOne} <span className="font-mono opacity-70">↵</span>
                </TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button type="button" aria-label={L.replaceAll} disabled={!matches.length} onClick={replaceEvery} className={iconButton}>
                    <ReplaceAll className="size-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {L.replaceAll} <span className="font-mono opacity-70" dir="ltr">{modKey}↵</span>
                </TooltipContent>
              </Tooltip>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      {scopeTitle && <div className="truncate px-3 pb-1 font-mono text-[10.5px] text-muted-foreground">{L.inBranch(scopeTitle)}</div>}
    </motion.div>
  );
}

/* ── Highlights: ranges over the rendered rows, recomputed as rows mount and scroll ── */

type HighlightRegistry = Map<string, unknown>;
const registry = (): HighlightRegistry | null =>
  typeof CSS !== "undefined" && "highlights" in CSS && typeof (globalThis as { Highlight?: unknown }).Highlight === "function"
    ? ((CSS as unknown as { highlights: HighlightRegistry }).highlights)
    : null;
function clearHighlights() {
  const highlights = registry();
  highlights?.delete("ol-find");
  highlights?.delete("ol-find-current");
}

/** The DOM range for a source range inside a title or note (runs carry `data-src` offsets). */
export function rangeForMatch(container: Element, start: number, end: number): Range | null {
  for (const el of container.querySelectorAll<HTMLElement>("[data-src]")) {
    const text = el.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE || el.childNodes.length !== 1) continue;
    const from = Number(el.dataset.src);
    const length = text.textContent?.length ?? 0;
    if (from <= start && end <= from + length) {
      const range = document.createRange();
      range.setStart(text, start - from);
      range.setEnd(text, end - from);
      return range;
    }
  }
  return null;
}

function useFindHighlights(listRef: React.RefObject<HTMLDivElement | null>, matches: readonly FindMatch[], current: FindMatch | null) {
  React.useEffect(() => {
    const highlights = registry();
    const list = listRef.current;
    if (!highlights || !list) return;
    const byItem = new Map<string, FindMatch[]>();
    for (const match of matches) byItem.set(match.id, [...(byItem.get(match.id) ?? []), match]);
    const HighlightCtor = (globalThis as unknown as { Highlight: new (...ranges: Range[]) => unknown }).Highlight;
    let frame = 0;
    const paint = () => {
      frame = 0;
      const all: Range[] = [];
      const now: Range[] = [];
      for (const row of list.querySelectorAll<HTMLElement>("[data-row]")) {
        const found = byItem.get(row.dataset.row!);
        if (!found) continue;
        for (const match of found) {
          const container = row.querySelector(match.field === "title" ? "[data-ol-title]" : "[data-ol-note]");
          const range = container && rangeForMatch(container, match.start, match.end);
          if (!range) continue;
          (current && current.id === match.id && current.field === match.field && current.start === match.start ? now : all).push(range);
        }
      }
      highlights.set("ol-find", new HighlightCtor(...all));
      highlights.set("ol-find-current", new HighlightCtor(...now));
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(paint);
    };
    schedule();
    const observer = new MutationObserver(schedule);
    observer.observe(list, { childList: true, subtree: true, characterData: true });
    const scroller = list.closest("[data-outliner-scroll]");
    scroller?.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      scroller?.removeEventListener("scroll", schedule);
      clearHighlights();
    };
  }, [listRef, matches, current]);
}
