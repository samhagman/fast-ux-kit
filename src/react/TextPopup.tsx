"use client";
import { useLayoutEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { textareaCaretRect } from "./text-geometry.js";

/** A text-anchored layer shared by information and suggestions. It never takes input focus. */
export function TextPopup({
  anchor,
  offset,
  children,
  className,
  container,
  onPointerEnter,
  onPointerLeave,
}: {
  readonly anchor: HTMLTextAreaElement | null;
  readonly offset: number;
  readonly children: ReactNode;
  readonly className?: string;
  /** Keep nested editor overlays inside the host focus/stacking scope. */
  readonly container?: Element | null;
  readonly onPointerEnter?: () => void;
  readonly onPointerLeave?: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<CSSProperties>({
    position: "fixed",
    visibility: "hidden",
  });
  useLayoutEffect(() => {
    if (!anchor || !element.current) return;
    const doc = anchor.ownerDocument,
      win = doc.defaultView;
    if (!win) return;
    const place = () => {
      if (!element.current || !anchor.isConnected) return;
      const caret = textareaCaretRect(anchor, offset),
        bounds = element.current.getBoundingClientRect();
      const width = Math.min(384, win.innerWidth - 16),
        height = Math.min(bounds.height || 240, win.innerHeight - 16);
      const below = win.innerHeight - caret.bottom - 8,
        above = caret.top - 8;
      const top =
        below >= height || below >= above ? caret.bottom + 4 : Math.max(8, caret.top - height - 4);
      setPosition({
        position: "fixed",
        top: Math.max(8, Math.min(win.innerHeight - height - 8, top)),
        left: Math.max(8, Math.min(win.innerWidth - width - 8, caret.left)),
        width,
        maxHeight: Math.max(44, Math.max(below, above)),
        visibility: "visible",
        zIndex: "var(--fux-z-popover, 20)",
      });
    };
    place();
    doc.addEventListener("scroll", place, true);
    win.addEventListener("resize", place);
    const observer = win.ResizeObserver ? new win.ResizeObserver(place) : null;
    observer?.observe(anchor);
    observer?.observe(element.current);
    return () => {
      doc.removeEventListener("scroll", place, true);
      win.removeEventListener("resize", place);
      observer?.disconnect();
    };
  }, [anchor, offset, container]);
  if (!anchor) return null;
  return createPortal(
    <div
      ref={element}
      className={className}
      style={position}
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      {children}
    </div>,
    container ?? anchor.closest('[role="dialog"], dialog') ?? anchor.ownerDocument.body,
  );
}
