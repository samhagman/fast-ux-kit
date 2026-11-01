import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Copy, ImageOff, Maximize2, Puzzle } from "lucide-react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { InlineText, type InlineRange, type InlineSegment } from "./inline";
import { MathTex } from "./math";
import { isRichNote, parseNoteBlocks, type NoteBlock, type NoteList, type SourceRange } from "./rich-note";

/**
 * Trusted embeds: the HOST decides what a fenced block like
 *
 *   ```embed:video
 *   dQw4w9WgXcQ
 *   ```
 *
 * becomes, by passing `renderers={{ "embed:video": ({ source }) => <Player id={source} /> }}`
 * to the Outliner. The document only ever carries the block's text; a renderer is the host's own
 * React code. Blocks without a renderer show as code. A renderer that throws shows as code too.
 */
export interface OutlineRendererProps {
  /** The block's body, verbatim. */
  readonly source: string;
  /** The fence's info string (the renderer's key), e.g. "embed:video". */
  readonly lang: string;
  /** True when printing (renderers can swap a live player for a still). */
  readonly print: boolean;
}
export type OutlineRenderer = (props: OutlineRendererProps) => React.ReactNode;
export type OutlineRenderers = Readonly<Record<string, OutlineRenderer>>;

interface RichContext {
  readonly renderers: OutlineRenderers;
  /** Print rendering: images load eagerly, embeds get `print`, copy buttons hide. */
  readonly print: boolean;
}
const RichContentContext = React.createContext<RichContext>({ renderers: {}, print: false });

export function RichContentProvider({
  renderers,
  print,
  children,
}: {
  readonly renderers?: OutlineRenderers;
  readonly print?: boolean;
  readonly children: React.ReactNode;
}) {
  const parent = React.useContext(RichContentContext);
  const value = React.useMemo(
    () => ({ renderers: renderers ?? parent.renderers, print: print ?? parent.print }),
    [renderers, print, parent],
  );
  return <RichContentContext.Provider value={value}>{children}</RichContentContext.Provider>;
}
export const useRichContent = () => React.useContext(RichContentContext);

interface InlineHandlers {
  readonly onTag?: (tag: string) => void;
  readonly onRef?: (title: string, id?: string) => void;
  readonly onDate?: (segment: InlineSegment, el: HTMLElement) => void;
  readonly resolveRef?: (id: string) => string | null;
}

export interface RichNoteProps extends InlineHandlers {
  readonly source: string;
  /** Search highlights (offsets into `source`). */
  readonly marks?: readonly InlineRange[];
  /**
   * Note headings render as real `<h*>` elements starting at this level (article view, print).
   * Unset: they are styled text, so a note never adds headings to the page outline of a tree.
   */
  readonly headingLevel?: number;
  /** Prose scale (article view): larger type and more air between blocks. */
  readonly prose?: boolean;
  readonly className?: string;
}

/**
 * A note rendered as blocks. A plain note (no block syntax) renders exactly like inline text,
 * so ordinary notes look the way they always did.
 */
export const RichNote = React.memo(function RichNote({ source, marks, headingLevel, prose = false, className, ...handlers }: RichNoteProps) {
  const blocks = React.useMemo(() => parseNoteBlocks(source), [source]);
  if (!isRichNote(source)) return <InlineText source={source} marks={marks} className={className} {...handlers} />;
  return (
    <span data-rich-note="" className={cn("flex flex-col", prose ? "gap-3" : "gap-1.5", className)}>
      {blocks.map((block) => (
        <Block key={block.start} block={block} source={source} marks={marks} headingLevel={headingLevel} prose={prose} handlers={handlers} />
      ))}
    </span>
  );
});

interface BlockProps {
  readonly block: NoteBlock;
  readonly source: string;
  readonly marks?: readonly InlineRange[];
  readonly headingLevel?: number;
  readonly prose: boolean;
  readonly handlers: InlineHandlers;
}

function Text({ source, range, marks, handlers, className }: { source: string; range: SourceRange; marks?: readonly InlineRange[]; handlers: InlineHandlers; className?: string }) {
  return <InlineText source={source.slice(range.start, range.end)} offset={range.start} marks={marks} className={className} {...handlers} />;
}

