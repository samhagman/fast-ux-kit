"use client";
import { createElement, type ComponentType } from "react";
import { Carousel as OwnerCarousel } from "@ark-ui/react/carousel";
import { FloatingPanel as OwnerFloatingPanel } from "@ark-ui/react/floating-panel";
import { ImageCropper as OwnerImageCropper } from "@ark-ui/react/image-cropper";
import { SignaturePad as OwnerSignaturePad } from "@ark-ui/react/signature-pad";
import { Tour as OwnerTour } from "@ark-ui/react/tour";

/** Presentation only: refs, polymorphism, prop types and state machines stay intact. */
function part<T>(Component: T, className: string): T {
  const Styled = (props: Record<string, unknown>) =>
    createElement(Component as ComponentType<Record<string, unknown>>, {
      ...props,
      className:
        `${className} ${typeof props.className === "string" ? props.className : ""}`.trim(),
    });
  return Styled as T;
}
function family<T extends object>(owner: T, name: string): T {
  return Object.fromEntries(
    Object.entries(owner).map(([key, Component]) => {
      // Context callbacks and utilities have no rendered element to style.
      if (key.endsWith("Context") || key === "Actions" || key[0] === key[0]?.toLowerCase())
        return [key, Component];
      const anatomy = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      return [key, part(Component, `fux-ark fux-${name}__${anatomy}`)];
    }),
  ) as T;
}

export const Carousel: typeof OwnerCarousel = /* @__PURE__ */ family(OwnerCarousel, "carousel");
export const FloatingPanel: typeof OwnerFloatingPanel = /* @__PURE__ */ family(
  OwnerFloatingPanel,
  "floating-panel",
);
export const ImageCropper: typeof OwnerImageCropper = /* @__PURE__ */ family(
  OwnerImageCropper,
  "image-cropper",
);
export const SignaturePad: typeof OwnerSignaturePad = /* @__PURE__ */ family(
  OwnerSignaturePad,
  "signature-pad",
);
export const Tour: typeof OwnerTour = /* @__PURE__ */ family(OwnerTour, "tour");
export { Portal } from "@ark-ui/react/portal";
export { useTour } from "@ark-ui/react/tour";
