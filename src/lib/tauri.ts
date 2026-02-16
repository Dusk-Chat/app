import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  PublicIdentity,
  CommunityMeta,
  ChannelMeta,
  CategoryMeta,
  ChatMessage,
  Member,
  DuskEvent,
  UserSettings,
  DirectoryEntry,
  ChallengeExport,
  VoiceParticipant,
  VoiceMediaState,
  DirectMessage,
  DMConversationMeta,
  DMSearchFilters,
  GifResponse,
} from "./types";

// wrapped invoke that logs all ipc calls and errors
async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const startTime = performance.now();
  const logPrefix = `[ipc] ${cmd}`;

  // log the call with args (redacting sensitive data)
  const safeArgs = args ? redactSensitiveArgs(args) : undefined;
  console.log(`${logPrefix} called`, safeArgs ? { args: safeArgs } : "");

  try {
    const result = await tauriInvoke<T>(cmd, args);
    const duration = (performance.now() - startTime).toFixed(2);
    console.log(`${logPrefix} success (${duration}ms)`, result);
    return result;
  } catch (error) {
    const duration = (performance.now() - startTime).toFixed(2);
    console.error(`${logPrefix} error (${duration}ms)`, error);
    throw error;
  }
}

// redact potentially sensitive values from args before logging
function redactSensitiveArgs(args: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = ["password", "secret", "token", "key", "credential", "private"];
  const redacted = { ...args };

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sk) => lowerKey.includes(sk))) {
      redacted[key] = "[REDACTED]";
    }
  }

  return redacted;
}

// -- identity --

export async function hasIdentity(): Promise<boolean> {
  return invoke("has_identity");
}

export async function loadIdentity(): Promise<PublicIdentity | null> {
  return invoke("load_identity");
}

export async function createIdentity(
  displayName: string,
  bio?: string,
  challengeData?: ChallengeExport,
): Promise<PublicIdentity> {
  return invoke("create_identity", { displayName, bio, challengeData });
}

export async function updateDisplayName(name: string): Promise<void> {
  return invoke("update_display_name", { name });
}

export async function updateProfile(
  displayName: string,
  bio: string,
): Promise<PublicIdentity> {
  return invoke("update_profile", { displayName, bio });
}

// -- settings --

export async function loadSettings(): Promise<UserSettings> {
  return invoke("load_settings");
}

