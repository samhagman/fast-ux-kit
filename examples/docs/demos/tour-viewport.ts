/** Keep the demo's already-focused control reachable after a viewport resize.
 * This only asks native scrolling to reveal that control; the Tour owner retains
 * placement, focus, dismissal and step management. Each resize gets two bounded
 * checks because scrolling can change the owner's available content height.
 */
export function retainTourControlInViewport(content: HTMLElement): () => void {
  const document = content.ownerDocument;
  const window = document.defaultView;
  if (!window) return () => {};
  let frame: number | null = null;
  let active = true;
  const reveal = () => {
    const control = document.activeElement;
    if (
      !content.isConnected ||
      !(control instanceof window.HTMLElement) ||
      !content.contains(control)
    )
      return;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (
      rect.top < 0 ||
      rect.bottom > window.innerHeight ||
      rect.left < 0 ||
      rect.right > window.innerWidth
    )
      control.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
  };
  const resize = () => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(() => {
        if (!active) return;
        reveal();
        frame = window.requestAnimationFrame(() => {
          frame = window.requestAnimationFrame(() => {
            frame = null;
            if (active) reveal();
          });
        });
      });
    });
  };
  window.addEventListener("resize", resize);
  return () => {
    active = false;
    if (frame !== null) window.cancelAnimationFrame(frame);
    window.removeEventListener("resize", resize);
  };
}
