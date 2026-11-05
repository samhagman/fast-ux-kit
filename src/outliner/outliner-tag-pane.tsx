import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { AtSign, Hash, X } from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import type { resolveLabels } from "./labels.js";
import type { OutlineDocument } from "./types.js";
import { coOccurring, tagInventory, type TagEntry } from "./tag-pane.js";

type Labels = ReturnType<typeof resolveLabels>;

export interface TagPaneProps {
  readonly documents: readonly OutlineDocument[];
  readonly activeId: string | null;
  /** "document": the open document only; "all": every document. */
  readonly scope: "document" | "all";
  readonly onScope: (scope: "document" | "all") => void;
  /** Tags that filter right now (lower case), in the order they were chosen. */
  readonly selected: readonly string[];
  /** Filter by these tags (empty: clear the filter). */
  readonly onSelect: (tags: readonly string[]) => void;
  readonly labels: Labels;
}

/**
 * Every #tag and @mention with how many items carry it, for this document or all of them. A
 * click filters by it (search `#tag`, in the same scope); while a tag filters, "With #tag" lists
 * the tags that share its items, and choosing one narrows to items carrying both.
 *
 *   [ This document | All ]
 *   TAGS                                ●  #launch      12
 *   #launch         12                     WITH #LAUNCH
 *   #safety          4                     #safety        3
 *   PEOPLE                                 @marco         2
 *   @marco           6
 */
