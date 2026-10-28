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
 * Folding is local reader state and never mutates document nodes or implies edit permission.
 *
 * No theme is injected. Style the fast-ux-outliner* classes/data attributes, including an
 * appropriate disclosure touch target and visible focus ring (or use the optional stylesheet).
 */
export function Outliner<T = unknown>({
  nodes,
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
            return (
              <li
                key={node.id}
                className="fast-ux-outliner__item"
                data-node-id={node.id}
                data-depth={depth}
                data-has-children={hasChildren}
                data-expanded={isExpanded}
              >
                <div className="fast-ux-outliner__row">
                  {hasChildren ? (
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
                      <span className="fast-ux-outliner__marker" aria-hidden="true">
                        ▸
                      </span>
                    </Button>
                  ) : (
                    <span className="fast-ux-outliner__marker" aria-hidden="true">
                      •
                    </span>
                  )}
                  <div className="fast-ux-outliner__content">
                    {renderStatus?.(node)}
                    {node.checked !== undefined && (
                      <span
                        role="img"
                        aria-label={node.checked ? "Completed task" : "Incomplete task"}
                      >
                        {node.checked ? "☑ " : "☐ "}
                      </span>
                    )}
                    {renderContent ? (
                      renderContent(node, context)
                    ) : richDocument ? (
                      <RichContent
                        document={richDocument}
                        registry={richRegistry}
                        allowMedia={allowMedia}
                      />
                    ) : (
                      node.text
                    )}
                    {renderSuffix?.(node)}
                    {renderBody?.(node)}
                    {hasChildren && !isExpanded && renderCollapsed && (
                      <div className="fast-ux-outliner__summary">{renderCollapsed(node)}</div>
                    )}
                  </div>
                  {renderAccessory?.(node)}
                  {enableHoist && (
                    <Button
                      type="button"
                      className="fux-control fast-ux-outliner__hoist"
                      data-hoist-id={node.id}
                      aria-label={getHoistLabel?.(node) ?? `Focus on ${node.text}`}
                      onPress={() => navigate(node.id)}
                    >
                      <svg
                        aria-hidden="true"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5" />
                      </svg>
                    </Button>
                  )}
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
      tabIndex={sectionProps.tabIndex ?? -1}
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
