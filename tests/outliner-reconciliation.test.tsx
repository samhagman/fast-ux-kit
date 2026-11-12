import "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { act, cleanup, render } from "@testing-library/react";
import {
  useOutliner,
  type OutlineValueChangeEvent,
  type UseOutlinerOptions,
} from "../src/outliner/use-outliner.js";
import type { OutlineItem } from "../src/outliner/types.js";
import { FieldSession } from "../src/outliner/live-field/field-session.js";

afterEach(cleanup);

const nodes = (text: string): readonly OutlineItem[] => [{ id: "a", text }];
const textAction = (text: string) => ({ type: "text" as const, id: "a", text, caret: text.length });
type Controller = ReturnType<typeof useOutliner>;
type MutableOptions = { -readonly [Key in keyof UseOutlinerOptions]: UseOutlinerOptions[Key] };
type Change = { nodes: readonly OutlineItem[]; meta: OutlineValueChangeEvent };

// React runs descendant layout effects before the parent's layout effects. A one-shot child
// supplies a real dispatch/rejection in that interval, without mocking the hook or its store.
function mountOutline(options: MutableOptions, strict = false) {
  let controller: Controller;
  let childCommit: (() => void) | undefined;
  let parentCommit: (() => void) | undefined;
  let renders = 0;
  function Child() {
    React.useLayoutEffect(() => {
      const run = childCommit;
      childCommit = undefined;
      run?.();
    });
    return null;
  }
  function Harness() {
    renders++;
    controller = useOutliner({ ...options, trackEdits: false });
    React.useLayoutEffect(() => {
      const run = parentCommit;
      parentCommit = undefined;
      run?.();
    });
    return <Child />;
  }
  const element = () =>
    strict ? (
      <React.StrictMode>
        <Harness />
      </React.StrictMode>
    ) : (
      <Harness />
    );
  const view = render(element());
  return {
    options,
    get current() {
      return controller!;
    },
    get renders() {
      return renders;
    },
    rerender: () => view.rerender(element()),
    duringCommit(child: () => void, parent?: () => void) {
      childCommit = child;
      parentCommit = parent;
      view.rerender(element());
    },
  };
}

for (const strict of [false, true]) {
  test(`a descendant edit keeps its exact proposal base through reconciliation (StrictMode=${strict})`, () => {
    const initial = nodes("");
    const changes: Change[] = [];
    const consumed = new WeakSet<readonly OutlineItem[]>();
    let accepted = initial;
    const options: MutableOptions = {
      value: initial,
      onValueChange(next, meta) {
        assert.equal(meta.base, accepted, "a proposal must use the exact preceding array");
        assert.equal(consumed.has(meta.base), false, "a base cannot be consumed twice");
        consumed.add(meta.base);
        changes.push({ nodes: next, meta });
        accepted = next;
        options.value = next;
      },
    };
    const hook = mountOutline(options, strict);
    act(() => {
      hook.current.dispatch(textAction("A"));
      hook.duringCommit(
        () => hook.current.dispatch(textAction("AB")),
        () => {
          assert.equal(hook.current.latestNodes(), changes[1]!.nodes);
          hook.current.dispatch(textAction("ABC"));
        },
      );
    });
    assert.equal(changes.length, 3, "reconciliation must not replay an edit");
    assert.deepEqual(
      changes.map(({ meta }) => meta.base[0]!.text),
      ["", "A", "AB"],
    );
    assert.equal(hook.current.latestNodes(), accepted);
    assert.equal(hook.current.state.nodes, accepted);
    assert.equal(hook.current.currentSeq(), 3);
  });

  test(`already-installed reconciliation does not schedule another render (StrictMode=${strict})`, () => {
    const options: MutableOptions = {
      value: nodes(""),
      onValueChange(next) {
        options.value = next;
      },
    };
    const hook = mountOutline(options, strict);
    let before = hook.renders;
    hook.rerender();
    const ordinaryRenderCount = hook.renders - before;
    act(() => {
      hook.current.dispatch(textAction("A"));
    });
    const revision = hook.current.currentSeq();
    before = hook.renders;
    hook.rerender();
    assert.equal(hook.renders - before, ordinaryRenderCount, "reuse of an echo memo is a no-op");
    assert.equal(hook.current.currentSeq(), revision);
    options.value = nodes("remote");
    hook.rerender();
    const externalRevision = hook.current.currentSeq();
    before = hook.renders;
    hook.rerender();
    assert.equal(
      hook.renders - before,
      ordinaryRenderCount,
      "reuse of an external memo is a no-op",
    );
    assert.equal(hook.current.currentSeq(), externalRevision);
    assert.equal(externalRevision, revision + 1);
  });
}

