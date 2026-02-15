import { createSignal } from "solid-js";
import type { DirectMessage, DMConversationMeta } from "../lib/types";

// dm conversations loaded from disk via tauri backend
const [dmConversations, setDMConversations] = createSignal<
  DMConversationMeta[]
>([]);
const [activeDMPeerId, setActiveDMPeerId] = createSignal<string | null>(null);
const [dmMessages, setDMMessages] = createSignal<DirectMessage[]>([]);
// peers currently typing in the active dm
const [dmTypingPeers, setDMTypingPeers] = createSignal<string[]>([]);

export function setActiveDM(peerId: string | null) {
  setActiveDMPeerId(peerId);
}

export function activeDMConversation(): DMConversationMeta | undefined {
  return dmConversations().find((dm) => dm.peer_id === activeDMPeerId());
}

export function addDMConversation(dm: DMConversationMeta) {
  setDMConversations((prev) => {
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

export function addDMMessage(message: DirectMessage) {
  setDMMessages((prev) => [...prev, message]);
}

export function clearDMMessages() {
  setDMMessages([]);
}

// handle an incoming dm from the network
export function handleIncomingDM(message: DirectMessage) {
  const active = activeDMPeerId();

  // if the conversation is currently active, add the message to the view
  if (active === message.from_peer) {
    addDMMessage(message);
  }

  // update or create the conversation entry
  const existing = dmConversations().find(
    (dm) => dm.peer_id === message.from_peer,
  );
  if (existing) {
    updateDMLastMessage(message.from_peer, message.content, message.timestamp);
    // only increment unread if this conversation is not active
    if (active !== message.from_peer) {
      incrementDMUnread(message.from_peer);
    }
  } else {
    // new conversation from a peer we haven't talked to before
    addDMConversation({
      peer_id: message.from_peer,
      display_name: message.from_display_name,
      last_message: message.content,
      last_message_time: message.timestamp,
      unread_count: active === message.from_peer ? 0 : 1,
    });
  }
}

// add a typing peer indicator with auto-expiry
let dmTypingTimers: Record<string, ReturnType<typeof setTimeout>> = {};
export function addDMTypingPeer(peerId: string) {
  setDMTypingPeers((prev) =>
    prev.includes(peerId) ? prev : [...prev, peerId],
  );

  // clear any existing timer for this peer
  if (dmTypingTimers[peerId]) {
    clearTimeout(dmTypingTimers[peerId]);
  }

  // auto-remove after 3 seconds
  dmTypingTimers[peerId] = setTimeout(() => {
    setDMTypingPeers((prev) => prev.filter((id) => id !== peerId));
    delete dmTypingTimers[peerId];
  }, 3000);
}

export function clearDMTypingPeers() {
  setDMTypingPeers([]);
  for (const timer of Object.values(dmTypingTimers)) {
    clearTimeout(timer);
  }
  dmTypingTimers = {};
}

// update a conversation's display name when we get a profile update
export function updateDMPeerDisplayName(peerId: string, displayName: string) {
  setDMConversations((prev) =>
    prev.map((dm) =>
      dm.peer_id === peerId ? { ...dm, display_name: displayName } : dm,
    ),
  );
}

export {
  dmConversations,
  activeDMPeerId,
  dmMessages,
  dmTypingPeers,
  setDMConversations,
  setDMMessages,
};
