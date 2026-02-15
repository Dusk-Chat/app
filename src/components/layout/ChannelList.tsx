import type { Component } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  SortableProvider,
  createSortable,
  closestCenter,
} from "@thisbeyond/solid-dnd";
import {
  Hash,
  Volume2,
  Plus,
  ChevronDown,
  FolderPlus,
  Mic,
  MicOff,
  Headphones,
  HeadphoneOff,
  PhoneOff,
} from "lucide-solid";
import {
  channels,
  categories,
  activeChannelId,
  setActiveChannel,
  setChannels,
  reorderChannels,
} from "../../stores/channels";
import { activeCommunity } from "../../stores/communities";
import { openModal } from "../../stores/ui";
import {
  voiceChannelId,
  voiceParticipants,
  isInVoice,
  joinVoice,
  leaveVoice,
  localMediaState,
  toggleMute,
  toggleDeafen,
  voiceConnectionState,
} from "../../stores/voice";
import { identity } from "../../stores/identity";
import SidebarLayout from "../common/SidebarLayout";
import Avatar from "../common/Avatar";
import type { ChannelMeta } from "../../lib/types";

interface GhostInfo {
  channel: ChannelMeta;
  position: "above" | "below";
}

interface SortableChannelProps {
  channel: ChannelMeta;
  isActive: boolean;
  isInVoiceChannel: boolean;
  icon: typeof Hash;
  onClick: () => void;
  ghost: GhostInfo | null;
}

// translucent preview of the dragged channel at its drop position
const GhostChannel: Component<{ name: string; icon: typeof Hash }> = (
  props,
) => (
  <div class="flex items-center gap-2 w-full h-10 pr-2 pl-3 border border-dashed border-orange/30 bg-orange/5 text-white/25 pointer-events-none">
    <props.icon size={16} class="shrink-0 text-orange/25" />
    <span class="truncate text-[16px]">{props.name}</span>
  </div>
);

const SortableChannel: Component<SortableChannelProps> = (props) => {
  const sortable = createSortable(props.channel.id);

  // determine styling based on active and voice channel state
  const getContainerClass = () => {
    if (props.isInVoiceChannel) {
      // user is currently in this voice channel
      return "bg-orange/20 text-white border-l-4 border-orange pl-1";
    }
    if (props.isActive) {
      return "bg-gray-800 text-white border-l-4 border-orange pl-1";
    }
    return "text-white/60 hover:bg-gray-800 hover:text-white pl-2";
  };

  return (
    <>
      <Show when={props.ghost?.position === "above"}>
        <GhostChannel name={props.ghost!.channel.name} icon={props.icon} />
      </Show>
      <div
        ref={sortable.ref}
        class={`flex items-center gap-2 w-full h-10 pr-2 pl-3 text-[16px] transition-all duration-200 cursor-pointer group ${getContainerClass()} ${
          sortable.isActiveDraggable ? "opacity-40" : ""
        }`}
        onClick={props.onClick}
        {...sortable.dragActivators}
      >
        <props.icon size={16} class="shrink-0 text-white/40" />
        <span class="truncate">{props.channel.name}</span>
      </div>
      <Show when={props.ghost?.position === "below"}>
        <GhostChannel name={props.ghost!.channel.name} icon={props.icon} />
      </Show>
    </>
  );
};

