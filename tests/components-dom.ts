import { JSDOM } from "jsdom";
export const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "https://components.test",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "HTMLButtonElement",
  "HTMLInputElement",
  "HTMLTextAreaElement",
  "HTMLSelectElement",
  "Element",
  "Node",
  "NodeFilter",
  "Document",
  "DocumentFragment",
  "SVGElement",
  "MutationObserver",
  "Event",
  "CustomEvent",
  "EventTarget",
  "FocusEvent",
  "KeyboardEvent",
  "MouseEvent",
  "InputEvent",
] as const) {
  Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
}
for (const key of ["getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame"] as const) {
  Object.defineProperty(globalThis, key, {
    value: dom.window[key].bind(dom.window),
    configurable: true,
  });
}
Object.defineProperty(globalThis, "CSS", {
  value: { escape: (value: string) => value.replace(/[^\w-]/g, (char) => `\\${char}`) },
  configurable: true,
});
Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  value: true,
  writable: true,
  configurable: true,
});
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverStub,
  configurable: true,
});
Object.defineProperty(dom.window, "ResizeObserver", {
  value: ResizeObserverStub,
  configurable: true,
});
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollIntoView", {
  value() {},
  configurable: true,
});
// jsdom has no element scrolling implementation. Preserve requested offsets for
// state assertions without pretending that layout or smooth scrolling was run.
Object.defineProperty(dom.window.HTMLElement.prototype, "scrollTo", {
  value(this: HTMLElement, optionsOrX?: ScrollToOptions | number, y?: number) {
    if (typeof optionsOrX === "number") {
      this.scrollLeft = optionsOrX;
      this.scrollTop = y ?? this.scrollTop;
    } else {
      this.scrollLeft = optionsOrX?.left ?? this.scrollLeft;
      this.scrollTop = optionsOrX?.top ?? this.scrollTop;
    }
  },
  configurable: true,
});
export const browserErrors: unknown[] = [];
dom.window.addEventListener("error", (event) => browserErrors.push(event.error));
class IntersectionObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
Object.defineProperty(globalThis, "IntersectionObserver", {
  value: IntersectionObserverStub,
  configurable: true,
});
Object.defineProperty(dom.window, "IntersectionObserver", {
  value: IntersectionObserverStub,
  configurable: true,
});
