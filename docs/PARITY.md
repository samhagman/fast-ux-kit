# Behavior coverage and verification

This is an independently authored, native React implementation. This document records observable behavior and evidence, not a claim of complete equivalence or production readiness. Requirements live in [REQUIREMENTS.md](REQUIREMENTS.md); public contracts live in [OUTLINER_API.md](OUTLINER_API.md).

## Verified with executable tests

| Area                      | Implemented contract                                                                                                                                            | Evidence                                                                      |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Immutable core            | Stable IDs, complete hidden-tree validation, cycles/duplicates, path cloning, atomic commands, no partial refusal                                               | `core.test.ts`, `editor-core.test.ts`                                         |
| Reader                    | Semantic disclosures, controlled/local expansion, normal link/keyboard behavior, no automatic editor activation                                                 | `react.test.tsx`                                                              |
| Mobile-oriented structure | Inline-end disclosure, shared 44px geometry, bounded nesting, lazy hidden branches, hoist and return focus                                                      | `react.test.tsx`; CSS contract, not device certification                      |
| Rich prose                | Whole Markdown source preserved; semantic GFM, tasks/tables/code/footnotes, Unicode/RTL, inert HTML/MDX, safe URLs                                              | `rich.test.tsx`                                                               |
| Rich extension blocks     | Images, media/transcripts, drawing snapshots, host diagram/React registry, fallback/error boundaries, unknown data preservation                                 | `rich.test.tsx`                                                               |
| Split                     | Insert-before at caret zero, expanded-parent first child, collapsed-parent sibling, selected-range removal, empty-final-child lift                              | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Merge                     | Previous/next visible row, parent-child splicing, surviving children retained, rich metadata loss refused                                                       | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Structure                 | Indent, outdent with adoption, sibling ordering, branch-boundary movement, hoist boundary, selected roots                                                       | `editor-core.test.ts`                                                         |
| History                   | Typing bursts, structural transaction boundaries, undo/redo, retained fold state, policy reevaluation                                                           | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Input lifecycle           | Strict Mode, rapid typing after split, stale select-event focus race, composition guards, authoritative replacement, optimistic acknowledgments/reset           | `editor-react.test.tsx`                                                       |
| Selection                 | Escape/Return row mode, Shift range, deletion, selected ancestor deduplication, atomic task toggles                                                             | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Clipboard                 | Readable export plus canonical MIME, regenerated IDs, metadata/hidden children retained, refusal on failed/ignored canonical write                              | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Pointer movement          | Threshold, gap/depth plan, one drop transaction, cancellation, missing/obsolete source safety                                                                   | `editor-core.test.ts`, mocked-layout pointer tests in `editor-react.test.tsx` |
| Global reader safety      | Insert, paste, task, delete, structural edits, replacement and history cannot mutate content; view actions remain usable                                        | `editor-core.test.ts`, `editor-react.test.tsx`                                |
| Canonical codecs          | Version rejection, exact JSON data, symmetric size/count/depth budgets, no silent symbol/accessor/sparse/undefined loss                                         | `editor-core.test.ts`, `rich.test.tsx`                                        |
| Text vocabulary           | UTF-16/end-exclusive/point ranges, overlap segmentation, range invalidation, normalized ranking, references and source-coordinate snippets                      | `text-intelligence.test.ts`                                                   |
| Completions               | Key precedence, mid-token replacement, exact context/provider freshness, abort/dismiss/unmount, malformed results/errors, one-step acceptance                   | `editor-react.test.tsx`                                                       |
| Hover                     | Provider order, context snapshots, malformed/accessor rejection, disabled/removed provider behavior, stale caret/row rejection, interactive keyboard/touch info | `hover.test.tsx`, `editor-react.test.tsx`                                     |
| Highlighted evidence      | Overlap precedence, unchanged source text, one keyboard stop per action including covered ranges, safe fallback                                                 | `highlight.test.tsx`                                                          |
| Extensions                | Plugin action interception, lifecycle callbacks, typed analysis, separate rich bodies/accessories, folded summaries and insertion prompts                       | `editor-react.test.tsx`                                                       |
| Dialog composition        | Suggestions and interactive hover remain inside the shared modal scope; popup Escape does not close the parent; hover links receive focus                       | `editor-react.test.tsx`                                                       |
| SSR                       | Deterministic reader IDs/hydration, independent instances, editor server rendering, rich source handling                                                        | `react.test.tsx`, `editor-react.test.tsx`, `rich.test.tsx`                    |

