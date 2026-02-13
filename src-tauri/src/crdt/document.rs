use automerge::{transaction::Transactable, AutoCommit, ObjType, ReadDoc, ROOT};
use std::time::{SystemTime, UNIX_EPOCH};

use crate::protocol::community::{ChannelKind, ChannelMeta, CommunityMeta};
use crate::protocol::messages::ChatMessage;

// initialize a new community document with metadata and a default general channel
pub fn init_community_doc(
    doc: &mut AutoCommit,
    name: &str,
    description: &str,
    created_by: &str,
) -> Result<(), automerge::AutomergeError> {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64;

    // create the top-level structure
    let meta = doc.put_object(ROOT, "meta", ObjType::Map)?;
    doc.put(&meta, "name", name)?;
    doc.put(&meta, "description", description)?;
    doc.put(&meta, "created_by", created_by)?;
    doc.put(&meta, "created_at", now as i64)?;

    let channels = doc.put_object(ROOT, "channels", ObjType::Map)?;
    let members = doc.put_object(ROOT, "members", ObjType::Map)?;
    let _roles = doc.put_object(ROOT, "roles", ObjType::Map)?;

    // create a default general channel
    let general_id = format!("ch_{}", &hex::encode(&sha2_hash(format!("{}_general", name).as_bytes()))[..12]);
    let general = doc.put_object(&channels, &general_id, ObjType::Map)?;
    doc.put(&general, "name", "general")?;
    doc.put(&general, "topic", "general discussion")?;
    doc.put(&general, "kind", "text")?;
    let _messages = doc.put_object(&general, "messages", ObjType::List)?;

    // add the creator as the first member with owner role
    let member = doc.put_object(&members, created_by, ObjType::Map)?;
    doc.put(&member, "display_name", "")?;
    doc.put(&member, "joined_at", now as i64)?;
    let roles = doc.put_object(&member, "roles", ObjType::List)?;
    doc.insert(&roles, 0, "owner")?;

    Ok(())
}

// add a new channel to the community document
pub fn add_channel(
    doc: &mut AutoCommit,
    channel: &ChannelMeta,
) -> Result<(), automerge::AutomergeError> {
    let channels = doc
        .get(ROOT, "channels")?
        .map(|(_, id)| id)
        .ok_or_else(|| automerge::AutomergeError::InvalidObjId("channels not found".to_string()))?;

    let ch = doc.put_object(&channels, &channel.id, ObjType::Map)?;
    doc.put(&ch, "name", channel.name.as_str())?;
    doc.put(&ch, "topic", channel.topic.as_str())?;
    doc.put(
        &ch,
        "kind",
        match channel.kind {
            ChannelKind::Text => "text",
            ChannelKind::Voice => "voice",
        },
    )?;
    let _messages = doc.put_object(&ch, "messages", ObjType::List)?;

    Ok(())
}

// read all channels from the community document
pub fn get_channels(doc: &AutoCommit, community_id: &str) -> Result<Vec<ChannelMeta>, String> {
    let channels_obj = doc
        .get(ROOT, "channels")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("channels key not found")?;

    let mut result = Vec::new();
    let keys = doc.keys(&channels_obj);

    for key in keys {
        let ch_obj = doc
            .get(&channels_obj, &key)
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id);

        if let Some(ch_id) = ch_obj {
            let name = get_str(doc, &ch_id, "name").unwrap_or_default();
            let topic = get_str(doc, &ch_id, "topic").unwrap_or_default();
            let kind_str = get_str(doc, &ch_id, "kind").unwrap_or_else(|| "text".to_string());
            let kind = match kind_str.as_str() {
                "voice" => ChannelKind::Voice,
                _ => ChannelKind::Text,
            };

            result.push(ChannelMeta {
                id: key.to_string(),
                community_id: community_id.to_string(),
                name,
                topic,
                kind,
            });
        }
    }

    Ok(result)
}

