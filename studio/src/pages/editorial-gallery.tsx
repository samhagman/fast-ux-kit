// One demo per editorial family. The Editorial UI page and tests/editorial-gallery.test.tsx both
// read this map, so a family without a working demo fails the build.
import * as React from "react";
import * as E from "@samhagman/fast-ux-kit/editorial";

export interface EditorialFixture {
  readonly Component: React.ComponentType;
  /** A selector that proves the family rendered. */
  readonly selector: string;
  /** The demo needs the full width of the page. */
  readonly wide?: boolean;
  /** The demo brings its own Article, so the gallery adds no reading column around it. */
  readonly own?: boolean;
}

const listing = `export function wordCount(note: string): number {
  // Split on any run of whitespace, and ignore the empty edges.
  const words = note.trim().split(/\\s+/).filter(Boolean);
  return words.length;
}

export function readingMinutes(note: string): number {
  return Math.max(1, Math.round(wordCount(note) / 230));
}`;

const P = (props: React.ComponentProps<"p">) => <p {...props} />;

/** A tiny scene for the figure demos: a notebook page with three ruled lines and a pressed leaf. */
function Plate() {
  return (
    <svg viewBox="0 0 480 220" role="img" aria-label="A notebook page with a pressed leaf.">
      <rect x="120" y="24" width="240" height="172" fill="none" stroke="currentColor" />
      <path d="M150 70h120M150 98h150M150 126h96" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M290 168c-4-30 14-58 44-66-2 30-16 54-44 66zM290 168l30-44"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function PlaybackDemo() {
  const { ref, index, playing, toggle, select } = E.useAutoplay<HTMLDivElement>({ count: 4 });
  return (
    <div ref={ref}>
      <E.Playback
        playing={playing}
        onToggle={toggle}
        index={index}
        count={4}
        onSelect={select}
        label="Demo playback"
      />
    </div>
  );
}

function ChoiceDemo() {
  const [value, setValue] = React.useState<"day" | "week" | "month">("week");
  return (
    <E.Choice
      legend="Show"
      value={value}
      onValueChange={setValue}
      options={[
        { value: "day", label: "Day" },
        { value: "week", label: "Week" },
        { value: "month", label: "Month" },
      ]}
    />
  );
}

function RangeDemo() {
  const [value, setValue] = React.useState(230);
  return (
    <E.Range
      label="Reading speed"
      min={120}
      max={400}
      step={10}
      value={value}
      onValueChange={setValue}
      display={`${value} wpm`}
    />
  );
}

function ActionDemo() {
  const [count, setCount] = React.useState(0);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <E.Action tone="strong" onClick={() => setCount(count + 1)}>
        Add a note
      </E.Action>
      <E.Action onClick={() => setCount(0)}>Reset</E.Action>
      <output className="font-mono text-xs text-muted-foreground">{count} added</output>
    </div>
  );
}

function PipelineDemo() {
  const stages = [
    { label: "Capture", detail: "Type or dictate a note." },
    { label: "File", detail: "It lands in today's page." },
    { label: "Link", detail: "Mentions become links." },
    { label: "Review", detail: "Friday shows the week." },
  ];
  const { ref, index, playing, ready, toggle, select } = E.useAutoplay<HTMLDivElement>({
    count: stages.length,
  });
  return (
    <div ref={ref} className="flex flex-col gap-4">
      <E.Pipeline
        label="How a note moves through Fieldbook"
        stages={stages}
        active={ready ? index : undefined}
      />
      <E.Playback
        playing={playing}
        onToggle={toggle}
        index={index}
        count={stages.length}
        onSelect={select}
        label="Pipeline playback"
        stepLabels={stages.map((stage) => stage.label)}
      />
    </div>
  );
}

