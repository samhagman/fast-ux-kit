// The workspace library: folders (nested, create/rename/delete-with-undo/reorder, filing
// documents), starred documents, the ⌘O finder's fuzzy ranking, the inbox and quick capture,
// moving items between documents, the tag pane, flat-result sorting, the import loss report,
// and the real OutlinerWorkspace in jsdom driving all of them.
//
//   cd studio && node --test tests/outliner-library.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, lib, tags, sort, report, hook;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  lib = await load("/src/registry/outliner/library.ts");
  tags = await load("/src/registry/outliner/tag-pane.ts");
  sort = await load("/src/registry/outliner/result-sort.tsx");
  report = await load("/src/registry/outliner/import-report.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
});
after(() => vite?.close());

const docs = () => [
  {
    id: "a",
    title: "Alpha",
    nodes: [
      {
        id: "a1",
        text: "Plan #launch @marco",
        children: [{ id: "a2", text: "Ship #launch #safety" }],
      },
    ],
  },
  { id: "b", title: "Beta", folderId: "f1", nodes: [{ id: "b1", text: "Beta notes #launch" }] },
  {
    id: "c",
    title: "Gamma",
    folderId: "f2",
    nodes: [{ id: "c1", text: "Deep #safety", data: { note: "with @marco" } }],
  },
  { id: "d", title: "Delta", folderId: "f1", nodes: [{ id: "d1", text: "" }] },
];
const layout = () => ({
  folders: [
    { id: "f1", title: "Projects" },
    { id: "f2", title: "Archive", parentId: "f1" },
    { id: "f3", title: "Team" },
  ],
  starred: ["c"],
  inboxId: null,
});
const shape = (rows) =>
  rows.map(
    (row) =>
      `${"  ".repeat(row.depth)}${row.kind === "folder" ? "▢" : "▤"} ${row.kind === "folder" ? row.folder.title : row.document.title}`,
  );

/* ───────────── Folders ───────────── */

test("library: the tree lists folders first, then documents, nested; folded folders hide their contents", () => {
  const all = new Set(["f1", "f2", "f3"]);
  assert.deepEqual(shape(lib.libraryRows(docs(), layout(), all)), [
    "▢ Projects",
    "  ▢ Archive",
    "    ▤ Gamma",
    "  ▤ Beta",
    "  ▤ Delta",
    "▢ Team",
    "▤ Alpha",
  ]);
  const rows = lib.libraryRows(docs(), layout(), new Set(["f2"]));
  assert.deepEqual(
    shape(rows),
    ["▢ Projects", "▢ Team", "▤ Alpha"],
    "a folded parent hides even an open child",
  );
  assert.equal(rows[0].count, 3, "a folder counts every document inside it, nested ones too");
  assert.equal(rows[1].empty, true);
  const orphan = [{ id: "x", title: "Lost", folderId: "gone", nodes: [] }];
  assert.deepEqual(
    shape(lib.libraryRows(orphan, layout(), all)).at(-1),
    "▤ Lost",
    "an unknown folder means top level",
  );
});

test("library: create, rename, move (never into itself), shift among siblings", () => {
  const made = lib.createFolder(layout(), "Q3", "f1", "f9");
  assert.equal(made.id, "f9");
  assert.equal(made.layout.folders.at(-1).parentId, "f1");
  assert.equal(lib.renameFolder(made.layout, "f9", "Q4").folders.at(-1).title, "Q4");
  assert.equal(lib.renameFolder(made.layout, "f9", "Q3"), made.layout, "a no-op keeps identity");
  const l = layout();
  assert.equal(lib.moveFolder(l, "f1", "f2"), l, "a folder never moves into its own subfolder");
  assert.equal(lib.moveFolder(l, "f1", "f1"), l);
  const moved = lib.moveFolder(l, "f2", null, "f1");
  assert.deepEqual(
    moved.folders.map((f) => `${f.id}:${f.parentId ?? "-"}`),
    ["f2:-", "f1:-", "f3:-"],
    "to the top level, before Projects",
  );
  assert.deepEqual(
    lib.shiftFolder(l, "f3", -1).folders.map((f) => f.id),
    ["f3", "f1", "f2"],
    "Team moves above Projects (Archive is not its sibling)",
  );
  assert.equal(lib.shiftFolder(l, "f1", -1), l, "the first sibling stays put");
});

test("library: deleting a folder keeps everything in it (moved up a level); Undo restores exactly", () => {
  const before = { documents: docs(), layout: layout() };
  const {
    documents,
    layout: after,
    removed,
  } = lib.removeFolder(before.documents, before.layout, "f1");
  assert.deepEqual(
    after.folders.map((f) => `${f.id}:${f.parentId ?? "-"}`),
    ["f2:-", "f3:-"],
    "Archive moved to the top level",
  );
  assert.deepEqual(
    documents.map((d) => d.folderId ?? "-"),
    ["-", "-", "f2", "-"],
    "Beta and Delta moved up; Gamma stays in Archive",
  );
  assert.deepEqual(removed.documents, ["b", "d"]);
  const back = lib.restoreFolder(documents, after, removed);
  assert.deepEqual(back.layout.folders, before.layout.folders);
  assert.deepEqual(
    back.documents.map((d) => d.folderId ?? "-"),
    before.documents.map((d) => d.folderId ?? "-"),
  );
  assert.equal(
    lib.restoreFolder(back.documents, back.layout, removed).layout,
    back.layout,
    "restoring twice never duplicates",
  );
});

test("library: filing a document sets its folder and its place in one step", () => {
  const l = layout();
  const filed = lib.placeDocument(docs(), l, "a", "f1");
  assert.deepEqual(
    filed.map((d) => `${d.id}:${d.folderId ?? "-"}`),
    ["b:f1", "c:f2", "d:f1", "a:f1"],
    "after the last document in Projects",
  );
  const before = lib.placeDocument(docs(), l, "a", "f1", "d");
  assert.deepEqual(
    before.map((d) => d.id),
    ["b", "c", "a", "d"],
    "just before Delta",
  );
  const top = lib.placeDocument(docs(), l, "b", null);
  assert.equal(top.find((d) => d.id === "b").folderId, undefined, "top level drops the field");
  assert.deepEqual(
    lib
      .shiftDocument(docs(), l, "d", -1)
      .filter((d) => d.folderId === "f1")
      .map((d) => d.id),
    ["d", "b"],
    "⌥⇧↑ within its folder",
  );
  const same = docs();
  assert.equal(lib.placeDocument(same, l, "b", "f1", "d"), same, "no change, same array");
});

/* ───────────── Starred documents, inbox, capture ───────────── */

test("library: stars toggle and list in star order; deleted documents drop out", () => {
  let l = layout();
  const on = lib.toggleStar(l, "a");
  assert.equal(on.starred, true);
  l = on.layout;
  assert.deepEqual(
    lib.starredDocuments(docs(), l).map((d) => d.id),
    ["c", "a"],
  );
  assert.deepEqual(
    lib
      .starredDocuments(
        docs().filter((d) => d.id !== "c"),
        l,
      )
      .map((d) => d.id),
    ["a"],
  );
  assert.equal(lib.toggleStar(l, "a").starred, false);
});

