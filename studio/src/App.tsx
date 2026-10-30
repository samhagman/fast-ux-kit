import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { GitBranch, ListTree, Monitor, Moon, Network, Sun, Workflow } from "lucide-react";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { motionTokens } from "@/lib/motion";
import { Button } from "@/components/ui/button";
import { OutlinerPage } from "@/pages/outliner-page";
import { MachineViewPage } from "@/pages/machine-view-page";
import { MachineTreePage } from "@/pages/machine-tree-page";

type Route = "outliner" | "machine-view" | "machine-tree";

const ROUTES: readonly { id: Route; label: string; icon: typeof ListTree; hint: string }[] = [
  { id: "outliner", label: "Outliner", icon: ListTree, hint: "Structured writing" },
  { id: "machine-view", label: "Machine View", icon: Workflow, hint: "Statechart canvas" },
  { id: "machine-tree", label: "Machine Tree", icon: Network, hint: "State hierarchy" },
];

function useRoute(): [Route, (route: Route) => void] {
  const read = () => (ROUTES.find((r) => `#/${r.id}` === window.location.hash)?.id ?? "outliner") as Route;
  const [route, setRoute] = React.useState<Route>(read);
  React.useEffect(() => {
    const on = () => setRoute(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [route, (next) => (window.location.hash = `/${next}`)];
}

export function App() {
  const [route, setRoute] = useRoute();
  return (
    <div className="flex h-dvh flex-col bg-canvas md:flex-row">
      <aside className="flex shrink-0 items-center gap-1 border-b bg-sidebar px-2 py-1.5 md:w-56 md:flex-col md:items-stretch md:border-e md:border-b-0 md:px-2 md:py-3">
        <div className="flex items-center gap-2 px-1.5 md:mb-4">
          <div className="grid size-6 place-items-center rounded-md bg-foreground text-background">
            <GitBranch className="size-3.5" />
          </div>
          <div className="leading-none max-md:hidden">
            <div className="text-ui font-semibold tracking-tight">Fast UX</div>
            <div className="mt-0.5 font-mono text-[10px] tracking-wide text-muted-foreground uppercase">studio · alpha</div>
          </div>
        </div>
        <nav className="flex flex-1 gap-0.5 md:flex-col">
          {ROUTES.map((item) => {
            const active = route === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setRoute(item.id)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center gap-2 rounded-md px-2 text-ui transition-colors",
                  active ? "text-foreground" : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-active"
                    transition={motionTokens.layout}
                    className="absolute inset-0 rounded-md border border-border bg-background"
                  />
                )}
                <item.icon className="relative size-3.5 shrink-0" />
                <span className="relative max-sm:sr-only">{item.label}</span>
              </button>
            );
          })}
        </nav>
        <ThemeSwitch />
      </aside>
      <main className="min-h-0 min-w-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={route}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={motionTokens.base}
            className="h-full"
          >
            {route === "outliner" && <OutlinerPage />}
            {route === "machine-view" && <MachineViewPage />}
            {route === "machine-tree" && <MachineTreePage />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

function ThemeSwitch() {
  const { theme, setTheme } = useTheme();
  const options = [
    { id: "light", icon: Sun },
    { id: "dark", icon: Moon },
    { id: "system", icon: Monitor },
  ] as const;
  return (
    <div className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5 md:self-start">
      {options.map((option) => (
        <Button
          key={option.id}
          variant="ghost"
          size="icon-xs"
          aria-label={`${option.id} theme`}
          aria-pressed={theme === option.id}
          onClick={() => setTheme(option.id)}
          className={cn("relative", theme === option.id && "text-foreground")}
        >
          {theme === option.id && (
            <motion.span layoutId="theme-active" transition={motionTokens.layout} className="absolute inset-0 rounded-[5px] bg-muted" />
          )}
          <option.icon className="relative" />
        </Button>
      ))}
    </div>
  );
}
