import type { Component } from "solid-js";
import {
  createSignal,
  createMemo,
  createEffect,
  onCleanup,
  onMount,
  Show,
  For,
} from "solid-js";
import {
  Search,
  X,
  User,
  Calendar,
  Image,
  AtSign,
  Link,
  FileText,
  ChevronDown,
  ChevronUp,
  Loader2,
} from "lucide-solid";
import type {
  DMSearchFrom,
  DMSearchMedia,
  DirectMessage,
} from "../../lib/types";
import { formatTime, formatDaySeparator } from "../../lib/utils";
import * as tauri from "../../lib/tauri";

const SEARCH_LIMIT = 300;
const RESULT_ROW_HEIGHT = 56;
const RESULT_OVERSCAN = 6;

interface DMSearchPanelProps {
  peerId: string;
  peerName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: string, timestamp: number) => void;
}

const DMSearchPanel: Component<DMSearchPanelProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [fromFilter, setFromFilter] = createSignal<DMSearchFrom>("anyone");
  const [mediaFilter, setMediaFilter] = createSignal<DMSearchMedia | null>(null);
  const [mentionsOnly, setMentionsOnly] = createSignal(false);
  const [dateAfter, setDateAfter] = createSignal<string>("");
  const [dateBefore, setDateBefore] = createSignal<string>("");
  const [showFilters, setShowFilters] = createSignal(false);
  const [results, setResults] = createSignal<DirectMessage[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [resultScrollTop, setResultScrollTop] = createSignal(0);
  const [resultViewportHeight, setResultViewportHeight] = createSignal(320);

  let inputRef: HTMLInputElement | undefined;
  let resultsRef: HTMLDivElement | undefined;
  let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
  let activeSearchId = 0;

  // focus the search field when the panel opens
  onMount(() => {
    inputRef?.focus();
  });

  onCleanup(() => {
    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
    }
    activeSearchId += 1;
  });

  const hasActiveFilters = createMemo(() => {
    return (
      fromFilter() !== "anyone" ||
      mediaFilter() !== null ||
      mentionsOnly() ||
      dateAfter() !== "" ||
      dateBefore() !== ""
    );
  });

  createEffect(() => {
    const textQuery = query().trim();
    const from = fromFilter();
    const media = mediaFilter();
    const mentions = mentionsOnly();
    const after = dateAfter();
    const before = dateBefore();
    const hasFilters = hasActiveFilters();

    if (searchDebounceTimer) {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = undefined;
    }

    if (!textQuery && !hasFilters) {
      setLoading(false);
      setResults([]);
      return;
    }

    const searchId = ++activeSearchId;
    setLoading(true);

    searchDebounceTimer = setTimeout(async () => {
      const dateAfterTs = after ? new Date(after).getTime() : null;
      const dateBeforeTs = before
        ? new Date(before).getTime() + 86_399_999
        : null;

      try {
        const nextResults = await tauri.searchDMMessages(props.peerId, {
          query: textQuery || undefined,
          from_filter: from,
          media_filter: media,
          mentions_only: mentions,
          date_after: dateAfterTs,
          date_before: dateBeforeTs,
          limit: SEARCH_LIMIT,
        });

        if (searchId !== activeSearchId) return;

        setResultScrollTop(0);
        if (resultsRef) {
          resultsRef.scrollTop = 0;
          setResultViewportHeight(resultsRef.clientHeight || 320);
        }
        setResults(nextResults);
      } catch (error) {
        if (searchId !== activeSearchId) return;
        console.error("failed to search dm messages:", error);
        setResults([]);
      } finally {
        if (searchId === activeSearchId) {
          setLoading(false);
        }
      }
    }, 120);
  });

  const totalResultHeight = createMemo(
    () => results().length * RESULT_ROW_HEIGHT,
  );

  const visibleResults = createMemo(() => {
    const rows = results();
    const viewport = resultViewportHeight();
    const scrollTop = resultScrollTop();

    const startIndex = Math.max(
      0,
      Math.floor(scrollTop / RESULT_ROW_HEIGHT) - RESULT_OVERSCAN,
    );
    const endIndex = Math.min(
      rows.length,
      Math.ceil((scrollTop + viewport) / RESULT_ROW_HEIGHT) + RESULT_OVERSCAN,
    );

    const slice = rows.slice(startIndex, endIndex);
    return slice.map((message, index) => ({
      message,
      index: startIndex + index,
    }));
  });

  function handleResultScroll() {
    if (!resultsRef) return;
    setResultScrollTop(resultsRef.scrollTop);
    setResultViewportHeight(resultsRef.clientHeight || 320);
  }

  function clearAllFilters() {
    setQuery("");
    setFromFilter("anyone");
    setMediaFilter(null);
    setMentionsOnly(false);
    setDateAfter("");
    setDateBefore("");
  }

  function handleJump(message: DirectMessage) {
    props.onJumpToMessage(message.id, message.timestamp);
  }

  // highlight matching text in a result snippet
  function highlightMatch(text: string): string {
    const textQuery = query().trim();
    if (!textQuery) return escapeHtml(truncate(text, 120));

    const escaped = escapeHtml(truncate(text, 120));
    const escapedQuery = escapeRegex(escapeHtml(textQuery));
    const regex = new RegExp(`(${escapedQuery})`, "gi");

    return escaped.replace(regex, '<span class="text-orange font-medium">$1</span>');
  }

  return (
    <div class="border-b border-white/10 bg-gray-900 animate-fade-in">
      {/* search input row */}
      <div class="flex items-center gap-2 px-4 py-2">
        <Show
          when={!loading()}
          fallback={
            <Loader2 size={16} class="shrink-0 text-white/40 animate-spin" />
          }
        >
          <Search size={16} class="shrink-0 text-white/40" />
        </Show>

        <input
          ref={inputRef}
          type="text"
          placeholder={loading() ? "searching..." : "search messages..."}
          value={query()}
          onInput={(event) => setQuery(event.currentTarget.value)}
          class="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none"
        />

        <Show when={!loading() && (query() || hasActiveFilters())}>
          <span class="text-[12px] font-mono text-white/40 shrink-0">
            {results().length} result{results().length !== 1 ? "s" : ""}
          </span>
        </Show>

        <button
          type="button"
          class="shrink-0 p-1 text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
          onClick={() => setShowFilters((value) => !value)}
          aria-label="Toggle filters"
        >
          <Show when={showFilters()} fallback={<ChevronDown size={16} />}>
            <ChevronUp size={16} />
          </Show>
        </button>

        <button
          type="button"
          class="shrink-0 p-1 text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
          onClick={props.onClose}
          aria-label="Close search"
        >
          <X size={16} />
        </button>
      </div>

      {/* filter chips */}
      <Show when={showFilters()}>
        <div class="px-4 pb-3 flex flex-col gap-2 animate-fade-in">
          {/* from filter */}
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-white/30 uppercase tracking-wider w-12 shrink-0">
              from
            </span>
            <div class="flex items-center gap-1">
              <FilterChip
                active={fromFilter() === "anyone"}
                onClick={() => setFromFilter("anyone")}
                icon={<User size={12} />}
                label="anyone"
              />
              <FilterChip
                active={fromFilter() === "me"}
                onClick={() => setFromFilter("me")}
                icon={<User size={12} />}
                label="me"
              />
              <FilterChip
                active={fromFilter() === "them"}
                onClick={() => setFromFilter("them")}
                icon={<User size={12} />}
                label={props.peerName}
              />
            </div>
          </div>

          {/* media type filter */}
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-white/30 uppercase tracking-wider w-12 shrink-0">
              type
            </span>
            <div class="flex items-center gap-1 flex-wrap">
              <FilterChip
                active={mediaFilter() === "images"}
                onClick={() =>
                  setMediaFilter((value) =>
                    value === "images" ? null : "images",
                  )
                }
                icon={<Image size={12} />}
                label="images"
              />
              <FilterChip
                active={mediaFilter() === "videos"}
                onClick={() =>
                  setMediaFilter((value) =>
                    value === "videos" ? null : "videos",
                  )
                }
                icon={<FileText size={12} />}
                label="videos"
              />
              <FilterChip
                active={mediaFilter() === "links"}
                onClick={() =>
                  setMediaFilter((value) =>
                    value === "links" ? null : "links",
                  )
                }
                icon={<Link size={12} />}
                label="links"
              />
              <FilterChip
                active={mediaFilter() === "files"}
                onClick={() =>
                  setMediaFilter((value) =>
                    value === "files" ? null : "files",
                  )
                }
                icon={<FileText size={12} />}
                label="files"
              />
              <FilterChip
                active={mentionsOnly()}
                onClick={() => setMentionsOnly((value) => !value)}
                icon={<AtSign size={12} />}
                label="mentions"
              />
            </div>
          </div>

          {/* date range */}
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-white/30 uppercase tracking-wider w-12 shrink-0">
              date
            </span>
            <div class="flex items-center gap-2">
              <div class="flex items-center gap-1">
                <Calendar size={12} class="text-white/30" />
                <input
                  type="date"
                  value={dateAfter()}
                  onInput={(event) => setDateAfter(event.currentTarget.value)}
                  class="bg-gray-800 text-[12px] font-mono text-white/60 px-2 py-1 border border-white/10 outline-none focus:border-orange transition-colors duration-200 [color-scheme:dark]"
                  placeholder="after"
                />
              </div>
              <span class="text-[11px] text-white/20">to</span>
              <div class="flex items-center gap-1">
                <input
                  type="date"
                  value={dateBefore()}
                  onInput={(event) => setDateBefore(event.currentTarget.value)}
                  class="bg-gray-800 text-[12px] font-mono text-white/60 px-2 py-1 border border-white/10 outline-none focus:border-orange transition-colors duration-200 [color-scheme:dark]"
                  placeholder="before"
                />
              </div>
            </div>
          </div>

          {/* clear all */}
          <Show when={hasActiveFilters() || query()}>
            <button
              type="button"
              class="self-start text-[11px] font-mono text-orange hover:text-orange-hover transition-colors duration-200 cursor-pointer"
              onClick={clearAllFilters}
            >
              clear all filters
            </button>
          </Show>
        </div>
      </Show>

      {/* search results */}
      <Show when={query() || hasActiveFilters()}>
        <div
          ref={resultsRef}
          class="max-h-[320px] overflow-y-auto border-t border-white/5"
          onScroll={handleResultScroll}
        >
          <Show
            when={!loading() && results().length > 0}
            fallback={
              <div class="px-4 py-6 text-center text-[13px] text-white/30">
                <Show when={loading()} fallback={<>no messages found</>}>
                  searching messages
                </Show>
              </div>
            }
          >
            <div
              class="relative"
              style={{ height: `${Math.max(totalResultHeight(), 1)}px` }}
            >
              <For each={visibleResults()}>
                {(row) => (
                  <button
                    type="button"
                    class="w-full px-4 flex items-start gap-3 text-left hover:bg-gray-800 transition-colors duration-200 cursor-pointer group absolute left-0 right-0"
                    style={{
                      top: `${row.index * RESULT_ROW_HEIGHT}px`,
                      height: `${RESULT_ROW_HEIGHT}px`,
                    }}
                    onClick={() => handleJump(row.message)}
                  >
                    <div class="flex-1 min-w-0 pt-2">
                      <div class="flex items-baseline gap-2">
                        <span class="text-[13px] font-medium text-white/80 group-hover:text-white truncate">
                          {row.message.from_display_name}
                        </span>
                        <span class="text-[11px] font-mono text-white/30">
                          {formatDaySeparator(row.message.timestamp)}{" "}
                          {formatTime(row.message.timestamp)}
                        </span>
                      </div>
                      <p
                        class="text-[13px] text-white/50 truncate mt-0.5"
                        innerHTML={highlightMatch(row.message.content)}
                      />
                    </div>
                  </button>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
};

interface FilterChipProps {
  active: boolean;
  onClick: () => void;
  icon: any;
  label: string;
}

const FilterChip: Component<FilterChipProps> = (props) => (
  <button
    type="button"
    class={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono transition-colors duration-200 cursor-pointer ${
      props.active
        ? "bg-orange text-white"
        : "bg-gray-800 text-white/50 hover:text-white hover:bg-gray-800/80"
    }`}
    onClick={props.onClick}
  >
    {props.icon}
    {props.label}
  </button>
);

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

export default DMSearchPanel;
