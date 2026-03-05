// right panel of the keyframe editor showing properties for the current selection

import type { Component } from "solid-js";
import { createSignal, Show, Switch, Match, For, onCleanup } from "solid-js";
import type {
  ProfileEffect,
  KeyframeProperties,
  EasingCurve,
  LayerElement,
  ShapeType,
  ParticlePresetName,
  AnimationLayer,
} from "../../lib/effects";
import { VALID_SHAPES, VALID_PARTICLE_PRESETS } from "../../lib/effects";
import EasingEditor from "./EasingEditor";

// === drag input sub-component ===
// scrubber-style number input that supports direct typing,
// click-drag left/right adjustment, and arrow key stepping

interface DragInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
}

const DragInput: Component<DragInputProps> = (props) => {
  let inputRef: HTMLInputElement | undefined;
  const [editing, setEditing] = createSignal(false);
  const [editValue, setEditValue] = createSignal("");

  // track drag state outside signals to avoid stale closures in global listeners
  let dragStartX = 0;
  let dragStartValue = 0;
  let isDragging = false;
  let hasMoved = false;

  const step = () => props.step ?? 1;

  function clampValue(v: number): number {
    let result = v;
    if (props.min !== undefined) result = Math.max(result, props.min);
    if (props.max !== undefined) result = Math.min(result, props.max);
    // round to step precision to avoid floating point drift
    const s = step();
    const decimals = s < 1 ? Math.ceil(-Math.log10(s)) : 0;
    return Number(result.toFixed(decimals));
  }

  function handleMouseDown(e: MouseEvent) {
    // only initiate drag from the label area, not during text editing
    if (editing()) return;
    e.preventDefault();
    dragStartX = e.clientX;
    dragStartValue = props.value;
    isDragging = true;
    hasMoved = false;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isDragging) return;
    const delta = e.clientX - dragStartX;
    if (Math.abs(delta) > 2) hasMoved = true;
    // shift key for fine control at 0.1x speed
    const speed = e.shiftKey ? 0.1 : 1;
    const newValue = dragStartValue + delta * step() * speed;
    props.onChange(clampValue(newValue));
  }

  function handleMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
    // if no drag movement occurred, treat as click to enter edit mode
    if (!hasMoved) {
      setEditing(true);
      setEditValue(String(props.value));
      requestAnimationFrame(() => {
        inputRef?.focus();
        inputRef?.select();
      });
    }
  }

  function commitEdit() {
    setEditing(false);
    const parsed = parseFloat(editValue());
    if (Number.isFinite(parsed)) {
      props.onChange(clampValue(parsed));
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (editing()) {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
      return;
    }

    // arrow keys for stepping when not in text editing mode
    const increment = e.shiftKey ? step() * 0.1 : step();
    if (e.key === "ArrowUp") {
      e.preventDefault();
      props.onChange(clampValue(props.value + increment));
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      props.onChange(clampValue(props.value - increment));
    }
  }

  onCleanup(() => {
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  });

  return (
    <div class="flex items-center justify-between gap-2">
      <label
        class="text-[11px] font-[JetBrains_Mono] text-white/40 whitespace-nowrap select-none cursor-ew-resize"
        onMouseDown={handleMouseDown}
      >
        {props.label}
      </label>
      <Show
        when={editing()}
        fallback={
          <div
            class="w-[80px] min-w-[80px] bg-black border-2 border-white/20 px-2 py-1 text-xs text-white font-sans text-right cursor-ew-resize select-none"
            onMouseDown={handleMouseDown}
            onKeyDown={handleKeyDown}
            tabIndex={0}
          >
            {props.value}
          </div>
        }
      >
        <input
          ref={inputRef}
          type="text"
          class="w-[80px] min-w-[80px] bg-black border-2 border-orange px-2 py-1 text-xs text-white font-sans text-right outline-none"
          value={editValue()}
          onInput={(e) => setEditValue(e.currentTarget.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
        />
      </Show>
    </div>
  );
};

// === text input row ===

const TextInput: Component<{
  label: string;
  value: string;
  onChange: (value: string) => void;
}> = (props) => {
  return (
    <div class="flex items-center justify-between gap-2">
      <label class="text-[11px] font-[JetBrains_Mono] text-white/40 whitespace-nowrap">
        {props.label}
      </label>
      <input
        type="text"
        class="w-[80px] min-w-[80px] bg-black border-2 border-white/20 focus:border-orange px-2 py-1 text-xs text-white font-sans text-right outline-none"
        value={props.value}
        onInput={(e) => props.onChange(e.currentTarget.value)}
      />
    </div>
  );
};

// === select input row ===

const SelectInput: Component<{
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}> = (props) => {
  return (
    <div class="flex items-center justify-between gap-2">
      <label class="text-[11px] font-[JetBrains_Mono] text-white/40 whitespace-nowrap">
        {props.label}
      </label>
      <select
        class="w-[80px] min-w-[80px] bg-black border-2 border-white/20 focus:border-orange px-1 py-1 text-xs text-white font-sans outline-none cursor-pointer"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
      >
        <For each={props.options}>
          {(opt) => <option value={opt}>{opt}</option>}
        </For>
      </select>
    </div>
  );
};

// === section header ===

const SectionLabel: Component<{ text: string }> = (props) => {
  return (
    <div class="text-[11px] font-[JetBrains_Mono] uppercase text-white/40 tracking-wider pt-3 pb-1">
      {props.text}
    </div>
  );
};

// === main component ===

interface EffectPropertiesProps {
  effect: ProfileEffect;
  selectedLayerId: string | null;
  selectedKeyframeIndex: number | null;
  onUpdateKeyframe: (layerId: string, index: number, props: Partial<KeyframeProperties>) => void;
  onUpdateKeyframeEasing: (layerId: string, index: number, easing: EasingCurve) => void;
  onUpdateLayerElement: (layerId: string, element: LayerElement) => void;
  onUpdateLayerTiming: (layerId: string, delay: number, repeat: number, easing: EasingCurve) => void;
  onUpdateEffect: (updates: Partial<Pick<ProfileEffect, "name" | "trigger" | "duration">>) => void;
}

const EffectProperties: Component<EffectPropertiesProps> = (props) => {
  // find the currently selected layer
  function selectedLayer(): AnimationLayer | undefined {
    if (!props.selectedLayerId) return undefined;
    return props.effect.layers.find((l) => l.id === props.selectedLayerId);
  }

  // find the currently selected keyframe properties
  function selectedKeyframeProps(): KeyframeProperties | undefined {
    const layer = selectedLayer();
    if (!layer || props.selectedKeyframeIndex === null) return undefined;
    return layer.keyframes[props.selectedKeyframeIndex]?.properties;
  }

  // find the currently selected keyframe easing
  function selectedKeyframeEasing(): EasingCurve {
    const layer = selectedLayer();
    if (!layer || props.selectedKeyframeIndex === null) return "linear";
    return layer.keyframes[props.selectedKeyframeIndex]?.easing ?? "linear";
  }

  // helper to update a single keyframe property
  function updateProp(key: keyof KeyframeProperties, value: number | string) {
    if (!props.selectedLayerId || props.selectedKeyframeIndex === null) return;
    props.onUpdateKeyframe(props.selectedLayerId, props.selectedKeyframeIndex, { [key]: value });
  }

  // === keyframe selected view ===
  function renderKeyframeProperties() {
    const kfProps = selectedKeyframeProps();
    if (!kfProps) return null;

    return (
      <>
        <SectionLabel text="transform" />
        <DragInput
          label="x (px)"
          value={kfProps.x ?? 0}
          onChange={(v) => updateProp("x", v)}
          min={-500}
          max={500}
          step={1}
        />
        <DragInput
          label="y (px)"
          value={kfProps.y ?? 0}
          onChange={(v) => updateProp("y", v)}
          min={-500}
          max={500}
          step={1}
        />
        <DragInput
          label="scale"
          value={kfProps.scale ?? 1}
          onChange={(v) => updateProp("scale", v)}
          min={0}
          max={5}
          step={0.01}
        />
        <DragInput
          label="rotation (deg)"
          value={kfProps.rotation ?? 0}
          onChange={(v) => updateProp("rotation", v)}
          min={-3600}
          max={3600}
          step={1}
        />

        <SectionLabel text="appearance" />
        <DragInput
          label="opacity"
          value={kfProps.opacity ?? 1}
          onChange={(v) => updateProp("opacity", v)}
          min={0}
          max={1}
          step={0.01}
        />
        <DragInput
          label="blur (px)"
          value={kfProps.blur ?? 0}
          onChange={(v) => updateProp("blur", v)}
          min={0}
          max={50}
          step={0.5}
        />

        <SectionLabel text="glow" />
        <TextInput
          label="color"
          value={kfProps.glowColor ?? "#ff4f00"}
          onChange={(v) => updateProp("glowColor", v)}
        />
        <DragInput
          label="size (px)"
          value={kfProps.glowSize ?? 0}
          onChange={(v) => updateProp("glowSize", v)}
          min={0}
          max={100}
          step={1}
        />

        <SectionLabel text="easing" />
        <EasingEditor
          value={selectedKeyframeEasing()}
          onChange={(easing) => {
            if (!props.selectedLayerId || props.selectedKeyframeIndex === null) return;
            props.onUpdateKeyframeEasing(
              props.selectedLayerId,
              props.selectedKeyframeIndex,
              easing,
            );
          }}
        />
      </>
    );
  }

  // === layer selected view (no keyframe) ===
  function renderLayerProperties() {
    const layer = selectedLayer();
    if (!layer) return null;
    const element = layer.element;

    return (
      <>
        <SectionLabel text="element" />
        <Switch>
          <Match when={element.type === "shape"}>
            {(() => {
              const el = element as Extract<LayerElement, { type: "shape" }>;
              return (
                <>
                  <SelectInput
                    label="shape"
                    value={el.shape}
                    options={[...VALID_SHAPES]}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        shape: v as ShapeType,
                      });
                    }}
                  />
                  <TextInput
                    label="fill"
                    value={el.fill}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        fill: v,
                      });
                    }}
                  />
                  <TextInput
                    label="stroke"
                    value={el.stroke ?? ""}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        stroke: v || undefined,
                      });
                    }}
                  />
                  <DragInput
                    label="size"
                    value={el.size}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        size: v,
                      });
                    }}
                    min={4}
                    max={200}
                    step={1}
                  />
                </>
              );
            })()}
          </Match>

          <Match when={element.type === "path"}>
            {(() => {
              const el = element as Extract<LayerElement, { type: "path" }>;
              return (
                <>
                  <TextInput
                    label="stroke"
                    value={el.stroke}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        stroke: v,
                      });
                    }}
                  />
                  <DragInput
                    label="width"
                    value={el.strokeWidth}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        strokeWidth: v,
                      });
                    }}
                    min={0.5}
                    max={10}
                    step={0.5}
                  />
                </>
              );
            })()}
          </Match>

          <Match when={element.type === "text"}>
            {(() => {
              const el = element as Extract<LayerElement, { type: "text" }>;
              return (
                <>
                  <TextInput
                    label="content"
                    value={el.content}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        content: v,
                      });
                    }}
                  />
                  <TextInput
                    label="color"
                    value={el.color}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        color: v,
                      });
                    }}
                  />
                  <DragInput
                    label="size"
                    value={el.size}
                    onChange={(v) => {
                      props.onUpdateLayerElement(props.selectedLayerId!, {
                        ...el,
                        size: v,
                      });
                    }}
                    min={8}
                    max={72}
                    step={1}
                  />
                </>
              );
            })()}
          </Match>

          <Match when={element.type === "particle-preset"}>
            {(() => {
              const el = element as Extract<LayerElement, { type: "particle-preset" }>;
              return (
                <SelectInput
                  label="preset"
                  value={el.preset}
                  options={[...VALID_PARTICLE_PRESETS]}
                  onChange={(v) => {
                    props.onUpdateLayerElement(props.selectedLayerId!, {
                      type: "particle-preset",
                      preset: v as ParticlePresetName,
                    });
                  }}
                />
              );
            })()}
          </Match>

          <Match when={element.type === "avatar"}>
            <p class="text-[11px] text-white/40 font-[JetBrains_Mono] leading-relaxed">
              the avatar element inherits your profile avatar
            </p>
          </Match>
        </Switch>

        <SectionLabel text="timing" />
        <DragInput
          label="delay (ms)"
          value={layer.delay}
          onChange={(v) => {
            props.onUpdateLayerTiming(
              props.selectedLayerId!,
              v,
              layer.repeat,
              layer.easing,
            );
          }}
          min={0}
          max={5000}
          step={10}
        />
        <DragInput
          label="repeat"
          value={layer.repeat}
          onChange={(v) => {
            props.onUpdateLayerTiming(
              props.selectedLayerId!,
              layer.delay,
              Math.floor(v),
              layer.easing,
            );
          }}
          min={-1}
          max={10}
          step={1}
        />

        <SectionLabel text="global easing" />
        <EasingEditor
          value={layer.easing}
          onChange={(easing) => {
            props.onUpdateLayerTiming(
              props.selectedLayerId!,
              layer.delay,
              layer.repeat,
              easing,
            );
          }}
        />
      </>
    );
  }

  // === nothing selected view ===
  function renderEffectProperties() {
    return (
      <>
        <SectionLabel text="effect" />
        <TextInput
          label="name"
          value={props.effect.name}
          onChange={(v) => props.onUpdateEffect({ name: v })}
        />
        <SelectInput
          label="trigger"
          value={props.effect.trigger}
          options={["click", "hover", "entrance"]}
          onChange={(v) => props.onUpdateEffect({ trigger: v as ProfileEffect["trigger"] })}
        />
        <DragInput
          label="duration (ms)"
          value={props.effect.duration}
          onChange={(v) => props.onUpdateEffect({ duration: v })}
          min={100}
          max={5000}
          step={50}
        />
      </>
    );
  }

  const hasKeyframe = () =>
    props.selectedLayerId !== null && props.selectedKeyframeIndex !== null;
  const hasLayer = () =>
    props.selectedLayerId !== null && props.selectedKeyframeIndex === null;

  return (
    <div class="w-[240px] min-w-[240px] border-l border-white/10 overflow-y-auto flex flex-col gap-1 px-3 py-2">
      <Show when={hasKeyframe()}>
        {renderKeyframeProperties()}
      </Show>
      <Show when={hasLayer()}>
        {renderLayerProperties()}
      </Show>
      <Show when={!props.selectedLayerId}>
        {renderEffectProperties()}
      </Show>
    </div>
  );
};

export default EffectProperties;
