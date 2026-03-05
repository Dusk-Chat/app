import { Component, createSignal, createEffect, For, onCleanup } from "solid-js";
import type { EasingCurve } from "../../lib/effects";

interface EasingEditorProps {
  value: EasingCurve;
  onChange: (value: EasingCurve) => void;
}

const EASING_PRESETS = [
  { name: "linear", value: [0, 0, 1, 1] as const },
  { name: "ease-in", value: [0.4, 0, 1, 1] as const },
  { name: "ease-out", value: [0, 0, 0.2, 1] as const },
  { name: "ease-in-out", value: [0.4, 0, 0.2, 1] as const },
  { name: "spring", value: [0.175, 0.885, 0.32, 1.275] as const },
  { name: "bounce", value: [0.68, -0.55, 0.265, 1.55] as const },
];

// map string presets to control point values
function easingToPoints(value: EasingCurve): [number, number, number, number] {
  if (typeof value === "string") {
    const preset = EASING_PRESETS.find((p) => p.name === value);
    if (preset) return [...preset.value];
    return [0, 0, 1, 1];
  }
  return [...value.cubic];
}

// convert canvas pixel coordinates to curve space
// canvas: x goes right, y goes down
// curve space: x goes right (0-1), y goes up (bottom=0, top=1)
function canvasToCurve(
  px: number,
  py: number,
  width: number,
  height: number,
  padding: number,
): [number, number] {
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;
  const x = (px - padding) / drawW;
  const y = 1 - (py - padding) / drawH;
  return [x, y];
}

// convert curve space to canvas pixel coordinates
function curveToCanvas(
  cx: number,
  cy: number,
  width: number,
  height: number,
  padding: number,
): [number, number] {
  const drawW = width - padding * 2;
  const drawH = height - padding * 2;
  const px = padding + cx * drawW;
  const py = padding + (1 - cy) * drawH;
  return [px, py];
}

const CANVAS_SIZE = 200;
const PADDING = 16;
const POINT_RADIUS = 8;

