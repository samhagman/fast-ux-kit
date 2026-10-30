import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Outliner, type OutlinerHandle } from "@/registry/outliner/outliner";
import { createLargeOutline, createLaunchOutline, isLockedItem } from "@/demo/outliner-fixture";
import type { OutlineBookmarks, OutlineItem } from "@/registry/outliner/types";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export function OutlinerPage() {
  const [key, setKey] = React.useState(0);
  const [readOnly, setReadOnly] = React.useState(false);
  const [rtl, setRtl] = React.useState(false);
  const [sample, setSample] = React.useState<"launch" | "large">(() =>
    new URLSearchParams(window.location.search).get("sample") === "large" ? "large" : "launch",
  );
  const initial = React.useMemo(() => (sample === "large" ? createLargeOutline() : createLaunchOutline()), [key, sample]);
  // ?controlled=1: the page owns the document (value + onValueChange), like a host with a store.
  const controlled = React.useMemo(() => new URLSearchParams(window.location.search).get("controlled") === "1", []);
  const [hosted, setHosted] = React.useState({ source: initial, nodes: initial as readonly OutlineItem[] });
  const value = hosted.source === initial ? hosted.nodes : initial;
  // ?latency=300: the host answers after a store round trip (the outliner shows edits optimistically).
  const latency = React.useMemo(() => Number(new URLSearchParams(window.location.search).get("latency")) || 0, []);
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
    searches: [{ query: "is:todo due:overdue", label: "Overdue tasks" }, { query: "due:week", label: "This week" }],
  }));
  // Zoom lives in the URL (?zoom=id) so Back/Forward step through hoists.
  const readZoom = () => new URLSearchParams(window.location.search).get("zoom");
  const [zoom, setZoom] = React.useState<string | null>(readZoom);
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
    if (new URLSearchParams(window.location.search).has("handle")) (window as unknown as { outliner: unknown }).outliner = handle.current;
  });
  const expanded = React.useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: readonly (typeof initial)[number][]) =>
      nodes.forEach((node) => {
        if (!/^loose|^decisions/.test(node.id) && node.text !== "Capacity plan per region") ids.push(node.id);
        if (node.children) walk(node.children);
      });
    walk(initial);
    return ids;
  }, [initial]);
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-3 border-b bg-background/60 px-4">
        <h1 className="text-ui font-semibold max-sm:sr-only">Outliner</h1>
        <span className="font-mono text-[11px] text-muted-foreground max-sm:hidden">registry/outliner</span>
        {controlled && (
          <span className="rounded-[5px] border border-hairline px-1.5 font-mono text-[10.5px] leading-5 text-muted-foreground" title="The page owns the document: value + onValueChange">
            controlled{latency ? ` · ${latency}ms` : ""}
          </span>
        )}
        <div className="ms-auto flex items-center gap-4">
          <Select value={sample} onValueChange={(value) => setSample(value as typeof sample)}>
            <SelectTrigger size="sm" className="w-40 text-ui max-sm:w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="launch" className="text-ui">Launch plan</SelectItem>
              <SelectItem value="large" className="text-ui">Large · 2,500 items</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-2">
            <Switch id="ro" size="sm" checked={readOnly} onCheckedChange={setReadOnly} />
            <Label htmlFor="ro" className="text-ui font-normal text-muted-foreground max-sm:sr-only">Read-only</Label>
          </div>
          <div className="flex items-center gap-2 max-sm:hidden">
            <Switch id="rtl" size="sm" checked={rtl} onCheckedChange={setRtl} />
            <Label htmlFor="rtl" className="text-ui font-normal text-muted-foreground">RTL</Label>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setKey((k) => k + 1)} className="text-muted-foreground">
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
          bookmarks={bookmarks}
          onBookmarksChange={setBookmarks}
          className="mx-auto h-full max-w-5xl max-sm:rounded-none max-sm:border-x-0"
        />
      </div>
    </div>
  );
}
