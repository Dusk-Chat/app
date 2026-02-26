// app/src/lib/effects.ts

// === types ===

export interface ProfileEffect {
  id: string;
  name: string;
  author_peer_id: string;
  version: 1;
  trigger: "click" | "hover" | "entrance";
  duration: number;
  layers: AnimationLayer[];
}

export interface AnimationLayer {
  id: string;
  element: LayerElement;
  keyframes: EffectKeyframe[];
  easing: EasingCurve;
  delay: number;
  repeat: number;
}

export type LayerElement =
  | { type: "avatar" }
  | { type: "shape"; shape: ShapeType; fill: string; stroke?: string; size: number }
  | { type: "path"; d: string; stroke: string; strokeWidth: number; fill?: string }
  | { type: "icon"; icon: string; color: string; size: number }
  | { type: "text"; content: string; font: string; color: string; size: number }
  | { type: "particle-preset"; preset: ParticlePresetName };

export type ShapeType =
  | "circle" | "ring" | "star" | "diamond" | "hexagon" | "triangle"
  | "heart" | "lightning" | "crescent" | "cross" | "spiral" | "burst";

export type ParticlePresetName =
  | "embers" | "confetti" | "sparkle" | "snow" | "fireflies" | "smoke";

export interface EffectKeyframe {
  offset: number;
  properties: KeyframeProperties;
  easing?: EasingCurve;
}

export interface KeyframeProperties {
  x?: number;
  y?: number;
  scale?: number;
  rotation?: number;
  opacity?: number;
  blur?: number;
  color?: string;
  glowColor?: string;
  glowSize?: number;
  pathOffset?: number;
}

export type EasingCurve =
  | "linear" | "ease-in" | "ease-out" | "ease-in-out"
  | { cubic: [number, number, number, number] };

// === constants ===

export const MAX_LAYERS = 12;
export const MAX_DURATION = 5000;
export const MIN_DURATION = 100;
export const MAX_EFFECT_SIZE = 10240; // 10kb

export const VALID_SHAPES: ShapeType[] = [
  "circle", "ring", "star", "diamond", "hexagon", "triangle",
  "heart", "lightning", "crescent", "cross", "spiral", "burst",
];

export const VALID_PARTICLE_PRESETS: ParticlePresetName[] = [
  "embers", "confetti", "sparkle", "snow", "fireflies", "smoke",
];

export const ANIMATABLE_PROPERTIES: (keyof KeyframeProperties)[] = [
  "x", "y", "scale", "rotation", "opacity", "blur",
  "color", "glowColor", "glowSize", "pathOffset",
];

// === validation ===

const HEX_COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const RGBA_COLOR_RE = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/;
// only valid svg path commands and their numeric arguments
const SVG_PATH_RE = /^[MmZzLlHhVvCcSsQqTtAa0-9\s,.\-+eE]+$/;

function isValidColor(val: string): boolean {
  return HEX_COLOR_RE.test(val) || RGBA_COLOR_RE.test(val);
}

function isValidSvgPath(d: string): boolean {
  return SVG_PATH_RE.test(d) && d.length < 2048;
}

function sanitizeText(text: string): string {
  // strip any html tags
  return text.replace(/<[^>]*>/g, "").slice(0, 64);
}

