import { createSignal } from "solid-js";
import type { ChatMessage } from "../lib/types";

const [messages, setMessages] = createSignal<ChatMessage[]>([]);
const [isLoading, setIsLoading] = createSignal(false);
const [hasMore, setHasMore] = createSignal(true);

export function addMessage(message: ChatMessage) {
  setMessages((prev) => [...prev, message]);
}

export function prependMessages(older: ChatMessage[]) {
  setMessages((prev) => [...older, ...prev]);
}

export function clearMessages() {
  setMessages([]);
  setHasMore(true);
}

export function removeMessage(messageId: string) {
  setMessages((prev) => prev.filter((m) => m.id !== messageId));
}

export { messages, isLoading, hasMore, setMessages, setIsLoading, setHasMore };
