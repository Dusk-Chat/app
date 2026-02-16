import type { Component } from "solid-js";
import { Show, createMemo, createSignal, createEffect, on } from "solid-js";
import { Phone, Pin, Search } from "lucide-solid";
import {
  activeDMConversation,
  dmMessages,
  dmTypingPeers,
  prependDMMessages,
  setDMMessages,
} from "../../stores/dms";
import { onlinePeerIds } from "../../stores/members";
import { identity } from "../../stores/identity";
import VirtualMessageList from "../chat/VirtualMessageList";
import MessageInput from "../chat/MessageInput";
import TypingIndicator from "../chat/TypingIndicator";
import DMSearchPanel from "../chat/DMSearchPanel";
import Avatar from "../common/Avatar";
import IconButton from "../common/IconButton";
import type { ChatMessage } from "../../lib/types";
import * as tauri from "../../lib/tauri";

interface DMChatAreaProps {
  onSendDM: (content: string) => void;
  onTyping: () => void;
}

const HISTORY_PAGE_SIZE = 80;
const JUMP_WINDOW_SIZE = 500;

const DMChatArea: Component<DMChatAreaProps> = (props) => {
  const [searchOpen, setSearchOpen] = createSignal(false);
  const [focusMessageId, setFocusMessageId] = createSignal<string | null>(null);
  const [loadingHistory, setLoadingHistory] = createSignal(false);
  const [hasMoreHistory, setHasMoreHistory] = createSignal(true);

  const dm = () => activeDMConversation();

  createEffect(
    on(
      () => dm()?.peer_id,
      () => {
        setFocusMessageId(null);
        setLoadingHistory(false);
        setHasMoreHistory(true);
      },
    ),
  );

  // adapt direct messages to chat message shape so we can share rendering logic
  const adaptedMessages = createMemo((): ChatMessage[] =>
    dmMessages().map((message) => ({
      id: message.id,
      channel_id: `dm_${message.from_peer === dm()?.peer_id ? message.from_peer : message.to_peer}`,
      author_id: message.from_peer,
      author_name: message.from_display_name,
      content: message.content,
      timestamp: message.timestamp,
      edited: false,
    })),
  );

  // derive peer online status from the members store or directory
  const peerStatus = createMemo(() => {
    const peerId = dm()?.peer_id;
    if (!peerId) return "offline";
    if (onlinePeerIds().has(peerId)) return "online";
    return "offline";
  });

  function focusMessage(messageId: string) {
    setFocusMessageId(null);
    requestAnimationFrame(() => {
      setFocusMessageId(messageId);
    });
  }

  async function loadOlderMessages() {
    const peerId = dm()?.peer_id;
    if (!peerId) return;
    if (loadingHistory() || !hasMoreHistory()) return;

    const currentMessages = dmMessages();
    if (currentMessages.length === 0) return;

    const oldestTimestamp = currentMessages[0].timestamp;

    setLoadingHistory(true);
    try {
      const olderMessages = await tauri.getDMMessages(
        peerId,
        oldestTimestamp,
        HISTORY_PAGE_SIZE,
      );

      if (olderMessages.length === 0) {
        setHasMoreHistory(false);
        return;
      }

      prependDMMessages(olderMessages);

      if (olderMessages.length < HISTORY_PAGE_SIZE) {
        setHasMoreHistory(false);
      }
    } catch (error) {
      console.error("failed to load older dm messages:", error);
    } finally {
      setLoadingHistory(false);
    }
  }

  // scroll to a message by id and lazy-load a focused history window if needed
  async function handleJumpToMessage(messageId: string, timestamp: number) {
    const peerId = dm()?.peer_id;
    if (!peerId) return;

    const alreadyLoaded = dmMessages().some((message) => message.id === messageId);
    if (alreadyLoaded) {
      focusMessage(messageId);
      return;
    }

    try {
      const aroundTarget = await tauri.getDMMessages(
        peerId,
        timestamp + 1,
        JUMP_WINDOW_SIZE,
      );

      if (aroundTarget.length > 0) {
        setDMMessages(aroundTarget);
        setHasMoreHistory(aroundTarget.length >= JUMP_WINDOW_SIZE);
      }

      focusMessage(messageId);
    } catch (error) {
      console.error("failed to jump to dm search result:", error);
    }
  }

  // typing indicator names
  const typingNames = createMemo(() => {
    const typing = dmTypingPeers();
    if (typing.length === 0) return [];
    const peer = dm();
    if (!peer) return [];
    // for dms theres only ever one person who can be typing
    return typing.includes(peer.peer_id) ? [peer.display_name] : [];
  });

  return (
    <div class="flex-1 flex flex-col min-w-0 bg-black">
      {/* dm header */}
      <div class="h-15 shrink-0 border-b border-white/10 flex flex-col justify-end">
        <div class="h-12 flex items-center justify-between px-4">
          <div class="flex items-center gap-3 min-w-0">
            <Show when={dm()}>
              <Avatar
                name={dm()!.display_name}
                size="sm"
                status={peerStatus() === "online" ? "Online" : "Offline"}
                showStatus
              />
              <span class="text-[16px] font-bold text-white truncate">
                {dm()!.display_name}
              </span>
            </Show>
          </div>

          <div class="flex items-center gap-1 shrink-0">
            <IconButton
              label="Search messages"
              active={searchOpen()}
              onClick={() => setSearchOpen((value) => !value)}
            >
              <Search size={18} />
            </IconButton>
            <IconButton label="Start call">
              <Phone size={18} />
            </IconButton>
            <IconButton label="Pinned messages">
              <Pin size={18} />
            </IconButton>
          </div>
        </div>
      </div>

      {/* search panel */}
      <Show when={searchOpen() && dm()}>
        <DMSearchPanel
          peerId={dm()!.peer_id}
          peerName={dm()!.display_name}
          onClose={() => setSearchOpen(false)}
          onJumpToMessage={handleJumpToMessage}
        />
      </Show>

      {/* conversation history */}
      <Show
        when={adaptedMessages().length > 0}
        fallback={
          <div class="flex-1 flex flex-col items-center justify-center">
            <Show when={dm()}>
              <Avatar name={dm()!.display_name} size="xl" />
              <p class="text-[24px] font-bold text-white mt-4">
                {dm()!.display_name}
              </p>
              <p class="text-[14px] text-white/40 mt-1">
                this is the beginning of your conversation with{" "}
                <span class="text-white font-medium">{dm()!.display_name}</span>
              </p>
            </Show>
          </div>
        }
      >
        <VirtualMessageList
          messages={adaptedMessages()}
          conversationKey={dm()?.peer_id ?? ""}
          focusMessageId={focusMessageId()}
          onLoadMore={loadOlderMessages}
        />
      </Show>

      {/* typing indicator */}
      <Show when={typingNames().length > 0}>
        <TypingIndicator typingUsers={typingNames()} />
      </Show>

      {/* message input */}
      <Show when={dm()}>
        <MessageInput
          channelName={dm()!.display_name}
          onSend={props.onSendDM}
          onTyping={props.onTyping}
          mentionPeers={[
            {
              id: dm()!.peer_id,
              name: dm()!.display_name,
              status: onlinePeerIds().has(dm()!.peer_id) ? "Online" : "Offline",
            },
            ...(identity()
              ? [
                  {
                    id: identity()!.peer_id,
                    name: identity()!.display_name,
                    status: "Online" as const,
                  },
                ]
              : []),
          ]}
        />
      </Show>
    </div>
  );
};

export default DMChatArea;
