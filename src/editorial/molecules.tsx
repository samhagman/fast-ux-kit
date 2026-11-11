import * as React from "react";
import { cx } from "./atoms.js";
import { tokenizeCode } from "./tokenize.js";

// ---------------------------------------------------------------------------------------------
// Molecules: one block in the reading column. Each renders to plain, script-free markup with no
// style attributes; figure and note numbers come from CSS counters on the enclosing Article.
// ---------------------------------------------------------------------------------------------

export interface FigureProps extends Omit<React.ComponentProps<"figure">, "children"> {
  readonly children: React.ReactNode;
  /** A full sentence that says what to notice. */
  readonly caption: React.ReactNode;
  /** What this is and where it came from: "Illustration", "A simplified model, not the product". */
  readonly credit?: React.ReactNode;
  /** `column` fits the text, `wide` spans text and margin, `margin` sits beside the text. */
  readonly size?: "column" | "wide" | "margin";
  /** The word before the number. */
  readonly label?: string;
  /** Leave the figure out of the numbering. */
  readonly unnumbered?: boolean;
  /** Draw the body without the mounted frame, for figures that bring their own surface. */
  readonly bare?: boolean;
}
/** Anything shown: a body, a number, a caption that says what to see, and a credit that says what it is. */
export function Figure({
  children,
  caption,
  credit,
  size = "column",
  label = "Figure",
  unnumbered,
  bare,
  className,
  ...props
}: FigureProps) {
  return (
    <figure
      className={cx("fux-figure", className)}
      data-size={size}
      data-numbered={unnumbered ? undefined : ""}
      data-bare={bare ? "" : undefined}
      {...props}
    >
      <div className="fux-figure-body">{children}</div>
      <figcaption className="fux-figure-caption">
        {!unnumbered && <span className="fux-figure-label" data-label={label} />}
        <span className="fux-figure-text">{caption}</span>
        {credit && <span className="fux-figure-credit">{credit}</span>}
      </figcaption>
    </figure>
  );
}

export interface MarginNoteProps extends Omit<React.ComponentProps<"span">, "children"> {
  readonly children: React.ReactNode;
}
/**
 * A numbered aside anchored to a sentence. It sits in the margin on a wide page and folds under
 * its paragraph on a narrow one. Place it inside the paragraph, right after the words it qualifies.
 */
export function MarginNote({ children, className, ...props }: MarginNoteProps) {
  return (
    <span className={cx("fux-note", className)} {...props}>
      <sup className="fux-note-ref" aria-hidden="true" />
      <span className="fux-note-body" role="note">
        <span className="fux-note-num" aria-hidden="true" />
        {children}
      </span>
    </span>
  );
}

export interface AsideProps extends React.ComponentProps<"aside"> {
  /** A short sentence-case heading for the aside. */
  readonly heading?: React.ReactNode;
}
/** A block in the margin: a small figure, a fact sheet or a note that belongs beside a section. */
export function Aside({ heading, children, className, ...props }: AsideProps) {
  return (
    <aside className={cx("fux-aside", className)} {...props}>
      {heading && <p className="fux-aside-heading">{heading}</p>}
      {children}
    </aside>
  );
}

export interface PullQuoteProps extends Omit<React.ComponentProps<"aside">, "children"> {
  /** A sentence that already appears in the body. */
  readonly children: React.ReactNode;
  /** The id of the paragraph it was lifted from, so a reader can return to the context. */
  readonly source?: string;
}
/** One sentence lifted from the body as a second way into the piece, with a way back to its context. */
export function PullQuote({ children, source, className, ...props }: PullQuoteProps) {
  return (
    <aside className={cx("fux-pullquote", className)} aria-label="Pull quote" {...props}>
      <blockquote className="fux-pullquote-text">{children}</blockquote>
      {source && (
        <a className="fux-pullquote-source" href={`#${source}`}>
          Read it in context
        </a>
      )}
    </aside>
  );
}

