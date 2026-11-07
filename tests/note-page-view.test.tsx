import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import {
  NotePageView,
  defineNotePageExtension,
  type NotePageEditorProps,
} from "../src/outliner/note-page-view.js";
import type { NotePage, NotePageType } from "../src/core/note-pages.js";
afterEach(cleanup);
const type: NotePageType<{ text: string }> = {
  type: "test.text",
  label: "Text",
  version: 1,
  create: () => ({ text: "" }),
  validate: (value): value is { text: string } =>
    !!value && typeof value === "object" && typeof (value as { text?: unknown }).text === "string",
};
const page = (id: string): NotePage => ({ id, type: type.type, version: 1, data: { text: id } });

test("typed editor proposals validate, retain identity and honor current read-only state", () => {
  let mounts = 0;
  let change: NotePageEditorProps<{ text: string }>["onChange"] = () => false;
  const changes: NotePage[] = [];
  const errors: Error[] = [];
  const extension = defineNotePageExtension(type, (props) => {
    change = props.onChange;
    React.useEffect(() => {
      mounts++;
    }, []);
    return <span>{props.data.text}</span>;
  });
  const extensions = [extension];
  const view = render(
    <NotePageView
      page={page("a")}
      extensions={extensions}
      readOnly={false}
      onChange={(next) => changes.push(next)}
      onError={(error) => errors.push(error)}
    />,
  );
  assert.equal(change({ text: "updated" }), true);
  assert.equal(changes[0]?.id, "a");
  assert.equal(change({ text: 5 } as never), false);
  assert.equal(errors.length, 1);
  view.rerender(
    <NotePageView
      page={{ ...page("a"), data: { text: "echo" } }}
      extensions={extensions}
      readOnly={false}
      onChange={(next) => changes.push(next)}
    />,
  );
  assert.equal(mounts, 1);
  assert.ok(view.getByText("echo"));
  const oldCallback = change;
  view.rerender(
    <NotePageView
      page={page("a")}
      extensions={extensions}
      onChange={(next) => changes.push(next)}
    />,
  );
  assert.equal(oldCallback({ text: "blocked" }), false);
  assert.equal(changes.length, 1);
});
test("late callbacks from another page or unmounted editor cannot write", () => {
  let change: NotePageEditorProps<{ text: string }>["onChange"] = () => false;
  let mounts = 0;
  const extension = defineNotePageExtension(type, (props) => {
    change = props.onChange;
    React.useEffect(() => {
      mounts++;
    }, []);
    return <span>{props.pageId}</span>;
  });
  const extensions = [extension];
  const changes: NotePage[] = [];
  const view = render(
    <NotePageView
      page={page("a")}
      extensions={extensions}
      readOnly={false}
      onChange={(p) => changes.push(p)}
    />,
  );
  const stale = change;
  view.rerender(
    <NotePageView
      page={page("b")}
      extensions={extensions}
      readOnly={false}
      onChange={(p) => changes.push(p)}
    />,
  );
  assert.equal(stale({ text: "late A" }), false);
  assert.equal(change({ text: "B" }), true);
  assert.equal(changes[0]?.id, "b");
  assert.equal(mounts, 2);
  const unmounted = change;
  view.unmount();
  assert.equal(unmounted({ text: "late B" }), false);
});
test("unknown/future/invalid pages never mount an editor, and SSR preserves fallback text", () => {
  let mounts = 0;
  const extensions = [
    defineNotePageExtension(type, () => {
      mounts++;
      return <p>Editor</p>;
    }),
  ];
  for (const value of [
    { ...page("a"), type: "unknown" },
    { ...page("a"), version: 2 },
    { ...page("a"), data: 5 },
  ]) {
    const html = renderToString(<NotePageView page={value} extensions={extensions} />);
    assert.match(html, /preserved/);
  }
  assert.equal(mounts, 0);
});
test("renderer crashes have a recoverable boundary and do not persist data", async () => {
  let shouldThrow = true;
  let errors = 0;
  let changes = 0;
  const extensions = [
    defineNotePageExtension(type, () => {
      if (shouldThrow) throw Error("expected editor failure");
      return <p>Recovered editor</p>;
    }),
  ];
  const original = console.error;
  console.error = () => {};
  try {
    const view = render(
      <NotePageView
        page={page("a")}
        extensions={extensions}
        onError={() => errors++}
        onChange={() => changes++}
      />,
    );
    assert.ok(view.getByRole("alert"));
    assert.equal(errors, 1);
    assert.equal(changes, 0);
    shouldThrow = false;
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Retry editor" }));
    });
    assert.ok(view.getByText("Recovered editor"));
  } finally {
    console.error = original;
  }
});

test("callbacks from a replaced extension cannot target the replacement editor", () => {
  let firstChange: NotePageEditorProps<{ text: string }>["onChange"] = () => false;
  let secondChange: NotePageEditorProps<{ text: string }>["onChange"] = () => false;
  const first = defineNotePageExtension(type, (props) => {
    firstChange = props.onChange;
    return <span>First editor</span>;
  });
  const second = defineNotePageExtension(type, (props) => {
    secondChange = props.onChange;
    return <span>Second editor</span>;
  });
  const changes: NotePage[] = [];
  const view = render(
    <NotePageView
      page={page("a")}
      extensions={[first]}
      readOnly={false}
      onChange={(value) => changes.push(value)}
    />,
  );
  const stale = firstChange;
  view.rerender(
    <NotePageView
      page={page("a")}
      extensions={[second]}
      readOnly={false}
      onChange={(value) => changes.push(value)}
    />,
  );
  assert.equal(stale({ text: "stale" }), false);
  assert.equal(secondChange({ text: "current" }), true);
  assert.equal(changes.length, 1);
});