for (const cloned of [false, true]) {
  for (const echoed of [0, 1]) {
    test(`${echoed === 0 ? "late" : "coalesced"} echoes preserve proposals made during commit (cloned=${cloned})`, () => {
      const changes: Change[] = [];
      const hook = mountOutline({
        value: nodes(""),
        onValueChange(next, meta) {
          changes.push({ nodes: next, meta });
        },
      });
      act(() => {
        hook.current.dispatch(textAction("A"));
        hook.current.dispatch(textAction("AB"));
      });
      hook.options.value = cloned
        ? changes[echoed]!.nodes.map((node) => ({ ...node }))
        : changes[echoed]!.nodes;
      hook.duringCommit(
        () => hook.current.dispatch(textAction("ABC")),
        () => {
          assert.equal(hook.current.latestNodes(), changes[2]!.nodes);
          hook.current.dispatch(textAction("ABCD"));
        },
      );
      assert.equal(changes.length, 4);
      assert.equal(changes[3]!.meta.base, changes[2]!.nodes);
      hook.options.value = changes[3]!.nodes;
      hook.rerender();
      assert.equal(hook.current.latestNodes(), changes[3]!.nodes);
      assert.equal(hook.current.state.nodes[0]!.text, "ABCD");
      assert.equal(hook.current.currentSeq(), 4);
    });
  }
}

test("a rejection during commit cannot be replaced by an older pending snapshot", () => {
  const initial = nodes("");
  const changes: Change[] = [];
  const hook = mountOutline({
    value: initial,
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
    },
  });
  act(() => {
    hook.current.dispatch(textAction("A"));
    hook.current.dispatch(textAction("AB"));
  });
  hook.duringCommit(
    () => changes[0]!.meta.reject(),
    () => assert.equal(hook.current.latestNodes(), initial),
  );
  assert.equal(hook.current.state.nodes, initial);
  assert.equal(hook.current.rejection?.count, 2);
  act(() => {
    hook.current.dispatch(textAction("C"));
  });
  assert.equal(changes[2]!.meta.base, initial);
  assert.equal(hook.current.currentSeq(), 4);
});

test("a synchronous veto in a descendant is not replayed or accepted", () => {
  const initial = nodes("");
  const changes: Change[] = [];
  const hook = mountOutline({
    value: initial,
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
      return false;
    },
  });
  hook.duringCommit(
    () => hook.current.dispatch(textAction("A")),
    () => {
      assert.equal(hook.current.latestNodes(), initial);
    },
  );
  assert.equal(changes.length, 1);
  assert.equal(hook.current.state.nodes, initial);
  assert.equal(hook.current.rejection?.count, 1);
});

test("a caret-only descendant action survives an echo without a content proposal", () => {
  const changes: Change[] = [];
  const options: MutableOptions = {
    value: nodes(""),
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
      options.value = next;
    },
  };
  const hook = mountOutline(options);
  act(() => {
    hook.current.dispatch(textAction("A"));
    hook.duringCommit(
      () => hook.current.dispatch({ type: "caret", id: "a", start: 0, end: 0 }),
      () => hook.current.dispatch(textAction("AB")),
    );
  });
  assert.equal(changes.length, 2);
  assert.equal(changes[1]!.meta.base, changes[0]!.nodes);
  assert.equal(changes[1]!.meta.beforeCaret?.start, 0);
  assert.equal(changes[1]!.meta.beforeCaret?.end, 0);
  assert.equal(hook.current.currentSeq(), 2);
});

for (const collaborative of [false, true]) {
  test(`external replacement reconciles the newer store once (collaboration=${collaborative})`, () => {
    const changes: Change[] = [];
    const hook = mountOutline({
      value: nodes(""),
      onValueChange(next, meta) {
        changes.push({ nodes: next, meta });
      },
      collaboration: collaborative
        ? { canUndo: false, canRedo: false, undo() {}, redo() {} }
        : undefined,
    });
    act(() => {
      hook.current.dispatch(textAction("A"));
    });
    const external = nodes("remote");
    hook.options.value = external;
    hook.duringCommit(
      () => hook.current.dispatch(textAction("AB")),
      () => assert.equal(hook.current.latestNodes(), changes[1]!.nodes),
    );
    assert.equal(
      hook.current.latestNodes(),
      external,
      "an unmatched value still supersedes pending edits",
    );
    assert.equal(hook.current.currentSeq(), 3, "two local changes and one external adoption");
    assert.equal(hook.current.latestState().history.past.length, collaborative ? 0 : 1);
    hook.rerender();
    assert.equal(hook.current.currentSeq(), 3);
    act(() => {
      hook.current.dispatch(textAction("remote!"));
    });
    assert.equal(changes.length, 3);
    assert.equal(changes[2]!.meta.base, external);
  });
}

