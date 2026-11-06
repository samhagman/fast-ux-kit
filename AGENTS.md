# fast-ux-kit

This repository contains the Fast UX Kit library and its Studio consumer demo.

- Run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run check`, and `npm run test:consumer` before a draft PR.
- Do not add or run GitHub CI jobs/workflows. Run the full checks locally on the exact snapshot before pushing, and record results in the draft PR.
- Keep portable data/policy in `src/core`; React and DOM dependencies stay out.
- Reader folding is local UI state, never document mutation or authorization.
- Use one interaction owner per element: Base UI through the shared shadcn component layer. Never combine two focus/overlay managers on one primitive.
- Default rendering is a mobile-first in-place outline; no raw Markdown source view, card-per-node redesign, editor activation or new app shell.
- Rich content renderers are consumer-owned trusted React, not HTML parsers. No unsanitized HTML or executable content from document data.
- Preserve semantic labels, keyboard focus, RTL logical properties, reduced motion and SSR stability.
- Components take the size their variant gives them (`xs`, `sm`, default, `lg`, `xl`); there is no global minimum size. Pick the size that fits the layout. The outliner and machine views keep their own touch targets.
- No private application data, credentials, deployments or product palettes in this repository.
- Author implementation independently and preserve required dependency notices. Do not silently change license, private flags, repository visibility, publish, merge or deploy.

## Independent implementation boundary

Author every implementation and test independently from the written behavior
contract. Standard shadcn-generated components and explicitly approved open-source
components may be incorporated with their licenses and required notices preserved.
Author the custom tools and tests independently. Keep private comparative
research, private project names and their references out of the repository,
generated artifacts and commit history. Ordinary attribution, including AI tool
mentions and co-author credits, is allowed in pull requests and commits without
an attribution-specific review or lint check.

Preserve package license metadata and required dependency notices. If you discover
unapproved copied or substantially derived material, stop and replace it
independently or escalate. Preserve all required notices during that review.
