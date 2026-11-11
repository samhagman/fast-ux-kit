import * as React from "react";
import { cn } from "@/lib/utils";

/** A colour token: its name, the class that paints it, and what it is for. */
interface Swatch {
  readonly name: string;
  readonly paint: string;
  readonly use: string;
}

const APP_SURFACES: readonly Swatch[] = [
  { name: "--background", paint: "bg-background", use: "Page" },
  { name: "--canvas", paint: "bg-canvas", use: "Behind the page" },
  { name: "--card", paint: "bg-card", use: "Raised surfaces" },
  { name: "--muted", paint: "bg-muted", use: "Quiet fills" },
  { name: "--accent", paint: "bg-accent", use: "Hover and selected" },
  { name: "--border", paint: "bg-border", use: "Borders" },
];
const APP_INK: readonly Swatch[] = [
  { name: "--foreground", paint: "bg-foreground", use: "Text" },
  { name: "--muted-foreground", paint: "bg-muted-foreground", use: "Secondary text" },
  { name: "--primary", paint: "bg-primary", use: "Primary actions" },
  { name: "--signal", paint: "bg-signal", use: "The one accent" },
  { name: "--success", paint: "bg-success", use: "Positive state" },
  { name: "--warning", paint: "bg-warning", use: "Caution" },
  { name: "--destructive", paint: "bg-destructive", use: "Danger" },
  { name: "--ring", paint: "bg-ring", use: "Focus" },
];
const EDITORIAL: readonly Swatch[] = [
  { name: "--fux-ed-paper", paint: "bg-[var(--fux-ed-paper)]", use: "The sheet" },
  { name: "--fux-ed-raised", paint: "bg-[var(--fux-ed-raised)]", use: "Figure mounts, code" },
  { name: "--fux-ed-tone", paint: "bg-[var(--fux-ed-tone)]", use: "Pale fills" },
  { name: "--fux-ed-rule", paint: "bg-[var(--fux-ed-rule)]", use: "Hairlines" },
  { name: "--fux-ed-ink", paint: "bg-[var(--fux-ed-ink)]", use: "Text and line work" },
  { name: "--fux-ed-ink-soft", paint: "bg-[var(--fux-ed-ink-soft)]", use: "Captions and notes" },
  { name: "--fux-ed-accent", paint: "bg-[var(--fux-ed-accent)]", use: "Markers and marked lines" },
  { name: "--fux-ed-good", paint: "bg-[var(--fux-ed-good)]", use: "Stage glyphs, strings" },
];

const APP_TYPE: readonly { name: string; size: string; sample: string }[] = [
  { name: "text-2xl", size: "24 / 32", sample: "text-2xl font-semibold tracking-tight" },
  { name: "text-base", size: "16 / 24", sample: "text-base font-semibold" },
  { name: "text-sm", size: "14 / 20", sample: "text-sm" },
  { name: "text-ui", size: "13 / 20", sample: "text-ui" },
  { name: "text-xs", size: "12 / 16", sample: "text-xs text-muted-foreground" },
  { name: "text-2xs", size: "11 / 16", sample: "font-mono text-2xs uppercase tracking-widest" },
];

const RADII = ["rounded-sm", "rounded-md", "rounded-lg", "rounded-xl", "rounded-2xl"] as const;
const SPACES = [
  ["--fux-space-xs", "w-1"],
  ["--fux-space-sm", "w-2"],
  ["--fux-space-md", "w-2.5"],
  ["--fux-space-lg", "w-3.5"],
  ["--fux-space-xl", "w-5"],
] as const;

/**
 * Foundations: the type, colour, space and motion decisions the two component sets share. Every
 * value here is a token; an application re-themes the kit by overriding them, never by forking.
 */
