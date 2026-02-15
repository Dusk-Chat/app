import type { Component } from "solid-js";
import { Show } from "solid-js";
import { activeChannel } from "../../stores/channels";
import { messages } from "../../stores/messages";
import { typingUserNames } from "../../stores/members";
import MessageList from "../chat/MessageList";
import MessageInput from "../chat/MessageInput";
import TypingIndicator from "../chat/TypingIndicator";

interface ChatAreaProps {
  onSendMessage: (content: string) => void;
  onTyping: () => void;
}

// voice channels are joined inline from the sidebar and no longer
// render a full-screen view here -- the chat area always shows
// the selected text channel
const ChatArea: Component<ChatAreaProps> = (props) => {
  const channel = () => activeChannel();

  return (
    <div class="flex-1 flex flex-col min-w-0 bg-black">
      <Show
        when={channel()}
        fallback={
          <div class="flex-1 flex items-center justify-center">
            <div class="text-center text-white/30">
              <p class="text-[32px] font-bold mb-2">welcome to dusk</p>
              <p class="text-[16px]">select a community and channel to start chatting</p>
            </div>
          </div>
        }
      >
        <MessageList messages={messages()} />
        <TypingIndicator typingUsers={typingUserNames()} />
        <MessageInput
          channelName={channel()!.name}
          onSend={props.onSendMessage}
          onTyping={props.onTyping}
        />
      </Show>
    </div>
  );
};

export default ChatArea;
