# 0.1.0 verification

The release uses Base UI through one shared component layer. The package
contains the 86-family catalog, portable core, outliner, machine canvas and
machine tree. Studio consumes the built package.

## Local checks

The release workflow runs a clean workspace install, the root typecheck,
formatting check, unit tests, library build, independent tarball installation,
Studio typecheck, Studio tests and production build. The consumer check imports
every public entry and verifies declarations, compiled styles, server rendering
and hydration of the component, reader, rich-content, outliner and machine
surfaces.

Focused regressions cover current-subtree cross-document undo and redo,
atomic workspace callbacks, controlled values, keyboard focus, rejected
operations, date bounds, RTL color controls and exported compound parts.

## Browser coverage

Chromium desktop and 390px mobile checks exercise all 86 component families.
Additional checks cover keyboard navigation, overlay focus return, touch
activation, RTL behavior, reduced motion and all tool routes. Measured visible
controls retain 44px targets and editable mobile fields retain 16px text.

Browser emulation is recorded separately from physical-device and assistive
technology testing. Physical iOS/Android devices, native IMEs, VoiceOver and
TalkBack were not exercised in this release verification.

## Dependency and bundle measurements

The combined library and Studio runtime/peer dependency closure decreased from
546 to 172 package-version entries. Removed interaction-owner packages account
for 145 entries in the original closure and zero in the release closure.
Required notices additionally cover the compiled Tailwind styles.

Comparable production ESM measurements include React and use minification.

| Entry            | Original bytes | Release bytes |
| ---------------- | -------------: | ------------: |
| Button           |         50,904 |        48,239 |
| Tour             |         39,075 |       163,885 |
| Catalog metadata |         16,288 |        15,601 |
| Portable core    |         81,230 |       134,419 |

Tour includes the shared Base UI overlay foundation. The core increase includes
workspace models, parsing, import/export and transfer logic moved out of the UI
layer. Heavy editors and graph layout remain behind separate imports and lazy
boundaries. Studio routes also load independently.

The CSS optimizer reports its lack of recognition for the standard
`::highlight()` pseudo-element. The emitted rules are preserved for in-place
find highlighting. Large-chunk build messages include the lazily loaded ELK
engine and rich editor modules.
