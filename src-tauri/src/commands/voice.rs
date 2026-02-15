use tauri::State;

use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::messages::{GossipMessage, VoiceMediaState, VoiceParticipant};
use crate::AppState;

#[tauri::command]
pub async fn join_voice_channel(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<Vec<VoiceParticipant>, String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    let peer_id = id.peer_id.to_string();
    let display_name = id.display_name.clone();
    drop(identity);

    let media_state = VoiceMediaState {
        muted: false,
        deafened: false,
        video_enabled: false,
        screen_sharing: false,
    };

    // subscribe to the voice topic for this channel
    let voice_topic = gossip::topic_for_voice(&community_id, &channel_id);
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: voice_topic.clone(),
            })
            .await;

        // publish our join announcement
        let msg = GossipMessage::VoiceJoin {
            community_id: community_id.clone(),
            channel_id: channel_id.clone(),
            peer_id: peer_id.clone(),
            display_name: display_name.clone(),
            media_state: media_state.clone(),
        };
        let data =
            serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await;
    }

    // add ourselves to the local voice channel tracking
    let key = format!("{}:{}", community_id, channel_id);
    let mut vc = state.voice_channels.lock().await;
    let participants = vc.entry(key.clone()).or_insert_with(Vec::new);
    participants.retain(|p| p.peer_id != peer_id);
    participants.push(VoiceParticipant {
        peer_id,
        display_name,
        media_state,
    });

    let result = participants.clone();
    drop(vc);

    log::info!("joined voice channel {}:{}", community_id, channel_id);

    Ok(result)
}

#[tauri::command]
pub async fn leave_voice_channel(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let peer_id = id.peer_id.to_string();
    drop(identity);

    let voice_topic = gossip::topic_for_voice(&community_id, &channel_id);

    // publish our leave announcement before unsubscribing
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::VoiceLeave {
            community_id: community_id.clone(),
            channel_id: channel_id.clone(),
            peer_id: peer_id.clone(),
        };
        let data =
            serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic.clone(),
                data,
            })
            .await;

        // unsubscribe from the voice topic
        let _ = handle
            .command_tx
            .send(NodeCommand::Unsubscribe {
                topic: voice_topic,
            })
            .await;
    }

    // remove ourselves from local tracking
    let key = format!("{}:{}", community_id, channel_id);
    let mut vc = state.voice_channels.lock().await;
    if let Some(participants) = vc.get_mut(&key) {
        participants.retain(|p| p.peer_id != peer_id);
        if participants.is_empty() {
            vc.remove(&key);
        }
    }
    drop(vc);

    log::info!("left voice channel {}:{}", community_id, channel_id);

    Ok(())
}

#[tauri::command]
pub async fn update_voice_media_state(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
    media_state: VoiceMediaState,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let peer_id = id.peer_id.to_string();
    drop(identity);

    let voice_topic = gossip::topic_for_voice(&community_id, &channel_id);
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::VoiceMediaStateUpdate {
            community_id: community_id.clone(),
            channel_id: channel_id.clone(),
            peer_id: peer_id.clone(),
            media_state: media_state.clone(),
        };
        let data =
            serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await;
    }

    // update local tracking
    let key = format!("{}:{}", community_id, channel_id);
    let mut vc = state.voice_channels.lock().await;
    if let Some(participants) = vc.get_mut(&key) {
        if let Some(p) = participants.iter_mut().find(|p| p.peer_id == peer_id) {
            p.media_state = media_state;
        }
    }
    drop(vc);

    Ok(())
}

#[tauri::command]
pub async fn send_voice_sdp(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
    to_peer: String,
    sdp_type: String,
    sdp: String,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let from_peer = id.peer_id.to_string();
    drop(identity);

    let voice_topic = gossip::topic_for_voice(&community_id, &channel_id);
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::VoiceSdp {
            community_id,
            channel_id,
            from_peer,
            to_peer,
            sdp_type,
            sdp,
        };
        let data =
            serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn send_voice_ice_candidate(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
    to_peer: String,
    candidate: String,
    sdp_mid: Option<String>,
    sdp_mline_index: Option<u32>,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let from_peer = id.peer_id.to_string();
    drop(identity);

    let voice_topic = gossip::topic_for_voice(&community_id, &channel_id);
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg = GossipMessage::VoiceIceCandidate {
            community_id,
            channel_id,
            from_peer,
            to_peer,
            candidate,
            sdp_mid,
            sdp_mline_index,
        };
        let data =
            serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_voice_participants(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<Vec<VoiceParticipant>, String> {
    let key = format!("{}:{}", community_id, channel_id);
    let vc = state.voice_channels.lock().await;
    let participants = vc.get(&key).cloned().unwrap_or_default();
    Ok(participants)
}
