export * from "../core/outliner/types.js";
import type { OutlineColor } from "../core/outliner/types.js";

/** Label swatches stay muted so color reads as a tag, never as an alert. Rows show a start stripe
 *  (`bar`) plus the faintest tint (`row`), so a colour never reads as focus or selection. */
export const COLOR_STYLES: Record<
  OutlineColor,
  { readonly dot: string; readonly row: string; readonly bar: string; readonly label: string }
> = {
  red: {
    dot: "bg-[oklch(0.64_0.19_25)]",
    row: "bg-[oklch(0.64_0.19_25/0.03)]",
    bar: "bg-[oklch(0.64_0.19_25)]",
    label: "Red",
  },
  orange: {
    dot: "bg-[oklch(0.72_0.16_55)]",
    row: "bg-[oklch(0.72_0.16_55/0.035)]",
    bar: "bg-[oklch(0.72_0.16_55)]",
    label: "Orange",
  },
  yellow: {
    dot: "bg-[oklch(0.8_0.15_90)]",
    row: "bg-[oklch(0.82_0.15_90/0.045)]",
    bar: "bg-[oklch(0.8_0.15_90)]",
    label: "Yellow",
  },
  green: {
    dot: "bg-[oklch(0.66_0.14_150)]",
    row: "bg-[oklch(0.66_0.14_150/0.03)]",
    bar: "bg-[oklch(0.66_0.14_150)]",
    label: "Green",
  },
  blue: {
    dot: "bg-[oklch(0.62_0.16_250)]",
    row: "bg-[oklch(0.62_0.16_250/0.025)]",
    bar: "bg-[oklch(0.62_0.16_250)]",
    label: "Blue",
  },
  purple: {
    dot: "bg-[oklch(0.6_0.18_300)]",
    row: "bg-[oklch(0.6_0.18_300/0.03)]",
    bar: "bg-[oklch(0.6_0.18_300)]",
    label: "Purple",
  },
};