// append a message to a channel's message list
pub fn append_message(
    doc: &mut AutoCommit,
    channel_id: &str,
    message: &ChatMessage,
) -> Result<(), automerge::AutomergeError> {
    let channels = doc
        .get(ROOT, "channels")?
        .map(|(_, id)| id)
        .ok_or_else(|| automerge::AutomergeError::InvalidObjId("channels not found".to_string()))?;

    let channel = doc
        .get(&channels, channel_id)?
        .map(|(_, id)| id)
        .ok_or_else(|| automerge::AutomergeError::InvalidObjId("channel not found".to_string()))?;

    let messages = doc
        .get(&channel, "messages")?
        .map(|(_, id)| id)
        .ok_or_else(|| automerge::AutomergeError::InvalidObjId("messages not found".to_string()))?;

    let len = doc.length(&messages);
    let msg_obj = doc.insert_object(&messages, len, ObjType::Map)?;
    doc.put(&msg_obj, "id", message.id.as_str())?;
    doc.put(&msg_obj, "author_id", message.author_id.as_str())?;
    doc.put(&msg_obj, "author_name", message.author_name.as_str())?;
    doc.put(&msg_obj, "content", message.content.as_str())?;
    doc.put(&msg_obj, "timestamp", message.timestamp as i64)?;
    doc.put(&msg_obj, "edited", message.edited)?;

    Ok(())
}

// read messages from a channel, optionally filtered and limited
pub fn get_messages(
    doc: &AutoCommit,
    channel_id: &str,
    before: Option<u64>,
    limit: usize,
) -> Result<Vec<ChatMessage>, String> {
    let channels = doc
        .get(ROOT, "channels")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("channels not found")?;

    let channel = doc
        .get(&channels, channel_id)
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("channel not found")?;

    let messages = doc
        .get(&channel, "messages")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("messages not found")?;

    let len = doc.length(&messages);
    let mut result = Vec::new();

    // iterate backwards for most recent first, then reverse for chronological order
    for i in (0..len).rev() {
        let msg_obj = doc
            .get(&messages, i)
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id);

        if let Some(msg_id) = msg_obj {
            let timestamp = get_i64(doc, &msg_id, "timestamp").unwrap_or(0) as u64;

            if let Some(before_ts) = before {
                if timestamp >= before_ts {
                    continue;
                }
            }

            let msg = ChatMessage {
                id: get_str(doc, &msg_id, "id").unwrap_or_default(),
                channel_id: channel_id.to_string(),
                author_id: get_str(doc, &msg_id, "author_id").unwrap_or_default(),
                author_name: get_str(doc, &msg_id, "author_name").unwrap_or_default(),
                content: get_str(doc, &msg_id, "content").unwrap_or_default(),
                timestamp,
                edited: get_bool(doc, &msg_id, "edited").unwrap_or(false),
            };

            result.push(msg);

            if result.len() >= limit {
                break;
            }
        }
    }

    // reverse to get chronological order
    result.reverse();
    Ok(result)
}

// read community metadata from the document
pub fn get_community_meta(doc: &AutoCommit, community_id: &str) -> Result<CommunityMeta, String> {
    let meta = doc
        .get(ROOT, "meta")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("meta not found")?;

    Ok(CommunityMeta {
        id: community_id.to_string(),
        name: get_str(doc, &meta, "name").unwrap_or_default(),
        description: get_str(doc, &meta, "description").unwrap_or_default(),
        created_by: get_str(doc, &meta, "created_by").unwrap_or_default(),
        created_at: get_i64(doc, &meta, "created_at").unwrap_or(0) as u64,
    })
}

// -- helpers for reading automerge values --

fn get_str(doc: &AutoCommit, obj: &automerge::ObjId, key: &str) -> Option<String> {
    doc.get(obj, key)
        .ok()
        .flatten()
        .and_then(|(val, _)| val.into_string().ok())
}

fn get_i64(doc: &AutoCommit, obj: &automerge::ObjId, key: &str) -> Option<i64> {
    doc.get(obj, key)
        .ok()
        .flatten()
        .and_then(|(val, _)| val.to_i64())
}

fn get_bool(doc: &AutoCommit, obj: &automerge::ObjId, key: &str) -> Option<bool> {
    doc.get(obj, key)
        .ok()
        .flatten()
        .and_then(|(val, _)| val.to_bool())
}

// simple sha256 hash for generating deterministic ids
fn sha2_hash(data: &[u8]) -> Vec<u8> {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(data);
    hasher.finalize().to_vec()
}

