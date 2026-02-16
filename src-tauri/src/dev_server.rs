// development-only http api for programmatic access to the app
//
// only compiled when the `dev-server` cargo feature is enabled.
// binds to 127.0.0.1:3333 by default (override with DUSK_DEV_PORT env var).
// all endpoints operate on the same shared state as the tauri commands,
// so changes made here are immediately visible in the running ui.
//
// NEVER enable this in production builds.

use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use axum::extract::{Path, Query, State};
use axum::http::StatusCode;
use axum::response::{IntoResponse, Json};
use axum::routing::{delete, get, post, put};
use axum::Router;
use serde::Deserialize;
use tokio::sync::Mutex;

use crate::crdt::sync::{DocumentSnapshot, SyncMessage};
use crate::crdt::CrdtEngine;
use crate::node::gossip;
use crate::node::NodeCommand;
use crate::protocol::community::{ChannelKind, ChannelMeta, CommunityMeta, Member};
use crate::protocol::identity::{DirectoryEntry, DuskIdentity};
use crate::protocol::messages::{
    ChatMessage, DMConversationMeta, DirectMessage, GossipMessage, PeerStatus, VoiceParticipant,
};
use crate::storage::{DiskStorage, UserSettings};

// mirrors the fields from AppState but owned so it can be moved into axum
#[derive(Clone)]
pub struct DevState {
    pub identity: Arc<Mutex<Option<DuskIdentity>>>,
    pub crdt_engine: Arc<Mutex<CrdtEngine>>,
    pub storage: Arc<DiskStorage>,
    pub node_handle: Arc<Mutex<Option<crate::node::NodeHandle>>>,
    pub voice_channels: Arc<Mutex<HashMap<String, Vec<VoiceParticipant>>>>,
    pub pending_join_role_guard: Arc<Mutex<HashSet<String>>>,
    pub app_handle: tauri::AppHandle,
}

// unified error response so all handlers return consistent json
struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let body = serde_json::json!({ "error": self.1 });
        (self.0, Json(body)).into_response()
    }
}

impl From<String> for ApiError {
    fn from(msg: String) -> Self {
        ApiError(StatusCode::INTERNAL_SERVER_ERROR, msg)
    }
}

type ApiResult<T> = Result<Json<T>, ApiError>;

pub async fn start(state: DevState) {
    let port: u16 = std::env::var("DUSK_DEV_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(3333);

    let app = Router::new()
        // identity
        .route("/api/identity", get(get_identity))
        .route("/api/identity", put(update_profile))
        .route("/api/settings", get(get_settings))
        .route("/api/settings", put(save_settings))
        // directory
        .route("/api/directory", get(get_directory))
        .route("/api/directory/search", get(search_directory))
        .route("/api/friends", get(get_friends))
        .route("/api/friends/{peer_id}", post(add_friend))
        .route("/api/friends/{peer_id}", delete(remove_friend))
        // communities
        .route("/api/communities", get(get_communities))
        .route("/api/communities", post(create_community))
        .route("/api/communities/join", post(join_community))
        .route(
            "/api/communities/{community_id}/invite",
            post(generate_invite),
        )
        .route("/api/communities/{community_id}/members", get(get_members))
        .route("/api/communities/{community_id}", delete(leave_community))
        // channels
        .route(
            "/api/communities/{community_id}/channels",
            get(get_channels),
        )
        .route(
            "/api/communities/{community_id}/channels",
            post(create_channel),
        )
        // messages
        .route("/api/channels/{channel_id}/messages", get(get_messages))
        .route("/api/channels/{channel_id}/messages", post(send_message))
        .route(
            "/api/communities/{community_id}/messages/{message_id}",
            delete(delete_message),
        )
        // direct messages
        .route("/api/dm", get(get_dm_conversations))
        .route("/api/dm/{peer_id}", get(get_dm_messages))
        .route("/api/dm/{peer_id}", post(send_dm))
        .route("/api/dm/{peer_id}", delete(delete_dm_conversation))
        // node control
        .route("/api/node/start", post(start_node))
        .route("/api/node/stop", post(stop_node))
        .route("/api/node/status", get(get_node_status))
        .with_state(state);

    let addr = format!("127.0.0.1:{}", port);
    log::info!("dev server listening on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(&addr)
        .await
        .expect("failed to bind dev server");

    axum::serve(listener, app)
        .await
        .expect("dev server crashed");
}

// -- helpers --

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_millis() as u64
}

// publish the latest document snapshot for a community to connected peers
async fn broadcast_sync(state: &DevState, community_id: &str) {
    let doc_bytes = {
        let mut engine = state.crdt_engine.lock().await;
        engine.get_doc_bytes(community_id)
    };

    let Some(doc_bytes) = doc_bytes else {
        return;
    };

    let message = SyncMessage::DocumentOffer(DocumentSnapshot {
        community_id: community_id.to_string(),
        doc_bytes,
    });

    let data = match serde_json::to_vec(&message) {
        Ok(data) => data,
        Err(_) => return,
    };

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: gossip::topic_for_sync(),
                data,
            })
            .await;
    }
}

