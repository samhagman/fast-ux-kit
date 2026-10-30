"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from "react";
import { Button } from "react-aria-components";
import {
  findOutlineNode,
  getOutlinePath,
  InvalidOutlineError,
  toggleExpanded,
  outlineIds,
  validateOutline,
  type OutlineNode,
} from "../core/index.js";
import { RichContent, type RichContentProps } from "./RichContent.js";
import type { RichDocument } from "../rich/index.js";
import { OutlineBullet, OutlineCheck, OutlineChevron, OutlineFocus } from "./OutlineGlyph.js";
import { useOutlineRowGesture } from "./outline-row-gesture.js";

export interface OutlineRenderContext {
  /** Zero-based nesting level. */
  readonly depth: number;
  /** Navigate without editing the document. */
  readonly hoist: () => void;
  readonly hasChildren: boolean;
  readonly isExpanded: boolean;
}

export interface OutlineExpansionChange {
  readonly id: string;
  readonly isExpanded: boolean;
  /** All affected IDs, including descendants for an Alt-modified recursive disclosure. */
  readonly affectedIds: readonly string[];
  readonly recursive: boolean;
}

type ReaderSectionProps = Omit<
  ComponentPropsWithoutRef<"section">,
  | "children"
  | "contentEditable"
  | "dangerouslySetInnerHTML"
  | "suppressContentEditableWarning"
  | "onChange"
>;

export interface OutlinerProps<T = unknown> extends ReaderSectionProps {
  readonly nodes: readonly OutlineNode<T>[];
  /** Opt-in row folding and leading-bullet navigation; legacy controls remain the default. */
  readonly interactionMode?: "controls" | "row";
  /** Leaf activation only; never implies a document mutation. */
  readonly onRowActivate?: (node: OutlineNode<T>) => void;
  /** A request only. The host must validate current editing permission. */
  readonly onEditRequest?: (node: OutlineNode<T>) => void;
  /** Explicit permission for long-press/F2 requests. Omitted means no editing requests. */
  readonly canEdit?: (node: OutlineNode<T>) => boolean;
  /** Controlled reader state. Supply a new set to update it; this set is never mutated. */
  readonly expandedIds?: ReadonlySet<string>;
  /** Initial reader state only. If omitted, every initial branch starts expanded. */
  readonly defaultExpandedIds?: ReadonlySet<string>;
  readonly onExpandedChange?: (
    expandedIds: ReadonlySet<string>,
    change: OutlineExpansionChange,
  ) => void;
  /** Render trusted React content, not HTML strings. Interactive children remain independent of folding. */
  /** Mobile-friendly disclosure geometry. Defaults to end (right thumb in LTR). */
  readonly disclosurePosition?: "start" | "end";
  /** Optional subtree navigation, independent of expansion and document history. */
  readonly enableHoist?: boolean;
  readonly hoistedId?: string | null;
  readonly defaultHoistedId?: string | null;
  readonly onHoistChange?: (id: string | null) => void;
  readonly getHoistLabel?: (node: OutlineNode<T>) => string;
  /** Rich documents are rendered, not shown as source. renderContent takes precedence. */
  readonly getRichContent?: (node: OutlineNode<T>) => RichDocument | undefined;
  readonly richRegistry?: RichContentProps["registry"];
  readonly allowMedia?: RichContentProps["allowMedia"];
  readonly renderBody?: (node: OutlineNode<T>) => ReactNode;
  readonly renderAccessory?: (node: OutlineNode<T>) => ReactNode;
  /** Trusted summary shown only while a branch is collapsed. */
  readonly renderCollapsed?: (node: OutlineNode<T>) => ReactNode;
  readonly renderStatus?: (node: OutlineNode<T>) => ReactNode;
  readonly renderSuffix?: (node: OutlineNode<T>) => ReactNode;
  readonly renderContent?: (node: OutlineNode<T>, context: OutlineRenderContext) => ReactNode;
  /** Localize the disclosure's accessible name. Defaults to “Expand/Collapse {node.text}”. */
  readonly getDisclosureLabel?: (node: OutlineNode<T>, isExpanded: boolean) => string;
}

