import type { Component } from "solid-js";
import { createSignal, Show } from "solid-js";
import { Smile, Image, SendHorizontal } from "lucide-solid";
import { createEditor, EditorContent } from "tiptap-solid";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import Mention from "@tiptap/extension-mention";
import { tiptapToMarkdown } from "../../lib/markdown";
import { members } from "../../stores/members";
import { identity } from "../../stores/identity";
import EmojiPicker from "./EmojiPicker";
import GifPicker from "./GifPicker";
import MentionList from "./MentionList";
import type { MentionItem } from "./MentionList";

interface MentionPeer {
  id: string;
  name: string;
  status?: "Online" | "Idle" | "Dnd" | "Offline";
}

interface MessageInputProps {
  channelName: string;
  onSend: (content: string) => void;
  onTyping?: () => void;
  // when provided, uses these peers for mention autocomplete instead of community members.
  // used in DM context where the members store is irrelevant
  mentionPeers?: MentionPeer[];
}

const MessageInput: Component<MessageInputProps> = (props) => {
  const [isEmpty, setIsEmpty] = createSignal(true);
  const [isFocused, setIsFocused] = createSignal(false);
  const [showEmojiPicker, setShowEmojiPicker] = createSignal(false);
  const [showGifPicker, setShowGifPicker] = createSignal(false);

  // mention autocomplete state driven by tiptap suggestion plugin
  const [showMentionList, setShowMentionList] = createSignal(false);
  const [mentionItems, setMentionItems] = createSignal<MentionItem[]>([]);
  const [mentionIndex, setMentionIndex] = createSignal(0);
  const [mentionClientRect, setMentionClientRect] = createSignal<
    (() => DOMRect | null) | null
  >(null);

  // stashed so we can call command() from MentionList selection
  let mentionCommand: ((props: { id: string; label: string }) => void) | null =
    null;

  // custom extension to handle enter-to-send behavior
  const SendOnEnter = Extension.create({
    name: "sendOnEnter",
    addKeyboardShortcuts() {
      return {
        Enter: () => {
          // dont send if mention list is open - enter selects a mention instead
          if (showMentionList()) return false;
          handleSubmit();
          return true;
        },
      };
    },
  });

  // build the mention items list from community members or dm peers
  function getMentionItems(query: string): MentionItem[] {
    const q = query.toLowerCase();
    const currentUser = identity();

    // dm context uses the explicit peer list passed via props
    if (props.mentionPeers) {
      const items: MentionItem[] = [];
      for (const peer of props.mentionPeers) {
        if (!q || peer.name.toLowerCase().includes(q)) {
          items.push({
            id: peer.id,
            label: peer.name,
            status: peer.status,
          });
        }
      }
      return items.slice(0, 10);
    }

    // community context uses the global members store
    const memberList = members();
    const items: MentionItem[] = [];

    // everyone option only makes sense in community channels
    if (!q || "everyone".includes(q)) {
      items.push({
        id: "everyone",
        label: "everyone",
        isEveryone: true,
      });
    }

    for (const member of memberList) {
      if (!q || member.display_name.toLowerCase().includes(q)) {
        items.push({
          id: member.peer_id,
          label: member.display_name,
          status: member.status,
        });
      }
    }

    return items.slice(0, 10);
  }

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
      Mention.configure({
        HTMLAttributes: {
          class: "dusk-mention",
        },
        renderText({ node }) {
          return `@${node.attrs.label ?? node.attrs.id}`;
        },
        suggestion: {
          char: "@",
          allowSpaces: false,
          items: ({ query }) => getMentionItems(query),
          render: () => {
            return {
              onStart: (suggestionProps) => {
                setMentionItems(suggestionProps.items);
                setMentionIndex(0);
                setMentionClientRect(() => suggestionProps.clientRect ?? null);
                mentionCommand = suggestionProps.command;
                setShowMentionList(true);
              },
              onUpdate: (suggestionProps) => {
                setMentionItems(suggestionProps.items);
                // clamp index if items shrunk
                setMentionIndex((prev) =>
                  Math.min(prev, Math.max(0, suggestionProps.items.length - 1)),
                );
                setMentionClientRect(() => suggestionProps.clientRect ?? null);
                mentionCommand = suggestionProps.command;
              },
              onKeyDown: ({ event }) => {
                if (event.key === "ArrowDown") {
                  setMentionIndex((prev) =>
                    prev >= mentionItems().length - 1 ? 0 : prev + 1,
                  );
                  return true;
                }
                if (event.key === "ArrowUp") {
                  setMentionIndex((prev) =>
                    prev <= 0 ? mentionItems().length - 1 : prev - 1,
                  );
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  const items = mentionItems();
                  const idx = mentionIndex();
                  if (items[idx] && mentionCommand) {
                    mentionCommand({
                      id: items[idx].id,
                      label: items[idx].label,
                    });
                  }
                  return true;
                }
                if (event.key === "Escape") {
                  setShowMentionList(false);
                  return true;
                }
                return false;
              },
              onExit: () => {
                setShowMentionList(false);
                setMentionItems([]);
                setMentionIndex(0);
                mentionCommand = null;
              },
            };
          },
        },
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

  function handleMentionSelect(item: MentionItem) {
    if (mentionCommand) {
      mentionCommand({ id: item.id, label: item.label });
    }
  }

  // compute mention list position relative to the input container
  function mentionListStyle(): string {
    const clientRectFn = mentionClientRect();
    if (!clientRectFn) return "";

    const rect = clientRectFn();
    if (!rect) return "";

    // position the dropdown above the cursor
    return `position: fixed; left: ${rect.left}px; bottom: ${window.innerHeight - rect.top + 4}px; z-index: 50;`;
  }

  return (
    <div class="shrink-0 px-4 py-2 bg-black border-t border-white/10 relative">
      {/* mention autocomplete positioned at cursor */}
      <Show when={showMentionList() && mentionItems().length > 0}>
        <div style={mentionListStyle()}>
          <MentionList
            items={mentionItems()}
            selectedIndex={mentionIndex()}
            onSelect={handleMentionSelect}
          />
        </div>
      </Show>

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