// get a specific message by id from any channel in the community
pub fn get_message_by_id(
    doc: &AutoCommit,
    message_id: &str,
) -> Result<Option<ChatMessage>, String> {
    let channels_obj = doc
        .get(ROOT, "channels")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("channels key not found")?;

    let keys = doc.keys(&channels_obj);
    
    for channel_key in keys {
        let ch_obj = doc
            .get(&channels_obj, &channel_key)
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id);

        if let Some(ch_id) = ch_obj {
            let messages = doc
                .get(&ch_id, "messages")
                .map_err(|e| e.to_string())?
                .map(|(_, id)| id);

            if let Some(msgs_id) = messages {
                let len = doc.length(&msgs_id);
                for i in 0..len {
                    let msg_obj = doc
                        .get(&msgs_id, i)
                        .map_err(|e| e.to_string())?
                        .map(|(_, id)| id);

                    if let Some(msg_id) = msg_obj {
                        let id = get_str(doc, &msg_id, "id").unwrap_or_default();
                        if id == message_id {
                            let msg = ChatMessage {
                                id: id.clone(),
                                channel_id: channel_key.to_string(),
                                author_id: get_str(doc, &msg_id, "author_id").unwrap_or_default(),
                                author_name: get_str(doc, &msg_id, "author_name").unwrap_or_default(),
                                content: get_str(doc, &msg_id, "content").unwrap_or_default(),
                                timestamp: get_i64(doc, &msg_id, "timestamp").unwrap_or(0) as u64,
                                edited: get_bool(doc, &msg_id, "edited").unwrap_or(false),
                            };
                            return Ok(Some(msg));
                        }
                    }
                }
            }
        }
    }

    Ok(None)
}

// delete a message by id from any channel in the community
pub fn delete_message_by_id(
    doc: &mut AutoCommit,
    message_id: &str,
) -> Result<(), String> {
    let channels_obj = doc
        .get(ROOT, "channels")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("channels key not found")?;

    let keys: Vec<String> = doc.keys(&channels_obj).collect();
    
    for channel_key in keys {
        let ch_obj = doc
            .get(&channels_obj, &channel_key)
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id);

        if let Some(ch_id) = ch_obj {
            let messages = doc
                .get(&ch_id, "messages")
                .map_err(|e| e.to_string())?
                .map(|(_, id)| id);

            if let Some(msgs_id) = messages {
                let len = doc.length(&msgs_id);
                for i in 0..len {
                    let msg_obj = doc
                        .get(&msgs_id, i)
                        .map_err(|e| e.to_string())?
                        .map(|(_, id)| id);

                    if let Some(msg_obj_id) = msg_obj {
                        let id = get_str(doc, &msg_obj_id, "id").unwrap_or_default();
                        if id == message_id {
                            doc.delete(&msgs_id, i)
                                .map_err(|e| e.to_string())?;
                            return Ok(());
                        }
                    }
                }
            }
        }
    }

    Err(format!("message {} not found", message_id))
}

// get all members from the community document
pub fn get_members(
    doc: &AutoCommit,
) -> Result<Vec<crate::protocol::community::Member>, String> {
    let members_obj = doc
        .get(ROOT, "members")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("members key not found")?;

    let mut result = Vec::new();
    let keys = doc.keys(&members_obj);

    for peer_id in keys {
        let member_obj = doc
            .get(&members_obj, &peer_id)
            .map_err(|e| e.to_string())?
            .map(|(_, id)| id);

        if let Some(member_id) = member_obj {
            let display_name = get_str(doc, &member_id, "display_name").unwrap_or_default();
            let joined_at = get_i64(doc, &member_id, "joined_at").unwrap_or(0) as u64;
            
            // get roles list
            let roles: Vec<String> = doc
                .get(&member_id, "roles")
                .map_err(|e| e.to_string())?
                .map(|(_, id)| id)
                .map(|roles_id| {
                    let len = doc.length(&roles_id);
                    (0..len)
                        .filter_map(|i| {
                            doc.get(&roles_id, i)
                                .ok()
                                .flatten()
                                .and_then(|(val, _)| val.into_string().ok())
                        })
                        .collect()
                })
                .unwrap_or_default();

            result.push(crate::protocol::community::Member {
                peer_id: peer_id.clone(),
                display_name,
                status: crate::protocol::messages::PeerStatus::Online,
                roles,
                trust_level: 1.0,
                joined_at,
            });
        }
    }

    Ok(result)
}

// remove a member from the community
pub fn remove_member(
    doc: &mut AutoCommit,
    peer_id: &str,
) -> Result<(), String> {
    let members_obj = doc
        .get(ROOT, "members")
        .map_err(|e| e.to_string())?
        .map(|(_, id)| id)
        .ok_or("members key not found")?;

    doc.delete(&members_obj, peer_id)
        .map_err(|e| e.to_string())?;

    Ok(())
}
