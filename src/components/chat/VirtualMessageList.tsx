import type { Component } from "solid-js";
import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
  untrack,
} from "solid-js";
import type { ChatMessage } from "../../lib/types";
import {
  isWithinGroupWindow,
  isDifferentDay,
  formatDaySeparator,
} from "../../lib/utils";
import Message from "./Message";
import { ArrowDown } from "lucide-solid";

interface VirtualMessageListProps {
  messages: ChatMessage[];
  conversationKey: string;
  focusMessageId?: string | null;
  onLoadMore?: () => void;
}

interface MessageRenderMeta {
  message: ChatMessage;
  isGrouped: boolean;
  isFirstInGroup: boolean;
  isLastInGroup: boolean;
  showDaySeparator: boolean;
  isLastMessage: boolean;
}

interface VirtualRow {
  key: string;
  type: "separator" | "message";
  top: number;
  height: number;
  separatorLabel?: string;
  meta?: MessageRenderMeta;
}

const OVERSCAN_PX = 600;
const DAY_SEPARATOR_ESTIMATE = 42;

const VirtualMessageList: Component<VirtualMessageListProps> = (props) => {
  let containerRef: HTMLDivElement | undefined;
  let rowResizeObserver: ResizeObserver | undefined;
  let clearHighlightTimer: ReturnType<typeof setTimeout> | undefined;

  const [scrollTop, setScrollTop] = createSignal(0);
  const [viewportHeight, setViewportHeight] = createSignal(0);
  const [showScrollButton, setShowScrollButton] = createSignal(false);
  const [isAtBottom, setIsAtBottom] = createSignal(true);
  const [prevMessageCount, setPrevMessageCount] = createSignal(0);
  const [shouldAnimateLast, setShouldAnimateLast] = createSignal(false);
  const [measuredHeights, setMeasuredHeights] = createSignal<
    Record<string, number>
  >({});
  const [highlightedMessageId, setHighlightedMessageId] = createSignal<
    string | null
  >(null);

  let lastLoadRequestAt = 0;
  let pendingPrependCompensation:
    | {
        totalHeight: number;
        scrollTop: number;
        oldestMessageId: string | null;
      }
    | null = null;

  const messageMeta = createMemo((): MessageRenderMeta[] => {
    const messages = props.messages;

    return messages.map((message, index) => {
      const prev = index > 0 ? messages[index - 1] : undefined;
      const next =
        index < messages.length - 1 ? messages[index + 1] : undefined;

      const isFirstInGroup =
        !prev ||
        prev.author_id !== message.author_id ||
        !isWithinGroupWindow(prev.timestamp, message.timestamp);

      const isLastInGroup =
        !next ||
        next.author_id !== message.author_id ||
        !isWithinGroupWindow(message.timestamp, next.timestamp);

      const showDaySeparator =
        !prev || isDifferentDay(prev.timestamp, message.timestamp);

      return {
        message,
        isGrouped: !isFirstInGroup,
        isFirstInGroup,
        isLastInGroup,
        showDaySeparator,
        isLastMessage: index === messages.length - 1,
      };
    });
  });

  const rows = createMemo(() => {
    const heights = measuredHeights();
    const rendered = messageMeta();

    const virtualRows: VirtualRow[] = [];
    let cursorTop = 0;

    for (const meta of rendered) {
      if (meta.showDaySeparator) {
        const rowKey = `sep:${meta.message.id}`;
        const height = heights[rowKey] ?? DAY_SEPARATOR_ESTIMATE;
        virtualRows.push({
          key: rowKey,
          type: "separator",
          top: cursorTop,
          height,
          separatorLabel: formatDaySeparator(meta.message.timestamp),
        });
        cursorTop += height;
      }

      const rowKey = `msg:${meta.message.id}`;
      const estimatedHeight = estimateMessageHeight(
        meta.message.content,
        meta.isFirstInGroup,
      );
      const height = heights[rowKey] ?? estimatedHeight;

      virtualRows.push({
        key: rowKey,
        type: "message",
        top: cursorTop,
        height,
        meta,
      });
      cursorTop += height;
    }

    return {
      items: virtualRows,
      totalHeight: cursorTop,
    };
  });

  const visibleRows = createMemo(() => {
    const allRows = rows().items;
    if (allRows.length === 0) return [];

    const startY = Math.max(0, scrollTop() - OVERSCAN_PX);
    const endY = scrollTop() + viewportHeight() + OVERSCAN_PX;

    const startIndex = Math.max(0, findFirstVisibleRowIndex(allRows, startY) - 2);

    let endIndex = startIndex;
    while (endIndex < allRows.length && allRows[endIndex].top < endY) {
      endIndex += 1;
    }

    return allRows.slice(startIndex, Math.min(allRows.length, endIndex + 2));
  });

  function setMeasuredHeight(rowKey: string, nextHeight: number) {
    const roundedHeight = Math.ceil(nextHeight);
    if (roundedHeight <= 0) return;

    setMeasuredHeights((prev) => {
      if (prev[rowKey] === roundedHeight) return prev;
      return { ...prev, [rowKey]: roundedHeight };
    });
  }

  function observeRow(el: HTMLDivElement, rowKey: string) {
    el.dataset.virtualKey = rowKey;
    rowResizeObserver?.observe(el);
  }

  function syncViewportMetrics() {
    if (!containerRef) return;
    setViewportHeight(containerRef.clientHeight);
  }

  function scrollToBottom(smooth = true) {
    if (!containerRef) return;

    containerRef.scrollTo({
      top: rows().totalHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }

  function scrollToMessage(messageId: string) {
    if (!containerRef) return;

    const messageRow = rows().items.find(
      (row) => row.type === "message" && row.meta?.message.id === messageId,
    );

    if (!messageRow) return;

    const targetTop = Math.max(
      0,
      messageRow.top - Math.floor(containerRef.clientHeight * 0.35),
    );

    containerRef.scrollTo({ top: targetTop, behavior: "smooth" });
    setHighlightedMessageId(messageId);

    if (clearHighlightTimer) {
      clearTimeout(clearHighlightTimer);
    }
    clearHighlightTimer = setTimeout(() => {
      setHighlightedMessageId(null);
    }, 2000);
  }

  function maybeLoadOlderMessages() {
    if (!props.onLoadMore || !containerRef) return;
    if (containerRef.scrollTop > 120) return;

    const now = Date.now();
    if (now - lastLoadRequestAt < 400) return;
    lastLoadRequestAt = now;

    pendingPrependCompensation = {
      totalHeight: rows().totalHeight,
      scrollTop: containerRef.scrollTop,
      oldestMessageId: props.messages[0]?.id ?? null,
    };

    props.onLoadMore();
  }

  function handleScroll() {
    if (!containerRef) return;

    const currentScrollTop = containerRef.scrollTop;
    setScrollTop(currentScrollTop);

    const distanceFromBottom =
      rows().totalHeight - currentScrollTop - containerRef.clientHeight;
    const atBottom = distanceFromBottom < 64;

    setIsAtBottom(atBottom);
    setShowScrollButton(!atBottom);

    maybeLoadOlderMessages();
  }

  createEffect(() => {
    const currentCount = props.messages.length;
    const prevCount = untrack(() => prevMessageCount());

    if (currentCount > prevCount && prevCount > 0) {
      setShouldAnimateLast(true);
    } else {
      setShouldAnimateLast(false);
    }

    setPrevMessageCount(currentCount);
  });

  createEffect(() => {
    const messageCount = props.messages.length;
    if (messageCount === 0) return;

    if (isAtBottom()) {
      requestAnimationFrame(() => scrollToBottom(true));
    }
  });

  createEffect(() => {
    const totalHeight = rows().totalHeight;
    if (!containerRef || !pendingPrependCompensation) return;

    const currentOldestMessageId = props.messages[0]?.id ?? null;
    if (currentOldestMessageId === pendingPrependCompensation.oldestMessageId) {
      pendingPrependCompensation = null;
      return;
    }

    if (totalHeight <= pendingPrependCompensation.totalHeight) return;

    const delta = totalHeight - pendingPrependCompensation.totalHeight;
    containerRef.scrollTop = pendingPrependCompensation.scrollTop + delta;
    pendingPrependCompensation = null;
  });

  createEffect(
    on(
      () => props.focusMessageId,
      (messageId) => {
        if (!messageId) return;
        requestAnimationFrame(() => scrollToMessage(messageId));
      },
    ),
  );

  createEffect(
    on(
      () => props.conversationKey,
      () => {
        setMeasuredHeights({});
        setHighlightedMessageId(null);
        setShowScrollButton(false);
        setIsAtBottom(true);
        pendingPrependCompensation = null;
        requestAnimationFrame(() => {
          scrollToBottom(false);
          handleScroll();
        });
      },
    ),
  );

  onMount(() => {
    rowResizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const el = entry.target as HTMLElement;
        const rowKey = el.dataset.virtualKey;
        if (!rowKey) continue;
        setMeasuredHeight(rowKey, entry.contentRect.height);
      }
    });

    syncViewportMetrics();
    requestAnimationFrame(() => {
      scrollToBottom(false);
      handleScroll();
    });

    window.addEventListener("resize", syncViewportMetrics);
  });

  onCleanup(() => {
    window.removeEventListener("resize", syncViewportMetrics);
    rowResizeObserver?.disconnect();
    if (clearHighlightTimer) {
      clearTimeout(clearHighlightTimer);
    }
  });

  return (
    <div class="relative flex-1 min-h-0">
      <div
        ref={containerRef}
        class="h-full overflow-y-auto"
        onScroll={handleScroll}
      >
        <div
          class="relative"
          style={{ height: `${Math.max(rows().totalHeight, 1)}px` }}
        >
          <For each={visibleRows()}>
            {(row) => (
              <div
                ref={(el) => observeRow(el, row.key)}
                class="absolute left-0 right-0"
                style={{ transform: `translateY(${row.top}px)` }}
              >
                <Show when={row.type === "separator"}>
                  <div class="flex items-center gap-4 px-4 my-4">
                    <div class="flex-1 border-t border-white/10" />
                    <span class="text-[12px] font-mono text-white/40 uppercase tracking-[0.05em]">
                      {row.separatorLabel}
                    </span>
                    <div class="flex-1 border-t border-white/10" />
                  </div>
                </Show>

                <Show when={row.type === "message" && row.meta}>
                  <div
                    data-message-id={row.meta?.message.id}
                    class={
                      row.meta?.isLastMessage && shouldAnimateLast()
                        ? "animate-message-in"
                        : ""
                    }
                  >
                    <div
                      class={
                        highlightedMessageId() === row.meta?.message.id
                          ? "dusk-msg-search-highlight"
                          : ""
                      }
                    >
                      <Message
                        message={row.meta!.message}
                        isGrouped={row.meta!.isGrouped}
                        isFirstInGroup={row.meta!.isFirstInGroup}
                        isLastInGroup={row.meta!.isLastInGroup}
                      />
                    </div>
                  </div>
                </Show>
              </div>
            )}
          </For>
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

function estimateMessageHeight(content: string, isFirstInGroup: boolean): number {
  const baseHeight = isFirstInGroup ? 82 : 46;
  const charLines = Math.max(0, Math.ceil(content.length / 90) - 1);
  const newlineLines = Math.max(0, content.split("\n").length - 1);
  const extraLines = Math.min(8, charLines + newlineLines);

  return baseHeight + extraLines * 18;
}

function findFirstVisibleRowIndex(rows: VirtualRow[], offset: number): number {
  let low = 0;
  let high = rows.length - 1;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const row = rows[mid];

    if (row.top + row.height < offset) {
      low = mid + 1;
    } else {
      best = mid;
      high = mid - 1;
    }
  }

  return best;
}

export default VirtualMessageList;
