"use client";

import * as React from "react";
import { Slider } from "@base-ui/react/slider";
import { DirectionProvider, useDirection } from "@base-ui/react/direction-provider";
import { CheckIcon, CircleAlertIcon } from "lucide-react";
import { cn } from "../lib/utils.js";
import { Input } from "./ui/input.js";
import { useResolvedDirection } from "../lib/direction.js";
import {
  converter,
  formatCss,
  formatHex,
  formatHex8,
  parse,
  type Color as ParsedColor,
} from "culori";

export type ColorSpace = "rgb" | "hsl" | "hsb";
export type ColorChannel =
  "red" | "green" | "blue" | "hue" | "saturation" | "lightness" | "brightness" | "alpha";
export type ColorInput = string | ColorValue | { toString(format?: string): string };

const rgb = converter("rgb");
const hsl = converter("hsl");
const hsv = converter("hsv");
const bounded = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
/** Feeds a color into the `--fux-fill` hook that `.fux-color-fill` paints over a checkerboard. */
const fill = (value: ColorValue | string): React.CSSProperties =>
  ({ "--fux-fill": typeof value === "string" ? value : value.toString() }) as React.CSSProperties;
/** Black or white, whichever stays readable on top of the color. */
function readableOn(value: ColorValue) {
  const lightness =
    (0.2126 * value.getChannelValue("red") +
      0.7152 * value.getChannelValue("green") +
      0.0722 * value.getChannelValue("blue")) /
    255;
  return value.getChannelValue("alpha") < 0.45 || lightness > 0.62 ? "#111" : "#fff";
}

/** A portable color value whose channels use familiar CSS units. */
export class ColorValue {
  constructor(
    private readonly color: ParsedColor,
    private readonly space: ColorSpace = "rgb",
  ) {}

  getColorSpace(): ColorSpace {
    return this.space;
  }

  getChannelValue(channel: ColorChannel): number {
    if (channel === "alpha") return this.color.alpha ?? 1;
    if (channel === "red" || channel === "green" || channel === "blue") {
      const value = rgb(this.color);
      return (value[channel === "red" ? "r" : channel === "green" ? "g" : "b"] ?? 0) * 255;
    }
    const value =
      channel === "brightness" || this.space === "hsb" ? hsv(this.color) : hsl(this.color);
    if (channel === "hue") return value.h ?? 0;
    if (channel === "saturation") return (value.s ?? 0) * 100;
    if (channel === "brightness") return hsv(this.color).v * 100;
    return hsl(this.color).l * 100;
  }

  getChannelRange(channel: ColorChannel) {
    const maxValue =
      channel === "alpha"
        ? 1
        : channel === "hue"
          ? 360
          : ["red", "green", "blue"].includes(channel)
            ? 255
            : 100;
    return {
      minValue: 0,
      maxValue,
      step: channel === "alpha" ? 0.01 : 1,
      pageSize: channel === "alpha" ? 0.1 : 10,
    };
  }

  withChannelValue(channel: ColorChannel, value: number): ColorValue {
    const range = this.getChannelRange(channel);
    const next = bounded(value, range.minValue, range.maxValue);
    if (channel === "alpha") return new ColorValue({ ...this.color, alpha: next }, this.space);
    if (channel === "red" || channel === "green" || channel === "blue") {
      const key = channel === "red" ? "r" : channel === "green" ? "g" : "b";
      return new ColorValue({ ...rgb(this.color), [key]: next / 255 }, "rgb");
    }
    if (channel === "brightness" || (this.space === "hsb" && channel !== "lightness")) {
      const key = channel === "hue" ? "h" : channel === "saturation" ? "s" : "v";
      return new ColorValue(
        { ...hsv(this.color), [key]: channel === "hue" ? next : next / 100 },
        "hsb",
      );
    }
    const key = channel === "hue" ? "h" : channel === "saturation" ? "s" : "l";
    return new ColorValue(
      { ...hsl(this.color), [key]: channel === "hue" ? next : next / 100 },
      "hsl",
    );
  }

  toFormat(format: ColorSpace): ColorValue {
    return new ColorValue(
      format === "hsb" ? hsv(this.color) : format === "hsl" ? hsl(this.color) : rgb(this.color),
      format,
    );
  }