export function TagPane({
  documents,
  activeId,
  scope,
  onScope,
  selected,
  onSelect,
  labels: L,
}: TagPaneProps) {
  const sources = React.useMemo(
    () => (scope === "all" ? documents : documents.filter((doc) => doc.id === activeId)),
    [documents, activeId, scope],
  );
  const inventory = React.useMemo(() => tagInventory(sources), [sources]);
  const together = React.useMemo(() => coOccurring(inventory, selected), [inventory, selected]);
  const tags = inventory.tags.filter((tag) => tag.kind === "tag");
  const people = inventory.tags.filter((tag) => tag.kind === "mention");
  const choose = (key: string) =>
    onSelect(selected.length === 1 && selected[0] === key ? [] : [key]);
  const max = inventory.tags[0]?.count ?? 1;
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-tag-pane="">
      <div className="flex shrink-0 items-center gap-2 px-2 pt-2 pb-1.5">
        <div
          role="radiogroup"
          aria-label={L.tagScope}
          className="grid flex-1 grid-cols-2 gap-px rounded-md border border-hairline p-px"
        >
          {(["document", "all"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              data-tag-scope={value}
              onClick={() => onScope(value)}
              className={cn(
                "relative h-6 rounded-[5px] text-[11.5px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-signal/30 coarse:h-9",
                scope === value ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {scope === value && (
                <motion.span
                  layoutId="tag-scope"
                  transition={motionTokens.layout}
                  className="absolute inset-0 rounded-[5px] bg-muted"
                />
              )}
              <span className="relative">
                {value === "document" ? L.thisDocument : L.allDocuments}
              </span>
            </button>
          ))}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {selected.length > 0 && (
          <motion.div
            key="filter"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={motionTokens.base}
            className="shrink-0 overflow-hidden"
          >
            <div className="mx-2 mb-1.5 flex flex-wrap items-center gap-1 rounded-md border border-signal/25 bg-signal-muted/60 p-1">
              {selected.map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-label={L.removeTagFilter(key)}
                  onClick={() => onSelect(selected.filter((other) => other !== key))}
                  className="inline-flex h-6 items-center gap-1 rounded-[5px] bg-background px-1.5 font-mono text-[11px] text-signal ring-1 ring-signal/25 coarse:h-9"
                >
                  {key} <X className="size-3" />
                </button>
              ))}
              <button
                type="button"
                onClick={() => onSelect([])}
                className="ms-auto h-6 rounded-[5px] px-1.5 text-[11px] text-muted-foreground hover:text-foreground coarse:h-9"
              >
                {L.clearSearch}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-2 text-ui">
        {selected.length > 0 && (
          <TagGroup heading={L.withTags(selected.join(" "))} empty={L.noCoOccurring}>
            {together.map((tag) => (
              <TagRow
                key={tag.key}
                label={tag.label}
                count={tag.count}
                max={together[0]?.count ?? 1}
                kind={tag.key.startsWith("@") ? "mention" : "tag"}
                onClick={() => onSelect([...selected, tag.key])}
                hint={L.narrowBy(tag.label)}
              />
            ))}
          </TagGroup>
        )}
        {!inventory.tags.length && (
          <p className="px-2 py-6 text-center text-ui text-muted-foreground">
            {scope === "all" ? L.noTagsAnywhere : L.noTagsHere}
          </p>
        )}
        {tags.length > 0 && (
          <TagGroup heading={L.tags}>
            {tags.map((tag) => (
              <TagRow
                key={tag.key}
                tag={tag}
                label={tag.label}
                count={tag.count}
                max={max}
                kind="tag"
                on={selected.includes(tag.key)}
                onClick={() => choose(tag.key)}
                scope={scope}
                labels={L}
              />
            ))}
          </TagGroup>
        )}
        {people.length > 0 && (
          <TagGroup heading={L.people}>
            {people.map((tag) => (
              <TagRow
                key={tag.key}
                tag={tag}
                label={tag.label}
                count={tag.count}
                max={max}
                kind="mention"
                on={selected.includes(tag.key)}
                onClick={() => choose(tag.key)}
                scope={scope}
                labels={L}
              />
            ))}
          </TagGroup>
        )}
      </div>
    </div>
  );
}

function TagGroup({
  heading,
  empty,
  children,
}: {
  readonly heading: string;
  readonly empty?: string;
  readonly children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <section className="mt-1.5" aria-label={heading}>
      <h3 className="px-2 pb-0.5 font-mono text-[10px] font-normal tracking-wide text-muted-foreground/80 uppercase">
        {heading}
      </h3>
      {items.length ? (
        <ul>{items}</ul>
      ) : empty ? (
        <p className="px-2 py-1 text-[12px] text-muted-foreground">{empty}</p>
      ) : null}
    </section>
  );
}

function TagRow({
  tag,
  label,
  count,
  max,
  kind,
  on = false,
  onClick,
  hint,
  scope,
  labels: L,
}: {
  readonly tag?: TagEntry;
  readonly label: string;
  readonly count: number;
  readonly max: number;
  readonly kind: "tag" | "mention";
  readonly on?: boolean;
  readonly onClick: () => void;
  readonly hint?: string;
  readonly scope?: "document" | "all";
  readonly labels?: Labels;
}) {
  const Icon = kind === "mention" ? AtSign : Hash;
  const spread = tag && scope === "all" && L ? L.inDocuments(tag.documents) : undefined;
  return (
    <li>
      <button
        type="button"
        aria-pressed={hint ? undefined : on}
        data-tag-row={label.toLowerCase()}
        title={hint ?? spread}
        onClick={onClick}
        className={cn(
          "group/tag relative flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-start transition-colors outline-none hover:bg-muted focus-visible:bg-muted focus-visible:ring-2 focus-visible:ring-signal/30 coarse:h-11",
          on
            ? "bg-signal-muted font-medium text-signal hover:bg-signal-muted"
            : "text-foreground/85",
        )}
      >
        <Icon className={cn("size-3 shrink-0", on ? "text-signal" : "text-muted-foreground")} />
        <span dir="auto" className="min-w-0 flex-1 truncate">
          {label.slice(1)}
        </span>
        {spread && (
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground/70">{spread}</span>
        )}
        {/* A short meter for relative frequency: the inventory reads at a glance. */}
        <span
          aria-hidden
          className="h-1 w-6 shrink-0 overflow-hidden rounded-full bg-foreground/[0.06]"
        >
          <span
            className={cn("block h-full rounded-full", on ? "bg-signal/60" : "bg-foreground/25")}
            style={{ width: `${Math.max(12, (count / Math.max(1, max)) * 100)}%` }}
          />
        </span>
        <span className="w-5 shrink-0 text-end font-mono text-[10.5px] text-muted-foreground tabular-nums">
          {count}
        </span>
      </button>
    </li>
  );
}
