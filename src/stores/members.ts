import { createSignal } from "solid-js";
import type { Member } from "../lib/types";

const [members, setMembers] = createSignal<Member[]>([]);
const [typingPeerIds, setTypingPeerIds] = createSignal<string[]>([]);
const [onlinePeerIds, setOnlinePeerIds] = createSignal<Set<string>>(new Set());

// track typing timeouts so we can auto-clear after 5 seconds
const typingTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

export function addTypingPeer(peerId: string) {
  // clear any existing timeout for this peer
  const existing = typingTimeouts.get(peerId);
  if (existing) clearTimeout(existing);

  setTypingPeerIds((prev) => (prev.includes(peerId) ? prev : [...prev, peerId]));

  // auto-remove after 5 seconds of no new typing events
  const timeout = setTimeout(() => {
    removeTypingPeer(peerId);
  }, 5000);
  typingTimeouts.set(peerId, timeout);
}

export function removeTypingPeer(peerId: string) {
  setTypingPeerIds((prev) => prev.filter((id) => id !== peerId));
  const timeout = typingTimeouts.get(peerId);
  if (timeout) {
    clearTimeout(timeout);
    typingTimeouts.delete(peerId);
  }
}

export function typingUserNames(): string[] {
  const typing = typingPeerIds();
  const memberList = members();
  return typing
    .map((id) => memberList.find((m) => m.peer_id === id)?.display_name ?? id)
    .filter(Boolean);
}

// presence management
export function setPeerOnline(peerId: string) {
  setOnlinePeerIds((prev) => {
    const next = new Set(prev);
    next.add(peerId);
    return next;
  });
  // also update the member status
  setMembers((prev) =>
    prev.map((m) =>
      m.peer_id === peerId ? { ...m, status: "Online" as const } : m
    )
  );
}

export function setPeerOffline(peerId: string) {
  setOnlinePeerIds((prev) => {
    const next = new Set(prev);
    next.delete(peerId);
    return next;
  });
  // also update the member status
  setMembers((prev) =>
    prev.map((m) =>
      m.peer_id === peerId ? { ...m, status: "Offline" as const } : m
    )
  );
}

export function isPeerOnline(peerId: string): boolean {
  return onlinePeerIds().has(peerId);
}

export function removeMember(peerId: string) {
  setMembers((prev) => prev.filter((m) => m.peer_id !== peerId));
  setOnlinePeerIds((prev) => {
    const next = new Set(prev);
    next.delete(peerId);
    return next;
  });
}

export { members, typingPeerIds, setMembers, onlinePeerIds };
