# Component coverage and verification boundaries

This ledger separates authored UI, executable DOM/state evidence and real-browser
acceptance. The machine-readable inventory is `src/components/manifest.ts`.
Canonical family counts exclude raw owner re-exports, leaf parts, aliases and
infrastructure. A `status: "styled"` entry means an authored styled composition
exists; it is not a device-certification flag.

## Authored surfaces

- 56 default-owner/native families: actions, fields and selection, collections and
  navigation, disclosures/overlays, date/time, seven color families, feedback,
  files and layout.
- 30 optional specialized families, including Pagination, local file/media tools,
  segmented/PIN/password entry, navigation, resizable surfaces and guided flows.
- A real composition and copyable usage example for every canonical family.
- Explicit overlap mappings and separate utility pages. `Primitives` preserves
  typed default-owner parts; specialized namespace parts preserve their owner APIs.
- Shared semantic tokens, nested light/dark scopes, logical spacing, target-size
  rules, forced-colors treatments and reduced-motion handling.

## Executable evidence

| Area                          | Evidence                           | Contract exercised                                                                                                                                                                                                                         |
| ----------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Existing controls             | `components.test.tsx`              | Press semantics, native links, required labels, validation, refs, modal close and pagination bounds/control                                                                                                                                |
| Default-owner recipes         | `components-expanded.test.tsx`     | Color synchronization and keyboard channels; controlled values; input/choice states; date selection and segments; filtering; tabs, tables, tree expansion and tag removal                                                                  |
| Overlays and direction        | `components-expanded.test.tsx`     | Repeated DatePicker open/Escape/reopen with focus restoration, Popover dismissal, single Sheet dialog, disabled menu actions and RTL tab progression                                                                                       |
| Catalog parity and SSR        | `components-catalog.test.tsx`      | Every default-owner family has an example; every example renders on server and client; no missing computed geometry; installed owner inventories are completely classified                                                                 |
| Specialized families          | `components-ark.test.tsx`          | Every specialized example renders; password visibility, inline edit/cancel/commit, angle/rating keyboard input, native segmented selection, tag entry, steps, clipboard, local file removal, repeated drawer lifecycle and toast dismissal |
| Advanced specialized families | `components-ark-advanced.test.tsx` | Dedicated advanced-family composition and interaction checks; see that suite for exact scenarios                                                                                                                                           |
| Independent cross-review      | `components-cross-review.test.tsx` | Multi-month pagination and duration changes; maximum-year termination; root refs; controlled replacement collections; empty/long content; zero/transparent values; leap-day/midnight; scoped RTL and nested overlay focus                  |
| Infrastructure                | `components-utilities.test.tsx`    | Locale changes, collection filtering, explicit iframe preview, presence/local portals, focus-utility entry/exit, highlighting and opt-in scoped hotkeys that ignore typing                                                                 |
| Docs integration              | `docs.test.tsx`                    | Named routes, actual demo mounting, route navigation and unique DOM IDs                                                                                                                                                                    |

Focused suite results are not a substitute for the coordinator's final aggregate
check on one exact source snapshot. Use final local `check`, `build`, consumer and
docs-build logs for aggregate status rather than adding overlapping test counts.

## Regressions found and addressed

- Calendar and RangeCalendar render every resolved visible month rather than a
  multi-month heading over a single grid; repeated spillover dates are hidden.
  Iteration stops at clamped calendar boundaries, including the maximum year.
- Root refs are explicitly typed for field, checkbox, calendar and collection
  recipes instead of being accepted at runtime but rejected by TypeScript.
- Color wheel defaults now provide finite inner/outer geometry rather than
  propagating missing radii into invalid computed styles.
- Grid-list labels use a supported text structure rather than an invalid slot.
- Recipes avoid redundant accessible names when their owner combines action and
  field/item labels.
- Nested theme scopes redeclare derived semantic roles, preventing a dark subtree
  from inheriting already-resolved light input backgrounds.
- The specialized password visibility action is reachable by keyboard and routes
  keyboard/assistive-technology clicks through the same owner's public state API,
  retaining its original pointer behavior.
- Table-of-contents navigation has a unique nav ID rather than duplicating the
  root ID. Its live documentation example preserves the app route hash while
  scrolling its own article area.
- Segmented-control visual orientation matches the explicit owner orientation.
- Toast styles consume owner placement/opacity variables; notifications are not
  treated as unrelated static boxes.
- Demonstration links target registered documentation routes; illustrative actions
  produce local feedback rather than appearing to perform real external work.

## Still requires actual browser and device evidence

DOM emulation does not prove physical hit targets, layout, native focus behavior
or rendering. These remain separate acceptance gates until exercised and recorded:

1. Actual screenshots and interaction checks at narrow/mobile and desktop widths,
   including every family, long labels, overflow, zoom and nested theme scopes.
2. Color-area/slider/wheel gradients, alpha display and pointer geometry; calendar
   layout; cropper, drawing, carousel, splitter and floating-panel measurements.
3. Real browser focus containment and restoration, native radio arrow behavior,
   tooltip/hover behavior, outside dismissal and repeated/interrupted flows.
4. Native clipboard permission failures, file chooser cancellation, paste,
   downloads and object-URL cleanup under real browser security policies.
5. Forced-colors, reduced-motion, dark/light contrast, RTL layout and actual
   screen-reader announcements, including disabled and error states.
6. Mobile touch, pointer cancellation, virtual keyboards and platform assistive
   technology. jsdom observer/geometry shims are test infrastructure, not evidence
   that the corresponding browser implementation ran.
7. Consumer integration, application validation, authorization, persistence and
   transport. Component state management does not provide those services.

No public release, deployment or broad readiness claim follows from this ledger.
