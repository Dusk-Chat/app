// left panel of the keyframe editor showing available elements to add as layers

import type { Component } from "solid-js";
import { createSignal, For, Show } from "solid-js";
import { ChevronRight } from "lucide-solid";
import type { LayerElement, ShapeType, ParticlePresetName } from "../../lib/effects";
import { VALID_SHAPES, VALID_PARTICLE_PRESETS } from "../../lib/effects";
import ShapeRenderer from "../../lib/effects-shapes";

interface ElementLibraryProps {
  onAddLayer: (element: LayerElement) => void;
}

// path presets with their display names and svg data
const PATH_PRESETS: { name: string; d: string }[] = [
  { name: "wavy", d: "M0,50 C20,30 30,70 50,50 C70,30 80,70 100,50" },
  { name: "zigzag", d: "M0,75 L20,25 L40,75 L60,25 L80,75 L100,25" },
  { name: "arc", d: "M10,80 Q50,0 90,80" },
  { name: "spiral", d: "M50,50 C50,30 70,30 70,50 C70,70 30,70 30,50 C30,20 80,20 80,50" },
  { name: "orbit", d: "M50,10 A40,40 0 1,1 50,90 A40,40 0 1,1 50,10" },
];

// collapsible section with chevron toggle
const Section: Component<{
  title: string;
  children: any;
  defaultOpen?: boolean;
}> = (props) => {
  const [open, setOpen] = createSignal(props.defaultOpen ?? true);

  return (
    <div class="flex flex-col">
      <button
        class="flex items-center gap-1.5 py-1.5 px-1 w-full text-left hover:bg-white/5 transition-colors"
        onClick={() => setOpen(!open())}
      >
        <ChevronRight
          size={12}
          class="text-white/40 transition-transform duration-150"
          style={{ transform: open() ? "rotate(90deg)" : "rotate(0deg)" }}
        />
        <span class="text-[11px] font-[JetBrains_Mono] uppercase text-white/40 tracking-wider">
          {props.title}
        </span>
      </button>
      <Show when={open()}>
        <div class="px-1 pb-2">{props.children}</div>
      </Show>
    </div>
  );
};

const ElementLibrary: Component<ElementLibraryProps> = (props) => {
  function addShape(shape: ShapeType) {
    props.onAddLayer({ type: "shape", shape, fill: "#ff4f00", size: 40 });
  }

  function addPath(d: string) {
    props.onAddLayer({ type: "path", d, stroke: "#ff4f00", strokeWidth: 2 });
  }

  function addText() {
    props.onAddLayer({ type: "text", content: "text", font: "sans", color: "#ffffff", size: 24 });
  }

  function addParticle(preset: ParticlePresetName) {
    props.onAddLayer({ type: "particle-preset", preset });
  }

  return (
    <div class="w-[200px] min-w-[200px] border-r border-white/10 overflow-y-auto flex flex-col gap-1 py-2">
      {/* shapes */}
      <Section title="shapes">
        <div class="grid grid-cols-3 gap-1">
          <For each={VALID_SHAPES}>
            {(shape) => (
              <button
                class="flex flex-col items-center gap-1 w-12 h-14 justify-center hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                onClick={() => addShape(shape)}
                title={shape}
              >
                <ShapeRenderer shape={shape} size={24} fill="#ff4f00" />
                <span class="text-[10px] font-[JetBrains_Mono] text-white/40 leading-none">
                  {shape}
                </span>
              </button>
            )}
          </For>
        </div>
      </Section>

      {/* paths */}
      <Section title="paths">
        <div class="flex flex-col gap-1">
          <For each={PATH_PRESETS}>
            {(preset) => (
              <button
                class="flex flex-col items-center gap-1 py-1.5 px-2 hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                onClick={() => addPath(preset.d)}
                title={preset.name}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 100 100"
                  width={48}
                  height={32}
                  class="overflow-visible"
                >
                  <path
                    d={preset.d}
                    fill="none"
                    stroke="#ff4f00"
                    stroke-width="3"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
                <span class="text-[10px] font-[JetBrains_Mono] text-white/40 leading-none">
                  {preset.name}
                </span>
              </button>
            )}
          </For>
        </div>
      </Section>

      {/* text */}
      <Section title="text">
        <button
          class="w-full py-2 px-3 text-[11px] font-[JetBrains_Mono] uppercase text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 transition-colors tracking-wider"
          onClick={addText}
        >
          add text
        </button>
      </Section>

      {/* particles */}
      <Section title="particles">
        <div class="grid grid-cols-2 gap-1">
          <For each={VALID_PARTICLE_PRESETS}>
            {(preset) => (
              <button
                class="flex items-center justify-center h-10 px-2 hover:bg-white/5 border border-transparent hover:border-white/10 transition-colors"
                onClick={() => addParticle(preset)}
                title={preset}
              >
                <span class="text-[10px] font-[JetBrains_Mono] text-white/40">
                  {preset}
                </span>
              </button>
            )}
          </For>
        </div>
      </Section>
    </div>
  );
};

export default ElementLibrary;
