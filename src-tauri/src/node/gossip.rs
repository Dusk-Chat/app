// gossipsub topic naming conventions for the dusk protocol
// topics encode the routing path for different message types

pub fn topic_for_messages(community_id: &str, channel_id: &str) -> String {
    format!(
        "dusk/community/{}/channel/{}/messages",
        community_id, channel_id
    )
}

pub fn topic_for_typing(community_id: &str, channel_id: &str) -> String {
    format!(
        "dusk/community/{}/channel/{}/typing",
        community_id, channel_id
    )
}

pub fn topic_for_presence(community_id: &str) -> String {
    format!("dusk/community/{}/presence", community_id)
}

pub fn topic_for_meta(community_id: &str) -> String {
    format!("dusk/community/{}/meta", community_id)
}

// global topic for user profile announcements and directory discovery
pub fn topic_for_directory() -> String {
    "dusk/directory".to_string()
}

// global sync topic used to exchange full document snapshots between peers
pub fn topic_for_sync() -> String {
    "dusk/sync".to_string()
}

// voice signaling topic for webrtc sdp/ice exchange and presence
pub fn topic_for_voice(community_id: &str, channel_id: &str) -> String {
    format!(
        "dusk/community/{}/channel/{}/voice",
        community_id, channel_id
    )
}

// personal inbox topic for receiving first-time dms from peers we haven't
// subscribed to yet. every peer subscribes to their own inbox on startup.
pub fn topic_for_dm_inbox(peer_id: &str) -> String {
    format!("dusk/dm/inbox/{}", peer_id)
}

// dm topic between two peers, sorted alphabetically so both peers derive the same topic
pub fn topic_for_dm(peer_a: &str, peer_b: &str) -> String {
    let (first, second) = if peer_a < peer_b {
        (peer_a, peer_b)
    } else {
        (peer_b, peer_a)
    };
    format!("dusk/dm/{}/{}", first, second)
}

// derive a stable conversation id from two peer ids
pub fn dm_conversation_id(peer_a: &str, peer_b: &str) -> String {
    let (first, second) = if peer_a < peer_b {
        (peer_a, peer_b)
    } else {
        (peer_b, peer_a)
    };
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    first.hash(&mut hasher);
    second.hash(&mut hasher);
    format!("dm_{:016x}", hasher.finish())
}
