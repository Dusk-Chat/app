import { createSignal } from "solid-js";
import type { ChannelMeta, CategoryMeta } from "../lib/types";
import { reorderChannels as reorderChannelsCall } from "../lib/tauri";
import { activeCommunityId } from "./communities";

const [channels, setChannels] = createSignal<ChannelMeta[]>([]);
const [categories, setCategories] = createSignal<CategoryMeta[]>([]);
const [activeChannelId, setActiveChannelId] = createSignal<string | null>(null);

export function setActiveChannel(id: string | null) {
  setActiveChannelId(id);
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

export { channels, categories, activeChannelId, setChannels, setCategories };
