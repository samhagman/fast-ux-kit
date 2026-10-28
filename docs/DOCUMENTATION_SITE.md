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

## What is included

- Filterable documentation navigation and mobile navigation disclosure.
- Light and dark semantic palettes, including modal portal styling.
- Real Button, IconButton, Link, Field, Checkbox, ModalDialog, Pagination,
  Stack, Row and Panel examples.
- Controlled outline folding, collapse/expand all, branch focus, reset and
  disclosure-position controls.
- Explicitly enabled local outline editing, safe rich Markdown and text highlights.
- Copyable examples, API summaries, token swatches and accessibility boundaries.

All interactions are local to the page. Reloading resets demonstration state.
Copy buttons require clipboard permission; a manual-copy fallback is displayed
when the browser denies access. Nothing is saved or transmitted.

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
