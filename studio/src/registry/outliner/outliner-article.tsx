import * as React from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { useOutlinerContext } from "./context";
import { InlineText, inlineToSpeech } from "./inline";
import { RichNote } from "./rich-note-view";
import { articleBlocks, type ArticleBlock } from "./article";
import { COLOR_STYLES, type OutlineItem } from "./types";

/** What the article borrows from the outline (passed down, so the modules never import each other). */
export interface ArticleParts {
  readonly TaskCheckbox: React.ComponentType<{
    readonly checked: boolean;
    readonly disabled: boolean;
    readonly onToggle: () => void;
    readonly focusable?: boolean;
    readonly label?: string;
    readonly className?: string;
  }>;
  /** Follow an internal link (`[[label|id]]`). */
  readonly reveal: (id: string | undefined, title: string) => void;
  /** A link target's title source (null: deleted). */
  readonly refSource: (id: string) => string | null;
}

/**
 * The article body: headings, paragraphs and notes at a reading measure. Tasks stay tickable
 * (one undo step each, like everywhere else); tags search, links follow. `print` drops motion
 * and interactive affordances for the printed page.
 */
export function OutlinerArticle({
  items,
  parts,
  print = false,
}: {
  readonly items: readonly OutlineItem[];
  readonly parts: ArticleParts;
  readonly print?: boolean;
}) {
  const { ol, ui } = useOutlinerContext();
  const blocks = articleBlocks(items, { hideCompleted: ol.view.hideCompleted });
  if (!blocks.length)
    return <p className="ps-[30px] text-ui text-muted-foreground">{ui.labels.emptyArticle}</p>;
  return (
    <article
      data-article=""
      className={cn(
        // Reading measure: ~68 characters; the text column lines up with the zoomed title.
        "ol-article max-w-[calc(40rem+30px)] ps-[30px] text-[15px] leading-[1.68] text-foreground/90 max-sm:text-[16px] max-sm:leading-[1.62]",
        print && "max-w-none ps-0 text-[11.5pt] leading-[1.55] text-black",
      )}
    >
      {blocks.map((block, index) => (
        <ArticleBlockView key={block.node.id} block={block} index={index} parts={parts} print={print} />
      ))}
    </article>
  );
}

function ArticleBlockView({ block, index, parts, print }: { block: ArticleBlock; index: number; parts: ArticleParts; print: boolean }) {
  const { ol, ui } = useOutlinerContext();
  const node = block.node;
  const note = node.data?.note;
  const handlers = {
    onTag: (tag: string) => ol.setView((view) => ({ ...view, query: tag })),
    onRef: (title: string, id?: string) => parts.reveal(id, title),
    resolveRef: parts.refSource,
  };
  const color = node.data?.color ? COLOR_STYLES[node.data.color] : null;
  // Rows rise in once, staggered a touch; a long article never waits on its tail.
  const enter = print
    ? {}
    : {
        initial: { opacity: 0, y: 4 },
        animate: { opacity: 1, y: 0 },
        transition: { ...motionTokens.base, delay: Math.min(index, 12) * 0.018 },
      };
  if (block.kind === "heading") {
    const Tag = block.level === 1 ? "h3" : block.level === 2 ? "h4" : "h5";
    return (
      <motion.section {...enter} data-article-item={node.id} className={cn(index > 0 && (block.level === 1 ? "mt-8" : block.level === 2 ? "mt-6" : "mt-5"), "break-inside-avoid-page")}>
        <Tag
          className={cn(
            "relative font-semibold tracking-[-0.012em] text-balance text-foreground break-after-avoid-page",
            block.level === 1 && "text-[1.42em] leading-[1.25]",
            block.level === 2 && "text-[1.18em] leading-[1.3]",
            block.level === 3 && "text-[1.02em] leading-[1.35]",
          )}
        >
          {color && !print && <span aria-hidden className={cn("absolute inset-y-1 -start-3 w-[2px] rounded-full opacity-75", color.bar)} />}
          <InlineText source={node.text || ui.labels.untitled} {...handlers} />
        </Tag>
        {note && (
          <div dir="auto" className="mt-1.5 text-muted-foreground">
            <RichNote source={note} headingLevel={Math.min(6, block.level + 3)} prose {...handlers} />
          </div>
        )}
      </motion.section>
    );
  }
  const editable = !ol.readOnly && !ol.isItemLocked(node.id);
  return (
    <motion.div
      {...enter}
      data-article-item={node.id}
      className={cn("mt-3 flex items-start gap-2.5 first:mt-0", block.depth > 0 && "mt-2")}
      style={{ paddingInlineStart: `${block.depth * 1.25}rem` }}
    >
      {block.task && (
        // Sized to the text's cap height: the box sits on the first line, not centred on the block.
        <span className="flex h-[1.68em] shrink-0 items-center">
          <parts.TaskCheckbox
            focusable
            checked={block.done}
            disabled={!editable || print}
            label={`${block.done ? ui.labels.markIncomplete : ui.labels.complete}: ${inlineToSpeech(node.text) || ui.labels.untitled}`}
            onToggle={() => ui.announceToggle(ol.commands.toggleComplete([node.id]))}
          />
        </span>
      )}
      {block.ordinal !== undefined && (
        <span className="shrink-0 font-mono text-[0.86em] leading-[1.95] text-muted-foreground tabular-nums">{block.ordinal}.</span>
      )}
      <div className="min-w-0 flex-1">
        <p
          dir="auto"
          className={cn(
            "text-pretty transition-colors duration-200",
            block.done && "text-muted-foreground line-through decoration-muted-foreground/50",
            !block.task && block.done && "no-underline",
          )}
        >
          {color && !print && <span aria-hidden className={cn("me-2 inline-block size-1.5 -translate-y-0.5 rounded-full", color.dot)} />}
          <InlineText source={node.text} {...handlers} />
        </p>
        {note && (
          <div dir="auto" className="mt-1 text-[0.94em] text-muted-foreground">
            <RichNote source={note} headingLevel={6} prose {...handlers} />
          </div>
        )}
      </div>
    </motion.div>
  );
}
