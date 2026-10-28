"use client";
import * as A from "react-aria-components";
import type { ReactNode, Ref } from "react";
import * as P from "./primitives.js";

export interface CollectionOption {
  id: string;
  label: string;
  description?: string;
  isDisabled?: boolean;
}
interface CollectionDetails {
  label: string;
  options: readonly CollectionOption[];
  hint?: string;
  error?: string;
}
function Options({ options }: Pick<CollectionDetails, "options">) {
  return (
    <>
      {options.map((option) => (
        <P.ListBoxItem
          key={option.id}
          id={option.id}
          textValue={option.label}
          isDisabled={option.isDisabled}
        >
          <P.Text slot="label" className="fux-option__label">
            {option.label}
          </P.Text>
          {option.description && <P.Text slot="description">{option.description}</P.Text>}
        </P.ListBoxItem>
      ))}
    </>
  );
}
function Details({ hint, error }: Pick<CollectionDetails, "hint" | "error">) {
  return (
    <>
      {hint && <P.Text slot="description">{hint}</P.Text>}
      <P.FieldError>{error}</P.FieldError>
    </>
  );
}
export interface SelectProps
  extends
    Omit<A.SelectProps<CollectionOption>, "children" | "className" | "items" | "defaultItems">,
    CollectionDetails {
  ref?: Ref<HTMLDivElement>;
}
export function Select({ label, options, hint, error, ...props }: SelectProps) {
  return (
    <P.Select {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Button className="fux-select__trigger">
        <P.SelectValue />
        <span aria-hidden="true">⌄</span>
      </P.Button>
      <Details hint={hint} error={error} />
      <P.Popover>
        <P.ListBox>
          <Options options={options} />
        </P.ListBox>
      </P.Popover>
    </P.Select>
  );
}
export interface ComboBoxProps
  extends
    Omit<A.ComboBoxProps<CollectionOption>, "children" | "className" | "items" | "defaultItems">,
    CollectionDetails {
  triggerLabel?: string;
  ref?: Ref<HTMLDivElement>;
}
export function ComboBox({
  label,
  options,
  hint,
  error,
  triggerLabel = "Show options",
  ...props
}: ComboBoxProps) {
  return (
    <P.ComboBox {...props} defaultItems={options} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Group>
        <P.Input />
        <P.Button aria-label={triggerLabel}>⌄</P.Button>
      </P.Group>
      <Details hint={hint} error={error} />
      <P.Popover>
        <P.ListBox<CollectionOption>>
          {(option) => (
            <P.ListBoxItem id={option.id} textValue={option.label} isDisabled={option.isDisabled}>
              <P.Text slot="label" className="fux-option__label">
                {option.label}
              </P.Text>
              {option.description && <P.Text slot="description">{option.description}</P.Text>}
            </P.ListBoxItem>
          )}
        </P.ListBox>
      </P.Popover>
    </P.ComboBox>
  );
}
export interface ListBoxProps
  extends
    Omit<A.ListBoxProps<CollectionOption>, "children" | "className" | "items">,
    Pick<CollectionDetails, "label" | "options"> {
  ref?: Ref<HTMLDivElement>;
}
export function ListBox({ label, options, ...props }: ListBoxProps) {
  return (
    <P.ListBox {...props} aria-label={label}>
      <Options options={options} />
    </P.ListBox>
  );
}
export interface MenuOption extends CollectionOption {
  shortcut?: string;
  href?: string;
}
export interface MenuProps extends Omit<
  A.MenuProps<MenuOption>,
  "children" | "className" | "items"
> {
  label: string;
  items: readonly MenuOption[];
  triggerVariant?: "primary" | "secondary" | "quiet";
  ref?: Ref<HTMLDivElement>;
}
export function Menu({ label, items, triggerVariant = "secondary", ...props }: MenuProps) {
  return (
    <P.MenuTrigger>
      <P.Button data-variant={triggerVariant}>
        {label}
        <span aria-hidden="true">⌄</span>
      </P.Button>
      <P.Popover>
        <P.Menu {...props} aria-label={label}>
          {items.map((item) => (
            <P.MenuItem
              key={item.id}
              id={item.id}
              textValue={item.label}
              isDisabled={item.isDisabled}
              href={item.href}
            >
              <P.Text slot="label" className="fux-option__label">
                {item.label}
              </P.Text>
              {item.description && <P.Text slot="description">{item.description}</P.Text>}
              {item.shortcut && <P.Keyboard>{item.shortcut}</P.Keyboard>}
            </P.MenuItem>
          ))}
        </P.Menu>
      </P.Popover>
    </P.MenuTrigger>
  );
}
export interface TabOption {
  id: string;
  label: ReactNode;
  content: ReactNode;
  isDisabled?: boolean;
}
export interface TabsProps extends Omit<A.TabsProps, "children" | "className"> {
  label: string;
  items: readonly TabOption[];
  ref?: Ref<HTMLDivElement>;
}
export function Tabs({ label, items, ...props }: TabsProps) {
  return (
    <P.Tabs {...props}>
      <P.TabList aria-label={label}>
        {items.map((item) => (
          <P.Tab key={item.id} id={item.id} isDisabled={item.isDisabled}>
            {item.label}
          </P.Tab>
        ))}
      </P.TabList>
      {items.map((item) => (
        <P.TabPanel key={item.id} id={item.id}>
          {item.content}
        </P.TabPanel>
      ))}
    </P.Tabs>
  );
}
export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  href?: string;
}
export interface BreadcrumbsProps extends Omit<
  A.BreadcrumbsProps<BreadcrumbItem>,
  "children" | "className" | "items"
