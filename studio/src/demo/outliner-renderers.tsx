import * as React from "react";
import { motion } from "motion/react";
import { Play } from "lucide-react";
import { motionTokens } from "@/lib/motion";
import type { OutlineRenderers } from "@/registry/outliner/rich-note-view";

/**
 * Demo host renderers for trusted embeds in notes. A real host would map `embed:video` to its
 * own player and `embed:chart` to its charting; the document only carries the block's text.
 */
export const demoRenderers: OutlineRenderers = {
  "embed:video": ({ source, print }) => <VideoCard caption={source.trim()} print={print} />,
  "embed:chart": ({ source }) => <BarChart source={source} />,
};

function VideoCard({ caption, print }: { readonly caption: string; readonly print: boolean }) {
  const [playing, setPlaying] = React.useState(false);
  return (
    <span className="flex max-w-sm flex-col gap-1">
      <button
        type="button"
        onClick={() => setPlaying((value) => !value)}
        aria-label={`${playing ? "Pause" : "Play"}: ${caption}`}
        className="group/video relative block aspect-video w-full overflow-hidden rounded-md border border-hairline bg-[oklch(0.2_0.02_265)] text-start outline-none focus-visible:ring-3 focus-visible:ring-signal/35"
      >
        <span aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,oklch(0.45_0.12_260/0.55),transparent_60%)]" />
        {!print && (
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid size-11 place-items-center rounded-full bg-white/90 text-[oklch(0.2_0.02_265)] shadow-sm transition-transform group-hover/video:scale-105">
              <Play className="ms-0.5 size-4 fill-current" />
            </span>
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 h-1 bg-white/15">
          <motion.span
            className="block h-full bg-white/80"
            initial={false}
            animate={{ width: playing ? "100%" : "0%" }}
            transition={playing ? { duration: 30, ease: "linear" } : motionTokens.quick}
          />
        </span>
      </button>
      <span className="text-[11.5px] text-muted-foreground">{caption}</span>
    </span>
  );
}

function BarChart({ source }: { readonly source: string }) {
  const rows = source
    .split("\n")
    .map((line) => /^(.+?)\s+(-?\d+(?:\.\d+)?)\s*$/.exec(line.trim()))
    .filter((match): match is RegExpExecArray => !!match)
    .map((match) => ({ label: match[1]!, value: Number(match[2]) }));
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <span role="img" aria-label={rows.map((row) => `${row.label} ${row.value} ms`).join(", ")} className="flex max-w-md flex-col gap-1 rounded-md border border-hairline p-2.5">
      {rows.map((row, index) => (
        <span key={row.label} className="grid grid-cols-[5.5rem_1fr_2.5rem] items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <span className="truncate">{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted">
            <motion.span
              className="block h-full rounded-full bg-signal"
              initial={{ width: 0 }}
              animate={{ width: `${(row.value / max) * 100}%` }}
              transition={{ ...motionTokens.slow, delay: index * 0.04 }}
            />
          </span>
          <span className="text-end text-foreground tabular-nums">{row.value}</span>
        </span>
      ))}
    </span>
  );
}
