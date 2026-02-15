import type { Component } from "solid-js";
import { For, Show, createEffect, createSignal, onMount } from "solid-js";
import type { ChatMessage } from "../../lib/types";
import { isWithinGroupWindow, isDifferentDay, formatDaySeparator } from "../../lib/utils";
import Message from "./Message";
import { ArrowDown } from "lucide-solid";

interface MessageListProps {
  messages: ChatMessage[];
  onLoadMore?: () => void;
}

const MessageList: Component<MessageListProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  const [showScrollButton, setShowScrollButton] = createSignal(false);
  const [isAtBottom, setIsAtBottom] = createSignal(true);

  function scrollToBottom(smooth = true) {
    if (containerRef) {
      containerRef.scrollTo({
        top: containerRef.scrollHeight,
        behavior: smooth ? "smooth" : "instant",
      });
    }
  }

  function handleScroll() {
    if (!containerRef) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const atBottom = distanceFromBottom < 50;
    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);
  }

  // auto-scroll when new messages arrive if user is at the bottom
  createEffect(() => {
    void props.messages.length;
    if (isAtBottom()) {
      // defer to allow dom update
      requestAnimationFrame(() => scrollToBottom(true));
    }
  });

  // scroll to bottom on mount
  onMount(() => {
    requestAnimationFrame(() => scrollToBottom(false));
  });

  return (
    <div class="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        class="h-full overflow-y-auto"
        onScroll={handleScroll}
      >
        <div class="flex flex-col py-4">
          <For each={props.messages}>
            {(message, index) => {
              const prev = () =>
                index() > 0 ? props.messages[index() - 1] : undefined;
              const isFirstInGroup = () => {
                const p = prev();
                if (!p) return true;
                if (p.author_id !== message.author_id) return true;
                if (!isWithinGroupWindow(p.timestamp, message.timestamp))
                  return true;
                return false;
              };
              const isGrouped = () => !isFirstInGroup();
              const showDaySeparator = () => {
                const p = prev();
                if (!p) return true;
                return isDifferentDay(p.timestamp, message.timestamp);
              };

              return (
                <>
                  <Show when={showDaySeparator()}>
                    <div class="flex items-center gap-4 px-4 py-2 my-2">
                      <div class="flex-1 border-t border-white/10" />
                      <span class="text-[12px] font-mono text-white/40 uppercase tracking-[0.05em]">
                        {formatDaySeparator(message.timestamp)}
                      </span>
                      <div class="flex-1 border-t border-white/10" />
                    </div>
                  </Show>
                  <div class="animate-message-in">
                    <Message
                      message={message}
                      isGrouped={isGrouped()}
                      isFirstInGroup={isFirstInGroup()}
                    />
                  </div>
                </>
              );
            }}
          </For>

          <Show when={props.messages.length === 0}>
            <div class="flex flex-col items-center justify-center h-full py-16 text-white/40">
              <p class="text-[20px] font-medium">no messages yet</p>
              <p class="text-[14px] mt-2">be the first to say something</p>
            </div>
          </Show>
        </div>
      </div>

      <Show when={showScrollButton()}>
        <button
          type="button"
          class="absolute bottom-4 right-4 w-10 h-10 bg-orange rounded-full flex items-center justify-center text-white shadow-lg hover:bg-orange-hover transition-all duration-200 cursor-pointer animate-scale-in"
          onClick={() => scrollToBottom(true)}
        >
          <ArrowDown size={20} />
        </button>
      </Show>
    </div>
  );
};

export default MessageList;
