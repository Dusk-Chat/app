// main editor view composing the preset browser and four-panel keyframe editor

import type { Component } from "solid-js";
import { createSignal, createEffect, onCleanup, Show, For } from "solid-js";
import { Play, Pause, RotateCcw, Plus, Sparkles, Check } from "lucide-solid";
import type { ProfileEffect } from "../../lib/effects";
import { cloneEffect, createEmptyEffect } from "../../lib/effects";
import { ALL_PRESETS, PRESET_CATEGORIES } from "../../lib/effects-presets";
import {
  editorState,
  openEditor,
  closeEditor,
  updateEditorEffect,
  setSelectedLayer,
  setSelectedKeyframe,
  setPlayheadPosition,
  setIsPlaying,
  addLayerToEffect,
  removeLayerFromEffect,
  updateLayer,
  reorderLayers,
  addKeyframeToLayer,
  updateKeyframe,
  removeKeyframe,
  undo,
  redo,
  setUserEffect,
  userEffects,
} from "../../stores/effects";
import { identity } from "../../stores/identity";
import ElementLibrary from "./ElementLibrary";
import EffectTimeline from "./EffectTimeline";
import EffectCanvas from "./EffectCanvas";
import EffectProperties from "./EffectProperties";
import ProfileEffectRenderer from "../common/ProfileEffectRenderer";
import Avatar from "../common/Avatar";
import type {
  LayerElement,
  EasingCurve,
  KeyframeProperties,
} from "../../lib/effects";
import { createLayer } from "../../lib/effects";

// category filter tabs including "all"
const CATEGORY_TABS = [
  { id: "all", name: "All" },
  ...PRESET_CATEGORIES.map((c) => ({ id: c.id, name: c.name })),
];

// --- preset browser ---

interface PresetCardProps {
  preset: ProfileEffect;
  isActive: boolean;
  onUse: (preset: ProfileEffect) => void;
  onCustomize: (preset: ProfileEffect) => void;
}

const PresetCard: Component<PresetCardProps> = (props) => {
  const [hovered, setHovered] = createSignal(false);
  const [showActions, setShowActions] = createSignal(false);

  return (
    <div
      class="group relative border bg-white/[0.02] hover:bg-white/[0.05] transition-colors cursor-pointer"
      classList={{
        "border-[#ff4f00]": props.isActive,
        "border-white/10": !props.isActive,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setShowActions(false);
      }}
      onClick={() => setShowActions((prev) => !prev)}
    >
      <div class="flex flex-col items-center gap-2 p-3">
        {/* animated preview on hover */}
        <div class="w-16 h-16 flex items-center justify-center relative">
          <ProfileEffectRenderer
            effect={props.preset}
            trigger={props.preset.trigger}
            size={64}
            playing={hovered()}
          >
            <Avatar name={props.preset.name} size="lg" />
          </ProfileEffectRenderer>

          {/* active checkmark indicator */}
          <Show when={props.isActive && !showActions() && !hovered()}>
            <div class="absolute inset-0 bg-black/60 rounded-full flex items-center justify-center backdrop-blur-[1px]">
              <div class="bg-[#ff4f00] text-black w-6 h-6 rounded-full flex items-center justify-center shadow-lg">
                <Check size={14} stroke-width={3} />
              </div>
            </div>
          </Show>
        </div>
        <span class="text-xs text-white/60 text-center truncate w-full">
          {props.preset.name}
        </span>
      </div>

      {/* action buttons shown on click */}
      <Show when={showActions()}>
        <div class="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2 z-10">
          <button
            class="px-4 py-1.5 text-xs bg-[#ff4f00] text-black font-medium hover:bg-[#ff6a00] transition-colors w-[80%]"
            onClick={(e) => {
              e.stopPropagation();
              props.onUse(props.preset);
              setShowActions(false);
            }}
          >
            use
          </button>
          <button
            class="px-4 py-1.5 text-xs border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors w-[80%]"
            onClick={(e) => {
              e.stopPropagation();
              props.onCustomize(props.preset);
              setShowActions(false);
            }}
          >
            customize
          </button>
        </div>
      </Show>
    </div>
  );
};

