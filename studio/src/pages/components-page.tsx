import * as React from "react";
import * as C from "@samhagman/fast-ux-kit/components";
import type { ComponentFixture } from "./components-gallery/fixture-kit";
import { basicFixtures } from "./components-gallery/basic";
import { collectionsFixtures } from "./components-gallery/collections";
import { datesColorsFixtures } from "./components-gallery/dates-colors";
import { displayFixtures } from "./components-gallery/display";
import { overlaysMediaFixtures } from "./components-gallery/overlays-media";
import { specializedFixtures } from "./components-gallery/specialized";

export type { ComponentFixture, FixtureAction } from "./components-gallery/fixture-kit";

/** One demo per canonical family, gathered from each area's file. */
export const componentFixtures: Readonly<Record<string, ComponentFixture>> = {
  ...basicFixtures,
  ...collectionsFixtures,
  ...datesColorsFixtures,
  ...overlaysMediaFixtures,
  ...specializedFixtures,
  ...displayFixtures,
};

/** The families in catalog order, grouped by category. */
const CATEGORIES = C.componentManifest.reduce<
  { name: string; entries: C.ComponentManifestEntry[] }[]
>((groups, entry) => {
  const group = groups.find((item) => item.name === entry.category);
  if (group) group.entries.push(entry);
  else groups.push({ name: entry.category, entries: [entry] });
  return groups;
}, []);
/** Families whose demos need the full width of the page. */
const WIDE = new Set([
  "Table",
  "Toolbar",
  "NavigationMenu",
  "RangeCalendar",
  "DateRangePicker",
  "ColorPicker",
  "Splitter",
  "Carousel",
  "Marquee",
  "ImageCropper",
  "SignaturePad",
  "JsonTreeView",
  "FileUpload",
  "Steps",
  "Form",
  "Panel",
  "CodeBlock",
]);
const slug = (name: string) => `family-${name}`;
const familyFromHash = () => window.location.hash.match(/^#\/components\/([A-Za-z]+)$/)?.[1];
const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/**
 * Every family on one scrolling page: category sections, a card per family with its demo. The
 * category tabs and the family index follow the scroll (the family nearest the top is current)
 * and scroll to what they name. `#/components/<Family>` links straight to a card.
 */
export function ComponentsPage() {
  const [query, setQuery] = React.useState("");
  const [current, setCurrent] = React.useState(() => familyFromHash() ?? "Button");
  const scroller = React.useRef<HTMLElement>(null);
  const indexRef = React.useRef<HTMLElement>(null);
  const tabsRef = React.useRef<HTMLDivElement>(null);
  const jumping = React.useRef(false);
  const needle = query.trim().toLowerCase();
  const groups = CATEGORIES.map((group) => ({
    ...group,
    entries: group.entries.filter((entry) =>
      `${entry.name} ${entry.category} ${entry.description}`.toLowerCase().includes(needle),
    ),
  })).filter((group) => group.entries.length);
  const shown = groups.flatMap((group) => group.entries);
  const currentCategory =
    C.componentManifest.find((entry) => entry.name === current)?.category ?? groups[0]?.name;

  const jump = React.useCallback((name: string) => {
    const card = document.getElementById(slug(name));
    if (!card) return;
    jumping.current = true;
    setCurrent(name);
    window.history.replaceState(null, "", `#/components/${name}`);
    card.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth", block: "start" });
    // Hold the highlight on the target until the scroll settles (scrollend, or a fallback).
    const release = () => (jumping.current = false);
    scroller.current?.addEventListener("scrollend", release, { once: true });
    window.setTimeout(release, 2000);
  }, []);

  // A deep link lands on its card once the page is laid out.
  React.useEffect(() => {
    const name = familyFromHash();
    if (name) requestAnimationFrame(() => document.getElementById(slug(name))?.scrollIntoView());
  }, []);

  // The current family is the last card whose top has passed the top quarter of the page.
  React.useEffect(() => {
    const root = scroller.current;
    if (!root) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      if (jumping.current) return;
      const line = root.getBoundingClientRect().top + root.clientHeight * 0.25;
      let name = shown[0]?.name;
      for (const entry of shown) {
        const card = document.getElementById(slug(entry.name));
        if (card && card.getBoundingClientRect().top <= line) name = entry.name;
      }
      // At the very end the last cards never reach that line: the last family is current.
      if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2) name = shown.at(-1)?.name;
      if (name) {
        setCurrent((was) => {
          if (was !== name) window.history.replaceState(null, "", `#/components/${name}`);
          return name;
        });
      }
    };
    const onScroll = () => (frame ||= requestAnimationFrame(update));
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [shown]);

  // Keep the highlighted tab and index entry in view as the page scrolls.
  React.useEffect(() => {
    indexRef.current
      ?.querySelector(`[data-family="${current}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    tabsRef.current
      ?.querySelector(`[data-category="${currentCategory}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current, currentCategory]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="border-b px-5 pt-5 md:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fast UX Kit
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">App components</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {C.componentManifest.length} families
          </span>
        </div>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <p className="hidden max-w-2xl text-sm text-muted-foreground sm:block">
            The controls, data views and interactions for building an application, on one page.
            Scroll through them, or jump with the tabs.
          </p>
          <div className="w-full sm:w-64">
            <C.SearchField label="Find a component" value={query} onValueChange={setQuery} />
          </div>
        </div>
        <div
          ref={tabsRef}
          role="tablist"
          aria-label="Component categories"
          className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 pb-2 [scrollbar-width:none]"
        >
          {groups.map((group) => {
            const active = group.name === currentCategory;
            return (
              <button
                key={group.name}
                type="button"
                role="tab"
                aria-selected={active}
                data-category={group.name}
                onClick={() => jump(group.entries[0]!.name)}
                className={C.cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {group.name}
                <span className="font-mono text-[11px] tabular-nums opacity-60">
                  {group.entries.length}
                </span>
              </button>
            );
          })}
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden min-h-0 w-60 shrink-0 flex-col border-e md:flex">
          <nav
            ref={indexRef}
            aria-label="Component families"
            className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-2 py-4"
          >
            {groups.map((group) => (
              <div key={group.name} className="flex flex-col gap-0.5">
                <p className="px-3 pt-1 pb-1 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                  {group.name}
                </p>
                {group.entries.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    data-family={entry.name}
                    aria-current={current === entry.name ? "location" : undefined}
                    onClick={() => jump(entry.name)}
                    className={C.cn(
                      "relative flex h-8 shrink-0 items-center rounded-md px-3 text-start text-sm transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      current === entry.name
                        ? "bg-accent font-medium text-accent-foreground before:absolute before:inset-y-1.5 before:start-0 before:w-0.5 before:rounded-full before:bg-signal"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {entry.name}
                  </button>
                ))}
              </div>
            ))}
            {!shown.length && (
              <p className="p-3 text-sm text-muted-foreground">No matching components.</p>
            )}
          </nav>
        </aside>
        <section
          ref={scroller}
          id="component-details"
          aria-label="All components"
          className="min-h-0 min-w-0 flex-1 overflow-y-auto scroll-pt-4 px-4 py-6 md:px-8"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-12">
            {groups.map((group) => (
              <section key={group.name} aria-labelledby={`category-${group.name}`}>
                <h2
                  id={`category-${group.name}`}
                  className="mb-4 flex items-baseline gap-2 border-b border-hairline pb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground"
                >
                  {group.name}
                  <span className="tabular-nums opacity-60">{group.entries.length}</span>
                </h2>
                <div className="grid gap-5 xl:grid-cols-2">
                  {group.entries.map((entry) => (
                    <FamilyCard
                      key={entry.name}
                      entry={entry}
                      wide={WIDE.has(entry.name)}
                      current={current === entry.name}
                    />
                  ))}
                </div>
              </section>
            ))}
            {!shown.length && (
              <p className="py-12 text-center text-sm text-muted-foreground">
                No matching components.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** One family: its name, description and demo. The demo mounts as the card nears the view, or once it is current. */
function FamilyCard({
  entry,
  wide,
  current,
}: {
  entry: C.ComponentManifestEntry;
  wide: boolean;
  current: boolean;
}) {
  const fixture = componentFixtures[entry.name];
  const ref = React.useRef<HTMLElement>(null);
  const [seen, setNear] = React.useState(() => typeof IntersectionObserver === "undefined");
  // The family jumped to (or linked to) mounts at once, wherever it is, and stays mounted.
  const near = seen || current;
  React.useEffect(() => {
    if (current) setNear(true);
  }, [current]);
  React.useEffect(() => {
    const card = ref.current;
    if (near || !card) return;
    const observer = new IntersectionObserver(
      (records) => {
        if (records.some((record) => record.isIntersecting)) setNear(true);
      },
      { rootMargin: "800px 0px" },
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, [near]);
  return (
    <article
      ref={ref}
      id={slug(entry.name)}
      aria-labelledby={`${slug(entry.name)}-title`}
      className={C.cn(
        "flex min-w-0 scroll-mt-4 flex-col rounded-xl border bg-card text-card-foreground shadow-xs",
        wide && "xl:col-span-2",
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-4">
        <div className="min-w-0">
          <h3 id={`${slug(entry.name)}-title`} className="text-base font-semibold tracking-tight">
            <a
              href={`#/components/${entry.name}`}
              className="outline-none hover:underline focus-visible:underline"
            >
              {entry.name}
            </a>
          </h3>
          <p className="mt-1 text-sm text-pretty text-muted-foreground">{entry.description}</p>
        </div>
        <code className="font-mono text-[11px] text-muted-foreground">{entry.exportName}</code>
      </header>
      <div className="min-w-0 overflow-x-auto px-5 py-6" data-component-fixture={entry.name}>
        {near && fixture ? <fixture.Component /> : <div className="h-40" aria-hidden="true" />}
      </div>
      {fixture?.instructions && (
        <p className="border-t border-hairline px-5 py-3 text-xs text-muted-foreground">
          {fixture.instructions}
        </p>
      )}
    </article>
  );
}
