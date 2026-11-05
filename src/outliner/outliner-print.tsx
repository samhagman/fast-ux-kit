import * as React from "react";
import { createPortal } from "react-dom";
import { findOutlineNode } from "../core/index.js";
import { useOutlinerContext } from "./context.js";
import { InlineText, inlineToPlain } from "./inline.js";
import { loadMathEngine } from "./math.js";
import { OutlinerArticle, type ArticleParts } from "./outliner-article.js";
import { RichContentProvider, RichNote } from "./rich-note-view.js";
import type { OutlineItem } from "./types.js";

/**
 * Print / Save as PDF: the current zoom (or the whole document) printed as its article, with no
 * chrome. A print request mounts a print-only copy of the article at the end of <body>; the
 * print stylesheet (outliner-views.css) hides everything else on paper, forces light colours and
 * lets the page flow. The browser's own dialog offers "Save as PDF".
 *
 *   ⌘K › Print / Save as PDF ─▶ requestPrint(owner) ─▶ <PrintSheet> portal ─▶ math + images ready
 *                                                    ─▶ window.print() ─▶ afterprint ─▶ unmount
 */
interface PrintRequest {
  /** The outliner that asked (a workspace has several mounted; only the asker prints). */
  readonly owner: object;
  readonly rootId: string | null;
}
let current: PrintRequest | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function requestPrint(owner: object, rootId: string | null) {
  current = { owner, rootId };
  emit();
}
export function endPrint() {
  if (!current) return;
  current = null;
  emit();
}

/** Mounted once per outliner; renders only while that outliner has a print request. */
export function OutlinerPrintHost({
  owner,
  title,
  parts,
}: {
  readonly owner: object;
  readonly title: string;
  readonly parts: ArticleParts;
}) {
  const request = React.useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
  if (!request || request.owner !== owner || typeof document === "undefined") return null;
  return createPortal(
    <PrintSheet rootId={request.rootId} title={title} parts={parts} />,
    document.body,
  );
}

function PrintSheet({
  rootId,
  title,
  parts,
}: {
  readonly rootId: string | null;
  readonly title: string;
  readonly parts: ArticleParts;
}) {
  const { ol } = useOutlinerContext();
  const ref = React.useRef<HTMLDivElement>(null);
  const root = rootId
    ? (findOutlineNode(ol.state.nodes, rootId)?.node as OutlineItem | undefined)
    : undefined;
  const items = root ? (root.children ?? []) : ol.state.nodes;
  const path = rootId
    ? (findOutlineNode(ol.state.nodes, rootId)?.ancestors ?? []).map((node) =>
        inlineToPlain(node.text),
      )
    : [];

  React.useEffect(() => {
    let cancelled = false;
    const sheet = ref.current;
    const ready = async () => {
      // Formulas typeset and images decoded before the page is captured (bounded: a slow image
      // never holds the dialog back for long).
      const waits: Promise<unknown>[] = [];
      if (sheet?.querySelector("[data-math]"))
        waits.push(
          loadMathEngine().then(() => new Promise((resolve) => requestAnimationFrame(resolve))),
        );
      for (const img of sheet?.querySelectorAll("img") ?? [])
        if (!img.complete) waits.push(img.decode().catch(() => undefined));
      await Promise.race([Promise.all(waits), new Promise((resolve) => setTimeout(resolve, 2500))]);
      await new Promise((resolve) => requestAnimationFrame(resolve));
      if (cancelled) return;
      window.print();
    };
    const done = () => endPrint();
    window.addEventListener("afterprint", done);
    void ready();
    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", done);
    };
  }, []);

  const printed = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <RichContentProvider print>
      <div ref={ref} className="ol-print-root" data-print-root="" aria-hidden>
        <header className="mb-6 border-b border-hairline pb-3">
          {root && (
            <p className="mb-1 font-mono text-[8.5pt] tracking-wide text-muted-foreground">
              {[title, ...path].join("  ›  ")}
            </p>
          )}
          <h1 className="text-[20pt] leading-tight font-semibold tracking-[-0.015em] text-balance">
            {root ? <InlineText source={root.text || "Untitled"} /> : title}
          </h1>
          {root?.data?.note && (
            <div className="mt-1.5 text-[11pt] text-muted-foreground">
              <RichNote source={root.data.note} headingLevel={3} prose />
            </div>
          )}
          <p className="mt-2 font-mono text-[8pt] text-muted-foreground">{printed}</p>
        </header>
        <OutlinerArticle items={items} parts={parts} print />
      </div>
    </RichContentProvider>
  );
}
