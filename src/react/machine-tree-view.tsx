"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Button } from "react-aria-components";
import {
  buildMachineTree,
  projectMachineTree,
  machineTreeAncestors,
  resolveMachineTreeTarget,
  resolveMachineTreeSource,
  type MachineTreeRow,
} from "../core/machine/tree.js";
import type { MachineDocument } from "../core/machine/types.js";

export interface MachineTreeViewProps {
  /** Read-only topology. This component never edits or executes the document. */
  readonly value: MachineDocument;
  readonly label?: string;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly dir?: "ltr" | "rtl";
  readonly selectedId?: string | null;
  readonly defaultSelectedId?: string | null;
  readonly onSelectionChange?: (id: string | null, row: MachineTreeRow | null) => void;
  /** Row IDs, not state IDs. Controlled changes remain proposals until accepted. */
  readonly expandedIds?: readonly string[];
  readonly defaultExpandedIds?: readonly string[];
  readonly onExpandedChange?: (ids: readonly string[]) => void;
  /** Supplied observations; state containment does not imply actor containment. */
  readonly activeStates?: readonly {
    readonly machineId: string;
    readonly activeIds: readonly string[];
  }[];
  readonly query?: string;
  readonly defaultQuery?: string;
  readonly onQueryChange?: (query: string) => void;
  readonly showSearch?: boolean;
  readonly showToolbar?: boolean;
  readonly showInspector?: boolean;
  readonly defaultShowTransitions?: boolean;
  readonly defaultShowNotes?: boolean;
  readonly maxItems?: number;
  readonly maxDepth?: number;
  readonly maxVisibleRows?: number;
  /** Trusted React presentation. Do not introduce another row focus manager. */
  readonly renderLabel?: (row: MachineTreeRow, state: { readonly selected: boolean }) => ReactNode;
  readonly renderDetails?: (row: MachineTreeRow) => ReactNode;
  readonly renderEmpty?: ReactNode;
}

const kinds: Record<string, string> = {
  machine: "Machine",
  atomic: "State",
  compound: "Compound",
  parallel: "Parallel",
  initial: "Initial marker",
  final: "Final",
  submachine: "Reference",
  note: "Note",
  transition: "Transition",
};
const marks: Record<string, string> = {
  machine: "◇",
  atomic: "○",
  compound: "▣",
  parallel: "∥",
  initial: "●",
  final: "◎",
  submachine: "↗",
  note: "≡",
  transition: "↳",
};
const rowKind = (row: MachineTreeRow) => row.node?.kind ?? row.kind;
const rowName = (row: MachineTreeRow) => `${kinds[rowKind(row)] ?? row.kind}: ${row.label}`;