/** The whole idea of an explorable in one small model: a reading-time estimate that follows two inputs. */
function ExplorableDemo() {
  const [words, setWords] = React.useState(920);
  const [speed, setSpeed] = React.useState<"slow" | "typical" | "fast">("typical");
  const rate = { slow: 160, typical: 230, fast: 320 }[speed];
  const minutes = Math.max(1, Math.round(words / rate));
  return (
    <E.Explorable
      caption="Drag the length and the estimate follows. The sentence under the bars is computed from the same two numbers."
      credit="A simplified model with made-up numbers."
      stage={
        <E.BarList
          label="Reading time by reader"
          unit="min"
          max={12}
          items={[
            { label: "Slow", value: Math.round(words / 160), marked: speed === "slow" },
            { label: "Typical", value: Math.round(words / 230), marked: speed === "typical" },
            { label: "Fast", value: Math.round(words / 320), marked: speed === "fast" },
          ]}
        />
      }
      controls={
        <>
          <E.Range
            label="Length"
            min={200}
            max={1800}
            step={20}
            value={words}
            onValueChange={setWords}
            display={`${words} words`}
          />
          <E.Choice
            legend="Reader"
            value={speed}
            onValueChange={setSpeed}
            options={[
              { value: "slow", label: "Slow" },
              { value: "typical", label: "Typical" },
              { value: "fast", label: "Fast" },
            ]}
          />
        </>
      }
      readout={
        <>
          A {speed} reader gets through {words} words in about{" "}
          <strong>
            {minutes} minute{minutes === 1 ? "" : "s"}
          </strong>
          .
        </>
      }
    />
  );
}

const fixture = (
  Component: React.ComponentType,
  selector: string,
  wide = false,
  own = false,
): EditorialFixture => ({ Component, selector, wide, own });