test("library: capture stamps a fresh item; appending replaces a new document's empty starter item", () => {
  const item = lib.captureItem("  Call Marco\n about the pilot ", 1000, "cap");
  assert.deepEqual(item, {
    id: "cap",
    text: "Call Marco about the pilot",
    data: { createdAt: 1000, editedAt: 1000 },
  });
  const list = lib.appendToDocument(docs(), "d", [item]);
  assert.deepEqual(
    list.find((d) => d.id === "d").nodes.map((n) => n.id),
    ["cap"],
    "Delta's lone empty item is replaced",
  );
  const more = lib.appendToDocument(list, "d", [lib.captureItem("Two", 1, "two")]);
  assert.deepEqual(
    more.find((d) => d.id === "d").nodes.map((n) => n.id),
    ["cap", "two"],
  );
  const removed = lib.removeFromDocument(more, "a", new Set(["a2"]));
  assert.equal(
    removed.find((d) => d.id === "a").nodes[0].children.length,
    0,
    "a nested item comes out with its subtree",
  );
  assert.equal(
    lib.inboxOf(docs(), { ...layout(), inboxId: "zz" }),
    null,
    "a deleted inbox is no inbox",
  );
});

test("transfer: a move plans one change per document; a taken id is replaced and every link follows", () => {
  let n = 0;
  const fresh = () => `new${++n}`;
  const start = [
    {
      id: "s",
      title: "Source",
      nodes: [
        { id: "x", text: "Moving", children: [{ id: "k", text: "kid [[Sib|y]] and [[Stay|z]]" }] },
        { id: "y", text: "Sibling, also moving" },
        { id: "z", text: "stays, cites [[M|x]]" },
      ],
    },
    {
      id: "t",
      title: "Target",
      nodes: [
        { id: "x", text: "Already here" },
        { id: "t2", text: "cites [[M|s/x]] and [[S|s/y]]" },
      ],
    },
    { id: "o", title: "Other", nodes: [{ id: "o1", text: "[[M|s/x]] [[K|s/k]] [[Z|s/z]]" }] },
    { id: "q", title: "Quiet", nodes: [{ id: "q1", text: "no links" }] },
  ];
  const plan = lib.planItemMove(start, "s", ["x", "y", "k"], "t", fresh);
  assert.deepEqual(
    plan.changes.map((c) => c.documentId),
    ["s", "t", "o"],
    "only documents that change",
  );
  const [source, target, other] = plan.changes;
  assert.deepEqual(
    source.after.map((node) => node.id),
    ["z"],
  );
  assert.equal(
    source.after[0].text,
    "stays, cites [[M|t/new1]]",
    "the source's link crosses documents now",
  );
  assert.deepEqual(
    target.after.map((node) => node.id),
    ["x", "t2", "new1", "y"],
    "x was taken in the target: fresh id; y kept",
  );
  const ids = [...lib.idsIn(target.after)];
  assert.equal(new Set(ids).size, ids.length, "no repeated id");
  assert.equal(
    target.after[1].text,
    "cites [[M|new1]] and [[S|y]]",
    "the target's links are local now",
  );
  assert.equal(
    target.after[2].children[0].text,
    "kid [[Sib|y]] and [[Stay|s/z]]",
    "moved links: a fellow mover stays local, a stayer is qualified",
  );
  assert.equal(other.after[0].text, "[[M|t/new1]] [[K|t/k]] [[Z|s/z]]");
  assert.deepEqual(
    [...target.carried].sort(),
    ["k", "new1", "y"],
    "moved ids are carried (never stamped as edits)",
  );
  assert.equal(plan.ids.get("x"), "new1");
  assert.deepEqual(plan.roots, ["new1", "y"]);
  // Re-applied on top of later edits: backward puts things back where they were, forward again.
  const editedSource = [...source.after, { id: "later", text: "written after" }];
  const back = source.backward(editedSource);
  assert.deepEqual(
    back.map((node) => node.id),
    ["x", "y", "z", "later"],
    "back at their old positions, the later item kept",
  );
  assert.equal(back[2].text, "stays, cites [[M|x]]");
  assert.deepEqual(
    source.forward(back).map((node) => node.id),
    ["z", "later"],
  );
  assert.deepEqual(
    target.backward(target.after).map((node) => node.id),
    ["x", "t2"],
  );
  assert.equal(target.backward(target.after)[1].text, "cites [[M|s/x]] and [[S|s/y]]");
  assert.equal(other.backward(other.after)[0].text, "[[M|s/x]] [[K|s/k]] [[Z|s/z]]");
  assert.equal(lib.planItemMove(start, "s", ["nope"], "t"), null);
  assert.equal(lib.planItemMove(start, "s", ["x"], "s"), null);
});

test("transfer: appending to a closed document never duplicates an id; a repeat can be repaired", () => {
  const list = [{ id: "B", title: "B", nodes: [{ id: "x", text: "already" }] }];
  const appended = lib.appendToDocument(
    list,
    "B",
    [{ id: "x", text: "moved", children: [{ id: "c", text: "see [[M|x]]" }] }],
    () => "x2",
  );
  assert.deepEqual(
    appended[0].nodes.map((node) => node.id),
    ["x", "x2"],
  );
  assert.equal(
    appended[0].nodes[1].children[0].text,
    "see [[M|x2]]",
    "a link inside follows the fresh id",
  );
  const repaired = lib.repairDuplicateIds(
    [
      { id: "d", text: "a" },
      { id: "d", text: "b", children: [{ id: "d", text: "c" }] },
    ],
    (() => {
      let n = 0;
      return () => `r${++n}`;
    })(),
  );
  assert.deepEqual(lib.idsIn(repaired).size, 3);
  assert.deepEqual(
    repaired.map((node) => node.text),
    ["a", "b"],
  );
  assert.equal(lib.repairDuplicateIds([{ id: "a", text: "" }]), null, "nothing to repair");
  const capture = lib.planAppend(list, "B", [{ id: "x", text: "captured" }], () => "x9");
  assert.deepEqual(capture.roots, ["x9"]);
  assert.deepEqual(
    capture.changes[0].backward(capture.changes[0].after).map((node) => node.id),
    ["x"],
  );
});

test("transfer: undo and redo move the current subtree, including edited notes and new children", () => {
  const initial = [
    {
      id: "a",
      title: "A",
      nodes: [
        {
          id: "parent",
          text: "Parent",
          children: [{ id: "x", text: "Before", children: [{ id: "gone", text: "Remove me" }] }],
        },
      ],
    },
    { id: "b", title: "B", nodes: [{ id: "x", text: "Existing id" }] },
  ];
  const transfer = lib.planItemMove(initial, "a", ["x"], "b", () => "moved");
  let current = initial.map((doc) => ({
    ...doc,
    nodes: transfer.changes.find((change) => change.documentId === doc.id)?.after ?? doc.nodes,
  }));
  current = current.map((doc) =>
    doc.id !== "b"
      ? doc
      : {
          ...doc,
          nodes: doc.nodes.map((node) =>
            node.id !== "moved"
              ? node
              : {
                  ...node,
                  text: "Edited in target",
                  data: { note: "New note [[Stay|a/parent]]" },
                  children: [{ id: "new-child", text: "New child" }],
                },
          ),
        },
  );
  current.push({
    id: "later",
    title: "Later",
    nodes: [{ id: "ref", text: "[[New|b/new-child]]" }],
  });
  const backward = transfer.travel(current, "undo");
  assert.ok(backward);
  current = current.map((doc) => ({
    ...doc,
    nodes: backward.find((change) => change.documentId === doc.id)?.after ?? doc.nodes,
  }));
  const returned = current[0].nodes[0].children[0];
  assert.equal(returned.id, "x");
  assert.equal(returned.text, "Edited in target");
  assert.equal(returned.data.note, "New note [[Stay|parent]]");
  assert.deepEqual(returned.children, [{ id: "new-child", text: "New child" }]);
  assert.equal(current[2].nodes[0].text, "[[New|a/new-child]]");
  const forward = transfer.travel(current, "redo");
  assert.ok(forward);
  const moved = forward.find((change) => change.documentId === "b").after.at(-1);
  assert.equal(moved.id, "moved");
  assert.equal(moved.text, "Edited in target");
  assert.equal(moved.children[0].id, "new-child");
  assert.equal(
    transfer.travel(
      current.filter((doc) => doc.id !== "b"),
      "redo",
    ),
    null,
    "missing destination refuses the entire replay",
  );
  const collision = current.map((doc) =>
    doc.id === "b" ? { ...doc, nodes: [...doc.nodes, { id: "moved", text: "Unrelated" }] } : doc,
  );
  assert.equal(
    transfer.travel(collision, "redo"),
    null,
    "a new collision refuses without renaming or overwriting data",
  );
});

