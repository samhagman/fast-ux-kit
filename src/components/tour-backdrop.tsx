"use client";
import { Tour as OwnerTour, useTourContext } from "@ark-ui/react/tour";
import {
  cloneElement,
  forwardRef,
  isValidElement,
  useCallback,
  useLayoutEffect,
  useState,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type RefCallback,
} from "react";

/** Match the owner's document-space mask without replacing its placement or cutout. */
export const TourBackdrop: typeof OwnerTour.Backdrop = forwardRef<
  HTMLDivElement,
  ComponentPropsWithoutRef<typeof OwnerTour.Backdrop>
>(function TourBackdrop({ className, style, ...props }, forwardedRef) {
  const tour = useTourContext();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [height, setHeight] = useState<number>();
  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      if (typeof forwardedRef === "function") {
        const callback: RefCallback<HTMLDivElement> = forwardedRef;
        const cleanup = callback(node);
        if (typeof cleanup === "function")
          return () => {
            setElement(null);
            cleanup();
          };
      } else if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  const childStyle =
    props.asChild && isValidElement<{ style?: CSSProperties }>(props.children)
      ? props.children.props.style
      : undefined;
  const autoSize =
    tour.open &&
    tour.step?.type === "tooltip" &&
    tour.step.backdrop !== false &&
    style?.height == null &&
    style?.blockSize == null &&
    childStyle?.height == null &&
    childStyle?.blockSize == null;

  useLayoutEffect(() => {
    if (!autoSize || !element) return;
    const document = element.ownerDocument;
    const window = document.defaultView;
    if (!window) return;
    let active = true;
    let frame: number | null = null;
    const measure = () => {
      frame = null;
      if (!active || !element.isConnected) return;
      // The absolutely positioned backdrop itself contributes to scrollHeight.
      // Exclude it for this synchronous read so a shorter document can shrink it.
      const previous = element.style.getPropertyValue("height");
      const priority = element.style.getPropertyPriority("height");
      let next: number;
      try {
        element.style.setProperty("height", "0px");
        next = Math.max(document.documentElement.scrollHeight, window.innerHeight);
      } finally {
        if (previous) element.style.setProperty("height", previous, priority);
        else element.style.removeProperty("height");
      }
      setHeight((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (active && frame === null) frame = window.requestAnimationFrame(measure);
    };
    const resize =
      typeof window.ResizeObserver === "function" ? new window.ResizeObserver(schedule) : null;
    resize?.observe(document.documentElement);
    if (document.body) resize?.observe(document.body);
    // Absolutely positioned content may change scroll extent without resizing
    // body/root border boxes. Ignore our own writes and non-layout ARIA/state noise.
    const mutation =
      typeof window.MutationObserver === "function"
        ? new window.MutationObserver((records) => {
            if (
              records.some(
                (record) => record.target !== element && !element.contains(record.target),
              )
            )
              schedule();
          })
        : null;
    mutation?.observe(document.documentElement, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });
    window.addEventListener("resize", schedule);
    document.addEventListener("load", schedule, true);
    measure();
    return () => {
      active = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation?.disconnect();
      window.removeEventListener("resize", schedule);
      document.removeEventListener("load", schedule, true);
    };
  }, [autoSize, element]);

  // Ark merges asChild styles last. An absent value is not an explicit sizing
  // override, including when a consumer constructs a style with height: undefined.
  let children = props.children;
  if (
    autoSize &&
    childStyle &&
    "height" in childStyle &&
    isValidElement<{ style?: CSSProperties }>(children)
  ) {
    const { height: _height, ...remainingStyle } = childStyle;
    children = cloneElement(children, { style: remainingStyle });
  }

  return (
    <OwnerTour.Backdrop
      {...props}
      children={children}
      ref={attach}
      className={`fux-ark fux-tour__backdrop ${className ?? ""}`.trim()}
      style={{ ...style, ...(autoSize && height !== undefined ? { height } : {}) }}
    />
  );
});
