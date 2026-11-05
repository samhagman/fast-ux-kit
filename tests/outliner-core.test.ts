import assert from "node:assert/strict";
import test from "node:test";
import {
  exportOutline,
  exportOutlineJSON,
  findInLibrary,
  importOutlineJSON,
  importOutlineText,
  inlineToPlain,
  parseInline,
  planItemMove,
  searchDocuments,
  type DocumentChange,
  type OutlineDocument,
  type OutlineWorkspaceDocument,
  type OutlineWorkspaceSnapshot,
} from "../src/core/index.js";
import * as library from "../src/outliner/library.js";
import * as workspace from "../src/outliner/workspace.js";
import * as interchange from "../src/outliner/interchange.js";

function apply(documents: readonly OutlineWorkspaceDocument[], changes: readonly DocumentChange[]) {
  return documents.map((document) => {
    const change = changes.find((entry) => entry.documentId === document.id);
    return change ? { ...document, nodes: change.after } : document;
  });
}

test("portable workspace APIs retain compatibility entry-point identities", () => {
  assert.equal(library.planItemMove, planItemMove);
  assert.equal(library.findInLibrary, findInLibrary);
  assert.equal(workspace.searchDocuments, searchDocuments);
  assert.equal(interchange.exportOutline, exportOutline);
  assert.equal(interchange.importOutlineText, importOutlineText);
  const document: OutlineWorkspaceDocument = { id: "notes", title: "Notes", nodes: [] };
  const snapshot: OutlineWorkspaceSnapshot = {
    documents: [document],
    layout: { folders: [], starred: [] },
  };
  const stored: OutlineDocument = importOutlineJSON(exportOutlineJSON(document.nodes));
  assert.equal(snapshot.documents[0]?.title, "Notes");
  assert.equal(stored.version, 1);
});

test("portable inline parsing and interchange work without browser globals", () => {
  assert.equal(typeof globalThis.document, "undefined");
  assert.equal(typeof globalThis.DOMParser, "undefined");
  const source = "**Ship** [[Plan|item-1]] #launch";
  assert.equal(inlineToPlain(source), "Ship Plan #launch");
  assert.deepEqual(
    parseInline(source)
      .filter((segment) => segment.kind === "ref")
      .map((segment) => segment.refId),
    ["item-1"],
  );
  const nodes = [
    {
      id: "item-1",
      text: source,
      checked: false,
      data: { note: "Details" },
      children: [{ id: "child", text: "Review" }],
    },
  ];
  let next = 0;
  const imported = importOutlineText(exportOutline(nodes, "markdown"), () => `copy-${++next}`);
  assert.equal(imported[0]?.text, source);
  assert.equal(imported[0]?.checked, false);
  assert.equal(imported[0]?.data?.note, "Details");
  assert.equal(imported[0]?.children?.[0]?.text, "Review");
  assert.match(exportOutline(nodes, "opml"), /<opml version="2.0">/);
  assert.deepEqual(
    importOutlineText(exportOutline(nodes, "json"), () => `copy-${++next}`).map(
      (node) => node.text,
    ),
    [source.replace("item-1", "copy-3")],
  );
});

test("portable cross-document travel preserves edits through undo and redo", () => {
  const initial: readonly OutlineWorkspaceDocument[] = [
    { id: "source", title: "Source", nodes: [{ id: "item", text: "Original" }] },
    { id: "target", title: "Target", nodes: [] },
  ];
  const transfer = planItemMove(initial, "source", ["item"], "target");
  assert.ok(transfer?.travel);
  const moved = apply(initial, transfer.changes);
  const edited = moved.map((document) =>
    document.id === "target"
      ? {
          ...document,
          nodes: [
            {
              ...document.nodes[0]!,
              text: "Edited after move",
              children: [{ id: "new-child", text: "New child" }],
            },
          ],
        }
      : document,
  );
  const undo = transfer.travel(edited, "undo");
  assert.ok(undo);
  const restored = apply(edited, undo);
  assert.equal(restored[0]?.nodes[0]?.text, "Edited after move");
  assert.equal(restored[0]?.nodes[0]?.children?.[0]?.id, "new-child");
  const redo = transfer.travel(restored, "redo");
  assert.ok(redo);
  assert.equal(apply(restored, redo)[1]?.nodes[0]?.text, "Edited after move");
  assert.equal(
    transfer.travel(
      edited.filter((document) => document.id !== "source"),
      "undo",
    ),
    null,
  );
});
