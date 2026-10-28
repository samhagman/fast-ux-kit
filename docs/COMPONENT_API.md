# Component API and inventory

The source of truth is `src/components/manifest.ts`: **86 canonical styled families**, with leaf parts and non-visual infrastructure counted separately. Every family has a real documentation composition. This inventory does not assert browser or device acceptance.

## Entry points

| Import                                   | What it provides                                                   | Optional owner required? |
| ---------------------------------------- | ------------------------------------------------------------------ | ------------------------ |
| `@samhagman/fast-ux-kit/components/aria` | Default-owner recipes, native layout and typed styled `Primitives` | No                       |
| `@samhagman/fast-ux-kit/components`      | All styled families, Pagination and catalog metadata               | Yes                      |
| `@samhagman/fast-ux-kit/aria`            | Complete unstyled default-owner API, types and helpers             | No                       |
| `@samhagman/fast-ux-kit/ark`             | Complete unstyled optional-owner API, types and helpers            | Yes                      |
| `@samhagman/fast-ux-kit/components.css`  | Shared tokens and anatomy styles for both owners                   | CSS only                 |
| `@samhagman/fast-ux-kit/tokens.css`      | Semantic tokens without component anatomy                          | CSS only                 |

Install React, React DOM and `react-aria-components` peers. Add `@ark-ui/react` when using `/components` or `/ark`. The tested owner baselines are 1.22.1 and 5.39.3 respectively. Wider peer ranges are compatibility intent, not exhaustive verification.

## Recipe and compound contracts

Recipes supply a complete common composition: labels, input or selection surface, descriptive/error text and required subparts. `label` is a visible React node or string as specified by its exported type. Collection recipes use stable string IDs and typed option arrays. `Table<T>` accepts typed column renderers and rows; sorting remains host-owned.

`Primitives` keeps the default owner's generic props, refs, render props and context composition, adding shared classes. A recipe does not prevent using richer compound capabilities such as table resizing, load-more rows, collection sections or custom calendar controls. Specialized namespaces expose typed `Root`, `Context`, control and content parts; consult each live example for the required composition. Compound anatomy is styled, but a bare `Root` is not a finished UI.

Recipe refs target their owner root, not an inner input: for example `Field` uses a div, `Checkbox` a label, `Breadcrumbs` an ordered list, and `Table` the owner’s table/div root. Use `Primitives` when an inner-part ref is needed. `Calendar` and `RangeCalendar` render every resolved visible month for `visibleDuration`, with wrapped grids and hidden duplicate spillover dates.

Controlled values remain controlled: callbacks report proposed changes and the host supplies the next value. No wrapper introduces a competing focus, selection or overlay manager. The raw owner subpaths are explicitly **unstyled** and do not count toward the styled catalog.

## Canonical families

### Actions

| Family            | Export              | Owner | Purpose                                                                              |
| ----------------- | ------------------- | ----- | ------------------------------------------------------------------------------------ |
| Button            | `Button`            | aria  | Keyboard and pointer actions with primary, secondary, quiet and danger treatments.   |
| IconButton        | `IconButton`        | aria  | A compact visual action with a required accessible label and a full-size hit target. |
| ToggleButton      | `ToggleButton`      | aria  | An action that retains pressed state.                                                |
| ToggleButtonGroup | `ToggleButtonGroup` | aria  | Related single or multiple toggle choices.                                           |
| Toolbar           | `Toolbar`           | aria  | Arrow-key navigation across related controls.                                        |
| Clipboard         | `Clipboard`         | ark   | A labeled value with clipboard copy feedback.                                        |

### Navigation

| Family         | Export           | Owner | Purpose                                                           |
| -------------- | ---------------- | ----- | ----------------------------------------------------------------- |
| Link           | `Link`           | aria  | Native navigation with inline and block presentations.            |
| NavigationTree | `NavigationTree` | aria  | Hierarchical navigation with current-route state.                 |
| Menu           | `Menu`           | aria  | An action menu with shortcuts, disabled items and links.          |
| Tabs           | `Tabs`           | aria  | Labeled views with arrow-key navigation and panels.               |
| Breadcrumbs    | `Breadcrumbs`    | aria  | A navigation path with a current-page endpoint.                   |
| NavigationMenu | `NavigationMenu` | ark   | Site navigation with expandable link groups.                      |
| Steps          | `Steps`          | ark   | A sequenced workflow with progress and completion states.         |
| Toc            | `Toc`            | ark   | Heading navigation synchronized with visible article sections.    |
| Pagination     | `Pagination`     | ark   | Page navigation with bounds, previous/next controls and ellipses. |

