import type { Component } from "solid-js";
import { Show } from "solid-js";

interface TypingIndicatorProps {
  typingUsers: string[];
}

const TypingIndicator: Component<TypingIndicatorProps> = (props) => {
  const text = () => {
    const users = props.typingUsers;
    if (users.length === 0) return "";
    if (users.length === 1) return `${users[0]} is typing`;
    if (users.length === 2) return `${users[0]} and ${users[1]} are typing`;
    return "several people are typing";
  };

  return (
    <Show when={props.typingUsers.length > 0}>
      <div class="flex items-center gap-2 px-4 py-1.5 text-[12px] font-mono text-white/50">
        <div class="flex gap-1">
          <div class="w-1 h-1 rounded-full bg-orange typing-dot" />
          <div class="w-1 h-1 rounded-full bg-orange typing-dot" />
          <div class="w-1 h-1 rounded-full bg-orange typing-dot" />
        </div>
        <span>{text()}</span>
      </div>
    </Show>
  );
};

export default TypingIndicator;
