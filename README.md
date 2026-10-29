# fast-ux-kit

A private React UX foundation: a portable outline model, a direct React outliner,
an editable state-machine workbench, and one coherent component layer combining React Aria and Ark UI with shared
design tokens and styling. This is a library, not another app or theme engine.

**Status:** alpha. No public npm release. Hosting is a separately authorized operation. Full editor and extension parity is tracked by executable tests, not assumed. [Release gates](docs/RELEASE.md) remain explicit.

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
Use `/components/aria` for the 56 default-owner/native families—including color,
calendar/date/time, inputs, collections, navigation, overlays and layout—without
the optional Ark JavaScript dependency. `/components` adds 30 specialized families
(including Pagination) and the full catalog metadata. Both styled entries use
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

## Machine View

```tsx
import { MachineView } from "@samhagman/fast-ux-kit/react";
import type { MachineDocument } from "@samhagman/fast-ux-kit/machine";
import "@samhagman/fast-ux-kit/tokens.css";
import "@samhagman/fast-ux-kit/machine.css";

const machine: MachineDocument = {
  version: 1,
  rootId: "workflow",
  machines: [
    {
      id: "workflow",
      label: "Review workflow",
      initialId: "draft",
      nodes: [
        { id: "draft", label: "Draft", kind: "atomic" },
        { id: "done", label: "Complete", kind: "final" },
      ],
      transitions: [{ id: "approve", sourceId: "draft", targetId: "done", event: "APPROVE" }],
    },
  ],
};

<MachineView defaultValue={machine} label="Review workflow" />;
```

Machine View separates graph editing, bounded deterministic local simulation and
host-supplied runtime inspection. Nested/parallel graphs, validation, layout,
keyboard alternatives, undo/redo and inspect-only trace scrubbing share one
component. Named guards/actions require trusted pure callbacks; no source strings
are evaluated. Runtime transport, timers, approvals and real side effects remain
application-owned. Diagnostics are opt-in and external observations are not
claimed to be a universal runtime adapter.

See the [Machine View API and boundaries](docs/MACHINE_VIEW.md), and the hosted
`#machine-view` lab for synthetic scenarios, observed transition coverage and
committed-snapshot inspection. The portable `/machine` entry contains no React or
DOM code. Importing `/styles.css` already includes the optional Machine View skin.

## Building other interfaces

```tsx
import { Button, Field, Checkbox, Pagination } from "@samhagman/fast-ux-kit/components";
import "@samhagman/fast-ux-kit/components.css"; // shared tokens + styling
```

The current catalog contains **86 canonical styled families**: 56 default-owner or
native families and 30 optional specialized families. This counts families, not
leaf parts, raw re-exports or utility hooks. It is an implementation inventory,
not browser/device certification.

- **Ready-to-compose recipes:** labeled fields, date/time pickers, color controls,
  tables, collections, navigation, dialogs and feedback.
- **Styled compound APIs:** `Primitives` preserves the default owner's exact prop
  types and render props. Specialized families such as `Drawer`, `FileUpload`,
  `PasswordInput`, `Steps` and `Toast` expose their typed `Root`/part anatomy.
- **One shared visual system:** `--fux-*` semantic tokens, 44px control targets,
  logical spacing, light/dark scopes, forced-colors and reduced-motion rules.
- **Explicit escape hatches:** `/aria` and `/ark` expose complete **unstyled** owner
  APIs. Raw exports do not become styled merely by importing the kit stylesheet.

```tsx
import { ColorPicker, DatePicker, Primitives } from "@samhagman/fast-ux-kit/components/aria";
import { PasswordInput } from "@samhagman/fast-ux-kit/components";

<ColorPicker label="Accent" defaultValue="#315b8d" />;
<DatePicker label="Deadline" />;
<PasswordInput.Root>
  <PasswordInput.Label>Password</PasswordInput.Label>
  <PasswordInput.Control>
    <PasswordInput.Input />
    <PasswordInput.VisibilityTrigger>
      <PasswordInput.Indicator fallback="Show">Hide</PasswordInput.Indicator>
    </PasswordInput.VisibilityTrigger>
  </PasswordInput.Control>
</PasswordInput.Root>;
```

See the [complete component API and inventory](docs/COMPONENT_API.md),
[component verification ledger](docs/COMPONENT_COVERAGE.md), and
[composition rules](docs/ARCHITECTURE.md). `componentManifest`,
`componentUtilities` and `ownerFamilyCoverage` provide machine-readable catalog,
infrastructure and canonical-overlap mappings. Every canonical family has a
named documentation route and an actual component composition.

Override theme tokens at the application/theme root **and the portal root**. Never
attach two behavior owners to the same control, or add another focus trap inside
an already managed overlay. Application-specific facades remain application-owned.

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

The small Button/Field/layout recipes intentionally limit per-call style forks;
use semantic variants and root theme tokens. Styled `Primitives` and specialized
compound parts retain their owner styling/ref/render-prop contracts for composition. `IconButton` children must be a
non-interactive decorative icon. Advanced upstream primitives remain available
from the headless subpaths when a consumer needs a capability beyond that API.

## Deliberate editing and extensions

`OutlineEditor` is a direct React editor, defaulting to read-only. Pass
`readOnly={false}` to enable editing. It exposes immutable transitions/history,
keyboard intents, structured clipboard, hoist, extension slots and text intelligence.
See [editor API](docs/OUTLINER_API.md) and [behavior coverage](docs/PARITY.md) for
exact supported semantics, optimistic host synchronization, tests and remaining
platform gaps. No source pane is enabled merely by viewing a document.

Optional [note editing](docs/OUTLINE_NOTES.md) uses a trusted typed adapter and a
separate plain-text field with canonical local updates and field-aware history.
An explicit action opens the note; Shift+Enter switching is a separate opt-in.
Existing title keys and the reader-first default remain unchanged.

## Optional local search and productivity

`OutlineSearch` adds a read-only local search surface without activating an editor
or changing the canonical outline. It supports context and flat results, safe
source-coordinate highlights, note display and completion filters. Portable
`searchOutline`, `getOutlineItemDetails`, `outlineTagInventory`, `projectOutline`
and `applyOutlineSort` keep query, metadata, view and mutation responsibilities
separate. Sorting is an atomic authorized editor transaction; filtering is not.

See [search reader contracts](docs/OUTLINE_SEARCH.md) and
[portable productivity tools](docs/OUTLINE_PRODUCTIVITY.md). The optional
`outline-search-lab` documentation route uses synthetic local state with explicit
editing, lock refusals and undo. There is no workspace-wide search service,
persistence, collaboration or relative-date parser implied by these APIs.

## Documentation playground

`npm run docs:build` builds the documentation and live component playground into
`.docs-site/`. The examples use real kit components, synthetic local state and
hashed self-contained production assets. Building does not deploy or change access.
See [documentation site](docs/DOCUMENTATION_SITE.md) for the private hosting contract
and verification boundaries.
