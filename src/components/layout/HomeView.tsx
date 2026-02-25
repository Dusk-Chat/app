import type { Component } from "solid-js";
import { For, Show, createSignal, createMemo } from "solid-js";
import { Users, MessageCircle, Search, UserPlus } from "lucide-solid";
import {
  setActiveDM,
  clearDMUnread,
  addDMConversation,
} from "../../stores/dms";
import { knownPeers, friends } from "../../stores/directory";
import { onlinePeerIds } from "../../stores/members";
import { identity } from "../../stores/identity";
import { openModal } from "../../stores/ui";
import * as tauri from "../../lib/tauri";
import Avatar from "../common/Avatar";
import Divider from "../common/Divider";

type FriendsTab = "online" | "all" | "pending" | "directory";

const HomeView: Component = () => {
  const [activeTab, setActiveTab] = createSignal<FriendsTab>("online");
  const [searchQuery, setSearchQuery] = createSignal("");

  // friends list comes from directory entries marked as friends
  const allPeers = createMemo(() => {
    const friendList = friends();
    const onlineSet = onlinePeerIds();

    return friendList.map((f) => ({
      peer_id: f.peer_id,
      display_name: f.display_name,
      bio: f.bio,
      status: (onlineSet.has(f.peer_id) ? "Online" : "Offline") as
        | "Online"
        | "Offline",
    }));
  });

  // directory peers (all known, not just friends)
  const directoryPeers = createMemo(() => {
    const myId = identity()?.peer_id;
    return knownPeers().filter((p) => p.peer_id !== myId);
  });

  const filteredPeers = createMemo(() => {
    const tab = activeTab();
    const query = searchQuery().toLowerCase().trim();

    // directory tab shows all known peers from network discovery
    if (tab === "directory") {
      let peers = directoryPeers();
      if (query) {
        peers = peers.filter(
          (p) =>
            p.display_name.toLowerCase().includes(query) ||
            p.peer_id.toLowerCase().includes(query),
        );
      }
      const onlineSet = onlinePeerIds();
      return peers.map((p) => ({
        peer_id: p.peer_id,
        display_name: p.display_name,
        bio: p.bio,
        status: (onlineSet.has(p.peer_id) ? "Online" : "Offline") as
          | "Online"
          | "Offline",
        is_friend: p.is_friend,
      }));
    }

    let peers = allPeers();

    // filter by tab
    if (tab === "online") {
      peers = peers.filter((p) => p.status === "Online");
    }

    // filter by search
    if (query) {
      peers = peers.filter((p) => p.display_name.toLowerCase().includes(query));
    }

    return peers.map((p) => ({ ...p, is_friend: undefined }));
  });

  const onlineCount = () =>
    allPeers().filter((p) => p.status === "Online").length;

  function handleOpenDM(peerId: string) {
    const peer =
      allPeers().find((p) => p.peer_id === peerId) ??
      directoryPeers().find((p) => p.peer_id === peerId);
    if (!peer) return;

    const displayName = peer.display_name;

    // create the conversation on the backend (persists + subscribes to topic)
    tauri
      .openDMConversation(peerId, displayName)
      .then((meta) => {
        addDMConversation(meta);
        setActiveDM(peerId);
        clearDMUnread(peerId);
      })
      .catch((e) => {
        console.error("failed to open dm conversation:", e);
        // fallback: still open the conversation locally
        addDMConversation({
          peer_id: peerId,
          display_name: displayName,
          last_message: null,
          last_message_time: null,
          unread_count: 0,
        });
        setActiveDM(peerId);
      });
  }

  const tabs: { id: FriendsTab; label: string }[] = [
    { id: "online", label: "online" },
    { id: "all", label: "all" },
    { id: "directory", label: "directory" },
  ];

  return (
    <div class="flex-1 flex flex-col min-w-0 bg-black">
      {/* header bar */}
      <div class="h-15 shrink-0 border-b border-white/10 flex flex-col justify-end">
        <div class="h-12 flex items-center justify-between px-4">
          <div class="flex items-center gap-4">
            <div class="flex items-center gap-2">
              <Users size={20} class="text-white/60" />
              <span class="text-[16px] font-bold text-white">friends</span>
            </div>

            <div class="w-px h-5 bg-white/20" />

            {/* tab buttons */}
            <div class="flex items-center gap-1">
              <For each={tabs}>
                {(tab) => (
                  <button
                    type="button"
                    class={`px-3 py-1 text-[14px] font-medium transition-all duration-200 cursor-pointer ${
                      activeTab() === tab.id
                        ? "bg-gray-800 text-white"
                        : "text-white/50 hover:text-white hover:bg-gray-800/50"
                    }`}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                  </button>
                )}
              </For>
            </div>
          </div>

          {/* add friend button */}
          <button
            type="button"
            class="flex items-center gap-2 px-3 py-1.5 bg-orange text-white text-[13px] font-medium uppercase tracking-[0.05em] hover:bg-orange-hover transition-colors duration-200 cursor-pointer"
            onClick={() => openModal("directory")}
          >
            <UserPlus size={14} />
            user directory
          </button>
        </div>
      </div>

      {/* search bar */}
      <div class="px-6 py-4">
        <div class="relative">
          <Search
            size={16}
            class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
          />
          <input
            type="text"
            class="w-full bg-gray-800 text-white text-[14px] pl-10 pr-4 py-2.5 outline-none placeholder:text-white/30 border-2 border-white/10 focus:border-orange transition-colors duration-200"
            placeholder="search"
            value={searchQuery()}
            onInput={(e) => setSearchQuery(e.currentTarget.value)}
          />
        </div>
      </div>

      {/* section label */}
      <div class="px-6 pb-2">
        <span class="text-[12px] font-mono font-medium uppercase tracking-[0.05em] text-white/60">
          {activeTab() === "online" && `online - ${onlineCount()}`}
          {activeTab() === "all" && `all peers - ${allPeers().length}`}
          {activeTab() === "directory" &&
            `known peers - ${directoryPeers().length}`}
        </span>
      </div>

      <Divider class="mx-6" />

      {/* peer list */}
      <div class="flex-1 overflow-y-auto px-3">
        <Show
          when={filteredPeers().length > 0}
          fallback={
            <div class="flex flex-col items-center justify-center py-16">
              <Show
                when={activeTab() === "directory"}
                fallback={
                  <>
                    <Users size={48} class="text-white/10 mb-4" />
                    <p class="text-[16px] text-white/30 mb-1">
                      {searchQuery()
                        ? "no results found"
                        : activeTab() === "online"
                          ? "no one is online right now"
                          : "no peers yet"}
                    </p>
                    <p class="text-[14px] text-white/20">
                      start a conversation from a community
                    </p>
                  </>
                }
              >
                <Users size={48} class="text-white/10 mb-4" />
                <p class="text-[16px] text-white/30 mb-1">
                  {searchQuery()
                    ? "no peers matching your search"
                    : "no peers discovered yet"}
                </p>
                <p class="text-[14px] text-white/20">
                  peers will appear as you join communities and connect to the
                  network
                </p>
              </Show>
            </div>
          }
        >
          <For each={filteredPeers()}>
            {(peer) => (
              <div class="flex items-center justify-between px-3 py-3 hover:bg-gray-800/50 transition-colors duration-200 group">
                <div class="flex items-center gap-3 min-w-0">
                  <Avatar
                    name={peer.display_name}
                    size="lg"
                    status={peer.status}
                    showStatus
                  />
                  <div class="min-w-0">
                    <div class="flex items-center gap-2">
                      <p class="text-[16px] font-medium text-white truncate">
                        {peer.display_name}
                      </p>
                      <Show when={"is_friend" in peer && peer.is_friend}>
                        <span class="text-[10px] font-mono uppercase tracking-[0.05em] text-orange px-1 py-0.5 border border-orange/30 shrink-0">
                          friend
                        </span>
                      </Show>
                    </div>
                    <Show when={"bio" in peer && peer.bio}>
                      <p class="text-[13px] text-white/30 truncate">
                        {(peer as { bio: string }).bio}
                      </p>
                    </Show>
                    <p class="text-[13px] font-mono text-white/40 lowercase">
                      {peer.status === "Online" ? "online" : "offline"}
                    </p>
                  </div>
                </div>

                <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    type="button"
                    class="w-9 h-9 flex items-center justify-center bg-gray-800 text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
                    title="message"
                    onClick={() => handleOpenDM(peer.peer_id)}
                  >
                    <MessageCircle size={18} />
                  </button>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>

      
    </div>
  );
};

export default HomeView;
