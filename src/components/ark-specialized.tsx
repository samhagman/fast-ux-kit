"use client";

import { createElement, useId, type ComponentType, type ComponentProps } from "react";
import { AngleSlider as OwnerAngleSlider } from "@ark-ui/react/angle-slider";
import { Avatar as OwnerAvatar } from "@ark-ui/react/avatar";
import { Clipboard as OwnerClipboard } from "@ark-ui/react/clipboard";
import { Drawer as OwnerDrawer } from "@ark-ui/react/drawer";
import { Editable as OwnerEditable } from "@ark-ui/react/editable";
import { Fieldset as OwnerFieldset } from "@ark-ui/react/fieldset";
import { FileUpload as OwnerFileUpload } from "@ark-ui/react/file-upload";
import { HoverCard as OwnerHoverCard } from "@ark-ui/react/hover-card";
import { JsonTreeView as OwnerJsonTreeView } from "@ark-ui/react/json-tree-view";
import { Marquee as OwnerMarquee } from "@ark-ui/react/marquee";
import { NavigationMenu as OwnerNavigationMenu } from "@ark-ui/react/navigation-menu";
import { PasswordInput as OwnerPasswordInput } from "@ark-ui/react/password-input";
import { PinInput as OwnerPinInput } from "@ark-ui/react/pin-input";
import { QrCode as OwnerQrCode } from "@ark-ui/react/qr-code";
import { RatingGroup as OwnerRatingGroup } from "@ark-ui/react/rating-group";
import { ScrollArea as OwnerScrollArea } from "@ark-ui/react/scroll-area";
import { SegmentGroup as OwnerSegmentGroup } from "@ark-ui/react/segment-group";
import { Splitter as OwnerSplitter } from "@ark-ui/react/splitter";
import { Steps as OwnerSteps } from "@ark-ui/react/steps";
import { TagsInput as OwnerTagsInput } from "@ark-ui/react/tags-input";
import { Timer as OwnerTimer } from "@ark-ui/react/timer";
import { Toast as OwnerToast } from "@ark-ui/react/toast";
import { Toc as OwnerToc } from "@ark-ui/react/toc";
import { DownloadTrigger as OwnerDownloadTrigger } from "@ark-ui/react/download-trigger";
import { Toaster as OwnerToaster } from "@ark-ui/react/toast";

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
      if (key.endsWith("Context") || key[0] === key[0]?.toLowerCase()) return [key, Component];
      const anatomy = key.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      return [key, part(Component, `fux-ark fux-${name}__${anatomy}`)];
    }),
  ) as T;
}
function replaceParts<T extends object>(parts: T, replacements: Partial<T>): T {
  return { ...parts, ...replacements };
}

// These compound families have targeted anatomy styles and runnable complete
// compositions. Never compose a second interaction owner through asChild.
export const AngleSlider: typeof OwnerAngleSlider = /* @__PURE__ */ family(
  OwnerAngleSlider,
  "angle-slider",
);
export const Avatar: typeof OwnerAvatar = /* @__PURE__ */ family(OwnerAvatar, "avatar");
export const Clipboard: typeof OwnerClipboard = /* @__PURE__ */ family(OwnerClipboard, "clipboard");
export const Drawer: typeof OwnerDrawer = /* @__PURE__ */ family(OwnerDrawer, "drawer");
export const Editable: typeof OwnerEditable = /* @__PURE__ */ family(OwnerEditable, "editable");
export const Fieldset: typeof OwnerFieldset = /* @__PURE__ */ family(OwnerFieldset, "fieldset");
export const FileUpload: typeof OwnerFileUpload = /* @__PURE__ */ family(
  OwnerFileUpload,
  "file-upload",
);
export const HoverCard: typeof OwnerHoverCard = /* @__PURE__ */ family(
  OwnerHoverCard,
  "hover-card",
);
export const JsonTreeView: typeof OwnerJsonTreeView = /* @__PURE__ */ family(
  OwnerJsonTreeView,
  "json-tree-view",
);
export const Marquee: typeof OwnerMarquee = /* @__PURE__ */ family(OwnerMarquee, "marquee");
export const NavigationMenu: typeof OwnerNavigationMenu = /* @__PURE__ */ family(
  OwnerNavigationMenu,
  "navigation-menu",
);
const passwordInputParts = /* @__PURE__ */ family(OwnerPasswordInput, "password-input");
/** Keep the owner's pointer handling, and route native keyboard/AT clicks into
 * the same state machine. The owner default trigger is pointer-only/tabIndex -1. */
function PasswordVisibilityTrigger(
  props: ComponentProps<typeof OwnerPasswordInput.VisibilityTrigger>,
) {
  return (
    <OwnerPasswordInput.Context>
      {(api) => (
        <passwordInputParts.VisibilityTrigger
          {...props}
          tabIndex={props.tabIndex ?? 0}
          onClick={(event) => {
            props.onClick?.(event);
            if (!event.defaultPrevented && event.detail === 0 && !api.disabled) api.toggleVisible();
          }}
        />
      )}
    </OwnerPasswordInput.Context>
  );
}
export const PasswordInput: typeof OwnerPasswordInput = /* @__PURE__ */ replaceParts(
  passwordInputParts,
  {
    VisibilityTrigger: PasswordVisibilityTrigger as typeof OwnerPasswordInput.VisibilityTrigger,
  },
);
export const PinInput: typeof OwnerPinInput = /* @__PURE__ */ family(OwnerPinInput, "pin-input");
export const QrCode: typeof OwnerQrCode = /* @__PURE__ */ family(OwnerQrCode, "qr-code");
export const RatingGroup: typeof OwnerRatingGroup = /* @__PURE__ */ family(
  OwnerRatingGroup,
  "rating-group",
);
export const ScrollArea: typeof OwnerScrollArea = /* @__PURE__ */ family(
  OwnerScrollArea,
  "scroll-area",
);
export const SegmentGroup: typeof OwnerSegmentGroup = /* @__PURE__ */ family(
  OwnerSegmentGroup,
  "segment-group",
);
export const Splitter: typeof OwnerSplitter = /* @__PURE__ */ family(OwnerSplitter, "splitter");
export const Steps: typeof OwnerSteps = /* @__PURE__ */ family(OwnerSteps, "steps");
export const TagsInput: typeof OwnerTagsInput = /* @__PURE__ */ family(
  OwnerTagsInput,
  "tags-input",
);
export const Timer: typeof OwnerTimer = /* @__PURE__ */ family(OwnerTimer, "timer");
export const Toast: typeof OwnerToast = /* @__PURE__ */ family(OwnerToast, "toast");
const tocParts = /* @__PURE__ */ family(OwnerToc, "toc");
function TocNav(props: ComponentProps<typeof OwnerToc.Nav>) {
  const id = useId();
  return <tocParts.Nav {...props} id={props.id ?? `fux-toc-nav-${id}`} />;
}
export const Toc: typeof OwnerToc = /* @__PURE__ */ replaceParts(tocParts, {
  Nav: TocNav as typeof OwnerToc.Nav,
});
export const DownloadTrigger: typeof OwnerDownloadTrigger = /* @__PURE__ */ part(
  OwnerDownloadTrigger,
  "fux-control",
);
export const Toaster: typeof OwnerToaster = /* @__PURE__ */ part(OwnerToaster, "fux-toaster");
export { createToaster } from "@ark-ui/react/toast";
export { useTour } from "@ark-ui/react/tour";
export { Portal } from "@ark-ui/react/portal";
export { createTreeCollection } from "@ark-ui/react/collection";
