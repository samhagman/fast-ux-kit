import { useEffect, useRef, useState, type ReactNode, type MouseEvent } from "react";
import * as K from "../../../src/components/ark-specialized.js";
import { Pagination } from "../../../src/components/index.js";
import type { ComponentDemo } from "./aria-demos.js";
const button = "fux-control";
const artwork =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#e7edf4"/><rect x="60" y="80" width="220" height="240" rx="28" fill="#315b8d"/><circle cx="400" cy="160" r="100" fill="#9a465c"/><path d="M310 340L500 120L600 340Z" fill="#52724b"/></svg>',
  );
const demo = (
  name: string,
  render: () => ReactNode,
  code: string,
  notes?: string[],
): ComponentDemo => ({
  render,
  code: `import { ${name} } from "@samhagman/fast-ux-kit/components";\n\n${code}`,
  notes,
});
function AngleDemo() {
  return (
    <K.AngleSlider.Root defaultValue={45}>
      <K.AngleSlider.Label>Rotation</K.AngleSlider.Label>
      <K.AngleSlider.Control>
        <K.AngleSlider.Thumb />
      </K.AngleSlider.Control>
      <K.AngleSlider.ValueText />
      <K.AngleSlider.HiddenInput />
    </K.AngleSlider.Root>
  );
}
function AvatarDemo() {
  return (
    <div className="fux-row" data-gap="md">
      <K.Avatar.Root>
        <K.Avatar.Fallback>AL</K.Avatar.Fallback>
        <K.Avatar.Image src={artwork} alt="Abstract geometric avatar" />
      </K.Avatar.Root>
      <K.Avatar.Root>
        <K.Avatar.Fallback aria-label="Alex Lee">AL</K.Avatar.Fallback>
      </K.Avatar.Root>
    </div>
  );
}
function ClipboardDemo() {
  return (
    <K.Clipboard.Root value="A considered workspace">
      <K.Clipboard.Label>Project title</K.Clipboard.Label>
      <K.Clipboard.Control>
        <K.Clipboard.Input readOnly />
        <K.Clipboard.Trigger>
          <K.Clipboard.Indicator copied="Copied">Copy</K.Clipboard.Indicator>
        </K.Clipboard.Trigger>
      </K.Clipboard.Control>
    </K.Clipboard.Root>
  );
}
function DrawerDemo() {
  return (
    <K.Drawer.Root>
      <K.Drawer.Trigger>Open drawer</K.Drawer.Trigger>
      <K.Portal>
        <K.Drawer.Backdrop />
        <K.Drawer.Positioner>
          <K.Drawer.Content>
            <K.Drawer.Grabber>
              <K.Drawer.GrabberIndicator />
            </K.Drawer.Grabber>
            <K.Drawer.Title>Workspace options</K.Drawer.Title>
            <K.Drawer.Description>Drag the handle or press Escape to dismiss.</K.Drawer.Description>
            <K.Drawer.CloseTrigger>Close drawer</K.Drawer.CloseTrigger>
          </K.Drawer.Content>
        </K.Drawer.Positioner>
      </K.Portal>
    </K.Drawer.Root>
  );
}
function EditableDemo() {
  return (
    <K.Editable.Root defaultValue="A considered workspace">
      <K.Editable.Label>Project name</K.Editable.Label>
      <K.Editable.Area>
        <K.Editable.Input aria-label="Project name" />
        <K.Editable.Preview />
      </K.Editable.Area>
      <K.Editable.Control>
        <K.Editable.Context>
          {(api) =>
            api.editing ? (
              <>
                <K.Editable.SubmitTrigger aria-label="Save name">
                  Save name
                </K.Editable.SubmitTrigger>
                <K.Editable.CancelTrigger aria-label="Cancel">Cancel</K.Editable.CancelTrigger>
              </>
            ) : (
              <K.Editable.EditTrigger aria-label="Edit name">Edit name</K.Editable.EditTrigger>
            )
          }
        </K.Editable.Context>
      </K.Editable.Control>
    </K.Editable.Root>
  );
}
function FieldsetDemo() {
  return (
    <K.Fieldset.Root>
      <K.Fieldset.Legend>Contact details</K.Fieldset.Legend>
      <K.Fieldset.HelperText>A semantic group for related fields.</K.Fieldset.HelperText>
      <label className="fux-field">
        Name
        <input className="fux-input" name="contactName" defaultValue="Alex Lee" />
      </label>
      <label className="fux-field">
        Email
        <input
          className="fux-input"
          name="contactEmail"
          type="email"
          defaultValue="alex@example.com"
        />
      </label>
    </K.Fieldset.Root>
  );
}
function FileUploadDemo() {
  const [error, setError] = useState("");
  return (
    <K.FileUpload.Root
      maxFiles={3}
      maxFileSize={2_000_000}
      onFileReject={(details) =>
        setError(
          details.files.map((item) => `${item.file.name}: ${item.errors.join(", ")}`).join("; "),
        )
      }
      onFileAccept={() => setError("")}
    >
      <K.FileUpload.Label>Attachments</K.FileUpload.Label>
      <K.FileUpload.Dropzone>
        Drop up to three files here<K.FileUpload.Trigger>Choose files</K.FileUpload.Trigger>
      </K.FileUpload.Dropzone>
      <K.FileUpload.HiddenInput />
      <K.FileUpload.ItemGroup>
        <K.FileUpload.Context>
          {(api) =>
            api.acceptedFiles.map((file) => (
              <K.FileUpload.Item key={`${file.name}-${file.lastModified}`} file={file}>
                <K.FileUpload.ItemName />
                <K.FileUpload.ItemSizeText />
                <K.FileUpload.ItemDeleteTrigger aria-label={`Remove ${file.name}`}>
                  ×
                </K.FileUpload.ItemDeleteTrigger>
              </K.FileUpload.Item>
            ))
          }
        </K.FileUpload.Context>
      </K.FileUpload.ItemGroup>
      <span role="status" className="fux-error">
        {error}
      </span>
    </K.FileUpload.Root>
  );
}
function HoverDemo() {
  return (
    <K.HoverCard.Root openDelay={200}>
      <K.HoverCard.Trigger>About this workspace</K.HoverCard.Trigger>
      <K.Portal>
        <K.HoverCard.Positioner>
          <K.HoverCard.Content>
            <strong>A considered workspace</strong>
            <p>Preview context without leaving the current page.</p>
          </K.HoverCard.Content>
        </K.HoverCard.Positioner>
      </K.Portal>
    </K.HoverCard.Root>
  );
}
function JsonDemo() {
  return (
    <K.JsonTreeView.Root
      data={{
        project: "Workspace",
        ready: true,
        tasks: [
          { title: "Navigation", done: true },
          { title: "Editor", done: false },
        ],
      }}
      defaultExpandedDepth={2}
    >
      <K.JsonTreeView.Tree aria-label="Project data" />
    </K.JsonTreeView.Root>
  );
}
function MarqueeDemo() {
  const [paused, setPaused] = useState(true);
  return (
    <div className="fux-stack" data-gap="md">
      <K.Marquee.Root paused={paused}>
        <K.Marquee.Viewport>
          <K.Marquee.Content>
            {["Keyboard-first", "Shared tokens", "Thoughtful defaults", "Clear ownership"].map(
              (value) => (
                <K.Marquee.Item key={value}>{value}</K.Marquee.Item>
              ),
            )}
          </K.Marquee.Content>
        </K.Marquee.Viewport>
      </K.Marquee.Root>
      <button className={button} onClick={() => setPaused((value) => !value)}>
        {paused ? "Start motion" : "Pause motion"}
      </button>
    </div>
  );
}
function NavigationDemo() {
  return (
    <K.NavigationMenu.Root>
      <K.NavigationMenu.List>
        <K.NavigationMenu.Item value="guides">
          <K.NavigationMenu.Trigger>Guides</K.NavigationMenu.Trigger>
          <K.NavigationMenu.Content>
            <K.NavigationMenu.Link href="#installation">Installation</K.NavigationMenu.Link>
            <K.NavigationMenu.Link href="#accessibility">Accessibility</K.NavigationMenu.Link>
          </K.NavigationMenu.Content>
        </K.NavigationMenu.Item>
        <K.NavigationMenu.Item value="components">
          <K.NavigationMenu.Link href="#components">Components</K.NavigationMenu.Link>
        </K.NavigationMenu.Item>
      </K.NavigationMenu.List>
    </K.NavigationMenu.Root>
  );
}
function PasswordDemo() {
  return (
    <K.PasswordInput.Root autoComplete="new-password">
      <K.PasswordInput.Label>Password</K.PasswordInput.Label>
      <K.PasswordInput.Control>
        <K.PasswordInput.Input autoComplete="new-password" placeholder="Enter a password" />
        <K.PasswordInput.VisibilityTrigger>
          <K.PasswordInput.Indicator fallback="Show">Hide</K.PasswordInput.Indicator>
        </K.PasswordInput.VisibilityTrigger>
      </K.PasswordInput.Control>
    </K.PasswordInput.Root>
  );
}
function PinDemo() {
  return (
    <K.PinInput.Root otp>
      <K.PinInput.Label>Verification code</K.PinInput.Label>
      <K.PinInput.Control>
        {[0, 1, 2, 3].map((index) => (
          <K.PinInput.Input key={index} index={index} />
        ))}
      </K.PinInput.Control>
      <K.PinInput.HiddenInput />
    </K.PinInput.Root>
  );
}
function QrDemo() {
  return (
    <K.QrCode.Root value="https://example.com">
      <K.QrCode.Frame>
        <K.QrCode.Pattern />
      </K.QrCode.Frame>
      <p className="fux-hint">Encodes https://example.com</p>
      <K.QrCode.DownloadTrigger fileName="example-code" mimeType="image/png">
        Download QR code
      </K.QrCode.DownloadTrigger>
    </K.QrCode.Root>
  );
}
function RatingDemo() {
  return (
    <K.RatingGroup.Root count={5} defaultValue={3}>
      <K.RatingGroup.Label>How was your experience?</K.RatingGroup.Label>
      <K.RatingGroup.Control>
        {[1, 2, 3, 4, 5].map((index) => (
          <K.RatingGroup.Item key={index} index={index}>
            <span aria-hidden="true">★</span>
          </K.RatingGroup.Item>
        ))}
      </K.RatingGroup.Control>
      <K.RatingGroup.HiddenInput />
    </K.RatingGroup.Root>
  );
}
function ScrollDemo() {
  return (
    <K.ScrollArea.Root>
      <K.ScrollArea.Viewport tabIndex={0} aria-label="Scrollable notes">
        <K.ScrollArea.Content>
          {Array.from({ length: 12 }, (_, index) => (
            <p key={index}>
              Note {index + 1}: Keep the important details close, without showing everything at
              once.
            </p>
          ))}
        </K.ScrollArea.Content>
      </K.ScrollArea.Viewport>
      <K.ScrollArea.Scrollbar>
        <K.ScrollArea.Thumb />
      </K.ScrollArea.Scrollbar>
      <K.ScrollArea.Corner />
    </K.ScrollArea.Root>
  );
}
function SegmentDemo() {
  return (
    <K.SegmentGroup.Root defaultValue="week" orientation="horizontal">
      <K.SegmentGroup.Label>Time range</K.SegmentGroup.Label>
      {["day", "week", "month"].map((value) => (
        <K.SegmentGroup.Item key={value} value={value}>
          <K.SegmentGroup.ItemText>
            {value[0]!.toUpperCase() + value.slice(1)}
          </K.SegmentGroup.ItemText>
          <K.SegmentGroup.ItemHiddenInput />
        </K.SegmentGroup.Item>
      ))}
    </K.SegmentGroup.Root>
  );
}
function SplitterDemo() {
  return (
    <K.Splitter.Root
      panels={[
        { id: "outline", minSize: 20 },
        { id: "details", minSize: 20 },
      ]}
      defaultSize={[40, 60]}
    >
      <K.Splitter.Panel id="outline">
        <h3>Outline</h3>
        <p>A flexible sidebar.</p>
      </K.Splitter.Panel>
      <K.Splitter.ResizeTrigger id="outline:details" aria-label="Resize outline and details">
        <K.Splitter.ResizeTriggerIndicator />
      </K.Splitter.ResizeTrigger>
      <K.Splitter.Panel id="details">
        <h3>Details</h3>
        <p>Focus the divider and use arrow keys to resize.</p>
      </K.Splitter.Panel>
    </K.Splitter.Root>
  );
}
function StepsDemo() {
  return (
    <K.Steps.Root count={3}>
      <K.Steps.List>
        {["Details", "Review", "Confirm"].map((title, index) => (
          <K.Steps.Item key={title} index={index}>
            <K.Steps.Trigger>
              <K.Steps.Indicator>{index + 1}</K.Steps.Indicator>
              {title}
            </K.Steps.Trigger>
            {index < 2 && <K.Steps.Separator />}
          </K.Steps.Item>
        ))}
      </K.Steps.List>
      <K.Steps.Content index={0}>First, add the project details.</K.Steps.Content>
      <K.Steps.Content index={1}>Review the choices before continuing.</K.Steps.Content>
      <K.Steps.Content index={2}>Everything is ready to confirm.</K.Steps.Content>
      <K.Steps.CompletedContent>All steps complete.</K.Steps.CompletedContent>
      <div className="fux-row" data-gap="sm">
        <K.Steps.PrevTrigger>Previous step</K.Steps.PrevTrigger>
        <K.Steps.NextTrigger>Next step</K.Steps.NextTrigger>
      </div>
    </K.Steps.Root>
  );
}
function TagsInputDemo() {
  return (
    <K.TagsInput.Root defaultValue={["Design", "Research"]}>
      <K.TagsInput.Label>Topics</K.TagsInput.Label>
      <K.TagsInput.Control>
        <K.TagsInput.Context>
          {(api) =>
            api.value.map((value, index) => (
              <K.TagsInput.Item key={`${value}-${index}`} index={index} value={value}>
                <K.TagsInput.ItemPreview>
                  <K.TagsInput.ItemText>{value}</K.TagsInput.ItemText>
                  <K.TagsInput.ItemDeleteTrigger aria-label={`Remove ${value}`}>
                    ×
                  </K.TagsInput.ItemDeleteTrigger>
                </K.TagsInput.ItemPreview>
                <K.TagsInput.ItemInput />
              </K.TagsInput.Item>
            ))
          }
        </K.TagsInput.Context>
        <K.TagsInput.Input placeholder="Add a topic" />
      </K.TagsInput.Control>
      <K.TagsInput.HiddenInput />
      <p className="fux-hint">Type a topic and press Enter.</p>
    </K.TagsInput.Root>
  );
}
function TimerDemo() {
  return (
    <K.Timer.Root countdown startMs={60_000} autoStart={false}>
      <K.Timer.Area>
        <K.Timer.Item type="minutes" />
        <K.Timer.Separator>:</K.Timer.Separator>
        <K.Timer.Item type="seconds" />
      </K.Timer.Area>
      <K.Timer.Control>
        <K.Timer.ActionTrigger action="start">Start timer</K.Timer.ActionTrigger>
        <K.Timer.ActionTrigger action="pause">Pause timer</K.Timer.ActionTrigger>
        <K.Timer.ActionTrigger action="reset">Reset timer</K.Timer.ActionTrigger>
      </K.Timer.Control>
    </K.Timer.Root>
  );
}
function ToastDemo() {
  const [toaster] = useState(() => K.createToaster({ placement: "bottom-end", duration: 5000 }));
  useEffect(() => () => toaster.dismiss(), [toaster]);
  return (
    <>
      <button
        className={button}
        onClick={() =>
          toaster.create({
            title: "Changes saved",
            description: "Your work is up to date.",
            type: "success",
          })
        }
      >
        Show notification
      </button>
      <K.Portal>
        <K.Toaster toaster={toaster}>
          {(toast) => (
            <K.Toast.Root>
              <K.Toast.Title>{toast.title}</K.Toast.Title>
              <K.Toast.Description>{toast.description}</K.Toast.Description>
              <K.Toast.CloseTrigger aria-label="Dismiss notification">×</K.Toast.CloseTrigger>
            </K.Toast.Root>
          )}
        </K.Toaster>
      </K.Portal>
    </>
  );
}
function TocDemo() {
  const scroll = useRef<HTMLDivElement>(null);
  const items = [
    { value: "toc-introduction", depth: 2 },
    { value: "toc-principles", depth: 2 },
    { value: "toc-next", depth: 2 },
  ];
  return (
    <K.Toc.Root items={items} scrollEl={() => scroll.current} scrollBehavior="auto">
      <K.Toc.Nav>
        <K.Toc.Title>On this page</K.Toc.Title>
        <K.Toc.List>
          {items.map((item, index) => (
            <K.Toc.Item key={item.value} item={item}>
              <K.Toc.Link
                href={`#${item.value}`}
                onClickCapture={(event: MouseEvent<HTMLAnchorElement>) => {
                  // This documentation app reserves the URL hash for routes.
                  // Keep the native link as a fallback, but scroll the demo locally.
                  event.preventDefault();
                  event.stopPropagation();
                  const container = scroll.current;
                  const target = container?.querySelector<HTMLElement>(`#${item.value}`);
                  if (container && target)
                    container.scrollTo({
                      top:
                        target.getBoundingClientRect().top -
                        container.getBoundingClientRect().top +
                        container.scrollTop,
                      behavior: "auto",
                    });
                }}
              >
                {["Introduction", "Principles", "Next steps"][index]}
              </K.Toc.Link>
            </K.Toc.Item>
          ))}
        </K.Toc.List>
      </K.Toc.Nav>
      <K.Toc.Content ref={scroll}>
        <h2 id="toc-introduction">Introduction</h2>
        <p>A clear outline helps readers find their way.</p>
        <p>Each section has a stable heading, and the navigation follows what is visible.</p>
        <h2 id="toc-principles">Principles</h2>
        <p>Use concise titles and a useful hierarchy.</p>
        <p>Keep navigation links close to the related content.</p>
        <h2 id="toc-next">Next steps</h2>
        <p>Choose a heading to scroll directly to its section.</p>
      </K.Toc.Content>
    </K.Toc.Root>
  );
}

