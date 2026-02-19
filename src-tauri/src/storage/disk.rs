use directories::ProjectDirs;
use rusqlite::types::Value as SqlValue;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::time::Duration;

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
    #[serde(default = "default_true")]
    pub relay_discoverable: bool,
}

fn default_true() -> bool { true }

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
            relay_discoverable: true,
        }
    }
}

#[derive(Debug, Clone)]
pub struct DmSearchParams {
    pub query: Option<String>,
    pub from_peer: Option<String>,
    pub media_filter: Option<String>,
    pub mentions_only: bool,
    pub date_after: Option<u64>,
    pub date_before: Option<u64>,
    pub limit: usize,
}

impl Default for DmSearchParams {
    fn default() -> Self {
        Self {
            query: None,
            from_peer: None,
            media_filter: None,
            mentions_only: false,
            date_after: None,
            date_before: None,
            limit: 200,
        }
    }
}

// sqlite-based persistence for identity, documents, and direct messages
pub struct DiskStorage {
    base_dir: PathBuf,
    db_path: PathBuf,
    fts_enabled: bool,
}

impl DiskStorage {
    pub fn new() -> Result<Self, io::Error> {
        let project_dirs = ProjectDirs::from("app", "duskchat", "dusk")
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "no valid home directory"))?;

        let base_dir = project_dirs.data_dir().to_path_buf();

        // keep legacy directories so we can migrate existing installs safely
        fs::create_dir_all(base_dir.join("identity"))?;
        fs::create_dir_all(base_dir.join("communities"))?;
        fs::create_dir_all(base_dir.join("directory"))?;
        fs::create_dir_all(base_dir.join("dms"))?;

        let db_path = base_dir.join("storage.sqlite3");
        let conn = Self::open_conn_at(&db_path)?;
        conn.execute_batch(
            r#"
            PRAGMA journal_mode = WAL;
            PRAGMA synchronous = NORMAL;
            PRAGMA foreign_keys = ON;

            CREATE TABLE IF NOT EXISTS app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS key_value (
                key TEXT PRIMARY KEY,
                value BLOB NOT NULL
            );

            CREATE TABLE IF NOT EXISTS profile (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                display_name TEXT NOT NULL,
                bio TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS verification_proof (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS community_documents (
                community_id TEXT PRIMARY KEY,
                document BLOB NOT NULL
            );

            CREATE TABLE IF NOT EXISTS community_meta (
                community_id TEXT PRIMARY KEY,
                meta_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS directory_entries (
                peer_id TEXT PRIMARY KEY,
                display_name TEXT NOT NULL,
                bio TEXT NOT NULL,
                public_key TEXT NOT NULL,
                last_seen INTEGER NOT NULL,
                is_friend INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dm_conversations (
                conversation_id TEXT PRIMARY KEY,
                peer_id TEXT NOT NULL,
                display_name TEXT NOT NULL,
                last_message TEXT,
                last_message_time INTEGER,
                unread_count INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS dm_messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                from_peer TEXT NOT NULL,
                to_peer TEXT NOT NULL,
                from_display_name TEXT NOT NULL,
                content TEXT NOT NULL,
                timestamp INTEGER NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_community_documents_id
                ON community_documents (community_id);

            CREATE INDEX IF NOT EXISTS idx_directory_last_seen
                ON directory_entries (last_seen DESC);

            CREATE INDEX IF NOT EXISTS idx_dm_conversations_last_message_time
                ON dm_conversations (last_message_time DESC);

            CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_timestamp
                ON dm_messages (conversation_id, timestamp DESC);

            CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation_sender
                ON dm_messages (conversation_id, from_peer, timestamp DESC);
            "#,
        )
        .map_err(sqlite_to_io_error)?;

        let fts_enabled = conn
            .execute_batch(
                r#"
                CREATE VIRTUAL TABLE IF NOT EXISTS dm_message_fts USING fts5(
                    message_id UNINDEXED,
                    conversation_id UNINDEXED,
                    content
                );
                "#,
            )
            .is_ok();

        drop(conn);

        let storage = Self {
            base_dir,
            db_path,
            fts_enabled,
        };

        storage.migrate_legacy_if_needed()?;

        Ok(storage)
    }

    fn open_conn(&self) -> Result<Connection, io::Error> {
        Self::open_conn_at(&self.db_path)
    }

    fn open_conn_at(db_path: &PathBuf) -> Result<Connection, io::Error> {
        let conn = Connection::open(db_path).map_err(sqlite_to_io_error)?;
        let _ = conn.busy_timeout(Duration::from_secs(5));
        let _ = conn.pragma_update(None, "foreign_keys", "ON");
        Ok(conn)
    }

    fn migrate_legacy_if_needed(&self) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        let migrated = conn
            .query_row(
                "SELECT value FROM app_meta WHERE key = 'legacy_migrated'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(sqlite_to_io_error)?;
        drop(conn);

        if migrated.as_deref() == Some("1") {
            return Ok(());
        }

        self.migrate_legacy_files()?;

        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('legacy_migrated', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(sqlite_to_io_error)?;

        // best-effort cleanup so migrated installs no longer carry stale json files
        let _ = self.cleanup_legacy_files();

        Ok(())
    }

    fn migrate_legacy_files(&self) -> Result<(), io::Error> {
        self.migrate_legacy_identity()?;
        self.migrate_legacy_communities()?;
        self.migrate_legacy_directory()?;
        self.migrate_legacy_dms()?;

        if self.fts_enabled {
            self.rebuild_dm_fts_index()?;
        }

        Ok(())
    }

    fn migrate_legacy_identity(&self) -> Result<(), io::Error> {
        let keypair_path = self.base_dir.join("identity/keypair.bin");
        if keypair_path.exists() {
            let keypair = fs::read(keypair_path)?;
            let _ = self.save_keypair(&keypair);
        }

        let profile_path = self.base_dir.join("identity/profile.json");
        if profile_path.exists() {
            if let Ok(data) = fs::read_to_string(&profile_path) {
                if let Ok(profile) = serde_json::from_str::<ProfileData>(&data) {
                    let _ = self.save_profile(&profile);
                } else if let Ok(value) = serde_json::from_str::<serde_json::Value>(&data) {
                    if let Some(display_name) = value["display_name"].as_str() {
                        let mut profile = ProfileData::default();
                        profile.display_name = display_name.to_string();
                        if let Some(bio) = value["bio"].as_str() {
                            profile.bio = bio.to_string();
                        }
                        if let Some(created_at) = value["created_at"].as_u64() {
                            profile.created_at = created_at;
                        }
                        let _ = self.save_profile(&profile);
                    }
                }
            }
        }

        let settings_path = self.base_dir.join("identity/settings.json");
        if settings_path.exists() {
            if let Ok(data) = fs::read_to_string(settings_path) {
                if let Ok(settings) = serde_json::from_str::<UserSettings>(&data) {
                    let _ = self.save_settings(&settings);
                }
            }
        }

        let proof_path = self.base_dir.join("identity/verification.json");
        if proof_path.exists() {
            if let Ok(data) = fs::read_to_string(proof_path) {
                if let Ok(proof) = serde_json::from_str::<VerificationProof>(&data) {
                    let _ = self.save_verification_proof(&proof);
                }
            }
        }

        Ok(())
    }

    fn migrate_legacy_communities(&self) -> Result<(), io::Error> {
        let communities_dir = self.base_dir.join("communities");
        if !communities_dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(communities_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }

            let community_id = match entry.file_name().into_string() {
                Ok(id) => id,
                Err(_) => continue,
            };

            let doc_path = entry.path().join("document.bin");
            if doc_path.exists() {
                if let Ok(bytes) = fs::read(&doc_path) {
                    let _ = self.save_document(&community_id, &bytes);
                }
            }

            let meta_path = entry.path().join("meta.json");
            if meta_path.exists() {
                if let Ok(data) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<CommunityMeta>(&data) {
                        let _ = self.save_community_meta(&meta);
                    }
                }
            }
        }

        Ok(())
    }

    fn migrate_legacy_directory(&self) -> Result<(), io::Error> {
        let directory_path = self.base_dir.join("directory/peers.json");
        if !directory_path.exists() {
            return Ok(());
        }

        let data = fs::read_to_string(directory_path)?;
        let entries =
            serde_json::from_str::<HashMap<String, DirectoryEntry>>(&data).unwrap_or_default();

        for entry in entries.values() {
            let _ = self.save_directory_entry(entry);
        }

        Ok(())
    }

    fn migrate_legacy_dms(&self) -> Result<(), io::Error> {
        let dms_dir = self.base_dir.join("dms");
        if !dms_dir.exists() {
            return Ok(());
        }

        for entry in fs::read_dir(dms_dir)? {
            let entry = entry?;
            if !entry.file_type()?.is_dir() {
                continue;
            }

            let conversation_id = match entry.file_name().into_string() {
                Ok(id) => id,
                Err(_) => continue,
            };

            let meta_path = entry.path().join("meta.json");
            if meta_path.exists() {
                if let Ok(data) = fs::read_to_string(&meta_path) {
                    if let Ok(meta) = serde_json::from_str::<DMConversationMeta>(&data) {
                        let _ = self.save_dm_conversation(&conversation_id, &meta);
                    }
                }
            }

            let messages_path = entry.path().join("messages.json");
            if messages_path.exists() {
                if let Ok(data) = fs::read_to_string(&messages_path) {
                    if let Ok(messages) = serde_json::from_str::<Vec<DirectMessage>>(&data) {
                        for message in &messages {
                            let _ = self.append_dm_message(&conversation_id, message);
                        }
                    }
                }
            }
        }

        Ok(())
    }

    fn rebuild_dm_fts_index(&self) -> Result<(), io::Error> {
        if !self.fts_enabled {
            return Ok(());
        }

        let conn = self.open_conn()?;
        conn.execute("DELETE FROM dm_message_fts", [])
            .map_err(sqlite_to_io_error)?;

        let mut stmt = conn
            .prepare(
                "SELECT id, conversation_id, content
                 FROM dm_messages",
            )
            .map_err(sqlite_to_io_error)?;

        let rows = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(sqlite_to_io_error)?;

        for row in rows {
            let (id, conversation_id, content) = row.map_err(sqlite_to_io_error)?;
            conn.execute(
                "INSERT INTO dm_message_fts (message_id, conversation_id, content)
                 VALUES (?1, ?2, ?3)",
                params![id, conversation_id, content],
            )
            .map_err(sqlite_to_io_error)?;
        }

        Ok(())
    }

    fn cleanup_legacy_files(&self) -> Result<(), io::Error> {
        remove_if_exists(self.base_dir.join("identity/keypair.bin"))?;
        remove_if_exists(self.base_dir.join("identity/profile.json"))?;
        remove_if_exists(self.base_dir.join("identity/settings.json"))?;
        remove_if_exists(self.base_dir.join("identity/verification.json"))?;
        remove_if_exists(self.base_dir.join("directory/peers.json"))?;

        clear_dir(self.base_dir.join("communities"))?;
        clear_dir(self.base_dir.join("dms"))?;

        Ok(())
    }

    // -- identity --

    pub fn save_keypair(&self, keypair_bytes: &[u8]) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO key_value (key, value) VALUES ('identity_keypair', ?1)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![keypair_bytes],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    pub fn load_keypair(&self) -> Result<Vec<u8>, io::Error> {
        let conn = self.open_conn()?;
        let value = conn
            .query_row(
                "SELECT value FROM key_value WHERE key = 'identity_keypair'",
                [],
                |row| row.get::<_, Vec<u8>>(0),
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        value.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "keypair not found"))
    }

    pub fn save_display_name(&self, name: &str) -> Result<(), io::Error> {
        let mut profile = self.load_profile().unwrap_or_default();
        profile.display_name = name.to_string();
        self.save_profile(&profile)
    }

    pub fn load_display_name(&self) -> Result<String, io::Error> {
        self.load_profile().map(|p| p.display_name)
    }

    // full profile data with bio and created_at
    pub fn save_profile(&self, profile: &ProfileData) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO profile (id, display_name, bio, created_at)
             VALUES (1, ?1, ?2, ?3)
             ON CONFLICT(id) DO UPDATE SET
               display_name = excluded.display_name,
               bio = excluded.bio,
               created_at = excluded.created_at",
            params![profile.display_name, profile.bio, profile.created_at as i64],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    pub fn load_profile(&self) -> Result<ProfileData, io::Error> {
        let conn = self.open_conn()?;
        let profile = conn
            .query_row(
                "SELECT display_name, bio, created_at FROM profile WHERE id = 1",
                [],
                |row| {
                    let created_at: i64 = row.get(2)?;
                    Ok(ProfileData {
                        display_name: row.get(0)?,
                        bio: row.get(1)?,
                        created_at: created_at.max(0) as u64,
                    })
                },
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        Ok(profile.unwrap_or_default())
    }

    // check if identity exists without loading it
    pub fn has_identity(&self) -> bool {
        self.load_keypair().is_ok()
    }

    // -- verification proof --

    pub fn save_verification_proof(&self, proof: &VerificationProof) -> Result<(), io::Error> {
        let json = serde_json::to_string(proof)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO verification_proof (id, json)
             VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json",
            params![json],
        )
        .map_err(sqlite_to_io_error)?;

        Ok(())
    }

    pub fn load_verification_proof(&self) -> Result<Option<VerificationProof>, io::Error> {
        let conn = self.open_conn()?;
        let json = conn
            .query_row(
                "SELECT json FROM verification_proof WHERE id = 1",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        match json {
            Some(data) => {
                let proof = serde_json::from_str::<VerificationProof>(&data)
                    .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;
                Ok(Some(proof))
            }
            None => Ok(None),
        }
    }

    // -- automerge documents --

    pub fn save_document(&self, community_id: &str, doc_bytes: &[u8]) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO community_documents (community_id, document)
             VALUES (?1, ?2)
             ON CONFLICT(community_id) DO UPDATE SET document = excluded.document",
            params![community_id, doc_bytes],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    pub fn load_document(&self, community_id: &str) -> Result<Vec<u8>, io::Error> {
        let conn = self.open_conn()?;
        let bytes = conn
            .query_row(
                "SELECT document FROM community_documents WHERE community_id = ?1",
                params![community_id],
                |row| row.get::<_, Vec<u8>>(0),
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        bytes.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "community document not found"))
    }

    pub fn delete_document(&self, community_id: &str) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "DELETE FROM community_documents WHERE community_id = ?1",
            params![community_id],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    pub fn list_communities(&self) -> Result<Vec<String>, io::Error> {
        let conn = self.open_conn()?;
        let mut stmt = conn
            .prepare("SELECT community_id FROM community_documents ORDER BY community_id")
            .map_err(sqlite_to_io_error)?;

        let ids = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(sqlite_to_io_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(sqlite_to_io_error)?;

        Ok(ids)
    }

    // -- community metadata cache --

    pub fn save_community_meta(&self, meta: &CommunityMeta) -> Result<(), io::Error> {
        let json = serde_json::to_string(meta)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO community_meta (community_id, meta_json)
             VALUES (?1, ?2)
             ON CONFLICT(community_id) DO UPDATE SET meta_json = excluded.meta_json",
            params![meta.id, json],
        )
        .map_err(sqlite_to_io_error)?;

        Ok(())
    }

    pub fn load_community_meta(&self, community_id: &str) -> Result<CommunityMeta, io::Error> {
        let conn = self.open_conn()?;
        let json = conn
            .query_row(
                "SELECT meta_json FROM community_meta WHERE community_id = ?1",
                params![community_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        let data = json
            .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "community meta not found"))?;
        serde_json::from_str(&data).map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))
    }

    pub fn delete_community_meta(&self, community_id: &str) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "DELETE FROM community_meta WHERE community_id = ?1",
            params![community_id],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    // -- user settings --

    pub fn save_settings(&self, settings: &UserSettings) -> Result<(), io::Error> {
        let json = serde_json::to_string(settings)
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e))?;

        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO settings (id, json)
             VALUES (1, ?1)
             ON CONFLICT(id) DO UPDATE SET json = excluded.json",
            params![json],
        )
        .map_err(sqlite_to_io_error)?;

        Ok(())
    }

    pub fn load_settings(&self) -> Result<UserSettings, io::Error> {
        let conn = self.open_conn()?;
        let json = conn
            .query_row("SELECT json FROM settings WHERE id = 1", [], |row| {
                row.get::<_, String>(0)
            })
            .optional()
            .map_err(sqlite_to_io_error)?;

        match json {
            Some(data) => serde_json::from_str(&data)
                .map_err(|e| io::Error::new(io::ErrorKind::InvalidData, e)),
            None => Ok(UserSettings::default()),
        }
    }

    // -- peer directory --

    // save a discovered peer to the local directory
    pub fn save_directory_entry(&self, entry: &DirectoryEntry) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO directory_entries (
                peer_id, display_name, bio, public_key, last_seen, is_friend
            )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(peer_id) DO UPDATE SET
                display_name = excluded.display_name,
                bio = excluded.bio,
                public_key = excluded.public_key,
                last_seen = excluded.last_seen,
                is_friend = excluded.is_friend",
            params![
                entry.peer_id,
                entry.display_name,
                entry.bio,
                entry.public_key,
                entry.last_seen as i64,
                if entry.is_friend { 1_i64 } else { 0_i64 }
            ],
        )
        .map_err(sqlite_to_io_error)?;

        Ok(())
    }

    // upsert a directory entry from the relay — updates display_name and last_seen but preserves bio, public_key, and is_friend
    pub fn save_directory_entry_if_new(&self, entry: &DirectoryEntry) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO directory_entries (
                peer_id, display_name, bio, public_key, last_seen, is_friend
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            ON CONFLICT(peer_id) DO UPDATE SET
                display_name = excluded.display_name,
                last_seen    = CASE WHEN excluded.last_seen > last_seen THEN excluded.last_seen ELSE last_seen END",
            params![
                entry.peer_id,
                entry.display_name,
                entry.bio,
                entry.public_key,
                entry.last_seen as i64,
                if entry.is_friend { 1_i64 } else { 0_i64 }
            ],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    // load the entire peer directory
    pub fn load_directory(&self) -> Result<HashMap<String, DirectoryEntry>, io::Error> {
        let conn = self.open_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT peer_id, display_name, bio, public_key, last_seen, is_friend
                 FROM directory_entries",
            )
            .map_err(sqlite_to_io_error)?;

        let rows = stmt
            .query_map([], |row| {
                let peer_id: String = row.get(0)?;
                let last_seen: i64 = row.get(4)?;
                let is_friend: i64 = row.get(5)?;

                Ok((
                    peer_id.clone(),
                    DirectoryEntry {
                        peer_id,
                        display_name: row.get(1)?,
                        bio: row.get(2)?,
                        public_key: row.get(3)?,
                        last_seen: last_seen.max(0) as u64,
                        is_friend: is_friend != 0,
                    },
                ))
            })
            .map_err(sqlite_to_io_error)?;

        let mut entries = HashMap::new();
        for row in rows {
            let (peer_id, entry) = row.map_err(sqlite_to_io_error)?;
            entries.insert(peer_id, entry);
        }

        Ok(entries)
    }

    // remove a peer from the directory
    pub fn remove_directory_entry(&self, peer_id: &str) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "DELETE FROM directory_entries WHERE peer_id = ?1",
            params![peer_id],
        )
        .map_err(sqlite_to_io_error)?;
        Ok(())
    }

    // toggle friend status for a peer
    pub fn set_friend_status(&self, peer_id: &str, is_friend: bool) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        let changed = conn
            .execute(
                "UPDATE directory_entries
                 SET is_friend = ?2
                 WHERE peer_id = ?1",
                params![peer_id, if is_friend { 1_i64 } else { 0_i64 }],
            )
            .map_err(sqlite_to_io_error)?;

        if changed == 0 {
            return Err(io::Error::new(
                io::ErrorKind::NotFound,
                "peer not found in directory",
            ));
        }

        Ok(())
    }

    // -- direct messages --

    // save a dm conversation's metadata
    pub fn save_dm_conversation(
        &self,
        conversation_id: &str,
        meta: &DMConversationMeta,
    ) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        conn.execute(
            "INSERT INTO dm_conversations (
                conversation_id, peer_id, display_name, last_message, last_message_time, unread_count
            )
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(conversation_id) DO UPDATE SET
                peer_id = excluded.peer_id,
                display_name = excluded.display_name,
                last_message = excluded.last_message,
                last_message_time = excluded.last_message_time,
                unread_count = excluded.unread_count",
            params![
                conversation_id,
                meta.peer_id,
                meta.display_name,
                meta.last_message,
                meta.last_message_time.map(|ts| ts as i64),
                meta.unread_count as i64
            ],
        )
        .map_err(sqlite_to_io_error)?;

        Ok(())
    }

    // load a single dm conversation's metadata
    pub fn load_dm_conversation(
        &self,
        conversation_id: &str,
    ) -> Result<DMConversationMeta, io::Error> {
        let conn = self.open_conn()?;

        let meta = conn
            .query_row(
                "SELECT peer_id, display_name, last_message, last_message_time, unread_count
                 FROM dm_conversations
                 WHERE conversation_id = ?1",
                params![conversation_id],
                |row| {
                    let last_message_time: Option<i64> = row.get(3)?;
                    let unread_count: i64 = row.get(4)?;

                    Ok(DMConversationMeta {
                        peer_id: row.get(0)?,
                        display_name: row.get(1)?,
                        last_message: row.get(2)?,
                        last_message_time: last_message_time.map(|ts| ts.max(0) as u64),
                        unread_count: unread_count.max(0) as u32,
                    })
                },
            )
            .optional()
            .map_err(sqlite_to_io_error)?;

        meta.ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "dm conversation not found"))
    }

    // load all dm conversations
    pub fn load_all_dm_conversations(
        &self,
    ) -> Result<Vec<(String, DMConversationMeta)>, io::Error> {
        let conn = self.open_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT
                    conversation_id,
                    peer_id,
                    display_name,
                    last_message,
                    last_message_time,
                    unread_count
                 FROM dm_conversations
                 ORDER BY COALESCE(last_message_time, 0) DESC, display_name ASC",
            )
            .map_err(sqlite_to_io_error)?;

        let rows = stmt
            .query_map([], |row| {
                let last_message_time: Option<i64> = row.get(4)?;
                let unread_count: i64 = row.get(5)?;

                Ok((
                    row.get::<_, String>(0)?,
                    DMConversationMeta {
                        peer_id: row.get(1)?,
                        display_name: row.get(2)?,
                        last_message: row.get(3)?,
                        last_message_time: last_message_time.map(|ts| ts.max(0) as u64),
                        unread_count: unread_count.max(0) as u32,
                    },
                ))
            })
            .map_err(sqlite_to_io_error)?;

        let mut conversations = Vec::new();
        for row in rows {
            conversations.push(row.map_err(sqlite_to_io_error)?);
        }

        Ok(conversations)
    }

    // remove a dm conversation and all its messages
    pub fn remove_dm_conversation(&self, conversation_id: &str) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        let tx = conn.unchecked_transaction().map_err(sqlite_to_io_error)?;

        tx.execute(
            "DELETE FROM dm_messages WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(sqlite_to_io_error)?;

        tx.execute(
            "DELETE FROM dm_conversations WHERE conversation_id = ?1",
            params![conversation_id],
        )
        .map_err(sqlite_to_io_error)?;

        if self.fts_enabled {
            tx.execute(
                "DELETE FROM dm_message_fts WHERE conversation_id = ?1",
                params![conversation_id],
            )
            .map_err(sqlite_to_io_error)?;
        }

        tx.commit().map_err(sqlite_to_io_error)?;
        Ok(())
    }

    // append a message to a dm conversation's message log
    pub fn append_dm_message(
        &self,
        conversation_id: &str,
        message: &DirectMessage,
    ) -> Result<(), io::Error> {
        let conn = self.open_conn()?;
        let tx = conn.unchecked_transaction().map_err(sqlite_to_io_error)?;

        // ensure a placeholder conversation exists so writes never fail on first contact
        tx.execute(
            "INSERT INTO dm_conversations (
                conversation_id, peer_id, display_name, last_message, last_message_time, unread_count
            ) VALUES (?1, ?2, ?3, NULL, NULL, 0)
            ON CONFLICT(conversation_id) DO NOTHING",
            params![conversation_id, message.from_peer, message.from_display_name],
        )
        .map_err(sqlite_to_io_error)?;

        let inserted = tx
            .execute(
                "INSERT OR IGNORE INTO dm_messages (
                    id, conversation_id, from_peer, to_peer, from_display_name, content, timestamp
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    message.id,
                    conversation_id,
                    message.from_peer,
                    message.to_peer,
                    message.from_display_name,
                    message.content,
                    message.timestamp as i64
                ],
            )
            .map_err(sqlite_to_io_error)?;

        if inserted > 0 && self.fts_enabled {
            tx.execute(
                "INSERT INTO dm_message_fts (message_id, conversation_id, content)
                 VALUES (?1, ?2, ?3)",
                params![message.id, conversation_id, message.content],
            )
            .map_err(sqlite_to_io_error)?;
        }

        tx.commit().map_err(sqlite_to_io_error)?;
        Ok(())
    }

    // load dm messages with optional pagination
    pub fn load_dm_messages(
        &self,
        conversation_id: &str,
        before: Option<u64>,
        limit: usize,
    ) -> Result<Vec<DirectMessage>, io::Error> {
        if limit == 0 {
            return Ok(Vec::new());
        }

        let conn = self.open_conn()?;
        let mut sql = String::from(
            "SELECT id, from_peer, to_peer, from_display_name, content, timestamp
             FROM dm_messages
             WHERE conversation_id = ?1",
        );

        let mut values: Vec<SqlValue> = vec![SqlValue::Text(conversation_id.to_string())];

        if let Some(before_ts) = before {
            sql.push_str(" AND timestamp < ?2");
            values.push(SqlValue::Integer(before_ts as i64));
        }

        sql.push_str(" ORDER BY timestamp DESC LIMIT ?");
        values.push(SqlValue::Integer(limit as i64));

        let mut stmt = conn.prepare(&sql).map_err(sqlite_to_io_error)?;
        let rows = stmt
            .query_map(params_from_iter(values.iter()), direct_message_from_row)
            .map_err(sqlite_to_io_error)?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(row.map_err(sqlite_to_io_error)?);
        }

        // keep frontend contract stable with ascending timestamps
        messages.reverse();
        Ok(messages)
    }

    // search dm messages with filters and indexed query execution
    pub fn search_dm_messages(
        &self,
        conversation_id: &str,
        params: &DmSearchParams,
    ) -> Result<Vec<DirectMessage>, io::Error> {
        let limit = params.limit.clamp(1, 1000);
        let query = params
            .query
            .as_deref()
            .map(str::trim)
            .filter(|q| !q.is_empty());

        let fts_query = query.and_then(build_fts_query);

        let conn = self.open_conn()?;
        let mut sql;
        let mut values: Vec<SqlValue> = Vec::new();

        if self.fts_enabled && fts_query.is_some() {
            sql = String::from(
                "SELECT
                    m.id,
                    m.from_peer,
                    m.to_peer,
                    m.from_display_name,
                    m.content,
                    m.timestamp
                 FROM dm_messages m
                 JOIN dm_message_fts f ON f.message_id = m.id
                 WHERE m.conversation_id = ?1
                   AND f.conversation_id = ?2
                   AND f.content MATCH ?3",
            );
            values.push(SqlValue::Text(conversation_id.to_string()));
            values.push(SqlValue::Text(conversation_id.to_string()));
            values.push(SqlValue::Text(fts_query.unwrap_or_default()));
        } else {
            sql = String::from(
                "SELECT
                    m.id,
                    m.from_peer,
                    m.to_peer,
                    m.from_display_name,
                    m.content,
                    m.timestamp
                 FROM dm_messages m
                 WHERE m.conversation_id = ?1",
            );
            values.push(SqlValue::Text(conversation_id.to_string()));

            if let Some(text_query) = query {
                sql.push_str(" AND lower(m.content) LIKE lower(?)");
                values.push(SqlValue::Text(format!("%{}%", text_query)));
            }
        }

        if let Some(from_peer) = params
            .from_peer
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
        {
            sql.push_str(" AND m.from_peer = ?");
            values.push(SqlValue::Text(from_peer.to_string()));
        }

        if params.mentions_only {
            sql.push_str(" AND m.content LIKE '%<@%'");
        }

        if let Some(after) = params.date_after {
            sql.push_str(" AND m.timestamp >= ?");
            values.push(SqlValue::Integer(after as i64));
        }

        if let Some(before) = params.date_before {
            sql.push_str(" AND m.timestamp <= ?");
            values.push(SqlValue::Integer(before as i64));
        }

        if let Some(media_filter) = params.media_filter.as_deref() {
            append_media_filter(&mut sql, &mut values, media_filter);
        }

        sql.push_str(" ORDER BY m.timestamp DESC LIMIT ?");
        values.push(SqlValue::Integer(limit as i64));

        let mut stmt = conn.prepare(&sql).map_err(sqlite_to_io_error)?;
        let rows = stmt
            .query_map(params_from_iter(values.iter()), direct_message_from_row)
            .map_err(sqlite_to_io_error)?;

        let mut messages = Vec::new();
        for row in rows {
            messages.push(row.map_err(sqlite_to_io_error)?);
        }

        messages.reverse();
        Ok(messages)
    }

    // wipe all user data
    // used when resetting identity to leave no traces on this client
    pub fn wipe_all_data(&self) -> Result<(), io::Error> {
        let conn = self.open_conn()?;

        conn.execute("DELETE FROM key_value", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM profile", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM settings", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM verification_proof", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM community_documents", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM community_meta", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM directory_entries", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM dm_messages", [])
            .map_err(sqlite_to_io_error)?;
        conn.execute("DELETE FROM dm_conversations", [])
            .map_err(sqlite_to_io_error)?;

        if self.fts_enabled {
            conn.execute("DELETE FROM dm_message_fts", [])
                .map_err(sqlite_to_io_error)?;
        }

        // keep migration marker enabled so wiped clients do not re-import old json files
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES ('legacy_migrated', '1')
             ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            [],
        )
        .map_err(sqlite_to_io_error)?;

        self.cleanup_legacy_files()
    }
}

