use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::identity::{DirectoryEntry, DuskIdentity, PublicIdentity};
use crate::protocol::messages::{GossipMessage, ProfileAnnouncement, ProfileRevocation};
use crate::storage::UserSettings;
use crate::verification::{self, ChallengeSubmission};
use crate::AppState;

// build a signed profile announcement and publish it on the directory topic
// so all connected peers immediately learn about the updated profile.
// silently no-ops if the node isn't running yet.
async fn announce_profile(id: &DuskIdentity, state: &AppState) {
    let mut announcement = ProfileAnnouncement {
        peer_id: id.peer_id.to_string(),
        display_name: id.display_name.clone(),
        bio: id.bio.clone(),
        public_key: hex::encode(id.keypair.public().encode_protobuf()),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        verification_proof: id.verification_proof.clone(),
        signature: String::new(),
    };
    announcement.signature = verification::sign_announcement(&id.keypair, &announcement);

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::ProfileAnnounce(announcement);
        if let Ok(data) = serde_json::to_vec(&msg) {
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: gossip::topic_for_directory(),
                    data,
                })
                .await;
        }
    }
}

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
    challenge_data: Option<ChallengeSubmission>,
) -> Result<PublicIdentity, String> {
    // require challenge data and re-validate behavioral analysis in rust
    let challenge = challenge_data.ok_or("verification required")?;
    let result = verification::analyze_challenge(&challenge);
    if !result.is_human {
        return Err("verification failed".to_string());
    }

    let mut new_identity = DuskIdentity::generate(&display_name, &bio.unwrap_or_default());

    // generate a cryptographic proof binding the verification to this keypair
    let proof = verification::generate_proof(
        &challenge,
        &new_identity.keypair,
        &new_identity.peer_id.to_string(),
    )?;

    state
        .storage
        .save_verification_proof(&proof)
        .map_err(|e| format!("failed to save verification proof: {}", e))?;

    new_identity.verification_proof = Some(proof);
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

    announce_profile(id, &state).await;

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

    let public = id.public_identity();

    // re-announce so connected peers see the change immediately
    announce_profile(id, &state).await;

    Ok(public)
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
    // check if status changed so we can broadcast the new presence
    let old_status = state
        .storage
        .load_settings()
        .map(|s| s.status)
        .unwrap_or_else(|_| "online".to_string());
    let status_changed = old_status != settings.status;

    // also update the identity display name if it changed
    let mut identity = state.identity.lock().await;
    let mut name_changed = false;
    if let Some(id) = identity.as_mut() {
        if id.display_name != settings.display_name {
            id.display_name = settings.display_name.clone();
            id.save(&state.storage)?;
            name_changed = true;
        }
    }

    // re-announce if the display name was updated through settings
    if name_changed {
        if let Some(id) = identity.as_ref() {
            announce_profile(id, &state).await;
        }
    }
    drop(identity);

    // broadcast presence if status changed
    if status_changed {
        use crate::node::NodeCommand;
        use crate::protocol::messages::PeerStatus;

        let peer_status = match settings.status.as_str() {
            "idle" => PeerStatus::Idle,
            "dnd" => PeerStatus::Dnd,
            "invisible" => PeerStatus::Offline,
            _ => PeerStatus::Online,
        };

        let node_handle = state.node_handle.lock().await;
        if let Some(ref handle) = *node_handle {
            let _ = handle
                .command_tx
                .send(NodeCommand::BroadcastPresence {
                    status: peer_status,
                })
                .await;
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

// discover online peers via the global relay tracker namespace
// this allows finding peers without sharing a community or knowing their peer_id
#[tauri::command]
pub async fn discover_global_peers(state: State<'_, AppState>) -> Result<(), String> {
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let _ = handle
            .command_tx
            .send(crate::node::NodeCommand::DiscoverRendezvous {
                namespace: "dusk/peers".to_string(),
            })
            .await;
    }
    Ok(())
}

// change relay address and restart the node
// used when default relay is unreachable or at capacity
#[tauri::command]
pub async fn set_relay_address(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    relay_addr: String,
) -> Result<(), String> {
    // validate the relay address format
    let _ = relay_addr
        .parse::<libp2p::Multiaddr>()
        .map_err(|_| "invalid relay address format")?;

    // stop the current node if running
    {
        let mut node_handle = state.node_handle.lock().await;
        if let Some(handle) = node_handle.take() {
            let _ = handle.command_tx.send(crate::node::NodeCommand::Shutdown).await;
            let _ = handle.task.await;
        }
    }

    // update settings with the new relay address
    let mut settings = state.storage.load_settings().unwrap_or_default();
    settings.custom_relay_addr = Some(relay_addr);
    state
        .storage
        .save_settings(&settings)
        .map_err(|e| format!("failed to save settings: {}", e))?;

    // restart the node with the new relay
    crate::commands::chat::start_node(app, state).await?;

    Ok(())
}

// broadcast a revocation to all peers, stop the node, and wipe all local data
#[tauri::command]
pub async fn reset_identity(state: State<'_, AppState>) -> Result<(), String> {
    let mut identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    // build the revocation message before we destroy the identity
    let mut revocation = ProfileRevocation {
        peer_id: id.peer_id.to_string(),
        public_key: hex::encode(id.keypair.public().encode_protobuf()),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
        signature: String::new(),
    };
    revocation.signature = verification::sign_revocation(&id.keypair, &revocation);

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
