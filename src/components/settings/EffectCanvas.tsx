// center panel of the keyframe editor showing a live preview with direct manipulation

import type { Component } from "solid-js";
import { createSignal, For, Show, createMemo, onMount, onCleanup } from "solid-js";
import type { ProfileEffect, LayerElement, KeyframeProperties, EffectKeyframe } from "../../lib/effects";
import Avatar from "../common/Avatar";
import ShapeRenderer from "../../lib/effects-shapes";

interface EffectCanvasProps {
  effect: ProfileEffect;
  selectedLayerId: string | null;
  playheadPosition: number;
  isPlaying: boolean;
  avatarName: string;
  onSelectLayer: (id: string | null) => void;
  onUpdateLayerPosition: (layerId: string, x: number, y: number) => void;
  onUpdateLayerScale: (layerId: string, scale: number) => void;
  onUpdateLayerRotation: (layerId: string, rotation: number) => void;
}

// linearly interpolate between two numbers
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// interpolate each numeric property between two keyframes, colors use the "from" value
function lerpProperties(from: KeyframeProperties, to: KeyframeProperties, t: number): KeyframeProperties {
  const result: KeyframeProperties = {};

  if (from.x !== undefined || to.x !== undefined) {
    result.x = lerp(from.x ?? 0, to.x ?? 0, t);
  }
  if (from.y !== undefined || to.y !== undefined) {
    result.y = lerp(from.y ?? 0, to.y ?? 0, t);
  }
  if (from.scale !== undefined || to.scale !== undefined) {
    result.scale = lerp(from.scale ?? 1, to.scale ?? 1, t);
  }
  if (from.rotation !== undefined || to.rotation !== undefined) {
    result.rotation = lerp(from.rotation ?? 0, to.rotation ?? 0, t);
  }
  if (from.opacity !== undefined || to.opacity !== undefined) {
    result.opacity = lerp(from.opacity ?? 1, to.opacity ?? 1, t);
  }
  if (from.blur !== undefined || to.blur !== undefined) {
    result.blur = lerp(from.blur ?? 0, to.blur ?? 0, t);
  }
  if (from.glowSize !== undefined || to.glowSize !== undefined) {
    result.glowSize = lerp(from.glowSize ?? 0, to.glowSize ?? 0, t);
  }
  if (from.pathOffset !== undefined || to.pathOffset !== undefined) {
    result.pathOffset = lerp(from.pathOffset ?? 0, to.pathOffset ?? 0, t);
  }

  // colors just use the "from" value
  if (from.color !== undefined) result.color = from.color;
  else if (to.color !== undefined) result.color = to.color;

  if (from.glowColor !== undefined) result.glowColor = from.glowColor;
  else if (to.glowColor !== undefined) result.glowColor = to.glowColor;

  return result;
}

// find the interpolated properties at a given playhead position
function interpolateProperties(keyframes: EffectKeyframe[], position: number): KeyframeProperties {
  if (keyframes.length === 0) return {};
  if (keyframes.length === 1) return keyframes[0].properties;

  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset);
  if (position <= sorted[0].offset) return sorted[0].properties;
  if (position >= sorted[sorted.length - 1].offset) return sorted[sorted.length - 1].properties;

  for (let i = 0; i < sorted.length - 1; i++) {
    if (position >= sorted[i].offset && position <= sorted[i + 1].offset) {
      const t = (position - sorted[i].offset) / (sorted[i + 1].offset - sorted[i].offset);
      return lerpProperties(sorted[i].properties, sorted[i + 1].properties, t);
    }
  }

  return sorted[sorted.length - 1].properties;
}

// build css transform + filter strings from interpolated properties
function buildTransformStyle(props: KeyframeProperties): Record<string, string> {
  const transforms: string[] = [];
  const x = props.x ?? 0;
  const y = props.y ?? 0;
  if (x !== 0 || y !== 0) transforms.push(`translate(${x}px, ${y}px)`);
  if (props.scale !== undefined) transforms.push(`scale(${props.scale})`);
  if (props.rotation !== undefined) transforms.push(`rotate(${props.rotation}deg)`);

  const style: Record<string, string> = {};
  if (transforms.length > 0) style.transform = transforms.join(" ");
  if (props.opacity !== undefined) style.opacity = String(props.opacity);
  if (props.blur !== undefined && props.blur > 0) style.filter = `blur(${props.blur}px)`;
  if (props.glowColor || props.glowSize) {
    const color = props.glowColor ?? "#ff4f00";
    const size = props.glowSize ?? 0;
    style["box-shadow"] = `0 0 ${size}px ${size / 2}px ${color}`;
  }

  return style;
}

// get positions of all keyframes for drawing the ghost trail
function getKeyframePositions(keyframes: EffectKeyframe[]): { x: number; y: number }[] {
  const sorted = [...keyframes].sort((a, b) => a.offset - b.offset);
  return sorted.map((kf) => ({
    x: kf.properties.x ?? 0,
    y: kf.properties.y ?? 0,
  }));
}