The independent reviewer additionally exercised 9,000 deterministic randomized editor transitions: previous roots remained unchanged, all resulting outlines validated, IDs remained unique, and replaying content intents in default reader mode retained the exact authoritative roots. This is invariant evidence, not proof of every user-visible transition.

Test counts can change with the draft. Use the final local `npm run check` and `npm run test:consumer` logs for the exact pushed source snapshot as the aggregate result; do not infer that all stages passed merely from a focused test invocation.

## Deliberate contracts, not accidental omissions

- The reader is a document/disclosure interface, not an ARIA tree. It does not trap rich content inside composite tree keyboard rules.
- Fold state is separate from content. Reading does not create persistence writes.
- Editing must be explicit. `OutlineEditor` itself defaults to the reader.
- Local locks are conservative, including protected descendants carried by ancestor movement. `canChange` adds whole-transition policy; it does not weaken built-in locks. This is a deliberate stronger refusal rule.
- Merging application metadata needs an explicit `mergeData` policy. Silent rich-content loss is not an acceptable approximation.
- `nodes` uses optimistic acknowledgments; `resetKey` explicitly rejects pending edits. It is not a conventional input that blocks every local change until props arrive.
- Readable outline text is not lossless storage or an arbitrary-Markdown parser. Whole Markdown documents retain source inside versioned rich data; canonical JSON preserves identity and metadata.
- Remote media is denied by default; raw HTML, MDX, script strings, arbitrary imports and iframes do not execute. Trusted renderer registration is application code, not an untrusted-plugin sandbox.
- Large/deep reader documents have visible inline-render limits rather than silent truncation. Canonical import/export also has explicit validation budgets.

## Implemented but not yet verified on a real browser/device

The optional cloud headless Chromium smoke fixture is `tests/browser/fixture.tsx`, driven by `node scripts/test-browser.mjs`. It checks native keyboard focus/input, mobile-width layout, disclosure/task target geometry, rendered Markdown and popup placement, and can save screenshots. **It did not run to a page in this environment:** Chromium startup was blocked by the sandbox's local-socket restriction; the supported escalation route was unavailable. No screenshot or browser pass is claimed.

Consequently these remain open acceptance gates:

1. Native keyboard and focus behavior in a real browser, including held/repeated keys and interruption after undo/split/completion.
2. Android Chrome/WebView composition, Gboard/autocorrect, native clipboard MIME retention and text selection.
3. Touch scrolling versus the explicit reorder handle, pointer capture/cancellation, stationary edge auto-scroll and collision geometry.
4. Wrapped-line/variable-font/bidirectional caret hit testing, long lines, zoom, resize, scroll and dynamically loaded media.
5. TalkBack/VoiceOver reading order, row selection announcements, listbox/active-descendant suggestions, hover descriptions and keyboard escape paths.
6. Measured interaction/render performance for realistic large rich documents. No virtualization or production-size performance claim is made.
7. Actual downstream application ports, persistence/auth/offline integration and app-specific renderer safety/animation quality.

DOM emulation tests prove event/state contracts; they cannot establish physical hit targets, browser layout or a real IME. CSS and a screenshot fixture are not substitutes for these gates.

## Explicitly not shipped as a complete subsystem

- Collaborative editing, CRDT/OT merging, remote history and cross-device synchronization.
- A full source-code editor, parser/language server, search engine or AI service. The text-intelligence contracts can connect host services without pretending to supply them.
- Built-in diagram execution engines, drawing authoring, arbitrary embedded websites or executable document components. Host-registered React/diagram renderers and drawing snapshots have safe fallbacks.
- Direct free typing into an unmaterialized ghost row; transient prompts activate one real row first.
- Full variable-height virtualization. Reader limits and hoisting make bounded rendering explicit; editor rows currently render all visible items.

These boundaries and the open verification gates mean this draft must not be described as “100% complete” or “fully equivalent.” Closing those gates requires evidence and, where needed, additional implementation rather than a wording change.
