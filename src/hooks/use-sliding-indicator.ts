import * as React from "react";

// Layout offsets lose sub-pixel precision; a projected rect is precise but follows transforms.
// When the two agree within rounding, the rect is safe to use.
const LAYOUT_ROUNDING = 2;

/** A transform's scale on the group; layout sizes are whole pixels, so within one it is none. */
function scale(projected: number, layout: number) {
  return layout > 0 && Math.abs(projected - layout) > 1 ? projected / layout : 1;
}

/** The selected item's box in the group's padding-box coordinates, as indicator variables. */
function locate(root: HTMLElement, item: HTMLElement) {
  // offsetLeft/offsetTop are measured from the group's padding edge, the same origin an
  // absolutely placed child uses, and they are physical, so the box holds in both directions.
  let left = item.offsetLeft;
  let top = item.offsetTop;
  let width = item.offsetWidth;
  let height = item.offsetHeight;
  const rootRect = root.getBoundingClientRect();
  const itemRect = item.getBoundingClientRect();
  const scaleX = scale(rootRect.width, root.offsetWidth);
  const scaleY = scale(rootRect.height, root.offsetHeight);
  const preciseLeft = (itemRect.left - rootRect.left) / scaleX - root.clientLeft;
  const preciseTop = (itemRect.top - rootRect.top) / scaleY - root.clientTop;
  if (
    Math.abs(preciseLeft - left) <= LAYOUT_ROUNDING &&
    Math.abs(preciseTop - top) <= LAYOUT_ROUNDING
  ) {
    left = preciseLeft;
    top = preciseTop;
    width = itemRect.width / scaleX;
    height = itemRect.height / scaleY;
  }
  return {
    "--fux-indicator-x": `${left}px`,
    "--fux-indicator-y": `${top}px`,
    "--fux-indicator-width": `${width}px`,
    "--fux-indicator-height": `${height}px`,
    // The indicator takes the selected item's corners, so it keeps the item's shape.
    "--fux-indicator-radius": getComputedStyle(item).borderRadius,
  };
}

/**
 * Measures the selected item of a group so one indicator can slide between the items. `selector`
 * finds the selected item inside `root`; `null` turns the indicator off. The measured box is
 * written as `--fux-indicator-*` variables on `target` (the group itself when omitted), which the
 * `fux-sliding-indicator` and `fux-sliding-group` styles read.
 *
 * Returns whether the indicator is placed. It is false on the server and on the first client
 * render, so hydration matches, and the caller keeps the item's own selected look until then.
 */
export function useSlidingIndicator(
  root: React.RefObject<HTMLElement | null>,
  selector: string | null,
  dependencies: React.DependencyList,
  target?: React.RefObject<HTMLElement | null>,
) {
  const [placed, setPlaced] = React.useState(false);
  // The caller lists what can move the selection or the items.
  React.useLayoutEffect(() => {
    const group = root.current;
    const host = target ? target.current : group;
    if (!group || !host || !selector) {
      setPlaced(false);
      return;
    }
    const measure = () => {
      const item = group.querySelector<HTMLElement>(selector);
      if (item) {
        for (const [name, value] of Object.entries(locate(group, item))) {
          if (host.style.getPropertyValue(name) !== value) host.style.setProperty(name, value);
        }
      }
      setPlaced(item !== null);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // An item can change size inside a group that does not (a fixed-width group, a new label).
    const observer = new ResizeObserver(measure);
    observer.observe(group);
    for (const child of Array.from(group.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [root, target, selector, ...dependencies]);
  return placed;
}