// request snapshots from connected peers
async fn request_sync(state: &DevState) {
    let peer_id = {
        let identity = state.identity.lock().await;
        let Some(id) = identity.as_ref() else {
            return;
        };
        id.peer_id.to_string()
    };

    let message = SyncMessage::RequestSync { peer_id };
    let data = match serde_json::to_vec(&message) {
        Ok(data) => data,
        Err(_) => return,
    };

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: gossip::topic_for_sync(),
                data,
            })
            .await;
    }
}

// find the community that owns a given channel
fn find_community_for_channel(
    engine: &crate::crdt::CrdtEngine,
    channel_id: &str,
) -> Result<String, ApiError> {
    for community_id in engine.community_ids() {
        if let Ok(channels) = engine.get_channels(&community_id) {
            if channels.iter().any(|ch| ch.id == channel_id) {
                return Ok(community_id);
            }
        }
    }
    Err(ApiError(
        StatusCode::NOT_FOUND,
        format!("no community found containing channel {}", channel_id),
    ))
}

// -- identity --

async fn get_identity(State(state): State<DevState>) -> ApiResult<serde_json::Value> {
    let identity = state.identity.lock().await;
    match identity.as_ref() {
        Some(id) => Ok(Json(serde_json::to_value(id.public_identity()).unwrap())),
        None => Err(ApiError(StatusCode::NOT_FOUND, "no identity loaded".into())),
    }
}

#[derive(Deserialize)]
struct UpdateProfileBody {
    display_name: String,
    bio: String,
}

async fn update_profile(
    State(state): State<DevState>,
    Json(body): Json<UpdateProfileBody>,
) -> ApiResult<serde_json::Value> {
    let mut identity = state.identity.lock().await;
    let id = identity
        .as_mut()
        .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "no identity loaded".into()))?;

    id.display_name = body.display_name;
    id.bio = body.bio;
    id.save(&state.storage)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let public = id.public_identity();
    Ok(Json(serde_json::to_value(public).unwrap()))
}

// -- settings --

async fn get_settings(State(state): State<DevState>) -> ApiResult<UserSettings> {
    state
        .storage
        .load_settings()
        .map(Json)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))
}

async fn save_settings(
    State(state): State<DevState>,
    Json(settings): Json<UserSettings>,
) -> ApiResult<serde_json::Value> {
    // sync display name to identity if it changed
    let mut identity = state.identity.lock().await;
    if let Some(id) = identity.as_mut() {
        if id.display_name != settings.display_name {
            id.display_name = settings.display_name.clone();
            let _ = id.save(&state.storage);
        }
    }
    drop(identity);

    state
        .storage
        .save_settings(&settings)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// -- directory --

async fn get_directory(State(state): State<DevState>) -> ApiResult<Vec<DirectoryEntry>> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    let mut peers: Vec<DirectoryEntry> = entries.into_values().collect();
    peers.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    Ok(Json(peers))
}

