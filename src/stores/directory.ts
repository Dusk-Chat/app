import { createSignal } from "solid-js";
import type { DirectoryEntry } from "../lib/types";

const [knownPeers, setKnownPeers] = createSignal<DirectoryEntry[]>([]);
const [friends, setFriends] = createSignal<DirectoryEntry[]>([]);

export function upsertPeerEntry(entry: DirectoryEntry) {
  setKnownPeers((prev) => {
    const existing = prev.findIndex((p) => p.peer_id === entry.peer_id);
    if (existing >= 0) {
      const updated = [...prev];
      // preserve local friend status when updating from network
      updated[existing] = { ...entry, is_friend: prev[existing].is_friend };
      return updated;
    }
    return [...prev, entry];
  });
}

export function updatePeerProfile(
  peerId: string,
  displayName: string,
  bio: string,
  publicKey: string,
) {
  const now = Date.now();

  setKnownPeers((prev) => {
    const existing = prev.find((p) => p.peer_id === peerId);
    if (existing) {
      // update existing peer
      return prev.map((p) =>
        p.peer_id === peerId
          ? {
              ...p,
              display_name: displayName,
              bio,
              public_key: publicKey || p.public_key,
              last_seen: now,
            }
          : p,
      );
    } else {
      // add new peer that just announced themselves
      const newEntry: DirectoryEntry = {
        peer_id: peerId,
        display_name: displayName,
        bio,
        public_key: publicKey,
        last_seen: now,
        is_friend: false,
      };
      return [...prev, newEntry];
    }
  });

  // update friends list if this peer is a friend
  setFriends((prev) =>
    prev.map((p) =>
      p.peer_id === peerId
        ? { ...p, display_name: displayName, bio, last_seen: now }
        : p,
    ),
  );
}

export function markAsFriend(peerId: string) {
  setKnownPeers((prev) =>
    prev.map((p) => (p.peer_id === peerId ? { ...p, is_friend: true } : p)),
  );

  // add to friends list if not already there
  const peer = knownPeers().find((p) => p.peer_id === peerId);
  if (peer) {
    setFriends((prev) => {
      if (prev.some((f) => f.peer_id === peerId)) return prev;
      return [...prev, { ...peer, is_friend: true }];
    });
  }
}

export function unmarkAsFriend(peerId: string) {
  setKnownPeers((prev) =>
    prev.map((p) => (p.peer_id === peerId ? { ...p, is_friend: false } : p)),
  );

  setFriends((prev) => prev.filter((f) => f.peer_id !== peerId));
}

// remove a peer entirely from local stores (used when they revoke their identity)
export function removePeer(peerId: string) {
  setKnownPeers((prev) => prev.filter((p) => p.peer_id !== peerId));
  setFriends((prev) => prev.filter((f) => f.peer_id !== peerId));
}

// clear all directory data (used during local identity reset)
export function clearDirectory() {
  setKnownPeers([]);
  setFriends([]);
}

export { knownPeers, friends, setKnownPeers, setFriends };
