import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  Grid2X2,
  House,
  ListTree,
  Monitor,
  Moon,
  Network,
  Sun,
  Workflow,
} from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import { version } from "../../package.json";
const OverviewPage = React.lazy(() =>
  import("@/pages/overview-page").then((module) => ({ default: module.OverviewPage })),
);
const ComponentsPage = React.lazy(() =>
  import("@/pages/components-page").then((module) => ({ default: module.ComponentsPage })),
);
const OutlinerPage = React.lazy(() =>
  import("@/pages/outliner-page").then((module) => ({ default: module.OutlinerPage })),
);
const MachineViewPage = React.lazy(() =>
  import("@/pages/machine-view-page").then((module) => ({ default: module.MachineViewPage })),
);
const MachineTreePage = React.lazy(() =>
  import("@/pages/machine-tree-page").then((module) => ({ default: module.MachineTreePage })),
);

type Route = "overview" | "components" | "outliner" | "machine-view" | "machine-tree";

const ROUTES: readonly { id: Route; label: string; icon: typeof ListTree; hint: string }[] = [
  { id: "overview", label: "Overview", icon: House, hint: "Start here" },
  { id: "components", label: "Components", icon: Grid2X2, hint: "Component catalog" },
  { id: "outliner", label: "Outliner", icon: ListTree, hint: "Structured writing" },
  { id: "machine-view", label: "Machine View", icon: Workflow, hint: "Statechart canvas" },
  { id: "machine-tree", label: "Machine Tree", icon: Network, hint: "State hierarchy" },
];

function useRoute(): Route {
  const read = (): Route => {
    const hash = window.location.hash.replace(/^#\/?/, "");
    if (["machine-tree-view"].includes(hash)) return "machine-tree";
    if (
      ["outline", "editor", "outliner-lab", "outline-search-lab", "outline-note-lab"].includes(hash)
    )
      return "outliner";
    return ROUTES.find((route) => route.id === hash)?.id ?? "overview";
  };
  const [route, setRoute] = React.useState<Route>(read);
  React.useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  React.useEffect(() => {
    document.title = `${ROUTES.find((item) => item.id === route)?.label} — Fast UX Kit`;
  }, [route]);
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      <a
        href="#main-content"
        onClick={(event) => {
          event.preventDefault();
          document.getElementById("main-content")?.focus();
        }}
        className="sr-only z-50 rounded-md bg-background px-4 py-3 text-sm shadow-sm focus:not-sr-only focus:absolute focus:start-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside className="flex shrink-0 items-center gap-1 border-b bg-sidebar px-2 py-1.5 md:w-52 md:flex-col md:items-stretch md:border-e md:border-b-0 md:px-3 md:py-5">
        <a
          href="#/overview"
          aria-label="Fast UX Kit overview"
          className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/70 md:mb-7"
        >
          <div
            aria-hidden="true"
            className="grid size-7 place-items-center rounded-lg border border-foreground/15 bg-background font-mono text-xs font-medium tracking-tighter"
          >
            ux
          </div>
          <div className="leading-none max-md:hidden">
            <div className="text-ui font-semibold tracking-tight">Fast UX Kit</div>
            <div className="mt-1 font-mono text-[10px] text-muted-foreground">v{version}</div>
          </div>
        </a>
        <nav aria-label="Main navigation" className="flex min-w-0 flex-1 gap-0.5 md:flex-col">
          {ROUTES.map((item) => {
            const active = route === item.id;
            return (
              <a
                key={item.id}
                href={`#/${item.id}`}
                aria-label={item.label}
                title={item.hint}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-md px-2.5 text-ui outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/70 md:justify-start",
                  active
                    ? "text-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={motionTokens.layout}
                    className="absolute inset-1 rounded-md border border-border/70 bg-background"
                  />
                )}
                <item.icon className="relative size-3.5 shrink-0" />
                <span className="relative max-md:sr-only">{item.label}</span>
              </a>
            );
          })}
        </nav>
        <div className="mb-4 hidden border-t border-hairline px-2 pt-4 md:block">
          <p className="mb-2 text-2xs text-muted-foreground">Build with the kit</p>
          <a
            href="https://github.com/samhagman/fast-ux-kit"
            className="flex min-h-11 items-center justify-between gap-2 text-ui text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            Source & docs <ArrowUpRight className="size-3.5" />
          </a>
          <a
            href="https://www.npmjs.com/package/@samhagman/fast-ux-kit"
            className="flex min-h-11 items-center justify-between gap-2 text-ui text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            npm package <ArrowUpRight className="size-3.5" />
          </a>
        </div>
        <ThemeSwitch />
      </aside>
      <main id="main-content" tabIndex={-1} className="min-h-0 min-w-0 flex-1 outline-none">
        <React.Suspense
          fallback={
            <div role="status" className="p-5 text-sm text-muted-foreground">
              Loading workspace…
            </div>
          }
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={motionTokens.base}
              className="h-full"
            >
              {route === "overview" && <OverviewPage />}
              {route === "components" && <ComponentsPage />}
              {route === "outliner" && <OutlinerPage />}
              {route === "machine-view" && <MachineViewPage />}
              {route === "machine-tree" && <MachineTreePage />}
            </motion.div>
          </AnimatePresence>
        </React.Suspense>
      </main>
    </div>
  );
}

function ThemeSwitch() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const options = [
    { id: "light", icon: Sun },
    { id: "dark", icon: Moon },
    { id: "system", icon: Monitor },
  ] as const;
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Switch to ${resolvedTheme === "dark" ? "light" : "dark"} theme`}
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        className="min-h-11 min-w-11 shrink-0 md:hidden"
      >
        {resolvedTheme === "dark" ? <Sun /> : <Moon />}
      </Button>
      <div
        aria-label="Appearance"
        className="hidden items-center gap-0.5 rounded-lg border border-border/70 bg-background p-0.5 md:flex md:self-start"
      >
        {options.map((option) => (
          <Button
            key={option.id}
            variant="ghost"
            size="icon-xs"
            aria-label={`${option.id} theme`}
            aria-pressed={theme === option.id}
            onClick={() => setTheme(option.id)}
            className={cn("relative min-h-11 min-w-11", theme === option.id && "text-foreground")}
          >
            {theme === option.id && (
              <motion.span
                layoutId="theme-active"
                transition={motionTokens.layout}
                className="absolute inset-0 rounded-[5px] bg-muted"
              />
            )}
            <option.icon className="relative" />
          </Button>
        ))}
      </div>
    </>
  );
}
