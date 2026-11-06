"use client";

import * as React from "react";
import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Combobox } from "@base-ui/react/combobox";
import { Accordion } from "@base-ui/react/accordion";
import { Collapsible } from "@base-ui/react/collapsible";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsUpDownIcon,
  CircleAlertIcon,
  FileTextIcon,
  FolderIcon,
  FolderOpenIcon,
  InboxIcon,
  SearchXIcon,
  XIcon,
} from "lucide-react";
import { Button } from "./ui/button.js";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList } from "./ui/breadcrumb.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu.js";
import { Skeleton } from "./ui/skeleton.js";
import { cn } from "../lib/utils.js";

export interface CollectionOption {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  /** Decorative icon shown before the label. */
  icon?: React.ReactNode;
  /** Heading for a run of consecutive options; a new heading starts a new group. */
  group?: string;
}

interface OptionGroup<T extends CollectionOption> {
  label?: string;
  items: T[];
}
/** Splits options into runs that share a `group` heading, keeping their order. */
function groupOptions<T extends CollectionOption>(options: readonly T[]): OptionGroup<T>[] {
  const groups: OptionGroup<T>[] = [];
  for (const option of options) {
    const last = groups.at(-1);
    if (last && last.label === option.group) last.items.push(option);
    else groups.push({ label: option.group, items: [option] });
  }
  return groups;
}

/** A function-or-string `className` (Base UI style) merged with the component's own classes. */
function mergeClass<State>(
  base: string,
  className: string | ((state: State) => string | undefined) | undefined,
) {
  return (state: State) => cn(base, typeof className === "function" ? className(state) : className);
}

