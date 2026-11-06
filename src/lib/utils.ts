import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The theme's own text sizes (theme.css): without them `text-ui` reads as a colour and a later
// `text-muted-foreground` silently drops it.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["2xs", "ui"] } } });

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
