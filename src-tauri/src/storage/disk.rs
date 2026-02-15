use directories::ProjectDirs;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::PathBuf;

use crate::protocol::community::CommunityMeta;
use crate::protocol::identity::{DirectoryEntry, ProfileData, VerificationProof};
use crate::protocol::messages::{DMConversationMeta, DirectMessage};

// user settings that persist across sessions
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub display_name: String,
    pub status: String,
    pub status_message: String,
    pub enable_sounds: bool,
    pub enable_desktop_notifications: bool,
    pub enable_message_preview: bool,
    pub show_online_status: bool,
    pub allow_dms_from_anyone: bool,
    pub message_display: String,
    pub font_size: String,
    #[serde(default)]
    pub custom_relay_addr: Option<String>,
}

impl Default for UserSettings {
    fn default() -> Self {
        Self {
            display_name: "anonymous".to_string(),
            status: "online".to_string(),
            status_message: String::new(),
            enable_sounds: true,
            enable_desktop_notifications: true,
            enable_message_preview: true,
            show_online_status: true,
            allow_dms_from_anyone: true,
            message_display: "cozy".to_string(),
            custom_relay_addr: None,
            font_size: "default".to_string(),
        }
    }
}

// file-based persistence for identity, documents, and community metadata
pub struct DiskStorage {
    base_dir: PathBuf,
}

impl DiskStorage {
    pub fn new() -> Result<Self, io::Error> {
        let project_dirs = ProjectDirs::from("app", "duskchat", "dusk")
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no valid home directory"))?;

        let base_dir = project_dirs.data_dir().to_path_buf();

        // ensure the directory tree exists
        fs::create_dir_all(base_dir.join("identity"))?;
        fs::create_dir_all(base_dir.join("communities"))?;
        fs::create_dir_all(base_dir.join("directory"))?;
        fs::create_dir_all(base_dir.join("dms"))?;

        Ok(Self { base_dir })
    }

    // -- identity --

    pub fn save_keypair(&self, keypair_bytes: &[u8]) -> Result<(), io::Error> {
        fs::write(self.base_dir.join("identity/keypair.bin"), keypair_bytes)
    }

    pub fn load_keypair(&self) -> Result<Vec<u8>, io::Error> {
        fs::read(self.base_dir.join("identity/keypair.bin"))
    }

    pub fn save_display_name(&self, name: &str) -> Result<(), io::Error> {
        let profile = serde_json::json!({ "display_name": name });
        fs::write(
            self.base_dir.join("identity/profile.json"),
            serde_json::to_string_pretty(&profile).unwrap(),
        )
    }

    pub fn load_display_name(&self) -> Result<String, io::Error> {
        let data = fs::read_to_string(self.base_dir.join("identity/profile.json"))?;
        let profile: serde_json::Value = serde_json::from_str(&data)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        profile["display_name"]
            .as_str()
            .map(|s| s.to_string())
            .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing display_name"))
    }