### Inputs

| Family        | Export                  | Owner | Purpose                                                      |
| ------------- | ----------------------- | ----- | ------------------------------------------------------------ |
| Field         | `Field`                 | aria  | A labeled text input with validation and supporting text.    |
| TextArea      | `TextArea`              | aria  | A resizable multiline text field with accessible validation. |
| SearchField   | `SearchField`           | aria  | A search field with an owner-managed clear action.           |
| NumberField   | `NumberField`           | aria  | Locale-aware numeric entry with step controls and bounds.    |
| TokenField    | `Primitives.TokenField` | aria  | Editable text with structured inline tokens.                 |
| Form          | `Form`                  | aria  | Form submission and validation context.                      |
| Editable      | `Editable`              | ark   | Inline text editing with commit and cancel actions.          |
| Fieldset      | `Fieldset`              | ark   | A semantic group with a legend, helper text and errors.      |
| PasswordInput | `PasswordInput`         | ark   | A labeled password field with a visibility toggle.           |
| PinInput      | `PinInput`              | ark   | Segmented verification-code entry and paste handling.        |
| TagsInput     | `TagsInput`             | ark   | Editable string tags with entry, deletion and validation.    |

### Selection

| Family        | Export          | Owner | Purpose                                                                 |
| ------------- | --------------- | ----- | ----------------------------------------------------------------------- |
| Checkbox      | `Checkbox`      | aria  | A labeled binary or indeterminate choice.                               |
| CheckboxGroup | `CheckboxGroup` | aria  | Multiple named choices with shared validation.                          |
| RadioGroup    | `RadioGroup`    | aria  | One selection from a labeled set of choices.                            |
| Switch        | `Switch`        | aria  | An immediate on/off setting.                                            |
| Slider        | `Slider`        | aria  | Single or multiple numeric thumbs with keyboard and pointer adjustment. |
| AngleSlider   | `AngleSlider`   | ark   | Circular numeric adjustment with a keyboard-operable thumb.             |
| RatingGroup   | `RatingGroup`   | ark   | An accessible rating scale with pointer and keyboard selection.         |
| SegmentGroup  | `SegmentGroup`  | ark   | A compact single-choice segmented control.                              |

### Collections

| Family       | Export         | Owner | Purpose                                                           |
| ------------ | -------------- | ----- | ----------------------------------------------------------------- |
| Select       | `Select`       | aria  | A button-triggered selection list.                                |
| ComboBox     | `ComboBox`     | aria  | Searchable suggestions with typed collection options.             |
| ListBox      | `ListBox`      | aria  | Keyboard-selectable options with disabled and descriptive states. |
| GridList     | `GridList`     | aria  | Selectable rows supporting rich content and nested actions.       |
| Table        | `Table`        | aria  | An accessible data grid with typed columns and row rendering.     |
| Tree         | `Tree`         | aria  | Nested selectable content with owner-managed expansion.           |
| TagGroup     | `TagGroup`     | aria  | Focusable tags with optional removal and selection.               |
| JsonTreeView | `JsonTreeView` | ark   | Expandable structured data rendered as inert text.                |

### Disclosure

| Family          | Export            | Owner | Purpose                                             |
| --------------- | ----------------- | ----- | --------------------------------------------------- |
| Disclosure      | `Disclosure`      | aria  | An independently expandable section.                |
| DisclosureGroup | `DisclosureGroup` | aria  | Related sections with single or multiple expansion. |

### Overlays

