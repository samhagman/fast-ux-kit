import { createRef } from "react";
import { createRoot } from "react-dom/client";
import { OutlineEditor, Outliner, type OutlineEditorHandle } from "../../src/react/index.js";
import type { RichOutlineData } from "../../src/rich/index.js";
import { createReferenceCompletionProvider, type OutlineNode } from "../../src/core/index.js";
import "../../src/styles.css";

const ref = createRef<OutlineEditorHandle>();
const root = createRoot(document.getElementById("root")!);
const notes: readonly OutlineNode[] = [
  {
    id: "notes",
    text: "Field notes",
    children: [
      {
        id: "research",
        text: "Research",
        data: {
          content: {
            schema: "fast-ux-rich",
            version: 1,
            blocks: [
              {
                id: "markdown",
                kind: "markdown",
                source:
                  "## Read without friction\n\nA **rich document** stays in place. Read, select, and follow [a reference](https://example.com) without opening the keyboard.\n\n- [x] Readable typography\n- [ ] Explore the next branch\n\n| Observation | State |\n| --- | --- |\n| Shared tokens | Ready |\n| Editing | Explicit |",
              },
            ],
          },
        },
      },
      {
        id: "details",
        text: "Details",
        children: [
          {
            id: "detail1",
            text: "A nested note with enough text to wrap naturally on a narrow viewport.",
          },
        ],
      },
    ],
  },
  {
    id: "next",
    text: "Next steps",
    children: [{ id: "next1", text: "Keep source data portable and behavior predictable." }],
  },
];
const editable: readonly OutlineNode[] = [
  { id: "a", text: "Alpha" },
  { id: "b", text: "Beta", checked: false },
  { id: "c", text: "Gamma" },
];
let sequence = 0;
const provider = createReferenceCompletionProvider({
  id: "people",
  trigger: "@",
  entities: [
    { id: "alice", spelling: "alice" },
    { id: "albert", spelling: "albert" },
  ],
});
const api = {
  ref,
  show: (mode: "reader" | "editor", nodes = mode === "reader" ? notes : editable) => {
    root.render(
      <main>
        <h1>{mode === "reader" ? "A clearer outline" : "Direct editing"}</h1>
        <p className="intro">
          {mode === "reader"
            ? "Rich notes, calm controls, and room to read."
            : "Text stays text. Structure stays under your control."}
        </p>
        {mode === "reader" ? (
          <Outliner
            key="reader"
            nodes={nodes}
            getRichContent={(node) => (node.data as RichOutlineData | undefined)?.content}
            enableHoist
            aria-label="Field guide"
          />
        ) : (
          <OutlineEditor
            key={`editor-${++sequence}`}
            ref={ref}
            defaultNodes={nodes}
            readOnly={false}
            createId={() => `generated-${++sequence}`}
            completionProviders={[provider]}
            hoverProviders={[
              {
                id: "info",
                hover: ({ text }) => ({
                  range: { start: 0, end: text.length },
                  content: (
                    <>
                      <strong>Contextual information</strong>
                      <p>
                        Host-owned details with an <a href="#source">interactive reference</a>.
                      </p>
                    </>
                  ),
                }),
              },
            ]}
          />
        )}
      </main>,
    );
  },
};
Object.assign(window, { outlineSmoke: api });
api.show("reader");
