use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use crate::node::gossip;
use crate::node::{self, NodeCommand};
use crate::protocol::messages::{ChatMessage, GossipMessage, ProfileAnnouncement, TypingIndicator};
use crate::AppState;

#[tauri::command]
pub async fn start_node(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or("no identity loaded, create one first")?;

    let handle = node::start(
        id.keypair.clone(),
        state.crdt_engine.clone(),
        state.storage.clone(),
        app,
    )
    .await?;

    // capture profile info for announcement before dropping identity lock
    let profile_announcement = ProfileAnnouncement {
        peer_id: id.peer_id.to_string(),
        display_name: id.display_name.clone(),
        bio: id.bio.clone(),
        public_key: hex::encode(id.keypair.public().encode_protobuf()),
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64,
    };
    drop(identity);

    {
        let mut node_handle = state.node_handle.lock().await;
        *node_handle = Some(handle);
    }

    // subscribe to the global sync topic for document exchange
    let sync_topic = gossip::topic_for_sync();
    let directory_topic = gossip::topic_for_directory();
    let handle_ref = state.node_handle.lock().await;
    if let Some(ref handle) = *handle_ref {
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe { topic: sync_topic })
            .await;

        // subscribe to the directory topic for peer profile announcements
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: directory_topic.clone(),
            })
            .await;

        // announce our profile on the directory topic
        let announce_msg = GossipMessage::ProfileAnnounce(profile_announcement);
        if let Ok(data) = serde_json::to_vec(&announce_msg) {
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: directory_topic,
                    data,
                })
                .await;
        }
    }

    // subscribe to all known community topics
    let engine = state.crdt_engine.lock().await;
    let community_ids = engine.community_ids();
    drop(engine);

    if let Some(ref handle) = *handle_ref {
        for community_id in &community_ids {
            let channels = {
                let engine = state.crdt_engine.lock().await;
                engine.get_channels(community_id).unwrap_or_default()
            };

            for channel in &channels {
                let topic = gossip::topic_for_messages(community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe { topic })
                    .await;

                let typing_topic = gossip::topic_for_typing(community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe {
                        topic: typing_topic,
                    })
                    .await;
            }

            let presence_topic = gossip::topic_for_presence(community_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Subscribe {
                    topic: presence_topic,
                })
                .await;

            // register on rendezvous for each community so other peers can find us
            let namespace = format!("dusk/community/{}", community_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::RegisterRendezvous { namespace })
                .await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_node(state: State<'_, AppState>) -> Result<(), String> {
    let mut node_handle = state.node_handle.lock().await;

    if let Some(handle) = node_handle.take() {
        let _ = handle.command_tx.send(NodeCommand::Shutdown).await;
        let _ = handle.task.await;
    }

    Ok(())
}

#[tauri::command]
pub async fn send_message(
    state: State<'_, AppState>,
    channel_id: String,
    content: String,
) -> Result<ChatMessage, String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let msg = ChatMessage {
        id: format!("msg_{}_{}", id.peer_id, now),
        channel_id: channel_id.clone(),
        author_id: id.peer_id.to_string(),
        author_name: id.display_name.clone(),
        content,
        timestamp: now,
        edited: false,
    };

    // figure out which community this channel belongs to
    let mut engine = state.crdt_engine.lock().await;
    let community_id = find_community_for_channel(&engine, &channel_id)?;

    engine.append_message(&community_id, &msg)?;
    drop(engine);

    // publish to gossipsub
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let topic = gossip::topic_for_messages(&community_id, &channel_id);
        let data = serde_json::to_vec(&GossipMessage::Chat(msg.clone()))
            .map_err(|e| format!("serialize error: {}", e))?;

        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage { topic, data })
            .await;
    }

    Ok(msg)
}

#[tauri::command]
pub async fn get_messages(
    state: State<'_, AppState>,
    channel_id: String,
    before: Option<u64>,
    limit: Option<usize>,
) -> Result<Vec<ChatMessage>, String> {
    let engine = state.crdt_engine.lock().await;
    let community_id = find_community_for_channel(&engine, &channel_id)?;
    engine.get_messages(&community_id, &channel_id, before, limit.unwrap_or(50))
}

#[tauri::command]
pub async fn send_typing(state: State<'_, AppState>, channel_id: String) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    let indicator = TypingIndicator {
        peer_id: id.peer_id.to_string(),
        channel_id: channel_id.clone(),
        timestamp: now,
    };

    let engine = state.crdt_engine.lock().await;
    let community_id = find_community_for_channel(&engine, &channel_id)?;
    drop(engine);

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let topic = gossip::topic_for_typing(&community_id, &channel_id);
        let data = serde_json::to_vec(&GossipMessage::Typing(indicator))
            .map_err(|e| format!("serialize error: {}", e))?;

        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage { topic, data })
            .await;
    }

    Ok(())
}

// find which community a channel belongs to by checking all loaded documents
fn find_community_for_channel(
    engine: &crate::crdt::CrdtEngine,
    channel_id: &str,
) -> Result<String, String> {
    for community_id in engine.community_ids() {
        if let Ok(channels) = engine.get_channels(&community_id) {
            if channels.iter().any(|ch| ch.id == channel_id) {
                return Ok(community_id);
            }
        }
    }
    Err(format!(
        "no community found containing channel {}",
        channel_id
    ))
}
