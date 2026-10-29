import assert from "node:assert/strict";
import test from "node:test";
import { dom } from "./components-dom.js";
import { retainTourControlInViewport } from "../examples/docs/demos/tour-viewport.js";

function fixture(
  run: (f: {
    content: HTMLDivElement;
    control: HTMLButtonElement;
    outside: HTMLButtonElement;
    flush: () => void;
    resize: () => void;
    calls: ScrollIntoViewOptions[];
    move: (top: number) => void;
    stop: () => void;
  }) => void,
) {
  const window = dom.window;
  const previousRequest = window.requestAnimationFrame;
  const previousCancel = window.cancelAnimationFrame;
  let id = 0;
  const frames = new Map<number, FrameRequestCallback>();
  window.requestAnimationFrame = (callback) => {
    frames.set(++id, callback);
    return id;
  };
  window.cancelAnimationFrame = (handle) => {
    frames.delete(handle);
  };
  const content = document.createElement("div");
  const control = document.createElement("button");
  const outside = document.createElement("button");
  content.append(control);
  document.body.append(content, outside);
  control.focus();
  let top = window.innerHeight + 20;
  control.getBoundingClientRect = () => new window.DOMRect(20, top, 80, 44);
  const calls: ScrollIntoViewOptions[] = [];
  Object.defineProperty(control, "scrollIntoView", {
    value: (options: ScrollIntoViewOptions) => calls.push(options),
    configurable: true,
  });
  const stop = retainTourControlInViewport(content);
  const flush = () => {
    const pending = [...frames.values()];
    frames.clear();
    for (const callback of pending) callback(0);
  };
  try {
    run({
      content,
      control,
      outside,
      flush,
      resize: () => window.dispatchEvent(new window.Event("resize")),
      calls,
      move: (value) => {
        top = value;
      },
      stop,
    });
  } finally {
    stop();
    content.remove();
    outside.remove();
    window.requestAnimationFrame = previousRequest;
    window.cancelAnimationFrame = previousCancel;
  }
}

test("tour viewport reveal is bounded to two checks and never moves focus", () => {
  fixture(({ control, flush, resize, calls }) => {
    resize();
    for (let i = 0; i < 10; i++) flush();
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[0], { block: "center", inline: "nearest", behavior: "instant" });
    assert.equal(document.activeElement, control);
  });
});

test("tour viewport skips the second scroll after the first reveals the control", () => {
  fixture(({ flush, resize, calls, move }) => {
    resize();
    flush();
    flush();
    assert.equal(calls.length, 1);
    move(20);
    flush();
    flush();
    assert.equal(calls.length, 1);
  });
});

test("tour viewport does not scroll an already visible control", () => {
  fixture(({ flush, resize, calls, move }) => {
    move(20);
    resize();
    for (let i = 0; i < 5; i++) flush();
    assert.equal(calls.length, 0);
  });
});

test("tour viewport respects focus moved outside before a deferred reveal", () => {
  fixture(({ outside, flush, resize, calls }) => {
    resize();
    outside.focus();
    for (let i = 0; i < 5; i++) flush();
    assert.equal(calls.length, 0);
    assert.equal(document.activeElement, outside);
  });
});

test("tour viewport coalesces resize bursts and cancels work on cleanup", () => {
  fixture(({ flush, resize, calls, stop }) => {
    resize();
    resize();
    resize();
    flush();
    flush();
    assert.equal(calls.length, 1);
    stop();
    resize();
    for (let i = 0; i < 5; i++) flush();
    assert.equal(calls.length, 1);
  });
});

test("tour viewport does not scroll detached content", () => {
  fixture(({ content, flush, resize, calls }) => {
    resize();
    content.remove();
    for (let i = 0; i < 5; i++) flush();
    assert.equal(calls.length, 0);
  });
});
