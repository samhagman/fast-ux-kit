"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Combobox } from "@base-ui/react/combobox";
import { Accordion } from "@base-ui/react/accordion";
import { Collapsible } from "@base-ui/react/collapsible";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { Button } from "./ui/button.js";
import { cn } from "../lib/utils.js";

export interface CollectionOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

export interface SelectProps<Multiple extends boolean = false> extends Omit<
  SelectPrimitive.Root.Props<string, Multiple>,
  "items" | "children"
> {
  label: string;
  options: readonly CollectionOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
}

export function Select<Multiple extends boolean = false>({
  label,
  options,
  placeholder = "Select…",
  hint,
  error,
  ...props
}: SelectProps<Multiple>) {
  const id = React.useId();
  return (
    <div className="fux-field">
      <span id={id} className="fux-label">
        {label}
      </span>
      <SelectPrimitive.Root
        {...props}
        items={options.map((option) => ({ value: option.id, label: option.label }))}
      >
        <SelectPrimitive.Trigger
          className="fux-input fux-select-trigger"
          aria-labelledby={id}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${id}-details` : undefined}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon aria-hidden>⌄</SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner className="fux-positioner" sideOffset={4}>
            <SelectPrimitive.Popup className="fux-popup">
              <SelectPrimitive.List>
                {options.map((option) => (
                  <SelectPrimitive.Item
                    key={option.id}
                    value={option.id}
                    disabled={option.disabled}
                    className="fux-option"
                  >
                    <SelectPrimitive.ItemIndicator aria-hidden>✓</SelectPrimitive.ItemIndicator>
                    <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                    {option.description && <small>{option.description}</small>}
                  </SelectPrimitive.Item>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      {(hint || error) && (
        <span id={`${id}-details`} className={error ? "fux-error" : "fux-hint"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

export interface ComboBoxProps extends Omit<
  Combobox.Root.Props<string, false>,
  "items" | "children"
> {
  label: string;
  options: readonly CollectionOption[];
  placeholder?: string;
  hint?: string;
  error?: string;
}

export function ComboBox({ label, options, placeholder, hint, error, ...props }: ComboBoxProps) {
  const id = React.useId();
  return (
    <div className="fux-field">
      <Combobox.Root
        {...props}
        items={options.map((option) => option.id)}
        itemToStringLabel={(value) => options.find((option) => option.id === value)?.label ?? value}
      >
        <label htmlFor={`${id}-input`} className="fux-label">
          {label}
        </label>
        <Combobox.InputGroup className="fux-input-group">
          <Combobox.Input
            id={`${id}-input`}
            className="fux-input"
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={hint || error ? id : undefined}
          />
          <Combobox.Trigger className="fux-control" aria-label="Show options">
            ⌄
          </Combobox.Trigger>
          <Combobox.Clear className="fux-control" aria-label="Clear selection">
            ×
          </Combobox.Clear>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner className="fux-positioner" sideOffset={4}>
            <Combobox.Popup className="fux-popup">
              <Combobox.Empty className="fux-hint">No matches</Combobox.Empty>
              <Combobox.List>
                {(value: string) => {
                  const option = options.find((entry) => entry.id === value);
                  return (
                    <Combobox.Item
                      key={value}
                      value={value}
                      disabled={option?.disabled}
                      className="fux-option"
                    >
                      <Combobox.ItemIndicator aria-hidden>✓</Combobox.ItemIndicator>
                      {option?.label ?? value}
                      {option?.description && <small>{option.description}</small>}
                    </Combobox.Item>
                  );
                }}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      {(hint || error) && (
        <span id={id} className={error ? "fux-error" : "fux-hint"}>
          {error ?? hint}
        </span>
      )}
    </div>
  );
}

interface SelectionProps {
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (ids: readonly string[]) => void;
  multiple?: boolean;
}

function useCollection(options: readonly CollectionOption[], props: SelectionProps) {
  if (new Set(options.map((option) => option.id)).size !== options.length)
    throw new Error("Collection item ids must be unique.");
  const [own, setOwn] = React.useState<readonly string[]>(props.defaultValue ?? []);
  const selection = (props.value ?? own).filter((id) => options.some((option) => option.id === id));
  const [focused, setFocused] = React.useState<string | null>(null);
  const anchor = React.useRef<string | null>(null);
  const elements = React.useRef(new Map<string, HTMLElement>());
  const focusWithin = React.useRef(false);
  const search = React.useRef({ text: "", time: 0 });
  const enabled = options.filter((option) => !option.disabled);
  const activeId = enabled.some((option) => option.id === focused)
    ? focused
    : (enabled.find((option) => selection.includes(option.id))?.id ?? enabled[0]?.id);
  React.useEffect(() => {
    if (focused && activeId !== focused && focusWithin.current && activeId) {
      setFocused(activeId);
      elements.current.get(activeId)?.focus();
    }
  }, [activeId, focused]);
  function update(next: readonly string[]) {
    if (props.value === undefined) setOwn(next);
    props.onValueChange?.(next);
  }
  function select(id: string, toggle = false, range = false) {
    if (!enabled.some((option) => option.id === id)) return;
    let next: readonly string[] = [id];
    if (props.multiple && range && anchor.current) {
      const start = enabled.findIndex((option) => option.id === anchor.current);
      const end = enabled.findIndex((option) => option.id === id);
      if (start >= 0)
        next = enabled
          .slice(Math.min(start, end), Math.max(start, end) + 1)
          .map((option) => option.id);
    } else if (props.multiple && toggle)
      next = selection.includes(id)
        ? selection.filter((selected) => selected !== id)
        : [...selection, id];
    if (!range) anchor.current = id;
    update(next);
  }
  function focus(id: string | undefined) {
    if (!id || !enabled.some((option) => option.id === id)) return;
    setFocused(id);
    elements.current.get(id)?.focus();
  }
  function key(event: React.KeyboardEvent<HTMLElement>, id: string) {
    if (event.target !== event.currentTarget || !enabled.some((option) => option.id === id)) return;
    const index = enabled.findIndex((option) => option.id === id);
    let target: string | undefined;
    if (event.key === "ArrowDown") target = enabled[Math.min(index + 1, enabled.length - 1)]?.id;
    else if (event.key === "ArrowUp") target = enabled[Math.max(index - 1, 0)]?.id;
    else if (event.key === "Home") target = enabled[0]?.id;
    else if (event.key === "End") target = enabled.at(-1)?.id;
    else if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      select(id, props.multiple, event.shiftKey);
      return;
    } else if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === "a" &&
      props.multiple
    ) {
      event.preventDefault();
      update(enabled.map((option) => option.id));
      return;
    } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = Date.now();
      const text = now - search.current.time < 700 ? search.current.text + event.key : event.key;
      search.current = {
        text: [...text].every((letter) => letter === text[0]) ? event.key : text,
        time: now,
      };
      const rotated = [...enabled.slice(index + 1), ...enabled.slice(0, index + 1)];
      target = rotated.find((option) =>
        option.label.toLocaleLowerCase().startsWith(search.current.text.toLocaleLowerCase()),
      )?.id;
    }
    if (target) {
      event.preventDefault();
      if (event.shiftKey && props.multiple && !anchor.current) anchor.current = id;
      focus(target);
      if (event.shiftKey && props.multiple) select(target, false, true);
      else if (!props.multiple && !event.ctrlKey && !event.metaKey) select(target);
    }
  }
  function itemProps(option: CollectionOption) {
    return {
      ref: (element: HTMLElement | null) => {
        if (element) elements.current.set(option.id, element);
        else elements.current.delete(option.id);
      },
      tabIndex: option.id === activeId ? 0 : -1,
      "aria-selected": selection.includes(option.id),
      "aria-disabled": option.disabled || undefined,
      onFocus: () => {
        focusWithin.current = true;
        setFocused(option.id);
      },
      onBlur: (event: React.FocusEvent<HTMLElement>) => {
        focusWithin.current = [...elements.current.values()].some((element) =>
          element.contains(event.relatedTarget as Node | null),
        );
      },
      onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => key(event, option.id),
      onClick: (event: React.MouseEvent<HTMLElement>) => {
        if (
          event.target !== event.currentTarget &&
          (event.target as Element).closest("button, a, input, textarea, select")
        )
          return;
        if (event.shiftKey && !anchor.current) anchor.current = activeId ?? null;
        focus(option.id);
        select(option.id, event.ctrlKey || event.metaKey, event.shiftKey);
      },
    };
  }
  return { selection, itemProps, focus, select };
}

export interface ListBoxProps extends SelectionProps {
  label: string;
  options: readonly CollectionOption[];
}

export function ListBox({ label, options, ...props }: ListBoxProps) {
  const collection = useCollection(options, props);
  return (
    <div
      role="listbox"
      aria-label={label}
      aria-multiselectable={props.multiple || undefined}
      className="fux-list"
    >
      {options.map((option) => (
        <div key={option.id} role="option" className="fux-option" {...collection.itemProps(option)}>
          <span>{option.label}</span>
          {option.description && <small>{option.description}</small>}
        </div>
      ))}
    </div>
  );
}

export interface GridListProps extends SelectionProps {
  label: string;
  items: readonly CollectionOption[];
  renderItem?: (item: CollectionOption) => React.ReactNode;
}

export function GridList({ label, items, renderItem, ...props }: GridListProps) {
  const collection = useCollection(items, props);
  return (
    <div
      role="grid"
      aria-label={label}
      aria-multiselectable={props.multiple || undefined}
      className="fux-list"
    >
      {items.map((item) => (
        <div role="row" key={item.id} className="fux-option" {...collection.itemProps(item)}>
          <div role="gridcell">
            {renderItem?.(item) ?? (
              <>
                <span>{item.label}</span>
                {item.description && <small>{item.description}</small>}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export interface TableColumn<T> {
  id: string;
  label: string;
  isRowHeader?: boolean;
  allowsSorting?: boolean;
  compare?: (left: T, right: T) => number;
  sortValue?: (row: T) => string | number;
  render: (row: T) => React.ReactNode;
}

export interface TableProps<T extends { id: string }> extends SelectionProps {
  label: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  emptyState?: React.ReactNode;
  sort?: { column: string; direction: "ascending" | "descending" };
  onSortChange?: (sort: { column: string; direction: "ascending" | "descending" }) => void;
  isRowDisabled?: (row: T) => boolean;
}

export function Table<T extends { id: string }>({
  label,
  columns,
  rows,
  emptyState = "No rows",
  sort: controlledSort,
  onSortChange,
  isRowDisabled,
  ...props
}: TableProps<T>) {
  const [ownSort, setSort] = React.useState<TableProps<T>["sort"]>();
  const sort = controlledSort ?? ownSort;
  const column = columns.find((candidate) => candidate.id === sort?.column);
  const comparator =
    column?.compare ??
    ((left: T, right: T) => {
      const a = column?.sortValue?.(left) ?? (left as Record<string, unknown>)[column?.id ?? ""];
      const b = column?.sortValue?.(right) ?? (right as Record<string, unknown>)[column?.id ?? ""];
      return typeof a === "number" && typeof b === "number"
        ? a - b
        : String(a ?? "").localeCompare(String(b ?? ""), undefined, { numeric: true });
    });
  const displayed = column
    ? [...rows].sort((a, b) => comparator(a, b) * (sort?.direction === "descending" ? -1 : 1))
    : rows;
  const selection = useCollection(
    displayed.map((row) => ({ id: row.id, label: row.id, disabled: isRowDisabled?.(row) })),
    props,
  );
  const selectable = Boolean(
    props.multiple ||
    props.value !== undefined ||
    props.defaultValue !== undefined ||
    props.onValueChange !== undefined,
  );
  function changeSort(id: string) {
    const next = {
      column: id,
      direction:
        sort?.column === id && sort.direction === "ascending"
          ? ("descending" as const)
          : ("ascending" as const),
    };
    if (controlledSort === undefined) setSort(next);
    onSortChange?.(next);
  }
  return (
    <div className="fux-table-container">
      <table
        className="fux-table"
        aria-label={label}
        role={selectable ? "grid" : undefined}
        aria-multiselectable={(selectable && props.multiple) || undefined}
      >
        <thead>
          <tr>
            {columns.map((entry) => (
              <th
                key={entry.id}
                scope="col"
                aria-sort={sort?.column === entry.id ? sort.direction : undefined}
              >
                {entry.allowsSorting ? (
                  <Button variant="ghost" onClick={() => changeSort(entry.id)}>
                    {entry.label}
                    {sort?.column === entry.id
                      ? sort.direction === "ascending"
                        ? " ↑"
                        : " ↓"
                      : " ↕"}
                  </Button>
                ) : (
                  entry.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {displayed.length ? (
            displayed.map((row) => (
              <tr
                key={row.id}
                {...(selectable
                  ? selection.itemProps({
                      id: row.id,
                      label: row.id,
                      disabled: isRowDisabled?.(row),
                    })
                  : {})}
              >
                {columns.map((entry) =>
                  entry.isRowHeader ? (
                    <th key={entry.id} scope="row">
                      {entry.render(row)}
                    </th>
                  ) : (
                    <td key={entry.id}>{entry.render(row)}</td>
                  ),
                )}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length}>{emptyState}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export interface TreeNode extends CollectionOption {
  href?: string;
  children?: readonly TreeNode[];
}

export interface TreeProps extends SelectionProps {
  label: string;
  items: readonly TreeNode[];
  expandedIds?: readonly string[];
  defaultExpandedIds?: readonly string[];
  onExpandedChange?: (ids: readonly string[]) => void;
  onAction?: (id: string) => void;
  renderLabel?: (node: TreeNode) => React.ReactNode;
}

interface TreeRow {
  node: TreeNode;
  level: number;
  parent: string | null;
  pos: number;
  size: number;
}
function treeRows(items: readonly TreeNode[], expanded: ReadonlySet<string>) {
  const allIds = new Set<string>();
  const unvisited = [...items];
  while (unvisited.length) {
    const node = unvisited.pop()!;
    if (!node.id || allIds.has(node.id))
      throw new Error("Tree item ids must be unique and acyclic.");
    allIds.add(node.id);
    unvisited.push(...(node.children ?? []));
  }
  const rows: TreeRow[] = [];
  const seen = new Set<string>();
  const stack = items
    .map((node, index) => ({
      node,
      level: 1,
      parent: null as string | null,
      pos: index + 1,
      size: items.length,
    }))
    .reverse();
  while (stack.length) {
    const row = stack.pop()!;
    if (seen.has(row.node.id)) throw new Error("Tree item ids must be unique and acyclic.");
    seen.add(row.node.id);
    rows.push(row);
    if (expanded.has(row.node.id)) {
      const children = row.node.children ?? [];
      for (let index = children.length - 1; index >= 0; index--)
        stack.push({
          node: children[index]!,
          level: row.level + 1,
          parent: row.node.id,
          pos: index + 1,
          size: children.length,
        });
    }
  }
  return rows;
}

export function Tree({
  label,
  items,
  expandedIds,
  defaultExpandedIds = [],
  onExpandedChange,
  onAction,
  renderLabel,
  ...props
}: TreeProps) {
  const [ownExpanded, setExpanded] = React.useState<readonly string[]>(defaultExpandedIds);
  const expanded = new Set(expandedIds ?? ownExpanded);
  const rows = treeRows(items, expanded);
  const collection = useCollection(
    rows.map((row) => row.node),
    props,
  );
  function expand(id: string, open: boolean) {
    const next = new Set(expanded);
    if (open) next.add(id);
    else next.delete(id);
    if (expandedIds === undefined) setExpanded([...next]);
    onExpandedChange?.([...next]);
  }
  return (
    <div
      role="tree"
      aria-label={label}
      aria-multiselectable={props.multiple || undefined}
      className="fux-tree"
    >
      {rows.map((row) => {
        const bindings = collection.itemProps(row.node);
        const children = Boolean(row.node.children?.length);
        return (
          <div
            role="treeitem"
            key={row.node.id}
            {...bindings}
            aria-level={row.level}
            aria-posinset={row.pos}
            aria-setsize={row.size}
            aria-expanded={children ? expanded.has(row.node.id) : undefined}
            className="fux-tree-row"
            style={{ paddingInlineStart: `${(row.level - 1) * 1.25}rem` }}
            onKeyDown={(event) => {
              if (event.target !== event.currentTarget || row.node.disabled) return;
              const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
              const forward = rtl ? "ArrowLeft" : "ArrowRight";
              const backward = rtl ? "ArrowRight" : "ArrowLeft";
              if (event.key === forward && children) {
                event.preventDefault();
                if (!expanded.has(row.node.id)) expand(row.node.id, true);
                else collection.focus(row.node.children?.find((node) => !node.disabled)?.id);
              } else if (event.key === backward) {
                event.preventDefault();
                if (expanded.has(row.node.id)) expand(row.node.id, false);
                else collection.focus(row.parent ?? undefined);
              } else if (event.key === "Enter" && onAction) {
                event.preventDefault();
                if (!row.node.disabled) onAction(row.node.id);
              } else bindings.onKeyDown(event);
            }}
          >
            {children ? (
              <button
                type="button"
                tabIndex={-1}
                className="fux-tree-disclosure"
                disabled={row.node.disabled}
                aria-label={`${expanded.has(row.node.id) ? "Collapse" : "Expand"} ${row.node.label}`}
                onClick={(event) => {
                  event.stopPropagation();
                  collection.focus(row.node.id);
                  expand(row.node.id, !expanded.has(row.node.id));
                }}
              >
                {expanded.has(row.node.id) ? "⌄" : "›"}
              </button>
            ) : (
              <span aria-hidden="true" className="fux-tree-disclosure">
                ·
              </span>
            )}
            <span>{renderLabel?.(row.node) ?? row.node.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function safeNavigationHref(href: string | undefined): string | undefined {
  if (!href || /^[\s\u0000-\u001f]|[\u0000-\u001f]/.test(href) || href.startsWith("//"))
    return undefined;
  try {
    const url = new URL(href, "https://navigation.invalid/");
    return ["https:", "http:", "mailto:", "tel:"].includes(url.protocol) ? href : undefined;
  } catch {
    return undefined;
  }
}

export function NavigationTree(props: TreeProps) {
  const nodes = new Map<string, TreeNode>();
  const pending = [...props.items];
  while (pending.length) {
    const node = pending.pop()!;
    if (nodes.has(node.id)) continue;
    nodes.set(node.id, node);
    pending.push(...(node.children ?? []));
  }
  return (
    <Tree
      {...props}
      renderLabel={(node) =>
        safeNavigationHref(node.href) && !node.disabled ? (
          <a
            href={safeNavigationHref(node.href)}
            tabIndex={-1}
            onClick={() => props.onAction?.(node.id)}
          >
            {node.label}
          </a>
        ) : (
          node.label
        )
      }
      onAction={(id) => {
        const href = safeNavigationHref(nodes.get(id)?.href);
        if (href) window.location.assign(href);
        props.onAction?.(id);
      }}
    />
  );
}

export interface TabOption {
  id: string;
  label: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}
export interface TabsProps extends Omit<
  React.ComponentProps<typeof TabsPrimitive.Root>,
  "children"
> {
  label: string;
  items: readonly TabOption[];
}
export function Tabs({ label, items, ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root {...props}>
      <TabsPrimitive.List aria-label={label} className="fux-tabs">
        {items.map((item) => (
          <TabsPrimitive.Tab
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            className="fux-tab"
          >
            {item.label}
          </TabsPrimitive.Tab>
        ))}
      </TabsPrimitive.List>
      {items.map((item) => (
        <TabsPrimitive.Panel key={item.id} value={item.id} className="fux-tab-panel">
          {item.content}
        </TabsPrimitive.Panel>
      ))}
    </TabsPrimitive.Root>
  );
}

export interface MenuOption extends CollectionOption {
  shortcut?: string;
  href?: string;
}
export function Menu({
  label,
  items,
  onAction,
}: {
  label: string;
  items: readonly MenuOption[];
  onAction?: (id: string) => void;
}) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={<Button variant="outline" />}>{label}</MenuPrimitive.Trigger>
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner className="fux-positioner" sideOffset={4}>
          <MenuPrimitive.Popup className="fux-popup">
            {items.map((item) => (
              <MenuPrimitive.Item
                key={item.id}
                className="fux-option"
                disabled={item.disabled}
                render={
                  safeNavigationHref(item.href) ? (
                    <a href={safeNavigationHref(item.href)} />
                  ) : undefined
                }
                onClick={() => onAction?.(item.id)}
              >
                {item.label}
                {item.shortcut && <kbd>{item.shortcut}</kbd>}
              </MenuPrimitive.Item>
            ))}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

export function Breadcrumbs({
  items,
  label = "Breadcrumbs",
}: {
  items: readonly { id: string; label: React.ReactNode; href?: string }[];
  label?: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="fux-breadcrumbs">
        {items.map((item, index) => (
          <li key={item.id}>
            {index > 0 && <span aria-hidden> / </span>}
            {safeNavigationHref(item.href) ? (
              <a
                href={safeNavigationHref(item.href)}
                aria-current={index === items.length - 1 ? "page" : undefined}
              >
                {item.label}
              </a>
            ) : (
              <span aria-current={index === items.length - 1 ? "page" : undefined}>
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface DisclosureProps extends Omit<
  React.ComponentProps<typeof Collapsible.Root>,
  "children" | "title"
> {
  title: React.ReactNode;
  children: React.ReactNode;
}
export function Disclosure({ title, children, ...props }: DisclosureProps) {
  return (
    <Collapsible.Root
      {...props}
      className={(state) =>
        cn(
          "fux-disclosure",
          typeof props.className === "function" ? props.className(state) : props.className,
        )
      }
    >
      <Collapsible.Trigger className="fux-control">{title}</Collapsible.Trigger>
      <Collapsible.Panel>{children}</Collapsible.Panel>
    </Collapsible.Root>
  );
}
export interface DisclosureItem {
  id: string;
  title: React.ReactNode;
  content: React.ReactNode;
  disabled?: boolean;
}
export function DisclosureGroup({
  items,
  ...props
}: Omit<React.ComponentProps<typeof Accordion.Root<string>>, "children"> & {
  items: readonly DisclosureItem[];
}) {
  return (
    <Accordion.Root {...props}>
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          disabled={item.disabled}
          className="fux-disclosure"
        >
          <Accordion.Header>
            <Accordion.Trigger className="fux-control">{item.title}</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>{item.content}</Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

export interface TagsInputProps {
  label: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (tags: readonly string[]) => void;
  disabled?: boolean;
  suggestions?: readonly string[];
}
export function TagsInput({
  label,
  value,
  defaultValue = [],
  onValueChange,
  disabled,
  suggestions = [],
}: TagsInputProps) {
  const [own, setOwn] = React.useState<readonly string[]>(defaultValue);
  const tags = value ?? own;
  const [input, setInput] = React.useState("");
  const id = React.useId();
  const field = React.useRef<HTMLInputElement>(null);
  function change(next: readonly string[]) {
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  }
  function add(tag: string) {
    const next = tag.trim();
    if (next && !tags.includes(next)) change([...tags, next]);
    setInput("");
    field.current?.focus();
  }
  return (
    <div className="fux-field">
      <label className="fux-label" htmlFor={id}>
        {label}
      </label>
      <div className="fux-token-field">
        {tags.map((tag) => (
          <span className="fux-tag" key={tag}>
            {tag}
            <button
              type="button"
              disabled={disabled}
              aria-label={`Remove ${tag}`}
              onClick={() => {
                change(tags.filter((value) => value !== tag));
                field.current?.focus();
              }}
            >
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          ref={field}
          disabled={disabled}
          value={input}
          list={`${id}-suggestions`}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter" || event.key === ",") {
              event.preventDefault();
              add(input);
            } else if (event.key === "Backspace" && !input && tags.length) {
              const last = event.currentTarget.previousElementSibling?.querySelector("button");
              if (last instanceof HTMLButtonElement) {
                event.preventDefault();
                last.focus();
              }
            }
          }}
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions.map((tag) => (
            <option key={tag} value={tag} />
          ))}
        </datalist>
      </div>
    </div>
  );
}
export interface Token {
  id: string;
  label: string;
  value?: string;
  disabled?: boolean;
}
export interface TokenFieldProps {
  label: string;
  name?: string;
  value?: readonly Token[];
  defaultValue?: readonly Token[];
  onValueChange?: (tokens: readonly Token[]) => void;
  suggestions?: readonly Token[];
  createToken?: (text: string) => Token | null;
  disabled?: boolean;
}
export function TokenField({
  label,
  name,
  value,
  defaultValue = [],
  onValueChange,
  suggestions = [],
  createToken,
  disabled,
}: TokenFieldProps) {
  const [own, setOwn] = React.useState<readonly Token[]>(defaultValue);
  const tokens = value ?? own;
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState("");
  const id = React.useId();
  const input = React.useRef<HTMLInputElement>(null);
  function update(next: readonly Token[]) {
    if (disabled) return;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
    input.current?.focus();
  }
  function add() {
    const query = text.trim();
    if (!query || disabled) return;
    const token =
      suggestions.find(
        (entry) => !entry.disabled && (entry.label === query || entry.id === query),
      ) ?? createToken?.(query);
    if (!token || !token.id || token.disabled) {
      setError("Choose an available token.");
      return;
    }
    if (!tokens.some((entry) => entry.id === token.id)) update([...tokens, token]);
    setText("");
    setError("");
  }
  return (
    <div className="fux-field">
      <label htmlFor={id} className="fux-label">
        {label}
      </label>
      <div className="fux-token-field">
        {tokens.map((token) => (
          <span key={token.id} className="fux-tag">
            {token.label}
            {name && (
              <input
                type="hidden"
                name={name}
                value={token.value ?? token.id}
                disabled={disabled}
              />
            )}
            <button
              type="button"
              disabled={disabled || token.disabled}
              aria-label={`Remove ${token.label}`}
              onClick={() => update(tokens.filter((entry) => entry.id !== token.id))}
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={input}
          id={id}
          value={text}
          disabled={disabled}
          list={`${id}-suggestions`}
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error)}
          onChange={(event) => {
            setText(event.target.value);
            setError("");
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            } else if (event.key === "Backspace" && !text) {
              const last =
                event.currentTarget.previousElementSibling?.querySelector<HTMLButtonElement>(
                  "button:not(:disabled)",
                );
              if (last) {
                event.preventDefault();
                last.focus();
              }
            }
          }}
        />
        <datalist id={`${id}-suggestions`}>
          {suggestions
            .filter((token) => !token.disabled && !tokens.some((entry) => entry.id === token.id))
            .map((token) => (
              <option key={token.id} value={token.label} />
            ))}
        </datalist>
      </div>
      {error && (
        <span role="alert" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
  );
}
export function TagGroup({
  label,
  tags,
  onRemove,
}: {
  label: string;
  tags: readonly string[];
  onRemove?: (tag: string) => void;
}) {
  return (
    <div role="group" aria-label={label} className="fux-row">
      {tags.map((tag) => (
        <span className="fux-tag" key={tag}>
          {tag}
          {onRemove && (
            <button type="button" aria-label={`Remove ${tag}`} onClick={() => onRemove(tag)}>
              ×
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
