// Frame and ThemeScope: a mock-up in a browser frame, a kit boundary for custom content inside a
// kit tree, and a sub-theme mapped from a small set of inputs.
import * as C from "@samhagman/fast-ux-kit/components";
import { type ComponentFixture, Variants, click, example } from "./fixture-kit";

const answers = [
  { id: "approve", label: "Approve", description: "The request goes ahead." },
  { id: "reject", label: "Reject", description: "The requester is told why." },
];

/** A small task page made of kit components, the kind of page a frame shows. */
function TaskPage({ onSend }: { readonly onSend?: () => void }) {
  return (
    <C.Stack gap="md" className="p-5">
      <C.Stack gap="xs">
        <span className="text-xs text-muted-foreground">Waiting for you</span>
        <h3 className="m-0 font-heading text-xl font-semibold tracking-tight">
          Approve the travel request?
        </h3>
      </C.Stack>
      <C.RadioGroup label="Your answer" options={answers} defaultValue="approve" />
      <C.Checkbox label="Tell me when it's booked" defaultChecked />
      <C.Row gap="sm">
        <C.Button onClick={onSend}>Send answer</C.Button>
        <C.Link href="#/components/Frame">Open the request</C.Link>
      </C.Row>
    </C.Stack>
  );
}

/** Custom markup with its own utility classes: a link drawn as a button, a heading, a list. */
function CustomMock() {
  return (
    <div className="flex flex-col gap-3 p-4 font-sans text-sm">
      <h3 className="mt-3 text-base font-semibold">New task in #approvals</h3>
      <ul className="list-disc ps-5">
        <li>Travel request from Kai</li>
      </ul>
      <a
        href="#/components/Frame"
        className="w-fit rounded-md bg-primary px-3 py-1.5 font-medium text-primary-foreground no-underline"
      >
        Open task
      </a>
    </div>
  );
}

const customer: C.ThemeScopeTokens = {
  fg: "oklch(0.26 0.03 160)",
  bg: "oklch(0.985 0.012 95)",
  accent: "oklch(0.5 0.13 160)",
  primary: "oklch(0.36 0.07 160)",
  onPrimary: "oklch(0.985 0.012 95)",
  field: "oklch(0.55 0.03 160)",
  radius: "2px",
  fontBody: 'Georgia, "Times New Roman", serif',
  fontHead: '"Iowan Old Style", Georgia, serif',
  selection: "oklch(0.55 0.15 45)",
};

export const surfacesFixtures: Readonly<Record<string, ComponentFixture>> = {
  Frame: example(
    "A page mock-up in a browser frame. The bar is decoration; the page inside keeps its own headings, fields and buttons.",
    ({ report }) => (
      <>
        <C.Frame url="example.test/t/7Hq2" label="Task page, in a browser">
          <TaskPage onSend={() => report("Sent")} />
        </C.Frame>
        <Variants title="Chrome" layout="grid">
          <C.Frame chrome="none" label="Task page, no browser bar">
            <TaskPage />
          </C.Frame>
          <C.Frame url="a-very-long-address.example.test/tasks/7Hq2/answers?from=mail&step=2">
            <p className="m-0 p-4 text-sm text-muted-foreground">
              A long address ends in an ellipsis; a narrow frame drops the dots first.
            </p>
          </C.Frame>
        </Variants>
        <Variants title="Custom markup in an article" layout="grid">
          <article className="fux-article" data-surface="paper">
            <p className="text-sm">
              Without a boundary: the article's link and heading styles reach in.
            </p>
            <C.Frame chrome="none" label="Chat message, unbounded">
              <CustomMock />
            </C.Frame>
          </article>
          <article className="fux-article" data-surface="paper">
            <p className="text-sm">
              With <code>data-kit-boundary</code>: the custom markup keeps its own.
            </p>
            <C.Frame chrome="none" label="Chat message, bounded">
              <div data-kit-boundary="">
                <CustomMock />
              </div>
            </C.Frame>
          </article>
        </Variants>
      </>
    ),
    ".fux-frame",
    [click('.fux-frame button[data-slot="button"]', ".fixture-status", "Sent")],
  ),
  ThemeScope: example(
    "A sub-theme from a dozen inputs: text, ground, accent, primary, field, radius, faces and a selection colour of its own.",
    ({ report }) => (
      <>
        <C.ThemeScope tokens={customer} className="rounded-sm border border-border">
          <TaskPage onSend={() => report("Sent in the customer's theme")} />
        </C.ThemeScope>
        <Variants title="Selection apart from primary" layout="grid">
          <C.ThemeScope tokens={{ selection: "var(--signal)" }}>
            <C.Stack gap="sm" align="start">
              <C.RadioGroup label="Plan" options={answers} defaultValue="approve" />
              <C.ToggleButtonGroup defaultValue={["week"]} aria-label="Range">
                <C.ToggleButtonGroupItem value="day">Day</C.ToggleButtonGroupItem>
                <C.ToggleButtonGroupItem value="week">Week</C.ToggleButtonGroupItem>
              </C.ToggleButtonGroup>
              <C.Button>Primary stays primary</C.Button>
            </C.Stack>
          </C.ThemeScope>
          <C.ThemeScope
            tokens={{
              fg: "var(--foreground)",
              bg: "var(--muted)",
              radius: "calc(var(--radius) * 2)",
            }}
            className="rounded-lg p-4"
          >
            <C.Stack gap="sm">
              <span className="text-xs text-muted-foreground">
                Inputs can be var(), even of the token they feed
              </span>
              <C.Field label="Name" defaultValue="Kai" />
              <C.Switch label="Notify" defaultChecked />
            </C.Stack>
          </C.ThemeScope>
        </Variants>
      </>
    ),
    ".fux-theme-scope",
    [
      click(
        '.fux-theme-scope button[data-slot="button"]',
        ".fixture-status",
        "Sent in the customer's theme",
      ),
    ],
  ),
};