#[derive(Deserialize)]
struct SearchQuery {
    q: String,
}

async fn search_directory(
    State(state): State<DevState>,
    Query(params): Query<SearchQuery>,
) -> ApiResult<Vec<DirectoryEntry>> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    let query_lower = params.q.to_lowercase();
    let mut results: Vec<DirectoryEntry> = entries
        .into_values()
        .filter(|entry| {
            entry.display_name.to_lowercase().contains(&query_lower)
                || entry.peer_id.to_lowercase().contains(&query_lower)
        })
        .collect();

    results.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
    Ok(Json(results))
}

async fn get_friends(State(state): State<DevState>) -> ApiResult<Vec<DirectoryEntry>> {
    let entries = state
        .storage
        .load_directory()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    let mut friends: Vec<DirectoryEntry> = entries
        .into_values()
        .filter(|entry| entry.is_friend)
        .collect();

    friends.sort_by(|a, b| {
        a.display_name
            .to_lowercase()
            .cmp(&b.display_name.to_lowercase())
    });
    Ok(Json(friends))
}

async fn add_friend(
    State(state): State<DevState>,
    Path(peer_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    state
        .storage
        .set_friend_status(&peer_id, true)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn remove_friend(
    State(state): State<DevState>,
    Path(peer_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    state
        .storage
        .set_friend_status(&peer_id, false)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;
    Ok(Json(serde_json::json!({ "ok": true })))
}

// -- communities --

async fn get_communities(State(state): State<DevState>) -> ApiResult<Vec<CommunityMeta>> {
    let engine = state.crdt_engine.lock().await;
    let mut communities = Vec::new();
    for id in engine.community_ids() {
        if let Ok(meta) = engine.get_community_meta(&id) {
            communities.push(meta);
        }
    }
    Ok(Json(communities))
}

#[derive(Deserialize)]
struct CreateCommunityBody {
    name: String,
    description: String,
}

async fn create_community(
    State(state): State<DevState>,
    Json(body): Json<CreateCommunityBody>,
) -> ApiResult<CommunityMeta> {
    use sha2::Digest;

    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;

    let now = now_ms();

    let mut hasher = sha2::Sha256::new();
    hasher.update(body.name.as_bytes());
    hasher.update(id.peer_id.to_bytes());
    hasher.update(now.to_le_bytes());
    let hash = hasher.finalize();
    let community_id = format!("com_{}", &hex::encode(hash)[..16]);

    let peer_id_str = id.peer_id.to_string();
    drop(identity);

    let mut engine = state.crdt_engine.lock().await;
    engine
        .create_community(&community_id, &body.name, &body.description, &peer_id_str)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    let meta = engine
        .get_community_meta(&community_id)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
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

        let namespace = format!("dusk/community/{}", community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous { namespace })
            .await;
    }

    Ok(Json(meta))
}

#[derive(Deserialize)]
struct JoinCommunityBody {
    invite_code: String,
}

async fn join_community(
    State(state): State<DevState>,
    Json(body): Json<JoinCommunityBody>,
) -> ApiResult<CommunityMeta> {
    let invite = crate::protocol::community::InviteCode::decode(&body.invite_code)
        .map_err(|e| ApiError(StatusCode::BAD_REQUEST, e))?;

    let local_peer_id = {
        let identity = state.identity.lock().await;
        let id = identity
            .as_ref()
            .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;
        id.peer_id.to_string()
    };

    let mut engine = state.crdt_engine.lock().await;
    let had_existing_doc = engine.has_community(&invite.community_id);
    if !had_existing_doc {
        engine
            .create_placeholder_community(&invite.community_id, &invite.community_name, "")
            .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    }

    // joining via invite must never keep elevated local roles from stale local docs
    if had_existing_doc {
        if let Ok(members) = engine.get_members(&invite.community_id) {
            let local_has_elevated_role = members.iter().any(|member| {
                member.peer_id == local_peer_id
                    && member
                        .roles
                        .iter()
                        .any(|role| role == "owner" || role == "admin")
            });

            if local_has_elevated_role {
                let roles = vec!["member".to_string()];
                let _ = engine.set_member_role(&invite.community_id, &local_peer_id, &roles);
            }
        }
    }

    let meta = engine
        .get_community_meta(&invite.community_id)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    let _ = state.storage.save_community_meta(&meta);

    let channels = engine
        .get_channels(&invite.community_id)
        .unwrap_or_default();
    drop(engine);

    // mark this community for one-time role hardening on first sync merge
    {
        let mut guard = state.pending_join_role_guard.lock().await;
        guard.insert(invite.community_id.clone());
    }

    // subscribe and discover via rendezvous
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let presence_topic = gossip::topic_for_presence(&invite.community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Subscribe {
                topic: presence_topic,
            })
            .await;

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

        let namespace = format!("dusk/community/{}", invite.community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous {
                namespace: namespace.clone(),
            })
            .await;
        let _ = handle
            .command_tx
            .send(NodeCommand::DiscoverRendezvous { namespace })
            .await;
    }

    request_sync(&state).await;

    Ok(Json(meta))
}

async fn leave_community(
    State(state): State<DevState>,
    Path(community_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let local_peer_id = {
        let identity = state.identity.lock().await;
        let id = identity
            .as_ref()
            .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;
        id.peer_id.to_string()
    };

    let mut removed_self = false;
    let channels = {
        let mut engine = state.crdt_engine.lock().await;
        let channels = engine.get_channels(&community_id).unwrap_or_default();

        if let Ok(members) = engine.get_members(&community_id) {
            if members.iter().any(|member| member.peer_id == local_peer_id) {
                if engine.remove_member(&community_id, &local_peer_id).is_ok() {
                    removed_self = true;
                }
            }
        }

        channels
    };

    if removed_self {
        broadcast_sync(&state, &community_id).await;
    }

    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
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

        let presence_topic = gossip::topic_for_presence(&community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::Unsubscribe {
                topic: presence_topic,
            })
            .await;

        let namespace = format!("dusk/community/{}", community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::UnregisterRendezvous { namespace })
            .await;
    }

    let mut engine = state.crdt_engine.lock().await;
    engine
        .remove_community(&community_id)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    drop(engine);

    let mut guard = state.pending_join_role_guard.lock().await;
    guard.remove(&community_id);

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn generate_invite(
    State(state): State<DevState>,
    Path(community_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let engine = state.crdt_engine.lock().await;
    let meta = engine
        .get_community_meta(&community_id)
        .map_err(|e| ApiError(StatusCode::NOT_FOUND, e))?;
    drop(engine);

    let invite = crate::protocol::community::InviteCode {
        community_id: meta.id,
        community_name: meta.name,
    };

    Ok(Json(serde_json::json!({ "invite_code": invite.encode() })))
}

async fn get_members(
    State(state): State<DevState>,
    Path(community_id): Path<String>,
) -> ApiResult<Vec<Member>> {
    let engine = state.crdt_engine.lock().await;
    let mut members = engine
        .get_members(&community_id)
        .map_err(|e| ApiError(StatusCode::NOT_FOUND, e))?;
    drop(engine);

    // overlay local user's current name
    let identity = state.identity.lock().await;
    if let Some(ref id) = *identity {
        let local_peer = id.peer_id.to_string();
        if let Some(member) = members.iter_mut().find(|m| m.peer_id == local_peer) {
            member.display_name = id.display_name.clone();
            member.status = PeerStatus::Online;
        }
    }

    Ok(Json(members))
}

// -- channels --

async fn get_channels(
    State(state): State<DevState>,
    Path(community_id): Path<String>,
) -> ApiResult<Vec<ChannelMeta>> {
    let engine = state.crdt_engine.lock().await;
    let channels = engine
        .get_channels(&community_id)
        .map_err(|e| ApiError(StatusCode::NOT_FOUND, e))?;
    Ok(Json(channels))
}

#[derive(Deserialize)]
struct CreateChannelBody {
    name: String,
    #[serde(default)]
    topic: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    category_id: Option<String>,
}

async fn create_channel(
    State(state): State<DevState>,
    Path(community_id): Path<String>,
    Json(body): Json<CreateChannelBody>,
) -> ApiResult<ChannelMeta> {
    use sha2::Digest;

    let mut hasher = sha2::Sha256::new();
    hasher.update(community_id.as_bytes());
    hasher.update(body.name.as_bytes());
    hasher.update(now_ms().to_le_bytes());
    let hash = hasher.finalize();
    let channel_id = format!("ch_{}", &hex::encode(hash)[..12]);

    let channel_kind = match body.kind.as_deref() {
        Some("voice") | Some("Voice") => ChannelKind::Voice,
        _ => ChannelKind::Text,
    };

    let channel = ChannelMeta {
        id: channel_id,
        community_id: community_id.clone(),
        name: body.name,
        topic: body.topic,
        kind: channel_kind,
        position: 0,
        category_id: body.category_id,
    };

    let mut engine = state.crdt_engine.lock().await;
    engine
        .create_channel(&community_id, &channel)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    drop(engine);

    // subscribe to topics
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

    broadcast_sync(&state, &community_id).await;

    Ok(Json(channel))
}

// -- messages --

#[derive(Deserialize)]
struct MessagesQuery {
    before: Option<u64>,
    limit: Option<usize>,
}

async fn get_messages(
    State(state): State<DevState>,
    Path(channel_id): Path<String>,
    Query(params): Query<MessagesQuery>,
) -> ApiResult<Vec<ChatMessage>> {
    let engine = state.crdt_engine.lock().await;
    let community_id = find_community_for_channel(&engine, &channel_id)?;
    let messages = engine
        .get_messages(
            &community_id,
            &channel_id,
            params.before,
            params.limit.unwrap_or(50),
        )
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    Ok(Json(messages))
}

#[derive(Deserialize)]
struct SendMessageBody {
    content: String,
}

async fn send_message(
    State(state): State<DevState>,
    Path(channel_id): Path<String>,
    Json(body): Json<SendMessageBody>,
) -> ApiResult<ChatMessage> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;

    let now = now_ms();
    let msg = ChatMessage {
        id: format!("msg_{}_{}", id.peer_id, now),
        channel_id: channel_id.clone(),
        author_id: id.peer_id.to_string(),
        author_name: id.display_name.clone(),
        content: body.content,
        timestamp: now,
        edited: false,
    };
    drop(identity);

    let mut engine = state.crdt_engine.lock().await;
    let community_id = find_community_for_channel(&engine, &channel_id)?;
    engine
        .append_message(&community_id, &msg)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    drop(engine);

    // publish to gossipsub
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let topic = gossip::topic_for_messages(&community_id, &channel_id);
        if let Ok(data) = serde_json::to_vec(&GossipMessage::Chat(msg.clone())) {
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage { topic, data })
                .await;
        }
    }

    Ok(Json(msg))
}

