import { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Outliner, OutlineEditor, RichContent } from "../../src/react/index.js";
import { Button, Field, Checkbox, Pagination, ModalDialog } from "../../src/components/index.js";
import "../../src/components.css";
import "../../src/styles.css";
import "./app.css";
import { importMarkdownDocument, type RichDocument } from "../../src/rich/index.js";

function MotionExample({ reducedMotion }: { reducedMotion: boolean }) {
  const [running, setRunning] = useState(false);
  return (
    <div>
      <p>A trusted React animation, not imported executable code.</p>
      <Button onPress={() => setRunning(!running)}>{running ? "Pause" : "Play"} animation</Button>
      <div className="motion-track">
        <span data-running={running && !reducedMotion}>●</span>
      </div>
      {reducedMotion && <p>Animation is paused for reduced motion.</p>}
    </div>
  );
}
const richDocument: RichDocument = {
  schema: "fast-ux-rich",
  version: 1,
  blocks: [
    {
      id: "readme",
      kind: "markdown",
      source:
        '# Readable rich content\n\n**Markdown** stays readable, including [links](https://example.com).\n\n- [x] Read content\n- [ ] Try the editor deliberately\n\n| Mode | Result |\n| --- | --- |\n| Reader | No keyboard popup |\n\n```js\nconst content = \"safe by default\";\n```',
    },
    {
      id: "flow",
      kind: "diagram",
      renderer: "flow",
      label: "Simple flow",
      source: "Read → Explore → Create",
    },
    { id: "motion", kind: "react", renderer: "motion", label: "Animation example" },
    {
      id: "unknown",
      kind: "future-block",
      label: "Preserved future data",
      payload: { version: 2 },
    },
  ],
};

function App() {
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [dark]);
  const [page, setPage] = useState(1);
  const [title, setTitle] = useState("A useful outline");
  return (
    <main data-theme={dark ? "dark" : "light"}>
      <header>
        <p className="eyebrow">FAST UX KIT · LOCAL INTEGRATION CHECK</p>
        <h1>One layer. Two behavior libraries.</h1>
        <p>
          A working consumer fixture for shared controls and the in-place outline. No remote data.
        </p>
        <Button onPress={() => setDark(!dark)}>Use {dark ? "light" : "dark"} palette</Button>
      </header>
      <section aria-label="Shared controls" className="controls">
        <Field
          label="Outline title"
          value={title}
          onChange={setTitle}
          hint="A React Aria field with the shared tokens."
        />
        <Checkbox label="Keep reading mode" defaultSelected />
        <Pagination
          label="Example pages"
          count={36}
          pageSize={12}
          page={page}
          onPageChange={setPage}
        />
        <p aria-live="polite">Page {page} of 3</p>
        <Button onPress={() => setOpen(true)}>Review controls</Button>
        <ModalDialog title="Shared modal" isOpen={open} onOpenChange={setOpen}>
          <p>Focus, dismissal and portal behavior are owned by React Aria.</p>
          <Field label="Modal title" />
        </ModalDialog>
      </section>
      <section aria-label="Outline example">
        <h2>{title || "Untitled"}</h2>
        <Outliner<{ rich?: boolean }>
          nodes={[
            {
              id: "start",
              text: "Start with content",
              children: [
                { id: "plain", text: "A clear sentence, without opening an editor." },
                {
                  id: "rich",
                  text: "Rich content",
                  data: { rich: true },
                  children: [{ id: "deeper", text: "Nested details remain in place." }],
                },
              ],
            },
            {
              id: "next",
              text: "Keep app-specific behavior outside the library",
              children: [
                {
                  id: "safe",
                  text: "No credentials, hardware calls, deployment or product state.",
                },
              ],
            },
          ]}
          aria-label="Example outline"
          renderContent={(node) =>
            node.data?.rich ? (
              <>
                <strong>Rich content stays readable.</strong>
                <p>
                  This row contains an ordinary <a href="#details">link</a> and a small code
                  example.
                </p>
                <pre>
                  <code>const reader = 'content first';</code>
                </pre>
              </>
            ) : (
              node.text
            )
          }
        />
      </section>
      <section aria-label="Rich content example">
        <h2>Document blocks</h2>
        <RichContent
          document={richDocument}
          registry={{
            diagrams: {
              flow: ({ block }) => (
                <div role="img" aria-label={block.label} className="flow">
                  {block.source}
                </div>
              ),
            },
            react: {
              motion: ({ reducedMotion }) => <MotionExample reducedMotion={reducedMotion} />,
            },
          }}
        />
      </section>
      <section aria-label="Editor example">
        <h2>Explicit editing</h2>
        <Checkbox label="Enable editing" isSelected={editing} onChange={setEditing} />
        <OutlineEditor
          readOnly={!editing}
          defaultNodes={[
            {
              id: "edit-a",
              text: "Press Enter to split this row",
              children: [{ id: "edit-b", text: "Indent, outdent, move and undo" }],
            },
            { id: "edit-c", text: "A task", checked: false },
          ]}
        />
      </section>
      <footer id="details">
        This fixture runs locally and does not publish or persist documents.
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
