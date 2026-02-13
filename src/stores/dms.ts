import { createSignal } from "solid-js";
import type { ChatMessage } from "../lib/types";

// represents a direct message conversation with a peer
export interface DMConversation {
  peer_id: string;
  display_name: string;
  status: "Online" | "Idle" | "Offline";
  last_message?: string;
  last_message_time?: number;
  unread_count: number;
}

const [dmConversations, setDMConversations] = createSignal<DMConversation[]>(
  [],
);
const [activeDMPeerId, setActiveDMPeerId] = createSignal<string | null>(null);
const [dmMessages, setDMMessages] = createSignal<ChatMessage[]>([]);

export function setActiveDM(peerId: string | null) {
  setActiveDMPeerId(peerId);
}

export function activeDMConversation(): DMConversation | undefined {
  return dmConversations().find((dm) => dm.peer_id === activeDMPeerId());
}

export function addDMConversation(dm: DMConversation) {
  setDMConversations((prev) => {
    // avoid duplicates
    if (prev.some((existing) => existing.peer_id === dm.peer_id)) return prev;
    return [...prev, dm];
  });
}

export function removeDMConversation(peerId: string) {
  setDMConversations((prev) => prev.filter((dm) => dm.peer_id !== peerId));
  if (activeDMPeerId() === peerId) {
    setActiveDMPeerId(null);
  }
}

export function updateDMLastMessage(
  peerId: string,
  content: string,
  timestamp: number,
) {
  setDMConversations((prev) =>
    prev.map((dm) =>
      dm.peer_id === peerId
        ? { ...dm, last_message: content, last_message_time: timestamp }
        : dm,
    ),
  );
}

export function incrementDMUnread(peerId: string) {
  setDMConversations((prev) =>
    prev.map((dm) =>
      dm.peer_id === peerId ? { ...dm, unread_count: dm.unread_count + 1 } : dm,
    ),
  );
}

export function clearDMUnread(peerId: string) {
  setDMConversations((prev) =>
    prev.map((dm) => (dm.peer_id === peerId ? { ...dm, unread_count: 0 } : dm)),
  );
}

export function addDMMessage(message: ChatMessage) {
  setDMMessages((prev) => [...prev, message]);
}

export function clearDMMessages() {
  setDMMessages([]);
}

export {
  dmConversations,
  activeDMPeerId,
  dmMessages,
  setDMConversations,
  setDMMessages,
};