async fn delete_message(
    State(state): State<DevState>,
    Path((community_id, message_id)): Path<(String, String)>,
) -> ApiResult<serde_json::Value> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;
    let peer_id_str = id.peer_id.to_string();
    drop(identity);

    let mut engine = state.crdt_engine.lock().await;
    let message = engine
        .get_message(&community_id, &message_id)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?
        .ok_or_else(|| {
            ApiError(
                StatusCode::NOT_FOUND,
                format!("message {} not found", message_id),
            )
        })?;

    if message.author_id != peer_id_str {
        return Err(ApiError(
            StatusCode::FORBIDDEN,
            "not authorized to delete this message".into(),
        ));
    }

    engine
        .delete_message(&community_id, &message_id)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    drop(engine);

    // broadcast deletion
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        let engine = state.crdt_engine.lock().await;
        if let Ok(channels) = engine.get_channels(&community_id) {
            for channel in &channels {
                let topic = gossip::topic_for_messages(&community_id, &channel.id);
                let deletion = GossipMessage::DeleteMessage {
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

    Ok(Json(serde_json::json!({ "ok": true })))
}

// -- direct messages --

async fn get_dm_conversations(State(state): State<DevState>) -> ApiResult<Vec<DMConversationMeta>> {
    let conversations = state
        .storage
        .load_all_dm_conversations()
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    Ok(Json(
        conversations.into_iter().map(|(_, meta)| meta).collect(),
    ))
}

async fn get_dm_messages(
    State(state): State<DevState>,
    Path(peer_id): Path<String>,
    Query(params): Query<MessagesQuery>,
) -> ApiResult<Vec<DirectMessage>> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;
    let local_peer_id = id.peer_id.to_string();
    drop(identity);

    let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);
    let messages = state
        .storage
        .load_dm_messages(&conversation_id, params.before, params.limit.unwrap_or(50))
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    Ok(Json(messages))
}