const EasingEditor: Component<EasingEditorProps> = (props) => {
  let canvasRef: HTMLCanvasElement | undefined;
  const [points, setPoints] = createSignal<[number, number, number, number]>(
    easingToPoints(props.value),
  );
  const [dragging, setDragging] = createSignal<1 | 2 | null>(null);

  // sync from props when value changes externally
  createEffect(() => {
    const incoming = easingToPoints(props.value);
    const current = points();
    // only update if actually different to avoid feedback loops
    if (
      incoming[0] !== current[0] ||
      incoming[1] !== current[1] ||
      incoming[2] !== current[2] ||
      incoming[3] !== current[3]
    ) {
      setPoints(incoming);
    }
  });

  // redraw canvas whenever points change
  createEffect(() => {
    const p = points();
    drawCurve(p);
  });

  function drawCurve(p: [number, number, number, number]) {
    const canvas = canvasRef;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = CANVAS_SIZE;
    const h = CANVAS_SIZE;
    ctx.clearRect(0, 0, w, h);

    // grid lines at 25% intervals
    ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const [gx] = curveToCanvas(i / 4, 0, w, h, PADDING);
      const [, gy2] = curveToCanvas(0, i / 4, w, h, PADDING);
      // vertical line
      ctx.beginPath();
      ctx.moveTo(gx, PADDING);
      ctx.lineTo(gx, h - PADDING);
      ctx.stroke();
      // horizontal line
      ctx.beginPath();
      ctx.moveTo(PADDING, gy2);
      ctx.lineTo(w - PADDING, gy2);
      ctx.stroke();
    }

    const [x0, y0] = curveToCanvas(0, 0, w, h, PADDING);
    const [x1, y1] = curveToCanvas(1, 1, w, h, PADDING);
    const [cp1x, cp1y] = curveToCanvas(p[0], p[1], w, h, PADDING);
    const [cp2x, cp2y] = curveToCanvas(p[2], p[3], w, h, PADDING);

    // handle lines from endpoints to control points
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(cp1x, cp1y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(cp2x, cp2y);
    ctx.stroke();

    // bezier curve
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x1, y1);
    ctx.stroke();

    // control point 1
    ctx.fillStyle = "#ff4f00";
    ctx.beginPath();
    ctx.arc(cp1x, cp1y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // control point 2
    ctx.beginPath();
    ctx.arc(cp2x, cp2y, POINT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }

  function hitTest(
    mx: number,
    my: number,
  ): 1 | 2 | null {
    const p = points();
    const [cp1x, cp1y] = curveToCanvas(
      p[0], p[1], CANVAS_SIZE, CANVAS_SIZE, PADDING,
    );
    const [cp2x, cp2y] = curveToCanvas(
      p[2], p[3], CANVAS_SIZE, CANVAS_SIZE, PADDING,
    );
    const d1 = Math.hypot(mx - cp1x, my - cp1y);
    const d2 = Math.hypot(mx - cp2x, my - cp2y);
    // prefer whichever is closer when both in range
    if (d1 <= POINT_RADIUS + 4 && d1 <= d2) return 1;
    if (d2 <= POINT_RADIUS + 4) return 2;
    if (d1 <= POINT_RADIUS + 4) return 1;
    return null;
  }

  function getCanvasCoords(e: MouseEvent): [number, number] {
    const rect = canvasRef!.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    return [
      (e.clientX - rect.left) * scaleX,
      (e.clientY - rect.top) * scaleY,
    ];
  }

  function handleMouseDown(e: MouseEvent) {
    const [mx, my] = getCanvasCoords(e);
    const hit = hitTest(mx, my);
    if (hit) {
      setDragging(hit);
      e.preventDefault();
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const d = dragging();
    if (!d) return;
    const [mx, my] = getCanvasCoords(e);
    let [cx, cy] = canvasToCurve(mx, my, CANVAS_SIZE, CANVAS_SIZE, PADDING);
    // clamp x to [0, 1], allow y in [-0.5, 1.5]
    cx = Math.max(0, Math.min(1, cx));
    cy = Math.max(-0.5, Math.min(1.5, cy));
    // round to 3 decimal places for clean output
    cx = Math.round(cx * 1000) / 1000;
    cy = Math.round(cy * 1000) / 1000;

    const p = points();
    let next: [number, number, number, number];
    if (d === 1) {
      next = [cx, cy, p[2], p[3]];
    } else {
      next = [p[0], p[1], cx, cy];
    }
    setPoints(next);
    props.onChange({ cubic: next });
  }

  function handleMouseUp() {
    setDragging(null);
  }

  // attach document-level listeners for drag tracking outside canvas
  function attachGlobalListeners() {
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleGlobalMouseUp);
  }

  function removeGlobalListeners() {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleGlobalMouseUp);
  }

  function handleGlobalMouseUp() {
    handleMouseUp();
    removeGlobalListeners();
  }

  function onCanvasMouseDown(e: MouseEvent) {
    handleMouseDown(e);
    if (dragging()) {
      attachGlobalListeners();
    }
  }

  onCleanup(() => {
    removeGlobalListeners();
  });

  function applyPreset(value: readonly [number, number, number, number]) {
    const next: [number, number, number, number] = [...value];
    setPoints(next);
    props.onChange({ cubic: next });
  }

  const p = points;

  return (
    <div class="flex flex-col gap-2">
      {/* preset buttons */}
      <div class="flex flex-wrap gap-1">
        <For each={EASING_PRESETS}>
          {(preset) => (
            <button
              class="px-2 py-1 text-xs bg-white/5 text-white/60 hover:bg-white/10 hover:text-white transition-colors font-[JetBrains_Mono]"
              onClick={() => applyPreset(preset.value)}
            >
              {preset.name}
            </button>
          )}
        </For>
      </div>

      {/* canvas */}
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        class="w-[200px] h-[200px] bg-black border border-white/10 cursor-crosshair"
        onMouseDown={onCanvasMouseDown}
      />

      {/* current value display */}
      <span class="text-xs text-white/40 font-[JetBrains_Mono]">
        cubic-bezier({p()[0]}, {p()[1]}, {p()[2]}, {p()[3]})
      </span>
    </div>
  );
};

export default EasingEditor;
