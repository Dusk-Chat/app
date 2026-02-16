import { members } from "../stores/members";
import { knownPeers } from "../stores/directory";

// matches mention tokens in the wire format: <@peer_id> or <@everyone>
// peer ids are base58-encoded multihash strings (alphanumeric)
const MENTION_REGEX = /<@(everyone|[A-Za-z0-9]+)>/g;

// same pattern but against html-escaped content (after escapeHtml runs)
const MENTION_ESCAPED_REGEX = /&lt;@(everyone|[A-Za-z0-9]+)&gt;/g;

// extract all mentioned peer ids (or "everyone") from raw message content
export function extractMentions(content: string): string[] {
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  const regex = new RegExp(MENTION_REGEX.source, "g");
  while ((match = regex.exec(content)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

// check if a specific peer is mentioned in the message content
// also returns true if @everyone is used
export function isMentioned(content: string, peerId: string): boolean {
  const mentions = extractMentions(content);
  return mentions.includes(peerId) || mentions.includes("everyone");
}

// resolve a peer id to a display name by checking community members
// first, then the global peer directory as a fallback
export function resolveMentionName(peerId: string): string {
  if (peerId === "everyone") return "everyone";

  // check active community members first
  const memberList = members();
  const member = memberList.find((m) => m.peer_id === peerId);
  if (member) return member.display_name;

  // fall back to the global peer directory (covers dm peers and
  // members from other communities)
  const peers = knownPeers();
  const peer = peers.find((p) => p.peer_id === peerId);
  if (peer) return peer.display_name;

  // last resort - truncate the raw peer id for readability
  if (peerId.length > 12) {
    return peerId.slice(0, 8) + "...";
  }
  return peerId;
}

// replace mention tokens in html-escaped content with rendered spans
// must be called on already-escaped html (after escapeHtml)
export function renderMentions(escapedHtml: string): string {
  return escapedHtml.replace(MENTION_ESCAPED_REGEX, (_match, id: string) => {
    const name = resolveMentionName(id);

    if (id === "everyone") {
      return `<span class="dusk-mention dusk-mention-everyone">@${name}</span>`;
    }

    return `<span class="dusk-mention" data-peer-id="${id}">@${name}</span>`;
  });
}
