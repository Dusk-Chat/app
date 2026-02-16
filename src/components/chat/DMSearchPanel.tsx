import type { Component } from "solid-js";
import { createSignal, createMemo, onMount, Show, For } from "solid-js";
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
import type { ChatMessage, DirectMessage } from "../../lib/types";
import { formatTime, formatDaySeparator } from "../../lib/utils";
import { extractMentions } from "../../lib/mentions";
import * as tauri from "../../lib/tauri";

// regex patterns for detecting media in message content
const IMAGE_REGEX = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?[^\s]*)?$/i;
const VIDEO_REGEX = /\.(mp4|webm|mov|avi|mkv)(\?[^\s]*)?$/i;
const LINK_REGEX = /https?:\/\/[^\s]+/i;
const FILE_REGEX = /\.(pdf|doc|docx|xls|xlsx|zip|rar|7z|tar|gz)(\?[^\s]*)?$/i;

// upper bound so we pull the entire conversation from disk
const ALL_MESSAGES_LIMIT = 1_000_000;

type MediaFilter = "images" | "videos" | "links" | "files";
type FilterFrom = "anyone" | "me" | "them";

interface DMSearchPanelProps {
  peerId: string;
  myPeerId: string;
  peerName: string;
  onClose: () => void;
  onJumpToMessage: (messageId: string, allMessages: DirectMessage[]) => void;
}

