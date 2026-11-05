"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { useRender } from "@base-ui/react/use-render";
import { useScopedDirection } from "../../lib/direction.js";
import { cn } from "../../lib/utils.js";
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

const AnchorContext = React.createContext<((element: HTMLElement | null) => void) | null>(null);
const PositionContext = React.createContext<HTMLElement | null>(null);

function Popover({ onOpenChange, ...props }: PopoverPrimitive.Root.Props) {
  const callbacks = React.useRef<OverlayCallbacks | null>(null);
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null);
  return (
    <AnchorContext.Provider value={setAnchor}>
      <PositionContext.Provider value={anchor}>
        <DismissContext.Provider value={callbacks}>
          <PopoverPrimitive.Root
            data-slot="popover"
            {...props}
            onOpenChange={(open, details) => {
              if (allowDismiss(callbacks.current, open, details)) onOpenChange?.(open, details);
            }}
          />
        </DismissContext.Provider>
      </PositionContext.Provider>
    </AnchorContext.Provider>
  );
}

function PopoverAnchor({
  asChild,
  children,
  ref,
  ...props
}: React.ComponentProps<"div"> & AsChildProps) {
  const setAnchor = React.useContext(AnchorContext);
  return useRender({
    defaultTagName: "div",
    render: asChild ? childElement(children) : undefined,
    ref: [ref ?? null, setAnchor],
    props: { ...props, children: asChild ? undefined : children, "data-slot": "popover-anchor" },
  });
}

function PopoverTrigger({
  asChild,
  children,
  ...props
}: PopoverPrimitive.Trigger.Props & AsChildProps) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      {...props}
      render={asChild ? childElement(children) : props.render}
    >
      {asChild ? undefined : children}
    </PopoverPrimitive.Trigger>
  );
}

function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 8,
  ref,
  onOpenAutoFocus,
  onCloseAutoFocus,
  onEscapeKeyDown,
  onPointerDownOutside,
  onInteractOutside,
  ...props
}: PopoverPrimitive.Popup.Props &
  OverlayCallbacks &
  Pick<PopoverPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
    collisionPadding?: number;
  }) {
  useOverlayCallbacks({ onEscapeKeyDown, onPointerDownOutside, onInteractOutside });
  const anchor = React.useContext(PositionContext);
  const dir = useScopedDirection();
  const [popupRef, setPopupRef] = usePopupRef(ref);
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        anchor={anchor ?? undefined}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className="isolate z-50"
      >
        <PopoverPrimitive.Popup
          ref={setPopupRef}
          dir={dir}
          initialFocus={focusCallback(onOpenAutoFocus, popupRef)}
          finalFocus={focusCallback(onCloseAutoFocus, popupRef)}
          data-slot="popover-content"
          className={cn(
            "z-50 flex w-72 origin-(--transform-origin) flex-col gap-2.5 rounded-lg bg-popover p-2.5 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden duration-100 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  );
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-0.5 text-sm", className)}
      {...props}
    />
  );
}

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  );
}

function PopoverDescription({ className, ...props }: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
};
