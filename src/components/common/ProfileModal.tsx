import type { Component } from "solid-js";
import {
  Show,
  For,
  createMemo,
  createSignal,
  onMount,
  onCleanup,
} from "solid-js";
import { Portal } from "solid-js/web";
import {
  X,
  UserPlus,
  UserMinus,
  Copy,
  Check,
  Shield,
  Clock,
  Fingerprint,
  Server,
  Info,
} from "lucide-solid";
import Avatar from "./Avatar";
import { profileModalPeerId, closeProfileModal } from "../../stores/ui";
import { members } from "../../stores/members";
import {
  knownPeers,
  markAsFriend,
  unmarkAsFriend,
} from "../../stores/directory";
import { identity } from "../../stores/identity";
import { communities } from "../../stores/communities";
import * as tauri from "../../lib/tauri";
import { formatTime } from "../../lib/utils";

const ProfileModal: Component = () => {
  const [copiedId, setCopiedId] = createSignal(false);
  const [copiedKey, setCopiedKey] = createSignal(false);
  const [showPeerIdInfo, setShowPeerIdInfo] = createSignal(false);
  const [showPublicKeyInfo, setShowPublicKeyInfo] = createSignal(false);

  const peerId = () => profileModalPeerId();
  const isOpen = () => peerId() !== null;
  const isSelf = () => peerId() === identity()?.peer_id;

  const memberInfo = createMemo(() => {
    const id = peerId();
    if (!id) return null;
    return members().find((m) => m.peer_id === id) ?? null;
  });

  const directoryInfo = createMemo(() => {
    const id = peerId();
    if (!id) return null;
    return knownPeers().find((p) => p.peer_id === id) ?? null;
  });

  const displayName = () =>
    memberInfo()?.display_name ?? directoryInfo()?.display_name ?? "Unknown";

  const bio = () =>
    directoryInfo()?.bio || (isSelf() ? identity()?.bio : "") || "";

  const isFriend = () => directoryInfo()?.is_friend ?? false;
  const status = () => memberInfo()?.status ?? "Offline";
  const roles = () => memberInfo()?.roles ?? [];
  const joinedAt = () => memberInfo()?.joined_at ?? 0;
  const publicKey = () =>
    directoryInfo()?.public_key ?? identity()?.public_key ?? "";
  const lastSeen = () => directoryInfo()?.last_seen ?? 0;
  const trustLevel = () => memberInfo()?.trust_level ?? 0;

  // communities the user is a member of (only meaningful for self right now,
  // but the structure supports it once we track per-community membership)
  const mutualCommunities = createMemo(() => {
    if (isSelf()) return communities();
    // for remote peers we don't have cross-community membership data yet,
    // so return the current community if they're a member of it
    const id = peerId();
    if (!id) return [];
    const isMember = members().some((m) => m.peer_id === id);
    if (!isMember) return [];
    // just show active community for now
    return communities().slice(0, 1);
  });

  const createdAt = () => {
    if (isSelf()) return identity()?.created_at ?? 0;
    return 0;
  };

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeProfileModal();
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) closeProfileModal();
  }

  onMount(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onCleanup(() => {
    document.removeEventListener("keydown", handleKeydown);
  });

  async function handleToggleFriend() {
    const id = peerId();
    if (!id) return;

    try {
      if (isFriend()) {
        await tauri.removeFriend(id);
        unmarkAsFriend(id);
      } else {
        await tauri.addFriend(id);
        markAsFriend(id);
      }
    } catch (e) {
      console.error("failed to toggle friend:", e);
    }
  }

  async function copyToClipboard(text: string, setter: (v: boolean) => void) {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // clipboard api may fail outside secure contexts
    }
  }

  const statusLabel = () => {
    const s = status();
    if (s === "Online") return "online";
    if (s === "Idle") return "idle";
    return "offline";
  };

  const statusColor = () => {
    const s = status();
    if (s === "Online") return "bg-success";
    if (s === "Idle") return "bg-warning";
    return "bg-gray-300";
  };

  // truncate public key for display
  const truncatedKey = () => {
    const key = publicKey();
    if (!key || key.length < 20) return key;
    return `${key.slice(0, 12)}...${key.slice(-12)}`;
  };

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          class="fixed inset-0 z-1000 flex items-center justify-center bg-black/80 animate-fade-in"
          onClick={handleBackdropClick}
        >
          <div class="bg-gray-900 border-2 border-white/20 w-full max-w-130 mx-4 animate-scale-in relative overflow-hidden">
            {/* banner */}
            <div class="h-24 bg-linear-to-r from-orange/30 via-orange/15 to-orange/5 relative">
              <button
                type="button"
                class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center text-white/60 hover:text-white transition-colors duration-200 cursor-pointer bg-black/30 hover:bg-black/50"
                onClick={closeProfileModal}
              >
                <X size={18} />
              </button>
            </div>

            {/* avatar overlapping banner */}
            <div class="px-6 -mt-10 flex items-end gap-4">
              <div class="shrink-0">
                <Avatar
                  name={displayName()}
                  size="xl"
                  status={status()}
                  showStatus
                />
              </div>
              <div class="pb-1 min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <h2 class="text-[22px] font-bold text-white truncate">
                    {displayName()}
                  </h2>
                  <Show when={isSelf()}>
                    <span class="text-[11px] font-mono text-white/40 shrink-0">
                      (you)
                    </span>
                  </Show>
                </div>
                <div class="flex items-center gap-1.5">
                  <div class={`w-2 h-2 rounded-full ${statusColor()}`} />
                  <span class="text-[12px] font-mono text-white/50">
                    {statusLabel()}
                  </span>
                </div>
              </div>
            </div>

            {/* body */}
            <div class="px-6 pt-4 pb-5 space-y-5 max-h-[60vh] overflow-y-auto">
              {/* bio section */}
              <Show when={bio()}>
                <div>
                  <SectionLabel text="about me" />
                  <p class="text-[14px] text-white/80 leading-relaxed whitespace-pre-wrap">
                    {bio()}
                  </p>
                </div>
              </Show>

              {/* roles */}
              <Show when={roles().length > 0}>
                <div>
                  <SectionLabel text="roles" />
                  <div class="flex flex-wrap gap-1.5">
                    <For each={roles()}>
                      {(role) => (
                        <span class="text-[12px] font-mono px-2.5 py-1 bg-orange/15 text-orange border border-orange/30">
                          {role}
                        </span>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* info grid */}
              <div>
                <SectionLabel text="info" />
                <div class="space-y-3">
                  {/* member since */}
                  <Show when={joinedAt() > 0}>
                    <InfoRow
                      icon={Clock}
                      label="member since"
                      value={formatTime(joinedAt())}
                    />
                  </Show>

                  {/* account created */}
                  <Show when={createdAt() > 0}>
                    <InfoRow
                      icon={Clock}
                      label="account created"
                      value={formatTime(createdAt())}
                    />
                  </Show>

                  {/* last seen (for non-online peers) */}
                  <Show
                    when={!isSelf() && status() !== "Online" && lastSeen() > 0}
                  >
                    <InfoRow
                      icon={Clock}
                      label="last seen"
                      value={formatTime(lastSeen())}
                    />
                  </Show>

                  {/* trust level */}
                  <Show when={trustLevel() > 0}>
                    <InfoRow
                      icon={Shield}
                      label="trust level"
                      value={`${trustLevel()}`}
                    />
                  </Show>
                </div>
              </div>

              {/* mutual communities */}
              <Show when={!isSelf() && mutualCommunities().length > 0}>
                <div>
                  <SectionLabel text="mutual communities" />
                  <div class="space-y-1.5">
                    <For each={mutualCommunities()}>
                      {(community) => (
                        <div class="flex items-center gap-2.5 px-3 py-2 bg-black/30 border border-white/5">
                          <Server size={14} class="text-white/40 shrink-0" />
                          <span class="text-[13px] text-white/70 truncate">
                            {community.name}
                          </span>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              </Show>

              {/* cryptographic identity */}
              <div>
                <SectionLabel text="identity" />
                <div class="space-y-2.5">
                  {/* peer id */}
                  <div class="flex items-start gap-2.5">
                    <Fingerprint
                      size={14}
                      class="text-white/30 shrink-0 mt-0.5"
                    />
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-1.5">
                        <span class="text-[11px] font-mono text-white/40">
                          peer id
                        </span>
                        <button
                          type="button"
                          class="cursor-pointer text-white/25 hover:text-white/50 transition-colors duration-200"
                          onClick={() => setShowPeerIdInfo((v) => !v)}
                        >
                          <Info size={11} />
                        </button>
                      </div>
                      <Show when={showPeerIdInfo()}>
                        <p class="text-[11px] text-white/40 leading-relaxed mt-1 mb-1.5">
                          a unique identifier for this user on the dusk
                          peer-to-peer network. every peer gets one when they
                          create their account. it's derived from their
                          cryptographic keypair so it can't be faked.
                        </p>
                      </Show>
                      <button
                        type="button"
                        class="flex items-center gap-1.5 group cursor-pointer mt-0.5"
                        onClick={() => copyToClipboard(peerId()!, setCopiedId)}
                      >
                        <span class="text-[12px] font-mono text-white/50 group-hover:text-white/70 transition-colors duration-200 break-all">
                          {peerId()}
                        </span>
                        <Show
                          when={copiedId()}
                          fallback={
                            <Copy
                              size={12}
                              class="shrink-0 text-white/30 group-hover:text-white/50 transition-colors duration-200"
                            />
                          }
                        >
                          <Check size={12} class="shrink-0 text-success" />
                        </Show>
                      </button>
                    </div>
                  </div>

                  {/* public key */}
                  <Show when={publicKey()}>
                    <div class="flex items-start gap-2.5">
                      <Shield size={14} class="text-white/30 shrink-0 mt-0.5" />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-center gap-1.5">
                          <span class="text-[11px] font-mono text-white/40">
                            public key
                          </span>
                          <button
                            type="button"
                            class="cursor-pointer text-white/25 hover:text-white/50 transition-colors duration-200"
                            onClick={() => setShowPublicKeyInfo((v) => !v)}
                          >
                            <Info size={11} />
                          </button>
                        </div>
                        <Show when={showPublicKeyInfo()}>
                          <p class="text-[11px] text-white/40 leading-relaxed mt-1 mb-1.5">
                            a cryptographic key that proves this user's
                            identity. every message they send is signed with a
                            matching private key, so you can trust it really
                            came from them and wasn't tampered with.
                          </p>
                        </Show>
                        <button
                          type="button"
                          class="flex items-center gap-1.5 group cursor-pointer mt-0.5"
                          onClick={() =>
                            copyToClipboard(publicKey(), setCopiedKey)
                          }
                        >
                          <span class="text-[12px] font-mono text-white/50 group-hover:text-white/70 transition-colors duration-200">
                            {truncatedKey()}
                          </span>
                          <Show
                            when={copiedKey()}
                            fallback={
                              <Copy
                                size={12}
                                class="shrink-0 text-white/30 group-hover:text-white/50 transition-colors duration-200"
                              />
                            }
                          >
                            <Check size={12} class="shrink-0 text-success" />
                          </Show>
                        </button>
                      </div>
                    </div>
                  </Show>
                </div>
              </div>
            </div>

            {/* action footer */}
            <Show when={!isSelf()}>
              <div class="border-t border-white/10 px-6 py-4 flex gap-3">
                <button
                  type="button"
                  class={`flex items-center gap-2 px-4 py-2 text-[13px] font-medium transition-colors duration-200 cursor-pointer ${
                    isFriend()
                      ? "text-red-400 border border-red-400/30 hover:bg-red-400/10"
                      : "text-orange border border-orange/30 hover:bg-orange/10"
                  }`}
                  onClick={handleToggleFriend}
                >
                  <Show
                    when={isFriend()}
                    fallback={
                      <>
                        <UserPlus size={16} />
                        add friend
                      </>
                    }
                  >
                    <UserMinus size={16} />
                    remove friend
                  </Show>
                </button>
              </div>
            </Show>
          </div>
        </div>
      </Portal>
    </Show>
  );
};

// reusable section label
const SectionLabel: Component<{ text: string }> = (props) => (
  <span class="block text-[11px] font-mono uppercase tracking-[0.05em] text-white/40 mb-2">
    {props.text}
  </span>
);

// reusable info row with icon
const InfoRow: Component<{
  icon: typeof Clock;
  label: string;
  value: string;
}> = (props) => (
  <div class="flex items-center gap-2.5">
    <props.icon size={14} class="text-white/30 shrink-0" />
    <div class="flex items-baseline gap-2 min-w-0">
      <span class="text-[11px] font-mono text-white/40 shrink-0">
        {props.label}
      </span>
      <span class="text-[13px] font-mono text-white/60 truncate">
        {props.value}
      </span>
    </div>
  </div>
);

export default ProfileModal;
