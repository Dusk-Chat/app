// bottom panel of the keyframe editor showing layer bars, keyframe diamonds, and a playhead

import type { Component } from "solid-js";
import { createSignal, For, Show, onCleanup, createMemo } from "solid-js";
import { Eye, EyeOff, Trash2 } from "lucide-solid";
import type { ProfileEffect, AnimationLayer, LayerElement } from "../../lib/effects";

interface EffectTimelineProps {
  effect: ProfileEffect;
  selectedLayerId: string | null;
  selectedKeyframeIndex: number | null;
  playheadPosition: number;
  onSelectLayer: (id: string | null) => void;
  onSelectKeyframe: (layerId: string, index: number | null) => void;
  onMoveKeyframe: (layerId: string, index: number, newOffset: number) => void;
  onAddKeyframe: (layerId: string, offset: number) => void;
  onDeleteKeyframe: (layerId: string, index: number) => void;
  onPlayheadChange: (position: number) => void;
  onReorderLayers: (from: number, to: number) => void;
  onDeleteLayer: (layerId: string) => void;
}

const LAYER_PANEL_WIDTH = 120;
const ROW_HEIGHT = 28;
const RULER_HEIGHT = 20;
const DIAMOND_SIZE = 8;

function getLayerLabel(element: LayerElement): string {
  switch (element.type) {
    case "avatar": return "avatar";
    case "shape": return element.shape;
    case "path": return "path";
    case "icon": return element.icon;
    case "text": return element.content.slice(0, 8);
    case "particle-preset": return element.preset;
  }
}

// compute the effective duration fraction a layer occupies in the timeline
function getLayerSpan(layer: AnimationLayer, totalDuration: number): { start: number; end: number } {
  if (totalDuration <= 0) return { start: 0, end: 1 };
  const start = layer.delay / totalDuration;
  // layer plays for its keyframe span (offset 0 to 1) after delay
  // the layer's animation length is based on the max keyframe offset
  const maxOffset = layer.keyframes.reduce((max, kf) => Math.max(max, kf.offset), 0);
  // layer duration equals total duration minus delay (layer fills remaining time)
  const layerDuration = totalDuration - layer.delay;
  const end = start + (layerDuration * maxOffset) / totalDuration;
  return { start, end: Math.min(end, 1) };
}

