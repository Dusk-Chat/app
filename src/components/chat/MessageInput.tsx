import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { Smile, Image, SendHorizontal } from "lucide-solid";
import { createEditor, EditorContent } from "tiptap-solid";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import { tiptapToMarkdown } from "../../lib/markdown";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";

interface MessageInputProps {
  channelName: string;
  onSend: (content: string) => void;
  onTyping?: () => void;
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [isEmpty, setIsEmpty] = createSignal(true);
  const [isFocused, setIsFocused] = createSignal(false);
  const [showEmojiPicker, setShowEmojiPicker] = createSignal(false);
  const [showGifPicker, setShowGifPicker] = createSignal(false);

  // custom extension to handle enter-to-send behavior
  const SendOnEnter = Extension.create({
    name: "sendOnEnter",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          handleSubmit();
          return true;
        },
      };
    },
  });

  const editor = createEditor({
    extensions: [
      StarterKit.configure({
        // disable features that dont make sense in a chat input
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        codeBlock: false,
        horizontalRule: false,
        dropcursor: false,
        gapcursor: false,
      }),
      Placeholder.configure({
        placeholder: `message #${props.channelName}`,
      }),
      SendOnEnter,
    ],
    editorProps: {
      attributes: {
        class: "dusk-editor-content",
      },
    },
    onUpdate: ({ editor: e }) => {
      setIsEmpty(e.isEmpty);
      props.onTyping?.();
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
  });

  function handleSubmit() {
    const e = editor();
    if (!e) return;

    // convert rich text to markdown for the wire format
    const markdown = tiptapToMarkdown(e.getJSON()).trim();
    if (!markdown) return;

    props.onSend(markdown);
    e.commands.clearContent();
    setIsEmpty(true);
  }

  function insertEmoji(emoji: string) {
    const e = editor();
    if (!e) return;
    e.chain().focus().insertContent(emoji).run();
  }

  function sendGif(gifUrl: string) {
    // gifs are sent as standalone messages containing just the url
    props.onSend(gifUrl);
    setShowGifPicker(false);
  }

  function toggleEmojiPicker() {
    setShowGifPicker(false);
    setShowEmojiPicker((v) => !v);
  }

  function toggleGifPicker() {
    setShowEmojiPicker(false);
    setShowGifPicker((v) => !v);
  }

  return (
    <div class="shrink-0 px-4 py-2 bg-black border-t border-white/10 relative">
      {/* picker popovers positioned above the input */}
      <Show when={showEmojiPicker()}>
        <div class="absolute bottom-full right-4 mb-2 z-50">
          <EmojiPicker
            onSelect={insertEmoji}
            onClose={() => setShowEmojiPicker(false)}
          />
        </div>
      </Show>

      <Show when={showGifPicker()}>
        <div class="absolute bottom-full right-4 mb-2 z-50">
          <GifPicker
            onSelect={sendGif}
            onClose={() => setShowGifPicker(false)}
          />
        </div>
      </Show>

      <div
        class={`dusk-editor-row ${isFocused() ? "dusk-editor-focused" : ""}`}
      >
        {/* editor area takes up remaining space */}
        <div class="flex-1 min-w-0">
          <Show when={editor()}>{(e) => <EditorContent editor={e()} />}</Show>
        </div>

        {/* action buttons pinned to the right */}
        <div class="dusk-editor-actions">
          <button
            type="button"
            class={`dusk-toolbar-btn ${showEmojiPicker() ? "active" : ""}`}
            onClick={toggleEmojiPicker}
            title="emoji"
          >
            <Smile size={20} />
          </button>
          <button
            type="button"
            class={`dusk-toolbar-btn ${showGifPicker() ? "active" : ""}`}
            onClick={toggleGifPicker}
            title="gif"
          >
            <Image size={20} />
          </button>
          <button
            type="button"
            class="dusk-send-btn"
            onClick={handleSubmit}
            disabled={isEmpty()}
            title="send message"
          >
            <SendHorizontal size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default MessageInput;
