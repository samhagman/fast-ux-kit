import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Checkbox, ModalDialog, Row, Stack } from "../../src/components/aria.js";
import {
  OutlineEditor,
  RichContent,
  HighlightText,
  type OutlineEditorHandle,
  type RichRendererRegistry,
} from "../../src/react/index.js";
import {
  createReferenceCompletionProvider,
  createOutlineJSONCodec,
  serializeOutlineText,
  parseOutlineText,
  recognizeTextReferences,
  getOutlinePath,
  type OutlineNode,
  type OutlineCodec,
  type TextCompletionProvider,
  type TextHoverProvider,
} from "../../src/core/index.js";
import { type RichDocument } from "../../src/rich/index.js";
import { Code, DemoFrame, Notice, PageHeading, type ComponentDemo } from "./ui.js";
import { demoEnvelopeCodec, extensionDemo } from "./extensions.js";
import { experiencePages } from "./catalog.js";
import { ReaderDemo } from "./reader-demo.js";

const initialEditorNodes: readonly OutlineNode[] = [
  {
    id: "plan",
    text: "A plan with room to grow",
    children: [
      { id: "first", text: "Start here: put your cursor in this sentence" },
      { id: "second", text: "Press Enter to split. Tab to nest. Escape to select." },
    ],
  },
  { id: "task", text: "Try completing this task", checked: false },
  { id: "reference", text: "A protected reference row" },
];
const canonicalCodec = createOutlineJSONCodec();
const readableCodec: OutlineCodec = {
  id: "readable-outline",
  mimeType: "text/plain",
  encode: (nodes) => serializeOutlineText(nodes),
  decode: (source) => parseOutlineText(source),
};
const importCodecs = { json: canonicalCodec, text: readableCodec, envelope: demoEnvelopeCodec };

