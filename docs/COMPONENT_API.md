# Component API

Import components from `@samhagman/fast-ux-kit/components` and load
`@samhagman/fast-ux-kit/styles.css` once. The catalog contains 92 canonical
families. `componentManifest` provides each family's name, category, description,
interaction owner and exported parts.

The catalog also lists 11 [primitives](#primitives) from the shared shadcn layer.
Each manifest entry gives its `layer` and the `importPath` to import it from.

Apply the application's global reset before the kit stylesheet. A Tailwind v4
application can import `tailwindcss/preflight.css` in its `base` layer. The
application also owns its page layout and font choices.

## Conventions

- Use `onClick` for button actions. `className` and ordinary React DOM props are
  available on the components that expose them.
- Input recipes accept `label`, optional `hint` and `error`, and explicit
  controlled or default values. `Field` and `TextArea` use `onValueChange`.
- `value` makes a component controlled. Echo accepted proposals back through that
  prop. `defaultValue` seeds local state.
- Base UI manages supported focus, overlay, selection and input primitives.
  Native controls own their browser interactions. Each element has one owner.
- Compound overlays require a named title and appropriate trigger. Use the
  exported trigger/content parts from the same family.

## Actions and fields

```tsx
import { Button, Field, Checkbox, Slider } from "@samhagman/fast-ux-kit/components";

<Button onClick={save}>Save</Button>;
<Field label="Name" value={name} onValueChange={setName} />;
<Checkbox label="Notify me" checked={notify} onCheckedChange={setNotify} />;
<Slider label="Volume" value={volume} onValueChange={setVolume} min={0} max={100} />;
```

`NumberField` uses numeric values and `min`, `max` and `step`. `RadioGroup` uses a
single option ID. `CheckboxGroup` uses an array of option IDs. Options expose
`id`, `label` and optional `disabled`.

## Collections and navigation

`Select` and `ComboBox` accept labeled options and report selected IDs through
`onValueChange`. `ListBox`, `GridList` and `Tree` use arrays of selected IDs.
`Tree` also accepts controlled expansion through `expandedIds` and
`onExpandedChange`.

`Table` takes `rows`, typed `columns` and an optional sort descriptor. A sortable
column supplies `allowsSorting` and a comparator. Selection uses stable row IDs.

`Tabs` accepts items containing an ID, label and content. `Menu` accepts action
items and calls `onAction` with their IDs. `NavigationTree`, `NavigationMenu`,
`Breadcrumbs` and `Toc` provide their respective navigation structures.

`TagsInput` stores strings. `TokenField` stores typed token objects with stable
IDs and labels, supports supplied suggestions and can use `createToken` for
application-approved new entries.

## Overlays

```tsx
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  Button,
} from "@samhagman/fast-ux-kit/components";

<Dialog>
  <DialogTrigger render={<Button />}>Open details</DialogTrigger>
  <DialogContent>
    <DialogTitle>Document details</DialogTitle>
    <DialogDescription>Review the document's metadata.</DialogDescription>
  </DialogContent>
</Dialog>;
```

`Sheet`, `Drawer`, `Popover`, `HoverCard` and `Tooltip` expose their own matching
parts. `TooltipProvider` supplies tooltip timing. `ModalDialog` is a controlled
recipe with `title`, `open`, `onOpenChange`, children and an optional footer.

`FloatingPanel` provides movable and resizable content. `Tour` accepts named
steps with descriptions and optional target getters. `Toast` or `Toaster` mounts
the notification surface, while `toast` creates a notification.

## Dates and colors

Date and time components retain `@internationalized/date` values. Use
`CalendarDate`, `CalendarDateTime`, `ZonedDateTime` or `Time` as appropriate.
`Calendar` and `RangeCalendar` support date bounds, unavailable dates, controlled
focus and visible duration. The range value contains `start` and `end`.

`DateField` and `TimeField` provide labeled numeric segments. Date pickers combine
those segments with a calendar popover. A range commits after both endpoints are
chosen. Closing a picker abandons an unfinished calendar selection.

```tsx
import { CalendarDate } from "@internationalized/date";
import { DatePicker, ColorPicker } from "@samhagman/fast-ux-kit/components";

<DatePicker label="Due date" defaultValue={new CalendarDate(2028, 2, 12)} />;
<ColorPicker label="Accent" defaultValue="#336699" />;
```

The seven color families share the portable `ColorValue` API. `parseColor`
accepts CSS color text. Values expose `getChannelValue`, `withChannelValue`,
`toFormat` and `toString`. Channel edits are immutable. `ColorPicker` coordinates
the area, sliders, field, swatch and optional named presets.

## Media, files and utility controls

File inputs and drop zones validate accepted types, counts and sizes and return
browser `File` objects through `onFilesChange`. The application owns upload and
storage. `FileUpload` adds a local selected-file list.

`ImageCropper` controls crop, zoom and rotation and can export a selected image.
`SignaturePad` supports pointer drawing and typed entry, with controlled value,
clear, undo and export. Browser canvas operations remain client-side.

`Pagination` uses `count`, `pageSize`, `page` and `onPageChange`. With many pages,
each "…" gap is a button that opens a field for typing the exact page; in `compact`
mode the "Page 2 of 12" readout does the same. `jumpLabel` and `goLabel` name that
field and its button. `Timer` supports
start, pause and reset. `Clipboard` handles explicit copying. `DownloadTrigger`
provides a validated download link. `QrCode` renders an encoded SVG.

## Complete catalog

| Category      | Families                                                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Actions       | `Button`, `IconButton`, `ToggleButton`, `ToggleButtonGroup`, `Toolbar`, `Clipboard`                                                       |
| Navigation    | `Link`, `NavigationTree`, `Menu`, `Tabs`, `Breadcrumbs`, `NavigationMenu`, `Steps`, `Toc`, `Pagination`                                   |
| Inputs        | `Field`, `TextArea`, `SearchField`, `NumberField`, `TokenField`, `Form`, `Editable`, `Fieldset`, `PasswordInput`, `PinInput`, `TagsInput` |
| Selection     | `Checkbox`, `CheckboxGroup`, `RadioGroup`, `Switch`, `Slider`, `AngleSlider`, `RatingGroup`, `SegmentGroup`                               |
| Collections   | `Select`, `ComboBox`, `ListBox`, `GridList`, `Table`, `Tree`, `TagGroup`, `JsonTreeView`                                                  |
| Disclosure    | `Disclosure`, `DisclosureGroup`                                                                                                           |
| Overlays      | `Dialog`, `ModalDialog`, `Popover`, `Tooltip`, `Sheet`, `Drawer`, `FloatingPanel`, `HoverCard`, `Tour`                                    |
| Date and time | `Calendar`, `RangeCalendar`, `DateField`, `DatePicker`, `DateRangePicker`, `TimeField`                                                    |
| Color         | `ColorArea`, `ColorField`, `ColorPicker`, `ColorSlider`, `ColorSwatch`, `ColorSwatchPicker`, `ColorWheel`                                 |
| Feedback      | `ProgressBar`, `Meter`, `Timer`, `Toast`                                                                                                  |
| Files         | `DropZone`, `FileTrigger`, `DownloadTrigger`, `FileUpload`                                                                                |
| Layout        | `Separator`, `Stack`, `Row`, `Panel`, `ScrollArea`, `Splitter`                                                                            |
| Display       | `Avatar`, `Carousel`, `Marquee`                                                                                                           |
| Media         | `ImageCropper`, `QrCode`, `SignaturePad`                                                                                                  |

The Studio's `#/components` page contains an executable example for every
family. The exported TypeScript declarations define the complete prop and event
contracts. [Coverage and verification](COMPONENT_COVERAGE.md).

## Primitives

The families are built on a shared shadcn layer. Each file in that layer is its
own entry, `@samhagman/fast-ux-kit/components/ui/<file>`, and the stylesheet that
styles the families styles it too. The catalog lists the primitives no family
covers, so a gallery or a tool can find them without reading the source.

```tsx
import { Badge } from "@samhagman/fast-ux-kit/components/ui/badge";
import { Kbd, KbdGroup } from "@samhagman/fast-ux-kit/components/ui/kbd";

<Badge variant="secondary">Draft</Badge>;
<KbdGroup>
  <Kbd>⌘</Kbd>
  <Kbd>K</Kbd>
</KbdGroup>;
```

Primitives sit in the same categories as the families. In `componentManifest`
they have `layer: "primitive"` and an `importPath` naming their module. Families
have `layer: "family"` and the `importPath` `@samhagman/fast-ux-kit/components`.
In `catalog.json` itself, only primitives carry the two fields. An entry without
them is a family.

```tsx
import { componentManifest } from "@samhagman/fast-ux-kit/components";

for (const entry of componentManifest) {
  const module = await import(entry.importPath);
  const Component = module[entry.exportName];
}
```

| Primitive      | Category   | Import path                                          |
| -------------- | ---------- | ---------------------------------------------------- |
| `Badge`        | Display    | `@samhagman/fast-ux-kit/components/ui/badge`         |
| `Kbd`          | Display    | `@samhagman/fast-ux-kit/components/ui/kbd`           |
| `Item`         | Display    | `@samhagman/fast-ux-kit/components/ui/item`          |
| `Skeleton`     | Feedback   | `@samhagman/fast-ux-kit/components/ui/skeleton`      |
| `Empty`        | Feedback   | `@samhagman/fast-ux-kit/components/ui/empty`         |
| `ButtonGroup`  | Actions    | `@samhagman/fast-ux-kit/components/ui/button-group`  |
| `Label`        | Inputs     | `@samhagman/fast-ux-kit/components/ui/label`         |
| `InputGroup`   | Inputs     | `@samhagman/fast-ux-kit/components/ui/input-group`   |
| `DropdownMenu` | Navigation | `@samhagman/fast-ux-kit/components/ui/dropdown-menu` |
| `ContextMenu`  | Navigation | `@samhagman/fast-ux-kit/components/ui/context-menu`  |
| `Command`      | Navigation | `@samhagman/fast-ux-kit/components/ui/command`       |

`Menu` covers a plain list of actions; `DropdownMenu` adds checkbox and radio
items, submenus and your own trigger. For a labeled input with an icon or a unit,
`Field`'s `startAddon` and `endAddon` are enough; `InputGroup` is for addons on a
text area, above or below the control, or around a control you label yourself.
`ItemGroup` has the list role, so give each `Item` in it `role="listitem"`.

The other files in the layer back a family, and the family is the one to use:
`breadcrumb` (`Breadcrumbs`), `button` (`Button`), `calendar` (`Calendar`),
`checkbox` (`Checkbox`), `dialog` (`Dialog`), `drawer` (`Drawer`), `field` and
`input` (`Field`, `Fieldset`), `hover-card` (`HoverCard`), `popover` (`Popover`),
`progress` (`ProgressBar`), `resizable` (`Splitter`), `scroll-area`
(`ScrollArea`), `select` (`Select`), `separator` (`Separator`), `sheet`
(`Sheet`), `sonner` (`Toast`), `switch` (`Switch`), `tabs` (`Tabs`), `textarea`
(`TextArea`), `toggle` (`ToggleButton`), `toggle-group` (`ToggleButtonGroup`)
and `tooltip` (`Tooltip`). `compat` holds the layer's internal helpers.
