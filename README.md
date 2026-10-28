# fast-ux-kit

A private React UX foundation: a portable outline model, a direct React outliner,
and one coherent component layer combining React Aria and Ark UI with shared
design tokens and styling. This is a library, not another app or theme engine.

**Status:** alpha. No public npm release. No deployment. Full editor and extension parity is tracked by executable tests, not assumed. [Release gates](docs/RELEASE.md) remain explicit.

## Install and develop

Node 22.13+; tested baseline React/React DOM 19.2.6, React Aria Components 1.22.1.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
npm pack
```

Validation is local-only: run the complete checks above before pushing the exact
reviewed snapshot. This repository intentionally has no GitHub CI workflows.

Install the resulting tarball into another app; it contains compiled ESM and TypeScript
declarations, not workspace aliases. Install matching React, React DOM and
`react-aria-components` peers in the consumer. Ark is optional unless importing
`@samhagman/fast-ux-kit/ark` or the unified `/components` layer; then install `@ark-ui/react@5.39.3` as well.
Use `/components/aria` for styled Button, Field, Checkbox, Link, ModalDialog and
layout components without the optional Ark dependency. Both styled entries use
the same `/components.css` and semantic tokens.
A private Git dependency alone is **not** the distribution contract: this repository
does not commit build outputs or run implicit prepare scripts. Use tested tarballs
or an explicitly authorized private registry release, not copied source trees.

## Read-first outline

```tsx
import { Outliner, type OutlineNode } from "@samhagman/fast-ux-kit";
import "@samhagman/fast-ux-kit/styles.css"; // optional shared tokens + styles

const nodes: readonly OutlineNode[] = [
  {
    id: "guide",
    text: "Project guide",
    children: [
      { id: "intro", text: "Start here" },
      { id: "next", text: "Next steps" },
    ],
  },
];

<Outliner nodes={nodes} aria-label="Project guide" />;
```

The reader is an in-place nested list with disclosure buttons, not a fake ARIA tree
or an auto-activating editor. Text is readable immediately; touch and keyboard
activation change folding only. It never mutates content. The optional stylesheet
keeps disclosure targets at least 44px, supplies a neutral baseline, and lets the
application override semantic theme tokens.

Use `getRichContent` with the [rich content API](docs/RICH_CONTENT.md) for parsed
Markdown and typed media/diagram/React blocks. Use `renderContent` to supply trusted React content (paragraphs, lists, images,
links, code or app components). Plain strings are escaped by React. Plain text labels are not parsed as Markdown; RichContent parses the separately
typed source. Raw HTML is never executed. Remote media does not load by default;
an explicit `allowMedia` policy opts into permitted image/audio/video loads.
There is no raw-source editor view by default. Consumers remain responsible for sanitizing imported content and URLs.

Use controlled `expandedIds` plus `onExpandedChange` to persist reader-local
folding separately from the document. Otherwise all parents start expanded, and
`defaultExpandedIds` can choose initial folding. Stable node IDs are mandatory.
See the exported types for complete renderer and callback contracts.

## Building other interfaces

```tsx
import { Button, Field, Checkbox, Pagination } from "@samhagman/fast-ux-kit/components";
import "@samhagman/fast-ux-kit/components.css"; // shared tokens + styling
```

Button, Field, Checkbox, IconButton, Link and ModalDialog use React Aria; Pagination
uses Ark UI. Stack, Row and Panel provide bounded layout composition.
All share the `--fux-*` semantic tokens and control geometry through one typed
component layer. Override theme tokens at the application root, including portals.
Advanced headless primitives are separately available from `/aria` and `/ark`;
these escape hatches are not a universal prop-translation layer. [Composition rules](docs/ARCHITECTURE.md) assign one behavior owner per
control. Application-specific facades and CSS Modules stay with the application
until each shared abstraction has a proven second use.

## Safe document commands

`@samhagman/fast-ux-kit/core` has no React or DOM dependency. Validation rejects
malformed trees, cycles and duplicate IDs. Immutable commands default to
`readOnly: true`; opt into editing explicitly and supply a lock policy when needed.
This client-side policy is not an authorization boundary. The host/server must
validate permissions and persistence independently.

## Implementation and licensing

The code is independently authored; no external implementation source files
are copied. [NOTICE.md](NOTICE.md) records implementation status and
third-party package licenses. Public licensing and publication require a separate decision.

## Local integration fixture

`npm run demo:build` builds `examples/smoke` into `.demo/` for a local static server.
It exercises both behavior libraries with the same tokens in two palettes. It is
synthetic test content, not an app deployment or a substitute for device QA.
`npm run test:browser` provides an optional local Chromium smoke harness (set
`CHROMIUM_PATH` if needed). Browser startup was blocked in the initial cloud
environment; see the behavior coverage ledger for unverified platform gates.

The primary shared controls intentionally omit per-call `style`/`className` forks;
use semantic variants and root theme tokens. `IconButton` children must be a
non-interactive decorative icon. Advanced upstream primitives remain available
from the headless subpaths when a consumer needs a capability beyond that API.

## Deliberate editing and extensions

`OutlineEditor` is a direct React editor, defaulting to read-only. Pass
`readOnly={false}` to enable editing. It exposes immutable transitions/history,
keyboard intents, structured clipboard, hoist, extension slots and text intelligence.
See [editor API](docs/OUTLINER_API.md) and [behavior coverage](docs/PARITY.md) for
exact supported semantics, optimistic host synchronization, tests and remaining
platform gaps. No source pane is enabled merely by viewing a document.

## Documentation playground

`npm run docs:build` builds the documentation and live component playground into
`.docs-site/`. The examples use real kit components, synthetic local state and
hashed self-contained production assets. Building does not deploy or change access.
See [documentation site](docs/DOCUMENTATION_SITE.md) for the private hosting contract
and verification boundaries.
