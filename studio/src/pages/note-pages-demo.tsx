import * as React from "react";
import {
  Outliner,
  NotePageView,
  createNotePageRegistry,
  defineNotePageExtension,
  type NotePage,
  type NotePageType,
  type OutlineItem,
} from "@samhagman/fast-ux-kit/outliner";
import { validateOutline } from "@samhagman/fast-ux-kit/core";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import "./note-pages-demo.css";

type OutlineData = { nodes: readonly OutlineItem[] };
const outline: NotePageType<OutlineData> = {
  type: "example.outline",
  label: "Outline",
  version: 1,
  create: () => ({
    nodes: [
      {
        id: "idea",
        text: "A notebook, many kinds of pages",
        children: [
          { id: "outline", text: "Write with the existing outliner" },
          { id: "drawing", text: "Switch to a custom sketch editor" },
          { id: "portable", text: "Keep each page as portable, versioned JSON" },
        ],
      },
    ],
  }),
  validate: (value): value is OutlineData =>
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as OutlineData).nodes) &&
    validateOutline((value as OutlineData).nodes).length === 0,
};
type SketchData = { dots: readonly { x: number; y: number }[] };
const sketch: NotePageType<SketchData> = {
  type: "example.sketch",
  label: "Sketch",
  version: 1,
  create: () => ({
    dots: [
      { x: 140, y: 110 },
      { x: 300, y: 190 },
      { x: 460, y: 100 },
    ],
  }),
  validate: (value): value is SketchData =>
    !!value &&
    typeof value === "object" &&
    Array.isArray((value as SketchData).dots) &&
    (value as SketchData).dots.every(
      (dot) =>
        Number.isFinite(dot?.x) &&
        Number.isFinite(dot?.y) &&
        dot.x >= 0 &&
        dot.x <= 600 &&
        dot.y >= 0 &&
        dot.y <= 300,
    ),
};
const registry = createNotePageRegistry([outline, sketch]);
const extensions = [
  defineNotePageExtension(outline, ({ data, onChange, readOnly }) => (
    <Outliner
      title="Ideas"
      value={data.nodes}
      onValueChange={(nodes) => onChange({ nodes })}
      readOnly={readOnly}
    />
  )),
  defineNotePageExtension(sketch, ({ data, onChange, readOnly }) => (
    <div className="note-pages-sketch">
      <div className="note-pages-sketch-heading">
        <div>
          <h2>Connect the dots</h2>
          <p>A tiny custom editor, registered without changing the notebook.</p>
        </div>
        <Button
          disabled={readOnly}
          onClick={() =>
            onChange({
              dots: [
                ...data.dots,
                {
                  x: 80 + ((data.dots.length * 97) % 440),
                  y: 80 + ((data.dots.length * 41) % 160),
                },
              ],
            })
          }
        >
          Add a dot
        </Button>
      </div>
      <svg viewBox="0 0 600 300" role="img" aria-label={`Sketch with ${data.dots.length} dots`}>
        <defs>
          <pattern id="note-page-grid" width="20" height="20" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="currentColor" opacity=".15" />
          </pattern>
        </defs>
        <rect width="600" height="300" fill="url(#note-page-grid)" />
        <polyline
          points={data.dots.map((dot) => `${dot.x},${dot.y}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeDasharray="5 5"
          opacity=".3"
        />
        {data.dots.map((dot, index) => (
          <g key={index}>
            <circle
              cx={dot.x}
              cy={dot.y}
              r="22"
              fill="var(--background)"
              stroke="currentColor"
              strokeWidth="2"
            />
            <text x={dot.x} y={dot.y + 5} textAnchor="middle" fill="currentColor" fontSize="14">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <p className="note-pages-caption">
        {data.dots.length} dots · Changes stay with this page when you switch editors.
      </p>
    </div>
  )),
];
const initial: readonly NotePage[] = [
  registry.create(outline.type, "ideas"),
  registry.create(sketch.type, "sketch"),
  {
    id: "unavailable",
    type: "example.uninstalled",
    version: 1,
    data: { message: "Keep this original payload" },
  },
];
const names: Record<string, string> = {
  ideas: "Ideas",
  sketch: "Sketch",
  unavailable: "Missing editor",
};

/** In-memory demo: no remote access, credentials or storage. Reload restores synthetic fixtures. */
export function NotePagesDemo() {
  const [pages, setPages] = React.useState(initial);
  const [active, setActive] = React.useState("ideas");
  const [readOnly, setReadOnly] = React.useState(false);
  const [changes, setChanges] = React.useState(0);
  const page = pages.find((item) => item.id === active)!;
  return (
    <div className="note-pages-demo">
      <header className="note-pages-header">
        <div>
          <p className="note-pages-eyebrow">OUTLINER / EXTENSIONS</p>
          <h1>One notebook. Any page type.</h1>
          <p>Trusted editors. Portable data. Your storage.</p>
        </div>
        <Button
          variant="outline"
          aria-pressed={readOnly}
          onClick={() => setReadOnly((value) => !value)}
        >
          {readOnly ? "Read-only on" : "Read-only off"}
        </Button>
      </header>
      <nav className="note-pages-tabs" aria-label="Demo pages">
        {pages.map((item) => (
          <Button
            key={item.id}
            variant={item.id === active ? "secondary" : "ghost"}
            aria-pressed={item.id === active}
            onClick={() => setActive(item.id)}
          >
            {names[item.id]}
          </Button>
        ))}
      </nav>
      <section className="note-pages-editor" aria-label="Selected page">
        <NotePageView
          page={page}
          extensions={extensions}
          readOnly={readOnly}
          onChange={(next) => {
            setPages((all) => all.map((item) => (item.id === next.id ? next : item)));
            setChanges((value) => value + 1);
          }}
        />
      </section>
      <footer className="note-pages-footer">
        <span>
          {page.type} · schema v{page.version}
        </span>
        <span role="status">{changes} changes · In-memory demo</span>
      </footer>
    </div>
  );
}