    // full profile data with bio and created_at
    pub fn save_profile(&self, profile: &ProfileData) -> Result<(), io::Error> {
        let json = serde_json::to_string_pretty(profile)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.base_dir.join("identity/profile.json"), json)
    }

    pub fn load_profile(&self) -> Result<ProfileData, io::Error> {
        let path = self.base_dir.join("identity/profile.json");
        if !path.exists() {
            return Ok(ProfileData::default());
        }
        let data = fs::read_to_string(path)?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    // check if identity exists without loading it
    pub fn has_identity(&self) -> bool {
        self.base_dir.join("identity/keypair.bin").exists()
    }

    // -- verification proof --

    pub fn save_verification_proof(&self, proof: &VerificationProof) -> Result<(), io::Error> {
        let json = serde_json::to_string_pretty(proof)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.base_dir.join("identity/verification.json"), json)
    }

    pub fn load_verification_proof(&self) -> Result<Option<VerificationProof>, io::Error> {
        let path = self.base_dir.join("identity/verification.json");
        if !path.exists() {
            return Ok(None);
        }
        let data = fs::read_to_string(path)?;
        let proof = serde_json::from_str(&data)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        Ok(Some(proof))
    }

    // -- automerge documents --

    pub fn save_document(&self, community_id: &str, doc_bytes: &[u8]) -> Result<(), io::Error> {
        let dir = self.base_dir.join(format!("communities/{}", community_id));
        fs::create_dir_all(&dir)?;
        fs::write(dir.join("document.bin"), doc_bytes)
    }

    pub fn load_document(&self, community_id: &str) -> Result<Vec<u8>, io::Error> {
        fs::read(
            self.base_dir
                .join(format!("communities/{}/document.bin", community_id)),
        )
    }

    pub fn list_communities(&self) -> Result<Vec<String>, io::Error> {
        let communities_dir = self.base_dir.join("communities");
        if !communities_dir.exists() {
            return Ok(Vec::new());
        }

        let mut ids = Vec::new();
        for entry in fs::read_dir(communities_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                if let Some(name) = entry.file_name().to_str() {
                    ids.push(name.to_string());
                }
            }
        }
        Ok(ids)
    }

    // -- community metadata cache --

    pub fn save_community_meta(&self, meta: &CommunityMeta) -> Result<(), io::Error> {
        let dir = self.base_dir.join(format!("communities/{}", meta.id));
        fs::create_dir_all(&dir)?;
        let json = serde_json::to_string_pretty(meta)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(dir.join("meta.json"), json)
    }

    pub fn load_community_meta(&self, community_id: &str) -> Result<CommunityMeta, io::Error> {
        let data = fs::read_to_string(
            self.base_dir
                .join(format!("communities/{}/meta.json", community_id)),
        )?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    // -- user settings --

    pub fn save_settings(&self, settings: &UserSettings) -> Result<(), io::Error> {
        let json = serde_json::to_string_pretty(settings)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.base_dir.join("identity/settings.json"), json)
    }

    pub fn load_settings(&self) -> Result<UserSettings, io::Error> {
        let path = self.base_dir.join("identity/settings.json");
        if !path.exists() {
            return Ok(UserSettings::default());
        }

        let data = fs::read_to_string(path)?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    // -- peer directory --

    // save a discovered peer to the local directory
    pub fn save_directory_entry(&self, entry: &DirectoryEntry) -> Result<(), io::Error> {
        let mut entries = self.load_directory().unwrap_or_default();
        entries.insert(entry.peer_id.clone(), entry.clone());
        let json = serde_json::to_string_pretty(&entries)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.base_dir.join("directory/peers.json"), json)
    }

    // load the entire peer directory
    pub fn load_directory(&self) -> Result<HashMap<String, DirectoryEntry>, io::Error> {
        let path = self.base_dir.join("directory/peers.json");
        if !path.exists() {
            return Ok(HashMap::new());
        }
        let data = fs::read_to_string(path)?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    // remove a peer from the directory
    pub fn remove_directory_entry(&self, peer_id: &str) -> Result<(), io::Error> {
        let mut entries = self.load_directory().unwrap_or_default();
        entries.remove(peer_id);
        let json = serde_json::to_string_pretty(&entries)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(self.base_dir.join("directory/peers.json"), json)
    }

    // toggle friend status for a peer
    pub fn set_friend_status(&self, peer_id: &str, is_friend: bool) -> Result<(), io::Error> {
        let mut entries = self.load_directory().unwrap_or_default();
        if let Some(entry) = entries.get_mut(peer_id) {
            entry.is_friend = is_friend;
            let json = serde_json::to_string_pretty(&entries)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
            fs::write(self.base_dir.join("directory/peers.json"), json)
        } else {
            Err(io::Error::new(
                io::ErrorKind::NotFound,
                "peer not found in directory",
            ))
        }
    }

    // -- direct messages --

    // save a dm conversation's metadata
    pub fn save_dm_conversation(
        &self,
        conversation_id: &str,
        meta: &DMConversationMeta,
    ) -> Result<(), io::Error> {
        let dir = self.base_dir.join(format!("dms/{}", conversation_id));
        fs::create_dir_all(&dir)?;
        let json = serde_json::to_string_pretty(meta)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(dir.join("meta.json"), json)
    }

    // load a single dm conversation's metadata
    pub fn load_dm_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<DMConversationMeta, io::Error> {
        let path = self
            .base_dir
            .join(format!("dms/{}/meta.json", conversation_id));
        let data = fs::read_to_string(path)?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    // load all dm conversations
    pub fn load_all_dm_conversations(
        &self,
    ) -> Result<Vec<(String, DMConversationMeta)>, io::Error> {
        let dms_dir = self.base_dir.join("dms");
        if !dms_dir.exists() {
            return Ok(Vec::new());
        }

        let mut conversations = Vec::new();
        for entry in fs::read_dir(dms_dir)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() {
                if let Some(conv_id) = entry.file_name().to_str() {
                    let meta_path = entry.path().join("meta.json");
                    if meta_path.exists() {
                        if let Ok(data) = fs::read_to_string(&meta_path) {
                            if let Ok(meta) = serde_json::from_str::<DMConversationMeta>(&data) {
                                conversations.push((conv_id.to_string(), meta));
                            }
                        }
                    }
                }
            }
        }
        Ok(conversations)
    }

    // remove a dm conversation and all its messages
    pub fn remove_dm_conversation(&self, conversation_id: &str) -> Result<(), io::Error> {
        let dir = self.base_dir.join(format!("dms/{}", conversation_id));
        if dir.exists() {
            fs::remove_dir_all(&dir)?;
        }
        Ok(())
    }

    // append a message to a dm conversation's message log
    pub fn append_dm_message(
        &self,
        conversation_id: &str,
        message: &DirectMessage,
    ) -> Result<(), io::Error> {
        let dir = self.base_dir.join(format!("dms/{}", conversation_id));
        fs::create_dir_all(&dir)?;

        let messages_path = dir.join("messages.json");
        let mut messages: Vec<DirectMessage> = if messages_path.exists() {
            let data = fs::read_to_string(&messages_path)?;
            serde_json::from_str(&data).unwrap_or_default()
        } else {
            Vec::new()
        };

        messages.push(message.clone());

        let json = serde_json::to_string_pretty(&messages)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
        fs::write(&messages_path, json)
    }

    // load dm messages with optional pagination
    pub fn load_dm_messages(
        &self,
        conversation_id: &str,
        before: Option<u64>,
        limit: usize,
    ) -> Result<Vec<DirectMessage>, io::Error> {
        let messages_path = self
            .base_dir
            .join(format!("dms/{}/messages.json", conversation_id));
        if !messages_path.exists() {
            return Ok(Vec::new());
        }

        let data = fs::read_to_string(&messages_path)?;
        let messages: Vec<DirectMessage> = serde_json::from_str(&data)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let filtered: Vec<DirectMessage> = if let Some(before_ts) = before {
            messages
                .into_iter()
                .filter(|m| m.timestamp < before_ts)
                .collect()
        } else {
            messages
        };

        // return the last `limit` messages (most recent)
        let start = if filtered.len() > limit {
            filtered.len() - limit
        } else {
            0
        };
        Ok(filtered[start..].to_vec())
    }

    // wipe all user data - identity, communities, directory, dms, settings
    // used when resetting identity to leave no traces on this client
    pub fn wipe_all_data(&self) -> Result<(), io::Error> {
        let identity_dir = self.base_dir.join("identity");
        if identity_dir.exists() {
            fs::remove_dir_all(&identity_dir)?;
        }

        let communities_dir = self.base_dir.join("communities");
        if communities_dir.exists() {
            fs::remove_dir_all(&communities_dir)?;
        }

        let directory_dir = self.base_dir.join("directory");
        if directory_dir.exists() {
            fs::remove_dir_all(&directory_dir)?;
        }

        let dms_dir = self.base_dir.join("dms");
        if dms_dir.exists() {
            fs::remove_dir_all(&dms_dir)?;
        }

        // recreate the directory tree so the app can still function
        fs::create_dir_all(self.base_dir.join("identity"))?;
        fs::create_dir_all(self.base_dir.join("communities"))?;
        fs::create_dir_all(self.base_dir.join("directory"))?;
        fs::create_dir_all(self.base_dir.join("dms"))?;

        Ok(())
    }
}