> {
  items: readonly BreadcrumbItem[];
  label?: string;
  ref?: Ref<HTMLOListElement>;
}
export function Breadcrumbs({ items, label = "Breadcrumbs", ...props }: BreadcrumbsProps) {
  return (
    <P.Breadcrumbs {...props} aria-label={label}>
      {items.map((item) => (
        <P.Breadcrumb key={item.id} id={item.id}>
          <P.Link href={item.href}>{item.label}</P.Link>
        </P.Breadcrumb>
      ))}
    </P.Breadcrumbs>
  );
}
export interface DisclosureItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  isDisabled?: boolean;
}
export interface DisclosureGroupProps extends Omit<
  A.DisclosureGroupProps,
  "children" | "className"
> {
  items: readonly DisclosureItem[];
  ref?: Ref<HTMLDivElement>;
}
export function DisclosureGroup({ items, ...props }: DisclosureGroupProps) {
  return (
    <P.DisclosureGroup {...props}>
      {items.map((item) => (
        <P.Disclosure key={item.id} id={item.id} isDisabled={item.isDisabled}>
          <P.Heading>
            <P.Button slot="trigger" className="fux-disclosure__trigger">
              {item.title}
              <span className="fux-disclosure__chevron" aria-hidden="true">
                ⌄
              </span>
            </P.Button>
          </P.Heading>
          <P.DisclosurePanel>{item.content}</P.DisclosurePanel>
        </P.Disclosure>
      ))}
    </P.DisclosureGroup>
  );
}
export interface DisclosureProps extends Omit<A.DisclosureProps, "children" | "className"> {
  title: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}
export function Disclosure({ title, children, ...props }: DisclosureProps) {
  return (
    <P.Disclosure {...props}>
      <P.Heading>
        <P.Button slot="trigger" className="fux-disclosure__trigger">
          {title}
          <span className="fux-disclosure__chevron" aria-hidden="true">
            ⌄
          </span>
        </P.Button>
      </P.Heading>
      <P.DisclosurePanel>{children}</P.DisclosurePanel>
    </P.Disclosure>
  );
}

export interface GridListProps extends Omit<
  A.GridListProps<CollectionOption>,
  "children" | "className" | "items"
> {
  label: string;
  items: readonly CollectionOption[];
  ref?: Ref<HTMLDivElement>;
}
export function GridList({ label, items, ...props }: GridListProps) {
  return (
    <P.GridList {...props} aria-label={label}>
      {items.map((item) => (
        <P.GridListItem
          key={item.id}
          id={item.id}
          textValue={item.label}
          isDisabled={item.isDisabled}
        >
          <span className="fux-option__label">{item.label}</span>
          {item.description && <P.Text slot="description">{item.description}</P.Text>}
        </P.GridListItem>
      ))}
    </P.GridList>
  );
}
export interface TableColumn<T> {
  id: string;
  label: string;
  isRowHeader?: boolean;
  allowsSorting?: boolean;
  render: (row: T) => ReactNode;
}
export interface TableProps<T extends { id: string }> extends Omit<
  A.TableProps,
  "children" | "className"