export interface AbstractProps extends React.ComponentProps<"section"> {
  /** The label over the summary. */
  readonly heading?: React.ReactNode;
}
/** Two or three sentences that state the whole piece, set apart before the body like a paper's abstract. */
export function Abstract({ heading = "In short", children, className, ...props }: AbstractProps) {
  return (
    <section className={cx("fux-abstract", className)} {...props}>
      <p className="fux-abstract-heading">{heading}</p>
      <div className="fux-abstract-body">{children}</div>
    </section>
  );
}

export type Fact = readonly [label: React.ReactNode, value: React.ReactNode];
export interface FactSheetProps extends Omit<React.ComponentProps<"dl">, "children"> {
  readonly items: readonly Fact[];
  /** `rows` sets label beside value; `stack` sets each label over its value, for a margin. */
  readonly layout?: "rows" | "stack";
}
/** Plain facts about one thing, as named properties with short values. */
export function FactSheet({ items, layout = "rows", className, ...props }: FactSheetProps) {
  return (
    <dl className={cx("fux-facts", className)} data-layout={layout} {...props}>
      {items.map(([label, value], index) => (
        <div className="fux-fact" key={index}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export interface CodeNote {
  /** The line the note is about, in the listing's own numbering. */
  readonly line: number;
  readonly text: React.ReactNode;
}
export interface CodeBlockProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly code: string;
  /** js, ts, tsx, json, python, shell, csharp, swift, css, yaml, or text. */
  readonly language?: string;
  /** The file the code comes from, shown above the listing. */
  readonly filename?: string;
  /** Where the full file can be read. */
  readonly href?: string;
  /** The number of the first line, when the listing is an excerpt. */
  readonly startLine?: number;
  /** Lines to mark, in the listing's own numbering. Noted lines are marked for you. */
  readonly marked?: readonly number[];
  /** Short notes on the one or two lines that matter, set beside the code. */
  readonly notes?: readonly CodeNote[];
  /** Hide line numbers on short snippets. */
  readonly plain?: boolean;
}
/** A real listing with its file path, and notes on the lines that matter set beside it. */
export function CodeBlock({
  code,
  language = "text",
  filename,
  href,
  startLine = 1,
  marked = [],
  notes = [],
  plain,
  className,
  ...props
}: CodeBlockProps) {
  const lines = tokenizeCode(code.replace(/\n+$/, ""), language);
  const flagged = new Set([...marked, ...notes.map((note) => note.line)]);
  return (
    <div
      className={cx("fux-code", className)}
      data-language={language}
      data-plain={plain ? "" : undefined}
      data-noted={notes.length ? "" : undefined}
      {...props}
    >
      {filename && (
        <div className="fux-code-head">
          {href ? (
            <a className="fux-code-file" href={href}>
              {filename}
            </a>
          ) : (
            <span className="fux-code-file">{filename}</span>
          )}
          {language !== "text" && <span className="fux-code-lang">{language}</span>}
        </div>
      )}
      <div className="fux-code-main">
        <pre className="fux-code-pre">
          <code>
            {lines.map((tokens, index) => {
              const number = startLine + index;
              return (
                <span
                  className="fux-code-line"
                  key={index}
                  data-line={number}
                  data-marked={flagged.has(number) ? "" : undefined}
                >
                  {!plain && (
                    <span className="fux-code-n" aria-hidden="true">
                      {number}
                    </span>
                  )}
                  <span className="fux-code-text">
                    {tokens.map((token, tokenIndex) =>
                      token.kind === "plain" ? (
                        token.text
                      ) : (
                        <span key={tokenIndex} className={`fux-tok-${token.kind}`}>
                          {token.text}
                        </span>
                      ),
                    )}
                    {"\n"}
                  </span>
                </span>
              );
            })}
          </code>
        </pre>
        {notes.length > 0 && (
          <ul className="fux-code-notes">
            {notes.map((note, index) => (
              <li key={index}>
                <span className="fux-code-note-ref">Line {note.line}</span>
                <span className="fux-code-note-text">{note.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export interface TerminalProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The transcript. A line that starts with the prompt and a space is something the reader types. */
  readonly children: string;
  readonly prompt?: string;
  /** A name for the transcript: "zsh", "Blender console". */
  readonly title?: string;
}
/** What the reader types and what comes back, as two visibly different channels. */
export function Terminal({ children, prompt = "$", title, className, ...props }: TerminalProps) {
  const lines = children.replace(/^\n+|\n+$/g, "").split("\n");
  return (
    <div className={cx("fux-terminal", className)} {...props}>
      {title && <div className="fux-terminal-title">{title}</div>}
      <pre className="fux-terminal-pre">
        {lines.map((line, index) => {
          const typed = line.startsWith(`${prompt} `);
          return (
            <span className="fux-terminal-line" data-kind={typed ? "in" : "out"} key={index}>
              {typed && (
                <span className="fux-terminal-prompt" aria-hidden="true">
                  {prompt}{" "}
                </span>
              )}
              {typed ? line.slice(prompt.length + 1) : line}
              {"\n"}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

export interface FileNode {
  readonly name: string;
  readonly note?: string;
  readonly marked?: boolean;
  readonly children?: readonly FileNode[];
}
function parseTree(source: string): FileNode[] {
  interface Draft {
    name: string;
    note?: string;
    marked?: boolean;
    children: Draft[];
  }
  const root: Draft = { name: "", children: [] };
  const stack: { depth: number; node: Draft }[] = [{ depth: -1, node: root }];
  for (const raw of source.split("\n")) {
    if (!raw.trim()) continue;
    const depth = raw.length - raw.trimStart().length;
    const [nameRaw = "", note] = raw.trim().split(/\s+#\s+/);
    const marked = nameRaw.startsWith("*");
    const node: Draft = {
      name: marked ? nameRaw.slice(1).trim() : nameRaw,
      note,
      marked,
      children: [],
    };
    while (stack.length > 1 && stack.at(-1)!.depth >= depth) stack.pop();
    stack.at(-1)!.node.children.push(node);
    stack.push({ depth, node });
  }
  return root.children;
}
function TreeLevel({ nodes }: { readonly nodes: readonly FileNode[] }) {
  return (
    <ul className="fux-tree-level">
      {nodes.map((node, index) => (
        <li key={index} className="fux-tree-item">
          <span
            className="fux-tree-name"
            data-kind={node.children?.length || node.name.endsWith("/") ? "folder" : "file"}
            data-marked={node.marked ? "" : undefined}
          >
            {node.name}
          </span>
          {node.note && <span className="fux-tree-note">{node.note}</span>}
          {node.children && node.children.length > 0 && <TreeLevel nodes={node.children} />}
        </li>
      ))}
    </ul>
  );
}
export interface FileTreeProps extends Omit<React.ComponentProps<"div">, "children"> {
  /**
   * The tree, as nodes or as indented text: one name per line, two spaces per level, folders end
   * in "/", `name  # note` adds a note, and a leading `*` marks the file being discussed.
   */
  readonly tree: readonly FileNode[] | string;
  readonly label?: string;
}
/** Where things live: folders, files, a note on the ones that matter. */
export function FileTree({ tree, label = "File tree", className, ...props }: FileTreeProps) {
  const nodes = typeof tree === "string" ? parseTree(tree) : tree;
  return (
    <div className={cx("fux-tree", className)} role="group" aria-label={label} {...props}>
      <TreeLevel nodes={nodes} />
    </div>
  );
}

export interface SourceResultProps extends Omit<React.ComponentProps<"div">, "children"> {
  /** The literal input. */
  readonly source: string;
  readonly language?: string;
  readonly sourceLabel?: React.ReactNode;
  readonly resultLabel?: React.ReactNode;
  /** What the input becomes. */
  readonly children: React.ReactNode;
}
/** A small input beside what it becomes, from one fixed fixture. */
export function SourceResult({
  source,
  language = "text",
  sourceLabel = "Source",
  resultLabel = "Result",
  children,
  className,
  ...props
}: SourceResultProps) {
  return (
    <div className={cx("fux-source-result", className)} {...props}>
      <div className="fux-source-result-side">
        <p className="fux-side-label">{sourceLabel}</p>
        <CodeBlock code={source} language={language} plain />
      </div>
      <div className="fux-source-result-side" data-side="result">
        <p className="fux-side-label">{resultLabel}</p>
        <div className="fux-source-result-output">{children}</div>
      </div>
    </div>
  );
}

export interface CompareSideProps extends React.ComponentProps<"div"> {
  /** What this side is: "Before", "Works today". */
  readonly label: React.ReactNode;
}
/**
 * One side of a Compare. From a server component, import this by name: `Compare.Side` is a
 * property on a function, which does not cross a `"use client"` boundary.
 */
export function CompareSide({ label, children, className, ...props }: CompareSideProps) {
  return (
    <div className={cx("fux-compare-side", className)} {...props}>
      <p className="fux-side-label">{label}</p>
      <div className="fux-compare-body">{children}</div>
    </div>
  );
}
/** Two things that share a frame, side by side with a seam between them. */
export function Compare({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("fux-compare", className)} {...props} />;
}
Compare.Side = CompareSide;

export interface LedgerProps extends Omit<React.ComponentProps<"table">, "children"> {
  /** Column headings, such as "Constraint", "Choice", "Cost". */
  readonly columns: readonly string[];
  readonly rows: readonly (readonly React.ReactNode[])[];
  /** Names the table for assistive technology. */
  readonly caption: string;
}
/** A decision laid out in aligned rows: each constraint, the choice it led to, and what the choice costs. */
export function Ledger({ columns, rows, caption, className, ...props }: LedgerProps) {
  return (
    <div className={cx("fux-ledger", className)}>
      <table {...props}>
        <caption className="fux-visually-hidden">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th scope="col" key={column}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) =>
                cellIndex === 0 ? (
                  <th scope="row" key={cellIndex} data-label={columns[cellIndex]}>
                    {cell}
                  </th>
                ) : (
                  <td key={cellIndex} data-label={columns[cellIndex]}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ProcedureProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly steps: readonly React.ReactNode[];
  /** What the reader sees when it worked. */
  readonly done?: React.ReactNode;
}
/** Actions whose order matters, ending in a check the reader can see. */
export function Procedure({ steps, done, className, ...props }: ProcedureProps) {
  return (
    <div className={cx("fux-procedure", className)} {...props}>
      <ol className="fux-procedure-steps">
        {steps.map((step, index) => (
          <li key={index}>{step}</li>
        ))}
      </ol>
      {done && (
        <p className="fux-procedure-done">
          <span className="fux-procedure-check" aria-hidden="true">
            ✓
          </span>
          {done}
        </p>
      )}
    </div>
  );
}

export interface PipelineStage {
  readonly label: React.ReactNode;
  /** One short line about what happens here. */
  readonly detail?: React.ReactNode;
}
export interface PipelineProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly stages: readonly PipelineStage[];
  /** The stage to mark as current, from 0. */
  readonly active?: number;
  /** Names the flow for assistive technology. */
  readonly label: string;
}
/** Stages something moves through, in order, with one line about each. Runs across when there is room, down when there is not. */
export function Pipeline({ stages, active, label, className, ...props }: PipelineProps) {
  return (
    <div className={cx("fux-pipeline", className)} {...props}>
      <ol className="fux-pipeline-stages" aria-label={label}>
        {stages.map((stage, index) => (
          <li
            className="fux-pipeline-stage"
            key={index}
            data-active={index === active ? "" : undefined}
            data-passed={active !== undefined && index < active ? "" : undefined}
            aria-current={index === active ? "step" : undefined}
          >
            <span className="fux-pipeline-label">{stage.label}</span>
            {stage.detail && <span className="fux-pipeline-detail">{stage.detail}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface ChronoEvent {
  /** Position on the scale, in the scale's own unit. */
  readonly at: number;
  readonly label: React.ReactNode;
  /** The position as the reader should see it: "day 9", "0.4 s". Defaults to the number and unit. */
  readonly when?: string;
}
export interface ChronolineProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly events: readonly ChronoEvent[];
  readonly unit?: string;
  /** Names the timeline for assistive technology. */
  readonly label: string;
}
/** Events placed on a measured scale, so unequal gaps look unequal. A numbered key carries the words. */
export function Chronoline({ events, unit, label, className, ...props }: ChronolineProps) {
  const width = 600;
  const pad = 14;
  const low = Math.min(...events.map((event) => event.at));
  const high = Math.max(...events.map((event) => event.at));
  const span = high - low || 1;
  const x = (at: number) => Math.round((pad + ((at - low) / span) * (width - pad * 2)) * 10) / 10;
  return (
    <div className={cx("fux-chronoline", className)} {...props}>
      <svg
        className="fux-chronoline-scale"
        viewBox={`0 0 ${width} 34`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={label}
      >
        <line x1={pad} y1="17" x2={width - pad} y2="17" className="fux-chronoline-axis" />
        {events.map((event, index) => (
          <g key={index}>
            <circle cx={x(event.at)} cy="17" r="10" className="fux-chronoline-dot" />
            <text x={x(event.at)} y="21" textAnchor="middle" className="fux-chronoline-num">
              {index + 1}
            </text>
          </g>
        ))}
      </svg>
      <ol className="fux-chronoline-key">
        {events.map((event, index) => (
          <li key={index}>
            <span className="fux-chronoline-when">
              {event.when ?? `${event.at}${unit ? ` ${unit}` : ""}`}
            </span>
            <span className="fux-chronoline-label">{event.label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export interface BarItem {
  readonly label: React.ReactNode;
  readonly value: number;
  /** The value as the reader should see it. Defaults to the number and unit. */
  readonly display?: string;
  /** Mark the row the text is talking about. */
  readonly marked?: boolean;
}
export interface BarListProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly items: readonly BarItem[];
  readonly unit?: string;
  /** The value a full-width bar stands for. Defaults to the largest item. */
  readonly max?: number;
  /** Names the comparison for assistive technology. */
  readonly label: string;
}
/** A few magnitudes from a shared zero, each with its number written out. */
export function BarList({ items, unit, max, label, className, ...props }: BarListProps) {
  const top = max ?? Math.max(...items.map((item) => item.value), 0);
  return (
    <div className={cx("fux-bars", className)} role="group" aria-label={label} {...props}>
      {items.map((item, index) => {
        const share = top > 0 ? Math.max(0, Math.min(100, (item.value / top) * 100)) : 0;
        return (
          <div className="fux-bar" key={index} data-marked={item.marked ? "" : undefined}>
            <span className="fux-bar-label">{item.label}</span>
            <svg
              className="fux-bar-track"
              viewBox="0 0 100 6"
              preserveAspectRatio="none"
              aria-hidden="true"
              focusable="false"
            >
              <rect className="fux-bar-rail" x="0" y="0" width="100" height="6" />
              <rect
                className="fux-bar-fill"
                x="0"
                y="0"
                width={Math.round(share * 100) / 100}
                height="6"
              />
            </svg>
            <span className="fux-bar-value">
              {item.display ?? `${item.value}${unit ? ` ${unit}` : ""}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export interface CitationProps extends Omit<React.ComponentProps<"figure">, "children"> {
  /** The claim. */
  readonly children: React.ReactNode;
  /** Who or what supports it. */
  readonly source: React.ReactNode;
  readonly href?: string;
  /** How the claim relates to the source: "Paraphrased", "Quoted". */
  readonly relation?: React.ReactNode;
}
/** A claim with its source set right beside it, so the two are never confused. */
export function Citation({ children, source, href, relation, className, ...props }: CitationProps) {
  return (
    <figure className={cx("fux-citation", className)} {...props}>
      <blockquote className="fux-citation-claim">{children}</blockquote>
      <figcaption className="fux-citation-source">
        {href ? <a href={href}>{source}</a> : <cite>{source}</cite>}
        {relation && <span className="fux-citation-relation">{relation}</span>}
      </figcaption>
    </figure>
  );
}
