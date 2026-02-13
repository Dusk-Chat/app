use std::time::{SystemTime, UNIX_EPOCH};

use sha2::{Digest, Sha256};
use tauri::State;

use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::community::{ChannelKind, ChannelMeta, CommunityMeta, Member};
use crate::protocol::messages::PeerStatus;
use crate::AppState;

#[tauri::command]
pub async fn create_community(
    state: State<'_, AppState>,
    name: String,
    description: String,
) -> Result<CommunityMeta, String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // generate a deterministic community id from name + creator + timestamp
    let mut hasher = Sha256::new();
    hasher.update(name.as_bytes());
    hasher.update(id.peer_id.to_bytes());
    hasher.update(now.to_le_bytes());
    let hash = hasher.finalize();
    let community_id = format!("com_{}", &hex::encode(hash)[..16]);

    let peer_id_str = id.peer_id.to_string();
    drop(identity);

    let mut engine = state.crdt_engine.lock().await;
    engine.create_community(&community_id, &name, &description, &peer_id_str)?;

    let meta = engine.get_community_meta(&community_id)?;

    // save metadata cache
    let _ = state.storage.save_community_meta(&meta);
    drop(engine);

    // subscribe to community topics on the p2p node
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let presence_topic = gossip::topic_for_presence(&community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: presence_topic,
            })
            .await;

        // subscribe to the default general channel
        let engine = state.crdt_engine.lock().await;
        if let Ok(channels) = engine.get_channels(&community_id) {
            for channel in &channels {
                let msg_topic = gossip::topic_for_messages(&community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe { topic: msg_topic })
                    .await;

                let typing_topic = gossip::topic_for_typing(&community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Subscribe {
                        topic: typing_topic,
                    })
                    .await;
            }
        }

        // register on rendezvous so peers joining via invite can discover us
        let namespace = format!("dusk/community/{}", community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous { namespace })
            .await;
    }

    Ok(meta)
}

#[tauri::command]
pub async fn join_community(
    state: State<'_, AppState>,
    invite_code: String,
) -> Result<CommunityMeta, String> {
    let invite = crate::protocol::community::InviteCode::decode(&invite_code)?;

    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let peer_id_str = id.peer_id.to_string();
    drop(identity);

    // create a placeholder document that will be backfilled via crdt sync
    // once we connect to existing community members through the relay
    let mut engine = state.crdt_engine.lock().await;
    if !engine.has_community(&invite.community_id) {
        engine.create_community(
            &invite.community_id,
            &invite.community_name,
            "",
            &peer_id_str,
        )?;
    }

    let meta = engine.get_community_meta(&invite.community_id)?;
    let _ = state.storage.save_community_meta(&meta);

    // subscribe to gossipsub topics so we receive messages
    let channels = engine
        .get_channels(&invite.community_id)
        .unwrap_or_default();
    drop(engine);

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        // subscribe to the community presence topic
        let presence_topic = gossip::topic_for_presence(&invite.community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: presence_topic,
            })
            .await;

        // subscribe to all channel topics
        for channel in &channels {
            let msg_topic = gossip::topic_for_messages(&invite.community_id, &channel.id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Subscribe { topic: msg_topic })
                .await;

            let typing_topic = gossip::topic_for_typing(&invite.community_id, &channel.id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Subscribe {
                    topic: typing_topic,
                })
                .await;
        }

        // register on rendezvous so existing members can find us
        let namespace = format!("dusk/community/{}", invite.community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous {
                namespace: namespace.clone(),
            })
            .await;

        // discover existing members through rendezvous
        let _ = handle
            .command_tx
            .send(NodeCommand::DiscoverRendezvous { namespace })
            .await;
    }

    Ok(meta)
}

#[tauri::command]
pub async fn leave_community(
    state: State<'_, AppState>,
    community_id: String,
) -> Result<(), String> {
    // unsubscribe from all community topics
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let engine = state.crdt_engine.lock().await;
        if let Ok(channels) = engine.get_channels(&community_id) {
            for channel in &channels {
                let msg_topic = gossip::topic_for_messages(&community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Unsubscribe { topic: msg_topic })
                    .await;

                let typing_topic = gossip::topic_for_typing(&community_id, &channel.id);
                let _ = handle
                    .command_tx
                    .send(NodeCommand::Unsubscribe {
                        topic: typing_topic,
                    })
                    .await;
            }
        }

        let presence_topic = gossip::topic_for_presence(&community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Unsubscribe {
                topic: presence_topic,
            })
            .await;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_communities(state: State<'_, AppState>) -> Result<Vec<CommunityMeta>, String> {
    let engine = state.crdt_engine.lock().await;
    let mut communities = Vec::new();

    for id in engine.community_ids() {
        if let Ok(meta) = engine.get_community_meta(&id) {
            communities.push(meta);
        }
    }

    Ok(communities)
}

#[tauri::command]
pub async fn create_channel(
    state: State<'_, AppState>,
    community_id: String,
    name: String,
    topic: String,
) -> Result<ChannelMeta, String> {
    let mut hasher = Sha256::new();
    hasher.update(community_id.as_bytes());
    hasher.update(name.as_bytes());
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;
    hasher.update(now.to_le_bytes());
    let hash = hasher.finalize();
    let channel_id = format!("ch_{}", &hex::encode(hash)[..12]);

    let channel = ChannelMeta {
        id: channel_id,
        community_id: community_id.clone(),
        name,
        topic,
        kind: ChannelKind::Text,
    };

    let mut engine = state.crdt_engine.lock().await;
    engine.create_channel(&community_id, &channel)?;
    drop(engine);

    // subscribe to the new channel's topics
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let msg_topic = gossip::topic_for_messages(&community_id, &channel.id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe { topic: msg_topic })
            .await;

        let typing_topic = gossip::topic_for_typing(&community_id, &channel.id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: typing_topic,
            })
            .await;
    }

    Ok(channel)
}

