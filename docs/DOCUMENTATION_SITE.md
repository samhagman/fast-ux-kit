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
