import * as React from "react";
import { Outliner, type OutlineItem } from "@samhagman/fast-ux-kit/outliner";
import { Button } from "@samhagman/fast-ux-kit/components/ui/button";
const KEY = "fux.synthetic-attachment-demo";
const initial = (): readonly OutlineItem[] => [{ id: "image-row", text: "" }];
/** Synthetic fixture: intentionally maps every pasted image to a bundled public drawing. */
export function AttachmentDemo() {
  const [nodes, setNodes] = React.useState<readonly OutlineItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? "null") ?? initial();
    } catch {
      return initial();
    }
  });
  const [status, setStatus] = React.useState(
    "Paste an image into the empty row. This demo stores a bundled illustration, not your clipboard image.",
  );
  const [readOnly, setReadOnly] = React.useState(false);
  return (
    <section className="mx-auto w-full max-w-4xl p-6">
      <h1 className="text-2xl font-semibold">Image rows</h1>
      <p className="my-3 text-sm text-muted-foreground" role="status">
        {status}
      </p>
      <div className="mb-5 flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem(KEY);
            setNodes(initial());
          }}
        >
          Reset example
        </Button>
        <Button variant="outline" onClick={() => setReadOnly(!readOnly)}>
          {readOnly ? "Enable editing" : "Read only"}
        </Button>
      </div>
      <Outliner
        value={nodes}
        title="Visual field notes"
        readOnly={readOnly}
        onValueChange={(next) => {
          setNodes(next);
          localStorage.setItem(KEY, JSON.stringify(next));
          setStatus("Image row saved locally. Reload to verify persistence.");
        }}
        onAttach={React.useCallback(
          async (files: readonly File[]) =>
            files
              .filter((f) => f.type.startsWith("image/"))
              .map(() => ({
                name: "Field study",
                href: "/demo/attachment-study.svg",
                kind: "image" as const,
              })),
          [],
        )}
      />
    </section>
  );
}
