import type { ElkNode } from "elkjs/lib/elk-api";

export interface MachineLayoutWorkerOptions {
  /** Disable for hosts whose content security policy does not permit workers. */
  readonly enabled?: boolean;
  /** The returned worker is owned and terminated by this view. */
  readonly createWorker?: () => Worker;
}
export interface MachineLayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>;
  dispose(): void;
}
/** Lazy worker with a lazy in-process fallback. Construction is safe during SSR. */
export function createMachineLayoutEngine(
  options: MachineLayoutWorkerOptions = {},
): MachineLayoutEngine {
  let worker: Worker | undefined,
    failed = false,
    serial = 0,
    generation = 0;
  let fallback: Promise<{ layout(graph: ElkNode): Promise<ElkNode> }> | undefined;
  const pending = new Map<
    number,
    {
      resolve: (graph: ElkNode) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  const stop = (message: string) => {
    worker?.terminate();
    worker = undefined;
    pending.forEach((p) => {
      clearTimeout(p.timer);
      p.reject(new Error(message));
    });
    pending.clear();
  };
  const inProcess = async (graph: ElkNode) => {
    fallback ??= import("elkjs/lib/elk.bundled.js").then((module) => new module.default());
    return (await fallback).layout(graph);
  };
  return {
    async layout(graph) {
      const token = generation;
      if (
        options.enabled === false ||
        failed ||
        (typeof Worker === "undefined" && !options.createWorker)
      )
        return inProcess(graph);
      try {
        if (!worker) {
          worker = options.createWorker
            ? options.createWorker()
            : new Worker(new URL("./layout-worker-entry.js", import.meta.url), {
                type: "module",
                name: "fast-ux-machine-layout",
              });
          worker.onmessage = ({
            data,
          }: MessageEvent<{ id: number; graph?: ElkNode; error?: string }>) => {
            const p = pending.get(data.id);
            if (!p) return;
            clearTimeout(p.timer);
            pending.delete(data.id);
            if (data.graph) p.resolve(data.graph);
            else p.reject(new Error(data.error ?? "Layout failed"));
          };
          worker.onerror = () => {
            failed = true;
            stop("Layout worker failed");
          };
          worker.onmessageerror = () => {
            failed = true;
            stop("Layout worker response could not be read");
          };
        }
        const id = ++serial;
        return await new Promise<ElkNode>((resolve, reject) => {
          const timer = setTimeout(() => {
            failed = true;
            stop("Layout worker timed out");
          }, 60000);
          pending.set(id, { resolve, reject, timer });
          try {
            worker!.postMessage({ id, graph });
          } catch (error) {
            clearTimeout(timer);
            pending.delete(id);
            reject(error);
          }
        });
      } catch (error) {
        if (token !== generation) throw error;
        failed = true;
        stop("Layout worker unavailable");
        return inProcess(graph);
      }
    },
    dispose() {
      generation++;
      stop("Layout view was released");
    },
  };
}
