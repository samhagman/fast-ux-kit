// Demos for the code and data display families the app catalog shares with Editorial UI.
import * as C from "@samhagman/fast-ux-kit/components";
import { type ComponentFixture, Variants, click, example } from "./fixture-kit";

const listing = `export function wordCount(note: string): number {
  // Split on any run of whitespace, and ignore the empty edges.
  return note.trim().split(/\\s+/).filter(Boolean).length;
}`;

// A styled transcript: a decorative bar on each line, a dim label, a bold name, a green mark and
// a link-coloured address. The bar is drawn, never copied or read aloud.
const bar = (tone: C.TerminalTone): C.TerminalSegment => ({ text: "▍", tone, decorative: true });
const styledLines: readonly C.TerminalLine[] = [
  [bar("accent"), { text: "$ fieldbook sync --remote " }, { text: "garden", tone: "bold" }],
  [bar("success"), { text: "✓ ", tone: "success" }, { text: "42 notes synced" }],
  [bar("warning"), { text: "warning: ", tone: "warning" }, { text: "2 notes have no title" }],
  [bar("danger"), { text: "error: ", tone: "danger" }, { text: "seeds.md could not be read" }],
  [
    bar("info"),
    { text: "view: ", tone: "dim" },
    { text: "https://notes.test/garden", tone: "link" },
  ],
];
const ansiTranscript =
  "$ fieldbook check\n\u001b[1;32m✓\u001b[0m 40 notes are valid\n\u001b[33m!\u001b[0m \u001b[2m2028-02-12-walk.md:\u001b[0m no title\n\u001b[31m✗\u001b[0m \u001b[1mseeds.md\u001b[0m could not be read\n\u001b[36mhttps://notes.test/check\u001b[0m";

export const displayFixtures: Readonly<Record<string, ComponentFixture>> = {
  CodeBlock: example(
    "A listing with its file path. Lines with a note are marked, and the notes sit beside the code.",
    () => (
      <>
        <C.CodeBlock
          code={listing}
          language="ts"
          filename="src/notes/word-count.ts"
          notes={[{ line: 3, text: "One expression does the whole job, so there is no loop." }]}
        />
        <Variants title="Plain snippet" layout="stack">
          {/* A listing is an inline-size container with no width of its own: in a column that
              does not stretch its items, it needs one. */}
          <C.CodeBlock
            className="w-full"
            code={`{ "theme": "paper", "margin": true }`}
            language="json"
            plain
          />
        </Variants>
        <Variants title="Copyable" layout="stack">
          <C.CodeBlock
            className="w-full"
            code={listing}
            language="ts"
            filename="src/notes/word-count.ts"
            copyable
          />
        </Variants>
      </>
    ),
    ".fux-code",
    [click(".fux-code-copy", '.fux-code [role="status"]', "Copied")],
  ),
  CommandLine: example(
    "Copy puts the command on the clipboard without the prompt. A long command scrolls sideways inside the box.",
    () => (
      <>
        <C.CommandLine label="Install command" command="npm install @example/notes" prompt />
        <Variants title="Long command" layout="stack">
          <div className="w-full max-w-xs">
            <C.CommandLine
              label="Export command"
              command="fieldbook export --format markdown --include-attachments --out ./export/2028-02"
              prompt
            />
          </div>
        </Variants>
        <Variants title="No prompt, custom labels" layout="stack">
          <C.CommandLine
            label="Status command"
            command="fieldbook status"
            copyLabel="Copy command"
            copiedLabel="Command copied"
          />
        </Variants>
      </>
    ),
    '[data-slot="command-line"]',
    [
      click(
        '[data-slot="command-line"] button',
        '[data-slot="command-line"] [role="status"]',
        "Copied",
      ),
    ],
  ),
  Terminal: example(
    "Lines the reader types start with the prompt. Everything else is output. Segments or ANSI codes colour text inside a line, on the page's ground or the terminal's own.",
    () => (
      <>
        <C.Terminal title="zsh">{`$ fieldbook export --format markdown
Wrote 42 notes to ./export
$ ls export | head -2
2028-02-12-walk.md
2028-02-13-seeds.md`}</C.Terminal>
        <Variants title="Styled segments, on each ground" layout="grid">
          <C.Terminal title="Page ground">{styledLines}</C.Terminal>
          <C.Terminal title="Dark ground" ground="dark">
            {styledLines}
          </C.Terminal>
          <C.Terminal title="Light ground" ground="light">
            {styledLines}
          </C.Terminal>
          <C.Terminal title="ANSI codes" ground="dark" ansi>
            {ansiTranscript}
          </C.Terminal>
        </Variants>
      </>
    ),
    ".fux-terminal",
  ),
  FileTree: example(
    "Folders end in a slash. A note explains an entry, and a star marks the file being discussed.",
    () => (
      <C.FileTree
        label="Fieldbook project files"
        tree={`fieldbook/
  notes/
    2028-02-12-walk.md
    *2028-02-13-seeds.md  # the note this page is about
  templates/
    daily.md
  fieldbook.json  # settings`}
      />
    ),
    ".fux-tree",
  ),
  KeyChord: example(
    "Keys pressed together are joined by a plus. A sequence reads as then.",
    () => (
      <>
        <p className="text-sm">
          Press <C.KeyChord keys="Cmd+K" /> to search.
        </p>
        <Variants title="A sequence">
          <p className="text-sm">
            <C.KeyChord keys="G then I" /> goes to the inbox.
          </p>
        </Variants>
      </>
    ),
    ".fux-keychord",
  ),
  Sparkline: example(
    "A trend the size of a word. The first and last value are always written out.",
    () => (
      <>
        <p className="text-sm">
          Notes per week <C.Sparkline values={[4, 6, 5, 8, 7, 11, 12]} label="Notes per week" />{" "}
          since January.
        </p>
        <Variants title="With a unit">
          <p className="text-sm">
            Sync time <C.Sparkline values={[420, 380, 300, 210, 180]} unit="ms" label="Sync time" />
          </p>
        </Variants>
      </>
    ),
    ".fux-sparkline",
  ),
  BarList: example(
    "Each bar starts at zero and carries its number. One row can be marked.",
    () => (
      <C.BarList
        label="Notes by notebook"
        unit="notes"
        items={[
          { label: "Field", value: 42, marked: true },
          { label: "Reading", value: 27 },
          { label: "Garden", value: 12 },
        ]}
      />
    ),
    ".fux-bars",
  ),
};