function initialExpansion<T>(
  nodes: readonly OutlineNode<T>[],
  initial?: ReadonlySet<string>,
): ReadonlySet<string> {
  if (initial !== undefined) return new Set(initial);
  const expanded = new Set<string>();
  const pending = [...nodes];
  while (pending.length) {
    const node = pending.pop()!;
    if (node.children?.length) {
      expanded.add(node.id);
      for (const child of node.children) pending.push(child);
    }
  }
  return expanded;
}

/** Local visibility check for a previously focused descendant, never a tab-order manager. */
function readerFocusVisible(element: HTMLElement, section: HTMLElement): boolean {
  if (!section.contains(element)) return false;
  for (let current: HTMLElement | null = element; current; current = current.parentElement) {
    if (current.hidden || current.hasAttribute("inert")) return false;
    const style = current.ownerDocument.defaultView?.getComputedStyle(current);
    if (
      style?.display === "none" ||
      style?.visibility === "hidden" ||
      style?.visibility === "collapse"
    )
      return false;
    if (current === section) return true;
  }
  return false;
}

/**
 * Read-first nested disclosure lists, deliberately NOT an ARIA tree or an editor.
 * Tab visits disclosures and embedded links normally; Enter/Space toggle the focused button.
 * Unmodified Up/Down on the reader or its own row controls navigates visible rows.
 * Folding is local reader state and never mutates document nodes or implies edit permission.
 *
 * No theme is injected. Style the fast-ux-outliner* classes/data attributes, including an
 * appropriate disclosure touch target and visible focus ring (or use the optional stylesheet).
 */
