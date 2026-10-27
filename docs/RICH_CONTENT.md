# Rich content and Markdown

```tsx
import { RichContent, importMarkdownDocument } from "@samhagman/fast-ux-kit";
import "@samhagman/fast-ux-kit/styles.css";

const document = importMarkdownDocument("# Hello\n\n- [x] Read this\n");
<RichContent document={document} />;
```

`Outliner` accepts `getRichContent(node)` to render documents in the same nested
flow. `renderContent` takes precedence when the application needs complete control.
Whole Markdown documents are not parsed by the outline title-text codec.

## Preservation contract

- `importMarkdownDocument(source)` keeps the original JavaScript string unchanged.
  `exportMarkdownDocument(document)` returns it exactly for a single Markdown block.
  Line endings, unsupported syntax and whitespace are retained.
- Mixed media/unknown blocks cannot be losslessly represented as Markdown. Export
  them with `serializeRichDocument` and restore with `parseRichDocument`.
- The versioned JSON codec sorts object keys, not source strings. Unknown fields
  and block kinds survive JSON roundtrip. Non-JSON values, cycles, sparse/decorated
  arrays, accessors, symbol/hidden properties and nonfinite numbers are rejected.
- A source edit replaces the source deliberately; there is no promise that an
  edited/normalized document equals its original byte representation.

## Rendering

CommonMark plus GFM covers prose/headings/emphasis, lists/quotes, code, tables,
strikethrough, links, footnotes and read-only task indicators. Raw HTML is omitted;
MDX/JavaScript is not compiled. Separate block types cover image, drawing snapshot,
diagram, video/audio with captions/transcripts, link, callout and trusted React.
No raw-source pane is shown by default.

All media loading is denied by default. Supply `allowMedia(url, block)` only for
sources appropriate to the consuming app. Protocol checks run first: only safe
relative or HTTP(S) media URLs pass; no data/blob/javascript or protocol-relative
URLs. Blocked/error/offline media has a readable fallback and remains serialized.
Link protocols additionally allow mailto/tel. External HTTP(S) links announce a
new tab and use `noopener noreferrer`.

Diagram and React renderers are application-registered components, selected by a
known ID in a registry. Imported data cannot select module paths or register code.
Unknown renderer IDs show safe fallbacks. Registered components receive
`reducedMotion` so an animation can pause or render a static state. The example
consumer includes a synthetic diagram and user-initiated animation.

A trusted registry is **not a sandbox**. A buggy/malicious application component
has the same authority as the application. Client renderer errors are caught by
an error boundary; server-rendered component exceptions remain the host's SSR
responsibility. Truly untrusted interactive code needs a separately reviewed
isolation contract; this kit does not silently execute it.

## Bounded inputs, explicit fallback

| Limit                               | Value / behavior                                     |
| ----------------------------------- | ---------------------------------------------------- |
| Rich JSON source                    | 8,000,000 JavaScript string code units               |
| JSON nesting / values               | 64 levels / 100,000 values                           |
| Rich blocks                         | 10,000 globally unique IDs                           |
| Preserved Markdown source per block | 2,000,000 code units                                 |
| Inline Markdown rendering           | 200,000 code units, 128 AST levels, 20,000 AST nodes |
| Inline outline rendering            | 128 nested levels, 5,000 rows                        |

Oversized Markdown within storage limits remains exportable and shows an explicit
rendering-budget fallback. Deep/open outline omissions are explicitly labeled;
collapsed descendants are lazy rather than recursively mounted. These are safety
bounds, not a claim to render unlimited documents. For larger datasets, hosts must
page/hoist or add a separately validated virtualized reader.

## Evidence and remaining gates

Synthetic tests cover untouched source/JSON roundtrip, mixed/unknown blocks, GFM,
unsafe HTML/protocols, opt-in/blocked/error media, registry behavior, scoped
footnotes, focus/hoist/folding and deep collapsed SSR. See `docs/RELEASE.md` for
browser, Android/TalkBack and production-migration gates; unit tests alone do not
certify device accessibility, media playback or visual contrast.
