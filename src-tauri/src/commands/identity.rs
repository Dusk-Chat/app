use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::identity::{DirectoryEntry, DuskIdentity, PublicIdentity};
use crate::protocol::messages::{GossipMessage, ProfileRevocation};
use crate::storage::UserSettings;
use crate::AppState;

#[tauri::command]
pub async fn has_identity(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.storage.has_identity())
}

#[tauri::command]
pub async fn load_identity(state: State<'_, AppState>) -> Result<Option<PublicIdentity>, String> {
    let mut identity = state.identity.lock().await;

    if identity.is_some() {
        return Ok(identity.as_ref().map(|id| id.public_identity()));
    }

    match DuskIdentity::load(&state.storage) {
        Ok(loaded) => {
            let public = loaded.public_identity();
            *identity = Some(loaded);
            Ok(Some(public))
        }
        Err(_) => Ok(None),
    }
}

#[tauri::command]
pub async fn create_identity(
    state: State<'_, AppState>,
    display_name: String,
    bio: Option<String>,
) -> Result<PublicIdentity, String> {
    let new_identity = DuskIdentity::generate(&display_name, &bio.unwrap_or_default());
    new_identity.save(&state.storage)?;

    // also save initial settings with this display name so they're in sync
    let mut settings = state.storage.load_settings().unwrap_or_default();
    settings.display_name = display_name.clone();
    state
        .storage
        .save_settings(&settings)
        .map_err(|e| format!("failed to save initial settings: {}", e))?;

    let public = new_identity.public_identity();
    let mut identity = state.identity.lock().await;
    *identity = Some(new_identity);

    Ok(public)
}

#[tauri::command]
pub async fn update_display_name(state: State<'_, AppState>, name: String) -> Result<(), String> {
    let mut identity = state.identity.lock().await;
    let id = identity.as_mut().ok_or("no identity loaded")?;

    id.display_name = name;
    id.save(&state.storage)?;

    Ok(())
}

#[tauri::command]
pub async fn update_profile(
    state: State<'_, AppState>,
    display_name: String,
    bio: String,
) -> Result<PublicIdentity, String> {
    let mut identity = state.identity.lock().await;
    let id = identity.as_mut().ok_or("no identity loaded")?;

    id.display_name = display_name;
    id.bio = bio;
    id.save(&state.storage)?;

    Ok(id.public_identity())
}

#[tauri::command]
pub async fn load_settings(state: State<'_, AppState>) -> Result<UserSettings, String> {
    state
        .storage
        .load_settings()
        .map_err(|e| format!("failed to load settings: {}", e))
}

#[tauri::command]
pub async fn save_settings(
    state: State<'_, AppState>,
    settings: UserSettings,
) -> Result<(), String> {
    // also update the identity display name if it changed
    let mut identity = state.identity.lock().await;
    if let Some(id) = identity.as_mut() {
        if id.display_name != settings.display_name {
            id.display_name = settings.display_name.clone();
            id.save(&state.storage)?;
        }
    }

    state
        .storage
        .save_settings(&settings)
        .map_err(|e| format!("failed to save settings: {}", e))
}

// -- user directory commands --

#[tauri::command]
pub async fn get_known_peers(state: State<'_, AppState>) -> Result<Vec<DirectoryEntry>, String> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| format!("failed to load directory: {}", e))?;

    let mut peers: Vec<DirectoryEntry> = entries.into_values().collect();
    // sort by last seen (most recent first)
    peers.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    Ok(peers)
}

#[tauri::command]
pub async fn search_directory(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<DirectoryEntry>, String> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| format!("failed to load directory: {}", e))?;

    let query_lower = query.to_lowercase();
    let mut results: Vec<DirectoryEntry> = entries
        .into_values()
        .filter(|entry| {
            entry.display_name.to_lowercase().contains(&query_lower)
                || entry.peer_id.to_lowercase().contains(&query_lower)
        })
        .collect();

    results.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    Ok(results)
}

#[tauri::command]
pub async fn get_friends(state: State<'_, AppState>) -> Result<Vec<DirectoryEntry>, String> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| format!("failed to load directory: {}", e))?;

    let mut friends: Vec<DirectoryEntry> = entries
        .into_values()
        .filter(|entry| entry.is_friend)
        .collect();

    friends.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(friends)
}

#[tauri::command]
pub async fn add_friend(state: State<'_, AppState>, peer_id: String) -> Result<(), String> {
    state
        .storage
        .set_friend_status(&peer_id, true)
        .map_err(|e| format!("failed to add friend: {}", e))
}

#[tauri::command]
pub async fn remove_friend(state: State<'_, AppState>, peer_id: String) -> Result<(), String> {
    state
        .storage
        .set_friend_status(&peer_id, false)
        .map_err(|e| format!("failed to remove friend: {}", e))
}

// broadcast a revocation to all peers, stop the node, and wipe all local data
#[tauri::command]
pub async fn reset_identity(state: State<'_, AppState>) -> Result<(), String> {
    let mut identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    // build the revocation message before we destroy the identity
    let revocation = ProfileRevocation {
        peer_id: id.peer_id.to_string(),
        public_key: hex::encode(id.keypair.public().encode_protobuf()),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };

    // broadcast revocation on the directory gossip topic
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::ProfileRevoke(revocation);
        if let Ok(data) = serde_json::to_vec(&msg) {
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: gossip::topic_for_directory(),
                    data,
                })
                .await;
        }

        // give the message a moment to propagate before shutting down
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    }
    drop(node_handle);

    // stop the p2p node
    {
        let mut node_handle = state.node_handle.lock().await;
        if let Some(handle) = node_handle.take() {
            let _ = handle.command_tx.send(NodeCommand::Shutdown).await;
            let _ = handle.task.await;
        }
    }

    // clear the crdt engine so no community data lingers in memory
    {
        let mut engine = state.crdt_engine.lock().await;
        engine.clear();
    }

    // clear in-memory identity
    *identity = None;

    // wipe all data from disk
    state
        .storage
        .wipe_all_data()
        .map_err(|e| format!("failed to wipe data: {}", e))?;

    Ok(())
}
