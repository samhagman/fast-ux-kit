import type * as React from "react";
import { cn } from "../lib/utils.js";

// Text styles: headings, body text, kicker lines and term/detail lists. Each family is the
// right element with data attributes; `text.css` styles them from theme tokens only.

/** A heading's semantic level: the element it renders, `h1` to `h6`. */
export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
/** How large a heading looks, whatever its level. */
export type HeadingSize = "display" | "title" | "section" | "subsection";
/** The colour role of a line of text. Status tones are mixed toward the foreground to stay readable. */
export type TextTone = "default" | "muted" | "info" | "success" | "warning" | "error";
/** Body text sizes. `md` is the body size. */
export type TextSize = "sm" | "md" | "lg";

const sizeForLevel: Readonly<Record<HeadingLevel, HeadingSize>> = {
  1: "title",
  2: "section",
  3: "subsection",
  4: "subsection",
  5: "subsection",
  6: "subsection",
};

export interface HeadingProps extends React.HTMLAttributes<HTMLHeadingElement> {
  /** The element, `h1` to `h6`. Pick it from the page outline, not from the look. */
  level: HeadingLevel;
  /**
   * The look, independent of `level`: an `h3` can look like a page title. Defaults from the
   * level: `h1` is a title, `h2` a section, `h3` to `h6` a subsection.
   */
  size?: HeadingSize;
}

/**
 * A heading in the theme's heading font. `level` is the element; `size` is how large it looks.
 * `display` scales down with the width of its container, to the title size at its narrowest.
 */
export function Heading({ level, size, className, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag
      {...props}
      className={cn("fux-heading", className)}
      data-size={size ?? sizeForLevel[level]}
    />
  );
}

export interface TextProps extends React.HTMLAttributes<HTMLElement> {
  /** `p` for a paragraph (the default), `span` for text inside another line. */
  as?: "p" | "span";
  /**
   * `sm`, `md` or `lg`. A paragraph defaults to `md`; a span keeps the size of the line it sits
   * in unless you give it one.
   */
  size?: TextSize;
  /** `default` inherits the surrounding colour; `muted` is for notes; the rest are status tones. */
  tone?: TextTone;
}

/** Body text at a size and tone from the theme. */
export function Text({ as: Tag = "p", size, tone = "default", className, ...props }: TextProps) {
  return (
    <Tag
      {...props}
      className={cn("fux-text", className)}
      data-size={size ?? (Tag === "p" ? "md" : undefined)}
      data-tone={tone}
    />
  );
}

export interface EyebrowProps extends React.HTMLAttributes<HTMLElement> {
  /** `p` (the default) or `span`. */
  as?: "p" | "span";
  /** `muted` (the default), `default` or a status tone, such as `error` above a failed step. */
  tone?: TextTone;
}

/**
 * A short kicker or label line above a heading: small capitals in the theme's mono font. The
 * capitals are a style, so the text is read as written.
 */
export function Eyebrow({ as: Tag = "p", tone = "muted", className, ...props }: EyebrowProps) {
  return <Tag {...props} className={cn("fux-eyebrow", className)} data-tone={tone} />;
}

/** One term and its detail. */
export interface DescriptionItem {
  readonly term: React.ReactNode;
  readonly detail: React.ReactNode;
  /** A stable React key, when terms repeat or the list reorders. */
  readonly id?: string;
}

export interface DescriptionListProps extends Omit<
  React.HTMLAttributes<HTMLDListElement>,
  "children"
> {
  readonly items: readonly DescriptionItem[];
  /**
   * `stacked` (the default) puts each detail under its term. `inline` puts it beside its term
   * while the list is wide enough, and under it when the list is narrow.
   */
  layout?: "stacked" | "inline";
}

/** Terms and their details, as a real `dl`. Each pair is a `div` holding one `dt` and one `dd`. */
export function DescriptionList({
  items,
  layout = "stacked",
  className,
  ...props
}: DescriptionListProps) {
  return (
    <dl {...props} className={cn("fux-dl", className)} data-layout={layout}>
      {items.map((item, index) => (
        <div key={item.id ?? index}>
          <dt>{item.term}</dt>
          <dd>{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
