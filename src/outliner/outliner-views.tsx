import * as React from "react";
import { motion } from "motion/react";
import { BookOpenText, Check, ChevronDown, Kanban, List, Network, Printer } from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { Tooltip, TooltipContent, TooltipTrigger } from "../components/ui/tooltip.js";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../components/ui/drawer.js";
import { CommandItem } from "../components/ui/command.js";
import { useOutlinerContext, type OutlinerUi } from "./context.js";
import { inlineToPlain } from "./inline.js";
import { requestPrint } from "./outliner-print.js";
import type { OutlinerController } from "./use-outliner.js";
import type { OutlineItem, OutlineItemView } from "./types.js";

/**
 * Views of a zoomed item, one field (`data.view`) for all of them: the outline (no field),
 * a board, an article, a mind map. For an editor, switching is an edit (one undo step); the
 * document's shape never changes. A read-only reader switches too, as local view state
 * (`view.views`, like folding): the document's `data.view` stays the author's default and is
 * never written. This file holds the switcher (a segmented control; a sheet on touch), print,
 * and the lazy mind-map slot.
 */
export const VIEWS: readonly OutlineItemView[] = ["list", "board", "article", "mindmap"];

export const viewOf = (node: OutlineItem | null | undefined): OutlineItemView => {
  const view = node?.data?.view;
  return view === "board" || view === "article" || view === "mindmap" ? view : "list";
};

export function viewMeta(view: OutlineItemView, L: OutlinerUi["labels"]) {
  switch (view) {
    case "list":
      return {
        label: L.listView,
        verb: L.viewAsList,
        Icon: List,
        keywords: "list outline bullets",
      };
    case "board":
      return {
        label: L.boardView,
        verb: L.viewAsBoard,
        Icon: Kanban,
        keywords: "board kanban columns",
      };
    case "article":
      return {
        label: L.articleView,
        verb: L.viewAsArticle,
        Icon: BookOpenText,
        keywords: "article document prose read",
      };
    case "mindmap":
      return {
        label: L.mindMapView,
        verb: L.viewAsMindMap,
        Icon: Network,
        keywords: "mind map graph diagram",
      };
  }
}

/** The view an item is shown in: a read-only reader's own choice, else the document's. */
export function shownView(
  ol: Pick<OutlinerController, "readOnly" | "view">,
  node: OutlineItem,
): OutlineItemView {
  return (ol.readOnly && ol.view.views?.[node.id]) || viewOf(node);
}

export function setItemView(
  ol: OutlinerController,
  ui: OutlinerUi,
  id: string,
  view: OutlineItemView,
) {
  if (ol.readOnly)
    ol.setView((current) => ({ ...current, views: { ...current.views, [id]: view } }));
  else ol.commands.setView([id], view);
  ui.announce(viewMeta(view, ui.labels).verb);
}

/** Print the article of the current zoom (or the whole document). */
export function printCurrent(ol: OutlinerController, ui: OutlinerUi) {
  requestPrint(ui.rootRef, ol.state.hoistedId);
}

/**
 * The zoomed title's view control. Fine pointer: four icon segments with a sliding pill (a radio
 * group: arrows move between views). Touch: one 40 px button with the current view's icon that
 * opens a bottom sheet (the title keeps its width on a phone).
 */
