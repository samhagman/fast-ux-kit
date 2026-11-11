# Fast UX Kit

A React component library for structured writing and interactive tools. It
includes an outliner, a state-machine canvas, a machine hierarchy view, 92 app
component families built on a shared shadcn and Base UI layer, and Editorial UI:
35 forms for explaining something on a page.

The portable core supplies document models, immutable commands, validation,
search and simulation. Applications own persistence, authentication and remote
services.

The release package includes compiled modules, declarations, styles and dependency notices.

## Local development

Use Node 22.13 or later.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run check
npm run test:consumer
npm --prefix studio test
npm run dev
```

The Studio runs at `http://127.0.0.1:5180`. It has three catalog sections
(Foundations, App Components and Editorial UI) plus the outliner and both machine
tools. Run `npm run build` first: the Studio reads the compiled package. `npm run docs:build` produces the Studio's static
build in `studio/dist/`. All validation runs locally.

## Use the package

Build and pack the library, then install the resulting tarball in a separate app.

```sh
npm run build
npm pack
```

```sh
npm install ./samhagman-fast-ux-kit-0.1.0.tgz react@19.2.6 react-dom@19.2.6
```

Applications own fonts, page layout and global resets. Load an application reset
before the compiled stylesheet. With Tailwind CSS v4, an application stylesheet
can use these imports.

```css
@layer theme, base, components, utilities;
@import "tailwindcss/preflight.css" layer(base);
@import "@samhagman/fast-ux-kit/styles.css";
```

Import that application stylesheet once at the entry point. Applications with an
existing reset can import the compiled kit stylesheet directly.

```tsx
import { Button, Field } from "@samhagman/fast-ux-kit/components";
import "@samhagman/fast-ux-kit/styles.css";

export function ProjectForm() {
  return (
    <form onSubmit={(event) => event.preventDefault()}>
      <Field label="Project name" name="projectName" />
      <Button type="submit">Save</Button>
    </form>
  );
}
```

React and React DOM are peer dependencies. The package includes compiled ESM,
TypeScript declarations, styles, font assets and required license notices.

## Outliner

```tsx
import { Outliner, type OutlineItem } from "@samhagman/fast-ux-kit/outliner";

const items: readonly OutlineItem[] = [
  {
    id: "guide",
    text: "Project guide",
    children: [
      { id: "first", text: "Write an outline" },
      { id: "next", text: "Review the details", checked: false },
    ],
  },
];

<Outliner title="Project guide" defaultValue={items} readOnly />;
```

Enable editing explicitly for an authoring surface. Controlled applications use
`value` and `onValueChange`; uncontrolled applications use `defaultValue`.
`OutlinerWorkspace` adds document-library navigation and host persistence seams.
Reader preferences and folding remain separate from document content.

The outliner includes keyboard navigation, title and note editing, search,
commands, undo/redo, document interchange and alternate views. Typed callbacks
connect file storage, version history and application actions.

## Machine tools

`MachineGraphView` from `/machine-graph` provides the state-machine canvas and local
simulation. `MachineTree` from `/machine-tree` provides the hierarchy view. Both
use the portable `MachineDocument` model exported from `/machine`, shared Base UI
controls, supplied-run inspection, pinned history, pending work and optional app
actions. See [canvas](docs/MACHINE_GRAPH.md), [tree](docs/MACHINE_TREE_VIEW.md), and
[inspection contracts](docs/MACHINE_INSPECTION.md). The older machine exports in
`/react` remain available with their original, different APIs.

Use `defaultDocument` for an uncontrolled canvas or `document` with its change
callback for controlled editing. The hierarchy accepts `document`. Host runtime
callbacks provide trusted actions and guards.

The hierarchy draws each container as a flow outline: states top to bottom in the
order the machine moves through them, alternatives side by side. A machine can also
declare regions, named groups of sibling states the tree draws as one box that
starts shut (`region` on a state, optional `regions` on its graph). Regions are for
reading only and never change how the machine runs.

