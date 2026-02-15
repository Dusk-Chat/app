import type { Component } from "solid-js";
import { Show, createSignal } from "solid-js";
import type { ChatMessage } from "../../lib/types";
import { formatTime, formatTimeShort } from "../../lib/utils";
import { removeMessage } from "../../stores/messages";
import { activeCommunityId } from "../../stores/communities";
import { identity } from "../../stores/identity";
import Avatar from "../common/Avatar";
import { openProfileCard } from "../../stores/ui";
import * as tauri from "../../lib/tauri";

interface MessageProps {
  message: ChatMessage;
  isGrouped: boolean;
  isFirstInGroup: boolean;
}

const Message: Component<MessageProps> = (props) => {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
  } | null>(null);

  const currentUser = () => identity();
  const currentCommunityId = () => activeCommunityId();

  const isOwner = () => {
    const user = currentUser();
    return user?.peer_id === props.message.author_id;
  };

  function handleContextMenu(e: MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  function closeContextMenu() {
    setContextMenu(null);
  }

  async function handleDeleteMessage() {
    const communityId = currentCommunityId();
    if (!communityId || !isOwner()) return;

    try {
      await tauri.deleteMessage(communityId, props.message.id);
      removeMessage(props.message.id);
    } catch (e) {
      console.error("failed to delete message:", e);
    }

    closeContextMenu();
  }

  function handleProfileClick(e: MouseEvent) {
    e.stopPropagation();
    openProfileCard({
      peerId: props.message.author_id,
      displayName: props.message.author_name,
      anchorX: e.clientX,
      anchorY: e.clientY,
    });
  }

  // close context menu on click outside
  if (typeof window !== "undefined") {
    window.addEventListener("click", closeContextMenu);
  }

  return (
    <div
      class={`flex gap-4 hover:bg-gray-900 transition-colors duration-200 ${
        props.isFirstInGroup ? "pt-4 px-4 pb-1" : "px-4 py-0.5"
      }`}
      onContextMenu={handleContextMenu}
    >
      <Show
        when={props.isFirstInGroup}
        fallback={
          <div class="w-10 shrink-0 flex items-start justify-center">
            <span class="text-[11px] font-mono text-white/0 hover:text-white/40 transition-colors duration-200 leading-[22px]">
              {formatTimeShort(props.message.timestamp)}
            </span>
          </div>
        }
      >
        <button
          type="button"
          class="w-10 shrink-0 pt-0.5 cursor-pointer"
          onClick={handleProfileClick}
        >
          <Avatar name={props.message.author_name} size="md" />
        </button>
      </Show>

      <div class="flex-1 min-w-0">
        <Show when={props.isFirstInGroup}>
          <div class="flex items-baseline gap-2 mb-0.5">
            <button
              type="button"
              class="text-[16px] font-medium text-white hover:text-orange transition-colors duration-200 cursor-pointer"
              onClick={handleProfileClick}
            >
              {props.message.author_name}
            </button>
            <span class="text-[12px] font-mono text-white/50">
              {formatTime(props.message.timestamp)}
            </span>
            <Show when={props.message.edited}>
              <span class="text-[11px] font-mono text-white/30">(edited)</span>
            </Show>
          </div>
        </Show>

        <p class="text-[16px] leading-[22px] text-white/90 break-words whitespace-pre-wrap m-0">
          {props.message.content}
        </p>
      </div>

      {/* context menu */}
      <Show when={contextMenu()}>
        {(menu) => (
          <div
            class="fixed bg-gray-800 border border-white/20 py-1 z-[2000] min-w-[120px]"
            style={{ left: `${menu().x}px`, top: `${menu().y}px` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div class="px-3 py-1.5 text-[12px] text-white/60 border-b border-white/10">
              message actions
            </div>
            <Show when={isOwner()}>
              <button
                type="button"
                class="w-full px-3 py-1.5 text-[13px] text-left text-red-400 hover:bg-gray-700 transition-colors duration-200 cursor-pointer"
                onClick={handleDeleteMessage}
              >
                delete message
              </button>
            </Show>
            <Show when={!isOwner()}>
              <div class="px-3 py-1.5 text-[12px] text-white/30">
                no actions available
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};

export default Message;
