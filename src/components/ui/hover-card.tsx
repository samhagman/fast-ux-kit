"use client";

import * as React from "react";
import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "../../lib/utils.js";
import { Popover, PopoverContent, PopoverTrigger } from "./popover.js";
import { childElement } from "./compat.js";

const HoverCardHandle = React.createContext<{
  handle: ReturnType<typeof PopoverPrimitive.createHandle>;
  returningFocus: React.RefObject<boolean>;
} | null>(null);

function HoverCard({
  handle,
  children,
  onOpenChange,
  onOpenChangeComplete,
  ...props
}: PopoverPrimitive.Root.Props) {
  const [ownHandle] = React.useState(() => PopoverPrimitive.createHandle());
  const activeHandle = handle ?? ownHandle;
  const returningFocus = React.useRef(false);
  return (
    <HoverCardHandle.Provider value={{ handle: activeHandle, returningFocus }}>
      <Popover
        handle={activeHandle}
        {...props}
        onOpenChange={(open, details) => {
          onOpenChange?.(open, details);
          if (!details.isCanceled && !open && details.reason === "escape-key")
            returningFocus.current = true;
        }}
        onOpenChangeComplete={(open) => {
          onOpenChangeComplete?.(open);
          if (!open)
            requestAnimationFrame(() => {
              returningFocus.current = false;
            });
        }}
      >
        {children}
      </Popover>
    </HoverCardHandle.Provider>
  );
}

function HoverCardTrigger({
  asChild,
  children,
  id: suppliedId,
  onFocus,
  delay = 300,
  closeDelay = 150,
  href,
  target,
  rel,
  ...props
}: React.ComponentProps<typeof PopoverTrigger> &
  Pick<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "target" | "rel">) {
  const card = React.useContext(HoverCardHandle);
  const handle = card?.handle ?? props.handle;
  const generatedId = React.useId();
  const id = suppliedId ?? generatedId;
  const render = asChild ? (
    childElement(children)
  ) : href ? (
    <a href={href} target={target} rel={rel} />
  ) : (
    props.render
  );
  const nativeButton =
    props.nativeButton ??
    !(React.isValidElement(render) && typeof render.type === "string" && render.type !== "button");
  return (
    <PopoverTrigger
      {...props}
      id={id}
      handle={handle}
      render={render}
      nativeButton={nativeButton}
      openOnHover
      delay={delay}
      closeDelay={closeDelay}
      data-slot="hover-card-trigger"
      onFocus={(event) => {
        onFocus?.(event);
        if (card?.returningFocus.current) {
          card.returningFocus.current = false;
          return;
        }
        if (!event.defaultPrevented && event.currentTarget.matches(":focus-visible"))
          handle?.open(id);
      }}
    >
      {asChild ? undefined : children}
    </PopoverTrigger>
  );
}

function HoverCardContent({
  className,
  initialFocus = false,
  "aria-label": label = "Details",
  ...props
}: React.ComponentProps<typeof PopoverContent>) {
  return (
    <PopoverContent
      data-slot="hover-card-content"
      initialFocus={initialFocus}
      aria-label={label}
      className={cn("w-64", className)}
      {...props}
    />
  );
}

export { HoverCard, HoverCardTrigger, HoverCardContent };
