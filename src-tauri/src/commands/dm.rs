use std::time::{SystemTime, UNIX_EPOCH};

use tauri::State;

use super::ipc_log;
use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::messages::{
    DMConversationMeta, DMTypingIndicator, DirectMessage, GossipMessage,
};
use crate::storage::DmSearchParams;
use crate::AppState;

// send a direct message to a peer
// creates the conversation on disk if it doesn't exist,
// publishes the message over gossipsub on the pair topic
#[tauri::command]
pub async fn send_dm(
    state: State<'_, AppState>,
    peer_id: String,
    content: String,
) -> Result<DirectMessage, String> {
    ipc_log!("send_dm", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let local_peer_id = id.peer_id.to_string();
        let display_name = id.display_name.clone();
        drop(identity);

        let msg = DirectMessage {
            id: format!("dm_{}_{}", local_peer_id, now),
            from_peer: local_peer_id.clone(),
            to_peer: peer_id.clone(),
            from_display_name: display_name.clone(),
            content: content.clone(),
            timestamp: now,
        };

        // derive the conversation id and persist the message
        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        state
            .storage
            .append_dm_message(&conversation_id, &msg)
            .map_err(|e| format!("failed to persist dm: {}", e))?;

        // ensure conversation metadata exists on disk
        // try to load existing meta to preserve peer's display name,
        // fall back to what we know from the directory
        let existing_meta = state.storage.load_dm_conversation(&conversation_id).ok();
        let peer_display_name = existing_meta
            .as_ref()
            .map(|m| m.display_name.clone())
            .unwrap_or_else(|| {
                // look up in directory
                state
                    .storage
                    .load_directory()
                    .ok()
                    .and_then(|d| d.get(&peer_id).map(|e| e.display_name.clone()))
                    .unwrap_or_else(|| peer_id.clone())
            });

        let meta = DMConversationMeta {
            peer_id: peer_id.clone(),
            display_name: peer_display_name,
            last_message: Some(content),
            last_message_time: Some(now),
            unread_count: existing_meta.map(|m| m.unread_count).unwrap_or(0),
        };

        state
            .storage
            .save_dm_conversation(&conversation_id, &meta)
            .map_err(|e| format!("failed to save dm conversation: {}", e))?;

        // publish to the dm gossipsub topic
        let node_handle = state.node_handle.lock().await;
        if let Some(ref handle) = *node_handle {
            let data = serde_json::to_vec(&GossipMessage::DirectMessage(msg.clone()))
                .map_err(|e| format!("serialize error: {}", e))?;

            // publish to the pair topic (for when both peers are already subscribed)
            let pair_topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: pair_topic,
                    data: data.clone(),
                })
                .await;

            // also publish to the recipient's inbox topic to guarantee delivery
            // on first-time dms where the peer isn't subscribed to the pair topic yet
            let inbox_topic = gossip::topic_for_dm_inbox(&peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: inbox_topic,
                    data,
                })
                .await;

            // discover the peer via rendezvous in case we're not connected over wan
            let discover_ns = format!("dusk/peer/{}", peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::DiscoverRendezvous {
                    namespace: discover_ns,
                })
                .await;
        }

        Ok(msg)
    })
}

// load dm messages for a conversation with a specific peer
#[tauri::command]
pub async fn get_dm_messages(
    state: State<'_, AppState>,
    peer_id: String,
    before: Option<u64>,
    limit: Option<usize>,
) -> Result<Vec<DirectMessage>, String> {
    ipc_log!("get_dm_messages", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        state
            .storage
            .load_dm_messages(&conversation_id, before, limit.unwrap_or(50))
            .map_err(|e| format!("failed to load dm messages: {}", e))
    })
}

// search dm messages on the backend using sqlite indexes
#[tauri::command]
pub async fn search_dm_messages(
    state: State<'_, AppState>,
    peer_id: String,
    query: Option<String>,
    from_filter: Option<String>,
    media_filter: Option<String>,
    mentions_only: Option<bool>,
    date_after: Option<u64>,
    date_before: Option<u64>,
    limit: Option<usize>,
) -> Result<Vec<DirectMessage>, String> {
    ipc_log!("search_dm_messages", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        let from_peer = match from_filter.as_deref() {
            Some("me") => Some(local_peer_id),
            Some("them") => Some(peer_id.clone()),
            _ => None,
        };

        let params = DmSearchParams {
            query,
            from_peer,
            media_filter,
            mentions_only: mentions_only.unwrap_or(false),
            date_after,
            date_before,
            limit: limit.unwrap_or(200),
        };

        state
            .storage
            .search_dm_messages(&conversation_id, &params)
            .map_err(|e| format!("failed to search dm messages: {}", e))
    })
}

