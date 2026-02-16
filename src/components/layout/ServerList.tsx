import type { Component } from "solid-js";
import { For, Show } from "solid-js";
import { Home, Plus, Users } from "lucide-solid";
import {
  communities,
  activeCommunityId,
  setActiveCommunity,
} from "../../stores/communities";
import { dmConversations, setActiveDM } from "../../stores/dms";
import { getInitials, hashColor } from "../../lib/utils";
import { openModal } from "../../stores/ui";

const ServerList: Component = () => {
  const unreadDMCount = () =>
    dmConversations().reduce((total, dm) => total + dm.unread_count, 0);

  return (
    <div class="w-16 shrink-0 border-r bg-black flex flex-col items-center py-3 gap-2 overflow-y-auto no-select">
      {/* home button */}
      <div class="relative">
        <button
          type="button"
          class={`w-12 h-12 flex items-center justify-center transition-all duration-200 cursor-pointer ${
            activeCommunityId() === null
              ? "bg-orange text-white"
              : "bg-gray-800 text-white/60 hover:bg-gray-800 hover:text-white hover:scale-105"
          }`}
          onClick={() => {
            setActiveCommunity(null);
            setActiveDM(null);
          }}
        >
          <Home size={24} />
        </button>
        <Show when={unreadDMCount() > 0}>
          <div class="absolute -top-1 -right-1 min-w-5 h-5 px-1 bg-orange text-white text-[11px] leading-none font-bold flex items-center justify-center rounded-full">
            {unreadDMCount() > 99 ? "99+" : unreadDMCount()}
          </div>
        </Show>
      </div>

      <div class="w-8 border-t border-white/20 my-1" />

      {/* server icons */}
      <For each={communities()}>
        {(community) => (
          <div class="relative">
            <Show when={activeCommunityId() === community.id}>
              <div class="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 w-1 h-8 bg-orange rounded-r" />
            </Show>
            <button
              type="button"
              class={`w-12 h-12 flex items-center justify-center text-[14px] font-bold transition-all duration-200 cursor-pointer hover:scale-105 ${
                activeCommunityId() === community.id ? "ring-2 ring-orange" : ""
              }`}
              style={{ background: hashColor(community.name) }}
              onClick={() => {
                setActiveCommunity(community.id);
                setActiveDM(null);
              }}
              title={community.name}
            >
              {getInitials(community.name)}
            </button>
          </div>
        )}
      </For>

      <div class="w-8 border-t border-white/20 my-1" />

      {/* create community button */}
      <button
        type="button"
        class="w-12 h-12 flex items-center justify-center bg-gray-800 text-white/40 hover:bg-orange hover:text-white transition-all duration-200 cursor-pointer"
        onClick={() => openModal("create-community")}
        title="create community"
      >
        <Plus size={24} />
      </button>

      {/* join community button */}
      <button
        type="button"
        class="w-12 h-12 flex items-center justify-center bg-gray-800 text-white/40 hover:bg-orange hover:text-white transition-all duration-200 cursor-pointer"
        onClick={() => openModal("join-community")}
        title="join community"
      >
        <Users size={24} />
      </button>
    </div>
  );
};

export default ServerList;
