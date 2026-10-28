"use client";
import * as A from "react-aria-components";
import type { ComponentProps, ReactElement, ReactNode, Ref } from "react";
import * as P from "./primitives.js";

export interface ProgressBarProps extends Omit<A.ProgressBarProps, "children" | "className"> {
  label: ReactNode;
  showValue?: boolean;
  ref?: Ref<HTMLDivElement>;
}
export function ProgressBar({ label, showValue = true, ...props }: ProgressBarProps) {
  return (
    <P.ProgressBar {...props}>
      {({ percentage, valueText, isIndeterminate }) => (
        <>
          <div className="fux-field__heading">
            <P.Label>{label}</P.Label>
            {showValue && <span className="fux-hint">{valueText}</span>}
          </div>
          <div className="fux-meter__track">
            <div
              className="fux-meter__fill"
              data-indeterminate={isIndeterminate || undefined}
              style={{ inlineSize: isIndeterminate ? "40%" : `${percentage}%` }}
            />
          </div>
        </>
      )}
    </P.ProgressBar>
  );
}
export interface MeterProps extends Omit<A.MeterProps, "children" | "className"> {
  label: ReactNode;
  showValue?: boolean;
  ref?: Ref<HTMLDivElement>;
}
export function Meter({ label, showValue = true, ...props }: MeterProps) {
  return (
    <P.Meter {...props}>
      {({ percentage, valueText }) => (
        <>
          <div className="fux-field__heading">
            <P.Label>{label}</P.Label>
            {showValue && <span className="fux-hint">{valueText}</span>}
          </div>
          <div className="fux-meter__track">
            <div className="fux-meter__fill" style={{ inlineSize: `${percentage}%` }} />
          </div>
        </>
      )}
    </P.Meter>
  );
}
export interface TooltipProps extends Omit<ComponentProps<typeof A.TooltipTrigger>, "children"> {
  children: ReactElement;
  content: ReactNode;
  placement?: A.TooltipProps["placement"];
}
/** The trigger must be one focusable owner component, never another overlay manager. */
export function Tooltip({ children, content, placement = "top", ...props }: TooltipProps) {
  return (
    <P.TooltipTrigger {...props}>
      {children}
      <P.Tooltip placement={placement}>{content}</P.Tooltip>
    </P.TooltipTrigger>
  );
}
export interface PopoverProps extends Omit<A.DialogTriggerProps, "children"> {
  trigger: ReactElement;
  title: string;
  children: ReactNode;
  placement?: A.PopoverProps["placement"];
}
export function Popover({
  trigger,
  title,
  children,
  placement = "bottom",
  ...props
}: PopoverProps) {
  return (
    <P.DialogTrigger {...props}>
      {trigger}
      <P.Popover placement={placement}>
        <P.Dialog>
          <P.Heading slot="title">{title}</P.Heading>
          {children}
        </P.Dialog>
      </P.Popover>
    </P.DialogTrigger>
  );
}
export const Dialog: typeof A.Dialog = P.Dialog;
export const DropZone: typeof A.DropZone = P.DropZone;
export const FileTrigger: typeof A.FileTrigger = P.FileTrigger;
