import type { OutlineNode } from "../../src/core/index.js";
import type { RichDocument } from "../../src/rich/index.js";

export interface LabData {
  readonly content?: RichDocument;
  readonly reviewedBy?: string;
}
export interface LabScenario {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly steps: readonly string[];
  readonly checks: readonly string[];
  readonly nodes: readonly OutlineNode<LabData>[];
  readonly expanded: readonly string[];
  readonly branch: string;
  readonly target: string;
}

const notebook: readonly OutlineNode<LabData>[] = [
  {
    id: "notebook",
    text: "A small field notebook",
    children: [
      {
        id: "observations",
        text: "Observations worth keeping",
        children: [
          { id: "detail", text: "A folded detail is still part of the document" },
          { id: "unicode", text: "One thought, many scripts: café · 日本語 · مرحبًا · 👩🏽‍🚀" },
        ],
      },
      { id: "draft", text: "Make room for the next idea" },
      { id: "task", text: "Try this task, then undo it", checked: false },
    ],
  },
  { id: "reference", text: "Reference: keep the original context", checked: false },
];
const richNodes: readonly OutlineNode<LabData>[] = [
  {
    id: "notebook",
    text: "A notebook with more than text",
    children: [
      {
        id: "draft",
        text: "Readable Markdown, not a source pane",
        data: {
          content: {
            schema: "fast-ux-rich",
            version: 1,
            blocks: [
              {
                id: "rich-copy",
                kind: "markdown",
                source:
                  "A **small experiment** with *ordinary reading*.\n\n| Keep | Try |\n| --- | --- |\n| Context | Fold a branch |\n| Source | Export JSON |\n\n> Select this text without opening an editor.\n\n- [x] Read the notebook\n- [ ] Test on a real phone\n\n```ts\nconst reading = true;\n```\n\n[Explore the rich-content gallery](#rich-content).",
              },
            ],
          },
        },
      },
      {
        id: "detail",
        text: "Trusted application blocks and safe fallbacks",
        data: {
          content: {
            schema: "fast-ux-rich",
            version: 1,
            blocks: [
              {
                id: "rich-diagram",
                kind: "diagram",
                renderer: "lab-flow",
                source: "Read → Try → Observe",
                label: "A three-step evaluation",
              },
              {
                id: "rich-react",
                kind: "react",
                renderer: "lab-counter",
                label: "An application-owned counter",
              },
              {
                id: "rich-offline",
                kind: "image",
                src: "https://example.invalid/lab-image.png",
                alt: "An intentionally unavailable field sketch",
              },
              {
                id: "rich-unknown",
                kind: "future-format",
                label: "An unknown block kept in JSON",
                payload: { retained: true },
              },
            ],
          },
        },
      },
    ],
  },
  { id: "reference", text: "Reference: rich data survives a title edit" },
];

function scaleNodes(): readonly OutlineNode<LabData>[] {
  let deep: OutlineNode<LabData> = {
    id: "deep-leaf",
    text: "The leaf at level twelve: 雪 · שלום · 🧭",
  };
  for (let level = 11; level >= 1; level--)
    deep = { id: `deep-${level}`, text: `Nested level ${level}`, children: [deep] };
  return [
    ...Array.from({ length: 20 }, (_, group) => ({
      id: `group-${group}`,
      text: `Field notes ${String(group + 1).padStart(2, "0")}`,
      children: Array.from({ length: 11 }, (_, row) => ({
        id: `note-${group}-${row}`,
        text: `Observation ${group + 1}.${row + 1} — locally generated, no remote data`,
        ...(row === 0 ? { checked: false } : {}),
      })),
    })),
    deep,
    { id: "reference", text: "Reference: 240 field rows plus a twelve-level branch" },
  ];
}

