// Demos for the code and data display families the app catalog shares with Editorial UI.
import * as C from "@samhagman/fast-ux-kit/components";
import { type ComponentFixture, Variants, example } from "./fixture-kit";

const listing = `export function wordCount(note: string): number {
  // Split on any run of whitespace, and ignore the empty edges.
  return note.trim().split(/\\s+/).filter(Boolean).length;
}`;

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
          <C.CodeBlock code={`{ "theme": "paper", "margin": true }`} language="json" plain />
        </Variants>
      </>
    ),
    ".fux-code",
  ),
  Terminal: example(
    "Lines the reader types start with the prompt. Everything else is output.",
    () => (
      <C.Terminal title="zsh">{`$ fieldbook export --format markdown
Wrote 42 notes to ./export
$ ls export | head -2
2028-02-12-walk.md
2028-02-13-seeds.md`}</C.Terminal>
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
