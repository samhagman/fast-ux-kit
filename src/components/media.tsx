"use client";

import * as React from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import type SignatureEngine from "signature_pad";
import type { PointGroup } from "signature_pad";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
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
  return (
    <section aria-label={`Crop ${alt}`} className={cn("fux-field", className)}>
      <div
        role="group"
        tabIndex={0}
        aria-label={`Crop ${alt}. Use arrow keys to position the image.`}
        style={{ position: "relative", minHeight: 260 }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const distance = event.shiftKey ? 10 : 1;
          const x =
            event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0;
          const y = event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0;
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
            onCropComplete?.(area, rectangle);
          }}
        />
      </div>
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
      <div className="fux-row">
        <Button variant="outline" onClick={() => change(initialCrop)}>
          Reset crop
        </Button>
        {onExport && (
          <Button disabled={busy} onClick={exportCrop}>
            {busy ? "Exporting…" : "Crop image"}
          </Button>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
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
  return (
    <section aria-label={label} className={cn("fux-field", className)}>
      <div className="fux-row">
        <Button
          variant="outline"
          disabled={disabled}
          aria-pressed={current.mode === "draw"}
          onClick={() => update({ ...current, mode: "draw" })}
        >
          Draw signature
        </Button>
        <Button
          variant="outline"
          disabled={disabled}
          aria-pressed={current.mode === "type"}
          onClick={() => update({ ...current, mode: "type" })}
        >
          Type signature
        </Button>
      </div>
      <canvas
        ref={canvas}
        aria-label={`${label} drawing surface`}
        role="img"
        hidden={current.mode !== "draw"}
        style={{
          width: "100%",
          height: 180,
          touchAction: "none",
          border: "1px solid currentColor",
          borderRadius: 6,
        }}
      />
      {current.mode === "type" && (
        <Field
          label="Your name"
          value={current.text}
          disabled={disabled}
          onValueChange={(text) => update({ ...current, text })}
        />
      )}
      <div className="fux-row">
        <Button variant="outline" disabled={disabled || !current.strokes.length} onClick={undo}>
          Undo stroke
        </Button>
        <Button variant="outline" disabled={disabled} onClick={clear}>
          Clear signature
        </Button>
        {onExport && (
          <Button
            disabled={disabled}
            onClick={() =>
              void exportSignature()
                .then(onExport)
                .catch((error: Error) => setStatus(error.message))
            }
          >
            Export signature
          </Button>
        )}
      </div>
      <p role="status" className="fux-hint">
        {status ||
          "Draw with a pointer or choose Type signature to enter your name with a keyboard."}
      </p>
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
  function pointer(event: React.PointerEvent<HTMLButtonElement>, resizing: boolean) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, position, size, resize: resizing };
  }
  function track(event: React.PointerEvent<HTMLButtonElement>) {
    if (!drag.current) return;
    const deltaX =
      (event.clientX - drag.current.x) *
      (getComputedStyle(event.currentTarget).direction === "rtl" ? -1 : 1);
    const deltaY = event.clientY - drag.current.y;
    if (drag.current.resize)
      resize(drag.current.size.width + deltaX, drag.current.size.height + deltaY);
    else move({ x: drag.current.position.x + deltaX, y: drag.current.position.y + deltaY });
  }
  return (
    <Dialog.Root open={open} defaultOpen={defaultOpen} onOpenChange={onOpenChange} modal={false}>
      <Dialog.Trigger render={<Button variant="outline" />}>{trigger}</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Popup
          className="fux-panel"
          style={{
            position: "fixed",
            insetInlineStart: position.x,
            top: position.y,
            width: `min(${size.width}px, calc(100vw - 16px))`,
            height: collapsed ? "auto" : `min(${size.height}px, calc(100vh - 16px))`,
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div className="fux-row">
            <Dialog.Title style={{ flex: 1 }}>{title}</Dialog.Title>
            <Button
              variant="ghost"
              aria-label={`Move ${title}. Use arrow keys.`}
              style={{ touchAction: "none" }}
              onKeyDown={(event) => key(event, false)}
              onPointerDown={(event) => pointer(event, false)}
              onPointerMove={track}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              Move
            </Button>
            <Button
              variant="ghost"
              aria-label={collapsed ? `Expand ${title}` : `Minimize ${title}`}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? "+" : "−"}
            </Button>
            <Dialog.Close render={<Button variant="ghost" aria-label={`Close ${title}`} />}>
              ×
            </Dialog.Close>
          </div>
          <div hidden={collapsed} style={{ overflow: "auto", flex: 1 }}>
            {children}
          </div>
          {!collapsed && (
            <Button
              variant="ghost"
              aria-label={`Resize ${title}. Use arrow keys.`}
              style={{ alignSelf: "end", touchAction: "none" }}
              onKeyDown={(event) => key(event, true)}
              onPointerDown={(event) => pointer(event, true)}
              onPointerMove={track}
              onLostPointerCapture={() => {
                drag.current = null;
              }}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
            >
              Resize
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
  return (
    <Popover.Root open={visible} onOpenChange={changeOpen} modal="trap-focus">
      <Popover.Trigger ref={opener} render={<Button variant="outline" disabled={!steps.length} />}>
        {trigger}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="bottom"
          sideOffset={10}
          collisionPadding={12}
          style={{ zIndex: 60 }}
        >
          <Popover.Popup
            finalFocus={opener}
            className="fux-panel"
            style={{
              width: "min(340px, calc(100vw - 24px))",
              maxHeight: "calc(100vh - 24px)",
              overflow: "auto",
            }}
          >
            <p role="status" className="fux-hint">
              Step {current + 1} of {steps.length}
            </p>
            <Popover.Title>{active?.title}</Popover.Title>
            <Popover.Description render={<div />}>{active?.description}</Popover.Description>
            <div className="fux-row">
              <Button
                variant="outline"
                disabled={current === 0}
                onClick={() => changeStep(current - 1)}
              >
                Previous
              </Button>
              <Button
                onClick={() => {
                  if (current === steps.length - 1) {
                    onComplete?.();
                    changeOpen(false);
                  } else changeStep(current + 1);
                }}
              >
                {current === steps.length - 1 ? "Finish" : "Next"}
              </Button>
              <Popover.Close render={<Button variant="ghost" />}>Close tour</Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
