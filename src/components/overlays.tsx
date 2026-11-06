"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area";
import { GripHorizontalIcon, GripVerticalIcon, TriangleAlertIcon, XIcon } from "lucide-react";
import { Group, Panel, Separator as ResizeHandle } from "react-resizable-panels";
import { Button } from "./basic.js";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "./ui/dialog.js";
import { HoverCardContent as HoverCardContentPrimitive } from "./ui/hover-card.js";
import { PopoverContent as PopoverContentPrimitive } from "./ui/popover.js";
import { ScrollBar } from "./ui/scroll-area.js";
import { Separator as SeparatorPrimitive } from "./ui/separator.js";
import { SheetContent as SheetContentPrimitive } from "./ui/sheet.js";
import { Kbd } from "./ui/kbd.js";
import { Toggle } from "./ui/toggle.js";
import { ToggleGroup, ToggleGroupItem } from "./ui/toggle-group.js";
import { TooltipContent as TooltipContentPrimitive } from "./ui/tooltip.js";
import { cn } from "../lib/utils.js";

export {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
  DialogClose,
} from "./ui/dialog.js";
export {
  Popover,
  PopoverTrigger,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
} from "./ui/popover.js";
export { Tooltip, TooltipTrigger, TooltipProvider } from "./ui/tooltip.js";
export {
  Sheet,
  SheetTrigger,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
  SheetClose,
} from "./ui/sheet.js";
export {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose,
} from "./ui/drawer.js";
export { HoverCard, HoverCardTrigger } from "./ui/hover-card.js";
export { ScrollBar } from "./ui/scroll-area.js";

/** A pressed toggle reads as selected: a signal tint instead of the hover grey. */
const pressed =
  "aria-pressed:bg-signal-muted aria-pressed:text-signal data-pressed:bg-signal-muted data-pressed:text-signal aria-pressed:hover:bg-signal-muted data-pressed:hover:bg-signal-muted";

export function ToggleButton({ className, ...props }: React.ComponentProps<typeof Toggle>) {
  return <Toggle {...props} className={cn(pressed, className)} />;
}

/** Items share borders by default, like a segmented control. */
export function ToggleButtonGroup({
  variant = "outline",
  spacing = 0,
  ...props
}: React.ComponentProps<typeof ToggleGroup>) {
  return <ToggleGroup variant={variant} spacing={spacing} {...props} />;
}
export function ToggleButtonGroupItem({
  className,
  ...props
}: React.ComponentProps<typeof ToggleGroupItem>) {
  return <ToggleGroupItem {...props} className={cn(pressed, className)} />;
}

/** The popover surface sits a little further from its trigger and casts a larger shadow. */
export function PopoverContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof PopoverContentPrimitive>) {
  return (
    <PopoverContentPrimitive
      sideOffset={sideOffset}
      className={cn("shadow-lg", className)}
      {...props}
    />
  );
}

export function HoverCardContent({
  className,
  sideOffset = 8,
  ...props
}: React.ComponentProps<typeof HoverCardContentPrimitive>) {
  return (
    <HoverCardContentPrimitive
      sideOffset={sideOffset}
      className={cn("w-72 gap-3 p-3 shadow-lg", className)}
      {...props}
    />
  );
}

export interface TooltipContentProps extends React.ComponentProps<typeof TooltipContentPrimitive> {
  /** Keys of a keyboard shortcut, shown after the label as key caps. */
  shortcut?: string | readonly string[];
}
export function TooltipContent({ shortcut, children, ...props }: TooltipContentProps) {
  const keys = typeof shortcut === "string" ? [shortcut] : shortcut;
  return (
    <TooltipContentPrimitive {...props}>
      {children}
      {keys?.length ? (
        <span className="ms-1 inline-flex items-center gap-0.5" data-slot="tooltip-shortcut">
          {keys.map((key) => (
            <Kbd key={key}>{key}</Kbd>
          ))}
        </span>
      ) : null}
    </TooltipContentPrimitive>
  );
}

const sheetSizes = {
  sm: "data-[side=left]:sm:max-w-xs data-[side=right]:sm:max-w-xs",
  md: "data-[side=left]:sm:max-w-sm data-[side=right]:sm:max-w-sm",
  lg: "data-[side=left]:sm:max-w-lg data-[side=right]:sm:max-w-lg",
} as const;
export function SheetContent({
  size = "md",
  className,
  ...props
}: React.ComponentProps<typeof SheetContentPrimitive> & { size?: keyof typeof sheetSizes }) {
  return <SheetContentPrimitive className={cn(sheetSizes[size], className)} {...props} />;
}