#[derive(Deserialize)]
struct SendDmBody {
    content: String,
}

async fn send_dm(
    State(state): State<DevState>,
    Path(peer_id): Path<String>,
    Json(body): Json<SendDmBody>,
) -> ApiResult<DirectMessage> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;

    let now = now_ms();
    let local_peer_id = id.peer_id.to_string();
    let display_name = id.display_name.clone();
    drop(identity);

    let msg = DirectMessage {
        id: format!("dm_{}_{}", local_peer_id, now),
        from_peer: local_peer_id.clone(),
        to_peer: peer_id.clone(),
        from_display_name: display_name,
        content: body.content.clone(),
        timestamp: now,
    };

    let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

    state
        .storage
        .append_dm_message(&conversation_id, &msg)
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    // update conversation metadata
    let peer_display_name = state
        .storage
        .load_dm_conversation(&conversation_id)
        .ok()
        .map(|m| m.display_name)
        .unwrap_or_else(|| {
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
        last_message: Some(body.content),
        last_message_time: Some(now),
        unread_count: 0,
    };

    let _ = state.storage.save_dm_conversation(&conversation_id, &meta);

    // publish via gossipsub
    let node_handle = state.node_handle.lock().await;
    if let Some(ref handle) = *node_handle {
        if let Ok(data) = serde_json::to_vec(&GossipMessage::DirectMessage(msg.clone())) {
            let pair_topic = gossip::topic_for_dm(&local_peer_id, &peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: pair_topic,
                    data: data.clone(),
                })
                .await;

            let inbox_topic = gossip::topic_for_dm_inbox(&peer_id);
            let _ = handle
                .command_tx
                .send(NodeCommand::SendMessage {
                    topic: inbox_topic,
                    data,
                })
                .await;
        }
    }

    Ok(Json(msg))
}