export const editorialFixtures: Readonly<Record<string, EditorialFixture>> = {
  // Atoms
  Term: fixture(
    () => (
      <P>
        Every page keeps a{" "}
        <E.Term definition="a link that points back at whatever mentions this page">
          backlink
        </E.Term>{" "}
        list, so a note is never a dead end.
      </P>
    ),
    ".fux-term",
  ),
  Sparkline: fixture(
    () => (
      <P>
        Notes per week went <E.Sparkline values={[4, 6, 5, 8, 7, 11, 12]} label="Notes per week" />{" "}
        once capture took one keystroke.
      </P>
    ),
    ".fux-sparkline",
  ),
  KeyChord: fixture(
    () => (
      <P>
        Press <E.KeyChord keys="Cmd+Shift+N" /> anywhere to start a note, or{" "}
        <E.KeyChord keys="G then T" /> to jump to today.
      </P>
    ),
    ".fux-keychord",
  ),
  Literal: fixture(
    () => (
      <P>
        Settings live in <E.Literal>fieldbook.json</E.Literal>, and the flag is{" "}
        <E.Literal>--no-sync</E.Literal>, with two hyphens.
      </P>
    ),
    ".fux-literal",
  ),
  DatedValue: fixture(
    () => (
      <P>
        The export covers <E.DatedValue date="Feb 2028">1,204 notes</E.DatedValue>.
      </P>
    ),
    ".fux-dated",
  ),
  StageGlyph: fixture(
    () => (
      <div className="flex flex-wrap gap-x-6 gap-y-2 font-sans text-sm">
        <E.StageGlyph stage="planned">Planned</E.StageGlyph>
        <E.StageGlyph stage="started">Started</E.StageGlyph>
        <E.StageGlyph stage="half">Prototype</E.StageGlyph>
        <E.StageGlyph stage="most">Beta</E.StageGlyph>
        <E.StageGlyph stage="done">Live</E.StageGlyph>
        <E.StageGlyph stage="held">On hold</E.StageGlyph>
      </div>
    ),
    ".fux-stage",
  ),
  Marker: fixture(
    () => (
      <P>
        The capture bar <E.Marker>1</E.Marker> stays on top, and the day's page{" "}
        <E.Marker>2</E.Marker> fills in below it.
      </P>
    ),
    ".fux-marker",
  ),
  DropCap: fixture(
    () => (
      <E.DropCap>
        Most note apps ask where a note should go before you have written it. Fieldbook asks
        nothing. It files the note under today and lets you sort it out later, which is usually
        never, and that turns out to be fine.
      </E.DropCap>
    ),
    ".fux-dropcap",
  ),
  Kicker: fixture(
    () => (
      <E.Kicker>
        Field notes <E.StageGlyph stage="half">Prototype</E.StageGlyph>
      </E.Kicker>
    ),
    ".fux-kicker",
  ),
  Playback: fixture(PlaybackDemo, ".fux-playback"),
  Choice: fixture(ChoiceDemo, ".fux-choice"),
  Range: fixture(RangeDemo, ".fux-range"),
  Action: fixture(ActionDemo, ".fux-action"),

  // Molecules
  Figure: fixture(
    () => (
      <E.Figure
        caption="The leaf is pressed into the same page as the note about where it was found."
        credit="Illustration."
      >
        <Plate />
      </E.Figure>
    ),
    ".fux-figure",
  ),
  MarginNote: fixture(
    () => (
      <P>
        Notes are filed by the day they were written
        <E.MarginNote>
          The day rolls over at 4am, not midnight, because that is when people actually stop.
        </E.MarginNote>{" "}
        and never by folder, so there is nothing to decide at the moment of writing.
      </P>
    ),
    ".fux-note",
    true,
  ),
  Aside: fixture(
    () => (
      <>
        <E.Aside heading="At a glance">
          <E.FactSheet
            items={[
              ["Platform", "macOS and iOS"],
              ["Storage", "Plain Markdown files"],
            ]}
          />
        </E.Aside>
        <P>
          An aside holds a small block beside the text it belongs to. On a wide page it sits in the
          margin. On a narrow page it takes its place in the column, above this paragraph.
        </P>
      </>
    ),
    ".fux-aside",
    true,
  ),
  PullQuote: fixture(
    () => (
      <>
        <P id="pullquote-source">
          I stopped organizing notes two years ago. Search got good enough that the filing was the
          only part still costing me anything.
        </P>
        <E.PullQuote source="pullquote-source">
          Search got good enough that the filing was the only part still costing me anything.
        </E.PullQuote>
      </>
    ),
    ".fux-pullquote",
  ),
  Abstract: fixture(
    () => (
      <E.Abstract>
        <p>
          Fieldbook is a notes app with no folders. Every note is filed under the day it was
          written, and links and search do the rest.
        </p>
      </E.Abstract>
    ),
    ".fux-abstract",
  ),
  FactSheet: fixture(
    () => (
      <E.FactSheet
        items={[
          ["Platform", "macOS and iOS"],
          ["Storage", "Plain Markdown files in a folder you choose"],
          ["Sync", "Optional, through your own cloud drive"],
          ["License", "MIT"],
        ]}
      />
    ),
    ".fux-facts",
  ),
  CodeBlock: fixture(
    () => (
      <E.CodeBlock
        code={listing}
        language="ts"
        filename="src/notes/reading.ts"
        notes={[
          { line: 3, text: "Empty strings from the edges are dropped before counting." },
          { line: 8, text: "Never zero minutes. A one-line note still takes a moment." },
        ]}
      />
    ),
    ".fux-code",
    true,
  ),
  Terminal: fixture(
    () => (
      <E.Terminal title="zsh">{`$ fieldbook export --format markdown
Wrote 42 notes to ./export
$ ls export | head -2
2028-02-12-walk.md
2028-02-13-seeds.md`}</E.Terminal>
    ),
    ".fux-terminal",
  ),
  FileTree: fixture(
    () => (
      <E.FileTree
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
  SourceResult: fixture(
    () => (
      <E.SourceResult
        source={"Found **three** oak seedlings\nby the [[north gate]]."}
        language="text"
        sourceLabel="What you type"
        resultLabel="What the page shows"
      >
        <p>
          Found <strong>three</strong> oak seedlings by the <a href="#north-gate">north gate</a>.
        </p>
      </E.SourceResult>
    ),
    ".fux-source-result",
    true,
  ),
  Compare: fixture(
    () => (
      <E.Compare>
        <E.Compare.Side label="Folders">
          <p>You decide where a note goes before you write it, and move it when you were wrong.</p>
        </E.Compare.Side>
        <E.Compare.Side label="Days">
          <p>The note goes under today. Links and search find it again.</p>
        </E.Compare.Side>
      </E.Compare>
    ),
    ".fux-compare",
    true,
  ),
  Ledger: fixture(
    () => (
      <E.Ledger
        caption="Storage decisions and their costs"
        columns={["Constraint", "Choice", "Cost"]}
        rows={[
          ["Notes must outlive the app", "Plain Markdown files", "No rich embeds inside a note"],
          ["Works offline", "Local first, sync later", "Two devices can briefly disagree"],
          ["Nothing to configure", "One folder, no settings", "Power users want more knobs"],
        ]}
      />
    ),
    ".fux-ledger",
    true,
  ),
  Procedure: fixture(
    () => (
      <E.Procedure
        steps={[
          "Choose the folder where your notes should live.",
          <>
            Press <E.KeyChord keys="Cmd+Shift+N" /> and write one line.
          </>,
          "Open the folder in Finder.",
        ]}
        done="A Markdown file named for today is sitting there."
      />
    ),
    ".fux-procedure",
  ),
  Pipeline: fixture(PipelineDemo, ".fux-pipeline", true),
  Chronoline: fixture(
    () => (
      <E.Chronoline
        label="Three events on a 30-day scale"
        unit="days"
        events={[
          { at: 0, label: "First note", when: "Day 0" },
          { at: 3, label: "First link between notes", when: "Day 3" },
          { at: 26, label: "First weekly review", when: "Day 26" },
        ]}
      />
    ),
    ".fux-chronoline",
    true,
  ),
  BarList: fixture(
    () => (
      <E.BarList
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
  Citation: fixture(
    () => (
      <E.Citation
        source="Fieldbook user survey, 2028"
        href="#survey"
        relation="Paraphrased from 38 responses"
      >
        Most people who stopped filing their notes said they did not miss it after the first week.
      </E.Citation>
    ),
    ".fux-citation",
  ),

  // Organisms
  Article: fixture(
    () => (
      <E.Article surface="plain">
        <E.ArticleBody>
          <E.ArticleSection title="why days and not folders">
            <P>
              Filing is a decision, and a decision at the moment of writing is the most expensive
              kind.
              <E.MarginNote>Notes in the margin number themselves.</E.MarginNote> So Fieldbook files
              by day and asks nothing.
            </P>
            <E.Figure caption="Figures number themselves too." credit="Illustration.">
              <Plate />
            </E.Figure>
          </E.ArticleSection>
        </E.ArticleBody>
      </E.Article>
    ),
    ".fux-article",
    true,
    true,
  ),
  ArticleHeader: fixture(
    () => (
      <E.Article surface="plain">
        <E.ArticleHeader
          titleAs="h2"
          kicker={
            <>
              Fieldbook <E.StageGlyph stage="half">Prototype</E.StageGlyph>
            </>
          }
          title="A notes app that never asks where a note should go."
          deck="Every note is filed under the day it was written. Links and search do the rest."
          byline={["Ada Park", "February 2028", "3 minute read"]}
        />
      </E.Article>
    ),
    ".fux-article-header",
    true,
    true,
  ),
  Explorable: fixture(ExplorableDemo, ".fux-explorable", true),
  CodeWalkthrough: fixture(
    () => (
      <E.CodeWalkthrough
        code={listing}
        language="ts"
        filename="src/notes/reading.ts"
        steps={[
          {
            lines: [1, 5],
            title: "Count the words",
            text: "Trim, split on whitespace, and drop the empty pieces.",
          },
          {
            lines: [7, 9],
            title: "Turn words into minutes",
            text: "Divide by a typical reading speed and never return zero.",
          },
        ]}
      />
    ),
    ".fux-walkthrough",
    true,
  ),
  StatusReport: fixture(
    () => (
      <E.Article surface="plain">
        <E.StatusReport
          summary="A working prototype on my own machines. Nothing to download yet."
          works={["Capture from anywhere", "Daily pages and backlinks", "Full-text search"]}
          notYet={["Sync between devices", "An iOS build"]}
          links={[{ label: "Read the design notes", href: "#notes" }]}
        />
      </E.Article>
    ),
    ".fux-status",
    true,
    true,
  ),
};

/** A complete short piece built only from the families above, to show them working together. */
export function EditorialSpecimen() {
  return (
    <E.Article>
      <E.ArticleHeader
        titleAs="h2"
        kicker={
          <>
            Fieldbook <E.StageGlyph stage="half">Prototype</E.StageGlyph>
          </>
        }
        title="A notes app that never asks where a note should go."
        deck="Every note is filed under the day it was written. Links and search do the rest."
        byline={["Ada Park", "February 2028", "3 minute read"]}
      />
      <E.ArticleBody>
        <E.Aside heading="At a glance">
          <E.FactSheet
            items={[
              ["Platform", "macOS and iOS"],
              ["Storage", "Plain Markdown files"],
              ["License", "MIT"],
            ]}
          />
        </E.Aside>
        <E.DropCap id="specimen-lede">
          I stopped organizing notes two years ago. Search got good enough that the filing was the
          only part still costing me anything.
          <E.MarginNote>
            I kept one folder, called Keep, for the four documents I am scared to lose.
          </E.MarginNote>{" "}
          So I built the app I wanted, which is a text box and a calendar.
        </E.DropCap>
        <ExplorableDemo />
        <E.ArticleSection title="how a note moves">
          <P>
            You press <E.KeyChord keys="Cmd+Shift+N" />, write, and close it. The note lands on
            today's page, and any{" "}
            <E.Term definition="a page name in double brackets">wikilink</E.Term> in it becomes a
            real link.
          </P>
          <E.Figure
            size="wide"
            caption="Four stages, and only the first one needs you."
            credit="Diagram."
          >
            <E.Pipeline
              label="How a note moves through Fieldbook"
              active={1}
              stages={[
                { label: "Capture", detail: "Type or dictate a note." },
                { label: "File", detail: "It lands in today's page." },
                { label: "Link", detail: "Mentions become links." },
                { label: "Review", detail: "Friday shows the week." },
              ]}
            />
          </E.Figure>
          <E.PullQuote source="specimen-lede">
            Search got good enough that the filing was the only part still costing me anything.
          </E.PullQuote>
        </E.ArticleSection>
        <E.ArticleSection title="the code is small">
          <P>
            The reading-time estimate at the top of each page is two functions. It went{" "}
            <E.Sparkline values={[44, 31, 22, 12, 9]} unit="lines" label="Lines of code" /> over
            five rewrites.
          </P>
          <E.Figure
            size="wide"
            caption="Both functions, as they are in the repo."
            credit="Real code."
          >
            <E.CodeBlock
              code={listing}
              language="ts"
              filename="src/notes/reading.ts"
              notes={[{ line: 8, text: "Never zero minutes." }]}
            />
          </E.Figure>
        </E.ArticleSection>
        <E.StatusReport
          summary="A working prototype on my own machines. Nothing to download yet."
          works={["Capture from anywhere", "Daily pages and backlinks", "Full-text search"]}
          notYet={["Sync between devices", "An iOS build"]}
        />
      </E.ArticleBody>
    </E.Article>
  );
}
