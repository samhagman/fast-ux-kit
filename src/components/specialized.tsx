"use client";

import * as React from "react";
import { encode } from "uqr";
import { NavigationMenu as NavigationPrimitive } from "@base-ui/react/navigation-menu";
import { ToggleGroup } from "@base-ui/react/toggle-group";
import { Toggle } from "@base-ui/react/toggle";
import { Button, RadioGroup, type RadioGroupProps } from "./basic.js";
import { Tree, safeNavigationHref, type TreeNode } from "./collections.js";
import { cn } from "../lib/utils.js";

export interface PaginationProps {
  label: string;
  count: number;
  pageSize?: number;
  page?: number;
  defaultPage?: number;
  onPageChange?: (page: number) => void;
  previousLabel?: string;
  nextLabel?: string;
}

export function Pagination({
  label,
  count,
  pageSize = 10,
  page,
  defaultPage = 1,
  onPageChange,
  previousLabel = "Previous",
  nextLabel = "Next",
}: PaginationProps) {
  if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(pageSize) || pageSize < 1)
    throw new Error("Pagination requires a non-negative count and a positive page size.");
  if (![page ?? 1, defaultPage].every((value) => Number.isSafeInteger(value) && value >= 1))
    throw new Error("Page numbers must be positive integers.");
  const [own, setOwn] = React.useState(defaultPage);
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const current = Math.min(page ?? own, pages);
  function select(next: number) {
    const value = Math.max(1, Math.min(next, pages));
    if (value === current) return;
    if (page === undefined) setOwn(value);
    onPageChange?.(value);
  }
  const visible = new Set(
    [1, pages, current - 1, current, current + 1].filter((value) => value > 0 && value <= pages),
  );
  const ordered = [...visible].sort((a, b) => a - b);
  return (
    <nav aria-label={label} className="fux-row" style={{ flexWrap: "wrap" }}>
      <Button variant="outline" disabled={current === 1} onClick={() => select(current - 1)}>
        {previousLabel}
      </Button>
      {ordered.map((value, index) => (
        <React.Fragment key={value}>
          {index > 0 && value - ordered[index - 1]! > 1 && <span aria-hidden>…</span>}
          <Button
            variant={value === current ? "default" : "ghost"}
            aria-current={value === current ? "page" : undefined}
            aria-label={`Page ${value}`}
            onClick={() => select(value)}
          >
            {value}
          </Button>
        </React.Fragment>
      ))}
      <Button variant="outline" disabled={current === pages} onClick={() => select(current + 1)}>
        {nextLabel}
      </Button>
    </nav>
  );
}

