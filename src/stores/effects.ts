// app/src/stores/effects.ts

import { createSignal } from "solid-js";
import type {
  ProfileEffect,
  AnimationLayer,
  EffectKeyframe,
} from "../lib/effects";
import { validateEffect } from "../lib/effects";

const EFFECTS_KEY = "dusk_profile_effects";

// === user's own effects ===

export interface UserEffects {
  click?: ProfileEffect;
  hover?: ProfileEffect;
  entrance?: ProfileEffect;
}

function loadUserEffects(): UserEffects {
  try {
    const stored = localStorage.getItem(EFFECTS_KEY);
    if (!stored) return {};
    const parsed = JSON.parse(stored);
    const result: UserEffects = {};
    if (parsed.click) result.click = validateEffect(parsed.click) ?? undefined;
    if (parsed.hover) result.hover = validateEffect(parsed.hover) ?? undefined;
    if (parsed.entrance)
      result.entrance = validateEffect(parsed.entrance) ?? undefined;
    return result;
  } catch {
    return {};
  }
}

const [userEffects, setUserEffects] =
  createSignal<UserEffects>(loadUserEffects());

function persistEffects() {
  localStorage.setItem(EFFECTS_KEY, JSON.stringify(userEffects()));
}

export function setUserEffect(effect: ProfileEffect) {
  setUserEffects(() => ({ [effect.trigger]: effect }));
  persistEffects();
}

export function removeUserEffect(trigger: ProfileEffect["trigger"]) {
  setUserEffects((prev) => {
    const next = { ...prev };
    delete next[trigger];
    return next;
  });
  persistEffects();
}

export function getUserEffect(
  trigger: ProfileEffect["trigger"],
): ProfileEffect | undefined {
  return userEffects()[trigger];
}

// === peer effects cache ===

const [peerEffects, setPeerEffects] = createSignal<Map<string, UserEffects>>(
  new Map(),
);

export function cachePeerEffects(peerId: string, effects: UserEffects) {
  setPeerEffects((prev) => {
    const next = new Map(prev);
    next.set(peerId, effects);
    return next;
  });
}

export function getPeerEffects(peerId: string): UserEffects | undefined {
  return peerEffects().get(peerId);
}

export function clearPeerEffects(peerId: string) {
  setPeerEffects((prev) => {
    const next = new Map(prev);
    next.delete(peerId);
    return next;
  });
}

// === editor state ===

interface EditorState {
  isOpen: boolean;
  effect: ProfileEffect | null;
  selectedLayerId: string | null;
  selectedKeyframeIndex: number | null;
  playheadPosition: number; // 0-1
  isPlaying: boolean;
  undoStack: ProfileEffect[];
  redoStack: ProfileEffect[];
}

const [editorState, setEditorState] = createSignal<EditorState>({
  isOpen: false,
  effect: null,
  selectedLayerId: null,
  selectedKeyframeIndex: null,
  playheadPosition: 0,
  isPlaying: false,
  undoStack: [],
  redoStack: [],
});

export function openEditor(effect: ProfileEffect) {
  setEditorState({
    isOpen: true,
    effect: JSON.parse(JSON.stringify(effect)),
    selectedLayerId: null,
    selectedKeyframeIndex: null,
    playheadPosition: 0,
    isPlaying: false,
    undoStack: [],
    redoStack: [],
  });
}

export function closeEditor() {
  setEditorState((prev) => ({ ...prev, isOpen: false, effect: null }));
}

// push current state to undo stack before making changes
function pushUndo() {
  setEditorState((prev) => {
    if (!prev.effect) return prev;
    return {
      ...prev,
      undoStack: [
        ...prev.undoStack.slice(-49),
        JSON.parse(JSON.stringify(prev.effect)),
      ],
      redoStack: [],
    };
  });
}

export function undo() {
  setEditorState((prev) => {
    if (prev.undoStack.length === 0 || !prev.effect) return prev;
    const undoStack = [...prev.undoStack];
    const restored = undoStack.pop()!;
    return {
      ...prev,
      undoStack,
      redoStack: [...prev.redoStack, JSON.parse(JSON.stringify(prev.effect))],
      effect: restored,
    };
  });
}

export function redo() {
  setEditorState((prev) => {
    if (prev.redoStack.length === 0 || !prev.effect) return prev;
    const redoStack = [...prev.redoStack];
    const restored = redoStack.pop()!;
    return {
      ...prev,
      redoStack,
      undoStack: [...prev.undoStack, JSON.parse(JSON.stringify(prev.effect))],
      effect: restored,
    };
  });
}

export function updateEditorEffect(
  updater: (effect: ProfileEffect) => ProfileEffect,
) {
  pushUndo();
  setEditorState((prev) => {
    if (!prev.effect) return prev;
    return { ...prev, effect: updater(prev.effect) };
  });
}

export function setSelectedLayer(layerId: string | null) {
  setEditorState((prev) => ({
    ...prev,
    selectedLayerId: layerId,
    selectedKeyframeIndex: null,
  }));
}

export function setSelectedKeyframe(index: number | null) {
  setEditorState((prev) => ({ ...prev, selectedKeyframeIndex: index }));
}

export function setPlayheadPosition(position: number) {
  setEditorState((prev) => ({ ...prev, playheadPosition: position }));
}

export function setIsPlaying(playing: boolean) {
  setEditorState((prev) => ({ ...prev, isPlaying: playing }));
}

export function addLayerToEffect(layer: AnimationLayer) {
  updateEditorEffect((effect) => ({
    ...effect,
    layers: [...effect.layers, layer],
  }));
  setSelectedLayer(layer.id);
}

export function removeLayerFromEffect(layerId: string) {
  updateEditorEffect((effect) => ({
    ...effect,
    layers: effect.layers.filter((l) => l.id !== layerId),
  }));
  setEditorState((prev) => ({
    ...prev,
    selectedLayerId:
      prev.selectedLayerId === layerId ? null : prev.selectedLayerId,
  }));
}

export function updateLayer(
  layerId: string,
  updater: (layer: AnimationLayer) => AnimationLayer,
) {
  updateEditorEffect((effect) => ({
    ...effect,
    layers: effect.layers.map((l) => (l.id === layerId ? updater(l) : l)),
  }));
}

export function reorderLayers(fromIndex: number, toIndex: number) {
  updateEditorEffect((effect) => {
    const layers = [...effect.layers];
    const [moved] = layers.splice(fromIndex, 1);
    layers.splice(toIndex, 0, moved);
    return { ...effect, layers };
  });
}

export function addKeyframeToLayer(layerId: string, keyframe: EffectKeyframe) {
  updateLayer(layerId, (layer) => ({
    ...layer,
    keyframes: [...layer.keyframes, keyframe].sort(
      (a, b) => a.offset - b.offset,
    ),
  }));
}

export function updateKeyframe(
  layerId: string,
  keyframeIndex: number,
  updater: (kf: EffectKeyframe) => EffectKeyframe,
) {
  updateLayer(layerId, (layer) => ({
    ...layer,
    keyframes: layer.keyframes.map((kf, i) =>
      i === keyframeIndex ? updater(kf) : kf,
    ),
  }));
}

export function removeKeyframe(layerId: string, keyframeIndex: number) {
  updateLayer(layerId, (layer) => ({
    ...layer,
    keyframes: layer.keyframes.filter((_, i) => i !== keyframeIndex),
  }));
}

export { userEffects, editorState };
