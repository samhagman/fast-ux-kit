import {
  ArrowRight,
  ArrowUpRight,
  Circle,
  CornerDownRight,
  Grid2X2,
  ListTree,
  Network,
  Workflow,
} from "lucide-react";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import { version } from "../../../package.json";

const tools = [
  {
    id: "outliner",
    number: "01",
    name: "Outliner",
    icon: ListTree,
    description:
      "Write, fold, find and rearrange. A document that stays close to your train of thought.",
    detail: "Rich notes · keyboard editing · undo & redo",
  },
  {
    id: "machine-graph",
    number: "02",
    name: "Machine Graph",
    icon: Workflow,
    description: "See the whole statechart. Inspect a running workflow or try a local simulation.",
    detail: "Live observations · pinned history · event previews",
  },
  {
    id: "machine-tree",
    number: "03",
    name: "Machine Tree",
    icon: Network,
    description:
      "Follow the hierarchy. Find active paths and focus on one part of a complex machine.",
    detail: "Nested states · focused navigation · shared inspection",
  },
] as const;

export function OverviewPage() {
  return (
    <div className="h-full overflow-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 pb-10 pt-10 sm:px-10 sm:pt-16 lg:px-16">
        <header className="border-b border-hairline pb-10 sm:pb-14">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-2xs text-muted-foreground">
            <span>FAST UX KIT</span>
            <span aria-hidden="true">/</span>
            <span>v{version}</span>
            <span className="ms-auto inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
              React · shadcn · Base UI
            </span>
          </div>
          <h1 className="mt-8 max-w-2xl text-4xl leading-[1.12] font-medium tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
            Small controls.
            <br />
            <span className="text-muted-foreground">Room for real work.</span>
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-muted-foreground sm:text-base">
            Compact app components, an editorial set for explaining things on a page, an outliner,
            and two ways to explore state machines. One set of foundations under all of it.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button render={<a href="#/components" />} className="min-h-11 gap-2 px-4">
              Explore components <ArrowRight className="size-3.5 rtl:rotate-180" />
            </Button>
            <Button
              variant="ghost"
              render={<a href="#/outliner" />}
              className="min-h-11 gap-2 px-4 text-muted-foreground"
            >
              Open the outliner <CornerDownRight className="size-3.5 rtl:-scale-x-100" />
            </Button>
          </div>
        </header>

        <section aria-labelledby="tools-heading" className="pt-7">
          <div className="mb-2 flex items-baseline justify-between gap-4">
            <h2 id="tools-heading" className="text-2xs font-medium text-muted-foreground">
              THE TOOLS
            </h2>
            <span className="text-2xs text-muted-foreground">Try them here</span>
          </div>
          {tools.map((tool) => (
            <a
              key={tool.id}
              href={`#/${tool.id}`}
              className="group grid min-h-40 items-center gap-5 border-b border-hairline py-7 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 sm:grid-cols-[1fr_11rem] sm:gap-8 lg:grid-cols-[1fr_14rem]"
            >
              <div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xs text-muted-foreground/70">{tool.number}</span>
                  <tool.icon className="size-4 text-muted-foreground" />
                  <h3 className="text-lg font-medium tracking-tight">{tool.name}</h3>
                  <ArrowRight className="ms-auto size-4 text-muted-foreground transition-transform duration-150 group-hover:translate-x-0.5 motion-reduce:transform-none rtl:rotate-180 rtl:group-hover:-translate-x-0.5 sm:hidden" />
                </div>
                <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                  {tool.description}
                </p>
                <p className="mt-3 text-2xs text-muted-foreground/80">{tool.detail}</p>
              </div>
              <div aria-hidden="true" className="hidden text-2xs text-muted-foreground sm:block">
                {tool.id === "outliner" ? (
                  <div className="space-y-3 border-s border-border ps-4">
                    <p className="flex items-center gap-2 text-foreground">
                      <Circle className="size-1.5 fill-current" />A place to think
                    </p>
                    <p className="ms-4 flex items-center gap-2">
                      <Circle className="size-1.5 fill-current" />
                      Keep the useful details
                    </p>
                    <p className="ms-4 flex items-center gap-2">
                      <Circle className="size-1.5 fill-current" />
                      Make the next move
                    </p>
                    <span className="ms-4 block text-muted-foreground/50">+ Add item</span>
                  </div>
                ) : tool.id === "machine-graph" ? (
                  <div className="flex items-center justify-end">
                    <span className="rounded-md border px-3 py-2 text-foreground">Draft</span>
                    <span className="h-px w-6 bg-border" />
                    <ArrowRight className="-ms-1.5 size-3 text-border" />
                    <span className="rounded-md border border-signal/25 bg-signal/5 px-3 py-2 text-foreground">
                      Review
                      <span className="mt-1 block text-[10px] text-muted-foreground">Active</span>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-2.5 border-s border-border ps-4">
                    <p className="text-foreground">Order workflow</p>
                    <p className="ms-3 flex items-center gap-2">
                      <span className="size-1.5 rounded-full bg-signal/70" />
                      Processing
                    </p>
                    <p className="ms-7 flex items-center gap-2 text-foreground">
                      <span className="size-1.5 rounded-full bg-signal/70" />
                      Review
                    </p>
                    <p className="ms-3">Complete</p>
                  </div>
                )}
              </div>
            </a>
          ))}
        </section>

        <section
          aria-labelledby="library-heading"
          className="grid gap-6 border-b border-hairline py-9 sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <Grid2X2 className="size-4 text-muted-foreground" />
              <h2 id="library-heading" className="text-base font-medium tracking-tight">
                86 component families. One foundation.
              </h2>
            </div>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              Inputs, menus, collections, calendars, color controls and more. Browse working
              examples and the import for each component.
            </p>
          </div>
          <a
            href="#/components"
            className="inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Browse the library <ArrowRight className="size-3.5 rtl:rotate-180" />
          </a>
        </section>

        <footer className="pt-8 text-2xs text-muted-foreground">
          <p className="mb-3">Use it in your own project</p>
          <code className="block overflow-x-auto rounded-md border border-hairline bg-canvas px-4 py-3.5 text-xs text-foreground">
            npm install @samhagman/fast-ux-kit
          </code>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p>Examples run locally in your browser.</p>
            <a
              className="inline-flex min-h-11 items-center gap-1.5 hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              href="https://github.com/samhagman/fast-ux-kit#licensing"
            >
              License & source <ArrowUpRight className="size-3" />
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}