/* ───────────── Finder ───────────── */

test("finder: fuzzy in-order letters, word starts first, folders too; empty query = recent first", () => {
  assert.ok(lib.fuzzyMatch("lp", "Launch plan"));
  assert.equal(lib.fuzzyMatch("pl", "Alpha"), null, "order matters (no p…l in Alpha)");
  assert.ok(
    lib.fuzzyMatch("lp", "Launch plan").score > lib.fuzzyMatch("lp", "Ladle cup").score,
    "word starts beat mid-word letters",
  );
  const l = layout();
  const found = lib.findInLibrary(docs(), l, "gm", []);
  assert.equal(found[0].id, "c", "Gamma");
  assert.deepEqual(found[0].path, ["Projects", "Archive"]);
  assert.deepEqual(found[0].marks, [0, 2]);
  assert.deepEqual(
    lib
      .findInLibrary(docs(), l, "proj", [])
      .map((e) => `${e.kind}:${e.id}`)
      .slice(0, 1),
    ["folder:f1"],
  );
  const recent = lib.findInLibrary(docs(), l, "", ["d", "b"]);
  assert.deepEqual(
    recent
      .filter((e) => e.kind === "document")
      .map((e) => e.id)
      .slice(0, 2),
    ["d", "b"],
    "most recently opened first",
  );
  assert.ok(
    recent.findIndex((e) => e.kind === "folder") >
      recent.findLastIndex((e) => e.kind === "document"),
    "folders after documents",
  );
  assert.deepEqual(
    lib
      .findInLibrary(docs(), l, "a", ["d"])
      .slice(0, 1)
      .map((e) => e.id),
    ["a"],
    "a title starting with the letter outranks recency",
  );
});

/* ───────────── Tags ───────────── */

test("tags: inventory per item with counts and documents; co-occurring tags narrow", () => {
  const all = tags.tagInventory(docs());
  const by = Object.fromEntries(all.tags.map((t) => [t.key, [t.count, t.documents]]));
  assert.deepEqual(by["#launch"], [3, 2]);
  assert.deepEqual(by["#safety"], [2, 2]);
  assert.deepEqual(by["@marco"], [2, 2], "a mention in a note counts");
  assert.equal(all.tags[0].key, "#launch", "most used first");
  const one = tags.tagInventory(docs().filter((d) => d.id === "a"));
  assert.deepEqual(
    one.tags.map((t) => t.key),
    ["#launch", "@marco", "#safety"],
    "ties read alphabetically (marco, safety)",
  );
  assert.deepEqual(
    tags.coOccurring(all, ["#launch"]).map((t) => `${t.key}:${t.count}`),
    ["@marco:1", "#safety:1"],
  );
  assert.deepEqual(tags.coOccurring(all, ["#launch", "#safety"]), [], "a2 has no third tag");
  assert.deepEqual(tags.tagsInQuery("is:todo #Launch -#x @marco"), ["#launch", "@marco"]);
  assert.equal(tags.toggleTagInQuery("#launch", "#safety"), "#launch #safety");
  assert.equal(tags.toggleTagInQuery("#launch #safety", "#launch"), "#safety");
});

/* ───────────── Flat-result sort and created/edited sort ───────────── */

test("result sort: by date (undated last), title (natural, case-blind), document; ties keep outline order", () => {
  const r = (id, text, order, document) => ({ node: { id, text }, order, document });
  const list = [
    r("1", "zeta !(2026-11-09)", 0, "B"),
    r("2", "Alpha", 1, "A"),
    r("3", "beta !(2026-11-02)", 2, "B"),
    r("4", "item 10", 3, "A"),
    r("5", "item 9", 4, "A"),
  ];
  assert.deepEqual(
    sort.sortResults(list, "date").map((x) => x.node.id),
    ["3", "1", "2", "4", "5"],
  );
  assert.deepEqual(
    sort.sortResults(list, "title").map((x) => x.node.id),
    ["2", "3", "5", "4", "1"],
    "item 9 before item 10",
  );
  assert.deepEqual(
    sort.sortResults(list, "document").map((x) => x.node.id),
    ["2", "4", "5", "1", "3"],
  );
  assert.equal(sort.sortResults(list, "outline"), list);
});

test("flat results follow view.resultSort; created/edited sorts reorder children", async () => {
  const view = await mountHook({
    defaultValue: [
      {
        id: "p",
        text: "Parent",
        children: [
          { id: "x", text: "Old", checked: false, data: { createdAt: 1, editedAt: 30 } },
          { id: "y", text: "New", checked: false, data: { createdAt: 3, editedAt: 10 } },
          { id: "z", text: "Mid", checked: false, data: { createdAt: 2, editedAt: 20 } },
        ],
      },
    ],
  });
  await view.act(() =>
    view.record.ol.setView((v) => ({
      ...v,
      query: "is:todo",
      searchMode: "flat",
      resultSort: "title",
    })),
  );
  assert.deepEqual(
    view.record.ol.rows.map((r) => r.id),
    ["z", "y", "x"],
    "Mid, New, Old",
  );
  await view.act(() => view.record.ol.setView((v) => ({ ...v, resultSort: "outline" })));
  assert.deepEqual(
    view.record.ol.rows.map((r) => r.id),
    ["x", "y", "z"],
    "outline order again",
  );
  await view.act(() => view.record.ol.setView((v) => ({ ...v, query: "", searchMode: "filter" })));
  await view.act(() => view.record.ol.commands.sortChildren("p", "created", "descending"));
  assert.deepEqual(
    view.record.ol.state.nodes[0].children.map((n) => n.id),
    ["y", "z", "x"],
    "newest first",
  );
  await view.act(() => view.record.ol.commands.sortChildren("p", "edited", "descending"));
  assert.deepEqual(
    view.record.ol.state.nodes[0].children.map((n) => n.id),
    ["x", "z", "y"],
    "most recently edited first",
  );
  await view.unmount();
});

/* ───────────── Import loss report ───────────── */