/** Stop a rendered control's gestures from reaching the note (which would start editing). */
const keep = {
  onPointerDown: (event: React.SyntheticEvent) => event.stopPropagation(),
  onMouseDown: (event: React.SyntheticEvent) => event.stopPropagation(),
  onClick: (event: React.SyntheticEvent) => event.stopPropagation(),
};

function Block({ block, source, marks, headingLevel, prose, handlers }: BlockProps) {
  switch (block.kind) {
    case "paragraph":
      return (
        <span className="block">
          <Text source={source} range={block.text} marks={marks} handlers={handlers} />
        </span>
      );
    case "heading": {
      const size = prose
        ? ["text-[1.25em]", "text-[1.15em]", "text-[1.05em]", "text-[1em]", "text-[1em]", "text-[1em]"][block.level - 1]
        : ["text-[1.08em]", "text-[1.02em]", "text-[1em]", "text-[1em]", "text-[1em]", "text-[1em]"][block.level - 1];
      const className = cn("block font-semibold tracking-[-0.01em] text-foreground", prose ? "mt-2" : "mt-0.5", size);
      const content = <Text source={source} range={block.text} marks={marks} handlers={handlers} />;
      if (headingLevel === undefined) return <span className={className}>{content}</span>;
      const Tag = `h${Math.min(6, headingLevel + block.level - 1)}` as "h3";
      return <Tag className={className}>{content}</Tag>;
    }
    case "quote":
      return (
        <span className="block border-s-2 border-foreground/15 ps-3 text-muted-foreground italic">
          {block.lines.map((line) => (
            <span key={line.start} className="block">
              <Text source={source} range={line} marks={marks} handlers={handlers} />
            </span>
          ))}
        </span>
      );
    case "list":
      return <ListView list={block.list} source={source} marks={marks} handlers={handlers} />;
    case "rule":
      return <span role="separator" className="my-1 block h-px bg-hairline" />;
    case "code":
      return <CodeOrEmbed lang={block.lang} code={block.code} source={source} marks={marks} start={block.start} />;
    case "math":
      return <MathTex tex={source.slice(block.tex.start, block.tex.end)} display src={block.start} className="text-foreground" />;
    case "image":
      return <ImageBlock block={block} />;
    case "table":
      return <TableView block={block} source={source} marks={marks} handlers={handlers} />;
  }
}

function ListView({ list, source, marks, handlers }: { list: NoteList; source: string; marks?: readonly InlineRange[]; handlers: InlineHandlers }) {
  const tasks = list.items.some((item) => item.checked !== undefined);
  const Tag = list.ordered ? "ol" : "ul";
  return (
    <Tag
      start={list.ordered && list.first !== 1 ? list.first : undefined}
      className={cn(
        "flex flex-col gap-0.5 ps-[1.15em] marker:text-muted-foreground/70",
        list.ordered ? "list-decimal marker:font-mono marker:text-[0.85em]" : "list-disc",
        tasks && "list-none ps-0",
      )}
    >
      {list.items.map((item) => (
        <li key={item.start} className={cn(item.checked !== undefined && "flex items-start gap-2")}>
          {item.checked !== undefined && (
            <span
              aria-hidden
              className={cn(
                "mt-[0.28em] grid size-[0.95em] shrink-0 place-items-center rounded-[3px] border",
                item.checked ? "border-signal/70 bg-signal/80 text-signal-foreground" : "border-foreground/25",
              )}
            >
              {item.checked && <Check className="size-[0.7em]" strokeWidth={3} />}
            </span>
          )}
          <span className={cn("min-w-0", item.checked && "text-muted-foreground line-through decoration-muted-foreground/50")}>
            {item.checked !== undefined && <span className="sr-only">{item.checked ? "Done: " : "To do: "}</span>}
            <Text source={source} range={item.text} marks={marks} handlers={handlers} />
            {item.children && <ListView list={item.children} source={source} marks={marks} handlers={handlers} />}
          </span>
        </li>
      ))}
    </Tag>
  );
}

