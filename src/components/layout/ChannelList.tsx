import type { Component } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import { Hash, Volume2, Plus, ChevronDown } from "lucide-solid";
import {
  channels,
  activeChannelId,
  setActiveChannel,
} from "../../stores/channels";
import { activeCommunity } from "../../stores/communities";
import { openModal } from "../../stores/ui";
import SidebarLayout from "../common/SidebarLayout";

const ChannelList: Component = () => {
  const [textCollapsed, setTextCollapsed] = createSignal(false);
  const [voiceCollapsed, setVoiceCollapsed] = createSignal(false);

  const textChannels = () => channels().filter((c) => c.kind === "Text");
  const voiceChannels = () => channels().filter((c) => c.kind === "Voice");
  const community = () => activeCommunity();

  const header = (
    <div class="h-15 border-b border-white/10 flex flex-col justify-end">
      <div class="h-12 flex items-center justify-between px-4">
        <Show
          when={community()}
          fallback={
            <span class="text-[16px] font-bold text-white/40">dusk</span>
          }
        >
          <span class="text-[16px] font-bold text-white truncate">
            {community()!.name}
          </span>
        </Show>
        <button
          type="button"
          class="text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
        >
          <ChevronDown size={20} />
        </button>
      </div>
    </div>
  );

  const body = (
    <div class="py-3">
      {/* text channels */}
      <Show when={textChannels().length > 0}>
        <button
          type="button"
          class="flex items-center gap-1 w-full px-2 py-1.5 text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 hover:text-white/80 transition-colors duration-200 cursor-pointer select-none"
          onClick={() => setTextCollapsed((v) => !v)}
        >
          <ChevronDown
            size={12}
            class="transition-transform duration-300"
            style={{
              transform: textCollapsed() ? "rotate(-90deg)" : "rotate(0deg)",
            }}
          />
          text channels
        </button>
        <Show when={!textCollapsed()}>
          <For each={textChannels()}>
            {(channel) => (
              <button
                type="button"
                class={`flex items-center gap-2 w-full h-10 px-2 text-[16px] transition-all duration-200 cursor-pointer group ${
                  activeChannelId() === channel.id
                    ? "bg-gray-800 text-white border-l-4 border-orange pl-1.5"
                    : "text-white/60 hover:bg-gray-800 hover:text-white"
                }`}
                onClick={() => setActiveChannel(channel.id)}
              >
                <Hash size={16} class="shrink-0 text-white/40" />
                <span class="truncate">{channel.name}</span>
              </button>
            )}
          </For>
        </Show>
      </Show>

      {/* voice channels */}
      <Show when={voiceChannels().length > 0}>
        <button
          type="button"
          class="flex items-center gap-1 w-full px-2 py-1.5 mt-2 text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 hover:text-white/80 transition-colors duration-200 cursor-pointer select-none"
          onClick={() => setVoiceCollapsed((v) => !v)}
        >
          <ChevronDown
            size={12}
            class="transition-transform duration-300"
            style={{
              transform: voiceCollapsed() ? "rotate(-90deg)" : "rotate(0deg)",
            }}
          />
          voice channels
        </button>
        <Show when={!voiceCollapsed()}>
          <For each={voiceChannels()}>
            {(channel) => (
              <button
                type="button"
                class={`flex items-center gap-2 w-full h-10 px-2 text-[16px] transition-all duration-200 cursor-pointer ${
                  activeChannelId() === channel.id
                    ? "bg-gray-800 text-white border-l-4 border-orange pl-1.5"
                    : "text-white/60 hover:bg-gray-800 hover:text-white"
                }`}
                onClick={() => setActiveChannel(channel.id)}
              >
                <Volume2 size={16} class="shrink-0 text-white/40" />
                <span class="truncate">{channel.name}</span>
              </button>
            )}
          </For>
        </Show>
      </Show>

      {/* add channel button */}
      <Show when={community()}>
        <button
          type="button"
          class="flex items-center gap-2 w-full h-8 px-2 mt-2 text-[13px] text-white/30 hover:text-white/60 transition-colors duration-200 cursor-pointer"
          onClick={() => openModal("create-channel")}
        >
          <Plus size={14} />
          <span>add channel</span>
        </button>
      </Show>
    </div>
  );

  return (
    <SidebarLayout
      header={header}
      showFooter
      showFooterSettings
      onFooterSettingsClick={() => openModal("settings")}
    >
      {body}
    </SidebarLayout>
  );
};

export default ChannelList;
