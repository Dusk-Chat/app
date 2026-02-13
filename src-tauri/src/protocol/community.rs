use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommunityMeta {
    pub id: String,
    pub name: String,
    pub description: String,
    pub created_by: String,
    pub created_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelMeta {
    pub id: String,
    pub community_id: String,
    pub name: String,
    pub topic: String,
    pub kind: ChannelKind,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChannelKind {
    Text,
    Voice,
}

// invite codes encode the minimum information needed to join a community
// deliberately excludes IP addresses to protect peer privacy
// peers discover each other via the rendezvous protocol on the relay server
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteCode {
    pub community_id: String,
    pub community_name: String,
}

impl InviteCode {
    // encode the invite as a base58 string for easy sharing
    pub fn encode(&self) -> String {
        let json = serde_json::to_vec(self).expect("failed to serialize invite code");
        bs58::encode(json).into_string()
    }

    // decode a base58 invite string back into an InviteCode
    pub fn decode(encoded: &str) -> Result<Self, String> {
        let bytes = bs58::decode(encoded)
            .into_vec()
            .map_err(|e| format!("invalid invite code encoding: {}", e))?;

        serde_json::from_slice(&bytes).map_err(|e| format!("invalid invite code format: {}", e))
    }
}

// member within a community
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Member {
    pub peer_id: String,
    pub display_name: String,
    pub status: super::messages::PeerStatus,
    pub roles: Vec<String>,
    pub trust_level: f64,
    pub joined_at: u64,
}