export interface ClipboardProps {
  value: string;
  label?: string;
  onError?: (error: Error) => void;
}
export function Clipboard({ value, label = "Copy", onError }: ClipboardProps) {
  const [status, setStatus] = React.useState("");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("Copied");
    } catch (error) {
      setStatus("Copy failed");
      onError?.(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return (
    <span className="fux-row">
      <Button variant="outline" onClick={copy}>
        {label}
      </Button>
      <span role="status" className="fux-hint">
        {status}
      </span>
    </span>
  );
}

export interface DownloadTriggerProps extends Omit<React.ComponentProps<"a">, "href" | "download"> {
  href: string;
  filename?: string;
}
export function DownloadTrigger({
  href,
  filename = "download",
  children = "Download",
  ...props
}: DownloadTriggerProps) {
  if (!/^(https?:|blob:|\/|\.\.?\/)/i.test(href))
    return <span role="alert">Download URL is unavailable.</span>;
  return (
    <a {...props} className={cn("fux-control", props.className)} href={href} download={filename}>
      {children}
    </a>
  );
}

export interface FileSelectionProps {
  label: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  maxFiles?: number;
  maxSize?: number;
  onFilesChange?: (files: readonly File[]) => void;
  onError?: (messages: readonly string[]) => void;
}
function validateFiles(
  files: readonly File[],
  { accept, maxFiles, maxSize, multiple }: FileSelectionProps,
) {
  const accepted: File[] = [];
  const errors: string[] = [];
  if (maxFiles !== undefined && (!Number.isSafeInteger(maxFiles) || maxFiles < 0))
    throw new Error("maxFiles must be a non-negative integer.");
  if (maxSize !== undefined && (!Number.isFinite(maxSize) || maxSize < 0))
    throw new Error("maxSize must be a non-negative byte count.");
  const patterns =
    accept
      ?.split(",")
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean) ?? [];
  for (const file of files) {
    if (maxSize !== undefined && file.size > maxSize)
      errors.push(`${file.name} exceeds the file size limit.`);
    else if (
      patterns.length &&
      !patterns.some((pattern) =>
        pattern.startsWith(".")
          ? file.name.toLowerCase().endsWith(pattern)
          : pattern.endsWith("/*")
            ? file.type.startsWith(pattern.slice(0, -1))
            : file.type === pattern,
      )
    )
      errors.push(`${file.name} has an unsupported file type.`);
    else if (accepted.length >= (maxFiles ?? Infinity) || (!multiple && accepted.length >= 1))
      errors.push(`${file.name} exceeds the file count limit.`);
    else accepted.push(file);
  }
  return { accepted, errors };
}
export function FileTrigger(props: FileSelectionProps) {
  const input = React.useRef<HTMLInputElement>(null);
  function change(files: readonly File[]) {
    const result = validateFiles(files, props);
    props.onFilesChange?.(result.accepted);
    props.onError?.(result.errors);
  }
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={props.accept}
        multiple={props.multiple}
        disabled={props.disabled}
        hidden
        onChange={(event) => {
          change(Array.from(event.target.files ?? []));
          event.target.value = "";
        }}
      />
      <Button variant="outline" disabled={props.disabled} onClick={() => input.current?.click()}>
        {props.label}
      </Button>
    </>
  );
}
export function DropZone({
  children,
  ...props
}: FileSelectionProps & { children?: React.ReactNode }) {
  const [over, setOver] = React.useState(false);
  return (
    <div
      role="group"
      aria-label={props.label}
      aria-disabled={props.disabled}
      className="fux-dropzone"
      data-dragging={over || undefined}
      onDragOver={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        if (props.disabled) return;
        const files = Array.from(event.dataTransfer.files);
        const result = validateFiles(files, props);
        props.onFilesChange?.(result.accepted);
        props.onError?.(result.errors);
      }}
    >
      {children ?? <p>Drop files here</p>}
      <FileTrigger {...props} />
    </div>
  );
}
export interface FileUploadProps extends FileSelectionProps {
  files?: readonly File[];
  defaultFiles?: readonly File[];
}
export function FileUpload({ files, defaultFiles = [], ...props }: FileUploadProps) {
  validateFiles([], props);
  const [own, setOwn] = React.useState<readonly File[]>(defaultFiles);
  const [errors, setErrors] = React.useState<readonly string[]>([]);
  const current = files ?? own;
  function update(next: readonly File[]) {
    if (files === undefined) setOwn(next);
    props.onFilesChange?.(next);
  }
  function append(selected: readonly File[]) {
    if (!selected.length) return;
    const next = props.multiple ? [...current, ...selected] : selected;
    update(next);
  }
  return (
    <div className="fux-field">
      <DropZone
        {...props}
        maxFiles={
          props.maxFiles === undefined
            ? undefined
            : Math.max(0, props.maxFiles - (props.multiple ? current.length : 0))
        }
        onFilesChange={append}
        onError={(next) => {
          setErrors(next);
          props.onError?.(next);
        }}
      />
      <ul className="fux-file-list">
        {current.map((file, index) => (
          <li key={`${file.name}-${file.lastModified}-${index}`} className="fux-row">
            <span>{file.name}</span>
            <span className="fux-hint">{new Intl.NumberFormat().format(file.size)} bytes</span>
            <Button
              variant="ghost"
              disabled={props.disabled}
              aria-label={`Remove ${file.name}`}
              onClick={() => update(current.filter((_, item) => item !== index))}
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      {errors.length > 0 && (
        <div role="alert" className="fux-error">
          {errors.join(" ")}
        </div>
      )}
    </div>
  );
}

export interface AngleSliderProps {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  disabled?: boolean;
  step?: number;
}
export function AngleSlider({
  label,
  value,
  defaultValue = 0,
  onValueChange,
  disabled,
  step = 1,
}: AngleSliderProps) {
  if (!Number.isFinite(step) || step <= 0 || !Number.isFinite(value ?? defaultValue))
    throw new Error("AngleSlider requires a finite value and a positive step.");
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  function change(next: number) {
    const normalized = Math.max(0, Math.min(360, Math.round(next / step) * step));
    if (value === undefined) setOwn(normalized);
    onValueChange?.(normalized);
  }
  function point(event: React.PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    change(
      ((Math.atan2(
        event.clientY - bounds.top - bounds.height / 2,
        event.clientX - bounds.left - bounds.width / 2,
      ) *
        180) /
        Math.PI +
        90 +
        360) %
        360,
    );
  }
  return (
    <div className="fux-field">
      <span className="fux-label">{label}</span>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={current}
        aria-valuetext={`${current} degrees`}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="fux-angle-slider"
        onPointerDown={(event) => {
          if (disabled) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          point(event);
        }}
        onPointerMove={(event) => {
          if (!disabled && event.currentTarget.hasPointerCapture(event.pointerId)) point(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          const delta = event.shiftKey ? step * 10 : step;
          const next = (
            {
              ArrowRight: current + delta,
              ArrowUp: current + delta,
              ArrowLeft: current - delta,
              ArrowDown: current - delta,
              PageUp: current + step * 10,
              PageDown: current - step * 10,
              Home: 0,
              End: 360,
            } as Record<string, number>
          )[event.key];
          if (next !== undefined) {
            event.preventDefault();
            change(next);
          }
        }}
      >
        <span className="fux-angle-hand" style={{ transform: `rotate(${current}deg)` }} />
        <span>{current}°</span>
      </div>
    </div>
  );
}
export function RatingGroup({
  max = 5,
  ...props
}: Omit<RadioGroupProps, "options"> & { max?: number }) {
  return (
    <RadioGroup
      {...props}
      options={Array.from({ length: max }, (_, index) => ({
        id: String(index + 1),
        label: `${index + 1} ${index === 0 ? "star" : "stars"}`,
      }))}
    />
  );
}
export interface SegmentGroupProps {
  label: string;
  items: readonly { id: string; label: React.ReactNode; disabled?: boolean }[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
}
export function SegmentGroup({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
}: SegmentGroupProps) {
  const [own, setOwn] = React.useState(defaultValue);
  const current = value ?? own;
  return (
    <ToggleGroup
      aria-label={label}
      className="fux-segments"
      value={current === undefined ? [] : [current]}
      onValueChange={(next) => {
        const selected = next[0];
        if (!selected) return;
        if (value === undefined) setOwn(selected);
        onValueChange?.(selected);
      }}
    >
      {items.map((item) => (
        <Toggle key={item.id} value={item.id} disabled={item.disabled} className="fux-control">
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}

export interface StepsProps {
  label: string;
  items: readonly { id: string; title: string; description?: string }[];
  value?: number;
  onValueChange?: (step: number) => void;
}
export function Steps({ label, items, value = 0, onValueChange }: StepsProps) {
  return (
    <nav aria-label={label}>
      <ol className="fux-steps">
        {items.map((item, index) => (
          <li
            key={item.id}
            aria-current={index === value ? "step" : undefined}
            data-complete={index < value || undefined}
          >
            <Button
              variant={index === value ? "default" : "ghost"}
              disabled={!onValueChange}
              onClick={() => onValueChange?.(index)}
            >
              <span aria-hidden>{index < value ? "✓" : index + 1}</span>
              {item.title}
            </Button>
            {item.description && <small>{item.description}</small>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function Toc({
  items,
  label = "On this page",
  activeId,
}: {
  items: readonly { id: string; label: string; level?: number }[];
  label?: string;
  activeId?: string;
}) {
  return (
    <nav aria-label={label}>
      <ol className="fux-toc">
        {items.map((item) => (
          <li
            key={item.id}
            style={{ paddingInlineStart: `${Math.max(0, (item.level ?? 1) - 1)}rem` }}
          >
            <a
              href={`#${encodeURIComponent(item.id)}`}
              aria-current={item.id === activeId ? "location" : undefined}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
export interface NavigationMenuItem {
  id: string;
  label: string;
  href?: string;
  children?: React.ReactNode;
}
export function NavigationMenu({
  label,
  items,
}: {
  label: string;
  items: readonly NavigationMenuItem[];
}) {
  return (
    <NavigationPrimitive.Root aria-label={label}>
      <NavigationPrimitive.List className="fux-row">
        {items.map((item) => (
          <NavigationPrimitive.Item key={item.id}>
            {item.children ? (
              <>
                <NavigationPrimitive.Trigger className="fux-control">
                  {item.label}
                </NavigationPrimitive.Trigger>
                <NavigationPrimitive.Content>{item.children}</NavigationPrimitive.Content>
              </>
            ) : (
              <NavigationPrimitive.Link
                className="fux-control"
                href={safeNavigationHref(item.href)}
              >
                {item.label}
              </NavigationPrimitive.Link>
            )}
          </NavigationPrimitive.Item>
        ))}
      </NavigationPrimitive.List>
      <NavigationPrimitive.Portal>
        <NavigationPrimitive.Positioner className="fux-positioner">
          <NavigationPrimitive.Popup className="fux-popup">
            <NavigationPrimitive.Viewport />
          </NavigationPrimitive.Popup>
        </NavigationPrimitive.Positioner>
      </NavigationPrimitive.Portal>
    </NavigationPrimitive.Root>
  );
}
export function JsonTreeView({
  value,
  label = "JSON",
  ...props
}: Omit<React.ComponentProps<typeof Tree>, "items" | "label" | "value"> & {
  value: unknown;
  label?: string;
}) {
  const seen = new WeakSet<object>();
  function nodes(value: unknown, path: string, name: string, depth = 0): TreeNode {
    if (depth > 64) return { id: path, label: `${name}: maximum depth` };
    if (value === null || typeof value !== "object")
      return {
        id: path,
        label: `${name}: ${typeof value === "string" ? JSON.stringify(value) : String(value)}`,
      };
    if (seen.has(value)) return { id: path, label: `${name}: [Circular]` };
    seen.add(value);
    const entries = Object.entries(value);
    const result = {
      id: path,
      label: `${name} ${Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`}`,
      children: entries.map(([key, entry]) =>
        nodes(entry, `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, key, depth + 1),
      ),
    };
    seen.delete(value);
    return result;
  }
  return <Tree {...props} label={label} items={[nodes(value, "$", label)]} />;
}

export interface QrCodeProps {
  value: string;
  label?: string;
  size?: number;
  correction?: "L" | "M" | "Q" | "H";
}
export function QrCode({ value, label = "QR code", size = 160, correction = "M" }: QrCodeProps) {
  const encoded = React.useMemo(() => {
    try {
      return encode(value, { ecc: correction, border: 4 });
    } catch {
      return null;
    }
  }, [value, correction]);
  if (!encoded) return <span role="alert">This value is too large for a QR code.</span>;
  const path = encoded.data
    .flatMap((row, y) => row.flatMap((filled, x) => (filled ? [`M${x} ${y}h1v1h-1z`] : [])))
    .join("");
  return (
    <svg
      role="img"
      aria-label={label}
      width={size}
      height={size}
      viewBox={`0 0 ${encoded.size} ${encoded.size}`}
      shapeRendering="crispEdges"
    >
      <rect width="100%" height="100%" fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}

export interface TimerProps {
  label: string;
  seconds: number;
  onComplete?: () => void;
}
export function Timer({ label, seconds, onComplete }: TimerProps) {
  if (!Number.isFinite(seconds) || seconds < 0)
    throw new Error("Timer seconds must be finite and non-negative.");
  const [remaining, setRemaining] = React.useState(seconds);
  const [running, setRunning] = React.useState(false);
  const runningRef = React.useRef(false);
  const remainingRef = React.useRef(seconds);
  const deadline = React.useRef(0);
  const callback = React.useRef(onComplete);
  callback.current = onComplete;
  function reset() {
    runningRef.current = false;
    remainingRef.current = seconds;
    setRunning(false);
    setRemaining(seconds);
  }
  React.useEffect(reset, [seconds]);
  React.useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (!runningRef.current) return;
      const next = Math.max(0, (deadline.current - Date.now()) / 1000);
      remainingRef.current = next;
      setRemaining(next);
      if (!next) {
        runningRef.current = false;
        setRunning(false);
        callback.current?.();
      }
    };
    const interval = setInterval(tick, 50);
    return () => clearInterval(interval);
  }, [running]);
  function toggle() {
    if (runningRef.current) {
      remainingRef.current = Math.max(0, (deadline.current - Date.now()) / 1000);
      setRemaining(remainingRef.current);
    } else deadline.current = Date.now() + remainingRef.current * 1000;
    runningRef.current = !runningRef.current;
    setRunning(runningRef.current);
  }
  const whole = Math.ceil(remaining);
  return (
    <div role="group" aria-label={label} className="fux-field">
      <span className="fux-label">{label}</span>
      <output aria-label="Time remaining">
        {Math.floor(whole / 60)}:{String(whole % 60).padStart(2, "0")}
      </output>
      <div className="fux-row">
        <Button disabled={!remaining} onClick={toggle}>
          {running ? "Pause" : "Start"}
        </Button>
        <Button variant="outline" onClick={reset}>
          Reset
        </Button>
      </div>
    </div>
  );
}

export function Marquee({
  children,
  label,
  duration = 20,
}: {
  children: React.ReactNode;
  label: string;
  duration?: number;
}) {
  const [paused, setPaused] = React.useState(false);
  return (
    <div className="fux-marquee" aria-label={label}>
      <div
        className="fux-marquee-content"
        style={{
          animationDuration: `${duration}s`,
          animationPlayState: paused ? "paused" : "running",
        }}
      >
        {children}
      </div>
      <Button variant="ghost" aria-pressed={paused} onClick={() => setPaused(!paused)}>
        {paused ? "Resume motion" : "Pause motion"}
      </Button>
    </div>
  );
}

export function Carousel({ label, children }: { label: string; children: React.ReactNode }) {
  const viewport = React.useRef<HTMLDivElement>(null);
  const slides = React.Children.toArray(children);
  const [ownActive, setActive] = React.useState(0);
  const active = Math.max(0, Math.min(ownActive, slides.length - 1));
  function go(index: number) {
    const next = Math.max(0, Math.min(slides.length - 1, index));
    const child = viewport.current?.children[next] as HTMLElement | undefined;
    child?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "nearest",
      inline: "start",
    });
    setActive(next);
  }
  function readScroll() {
    const el = viewport.current;
    if (!el || !el.clientWidth) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const bounds = el.getBoundingClientRect();
    const edge = rtl ? bounds.right : bounds.left;
    let nearest = 0;
    let distance = Infinity;
    Array.from(el.children).forEach((child, index) => {
      const box = child.getBoundingClientRect();
      const delta = Math.abs((rtl ? box.right : box.left) - edge);
      if (delta < distance) {
        nearest = index;
        distance = delta;
      }
    });
    setActive(nearest);
  }
  return (
    <section aria-roledescription="carousel" aria-label={label} className="fux-field">
      <div
        ref={viewport}
        tabIndex={0}
        aria-label={`${label} slides`}
        className="fux-carousel"
        onScroll={readScroll}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
          if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            event.preventDefault();
            go(active + (event.key === "ArrowRight" ? 1 : -1) * (rtl ? -1 : 1));
          } else if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            go(event.key === "Home" ? 0 : slides.length - 1);
          }
        }}
      >
        {slides.map((slide, index) => (
          <div
            role="group"
            aria-roledescription="slide"
            aria-label={`${index + 1} of ${slides.length}`}
            className="fux-carousel-slide"
            key={index}
          >
            {slide}
          </div>
        ))}
      </div>
      <div className="fux-row">
        <Button
          variant="outline"
          disabled={!slides.length || active === 0}
          onClick={() => go(active - 1)}
        >
          Previous
        </Button>
        <output aria-live="polite">
          {slides.length ? active + 1 : 0} / {slides.length}
        </output>
        <Button
          variant="outline"
          disabled={!slides.length || active >= slides.length - 1}
          onClick={() => go(active + 1)}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
