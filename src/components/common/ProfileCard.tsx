import type { Component } from "solid-js";
import { Show, createMemo, createEffect, onCleanup } from "solid-js";
import { Portal } from "solid-js/web";
import { UserPlus, UserMinus, Copy, Check } from "lucide-solid";
import { createSignal } from "solid-js";
import Avatar from "./Avatar";
import {
  profileCardTarget,
  closeProfileCard,
  openProfileModal,
} from "../../stores/ui";
import { members } from "../../stores/members";
import { knownPeers } from "../../stores/directory";
import { identity } from "../../stores/identity";
import { markAsFriend, unmarkAsFriend } from "../../stores/directory";
import * as tauri from "../../lib/tauri";
import { formatTime } from "../../lib/utils";

const ProfileCard: Component = () => {
  const [copied, setCopied] = createSignal(false);
  let cardRef: HTMLDivElement | undefined;

  const target = () => profileCardTarget();
  const isOpen = () => target() !== null;
  const isSelf = () => target()?.peerId === identity()?.peer_id;

  // pull rich info from member list or directory
  const memberInfo = createMemo(() => {
    const t = target();
    if (!t) return null;
    return members().find((m) => m.peer_id === t.peerId) ?? null;
  });

  const directoryInfo = createMemo(() => {
    const t = target();
    if (!t) return null;
    return knownPeers().find((p) => p.peer_id === t.peerId) ?? null;
  });

  const displayName = () =>
    memberInfo()?.display_name ??
    directoryInfo()?.display_name ??
    target()?.displayName ??
    "Unknown";

  const bio = () =>
    directoryInfo()?.bio || (isSelf() ? identity()?.bio : "") || "";
  const isFriend = () => directoryInfo()?.is_friend ?? false;
  const status = () => memberInfo()?.status ?? "Offline";
  const roles = () => memberInfo()?.roles ?? [];
  const joinedAt = () => memberInfo()?.joined_at ?? 0;

  // close on escape or click outside
  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") closeProfileCard();
  }

  function handleClickOutside(e: MouseEvent) {
    if (cardRef && !cardRef.contains(e.target as Node)) {
      closeProfileCard();
    }
  }

  createEffect(() => {
    if (isOpen()) {
      // delay listener registration to avoid the triggering click from closing it
      requestAnimationFrame(() => {
        document.addEventListener("mousedown", handleClickOutside);
      });
      document.addEventListener("keydown", handleKeydown);
    }
  });

  onCleanup(() => {
    document.removeEventListener("mousedown", handleClickOutside);
    document.removeEventListener("keydown", handleKeydown);
  });

  // close and re-register listeners whenever the target changes
  createEffect(() => {
    if (!isOpen()) {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeydown);
    }
  });

  // compute position to stay within viewport
  const cardPosition = createMemo(() => {
    const t = target();
    if (!t) return { top: 0, left: 0 };

    const cardWidth = 320;
    const cardHeight = 340;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = t.anchorX + margin;
    let top = t.anchorY - cardHeight / 3;

    // flip horizontally if overflowing right
    if (left + cardWidth > vw - margin) {
      left = t.anchorX - cardWidth - margin;
    }

    // clamp vertically
    if (top < margin) top = margin;
    if (top + cardHeight > vh - margin) top = vh - cardHeight - margin;

    return { top, left };
  });

  async function handleToggleFriend() {
    const t = target();
    if (!t) return;

    try {
      if (isFriend()) {
        await tauri.removeFriend(t.peerId);
        unmarkAsFriend(t.peerId);
      } else {
        await tauri.addFriend(t.peerId);
        markAsFriend(t.peerId);
      }
    } catch (e) {
      console.error("failed to toggle friend:", e);
    }
  }

  async function handleCopyPeerId() {
    const t = target();
    if (!t) return;

    try {
      await navigator.clipboard.writeText(t.peerId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard api may fail outside secure contexts
    }
  }

  function handleOpenFullProfile() {
    const t = target();
    if (t) openProfileModal(t.peerId);
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

  return (
    <Show when={isOpen()}>
      <Portal>
        <div
          ref={cardRef}
          class="fixed z-2000 w-[320px] bg-gray-900 border border-white/20 animate-scale-in overflow-hidden"
          style={{
            top: `${cardPosition().top}px`,
            left: `${cardPosition().left}px`,
          }}
        >
          {/* header banner */}
          <div class="h-16 bg-linear-to-r from-orange/30 to-orange/10" />

          {/* avatar overlapping the banner */}
          <div class="px-4 -mt-8">
            <button
              type="button"
              class="cursor-pointer"
              onClick={handleOpenFullProfile}
            >
              <Avatar
                name={displayName()}
                size="xl"
                status={status()}
                showStatus
              />
            </button>
          </div>

          {/* user info */}
          <div class="px-4 pt-2 pb-3">
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="text-[18px] font-semibold text-white truncate hover:text-orange transition-colors duration-200 cursor-pointer"
                onClick={handleOpenFullProfile}
              >
                {displayName()}
              </button>
              <Show when={isSelf()}>
                <span class="text-[11px] font-mono text-white/40 shrink-0">
                  (you)
                </span>
              </Show>
            </div>

            {/* status indicator */}
            <div class="flex items-center gap-1.5 mt-1">
              <div class={`w-2 h-2 rounded-full ${statusColor()}`} />
              <span class="text-[12px] font-mono text-white/50">
                {statusLabel()}
              </span>
            </div>

            {/* bio */}
            <Show when={bio()}>
              <p class="text-[13px] text-white/70 mt-2 leading-relaxed line-clamp-3">
                {bio()}
              </p>
            </Show>
          </div>

          {/* metadata section */}
          <div class="border-t border-white/10 mx-4" />

          <div class="px-4 py-3 space-y-2">
            {/* roles */}
            <Show when={roles().length > 0}>
              <div>
                <span class="text-[11px] font-mono uppercase tracking-[0.05em] text-white/40">
                  roles
                </span>
                <div class="flex flex-wrap gap-1.5 mt-1">
                  {roles().map((role) => (
                    <span class="text-[11px] font-mono px-2 py-0.5 bg-orange/15 text-orange border border-orange/30">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
            </Show>

            {/* joined date */}
            <Show when={joinedAt() > 0}>
              <div>
                <span class="text-[11px] font-mono uppercase tracking-[0.05em] text-white/40">
                  member since
                </span>
                <p class="text-[12px] font-mono text-white/60 mt-0.5">
                  {formatTime(joinedAt())}
                </p>
              </div>
            </Show>

            {/* peer id */}
            <div>
              <span class="text-[11px] font-mono uppercase tracking-[0.05em] text-white/40">
                peer id
              </span>
              <button
                type="button"
                class="flex items-center gap-1.5 mt-0.5 group cursor-pointer"
                onClick={handleCopyPeerId}
              >
                <span class="text-[11px] font-mono text-white/40 group-hover:text-white/60 transition-colors duration-200 truncate max-w-55">
                  {target()?.peerId}
                </span>
                <Show
                  when={copied()}
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

          {/* action buttons */}
          <Show when={!isSelf()}>
            <div class="border-t border-white/10 mx-4" />
            <div class="px-4 py-3 flex gap-2">
              <button
                type="button"
                class={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium transition-colors duration-200 cursor-pointer ${
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
                      <UserPlus size={14} />
                      add friend
                    </>
                  }
                >
                  <UserMinus size={14} />
                  remove friend
                </Show>
              </button>
            </div>
          </Show>
        </div>
      </Portal>
    </Show>
  );
};

export default ProfileCard;