/** Leading icon, label and an optional second line, shared by every option-like row. */
function OptionBody({ option }: { option: CollectionOption }) {
  return (
    <>
      {option.icon && (
        <span
          aria-hidden
          className="flex shrink-0 text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
        >
          {option.icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{option.label}</span>
        {option.description && (
          <span className="truncate text-xs text-muted-foreground">{option.description}</span>
        )}
      </span>
    </>
  );
}

const optionRow =
  "relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 ps-2 pe-8 text-ui outline-hidden select-none data-disabled:pointer-events-none data-disabled:opacity-50";
const popupSurface =
  "origin-(--transform-origin) overflow-y-auto overflow-x-hidden rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 duration-100 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 motion-reduce:animate-none";
const groupLabel = "px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground select-none";
const checkSlot =
  "pointer-events-none absolute end-2 flex size-4 items-center justify-center [&_svg]:size-4";

function FieldMessage({
  id,
  hint,
  error,
  alert,
}: {
  id: string;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  alert?: boolean;
}) {
  if (error)
    return (
      <span
        id={id}
        role={alert ? "alert" : undefined}
        className="fux-error flex items-start gap-1 text-pretty"
      >
        <CircleAlertIcon aria-hidden className="mt-px size-3.5 shrink-0" />
        {error}
      </span>
    );
  if (hint)
    return (
      <span id={id} className="fux-hint text-pretty">
        {hint}
      </span>
    );
  return null;
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
  const groups = groupOptions(options);
  return (
    <div className="fux-field">
      <span id={id} className="fux-label">
        {label}
      </span>
      <SelectPrimitive.Root
        {...props}
        items={options.map((option) => ({
          value: option.id,
          label:
            option.icon && !props.multiple ? (
              <span className="flex items-center gap-2">
                <span aria-hidden className="flex text-muted-foreground [&_svg]:size-4">
                  {option.icon}
                </span>
                {option.label}
              </span>
            ) : (
              option.label
            ),
        }))}
      >
        <SelectPrimitive.Trigger
          data-slot="select-trigger"
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-transparent py-1 ps-2.5 pe-2 text-[length:var(--fux-input-font-size,1rem)] whitespace-nowrap transition-colors outline-none select-none hover:border-ring/40 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/15 data-placeholder:text-muted-foreground data-popup-open:border-ring data-readonly:cursor-default data-readonly:bg-muted/40 data-readonly:hover:border-input dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/25 [&_svg]:pointer-events-none [&_svg]:shrink-0",
          )}
          aria-labelledby={id}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${id}-details` : undefined}
        >
          <SelectPrimitive.Value
            placeholder={placeholder}
            className="min-w-0 flex-1 truncate text-start"
          />
          <SelectPrimitive.Icon
            aria-hidden
            className="text-muted-foreground transition-transform duration-150 data-popup-open:rotate-180 motion-reduce:transition-none"
          >
            <ChevronDownIcon className="size-4" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Positioner
            className="isolate z-50 outline-none"
            sideOffset={4}
            alignItemWithTrigger={false}
          >
            <SelectPrimitive.Popup
              data-slot="select-content"
              className={cn(
                popupSurface,
                "max-h-(--available-height) min-w-(--anchor-width) max-w-(--available-width)",
              )}
            >
              <SelectPrimitive.List>
                {groups.map((group, index) => (
                  <React.Fragment key={group.label ?? `group-${index}`}>
                    {index > 0 && (
                      <SelectPrimitive.Separator className="mx-1 my-1 h-px bg-border" />
                    )}
                    <SelectPrimitive.Group className="p-1">
                      {group.label && (
                        <SelectPrimitive.GroupLabel className={groupLabel}>
                          {group.label}
                        </SelectPrimitive.GroupLabel>
                      )}
                      {group.items.map((option) => (
                        <SelectPrimitive.Item
                          key={option.id}
                          value={option.id}
                          disabled={option.disabled}
                          data-slot="select-item"
                          className={cn(
                            optionRow,
                            "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
                          )}
                        >
                          <SelectPrimitive.ItemText className="contents">
                            <OptionBody option={option} />
                          </SelectPrimitive.ItemText>
                          <SelectPrimitive.ItemIndicator
                            render={<span className={checkSlot} />}
                            aria-hidden
                          >
                            <CheckIcon />
                          </SelectPrimitive.ItemIndicator>
                        </SelectPrimitive.Item>
                      ))}
                    </SelectPrimitive.Group>
                  </React.Fragment>
                ))}
              </SelectPrimitive.List>
            </SelectPrimitive.Popup>
          </SelectPrimitive.Positioner>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
      <FieldMessage id={`${id}-details`} hint={hint} error={error} />
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
  /** Text for the empty state while the typed text matches nothing. */
  emptyText?: string;
}

const comboIconButton =
  "grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4";

export function ComboBox({
  label,
  options,
  placeholder,
  hint,
  error,
  emptyText = "No results found",
  ...props
}: ComboBoxProps) {
  const id = React.useId();
  const byId = new Map(options.map((option) => [option.id, option]));
  const groups = groupOptions(options);
  const grouped = groups.some((group) => group.label);
  const items = grouped
    ? groups.map((group) => ({ value: group.label ?? "", items: group.items.map((o) => o.id) }))
    : options.map((option) => option.id);
  function renderItem(value: string) {
    const option = byId.get(value);
    return (
      <Combobox.Item
        key={value}
        value={value}
        disabled={option?.disabled}
        className={cn(
          optionRow,
          "data-highlighted:bg-accent data-highlighted:text-accent-foreground",
        )}
      >
        {option ? <OptionBody option={option} /> : <span className="truncate">{value}</span>}
        <Combobox.ItemIndicator render={<span className={checkSlot} />} aria-hidden>
          <CheckIcon />
        </Combobox.ItemIndicator>
      </Combobox.Item>
    );
  }
  return (
    <div className="fux-field">
      <Combobox.Root
        {...props}
        items={items as string[]}
        itemToStringLabel={(value) => byId.get(value)?.label ?? value}
      >
        <label htmlFor={`${id}-input`} className="fux-label">
          {label}
        </label>
        <Combobox.InputGroup
          data-slot="combobox-input-group"
          className="flex min-h-8 w-full items-center gap-0.5 rounded-lg border border-input bg-transparent ps-1 pe-1 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20 hover:border-ring/40 has-[input[aria-invalid=true]]:border-destructive has-[input[aria-invalid=true]]:ring-2 has-[input[aria-invalid=true]]:ring-destructive/15 has-[input:disabled]:pointer-events-none has-[input:disabled]:opacity-50 dark:bg-input/30"
        >
          <Combobox.Input
            id={`${id}-input`}
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-ui outline-none placeholder:text-muted-foreground"
            placeholder={placeholder}
            aria-invalid={Boolean(error)}
            aria-describedby={hint || error ? id : undefined}
          />
          <Combobox.Clear className={comboIconButton} aria-label="Clear selection">
            <XIcon aria-hidden />
          </Combobox.Clear>
          <Combobox.Trigger className={comboIconButton} aria-label="Show options">
            <ChevronDownIcon
              aria-hidden
              className="transition-transform duration-150 in-data-popup-open:rotate-180 motion-reduce:transition-none"
            />
          </Combobox.Trigger>
        </Combobox.InputGroup>
        <Combobox.Portal>
          <Combobox.Positioner className="isolate z-50 outline-none" sideOffset={4}>
            <Combobox.Popup
              className={cn(
                popupSurface,
                "max-h-(--available-height) w-(--anchor-width) max-w-(--available-width)",
              )}
            >
              <Combobox.Empty className="flex flex-col items-center gap-1.5 px-3 py-6 text-center text-ui text-muted-foreground empty:hidden empty:p-0">
                <SearchXIcon aria-hidden className="size-5" />
                {emptyText}
              </Combobox.Empty>
              <Combobox.List className="max-h-[min(22rem,var(--available-height))] overflow-y-auto p-1 outline-none data-empty:p-0">
                {grouped
                  ? (group: { value: string; items: string[] }) => (
                      <Combobox.Group
                        key={group.value || "ungrouped"}
                        items={group.items}
                        className="block not-first:mt-1 not-first:border-t not-first:border-border not-first:pt-1"
                      >
                        {group.value && (
                          <Combobox.GroupLabel className={groupLabel}>
                            {group.value}
                          </Combobox.GroupLabel>
                        )}
                        <Combobox.Collection>{renderItem}</Combobox.Collection>
                      </Combobox.Group>
                    )
                  : renderItem}
              </Combobox.List>
            </Combobox.Popup>
          </Combobox.Positioner>
        </Combobox.Portal>
      </Combobox.Root>
      <FieldMessage id={id} hint={hint} error={error} />
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

const rowState =
  "group/option relative cursor-default outline-none transition-colors duration-(--fux-motion-duration) ease-(--ease-standard) hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset aria-selected:bg-accent aria-selected:text-accent-foreground aria-disabled:pointer-events-none aria-disabled:opacity-50";
/** The trailing check that marks a selected row. */
function SelectedCheck() {
  return (
    <CheckIcon
      aria-hidden
      className="ms-auto size-4 shrink-0 text-signal opacity-0 group-aria-selected/option:opacity-100"
    />
  );
}

export function ListBox({ label, options, ...props }: ListBoxProps) {
  const collection = useCollection(options, props);
  const id = React.useId();
  const groups = groupOptions(options);
  return (
    <div
      role="listbox"
      aria-label={label}
      aria-multiselectable={props.multiple || undefined}
      className="flex flex-col rounded-lg border border-border bg-background p-1"
    >
      {groups.map((group, index) => {
        const rows = group.items.map((option) => (
          <div
            key={option.id}
            role="option"
            className={cn(
              rowState,
              "flex min-h-8 items-center gap-2 rounded-md px-2 py-1.5 text-ui",
            )}
            {...collection.itemProps(option)}
          >
            <OptionBody option={option} />
            <SelectedCheck />
          </div>
        ));
        return (
          <React.Fragment key={group.label ?? `group-${index}`}>
            {index > 0 && <div role="separator" className="mx-1 my-1 h-px bg-border" />}
            {group.label ? (
              <div role="group" aria-labelledby={`${id}-${index}`}>
                <div id={`${id}-${index}`} className={groupLabel}>
                  {group.label}
                </div>
                {rows}
              </div>
            ) : (
              rows
            )}
          </React.Fragment>
        );
      })}
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
      className="fux-gridlist flex flex-col overflow-hidden rounded-lg border border-border bg-background"
    >
      {items.map((item) => (
        <div
          role="row"
          key={item.id}
          className={cn(
            rowState,
            "fux-gridlist-row flex min-h-10 items-center gap-3 border-b border-hairline px-3 py-2 text-ui last:border-b-0",
          )}
          {...collection.itemProps(item)}
        >
          <div role="gridcell" className="flex min-w-0 flex-1 items-center gap-2">
            {renderItem?.(item) ?? <OptionBody option={item} />}
          </div>
          <SelectedCheck />
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
  /** Horizontal alignment of the header and its cells. Defaults to the start edge. */
  align?: "start" | "center" | "end";
  /** Right-aligns the column and sets its digits in tabular figures. */
  numeric?: boolean;
  /** Fixed column width, as a CSS length or a number of pixels. */
  width?: string | number;
  /** Clips long cell text with an ellipsis instead of wrapping. */
  truncate?: boolean;
}

export interface TableProps<T extends { id: string }> extends SelectionProps {
  label: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  emptyState?: React.ReactNode;
  sort?: { column: string; direction: "ascending" | "descending" };
  onSortChange?: (sort: { column: string; direction: "ascending" | "descending" }) => void;
  isRowDisabled?: (row: T) => boolean;
  /** Row height: comfortable (40px) or compact (32px). */
  density?: "comfortable" | "compact";
  /** Keeps the header visible while the body scrolls (needs `maxHeight` or a bounded parent). */
  stickyHeader?: boolean;
  /** Caps the table's height and scrolls the rows inside it. */
  maxHeight?: string | number;
  /** Shows placeholder rows in place of the data. */
  loading?: boolean;
  className?: string;
}

const columnAlign = (column: TableColumn<never>) =>
  column.numeric || column.align === "end"
    ? "text-end"
    : column.align === "center"
      ? "text-center"
      : "text-start";

export function Table<T extends { id: string }>({
  label,
  columns,
  rows,
  emptyState = "No rows",
  sort: controlledSort,
  onSortChange,
  isRowDisabled,
  density = "comfortable",
  stickyHeader = true,
  maxHeight,
  loading,
  className,
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
  const compact = density === "compact";
  const cell = cn(
    "border-b border-hairline px-3 align-middle",
    compact ? "h-8 py-1 text-xs" : "h-10 py-2 text-ui",
  );
  const cssLength = (value: string | number | undefined) =>
    typeof value === "number" ? `${value}px` : value;
  return (
    <div
      className={cn(
        "fux-table-scroll relative overflow-auto rounded-lg border border-border bg-background",
        className,
      )}
      style={{ maxBlockSize: cssLength(maxHeight) }}
      aria-busy={loading || undefined}
    >
      <table
        className="fux-data-table w-full border-separate border-spacing-0 text-start text-foreground"
        aria-label={label}
        role={selectable ? "grid" : undefined}
        aria-multiselectable={(selectable && props.multiple) || undefined}
      >
        <thead className={cn(stickyHeader && "sticky top-0 z-10")}>
          <tr>
            {columns.map((entry) => {
              const sorted = sort?.column === entry.id ? sort.direction : undefined;
              return (
                <th
                  key={entry.id}
                  scope="col"
                  aria-sort={sorted}
                  style={{ width: cssLength(entry.width) }}
                  className={cn(
                    "h-10 border-b border-border bg-muted px-3 text-xs font-medium whitespace-nowrap text-muted-foreground",
                    columnAlign(entry),
                    sorted && "text-foreground",
                    compact && "h-8",
                    entry.allowsSorting && "p-0",
                  )}
                >
                  {entry.allowsSorting ? (
                    <button
                      type="button"
                      onClick={() => changeSort(entry.id)}
                      className={cn(
                        "group/sort flex min-h-full w-full items-center gap-1 px-3 py-2 text-xs font-medium outline-none transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset",
                        (entry.numeric || entry.align === "end") && "justify-end",
                        entry.align === "center" && "justify-center",
                      )}
                    >
                      {entry.label}
                      {sorted === "ascending" ? (
                        <ArrowUpIcon aria-hidden className="size-3.5 shrink-0 text-foreground" />
                      ) : sorted === "descending" ? (
                        <ArrowDownIcon aria-hidden className="size-3.5 shrink-0 text-foreground" />
                      ) : (
                        <ChevronsUpDownIcon
                          aria-hidden
                          className="size-3.5 shrink-0 opacity-40 transition-opacity group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100"
                        />
                      )}
                    </button>
                  ) : (
                    entry.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 3 }, (_, index) => (
              <tr key={index} aria-hidden>
                {columns.map((entry) => (
                  <td key={entry.id} className={cell}>
                    <Skeleton className={cn("h-3.5 w-3/4", entry.numeric && "ms-auto w-1/2")} />
                  </td>
                ))}
              </tr>
            ))
          ) : displayed.length ? (
            displayed.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "fux-table-row transition-colors duration-(--fux-motion-duration) ease-(--ease-standard) hover:bg-muted/60 aria-disabled:opacity-50",
                  selectable &&
                    "cursor-default outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
                )}
                {...(selectable
                  ? selection.itemProps({
                      id: row.id,
                      label: row.id,
                      disabled: isRowDisabled?.(row),
                    })
                  : {})}
              >
                {columns.map((entry) => {
                  const Cell = entry.isRowHeader ? "th" : "td";
                  return (
                    <Cell
                      key={entry.id}
                      scope={entry.isRowHeader ? "row" : undefined}
                      style={{
                        width: cssLength(entry.width),
                        maxWidth: entry.truncate ? (cssLength(entry.width) ?? "18rem") : undefined,
                      }}
                      className={cn(
                        cell,
                        columnAlign(entry),
                        entry.isRowHeader && "font-medium",
                        entry.numeric && "tabular-nums whitespace-nowrap",
                        entry.truncate && "truncate",
                      )}
                    >
                      {entry.render(row)}
                    </Cell>
                  );
                })}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10">
                {typeof emptyState === "string" ? (
                  <div className="flex flex-col items-center gap-2 text-center text-ui text-muted-foreground">
                    <InboxIcon aria-hidden className="size-5" />
                    {emptyState}
                  </div>
                ) : (
                  emptyState
                )}
              </td>
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
  /** Shows a folder or document icon before each label unless the node brings its own. */
  showIcons?: boolean;
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
  showIcons = true,
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
            {Array.from({ length: row.level - 1 }, (_, depth) => (
              <span key={depth} aria-hidden="true" className="fux-tree-guide" />
            ))}
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
                <ChevronDownIcon aria-hidden className="fux-tree-chevron" />
              </button>
            ) : (
              <span aria-hidden="true" className="fux-tree-disclosure" />
            )}
            {(row.node.icon || showIcons) && (
              <span aria-hidden="true" className="fux-tree-icon">
                {row.node.icon ??
                  (children ? (
                    expanded.has(row.node.id) ? (
                      <FolderOpenIcon />
                    ) : (
                      <FolderIcon />
                    )
                  ) : (
                    <FileTextIcon />
                  ))}
              </span>
            )}
            <span className="fux-tree-label">{renderLabel?.(row.node) ?? row.node.label}</span>
            {row.node.description && (
              <small className="fux-tree-trail">{row.node.description}</small>
            )}
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
  /** Decorative icon before the label. */
  icon?: React.ReactNode;
  /** A count or status shown after the label. */
  badge?: React.ReactNode;
}
export interface TabsProps extends Omit<
  React.ComponentProps<typeof TabsPrimitive.Root>,
  "children"
> {
  label: string;
  items: readonly TabOption[];
  /** "contained" is a segmented control; "underline" is a ruled bar with a sliding line. */
  variant?: "contained" | "underline";
}
export function Tabs({ label, items, variant = "contained", ...props }: TabsProps) {
  return (
    <TabsPrimitive.Root
      {...props}
      data-variant={variant}
      className={mergeClass(
        "fux-tabset flex flex-col gap-3 data-vertical:flex-row",
        props.className,
      )}
    >
      <TabsPrimitive.List aria-label={label} className="fux-tablist" data-variant={variant}>
        {items.map((item) => (
          <TabsPrimitive.Tab
            key={item.id}
            value={item.id}
            disabled={item.disabled}
            data-slot="tabs-trigger"
            className="fux-tab-trigger"
          >
            {item.icon && (
              <span aria-hidden className="flex [&_svg:not([class*='size-'])]:size-4">
                {item.icon}
              </span>
            )}
            {item.label}
            {item.badge != null && <span className="fux-tab-badge">{item.badge}</span>}
          </TabsPrimitive.Tab>
        ))}
        <TabsPrimitive.Indicator className="fux-tab-indicator" />
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
  /** Styles the action as destructive (delete, remove). */
  destructive?: boolean;
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
  const groups = groupOptions(items);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" className="gap-2" />}>
        {label}
        <ChevronDownIcon
          aria-hidden
          className="text-muted-foreground transition-transform duration-150 in-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-52 max-w-(--available-width)">
        {groups.map((group, index) => (
          <React.Fragment key={group.label ?? `group-${index}`}>
            {index > 0 && <DropdownMenuSeparator />}
            <MenuPrimitive.Group>
              {group.label && (
                <MenuPrimitive.GroupLabel className={groupLabel}>
                  {group.label}
                </MenuPrimitive.GroupLabel>
              )}
              {group.items.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  className="min-h-8 gap-2"
                  disabled={item.disabled}
                  variant={item.destructive ? "destructive" : "default"}
                  render={
                    safeNavigationHref(item.href) ? (
                      <a href={safeNavigationHref(item.href)} />
                    ) : undefined
                  }
                  onClick={() => onAction?.(item.id)}
                >
                  {item.icon && (
                    <span
                      aria-hidden
                      className="flex text-muted-foreground [&_svg:not([class*='size-'])]:size-4"
                    >
                      {item.icon}
                    </span>
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.label}</span>
                    {item.description && (
                      <span className="truncate text-xs text-muted-foreground">
                        {item.description}
                      </span>
                    )}
                  </span>
                  {item.shortcut && <DropdownMenuShortcut>{item.shortcut}</DropdownMenuShortcut>}
                </DropdownMenuItem>
              ))}
            </MenuPrimitive.Group>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
    <Breadcrumb aria-label={label}>
      <BreadcrumbList className="fux-breadcrumbs gap-0.5 text-ui">
        {items.map((item, index) => {
          const current = index === items.length - 1;
          const href = safeNavigationHref(item.href);
          const textClass = cn(
            "min-w-0 max-w-56 truncate rounded-sm px-1",
            current ? "font-medium text-foreground" : "text-muted-foreground",
          );
          return (
            <BreadcrumbItem key={item.id} className="min-w-0 gap-0.5">
              {href ? (
                <BreadcrumbLink
                  href={href}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    textClass,
                    "outline-none hover:text-foreground hover:underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-ring/20",
                  )}
                >
                  <span className="truncate">{item.label}</span>
                </BreadcrumbLink>
              ) : (
                <span aria-current={current ? "page" : undefined} className={textClass}>
                  {item.label}
                </span>
              )}
              {!current && (
                <ChevronRightIcon
                  aria-hidden
                  className="size-3.5 shrink-0 text-muted-foreground/70 rtl:rotate-180"
                />
              )}
            </BreadcrumbItem>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
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
    <Collapsible.Root {...props} className={mergeClass("fux-collapse", props.className)}>
      <Collapsible.Trigger className="fux-collapse-trigger">
        <ChevronDownIcon aria-hidden className="fux-collapse-chevron fux-collapse-chevron--start" />
        {title}
      </Collapsible.Trigger>
      <Collapsible.Panel className="fux-collapse-panel">
        <div className="fux-collapse-content">{children}</div>
      </Collapsible.Panel>
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
    <Accordion.Root {...props} className={mergeClass("fux-accordion", props.className)}>
      {items.map((item) => (
        <Accordion.Item
          key={item.id}
          value={item.id}
          disabled={item.disabled}
          className="fux-collapse fux-accordion-item"
        >
          <Accordion.Header className="m-0">
            <Accordion.Trigger className="fux-collapse-trigger">
              {item.title}
              <ChevronDownIcon
                aria-hidden
                className="fux-collapse-chevron fux-collapse-chevron--end"
              />
            </Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel className="fux-collapse-panel">
            <div className="fux-collapse-content">{item.content}</div>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}

/** One removable chip: label, any extra children (hidden form inputs) and the remove button. */
function Chip({
  label,
  children,
  onRemove,
  removeDisabled,
}: {
  label: string;
  children?: React.ReactNode;
  onRemove?: () => void;
  removeDisabled?: boolean;
}) {
  return (
    <span className="fux-chip">
      <span className="fux-chip-label">{label}</span>
      {children}
      {onRemove && (
        <button
          type="button"
          className="fux-chip-remove"
          disabled={removeDisabled}
          aria-label={`Remove ${label}`}
          onClick={onRemove}
        >
          <XIcon aria-hidden />
        </button>
      )}
    </span>
  );
}

export interface TagsInputProps {
  label: string;
  value?: readonly string[];
  defaultValue?: readonly string[];
  onValueChange?: (tags: readonly string[]) => void;
  disabled?: boolean;
  suggestions?: readonly string[];
  placeholder?: string;
  hint?: string;
  error?: string;
}
export function TagsInput({
  label,
  value,
  defaultValue = [],
  onValueChange,
  disabled,
  suggestions = [],
  placeholder,
  hint,
  error,
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
      <div
        className="fux-chip-field"
        data-disabled={disabled || undefined}
        data-invalid={error ? "" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) field.current?.focus();
        }}
      >
        {tags.map((tag) => (
          <Chip
            key={tag}
            label={tag}
            removeDisabled={disabled}
            onRemove={() => {
              change(tags.filter((value) => value !== tag));
              field.current?.focus();
            }}
          />
        ))}
        <input
          id={id}
          ref={field}
          disabled={disabled}
          value={input}
          placeholder={tags.length ? undefined : placeholder}
          list={`${id}-suggestions`}
          aria-invalid={Boolean(error)}
          aria-describedby={hint || error ? `${id}-details` : undefined}
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
      <FieldMessage id={`${id}-details`} hint={hint} error={error} />
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
  placeholder?: string;
  hint?: string;
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
  placeholder,
  hint,
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
      <div
        className="fux-chip-field"
        data-disabled={disabled || undefined}
        data-invalid={error ? "" : undefined}
        onClick={(event) => {
          if (event.target === event.currentTarget) input.current?.focus();
        }}
      >
        {tokens.map((token) => (
          <Chip
            key={token.id}
            label={token.label}
            removeDisabled={disabled || token.disabled}
            onRemove={() => update(tokens.filter((entry) => entry.id !== token.id))}
          >
            {name && (
              <input
                type="hidden"
                name={name}
                value={token.value ?? token.id}
                disabled={disabled}
              />
            )}
          </Chip>
        ))}
        <input
          ref={input}
          id={id}
          value={text}
          disabled={disabled}
          placeholder={tokens.length ? undefined : placeholder}
          list={`${id}-suggestions`}
          aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
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
      {error ? (
        <FieldMessage id={`${id}-error`} error={error} alert />
      ) : (
        <FieldMessage id={`${id}-hint`} hint={hint} />
      )}
    </div>
  );
}
export function TagGroup({
  label,
  tags,
  onRemove,
  emptyState,
}: {
  label: string;
  tags: readonly string[];
  onRemove?: (tag: string) => void;
  /** Shown when there are no tags. Nothing renders by default. */
  emptyState?: React.ReactNode;
}) {
  return (
    <div role="group" aria-label={label} className="fux-tag-group">
      {tags.map((tag) => (
        <Chip key={tag} label={tag} onRemove={onRemove && (() => onRemove(tag))} />
      ))}
      {!tags.length && emptyState != null && (
        <span className="text-ui text-muted-foreground">{emptyState}</span>
      )}
    </div>
  );
}
