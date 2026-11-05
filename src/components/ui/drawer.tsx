"use client";

import * as React from "react";
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer";
import { cn } from "../../lib/utils.js";
import { useScopedDirection } from "../../lib/direction.js";
import {
  childElement,
  focusCallback,
  usePopupRef,
  allowDismiss,
  DismissContext,
  useOverlayCallbacks,
  type OverlayCallbacks,
  type AsChildProps,
} from "./compat.js";

const DrawerContext = React.createContext({ direction: "bottom", autoFocus: true });

type DrawerProps = Omit<DrawerPrimitive.Root.Props, "children"> & {
  children?: React.ReactNode;
  direction?: "top" | "right" | "bottom" | "left";
  autoFocus?: boolean;
  repositionInputs?: boolean;
};

function Drawer({
  direction = "bottom",
  autoFocus = true,
  repositionInputs = true,
  onOpenChange,
  children,
  ...props
}: DrawerProps) {
  const callbacks = React.useRef<OverlayCallbacks | null>(null);
  const drawer = (
    <DrawerPrimitive.Root
      {...props}
      swipeDirection={direction === "bottom" ? "down" : direction === "top" ? "up" : direction}
      onOpenChange={(open, details) => {
        if (allowDismiss(callbacks.current, open, details)) onOpenChange?.(open, details);
      }}
    >
      {repositionInputs ? (
        <DrawerPrimitive.VirtualKeyboardProvider>
          {children}
        </DrawerPrimitive.VirtualKeyboardProvider>
      ) : (
        children
      )}
    </DrawerPrimitive.Root>
  );
  return (
    <DrawerContext.Provider value={{ direction, autoFocus }}>
      <DismissContext.Provider value={callbacks}>{drawer}</DismissContext.Provider>
    </DrawerContext.Provider>
  );
}

function DrawerTrigger({
  asChild,
  children,
  ...props
}: DrawerPrimitive.Trigger.Props & AsChildProps) {
  return (
    <DrawerPrimitive.Trigger
      data-slot="drawer-trigger"
      {...props}
      render={asChild ? childElement(children) : props.render}
    >
      {asChild ? undefined : children}
    </DrawerPrimitive.Trigger>
  );
}
function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal {...props} />;
}
function DrawerClose({ asChild, children, ...props }: DrawerPrimitive.Close.Props & AsChildProps) {
  return (
    <DrawerPrimitive.Close
      data-slot="drawer-close"
      {...props}
      render={asChild ? childElement(children) : props.render}
    >
      {asChild ? undefined : children}
    </DrawerPrimitive.Close>
  );
}
function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-50 bg-black/10 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}
function DrawerContent({
  className,
  children,
  ref,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: DrawerPrimitive.Popup.Props & OverlayCallbacks) {
  const { direction, autoFocus } = React.useContext(DrawerContext);
  const dir = useScopedDirection();
  const [popupRef, setPopupRef] = usePopupRef(ref);
  useOverlayCallbacks({ onEscapeKeyDown, onPointerDownOutside, onInteractOutside });
  return (
    <DrawerPortal>
      <DrawerOverlay />
      <DrawerPrimitive.Viewport className="pointer-events-none fixed inset-0 z-50">
        <DrawerPrimitive.Popup
          ref={setPopupRef}
          data-slot="drawer-content"
          data-direction={direction}
          dir={dir}
          initialFocus={focusCallback(onOpenAutoFocus, popupRef) ?? autoFocus}
          finalFocus={focusCallback(onCloseAutoFocus, popupRef)}
          className={cn(
            "group/drawer-content pointer-events-auto fixed flex flex-col bg-popover text-sm text-popover-foreground outline-none transition-transform duration-200 data-swiping:transition-none data-[direction=bottom]:inset-x-0 data-[direction=bottom]:bottom-0 data-[direction=bottom]:max-h-[80dvh] data-[direction=bottom]:rounded-t-xl data-[direction=bottom]:border-t data-[direction=bottom]:[transform:translateY(calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y,0px)))] data-[direction=bottom]:data-starting-style:translate-y-full data-[direction=bottom]:data-ending-style:translate-y-full data-[direction=top]:inset-x-0 data-[direction=top]:top-0 data-[direction=top]:max-h-[80dvh] data-[direction=top]:rounded-b-xl data-[direction=top]:border-b data-[direction=top]:[transform:translateY(var(--drawer-swipe-movement-y,0px))] data-[direction=top]:data-starting-style:-translate-y-full data-[direction=top]:data-ending-style:-translate-y-full data-[direction=left]:inset-y-0 data-[direction=left]:left-0 data-[direction=left]:w-3/4 data-[direction=left]:max-w-sm data-[direction=left]:border-e data-[direction=left]:[transform:translateX(var(--drawer-swipe-movement-x,0px))] data-[direction=left]:data-starting-style:-translate-x-full data-[direction=left]:data-ending-style:-translate-x-full data-[direction=right]:inset-y-0 data-[direction=right]:right-0 data-[direction=right]:w-3/4 data-[direction=right]:max-w-sm data-[direction=right]:border-s data-[direction=right]:[transform:translateX(var(--drawer-swipe-movement-x,0px))] data-[direction=right]:data-starting-style:translate-x-full data-[direction=right]:data-ending-style:translate-x-full motion-reduce:transition-none",
            className,
          )}
          {...props}
        >
          <div
            aria-hidden="true"
            className="mx-auto mt-4 hidden h-1 w-24 shrink-0 rounded-full bg-muted group-data-[direction=bottom]/drawer-content:block"
          />
          <DrawerPrimitive.Content className="flex min-h-0 flex-1 flex-col">
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  );
}
function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex flex-col gap-0.5 p-4", className)}
      {...props}
    />
  );
}
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  );
}
function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("font-heading text-base font-medium text-foreground", className)}
      {...props}
    />
  );
}
function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Drawer,
  DrawerTrigger,
  DrawerPortal,
  DrawerClose,
  DrawerOverlay,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
