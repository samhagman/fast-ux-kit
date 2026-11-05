import * as React from "react";
import { Layers, Lock, LockOpen, RotateCcw } from "lucide-react";
import { Outliner, type OutlinerHandle } from "@samhagman/fast-ux-kit/outliner";
import {
  createLargeOutline,
  createLaunchOutline,
  createWorkspaceDocuments,
  createWorkspaceLayout,
  isLockedItem,
} from "@/demo/outliner-fixture";
import type {
  OutlineBookmarks,
  OutlineDocument,
  OutlineItem,
} from "@samhagman/fast-ux-kit/outliner";
import { OutlinerWorkspace, type OutlinerWorkspaceHandle } from "@samhagman/fast-ux-kit/outliner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@samhagman/fast-ux-kit/components/ui/select";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
import { Switch } from "@samhagman/fast-ux-kit/components/ui/switch";
import { Label } from "@samhagman/fast-ux-kit/components/ui/label";
import { demoRenderers } from "@/demo/outliner-renderers";
import type { OutlinerSettings } from "@samhagman/fast-ux-kit/outliner";
import type { OutlinerPaletteCommand } from "@samhagman/fast-ux-kit/outliner";
import { deepLinkTarget } from "@samhagman/fast-ux-kit/outliner";
import { useMediaQuery } from "@/hooks/use-media-query";

/**
 * The page persists the reader's settings (the outliner never touches storage): controlled
 * `settings` + `onSettingsChange`, saved to localStorage, shared by every document.
 */
const SETTINGS_KEY = "fux.outliner.settings";
function useStoredSettings() {
  const [settings, setSettings] = React.useState<Partial<OutlinerSettings>>(() => {
    try {
      return JSON.parse(
        window.localStorage.getItem(SETTINGS_KEY) ?? "{}",
      ) as Partial<OutlinerSettings>;
    } catch {
      return {};
    }
  });
  const onSettingsChange = React.useCallback((next: OutlinerSettings) => {
    setSettings(next);
    try {
      window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch {
      // Private mode or full storage: the settings still apply for this visit.
    }
  }, []);
  return { settings, onSettingsChange };
}

/**
 * The demo's own controls (read-only, reset, sample). A desktop shows them in a header row; a
 * phone has no room for a second row of chrome above the outliner, so they move into the
 * outliner's ⋯ sheet through the `menuCommands` host slot.
 */
function useDemoCommands({
  phone,
  readOnly,
  setReadOnly,
  reset,
  sample,
}: {
  readonly phone: boolean;
  readonly readOnly: boolean;
  readonly setReadOnly: (readOnly: boolean) => void;
  readonly reset: () => void;
  readonly sample?: {
    readonly value: "launch" | "large";
    readonly set: (value: "launch" | "large") => void;
  };
}): readonly OutlinerPaletteCommand[] | undefined {
  return React.useMemo(
    () =>
      phone
        ? [
            ...(sample
              ? [
                  {
                    id: "demo-sample",
                    label:
                      sample.value === "large"
                        ? "Demo: Launch plan sample"
                        : "Demo: Large sample (2,500 items)",
                    icon: <Layers />,
                    run: () => sample.set(sample.value === "large" ? "launch" : "large"),
                  },
                ]
              : []),
            {
              id: "demo-read-only",
              label: readOnly ? "Demo: make editable" : "Demo: make read-only",
              icon: readOnly ? <LockOpen /> : <Lock />,
              run: () => setReadOnly(!readOnly),
            },
            { id: "demo-reset", label: "Demo: reset", icon: <RotateCcw />, run: reset },
          ]
        : undefined,
    [phone, readOnly, setReadOnly, reset, sample],
  );
}

export function OutlinerPage() {
  // ?workspace=1: several documents with a switcher (OutlinerWorkspace).
  const workspace = React.useMemo(
    () => new URLSearchParams(window.location.search).get("workspace") === "1",
    [],
  );
  return workspace ? <WorkspacePage /> : <SinglePage />;
}

function WorkspacePage() {
  const [key, setKey] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const [rtl, setRtl] = React.useState(false);
  const initial = React.useMemo(() => createWorkspaceDocuments(), [key]);
  const layout = React.useMemo(() => createWorkspaceLayout(), [key]);
  // ?controlled=1: the page owns the documents (documents + onDocumentsChange), like a host with a store.
  const controlled = React.useMemo(
    () => new URLSearchParams(window.location.search).get("controlled") === "1",
    [],
  );
  const [hosted, setHosted] = React.useState({
    source: initial,
    documents: initial as readonly OutlineDocument[],
  });
  const documents = hosted.source === initial ? hosted.documents : initial;
  const onDocumentsChange = React.useCallback(
    (next: readonly OutlineDocument[]) => setHosted({ source: initial, documents: next }),
    [initial],
  );
  const handle = React.useRef<OutlinerWorkspaceHandle>(null);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("handle"))
      (window as unknown as { workspace: unknown }).workspace = handle.current;
  });
  const stored = useStoredSettings();
  // A copied item link (?doc=<document>&zoom=<item>) opens that document zoomed into the item.
  const deepLink = React.useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return { doc: params.get("doc"), zoom: params.get("zoom") };
  }, []);
  React.useEffect(() => {
    const { doc, zoom } = deepLink;
    if (!doc) return;
    // A link to a leaf opens its parent's zoom with the leaf selected (openLink).
    requestAnimationFrame(() => {
      if (handle.current?.open(doc) && zoom)
        requestAnimationFrame(() => handle.current?.active()?.openLink(zoom));
    });
  }, [deepLink, key]);
  const phone = useMediaQuery("(max-width: 639px)");
  const reset = React.useCallback(() => setKey((k) => k + 1), []);
  const menuCommands = useDemoCommands({ phone, readOnly, setReadOnly, reset });
  return (
    <div className="flex h-full flex-col">
      <h1 className="sr-only sm:hidden">Outliner</h1>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-background/60 px-4 max-sm:hidden">
        <h1 className="text-ui font-semibold max-sm:sr-only">Outliner</h1>
        <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden">
          registry/outliner · workspace
        </span>
        {controlled && (
          <span
            className="rounded-[5px] border border-hairline px-1.5 font-mono text-[10.5px] leading-5 text-muted-foreground"
            title="The page owns the documents: documents + onDocumentsChange"
          >
            controlled
          </span>
        )}
        <div className="ms-auto flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch id="ro" size="sm" checked={readOnly} onCheckedChange={setReadOnly} />
            <Label
              htmlFor="ro"
              className="text-ui font-normal text-muted-foreground max-sm:sr-only"
            >
              Read-only
            </Label>
          </div>
          <div className="flex items-center gap-2 max-sm:hidden">
            <Switch id="rtl" size="sm" checked={rtl} onCheckedChange={setRtl} />
            <Label htmlFor="rtl" className="text-ui font-normal text-muted-foreground">
              RTL
            </Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKey((k) => k + 1)}
            className="text-muted-foreground"
          >
            <RotateCcw /> <span className="max-sm:sr-only">Reset</span>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-0 sm:p-4" dir={rtl ? "rtl" : "ltr"}>
        <OutlinerWorkspace
          key={key}
          ref={handle}
          {...(controlled ? { documents, onDocumentsChange } : { defaultDocuments: initial })}
          defaultLayout={layout}
          defaultActiveId="launch"
          readOnly={readOnly}
          isLocked={isLockedItem}
          renderers={demoRenderers}
          menuCommands={menuCommands}
          {...stored}
          className="mx-auto h-full max-w-6xl max-sm:rounded-none max-sm:border-0"
        />
      </div>
    </div>
  );
}

