# Live-formatting input rules

Storage is unchanged: plain markdown-lite source (`inline.tsx`, `rich-note.ts`).
Only the editing surface changes.

## Universal behaviour

1. Typed characters stay visible until a rule completes, then the markup vanishes (`[]` shows until Space; `**bol` until the closing `**`).
2. Backspace right after a conversion takes it back, in a way that depends on the kind:
   - a title line-start rule (heading, checkbox) is undone with one history step, but only while nothing else has happened since;
   - an inline conversion (bold, a link, a chip) turns back into the literal characters typed, stored escaped so it does not convert again.
3. ⌘B / ⌘I / ⌘E / ⇧⌘X / ⇧⌘H never show markup: with a selection they wrap it; with none they toggle the style for what is typed next. Over a range that is only partly styled they add the style to all of it. A format that cannot be written exactly (bold around a literal `*`) does nothing and says so.
4. Chips are atomic (tag, mention, date, item ref, link, URL, math): ←/→ step over in one press; ⌫ deletes the whole chip (⌘Z restores); Enter or click opens its popover editor (date picker, link editor, math editor). A tag, mention, bare URL or math token becomes a chip when the caret leaves it; while the caret is at its end it is still being typed.
5. Line-start rules fire only at offset 0 of a line. In a title they set item attributes, not text.
6. `\` before a markup character keeps it literal (stored `\x`, backslash hidden).
7. Typing straight after a conversion lands outside the new style. A caret placed at the end of an existing style (before its closing delimiter) continues it; ⌘B (etc.) or → at the boundary leaves it. Inline code never extends by typing at its end, except while typing after a collapsed ⌘E: that stays code until ⌘E again or the caret moves.
8. Rules never fire during IME composition.
9. Paste is text/plain only; pasted markdown renders immediately and carries the styles around the caret (`**x**` pasted inside bold stays one bold). Where its formatting cannot be written (an italic right after a `#tag` would join the tag) it goes in as literal text, and the user is told. Copy writes the source text.

## Title: line-start rules (set item attributes)