// load all dm conversations for the sidebar
#[tauri::command]
pub async fn get_dm_conversations(
    state: State<'_, AppState>,
) -> Result<Vec<DMConversationMeta>, String> {
    ipc_log!("get_dm_conversations", {
        let conversations = state
            .storage
            .load_all_dm_conversations()
            .map_err(|e| format!("failed to load dm conversations: {}", e))?;

        Ok(conversations.into_iter().map(|(_, meta)| meta).collect())
    })
}

// mark all messages in a dm conversation as read
#[tauri::command]
pub async fn mark_dm_read(state: State<'_, AppState>, peer_id: String) -> Result<(), String> {
    ipc_log!("mark_dm_read", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        let mut meta = state
            .storage
            .load_dm_conversation(&conversation_id)
            .map_err(|e| format!("failed to load conversation: {}", e))?;

        meta.unread_count = 0;

        state
            .storage
            .save_dm_conversation(&conversation_id, &meta)
            .map_err(|e| format!("failed to save conversation: {}", e))
    })
}

// delete a dm conversation and all its messages
#[tauri::command]
pub async fn delete_dm_conversation(
    state: State<'_, AppState>,
    peer_id: String,
) -> Result<(), String> {
    ipc_log!("delete_dm_conversation", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        // unsubscribe from the dm topic
        let node_handle = state.node_handle.lock().await;
        if let Some(ref handle) = *node_handle {
            let topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Unsubscribe { topic })
                .await;
        }

        state
            .storage
            .remove_dm_conversation(&conversation_id)
            .map_err(|e| format!("failed to delete conversation: {}", e))
    })
}

// send a typing indicator in a dm conversation
#[tauri::command]
pub async fn send_dm_typing(state: State<'_, AppState>, peer_id: String) -> Result<(), String> {
    ipc_log!("send_dm_typing", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis() as u64;

        let indicator = DMTypingIndicator {
            from_peer: local_peer_id.clone(),
            to_peer: peer_id.clone(),
            timestamp: now,
        };

        let node_handle = state.node_handle.lock().await;
        if let Some(ref handle) = *node_handle {
            let topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
            let data = serde_json::to_vec(&GossipMessage::DMTyping(indicator))
                .map_err(|e| format!("serialize error: {}", e))?;

            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage { topic, data })
                .await;
        }

        Ok(())
    })
}

// open a dm conversation with a peer (creates metadata on disk and subscribes to topic)
// used when clicking "message" on a peer's profile
#[tauri::command]
pub async fn open_dm_conversation(
    state: State<'_, AppState>,
    peer_id: String,
    display_name: String,
) -> Result<DMConversationMeta, String> {
    ipc_log!("open_dm_conversation", {
        let identity = state.identity.lock().await;
        let id = identity.as_ref().ok_or("no identity loaded")?;
        let local_peer_id = id.peer_id.to_string();
        drop(identity);

        let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

        // check if conversation already exists
        if let Ok(existing) = state.storage.load_dm_conversation(&conversation_id) {
            // subscribe to make sure we're listening
            let node_handle = state.node_handle.lock().await;
            if let Some(ref handle) = *node_handle {
                let topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe { topic })
                    .await;

                // discover the peer via rendezvous to ensure wan connectivity
                let discover_ns = format!("dusk/peer/{}", peer_id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::DiscoverRendezvous {
                        namespace: discover_ns,
                    })
                    .await;
            }
            return Ok(existing);
        }

        let meta = DMConversationMeta {
            peer_id: peer_id.clone(),
            display_name,
            last_message: None,
            last_message_time: None,
            unread_count: 0,
        };

        state
            .storage
            .save_dm_conversation(&conversation_id, &meta)
            .map_err(|e| format!("failed to create dm conversation: {}", e))?;

        // subscribe to the dm topic so we receive messages
        let node_handle = state.node_handle.lock().await;
        if let Some(ref handle) = *node_handle {
            let topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Subscribe { topic })
                .await;

            // discover the peer via rendezvous to establish wan connectivity
            // through the relay circuit before any messages are sent
            let discover_ns = format!("dusk/peer/{}", peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::DiscoverRendezvous {
                    namespace: discover_ns,
                })
                .await;
        }

        Ok(meta)
    })
}
