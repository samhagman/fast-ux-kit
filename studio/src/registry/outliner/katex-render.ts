import katex from "katex";
import "katex/dist/katex.min.css";

/**
 * The only file that knows KaTeX. It is loaded on demand (math.tsx imports it dynamically), so
 * documents without math never download the engine or its fonts.
 *
 * Safety: `trust: false` turns off every command that could reach outside the formula
 * (\href, \url, \includegraphics, \htmlClass, \htmlData, …); `throwOnError: false` renders a
 * formula that does not parse as its own source, coloured as an error, instead of throwing;
 * `maxExpand` and `maxSize` bound macro loops and absurd sizes. KaTeX builds DOM nodes itself
 * (no HTML string from the document is ever parsed).
 */
const OPTIONS = {
  throwOnError: false,
  trust: false,
  strict: "ignore",
  output: "html",
  maxExpand: 300,
  maxSize: 40,
  errorColor: "var(--destructive)",
} as const;

export function renderTex(tex: string, el: HTMLElement, display: boolean): void {
  katex.render(tex, el, { ...OPTIONS, displayMode: display });
}

/** Same rendering as markup (tests, and any host that wants static output). */
export function texToMarkup(tex: string, display = false): string {
  return katex.renderToString(tex, { ...OPTIONS, displayMode: display });
}
