"use client";

import * as React from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import type SignatureEngine from "signature_pad";
import type { PointGroup } from "signature_pad";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CropIcon,
  DownloadIcon,
  EraserIcon,
  GripVerticalIcon,
  KeyboardIcon,
  MinusIcon,
  PenLineIcon,
  PlusIcon,
  RotateCcwIcon,
  RotateCwIcon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { Button, Field, Slider } from "./basic.js";
import { cn } from "../lib/utils.js";

export interface ImageCropValue {
  crop: Point;
  zoom: number;
  rotation: number;
}

export interface ImageCropperProps {
  src: string;
  alt: string;
  aspect?: number;
  value?: ImageCropValue;
  defaultValue?: ImageCropValue;
  onValueChange?: (value: ImageCropValue) => void;
  onCropComplete?: (area: Area, pixels: Area) => void;
  onExport?: (image: Blob) => void;
  onError?: (error: Error) => void;
  className?: string;
}

const initialCrop: ImageCropValue = { crop: { x: 0, y: 0 }, zoom: 1, rotation: 0 };

/** Export the selected rectangle from the rotated image's bounding box. */
export async function cropImage(src: string, area: Area, rotation = 0): Promise<Blob> {
  if (
    ![area.x, area.y, area.width, area.height, rotation].every(Number.isFinite) ||
    area.width < 1 ||
    area.height < 1 ||
    area.x < 0 ||
    area.y < 0
  ) {
    throw new Error("The crop must be a finite, positive image rectangle.");
  }
  const image = new Image();
  image.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("The image could not be loaded for export."));
    image.src = src;
  });
  const radians = (rotation * Math.PI) / 180;
  const width = Math.ceil(
    Math.abs(Math.cos(radians)) * image.naturalWidth +
      Math.abs(Math.sin(radians)) * image.naturalHeight -
      1e-8,
  );
  const height = Math.ceil(
    Math.abs(Math.sin(radians)) * image.naturalWidth +
      Math.abs(Math.cos(radians)) * image.naturalHeight -
      1e-8,
  );
  if (area.x + area.width > width + 1 || area.y + area.height > height + 1)
    throw new Error("The crop extends beyond the image.");
  const rotated = document.createElement("canvas");
  rotated.width = width;
  rotated.height = height;
  const context = rotated.getContext("2d");
  if (!context) throw new Error("Image export needs a canvas context.");
  context.translate(width / 2, height / 2);
  context.rotate(radians);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  const output = document.createElement("canvas");
  output.width = Math.round(area.width);
  output.height = Math.round(area.height);
  const cropped = output.getContext("2d");
  if (!cropped) throw new Error("Image export needs a canvas context.");
  cropped.drawImage(
    rotated,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    output.width,
    output.height,
  );
  return new Promise((resolve, reject) =>
    output.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("The image could not be encoded."))),
      "image/png",
    ),
  );
}

