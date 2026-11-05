# Product contract and acceptance criteria

This document is the acceptance contract, not a statement that every criterion
already passes. Each implemented behavior needs executable coverage and the
relevant browser/device evidence before it is marked complete. Missing behavior
must remain visible in the parity ledger; “100%” is not a synonym for “similar.”

## 1. Reusable, coherent UX foundation

- One shared shadcn/Base UI component layer supplies the catalog and custom tools.
- Components use semantic color, typography, spacing, radius, control-size,
  motion and focus tokens. Keep theme and product data outside the package.
- Assign one behavior owner to every interactive element; no doubled press,
  keyboard, focus, dismissal or portal managers. Differences in upstream APIs
  are explicit and ergonomic, not hidden by a universal adapter.
- Typed ESM package installs from a tarball in an independent React app; no source
  aliases, copied app code or duplicate React. Optional entries remain separate.
- Pass type-level misuse checks and DOM interactions for the component catalog,
  two independent palettes, keyboard navigation, disabled/error states and SSR.

## 2. Direct React outliner behavior baseline

Implement the complete specified interaction contract directly in React, with
portable model/state logic. A read-only visual imitation alone does not satisfy it.
The parity ledger must cover:

- Stable node identity, nested ordering, full-document validation and immutable
  changes; collapse/expand, fold/unfold all and bounded level expansion.
- Focus/selection, vertical keyboard navigation, Enter/split insertion, paragraph
  line breaks, Backspace/Delete merge behavior, indent/outdent, move up/down,
  deletion and task toggling with exact caret/selection outcomes.
- Hoist into a subtree, breadcrumb/path navigation and return, preserving the
  underlying document and reader-local folds outside the hoist.
- Undo/redo with atomic transactions and selection restoration, separate content
  history from reader-local expansion/navigation state; no phantom edits.
- Import/export, structural clipboard operations and paste/drop distinctions;
  explicitly state serialization limitations rather than silently discarding data.
- Read-only global gate with per-node policy extensions. Every mutation path,
  keyboard route and plugin command must honor it; client policy is not server auth.
- IME composition, multi-codepoint text, empty/nested edge cases, deep/large input,
  controlled state, stale async work and repeated React Strict Mode mounting.

Acceptance evidence: deterministic transition fixtures for every listed operation,
property/invariant tests for arbitrary trees, DOM keyboard/caret tests, real browser
editing and mobile IME/device checks. Missing parity must be recorded precisely.

## 3. Extensibility and text intelligence

- Public typed extension seams for node data, body/decorated rendering, content
  codecs, commands, policy, keyboard intents and completion/suggestion providers.
- Extensions compose without importing internal files or forking the package.
  Demonstrate at least two independent extensions and deterministic precedence.
- Text intelligence detects tokens/context, decorates without changing source,
  offers keyboard-accessible suggestions and commits explicit atomic edits.
- Async providers support cancellation, stale-result rejection, loading/error and
  cleanup. Their results cannot bypass policy or insert executable content.
- Undo/redo, selection/caret, reader folds and app data survive extension commands.

Acceptance evidence: external consumer extension fixture, async race/abort tests,
read-only denial tests, custom codec roundtrip and keyboard completion interaction.

## 4. Arbitrary Markdown documents and rich canvas-level content

“Arbitrary Markdown” means accepting user documents without destroying unsupported
syntax, not executing arbitrary HTML/JavaScript. Keep original source losslessly
when importing a whole Markdown document. Distinguish the source document from an
outline-title text codec. A normalized or edited export must declare its contract;
never silently claim byte-perfect roundtrip after lossy parsing/editing.

Required content coverage:

| Content                                                                | Rendering / fallback contract                                                                    |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CommonMark paragraphs, headings, emphasis, lists, quotes, breaks, code | Parsed readable content, not a source pane                                                       |
| GFM tables, tasks, strikethrough, links, autolinks, footnotes          | Accessible semantic output; task edits explicitly policy-gated                                   |
| Nested blocks and callouts                                             | In-place outline flow; preserve hierarchy and data                                               |
| Images                                                                 | Safe source policy, useful alt text, bounded mobile sizing, unavailable-media fallback           |
| Drawing/vector snapshots                                               | Typed data or safe image representation; never arbitrary injected SVG/HTML                       |
| Diagrams                                                               | Typed renderer registry with readable label/fallback; preserve source without executing it       |
| Video/audio                                                            | User-initiated playback, controls, captions/transcript metadata and offline/unavailable fallback |
| Links/bookmarks                                                        | Safe protocols, real links, explicit external navigation semantics                               |
| React blocks/animations                                                | Trusted application-registered components only; unknown IDs fall back safely                     |
| Unsupported/unknown blocks                                             | Visible safe fallback, preserved data, no silent loss or execution                               |

Use stable typed block IDs, a versioned schema and a renderer registry. Imported
Markdown/JSON never chooses arbitrary module paths, executes MDX, evals code,
compiles React or grants iframe permissions. Trusted application React is a code
boundary, not a sandbox. Truly untrusted interactive embeds require a separately
reviewed isolated origin/sandbox contract with no ambient credentials; absent that
contract, use a safe placeholder rather than weakening isolation.

Acceptance fixtures include a mixed long Markdown document, nested tasks/table,
Unicode/RTL/code fences, raw HTML/script/event attributes, javascript/data URLs,
remote-media denial/offline state, unknown block data, drawing/diagram/video/link,
and a registered animated React block respecting reduced motion. Verify exact
source preservation on untouched import/export and documented normalization when
editing. Never claim the short outline-text codec accepts arbitrary Markdown.

## 5. Mobile-first reader and accessibility

- The default experience reads content immediately; editing is deliberate and
  distinct. No keyboard pop-up merely from scrolling or touching body text.
- In-place hierarchical outline, not a card dashboard. Right-thumb-friendly
  disclosure option, minimum 44px targets, readable type and narrow-screen reflow.
- Folding is local to the reader, not a document write. Hidden descendants leave
  tab order/accessibility tree; focus stays predictable on collapse/hoist/return.
- Rich content supports ordinary links, selection and scrolling without accidental
  drag/edit. Tables/code scroll within the content width; media stays bounded.
- No Markdown source view by default. If later added, full source is secondary at
  the very bottom in an explicit modal with one copy action, not an always-open pane.
- Respect reduced motion, forced colors, RTL logical geometry and device safe areas.
  Animations cannot delay interaction or make state inaccessible.
- Offline behavior is explicit: local documents remain readable; unavailable remote
  media/completions show fallback, never fake success or silently retry writes.

Acceptance evidence: desktop keyboard+screen-reader semantics, narrow viewport
layout, 200% text/zoom, touch disclosure/repeated collapse, focus return, reduced
motion and a real Android/TalkBack/IME gate. jsdom is not a substitute for hardware.

## 6. Provenance, migration and release

- Independently author custom tools and tests. Preserve licenses and required
  notices for standard generated shadcn primitives and approved dependencies.
- No personal documents, credentials, private application data or unrelated history
  in the generic repository or published artifact.
- Foundation and consumer gates precede app migrations. Preserve existing themes,
  production/fixture separation, permissions and observed/pending/error behaviors.
- Use separate reversible draft PRs for consumer migrations and verify their
  application-specific behavior before rollout.
- Confirm repository visibility and publication settings after history, license
  and artifact review.
