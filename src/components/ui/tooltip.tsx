"use client";

import * as React from "react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import { cn } from "../../lib/utils.js";
import { useScopedDirection } from "../../lib/direction.js";
import { childElement, type AsChildProps } from "./compat.js";

function TooltipProvider({
  delay,
  delayDuration = 0,
  skipDelayDuration,
  ...props
}: TooltipPrimitive.Provider.Props & { delayDuration?: number; skipDelayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay ?? delayDuration}
      timeout={skipDelayDuration}
      {...props}
    />
  );
}

const TooltipDescription = React.createContext<{
  id: string;
  setId: (id: string) => void;
  open: boolean;
} | null>(null);

function Tooltip({
  open,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: TooltipPrimitive.Root.Props) {
  const generatedId = React.useId();
  const [id, setId] = React.useState(generatedId);
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(defaultOpen);
  return (
    <TooltipDescription.Provider value={{ id, setId, open: open ?? uncontrolledOpen }}>
      <TooltipPrimitive.Root
        data-slot="tooltip"
        open={open}
        defaultOpen={defaultOpen}
        {...props}
        onOpenChange={(next, details) => {
          onOpenChange?.(next, details);
          if (!details.isCanceled) setUncontrolledOpen(next);
        }}
      >
        {children}
      </TooltipPrimitive.Root>
    </TooltipDescription.Provider>
  );
}

function TooltipTrigger({
  asChild,
  children,
  "aria-describedby": describedBy,
  ...props
}: TooltipPrimitive.Trigger.Props & AsChildProps) {
  const description = React.useContext(TooltipDescription);
  const ids =
    [describedBy, description?.open ? description.id : undefined].filter(Boolean).join(" ") ||
    undefined;
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      aria-describedby={ids}
      {...props}
      render={asChild ? childElement(children) : props.render}
    >
      {asChild ? undefined : children}
    </TooltipPrimitive.Trigger>
  );
}

function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  collisionPadding = 8,
  id,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<TooltipPrimitive.Positioner.Props, "align" | "alignOffset" | "side" | "sideOffset"> & {
    collisionPadding?: number;
  }) {
  const dir = useScopedDirection();
  const description = React.useContext(TooltipDescription);
  React.useLayoutEffect(() => {
    if (id) description?.setId(id);
  }, [id, description?.setId]);
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className="isolate z-50"
      >
        <TooltipPrimitive.Popup
          id={id ?? description?.id}
          role="tooltip"
          dir={dir}
          data-slot="tooltip-content"
          className={cn(
            "z-50 inline-flex w-fit max-w-xs origin-(--transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pe-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=inline-end]:slide-in-from-left-2 data-[side=inline-start]:slide-in-from-right-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            className,
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground data-[side=bottom]:top-1 data-[side=inline-end]:top-1/2! data-[side=inline-end]:-left-1 data-[side=inline-end]:-translate-y-1/2 data-[side=inline-start]:top-1/2! data-[side=inline-start]:-right-1 data-[side=inline-start]:-translate-y-1/2 data-[side=left]:top-1/2! data-[side=left]:-right-1 data-[side=left]:-translate-y-1/2 data-[side=right]:top-1/2! data-[side=right]:-left-1 data-[side=right]:-translate-y-1/2 data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
