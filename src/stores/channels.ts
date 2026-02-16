import { createSignal } from "solid-js";
import type { ChannelMeta, CategoryMeta } from "../lib/types";
import { reorderChannels as reorderChannelsCall } from "../lib/tauri";
import { activeCommunityId } from "./communities";

const [channels, setChannels] = createSignal<ChannelMeta[]>([]);
const [categories, setCategories] = createSignal<CategoryMeta[]>([]);
const [activeChannelId, setActiveChannelId] = createSignal<string | null>(null);

// persists the last viewed channel per community across restarts
const LAST_CHANNEL_KEY = "dusk-last-channels";

function loadLastChannels(): Map<string, string> {
  try {
    const stored = localStorage.getItem(LAST_CHANNEL_KEY);
    if (stored) return new Map(Object.entries(JSON.parse(stored)));
  } catch {}
  return new Map();
}

function saveLastChannels(map: Map<string, string>) {
  localStorage.setItem(
    LAST_CHANNEL_KEY,
    JSON.stringify(Object.fromEntries(map)),
  );
}

const lastChannelByCommunity = loadLastChannels();

export function setActiveChannel(id: string | null) {
  setActiveChannelId(id);

  // remember which channel was last viewed in this community
  const communityId = activeCommunityId();
  if (communityId && id) {
    lastChannelByCommunity.set(communityId, id);
    saveLastChannels(lastChannelByCommunity);
  }
}

export function getLastChannel(communityId: string): string | null {
  return lastChannelByCommunity.get(communityId) ?? null;
}

export function activeChannel(): ChannelMeta | undefined {
  return channels().find((c) => c.id === activeChannelId());
}

export function addCategory(category: CategoryMeta) {
  setCategories((prev) => [...prev, category]);
}

export async function reorderChannels(channelIds: string[]): Promise<void> {
  const communityId = activeCommunityId();
  if (!communityId) return;

  try {
    const updated = await reorderChannelsCall(communityId, channelIds);
    setChannels(updated);
  } catch (error) {
    console.error("failed to reorder channels:", error);
  }
}

export function removeChannel(channelId: string) {
  setChannels((prev) => prev.filter((c) => c.id !== channelId));
  // switch to the first remaining channel if the deleted one was active
  if (activeChannelId() === channelId) {
    const remaining = channels();
    setActiveChannelId(remaining.length > 0 ? remaining[0].id : null);
  }
}

export function removeCategory(categoryId: string) {
  setCategories((prev) => prev.filter((c) => c.id !== categoryId));
  // ungroup any channels that were in this category
  setChannels((prev) =>
    prev.map((c) =>
      c.category_id === categoryId ? { ...c, category_id: null } : c,
    ),
  );
}

export function updateChannelMeta(
  channelId: string,
  updates: Partial<ChannelMeta>,
) {
  setChannels((prev) =>
    prev.map((c) => (c.id === channelId ? { ...c, ...updates } : c)),
  );
}

export { channels, categories, activeChannelId, setChannels, setCategories };
