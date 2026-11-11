# Studio and component gallery

The Studio is the local documentation and demonstration app in `studio/`. It
has three catalog sections plus the outliner, state-machine canvas and machine
hierarchy views.

| Section        | What it holds                                                                                             |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| Foundations    | Type, colour, space and motion tokens shared by both component sets                                       |
| App Components | A searchable gallery of the 92 families for building applications                                         |
| Editorial UI   | 35 forms for explaining on a page, by atom, molecule and organism, and one sample article built from them |

The overview introduces the kit and links to each live tool. The shared shell
uses the same quiet surfaces, compact type and focus treatment as the outliner,
with light, dark and system appearance options. The version comes from the kit's
package metadata. Tool and editor code remains behind lazy route boundaries.
The package stylesheet loads before Studio's own Tailwind utilities so the
gallery's responsive overrides take precedence over packaged utilities.

## Run locally

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run build
npm run dev
```

The development server uses `http://127.0.0.1:5180`. Open `#/components`,
`#/outliner`, `#/machine-graph` or `#/machine-tree` to select a surface.
The root and `#/overview` open the overview. Earlier `#/machine-view`,
`#machine-tree-view` and outliner lab bookmarks continue to open their tool.

```sh
npm run docs:build
npm --prefix studio run preview
```

The static build is written to `studio/dist/`. The preview server uses
`http://127.0.0.1:5181`.

## Gallery behavior

`#/components` is one scrolling page of every family: a card per family with its
live demo, grouped by category. Category tabs and a family index follow the
scroll and jump to what they name, and `#/components/<Family>` links straight to
a card. Search filters the cards and the index together. Each demo mounts as its
card nears the view (or at once when jumped to).

Each family's demo lives in `studio/src/pages/components-gallery/`, one file per
area, and `studio/src/pages/components-page.tsx` gathers them into the fixture
map used by the gallery and `tests/components-catalog.test.tsx`. Each canonical
manifest entry must have a corresponding fixture. The tests exercise accessible
output and applicable state changes.

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
