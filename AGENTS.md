# fast-ux-kit

This repository contains the Fast UX Kit library and its Studio consumer demo.

- Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, and `npm run test:consumer` before a draft PR.
- Do not add or run GitHub CI jobs/workflows. Run the full checks locally on the exact snapshot before pushing, and record results in the draft PR.
- Keep portable data/policy in `src/core`; React and DOM dependencies stay out.
- Reader folding is local UI state, never document mutation or authorization.
- Use one interaction owner per element: Base UI through the shared shadcn component layer. Never combine two focus/overlay managers on one primitive.
- Default rendering is a mobile-first in-place outline; no raw Markdown source view, card-per-node redesign, editor activation or new app shell.
- Rich content renderers are consumer-owned trusted React, not HTML parsers. No unsanitized HTML or executable content from document data.
- Preserve 44px targets, semantic labels, keyboard focus, RTL logical properties, reduced motion and SSR stability.
- No private application data, credentials, deployments or product palettes in this repository.
- Author implementation independently and preserve required dependency notices. Do not silently change license, private flags, repository visibility, publish, merge or deploy.

## Independent implementation boundary

Author every implementation and test independently from the written behavior
contract. Standard shadcn-generated components and explicitly approved open-source
components may be incorporated with their licenses and required notices preserved.
Author the custom tools and tests independently. Keep comparative research, citations,
project names and implementation-origin
records out of this repository, generated artifacts and commit history. Package
license metadata and legally required dependency notices remain intact. If copied
or substantially derived material is discovered, stop: replace it independently
or escalate; never delete a required notice to disguise copying.
