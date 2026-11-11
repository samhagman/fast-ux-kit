import * as React from "react";
import {
  editorialLevels,
  editorialManifest,
  type EditorialLevel,
  type EditorialManifestEntry,
} from "@samhagman/fast-ux-kit/editorial";
import { cn } from "@/lib/utils";
import { EditorialSpecimen, editorialFixtures } from "./editorial-gallery";

type View = "in-use" | EditorialLevel;
const VIEWS: readonly { id: View; label: string }[] = [
  { id: "in-use", label: "In use" },
  ...editorialLevels.map((level) => ({ id: level.id as View, label: level.label })),
];
const viewFromHash = (): View => {
  const name = window.location.hash.match(/^#\/editorial\/([a-z-]+)/)?.[1];
  return VIEWS.find((view) => view.id === name)?.id ?? "in-use";
};
const count = (level: EditorialLevel) =>
  editorialManifest.filter((entry) => entry.level === level).length;

/**
 * Editorial UI: the forms for explaining something on a page, by scale. "In use" is one short
 * article built from them; the other tabs show each family alone with the job it does.
 */
export function EditorialPage() {
  const [view, setView] = React.useState<View>(viewFromHash);
  React.useEffect(() => {
    const on = () => setView(viewFromHash());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const level = editorialLevels.find((item) => item.id === view);
  const entries = editorialManifest.filter((entry) => entry.level === view);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="border-b px-5 pt-5 md:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fast UX Kit
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Editorial UI</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {editorialManifest.length} families
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Forms for explaining something on a page: an article with a margin, figures that say what
          to notice, real code, and small working models. Each renders to plain markup, so a static
          site can use them without the app layer.
        </p>
        <div
          role="tablist"
          aria-label="Editorial UI views"
          className="-mx-1 mt-4 flex flex-wrap gap-1 px-1 pb-2"
        >
          {VIEWS.map((item) => {
            const active = item.id === view;
            return (
              <a
                key={item.id}
                role="tab"
                aria-selected={active}
                href={`#/editorial/${item.id}`}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {item.label}
                {item.id !== "in-use" && (
                  <span className="font-mono text-[11px] tabular-nums opacity-60">
                    {count(item.id)}
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </header>
      <section
        key={view}
        aria-label={
          view === "in-use" ? "An article built from the editorial families" : level?.label
        }
        className="min-h-0 min-w-0 flex-1 overflow-y-auto"
      >
        {view === "in-use" ? (
          <div className="editorial-paper pb-16">
            <EditorialSpecimen />
          </div>
        ) : (
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-8">
            <p className="mb-5 max-w-2xl text-sm text-muted-foreground">{level?.summary}</p>
            <div className="grid gap-5 xl:grid-cols-2">
              {entries.map((entry) => (
                <FamilyCard key={entry.name} entry={entry} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function FamilyCard({ entry }: { entry: EditorialManifestEntry }) {
  const fixture = editorialFixtures[entry.name];
  const id = `editorial-${entry.name}`;
  return (
    <article
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        "flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-xs",
        fixture?.wide && "xl:col-span-2",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h2 id={`${id}-title`} className="text-base font-semibold tracking-tight">
            {entry.name}
          </h2>
          <p className="mt-1 text-sm text-pretty text-foreground">{entry.job}</p>
          <p className="mt-0.5 text-sm text-pretty text-muted-foreground">{entry.description}</p>
        </div>
        <div className="flex items-center gap-2">
          {entry.app && (
            <a
              href={`#/components/${entry.name}`}
              className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              Also in App components
            </a>
          )}
          <code className="font-mono text-[11px] text-muted-foreground">{entry.exportName}</code>
        </div>
      </header>
      <div
        className="editorial-paper min-w-0 rounded-b-xl px-5 py-7"
        data-editorial-fixture={entry.name}
      >
        {!fixture ? null : fixture.own ? (
          <fixture.Component />
        ) : (
          <div className="fux-article" data-surface="plain">
            <div className="fux-article-body">
              <fixture.Component />
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
