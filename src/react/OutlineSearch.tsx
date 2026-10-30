"use client";

import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Input, Label, TextField } from "react-aria-components";
import { validateOutline, type OutlineNode } from "../core/index.js";
import {
  getOutlineItemDetails,
  type OutlineDetailsGetter,
  type OutlineItemDetails,
} from "../core/outline-productivity.js";
import { searchOutline, type OutlineSearchMatch } from "../core/outline-search.js";
import { HighlightText } from "./HighlightText.js";
import { Outliner, type OutlineRenderContext, type OutlinerProps } from "./Outliner.js";
import { RichContent } from "./RichContent.js";
import { OutlineCheck } from "./OutlineGlyph.js";

export type OutlineSearchMode = "context" | "flat";
export type OutlineSearchNoteMode = "show" | "first-line" | "hide";
type ReaderSlots<T> = Pick<
  OutlinerProps<T>,
  | "renderContent"
  | "renderBody"
  | "renderAccessory"
  | "renderCollapsed"
  | "renderStatus"
  | "renderSuffix"
  | "getRichContent"
  | "richRegistry"
  | "allowMedia"
  | "getDisclosureLabel"
  | "disclosurePosition"
>;
export interface OutlineSearchProps<T = unknown> extends ReaderSlots<T> {
  readonly nodes: readonly OutlineNode<T>[];
  readonly getDetails?: OutlineDetailsGetter<T>;
  readonly query?: string;
  readonly defaultQuery?: string;
  readonly onQueryChange?: (query: string) => void;
  readonly mode?: OutlineSearchMode;
  readonly defaultMode?: OutlineSearchMode;
  readonly onModeChange?: (mode: OutlineSearchMode) => void;
  /** Include this canonical row and its descendants. Search paths retain real ancestors. */
  readonly scopeId?: string;
  /** A navigation request only: no edit, selection, or persistence is performed here. */
  readonly onReveal?: (id: string) => void;
  /** Host-owned action, rendered only when supplied. There is no remote search service. */
  readonly onSearchEverywhere?: (query: string) => void;
  readonly defaultExpandedIds?: ReadonlySet<string>;
  readonly defaultHideCompleted?: boolean;
  readonly defaultNoteMode?: OutlineSearchNoteMode;
  readonly label?: string;
  readonly searchLabel?: string;
  readonly className?: string;
}

interface Entry<T> {
  readonly node: OutlineNode<T>;
  readonly parentId: string | null;
  readonly depth: number;
  readonly details: OutlineItemDetails;
  readonly inScope: boolean;
  readonly hiddenCompleted: boolean;
}

/**
 * Optional local-search reader, never an editor or replacement document. Pruned trees
 * are private rendering projections; every trusted slot receives the canonical node.
 * Search expansion and ordinary folds are independent local visibility state.
 */