/** An accessible topology outline. Selection, folding and reveal are view operations only. */
export function MachineTreeView({
  value,
  label = "Machine tree",
  className = "",
  style,
  dir,
  selectedId: controlledSelection,
  defaultSelectedId = null,
  onSelectionChange,
  expandedIds: controlledExpansion,
  defaultExpandedIds,
  onExpandedChange,
  activeStates,
  query: controlledQuery,
  defaultQuery = "",
  onQueryChange,
  showSearch = true,
  showToolbar = true,
  showInspector = true,
  defaultShowTransitions = true,
  defaultShowNotes = true,
  maxItems,
  maxDepth,
  maxVisibleRows,
  renderLabel,
  renderDetails,
  renderEmpty,
}: MachineTreeViewProps) {
  const uid = useId();
  const model = useMemo(
    () => buildMachineTree(value, { activeStates, maxItems, maxDepth }),
    [value, activeStates, maxItems, maxDepth],
  );
  const byId = useMemo(() => new Map(model.rows.map((row) => [row.id, row])), [model]);
  const [localSelection, setLocalSelection] = useState<string | null>(defaultSelectedId);
  const [localExpansion, setLocalExpansion] = useState<readonly string[]>(
    () =>
      defaultExpandedIds ??
      model.rows.filter((row) => row.childIds.length > 0).map((row) => row.id),
  );
  const [localQuery, setLocalQuery] = useState(defaultQuery);
  const [showTransitions, setShowTransitions] = useState(defaultShowTransitions);
  const [showNotes, setShowNotes] = useState(defaultShowNotes);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const selectedId = controlledSelection === undefined ? localSelection : controlledSelection;
  const query = controlledQuery ?? localQuery;
  const expansion = controlledExpansion ?? localExpansion;
  const expanded = useMemo(() => new Set(expansion), [expansion]);
  const projection = useMemo(
    () =>
      projectMachineTree(model, {
        expandedIds: expanded,
        query,
        showTransitions,
        showNotes,
        maxVisibleRows,
      }),
    [model, expanded, query, showTransitions, showNotes, maxVisibleRows],
  );
  const visible = projection.rows;
  const visibleIds = useMemo(() => new Set(visible.map((row) => row.id)), [visible]);
  const selected = selectedId ? byId.get(selectedId) : undefined;
  const tabId = focusedId && visibleIds.has(focusedId) ? focusedId : visible[0]?.id;
  const rowElements = useRef(new Map<string, HTMLDivElement>());
  const treeElement = useRef<HTMLDivElement>(null);
  const ownsFocus = useRef(false);
  const [pendingFocus, setPendingFocus] = useState<string | null>(null);
  const previousRows = useRef(byId);
  const typeahead = useRef({ text: "", time: 0 });

  function focusRow(id: string) {
    const element = rowElements.current.get(id);
    if (!element) return;
    setFocusedId(id);
    element.focus({ preventScroll: true });
    element.scrollIntoView?.({ block: "nearest", inline: "nearest", behavior: "auto" });
  }
  useEffect(() => {
    const pending = pendingFocus;
    if (pending) {
      setPendingFocus(null);
      if (visibleIds.has(pending)) focusRow(pending);
    } else if (focusedId && !visibleIds.has(focusedId)) {
      let candidate = previousRows.current.get(focusedId)?.parentId;
      const seen = new Set<string>();
      while (candidate && !visibleIds.has(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        candidate = previousRows.current.get(candidate)?.parentId;
      }
      const fallback = candidate && visibleIds.has(candidate) ? candidate : visible[0]?.id;
      setFocusedId(fallback ?? null);
      if (fallback && ownsFocus.current) focusRow(fallback);
    }
    previousRows.current = byId;
  }, [byId, visibleIds, focusedId, visible, pendingFocus]);

  function select(row: MachineTreeRow) {
    if (controlledSelection === undefined) setLocalSelection(row.id);
    onSelectionChange?.(row.id, row);
  }
  function changeExpansion(ids: readonly string[]) {
    const next = Array.from(new Set(ids)).filter((id) => (byId.get(id)?.childIds.length ?? 0) > 0);
    if (controlledExpansion === undefined) setLocalExpansion(next);
    onExpandedChange?.(next);
  }
  function changeQuery(next: string) {
    if (controlledQuery === undefined) setLocalQuery(next);
    onQueryChange?.(next);
  }
  function toggle(row: MachineTreeRow) {
    const next = new Set(expanded);
    if (next.has(row.id)) next.delete(row.id);
    else next.add(row.id);
    changeExpansion([...next]);
  }
  function ancestors(id: string) {
    return machineTreeAncestors(model, id);
  }
  function reveal(row: MachineTreeRow) {
    changeQuery("");
    if (row.kind === "transition") setShowTransitions(true);
    if (row.node?.kind === "note") setShowNotes(true);
    changeExpansion([...expanded, ...ancestors(row.id)]);
    select(row);
    setPendingFocus(row.id);
    if (visibleIds.has(row.id)) {
      setPendingFocus(null);
      focusRow(row.id);
    }
    setAnnouncement(`Reveal requested for ${row.label}. Navigation does not execute the machine.`);
  }
  function revealActive() {
    const active = model.rows.filter((row) => row.active);
    if (!active.length) {
      setAnnouncement("No supplied active states are present in this document.");
      return;
    }
    changeQuery("");
    changeExpansion([...expanded, ...active.flatMap((row) => ancestors(row.id))]);
    const first = active[0]!;
    select(first);
    setPendingFocus(first.id);
    if (visibleIds.has(first.id)) {
      setPendingFocus(null);
      focusRow(first.id);
    }
    setAnnouncement(`${active.length} supplied active states. Ancestor expansion requested.`);
  }
  function keyDown(event: KeyboardEvent<HTMLDivElement>, row: (typeof visible)[number]) {
    if (
      event.target !== event.currentTarget ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey
    )
      return;
    const rtl =
      dir === "rtl" ||
      (dir === undefined && getComputedStyle(event.currentTarget).direction === "rtl");
    const openKey = rtl ? "ArrowLeft" : "ArrowRight";
    const closeKey = rtl ? "ArrowRight" : "ArrowLeft";
    const index = visible.findIndex((item) => item.id === row.id);
    if (
      ["ArrowDown", "ArrowUp", "Home", "End", openKey, closeKey, "Enter", " "].includes(event.key)
    ) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (event.key === "ArrowDown") focusRow(visible[Math.min(visible.length - 1, index + 1)]!.id);
      else if (event.key === "ArrowUp") focusRow(visible[Math.max(0, index - 1)]!.id);
      else if (event.key === "Home") focusRow(visible[0]!.id);
      else if (event.key === "End") focusRow(visible[visible.length - 1]!.id);
      else if (event.key === openKey && row.hasChildren) {
        if (!row.expanded) toggle(row);
        else {
          const child = visible[index + 1];
          if (child && child.level > row.level) focusRow(child.id);
        }
      } else if (event.key === closeKey) {
        if (row.hasChildren && row.expanded && !query.trim()) toggle(row);
        else if (row.parentId && visibleIds.has(row.parentId)) focusRow(row.parentId);
      } else if (event.key === "Enter" || event.key === " ") select(row);
      return;
    }
    if (event.key.length === 1 && !event.shiftKey) {
      const now = Date.now();
      const prior = now - typeahead.current.time < 700 ? typeahead.current.text : "";
      const text = (prior + event.key).toLocaleLowerCase();
      typeahead.current = { text, time: now };
      const ordered = [...visible.slice(index + 1), ...visible.slice(0, index + 1)];
      const match = ordered.find((item) => item.label.toLocaleLowerCase().startsWith(text));
      if (match) {
        event.preventDefault();
        focusRow(match.id);
      }
    }
  }
  const target = selected?.transition ? resolveMachineTreeTarget(model, selected.id) : undefined;
  const source = selected?.transition ? resolveMachineTreeSource(model, selected.id) : undefined;
  const reference =
    selected?.node?.kind === "submachine"
      ? resolveMachineTreeTarget(model, selected.id)
      : undefined;
  const selectionHidden = selected && !visibleIds.has(selected.id);
  const selectionPath = selected
    ? [...ancestors(selected.id), selected.id].flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      })
    : [];
  const declaredInitialId =
    selected?.kind === "machine" ? selected.graph.initialId : selected?.node?.initialId;
  const activeCount = model.rows.filter((row) => row.active).length;
  return (
    <section className={`fux-machine-tree ${className}`} style={style} dir={dir} aria-label={label}>
      <header className="fux-machine-tree__header">
        <span className="fux-machine-tree__emblem" aria-hidden="true">
          ⌘
        </span>
        <div>
          <strong>{label}</strong>
          <p>Structure, routes and supplied state — without running the machine.</p>
        </div>
        <span className="fux-machine-tree__readonly">Read only</span>
      </header>
      {showToolbar && (
        <div className="fux-machine-tree__controls">
          {showSearch && (
            <label className="fux-machine-tree__search" htmlFor={`${uid}-search`}>
              <span>Find a state or transition</span>
              <input
                id={`${uid}-search`}
                type="search"
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.defaultPrevented ||
                    event.nativeEvent.isComposing ||
                    event.altKey ||
                    event.ctrlKey ||
                    event.metaKey ||
                    event.shiftKey
                  )
                    return;
                  if (event.key === "Escape" && query) {
                    event.preventDefault();
                    changeQuery("");
                  }
                  if (event.key === "Enter") {
                    const first = visible.find((row) => row.match);
                    if (first) {
                      event.preventDefault();
                      select(first);
                      focusRow(first.id);
                    }
                  }
                }}
              />
            </label>
          )}
          {query && (
            <Button className="fux-machine-tree__button" onPress={() => changeQuery("")}>
              Clear search
            </Button>
          )}
          <div className="fux-machine-tree__actions" role="group" aria-label="Tree view controls">
            <Button
              className="fux-machine-tree__button"
              onPress={() =>
                changeExpansion(
                  model.rows.filter((row) => row.childIds.length).map((row) => row.id),
                )
              }
            >
              Expand all
            </Button>
            <Button
              className="fux-machine-tree__button"
              onPress={() => changeExpansion([])}
              isDisabled={Boolean(query.trim())}
            >
              Collapse all
            </Button>
            <Button
              className="fux-machine-tree__button"
              onPress={revealActive}
              isDisabled={!activeCount}
            >
              Reveal active
            </Button>
          </div>
          <div className="fux-machine-tree__options">
            <label>
              <input
                type="checkbox"
                checked={showTransitions}
                onChange={(event) => setShowTransitions(event.target.checked)}
              />
              Transitions
            </label>
            <label>
              <input
                type="checkbox"
                checked={showNotes}
                onChange={(event) => setShowNotes(event.target.checked)}
              />
              Notes
            </label>
          </div>
        </div>
      )}
      <p className="fux-machine-tree__summary" role="status">
        {query.trim()
          ? `${projection.matchCount} matches. Ancestors are shown for context; search does not change saved folding.`
          : `${visible.length} visible items · ${activeCount} supplied active states.`}
        {(model.truncated || projection.truncated) && " View is limited; not all items are shown."}
      </p>
      {model.issues.length > 0 && (
        <details className="fux-machine-tree__issues">
          <summary>{model.issues.length} structure notices</summary>
          <ul>
            {model.issues.map((issue, index) => (
              <li key={index}>{issue.message}</li>
            ))}
          </ul>
        </details>
      )}
      <div
        className={`fux-machine-tree__workspace${showInspector ? "" : " fux-machine-tree__workspace--tree-only"}`}
      >
        <div className="fux-machine-tree__outline">
          <p id={`${uid}-keys`} className="fux-machine-tree__help">
            Arrow keys move or fold. Home and End jump. Enter or Space selects. Type a name to move
            focus.
          </p>
          <div
            ref={treeElement}
            role="tree"
            aria-label={label}
            aria-describedby={`${uid}-keys`}
            className="fux-machine-tree__tree"
            onFocusCapture={() => {
              ownsFocus.current = true;
            }}
            onBlurCapture={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget as Node | null))
                ownsFocus.current = false;
            }}
          >
            {visible.map((row) => (
              <div
                key={row.id}
                ref={(element) => {
                  if (element) rowElements.current.set(row.id, element);
                  else rowElements.current.delete(row.id);
                }}
                id={`${uid}-row-${encodeURIComponent(row.id)}`}
                role="treeitem"
                aria-label={rowName(row)}
                aria-describedby={`${uid}-meta-${encodeURIComponent(row.id)} ${uid}-status-${encodeURIComponent(row.id)}`}
                aria-level={row.level}
                aria-posinset={row.posInSet}
                aria-setsize={row.setSize}
                aria-expanded={row.hasChildren ? row.expanded : undefined}
                aria-selected={selectedId === row.id}
                tabIndex={tabId === row.id ? 0 : -1}
                className="fux-machine-tree__row"
                data-kind={rowKind(row)}
                data-active={row.active || undefined}
                data-active-descendant={row.activeDescendant || undefined}
                data-context={row.context || undefined}
                data-selected={selectedId === row.id || undefined}
                style={{ "--tree-depth": Math.min(row.level - 1, 8) } as CSSProperties}
                onFocus={(event) => {
                  if (event.target === event.currentTarget) setFocusedId(row.id);
                }}
                onKeyDown={(event) => keyDown(event, row)}
                onClick={(event) => {
                  if (
                    (event.target as Element).closest(
                      'button, a, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"]',
                    )
                  )
                    return;
                  select(row);
                  focusRow(row.id);
                }}
              >
                <span className="fux-machine-tree__connector" aria-hidden="true" />
                {row.hasChildren ? (
                  <Button
                    className="fux-machine-tree__disclosure"
                    aria-label={`${row.expanded ? "Collapse" : "Expand"} ${row.label}`}
                    excludeFromTabOrder
                    isDisabled={Boolean(query.trim())}
                    onPress={() => {
                      toggle(row);
                      focusRow(row.id);
                    }}
                  >
                    <span aria-hidden="true">{row.expanded ? "⌄" : "›"}</span>
                  </Button>
                ) : (
                  <span className="fux-machine-tree__disclosure-placeholder" aria-hidden="true" />
                )}
                <span className="fux-machine-tree__kind-mark" aria-hidden="true">
                  {marks[rowKind(row)]}
                </span>
                <span className="fux-machine-tree__row-content">
                  <span className="fux-machine-tree__row-title">
                    {renderLabel
                      ? renderLabel(row, { selected: selectedId === row.id })
                      : row.label}
                  </span>
                  <span
                    id={`${uid}-meta-${encodeURIComponent(row.id)}`}
                    className="fux-machine-tree__row-meta"
                  >
                    {row.transition ? (
                      <>
                        <span>
                          {row.transition.guard ? `[${row.transition.guard}] · ` : ""}→{" "}
                          {row.transition.targetId}
                        </span>
                        {row.transition.actions?.length ? (
                          <span> / {row.transition.actions.join(", ")}</span>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {kinds[rowKind(row)]}
                        {row.initial ? " · Initial" : ""}
                        {row.node?.kind === "submachine"
                          ? ` · ${row.node.machineId ?? "Unresolved reference"}`
                          : ""}
                      </>
                    )}
                  </span>
                </span>
                <span
                  id={`${uid}-status-${encodeURIComponent(row.id)}`}
                  className="fux-machine-tree__badges"
                >
                  {row.context && <span>Context</span>}
                  {row.active && <span className="fux-machine-tree__active-badge">Active</span>}
                  {!row.active && row.activeDescendant && <span>Active within</span>}
                  {row.recovered && <span>Recovered</span>}
                </span>
              </div>
            ))}
          </div>
          {!visible.length && (
            <div className="fux-machine-tree__empty">
              {query.trim()
                ? "No matching states or transitions."
                : (renderEmpty ?? "No machine items to display.")}
            </div>
          )}
        </div>
        {showInspector && (
          <aside className="fux-machine-tree__inspector" aria-label="Selection details">
            {!selected ? (
              <>
                <h3>{selectedId ? "Selection unavailable" : "Follow a state or route"}</h3>
                <p>
                  {selectedId
                    ? "The selected row is not present in this document. No substitute was selected."
                    : "Select an item in the tree. Target links reveal topology; they never send an event."}
                </p>
              </>
            ) : (
              <>
                <div className="fux-machine-tree__eyebrow">{kinds[rowKind(selected)]}</div>
                <h3>{selected.label}</h3>
                <ol className="fux-machine-tree__path" aria-label="Selected item tree path">
                  {selectionPath.map((row) => (
                    <li key={row.id}>
                      <span>{row.label}</span> <code>{row.elementId}</code>
                    </li>
                  ))}
                </ol>
                {selectionHidden && (
                  <p className="fux-machine-tree__notice">
                    This selection is outside the visible tree.{" "}
                    <Button className="fux-machine-tree__button" onPress={() => reveal(selected)}>
                      Reveal selection
                    </Button>
                  </p>
                )}
                <dl>
                  <dt>Machine</dt>
                  <dd>{selected.graph.label}</dd>
                  <dt>ID</dt>
                  <dd>{selected.elementId}</dd>
                  {declaredInitialId !== undefined && (
                    <>
                      <dt>Declared initial child</dt>
                      <dd>{declaredInitialId || "Empty ID"}</dd>
                    </>
                  )}
                  {selected.active && (
                    <>
                      <dt>Observation</dt>
                      <dd>Supplied active state</dd>
                    </>
                  )}
                  {!selected.active && selected.activeDescendant && (
                    <>
                      <dt>Observation</dt>
                      <dd>Contains a supplied active state; not itself reported active.</dd>
                    </>
                  )}
                </dl>
                {selected.node?.description && (
                  <p className="fux-machine-tree__description">{selected.node.description}</p>
                )}
                {selected.node?.tags?.length ? (
                  <div className="fux-machine-tree__tags">
                    {selected.node.tags.map((tag, index) => (
                      <span key={index}>{tag}</span>
                    ))}
                  </div>
                ) : null}
                {selected.node?.entry?.length ? (
                  <>
                    <h4>Entry actions</h4>
                    <p>{selected.node.entry.join(", ")}</p>
                  </>
                ) : null}
                {selected.node?.exit?.length ? (
                  <>
                    <h4>Exit actions</h4>
                    <p>{selected.node.exit.join(", ")}</p>
                  </>
                ) : null}
                {selected.node?.kind === "submachine" && (
                  <div className="fux-machine-tree__route">
                    {reference ? (
                      <Button
                        className="fux-machine-tree__button"
                        onPress={() => reveal(reference)}
                      >
                        Open referenced machine: {reference.label}
                      </Button>
                    ) : (
                      <p>Referenced machine unavailable.</p>
                    )}
                  </div>
                )}
                {selected.transition && (
                  <>
                    <dl>
                      <dt>Event</dt>
                      <dd>{selected.transition.event || "Automatic (declarative)"}</dd>
                      <dt>Guard</dt>
                      <dd>{selected.transition.guard || "None declared"}</dd>
                      <dt>Actions</dt>
                      <dd>{selected.transition.actions?.join(", ") || "None declared"}</dd>
                      <dt>Kind</dt>
                      <dd>{selected.transition.internal ? "Internal" : "External"}</dd>
                    </dl>
                    {selected.transition.description && <p>{selected.transition.description}</p>}
                    <div className="fux-machine-tree__route">
                      {source ? (
                        <Button className="fux-machine-tree__button" onPress={() => reveal(source)}>
                          Reveal source: {source.label}
                        </Button>
                      ) : (
                        <p>Source unavailable: {selected.transition.sourceId}</p>
                      )}
                      {target ? (
                        <Button className="fux-machine-tree__button" onPress={() => reveal(target)}>
                          Reveal target: {target.label}
                        </Button>
                      ) : (
                        <p>Target unavailable: {selected.transition.targetId}</p>
                      )}
                    </div>
                  </>
                )}
                {renderDetails?.(selected)}
                <p className="fux-machine-tree__boundary">
                  Declarative information only. No guards, actions, timers or services are executed
                  by this view.
                </p>
              </>
            )}
          </aside>
        )}
      </div>
      <footer className="fux-machine-tree__footer">
        <span>State containment, not an actor tree.</span>
        <span>{selected ? `Selected: ${selected.label}` : "Nothing selected"}</span>
      </footer>
      <span className="fux-machine-tree__sr" role="status" aria-live="polite">
        {announcement}
      </span>
    </section>
  );
}