| Family        | Export             | Owner | Purpose                                                             |
| ------------- | ------------------ | ----- | ------------------------------------------------------------------- |
| Dialog        | `Dialog`           | aria  | A labeled dialog content primitive for owner-managed overlays.      |
| ModalDialog   | `ModalDialog`      | aria  | A complete modal with focus containment, dismissal and restoration. |
| Popover       | `Popover`          | aria  | Anchored dialog content with a single focus and dismissal owner.    |
| Tooltip       | `Tooltip`          | aria  | Additional non-interactive information on hover or focus.           |
| Sheet         | `Primitives.Sheet` | aria  | An edge-attached swipeable modal with snap points.                  |
| Drawer        | `Drawer`           | ark   | An edge-attached panel with owner-managed dragging and dismissal.   |
| FloatingPanel | `FloatingPanel`    | ark   | A movable and resizable non-modal workspace window.                 |
| HoverCard     | `HoverCard`        | ark   | Supplementary contextual content on hover or focus.                 |
| Tour          | `Tour`             | ark   | An optional guided sequence with explicit start and dismissal.      |

### Date and time

| Family          | Export            | Owner | Purpose                                                         |
| --------------- | ----------------- | ----- | --------------------------------------------------------------- |
| Calendar        | `Calendar`        | aria  | A localized single-date calendar with full keyboard navigation. |
| RangeCalendar   | `RangeCalendar`   | aria  | An inline calendar for choosing a date interval.                |
| DateField       | `DateField`       | aria  | Locale-aware segmented date entry.                              |
| DatePicker      | `DatePicker`      | aria  | Date entry combined with a calendar popover.                    |
| DateRangePicker | `DateRangePicker` | aria  | Paired date entry with a range calendar.                        |
| TimeField       | `TimeField`       | aria  | Locale-aware segmented time entry.                              |

### Color

| Family            | Export              | Owner | Purpose                                                                     |
| ----------------- | ------------------- | ----- | --------------------------------------------------------------------------- |
| ColorArea         | `ColorArea`         | aria  | Two-axis color adjustment with keyboard-accessible channel values.          |
| ColorField        | `ColorField`        | aria  | Color text entry with parsing and validation.                               |
| ColorPicker       | `ColorPicker`       | aria  | A synchronized color area, channel sliders, value field and preset palette. |
| ColorSlider       | `ColorSlider`       | aria  | Adjustment of a single color channel or alpha.                              |
| ColorSwatch       | `ColorSwatch`       | aria  | An accessible color preview with a computed color description.              |
| ColorSwatchPicker | `ColorSwatchPicker` | aria  | Keyboard-selectable named color presets.                                    |
| ColorWheel        | `ColorWheel`        | aria  | Circular hue adjustment with keyboard and pointer support.                  |

### Feedback

| Family      | Export        | Owner | Purpose                                                                |
| ----------- | ------------- | ----- | ---------------------------------------------------------------------- |
| ProgressBar | `ProgressBar` | aria  | Determinate or indeterminate progress with an accessible label.        |
| Meter       | `Meter`       | aria  | A measured value within a known range.                                 |
| Timer       | `Timer`       | ark   | An explicitly controlled countdown or elapsed-time display.            |
| Toast       | `Toast`       | ark   | Transient notifications with a region, dismissal and optional actions. |

### Files

| Family          | Export            | Owner | Purpose                                                             |
| --------------- | ----------------- | ----- | ------------------------------------------------------------------- |
| DropZone        | `DropZone`        | aria  | A keyboard-accessible drop destination with a visible target state. |
| FileTrigger     | `FileTrigger`     | aria  | A native file chooser attached to a styled owner button.            |
| DownloadTrigger | `DownloadTrigger` | ark   | Download supplied local text or binary data.                        |
| FileUpload      | `FileUpload`      | ark   | Local file picking, dropping, validation and removal.               |

### Layout

| Family     | Export       | Owner  | Purpose                                                 |
| ---------- | ------------ | ------ | ------------------------------------------------------- |
| Separator  | `Separator`  | aria   | A semantic horizontal or vertical divider.              |
| Stack      | `Stack`      | native | Vertical layout using the shared spacing scale.         |
| Row        | `Row`        | native | Wrapping horizontal layout with logical alignment.      |
| Panel      | `Panel`      | native | A neutral surface with shared padding and tonal roles.  |
| ScrollArea | `ScrollArea` | ark    | A bounded scroll viewport with styled owner scrollbars. |
| Splitter   | `Splitter`   | ark    | Keyboard and pointer resizing between adjacent panels.  |

### Display

