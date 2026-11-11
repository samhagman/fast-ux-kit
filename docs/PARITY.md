# Behavior coverage and validation

Fast UX Kit includes the portable document and machine models, the React reader
and editor APIs, and the shared component layer used by the Outliner, Machine
View and Machine Tree tools. This document maps those surfaces to the current
executable checks.

The component catalog and tool APIs are described in
[COMPONENT_API.md](COMPONENT_API.md), [OUTLINER_API.md](OUTLINER_API.md) and
[MACHINE_GRAPH.md](MACHINE_GRAPH.md). The source and exported TypeScript declarations
provide the complete contracts.

## Executable coverage

| Surface                      | Contracts exercised                                                                                          | Test files                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portable outline core        | Stable IDs, validation, immutable commands, edit policies, selection, history and canonical interchange      | `tests/core.test.ts`, `tests/editor-core.test.ts`, `tests/editor-invariants.test.ts`                                                                                                    |
| Reader and editor            | Expansion, focus recovery, keyboard editing, controlled updates, placeholders and text selection             | `tests/react.test.tsx`, `tests/editor-react.test.tsx`, `tests/reader-focus-recovery.test.tsx`, `tests/editor-placeholder-integration.test.tsx`, `tests/editor-selection-target.test.ts` |
| Rich documents               | Markdown and extension data, safe rendering, registered renderers and canonical codecs                       | `tests/rich.test.tsx`                                                                                                                                                                   |
| Text intelligence            | Ranges, search ranking, completions, hover and highlights                                                    | `tests/text-intelligence.test.ts`, `tests/hover.test.tsx`, `tests/highlight.test.tsx`                                                                                                   |
| Search and productivity      | Bounded queries, filtering, date metadata, sorting, note edits and read-only behavior                        | `tests/outline-search.test.ts`, `tests/outline-search-react.test.tsx`, `tests/outline-productivity.test.ts`, `tests/outline-reorder.test.ts`, `tests/outline-notes-react.test.tsx`      |
| Shared component catalog     | An executable fixture for each of the 92 canonical families, with interaction assertions where applicable    | `tests/components-catalog.test.tsx`, `tests/components-foundation.test.tsx`                                                                                                             |
| Date and color controls      | Date value preservation, bounds, range cancellation, color conversion, controlled edits and keyboard changes | `tests/color-date-components.test.tsx`                                                                                                                                                  |
| Files and media              | File validation, crop state, QR output, signature state and export behavior                                  | `tests/components-media.test.tsx`                                                                                                                                                       |
| Machine models               | Graph validation, immutable changes, hierarchy, analysis and simulation                                      | `tests/machine-core.test.ts`, `tests/machine-tree-core.test.ts`, `tests/machine-analysis.test.ts`                                                                                       |
| React machine surfaces       | Canvas and hierarchy rendering, controlled changes and analysis UI                                           | `tests/machine-view.test.tsx`, `tests/machine-tree-view.test.tsx`, `tests/machine-view-analysis.test.tsx`                                                                               |
| Outliner tool                | Keyboard navigation, controlled and local state, interchange, views, search, library and workspace seams     | `studio/tests/outliner-*.test.mjs`                                                                                                                                                      |
| Inline rich field            | Grammar, interchange, notes, caller integration and editor transitions                                       | `studio/tests/live-field-*.test.mjs`                                                                                                                                                    |
| Machine tools                | Canvas operations, hierarchy operations and shared simulation behavior                                       | `studio/tests/machine-graph.test.mjs`, `studio/tests/machine-tree.test.mjs`, `studio/tests/machine-shared.test.mjs`                                                                     |
| Shared primitive integration | Overlay composition, direction and Base UI behavior                                                          | `studio/tests/base-ui-primitives.test.mjs`, `studio/tests/direction.test.mjs`                                                                                                           |
| Distribution                 | Tree-shaking boundaries, CSS, package entry resolution, declarations and consumer rendering                  | `tests/bundle.test.ts`, `tests/styles.test.ts`, `scripts/test-consumer.mjs`                                                                                                             |

## Local release checks

Run the full checks against the exact candidate snapshot.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
npm --prefix studio test
npm run docs:build
```

Record each command's outcome and the source revision in the release review.
Focused test results establish their exercised contracts. The aggregate commands
also check the interactions between source, styles, declarations and package
output. Current test counts are available in each run's output.

## Browser acceptance

The Studio provides the browser fixtures through `npm run dev`. The component
page shares its 92-family fixture map with the catalog tests. Verify the
candidate build with keyboard and pointer input, light and dark themes, RTL,
reduced motion, narrow viewports and browser zoom.

Exercise overlay focus restoration, nested modal Escape handling, menu and
combobox selection, date and color input, file selection, drawing and image
export. For the tools, cover outline editing and navigation, canvas operations,
hierarchy changes, undo/redo and the host callbacks exposed by each API.

Browser layout, clipboard permissions, canvas output and native focus need
browser verification. Physical touch, IME behavior and assistive-technology
announcements need checks in their respective environments. Keep those results
separate from DOM-emulation assertions.

## Host integration

Applications supply authentication, persistence, remote history and
synchronization. Their tests should exercise authorization, rejected writes,
concurrent changes, offline recovery and the trusted renderers they register.
Those checks depend on the consuming application's implementation.

See [RELEASE.md](RELEASE.md) for the packaging and publication gates and
[COMPONENT_COVERAGE.md](COMPONENT_COVERAGE.md) for the catalog fixture contract.