function clamp(val: number, min: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// safely coerce to number, returning the fallback only when the input
// is not a finite number (preserves legitimate zero values)
function toNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

// validate and sanitize an effect received from a peer
// returns null if the effect is fundamentally invalid
export function validateEffect(raw: unknown): ProfileEffect | null {
  if (!raw || typeof raw !== "object") return null;

  const effect = raw as Record<string, unknown>;
  if (effect.version !== 1) return null;
  if (typeof effect.id !== "string" || !effect.id) return null;
  if (typeof effect.name !== "string") return null;
  if (typeof effect.author_peer_id !== "string") return null;

  const trigger = effect.trigger;
  if (trigger !== "click" && trigger !== "hover" && trigger !== "entrance") return null;

  const duration = Number(effect.duration);
  if (!Number.isFinite(duration)) return null;

  const layers = effect.layers;
  if (!Array.isArray(layers) || layers.length === 0 || layers.length > MAX_LAYERS) return null;

  const validatedLayers: AnimationLayer[] = [];
  for (const layer of layers) {
    const validated = validateLayer(layer);
    if (!validated) continue;
    validatedLayers.push(validated);
  }

  if (validatedLayers.length === 0) return null;

  // check total serialized size to prevent oversized payloads
  const serialized = JSON.stringify({ ...effect, layers: validatedLayers });
  if (serialized.length > MAX_EFFECT_SIZE) return null;

  return {
    id: String(effect.id),
    name: sanitizeText(String(effect.name)),
    author_peer_id: String(effect.author_peer_id),
    version: 1,
    trigger: trigger as ProfileEffect["trigger"],
    duration: clamp(duration, MIN_DURATION, MAX_DURATION),
    layers: validatedLayers,
  };
}

function validateLayer(raw: unknown): AnimationLayer | null {
  if (!raw || typeof raw !== "object") return null;

  const layer = raw as Record<string, unknown>;
  if (typeof layer.id !== "string") return null;

  const element = validateElement(layer.element);
  if (!element) return null;

  const keyframes = layer.keyframes;
  if (!Array.isArray(keyframes) || keyframes.length < 2) return null;

  const validatedKeyframes: EffectKeyframe[] = [];
  for (const kf of keyframes) {
    const validated = validateKeyframe(kf);
    if (validated) validatedKeyframes.push(validated);
  }

  if (validatedKeyframes.length < 2) return null;

  return {
    id: String(layer.id),
    element,
    keyframes: validatedKeyframes,
    easing: validateEasing(layer.easing) ?? "ease-out",
    delay: clamp(toNumber(layer.delay, 0), 0, MAX_DURATION),
    repeat: clamp(Math.floor(toNumber(layer.repeat, 0)), -1, 10),
  };
}

function validateElement(raw: unknown): LayerElement | null {
  if (!raw || typeof raw !== "object") return null;

  const el = raw as Record<string, unknown>;
  switch (el.type) {
    case "avatar":
      return { type: "avatar" };

    case "shape": {
      const shape = String(el.shape);
      if (!VALID_SHAPES.includes(shape as ShapeType)) return null;
      const fill = String(el.fill || "#ffffff");
      if (!isValidColor(fill)) return null;
      const stroke = el.stroke ? String(el.stroke) : undefined;
      if (stroke && !isValidColor(stroke)) return null;
      return {
        type: "shape",
        shape: shape as ShapeType,
        fill,
        stroke,
        size: clamp(toNumber(el.size, 24), 4, 200),
      };
    }

    case "path": {
      const d = String(el.d || "");
      if (!isValidSvgPath(d)) return null;
      const stroke = String(el.stroke || "#ffffff");
      if (!isValidColor(stroke)) return null;
      const fill = el.fill ? String(el.fill) : undefined;
      if (fill && !isValidColor(fill)) return null;
      return {
        type: "path",
        d,
        stroke,
        strokeWidth: clamp(toNumber(el.strokeWidth, 2), 0.5, 10),
        fill,
      };
    }

    case "icon": {
      const icon = String(el.icon || "");
      if (!icon || icon.length > 32) return null;
      const color = String(el.color || "#ffffff");
      if (!isValidColor(color)) return null;
      return {
        type: "icon",
        icon,
        color,
        size: clamp(toNumber(el.size, 24), 8, 128),
      };
    }

    case "text": {
      const content = sanitizeText(String(el.content || ""));
      if (!content) return null;
      const color = String(el.color || "#ffffff");
      if (!isValidColor(color)) return null;
      return {
        type: "text",
        content,
        font: "sans",
        color,
        size: clamp(toNumber(el.size, 16), 8, 72),
      };
    }

    case "particle-preset": {
      const preset = String(el.preset);
      if (!VALID_PARTICLE_PRESETS.includes(preset as ParticlePresetName)) return null;
      return { type: "particle-preset", preset: preset as ParticlePresetName };
    }

    default:
      return null;
  }
}

function validateKeyframe(raw: unknown): EffectKeyframe | null {
  if (!raw || typeof raw !== "object") return null;

  const kf = raw as Record<string, unknown>;
  const offset = Number(kf.offset);
  if (!Number.isFinite(offset) || offset < 0 || offset > 1) return null;

  const props = kf.properties;
  if (!props || typeof props !== "object") return null;

  const p = props as Record<string, unknown>;
  const validated: KeyframeProperties = {};

  if (p.x !== undefined) validated.x = clamp(toNumber(p.x, 0), -500, 500);
  if (p.y !== undefined) validated.y = clamp(toNumber(p.y, 0), -500, 500);
  if (p.scale !== undefined) validated.scale = clamp(toNumber(p.scale, 1), 0, 5);
  if (p.rotation !== undefined) validated.rotation = clamp(toNumber(p.rotation, 0), -3600, 3600);
  if (p.opacity !== undefined) validated.opacity = clamp(toNumber(p.opacity, 1), 0, 1);
  if (p.blur !== undefined) validated.blur = clamp(toNumber(p.blur, 0), 0, 50);
  if (p.color !== undefined && isValidColor(String(p.color))) validated.color = String(p.color);
  if (p.glowColor !== undefined && isValidColor(String(p.glowColor))) validated.glowColor = String(p.glowColor);
  if (p.glowSize !== undefined) validated.glowSize = clamp(toNumber(p.glowSize, 0), 0, 100);
  if (p.pathOffset !== undefined) validated.pathOffset = clamp(toNumber(p.pathOffset, 0), 0, 1);

  const easing = validateEasing(kf.easing);
  const result: EffectKeyframe = { offset, properties: validated };
  if (easing) result.easing = easing;
  return result;
}

function validateEasing(raw: unknown): EasingCurve | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw === "string") {
    if (["linear", "ease-in", "ease-out", "ease-in-out"].includes(raw)) {
      return raw as EasingCurve;
    }
    return undefined;
  }
  if (typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.cubic) && obj.cubic.length === 4) {
      const nums = obj.cubic.map(Number);
      if (nums.every(Number.isFinite)) {
        return { cubic: nums as [number, number, number, number] };
      }
    }
  }
  return undefined;
}

