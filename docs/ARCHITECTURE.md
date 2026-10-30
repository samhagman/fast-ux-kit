# Small boundaries, one behavior owner

| Surface                                                             | Owner                            | Contract                                                        |
| ------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------- |
| Outline document, validation, immutable commands                    | `core`                           | Portable; no React/DOM, persistence or authorization            |
| Reader disclosure and nested list                                   | `react` + default press owner    | Readable rich content with native tab order and 44px handles    |
| Default styled controls, color, date/time, collections and overlays | `components/aria`                | One owner for input, keyboard, selection, focus and portals     |
| Styled default-owner compound parts                                 | `components/aria` → `Primitives` | Exact typed owner props with shared anatomy classes             |
| Specialized controls and Pagination                                 | `components`                     | Optional owner used for distinct families; same semantic tokens |
| Complete unstyled APIs and infrastructure                           | `aria`, `ark`                    | Explicit escape hatches; not counted as completed styled UI     |
| Theme, product state, storage and transport                         | application                      | Never baked into the reusable kit                               |

The separate `MachineTreeView` uses portable `/machine` containment projection
and one React-owned tree keyboard/focus manager. Its disclosure/actions use the
default press owner; selection and folding are view state, never machine events.
This is distinct from both the nested-list outliner and the spatial Machine View.
See [Machine Tree View](MACHINE_TREE_VIEW.md) for the projection and input limits.

The default owner handles overlapping component families. The optional owner adds
specialized families rather than a second competing implementation of each input.
For example, Accordion maps to DisclosureGroup, Collapsible to Disclosure,
NumberInput to NumberField and TreeView to Tree. `ownerFamilyCoverage` records
all installed owner modules as canonical families, aliases, parts or infrastructure.
See [COMPONENT_API.md](COMPONENT_API.md) for the full catalog.

The package root and `/components/aria` do not import the optional owner.
The unified `/components` and raw `/ark` entries require that peer to be installed.
CSS has no JavaScript dependency and shares the same token contract across both.

Do not wrap optional-owner triggers in another owner's Button via `asChild`, add a
second focus trap, or mix independent overlay managers for one interaction.
Wrappers add presentation only, except narrowly scoped accessibility fixes that
call the same owner's public API (such as keyboard activation for password
visibility). Controlled values and callbacks are not silently translated into a
universal prop model. Context, collection builders and layout helpers remain
infrastructure rather than inflated component counts.

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
