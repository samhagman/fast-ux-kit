// Browser-only entry. Kept as an explicit asset so consumers can bundle its URL.
import ELK from "elkjs/lib/elk.bundled.js";
const engine = new ELK();
self.onmessage = async ({ data }) => {
  try {
    self.postMessage({ id: data.id, graph: await engine.layout(data.graph) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : "Layout failed",
    });
  }
};
