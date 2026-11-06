# 0.2.0 verification

This release adds shared supplied-observation inspection to the polished canvas
and hierarchy views, then improves their existing local simulation and navigation.
The version-1 document format and legacy `/react` exports remain supported.

The release gate includes a clean install, `npm run check`, independent packed
consumer installation, and Studio typecheck, tests and production build. Exact
command results, artifact integrity and bundle measurements belong to the release
pull request. All checks run locally; no CI workflows are installed.

Focused coverage includes stream ordering, duplicate and overlapping deliveries,
retention, same-state metadata, unknown topology, controlled history refusals,
observation-specific work, request cancellation and duplicate actions. Simulation
checks cover pure previews, guard explanations, exact scenario expectations,
cancellation and retained replay. Existing editing, controlled documents,
undo/redo and outliner regressions remain in the full suites.

Browser checks cover keyboard operation, light/dark themes, RTL, narrow layouts,
reduced-motion emulation, inspection history, pending actions and scenario-failure
navigation. A separate installed tarball exercises default module-worker loading,
worker release, the in-process fallback and sustained observations on 200- and
1,000-state graphs. Runtime-only updates preserve the viewport and do not schedule
topology layout. The largest graphs have measurable rendering cost; benchmark
intervals are observations of the test environment, not a frame-rate guarantee.

Private compatibility fixtures stay outside this repository and the npm artifact.
Public demonstrations use independently authored, unrelated workflows. No engine
adapter, authentication, transport or external execution semantics are added.

Physical iOS/Android devices, native IMEs, VoiceOver and TalkBack have not been
verified for this release. Browser media and viewport emulation are recorded
separately from native-device and assistive-technology testing.

# 0.1.0 verification (previous release)

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
activation, RTL behavior, reduced motion and all tool routes. Measured outliner and
machine-view controls retain their 44px touch targets, component sizes follow
their variants, and editable mobile fields retain 16px text.

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