// --- keyframe editor top bar ---

interface EditorTopBarProps {
  effect: ProfileEffect;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onSave: () => void;
  onDiscard: () => void;
  onUpdateName: (name: string) => void;
  onUpdateTrigger: (trigger: ProfileEffect["trigger"]) => void;
  onUpdateDuration: (duration: number) => void;
}

const EditorTopBar: Component<EditorTopBarProps> = (props) => {
  return (
    <div class="flex items-center gap-3 px-3 py-2 border-b border-white/10 bg-black flex-shrink-0">
      {/* effect name */}
      <input
        type="text"
        class="bg-transparent border-b border-white/20 focus:border-[#ff4f00] text-sm text-white outline-none px-1 py-0.5 w-[160px]"
        value={props.effect.name}
        onInput={(e) => props.onUpdateName(e.currentTarget.value)}
      />

      {/* trigger */}
      <select
        class="bg-black border border-white/20 text-xs text-white/70 px-2 py-1 outline-none cursor-pointer"
        value={props.effect.trigger}
        onChange={(e) =>
          props.onUpdateTrigger(
            e.currentTarget.value as ProfileEffect["trigger"],
          )
        }
      >
        <option value="click">click</option>
        <option value="hover">hover</option>
        <option value="entrance">entrance</option>
      </select>

      {/* duration slider */}
      <div class="flex items-center gap-2">
        <input
          type="range"
          min="100"
          max="5000"
          step="50"
          class="w-[100px] accent-[#ff4f00]"
          value={props.effect.duration}
          onInput={(e) =>
            props.onUpdateDuration(parseInt(e.currentTarget.value))
          }
        />
        <span class="text-[11px] text-white/40 font-[JetBrains_Mono] w-[48px] text-right">
          {props.effect.duration}ms
        </span>
      </div>

      {/* transport controls */}
      <div class="flex items-center gap-1 ml-auto">
        <button
          class="p-1.5 text-white/50 hover:text-white transition-colors"
          onClick={props.onTogglePlay}
          title={props.isPlaying ? "pause" : "play"}
        >
          <Show when={props.isPlaying} fallback={<Play size={14} />}>
            <Pause size={14} />
          </Show>
        </button>
        <button
          class="p-1.5 text-white/50 hover:text-white transition-colors"
          onClick={props.onReset}
          title="reset playhead"
        >
          <RotateCcw size={14} />
        </button>
      </div>

      {/* save / discard */}
      <div class="flex items-center gap-2 ml-2">
        <button
          class="px-3 py-1 text-xs bg-[#ff4f00] text-black font-medium hover:bg-[#ff6a00] transition-colors"
          onClick={props.onSave}
        >
          save
        </button>
        <button
          class="px-3 py-1 text-xs border border-white/20 text-white/50 hover:text-white hover:border-white/40 transition-colors"
          onClick={props.onDiscard}
        >
          discard
        </button>
      </div>
    </div>
  );
};

// --- main editor component ---