test("uncontrolled descendant edits retain their synchronous bases and history", () => {
  const initial = nodes("");
  const changes: Change[] = [];
  const hook = mountOutline({
    defaultValue: initial,
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
    },
  });
  act(() => {
    hook.current.dispatch(textAction("A"));
    hook.duringCommit(
      () => hook.current.dispatch(textAction("AB")),
      () => hook.current.dispatch(textAction("ABC")),
    );
  });
  assert.equal(changes.length, 3);
  assert.equal(changes[0]!.meta.base, initial);
  assert.equal(changes[1]!.meta.base, changes[0]!.nodes);
  assert.equal(changes[2]!.meta.base, changes[1]!.nodes);
  assert.equal(hook.current.state.nodes, changes[2]!.nodes);
  assert.equal(hook.current.canUndo, true);
  assert.equal(hook.current.currentSeq(), 3);
});

test("read-only descendant commands cannot create or replay proposals", () => {
  const initial = nodes("A");
  const changes: Change[] = [];
  const hook = mountOutline({
    value: initial,
    readOnly: true,
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
    },
  });
  hook.duringCommit(() => {
    assert.equal(hook.current.dispatch(textAction("AB")).refusal, "read-only");
  });
  assert.equal(changes.length, 0);
  assert.equal(hook.current.latestNodes(), initial);
  assert.equal(hook.current.currentSeq(), 0);
});

test("an invalid incoming value cannot erase a newer descendant proposal", (context) => {
  const warnings = context.mock.method(console, "error", () => {});
  const changes: Change[] = [];
  const hook = mountOutline({
    value: nodes(""),
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
    },
  });
  act(() => {
    hook.current.dispatch(textAction("A"));
  });
  hook.options.value = [
    { id: "a", text: "duplicate" },
    { id: "a", text: "id" },
  ];
  hook.duringCommit(
    () => hook.current.dispatch(textAction("AB")),
    () => {
      assert.equal(hook.current.latestNodes(), changes[1]!.nodes);
      hook.current.dispatch(textAction("ABC"));
    },
  );
  assert.equal(hook.current.latestNodes(), changes[2]!.nodes);
  assert.equal(changes[2]!.meta.base, changes[1]!.nodes);
  assert.equal(hook.current.currentSeq(), 3);
  assert.equal(warnings.mock.calls.length, 1);
  assert.match(String(warnings.mock.calls[0]!.arguments[0]), /not a valid outline/);
});

test("non-optimistic rendering keeps the echoed document without losing newer proposal bases", () => {
  const initial = nodes("");
  const changes: Change[] = [];
  const hook = mountOutline({
    value: initial,
    optimistic: false,
    onValueChange(next, meta) {
      changes.push({ nodes: next, meta });
    },
  });
  act(() => {
    hook.current.dispatch(textAction("A"));
  });
  assert.equal(hook.current.state.nodes, initial);
  hook.options.value = changes[0]!.nodes;
  hook.duringCommit(
    () => hook.current.dispatch(textAction("AB")),
    () => {
      assert.equal(hook.current.latestNodes(), changes[1]!.nodes);
      hook.current.dispatch(textAction("ABC"));
    },
  );
  assert.equal(changes.length, 3);
  assert.equal(changes[2]!.meta.base, changes[1]!.nodes);
  assert.equal(hook.current.state.nodes, changes[0]!.nodes);
  assert.equal(hook.current.latestNodes(), changes[2]!.nodes);
  hook.options.value = changes[2]!.nodes;
  hook.rerender();
  assert.equal(hook.current.state.nodes, changes[2]!.nodes);
  assert.equal(hook.current.currentSeq(), 3);
});

