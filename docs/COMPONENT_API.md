# Component API

Import components from `@samhagman/fast-ux-kit/components` and load
`@samhagman/fast-ux-kit/styles.css` once. The catalog contains 98 canonical
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

`Steps` takes `label`, `items` and a step index `value`. By default (`variant="progress"`)
it is a navigation landmark: items before `value` are complete, the item at `value` is
current with `aria-current="step"`, and the rest are upcoming. `onValueChange` makes each
step a button, and `orientation="horizontal"` lays them in a row. Each item has an `id`,
a `title` (any React content) and an optional `description`, plus these optional fields:

- `status`: `"complete"`, `"current"`, `"upcoming"`, `"error"` or `"waiting"`. It
  overrides the state from `value`; `aria-current` and the filled connector follow it.
  `"waiting"` is a pending state, signal-coloured with a dashed marker. `error: true`
  still means `"error"`, and an explicit `status` wins over it.
- `icon`: replaces the marker's number, check or alert. The marker is decorative.
- `statusLabel`: replaces the screen-reader state read after the title ("completed",
  "current", "upcoming", "error" or "waiting").
- `meta`: a muted line under the description, such as who acted and when.
- `aside`: trailing content at the inline end of the row, such as a sequence number,
  in tabular numerals.

`variant="log"` draws a read-only history of entries. It renders a `role="log"` region
named by `label` around the ordered list (ARIA doesn't allow `role="log"` on `<ol>`
itself), with no navigation landmark, buttons or `aria-current`. It ignores `value`,
`onValueChange` and `orientation`, and always lays out vertically. Each entry's state is
its `status`, defaulting to `"complete"`, and the line below an entry follows that
entry's state. A log is a polite live region, so screen readers announce entries
appended later; append new entries rather than re-creating the list.

```tsx
<Steps
  label="Document history"
  variant="log"
  items={[
    { id: "1", title: "Created in draft", meta: "ada · 14:01:48", aside: "#1" },
    { id: "2", title: "Asked the owner: Approve?", status: "waiting", aside: "#2" },
  ]}
/>
```

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

## Alerts

`Alert` is a message that stays in the page until the reader deals with it,
unlike a toast, which times out. It says what happened and offers the next step.

```tsx
import {
  Alert,
  AlertTitle,
  AlertDescription,
  AlertActions,
  Button,
  Link,
} from "@samhagman/fast-ux-kit/components";
import { CircleAlertIcon } from "lucide-react";

<Alert variant="error" icon={<CircleAlertIcon />}>
  <AlertTitle>Sync stopped</AlertTitle>
  <AlertDescription>3 notes on this device have not reached the server.</AlertDescription>
  <AlertActions>
    <Button size="sm" variant="outline" onClick={retry}>
      Try again
    </Button>
    <Link href="/sync">See what is waiting</Link>
  </AlertActions>
</Alert>;
```

- `variant` is `info` (the default), `success`, `warning` or `error`. shadcn's
  `default` and `destructive` are aliases for `info` and `error`, and
  `data-variant` reports the resolved tone.
- `error` renders `role="alert"`, which interrupts; the others render
  `role="status"`, which waits its turn. Pass `role` to choose another. Mount
  the alert when the event happens, so assistive technology announces it.
- `icon` is an optional leading icon, hidden from assistive technology because
  the title carries the meaning. A bare `svg` as the first child also works.
- `size="page"` makes the alert a full-page refusal, such as "This link
  expired" or "This task is already closed". It keeps the same tones and roles.
  The title takes the theme's heading font at display size (`text-2xl`), the
  description takes body size (`text-base`), the padding is roomier, and no
  icon is shown, even when one is passed. `size` defaults to `"default"`.
- `AlertTitle` renders a `div`. Pass `asChild` to render a real heading
  instead, at the level the page needs:

  ```tsx
  <Alert size="page" variant="error">
    <AlertTitle asChild>
      <h1>This link expired</h1>
    </AlertTitle>
    <AlertDescription>Invitation links last 7 days. This one was sent on 3 March.</AlertDescription>
    <AlertActions>
      <Link href="/invitations/new">Ask for a new link</Link>
    </AlertActions>
  </Alert>
  ```

- `AlertActions` holds the next step: links, buttons or both, in reading order.
- Every color mixes theme tokens: the tone reads `--signal`, `--success`,
  `--warning` or `--destructive` through `--fux-alert-tone`, over `--card`,
  `--border`, `--card-foreground` and `--muted-foreground`. Restyle all alerts
  through those tokens, or one alert through `className`, for example
  `[--fux-alert-tone:var(--chart-3)]`. Sides are logical, so alerts mirror in
  right-to-left text.

## Text styles

`Heading`, `Text`, `Eyebrow` and `DescriptionList` style text from theme tokens,
so a page needs no hand-written type classes.

