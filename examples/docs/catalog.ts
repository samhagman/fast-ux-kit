import { componentUtilities } from "../../src/components/manifest.js";

export const experiencePages = [
  {
    id: "outline",
    name: "Outline reader",
    description:
      "A document you can unfold. Reader-local navigation, rich content and comfortable touch targets, without an editing keyboard.",
    category: "Outliner",
  },
  {
    id: "editor",
    name: "Outline editor",
    description:
      "A direct React editor with structural commands, history, multirow selection, clipboard, import/export and deliberate editing.",
    category: "Outliner",
  },
  {
    id: "outliner-extensions",
    name: "Outliner extensions",
    description:
      "Two ordered plugins, atomic commands, a lossless custom codec and safe application-owned row additions—using only public APIs.",
    category: "Outliner",
  },
  {
    id: "rich-content",
    name: "Rich content",
    description:
      "Readable Markdown, images, media, diagrams and trusted React blocks. Structured data, explicit safety boundaries.",
    category: "Outliner",
  },
  {
    id: "text-intelligence",
    name: "Text intelligence",
    description:
      "Suggestions, references, diagnostics and interactive text information—without changing source text behind your back.",
    category: "Outliner",
  },
  {
    id: "highlight-text",
    name: "HighlightText",
    description:
      "Source-coordinate highlights that stay readable, even when ranges overlap. Optional actions remain keyboard-accessible.",
    category: "Outliner",
  },
] as const;

const slug = (name: string) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/\s+/g, "-");
export const utilityPages = componentUtilities.map((item) => ({
  ...item,
  id: `utility-${slug(item.name)}`,
  category: "Utilities",
  parts: item.exports,
}));