| Family   | Export     | Owner | Purpose                                                      |
| -------- | ---------- | ----- | ------------------------------------------------------------ |
| Avatar   | `Avatar`   | ark   | Image identity with a resilient fallback.                    |
| Carousel | `Carousel` | ark   | A scrollable sequence with previous, next and page controls. |
| Marquee  | `Marquee`  | ark   | A moving content strip with explicit pause control.          |

### Media

| Family       | Export         | Owner | Purpose                                                              |
| ------------ | -------------- | ----- | -------------------------------------------------------------------- |
| ImageCropper | `ImageCropper` | ark   | An image viewport with accessible crop selection and resize handles. |
| QrCode       | `QrCode`       | ark   | A generated QR image with local download support.                    |
| SignaturePad | `SignaturePad` | ark   | A local pointer drawing surface with a clear action.                 |

## Styled part inventory

Part names below are composition surfaces, not additional family counts. Default-owner parts live under `Primitives`; optional-owner parts are already namespace-qualified.

- **Button:** `Button`.
- **Link:** `Link`.
- **ToggleButton:** `ToggleButton`.
- **ToggleButtonGroup:** `ToggleButtonGroup`, `ToggleButton`.
- **Toolbar:** `Toolbar`, `Button`, `ToggleButton`, `Separator`.
- **Field:** `TextField`, `Label`, `Input`, `Text`, `FieldError`.
- **TextArea:** `TextField`, `Label`, `TextArea`, `Text`, `FieldError`.
- **SearchField:** `SearchField`, `Label`, `Group`, `Input`, `Button`.
- **NumberField:** `NumberField`, `Label`, `Group`, `Input`, `Button`, `FieldError`.
- **Checkbox:** `Checkbox`, `CheckboxField`, `CheckboxButton`.
- **CheckboxGroup:** `CheckboxGroup`, `Checkbox`, `Label`, `FieldError`.
- **RadioGroup:** `RadioGroup`, `Radio`, `RadioField`, `RadioButton`.
- **Switch:** `Switch`, `SwitchField`, `SwitchButton`.
- **Slider:** `Slider`, `SliderOutput`, `SliderTrack`, `SliderFill`, `SliderThumb`.
- **Select:** `Select`, `SelectValue`, `Button`, `Popover`, `ListBox`, `ListBoxItem`.
- **ComboBox:** `ComboBox`, `ComboBoxValue`, `Input`, `Button`, `Popover`, `ListBox`, `ListBoxItem`.
- **ListBox:** `ListBox`, `ListBoxItem`, `ListBoxSection`, `ListBoxLoadMoreItem`.
- **GridList:** `GridList`, `GridListItem`, `GridListSection`, `GridListHeader`, `GridListLoadMoreItem`.
- **Table:** `Table`, `TableHeader`, `Column`, `TableBody`, `Row`, `Cell`, `TableFooter`, `ColumnResizer`, `ResizableTableContainer`, `TableLoadMoreItem`.
- **Tree:** `Tree`, `TreeItem`, `TreeItemContent`, `TreeSection`, `TreeHeader`, `TreeLoadMoreItem`.
- **NavigationTree:** `NavigationTree`, `NavigationTreeItem`, `NavigationTreeItemContent`, `NavigationTreeSection`, `NavigationTreeHeader`.
- **TagGroup:** `TagGroup`, `TagList`, `Tag`.
- **TokenField:** `TokenField`, `TokenInput`, `Token`.
- **Menu:** `MenuTrigger`, `Menu`, `MenuItem`, `MenuSection`, `MenuLoadMoreItem`, `SubmenuTrigger`, `Keyboard`.
- **Tabs:** `Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel`.
- **Breadcrumbs:** `Breadcrumbs`, `Breadcrumb`, `Link`.
- **Disclosure:** `Disclosure`, `Heading`, `Button`, `DisclosurePanel`.
- **DisclosureGroup:** `DisclosureGroup`, `Disclosure`, `DisclosurePanel`.
- **Dialog:** `Dialog`, `DialogTrigger`, `Heading`, `Button`.
- **ModalDialog:** `ModalOverlay`, `Modal`, `Dialog`, `Heading`, `Button`.
- **Popover:** `DialogTrigger`, `Popover`, `Dialog`, `OverlayArrow`.
- **Tooltip:** `TooltipTrigger`, `Tooltip`, `OverlayArrow`.
- **Sheet:** `SheetTrigger`, `SheetOverlay`, `SheetBackdrop`, `Sheet`, `SheetContent`.
- **Calendar:** `Calendar`, `CalendarGrid`, `CalendarGridHeader`, `CalendarGridBody`, `CalendarHeaderCell`, `CalendarCell`, `CalendarHeading`, `CalendarMonthPicker`, `CalendarYearPicker`.
- **RangeCalendar:** `RangeCalendar`, `CalendarGrid`, `CalendarCell`.
- **DateField:** `DateField`, `DateInput`, `DateSegment`.
- **DatePicker:** `DatePicker`, `DateInput`, `DateSegment`, `Popover`, `Calendar`.
- **DateRangePicker:** `DateRangePicker`, `DateInput`, `DateSegment`, `Popover`, `RangeCalendar`.
- **TimeField:** `TimeField`, `DateInput`, `DateSegment`.
- **ColorArea:** `ColorArea`, `ColorThumb`.
- **ColorField:** `ColorField`, `Label`, `Input`, `FieldError`.
- **ColorPicker:** `ColorPicker`, `ColorArea`, `ColorSlider`, `ColorThumb`, `ColorField`, `ColorSwatch`, `ColorSwatchPicker`.
- **ColorSlider:** `ColorSlider`, `SliderOutput`, `SliderTrack`, `ColorThumb`.
- **ColorSwatch:** `ColorSwatch`.
- **ColorSwatchPicker:** `ColorSwatchPicker`, `ColorSwatchPickerItem`, `ColorSwatch`.
- **ColorWheel:** `ColorWheel`, `ColorWheelTrack`, `ColorThumb`.
- **ProgressBar:** `ProgressBar`, `Label`.
- **Meter:** `Meter`, `Label`.
- **DropZone:** `DropZone`.
- **FileTrigger:** `FileTrigger`, `Button`.
- **Form:** `Form`, `FieldError`.
- **Separator:** `Separator`.
- **AngleSlider:** `AngleSlider.Context`, `AngleSlider.Control`, `AngleSlider.HiddenInput`, `AngleSlider.Label`, `AngleSlider.Marker`, `AngleSlider.MarkerGroup`, `AngleSlider.Root`, `AngleSlider.RootProvider`, `AngleSlider.Thumb`, `AngleSlider.ValueText`.
- **Avatar:** `Avatar.Context`, `Avatar.Fallback`, `Avatar.Image`, `Avatar.Root`, `Avatar.RootProvider`.
- **Carousel:** `Carousel.AutoplayIndicator`, `Carousel.AutoplayTrigger`, `Carousel.Context`, `Carousel.Control`, `Carousel.Indicator`, `Carousel.IndicatorGroup`, `Carousel.Item`, `Carousel.ItemGroup`, `Carousel.NextTrigger`, `Carousel.PrevTrigger`, `Carousel.ProgressText`, `Carousel.Root`, `Carousel.RootProvider`.
- **Clipboard:** `Clipboard.Context`, `Clipboard.Control`, `Clipboard.Indicator`, `Clipboard.Input`, `Clipboard.Label`, `Clipboard.Root`, `Clipboard.RootProvider`, `Clipboard.Trigger`, `Clipboard.ValueText`.
- **DownloadTrigger:** `DownloadTrigger`.
- **Drawer:** `Drawer.Backdrop`, `Drawer.CloseTrigger`, `Drawer.Content`, `Drawer.Context`, `Drawer.Description`, `Drawer.Grabber`, `Drawer.GrabberIndicator`, `Drawer.Indent`, `Drawer.IndentBackground`, `Drawer.Positioner`, `Drawer.Root`, `Drawer.RootProvider`, `Drawer.Stack`, `Drawer.SwipeArea`, `Drawer.Title`, `Drawer.Trigger`.
- **Editable:** `Editable.Area`, `Editable.CancelTrigger`, `Editable.Context`, `Editable.Control`, `Editable.EditTrigger`, `Editable.Input`, `Editable.Label`, `Editable.Preview`, `Editable.Root`, `Editable.RootProvider`, `Editable.SubmitTrigger`.
- **Fieldset:** `Fieldset.Context`, `Fieldset.ErrorText`, `Fieldset.HelperText`, `Fieldset.Legend`, `Fieldset.Root`, `Fieldset.RootProvider`.
- **FileUpload:** `FileUpload.ClearTrigger`, `FileUpload.Context`, `FileUpload.Dropzone`, `FileUpload.HiddenInput`, `FileUpload.Item`, `FileUpload.ItemDeleteTrigger`, `FileUpload.ItemGroup`, `FileUpload.ItemName`, `FileUpload.ItemPreview`, `FileUpload.ItemPreviewImage`, `FileUpload.ItemSizeText`, `FileUpload.Label`, `FileUpload.Root`, `FileUpload.RootProvider`, `FileUpload.Trigger`.
- **FloatingPanel:** `FloatingPanel.Body`, `FloatingPanel.CloseTrigger`, `FloatingPanel.Content`, `FloatingPanel.Context`, `FloatingPanel.Control`, `FloatingPanel.DragTrigger`, `FloatingPanel.Header`, `FloatingPanel.Positioner`, `FloatingPanel.ResizeTrigger`, `FloatingPanel.Root`, `FloatingPanel.RootProvider`, `FloatingPanel.StageTrigger`, `FloatingPanel.Title`, `FloatingPanel.Trigger`.
- **HoverCard:** `HoverCard.Arrow`, `HoverCard.ArrowTip`, `HoverCard.Content`, `HoverCard.Context`, `HoverCard.Positioner`, `HoverCard.Root`, `HoverCard.RootProvider`, `HoverCard.Trigger`.
- **ImageCropper:** `ImageCropper.Context`, `ImageCropper.Grid`, `ImageCropper.Handle`, `ImageCropper.Image`, `ImageCropper.Root`, `ImageCropper.RootProvider`, `ImageCropper.Selection`, `ImageCropper.Viewport`.
- **JsonTreeView:** `JsonTreeView.Root`, `JsonTreeView.RootProvider`, `JsonTreeView.Tree`.
- **Marquee:** `Marquee.Content`, `Marquee.Context`, `Marquee.Edge`, `Marquee.Item`, `Marquee.Root`, `Marquee.RootProvider`, `Marquee.Viewport`.
- **NavigationMenu:** `NavigationMenu.Arrow`, `NavigationMenu.Content`, `NavigationMenu.Context`, `NavigationMenu.Indicator`, `NavigationMenu.Item`, `NavigationMenu.ItemIndicator`, `NavigationMenu.Link`, `NavigationMenu.List`, `NavigationMenu.Root`, `NavigationMenu.RootProvider`, `NavigationMenu.Trigger`, `NavigationMenu.Viewport`, `NavigationMenu.ViewportPositioner`.
- **PasswordInput:** `PasswordInput.Context`, `PasswordInput.Control`, `PasswordInput.Indicator`, `PasswordInput.Input`, `PasswordInput.Label`, `PasswordInput.Root`, `PasswordInput.RootProvider`, `PasswordInput.VisibilityTrigger`.
- **PinInput:** `PinInput.Context`, `PinInput.Control`, `PinInput.HiddenInput`, `PinInput.Input`, `PinInput.Label`, `PinInput.Root`, `PinInput.RootProvider`.
- **QrCode:** `QrCode.Context`, `QrCode.DownloadTrigger`, `QrCode.Frame`, `QrCode.Overlay`, `QrCode.Pattern`, `QrCode.Root`, `QrCode.RootProvider`.
- **RatingGroup:** `RatingGroup.Context`, `RatingGroup.Control`, `RatingGroup.HiddenInput`, `RatingGroup.Item`, `RatingGroup.ItemContext`, `RatingGroup.Label`, `RatingGroup.Root`, `RatingGroup.RootProvider`.
- **ScrollArea:** `ScrollArea.Content`, `ScrollArea.Context`, `ScrollArea.Corner`, `ScrollArea.Root`, `ScrollArea.RootProvider`, `ScrollArea.Scrollbar`, `ScrollArea.Thumb`, `ScrollArea.Viewport`.
- **SegmentGroup:** `SegmentGroup.Context`, `SegmentGroup.Indicator`, `SegmentGroup.Item`, `SegmentGroup.ItemContext`, `SegmentGroup.ItemControl`, `SegmentGroup.ItemHiddenInput`, `SegmentGroup.ItemText`, `SegmentGroup.Label`, `SegmentGroup.Root`, `SegmentGroup.RootProvider`.
- **SignaturePad:** `SignaturePad.ClearTrigger`, `SignaturePad.Context`, `SignaturePad.Control`, `SignaturePad.Guide`, `SignaturePad.HiddenInput`, `SignaturePad.Label`, `SignaturePad.Root`, `SignaturePad.RootProvider`, `SignaturePad.Segment`.
- **Splitter:** `Splitter.Context`, `Splitter.Panel`, `Splitter.ResizeTrigger`, `Splitter.ResizeTriggerIndicator`, `Splitter.Root`, `Splitter.RootProvider`.
- **Steps:** `Steps.CompletedContent`, `Steps.Content`, `Steps.Context`, `Steps.Indicator`, `Steps.Item`, `Steps.ItemContext`, `Steps.List`, `Steps.NextTrigger`, `Steps.PrevTrigger`, `Steps.Progress`, `Steps.Root`, `Steps.RootProvider`, `Steps.Separator`, `Steps.Trigger`.
- **TagsInput:** `TagsInput.ClearTrigger`, `TagsInput.Context`, `TagsInput.Control`, `TagsInput.HiddenInput`, `TagsInput.Input`, `TagsInput.Item`, `TagsInput.ItemContext`, `TagsInput.ItemDeleteTrigger`, `TagsInput.ItemInput`, `TagsInput.ItemPreview`, `TagsInput.ItemText`, `TagsInput.Label`, `TagsInput.Root`, `TagsInput.RootProvider`.
- **Timer:** `Timer.ActionTrigger`, `Timer.Area`, `Timer.Context`, `Timer.Control`, `Timer.Item`, `Timer.Root`, `Timer.RootProvider`, `Timer.Separator`.
- **Toast:** `Toast.ActionTrigger`, `Toast.CloseTrigger`, `Toast.Context`, `Toast.Description`, `Toast.Root`, `Toast.Title`.
- **Toc:** `Toc.Content`, `Toc.Context`, `Toc.Indicator`, `Toc.Item`, `Toc.Link`, `Toc.List`, `Toc.Nav`, `Toc.Root`, `Toc.RootProvider`, `Toc.Title`.
- **Tour:** `Tour.ActionTrigger`, `Tour.Actions`, `Tour.Arrow`, `Tour.ArrowTip`, `Tour.Backdrop`, `Tour.CloseTrigger`, `Tour.Content`, `Tour.Context`, `Tour.Control`, `Tour.Description`, `Tour.Positioner`, `Tour.ProgressText`, `Tour.Root`, `Tour.Spotlight`, `Tour.Title`.
- **Pagination:** `Root`, `PrevTrigger`, `Item`, `Ellipsis`, `NextTrigger`.