  toString(format = "css"): string {
    if (format === "hex") return formatHex(this.color).toUpperCase();
    if (format === "hexa") return formatHex8(this.color).toUpperCase();
    if (format === "hsl" || format === "hsla") return formatCss(hsl(this.color))!;
    return formatCss(rgb(this.color))!;
  }
}

export type Color = ColorValue;

export function parseColor(value: ColorInput): ColorValue {
  if (value instanceof ColorValue) return value;
  const source = typeof value === "string" ? value : value.toString("css");
  const color = parse(source);
  if (!color) throw new Error(`Invalid color: ${source}`);
  return new ColorValue(color, color.mode === "hsl" ? "hsl" : color.mode === "hsv" ? "hsb" : "rgb");
}

interface ColorStateProps {
  value?: ColorInput | null;
  defaultValue?: ColorInput;
  onChange?: (value: ColorValue) => void;
  onValueChange?: (value: ColorValue) => void;
  onChangeEnd?: (value: ColorValue) => void;
  isDisabled?: boolean;
  disabled?: boolean;
  isReadOnly?: boolean;
  readOnly?: boolean;
}
interface ColorState {
  color: ColorValue;
  disabled: boolean;
  readOnly: boolean;
  controlled: boolean;
  setColor(value: ColorValue): void;
  commit(value: ColorValue): void;
}
const ColorContext = React.createContext<ColorState | null>(null);

function useColorState(props: ColorStateProps): ColorState {
  const parent = React.useContext(ColorContext);
  const [local, setLocal] = React.useState(() => parseColor(props.defaultValue ?? "#000000"));
  const own = props.value !== undefined || props.defaultValue !== undefined;
  const color =
    props.value != null ? parseColor(props.value) : parent && !own ? parent.color : local;
  const disabled = Boolean(props.disabled ?? props.isDisabled ?? parent?.disabled);
  const readOnly = Boolean(props.readOnly ?? props.isReadOnly ?? parent?.readOnly);
  return {
    color,
    disabled,
    readOnly,
    controlled: props.value !== undefined || Boolean(parent && !own && parent.controlled),
    setColor(value) {
      if (disabled || readOnly) return;
      if (parent && !own) parent.setColor(value);
      else if (props.value === undefined) setLocal(value);
      props.onChange?.(value);
      props.onValueChange?.(value);
    },
    commit(value) {
      if (disabled || readOnly) return;
      props.onChangeEnd?.(value);
      if (parent && !own) parent.commit(value);
    },
  };
}

interface ColorRootProps
  extends
    ColorStateProps,
    Omit<React.HTMLAttributes<HTMLDivElement>, "defaultValue" | "onChange" | "onChangeEnd"> {
  ref?: React.Ref<HTMLDivElement>;
}
export interface ColorAreaProps extends ColorRootProps {
  label?: string;
  colorSpace?: ColorSpace;
  xChannel?: ColorChannel;
  yChannel?: ColorChannel;
}

