import type { Component } from "solid-js";
import { createSignal } from "solid-js";
import { SendHorizontal } from "lucide-solid";

interface MessageInputProps {
  channelName: string;
  onSend: (content: string) => void;
  onTyping?: () => void;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [value, setValue] = createSignal("");
  let textareaRef: HTMLTextAreaElement | undefined;

  function handleSubmit() {
    const content = value().trim();
    if (!content) return;
    props.onSend(content);
    setValue("");
    // reset textarea height
    if (textareaRef) {
      textareaRef.style.height = "auto";
    }
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: InputEvent) {
    const target = e.target as HTMLTextAreaElement;
    setValue(target.value);

    // auto-resize textarea
    target.style.height = "auto";
    target.style.height = Math.min(target.scrollHeight, 200) + "px";

    // fire typing indicator (debounced by the store)
    props.onTyping?.();
  }

  return (
    <div class="shrink-0 px-4 py-2 bg-black border-t border-white/10">
      <div class="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          class="flex-1 bg-gray-800 border-2 border-white/20 text-white text-[16px] leading-[22px] px-4 py-2 resize-none outline-none placeholder:font-mono placeholder:text-white/40 focus:border-orange transition-colors duration-200 min-h-[47px] max-h-[200px]"
          style={{ "field-sizing": "content" }}
          rows={1}
          placeholder={`message #${props.channelName}`}
          value={value()}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          class="w-10 h-10 shrink-0 flex items-center justify-center bg-orange text-white hover:bg-orange-hover transition-colors duration-200 cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
          onClick={handleSubmit}
          disabled={!value().trim()}
        >
          <SendHorizontal size={20} />
        </button>
      </div>
    </div>
  );
};

export default MessageInput;
