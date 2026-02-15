import type { Component } from "solid-js";
import { createSignal, For, Show, onMount, onCleanup } from "solid-js";
import { Search, X, Loader } from "lucide-solid";
import type { GifResult } from "../../lib/types";
import * as tauri from "../../lib/tauri";

// detect if running inside tauri (vs standalone vite dev)
const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

interface GifPickerProps {
  onSelect: (gifUrl: string) => void;
  onClose: () => void;
}

async function fetchSearch(query: string): Promise<GifResult[]> {
  if (!isTauri) return [];
  try {
    const res = await tauri.searchGifs(query, 30);
    return res.results || [];
  } catch (err) {
    console.error("gif search failed:", err);
    return [];
  }
}

async function fetchTrending(): Promise<GifResult[]> {
  if (!isTauri) return [];
  try {
    const res = await tauri.getTrendingGifs(30);
    return res.results || [];
  } catch (err) {
    console.error("gif trending failed:", err);
    return [];
  }
}

const GifPicker: Component<GifPickerProps> = (props) => {
  const [search, setSearch] = createSignal("");
  const [gifs, setGifs] = createSignal<GifResult[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [proxyAvailable, setProxyAvailable] = createSignal(true);
  let panelRef: HTMLDivElement | undefined;
  let searchRef: HTMLInputElement | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  onMount(async () => {
    searchRef?.focus();
    await loadTrending();

    // close on click outside
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef && !panelRef.contains(e.target as Node)) {
        props.onClose();
      }
    };
    setTimeout(() => {
      document.addEventListener("mousedown", handleClickOutside);
    }, 0);
    onCleanup(() => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (debounceTimer) clearTimeout(debounceTimer);
    });
  });

  async function loadTrending() {
    setLoading(true);
    try {
      const results = await fetchTrending();
      if (results.length === 0 && gifs().length === 0) {
        // no results on first load likely means proxy is unreachable
        setProxyAvailable(false);
      }
      setGifs(results);
    } catch {
      setProxyAvailable(false);
    }
    setLoading(false);
  }

  function handleSearchInput(value: string) {
    setSearch(value);
    if (debounceTimer) clearTimeout(debounceTimer);

    if (!value.trim()) {
      loadTrending();
      return;
    }

    // debounce search by 400ms
    debounceTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const results = await fetchSearch(value);
        setGifs(results);
        setProxyAvailable(true);
      } catch {
        console.error("gif search failed");
      }
      setLoading(false);
    }, 400);
  }

  function selectGif(gif: GifResult) {
    props.onSelect(gif.url);
    props.onClose();
  }

  return (
    <div ref={panelRef} class="dusk-picker-panel dusk-gif-panel">
      {/* header */}
      <div class="dusk-picker-header">
        <div class="dusk-picker-search">
          <Search size={14} class="text-white/40 shrink-0" />
          <input
            ref={searchRef}
            type="text"
            class="flex-1 bg-transparent text-[14px] text-white outline-none placeholder:text-white/30"
            placeholder="search gifs"
            value={search()}
            onInput={(e) => handleSearchInput(e.currentTarget.value)}
          />
          <Show when={search()}>
            <button
              type="button"
              class="text-white/40 hover:text-white cursor-pointer"
              onClick={() => handleSearchInput("")}
            >
              <X size={14} />
            </button>
          </Show>
        </div>
      </div>

      {/* content */}
      <div class="dusk-picker-grid-container">
        <Show
          when={proxyAvailable()}
          fallback={
            <div class="flex flex-col items-center justify-center py-12 px-4 text-center">
              <p class="text-[14px] text-white/50 mb-2">
                gif search unavailable
              </p>
              <p class="text-[12px] text-white/30 font-mono">
                not connected to relay
              </p>
            </div>
          }
        >
          <Show when={loading()}>
            <div class="flex items-center justify-center py-8">
              <Loader size={20} class="text-white/40 animate-spin" />
            </div>
          </Show>

          <Show when={!loading() && gifs().length === 0}>
            <div class="text-center text-white/30 text-[13px] py-8">
              <Show when={search()} fallback="no trending gifs available">
                no gifs found for "{search()}"
              </Show>
            </div>
          </Show>

          <Show when={!loading() && gifs().length > 0}>
            <div class="dusk-gif-grid">
              <For each={gifs()}>
                {(gif) => (
                  <button
                    type="button"
                    class="dusk-gif-item"
                    onClick={() => selectGif(gif)}
                    title={gif.title}
                  >
                    <img
                      src={gif.preview}
                      alt={gif.title}
                      loading="lazy"
                      class="w-full h-full object-cover"
                    />
                  </button>
                )}
              </For>
            </div>

            {/* klipy attribution */}
            <div class="text-center py-2">
              <span class="text-[10px] font-mono text-white/20">
                powered by klipy
              </span>
            </div>
          </Show>
        </Show>
      </div>
    </div>
  );
};

export default GifPicker;