```tsx
import { DescriptionList, Eyebrow, Heading, Text } from "@samhagman/fast-ux-kit/components";

<header>
  <Eyebrow>Workspace settings</Eyebrow>
  <Heading level={1}>Members</Heading>
  <Text tone="muted" size="sm">
    People who can open and edit this workspace.
  </Text>
  <DescriptionList
    layout="inline"
    items={[
      { term: "Owner", detail: "Rania Haddad" },
      { term: "Members", detail: "12" },
    ]}
  />
</header>;
```

- `Heading` takes a required `level` (1 to 6), which is the element, `h1` to
  `h6`. `size` is how large it looks, independent of the level: `display`,
  `title`, `section` or `subsection`, so an `h3` can look like a page title.
  Without `size`, `h1` is a title, `h2` a section and `h3` to `h6` a subsection.
  `data-size` reports the size. `display` scales with the width of its
  container (the viewport when no ancestor is a size container), from the title
  size at its narrowest to the display size.
- `Text` is body text. `as` is `p` (the default) or `span`. `size` is `sm`, `md`
  or `lg`. A paragraph defaults to `md`; a span keeps the size of the line it
  sits in unless it is given one. `tone` is `default` (the surrounding colour), `muted`,
  or a status tone: `info`, `success`, `warning` or `error`.
- `Eyebrow` is a small uppercase kicker or label line above a heading, in the
  theme's mono font. It takes the same `as` and `tone` props, with `muted` as the
  default tone. The capitals are a style, so the text is read as written, and in
  Arabic, Persian and Urdu the letter spacing is dropped so letters stay joined.
- `DescriptionList` renders a real `dl`. Each item is a `div` holding one `dt`
  (the `term`) and one `dd` (the `detail`); both take any React node, and `id`
  gives an item a stable key. `layout="stacked"` (the default) puts each detail
  under its term. `layout="inline"` puts it beside its term while the list has
  room, and under it when the list is narrow. Every term takes the same width,
  `--fux-dl-term` (8rem), so the details line up. The detail moves under its
  term when it would be narrower than `--fux-dl-detail` (10rem).
- Margins are the application's: the families set none, so apply the global
  reset (see above) and space them with `Stack` or your own layout.
- Restyle them through tokens. Sizes and weights are `--fux-heading-display`,
  `--fux-heading-title`, `--fux-heading-section`, `--fux-heading-subsection`,
  `--fux-heading-weight`, `--fux-heading-leading`, `--fux-heading-tracking`,
  `--fux-body-sm`, `--fux-body-md`, `--fux-body-lg`, `--fux-eyebrow-size` and
  `--fux-eyebrow-tracking`, with `--fux-line-height`, `--fux-label-size` and
  `--fux-label-weight`. Headings use `--font-heading` when the theme defines it,
  and `--font-sans` otherwise; eyebrows use `--font-mono`. Colours are
  `--muted-foreground`, and for the status tones `--signal`, `--success`,
  `--warning` and `--destructive`, each mixed toward `--foreground` (as Alert's
  accent is) so it stays readable. Sides are logical, so the families mirror in
  right-to-left text.

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

## Code

`CommandLine` shows one shell command in a monospace box with a Copy button at
its inline end. `label` names the box. `prompt` draws a decorative prompt (`true`
for `$`, or your own text) that is left out of the copy, out of a selection made
by hand, and out of what assistive technology reads. A long command scrolls sideways inside the box under a thin
scrollbar, and the button stays in view. The command always reads left to right;
the box itself follows the page direction. After a copy the button shows
`copiedLabel` for `resetDelay` milliseconds and a status region announces it. If
the browser refuses, `failedLabel` is announced and the command is selected for a
manual copy.

```tsx
import { CodeBlock, CommandLine } from "@samhagman/fast-ux-kit/components";

<CommandLine label="Install command" command="npm install @example/notes" prompt />;
<CodeBlock code={source} language="ts" filename="src/count.ts" copyable />;
```

`CodeBlock` takes `copyable` to add a Copy action to its header bar. It copies the
listing as written, without line numbers, and announces the result the same way.
`copyLabel`, `copiedLabel` and `failedLabel` name it in both components. The
action renders disabled in server markup and becomes active after hydration.

## Terminal transcripts

`Terminal` takes a transcript as text. A line that starts with the prompt and a
space (`$ ` by default, or `prompt`) is something the reader types; every other
line is output. That string form renders exactly as it always has.

To style text inside a line, pass one entry per line instead. A line is a string
or a list of segments, `{ text, tone, decorative }`:

```tsx
import { Terminal, type TerminalLine } from "@samhagman/fast-ux-kit/components";

const lines: TerminalLine[] = [
  [{ text: "▍", tone: "accent", decorative: true }, { text: "$ fieldbook sync" }],
  [{ text: "✓ ", tone: "success" }, { text: "42 notes", tone: "bold" }, { text: " synced" }],
  [
    { text: "view: ", tone: "dim" },
    { text: "https://notes.test/sync", tone: "link" },
  ],
];

<Terminal title="zsh">{lines}</Terminal>;
```