> {
  label: string;
  columns: readonly TableColumn<T>[];
  rows: readonly T[];
  emptyState?: ReactNode;
  ref?: Ref<HTMLDivElement | HTMLTableElement>;
}
export function Table<T extends { id: string }>({
  label,
  columns,
  rows,
  emptyState = "No rows",
  ...props
}: TableProps<T>) {
  return (
    <div className="fux-table-container">
      <P.Table {...props} aria-label={label}>
        <P.TableHeader>
          {columns.map((column, index) => (
            <P.Column
              key={column.id}
              id={column.id}
              isRowHeader={column.isRowHeader ?? index === 0}
              allowsSorting={column.allowsSorting}
            >
              {({ sortDirection }) => (
                <>
                  {column.label}
                  {column.allowsSorting && (
                    <span className="fux-table__sort" aria-hidden="true">
                      {sortDirection === "ascending"
                        ? " ↑"
                        : sortDirection === "descending"
                          ? " ↓"
                          : " ↕"}
                    </span>
                  )}
                </>
              )}
            </P.Column>
          ))}
        </P.TableHeader>
        <P.TableBody renderEmptyState={() => emptyState}>
          {rows.map((row) => (
            <P.Row key={row.id} id={row.id}>
              {columns.map((column) => (
                <P.Cell key={column.id}>{column.render(row)}</P.Cell>
              ))}
            </P.Row>
          ))}
        </P.TableBody>
      </P.Table>
    </div>
  );
}
export interface TreeNode {
  id: string;
  label: string;
  href?: string;
  isDisabled?: boolean;
  children?: readonly TreeNode[];
}
export interface TreeProps extends Omit<A.TreeProps<TreeNode>, "children" | "className" | "items"> {
  label: string;
  items: readonly TreeNode[];
  ref?: Ref<HTMLDivElement>;
}
function TreeNodes({
  items,
  navigation = false,
}: {
  items: readonly TreeNode[];
  navigation?: boolean;
}) {
  return (
    <>
      {items.map((item) =>
        navigation ? (
          <P.NavigationTreeItem
            key={item.id}
            id={item.id}
            textValue={item.label}
            href={item.href}
            isDisabled={item.isDisabled}
          >
            <P.NavigationTreeItemContent>
              {({ hasChildItems, isExpanded, level }) => (
                <div
                  className="fux-tree__row"
                  style={{ paddingInlineStart: `${(level - 1) * 1.25}rem` }}
                >
                  {hasChildItems && (
                    <P.Button slot="chevron" aria-label={isExpanded ? "Collapse" : "Expand"}>
                      <span aria-hidden="true">{isExpanded ? "⌄" : "›"}</span>
                    </P.Button>
                  )}
                  <span>{item.label}</span>
                </div>
              )}
            </P.NavigationTreeItemContent>
            {item.children && <TreeNodes items={item.children} navigation />}
          </P.NavigationTreeItem>
        ) : (
          <P.TreeItem
            key={item.id}
            id={item.id}
            textValue={item.label}
            isDisabled={item.isDisabled}
          >
            <P.TreeItemContent>
              {({ hasChildItems, isExpanded, level }) => (
                <div
                  className="fux-tree__row"
                  style={{ paddingInlineStart: `${(level - 1) * 1.25}rem` }}
                >
                  {hasChildItems && (
                    <P.Button slot="chevron" aria-label={isExpanded ? "Collapse" : "Expand"}>
                      <span aria-hidden="true">{isExpanded ? "⌄" : "›"}</span>
                    </P.Button>
                  )}
                  <span>{item.label}</span>
                </div>
              )}
            </P.TreeItemContent>
            {item.children && <TreeNodes items={item.children} />}
          </P.TreeItem>
        ),
      )}
    </>
  );
}
export function Tree({ label, items, ...props }: TreeProps) {
  return (
    <P.Tree {...props} aria-label={label}>
      <TreeNodes items={items} />
    </P.Tree>
  );
}
export interface NavigationTreeProps extends Omit<
  A.NavigationTreeProps<TreeNode>,
  "children" | "className" | "items"
> {
  label: string;
  items: readonly TreeNode[];
  ref?: Ref<HTMLDivElement>;
}
export function NavigationTree({ label, items, ...props }: NavigationTreeProps) {
  return (
    <P.NavigationTree {...props} aria-label={label}>
      <TreeNodes items={items} navigation />
    </P.NavigationTree>
  );
}
export interface TagGroupProps extends Omit<A.TagGroupProps, "children" | "className"> {
  label: string;
  items: readonly CollectionOption[];
  emptyState?: ReactNode;
  removeLabel?: (label: string) => string;
  ref?: Ref<HTMLDivElement>;
}
export function TagGroup({
  label,
  items,
  emptyState = "No tags",
  removeLabel = () => "Remove",
  ...props
}: TagGroupProps) {
  return (
    <P.TagGroup {...props}>
      <P.Label>{label}</P.Label>
      <P.TagList renderEmptyState={() => emptyState}>
        {items.map((item) => (
          <P.Tag key={item.id} id={item.id} textValue={item.label} isDisabled={item.isDisabled}>
            <span>{item.label}</span>
            {props.onRemove && (
              <P.Button slot="remove" aria-label={removeLabel(item.label)} data-variant="quiet">
                ×
              </P.Button>
            )}
          </P.Tag>
        ))}
      </P.TagList>
    </P.TagGroup>
  );
}
