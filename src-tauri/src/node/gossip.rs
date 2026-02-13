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
