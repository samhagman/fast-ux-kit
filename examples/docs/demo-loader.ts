import { useEffect, useState } from "react";
import type { ComponentManifestEntry } from "../../src/components/manifest.js";
import type { ComponentDemo } from "./ui.js";

type Registry = Record<string, ComponentDemo>;
type Group = "aria" | "ark" | "advanced";
const advanced = new Set(["Carousel", "FloatingPanel", "ImageCropper", "SignaturePad", "Tour"]);
const cache = new Map<Group, Registry>();
const pending = new Map<Group, Promise<Registry>>();
const loaders = {
  aria: () => import("./demos/aria-demos.js").then((module) => module.ariaDemos),
  ark: () => import("./demos/ark-demos.js").then((module) => module.arkDemos),
  advanced: () => import("./demos/ark-advanced-demos.js").then((module) => module.arkAdvancedDemos),
};
function registry(group: Group) {
  const loaded = cache.get(group);
  if (loaded) return Promise.resolve(loaded);
  const existing = pending.get(group);
  if (existing) return existing;
  const request = loaders[group]().then(
    (value) => {
      cache.set(group, value);
      pending.delete(group);
      return value;
    },
    (error) => {
      pending.delete(group);
      throw error;
    },
  );
  pending.set(group, request);
  return request;
}
/** Load only the relevant example group; late navigation never replaces another page's demo. */
export function useFamilyDemo(entry: ComponentManifestEntry) {
  const group: Group = advanced.has(entry.name)
    ? "advanced"
    : entry.owner === "ark"
      ? "ark"
      : "aria";
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ demo?: ComponentDemo; failed?: boolean }>(() => ({
    demo: cache.get(group)?.[entry.exportName],
  }));
  useEffect(() => {
    let active = true;
    const cached = cache.get(group)?.[entry.exportName];
    setResult({ demo: cached });
    if (!cached)
      registry(group).then(
        (items) => {
          if (active)
            setResult(
              items[entry.exportName] ? { demo: items[entry.exportName] } : { failed: true },
            );
        },
        () => {
          if (active) setResult({ failed: true });
        },
      );
    return () => {
      active = false;
    };
  }, [group, entry.exportName, attempt]);
  return {
    ...result,
    loading: !result.demo && !result.failed,
    retry: () => setAttempt((value) => value + 1),
  };
}
