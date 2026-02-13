import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  PublicIdentity,
  CommunityMeta,
  ChannelMeta,
  ChatMessage,
  Member,
  DuskEvent,
  UserSettings,
  DirectoryEntry,
} from "./types";

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
): Promise<PublicIdentity> {
  return invoke("create_identity", { displayName, bio });
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
): Promise<ChannelMeta> {
  return invoke("create_channel", { communityId, name, topic });
}

export async function getChannels(communityId: string): Promise<ChannelMeta[]> {
  return invoke("get_channels", { communityId });
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

export async function resetIdentity(): Promise<void> {
  return invoke("reset_identity");
}

// -- events --

export function onDuskEvent(
  callback: (event: DuskEvent) => void,
): Promise<UnlistenFn> {
  return listen<DuskEvent>("dusk-event", (e) => callback(e.payload));
}
