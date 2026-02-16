import type { Component } from "solid-js";
import { For, Show, createEffect } from "solid-js";
import Avatar from "../common/Avatar";

export interface MentionItem {
  id: string;
  label: string;
  isEveryone?: boolean;
  status?: "Online" | "Idle" | "Dnd" | "Offline";
}

interface MentionListProps {
  items: MentionItem[];
  selectedIndex: number;
  onSelect: (item: MentionItem) => void;
}

const MentionList: Component<MentionListProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;

  // scroll the selected item into view when selection changes
  createEffect(() => {
    const index = props.selectedIndex;
    if (!containerRef) return;

    const items = containerRef.querySelectorAll("[data-mention-item]");
    const selected = items[index];
    if (selected) {
      selected.scrollIntoView({ block: "nearest" });
    }
  });

  return (
    <div
      ref={containerRef}
      class="dusk-mention-list bg-[#0a0a0a] border border-white/20 py-1 max-h-[264px] overflow-y-auto w-[280px] shadow-[0_8px_32px_rgba(0,0,0,0.6)] animate-fade-in"
    >
      <Show
        when={props.items.length > 0}
        fallback={
          <div class="px-3 py-2 text-[13px] text-white/40">
            no matching members
          </div>
        }
      >
        <For each={props.items}>
          {(item, index) => (
            <button
              type="button"
              data-mention-item
              class={`w-full flex items-center gap-3 px-3 py-2 text-left transition-colors duration-200 cursor-pointer ${
                index() === props.selectedIndex
                  ? "bg-white/10"
                  : "hover:bg-white/5"
              }`}
              onMouseDown={(e) => {
                // prevent editor blur
                e.preventDefault();
                props.onSelect(item);
              }}
            >
              <Show
                when={!item.isEveryone}
                fallback={
                  <div class="w-8 h-8 shrink-0 flex items-center justify-center bg-orange/20 text-orange text-[14px] font-bold rounded-full">
                    @
                  </div>
                }
              >
                <Avatar
                  name={item.label}
                  size="sm"
                  status={item.status}
                  showStatus={true}
                />
              </Show>
              <div class="flex-1 min-w-0">
                <span class="text-[14px] font-medium text-white truncate block">
                  {item.isEveryone ? "@everyone" : item.label}
                </span>
                <Show when={item.isEveryone}>
                  <span class="text-[11px] text-white/40">
                    notify all members
                  </span>
                </Show>
              </div>
            </button>
          )}
        </For>
      </Show>
    </div>
  );
};

export default MentionList;