export function ViewSwitcher({
  item,
  disabled: noEdit,
}: {
  readonly item: OutlineItem;
  readonly disabled: boolean;
}) {
  const { ol, ui } = useOutlinerContext();
  const L = ui.labels;
  const coarse = useMediaQuery("(pointer: coarse)");
  const current = shownView(ol, item);
  // A read-only reader still picks how to read (locally); a locked item's view stays put.
  const disabled = noEdit && !ol.readOnly;
  const [sheet, setSheet] = React.useState(false);
  const set = (value: OutlineItemView) => {
    if (value === current || disabled) return;
    setItemView(ol, ui, item.id, value);
  };
  if (coarse) {
    const { Icon, label } = viewMeta(current, L);
    return (
      <>
        <button
          type="button"
          data-view-switcher=""
          aria-haspopup="dialog"
          aria-label={`${L.views}: ${label}`}
          onClick={() => setSheet(true)}
          className="relative ms-2 mt-0.5 flex h-11 shrink-0 items-center gap-1 rounded-md border border-hairline bg-muted/40 ps-2.5 pe-1.5 text-muted-foreground transition-colors active:bg-muted"
        >
          <Icon className="size-4 text-foreground" />
          <ChevronDown className="size-3.5" />
        </button>
        <Drawer open={sheet} onOpenChange={setSheet}>
          <DrawerContent className="pb-[env(safe-area-inset-bottom)]" data-view-sheet="">
            <DrawerHeader className="pb-1 text-start">
              <DrawerTitle className="text-[15px]">{L.views}</DrawerTitle>
              <DrawerDescription className="truncate text-[13px]">
                {inlineToPlain(item.text) || L.untitled}
              </DrawerDescription>
            </DrawerHeader>
            <div role="radiogroup" aria-label={L.views} className="flex flex-col px-2 pb-2">
              {VIEWS.map((view) => {
                const meta = viewMeta(view, L);
                const on = view === current;
                return (
                  <button
                    key={view}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    disabled={disabled && !on}
                    onClick={() => {
                      set(view);
                      setSheet(false);
                    }}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-[15px] transition-colors outline-none focus-visible:bg-muted active:bg-muted disabled:opacity-40"
                  >
                    <meta.Icon
                      className={cn(
                        "size-[18px] shrink-0",
                        on ? "text-signal" : "text-muted-foreground",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate">{meta.label}</span>
                    {on && <Check className="size-4 text-signal" />}
                  </button>
                );
              })}
              <div className="mx-3 my-1 h-px bg-hairline" />
              <button
                type="button"
                onClick={() => {
                  setSheet(false);
                  // After the sheet's exit, so the printed page never catches it half-closed.
                  window.setTimeout(() => printCurrent(ol, ui), 320);
                }}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-start text-[15px] transition-colors outline-none focus-visible:bg-muted active:bg-muted"
              >
                <Printer className="size-[18px] shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{L.print}</span>
              </button>
            </div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }
  return (
    <div
      role="radiogroup"
      aria-label={L.views}
      data-view-switcher=""
      className="relative ms-2 mt-1 flex h-7 shrink-0 items-center rounded-md border border-hairline bg-muted/40 p-0.5"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const forward = (event.key === "ArrowRight") !== rtl;
        const next =
          VIEWS[(VIEWS.indexOf(current) + (forward ? 1 : VIEWS.length - 1)) % VIEWS.length]!;
        set(next);
        const group = event.currentTarget;
        requestAnimationFrame(() =>
          group.querySelector<HTMLElement>(`[data-view="${next}"]`)?.focus(),
        );
      }}
    >
      {VIEWS.map((view) => {
        const meta = viewMeta(view, L);
        const on = view === current;
        return (
          <Tooltip key={view}>
            <TooltipTrigger asChild>
              <button
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={meta.label}
                data-view={view}
                tabIndex={on ? 0 : -1}
                disabled={disabled && !on}
                onClick={() => set(view)}
                className={cn(
                  "relative grid h-full w-7 place-items-center rounded-[5px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 disabled:opacity-50",
                  on && "text-foreground",
                )}
              >
                {on && (
                  <motion.span
                    layoutId={`view-toggle-${item.id}`}
                    transition={motionTokens.layout}
                    className="absolute inset-0 rounded-[5px] border border-hairline bg-surface shadow-[0_1px_1px_rgb(0_0_0/0.04)]"
                  />
                )}
                <span className="relative">
                  <meta.Icon className="size-3.5" />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent>{meta.verb}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * ⌘K's print entry. The "View as ▸" entries are the item registry's (item-actions.tsx): every
 * menu, the palette included, shows the same ones.
 */
export function PrintCommandItem({ run }: { readonly run: (action: () => void) => () => void }) {
  const { ol, ui } = useOutlinerContext();
  return (
    <CommandItem
      value="print save as pdf export paper"
      onSelect={run(() => window.setTimeout(() => printCurrent(ol, ui), 180))}
    >
      <Printer /> {ui.labels.print}
    </CommandItem>
  );
}

const LazyMindMap = React.lazy(() => import("./outliner-mindmap.js"));

/** The mind map fills the rest of the body; its engine loads on first open. */
export function MindMapSlot({ root }: { readonly root: OutlineItem }) {
  return (
    <div className="relative min-h-[360px] flex-1 sm:px-6 sm:pb-6" data-mindmap-slot="">
      <React.Suspense
        fallback={
          <div
            aria-hidden
            className="h-full min-h-[360px] w-full animate-pulse border-y border-hairline bg-muted/30 sm:rounded-lg sm:border"
          />
        }
      >
        <LazyMindMap root={root} />
      </React.Suspense>
    </div>
  );
}
