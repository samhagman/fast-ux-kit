# Architecture

| Layer                | Responsibility                                                                                     |
| -------------------- | -------------------------------------------------------------------------------------------------- |
| `src/core`           | Portable document models, validation, immutable commands, search, policy and machine simulation    |
| `src/components`     | The 92-family shadcn/Base UI catalog and native compositions                                       |
| `src/editorial`      | Editorial UI: article layout, figures, notes, code and explorable frames. React and plain CSS only |
| `src/outliner`       | Structured writing, note editing, document navigation and host seams                               |
| `src/machine-graph`  | State-machine canvas, inspection and local simulation                                              |
| `src/machine-tree`   | State-machine hierarchy and shared simulation integration                                          |
| `src/react`          | Reader, editor and text-interaction surfaces                                                       |
| Consumer application | Persistence, authentication, authorization, transport and domain policy                            |

## Interaction ownership

Use Base UI through the shared shadcn component layer for supported primitives.
Native browser controls and independently authored compositions supply the
remaining specialized behavior. Each element has one focus, pointer, keyboard
and dismissal owner. Compound parts from the same family share that owner.

The common styles use semantic variables for color, spacing, radius and focus.
Consumers set theme and direction at their application boundary and carry those
values into portal content. Component composition preserves keyboard access,
logical properties and reduced-motion behavior. Controls follow their size
variant, from `xs` to `xl`.

## Document boundaries

Document content uses stable IDs and immutable transitions. Folding, selection,
search and presentation state remain separate from stored content. Rich renderers
are trusted React components registered by the application. Imported data cannot
choose executable modules or grant permissions.

The core has no React or DOM dependency. Interactive tools consume its models and
commands while keeping browser behavior in their React layers. Host callbacks
connect persistence and async work, including rejection and reconciliation of
controlled edits.

## Distribution

The package ships compiled ESM, TypeScript declarations, compiled CSS and required
assets. React and React DOM remain peer dependencies. Independent consumer tests
verify entrypoint resolution, styles, rendering and hydration from the tarball.

The Studio demonstrates the public package and maintains synthetic fixtures.
Application-specific data and cloud services live outside this repository.

## Implementation and licenses

Custom tools and tests are independently authored. Standard generated shadcn
primitives retain their MIT notices. Dependencies retain their own terms.
[Licensing](../LICENSE.md) · [Third-party notices](../THIRD_PARTY_NOTICES.md).
