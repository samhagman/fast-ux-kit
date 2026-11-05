# Studio and component gallery

The Studio is the local documentation and demonstration app in `studio/`. It
contains a searchable gallery for all 86 component families plus the outliner,
state-machine canvas and machine hierarchy views.

## Run locally

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

The development server uses `http://127.0.0.1:5180`. Open `#/components`,
`#/outliner`, `#/machine-view` or `#/machine-tree` to select a surface.

```sh
npm run docs:build
npm --prefix studio run preview
```

The static build is written to `studio/dist/`. The preview server uses
`http://127.0.0.1:5181`.

## Gallery behavior

Search filters by family name, category and description. Selecting a family
shows a real component example, interaction instructions and its package import.
Only the selected example is mounted. Switching examples resets their temporary
state and closes their overlays.

`studio/src/pages/components-page.tsx` defines the shared fixture map used by the
gallery and `tests/components-catalog.test.tsx`. Each canonical manifest entry
must have a corresponding fixture. The tests exercise accessible output and
applicable state changes.

The examples use synthetic documents and local state. File selection, clipboard,
download and media actions are initiated explicitly. Outliner preferences may be
stored in browser local storage. The Studio is separate from an application's
cloud database and authentication.

## Static publication

Publish the complete static build so JavaScript, CSS, fonts and media stay
consistent. Include the project's license and required third-party notices in
the published distribution. Keep ELK's source-availability information with its
license notice.

Choose the intended audience and access policy before deployment. A personal
notebook application requires server-side authentication, authorization and
durable storage in its own project.