const EffectTimeline: Component<EffectTimelineProps> = (props) => {
  let timelineRef: HTMLDivElement | undefined;

  const [hiddenLayers, setHiddenLayers] = createSignal<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = createSignal<{ x: number; y: number; layerId: string } | null>(null);
  const [draggingKeyframe, setDraggingKeyframe] = createSignal<{
    layerId: string;
    index: number;
    startOffset: number;
  } | null>(null);
  const [draggingPlayhead, setDraggingPlayhead] = createSignal(false);

  // generate ruler tick marks based on duration
  const rulerTicks = createMemo(() => {
    const duration = props.effect.duration;
    const ticks: { offset: number; label: string | null }[] = [];
    const step = 100; // tick every 100ms
    for (let ms = 0; ms <= duration; ms += step) {
      const offset = ms / duration;
      // label at 0, 500, 1000, etc
      const label = ms % 500 === 0 ? `${ms}ms` : null;
      ticks.push({ offset, label });
    }
    return ticks;
  });

  function toggleVisibility(layerId: string) {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerId)) {
        next.delete(layerId);
      } else {
        next.add(layerId);
      }
      return next;
    });
  }

  function handleLayerClick(layerId: string) {
    props.onSelectLayer(layerId);
  }

  function handleLayerContextMenu(e: MouseEvent, layerId: string) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, layerId });
  }

  function handleDeleteFromContext() {
    const menu = contextMenu();
    if (menu) {
      props.onDeleteLayer(menu.layerId);
      setContextMenu(null);
    }
  }

  // close context menu on click anywhere
  function handleDocumentClick() {
    if (contextMenu()) setContextMenu(null);
  }

  // keyboard handler for deleting selected keyframe
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Delete" || e.key === "Backspace") {
      if (props.selectedLayerId && props.selectedKeyframeIndex !== null) {
        props.onDeleteKeyframe(props.selectedLayerId, props.selectedKeyframeIndex);
      }
    }
  }

  document.addEventListener("click", handleDocumentClick);
  document.addEventListener("keydown", handleKeyDown);
  onCleanup(() => {
    document.removeEventListener("click", handleDocumentClick);
    document.removeEventListener("keydown", handleKeyDown);
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
  });

  // convert a mouse x position in the timeline area to a 0-1 offset
  function xToOffset(clientX: number): number {
    if (!timelineRef) return 0;
    const rect = timelineRef.getBoundingClientRect();
    const x = clientX - rect.left;
    const offset = x / rect.width;
    return Math.max(0, Math.min(1, Math.round(offset * 1000) / 1000));
  }

  // diamond drag handlers
  function startKeyframeDrag(layerId: string, index: number, offset: number, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    props.onSelectKeyframe(layerId, index);
    setDraggingKeyframe({ layerId, index, startOffset: offset });
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  }

  function handleDragMove(e: MouseEvent) {
    const dk = draggingKeyframe();
    const dp = draggingPlayhead();

    if (dk) {
      const newOffset = xToOffset(e.clientX);
      props.onMoveKeyframe(dk.layerId, dk.index, newOffset);
    } else if (dp) {
      const pos = xToOffset(e.clientX);
      props.onPlayheadChange(pos);
    }
  }

  function handleDragEnd() {
    setDraggingKeyframe(null);
    setDraggingPlayhead(false);
    document.removeEventListener("mousemove", handleDragMove);
    document.removeEventListener("mouseup", handleDragEnd);
  }

  // mousedown on empty timeline space starts playhead drag
  function handleTimelineMouseDown(e: MouseEvent) {
    // only if left button and not on a diamond
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.dataset.diamond) return;

    const pos = xToOffset(e.clientX);
    props.onPlayheadChange(pos);
    setDraggingPlayhead(true);
    document.addEventListener("mousemove", handleDragMove);
    document.addEventListener("mouseup", handleDragEnd);
  }

  // double click on a layer row adds a keyframe
  function handleTimelineDoubleClick(e: MouseEvent, layerId: string) {
    const target = e.target as HTMLElement;
    if (target.dataset.diamond) return;
    const offset = xToOffset(e.clientX);
    props.onAddKeyframe(layerId, offset);
  }

  return (
    <div
      class="h-[180px] flex border-t border-white/10 bg-black select-none overflow-hidden"
      style={{ "font-family": "JetBrains Mono, monospace" }}
    >
      {/* left panel - layer names */}
      <div
        class="flex flex-col border-r border-white/10 flex-shrink-0 overflow-y-auto"
        style={{ width: `${LAYER_PANEL_WIDTH}px` }}
      >
        {/* spacer for ruler alignment */}
        <div
          class="flex-shrink-0 border-b border-white/10"
          style={{ height: `${RULER_HEIGHT}px` }}
        />

        <For each={props.effect.layers}>
          {(layer) => {
            const isSelected = () => props.selectedLayerId === layer.id;
            const isHidden = () => hiddenLayers().has(layer.id);

            return (
              <div
                class="flex items-center gap-1 px-1 cursor-pointer transition-colors hover:bg-white/5"
                classList={{
                  "bg-[#ff4f00]/10": isSelected(),
                  "border-l-2 border-l-[#ff4f00]": isSelected(),
                  "border-l-2 border-l-transparent": !isSelected(),
                }}
                style={{ height: `${ROW_HEIGHT}px` }}
                onClick={() => handleLayerClick(layer.id)}
                onContextMenu={(e) => handleLayerContextMenu(e, layer.id)}
              >
                <button
                  class="flex-shrink-0 p-0.5 text-white/40 hover:text-white/80 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleVisibility(layer.id);
                  }}
                >
                  <Show when={!isHidden()} fallback={<EyeOff size={12} />}>
                    <Eye size={12} />
                  </Show>
                </button>
                <span
                  class="text-[10px] text-white/60 truncate leading-none"
                  classList={{ "text-white/30": isHidden() }}
                >
                  {getLayerLabel(layer.element)}
                </span>
              </div>
            );
          }}
        </For>
      </div>

      {/* right panel - timeline area */}
      <div class="flex-1 flex flex-col overflow-x-auto overflow-y-auto min-w-0">
        {/* ruler */}
        <div
          class="flex-shrink-0 relative border-b border-white/10"
          style={{ height: `${RULER_HEIGHT}px` }}
        >
          <For each={rulerTicks()}>
            {(tick) => (
              <div
                class="absolute top-0"
                style={{ left: `${tick.offset * 100}%` }}
              >
                <div
                  class="w-px bg-white/10"
                  style={{ height: tick.label ? "10px" : "6px" }}
                />
                <Show when={tick.label}>
                  <span class="absolute top-[8px] text-[8px] text-white/30 whitespace-nowrap" style={{ transform: "translateX(-50%)" }}>
                    {tick.label}
                  </span>
                </Show>
              </div>
            )}
          </For>
        </div>

        {/* layer rows with bars and diamonds */}
        <div
          ref={timelineRef}
          class="flex-1 relative"
          onMouseDown={handleTimelineMouseDown}
        >
          <For each={props.effect.layers}>
            {(layer) => {
              const span = () => getLayerSpan(layer, props.effect.duration);

              return (
                <div
                  class="relative"
                  style={{ height: `${ROW_HEIGHT}px` }}
                  onDblClick={(e) => handleTimelineDoubleClick(e, layer.id)}
                >
                  {/* layer bar */}
                  <div
                    class="absolute top-1/2 h-3 bg-white/10 border border-white/20"
                    style={{
                      left: `${span().start * 100}%`,
                      width: `${(span().end - span().start) * 100}%`,
                      transform: "translateY(-50%)",
                    }}
                  />

                  {/* keyframe diamonds */}
                  <For each={layer.keyframes}>
                    {(kf, kfIndex) => {
                      const isSelected = () =>
                        props.selectedLayerId === layer.id &&
                        props.selectedKeyframeIndex === kfIndex();

                      return (
                        <div
                          data-diamond="true"
                          class="absolute top-1/2 cursor-pointer"
                          style={{
                            left: `${kf.offset * 100}%`,
                            width: `${DIAMOND_SIZE}px`,
                            height: `${DIAMOND_SIZE}px`,
                            transform: "translate(-50%, -50%) rotate(45deg)",
                            background: isSelected() ? "#ff4f00" : "rgba(255, 255, 255, 0.4)",
                          }}
                          onMouseDown={(e) => startKeyframeDrag(layer.id, kfIndex(), kf.offset, e)}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onSelectKeyframe(layer.id, kfIndex());
                          }}
                        />
                      );
                    }}
                  </For>
                </div>
              );
            }}
          </For>

          {/* playhead line */}
          <div
            class="absolute top-0 bottom-0 w-px bg-[#ff4f00] pointer-events-none z-10"
            style={{ left: `${props.playheadPosition * 100}%` }}
          >
            {/* playhead handle */}
            <div
              class="absolute -top-1 left-1/2 w-2 h-2 bg-[#ff4f00] pointer-events-auto cursor-col-resize"
              style={{ transform: "translateX(-50%) rotate(45deg)" }}
            />
          </div>
        </div>
      </div>

      {/* context menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class="fixed z-50 bg-black border border-white/10 py-1 shadow-lg"
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
          >
            <button
              class="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              onClick={handleDeleteFromContext}
            >
              <Trash2 size={12} />
              delete layer
            </button>
          </div>
        )}
      </Show>
    </div>
  );
};

export default EffectTimeline;
