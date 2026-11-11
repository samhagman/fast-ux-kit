# Editorial UI

Editorial UI is a set of forms for explaining something on a page. It is separate
from the app component catalog because it does a different job. App components are
controls for getting work done. Editorial forms are for a reader, who is reading.

```tsx
import { Article, Figure, MarginNote } from "@samhagman/fast-ux-kit/editorial";
import "@samhagman/fast-ux-kit/editorial.css";
```

## Three properties everything here shares

- **React only.** The entry imports nothing but React. The stylesheet is plain CSS
  with no framework layer. `tests/editorial.test.tsx` fails if a dependency appears.
- **Static first.** Every family renders to useful, script-free markup on a server.
  Families that move (`CodeWalkthrough`, anything using `useAutoplay`) show their
  full content before hydration and start moving only after it.
- **No style attributes.** Geometry lives in SVG attributes and state in data
  attributes, so the output works under `style-src 'self'`.

## Scale

| Level     | What it is                                | Count |
| --------- | ----------------------------------------- | ----- |
| Atoms     | Forms inside a sentence, or one small job | 13    |
| Molecules | One block in the reading column           | 17    |
| Organisms | Whole sections that shape the page        | 5     |

The source of truth is `src/editorial/catalog.json`, exposed as `editorialManifest`.
Each entry states the job the form does for a reader, then how it does it.

### Atoms

| Family       | Job                                                |
| ------------ | -------------------------------------------------- |
| `Term`       | Explain a word at first use without a lookup       |
| `Sparkline`  | Show the shape of a small series inside a sentence |
| `KeyChord`   | Tell the reader what to press                      |
| `Literal`    | Keep an exact identifier exact                     |
| `DatedValue` | Stop an old number from reading as current         |
| `StageGlyph` | Say how far along something is                     |
| `Marker`     | Tie a place in a figure to the sentence about it   |
| `DropCap`    | Mark where a piece begins                          |
| `Kicker`     | Say what kind of thing this is before the headline |
| `Playback`   | Let a reader pause anything that moves on its own  |
| `Choice`     | Pick one of a few options in a figure              |
| `Range`      | Change one number in a figure                      |
| `Action`     | Do the one thing a figure is about                 |

### Molecules

| Family         | Job                                               |
| -------------- | ------------------------------------------------- |
| `Figure`       | Show something and say what to notice             |
| `MarginNote`   | Keep a tangent near the sentence it belongs to    |
| `Aside`        | Set a small block beside a section                |
| `PullQuote`    | Give a second way into the piece                  |
| `Abstract`     | State the whole piece before the body             |
| `FactSheet`    | Describe one thing through named properties       |
| `CodeBlock`    | Show real code and explain the lines that matter  |
| `Terminal`     | Separate what a reader types from what comes back |
| `FileTree`     | Show where things live                            |
| `SourceResult` | Show a small input becoming a visible output      |
| `Compare`      | Set two things with a shared frame side by side   |
| `Ledger`       | Lay out a decision with its costs                 |
| `Procedure`    | Give steps whose order matters                    |
| `Pipeline`     | Show the stages something moves through           |
| `Chronoline`   | Make unequal gaps in time look unequal            |
| `BarList`      | Compare a few magnitudes                          |
| `Citation`     | Keep a claim and its source distinct              |

### Organisms

| Family            | Job                                          |
| ----------------- | -------------------------------------------- |
| `Article`         | Hold a piece of writing, with a margin       |
| `ArticleHeader`   | Open the piece                               |
| `Explorable`      | Let a reader poke a small working model      |
| `CodeWalkthrough` | Walk through a listing a few lines at a time |
| `StatusReport`    | End honestly: what works, what does not yet  |

Six families are general enough for applications and are also exported from
`/components`, where they are part of the app catalog: `CodeBlock`, `Terminal`,
`FileTree`, `KeyChord`, `Sparkline` and `BarList`. There is one implementation.

## The page

`Article` is a container with a reading column and a margin.

```
wide (46rem and up)                          narrow
┌──────────────────────────┬──────────────┐  ┌──────────────────────┐
│ measure 34rem            │ margin       │  │ column               │
│                          │              │  │                      │
│ Prose with a note.¹      │ ¹ The note   │  │ Prose with a note.¹  │
│                          │   sits here. │  │ │ ¹ The note folds   │
│ ┌──────────────────────────────────────┐│  │ │   under its para.  │
│ │ Figure, size="wide"                  ││  │ ┌──────────────────┐ │
│ └──────────────────────────────────────┘│  │ │ Figure           │ │
└──────────────────────────┴──────────────┘  └──────────────────────┘
```