async fn delete_dm_conversation(
    State(state): State<DevState>,
    Path(peer_id): Path<String>,
) -> ApiResult<serde_json::Value> {
    let identity = state.identity.lock().await;
    let id = identity
        .as_ref()
        .ok_or_else(|| ApiError(StatusCode::UNAUTHORIZED, "no identity loaded".into()))?;
    let local_peer_id = id.peer_id.to_string();
    drop(identity);

    let conversation_id = gossip::dm_conversation_id(&local_peer_id, &peer_id);

    // unsubscribe from topic
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
        .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, format!("{}", e)))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// -- node control --

async fn start_node(State(state): State<DevState>) -> ApiResult<serde_json::Value> {
    // check if already running
    let node_handle = state.node_handle.lock().await;
    if node_handle.is_some() {
        return Err(ApiError(
            StatusCode::CONFLICT,
            "node is already running. if you need to restart, call POST /api/node/stop first"
                .into(),
        ));
    }
    drop(node_handle);

    let identity = state.identity.lock().await;
    let id = identity.as_ref().ok_or_else(|| {
        ApiError(
            StatusCode::UNAUTHORIZED,
            "no identity loaded, create one first".into(),
        )
    })?;

    let custom_relay = state
        .storage
        .load_settings()
        .ok()
        .and_then(|s| s.custom_relay_addr);

    let handle = crate::node::start(
        id.keypair.clone(),
        state.crdt_engine.clone(),
        state.storage.clone(),
        state.app_handle.clone(),
        state.voice_channels.clone(),
        state.pending_join_role_guard.clone(),
        custom_relay,
    )
    .await
    .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    // build and broadcast profile announcement
    let mut announcement = crate::protocol::messages::ProfileAnnouncement {
        peer_id: id.peer_id.to_string(),
        display_name: id.display_name.clone(),
        bio: id.bio.clone(),
        public_key: hex::encode(id.keypair.public().encode_protobuf()),
        timestamp: now_ms() as u64,
        verification_proof: id.verification_proof.clone(),
        signature: String::new(),
    };
    announcement.signature = crate::verification::sign_announcement(&id.keypair, &announcement);
    drop(identity);

    // subscribe to global topics
    let sync_topic = gossip::topic_for_sync();
    let directory_topic = gossip::topic_for_directory();
    let _ = handle
        .command_tx
        .send(NodeCommand::Subscribe { topic: sync_topic })
        .await;
    let _ = handle
        .command_tx
        .send(NodeCommand::Subscribe {
            topic: directory_topic.clone(),
        })
        .await;

    // announce profile
    let announce_msg = GossipMessage::ProfileAnnounce(announcement);
    if let Ok(data) = serde_json::to_vec(&announce_msg) {
        let _ = handle
            .command_tx
            .send(NodeCommand::SendMessage {
                topic: directory_topic,
                data,
            })
            .await;
    }

    // subscribe to all known community topics
    let engine = state.crdt_engine.lock().await;
    let community_ids = engine.community_ids();
    drop(engine);

    for community_id in &community_ids {
        let channels = {
            let engine = state.crdt_engine.lock().await;
            engine.get_channels(community_id).unwrap_or_default()
        };

        for channel in &channels {
            let msg_topic = gossip::topic_for_messages(community_id, &channel.id);
            let _ = handle
                .command_tx
                .send(NodeCommand::Subscribe { topic: msg_topic })
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

        let namespace = format!("dusk/community/{}", community_id);
        let _ = handle
            .command_tx
            .send(NodeCommand::RegisterRendezvous {
                namespace: namespace.clone(),
            })
            .await;
        let _ = handle
            .command_tx
            .send(NodeCommand::DiscoverRendezvous { namespace })
            .await;
    }

    // store the handle
    let mut node_handle = state.node_handle.lock().await;
    *node_handle = Some(handle);

    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn stop_node(State(state): State<DevState>) -> ApiResult<serde_json::Value> {
    let mut node_handle = state.node_handle.lock().await;
    if let Some(handle) = node_handle.take() {
        let _ = handle.command_tx.send(NodeCommand::Shutdown).await;
        let _ = handle.task.await;
    }
    Ok(Json(serde_json::json!({ "ok": true })))
}

async fn get_node_status(State(state): State<DevState>) -> ApiResult<serde_json::Value> {
    let node_handle = state.node_handle.lock().await;
    let running = node_handle.is_some();
    Ok(Json(serde_json::json!({ "running": running })))
}
