// Demos for the text styles: Heading, Text, Eyebrow and DescriptionList. The headings here are
// h5 and h6 because they sit under the gallery's own page, category, family and variant headings.
import * as C from "@samhagman/fast-ux-kit/components";
import { type ComponentFixture, Variants, example } from "./fixture-kit";

const sizes = ["display", "title", "section", "subsection"] as const;
const tones = ["default", "muted", "info", "success", "warning", "error"] as const;

export const textFixtures: Readonly<Record<string, ComponentFixture>> = {
  Heading: example(
    "level is the element and size is the look, so a small level can still read as a page title.",
    () => (
      <>
        <div className="flex flex-col gap-1">
          <C.Eyebrow>Fieldbook</C.Eyebrow>
          <C.Heading level={5} size="display">
            Spring survey notes
          </C.Heading>
        </div>
        <Variants title="Sizes, all h5" layout="stack">
          {sizes.map((size) => (
            <C.Heading key={size} level={5} size={size}>
              {`size="${size}"`}
            </C.Heading>
          ))}
        </Variants>
        <Variants title="Display in a narrow container" layout="stack">
          <div className="w-60 max-w-full rounded-md border border-dashed border-border p-3 @container">
            <C.Heading level={6} size="display">
              Spring survey
            </C.Heading>
          </div>
        </Variants>
        <Variants title="Right to left" layout="stack">
          <div dir="rtl" lang="ar" className="flex w-full flex-col gap-1">
            <C.Eyebrow>دفتر الحقل</C.Eyebrow>
            <C.Heading level={5} size="title">
              ملاحظات مسح الربيع
            </C.Heading>
          </div>
        </Variants>
      </>
    ),
    ".fux-heading",
  ),
  Text: example(
    "Body text in three sizes. Muted is for notes; the status tones stay readable in both themes.",
    () => (
      <>
        <C.Text>
          The survey covers the north meadow and the stream bank. Each note records the date, the
          plot and what was seen.
        </C.Text>
        <Variants title="Sizes" layout="stack">
          {(["sm", "md", "lg"] as const).map((size) => (
            <C.Text key={size} size={size}>
              {`size="${size}"`}: 42 notes this week
            </C.Text>
          ))}
        </Variants>
        <Variants title="Tones" layout="stack">
          {tones.map((tone) => (
            <C.Text key={tone} size="sm" tone={tone}>
              {`tone="${tone}"`}: 3 notes have no plot
            </C.Text>
          ))}
        </Variants>
        <Variants title="A span inside a line" layout="stack">
          <C.Text size="sm">
            Synced 2 minutes ago.{" "}
            <C.Text as="span" tone="muted">
              Next sync at 14:30.
            </C.Text>
          </C.Text>
        </Variants>
      </>
    ),
    ".fux-text",
  ),
  Eyebrow: example(
    "A kicker line above a heading. The capitals are a style, so it is read as written.",
    () => (
      <>
        <div className="flex flex-col gap-1">
          <C.Eyebrow>Step 2 of 3</C.Eyebrow>
          <C.Heading level={5} size="section">
            Choose the plots to survey
          </C.Heading>
        </div>
        <Variants title="Tones" layout="stack">
          <C.Eyebrow>Draft</C.Eyebrow>
          <C.Eyebrow tone="info">In review</C.Eyebrow>
          <C.Eyebrow tone="success">Published</C.Eyebrow>
          <C.Eyebrow tone="error">Sync failed</C.Eyebrow>
        </Variants>
        <Variants title="Right to left" layout="stack">
          <div dir="rtl" lang="ar" className="flex w-full flex-col gap-1">
            <C.Eyebrow>الخطوة 2 من 3</C.Eyebrow>
            <C.Heading level={5} size="section">
              اختر القطع المراد مسحها
            </C.Heading>
          </div>
        </Variants>
      </>
    ),
    ".fux-eyebrow",
  ),
  DescriptionList: example(
    "Inline puts each detail beside its term while the list is wide enough, and under it when it is narrow.",
    () => (
      <>
        <C.DescriptionList
          layout="inline"
          className="w-full"
          items={[
            { term: "Notebook", detail: "Spring survey" },
            { term: "Owner", detail: "Rania Haddad" },
            { term: "Notes", detail: "42" },
            { term: "Last synced", detail: <time dateTime="2028-02-12T14:05">12 Feb, 14:05</time> },
          ]}
        />
        <Variants title="Inline in a narrow container" layout="stack">
          <div className="w-60 max-w-full rounded-md border border-dashed border-border p-3">
            <C.DescriptionList
              layout="inline"
              items={[
                { term: "Owner", detail: "Rania Haddad" },
                { term: "Notes", detail: "42" },
              ]}
            />
          </div>
        </Variants>
        <Variants title="Stacked" layout="stack">
          <C.DescriptionList
            items={[
              { term: "Plot", detail: "North meadow, 40 by 60 metres" },
              { term: "Seen", detail: "Meadow pipit, two pairs" },
            ]}
          />
        </Variants>
        <Variants title="Right to left" layout="stack">
          <C.DescriptionList
            dir="rtl"
            lang="ar"
            layout="inline"
            className="w-full"
            items={[
              { term: "دفتر الملاحظات", detail: "مسح الربيع" },
              { term: "المالك", detail: "رانيا حداد" },
            ]}
          />
        </Variants>
      </>
    ),
    ".fux-dl",
  ),
};
