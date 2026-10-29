import { useState } from "react";
import { Button, Checkbox, Row } from "../../src/components/aria.js";
import { Outliner } from "../../src/react/Outliner.js";
import type { OutlineNode } from "../../src/core/index.js";
import type { RichOutlineData } from "../../src/rich/index.js";

const readerNodes: readonly OutlineNode<RichOutlineData>[] = [
  {
    id: "research",
    text: "Make room for a better idea",
    children: [
      {
        id: "principles",
        text: "Start with the useful details",
        data: {
          content: {
            schema: "fast-ux-rich",
            version: 1,
            blocks: [
              {
                id: "principles-body",
                kind: "markdown",
                source:
                  "A calm interface gives the important things room to breathe. Keep **context close**, actions clear, and [the next step](#editor) within reach.",
              },
            ],
          },
        },
        children: [
          { id: "readable", text: "Readable at a glance. Comfortable on a phone." },
          { id: "folding", text: "Fold a detail without changing the document." },
        ],
      },
      {
        id: "checklist",
        text: "A small release checklist",
        children: [
          { id: "labels", text: "Give every action a useful label", checked: true },
          { id: "keyboard", text: "Try it with a keyboard", checked: true },
          { id: "phone", text: "Check the narrow-screen experience", checked: false },
        ],
      },
      {
        id: "notes",
        text: "Notes that belong with the work",
        data: {
          content: {
            schema: "fast-ux-rich",
            version: 1,
            blocks: [
              {
                id: "note-callout",
                kind: "callout",
                label: "A useful distinction",
                blocks: [
                  {
                    id: "note-copy",
                    kind: "markdown",
                    source:
                      "Reading state belongs to the reader. Document changes belong to an explicit editing workflow.",
                  },
                ],
              },
            ],
          },
        },
      },
    ],
  },
  {
    id: "next",
    text: "Keep the next step simple",
    children: [
      { id: "try", text: "Focus this branch, then return using the breadcrumbs." },
      { id: "own", text: "Bring your own typed data and trusted renderers." },
    ],
  },
];
const readerBranches = ["research", "principles", "checklist", "next"];

export function ReaderDemo({ compact = false }: { compact?: boolean }) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    new Set(compact ? ["research"] : readerBranches),
  );
  const [hoist, setHoist] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(false);
  return (
    <div className="outline-playground">
      {!compact && (
        <div className="playground-controls">
          <Row wrap>
            <Button onPress={() => setExpanded(new Set(readerBranches))}>Expand all</Button>
            <Button onPress={() => setExpanded(new Set())}>Collapse all</Button>
            <Button
              variant="quiet"
              onPress={() => {
                setHoist(null);
                setExpanded(new Set(readerBranches));
              }}
            >
              Reset view
            </Button>
            <Checkbox label="Disclosures at the start" isSelected={atStart} onChange={setAtStart} />
          </Row>
        </div>
      )}
      <div className="notebook-heading">
        <span className="notebook-dot" />
        <span>THE WORKING NOTEBOOK</span>
        <span className="reader-badge">Read only</span>
      </div>
      <Outliner
        nodes={readerNodes}
        aria-label="Interactive documentation outline"
        expandedIds={expanded}
        onExpandedChange={setExpanded}
        enableHoist
        hoistedId={hoist}
        onHoistChange={setHoist}
        disclosurePosition={atStart ? "start" : "end"}
        getRichContent={(node) => node.data?.content}
      />
      <p className="demo-status" role="status">
        {readerBranches.filter((id) => expanded.has(id)).length} expanded branches ·{" "}
        {hoist ? "Focused on one branch" : "Full document"} · 0 document writes
      </p>
    </div>
  );
}
