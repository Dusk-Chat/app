// shared type definitions mirroring the rust structs
// this is the single source of truth for the frontend-backend contract

export interface PublicIdentity {
  peer_id: string;
  display_name: string;
  public_key: string;
  bio: string;
  created_at: number;
}

export type UserStatus = "online" | "idle" | "dnd" | "invisible";

export interface UserSettings {
  // profile
  display_name: string;
  status: UserStatus;
  status_message: string;

  // notifications
  enable_sounds: boolean;
  enable_desktop_notifications: boolean;
  enable_message_preview: boolean;

  // privacy
  show_online_status: boolean;
  allow_dms_from_anyone: boolean;

  // appearance
  message_display: "cozy" | "compact";
  font_size: "small" | "default" | "large";
}

export interface CommunityMeta {
  id: string;
  name: string;
  description: string;
  created_by: string;
  created_at: number;
}

export interface ChannelMeta {
  id: string;
  community_id: string;
  name: string;
  topic: string;
  kind: "Text" | "Voice";
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  author_id: string;
  author_name: string;
  content: string;
  timestamp: number;
  edited: boolean;
}

export interface Member {
  peer_id: string;
  display_name: string;
  status: "Online" | "Idle" | "Offline";
  roles: string[];
  trust_level: number;
  joined_at: number;
}

export interface NodeStatus {
  is_connected: boolean;
  peer_count: number;
  status: "starting" | "running" | "stopped" | "error";
}

// a cached peer profile from the local directory
export interface DirectoryEntry {
  peer_id: string;
  display_name: string;
  bio: string;
  public_key: string;
  last_seen: number;
  is_friend: boolean;
}

// discriminated union for events emitted from rust
export type DuskEvent =
  | { kind: "message_received"; payload: ChatMessage }
  | { kind: "message_deleted"; payload: { message_id: string } }
  | { kind: "member_kicked"; payload: { peer_id: string } }
  | { kind: "peer_connected"; payload: { peer_id: string } }
  | { kind: "peer_disconnected"; payload: { peer_id: string } }
  | { kind: "typing"; payload: { peer_id: string; channel_id: string } }
  | { kind: "node_status"; payload: NodeStatus }
  | { kind: "sync_complete"; payload: { community_id: string } }
  | {
      kind: "profile_received";
      payload: { peer_id: string; display_name: string; bio: string };
    }
  | { kind: "profile_revoked"; payload: { peer_id: string } };