## Canonical overlap mapping

Use the canonical family for the shared visual system. The source owner exports remain available, unstyled, through their raw entrypoint.

| Source owner API   | Canonical styled family         |
| ------------------ | ------------------------------- |
| ark: `Accordion`   | `DisclosureGroup`               |
| ark: `Checkbox`    | `Checkbox`, `CheckboxGroup`     |
| ark: `Collapsible` | `Disclosure`                    |
| ark: `ColorPicker` | `ColorPicker`                   |
| ark: `Combobox`    | `ComboBox`                      |
| ark: `DateInput`   | `DateField`                     |
| ark: `DatePicker`  | `DatePicker`, `DateRangePicker` |
| ark: `Dialog`      | `ModalDialog`                   |
| ark: `Field`       | `Field`                         |
| ark: `Listbox`     | `ListBox`                       |
| ark: `Menu`        | `Menu`                          |
| ark: `NumberInput` | `NumberField`                   |
| ark: `Popover`     | `Popover`                       |
| ark: `Progress`    | `ProgressBar`                   |
| ark: `RadioGroup`  | `RadioGroup`                    |
| ark: `Select`      | `Select`                        |
| ark: `Slider`      | `Slider`                        |
| ark: `Switch`      | `Switch`                        |
| ark: `Tabs`        | `Tabs`                          |
| ark: `Toggle`      | `ToggleButton`                  |
| ark: `ToggleGroup` | `ToggleButtonGroup`             |
| ark: `Tooltip`     | `Tooltip`                       |
| ark: `TreeView`    | `Tree`                          |
| aria: `Toast`      | `Toast`                         |

