# Fast UX Studio

Studio is a consumer of the built `@samhagman/fast-ux-kit` package. It contains
synthetic fixtures, application layout, fonts and theme choices. Reusable
components and tools live in the library's `src/` directory.

From the repository root, install the workspace and build the library before
starting Studio.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

The local URL is `http://127.0.0.1:5180`. The four routes cover the component
catalog, outliner workspace, machine canvas and machine tree. Their source
imports use the package's public entry points. Unit tests use the canonical
library source through the Vite test loader.

```sh
npm --prefix studio run typecheck
npm --prefix studio test
npm --prefix studio run build
```

The production output is `studio/dist/`. Local page state and fixture changes
stay in the demo. They are separate from the npm package and personal notebook.
