"use client";

import * as React from "react";
import { cx, Kicker, Playback } from "./atoms.js";
import { CodeBlock, Figure, type FigureProps } from "./molecules.js";
import { useAutoplay } from "./autoplay.js";

// ---------------------------------------------------------------------------------------------
// Organisms: they shape the page. Article owns the reading column and its margin, and resets the
// figure and note counters. The others are complete sections an article is built from.
// ---------------------------------------------------------------------------------------------

export interface ArticleProps extends React.ComponentProps<"article"> {
  /** `paper` is the default sheet. `plain` drops the page background for use inside an app surface. */
  readonly surface?: "paper" | "plain";
}
/** The page: a reading column with a margin for notes and small figures. Numbers both for you. */
export function Article({ surface = "paper", className, ...props }: ArticleProps) {
  return <article className={cx("fux-article", className)} data-surface={surface} {...props} />;
}

/** The reading column. Blocks keep the text measure; wide figures and margin notes use the margin. */
export function ArticleBody({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cx("fux-article-body", className)} {...props} />;
}

export interface ArticleSectionProps extends Omit<React.ComponentProps<"section">, "title"> {
  /** A plain heading that says what the section holds. */
  readonly title: React.ReactNode;
}
/** A titled part of the article. */
export function ArticleSection({ title, children, className, ...props }: ArticleSectionProps) {
  return (
    <section className={cx("fux-section", className)} {...props}>
      <h2 className="fux-section-title">{title}</h2>
      {children}
    </section>
  );
}