## Infrastructure, not extra component families

### Autocomplete

Connect an input and a collection for filtering, suggestions and keyboard navigation without adding a second visible control.

Exports: `Autocomplete`, `useFilter`.

### Virtualizer

Render a window of a large collection using owner layouts; retain the same styled collection items.

Exports: `Virtualizer`, `ListLayout`, `GridLayout`, `TableLayout`, `WaterfallLayout`, `Layout`, `LayoutInfo`, `Size`, `Rect`, `Point`.

### Collections and data

Build dynamic collections and manage immutable, async or tree-shaped collection data.

Exports: `Collection`, `Section`, `useListData`, `useTreeData`, `useAsyncList`.

### Drag and drop

Opt into drag and drop using one owner and styled DropIndicator targets; application code validates and persists changes.

Exports: `useDrag`, `useDrop`, `useDragAndDrop`, `DropIndicator`, `isDirectoryDropItem`, `isFileDropItem`, `isTextDropItem`, `DIRECTORY_DRAG_TYPE`.

### PreviewTrigger

Coordinate owner-managed preview interactions with styled popover content.

Exports: `PreviewTrigger`.

### Shared elements

Coordinate layout transitions without adding a second interaction owner. Consumer motion must respect reduced-motion preferences.

Exports: `SharedElementTransition`, `SharedElement`.

