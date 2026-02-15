// shared type definitions mirroring the rust structs
// this is the single source of truth for the frontend-backend contract

export interface VerificationProof {
  metrics_hash: string;
  signature: string;
  timestamp: number;
  score: number;
}

export interface PublicIdentity {
  peer_id: string;
  display_name: string;
  public_key: string;
  bio: string;
  created_at: number;
  verification_proof?: VerificationProof;
}

// raw challenge data sent to the rust backend for server-side analysis
export interface MouseSampleExport {
  x: number;
  y: number;
  t: number;
}

export interface SegmentExport {
  fromTarget: number;
  toTarget: number;
  samples: MouseSampleExport[];
  clickTime: number;
  startTime: number;
}

export interface TargetCircleExport {
  id: number;
  x: number;
  y: number;
}

export interface ChallengeExport {
  segments: SegmentExport[];
  circles: TargetCircleExport[];
  totalStartTime: number;
  totalEndTime: number;
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
  position: number;
  category_id: string | null;
}

// user-defined grouping for channels within a community
export interface CategoryMeta {
  id: string;
  community_id: string;
  name: string;
  position: number;
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

// a direct message between two peers
export interface DirectMessage {
  id: string;
  from_peer: string;
  to_peer: string;
  from_display_name: string;
  content: string;
  timestamp: number;
}

// metadata for a persisted dm conversation
export interface DMConversationMeta {
  peer_id: string;
  display_name: string;
  last_message: string | null;
  last_message_time: number | null;
  unread_count: number;
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

// media state for a participant in a voice channel
export interface VoiceMediaState {
  muted: boolean;
  deafened: boolean;
  video_enabled: boolean;
  screen_sharing: boolean;
}

// a peer currently connected to a voice channel
export interface VoiceParticipant {
  peer_id: string;
  display_name: string;
  media_state: VoiceMediaState;
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
      payload: {
        peer_id: string;
        display_name: string;
        bio: string;
        public_key: string;
      };
    }
  | { kind: "profile_revoked"; payload: { peer_id: string } }
  | { kind: "relay_status"; payload: { connected: boolean } }
  | {
      kind: "voice_participant_joined";
      payload: {
        community_id: string;
        channel_id: string;
        peer_id: string;
        display_name: string;
        media_state: VoiceMediaState;
      };
    }
  | {
      kind: "voice_participant_left";
      payload: {
        community_id: string;
        channel_id: string;
        peer_id: string;
      };
    }
  | {
      kind: "voice_media_state_changed";
      payload: {
        community_id: string;
        channel_id: string;
        peer_id: string;
        media_state: VoiceMediaState;
      };
    }
  | {
      kind: "voice_sdp_received";
      payload: {
        community_id: string;
        channel_id: string;
        from_peer: string;
        sdp_type: string;
        sdp: string;
      };
    }
  | {
      kind: "voice_ice_candidate_received";
      payload: {
        community_id: string;
        channel_id: string;
        from_peer: string;
        candidate: string;
        sdp_mid: string | null;
        sdp_mline_index: number | null;
      };
    }
  | { kind: "dm_received"; payload: DirectMessage }
  | { kind: "dm_typing"; payload: { peer_id: string } };
