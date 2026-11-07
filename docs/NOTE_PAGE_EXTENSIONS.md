# Extensible note pages

A notebook can use the outliner and other trusted editors without hard-coding page types into its storage or shell. `NotePageView` is an additive host seam; existing `Outliner` and `OutlinerWorkspace` behavior is unchanged. Titles, folders, authentication, network persistence and conflicts belong to the application.

## Portable envelope and registry

```ts
import { createNotePageRegistry, type NotePageType } from "@samhagman/fast-ux-kit/core";

const textPage: NotePageType<{ text: string }> = {
  type: "example.text",
  label: "Text",
  version: 1,
  create: () => ({ text: "" }),
  validate: (value): value is { text: string } =>
    !!value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string",
};
const pages = createNotePageRegistry([textPage]);
const page = pages.create("example.text", "stable-page-id");
// { id, type, version, data }; title/folder/revision can live beside this envelope.
```

The core exports `NotePage`, `NotePageType`, `NotePageRegistry`, `NotePageResolution`, `createNotePageRegistry`, `isNotePageData`, `isNotePage`, `serializeNotePage` and `parseNotePage`. These are also re-exported from `/outliner`. Duplicate type IDs are errors. Definitions must have positive integer versions and trusted `create` and `validate` hooks. Define hooks as pure functions, not methods depending on mutable `this`.

`list()` supports a host's “New page” picker. `get(type)` returns a descriptor. `resolve(page)` returns `ready`, `unknown-type`, `future-version`, `migration-required` or `invalid`, always preserving `original`. It does not run migrations. `migrate(page)` explicitly invokes an optional `migrate(data, fromVersion)` hook on a detached copy and validates its result at the current version. The host decides when to save that returned page. Unsupported versions, unknown types and failed migrations never become empty documents.

Data must be JSON-compatible: no functions, undefined, nonfinite numbers, symbols, accessors, class instances, sparse arrays or cycles. The validator bounds traversal to 100,000 values and 128 levels. Shared acyclic references are permitted and serialize as copies. These structural limits are not a server-side size, authorization or content policy. Preserve unknown envelopes with the JSON codec so they can be opened after their editor becomes available.

## Trusted React editors

```tsx
import { defineNotePageExtension, NotePageView } from "@samhagman/fast-ux-kit/outliner";

// Create once, outside rendering. The generic editor props infer { text: string }.
const textExtension = defineNotePageExtension(textPage, ({ data, onChange, readOnly }) => (
  <textarea
    aria-label="Page text"
    value={data.text}
    readOnly={readOnly}
    onChange={(event) => onChange({ text: event.target.value })}
  />
));
const extensions = [textExtension];

<NotePageView
  page={page}
  extensions={extensions}
  readOnly={false}
  onChange={(nextPage) => proposeSave(nextPage)}
/>;
```

`NotePageEditorProps<T>` contains `pageId`, `data`, `readOnly`, and `onChange(data): boolean`. False means the change was blocked (read-only, inactive/unmounted editor, no host callback or invalid data). True means it was delivered to the host, **not** saved to a server. `onError` reports invalid proposals and editor render errors. By default pages are read-only; the callback boundary enforces this even if a buggy editor calls `onChange`. The host must also authorize every server write.

The editor stays mounted as same-page data changes. Changing page ID, type or schema version remounts it and disables stale callbacks from the old editor. The host should route changes by the returned page ID, not whichever page happens to be selected. A render failure shows a Retry control without changing stored data. Non-ready pages display a non-destructive message, or the host's `fallback(resolution)`.

## Outlines and drawings

Register an outline type whose data is `{ nodes }`, validate with the existing outline validation helpers, and render `Outliner` with `value={data.nodes}`, `readOnly`, and `onValueChange={(nodes) => onChange({ nodes })}`. The host's page list chooses a `NotePage` and passes it to the same view.

A drawing type can wrap Excalidraw or any other editor with the same contract. Its application-owned schema can contain serializable elements, selected persistent scene settings and embedded-file records. Keep viewport, selection, collaborators and other ephemeral state out of persisted changes. Validate and bound file types and size at the application's server boundary. Pin and bundle editor code; never evaluate a script, import a module URL or inject HTML specified by page data. This API does not add an Excalidraw dependency or permit remote plugins. Editors execute with the application's privileges, so only register code you trust.

For schema upgrades, keep migration functions deterministic, support each prior version explicitly, retain an export/backup of the original, and save using the host's normal concurrency checks. Unknown types should remain exportable rather than being replaced with the current default type.

## Interactive verification

Run the Studio and open `?pages=1#/outliner` for an in-memory demo with the real outliner, an independently authored SVG sketch editor, and an unavailable extension. This sketch is a small extension example, not an Excalidraw replacement. No sample content is persisted or sent anywhere.

`npm run test:note-pages:browser` builds Studio, serves the output on an ephemeral loopback port, and runs headless Playwright using `CHROMIUM_PATH` (default `/usr/bin/chromium`). It exercises page switching, custom editing, read-only behavior, preserved missing-editor data, theme and narrow layout, and writes screenshots to `BROWSER_ARTIFACTS` (default `.safe-tmp/note-page-browser`). Browser binaries are not automatically downloaded.
