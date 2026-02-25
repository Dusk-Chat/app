use tauri::State;

use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::messages::{GossipMessage, VoiceMediaState, VoiceParticipant};
use crate::protocol::turn::TurnCredentialResponse;
use crate::AppState;

#[tauri::command]
pub async fn join_voice_channel(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<Vec<VoiceParticipant>, String> {
    eprintln!(
        "[Voice] join_voice_channel called: community={}, channel={}",
        community_id, channel_id
    );

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
        handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: voice_topic.clone(),
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to subscribe to voice topic: {}", e);
                format!("Failed to subscribe to voice channel: {}", e)
            })?;

        // publish our join announcement
        let msg = GossipMessage::VoiceJoin {
            community_id: community_id.clone(),
            channel_id: channel_id.clone(),
            peer_id: peer_id.clone(),
            display_name: display_name.clone(),
            media_state: media_state.clone(),
        };
        let data = serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to publish VoiceJoin: {}", e);
                format!("Failed to send voice join announcement: {}", e)
            })?;

        eprintln!("[Voice] Successfully published VoiceJoin for peer {}", peer_id);
    } else {
        eprintln!("[Voice] No node handle available — cannot join voice channel");
        return Err("Node not running — cannot join voice channel".to_string());
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

    // TODO: Participant list race condition
    // The participant list returned here only includes locally-tracked peers.
    // A newly joining peer will not see existing participants until they receive
    // VoiceJoin gossip messages from those peers. To fix this properly, we need:
    //   1. A new GossipMessage::VoiceParticipantsRequest variant
    //   2. Existing peers respond to the request by re-broadcasting their VoiceJoin
    //   3. Or implement a request/response protocol over gossipsub or a direct stream
    // This requires changes to protocol/messages.rs and node/mod.rs (gossip handler).
    // For now, the frontend should handle late-arriving VoiceJoin events gracefully.

    log::info!("joined voice channel {}:{}", community_id, channel_id);

    Ok(result)
}

#[tauri::command]
pub async fn leave_voice_channel(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<(), String> {
    eprintln!(
        "[Voice] leave_voice_channel called: community={}, channel={}",
        community_id, channel_id
    );

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
        let data = serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic.clone(),
                data,
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to publish VoiceLeave: {}", e);
                format!("Failed to send voice leave announcement: {}", e)
            })?;

        eprintln!("[Voice] Successfully published VoiceLeave for peer {}", peer_id);

        // unsubscribe from the voice topic
        handle
            .command_tx
            .send(NodeCommand::Unsubscribe { topic: voice_topic })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to unsubscribe from voice topic: {}", e);
                format!("Failed to unsubscribe from voice channel: {}", e)
            })?;
    } else {
        eprintln!("[Voice] No node handle available — cannot leave voice channel");
        return Err("Node not running — cannot leave voice channel".to_string());
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
    eprintln!(
        "[Voice] update_voice_media_state called: community={}, channel={}",
        community_id, channel_id
    );

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
        let data = serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to publish VoiceMediaStateUpdate: {}", e);
                format!("Failed to send media state update: {}", e)
            })?;

        eprintln!("[Voice] Successfully published VoiceMediaStateUpdate for peer {}", peer_id);
    } else {
        eprintln!("[Voice] No node handle available — cannot update media state");
        return Err("Node not running — cannot update media state".to_string());
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
    eprintln!(
        "[Voice] send_voice_sdp called: community={}, channel={}, to_peer={}, sdp_type={}",
        community_id, channel_id, to_peer, sdp_type
    );

    // Validate SDP type before doing anything else
    match sdp_type.as_str() {
        "offer" | "answer" | "pranswer" => {}
        _ => {
            eprintln!("[Voice] Invalid SDP type: {}", sdp_type);
            return Err(format!(
                "Invalid SDP type '{}': must be one of 'offer', 'answer', 'pranswer'",
                sdp_type
            ));
        }
    }

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
            from_peer: from_peer.clone(),
            to_peer,
            sdp_type,
            sdp,
        };
        let data = serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to publish VoiceSdp: {}", e);
                format!("Failed to send voice SDP: {}", e)
            })?;

        eprintln!("[Voice] Successfully published VoiceSdp from peer {}", from_peer);
    } else {
        eprintln!("[Voice] No node handle available — cannot send SDP");
        return Err("Node not running — cannot send SDP".to_string());
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
    eprintln!(
        "[Voice] send_voice_ice_candidate called: community={}, channel={}, to_peer={}",
        community_id, channel_id, to_peer
    );

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
            from_peer: from_peer.clone(),
            to_peer,
            candidate,
            sdp_mid,
            sdp_mline_index,
        };
        let data = serde_json::to_vec(&msg).map_err(|e| format!("serialize error: {}", e))?;
        handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: voice_topic,
                data,
            })
            .await
            .map_err(|e| {
                eprintln!("[Voice] Failed to publish VoiceIceCandidate: {}", e);
                format!("Failed to send voice ICE candidate: {}", e)
            })?;

        eprintln!("[Voice] Successfully published VoiceIceCandidate from peer {}", from_peer);
    } else {
        eprintln!("[Voice] No node handle available — cannot send ICE candidate");
        return Err("Node not running — cannot send ICE candidate".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn get_voice_participants(
    state: State<'_, AppState>,
    community_id: String,
    channel_id: String,
) -> Result<Vec<VoiceParticipant>, String> {
    eprintln!(
        "[Voice] get_voice_participants called: community={}, channel={}",
        community_id, channel_id
    );

    let key = format!("{}:{}", community_id, channel_id);
    let vc = state.voice_channels.lock().await;
    let participants = vc.get(&key).cloned().unwrap_or_default();

    eprintln!(
        "[Voice] Returning {} participants for {}",
        participants.len(),
        key
    );

    Ok(participants)
}

#[tauri::command]
pub async fn get_turn_credentials(
    state: State<'_, AppState>,
) -> Result<TurnCredentialResponse, String> {
    eprintln!("[Voice] get_turn_credentials called");

    let handle_ref = state.node_handle.lock().await;
    let handle = handle_ref.as_ref().ok_or("node not running")?;

    let (tx, rx) = tokio::sync::oneshot::channel();

    handle
        .command_tx
        .send(NodeCommand::GetTurnCredentials { reply: tx })
        .await
        .map_err(|_| "failed to send get_turn_credentials command".to_string())?;

    // drop the lock before awaiting the response
    drop(handle_ref);

    rx.await
        .map_err(|_| "turn credentials response channel closed".to_string())?
}