#[tauri::command]
pub async fn get_channels(
    state: State<'_, AppState>,
    community_id: String,
) -> Result<Vec<ChannelMeta>, String> {
    let engine = state.crdt_engine.lock().await;
    engine.get_channels(&community_id)
}

#[tauri::command]
pub async fn get_members(
    state: State<'_, AppState>,
    community_id: String,
) -> Result<Vec<Member>, String> {
    let engine = state.crdt_engine.lock().await;
    let mut members = engine.get_members(&community_id)?;
    drop(engine);

    // overlay the local user's identity so their display name stays current
    let identity = state.identity.lock().await;
    if let Some(ref id) = *identity {
        let local_peer = id.peer_id.to_string();
        let found = members.iter_mut().find(|m| m.peer_id == local_peer);
        if let Some(member) = found {
            member.display_name = id.display_name.clone();
            member.status = PeerStatus::Online;
        } else {
            // local user isn't in the doc yet (shouldn't happen, but be safe)
            members.push(Member {
                peer_id: local_peer,
                display_name: id.display_name.clone(),
                status: PeerStatus::Online,
                roles: vec!["member".to_string()],
                trust_level: 1.0,
                joined_at: 0,
            });
        }
    }

    Ok(members)
}

#[tauri::command]
pub async fn delete_message(
    state: State<'_, AppState>,
    community_id: String,
    message_id: String,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let peer_id_str = id.peer_id.to_string();
    drop(identity);

    // verify the user is the message author or has admin rights
    let mut engine = state.crdt_engine.lock().await;
    let message = engine
        .get_message(&community_id, &message_id)?
        .ok_or_else(|| format!("message {} not found", message_id))?;

    // only allow deletion by the author
    if message.author_id != peer_id_str {
        return Err("not authorized to delete this message".to_string());
    }

    engine.delete_message(&community_id, &message_id)?;
    drop(engine);

    // broadcast the deletion to peers
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        // find the channel for this message to get the correct topic
        let engine = state.crdt_engine.lock().await;
        if let Ok(channels) = engine.get_channels(&community_id) {
            for channel in &channels {
                let topic = gossip::topic_for_messages(&community_id, &channel.id);
                let deletion = crate::protocol::messages::GossipMessage::DeleteMessage {
                    message_id: message_id.clone(),
                };
                if let Ok(data) = serde_json::to_vec(&deletion) {
                    let _ = handle
                        .command_tx
                        .send(NodeCommand::SendMessage { topic, data })
                        .await;
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn kick_member(
    state: State<'_, AppState>,
    community_id: String,
    member_peer_id: String,
) -> Result<(), String> {
    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or("no identity loaded")?;
    let requester_id = id.peer_id.to_string();
    drop(identity);

    // verify the requester has admin rights
    let engine = state.crdt_engine.lock().await;
    let members = engine.get_members(&community_id)?;

    let requester = members
        .iter()
        .find(|m| m.peer_id == requester_id)
        .ok_or("requester not found in community")?;

    let is_admin = requester.roles.iter().any(|r| r == "admin" || r == "owner");
    if !is_admin {
        return Err("not authorized to kick members".to_string());
    }

    // cannot kick the owner
    let target = members
        .iter()
        .find(|m| m.peer_id == member_peer_id)
        .ok_or("member not found")?;

    if target.roles.iter().any(|r| r == "owner") {
        return Err("cannot kick the community owner".to_string());
    }

    drop(engine);

    // remove the member from the community
    let mut engine = state.crdt_engine.lock().await;
    engine.remove_member(&community_id, &member_peer_id)?;
    drop(engine);

    // broadcast the kick to peers
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let presence_topic = gossip::topic_for_presence(&community_id);
        let kick_msg = crate::protocol::messages::GossipMessage::MemberKicked {
            peer_id: member_peer_id.clone(),
        };
        if let Ok(data) = serde_json::to_vec(&kick_msg) {
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: presence_topic,
                    data,
                })
                .await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn generate_invite(
    state: State<'_, AppState>,
    community_id: String,
) -> Result<String, String> {
    let engine = state.crdt_engine.lock().await;
    let meta = engine.get_community_meta(&community_id)?;
    drop(engine);

    // invite contains only the community id and name
    // no IP addresses or peer addresses are included
    // peers discover each other through the relay's rendezvous protocol
    let invite = crate::protocol::community::InviteCode {
        community_id: meta.id.clone(),
        community_name: meta.name.clone(),
    };

    Ok(invite.encode())
}
