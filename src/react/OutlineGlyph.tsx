import type { ReactNode } from "react";

/** Small, decorative outline glyphs. The containing control owns the interaction. */
function Glyph({ children }: { readonly children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

export function OutlineChevron() {
  return (
    <Glyph>
      <path d="m8 5 5 5-5 5" />
    </Glyph>
  );
}

export function OutlineBullet({ collapsed = false }: { readonly collapsed?: boolean }) {
  return (
    <Glyph>
      {collapsed && <circle cx="10" cy="10" r="6" />}
      <circle cx="10" cy="10" r="2.5" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

export function OutlineFocus() {
  return (
    <Glyph>
      <path d="M3 7V3h4m6 0h4v4m0 6v4h-4M7 17H3v-4" />
    </Glyph>
  );
}

export function OutlineGrip() {
  return (
    <Glyph>
      <path d="M7 5h.01M13 5h.01M7 10h.01M13 10h.01M7 15h.01M13 15h.01" strokeWidth="2.5" />
    </Glyph>
  );
}

export function OutlineCheck({ checked }: { readonly checked: boolean }) {
  return (
    <Glyph>
      <rect x="2.5" y="2.5" width="15" height="15" rx="3" />
      {checked && <path d="m6 10 2.5 2.5L14 7" />}
    </Glyph>
  );
}