### Locale and routing

Set locale, direction and client-side navigation once around the component system.

Exports: `I18nProvider`, `useLocale`, `isRTL`, `RouterProvider`, `SSRProvider`.

### Composition helpers

Low-level context, render-prop, press, focus and visibility helpers for advanced composition.

Exports: `Provider`, `composeRenderProps`, `useContextProps`, `useRenderProps`, `useSlottedContext`, `Pressable`, `Focusable`, `VisuallyHidden`, `DEFAULT_SLOT`.

### Color values

Parse color strings and inspect channels without rendering a control.

Exports: `parseColor`, `getColorChannels`.

### Optional owner environment

Bind specialized controls to a document, locale, interaction environment or iframe without adding another visual family.

Exports: `EnvironmentProvider`, `LocaleProvider`, `Frame`.

### Optional collections

Construct list and tree collections for specialized owner APIs. Canonical visual collections remain in the styled family catalog.

Exports: `createListCollection`, `createTreeCollection`.

### Mounting and presence

Client-only rendering, portals, mount lifecycles and presence transitions. Do not nest FocusTrap inside an already managed dialog.

Exports: `ClientOnly`, `Portal`, `Presence`, `FocusTrap`, `Swap`.

### Formatting and text

Locale-aware number, byte and time formatting, plus text highlighting. These are presentation utilities rather than interactive component families.

