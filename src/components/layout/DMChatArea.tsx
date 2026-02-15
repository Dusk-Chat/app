import type { Component } from "solid-js";
import { Show, createMemo } from "solid-js";
import { AtSign } from "lucide-solid";
import {
  activeDMConversation,
  dmMessages,
  dmTypingPeers,
} from "../../stores/dms";
import { onlinePeerIds } from "../../stores/members";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import TypingIndicator from "../chat/TypingIndicator";
import Avatar from "../common/Avatar";
import type { ChatMessage } from "../../lib/types";

interface DMChatAreaProps {
  onSendDM: (content: string) => void;
  onTyping: () => void;
}

const DMChatArea: Component<DMChatAreaProps> = (props) => {
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
          <div class="flex items-center gap-2 min-w-0">
            <Show when={dm()}>
              <AtSign size={20} class="shrink-0 text-white/40" />
              <span class="text-[16px] font-bold text-white truncate">
                {dm()!.display_name}
              </span>
              <span
                class={`text-[12px] font-mono ml-1 ${
                  peerStatus() === "online" ? "text-success" : "text-white/30"
                }`}
              >
                {peerStatus()}
              </span>
            </Show>
          </div>
        </div>
      </div>

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
        />
      </Show>
    </div>
  );
};

export default DMChatArea;