- Blocks keep the measure. `Figure size="wide"` spans the measure and the margin.
- `MarginNote` goes inside a paragraph, right after the words it qualifies.
- `Aside` and `Figure size="margin"` are blocks that sit in the margin.
- Figures and notes number themselves with CSS counters, so numbering survives
  partial hydration and needs no shared state.

The layout responds to the article's own width (a container query), so an article
in a narrow pane folds its margin even on a wide screen.

## Motion

One rule: subtle, automatic, and the reader can pause it.

`useAutoplay({ count })` returns the current step and a `Playback` control's props.
It plays only while its element is on screen, starts paused under reduced motion,
and pauses when a reader picks a step. Before hydration `ready` is false, and a
family should render its static reading.

Three habits keep a self-running figure from fighting its reader:

- Render `Playback` on the server too, with `disabled={!ready}`. It holds its space,
  so nothing shifts when the page hydrates, and it reads as inert until it works.
- Any control the reader touches should pause the tour. `select(index)` does that.
- Pass `quiet={playing}` to `Explorable`. Its readout is a live region, and a figure
  that steps on its own should not interrupt a screen reader every few seconds.

Put the interesting step early. A reader gives a figure a few seconds.

## Explorables

`Explorable` is a frame: a stage, a few controls, and a sentence that changes with
them. The model's state belongs to the component that composes it. Keep one idea
per explorable, and say in the credit line that it is a model.

`ArticleHeader` renders the page's `h1`. Inside a page that already has one, pass
`titleAs="h2"`. `StatusReport` draws only the lists it is given: leave `notYet` out
when the summary already says what is missing.

```tsx
function ReadingTime() {
  const [words, setWords] = React.useState(920);
  const minutes = Math.max(1, Math.round(words / 230));
  return (
    <Explorable
      caption="Drag the length and the estimate follows."
      stage={
        <BarList label="Reading time" unit="min" items={[{ label: "Typical", value: minutes }]} />
      }
      controls={
        <Range label="Length" min={200} max={1800} value={words} onValueChange={setWords} />
      }
      readout={<>About {minutes} minutes.</>}
    />
  );
}
```

## Theming

Override the `--fux-ed-*` tokens on `:root` or on `.fux-article`.

| Token               | Use                            | Falls back to        |
| ------------------- | ------------------------------ | -------------------- |
| `--fux-ed-paper`    | The sheet                      | `--background`       |
| `--fux-ed-raised`   | Figure mounts, code            | `--card`             |
| `--fux-ed-ink`      | Text and line work             | `--foreground`       |
| `--fux-ed-ink-soft` | Captions and notes             | `--muted-foreground` |
| `--fux-ed-rule`     | Hairlines                      | `--border`           |
| `--fux-ed-tone`     | Pale fills                     | `--muted`            |
| `--fux-ed-accent`   | Markers, marked lines, numbers | `--signal`           |
| `--fux-ed-good`     | Stage glyphs, strings, "works" | `--success`          |
| `--fux-ed-serif`    | Reading text and headlines     | `--font-serif`       |
| `--fux-ed-sans`     | Labels, captions, controls     | `--font-sans`        |
| `--fux-ed-mono`     | Code                           | `--font-mono`        |
| `--fux-ed-measure`  | Width of the reading column    | `34rem`              |
| `--fux-ed-margin`   | Width of the margin            | `13.5rem`            |

With the app stylesheet loaded, the editorial set follows the app theme, dark mode
included. On its own it uses a neutral paper.

## Code listings

`CodeBlock` takes source text and a language. A small built-in tokenizer marks
comments, strings, numbers and keywords for JavaScript, TypeScript, JSON, Python,
shell, C#, Swift, CSS and YAML. Unknown languages render as plain text. Nothing is
evaluated, and the tokenizer never drops or reorders a character.

Long lines wrap with a hanging indent instead of scrolling sideways, so a line a
note points at is never cut off, on a phone or beside its notes.

The tokenizer is deliberately small, and it prefers leaving text plain to marking it
wrongly. A keyword used as a member or an object key (`z.enum`, `{ from: 1 }`) stays
plain, a quote that never closes on its line is treated as an apostrophe, and `#`
starts a shell or YAML comment only at the start of a line or after a space.

## Tests

| Suite                              | Coverage                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `tests/editorial.test.tsx`         | Manifest and exports, script-free and style-free rendering, the tokenizer, the React-only bundle, the standalone stylesheet |
| `tests/editorial-gallery.test.tsx` | A Studio fixture for every family, the explorable and walkthrough interactions, the sample article                          |