function TableView({ block, source, marks, handlers }: { block: Extract<NoteBlock, { kind: "table" }>; source: string; marks?: readonly InlineRange[]; handlers: InlineHandlers }) {
  const align = (index: number) => {
    const value = block.align[index];
    return value === "center" ? "text-center" : value === "end" ? "text-end" : "text-start";
  };
  return (
    // Wide tables scroll inside the note instead of widening the row (phones).
    <span className="block max-w-full overflow-x-auto overscroll-x-contain rounded-md border border-hairline">
      <table className="w-full border-collapse text-[0.94em] tabular-nums">
        <thead>
          <tr className="bg-muted/50">
            {block.head.map((cell, index) => (
              <th key={cell.start} scope="col" className={cn("border-b border-hairline px-2 py-1 font-medium whitespace-nowrap text-foreground", align(index))}>
                <Text source={source} range={cell} marks={marks} handlers={handlers} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={row[0]?.start ?? r} className="border-b border-hairline last:border-b-0">
              {block.head.map((_, index) => {
                const cell = row[index];
                return (
                  <td key={index} className={cn("px-2 py-1 align-top", align(index))}>
                    {cell && <Text source={source} range={cell} marks={marks} handlers={handlers} />}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </span>
  );
}

/** Code with search highlights (plain text: code is never formatted or linked). */
function MarkedCode({ source, range, marks }: { source: string; range: SourceRange; marks?: readonly InlineRange[] }) {
  const hits = (marks ?? [])
    .map((mark) => ({ start: Math.max(mark.start, range.start), end: Math.min(mark.end, range.end) }))
    .filter((mark) => mark.end > mark.start)
    .sort((a, b) => a.start - b.start);
  if (!hits.length) return <span data-src={range.start}>{source.slice(range.start, range.end)}</span>;
  const out: React.ReactNode[] = [];
  let at = range.start;
  for (const hit of hits) {
    if (hit.start > at) out.push(<span key={`t${at}`} data-src={at}>{source.slice(at, hit.start)}</span>);
    out.push(
      <mark key={`m${hit.start}`} data-src={hit.start} className="rounded-[3px] bg-warning/30 text-inherit ring-1 ring-warning/40">
        {source.slice(hit.start, hit.end)}
      </mark>,
    );
    at = hit.end;
  }
  if (at < range.end) out.push(<span key={`t${at}`} data-src={at}>{source.slice(at, range.end)}</span>);
  return <>{out}</>;
}

function CodeOrEmbed({ lang, code, source, marks, start }: { lang: string; code: SourceRange; source: string; marks?: readonly InlineRange[]; start: number }) {
  const { renderers, print } = useRichContent();
  const body = source.slice(code.start, code.end);
  if (lang === "math" || lang === "latex" || lang === "tex") return <MathTex tex={body} display src={start} className="text-foreground" />;
  const renderer = Object.prototype.hasOwnProperty.call(renderers, lang) ? renderers[lang] : undefined;
  const fallback = <CodeBlock lang={lang} body={body} code={code} source={source} marks={marks} missing={lang.startsWith("embed:") && !renderer} />;
  if (!renderer) return fallback;
  return (
    <span data-embed={lang} data-src={start} data-atomic="" className="block max-w-full" {...keep}>
      <EmbedBoundary fallback={fallback} resetKeys={[renderer, body]}>
        <HostEmbed renderer={renderer} source={body} lang={lang} print={print} />
      </EmbedBoundary>
    </span>
  );
}

/** The host's renderer runs inside the boundary (a throw there falls back to code). */
function HostEmbed({ renderer, ...props }: OutlineRendererProps & { readonly renderer: OutlineRenderer }) {
  return <>{renderer(props)}</>;
}

/** Falls back to the code view when the renderer throws; a new renderer or source tries again. */
class EmbedBoundary extends React.Component<
  { readonly fallback: React.ReactNode; readonly resetKeys: readonly unknown[]; readonly children: React.ReactNode },
  { failed: boolean }
> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override componentDidUpdate(previous: { readonly resetKeys: readonly unknown[] }) {
    const keys = this.props.resetKeys;
    if (this.state.failed && (keys.length !== previous.resetKeys.length || keys.some((key, i) => key !== previous.resetKeys[i]))) this.setState({ failed: false });
  }
  override render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function CodeBlock({ lang, body, code, source, marks, missing }: { lang: string; body: string; code: SourceRange; source: string; marks?: readonly InlineRange[]; missing: boolean }) {
  const { print } = useRichContent();
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
    } catch {
      /* clipboard refused: nothing to undo */
    }
  };
  return (
    <span data-code-block={lang || ""} className="group/code relative block max-w-full overflow-hidden rounded-md border border-hairline bg-muted/45 text-foreground/90">
      {(lang || !print) && (
        <span className="flex h-6 items-center gap-1.5 border-b border-hairline ps-2.5 pe-1 font-mono text-[10.5px] tracking-wide text-muted-foreground coarse:h-9" dir="ltr">
          {missing && <Puzzle aria-hidden className="size-3" />}
          <span className="min-w-0 flex-1 truncate">{lang ? (missing ? `${lang} · no renderer` : lang) : "code"}</span>
          {!print && (
            <button
              type="button"
              {...keep}
              onClick={(event) => {
                event.stopPropagation();
                void copy();
              }}
              aria-label={copied ? "Copied" : "Copy code"}
              className="relative grid size-5 place-items-center rounded-[4px] text-muted-foreground transition-colors after:absolute after:-inset-1.5 hover:bg-foreground/[0.06] hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:outline-none coarse:size-8"
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={copied ? "done" : "copy"}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={motionTokens.quick}
                  className="grid place-items-center"
                >
                  {copied ? <Check className="size-3 text-success" /> : <Copy className="size-3" />}
                </motion.span>
              </AnimatePresence>
            </button>
          )}
        </span>
      )}
      <pre dir="ltr" className="overflow-x-auto overscroll-x-contain px-2.5 py-1.5 font-mono text-[11.5px] leading-[18px] whitespace-pre print:whitespace-pre-wrap">
        <code>
          <MarkedCode source={source} range={code} marks={marks} />
        </code>
      </pre>
    </span>
  );
}

function ImageBlock({ block }: { block: Extract<NoteBlock, { kind: "image" }> }) {
  const { print } = useRichContent();
  const [open, setOpen] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  const sized = block.width && block.height ? { width: block.width, height: block.height } : {};
  if (failed)
    return (
      <span data-src={block.start} data-atomic="" className="flex h-9 max-w-full items-center gap-2 rounded-md border border-dashed border-border px-2.5 text-[12px] text-muted-foreground">
        <ImageOff aria-hidden className="size-3.5 shrink-0" />
        <span className="min-w-0 truncate">{block.alt || "Image"} · couldn’t load</span>
      </span>
    );
  return (
    <span data-src={block.start} data-atomic="" className="flex max-w-full flex-col items-start gap-1">
      <button
        type="button"
        {...keep}
        onClick={(event) => {
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={`${block.alt || "Image"}: enlarge`}
        className="group/img relative block max-w-full cursor-zoom-in overflow-hidden rounded-md border border-hairline bg-muted/40 outline-none focus-visible:ring-3 focus-visible:ring-signal/35"
      >
        <img
          src={block.url}
          alt={block.alt}
          {...sized}
          loading={print ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="block h-auto max-h-48 w-auto max-w-full object-contain print:max-h-[50vh] [[data-article]_&]:max-h-72"
        />
        {!print && (
          <span aria-hidden className="absolute end-1.5 top-1.5 grid size-6 place-items-center rounded-[5px] bg-background/85 text-foreground/80 opacity-0 shadow-sm transition-opacity group-hover/img:opacity-100 group-focus-visible/img:opacity-100 coarse:opacity-100">
            <Maximize2 className="size-3" />
          </span>
        )}
      </button>
      {block.title && <span className="text-[11.5px] text-muted-foreground">{block.title}</span>}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          // Portal children still bubble React events to the row: keep them inside the dialog.
          {...keep}
          onKeyDown={(event) => event.key !== "Escape" && event.stopPropagation()}
          className="max-h-[92dvh] w-auto max-w-[min(96vw,1200px)] gap-2 p-2 pt-10 sm:max-w-[min(92vw,1200px)]"
        >
          <DialogTitle className="sr-only">{block.alt || "Image"}</DialogTitle>
          <DialogDescription className="sr-only">{block.title || block.url}</DialogDescription>
          <img src={block.url} alt={block.alt} referrerPolicy="no-referrer" className="mx-auto block max-h-[80dvh] w-auto max-w-full rounded-md object-contain" />
          {(block.title || block.alt) && <p className="px-1 pb-0.5 text-[12px] text-muted-foreground">{block.title || block.alt}</p>}
        </DialogContent>
      </Dialog>
    </span>
  );
}
