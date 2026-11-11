import * as React from "react";

/** Join class names. The editorial module stays free of styling dependencies. */
export function cx(...parts: readonly (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type SpanProps = React.ComponentProps<"span">;

// ---------------------------------------------------------------------------------------------
// Atoms: forms that live inside a sentence, or do one small job on their own.
// None of them renders a style attribute, so they work under a strict style-src policy.
// ---------------------------------------------------------------------------------------------

export interface TermProps extends Omit<SpanProps, "children"> {
  /** The word being defined. */
  readonly children: React.ReactNode;
  /** A short gloss, set in the line right after the term. */
  readonly definition: React.ReactNode;
}
/** A definition in the line: the term, then a compact gloss the reader never has to look up. */
export function Term({ children, definition, className, ...props }: TermProps) {
  return (
    <span className={cx("fux-term", className)} {...props}>
      <dfn className="fux-term-word">{children}</dfn>
      <span className="fux-term-gloss"> ({definition})</span>
    </span>
  );
}

export interface SparklineProps extends Omit<React.ComponentProps<"span">, "children"> {
  readonly values: readonly number[];
  /** What the series is, for assistive technology: "Weekly installs". */
  readonly label: string;
  /** A unit written after the endpoints: "cm", "ms". */
  readonly unit?: string;
  /** Hide the written endpoints. The accessible name still carries them. */
  readonly bare?: boolean;
}
/** A word-sized trend. It always states its first and last value, so the shape is never the only evidence. */
export function Sparkline({ values, label, unit, bare, className, ...props }: SparklineProps) {
  const width = 64;
  const height = 18;
  const pad = 2.5;
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const x = (index: number) =>
    values.length < 2 ? width / 2 : pad + (index * (width - pad * 2)) / (values.length - 1);
  const y = (value: number) => height - pad - ((value - low) / span) * (height - pad * 2);
  const round = (value: number) => Math.round(value * 100) / 100;
  const points = values.map((value, index) => `${round(x(index))},${round(y(value))}`).join(" ");
  const first = values[0];
  const last = values.at(-1);
  const suffix = unit ? ` ${unit}` : "";
  if (first === undefined || last === undefined) return null;
  return (
    <span
      className={cx("fux-sparkline", className)}
      role="img"
      aria-label={`${label}: ${first}${suffix} to ${last}${suffix}`}
      {...props}
    >
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
        <polyline points={points} fill="none" className="fux-sparkline-line" />
        <circle
          cx={round(x(values.length - 1))}
          cy={round(y(last))}
          r="2.2"
          className="fux-sparkline-end"
        />
      </svg>
      {!bare && (
        <span className="fux-sparkline-ends" aria-hidden="true">
          {first}
          <span className="fux-sparkline-arrow"> → </span>
          {last}
          {suffix}
        </span>
      )}
    </span>
  );
}

export interface KeyChordProps extends Omit<SpanProps, "children"> {
  /** Keys pressed together are joined by "+". Presses in sequence are joined by " then ": "Cmd+K then S". */
  readonly keys: string;
}
/** Keys to press. Together is "+", in sequence is "then", and the two never look alike. */
export function KeyChord({ keys, className, ...props }: KeyChordProps) {
  const presses = keys.split(/\s+then\s+/i).map((press) => press.split("+").map((k) => k.trim()));
  return (
    <span className={cx("fux-keychord", className)} {...props}>
      {presses.map((press, pressIndex) => (
        <React.Fragment key={pressIndex}>
          {pressIndex > 0 && <span className="fux-keychord-then"> then </span>}
          <kbd className="fux-keychord-press">
            {press.map((key, keyIndex) => (
              <React.Fragment key={keyIndex}>
                {keyIndex > 0 && (
                  <span className="fux-keychord-plus" aria-hidden="true">
                    +
                  </span>
                )}
                <kbd className="fux-key">{key}</kbd>
              </React.Fragment>
            ))}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
}

/** An exact identifier, flag or file name, where case and punctuation matter. */
export function Literal({ className, ...props }: React.ComponentProps<"code">) {
  return <code className={cx("fux-literal", className)} {...props} />;
}

export interface DatedValueProps extends Omit<SpanProps, "children"> {
  /** The value that will go stale. */
  readonly children: React.ReactNode;
  /** When it was true, as the reader should see it: "Nov 2026". */
  readonly date: string;
  /** A machine-readable date for the time element: "2026-11". */
  readonly dateTime?: string;
}
/** A value that keeps its date attached, so an old number never reads as current. */
export function DatedValue({ children, date, dateTime, className, ...props }: DatedValueProps) {
  return (
    <span className={cx("fux-dated", className)} {...props}>
      <span className="fux-dated-value">{children}</span>
      <time className="fux-dated-date" dateTime={dateTime}>
        as of {date}
      </time>
    </span>
  );
}

export type Stage = "planned" | "started" | "half" | "most" | "done" | "held";
const STAGE_MARKS: Record<Stage, React.ReactNode> = {
  planned: (
    <circle
      cx="8"
      cy="8"
      r="5.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeDasharray="2 2.2"
    />
  ),
  started: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5H8z" fill="currentColor" />
    </>
  ),
  half: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill="currentColor" />
    </>
  ),
  most: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 2.5a5.5 5.5 0 1 1-5.5 5.5H8z" fill="currentColor" />
    </>
  ),
  done: <circle cx="8" cy="8" r="5.5" fill="currentColor" />,
  held: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="8" r="1.8" fill="currentColor" />
    </>
  ),
};
export interface StageGlyphProps extends Omit<SpanProps, "children"> {
  readonly stage: Stage;
  /** The word the glyph stands beside. Shape carries the stage; the word names it. */
  readonly children: React.ReactNode;
}
/** How far along something is, by shape and always with its word, so it reads without colour. */
export function StageGlyph({ stage, children, className, ...props }: StageGlyphProps) {
  return (
    <span className={cx("fux-stage", className)} data-stage={stage} {...props}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
        {STAGE_MARKS[stage]}
      </svg>
      <span>{children}</span>
    </span>
  );
}

export interface MarkerProps extends Omit<SpanProps, "children"> {
  /** The number or letter shown in the marker. */
  readonly children: React.ReactNode;
}
/** A numbered dot that ties a place in a figure to the sentence about it. */
export function Marker({ children, className, ...props }: MarkerProps) {
  return (
    <span className={cx("fux-marker", className)} {...props}>
      {children}
    </span>
  );
}

/** The opening paragraph of a piece, with a raised initial. Use it once. */
export function DropCap({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cx("fux-dropcap", className)} {...props} />;
}

/** The small line above a headline that says what kind of thing this is. Sentence case. */
export function Kicker({ className, ...props }: React.ComponentProps<"p">) {
  return <p className={cx("fux-kicker", className)} {...props} />;
}

export interface PlaybackProps extends Omit<React.ComponentProps<"div">, "onSelect"> {
  readonly playing: boolean;
  readonly onToggle: () => void;
  /** The current step, from 0. */
  readonly index: number;
  readonly count: number;
  readonly onSelect?: (index: number) => void;
  /** What is playing, for the control's accessible name: "the build loop". */
  readonly label: string;
  /** Names for the steps, used as each dot's accessible name. */
  readonly stepLabels?: readonly string[];
  /**
   * Render the control in place but inert. Pass `!ready` from `useAutoplay` so the server markup
   * already holds the control's space and nothing shifts when the page hydrates.
   */
  readonly disabled?: boolean;
}
/** The pause control every self-running figure carries, with one dot per step. */
export function Playback({
  playing,
  onToggle,
  index,
  count,
  onSelect,
  label,
  stepLabels,
  disabled,
  className,
  ...props
}: PlaybackProps) {
  return (
    <div className={cx("fux-playback", className)} role="group" aria-label={label} {...props}>
      <button
        type="button"
        className="fux-playback-toggle"
        aria-pressed={playing}
        disabled={disabled}
        onClick={onToggle}
      >
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" focusable="false">
          {playing ? (
            <path d="M2.5 1.5h2.4v9H2.5zM7.1 1.5h2.4v9H7.1z" fill="currentColor" />
          ) : (
            <path d="M3 1.2 10.2 6 3 10.8z" fill="currentColor" />
          )}
        </svg>
        <span>{playing ? "Pause" : "Play"}</span>
      </button>
      <span className="fux-playback-steps">
        {Array.from({ length: count }, (_, step) => (
          <button
            key={step}
            type="button"
            className="fux-playback-step"
            aria-label={stepLabels?.[step] ?? `Step ${step + 1} of ${count}`}
            aria-current={step === index ? "step" : undefined}
            disabled={disabled}
            onClick={() => onSelect?.(step)}
          />
        ))}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Controls for explorables. Native inputs with editorial styling: nothing here needs a framework.
// ---------------------------------------------------------------------------------------------

export interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: React.ReactNode;
}
export interface ChoiceProps<T extends string> extends Omit<
  React.ComponentProps<"fieldset">,
  "onChange" | "children"
> {
  /** What is being chosen. */
  readonly legend: React.ReactNode;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T;
  readonly onValueChange: (value: T) => void;
  /** Groups the radios. Defaults to a generated name. */
  readonly name?: string;
}
/** One choice among a few, as a row of native radios. */
export function Choice<T extends string>({
  legend,
  options,
  value,
  onValueChange,
  name,
  className,
  ...props
}: ChoiceProps<T>) {
  const generated = React.useId();
  return (
    <fieldset className={cx("fux-choice", className)} {...props}>
      <legend className="fux-control-label">{legend}</legend>
      <div className="fux-choice-options">
        {options.map((option) => (
          <label key={option.value} className="fux-choice-option">
            <input
              type="radio"
              name={name ?? generated}
              value={option.value}
              checked={option.value === value}
              onChange={() => onValueChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export interface RangeProps extends Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "children"
> {
  readonly label: React.ReactNode;
  readonly value: number;
  readonly onValueChange: (value: number) => void;
  /** The value as the reader should see it: "3 of 5", "40%". */
  readonly display?: React.ReactNode;
}
/** One number the reader can drag, with its value written beside it. */
export function Range({ label, value, onValueChange, display, className, ...props }: RangeProps) {
  return (
    <label className={cx("fux-range", className)}>
      <span className="fux-control-label">{label}</span>
      <input
        type="range"
        value={value}
        onChange={(event) => onValueChange(Number(event.currentTarget.value))}
        {...props}
      />
      <output className="fux-range-value">{display ?? value}</output>
    </label>
  );
}

export interface ActionProps extends React.ComponentProps<"button"> {
  /** `quiet` is the default; `strong` is the one action a figure is about. */
  readonly tone?: "quiet" | "strong";
}
/** A small button for a figure's one or two actions. */
export function Action({ tone = "quiet", className, type = "button", ...props }: ActionProps) {
  return <button type={type} className={cx("fux-action", className)} data-tone={tone} {...props} />;
}