const ChannelList: Component = () => {
  // track collapsed state per section via a map keyed by section id
  const [collapsedSections, setCollapsedSections] = createSignal<
    Record<string, boolean>
  >({});
  const [activeId, setActiveId] = createSignal<string | null>(null);
  const [droppableId, setDroppableId] = createSignal<string | null>(null);

  // channels without a category, grouped by kind
  const uncategorizedText = () =>
    channels().filter((c) => !c.category_id && c.kind === "Text");
  const uncategorizedVoice = () =>
    channels().filter((c) => !c.category_id && c.kind === "Voice");

  // channels belonging to a specific category
  const channelsForCategory = (catId: string) =>
    channels().filter((c) => c.category_id === catId);

  const community = () => activeCommunity();

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isSectionCollapsed = (id: string) => !!collapsedSections()[id];

  const handleDragStart = ({ draggable }: any) => {
    setActiveId(draggable.id as string);
    setDroppableId(null);
  };

  const handleDragOver = ({ droppable }: any) => {
    if (droppable) {
      setDroppableId(droppable.id as string);
    }
  };

  const handleDragEnd = ({ draggable, droppable }: any) => {
    setActiveId(null);
    setDroppableId(null);

    if (!droppable) return;

    const fromId = draggable.id as string;
    const toId = droppable.id as string;

    const allChannels = channels();
    const fromChannel = allChannels.find((c) => c.id === fromId);
    if (!fromChannel) return;

    const toChannel = allChannels.find((c) => c.id === toId);

    // only allow dragging within the same category and kind
    if (fromChannel.kind !== toChannel?.kind) return;
    if (fromChannel.category_id !== toChannel?.category_id) return;

    // get channels in the same group
    const groupChannels = allChannels.filter(
      (c) =>
        c.kind === fromChannel.kind &&
        c.category_id === fromChannel.category_id,
    );
    const ids = groupChannels.map((c) => c.id);

    const fromIndex = ids.indexOf(fromId);
    const toIndex = ids.indexOf(toId);

    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;

    const newOrder = [...ids];
    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, fromId);

    // update local state with new positions
    const otherChannels = allChannels.filter(
      (c) =>
        c.kind !== fromChannel.kind ||
        c.category_id !== fromChannel.category_id,
    );
    const reorderedChannels = newOrder.map((id, index) => {
      const channel = groupChannels.find((c) => c.id === id)!;
      return { ...channel, position: index };
    });

    setChannels([...otherChannels, ...reorderedChannels]);
    reorderChannels(newOrder);
  };

  // compute ghost placement for a given channel in its list
  const getGhost = (
    channelId: string,
    channelList: ChannelMeta[],
  ): GhostInfo | null => {
    const active = activeId();
    const droppable = droppableId();

    if (!active || !droppable || active === droppable) return null;
    if (channelId !== droppable) return null;

    const draggedChannel = channelList.find((c) => c.id === active);
    if (!draggedChannel) return null;

    const ids = channelList.map((c) => c.id);
    const fromIndex = ids.indexOf(active);
    const toIndex = ids.indexOf(droppable);

    if (fromIndex === -1 || toIndex === -1) return null;

    return {
      channel: draggedChannel,
      position: fromIndex < toIndex ? "below" : "above",
    };
  };

  // renders a collapsible channel section header
  const SectionHeader: Component<{
    sectionId: string;
    label: string;
    showAdd?: boolean;
  }> = (props) => (
    <div class="flex items-center justify-between pr-2">
      <button
        type="button"
        class="flex items-center gap-1 flex-1 px-2 py-1.5 text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60 hover:text-white/80 transition-colors duration-200 cursor-pointer select-none"
        onClick={() => toggleSection(props.sectionId)}
      >
        <ChevronDown
          size={12}
          class="transition-transform duration-300"
          style={{
            transform: isSectionCollapsed(props.sectionId)
              ? "rotate(-90deg)"
              : "rotate(0deg)",
          }}
        />
        {props.label}
      </button>
      <Show when={props.showAdd && community()}>
        <button
          type="button"
          class="text-white/30 hover:text-white/60 transition-colors duration-200 cursor-pointer"
          onClick={() => openModal("create-channel")}
        >
          <Plus size={14} />
        </button>
      </Show>
    </div>
  );

  // participants currently in a voice channel, including the local user
  const voiceChannelParticipants = () => {
    const localUser = identity();
    const remote = voiceParticipants().filter(
      (p) => p.peer_id !== localUser?.peer_id,
    );
    const all = [];
    if (localUser) {
      all.push({
        peer_id: localUser.peer_id,
        display_name: localUser.display_name,
        is_local: true,
        muted: localMediaState().muted,
      });
    }
    for (const p of remote) {
      all.push({
        peer_id: p.peer_id,
        display_name: p.display_name,
        is_local: false,
        muted: p.media_state.muted,
      });
    }
    return all;
  };

  const handleChannelClick = (channel: ChannelMeta) => {
    if (channel.kind === "Voice") {
      // clicking a voice channel joins it (or switches to it)
      const currentVoice = voiceChannelId();
      if (currentVoice === channel.id) return;
      joinVoice(channel.community_id, channel.id);
    } else {
      setActiveChannel(channel.id);
    }
  };

  // renders a list of channels with drag-and-drop support
  const ChannelGroup: Component<{
    sectionId: string;
    channelList: ChannelMeta[];
  }> = (props) => {
    const ids = () => props.channelList.map((c) => c.id);

    return (
      <Show when={!isSectionCollapsed(props.sectionId)}>
        <SortableProvider ids={ids()}>
          <For each={props.channelList}>
            {(channel) => (
              <>
                <SortableChannel
                  channel={channel}
                  isActive={
                    channel.kind !== "Voice" && activeChannelId() === channel.id
                  }
                  isInVoiceChannel={voiceChannelId() === channel.id}
                  icon={channel.kind === "Voice" ? Volume2 : Hash}
                  onClick={() => handleChannelClick(channel)}
                  ghost={getGhost(channel.id, props.channelList)}
                />
                {/* discord-style participant list under active voice channels */}
                <Show
                  when={
                    channel.kind === "Voice" &&
                    voiceChannelId() === channel.id &&
                    voiceConnectionState() === "connected"
                  }
                >
                  <div class="pl-7 py-0.5">
                    <For each={voiceChannelParticipants()}>
                      {(participant) => (
                        <div class="flex items-center gap-2 px-2 py-1 text-white/60 hover:bg-white/5 transition-colors duration-150">
                          <Avatar name={participant.display_name} size="sm" />
                          <span class="text-[13px] truncate flex-1">
                            {participant.display_name}
                          </span>
                          <Show when={participant.muted}>
                            <MicOff size={12} class="shrink-0 text-white/30" />
                          </Show>
                        </div>
                      )}
                    </For>
                  </div>
                </Show>
              </>
            )}
          </For>
        </SortableProvider>
      </Show>
    );
  };

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
    <DragDropProvider
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      collisionDetector={closestCenter}
    >
      <DragDropSensors />
      <div class="py-3">
        {/* uncategorized text channels */}
        <Show when={uncategorizedText().length > 0}>
          <SectionHeader
            sectionId="uncategorized-text"
            label="text channels"
            showAdd
          />
          <ChannelGroup
            sectionId="uncategorized-text"
            channelList={uncategorizedText()}
          />
        </Show>

        {/* uncategorized voice channels */}
        <Show when={uncategorizedVoice().length > 0}>
          <div class="mt-2">
            <SectionHeader
              sectionId="uncategorized-voice"
              label="voice channels"
              showAdd
            />
            <ChannelGroup
              sectionId="uncategorized-voice"
              channelList={uncategorizedVoice()}
            />
          </div>
        </Show>

        {/* category sections */}
        <For each={categories()}>
          {(cat) => {
            const catChannels = () => channelsForCategory(cat.id);
            return (
              <Show when={catChannels().length > 0 || community()}>
                <div class="mt-2">
                  <SectionHeader sectionId={cat.id} label={cat.name} showAdd />
                  <ChannelGroup
                    sectionId={cat.id}
                    channelList={catChannels()}
                  />
                </div>
              </Show>
            );
          }}
        </For>

        {/* create channel / create category buttons when no channels exist yet */}
        <Show
          when={
            channels().length === 0 && categories().length === 0 && community()
          }
        >
          <div class="px-2 mt-2">
            <button
              type="button"
              class="flex items-center gap-2 w-full px-3 py-2 text-[14px] text-white/40 hover:text-white/60 transition-colors duration-200 cursor-pointer"
              onClick={() => openModal("create-channel")}
            >
              <Plus size={14} />
              create channel
            </button>
          </div>
        </Show>

        {/* create category button */}
        <Show when={community()}>
          <div class="px-2 mt-3 border-t border-white/5 pt-3">
            <button
              type="button"
              class="flex items-center gap-2 w-full px-3 py-1.5 text-[12px] font-mono text-white/30 hover:text-white/50 transition-colors duration-200 cursor-pointer"
              onClick={() => openModal("create-category")}
            >
              <FolderPlus size={12} />
              create category
            </button>
          </div>
        </Show>
      </div>
    </DragDropProvider>
  );

  // compact voice connection panel rendered above the user footer
  const voicePanel = () => {
    if (!isInVoice()) return null;

    const channelName = () => {
      const id = voiceChannelId();
      return channels().find((c) => c.id === id)?.name ?? "voice";
    };

    return (
      <div class="shrink-0 border-t border-white/10 bg-gray-950">
        <div class="flex items-center justify-between px-3 py-2">
          <div class="flex flex-col min-w-0">
            <span class="text-[11px] font-mono font-semibold text-green-400 uppercase tracking-wider">
              voice connected
            </span>
            <span class="text-[12px] text-white/50 truncate">
              {channelName()}
            </span>
          </div>
          <button
            type="button"
            class="p-1.5 text-white/40 hover:text-red-400 transition-colors duration-200 cursor-pointer"
            onClick={() => leaveVoice()}
            title="Disconnect"
          >
            <PhoneOff size={16} />
          </button>
        </div>
        <div class="flex items-center justify-center gap-1 px-3 pb-2">
          <button
            type="button"
            class={`flex items-center justify-center w-8 h-8 transition-colors duration-200 cursor-pointer ${
              localMediaState().muted
                ? "bg-red-500/20 text-red-400"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
            onClick={() => toggleMute()}
            title={localMediaState().muted ? "Unmute" : "Mute"}
          >
            <Show when={localMediaState().muted} fallback={<Mic size={16} />}>
              <MicOff size={16} />
            </Show>
          </button>
          <button
            type="button"
            class={`flex items-center justify-center w-8 h-8 transition-colors duration-200 cursor-pointer ${
              localMediaState().deafened
                ? "bg-red-500/20 text-red-400"
                : "text-white/60 hover:text-white hover:bg-white/10"
            }`}
            onClick={() => toggleDeafen()}
            title={localMediaState().deafened ? "Undeafen" : "Deafen"}
          >
            <Show
              when={localMediaState().deafened}
              fallback={<Headphones size={16} />}
            >
              <HeadphoneOff size={16} />
            </Show>
          </button>
        </div>
      </div>
    );
  };

  return (
    <SidebarLayout
      header={header}
      beforeFooter={voicePanel()}
      showFooter
      showFooterSettings
      onFooterSettingsClick={() => openModal("settings")}
    >
      {body}
    </SidebarLayout>
  );
};

export default ChannelList;
