import type { Component } from "solid-js";
import { Show, createSignal, createEffect, onMount, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-solid";

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  // "image" or "video" - determines how the media is rendered
  type: "image" | "video";
  alt?: string;
}

const Lightbox: Component<LightboxProps> = (props) => {
  const [scale, setScale] = createSignal(1);
  const [translate, setTranslate] = createSignal({ x: 0, y: 0 });
  const [dragging, setDragging] = createSignal(false);
  const [dragStart, setDragStart] = createSignal({ x: 0, y: 0 });

  function resetTransform() {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
    if (e.key === "+" || e.key === "=") zoomIn();
    if (e.key === "-") zoomOut();
    if (e.key === "0") resetTransform();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose();
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.15 : 0.15;
    setScale((prev) => Math.max(0.25, Math.min(5, prev + delta)));
  }

  function handlePointerDown(e: PointerEvent) {
    // only pan images, not videos
    if (props.type === "video") return;
    e.preventDefault();
    setDragging(true);
    setDragStart({
      x: e.clientX - translate().x,
      y: e.clientY - translate().y,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!dragging()) return;
    setTranslate({
      x: e.clientX - dragStart().x,
      y: e.clientY - dragStart().y,
    });
  }

  function handlePointerUp() {
    setDragging(false);
  }

  function zoomIn() {
    setScale((prev) => Math.min(5, prev + 0.25));
  }

  function zoomOut() {
    setScale((prev) => Math.max(0.25, prev - 0.25));
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  // reset transform state when the lightbox opens
  createEffect(() => {
    if (props.isOpen) resetTransform();
  });

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div
          class="dusk-lightbox-backdrop"
          onClick={handleBackdropClick}
          onWheel={handleWheel}
        >
          {/* toolbar */}
          <div class="dusk-lightbox-toolbar">
            <Show when={props.type === "image"}>
              <button
                type="button"
                class="dusk-lightbox-btn"
                onClick={zoomIn}
                title="zoom in (+)"
              >
                <ZoomIn size={18} />
              </button>
              <button
                type="button"
                class="dusk-lightbox-btn"
                onClick={zoomOut}
                title="zoom out (-)"
              >
                <ZoomOut size={18} />
              </button>
              <button
                type="button"
                class="dusk-lightbox-btn"
                onClick={resetTransform}
                title="reset (0)"
              >
                <RotateCcw size={18} />
              </button>
              <div class="dusk-lightbox-divider" />
            </Show>
            <button
              type="button"
              class="dusk-lightbox-btn"
              onClick={props.onClose}
              title="close (esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* media container */}
          <div class="dusk-lightbox-media-container">
            <Show
              when={props.type === "image"}
              fallback={
                <video
                  src={props.src}
                  class="dusk-lightbox-video"
                  controls
                  autoplay
                  onClick={(e) => e.stopPropagation()}
                >
                  <track kind="captions" />
                </video>
              }
            >
              <img
                src={props.src}
                alt={props.alt || "media"}
                class="dusk-lightbox-image"
                style={{
                  transform: `translate(${translate().x}px, ${translate().y}px) scale(${scale()})`,
                  cursor: dragging() ? "grabbing" : "grab",
                }}
                draggable={false}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onClick={(e) => e.stopPropagation()}
              />
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default Lightbox;
