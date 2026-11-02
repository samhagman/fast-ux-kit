import * as React from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import {
  AtSign,
  CalendarDays,
  CornerDownRight,
  Hash,
  Files,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { formatDate, formatDateToken, inlineToPlain } from "./inline";
import { fieldCaretRect, isLiveField, type CaretField } from "./focus";
import type { OutlinerController } from "./use-outliner";
import type { OutlineItem } from "./types";

/**
 * Caret-anchored suggestions inside a row field. Triggers:
 *   #tag   @person   [[item link   !date
 * The menu never owns focus: the field keeps the caret and forwards navigation keys.
 * "/" is not one of them: it opens the item menu (item-menu.tsx), the one list of commands.
 */
export type TriggerKind = "tag" | "mention" | "link" | "date";

export interface Suggestion {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon: React.ReactNode;
  /** Replacement text for the trigger token; commands may instead run `apply`. */
  readonly insert?: string;
  readonly apply?: () => void;
}

interface Token {
  readonly kind: TriggerKind;
  readonly start: number;
  readonly end: number;
  readonly query: string;
}

export function findTriggerToken(value: string, caret: number): Token | null {
  const before = value.slice(0, caret);
  const link = /\[\[([^\]\n]*)$/.exec(before);
  if (link) return { kind: "link", start: link.index, end: caret, query: link[1]! };
  const match = /(^|[\s(])([#@!])([\p{L}\p{N}_.\- ]{0,24})$/u.exec(before);
  if (!match) return null;
  const trigger = match[2]!;
  const query = match[3]!;
  const start = match.index + match[1]!.length;
  // Tags and mentions stop at whitespace; dates may contain spaces ("next week").
  if ((trigger === "#" || trigger === "@") && /\s/.test(query)) return null;
  const kind: TriggerKind = trigger === "#" ? "tag" : trigger === "@" ? "mention" : "date";
  return { kind, start, end: caret, query };
}

const nextWeekday = (weekday: number) => {
  const date = new Date();
  date.setDate(date.getDate() + ((weekday + 7 - date.getDay()) % 7 || 7));
  return date;
};
const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

function dateSuggestions(query: string): Suggestion[] {
  const presets: [string, Date][] = [
    ["Today", addDays(0)],
    ["Tomorrow", addDays(1)],
    ["Next Monday", nextWeekday(1)],
    ["Friday", nextWeekday(5)],
    ["In one week", addDays(7)],
    ["In two weeks", addDays(14)],
  ];
  const explicit = /^(\d{4})-(\d{2})-(\d{2})$/.exec(query.trim());
  const list = explicit
    ? [[query.trim(), new Date(Number(explicit[1]), Number(explicit[2]) - 1, Number(explicit[3]))] as [string, Date]]
    : presets.filter(([label]) => label.toLowerCase().includes(query.trim().toLowerCase()));
  return list
    .filter(([, date]) => !Number.isNaN(date.getTime()))
    .map(([label, date]) => ({
      id: `date-${label}`,
      label,
      hint: formatDate({ value: date, hasTime: false }),
      icon: <CalendarDays />,
      insert: formatDateToken(date) + " ",
    }));
}

export function useAutocomplete(
  ol: OutlinerController,
  row: { readonly id: string },
  field: "title" | "note",
) {
  const [token, setToken] = React.useState<Token | null>(null);
  const [active, setActive] = React.useState(0);
  const [dismissedAt, setDismissedAt] = React.useState<number | null>(null);

  /** Typing may open the menu; caret moves (clicks, arrows) may only keep or close it. */
  const sync = React.useCallback(
    (el: CaretField, typed = false) => {
      if (el.selectionStart !== el.selectionEnd) return setToken(null);
      const next = findTriggerToken(el.value, el.selectionStart);
      if (next && next.start === dismissedAt) return setToken(null);
      setToken((current) => {
        if (!next) return null;
        if (!typed && current?.start !== next.start) return null;
        return current?.start === next.start && current.query === next.query && current.kind === next.kind ? current : next;
      });
      if (!next) setDismissedAt(null);
    },
    [dismissedAt],
  );

  const items = React.useMemo<Suggestion[]>(() => {
    if (!token) return [];
    const q = token.query.toLowerCase();
    switch (token.kind) {
      case "tag":
      case "mention": {
        const trigger = token.kind === "tag" ? "#" : "@";
        // Ignore the half-typed token itself (it only exists in this row).
        const known = ol.tags.filter(
          (tag) =>
            tag.trigger === trigger &&
            tag.spelling.toLowerCase().startsWith(q) &&
            !(tag.nodeIds.length === 1 && tag.nodeIds[0] === row.id && tag.spelling.toLowerCase() === q),
        );
        const list: Suggestion[] = known.slice(0, 7).map((tag) => ({
          id: tag.key,
          label: tag.spelling,
          hint: `${tag.count}`,
          icon: token.kind === "tag" ? <Hash /> : <AtSign />,
          insert: `${trigger}${tag.spelling} `,
        }));
        if (q && !known.some((tag) => tag.spelling.toLowerCase() === q))
          list.push({
            id: `new-${q}`,
            label: token.query,
            hint: "new",
            icon: token.kind === "tag" ? <Hash /> : <AtSign />,
            insert: `${trigger}${token.query} `,
          });
        return list;
      }
      case "date":
        return dateSuggestions(token.query);
      case "link": {
        const out: Suggestion[] = [];
        const walk = (nodes: readonly OutlineItem[]) => {
          for (const node of nodes) {
            if (out.length >= 8) return;
            const text = inlineToPlain(node.text);
            if (node.id !== row.id && text && text.toLowerCase().includes(q))
              out.push({
                id: node.id,
                label: text,
                icon: <CornerDownRight />,
                // Plain label (no markup/tags) plus the target id, so renames never break the link.
                insert: `[[${text.replace(/[#@][\p{L}\p{N}_-]+/gu, "").replace(/[\[\]|]/g, "").replace(/\s+/g, " ").trim()}|${node.id}]] `,
              });
            if (node.children) walk(node.children);
          }
        };
        walk(ol.state.nodes);
        // Other documents (a workspace host): `[[label|doc/item]]`, labelled with where they live.
        if (ol.external && out.length < 8)
          for (const ref of ol.external.suggest(token.query, 8 - out.length)) {
            const text = inlineToPlain(ref.title);
            out.push({
              id: ref.id,
              label: text,
              hint: ref.context.split(" › ")[0],
              icon: <Files />,
              insert: `[[${text.replace(/[#@][\p{L}\p{N}_-]+/gu, "").replace(/[\[\]|]/g, "").replace(/\s+/g, " ").trim()}|${ref.id}]] `,
            });
          }
        return out;
      }
    }
  }, [token, ol, row.id, field]);

  React.useEffect(() => setActive(0), [token?.kind, token?.query]);

  const open = !!token && items.length > 0;

  const accept = (el: CaretField, item: Suggestion | undefined) => {
    if (!token || !item) return;
    const value = el.value;
    const insert = item.insert ?? "";
    const caret = token.start + insert.length;
    // The live field replaces exactly the token it typed (one step, refused if it moved on).
    if (isLiveField(el)) el.liveField.replaceSource(token.start, token.end, insert, value.slice(token.start, token.end));
    else {
      const next = value.slice(0, token.start) + insert + value.slice(token.end);
      ol.dispatch({ type: field === "note" ? "note" : "text", id: row.id, text: next, caret });
      requestAnimationFrame(() => el.setSelectionRange(caret, caret));
    }
    if (item.apply) item.apply();
    setToken(insert === "!" ? { kind: "date", start: token.start, end: caret, query: "" } : null);
  };

  /** Returns true when the key was consumed by the menu. */
  const onKeyDown = (event: { readonly key: string; readonly ctrlKey: boolean; readonly currentTarget: CaretField; preventDefault(): void; stopPropagation(): void }) => {
    if (!open) return false;
    if (event.key === "ArrowDown" || (event.key === "n" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index + 1) % items.length);
      return true;
    }
    if (event.key === "ArrowUp" || (event.key === "p" && event.ctrlKey)) {
      event.preventDefault();
      setActive((index) => (index - 1 + items.length) % items.length);
      return true;
    }
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      accept(event.currentTarget, items[active]);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setDismissedAt(token!.start);
      setToken(null);
      return true;
    }
    return false;
  };

  return { token, items, active, setActive, open, sync, accept, onKeyDown };
}

const TITLES: Record<TriggerKind, string> = {
  tag: "Tags",
  mention: "People",
  link: "Link to item",
  date: "Date",
};

export function AutocompletePopover({
  anchor,
  state,
  listId,
}: {
  readonly anchor: CaretField | null;
  readonly state: ReturnType<typeof useAutocomplete>;
  /** Shared with the field's aria-controls / aria-activedescendant. */
  readonly listId: string;
}) {
  const { open, token, items, active, setActive, accept } = state;
  const [rect, setRect] = React.useState<DOMRect | null>(null);
  React.useLayoutEffect(() => {
    if (!open || !anchor || !token) return;
    setRect(fieldCaretRect(anchor, token.start));
  }, [open, anchor, token]);
  if (typeof document === "undefined") return null;
  const below = rect ? rect.bottom + 280 < window.innerHeight : true;
  return createPortal(
    <AnimatePresence>
      {open && rect && (
        <motion.div
          id={listId}
          role="listbox"
          aria-label={token ? TITLES[token.kind] : undefined}
          initial={{ opacity: 0, y: below ? -4 : 4, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, transition: motionTokens.instant }}
          transition={motionTokens.quick}
          onMouseDown={(event) => event.preventDefault()}
          style={{
            position: "fixed",
            left: Math.min(rect.left - 6, window.innerWidth - 272),
            ...(below ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
          }}
          className="z-[60] w-64 overflow-hidden rounded-lg border bg-popover p-1 text-popover-foreground shadow-[0_10px_38px_-10px_rgb(0_0_0/0.22),0_1px_3px_rgb(0_0_0/0.06)]"
        >
          {token && (
            <div className="px-2 pt-1 pb-1.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              {TITLES[token.kind]}
            </div>
          )}
          {items.map((item, index) => (
            <button
              key={item.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => anchor && accept(anchor, item)}
              className={cn(
                "flex h-7 w-full items-center gap-2 rounded-md px-2 text-start text-ui transition-colors coarse:h-11 coarse:text-[15px] [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground coarse:[&_svg]:size-4",
                index === active && "bg-muted",
              )}
            >
              {item.icon}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              {item.hint && <span className="shrink-0 font-mono text-[10.5px] text-muted-foreground tabular-nums">{item.hint}</span>}
            </button>
          ))}
          <div className="mt-1 flex items-center gap-2 border-t border-hairline px-2 pt-1.5 pb-0.5 text-[10.5px] text-muted-foreground coarse:hidden">
            <span>↑↓ choose</span>
            <span>↵ insert</span>
            <span className="ms-auto">esc dismiss</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