export function EditorDemo() {
  const editor = useRef<OutlineEditorHandle>(null);
  const [editing, setEditing] = useState(false);
  const [protect, setProtect] = useState(true);
  const [exported, setExported] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<keyof typeof importCodecs>("json");
  const [importError, setImportError] = useState("");
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState(0);
  const [version, setVersion] = useState(0);
  const [hasReference, setHasReference] = useState(true);
  const [lastMessage, setLastMessage] = useState("No local document changes.");
  function applyImport() {
    if (!editing) return;
    try {
      editor.current?.importWith(importCodecs[importFormat], importText);
      if (editor.current?.getState().refusal) {
        setImportError(
          "The current document policy refused this replacement. Turn off “Protect reference row” before replacing this sample.",
        );
        return;
      }
      setImportOpen(false);
      setImportError("");
      setImportText("");
    } catch (error) {
      setImportError(
        error instanceof Error ? error.message : "This document could not be imported.",
      );
    }
  }
  return (
    <div className="editor-playground">
      <div className="editor-mode">
        <div>
          <strong>{editing ? "Local editing is on" : "Read first. Edit when you choose."}</strong>
          <p>No account, network or persistent storage is used.</p>
        </div>
        <Checkbox label="Enable editing in this demo" isSelected={editing} onChange={setEditing} />
      </div>
      <div className="playground-controls">
        <Row wrap>
          <Button
            variant="quiet"
            onPress={() =>
              editor.current?.dispatch({ type: "expand-all", expanded: true, depth: 1 })
            }
          >
            Show one level
          </Button>
          <Button
            variant="quiet"
            onPress={() => {
              setVersion(version + 1);
              setRevision(0);
              setSelected(0);
              setHasReference(true);
              setLastMessage("Example reset. No data was saved.");
            }}
          >
            Reset document
          </Button>
          <Checkbox label="Protect reference row" isSelected={protect} onChange={setProtect} />
          <Button
            variant="quiet"
            isDisabled={!hasReference}
            onPress={() => editor.current?.reveal("reference")}
          >
            Reveal reference
          </Button>
        </Row>
      </div>
      {editing && (
        <div className="selection-actions" role="group" aria-label="Selected rows">
          <span>{selected} selected</span>
          <Button variant="quiet" onPress={() => editor.current?.dispatch({ type: "select-all" })}>
            Select all rows
          </Button>
          <Button
            variant="quiet"
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "clear-selection" })}
          >
            Clear selection
          </Button>
          <Button
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "indent" })}
          >
            Indent selected
          </Button>
          <Button
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "outdent" })}
          >
            Outdent selected
          </Button>
          <Button
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "move", direction: "up" })}
          >
            Move selected up
          </Button>
          <Button
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "move", direction: "down" })}
          >
            Move selected down
          </Button>
          <Button
            isDisabled={!selected}
            onPress={() =>
              editor.current?.dispatch({
                type: "tasks",
                ids: [...(editor.current?.getState().selection ?? [])],
              })
            }
          >
            Toggle selected tasks
          </Button>
          <Button
            variant="danger"
            isDisabled={!selected}
            onPress={() => editor.current?.dispatch({ type: "delete" })}
          >
            Delete selected
          </Button>
        </div>
      )}
      <div className="editor-demo">
        <OutlineEditor
          key={version}
          ref={editor}
          readOnly={!editing}
          defaultNodes={initialEditorNodes}
          isLocked={(node) => protect && node.id === "reference"}
          aria-label="Documentation outline editor"
          onStateChange={(state, action) => {
            setRevision(state.revision);
            setSelected(state.selection.size);
            setHasReference(getOutlinePath(state.nodes, "reference").length > 0);
            if (state.refusal) setLastMessage(`Action refused: ${state.refusal}.`);
            else if (!["caret", "focus", "select", "clear-selection"].includes(action.type))
              setLastMessage(`Last action: ${action.type}.`);
          }}
        />
      </div>
      <div className="editor-status">
        <span>Content revision {revision}</span>
        <span>{selected} selected</span>
        <span role="status">{lastMessage}</span>
      </div>
      <details className="keyboard-guide">
        <summary>Keyboard shortcuts & interaction guide</summary>
        <div className="shortcut-grid">
          {[
            ["Enter", "Split / insert a row"],
            ["Shift + Enter", "Insert a line break"],
            ["Tab / Shift + Tab", "Indent / outdent"],
            ["⌘ / Ctrl + Enter", "Toggle a task"],
            ["⌘ / Ctrl + Z", "Undo content change"],
            ["⌘ / Ctrl + Shift + Z", "Redo content change"],
            ["Escape, then arrows", "Select and navigate rows"],
            ["Shift + ↑ / ↓", "Extend row selection"],
            ["Alt + Shift + ↑ / ↓", "Move selected rows"],
            ["⌘ / Ctrl + C / X / V", "Structural copy, cut and paste"],
            ["Alt + disclosure", "Fold a whole branch"],
            ["Drag handle", "Reorder with an insertion preview"],
          ].map(([key, description]) => (
            <div key={key}>
              <kbd>{key}</kbd>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </details>
      <section className="document-interchange" aria-label="Document interchange">
        <div>
          <strong>Take the document with you.</strong>
          <p>Source stays out of the reading flow. Open a local export when you need it.</p>
        </div>
        <Row wrap>
          <Button onPress={() => setExported(editor.current?.exportWith(canonicalCodec) ?? "")}>
            Export JSON
          </Button>
          <Button
            variant="quiet"
            onPress={() => setExported(editor.current?.exportWith(readableCodec) ?? "")}
          >
            Export text
          </Button>
          <Button
            variant="quiet"
            onPress={() => setExported(editor.current?.exportWith(demoEnvelopeCodec) ?? "")}
          >
            Export custom codec
          </Button>
          <Button isDisabled={!editing} onPress={() => setImportOpen(true)}>
            Import document
          </Button>
        </Row>
      </section>
      <ModalDialog
        title="Export this local document"
        isOpen={exported !== null}
        onOpenChange={(open) => {
          if (!open) setExported(null);
        }}
      >
        <p>
          JSON preserves identity, hierarchy and metadata. Readable text is an interchange format,
          not lossless storage.
        </p>
        <Code title="Document export">{exported ?? ""}</Code>
      </ModalDialog>
      <ModalDialog
        title="Import a local document"
        isOpen={importOpen}
        onOpenChange={setImportOpen}
        footer={
          <Row justify="end">
            <Button variant="quiet" onPress={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              isDisabled={!editing || !importText.trim()}
              onPress={applyImport}
            >
              Replace demo document
            </Button>
          </Row>
        }
      >
        <Stack>
          <label className="docs-field">
            <span>Format</span>
            <select
              value={importFormat}
              onChange={(event) => {
                setImportFormat(event.target.value as keyof typeof importCodecs);
                setImportError("");
              }}
            >
              <option value="json">Canonical outline JSON</option>
              <option value="text">Indented outline text</option>
              <option value="envelope">Custom lossless envelope</option>
            </select>
          </label>
          <label className="docs-field">
            <span>Document to import</span>
            <textarea
              value={importText}
              onChange={(event) => {
                setImportText(event.target.value);
                setImportError("");
              }}
              rows={8}
              spellCheck={false}
              placeholder={
                importFormat === "json"
                  ? "Paste a canonical JSON export"
                  : importFormat === "envelope"
                    ? "Paste a custom codec export"
                    : "A new idea\n  A detail underneath"
              }
            />
          </label>
          {importError && (
            <p className="docs-error" role="alert">
              {importError}
            </p>
          )}
          <Notice>
            Replacement is policy-gated and undoable. When “Protect reference row” is enabled,
            replacing the full document is intentionally refused.
          </Notice>
        </Stack>
      </ModalDialog>
    </div>
  );
}

const referenceEntities = [
  {
    id: "design",
    spelling: "design",
    label: "design",
    description: "Patterns, tokens and interaction decisions",
  },
  {
    id: "research",
    spelling: "research",
    label: "research",
    description: "Questions, notes and useful evidence",
  },
  {
    id: "release",
    spelling: "release",
    label: "release",
    description: "A small, deliberate shipping checklist",
  },
];
const referenceProvider = createReferenceCompletionProvider({
  id: "demo-references",
  trigger: "@",
  entities: referenceEntities,
});
const hoverProvider: TextHoverProvider<ReactNode> = {
  id: "demo-information",
  hover: ({ text, offset }) => {
    const token = recognizeTextReferences(text).find(
      (item) => item.start <= offset && offset <= item.end,
    );
    if (!token) return null;
    const entity = referenceEntities.find((item) => item.spelling === token.spelling);
    return {
      range: token,
      content: (
        <div>
          <strong>{entity?.label ?? token.spelling}</strong>
          <p>{entity?.description ?? "A local reference token."}</p>
          <a href="#highlight-text">Explore source-coordinate highlights →</a>
        </div>
      ),
    };
  },
};

function IntelligenceDemo() {
  const [editing, setEditing] = useState(false);
  const [delayed, setDelayed] = useState(false),
    [unavailable, setUnavailable] = useState(false),
    [version, setVersion] = useState(0);
  const editor = useRef<OutlineEditorHandle>(null);
  const provider = useMemo<TextCompletionProvider>(
    () => ({
      ...referenceProvider,
      id: "demo-simulated-provider",
      async complete(request) {
        if (delayed)
          await new Promise<void>((resolve) => {
            const finish = () => {
              clearTimeout(timer);
              request.signal.removeEventListener("abort", finish);
              resolve();
            };
            const timer = setTimeout(finish, 1500);
            request.signal.addEventListener("abort", finish, { once: true });
            if (request.signal.aborted) finish();
          });
        if (request.signal.aborted) return null;
        if (unavailable) throw new Error("Simulated local provider unavailable");
        return referenceProvider.complete(request);
      },
    }),
    [delayed, unavailable],
  );
  return (
    <Stack>
      <Checkbox
        label="Enable the text intelligence playground"
        isSelected={editing}
        onChange={setEditing}
      />
      <div className="provider-controls" role="group" aria-label="Provider scenarios">
        <Checkbox
          label="Delay suggestions by 1.5 seconds"
          isSelected={delayed}
          onChange={setDelayed}
        />
        <Checkbox
          label="Simulate unavailable suggestions"
          isSelected={unavailable}
          onChange={setUnavailable}
        />
        <Row wrap>
          <Button
            isDisabled={!editing}
            onPress={() =>
              editor.current?.dispatch({
                type: "text",
                id: "new-mention",
                text: "TODO: Ask @research for the next useful detail",
                caret: 4,
              })
            }
          >
            Try a diagnostic
          </Button>
          <Button variant="quiet" onPress={() => setVersion(version + 1)}>
            Reset text examples
          </Button>
        </Row>
        <p className="fux-hint">
          All scenarios are simulated locally. With delay enabled, type @ and press Escape before
          the result arrives to try cancellation.
        </p>
      </div>
      <OutlineEditor
        key={version}
        ref={editor}
        readOnly={!editing}
        defaultNodes={[
          { id: "mention", text: "Bring @design into the conversation" },
          { id: "new-mention", text: "Type @ to explore local suggestions" },
        ]}
        completionProviders={[provider]}
        hoverProviders={[hoverProvider]}
        getTextAnalysis={(node) => ({
          text: node.text,
          classifications: recognizeTextReferences(node.text).map((token) => ({
            ...token,
            kind: "reference",
          })),
          diagnostics: node.text.includes("TODO")
            ? [
                {
                  start: node.text.indexOf("TODO"),
                  end: node.text.indexOf("TODO") + 4,
                  severity: "information",
                  message: "This note is waiting for a next step.",
                },
              ]
            : [],
        })}
      />
      <p className="demo-status">
        Type @ and choose a suggestion with ↑ / ↓, then Enter. Ctrl + Space requests suggestions;
        Alt + F1 opens token information. Escape dismisses the popup before changing editor mode.
      </p>
    </Stack>
  );
}

function MotionSample({ reducedMotion }: { reducedMotion: boolean }) {
  const [running, setRunning] = useState(false);
  return (
    <div className="motion-sample">
      <div className="motion-track" data-running={running && !reducedMotion}>
        <span />
      </div>
      <Row wrap>
        <Button onPress={() => setRunning(!running)}>
          {running ? "Pause motion" : "Start motion"}
        </Button>
        <span>
          {reducedMotion
            ? "Reduced motion preference respected"
            : "Trusted application React · local state"}
        </span>
      </Row>
    </div>
  );
}
const richRegistry: RichRendererRegistry = {
  diagrams: {
    process: ({ block }) => (
      <figure className="process-diagram" aria-label={block.label}>
        <div>
          {block.source.split(" → ").map((stage, index) => (
            <span key={stage}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              {stage}
            </span>
          ))}
        </div>
        <figcaption>{block.label}</figcaption>
      </figure>
    ),
  },
  react: { motion: ({ reducedMotion }) => <MotionSample reducedMotion={reducedMotion} /> },
};
const richSamples: Record<string, RichDocument> = {
  Markdown: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "markdown",
        kind: "markdown",
        source:
          "### Keep the important part readable\n\nA document can hold **ideas**, *details*, `code`, and [ordinary links](#outline). All in one quiet reading surface.\n\n> Good structure makes room for curiosity.\n\n- [x] Preserve the original source\n- [x] Keep HTML and scripts inert\n- [ ] Bring your own next idea\n\n| Content | Behavior |\n| --- | --- |\n| Tables | Semantic, horizontally scrollable |\n| Code | Whitespace preserved |\n| Tasks | Read-only; source edits require an explicit host transaction |\n\n```ts\nconst reader = { document, expandedIds };\n```\n\nA footnote can stay close to the text.[^note]\n\n[^note]: The original Markdown source remains available for export.",
      },
    ],
  },
  Image: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "image",
        kind: "image",
        src: "./assets/field-study.svg",
        alt: "An abstract green landscape with an orange sun and layered rolling hills",
        caption:
          "A local vector field study. Descriptive alt text, bounded width, no third-party request.",
      },
    ],
  },
  Drawing: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "drawing",
        kind: "drawing",
        label: "Layout sketch with a sidebar, content column and inspector",
        snapshot: "./assets/layout-study.svg",
        data: { format: "layout-study", version: 1 },
      },
    ],
  },
  Diagram: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "diagram",
        kind: "diagram",
        renderer: "process",
        source: "Observe → Shape → Try → Refine",
        label: "A small design loop, rendered by an application-registered component",
      },
    ],
  },
  Video: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "video",
        kind: "video",
        src: "./assets/motion-study.mp4",
        poster: "./assets/field-study.svg",
        label: "A four-second local motion study",
        transcript:
          "A soft green shape moves across a neutral field. This silent synthetic study demonstrates native video controls.",
        tracks: [
          { src: "./assets/motion-study.vtt", language: "en", label: "English description" },
        ],
      },
    ],
  },
  Audio: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "audio",
        kind: "audio",
        src: "./assets/quiet-chime.wav",
        label: "A short locally generated chime",
        transcript: "Three soft rising notes, followed by silence. There is no spoken content.",
      },
    ],
  },
  Bookmark: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "bookmark",
        kind: "link",
        href: "#accessibility",
        label: "Build for the person using it",
        description: "Keyboard, focus, reading order and narrow-screen principles.",
      },
    ],
  },
  React: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "react",
        kind: "react",
        renderer: "motion",
        label: "A trusted interactive motion study",
        props: { variant: "gentle" },
      },
    ],
  },
  Callout: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "callout",
        kind: "callout",
        label: "A detail worth keeping close",
        blocks: [
          {
            id: "callout-copy",
            kind: "markdown",
            source:
              "Nested content stays in the document flow. **No extra editor**, no card-per-node layout, and no hidden execution.",
          },
          {
            id: "callout-link",
            kind: "link",
            href: "#outline",
            label: "Return to the outline reader",
          },
        ],
      },
    ],
  },
  Fallback: {
    schema: "fast-ux-rich",
    version: 1,
    blocks: [
      {
        id: "unknown",
        kind: "future-content",
        label: "Preserved future content",
        payload: { note: "Unknown data survives canonical serialization." },
      },
      {
        id: "remote",
        kind: "image",
        src: "https://example.invalid/remote-image.png",
        alt: "An intentionally disallowed remote image",
      },
    ],
  },
};
const mixedRichDocument: RichDocument = {
  schema: "fast-ux-rich",
  version: 1,
  blocks: [
    ...richSamples.Markdown!.blocks,
    ...richSamples.Image!.blocks,
    ...richSamples.Callout!.blocks,
    {
      id: "mixed-rtl",
      kind: "markdown",
      source:
        "### Keep every language readable\n\nA mixed document can include العربية, עברית, 日本語 and emoji 👩🏽‍💻 without rewriting the underlying source.\n\nA deliberately long line stays inside its own code surface:\n\n```text\nnotes/research/interaction/keyboard/focus/selection/policy/validation/serialization/documentation/quality/release\n```",
    },
    ...richSamples.Diagram!.blocks,
    ...richSamples.Drawing!.blocks,
    ...richSamples.Video!.blocks,
    ...richSamples.Audio!.blocks,
    ...richSamples.React!.blocks,
    ...richSamples.Bookmark!.blocks,
    ...richSamples.Fallback!.blocks,
  ],
};
const visibleRichSamples: Record<string, RichDocument> = {
  "Mixed document": mixedRichDocument,
  ...richSamples,
};
function RichDemo() {
  const [selected, setSelected] = useState("Mixed document");
  return (
    <div className="rich-playground">
      <div className="sample-picker" aria-label="Rich content type">
        {Object.keys(visibleRichSamples).map((name) => (
          <Button
            key={name}
            variant="quiet"
            aria-pressed={selected === name}
            onPress={() => setSelected(name)}
          >
            {name}
          </Button>
        ))}
      </div>
      <div className="rich-sample">
        <RichContent
          key={selected}
          document={visibleRichSamples[selected]!}
          registry={richRegistry}
          allowMedia={(url) => url.startsWith("./assets/")}
        />
      </div>
      <p className="demo-status">
        Only local example assets are allowed. Remote media is denied, and unknown content remains
        visible as a safe fallback.
      </p>
    </div>
  );
}