| Type              | After                                                    | Stored                  |
| ----------------- | -------------------------------------------------------- | ----------------------- |
| `[]␣` or `[ ]␣`   | Checkbox                                                 | `checkbox: true`        |
| `[x]␣`            | Checked checkbox                                         | `checkbox`, `completed` |
| `-␣` `*␣` `+␣`    | Swallowed (already a bullet)                             | nothing                 |
| `1.␣`             | Parent numbers its children                              | parent `numbered: true` |
| `>␣`, `---`, `#␣` | Stay literal (titles have no quote/rule; `#` is a tag's) | text                    |

## Headings: `/1` `/2` `/3`

`#` never makes a heading, in a title or a note: it belongs to tags. Headings come from the item
menu: `/1`, `/2` or `/3` then Enter (the menu's top match is Heading 1–3; nothing runs before
Enter). In a title it makes the row H1–H3 (`heading: 1–3`; the same level again turns it back,
as ⌥⌘1–3 do). In a note it makes the line the menu was opened on a heading (`## Results`), its
list or quote marker going with it; Normal text takes it back. Stored `## Results` in a note
still reads as a heading.

## Inline rules (titles and notes)

| Type                                | After                                                                                                                 | Stored                                                                                             |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `**word**`                          | bold, caret after the style                                                                                           | `**word**`                                                                                         |
| `*word*` / `_word_`                 | italic                                                                                                                | `*word*` (`_word_` is rewritten to `*word*` while typing; stored `__word__` still reads as italic) |
| `~~word~~`                          | strike                                                                                                                | `~~word~~`                                                                                         |
| `` `code` ``                        | inline code                                                                                                           | `` `code` ``                                                                                       |
| `==word==`                          | highlight                                                                                                             | `==word==`                                                                                         |
| `[label](https://…)`                | link showing label                                                                                                    | same                                                                                               |
| bare `https://…` then space         | URL chip                                                                                                              | the URL                                                                                            |
| `#tag`, or `##tag` then space/punct | tag chip `#tag` (autocomplete list while typing); `word##tag` becomes `word #tag`                                     | `#tag`                                                                                             |
| `@na…`                              | mention autocomplete → chip                                                                                           | `@Name`                                                                                            |
| `!`                                 | date picker → date chip                                                                                               | `!(2026-11-03)`                                                                                    |
| `!(… every week)`                   | recurring date chip                                                                                                   | same                                                                                               |
| `!(a → b)` (or `->`)                | date range chip                                                                                                       | same                                                                                               |
| `[[Pla…`                            | item search → ref chip                                                                                                | `[[Title\|id]]`                                                                                    |
| `$tex$`                             | rendered math chip (currency rule from `inline.tsx` applies)                                                          | same                                                                                               |
| `/` at start or after whitespace    | item menu, filter as you type, Enter runs, `/query` removed (in a note: on prose lines, not in code, math or a table) | nothing                                                                                            |
| `\*`                                | literal `*`                                                                                                           | `\*`                                                                                               |

### Stacked styles

Styles nest, one of each kind at a time: `**bold *and italic***`, `~~**struck bold**~~`, `==a **b**==`. `***x***` is bold around italic, the canonical spelling for both. A style never holds its own delimiter as text: `**a\*b**` stays literal, so a format over text holding a literal `*` is refused. Tokens inside a style keep working (`**see `x` #now**`), and a tag or mention may start a style (`**#launch**`).

A single `*` follows the flanking rule: `2*3*4` and `a * b` stay text. A style never crosses a line break.

## Note: block rules (line start)

A note is source text; its blocks are the reading `rich-note.ts` gives it, so most rules need no
code of their own: what is typed is the source, and the line renders as the block it now is.
Block keys (Enter, ⌫ at a block's start, ⌘↵, ↓ out of a block, Tab in a list) are source edits
(`live-field/note-blocks.ts`). Tab outside a list still indents the row.

| Type                             | After                                                                                                                                                                                                                                                              | Stored         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- |
| `/1` `/2` `/3` then ⏎            | the line becomes a heading H1–H3                                                                                                                                                                                                                                   | `## Results`   |
| `#␣`                             | stays text                                                                                                                                                                                                                                                         | `\# `          |
| `-␣` `*␣` `+␣`                   | bullet; Enter adds the next item; Enter on an empty item steps out one level, then leaves the list; Tab nests the item (and its own items) under the one above, ⇧Tab takes it a level out; on the first or a top-level item that has nowhere to go it does nothing | `- item`       |
| `1.␣` (any number)               | ordered list starting there; Enter adds the next number                                                                                                                                                                                                            | `3. item`      |
| `[]␣`, `[ ]␣`, `[x]␣` or `-␣[]␣` | task item; a click on its box or ⌘↵ toggles it; Enter adds an open task                                                                                                                                                                                            | `- [ ] item`   |
| `>␣`                             | quote; Enter continues it; Enter on an empty quoted line leaves                                                                                                                                                                                                    | `> text`       |
| ` ``` ` (+ optional lang) then ⏎ | code block labelled with its lang, closed below the caret; Enter adds a line; ⌘⏎, or ↓ on its last line when it ends the note, leaves                                                                                                                              | fenced block   |
| `$$` then ⏎                      | display math block: its source while the caret is in it, rendered once it leaves                                                                                                                                                                                   | `$$ … $$`      |
| `---` then ⏎                     | rule                                                                                                                                                                                                                                                               | `---`          |
| `\|a\|b\|` then ⏎                | a table: header, delimiter and an empty row; shown as its labelled source while the caret is in it, rendered otherwise (cell editing comes later)                                                                                                                  | GFM pipe table |
| `![alt](https://…)` then ⏎       | image (`=640x360` size, `"title"`), rendered like the static note; Enter on a selected image shows its line again                                                                                                                                                  | same           |

While the caret is on a line that opens a block the editor would hide (`---`, an image, a fence
or `$$` opener), the line stays its plain text, so a fence typed above other text never turns
the rest of the note into code until ⏎.

⌫ at the start of a block takes its marker back: a heading, quote line or list item becomes text
(a nested item steps out, a task loses its box first); right after an empty marker (`## `, `- `)
it only takes back the space, giving back what was typed. At the start of a paragraph it joins
the block above. An empty code or math block goes back to its opener line.

Blank and trailing lines are kept as typed. The caret on a blank line right under a paragraph or
list item is that block's next line (what is typed there continues it, as the source reads); on
any other blank line it stands on an empty paragraph of its own.

The power profile's Enter in a note still finishes it and starts the next item.

## Examples as seen while typing

```
 type:  / 3 ⏎ L a u n c h   p l a n
 • /3▏  ┌ Format › Heading 3 ┐   menu filters, nothing runs yet
 ▏                 ⏎: "/3" vanishes, row is H3
 Launch plan▏      heading size, no markup
 • #launch▏        "#" is always a tag

 Ship **be▏  →  Ship **beta*▏  →  Ship beta▏      (beta bold, markers gone)
 Ship **bold *bo▏  →  Ship **bold *both***▏  →  Ship bold both▏   (both bold, "both" also italic)
 Ship !▏ [picker] choose Tue  →  Ship 📅 Tue 3 Nov ▏
 Ship 📅 Tue 3 Nov▏   ← selects chip   ⏎ reopens picker   ⌫ deletes chip
 Ship ⌘B beta ⌘B now  →  Ship beta now   (only "beta" bold)
```
