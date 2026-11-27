import * as React from "react";

/**
 * `chrome="none"` on a page: the machine as a picture between paragraphs, in a box of its own,
 * fitted and centred. The column scrolls, and a wheel over the machine scrolls it too (the
 * picture captures nothing). `?chrome=none` opens the Machine Graph and Machine Tree pages here.
 */
export function MachinePresentationDemo({
  view,
  label,
  dir,
  children,
}: {
  readonly view: "graph" | "tree";
  readonly label: string;
  readonly dir?: "rtl";
  readonly children: React.ReactNode;
}) {
  const code =
    view === "graph" ? '<MachineGraphView chrome="none" />' : '<MachineTree chrome="none" />';
  const controls =
    view === "graph"
      ? "nothing to pan, zoom or press"
      : "nothing to scroll or select, though a container's chevron still folds it";
  const keyboard =
    view === "graph" ? "the parts inside are not tab stops" : "only the fold buttons are tab stops";
  return (
    <div data-demo-presentation={view} dir={dir} className="h-full overflow-y-auto">
      <article className="mx-auto grid max-w-3xl gap-4 px-4 py-6 text-ui">
        <p className="text-muted-foreground">
          <code className="font-mono text-[12px] text-foreground">{code}</code> shows only the
          machine: no toolbar, status bar or panel, {controls}. It fits the box it is given and
          stays centred as the box resizes.
        </p>
        <figure className="grid gap-2">
          <div className="h-[min(440px,60vh)]">{children}</div>
          <figcaption className="text-[12px] text-muted-foreground">
            {label}, as a picture.
          </figcaption>
        </figure>
        <p className="text-muted-foreground">
          The page scrolls past it as it would past an image. A screen reader hears its name and a
          sentence per transition; {keyboard}.
        </p>
      </article>
    </div>
  );
}
