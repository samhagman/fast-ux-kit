"use client";

import {
  Button as AriaButton,
  TextField,
  Input,
  Label,
  Text,
  FieldError,
  Checkbox as AriaCheckbox,
  Link as AriaLink,
  ModalOverlay,
  Modal,
  Dialog as AriaDialog,
  Heading,
} from "react-aria-components";
import type {
  ButtonProps as AriaButtonProps,
  TextFieldProps,
  CheckboxProps as AriaCheckboxProps,
  LinkProps as AriaLinkProps,
} from "react-aria-components";
import type { ReactNode, Ref, HTMLAttributes } from "react";

export type ControlVariant = "primary" | "secondary" | "quiet" | "danger";
export type ControlSize = "regular" | "compact";
export interface ButtonProps extends Omit<AriaButtonProps, "className" | "style"> {
  variant?: ControlVariant;
  size?: ControlSize;
  fullWidth?: boolean;
  ref?: Ref<HTMLButtonElement>;
}
/** React Aria owns presses, keyboard activation and focus. */
export function Button({
  variant = "secondary",
  size = "regular",
  fullWidth = false,
  ...props
}: ButtonProps) {
  return (
    <AriaButton
      {...props}
      className="fux-control"
      data-variant={variant}
      data-size={size}
      data-full={fullWidth || undefined}
    />
  );
}
export interface IconButtonProps extends Omit<ButtonProps, "aria-label" | "children"> {
  label: string;
  children: ReactNode;
}
/** Children must be decorative, non-interactive icon content. */
export function IconButton({ label, children, ...props }: IconButtonProps) {
  return (
    <Button variant="quiet" {...props} aria-label={label} data-icon="true">
      <span aria-hidden="true">{children}</span>
    </Button>
  );
}
export interface FieldProps extends Omit<TextFieldProps, "children" | "className" | "style"> {
  label: string;
  hint?: string;
  error?: string;
  placeholder?: string;
  ref?: Ref<HTMLDivElement>;
}
export function Field({ label, hint, error, placeholder, ...props }: FieldProps) {
  return (
    <TextField {...props} className="fux-field" isInvalid={Boolean(error) || props.isInvalid}>
      <Label className="fux-label">{label}</Label>
      <Input className="fux-input" placeholder={placeholder} />
      {hint && (
        <Text slot="description" className="fux-hint">
          {hint}
        </Text>
      )}
      <FieldError className="fux-error">{error}</FieldError>
    </TextField>
  );
}
export interface CheckboxProps extends Omit<AriaCheckboxProps, "children" | "className" | "style"> {
  label: ReactNode;
  ref?: Ref<HTMLLabelElement>;
}
export function Checkbox({ label, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox {...props} className="fux-checkbox">
      {({ isSelected, isIndeterminate }) => (
        <>
          <span className="fux-checkbox__mark" aria-hidden="true">
            {isIndeterminate ? "−" : isSelected ? "✓" : ""}
          </span>
          <span>{label}</span>
        </>
      )}
    </AriaCheckbox>
  );
}
export interface LinkProps extends Omit<AriaLinkProps, "className" | "style"> {
  variant?: "inline" | "block";
  className?: string;
  ref?: Ref<HTMLAnchorElement>;
}
export function Link({ variant = "inline", className = "", ...props }: LinkProps) {
  return <AriaLink {...props} className={`fux-link ${className}`} data-variant={variant} />;
}
export interface ModalDialogProps {
  title: string;
  children: ReactNode;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  closeLabel?: string;
  footer?: ReactNode;
}
/** React Aria alone owns the modal portal, focus containment, Escape and dismissal. */
export function ModalDialog({
  title,
  children,
  isOpen,
  onOpenChange,
  closeLabel = "Close",
  footer,
}: ModalDialogProps) {
  return (
    <ModalOverlay isOpen={isOpen} onOpenChange={onOpenChange} isDismissable className="fux-overlay">
      <Modal className="fux-modal">
        <AriaDialog className="fux-dialog">
          {({ close }) => (
            <>
              <header className="fux-dialog__header">
                <Heading slot="title">{title}</Heading>
                <Button variant="quiet" onPress={close}>
                  {closeLabel}
                </Button>
              </header>
              <div className="fux-dialog__body">{children}</div>
              {footer && <footer className="fux-dialog__footer">{footer}</footer>}
            </>
          )}
        </AriaDialog>
      </Modal>
    </ModalOverlay>
  );
}
export type Space = "none" | "xs" | "sm" | "md" | "lg" | "xl";
export type Align = "start" | "center" | "end" | "stretch";
export interface LayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
  gap?: Space;
  align?: Align;
  justify?: "start" | "center" | "end" | "between";
  wrap?: boolean;
  ref?: Ref<HTMLDivElement>;
}
export function Stack({
  gap = "md",
  align = "stretch",
  justify = "start",
  wrap = false,
  className = "",
  ...props
}: LayoutProps) {
  return (
    <div
      {...props}
      className={`fux-stack ${className}`}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap || undefined}
    />
  );
}
export type RowProps = LayoutProps;
export function Row({
  gap = "md",
  align = "center",
  justify = "start",
  wrap = false,
  className = "",
  ...props
}: RowProps) {
  return (
    <div
      {...props}
      className={`fux-row ${className}`}
      data-gap={gap}
      data-align={align}
      data-justify={justify}
      data-wrap={wrap || undefined}
    />
  );
}
export interface PanelProps extends Omit<HTMLAttributes<HTMLElement>, "style"> {
  padding?: Space;
  tone?: "base" | "raised" | "tinted";
  as?: "div" | "section";
}
export function Panel({
  padding = "lg",
  tone = "base",
  as: Element = "div",
  className = "",
  ...props
}: PanelProps) {
  return (
    <Element
      {...props}
      className={`fux-panel ${className}`}
      data-padding={padding}
      data-tone={tone}
    />
  );
}

export * as Primitives from "./primitives.js";
export * from "./colors.js";
export * from "./dates.js";
export * from "./inputs.js";
export * from "./collections.js";
export * from "./feedback.js";