## Package entries

| Entry            | Purpose                                                   |
| ---------------- | --------------------------------------------------------- |
| `/components`    | The 92-family app component catalog                       |
| `/editorial`     | Editorial UI: atoms, molecules and organisms for articles |
| `/editorial.css` | The standalone stylesheet for Editorial UI                |
| `/outliner`      | Outliner, document workspace, types and host seams        |
| `/machine-graph` | State-machine canvas and controller                       |
| `/machine-tree`  | State-machine hierarchy                                   |
| `/core`          | Portable document, search, command and policy functions   |
| `/machine`       | Portable state-machine models and simulation              |
| `/rich`          | Rich-document types and Markdown import                   |
| `/react`         | Reader, editor and text-interaction APIs                  |
| `/styles.css`    | Compiled component and tool styles                        |
| `/tokens.css`    | Token definitions for custom styling                      |

The package root exposes the portable core, rich-document functions and reader
APIs. The tool-specific entries select the new outliner and machine interfaces.

## Editorial UI

`/editorial` is a set of forms for explaining something on a page: an `Article`
with a margin, numbered `Figure`s, `MarginNote`s, a `CodeBlock` with notes beside
the lines that matter, and `Explorable` frames for small working models. It is
organized by scale. Atoms sit inside a sentence, molecules are one block in the
reading column, and organisms shape the page.

```tsx
import {
  Article,
  ArticleBody,
  ArticleHeader,
  Figure,
  MarginNote,
} from "@samhagman/fast-ux-kit/editorial";
import "@samhagman/fast-ux-kit/editorial.css";

<Article>
  <ArticleHeader title="A headline is a sentence." deck="The deck says the rest." />
  <ArticleBody>
    <p>
      Prose stays prose.<MarginNote>Tangents go in the margin.</MarginNote>
    </p>
    <Figure caption="Say what to notice." credit="Illustration.">
      <svg viewBox="0 0 480 220" />
    </Figure>
  </ArticleBody>
</Article>;
```

The entry depends on React alone and the stylesheet is plain CSS, so a static
site can server-render an article without the app layer. Nothing renders a
`style` attribute, which keeps a strict `style-src` policy intact. Theme it with
the `--fux-ed-*` tokens. See [Editorial UI](docs/EDITORIAL.md).

## Component conventions

Components use standard React events and Base UI value callbacks. For example,
`Button` uses `onClick`, `Field` uses `onValueChange`, and selection components
accept their documented value types. The catalog also contains native controls
where a browser element provides the required behavior.

Use the shared CSS variables for theme customization and one focus or overlay
manager for each interactive element. Support keyboard access, logical direction
and reduced motion when composing components. Sizes come from each variant
(`xs` to `xl`); pick the one that fits the layout.

Rich renderers are trusted application code. Enforce storage authorization on the
server and validate imported data before use.

[Component API](docs/COMPONENT_API.md) · [Editorial UI](docs/EDITORIAL.md) · [Coverage](docs/COMPONENT_COVERAGE.md) ·
[Architecture](docs/ARCHITECTURE.md) · [Release checks](docs/RELEASE.md).

## Licensing

Fast UX Kit's original code is available under your choice of PolyForm
Noncommercial 1.0.0 or PolyForm Small Business 1.0.0. The Small Business option
permits commercial use when its company-size and inflation-adjusted revenue
conditions are met. Additional commercial rights are available by agreement.
[License terms](LICENSE.md) · [Request commercial licensing](https://github.com/samhagman/fast-ux-kit/issues/new?title=Commercial%20licensing).

Third-party components, generated shadcn/ui primitives, styles and assets retain
their own licenses. Contributions use the Blue Oak Contributor License 1.0.0.
[Third-party notices](THIRD_PARTY_NOTICES.md) · [Contributing](CONTRIBUTING.md).