export function ColorArea({
  label,
  colorSpace = "hsb",
  xChannel = "saturation",
  yChannel = "brightness",
  ...props
}: ColorAreaProps) {
  const state = useColorState(props);
  const contextDirection = useDirection();
  const elementRef = React.useRef<HTMLDivElement>(null);
  const explicitDirection =
    props.dir === "rtl" || props.dir === "ltr"
      ? props.dir
      : contextDirection === "rtl"
        ? "rtl"
        : undefined;
  const direction = useResolvedDirection(elementRef, explicitDirection);
  React.useImperativeHandle(props.ref, () => elementRef.current!);
  const value = state.color.toFormat(colorSpace);
  const xRange = value.getChannelRange(xChannel);
  const yRange = value.getChannelRange(yChannel);
  const x = value.getChannelValue(xChannel) / xRange.maxValue;
  const y = value.getChannelValue(yChannel) / yRange.maxValue;
  const position = React.useRef(value);
  const setPosition = (clientX: number, clientY: number, element: HTMLDivElement) => {
    const box = element.getBoundingClientRect();
    if (!box.width || !box.height || state.disabled || state.readOnly) return;
    const horizontal = bounded((clientX - box.left) / box.width, 0, 1);
    const next = value
      .withChannelValue(
        xChannel,
        (direction === "rtl" ? 1 - horizontal : horizontal) * xRange.maxValue,
      )
      .withChannelValue(
        yChannel,
        bounded(1 - (clientY - box.top) / box.height, 0, 1) * yRange.maxValue,
      );
    position.current = next;
    state.setColor(next);
  };
  const { id, className, style, onKeyDown, onPointerDown, onPointerMove, onPointerUp } = props;
  return (
    <div
      ref={elementRef}
      dir={props.dir ?? explicitDirection}
      id={id}
      className={cn("fux-color-area", className)}
      role="slider"
      tabIndex={state.disabled ? -1 : 0}
      aria-label={label ?? props["aria-label"] ?? "Saturation and brightness"}
      aria-labelledby={props["aria-labelledby"]}
      aria-disabled={state.disabled || undefined}
      aria-readonly={state.readOnly || undefined}
      aria-valuemin={0}
      aria-valuemax={xRange.maxValue}
      aria-valuenow={Math.round(value.getChannelValue(xChannel))}
      aria-valuetext={`${xChannel} ${Math.round(x * 100)}%, ${yChannel} ${Math.round(y * 100)}%`}
      style={{
        background:
          colorSpace === "hsl" && xChannel === "saturation" && yChannel === "lightness"
            ? `linear-gradient(to top, transparent 50%, white), linear-gradient(to bottom, transparent 50%, black), linear-gradient(to ${direction === "rtl" ? "left" : "right"}, hsl(${value.getChannelValue("hue")} 0% 50%), hsl(${value.getChannelValue("hue")} 100% 50%))`
            : `linear-gradient(to top, #000, transparent), linear-gradient(to ${direction === "rtl" ? "left" : "right"}, #fff, hsl(${value.getChannelValue("hue")} 100% 50%))`,
        ...style,
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event);
        if (event.defaultPrevented || state.disabled || state.readOnly) return;
        const step = event.shiftKey ? 10 : 1;
        const rtl =
          (event.currentTarget.closest("[dir]")?.getAttribute("dir") ?? direction) === "rtl";
        const dx = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
        const dy = event.key === "ArrowUp" ? step : event.key === "ArrowDown" ? -step : 0;
        if (!dx && !dy && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const next = value
          .withChannelValue(
            xChannel,
            event.key === "Home"
              ? 0
              : event.key === "End"
                ? xRange.maxValue
                : value.getChannelValue(xChannel) + dx * (rtl ? -1 : 1),
          )
          .withChannelValue(yChannel, value.getChannelValue(yChannel) + dy);
        state.setColor(next);
        state.commit(next);
      }}
      onPointerDown={(event) => {
        onPointerDown?.(event);
        if (event.defaultPrevented || state.disabled || state.readOnly || event.button !== 0)
          return;
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPosition(event.clientX, event.clientY, event.currentTarget);
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event);
        if (!event.defaultPrevented && event.buttons === 1)
          setPosition(event.clientX, event.clientY, event.currentTarget);
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event);
        if (!event.defaultPrevented) state.commit(position.current);
      }}
    >
      <span
        aria-hidden="true"
        className="fux-color-thumb fux-color-fill"
        style={{
          ...fill(value),
          position: "absolute",
          insetInlineStart: `${x * 100}%`,
          top: `${(1 - y) * 100}%`,
          transform: `translate(${direction === "rtl" ? "50%" : "-50%"}, -50%)`,
        }}
      />
    </div>
  );
}

export interface ColorSliderProps extends ColorRootProps {
  label?: React.ReactNode;
  channel: ColorChannel;
  colorSpace?: ColorSpace;
  orientation?: "horizontal" | "vertical";
}