export const arkDemos: Record<string, ComponentDemo> = {
  AngleSlider: demo(
    "AngleSlider",
    () => <AngleDemo />,
    `<AngleSlider.Root defaultValue={45}>
  <AngleSlider.Label>Rotation</AngleSlider.Label>
  <AngleSlider.Control><AngleSlider.Thumb /></AngleSlider.Control>
  <AngleSlider.ValueText /><AngleSlider.HiddenInput />
</AngleSlider.Root>`,
  ),
  Avatar: demo(
    "Avatar",
    () => <AvatarDemo />,
    `<Avatar.Root><Avatar.Fallback>AL</Avatar.Fallback>
  <Avatar.Image src="/avatar.png" alt="Alex Lee" />
</Avatar.Root>`,
  ),
  Clipboard: demo(
    "Clipboard",
    () => <ClipboardDemo />,
    `<Clipboard.Root value="A considered workspace">
  <Clipboard.Label>Project title</Clipboard.Label>
  <Clipboard.Control><Clipboard.Input readOnly />
    <Clipboard.Trigger><Clipboard.Indicator copied="Copied">Copy</Clipboard.Indicator></Clipboard.Trigger>
  </Clipboard.Control>
</Clipboard.Root>`,
    ["Clipboard writes require a secure context and may be denied by browser permissions."],
  ),
  DownloadTrigger: demo(
    "DownloadTrigger",
    () => (
      <K.DownloadTrigger
        data="A considered workspace\n"
        fileName="workspace.txt"
        mimeType="text/plain"
      >
        Download sample text
      </K.DownloadTrigger>
    ),
    `<DownloadTrigger data="A considered workspace" fileName="workspace.txt" mimeType="text/plain">
  Download sample text
</DownloadTrigger>`,
    ["Downloads only the supplied local data; no network upload is performed."],
  ),
  Drawer: demo(
    "Drawer, Portal",
    () => <DrawerDemo />,
    `<Drawer.Root><Drawer.Trigger>Open drawer</Drawer.Trigger>
  <Portal><Drawer.Backdrop /><Drawer.Positioner><Drawer.Content>
    <Drawer.Grabber><Drawer.GrabberIndicator /></Drawer.Grabber>
    <Drawer.Title>Workspace options</Drawer.Title>
    <Drawer.Description>Drag or press Escape to dismiss.</Drawer.Description>
    <Drawer.CloseTrigger>Close drawer</Drawer.CloseTrigger>
  </Drawer.Content></Drawer.Positioner></Portal>
</Drawer.Root>`,
  ),
  Editable: demo(
    "Editable",
    () => <EditableDemo />,
    `<Editable.Root defaultValue="Project name">
  <Editable.Label>Project name</Editable.Label>
  <Editable.Area><Editable.Input /><Editable.Preview /></Editable.Area>
  <Editable.Control><Editable.EditTrigger>Edit</Editable.EditTrigger>
    <Editable.SubmitTrigger>Save</Editable.SubmitTrigger>
    <Editable.CancelTrigger>Cancel</Editable.CancelTrigger></Editable.Control>
</Editable.Root>`,
  ),
  Fieldset: demo(
    "Fieldset",
    () => <FieldsetDemo />,
    `<Fieldset.Root><Fieldset.Legend>Contact details</Fieldset.Legend>
  <Fieldset.HelperText>A semantic group for related fields.</Fieldset.HelperText>
  <label>Name<input className="fux-input" name="name" /></label>
</Fieldset.Root>`,
  ),
  FileUpload: demo(
    "FileUpload",
    () => <FileUploadDemo />,
    `<FileUpload.Root maxFiles={3} maxFileSize={2000000}>
  <FileUpload.Label>Attachments</FileUpload.Label>
  <FileUpload.Dropzone>Drop files here<FileUpload.Trigger>Choose files</FileUpload.Trigger></FileUpload.Dropzone>
  <FileUpload.HiddenInput />
  <FileUpload.ItemGroup><FileUpload.Context>{api => api.acceptedFiles.map(file =>
    <FileUpload.Item key={file.name} file={file}><FileUpload.ItemName />
      <FileUpload.ItemDeleteTrigger>Remove</FileUpload.ItemDeleteTrigger></FileUpload.Item>
  )}</FileUpload.Context></FileUpload.ItemGroup>
</FileUpload.Root>`,
    [
      "Accepted files remain local. Uploading, scanning and server-side validation are application responsibilities.",
    ],
  ),
  HoverCard: demo(
    "HoverCard, Portal",
    () => <HoverDemo />,
    `<HoverCard.Root><HoverCard.Trigger>Preview details</HoverCard.Trigger>
  <Portal><HoverCard.Positioner><HoverCard.Content>Related context.</HoverCard.Content></HoverCard.Positioner></Portal>
</HoverCard.Root>`,
    [
      "Keep essential content available without hover. This is a supplementary preview, not a replacement for navigation.",
    ],
  ),
  JsonTreeView: demo(
    "JsonTreeView",
    () => <JsonDemo />,
    `<JsonTreeView.Root data={{ project: "Workspace", ready: true }} defaultExpandedDepth={2}>
  <JsonTreeView.Tree aria-label="Project data" />
</JsonTreeView.Root>`,
    ["Data is rendered as text and expandable nodes, never as executable HTML."],
  ),
  Marquee: demo(
    "Marquee",
    () => <MarqueeDemo />,
    `const [paused, setPaused] = useState(true);
<Marquee.Root paused={paused}><Marquee.Viewport><Marquee.Content>
  <Marquee.Item>Keyboard-first</Marquee.Item><Marquee.Item>Shared tokens</Marquee.Item>
</Marquee.Content></Marquee.Viewport></Marquee.Root>
<button onClick={() => setPaused(value => !value)}>{paused ? "Start" : "Pause"}</button>`,
    ["Starts paused. Shared styles disable animation when reduced motion is requested."],
  ),
  NavigationMenu: demo(
    "NavigationMenu",
    () => <NavigationDemo />,
    `<NavigationMenu.Root><NavigationMenu.List>
  <NavigationMenu.Item value="guides"><NavigationMenu.Trigger>Guides</NavigationMenu.Trigger>
    <NavigationMenu.Content><NavigationMenu.Link href="/guide">Guide</NavigationMenu.Link></NavigationMenu.Content>
  </NavigationMenu.Item>
</NavigationMenu.List></NavigationMenu.Root>`,
  ),
  PasswordInput: demo(
    "PasswordInput",
    () => <PasswordDemo />,
    `<PasswordInput.Root autoComplete="new-password"><PasswordInput.Label>Password</PasswordInput.Label>
  <PasswordInput.Control><PasswordInput.Input autoComplete="new-password" />
    <PasswordInput.VisibilityTrigger><PasswordInput.Indicator fallback="Show">Hide</PasswordInput.Indicator></PasswordInput.VisibilityTrigger>
  </PasswordInput.Control>
</PasswordInput.Root>`,
  ),
  PinInput: demo(
    "PinInput",
    () => <PinDemo />,
    `<PinInput.Root otp><PinInput.Label>Verification code</PinInput.Label>
  <PinInput.Control>{[0, 1, 2, 3].map(index => <PinInput.Input key={index} index={index} />)}</PinInput.Control>
  <PinInput.HiddenInput />
</PinInput.Root>`,
  ),
  QrCode: demo(
    "QrCode",
    () => <QrDemo />,
    `<QrCode.Root value="https://example.com"><QrCode.Frame><QrCode.Pattern /></QrCode.Frame>
  <QrCode.DownloadTrigger fileName="code" mimeType="image/png">Download QR code</QrCode.DownloadTrigger>
</QrCode.Root>`,
  ),
  RatingGroup: demo(
    "RatingGroup",
    () => <RatingDemo />,
    `<RatingGroup.Root count={5} defaultValue={3}><RatingGroup.Label>Experience</RatingGroup.Label>
  <RatingGroup.Control>{[1, 2, 3, 4, 5].map(index =>
    <RatingGroup.Item key={index} index={index}><span aria-hidden="true">★</span></RatingGroup.Item>
  )}</RatingGroup.Control><RatingGroup.HiddenInput />
</RatingGroup.Root>`,
  ),
  ScrollArea: demo(
    "ScrollArea",
    () => <ScrollDemo />,
    `<ScrollArea.Root><ScrollArea.Viewport tabIndex={0} aria-label="Notes">
  <ScrollArea.Content>Long scrollable content</ScrollArea.Content>
</ScrollArea.Viewport><ScrollArea.Scrollbar><ScrollArea.Thumb /></ScrollArea.Scrollbar></ScrollArea.Root>`,
  ),
  SegmentGroup: demo(
    "SegmentGroup",
    () => <SegmentDemo />,
    `<SegmentGroup.Root defaultValue="week" orientation="horizontal"><SegmentGroup.Label>Time range</SegmentGroup.Label>
  {["day", "week", "month"].map(value => <SegmentGroup.Item key={value} value={value}>
    <SegmentGroup.ItemText>{value}</SegmentGroup.ItemText><SegmentGroup.ItemHiddenInput />
  </SegmentGroup.Item>)}
</SegmentGroup.Root>`,
  ),
  Splitter: demo(
    "Splitter",
    () => <SplitterDemo />,
    `<Splitter.Root panels={[{ id: "left", minSize: 20 }, { id: "right", minSize: 20 }]} defaultSize={[40, 60]}>
  <Splitter.Panel id="left">Outline</Splitter.Panel>
  <Splitter.ResizeTrigger id="left:right" aria-label="Resize panels"><Splitter.ResizeTriggerIndicator /></Splitter.ResizeTrigger>
  <Splitter.Panel id="right">Details</Splitter.Panel>
</Splitter.Root>`,
  ),
  Steps: demo(
    "Steps",
    () => <StepsDemo />,
    `<Steps.Root count={2}><Steps.List>{["Details", "Review"].map((title, index) =>
  <Steps.Item key={title} index={index}><Steps.Trigger><Steps.Indicator>{index + 1}</Steps.Indicator>{title}</Steps.Trigger></Steps.Item>
)}</Steps.List><Steps.Content index={0}>Add details.</Steps.Content><Steps.Content index={1}>Review.</Steps.Content>
  <Steps.CompletedContent>Complete.</Steps.CompletedContent>
  <Steps.PrevTrigger>Previous</Steps.PrevTrigger><Steps.NextTrigger>Next</Steps.NextTrigger>
</Steps.Root>`,
  ),
  TagsInput: demo(
    "TagsInput",
    () => <TagsInputDemo />,
    `<TagsInput.Root defaultValue={["Design"]}><TagsInput.Label>Topics</TagsInput.Label>
  <TagsInput.Control><TagsInput.Context>{api => api.value.map((value, index) =>
    <TagsInput.Item key={value} index={index} value={value}><TagsInput.ItemPreview>
      <TagsInput.ItemText>{value}</TagsInput.ItemText><TagsInput.ItemDeleteTrigger>×</TagsInput.ItemDeleteTrigger>
    </TagsInput.ItemPreview><TagsInput.ItemInput /></TagsInput.Item>
  )}</TagsInput.Context><TagsInput.Input placeholder="Add a topic" /></TagsInput.Control><TagsInput.HiddenInput />
</TagsInput.Root>`,
  ),
  Timer: demo(
    "Timer",
    () => <TimerDemo />,
    `<Timer.Root countdown startMs={60000} autoStart={false}>
  <Timer.Area><Timer.Item type="minutes" /><Timer.Separator>:</Timer.Separator><Timer.Item type="seconds" /></Timer.Area>
  <Timer.Control><Timer.ActionTrigger action="start">Start</Timer.ActionTrigger>
    <Timer.ActionTrigger action="pause">Pause</Timer.ActionTrigger><Timer.ActionTrigger action="reset">Reset</Timer.ActionTrigger></Timer.Control>
</Timer.Root>`,
  ),
  Toast: demo(
    "Toast, Toaster, createToaster, Portal",
    () => <ToastDemo />,
    `const [toaster] = useState(() => createToaster({ placement: "bottom-end", duration: 5000 }));
<button onClick={() => toaster.create({ title: "Saved", description: "Your work is up to date." })}>Notify</button>
<Portal><Toaster toaster={toaster}>{toast => <Toast.Root>
  <Toast.Title>{toast.title}</Toast.Title><Toast.Description>{toast.description}</Toast.Description>
  <Toast.CloseTrigger aria-label="Dismiss">×</Toast.CloseTrigger>
</Toast.Root>}</Toaster></Portal>`,
    [
      "Create one toaster per intended notification region, not on every render. Dismiss outstanding notifications when a temporary demo unmounts.",
    ],
  ),
  Toc: demo(
    "Toc",
    () => <TocDemo />,
    `<Toc.Root items={[{ value: "intro", depth: 2 }]} scrollBehavior="auto">
  <Toc.Nav><Toc.Title>On this page</Toc.Title><Toc.List><Toc.Item item={{ value: "intro", depth: 2 }}>
    <Toc.Link href="#intro">Introduction</Toc.Link>
  </Toc.Item></Toc.List></Toc.Nav>
  <Toc.Content><h2 id="intro">Introduction</h2><p>Article content.</p></Toc.Content>
</Toc.Root>`,
    [
      "Heading IDs must be unique and match the supplied items. This demo scrolls within its own article area and deliberately preserves the documentation route hash.",
    ],
  ),
  Pagination: demo(
    "Pagination",
    () => <Pagination label="Result pages" count={120} pageSize={10} />,
    `<Pagination label="Result pages" count={120} pageSize={10} onPageChange={setPage} />`,
  ),
};
