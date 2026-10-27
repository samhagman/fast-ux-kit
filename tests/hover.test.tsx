import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import { StrictMode, type ReactNode } from "react";
import {
  validTextHoverOffer,
  type TextHoverOffer,
  type TextHoverProvider,
} from "../src/core/hover.js";
import type { TextHoverRequest, TextRequestContext } from "../src/core/text-intelligence.js";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://hover.test/" });
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Document",
  "MutationObserver",
  "Event",
] as const)
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;
const { act, cleanup, renderHook } = await import("@testing-library/react");
const { useTextHover } = await import("../src/react/useTextHover.js");
afterEach(cleanup);
const initial: TextRequestContext = {
  surfaceId: "surface",
  rowId: "row",
  text: "hello world",
  revision: 1,
  selection: { start: 2, end: 2 },
};
const offer = (content: ReactNode): TextHoverOffer<ReactNode> => ({
  range: { start: 0, end: 5 },
  content,
});
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

test("hover shape validation rejects malformed ranges/content without invoking accessors", () => {
  for (const value of [
    null,
    undefined,
    3,
    [],
    {},
    { range: { start: 0, end: 5 } },
    { range: { start: -1, end: 5 }, content: "bad" },
    { range: { start: 0.5, end: 5 }, content: "bad" },
    { range: { start: 0, end: 99 }, content: "bad" },
  ])
    assert.equal(validTextHoverOffer(value, initial.text, 2), false);
  let calls = 0;
  assert.equal(
    validTextHoverOffer(
      {
        range: { start: 0, end: 5 },
        get content() {
          calls++;
          return "bad";
        },
      },
      initial.text,
      2,
    ),
    false,
  );
  assert.equal(calls, 0);
  assert.ok(validTextHoverOffer(offer("ok"), initial.text, 5));
  assert.equal(validTextHoverOffer(offer("outside"), initial.text, 6), false);
  assert.ok(
    validTextHoverOffer({ range: { start: 2, end: 2 }, content: "point" }, initial.text, 2),
  );
});

test("latest hover request wins, superseded requests abort, and source contexts are snapshotted", async () => {
  const waits = [
    deferred<TextHoverOffer<ReactNode> | null>(),
    deferred<TextHoverOffer<ReactNode> | null>(),
  ];
  const requests: TextHoverRequest[] = [];
  const provider: TextHoverProvider<ReactNode> = {
    id: "lookup",
    hover: (request) => {
      requests.push(request);
      return waits[requests.length - 1]!.promise;
    },
  };
  let context = initial;
  const hook = renderHook(
    () => useTextHover({ providers: [provider], getContext: () => context }),
    { wrapper: StrictMode },
  );
  act(() => hook.result.current.request(context, 2, "pointer"));
  assert.equal(hook.result.current.status, "loading");
  context = { ...initial, revision: 2 };
  act(() => hook.result.current.request(context, 3, "keyboard"));
  assert.equal(requests[0]!.signal.aborted, true);
  await act(async () => waits[1]!.resolve(offer(<strong>Latest</strong>)));
  assert.equal(hook.result.current.status, "ready");
  assert.equal(hook.result.current.session?.origin, "keyboard");
  assert.equal(hook.result.current.session?.offset, 3);
  assert.equal(hook.result.current.session?.context.revision, 2);
  await act(async () => waits[0]!.resolve(offer("Stale")));
  assert.equal(hook.result.current.session?.context.revision, 2);
  assert.notEqual(hook.result.current.session?.context, context);
});

test("exact row/surface/text/revision/selection freshness rejects stale provider work", async () => {
  const variants: TextRequestContext[] = [
    { ...initial, surfaceId: "other" },
    { ...initial, rowId: "other" },
    { ...initial, text: "hello WORLD" },
    { ...initial, revision: 2 },
    { ...initial, selection: { start: 3, end: 3 } },
  ];
  for (const changed of variants) {
    const pending = deferred<TextHoverOffer<ReactNode> | null>();
    let current = initial;
    const hook = renderHook(() =>
      useTextHover({
        providers: [{ id: "p", hover: () => pending.promise }],
        getContext: () => current,
      }),
    );
    act(() => hook.result.current.request(initial, 2, "keyboard"));
    current = changed;
    await act(async () => pending.resolve(offer("Must not show")));
    assert.equal(hook.result.current.session, null);
    assert.equal(hook.result.current.status, "idle");
    hook.unmount();
  }
});

