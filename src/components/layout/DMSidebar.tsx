import type { Component } from "solid-js";
import { For, Show, createSignal } from "solid-js";
import { MessageCircle, Search, X, Plus } from "lucide-solid";
import {
  dmConversations,
  activeDMPeerId,
  setActiveDM,
  clearDMUnread,
  removeDMConversation,
} from "../../stores/dms";
import { onlinePeerIds } from "../../stores/members";
import { openModal } from "../../stores/ui";
import * as tauri from "../../lib/tauri";
import Avatar from "../common/Avatar";
import Divider from "../common/Divider";
import SidebarLayout from "../common/SidebarLayout";

const DMSidebar: Component = () => {
  const [searchQuery, setSearchQuery] = createSignal("");

  const filteredConversations = () => {
    const query = searchQuery().toLowerCase().trim();
    if (!query) return dmConversations();
    return dmConversations().filter((dm) =>
      dm.display_name.toLowerCase().includes(query),
    );
  };

  // derive status from online peer set
  function peerStatus(peerId: string): "Online" | "Offline" {
    return onlinePeerIds().has(peerId) ? "Online" : "Offline";
  }

  function handleSelectDM(peerId: string) {
    setActiveDM(peerId);
    clearDMUnread(peerId);
    // mark as read in the backend
    tauri.markDMRead(peerId).catch(() => {});
  }

  async function handleDeleteConversation(e: MouseEvent, peerId: string) {
    e.stopPropagation();
    try {
      await tauri.deleteDMConversation(peerId);
      removeDMConversation(peerId);
    } catch (err) {
      console.error("failed to delete dm conversation:", err);
    }
  }

  const header = (
    <div class="h-15 border-b border-white/10 flex flex-col justify-end">
      <div class="h-12 flex items-center px-4">
        <div class="relative flex-1">
          <Search
            size={14}
            class="absolute left-2 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            class="w-full bg-black text-white text-[14px] pl-7 pr-7 py-1.5 outline-none placeholder:text-white/30 border border-white/10 focus:border-orange transition-colors duration-200"
            placeholder="find a conversation"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
          <Show when={searchQuery()}>
            <button
              type="button"
              class="absolute right-1.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white transition-colors cursor-pointer"
              onClick={() => setSearchQuery("")}
            >
              <X size={12} />
            </button>
          </Show>
        </div>
      </div>
    </div>
  );

  const body = (
    <div class="py-2">
      {/* friends button at top, like discord */}
      <button
        type="button"
        class={`flex items-center gap-3 w-full h-11 px-3 text-[16px] transition-all duration-200 cursor-pointer ${
          activeDMPeerId() === null
            ? "bg-gray-800 text-white"
            : "text-white/60 hover:bg-gray-800 hover:text-white"
        }`}
        onClick={() => setActiveDM(null)}
      >
        <MessageCircle size={20} class="shrink-0" />
        <span class="font-medium">friends</span>
      </button>

      <div class="px-3 py-2">
        <Divider />
      </div>

      {/* section header */}
      <div class="flex items-center justify-between px-3 py-1.5">
        <span class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60">
          direct messages
        </span>
        <button
          type="button"
          class="text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
          title="new dm"
          onClick={() => openModal("directory")}
        >
          <Plus size={14} />
        </button>
      </div>

      {/* conversation list */}
      <Show
        when={filteredConversations().length > 0}
        fallback={
          <div class="px-3 py-8 text-center">
            <p class="text-[14px] text-white/30">
              {searchQuery()
                ? "no conversations found"
                : "no conversations yet"}
            </p>
          </div>
        }
      >
        <For each={filteredConversations()}>
          {(dm) => (
            <div
              role="button"
              tabIndex={0}
              class={`flex items-center gap-3 w-full px-3 py-2 transition-all duration-200 cursor-pointer group ${
                activeDMPeerId() === dm.peer_id
                  ? "bg-gray-800 text-white"
                  : "text-white/60 hover:bg-gray-800/60 hover:text-white"
              }`}
              onClick={() => handleSelectDM(dm.peer_id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  handleSelectDM(dm.peer_id);
              }}
            >
              <Avatar
                name={dm.display_name}
                size="sm"
                status={peerStatus(dm.peer_id)}
                showStatus
              />
              <div class="flex-1 min-w-0 text-left">
                <div class="flex items-center justify-between">
                  <span class="text-[14px] font-medium truncate">
                    {dm.display_name}
                  </span>
                  <div class="flex items-center gap-1 shrink-0">
                    <Show when={dm.unread_count > 0}>
                      <span class="w-5 h-5 flex items-center justify-center bg-orange text-white text-[11px] font-bold rounded-full">
                        {dm.unread_count}
                      </span>
                    </Show>
                    <button
                      type="button"
                      class="w-5 h-5 flex items-center justify-center text-white/0 group-hover:text-white/30 hover:!text-red-400 transition-colors duration-200 cursor-pointer"
                      title="close conversation"
                      onClick={(e) => handleDeleteConversation(e, dm.peer_id)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
                <Show when={dm.last_message}>
                  <p class="text-[12px] text-white/40 truncate mt-0.5">
                    {dm.last_message}
                  </p>
                </Show>
              </div>
            </div>
          )}
        </For>
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

export default DMSidebar;