Exports: `FormatByte`, `FormatNumber`, `FormatTime`, `FormatRelativeTime`, `Highlight`.

### Optional hotkeys

Register application shortcuts without intercepting the keyboard handling owned by a focused control.

Exports: `useHotkey`, `useHotkeys`, `useHotkeyStore`, `useHotkeyRecorder`, `createHotkeyStore`.

## Themes, portals and interaction boundaries

- Import `components.css` once. Set semantic `--fux-*` roles at the app/theme root and any separate portal container.
- `data-theme="light"` and `data-theme="dark"` support scoped themes; nested scopes redeclare derived roles rather than inheriting stale resolved colors.
- Shared rules target 44px controls, logical spacing, high-contrast focus, forced colors and reduced motion. CSS intent is not measured browser geometry.
- Color controls keep their actual color gradients in forced-colors mode; labels and values remain available.
- Localized date values come from `@internationalized/date`; add that package directly when your application imports its constructors. Providers set locale and direction.
- Supply translated labels where the recipe exposes labels, or use typed primitives for fully localized composition.
- Do not add a second focus trap to a managed overlay, nest two interaction owners on one element or treat client-side state as authorization.
- File acceptance and local drawing do not upload or sign anything. Validation, persistence, legal consent and transport remain application responsibilities.

## Verification

See [COMPONENT_COVERAGE.md](COMPONENT_COVERAGE.md) for executable coverage and remaining browser/device gates. The inventory parity test checks all 144 public owner module entries against the installed packages, including aliases, leaf parts and infrastructure. Counts do not imply each raw export has its own styled recipe.
