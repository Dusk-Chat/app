import type { Component } from "solid-js";
import { Show } from "solid-js";
import { AtSign } from "lucide-solid";
import { activeDMConversation, dmMessages } from "../../stores/dms";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import Avatar from "../common/Avatar";

interface DMChatAreaProps {
  onSendDM: (content: string) => void;
}

const DMChatArea: Component<DMChatAreaProps> = (props) => {
  const dm = () => activeDMConversation();

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
                  dm()!.status === "Online"
                    ? "text-success"
                    : dm()!.status === "Idle"
                      ? "text-warning"
                      : "text-white/30"
                }`}
              >
                {dm()!.status.toLowerCase()}
              </span>
            </Show>
          </div>
        </div>
      </div>

      {/* conversation history */}
      <Show
        when={dmMessages().length > 0}
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
        <MessageList messages={dmMessages()} />
      </Show>

      {/* message input */}
      <Show when={dm()}>
        <MessageInput
          channelName={dm()!.display_name}
          onSend={props.onSendDM}
          onTyping={() => {}}
        />
      </Show>
    </div>
  );
};

export default DMChatArea;
