# Documentation and component playground

The independent documentation app lives in `examples/docs`. It imports actual kit
components, not approximations, and uses only synthetic demonstration content.

## Build locally

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
npm run docs:build
```

The production static output is `.docs-site/`. It includes bundled JavaScript,
CSS, a favicon, HTML, esbuild legal notices and full license texts for every bundled
third-party package in `THIRD_PARTY_LICENSES.txt`.
No source maps, credentials, private application data, external fonts, analytics,
or runtime APIs are included. Do not remove generated legal notice files.

For ordinary local development, `npm run dev` rebuilds and serves the generated
documentation at `http://127.0.0.1:4173/`. Use `npm run dev -- --port 5271` to choose
another explicit local port. The server binds only to IPv4 loopback, does not open
a browser, never chooses a different port silently, and serves only the built
asset directory. Rebuild and refresh after edits; this is not a live-reload server.
It is not a deployment or authentication server. Where the command sandbox isolates
loopback from the browser, use the environment's supported app-preview relay.

## What is included

- Filterable documentation navigation, a named route for every component, and a
  keyboard-contained mobile navigation dialog.
- Light and dark semantic palettes, including modal portal styling.
- A route and real composition for each of the 86 canonical styled families,
  including all seven color families, date/time, collections and specialized controls.
- Explicit alias routes and non-visual utility pages; raw exports are labeled unstyled.
- Controlled/local state examples, typed compound anatomy and copyable usage code.
- Controlled outline folding, collapse/expand all, branch focus, reset and
  disclosure-position controls.
- Explicitly enabled local outline editing, safe rich Markdown and text highlights.
- Copyable examples, API summaries, token swatches and accessibility boundaries.

Demonstration state is local to the page. Reloading resets it. File pickers,
clipboard copying and download buttons use browser capabilities only when
explicitly activated. The drawing example is not a legal signing workflow.
Copy buttons require clipboard permission; a manual-copy fallback is displayed
when the browser denies access. Nothing is saved or transmitted.
Switching an example from Preview to Code unmounts its live subtree, closes its
portals and resets temporary state. Returning to Preview creates a fresh instance.
Example failures have a local Reset action without removing page navigation.
Rich-document footnotes and backlinks scroll and focus within the page without
replacing the documentation route.

## Private hosting contract

Building does not publish. Deployment is a separate explicitly authorized action.
Serve the complete generated directory only behind the approved Cloudflare Access
application. Before publishing, verify the intended hostname and approved identity
policy. Do not expose a default deployment hostname, preview URL, asset origin or
alternate route that bypasses Access. Verify unauthenticated denial on every route
and verify access using an authorized identity. The page's `noindex` directive and
"private preview" label are not access controls.

Use appropriate response security headers, including `X-Content-Type-Options:
nosniff`, a restrictive referrer policy and frame restrictions. A Content Security
Policy should permit the local bundled scripts/styles and the inline style
attributes required by interaction primitives; validate it against real browser
behavior before tightening it. Do not add credentials to this repository.

## Verification boundaries

The unit suite verifies meaningful interactions in jsdom. A successful bundle is
not browser, visual, mobile IME, screen reader or production acceptance. Run real
browser checks for responsive layout, light/dark contrast, focus restoration,
Escape/Close, repeated actions, hash navigation, folding, editing, clipboard and
reduced motion. Record any environment limits honestly.

## Showcase entry points

The Overview leads with **Open the outliner lab** and **Explore all components**.
The Outliner navigation group sits near the foundations, before the component
categories; no individually named component, color family, utility or alias route
is removed. Search includes the lab's reader, structure, policy, history, rich
content, plugin and intelligence description.

`#outliner-lab` is a separately lazy-loaded page, not an `experienceDemos` entry.
Its route branch precedes the generic experience-page branch. The existing focused
reader, editor, extensions, rich-content, text-intelligence and highlight pages
remain directly addressable. The Overview's capability map links these examples
and makes the important boundaries visible: deliberate editing, reader-local
folds, client policy versus authorization, codec limitations, trusted renderers
and safe unknown-content fallbacks.

The Overview's read → edit → inspect pathway is an invitation to exercise behavior,
not a completion score. It does not claim full parity, release readiness, physical
Android/iOS, IME or assistive-technology acceptance. The live composition remains
read-first; source code is not the default showcase view. All new navigation
links retain 44px minimum targets, logical layout and semantic theme colors; the
pathway and capability map stack on narrow screens without animation.

## Compact component workbench

`#components` is a responsive vertical gallery: original Outliner and Machine View
compositions precede cards for every canonical component family, not duplicated
inline documentation pages. Category buttons, search and a grouped component
selector jump without filtering families out. Each card links to full documentation.
Arrow keys and Home/End work when the gallery region itself is focused; nested
components retain their own keys. Route-return position and search are retained.
Only nearby previews and the last interacted preview remain mounted; distant
preview state resets. A local Reset action recovers each card independently.

`#machine-view` provides the reusable state-machine editor and inspection lab.
Portable data/commands/layout/validation and documented local simulation are
separate from host-supplied committed inspection frames. The tester uses synthetic
local workflows, explicit pure guard/action callbacks and expected-state scenarios;
it never publishes documents, dispatches live services or retries effects. Runtime
metadata is opt-in. See [Machine View](MACHINE_VIEW.md) for the exact contract and
unsupported semantics.

`#machine-tree-view` is a separate lazy hierarchy reader over the same portable
model, also previewed in the gallery. It demonstrates parallel branches,
references, ancestor-context search, target reveal and host-refused selection.
Its explicit local simulation controls live outside the presentation component;
selection and folding never send an event. See [Machine Tree View](MACHINE_TREE_VIEW.md).

The lab puts its actual document before optional instructions and policy probes.
Scenario selection and deliberate edit activation share one control band. Reset
and scenario changes restore reading mode. The closed guide remains available
below the document; diagnostics, import/export and manual checks remain separate
from the reading surface. The shared library skin, not a lab-only renderer, owns
outline typography, row controls, indentation, hierarchy and interaction states.

## Local outline search lab

`#outline-note-lab` is another lazy, read-first synthetic host composition. It
exercises a typed note adapter, deliberate editing, separately enabled
Shift+Enter switching, canonical note updates, local history and policy refusal.
Its optional search reads the same canonical document. Reset and authoritative
replacement are visible controls; nothing is persisted outside the page. See
[note contracts](OUTLINE_NOTES.md) for exact scope and remaining device gates.

`#outline-search-lab` is an additional lazy route, not a replacement for the
reader, structural editor, Machine View or component gallery. It composes the
public local search and productivity APIs over an original synthetic outline.
Context and flat results, explicit extra-child context, note display and
completion visibility are view state only. Tag buttons seed a query. Reveal
navigates to the canonical selected item, never a pruned replacement document.

Editing starts disabled. The separate details form preserves unknown host data
and saves title/note/completion/checkbox changes as one authorized transaction.
Dirty drafts must be saved or discarded before switching items or using history.
Root sorting demonstrates stable order, undo and refusal when a protected row
would be displaced. Reset starts a fresh local trial. There is no browser storage,
network persistence, global index or service success claim. Its DOM/SSR checks
are separate from pending browser/device acceptance.