export const labScenarios: readonly LabScenario[] = [
  {
    id: "read",
    title: "Read & navigate",
    summary:
      "Start with a real document. Folding and focusing a branch should change the view, not its content history.",
    steps: [
      "Collapse a branch using its end-of-row disclosure, then expand it again.",
      "Focus the sample branch. Use the breadcrumb or Return to document to leave it.",
      "Reveal the sample detail; compare content revision and history before and after.",
    ],
    checks: [
      "Reading and selecting body text did not activate an editor.",
      "Folding, hoisting and revealing left content revision and undo history unchanged.",
      "Hidden descendants left the reading flow; returning kept useful context.",
    ],
    nodes: notebook,
    expanded: ["notebook", "observations"],
    branch: "observations",
    target: "detail",
  },
  {
    id: "structure",
    title: "Edit & rearrange",
    summary:
      "Deliberately enter editing, then explore real caret, selection and structural commands with reversible history.",
    steps: [
      "Enable editing. Put the caret inside “Make room…” and press Enter to split; Shift + Enter makes a line break.",
      "Press Escape to select a row. Try Tab / Shift + Tab or the visible selection actions to nest and move it.",
      "Undo and redo. Try Backspace at a row start, structural copy/paste, and dragging a row by its handle.",
    ],
    checks: [
      "Split, merge and line-break behavior matched the intended caret position.",
      "Selected rows moved or nested together, without silently losing a subtree.",
      "Undo / redo restored content and selection; folding stayed separate.",
    ],
    nodes: notebook,
    expanded: ["notebook", "observations"],
    branch: "notebook",
    target: "draft",
  },
  {
    id: "policy",
    title: "Tasks & permissions",
    summary:
      "A protected reference demonstrates refusal, not server authorization. Try the same write in three policy states.",
    steps: [
      "In reading mode, Probe write gate should report read-only without changing content or history.",
      "Enable editing; keep Protect reference on. Probe again, then inspect the refusal and unchanged history.",
      "Turn protection off, probe again, and undo the change. Select the task row and toggle it with the toolbar or Ctrl / ⌘ + Enter.",
    ],
    checks: [
      "The read-only write attempt was refused with no content revision.",
      "The protected write was refused; removing protection allowed a retry.",
      "Undo restored the accepted change and task changes respected the same gate.",
    ],
    nodes: notebook,
    expanded: ["notebook"],
    branch: "notebook",
    target: "reference",
  },
  {
    id: "rich",
    title: "Rich notebook",
    summary:
      "Markdown, a registered diagram and a trusted React block stay in the outline. Unsupported media and block types stay honest.",
    steps: [
      "Read the rendered table, quote and code. Follow ordinary links and select text without enabling editing.",
      "Try the trusted counter. Its own UI state is not a document edit; fold and unfold its branch to inspect its lifecycle.",
      "Enable editing and change a row title. Export JSON at the bottom to inspect preserved rich data. The rich gallery has drawing, audio, video and motion samples.",
    ],
    checks: [
      "Rich content remained readable and bounded at a narrow width.",
      "Unavailable media and unknown blocks showed fallbacks rather than fake playback.",
      "A title edit preserved rich data; JSON export included it.",
    ],
    nodes: richNodes,
    expanded: ["notebook"],
    branch: "notebook",
    target: "detail",
  },
  {
    id: "intelligence",
    title: "Extensions & suggestions",
    summary:
      "Two ordered keyboard plugins and local @ suggestions use the same editor policy and atomic history.",
    steps: [
      "Enable editing. In “Ask @…”, type @ and choose a suggestion using arrows and Enter; undo the accepted completion.",
      "Focus a row and press F2 to run the first review plugin. Reverse plugin order and repeat; inspect the action trail and review label.",
      "Protect the reference and retry F2: the two-row transaction must be refused as a whole. Explore the dedicated demos for delayed/error providers and custom codecs.",
    ],
    checks: [
      "Suggestions were keyboard accessible and accepted as an undoable explicit edit.",
      "Changing plugin order changed the winner; review updated two rows in one history entry.",
      "Protection refused the whole extension transaction, with no partial review.",
    ],
    nodes: [
      {
        id: "notebook",
        text: "A connected notebook",
        children: [
          { id: "draft", text: "Ask @research about the next idea" },
          { id: "detail", text: "Type @ here to find a local reference" },
        ],
      },
      { id: "reference", text: "Reference: no review recorded" },
    ],
    expanded: ["notebook"],
    branch: "notebook",
    target: "detail",
  },
  {
    id: "scale",
    title: "Long & multilingual",
    summary:
      "A bounded synthetic fixture: 240 field rows, a twelve-level branch and a reference. This is an exploration, not a benchmark certification.",
    steps: [
      "Expand all, scroll the long outline, then show one level. Watch visible rows change without a content revision.",
      "Reveal the deep leaf. Focus its branch and return; inspect indentation and overflow in both writing directions.",
      "Enable editing and try mixed-script text, emoji and your actual IME. Record device-specific results yourself.",
    ],
    checks: [
      "The long document remained navigable on the device being tested.",
      "Deep indentation and RTL layout remained usable at a narrow width.",
      "My real-device text input, composition and caret behavior worked as expected.",
    ],
    nodes: scaleNodes(),
    expanded: ["group-0"],
    branch: "deep-1",
    target: "deep-leaf",
  },
];