export function FoundationsPage() {
  return (
    <div className="h-full overflow-auto bg-background text-foreground">
      <header className="border-b px-5 pt-5 pb-5 md:px-8">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Fast UX Kit
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Foundations</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Type, colour, space and motion. App components and Editorial UI read the same tokens, so
          one theme carries across both.
        </p>
      </header>
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-8 md:px-8">
        <Section
          title="Type"
          note="Two voices: a compact sans for interfaces, a serif for reading."
        >
          <div className="grid gap-5 xl:grid-cols-2">
            <Panel title="App type" caption="--font-sans and --font-mono">
              <dl className="flex flex-col">
                {APP_TYPE.map((step) => (
                  <div
                    key={step.name}
                    className="flex items-baseline justify-between gap-4 border-b border-hairline py-2.5 last:border-0"
                  >
                    <dd className={cn("min-w-0 truncate", step.sample)}>Room for real work</dd>
                    <dt className="shrink-0 font-mono text-[11px] text-muted-foreground">
                      {step.name} · {step.size}
                    </dt>
                  </div>
                ))}
              </dl>
            </Panel>
            <Panel title="Editorial type" caption="--fux-ed-serif, --fux-ed-sans, --fux-ed-mono">
              <div
                className="editorial-paper fux-article -m-5 rounded-b-xl p-5"
                data-surface="plain"
              >
                <p className="fux-headline">A headline is a sentence.</p>
                <p className="fux-deck">The deck says the rest of it in one or two more.</p>
                <p className="mt-4">
                  Body text is set at 19 pixels on a 34rem measure, which is about 62 characters a
                  line.
                </p>
                <p className="fux-figure-caption">
                  Captions and notes drop to the sans at 13 pixels.
                </p>
                <p className="mt-3">
                  <code className="fux-literal">code --stays --mono</code>
                </p>
              </div>
            </Panel>
          </div>
        </Section>

        <Section
          title="Colour"
          note="Near-monochrome surfaces with one accent. Each has a dark value."
        >
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="App surfaces">
              <Swatches items={APP_SURFACES} />
            </Panel>
            <Panel title="App ink and state">
              <Swatches items={APP_INK} />
            </Panel>
            <Panel title="Editorial" caption="Falls back to the app theme unless overridden">
              <Swatches items={EDITORIAL} />
            </Panel>
          </div>
        </Section>

        <Section title="Space and shape" note="A short scale, used everywhere.">
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="Spacing">
              <ul className="flex flex-col gap-2.5">
                {SPACES.map(([name, width]) => (
                  <li key={name} className="flex items-center gap-3">
                    <span
                      aria-hidden="true"
                      className={cn("h-4 rounded-sm bg-foreground", width)}
                    />
                    <code className="font-mono text-[11px] text-muted-foreground">{name}</code>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Radius">
              <ul className="flex flex-wrap gap-3">
                {RADII.map((radius) => (
                  <li key={radius} className="flex flex-col items-center gap-1.5">
                    <span aria-hidden="true" className={cn("size-12 border bg-muted", radius)} />
                    <code className="font-mono text-[10px] text-muted-foreground">
                      {radius.replace("rounded-", "")}
                    </code>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel
              title="The reading page"
              caption="--fux-ed-measure, --fux-ed-gap, --fux-ed-margin"
            >
              <div className="flex h-24 items-stretch gap-2 font-mono text-[10px] text-muted-foreground">
                <div className="flex flex-[34] items-center justify-center rounded-sm border bg-muted">
                  measure 34rem
                </div>
                <div className="flex flex-[2.5] items-center justify-center" aria-hidden="true">
                  ·
                </div>
                <div className="flex flex-[13.5] items-center justify-center rounded-sm border border-dashed">
                  margin
                </div>
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                Notes and small figures sit in the margin on a wide page and fold into the column on
                a narrow one.
              </p>
            </Panel>
          </div>
        </Section>

        <Section title="Motion" note="Subtle, automatic, and the reader can always pause it.">
          <div className="grid gap-5 xl:grid-cols-3">
            <Panel title="Timing">
              <ul className="flex flex-col gap-2 text-sm">
                <li className="flex justify-between gap-3">
                  State changes{" "}
                  <code className="font-mono text-xs text-muted-foreground">140ms</code>
                </li>
                <li className="flex justify-between gap-3">
                  Figure steps{" "}
                  <code className="font-mono text-xs text-muted-foreground">260 to 320ms</code>
                </li>
                <li className="flex justify-between gap-3">
                  Autoplay hold{" "}
                  <code className="font-mono text-xs text-muted-foreground">2.6s a step</code>
                </li>
              </ul>
            </Panel>
            <Panel title="Easing">
              <code className="font-mono text-xs text-muted-foreground">
                --ease-standard: cubic-bezier(0.2, 0, 0, 1)
              </code>
              <p className="mt-3 text-xs text-muted-foreground">
                One curve. Things settle quickly and never bounce.
              </p>
            </Panel>
            <Panel title="Rules">
              <ul className="flex list-disc flex-col gap-1.5 ps-4 text-sm text-muted-foreground">
                <li>Self-running figures only play while they are on screen.</li>
                <li>Each one carries a pause control.</li>
                <li>Reduced motion starts everything paused.</li>
              </ul>
            </Panel>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={`foundation-${title}`}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-hairline pb-2">
        <h2
          id={`foundation-${title}`}
          className="font-mono text-xs uppercase tracking-widest text-muted-foreground"
        >
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">{note}</p>
      </div>
      {children}
    </section>
  );
}

function Panel({
  title,
  caption,
  children,
}: {
  title: string;
  caption?: string;
  children: React.ReactNode;
}) {
  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-card text-card-foreground shadow-xs">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-hairline px-5 py-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {caption && <code className="font-mono text-[11px] text-muted-foreground">{caption}</code>}
      </header>
      <div className="min-w-0 p-5">{children}</div>
    </article>
  );
}

function Swatches({ items }: { items: readonly Swatch[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn("size-8 shrink-0 rounded-md border border-foreground/10", item.paint)}
          />
          <span className="min-w-0">
            <span className="block truncate font-mono text-[11px]">{item.name}</span>
            <span className="block text-xs text-muted-foreground">{item.use}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