test("import report: OPML attributes, colours and head metadata that were dropped, with counts", async () => {
  const { JSDOM } = await import("jsdom");
  const parse = (source, type) =>
    new new JSDOM("").window.DOMParser().parseFromString(source, type);
  const opml = `<?xml version="1.0"?><opml version="2.0"><head><title>T</title><expansionState>1,2</expansionState><ownerName>Sam</ownerName></head><body>
    <outline text="A" _status="open" _owner="sam" colorLabel="teal"><outline text="B" _status="done" _note="kept"/></outline>
    <outline text="Link" type="link" url="https://example.com"/></body></opml>`;
  const r = report.analyzeImport(opml, [], { parse, items: 3 });
  assert.equal(r.format, "opml");
  const by = Object.fromEntries(r.losses.map((l) => [l.key, l.count]));
  assert.equal(by["opml-attribute:_status"], 2);
  assert.equal(by["opml-attribute:_owner"], 1);
  assert.equal(by["opml-attribute:url"], 1);
  assert.equal(by["opml-color"], 1, "teal is not an outline colour");
  assert.equal(by["opml-head"], 2, "expansionState and ownerName");
  assert.equal(by["opml-attribute:_note"], undefined, "kept attributes are not losses");
  assert.equal(report.summarizeReport(r), "Imported 3 items · 7 things didn't survive");
});

test("import report: HTML media, embeds, scripts, tables and unsafe links; a clean import reports nothing", async () => {
  const { JSDOM } = await import("jsdom");
  const parse = (source, type) =>
    new new JSDOM("").window.DOMParser().parseFromString(source, type);
  const html = `<ul><li>One <img src="a.png"><picture><img src="b.png"></picture></li><li><iframe src="x"></iframe><video></video></li></ul>
    <script>alert(1)</script><style>p{}</style><table><tr><td>1</td></tr></table><a href="javascript:alert(1)">bad</a><a href="https://ok">ok</a><input type="checkbox"><input type="text">`;
  const r = report.analyzeImport(html, [], { parse, format: "html", items: 2 });
  const by = Object.fromEntries(r.losses.map((l) => [l.key, l.count]));
  assert.deepEqual(by, {
    "html-images": 2,
    "html-embeds": 2,
    "html-scripts": 2,
    "html-tables": 1,
    "html-unsafe-links": 1,
    "html-forms": 1,
  });
  assert.equal(
    report.analyzeImport("<ul><li>Fine</li></ul>", [], { parse, format: "html" }).losses.length,
    0,
  );
});

test("import report: Markdown judged from what the importer made (top-level tables, fences, images, HTML)", async () => {
  const interchange = await load("/src/registry/outliner/interchange.ts");
  const md = [
    "---",
    "title: x",
    "---",
    "- Item",
    "  note line under a bullet survives",
    "| a | b |",
    "|---|---|",
    "```",
    "code",
    "```",
    "![chart](https://x/c.png)",
    "<div>raw</div>",
  ].join("\n");
  const nodes = interchange.importOutline(
    md,
    (() => {
      let i = 0;
      return () => `n${i++}`;
    })(),
  );
  const r = report.analyzeImport(md, nodes, { format: "markdown" });
  const by = Object.fromEntries(r.losses.map((l) => [l.key, l.count]));
  assert.deepEqual(by, {
    "md-front-matter": 2,
    "md-tables": 2,
    "md-code": 1,
    "md-images": 1,
    "md-html": 1,
  });
  assert.equal(
    report.analyzeImport("- a\n- b", interchange.importOutline("- a\n- b"), { format: "markdown" })
      .losses.length,
    0,
  );
  assert.equal(report.detectImportFormat('{"nodes":[]}'), "json");
});

/* ───────────── The real workspace (jsdom) ───────────── */

test("workspace UI: folders render; a new folder starts renaming; filing via the menu; delete keeps documents", async () => {
  const changes = [];
  const layouts = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    onDocumentsChange: (d) => changes.push(d),
    onLayoutChange: (l) => layouts.push(l),
  });
  const labels = () =>
    [...ui.container.querySelectorAll("[data-lib-row]")].map(
      (r) => `${r.dataset.libKind[0]}:${r.dataset.libId}`,
    );
  assert.deepEqual(labels(), ["f:f1", "f:f2", "d:c", "d:b", "d:d", "f:f3", "d:a"]);
  assert.ok(ui.container.querySelector('[data-starred-doc="c"]'), "Gamma is in the Starred group");
  await ui.act(() => ui.container.querySelector('button[aria-label="New folder"]').click());
  const input = ui.container.querySelector('input[aria-label="Folder name"]');
  assert.ok(input, "a new folder starts with its name being typed");
  await ui.type(input, "Ideas");
  await ui.act(() =>
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(layouts.at(-1).folders.at(-1).title, "Ideas");
  const ideas = layouts.at(-1).folders.at(-1).id;
  // Collapse Projects from the keyboard (← on an open folder).
  const projects = ui.container.querySelector('[data-folder-open="f1"]');
  await ui.act(() =>
    projects.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }),
    ),
  );
  assert.equal(projects.getAttribute("aria-expanded"), "false");
  await ui.until(() => labels().length === 4);
  assert.deepEqual(
    labels(),
    ["f:f1", "f:f3", `f:${ideas}`, "d:a"],
    "Projects folded: its contents are hidden",
  );
  // Delete the Projects folder: Beta and Delta move up, Archive too; nothing is lost.
  await ui.act(() =>
    projects.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Backspace",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.equal(
    layouts.at(-1).folders.some((f) => f.id === "f1"),
    false,
  );
  assert.equal(changes.at(-1).length, 4, "every document is still there");
  assert.deepEqual(
    changes
      .at(-1)
      .filter((d) => !d.folderId)
      .map((d) => d.id)
      .sort(),
    ["a", "b", "d"],
  );
  await ui.unmount();
});

test("workspace UI: the open document's folder opens; ⌘O finds and opens a document", async () => {
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    defaultActiveId: "c",
  });
  assert.ok(
    ui.container.querySelector('[data-doc-open="c"]'),
    "Gamma's folders (Projects › Archive) are open",
  );
  await ui.act(() =>
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "o",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const field = document.querySelector('input[aria-label="Find document"]');
  assert.ok(field, "the finder opened");
  await ui.type(field, "dlt");
  const entries = [...document.querySelectorAll("[data-finder-entry]")].map(
    (e) => e.dataset.finderEntry,
  );
  assert.deepEqual(entries, ["d"], "Delta");
  await ui.act(() => document.querySelector('[data-finder-entry="d"]').click());
  await ui.until(() => ui.pane("d") && !ui.pane("d").hasAttribute("inert"));
  assert.equal(ui.pane("d").hasAttribute("inert"), false, "Delta is open");
  await ui.unmount();
});