const ProfileEffectsEditor: Component = () => {
  const [activeCategory, setActiveCategory] = createSignal("all");
  const [toastMessage, setToastMessage] = createSignal<string | null>(null);

  function showToast(msg: string) {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((current) => (current === msg ? null : current));
    }, 3000);
  }

  // filtered presets based on active category tab
  const filteredPresets = () => {
    const cat = activeCategory();
    if (cat === "all") return ALL_PRESETS;
    const found = PRESET_CATEGORIES.find((c) => c.id === cat);
    return found ? found.presets : [];
  };

  // playback loop via requestAnimationFrame
  let rafId: number | undefined;

  createEffect(() => {
    const state = editorState();

    if (state.isPlaying && state.effect) {
      const duration = state.effect.duration;
      let startTime: number | null = null;
      // resume from current position so play doesnt always restart at 0
      const startPosition = state.playheadPosition;

      function tick(timestamp: number) {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime;
        const progress = startPosition + elapsed / duration;

        if (progress >= 1) {
          setPlayheadPosition(1);
          setIsPlaying(false);
          return;
        }

        setPlayheadPosition(progress);
        rafId = requestAnimationFrame(tick);
      }

      rafId = requestAnimationFrame(tick);
    } else {
      if (rafId !== undefined) {
        cancelAnimationFrame(rafId);
        rafId = undefined;
      }
    }
  });

  onCleanup(() => {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId);
    }
  });

  // keyboard shortcuts
  function handleKeyDown(e: KeyboardEvent) {
    const state = editorState();
    if (!state.isOpen) return;

    // dont capture when user is typing in an input
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
      // only let space through for play/pause if not in a text input
      if (e.key !== " ") return;
    }

    if (e.key === " ") {
      e.preventDefault();
      togglePlay();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
      e.preventDefault();
      redo();
    } else if (e.key === "z" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      undo();
    } else if (e.key === "Delete" || e.key === "Backspace") {
      // delete selected keyframe or layer
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (state.selectedLayerId && state.selectedKeyframeIndex !== null) {
        removeKeyframe(state.selectedLayerId, state.selectedKeyframeIndex);
        setSelectedKeyframe(null);
      } else if (state.selectedLayerId) {
        removeLayerFromEffect(state.selectedLayerId);
      }
    }
  }

  // attach keyboard listener when editor is open
  createEffect(() => {
    if (editorState().isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    } else {
      document.removeEventListener("keydown", handleKeyDown);
    }
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeyDown);
  });

  // --- actions ---

  function handleUsePreset(preset: ProfileEffect) {
    setUserEffect(preset);
    showToast(`Applied ${preset.name} effect`);
  }

  function handleCustomizePreset(preset: ProfileEffect) {
    openEditor(cloneEffect(preset));
  }

  function handleCreateCustom() {
    openEditor(createEmptyEffect(identity()?.peer_id ?? "local"));
  }

  function togglePlay() {
    const state = editorState();
    if (state.isPlaying) {
      setIsPlaying(false);
    } else {
      // if at end, reset before playing
      if (state.playheadPosition >= 1) {
        setPlayheadPosition(0);
      }
      setIsPlaying(true);
    }
  }

  function handleReset() {
    setIsPlaying(false);
    setPlayheadPosition(0);
  }

  function handleSave() {
    const state = editorState();
    if (state.effect) {
      setUserEffect(state.effect);
      showToast(`Saved ${state.effect.name} effect`);
    }
    closeEditor();
  }

  function handleDiscard() {
    closeEditor();
  }

  // editor effect update helpers
  function handleUpdateName(name: string) {
    updateEditorEffect((effect) => ({ ...effect, name }));
  }

  function handleUpdateTrigger(trigger: ProfileEffect["trigger"]) {
    updateEditorEffect((effect) => ({ ...effect, trigger }));
  }

  function handleUpdateDuration(duration: number) {
    updateEditorEffect((effect) => ({ ...effect, duration }));
  }

  // canvas interaction handlers
  function handleUpdateLayerPosition(layerId: string, x: number, y: number) {
    const state = editorState();
    if (!state.effect) return;
    const layer = state.effect.layers.find((l) => l.id === layerId);
    if (!layer) return;

    // find the nearest keyframe to the current playhead and update its position
    const nearestIndex = findNearestKeyframeIndex(
      layer.keyframes.map((k) => k.offset),
      state.playheadPosition,
    );
    if (nearestIndex >= 0) {
      updateKeyframe(layerId, nearestIndex, (kf) => ({
        ...kf,
        properties: { ...kf.properties, x, y },
      }));
    }
  }

  function handleUpdateLayerScale(layerId: string, scale: number) {
    const state = editorState();
    if (!state.effect) return;
    const layer = state.effect.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const nearestIndex = findNearestKeyframeIndex(
      layer.keyframes.map((k) => k.offset),
      state.playheadPosition,
    );
    if (nearestIndex >= 0) {
      updateKeyframe(layerId, nearestIndex, (kf) => ({
        ...kf,
        properties: { ...kf.properties, scale },
      }));
    }
  }

  function handleUpdateLayerRotation(layerId: string, rotation: number) {
    const state = editorState();
    if (!state.effect) return;
    const layer = state.effect.layers.find((l) => l.id === layerId);
    if (!layer) return;

    const nearestIndex = findNearestKeyframeIndex(
      layer.keyframes.map((k) => k.offset),
      state.playheadPosition,
    );
    if (nearestIndex >= 0) {
      updateKeyframe(layerId, nearestIndex, (kf) => ({
        ...kf,
        properties: { ...kf.properties, rotation },
      }));
    }
  }

  // properties panel handlers
  function handleUpdateKeyframeProps(
    layerId: string,
    index: number,
    props: Partial<KeyframeProperties>,
  ) {
    updateKeyframe(layerId, index, (kf) => ({
      ...kf,
      properties: { ...kf.properties, ...props },
    }));
  }

  function handleUpdateKeyframeEasing(
    layerId: string,
    index: number,
    easing: EasingCurve,
  ) {
    updateKeyframe(layerId, index, (kf) => ({
      ...kf,
      easing,
    }));
  }

  function handleUpdateLayerElement(layerId: string, element: LayerElement) {
    updateLayer(layerId, (layer) => ({
      ...layer,
      element,
    }));
  }

  function handleUpdateLayerTiming(
    layerId: string,
    delay: number,
    repeat: number,
    easing: EasingCurve,
  ) {
    updateLayer(layerId, (layer) => ({
      ...layer,
      delay,
      repeat,
      easing,
    }));
  }

  function handleUpdateEffect(
    updates: Partial<Pick<ProfileEffect, "name" | "trigger" | "duration">>,
  ) {
    updateEditorEffect((effect) => ({ ...effect, ...updates }));
  }

  // timeline handlers
  function handleTimelineSelectKeyframe(layerId: string, index: number | null) {
    setSelectedLayer(layerId);
    setSelectedKeyframe(index);
  }

  function handleTimelineMoveKeyframe(
    layerId: string,
    index: number,
    newOffset: number,
  ) {
    updateKeyframe(layerId, index, (kf) => ({
      ...kf,
      offset: newOffset,
    }));
  }

  function handleTimelineAddKeyframe(layerId: string, offset: number) {
    addKeyframeToLayer(layerId, {
      offset,
      properties: { opacity: 1, scale: 1 },
    });
  }

  function handleTimelineDeleteKeyframe(layerId: string, index: number) {
    removeKeyframe(layerId, index);
  }

  function handleTimelinePlayheadChange(position: number) {
    setIsPlaying(false);
    setPlayheadPosition(position);
  }

  function handleAddElement(element: LayerElement) {
    addLayerToEffect(createLayer(element));
  }

  return (
    <div class="flex flex-col h-full relative">
      {/* toast notification */}
      <Show when={toastMessage()}>
        {(msg) => (
          <div class="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#ff4f00] text-black px-4 py-2 rounded-full shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <Check size={16} stroke-width={3} />
            <span class="text-sm font-medium whitespace-nowrap">{msg()}</span>
          </div>
        )}
      </Show>

      <Show
        when={editorState().isOpen && editorState().effect}
        fallback={
          // preset browser mode
          <div class="flex flex-col h-full overflow-hidden min-w-0">
            {/* header with category tabs and create button */}
            <div class="flex items-start justify-between gap-4 px-6 py-4 border-b border-white/10 flex-shrink-0 min-w-0">
              <div class="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
                <For each={CATEGORY_TABS}>
                  {(tab) => (
                    <button
                      class="px-3 py-1 text-xs whitespace-nowrap transition-colors"
                      classList={{
                        "bg-[#ff4f00] text-black": activeCategory() === tab.id,
                        "text-white/50 hover:text-white":
                          activeCategory() !== tab.id,
                      }}
                      onClick={() => setActiveCategory(tab.id)}
                    >
                      {tab.name}
                    </button>
                  )}
                </For>
              </div>
              <button
                class="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-white/20 text-white/70 hover:text-white hover:border-white/40 transition-colors flex-shrink-0"
                onClick={handleCreateCustom}
              >
                <Plus size={12} />
                create custom
              </button>
            </div>

            {/* preset grid */}
            <div class="flex-1 overflow-y-auto p-6 min-w-0">
              <Show
                when={filteredPresets().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center h-full gap-3 text-white/30">
                    <Sparkles size={32} />
                    <p class="text-sm">no presets in this category</p>
                  </div>
                }
              >
                <div class="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-4">
                  <For each={filteredPresets()}>
                    {(preset) => (
                      <PresetCard
                        preset={preset}
                        isActive={
                          userEffects()[preset.trigger]?.id === preset.id
                        }
                        onUse={handleUsePreset}
                        onCustomize={handleCustomizePreset}
                      />
                    )}
                  </For>
                </div>
              </Show>
            </div>
          </div>
        }
      >
        {/* keyframe editor mode */}
        {(effect) => (
          <div class="flex flex-col h-full overflow-hidden">
            <EditorTopBar
              effect={effect()}
              isPlaying={editorState().isPlaying}
              onTogglePlay={togglePlay}
              onReset={handleReset}
              onSave={handleSave}
              onDiscard={handleDiscard}
              onUpdateName={handleUpdateName}
              onUpdateTrigger={handleUpdateTrigger}
              onUpdateDuration={handleUpdateDuration}
            />

            {/* three-column middle section */}
            <div class="flex flex-1 min-h-0 overflow-hidden">
              {/* element library */}
              <div class="w-[200px] min-w-[200px] border-r border-white/10 overflow-y-auto">
                <ElementLibrary onAddLayer={handleAddElement} />
              </div>

              {/* canvas preview */}
              <div class="flex-1 min-w-0">
                <EffectCanvas
                  effect={effect()}
                  selectedLayerId={editorState().selectedLayerId}
                  playheadPosition={editorState().playheadPosition}
                  isPlaying={editorState().isPlaying}
                  avatarName={identity()?.display_name ?? "user"}
                  onSelectLayer={setSelectedLayer}
                  onUpdateLayerPosition={handleUpdateLayerPosition}
                  onUpdateLayerScale={handleUpdateLayerScale}
                  onUpdateLayerRotation={handleUpdateLayerRotation}
                />
              </div>

              {/* properties inspector */}
              <EffectProperties
                effect={effect()}
                selectedLayerId={editorState().selectedLayerId}
                selectedKeyframeIndex={editorState().selectedKeyframeIndex}
                onUpdateKeyframe={handleUpdateKeyframeProps}
                onUpdateKeyframeEasing={handleUpdateKeyframeEasing}
                onUpdateLayerElement={handleUpdateLayerElement}
                onUpdateLayerTiming={handleUpdateLayerTiming}
                onUpdateEffect={handleUpdateEffect}
              />
            </div>

            {/* timeline */}
            <EffectTimeline
              effect={effect()}
              selectedLayerId={editorState().selectedLayerId}
              selectedKeyframeIndex={editorState().selectedKeyframeIndex}
              playheadPosition={editorState().playheadPosition}
              onSelectLayer={setSelectedLayer}
              onSelectKeyframe={handleTimelineSelectKeyframe}
              onMoveKeyframe={handleTimelineMoveKeyframe}
              onAddKeyframe={handleTimelineAddKeyframe}
              onDeleteKeyframe={handleTimelineDeleteKeyframe}
              onPlayheadChange={handleTimelinePlayheadChange}
              onReorderLayers={reorderLayers}
              onDeleteLayer={removeLayerFromEffect}
            />
          </div>
        )}
      </Show>
    </div>
  );
};

// find the keyframe index with offset closest to the given position
function findNearestKeyframeIndex(offsets: number[], position: number): number {
  if (offsets.length === 0) return -1;
  let nearest = 0;
  let minDist = Math.abs(offsets[0] - position);
  for (let i = 1; i < offsets.length; i++) {
    const dist = Math.abs(offsets[i] - position);
    if (dist < minDist) {
      minDist = dist;
      nearest = i;
    }
  }
  return nearest;
}

export default ProfileEffectsEditor;
