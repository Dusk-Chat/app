use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;
use tokio::net::TcpStream;
use tokio::time::{timeout, Duration};

use crate::node::gossip;
use crate::node::{self, NodeCommand};
use crate::protocol::messages::{
    ChatMessage, GossipMessage, PeerStatus, ProfileAnnouncement, TypingIndicator,
};
use crate::verification;
use crate::AppState;

#[tauri::command]
pub async fn start_node(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or("no identity loaded, create one first")?;

    // load custom relay address from settings if configured
    let custom_relay = state
        .storage
        .load_settings()
        .ok()
        .and_then(|s| s.custom_relay_addr);

    let handle = node::start(
        id.keypair.clone(),
        state.crdt_engine.clone(),
        state.storage.clone(),
        app,
        state.voice_channels.clone(),
        custom_relay,
    )
    .await?;

    // capture profile info for announcement before dropping identity lock
    let mut profile_announcement = ProfileAnnouncement {
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
    profile_announcement.signature =
        verification::sign_announcement(&id.keypair, &profile_announcement);
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

        // subscribe to all existing dm conversation topics
        let local_peer_str = {
            let identity = state.identity.lock().await;
            identity
                .as_ref()
                .map(|i| i.peer_id.to_string())
                .unwrap_or_default()
        };
        if let Ok(conversations) = state.storage.load_all_dm_conversations() {
            for (_, meta) in &conversations {
                let dm_topic = gossip::topic_for_dm(&local_peer_str, &meta.peer_id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe { topic: dm_topic })
                    .await;
            }
        }

        // subscribe to personal dm inbox so first-time dms from any peer land
        let inbox_topic = gossip::topic_for_dm_inbox(&local_peer_str);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe { topic: inbox_topic })
            .await;

        // register personal rendezvous namespace so any peer can discover
        // and connect to us for dms even without sharing a community
        let personal_ns = format!("dusk/peer/{}", local_peer_str);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous {
                namespace: personal_ns,
            })
            .await;

        // register under the global "dusk/peers" namespace so any peer can
        // discover us via the relay tracker, enabling global peer discovery
        // without exposing ip addresses (all connections use relay circuit)
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous {
                namespace: "dusk/peers".to_string(),
            })
            .await;

        // broadcast our initial presence status from saved settings
        let initial_status = state
            .storage
            .load_settings()
            .map(|s| match s.status.as_str() {
                "idle" => PeerStatus::Idle,
                "dnd" => PeerStatus::Dnd,
                "invisible" => PeerStatus::Offline,
                _ => PeerStatus::Online,
            })
            .unwrap_or(PeerStatus::Online);
        let _ = handle
            .command_tx
            .send(NodeCommand::BroadcastPresence {
                status: initial_status,
            })
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_node(state: State<'_, AppState>) -> Result<(), String> {
    let mut node_handle = state.node_handle.lock().await;

    if let Some(handle) = node_handle.take() {
        // broadcast offline presence before shutting down
        let _ = handle
            .command_tx
            .send(NodeCommand::BroadcastPresence {
                status: PeerStatus::Offline,
            })
            .await;
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

// broadcast current user status to all joined communities
#[tauri::command]
pub async fn broadcast_presence(state: State<'_, AppState>, status: String) -> Result<(), String> {
    let peer_status = match status.as_str() {
        "online" => PeerStatus::Online,
        "idle" => PeerStatus::Idle,
        "dnd" => PeerStatus::Dnd,
        // invisible users appear offline to others
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

// attempts tcp connections to well-known hosts to distinguish
// between a general internet outage and the relay being unreachable
#[tauri::command]
pub async fn check_internet_connectivity() -> Result<bool, String> {
    let hosts = vec![
        ("www.apple.com", 80),
        ("www.google.com", 80),
        ("www.yahoo.com", 80),
    ];

    let connect_timeout = Duration::from_secs(5);

    let futures: Vec<_> = hosts
        .into_iter()
        .map(|(host, port)| {
            let addr = format!("{}:{}", host, port);
            timeout(connect_timeout, TcpStream::connect(addr))
        })
        .collect();

    let results = futures::future::join_all(futures).await;

    Ok(results.iter().any(|r| matches!(r, Ok(Ok(_)))))
}