// render the appropriate element for a layer
function renderLayerElement(element: LayerElement, avatarName: string): any {
  switch (element.type) {
    case "avatar":
      return <Avatar name={avatarName} size="xl" />;
    case "shape":
      return (
        <ShapeRenderer
          shape={element.shape}
          size={element.size}
          fill={element.fill}
          stroke={element.stroke}
        />
      );
    case "path":
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 100 100"
          width="64"
          height="64"
          style={{ overflow: "visible" }}
        >
          <path
            d={element.d}
            stroke={element.stroke}
            stroke-width={element.strokeWidth}
            fill={element.fill ?? "none"}
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      );
    case "text":
      return (
        <span
          style={{
            color: element.color,
            "font-size": `${element.size}px`,
            "font-family": element.font === "mono" ? "JetBrains Mono, monospace" : "Space Grotesk, sans-serif",
            "white-space": "nowrap",
            "user-select": "none",
          }}
        >
          {element.content}
        </span>
      );
    case "particle-preset":
      return (
        <div
          style={{
            padding: "4px 8px",
            border: "1px dashed rgba(255, 255, 255, 0.3)",
            color: "rgba(255, 255, 255, 0.5)",
            "font-size": "11px",
            "font-family": "JetBrains Mono, monospace",
            "user-select": "none",
          }}
        >
          particles: {element.preset}
        </div>
      );
    default:
      return null;
  }
}

const GRID_DOT_SPACING = 20;

const EffectCanvas: Component<EffectCanvasProps> = (props) => {
  let canvasRef: HTMLDivElement | undefined;

  const [dragging, setDragging] = createSignal<{
    layerId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  // grid background pattern as an inline svg data url
  const gridBg = createMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID_DOT_SPACING}" height="${GRID_DOT_SPACING}"><circle cx="1" cy="1" r="0.5" fill="rgba(255,255,255,0.05)"/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  });

  // get interpolated properties for each layer at current playhead
  const layerStates = createMemo(() => {
    return props.effect.layers.map((layer) => ({
      layer,
      properties: interpolateProperties(layer.keyframes, props.playheadPosition),
    }));
  });

  // ghost trail svg path for the selected layer
  const ghostTrail = createMemo(() => {
    if (!props.selectedLayerId) return null;
    const layer = props.effect.layers.find((l) => l.id === props.selectedLayerId);
    if (!layer || layer.keyframes.length < 2) return null;

    const positions = getKeyframePositions(layer.keyframes);
    if (positions.length < 2) return null;

    return positions;
  });

  // handle clicking empty canvas space to deselect
  function handleCanvasClick(e: MouseEvent) {
    if (e.target === canvasRef || (e.target as HTMLElement).dataset.canvasBg === "true") {
      props.onSelectLayer(null);
    }
  }

  // start dragging a layer element
  function handleLayerPointerDown(e: PointerEvent, layerId: string, currentProps: KeyframeProperties) {
    e.stopPropagation();
    e.preventDefault();
    props.onSelectLayer(layerId);

    setDragging({
      layerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: currentProps.x ?? 0,
      originY: currentProps.y ?? 0,
    });

    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function handlePointerMove(e: PointerEvent) {
    const drag = dragging();
    if (!drag) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    props.onUpdateLayerPosition(drag.layerId, drag.originX + dx, drag.originY + dy);
  }

  function handlePointerUp() {
    setDragging(null);
  }

  // attach global pointer events for drag
  onMount(() => {
    const onMove = (e: PointerEvent) => handlePointerMove(e);
    const onUp = () => handlePointerUp();
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    onCleanup(() => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    });
  });

  return (
    <div
      ref={canvasRef}
      class="relative w-full h-full overflow-hidden"
      style={{
        background: `rgba(0, 0, 0, 0.5)`,
        "background-image": gridBg(),
        cursor: dragging() ? "grabbing" : "default",
      }}
      onClick={handleCanvasClick}
      data-canvas-bg="true"
    >
      {/* ghost trail for selected layer motion path */}
      <Show when={ghostTrail()}>
        {(positions) => (
          <svg
            class="absolute inset-0 w-full h-full pointer-events-none"
            style={{ overflow: "visible" }}
          >
            <polyline
              points={positions().map((p) => `${p.x},${p.y}`).join(" ")}
              fill="none"
              stroke="rgba(255, 255, 255, 0.2)"
              stroke-width="1"
              stroke-dasharray="4 4"
              // offset to center of canvas
              transform={`translate(${canvasRef?.clientWidth ? canvasRef.clientWidth / 2 : 0}, ${canvasRef?.clientHeight ? canvasRef.clientHeight / 2 : 0})`}
            />
            {/* keyframe position dots */}
            <For each={positions()}>
              {(pos) => (
                <circle
                  cx={pos.x}
                  cy={pos.y}
                  r="3"
                  fill="rgba(255, 255, 255, 0.3)"
                  transform={`translate(${canvasRef?.clientWidth ? canvasRef.clientWidth / 2 : 0}, ${canvasRef?.clientHeight ? canvasRef.clientHeight / 2 : 0})`}
                />
              )}
            </For>
          </svg>
        )}
      </Show>

      {/* layer elements rendered at interpolated positions */}
      <For each={layerStates()}>
        {({ layer, properties }) => {
          const isSelected = () => props.selectedLayerId === layer.id;
          const transformStyle = () => buildTransformStyle(properties);

          return (
            <div
              class="absolute"
              style={{
                // center the layer in the canvas, then apply keyframe transform
                left: "50%",
                top: "50%",
                "margin-left": "-32px",
                "margin-top": "-32px",
                ...transformStyle(),
                cursor: dragging() ? "grabbing" : "grab",
                outline: isSelected() ? "1px dashed #FF4F00" : "none",
                "outline-offset": "4px",
                "z-index": isSelected() ? "10" : "1",
              }}
              onPointerDown={(e) => handleLayerPointerDown(e, layer.id, properties)}
            >
              {renderLayerElement(layer.element, props.avatarName)}
            </div>
          );
        }}
      </For>
    </div>
  );
};

export default EffectCanvas;
