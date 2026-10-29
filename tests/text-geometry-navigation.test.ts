import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { dom } from "./components-dom.js";
import { textareaVerticalTarget } from "../src/react/text-geometry.js";
Object.defineProperty(globalThis, "DOMRect", { value: dom.window.DOMRect, configurable: true });

type Box = { x: number; y: number; height?: number; width?: number };
type Geometry = (offset: number, collapsed: boolean) => Box;
const fixtures = new Map<string, Geometry>();
const reads: { text: string; offset: number; collapsed: boolean }[] = [];
const rangePrototype = dom.window.Range.prototype;
const originalRect = Object.getOwnPropertyDescriptor(rangePrototype, "getBoundingClientRect");
function installGeometry() {
  Object.defineProperty(rangePrototype, "getBoundingClientRect", {
    configurable: true,
    value(this: Range) {
      const text = (this.startContainer as Text).data.slice(0, -1);
      const collapsed = this.startOffset === this.endOffset;
      reads.push({ text, offset: this.startOffset, collapsed });
      const box = fixtures.get(text)?.(this.startOffset, collapsed);
      assert.ok(box, `unexpected mirror text ${JSON.stringify(text.slice(0, 80))}`);
      return new DOMRect(box.x, box.y, collapsed ? 0 : (box.width ?? 8), box.height ?? 20);
    },
  });
}
afterEach(() => {
  document.body.replaceChildren();
  fixtures.clear();
  reads.length = 0;
  if (originalRect) Object.defineProperty(rangePrototype, "getBoundingClientRect", originalRect);
  else delete (rangePrototype as Partial<Range>).getBoundingClientRect;
});
function textarea(
  text: string,
  caret: number,
  geometry?: Geometry,
  { left = 0, top = 0, width = 160, direction = "ltr", scrollLeft = 0 } = {},
) {
  const input = document.createElement("textarea");
  input.value = text;
  input.setSelectionRange(caret, caret);
  input.style.direction = direction;
  input.style.lineHeight = "20px";
  input.scrollLeft = scrollLeft;
  input.getBoundingClientRect = () => new DOMRect(left, top, width, 60);
  document.body.append(input);
  if (geometry) fixtures.set(text, geometry);
  return input;
}
const linear = (offset: number) => ({ x: offset * 10, y: 0 });
const wrapped =
  (length: number, columns: number): Geometry =>
  (offset) => {
    const line = Math.min(
      Math.floor(offset / columns),
      Math.floor(Math.max(0, length - 1) / columns),
    );
    return { x: (offset - line * columns) * 10, y: line * 20 };
  };
function move(source: HTMLTextAreaElement, target: HTMLTextAreaElement, direction: "up" | "down") {
  const before = document.body.childElementCount;
  const result = textareaVerticalTarget(source, target, direction);
  assert.equal(document.body.childElementCount, before, "all measurement mirrors are removed");
  return result;
}

test("down from the beginning of a soft-wrapped last line chooses the next row's first visual column", () => {
  installGeometry();
  const text = "Press Enter to split. Tab to nest. Escape to select.";
  const source = textarea(text, 45, (offset, collapsed) => {
    // A collapsed DOM Range may prefer the preceding soft line; its character does not.
    if (offset === 45 && collapsed) return { x: 160, y: 20 };
    const start = offset >= 45 ? 45 : offset >= 22 ? 22 : 0;
    return { x: (offset - start) * 7, y: start === 45 ? 40 : start === 22 ? 20 : 0 };
  });
  const targetText = "Try completing this task";
  const target = textarea(targetText, 24, wrapped(targetText.length, 18), { top: 100 });
  assert.equal(move(source, target, "down"), 0);
});

test("up selects the last visual line rather than the last logical-newline column", () => {
  installGeometry();
  const source = textarea("source for up", 3, linear, { top: 150 });
  const text = "abcdefghijklmnopqrstuvwx";
  const target = textarea(text, 0, wrapped(text.length, 8));
  assert.equal(move(source, target, "up"), 19);
});

test("different row indents preserve physical viewport x and clamp before the target's first caret", () => {
  installGeometry();
  const source = textarea("source indent", 2, linear, { left: 70 });
  const target = textarea("target indentation", 0, linear, { left: 30, top: 100 });
  assert.equal(move(source, target, "down"), 6);
  const furtherIndented = textarea("further indented target", 0, linear, { left: 120 });
  assert.equal(move(source, furtherIndented, "down"), 0);
});

test("horizontal scroll offsets participate in the viewport coordinate mapping", () => {
  installGeometry();
  const source = textarea("scrolled source", 5, linear, { left: 20, scrollLeft: 30 });
  const target = textarea("scrolled target", 0, linear, { left: 10, scrollLeft: 10 });
  assert.equal(move(source, target, "down"), 4);
});

test("controlled RTL physical rectangles map to logical offsets without assuming increasing x", () => {
  installGeometry();
  const source = textarea("rtl source", 1, () => ({ x: 70, y: 0 }));
  const target = textarea("אבגדהוז", 0, (offset) => ({ x: 100 - offset * 10, y: 0 }), {
    direction: "rtl",
  });
  assert.equal(move(source, target, "down"), 3);
});

