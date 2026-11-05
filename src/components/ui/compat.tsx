import * as React from "react";
import { useRender } from "@base-ui/react/use-render";

/** Bridges existing host callbacks to Base UI's focus and dismissal contracts. */
export interface OverlayCallbacks {
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onPointerDownOutside?: (event: Event) => void;
  onInteractOutside?: (event: Event) => void;
}

export type AsChildProps = { asChild?: boolean };

export function childElement(children: React.ReactNode): React.ReactElement {
  const child = React.Children.only(children);
  if (!React.isValidElement(child)) throw new Error("asChild requires one React element");
  return child;
}

export function Slot({
  children,
  ref,
  ...props
}: React.HTMLAttributes<HTMLElement> & { ref?: React.Ref<HTMLElement> }) {
  return useRender({ render: childElement(children), props, ref });
}

export function usePopupRef(
  forwardedRef: React.Ref<HTMLDivElement> | undefined,
): readonly [React.RefObject<HTMLDivElement | null>, React.RefCallback<HTMLDivElement>] {
  const element = React.useRef<HTMLDivElement | null>(null);
  const ref = React.useCallback(
    (node: HTMLDivElement | null) => {
      element.current = node;
      if (typeof forwardedRef === "function") return forwardedRef(node);
      if (forwardedRef) forwardedRef.current = node;
    },
    [forwardedRef],
  );
  return [element, ref] as const;
}

export function focusCallback(
  handler?: (event: Event) => void,
  element?: React.RefObject<HTMLElement | null>,
) {
  if (!handler) return undefined;
  return () => {
    const event = new Event("autofocus", { cancelable: true });
    Object.defineProperties(event, {
      target: { value: element?.current ?? null },
      currentTarget: { value: element?.current ?? null },
    });
    handler(event);
    return !event.defaultPrevented;
  };
}

export interface DismissDetails {
  reason: string;
  event: Event;
  cancel: () => void;
}

export function allowDismiss(
  callbacks: OverlayCallbacks | null,
  open: boolean,
  details: DismissDetails,
) {
  if (open || !callbacks) return true;
  const original = details.event;
  const event =
    details.reason === "escape-key"
      ? new KeyboardEvent("keydown", { key: "Escape", cancelable: true })
      : new CustomEvent("interactoutside", {
          cancelable: true,
          detail: { originalEvent: original },
        });
  Object.defineProperty(event, "target", { value: original.target });
  if (details.reason === "escape-key") callbacks.onEscapeKeyDown?.(event as KeyboardEvent);
  if (details.reason === "outside-press") callbacks.onPointerDownOutside?.(event);
  if (details.reason === "outside-press" || details.reason === "focus-out")
    callbacks.onInteractOutside?.(event);
  if (!event.defaultPrevented) return true;
  details.cancel();
  return false;
}

export const DismissContext = React.createContext<React.RefObject<OverlayCallbacks | null> | null>(
  null,
);

export function useOverlayCallbacks(callbacks: OverlayCallbacks) {
  const context = React.useContext(DismissContext);
  React.useLayoutEffect(() => {
    if (!context) return;
    context.current = callbacks;
    return () => {
      context.current = null;
    };
  }, [
    context,
    callbacks.onEscapeKeyDown,
    callbacks.onPointerDownOutside,
    callbacks.onInteractOutside,
  ]);
}
