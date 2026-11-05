import * as React from "react";
import { cn } from "../lib/utils.js";

/**
 * TeX math: `$…$` inline (titles and notes) and `$$…$$` blocks (notes). The source is the
 * document; rendering is a projection of it, like every other inline mark.
 *
 *   $e^{i\pi} + 1 = 0$      →  e^{iπ} + 1 = 0, typeset
 *   $$                       →  a centred display formula, scrolls sideways when wide
 *   \int_0^1 x^2\,dx
 *   $$
 *
 * KaTeX is loaded on first use (`katex-render.ts`); until it arrives, or if it never does, the
 * TeX source shows as quiet monospace text. The formula's accessible name is its TeX source.
 */
type Engine = typeof import("./katex-render.js");
let engine: Engine | null = null;
let pending: Promise<Engine> | null = null;

export function loadMathEngine(): Promise<Engine> {
  pending ??= import("./katex-render.js").then((module) => (engine = module));
  return pending;
}

export function MathTex({
  tex,
  display = false,
  src,
  className,
}: {
  readonly tex: string;
  /** A display (block) formula. */
  readonly display?: boolean;
  /** Source offset for click-to-caret (the formula is atomic: the caret lands at its start). */
  readonly src?: number;
  readonly className?: string;
}) {
  const ref = React.useRef<HTMLSpanElement>(null);
  // Starts empty on the server and on the first client render (SSR-stable); a cached engine is
  // picked up in a layout effect, before paint, so there is no flash of source text.
  const [ready, setReady] = React.useState<Engine | null>(null);
  React.useLayoutEffect(() => {
    if (engine) setReady(engine);
    else
      loadMathEngine().then(setReady, () => {
        /* stays plain text */
      });
  }, []);
  React.useLayoutEffect(() => {
    if (ready && ref.current) ready.renderTex(tex, ref.current, display);
  }, [ready, tex, display]);
  return (
    <span
      role="math"
      aria-label={tex}
      data-src={src}
      data-atomic=""
      data-math={display ? "block" : "inline"}
      className={cn(
        display
          ? "ol-math-block block overflow-x-auto overflow-y-hidden py-1.5 text-center"
          : "ol-math",
        className,
      )}
    >
      {!ready && (
        <code className="font-mono text-[0.88em] text-muted-foreground">
          {display ? tex : `$${tex}$`}
        </code>
      )}
      {/* KaTeX owns this node's children; React never renders into it. */}
      <span ref={ref} aria-hidden />
    </span>
  );
}