test("workspace UI: quick capture files into the inbox (made on first use), Undo takes it back", async () => {
  const changes = [];
  const layouts = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    onDocumentsChange: (d) => changes.push(d),
    onLayoutChange: (l) => layouts.push(l),
  });
  const id = await ui.call(() => ui.handle.current.capture("First thought #idea"));
  assert.ok(id);
  const inboxId = layouts.at(-1).inboxId;
  const inbox = changes.at(-1).find((d) => d.id === inboxId);
  assert.equal(inbox.title, "Inbox", "an Inbox was made and designated");
  assert.deepEqual(
    inbox.nodes.map((n) => n.text),
    ["First thought #idea"],
  );
  assert.equal(typeof inbox.nodes[0].data.createdAt, "number");
  // Into an existing, OPEN inbox (through its outliner, so it is one undo step there).
  await ui.act(() => ui.docButton(inboxId).click());
  await ui.call(() => ui.handle.current.capture("Second"));
  await ui.frames();
  assert.deepEqual(
    changes
      .at(-1)
      .find((d) => d.id === inboxId)
      .nodes.map((n) => n.text),
    ["First thought #idea", "Second"],
  );
  // The capture dialog: ⌘⇧Space, type, Enter.
  await ui.act(() =>
    window.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: " ",
        code: "Space",
        metaKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  const field = document.querySelector('textarea[aria-label="What\'s on your mind"]');
  assert.ok(field, "the capture field opened");
  await ui.type(field, "Third", window.HTMLTextAreaElement);
  await ui.act(() =>
    field.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    ),
  );
  await ui.frames();
  assert.deepEqual(
    changes
      .at(-1)
      .find((d) => d.id === inboxId)
      .nodes.map((n) => n.text),
    ["First thought #idea", "Second", "Third"],
  );
  await ui.unmount();
});

/** Drag a row by its grip onto a document in the sidebar (real pointer events; layout faked). */
async function dragToDocument(ui, sourceId, itemId, targetId) {
  const pane = ui.pane(sourceId);
  const grip = pane.querySelector(`[data-row="${itemId}"] [data-drag-handle]`);
  const target = ui.container.querySelector(`[data-doc-open="${targetId}"]`);
  assert.ok(grip && target, "grip and target exist");
  const rect = (x, y) => () => ({
    x,
    y,
    left: x,
    top: y,
    right: x + 10,
    bottom: y + 10,
    width: 10,
    height: 10,
  });
  grip.getBoundingClientRect = rect(500, 100);
  target.getBoundingClientRect = rect(50, 300);
  document.elementFromPoint = (x, y) => (y >= 300 ? target : pane);
  const pointer = (type, x, y) =>
    new window.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      button: 0,
    });
  await ui.act(() => grip.dispatchEvent(pointer("pointerdown", 500, 100)));
  await ui.act(() => window.dispatchEvent(pointer("pointermove", 480, 120)));
  await ui.act(() => window.dispatchEvent(pointer("pointermove", 55, 305)));
  const lit = target.hasAttribute("data-drop-over");
  await ui.act(() => window.dispatchEvent(pointer("pointerup", 55, 305)));
  await ui.frames();
  return { lit, target };
}
const idsOf = (list, docId) => list.find((d) => d.id === docId).nodes.map((n) => n.id);
const allIdsOf = (nodes) => nodes.flatMap((n) => [n.id, ...allIdsOf(n.children ?? [])]);

test("workspace UI: an item dragged onto another document moves there as one step: ⌘Z in either document undoes both, ⌘⇧Z redoes", async () => {
  const changes = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    onDocumentsChange: (d) => changes.push(d),
  });
  const { lit, target } = await dragToDocument(ui, "a", "a1", "b");
  assert.ok(lit, "the document lights up under the pointer");
  assert.equal(target.hasAttribute("data-drop-over"), false);
  let latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), [], "gone from Alpha (with its child)");
  assert.deepEqual(idsOf(latest, "b"), ["b1", "a1"], "appended to Beta, ids kept");
  assert.equal(latest.find((d) => d.id === "b").nodes[1].children[0].id, "a2");
  // ⌘Z in Alpha (the source): both documents go back.
  await ui.press("a", "z");
  latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), ["a1"], "back in Alpha");
  assert.deepEqual(idsOf(latest, "b"), ["b1"], "and out of Beta, in the same step");
  // ⌘⇧Z in Alpha: the move again, in both.
  await ui.press("a", "z", { shiftKey: true });
  latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), []);
  assert.deepEqual(idsOf(latest, "b"), ["b1", "a1"]);
  // ⌘Z in Beta (the target, opened since): both go back again.
  await ui.act(() => ui.docButton("b").click());
  await ui.until(() => !ui.pane("b").hasAttribute("inert"));
  await ui.press("b", "z");
  latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), ["a1"]);
  assert.deepEqual(idsOf(latest, "b"), ["b1"]);
  assert.deepEqual(
    allIdsOf(latest.find((d) => d.id === "a").nodes),
    ["a1", "a2"],
    "restored exactly, child included",
  );
  // And redo from the target side.
  await ui.press("b", "z", { shiftKey: true });
  assert.deepEqual(idsOf(changes.at(-1), "b"), ["b1", "a1"]);
  assert.deepEqual(idsOf(changes.at(-1), "a"), []);
  await ui.unmount();
});

test("workspace UI: after “Move to document…” the source outline keeps the focus, so ⌘Z right away undoes the move", async () => {
  // The whole keyboard path, end to end. In a browser the picker's close animation returns focus
  // after the moved row (its ⋯ trigger) is gone, which used to strand focus on <body>; jsdom has
  // no animation, so that timing is checked in the browser, not here.
  const changes = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    onDocumentsChange: (d) => changes.push(d),
  });
  const actions = ui.pane("a").querySelector('[data-row="a1"] button[aria-label^="Actions for"]');
  assert.ok(actions, "the row's ⋯ button");
  const pointer = (type) =>
    new window.PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerType: "mouse",
    });
  await ui.act(() => {
    actions.dispatchEvent(pointer("pointerdown"));
    actions.dispatchEvent(
      new window.MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }),
    );
    actions.dispatchEvent(pointer("pointerup"));
    actions.dispatchEvent(
      new window.MouseEvent("mouseup", { bubbles: true, cancelable: true, button: 0 }),
    );
    actions.click();
  });
  await ui.until(() =>
    [...document.querySelectorAll("[role=menuitem]")].some((el) =>
      /Move to document/.test(el.textContent),
    ),
  );
  const entry = [...document.querySelectorAll("[role=menuitem]")].find((el) =>
    /Move to document/.test(el.textContent),
  );
  await ui.act(() => entry.click());
  await ui.until(() => document.querySelector('[data-finder-entry="b"]'));
  assert.match(
    document.querySelector("[cmdk-root]")?.closest("[role=dialog]")?.textContent ?? "",
    /move/i,
    "Enter is labelled as a move",
  );
  await ui.act(() => document.querySelector('[data-finder-entry="b"]').click());
  await ui.until(() => idsOf(changes.at(-1) ?? docs(), "b").includes("a1"));
  await ui.frames();
  assert.deepEqual(idsOf(changes.at(-1), "a"), [], "moved out of Alpha");
  assert.ok(
    ui.pane("a").contains(document.activeElement),
    `focus stays in Alpha (was ${document.activeElement?.tagName})`,
  );
  // A real ⌘Z where the focus is: the move goes back in both documents.
  await ui.act(() =>
    document.activeElement.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "z",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  assert.deepEqual(idsOf(changes.at(-1), "a"), ["a1"]);
  assert.deepEqual(idsOf(changes.at(-1), "b"), ["b1"]);
  await ui.unmount();
});