test("mixed-direction controlled rectangles choose nearest physical x, not logical order", () => {
  installGeometry();
  const source = textarea("bidi source", 1, () => ({ x: 30, y: 0 }));
  const x = [0, 10, 40, 30, 20, 50];
  const target = textarea("aאבbc", 0, (offset) => ({ x: x[offset]!, y: 0 }));
  assert.equal(move(source, target, "down"), 3);
});

test("candidate ranges and returned offsets never split a surrogate pair in either direction", () => {
  installGeometry();
  const source = textarea("emoji source", 1, () => ({ x: 20, y: 0 }));
  const target = textarea("A🙂B", 0, linear);
  assert.equal(move(source, target, "down"), 1);
  assert.equal(move(source, target, "up"), 3);
  assert.ok(reads.filter((read) => read.text === target.value).every((read) => read.offset !== 2));
});

test("zero-layout fallback uses explicit first/last lines and clamps surrogate boundaries", () => {
  const source = textarea("abc\nabcdef", 7, undefined, { width: 0 });
  const target = textarea("12\n12345", 0, undefined, { width: 0 });
  assert.equal(move(source, target, "down"), 2);
  assert.equal(move(source, target, "up"), 6);
  source.value = "xx";
  source.setSelectionRange(2, 2);
  target.value = "A🙂B\nA🙂B";
  assert.equal(move(source, target, "down"), 1);
  assert.equal(move(source, target, "up"), 6);
  assert.equal(reads.length, 0);
});

test("explicit newline geometry selects only the requested edge line including a trailing empty line", () => {
  installGeometry();
  const source = textarea("newline source", 2, linear);
  const target = textarea("1234\nabc\n", 0, (offset) => {
    const start = offset >= 9 ? 9 : offset >= 5 ? 5 : 0;
    return { x: (offset - start) * 10, y: start === 9 ? 40 : start === 5 ? 20 : 0 };
  });
  assert.equal(move(source, target, "down"), 2);
  assert.equal(move(source, target, "up"), 9);
  const empty = textarea("", 0, () => ({ x: 0, y: 0 }));
  assert.equal(move(source, empty, "down"), 0);
  assert.equal(move(source, empty, "up"), 0);
});

test("zero or unavailable Range geometry falls back and always cleans up mirrors", () => {
  installGeometry();
  const source = textarea("source geometry absent", 3, () => ({ x: 0, y: 0, height: 0 }));
  const target = textarea("first\nlast", 0, linear);
  assert.equal(move(source, target, "up"), 9);
  Object.defineProperty(rangePrototype, "getBoundingClientRect", {
    configurable: true,
    value: undefined,
  });
  assert.equal(move(source, target, "down"), 3);
  Object.defineProperty(rangePrototype, "getBoundingClientRect", {
    configurable: true,
    value: () => {
      throw new Error("No layout");
    },
  });
  assert.equal(move(source, target, "down"), 3);
  const originalCreateRange = document.createRange;
  document.createRange = () => {
    throw new Error("Range unavailable");
  };
  try {
    assert.equal(move(source, target, "up"), 9);
  } finally {
    document.createRange = originalCreateRange;
  }
});

test("either textarea over the 20k budget bypasses mirror geometry", () => {
  installGeometry();
  const source = textarea("source budget", 3, linear);
  const target = textarea("t".repeat(20_001), 0, linear);
  assert.equal(move(source, target, "down"), 3);
  source.value = "s".repeat(20_001);
  source.setSelectionRange(20_001, 20_001);
  target.value = "short\nlast";
  assert.equal(move(source, target, "up"), target.value.length);
  assert.equal(reads.length, 0);
});

test("one immutable mirror per textarea bounds long-line measurement without full-string rebuilding", () => {
  installGeometry();
  const source = textarea("long-line source", 1, () => ({ x: 10_000, y: 0 }));
  const target = textarea("t".repeat(20_000), 0, (offset) => ({ x: offset, y: 0 }), {
    width: 30_000,
  });
  let mirrors = 0;
  const originalCreate = document.createElement.bind(document);
  document.createElement = ((name: string, options?: ElementCreationOptions) => {
    if (name === "div") mirrors++;
    return originalCreate(name, options);
  }) as typeof document.createElement;
  try {
    assert.equal(move(source, target, "down"), 10_000);
  } finally {
    document.createElement = originalCreate;
  }
  assert.equal(mirrors, 2);
  assert.equal(reads.length, 40_006, "two Range reads per candidate, plus source and edge");
});

test("scan stops after the first visual line rather than walking every long-document boundary", () => {
  installGeometry();
  const source = textarea("short first line source", 2, linear);
  const text = "t".repeat(20_000);
  const target = textarea(text, 0, wrapped(text.length, 10));
  assert.equal(move(source, target, "down"), 2);
  assert.equal(reads.length, 26);
});