function HighlightsDemo() {
  const [selected, setSelected] = useState<string | null>(null);
  const text = "Good interaction keeps the important details within reach.";
  return (
    <Stack>
      <p className="highlight-sentence">
        <HighlightText
          text={text}
          highlights={[
            { key: "interaction", start: 5, end: 16, label: "Interaction detail" },
            { key: "important", start: 27, end: 44, label: "Important details" },
          ]}
          selectedKey={selected}
          onActivate={setSelected}
        />
      </p>
      <p role="status" className="demo-status">
        {selected
          ? `Selected: ${selected}. The original text is unchanged.`
          : "Choose a highlighted phrase, or reach it with Tab."}
      </p>
    </Stack>
  );
}

export const experienceDemos: Record<string, ComponentDemo> = {
  "outliner-extensions": extensionDemo,
  outline: {
    render: () => <ReaderDemo />,
    code: `import { Outliner } from "@samhagman/fast-ux-kit/react";\nimport "@samhagman/fast-ux-kit/styles.css";\n\n<Outliner\n  nodes={nodes}\n  aria-label="Working notebook"\n  expandedIds={expanded}\n  onExpandedChange={setExpanded}\n  enableHoist\n  getRichContent={(node) => node.data?.content}\n/>`,
    notes: [
      "Folding and hoisting are reader-local state, not document writes.",
      "The default disclosure sits at the inline end for comfortable right-thumb access in left-to-right layouts.",
      "Links, media and text selection stay independent of disclosure controls.",
    ],
  },
  editor: {
    render: () => <EditorDemo />,
    code: `const editor = useRef<OutlineEditorHandle>(null);\n\n<OutlineEditor\n  ref={editor}\n  readOnly={!editingAllowed}\n  defaultNodes={initialNodes}\n  onNodesChange={handleLocalChange}\n  isLocked={(node) => node.data?.locked === true}\n/>\n\n// Public commands preserve policy and history.\neditor.current?.dispatch({ type: "expand-all", expanded: true, depth: 2 });\nconst canonicalJSON = editor.current?.exportJSON();`,
    notes: [
      "Editing is opt-in. Reader mode rejects all content mutations, including commands and history.",
      "Undo/redo restores content and selection while preserving reader-local folds.",
      "Canonical JSON preserves IDs and metadata; readable text is deliberately not a lossless codec.",
      "Client-side policy is not server authorization. Your application owns storage, auth and synchronization.",
    ],
  },
  "rich-content": {
    render: () => <RichDemo />,
    code: `<RichContent\n  document={{\n    schema: "fast-ux-rich", version: 1,\n    blocks: [{ id: "intro", kind: "markdown", source: "**Hello**" }]\n  }}\n  registry={trustedApplicationRenderers}\n  allowMedia={(url) => url.startsWith("/approved-assets/")}\n/>`,
    notes: [
      "Whole Markdown source is preserved. Rich JSON is the canonical mixed-content format.",
      "Raw HTML, MDX, arbitrary imports and script strings never execute.",
      "React and diagram renderers are trusted application code, not a sandbox for untrusted plugins.",
      "Video/audio playback is user-initiated. Captions, transcripts and unavailable-media fallbacks remain readable.",
    ],
  },
  "text-intelligence": {
    render: () => <IntelligenceDemo />,
    code: `const references = createReferenceCompletionProvider({\n  id: "references", trigger: "@", entities\n});\n\n<OutlineEditor\n  readOnly={!editing}\n  defaultNodes={nodes}\n  completionProviders={[references]}\n  hoverProviders={[informationProvider]}\n  getTextAnalysis={analyzeCurrentText}\n/>`,
    notes: [
      "Providers receive exact text, selection, row identity and revision plus an AbortSignal.",
      "Stale results are rejected. Dismissal, context changes and unmount cancel pending work.",
      "Accepting a completion is one explicit, undoable text edit and cannot bypass document policy.",
      "Coordinates are UTF-16 offsets, end-exclusive and local to the current text surface.",
    ],
  },
  "highlight-text": {
    render: () => <HighlightsDemo />,
    code: `<HighlightText\n  text="Good interaction keeps the important details within reach."\n  highlights={[{ key: "detail", start: 5, end: 16 }]}\n  selectedKey={selected}\n  onActivate={setSelected}\n/>`,
    notes: [
      "Decoration never changes source text.",
      "Overlaps become flat segments rather than nested interactive controls.",
      "Each action has one keyboard stop, including fully covered ranges.",
    ],
  },
};

export function ExperiencePage({ id }: { id: string }) {
  const page = experiencePages.find((item) => item.id === id)!;
  const demo = experienceDemos[id]!;
  return (
    <>
      <PageHeading
        category={page.category}
        title={page.name}
        description={page.description}
        owner="Native React"
      />
      <DemoFrame key={id} demo={demo} title={`${page.name} example`} />
      <section className="reference-section">
        <h2>Built around clear contracts</h2>
        <ul className="contract-list">
          {demo.notes?.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>
      {id === "editor" && (
        <Notice title="Browser and device evidence are separate">
          The desktop and responsive browser checks do not certify physical-device IME, TalkBack or
          VoiceOver. Those remain explicit release gates.
        </Notice>
      )}
      <section className="reference-section">
        <h2>Usage</h2>
        <Code>{demo.code}</Code>
      </section>
    </>
  );
}