const DMSearchPanel: Component<DMSearchPanelProps> = (props) => {
  const [query, setQuery] = createSignal("");
  const [fromFilter, setFromFilter] = createSignal<FilterFrom>("anyone");
  const [mediaFilter, setMediaFilter] = createSignal<MediaFilter | null>(null);
  const [mentionsOnly, setMentionsOnly] = createSignal(false);
  const [dateAfter, setDateAfter] = createSignal<string>("");
  const [dateBefore, setDateBefore] = createSignal<string>("");
  const [showFilters, setShowFilters] = createSignal(false);

  // full conversation loaded from disk for searching
  const [allMessages, setAllMessages] = createSignal<DirectMessage[]>([]);
  const [loading, setLoading] = createSignal(true);

  let inputRef: HTMLInputElement | undefined;

  // load entire conversation history from disk on mount
  onMount(async () => {
    try {
      const msgs = await tauri.getDMMessages(
        props.peerId,
        undefined,
        ALL_MESSAGES_LIMIT,
      );
      setAllMessages(msgs);
    } catch (e) {
      console.error("failed to load all dm messages for search:", e);
    } finally {
      setLoading(false);
      // focus after loading completes
      inputRef?.focus();
    }
  });

  // adapt DirectMessage[] to a searchable shape
  const searchableMessages = createMemo((): ChatMessage[] =>
    allMessages().map((m) => ({
      id: m.id,
      channel_id: `dm_${props.peerId}`,
      author_id: m.from_peer,
      author_name: m.from_display_name,
      content: m.content,
      timestamp: m.timestamp,
      edited: false,
    })),
  );

  const hasActiveFilters = createMemo(() => {
    return (
      fromFilter() !== "anyone" ||
      mediaFilter() !== null ||
      mentionsOnly() ||
      dateAfter() !== "" ||
      dateBefore() !== ""
    );
  });

  const filteredMessages = createMemo(() => {
    const q = query().toLowerCase().trim();
    const from = fromFilter();
    const media = mediaFilter();
    const mentions = mentionsOnly();
    const after = dateAfter();
    const before = dateBefore();

    // no search or filters active, return nothing
    if (!q && !hasActiveFilters()) return [];

    const afterTs = after ? new Date(after).getTime() : null;
    const beforeTs = before
      ? new Date(before).getTime() + 86_400_000
      : null;

    return searchableMessages().filter((msg) => {
      // text query
      if (q && !msg.content.toLowerCase().includes(q)) return false;

      // from filter
      if (from === "me" && msg.author_id !== props.myPeerId) return false;
      if (from === "them" && msg.author_id === props.myPeerId) return false;

      // date range
      if (afterTs && msg.timestamp < afterTs) return false;
      if (beforeTs && msg.timestamp > beforeTs) return false;

      // media type
      if (media) {
        const content = msg.content.trim();
        if (media === "images" && !IMAGE_REGEX.test(content)) return false;
        if (media === "videos" && !VIDEO_REGEX.test(content)) return false;
        if (media === "links" && !LINK_REGEX.test(content)) return false;
        if (media === "files" && !FILE_REGEX.test(content)) return false;
      }

      // mentions only
      if (mentions && extractMentions(msg.content).length === 0) return false;

      return true;
    });
  });

  function clearAllFilters() {
    setQuery("");
    setFromFilter("anyone");
    setMediaFilter(null);
    setMentionsOnly(false);
    setDateAfter("");
    setDateBefore("");
  }

  function handleJump(messageId: string) {
    props.onJumpToMessage(messageId, allMessages());
  }

  // highlight matching text in a result snippet
  function highlightMatch(text: string): string {
    const q = query().trim();
    if (!q) return escapeHtml(truncate(text, 120));

    const escaped = escapeHtml(truncate(text, 120));
    const regex = new RegExp(
      `(${escapeRegex(escapeHtml(q))})`,
      "gi",
    );
    return escaped.replace(
      regex,
      '<span class="text-orange font-medium">$1</span>',
    );
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
          placeholder={loading() ? "loading messages..." : "search messages..."}
          value={query()}
          onInput={(e) => setQuery(e.currentTarget.value)}
          disabled={loading()}
          class="flex-1 bg-transparent text-[14px] text-white placeholder:text-white/30 outline-none disabled:opacity-50"
        />
        <Show when={!loading() && (query() || hasActiveFilters())}>
          <span class="text-[12px] font-mono text-white/40 shrink-0">
            {filteredMessages().length} result{filteredMessages().length !== 1 ? "s" : ""}
          </span>
        </Show>
        <button
          type="button"
          class="shrink-0 p-1 text-white/40 hover:text-white transition-colors duration-200 cursor-pointer"
          onClick={() => setShowFilters((v) => !v)}
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
                  setMediaFilter((v) => (v === "images" ? null : "images"))
                }
                icon={<Image size={12} />}
                label="images"
              />
              <FilterChip
                active={mediaFilter() === "videos"}
                onClick={() =>
                  setMediaFilter((v) => (v === "videos" ? null : "videos"))
                }
                icon={<FileText size={12} />}
                label="videos"
              />
              <FilterChip
                active={mediaFilter() === "links"}
                onClick={() =>
                  setMediaFilter((v) => (v === "links" ? null : "links"))
                }
                icon={<Link size={12} />}
                label="links"
              />
              <FilterChip
                active={mediaFilter() === "files"}
                onClick={() =>
                  setMediaFilter((v) => (v === "files" ? null : "files"))
                }
                icon={<FileText size={12} />}
                label="files"
              />
              <FilterChip
                active={mentionsOnly()}
                onClick={() => setMentionsOnly((v) => !v)}
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
                  onInput={(e) => setDateAfter(e.currentTarget.value)}
                  class="bg-gray-800 text-[12px] font-mono text-white/60 px-2 py-1 border border-white/10 outline-none focus:border-orange transition-colors duration-200 [color-scheme:dark]"
                  placeholder="after"
                />
              </div>
              <span class="text-[11px] text-white/20">to</span>
              <div class="flex items-center gap-1">
                <input
                  type="date"
                  value={dateBefore()}
                  onInput={(e) => setDateBefore(e.currentTarget.value)}
                  class="bg-gray-800 text-[12px] font-mono text-white/60 px-2 py-1 border border-white/10 outline-none focus:border-orange transition-colors duration-200 [color-scheme:dark]"
                  placeholder="before"
                />
              </div>
            </div>
          </div>

          {/* clear all */}
          <Show when={hasActiveFilters()}>
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
      <Show when={!loading() && (query() || hasActiveFilters())}>
        <div class="max-h-[320px] overflow-y-auto border-t border-white/5">
          <Show
            when={filteredMessages().length > 0}
            fallback={
              <div class="px-4 py-6 text-center text-[13px] text-white/30">
                no messages found
              </div>
            }
          >
            <For each={filteredMessages()}>
              {(msg) => (
                <button
                  type="button"
                  class="w-full px-4 py-2 flex items-start gap-3 text-left hover:bg-gray-800 transition-colors duration-200 cursor-pointer group"
                  onClick={() => handleJump(msg.id)}
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-baseline gap-2">
                      <span class="text-[13px] font-medium text-white/80 group-hover:text-white truncate">
                        {msg.author_name}
                      </span>
                      <span class="text-[11px] font-mono text-white/30">
                        {formatDaySeparator(msg.timestamp)} {formatTime(msg.timestamp)}
                      </span>
                    </div>
                    <p
                      class="text-[13px] text-white/50 truncate mt-0.5"
                      innerHTML={highlightMatch(msg.content)}
                    />
                  </div>
                </button>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  );
};

// reusable filter chip
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

// utilities
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max) + "...";
}

export default DMSearchPanel;