test("FieldSession typing survives a commit race and its deferred transition flush", async () => {
  const frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")!;
  const frames: FrameRequestCallback[] = [];
  Object.defineProperty(globalThis, "requestAnimationFrame", {
    configurable: true,
    value: (callback: FrameRequestCallback) => frames.push(callback),
  });
  try {
    const changes: Change[] = [];
    const options: MutableOptions = {
      value: nodes(""),
      onValueChange(next, meta) {
        changes.push({ nodes: next, meta });
        options.value = next;
      },
    };
    const hook = mountOutline(options);
    const field = new FieldSession({ field: "title" }, "a", "", {
      dispatch: (action) => hook.current.dispatch(action, { afterPaint: true }),
      currentSeq: () => hook.current.currentSeq(),
      text: () => hook.current.latestNodes()[0]!.text,
      row: () => ({ parentId: null }),
      neighbour: () => null,
    });
    act(() => {
      field.apply(field.state.tr.insertText("A"));
    });
    hook.duringCommit(
      () => {
        field.apply(field.state.tr.insertText("B"));
      },
      () => {
        assert.equal(hook.current.latestNodes(), changes[1]!.nodes);
        field.apply(field.state.tr.insertText("C"));
      },
    );
    assert.equal(frames.length, 1, "afterPaint batches the field's pending render");
    await act(async () => {
      frames.shift()!(0);
      // renderSoon schedules one task after the frame, then starts its React transition.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(changes.length, 3);
    assert.equal(changes[1]!.meta.base, changes[0]!.nodes);
    assert.equal(changes[2]!.meta.base, changes[1]!.nodes);
    assert.equal(hook.current.state.nodes, changes[2]!.nodes);
    assert.equal(hook.current.currentSeq(), 3);
    assert.equal(field.source, "ABC");
    assert.equal(field.onRender("ABC", hook.current.renderedSeq), "in-sync");
  } finally {
    Object.defineProperty(globalThis, "requestAnimationFrame", frameDescriptor);
  }
});

for (const afterPaint of [false, true]) {
  for (const supersede of [false, true]) {
    test(`a suspended echo transition ${supersede ? "superseded" : "resumed"} after a newer edit preserves its base (afterPaint=${afterPaint})`, async () => {
      const frameDescriptor = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame")!;
      const frames: FrameRequestCallback[] = [];
      Object.defineProperty(globalThis, "requestAnimationFrame", {
        configurable: true,
        value: (callback: FrameRequestCallback) => frames.push(callback),
      });
      try {
        const initial = nodes("");
        const changes: Change[] = [];
        let controller: Controller;
        let publish: (value: readonly OutlineItem[], suspend: boolean) => void;
        let release!: () => void;
        let ready = false;
        let attempts = 0;
        let commits = 0;
        const gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        function Child({ suspend }: { suspend: boolean }) {
          if (suspend && !ready) {
            attempts++;
            throw gate;
          }
          return null;
        }
        function Harness() {
          const [incoming, setIncoming] = React.useState(initial);
          const [suspend, setSuspend] = React.useState(false);
          publish = (value, nextSuspend) => {
            setIncoming(value);
            setSuspend(nextSuspend);
          };
          const outliner = useOutliner({
            value: incoming,
            trackEdits: false,
            onValueChange(next, meta) {
              changes.push({ nodes: next, meta });
            },
          });
          React.useLayoutEffect(() => {
            controller = outliner;
            commits++;
          });
          return <Child suspend={suspend} />;
        }
        render(
          <React.Suspense fallback={null}>
            <Harness />
          </React.Suspense>,
        );
        act(() => {
          controller!.dispatch(textAction("A"));
        });
        const committed = commits;
        await act(async () => {
          React.startTransition(() => publish!(changes[0]!.nodes, true));
        });
        assert.ok(attempts > 0, "the transition rendered the echo and suspended before commit");
        assert.equal(commits, committed);
        const suspendedAttempts = attempts;
        act(() => {
          controller!.dispatch(textAction("AB"), { afterPaint });
        });
        assert.equal(controller!.latestNodes(), changes[1]!.nodes);
        assert.equal(controller!.currentSeq(), 2);
        if (afterPaint) {
          assert.equal(frames.length, 1, "the version update is still behind the held frame");
          assert.equal(commits, committed, "advancing the store did not commit a React update");
          assert.equal(
            attempts,
            suspendedAttempts,
            "advancing the store did not retry the transition",
          );
        }
        if (supersede)
          act(() => {
            publish!(changes[1]!.nodes, false);
          });
        await act(async () => {
          ready = true;
          release();
          await gate;
        });
        assert.equal(controller!.latestNodes(), changes[1]!.nodes);
        assert.equal(controller!.state.nodes, changes[1]!.nodes);
        if (afterPaint) {
          assert.equal(frames.length, 1, "resume finished before the deferred version update");
          await act(async () => {
            frames.shift()!(0);
            await new Promise<void>((resolve) => setTimeout(resolve, 0));
          });
          assert.equal(controller!.latestNodes(), changes[1]!.nodes);
          assert.equal(controller!.state.nodes, changes[1]!.nodes);
          assert.equal(controller!.currentSeq(), 2);
        }
        act(() => {
          controller!.dispatch(textAction("ABC"));
        });
        assert.equal(changes.length, 3);
        assert.equal(changes[2]!.meta.base, changes[1]!.nodes);
        assert.equal(controller!.currentSeq(), 3);
      } finally {
        Object.defineProperty(globalThis, "requestAnimationFrame", frameDescriptor);
      }
    });
  }
}