export function ColorSlider({
  label,
  channel,
  colorSpace,
  orientation = "horizontal",
  ...props
}: ColorSliderProps) {
  const state = useColorState(props);
  const contextDirection = useDirection();
  const elementRef = React.useRef<HTMLDivElement>(null);
  const explicitDirection =
    props.dir === "rtl" || props.dir === "ltr"
      ? props.dir
      : contextDirection === "rtl"
        ? "rtl"
        : undefined;
  const direction = useResolvedDirection(elementRef, explicitDirection);
  React.useImperativeHandle(props.ref, () => elementRef.current!);
  const value = colorSpace ? state.color.toFormat(colorSpace) : state.color;
  const range = value.getChannelRange(channel);
  const labelId = React.useId();
  const start = value.withChannelValue(channel, 0).toString();
  const end = value.withChannelValue(channel, range.maxValue).toString();
  const gradientDirection =
    orientation === "vertical" ? "to top" : direction === "rtl" ? "to left" : "to right";
  const gradient =
    channel === "hue"
      ? `linear-gradient(${gradientDirection}, red, yellow, lime, cyan, blue, magenta, red)`
      : `linear-gradient(${gradientDirection}, ${start}, ${end})`;
  return (
    <DirectionProvider direction={direction}>
      <Slider.Root
        ref={elementRef}
        dir={props.dir ?? explicitDirection}
        id={props.id}
        className={cn("fux-color-slider", "fux-slider", props.className)}
        data-channel={channel}
        style={props.style}
        orientation={orientation}
        value={value.getChannelValue(channel)}
        min={range.minValue}
        max={range.maxValue}
        step={range.step}
        disabled={state.disabled || state.readOnly}
        onValueChange={(next) => state.setColor(value.withChannelValue(channel, next))}
        onValueCommitted={(next) => state.commit(value.withChannelValue(channel, next))}
      >
        <div className="fux-field__heading">
          {label != null && (
            <span id={labelId} className="fux-label">
              {label}
            </span>
          )}
          <output>
            {Math.round(value.getChannelValue(channel) * (channel === "alpha" ? 100 : 1))}
            {channel === "alpha" ? "%" : ""}
          </output>
        </div>
        <Slider.Control
          className="fux-slider__control"
          style={{ paddingInline: orientation === "horizontal" ? 12 : 0 }}
        >
          <Slider.Track
            className="fux-slider__track fux-checker"
            style={{ "--fux-gradient": gradient } as React.CSSProperties}
          >
            <Slider.Thumb
              className="fux-color-thumb fux-color-fill"
              aria-labelledby={label == null ? props["aria-labelledby"] : labelId}
              aria-label={label == null ? (props["aria-label"] ?? channel) : undefined}
              style={fill(value)}
            />
          </Slider.Track>
        </Slider.Control>
      </Slider.Root>
    </DirectionProvider>
  );
}

export interface ColorFieldProps extends ColorRootProps {
  label: React.ReactNode;
  hint?: string;
  error?: string;
  isInvalid?: boolean;
  name?: string;
}
export function ColorField({ label, hint, error, isInvalid, name, ...props }: ColorFieldProps) {
  const state = useColorState(props);
  const id = React.useId();
  const current = state.color.toString(state.color.getChannelValue("alpha") < 1 ? "hexa" : "hex");
  const [draft, setDraft] = React.useState(current);
  React.useEffect(() => setDraft(current), [current]);
  const commit = () => {
    try {
      const next = parseColor(draft);
      state.setColor(next);
      state.commit(next);
      setDraft(
        state.controlled
          ? current
          : next.toString(next.getChannelValue("alpha") < 1 ? "hexa" : "hex"),
      );
    } catch {
      setDraft(current);
    }
  };
  const invalid = Boolean(error) || isInvalid;
  return (
    <div
      ref={props.ref}
      id={props.id}
      className={cn("fux-field", "fux-color-field", props.className)}
      style={props.style}
    >
      <label className="fux-label" htmlFor={id}>
        {label}
      </label>
      <div className="fux-color-field__control">
        <span
          aria-hidden="true"
          className="fux-color-field__chip fux-color-fill fux-checker"
          style={fill(state.color)}
        />
        <Input
          id={id}
          name={name}
          className="fux-color-field__input"
          value={draft}
          disabled={state.disabled}
          readOnly={state.readOnly}
          autoComplete="off"
          spellCheck={false}
          aria-invalid={invalid || undefined}
          aria-describedby={hint || error ? `${id}-details` : undefined}
          onChange={(event) => {
            if (!state.disabled && !state.readOnly) setDraft(event.target.value);
          }}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            }
            if (event.key === "Escape") setDraft(current);
          }}
        />
      </div>
      {(hint || error) && (
        <span
          id={`${id}-details`}
          className={cn("fux-field-message", error ? "fux-error" : "fux-hint")}
        >
          {error && <CircleAlertIcon aria-hidden="true" />}
          <span>{error ?? hint}</span>
        </span>
      )}
    </div>
  );
}

