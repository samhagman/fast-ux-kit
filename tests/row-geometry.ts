import { dom } from "./components-dom.js";

/**
 * jsdom has no layout. This lays the buttons of every toggle or segment group out in one row, at
 * a known size, so tests can check where a sliding indicator is placed. Returns a restore function.
 */
export function layOutRow({ padding = 0, width = 60, height = 32, left = 100, top = 40 } = {}) {
  const proto = dom.window.HTMLElement.prototype;
  const groups = new Set(["toggle-group", "segment-group"]);
  const isGroup = (el: Element) => groups.has(el.getAttribute("data-slot") ?? "");
  const items = (group: Element) => Array.from(group.querySelectorAll(":scope > button"));
  const box = (el: HTMLElement) => {
    if (isGroup(el))
      return { x: 0, y: 0, w: padding * 2 + items(el).length * width, h: padding * 2 + height };
    const index =
      el.parentElement && isGroup(el.parentElement) ? items(el.parentElement).indexOf(el) : -1;
    return index < 0 ? null : { x: padding + index * width, y: padding, w: width, h: height };
  };
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const define = (name: string, value: PropertyDescriptor) => {
    saved.set(name, Object.getOwnPropertyDescriptor(proto, name));
    Object.defineProperty(proto, name, { configurable: true, ...value });
  };
  const read = (key: "x" | "y" | "w" | "h") => ({
    get(this: HTMLElement) {
      return box(this)?.[key] ?? 0;
    },
  });
  define("offsetLeft", read("x"));
  define("offsetTop", read("y"));
  define("offsetWidth", read("w"));
  define("offsetHeight", read("h"));
  const rect = Object.getOwnPropertyDescriptor(
    dom.window.Element.prototype,
    "getBoundingClientRect",
  );
  define("getBoundingClientRect", {
    value(this: HTMLElement) {
      const own = box(this);
      if (!own) return rect?.value.call(this);
      return new dom.window.DOMRect(left + own.x, top + own.y, own.w, own.h);
    },
  });
  return () => {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(proto, name, descriptor);
      else delete (proto as unknown as Record<string, unknown>)[name];
    }
  };
}
