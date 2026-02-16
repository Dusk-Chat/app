import type { Component } from "solid-js";
import { Show, createMemo, createSignal } from "solid-js";
import { Phone, Pin, Search } from "lucide-solid";
import {
  activeDMConversation,
  dmMessages,
  dmTypingPeers,
  setDMMessages,
} from "../../stores/dms";
import { onlinePeerIds } from "../../stores/members";
import { identity } from "../../stores/identity";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import TypingIndicator from "../chat/TypingIndicator";
import DMSearchPanel from "../chat/DMSearchPanel";
import Avatar from "../common/Avatar";
import IconButton from "../common/IconButton";
import type { ChatMessage, DirectMessage } from "../../lib/types";

interface DMChatAreaProps {
  onSendDM: (content: string) => void;
  onTyping: () => void;
}

const DMChatArea: Component<DMChatAreaProps> = (props) => {
  const [searchOpen, setSearchOpen] = createSignal(false);
  const dm = () => activeDMConversation();

  // adapt DirectMessage[] to ChatMessage[] so the existing MessageList works
  const adaptedMessages = createMemo((): ChatMessage[] =>
    dmMessages().map((m) => ({
      id: m.id,
      channel_id: `dm_${m.from_peer === dm()?.peer_id ? m.from_peer : m.to_peer}`,
      author_id: m.from_peer,
      author_name: m.from_display_name,
      content: m.content,
      timestamp: m.timestamp,
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

  // scroll to a message by id, loading full history into the store if needed
  function handleJumpToMessage(
    messageId: string,
    allMessages: DirectMessage[],
  ) {
    const alreadyLoaded = dmMessages().some((m) => m.id === messageId);

    if (!alreadyLoaded) {
      // replace the store with the full history so the target is in the dom
      setDMMessages(allMessages);
    }

    // wait for the dom to update then scroll and highlight
    requestAnimationFrame(() => {
      const el = document.querySelector(
        `[data-message-id="${messageId}"]`,
      ) as HTMLElement | null;
      if (!el) return;

      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.add("dusk-msg-search-highlight");
      setTimeout(() => el.classList.remove("dusk-msg-search-highlight"), 2000);
    });
  }

  // typing indicator names
  const typingNames = createMemo(() => {
    const typing = dmTypingPeers();
    if (typing.length === 0) return [];
    const peer = dm();
    if (!peer) return [];
    // for dms there's only ever one person who can be typing
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
              onClick={() => setSearchOpen((v) => !v)}
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
          myPeerId={identity()?.peer_id ?? ""}
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
        <MessageList messages={adaptedMessages()} />
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