export type ColorSwatchSize = "sm" | "md" | "lg";
export interface ColorSwatchProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "color"> {
  color?: ColorInput;
  size?: ColorSwatchSize;
  ref?: React.Ref<HTMLDivElement>;
}
export function ColorSwatch({ color, size = "md", style, className, ...props }: ColorSwatchProps) {
  const parent = React.useContext(ColorContext);
  const value = color ? parseColor(color) : (parent?.color ?? parseColor("#000000"));
  return (
    <div
      {...props}
      role="img"
      aria-label={props["aria-label"] ?? value.toString("hex")}
      data-size={size}
      className={cn("fux-color-swatch fux-checker", className)}
      style={style}
    >
      <span className="fux-color-swatch__fill" style={{ backgroundColor: value.toString() }} />
    </div>
  );
}

export interface ColorSwatchOption {
  color: ColorInput;
  label?: string;
  isDisabled?: boolean;
  disabled?: boolean;
}
export interface ColorSwatchPickerProps extends ColorRootProps {
  label: string;
  size?: ColorSwatchSize;
  colors: readonly (string | ColorSwatchOption)[];
}
export function ColorSwatchPicker({
  label,
  colors,
  size = "md",
  ...props
}: ColorSwatchPickerProps) {
  const state = useColorState(props);
  const direction = useDirection();
  return (
    <div
      ref={props.ref}
      className={cn("fux-color-swatches", props.className)}
      role="listbox"
      aria-label={label}
      data-size={size}
      style={props.style}
    >
      {colors.map((entry, index) => {
        const item = typeof entry === "string" ? { color: entry } : entry;
        const value = parseColor(item.color);
        const disabled = state.disabled || item.isDisabled || item.disabled;
        const selected = state.color.toString("hexa") === value.toString("hexa");
        return (
          <button
            key={index}
            type="button"
            role="option"
            aria-label={item.label ?? value.toString("hex")}
            aria-selected={selected}
            aria-disabled={disabled || undefined}
            disabled={disabled}
            data-size={size}
            className="fux-color-swatch fux-checker"
            onClick={() => {
              state.setColor(value);
              state.commit(value);
            }}
            onKeyDown={(event) => {
              if (
                !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(
                  event.key,
                )
              )
                return;
              event.preventDefault();
              const buttons = Array.from(
                event.currentTarget.parentElement!.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              );
              const current = buttons.indexOf(event.currentTarget);
              const rtl =
                (event.currentTarget.closest("[dir]")?.getAttribute("dir") ?? direction) === "rtl";
              const increment =
                event.key === "ArrowLeft"
                  ? rtl
                    ? 1
                    : -1
                  : event.key === "ArrowRight"
                    ? rtl
                      ? -1
                      : 1
                    : event.key === "ArrowUp"
                      ? -1
                      : 1;
              const next =
                event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? buttons.length - 1
                    : (current + increment + buttons.length) % buttons.length;
              buttons[next]?.focus();
            }}
          >
            <span
              className="fux-color-swatch__fill"
              style={{ backgroundColor: value.toString() }}
            />
            {selected && (
              <CheckIcon
                aria-hidden="true"
                className="fux-color-swatch__check"
                style={{ color: readableOn(value) }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export interface ColorWheelProps extends ColorRootProps {
  label?: string;
  outerRadius?: number;
  innerRadius?: number;
}
export function ColorWheel({
  label,
  outerRadius = 112,
  innerRadius = 88,
  ...props
}: ColorWheelProps) {
  const state = useColorState(props);
  const direction = useDirection();
  const latest = React.useRef(state.color);
  const hue = state.color.getChannelValue("hue");
  const radius = (outerRadius + innerRadius) / 2;
  const pointer = (event: React.PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const angle =
      ((Math.atan2(
        event.clientY - box.top - box.height / 2,
        event.clientX - box.left - box.width / 2,
      ) *
        180) /
        Math.PI +
        360) %
      360;
    latest.current = state.color.withChannelValue("hue", angle);
    state.setColor(latest.current);
  };
  return (
    <div
      ref={props.ref}
      role="slider"
      tabIndex={state.disabled ? -1 : 0}
      aria-label={label ?? props["aria-label"] ?? "Hue"}
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hue)}
      aria-valuetext={`${Math.round(hue)} degrees`}
      aria-disabled={state.disabled || undefined}
      className={cn("fux-color-wheel", props.className)}
      style={{ width: outerRadius * 2, height: outerRadius * 2, ...props.style }}
      onKeyDown={(event) => {
        if (state.disabled || state.readOnly) return;
        const delta =
          event.key === "ArrowRight" || event.key === "ArrowUp"
            ? 1
            : event.key === "ArrowLeft" || event.key === "ArrowDown"
              ? -1
              : 0;
        if (!delta && event.key !== "Home" && event.key !== "End") return;
        event.preventDefault();
        const horizontal = event.key === "ArrowRight" || event.key === "ArrowLeft";
        const rtl =
          (event.currentTarget.closest("[dir]")?.getAttribute("dir") ?? direction) === "rtl";
        const increment = horizontal && rtl ? -delta : delta;
        const next = state.color.withChannelValue(
          "hue",
          event.key === "Home"
            ? 0
            : event.key === "End"
              ? 360
              : (hue + increment * (event.shiftKey ? 10 : 1) + 360) % 360,
        );
        state.setColor(next);
        state.commit(next);
      }}
      onPointerDown={(event) => {
        if (state.disabled || state.readOnly || event.button !== 0) return;
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        pointer(event);
      }}
      onPointerMove={(event) => {
        if (!state.disabled && !state.readOnly && event.buttons === 1) pointer(event);
      }}
      onPointerUp={() => state.commit(latest.current)}
    >
      <span
        className="fux-color-wheel__track"
        aria-hidden="true"
        style={{
          background: "conic-gradient(from 90deg, red, yellow, lime, cyan, blue, magenta, red)",
          mask: `radial-gradient(transparent ${innerRadius}px, #000 ${innerRadius + 1}px)`,
        }}
      />
      <span
        aria-hidden="true"
        className="fux-color-wheel__preview fux-color-fill fux-checker"
        style={{
          ...fill(state.color),
          width: innerRadius * 1.1,
          height: innerRadius * 1.1,
        }}
      />
      <span
        aria-hidden="true"
        className="fux-color-thumb fux-color-fill"
        style={{
          ...fill(`hsl(${hue} 100% 50%)`),
          left: outerRadius + Math.cos((hue * Math.PI) / 180) * radius,
          top: outerRadius + Math.sin((hue * Math.PI) / 180) * radius,
          transform: "translate(-50%, -50%)",
        }}
      />
    </div>
  );
}

export interface ColorPickerProps extends ColorStateProps {
  label: string;
  colors?: ColorSwatchPickerProps["colors"];
  showAlpha?: boolean;
  labels?: { hue?: string; alpha?: string; value?: string; presets?: string; area?: string };
  children?: React.ReactNode;
}
export function ColorPicker({
  label,
  colors,
  showAlpha = true,
  labels,
  children,
  ...props
}: ColorPickerProps) {
  const state = useColorState(props);
  return (
    <ColorContext.Provider value={state}>
      <fieldset className="fux-color-picker" disabled={state.disabled}>
        <legend className="sr-only">{label}</legend>
        <div className="fux-color-picker__header" aria-hidden="true">
          <span className="fux-color-picker__title">{label}</span>
        </div>
        <ColorArea label={labels?.area ?? `${label} saturation and brightness`} colorSpace="hsb" />
        <ColorSlider channel="hue" colorSpace="hsb" label={labels?.hue ?? "Hue"} />
        {showAlpha && <ColorSlider channel="alpha" label={labels?.alpha ?? "Opacity"} />}
        <ColorField label={labels?.value ?? "Color value"} />
        {colors && <ColorSwatchPicker label={labels?.presets ?? "Preset colors"} colors={colors} />}
        {children}
      </fieldset>
    </ColorContext.Provider>
  );
}
