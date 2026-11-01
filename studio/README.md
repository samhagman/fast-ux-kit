# Fast UX Studio

The shadcn/ui rebuild of three Fast UX components, built as copy-and-own registry
items (copy-and-own, like other shadcn registries) on top of the portable, framework-free core in
`../src/core`.

| Component | Registry folder | Built on |
| --- | --- | --- |
| Outliner | `src/registry/outliner/` | core editor reducer, search, sort, tags · shadcn menus/command/popover/calendar · motion · TanStack Virtual |
| Machine View | `src/registry/machine-view/` | core machine model/commands/runtime · React Flow (`@xyflow/react`) · ELK layout |
| Machine Tree | `src/registry/machine-tree/` | core `buildMachineTree` · shared simulation hook |

```
studio/src
├── index.css                 theme tokens: shadcn structure, flat state layers, one signal color
├── lib/motion.ts             one motion vocabulary (quick / base / layout spring), no bounce
├── components/ui/            shadcn primitives (radix-nova), owned and editable
├── registry/
│   ├── outliner/             use-outliner (controller) · outliner (rows, editing, drag, virtual list)
│   │                         outliner-chrome (menus, bulk bar, phone bar, palette, shortcuts, dates)
│   │                         autocomplete (# @ [[ ! /) · inline (markup projection) · interchange (MD/OPML)
│   ├── machine-view/         use-machine-view (history, modes) · layout (ELK adapter) · canvas · inspector
│   ├── machine-tree/         nested-block hierarchy, side panel, run controls
│   └── machine-shared/       use-machine-simulation (shared by both machine components)
├── demo/                     original synthetic fixtures
└── pages/                    one page per component
```

## Seams

- **Core ⇄ component.** Components never mutate documents directly: the outliner
  dispatches `OutlineAction`s into `reduceOutlineEditor`; machine components run
  `MachineCommand`s through `applyMachineCommand` and keep bounded history.
- **ELK ⇄ canvas.** `machine-view/layout.ts` is the only file that knows ELK. It returns
  absolute boxes and orthogonal edge routes with label boxes.
- **Simulation.** Explicit and local. Guards and actions resolve only through the host's
  `runtime` map; no document string is executed.
- **Outliner ⇄ host app.** Sharing and permissions, offline sync, version history, file
  attachments and integrations plug in through typed props, callbacks and the `ref` handle.
  See [`src/registry/outliner/SEAMS.md`](src/registry/outliner/SEAMS.md).

## Run

```bash
npm --prefix studio install
npm --prefix studio run dev        # http://127.0.0.1:5180
npm --prefix studio run build && npm --prefix studio run preview   # production, :5181
```

Useful URLs: `/?sample=large#/outliner` (2,740-item stress document), `?zoom=<id>`,
`/?machine=launch|release|incident|support#/machine-view`, `/?machine=…#/machine-tree`.