test("workspace UI: move → undo → move again never duplicates an id; the target still opens", async () => {
  const changes = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    defaultLayout: layout(),
    onDocumentsChange: (d) => changes.push(d),
  });
  await dragToDocument(ui, "a", "a1", "b");
  await ui.press("a", "z");
  await dragToDocument(ui, "a", "a1", "b");
  const beta = changes.at(-1).find((d) => d.id === "b");
  const ids = allIdsOf(beta.nodes);
  assert.equal(new Set(ids).size, ids.length, `no repeated id in Beta (${ids.join(",")})`);
  assert.deepEqual(idsOf(changes.at(-1), "b"), ["b1", "a1"]);
  await ui.act(() => ui.docButton("b").click());
  await ui.until(() => !ui.pane("b").hasAttribute("inert"));
  assert.equal(ui.container.querySelector("[data-document-error]"), null, "Beta opens");
  assert.ok(ui.pane("b").querySelector('[data-row="a1"]'));
  await ui.unmount();
});

test("workspace UI: a move re-points every link to the moved item, in every document; undo puts them back", async () => {
  const changes = [];
  const start = [
    {
      id: "a",
      title: "Alpha",
      nodes: [
        { id: "a1", text: "Red-team review" },
        { id: "a3", text: "cite [[Review|a1]]" },
      ],
    },
    { id: "b", title: "Beta", nodes: [{ id: "b1", text: "window — [[Review|a/a1]]" }] },
    {
      id: "c",
      title: "Gamma",
      nodes: [{ id: "c1", text: "see [[Review|a/a1]]", data: { note: "also [[R|a/a1]]" } }],
    },
  ];
  const ui = await mountWorkspace({
    defaultDocuments: start,
    onDocumentsChange: (d) => changes.push(d),
  });
  await dragToDocument(ui, "a", "a1", "b");
  const text = (list, docId, id) => {
    const find = (nodes) =>
      nodes.find((n) => n.id === id) ?? nodes.map((n) => find(n.children ?? [])).find(Boolean);
    return find(list.find((d) => d.id === docId).nodes);
  };
  let latest = changes.at(-1);
  assert.equal(
    text(latest, "a", "a3").text,
    "cite [[Review|b/a1]]",
    "the source's own link now crosses documents",
  );
  assert.equal(
    text(latest, "b", "b1").text,
    "window — [[Review|a1]]",
    "the target's link is now local",
  );
  assert.equal(
    text(latest, "c", "c1").text,
    "see [[Review|b/a1]]",
    "a third document's link follows",
  );
  assert.equal(text(latest, "c", "c1").data.note, "also [[R|b/a1]]", "links in notes too");
  await ui.press("a", "z");
  latest = changes.at(-1);
  assert.equal(text(latest, "a", "a3").text, "cite [[Review|a1]]");
  assert.equal(text(latest, "b", "b1").text, "window — [[Review|a/a1]]");
  assert.equal(
    text(latest, "c", "c1").text,
    "see [[Review|a/a1]]",
    "restored in the closed document as well",
  );
  await ui.unmount();
});

test("workspace UI: the move toast's Undo never undoes a later, unrelated edit", async () => {
  const changes = [];
  const ui = await mountWorkspace(
    {
      defaultDocuments: docs(),
      defaultLayout: layout(),
      onDocumentsChange: (d) => changes.push(d),
    },
    { toaster: true },
  );
  await dragToDocument(ui, "a", "a1", "b");
  await ui.until(() => ui.toastButton("Moved", "Undo"));
  assert.ok(ui.toastButton("Moved", "Undo"), "the toast offers Undo");
  // An unrelated edit in the source after the move.
  await ui.call(() =>
    ui.handle.current.active().insertItems([{ id: "later", text: "Typed after the move" }]),
  );
  await ui.frames();
  const undo = ui.toastButton("Moved", "Undo");
  if (undo) await ui.act(() => undo.click());
  await ui.frames();
  let latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), ["later"], "the later edit stands");
  assert.deepEqual(
    idsOf(latest, "b"),
    ["b1", "a1"],
    "and the moved item is still in exactly one place",
  );
  // ⌘Z twice in the source: the later edit, then the move (both documents).
  await ui.press("a", "z");
  await ui.press("a", "z");
  latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), ["a1"]);
  assert.deepEqual(idsOf(latest, "b"), ["b1"]);
  // Fresh move: the toast's Undo restores both while nothing happened since.
  await dragToDocument(ui, "a", "a1", "c");
  await ui.until(() => ui.toastButton("Moved", "Undo"));
  await ui.act(() => ui.toastButton("Moved", "Undo").click());
  await ui.frames();
  latest = changes.at(-1);
  assert.deepEqual(idsOf(latest, "a"), ["a1"]);
  assert.deepEqual(idsOf(latest, "c"), ["c1"]);
  await ui.unmount();
});

