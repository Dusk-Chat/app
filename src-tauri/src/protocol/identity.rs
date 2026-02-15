use libp2p::identity;
use libp2p::PeerId;
use serde::{Deserialize, Serialize};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::storage::DiskStorage;

pub struct DuskIdentity {
    pub keypair: identity::Keypair,
    pub peer_id: PeerId,
    pub display_name: String,
    pub bio: String,
    pub created_at: u64,
    pub verification_proof: Option<VerificationProof>,
}

impl DuskIdentity {
    // generate a fresh ed25519 identity
    pub fn generate(display_name: &str, bio: &str) -> Self {
        let keypair = identity::Keypair::generate_ed25519();
        let peer_id = PeerId::from(keypair.public());
        let created_at = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        Self {
            keypair,
            peer_id,
            display_name: display_name.to_string(),
            bio: bio.to_string(),
            created_at,
            verification_proof: None,
        }
    }

    // load an existing identity from disk
    pub fn load(storage: &DiskStorage) -> Result<Self, String> {
        let keypair_bytes = storage
            .load_keypair()
            .map_err(|e| format!("failed to load keypair: {}", e))?;

        let keypair = identity::Keypair::from_protobuf_encoding(&keypair_bytes)
            .map_err(|e| format!("invalid keypair data: {}", e))?;

        let peer_id = PeerId::from(keypair.public());

        let profile = storage.load_profile().unwrap_or_default();
        let verification_proof = storage.load_verification_proof().ok().flatten();

        Ok(Self {
            keypair,
            peer_id,
            display_name: profile.display_name,
            bio: profile.bio,
            created_at: profile.created_at,
            verification_proof,
        })
    }

    // persist identity to disk
    pub fn save(&self, storage: &DiskStorage) -> Result<(), String> {
        let keypair_bytes = self
            .keypair
            .to_protobuf_encoding()
            .map_err(|e| format!("failed to encode keypair: {}", e))?;

        storage
            .save_keypair(&keypair_bytes)
            .map_err(|e| format!("failed to save keypair: {}", e))?;

        let profile = ProfileData {
            display_name: self.display_name.clone(),
            bio: self.bio.clone(),
            created_at: self.created_at,
        };
        storage
            .save_profile(&profile)
            .map_err(|e| format!("failed to save profile: {}", e))?;

        Ok(())
    }

    // public-facing identity info safe to share
    pub fn public_identity(&self) -> PublicIdentity {
        let public_key_bytes = self.keypair.public().encode_protobuf();
        PublicIdentity {
            peer_id: self.peer_id.to_string(),
            display_name: self.display_name.clone(),
            public_key: hex::encode(public_key_bytes),
            bio: self.bio.clone(),
            created_at: self.created_at,
            verification_proof: self.verification_proof.clone(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicIdentity {
    pub peer_id: String,
    pub display_name: String,
    pub public_key: String,
    pub bio: String,
    pub created_at: u64,
    pub verification_proof: Option<VerificationProof>,
}

// cryptographic proof that the identity was created through human verification
// the signature binds this proof to a specific keypair so it cannot be reused
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VerificationProof {
    pub metrics_hash: String,
    pub signature: String,
    pub timestamp: u64,
    pub score: f64,
}

// profile data stored on disk alongside the keypair
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileData {
    pub display_name: String,
    pub bio: String,
    pub created_at: u64,
}

impl Default for ProfileData {
    fn default() -> Self {
        Self {
            display_name: "anonymous".to_string(),
            bio: String::new(),
            created_at: 0,
        }
    }
}

// a peer profile cached in the local user directory
// this is what other peers announce about themselves on the network
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryEntry {
    pub peer_id: String,
    pub display_name: String,
    pub bio: String,
    pub public_key: String,
    pub last_seen: u64,
    pub is_friend: bool,
}
