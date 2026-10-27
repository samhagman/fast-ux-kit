# Small boundaries, one behavior owner

| Surface                                          | Owner                             | Why                                                                   |
| ------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------- |
| Outline document, validation, immutable commands | `core`                            | Portable; no React/DOM, persistence or auth                           |
| Reader disclosure and nested list                | `react` + React Aria Button       | Readable rich content with native tab order and 44px handles          |
| Shared Button, Field, Checkbox, IconButton       | `components`, React Aria behavior | Same token-driven styling and explicit typed variants                 |
| Shared Pagination                                | `components`, Ark behavior        | Same controls/tokens, upstream pagination state                       |
| Advanced selections, menus, tabs, overlays       | `aria`                            | One keyboard/focus/portal system                                      |
| Pagination                                       | optional `ark`                    | Named gap in React Aria Components; Ark owns every pagination element |
| Theme, product state, storage, transport         | application                       | Never baked into the reusable kit                                     |

React Aria + Ark UI is the intended toolkit pair. Inspection of the current
consumer baseline found React Aria Components 1.22.1 and a product-owned typed UI
facade; Ark was not installed. The kit does not pretend otherwise or replace a
working behavior implementation merely to use two dependencies. Ark is opt-in
and isolated from the default/root graph; pagination is its first concrete gap.
Do not wrap Ark pagination triggers in React Aria Button, add a second focus trap,
or mix independent overlay managers for one interaction. Test any future cross-
library portal composition before adding it to the supported API.

## Independent React implementation

The direct React implementation separates document content from reader-local
expansion and keeps richer nested content in normal document flow. The direct editor adds explicit authoring, keyboard transitions, history, structured
clipboard and extension hooks without turning rich bodies into textareas. See
`OUTLINER_API.md` and `PARITY.md` for exact semantics and evidence. Device IME,
layout and browser geometry remain separate acceptance gates; virtualization and
full rich-text authoring are not implied by the generic extension APIs.

## Data and interaction

IDs are globally unique within one outline and stable across renders. Expansion
state is not stored on nodes. Renderers receive typed node data, not arbitrary
HTML. Nested links remain links; disclosure buttons do not wrap rich content.
Lists intentionally use list semantics, not tree semantics with incomplete arrow-
key or active-descendant behavior. Native Tab reaches every visible interactive
control; hidden descendants must leave the accessibility tree and tab sequence.

## Compatibility

The test baseline is React/DOM 19.2.6, RAC 1.22.1 and Ark 5.39.3, strict TypeScript
5.9.3 and Node 22.13+. Wider peer ranges are compatibility intent, not proof of
all versions. React 18 is not advertised. React is external/peer-owned: package
builds do not bundle a duplicate renderer. ESM declarations and `use client`
directives are preserved. `core` is server-safe; interactive entries are client
boundaries. Optional CSS is standalone and side-effect-marked for bundlers.
