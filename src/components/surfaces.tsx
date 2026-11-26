"use client";

import * as React from "react";
import { themeScopeProperties, type ThemeScopeTokens } from "../core/theme-scope.js";
import { cn } from "../lib/utils.js";

export type { ThemeScopeTokens } from "../core/theme-scope.js";

export interface FrameProps extends React.ComponentProps<"div"> {
  /** `browser` draws a browser's top bar above the content; `none` draws only the frame. */
  readonly chrome?: "browser" | "none";
  /** The address the browser bar shows, as plain text. */
  readonly url?: string;
  /** Names the framed mock-up for assistive technology; the frame becomes a labelled group. */
  readonly label?: string;
}

/**
 * A framed surface for a page or app mock-up. The browser bar is decoration, hidden from
 * assistive technology; the content keeps its own semantics. Put `data-kit-boundary` on custom
 * content inside it to keep the kit's article and rich-content base styles off that content.
 */
export function Frame({
  chrome = "browser",
  url,
  label,
  className,
  children,
  ...props
}: FrameProps) {
  return (
    <div
      role={label ? "group" : undefined}
      aria-label={label}
      {...props}
      data-slot="frame"
      data-chrome={chrome}
      className={cn("fux-frame", className)}
    >
      {chrome === "browser" && (
        <div className="fux-frame-bar" aria-hidden="true">
          <span className="fux-frame-dots">
            <span />
            <span />
            <span />
          </span>
          {url ? (
            <span className="fux-frame-address" dir="ltr">
              {url}
            </span>
          ) : null}
        </div>
      )}
      <div className="fux-frame-viewport" data-slot="frame-viewport">
        {children}
      </div>
    </div>
  );
}

export interface ThemeScopeProps extends React.ComponentProps<"div"> {
  /** The sub-theme's inputs. Each maps onto every kit token it stands for; omitted ones keep
   * the surrounding theme. A value may be a `var()`, even one naming the token it feeds. */
  readonly tokens: ThemeScopeTokens;
}

/**
 * A sub-theme for a subtree: a small set of inputs mapped onto the kit's full token set. Props go
 * to the inner element, which is the subtree's box. Overlays render in the page's portal, outside
 * the scope.
 */
export function ThemeScope({ tokens, className, ...props }: ThemeScopeProps) {
  const { properties, given } = themeScopeProperties(tokens);
  return (
    <div
      data-slot="theme-scope-inputs"
      className="fux-theme-inputs"
      style={given.length ? (properties as React.CSSProperties) : undefined}
    >
      <div
        {...props}
        data-slot="theme-scope"
        data-tokens={given.length ? given.join(" ") : undefined}
        className={cn("fux-theme-scope", className)}
      />
    </div>
  );
}
