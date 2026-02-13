use serde::{Deserialize, Serialize};

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
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileAnnouncement {
    pub peer_id: String,
    pub display_name: String,
    pub bio: String,
    pub public_key: String,
    pub timestamp: u64,
}

// broadcast when a user resets their identity, tells peers to purge their data
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileRevocation {
    pub peer_id: String,
    pub public_key: String,
    pub timestamp: u64,
}

// envelope for all gossipsub-published messages
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum GossipMessage {
    Chat(ChatMessage),
    Typing(TypingIndicator),
    Presence(PresenceUpdate),
    MetaUpdate(super::community::CommunityMeta),
    DeleteMessage { message_id: String },
    MemberKicked { peer_id: String },
    ProfileAnnounce(ProfileAnnouncement),
    ProfileRevoke(ProfileRevocation),
}
