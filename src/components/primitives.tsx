"use client";

import * as A from "react-aria-components";
import { createElement, type ComponentType, type ElementType } from "react";

/** Adds presentation only. Props, refs, render props and interaction state stay with the owner. */
function styled<T extends ElementType>(Component: T, base: string): T {
  function Styled(props: Record<string, unknown>) {
    const supplied = props.className;
    const className =
      typeof supplied === "function"
        ? (state: unknown) =>
            `${base} ${(supplied as (state: unknown) => string)(state) ?? ""}`.trim()
        : `${base} ${typeof supplied === "string" ? supplied : ""}`.trim();
    return createElement(Component as ComponentType<Record<string, unknown>>, {
      ...props,
      className,
    });
  }
  return Styled as T;
}

// Each export retains its owner's exact generic prop signature. These are styled
// building blocks, not a second interaction system or a universal prop adapter.
export const Button: typeof A.Button = /* @__PURE__ */ styled(A.Button, "fux-control");
export const ToggleButton: typeof A.ToggleButton = /* @__PURE__ */ styled(
  A.ToggleButton,
  "fux-control",
);
export const CheckboxButton: typeof A.CheckboxButton = /* @__PURE__ */ styled(
  A.CheckboxButton,
  "fux-control",
);
export const RadioButton: typeof A.RadioButton = /* @__PURE__ */ styled(
  A.RadioButton,
  "fux-control",
);
export const SwitchButton: typeof A.SwitchButton = /* @__PURE__ */ styled(
  A.SwitchButton,
  "fux-control",
);
export const TextField: typeof A.TextField = /* @__PURE__ */ styled(A.TextField, "fux-field");
export const NumberField: typeof A.NumberField = /* @__PURE__ */ styled(A.NumberField, "fux-field");
export const SearchField: typeof A.SearchField = /* @__PURE__ */ styled(A.SearchField, "fux-field");
export const DateField: typeof A.DateField = /* @__PURE__ */ styled(A.DateField, "fux-field");
export const TimeField: typeof A.TimeField = /* @__PURE__ */ styled(A.TimeField, "fux-field");
export const DatePicker: typeof A.DatePicker = /* @__PURE__ */ styled(A.DatePicker, "fux-field");
export const DateRangePicker: typeof A.DateRangePicker = /* @__PURE__ */ styled(
  A.DateRangePicker,
  "fux-field",
);
export const ColorField: typeof A.ColorField = /* @__PURE__ */ styled(A.ColorField, "fux-field");
export const RadioGroup: typeof A.RadioGroup = /* @__PURE__ */ styled(A.RadioGroup, "fux-field");
export const CheckboxGroup: typeof A.CheckboxGroup = /* @__PURE__ */ styled(
  A.CheckboxGroup,
  "fux-field",
);
export const SwitchField: typeof A.SwitchField = /* @__PURE__ */ styled(A.SwitchField, "fux-field");
export const CheckboxField: typeof A.CheckboxField = /* @__PURE__ */ styled(
  A.CheckboxField,
  "fux-field",
);
export const RadioField: typeof A.RadioField = /* @__PURE__ */ styled(A.RadioField, "fux-field");
export const TokenField: typeof A.TokenField = /* @__PURE__ */ styled(A.TokenField, "fux-field");
export const Input: typeof A.Input = /* @__PURE__ */ styled(A.Input, "fux-input");
export const TextArea: typeof A.TextArea = /* @__PURE__ */ styled(A.TextArea, "fux-input");
export const TokenInput: typeof A.TokenInput = /* @__PURE__ */ styled(A.TokenInput, "fux-input");
export const Label: typeof A.Label = /* @__PURE__ */ styled(A.Label, "fux-label");
export const Text: typeof A.Text = /* @__PURE__ */ styled(A.Text, "fux-hint");
export const FieldError: typeof A.FieldError = /* @__PURE__ */ styled(A.FieldError, "fux-error");
export const Calendar: typeof A.Calendar = /* @__PURE__ */ styled(A.Calendar, "fux-calendar");
export const RangeCalendar: typeof A.RangeCalendar = /* @__PURE__ */ styled(
  A.RangeCalendar,
  "fux-calendar",
);
export const CalendarGrid: typeof A.CalendarGrid = /* @__PURE__ */ styled(
  A.CalendarGrid,
  "fux-calendar__grid",
);
export const CalendarHeaderCell: typeof A.CalendarHeaderCell = /* @__PURE__ */ styled(
  A.CalendarHeaderCell,
  "fux-calendar__header-cell",
);
export const CalendarCell: typeof A.CalendarCell = /* @__PURE__ */ styled(
  A.CalendarCell,
  "fux-calendar__cell",
);
export const CalendarHeading: typeof A.CalendarHeading = /* @__PURE__ */ styled(
  A.CalendarHeading,
  "fux-calendar__heading",
);
export const CalendarMonthPicker: typeof A.CalendarMonthPicker = /* @__PURE__ */ styled(
  A.CalendarMonthPicker,
  "fux-input fux-calendar__picker",
);
export const CalendarYearPicker: typeof A.CalendarYearPicker = /* @__PURE__ */ styled(
  A.CalendarYearPicker,
  "fux-input fux-calendar__picker",
);
export const DateInput: typeof A.DateInput = /* @__PURE__ */ styled(A.DateInput, "fux-date-input");
export const DateSegment: typeof A.DateSegment = /* @__PURE__ */ styled(
  A.DateSegment,
  "fux-date-segment",
);
export const ColorArea: typeof A.ColorArea = /* @__PURE__ */ styled(A.ColorArea, "fux-color-area");
export const ColorThumb: typeof A.ColorThumb = /* @__PURE__ */ styled(
  A.ColorThumb,
  "fux-color-thumb",
);
export const ColorSlider: typeof A.ColorSlider = /* @__PURE__ */ styled(
  A.ColorSlider,
  "fux-color-slider",
);
export const ColorSwatch: typeof A.ColorSwatch = /* @__PURE__ */ styled(
  A.ColorSwatch,
  "fux-color-swatch",
);
export const ColorSwatchPicker: typeof A.ColorSwatchPicker = /* @__PURE__ */ styled(
  A.ColorSwatchPicker,
  "fux-color-swatches",
);
export const ColorSwatchPickerItem: typeof A.ColorSwatchPickerItem = /* @__PURE__ */ styled(
  A.ColorSwatchPickerItem,
  "fux-color-swatches__item",
);
export const ColorWheel: typeof A.ColorWheel = /* @__PURE__ */ styled(
  A.ColorWheel,
  "fux-color-wheel",
);
export const ColorWheelTrack: typeof A.ColorWheelTrack = /* @__PURE__ */ styled(
  A.ColorWheelTrack,
  "fux-color-wheel__track",
);
export const ComboBox: typeof A.ComboBox = /* @__PURE__ */ styled(
  A.ComboBox,
  "fux-combobox fux-field",
);
export const Select: typeof A.Select = /* @__PURE__ */ styled(A.Select, "fux-select fux-field");
export const SelectValue: typeof A.SelectValue = /* @__PURE__ */ styled(
  A.SelectValue,
  "fux-select__value",
);
export const ComboBoxValue: typeof A.ComboBoxValue = /* @__PURE__ */ styled(
  A.ComboBoxValue,
  "fux-select__value",
);
export const Checkbox: typeof A.Checkbox = /* @__PURE__ */ styled(A.Checkbox, "fux-checkbox");
export const Radio: typeof A.Radio = /* @__PURE__ */ styled(A.Radio, "fux-radio");
export const Switch: typeof A.Switch = /* @__PURE__ */ styled(A.Switch, "fux-switch");
export const Dialog: typeof A.Dialog = /* @__PURE__ */ styled(A.Dialog, "fux-dialog");
export const Disclosure: typeof A.Disclosure = /* @__PURE__ */ styled(
  A.Disclosure,
  "fux-disclosure",
);
export const DisclosureGroup: typeof A.DisclosureGroup = /* @__PURE__ */ styled(
  A.DisclosureGroup,
  "fux-disclosures",
);
export const DisclosurePanel: typeof A.DisclosurePanel = /* @__PURE__ */ styled(
  A.DisclosurePanel,
  "fux-disclosure__panel",
);
export const DropZone: typeof A.DropZone = /* @__PURE__ */ styled(A.DropZone, "fux-dropzone");
export const Form: typeof A.Form = /* @__PURE__ */ styled(A.Form, "fux-form");
export const Group: typeof A.Group = /* @__PURE__ */ styled(A.Group, "fux-group");
export const ListBox: typeof A.ListBox = /* @__PURE__ */ styled(A.ListBox, "fux-collection");
export const GridList: typeof A.GridList = /* @__PURE__ */ styled(A.GridList, "fux-collection");
export const Menu: typeof A.Menu = /* @__PURE__ */ styled(A.Menu, "fux-collection");
export const Tree: typeof A.Tree = /* @__PURE__ */ styled(A.Tree, "fux-collection");
export const NavigationTree: typeof A.NavigationTree = /* @__PURE__ */ styled(
  A.NavigationTree,
  "fux-collection",
);
export const ListBoxItem: typeof A.ListBoxItem = /* @__PURE__ */ styled(
  A.ListBoxItem,
  "fux-collection__item",
);
export const GridListItem: typeof A.GridListItem = /* @__PURE__ */ styled(
  A.GridListItem,
  "fux-collection__item",
);
export const MenuItem: typeof A.MenuItem = /* @__PURE__ */ styled(
  A.MenuItem,
  "fux-collection__item",
);
export const TreeItem: typeof A.TreeItem = /* @__PURE__ */ styled(
  A.TreeItem,
  "fux-collection__item",
);
export const NavigationTreeItem: typeof A.NavigationTreeItem = /* @__PURE__ */ styled(
  A.NavigationTreeItem,
  "fux-collection__item",
);
export const ListBoxSection: typeof A.ListBoxSection = /* @__PURE__ */ styled(
  A.ListBoxSection,
  "fux-collection__section",
);
export const GridListSection: typeof A.GridListSection = /* @__PURE__ */ styled(
  A.GridListSection,
  "fux-collection__section",
);
export const MenuSection: typeof A.MenuSection = /* @__PURE__ */ styled(
  A.MenuSection,
  "fux-collection__section",
);
export const TreeSection: typeof A.TreeSection = /* @__PURE__ */ styled(
  A.TreeSection,
  "fux-collection__section",
);
export const NavigationTreeSection: typeof A.NavigationTreeSection = /* @__PURE__ */ styled(
  A.NavigationTreeSection,
  "fux-collection__section",
);
export const Header: typeof A.Header = /* @__PURE__ */ styled(A.Header, "fux-collection__header");
export const GridListHeader: typeof A.GridListHeader = /* @__PURE__ */ styled(
  A.GridListHeader,
  "fux-collection__header",
);
export const TreeHeader: typeof A.TreeHeader = /* @__PURE__ */ styled(
  A.TreeHeader,
  "fux-collection__header",
);
export const NavigationTreeHeader: typeof A.NavigationTreeHeader = /* @__PURE__ */ styled(
  A.NavigationTreeHeader,
  "fux-collection__header",
);
export const ListBoxLoadMoreItem: typeof A.ListBoxLoadMoreItem = /* @__PURE__ */ styled(
  A.ListBoxLoadMoreItem,
  "fux-collection__load-more",
);
export const GridListLoadMoreItem: typeof A.GridListLoadMoreItem = /* @__PURE__ */ styled(
  A.GridListLoadMoreItem,
  "fux-collection__load-more",
);
export const MenuLoadMoreItem: typeof A.MenuLoadMoreItem = /* @__PURE__ */ styled(
  A.MenuLoadMoreItem,
  "fux-collection__load-more",
);
export const TreeLoadMoreItem: typeof A.TreeLoadMoreItem = /* @__PURE__ */ styled(
  A.TreeLoadMoreItem,
  "fux-collection__load-more",
);
export const TableLoadMoreItem: typeof A.TableLoadMoreItem = /* @__PURE__ */ styled(
  A.TableLoadMoreItem,
  "fux-collection__load-more",
);
export const Heading: typeof A.Heading = /* @__PURE__ */ styled(A.Heading, "fux-heading");
export const Keyboard: typeof A.Keyboard = /* @__PURE__ */ styled(A.Keyboard, "fux-keyboard");
export const Link: typeof A.Link = /* @__PURE__ */ styled(A.Link, "fux-link");
export const Meter: typeof A.Meter = /* @__PURE__ */ styled(A.Meter, "fux-meter");
export const ProgressBar: typeof A.ProgressBar = /* @__PURE__ */ styled(A.ProgressBar, "fux-meter");
export const Modal: typeof A.Modal = /* @__PURE__ */ styled(A.Modal, "fux-modal");
export const ModalOverlay: typeof A.ModalOverlay = /* @__PURE__ */ styled(
  A.ModalOverlay,
  "fux-overlay",
);
export const Popover: typeof A.Popover = /* @__PURE__ */ styled(A.Popover, "fux-popover");
export const OverlayArrow: typeof A.OverlayArrow = /* @__PURE__ */ styled(
  A.OverlayArrow,
  "fux-overlay-arrow",
);
export const Separator: typeof A.Separator = /* @__PURE__ */ styled(A.Separator, "fux-separator");
export const SelectionIndicator: typeof A.SelectionIndicator = /* @__PURE__ */ styled(
  A.SelectionIndicator,
  "fux-selection-indicator",
);
export const SheetOverlay: typeof A.SheetOverlay = /* @__PURE__ */ styled(
  A.SheetOverlay,
  "fux-sheet-overlay",
);
export const Sheet: typeof A.Sheet = /* @__PURE__ */ styled(A.Sheet, "fux-sheet");
export const SheetBackdrop: typeof A.SheetBackdrop = /* @__PURE__ */ styled(
  A.SheetBackdrop,
  "fux-sheet__backdrop",
);
export const SheetContent: typeof A.SheetContent = /* @__PURE__ */ styled(
  A.SheetContent,
  "fux-sheet__content",
);
export const Slider: typeof A.Slider = /* @__PURE__ */ styled(A.Slider, "fux-slider");
export const SliderOutput: typeof A.SliderOutput = /* @__PURE__ */ styled(
  A.SliderOutput,
  "fux-slider__output",
);
export const SliderTrack: typeof A.SliderTrack = /* @__PURE__ */ styled(
  A.SliderTrack,
  "fux-slider__track",
);
export const SliderFill: typeof A.SliderFill = /* @__PURE__ */ styled(
  A.SliderFill,
  "fux-slider__fill",
);
export const SliderThumb: typeof A.SliderThumb = /* @__PURE__ */ styled(
  A.SliderThumb,
  "fux-slider__thumb",
);
export const Table: typeof A.Table = /* @__PURE__ */ styled(A.Table, "fux-table");
export const Row: typeof A.Row = /* @__PURE__ */ styled(A.Row, "fux-table__row");
export const Cell: typeof A.Cell = /* @__PURE__ */ styled(A.Cell, "fux-table__cell");
export const Column: typeof A.Column = /* @__PURE__ */ styled(A.Column, "fux-table__column");
export const ColumnResizer: typeof A.ColumnResizer = /* @__PURE__ */ styled(
  A.ColumnResizer,
  "fux-table__resizer",
);
export const TableHeader: typeof A.TableHeader = /* @__PURE__ */ styled(
  A.TableHeader,
  "fux-table__header",
);
export const TableBody: typeof A.TableBody = /* @__PURE__ */ styled(A.TableBody, "fux-table__body");
export const TableFooter: typeof A.TableFooter = /* @__PURE__ */ styled(
  A.TableFooter,
  "fux-table__footer",
);
export const ResizableTableContainer: typeof A.ResizableTableContainer = /* @__PURE__ */ styled(
  A.ResizableTableContainer,
  "fux-table-container",
);
export const Tabs: typeof A.Tabs = /* @__PURE__ */ styled(A.Tabs, "fux-tabs");
export const TabList: typeof A.TabList = /* @__PURE__ */ styled(A.TabList, "fux-tabs__list");
export const TabPanels: typeof A.TabPanels = /* @__PURE__ */ styled(
  A.TabPanels,
  "fux-tabs__panels",
);
export const TabPanel: typeof A.TabPanel = /* @__PURE__ */ styled(A.TabPanel, "fux-tabs__panel");
export const Tab: typeof A.Tab = /* @__PURE__ */ styled(A.Tab, "fux-tabs__tab");
export const TagGroup: typeof A.TagGroup = /* @__PURE__ */ styled(A.TagGroup, "fux-tags");
export const TagList: typeof A.TagList = /* @__PURE__ */ styled(A.TagList, "fux-tags__list");
export const Tag: typeof A.Tag = /* @__PURE__ */ styled(A.Tag, "fux-tags__tag");
export const Token: typeof A.Token = /* @__PURE__ */ styled(A.Token, "fux-tags__tag");
export const ToggleButtonGroup: typeof A.ToggleButtonGroup = /* @__PURE__ */ styled(
  A.ToggleButtonGroup,
  "fux-toggle-group",
);
export const Toolbar: typeof A.Toolbar = /* @__PURE__ */ styled(A.Toolbar, "fux-toolbar");
export const Tooltip: typeof A.Tooltip = /* @__PURE__ */ styled(A.Tooltip, "fux-tooltip");
export const Breadcrumbs: typeof A.Breadcrumbs = /* @__PURE__ */ styled(
  A.Breadcrumbs,
  "fux-breadcrumbs",
);
export const Breadcrumb: typeof A.Breadcrumb = /* @__PURE__ */ styled(
  A.Breadcrumb,
  "fux-breadcrumbs__item",
);
export const DropIndicator: typeof A.DropIndicator = /* @__PURE__ */ styled(
  A.DropIndicator,
  "fux-drop-indicator",
);

// Non-visual context and collection helpers intentionally carry no styling.
export {
  Autocomplete,
  ColorPicker,
  DialogTrigger,
  MenuTrigger,
  SubmenuTrigger,
  TooltipTrigger,
  FileTrigger,
  PreviewTrigger,
  SheetTrigger,
  CalendarGridHeader,
  CalendarGridBody,
  TreeItemContent,
  NavigationTreeItemContent,
  Collection,
  Section,
  I18nProvider,
  RouterProvider,
  Virtualizer,
  Pressable,
  Focusable,
  VisuallyHidden,
  SharedElement,
  SharedElementTransition,
  parseColor,
} from "react-aria-components";