`tone` is one of a fixed set, or a weight with a colour (`["bold", "success"]`):
`dim`, `bold`, `accent`, `success`, `warning`, `danger`, `info` and `link`. Tones
name a role, never a colour, and unknown tones are ignored. Colour is never the
only signal, so keep the words or a mark that says what a line means (`✓`,
`error:`). Segments are text, never markup.

A `decorative` segment, such as a marker or a bar, is drawn but is not part of the
text. Screen readers skip it, as they skip the prompt, and a copy leaves both out.
Decorative segments at the start of a line come before the prompt, so a marked
line can still be a typed one.

`ansi` reads ANSI SGR codes in plain-text lines onto the same tones: bold (1), dim
(2), normal (22), reset (0), the 16 foreground colours and the first 16 of the 256
colours. Black and grey read as `dim`, red as `danger`, green as `success`, yellow
as `warning`, blue as `info`, magenta as `accent`, cyan as `link`, and white as
the plain ink. Backgrounds, other styles, other escape sequences (cursor moves,
titles, links) and control characters are dropped, and a malformed sequence is
dropped up to the character that broke it. Without `ansi`, escape codes stay
literal text, as before.

```tsx
<Terminal ansi>{"$ fieldbook check\n\u001b[32m✓\u001b[0m 42 notes are valid"}</Terminal>
```

The same model is available without React from `@samhagman/fast-ux-kit/core`:
`parseAnsi`, `terminalRows` and `terminalCopyText`, which returns what a reader
copies, with no codes, prompts or decorative segments.

A terminal follows the page's ground. `ground="dark"` or `ground="light"` paints
its own. Each tone reads a token from the set for its ground, defined on `:root`
in the editorial stylesheet, and each default keeps at least 4.5:1 contrast on
its ground. Override them on `:root` or any ancestor to retheme:

| Tone      | Light ground token             | Dark ground token             |
| --------- | ------------------------------ | ----------------------------- |
| `dim`     | `--fux-terminal-light-dim`     | `--fux-terminal-dark-dim`     |
| `success` | `--fux-terminal-light-success` | `--fux-terminal-dark-success` |
| `warning` | `--fux-terminal-light-warning` | `--fux-terminal-dark-warning` |
| `danger`  | `--fux-terminal-light-danger`  | `--fux-terminal-dark-danger`  |
| `info`    | `--fux-terminal-light-info`    | `--fux-terminal-dark-info`    |
| `link`    | `--fux-terminal-light-link`    | `--fux-terminal-dark-link`    |
| `accent`  | `--fux-terminal-light-accent`  | `--fux-terminal-dark-accent`  |

`accent` is the prompt's colour and `bold` uses the ink, so on the page's ground
they follow `--fux-ed-accent` and `--fux-ed-ink`. An own ground also sets
`--fux-terminal-{light,dark}-ground`, `-ink`, `-output` (the output text) and
`-rule`. The dark set applies inside the app theme's `.dark` and on
`ground="dark"`.

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
| Feedback      | `ProgressBar`, `Meter`, `Timer`, `Toast`, `Alert`                                                                                         |
| Files         | `DropZone`, `FileTrigger`, `DownloadTrigger`, `FileUpload`                                                                                |
| Layout        | `Separator`, `Stack`, `Row`, `Panel`, `ScrollArea`, `Splitter`                                                                            |
| Display       | `Avatar`, `Carousel`, `Marquee`, `KeyChord`                                                                                               |
| Media         | `ImageCropper`, `QrCode`, `SignaturePad`                                                                                                  |
| Code          | `CodeBlock`, `Terminal`, `CommandLine`, `FileTree`                                                                                        |
| Data display  | `Sparkline`, `BarList`, `DescriptionList`                                                                                                 |
| Typography    | `Heading`, `Text`, `Eyebrow`                                                                                                              |

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
`alert` (`Alert`), `breadcrumb` (`Breadcrumbs`), `button` (`Button`), `calendar` (`Calendar`),
`checkbox` (`Checkbox`), `dialog` (`Dialog`), `drawer` (`Drawer`), `field` and
`input` (`Field`, `Fieldset`), `hover-card` (`HoverCard`), `popover` (`Popover`),
`progress` (`ProgressBar`), `resizable` (`Splitter`), `scroll-area`
(`ScrollArea`), `select` (`Select`), `separator` (`Separator`), `sheet`
(`Sheet`), `sonner` (`Toast`), `switch` (`Switch`), `tabs` (`Tabs`), `textarea`
(`TextArea`), `toggle` (`ToggleButton`), `toggle-group` (`ToggleButtonGroup`)
and `tooltip` (`Tooltip`). `compat` holds the layer's internal helpers.