function SinglePage() {
  const [key, setKey] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const [rtl, setRtl] = React.useState(false);
  const [sample, setSample] = React.useState<"launch" | "large">(() =>
    new URLSearchParams(window.location.search).get("sample") === "large" ? "large" : "launch",
  );
  const initial = React.useMemo(
    () => (sample === "large" ? createLargeOutline() : createLaunchOutline()),
    [key, sample],
  );
  // ?controlled=1: the page owns the document (value + onValueChange), like a host with a store.
  const controlled = React.useMemo(
    () => new URLSearchParams(window.location.search).get("controlled") === "1",
    [],
  );
  const [hosted, setHosted] = React.useState({
    source: initial,
    nodes: initial as readonly OutlineItem[],
  });
  const value = hosted.source === initial ? hosted.nodes : initial;
  // ?latency=300: the host answers after a store round trip (the outliner shows edits optimistically).
  const latency = React.useMemo(
    () => Number(new URLSearchParams(window.location.search).get("latency")) || 0,
    [],
  );
  const onValueChange = React.useCallback(
    (nodes: readonly OutlineItem[]) => {
      if (latency) window.setTimeout(() => setHosted({ source: initial, nodes }), latency);
      else setHosted({ source: initial, nodes });
    },
    [initial, latency],
  );
  // The page persists bookmarks (a real host would store them with the user's settings).
  const [bookmarks, setBookmarks] = React.useState<OutlineBookmarks>(() => ({
    items: [],
    searches: [
      { query: "is:todo due:overdue", label: "Overdue tasks" },
      { query: "due:week", label: "This week" },
    ],
  }));
  // Zoom lives in the URL (?zoom=id) so Back/Forward step through hoists.
  const readZoom = () => new URLSearchParams(window.location.search).get("zoom");
  // A deep link to a leaf opens its parent's zoom with the leaf selected (never an empty page).
  const linkedLeaf = React.useRef<string | null>(null);
  const [zoom, setZoom] = React.useState<string | null>(() => {
    const id = readZoom();
    const target = id ? deepLinkTarget(initial, id) : null;
    if (!target?.select) return id;
    linkedLeaf.current = target.select;
    const url = new URL(window.location.href);
    if (target.zoom) url.searchParams.set("zoom", target.zoom);
    else url.searchParams.delete("zoom");
    window.history.replaceState(null, "", url);
    return target.zoom;
  });
  React.useEffect(() => {
    const on = () => setZoom(readZoom());
    window.addEventListener("popstate", on);
    return () => window.removeEventListener("popstate", on);
  }, []);
  const onHoistChange = React.useCallback((id: string | null) => {
    if (id === readZoom()) return;
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("zoom", id);
    else url.searchParams.delete("zoom");
    window.history.pushState(null, "", url);
    setZoom(id);
  }, []);
  // ?handle=1 exposes the imperative handle as window.outliner (focusItem, zoomTo, getValue, …).
  const handle = React.useRef<OutlinerHandle>(null);
  React.useEffect(() => {
    if (new URLSearchParams(window.location.search).has("handle"))
      (window as unknown as { outliner: unknown }).outliner = handle.current;
  });
  React.useEffect(() => {
    const leaf = linkedLeaf.current;
    linkedLeaf.current = null;
    if (leaf) requestAnimationFrame(() => handle.current?.focusItem(leaf));
  }, []);
  const stored = useStoredSettings();
  const phone = useMediaQuery("(max-width: 639px)");
  const reset = React.useCallback(() => setKey((k) => k + 1), []);
  const sampleControl = React.useMemo(() => ({ value: sample, set: setSample }), [sample]);
  const menuCommands = useDemoCommands({
    phone,
    readOnly,
    setReadOnly,
    reset,
    sample: sampleControl,
  });
  const expanded = React.useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: readonly (typeof initial)[number][]) =>
      nodes.forEach((node) => {
        if (!/^loose|^decisions/.test(node.id) && node.text !== "Capacity plan per region")
          ids.push(node.id);
        if (node.children) walk(node.children);
      });
    walk(initial);
    return ids;
  }, [initial]);
  return (
    <div className="flex h-full flex-col">
      <h1 className="sr-only sm:hidden">Outliner</h1>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-background/60 px-4 max-sm:hidden">
        <h1 className="text-ui font-semibold max-sm:sr-only">Outliner</h1>
        <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden">
          registry/outliner
        </span>
        {controlled && (
          <span
            className="rounded-[5px] border border-hairline px-1.5 font-mono text-[10.5px] leading-5 text-muted-foreground"
            title="The page owns the document: value + onValueChange"
          >
            controlled{latency ? ` · ${latency}ms` : ""}
          </span>
        )}
        <div className="ms-auto flex items-center gap-4">
          <Select value={sample} onValueChange={(value) => setSample(value as typeof sample)}>
            <SelectTrigger size="sm" className="w-40 text-ui max-sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="launch" className="text-ui">
                Launch plan
              </SelectItem>
              <SelectItem value="large" className="text-ui">
                Large · 2,500 items
              </SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="ro" size="sm" checked={readOnly} onCheckedChange={setReadOnly} />
            <Label
              htmlFor="ro"
              className="text-ui font-normal text-muted-foreground max-sm:sr-only"
            >
              Read-only
            </Label>
          </div>
          <div className="flex items-center gap-2 max-sm:hidden">
            <Switch id="rtl" size="sm" checked={rtl} onCheckedChange={setRtl} />
            <Label htmlFor="rtl" className="text-ui font-normal text-muted-foreground">
              RTL
            </Label>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setKey((k) => k + 1)}
            className="text-muted-foreground"
          >
            <RotateCcw /> <span className="max-sm:sr-only">Reset</span>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-0 sm:p-4" dir={rtl ? "rtl" : "ltr"}>
        <Outliner
          key={`${sample}-${key}`}
          ref={handle}
          title="Halcyon-3 launch plan"
          {...(controlled ? { value, onValueChange } : { defaultValue: initial })}
          defaultExpandedIds={expanded}
          readOnly={readOnly}
          hoistedId={zoom}
          onHoistChange={onHoistChange}
          isLocked={isLockedItem}
          renderers={demoRenderers}
          bookmarks={bookmarks}
          onBookmarksChange={setBookmarks}
          menuCommands={menuCommands}
          {...stored}
          className="mx-auto h-full max-w-5xl max-sm:rounded-none max-sm:border-0"
        />
      </div>
    </div>
  );
}