export interface ArticleHeaderProps extends Omit<React.ComponentProps<"header">, "title"> {
  /** What kind of thing this is, above the headline. */
  readonly kicker?: React.ReactNode;
  readonly title: React.ReactNode;
  /**
   * The headline's heading level. It is the page's `h1` unless the article sits inside a page
   * that already has one.
   */
  readonly titleAs?: "h1" | "h2";
  /** One or two sentences under the headline. */
  readonly deck?: React.ReactNode;
  /** Short items for the rule-bound line under the deck: author, date, reading time. */
  readonly byline?: readonly React.ReactNode[];
}
/** The top of the page: kicker, headline, deck and a ruled byline. The first figure is the hero. */
export function ArticleHeader({
  kicker,
  title,
  titleAs: Title = "h1",
  deck,
  byline,
  children,
  className,
  ...props
}: ArticleHeaderProps) {
  return (
    <header className={cx("fux-article-header", className)} {...props}>
      {kicker && <Kicker>{kicker}</Kicker>}
      <Title className="fux-headline">{title}</Title>
      {deck && <p className="fux-deck">{deck}</p>}
      {byline && byline.length > 0 && (
        <ul className="fux-byline">
          {byline.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ul>
      )}
      {children}
    </header>
  );
}

export interface ExplorableProps extends Omit<FigureProps, "children" | "credit"> {
  /** The working model. */
  readonly stage: React.ReactNode;
  /** A few controls. Keep it to one idea. */
  readonly controls?: React.ReactNode;
  /** A sentence that changes with the model. Announced politely to assistive technology. */
  readonly readout?: React.ReactNode;
  /** Says plainly that this is a model. */
  readonly credit?: React.ReactNode;
  /**
   * Stop announcing the readout. Pass `playing` from `useAutoplay`: a figure that steps on its own
   * should not interrupt a screen reader every few seconds, only when the reader changes something.
   */
  readonly quiet?: boolean;
}
/**
 * A small working model the reader can poke: a stage, a few controls, and a sentence that changes
 * with them. The frame is presentational; the model's state belongs to whoever composes it.
 */
export function Explorable({
  stage,
  controls,
  readout,
  credit = "A simplified model, not the product.",
  quiet,
  size = "wide",
  className,
  ...props
}: ExplorableProps) {
  return (
    <Figure className={cx("fux-explorable", className)} size={size} credit={credit} bare {...props}>
      <div className="fux-explorable-stage">{stage}</div>
      {(controls || readout) && (
        <div className="fux-explorable-panel">
          {controls && <div className="fux-explorable-controls">{controls}</div>}
          {readout && (
            <p className="fux-explorable-readout" aria-live={quiet ? "off" : "polite"}>
              {readout}
            </p>
          )}
        </div>
      )}
    </Figure>
  );
}

export interface WalkthroughStep {
  /** First and last line the step is about, in the listing's own numbering. */
  readonly lines: readonly [from: number, to: number];
  readonly title: React.ReactNode;
  readonly text: React.ReactNode;
}
export interface CodeWalkthroughProps extends Omit<React.ComponentProps<"div">, "children"> {
  readonly code: string;
  readonly language?: string;
  readonly filename?: string;
  readonly href?: string;
  readonly startLine?: number;
  readonly steps: readonly WalkthroughStep[];
  /** Milliseconds each step is held while it plays on its own. */
  readonly interval?: number;
}
/**
 * A real listing the explanation moves through. Each step marks its lines; the steps advance on
 * their own and a reader can pause or pick one. Before hydration every step is readable as a list.
 */
export function CodeWalkthrough({
  code,
  language,
  filename,
  href,
  startLine,
  steps,
  interval = 4200,
  className,
  ...props
}: CodeWalkthroughProps) {
  const { ref, index, playing, ready, toggle, select } = useAutoplay<HTMLDivElement>({
    count: steps.length,
    interval,
  });
  const current = steps[index];
  const marked = current
    ? Array.from(
        { length: current.lines[1] - current.lines[0] + 1 },
        (_, offset) => current.lines[0] + offset,
      )
    : [];
  return (
    <div
      ref={ref}
      className={cx("fux-walkthrough", className)}
      data-ready={ready ? "" : undefined}
      {...props}
    >
      <CodeBlock
        code={code}
        language={language}
        filename={filename}
        href={href}
        startLine={startLine}
        marked={marked}
      />
      <div className="fux-walkthrough-rail">
        <ol className="fux-walkthrough-steps">
          {steps.map((step, stepIndex) => (
            <li
              key={stepIndex}
              className="fux-walkthrough-step"
              data-active={stepIndex === index ? "" : undefined}
            >
              <button
                type="button"
                className="fux-walkthrough-pick"
                aria-current={stepIndex === index ? "step" : undefined}
                onClick={() => select(stepIndex)}
              >
                <span className="fux-walkthrough-lines">
                  {step.lines[0] === step.lines[1]
                    ? `Line ${step.lines[0]}`
                    : `Lines ${step.lines[0]} to ${step.lines[1]}`}
                </span>
                <span className="fux-walkthrough-title">{step.title}</span>
              </button>
              <p className="fux-walkthrough-text">{step.text}</p>
            </li>
          ))}
        </ol>
        {steps.length > 1 && (
          <Playback
            disabled={!ready}
            playing={playing}
            onToggle={toggle}
            index={index}
            count={steps.length}
            onSelect={select}
            label="Code walkthrough playback"
          />
        )}
      </div>
    </div>
  );
}

export interface StatusLink {
  readonly label: string;
  readonly href: string;
}
export interface StatusReportProps extends Omit<React.ComponentProps<"section">, "children"> {
  /** A plain heading for the section. */
  readonly heading?: React.ReactNode;
  /** One sentence on where it stands and how to get it. */
  readonly summary: React.ReactNode;
  readonly works?: readonly React.ReactNode[];
  /** Leave it out when the summary already says what is missing. An empty list draws no column. */
  readonly notYet?: readonly React.ReactNode[];
  readonly worksLabel?: React.ReactNode;
  readonly notYetLabel?: React.ReactNode;
  readonly links?: readonly StatusLink[];
}
/** The honest ending: what works today, what does not yet, and where to get it. */
export function StatusReport({
  heading = "Where it stands",
  summary,
  works = [],
  notYet = [],
  worksLabel = "Works today",
  notYetLabel = "Not yet",
  links = [],
  className,
  ...props
}: StatusReportProps) {
  return (
    <section className={cx("fux-status", className)} {...props}>
      <h2 className="fux-section-title">{heading}</h2>
      <p className="fux-status-summary">{summary}</p>
      {(works.length > 0 || notYet.length > 0) && (
        <div
          className="fux-status-columns"
          data-single={works.length && notYet.length ? undefined : ""}
        >
          {works.length > 0 && (
            <div className="fux-status-column" data-kind="works">
              <p className="fux-side-label">{worksLabel}</p>
              <ul>
                {works.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          {notYet.length > 0 && (
            <div className="fux-status-column" data-kind="not-yet">
              <p className="fux-side-label">{notYetLabel}</p>
              <ul>
                {notYet.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {links.length > 0 && (
        <ul className="fux-status-links">
          {links.map((link) => (
            <li key={link.href}>
              <a className="fux-action" href={link.href}>
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