export function ImageCropper({
  src,
  alt,
  aspect = 1,
  value,
  defaultValue = initialCrop,
  onValueChange,
  onCropComplete,
  onExport,
  onError,
  className,
}: ImageCropperProps) {
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  if (
    !Number.isFinite(aspect) ||
    aspect <= 0 ||
    ![current.crop.x, current.crop.y, current.zoom, current.rotation].every(Number.isFinite) ||
    current.zoom < 1 ||
    current.zoom > 3
  ) {
    throw new Error("ImageCropper requires a positive aspect ratio and a zoom between 1 and 3.");
  }
  const cropRef = React.useRef(current);
  cropRef.current = current;
  const pixels = React.useRef<{ src: string; area: Area } | null>(null);
  const generation = React.useRef(0);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [selection, setSelection] = React.useState<{ width: number; height: number } | null>(null);
  React.useEffect(() => {
    generation.current++;
    setBusy(false);
    setError("");
    return () => {
      generation.current++;
    };
  }, [src]);
  function change(patch: Partial<ImageCropValue>) {
    const next = { ...cropRef.current, ...patch };
    cropRef.current = next;
    if (value === undefined) setOwn(next);
    onValueChange?.(next);
  }
  async function exportCrop() {
    if (!pixels.current || pixels.current.src !== src || busy) return;
    const request = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const blob = await cropImage(src, pixels.current.area, current.rotation);
      if (request === generation.current) onExport?.(blob);
    } catch (reason) {
      if (request === generation.current) {
        const failure = reason instanceof Error ? reason : new Error(String(reason));
        setError(failure.message);
        onError?.(failure);
      }
    } finally {
      if (request === generation.current) setBusy(false);
    }
  }
  const rotate = (turn: number) => change({ rotation: (current.rotation + turn + 360) % 360 });
  const zoomBy = (step: number) =>
    change({ zoom: Math.min(3, Math.max(1, Math.round((current.zoom + step) * 100) / 100)) });
  return (
    <section
      aria-label={`Crop ${alt}`}
      className={cn("flex min-w-0 flex-col gap-3 text-sm text-foreground", className)}
    >
      <div className="overflow-hidden rounded-xl border bg-card shadow-xs">
        <div
          role="group"
          tabIndex={0}
          aria-label={`Crop ${alt}. Use arrow keys to position the image.`}
          className="relative h-72 touch-none bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:ring-inset"
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            const distance = event.shiftKey ? 10 : 1;
            const x =
              event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
            const y =
              event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
            if (x || y) {
              event.preventDefault();
              change({ crop: { x: current.crop.x + x, y: current.crop.y + y } });
            }
          }}
        >
          <Cropper
            image={src}
            crop={current.crop}
            zoom={current.zoom}
            rotation={current.rotation}
            aspect={aspect}
            style={{ cropAreaStyle: { border: "2px solid rgb(255 255 255 / 0.92)" } }}
            onCropChange={(crop) => change({ crop })}
            onZoomChange={(zoom) => change({ zoom })}
            onRotationChange={(rotation) => change({ rotation })}
            mediaProps={{
              alt,
              onError: () => {
                const failure = new Error("The image could not be loaded.");
                setError(failure.message);
                onError?.(failure);
              },
            }}
            onCropComplete={(area, rectangle) => {
              pixels.current = { src, area: rectangle };
              setSelection({
                width: Math.round(rectangle.width),
                height: Math.round(rectangle.height),
              });
              onCropComplete?.(area, rectangle);
            }}
          />
        </div>
        <div
          role="group"
          aria-label="Crop tools"
          className="flex flex-wrap items-center gap-1 border-t bg-muted/40 p-1.5"
        >
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rotate left"
            title="Rotate left"
            onClick={() => rotate(-90)}
          >
            <RotateCcwIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Rotate right"
            title="Rotate right"
            onClick={() => rotate(90)}
          >
            <RotateCwIcon />
          </Button>
          <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom out"
            title="Zoom out"
            disabled={current.zoom <= 1}
            onClick={() => zoomBy(-0.25)}
          >
            <ZoomOutIcon />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Zoom in"
            title="Zoom in"
            disabled={current.zoom >= 3}
            onClick={() => zoomBy(0.25)}
          >
            <ZoomInIcon />
          </Button>
          <span className="ms-auto pe-2 font-mono text-xs text-muted-foreground tabular-nums">
            {current.zoom.toFixed(2)}x · {Math.round(current.rotation)}°
          </span>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider
          label="Zoom"
          min={1}
          max={3}
          step={0.05}
          value={current.zoom}
          onValueChange={(zoom) => change({ zoom: Number(zoom) })}
        />
        <Slider
          label="Rotation"
          min={0}
          max={360}
          step={1}
          value={current.rotation}
          onValueChange={(rotation) => change({ rotation: Number(rotation) })}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" onClick={() => change(initialCrop)}>
          <RotateCcwIcon data-icon="inline-start" />
          Reset crop
        </Button>
        {onExport && (
          <Button disabled={busy} onClick={exportCrop}>
            <CropIcon data-icon="inline-start" />
            {busy ? "Exporting…" : "Crop image"}
          </Button>
        )}
        {selection && (
          <span className="ms-auto font-mono text-xs text-muted-foreground tabular-nums">
            {selection.width} × {selection.height} px
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

export interface SignatureValue {
  mode: "draw" | "type";
  text: string;
  width: number;
  height: number;
  strokes: PointGroup[];
}
export interface SignaturePadHandle {
  clear(): void;
  undo(): void;
  export(): Promise<Blob>;
}
export interface SignaturePadProps {
  label: string;
  value?: SignatureValue;
  defaultValue?: SignatureValue;
  onValueChange?: (value: SignatureValue) => void;
  onExport?: (image: Blob) => void;
  disabled?: boolean;
  className?: string;
  ref?: React.Ref<SignaturePadHandle>;
}
const emptySignature: SignatureValue = {
  mode: "draw",
  text: "",
  width: 640,
  height: 180,
  strokes: [],
};

export function SignaturePad({
  label,
  value,
  defaultValue = emptySignature,
  onValueChange,
  onExport,
  disabled,
  className,
  ref,
}: SignaturePadProps) {
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  const currentRef = React.useRef(current);
  currentRef.current = current;
  const canvas = React.useRef<HTMLCanvasElement>(null);
  const engine = React.useRef<SignatureEngine | null>(null);
  const [status, setStatus] = React.useState("");
  const disabledRef = React.useRef(disabled);
  disabledRef.current = disabled;
  const callbacks = React.useRef({ onValueChange, controlled: value !== undefined });
  callbacks.current = { onValueChange, controlled: value !== undefined };
  const update = React.useCallback((next: SignatureValue) => {
    if (!callbacks.current.controlled) currentRef.current = next;
    setOwn(next);
    callbacks.current.onValueChange?.(next);
  }, []);
  React.useEffect(() => {
    let disposed = false;
    let cleanup = () => {};
    void import("signature_pad")
      .then(({ default: Engine }) => {
        if (disposed || !canvas.current) return;
        const surface = canvas.current;
        if (!surface.getContext("2d")) {
          setStatus("Drawing is unavailable. You can type your name.");
          return;
        }
        const pad = new Engine(surface);
        engine.current = pad;
        function resize() {
          const bounds = surface.getBoundingClientRect();
          const width = Math.max(1, bounds.width || 640);
          const height = Math.max(1, bounds.height || 180);
          const ratio = window.devicePixelRatio || 1;
          surface.width = Math.round(width * ratio);
          surface.height = Math.round(height * ratio);
          surface.getContext("2d")!.setTransform(ratio, 0, 0, ratio, 0, 0);
          const data = currentRef.current;
          pad.fromData(
            data.strokes.map((stroke) => ({
              ...stroke,
              points: stroke.points.map((point) => ({
                ...point,
                x: (point.x * width) / Math.max(1, data.width),
                y: (point.y * height) / Math.max(1, data.height),
              })),
            })),
          );
        }
        const end = () => {
          const bounds = surface.getBoundingClientRect();
          update({
            ...currentRef.current,
            mode: "draw",
            width: bounds.width || 640,
            height: bounds.height || 180,
            strokes: structuredClone(pad.toData()),
          });
        };
        pad.addEventListener("endStroke", end);
        const observer = new ResizeObserver(resize);
        observer.observe(surface);
        cleanup = () => {
          pad.removeEventListener("endStroke", end);
          pad.off();
          observer.disconnect();
          engine.current = null;
        };
        resize();
        if (disabledRef.current || currentRef.current.mode !== "draw") pad.off();
      })
      .catch(() => {
        if (!disposed) setStatus("Drawing is unavailable. You can type your name.");
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [update]);
  React.useEffect(() => {
    const pad = engine.current;
    const surface = canvas.current;
    if (!pad || !surface) return;
    const bounds = surface.getBoundingClientRect();
    const width = bounds.width || 640;
    const height = bounds.height || 180;
    pad.fromData(
      current.strokes.map((stroke) => ({
        ...stroke,
        points: stroke.points.map((point) => ({
          ...point,
          x: (point.x * width) / Math.max(1, current.width),
          y: (point.y * height) / Math.max(1, current.height),
        })),
      })),
    );
    pad.off();
    if (!disabled && current.mode === "draw") pad.on();
  }, [current, disabled, own]);
  function clear() {
    if (!disabled) update({ ...currentRef.current, strokes: [], text: "" });
  }
  function undo() {
    if (!disabled)
      update({ ...currentRef.current, strokes: currentRef.current.strokes.slice(0, -1) });
  }
  function exportSignature(): Promise<Blob> {
    const data = currentRef.current;
    if (
      (data.mode === "draw" && !data.strokes.length) ||
      (data.mode === "type" && !data.text.trim())
    )
      return Promise.reject(new Error("Add a signature before exporting."));
    const output = document.createElement("canvas");
    output.width = canvas.current?.width || 640;
    output.height = canvas.current?.height || 180;
    const context = output.getContext("2d");
    if (!context) return Promise.reject(new Error("Signature export needs a canvas context."));
    if (data.mode === "draw" && canvas.current) context.drawImage(canvas.current, 0, 0);
    else {
      context.fillStyle = "black";
      context.font = `${Math.max(16, output.height / 3)}px cursive`;
      context.textBaseline = "middle";
      context.fillText(data.text, 16, output.height / 2, output.width - 32);
    }
    return new Promise((resolve, reject) =>
      output.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("The signature could not be encoded."))),
        "image/png",
      ),
    );
  }
  React.useImperativeHandle(ref, () => ({ clear, undo, export: exportSignature }));
  const empty = current.mode === "draw" ? !current.strokes.length : !current.text.trim();
  return (
    <section
      aria-label={label}
      aria-disabled={disabled || undefined}
      className={cn(
        "flex min-w-0 flex-col gap-3 text-sm text-foreground",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div
          role="group"
          aria-label="Signature mode"
          className="inline-flex rounded-lg bg-muted p-0.5"
        >
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label="Draw signature"
            aria-pressed={current.mode === "draw"}
            className="aria-pressed:bg-background aria-pressed:shadow-xs"
            onClick={() => update({ ...current, mode: "draw" })}
          >
            <PenLineIcon data-icon="inline-start" />
            Draw
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            aria-label="Type signature"
            aria-pressed={current.mode === "type"}
            className="aria-pressed:bg-background aria-pressed:shadow-xs"
            onClick={() => update({ ...current, mode: "type" })}
          >
            <KeyboardIcon data-icon="inline-start" />
            Type
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Undo stroke"
            disabled={disabled || !current.strokes.length}
            onClick={undo}
          >
            <Undo2Icon data-icon="inline-start" />
            Undo
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Clear signature"
            disabled={disabled || empty}
            onClick={clear}
          >
            <EraserIcon data-icon="inline-start" />
            Clear
          </Button>
        </div>
      </div>
      <div
        data-slot="signature-surface"
        className="fux-signature-paper relative h-44 overflow-hidden rounded-xl border shadow-xs focus-within:ring-2 focus-within:ring-ring/20"
      >
        <canvas
          ref={canvas}
          aria-label={`${label} drawing surface`}
          role="img"
          hidden={current.mode !== "draw"}
          className="absolute inset-0 size-full cursor-crosshair touch-none"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-5 bottom-9 flex items-end gap-2 border-b border-dashed border-current/30 pb-1 text-lg leading-none opacity-50"
        >
          <span>×</span>
          {current.mode === "draw" && !current.strokes.length && (
            <span className="text-xs tracking-wide uppercase opacity-70">Sign here</span>
          )}
        </div>
        {current.mode === "type" && (
          <p
            aria-hidden="true"
            className="absolute inset-x-5 bottom-11 truncate ps-6 text-4xl leading-tight"
            style={{ fontFamily: "cursive" }}
          >
            {current.text || <span className="opacity-30">Your name</span>}
          </p>
        )}
      </div>
      {current.mode === "type" && (
        <Field
          label="Your name"
          value={current.text}
          disabled={disabled}
          onValueChange={(text) => update({ ...current, text })}
        />
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="min-w-0 flex-1 text-xs text-pretty text-muted-foreground">
          {status ||
            "Draw with a pointer or choose Type signature to enter your name with a keyboard."}
        </p>
        {onExport && (
          <Button
            disabled={disabled}
            onClick={() =>
              void exportSignature()
                .then(onExport)
                .catch((error: Error) => setStatus(error.message))
            }
          >
            <DownloadIcon data-icon="inline-start" />
            Export signature
          </Button>
        )}
      </div>
    </section>
  );
}

export interface FloatingPanelProps {
  title: string;
  children: React.ReactNode;
  trigger?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultPosition?: Point;
  defaultSize?: { width: number; height: number };
}

export function FloatingPanel({
  title,
  children,
  trigger = "Open panel",
  open,
  defaultOpen = false,
  onOpenChange,
  defaultPosition = { x: 24, y: 24 },
  defaultSize = { width: 360, height: 280 },
}: FloatingPanelProps) {
  const [position, setPosition] = React.useState(defaultPosition);
  const [size, setSize] = React.useState(defaultSize);
  const [collapsed, setCollapsed] = React.useState(false);
  const [grabbed, setGrabbed] = React.useState<"move" | "resize" | null>(null);
  const drag = React.useRef<{
    x: number;
    y: number;
    position: Point;
    size: typeof size;
    resize: boolean;
  } | null>(null);
  function move(next: Point) {
    setPosition({
      x: Math.max(
        0,
        Math.min(next.x, window.innerWidth - Math.min(size.width, window.innerWidth - 16)),
      ),
      y: Math.max(
        0,
        Math.min(
          next.y,
          window.innerHeight - Math.min(collapsed ? 44 : size.height, window.innerHeight - 16),
        ),
      ),
    });
  }
  function resize(width: number, height: number) {
    setSize({
      width: Math.max(180, Math.min(width, window.innerWidth - position.x)),
      height: Math.max(120, Math.min(height, window.innerHeight - position.y)),
    });
  }
  React.useEffect(() => {
    const fit = () => {
      const x = Math.max(
        0,
        Math.min(position.x, window.innerWidth - Math.min(size.width, window.innerWidth - 16)),
      );
      const y = Math.max(
        0,
        Math.min(
          position.y,
          window.innerHeight - Math.min(collapsed ? 44 : size.height, window.innerHeight - 16),
        ),
      );
      if (x !== position.x || y !== position.y) setPosition({ x, y });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [position.x, position.y, size.width, size.height, collapsed]);
  function key(event: React.KeyboardEvent, resizing: boolean) {
    const delta = event.shiftKey ? 50 : 10;
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    const horizontal = event.key === "ArrowLeft" ? -delta : event.key === "ArrowRight" ? delta : 0;
    const dx = rtl ? -horizontal : horizontal;
    const dy = event.key === "ArrowUp" ? -delta : event.key === "ArrowDown" ? delta : 0;
    if (!dx && !dy) return;
    event.preventDefault();
    if (resizing) resize(size.width + dx, size.height + dy);
    else move({ x: position.x + dx, y: position.y + dy });
  }
  function pointer(event: React.PointerEvent<HTMLElement>, resizing: boolean) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, position, size, resize: resizing };
    setGrabbed(resizing ? "resize" : "move");
  }
  function release() {
    drag.current = null;
    setGrabbed(null);
  }
  function track(event: React.PointerEvent<HTMLElement>) {
    if (!drag.current) return;
    const deltaX =
      (event.clientX - drag.current.x) *
      (getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1);
    const deltaY = event.clientY - drag.current.y;
    if (drag.current.resize)
      resize(drag.current.size.width + deltaX, drag.current.size.height + deltaY);
    else move({ x: drag.current.position.x + deltaX, y: drag.current.position.y + deltaY });
  }
  const dragging = Boolean(grabbed);
  const dragHandlers = {
    onPointerMove: track,
    onLostPointerCapture: () => release(),
    onPointerUp: () => release(),
    onPointerCancel: () => release(),
  };
  return (
    <Dialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Trigger render={<Button variant="outline" />}>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup
          data-slot="floating-panel"
          data-dragging={grabbed || undefined}
          className={cn(
            "flex flex-col overflow-hidden rounded-xl bg-popover text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none motion-safe:transition-shadow motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95",
            dragging && "shadow-2xl ring-foreground/20 select-none",
          )}
          style={{
            position: "fixed",
            insetInlineStart: position.x,
            top: position.y,
            width: `min(${size.width}px, calc(100vw - 16px))`,
            height: collapsed ? "auto" : `min(${size.height}px, calc(100vh - 16px))`,
            zIndex: 50,
          }}
        >
          <div
            data-slot="floating-panel-header"
            className={cn(
              "flex touch-none items-center gap-1 border-b bg-muted/40 p-1.5 ps-1",
              dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={(event) => {
              // The whole header drags; its own buttons keep their clicks.
              const control = (event.target as HTMLElement).closest("button");
              if (!control || control.dataset.handle) pointer(event, false);
            }}
            {...dragHandlers}
          >
            <Button
              variant="ghost"
              size="icon-sm"
              data-handle="move"
              aria-label={`Move ${title}. Use arrow keys.`}
              className="cursor-[inherit] text-muted-foreground"
              onKeyDown={(event) => key(event, false)}
            >
              <GripVerticalIcon />
            </Button>
            <Dialog.Title className="min-w-0 flex-1 truncate font-medium">{title}</Dialog.Title>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={collapsed ? `Expand ${title}` : `Minimize ${title}`}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <PlusIcon /> : <MinusIcon />}
            </Button>
            <Dialog.Close
              render={<Button variant="ghost" size="icon-sm" aria-label={`Close ${title}`} />}
            >
              <XIcon />
            </Dialog.Close>
          </div>
          <div hidden={collapsed} className="min-h-0 flex-1 overflow-auto p-3">
            {children}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon-xs"
              data-handle="resize"
              aria-label={`Resize ${title}. Use arrow keys.`}
              className="absolute end-1 bottom-1 cursor-nwse-resize touch-none text-muted-foreground rtl:cursor-nesw-resize"
              onKeyDown={(event) => key(event, true)}
              onPointerDown={(event) => pointer(event, true)}
              {...dragHandlers}
            >
              <svg viewBox="0 0 12 12" className="rtl:-scale-x-100" aria-hidden="true">
                <path
                  d="M10 4 4 10M10 8l-2 2"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.25"
                  strokeLinecap="round"
                />
              </svg>
            </Button>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export interface TourStep {
  id: string;
  title: string;
  description: React.ReactNode;
  target?: () => HTMLElement | null;
}
export interface TourProps {
  steps: readonly TourStep[];
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  onComplete?: () => void;
  trigger?: React.ReactNode;
}

export function Tour({
  steps,
  open,
  defaultOpen = false,
  onOpenChange,
  step,
  defaultStep = 0,
  onStepChange,
  onComplete,
  trigger = "Start tour",
}: TourProps) {
  const [ownOpen, setOwnOpen] = React.useState(defaultOpen);
  const [ownStep, setOwnStep] = React.useState(defaultStep);
  const current = Math.max(0, Math.min(step ?? ownStep, steps.length - 1));
  const visible = (open ?? ownOpen) && steps.length > 0;
  const active = steps[current];
  const [target, setTarget] = React.useState<HTMLElement | null>(null);
  const opener = React.useRef<HTMLButtonElement>(null);
  const advance = React.useRef<HTMLButtonElement>(null);
  const [spotlight, setSpotlight] = React.useState<DOMRect | null>(null);
  function changeOpen(next: boolean) {
    if (open === undefined) setOwnOpen(next);
    onOpenChange?.(next);
  }
  function changeStep(next: number) {
    if (step === undefined) setOwnStep(next);
    onStepChange?.(next);
  }
  React.useEffect(() => {
    if (!visible || !active) {
      setTarget(null);
      return;
    }
    const element = active.target?.() ?? null;
    setTarget(element?.isConnected ? element : null);
    element?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [visible, active]);
  React.useEffect(() => {
    if (!visible || !target) {
      setSpotlight(null);
      return;
    }
    const measure = () => setSpotlight(target.getBoundingClientRect());
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(target);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      observer?.disconnect();
    };
  }, [visible, target]);
  const anchor = React.useCallback(
    () =>
      target ?? {
        getBoundingClientRect: () => ({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          top: window.innerHeight / 2,
          bottom: window.innerHeight / 2,
          left: window.innerWidth / 2,
          right: window.innerWidth / 2,
          width: 0,
          height: 0,
          toJSON() {
            return {};
          },
        }),
      },
    [target],
  );
  const last = current === steps.length - 1;
  return (
    <Popover.Root open={visible} onOpenChange={changeOpen} modal="trap-focus">
      <Popover.Trigger ref={opener} render={<Button variant="outline" disabled={!steps.length} />}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        {spotlight && (
          <div
            aria-hidden="true"
            data-slot="tour-spotlight"
            className="pointer-events-none fixed z-[59] rounded-lg ring-2 ring-signal shadow-[0_0_0_9999px_oklch(0_0_0/0.4)] motion-safe:transition-[top,left,width,height] motion-safe:duration-200"
            style={{
              top: spotlight.top - 6,
              left: spotlight.left - 6,
              width: spotlight.width + 12,
              height: spotlight.height + 12,
            }}
          />
        )}
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          sideOffset={target ? 16 : 10}
          collisionPadding={12}
          style={{ zIndex: 60 }}
        >
          <Popover.Popup
            finalFocus={opener}
            initialFocus={advance}
            data-slot="tour-step"
            className="flex w-[min(22rem,calc(100vw-1.5rem))] max-h-[calc(100vh-1.5rem)] origin-(--transform-origin) flex-col gap-3 overflow-auto rounded-xl bg-popover p-4 text-sm text-popover-foreground shadow-xl ring-1 ring-foreground/10 outline-none motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95 motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0"
          >
            <div className="flex items-center gap-3">
              <div aria-hidden="true" className="flex flex-1 gap-1">
                {steps.map((item, index) => (
                  <span
                    key={item.id}
                    className={cn(
                      "h-1 flex-1 rounded-full bg-muted motion-safe:transition-colors",
                      index <= current && "bg-signal",
                    )}
                  />
                ))}
              </div>
              <p role="status" className="font-mono text-xs text-muted-foreground tabular-nums">
                Step {current + 1} of {steps.length}
              </p>
              <Popover.Close
                render={
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Close tour"
                    className="-me-1 text-muted-foreground"
                  />
                }
              >
                <XIcon />
              </Popover.Close>
            </div>
            <div className="flex flex-col gap-1">
              <Popover.Title className="text-base font-medium text-balance">
                {active?.title}
              </Popover.Title>
              <Popover.Description render={<div />} className="text-pretty text-muted-foreground">
                {active?.description}
              </Popover.Description>
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="outline"
                disabled={current === 0}
                onClick={() => changeStep(current - 1)}
              >
                <ChevronLeftIcon data-icon="inline-start" className="rtl:rotate-180" />
                Previous
              </Button>
              <Button
                ref={advance}
                onClick={() => {
                  if (last) {
                    onComplete?.();
                    changeOpen(false);
                  } else changeStep(current + 1);
                }}
              >
                {last ? "Finish" : "Next"}
                {!last && <ChevronRightIcon data-icon="inline-end" className="rtl:rotate-180" />}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
