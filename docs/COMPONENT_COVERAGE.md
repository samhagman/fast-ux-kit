# Component coverage

The canonical inventory contains 100 families. Its source is
`src/components/catalog.json`, exposed as `componentManifest`. Leaf parts and
utility functions are listed separately from canonical families.

The catalog also lists 11 primitives from the shared shadcn layer, each with
`layer: "primitive"` and its own `components/ui/<file>` import path. They have
gallery fixtures like the families. `tests/component-manifest.test.ts` resolves
every entry's parts from its import path and checks that each `components/ui`
file is either listed or backed by a named family. `npm run test:consumer`
imports every entry from its import path in the packed package.
`tests/command-scroll.test.tsx` checks that typing in an inline `Command` leaves
the page's scroll position alone.

## Executable coverage

| Suite                                    | Coverage                                                                                                                                                                                                                          |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/components-catalog.test.tsx`      | A real gallery fixture for every family, rendered semantics and applicable action flows                                                                                                                                           |
| `tests/components-*-polish.test.tsx`     | Per-family states and styling hooks, including where the `ToggleButtonGroup` and `SegmentGroup` highlights land, multiple-selection fades, hover and reduced motion                                                               |
| `tests/components-alert.test.tsx`        | Alert roles per tone and the role override, its slots and reachable action, the page size and heading title, stable server rendering and hydration, logical sides and token-only colors                                           |
| `tests/components-text.test.tsx`         | `Heading` levels and sizes, `Text` and `Eyebrow` elements, sizes and tones, `DescriptionList` markup and layouts, stable server rendering and hydration, logical sides, token-only styles and the responsive rules                |
| `tests/components-layout.test.tsx`       | The shared gap scale across Stack, Row, Grid and Split, the `as` element and list role, Grid and Split markup and rules, Panel padding, edge and tone, stable server rendering and hydration, logical sides and token-only colors |
| `npm run test:layout:browser`            | In Chrome: each gap step in px in all four layouts, Grid columns and Split stacking by their own width, Split in right-to-left text and with the side last, a flush Panel around a Table                                          |
| `tests/components-command-line.test.tsx` | `CommandLine` and the copyable `CodeBlock`: what is copied (no prompt, no line numbers), the announcement, accessible names, the overflow track and server markup                                                                 |
| `tests/color-date-components.test.tsx`   | Color immutability and alpha, controlled edits, invalid input, keyboard channels, date bounds, leap days, time zones, read-only values and unfinished ranges                                                                      |
| `studio/tests/`                          | Outliner commands, editing, focus, clipboard, date handling, search, workspace behavior and machine tools                                                                                                                         |
| `npm run test:consumer`                  | Packed ESM entries, declarations, independent installation, rendering, hydration, styles and dependency boundaries                                                                                                                |

The same per-family fixtures power the Studio gallery and the catalog tests.
Interactive examples exercise changes such as menu selection, file choice,
opening overlays, entering tokens, changing dates and adjusting controls.
Display families verify their rendered structure and accessible identity.

## Browser acceptance

The final release snapshot also needs a browser review of the gallery and the
three tools. Check these behaviors at desktop and narrow mobile widths.

- Keyboard entry, roving focus, visible focus and return from dismissed overlays.
- Pointer and touch interaction, distinct size variants (`xs` to `xl`) and responsive overflow.
- Light and dark themes, RTL layout, reduced motion and forced colors.
- Canvas drawing, cropping, downloads and native clipboard behavior.
- Long content, empty state, disabled controls, errors and controlled updates.
- Stable hydration and readable content before client interactions begin.

DOM tests use browser API fixtures where needed. They cover event and state
contracts. Browser layout, mobile input methods and assistive-technology behavior
require their own observations.

## Release evidence

Run the full local checks against one final source snapshot. Record command
results and browser observations in the release PR. Partial or earlier test runs
remain development evidence until that aggregate pass completes.