export function Separator({
  className,
  children,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive>) {
  if (!children || orientation === "vertical")
    return (
      <SeparatorPrimitive
        className={className}
        orientation={orientation}
        decorative={decorative}
        {...props}
      />
    );
  // A labelled divider ("or", "Today"): two rules around a short caption.
  return (
    <div
      role={decorative ? "none" : "separator"}
      className={cn(
        "flex w-full items-center gap-3 text-xs font-medium tracking-wide text-muted-foreground uppercase",
        className,
      )}
    >
      <SeparatorPrimitive className="flex-1" />
      <span>{children}</span>
      <SeparatorPrimitive className="flex-1" />
    </div>
  );
}

const dialogSizes = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-xl" } as const;
export interface ModalDialogProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: React.ReactNode;
  /** The widest the dialog grows on larger screens. */
  size?: keyof typeof dialogSizes;
  /** `destructive` adds a warning mark beside the title, for confirming something irreversible. */
  variant?: "default" | "destructive";
}
export function ModalDialog({
  title,
  description,
  children,
  open,
  onOpenChange,
  footer,
  size = "md",
  variant = "default",
}: ModalDialogProps) {
  const destructive = variant === "destructive";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={dialogSizes[size]} data-variant={variant}>
        <DialogHeader className={cn(destructive && "flex-row items-start gap-3")}>
          {destructive && (
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive"
            >
              <TriangleAlertIcon className="size-4.5" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1.5 pe-8">
            <DialogTitle className="text-balance">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-pretty">{description}</DialogDescription>
            )}
          </div>
        </DialogHeader>
        <div className="fux-dialog-body">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

const avatarSizes = {
  xs: { box: "size-5 text-[9px]", dot: "size-1.5 ring-1" },
  sm: { box: "size-7 text-[11px]", dot: "size-2 ring-[1.5px]" },
  md: { box: "size-9 text-xs", dot: "size-2.5 ring-2" },
  lg: { box: "size-12 text-sm", dot: "size-3 ring-2" },
  xl: { box: "size-16 text-lg", dot: "size-4 ring-2" },
} as const;
const statusDots = {
  online: "bg-success",
  away: "bg-warning",
  busy: "bg-destructive",
  offline: "bg-muted-foreground/60",
} as const;
export type AvatarSize = keyof typeof avatarSizes;
export type AvatarStatus = keyof typeof statusDots;
const AvatarGroupContext = React.createContext<AvatarSize | null>(null);

export interface AvatarProps {
  src?: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
  /** xs, sm, md (default), lg or xl. */
  size?: AvatarSize;
  /** A presence dot at the bottom corner. */
  status?: AvatarStatus;
}
export function Avatar({ src, alt, fallback, className, size, status }: AvatarProps) {
  const grouped = React.useContext(AvatarGroupContext);
  const scale = avatarSizes[size ?? grouped ?? "md"];
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn(
        "relative inline-flex shrink-0 align-middle select-none after:pointer-events-none after:absolute after:inset-0 after:rounded-full after:ring-1 after:ring-foreground/10 after:ring-inset",
        scale.box,
        className,
      )}
    >
      <AvatarPrimitive.Image
        src={src}
        alt={alt}
        data-slot="avatar-image"
        className="size-full rounded-full object-cover"
      />
      <AvatarPrimitive.Fallback
        data-slot="avatar-fallback"
        className="flex size-full items-center justify-center rounded-full bg-muted font-medium text-muted-foreground uppercase"
      >
        {fallback ??
          alt
            .split(/\s+/)
            .map((word) => word[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")}
      </AvatarPrimitive.Fallback>
      {status && (
        <span
          data-slot="avatar-status"
          data-status={status}
          className={cn(
            "absolute end-0 bottom-0 rounded-full ring-background",
            scale.dot,
            statusDots[status],
          )}
        >
          <span className="sr-only">{status}</span>
        </span>
      )}
    </AvatarPrimitive.Root>
  );
}

export interface AvatarGroupProps {
  children: React.ReactNode;
  /** Show at most this many avatars, then a "+N" count. */
  max?: number;
  size?: AvatarSize;
  className?: string;
  label?: string;
}
/** Overlapping avatars; each one is separated from its neighbour by a ring in the page colour. */
export function AvatarGroup({ children, max, size = "md", className, label }: AvatarGroupProps) {
  const items = React.Children.toArray(children);
  const shown = max === undefined ? items : items.slice(0, max);
  const hidden = items.length - shown.length;
  return (
    <AvatarGroupContext.Provider value={size}>
      <div
        role="group"
        aria-label={label}
        data-slot="avatar-group"
        className={cn(
          "flex items-center *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background",
          size === "xs" || size === "sm"
            ? "-space-x-1"
            : size === "xl"
              ? "-space-x-3"
              : "-space-x-2",
          className,
        )}
      >
        {shown}
        {hidden > 0 && (
          <span
            data-slot="avatar"
            className={cn(
              "relative inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground tabular-nums",
              avatarSizes[size].box,
            )}
          >
            +{hidden}
          </span>
        )}
      </div>
    </AvatarGroupContext.Provider>
  );
}

export interface ScrollAreaProps extends React.ComponentProps<typeof ScrollAreaPrimitive.Root> {
  /** Which scrollbars to offer. */
  orientation?: "vertical" | "horizontal" | "both";
}
const thumb =
  "[&_[data-slot=scroll-area-thumb]]:bg-foreground/20 hover:[&_[data-slot=scroll-area-thumb]]:bg-foreground/35";
export function ScrollArea({
  className,
  children,
  orientation = "vertical",
  ...props
}: ScrollAreaProps) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      {orientation !== "horizontal" && <ScrollBar className={thumb} />}
      {orientation !== "vertical" && <ScrollBar orientation="horizontal" className={thumb} />}
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

export interface SplitterHandleProps extends React.ComponentProps<typeof ResizeHandle> {
  /** Show the grip in the middle of the handle. */
  grip?: boolean;
}
function SplitterHandle({ grip = true, className, children, ...props }: SplitterHandleProps) {
  return (
    <ResizeHandle
      {...props}
      className={cn(
        "group/splitter relative z-10 flex shrink-0 items-center justify-center bg-border outline-none motion-safe:transition-colors",
        // The drawn line is one pixel; the pointer target is wider, and wider still on touch.
        "aria-[orientation=vertical]:w-px aria-[orientation=vertical]:cursor-col-resize aria-[orientation=vertical]:after:absolute aria-[orientation=vertical]:after:inset-y-0 aria-[orientation=vertical]:after:-inset-x-1.5",
        "aria-[orientation=horizontal]:h-px aria-[orientation=horizontal]:w-full aria-[orientation=horizontal]:cursor-row-resize aria-[orientation=horizontal]:after:absolute aria-[orientation=horizontal]:after:-inset-y-1.5 aria-[orientation=horizontal]:after:inset-x-0",
        "data-[separator=hover]:bg-signal/50 data-[separator=active]:bg-signal data-[separator=focus]:bg-signal",
        "focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
    >
      {children ??
        (grip && (
          <span
            aria-hidden="true"
            className="pointer-events-none flex items-center justify-center rounded-sm border bg-card text-muted-foreground shadow-xs motion-safe:transition-colors group-aria-[orientation=vertical]/splitter:h-6 group-aria-[orientation=vertical]/splitter:w-3.5 group-aria-[orientation=horizontal]/splitter:h-3.5 group-aria-[orientation=horizontal]/splitter:w-6 group-data-[separator=active]/splitter:border-signal group-data-[separator=active]/splitter:bg-signal group-data-[separator=active]/splitter:text-signal-foreground group-data-[separator=hover]/splitter:text-foreground"
          >
            <GripVerticalIcon className="size-3 group-aria-[orientation=horizontal]/splitter:hidden" />
            <GripHorizontalIcon className="hidden size-3 group-aria-[orientation=horizontal]/splitter:block" />
          </span>
        ))}
    </ResizeHandle>
  );
}
export const Splitter = { Root: Group, Panel, Handle: SplitterHandle };

export function DismissButton({
  onClick,
  label = "Close",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <Button variant="ghost" size="icon" onClick={onClick} aria-label={label}>
      <XIcon />
    </Button>
  );
}
