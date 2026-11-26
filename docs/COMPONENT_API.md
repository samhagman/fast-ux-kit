# Component API

Import components from `@samhagman/fast-ux-kit/components` and load
`@samhagman/fast-ux-kit/styles.css` once. The catalog contains 92 canonical
families. `componentManifest` provides each family's name, category, description,
interaction owner and exported parts.

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

`ToggleButtonGroup` takes an array of pressed item values, like Base UI's toggle
group. Items share borders by default (`variant="outline"`, `spacing={0}`). A
hovered item takes the muted tint; a selected item keeps its selected look under
the pointer. With single selection, one highlight slides from the old item to the
new one, with the duration and easing of the `Tabs` indicator. With `multiple`
there is no sliding highlight: each selected item fades its own fill and colour in
and out over `--fux-motion-duration`. Under `prefers-reduced-motion: reduce` the
highlight moves and the fills change at once.

The sliding highlight is the group's `::before`. A single-selection group carries
`fux-sliding-group`, and `data-indicator` once the highlight is placed. Before
that, including in server-rendered HTML, the selected item shows its own fill. The
measured box is exposed as `--fux-indicator-x`, `--fux-indicator-y`,
`--fux-indicator-width`, `--fux-indicator-height` and `--fux-indicator-radius`.
`SegmentGroup` moves its highlight the same way, lined up exactly with the chosen
segment inside the group's padding, in both writing directions.

`NumberField` uses numeric values and `min`, `max` and `step`. `RadioGroup` uses a
single option ID. `CheckboxGroup` uses an array of option IDs. Options expose
`id`, `label` and optional `disabled`.

## Collections and navigation

`Select` and `ComboBox` accept labeled options and report selected IDs through
`onValueChange`. `ListBox`, `GridList` and `Tree` use arrays of selected IDs.
`Tree` also accepts controlled expansion through `expandedIds` and
`onExpandedChange`.

A `Tree` or `NavigationTree` node can carry a `badge`, such as a count, drawn
like a tab badge. `badgePlacement` on the tree sets where badges sit: `"end"`
(the default) pins them to the row's inline-end edge, so a long label truncates
before it, and `"start"` puts them just before the label, after the disclosure,
guides and icon. A node's own `badgePlacement` overrides the tree's. The badge
text joins the row's accessible name, and a navigation link's, so a reader hears
"Inbox, 3". Give `badgeLabel` for a badge that is not plain text, such as a dot.

```tsx
<NavigationTree
  label="Mail"
  items={[
    { id: "inbox", label: "Inbox", href: "/inbox", badge: 3 },
    { id: "drafts", label: "Drafts", href: "/drafts", badge: <Dot />, badgeLabel: "unsaved" },
  ]}
/>
```

`JsonTreeView` draws any `value` as a read-only `Tree`, with the same selection
and expansion props. Each object or array row shows its size, such as "3 keys";
`showCounts={false}` renders no count at all, and the disclosure button names
the row by its key alone. `inlineSmallValues` (default `false`) draws a small
object or array on its parent's row as one leaf, such as
`on: { SUBMIT: "review" }`. A value is small when it has exactly one entry and
that entry is a primitive or is itself small, so `draft: { on: { SUBMIT:
"review" } }`, `tags: ["a"]` and `rows: [{ id: 1 }]` each take one row. Values
nested more than 3 levels deep (`JSON_INLINE_MAX_DEPTH`) or longer than 40
characters (`JSON_INLINE_MAX_LENGTH`) stay expandable, as does the root row.
An inline row is one treeitem named by its key and its text, and its parts keep
the `data-json-part` (`key`, `colon`, `bracket`) and `data-json-kind` hooks
inside a `data-json-part="inline"` wrapper. The rule itself is `inlineJson` in
the portable core.

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
parts. `Sheet` and `Drawer` slide in from their side and back out, and their
backdrop fades. That motion ships in `styles.css`, so it needs no animation
plugin, and it is switched off under reduced motion. `TooltipProvider` supplies
tooltip timing. `ModalDialog` is a controlled recipe with `title`, `open`,
`onOpenChange`, children and an optional footer.

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

`Carousel` takes a `label` and its slides as children. The arrows, the dots and
the arrow, Home and End keys on the focused viewport move between slides. The dots
stay still while one pill glides over them with the scroll and lands on the
current dot when the scroll settles; with reduced motion it moves straight to
the dot once the slide settles. The current slide, its dot's `aria-current` and
the count change when the scroll comes to rest, not on the way past a slide.
`showCount={false}` hides the "2 / 3" count, and a visually hidden live region
still announces "Slide 2 of 3".

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
