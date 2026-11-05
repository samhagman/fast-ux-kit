"use client";

import * as React from "react";
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
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
export { Popover, PopoverTrigger, PopoverContent } from "./ui/popover.js";
export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "./ui/tooltip.js";
export {
  Sheet,
  SheetTrigger,
  SheetContent,
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
export { HoverCard, HoverCardTrigger, HoverCardContent } from "./ui/hover-card.js";
export { ScrollArea, ScrollBar } from "./ui/scroll-area.js";
export { Separator } from "./ui/separator.js";
export { Toggle as ToggleButton } from "./ui/toggle.js";
export {
  ToggleGroup as ToggleButtonGroup,
  ToggleGroupItem as ToggleButtonGroupItem,
} from "./ui/toggle-group.js";

export interface ModalDialogProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  footer?: React.ReactNode;
}
export function ModalDialog({
  title,
  description,
  children,
  open,
  onOpenChange,
  footer,
}: ModalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="fux-dialog-body">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

export interface AvatarProps {
  src?: string;
  alt: string;
  fallback?: React.ReactNode;
  className?: string;
}
export function Avatar({ src, alt, fallback, className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root className={cn("fux-avatar", className)}>
      <AvatarPrimitive.Image src={src} alt={alt} className="fux-avatar-image" />
      <AvatarPrimitive.Fallback className="fux-avatar-fallback">
        {fallback ??
          alt
            .split(/\s+/)
            .map((word) => word[0])
            .slice(0, 2)
            .join("")}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

function SplitterHandle(props: React.ComponentProps<typeof ResizeHandle>) {
  return <ResizeHandle {...props} className={cn("fux-splitter-handle", props.className)} />;
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
      ×
    </Button>
  );
}
