import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as K from "../../../src/components/ark-advanced.js";
import type { ComponentDemo } from "./aria-demos.js";
import { Symbol } from "../ui.js";
const button = "fux-control";
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

function CarouselDemo() {
  return (
    <K.Carousel.Root slideCount={3} autoplay={false} aria-label="Design process" spacing="1rem">
      <K.Carousel.ItemGroup>
        {["A clear starting point", "Space to make progress", "A thoughtful finish"].map(
          (text, index) => (
            <K.Carousel.Item key={text} index={index}>
              <h3>{text}</h3>
              <p>
                Panel {index + 1} of 3. Move with the controls, indicator arrow keys, or native
                touch scrolling.
              </p>
            </K.Carousel.Item>
          ),
        )}
      </K.Carousel.ItemGroup>
      <K.Carousel.Control>
        <K.Carousel.PrevTrigger>Previous</K.Carousel.PrevTrigger>
        <K.Carousel.IndicatorGroup aria-label="Choose a panel">
          {[0, 1, 2].map((index) => (
            <K.Carousel.Indicator
              key={index}
              index={index}
              aria-label={`Go to panel ${index + 1}`}
            />
          ))}
        </K.Carousel.IndicatorGroup>
        <K.Carousel.NextTrigger>Next</K.Carousel.NextTrigger>
      </K.Carousel.Control>
      <K.Carousel.ProgressText aria-live="polite" />
    </K.Carousel.Root>
  );
}
function FloatingDemo() {
  return (
    <K.FloatingPanel.Root
      defaultSize={{ width: 300, height: 330 }}
      minSize={{ width: 220, height: 180 }}
      defaultPosition={{ x: 24, y: 96 }}
      closeOnEscape
    >
      <K.FloatingPanel.Trigger>Open floating panel</K.FloatingPanel.Trigger>
      <K.Portal>
        <K.FloatingPanel.Positioner>
          <K.FloatingPanel.Content>
            <K.FloatingPanel.DragTrigger>
              <K.FloatingPanel.Header>
                <K.FloatingPanel.Title>Scratch notes</K.FloatingPanel.Title>
                <K.FloatingPanel.Control>
                  <K.FloatingPanel.StageTrigger stage="minimized" aria-label="Minimize panel">
                    −
                  </K.FloatingPanel.StageTrigger>
                  <K.FloatingPanel.StageTrigger stage="maximized" aria-label="Maximize panel">
                    <Symbol name="external" size={16} />
                  </K.FloatingPanel.StageTrigger>
                  <K.FloatingPanel.StageTrigger stage="default" aria-label="Restore panel">
                    <Symbol name="layers" size={16} />
                  </K.FloatingPanel.StageTrigger>
                  <K.FloatingPanel.CloseTrigger aria-label="Close panel">
                    <Symbol name="close" size={16} />
                  </K.FloatingPanel.CloseTrigger>
                </K.FloatingPanel.Control>
              </K.FloatingPanel.Header>
            </K.FloatingPanel.DragTrigger>
            <K.FloatingPanel.Body>
              <label className="fux-field">
                Notes
                <textarea className="fux-input" defaultValue="Keep a thought nearby." />
              </label>
              <p className="fux-hint">
                Drag the header or focus the panel itself and use arrow keys. These buttons also
                move and resize it without a pointer.
              </p>
              <K.FloatingPanel.Context>
                {(api) => (
                  <div className="fux-advanced-actions">
                    <button
                      type="button"
                      className={button}
                      onClick={() => api.setPosition({ x: api.position.x + 20, y: api.position.y })}
                    >
                      Move right
                    </button>
                    <button
                      type="button"
                      className={button}
                      onClick={() => api.setSize({ width: 300, height: 330 })}
                    >
                      Reset size
                    </button>
                    <output aria-label="Panel position">
                      {Math.round(api.position.x)}, {Math.round(api.position.y)}
                    </output>
                  </div>
                )}
              </K.FloatingPanel.Context>
            </K.FloatingPanel.Body>
            <K.FloatingPanel.ResizeTrigger axis="se" aria-label="Resize panel" />
          </K.FloatingPanel.Content>
        </K.FloatingPanel.Positioner>
      </K.Portal>
    </K.FloatingPanel.Root>
  );
}
function ImageCropperDemo() {
  const [preview, setPreview] = useState<string | null>(null),
    [status, setStatus] = useState("");
  const request = useRef(0);
  const invalidatePreview = useCallback(() => {
    request.current++;
    setPreview(null);
    setStatus("");
  }, []);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  return (
    <K.ImageCropper.Root
      aspectRatio={1}
      onCropChange={invalidatePreview}
      onZoomChange={invalidatePreview}
      onRotationChange={invalidatePreview}
      onFlipChange={invalidatePreview}
      minZoom={1}
      maxZoom={3}
      aria-label="Crop abstract field-study artwork"
    >
      <K.ImageCropper.Viewport>
        <K.ImageCropper.Image src="./assets/field-study.svg" alt="Abstract field-study artwork" />
        <K.ImageCropper.Selection>
          <K.ImageCropper.Grid axis="horizontal" />
          <K.ImageCropper.Grid axis="vertical" />
          {K.ImageCropper.handles.map((position) => (
            <K.ImageCropper.Handle key={position} position={position} />
          ))}
        </K.ImageCropper.Selection>
      </K.ImageCropper.Viewport>
      <K.ImageCropper.Context>
        {(api) => (
          <>
            <div className="fux-advanced-actions">
              <button
                type="button"
                className={button}
                onClick={() => api.zoomBy(-0.1)}
                disabled={api.zoom <= 1}
              >
                Zoom out
              </button>
              <button
                type="button"
                className={button}
                onClick={() => api.zoomBy(0.1)}
                disabled={api.zoom >= 3}
              >
                Zoom in
              </button>
              <button type="button" className={button} onClick={() => api.rotateBy(90)}>
                Rotate 90°
              </button>
              <button
                type="button"
                className={button}
                onClick={() => api.flipHorizontally()}
                aria-pressed={api.flip.horizontal}
              >
                Flip horizontally
              </button>
              <button
                type="button"
                className={button}
                onClick={() => {
                  request.current++;
                  api.reset();
                  setPreview(null);
                  setStatus("");
                }}
              >
                Reset crop
              </button>
              <button
                type="button"
                className={button}
                onClick={async () => {
                  const current = ++request.current;
                  setStatus("Preparing crop…");
                  try {
                    const result = await api.getCroppedImage({
                      output: "dataUrl",
                      type: "image/png",
                      maxSize: { width: 640, height: 640 },
                    });
                    if (current !== request.current) return;
                    if (typeof result !== "string" || !result) {
                      setStatus(
                        "Crop unavailable. Wait for the image to load, or check that it can be read locally.",
                      );
                      return;
                    }
                    setPreview(result);
                    setStatus("Crop preview ready. Nothing was uploaded.");
                  } catch {
                    if (current === request.current)
                      setStatus(
                        "Crop preview unavailable. Check that the image can be read locally.",
                      );
                  }
                }}
              >
                Preview crop
              </button>
            </div>
            <output aria-label="Crop transformation">
              Zoom {Math.round(api.zoom * 100)}% · Rotation {api.rotation}°
            </output>
          </>
        )}
      </K.ImageCropper.Context>
      <p className="fux-hint">
        Focus the selection and use arrows to move; Alt+arrows resize; +/− zoom. The export uses a
        local image and remains in this page.
      </p>
      <p role="status" aria-label="Crop preview status">
        {status}
      </p>
      {preview && <img className="fux-crop-preview" src={preview} alt="Cropped preview" />}
    </K.ImageCropper.Root>
  );
}
function SignatureDemo() {
  const [paths, setPaths] = useState<string[]>([]),
    [typed, setTyped] = useState("");
  return (
    <div className="fux-advanced-stack">
      <K.SignaturePad.Root
        paths={paths}
        onDraw={(details) => setPaths(details.paths)}
        drawing={{ fill: "currentColor" }}
      >
        <K.SignaturePad.Label>Drawing pad</K.SignaturePad.Label>
        <K.SignaturePad.Control>
          <K.SignaturePad.Segment />
          <K.SignaturePad.Guide />
        </K.SignaturePad.Control>
        <K.SignaturePad.ClearTrigger>Clear drawing</K.SignaturePad.ClearTrigger>
        <output aria-live="polite">
          {paths.length} {paths.length === 1 ? "stroke" : "strokes"}
        </output>
      </K.SignaturePad.Root>
      <label className="fux-field">
        Text alternative
        <input
          className="fux-input"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          placeholder="Describe your mark instead"
        />
      </label>
      {typed && <output aria-label="Text alternative preview">{typed}</output>}
      <p className="fux-hint">
        This is a local drawing example, not a signing workflow. Neither marks nor text are
        submitted.
      </p>
    </div>
  );
}
function TourDemo() {
  const targetId = useId(),
    [status, setStatus] = useState("Not started");
  const opener = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const restoreOpener = useRef(false);
  const steps = useMemo<NonNullable<Parameters<typeof K.useTour>[0]>["steps"]>(
    () => [
      {
        id: "welcome",
        type: "dialog",
        title: "A quick introduction",
        description: "This guide is optional. Close it at any time.",
      },
      {
        id: "action",
        type: "tooltip",
        target: () => document.getElementById(targetId),
        title: "An ordinary action",
        description:
          "Tour targets stay in the page. The guide does not replace normal instructions.",
        placement: "bottom",
      },
      {
        id: "finish",
        type: "dialog",
        title: "You are ready",
        description: "All controls remain available without this tour.",
      },
    ],
    [targetId],
  );
  const tour = K.useTour({
    closeOnEscape: true,
    closeOnInteractOutside: false,
    onStatusChange: (details) => setStatus(details.status),
    steps,
  });
  useEffect(() => {
    if (tour.open || !restoreOpener.current) return;
    restoreOpener.current = false;
    const trigger = opener.current;
    if (!trigger?.isConnected) return;
    const active = trigger.ownerDocument.activeElement;
    if (active === trigger.ownerDocument.body || content.current?.contains(active))
      trigger.focus({ preventScroll: true });
  }, [tour.open]);
  return (
    <>
      <div className="fux-advanced-actions">
        <button
          ref={opener}
          type="button"
          className={button}
          onClick={() => {
            restoreOpener.current = true;
            tour.start();
          }}
        >
          Start guided tour
        </button>
        <button
          type="button"
          id={targetId}
          className={button}
          onClick={() => setStatus("Example action selected")}
        >
          Example action
        </button>
      </div>
      <output aria-live="polite">Tour: {status}</output>
      <K.Tour.Root tour={tour}>
        <K.Portal>
          <K.Tour.Backdrop />
          <K.Tour.Spotlight />
          <K.Tour.Positioner>
            <K.Tour.Content ref={content}>
              <K.Tour.Title>{tour.step?.title}</K.Tour.Title>
              <K.Tour.Description>{tour.step?.description}</K.Tour.Description>
              <K.Tour.ProgressText />
              <K.Tour.Control>
                <K.Tour.ActionTrigger action={{ action: "prev", label: "Back" }} />
                <K.Tour.ActionTrigger
                  action={
                    tour.lastStep
                      ? { action: "dismiss", label: "Finish" }
                      : { action: "next", label: "Next" }
                  }
                  aria-label={tour.lastStep ? "Finish tour" : "Next step"}
                />
                <K.Tour.CloseTrigger>Close tour</K.Tour.CloseTrigger>
              </K.Tour.Control>
            </K.Tour.Content>
          </K.Tour.Positioner>
        </K.Portal>
      </K.Tour.Root>
    </>
  );
}
export const arkAdvancedDemos: Record<string, ComponentDemo> = {
  Carousel: demo(
    "Carousel",
    () => <CarouselDemo />,
    `<Carousel.Root slideCount={3} autoplay={false} aria-label="Gallery">
  <Carousel.ItemGroup>{["One", "Two", "Three"].map((text, index) =>
    <Carousel.Item key={text} index={index}>{text}</Carousel.Item>
  )}</Carousel.ItemGroup>
  <Carousel.Control><Carousel.PrevTrigger>Previous</Carousel.PrevTrigger>
    <Carousel.NextTrigger>Next</Carousel.NextTrigger></Carousel.Control>
  <Carousel.ProgressText />
</Carousel.Root>`,
    [
      "Autoplay is intentionally off. If enabled, expose pause controls and honor reduced motion.",
      "Indicators have keyboard navigation. Scroll snap and touch geometry require browser/device validation.",
    ],
  ),
  FloatingPanel: demo(
    "FloatingPanel, Portal",
    () => <FloatingDemo />,
    `<FloatingPanel.Root defaultSize={{ width: 300, height: 330 }}>
  <FloatingPanel.Trigger>Open panel</FloatingPanel.Trigger>
  <Portal><FloatingPanel.Positioner><FloatingPanel.Content>
    <FloatingPanel.DragTrigger><FloatingPanel.Header><FloatingPanel.Title>Notes</FloatingPanel.Title>
      <FloatingPanel.CloseTrigger>Close</FloatingPanel.CloseTrigger></FloatingPanel.Header></FloatingPanel.DragTrigger>
    <FloatingPanel.Body>Keep a thought nearby.</FloatingPanel.Body>
    <FloatingPanel.ResizeTrigger axis="se" />
  </FloatingPanel.Content></FloatingPanel.Positioner></Portal>
</FloatingPanel.Root>`,
    [
      "This is nonmodal; do not add a second focus trap.",
      "The live example supplies move/size buttons as alternatives to drag and resize.",
    ],
  ),
  ImageCropper: demo(
    "ImageCropper",
    () => <ImageCropperDemo />,
    `<ImageCropper.Root aspectRatio={1}>
  <ImageCropper.Viewport><ImageCropper.Image src="/image.png" alt="Image to crop" />
    <ImageCropper.Selection><ImageCropper.Grid axis="horizontal" /><ImageCropper.Grid axis="vertical" />
      {ImageCropper.handles.map(position => <ImageCropper.Handle key={position} position={position} />)}
    </ImageCropper.Selection>
  </ImageCropper.Viewport>
</ImageCropper.Root>`,
    [
      "Use same-origin or CORS-enabled images for canvas export. Crop changes do not upload files.",
      "Context exposes zoom, rotation, flip, reset, crop geometry and asynchronous getCroppedImage.",
    ],
  ),
  SignaturePad: demo(
    "SignaturePad",
    () => <SignatureDemo />,
    `<SignaturePad.Root><SignaturePad.Label>Drawing pad</SignaturePad.Label>
  <SignaturePad.Control><SignaturePad.Segment /><SignaturePad.Guide /></SignaturePad.Control>
  <SignaturePad.ClearTrigger>Clear drawing</SignaturePad.ClearTrigger>
</SignaturePad.Root>`,
    [
      "A pointer drawing surface, not a legal signing workflow. The live demo also accepts text.",
      "Host applications own capture consent, storage, required-field validation and any legal process.",
    ],
  ),
  Tour: demo(
    "Tour, useTour, Portal",
    () => <TourDemo />,
    `const tour = useTour({ steps: [{ id: "welcome", type: "dialog", title: "Welcome", description: "A short introduction." }] });
<button type="button" onClick={() => tour.start()}>Start tour</button>
<Tour.Root tour={tour}><Portal><Tour.Backdrop /><Tour.Positioner><Tour.Content>
  <Tour.Title>{tour.step?.title}</Tour.Title><Tour.Description>{tour.step?.description}</Tour.Description>
  <Tour.ActionTrigger action={{ action: "dismiss", label: "Finish" }} />
</Tour.Content></Tour.Positioner></Portal></Tour.Root>`,
    [
      "The optional guide is explicitly started and supports Back, Next, dismissal and restart.",
      "Target resolution/positioning and assistive-technology reading order need real-browser validation.",
    ],
  ),
};
