"use client";

import * as A from "react-aria-components";
import type { ReactNode, Ref } from "react";
import * as P from "./primitives.js";

export interface ColorAreaProps extends Omit<A.ColorAreaProps, "children" | "className"> {
  label?: string;
  ref?: Ref<HTMLDivElement>;
}
/** Two keyboard-operable channels, with owner-provided color gradients. */
export function ColorArea({ label, ...props }: ColorAreaProps) {
  return (
    <P.ColorArea {...props} aria-label={label ?? props["aria-label"]}>
      <P.ColorThumb />
    </P.ColorArea>
  );
}
export interface ColorSliderProps extends Omit<A.ColorSliderProps, "children" | "className"> {
  label?: ReactNode;
  ref?: Ref<HTMLDivElement>;
}
export function ColorSlider({ label, ...props }: ColorSliderProps) {
  return (
    <P.ColorSlider {...props}>
      <div className="fux-field__heading">
        <P.Label>{label}</P.Label>
        <P.SliderOutput />
      </div>
      <P.SliderTrack>
        <P.ColorThumb />
      </P.SliderTrack>
    </P.ColorSlider>
  );
}
export interface ColorFieldProps extends Omit<A.ColorFieldProps, "children" | "className"> {
  label: ReactNode;
  hint?: string;
  error?: string;
  ref?: Ref<HTMLDivElement>;
}
export function ColorField({ label, hint, error, ...props }: ColorFieldProps) {
  return (
    <P.ColorField {...props} isInvalid={Boolean(error) || props.isInvalid}>
      <P.Label>{label}</P.Label>
      <P.Input />
      {hint && <P.Text slot="description">{hint}</P.Text>}
      <P.FieldError>{error}</P.FieldError>
    </P.ColorField>
  );
}
export const ColorSwatch = P.ColorSwatch;
export type ColorSwatchProps = A.ColorSwatchProps;
export interface ColorSwatchOption {
  color: A.ColorSwatchPickerItemProps["color"];
  label?: string;
  isDisabled?: boolean;
}
export interface ColorSwatchPickerProps extends Omit<
  A.ColorSwatchPickerProps,
  "children" | "className"
> {
  label: string;
  colors: readonly (string | ColorSwatchOption)[];
  ref?: Ref<HTMLDivElement>;
}
export function ColorSwatchPicker({ label, colors, ...props }: ColorSwatchPickerProps) {
  return (
    <P.ColorSwatchPicker {...props} aria-label={label}>
      {colors.map((entry, index) => {
        const item = typeof entry === "string" ? { color: entry } : entry;
        return (
          <P.ColorSwatchPickerItem
            key={`${String(item.color)}-${index}`}
            color={item.color}
            aria-label={item.label}
            isDisabled={item.isDisabled}
          >
            <P.ColorSwatch />
          </P.ColorSwatchPickerItem>
        );
      })}
    </P.ColorSwatchPicker>
  );
}
export interface ColorWheelProps extends Omit<
  A.ColorWheelProps,
  "children" | "className" | "outerRadius" | "innerRadius"
> {
  outerRadius?: number;
  innerRadius?: number;
  label?: string;
  ref?: Ref<HTMLDivElement>;
}
export function ColorWheel({
  label,
  outerRadius = 112,
  innerRadius = 88,
  ...props
}: ColorWheelProps) {
  return (
    <P.ColorWheel
      {...props}
      outerRadius={outerRadius}
      innerRadius={innerRadius}
      aria-label={label ?? props["aria-label"]}
    >
      <P.ColorWheelTrack />
      <P.ColorThumb />
    </P.ColorWheel>
  );
}
export interface ColorPickerProps extends Omit<A.ColorPickerProps, "children"> {
  label: string;
  colors?: ColorSwatchPickerProps["colors"];
  showAlpha?: boolean;
  labels?: { hue?: string; alpha?: string; value?: string; presets?: string; area?: string };
}
/** A complete inline editor. The single owner context synchronizes every channel. */
export function ColorPicker({
  label,
  colors,
  showAlpha = true,
  labels,
  ...props
}: ColorPickerProps) {
  return (
    <A.ColorPicker {...props}>
      <fieldset className="fux-color-picker">
        <legend className="fux-label">{label}</legend>
        <ColorArea
          label={labels?.area ?? `${label}: saturation and brightness`}
          colorSpace="hsb"
          xChannel="saturation"
          yChannel="brightness"
        />
        <ColorSlider channel="hue" colorSpace="hsb" label={labels?.hue ?? "Hue"} />
        {showAlpha && <ColorSlider channel="alpha" label={labels?.alpha ?? "Opacity"} />}
        <div className="fux-color-picker__value">
          <ColorSwatch />
          <ColorField label={labels?.value ?? "Color value"} />
        </div>
        {colors && <ColorSwatchPicker label={labels?.presets ?? "Preset colors"} colors={colors} />}
      </fieldset>
    </A.ColorPicker>
  );
}
export { parseColor } from "react-aria-components";