test("workspace UI: capture Undo removes the captured item (no extra step); deleting the Inbox clears the pointer", async () => {
  const changes = [];
  const layouts = [];
  const start = [...docs(), { id: "in", title: "Inbox", nodes: [{ id: "i1", text: "Earlier" }] }];
  const ui = await mountWorkspace(
    {
      defaultDocuments: start,
      defaultLayout: { ...layout(), inboxId: "in" },
      defaultActiveId: "in",
      onDocumentsChange: (d) => changes.push(d),
      onLayoutChange: (l) => layouts.push(l),
    },
    { toaster: true },
  );
  const id = await ui.call(() => ui.handle.current.capture("New thought"));
  await ui.frames();
  assert.deepEqual(idsOf(changes.at(-1), "in"), ["i1", id]);
  await ui.until(() => ui.toastButton("Captured", "Undo"));
  await ui.act(() => ui.toastButton("Captured", "Undo").click());
  await ui.frames();
  assert.deepEqual(idsOf(changes.at(-1), "in"), ["i1"], "the capture is gone");
  assert.equal(
    ui.handle.current.active().history().undo,
    undefined,
    "undone, not deleted: nothing left to undo",
  );
  await ui.press("in", "z");
  assert.deepEqual(idsOf(changes.at(-1), "in"), ["i1"], "⌘Z does not bring it back");
  await ui.press("in", "z", { shiftKey: true });
  assert.deepEqual(idsOf(changes.at(-1), "in"), ["i1", id], "⌘⇧Z redoes the capture");
  // Delete the Inbox document: the layout forgets it, so the next capture makes a fresh one.
  await ui.act(() =>
    ui.docButton("in").dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key: "Backspace",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await ui.frames();
  assert.equal(
    changes.at(-1).some((d) => d.id === "in"),
    false,
    "the Inbox is deleted",
  );
  assert.equal(layouts.at(-1).inboxId, null, "and no longer the inbox");
  await ui.until(() => ui.toastButton("Deleted", "Undo"));
  await ui.act(() => ui.toastButton("Deleted", "Undo").click());
  await ui.frames();
  assert.ok(changes.at(-1).some((d) => d.id === "in"));
  assert.equal(layouts.at(-1).inboxId, "in", "Undo gives the inbox back");
  await ui.unmount();
});

test("workspace UI: a document that cannot open shows a contained error; Repair fixes its ids and opens it", async () => {
  const changes = [];
  const broken = {
    id: "x",
    title: "Broken",
    nodes: [
      { id: "d", text: "One" },
      { id: "d", text: "Two" },
    ],
  };
  // React reports the caught render error on the console; expected here.
  const quiet = console.error;
  console.error = (...args) =>
    args.some((arg) => /Duplicate outline id|DocumentBoundary/.test(String(arg?.message ?? arg)))
      ? undefined
      : quiet(...args);
  after(() => (console.error = quiet));
  const ui = await mountWorkspace({
    defaultDocuments: [...docs(), broken],
    defaultActiveId: "x",
    onDocumentsChange: (d) => changes.push(d),
  });
  const error = ui.container.querySelector("[data-document-error]");
  assert.ok(error, "a contained notice");
  assert.match(error.textContent, /Broken can't be shown/);
  assert.match(error.textContent, /Duplicate outline id/);
  assert.ok(ui.docButton("a"), "the sidebar still works");
  await ui.act(() => ui.docButton("a").click());
  await ui.until(() => !ui.pane("a").hasAttribute("inert"));
  assert.ok(ui.pane("a").querySelector('[data-row="a1"]'), "other documents open as usual");
  await ui.act(() => ui.docButton("x").click());
  await ui.until(() => !ui.pane("x").hasAttribute("inert"));
  const repair = [...ui.pane("x").querySelectorAll("button")].find(
    (b) => b.textContent === "Repair document",
  );
  await ui.act(() => repair.click());
  await ui.frames();
  const fixed = changes.at(-1).find((d) => d.id === "x").nodes;
  assert.equal(new Set(fixed.map((n) => n.id)).size, 2, "the repeat got a fresh id");
  assert.deepEqual(
    fixed.map((n) => n.text),
    ["One", "Two"],
    "nothing else changed",
  );
  assert.equal(ui.container.querySelector("[data-document-error]"), null, "and the document shows");
  assert.equal(ui.pane("x").querySelectorAll("[data-row]").length, 2);
  await ui.unmount();
});

test("workspace UI: the Tags tab lists counts, filters on click (scope all), and narrows by a co-occurring tag", async () => {
  const ui = await mountWorkspace({ defaultDocuments: docs(), defaultLayout: layout() });
  await ui.act(() => ui.container.querySelector('[data-library-tab="tags"]').click());
  await ui.until(() => ui.container.querySelector("[data-tag-row]"));
  const rows = () =>
    [...ui.container.querySelectorAll("[data-tag-row]")].map((r) =>
      r.textContent.replace(/\s+/g, " ").trim(),
    );
  assert.deepEqual(rows(), ["launch2", "safety1", "marco1"], "this document: Alpha");
  await ui.act(() => ui.container.querySelector('[data-tag-scope="all"]').click());
  assert.deepEqual(
    rows().slice(0, 2),
    ["launch2 docs3", "safety2 docs2"],
    "all documents: how many documents each tag spans, then its count",
  );
  await ui.act(() => ui.container.querySelector('[data-tag-row="#launch"]').click());
  await ui.frames();
  assert.equal(
    ui.pane("a").querySelector('input[aria-label="Search outline"]').value,
    "#launch",
    "the search runs the tag",
  );
  assert.ok(
    ui.pane("a").querySelectorAll("[data-scope-result]").length >= 3,
    "across all documents",
  );
  const narrow = [...ui.container.querySelectorAll("[data-tag-pane] section")][0];
  assert.match(narrow.textContent, /With #launch/);
  await ui.act(() =>
    [...narrow.querySelectorAll("button")].find((b) => b.textContent.includes("safety")).click(),
  );
  assert.equal(
    ui.pane("a").querySelector('input[aria-label="Search outline"]').value,
    "#launch #safety",
  );
  await ui.unmount();
});

test("workspace UI: moved edits survive undo, redo and stale local history without duplicate copies", async () => {
  const events = [];
  const legacy = [];
  const ui = await mountWorkspace({
    defaultDocuments: docs(),
    onDocumentsChange: (value) => legacy.push(value),
    onWorkspaceChange: (value) => events.push(value),
  });
  await dragToDocument(ui, "a", "a1", "b");
  assert.equal(events.length, 1, "one atomic event for both documents");
  assert.equal(legacy.length, 1, "legacy notification also observes the final transaction only");
  await ui.call(() => ui.handle.current.open("b"));
  await ui.until(() =>
    ui.handle.current
      .active()
      ?.getValue()
      .some((node) => node.id === "a1"),
  );
  const edited = ui.handle.current
    .active()
    .getValue()
    .map((node) =>
      node.id === "a1"
        ? {
            ...node,
            text: "Edited after move",
            data: { note: "Keep my note" },
            children: [{ id: "fresh", text: "Keep child" }],
          }
        : node,
    );
  await ui.call(() => ui.handle.current.active().replace(edited));
  await ui.call(() => ui.handle.current.open("a"));
  const beforeUndo = events.length;
  await ui.press("a", "z");
  assert.equal(events.length, beforeUndo + 1, "undo publishes one complete workspace");
  let current = ui.handle.current.getWorkspace();
  assert.equal(current.documents.find((doc) => doc.id === "a").nodes[0].text, "Edited after move");
  assert.equal(current.documents.find((doc) => doc.id === "a").nodes[0].data.note, "Keep my note");
  assert.deepEqual(
    current.documents.find((doc) => doc.id === "a").nodes[0].children.map((node) => node.id),
    ["fresh"],
  );
  assert.deepEqual(idsOf(current.documents, "b"), ["b1"]);
  await ui.press("a", "z", { shiftKey: true });
  current = ui.handle.current.getWorkspace();
  assert.equal(
    current.documents.find((doc) => doc.id === "b").nodes.at(-1).text,
    "Edited after move",
  );
  assert.deepEqual(idsOf(current.documents, "a"), []);
  await ui.call(() => ui.handle.current.open("b"));
  await ui.press("b", "z");
  current = ui.handle.current.getWorkspace();
  assert.equal(
    current.documents.flatMap((doc) => allIdsOf(doc.nodes)).filter((id) => id === "a1").length,
    1,
    "older target history never duplicates the moved item",
  );
  await ui.call(() => ui.handle.current.open("a"));
  await ui.press("a", "z");
  current = ui.handle.current.getWorkspace();
  assert.deepEqual(idsOf(current.documents, "a"), ["a1"]);
  assert.deepEqual(idsOf(current.documents, "b"), ["b1"]);
  await ui.unmount();
});

test("workspace UI: a locked participant refuses an entire move or history travel", async () => {
  let locked = true;
  const initial = [
    ...docs(),
    { id: "e", title: "Reference", nodes: [{ id: "ref", text: "[[Plan|a/a1]]" }] },
  ];
  const events = [];
  const ui = await mountWorkspace({
    defaultDocuments: initial,
    isLocked: (node) => locked && node.id === "ref",
    onWorkspaceChange: (value) => events.push(value),
  });
  await dragToDocument(ui, "a", "a1", "b");
  assert.equal(events.length, 0);
  assert.deepEqual(
    ui.handle.current.getDocuments(),
    initial,
    "a locked reference leaves every document intact",
  );
  locked = false;
  await dragToDocument(ui, "a", "a1", "b");
  assert.equal(events.length, 1);
  const afterMove = ui.handle.current.getDocuments();
  locked = true;
  await ui.press("a", "z");
  assert.equal(events.length, 1, "refused history emits nothing");
  assert.deepEqual(ui.handle.current.getDocuments(), afterMove);
  locked = false;
  await ui.press("a", "z");
  assert.equal(events.length, 2, "the original undo remains available after refusal");
  assert.deepEqual(idsOf(ui.handle.current.getDocuments(), "a"), ["a1"]);
  await ui.unmount();
});

test("workspace UI: combined capture and inbox removal publish complete document/layout pairs", async () => {
  const events = [];
  const calls = [];
  const ui = await mountWorkspace(
    {
      defaultDocuments: docs(),
      defaultLayout: layout(),
      onDocumentsChange: () => calls.push("documents"),
      onLayoutChange: () => calls.push("layout"),
      onWorkspaceChange: (value) => {
        calls.push("workspace");
        events.push(value);
      },
    },
    { toaster: true },
  );
  const captured = await ui.call(() => ui.handle.current.capture("Persist this"));
  assert.equal(events.length, 1);
  assert.deepEqual(calls, ["documents", "layout", "workspace"]);
  const inboxId = events[0].layout.inboxId;
  assert.ok(
    events[0].documents
      .find((doc) => doc.id === inboxId)
      .nodes.some((node) => node.id === captured),
  );
  await ui.until(() => ui.toastButton("Captured", "Undo"));
  await ui.act(() => ui.toastButton("Captured", "Undo").click());
  assert.equal(events.length, 2);
  assert.equal(events[1].layout.inboxId, null);
  assert.ok(!events[1].documents.some((doc) => doc.id === inboxId));
  await ui.unmount();
});

test("workspace UI: controlled pending workspace changes survive renders and publish through the newest listener", async () => {
  const original = docs();
  const first = [];
  const second = [];
  const ui = await mountWorkspace({
    documents: original,
    layout: layout(),
    onWorkspaceChange: (value) => first.push(value),
  });
  const created = await ui.call(() => ui.handle.current.create("Created locally"));
  assert.ok(first.at(-1).documents.some((doc) => doc.id === created));
  const layoutProp = ui.handle.current.getLayout();
  await ui.rerender({
    documents: original,
    layout: layoutProp,
    onWorkspaceChange: (value) => second.push(value),
  });
  assert.ok(
    ui.handle.current.getDocuments().some((doc) => doc.id === created),
    "an unchanged prop is an unanswered proposal",
  );
  await ui.call(() => ui.handle.current.create("Second local document"));
  assert.equal(second.length, 1);
  assert.equal(second[0].documents.length, original.length + 2);
  assert.equal(first.length, 1, "callbacks never use an old render's listener");
  await ui.rerender({
    documents: second[0].documents.map((doc) => ({ ...doc })),
    layout: second[0].layout,
    onWorkspaceChange: (value) => second.push(value),
  });
  assert.equal(second.length, 1, "an echo is not another edit");
  assert.equal(ui.handle.current.getDocuments().length, original.length + 2);
  await ui.unmount();
});

/* ───────────── Harness ───────────── */

let React, act, createRoot;
const media = { "(min-width: 768px)": true };
async function domEnv() {
  if (createRoot) return;
  const { JSDOM } = await import("jsdom");
  const { window } = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "http://localhost/",
  });
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in globalThis || key.startsWith("_")) continue;
    Object.defineProperty(globalThis, key, {
      value: window[key],
      configurable: true,
      writable: true,
    });
  }
  for (const key of [
    "window",
    "document",
    "navigator",
    "HTMLElement",
    "Element",
    "Node",
    "Event",
    "KeyboardEvent",
    "MouseEvent",
    "FocusEvent",
    "CustomEvent",
    "MutationObserver",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "DOMParser",
  ])
    Object.defineProperty(globalThis, key, {
      value: key === "window" ? window : window[key],
      configurable: true,
      writable: true,
    });
  globalThis.ResizeObserver = window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.PointerEvent ??= class extends window.MouseEvent {
    constructor(type, init = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? "mouse";
    }
  };
  globalThis.PointerEvent = window.PointerEvent;
  window.matchMedia = (query) => ({
    matches: !!media[query],
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
  window.HTMLElement.prototype.scrollIntoView = function () {};
  window.Element.prototype.scrollTo ??= function () {};
  window.HTMLElement.prototype.releasePointerCapture ??= () => {};
  window.HTMLElement.prototype.setPointerCapture ??= () => {};
  window.HTMLElement.prototype.hasPointerCapture ??= () => false;
  window.scrollTo = globalThis.scrollTo = () => {};
  globalThis.CSS = {
    escape: (value) => String(value).replace(/["\\]/g, "\\$&"),
    supports: () => false,
  };
  const error = console.error;
  console.error = (...args) =>
    String(args[0]).includes("not wrapped in act") ? undefined : error(...args);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  React = await import("react");
  act = React.act;
  // The live title field's chunk first, so a title is never briefly the plain field.
  await (await load("/src/registry/outliner/live-field/load.ts")).loadLiveField();
  ({ createRoot } = await import("react-dom/client"));
}

async function mountHook(props) {
  await domEnv();
  const record = { ol: null };
  function Probe(p) {
    record.ol = hook.useOutliner(p);
    return null;
  }
  const r = createRoot(window.document.createElement("div"));
  await act(async () => r.render(React.createElement(Probe, props)));
  return {
    record,
    act: (fn) => act(async () => void fn()),
    unmount: () => act(async () => r.unmount()),
  };
}

async function mountWorkspace(props, { toaster = false } = {}) {
  await domEnv();
  const { OutlinerWorkspace } = await load("/src/registry/outliner/outliner-workspace.tsx");
  const { TooltipProvider } = await load("/src/components/ui/tooltip.tsx");
  const { Toaster } = await load("/src/components/ui/sonner.tsx");
  const container = document.createElement("div");
  document.body.appendChild(container);
  const handle = { current: null };
  const r = createRoot(container);
  const render = (p) =>
    act(async () =>
      r.render(
        React.createElement(
          TooltipProvider,
          null,
          React.createElement(OutlinerWorkspace, { ...p, ref: handle }),
          toaster ? React.createElement(Toaster, { duration: 60_000 }) : null,
        ),
      ),
    );
  await render(props);
  const frames = () => act(async () => new Promise((resolve) => setTimeout(resolve, 60)));
  return {
    container,
    handle,
    rerender: render,
    act: (fn) => act(async () => void fn()),
    call: async (fn) => {
      let out;
      await act(async () => {
        out = fn();
      });
      return out;
    },
    frames,
    until: async (check) => {
      for (let i = 0; i < 90 && !check(); i++)
        await act(async () => new Promise((resolve) => setTimeout(resolve, 16)));
    },
    type: (input, value, Proto = window.HTMLInputElement) =>
      act(async () => {
        Object.getOwnPropertyDescriptor(Proto.prototype, "value").set.call(input, value);
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
      }),
    docButton: (id) => container.querySelector(`[data-doc-open="${id}"]`),
    pane: (id) => container.querySelector(`[data-document="${id}"]`),
    /** A real key press on a document's tree (⌘Z, ⌘⇧Z…). */
    press: (documentId, key, init = {}) =>
      act(async () => {
        const tree = container.querySelector(`[data-document="${documentId}"] [role=tree]`);
        tree.dispatchEvent(
          new window.KeyboardEvent("keydown", {
            key,
            metaKey: true,
            bubbles: true,
            cancelable: true,
            ...init,
          }),
        );
      }),
    /** The toast whose text matches, and its buttons by label. */
    toastButton: (text, label) => {
      const shown = [...document.querySelectorAll("[data-sonner-toast]")].find((t) =>
        t.textContent.includes(text),
      );
      return shown
        ? ([...shown.querySelectorAll("button")].find((b) => b.textContent === label) ?? null)
        : null;
    },
    unmount: async () => {
      await act(async () => r.unmount());
      container.remove();
      document.body.innerHTML = "";
    },
  };
}