// === css generation ===

export function easingToCss(easing: EasingCurve): string {
  if (typeof easing === "string") {
    switch (easing) {
      case "linear": return "linear";
      case "ease-in": return "cubic-bezier(0.4, 0, 1, 1)";
      case "ease-out": return "cubic-bezier(0, 0, 0.2, 1)";
      case "ease-in-out": return "cubic-bezier(0.4, 0, 0.2, 1)";
    }
  }
  const [x1, y1, x2, y2] = easing.cubic;
  return `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`;
}

// convert a layer's keyframes to web animations api format
export function layerToWebAnimationKeyframes(layer: AnimationLayer): Keyframe[] {
  return layer.keyframes
    .sort((a, b) => a.offset - b.offset)
    .map((kf) => {
      const frame: Keyframe = { offset: kf.offset };
      const p = kf.properties;

      // build transform string
      const transforms: string[] = [];
      if (p.x !== undefined || p.y !== undefined) {
        transforms.push(`translate(${p.x ?? 0}px, ${p.y ?? 0}px)`);
      }
      if (p.scale !== undefined) {
        transforms.push(`scale(${p.scale})`);
      }
      if (p.rotation !== undefined) {
        transforms.push(`rotate(${p.rotation}deg)`);
      }
      if (transforms.length > 0) {
        frame.transform = transforms.join(" ");
      }

      if (p.opacity !== undefined) frame.opacity = p.opacity;

      // build filter string
      const filters: string[] = [];
      if (p.blur !== undefined && p.blur > 0) {
        filters.push(`blur(${p.blur}px)`);
      }
      if (filters.length > 0) {
        frame.filter = filters.join(" ");
      }

      // glow via box-shadow
      if (p.glowColor !== undefined || p.glowSize !== undefined) {
        const color = p.glowColor ?? "#ff4f00";
        const size = p.glowSize ?? 0;
        frame.boxShadow = `0 0 ${size}px ${size / 2}px ${color}`;
      }

      // per-keyframe easing
      if (kf.easing) {
        frame.easing = easingToCss(kf.easing);
      }

      return frame;
    });
}

// === helpers ===

export function generateId(): string {
  return crypto.randomUUID().slice(0, 12);
}

export function createEmptyEffect(authorPeerId: string): ProfileEffect {
  return {
    id: generateId(),
    name: "untitled effect",
    author_peer_id: authorPeerId,
    version: 1,
    trigger: "click",
    duration: 1000,
    layers: [],
  };
}

export function createLayer(element: LayerElement): AnimationLayer {
  return {
    id: generateId(),
    element,
    keyframes: [
      { offset: 0, properties: { opacity: 0, scale: 0.8 } },
      { offset: 1, properties: { opacity: 1, scale: 1 } },
    ],
    easing: "ease-out",
    delay: 0,
    repeat: 0,
  };
}

// deep clone an effect for duplicating presets into editor
export function cloneEffect(effect: ProfileEffect): ProfileEffect {
  return JSON.parse(JSON.stringify({ ...effect, id: generateId() }));
}
