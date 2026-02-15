use serde::{Deserialize, Serialize};

use super::identity::VerificationProof;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub channel_id: String,
    pub author_id: String,
    pub author_name: String,
    pub content: String,
    pub timestamp: u64,
    pub edited: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypingIndicator {
    pub peer_id: String,
    pub channel_id: String,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PresenceUpdate {
    pub peer_id: String,
    pub display_name: String,
    pub status: PeerStatus,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum PeerStatus {
    Online,
    Idle,
    Offline,
}

// peer profile announcement broadcast on the directory topic
// includes a verification proof and a signature over all fields
// so peers can reject unverified or spoofed identities
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileAnnouncement {
    pub peer_id: String,
    pub display_name: String,
    pub bio: String,
    pub public_key: String,
    pub timestamp: u64,
    pub verification_proof: Option<VerificationProof>,
    pub signature: String,
}

// broadcast when a user resets their identity, tells peers to purge their data
// signed to prevent unauthorized revocation of another peer's identity
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileRevocation {
    pub peer_id: String,
    pub public_key: String,
    pub timestamp: u64,
    pub signature: String,
}

// media state for a participant in a voice channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceMediaState {
    pub muted: bool,
    pub deafened: bool,
    pub video_enabled: bool,
    pub screen_sharing: bool,
}

// a peer currently connected to a voice channel
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceParticipant {
    pub peer_id: String,
    pub display_name: String,
    pub media_state: VoiceMediaState,
}

// a direct message between two peers
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectMessage {
    pub id: String,
    pub from_peer: String,
    pub to_peer: String,
    pub from_display_name: String,
    pub content: String,
    pub timestamp: u64,
}

// typing indicator scoped to a dm conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DMTypingIndicator {
    pub from_peer: String,
    pub to_peer: String,
    pub timestamp: u64,
}

// metadata for a persisted dm conversation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DMConversationMeta {
    pub peer_id: String,
    pub display_name: String,
    pub last_message: Option<String>,
    pub last_message_time: Option<u64>,
    pub unread_count: u32,
}

// envelope for all gossipsub-published messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GossipMessage {
    Chat(ChatMessage),
    Typing(TypingIndicator),
    Presence(PresenceUpdate),
    MetaUpdate(super::community::CommunityMeta),
    DeleteMessage {
        message_id: String,
    },
    MemberKicked {
        peer_id: String,
    },
    ProfileAnnounce(ProfileAnnouncement),
    ProfileRevoke(ProfileRevocation),
    DirectMessage(DirectMessage),
    DMTyping(DMTypingIndicator),
    VoiceJoin {
        community_id: String,
        channel_id: String,
        peer_id: String,
        display_name: String,
        media_state: VoiceMediaState,
    },
    VoiceLeave {
        community_id: String,
        channel_id: String,
        peer_id: String,
    },
    VoiceMediaStateUpdate {
        community_id: String,
        channel_id: String,
        peer_id: String,
        media_state: VoiceMediaState,
    },
    VoiceSdp {
        community_id: String,
        channel_id: String,
        from_peer: String,
        to_peer: String,
        sdp_type: String,
        sdp: String,
    },
    VoiceIceCandidate {
        community_id: String,
        channel_id: String,
        from_peer: String,
        to_peer: String,
        candidate: String,
        sdp_mid: Option<String>,
        sdp_mline_index: Option<u32>,
    },
}