export function Outliner<T = unknown>({
  nodes,
  interactionMode = "controls",
  onRowActivate,
  onEditRequest,
  canEdit,
  expandedIds,
  defaultExpandedIds,
  onExpandedChange,
  renderContent,
  renderBody,
  renderAccessory,
  renderCollapsed,
  renderStatus,
  renderSuffix,
  disclosurePosition = "end",
  enableHoist = false,
  hoistedId,
  defaultHoistedId = null,
  onHoistChange,
  getHoistLabel,
  getRichContent,
  richRegistry,
  allowMedia,
  getDisclosureLabel,
  className,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
  ...sectionProps
}: OutlinerProps<T>) {
  const instanceId = useId();
  const sectionRef = useRef<HTMLElement>(null);
  const returnToId = useRef<string | null>(null);
  const navigationPending = useRef<string | null | undefined>(undefined);
  const focusedNode = useRef<string | null>(null);
  const focusedElement = useRef<HTMLElement | null>(null);
  const focusedPath = useRef<readonly string[]>([]);
  const [localHoisted, setLocalHoisted] = useState(defaultHoistedId);
  useMemo(() => {
    const issues = validateOutline(nodes);
    if (issues.length) throw new InvalidOutlineError(issues);
  }, [nodes]);
  const [localExpanded, setLocalExpanded] = useState(() =>
    initialExpansion(nodes, defaultExpandedIds),
  );
  const expanded = expandedIds ?? localExpanded;
  const requestedHoist = hoistedId === undefined ? localHoisted : hoistedId;
  const hoisted = requestedHoist ? findOutlineNode(nodes, requestedHoist)?.node : undefined;
  const activeHoist = hoisted?.id ?? null;
  const breadcrumbs = activeHoist ? getOutlinePath(nodes, activeHoist) : [];
  const visibleRoots = hoisted ? [hoisted] : nodes;

  function navigate(id: string | null) {
    if (id && !findOutlineNode(nodes, id)) return;
    if (id === activeHoist) return;
    if (!activeHoist && id) returnToId.current = id;
    navigationPending.current = id;
    if (hoistedId === undefined) setLocalHoisted(id);
    onHoistChange?.(id);
  }
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    if (navigationPending.current !== undefined && navigationPending.current === activeHoist) {
      navigationPending.current = undefined;
      const returnButton =
        activeHoist === null && returnToId.current
          ? [...section.querySelectorAll<HTMLElement>("[data-hoist-id]")].find(
              (element) => element.dataset.hoistId === returnToId.current,
            )
          : undefined;
      (returnButton ?? section).focus();
      return;
    }
    // Recover only focus actually lost with a reader descendant. A host scope
    // change or removed branch may leave no surviving ancestor disclosure.
    if (
      focusedNode.current &&
      focusedElement.current &&
      section.ownerDocument.activeElement === section.ownerDocument.body &&
      !readerFocusVisible(focusedElement.current, section)
    ) {
      const currentPath = getOutlinePath(nodes, focusedNode.current);
      const path = (currentPath.length ? currentPath.map((node) => node.id) : focusedPath.current)
        .slice()
        .reverse();
      const controls = [...section.querySelectorAll<HTMLElement>("[data-disclosure-id]")];
      const ancestor = path
        .map((id) =>
          controls.find(
            (button) => button.dataset.disclosureId === id && readerFocusVisible(button, section),
          ),
        )
        .find(Boolean);
      focusedNode.current = null;
      focusedElement.current = null;
      focusedPath.current = [];
      (ancestor ?? section).focus({ preventScroll: true });
    }
  });

  // Bound React's nested rendering independently from complete iterative data validation.
  const MAX_RENDER_DEPTH = 128;
  const MAX_RENDER_NODES = 5_000;
  let renderedCount = 0;
  let renderLimited = false;

  function toggle(id: string, recursive = false) {
    const ids = recursive ? outlineIds([findOutlineNode(nodes, id)!.node]) : [id];
    const next = new Set(toggleExpanded(expanded, id));
    const isExpanded = next.has(id);
    for (const affected of ids) {
      if (isExpanded) next.add(affected);
      else next.delete(affected);
    }
    if (expandedIds === undefined) setLocalExpanded(next);
    // Call once from the event, not from a state updater (which Strict Mode can replay).
    onExpandedChange?.(next, { id, isExpanded, affectedIds: ids, recursive });
  }

  const rowInteraction = interactionMode === "row";
  const gestureIdentity = useMemo(() => ({}), [nodes, activeHoist, expanded, interactionMode]);
  const editable = (id: string) => {
    const node = findOutlineNode(nodes, id)?.node;
    return !!node && !!onEditRequest && canEdit?.(node) === true;
  };
  const requestEdit = (id: string) => {
    const node = findOutlineNode(nodes, id)?.node;
    if (node && editable(id)) onEditRequest?.(node);
  };
  const activateRow = (id: string, recursive = false) => {
    const node = findOutlineNode(nodes, id)?.node;
    if (!node) return;
    if (node.children?.length) toggle(id, recursive);
    else onRowActivate?.(node);
  };
  const rowGesture = useOutlineRowGesture(activateRow, requestEdit, editable, gestureIdentity);

  function renderList(
    items: readonly OutlineNode<T>[],
    depth: number,
    path: readonly number[],
    id?: string,
    hidden = false,
  ): ReactNode {
    return (
      <ul role="list" id={id} hidden={hidden} className="fast-ux-outliner__list" data-depth={depth}>
        {!hidden &&
          items.map((node, index) => {
            if (renderedCount >= MAX_RENDER_NODES) {
              renderLimited = true;
              return null;
            }
            renderedCount++;
            const childPath = [...path, index];
            const hasChildren = !!node.children?.length;
            const isExpanded = hasChildren && expanded.has(node.id);
            const childListId = `${instanceId}-children-${childPath.join("-")}`;
            const context = { depth, hasChildren, isExpanded, hoist: () => navigate(node.id) };
            const richDocument = getRichContent?.(node);
            const body = renderBody?.(node);
            const plainTitle = !renderContent && !richDocument;
            const actionableTitle = hasChildren || !!onRowActivate;
            const disclosureLabel =
              getDisclosureLabel?.(node, isExpanded) ??
              `${isExpanded ? "Collapse" : "Expand"} ${node.text}`;
            const taskMark =
              node.checked !== undefined ? (
                <span
                  className="fast-ux-outliner__task-mark"
                  role="img"
                  aria-label={node.checked ? "Completed task" : "Incomplete task"}
                  data-checked={node.checked}
                >
                  <OutlineCheck checked={node.checked} />
                </span>
              ) : null;
            const disclosure = hasChildren ? (
              <Button
                type="button"
                className="fux-control fast-ux-outliner__toggle"
                data-disclosure-id={node.id}
                aria-label={
                  getDisclosureLabel?.(node, isExpanded) ??
                  `${isExpanded ? "Collapse" : "Expand"} ${node.text}`
                }
                aria-expanded={isExpanded}
                aria-controls={childListId}
                onPress={(event) => toggle(node.id, event.altKey)}
              >
                <span className="fast-ux-outliner__chevron" aria-hidden="true">
                  <OutlineChevron />
                </span>
              </Button>
            ) : null;
            return (
              <li
                key={node.id}
                className="fast-ux-outliner__item"
                tabIndex={-1}
                data-node-id={node.id}
                data-depth={depth}
                data-has-children={hasChildren}
                data-expanded={isExpanded}
                data-checked={node.checked}
              >
                <div
                  className="fast-ux-outliner__row"
                  onPointerDown={
                    rowInteraction ? (event) => rowGesture.onPointerDown(event, node.id) : undefined
                  }
                  onClick={
                    rowInteraction ? (event) => rowGesture.onClick(event, node.id) : undefined
                  }
                >
                  <div className="fast-ux-outliner__gutter">
                    {rowInteraction && enableHoist ? (
                      <Button
                        type="button"
                        className="fux-control fast-ux-outliner__hoist"
                        data-hoist-id={node.id}
                        aria-label={getHoistLabel?.(node) ?? `Focus on ${node.text}`}
                        onPress={() => navigate(node.id)}
                      >
                        <OutlineBullet collapsed={hasChildren && !isExpanded} />
                      </Button>
                    ) : !rowInteraction && disclosurePosition === "start" && hasChildren ? (
                      disclosure
                    ) : (
                      <span className="fast-ux-outliner__marker">
                        {(!rowInteraction && taskMark) || (
                          <OutlineBullet collapsed={hasChildren && !isExpanded} />
                        )}
                      </span>
                    )}
                  </div>
                  {rowInteraction && !plainTitle && disclosure}
                  <div
                    className="fast-ux-outliner__content"
                    data-row-interaction={rowInteraction || undefined}
                  >
                    {rowInteraction ? (
                      <span data-outline-independent="">{renderStatus?.(node)}</span>
                    ) : (
                      renderStatus?.(node)
                    )}
                    {((rowInteraction && !(plainTitle && actionableTitle)) ||
                      (!rowInteraction && disclosurePosition === "start" && hasChildren)) &&
                      taskMark}
                    {renderContent ? (
                      rowInteraction ? (
                        <div data-outline-independent="">{renderContent(node, context)}</div>
                      ) : (
                        renderContent(node, context)
                      )
                    ) : richDocument ? (
                      rowInteraction ? (
                        <div data-outline-independent="">
                          <RichContent
                            document={richDocument}
                            registry={richRegistry}
                            allowMedia={allowMedia}
                          />
                        </div>
                      ) : (
                        <RichContent
                          document={richDocument}
                          registry={richRegistry}
                          allowMedia={allowMedia}
                        />
                      )
                    ) : rowInteraction && actionableTitle ? (
                      <button
                        type="button"
                        className="fast-ux-outliner__row-action"
                        data-outline-row-action=""
                        data-disclosure-id={hasChildren ? node.id : undefined}
                        data-row-action-id={node.id}
                        aria-label={hasChildren ? disclosureLabel : node.text || "Untitled item"}
                        aria-expanded={hasChildren ? isExpanded : undefined}
                        aria-controls={hasChildren ? childListId : undefined}
                      >
                        {taskMark}
                        <span className="fast-ux-outliner__label">
                          {node.text || "Untitled item"}
                        </span>
                        {hasChildren && !isExpanded && (
                          <span className="fast-ux-outliner__count" aria-hidden="true">
                            {node.children!.length}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="fast-ux-outliner__label">{node.text}</span>
                    )}
                    {rowInteraction ? (
                      <span data-outline-independent="">{renderSuffix?.(node)}</span>
                    ) : (
                      renderSuffix?.(node)
                    )}
                    {hasChildren &&
                      !isExpanded &&
                      !(rowInteraction && plainTitle && actionableTitle) && (
                        <span className="fast-ux-outliner__count" aria-hidden="true">
                          {node.children!.length}
                        </span>
                      )}
                    {body != null && typeof body !== "boolean" && (
                      <div className="fast-ux-outliner__body">{body}</div>
                    )}
                    {hasChildren && !isExpanded && renderCollapsed && (
                      <div className="fast-ux-outliner__summary">{renderCollapsed(node)}</div>
                    )}
                  </div>
                  {rowInteraction ? (
                    <span data-outline-independent="">{renderAccessory?.(node)}</span>
                  ) : (
                    renderAccessory?.(node)
                  )}
                  {!rowInteraction && enableHoist && (
                    <Button
                      type="button"
                      className="fux-control fast-ux-outliner__hoist"
                      data-hoist-id={node.id}
                      aria-label={getHoistLabel?.(node) ?? `Focus on ${node.text}`}
                      onPress={() => navigate(node.id)}
                    >
                      <OutlineFocus />
                    </Button>
                  )}
                  {!rowInteraction && disclosurePosition === "end" && disclosure}
                </div>
                {hasChildren &&
                  (depth >= MAX_RENDER_DEPTH && isExpanded ? (
                    <ul role="list" id={childListId} className="fast-ux-outliner__list">
                      <li>
                        <p role="note">
                          Deeper content is preserved but omitted at the 128-level inline rendering
                          limit.
                        </p>
                      </li>
                    </ul>
                  ) : (
                    renderList(node.children!, depth + 1, childPath, childListId, !isExpanded)
                  ))}
              </li>
            );
          })}
      </ul>
    );
  }

  return (
    <section
      {...sectionProps}
      ref={sectionRef}
      tabIndex={sectionProps.tabIndex ?? (visibleRoots.length ? 0 : -1)}
      onKeyDown={(event) => {
        sectionProps.onKeyDown?.(event);
        const keyTarget = event.target as HTMLElement;
        const ownRow = keyTarget.closest<HTMLElement>(".fast-ux-outliner__item");
        const ownSurface =
          keyTarget.closest(".fast-ux-outliner") === event.currentTarget &&
          (keyTarget === ownRow ||
            keyTarget.hasAttribute("data-row-action-id") ||
            keyTarget.hasAttribute("data-disclosure-id") ||
            keyTarget.hasAttribute("data-hoist-id"));
        if (
          rowInteraction &&
          ownRow &&
          ownSurface &&
          !event.defaultPrevented &&
          !event.nativeEvent.isComposing &&
          event.keyCode !== 229 &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          !event.shiftKey
        ) {
          const id = ownRow.dataset.nodeId!;
          if (event.key === "F2" && editable(id)) {
            event.preventDefault();
            event.stopPropagation();
            requestEdit(id);
            return;
          }
          if (keyTarget === ownRow && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            event.stopPropagation();
            activateRow(id);
            return;
          }
        }
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229 ||
          event.altKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.shiftKey ||
          (event.key !== "ArrowUp" && event.key !== "ArrowDown")
        )
          return;
        const section = event.currentTarget;
        const target = event.target as HTMLElement;
        // Embedded inputs, media, rich-content widgets and nested outlines retain
        // their own keys. Only our section, rows and explicit row controls opt in.
        if (target.closest(".fast-ux-outliner") !== section) return;
        const ownControl =
          target.hasAttribute("data-disclosure-id") ||
          target.hasAttribute("data-hoist-id") ||
          target.hasAttribute("data-row-action-id");
        if (
          target !== section &&
          !target.classList.contains("fast-ux-outliner__item") &&
          !ownControl
        )
          return;
        const rows = [...section.querySelectorAll<HTMLElement>(".fast-ux-outliner__item")].filter(
          (row) => row.closest(".fast-ux-outliner") === section && readerFocusVisible(row, section),
        );
        if (!rows.length) return;
        // Cancel even at the first/last row, so a boundary never leaks a page scroll.
        event.preventDefault();
        event.stopPropagation();
        const current = target.closest<HTMLElement>(".fast-ux-outliner__item");
        const index = current ? rows.indexOf(current) : -1;
        const next =
          index < 0
            ? rows[event.key === "ArrowDown" ? 0 : rows.length - 1]
            : rows[index + (event.key === "ArrowDown" ? 1 : -1)];
        if (!next) return;
        next.focus({ preventScroll: true });
        // A branch item includes its entire subtree; reveal just its own row.
        next.querySelector<HTMLElement>(":scope > .fast-ux-outliner__row")?.scrollIntoView?.({
          block: "nearest",
          inline: "nearest",
          behavior: "instant",
        });
      }}
      onFocusCapture={(event) => {
        focusedNode.current =
          (event.target as Element).closest<HTMLElement>("[data-node-id]")?.dataset.nodeId ?? null;
        focusedElement.current = focusedNode.current ? (event.target as HTMLElement) : null;
        focusedPath.current = focusedNode.current
          ? getOutlinePath(nodes, focusedNode.current).map((node) => node.id)
          : [];
        sectionProps.onFocusCapture?.(event);
      }}
      onBlurCapture={(event) => {
        const outside =
          event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node);
        // Intentional blur of a still-visible control is not lost DOM focus. In
        // particular, a later async host update must not pull focus back inside.
        const deliberateBlur =
          !event.relatedTarget &&
          readerFocusVisible(event.target as HTMLElement, event.currentTarget);
        if (outside || deliberateBlur) {
          focusedNode.current = null;
          focusedElement.current = null;
          focusedPath.current = [];
        }
        sectionProps.onBlurCapture?.(event);
      }}
      className={["fast-ux-outliner", className].filter(Boolean).join(" ")}
      aria-label={ariaLabel ?? (ariaLabelledBy ? undefined : "Outline")}
      aria-labelledby={ariaLabelledBy}
      data-read-only="true"
      data-interaction-mode={interactionMode}
      data-disclosure-position={disclosurePosition}
      data-hoisted-id={activeHoist ?? undefined}
    >
      {activeHoist && (
        <nav className="fast-ux-outliner__breadcrumbs" aria-label="Outline path">
          <ol>
            <li>
              <Button type="button" className="fux-control" onPress={() => navigate(null)}>
                All notes
              </Button>
            </li>
            {breadcrumbs.map((node) => (
              <li key={node.id}>
                {node.id === activeHoist ? (
                  <span aria-current="location">{node.text}</span>
                ) : (
                  <Button type="button" className="fux-control" onPress={() => navigate(node.id)}>
                    {node.text}
                  </Button>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      {renderList(visibleRoots, 0, [])}
      {renderLimited && (
        <p role="note">
          More content is preserved but omitted at the 5,000-row inline rendering limit.
        </p>
      )}
    </section>
  );
}