fn clear_dir(path: PathBuf) -> Result<(), io::Error> {
    if !path.exists() {
        return Ok(());
    }

    for entry in fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            fs::remove_dir_all(entry.path())?;
        } else {
            fs::remove_file(entry.path())?;
        }
    }

    Ok(())
}

fn remove_if_exists(path: PathBuf) -> Result<(), io::Error> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)?;
    } else {
        fs::remove_file(path)?;
    }

    Ok(())
}

fn direct_message_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DirectMessage> {
    let timestamp: i64 = row.get(5)?;
    Ok(DirectMessage {
        id: row.get(0)?,
        from_peer: row.get(1)?,
        to_peer: row.get(2)?,
        from_display_name: row.get(3)?,
        content: row.get(4)?,
        timestamp: timestamp.max(0) as u64,
    })
}

fn append_media_filter(sql: &mut String, values: &mut Vec<SqlValue>, media_filter: &str) {
    let normalized = media_filter.to_lowercase();

    match normalized.as_str() {
        "images" => {
            append_extension_filter(
                sql,
                values,
                &[
                    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif",
                ],
            );
        }
        "videos" => {
            append_extension_filter(sql, values, &["mp4", "webm", "mov", "avi", "mkv"]);
        }
        "links" => {
            sql.push_str(" AND (lower(m.content) LIKE ? OR lower(m.content) LIKE ?)");
            values.push(SqlValue::Text("%http://%".to_string()));
            values.push(SqlValue::Text("%https://%".to_string()));
        }
        "files" => {
            append_extension_filter(
                sql,
                values,
                &[
                    "pdf", "doc", "docx", "xls", "xlsx", "zip", "rar", "7z", "tar", "gz",
                ],
            );
        }
        _ => {}
    }
}

fn append_extension_filter(sql: &mut String, values: &mut Vec<SqlValue>, exts: &[&str]) {
    if exts.is_empty() {
        return;
    }

    sql.push_str(" AND (");

    let mut first = true;
    for ext in exts {
        if !first {
            sql.push_str(" OR ");
        }
        first = false;
        sql.push_str("lower(m.content) LIKE ? OR lower(m.content) LIKE ?");
        values.push(SqlValue::Text(format!("%.{}", ext)));
        values.push(SqlValue::Text(format!("%.{}?%", ext)));
    }

    sql.push(')');
}

fn build_fts_query(query: &str) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|raw| {
            raw.chars()
                .filter(|c| c.is_ascii_alphanumeric() || *c == '_' || *c == '-')
                .collect::<String>()
        })
        .filter(|token| !token.is_empty())
        .map(|token| format!("{}*", token))
        .collect();

    if terms.is_empty() {
        return None;
    }

    Some(terms.join(" AND "))
}

fn sqlite_to_io_error(err: rusqlite::Error) -> io::Error {
    io::Error::new(io::ErrorKind::Other, err)
}