export async function saveSettings(settings: UserSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

// -- node lifecycle --

export async function startNode(): Promise<void> {
  return invoke("start_node");
}

export async function stopNode(): Promise<void> {
  return invoke("stop_node");
}

// -- community --

export async function createCommunity(
  name: string,
  description: string,
): Promise<CommunityMeta> {
  return invoke("create_community", { name, description });
}

export async function joinCommunity(
  inviteCode: string,
): Promise<CommunityMeta> {
  return invoke("join_community", { inviteCode });
}

export async function leaveCommunity(communityId: string): Promise<void> {
  return invoke("leave_community", { communityId });
}

export async function getCommunities(): Promise<CommunityMeta[]> {
  return invoke("get_communities");
}

// -- channels --

export async function createChannel(
  communityId: string,
  name: string,
  topic: string,
  kind?: string,
  categoryId?: string | null,
): Promise<ChannelMeta> {
  return invoke("create_channel", {
    communityId,
    name,
    topic,
    kind,
    categoryId,
  });
}

export async function getChannels(communityId: string): Promise<ChannelMeta[]> {
  return invoke("get_channels", { communityId });
}

export async function createCategory(
  communityId: string,
  name: string,
): Promise<CategoryMeta> {
  return invoke("create_category", { communityId, name });
}

export async function getCategories(
  communityId: string,
): Promise<CategoryMeta[]> {
  return invoke("get_categories", { communityId });
}

export async function reorderChannels(
  communityId: string,
  channelIds: string[],
): Promise<ChannelMeta[]> {
  return invoke("reorder_channels", { communityId, channelIds });
}

// -- community settings --

export async function updateCommunity(
  communityId: string,
  name: string,
  description: string,
): Promise<CommunityMeta> {
  return invoke("update_community", { communityId, name, description });
}

export async function updateChannel(
  communityId: string,
  channelId: string,
  name: string,
  topic: string,
): Promise<ChannelMeta> {
  return invoke("update_channel", { communityId, channelId, name, topic });
}

export async function deleteChannel(
  communityId: string,
  channelId: string,
): Promise<void> {
  return invoke("delete_channel", { communityId, channelId });
}

export async function deleteCategory(
  communityId: string,
  categoryId: string,
): Promise<void> {
  return invoke("delete_category", { communityId, categoryId });
}

export async function setMemberRole(
  communityId: string,
  memberPeerId: string,
  role: string,
): Promise<void> {
  return invoke("set_member_role", { communityId, memberPeerId, role });
}

export async function transferOwnership(
  communityId: string,
  newOwnerPeerId: string,
): Promise<void> {
  return invoke("transfer_ownership", { communityId, newOwnerPeerId });
}

// -- messages --

export async function sendMessage(
  channelId: string,
  content: string,
): Promise<ChatMessage> {
  return invoke("send_message", { channelId, content });
}

export async function getMessages(
  channelId: string,
  before?: number,
  limit?: number,
): Promise<ChatMessage[]> {
  return invoke("get_messages", { channelId, before, limit });
}

// -- members --

export async function getMembers(communityId: string): Promise<Member[]> {
  return invoke("get_members", { communityId });
}

export async function sendTypingIndicator(channelId: string): Promise<void> {
  return invoke("send_typing", { channelId });
}

export async function broadcastPresence(status: string): Promise<void> {
  return invoke("broadcast_presence", { status });
}

// -- moderation --

export async function deleteMessage(
  communityId: string,
  messageId: string,
): Promise<void> {
  return invoke("delete_message", { communityId, messageId });
}

export async function kickMember(
  communityId: string,
  memberPeerId: string,
): Promise<void> {
  return invoke("kick_member", { communityId, memberPeerId });
}

export async function generateInvite(communityId: string): Promise<string> {
  return invoke("generate_invite", { communityId });
}

// -- user directory --

export async function getKnownPeers(): Promise<DirectoryEntry[]> {
  return invoke("get_known_peers");
}

export async function searchDirectory(
  query: string,
): Promise<DirectoryEntry[]> {
  return invoke("search_directory", { query });
}

export async function getFriends(): Promise<DirectoryEntry[]> {
  return invoke("get_friends");
}

export async function addFriend(peerId: string): Promise<void> {
  return invoke("add_friend", { peerId });
}

export async function removeFriend(peerId: string): Promise<void> {
  return invoke("remove_friend", { peerId });
}

export async function discoverGlobalPeers(): Promise<void> {
  return invoke("discover_global_peers");
}

export async function setRelayAddress(relayAddr: string): Promise<void> {
  return invoke("set_relay_address", { relayAddr });
}

export async function resetIdentity(): Promise<void> {
  return invoke("reset_identity");
}

export async function cacheAvatarIcon(
  cacheKey: string,
  svgContent: string,
): Promise<string> {
  return invoke("cache_avatar_icon", { cacheKey, svgContent });
}

// -- connectivity --

export async function checkInternetConnectivity(): Promise<boolean> {
  return invoke("check_internet_connectivity");
}

// -- events --

export function onDuskEvent(
  callback: (event: DuskEvent) => void,
): Promise<UnlistenFn> {
  return listen<DuskEvent>("dusk-event", (e) => callback(e.payload));
}

// -- voice --

export async function joinVoiceChannel(
  communityId: string,
  channelId: string,
): Promise<VoiceParticipant[]> {
  return invoke("join_voice_channel", { communityId, channelId });
}

export async function leaveVoiceChannel(
  communityId: string,
  channelId: string,
): Promise<void> {
  return invoke("leave_voice_channel", { communityId, channelId });
}

export async function updateVoiceMediaState(
  communityId: string,
  channelId: string,
  mediaState: VoiceMediaState,
): Promise<void> {
  return invoke("update_voice_media_state", {
    communityId,
    channelId,
    mediaState,
  });
}

export async function sendVoiceSdp(
  communityId: string,
  channelId: string,
  toPeer: string,
  sdpType: string,
  sdp: string,
): Promise<void> {
  return invoke("send_voice_sdp", {
    communityId,
    channelId,
    toPeer,
    sdpType,
    sdp,
  });
}

export async function sendVoiceIceCandidate(
  communityId: string,
  channelId: string,
  toPeer: string,
  candidate: string,
  sdpMid: string | null,
  sdpMlineIndex: number | null,
): Promise<void> {
  return invoke("send_voice_ice_candidate", {
    communityId,
    channelId,
    toPeer,
    candidate,
    sdpMid,
    sdpMlineIndex,
  });
}

export async function getVoiceParticipants(
  communityId: string,
  channelId: string,
): Promise<VoiceParticipant[]> {
  return invoke("get_voice_participants", { communityId, channelId });
}

// -- direct messages --

export async function sendDM(
  peerId: string,
  content: string,
): Promise<DirectMessage> {
  return invoke("send_dm", { peerId, content });
}

export async function getDMMessages(
  peerId: string,
  before?: number,
  limit?: number,
): Promise<DirectMessage[]> {
  return invoke("get_dm_messages", { peerId, before, limit });
}

export async function searchDMMessages(
  peerId: string,
  filters: DMSearchFilters,
): Promise<DirectMessage[]> {
  return invoke("search_dm_messages", {
    peerId,
    query: filters.query,
    fromFilter: filters.from_filter,
    mediaFilter: filters.media_filter,
    mentionsOnly: filters.mentions_only,
    dateAfter: filters.date_after,
    dateBefore: filters.date_before,
    limit: filters.limit,
  });
}

export async function getDMConversations(): Promise<DMConversationMeta[]> {
  return invoke("get_dm_conversations");
}

export async function markDMRead(peerId: string): Promise<void> {
  return invoke("mark_dm_read", { peerId });
}

export async function deleteDMConversation(peerId: string): Promise<void> {
  return invoke("delete_dm_conversation", { peerId });
}

export async function sendDMTyping(peerId: string): Promise<void> {
  return invoke("send_dm_typing", { peerId });
}

export async function openDMConversation(
  peerId: string,
  displayName: string,
): Promise<DMConversationMeta> {
  return invoke("open_dm_conversation", { peerId, displayName });
}

// -- gifs --

export async function searchGifs(
  query: string,
  limit?: number,
): Promise<GifResponse> {
  return invoke("search_gifs", { query, limit });
}

export async function getTrendingGifs(limit?: number): Promise<GifResponse> {
  return invoke("get_trending_gifs", { limit });
}
