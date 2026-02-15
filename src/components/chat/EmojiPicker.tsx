import type { Component } from "solid-js";
import {
  createSignal,
  For,
  Show,
  createMemo,
  onMount,
  onCleanup,
} from "solid-js";
import { Search, X } from "lucide-solid";
import {
  EMOJI_CATEGORIES,
  getRecentEmojis,
  addRecentEmoji,
} from "../../lib/emoji-data";

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

const EmojiPicker: Component<EmojiPickerProps> = (props) => {
  const [search, setSearch] = createSignal("");
  const [activeCategory, setActiveCategory] = createSignal("smileys");
  const [recentEmojis, setRecentEmojis] = createSignal<string[]>([]);
  let panelRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;

  onMount(() => {
    setRecentEmojis(getRecentEmojis());
    searchRef?.focus();

    // close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef && !panelRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    // defer to avoid the click that opened the picker from closing it
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
    });
  });

  // filter emojis based on search (crude match on category name + position)
  const filteredCategories = createMemo(() => {
    const q = search().toLowerCase();
    if (!q) return null;

    // flatten all emojis and filter based on a simple approach
    // since we dont have emoji names, search filters by category
    const matched: string[] = [];
    for (const cat of EMOJI_CATEGORIES) {
      if (cat.name.includes(q) || cat.id.includes(q)) {
        matched.push(...cat.emojis);
      }
    }

    // also search recent
    const recent = recentEmojis();
    if ("recent".includes(q)) {
      matched.push(...recent);
    }

    return matched;
  });

  function selectEmoji(emoji: string) {
    addRecentEmoji(emoji);
    setRecentEmojis(getRecentEmojis());
    props.onSelect(emoji);
  }

  function scrollToCategory(catId: string) {
    setActiveCategory(catId);
    setSearch("");
    const el = document.getElementById(`emoji-cat-${catId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div ref={panelRef} class="dusk-picker-panel">
      {/* header */}
      <div class="dusk-picker-header">
        <div class="dusk-picker-search">
          <Search size={14} class="text-white/40 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            class="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
            placeholder="search emoji"
            value={search()}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
          <Show when={search()}>
            <button
              type="button"
              class="text-white/40 hover:text-white cursor-pointer"
              onClick={() => setSearch("")}
            >
              <X size={14} />
            </button>
          </Show>
        </div>
      </div>

      {/* category tabs */}
      <Show when={!search()}>
        <div class="dusk-picker-tabs">
          <Show when={recentEmojis().length > 0}>
            <button
              type="button"
              class={`dusk-picker-tab ${activeCategory() === "recent" ? "active" : ""}`}
              onClick={() => scrollToCategory("recent")}
              title="recently used"
            >
              {"\u{1F552}"}
            </button>
          </Show>
          <For each={EMOJI_CATEGORIES}>
            {(cat) => (
              <button
                type="button"
                class={`dusk-picker-tab ${activeCategory() === cat.id ? "active" : ""}`}
                onClick={() => scrollToCategory(cat.id)}
                title={cat.name}
              >
                {cat.icon}
              </button>
            )}
          </For>
        </div>
      </Show>

      {/* emoji grid */}
      <div class="dusk-picker-grid-container">
        <Show
          when={!search()}
          fallback={
            <div class="p-2">
              <Show
                when={filteredCategories()?.length}
                fallback={
                  <div class="text-center text-white/30 text-[13px] py-8">
                    no emojis found
                  </div>
                }
              >
                <div class="dusk-emoji-grid">
                  <For each={filteredCategories()}>
                    {(emoji) => (
                      <button
                        type="button"
                        class="dusk-emoji-btn"
                        onClick={() => selectEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    )}
                  </For>
                </div>
              </Show>
            </div>
          }
        >
          {/* recent */}
          <Show when={recentEmojis().length > 0}>
            <div id="emoji-cat-recent" class="p-2">
              <div class="dusk-picker-label">recently used</div>
              <div class="dusk-emoji-grid">
                <For each={recentEmojis()}>
                  {(emoji) => (
                    <button
                      type="button"
                      class="dusk-emoji-btn"
                      onClick={() => selectEmoji(emoji)}
                    >
                      {emoji}
                    </button>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* categories */}
          <For each={EMOJI_CATEGORIES}>
            {(cat) => (
              <div id={`emoji-cat-${cat.id}`} class="p-2">
                <div class="dusk-picker-label">{cat.name}</div>
                <div class="dusk-emoji-grid">
                  <For each={cat.emojis}>
                    {(emoji) => (
                      <button
                        type="button"
                        class="dusk-emoji-btn"
                        onClick={() => selectEmoji(emoji)}
                      >
                        {emoji}
                      </button>
                    )}
                  </For>
                </div>
              </div>
            )}
          </For>
        </Show>
      </div>
    </div>
  );
};

export default EmojiPicker;
