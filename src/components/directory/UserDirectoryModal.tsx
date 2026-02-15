import { Component, createSignal, createMemo, For, Show } from "solid-js";
import { Portal } from "solid-js/web";
import {
  X,
  Search,
  UserPlus,
  UserMinus,
  Users,
  Copy,
  Check,
} from "lucide-solid";
import Avatar from "../common/Avatar";
import Button from "../common/Button";
import Divider from "../common/Divider";
import {
  knownPeers,
  markAsFriend,
  unmarkAsFriend,
} from "../../stores/directory";
import { identity } from "../../stores/identity";
import { setActiveDM } from "../../stores/dms";
import { addDMConversation } from "../../stores/dms";
import * as tauri from "../../lib/tauri";

interface UserDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type DirectoryTab = "all" | "friends";

const UserDirectoryModal: Component<UserDirectoryModalProps> = (props) => {
  const [searchQuery, setSearchQuery] = createSignal("");
  const [activeTab, setActiveTab] = createSignal<DirectoryTab>("all");
  const [copiedId, setCopiedId] = createSignal<string | null>(null);

  // filter out our own peer id from the directory
  const filteredPeers = createMemo(() => {
    const myId = identity()?.peer_id;
    const query = searchQuery().toLowerCase().trim();
    const tab = activeTab();

    let peers = knownPeers();

    if (tab === "friends") {
      peers = peers.filter((p) => p.is_friend);
    }

    if (query) {
      peers = peers.filter(
        (p) =>
          p.display_name.toLowerCase().includes(query) ||
          p.peer_id.toLowerCase().includes(query),
      );
    } else {
      // if not searching, hide self from the list to avoid confusion
      peers = peers.filter((p) => p.peer_id !== myId);
    }

    return peers;
  });

  async function handleToggleFriend(peerId: string, currentlyFriend: boolean) {
    try {
      if (currentlyFriend) {
        await tauri.removeFriend(peerId);
        unmarkAsFriend(peerId);
      } else {
        await tauri.addFriend(peerId);
        markAsFriend(peerId);
      }
    } catch (e) {
      console.error("failed to toggle friend status:", e);
    }
  }

  async function handleMessagePeer(peerId: string, displayName: string) {
    // start a dm conversation with this peer
    try {
      await tauri.openDMConversation(peerId, displayName);
    } catch {
      // fallback for demo mode or if backend call fails
    }
    addDMConversation({
      peer_id: peerId,
      display_name: displayName,
      last_message: null,
      last_message_time: null,
      unread_count: 0,
    });
    setActiveDM(peerId);
    props.onClose();
  }

  function handleCopyPeerId(peerId: string) {
    navigator.clipboard.writeText(peerId);
    setCopiedId(peerId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") props.onClose();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) props.onClose();
  }

  const tabs: { id: DirectoryTab; label: string }[] = [
    { id: "all", label: "all peers" },
    { id: "friends", label: "friends" },
  ];

  return (
    <Show when={props.isOpen}>
      <Portal>
        <div
          class="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 animate-fade-in"
          onClick={handleBackdropClick}
          onKeyDown={handleKeydown}
        >
          <div class="bg-gray-900 border-2 border-white/20 w-full max-w-[640px] max-h-[80vh] mx-4 flex flex-col animate-scale-in relative">
            {/* header */}
            <div class="shrink-0 p-6 pb-4">
              <button
                type="button"
                class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
                onClick={props.onClose}
              >
                <X size={20} />
              </button>

              <div class="flex items-center gap-3 mb-4">
                <Users size={24} class="text-orange" />
                <h2 class="text-[24px] leading-[32px] font-bold text-white">
                  user directory
                </h2>
              </div>

              {/* tabs */}
              <div class="flex items-center gap-1 mb-4">
                <For each={tabs}>
                  {(tab) => (
                    <button
                      type="button"
                      class={`px-3 py-1.5 text-[14px] font-medium transition-all duration-200 cursor-pointer ${
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

              {/* search */}
              <div class="relative">
                <Search
                  size={16}
                  class="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"
                />
                <input
                  type="text"
                  class="w-full bg-black text-white text-[14px] pl-10 pr-4 py-2.5 outline-none placeholder:text-white/30 border-2 border-white/10 focus:border-orange transition-colors duration-200"
                  placeholder="search by name or peer id..."
                  value={searchQuery()}
                  onInput={(e) => setSearchQuery(e.currentTarget.value)}
                />
              </div>
            </div>

            <Divider class="mx-6" />

            {/* peer list */}
            <div class="flex-1 overflow-y-auto p-3">
              <Show
                when={filteredPeers().length > 0}
                fallback={
                  <div class="flex flex-col items-center justify-center py-16">
                    <Users size={48} class="text-white/10 mb-4" />
                    <p class="text-[16px] text-white/30 mb-1">
                      {searchQuery()
                        ? "no peers matching your search"
                        : activeTab() === "friends"
                          ? "no friends added yet"
                          : "no peers discovered yet"}
                    </p>
                    <p class="text-[14px] text-white/20">
                      {activeTab() === "friends"
                        ? "add friends from the all peers tab"
                        : "peers will appear as you join communities"}
                    </p>
                  </div>
                }
              >
                <For each={filteredPeers()}>
                  {(peer) => (
                    <div class="flex items-center justify-between px-3 py-3 hover:bg-gray-800/50 transition-colors duration-200 group">
                      <div class="flex items-center gap-3 min-w-0 flex-1">
                        <Avatar name={peer.display_name} size="lg" />
                        <div class="min-w-0 flex-1">
                          <div class="flex items-center gap-2">
                            <p class="text-[16px] font-medium text-white truncate">
                              {peer.display_name}
                            </p>
                            <Show when={peer.is_friend}>
                              <span class="text-[10px] font-mono uppercase tracking-[0.05em] text-orange px-1.5 py-0.5 border border-orange/30 shrink-0">
                                friend
                              </span>
                            </Show>
                          </div>
                          <Show when={peer.bio}>
                            <p class="text-[13px] text-white/40 truncate">
                              {peer.bio}
                            </p>
                          </Show>
                          <button
                            type="button"
                            class="flex items-center gap-1 text-[11px] font-mono text-white/20 hover:text-white/40 transition-colors cursor-pointer mt-0.5"
                            onClick={() => handleCopyPeerId(peer.peer_id)}
                          >
                            {peer.peer_id.slice(0, 16)}...
                            <Show
                              when={copiedId() === peer.peer_id}
                              fallback={<Copy size={10} />}
                            >
                              <Check size={10} class="text-success" />
                            </Show>
                          </button>
                        </div>
                      </div>

                      <div class="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 shrink-0">
                        <button
                          type="button"
                          class="w-8 h-8 flex items-center justify-center bg-gray-800 text-white/60 hover:text-white transition-colors duration-200 cursor-pointer"
                          title={
                            peer.is_friend ? "remove friend" : "add friend"
                          }
                          onClick={() =>
                            handleToggleFriend(peer.peer_id, peer.is_friend)
                          }
                        >
                          <Show
                            when={peer.is_friend}
                            fallback={<UserPlus size={16} />}
                          >
                            <UserMinus size={16} />
                          </Show>
                        </button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            handleMessagePeer(peer.peer_id, peer.display_name)
                          }
                        >
                          message
                        </Button>
                      </div>
                    </div>
                  )}
                </For>
              </Show>
            </div>

            {/* footer */}
            <div class="shrink-0 px-6 py-3 border-t border-white/10">
              <p class="text-[11px] font-mono text-white/20">
                {filteredPeers().length} peer
                {filteredPeers().length !== 1 ? "s" : ""} in directory
              </p>
            </div>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

export default UserDirectoryModal;