export function OutlineSearch<T = unknown>({
  nodes,
  getDetails,
  query,
  defaultQuery = "",
  onQueryChange,
  mode,
  defaultMode = "context",
  onModeChange,
  scopeId,
  onReveal,
  onSearchEverywhere,
  defaultExpandedIds,
  defaultHideCompleted = false,
  defaultNoteMode = "show",
  label = "Outline search",
  searchLabel = "Search outline",
  className,
  renderContent,
  renderBody,
  renderAccessory,
  renderCollapsed,
  renderStatus,
  renderSuffix,
  getRichContent,
  richRegistry,
  allowMedia,
  getDisclosureLabel,
  disclosurePosition,
}: OutlineSearchProps<T>) {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localQuery, setLocalQuery] = useState(defaultQuery);
  const [localMode, setLocalMode] = useState(defaultMode);
  const [hideCompleted, setHideCompleted] = useState(defaultHideCompleted);
  const [noteMode, setNoteMode] = useState(defaultNoteMode);
  const activeQuery = query ?? localQuery;
  const searching = activeQuery.trim().length > 0;
  const activeMode = mode ?? localMode;
  const snapshot = useMemo(() => {
    const issues = validateOutline(nodes);
    const entries = new Map<string, Entry<T>>();
    if (issues.length) return { entries, issues };
    const pending = nodes
      .map((node) => ({
        node,
        parentId: null as string | null,
        depth: 0,
        inScope: scopeId === undefined,
        hiddenCompleted: false,
      }))
      .reverse();
    while (pending.length) {
      const frame = pending.pop()!;
      const details = getOutlineItemDetails(frame.node, getDetails);
      const inScope = frame.inScope || frame.node.id === scopeId;
      const hiddenCompleted = frame.hiddenCompleted || details.completed === true;
      entries.set(frame.node.id, { ...frame, details, inScope, hiddenCompleted });
      for (let index = (frame.node.children?.length ?? 0) - 1; index >= 0; index--)
        pending.push({
          node: frame.node.children![index]!,
          parentId: frame.node.id,
          depth: frame.depth + 1,
          inScope,
          hiddenCompleted,
        });
    }
    return { entries, issues };
  }, [nodes, getDetails, scopeId]);
  const [ordinaryExpanded, setOrdinaryExpanded] = useState<ReadonlySet<string>>(() =>
    defaultExpandedIds === undefined
      ? new Set(
          [...snapshot.entries.values()]
            .filter(({ node }) => node.children?.length)
            .map(({ node }) => node.id),
        )
      : new Set(defaultExpandedIds),
  );
  const [searchExpansion, setSearchExpansion] = useState<{
    query: string;
    ids: ReadonlySet<string>;
  } | null>(null);
  const [revealedParents, setRevealedParents] = useState<{
    query: string;
    scopeId: string | undefined;
    ids: ReadonlySet<string>;
  } | null>(null);
  useEffect(() => {
    setSearchExpansion(null);
    setRevealedParents(null);
  }, [activeQuery, scopeId]);
  const revealedParentIds =
    revealedParents?.query === activeQuery && revealedParents.scopeId === scopeId
      ? revealedParents.ids
      : new Set<string>();
  // Cache normalized details for this immutable snapshot; never pass projected rows to a getter.
  const result = useMemo(
    () =>
      searchOutline(nodes, activeQuery, {
        getDetails: (node) => snapshot.entries.get(node.id)?.details,
        scopeId,
      }),
    [nodes, activeQuery, scopeId, snapshot],
  );
  const matches = new Map<string, OutlineSearchMatch>();
  for (const match of result.matches) {
    const entry = snapshot.entries.get(match.id);
    if (entry && (!hideCompleted || !entry.hiddenCompleted)) matches.set(match.id, match);
  }
  const invalid =
    snapshot.issues.length > 0 ||
    result.diagnostics.some(
      (diagnostic) =>
        !["visit-limit", "result-limit", "range-limit", "scope-not-found"].includes(
          diagnostic.code,
        ),
    );
  const missingScope = scopeId !== undefined && !snapshot.entries.has(scopeId);
  const baseIncluded = new Set<string>();
  if (!invalid && !missingScope) {
    if (searching) {
      for (const matchId of matches.keys()) {
        for (
          let current = snapshot.entries.get(matchId);
          current;
          current = current.parentId === null ? undefined : snapshot.entries.get(current.parentId)
        ) {
          if (baseIncluded.has(current.node.id)) break;
          baseIncluded.add(current.node.id);
        }
      }
    } else {
      for (const entry of snapshot.entries.values())
        if (entry.inScope && (!hideCompleted || !entry.hiddenCompleted))
          baseIncluded.add(entry.node.id);
    }
  }
  const included = new Set(baseIncluded);
  const eligibleChild = (child: OutlineNode<T>): boolean => {
    const entry = snapshot.entries.get(child.id)!;
    return entry.inScope && (!hideCompleted || !entry.hiddenCompleted);
  };
  if (searching && activeMode === "context") {
    // Parent-before-child order admits one explicit level at a time. Hidden or
    // disconnected reveal flags can never introduce an unanchored branch.
    for (const entry of snapshot.entries.values()) {
      if (!included.has(entry.node.id) || !revealedParentIds.has(entry.node.id)) continue;
      for (const child of entry.node.children ?? [])
        if (eligibleChild(child)) included.add(child.id);
    }
  }
  // Bottom-up construction avoids recursive projection and never mutates canonical children.
  const projected = new Map<string, OutlineNode<T>>();
  for (const entry of [...snapshot.entries.values()].reverse()) {
    if (!included.has(entry.node.id)) continue;
    const children = entry.node.children?.flatMap((child) =>
      projected.has(child.id) ? [projected.get(child.id)!] : [],
    );
    projected.set(entry.node.id, {
      ...entry.node,
      checked: entry.details.checkbox ? entry.details.completed === true : undefined,
      ...(children ? { children } : {}),
    });
  }
  const roots = [...snapshot.entries.values()]
    .filter(
      (entry) =>
        included.has(entry.node.id) && (entry.parentId === null || !included.has(entry.parentId)),
    )
    .map((entry) => projected.get(entry.node.id)!);
  const searchExpanded = searchExpansion?.query === activeQuery ? searchExpansion.ids : included;
  const canonical = (node: OutlineNode<T>) => snapshot.entries.get(node.id)!.node;
  const setQuery = (next: string) => {
    if (query === undefined) setLocalQuery(next);
    setSearchExpansion(null);
    setRevealedParents(null);
    onQueryChange?.(next);
  };
  const toggleAdditionalChildren = (node: OutlineNode<T>) => {
    const next = new Set(revealedParentIds);
    if (next.has(node.id)) {
      // Hiding also forgets deeper reveal requests, so reopening still reveals
      // only one level. True match/ancestor paths remain in baseIncluded.
      const pending = [node];
      while (pending.length) {
        const current = pending.pop()!;
        next.delete(current.id);
        for (const child of current.children ?? []) pending.push(child);
      }
    } else {
      next.add(node.id);
      const expanded = new Set(searchExpanded);
      expanded.add(node.id);
      setSearchExpansion({ query: activeQuery, ids: expanded });
    }
    setRevealedParents({ query: activeQuery, scopeId, ids: next });
  };
  const additionalChildrenControl = (node: OutlineNode<T>): ReactNode => {
    if (
      !searching ||
      activeMode !== "context" ||
      !node.children?.some((child) => eligibleChild(child) && !baseIncluded.has(child.id))
    )
      return null;
    const revealed = revealedParentIds.has(node.id);
    return (
      <Button
        type="button"
        className="fux-control fast-ux-outline-search__additional-toggle"
        aria-label={`${revealed ? "Hide additional children of" : "Show all children of"} ${node.text}`}
        aria-pressed={revealed}
        onPress={() => toggleAdditionalChildren(node)}
      >
        {revealed ? "Hide additional children" : "Show all children"}
      </Button>
    );
  };
  const rowAccessory = (node: OutlineNode<T>): ReactNode => {
    const custom = renderAccessory?.(node);
    const additional = additionalChildrenControl(node);
    if ((custom == null || typeof custom === "boolean") && !additional && !onReveal) return null;
    return (
      <div className="fast-ux-outline-search__row-actions">
        {custom}
        {additional}
        {onReveal && (
          <Button
            type="button"
            className="fux-control"
            aria-label={`Reveal ${node.text}`}
            onPress={() => onReveal(node.id)}
          >
            Reveal
          </Button>
        )}
      </div>
    );
  };
  const setMode = (next: OutlineSearchMode) => {
    if (mode === undefined) setLocalMode(next);
    onModeChange?.(next);
  };
  const clear = () => {
    setQuery("");
    inputRef.current?.focus();
  };
  const title = (node: OutlineNode<T>, context: OutlineRenderContext): ReactNode => {
    if (renderContent) return renderContent(node, context);
    const rich = getRichContent?.(node);
    if (rich)
      return <RichContent document={rich} registry={richRegistry} allowMedia={allowMedia} />;
    return (
      <HighlightText
        text={node.text}
        highlights={(matches.get(node.id)?.titleRanges ?? []).map((range, index) => ({
          ...range,
          key: String(index),
        }))}
      />
    );
  };
  const note = (node: OutlineNode<T>): ReactNode => {
    const text = snapshot.entries.get(node.id)?.details.note;
    if (!text || noteMode === "hide") return null;
    const visible =
      noteMode === "first-line" ? text.split(/\r\n|[\r\n\u2028\u2029]/u, 1)[0]! : text;
    return (
      <p className="fast-ux-outline-search__note">
        <HighlightText
          text={visible}
          highlights={(matches.get(node.id)?.noteRanges ?? [])
            .filter((range) => range.end <= visible.length)
            .map((range, index) => ({ ...range, key: String(index) }))}
        />
      </p>
    );
  };
  const readOnlyStatus = (node: OutlineNode<T>, flat = false): ReactNode => {
    const details = snapshot.entries.get(node.id)!.details;
    if (details.checkbox && flat) {
      return (
        <span
          className="fast-ux-outline-search__task-mark"
          role="img"
          aria-label={details.completed ? "Completed task" : "Incomplete task"}
          data-checked={details.completed === true}
        >
          <OutlineCheck checked={details.completed === true} />
        </span>
      );
    }
    if (!details.checkbox && details.completed) {
      return (
        <span className="fast-ux-outline-search__completed" role="img" aria-label="Completed item">
          Completed
        </span>
      );
    }
    return null;
  };
  const body = (node: OutlineNode<T>): ReactNode => {
    const noteContent = note(node);
    const additional = renderBody?.(node);
    if (noteContent === null && (additional == null || typeof additional === "boolean"))
      return null;
    return (
      <>
        {noteContent}
        {additional}
      </>
    );
  };
  const status = invalid
    ? "Search unavailable: invalid query or outline."
    : missingScope
      ? "Search scope was not found."
      : searching
        ? `${matches.size} ${matches.size === 1 ? "result" : "results"}${result.truncated ? " (partial)" : ""}.`
        : "Showing outline.";
  const path = (entry: Entry<T>): string => {
    const labels: string[] = [];
    for (
      let current = entry.parentId === null ? undefined : snapshot.entries.get(entry.parentId);
      current;
      current = current.parentId === null ? undefined : snapshot.entries.get(current.parentId)
    )
      labels.push(current.node.text);
    return labels.reverse().join(" / ");
  };

  return (
    <section
      className={["fast-ux-outline-search", className].filter(Boolean).join(" ")}
      aria-label={label}
      data-read-only="true"
      data-mode={activeMode}
    >
      <div className="fast-ux-outline-search__controls">
        <TextField
          value={activeQuery}
          onChange={setQuery}
          className="fast-ux-outline-search__field"
          isInvalid={invalid}
        >
          <Label>{searchLabel}</Label>
          <Input
            ref={inputRef}
            type="search"
            aria-describedby={`${id}-status ${id}-help`}
            onKeyDown={(event) => {
              if (
                event.nativeEvent.isComposing ||
                event.keyCode === 229 ||
                event.altKey ||
                event.ctrlKey ||
                event.metaKey
              )
                return;
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                clear();
              }
              if (event.key === "Enter" && event.shiftKey) {
                event.preventDefault();
                event.stopPropagation();
                setMode("flat");
              }
            }}
          />
        </TextField>
        <Button
          type="button"
          className="fux-control"
          isDisabled={!activeQuery.length}
          onPress={clear}
        >
          Clear search
        </Button>
        <Button
          type="button"
          className="fux-control"
          aria-pressed={activeMode === "flat"}
          onPress={() => setMode(activeMode === "flat" ? "context" : "flat")}
        >
          Flat results
        </Button>
        <Button
          type="button"
          className="fux-control"
          aria-pressed={hideCompleted}
          onPress={() => setHideCompleted(!hideCompleted)}
        >
          Hide completed
        </Button>
        <div
          className="fast-ux-outline-search__note-controls"
          role="group"
          aria-label="Note display"
        >
          {(["show", "first-line", "hide"] as const).map((value) => (
            <Button
              key={value}
              type="button"
              className="fux-control"
              aria-pressed={noteMode === value}
              onPress={() => setNoteMode(value)}
            >
              {value === "show"
                ? "Show notes"
                : value === "first-line"
                  ? "First-line notes"
                  : "Hide notes"}
            </Button>
          ))}
        </div>
        {onSearchEverywhere && (
          <Button
            type="button"
            className="fux-control"
            onPress={() => onSearchEverywhere(activeQuery)}
          >
            Search everywhere
          </Button>
        )}
      </div>
      <p id={`${id}-help`} className="fast-ux-outline-search__help">
        Local outline search. Escape clears; Shift+Enter shows flat results.
      </p>
      <p id={`${id}-status`} role="status" aria-live="polite" aria-atomic="true">
        {status}
      </p>
      {result.diagnostics.length > 0 && (
        <ul className="fast-ux-outline-search__diagnostics" aria-label="Search details">
          {result.diagnostics.map((diagnostic, index) => (
            <li key={index}>{diagnostic.message}</li>
          ))}
        </ul>
      )}
      {result.truncated && (
        <p role="note">
          Search results or highlights are incomplete because a search limit was reached.
        </p>
      )}
      {!invalid && !missingScope && searching && matches.size === 0 && (
        <p>No results in this view.</p>
      )}
      {!invalid &&
        !missingScope &&
        (searching && activeMode === "flat" ? (
          <ul role="list" className="fast-ux-outline-search__results" aria-label="Search results">
            {[...matches.keys()].map((matchId) => {
              const entry = snapshot.entries.get(matchId)!;
              const node = entry.node;
              const ancestors = path(entry);
              return (
                <li key={node.id} data-node-id={node.id} data-search-kind="match">
                  {ancestors && (
                    <p className="fast-ux-outline-search__path" aria-label="Ancestor path">
                      {ancestors}
                    </p>
                  )}
                  <div className="fast-ux-outline-search__result-row">
                    <div className="fast-ux-outline-search__result-content">
                      {readOnlyStatus(node, true)}
                      {renderStatus?.(node)}
                      {title(node, {
                        depth: entry.depth,
                        hasChildren: !!node.children?.length,
                        isExpanded: false,
                        hoist: () => onReveal?.(node.id),
                      })}
                      {renderSuffix?.(node)}
                      {body(node)}
                    </div>
                    {renderAccessory?.(node)}
                    {onReveal && (
                      <Button
                        type="button"
                        className="fux-control"
                        aria-label={`Reveal ${node.text}`}
                        onPress={() => onReveal(node.id)}
                      >
                        Reveal
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <Outliner
            key={searching ? `search:${activeQuery}` : "reader"}
            nodes={roots}
            aria-label="Outline results"
            expandedIds={searching ? searchExpanded : ordinaryExpanded}
            onExpandedChange={(next) =>
              searching
                ? setSearchExpansion({ query: activeQuery, ids: next })
                : setOrdinaryExpanded(next)
            }
            disclosurePosition={disclosurePosition}
            renderContent={(row, context) => (
              <div
                data-search-kind={
                  searching
                    ? matches.has(row.id)
                      ? "match"
                      : baseIncluded.has(row.id)
                        ? "context"
                        : "additional"
                    : undefined
                }
              >
                {title(canonical(row), context)}
              </div>
            )}
            renderBody={(row) => body(canonical(row))}
            renderStatus={(row) => (
              <>
                {searching && !matches.has(row.id) && (
                  <span className="fast-ux-outline-search__context-label">
                    {baseIncluded.has(row.id) ? "Context ancestor: " : "Additional context: "}
                  </span>
                )}
                {readOnlyStatus(canonical(row))}
                {renderStatus?.(canonical(row))}
              </>
            )}
            renderSuffix={renderSuffix ? (row) => renderSuffix(canonical(row)) : undefined}
            renderCollapsed={renderCollapsed ? (row) => renderCollapsed(canonical(row)) : undefined}
            renderAccessory={(row) => rowAccessory(canonical(row))}
            getDisclosureLabel={
              getDisclosureLabel
                ? (row, expanded) => getDisclosureLabel(canonical(row), expanded)
                : undefined
            }
          />
        ))}
    </section>
  );
}