test("dismissal, disabled state and unmount abort without reopening stale content", async () => {
  for (const action of ["dismiss", "disable", "unmount"] as const) {
    const pending = deferred<TextHoverOffer<ReactNode> | null>();
    let request: TextHoverRequest | undefined;
    const providers: readonly TextHoverProvider<ReactNode>[] = [
      {
        id: "p",
        hover: (value) => {
          request = value;
          return pending.promise;
        },
      },
    ];
    const hook = renderHook(
      ({ disabled }) => useTextHover({ providers, getContext: () => initial, disabled }),
      { initialProps: { disabled: false } },
    );
    act(() => hook.result.current.request(initial, 2, "pointer"));
    if (action === "dismiss") act(() => hook.result.current.dismiss());
    if (action === "disable") hook.rerender({ disabled: true });
    if (action === "unmount") hook.unmount();
    assert.equal(request?.signal.aborted, true);
    await act(async () => pending.resolve(offer("Too late")));
    if (action !== "unmount") {
      assert.equal(hook.result.current.status, "idle");
      assert.equal(hook.result.current.session, null);
    }
  }
});

test("ready sessions close when context changes, and disabled requests never call providers", async () => {
  let current = initial,
    calls = 0;
  const providers: readonly TextHoverProvider<ReactNode>[] = [
    {
      id: "p",
      hover: () => {
        calls++;
        return offer("Ready");
      },
    },
  ];
  const hook = renderHook(
    ({ disabled }) => useTextHover({ providers, getContext: () => current, disabled }),
    { initialProps: { disabled: false } },
  );
  await act(async () => hook.result.current.request(initial, 2, "keyboard"));
  assert.equal(hook.result.current.status, "ready");
  current = { ...initial, selection: { start: 4, end: 4 } };
  hook.rerender({ disabled: false });
  assert.equal(hook.result.current.status, "idle");
  hook.rerender({ disabled: true });
  act(() => hook.result.current.request(current, 4, "keyboard"));
  assert.equal(calls, 1);
});

test("provider order is deterministic, malformed offers are skipped, and errors are exposed safely", async () => {
  const called: string[] = [];
  const provider = (id: string, value: unknown): TextHoverProvider<ReactNode> => ({
    id,
    hover: () => {
      called.push(id);
      return value as never;
    },
  });
  const providers = [
    provider("bad-range", { range: { start: -1, end: 5 }, content: "bad" }),
    provider("bad-content", offer({ unsafe: true } as never)),
    {
      id: "throws",
      hover: () => {
        called.push("throws");
        throw new Error("Offline");
      },
    },
    provider("first-valid", offer(<em>Trusted React</em>)),
    provider("later", offer("Later")),
  ];
  const hook = renderHook(() => useTextHover({ providers, getContext: () => initial }));
  await act(async () => hook.result.current.request(initial, 2, "keyboard"));
  assert.equal(hook.result.current.status, "ready");
  assert.equal(hook.result.current.error, null);
  assert.deepEqual(called, ["bad-range", "bad-content", "throws", "first-valid"]);
  const failing = renderHook(() =>
    useTextHover({
      providers: [{ id: "failure", hover: () => Promise.reject(new Error("Offline")) }],
      getContext: () => initial,
    }),
  );
  await act(async () => failing.result.current.request(initial, 2, "pointer"));
  assert.equal(failing.result.current.status, "error");
  assert.match(String(failing.result.current.error), /Offline/);
  assert.equal(failing.result.current.session, null);
});

test("invalid request coordinates/context and empty providers cannot produce a session", async () => {
  let calls = 0;
  const hook = renderHook(() =>
    useTextHover({
      providers: [
        {
          id: "p",
          hover: () => {
            calls++;
            return null;
          },
        },
      ],
      getContext: () => initial,
    }),
  );
  for (const offset of [-1, 999, Number.NaN, 0.5])
    act(() => hook.result.current.request(initial, offset, "pointer"));
  act(() => hook.result.current.request({ ...initial, revision: 99 }, 2, "keyboard"));
  assert.equal(calls, 0);
  await act(async () => hook.result.current.request(initial, 2, "keyboard"));
  assert.equal(hook.result.current.status, "empty");
});

test("a removed or replaced provider cannot publish its pending hover", async () => {
  const pending = deferred<TextHoverOffer<ReactNode> | null>();
  const provider: TextHoverProvider<ReactNode> = { id: "removed", hover: () => pending.promise };
  const hook = renderHook(
    ({ providers }) => useTextHover({ providers, getContext: () => initial }),
    { initialProps: { providers: [provider] as readonly TextHoverProvider<ReactNode>[] } },
  );
  act(() => hook.result.current.request(initial, 2, "keyboard"));
  hook.rerender({ providers: [] });
  await act(async () => pending.resolve(offer("Removed provider")));
  assert.equal(hook.result.current.session, null);
  assert.equal(hook.result.current.status, "empty");
});
