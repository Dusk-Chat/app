import { createSignal } from "solid-js";
import type { ChannelMeta } from "../lib/types";

const [channels, setChannels] = createSignal<ChannelMeta[]>([]);
const [activeChannelId, setActiveChannelId] = createSignal<string | null>(null);

export function setActiveChannel(id: string | null) {
  setActiveChannelId(id);
}

export function activeChannel(): ChannelMeta | undefined {
  return channels().find((c) => c.id === activeChannelId());
}

export { channels, activeChannelId, setChannels };
