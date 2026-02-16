import type { Component } from "solid-js";
import { Show, createSignal, createMemo } from "solid-js";
import type { ChatMessage } from "../../lib/types";
import { formatTime } from "../../lib/utils";
import { renderMarkdown, getStandaloneMediaKind } from "../../lib/markdown";
import type { MediaKind } from "../../lib/markdown";
import { removeMessage } from "../../stores/messages";
import { activeCommunityId } from "../../stores/communities";
import { identity } from "../../stores/identity";
import { isMentioned } from "../../lib/mentions";
import Avatar from "../common/Avatar";
import Lightbox from "../common/Lightbox";
import { openProfileCard } from "../../stores/ui";
import * as tauri from "../../lib/tauri";

interface MessageProps {
  message: ChatMessage;
  isGrouped: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
}

const Message: Component<MessageProps> = (props) => {
  const [contextMenu, setContextMenu] = createSignal<{
    x: number;
    y: number;
  } | null>(null);

  const currentUser = () => identity();
  const currentCommunityId = () => activeCommunityId();

  // pre-render markdown content so it only recalculates when content changes
  const renderedContent = createMemo(() =>
    renderMarkdown(props.message.content),
  );
  const mediaKind = createMemo<MediaKind>(() =>
    getStandaloneMediaKind(props.message.content),
  );

  // check if the current user is mentioned in this message
  const mentionsMe = createMemo(() => {
    const user = currentUser();
    if (!user) return false;
    return isMentioned(props.message.content, user.peer_id);
  });

  const [lightboxOpen, setLightboxOpen] = createSignal(false);

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

  // opens lightbox when clicking any media element in the message
  function handleMediaClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("dusk-media-clickable")) {
      e.stopPropagation();
      setLightboxOpen(true);
    }
  }

  // open profile card when clicking a mention span
  function handleContentClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.classList.contains("dusk-mention") && target.dataset.peerId) {
      e.stopPropagation();
      openProfileCard({
        peerId: target.dataset.peerId,
        displayName: target.textContent?.replace(/^@/, "") ?? "",
        anchorX: e.clientX,
        anchorY: e.clientY,
      });
    }
  }

  // close context menu on click outside
  if (typeof window !== "undefined") {
    window.addEventListener("click", closeContextMenu);
  }

  return (
    <div
      data-message-id={props.message.id}
      class={`flex items-start gap-4 transition-colors duration-200 px-4 ${
        mentionsMe() ? "dusk-msg-mentioned" : "hover:bg-gray-900"
      } ${props.isFirstInGroup ? "pt-2" : "pt-0.5"} ${props.isLastInGroup ? "pb-2" : "pb-0.5"}`}
      onContextMenu={handleContextMenu}
    >
      <Show
        when={props.isFirstInGroup}
        fallback={<div class="w-10 shrink-0" />}
      >
        <button
          type="button"
          class="w-10 shrink-0 cursor-pointer mt-0.5"
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

        <Show
          when={!mediaKind()}
          fallback={
            <div
              class={`dusk-msg-content ${mediaKind() === "image" ? "dusk-msg-image-wrapper" : "dusk-msg-video-wrapper"}`}
              innerHTML={renderedContent()}
              onClick={handleMediaClick}
            />
          }
        >
          <div
            class="dusk-msg-content"
            innerHTML={renderedContent()}
            onClick={handleContentClick}
          />
        </Show>
      </div>

      {/* media lightbox */}
      <Show when={mediaKind()}>
        <Lightbox
          isOpen={lightboxOpen()}
          onClose={() => setLightboxOpen(false)}
          src={props.message.content.trim()}
          type={mediaKind()!}
        />
      </Show>

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
