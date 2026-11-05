# Component coverage

The canonical inventory contains 86 families. Its source is
`src/components/catalog.json`, exposed as `componentManifest`. Leaf parts and
utility functions are listed separately from canonical families.

## Executable coverage

| Suite                                  | Coverage                                                                                                                                                     |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `tests/components-catalog.test.tsx`    | A real gallery fixture for every family, rendered semantics and applicable action flows                                                                      |
| `tests/color-date-components.test.tsx` | Color immutability and alpha, controlled edits, invalid input, keyboard channels, date bounds, leap days, time zones, read-only values and unfinished ranges |
| `studio/tests/`                        | Outliner commands, editing, focus, clipboard, date handling, search, workspace behavior and machine tools                                                    |
| `npm run test:consumer`                | Packed ESM entries, declarations, independent installation, rendering, hydration, styles and dependency boundaries                                           |

The same per-family fixtures power the Studio gallery and the catalog tests.
Interactive examples exercise changes such as menu selection, file choice,
opening overlays, entering tokens, changing dates and adjusting controls.
Display families verify their rendered structure and accessible identity.

## Browser acceptance

The final release snapshot also needs a browser review of the gallery and the
three tools. Check these behaviors at desktop and narrow mobile widths.

- Keyboard entry, roving focus, visible focus and return from dismissed overlays.
- Pointer and touch interaction, 44px targets and responsive overflow.
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
