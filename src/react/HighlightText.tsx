"use client";

import { Fragment } from "react";
import { Button } from "@base-ui/react/button";
import { segmentText, validTextRange, type TextRange } from "../core/text-intelligence.js";

export interface TextHighlight extends TextRange {
  readonly key: string;
  readonly tone?: string;
  readonly label?: string;
}
export interface HighlightTextProps {
  readonly text: string;
  readonly highlights: readonly TextHighlight[];
  readonly selectedKey?: string | null;
  readonly onActivate?: (key: string, highlight: TextHighlight) => void;
  readonly className?: string;
}
/** Flat source-coordinate decoration: overlaps never duplicate text or nest interactive controls. */
export function HighlightText({
  text,
  highlights,
  selectedKey,
  onActivate,
  className,
}: HighlightTextProps) {
  const keys = new Set<string>();
  const ranges = highlights.filter((highlight) => {
    if (
      !highlight ||
      typeof highlight.key !== "string" ||
      !highlight.key ||
      keys.has(highlight.key) ||
      !validTextRange(highlight, text, false)
    )
      return false;
    keys.add(highlight.key);
    return true;
  });
  const chunks: {
    start: number;
    end: number;
    text: string;
    highlight: TextHighlight | undefined;
  }[] = [];
  for (const segment of segmentText(text, ranges)) {
    const highlight =
      segment.layers.find((item) => item.key === selectedKey) ??
      [...segment.layers].sort((a, b) => a.end - a.start - (b.end - b.start))[0];
    const previous = chunks.at(-1);
    if (previous && previous.highlight?.key === highlight?.key) {
      previous.end = segment.end;
      previous.text += segment.text;
    } else chunks.push({ ...segment, highlight });
  }
  const actionable = new Set<string>();
  const content = chunks.map((chunk) => {
    const highlight = chunk.highlight;
    if (!highlight) return <Fragment key={chunk.start}>{chunk.text}</Fragment>;
    const firstAction = !actionable.has(highlight.key);
    if (onActivate) actionable.add(highlight.key);
    const props = {
      className: "fux-highlight",
      "data-tone": highlight.tone,
      "data-highlight-key": highlight.key,
      "data-selected": highlight.key === selectedKey ? "true" : undefined,
    };
    return onActivate ? (
      <Button
        key={chunk.start}
        {...props}
        type="button"
        className="fux-control fux-highlight"
        tabIndex={firstAction ? 0 : -1}
        aria-label={highlight.label ?? text.slice(highlight.start, highlight.end)}
        aria-pressed={highlight.key === selectedKey}
        onClick={() => onActivate(highlight.key, highlight)}
      >
        {chunk.text}
      </Button>
    ) : (
      <mark key={chunk.start} {...props} aria-label={highlight.label}>
        {chunk.text}
      </mark>
    );
  });
  // A fully occluded overlapping range still gets exactly one keyboard action. Empty
  // buttons are named accessibly without repeating or changing the visible source text.
  const covered = onActivate ? ranges.filter((highlight) => !actionable.has(highlight.key)) : [];
  return (
    <span className={["fux-highlight-text", className].filter(Boolean).join(" ")}>
      {content}
      {covered.length > 0 && (
        <span className="fux-highlight__extra-actions">
          {covered.map((highlight) => (
            <Button
              key={highlight.key}
              type="button"
              className="fux-control fux-highlight fux-highlight--extra"
              data-highlight-key={highlight.key}
              data-tone={highlight.tone}
              data-selected={highlight.key === selectedKey ? "true" : undefined}
              aria-label={highlight.label ?? text.slice(highlight.start, highlight.end)}
              aria-pressed={highlight.key === selectedKey}
              onClick={() => onActivate?.(highlight.key, highlight)}
            />
          ))}
        </span>
      )}
    </span>
  );
}
