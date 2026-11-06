import * as React from "react";
import * as C from "@samhagman/fast-ux-kit/components";
import type { ComponentFixture } from "./components-gallery/fixture-kit";
import { basicFixtures } from "./components-gallery/basic";
import { collectionsFixtures } from "./components-gallery/collections";
import { datesColorsFixtures } from "./components-gallery/dates-colors";
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
};

export function ComponentsPage() {
  const [query, setQuery] = React.useState("");
  const [selected, setSelected] = React.useState("Button");
  const entries = C.componentManifest.filter((entry) =>
    `${entry.name} ${entry.category} ${entry.description}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  const current = C.componentManifest.find((entry) => entry.name === selected)!;
  const fixture = componentFixtures[selected];
  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <header className="border-b px-5 py-5 md:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fast UX Kit
        </p>
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Component library</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {C.componentManifest.length} families
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Explore the controls, data views and interactions that make up the kit.
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="flex min-h-0 flex-col border-b md:w-64 md:shrink-0 md:border-e md:border-b-0">
          <div className="p-3">
            <C.SearchField label="Find a component" value={query} onValueChange={setQuery} />
          </div>
          <nav
            aria-label="Component families"
            className="flex max-h-52 gap-1 overflow-auto p-2 md:max-h-none md:flex-1 md:flex-col"
          >
            {entries.map((entry) => (
              <button
                key={entry.name}
                type="button"
                data-family={entry.name}
                aria-current={selected === entry.name ? "page" : undefined}
                onClick={() => setSelected(entry.name)}
                className={C.cn(
                  "min-h-11 shrink-0 rounded-md px-3 py-2 text-start text-sm",
                  selected === entry.name
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {entry.name}
              </button>
            ))}
            {!entries.length && (
              <p className="p-3 text-sm text-muted-foreground">No matching components.</p>
            )}
          </nav>
        </aside>
        <section
          id="component-details"
          className="min-h-0 min-w-0 flex-1 overflow-auto px-5 py-7 md:px-10"
          aria-labelledby="component-heading"
        >
          <div className="mx-auto max-w-3xl">
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
              {current.category}
            </p>
            <h2 id="component-heading" className="mt-3 text-3xl font-semibold tracking-tight">
              {current.name}
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              {current.description}
            </p>
            <div className="my-8 border-y py-8" data-component-fixture={selected}>
              {fixture && <fixture.Component key={selected} />}
            </div>
            <h3 className="text-sm font-medium">Try it</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{fixture?.instructions}</p>
            <p className="mt-8 font-mono text-xs text-muted-foreground">
              import &#123; {current.exportName} &#125; from
              &quot;@samhagman/fast-ux-kit/components&quot;
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
